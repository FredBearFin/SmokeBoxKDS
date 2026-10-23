// Cold items on the board strip and voice (browser, about 60 s). Run: node test/board-round15.e2e.mjs
// Covers: the strip row for a cold item that is running low on out-of-fridge hours, its plain words ("your limit", never
// "overdue"), the spoken version (speech is captured, not played), and the Cabinet tab not calling a cold item late.
// The clock is sped up inside the demo. Needs dist/smokebox.html built with the cold-item engine.
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
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const p = await ctx.newPage();
p.on('pageerror', (e) => errs.push(String(e)));
await p.addInitScript(() => {
  window.__said = [];
  window.SpeechSynthesisUtterance = function (t) { this.text = t; };
  Object.defineProperty(window, 'speechSynthesis', { value: { speak: (u) => window.__said.push(u.text), cancel() {}, getVoices: () => [], speaking: false }, configurable: true });
});
await p.goto(pathToFileURL(DIST).href + '?demo');
await p.waitForFunction(() => window.SB && SB.booted === true, null, { timeout: 8000 });
if (!(await p.evaluate(() => typeof SB.engine.coldInfo === 'function' && typeof SB.deadlines.coldLine === 'function'))) {
  console.log('  skip  the engine has no cold-item model');
  await browser.close(); process.exit(0);
}
await p.evaluate(() => {
  SB.floor.setWelcome(false);
  SB.store.dispatchEx('clearDemoTickets', {}, { source: 'ui' });
  SB.store.getState().batches.forEach((x) => SB.store.dispatchEx('discardBatch', { batchId: x.id, reason: 'manual' }, { source: 'ui' }));
  SB.store.dispatchEx('sanitizeDone', {}, { source: 'ui' });
  SB.store.dispatchEx('addIngredient', { name: 'Chicken salad', tcs: true, hold: 'cold', fridge: true, fridgeDays: 3, outHours: 1, parG: 2000 }, { source: 'ui' });
  const i = SB.store.getState().ingredients.find((x) => x.name === 'Chicken salad');
  SB.store.dispatchEx('addBatch', { ing: i.id, tempF: 38, cookedG: 2000, label: 'Chicken salad batch 1' }, { source: 'ui' });
  SB.floor.setSound(true); if (SB.floor.setCallouts) SB.floor.setCallouts(true);
});
await p.waitForTimeout(1500);
const before = await p.evaluate(() => SB.deadlines.build(SB.store.getState(), SB.store.now()).filter((r) => /^cold/.test(r.kind)).length);
check('a cold item in the fridge makes no strip row yet', before === 0, before);
await p.evaluate(() => { const b = SB.store.getState().batches.find((x) => x.label === 'Chicken salad batch 1'); SB.store.dispatchEx('coldTakeOut', { batchId: b.id }, { source: 'ui' }); SB.store.setSpeed(60); });
await p.waitForTimeout(34000);
const r = await p.evaluate(() => {
  SB.store.setSpeed(1);
  const rows = SB.deadlines.build(SB.store.getState(), SB.store.now()).filter((x) => /^cold/.test(x.kind));
  const strip = document.querySelector('.fl-strip');
  return { rows: rows.map((x) => x.kind + ': ' + x.consequence), strip: strip ? strip.innerText : '', said: window.__said.slice(), tabs: [...document.querySelectorAll('.fl-seg .seg-dot:not([hidden])')].map((e) => e.textContent).join(' | ') };
});
check('the feed has a coldOut row in plain words with "your"', r.rows.length === 1 && /^coldOut: .*your .*limit/.test(r.rows[0]), r.rows);
check('the strip shows the cold row', /Chicken salad batch 1/.test(r.strip) && /your 1-hour limit/.test(r.strip), r.strip);
check('the strip never says overdue or late for it', !/overdue|late|past due/i.test(r.strip), r.strip);
check('the voice says it in plain words, once', r.said.filter((t) => /out-of-fridge limit/.test(t)).length === 1, r.said);
check('the tabs carry no overdue wording for a cold item', !/overdue/i.test(r.tabs), r.tabs);
await p.screenshot({ path: process.env.SHOT_DIR ? process.env.SHOT_DIR + '/cold-strip.png' : '/tmp/cold-strip.png' });
check('no page errors', errs.length === 0, errs);
await browser.close();
console.log(fail ? fail + ' check(s) failed' : 'all checks passed');
process.exit(fail ? 1 : 0);
