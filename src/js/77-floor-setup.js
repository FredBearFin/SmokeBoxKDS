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
    // A small "?" help line at the top: the guide pages about setting up and about sound trouble, when the guide is in this build.
    const gl = SB.guide && typeof SB.guide.link === 'function' ? [SB.guide.link('getting-started', 'setting up'), SB.guide.link('troubleshooting', 'no sound')].filter(Boolean) : [];
    if (gl.length) list.appendChild(h('p', { class: 'fs-sub' }, 'Help: ', ...gl.flatMap((a, i) => (i ? [' · ', a] : [a]))));
    // Adds one checklist step: a title, plain words, an optional button and a status line.
    function step(title, words, action) {
      const status = h('p', { class: 'fs-sub', role: 'status' });
      const el = h('section', { class: 'fs-section' }, h('h3', { class: 'fs-h' }, title), h('p', { class: 'fs-sub' }, words), action ? action(status) : null, status);
      list.appendChild(el);
      return status;
    }
    // Runs a step's test and shows what it answers in the step's status line.
    const runStep = (status, fn) => { tell(status, fn() || ''); };
    // Builds a button that runs fn and shows its answer in the step's status line.
    const btn = (label, icon, fn) => (status) => h('button', { type: 'button', class: 'btn', onClick: () => runStep(status, fn) }, ico(icon, 20), h('span', null, label));

    step('1. Sound', 'Warnings use tones and a spoken voice. Browsers only allow sound after a tap, so test it here. Turn the volume up, or plug in a cheap Bluetooth speaker: a tablet speaker is easy to miss in a loud kitchen.',
      btn('Play a test warning', 'volume', () => { if (SB.floor && SB.floor.setSound) { SB.floor.setSound(true); if (SB.floor.setSpeech) SB.floor.setSpeech(true); return 'You should have heard a chime and a voice. If not, turn the tablet volume up and tap again.'; } return 'The kitchen board is not loaded.'; }));
    const wake = SB.floor && SB.floor.wakeLock ? SB.floor.wakeLock() : 'unknown';
    step('2. Keep the screen on', 'The board asks the browser to keep the screen awake' + (wake === 'on' ? ' (it is on now).' : wake === 'unsupported' ? ', but this browser does not support that.' : ', but this browser has not allowed it.') + ' Also set the tablet itself: Settings, Display, Auto-Lock (iPad) or Screen timeout (Android), to Never. Plug the tablet into power.');
    const prot = step('3. Protect your data', 'Everything is saved in this browser only. Ask the browser to keep it safe, and save a backup every day (Menu and settings, then Data). If you cook ahead, save the thrown-out log too.',
      btn('Protect saved data', 'shield-check', () => { try { if (g.navigator.storage && g.navigator.storage.persist) { g.navigator.storage.persist().then((ok) => { prot.textContent = ok ? 'Your browser agreed to keep this data. Still save a backup every day.' : 'The browser did not agree. Installing the app (step 4) usually helps.'; }); return 'Asking the browser...'; } } catch (e) { /* fall through */ } return 'This browser cannot do that. Save a backup every day.'; }));
    step('4. Install as an app', 'On an iPad: Share, then Add to Home Screen. In Chrome on Android or a computer: the menu, then Install app or Add to Home screen. An installed app opens full screen and the browser is less likely to clear its data.');
    step('5. Where the tablet sits', 'Put the tablet where the person at the cutting board can tap it without walking. If it is out of reach, batch times will not get logged and the waste numbers will be wrong.');
    // Closes this sheet and opens the Menu and settings page of the back office.
    const openData = () => { sheet.close('link'); setTimeout(() => { if (SB.shell && SB.shell.ignite) SB.shell.ignite({ section: 'data' }); }, 60); };
    step('6. Your dishes', 'Add your dishes under Dishes and prices, in the Menu. Then open Menu and settings to enter your real cost per kg, the amount at which a dish is sold out, the amount one take-out removes, the hold limit and the rest time for each product. Until you confirm them the dollar numbers are starter estimates.',
      () => h('button', { type: 'button', class: 'btn btn-primary', onClick: openData }, ico('sliders', 20), h('span', null, 'Open Menu and settings')));
    step('7. Hold limits', 'Each product has a hold limit, marked as a quality limit or a safety limit. Ask your health department which limit applies to each food you hold, then set it on the Menu and settings page.');
    sheet.body.appendChild(list); keepInView(sheet.body);
    return sheet;
  }

  // When a box in this sheet gets the cursor, scroll it to the middle so a tablet keyboard never covers what is being typed.
  function keepInView(el) {
    el.addEventListener('focusin', (ev) => {
      const f = ev.target;
      if (!f || !/^(INPUT|TEXTAREA|SELECT)$/.test(f.tagName)) return;
      setTimeout(() => { try { f.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { /* older browsers */ } }, 250);
    });
  }

  /* ---------- helpers for the dish form ---------- */

  // The one way every message in these screens is shown: the words, then a tone (ok or bad) that sets its colour. With no
  // tone given, a message that says something went wrong is shown as bad. An empty message clears it.
  const BAD_WORDS = /^(type |use |enter |closing |keep |that |the pin could not|batch size|minutes|there is|nothing|could not)|could not|cannot|too big|blocked|not saved|is full|would not/i;
  function tell(el, text, tone) {
    if (!el) return;
    el.textContent = text || '';
    el.classList.add('dp-msg');
    const t = !text ? '' : (tone || (BAD_WORDS.test(text) ? 'bad' : 'ok'));
    if (t) el.dataset.tone = t; else delete el.dataset.tone;
    if (t === 'bad') el.setAttribute('role', 'alert'); else el.setAttribute('role', 'status');
  }

  const KEY_DRAFT = 'smokebox.v1.setup.draft'; // the half-typed dish {name, price, zone}, kept so a closed tab loses nothing
  const KEY_LAST = 'smokebox.v1.setup.lastZone'; // the station chosen for the last saved dish
  const KEY_CASKIP = 'smokebox.v1.setup.cookAheadSkipped'; // true once the owner said no to the cooked-ahead question
  const KEY_HIDDEN = 'smokebox.v1.setup.hiddenStations'; // station ids the owner hid from the Where is it made? tiles
  const KEY_EXAMPLES = 'smokebox.v1.setup.examples'; // ids of dishes that came from the example menu

  // What a new dish gets from the station tile alone: its order-screen category, a guessed prep time in seconds
  // (starter estimate, owner to confirm) and whether the cook taps Start then Done or just Done.
  const ZONE_DEFAULT = {
    pit: { cat: 'meat', sec: 300, track: 'two' }, sides: { cat: 'side', sec: 180, track: 'two' },
    fry: { cat: 'fried', sec: 240, track: 'two' }, cold: { cat: 'cold', sec: 60, track: 'one' },
  };
  // A short plain line under each station name on its tile.
  const ZONE_HINT = { pit: 'Smoker, grill or oven', sides: 'Stove and sides', fry: 'Fryer', cold: 'No cooking: drinks, cold sides' };
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
    // The few refusals an owner meets while setting up get one plain sentence each: what happened, then what to do.
    const key = String((res.info && res.info.key) || '');
    if (/price$/.test(key)) words = 'The price has to be between $0 and $1,000. Type it like 12.50.';
    else if (/name$/.test(key) && (res.report === 'nameTaken' || res.report === 'badPatch')) words = 'That name is already taken. Pick another name.';
    else if (/name$/.test(key)) words = 'The name has to be 1 to 60 letters. Shorten it and try again.';
    else if (key === 'menu' || res.report === 'tooManyItems') words = 'Your menu is full (150 dishes). Remove one you no longer sell, then add this one.';
    else if (res.report === 'tooManyIngredients') words = 'You have as many cooked-ahead items as Smokebox can hold. Remove one first.';
    else if (res.report === 'moduleOff') words = 'Cooking ahead is switched off. Turn it on in Tax, hours and PIN, then try again.';
    return { ok: false, info: res.info || {}, words, report: res.report };
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
  // The dishes the owner removed (archived), newest last, so they can be brought back.
  function removedDishes() { return SB.store.getState().menu.filter((m) => m.archived); }
  // True when nothing can be ordered yet: the first-run state that shows the Add your first dish button.
  function noDishes() { return activeDishes().length === 0; }
  // The stations a dish can be made at, in order: only the ones that receive items (not expo).
  function stations() { return SB.config.workZones.map((z) => SB.config.zoneById[z]).filter(Boolean); }
  // The stations still shown as tiles: all of them except the ones the owner hid. At least one always stays.
  function visibleStations() {
    const hid = U.storage.get(KEY_HIDDEN, []);
    const all = stations(), shown = all.filter((z) => hid.indexOf(z.id) < 0);
    return shown.length ? shown : all.slice(0, 1);
  }
  // The guessed category, prep seconds and tap style for a station, with safe values for a custom station.
  function defaultsFor(zoneId) {
    const d = ZONE_DEFAULT[zoneId];
    if (d && SB.config.categoryById[d.cat]) return d;
    return { cat: (SB.config.categories[0] || {}).id, sec: 180, track: 'two' };
  }
  // Reads a typed price the way a person writes it: "12.50", "12,50", "$14", "14.", "USD 12", "1 200". Gives {value, rounded}
  // in dollars, or null when it is not one price. Uses the menu importer's reader when it is in this build.
  function priceInfo(text) {
    const M = SB.menuImport;
    if (M && typeof M.readPrice === 'function') { const r = M.readPrice(text); return r && typeof r.value === 'number' ? { value: r.value, rounded: !!r.rounded } : null; }
    const raw = String(text || '').replace(/[$\s]/g, '').replace(',', '.');
    return /^(\d+\.?\d{0,2}|\.\d{1,2})$/.test(raw) ? { value: parseFloat(raw), rounded: false } : null;
  }
  // The price in dollars, or null when the text is not a price.
  function parsePrice(text) { const i = priceInfo(text); return i ? i.value : null; }
  // Adds one dish with every hidden default filled in. opts may carry prepSec, cat and short from "More options".
  // The prep time is marked as a guess unless the owner typed one. Returns the send() result.
  function addDish(name, price, zone, opts) {
    const o = opts || {}, d = defaultsFor(zone);
    const r = send('addMenuItem', { name, short: o.short || '', zone, cat: o.cat || d.cat, price, prepSec: o.prepSec || d.sec, track: d.track });
    if (r.ok && !o.prepSec && r.info && r.info.id) send('updateMenuItem', { id: r.info.id, patch: { prepConfirmed: false } });
    return r;
  }

  // The hidden "Portions of <dish>" ingredient that counts one dish, or undefined. Never shown as an ingredient.
  function portionIng(m) {
    const s = SB.store.getState();
    return s.ingredients.find((i) => i.forMenu === m.id && !i.archived && (m.bom || []).some((l) => l.ing === i.id));
  }
  // How many portions are left for a dish that is counted, or -1 when the dish is not counted.
  function portionLeft(m) {
    const ing = portionIng(m);
    if (!ing) return -1;
    const v = SB.store.getState().stock[ing.id];
    return typeof v === 'number' ? v : 0;
  }
  // Set by the open Dishes sheet so a row's Stop counting can offer Undo in the sheet's undo bar.
  let undoHook = null;
  // The small "I count what I made" part of a dish row: a start link, or "N left" with +10, a custom add and Stop.
  function portionsRow(m) {
    const left = portionLeft(m), msg = h('span', { class: 'fs-sub', role: 'status' });
    const box = h('div', { class: 'dp-por' });
    // Says what went wrong in plain words, such as a dish that already lists ingredients.
    const say = (r) => { tell(msg, r.ok ? '' : (r.report === 'portionsConflict' ? 'This dish already uses ingredients, so it cannot be counted by portions too.' : r.words)); };
    if (left < 0) {
      const cnt = h('input', { class: 'input dp-num', type: 'text', inputmode: 'numeric', placeholder: 'How many?', 'aria-label': 'How many ' + m.name + ' you made' });
      // Starts counting portions for this dish at the typed number.
      const go = h('button', { type: 'button', class: 'btn btn-sm', onClick: () => {
        const n = cnt.value.trim() === '' ? 0 : Number(cnt.value);
        if (!Number.isInteger(n) || n < 0) { tell(msg, 'Type a whole number, like 20.'); return; }
        say(send('setPortions', { menuId: m.id, on: true, count: n }));
      } }, 'Start counting');
      const fold = h('details', { class: 'dp-fold' }, h('summary', null, h('span', null, 'I count what I made')), h('div', { class: 'fs-row' }, cnt, go, h('span', { class: 'fs-sub' }, 'Sells out when the count reaches zero.')));
      box.append(fold, msg);
      return box;
    }
    const more = h('input', { class: 'input dp-num', type: 'text', inputmode: 'numeric', placeholder: 'Add', 'aria-label': 'Portions of ' + m.name + ' to add' });
    box.append(h('strong', { class: 'dp-left' }, left + ' left' + (left < 1 ? ' (sold out)' : '')),
      // Adds ten portions to the count in one tap.
      h('button', { type: 'button', class: 'btn btn-sm', onClick: () => say(send('restock', { ing: portionIng(m).id, g: 10 })) }, '+10'),
      // Adds the typed number of portions to the count.
      more, h('button', { type: 'button', class: 'btn btn-sm', onClick: () => { const n = Number(more.value); if (!Number.isInteger(n) || n <= 0) { tell(msg, 'Type how many you made, like 12.'); return; } say(send('restock', { ing: portionIng(m).id, g: n })); more.value = ''; } }, 'Add'),
      // Stops counting portions for this dish; the books stay whole.
      h('button', { type: 'button', class: 'btn btn-sm', onClick: () => { const r = send('setPortions', { menuId: m.id, on: false }); say(r); if (r.ok && undoHook) undoHook('Stopped counting ' + m.name + '.', () => { send('setPortions', { menuId: m.id, on: true, count: 0 }); }); } }, 'Stop counting'), msg);
    return box;
  }
  // True when the cook-ahead module is on (an old saved kitchen with no setting counts as on).
  function cookOn() { return SB.engine && SB.engine.moduleOn ? SB.engine.moduleOn(SB.store.getState(), 'cookAhead') : true; }
  // The cooked-ahead items the owner has made: cook-ahead food that is not archived.
  function cookItems() { return SB.store.getState().ingredients.filter((i) => i.tcs && !i.archived); }

  /* ---------- Try the demo ---------- */

  // Asks once, in plain words, then opens the demo: a practice kitchen in this tab. The owner's own kitchen is saved first
  // and comes back with the Back to my kitchen button.
  async function tryDemo(skipAsk) {
    const store = SB.store;
    if (!store.enterDemo || store.isDemo()) return false;
    const ok = skipAsk || !SB.ui.confirm ? true : await SB.ui.confirm({ title: 'Try the demo?', confirmLabel: 'Try the demo', cancelLabel: 'Not now',
      body: ['The demo is a demo kitchen with a sample menu and sample tickets. Nothing in it is your kitchen.', 'Your own dishes and orders are not touched. A bar at the top of every screen has a Back to my kitchen button.'] });
    if (!ok) return false;
    if (!store.enterDemo() && SB.ui.toast) SB.ui.toast('This browser would not open the demo. Try again, or add ?demo to the address.', { tone: 'warn' });
    return true;
  }
  // The body of the Demo sheet in a real kitchen: what the demo is, and one button that opens it.
  function demoIntro() {
    return h('div', { class: 'dm' }, h('section', { class: 'fs-section' }, h('h3', { class: 'fs-h' }, 'Try the demo'),
      h('p', { class: 'fs-sub' }, 'A demo kitchen with a sample menu, sample tickets and a crew that sends orders, so you can see Smokebox busy. Nothing in it is your kitchen, and nothing you do there reaches your real dishes, orders or numbers.'),
      h('p', { class: 'fs-sub' }, 'A bar at the top of every demo screen says so and has a Back to my kitchen button. Leaving erases the demo.'),
      // Opens the demo after the plain-words question.
      h('button', { type: 'button', class: 'btn btn-primary btn-lg', dataset: { act: 'try-demo' }, onClick: () => tryDemo(true) }, ico('play', 22), h('span', null, 'Try the demo'))));
  }

  /* ---------- the Dishes and prices sheet ---------- */

  // Opens "Dishes and prices": the add form on top, the dishes added so far, and a small fold of extra ways to start.
  function openDishes() {
    const sheet = SB.ui.sheet({ title: 'Dishes and prices', side: 'right', width: 'min(720px, 96vw)', name: 'dishes', onClose: () => offs.splice(0).forEach((f) => f()) });
    const offs = [];
    const root = h('div', { class: 'dp' });
    const lead = h('p', { class: 'fs-sub dp-lead' });

    // The form: name, price, where it is made. Station tiles are big buttons that behave like radio buttons.
    const nameIn = h('input', { class: 'input dp-name', type: 'text', maxlength: 60, autocomplete: 'off', placeholder: 'Brisket plate', autocapitalize: 'words', spellcheck: 'false', enterkeyhint: 'next' });
    const nameField = SB.ui.field({ label: 'What is it called?', control: nameIn });
    const priceIn = h('input', { class: 'input dp-price', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: '12.50' });
    const priceField = SB.ui.field({ label: 'Price in dollars', control: priceIn });
    const priceEcho = h('p', { class: 'fs-sub dp-echo', 'aria-live': 'polite' });
    priceField.appendChild(priceEcho);
    // Shows what Smokebox understood from the typed price before anything is saved, so "12,50" is never a surprise.
    priceIn.addEventListener('input', () => { const i = priceInfo(priceIn.value); tell(priceEcho, i ? 'Reads as ' + U.fmtMoney(i.value) + (i.rounded ? ' (rounded to the cent)' : '') : '', 'ok'); });
    let zone = '';
    const tiles = h('div', { class: 'dp-tiles', role: 'radiogroup', 'aria-label': 'Where it is made' });
    const zoneErr = h('div', { class: 'field-error', role: 'alert', hidden: true });
    const whereLabel = h('div', { class: 'field-label' }, 'Where is it made?');
    // Builds one tile per visible station. With only one station there is nothing to ask, so the tiles are hidden
    // and that station is used for every dish.
    function paintTiles() {
      U.clear(tiles);
      const shown = visibleStations();
      shown.forEach((z) => {
        const tile = h('button', { type: 'button', class: 'dp-tile', role: 'radio', 'aria-checked': 'false', dataset: { zone: z.id } },
          ico(z.icon || 'pot', 28), h('strong', null, z.name), h('span', null, ZONE_HINT[z.id] || ''));
        // Picks this station and remembers it for the next dish.
        tile.addEventListener('click', () => { pickZone(z.id); U.storage.set(KEY_LAST, z.id); saveDraft(); });
        tiles.appendChild(tile);
      });
      const one = shown.length === 1;
      tiles.hidden = one; whereLabel.hidden = one;
      if (one) zone = shown[0].id;
      else if (!shown.some((z) => z.id === zone)) zone = '';
      pickZone(zone);
    }
    // Shows which station tile is chosen and clears the "tap where it is made" message.
    function pickZone(id) {
      zone = id; zoneErr.hidden = true;
      tiles.querySelectorAll('.dp-tile').forEach((b) => b.setAttribute('aria-checked', b.dataset.zone === id ? 'true' : 'false'));
    }
    // Change stations: rename, hide or add one, using the same saved names the board and tickets read.
    const stSt = h('p', { class: 'fs-sub', role: 'status' });
    const stList = h('div', { class: 'dp-stlist' });
    // Reloads the page so the board and tickets pick up the new station names.
    const stReload = h('button', { type: 'button', class: 'btn btn-sm', hidden: true, onClick: () => g.location.reload() }, ico('refresh', 18), h('span', null, 'Reload to show on the board'));
    // Saves a change to the owner's station names through SB.config (checked first, so a bad name changes nothing).
    function commitNames(mutate) {
      const C = SB.config;
      const spec = JSON.parse(JSON.stringify(C.customSpec()));
      spec.rename = spec.rename || {}; spec.add = spec.add || {};
      mutate(spec);
      const before = C.customSpec(), res = C.applyCustom(spec);
      if (res.rejected.length) { C.applyCustom(before); tell(stSt, 'That name cannot be used: it is empty, longer than ' + C.customLimits.name + ' letters, or already taken.'); return false; }
      if (!C.saveCustom(spec)) { tell(stSt, 'This browser would not save the change.'); return false; }
      tell(stSt, 'Saved. Tickets and the board show the new name after you reload.'); stReload.hidden = false;
      paintStations(); paintTiles();
      return true;
    }
    // Rebuilds the station rows: a name box, Hide or Show, and an add box at the end.
    function paintStations() {
      U.clear(stList);
      const hid = U.storage.get(KEY_HIDDEN, []);
      stations().forEach((z) => {
        const inp = h('input', { class: 'input', type: 'text', maxlength: SB.config.customLimits.name, value: z.name, 'aria-label': 'Name of station ' + z.name });
        inp.addEventListener('change', () => { if (inp.value.trim() !== z.name) commitNames((sp) => { sp.rename.zones = Object.assign({}, sp.rename.zones, { [z.id]: inp.value }); }); });
        const isHid = hid.indexOf(z.id) >= 0;
        // Hides this station from the tiles, or shows it again, keeping at least one.
        const hideBtn = h('button', { type: 'button', class: 'btn btn-sm', onClick: () => {
          const now = U.storage.get(KEY_HIDDEN, []).filter((x) => x !== z.id);
          if (!isHid) now.push(z.id);
          if (stations().every((s) => now.indexOf(s.id) >= 0)) { tell(stSt, 'Keep at least one station in use.'); return; }
          U.storage.set(KEY_HIDDEN, now); tell(stSt, isHid ? z.name + ' is in use again.' : z.name + ' is marked not used: it leaves the tiles here and its tab on the board while it has no tickets. Dishes already made there keep it.');
          paintStations(); paintTiles();
          if (SB.floor && SB.floor.applyHiddenTabs) SB.floor.applyHiddenTabs();
        } }, isHid ? 'Use again' : 'Not used');
        stList.appendChild(h('div', { class: 'dp-strow' }, inp, hideBtn));
      });
      const addIn = h('input', { class: 'input', type: 'text', maxlength: SB.config.customLimits.name, placeholder: 'New station, like Bar', 'aria-label': 'New station name' });
      // Adds a new station with the typed name, after the same checks as a rename.
      stList.appendChild(h('div', { class: 'dp-strow' }, addIn, h('button', { type: 'button', class: 'btn btn-sm', onClick: () => { if (addIn.value.trim()) commitNames((sp) => { sp.add.zones = (sp.add.zones || []).concat([{ name: addIn.value }]); }); } }, ico('plus', 18), h('span', null, 'Add station'))));
    }
    const stFold = h('details', { class: 'dp-fold dp-stfold' }, h('summary', null, ico('chevron-down', 18), h('span', null, 'Change stations')),
      h('div', { class: 'dp-more' }, h('p', { class: 'fs-sub' }, 'Name the places in your kitchen the way your cooks say them. Tap Not used on any you do not have. If you only have one, you will not be asked.'), stList, stSt, stReload));
    paintStations(); paintTiles();
    const whereBlock = h('div', { class: 'field' }, whereLabel, tiles, zoneErr, stFold);

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

    // A line under the name box that appears when the typed name belongs to a removed dish: one tap brings it back.
    const backRow = h('div', { class: 'fs-note dp-back', hidden: true, role: 'alert' });
    nameField.appendChild(backRow);
    // Shows "X was removed earlier" with a Bring it back button that un-archives it at the typed price.
    function showBringBack(m, price) {
      U.clear(backRow);
      // Brings the removed dish back, at the price typed in the form.
      backRow.append(h('span', null, m.name + ' was removed earlier. '), h('button', { type: 'button', class: 'btn btn-sm', dataset: { act: 'bring-back' }, onClick: () => {
        const r = send('updateMenuItem', { id: m.id, patch: price != null && price !== m.price ? { archived: false, price } : { archived: false } });
        backRow.hidden = true;
        if (r.ok) { nameIn.value = ''; priceIn.value = ''; saveDraft(); tell(status, m.name + ' is back on your menu.'); } else tell(status, r.words);
      } }, 'Bring it back'));
      backRow.hidden = false;
    }
    // Checks the form and saves one dish. Returns true when it saved. Each problem shows beside its own box.
    function saveOne() {
      tell(status, ''); nameField.setError(null); priceField.setError(null); backRow.hidden = true;
      const name = nameIn.value.replace(/\s+/g, ' ').trim();
      const price = parsePrice(priceIn.value);
      if (!name) { nameField.setError('Type the dish name.'); nameIn.focus(); return false; }
      if (price == null) { priceField.setError('Type the price in dollars, like 12.50.'); priceIn.focus(); return false; }
      if (!zone) { zoneErr.replaceChildren(ico('alert-circle', 18), h('span', null, 'Tap where it is made.')); zoneErr.hidden = false; return false; }
      let prepSec = 0;
      if (minIn.value.trim()) {
        const mins = readNum(minIn);
        if (mins == null || mins < 0.1 || mins > 60) { tell(status, 'Minutes to make one: type a number from 1 to 60, or leave it empty.'); more.open = true; minIn.focus(); return false; }
        prepSec = Math.round(mins * 60);
      }
      const r = addDish(name, price, zone, { prepSec, cat: catSel.value, short: shortIn.value.trim() });
      if (!r.ok) {
        const gone = removedDishes().find((m) => m.name.toLowerCase() === name.toLowerCase());
        if (gone) showBringBack(gone, price);
        else if (/name/.test((r.info && r.info.key) || '')) nameField.setError('There is already a dish called ' + name + '. Pick another name.');
        else tell(status, r.words);
        return false;
      }
      tell(status, 'Saved ' + name + ' at ' + U.fmtMoney(price) + '.');
      nameIn.value = ''; priceIn.value = ''; tell(priceEcho, ''); minIn.value = ''; catSel.value = ''; shortIn.value = '';
      saveDraft();
      return true;
    }
    form.addEventListener('submit', (ev) => { ev.preventDefault(); if (saveOne()) nameIn.focus(); });
    // Save and finish: saves what is typed (or just closes when the form is empty).
    done.addEventListener('click', () => {
      const empty = !nameIn.value.trim() && !priceIn.value.trim();
      if (empty || saveOne()) sheet.close('done');
    });

    // The Undo line after a Remove, and a fold that lists removed dishes so any can be brought back later.
    const undoBar = h('div', { class: 'fs-note dp-undo', hidden: true, role: 'status' });
    // Shows a plain message with an Undo button that runs the given undo step. Used after Remove, a move and Stop counting.
    function showUndo(message, undo) {
      U.clear(undoBar);
      // Runs the undo step and puts the bar away.
      undoBar.append(h('span', null, message + ' '), h('button', { type: 'button', class: 'btn btn-sm', dataset: { act: 'undo-remove' }, onClick: () => { undo(); undoBar.hidden = true; } }, 'Undo'));
      undoBar.hidden = false;
    }
    // Moves a dish one place up or down among the dishes on the menu (the order screen follows this order within a category).
    function moveDish(m, dir) {
      const menu = SB.store.getState().menu, act = menu.filter((x) => !x.archived);
      const other = act[act.findIndex((x) => x.id === m.id) + dir];
      if (!other) return;
      const from = menu.findIndex((x) => x.id === m.id), to = menu.findIndex((x) => x.id === other.id);
      if (send('moveMenuItem', { id: m.id, toIndex: to }).ok) showUndo('Moved ' + m.name + (dir < 0 ? ' up.' : ' down.'), () => { send('moveMenuItem', { id: m.id, toIndex: from }); });
    }
    undoHook = showUndo; offs.push(() => { undoHook = null; });
    const dishesHead = h('h3', { class: 'fs-h dp-h' }, 'Your dishes');
    const goneList = h('div', { class: 'dp-list' });
    const goneFold = h('details', { class: 'dp-fold dp-gone' }, h('summary', null, ico('chevron-down', 18), h('span', null, 'Removed dishes')), h('div', { class: 'dp-more' }, goneList));
    // Lists removed dishes with a Bring it back button each; the fold hides when there are none.
    function paintGone() {
      const list = removedDishes().slice(-30);
      goneFold.hidden = list.length === 0;
      U.clear(goneList);
      list.forEach((m) => goneList.appendChild(h('div', { class: 'dp-row' }, h('span', { class: 'grow' }, m.name + ' (' + U.fmtMoney(m.price) + ')'), h('button', { type: 'button', class: 'btn btn-sm', onClick: () => { send('updateMenuItem', { id: m.id, patch: { archived: false } }); } }, 'Bring it back'))));
    }
    // The dishes so far: each row is a name box, a price box and Remove. Changes save when the box is left.
    const listBox = h('div', { class: 'dp-list' });
    let listSig = '';
    // Rebuilds the list of dishes when it has changed and no box in it is being typed in.
    function paintList() {
      const mine = activeDishes();
      const sig = mine.map((m) => m.id + '|' + m.name + '|' + m.price + '|' + m.zone + '|' + m.cat + '|' + portionLeft(m)).join(';');
      const typing = listBox.contains(doc.activeElement) && /^(INPUT|SELECT|TEXTAREA)$/.test(doc.activeElement.tagName);
      if (sig === listSig || typing) return;
      listSig = sig;
      dishesHead.hidden = mine.length === 0;
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
          if (pv == null) { tell(msg, 'Type the price like 12.50.'); pr.value = m.price.toFixed(2); return; }
          if (!Object.keys(patch).length) return;
          const r = send('updateMenuItem', { id: m.id, patch });
          tell(msg, r.ok ? 'Saved.' : r.words);
          if (!r.ok) { n.value = m.name; pr.value = m.price.toFixed(2); }
        };
        n.addEventListener('change', save); pr.addEventListener('change', save);
        const rm = h('button', { type: 'button', class: 'btn btn-sm', 'aria-label': 'Remove ' + m.name, onClick: () => {
          // Removing archives the dish: it can no longer be ordered, and old tickets keep it. Undo is offered at once.
          if (send('updateMenuItem', { id: m.id, patch: { archived: true } }).ok) showUndo('Removed ' + m.name + '.', () => { send('updateMenuItem', { id: m.id, patch: { archived: false } }); });
        } }, ico('x', 18), h('span', null, 'Remove'));
        const idx = mine.indexOf(m);
        // Up and down buttons: plain moves, each one place; the ends are switched off.
        const moveBox = h('span', { class: 'dp-move' },
          h('button', { type: 'button', class: 'btn btn-icon', 'aria-label': 'Move ' + m.name + ' up', disabled: idx === 0, onClick: () => moveDish(m, -1) }, ico('arrow-up', 20)),
          // Moves this dish one place up in the menu order.
          h('button', { type: 'button', class: 'btn btn-icon', 'aria-label': 'Move ' + m.name + ' down', disabled: idx === mine.length - 1, onClick: () => moveDish(m, 1) }, ico('arrow-down', 20)));
        // Move to: the category this dish sits in on the order screen, changed with one pick.
        const catSelRow = h('select', { class: 'select dp-cat', 'aria-label': 'Category of ' + m.name }, SB.config.categories.map((c) => h('option', { value: c.id, selected: c.id === m.cat }, c.name)));
        // Saves the new category for this dish and says so.
        catSelRow.addEventListener('change', () => { const r = send('updateMenuItem', { id: m.id, patch: { cat: catSelRow.value } }); tell(msg, r.ok ? 'Moved to ' + (SB.config.categoryById[catSelRow.value] || {}).name + '.' : r.words); });
        const z = SB.config.zoneById[m.zone];
        listBox.appendChild(h('div', { class: 'dp-row' }, moveBox, n, pr, catSelRow, h('span', { class: 'chip dp-zone' }, z ? z.name : m.zone), ex.indexOf(m.id) >= 0 ? h('span', { class: 'chip dp-ex', 'data-tone': 'warn' }, 'Example') : null, rm, msg, portionsRow(m)));
      });
    }
    paintList(); paintGone();
    offs.push(SB.store.subscribe(() => { paintList(); paintGone(); }));

    // Cooked-ahead food: shown only when that module is on and there is a dish. Optional; never needed to order.
    const caBox = h('section', { class: 'fs-card dp-ca', hidden: true });
    // Paints the question (before any item), or the list of cooked-ahead items with Add another.
    function paintCook() {
      const items = cookItems();
      const on = cookOn();
      const show = activeDishes().length > 0 && (on ? (items.length > 0 || !U.storage.get(KEY_CASKIP, false)) : (!U.storage.get(KEY_CASKIP, false) && items.length === 0));
      caBox.hidden = !show;
      if (!show) return;
      U.clear(caBox);
      // Opens the sheet that adds one cooked-ahead item.
      const add = h('button', { type: 'button', class: 'btn btn-primary', dataset: { act: 'add-cooked' }, onClick: () => {
        // Saying yes while the cook-ahead part is off turns it on first, then opens the sheet for the first item.
        if (!cookOn()) send('updateSettings', { patch: { modules: { cookAhead: true } } });
        SB.sheets.open('cookahead');
      } }, ico('plus', 20), h('span', null, items.length ? 'Add another cooked-ahead item' : cookOn() ? 'Add a cooked-ahead item' : 'Yes, I cook ahead'));
      if (!items.length) {
        caBox.append(h('h3', { class: 'fs-h' }, 'Do you cook any of this ahead and hold it?'),
          h('p', { class: 'fs-sub' }, 'Chili in a warmer, potato salad in a cooler. If you do, Smokebox can track each batch and warn you before it runs out of time. You can skip this and still take orders.'),
          // Remembers the owner said no, so the question goes away.
          h('div', { class: 'fs-row' }, add, h('button', { type: 'button', class: 'btn', dataset: { act: 'skip-cooked' }, onClick: () => { U.storage.set(KEY_CASKIP, true); paintCook(); } }, 'No, skip this')));
      } else {
        caBox.append(h('h3', { class: 'fs-h' }, 'Cooked-ahead food'),
          h('div', { class: 'dp-list' }, items.map((i) => h('div', { class: 'dp-row' }, h('strong', null, i.name), h('span', { class: 'chip' }, (i.hold === 'cold' ? 'Cold' : 'Hot') + ', up to ' + i.maxHoldH + ' h')))), h('div', { class: 'fs-row' }, add));
      }
    }
    paintCook();
    offs.push(SB.store.subscribe(() => paintCook()));

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
      tell(exStatus, n ? 'Added ' + n + ' example dishes with made-up prices. Each one is marked Example: change its name and price, or tap Remove.' : 'Those example dishes are already on your menu.');
    });
    const exRemove = h('button', { type: 'button', class: 'btn', dataset: { act: 'example-remove' } }, ico('x', 20), h('span', null, 'Remove all example dishes'));
    // Archives every dish that came from the example menu, in one tap.
    exRemove.addEventListener('click', () => {
      const ids = U.storage.get(KEY_EXAMPLES, []);
      ids.forEach((id) => send('updateMenuItem', { id, patch: { archived: true } }));
      U.storage.set(KEY_EXAMPLES, []);
      tell(exStatus, 'Example dishes removed.');
    });
    const ways = h('details', { class: 'dp-fold dp-ways' }, h('summary', null, ico('chevron-down', 18), h('span', null, 'More ways to add dishes')),
      h('div', { class: 'dp-more' }, h('p', { class: 'fs-sub' }, 'An example menu with sample prices, so you can see how Smokebox looks with food on it. You can edit or remove every dish.'), h('div', { class: 'fs-row' }, exBtn, exRemove), exStatus,
        // A quiet link to the optional menu import screen.
        h('p', { class: 'fs-sub' }, h('button', { type: 'button', class: 'btn btn-link', dataset: { act: 'open-import' }, onClick: () => SB.sheets.open('menuimport') }, 'Have a menu file? Import it'))));

    // Links to the other small settings and to the full menu editor in the back office.
    const shopBtn = h('button', { type: 'button', class: 'btn', onClick: () => { sheet.close('link'); setTimeout(() => SB.sheets.open('shop'), 60); } }, ico('sliders', 20), h('span', null, 'Tax, hours and PIN'));
    const fullBtn = h('button', { type: 'button', class: 'btn', onClick: () => { sheet.close('link'); setTimeout(() => { if (SB.shell && SB.shell.ignite) SB.shell.ignite({ section: 'data' }); }, 60); } }, ico('gauge', 20), h('span', null, 'Full menu editor (ingredients, prep times)'));
    root.append(lead, form, dishesHead, undoBar, listBox, goneFold, caBox, ways, h('div', { class: 'fs-row dp-links' }, shopBtn, fullBtn));
    sheet.body.appendChild(root); keepInView(root);

    // Restore a draft left by a closed tab, then the last station used.
    const d = U.storage.get(KEY_DRAFT, null);
    if (d && typeof d === 'object') { nameIn.value = String(d.name || ''); priceIn.value = String(d.price || ''); priceIn.dispatchEvent(new g.Event('input')); }
    const last = (d && d.zone) || U.storage.get(KEY_LAST, '');
    if (last && visibleStations().some((z) => z.id === last) && visibleStations().length > 1) pickZone(last);
    setTimeout(() => nameIn.focus(), 50);
    return sheet;
  }

  /* ---------- the Cooked-ahead food sheet ---------- */

  // Opens "Cooked-ahead food": name, hot or cold, how long it may stay, a usual batch size and which dishes use it.
  // Saves the item with addIngredient, then gives each chosen dish a recipe line. Nothing here is needed to take orders.
  function openCookAhead() {
    const sheet = SB.ui.sheet({ title: 'Cooked-ahead food', side: 'right', width: 'min(720px, 96vw)', name: 'cookahead' });
    const nameIn = h('input', { class: 'input dp-name', type: 'text', maxlength: 60, autocomplete: 'off', placeholder: 'Brisket' });
    const nameField = SB.ui.field({ label: 'What do you cook ahead?', control: nameIn });
    const kind = SB.ui.segmented({ label: 'Is it kept hot or cold?', value: 'hot', options: [{ id: 'hot', label: 'Hot' }, { id: 'cold', label: 'Cold' }] });
    const hoursIn = h('input', { class: 'input dp-num', type: 'text', inputmode: 'decimal', value: '4', 'aria-label': 'Hours it may stay' });
    const hoursField = SB.ui.field({ label: 'How long may it stay, in hours?', control: hoursIn, hint: '4 hours is a careful starting point. Your local health code decides what is allowed: ask your health department and change this to match.' });
    const kgIn = h('input', { class: 'input dp-num', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: 'optional', 'aria-label': 'Usual batch size in kilograms' });
    const kgField = SB.ui.field({ label: 'Usual batch size, in kg', control: kgIn, hint: 'A normal pan or batch, like 4. Leave it empty if you are not sure.' });
    // One checkbox row per dish: tick the dishes that use this food and say about how many grams each takes.
    const dishRows = activeDishes().map((m) => {
      const cb = h('input', { type: 'checkbox', 'aria-label': m.name + ' uses it', disabled: portionLeft(m) >= 0 });
      const gIn = h('input', { class: 'input dp-num', type: 'text', inputmode: 'numeric', value: '150', 'aria-label': 'Grams of it in one ' + m.name });
      return { m, cb, gIn, el: h('div', { class: 'dp-row' }, h('label', { class: 'grow' }, cb, ' ' + m.name + (portionLeft(m) >= 0 ? ' (counted by portions)' : '')), h('span', { class: 'fs-sub' }, 'grams in one:'), gIn) };
    });
    const dishBox = h('div', { class: 'field' }, h('div', { class: 'field-label' }, 'Which dishes use it?'), h('p', { class: 'fs-sub' }, 'Select each dish and enter the grams of it in one serving (150 is a starting guess). Smokebox takes that much off the batch when the dish is made.'), h('div', { class: 'dp-list' }, dishRows.map((r) => r.el)));
    const status = h('p', { class: 'fs-sub', role: 'status' });
    const after = h('div', { class: 'fs-row', hidden: true });
    let warnedNoDish = false;
    // Selecting a dish clears the one-time warning, so a later empty save warns again.
    dishRows.forEach((x) => x.cb.addEventListener('change', () => { warnedNoDish = false; }));
    // Saves the item and links the ticked dishes; says plainly what happened and what to do next.
    const save = h('button', { type: 'button', class: 'btn btn-primary btn-lg', dataset: { act: 'save-cooked' }, onClick: () => {
      nameField.setError(null); hoursField.setError(null); tell(status, '');
      const name = nameIn.value.replace(/\s+/g, ' ').trim(), hrs = readNum(hoursIn), kg = kgIn.value.trim() ? readNum(kgIn) : null;
      if (!name) { nameField.setError('Type what you cook ahead.'); return; }
      if (hrs == null || hrs < 0.5 || hrs > 12) { hoursField.setError('Type hours from 0.5 to 12.'); return; }
      if (kgIn.value.trim() && (kg == null || kg <= 0 || kg > 1000)) { tell(status, 'Batch size: type kilograms like 4, or leave it empty.'); return; }
      // With dishes on the menu but none selected, nothing would use this item: say so once, and save only on a second tap.
      if (dishRows.length && !dishRows.some((x) => x.cb.checked) && !warnedNoDish) {
        warnedNoDish = true;
        tell(status, 'No dish is selected, so nothing will use this item and it will not count down. Select a dish above, or tap Save again to keep it without one.', 'bad');
        return;
      }
      const payload = { name, unit: 'g', tcs: true, hold: kind.getValue(), maxHoldH: hrs, holdBasis: 'safety' };
      if (kg) payload.parG = Math.round(kg * 1000);
      const r = send('addIngredient', payload);
      if (!r.ok) { if (r.report === 'nameTaken') nameField.setError('You already have an item called ' + name + '.'); else tell(status, r.words); return; }
      let linked = 0;
      dishRows.filter((x) => x.cb.checked).forEach((x) => {
        const grams = Number(x.gIn.value);
        if (!Number.isFinite(grams) || grams <= 0) return;
        const cur = SB.store.getState().menu.find((mm) => mm.id === x.m.id);
        const bom = (cur.bom || []).concat([{ ing: r.info.id, qty: grams }]);
        if (send('updateMenuItem', { id: x.m.id, patch: { bom } }).ok) linked++;
      });
      tell(status, 'Added ' + name + (linked ? ' and linked it to ' + linked + ' ' + U.plural(linked, 'dish', 'dishes') : '') + '. Log your first batch in the cabinet when you cook one.');
      save.hidden = true; after.hidden = false;
      U.clear(after);
      // Opens the cabinet on a new batch of the item just added.
      after.append(h('button', { type: 'button', class: 'btn btn-primary btn-lg', dataset: { act: 'log-first-batch' }, onClick: () => { sheet.close('link'); setTimeout(() => SB.sheets.open('hold', { tab: 'new', ing: r.info.id }), 60); } }, 'Log a first batch'),
        // Closes the sheet without logging a batch.
        h('button', { type: 'button', class: 'btn btn-lg', onClick: () => sheet.close('done') }, 'Done for now'));
    } }, ico('check', 22), h('span', null, 'Save cooked-ahead item'));
    sheet.body.appendChild(h('div', { class: 'dp' }, h('p', { class: 'fs-sub' }, 'Optional. Skip this and you can still take every order. Later you can add more from the Cabinet.'),
      h('div', { class: 'dp-form' }, nameField, h('div', { class: 'field' }, h('div', { class: 'field-label' }, 'Hot or cold'), kind), hoursField, kgField, dishBox, h('div', { class: 'fs-row' }, save), status, after)));
    keepInView(sheet.body);
    setTimeout(() => nameIn.focus(), 50);
    return sheet;
  }

  /* ---------- the Import a menu sheet ---------- */

  // Opens "Import a menu": choose a file or paste text, check it, fix the rows in a preview, then import the ticked ones.
  // Also has "Export my menu". Optional; the form is still the easy way to add dishes.
  function openImport() {
    const M = SB.menuImport;
    const sheet = SB.ui.sheet({ title: 'Import a menu', side: 'right', width: 'min(900px, 96vw)', name: 'menuimport' });
    const root = h('div', { class: 'dp' });
    if (!M) { sheet.body.appendChild(h('p', { class: 'fs-sub' }, 'Menu import is not part of this copy of Smokebox.')); return sheet; }
    const area = h('textarea', { class: 'textarea', rows: 5, spellcheck: 'false', autocomplete: 'off', 'aria-label': 'Paste your menu here', placeholder: 'Paste your menu here, one dish per line like "Pulled pork plate 12.50", or the text of a spreadsheet.' });
    const fileIn = h('input', { type: 'file', accept: '.csv,.tsv,.txt,text/csv,text/plain', 'aria-label': 'Choose a menu file' });
    const status = h('p', { class: 'fs-sub', role: 'status' });
    const preview = h('div', { class: 'dp-preview' });
    let parsed = null, rows = [];
    // The station used for a row that names none: the first station still in use.
    const defaultZone = () => visibleStations()[0].id;
    // Runs the importer on the text and draws the preview, or says plainly what is wrong with the text.
    function check(text, from) {
      U.clear(preview); tell(status, '');
      const res = M.parse(text, { existing: SB.store.getState().menu });
      if (res.error) { tell(status, res.error); parsed = null; return; }
      parsed = res; rows = res.rows.map((r) => Object.assign({ keep: r.ok && !r.hidden }, r));
      // A category that is only digits usually means a price like 4,50 was split at its comma: warn, and leave the row unticked.
      rows.forEach((r) => {
        // The importer's own warnings about extra columns or a digits-only category also leave the row unticked.
        if ((r.problems || []).some((p) => p.code === 'extraColumns' || p.code === 'numericCategory')) { r.keep = false; return; }
        if (/^\d+$/.test(String(r.categoryText || '').trim())) { r.problems = (r.problems || []).concat([{ code: 'priceSplit', level: 'warn', message: 'The category here is "' + r.categoryText + '", which looks like the end of a price split at a comma (4,50).', fix: 'Check the price, tick the row when it is right. In your file, put prices with commas inside quotes.' }]); r.keep = false; }
      });
      if (res.summary && res.summary.unmatched) res.summary.unmatched.categories = res.summary.unmatched.categories.filter((c) => !/^\d+$/.test(String(c).trim()));
      paintPreview(from);
    }
    // Says why a typed name cannot be used: 'removed' (a removed dish has it), 'menu' (a dish on the menu), 'list' (another row here), or ''.
    function takenBy(r) {
      const nm = String(r.name || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const hit = SB.store.getState().menu.find((m) => m.name.toLowerCase() === nm);
      if (hit) return hit.archived ? 'removed' : 'menu';
      return rows.some((o) => o !== r && o.keep && String(o.name || '').trim().toLowerCase() === nm) ? 'list' : '';
    }
    // True when an edited row can be imported: a name, a price from 0 to 1000 and a name that is not taken.
    function rowOk(r) {
      const nm = String(r.name || '').replace(/\s+/g, ' ').trim();
      return !!nm && nm.length <= 60 && typeof r.price === 'number' && r.price >= 0 && r.price <= 1000 && !takenBy(r);
    }
    // Draws the format line, any file notes, the table of rows (tick, name, price, station, problems) and the Import button.
    function paintPreview(from) {
      U.clear(preview);
      const sm = parsed.summary;
      preview.append(h('p', { class: 'fs-sub dp-fmt' }, 'Read ' + (from || 'the text') + ' as: ' + parsed.label + '. ' + sm.message));
      (sm.notes || []).forEach((n) => preview.appendChild(h('p', { class: 'fs-note', 'data-tone': 'warn' }, n)));
      // Words in the file that match none of the owner's categories or stations: say it once, and offer to add the categories.
      const um = sm.unmatched || { stations: [], categories: [] };
      if (um.categories.length) {
        // Adds the file's category words as the owner's own categories, then reads the file again so each dish lands in its own.
        const addCats = h('button', { type: 'button', class: 'btn btn-sm', dataset: { act: 'import-add-cats' }, onClick: () => {
          const C = SB.config, spec = JSON.parse(JSON.stringify(C.customSpec()));
          spec.add = spec.add || {}; spec.add.categories = (spec.add.categories || []).concat(um.categories.map((nm) => ({ name: nm })));
          const before = C.customSpec(), res = C.applyCustom(spec);
          if (res.rejected.length) { C.applyCustom(before); tell(status, 'Some of those category names could not be added (too long, a repeat, or the list is full). Change the category words in the file, or add them one by one in the Back office.', 'bad'); return; }
          C.saveCustom(spec); check(area.value, 'the file');
          tell(status, 'Added ' + um.categories.length + ' ' + U.plural(um.categories.length, 'category', 'categories') + '. Each dish now sits in its own.', 'ok');
        } }, 'Add these categories');
        preview.appendChild(h('div', { class: 'fs-note', 'data-tone': 'warn' }, h('div', null, h('p', null, 'Your file has categories that are not set up here: ' + um.categories.join(', ') + '. Until you add them, those dishes go in "' + ((SB.config.categories[0] || {}).name || 'the first category') + '".'), addCats)));
      }
      if (um.stations.length) preview.appendChild(h('p', { class: 'fs-note', 'data-tone': 'warn' }, 'Your file names stations that are not set up here: ' + um.stations.join(', ') + '. Pick each dish\'s station below.'));
      // One station for every dish that came with none, so a cafe does not pick it 22 times.
      const bulk = h('select', { class: 'select', 'aria-label': 'Put every dish at this station' }, h('option', { value: '' }, 'Choose a station'), stations().map((z) => h('option', { value: z.id }, z.name)));
      preview.appendChild(h('div', { class: 'fs-row dp-bulk' }, h('label', null, 'Put all these dishes at: '), bulk));
      const body = h('div', { class: 'dp-ptable', role: 'table', 'aria-label': 'Dishes found' });
      const go = h('button', { type: 'button', class: 'btn btn-primary btn-lg', dataset: { act: 'import-go' } }, 'Import');
      // Updates the Import button's count and enabled state from the ticked, valid rows.
      const paintGo = () => { const n = rows.filter((r) => r.keep && r.ok).length; go.disabled = n === 0; go.textContent = n ? 'Import ' + n + ' ' + U.plural(n, 'dish', 'dishes') : 'Nothing to import'; };
      rows.forEach((r) => {
        const keepBox = h('input', { type: 'checkbox', checked: r.keep, 'aria-label': 'Import ' + r.name });
        const keep = keepBox;
        const keepWrap = h('label', { class: 'dp-check' }, keepBox);
        const nm = h('input', { class: 'input', type: 'text', maxlength: 60, value: r.name || '', 'aria-label': 'Name, line ' + r.line });
        const pr = h('input', { class: 'input dp-num', type: 'text', inputmode: 'decimal', value: typeof r.price === 'number' ? r.price.toFixed(2) : '', 'aria-label': 'Price, line ' + r.line });
        const zs = h('select', { class: 'select', 'aria-label': 'Station, line ' + r.line }, stations().map((z) => h('option', { value: z.id, selected: (r.station || defaultZone()) === z.id }, z.name)));
        const prob = h('div', { class: 'fs-sub dp-prob' });
        const rowEl = h('div', { class: 'dp-prow', role: 'row', dataset: { ok: r.ok ? 'true' : 'false' } }, keepWrap, nm, pr, zs, prob);
        // Redraws this row's plain problems and its tick after any edit.
        const redo = () => {
          r.ok = rowOk(r); if (!r.ok) r.keep = false;
          keep.checked = r.keep; rowEl.dataset.ok = r.ok ? 'true' : 'false';
          if (r.ok) prob.textContent = '';
          else prob.textContent = (!String(r.name || '').trim() ? 'Type a name. ' : '') + (typeof r.price !== 'number' ? 'Type a price like 12.50. ' : '') + ({ removed: 'A removed dish has this name. Bring it back in Dishes and prices, or use another name.', menu: 'That name is already on the menu.', list: 'That name is in this list twice.' }[takenBy(r)] || '');
          paintGo();
        };
        // Selecting a row in or out changes only whether it is imported.
        keep.addEventListener('change', () => { r.keep = keep.checked && (r.ok = rowOk(r)); keep.checked = r.keep; paintGo(); });
        // Typing a new name or price re-checks the row and ticks it in when it has become valid.
        const edit = () => { r.name = nm.value.replace(/\s+/g, ' ').trim(); const p = SB.menuImport.readPrice(pr.value); r.price = p && typeof p.value === 'number' ? p.value : null; r.station = zs.value; r.ok = rowOk(r); r.keep = r.ok; redo(); };
        nm.addEventListener('change', edit); pr.addEventListener('change', edit); zs.addEventListener('change', () => { r.station = zs.value; });
        prob.textContent = (r.problems || []).filter((p) => p.code !== 'unknownCategory' && p.code !== 'unknownStation').map((p) => p.message + (p.fix ? ' ' + p.fix : '')).join(' ');
        body.appendChild(rowEl);
      });
      // Choosing a station in the bulk list sets it on every row.
      bulk.addEventListener('change', () => { if (!bulk.value) return; rows.forEach((r) => { r.station = bulk.value; }); body.querySelectorAll('select').forEach((s) => { s.value = bulk.value; }); });
      // Imports the ticked rows through the importer's actions, then offers one-tap undo of that batch.
      go.addEventListener('click', () => {
        const picked = rows.filter((r) => r.keep && r.ok).map((r) => Object.assign({}, r, { station: r.station || defaultZone() }));
        const out = M.toActions(picked, SB.store.getState().menu, { zone: defaultZone() });
        const ids = [];
        out.actions.forEach((a) => { const res = send(a.type, a.payload); if (res.ok && res.info && res.info.id) ids.push(res.info.id); });
        const bad = out.actions.length - ids.length + out.skipped.length;
        tell(status, 'Imported ' + ids.length + ' ' + U.plural(ids.length, 'dish', 'dishes') + (bad ? '. ' + bad + ' could not be imported' + (out.skipped.length ? ': ' + out.skipped.map((s) => s.name + ' (' + s.reason + ')').join('; ') : '.') : '.'));
        U.clear(preview);
        if (ids.length) {
          // Takes the imported dishes off the menu again in one step (they are removed, not deleted).
          preview.appendChild(h('button', { type: 'button', class: 'btn', dataset: { act: 'import-undo' }, onClick: () => { ids.forEach((id) => send('updateMenuItem', { id, patch: { archived: true } })); tell(status, 'Removed the ' + ids.length + ' imported ' + U.plural(ids.length, 'dish', 'dishes') + '.'); U.clear(preview); } }, 'Remove these ' + ids.length));
        }
      });
      preview.append(body, h('div', { class: 'fs-row' }, go));
      paintGo();
    }
    // Reads the chosen file as text and checks it like pasted text.
    fileIn.addEventListener('change', () => {
      const f = fileIn.files && fileIn.files[0];
      if (!f) return;
      if (f.size > M.limits.textMax) { tell(status, 'That file is too big to read. Use a file under 1 MB.'); return; }
      const rd = new g.FileReader();
      // When the file is read, check its text; a failed read says so.
      rd.onload = () => { area.value = String(rd.result || ''); check(area.value, 'the file'); };
      rd.onerror = () => { tell(status, 'That file could not be read.'); };
      rd.readAsText(f);
    });
    const checkBtn = h('button', { type: 'button', class: 'btn btn-primary', dataset: { act: 'import-check' } }, ico('check', 20), h('span', null, 'Check it'));
    // Checks the pasted text.
    checkBtn.addEventListener('click', () => check(area.value, 'the pasted text'));
    // Export: the menu as a spreadsheet file, so it can be edited elsewhere or kept as a copy.
    const exp = h('button', { type: 'button', class: 'btn', dataset: { act: 'export-menu' } }, ico('download', 20), h('span', null, 'Export my menu'));
    // Builds the menu CSV and starts a download; says so if the browser blocks it.
    exp.addEventListener('click', () => {
      const text = M.exportMenu(SB.store.getState().menu);
      try {
        const url = g.URL.createObjectURL(new g.Blob([text], { type: 'text/csv' }));
        const a = doc.createElement('a'); a.href = url; a.download = 'smokebox-menu.csv'; a.style.display = 'none'; doc.body.appendChild(a); a.click();
        setTimeout(() => { a.remove(); g.URL.revokeObjectURL(url); }, 1000);
        tell(status, 'Saved smokebox-menu.csv. Open it in a spreadsheet, or import it again later.');
      } catch (e) { area.value = text; tell(status, 'Your browser blocked the download. The menu is in the box above: copy it into a file named smokebox-menu.csv.'); }
    });
    root.append(h('p', { class: 'fs-sub' }, 'Optional. Choose a spreadsheet (CSV) or an item export from Square, Toast or Clover, or paste a list. You will see every dish and can fix or clear any before anything is added. Adding dishes by hand in Dishes and prices is just as good.'),
      h('div', { class: 'fs-row' }, fileIn), area, h('div', { class: 'fs-row' }, checkBtn, exp), status, preview);
    sheet.body.appendChild(root); keepInView(sheet.body);
    return sheet;
  }

  /* ---------- Start over with an empty menu ---------- */

  // The word the owner types to confirm. Upper case, so it is easy to read and hard to type by accident.
  const START_OVER_WORD = 'START OVER';
  // Opens "Start over with an empty menu": three plain steps (what goes and what stays, save a backup, type the word). This cannot
  // be undone, so the screen says so first and offers a backup before anything is erased.
  function openStartOver() {
    const sheet = SB.ui.sheet({ title: 'Start over with an empty menu', side: 'right', width: 'min(640px, 96vw)', name: 'startover' });
    const root = h('div', { class: 'dp so' });
    const keep = h('input', { type: 'checkbox', checked: true, id: 'so-keep' });
    const keepLabel = h('label', { class: 'dp-check-row', for: 'so-keep' }, keep, h('span', null, 'Keep my tax, hours, PIN and station names'));
    const step1 = h('section', { class: 'fs-section so-step' },
      h('h3', { class: 'fs-h' }, '1. What happens'),
      h('p', { class: 'fs-sub' }, 'This empties your kitchen so you can begin again with a blank menu.'),
      h('p', null, h('strong', null, 'This goes: '), 'every dish and price, cooked-ahead items and their batches, portion counts, all tickets and orders, and all sales and history kept on this device.'),
      h('p', null, h('strong', null, 'This stays if the box is selected: '), 'your sales tax, opening hours, manager PIN, and the names you gave your stations and categories. Clear the box and those go back to how Smokebox starts.'),
      keepLabel,
      h('p', { class: 'fs-note', 'data-tone': 'warn' }, 'There is no undo. We are sorry to be blunt: once you confirm, the old menu and history cannot be brought back, except from a backup file you saved first.'));
    const next1 = h('button', { type: 'button', class: 'btn btn-primary btn-lg', dataset: { act: 'so-next1' } }, 'Next: save a backup');
    step1.appendChild(next1);

    const backupSt = h('p', { class: 'fs-sub', role: 'status' });
    let backedUp = false;
    // Saves the backup file with the browser's download and shows plainly that it happened (or that it did not).
    const backupBtn = h('button', { type: 'button', class: 'btn btn-primary btn-lg', dataset: { act: 'so-backup' } }, ico('download', 22), h('span', null, 'Save a backup now'));
    backupBtn.addEventListener('click', () => {
      const text = SB.store.exportAll();
      if (text == null) { tell(backupSt, 'The backup could not be made, so nothing was saved. Try again, or use Back office, Data, Back up.', 'bad'); return; }
      const fname = 'smokebox-backup-' + new Date().toISOString().slice(0, 10) + '.json';
      try {
        const url = g.URL.createObjectURL(new g.Blob([text], { type: 'application/json' }));
        const a = doc.createElement('a'); a.href = url; a.download = fname; a.style.display = 'none'; doc.body.appendChild(a); a.click();
        setTimeout(() => { a.remove(); g.URL.revokeObjectURL(url); }, 1000);
        backedUp = true; if (SB.shell && SB.shell.noteBackup) SB.shell.noteBackup();
        tell(backupSt, 'Saved ' + fname + ' (' + Math.max(1, Math.round(text.length / 1024)) + ' KB). Find it in your downloads and keep a copy off this device.', 'ok');
        next2.disabled = false;
      } catch (e) { tell(backupSt, 'Your browser blocked the download, so nothing was saved. Allow downloads for this page and try again.', 'bad'); }
    });
    const next2 = h('button', { type: 'button', class: 'btn btn-lg', dataset: { act: 'so-next2' }, disabled: true }, 'Next: confirm');
    // For an owner who has a backup already: continue without making another, after one more plain warning.
    const skip = h('button', { type: 'button', class: 'btn btn-link', dataset: { act: 'so-skip-backup' } }, 'I already have a backup, continue');
    const step2 = h('section', { class: 'fs-section so-step', hidden: true },
      h('h3', { class: 'fs-h' }, '2. Save a backup first'),
      h('p', { class: 'fs-sub' }, 'A backup is a file with everything in your kitchen right now. If you change your mind, Back office, Data, Restore brings it all back.'),
      h('div', { class: 'fs-row' }, backupBtn, next2), backupSt, skip);

    const word = h('input', { class: 'input', type: 'text', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', 'aria-label': 'Type ' + START_OVER_WORD + ' to confirm', placeholder: START_OVER_WORD });
    const goSt = h('p', { class: 'fs-sub', role: 'status' });
    const go = h('button', { type: 'button', class: 'btn btn-danger btn-lg', dataset: { act: 'so-go' }, disabled: true }, ico('trash', 22), h('span', null, 'Erase everything and start over'));
    // The red button only wakes up when the exact word has been typed.
    word.addEventListener('input', () => { go.disabled = word.value.trim().toUpperCase() !== START_OVER_WORD; });
    const step3 = h('section', { class: 'fs-section so-step', hidden: true },
      h('h3', { class: 'fs-h' }, '3. Type ' + START_OVER_WORD),
      h('p', { class: 'fs-sub' }, 'To be sure this is what you want, type ' + START_OVER_WORD + ' in the box. Then the red button works.'),
      SB.ui.field({ label: 'Type ' + START_OVER_WORD, control: word }), go, goSt);
    const done = h('section', { class: 'fs-section so-step', hidden: true });

    // Shows one step and hides the others.
    const show = (which) => { [step1, step2, step3, done].forEach((s, i) => { s.hidden = i !== which; }); };
    next1.addEventListener('click', () => show(1));
    next2.addEventListener('click', () => show(2));
    // Skipping the backup needs the owner to say so on purpose; the next screen repeats that there is no undo.
    skip.addEventListener('click', () => { if (!backedUp) tell(backupSt, 'Continuing without a backup from this screen. If you saved one earlier, you can restore it later.', 'ok'); show(2); });
    // Erases the kitchen: empty menu, optionally the settings too, then shows the done screen. Any refusal is shown in the same one-line style.
    go.addEventListener('click', () => {
      const keepIt = keep.checked;
      const r = send('resetLive', { catalog: 'blank', keepSettings: keepIt });
      if (!r.ok) { tell(goSt, r.words || 'Smokebox could not start over, so nothing was erased. Nothing has changed.', 'bad'); return; }
      if (SB.store.persistNow) { try { SB.store.persistNow(); } catch (e) { /* saved on the next change */ } }
      // My own saved bits: the half-typed dish, last station, example list and the questions already answered.
      [KEY_DRAFT, KEY_LAST, KEY_EXAMPLES, KEY_CASKIP].forEach((k) => U.storage.remove(k));
      let needsReload = false;
      if (!keepIt) {
        U.storage.remove(KEY_HIDDEN);
        try { SB.config.saveCustom({ rename: {}, add: {} }); needsReload = true; } catch (e) { /* names stay */ }
      }
      if (SB.floor && SB.floor.setWelcome) SB.floor.setWelcome(true);
      U.clear(done);
      done.append(h('h3', { class: 'fs-h' }, 'Done. Your kitchen is empty.'),
        h('p', { class: 'fs-sub' }, 'The menu, tickets and history are gone' + (keepIt ? '. Your tax, hours, PIN and station names stayed.' : ', and tax, hours, PIN and station names are back to how Smokebox starts.')),
        // Goes to the first screen: closes the sheets (and reloads when station names were reset so every screen shows them).
        h('button', { type: 'button', class: 'btn btn-primary btn-lg', dataset: { act: 'so-finish' }, onClick: () => { if (needsReload) g.location.reload(); else SB.sheets.closeAll(); } }, 'Go to the first screen'));
      show(3);
    });
    root.append(step1, step2, step3, done);
    sheet.body.appendChild(root); keepInView(root);
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
    const taxSt = section('Sales tax', 'The prices you type for dishes are before tax. Smokebox adds this percent to the bill when it is paid. Type 0 if you do not charge tax.', h('label', { class: 'fs-row' }, h('span', null, 'Percent'), tax),
      // Checks the tax box and saves the rate, or says what is wrong with it.
      h('button', { type: 'button', class: 'btn', onClick: () => {
        const v = readNum(tax);
        if (v == null || v < 0 || v > 20) { tell(taxSt, 'Type a number from 0 to 20.'); return; }
        const r = send('updateSettings', { patch: { service: { taxRatePct: v } } });
        tell(taxSt, r.ok ? 'Saved. Orders add ' + v + '% sales tax.' : r.report === 'nothingToDo' ? 'Already set.' : r.words);
      } }, 'Save tax'));
    // A list of whole hours with plain labels such as "11 am" and "1 am (next day)".
    const hourOpts = (from, to, sel) => { const out = []; for (let x = from; x <= to; x++) out.push(h('option', { value: String(x), selected: x === sel }, U.fmtHour(x) + (x >= 24 ? ' (next day)' : ''))); return out; };
    const openSel = h('select', { class: 'select', 'aria-label': 'Opens at' }, hourOpts(0, 23, set.service.openHour));
    const closeSel = h('select', { class: 'select', 'aria-label': 'Closes at' }, hourOpts(1, 30, set.service.closeHour));
    const hoursSt = section('Opening hours', 'Warnings and the sell-out clock use these. The starting hours are only a guess.', h('label', { class: 'fs-row' }, h('span', null, 'Opens at'), openSel), h('label', { class: 'fs-row' }, h('span', null, 'Closes at'), closeSel),
      // Saves both hours, or says closing has to come after opening.
      h('button', { type: 'button', class: 'btn', onClick: () => {
        const o = Number(openSel.value), c = Number(closeSel.value);
        if (o >= c) { tell(hoursSt, 'Closing has to be after opening.'); return; }
        const r = send('updateSettings', { patch: { service: { openHour: o, closeHour: c } } });
        tell(hoursSt, r.ok ? 'Saved. Open ' + U.fmtHour(o) + ' to ' + U.fmtHour(c) + '.' : r.report === 'nothingToDo' ? 'Already set.' : r.words);
      } }, 'Save hours'));
    const pin = h('input', { class: 'input', type: 'password', inputmode: 'numeric', maxlength: 4, autocomplete: 'off', 'aria-label': 'Manager PIN, 4 digits' });
    const pinSt = section('Manager PIN (optional)', 'A PIN keeps cooks out of the back office. It only keeps honest people out. Skip it if you do not want one.', h('label', { class: 'fs-row' }, h('span', null, '4 digits'), pin),
      // Saves the four-digit PIN, or asks for exactly four digits.
      h('button', { type: 'button', class: 'btn', onClick: async () => {
        const v = pin.value.trim();
        if (!/^\d{4}$/.test(v)) { tell(pinSt, 'Use exactly 4 digits.'); return; }
        const r = SB.shell && SB.shell.setPin ? await SB.shell.setPin(v) : { ok: false };
        tell(pinSt, r.ok ? 'PIN set. The back office will ask for it.' : 'The PIN could not be saved.');
        if (r.ok) pin.value = '';
      } }, 'Set PIN'));
    // Cook-ahead: one yes or no, kept in the real setting (settings.modules.cookAhead). A saved kitchen from before this
    // setting existed counts as Yes, so nothing disappears from it.
    const on0 = SB.engine && SB.engine.moduleOn ? SB.engine.moduleOn(SB.store.getState(), 'cookAhead') : false;
    const cook = SB.ui.segmented({ label: 'Do you cook food ahead and hold it warm or cold?', value: on0 ? 'yes' : 'no', options: [{ id: 'no', label: 'No' }, { id: 'yes', label: 'Yes' }],
      // Saves the answer and says what appears or goes away; puts the old answer back if the save fails.
      onChange: (v) => {
        const r = send('updateSettings', { patch: { modules: { cookAhead: v === 'yes' } } });
        if (!r.ok && r.report !== 'nothingToDo') { cook.setValue(v === 'yes' ? 'no' : 'yes'); tell(cookSt, r.words); return; }
        tell(cookSt, v === 'yes' ? 'On. The Cabinet, cooked-batch times and their warnings are available. Change this any time here.' : 'Off. Batch tracking stays out of the way. Change this any time here.');
      } });
    const cookSt = section('Cooking ahead', 'Some places cook a big batch in the morning and serve from it all day, or keep cold sides in a cooler. If you do, Smokebox can track those batches and warn you before they run out of time. Most new places start with No.', cook);
    sheet.body.appendChild(list); keepInView(list);
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
  SB.sheets.register('startover', openStartOver);
  SB.sheets.register('menuimport', openImport);
  SB.sheets.register('cookahead', openCookAhead);
  SB.sheets.register('wizard', openDishes); // the old name, kept so older links still open the right sheet
  // dishCount: how many dishes can be ordered. done: setup counts as finished once there is one. noDishes: first run.
  SB.setup = { tryDemo, demoIntro, hiddenStations: () => U.storage.get(KEY_HIDDEN, []), dishCount: () => activeDishes().length, done: () => activeDishes().length > 0, noDishes, wizardDone: () => activeDishes().length > 0 };
})(typeof globalThis !== 'undefined' ? globalThis : window);
