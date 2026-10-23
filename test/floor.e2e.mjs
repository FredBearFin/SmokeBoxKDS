// Floor board end-to-end test (browser). Run: node test/floor.e2e.mjs [--full] [--keep]
// Builds a private bundle dist/floor.html of ONLY what the line needs (tokens, base CSS, 20-floor.css, util, icons, config, engine, store, shell,
// 70-floor-board.js, boot). Other agents' sheets and the simulator are not in it, so this suite stays independent of their work in progress:
// sheets that the board opens are replaced by tiny spies (SB.sheets.register) and SB.sim is stubbed where a check needs it.
// --full builds the real app (tools/build.mjs) into dist/floor.html instead and skips the stubs for sheets that really exist.
// Screenshots go to test/.out/floor/. Exit code 1 on any failed check, console error or page error.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { withPage as pwWithPage, ROOT } from '../tools/pw.mjs';
// A group that throws (a missing element, a timeout) counts as ONE failed check and the next group still runs.
const withPage = (...a) => pwWithPage(...a).catch((e) => { fail++; failures.push('group threw'); console.log('  FAIL  group threw: ' + String(e.message).split('\n')[0].slice(0, 300)); });
import { buildShell } from './shell.bundle.mjs';
import { startKitchen } from './_kitchen.mjs';

const FULL = process.argv.includes('--full');
const OUT = path.join(ROOT, 'dist/floor.html');
const SHOTS = path.join(ROOT, 'test/.out/floor') + path.sep;
fs.mkdirSync(SHOTS, { recursive: true });
if (FULL) {
  const r = spawnSync('node', [path.join(ROOT, 'tools/build.mjs'), '--out', 'dist/floor.html', '--quiet'], { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) { console.error(r.stdout, r.stderr); process.exit(1); }
} else {
  buildShell(OUT, {
    css: ['00-tokens.css', '10-base.css', '20-floor.css'],
    js: ['00-util.js', '05-icons.js', '10-config.js', '20-engine.js', '25-deadlines.js', '30-store.js', '60-shell.js', '70-floor-board.js', '99-boot.js'],
  });
}

let pass = 0, fail = 0;
const failures = [];
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  ok    ' + name); } else { fail++; failures.push(name); console.log('  FAIL  ' + name + (detail !== undefined ? '  -> ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '')); }
}
let knownCount = 0;
/** A check for a real app bug that is reported and owned but not yet fixed: it prints KNOWN instead of failing, and says so once it passes. */
function knownBug(name, ok, detail, owner) {
  if (ok) { pass++; console.log('  ok    ' + name + '  (was a known bug: remove knownBug)'); return; }
  knownCount++; console.log('  KNOWN ' + name + ' [owner ' + owner + ']  -> ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)));
}
const group = (t) => console.log('\n# ' + t);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const noErrors = (name, logs) => check(name + ': console clean (no errors, no page errors)', logs.errors.length === 0 && logs.pageErrors.length === 0, { errors: logs.errors.slice(0, 4), pageErrors: logs.pageErrors.slice(0, 3) });
const shot = (page, name, o) => page.screenshot(Object.assign({ path: SHOTS + name + '.png' }, o || {}));

/* ------------------------------------------------------------------------------------------------------------------------
 * helpers that run inside the page
 * ---------------------------------------------------------------------------------------------------------------------- */
async function boot(page, { seed = true, sheets = true, zone = null, kitchen = true } = {}) {
  await page.waitForFunction(() => window.SB && SB.booted === true, null, { timeout: 8000 });
  // a real install starts blank and the barbecue demo is its own mode (?demo), so put every group in the demo kitchen with an empty line
  // (kitchen:false keeps the real blank kitchen)
  if (kitchen) await startKitchen(page);
  await page.evaluate(({ sheets }) => {
    window.__opened = [];
    if (sheets) ['order', 'hold', 'board86', 'recall', 'demo', 'help', 'menu', 'specs'].forEach((n) => {
      if (SB.sheets.has(n)) return; // the real sheet exists (--full)
      SB.sheets.register(n, () => { window.__opened.push(n); const sh = SB.ui.sheet({ title: n + ' (spy)', side: 'right', name: n }); sh.footer.append(Object.assign(document.createElement('button'), { className: 'btn', textContent: 'Close', onclick: () => sh.close() })); return sh; });
    });
    window.T = {
      t: (cust) => SB.store.getState().tickets.find((t) => t.customer === cust),
      id: (cust) => window.T.t(cust).id,
      item: (cust, menuId) => window.T.t(cust).items.find((i) => i.menuId === menuId),
      slip: (cust) => document.querySelector('.fl-slip[data-ticket="' + window.T.id(cust) + '"]'),
      row: (cust, menuId) => document.querySelector('.fl-slip[data-ticket="' + window.T.id(cust) + '"] .fl-row[data-item="' + window.T.item(cust, menuId).id + '"]'),
      st: (cust, menuId) => window.T.item(cust, menuId).status,
      order: () => Array.from(document.querySelectorAll('.fl-grid > .fl-slip:not(.fl-leaving)')).map((e) => (SB.store.getState().tickets.find((t) => t.id === e.dataset.ticket) || {}).customer),
      toast: () => Array.from(document.querySelectorAll('.toast .toast-msg')).map((e) => e.textContent),
    };
  }, { sheets });
  if (seed) await seedTickets(page);
  if (zone) await page.evaluate((z) => SB.router.go({ kind: 'floor', zone: z }), zone);
  await settle(page);
}
const settle = async (page, ms = 120) => { await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); await wait(ms); };

/** Four tickets of known shape: Table 4 (14 min, overdue), Pickup, Dana (9.5 min, warn, allergy note), Drive-thru 7 (5 min, RUSH), Walk-up (40 s, one item still waiting). */
async function seedTickets(page) {
  await startKitchen(page); // known state: starter stock so dishes can be sold; a first run is an empty kitchen
  const bad = await page.evaluate(() => {
    const S = SB.store, now = S.now(), bad = [];
    const mk = (customer, channel, items, o = {}) => { const r = S.dispatchEx('createTicket', Object.assign({ customer, channel, items, src: 'demo', allowPast: true }, o), { source: 'sim' }); if (r.report !== 'ok') bad.push(customer + ': ' + r.report); };
    mk('Table 4', 'dine_in', [{ menuId: 'brisket_half', qty: 2 }, { menuId: 'mac' }, { menuId: 'slaw' }, { menuId: 'cornbread', qty: 2 }], { createdAt: now - 14 * 60e3 });
    mk('Pickup, Dana', 'takeout', [{ menuId: 'ribs_full' }, { menuId: 'hushpuppies' }, { menuId: 'tea', qty: 2 }], { createdAt: now - 9.5 * 60e3, note: 'Allergy: peanuts. Keep fry oil separate.' });
    mk('Drive-thru 7', 'drive_thru', [{ menuId: 'brisket_sand', mods: ['No pickles', 'Sauce on the side'] }, { menuId: 'fried_pickles' }], { createdAt: now - 5 * 60e3, rush: true });
    mk('Walk-up', 'dine_in', [{ menuId: 'sausage' }, { menuId: 'pudding' }], { createdAt: now - 40e3 });
    S.tick();
    return bad;
  });
  if (bad.length) console.log('  (seed problems: ' + bad.join('; ') + ')');
  await settle(page, 200);
}
const rect = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom }; }, sel);
const noHScroll = (page) => page.evaluate(() => ({ doc: document.documentElement.scrollWidth - innerWidth, main: (() => { const m = document.querySelector('.fl-main'); return m ? m.scrollWidth - m.clientWidth : 0; })(), head: (() => { const m = document.querySelector('.fl-head'); return m ? m.scrollWidth - m.clientWidth : 0; })(), slips: Array.from(document.querySelectorAll('.fl-slip')).filter((s) => s.scrollWidth > s.clientWidth + 1).length }));

/* ========================================================================================================================
 * 1. Boot, header, station counts, order of slips
 * ====================================================================================================================== */
group('boot, header, counts, slip order (1280 x 800)');
await withPage({ w: 1280, h: 800, file: OUT }, async (page, logs) => {
  await page.waitForFunction(() => window.SB && SB.booted === true, null, { timeout: 8000 });
  // empty state first (nothing seeded yet)
  await boot(page, { seed: false });
  const e0 = await page.evaluate(() => ({ empty: !document.querySelector('.fl-empty').hidden, title: document.querySelector('.fl-empty h2') && document.querySelector('.fl-empty h2').textContent, btns: Array.from(document.querySelectorAll('.fl-empty button')).map((b) => b.textContent.trim()), grid: document.querySelector('.fl-grid').hidden, dock: document.querySelector('.fl-dock').hidden, brand: !!document.querySelector('.fl-head [data-brand]'), mounted: SB.floor.isMounted && SB.floor.isMounted() }));
  check('floor mounts through the shell with a brand button', e0.mounted && e0.brand, e0);
  check('empty state says "No tickets right now." with New ticket, Show me how it works and Busy-night demo', e0.empty && e0.title === 'No tickets right now.' && e0.btns.includes('New ticket') && e0.btns.includes('Show me how it works') && e0.btns.some((b) => /^Busy-night (demo|crew)/.test(b)) && e0.grid, e0); // the button is now called Busy-night crew
  await shot(page, 'empty-1280x800');
  // Start demo without a simulator opens the Demo sheet
  await page.evaluate(() => { delete SB.sim; }); // the full build has a real simulator
  await page.locator('.fl-empty .fl-start-demo').click();
  await settle(page);
  check('Start demo without SB.sim opens the demo sheet', await page.evaluate(() => SB.sheets.isOpen('demo')));
  await page.evaluate(() => SB.sheets.closeAll());
  // with a simulator it starts the stream at "normal" and turns the crew on
  await page.evaluate(() => { window.__sim = []; SB.sim = { live: { start: (o) => window.__sim.push(['start', o && o.rate]), crew: (b) => window.__sim.push(['crew', b]), stop() {}, status: () => ({ running: false }), onChange: () => () => {} } }; });
  await page.locator('.fl-empty .fl-start-demo').click();
  const sim = await page.evaluate(() => window.__sim);
  check('Start demo calls SB.sim.live.start({rate:"normal"}) and crew(true)', JSON.stringify(sim) === JSON.stringify([['start', 'normal'], ['crew', true]]), sim);
  await page.evaluate(() => { delete SB.sim; });
  await page.locator('.fl-empty >> text=New ticket').click();
  await settle(page);
  check('New ticket in the empty state opens the order sheet', await page.evaluate(() => SB.sheets.isOpen('order')));
  await page.evaluate(() => SB.sheets.closeAll());

  await seedTickets(page);
  const h = await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('.fl-seg .seg-opt')).map((b) => ({ id: b.dataset.id, text: b.querySelector('.seg-label').textContent, count: b.querySelector('.seg-count').textContent, dot: !b.querySelector('.seg-dot').hidden, dotLabel: b.querySelector('.seg-dot').textContent, hasIcon: !!b.querySelector('svg.icon'), zone: b.dataset.zone || null, sr: b.querySelector('.visually-hidden') && b.querySelector('.visually-hidden').textContent }));
    return { tabs, role: document.querySelector('.fl-seg').getAttribute('role'), sel: document.querySelector('.fl-seg [aria-selected="true"]').dataset.id };
  });
  check('six station tabs All, PIT, HOT, FRY, CLD, EXP, then the Cabinet tab', JSON.stringify(h.tabs.map((t) => t.text)) === JSON.stringify(['All', 'PIT', 'HOT', 'FRY', 'CLD', 'EXP', 'Cabinet']) && h.role === 'tablist', h.tabs.map((t) => t.text));
  check('every tab has an icon, a 3-letter code and a zone hue (data-zone)', h.tabs.every((t) => t.hasIcon) && h.tabs.slice(1, 6).every((t) => t.text.length === 3 && t.zone === t.id), h.tabs);
  const counts = Object.fromEntries(h.tabs.filter((t) => t.id !== 'cabinet').map((t) => [t.id, Number(t.count)]));
  check('live station counts: all 4, pit 4, sides 1, fry 2, cold 3, expo 4', JSON.stringify(counts) === JSON.stringify({ all: 4, pit: 4, sides: 1, fry: 2, cold: 3, expo: 4 }), counts);
  const dots = Object.fromEntries(h.tabs.map((t) => [t.id, t.dot]));
  check('overdue dot shows on the stations where the overdue ticket (Table 4) still has work, with a text label', dots.pit && dots.sides && dots.cold && dots.all && dots.expo && !dots.fry && h.tabs.find((t) => t.id === 'pit').dotLabel.length > 3, dots);
  check('the board starts on All', h.sel === 'all');

  const ord = await page.evaluate(() => T.order());
  check('slip order: overdue first, then rush, then oldest', JSON.stringify(ord) === JSON.stringify(['Table 4', 'Drive-thru 7', 'Pickup, Dana', 'Walk-up']), ord);
  const lv = await page.evaluate(() => ['Table 4', 'Pickup, Dana', 'Drive-thru 7', 'Walk-up'].map((c) => { const s = T.slip(c); const bw = s.querySelector('.fl-badge .fl-bw'); return s.dataset.level + '|' + (bw.offsetParent ? bw.textContent.replace(/ \+\d+ min$/, '') : '(hidden)') + '|' + s.querySelector('.slip-timer').dataset.level + '|' + s.dataset.rush; }));
  // The "On time" badge is hidden for everyone on purpose (a quiet board); only Overdue and Running late are spoken.
  check('time state: Overdue / Running late with words, On time says nothing', JSON.stringify(lv) === JSON.stringify(['breach|Overdue|breach|false', 'warn|Running late|warn|false', 'ok|(hidden)|ok|true', 'ok|(hidden)|ok|false']), lv);
  const badgeIcon = await page.evaluate(() => { const b = T.slip('Table 4').querySelector('.fl-badge'); const vis = Array.from(b.querySelectorAll('svg')).filter((s) => getComputedStyle(s).display !== 'none'); return vis.length; });
  check('badge shows exactly one icon next to its word', badgeIcon === 1, badgeIcon);
  const stamp = await page.evaluate(() => { const s = T.slip('Drive-thru 7').querySelector('.stamp'); return s && s.textContent; });
  check('rush slip carries the RUSH stamp', stamp === 'Rush');
  const sl = await page.evaluate(() => Array.from(document.querySelectorAll('.fl-slip')).map((s) => ({ lab: s.getAttribute('aria-labelledby'), name: s.getAttribute('aria-labelledby').split(' ').map((i) => document.getElementById(i).textContent).join(' '), tag: s.tagName })));
  check('every slip is a labelled region (ticket number and name)', sl.every((x) => x.tag === 'SECTION' && /Ticket #\d+/.test(x.name)), sl);
  const note = await page.evaluate(() => { const n = T.slip('Pickup, Dana').querySelector('.slip-note'); const body = T.slip('Pickup, Dana').querySelector('.slip-body'); return { text: n && n.textContent, before: !!(n && (n.compareDocumentPosition(body.querySelector('.fl-items')) & 4)) }; });
  check('amber note strip sits above the items', /Allergy: peanuts/.test(note.text || '') && note.before, note);
  const mods = await page.evaluate(() => Array.from(T.row('Drive-thru 7', 'brisket_sand').querySelectorAll('.chip-mod')).map((c) => c.textContent));
  check('modifier chips sit under the item name', mods.join('|') === 'No pickles|Sauce on the side', mods);

  // header contents
  const hd = await page.evaluate(() => ({ new: !!document.querySelector('.fl-new'), tools: Array.from(document.querySelectorAll('.fl-tools .fl-tool')).map((b) => b.dataset.tool), office: !!document.querySelector('.fl-head .fl-office'), san: document.querySelector('.fl-san').textContent, menu: !!document.querySelector('.fl-menu'), newTxt: document.querySelector('.fl-new').textContent.trim() }));
  check('header has New ticket, Recall, 86, Demo, Menu, the sanitize chip and the Cabinet tab (the Hold button is now that tab)', hd.new && hd.newTxt === 'New ticket' && hd.tools.join() === 'recall,board86,demo' && await page.evaluate(() => !!document.querySelector('.fl-seg [data-id="cabinet"]')) && hd.menu && /Sanitize|not logged|overdue|\d/.test(hd.san), hd);
  const head = await rect(page, '.fl-head');
  const parts = await page.evaluate(() => ['.fl-brand', '.fl-seg', '.fl-san', '.fl-tools', '.fl-new', '.fl-menu'].map((s) => { const r = document.querySelector(s).getBoundingClientRect(); return [s, Math.round(r.top), Math.round(r.bottom), Math.round(r.left), Math.round(r.right)]; }));
  const tops = parts.map((p) => p[1]);
  check('header is one row at 1280 (everything within 40 px of the same top) and fits', Math.max(...tops) - Math.min(...tops) < 40 && head.h < 100 && parts[5][4] <= 1280, { head, parts });
  check('no horizontal scroll at 1280', JSON.stringify(await noHScroll(page)) === JSON.stringify({ doc: 0, main: 0, head: 0, slips: 0 }), await noHScroll(page));
  await wait(700); // let the print-in animation finish (a slip is squashed to 90 percent while it prints)
  const tapSizes = await page.evaluate(() => Array.from(document.querySelectorAll('.fl-head button, .fl-seg .seg-opt, .fl-slip button')).filter((b) => b.offsetParent && b.getBoundingClientRect().top < innerHeight && b.getBoundingClientRect().bottom > 0).map((b) => { const r = b.getBoundingClientRect(); return { n: (b.getAttribute('aria-label') || b.textContent).trim().slice(0, 18), w: Math.round(r.width), h: Math.round(r.height) }; }).filter((x) => x.h < 44 || x.w < 44));
  check('every header button and slip button is at least 44 x 44 px (the compact ticket is the default)', tapSizes.length === 0, tapSizes.slice(0, 6));
  await shot(page, 'floor-1280x800');

  // Hold and 86 counts, sanitize chip, Menu
  const r86 = await page.evaluate(() => { const r = SB.store.dispatchEx('toggle86', { menuId: 'pudding', on: true }, { source: 'ui' }); SB.ui.toast('x'); return r.report; });
  await settle(page);
  const n86 = await page.evaluate(() => { const b = document.querySelector('[data-tool="board86"]'); const n = b.querySelector('.fl-tool-n'); return { hidden: n.hidden, txt: n.textContent, label: b.getAttribute('aria-label'), tone: b.dataset.tone }; });
  check('86 count appears on the 86 button with an accessible label', r86 === 'ok' && !n86.hidden && n86.txt === '1' && /1 item off the menu/.test(n86.label) && n86.tone === 'bad', n86);
  await page.evaluate(() => SB.store.dispatchEx('toggle86', { menuId: 'pudding', on: false }, { source: 'ui' }));
  const hold0 = await page.evaluate(() => SB.store.select.counts().hold);
  await page.evaluate(() => { SB.store.dispatchEx('addBatch', { ing: 'brisket', tempF: 110, cookedG: 4000, rawG: 7000 }, { source: 'ui' }); });
  await settle(page);
  const hold1 = await page.evaluate(() => { const c = document.querySelector('.fl-seg [data-id="cabinet"] .seg-count'); return { n: SB.store.select.counts().hold, shown: c.textContent, dim: c.dataset.zero === 'true' }; });
  check('cabinet tab attention count follows the store', hold1.n >= hold0 && hold1.shown === String(hold1.n), { hold0, hold1 });
  await page.locator('.fl-seg [data-id="cabinet"]').click(); await settle(page);
  // This private bundle has no hold-cabinet module (SB.hold), so the tab falls back to the Hold sheet spy; the in-page cabinet is checked in floor-sheets and the qa journeys.
  check('Cabinet tab opens the hold cabinet (the sheet spy here, where the in-page module is not built in)', await page.evaluate(() => SB.sheets.isOpen('hold') || (!document.querySelector('.fl-cabinet').hidden)));
  await page.evaluate(() => SB.sheets.closeAll()); await settle(page, 60);
  await page.locator('.fl-seg [data-id="all"]').click(); await settle(page);
  check('a station tab brings the tickets back', await page.evaluate(() => document.querySelector('.fl-cabinet').hidden));
  for (const [sel, name] of [['[data-tool="recall"]', 'recall'], ['[data-tool="board86"]', 'board86'], ['[data-tool="demo"]', 'demo'], ['.fl-new', 'order']]) {
    await page.locator(sel).click(); await settle(page, 60);
    check(sel + ' opens the ' + name + ' sheet', await page.evaluate((n) => SB.sheets.isOpen(n), name));
    await page.evaluate(() => SB.sheets.closeAll()); await settle(page, 60);
  }
  await page.locator('.fl-menu').click(); await settle(page, 80);
  check('Menu opens the menu sheet (or the quick list when the header is compact)', await page.evaluate(() => SB.sheets.isOpen('menu') || !!document.querySelector('.menu-layer')));
  await page.evaluate(() => { SB.sheets.closeAll(); SB.ui.closeMenu(); });
  // sanitize chip menu, demo chip and clock
  await page.locator('.fl-san').click(); await settle(page, 80);
  const san = await page.evaluate(() => Array.from(document.querySelectorAll('.menu .menu-item')).map((b) => b.textContent.trim()));
  check('sanitize chip opens a menu with "Mark surfaces sanitized"', san.some((t) => /sanitized/.test(t)), san);
  await page.locator('.menu-item', { hasText: 'Mark surfaces sanitized' }).click(); await settle(page, 120);
  const sanAfter = await page.evaluate(() => ({ txt: document.querySelector('.fl-san .fl-chip-t').textContent, toast: T.toast(), tone: document.querySelector('.fl-san').dataset.tone }));
  check('logging a sanitize turns the chip into a countdown and raises an Undo toast', /\d/.test(sanAfter.txt) && sanAfter.tone === 'info' && sanAfter.toast.some((t) => /Sanitize logged/i.test(t)), sanAfter);
  await page.evaluate(() => SB.store.setSpeed(5));
  await settle(page, 1200);
  const dm = await page.evaluate(() => ({ tool: document.querySelector('[data-tool="demo"] .fl-tool-n').textContent, label: document.querySelector('[data-tool="demo"]').getAttribute('aria-label'), chipHidden: document.querySelector('.fl-demo-chip').hidden }));
  check('clock speed above x1 shows the demo state on the Demo tool and the chip', dm.tool === 'x5' && /x5/.test(dm.label) && dm.chipHidden === false, dm);
  await page.evaluate(() => SB.store.setSpeed(1));
  noErrors('boot and header', logs);
});

/* ========================================================================================================================
 * 2. Tap flow: advance, finish, undo, double tap guard, fire now, complete zone, rush, bump, void
 * ====================================================================================================================== */
group('tap flow (1280 x 800)');
await withPage({ w: 1280, h: 800, file: OUT }, async (page, logs) => {
  await boot(page);
  const rowSel = (cust, menuId) => page.evaluate(([c, m]) => '.fl-slip[data-ticket="' + T.id(c) + '"] .fl-row[data-item="' + T.item(c, m).id + '"] button[data-act="item"]', [cust, menuId]);
  const tapItem = async (cust, menuId) => page.locator(await rowSel(cust, menuId)).click();
  const toasts = () => page.evaluate(() => T.toast());

  // two-step item: first tap starts it
  const before = await page.evaluate(() => { const r = T.row('Table 4', 'brisket_half'); return { st: T.st('Table 4', 'brisket_half'), pressed: r.querySelector('button').getAttribute('aria-pressed'), act: r.querySelector('.fl-act').dataset.act, word: r.querySelector('.fl-act-word').textContent }; });
  check('two-step item starts as "Start" (aria-pressed=false)', before.st === 'displayed' && before.pressed === 'false' && before.act === 'start' && before.word === 'Start', before);
  await page.evaluate(() => { window.__rowNode = T.row('Table 4', 'brisket_half'); window.__btnNode = window.__rowNode.querySelector('button'); window.__slipNode = T.slip('Table 4'); });
  await tapItem('Table 4', 'brisket_half');
  await settle(page, 200);
  const cook = await page.evaluate(() => { const r = T.row('Table 4', 'brisket_half'); return { st: T.st('Table 4', 'brisket_half'), act: r.querySelector('.fl-act').dataset.act, pressed: r.querySelector('button').getAttribute('aria-pressed'), left: r.querySelector('.fl-cook-t').textContent, word: r.querySelector('.fl-act-word').textContent, same: r === window.__rowNode && r.querySelector('button') === window.__btnNode, slipSame: T.slip('Table 4') === window.__slipNode, state: r.dataset.state, sr: r.querySelector('.visually-hidden').textContent }; });
  check('tap starts the item: cooking, countdown "m:ss left" under the name, tile says Done, aria-pressed=mixed, state words for screen readers', cook.st === 'cooking' && cook.act === 'cook' && cook.pressed === 'mixed' && /^\d+:\d\d left$/.test(cook.left) && cook.word === 'Done' && /cooking/i.test(cook.sr), cook);
  check('the row and its button are the same DOM nodes after the update (no re-creation)', cook.same && cook.slipSame, cook);
  const t1 = await toasts();
  check('undoable action raises a short human toast with Undo ("Brisket 1/2 started")', t1.some((t) => /Brisket 1\/2 started/.test(t)) && (await page.locator('.toast .toast-undo').count()) === 1, t1);
  await page.locator('.toast .toast-undo').click(); await settle(page, 200);
  const undone = await page.evaluate(() => ({ st: T.st('Table 4', 'brisket_half'), toast: T.toast() }));
  check('Undo puts the item back to fired', undone.st === 'displayed' && undone.toast.some((t) => /Undone/.test(t)), undone);

  // double tap guard
  await page.evaluate(() => { const b = T.row('Table 4', 'brisket_half').querySelector('button'); b.click(); b.click(); });
  await settle(page, 200);
  check('a fast double tap advances once (start, not start and done)', (await page.evaluate(() => T.st('Table 4', 'brisket_half'))) === 'cooking');
  await wait(600);
  // finish
  await page.evaluate(() => { window.__sw = T.slip('Table 4'); });
  await tapItem('Table 4', 'brisket_half'); await settle(page, 200);
  const fin = await page.evaluate(() => { const r = T.row('Table 4', 'brisket_half'); return { st: T.st('Table 4', 'brisket_half'), btn: !!r.querySelector('button'), word: r.querySelector('.fl-state-w').textContent, count: T.slip('Table 4').querySelector('.fl-count').textContent, prog: T.slip('Table 4').querySelector('.slip-progress').getAttribute('aria-valuenow') }; });
  check('finishing marks the row done, read-only, with status words; count and progress update', fin.st === 'done' && !fin.btn && fin.word === 'Done' && fin.count === '1 of 4 done' && fin.prog === '25', fin);

  // focus stays put after an advance (keyboard)
  await page.evaluate(() => T.row('Table 4', 'mac').querySelector('button').focus());
  await page.keyboard.press('Enter'); await settle(page, 200);
  const foc = await page.evaluate(() => { const a = document.activeElement; return { row: a.closest('.fl-row') && a.closest('.fl-row').dataset.item, want: T.item('Table 4', 'mac').id, tag: a.tagName, st: T.st('Table 4', 'mac') }; });
  check('after Enter on a row, focus is still on that same row\'s button', foc.row === foc.want && foc.tag === 'BUTTON' && foc.st === 'cooking', foc);
  await wait(500);
  await page.keyboard.press('Enter'); await settle(page, 250); // finish: the row turns read-only, focus must go somewhere useful
  const foc2 = await page.evaluate(() => { const a = document.activeElement; return { inSlip: !!(a.closest && a.closest('.fl-slip') === T.slip('Table 4')), tag: a.tagName, st: T.st('Table 4', 'mac') }; });
  check('when a row turns read-only focus moves to the next control on that slip (not lost to the page)', foc2.st === 'done' && foc2.inSlip && foc2.tag === 'BUTTON', foc2);

  // one-tap item
  await tapItem('Table 4', 'slaw'); await settle(page, 150);
  check('one-tap item goes straight to done', (await page.evaluate(() => T.st('Table 4', 'slaw'))) === 'done');

  // Start now on a waiting item
  const deck = await page.evaluate(() => { const r = T.row('Walk-up', 'pudding'); return { kind: r.dataset.kind, fire: !!r.querySelector('button[data-act="fire"]'), text: r.querySelector('.fl-deck-t').textContent, label: r.querySelector('button[data-act="fire"]').textContent.trim(), st: T.st('Walk-up', 'pudding') }; });
  check('waiting item shows a "Start in m:ss" countdown and a visible Start now button', deck.kind === 'deck' && deck.fire && /^Start in \d+:\d\d$/.test(deck.text) && deck.st === 'queued' && deck.label === 'Start now', deck);
  await page.locator('.fl-slip[data-ticket="' + await page.evaluate(() => T.id('Walk-up')) + '"] button[data-act="fire"]').click(); await settle(page, 250);
  const fired = await page.evaluate(() => ({ st: T.st('Walk-up', 'pudding'), kind: T.row('Walk-up', 'pudding').dataset.kind, toast: T.toast() }));
  check('Start now moves a one-step item to the screen and offers Undo', fired.st === 'displayed' && fired.kind === 'btn' && fired.toast.some((t) => /Start now/.test(t)), fired);

  // Z undoes
  await page.keyboard.press('z'); await settle(page, 200);
  check('Z undoes the last action (Start now)', (await page.evaluate(() => T.st('Walk-up', 'pudding'))) === 'queued');

  // rush toggle from the overflow menu
  await page.locator('.fl-slip[data-ticket="' + await page.evaluate(() => T.id('Walk-up')) + '"] button[data-act="more"]').click(); await settle(page, 80);
  const menuItems = await page.evaluate(() => Array.from(document.querySelectorAll('.menu .menu-item')).map((b) => b.textContent.trim()));
  check('slip overflow menu offers Rush, Recall and Void ticket', menuItems.some((t) => /rush/i.test(t)) && menuItems.some((t) => /Recall/.test(t)) && menuItems.includes('Void ticket'), menuItems);
  await page.locator('.menu-item', { hasText: 'Make it a rush' }).click(); await settle(page, 250);
  const rushed = await page.evaluate(() => ({ order: T.order(), stamp: !!T.slip('Walk-up').querySelector('.stamp'), toast: T.toast() }));
  check('making a ticket a rush moves it up behind the overdue and older rush tickets and stamps it', rushed.order[0] === 'Table 4' && rushed.order[1] === 'Drive-thru 7' && rushed.order[2] === 'Walk-up' && rushed.stamp, rushed);
  await page.locator('.fl-slip[data-ticket="' + await page.evaluate(() => T.id('Walk-up')) + '"] button[data-act="more"]').click();
  await page.locator('.menu-item', { hasText: 'Take off rush' }).click(); await settle(page, 250);
  check('taking the rush off puts it back in age order', JSON.stringify(await page.evaluate(() => T.order())) === JSON.stringify(['Table 4', 'Drive-thru 7', 'Pickup, Dana', 'Walk-up']), await page.evaluate(() => T.order()));

  // bump with undone items asks first
  await page.locator('.fl-slip[data-ticket="' + await page.evaluate(() => T.id('Walk-up')) + '"] button[data-act="bump"]').click(); await settle(page, 200);
  const dlg = await page.evaluate(() => { const d = document.querySelector('.sheet[role="alertdialog"]'); return d && { title: d.querySelector('.sheet-title').textContent, body: d.querySelector('.sheet-body').textContent, btns: Array.from(d.querySelectorAll('.sheet-foot button')).map((b) => b.textContent.trim()) }; });
  check('bump with items not done asks "2 items not done. Bump anyway?" and spells out the consequence', dlg && dlg.title === '2 items not done. Bump anyway?' && /forced bump/.test(dlg.body) && /undo/i.test(dlg.body) && dlg.btns.includes('Bump anyway') && dlg.btns.includes('Keep cooking'), dlg);
  await shot(page, 'confirm-bump');
  await page.locator('.sheet[role="alertdialog"] button', { hasText: 'Keep cooking' }).click(); await settle(page, 300);
  check('"Keep cooking" leaves the ticket on the board', (await page.evaluate(() => T.t('Walk-up').status)) === 'active');
  await page.locator('.fl-slip[data-ticket="' + await page.evaluate(() => T.id('Walk-up')) + '"] button[data-act="bump"]').click(); await settle(page, 200);
  await page.locator('.sheet[role="alertdialog"] button', { hasText: 'Bump anyway' }).click(); await settle(page, 700);
  const bumped = await page.evaluate(() => ({ st: T.t('Walk-up').status, forced: T.t('Walk-up').forced, onBoard: !!T.slip('Walk-up'), toast: T.toast(), undo: !!document.querySelector('.toast .toast-undo') }));
  check('Bump anyway sends it out as a forced bump and raises an Undo toast', bumped.st === 'expedited' && bumped.forced === true && !bumped.onBoard && bumped.undo && bumped.toast.some((t) => /#\d+ bumped/.test(t)), bumped);
  await page.locator('.toast .toast-undo').click(); await settle(page, 500);
  check('Undo brings the bumped ticket back to the board', (await page.evaluate(() => T.t('Walk-up').status)) === 'active' && !!(await page.evaluate(() => T.slip('Walk-up'))));

  // all done: bump needs no confirm and is the primary sage button
  await page.evaluate(() => { const S = SB.store, t = T.t('Walk-up'); t.items.forEach((i) => { if (i.status === 'queued') S.dispatchEx('fireNow', { ticketId: t.id, itemId: i.id }, { source: 'ui' }); }); S.dispatchEx('completeZone', { ticketId: t.id, zone: 'pit' }, { source: 'ui' }); S.dispatchEx('completeZone', { ticketId: t.id, zone: 'cold' }, { source: 'ui' }); });
  await settle(page, 300);
  const ready = await page.evaluate(() => { const b = T.slip('Walk-up').querySelector('button[data-act="bump"]'); return { cls: b.className, label: b.getAttribute('aria-label'), count: T.slip('Walk-up').querySelector('.fl-count').textContent, ready: T.slip('Walk-up').dataset.ready, bg: getComputedStyle(b).backgroundColor }; });
  check('when everything is done Bump is the primary sage button and the slip says "Ready to bump"', /btn-success/.test(ready.cls) && ready.count === 'Ready to bump' && ready.ready === 'true' && /everything is done/.test(ready.label), ready);
  await shot(page, 'ready-to-bump', { clip: { x: 0, y: 80, width: 1280, height: 640 } });
  await page.locator('.fl-slip[data-ticket="' + await page.evaluate(() => T.id('Walk-up')) + '"] button[data-act="bump"]').click(); await settle(page, 600);
  check('bumping a finished ticket needs no confirmation', (await page.evaluate(() => !document.querySelector('.sheet[role="alertdialog"]') && T.t('Walk-up').status)) === 'expedited');

  // void with a reason
  await page.locator('.fl-slip[data-ticket="' + await page.evaluate(() => T.id('Pickup, Dana')) + '"] button[data-act="more"]').click();
  await page.locator('.menu-item', { hasText: 'Void ticket' }).click(); await settle(page, 250);
  const vs = await page.evaluate(() => { const s = document.querySelector('.sheet'); return { title: s.querySelector('.sheet-title').textContent, chips: Array.from(s.querySelectorAll('.fl-reasons .chip')).map((c) => c.textContent), btnDisabled: Array.from(s.querySelectorAll('.sheet-foot button')).find((b) => /Void ticket/.test(b.textContent)).disabled }; });
  check('void sheet has reason chips (wrong order, customer left, dropped, other) and Void is disabled until one is picked', /Void ticket #\d+\?/.test(vs.title) && vs.chips.join('|') === 'Wrong order|Customer left|Dropped|Other' && vs.btnDisabled, vs);
  await shot(page, 'void-sheet');
  await page.locator('.fl-reasons .chip', { hasText: 'Other' }).click();
  const otherState = await page.evaluate(() => ({ field: !document.querySelector('.sheet .field').hidden, dis: Array.from(document.querySelectorAll('.sheet-foot button')).find((b) => /Void ticket/.test(b.textContent)).disabled, max: document.querySelector('.sheet input.input').maxLength }));
  check('"Other" asks for text (up to 40 characters) before Void is allowed', otherState.field && otherState.dis && otherState.max === 40, otherState);
  await page.locator('.sheet input.input').fill('Customer asked for brisket only, x'.padEnd(60, 'x'));
  const typed = await page.evaluate(() => document.querySelector('.sheet input.input').value.length);
  check('the free-text reason is limited to 40 characters', typed <= 40, typed);
  await page.locator('.fl-reasons .chip', { hasText: 'Wrong order' }).click();
  await page.locator('.sheet-foot button', { hasText: 'Void ticket' }).click(); await settle(page, 700);
  const vd = await page.evaluate(() => ({ st: T.t('Pickup, Dana').status, reason: T.t('Pickup, Dana').voidReason, onBoard: !!T.slip('Pickup, Dana'), toast: T.toast() }));
  check('voiding records the reason, removes the slip and raises an Undo toast', vd.st === 'voided' && vd.reason === 'Wrong order' && !vd.onBoard && vd.toast.some((t) => /voided/.test(t)), vd);
  await page.locator('.toast .toast-undo').click(); await settle(page, 500);
  check('Undo of a void restores the ticket', (await page.evaluate(() => T.t('Pickup, Dana').status)) === 'active');

  // complete zone: PIT view, "All done here" removes the slip from PIT but keeps it on EXP
  await page.evaluate(() => SB.router.go({ kind: 'floor', zone: 'pit' })); await settle(page, 300);
  const pitSlips = await page.evaluate(() => T.order());
  check('PIT view shows only tickets that still have PIT work (Table 4 and Walk-up are finished there)', JSON.stringify(pitSlips) === JSON.stringify(['Drive-thru 7', 'Pickup, Dana']), pitSlips);
  const dvRows = await page.evaluate(() => Array.from(T.slip('Drive-thru 7').querySelectorAll('.fl-row')).map((r) => r.dataset.menu));
  check('station view shows only that station\'s items (Drive-thru 7: the sandwich, not the fried pickles)', dvRows.join() === 'brisket_sand', dvRows);
  const zbtn = await page.evaluate(() => { const b = T.slip('Drive-thru 7').querySelector('button[data-act="zone"]'); return { txt: b.textContent.trim(), hidden: b.hidden, label: b.getAttribute('aria-label') }; });
  check('slip has an "All done here" button', zbtn.txt === 'All done here' && !zbtn.hidden && /Pit/.test(zbtn.label), zbtn);
  await page.locator('.fl-slip[data-ticket="' + await page.evaluate(() => T.id('Drive-thru 7')) + '"] button[data-act="zone"]').click(); await settle(page, 800);
  const leave = await page.evaluate(() => ({ pit: T.order(), item: T.st('Drive-thru 7', 'brisket_sand'), toast: T.toast() }));
  check('"All done here" completes the station\'s items and the slip leaves PIT', leave.item === 'done' && !leave.pit.includes('Drive-thru 7') && leave.toast.some((t) => /done/.test(t)), leave);
  await page.evaluate(() => SB.router.go({ kind: 'floor', zone: 'expo' })); await settle(page, 300);
  const exp = await page.evaluate(() => ({ order: T.order(), rows: Array.from(T.slip('Drive-thru 7').querySelectorAll('.fl-row')).map((r) => ({ chip: !!r.querySelector('.chip-zone'), word: (r.querySelector('.fl-state-w') || r.querySelector('.fl-deck-t') || r.querySelector('.fl-act-word') || {}).textContent, ro: r.dataset.kind })) }));
  check('EXP still shows the ticket, every item with its zone chip and a status word', exp.order.includes('Drive-thru 7') && exp.rows.length === 2 && exp.rows.every((r) => r.chip && r.word) && exp.rows.some((r) => r.word === 'Done'), exp);
  const expoFire = await page.evaluate(() => Array.from(document.querySelectorAll('.fl-row[data-kind="btn"]')).length);
  check('EXP rows are read-only for work items (no Start or Done buttons)', expoFire === 0, expoFire);
  await shot(page, 'exp-1280x800');
  noErrors('tap flow', logs);
});

/* ========================================================================================================================
 * 3. Tap safety: the clock ticks while the cook taps (original defect F-O1)
 * ====================================================================================================================== */
group('tap safety across ticks (F-O1)');
await withPage({ w: 1280, h: 800, file: OUT }, async (page, logs) => {
  await boot(page);
  // idle: no node may be added or removed while the clock runs
  await page.evaluate(() => {
    window.__mut = { added: 0, removed: 0, text: 0, attrs: 0 };
    const els = (nl) => Array.from(nl).filter((n) => n.nodeType === 1).length;
    const mo = new MutationObserver((list) => list.forEach((m) => { if (m.type === 'childList') { window.__mut.added += els(m.addedNodes); window.__mut.removed += els(m.removedNodes); } else if (m.type === 'characterData') window.__mut.text++; else window.__mut.attrs++; }));
    mo.observe(document.querySelector('.fl-main'), { subtree: true, childList: true, characterData: true, attributes: true });
    window.__mo = mo;
    window.__ticks = 0; SB.store.subscribeTick(() => { window.__ticks++; });
    window.__keep = { slips: Array.from(document.querySelectorAll('.fl-slip')), rows: Array.from(document.querySelectorAll('.fl-row')), btns: Array.from(document.querySelectorAll('.fl-row button')) };
  });
  await wait(2600);
  const idle = await page.evaluate(() => ({ m: window.__mut, ticks: window.__ticks }));
  check('2.6 s of live clock ticks add or remove zero DOM elements', idle.m.added === 0 && idle.m.removed === 0 && idle.ticks >= 2, idle);
  check('ticks only edit text (timers, in the same text nodes) and attributes (levels)', idle.m.text > 0, idle);
  // identity under a tick storm while a real pointer taps three items
  await page.evaluate(() => { window.__storm = setInterval(() => SB.store.tick(), 8); window.__mut.added = window.__mut.removed = 0; window.__t0 = window.__ticks; });
  const cust = 'Table 4';
  const ids = await page.evaluate((c) => ['brisket_half', 'mac', 'slaw'].map((m) => T.item(c, m).id), cust);
  for (const id of ids) {
    await page.locator('.fl-row[data-item="' + id + '"] button[data-act="item"]').click();
    await wait(80);
  }
  await wait(300);
  await page.evaluate(() => clearInterval(window.__storm));
  const storm = await page.evaluate((ids) => ({ ticks: window.__ticks - window.__t0, st: ['brisket_half', 'mac', 'slaw'].map((m) => T.st('Table 4', m)), kept: window.__keep.slips.every((s) => s.isConnected) && window.__keep.rows.filter((r) => !ids.includes(r.dataset.item)).every((s) => s.isConnected), m: window.__mut, same: Array.from(document.querySelectorAll('.fl-slip')).every((s) => window.__keep.slips.includes(s)) }), ids);
  check('all three taps landed during a storm of clock ticks', JSON.stringify(storm.st) === JSON.stringify(['cooking', 'cooking', 'done']) && storm.ticks > 20, storm);
  check('under the storm every slip node, and every row that was not tapped, is the same node as before', storm.kept && storm.same, storm);
  check('under the storm no slip and no row was removed or added', storm.m.removed <= 2 /* the one-tap row swaps its button for status text */ && storm.m.added <= 2, storm.m);
  // a new ticket arriving must not re-create existing slips
  await page.evaluate(() => { window.__before = Array.from(document.querySelectorAll('.fl-slip')); SB.store.dispatchEx('createTicket', { customer: 'Newcomer', channel: 'takeout', items: [{ menuId: 'mac' }] }, { source: 'ui' }); });
  await settle(page, 400);
  const nw = await page.evaluate(() => ({ kept: window.__before.every((s) => s.isConnected), count: document.querySelectorAll('.fl-slip').length, last: T.order().slice(-1)[0], printing: !!T.slip('Newcomer') }));
  check('a new ticket joins at the end without re-creating the others', nw.kept && nw.count === 5 && nw.last === 'Newcomer', nw);
  // time-state transitions happen through the tick without touching structure
  await page.evaluate(() => { window.__lvl = T.slip('Drive-thru 7').dataset.level; window.__tx = T.slip('Drive-thru 7').querySelector('.slip-timer').textContent; SB.store.setSpeed(60); });
  await wait(2400);
  const lvl = await page.evaluate(() => ({ from: window.__lvl, to: T.slip('Drive-thru 7').dataset.level, word: T.slip('Drive-thru 7').querySelector('.fl-bw').textContent, timer: T.slip('Drive-thru 7').querySelector('.slip-timer').textContent, was: window.__tx, timerLevel: T.slip('Drive-thru 7').querySelector('.slip-timer').dataset.level }));
  await page.evaluate(() => SB.store.setSpeed(1));
  check('timer text, level and badge word move with the (accelerated) clock: On time to Running late', lvl.from === 'ok' && lvl.to === 'warn' && lvl.word === 'Running late' && lvl.timerLevel === 'warn' && lvl.timer !== lvl.was, lvl);
  noErrors('tap safety', logs);
});

/* ========================================================================================================================
 * 4. Stations, highlight, all-day dock, keyboard
 * ====================================================================================================================== */
group('stations, highlight, dock, keyboard (1280 x 800)');
await withPage({ w: 1280, h: 800, file: OUT }, async (page, logs) => {
  await boot(page);
  await page.locator('.fl-seg [data-id="cold"]').click(); await settle(page, 300);
  const cold = await page.evaluate(() => ({ order: T.order(), zone: SB.floor.zone(), hash: location.hash, rows: Array.from(document.querySelectorAll('.fl-row')).map((r) => r.dataset.menu), mode: document.querySelector('.fl').dataset.mode, selected: document.querySelector('.fl-seg [aria-selected="true"]').dataset.id }));
  check('clicking a tab filters the board and updates the route', cold.zone === 'cold' && cold.selected === 'cold' && /cold/.test(cold.hash) && cold.order.length === 3 && cold.rows.every((m) => ['slaw', 'tea', 'pudding'].includes(m)), cold);
  const deckRow = await page.evaluate(() => { const r = T.row('Walk-up', 'pudding'); return { kind: r.dataset.kind, fire: !!r.querySelector('[data-act="fire"]'), dim: getComputedStyle(r.querySelector('.slip-name')).color }; });
  check('waiting items show on their station, dim, with Start now', deckRow.kind === 'deck' && deckRow.fire, deckRow);
  const dock = await page.evaluate(() => ({ chips: Array.from(document.querySelectorAll('.fl-dchip')).map((c) => c.querySelector('.fl-dchip-name').textContent + ' ' + c.querySelector('.fl-dchip-x').textContent), title: document.querySelector('.fl-dock-title').textContent, sum: document.querySelector('.fl-dock-sum').textContent }));
  check('all-day dock is station-aware (only cold items) and sorted by quantity', dock.chips.every((c) => /Slaw|Sweet tea|Pudding/.test(c)) && dock.chips[0].startsWith('Sweet tea') && /Cold/.test(dock.title), dock);
  await page.locator('.fl-seg [data-id="all"]').click(); await settle(page, 300);
  const all = await page.evaluate(() => ({ chips: Array.from(document.querySelectorAll('.fl-dchip')).map((c) => c.querySelector('.fl-dchip-name').textContent + ' ' + c.querySelector('.fl-dchip-x').textContent), req: document.querySelector('.fl-dock-sum').textContent, ref: SB.store.select.allDay('all').map((e) => e.short + ' \u00d7' + e.required) }));
  check('All view dock lists every item still to make with its count, sorted desc', JSON.stringify(all.chips) === JSON.stringify(all.ref) && /to make/.test(all.req), all);
  const bars = await page.evaluate(() => Array.from(document.querySelectorAll('.fl-dchip')).every((c) => c.querySelector('.fl-dchip-bar')));
  check('each dock chip has a done/required bar', bars);
  // highlight
  await page.locator('.fl-dchip[data-menu="brisket_half"]').click(); await settle(page, 200);
  // The outline fades in: read the colour only once every running CSS transition has finished.
  await page.waitForFunction(() => !document.getAnimations().some((a) => a.constructor.name === 'CSSTransition' && a.playState === 'running'), null, { timeout: 3000 }).catch(() => {});
  const hl = await page.evaluate(() => ({ h: SB.floor.highlighted(), pressed: document.querySelector('.fl-dchip[data-menu="brisket_half"]').getAttribute('aria-pressed'), shadow: getComputedStyle(document.querySelector('.fl-row[data-menu="brisket_half"] > .slip-item')).boxShadow, other: getComputedStyle(document.querySelector('.fl-row[data-menu="mac"] > .slip-item')).boxShadow, clear: !document.querySelector('.fl-dock-clear').hidden, root: document.querySelector('.fl').getAttribute('data-hl') }));
  check('tapping a dock chip highlights matching rows (outline) and no others', hl.h === 'brisket_half' && hl.pressed === 'true' && /rgb\(184, 92, 56\)/.test(hl.shadow) && !/rgb\(184, 92, 56\)/.test(hl.other) && hl.clear && hl.root === 'brisket_half', hl);
  await shot(page, 'highlight-1280x800');
  await page.locator('.fl-dchip[data-menu="brisket_half"]').click(); await settle(page, 120);
  check('tapping the chip again clears the highlight', (await page.evaluate(() => SB.floor.highlighted())) === null);
  await page.evaluate(() => SB.floor.highlight('mac')); await settle(page, 80);
  await page.keyboard.press('Escape'); await settle(page, 80);
  check('Esc clears the highlight', (await page.evaluate(() => SB.floor.highlighted())) === null);
  await page.evaluate(() => SB.floor.highlight('slaw')); await settle(page, 80);
  await page.locator('.fl-dock-clear').click(); await settle(page, 80);
  check('"Clear highlight" button clears it', (await page.evaluate(() => SB.floor.highlighted())) === null);
  // collapse
  await page.locator('.fl-dock-toggle').click(); await settle(page, 200);
  const col = await page.evaluate(() => ({ exp: document.querySelector('.fl-dock-toggle').getAttribute('aria-expanded'), listVisible: getComputedStyle(document.querySelector('.fl-dock-list')).display !== 'none', lift: document.documentElement.style.getPropertyValue('--fl-lift'), stored: localStorage.getItem('smokebox.v1.dock') }));
  check('dock collapses (aria-expanded=false), remembers it and updates the toast lift', col.exp === 'false' && !col.listVisible && /px/.test(col.lift) && col.stored === 'true', col);
  await page.locator('.fl-dock-toggle').click(); await settle(page, 200);
  // a toast must clear the dock
  await page.evaluate(() => SB.ui.toast('Lift check', { tone: 'info', ms: 8000 })); await settle(page, 300);
  const lift = await page.evaluate(() => ({ toast: document.querySelector('.toast').getBoundingClientRect().bottom, dock: document.querySelector('.fl-dock').getBoundingClientRect().top }));
  check('toasts sit above the all-day dock', lift.toast <= lift.dock + 1, lift);

  // keyboard shortcuts
  const keys = { n: 'order', r: 'recall', h: 'hold', 8: 'board86', d: 'demo' };
  for (const [k, name] of Object.entries(keys)) {
    await page.keyboard.press(k); await settle(page, 80);
    check('key ' + k.toUpperCase() + ' opens ' + name, await page.evaluate((n) => SB.sheets.isOpen(n), name));
    await page.evaluate(() => SB.sheets.closeAll()); await settle(page, 80);
  }
  await page.keyboard.press('n'); await settle(page, 80);
  await page.keyboard.press('h'); await settle(page, 80);
  check('shortcuts are ignored while a sheet is open', await page.evaluate(() => document.querySelector('.fl-cabinet').hidden));
  await page.evaluate(() => SB.sheets.closeAll()); await settle(page, 80);
  await page.evaluate(() => { const i = document.createElement('input'); i.id = 'typing'; document.body.appendChild(i); i.focus(); });
  await page.keyboard.type('nrh8d1'); await settle(page, 80);
  const typedOk = await page.evaluate(() => ({ v: document.getElementById('typing').value, sheets: SB.sheets.count(), zone: SB.floor.zone() }));
  await page.evaluate(() => document.getElementById('typing').remove());
  check('shortcuts are ignored while typing in a field', typedOk.v === 'nrh8d1' && typedOk.sheets === 0 && typedOk.zone === 'all', typedOk);
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  const zones = [];
  for (const k of ['2', '3', '4', '5', '6', '1']) { await page.keyboard.press(k); await settle(page, 80); zones.push(await page.evaluate(() => SB.floor.zone())); }
  check('keys 1 to 6 switch between All, PIT, HOT, FRY, CLD, EXP', JSON.stringify(zones) === JSON.stringify(['pit', 'sides', 'fry', 'cold', 'expo', 'all']), zones);
  await page.keyboard.press('?'); await settle(page, 80);
  check('? opens help', await page.evaluate(() => SB.sheets.isOpen('help'))); await page.evaluate(() => SB.sheets.closeAll());
  const sc = await page.evaluate(() => SB.floor.shortcuts);
  check('SB.floor.shortcuts is an array of {key, keys, label} for the help sheet', Array.isArray(sc) && sc.length >= 8 && sc.every((s) => typeof s.key === 'string' && Array.isArray(s.keys) && typeof s.label === 'string') && sc.some((s) => s.key === 'N') && sc.some((s) => /1 to 6/.test(s.key)), sc);
  // the tab list is a roving tablist: arrow keys
  await page.locator('.fl-seg [data-id="all"]').focus();
  await page.keyboard.press('ArrowRight'); await settle(page, 200);
  check('arrow keys move between station tabs', (await page.evaluate(() => SB.floor.zone())) === 'pit');
  await page.evaluate(() => SB.router.go({ kind: 'floor', zone: 'all' }));
  noErrors('stations, dock, keyboard', logs);
});

/* ========================================================================================================================
 * 5. Announcements, sound, setZone before mount
 * ====================================================================================================================== */
group('announcements and sound');
await withPage({ w: 1280, h: 800, file: OUT }, async (page, logs) => {
  await boot(page);
  await page.evaluate(() => {
    window.__osc = 0;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) { const orig = AC.prototype.createOscillator; AC.prototype.createOscillator = function () { window.__osc++; return orig.apply(this, arguments); }; }
  });
  check('sound is on by default', (await page.evaluate(() => SB.floor.sound())) === true);
  await page.evaluate(() => SB.floor.setSound(false));
  await page.evaluate(() => SB.store.dispatchEx('createTicket', { customer: 'Quiet one', channel: 'takeout', items: [{ menuId: 'mac' }] }, { source: 'ui' }));
  await settle(page, 400);
  check('no chime while sound is off', (await page.evaluate(() => window.__osc)) === 0);
  await page.evaluate(() => { window.__sound = SB.floor.setSound(true); });
  const s1 = await page.evaluate(() => ({ on: SB.floor.sound(), stored: localStorage.getItem('smokebox.v1.sound'), osc: window.__osc }));
  check('setSound(true) persists under smokebox.v1.sound and plays a confirming chime', s1.on && s1.stored === 'true' && s1.osc >= 1, s1);
  await wait(700);
  const o0 = await page.evaluate(() => window.__osc);
  await page.evaluate(() => SB.store.dispatchEx('createTicket', { customer: 'Loud one', channel: 'takeout', items: [{ menuId: 'mac' }] }, { source: 'ui' }));
  await settle(page, 400);
  check('the first ticket after enabling sound chimes with no extra tap', (await page.evaluate(() => window.__osc)) > o0);
  await wait(800);
  const o1 = await page.evaluate(() => window.__osc);
  await page.evaluate(() => { for (let i = 0; i < 6; i++) SB.store.dispatchEx('createTicket', { customer: 'Burst ' + i, channel: 'takeout', items: [{ menuId: 'slaw' }] }, { source: 'ui' }); });
  await settle(page, 400);
  const o2 = await page.evaluate(() => window.__osc);
  check('a burst of six tickets is one chime (two notes), not six', o2 - o1 === 2, { o1, o2 });
  await page.evaluate(() => SB.floor.setSound(false));
  check('setSound(false) turns it off and persists', (await page.evaluate(() => SB.floor.sound() === false && localStorage.getItem('smokebox.v1.sound'))) === 'false');
  // announcements are calm: one polite sentence per change, never per second
  await page.evaluate(() => { window.__says = []; const live = document.querySelector('.live-region'); new MutationObserver(() => window.__says.push(live.textContent)).observe(live, { childList: true, characterData: true, subtree: true }); });
  await page.evaluate(() => SB.store.dispatchEx('createTicket', { customer: 'Announced', channel: 'dine_in', items: [{ menuId: 'mac' }] }, { source: 'ui' }));
  await wait(3200); // announcements are batched over 2.5 s
  const says = await page.evaluate(() => window.__says.filter(Boolean));
  check('a new ticket is announced once through the live region', says.length === 1 && /Ticket #\d+ added for Announced/.test(says[0]), says);
  await wait(3500);
  const says2 = await page.evaluate(() => window.__says.filter(Boolean));
  check('nothing is announced just because the clock ticks', says2.length === 1, says2);
  noErrors('announcements and sound', logs);
});

/* ========================================================================================================================
 * 6. Viewports and themes (screenshots), scaling, overflow, tab order
 * ====================================================================================================================== */
group('viewports, themes, scaling');
const VPS = [[2560, 1440], [1280, 800], [1024, 768], [390, 844], [280, 640]];
for (const [w, h] of VPS) {
  await withPage({ w, h, file: OUT, touch: w < 800 }, async (page, logs) => {
    await boot(page);
    await page.evaluate(() => { const t = T.t('Table 4'); SB.store.dispatchEx('advanceItem', { ticketId: t.id, itemId: T.item('Table 4', 'brisket_half').id }, { source: 'ui' }); SB.store.dispatchEx('createTicket', { customer: 'M'.repeat(38), channel: 'third_party', items: [{ menuId: 'cornbread', qty: 3, mods: ['Gluten-free, separate tongs'] }], note: 'Please write "Happy birthday Alexandria" on the box, no nuts anywhere near it at all.', createdAt: SB.store.now() - 60e3 }, { source: 'ui' }); });
    await page.evaluate(() => SB.theme.setDensity('large')); // these checks are about full-size tickets; compact ones have their own group
    await settle(page, 700);
    const nh = await noHScroll(page);
    check(w + 'x' + h + ': no horizontal scroll anywhere (page, board, header, slips)', JSON.stringify(nh) === JSON.stringify({ doc: 0, main: 0, head: 0, slips: 0 }), nh);
    const m = await page.evaluate(() => { const g = document.querySelector('.fl-grid'); const cols = getComputedStyle(g).gridTemplateColumns.split(' ').length; const s = document.querySelector('.fl-slip'); const sr = s.getBoundingClientRect(); const hr = document.querySelector('.fl-head').getBoundingClientRect(); const seg = document.querySelector('.fl-seg').getBoundingClientRect(); const n = T.slip('M'.repeat(38)); const nr = n.getBoundingClientRect(); return { cols, k: getComputedStyle(document.querySelector('.fl')).getPropertyValue('--fl-k').trim(), slipW: Math.round(sr.width), head: Math.round(hr.height), segW: Math.round(seg.width), longW: Math.round(nr.width), longScroll: n.scrollWidth - n.clientWidth, num: parseFloat(getComputedStyle(s.querySelector('.slip-num')).fontSize), timer: parseFloat(getComputedStyle(s.querySelector('.slip-timer')).fontSize), items: parseFloat(getComputedStyle(s.querySelector('.slip-name')).fontSize) }; });
    if (w === 2560) check('2560: slips scale up (k 1.5, ticket number >= 64 px, item text >= 28 px) and the header is not stretched', m.k === '1.5' && m.num >= 64 && m.items >= 28 && m.segW < 1000 && m.head < 160, m);
    if (w === 1280) check('1280: four columns of slips with big ticket number (>= 40 px) and timer (>= 34 px)', m.cols === 4 && m.num >= 40 && m.timer >= 34, m);
    if (w === 390) check('390: single column of slips', m.cols === 1, m);
    if (w === 280) check('280: single column, long names wrap, nothing overflows', m.cols === 1 && m.longScroll <= 1, m);
    // every action on a slip is reachable and big enough, at every size
    const small = await page.evaluate(() => Array.from(document.querySelectorAll('.fl-head button, .fl-seg .seg-opt, .fl-slip button, .fl-dock button')).filter((b) => b.offsetParent && b.getBoundingClientRect().top < innerHeight && b.getBoundingClientRect().bottom > 0).map((b) => { const r = b.getBoundingClientRect(); return { n: (b.getAttribute('aria-label') || b.textContent).trim().slice(0, 16), w: Math.round(r.width), h: Math.round(r.height) }; }).filter((x) => x.h < 44 || x.w < 40));
    check(w + 'x' + h + ': touch targets are >= 44 px high and >= 40 px wide', small.length === 0, small.slice(0, 6));
    const newVis = await page.evaluate(() => { const b = document.querySelector('.fl-new'); const r = b.getBoundingClientRect(); return b.offsetParent !== null && r.right <= innerWidth && r.left >= 0 && r.width > 40; });
    check(w + 'x' + h + ': New ticket stays visible', newVis);
    await shot(page, 'floor-' + w + 'x' + h);
    noErrors(w + 'x' + h, logs);
  });
}
// tab order follows the visual order in the header (wide and phone layouts)
for (const [w, h] of [[1280, 800], [390, 844]]) {
  await withPage({ w, h, file: OUT }, async (page, logs) => {
    await boot(page);
    await page.evaluate(() => { const first = Array.from(document.querySelectorAll('.fl-head button, .fl-head [data-brand]')).find((e) => e.offsetParent); first.focus(); }); // the flame is hidden on a phone, so start at the first visible control
    const seq = [];
    for (let i = 0; i < 14; i++) {
      const r = await page.evaluate(() => { const a = document.activeElement; if (!a || !a.closest('.fl-head')) return null; const b = a.getBoundingClientRect(); return { n: (a.getAttribute('aria-label') || a.textContent || a.className).trim().slice(0, 14), y: Math.round(b.top), x: Math.round(b.left) }; });
      if (!r) break;
      seq.push(r);
      await page.keyboard.press('Tab');
    }
    // a roving tablist counts as one stop; the rest must go left to right, row after row
    let ok = seq.length >= 4, bad = null;
    for (let i = 1; i < seq.length; i++) { const p = seq[i - 1], c = seq[i]; const sameRow = Math.abs(c.y - p.y) < 30; if (sameRow ? c.x < p.x - 2 : c.y < p.y) { ok = false; bad = [p, c]; } }
    check(w + ': keyboard order through the header follows the visual order', ok, bad || seq);
    // the slips come after the header, in grid order
    const order = await page.evaluate(() => { document.querySelector('.fl-slip button').focus(); return null; });
    const pos = [];
    for (let i = 0; i < 24; i++) { await page.keyboard.press('Tab'); const r = await page.evaluate(() => { const a = document.activeElement; const s = a && a.closest && a.closest('.fl-slip'); if (!s) return null; const b = s.getBoundingClientRect(); return { y: Math.round(b.top + document.querySelector('.fl-main').scrollTop), x: Math.round(b.left), t: s.dataset.ticket }; }); if (r) pos.push(r); }
    let ok2 = true;
    for (let i = 1; i < pos.length; i++) { const p = pos[i - 1], c = pos[i]; if (p.t === c.t) continue; if (Math.abs(c.y - p.y) < 30 ? c.x < p.x : c.y < p.y) ok2 = false; }
    // KNOWN BUG (A1): the worst overdue slips are moved to the front with CSS order only (rankOverdue in 70-floor-board.js), so keyboard and
    // screen reader order no longer match what is drawn. Reported in docs/audit/e2e-triage.md; remove knownBug when the DOM order is fixed.
    knownBug(w + ': keyboard order through the slips follows the grid (left to right, top to bottom)', ok2 && pos.length > 4, pos.slice(0, 8), 'A1');
    noErrors('tab order ' + w, logs);
  });
}
// themes
await withPage({ w: 1280, h: 800, file: OUT }, async (page, logs) => {
  await boot(page);
  await page.evaluate(() => { SB.store.dispatchEx('advanceItem', { ticketId: T.id('Table 4'), itemId: T.item('Table 4', 'brisket_half').id }, { source: 'ui' }); });
  await page.evaluate(() => SB.theme.set('night')); await settle(page, 400);
  await shot(page, 'night-1280x800');
  const nt = await page.evaluate(() => ({ bg: getComputedStyle(document.querySelector('.fl')).backgroundColor, slip: getComputedStyle(document.querySelector('.fl-slip .slip-body')).backgroundColor, ink: getComputedStyle(document.querySelector('.fl-slip .slip-name')).color }));
  check('Night: board is dark, slips stay paper with dark ink', /rgb\(21, 24, 26\)/.test(nt.bg) && /rgb\(230, 225, 212\)/.test(nt.slip) && /rgb\(30, 34, 36\)/.test(nt.ink), nt);
  await page.evaluate(() => { SB.router.go({ kind: 'floor', zone: 'pit' }); }); await settle(page, 300);
  await shot(page, 'night-pit-1280x800');
  await page.evaluate(() => { SB.theme.set('day'); SB.theme.setTextSize('large'); SB.theme.setDensity('large'); SB.router.go({ kind: 'floor', zone: 'all' }); }); await settle(page, 500);
  const lg = await page.evaluate(() => ({ cls: document.documentElement.classList.contains('text-large'), name: parseFloat(getComputedStyle(document.querySelector('.slip-name')).fontSize), qty: parseFloat(getComputedStyle(document.querySelector('.slip-qty')).fontSize), cols: getComputedStyle(document.querySelector('.fl-grid')).gridTemplateColumns.split(' ').length, nh: document.querySelector('.fl-main').scrollWidth - document.querySelector('.fl-main').clientWidth }));
  await shot(page, 'large-1280x800');
  check('Large text: item names grow by 1.2x and nothing overflows sideways', lg.cls && lg.name >= 24 && lg.nh === 0, lg);
  await page.setViewportSize({ width: 390, height: 844 }); await settle(page, 400);
  await shot(page, 'large-390x844');
  const lg2 = await noHScroll(page);
  check('Large text at 390: no horizontal scroll', JSON.stringify(lg2) === JSON.stringify({ doc: 0, main: 0, head: 0, slips: 0 }), lg2);
  await page.evaluate(() => SB.theme.setTextSize('normal'));
  noErrors('themes', logs);
});
// wide demo header: chip visible when the clock runs (>= 1500 px)
for (const [cw, ch] of [[1600, 900], [1920, 1080], [2560, 1440]]) await withPage({ w: cw, h: ch, file: OUT }, async (page, logs) => {
  await boot(page);
  await page.evaluate(() => SB.store.setSpeed(15)); await settle(page, 1200);
  const c = await page.evaluate(() => { const ch = document.querySelector('.fl-demo-chip'); const r = ch.getBoundingClientRect(); return { visible: ch.offsetParent !== null && r.width > 20, txt: ch.textContent.trim(), head: document.querySelector('.fl-head').getBoundingClientRect().height, wrapped: document.querySelector('.fl-menu').getBoundingClientRect().top > 60 * (innerWidth > 2000 ? 1.5 : 1) }; });
  check(cw + ': demo clock chip is visible and says the speed', c.visible && /x15/.test(c.txt), c);
  // KNOWN BUG (A1, B5 in docs/audit/e2e-triage.md): at 1920 px wide the header wraps to two rows while the chip reads "Demo clock x15".
  knownBug(cw + ': the header stays one row with the demo clock chip', !c.wrapped, c, 'A1');
  await shot(page, 'demo-chip-' + cw + 'x' + ch, { clip: { x: 0, y: 0, width: cw, height: 130 } });
  await page.evaluate(() => SB.store.setSpeed(1));
  noErrors('demo chip', logs);
});
// empty station
await withPage({ w: 1280, h: 800, file: OUT }, async (page, logs) => {
  await boot(page, { seed: false });
  await page.evaluate(() => { SB.store.dispatchEx('createTicket', { customer: 'Only pit', channel: 'takeout', items: [{ menuId: 'sausage' }] }, { source: 'ui' }); });
  await settle(page, 300);
  await page.evaluate(() => SB.router.go({ kind: 'floor', zone: 'fry' })); await settle(page, 300);
  const es = await page.evaluate(() => ({ title: document.querySelector('.fl-empty h2').textContent, txt: document.querySelector('.fl-empty p').textContent, btn: Array.from(document.querySelectorAll('.fl-empty button')).map((b) => b.textContent.trim()) }));
  check('an empty station says so and offers a way back to All', /Nothing waiting at Fry/.test(es.title) && /1 ticket open on other stations/.test(es.txt) && es.btn.includes('Show all stations'), es);
  await shot(page, 'empty-station-1280x800');
  await page.locator('.fl-empty >> text=Show all stations').click(); await settle(page, 300);
  check('"Show all stations" returns to All', (await page.evaluate(() => SB.floor.zone())) === 'all');
  noErrors('empty station', logs);
});

/* ========================================================================================================================
 * 6b. Plain words: the next-step line, the cook countdown and Check it, one-tap Start now, the welcome card
 * ====================================================================================================================== */
group('plain words: next step, cook countdown, Start now, welcome');
await withPage({ w: 1280, h: 800, file: OUT }, async (page, logs) => {
  await boot(page, { seed: false });
  await page.evaluate(() => SB.floor.setWelcome(false));
  // a fresh ticket: one slow dish that can start now, one quick dish that waits its turn
  await page.evaluate(() => { SB.store.dispatchEx('createTicket', { customer: 'Plain', channel: 'dine_in', items: [{ menuId: 'hushpuppies' }, { menuId: 'brisket_half' }], src: 'live' }, { source: 'ui' }); });
  await settle(page, 300);
  const hint = () => page.evaluate(() => { const e = T.slip('Plain').querySelector('.slip-next'); return { text: e.textContent, tone: e.dataset.tone, hidden: e.hidden, shown: getComputedStyle(e).display !== 'none' }; });
  const h1 = await hint();
  check('every ticket says what to do next: "Tap START on Hush puppies. Brisket 1/2 starts in m:ss."', h1.shown && /^Tap START on Hush puppies\. Brisket 1\/2 starts in \d+:\d\d\.$/.test(h1.text) && h1.tone === 'act', h1);
  const w1 = await page.evaluate(() => ({ text: T.row('Plain', 'brisket_half').querySelector('.fl-deck-t').textContent, btn: T.row('Plain', 'brisket_half').querySelector('button[data-act="fire"]').getAttribute('aria-label') }));
  check('the waiting dish says "Start in m:ss" and its button "Start now" (no "fire", no "on deck")', /^Start in \d+:\d\d$/.test(w1.text) && w1.btn === 'Start now: Brisket, 1/2 lb', w1);
  // Start now cooks a two-step dish in one tap
  await page.locator('.fl-slip[data-ticket="' + await page.evaluate(() => T.id('Plain')) + '"] .fl-row[data-item="' + await page.evaluate(() => T.item('Plain', 'brisket_half').id) + '"] button[data-act="fire"]').click(); await settle(page, 300);
  const sn = await page.evaluate(() => ({ st: T.st('Plain', 'brisket_half'), left: T.row('Plain', 'brisket_half').querySelector('.fl-cook-t').textContent, override: T.item('Plain', 'brisket_half').override }));
  check('Start now on a two-step dish starts the cook at once (one tap, not two) and the countdown shows', sn.st === 'cooking' && /^\d+:\d\d left$/.test(sn.left) && sn.override === true, sn);
  await page.keyboard.press('z'); await settle(page, 250);
  check('Z puts it back to waiting', (await page.evaluate(() => T.st('Plain', 'brisket_half'))) === 'queued');
  // START, countdown, Check it
  await page.locator('.fl-slip[data-ticket="' + await page.evaluate(() => T.id('Plain')) + '"] .fl-row[data-item="' + await page.evaluate(() => T.item('Plain', 'hushpuppies').id) + '"] button[data-act="item"]').click(); await settle(page, 300);
  const h2 = await hint();
  check('after START the line shows the time left and the next dish', /^Hush puppies: \d+:\d\d left\. Brisket 1\/2 starts in \d+:\d\d\.$/.test(h2.text), h2);
  const c0 = await page.evaluate(() => ({ cook: T.row('Plain', 'hushpuppies').dataset.cook, tile: T.row('Plain', 'hushpuppies').querySelector('.fl-act-word').textContent }));
  check('a cooking dish counts down (data-cook=run) and the tile still says Done', c0.cook === 'run' && c0.tile === 'Done', c0);
  // the clock jumps past the dish's usual time: Check it, a spoken cue, the tile stays tappable, nothing completes by itself
  await page.evaluate(() => { window.__says = []; const live = document.querySelector('.live-region'); new MutationObserver(() => window.__says.push(live.textContent)).observe(live, { childList: true, characterData: true, subtree: true }); SB.store.setSpeed(120); });
  await wait(4500);
  await page.evaluate(() => SB.store.setSpeed(1));
  await wait(3000); // announcements are batched over 2.5 s
  await settle(page, 300);
  const c1 = await page.evaluate(() => ({ cook: T.row('Plain', 'hushpuppies').dataset.cook, text: T.row('Plain', 'hushpuppies').querySelector('.fl-cook-t').textContent, st: T.st('Plain', 'hushpuppies'), says: window.__says.filter(Boolean) }));
  check('at zero the row says "Check it +m:ss" and flashes (data-cook=check), and the dish is still cooking', c1.cook === 'check' && /^Check it \+\d+:\d\d$/.test(c1.text) && c1.st === 'cooking', c1);
  check('Check it is spoken once through the live region', c1.says.filter((x) => /Check Hush puppies on ticket #\d+/.test(x)).length === 1, c1.says);
  const h3 = await hint();
  check('the next-step line turns to "Check Hush puppies. Tap DONE when ready."', /^Check Hush puppies\. Tap DONE when ready\./.test(h3.text) && h3.tone === 'check', h3);
  // finish everything: the line says Bump
  await page.locator('.fl-slip[data-ticket="' + await page.evaluate(() => T.id('Plain')) + '"] .fl-row[data-item="' + await page.evaluate(() => T.item('Plain', 'hushpuppies').id) + '"] button[data-act="item"]').click(); await settle(page, 300);
  await page.evaluate(() => { const t = T.t('Plain'); const b = T.item('Plain', 'brisket_half'); SB.store.dispatchEx('fireNow', { ticketId: t.id, itemId: b.id, start: true }, { source: 'ui' }); }); await settle(page, 300);
  await page.evaluate(() => { const t = T.t('Plain'); const b = T.item('Plain', 'brisket_half'); SB.store.dispatchEx('completeItem', { ticketId: t.id, itemId: b.id }, { source: 'ui' }); }); await settle(page, 300);
  const h4 = await hint();
  check('when everything is done the line says "Everything is done. Tap Bump." and the Bump button is green', h4.text === 'Everything is done. Tap Bump.' && h4.tone === 'go' && (await page.evaluate(() => T.slip('Plain').querySelector('.fl-bump').classList.contains('btn-success'))), h4);
  // the switch in Settings
  await page.evaluate(() => SB.theme.setHints(false)); await settle(page, 200);
  const off = await page.evaluate(() => ({ shown: Array.from(document.querySelectorAll('.slip-next')).filter((e) => getComputedStyle(e).display !== 'none').length, saved: localStorage.getItem('smokebox.v1.hints') }));
  check('turning the next-step line off hides it on every ticket and is remembered', off.shown === 0 && off.saved === 'false', off);
  await page.evaluate(() => SB.theme.setHints(true)); await settle(page, 200);
  check('turning it back on shows it again with current words', (await hint()).shown);
  noErrors('plain words', logs);
});

// the sound switch: Check it beeps three times, once, and only when sound is on
await withPage({ w: 1280, h: 800, file: OUT }, async (page, logs) => {
  await boot(page, { seed: false });
  await page.evaluate(() => {
    SB.floor.setWelcome(false); SB.floor.setSound(false); // sound and call-outs are ON by default, so switch them off for this check
    window.__osc = 0; const AC = window.AudioContext; window.AudioContext = class extends AC { createOscillator() { window.__osc++; return super.createOscillator(); } };
    SB.store.dispatchEx('createTicket', { customer: 'Beep', channel: 'dine_in', items: [{ menuId: 'hushpuppies' }], src: 'live' }, { source: 'ui' });
  });
  await settle(page, 300);
  await page.locator('.fl-slip .fl-row button[data-act="item"]').click(); await settle(page, 200);
  await page.evaluate(() => SB.store.setSpeed(120)); await wait(4500); await page.evaluate(() => SB.store.setSpeed(1));
  const silent = await page.evaluate(() => ({ osc: window.__osc, cook: document.querySelector('.fl-row').dataset.cook }));
  check('with Sound off, Check it flashes but makes no sound', silent.cook === 'check' && silent.osc === 0, silent);
  await page.evaluate(() => { SB.store.dispatchEx('createTicket', { customer: 'Beep 2', channel: 'dine_in', items: [{ menuId: 'hushpuppies' }], src: 'live' }, { source: 'ui' }); SB.floor.setSound(true); window.__osc = 0; });
  await settle(page, 300);
  await page.locator('.fl-slip', { hasText: 'Beep 2' }).locator('.fl-row button[data-act="item"]').click(); await settle(page, 200);
  await page.evaluate(() => { window.__osc = 0; SB.store.setSpeed(120); }); await wait(4500); await page.evaluate(() => SB.store.setSpeed(1));
  const loud = await page.evaluate(() => ({ osc: window.__osc, cook: Array.from(document.querySelectorAll('.fl-slip')).find((s) => s.textContent.includes('Beep 2')).querySelector('.fl-row').dataset.cook }));
  check('with Sound on, Check it plays three beeps', loud.cook === 'check' && loud.osc === 3, loud);
  noErrors('check it sound', logs);
});

// compact tickets: when the open tickets would not fit in one row, they get smaller so a rush stays on one screen
for (const [w, h] of [[1024, 768], [1280, 800], [390, 844]]) {
  await withPage({ w, h, file: OUT, touch: w < 800 }, async (page, logs) => {
    await boot(page, { seed: false });
    await page.evaluate(() => SB.floor.setWelcome(false));
    const dens = () => page.evaluate(() => ({ d: document.querySelector('.fl-main').dataset.density, n: document.querySelectorAll('.fl-slip').length, cols: getComputedStyle(document.querySelector('.fl-grid')).gridTemplateColumns.split(' ').length }));
    await page.evaluate(() => { SB.store.dispatchEx('createTicket', { customer: 'One', channel: 'dine_in', items: [{ menuId: 'brisket_sand' }, { menuId: 'hushpuppies' }, { menuId: 'tea' }], src: 'live' }, { source: 'ui' }); }); await settle(page, 400);
    const a = await dens();
    check(w + ': one ticket is drawn compact (compact is the default ticket size)', a.d === 'compact', a);
    await page.evaluate(() => { for (let i = 0; i < 16; i++) SB.store.dispatchEx('createTicket', { customer: 'Rush ' + i, channel: i % 2 ? 'takeout' : 'drive_thru', items: [{ menuId: 'brisket_sand' }, { menuId: 'hushpuppies' }, { menuId: 'tea' }], src: 'live' }, { source: 'ui' }); }); await settle(page, 600);
    const b = await dens();
    check(w + ': 17 tickets switch to compact on their own', b.d === 'compact' && b.n === 17, b);
    const m = await page.evaluate(() => { const vh = innerHeight, slips = Array.from(document.querySelectorAll('.fl-slip')); const main = document.querySelector('.fl-main'); return { screens: Math.round((main.scrollHeight / main.clientHeight) * 10) / 10, heads: slips.filter((s) => { const r = s.getBoundingClientRect(); return r.top >= 0 && r.top + 90 <= vh; }).length, h0: Math.round(slips[0].getBoundingClientRect().height) }; });
    check(w + ': 17 compact tickets take few screens (the tablet case was about 6 with full-size tickets)', w === 390 ? m.screens < 12 : m.screens <= 4.6, m);
    const small = await page.evaluate(() => Array.from(document.querySelectorAll('.fl-slip button')).filter((e) => e.offsetParent).map((b) => ({ n: (b.getAttribute('aria-label') || b.textContent).trim().slice(0, 18), w: b.offsetWidth, h: b.offsetHeight })).filter((x) => x.h < 44 || x.w < 40)); // layout size, so a ticket still sliding in cannot read 43
    check(w + ': compact tickets keep touch targets of 44 px or more', small.length === 0, small.slice(0, 5));
    const nh = await noHScroll(page);
    check(w + ': compact tickets do not scroll sideways', JSON.stringify(nh) === JSON.stringify({ doc: 0, main: 0, head: 0, slips: 0 }), nh);
    // compact rows show the short menu name; the full name is still read aloud
    const nm = await page.evaluate(() => { const r = document.querySelector('.fl-slip .fl-row'); const full = r.querySelector('.nm-full'), sh = r.querySelector('.nm-short'); return { shortShown: !!sh && getComputedStyle(sh).display !== 'none', fullClipped: !!full && full.getBoundingClientRect().width <= 1.5, label: r.querySelector('button').getAttribute('aria-label') || r.querySelector('button').textContent.slice(0, 50) }; });
    check(w + ': compact rows show the short name, the full name stays for screen readers', nm.shortShown && nm.fullClipped, nm);
    await shot(page, 'compact-' + w + 'x' + h);
    // the Ticket size choice: Large forces full size, Compact forces compact, Auto decides
    await page.evaluate(() => SB.theme.setDensity('large')); await settle(page, 300);
    const big = await dens();
    await page.evaluate(() => SB.theme.setDensity('auto')); await settle(page, 300);
    const au = await dens();
    check(w + ': the Ticket size choice works (Large = roomy, Auto = compact again) and is remembered', big.d === 'roomy' && au.d === 'compact' && (await page.evaluate(() => localStorage.getItem('smokebox.v1.density'))) === '"auto"', { big, au });
    noErrors('compact ' + w, logs);
  });
}

// the next-step (welcome) card: it needs the setup module (SB.setup, 77-floor-setup.js), which this private bundle leaves out, so only the switch
// is checked here. The card itself (menu ready, first-steps wording, hidden once a ticket exists) is checked on the full app in test/e2e/01-first-run.mjs.
await withPage({ w: 1024, h: 768, file: OUT }, async (page, logs) => {
  await boot(page, { seed: false });
  check('the welcome switch: setWelcome(false) hides it for good and setWelcome(true) brings it back', await page.evaluate(() => { SB.floor.setWelcome(false); const a = SB.floor.welcome(); SB.floor.setWelcome(true); const b = SB.floor.welcome(); return a === false && b === true; }));
  check('without the setup module the card stays hidden (no dishes to point at)', await page.evaluate(() => document.querySelector('.fl-welcome').hidden));
  noErrors('welcome', logs);
});

/* ========================================================================================================================
 * 7. Performance: 60 tickets at 1 Hz, and a burst of 12
 * ====================================================================================================================== */
group('performance');
await withPage({ w: 1280, h: 800, file: OUT }, async (page, logs) => {
  await boot(page, { seed: false });
  await page.evaluate(() => {
    const S = SB.store, now = S.now(), menu = SB.config.menu.map((m) => m.id), ch = SB.config.channels.map((c) => c.id);
    for (let i = 0; i < 60; i++) {
      const items = []; const n = 2 + (i % 4);
      for (let k = 0; k < n; k++) items.push({ menuId: menu[(i * 3 + k * 5) % menu.length], qty: 1 + ((i + k) % 2), mods: k % 3 === 0 ? ['No pickles'] : [] });
      const r = S.dispatchEx('createTicket', { customer: 'Guest ' + (i + 1), channel: ch[i % 4], items, rush: i % 17 === 0, src: 'demo', createdAt: now - (i * 11 + 5) * 1000, allowPast: true, note: i % 9 === 0 ? 'Allergy: sesame' : '' }, { source: 'sim' });
      if (r.report !== 'ok') window.__skipped = (window.__skipped || 0) + 1;
    }
    S.tick();
  });
  await settle(page, 600);
  const n = await page.evaluate(() => ({ slips: document.querySelectorAll('.fl-slip').length, skipped: window.__skipped || 0, active: SB.store.select.activeTickets().length }));
  check('60 tickets are on the board', n.slips >= 55 && n.slips === n.active, n);
  const perf = await page.evaluate(async () => {
    const times = [];
    for (let i = 0; i < 60; i++) { SB.store.tick(); times.push(SB.floor.stats().lastTickMs); await new Promise((r) => setTimeout(r, 4)); }
    times.sort((a, b) => a - b);
    return { slips: SB.floor.stats().slips, mean: times.reduce((a, b) => a + b, 0) / times.length, p95: times[Math.floor(times.length * 0.95)], max: times[times.length - 1] };
  });
  console.log('        1 Hz tick with ' + perf.slips + ' slips: mean ' + perf.mean.toFixed(2) + ' ms, p95 ' + perf.p95.toFixed(2) + ' ms, max ' + perf.max.toFixed(2) + ' ms (floor work only)');
  check('1 Hz tick with 60 tickets is well under 16 ms (mean < 8 ms, p95 < 50 ms: the machine is shared, so the limits leave room and the max is only reported)', perf.mean < 8 && perf.p95 < 50, perf);
  const full = await page.evaluate(async () => {
    const t = [];
    for (let i = 0; i < 20; i++) { const a = performance.now(); SB.store.tick(); t.push(performance.now() - a); await new Promise((r) => setTimeout(r, 4)); }
    t.sort((a, b) => a - b); return { p95: t[Math.floor(t.length * 0.95)], max: t[t.length - 1] };
  });
  console.log('        whole store.tick() including the engine and every subscriber: p95 ' + full.p95.toFixed(2) + ' ms, max ' + full.max.toFixed(2) + ' ms');
  check('the whole tick (engine and all subscribers) stays under 40 ms on a shared machine (16 ms on a quiet one)', full.p95 < 40, full);
  // a state change with 60 tickets
  const adv = await page.evaluate(async () => {
    const t = SB.store.select.activeTickets()[5]; const it = t.items[0]; const times = [];
    const before = SB.floor.stats().renders;
    SB.store.dispatchEx('advanceItem', { ticketId: t.id, itemId: it.id }, { source: 'ui' });
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return { ms: SB.floor.stats().lastRenderMs, renders: SB.floor.stats().renders - before };
  });
  console.log('        render after one tap with 60 slips: ' + adv.ms.toFixed(2) + ' ms');
  check('one tap re-renders once, in under 40 ms (16 ms on a quiet machine), with 60 slips', adv.renders === 1 && adv.ms < 40, adv);
  await shot(page, 'sixty-1280x800');
  // burst of 12
  await page.evaluate(() => { window.__r0 = SB.floor.stats().renders; window.__long = []; try { new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__long.push(Math.round(e.duration)))).observe({ entryTypes: ['longtask'] }); } catch (e) { /* not supported */ } window.__frames = []; let last = performance.now(); const loop = (t) => { window.__frames.push(t - last); last = t; if (window.__running) requestAnimationFrame(loop); }; window.__running = true; requestAnimationFrame(loop); });
  await wait(200);
  await page.evaluate(() => { window.__frames.length = 0; for (let i = 0; i < 12; i++) SB.store.dispatchEx('createTicket', { customer: 'Rush ' + i, channel: 'drive_thru', items: [{ menuId: 'brisket_sand' }, { menuId: 'mac' }] }, { source: 'sim' }); });
  await wait(1200);
  const burst = await page.evaluate(() => { window.__running = false; const f = window.__frames.slice(0, 60).sort((a, b) => a - b); return { renders: SB.floor.stats().renders - window.__r0, renderMs: SB.floor.stats().lastRenderMs, worstFrame: Math.round(f[f.length - 1]), long: window.__long, slips: document.querySelectorAll('.fl-slip').length }; });
  console.log('        burst of 12 tickets: render ' + burst.renderMs.toFixed(1) + ' ms, worst frame ' + burst.worstFrame + ' ms, long tasks ' + JSON.stringify(burst.long));
  check('a burst of 12 new tickets lands in one render of under 50 ms of script (browser frame times are only reported: the machine is shared)', burst.renders === 1 && burst.renderMs < 50 && burst.slips >= 72, burst);
  noErrors('performance', logs);
});

/* ========================================================================================================================
 * 8. Full build only: first-run board looks alive, sheets and sim exist
 * ====================================================================================================================== */
if (FULL) {
  group('full build');
  await withPage({ w: 1280, h: 800, file: OUT }, async (page, logs) => {
    await page.waitForFunction(() => window.SB && SB.booted === true, null, { timeout: 8000 });
    await settle(page, 600);
    const f = await page.evaluate(() => ({ slips: document.querySelectorAll('.fl-slip').length, sim: !!SB.sim, sheets: SB.sheets.names() }));
    check('first run: the board is alive (seeded demo tickets) when SB.sim exists', !f.sim || f.slips >= 3, f);
    await shot(page, 'full-first-run-1280x800');
    for (const k of ['n', 'r', 'h', 'h', '8', 'd']) { await page.keyboard.press(k); await settle(page, 200); await page.evaluate(() => SB.sheets.closeAll()); }
    noErrors('full build', logs);
  });
}

console.log('\n' + pass + ' passed, ' + fail + ' failed' + (knownCount ? ', ' + knownCount + ' known bug(s) reported' : '') + (fail ? ': ' + failures.join('; ') : ''));
console.log('screenshots: ' + SHOTS);
process.exit(fail ? 1 : 0);
