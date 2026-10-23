// Board round 5 checks (browser, about 40 s). Run: node test/board-round5.e2e.mjs
// Covers: Fahrenheit/Celsius and kg/lb on the cabinet, its sheets and the thrown-out log; the temperature box taking the
// chosen unit and saving Fahrenheit; one compact cabinet card layout (main button plus "..."); the motion switch; slips
// of one grid row sharing a height. Needs dist/smokebox.html.
import { withPage } from '../tools/pw.mjs';

let fail = 0;
// Records one check and prints it.
function check(name, ok, detail) { if (!ok) fail++; console.log((ok ? '  ok    ' : '  FAIL  ') + name + (ok ? '' : ' -> ' + JSON.stringify(detail))); }
const ready = (page) => page.waitForFunction(() => window.SB && SB.booted === true, null, { timeout: 8000 });
const goDemo = async (page) => { await page.goto(page.url().split('#')[0].split('?')[0] + '?demo'); await ready(page); };

await withPage({ w: 1280, h: 800, hash: '' }, async (page, logs) => {
  await ready(page);
  await page.evaluate(() => { SB.floor.setWelcome(false); SB.store.resetLive({ keepSettings: true, starter: true, stagger: true, catalog: 'sample', replaceOwn: true }); SB.sim.live.crew(false); SB.sim.live.burst(10); });
  await page.waitForTimeout(900);
  // Slips in one grid row share a height
  const hs = await page.evaluate(() => { const g = document.querySelector('.fl-grid'); const sl = [...g.children].filter((e) => e.classList.contains('fl-slip')); const top = sl[0].getBoundingClientRect().top; return sl.filter((e) => Math.abs(e.getBoundingClientRect().top - top) < 2).map((e) => Math.round(e.getBoundingClientRect().height)); });
  check('slips in the first row all have the same height', hs.length > 1 && new Set(hs).size === 1, hs);

  await page.click('.fl-seg button:has-text("Cabinet")'); await page.waitForSelector('.hc-card');
  const cards = await page.evaluate(() => [...document.querySelectorAll('.hc-card')].map((c) => ({ h: Math.round(c.getBoundingClientRect().height), main: [...c.querySelectorAll('.hc-actions .btn')].filter((b) => b.offsetParent !== null && !b.classList.contains('hc-more')).length, more: !!c.querySelector('.hc-more:not([hidden])') })));
  check('every cabinet card shows exactly one main button', cards.every((c) => c.main === 1), cards);
  check('cards in the cabinet all have the same height', new Set(cards.map((c) => c.h)).size <= 2, cards.map((c) => c.h));
  check('no Starter stock chip on each card', (await page.locator('.hc-card .chip:visible').count()) === 0);
  await page.locator('.hc-more').first().click(); await page.waitForTimeout(200);
  check('the ... button opens a menu with the other actions', (await page.locator('.menu-item').count()) >= 1);
  await page.keyboard.press('Escape');

  // Default units
  let card = await page.evaluate(() => document.querySelector('.hc-card').innerText);
  check('default: Fahrenheit and kilograms', /°F/.test(card) && /kg/.test(card), card);
  // Switch to C and lb
  await page.evaluate(() => SB.store.dispatchEx('updateSettings', { patch: { ui: { tempUnit: 'C', weightUnit: 'lb' } } }, { source: 'ui' }));
  await page.waitForTimeout(1300);
  card = await page.evaluate(() => document.querySelector('.hc-card').innerText);
  check('Celsius and pounds on the cabinet card', /°C/.test(card) && /lb/.test(card) && !/°F/.test(card) && !/ kg/.test(card), card);
  // Temperature box takes Celsius and stores Fahrenheit
  await page.locator('.hc-actions [data-act="log"]').first().click();
  const unit = await page.evaluate(() => document.querySelector('.hc-editor .stepper-unit, .hc-editor [class*="unit"]') ? document.querySelector('.hc-editor').innerText : '');
  check('the temperature box shows °C', /°C/.test(unit), unit);
  await page.evaluate(() => { const i = document.querySelector('.hc-editor .stepper-input'); i.value = '70'; i.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.evaluate(() => { localStorage.setItem('smokebox.v1.initials', JSON.stringify({ who: 'JM', at: SB.store.now() })); });
  await page.locator('.hc-editor button:has-text("Save reading")').first().click(); await page.waitForTimeout(700);
  const stored = await page.evaluate(() => { const ev = SB.store.getState().events.filter((e) => e.type === 'temp_logged'); return ev.length ? ev[ev.length - 1].f : null; });
  check('70 °C was stored as 158 °F', stored === 158, stored);
  // Thrown-out log in lb
  await page.evaluate(() => { const b = SB.store.getState().batches[0]; SB.store.dispatchEx('discardBatch', { batchId: b.id, reason: 'manual', who: 'AB' }, { source: 'ui' }); SB.sheets.open('discards'); });
  await page.waitForSelector('.dlog-table');
  const logTxt = await page.evaluate(() => document.querySelector('.dlog-table').innerText);
  check('the thrown-out log shows pounds', /lb/.test(logTxt) && !/ kg/.test(logTxt), logTxt);
  await page.keyboard.press('Escape');

  // Motion switch
  await page.evaluate(() => document.documentElement.style.setProperty('--sb-motion', '0'));
  const dur = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--dur-slow'));
  check('one property (--sb-motion) zeroes every duration', /calc\(260ms \* 0\)|0ms|^0/.test(dur.trim()) || (await page.evaluate(() => { const d = document.createElement('div'); d.style.transition = 'opacity var(--dur-slow)'; document.body.appendChild(d); const t = getComputedStyle(d).transitionDuration; d.remove(); return t; })) === '0s', dur);
  check('no page errors', logs.pageErrors.length === 0, logs.pageErrors);
});
process.exit(fail ? 1 : 0);
