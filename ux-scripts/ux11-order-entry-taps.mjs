// UX test 11: count taps for counter order entry at 1280x800 touch, driving the real buttons.
// Flows: 1) a new 3-item order for a named guest, paid by cash; 2) the same guest again (their name is not a quick name);
// 3) a second cash order. Run after building: node ux-scripts/ux11-order-entry-taps.mjs. Works on older builds too: it uses
// the Recent customer button only when it exists. Needs dist/smokebox.html.
import { withPage } from '../tools/pw.mjs';
await withPage({ w: 1280, h: 800, touch: true }, async (page, logs) => {
  await page.waitForFunction(() => window.SB && SB.booted === true, null, { timeout: 8000 });
  await page.evaluate(() => { SB.floor.setWelcome(false); if (SB.sim) SB.sim.live.crew(false); });
  let taps = 0, typed = 0;
  const tap = async (sel) => { await page.click(sel, { timeout: 4000 }); taps++; await page.waitForTimeout(150); };
  const reset = () => { taps = 0; typed = 0; };
  // Types a name the slow way: one tap in the box, one typed field.
  const typeName = async (nm) => { await page.click('.ord-cust-input'); taps++; await page.fill('.ord-cust-input', nm); typed++; };
  // Enters a name the cheapest way available on this build: a Recent button when there is one, else typing.
  const name = async (nm) => {
    const rec = page.locator('.ord-recent .chip', { hasText: nm });
    if (await rec.count()) { await rec.first().click(); taps++; } else await typeName(nm);
  };
  const order = async (nm, { pay, openFromBoard = true }) => {
    reset();
    await tap('.fl-new'); await page.waitForSelector('.ord-tile');
    const tiles = await page.$$('.ord-tile:not(.is-86)');
    for (let i = 0; i < 3; i++) { await tiles[i].click(); taps++; }
    await name(nm);
    const cur = await page.evaluate(() => ((document.querySelector('.ord-pay [aria-checked="true"]') || {}).textContent || '').slice(0, 8));
    if (pay && !/^Cash/.test(cur || '')) await tap('.ord-pay [data-id="cash"]');
    await tap('.ord-send'); await page.waitForTimeout(400);
    return { taps, typed, startedOn: cur };
  };
  const rows = [];
  rows.push(['1 new 3-item order, new guest "Dave", cash', await order('Dave', { pay: true })]);
  rows.push(['2 same guest again, cash', await order('Dave', { pay: true })]);
  rows.push(['3 another cash order, guest "Dave"', await order('Dave', { pay: true })]);
  for (const [l, r] of rows) console.log(l.padEnd(48), 'taps:', String(r.taps).padStart(2), r.typed ? '(+ ' + r.typed + ' typed)' : '', ' payment started on:', r.startedOn);
  console.log('errors', logs.errors.length, logs.pageErrors.length);
});
