// Browser check of the practice run (about 40 s): a brand-new empty kitchen taps "Practice run", lands in the quiet demo
// kitchen with one practice ticket, does every step for real (Start, a deliberate early Done, Undo, the waiting dish,
// Done, Bump), then "Now add my menu" goes back to the real kitchen with Dishes and prices open and nothing left behind.
// Each step must have a picture and at most 12 words. Screenshots go to SHOTS (default test/.out/practice).
import fs from 'node:fs';
import path from 'node:path';
import { withPage, ROOT } from '../tools/pw.mjs';

const OUT = process.env.SHOTS || path.join(ROOT, 'test/.out/practice');
fs.mkdirSync(OUT, { recursive: true });
let fail = 0;
// Records one check and prints it.
function check(name, ok, detail) { if (!ok) fail++; console.log((ok ? '  ok    ' : '  FAIL  ') + name + (ok ? '' : ' -> ' + JSON.stringify(detail))); }
const ready = (page) => page.waitForFunction(() => window.SB && SB.booted === true, null, { timeout: 10000 });
// The caption card as it is now: step label, words, picture name, and the visible buttons.
const card = (page) => page.evaluate(() => {
  const c = document.querySelector('.tour-card');
  if (!c || c.hidden) return null;
  return { step: c.querySelector('.tour-step').textContent, text: c.querySelector('.tour-text').textContent, pic: c.querySelector('.tour-pic').dataset.icon || '',
    buttons: [...c.querySelectorAll('.tour-actions button')].filter((b) => !b.hidden).map((b) => b.textContent), hand: !document.querySelector('.tour-hand').hidden };
});
// Waits until the card shows a step whose label matches, then returns the card.
async function waitStep(page, re, ms = 8000) {
  const end = Date.now() + ms;
  let c = null;
  while (Date.now() < end) { c = await card(page); if (c && re.test(c.step)) return c; await page.waitForTimeout(150); }
  return c;
}
// Taps the main control on the dish row the ring is on (Start or Done).
const tapRing = (page) => page.evaluate(() => { const r = document.querySelector('.fl-row.tour-ring .fl-act') || document.querySelector('.fl-row.tour-ring button'); if (r) r.click(); return !!r; });

await withPage({ w: 1280, h: 800 }, async (page, logs) => {
  await ready(page);
  await page.evaluate(() => SB.floor.setWelcome(false)); await page.waitForTimeout(400);
  check('an empty kitchen shows Practice run as the big first button', (await page.locator('.fl-empty .btn-primary').first().textContent()).includes('Practice run'));
  await Promise.all([page.waitForEvent('load'), page.click('.fl-empty [data-act="practice"]')]); await ready(page);
  let c = await waitStep(page, /Step 1/, 10000);
  check('it opens the demo kitchen with one practice ticket and step 1', c && (await page.evaluate(() => SB.store.isDemo() && SB.store.getState().tickets.filter((t) => t.status === 'active').length === 1)), c);
  await page.screenshot({ path: path.join(OUT, '1-ticket.png') });
  const seen = [];
  // Records the card of a step for the words and picture checks.
  const note = (x) => { if (x) seen.push(x); };
  note(c);
  await page.click('.tour-next'); c = await waitStep(page, /Step 2/); note(c);
  await page.click('.tour-next'); c = await waitStep(page, /Step 3/); note(c);
  check('step 3 asks to tap Start, with the tapping finger on it', c && /Tap Start/.test(c.text) && c.hand, c);
  await page.screenshot({ path: path.join(OUT, '3-start.png') });
  await tapRing(page); c = await waitStep(page, /Step 4/); note(c);
  check('step 4 asks for a deliberate early Done', c && /mistake/.test(c.text), c);
  await page.waitForTimeout(700); // a person reads the step first; a second tap within 450 ms counts as a double tap
  await tapRing(page); c = await waitStep(page, /Step 5/); note(c);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, '5-undo.png') });
  const undo = await page.evaluate(() => { const u = document.querySelector('.fl-undo'); if (u) u.click(); return !!u; });
  check('step 5 shows Undo on the dish, and tapping it takes the Done back', undo, c);
  c = await waitStep(page, /Step 6/); note(c);
  check('after Undo the dish is cooking again', await page.evaluate(() => SB.store.getState().tickets.find((t) => t.status === 'active').items.some((i) => i.status === 'cooking')), c);
  await page.screenshot({ path: path.join(OUT, '6-wait.png') });
  if (c && c.buttons.includes('Next')) await page.click('.tour-next');
  // Finishes every dish: starts what is ready and taps Done, until the Bump step.
  for (let i = 0; i < 40; i++) {
    c = await card(page); if (c && /Step 8|Done/.test(c.step)) break;
    if (c && /Step 7/.test(c.step)) note(c);
    await page.evaluate(() => { for (const b of document.querySelectorAll('.fl-slip .fl-row .fl-act')) b.click(); });
    await page.waitForTimeout(700);
  }
  c = await waitStep(page, /Step 8/); note(c);
  check('step 8 asks to Bump', c && /Bump/.test(c.text), c);
  await page.evaluate(() => { const b = document.querySelector('.fl-bump'); if (b) b.click(); });
  c = await waitStep(page, /Done/); note(c);
  check('the end card offers Now add my menu and Practice again', c && c.buttons.includes('Now add my menu') && c.buttons.includes('Practice again'), c);
  await page.screenshot({ path: path.join(OUT, '9-ready.png') });
  const long = seen.filter((x) => x.text.split(/\s+/).length > 12).map((x) => x.text);
  check('every step says it in at most 12 words', long.length === 0, long);
  check('every step has a picture', seen.every((x) => x.pic), seen.map((x) => x.pic));
  await Promise.all([page.waitForEvent('load'), page.click('.tour-done')]); await ready(page); await page.waitForTimeout(1200);
  const back = await page.evaluate(() => ({ url: location.search, demo: SB.store.isDemo(), sheet: !!document.querySelector('.sheet-root'), tickets: SB.store.getState().tickets.length, menu: SB.store.getState().menu.length }));
  check('Now add my menu goes back to the real kitchen with Dishes and prices open', !back.demo && back.sheet, back);
  check('the real kitchen has no tickets and no dishes from the practice', back.tickets === 0 && back.menu === 0, back);
  check('no page errors', logs.pageErrors.length === 0, logs.pageErrors.slice(0, 2));
});

// A kitchen with its own dishes practices on its own menu, right on its own board, and the practice ticket is removed after.
await withPage({ w: 962, h: 601 }, async (page, logs) => {
  await ready(page);
  await page.evaluate(() => { SB.floor.setWelcome(false);
    SB.store.dispatchEx('addMenuItem', { name: 'Smash burger', zone: 'pit', cat: 'meat', price: 9, prepSec: 360, track: 'two' }, { source: 'ui' });
    SB.store.dispatchEx('addMenuItem', { name: 'Onion rings', zone: 'fry', cat: 'fried', price: 4, prepSec: 180, track: 'two' }, { source: 'ui' });
    SB.store.dispatchEx('addMenuItem', { name: 'Lemonade', zone: 'cold', cat: 'cold', price: 3, prepSec: 30, track: 'one' }, { source: 'ui' }); });
  await page.waitForTimeout(400);
  await page.evaluate(() => SB.floor.startTour());
  const c = await waitStep(page, /Step 1/);
  check('with its own dishes it practices right here, not in the demo', c && !(await page.evaluate(() => SB.store.isDemo())), c);
  await page.click('.tour-skip'); await page.waitForTimeout(500);
  check('skipping removes the practice ticket from the real kitchen', await page.evaluate(() => SB.store.getState().tickets.every((t) => t.status !== 'active')));
  check('no page errors', logs.pageErrors.length === 0, logs.pageErrors.slice(0, 2));
});
console.log(fail ? fail + ' FAILED' : 'all passed');
process.exit(fail ? 1 : 0);
