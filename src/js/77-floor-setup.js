/*
 * WHAT THIS FILE IS: The tablet setup checklist. A short sheet to run once on each kitchen tablet: warning
 *    sounds really play, the screen stays on, saved data is protected, the app is installed, the tablet sits
 *    where the cutter can reach it, and the real products are entered. Opens from the Menu; offered once by a
 *    small message on the first run.
 *    Also the first-run wizard, "Set up your kitchen": tax, hours, PIN, starter dishes and opening batches.
 * PARTS: checks, the sheet, the one-time offer, the kitchen wizard.
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
  const KEY_WIZARD = 'smokebox.v1.setup.wizard'; // set to 'done' once the kitchen wizard has been finished
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
    step('6. Your products', 'Open the Menu and settings page and enter your real cost per kg, the 86 point, the pull size (one whole brisket, one rack, one pan), the hold limit, the rest time and whether the limit is a quality or a safety limit for each product. Slaw, potato salad and banana pudding start as quality limits: confirm them (cold food held outside temperature control needs a safety limit). Until then the dollar numbers come from sample data.',
      () => h('button', { type: 'button', class: 'btn btn-primary', onClick: openData }, ico('sliders', 20), h('span', null, 'Open Menu and settings')));
    sheet.body.appendChild(list);
    return sheet;
  }

  // Wizard helpers: send an action through the store and give back {ok, words} in plain language.
  function send(type, payload) {
    const res = SB.store.dispatchEx(type, payload, { source: 'ui' });
    if (res.report === 'ok') return { ok: true, info: res.info || {}, words: '' };
    let words = res.report;
    try { words = SB.engine.describe(res.report, res.info, SB.store.getState().settings) || words; } catch (e) { /* keep the code */ }
    return { ok: false, info: res.info || {}, words };
  }
  // Reads a number from a text box; blank or junk gives null so nothing is ever invented.
  function readNum(input) {
    const t = String(input.value || '').trim().replace(',', '.');
    if (!t || !isFinite(Number(t))) return null;
    return Number(t);
  }
  // The starter dishes that came with the app and are not archived yet.
  function liveStarters() {
    const s = SB.store.getState();
    return s.menu.filter((m) => SB.config.menuById[m.id] && !m.archived);
  }
  // Opens the "Set up your kitchen" wizard: one sheet with five short steps. Every step saves on its own
  // button, so the owner can stop and come back; nothing is invented (opening batches need a real reading).
  function openWizard() {
    const sheet = SB.ui.sheet({ title: 'Set up your kitchen', side: 'right', width: 'min(720px, 96vw)', name: 'wizard' });
    const list = h('div', { class: 'setup-list' });
    const set = SB.store.getState().settings;
    // Adds one wizard step with a title, plain words, its controls and a status line; returns the status line.
    function step(title, words, ...controls) {
      const status = h('p', { class: 'fs-sub', role: 'status' });
      list.appendChild(h('section', { class: 'fs-section' }, h('h3', { class: 'fs-h' }, title), h('p', { class: 'fs-sub' }, words), ...controls, status));
      return status;
    }
    // Builds a labeled number box with a unit, empty or filled with a real starting value.
    const numBox = (label, value, attrs) => {
      const input = h('input', Object.assign({ class: 'input', type: 'text', inputmode: 'decimal', value: value == null ? '' : String(value), 'aria-label': label }, attrs || {}));
      return { input, row: h('label', { class: 'fs-row' }, h('span', null, label), input) };
    };
    // Step 1: sales tax.
    const tax = numBox('Sales tax rate (percent, 0 for none)', set.service.taxRatePct || 0);
    const taxSt = step('1. Sales tax', 'Orders add this percent when they are paid. Enter 0 if you do not add tax. Ask your accountant for the rate.', tax.row,
      // Checks the tax box and saves the rate, or says what is wrong with it.
      h('button', { type: 'button', class: 'btn', onClick: () => {
        const v = readNum(tax.input);
        if (v == null || v < 0 || v > 20) { taxSt.textContent = 'Enter a number from 0 to 20.'; return; }
        const r = send('updateSettings', { patch: { service: { taxRatePct: v } } });
        taxSt.textContent = r.ok ? 'Saved. Orders add ' + v + '% sales tax.' : r.report === 'nothingToDo' ? 'Already set.' : r.words;
      } }, 'Save tax rate'));
    // Step 2: service hours (hour of day, 0 to 23 for opening, up to 30 for closing; 25 is 1 am next day).
    const openB = numBox('Opens at (hour, 0 to 23; 11 is 11 am)', set.service.openHour);
    const closeB = numBox('Closes at (hour, up to 30; 21 is 9 pm, 25 is 1 am)', set.service.closeHour);
    const hoursSt = step('2. Service hours', 'Warnings and the sell-out clock use these hours. Starter hours are 11 am to 9 pm, which are only estimates.', openB.row, closeB.row,
      // Checks both hours and saves them, or says what is wrong.
      h('button', { type: 'button', class: 'btn', onClick: () => {
        const o = readNum(openB.input), c = readNum(closeB.input);
        if (o == null || c == null || o < 0 || o > 23 || c < 1 || c > 30 || o >= c) { hoursSt.textContent = 'Opening must be 0 to 23 and closing 1 to 30, and closing must come after opening.'; return; }
        const r = send('updateSettings', { patch: { service: { openHour: o, closeHour: c } } });
        hoursSt.textContent = r.ok ? 'Saved. Open ' + U.fmtHour(o) + ' to ' + U.fmtHour(c) + '.' : r.report === 'nothingToDo' ? 'Already set.' : r.words;
      } }, 'Save hours'));
    // Step 3: optional manager PIN.
    const pin = numBox('Manager PIN (4 digits, optional)', '', { type: 'password', inputmode: 'numeric', maxlength: 4, autocomplete: 'off' });
    const pinSt = step('3. Manager PIN (optional)', 'A PIN keeps cooks out of the back office. It only keeps honest people out: anyone who can use this device can get round it. Skip it if you do not want one.', pin.row,
      // Saves the four-digit PIN, or asks for exactly four digits.
      h('button', { type: 'button', class: 'btn', onClick: async () => {
        const v = pin.input.value.trim();
        if (!/^\d{4}$/.test(v)) { pinSt.textContent = 'Use exactly 4 digits, or skip this step.'; return; }
        const r = SB.shell && SB.shell.setPin ? await SB.shell.setPin(v) : { ok: false };
        pinSt.textContent = r.ok ? 'PIN set. The back office will ask for it.' : 'The PIN could not be saved.';
        if (r.ok) pin.input.value = '';
      } }, 'Set PIN'));
    // Step 4: archive the made-up starter dishes.
    const nStart = liveStarters().length;
    const dishSt = step('4. Starter dishes', 'The app comes with ' + nStart + ' made-up sample dishes and prices. Archive them so only your own dishes can be ordered. Add your dishes on the Menu and settings page. You can unarchive any starter dish later; past tickets keep them.',
      // After a confirm, archives every starter dish and reports how many worked.
      h('button', { type: 'button', class: 'btn', onClick: async () => {
        const todo = liveStarters();
        if (!todo.length) { dishSt.textContent = 'No starter dishes are left to archive.'; return; }
        const ok = SB.ui.confirm ? await SB.ui.confirm({ title: 'Archive ' + todo.length + ' starter dishes?', confirmLabel: 'Archive them', body: ['They can no longer be ordered. You can unarchive them later.'] }) : true;
        if (!ok) return;
        let bad = 0;
        todo.forEach((m) => { if (!send('updateMenuItem', { id: m.id, patch: { archived: true } }).ok) bad++; });
        dishSt.textContent = bad ? 'Archived ' + (todo.length - bad) + ' of ' + todo.length + '. ' + bad + ' could not be archived.' : 'Archived ' + todo.length + ' starter dishes. Add your own on the Menu and settings page.';
      } }, 'Archive the starter dishes'),
      h('button', { type: 'button', class: 'btn', onClick: () => { sheet.close('link'); setTimeout(() => { if (SB.shell && SB.shell.ignite) SB.shell.ignite({ section: 'data' }); }, 60); } }, 'Open Menu and settings'));
    // Step 5: opening batches, each with a real first temperature reading.
    const ings = SB.store.getState().ingredients.filter((i) => i.tcs);
    const pick = h('select', { class: 'input', 'aria-label': 'Food' }, ings.map((i) => h('option', { value: i.id }, i.name)));
    const kg = numBox('Cooked weight now in the cabinet (kg)', '');
    const tf = numBox('First temperature reading (degrees F, read it with a probe)', '');
    const batchSt = step('5. Food already cooked', 'Enter food that is already in your hot or cold holding right now. Probe it and type the real temperature. There is no default: the app will not guess a reading. Skip this if the pit is empty.',
      h('label', { class: 'fs-row' }, h('span', null, 'Food'), pick), kg.row, tf.row,
      // Checks weight and reading, then adds the batch with the typed temperature.
      h('button', { type: 'button', class: 'btn btn-primary', onClick: () => {
        const w = readNum(kg.input), t = readNum(tf.input);
        if (w == null || w <= 0) { batchSt.textContent = 'Enter the cooked weight in kg, like 4.5.'; return; }
        if (t == null) { batchSt.textContent = 'Enter the real temperature from your probe. It is required.'; return; }
        const r = send('addBatch', { ing: pick.value, cookedG: Math.round(w * 1000), tempF: t });
        if (!r.ok) { batchSt.textContent = r.words; return; }
        const name = (ings.find((i) => i.id === pick.value) || {}).name || 'Batch';
        batchSt.textContent = name + ' added: ' + U.fmtG(r.info.cookedG) + ' at ' + t + ' F.' + (r.info.status === 'ok' ? '' : ' It is not being served until the temperature is safe.');
        kg.input.value = ''; tf.input.value = '';
      } }, 'Add this batch'));
    sheet.body.appendChild(list);
    // Marks setup done, puts the welcome card away and closes the wizard.
    sheet.body.appendChild(h('div', { class: 'fs-row' }, h('button', { type: 'button', class: 'btn btn-primary btn-lg', onClick: () => {
      U.storage.set(KEY_WIZARD, 'done');
      if (SB.floor && SB.floor.setWelcome) SB.floor.setWelcome(false);
      sheet.close('done');
    } }, ico('check', 22), h('span', null, 'Finish setup'))));
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
  SB.sheets.register('wizard', openWizard);
  // True once the owner has pressed Finish setup in the wizard.
  SB.setup = { offer, wizardDone: () => U.storage.get(KEY_WIZARD, null) === 'done' };
})(typeof globalThis !== 'undefined' ? globalThis : window);
