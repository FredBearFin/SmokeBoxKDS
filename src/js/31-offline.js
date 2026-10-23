/*
 * WHAT THIS FILE IS: The page side of offline page load. SB.offline registers the service worker the hub serves (/sw.js), so a tablet that
 *    reloads while the hub or the internet is down still opens the app from a stored copy. It reports what is stored, tells the page when a
 *    newer version has been stored (the page decides when to reload: never automatically), answers "can this tablet open Smokebox with no
 *    network", and can switch the whole thing off (reset, or ?nosw in the address).
 * PARTS: status and subscribers, asking the worker, register, check, applyUpdate, reset.
 * USES: nothing else. USED BY: the start-up sequence and the settings screens, tests.
 * SAFE BY DESIGN: nothing happens from a file:// page, without service worker support, on a page that is not a secure context, or with
 *    ?nosw. The worker only ever handles the page itself; the hub's actions and streams never go through it or into its store.
 */
(function (g) {
  'use strict';
  const SB = (g.SB = g.SB || {});
  const O = (SB.offline = {});
  const st = { supported: false, secure: false, state: 'none', cachedVersion: null, pageVersion: null, updateReady: false, reason: '' };
  const subs = new Set();
  let reg = null, started = false, timer = null;

  // A copy of what is known now, for the screens.
  O.status = () => Object.assign({}, st);
  // Calls fn whenever the status changes; returns a function that stops it.
  O.subscribe = (fn) => { if (typeof fn !== 'function') return () => {}; subs.add(fn); return () => subs.delete(fn); };
  // Changes some status fields and tells the subscribers if anything differs.
  function set(patch) {
    let changed = false;
    for (const k of Object.keys(patch)) if (st[k] !== patch[k]) { st[k] = patch[k]; changed = true; }
    st.updateReady = !!st.cachedVersion && !!st.pageVersion && st.cachedVersion !== st.pageVersion;
    if (st.updateReady && st.state === 'ready') st.state = 'update';
    if (changed) subs.forEach((fn) => { try { fn(O.status()); } catch (e) { /* a screen's mistake must not stop the others */ } });
  }
  // True when the address asks for no service worker (?nosw).
  const wantsNone = () => !!(g.location && /[?&]nosw(=|&|#|$)/.test(g.location.search || ''));
  // The service worker container of this browser, or null.
  const container = () => (g.navigator && g.navigator.serviceWorker ? g.navigator.serviceWorker : null);

  // Asks a worker something and waits for its answer (up to 3 seconds); resolves null on silence.
  function ask(worker, msg) {
    return new Promise((resolve) => {
      if (!worker || typeof g.MessageChannel !== 'function') { resolve(null); return; }
      const ch = new g.MessageChannel(), t = setTimeout(() => resolve(null), 3000);
      // The worker's answer ends the wait.
      ch.port1.onmessage = (e) => { clearTimeout(t); resolve(e.data || null); };
      try { worker.postMessage(msg, [ch.port2]); } catch (e) { clearTimeout(t); resolve(null); }
    });
  }
  // Adds the web manifest link to the page (with credentials, so a login in front of the hub does not hide it).
  function addManifest() {
    const d = g.document;
    if (!d || !d.head || d.querySelector('link[rel="manifest"]')) return;
    const l = d.createElement('link');
    l.rel = 'manifest'; l.href = 'manifest.webmanifest'; l.crossOrigin = 'use-credentials';
    d.head.appendChild(l);
  }

  // Registers the worker (once). Resolves { ok, state, reason? }; never throws. Does nothing on file://, with ?nosw, or where workers cannot run.
  O.register = async function register() {
    if (started) return { ok: st.state === 'ready' || st.state === 'update', state: st.state, reason: st.reason || undefined };
    const L = g.location, c = container();
    if (!L || !/^https?:$/.test(L.protocol)) { set({ supported: false, reason: 'file' }); return { ok: false, state: st.state, reason: 'file' }; }
    if (wantsNone()) { await O.reset({ reload: false }); set({ supported: false, state: 'none', reason: 'nosw' }); return { ok: false, state: 'none', reason: 'nosw' }; }
    if (!c) { set({ supported: false, reason: 'unsupported' }); return { ok: false, state: st.state, reason: 'unsupported' }; }
    if (g.isSecureContext === false) { set({ supported: false, secure: false, reason: 'insecure' }); return { ok: false, state: st.state, reason: 'insecure' }; }
    started = true;
    set({ supported: true, secure: true, reason: '' });
    addManifest();
    const wasControlled = !!c.controller;
    // The worker announces a newer stored version after it has taken over.
    c.addEventListener('message', (e) => {
      const d = e.data;
      if (d && d.type === 'smokebox-update' && typeof d.version === 'string') set({ cachedVersion: d.version });
    });
    try {
      set({ state: 'installing' });
      reg = await c.register('sw.js', { scope: './', updateViaCache: 'none' });
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        if (!w) return;
        w.addEventListener('statechange', () => { if (w.state === 'redundant' && !st.cachedVersion) set({ state: 'error', reason: 'install failed' }); });
      });
      await c.ready;
      const v = await ask(c.controller || reg.active, { type: 'version' });
      if (v && typeof v.version === 'string') set({ cachedVersion: v.version, pageVersion: st.pageVersion || v.version });
      if (!wasControlled && !st.pageVersion && v) set({ pageVersion: v.version });
      set({ state: st.updateReady ? 'update' : 'ready' });
      if (!timer && typeof setInterval === 'function') timer = setInterval(() => { try { reg.update(); } catch (e) { /* try again later */ } }, 30 * 60 * 1000);
      return { ok: true, state: st.state };
    } catch (e) {
      set({ state: 'error', reason: String((e && e.message) || e || 'error').slice(0, 120) });
      return { ok: false, state: 'error', reason: st.reason };
    }
  };

  // Can this tablet open Smokebox with no network? Asks the worker to read the stored page and check it is the whole app.
  O.check = async function check() {
    const c = container();
    if (!c) return { ok: false, reason: 'unsupported' };
    if (g.isSecureContext === false) return { ok: false, reason: 'insecure' };
    let w = c.controller || (reg && reg.active);
    if (!w && c.getRegistration) { try { const r = await c.getRegistration(); w = r && r.active; } catch (e) { w = null; } }   // works on a fresh page load too, before register() ran
    if (!w) return { ok: false, reason: 'noworker' };
    const v = await ask(w, { type: 'version' });
    if (!v) return { ok: false, reason: 'noanswer' };
    if (!v.readable) return { ok: false, reason: 'nocopy', version: v.version };
    return { ok: true, version: v.version };
  };

  // Loads the newer stored version now by reloading the page. Call it only from a person's button, never on a timer.
  O.applyUpdate = function applyUpdate() { if (g.location && typeof g.location.reload === 'function') g.location.reload(); };

  // Switches offline load off: removes every worker for this site and deletes the app's stored pages, then reloads unless reload is false.
  O.reset = async function reset(opts) {
    let unregistered = 0, deleted = 0;
    try {
      const c = container();
      if (c && c.getRegistrations) for (const r of await c.getRegistrations()) { if (await r.unregister()) unregistered++; }
      if (g.caches && g.caches.keys) for (const k of await g.caches.keys()) if (k.indexOf('smokebox-') === 0) { if (await g.caches.delete(k)) deleted++; }
    } catch (e) { /* what could be removed was removed */ }
    reg = null; started = false;
    if (timer) { clearInterval(timer); timer = null; }
    set({ state: 'none', cachedVersion: null, pageVersion: null, reason: '' });
    if (!(opts && opts.reload === false) && g.location && typeof g.location.reload === 'function') g.location.reload();
    return { ok: true, unregistered, cachesDeleted: deleted };
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
