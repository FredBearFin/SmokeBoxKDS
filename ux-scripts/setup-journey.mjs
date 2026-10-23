// Setup journey: a brand-new owner with an empty browser profile goes from first open to a first PAID ticket.
// Three runs, each from empty storage: A) the path the first-run screen leads to (Add your first dish, three dishes, order, pay);
// B) the naive path (tap New ticket straight away); C) finding the dish list later to change a price.
// It records every screen, tap, typed field, modeled time, dead end, confusing moment and anything pre-filled that the owner
// did not enter. Time is MODELED, not measured on a person: 1.2 s per tap, 3 s plus 0.25 s per character per typed field,
// 2 s per choice from a list, 4 s of reading each time a new screen appears. Nothing here is a real user test.
// Run after building: node ux-scripts/setup-journey.mjs   (needs dist/smokebox.html). Writes docs/ux-shots/night/a2/.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withPage, ROOT } from '../tools/pw.mjs';

const OUT = path.join(ROOT, 'docs/ux-shots/night/a2');
fs.mkdirSync(OUT, { recursive: true });
const TAP_S = 1.2, TYPE_S = 3, CHAR_S = 0.25, PICK_S = 2, READ_S = 4;

// Builds a recorder: steps with counters, notes and a screenshot after each step. Returns the helpers.
function recorder(page, run) {
  const rec = { run, steps: [], taps: 0, typed: 0, picks: 0, chars: 0, reads: 0, deadEnds: 0, confusing: 0, extraTaps: 0 };
  let cur = null, n = 0;
  const api = {
    rec,
    // Starts a new step with a plain name; counts one reading pause for the new screen.
    begin(name, intent) { cur = { n: ++n, name, intent, taps: 0, typed: 0, picks: 0, chars: 0, notes: [], screen: '' }; rec.reads++; return cur; },
    // Notes a fact: kind is info, prefilled, confusing or deadend.
    note(kind, text) { cur.notes.push({ kind, text }); if (kind === 'deadend') rec.deadEnds++; if (kind === 'confusing') rec.confusing++; },
    // Taps one control the way a person would and counts it.
    async tap(sel, why) { await page.click(sel, { timeout: 5000 }); cur.taps++; rec.taps++; await page.waitForTimeout(160); if (why) cur.notes.push({ kind: 'tap', text: why }); },
    // Counts one typed field that was typed with the cursor already in it (no tap needed).
    typed(text, why) { cur.typed++; rec.typed++; cur.chars += text.length; rec.chars += text.length; if (why) cur.notes.push({ kind: 'type', text: why + ' = "' + text + '"' }); },
    // Types text into one field, counting one typed field.
    async type(sel, text, why) { await page.click(sel, { timeout: 5000 }); cur.taps++; rec.taps++; await page.fill(sel, text); cur.typed++; rec.typed++; cur.chars += text.length; rec.chars += text.length; if (why) cur.notes.push({ kind: 'type', text: why + ' = "' + text + '"' }); },
    // Picks one option from a list control, counting one choice.
    async pick(sel, value, why) { await page.selectOption(sel, value); cur.picks++; rec.picks++; if (why) cur.notes.push({ kind: 'pick', text: why + ' = ' + value }); },
    // Reads which screen is showing: the top sheet title, the back-office page heading, or the board; plus visible toasts.
    async where() {
      return page.evaluate(() => {
        const vis = (e) => e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
        const sheets = [...document.querySelectorAll('[role=dialog]')].filter(vis);
        const top = sheets[sheets.length - 1];
        const heads = [...document.querySelectorAll('h1')].filter((e) => vis(e) && !e.classList.contains('visually-hidden'));
        let screen = 'Kitchen board';
        if (top) screen = 'Sheet: ' + ((top.querySelector('h1,h2,.sheet-title') || {}).textContent || top.getAttribute('aria-label') || '?').trim();
        else if (/Back to the line/.test(document.body.innerText)) screen = 'Back office: ' + (heads[0] ? heads[0].textContent.trim() : '?');
        const toasts = [...document.querySelectorAll('.toast')].filter(vis).map((e) => e.innerText.replace(/\s+/g, ' ').trim());
        return { screen, toasts: [...new Set(toasts)].slice(0, 4) };
      });
    },
    // Ends the step: reads the screen and saves a numbered screenshot.
    async end(shotName) {
      const w = await api.where();
      cur.screen = w.screen; if (w.toasts.length) cur.toasts = w.toasts;
      cur.shot = String(cur.n).padStart(2, '0') + '-' + run + '-' + (shotName || cur.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) + '.png';
      await page.screenshot({ path: path.join(OUT, cur.shot) });
      rec.steps.push(cur);
    },
  };
  return api;
}

// Reads what is already in a brand-new profile: the things the owner did not enter.
async function inventory(page) {
  return page.evaluate(() => {
    const s = SB.store.getState();
    const tiles = [...document.querySelectorAll('.ord-tile')];
    return {
      menuDishes: s.menu.length, ingredients: s.ingredients.length, batches: s.batches.length,
      tickets: Array.isArray(s.tickets) ? s.tickets.length : Object.keys(s.tickets || {}).length,
      orders: Array.isArray(s.orders) ? s.orders.length : Object.keys(s.orders || {}).length,
      taxPct: s.settings.service.taxRatePct, openHour: s.settings.service.openHour, closeHour: s.settings.service.closeHour,
      sampleHistory: !!(s.settings.sim && s.settings.sim.history) || null,
      menuPriceRange: [Math.min(...s.menu.map((m) => m.price)), Math.max(...s.menu.map((m) => m.price))],
      eightySixed: SB.store.getState().avail ? Object.values(SB.store.getState().avail).filter((a) => a && (a.out || a.status === 'out' || a.is86)).length : null,
      tilesShown: tiles.length, tilesSoldOut: tiles.filter((t) => t.classList.contains('is-86')).length,
    };
  });
}

// Run A: the path the first-run screen leads to: Add your first dish, three dishes, New ticket, pay, send.
async function runA(oneStation) {
  return withPage({ w: 1280, h: 800, touch: true }, async (page, logs) => {
    await page.waitForFunction(() => window.SB && SB.booted === true, null, { timeout: 8000 });
    // Variant D: the owner of a one-station kitchen has already hidden the other three (set up before the clock starts).
    if (oneStation) { await page.evaluate(() => localStorage.setItem('smokebox.v1.setup.hiddenStations', JSON.stringify(['sides', 'fry', 'cold']))); await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.SB && SB.booted === true); }
    await page.waitForTimeout(700);
    const R = recorder(page, oneStation ? 'D' : 'A');
    R.begin('First open', 'The owner opens smokebox.html for the first time.');
    const inv0 = await inventory(page);
    R.rec.firstOpenInventory = inv0;
    const first = await page.evaluate(() => ({ btn: !!document.querySelector('.fl-first-dish'), card: !!document.querySelector('.fl-welcome') && !document.querySelector('.fl-welcome').hidden, badge: (() => { const b = [...document.querySelectorAll('button')].find((x) => /^\s*86/.test(x.textContent)); const m = b && b.textContent.replace(/\s+/g, '').match(/^86(\d+)/); return m ? m[1] : '0'; })() }));
    R.note('info', 'Empty board with one big "Add your first dish" button: ' + first.btn + '. Welcome card showing: ' + first.card + '. 86 badge count: ' + first.badge + '.');
    R.note(inv0.menuDishes === 0 ? 'info' : 'prefilled', 'Dishes already on the menu that the owner did not enter: ' + inv0.menuDishes + '; ingredients ' + inv0.ingredients + '; batches ' + inv0.batches + '; tickets ' + inv0.tickets + '; orders ' + inv0.orders + '.');
    await R.end('first-open');

    R.begin('Tap Add your first dish', 'The one big button.');
    await R.tap('.fl-first-dish', 'Add your first dish');
    await page.waitForSelector('.dp-form');
    await R.end('dishes-open');

    const dishes = [['Pulled pork plate', '12.50', 'pit'], ['Mac and cheese', '4.50', 'sides'], ['Sweet tea', '3.00', 'cold']];
    const t0 = Date.now();
    let i = 0;
    for (const [name, price, zone] of dishes) {
      i++;
      R.begin('Add dish ' + i + ': ' + name, 'Name, price, tap where it is made.');
      // The cursor is already in the name box (the sheet and "Save and add another" put it there), and Enter or Next moves to
      // the price box, so neither field costs a tap: only the typing counts.
      const active = await page.evaluate(() => document.activeElement && document.activeElement.className);
      if (!/dp-name/.test(active || '')) R.note('confusing', 'The cursor was not in the name box (it was in: ' + active + ').');
      await page.keyboard.type(name); R.typed(name, 'Dish name');
      await page.keyboard.press('Enter');
      const moved = await page.evaluate(() => document.activeElement && document.activeElement.className);
      if (!/dp-price/.test(moved || '')) R.note('confusing', 'Enter in the name box did not move to the price box.');
      await page.keyboard.type(price); R.typed(price, 'Price');
      const chosen = await page.evaluate(() => (document.querySelector('.dp-tile[aria-checked="true"]') || {}).dataset && document.querySelector('.dp-tile[aria-checked="true"]').dataset.zone);
      const tileThere = await page.locator('.dp-tiles').isVisible();
      if (!tileThere) R.note('info', 'Only one station is showing, so there is no "Where is it made?" question.');
      else if (chosen !== zone) await R.tap('.dp-tile[data-zone="' + zone + '"]', 'Where it is made: ' + zone);
      else R.note('info', 'Station tile "' + zone + '" was already chosen from the last dish: no tap needed.');
      await R.tap(i < 3 ? '[data-act="save-again"]' : '[data-act="save-done"]', i < 3 ? 'Save and add another' : 'Save and finish');
      await page.waitForTimeout(350);
      await R.end('add-dish-' + i);
    }
    R.rec.addThreeDishesWallMs = Date.now() - t0;
    const stateDishes = await page.evaluate(() => SB.store.getState().menu.filter((m) => !m.archived).length);
    R.rec.dishesAfter = stateDishes;

    R.begin('Back on the board', 'The sheet closes; the next-step card shows.');
    await page.waitForTimeout(500);
    const card = await page.evaluate(() => { const c = document.querySelector('.fl-welcome'); return c && !c.hidden ? c.innerText.replace(/\s+/g, ' ').trim() : '(none)'; });
    R.note('info', 'Next-step card: "' + card.slice(0, 160) + '"');
    await R.end('back-on-board');

    R.begin('New ticket: three dishes', 'Tap New ticket and pick the three dishes.');
    await R.tap('.fl-new', 'New ticket');
    await page.waitForSelector('.ord-tile');
    const inv1 = await inventory(page);
    R.note('info', inv1.tilesShown + ' dishes on the order screen, ' + inv1.tilesSoldOut + ' sold out.');
    const tiles = await page.$$('.ord-tile:not(.is-86)');
    for (const t of tiles.slice(0, 3)) { await t.click(); R.rec.taps++; await page.waitForTimeout(120); }
    R.note('tap', 'tapped the three dishes (3 taps)');
    await R.end('order-dishes');

    R.begin('Pay now and send', 'Choose Cash and send to the kitchen.');
    await R.tap('.ord-pay [data-id="cash"]', 'Payment: Cash');
    await R.tap('.ord-send', 'Send to kitchen');
    await page.waitForTimeout(600);
    const paid = await page.evaluate(() => { const s = SB.store.getState(); const o = Object.values(s.orders || {}); return o.some((x) => x && (x.paid || x.status === 'paid' || x.paidAt)); });
    R.rec.firstPaidTicket = paid;
    R.note('info', 'Order recorded as paid in the store: ' + paid + '.');
    await R.end('first-paid-ticket');

    R.begin('Wait: any late setup toast?', 'The old build showed "New tablet?" about 8 s in.');
    await page.waitForTimeout(8500);
    const toastNow = await page.evaluate(() => [...document.querySelectorAll('.toast')].map((e) => e.innerText.replace(/\s+/g, ' ').trim()).join(' | '));
    R.note(/New tablet/.test(toastNow) ? 'confusing' : 'info', 'Toasts on screen about 20 s after first open: "' + toastNow + '".');
    await R.end('late-toast');
    R.rec.inventoryAtEnd = await inventory(page);
    R.rec.errors = logs.errors.length + logs.pageErrors.length;
    return R.rec;
  });
}

// Run B: the naive path. The owner skips everything and taps New ticket.
async function runB() {
  return withPage({ w: 1280, h: 800, touch: true }, async (page) => {
    await page.waitForFunction(() => window.SB && SB.booted === true, null, { timeout: 8000 });
    await page.waitForTimeout(500);
    const R = recorder(page, 'B');
    R.begin('Naive: New ticket straight away', 'The owner taps the big New ticket button in the header.');
    await R.tap('.fl-new', 'New ticket');
    await page.waitForTimeout(500);
    const where = await R.where();
    R.note(/Dishes and prices/.test(where.screen) ? 'info' : 'deadend', 'The screen that opens: ' + where.screen + (/Dishes and prices/.test(where.screen) ? ' (the add form, not an empty order screen).' : '.'));
    await R.end('new-ticket-no-dishes');
    return R.rec;
  });
}

// Run C: how a returning owner finds the dish list to change a price later: Menu, Dishes and prices.
async function runC() {
  return withPage({ w: 1280, h: 800, touch: true }, async (page) => {
    await page.waitForFunction(() => window.SB && SB.booted === true, null, { timeout: 8000 });
    await page.evaluate(() => { SB.store.dispatchEx('addMenuItem', { name: 'Pulled pork plate', zone: 'pit', cat: 'meat', price: 12.5, prepSec: 300, track: 'two' }, { source: 'ui' }); });
    await page.waitForTimeout(500);
    const R = recorder(page, 'C');
    R.begin('Find the dish list: main menu', 'The owner wants to change a price.');
    await R.tap('.fl-menu', 'Menu (the button at the top right)');
    await page.waitForTimeout(400);
    await R.end('main-menu');
    R.begin('Find the dish list: Dishes and prices', 'Pick the entry named Dishes and prices.');
    await R.tap('button:has-text("Dishes and prices")', 'Dishes and prices');
    await page.waitForSelector('.dp-list .dp-row');
    await R.end('dishes-list');
    R.begin('Change a price', 'Type a new price in the dish row.');
    await R.type('.dp-rp', '13.00', 'new price');
    await page.locator('.dp-rp').first().blur(); await page.waitForTimeout(300);
    const price = await page.evaluate(() => SB.store.getState().menu[0].price);
    R.note('info', 'Price in the store after leaving the box: ' + price + '.');
    await R.end('price-changed');
    return R.rec;
  });
}

// Run E: the cook-ahead path. One cooked-ahead dish (Brisket plate): add it, say "Yes, I cook ahead", add Brisket, link it,
// log a first batch in the cabinet, then take a paid order for it.
async function runE() {
  return withPage({ w: 1280, h: 800, touch: true }, async (page, logs) => {
    await page.waitForFunction(() => window.SB && SB.booted === true, null, { timeout: 8000 });
    await page.waitForTimeout(600);
    const R = recorder(page, 'E');
    R.begin('Add the dish', 'Brisket plate at the pit.');
    await R.tap('.fl-first-dish', 'Add your first dish');
    await page.waitForSelector('.dp-form');
    await page.keyboard.type('Brisket plate'); R.typed('Brisket plate', 'Dish name');
    await page.keyboard.press('Enter');
    await page.keyboard.type('14.00'); R.typed('14.00', 'Price');
    await R.tap('.dp-tile[data-zone="pit"]', 'Where it is made: Pit');
    await R.tap('[data-act="save-again"]', 'Save and add another');
    await page.waitForTimeout(400);
    await R.end('dish-added');
    R.begin('Say yes to cooking ahead', 'The question appears under the form after the first dish.');
    const q = await page.evaluate(() => { const c = document.querySelector('.dp-ca'); return c && !c.hidden ? c.innerText.replace(/\s+/g, ' ').slice(0, 120) : '(not shown)'; });
    R.note(q === '(not shown)' ? 'deadend' : 'info', 'Question card: ' + q);
    await R.tap('.dp-ca [data-act="add-cooked"]', 'Yes, I cook ahead');
    await page.waitForSelector('.sheet:has-text("Cooked-ahead food") .dp-name');
    await R.end('cooked-ahead-sheet');
    R.begin('Add Brisket and link it', 'Name, tick the dish, save.');
    await page.keyboard.type('Brisket'); R.typed('Brisket', 'Cooked-ahead name');
    await R.tap('.sheet:has-text("Cooked-ahead food") input[type=checkbox]', 'Brisket plate uses it');
    await R.tap('[data-act="save-cooked"]', 'Save cooked-ahead item');
    await page.waitForTimeout(400);
    await R.end('brisket-added');
    R.begin('Log a first batch', 'Straight to the cabinet with Brisket chosen.');
    await R.tap('[data-act="log-first-batch"]', 'Log a first batch');
    await page.waitForSelector('.hc-add');
    R.note('info', 'Starting values are pre-filled from the product (raw weight, cook endpoint, first reading 150 F); this run accepts them as a cook would after checking the probe.');
    await page.screenshot({ path: path.join(OUT, 'E-batch-form.png') });
    await R.tap('.hc-add', 'Put in hold cabinet');
    await page.waitForTimeout(500);
    const batches = await page.evaluate(() => SB.store.getState().batches.length);
    R.rec.batchesLogged = batches;
    await R.end('batch-logged');
    R.begin('Take an order for it', 'Close the sheets, New ticket, the dish, cash, send.');
    for (let k = 0; k < 3; k++) { if (await page.locator('.sheet-close').count()) { await R.tap('.sheet-close >> nth=-1', 'Close a sheet'); await page.waitForTimeout(350); } }
    await R.tap('.fl-new', 'New ticket');
    await page.waitForSelector('.ord-tile');
    const avail = await page.$$('.ord-tile:not(.is-86)');
    R.note(avail.length ? 'info' : 'deadend', avail.length + ' dish tile(s) orderable after logging the batch.');
    if (avail.length) { await avail[0].click(); R.rec.taps++; }
    await R.tap('.ord-pay [data-id="cash"]', 'Cash');
    await R.tap('.ord-send', 'Send to kitchen');
    await page.waitForTimeout(500);
    R.rec.firstPaidTicket = await page.evaluate(() => Object.values(SB.store.getState().orders || {}).some((x) => x && (x.paid || x.status === 'paid' || x.paidAt)));
    await R.end('cook-ahead-paid');
    R.rec.errors = logs.errors.length + logs.pageErrors.length;
    return R.rec;
  });
}

// Turns a run into modeled seconds.
function modeled(rec) { return Math.round(rec.taps * TAP_S + rec.typed * TYPE_S + rec.chars * CHAR_S + rec.picks * PICK_S + rec.reads * READ_S); }

const A = await runA(); const B = await runB(); const C = await runC(); const D = await runA(true); const E = await runE();
for (const r of [A, B, C, D, E]) r.modeledSeconds = modeled(r);
const out = { generated: 'modeled, headless Chromium 1280x800, empty storage; not a real person or tablet', model: { TAP_S, TYPE_S, CHAR_S, PICK_S, READ_S }, A, B, C, D, E };
fs.writeFileSync(path.join(OUT, 'journey.json'), JSON.stringify(out, null, 1));
const line = (r) => 'taps ' + r.taps + ', typed fields ' + r.typed + ' (' + r.chars + ' chars), list choices ' + r.picks + ', screens read ' + r.reads + ', dead ends ' + r.deadEnds + ', confusing ' + r.confusing + ', modeled ' + (r.modeledSeconds / 60).toFixed(1) + ' min';
console.log('A guided path :', line(A), ' | paid:', A.firstPaidTicket, ' | errors:', A.errors);
console.log('B naive path  :', line(B));
console.log('C find menu   :', line(C));
console.log('D one station :', line(D), ' | paid:', D.firstPaidTicket);
console.log('E cook-ahead :', line(E), ' | batches:', E.batchesLogged, '| paid:', E.firstPaidTicket, '| errors:', E.errors);
console.log('first open    :', JSON.stringify(A.firstOpenInventory));
for (const r of [A, B, C, D, E]) for (const s of r.steps) { console.log('\n[' + r.run + s.n + '] ' + s.name + ' -> ' + s.screen + ' (' + s.shot + ') taps ' + s.taps + ' typed ' + s.typed); for (const n of s.notes) if (n.kind !== 'tap' && n.kind !== 'type' && n.kind !== 'pick') console.log('   ' + n.kind + ': ' + n.text); }
void fileURLToPath;
