/*
 * WHAT THIS FILE IS: The app's memory and clock (SB.store). It holds the current state (everything the app
 *    knows right now), runs the 1-second clock with its demo speed-up, passes actions to the engine, saves to
 *    the browser, keeps two open tabs in step, and makes backups and spreadsheet exports. Screens read the
 *    state here and change it only through dispatch.
 * PARTS: clock, notify, persistence, init and destroy, dispatch, backups and CSV, resets, selectors,
 *    dataset for the office.
 * USES: 00-util.js and 20-engine.js (and 45-sim.js if present). USED BY: 99-boot.js and every screen file.
 *    Loads in Node: nothing browser-only is touched at load time.
 */
(function (g) {
  'use strict';
  const SB = (g.SB = g.SB || {});
  const U = SB.util;
  // The browser-notebook entry that holds the whole saved state.
  const KEY = 'smokebox.v1.state';
  // A saved copy that fails the check is parked here instead of being deleted, so nothing is lost.
  const CORRUPT_KEY = 'smokebox.v1.corrupt';
  const SID_KEY = 'smokebox.v1.sid';
  // The actions this device has done that no server has confirmed yet (only used when a transport can push).
  const OUTBOX_KEY = 'smokebox.v1.outbox';
  const OUTBOX_MAX = 5000; // oldest unconfirmed actions are dropped past this, and st.outboxDropped says so
  // 20 million characters: bigger backups are refused on both export and import (Pitcall finding PO4c).
  const MAX_TEXT = 20e6; // characters; backups above this are refused (Pitcall PO4c)
  // 400 ms: wait this long after the last change before saving, so a burst of taps is one save.
  const SAVE_MS = 400;
  // True only for a real, finite number.
  const isNum = (n) => typeof n === 'number' && isFinite(n);
  // Looks up the engine each time it is needed, not once at load, so the engine can be swapped in tests.
  const E = () => SB.engine;

  // Module memory. state is the current kitchen data. storage is where it is saved. clk is the virtual clock
  // (a base time, the real time at that base, and the speed). lastNow is the newest time ever handed out, so
  // time never goes backwards. subs and tickSubs are the screens waiting to be told. The flags remember that
  // a redraw, a save or a broadcast to other tabs is pending.
  let state = null;
  let storage = null;
  // The real clock. Tests replace it with a fake one through init({ now }).
  let realNow = () => Date.now();
  let clk = { base: 0, realBase: 0, speed: 1 };
  let lastNow = -Infinity;
  let subs = new Set(), tickSubs = new Set();
  let notifyPending = false;
  let interval = null, saveTimer = null, tr = null;
  let pendingBroadcast = false;
  // Two tabs saving at the same moment must not drop each other's work (F-L9). baseSid names the save this tab last
  // loaded or wrote; pending lists this tab's actions since then, so they can be replayed on top of a newer save.
  let baseSid = null, pending = [], skipRebase = false, sidN = 0;
  let dirty = false; // unsaved changes exist (page-lifecycle flushes only write when dirty)
  let listeners = [];
  // Server-ready bookkeeping. opN numbers this tab's actions. outbox is the saved list of unconfirmed
  // actions. seenOps remembers opIds already applied so a repeat delivery does nothing. pushing and
  // retryAt keep one push in flight with a back-off after a failure.
  let opN = 0, outbox = [], seenOps = new Set(), pushing = false, retryAt = 0, retryMs = 2000;
  // simRef is the simulator (if attached). last is the result of the most recent action. st is the save
  // status. tabId names this tab in tab-sync messages.
  let simRef = null;
  let last = null;
  let st = { persistent: false, lastSaveOk: null, lastSaveAt: undefined, corrupt: null, firstRun: false, trimmed: false, repaired: [], outboxDropped: 0 };
  const tabId = 'tab_' + Math.floor(Math.random() * 1e9).toString(36);

  /* ---------- clock: now() = base + (real - realBase) * speed, clamped so it never goes backwards ---------- */
  // Current virtual time in ms: the real clock moved on by the demo speed. Never returns an earlier time
  // than it returned before (rule I9).
  function now() {
    const r = realNow();
    let v = Math.floor(clk.base + (r - clk.realBase) * clk.speed);
    // Never go backwards (rule I9): if the real clock steps back or gives garbage, the last time is
    // repeated.
    if (!isNum(v)) v = lastNow;
    if (v < lastNow) v = lastNow;
    lastNow = v;
    return v;
  }
  // Sets the demo speed (0.1 to 1000, where 1 is real time). Re-bases the clock first so the time does not
  // jump. Returns false for a bad speed.
  function setSpeed(x) {
    if (!isNum(x) || x < 0.1 || x > 1000) return false;
    const v = now();
    clk = { base: v, realBase: realNow(), speed: x };
    schedulePersist(false);
    scheduleNotify();
    return true;
  }
  // Moves the clock forward to t if it is behind, so loaded or imported data never holds times from the
  // future.
  function atLeast(t) { // move the clock forward so it is not behind stamps in a loaded state
    if (!isNum(t)) return;
    const v = now();
    if (t > v) { clk = { base: t, realBase: realNow(), speed: clk.speed }; lastNow = t; }
  }
  // Newest time found in a state: the last event or one of the last 50 tickets (tickets run oldest to
  // newest). Used with atLeast.
  function lastStamp(s) {
    const ev = E().allEvents(s);
    let t = ev.length ? ev[ev.length - 1].t : -Infinity;
    for (let i = s.tickets.length - 1, k = 0; i >= 0 && k < 50; i--, k++) { const x = s.tickets[i]; if (x.createdAt > t) t = x.createdAt; }
    return t;
  }

  /* ---------- notify ---------- */
  // Runs fn on the next screen refresh.
  // Where there is no screen (Node tests) it waits 16 ms instead.
  function raf(fn) {
    if (typeof g.requestAnimationFrame === 'function') return g.requestAnimationFrame(fn);
    return setTimeout(fn, 16);
  }
  // Asks for the screens to be told the state changed, at most once per screen refresh however many changes
  // happen.
  function scheduleNotify() {
    if (notifyPending) return;
    notifyPending = true;
    raf(flushNotify);
  }
  // Tells every subscriber the state changed. A subscriber that fails is logged and cannot stop the others.
  // Tests call this to skip the wait.
  function flushNotify() {
    if (!notifyPending) return;
    notifyPending = false;
    const s = state;
    subs.forEach((fn) => { try { fn(s); } catch (e) { if (g.console) console.error('[smokebox] subscriber failed', e); } });
  }
  // Registers fn to be called after state changes (at most once per screen refresh). Returns a function that
  // removes it again.
  function subscribe(fn) { if (typeof fn !== 'function') return () => {}; subs.add(fn); return () => subs.delete(fn); }
  // Registers fn to be called every second with the current time. Meant for timer text only, so keep it
  // cheap. Returns a remover.
  function subscribeTick(fn) { if (typeof fn !== 'function') return () => {}; tickSubs.add(fn); return () => tickSubs.delete(fn); }

  /* ---------- persistence ---------- */
  // Marks the state as unsaved and arranges a save SAVE_MS later. broadcast true means tell other tabs after
  // saving.
  function schedulePersist(broadcast) {
    dirty = true;
    if (broadcast) pendingBroadcast = true;
    if (saveTimer || !storage) return;
    // Once a shared save exists and other tabs may be open, each tab waits a little differently, so two tabs rarely write in the
    // same instant. The very first save of a new board is not delayed, so a second tab opened right after sees it.
    saveTimer = setTimeout(() => { saveTimer = null; persistNow(); }, tr && baseSid ? SAVE_MS + Math.floor(Math.random() * 300) : SAVE_MS);
  }
  // Saves the state to the browser right now and returns true if it worked. If the browser says it is full,
  // it retries with less history (oldest finished tickets and events first), halving up to 12 times. After a
  // good save it announces the new revision to other tabs.
  function persistNow() {
    if (!storage || !state) return false;
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    // If another tab saved since this tab last loaded or saved, build on its copy first so nothing is lost.
    if (skipRebase) skipRebase = false; else rebaseIfStale();
    const r = realNow();
    const v = now();
    let ok = false;
    // full copy first; if the quota refuses it, keep halving the history (oldest completed tickets and events go first)
    let lim = null;
    // First trimmed attempt keeps at most 1500 tickets and 10 000 events. A failed save never loses the copy
    // in memory (finding F-E5).
    let nt = Math.min(state.tickets.length, 1500), ne = Math.min(E().allEvents(state).length, 10000);
    for (let tries = 0; tries < 12; tries++) {
      const s2 = lim ? E().prune(state, lim) : state;
      try { ok = storage.set(KEY, { v: 1, savedAt: r, rev: s2.rev, clock: { virtual: v, real: r, speed: clk.speed }, state: s2 }) !== false; } catch (e) { ok = false; }
      if (ok) { st.trimmed = !!lim; break; }
      // History is already tiny: trimming further will not help, so give up and report the failed save.
      if (nt < 20 && ne < 200) break;
      lim = { maxTickets: nt, maxEvents: ne };
      nt = Math.floor(nt / 2); ne = Math.floor(ne / 2);
    }
    st.lastSaveOk = ok;
    st.lastSaveAt = r;
    if (ok) dirty = false;
    let sid = null;
    if (ok) {
      sid = tabId + ':' + (++sidN);
      try { storage.set(SID_KEY, sid); baseSid = sid; } catch (e) { sid = null; }
      pending = [];
    }
    if (ok && pendingBroadcast && tr) { try { tr.post({ type: 'saved', rev: state.rev, tab: tabId, sid }); } catch (e) { /* ignore */ } }
    pendingBroadcast = false;
    return ok;
  }
  // Public name for saving right now.
  function flush() { return persistNow(); }
  /** pagehide / hidden: write only unsaved changes, so a pristine page never resurrects storage that was just cleared */
  function flushIfDirty() { return dirty ? persistNow() : true; }
  // Applies this tab's unsaved actions, in order, on top of another tab's saved state. An action that no longer
  // fits (for example it touches a ticket the other tab removed) is refused by the engine and simply dropped.
  function replayOnto(base) {
    let s = base;
    for (const p of pending) {
      const r = E().apply(s, p.type, p.payload, Math.max(p.now, lastStamp(s)));
      if (r.report === 'ok') s = r.state;
    }
    return s;
  }
  // Loads the newest saved copy from storage and returns it checked, or null.
  function loadStored() {
    let payload = null;
    try { payload = storage.get(KEY, null); } catch (e) { payload = null; }
    if (payload == null) return null;
    const v = E().validateBackup(payload);
    return v.ok ? v.state : null;
  }
  // Before saving: if the save in storage is not the one this tab last loaded or wrote, another tab saved in
  // between. Build on its copy and replay this tab's own actions on top, so both tabs' work is kept.
  function rebaseIfStale() {
    let sid = null;
    try { sid = storage.get(SID_KEY, null); } catch (e) { sid = null; }
    if (sid == null || sid === baseSid) return;
    const theirs = loadStored();
    baseSid = sid;
    if (!theirs) return;
    atLeast(lastStamp(theirs));
    state = E().tick(replayOnto(theirs), now()).state;
    scheduleNotify();
  }
  // Listeners for alert messages from other tabs.
  const bcListeners = new Set();
  // Sends a message to the other tabs of this browser. Returns false when there is no channel (then each tab acts alone).
  function broadcast(msg) { if (!tr) return false; try { return tr.post(Object.assign({}, msg, { tab: tabId })) !== false; } catch (e) { return false; } }
  // Registers fn for messages from other tabs; returns a function that stops it.
  function onBroadcast(fn) { bcListeners.add(fn); return () => bcListeners.delete(fn); }
  // Another tab announced a save. With nothing unsaved here, adopt its copy and redraw. With unsaved actions
  // here, replay them on top of its copy and save the merged result. Ignores our own messages.
  function onMessage(d) {
    // A server (or another device) can hand over a confirmation or an action done elsewhere.
    if (d && d.tab !== tabId && d.type === 'ack') { ackOps(d.opIds); return; }
    if (d && d.tab !== tabId && d.type === 'action') { applyRemote(d); return; }
    // Messages about alerts (sound leader, played, acknowledged) go to whoever listens; they are not saves.
    if (d && d.tab !== tabId && typeof d.type === 'string' && d.type.indexOf('alert-') === 0) { bcListeners.forEach((fn) => { try { fn(d); } catch (e) { /* a listener must not stop the others */ } }); return; }
    if (!d || d.tab === tabId || d.type !== 'saved' || !storage) return;
    if (d.sid && d.sid === baseSid) return;
    if (!d.sid && isNum(d.rev) && state && d.rev <= state.rev) return; // an older build of the app: keep the newer-revision rule
    const theirs = loadStored();
    if (!theirs) return;
    if (!d.sid && !(theirs.rev > state.rev)) return;
    // Keep our clock from being behind the newer data, then catch up anything that became due.
    atLeast(lastStamp(theirs));
    if (d.sid) baseSid = d.sid;
    if (pending.length) { state = replayOnto(theirs); schedulePersist(true); } else state = theirs;
    state = E().tick(state, now()).state;
    scheduleNotify();
  }

  /* ---------- transport: how this store talks to other tabs, other devices and a server ---------- */
  /*
   * TRANSPORT INTERFACE (for the hub prototype and any future server link)
   *
   * A transport is a plain object. Pass one to SB.store.init({ transport }) either as the object itself or as a
   * function that returns it. With no transport given, the store uses channelTransport() (same-browser tabs).
   *
   *   name                string, for debugging.
   *   open(deliver)       Start. Call deliver(msg) for every message that arrives from outside. Return false
   *                       when the transport cannot work here (the store then runs alone, like noSync).
   *   post(msg)           Best-effort broadcast of a small message to the peers. Return false if it was not
   *                       handed off. Never throw. The store adds msg.tab (this tab's id).
   *   push(entries)       OPTIONAL. Makes the store keep a saved outbox (key smokebox.v1.outbox). entries is a
   *                       copy of the unconfirmed list, oldest first: [{ opId, type, payload, now }]. Return
   *                       (or resolve to) an array of opIds the server accepted, or { acked: [opIds] }. A
   *                       rejection, a throw or no answer means "try later": the store retries about every 2 s,
   *                       backing off to 60 s. The server must treat a repeated opId as already done.
   *   close()             Stop and release resources. Must be safe to call twice.
   *
   * Messages coming in through deliver(msg), all objects with a string type:
   *   { type: 'ack', opIds: [...] }                 the server confirms these actions; they leave the outbox.
   *   { type: 'action', opId, actionType, payload, now }   an action done on another device. It is applied
   *                       once (repeats of an opId are ignored), is not queued again, and a refusal is dropped.
   *   { type: 'saved', ... } and { type: 'alert-*', ... }  same-browser tab messages (see the tab channel).
   * Messages carrying tab equal to this tab's id are ignored, so a transport may echo.
   *
   * Every dispatched action gets an opId (tabId + ':' + a counter, unique per page load) returned by
   * dispatchEx and kept in lastResult(). Only successful actions from a person are queued (not simulator ones).
   * The engine itself never sees an opId: it stays pure.
   *
   * Helpers: store.outbox() copies the queue, store.syncNow() pushes now, store.ackOps(ids) confirms by hand.
   */
  // Builds the default transport: a BroadcastChannel to the other tabs of this browser (name defaults to smokebox).
  function channelTransport(name) {
    let ch = null;
    return {
      name: 'broadcast-channel',
      // Opens the channel; false when this browser has none.
      open(deliver) {
        if (typeof g.BroadcastChannel !== 'function') return false;
        // Messages arrive wrapped in an event; hand the store just the data.
        const unwrap = (ev) => deliver(ev && ev.data);
        try { ch = new g.BroadcastChannel(name || 'smokebox'); ch.onmessage = unwrap; return true; } catch (e) { ch = null; return false; }
      },
      // Sends one message to the other tabs.
      post(msg) { if (!ch) return false; try { ch.postMessage(msg); return true; } catch (e) { return false; } },
      // Closes the channel and lets go of it.
      close() { if (ch) { try { ch.close(); } catch (e) { /* ignore */ } ch = null; } },
    };
  }
  // Starts the chosen transport (a given one, or the tab channel) and keeps it in tr when it opened.
  function openTransport(given) {
    let t = given;
    try { if (typeof t === 'function') t = t(); } catch (e) { t = null; }
    if (!t) t = channelTransport();
    if (typeof t.open !== 'function' || typeof t.post !== 'function') return;
    let ok = false;
    try { ok = t.open((msg) => { if (tr === t && msg && typeof msg === 'object') onMessage(msg); }) !== false; } catch (e) { ok = false; }
    if (!ok) { try { if (typeof t.close === 'function') t.close(); } catch (e) { /* ignore */ } return; }
    tr = t;
    if (typeof t.push === 'function') loadOutbox();
  }
  // Reads the saved outbox into memory (only entries that look right).
  function loadOutbox() {
    let raw = null;
    try { raw = storage.get(OUTBOX_KEY, null); } catch (e) { raw = null; }
    outbox = Array.isArray(raw) ? raw.filter((x) => x && typeof x.opId === 'string' && typeof x.type === 'string' && isNum(x.now)) : [];
  }
  // Saves the outbox so a reload or a dead connection does not lose unconfirmed actions. Merges with what other
  // tabs wrote (by opId), so two tabs do not overwrite each other.
  function saveOutbox() {
    if (!storage) return;
    try {
      const other = storage.get(OUTBOX_KEY, null);
      const have = new Set(outbox.map((x) => x.opId));
      if (Array.isArray(other)) for (const x of other) if (x && typeof x.opId === 'string' && !have.has(x.opId) && !acked.has(x.opId)) { outbox.push(x); have.add(x.opId); }
      outbox.sort((a, b) => a.now - b.now);
      while (outbox.length > OUTBOX_MAX) { outbox.shift(); st.outboxDropped++; }
      storage.set(OUTBOX_KEY, outbox);
    } catch (e) { /* a full or blocked store keeps the in-memory queue */ }
  }
  // opIds confirmed during this page load, so a merge never brings a confirmed action back.
  const acked = new Set();
  // Adds one successful action to the outbox when the transport can push. Does nothing otherwise.
  function enqueueOp(entry) {
    if (!tr || typeof tr.push !== 'function') return;
    outbox.push(entry);
    saveOutbox();
    retryAt = 0;
    if (typeof setTimeout === 'function') setTimeout(pushOutbox, 0);
  }
  // Removes confirmed actions from the outbox and saves it. Unknown ids are ignored.
  function ackOps(ids) {
    if (!Array.isArray(ids) || !ids.length) return;
    const set = new Set(ids.filter((x) => typeof x === 'string'));
    for (const id of set) acked.add(id);
    outbox = outbox.filter((x) => !set.has(x.opId));
    saveOutbox();
    retryMs = 2000;
  }
  // Offers the whole outbox to the transport, one push at a time. A failure waits retryMs (2 s, doubling to 60 s).
  function pushOutbox() {
    if (!tr || typeof tr.push !== 'function' || pushing || !outbox.length) return;
    if (realNow() < retryAt) return;
    pushing = true;
    const t = tr;
    // A failed push: wait longer (2 s, doubling up to 60 s) before the next try.
    const fail = () => { pushing = false; retryAt = realNow() + retryMs; retryMs = Math.min(60000, retryMs * 2); };
    // The transport answered: confirmed ids leave the outbox, anything else counts as a failure.
    const done = (res) => {
      if (tr !== t) { pushing = false; return; }
      pushing = false;
      const ids = Array.isArray(res) ? res : res && Array.isArray(res.acked) ? res.acked : null;
      if (ids) ackOps(ids); else fail();
    };
    try {
      const out = t.push(outbox.map((x) => Object.assign({}, x)));
      if (out && typeof out.then === 'function') out.then(done, fail); else done(out);
    } catch (e) { fail(); }
  }
  // Applies an action that another device did. Each opId is applied once; the action is not queued again.
  function applyRemote(d) {
    if (!state || typeof d.opId !== 'string' || seenOps.has(d.opId) || typeof d.actionType !== 'string') return;
    seenOps.add(d.opId);
    if (seenOps.size > 5000) seenOps.delete(seenOps.values().next().value);
    const n = Math.max(now(), isNum(d.now) ? d.now : 0);
    atLeast(n);
    const r = E().apply(state, d.actionType, d.payload, n);
    if (r.report === 'ok') commit(r.state, true);
  }

  /* ---------- lifecycle ---------- */
  // Adds an event listener (a bell on the door) and remembers it so destroy can remove it. Errors are
  // ignored.
  function on(target, type, fn) { try { target.addEventListener(type, fn); listeners.push([target, type, fn]); } catch (e) { /* ignore */ } }
  // Stops the timers, closes the tab channel, removes the listeners and forgets all subscribers. init calls
  // it first; tests call it to clean up.
  function destroy() {
    if (interval) clearInterval(interval);
    if (saveTimer) clearTimeout(saveTimer);
    interval = null; saveTimer = null;
    if (tr) { try { tr.close(); } catch (e) { /* ignore */ } tr = null; }
    pushing = false; retryAt = 0; retryMs = 2000;
    for (const [t, ty, fn] of listeners) { try { t.removeEventListener(ty, fn); } catch (e) { /* ignore */ } }
    listeners = [];
    subs = new Set(); tickSubs = new Set();
    notifyPending = false; pendingBroadcast = false; dirty = false;
  }
  // Starts the store: loads the saved state (or makes a fresh one), restores the clock, starts the 1-second
  // ticker, opens tab sync and installs the save-when-leaving listeners. Safe to call again: it restarts
  // everything. Returns the status. Options for tests: now (fake clock), storage (fake storage), noTimers,
  // noSync.
  function init(opts) {
    opts = opts || {};
    destroy();
    realNow = typeof opts.now === 'function' ? opts.now : () => Date.now();
    storage = opts.storage && typeof opts.storage.get === 'function' && typeof opts.storage.set === 'function' ? opts.storage : U.storage;
    st = { persistent: storage.persistent !== false, lastSaveOk: null, lastSaveAt: undefined, corrupt: null, firstRun: false, trimmed: false, repaired: [], outboxDropped: 0 };
    last = null;
    baseSid = null; pending = []; skipRebase = false;
    outbox = []; seenOps = new Set(); acked.clear(); opN = 0;
    const r = realNow();
    let payload = null;
    try { payload = storage.get(KEY, null); } catch (e) { payload = null; }
    try { baseSid = storage.get(SID_KEY, null); } catch (e) { baseSid = null; }
    // get() reports unreadable text as "nothing saved". Ask for the raw text so a damaged save is kept and reported,
    // not silently replaced.
    let unreadable = null;
    if (payload == null && typeof storage.raw === 'function') {
      try { const raw = storage.raw(KEY); if (raw != null && raw.trim() !== '' && raw.trim() !== 'null') unreadable = raw; } catch (e) { unreadable = null; }
    }
    let loaded = null;
    if (unreadable !== null) {
      st.corrupt = 'The saved data is not readable text.';
      try { storage.set(CORRUPT_KEY, unreadable); } catch (e) { /* ignore */ }
    } else if (payload != null) {
      const v = E().validateBackup(payload);
      // A saved copy that fails the check is parked under CORRUPT_KEY and the app starts fresh. It never
      // crashes on bad storage.
      if (v.ok) { loaded = v.state; st.repaired = v.repaired; } else {
        st.corrupt = v.error;
        try { storage.set(CORRUPT_KEY, payload); } catch (e) { /* ignore */ }
      }
    } else st.firstRun = true;
    // After a reload the virtual time continues from where it was saved, plus the real time spent away, and
    // never earlier than the real time. Speed goes back to 1.
    let vNow = r;
    const c = payload && payload.clock;
    if (loaded && c && isNum(c.virtual)) vNow = Math.max(r, c.virtual + Math.max(0, r - (isNum(c.real) ? c.real : r)));
    vNow = Math.floor(vNow);
    clk = { base: vNow, realBase: r, speed: 1 }; // speed resets to 1 on reload; time continues from the last virtual time
    lastNow = vNow;
    if (loaded) atLeast(lastStamp(loaded));
    state = loaded || E().newState({ now: now(), starter: opts.starter === true, stagger: opts.starter === true }); // a real kitchen starts with an empty pit; init({ starter: true }) gives the demo stock
    // Catch up anything that became due while the page was closed.
    const t = E().tick(state, now());
    state = t.state;
    if (!loaded && st.corrupt) schedulePersist(false); // replace the corrupt payload; a pristine first run is not written until something happens
    if (!opts.noTimers && typeof setInterval === 'function') interval = setInterval(tickNow, 1000);
    if (!opts.noSync) openTransport(opts.transport);
    if (!opts.noTimers) {
      if (typeof g.addEventListener === 'function') on(g, 'pagehide', () => flushIfDirty());
      if (g.document && typeof g.document.addEventListener === 'function') on(g.document, 'visibilitychange', () => { if (g.document.visibilityState === 'hidden') flushIfDirty(); });
    }
    return status();
  }
  // A copy of the save status plus the current speed: persistent, lastSaveOk, lastSaveAt, corrupt, firstRun,
  // trimmed, repaired, speed.
  function status() { return Object.assign({}, st, { speed: clk.speed }); }

  // Makes ns the current state if it differs, then schedules a save and a redraw. broadcast tells other
  // tabs.
  function commit(ns, broadcast) {
    if (ns === state) return;
    state = ns;
    schedulePersist(broadcast);
    scheduleNotify();
  }
  // Runs every second. Lets the engine move time-driven things on (items due to fire, batches expiring,
  // simulated channel syncs), commits only if something changed, then calls the tick subscribers.
  function tickNow() {
    if (!state) return;
    const n = now();
    const r = E().tick(state, n);
    if (r.state !== state) commit(r.state, false);
    if (outbox.length) pushOutbox();
    tickSubs.forEach((fn) => { try { fn(n); } catch (e) { if (g.console) console.error('[smokebox] tick subscriber failed', e); } });
  }
  // Gives one action to the engine and returns { report, info, events }. The report is the word "ok" or the
  // reason for a refusal; only "ok" changes the state. A refused action from a person is also logged as a
  // ui_report event (the friction charts); simulator traffic and "nothingToDo" are not, and neither is a
  // refused uiReport (that would loop). If init was never called, it starts the store itself.
  function dispatchEx(type, payload, opts) {
    if (!state) init({ noTimers: true, noSync: true });
    const source = opts && opts.source === 'sim' ? 'sim' : 'user';
    const n = now();
    const opId = tabId + ':' + (++opN);
    const r = E().apply(state, type, payload, n);
    last = { type: typeof type === 'string' ? type : String(type), report: r.report, info: r.info, events: r.events, opId };
    if (r.report === 'ok') {
      if (r.state !== state) {
        pending.push({ type, payload, now: n, opId }); if (pending.length > 300) pending.shift();
        if (source === 'user') enqueueOp({ opId, type, payload, now: n });
      }
      commit(r.state, true);
    }
    else if (source === 'user' && r.report !== 'nothingToDo' && type !== 'uiReport') {
      // instrumentation (UI guide): a user action that was refused is recorded as a ui_report event
      const r2 = E().apply(state, 'uiReport', { action: String(type).slice(0, 40) || '?', report: r.report }, n);
      if (r2.report === 'ok') commit(r2.state, false);
    }
    return { report: r.report, info: r.info, events: r.events, opId };
  }
  // Same as dispatchEx but returns only the report word.
  const dispatch = (type, payload, opts) => dispatchEx(type, payload, opts).report;

  /* ---------- backups ---------- */
  // Wraps the current state with version, save time, revision and clock: the one shape used for saving and
  // for backups.
  function envelope() { const r = realNow(); return { v: 1, savedAt: r, rev: state.rev, clock: { virtual: now(), real: r, speed: clk.speed }, state }; }
  // Backup as one JSON text (text that holds a whole list of records). Returns null and sets lastResult to
  // the reason when it refuses: too big, or it would not pass its own import check.
  function exportAll() {
    let text;
    try { text = JSON.stringify(envelope()); } catch (e) { last = { type: 'export', report: 'invalidBackup', info: { error: 'unserialisable' }, events: [] }; return null; }
    if (text.length > MAX_TEXT) { last = { type: 'export', report: 'exportTooLarge', info: { chars: text.length, max: MAX_TEXT }, events: [] }; return null; }
    // Check our own output with the same test import uses: better to refuse than hand out a backup import
    // would reject.
    const v = E().validateBackup(text);
    if (!v.ok) { last = { type: 'export', report: 'invalidBackup', info: { error: v.error }, events: [] }; return null; }
    last = { type: 'export', report: 'ok', info: { chars: text.length }, events: [] };
    return text;
  }
  // Replaces the whole state from backup text. Returns "ok", "invalidBackup" or "exportTooLarge". A refused
  // import changes nothing. Repairs it made are listed in lastResult().info.repaired.
  function importAll(text) {
    if (typeof text !== 'string') { last = { type: 'import', report: 'invalidBackup', info: { error: 'not text' }, events: [] }; return 'invalidBackup'; }
    if (text.length > MAX_TEXT) { last = { type: 'import', report: 'exportTooLarge', info: { chars: text.length, max: MAX_TEXT }, events: [] }; return 'exportTooLarge'; }
    const v = E().validateBackup(text);
    if (!v.ok) { last = { type: 'import', report: 'invalidBackup', info: { error: v.error, repaired: v.repaired }, events: [] }; return 'invalidBackup'; }
    const ns = v.state;
    // The revision must go up so other tabs treat the imported copy as newer; the clock must not be behind
    // its times.
    ns.rev = Math.max(ns.rev, (state ? state.rev : 0) + 1);
    atLeast(lastStamp(ns));
    state = E().tick(ns, now()).state;
    pendingBroadcast = true;
    skipRebase = true; pending = [];   // an import or reset is meant to win over what another tab saved
    persistNow();
    scheduleNotify();
    last = { type: 'import', report: 'ok', info: { repaired: v.repaired }, events: [] };
    return 'ok';
  }
  // Time in ms as readable date text for spreadsheets, or empty text when missing.
  const ISO = (t) => (isNum(t) ? new Date(t).toISOString() : '');
  // Prepares one value for a spreadsheet (CSV) cell: empty for missing, quotes where needed. WATCH OUT: text
  // starting with = + - @ or a tab gets a leading apostrophe so a spreadsheet cannot run it as a formula.
  function cell(v) {
    if (v === undefined || v === null) return '';
    if (typeof v === 'number') return isNum(v) ? String(v) : '';
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    let s = typeof v === 'string' ? v : JSON.stringify(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // spreadsheet formula injection guard (text cells only)
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  // Joins a list of values into one CSV line.
  const row = (a) => a.map(cell).join(',');
  // Spreadsheet text for "tickets", "items", "orders", "events" or "batches", one header line then one line per
  // record. Returns empty text for an unknown kind.
  function exportCsv(kind) {
    if (!state) return '';
    const out = [];
    if (kind === 'tickets') {
      out.push(row(['id', 'num', 'serviceDate', 'customer', 'channel', 'src', 'status', 'rush', 'pacing', 'dmaxSec', 'createdAt', 'expeditedAt', 'voidedAt', 'totalSec', 'lines', 'qty', 'value', 'forced', 'recalls', 'voidReason', 'note']));
      for (const t of state.tickets) {
        // Totals for the ticket are worked out from its items, so the sheet needs no extra columns.
        let qty = 0, value = 0;
        for (const it of t.items) { qty += it.qty; value += it.qty * it.price; }
        out.push(row([t.id, t.num, t.serviceDate, t.customer, t.channel, t.src, t.status, t.rush, t.pacing, t.dmaxSec, ISO(t.createdAt), ISO(t.expeditedAt), ISO(t.voidedAt),
          isNum(t.expeditedAt) ? Math.round((t.expeditedAt - t.createdAt) / 1000) : undefined, t.items.length, qty, U.round(value, 2), !!t.forced, t.recalls, t.voidReason, t.note]));
      }
    } else if (kind === 'items') {
      out.push(row(['ticketId', 'itemId', 'menuId', 'name', 'zone', 'qty', 'mods', 'track', 'status', 'price', 'prepSec', 'offsetSec', 'fireAt', 'firedAt', 'startedAt', 'doneAt', 'override', 'rushed', 'cost', 'shortG']));
      for (const t of state.tickets) for (const it of t.items) {
        // shortG is grams the kitchen cooked that stock could not cover.
        let short = 0;
        for (const r of it.depleted || []) if (r.short > 0) short += r.short;
        out.push(row([t.id, it.id, it.menuId, it.name, it.zone, it.qty, (it.mods || []).join('; '), it.track, it.status, it.price, it.prepSec, it.offsetSec, ISO(it.fireAt),
          ISO(it.firedAt), ISO(it.startedAt), ISO(it.doneAt), !!it.override, !!it.rushed, it.cost, short || undefined]));
      }
    } else if (kind === 'orders') {
      out.push(row(['id', 'serviceDate', 'customer', 'channel', 'src', 'status', 'rounds', 'createdAt', 'paidAt', 'method', 'subtotal', 'discount', 'tax', 'tip', 'total', 'voidReason']));
      for (const o of state.orders || []) {
        // Paid orders carry the totals frozen when they were paid; open ones are worked out now.
        const tot = o.status === 'voided' ? null : E().orderTotals(state, o) || {};
        out.push(row([o.id, o.serviceDate, o.customer, o.channel, o.src, o.status, o.rounds, ISO(o.createdAt), ISO(o.paidAt), o.method,
          tot ? tot.subtotal : undefined, tot ? tot.discount : undefined, tot ? tot.tax : undefined, o.status === 'paid' ? o.tip : undefined, tot ? tot.total : undefined, o.voidReason]));
      }
    } else if (kind === 'events') {
      out.push(row(['id', 't', 'time', 'type', 'reverted', 'fields']));
      for (const e of E().allEvents(state)) {
        // Event details beyond the four basic columns are packed as JSON in the last column.
        const f = {};
        for (const k of Object.keys(e)) if (k !== 'id' && k !== 't' && k !== 'type' && k !== 'reverted') f[k] = e[k];
        out.push(row([e.id, e.t, ISO(e.t), e.type, !!e.reverted, JSON.stringify(f)]));
      }
    } else if (kind === 'batches') {
      out.push(row(['id', 'ing', 'label', 'kind', 'src', 'enteredAt', 'rawG', 'cookedG', 'remainingG', 'yieldPct', 'costPerCookedKg', 'status', 'action', 'canServe', 'lastTempF', 'lastTempAt', 'reheats', 'discardedAt', 'discardReason', 'wasteG']));
      for (const b of state.batches) out.push(row([b.id, b.ing, b.label, b.kind, b.src, ISO(b.enteredAt), b.rawG, b.cookedG, b.remainingG, b.yieldPct, b.costPerCookedKg, b.status, b.action, b.canServe, b.lastTempF, ISO(b.lastTempAt), b.reheats, ISO(b.discardedAt), b.discardReason, b.wasteG]));
    } else return '';
    return out.join('\n') + '\n';
  }

  /* ---------- resets ---------- */
  // Puts the virtual clock back to real time. Safe only right after a reset, because the new state holds no
  // times the clock could fall behind.
  function rebaseClock() { // only allowed together with a reset: the new state holds no stamps the clock could fall behind
    const r = realNow();
    clk = { base: r, realBase: r, speed: clk.speed };
    lastNow = r;
  }
  // Throws everything away and starts a fresh state. Ticket and event counters carry on so ids are never
  // reused. Saves at once. Returns "ok".
  function reset() {
    rebaseClock();
    const old = state;
    const ns = E().newState({ now: now(), starter: false, seq: old ? old.seq : undefined });
    ns.rev = (old ? old.rev : 0) + 1;
    commit(ns, true);
    skipRebase = true; pending = [];
    persistNow();
    return 'ok';
  }
  // Clears live tickets, events and batches (the engine keeps settings and menu unless keepSettings is
  // false). Returns the engine's report.
  function resetLive(opts) {
    if (!state) init({ noTimers: true, noSync: true });
    // If the demo clock ran ahead, return to real time first: the cleared state has no times to conflict
    // with.
    if (now() > realNow()) rebaseClock();
    const rep = dispatch('resetLive', opts || {}, { source: 'user' });
    if (rep === 'ok') persistNow();
    return rep;
  }

  /* ---------- selectors (memoised per state reference) ---------- */
  // Remembered answers, kept per state object: a changed state is a new object, so stale answers drop away
  // by themselves.
  const memo = new WeakMap();
  // Returns the remembered answer for this name and state, computing it only the first time. Before init
  // there is no state to remember against, so the answer is computed fresh and not kept.
  function cached(key, fn) {
    if (!state || typeof state !== 'object') return fn();
    let m = memo.get(state);
    if (!m) { m = new Map(); memo.set(state, m); }
    if (!m.has(key)) m.set(key, fn());
    return m.get(key);
  }
  // Shortcut to the engine's ready-made views.
  const V = () => E().views;
  const select = {
    // Tickets still open (not bumped, not voided).
    activeTickets: () => cached('active', () => V().activeTickets(state)),
    // Tickets with work left at one station, reduced to that station's items.
    ticketsForZone: (zone) => cached('zone:' + zone, () => V().ticketsForZone(state, zone)),
    // Whole tickets, for the expo view.
    expoTickets: () => cached('expo', () => V().expoTickets(state)),
    // The n most recently bumped tickets, newest first.
    recent: (n) => cached('recent:' + n, () => V().recent(state, n)),
    // The n most recently voided tickets.
    voided: (n) => cached('voided:' + n, () => V().voided(state, n)),
    // All-day totals: how many of each dish are still needed, for one station or all.
    allDay: (zone) => cached('allday:' + zone, () => E().allDay(state, zone)),
    // Whether a dish can be sold now and why not (manual 86, safety hold or stock). Uses the stored answer
    // when there is one.
    availability: (menuId) => (state && state.avail && Object.prototype.hasOwnProperty.call(state.avail, menuId) ? state.avail[menuId] : E().availability(state, menuId)),
    // Every dish that is currently 86'd.
    unavailable: () => cached('unavail', () => V().unavailable(state)),
    // Hold-cabinet batches, each with its safety status.
    batches: (opts) => V().batches(state, now(), opts),
    // Numbers for the header badges: tickets per station, overdue, hold cabinet and 86 counts.
    counts: () => V().counts(state, now()),
    // Elapsed time and the ok, warn or overdue level of one ticket.
    timing: (ticket) => E().ticketTiming(ticket, now(), state && state.settings),
    // The full event log, including older archived chunks.
    events: () => E().allEvents(state),
    // The editable menu (empty before the store starts).
    menu: () => (state ? state.menu : []),
    // The editable ingredient list (empty before the store starts).
    ingredients: () => (state ? state.ingredients : []),
    // Current settings, or the defaults before the store starts.
    settings: () => (state ? state.settings : E().defaultSettings()),
    // Same as store.dataset: the bundle the back office reads.
    dataset: (opts) => dataset(opts),
  };

  /* ---------- dataset for the back office (live state + optional sample history from SB.sim) ---------- */
  // The simulator hands itself over here so sample history can be fetched later.
  function attachSim(sim) { simRef = sim || null; }
  // Gets the 14-day sample history from the simulator, or null if there is none or it fails. A failure is
  // logged so the office still opens.
  function sampleData() {
    const sim = simRef || SB.sim;
    if (!sim || typeof sim.sample !== 'function') return null;
    try { const s = sim.sample(); return s && Array.isArray(s.tickets) ? s : null; } catch (e) { if (g.console) console.error('[smokebox] sample failed', e); return null; }
  }
  // Remembered datasets, per state object.
  const dsMemo = new WeakMap();
  // Everything the office reads in one bundle: tickets, events, batches, learned prep times, menu,
  // ingredients, settings, the time range and counts. With opts.sample true, the sample history is placed in
  // front of the live data. Remembered per state object.
  function dataset(opts) {
    if (!state) return { tickets: [], orders: [], events: [], batches: [], learned: {}, menu: [], ingredients: [], settings: E().defaultSettings(), range: { from: 0, to: 0 }, counts: { live: 0, sample: 0 }, hasSample: false };
    const wantSample = !!(opts && opts.sample);
    const smp = wantSample ? sampleData() : null;
    let m = dsMemo.get(state);
    if (!m) { m = {}; dsMemo.set(state, m); }
    const key = wantSample ? 's' : 'l';
    if (m[key] && m[key].smp === smp) return m[key].ds;
    const liveEvents = E().allEvents(state);
    const tickets = smp ? smp.tickets.concat(state.tickets) : state.tickets;
    const events = smp && Array.isArray(smp.events) ? smp.events.concat(liveEvents) : liveEvents;
    const batches = smp && Array.isArray(smp.batches) ? smp.batches.concat(state.batches) : state.batches;
    const liveOrders = state.orders || [];
    const orders = smp && Array.isArray(smp.orders) ? smp.orders.concat(liveOrders) : liveOrders;
    let from = Infinity;
    // Tickets run oldest first, so the first one gives the start of the range.
    for (const t of tickets) if (t.createdAt < from) { from = t.createdAt; break; } // oldest first
    const to = now();
    const ds = {
      tickets, orders, events, batches, learned: state.learned, menu: state.menu, ingredients: state.ingredients, settings: state.settings,
      range: { from: isNum(from) ? from : to, to }, counts: { live: state.tickets.length, sample: smp ? smp.tickets.length : 0 }, hasSample: !!smp,
    };
    m[key] = { smp, ds };
    return ds;
  }

  // Public API: init, destroy, status, getState, now, tick, dispatch, dispatchEx, lastResult, subscribe,
  // subscribeTick, flushNotify, setSpeed, speed, clock, flush, exportAll, importAll, exportCsv, reset,
  // resetLive, attachSim, dataset, select, KEY, CORRUPT_KEY.
  SB.store = {
    init, destroy, status, getState: () => state, now, tick: tickNow, dispatch, dispatchEx, lastResult: () => last,
    // Clock readers: speed gives the demo speed, clock gives the whole clock card.
    subscribe, subscribeTick, flushNotify, setSpeed, speed: () => clk.speed, clock: () => ({ now: now(), speed: clk.speed, base: clk.base, realBase: clk.realBase }),
    flush, exportAll, importAll, exportCsv, reset, resetLive, attachSim, dataset, select, KEY, CORRUPT_KEY,
    // Messages between the tabs of this browser (alert leader, played and acknowledged sounds).
    broadcast, onBroadcast, canBroadcast: () => !!tr, tabId,
    // Server-ready pieces: the transport interface is described above (search "TRANSPORT INTERFACE").
    channelTransport, outbox: () => outbox.map((x) => Object.assign({}, x)), syncNow: () => { retryAt = 0; pushOutbox(); }, ackOps,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
