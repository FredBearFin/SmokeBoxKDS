/*
 * WHAT THIS FILE IS: The start-up sequence, loaded last, in the order of SPEC section 19: page ready,
 *    store.init (load saved data), on a first run seed the demo tickets, then mount the shell (draw the
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
    how.textContent = mods.length ? 'These modules failed to load: ' + mods.map((m) => m.file).join(', ') + '. Reload the page. If it keeps failing, copy the details and send them to whoever maintains this build.' : 'Reload the page. If it keeps failing, copy the details and send them to whoever maintains this build.';
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
    if (s.corrupt) SB.ui.toast('Your saved board could not be read, so Smokebox started fresh. A copy of the old data was kept in this browser.', { tone: 'warn', ms: 15000 });
    else if (s.repaired && s.repaired.length) SB.ui.toast('Smokebox repaired ' + s.repaired.length + ' saved ' + (s.repaired.length === 1 ? 'detail' : 'details') + ' while opening. Nothing else changed.', { tone: 'info', ms: 10000 });
    if (s.persistent === false) SB.ui.toast('This browser is not letting Smokebox save. Your board lasts until you close the page. Use Data, then Back up, to keep a copy.', { tone: 'warn', ms: 15000 });
  }

  // Runs the start-up steps in order and remembers which step it is on, so a failure can say where it
  // stopped. A missing shell is an error. Files that failed to load only raise a warning toast, because the
  // rest of the app still works.
  function boot() {
    let stage = 'start';
    try {
      const U = SB.util;
      stage = 'store';
      // Fallback for first-run detection if the store does not report it: was anything saved before?
      const hadState = !!(U && U.storage && U.storage.get('smokebox.v1.state', null));
      let res;
      if (SB.store && typeof SB.store.init === 'function') res = SB.store.init();
      const first = res && typeof res.firstRun === 'boolean' ? res.firstRun : !hadState;
      stage = 'seed';
      if (first && SB.sim && typeof SB.sim.seedFirstRun === 'function') SB.sim.seedFirstRun();
      stage = 'shell';
      if (!SB.shell || typeof SB.shell.mount !== 'function') throw new Error('The shell module (60-shell.js) is not available.');
      SB.shell.mount(doc.getElementById('app') || doc.body);
      // A small hook so tests and developers can read the state from the console.
      if (SB.store && typeof SB.store.getState === 'function') SB.dev = { state: () => SB.store.getState() };
      SB.booted = true;
      storageNotices();
      const errs = loadErrors();
      if (errs.length && SB.ui && SB.ui.toast) SB.ui.toast('Some parts did not load (' + errs.map((e) => e.file).join(', ') + '). The rest works. Reload to try again.', { tone: 'warn', ms: 12000 });
    } catch (e) { showBootError(e, stage); }
  }

  // Exposed so tests can run the start-up again or show the error card on purpose.
  SB.boot = { run: boot, showError: showBootError, details: detailsText };
  // Start when the page has finished loading; if it already has, start at once.
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})(typeof globalThis !== 'undefined' ? globalThis : window);
