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
  // When the damaged copy was set aside (a time), so it can be cleared after 30 days.
  const CORRUPT_AT_KEY = 'smokebox.v1.corruptat';
  // One small rolling copy of the last good state (menu, ingredients, settings, PIN, safety records, recent history).
  const LASTGOOD_KEY = 'smokebox.v1.lastgood';
  // The owner's answer to the one-time offer to clear old demo tickets: true once they chose to keep them.
  const KEPT_KEY = 'smokebox.v1.demoLeftoversKept';
  // The word that must be typed to start over with an empty menu, and the setup-progress keys that start over clears.
  const START_OVER_WORD = 'ERASE';
  // Neutral starter names for a new empty kitchen. The ids (pit, meat ...) never change, only what people read.
  const STARTER_NAMES = { rename: { zones: { pit: 'Kitchen', sides: 'Prep', fry: 'Fryer' }, categories: { meat: 'Mains', sandwich: 'Sides', side: 'Snacks', fried: 'Desserts', cold: 'Drinks' } }, add: {} };
  // The half-built order on the New ticket screen: kept so a reload or closed tab loses nothing. At most 20,000 characters, and a
  // draft older than 12 hours is forgotten (yesterday's half-order should not come back).
  const DRAFT_KEY = 'smokebox.v1.orderdraft', DRAFT_MAX_CHARS = 20000, DRAFT_MAX_AGE_MS = 12 * 3600e3;
  // PIN recovery: attempts are counted in this key (kitchen data) so a reload does not reset the count. 5 wrong codes lock it for 15 minutes.
  const RECOVERY_KEY = 'smokebox.v1.pinrecovery', RECOVERY_TRIES = 5, RECOVERY_LOCK_MS = 15 * 60e3;
  // Letters and digits for a recovery code, leaving out I, O, 0 and 1 so a handwritten card is not misread. 32 characters, 10 in a code: 50 bits.
  const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const START_OVER_KEYS = ['smokebox.v1.hubcache', 'smokebox.v1.hubqueue', 'smokebox.v1.orderdraft', 'smokebox.v1.setup.draft', 'smokebox.v1.setup.examples', 'smokebox.v1.setup.hiddenStations', 'smokebox.v1.setup.lastZone', 'smokebox.v1.setup.hiddenCategories', 'smokebox.v1.setup.lastCategory',
    'smokebox.v1.setup.cookAheadSkipped', 'smokebox.v1.setup.serveSkipped', 'smokebox.v1.setup.serveAnswer', 'smokebox.v1.readings', 'smokebox.v1.lastproduct', 'smokebox.v1.welcome', 'smokebox.v1.dlog', 'smokebox.v1.lastbatch', 'smokebox.v1.alertlog'];
  // 30 days in ms: how long a set-aside damaged copy is kept. 6 hours in ms: how often the rolling copy is refreshed.
  const CORRUPT_KEEP_MS = 30 * 24 * 3600e3, SNAP_EVERY_MS = 6 * 3600e3;
  // The rolling copy keeps this much history: enough to see today, small enough to be a sliver of the live save.
  const SNAP_KEEP = { maxTickets: 300, maxEvents: 2000 };
  const SID_KEY = 'smokebox.v1.sid';
  // The actions this device has done that no server has confirmed yet (only used when a transport can push).
  const OUTBOX_KEY = 'smokebox.v1.outbox';
  const OUTBOX_MAX = 5000; // oldest unconfirmed actions are dropped past this, and st.outboxDropped says so
  // 20 million characters: bigger backups are refused on both export and import (Pitcall finding PO4c).
  const MAX_TEXT = 20e6; // characters; backups above this are refused (Pitcall PO4c)
  // 400 ms: wait this long after the last change before saving, so a burst of taps is one save.
  const SAVE_MS = 400;
  // 5000 ms: the longest the save delay may grow to when saves are slow.
  const SAVE_MAX_MS = 5000;
  // True for a plain object (not null, not a list).
  const isObjLike = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
  // True only for a real, finite number.
  const isNum = (n) => typeof n === 'number' && isFinite(n);
  // Looks up the engine each time it is needed, not once at load, so the engine can be swapped in tests.
  const E = () => SB.engine;

  // Module memory. state is the current kitchen data. storage is where it is saved. clk is the virtual clock
  // (a base time, the real time at that base, and the speed). lastNow is the newest time ever handed out, so
  // time never goes backwards. subs and tickSubs are the screens waiting to be told. The flags remember that
  // a redraw, a save or a broadcast to other tabs is pending.
  let state = null;
  // The follower: null in every normal kitchen and in the demo. Only initFollower sets it (see the follower section below).
  let fol = null, lastInit = null;
  const refusalSubs = new Set();
  const followSubs = new Set();
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
  // Which kitchen this store holds: 'real' or 'demo'. strict is true when the start-up named the mode (the app does;
  // plain tests do not): then the real kitchen refuses a fast clock and the sample history, and backups carry the mode.
  let mode = 'real', strict = false, baseStorage = null, reloadFn = null;
  // snapAt is when the rolling copy was last taken (real time); snapWanted is set by close day so the next save takes one.
  let snapAt = 0, snapWanted = null;
  let last = null;
  let st = { persistent: false, lastSaveOk: null, lastSaveAt: undefined, corrupt: null, firstRun: false, trimmed: false, repaired: [], outboxDropped: 0, saveCostMs: 0, saveDelayMs: 400 };
  const tabId = 'tab_' + Math.floor(Math.random() * 1e9).toString(36);

  /* ---------- clock: now() = base + (real - realBase) * speed, clamped so it never goes backwards ---------- */
  // Current virtual time in ms: the real clock moved on by the demo speed. Never returns an earlier time
  // than it returned before (rule I9).
  function now() {
    const r = realNow();
    // A follower screen keeps the hub's time: this device's clock plus the offset learned from the hub, so elapsed times agree.
    let v = fol ? Math.floor(r + fol.offset) : Math.floor(clk.base + (r - clk.realBase) * clk.speed);
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
    if (strict && mode === 'real' && x !== 1) return false; // only the demo may run the clock fast: a real board must keep real time
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

  // A millisecond clock for timing the save itself (not the kitchen clock, which tests replace).
  const perfNow = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
  // Marks the state as unsaved and arranges a save SAVE_MS later. broadcast true means tell other tabs after
  // saving.
  function schedulePersist(broadcast) {
    if (fol) return;                                  // a follower never saves anything
    dirty = true;
    if (broadcast) pendingBroadcast = true;
    if (saveTimer || !storage) return;
    // Once a shared save exists and other tabs may be open, each tab waits a little differently, so two tabs rarely write in the
    // same instant. The very first save of a new board is not delayed, so a second tab opened right after sees it.
    // A slow save (a big history) makes the next one wait longer: eight times what the last save took, between the normal
    // 400 ms and 5 seconds, so a busy rush never spends most of its time writing.
    const wait = Math.min(SAVE_MAX_MS, Math.max(SAVE_MS, Math.round(st.saveCostMs * 8)));
    st.saveDelayMs = wait;
    saveTimer = setTimeout(() => { saveTimer = null; persistNow(); }, tr && baseSid ? wait + Math.floor(Math.random() * 300) : wait);
  }
  // Saves the state to the browser right now and returns true if it worked. If the browser says it is full,
  // it retries with less history (oldest finished tickets and events first), halving up to 12 times. After a
  // good save it announces the new revision to other tabs.
  function persistNow() {
    if (fol) return true;                             // a follower never saves anything
    if (!storage || !state) return false;
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    // If another tab saved since this tab last loaded or saved, build on its copy first so nothing is lost.
    if (skipRebase) skipRebase = false; else rebaseIfStale();
    const r = realNow();
    const v = now();
    let ok = false;
    const t0 = perfNow();
    const prevSaveOk = st.lastSaveOk;
    let snapDropped = false, cacheDropped = false;
    // full copy first; if the quota refuses it, keep halving the history (oldest completed tickets and events go first)
    let lim = null;
    // First trimmed attempt keeps at most 1500 tickets and 10 000 events. A failed save never loses the copy
    // in memory (finding F-E5).
    let nt = Math.min(state.tickets.length, 1500), ne = Math.min(E().allEvents(state).length, 10000);
    for (let tries = 0; tries < 12; tries++) {
      const s2 = lim ? E().prune(state, lim) : state;
      try { ok = storage.set(KEY, { v: 1, savedAt: r, rev: s2.rev, clock: { virtual: v, real: r, speed: clk.speed }, state: s2 }) !== false; } catch (e) { ok = false; }
      if (ok) { st.trimmed = !!lim; break; }
      // Under pressure the rolling copy goes first: it is only a convenience, the live save is the data.
      if (!cacheDropped) { cacheDropped = true; try { U.rawStorage.remove('smokebox.v1.hubcache'); } catch (e) { /* ignore */ } tries--; continue; }
      if (!snapDropped && strict) { snapDropped = true; snapAt = 0; try { storage.remove(LASTGOOD_KEY); } catch (e) { /* ignore */ } tries--; continue; }
      // History is already tiny: trimming further will not help, so give up and report the failed save.
      if (nt < 20 && ne < 200) break;
      lim = { maxTickets: nt, maxEvents: ne };
      nt = Math.floor(nt / 2); ne = Math.floor(ne / 2);
    }
    const flipped = st.lastSaveOk !== ok;
    st.lastSaveOk = ok;
    st.lastSaveAt = r;
    if (flipped && (ok === false || prevSaveOk === false)) scheduleNotify(); // a failed save (or its recovery) shows on screen at once
    st.saveCostMs = Math.round((perfNow() - t0) * 10) / 10; // how long this save took, which sets the next delay
    if (ok) dirty = false;
    let sid = null;
    if (ok) {
      sid = tabId + ':' + (++sidN);
      try { storage.set(SID_KEY, sid); baseSid = sid; } catch (e) { sid = null; }
      pending = [];
    }
    if (ok && !st.trimmed) maybeSnapshot(r);
    if (ok && pendingBroadcast && tr) { try { tr.post({ type: 'saved', rev: state.rev, tab: tabId, sid }); } catch (e) { /* ignore */ } }
    pendingBroadcast = false;
    return ok;
  }
  // Takes the rolling last-good copy when one is due (after close day, or every 6 hours) and the live save went in whole.
  // Real kitchens only; the demo is disposable. The copy is a trimmed state, and if it does not fit it is dropped quietly.
  function maybeSnapshot(r) {
    if (!strict || mode !== 'real' || !storage || !state) return false;
    if (!snapWanted && r - snapAt < SNAP_EVERY_MS) return false;
    try {
      const small = E().prune(state, SNAP_KEEP);
      const env = { v: 1, takenAt: r, reason: snapWanted || 'interval', rev: state.rev, clock: { virtual: now(), real: r, speed: 1 }, state: small };
      const text = JSON.stringify(env);
      if (!E().validateBackup(text).ok) return false; // never keep a copy that would not load
      if (storage.set(LASTGOOD_KEY, env) === false) { storage.remove(LASTGOOD_KEY); return false; }
      snapAt = r; snapWanted = null;
      st.lastGoodAt = r;
      return true;
    } catch (e) { return false; }
  }
  // Reads the rolling copy and returns { state, takenAt } if it is whole, else null.
  function readSnapshot() {
    try {
      const env = storage.get(LASTGOOD_KEY, null);
      if (!env || typeof env !== 'object') return null;
      const v = E().validateBackup(env);
      return v.ok ? { state: v.state, takenAt: isNum(env.takenAt) ? env.takenAt : 0, repaired: v.repaired } : null;
    } catch (e) { return null; }
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
    syncUnits();
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
    if (d && d.tab !== tabId && d.type === 'state') { adoptState(d); return; }
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
    state = E().tick(state, now()).state; syncUnits();
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
   *   { type: 'state', state, opIds }               the authoritative state (an object or backup text). The
   *                       store adopts it, treats opIds as confirmed (they leave the outbox), then replays any
   *                       actions still in the outbox on top, so a device's own unconfirmed work is kept while
   *                       its numbering follows the hub. An invalid state is ignored.
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
    if (strict && mode === 'demo') t = null; // a server or hub transport never carries the demo
    if (!t) t = channelTransport(mode === 'demo' ? 'smokebox-demo' : undefined); // the demo talks on its own channel
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
  // Takes the authoritative state sent by a hub: confirmed actions leave the outbox, the state replaces ours,
  // and actions still unconfirmed are replayed on top (a refused one is dropped). Ticket numbers then follow
  // the hub's order, not the order this device did things in.
  function adoptState(d) {
    if (!state || !storage) return;
    const v = E().validateBackup(d.state);
    if (!v.ok) return;
    const ids = Array.isArray(d.opIds) ? d.opIds.filter((x) => typeof x === 'string') : [];
    for (const id of ids) seenOps.add(id);
    ackOps(ids);
    let ns = v.state;
    atLeast(lastStamp(ns));
    for (const p of outbox) {
      const r = E().apply(ns, p.type, p.payload, Math.max(p.now, lastStamp(ns)));
      if (r.report === 'ok') ns = r.state;
    }
    ns = E().tick(ns, now()).state;
    ns.rev = Math.max(ns.rev, (state.rev || 0) + 1);
    state = ns;
    pending = []; skipRebase = true; pendingBroadcast = true;
    persistNow();
    scheduleNotify();
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
    folStop();
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
    if (!opts.memoryOnly) lastInit = opts;                  // remembered so leaving a hub can restart on the device's own kitchen
    realNow = typeof opts.now === 'function' ? opts.now : () => Date.now();
    // The mode: named by the caller, else the page's own. A named mode also puts the store in strict mode (see above).
    strict = opts.mode === 'demo' || opts.mode === 'real';
    mode = strict ? opts.mode : (U.mode && U.mode() === 'demo' ? 'demo' : 'real');
    reloadFn = typeof opts.reload === 'function' ? opts.reload : null;
    const given = opts.storage && typeof opts.storage.get === 'function' && typeof opts.storage.set === 'function' ? opts.storage : null;
    // Kitchen data goes to the demo's own keys in the demo, so the demo never reads or writes the real kitchen's data.
    baseStorage = given || U.rawStorage;
    storage = given ? (strict && mode === 'demo' ? U.storageFor(given, 'demo') : given) : (strict ? U.storageFor(U.rawStorage, mode) : U.storage);
    st = { persistent: storage.persistent !== false, lastSaveOk: null, lastSaveAt: undefined, corrupt: null, firstRun: false, trimmed: false, repaired: [], outboxDropped: 0, saveCostMs: 0, saveDelayMs: SAVE_MS };
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
      try { storage.set(CORRUPT_KEY, unreadable); storage.set(CORRUPT_AT_KEY, r); } catch (e) { /* ignore */ }
    } else if (payload != null) {
      const v = E().validateBackup(payload);
      // A saved copy that fails the check is parked under CORRUPT_KEY and the app starts fresh. It never
      // crashes on bad storage.
      if (v.ok) { loaded = v.state; st.repaired = v.repaired; } else {
        st.corrupt = v.error;
        try { storage.set(CORRUPT_KEY, payload); storage.set(CORRUPT_AT_KEY, r); } catch (e) { /* ignore */ }
      }
    } else st.firstRun = true;
    // A damaged save: the rolling last-good copy takes its place (real kitchens), and the damaged one stays set aside.
    if (!loaded && st.corrupt && strict && mode === 'real') {
      const snap = readSnapshot();
      if (snap) { loaded = snap.state; st.repaired = snap.repaired; st.restoredFromCopy = snap.takenAt; }
    }
    // A set-aside damaged copy is cleared after 30 days, once a working state is running.
    if (!st.corrupt) {
      try {
        const at = storage.get(CORRUPT_AT_KEY, null);
        if (isNum(at) && r - at > CORRUPT_KEEP_MS) { storage.remove(CORRUPT_KEY); storage.remove(CORRUPT_AT_KEY); st.corruptCleared = true; }
      } catch (e) { /* ignore */ }
    }
    try { const g0 = storage.get(LASTGOOD_KEY, null); snapAt = g0 && isNum(g0.takenAt) ? g0.takenAt : 0; } catch (e) { snapAt = 0; }
    snapWanted = null;
    // After a reload the virtual time continues from where it was saved, plus the real time spent away, and
    // never earlier than the real time. Speed goes back to 1.
    let vNow = r;
    const c = payload && payload.clock;
    if (loaded && c && isNum(c.virtual)) vNow = Math.max(r, c.virtual + Math.max(0, r - (isNum(c.real) ? c.real : r)));
    vNow = Math.floor(vNow);
    clk = { base: vNow, realBase: r, speed: 1 }; // speed resets to 1 on reload; time continues from the last virtual time
    lastNow = vNow;
    if (loaded) atLeast(lastStamp(loaded));
    // A real kitchen starts with an empty pit; init({ starter: true }) gives the demo stock. init({ blank: true }) (what the
    // app's start-up passes) makes a brand-new install start with no dishes, ingredients or prices at all. A saved state
    // always wins: nobody who already has data is changed.
    const demoStart = strict && mode === 'demo';
    state = loaded || E().newState(opts.blank === true && opts.starter !== true && !demoStart ? { now: now(), blank: true } : { now: now(), starter: opts.starter === true || demoStart, stagger: opts.starter === true || demoStart });
    // Catch up anything that became due while the page was closed.
    const t = E().tick(state, now());
    state = t.state;
    syncUnits();
    if (st.corrupt) schedulePersist(false); // replace the corrupt payload; a pristine first run is not written until something happens
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

  // Tells the formatting helpers which units the saved settings ask for (degrees F or C, kg or lb).
  function syncUnits() { try { if (state && state.settings) { U.setUnits(state.settings.ui); U.setCurrency(state.settings.ui && state.settings.ui.currency); } } catch (e) { /* formatting keeps its old choice */ } }
  // Makes ns the current state if it differs, then schedules a save and a redraw. broadcast tells other
  // tabs.
  function commit(ns, broadcast) {
    if (ns === state) return;
    const sameSettings = state && ns.settings === state.settings;
    state = ns;
    if (!sameSettings) syncUnits();
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
    // A follower screen only shows the hub's kitchen: nothing is applied, queued, logged or sent.
    if (fol && !fol.hub) {
      last = { type: typeof type === 'string' ? type : String(type), report: 'followerReadOnly', info: {}, events: [], opId: null };
      return { report: 'followerReadOnly', info: {}, events: [], opId: null };
    }
    if (fol) return hubDispatch(type, payload);
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
      if (type === 'closeDay') snapWanted = 'closeDay';
      if (type === 'createTicket' && source === 'user') clearDraft();
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
  function envelope() {
    const r = realNow();
    const env = { v: 1, savedAt: r, rev: state.rev, clock: { virtual: now(), real: r, speed: clk.speed }, state };
    if (strict) env.mode = mode;
    // Owner choices from the setup screens that live outside the board state travel with the backup too.
    const setup = {};
    for (const k of SETUP_LISTS) { let v = null; try { v = storage ? storage.get(SETUP_KEYS[k], null) : null; } catch (e) { v = null; } if (Array.isArray(v)) setup[k] = v.filter((x) => typeof x === 'string').slice(0, 200); }
    if (Object.keys(setup).length) env.setup = setup;
    const nm = ownerNames();
    if (nm) env.names = nm;
    return env;
  }
  // The setup-screen lists a backup carries: stations the owner hid from the tiles, and dishes that came from the examples.
  const SETUP_KEYS = { hiddenStations: 'smokebox.v1.setup.hiddenStations', examples: 'smokebox.v1.setup.examples' };
  const SETUP_LISTS = Object.keys(SETUP_KEYS);
  // The owner's station, category and channel names (SB.config.customSpec), or null when there are none or the
  // config has no such feature. Backups carry them so tickets on an added station survive a restore.
  function ownerNames() {
    const C = SB.config;
    if (!C || typeof C.customSpec !== 'function') return null;
    try {
      const sp = C.customSpec();
      // True when a part of the spec holds at least one rename or added entry.
      const has = (o) => o && typeof o === 'object' && Object.keys(o).some((k) => (Array.isArray(o[k]) ? o[k].length : o[k] && typeof o[k] === 'object' && Object.keys(o[k]).length));
      return sp && (has(sp.rename) || has(sp.add)) ? JSON.parse(JSON.stringify(sp)) : null;
    } catch (e) { return null; }
  }
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
    if (fol) { const rp = fol.hub ? 'hubKitchen' : 'followerReadOnly'; last = { type: 'import', report: rp, info: {}, events: [] }; return rp; }
    if (typeof text !== 'string') { last = { type: 'import', report: 'invalidBackup', info: { error: 'not text' }, events: [] }; return 'invalidBackup'; }
    if (text.length > MAX_TEXT) { last = { type: 'import', report: 'exportTooLarge', info: { chars: text.length, max: MAX_TEXT }, events: [] }; return 'exportTooLarge'; }
    // A backup made in the demo cannot be loaded into the real kitchen, nor the reverse. A backup with no mode (made before
    // the demo had its own storage) is a real kitchen's.
    let parsed = null;
    try { parsed = JSON.parse(text); } catch (e) { parsed = null; }
    if (strict && parsed && typeof parsed === 'object') {
      const from = parsed.mode === 'demo' ? 'demo' : 'real';
      if (from !== mode) { last = { type: 'import', report: 'wrongBackupMode', info: { backup: from, mode }, events: [] }; return 'wrongBackupMode'; }
    }
    // A backup that carries owner names puts them in place BEFORE the check, so tickets on an added station are
    // not dropped. A backup without names (an older one) leaves the current names alone. A refused import
    // puts the old names back.
    const C = SB.config;
    let namesBefore = null, namesGiven = null;
    if (C && typeof C.applyCustom === 'function' && typeof C.customSpec === 'function') {
      try {
        const o = JSON.parse(text);
        if (o && typeof o === 'object' && o.names && typeof o.names === 'object') { namesGiven = o.names; namesBefore = C.customSpec(); C.applyCustom(namesGiven); }
      } catch (e) { namesGiven = null; }
    }
    const v = E().validateBackup(text);
    if (!v.ok) {
      if (namesGiven) { try { C.applyCustom(namesBefore); } catch (e) { /* keep going */ } }
      last = { type: 'import', report: 'invalidBackup', info: { error: v.error, repaired: v.repaired }, events: [] };
      return 'invalidBackup';
    }
    if (namesGiven && typeof C.saveCustom === 'function') { try { C.saveCustom(namesGiven); } catch (e) { /* the names stay applied for this session */ } }
    if (parsed && isObjLike(parsed.setup)) for (const k of SETUP_LISTS) if (Array.isArray(parsed.setup[k])) { try { storage.set(SETUP_KEYS[k], parsed.setup[k].filter((x) => typeof x === 'string').slice(0, 200)); } catch (e) { /* the list is a convenience */ } }
    const ns = v.state;
    // The revision must go up so other tabs treat the imported copy as newer; the clock must not be behind
    // its times.
    ns.rev = Math.max(ns.rev, (state ? state.rev : 0) + 1);
    atLeast(lastStamp(ns));
    state = E().tick(ns, now()).state; syncUnits();
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
    if (fol) return fol.hub ? 'hubKitchen' : 'followerReadOnly';
    rebaseClock();
    const old = state;
    const ns = E().newState({ now: now(), starter: false, seq: old ? old.seq : undefined, blank: !!(old && old.catalog === 'own') });
    ns.rev = (old ? old.rev : 0) + 1;
    commit(ns, true);
    skipRebase = true; pending = [];
    persistNow();
    return 'ok';
  }
  // Clears live tickets, events and batches (the engine keeps settings and menu unless keepSettings is
  // false). Returns the engine's report.
  function resetLive(opts) {
    if (fol) return fol.hub ? 'hubKitchen' : 'followerReadOnly';
    if (!state) init({ noTimers: true, noSync: true });
    // If the demo clock ran ahead, return to real time first: the cleared state has no times to conflict
    // with.
    if (now() > realNow()) rebaseClock();
    const rep = dispatch('resetLive', opts || {}, { source: 'user' });
    if (rep === 'ok') persistNow();
    return rep;
  }


  /* ---------- follower: a read-only screen that shows a hub's kitchen ---------- */
  /*
   * initFollower({ url, code?, staleMs?, now?, fetch?, TextDecoder?, AbortController?, noTimers? }) -> Promise<{ ok, error?, status }>
   * Turns this store into a read-only follower of a hub (server/server.mjs, GET /follow). Memory only: it never reads or writes the
   * device's own saved kitchen (storage, outbox, names, drafts), never opens the tab channel, and dispatch is refused with the report
   * 'followerReadOnly'. It adopts the hub's snapshot, then applies the hub's ordered actions (and ticks) through the same engine, so
   * its state equals the hub's. A gap, a refused replay or a long silence is repaired by reconnecting; it resumes from its last change
   * number when the hub still has the history, else takes a fresh snapshot. The clock follows the hub: now() is this device's time plus
   * the offset learned from the hub. followStatus() says what it is doing; subscribeFollow(fn) fires when that changes.
   * Fatal errors (no retry): badCode, notFound, wrongVersion, tooMany. unreachable and other failures keep retrying.
   */
  const CODE_SKEY = 'smokebox.session.hubcode';
  // The address without a trailing slash, as the hub address is compared and remembered.
  const normUrl = (u) => String(u || '').replace(/\/+$/, '');
  // The access code remembered for this hub address in this browser tab (session storage), or ''.
  function rememberedCode(url) {
    try { const v = JSON.parse(g.sessionStorage.getItem(CODE_SKEY) || 'null'); return v && v.url === normUrl(url) && typeof v.code === 'string' ? v.code : ''; } catch (e) { return ''; }
  }
  // Takes the code from the options (or the one remembered for this address), keeps a given code for the tab, and removes ?code= from the
  // visible address, so the code is not left in the address bar, history or a shared link.
  function codeFor(opts) {
    const given = typeof opts.code === 'string' ? opts.code : '';
    if (given) {
      try { g.sessionStorage.setItem(CODE_SKEY, JSON.stringify({ url: normUrl(opts.url), code: given })); } catch (e) { /* the code is still used for this load */ }
      try {
        const L = g.location;
        if (L && g.history && typeof g.history.replaceState === 'function') {
          const search = L.search || '';
          if (/[?&]code=/.test(search)) g.history.replaceState(null, '', (L.pathname || '/') + search.replace(/([?&])code=[^&]*&?/, '$1').replace(/[?&]$/, '') + (L.hash || ''));
        }
      } catch (e) { /* leave the address as it is */ }
      return given;
    }
    return rememberedCode(opts.url);
  }
  const FOLLOW_FATAL = { badCode: 1, notFound: 1, wrongVersion: 1, tooMany: 1, unpaired: 1, revoked: 1 };
  const CLIENT_PROTO = 1;                              // the hub protocol this build speaks; sent to the hub, which may require a newer one
  const FOLLOW_REASON = {
    badCode: 'The access code is wrong or missing.', notFound: 'That address is not a Smokebox hub.', wrongVersion: 'This screen and the hub do not speak the same version. Reload the page from the hub.',
    unpaired: 'This screen is not paired with the hub. Ask the owner for a pairing code.', revoked: 'This screen was removed from the hub. Ask the owner to pair it again.',
    badPairCode: 'That pairing code is wrong or has expired. Ask the owner for a new one.', tooManyTries: 'Too many wrong tries. Wait a few minutes, or ask the owner for a new code.',
    badName: 'The screen name may use letters, digits, spaces and . , \' & ( ) # _ - and up to 20 characters.', notOwner: 'Only an owner screen can do that.',
    tooMany: 'The hub has too many screens connected.', unreachable: 'Cannot reach the hub.', closed: 'The connection to the hub ended.', error: 'Something went wrong talking to the hub.',
  };
  // Memory-only storage with the same methods as the browser's, so the follower never touches the device's saved kitchen.
  function memoryBackend() {
    const m = new Map();
    return {
      persistent: false,
      // Reads a kept value, or the fallback when it is missing or unreadable.
      get: (k, f) => { try { return m.has(k) ? JSON.parse(m.get(k)) : f; } catch (e) { return f; } },
      // The kept text exactly as stored, or null when nothing is kept.
      raw: (k) => (m.has(k) ? m.get(k) : null),
      // Keeps a value as text in memory only; false when it cannot be turned into text.
      set: (k, v) => { try { m.set(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
      // Forgets one kept value by its name.
      remove: (k) => { m.delete(k); },
      // The kept names that start with a prefix.
      keys: (p) => Array.from(m.keys()).filter((k) => k.indexOf(p || '') === 0),
    };
  }
  // Is this store a read-only follower right now?
  const isFollower = () => !!fol && !fol.hub;
  // The words and numbers a screen needs about the follower: state, address, last message, how stale, change number, clock offset, error.
  function followStatus() {
    if (fol && fol.hub) return hubStatus();
    if (!fol) return { mode: 'off', state: 'off', url: '', lastUpdate: null, since: null, staleSince: null, seq: null, hubId: null, offsetMs: 0, error: null, connected: false, retryInMs: 0, reason: '' };
    return { mode: 'follower', state: folState(), url: fol.url, lastUpdate: fol.lastMsgAt, since: fol.goodSince, staleSince: folStale() ? fol.lastMsgAt : null, seq: fol.seq, hubId: fol.hubId,
      offsetMs: Math.round(fol.offset), error: fol.error, connected: folState() === 'following', retryInMs: fol.retryInMs, reason: fol.error ? (FOLLOW_REASON[fol.error] || FOLLOW_REASON.error) : '' };
  }
  // True when nothing has arrived from the hub for longer than the stale limit.
  const folStale = () => !!fol && isNum(fol.lastMsgAt) && realNow() - fol.lastMsgAt > fol.staleMs;
  // The status word: error, stale, following, or connecting / reconnecting.
  function folState() {
    if (fol.error && FOLLOW_FATAL[fol.error]) return 'error';
    if (fol.connected && !folStale()) return 'following';
    if (folStale()) return 'stale';
    return fol.everConnected ? 'reconnecting' : 'connecting';
  }
  // Calls the follow subscribers when the status word or the error changed.
  function folNotify(force) {
    if (!fol) return;
    const key = (fol.hub ? hubState() : folState()) + '|' + fol.error + '|' + (fol.hub ? hubQueued() : 0);
    if (!force && key === fol.lastKey) return;
    fol.lastKey = key;
    const s = followStatus();
    followSubs.forEach((fn) => { try { fn(s); } catch (e) { if (g.console) console.error('[smokebox] follow subscriber failed', e); } });
  }
  // Registers fn for status changes; returns a remover.
  function subscribeFollow(fn) { if (typeof fn !== 'function') return () => {}; followSubs.add(fn); return () => followSubs.delete(fn); }
  // Ends the first-attempt promise once.
  function folSettle(res) { if (fol && fol.resolve) { const r = fol.resolve; fol.resolve = null; r(Object.assign({ status: followStatus() }, res)); } }
  // Stops following: closes the stream and timers. The store keeps its last state until init is called again.
  function folStop() {
    if (!fol) return;
    const f = fol;
    f.closed = true;
    if (f.ctrl) { try { f.ctrl.abort(); } catch (e) { /* ignore */ } }
    if (f.retryTimer) clearTimeout(f.retryTimer);
    if (f.timer) clearInterval(f.timer);
    fol = null;
    followSubs.clear(); refusalSubs.clear();
  }
  // Starts following a hub. Resolves after the first snapshot (ok: true), a fatal error, or the first failed attempt to reach it.
  function initFollower(opts) { return folBegin(opts, false); }
  // Starts following a hub as a read-only screen (hub false) or as a screen that writes through it (hub true, see initHubClient). cache is a saved
  // hub snapshot to show first when the hub cannot be reached (hub clients only).
  function folBegin(opts, hub, cache) {
    opts = opts || {};
    if (typeof opts.url !== 'string') return Promise.resolve({ ok: false, error: 'notFound', status: followStatus() });
    const keepSubs = Array.from(followSubs), keepRef = Array.from(refusalSubs);
    init({ now: opts.now, storage: memoryBackend(), mode: 'real', noSync: true, noTimers: true, blank: true, memoryOnly: true });
    keepSubs.forEach((fn) => followSubs.add(fn));
    keepRef.forEach((fn) => refusalSubs.add(fn));
    const url = opts.url.replace(/\/+$/, '');
    const f = fol = { url, code: codeFor(opts), staleMs: isNum(opts.staleMs) && opts.staleMs > 0 ? opts.staleMs : 45000, offset: 0, seq: null, hubId: null, connected: false, everConnected: false,
      error: null, lastMsgAt: null, goodSince: null, retryInMs: 0, retryStep: 0, closed: false, gen: 0, ctrl: null, retryTimer: null, timer: null, lastKey: '', resolve: null, resyncs: 0,
      base: null, hub: false, offsetKnown: false, pend: [], owners: new Map(), baseKey: null, topOwner: null, lastActKey: null, fromCache: false, cachedAt: null, cacheAt: 0, cacheDirty: false, name: '', sending: false, sendFail: false, sendRetryAt: 0, sendStep: 0, fatal: null,
      fetchFn: opts.fetch || (typeof g.fetch === 'function' ? (u, o) => g.fetch(u, o) : null), Dec: opts.TextDecoder || g.TextDecoder, Abort: opts.AbortController || g.AbortController };
    f.hub = !!hub;
    const bound = hub ? tokenFor(url) : null;
    f.name = bound && bound.name ? bound.name : typeof opts.name === 'string' ? opts.name.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 20) : '';
    f.timer = opts.noTimers ? null : setInterval(folTick, 1000);
    const p = new Promise((resolve) => { f.resolve = resolve; });
    if (hub && cache) {
      // The hub cannot be reached: show the last known kitchen, marked as such, and let taps be predicted and queued from the start.
      f.base = cache.state; f.seq = cache.seq; f.hubId = cache.hubId; f.offset = cache.offset || 0; f.fromCache = true; f.cachedAt = cache.savedAt; f.everConnected = true;
      hubHello({ hubId: cache.hubId });
      folShow();
      folSettle({ ok: true, cached: true });
    }
    if (hub && !opts.noTimers && typeof g.addEventListener === 'function') on(g, 'pagehide', () => hubCacheSave(true));
    folConnect();
    return p;
  }
  // Every second: tells the screens a second passed (for timers), notices a silent stream and reconnects.
  function folTick() {
    if (!fol) return;
    const n = now();
    if (fol.connected && folStale() && fol.ctrl) { fol.connected = false; try { fol.ctrl.abort(); } catch (e) { /* ignore */ } }
    folNotify(false);
    if (fol.hub) { folSend(); if (fol.cacheDirty) hubCacheSave(false); }
    tickSubs.forEach((fn) => { try { fn(n); } catch (e) { if (g.console) console.error('[smokebox] tick subscriber failed', e); } });
  }
  // Schedules the next connection attempt after a failure: 1, 2, 4, 8, then every 15 seconds.
  function folRetry(error, immediate) {
    const f = fol;
    if (!f || f.closed) return;
    f.connected = false;
    if (error && error !== 'closed') f.error = error;           // a stream that simply ended is not an error to show
    if (FOLLOW_FATAL[f.error]) { folSettle({ ok: false, error: f.error }); folNotify(true); return; }
    const delay = immediate ? 50 : Math.min(15000, 1000 * Math.pow(2, f.retryStep++));
    f.retryInMs = delay;
    folSettle({ ok: false, error: f.error || 'unreachable' });
    folNotify(true);
    f.retryTimer = setTimeout(() => { f.retryTimer = null; f.retryInMs = 0; folConnect(); }, delay);
  }
  // Opens the stream (resuming from the last change number when there is one) and reads it until it ends.
  async function folConnect() {
    const f = fol;
    if (!f || f.closed) return;
    const gen = ++f.gen;
    if (!f.fetchFn || !f.Abort || !f.Dec) { f.error = 'error'; folRetry('error'); return; }
    f.ctrl = new f.Abort();
    let q = '';
    if (f.hubId != null && isNum(f.seq)) q = '?since=' + f.seq + '&hub=' + encodeURIComponent(f.hubId);
    const hdr = hubHeaders(f.url, f.code, { accept: 'text/event-stream' });       // the token or code travels in a header, never in the address
    let res;
    try { res = await f.fetchFn(f.url + '/follow' + q, { signal: f.ctrl.signal, cache: 'no-store', headers: hdr }); } catch (e) { if (f.closed || gen !== f.gen) return; folRetry('unreachable'); return; }
    if (f.closed || gen !== f.gen) return;
    if (!res.ok) {
      let rb = null; try { rb = await res.json(); } catch (e) { rb = null; }
      f.error = refusalWord(res.status, rb);
      folRetry(f.error);
      return;
    }
    // A reply that is not an event stream is not a hub (a web page, a login screen).
    const ctype = String((res.headers && res.headers.get && res.headers.get('content-type')) || '');
    if (ctype.indexOf('text/event-stream') < 0) { f.error = 'notFound'; folRetry('notFound'); return; }
    f.error = null;
    try {
      const reader = res.body.getReader(), dec = new f.Dec();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (f.closed || gen !== f.gen) return;
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, i); buf = buf.slice(i + 2);
          const ev = /^event: (.*)$/m.exec(block), da = /^data: (.*)$/m.exec(block);
          if (!ev || !da) continue;
          let data = null;
          try { data = JSON.parse(da[1]); } catch (e) { data = null; }
          if (data && typeof data === 'object') { folEvent(ev[1], data); if (f.closed || gen !== f.gen) return; }
        }
      }
    } catch (e) { if (f.closed || gen !== f.gen) return; }
    if (f.closed || gen !== f.gen) return;
    folRetry('closed');
  }
  // Takes the hub's time from a message: the offset is what the hub's clock reads minus this device's.
  function folClock(d) {
    if (isNum(d.serverNow)) {
      const off = d.serverNow - realNow();
      // The first time the hub's time is learned, or when it differs by a big step (a wrong or changed device clock), the "never goes backwards" guard is
      // reset to the hub-corrected time; otherwise a fast tablet would stay clamped to its own later time and show every age too old. Small drift keeps
      // the guard, so the shown time does not go backwards in normal use.
      if (!fol.offsetKnown || Math.abs(off - fol.offset) > 2000) { fol.offset = off; fol.offsetKnown = true; lastNow = Math.floor(realNow() + off); } else fol.offset = off;
    }
    fol.lastMsgAt = realNow();
  }
  // Marks the connection good after a snapshot or a resume.
  function folGood() {
    const f = fol;
    if (!f.connected) f.goodSince = realNow();
    f.connected = true; f.everConnected = true; f.error = null; f.retryStep = 0; f.retryInMs = 0; f.resyncs = 0;
    folSettle({ ok: true });
    folNotify(true);
    scheduleNotify();
  }
  // Drops the saved change number so the next connection takes a fresh snapshot, and reconnects at once.
  function folResync() {
    const f = fol;
    f.seq = null; f.hubId = null;
    if (++f.resyncs > 3) { f.error = 'error'; folRetry('error'); return; }
    try { f.ctrl.abort(); } catch (e) { /* ignore */ }
    f.gen++;
    folRetry(null, true);
  }
  // Handles one message from the hub: hello (version), snapshot, op (the next action or tick), resumed, hb.
  function folEvent(name, d) {
    const f = fol;
    folClock(d);
    if (name === 'hello') {
      if (d.proto !== 1 || (isNum(d.minClient) && d.minClient > CLIENT_PROTO)) { f.error = 'wrongVersion'; try { f.ctrl.abort(); } catch (e) { /* ignore */ } folRetry('wrongVersion'); return; }
      f.pendingHub = d.hubId;
      if (f.hub && f.fromCache && f.hubId && d.hubId !== f.hubId) {
        // The hub was reset or replaced while this screen was away: the taps queued from the saved copy belong to a kitchen that is gone.
        for (const p of f.pend) hubRefused(p, 'hubChanged', {}, null);
        f.pend = []; f.queueChecked = true;
        try { U.rawStorage.remove(QUEUE_KEY); U.rawStorage.remove(CACHE_KEY); } catch (e) { /* ignore */ }
      }
      if (f.hub) { f.fromCache = false; hubHello(d); }
    } else if (name === 'snapshot') {
      const v = E().validateBackup(d.state);
      if (!v.ok || !isNum(d.seq)) { folResync(); return; }
      f.base = v.state; f.seq = d.seq; f.hubId = d.hubId || f.pendingHub;
      f.owners = new Map(); f.baseKey = null;
      if (f.hub) { f.fromCache = false; hubAfterSnapshot(d); hubCacheSave(true); }
      folShow();
      syncUnits();
      folGood();
    } else if (name === 'op') {
      if (!isNum(d.seq) || f.seq === null) return;
      if (d.seq <= f.seq) return;                                   // already applied
      if (d.seq !== f.seq + 1 || typeof d.type !== 'string') { folResync(); return; }
      const r = d.type === 'tick' ? { report: 'ok', state: E().tick(f.base, d.now).state } : E().apply(f.base, d.type, d.payload, d.now, { screen: d.screen });
      if (r.report !== 'ok') { folResync(); return; }
      f.base = r.state; f.seq = d.seq;
      if (f.hub && d.type !== 'tick' && d.type !== 'uiReport') {
        f.baseKey = d.opId || 'seq:' + d.seq;
        const tp = undoTop(f.base);
        if (tp && !f.owners.has(tp)) f.owners.set(tp, { key: f.baseKey, mine: d.by === tabId });
        if (f.owners.size > 400) { const live = new Set((f.base.undo || []).map((x) => x.id)); for (const k of Array.from(f.owners.keys())) if (!live.has(k)) f.owners.delete(k); }
      }
      if (f.hub && typeof d.opId === 'string') hubConfirm(d.opId);
      if (f.hub) hubCacheSave(false);
      folShow();
      if (!f.connected) folGood(); else folNotify(false);
      scheduleNotify();
    } else if (name === 'resumed') {
      f.hubId = d.hubId || f.pendingHub;
      if (f.hub) hubAfterResume();
      folGood();
    }
  }


  /* ---------- hub client: a screen that writes through the hub (stage 2) ---------- */
  /*
   * initHubClient({ url, code?, name?, adopt:'hub' | seed:true, ... }) -> Promise<{ ok, error?, status }>. The hub's ordered stream is the truth.
   * A tap is applied at once as a PREDICTION and queued as an action with an opId, sent to the hub one at a time in order. The state shown is
   * the hub's state with the still-unconfirmed taps replayed on top. When the hub answers: applied (the prediction stays until the hub's own
   * stream delivers the action, then the hub's result replaces it), or refused with a reason (the prediction is rolled back and
   * subscribeRefusals fires with plain words). If the link drops the status is 'offline', taps keep queuing (saved in the device's hub queue,
   * key smokebox.v1.hubqueue) and the hub answers each in order on reconnect; the hub's order always wins. Memory only for the kitchen: the
   * device's own saved kitchen is never written or replaced, and leaveHub() restores it. Exactly one of adopt:'hub' (show the hub's kitchen)
   * or seed:true (send this device's kitchen to an EMPTY hub first; refused with notEmpty otherwise) must be given.
   */
  const TOKEN_KEY = 'smokebox.v1.hubtoken';
  // The pairing records kept on this device, one per hub address: { [address]: { token, id, name, owner } }.
  function tokenBook() { try { const b = U.rawStorage.get(TOKEN_KEY, null); return b && b.v === 1 && isObjLike(b.hubs) ? b.hubs : {}; } catch (e) { return {}; } }
  // The pairing record for a hub address, or null.
  const tokenFor = (url) => tokenBook()[normUrl(url)] || null;
  // The headers every call to a hub carries: this build's protocol, and the screen's token or else the shared access code.
  function hubHeaders(url, code, extra) {
    const h = Object.assign({ 'x-smokebox-client': String(CLIENT_PROTO) }, extra || {}), t = tokenFor(url);
    if (t && t.token) h['x-smokebox-token'] = t.token; else if (code) h['x-smokebox-code'] = code;
    return h;
  }
  // The fetch function for hub calls from the options or the page.
  const hubFetch = (opts) => (opts && opts.fetch) || (typeof g.fetch === 'function' ? (u, o) => g.fetch(u, o) : null);
  // Turns a refusal from the hub (its status and JSON) into one of our error words.
  function refusalWord(status, body) {
    const r = body && typeof body === 'object' ? body.report || body.error : '';
    if (['unpaired', 'revoked', 'wrongVersion', 'badPairCode', 'tooManyTries', 'badName', 'notOwner', 'tooMany', 'badCode'].indexOf(r) >= 0) return r;
    return status === 403 || status === 429 ? 'badCode' : status === 404 ? 'notFound' : status === 426 ? 'wrongVersion' : status === 503 ? 'tooMany' : 'error';
  }
  // Pairs this device with a hub: exchanges the one-time pairing code (and a screen name) for a token kept on this device. Resolves { ok, error?, name, owner, id }.
  async function pairHub(opts) {
    opts = opts || {};
    const fetchFn = hubFetch(opts);
    if (typeof opts.url !== 'string' || !fetchFn) return { ok: false, error: 'notFound' };
    const url = normUrl(opts.url);
    let res, b = null;
    try {
      res = await fetchFn(url + '/pair', { method: 'POST', headers: { 'content-type': 'application/json', 'x-smokebox-client': String(CLIENT_PROTO) }, cache: 'no-store', body: JSON.stringify({ code: String(opts.code || ''), name: typeof opts.name === 'string' ? opts.name : '' }) });
      try { b = await res.json(); } catch (e) { b = null; }
    } catch (e) { return { ok: false, error: 'unreachable' }; }
    if (!res.ok || !b || b.ok !== true || typeof b.token !== 'string') return { ok: false, error: refusalWord(res.status, b), reason: FOLLOW_REASON[refusalWord(res.status, b)] || '' };
    try {
      const hubs = Object.assign({}, tokenBook());
      hubs[url] = { token: b.token, id: b.screen.id, name: b.screen.name || '', owner: !!b.screen.owner };
      U.rawStorage.set(TOKEN_KEY, { v: 1, hubs });
    } catch (e) { return { ok: false, error: 'error' }; }
    return { ok: true, name: b.screen.name || '', owner: !!b.screen.owner, id: b.screen.id };
  }
  // Whether this device is paired with a hub address, and as what (never the token itself).
  function pairedFor(url) { const t = tokenFor(url); return t ? { paired: true, name: t.name, owner: t.owner, id: t.id } : { paired: false, name: '', owner: false, id: null }; }
  // Forgets the pairing for a hub address on this device only (the hub's list is not changed; an owner removes screens there).
  function unpair(url) {
    try { const hubs = Object.assign({}, tokenBook()); const had = !!hubs[normUrl(url)]; delete hubs[normUrl(url)]; if (Object.keys(hubs).length) U.rawStorage.set(TOKEN_KEY, { v: 1, hubs }); else U.rawStorage.remove(TOKEN_KEY); return had; } catch (e) { return false; }
  }
  // A call to the owner's routes on the hub with this device's token. Resolves { ok, ... } or { ok:false, error }.
  async function ownerCall(opts, method, p, body) {
    opts = opts || {};
    const fetchFn = hubFetch(opts);
    if (typeof opts.url !== 'string' || !fetchFn) return { ok: false, error: 'notFound' };
    if (!tokenFor(opts.url)) return { ok: false, error: 'unpaired' };
    try {
      const res = await fetchFn(normUrl(opts.url) + p, { method, headers: hubHeaders(opts.url, '', body ? { 'content-type': 'application/json' } : {}), cache: 'no-store', body: body ? JSON.stringify(body) : undefined });
      let b = null; try { b = await res.json(); } catch (e) { b = null; }
      if (!res.ok || !b || b.ok !== true) return { ok: false, error: refusalWord(res.status, b) };
      return b;
    } catch (e) { return { ok: false, error: 'unreachable' }; }
  }
  // The paired screens of a hub (owner screens only).
  const hubScreens = (opts) => ownerCall(opts, 'GET', '/screen/list');
  // A new one-time pairing code for another screen (owner screens only): { ok, code, minutes }.
  const hubNewPairingCode = (opts) => ownerCall(opts, 'POST', '/screen/pair', {});
  // Removes a screen from the hub (owner screens only); it is cut off at once.
  const hubRemoveScreen = (opts) => ownerCall(opts, 'POST', '/screen/revoke', { id: opts && opts.id });
  const QUEUE_KEY = 'smokebox.v1.hubqueue';
  const CACHE_KEY = 'smokebox.v1.hubcache', CACHE_MAX = 1500000;      // the last hub snapshot kept on the device, and the most characters it may use
  // Keeps the hub's latest state on the device (not the shown state) so a reload while the hub is unreachable can show the last known kitchen.
  // Throttled (see below) unless forced; skipped when it would be bigger than the cap; the browser refusing it is not an error.
  function hubCacheSave(force) {
    const f = fol;
    if (!f || !f.hub || !f.base || f.hubId == null || !isNum(f.seq)) return;
    // A small kitchen is kept at most every 2 seconds, a big one every 15, so saving never costs the board anything noticeable.
    if (!force && realNow() - f.cacheAt < (f.cacheBytes > 200000 ? 15000 : 2000)) { f.cacheDirty = true; return; }
    f.cacheAt = realNow(); f.cacheDirty = false;
    try {
      const rec = { v: 1, url: f.url, hubId: f.hubId, seq: f.seq, savedAt: realNow(), offset: Math.round(f.offset), state: f.base };
      f.cacheBytes = JSON.stringify(rec).length;
      if (f.cacheBytes > CACHE_MAX) { U.rawStorage.remove(CACHE_KEY); return; }
      U.rawStorage.set(CACHE_KEY, rec);
    } catch (e) { /* the copy is a convenience only */ }
  }
  // Reads the saved hub snapshot for this address, checked like a backup, or null.
  function loadHubCache(url) {
    try {
      const c = U.rawStorage.get(CACHE_KEY, null);
      if (!c || c.v !== 1 || c.url !== normUrl(url) || typeof c.hubId !== 'string' || !isNum(c.seq) || !isNum(c.savedAt)) return null;
      const v = E().validateBackup(c.state);
      return v.ok ? { state: v.state, hubId: c.hubId, seq: c.seq, savedAt: c.savedAt, offset: isNum(c.offset) ? c.offset : 0 } : null;
    } catch (e) { return null; }
  }
  // How many taps this screen has sent or queued that the hub has not answered yet.
  const hubQueued = () => (fol ? fol.pend.filter((p) => !p.answered).length : 0);
  // The status word for a hub client: connecting, connected, sending (taps not yet answered), offline, or error.
  function hubState() {
    const f = fol;
    if (FOLLOW_FATAL[f.error]) return 'error';
    if (!f.everConnected) return 'connecting';
    if (!f.connected || (f.sendFail && hubQueued() > 0) || folStale()) return 'offline';
    return hubQueued() > 0 ? 'sending' : 'connected';
  }
  // What a screen shows about the hub connection: state, address, screen name, last message, unanswered taps, error words, clock offset.
  function hubStatus() {
    if (!fol || !fol.hub) return { mode: 'off', state: 'off', url: '', name: '', lastUpdate: null, lastOk: null, queued: 0, unsent: 0, error: null, reason: '', seq: null, hubId: null, offsetMs: 0, connected: false };
    const q = hubQueued(), st = hubState();
    return { mode: 'hub', state: st, url: fol.url, name: fol.name, lastUpdate: fol.lastMsgAt, lastOk: fol.lastMsgAt, queued: q, unsent: q, error: fol.error, reason: fol.error ? (FOLLOW_REASON[fol.error] || FOLLOW_REASON.error) : '',
      seq: fol.seq, hubId: fol.hubId, offsetMs: Math.round(fol.offset), connected: st === 'connected' || st === 'sending', lastKnown: !!fol.fromCache, lastKnownAt: fol.fromCache ? fol.cachedAt : null, paired: !!tokenFor(fol.url), owner: !!(tokenFor(fol.url) && tokenFor(fol.url).owner) };
  }
  // True when this store is a screen that writes through a hub.
  const isHubClient = () => !!fol && fol.hub;
  // Registers fn for refusals; returns a remover. fn gets { opId, type, payload, report, info, text, at, ticketId?, batchId?, orderId? }.
  function subscribeRefusals(fn) { if (typeof fn !== 'function') return () => {}; refusalSubs.add(fn); return () => refusalSubs.delete(fn); }
  // Tells the refusal subscribers that one tap was not applied, with the plain words for the reason.
  function hubRefused(p, report, info, words) {
    const text = words || (E().describe ? E().describe(report, info || {}) : report);
    const pl = isObjLike(p.payload) ? p.payload : {};
    const o = { opId: p.opId, type: p.type, payload: p.payload, report, info: info || {}, text, at: now() };
    if (typeof pl.ticketId === 'string') o.ticketId = pl.ticketId;
    if (typeof pl.batchId === 'string') o.batchId = pl.batchId;
    if (typeof pl.orderId === 'string') o.orderId = pl.orderId;
    refusalSubs.forEach((fn) => { try { fn(o); } catch (e) { if (g.console) console.error('[smokebox] refusal subscriber failed', e); } });
  }
  // Which tickets, batches and orders have taps the hub has not confirmed yet (from the queued taps' payloads).
  function pendingFor() {
    const out = { tickets: [], batches: [], orders: [] };
    if (!fol || !fol.hub) return out;
    for (const p of fol.pend) {
      const pl = isObjLike(p.payload) ? p.payload : {};
      if (typeof pl.ticketId === 'string' && out.tickets.indexOf(pl.ticketId) < 0) out.tickets.push(pl.ticketId);
      if (typeof pl.batchId === 'string' && out.batches.indexOf(pl.batchId) < 0) out.batches.push(pl.batchId);
      if (typeof pl.orderId === 'string' && out.orders.indexOf(pl.orderId) < 0) out.orders.push(pl.orderId);
    }
    return out;
  }
  // Saves the unconfirmed taps (and which hub they belong to) so a reload does not lose them; removes the key when there are none.
  function hubSaveQueue() {
    const f = fol;
    if (!f || !f.hub || !f.queueChecked) return;
    try {
      if (!f.pend.length) U.rawStorage.remove(QUEUE_KEY);
      else U.rawStorage.set(QUEUE_KEY, { v: 1, url: f.url, hubId: f.hubId, entries: f.pend.map((p) => ({ opId: p.opId, type: p.type, payload: p.payload, now: p.now })) });
    } catch (e) { /* the queue still lives in memory */ }
  }
  // Shows the hub's state with the unconfirmed taps replayed on top (a tap that no longer fits is skipped; the hub will refuse it).
  function folShow() {
    const f = fol;
    if (!f || !f.base) return;
    let s = f.base;
    // A kitchen shown from the saved copy has no ticks coming from the hub, so time-driven changes are worked out here for display only.
    if (f.fromCache) s = E().tick(s, now()).state;
    if (f.hub) {
      f.pend = f.pend.filter((p) => !(p.answered && isNum(p.seq) && isNum(f.seq) && p.seq <= f.seq));
      // Who made the newest undo entry, and which action is the last one: an undo is only offered for the last action of the whole kitchen.
      let owner = f.owners.get(undoTop(f.base)) || null, lastKey = f.baseKey;       // owner: { key, mine }
      for (const p of f.pend) {
        const r = E().apply(s, p.type, p.payload, Math.max(p.now, lastStamp(s)), { screen: f.name });
        if (r.report !== 'ok') continue;
        const before = undoTop(s);
        s = r.state;
        if (p.type === 'uiReport') continue;
        lastKey = p.opId;
        owner = p.type === 'undo' ? null : (undoTop(s) !== before ? { key: p.opId, mine: true } : owner);
      }
      f.topOwner = owner; f.lastActKey = lastKey;
    }
    const same = state && s.settings === state.settings;
    state = s;
    if (!same) syncUnits();
    scheduleNotify();
  }
  // The id of the newest undo entry in a state, or null.
  function undoTop(st) { const u = st && st.undo; return Array.isArray(u) && u.length ? u[u.length - 1].id : null; }
  // The hub's own stream delivered an action: if it is one of ours, the hub's result replaces our prediction.
  function hubConfirm(opId) {
    const f = fol;
    const i = f.pend.findIndex((p) => p.opId === opId);
    if (i >= 0) { f.pend.splice(i, 1); hubSaveQueue(); }
  }
  // After a snapshot: drop taps the hub already applied (its recent action ids, or its change number for answered ones).
  function hubAfterSnapshot(d) {
    const f = fol;
    const ids = new Set(Array.isArray(d.opIds) ? d.opIds : []);
    f.pend = f.pend.filter((p) => !ids.has(p.opId) && !(p.answered && isNum(p.seq) && p.seq <= d.seq));
    hubSaveQueue();
  }
  // After a resume the missed actions arrived as ops, which already confirmed ours; nothing more to do.
  function hubAfterResume() { hubSaveQueue(); }
  // First message from the hub: bring back the saved queue if it belongs to this hub and history, else tell the screen it was dropped.
  function hubHello(d) {
    const f = fol;
    if (f.queueChecked) return;
    let q = null;
    try { q = U.rawStorage.get(QUEUE_KEY, null); } catch (e) { q = null; }
    f.queueChecked = true;
    if (!q || !Array.isArray(q.entries) || !q.entries.length) return;
    if (q.url === f.url && q.hubId === d.hubId) {
      const have = new Set(f.pend.map((p) => p.opId));
      for (const e of q.entries) if (e && typeof e.opId === 'string' && typeof e.type === 'string' && isNum(e.now) && !have.has(e.opId)) f.pend.push({ opId: e.opId, type: e.type, payload: e.payload, now: e.now, answered: false });
    } else {
      for (const e of q.entries) if (e && typeof e.opId === 'string') hubRefused(e, 'hubChanged', {}, null);
      try { U.rawStorage.remove(QUEUE_KEY); } catch (e) { /* ignore */ }
    }
  }
  // A tap in hub mode: predicted on the shown state, queued, and sent to the hub in order. Returns the same shape as a normal dispatch.
  function hubDispatch(type, payload) {
    const f = fol;
    // Records and returns one answer for a tap that was not queued.
    const mk = (report, info) => { last = { type: typeof type === 'string' ? type : String(type), report, info: info || {}, events: [], opId: null }; return { report, info: info || {}, events: [], opId: null }; };
    if (type === 'resetLive') return mk('hubKitchen');
    if (!f.base || !f.queueChecked) return mk('hubConnecting');
    const n = now();
    // An undo names the action it takes back; it is offered only for the last action of the whole kitchen, never someone else's.
    if (type === 'undo') {
      if (!f.topOwner || !f.topOwner.mine || f.topOwner.key !== f.lastActKey) { const a = mk('undoElsewhere'); hubLogRefusal('undo', 'undoElsewhere'); return a; }
      payload = { ofOpId: f.topOwner.key };
    }
    const r = E().apply(state, type, payload, n, { screen: f.name });
    const opId = tabId + ':' + (++opN);
    last = { type: typeof type === 'string' ? type : String(type), report: r.report, info: r.info, events: r.events, opId };
    if (r.report === 'ok' && r.state !== state) {
      f.pend.push({ opId, type, payload, now: n, answered: false });
      hubSaveQueue();
      state = r.state;
      scheduleNotify();
      folNotify(false);
      folSend();
    } else if (r.report !== 'ok' && r.report !== 'nothingToDo' && type !== 'uiReport') hubLogRefusal(type, r.report);
    return { report: r.report, info: r.info, events: r.events, opId };
  }
  // A refused tap is written to the kitchen's log as a screen report (like in a normal kitchen), so the pilot's count of refused taps is right.
  function hubLogRefusal(type, report) {
    const f = fol;
    if (!f || !f.base || !f.queueChecked) return;
    const n = now(), payload = { action: String(type).slice(0, 40) || '?', report };
    const r = E().apply(state, 'uiReport', payload, n, { screen: f.name });
    if (r.report !== 'ok') return;
    f.pend.push({ opId: tabId + ':' + (++opN), type: 'uiReport', payload, now: n, answered: false });
    hubSaveQueue();
    state = r.state;
    scheduleNotify();
    folSend();
  }
  // Sends the oldest unanswered tap to the hub and handles its answer: applied (kept until the hub's stream delivers it), refused (rolled
  // back and reported), or no answer (offline: retry later with 1, 2, 4, 8, then 15 seconds; the hub answers a repeated opId the same way).
  async function folSend() {
    const f = fol;
    if (!f || !f.hub || f.closed || f.sending || FOLLOW_FATAL[f.error] || f.sendRetryAt > realNow()) return;
    const next = f.pend.find((p) => !p.answered);
    if (!next || !f.fetchFn) return;
    f.sending = true;
    let res = null, body = null;
    try {
      res = await f.fetchFn(f.url + '/action', { method: 'POST', headers: hubHeaders(f.url, '', { 'content-type': 'application/json' }), cache: 'no-store',
        body: JSON.stringify({ type: next.type, payload: next.payload, opId: next.opId, clientId: tabId, who: f.name, at: next.now, code: f.code }) });
      try { body = await res.json(); } catch (e) { body = null; }
    } catch (e) { res = null; }
    f.sending = false;
    if (fol !== f || f.closed) return;
    if (res && (res.status === 403 || res.status === 429 || res.status === 426)) { f.error = refusalWord(res.status, body); folNotify(true); return; }
    if (!res || res.status >= 500 || !body || typeof body !== 'object') {
      f.sendFail = true; f.sendRetryAt = realNow() + Math.min(15000, 1000 * Math.pow(2, f.sendStep++));
      folNotify(false);
      return;
    }
    f.sendFail = false; f.sendStep = 0; f.sendRetryAt = 0;
    const i = f.pend.indexOf(next);
    if (i >= 0) {
      if (body.ok === true || body.report === 'ok') { next.answered = true; next.seq = isNum(body.seq) ? body.seq : null; if (isNum(f.seq) && isNum(next.seq) && next.seq <= f.seq) f.pend.splice(i, 1); }
      else { f.pend.splice(i, 1); hubRefused(next, typeof body.report === 'string' ? body.report : 'badPatch', body.info, typeof body.words === 'string' ? body.words : null); if (next.type !== 'uiReport') { folShow(); hubLogRefusal(next.type, typeof body.report === 'string' ? body.report : 'badPatch'); } }
      hubSaveQueue();
      folShow();
    }
    folNotify(false);
    if (f.pend.some((p) => !p.answered)) setTimeout(folSend, 0);
  }
  // Reads the hub's address and says whether it is a Smokebox hub, which code is needed and whether it is empty, without joining it.
  async function probeHub(opts) {
    opts = opts || {};
    const fetchFn = opts.fetch || (typeof g.fetch === 'function' ? (u, o) => g.fetch(u, o) : null);
    if (typeof opts.url !== 'string' || !fetchFn) return { ok: false, error: 'notFound' };
    const code = codeFor(opts);
    let res;
    try { res = await fetchFn(opts.url.replace(/\/+$/, '') + '/probe', { cache: 'no-store', headers: hubHeaders(opts.url, code) }); } catch (e) { return { ok: false, error: 'unreachable' }; }
    if (res.status === 403 || res.status === 429 || res.status === 426) { let pb = null; try { pb = await res.json(); } catch (e) { pb = null; } return { ok: false, error: refusalWord(res.status, pb), tokensRequired: !!(pb && pb.tokensRequired) }; }
    if (res.status === 404) return { ok: false, error: 'notFound' };
    if (res.status === 503) return { ok: false, error: 'tooMany' };
    let b = null;
    try { b = await res.json(); } catch (e) { b = null; }
    if (!res.ok || !b || typeof b !== 'object' || !('proto' in b)) return { ok: false, error: res.ok ? 'notFound' : 'error' };
    if (b.proto !== 1) return { ok: false, error: 'wrongVersion' };
    if (isNum(b.minClient) && b.minClient > CLIENT_PROTO) return { ok: false, error: 'wrongVersion' };
    return { ok: true, empty: b.empty === true, hubId: b.hubId, tokensRequired: b.tokensRequired === true };
  }
  // Joins a hub as a screen that writes through it. See the section comment above for the two choices and what is never touched.
  async function initHubClient(opts) {
    opts = opts || {};
    // Builds the answer for a join that did not happen.
    const fail = (error) => ({ ok: false, error, status: hubStatus() });
    if (typeof opts.url !== 'string') return fail('notFound');
    if ((opts.adopt === 'hub') === (opts.seed === true)) return fail('choiceRequired');
    // The screen name is plain: letters, digits, spaces and a few marks, up to 20 characters; anything else is refused, not trimmed away.
    if (opts.name != null && (typeof opts.name !== 'string' || (opts.name.trim() !== '' && !/^[\p{L}\p{N} .,'&()#_-]{1,20}$/u.test(opts.name.trim())))) return fail('badName');
    if (fol) return fail('error');
    const probe = await probeHub(opts);
    if (!probe.ok) {
      // A reload while the hub is unreachable: the last known kitchen is shown from the saved copy, taps are queued, and it keeps trying.
      const c = probe.error === 'unreachable' && opts.adopt === 'hub' ? loadHubCache(opts.url) : null;
      if (c) return folBegin(opts, true, c);
      return fail(probe.error);
    }
    if (opts.seed === true) {
      if (!probe.empty) return fail('notEmpty');
      if (!state) return fail('error');
      const fetchFn = opts.fetch || (typeof g.fetch === 'function' ? (u, o) => g.fetch(u, o) : null);
      let res, b = null;
      try {
        res = await fetchFn(opts.url.replace(/\/+$/, '') + '/seed', { method: 'POST', headers: hubHeaders(opts.url, '', { 'content-type': 'application/json' }), cache: 'no-store', body: JSON.stringify({ state, code: codeFor(opts) }) });
        try { b = await res.json(); } catch (e) { b = null; }
      } catch (e) { return fail('unreachable'); }
      if (res.status === 403 || res.status === 429 || res.status === 426) return fail(refusalWord(res.status, b));
      if (res.status === 409) return fail('notEmpty');
      if (!res.ok || !b || b.ok !== true) return fail('error');
      try { U.rawStorage.remove(CACHE_KEY); U.rawStorage.remove(QUEUE_KEY); } catch (e) { /* ignore */ }
    }
    return folBegin(opts, true);
  }
  // Leaves the hub: refuses while taps are unanswered unless force is true; then restarts the store on the device's own saved kitchen.
  async function leaveHub(opts) {
    if (!fol || !fol.hub) return { ok: false, error: 'notInHub' };
    const q = hubQueued();
    if (q > 0 && !(opts && opts.force === true)) return { ok: false, error: 'pending', pending: q };
    try { U.rawStorage.remove(QUEUE_KEY); U.rawStorage.remove(CACHE_KEY); } catch (e) { /* ignore */ }
    init(lastInit || {});
    return { ok: true };
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
    const wantSample = !!(opts && opts.sample) && !(strict && mode === 'real'); // sample history belongs to the demo only
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

  // The kitchen this page shows: 'real' or 'demo'.
  function modeNow() { return mode; }
  // True while this tab is in the demo kitchen, false in the real one.
  function isDemo() { return mode === 'demo'; }
  // True when the start-up named the mode, so the demo and the real kitchen are kept apart (plain tests start without it).
  function isolated() { return strict; }
  // Reloads the page (or calls the reload hook given to init). Returns true when a reload was asked for.
  function reloadPage() {
    try { if (reloadFn) { reloadFn(); return true; } if (g.location && typeof g.location.reload === 'function') { g.location.reload(); return true; } } catch (e) { /* ignore */ }
    return false;
  }
  // Switches this tab to the demo: saves the real kitchen first, remembers the choice for this tab only, and reloads.
  // The real data is not touched again while the tab is in the demo. Returns false when already in the demo or the
  // browser cannot remember the choice.
  function enterDemo() {
    if (fol) return false;
    if (mode === 'demo' || !state) return false;
    flush();
    try { g.sessionStorage.setItem(U.MODE_KEY, 'demo'); } catch (e) { return false; }
    reloadPage();
    return true;
  }
  // Leaves the demo: throws away everything the demo saved, forgets the choice, stops this tab saving, and reloads into
  // the real kitchen. Returns false when not in the demo.
  function leaveDemo() {
    if (fol) return false;
    if (mode !== 'demo') return false;
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    dirty = false; storage = null; // nothing more may be saved from this tab
    try { for (const k of baseStorage.keys ? baseStorage.keys('smokebox.demo.') : []) baseStorage.remove(k); } catch (e) { /* ignore */ }
    try { g.sessionStorage.removeItem(U.MODE_KEY); } catch (e) { /* ignore */ }
    try { if (g.location && /[?&]demo(=|&|$)/.test(g.location.search || '') && g.history && g.history.replaceState) g.history.replaceState(null, '', g.location.pathname + g.location.hash); } catch (e) { /* ignore */ }
    reloadPage();
    return true;
  }
  // Gives a brand-new empty kitchen neutral station and menu-section names instead of the barbecue ones (Pit, Meats ...),
  // through the owner-names mechanism, so they are saved with the kitchen and carried in backups. Does nothing in the demo,
  // in a kitchen that has dishes or began from the sample, or when the owner already chose names. Returns true when applied.
  function applyStarterNames() {
    const C = SB.config;
    if (!state || mode === 'demo' || state.catalog !== 'own' || !C || typeof C.applyCustom !== 'function' || typeof C.customSpec !== 'function') return false;
    if (state.menu.some((m) => !m.archived)) return false;
    try {
      const cur = C.customSpec();
      // True when a part of the saved names holds at least one rename or added entry.
      const used = (o) => o && typeof o === 'object' && Object.keys(o).some((k) => (Array.isArray(o[k]) ? o[k].length : o[k] && typeof o[k] === 'object' && Object.keys(o[k]).length));
      if (used(cur.rename) || used(cur.add)) return false;
      const res = C.applyCustom(STARTER_NAMES);
      if (res.rejected.length) { C.applyCustom(cur); return false; }
      return C.saveCustom(STARTER_NAMES) !== false;
    } catch (e) { return false; }
  }
  // Saves the half-built order from the New ticket screen (any plain JSON object the screen can rebuild from). Returns true when
  // saved; false when it is not a plain object, too big (20,000 characters) or the browser refuses. Not part of backups.
  // In the demo it is saved under the demo's own key. A successful createTicket by a person clears it.
  function saveDraft(draft) {
    if (!storage || !draft || typeof draft !== 'object' || Array.isArray(draft)) return false;
    try {
      const rec = { v: 1, at: realNow(), draft };
      if (JSON.stringify(rec).length > DRAFT_MAX_CHARS) return false;
      return storage.set(DRAFT_KEY, rec) !== false;
    } catch (e) { return false; }
  }
  // The saved half-built order, or null when there is none, it is older than 12 hours, or the saved text is damaged (a damaged
  // or stale draft is removed). Returns a copy the screen may change.
  function loadDraft() {
    if (!storage) return null;
    try {
      let rec = null;
      try { rec = storage.get(DRAFT_KEY, null); } catch (e) { rec = null; }
      if (rec == null) { if (storage.raw && storage.raw(DRAFT_KEY) != null) storage.remove(DRAFT_KEY); return null; }
      const ok = rec && typeof rec === 'object' && rec.v === 1 && isNum(rec.at) && rec.draft && typeof rec.draft === 'object' && !Array.isArray(rec.draft)
        && realNow() - rec.at <= DRAFT_MAX_AGE_MS && rec.at <= realNow() + DRAFT_MAX_AGE_MS && JSON.stringify(rec).length <= DRAFT_MAX_CHARS;
      if (!ok) { storage.remove(DRAFT_KEY); return null; }
      return JSON.parse(JSON.stringify(rec.draft));
    } catch (e) { return null; }
  }
  // Throws the saved half-built order away (the order was sent or cancelled).
  function clearDraft() { try { if (storage) storage.remove(DRAFT_KEY); } catch (e) { /* ignore */ } }
  // The SHA-256 of text as 64 hex characters, or null when this browser has no secure hashing. Asynchronous.
  async function sha256Hex(text) {
    const c = g.crypto && g.crypto.subtle;
    if (!c || typeof c.digest !== 'function' || typeof TextEncoder === 'undefined') return null;
    const buf = await c.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map((b) => (b < 16 ? '0' : '') + b.toString(16)).join('');
  }
  // A recovery code as typed (any case, spaces and dashes allowed) made into its plain form, or '' when it cannot be a code.
  function normalizeCode(text) {
    const t = String(text == null ? '' : text).toUpperCase().replace(/[\s-]+/g, '');
    return t.length === 10 && t.split('').every((ch) => RECOVERY_ALPHABET.indexOf(ch) >= 0) ? t : '';
  }
  // The stored form of a recovery code: a salted SHA-256 (only this is ever saved, never the code).
  async function hashCode(plain) {
    const hex = await sha256Hex('smokebox-recovery-v1:' + plain);
    return hex === null ? null : 'sha256:' + hex;
  }
  // True when a back office PIN is set.
  const hasPin = () => !!(state && state.settings && state.settings.office && state.settings.office.pinHash);
  // True when a recovery code has been made for the current PIN.
  function hasRecoveryCode() { return !!(state && state.settings && state.settings.office && state.settings.office.recoveryHash); }
  // Makes a new recovery code for the current PIN, saves only its hash in the settings, and returns the code once as { ok, code }
  // ("ABCDE-FGHJK") for the screen to show and the owner to write down. Any earlier code stops working. Needs a PIN
  // (pinRequired); works for a PIN that was set before recovery codes existed. The code is never stored or logged.
  async function createRecoveryCode() {
    if (!state) return { ok: false, report: 'invalidBackup', info: {} };
    if (!hasPin()) return { ok: false, report: 'pinRequired', info: {} };
    const bytes = new Uint8Array(10);
    if (!g.crypto || typeof g.crypto.getRandomValues !== 'function') return { ok: false, report: 'noCrypto', info: {} };
    g.crypto.getRandomValues(bytes);
    const plain = Array.from(bytes).map((b) => RECOVERY_ALPHABET[b % 32]).join('');
    const hash = await hashCode(plain);
    if (hash === null) return { ok: false, report: 'noCrypto', info: {} };
    const rep = dispatch('updateSettings', { patch: { office: { recoveryHash: hash } } }, { source: 'user' });
    if (rep !== 'ok') return { ok: false, report: rep, info: {} };
    persistNow();
    return { ok: true, report: 'ok', code: plain.slice(0, 5) + '-' + plain.slice(5), info: {} };
  }
  // Uses a recovery code to reset the back office PIN. newPinHash is the new PIN's hash (the same form the PIN screen saves) or null
  // to remove the PIN. A wrong code is counted: after 5 wrong codes it is locked for 15 minutes, even for the right code, and the
  // count survives a reload. The right code is spent (a new one can be made once the new PIN is set). Returns { ok, report, info }.
  async function recoverPin(code, newPinHash) {
    if (!state) return { ok: false, report: 'invalidBackup', info: {} };
    if (newPinHash !== null && !(typeof newPinHash === 'string' && newPinHash.length > 0 && newPinHash.length <= 128)) return { ok: false, report: 'badPatch', info: { key: 'newPinHash' } };
    if (!hasRecoveryCode()) return { ok: false, report: 'noRecoveryCode', info: {} };
    const t = realNow();
    let rec = { fails: 0, until: 0 };
    try { const r = storage ? storage.get(RECOVERY_KEY, null) : null; if (r && typeof r === 'object' && isNum(r.fails) && isNum(r.until)) rec = { fails: Math.max(0, Math.floor(r.fails)), until: r.until }; } catch (e) { rec = { fails: 0, until: 0 }; }
    if (rec.until > t) return { ok: false, report: 'recoveryLocked', info: { waitMs: rec.until - t } };
    if (rec.until && rec.until <= t) rec = { fails: 0, until: 0 };
    const plain = normalizeCode(code);
    const hash = plain ? await hashCode(plain) : null;
    if (plain && hash === null) return { ok: false, report: 'noCrypto', info: {} };
    const stored = state.settings.office.recoveryHash;
    if (!plain || hash !== stored) {
      rec.fails++;
      const locked = rec.fails >= RECOVERY_TRIES;
      if (locked) rec = { fails: 0, until: t + RECOVERY_LOCK_MS };
      try { if (storage) storage.set(RECOVERY_KEY, rec); } catch (e) { /* the count is kept in memory only */ }
      return locked ? { ok: false, report: 'recoveryLocked', info: { waitMs: RECOVERY_LOCK_MS } } : { ok: false, report: 'wrongRecoveryCode', info: { triesLeft: RECOVERY_TRIES - rec.fails } };
    }
    const rep = dispatch('updateSettings', { patch: { office: { pinHash: newPinHash, recoveryHash: null } } }, { source: 'user' });
    if (rep !== 'ok' && rep !== 'nothingToDo') return { ok: false, report: rep, info: {} };
    try { if (storage) storage.remove(RECOVERY_KEY); } catch (e) { /* ignore */ }
    persistNow();
    return { ok: true, report: 'ok', info: { pinRemoved: newPinHash === null } };
  }
  // Starts the real kitchen over with an empty menu. Needs opts.confirm to be the typed word (SB.store.START_OVER_WORD, any case),
  // refuses in the demo, and takes a full backup first: if the backup cannot be made nothing is cleared. Then it clears dishes,
  // ingredients, stock, batches, tickets, orders and history (resetLive, catalog 'blank') and the setup-progress choices, so the
  // kitchen is exactly like a brand-new install. opts.keepSettings (default true) keeps tax, hours, PIN, units and station names;
  // false resets those too. Returns { ok, report, info, backup? } with backup { text, filename, mime, savedAt, chars } for the
  // screen to download; the old last good copy and any set-aside damaged copy are dropped after the erase and the last good copy is retaken from the empty kitchen, so a damaged save can never bring the erased kitchen back.
  // WATCH OUT: the demo's keys are never read or written here.
  function startOver(opts) {
    opts = opts || {};
    // Records and returns a refusal; nothing has been changed when this is used.
    const fail = (report, info) => { last = { type: 'startOver', report, info: info || {}, events: [] }; return { ok: false, report, info: info || {} }; };
    if (!state) return fail('invalidBackup');
    if (fol) return fail(fol.hub ? 'hubKitchen' : 'followerReadOnly');
    if (mode === 'demo') return fail('notInDemo');
    if (typeof opts.confirm !== 'string' || opts.confirm.trim().toUpperCase() !== START_OVER_WORD) return fail('confirmWord', { word: START_OVER_WORD });
    if (opts.keepSettings != null && typeof opts.keepSettings !== 'boolean') return fail('badPatch', { key: 'keepSettings' });
    const keep = opts.keepSettings !== false;
    const text = exportAll();
    if (text == null) { const lr = last || {}; return fail(lr.report || 'invalidBackup', lr.info); }
    const savedAt = realNow();
    const rep = resetLive({ keepSettings: keep, catalog: 'blank', replaceOwn: true, starter: false });
    if (rep !== 'ok') return fail(rep);
    for (const k of START_OVER_KEYS) { try { storage.remove(k); } catch (e) { /* ignore */ } }
    // Only now that the erase went in: the rolling last-good copy and any set-aside damaged copy still hold the old kitchen's
    // customers and orders, so both are dropped and the last-good copy is retaken from the new empty kitchen.
    try { storage.remove(LASTGOOD_KEY); storage.remove(CORRUPT_KEY); storage.remove(CORRUPT_AT_KEY); } catch (e) { /* ignore */ }
    st.corrupt = null;
    // Actions queued for a hub that it never confirmed belong to the erased kitchen: they are dropped (and marked, so another
    // tab's saved copy cannot bring them back), and only the erase itself stays in the queue so the hub is told. Nothing queued
    // is touched when the erase failed, because we returned above.
    const ri = outbox.map((x) => x.type).lastIndexOf('resetLive');
    for (const x of outbox.slice(0, ri < 0 ? outbox.length : ri)) acked.add(x.opId);
    outbox = ri < 0 ? [] : outbox.slice(ri);
    if (ri < 0) { try { storage.remove(OUTBOX_KEY); } catch (e) { /* ignore */ } } else saveOutbox();
    snapWanted = 'startOver'; persistNow(); maybeSnapshot(savedAt);
    if (!keep && SB.config && typeof SB.config.applyCustom === 'function') {
      try { SB.config.applyCustom({}); SB.config.saveCustom({ rename: {}, add: {} }); } catch (e) { /* the names stay as they were */ }
    }
    if (!keep) applyStarterNames();
    last = { type: 'startOver', report: 'ok', info: { keepSettings: keep }, events: [] };
    const d = new Date(savedAt);
    // Two-digit number for the file name.
    const pad = (n) => (n < 10 ? '0' : '') + n;
    return { ok: true, report: 'ok', info: { keepSettings: keep }, backup: { text, filename: 'smokebox-before-start-over-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes()) + '.json', mime: 'application/json', savedAt, chars: text.length } };
  }
  // Counts the old demo and sample tickets in this kitchen's real reports (see the engine's demoLeftovers), and whether the
  // owner already chose to keep them. In the demo it counts nothing (demo tickets belong there). { tickets, orders, paidOrders,
  // openOrders, mixedOrders, events, kept, offer } where offer is true when there is something to clear and no "keep" answer yet.
  function demoLeftovers() {
    const c = state && mode !== 'demo' ? E().demoLeftovers(state) : { tickets: 0, orders: 0, paidOrders: 0, openOrders: 0, mixedOrders: 0, events: 0 };
    let kept = false;
    try { kept = !!(storage && storage.get(KEPT_KEY, false) === true); } catch (e) { kept = false; }
    return Object.assign(c, { kept, offer: (c.tickets > 0 || c.orders > 0) && !kept });
  }
  // Remembers that the owner chose to keep the old demo tickets, so the offer is not made again. Returns true when saved.
  function keepDemoLeftovers() {
    try { return !!storage && mode !== 'demo' && storage.set(KEPT_KEY, true) !== false; } catch (e) { return false; }
  }
  // Removes the old demo and sample tickets (the engine action clearDemoTickets) and saves. Refuses in the demo. Returns
  // { ok, report, info } where info has the counts removed.
  function clearDemoLeftovers() {
    if (!state) return { ok: false, report: 'invalidBackup', info: {} };
    if (mode === 'demo') return { ok: false, report: 'notInDemo', info: {} };
    const r = dispatchEx('clearDemoTickets', {}, { source: 'user' });
    if (r.report === 'ok') persistNow();
    return { ok: r.report === 'ok', report: r.report, info: r.info || {} };
  }
  // True while this kitchen began empty and still has no dish on the menu (archived dishes do not count): the setup
  // screens use it to know a first-time owner is looking at an empty kitchen. False for old saves and the demo.
  function isBlank() {
    return !!(state && state.catalog === 'own' && !state.menu.some((m) => !m.archived));
  }
  // True when this kitchen began empty (the sample dishes were never loaded into it), even after dishes were added.
  function isOwn() { return !!(state && state.catalog === 'own'); }

  // Public API: init, destroy, status, getState, now, tick, dispatch, dispatchEx, lastResult, subscribe,
  // subscribeTick, flushNotify, setSpeed, speed, clock, flush, exportAll, importAll, exportCsv, reset,
  // resetLive, attachSim, dataset, select, KEY, CORRUPT_KEY.
  SB.store = {
    init, destroy, status, getState: () => state, now, tick: tickNow, dispatch, dispatchEx, lastResult: () => last,
    // Clock readers: speed gives the demo speed, clock gives the whole clock card.
    subscribe, subscribeTick, flushNotify, setSpeed, speed: () => clk.speed, clock: () => ({ now: now(), speed: clk.speed, base: clk.base, realBase: clk.realBase }),
    flush, exportAll, importAll, exportCsv, reset, resetLive, attachSim, dataset, select, isBlank, isOwn, createRecoveryCode, recoverPin, hasRecoveryCode, saveDraft, loadDraft, clearDraft, applyStarterNames, STARTER_NAMES, startOver, START_OVER_WORD, demoLeftovers, keepDemoLeftovers, clearDemoLeftovers, mode: modeNow, isDemo, isolated, enterDemo, leaveDemo, KEY, CORRUPT_KEY,
    // Messages between the tabs of this browser (alert leader, played and acknowledged sounds).
    broadcast, onBroadcast, canBroadcast: () => !!tr, tabId,
    // Server-ready pieces: the transport interface is described above (search "TRANSPORT INTERFACE").
    initFollower, followStatus, subscribeFollow, isFollower, initHubClient, probeHub, rememberedCode, pairHub, pairedFor, unpair, hubScreens, hubNewPairingCode, hubRemoveScreen, hubStatus, subscribeHub: subscribeFollow, subscribeRefusals, pendingFor, isHubClient, isHub: isHubClient, leaveHub, stopFollower: folStop, channelTransport, outbox: () => outbox.map((x) => Object.assign({}, x)), syncNow: () => { retryAt = 0; pushOutbox(); }, ackOps,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
