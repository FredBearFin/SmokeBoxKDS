// Setup journey: a brand-new owner with an empty browser profile goes from first open to a first PAID ticket.
// Three runs, each from empty storage: A) the guided path (welcome card, kitchen wizard, three own dishes, order, pay);
// B) the naive path (just try to order from what is on screen); C) finding menu editing without the wizard.
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

// Run A: the guided path a careful owner would take, from the welcome card to a first paid ticket.
async function runA() {
  return withPage({ w: 1280, h: 800, touch: true }, async (page, logs) => {
    await page.waitForFunction(() => window.SB && SB.booted === true, null, { timeout: 8000 });
    await page.waitForTimeout(700);
    const R = recorder(page, 'A');
    let s = R.begin('First open', 'The owner opens smokebox.html for the first time.');
    const inv0 = await inventory(page);
    R.rec.firstOpenInventory = inv0;
    const sold = await page.evaluate(() => document.querySelector('.fl-welcome') ? 'welcome card showing' : 'no welcome card');
    const badge86 = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /^\s*86/.test(x.textContent) || /86/.test(x.getAttribute('aria-label') || '')); const m = b && b.textContent.replace(/\s+/g, '').match(/^86(\d+)/); return m ? m[1] : '?'; });
    R.note('info', 'Screen shows the empty board, a ' + sold + ', and a red 86 badge that counts ' + badge86 + ' dishes already sold out on a brand-new install.');
    R.note('prefilled', inv0.menuDishes + ' sample dishes priced $' + inv0.menuPriceRange[0].toFixed(2) + ' to $' + inv0.menuPriceRange[1].toFixed(2) + ' (a barbecue menu), ' + inv0.ingredients + ' sample ingredients with par and 86 levels.');
    R.note('prefilled', 'Sales tax ' + inv0.taxPct + '%, hours ' + inv0.openHour + ' to ' + inv0.closeHour + ' (starter estimates). Batches ' + inv0.batches + ', tickets ' + inv0.tickets + ', orders ' + inv0.orders + ' (the board itself starts empty).');
    await R.end('first-open');

    // The welcome card's big button is the obvious first thing to do.
    R.begin('Tap Set up your kitchen', 'The welcome card says to set up first.');
    await R.tap('.fl-welcome [data-act="setup"]', 'Set up your kitchen');
    await page.waitForSelector('.setup-list');
    R.note('info', 'Wizard sheet opens with five steps stacked on one long page: tax, hours, PIN, starter dishes, food already cooked.');
    R.note('confusing', 'Step 5 asks for kg and a probe temperature of food already cooked. A new owner with a barbecue menu has no idea yet; "skip if the pit is empty" is the last line of a long paragraph.');
    R.note('confusing', 'Hours are typed as 24-hour numbers ("21 is 9 pm, 25 is 1 am"). Tax asks the owner to "ask your accountant".');
    await R.end('wizard-open');

    R.begin('Wizard step 1: sales tax', 'Type the tax rate and save.');
    await R.type('.setup-list input[aria-label^="Sales tax"]', '6', 'sales tax percent');
    await R.tap('.setup-list section:nth-of-type(1) button', 'Save tax rate');
    await R.end('wizard-tax');

    R.begin('Wizard steps 2 and 3: hours and PIN', 'The owner skims past hours and the optional PIN.');
    R.note('info', 'Hours stay at the pre-filled 11 to 21 and no PIN is set by this run: two steps skipped by reading only (each has its own Save button; none is needed to continue).');
    await R.end('wizard-hours-pin');

    R.begin('Wizard step 4: archive the sample dishes', 'The owner wants only their own menu.');
    await R.tap('.setup-list section:nth-of-type(4) button:has-text("Archive the starter dishes")', 'Archive the starter dishes');
    await page.waitForTimeout(300);
    await R.tap('button:has-text("Archive them")', 'confirm Archive them');
    await page.waitForTimeout(400);
    R.note('info', 'The app archives 21 dishes the owner never added. They are hidden, not deleted, so Menu and settings still lists them under Archived.');
    await R.end('wizard-archive');

    R.begin('Wizard step 4: open Menu and settings', 'The wizard has no place to type a dish, so it points at another page.');
    await R.tap('.setup-list button:has-text("Open Menu and settings")', 'Open Menu and settings');
    await page.waitForTimeout(900);
    const wiz = await page.evaluate(() => ({ done: SB.setup && SB.setup.wizardDone(), welcome: !!SB.floor.welcome() }));
    R.note('confusing', 'The wizard sheet closes and the back office opens. Wizard marked finished: ' + wiz.done + '; welcome card still pending: ' + wiz.welcome + '.');
    const emptyMsg = await page.evaluate(() => { const e = document.querySelector('.od-empty'); return e && !e.hidden ? e.innerText.replace(/\s+/g, ' ').trim() : '(none)'; });
    R.note('confusing', 'The Active list is empty after archiving, and it says: "' + emptyMsg + '". It tells the owner to change a filter, not to add a first dish; the Archived tab holds 21 dishes the owner never made.');
    R.note('info', 'The Menu section opens with two paragraphs of explanation, an "Add a dish" button and filters. The dish form is hidden until the button is tapped.');
    await R.end('menu-page');

    // Add three dishes through the real form.
    const dishes = [
      { name: 'Pulled pork plate', price: '12.50', zone: null },
      { name: 'Mac and cheese', price: '4.50', zone: 'sides', cat: 'side' },
      { name: 'Sweet tea', price: '3.00', zone: 'cold', cat: 'cold', one: true },
    ];
    const t0 = Date.now();
    let i = 0;
    for (const d of dishes) {
      i++;
      R.begin('Add dish ' + i + ': ' + d.name, 'Fill in the Add a dish form.');
      if (i === 1) { await R.tap('button:has-text("Add a dish")', 'Add a dish'); await page.waitForSelector('form.od-add:not([hidden])'); }
      const f = 'form.od-add';
      const fields = await page.evaluate(() => { const fm = document.querySelector('form.od-add'); return { inputs: fm.querySelectorAll('input').length, selects: fm.querySelectorAll('select').length, required: 2 }; });
      if (i === 1) R.note('info', 'The form has ' + fields.inputs + ' text boxes and ' + fields.selects + ' drop-down lists plus a two-way switch. Only name and price are required; station, category and prep time arrive pre-filled (Pit, Meats, 2 min 0 s, Start then done).');
      await R.type(f + ' input[placeholder="Brisket plate"]', d.name, 'Dish name');
      await R.type(f + ' input[placeholder="0.00"]', d.price, 'Price');
      if (d.zone) { await R.pick(f + ' select >> nth=0', d.zone, 'Station that cooks it (drop-down)'); R.rec.extraTaps++; }
      if (d.cat) { await R.pick(f + ' select >> nth=1', d.cat, 'Category on the order screen (drop-down)'); }
      if (d.one) { await R.tap(f + ' button:has-text("One tap")', 'How it is cooked: One tap'); }
      await page.screenshot({ path: path.join(OUT, '_tmp.png') });
      await R.tap(f + ' button[type=submit]', 'Add dish');
      await page.waitForTimeout(350);
      const msg = await page.evaluate(() => (document.querySelector('form.od-add [role=status]') || {}).textContent || '');
      R.note('info', 'Result line: "' + msg.trim().slice(0, 140) + '"');
      if (i === 1) R.note('confusing', 'The form stays open and the same Station and Category stay selected (good), but the 21 archived starters and the long dish list sit below it, so the new dish is hard to see.');
      if (i === 3) { const left = await page.evaluate(() => ({ st: document.querySelector('form.od-add select').value })); R.note('info', 'After Add dish the station stays at "' + left.st + '": the app remembers the last station, but the owner had to change it by hand for every different kind of dish.'); }
      await R.end('add-dish-' + i);
    }
    fs.rmSync(path.join(OUT, '_tmp.png'), { force: true });
    R.rec.addThreeDishesWallMs = Date.now() - t0;

    R.begin('Back to the board', 'Leave the back office and take a first order.');
    await R.tap('button:has-text("Back to the line")', 'Back to the line');
    await page.waitForTimeout(600);
    const welcomeStill = await page.evaluate(() => !!document.querySelector('.fl-welcome') && getComputedStyle(document.querySelector('.fl-welcome')).display !== 'none');
    if (welcomeStill) R.note('confusing', 'The welcome card still says "Set up your kitchen first" even though setup is done: the wizard was left through "Open Menu and settings", so it was never finished.');
    await R.end('back-on-board');

    R.begin('New ticket: three dishes', 'Tap the big New ticket button and pick three dishes.');
    await R.tap('.fl-new', 'New ticket');
    await page.waitForSelector('.ord-tile');
    const inv1 = await inventory(page);
    R.note('info', inv1.tilesShown + ' dishes on the order screen, ' + inv1.tilesSoldOut + ' shown sold out. The three own dishes are orderable at once because they list no ingredients (nothing to run out of).');
    const tiles = await page.$$('.ord-tile:not(.is-86)');
    for (const t of tiles.slice(0, 3)) { await t.click(); R.rec.taps++; await page.waitForTimeout(120); }
    R.note('tap', 'tapped the first three dishes (3 taps)');
    const stepCur = R.rec.steps; void stepCur;
    await R.end('order-dishes');

    R.begin('Pay now and send', 'Choose Cash and send to the kitchen.');
    await R.tap('.ord-pay [data-id="cash"]', 'Payment: Cash');
    await R.tap('.ord-send', 'Send to kitchen');
    await page.waitForTimeout(600);
    const paid = await page.evaluate(() => { const s = SB.store.getState(); const o = Object.values(s.orders || {}).concat(Array.isArray(s.orders) ? s.orders : []); return o.some((x) => x && (x.paid || x.status === 'paid' || x.paidAt)); });
    R.rec.firstPaidTicket = paid;
    R.note('info', 'Order recorded as paid in the store: ' + paid + '.');
    await R.end('first-paid-ticket');

    R.begin('Wait for the optional setup offer', 'The 8-second "New tablet?" toast.');
    await page.waitForTimeout(8500);
    const toastNow = await page.evaluate(() => [...document.querySelectorAll('.toast')].map((e) => e.innerText.replace(/\s+/g, ' ').trim()).join(' | '));
    R.note('confusing', 'Toasts on screen about 20 s after first open: "' + toastNow + '". The "New tablet?" offer arrives even though the owner has already used the kitchen wizard. There are two different setup lists (kitchen wizard, 5 steps; tablet checklist, 6 steps) with overlapping words.');
    const nl = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /not logged/.test(x.textContent) && x.textContent.trim().length < 40); return b ? b.textContent.replace(/\s+/g, ' ').trim() : null; });
    if (nl) R.note('confusing', 'An amber header badge reads "not logged" (spoken as "Sanitize, not logged. Press to log a check."): a sanitizer-check reminder the owner never asked for and nothing in setup explains. It was showing at the first paid ticket.');
    await R.end('late-toast');

    R.rec.inventoryAtEnd = await inventory(page);
    R.rec.errors = logs.errors.length + logs.pageErrors.length;
    return R.rec;
  });
}

// Run B: the naive path. The owner skips setup and tries to order from the menu that is on screen.
async function runB() {
  return withPage({ w: 1280, h: 800, touch: true }, async (page) => {
    await page.waitForFunction(() => window.SB && SB.booted === true, null, { timeout: 8000 });
    await page.waitForTimeout(500);
    const R = recorder(page, 'B');
    R.begin('Naive: New ticket straight away', 'The owner ignores the welcome card and taps New ticket.');
    await R.tap('.fl-new', 'New ticket');
    await page.waitForSelector('.ord-tile');
    const inv = await inventory(page);
    R.note('prefilled', 'The menu on the order screen is the sample barbecue menu: ' + inv.tilesShown + ' dishes, ' + inv.tilesSoldOut + ' of them marked "86 sold out - Brisket is low".');
    R.note('deadend', inv.tilesSoldOut + ' of ' + inv.tilesShown + ' dishes cannot be ordered because no batch is logged. The reason ("Brisket is low") does not say "log a batch in the Cabinet" or "this is a sample dish".');
    await R.end('order-sample-menu');
    R.begin('Naive: try the first dish', 'Tap the first dish.');
    await page.click('.ord-tile.is-86').catch(() => {});
    R.rec.taps++; R.rec.extraTaps++;
    const reaction = await page.evaluate(() => { const n = document.querySelector('.ord-notice:not([hidden]), [role=alert]:not([hidden])'); return n ? n.textContent.trim() : '(no message)'; });
    R.note('deadend', 'Tapping a sold-out dish: ' + (reaction === '(no message)' ? 'nothing visible happens (no message, no hint to log a batch or edit the menu)' : reaction.slice(0, 160)) + '.');
    await R.end('sold-out-tap');
    R.begin('Naive: only four dishes can be ordered', 'Pick what works: cornbread, pickles, hush puppies, tea.');
    const ok = await page.$$eval('.ord-tile:not(.is-86)', (t) => t.map((x) => x.innerText.replace(/\n/g, ' ')));
    R.note('info', 'Orderable on a brand-new install: ' + ok.join('; ') + '. None is a main dish.');
    R.note('confusing', 'Sample prices ($3.50 to $29.00, combos up to $103.00) look real. A first ticket would be paid at prices the owner never chose.');
    await R.end('orderable-list');
    R.begin('Naive: send and pay a sample dish', 'Order the sample cornbread, pay cash.');
    const tiles = await page.$$('.ord-tile:not(.is-86)');
    await tiles[0].click(); R.rec.taps++;
    await R.tap('.ord-pay [data-id="cash"]', 'Cash');
    await R.tap('.ord-send', 'Send to kitchen');
    await page.waitForTimeout(500);
    R.note('prefilled', 'This paid ticket is for a made-up dish at a made-up price and would show in the real sales totals. Nothing marks it as a sample.');
    await R.end('paid-sample-ticket');
    return R.rec;
  });
}

// Run C: how long to find menu editing without the wizard, from the board.
async function runC() {
  return withPage({ w: 1280, h: 800, touch: true }, async (page) => {
    await page.waitForFunction(() => window.SB && SB.booted === true, null, { timeout: 8000 });
    await page.waitForTimeout(500);
    const R = recorder(page, 'C');
    R.begin('Find menu editing: Back office', 'The owner closes the welcome card and looks for the menu.');
    await R.tap('[aria-label="Hide this welcome"]', 'close the welcome card');
    await R.tap('button:has-text("Back office")', 'Back office');
    await page.waitForTimeout(700);
    const pace = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').match(/Brisket None[^.]*\./) );
    R.note('info', 'Back office opens on Pace (an analytics page), not on menu editing. On a new install it shows "$0.00 paid", an 86 list of 17 sample dishes' + (pace ? ' and a "' + pace[0] + '" card about a food the owner may not even sell.' : '.'));
    R.note('confusing', 'Menu editing is the 7th of 7 items in the side list, named "Menu and settings". There is no word "dish" or "menu" until the owner reads down.');
    await R.end('back-office-landing');
    R.begin('Find menu editing: Menu and settings', 'Choose the 7th item.');
    await R.tap('nav a:has-text("Menu and settings"), nav button:has-text("Menu and settings"), button:has-text("Menu and settings")', 'Menu and settings');
    await page.waitForTimeout(600);
    await R.end('menu-and-settings');
    R.begin('Find menu editing: Add a dish', 'Open the form.');
    await R.tap('button:has-text("Add a dish")', 'Add a dish');
    await R.end('add-dish-form');
    R.rec.note = 'Taps from the board to an open Add a dish form: ' + R.rec.taps + ' (including closing the welcome card).';
    return R.rec;
  });
}

// Turns a run into modeled seconds.
function modeled(rec) { return Math.round(rec.taps * TAP_S + rec.typed * TYPE_S + rec.chars * CHAR_S + rec.picks * PICK_S + rec.reads * READ_S); }

const A = await runA(); const B = await runB(); const C = await runC();
for (const r of [A, B, C]) r.modeledSeconds = modeled(r);
const out = { generated: 'modeled, headless Chromium 1280x800, empty storage; not a real person or tablet', model: { TAP_S, TYPE_S, CHAR_S, PICK_S, READ_S }, A, B, C };
fs.writeFileSync(path.join(OUT, 'journey.json'), JSON.stringify(out, null, 1));
const line = (r) => 'taps ' + r.taps + ', typed fields ' + r.typed + ' (' + r.chars + ' chars), list choices ' + r.picks + ', screens read ' + r.reads + ', dead ends ' + r.deadEnds + ', confusing ' + r.confusing + ', modeled ' + (r.modeledSeconds / 60).toFixed(1) + ' min';
console.log('A guided path :', line(A), ' | paid:', A.firstPaidTicket, ' | errors:', A.errors);
console.log('B naive path  :', line(B));
console.log('C find menu   :', line(C));
console.log('first open    :', JSON.stringify(A.firstOpenInventory));
for (const r of [A, B, C]) for (const s of r.steps) { console.log('\n[' + r.run + s.n + '] ' + s.name + ' -> ' + s.screen + ' (' + s.shot + ') taps ' + s.taps + ' typed ' + s.typed); for (const n of s.notes) if (n.kind !== 'tap' && n.kind !== 'type' && n.kind !== 'pick') console.log('   ' + n.kind + ': ' + n.text); }
void fileURLToPath;
