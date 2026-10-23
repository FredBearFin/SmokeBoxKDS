/*
 * WHAT THIS FILE IS: The start-up sequence, loaded last, in the order of SPEC section 19: page ready,
 *    store.init (load saved data; a first run is an empty kitchen), then mount the shell (draw the
 *    screen). If any step fails it shows a plain "Smokebox could not start" card with Reload and Copy details
 *    buttons, never a white screen.
 * PARTS: loadErrors, detailsText, showBootError, storageNotices, boot.
 * USES: 30-store.js, 45-sim.js, 60-shell.js. USED BY: nothing calls it; it runs by itself when the page is
 *    ready.
 */
(function (g) {
  'use strict';
  const SB = (g.SB = g.SB || {});
  const doc = g.document;
  if (!doc) return;

  // Source files that failed to load, as recorded by the build's per-file safety wrapper in
  // window.__sbLoadErrors. Returns a copy, empty when all loaded.
  function loadErrors() { return Array.isArray(g.__sbLoadErrors) ? g.__sbLoadErrors.slice() : []; }

  // Builds the plain text for the error card and the Copy details button: the step that failed, the message,
  // any files that failed to load, the stack, the time, the page address and the browser.
  function detailsText(err, stage) {
    const lines = ['Smokebox boot failure', 'Stage: ' + (stage || 'unknown'), 'Message: ' + ((err && err.message) || String(err || 'unknown error'))];
    const errs = loadErrors();
    if (errs.length) lines.push('Modules that failed to load:', ...errs.map((e) => '  ' + e.file + ': ' + e.message));
    if (err && err.stack) lines.push('Stack:', String(err.stack));
    lines.push('Time: ' + new Date().toISOString(), 'Page: ' + (g.location ? g.location.href.replace(/#.*/, '') : ''), 'Browser: ' + ((g.navigator && g.navigator.userAgent) || ''));
    return lines.join('\n');
  }

  // Replaces the screen with the error card: the message, which files failed, a Reload button and a Copy
  // details button. Safe to call twice (it removes the old card first).
  function showBootError(err, stage) {
    try { console.error('[smokebox] boot failed at ' + (stage || '?'), err); } catch (e) { /* ignore */ }
    const old = doc.getElementById('boot-error');
    if (old) old.remove();
    const text = detailsText(err, stage);
    const mods = loadErrors();
    const wrap = doc.createElement('div');
    wrap.id = 'boot-error'; wrap.className = 'boot-error'; wrap.setAttribute('role', 'alert');
    // Styled inline on purpose: the style sheet may be the very thing that failed to load.
    wrap.style.cssText = 'position:fixed;inset:0;overflow:auto;padding:16px;background:#F5F2EB;color:#1E2224;font-family:system-ui,sans-serif';
    const card = doc.createElement('div'); card.className = 'error-card';
    const h2 = doc.createElement('h2'); h2.textContent = 'Smokebox could not start';
    const p = doc.createElement('p'); p.textContent = (err && err.message) || String(err || 'Unknown error');
    const how = doc.createElement('p'); how.className = 't-muted';
    how.textContent = mods.length ? 'These parts failed to load: ' + mods.map((m) => m.file).join(', ') + '. Reload the page. If it keeps failing, copy the details and send them to whoever set this up.' : 'Reload the page. If it keeps failing, copy the details and send them to whoever set this up.';
    const pre = doc.createElement('div'); pre.className = 'error-detail'; pre.tabIndex = 0; pre.setAttribute('aria-label', 'Technical details'); pre.textContent = text;
    const row = doc.createElement('div'); row.className = 'row';
    const reload = doc.createElement('button'); reload.type = 'button'; reload.className = 'btn btn-primary'; reload.textContent = 'Reload';
    reload.addEventListener('click', () => g.location.reload());
    const copy = doc.createElement('button'); copy.type = 'button'; copy.className = 'btn'; copy.textContent = 'Copy details';
    copy.addEventListener('click', () => {
      // Shows whether copying worked, or tells the person to copy the text by hand.
      const done = (ok) => { copy.textContent = ok ? 'Copied' : 'Select and copy the text above'; };
      // Prefer the app's own copy helper, then the browser clipboard; if neither exists, ask for a hand
      // copy.
      if (SB.ui && SB.ui.copyText) SB.ui.copyText(text).then(done);
      else if (g.navigator && g.navigator.clipboard) g.navigator.clipboard.writeText(text).then(() => done(true), () => done(false));
      else done(false);
    });
    row.append(reload, copy);
    card.append(h2, p, how, pre, row);
    wrap.appendChild(card);
    doc.body.appendChild(wrap);
    try { reload.focus(); } catch (e) { /* ignore */ }
  }

  // Tells the person, once at start-up, when the saved board was unreadable, was repaired, or cannot be saved in this
  // browser (private windows block storage). Silent when everything is fine.
  function storageNotices() {
    const s = SB.store && typeof SB.store.status === 'function' ? SB.store.status() : null;
    if (!s || !SB.ui || typeof SB.ui.toast !== 'function') return;
    if (s.corrupt && s.restoredFromCopy) SB.ui.toast('Your saved board could not be read, so Smokebox restored the last good copy from ' + new Date(s.restoredFromCopy).toLocaleString() + '. Orders and history after that time are missing. A copy of the damaged data was kept in this browser.', { tone: 'warn', ms: 20000 });
    else if (s.corrupt) SB.ui.toast('Your saved board could not be read, so Smokebox started with an empty board. A copy of the old data was kept on this device.', { tone: 'warn', ms: 15000 });
    else if (s.repaired && s.repaired.length) SB.ui.toast('Smokebox updated a few saved settings while opening. Nothing else changed.', { tone: 'info', ms: 10000 });
    if (s.persistent === false) SB.ui.toast('This browser is not letting Smokebox save. Your board lasts only until you close the page. Open Back office, Menu and settings, then Data, to save a backup file.', { tone: 'warn', ms: 15000 });
  }

  // Runs the start-up steps in order and remembers which step it is on, so a failure can say where it
  // stopped. A missing shell is an error. Files that failed to load only raise a warning toast, because the
  // rest of the app still works.
  function boot() {
    let stage = 'start';
    try {
      stage = 'store';
      // A follower screen (?follow=<hub address>) shows the hub's kitchen and never touches this device's own saved one.
      if (SB.followMode && SB.followMode().on) { bootFollower(); return; }
      // A tablet that writes through the hub (?hub) opens the board once the hub has answered, or keeps trying while it is unreachable.
      if (SB.hubMode && SB.hubMode().on) { bootFollower('hub'); return; }
      if (SB.store && typeof SB.store.init === 'function') SB.store.init({ blank: true, mode: SB.util.mode() }); // a brand-new install starts empty; saved data is never changed
      // The demo (its own saved data) opens with its sample tickets the first time.
      // A brand-new empty kitchen gets neutral station and menu-section names (saved with it); old kitchens and the demo keep theirs.
      if (SB.store && SB.store.isBlank && SB.store.isBlank() && SB.store.applyStarterNames) SB.store.applyStarterNames();
      if (SB.store && SB.store.isDemo && SB.store.isDemo() && SB.store.status().firstRun && SB.sim && SB.sim.seedFirstRun) SB.sim.seedFirstRun();
      // A first run is a real, empty kitchen: the demo tickets and batches only load when the user asks for the demo.
      stage = 'shell';
      if (!SB.shell || typeof SB.shell.mount !== 'function') throw new Error('The shell module (60-shell.js) is not available.');
      SB.shell.mount(doc.getElementById('app') || doc.body);
      // A small hook so tests and developers can read the state from the console.
      if (SB.store && typeof SB.store.getState === 'function') SB.dev = { state: () => SB.store.getState() };
      SB.booted = true;
      startOffline();
      storageNotices();
      const errs = loadErrors();
      if (errs.length && SB.ui && SB.ui.toast) SB.ui.toast('Some parts did not load (' + errs.map((e) => e.file).join(', ') + '). The rest still works. Reload the page to try again.', { tone: 'warn', ms: 12000 });
    } catch (e) { showBootError(e, stage); }
  }

  // Asks the offline module to register its service worker (over https or localhost only; it does nothing on file:// or without
  // support), so the app can open when the server or the internet is down. A failure here never stops the board.
  function startOffline() {
    try { if (SB.offline && typeof SB.offline.register === 'function') SB.offline.register(); } catch (e) { /* offline loading is optional */ }
  }
  // Starts a follower screen: connects to the hub, then shows the board. A hub that is only unreachable still opens the board
  // (it keeps trying); a wrong code, a wrong address or a hub of another version shows a plain message instead.
  function bootFollower(kind) {
    const f = kind === 'hub' ? SB.hubMode() : SB.followMode();
    const starter = kind === 'hub' ? 'initHubClient' : 'initFollower';
    // Mounts the shell once the store has something (or is retrying in the background).
    const show = () => {
      try {
        SB.shell.mount(doc.getElementById('app') || doc.body);
        SB.booted = true;
        startOffline();
      } catch (e) { showBootError(e, 'shell'); }
    };
    // Shows a plain message when the hub refuses this screen, with a way back to the device's own kitchen.
    const fail = (res) => {
      const words = { noFollower: 'This version of Smokebox cannot show another screen. Update it and try again.', badCode: 'The access code was not accepted. Check it and try again.', notFound: 'This address is not a Smokebox kitchen.', wrongVersion: 'The kitchen runs another version of Smokebox. Update this page and try again.', tooMany: 'The kitchen has too many screens connected right now. Try again in a minute.',
        unpaired: 'This tablet is not paired with the kitchen yet. Ask the person who runs it for a pairing code.', revoked: 'This tablet was removed from the kitchen. Ask for a new pairing code.', badPairCode: 'That pairing code was not accepted. Check it, or ask for a new one.', tooManyTries: 'Too many wrong pairing codes. Wait a few minutes and try again.', badName: 'That screen name is not allowed. Use letters, numbers and spaces, up to 20 characters.', notOwner: 'Only an owner screen can do that. Ask the owner.' };
      const wrap = doc.createElement('div');
      wrap.className = 'follow-fail';
      wrap.setAttribute('role', 'alert');
      const h2 = doc.createElement('h2'); h2.textContent = kind === 'hub' ? 'This tablet could not join the kitchen' : 'This screen could not follow the kitchen';
      const p = doc.createElement('p'); p.textContent = words[res.error] || 'The kitchen could not be reached or answered with an error.';
      const back = doc.createElement('button'); back.type = 'button'; back.className = 'btn btn-primary btn-lg'; back.textContent = 'Back to my own kitchen';
      back.addEventListener('click', () => { try { if (SB.setup && SB.setup.leaveFollow) SB.setup.leaveFollow(); else g.location.href = g.location.pathname; } catch (e) { g.location.href = g.location.pathname; } });
      wrap.append(h2, p, back);
      (doc.getElementById('app') || doc.body).appendChild(wrap);
      SB.booted = true;
    };
    // A page that cannot follow (an older store) never falls back to opening a kitchen of its own.
    if (!SB.store || typeof SB.store[starter] !== 'function') { fail({ error: 'noFollower' }); return; }
    let p;
    // The browser's own fetch must be called on the page, so it is handed over wrapped.
    try { p = SB.store[starter](Object.assign({ url: f.url, code: f.code, fetch: (u, o) => g.fetch(u, o), AbortController: g.AbortController, TextDecoder: g.TextDecoder }, kind === 'hub' ? { adopt: 'hub' } : {})); } catch (e) { fail({ error: 'unreachable' }); return; }
    Promise.resolve(p).then((res) => { if (res && res.ok === false && res.error && res.error !== 'unreachable') fail(res); else show(); }, () => show());
  }

  // Exposed so tests can run the start-up again or show the error card on purpose.
  SB.boot = { run: boot, showError: showBootError, details: detailsText };
  // Start when the page has finished loading; if it already has, start at once.
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})(typeof globalThis !== 'undefined' ? globalThis : window);
