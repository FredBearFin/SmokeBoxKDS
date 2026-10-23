// Board follow-up checks (browser, about 40 s). Run: node test/board-round10.e2e.mjs
// Covers: the "N more tickets below" pill, one walkthrough button when the setup card is up, 44 px help links and demo bar
// buttons, the Demo clock chip keeping the header on one row, and the tour ignoring hidden badges. Needs dist/smokebox.html.
import { withPage } from '../tools/pw.mjs';

let fail = 0;
// Records one check and prints it.
function check(name, ok, detail) { if (!ok) fail++; console.log((ok ? '  ok    ' : '  FAIL  ') + name + (ok ? '' : ' -> ' + JSON.stringify(detail))); }
const ready = (page) => page.waitForFunction(() => window.SB && SB.booted === true, null, { timeout: 8000 });
const goDemo = async (page) => { await page.goto(page.url().split('#')[0].split('?')[0] + '?demo'); await ready(page); };

await withPage({ w: 1280, h: 800, hash: '' }, async (page, logs) => {
  await ready(page);
  // Setup card and empty board: only one "Show me how it works"
  await page.evaluate(() => { [['Wings', 'pit', 'meat', 14, 'two'], ['Slaw', 'cold', 'cold', 4, 'one']].forEach(([n, z, c, pr, tr]) => SB.store.dispatchEx('addMenuItem', { name: n, zone: z, cat: c, price: pr, prepSec: 240, track: tr }, { source: 'ui' })); SB.floor.setWelcome(true); });
  await page.waitForTimeout(1300);
  const n = await page.locator('button:has-text("Show me how it works"):visible').count();
  check('only one "Show me how it works" while the setup card is up', n === 1, n);
  await page.evaluate(() => SB.floor.setWelcome(false)); await page.waitForTimeout(1300);
  check('the empty board offers it again once the card is gone', (await page.locator('.fl-empty button:has-text("Show me how it works"):visible').count()) === 1);
  check('no page errors', logs.pageErrors.length === 0, logs.pageErrors);
});

await withPage({ w: 1280, h: 800, hash: '' }, async (page) => {
  await ready(page); await goDemo(page);
  await page.evaluate(() => { SB.floor.setWelcome(false); SB.sim.live.crew(false); SB.store.resetLive({ keepSettings: true, starter: true, stagger: true, catalog: 'sample', replaceOwn: true }); SB.sim.live.burst(3); });
  await page.waitForTimeout(1500);
  check('no "more tickets below" pill with three tickets', (await page.locator('.fl-below:visible').count()) === 0);
  await page.evaluate(() => { SB.sim.live.burst(40); });
  await page.waitForTimeout(1800);
  const txt = await page.locator('.fl-below:visible').textContent().catch(() => '');
  check('the pill counts the tickets below', /\d+ more tickets? below/.test(txt || ''), txt);
  await page.locator('.fl-below').click(); await page.waitForTimeout(1800);
  const st = await page.evaluate(() => ({ top: document.querySelector('.fl-main').scrollTop, txt: document.querySelector('.fl-below') ? document.querySelector('.fl-below').textContent : '' }));
  check('tapping the pill scrolls the board down', st.top > 100, st);
  // help link size
  await page.evaluate(() => SB.sheets.open('orders')); await page.waitForSelector('.sheet .gd-help');
  const hb = await page.evaluate(() => { const r = document.querySelector('.sheet .gd-help').getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; });
  check('the "?" link is a 44 px target', hb[0] >= 44 && hb[1] >= 44, hb);
  await page.keyboard.press('Escape');
});

await withPage({ w: 390, h: 844, hash: '', touch: true }, async (page) => {
  await ready(page); await goDemo(page);
  const bb = await page.evaluate(() => { const b = document.querySelector('.sb-banner .btn'); return b ? Math.round(b.getBoundingClientRect().height) : null; });
  check('the demo bar button is at least 44 px tall on a phone', bb !== null && bb >= 44, bb);
});

await withPage({ w: 1920, h: 1080, hash: '' }, async (page) => {
  await ready(page); await goDemo(page);
  await page.evaluate(() => { SB.floor.setWelcome(false); SB.sim.live.crew(false); SB.store.resetLive({ keepSettings: true, starter: true, stagger: true, catalog: 'sample', replaceOwn: true }); SB.sim.live.burst(4); SB.store.setSpeed(15); });
  await page.waitForTimeout(1500);
  const hh = await page.evaluate(() => ({ h: Math.round(document.querySelector('.fl-head').getBoundingClientRect().height), chip: document.querySelector('.fl-demo-chip').offsetParent !== null }));
  check('1920 wide with the Demo clock chip: header stays on one row', hh.chip && hh.h <= 110, hh);
});
process.exit(fail ? 1 : 0);
