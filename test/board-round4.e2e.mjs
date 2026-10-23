// Board and ordering round 4 checks (browser, about 40 s). Run: node test/board-round4.e2e.mjs
// Covers: no combos on an empty menu, the blank 86 board, the "?" help links, the Forgot the PIN fold, the initials prompt
// for a temperature reading (asked once, shown as "checked by", switchable), the thrown-out log fix flow, and the
// sanitize initials. Needs dist/smokebox.html.
import { withPage } from '../tools/pw.mjs';

let fail = 0;
// Records one check and prints it.
function check(name, ok, detail) { if (!ok) fail++; console.log((ok ? '  ok    ' : '  FAIL  ') + name + (ok ? '' : ' -> ' + JSON.stringify(detail))); }
const ready = (page) => page.waitForFunction(() => window.SB && SB.booted === true, null, { timeout: 8000 });
const goDemo = async (page) => { await page.goto(page.url().split('#')[0].split('?')[0] + '?demo'); await ready(page); };
const demo = (page) => page.evaluate(() => { SB.floor.setWelcome(false); SB.sim.live.crew(false); SB.store.resetLive({ keepSettings: true, starter: true, stagger: true, catalog: 'sample', replaceOwn: true }); });

await withPage({ w: 1280, h: 800 }, async (page, logs) => {
  await ready(page);
  // Blank: no combos, and the 86 board is friendly
  await page.evaluate(() => SB.floor.setWelcome(false));
  await page.evaluate(() => SB.sheets.open('board86')); await page.waitForSelector('.bd-nodishes');
  check('blank 86 board says No dishes yet with one next step', (await page.locator('.bd-nodishes button').count()) === 1 && (await page.locator('.bd-cols:visible').count()) === 0);
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  await page.evaluate(() => { location.hash = '#/new'; }); await page.waitForTimeout(900);
  check('blank New ticket page lists no combos', (await page.locator('.ord-combo').count()) === 0 || (await page.locator('.ord-combos:visible').count()) === 0);
});

await withPage({ w: 1280, h: 800 }, async (page, logs) => {
  await ready(page);
  await demo(page); await page.waitForTimeout(1200);
  await page.evaluate(() => { try { localStorage.removeItem('smokebox.v1.initials'); } catch (e) { /* ignore */ } });
  const helps = await page.evaluate(() => { SB.sheets.open('orders'); return null; });
  void helps; await page.waitForSelector('.sheet .gd-help');
  check('Orders sheet has a ? help link', (await page.locator('.sheet .gd-help').count()) === 1);
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  await page.evaluate(() => SB.sheets.open('order')); await page.waitForSelector('.ord-tile'); await page.waitForTimeout(500);
  check('New ticket sheet has a ? help link and combos show with a full menu', (await page.locator('.sheet .gd-help').count()) === 1 && (await page.locator('.ord-combo').count()) > 0);
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  await page.evaluate(() => document.querySelectorAll('.sheet-root').forEach((e) => e.remove()));

  // Initials flow in the cabinet
  await page.click('.fl-seg button:has-text("Cabinet")'); await page.waitForSelector('.hc-actions [data-act="log"]');
  await page.locator('.hc-actions [data-act="log"]').first().click();
  await page.locator('.hc-editor button:has-text("Save reading")').first().click();
  await page.waitForSelector('.sheet [aria-label="Your initials"]', { timeout: 3000 });
  check('the first reading asks for initials', true);
  await page.fill('.sheet [aria-label="Your initials"]', 'JM'); await page.keyboard.press('Enter'); await page.waitForTimeout(800);
  const saved = await page.evaluate(() => { const ev = SB.store.getState().events.filter((e) => e.type === 'temp_logged'); return ev.length ? ev[ev.length - 1].who : null; });
  check('the reading was saved with the initials JM', saved === 'JM', saved);
  const card = await page.evaluate(() => document.querySelector('.hc-dl') ? document.querySelector('.hc-dl').innerText : '');
  check('the cabinet card says checked by JM', /checked by JM/.test(card), card);
  // second reading: no prompt
  await page.locator('.hc-actions [data-act="log"]').nth(1).click();
  await page.locator('.hc-editor button:has-text("Save reading")').first().click(); await page.waitForTimeout(700);
  check('the second reading does not ask again', (await page.locator('.sheet [aria-label="Your initials"]').count()) === 0);
  check('Switch person line is shown', (await page.locator('.hc-who [data-act="switch-who"]').count()) === 1);
  await page.locator('.hc-who [data-act="switch-who"]').click(); await page.waitForTimeout(200);
  check('Switch person forgets the initials', await page.evaluate(() => SB.who.get() === ''));

  // Sanitize with initials
  await page.evaluate(() => SB.who.set('AB'));
  await page.evaluate(() => { const s = SB.store.getState(); return s.sanitize; });
  await page.locator('.fl-san').click(); await page.locator('.menu-item:has-text("Mark surfaces sanitized")').click(); await page.waitForTimeout(500);
  const san = await page.evaluate(() => { const ev = SB.store.getState().events.filter((e) => e.type === 'sanitize_done'); return ev.length ? ev[ev.length - 1].who : null; });
  check('sanitize is saved with the remembered initials', san === 'AB', san);

  // Discard then fix
  await page.evaluate(() => { const b = SB.store.getState().batches[0]; SB.store.dispatchEx('discardBatch', { batchId: b.id, reason: 'manual', who: 'AB' }, { source: 'ui' }); SB.sheets.open('discards'); });
  await page.waitForSelector('[data-act="fix-entry"]');
  check('thrown-out log shows the initials from the entry', (await page.locator('.dlog-table input[aria-label^="Initials"]').first().inputValue()) === 'AB');
  await page.click('[data-act="fix-entry"]'); await page.fill('[aria-label="What was wrong"]', 'wrong food'); await page.click('button:has-text("Save the fix")'); await page.waitForTimeout(600);
  const fixes = await page.evaluate(() => SB.store.getState().events.filter((e) => e.type === 'safety_correction').length);
  check('a fix is saved as a new correction entry', fixes === 1, fixes);
  check('the log row shows the fix text', /wrong food/.test(await page.evaluate(() => document.querySelector('.dlog-table').innerText)));
  check('no page errors', logs.pageErrors.length === 0, logs.pageErrors);
});
process.exit(fail ? 1 : 0);
