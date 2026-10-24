/*
 * WHAT THIS FILE IS: SB.natVoice, the natural kitchen voice on the tablet side. When the page comes from the kitchen
 *    server and the server's voice is on (server/voice.mjs), call-outs are played in a human-sounding voice (British
 *    Emma by default) instead of the device's robot voice. Lines are fetched before they are due and kept, so a call is
 *    not late; anything that is not ready in time, or a tablet without the server, uses the device voice as before.
 * PARTS: which voice, is the server's voice on, fetch ahead, play, stop.
 * USES: fetch and Web Audio (the board's audio context, handed in with setContext). USED BY: 70-floor-board.js
 *    (speak, call-outs), 72-floor-sheets.js (the voice chooser in Settings).
 */
(function (g) {
  'use strict';
  const SB = (g.SB = g.SB || {});
  const U = SB.util;
  const KEY = 'smokebox.v1.voicename';
  // Voice ids from the server start with this mark in the saved choice ("k:bf_emma"); anything else is a device voice name.
  const MARK = 'k:';
  const DEFAULT = 'bf_emma';
  const MAX_KEEP = 150;
  const st = { on: false, list: {}, checkedAt: 0, getCtx: null, lines: new Map(), playing: null };

  // True when the page was served by a kitchen server (not opened as a file), the only case with a server voice.
  const served = () => { try { return /^https?:$/.test(g.location.protocol); } catch (e) { return false; } };
  // Asks the server whether its voice is on and which voices it has; again every minute while it is off.
  function check() {
    if (!served() || typeof g.fetch !== 'function' || Date.now() - st.checkedAt < 60000) return;
    st.checkedAt = Date.now();
    g.fetch('/api/voices', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).then((d) => {
      const was = st.on;
      st.on = !!(d && d.ready); st.list = d && d.voices ? d.voices : {};
      if (st.on && !was) st.checkedAt = Date.now() + 3600e3; // on: no need to ask again for an hour
    }, () => {});
  }

  // The server voice chosen on this device: its id, or null when the owner picked a device voice or it is not on.
  function voice() {
    if (!st.on) return null;
    let v = '';
    try { v = String(U.storage.get(KEY, '') || ''); } catch (e) { v = ''; }
    if (!v) return st.list[DEFAULT] ? DEFAULT : null;
    if (v.indexOf(MARK) !== 0) return null;
    const id = v.slice(MARK.length);
    return st.list[id] ? id : (st.list[DEFAULT] ? DEFAULT : null);
  }
  // A call split into its sentences ("Fire French fries now!", "Ticket one hundred one!"). Each sentence is made and kept on
  // its own, so the pieces that repeat all day (a dish, a ticket number) are ready long before a call needs them.
  const parts = (text) => (String(text || '').match(/[^!?.]+[!?.]*/g) || []).map((x) => x.trim()).filter(Boolean);
  // Fetches a call ahead of time, one sentence at a time, each only once.
  function prefetch(text, urgent) { for (const p of parts(text)) fetchPart(p, urgent); }
  // Fetches one sentence in the chosen voice and decodes it, once per sentence. urgent: the call is due now, so the server
  // makes it before the pieces fetched ahead of time.
  function fetchPart(text, urgent) {
    const v = voice(), ctx = st.getCtx && st.getCtx();
    if (!v || !ctx || !text) return;
    const key = v + '|' + text;
    const have = st.lines.get(key);
    // Already asked for: only a call that became due asks again, marked urgent, so the server moves it to the front.
    if (have && (have.buf || !urgent || have.urgent)) return;
    const line = have || { buf: null };
    line.urgent = line.urgent || !!urgent;
    if (!have) { st.lines.set(key, line); if (st.lines.size > MAX_KEEP) st.lines.delete(st.lines.keys().next().value); }
    g.fetch('/api/voice?v=' + encodeURIComponent(v) + (urgent ? '&p=1' : '') + '&t=' + encodeURIComponent(text), { credentials: 'same-origin' })
      .then((r) => { if (!r.ok) throw new Error('voice ' + r.status); return r.arrayBuffer(); })
      .then((ab) => new Promise((res, rej) => ctx.decodeAudioData(ab, res, rej)))
      .then((buf) => { if (!line.buf) line.buf = buf; }, () => { if (!line.buf && st.lines.get(key) === line) st.lines.delete(key); });
  }
  // The decoded sound of one sentence in the chosen voice, or null when it is not ready.
  const bufOf = (text) => { const v = voice(), l = v && st.lines.get(v + '|' + text); return l && l.buf ? l.buf : null; };
  // True when every sentence of the call is ready to play at once.
  function ready(text) { const ps = parts(text); return ps.length > 0 && ps.every((p) => !!bufOf(p)); }
  // Plays a ready call, its sentences back to back, at the given loudness (0 to 1); returns how long it lasts in ms, or 0
  // when any sentence is not ready yet.
  function play(text, volume) {
    const ctx = st.getCtx && st.getCtx(), bufs = parts(text).map(bufOf);
    if (!ctx || !bufs.length || bufs.some((b) => !b)) return 0;
    try {
      stop();
      const gain = ctx.createGain();
      gain.gain.value = typeof volume === 'number' ? Math.max(0, Math.min(1, volume)) : 1;
      gain.connect(ctx.destination);
      let at = ctx.currentTime + 0.02;
      st.playing = bufs.map((b) => { const src = ctx.createBufferSource(); src.buffer = b; src.connect(gain); src.start(at); at += b.duration + 0.08; return src; });
      return Math.round((at - ctx.currentTime) * 1000);
    } catch (e) { return 0; }
  }
  // Stops the call being played now, if any.
  function stop() { if (st.playing) { for (const s of st.playing) { try { s.stop(); } catch (e) { /* already ended */ } } st.playing = null; } }

  SB.natVoice = {
    // Hands in the board's audio context getter (it is unlocked by the first tap), then checks the server.
    setContext(fn) { st.getCtx = fn; check(); },
    // True when the natural voice will be used for call-outs on this device.
    enabled: () => { check(); return !!voice(); },
    // The server's voices as { id: 'Emma (British)' }, empty when it has none or is not on.
    list: () => (st.on ? st.list : {}),
    // The saved-choice value for a server voice id, for the voice chooser.
    choice: (id) => MARK + id,
    current: () => voice(),
    prefetch, ready, play, stop,
    // Asks the server again now (Settings opened, or a reconnect).
    refresh() { st.checkedAt = 0; check(); },
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
