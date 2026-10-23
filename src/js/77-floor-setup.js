/*
 * WHAT THIS FILE IS: The owner's first minutes. The "Dishes and prices" sheet (add a dish with a name, a price and where it is
 *    made, save and add another, edit or remove dishes later, an optional example menu), the small "Tax, hours and PIN"
 *    sheet, and the tablet checklist (sound, screen on, protected data, installed, placement). Setup is simply "at least
 *    one dish exists", so there is no finish flag that can get stuck.
 * PARTS: tablet checklist, helpers, dish form, dishes sheet, shop sheet, order guard, registration.
 * USES: 00-util.js, 05-icons.js, 60-shell.js (sheets), 70-floor-board.js (sound, speech, wake lock),
 *    76-floor-discards.js (storage). USED BY: the board's first-run screen and welcome card, and the Menu sheet.
 */
(function (g) {
  'use strict';
  const SB = (g.SB = g.SB || {});
  const U = SB.util;
  const doc = g.document;
  if (!doc || !SB.sheets) return;
  const h = U.h;
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
    step('6. Your products', 'Add your dishes under Dishes and prices. Then open the Menu and settings page and enter your real cost per kg, the 86 point, the pull size (one whole brisket, one rack, one pan), the hold limit, the rest time and whether the limit is a quality or a safety limit for each product. Slaw, potato salad and banana pudding start as quality limits: confirm them (cold food held outside temperature control needs a safety limit). Until you confirm them the dollar numbers are starter estimates.',
      () => h('button', { type: 'button', class: 'btn btn-primary', onClick: openData }, ico('sliders', 20), h('span', null, 'Open Menu and settings')));
    sheet.body.appendChild(list);
    return sheet;
  }

  /* ---------- helpers for the dish form ---------- */

  const KEY_DRAFT = 'smokebox.v1.setup.draft'; // the half-typed dish {name, price, zone}, kept so a closed tab loses nothing
  const KEY_LAST = 'smokebox.v1.setup.lastZone'; // the station chosen for the last saved dish
  const KEY_COOK = 'smokebox.v1.setup.cookAhead'; // 'yes' or 'no': the cook-ahead answer (not used by the engine yet)
  const KEY_EXAMPLES = 'smokebox.v1.setup.examples'; // ids of dishes that came from the example menu

  // What a new dish gets from the station tile alone: its order-screen category, a guessed prep time in seconds
  // (starter estimate, owner to confirm) and whether the cook taps Start then Done or just Done.
  const ZONE_DEFAULT = {
    pit: { cat: 'meat', sec: 300, track: 'two' }, sides: { cat: 'side', sec: 180, track: 'two' },
    fry: { cat: 'fried', sec: 240, track: 'two' }, cold: { cat: 'cold', sec: 60, track: 'one' },
  };
  // A short plain line under each station name on its tile.
  const ZONE_HINT = { pit: 'Smoker and slicing', sides: 'Stove and sides', fry: 'Fryer', cold: 'No cooking: drinks, cold sides' };
  // The example menu. Columns: name, price in dollars, station id, category id. Made-up prices, owner to replace.
  // audit:data-start
  const EXAMPLES = [
    ['Pulled pork plate', 12.5, 'pit', 'meat'], ['Brisket sandwich', 11, 'pit', 'sandwich'],
    ['Mac and cheese', 4.5, 'sides', 'side'], ['Baked beans', 3.5, 'sides', 'side'],
    ['Fried pickles', 6, 'fry', 'fried'], ['Hush puppies', 5, 'fry', 'fried'],
    ['Coleslaw', 3, 'cold', 'cold'], ['Sweet tea', 3, 'cold', 'cold'],
  ];
  // audit:data-end

  // Sends one action through the store and gives back {ok, info, words} with the reason in plain language.
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
  // The dishes the owner can order right now (not archived).
  function activeDishes() {
    const s = SB.store.getState();
    return s.menu.filter((m) => !m.archived);
  }
  // True when nothing can be ordered yet: the first-run state that shows the Add your first dish button.
  function noDishes() { return activeDishes().length === 0; }
  // The stations a dish can be made at, in order: only the ones that receive items (not expo).
  function stations() { return SB.config.workZones.map((z) => SB.config.zoneById[z]).filter(Boolean); }
  // The guessed category, prep seconds and tap style for a station, with safe values for a custom station.
  function defaultsFor(zoneId) {
    const d = ZONE_DEFAULT[zoneId];
    if (d && SB.config.categoryById[d.cat]) return d;
    return { cat: (SB.config.categories[0] || {}).id, sec: 180, track: 'two' };
  }
  // Turns a typed price like "12.5" or "$12.50" into dollars, or null when it is not a price.
  function parsePrice(text) {
    const raw = String(text || '').replace(/[$\s]/g, '').replace(',', '.');
    if (!/^(\d+\.?\d{0,2}|\.\d{1,2})$/.test(raw)) return null;
    return parseFloat(raw);
  }
  // Adds one dish with every hidden default filled in. opts may carry prepSec, cat and short from "More options".
  // The prep time is marked as a guess unless the owner typed one. Returns the send() result.
  function addDish(name, price, zone, opts) {
    const o = opts || {}, d = defaultsFor(zone);
    const r = send('addMenuItem', { name, short: o.short || '', zone, cat: o.cat || d.cat, price, prepSec: o.prepSec || d.sec, track: d.track });
    if (r.ok && !o.prepSec && r.info && r.info.id) send('updateMenuItem', { id: r.info.id, patch: { prepConfirmed: false } });
    return r;
  }

  /* ---------- the Dishes and prices sheet ---------- */

  // Opens "Dishes and prices": the add form on top, the dishes added so far, and a small fold of extra ways to start.
  function openDishes() {
    const sheet = SB.ui.sheet({ title: 'Dishes and prices', side: 'right', width: 'min(720px, 96vw)', name: 'dishes', onClose: () => offs.splice(0).forEach((f) => f()) });
    const offs = [];
    const root = h('div', { class: 'dp' });
    const lead = h('p', { class: 'fs-sub dp-lead' });

    // The form: name, price, where it is made. Station tiles are big buttons that behave like radio buttons.
    const nameIn = h('input', { class: 'input dp-name', type: 'text', maxlength: 60, autocomplete: 'off', placeholder: 'Brisket plate' });
    const nameField = SB.ui.field({ label: 'What is it called?', control: nameIn });
    const priceIn = h('input', { class: 'input dp-price', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: '12.50' });
    const priceField = SB.ui.field({ label: 'Price in dollars', control: priceIn });
    let zone = '';
    const tiles = h('div', { class: 'dp-tiles', role: 'radiogroup', 'aria-label': 'Where it is made' });
    const zoneErr = h('div', { class: 'field-error', role: 'alert', hidden: true });
    stations().forEach((z) => {
      const tile = h('button', { type: 'button', class: 'dp-tile', role: 'radio', 'aria-checked': 'false', dataset: { zone: z.id } },
        ico(z.icon || 'pot', 28), h('strong', null, z.name), h('span', null, ZONE_HINT[z.id] || z.long || ''));
      // Picks this station and remembers it for the next dish.
      tile.addEventListener('click', () => { pickZone(z.id); U.storage.set(KEY_LAST, z.id); saveDraft(); });
      tiles.appendChild(tile);
    });
    // Shows which station tile is chosen and clears the "tap where it is made" message.
    function pickZone(id) {
      zone = id; zoneErr.hidden = true;
      tiles.querySelectorAll('.dp-tile').forEach((b) => b.setAttribute('aria-checked', b.dataset.zone === id ? 'true' : 'false'));
    }
    const whereBlock = h('div', { class: 'field' }, h('div', { class: 'field-label' }, 'Where is it made?'), tiles, zoneErr);

    // More options, folded shut: prep time, category and a short ticket name. Nothing here is needed.
    const minIn = h('input', { class: 'input dp-num', type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder: 'auto', 'aria-label': 'Prep time in minutes' });
    const catSel = h('select', { class: 'select' }, h('option', { value: '' }, 'Choose for me'), SB.config.categories.map((c) => h('option', { value: c.id }, c.name)));
    const shortIn = h('input', { class: 'input', type: 'text', maxlength: 24, autocomplete: 'off', placeholder: 'Same as the name' });
    const more = h('details', { class: 'dp-fold' }, h('summary', null, ico('chevron-down', 18), h('span', null, 'More options')),
      h('div', { class: 'dp-more' },
        SB.ui.field({ label: 'Minutes to make one', control: minIn, hint: 'Leave empty and Smokebox guesses from the station, then learns from your tickets.' }),
        SB.ui.field({ label: 'Category on the order screen', control: catSel }),
        SB.ui.field({ label: 'Short name on tickets', control: shortIn })));

    const status = h('p', { class: 'fs-sub dp-status', role: 'status' });
    const again = h('button', { type: 'submit', class: 'btn btn-primary btn-lg dp-again', dataset: { act: 'save-again' } }, ico('plus', 22), h('span', null, 'Save and add another'));
    const done = h('button', { type: 'button', class: 'btn btn-lg dp-done', dataset: { act: 'save-done' } }, ico('check', 22), h('span', null, 'Save and finish'));
    const form = h('form', { class: 'dp-form', novalidate: '', 'aria-label': 'Add a dish' }, nameField, priceField, whereBlock, more, h('div', { class: 'fs-row dp-actions' }, again, done), status);

    // Keeps what has been typed so far, so a closed tab or a stray tap loses nothing.
    function saveDraft() { U.storage.set(KEY_DRAFT, { name: nameIn.value, price: priceIn.value, zone }); }
    nameIn.addEventListener('input', saveDraft); priceIn.addEventListener('input', saveDraft);
    // Enter (or Next on a tablet keyboard) in the name box moves to the price box instead of doing nothing.
    nameIn.setAttribute('enterkeyhint', 'next'); priceIn.setAttribute('enterkeyhint', 'done');
    nameIn.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); priceIn.focus(); } });

    // Checks the form and saves one dish. Returns true when it saved. Each problem shows beside its own box.
    function saveOne() {
      status.textContent = ''; nameField.setError(null); priceField.setError(null);
      const name = nameIn.value.replace(/\s+/g, ' ').trim();
      const price = parsePrice(priceIn.value);
      if (!name) { nameField.setError('Type the dish name.'); nameIn.focus(); return false; }
      if (price == null) { priceField.setError('Type the price in dollars, like 12.50.'); priceIn.focus(); return false; }
      if (!zone) { zoneErr.replaceChildren(ico('alert-circle', 18), h('span', null, 'Tap where it is made.')); zoneErr.hidden = false; return false; }
      let prepSec = 0;
      if (minIn.value.trim()) {
        const mins = readNum(minIn);
        if (mins == null || mins < 0.1 || mins > 60) { status.textContent = 'Minutes to make one: type a number from 1 to 60, or leave it empty.'; more.open = true; minIn.focus(); return false; }
        prepSec = Math.round(mins * 60);
      }
      const r = addDish(name, price, zone, { prepSec, cat: catSel.value, short: shortIn.value.trim() });
      if (!r.ok) {
        if (/name/.test((r.info && r.info.key) || '')) nameField.setError('There is already a dish called ' + name + ' (a removed dish keeps its name). Pick another name.');
        else status.textContent = r.words;
        return false;
      }
      status.textContent = 'Saved ' + name + ' at ' + U.fmtMoney(price) + '.';
      nameIn.value = ''; priceIn.value = ''; minIn.value = ''; catSel.value = ''; shortIn.value = '';
      saveDraft();
      return true;
    }
    form.addEventListener('submit', (ev) => { ev.preventDefault(); if (saveOne()) nameIn.focus(); });
    // Save and finish: saves what is typed (or just closes when the form is empty).
    done.addEventListener('click', () => {
      const empty = !nameIn.value.trim() && !priceIn.value.trim();
      if (empty || saveOne()) sheet.close('done');
    });

    // The dishes so far: each row is a name box, a price box and Remove. Changes save when the box is left.
    const listBox = h('div', { class: 'dp-list' });
    let listSig = '';
    // Rebuilds the list of dishes when it has changed and no box in it is being typed in.
    function paintList() {
      const mine = activeDishes();
      const sig = mine.map((m) => m.id + '|' + m.name + '|' + m.price + '|' + m.zone).join(';');
      if (sig === listSig || listBox.contains(doc.activeElement)) return;
      listSig = sig;
      const ex = U.storage.get(KEY_EXAMPLES, []);
      U.clear(listBox);
      lead.textContent = mine.length ? (mine.length + ' ' + U.plural(mine.length, 'dish', 'dishes') + ' on your menu. Change a name or price below and it saves when you tap away.') : 'Add the dishes you sell. Name, price and where it is made is all you need. Nothing here is pre-filled.';
      mine.forEach((m) => {
        const n = h('input', { class: 'input dp-rn', type: 'text', maxlength: 60, value: m.name, 'aria-label': 'Name of ' + m.name });
        const pr = h('input', { class: 'input dp-rp', type: 'text', inputmode: 'decimal', value: m.price.toFixed(2), 'aria-label': 'Price of ' + m.name });
        const msg = h('span', { class: 'fs-sub dp-rmsg', role: 'status' });
        // Saves a changed name or price for this dish, or says what is wrong and puts the old value back.
        const save = () => {
          const patch = {}, nv = n.value.replace(/\s+/g, ' ').trim(), pv = parsePrice(pr.value);
          if (nv && nv !== m.name) patch.name = nv;
          if (pv != null && pv !== m.price) patch.price = pv;
          if (pv == null) { msg.textContent = 'Type the price like 12.50.'; pr.value = m.price.toFixed(2); return; }
          if (!Object.keys(patch).length) return;
          const r = send('updateMenuItem', { id: m.id, patch });
          msg.textContent = r.ok ? 'Saved.' : r.words;
          if (!r.ok) { n.value = m.name; pr.value = m.price.toFixed(2); }
        };
        n.addEventListener('change', save); pr.addEventListener('change', save);
        const rm = h('button', { type: 'button', class: 'btn btn-sm', 'aria-label': 'Remove ' + m.name, onClick: () => {
          // Removing archives the dish: it can no longer be ordered, and old tickets keep it.
          send('updateMenuItem', { id: m.id, patch: { archived: true } });
        } }, ico('x', 18), h('span', null, 'Remove'));
        const z = SB.config.zoneById[m.zone];
        listBox.appendChild(h('div', { class: 'dp-row' }, n, pr, h('span', { class: 'chip dp-zone' }, z ? z.name : m.zone), ex.indexOf(m.id) >= 0 ? h('span', { class: 'chip dp-ex', 'data-tone': 'warn' }, 'Example') : null, rm, msg));
      });
    }
    paintList();
    offs.push(SB.store.subscribe(() => { paintList(); }));

    // More ways to add dishes: for now only an example menu, clearly marked as an example.
    const exStatus = h('p', { class: 'fs-sub', role: 'status' });
    const exBtn = h('button', { type: 'button', class: 'btn', dataset: { act: 'example-menu' } }, ico('book', 20), h('span', null, 'Start from an example menu'));
    // Adds the example dishes (skipping any name already on the menu) and marks them as examples.
    exBtn.addEventListener('click', () => {
      const ids = U.storage.get(KEY_EXAMPLES, []).slice();
      let n = 0;
      EXAMPLES.forEach(([name, price, z, cat]) => {
        if (!SB.config.zoneById[z]) return;
        const r = addDish(name, price, z, { cat: SB.config.categoryById[cat] ? cat : '' });
        if (r.ok) { n++; ids.push(r.info.id); }
      });
      U.storage.set(KEY_EXAMPLES, ids);
      exStatus.textContent = n ? 'Added ' + n + ' example dishes with made-up prices. Each one is marked Example: change its name and price, or tap Remove.' : 'Those example dishes are already on your menu.';
    });
    const exRemove = h('button', { type: 'button', class: 'btn', dataset: { act: 'example-remove' } }, ico('x', 20), h('span', null, 'Remove all example dishes'));
    // Archives every dish that came from the example menu, in one tap.
    exRemove.addEventListener('click', () => {
      const ids = U.storage.get(KEY_EXAMPLES, []);
      ids.forEach((id) => send('updateMenuItem', { id, patch: { archived: true } }));
      U.storage.set(KEY_EXAMPLES, []);
      exStatus.textContent = 'Example dishes removed.';
    });
    const ways = h('details', { class: 'dp-fold dp-ways' }, h('summary', null, ico('chevron-down', 18), h('span', null, 'More ways to add dishes')),
      h('div', { class: 'dp-more' }, h('p', { class: 'fs-sub' }, 'An example barbecue menu with made-up prices, so you can see how Smokebox looks with food on it. You can edit or remove every dish.'), h('div', { class: 'fs-row' }, exBtn, exRemove), exStatus));

    // Links to the other small settings and to the full menu editor in the back office.
    const shopBtn = h('button', { type: 'button', class: 'btn', onClick: () => { sheet.close('link'); setTimeout(() => SB.sheets.open('shop'), 60); } }, ico('sliders', 20), h('span', null, 'Tax, hours and PIN'));
    const fullBtn = h('button', { type: 'button', class: 'btn', onClick: () => { sheet.close('link'); setTimeout(() => { if (SB.shell && SB.shell.ignite) SB.shell.ignite({ section: 'data' }); }, 60); } }, ico('gauge', 20), h('span', null, 'Full menu editor (ingredients, prep times)'));
    root.append(lead, form, h('h3', { class: 'fs-h dp-h' }, 'Your dishes'), listBox, ways, h('div', { class: 'fs-row dp-links' }, shopBtn, fullBtn));
    sheet.body.appendChild(root);

    // Restore a draft left by a closed tab, then the last station used.
    const d = U.storage.get(KEY_DRAFT, null);
    if (d && typeof d === 'object') { nameIn.value = String(d.name || ''); priceIn.value = String(d.price || ''); }
    const last = (d && d.zone) || U.storage.get(KEY_LAST, '');
    if (last && SB.config.zoneById[last] && SB.config.workZones.indexOf(last) >= 0) pickZone(last);
    setTimeout(() => nameIn.focus(), 50);
    return sheet;
  }

  /* ---------- the Tax, hours and PIN sheet ---------- */

  // Opens "Tax, hours and PIN": the shop settings that used to be steps of a wizard. Each saves on its own button.
  function openShop() {
    const sheet = SB.ui.sheet({ title: 'Tax, hours and PIN', side: 'right', width: 'min(640px, 96vw)', name: 'shop' });
    const set = SB.store.getState().settings;
    const list = h('div', { class: 'setup-list' });
    // Adds one section with a title, plain words, controls and a status line; returns the status line.
    function section(title, words, ...controls) {
      const status = h('p', { class: 'fs-sub', role: 'status' });
      list.appendChild(h('section', { class: 'fs-section' }, h('h3', { class: 'fs-h' }, title), h('p', { class: 'fs-sub' }, words), ...controls, status));
      return status;
    }
    const tax = h('input', { class: 'input', type: 'text', inputmode: 'decimal', value: String(set.service.taxRatePct || 0), 'aria-label': 'Sales tax percent' });
    const taxSt = section('Sales tax', 'Orders add this percent when they are paid. Type 0 if you do not charge tax.', h('label', { class: 'fs-row' }, h('span', null, 'Percent'), tax),
      // Checks the tax box and saves the rate, or says what is wrong with it.
      h('button', { type: 'button', class: 'btn', onClick: () => {
        const v = readNum(tax);
        if (v == null || v < 0 || v > 20) { taxSt.textContent = 'Type a number from 0 to 20.'; return; }
        const r = send('updateSettings', { patch: { service: { taxRatePct: v } } });
        taxSt.textContent = r.ok ? 'Saved. Orders add ' + v + '% sales tax.' : r.report === 'nothingToDo' ? 'Already set.' : r.words;
      } }, 'Save tax'));
    // A list of whole hours with plain labels such as "11 am" and "1 am (next day)".
    const hourOpts = (from, to, sel) => { const out = []; for (let x = from; x <= to; x++) out.push(h('option', { value: String(x), selected: x === sel }, U.fmtHour(x) + (x >= 24 ? ' (next day)' : ''))); return out; };
    const openSel = h('select', { class: 'select', 'aria-label': 'Opens at' }, hourOpts(0, 23, set.service.openHour));
    const closeSel = h('select', { class: 'select', 'aria-label': 'Closes at' }, hourOpts(1, 30, set.service.closeHour));
    const hoursSt = section('Opening hours', 'Warnings and the sell-out clock use these. The starting hours are only a guess.', h('label', { class: 'fs-row' }, h('span', null, 'Opens at'), openSel), h('label', { class: 'fs-row' }, h('span', null, 'Closes at'), closeSel),
      // Saves both hours, or says closing has to come after opening.
      h('button', { type: 'button', class: 'btn', onClick: () => {
        const o = Number(openSel.value), c = Number(closeSel.value);
        if (o >= c) { hoursSt.textContent = 'Closing has to be after opening.'; return; }
        const r = send('updateSettings', { patch: { service: { openHour: o, closeHour: c } } });
        hoursSt.textContent = r.ok ? 'Saved. Open ' + U.fmtHour(o) + ' to ' + U.fmtHour(c) + '.' : r.report === 'nothingToDo' ? 'Already set.' : r.words;
      } }, 'Save hours'));
    const pin = h('input', { class: 'input', type: 'password', inputmode: 'numeric', maxlength: 4, autocomplete: 'off', 'aria-label': 'Manager PIN, 4 digits' });
    const pinSt = section('Manager PIN (optional)', 'A PIN keeps cooks out of the back office. It only keeps honest people out. Skip it if you do not want one.', h('label', { class: 'fs-row' }, h('span', null, '4 digits'), pin),
      // Saves the four-digit PIN, or asks for exactly four digits.
      h('button', { type: 'button', class: 'btn', onClick: async () => {
        const v = pin.value.trim();
        if (!/^\d{4}$/.test(v)) { pinSt.textContent = 'Use exactly 4 digits.'; return; }
        const r = SB.shell && SB.shell.setPin ? await SB.shell.setPin(v) : { ok: false };
        pinSt.textContent = r.ok ? 'PIN set. The back office will ask for it.' : 'The PIN could not be saved.';
        if (r.ok) pin.value = '';
      } }, 'Set PIN'));
    // Cook-ahead: one yes or no. The answer is only remembered for now; a later update will use it.
    const cook = SB.ui.segmented({ label: 'Do you cook meat ahead and hold it hot?', value: U.storage.get(KEY_COOK, 'no'), options: [{ id: 'no', label: 'No' }, { id: 'yes', label: 'Yes' }],
      // Remembers the yes or no answer and says that nothing changes yet.
      onChange: (v) => { U.storage.set(KEY_COOK, v); cookSt.textContent = 'Noted. Nothing changes yet: batch tracking is a later update.'; } });
    const cookSt = section('Cooking ahead', 'Some places cook brisket or pork in the morning and slice it to order. If you do, Smokebox can track the batches and warn you before they run out of time.', cook);
    sheet.body.appendChild(list);
    return sheet;
  }

  // Wraps SB.sheets.open so New ticket with no dishes on the menu opens "Dishes and prices" instead of an empty screen.
  function guardOrder() {
    const real = SB.sheets.open;
    // The same open as before, except New ticket with no dishes sends the owner to add one first.
    SB.sheets.open = function (name, opts) {
      if (name === 'order' && noDishes() && SB.store && SB.store.getState) return real.call(SB.sheets, 'dishes');
      return real.call(SB.sheets, name, opts);
    };
  }
  guardOrder();

  SB.sheets.register('setup', openSetup);
  SB.sheets.register('dishes', openDishes);
  SB.sheets.register('shop', openShop);
  SB.sheets.register('wizard', openDishes); // the old name, kept so older links still open the right sheet
  // dishCount: how many dishes can be ordered. done: setup counts as finished once there is one. noDishes: first run.
  SB.setup = { dishCount: () => activeDishes().length, done: () => activeDishes().length > 0, noDishes, wizardDone: () => activeDishes().length > 0 };
})(typeof globalThis !== 'undefined' ? globalThis : window);
