// Four notices at once on the board strip (browser, about 40 s). Run: node test/board-notices.e2e.mjs
// A tablet with sound not yet allowed, no screen wake lock, a board that was in the background, and warnings due gets: the warning rows
// (they always show), ONE notice line at a time (the "tap for sound" bar first) that says "(1 more notice)", and an X that clears all
// the notices. The strip never grows into a wall. Checked at 1024 and 1920 in Day and Night with Large text. Needs dist/smokebox.html.
import { toolRequire } from '../tools/_deps.mjs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { chromium } = toolRequire('playwright');
const DIST = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), 'dist/smokebox.html');
let fail = 0;
// Records one check and prints it.
function check(name, ok, detail) { if (!ok) fail++; console.log((ok ? '  ok    ' : '  FAIL  ') + name + (ok ? '' : ' -> ' + JSON.stringify(detail))); }
const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const errs = [];
for (const [w, h, theme, large] of [[1024, 768, 'day', false], [1024, 768, 'night', true], [1920, 1080, 'night', true]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(String(e)));
  await p.addInitScript("Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: undefined });");
  await p.goto(pathToFileURL(DIST).href + '?demo');
  await p.waitForFunction(() => window.SB && SB.booted === true);
  await p.evaluate(([t, l]) => { SB.theme.set(t); SB.theme.setTextSize(l ? 'large' : 'normal'); SB.floor.setWelcome(false); SB.sim.live.crew(false); SB.store.resetLive({ keepSettings: true, starter: true, stagger: true, catalog: 'sample', replaceOwn: true }); SB.sim.live.burst(6); }, [theme, large]);
  // The board goes to the background for three minutes and comes back
  await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
  await p.evaluate(() => { const real = Date.now; Date.now = () => real() + 3 * 60e3; Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
  await p.waitForTimeout(2500);
  const tag = w + ' ' + theme + (large ? ' large' : '');
  const lines = await p.evaluate(() => {
    const vis = (e) => e && e.offsetParent !== null;
    const st = document.querySelector('.fl-strip');
    return { bars: [...document.querySelectorAll('.fl-strip-bar')].filter(vis).map((e) => e.innerText.replace(/\s+/g, ' ').trim()), rows: [...document.querySelectorAll('.fl-strip-rowwrap')].filter(vis).length, stripH: st ? Math.round(st.getBoundingClientRect().height) : 0, vh: innerHeight, firstSlipTop: Math.round(document.querySelector('.fl-slip').getBoundingClientRect().top) };
  });
  check(tag + ': one notice line at a time', lines.bars.length === 1, lines.bars);
  check(tag + ': the line says how many more wait', /\(1 more notice\)/.test(lines.bars[0] || ''), lines.bars);
  check(tag + ': the strip is not a wall (under 30 percent of the screen height)', lines.stripH < lines.vh * 0.3, lines);
  await p.screenshot({ path: process.env.SHOT_DIR ? process.env.SHOT_DIR + '/notices-' + w + '-' + theme + '.png' : '/tmp/notices-' + w + '-' + theme + '.png' });
  // The X clears all the notices
  await p.click('.fl-bar-sound .fl-strip-x');
  await p.waitForTimeout(800);
  const after = await p.evaluate(() => [...document.querySelectorAll('.fl-strip-bar')].filter((e) => e.offsetParent !== null).length);
  check(tag + ': the X clears all notices (no notice line is left)', after === 0, after);
  check(tag + ': warning rows are still there', lines.rows >= 1, lines.rows);
  await ctx.close();
}
check('no page errors', errs.length === 0, errs);
await browser.close();
console.log(fail ? fail + ' check(s) failed' : 'all checks passed');
process.exit(fail ? 1 : 0);
