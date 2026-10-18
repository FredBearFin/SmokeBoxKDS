/*
 * WHAT THIS FILE IS: The tablet setup checklist. A short sheet to run once on each kitchen tablet: warning
 *    sounds really play, the screen stays on, saved data is protected, the app is installed, the tablet sits
 *    where the cutter can reach it, and the real products are entered. Opens from the Menu; offered once by a
 *    small message on the first run.
 * PARTS: checks, the sheet, the one-time offer.
 * USES: 00-util.js, 05-icons.js, 60-shell.js (sheets), 70-floor-board.js (sound, speech, wake lock),
 *    76-floor-discards.js (storage). USED BY: the Menu list and the board startup.
 */
(function (g) {
  'use strict';
  const SB = (g.SB = g.SB || {});
  const U = SB.util;
  const doc = g.document;
  if (!doc || !SB.sheets) return;
  const h = U.h;
  const KEY_OFFERED = 'smokebox.v1.setup.offered';
  // Builds an icon element, or an empty span when icons are missing.
  const ico = (name, size) => { try { return SB.icons.svg(name, { size: size || 22 }); } catch (e) { return doc.createElement('span'); } };

  // Opens the setup checklist sheet, one step after another with plain words.
  function openSetup() {
    const sheet = SB.ui.sheet({ title: 'Set up this tablet', side: 'right', width: 'min(720px, 96vw)', name: 'setup' });
    const list = h('div', { class: 'setup-list' });
    // Adds one checklist step: a title, plain words, an optional button and a status line.
    function step(title, words, action) {
      const status = h('p', { class: 'fs-sub', role: 'status' });
      const el = h('section', { class: 'fs-section' }, h('h3', { class: 'fs-h' }, title), h('p', { class: 'fs-sub' }, words), action ? action(status) : null, status);
      list.appendChild(el);
      return status;
    }
    // Runs a step's test and shows what it answers in the step's status line.
    const runStep = (status, fn) => { status.textContent = fn() || ''; };
    // Builds a button that runs fn and shows its answer in the step's status line.
    const btn = (label, icon, fn) => (status) => h('button', { type: 'button', class: 'btn', onClick: () => runStep(status, fn) }, ico(icon, 20), h('span', null, label));

    step('1. Sound', 'Warnings use tones and a spoken voice. Browsers only allow sound after a tap, so test it here. Turn the volume up, or plug in a cheap Bluetooth speaker: a tablet speaker is easy to miss in a loud kitchen.',
      btn('Play a test warning', 'volume', () => { if (SB.floor && SB.floor.setSound) { SB.floor.setSound(true); if (SB.floor.setSpeech) SB.floor.setSpeech(true); return 'You should have heard a chime and a voice. If not, turn the tablet volume up and tap again.'; } return 'The kitchen board is not loaded.'; }));
    const wake = SB.floor && SB.floor.wakeLock ? SB.floor.wakeLock() : 'unknown';
    step('2. Keep the screen on', 'The board asks the browser to keep the screen awake' + (wake === 'on' ? ' (it is on now).' : wake === 'unsupported' ? ', but this browser does not support that.' : ', but this browser has not allowed it.') + ' Also set the tablet itself: Settings, Display, Auto-Lock (iPad) or Screen timeout (Android), to Never. Plug the tablet into power.');
    const prot = step('3. Protect your data', 'Everything is saved in this browser only. Ask the browser to keep it safe, and save a copy of the discard log every day.',
      btn('Protect saved data', 'shield-check', () => { try { if (g.navigator.storage && g.navigator.storage.persist) { g.navigator.storage.persist().then((ok) => { prot.textContent = ok ? 'Saved data is protected.' : 'The browser did not agree. Installing the app (step 4) usually helps.'; }); return 'Asking the browser...'; } } catch (e) { /* fall through */ } return 'This browser cannot do that. Save the discard log every day.'; }));
    step('4. Install as an app', 'On an iPad: Share, then Add to Home Screen. In Chrome on Android or a computer: the menu, then Install app or Add to Home screen. An installed app opens full screen and the browser is less likely to clear its data.');
    step('5. Where the tablet sits', 'Put the tablet where the person at the cutting board can tap it without walking, within reach of the warmer if you can. If it is out of reach, pulls will not get logged and the waste numbers will be wrong.');
    // Closes this sheet and opens the Menu and settings page of the back office.
    const openData = () => { sheet.close('link'); setTimeout(() => { if (SB.shell && SB.shell.ignite) SB.shell.ignite({ section: 'data' }); }, 60); };
    step('6. Your products', 'Open the Menu and settings page and enter your real cost per kg, the 86 point, and the pull size (one whole brisket, one rack, one pan) for each product. Until then the dollar numbers come from sample data.',
      () => h('button', { type: 'button', class: 'btn btn-primary', onClick: openData }, ico('sliders', 20), h('span', null, 'Open Menu and settings')));
    sheet.body.appendChild(list);
    return sheet;
  }

  // On the first run only, offers the setup checklist in a small message.
  function offer() {
    if (!SB.ui || U.storage.get(KEY_OFFERED, false)) return;
    U.storage.set(KEY_OFFERED, true);
    // Opens the checklist from the first-run message.
    const go = () => SB.sheets.open('setup');
    SB.ui.toast(h('span', null, 'New tablet? ', h('button', { type: 'button', class: 'btn', onClick: go }, 'Run the 6-step setup')), { tone: 'info', ms: 15000 });
  }

  SB.sheets.register('setup', openSetup);
  SB.setup = { offer };
})(typeof globalThis !== 'undefined' ? globalThis : window);
