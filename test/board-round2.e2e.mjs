// Board and ordering round 2 checks (browser, about 40 s). Run: node test/board-round2.e2e.mjs
// Covers: tab names on one line at 390 px, heading order in the Cabinet view, 44 px touch size of the loudness slider and
// the Channel sync row, SB.floor._alerts existing at start, a short notice area, toasts that clear and sit clear of
// tickets, the overdue ranking tags, the sold-out explanation, the customer name above the quick names, and the
// empty-menu first step. Needs dist/smokebox.html.
import { withPage } from '../tools/pw.mjs';

let fail = 0;
// Records one check and prints it.
function check(name, ok, detail) { if (!ok) fail++; console.log((ok ? '  ok    ' : '  FAIL  ') + name + (ok ? '' : ' -> ' + JSON.stringify(detail))); }
const ready = (page) => page.waitForFunction(() => window.SB && SB.booted === true, null, { timeout: 8000 });
const goDemo = async (page) => { await page.goto(page.url().split('#')[0].split('?')[0] + '?demo'); await ready(page); };
const prep = (page, demo = true) => page.evaluate((d) => { SB.floor.setWelcome(false); SB.store.resetLive({ keepSettings: true, starter: !!d, stagger: !!d, catalog: 'sample', replaceOwn: true }); if (d) SB.sim.seedFirstRun({ force: true }); SB.sim.live.crew(false); }, demo).then(() => page.addStyleTag({ content: '.sb-banner { display: none !important; }' }));

await withPage({ w: 390, h: 844 }, async (page) => {
  await ready(page);
  check('SB.floor._alerts exists from the start', await page.evaluate(() => Array.isArray(SB.floor._alerts)));
  const tabs = await page.evaluate(() => [...document.querySelectorAll('.fl-seg .seg-opt')].filter((e) => e.offsetParent !== null).map((e) => ({ t: e.textContent.trim().slice(0, 12), h: Math.round(e.getBoundingClientRect().height), ws: getComputedStyle(e).whiteSpace })));
  check('station tab names never wrap (nowrap)', tabs.length > 0 && tabs.every((t) => t.ws === 'nowrap'), tabs);
  check('all tabs the same height, so no label broke into two lines', new Set(tabs.map((t) => t.h)).size === 1, tabs);
});

await withPage({ w: 1280, h: 800 }, async (page, logs) => {
  await ready(page); await goDemo(page); await prep(page);
  // Cabinet heading order
  await page.evaluate(() => SB.sim.live.burst(4));
  await page.click('.fl-seg button:has-text("Cabinet")'); await page.waitForTimeout(500);
  const heads = await page.evaluate(() => [...document.querySelectorAll('.fl-main h1, .fl-main h2, .fl-main h3')].filter((e) => e.offsetParent !== null || e.classList.contains('visually-hidden')).map((e) => +e.tagName[1]));
  let skip = false; for (let i = 1; i < heads.length; i++) if (heads[i] - heads[i - 1] > 1) skip = true;
  check('Cabinet view has no heading level skipped', heads.length > 1 && !skip, heads);
  await page.click('.fl-seg button:has-text("All")'); await page.waitForTimeout(300);

  // Touch size in the Menu sheet and the 86 board
  await page.evaluate(() => SB.sheets.open('menu')); await page.waitForSelector('.sheet input.mn-volume');
  const vol = await page.evaluate(() => Math.round(document.querySelector('input.mn-volume').getBoundingClientRect().height));
  check('Warning loudness slider is at least 44 px tall', vol >= 44, vol);
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  await page.evaluate(() => SB.sheets.open('board86')); await page.waitForSelector('.bd-sync > summary');
  const sum = await page.evaluate(() => Math.round(document.querySelector('.bd-sync > summary').getBoundingClientRect().height));
  check('86 board Channel sync row is at least 44 px tall', sum >= 44, sum);
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);

  // Short top area with a late board; the first ticket is near the top
  await page.evaluate(() => { SB.sim.live.burst(12); SB.store.setSpeed(300); });
  await page.waitForTimeout(6500); await page.evaluate(() => SB.store.setSpeed(1)); await page.waitForTimeout(1500);
  const top = await page.evaluate(() => Math.round(Math.min(...[...document.querySelectorAll('.fl-slip')].map((e) => e.getBoundingClientRect().top))));
  // The demo strip (about 40 px) is part of the screen in the isolated demo, so 240 here equals 200 in a real kitchen.
  check('first ticket starts at or above y=240 at 1280x800 (late board, demo strip on)', top <= 240, top);
  const rows = await page.evaluate(() => [...document.querySelectorAll('.fl-strip-row')].filter((e) => !e.hidden).length);
  check('one warning row on a short screen', rows <= 1, rows);

  // Ranking tags
  const tiers = await page.evaluate(() => { const t = (n) => document.querySelectorAll('.fl-slip[data-tier="' + n + '"]').length; const b = getComputedStyle(document.querySelector('.fl-slip[data-tier="1"]'), '::before').content; return { t1: t(1), t2: t(2), t3: t(3), tag: b }; });
  check('one ticket tagged Do this first, two tagged Next, the rest calm', tiers.t1 === 1 && tiers.t2 === 2 && tiers.t3 > 0 && /Do this first/.test(tiers.tag), tiers);
  const calm = await page.evaluate(() => { const e = document.querySelector('.fl-slip[data-tier="3"] .slip-head'); const b = document.querySelector('.fl-slip[data-tier="3"] .slip-body'); return e && b ? [getComputedStyle(e).backgroundColor, getComputedStyle(b).backgroundColor] : null; });
  check('late tickets after the first three are not filled pink (head matches the paper)', !!calm && calm[0] === calm[1], calm);

  // Toasts: info clears by itself, error stays, and the host sits under the header
  await page.evaluate(() => { SB.ui.toast('Info note', { tone: 'info' }); SB.ui.toast('Error note', { tone: 'bad' }); });
  await page.waitForTimeout(300);
  const pos = await page.evaluate(() => { const h = document.querySelector('.toast-host').getBoundingClientRect(); const hd = document.querySelector('.fl-head').getBoundingClientRect(); return { hostTop: Math.round(h.top), headBottom: Math.round(hd.bottom) }; });
  check('toasts sit under the header, not over the ticket buttons', pos.hostTop >= pos.headBottom - 2 && pos.hostTop < 200, pos);
  await page.waitForTimeout(5600);
  const left = await page.evaluate(() => [...document.querySelectorAll('.toast')].map((e) => e.textContent));
  check('info toast cleared after about 5 s and the error toast stayed', !left.some((t) => /Info note/.test(t)) && left.some((t) => /Error note/.test(t)), left);
  check('no page errors', logs.pageErrors.length === 0, logs.pageErrors);
});

await withPage({ w: 1280, h: 800 }, async (page) => {
  await ready(page); await prep(page, false);
  // Sold-out explanation and name field order (a first-run kitchen has no food cooked, so dishes are sold out)
  await page.evaluate(() => SB.sheets.open('order')); await page.waitForSelector('.ord-tile'); await page.waitForTimeout(700);
  const tile = await page.evaluate(() => { const t = [...document.querySelectorAll('.ord-tile.is-86')][0]; return t ? t.dataset.id : null; });
  check('an empty kitchen has a sold-out dish to try', !!tile, tile);
  if (tile) {
    await page.click('.ord-tile[data-id="' + tile + '"]', { force: true }); await page.waitForSelector('.toast', { timeout: 3000 }).catch(() => {});
    const msg = await page.evaluate(() => [...document.querySelectorAll('.toast')].map((e) => e.textContent).join(' | '));
    check('tapping a sold-out dish explains it and says how to sell it again', /Out of .+\. Log a batch to sell .+ again\./.test(msg), msg);
  }
  const order = await page.evaluate(() => { const i = document.querySelector('.ord-cust-input'), c = document.querySelector('.ord-chips[aria-label="Quick names"]'); return i && c ? (i.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 : null; });
  check('customer name box comes before the quick names', order === true, order);
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);

  // Empty menu first step
  const archived = await page.evaluate(() => { let n = 0; for (const m of SB.store.getState().menu.slice()) { const r = SB.store.dispatchEx('updateMenuItem', { id: m.id, patch: { archived: true } }, { source: 'ui' }); if (r.report === 'ok') n++; } return n; });
  check('menu emptied for the test', archived > 0, archived);
  await page.evaluate(() => { const s = document.querySelector('.sheet-root'); if (s) SB.sheets.closeAll && SB.sheets.closeAll(); });
  await page.waitForTimeout(300);
  await page.evaluate(() => SB.sheets.open('order')); await page.waitForTimeout(600);
  // With no dishes the New ticket button now leads to the Dishes screen (the setup flow), never to a blank menu.
  const ordScreen = await page.locator('.sheet .ord').count();
  check('with no dishes, New ticket opens the dishes flow instead of an empty menu', ordScreen === 0 && (await page.locator('.sheet').count()) >= 1, ordScreen);
});
process.exit(fail ? 1 : 0);
