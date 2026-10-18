// UX test 3b: count the real taps for core jobs at 1280x800 with a touch screen, driving the actual buttons.
import { withPage } from '../tools/pw.mjs';
await withPage({ w: 1280, h: 800, touch: true }, async (page, logs) => {
  await page.waitForTimeout(800);
  await page.evaluate(() => { SB.floor.setWelcome(false); SB.sim.live.crew(false); SB.sim.live.burst(6); });
  await page.waitForTimeout(800);
  let taps = 0, typed = 0;
  const tap = async (sel, opts) => { try { await page.click(sel, Object.assign({ timeout: 4000 }, opts)); } catch (e) { const d = await page.evaluate(() => { const t = SB.store.getState().tickets[0]; return { items: t.items.map((i) => i.name + ':' + i.status), btns: [...document.querySelectorAll('[data-ticket="' + t.id + '"] button')].map((b) => (b.getAttribute('aria-label') || b.innerText).trim().slice(0, 90)) }; }); console.log('TAP FAILED', sel, JSON.stringify(d)); throw e; } taps++; await page.waitForTimeout(250); };
  const type = async (sel, txt) => { await page.click(sel); taps++; await page.fill(sel, txt); typed++; await page.waitForTimeout(100); };
  const reset = () => { taps = 0; typed = 0; };
  const row = (l, extra = '') => console.log(`${l.padEnd(46)} taps: ${String(taps).padStart(2)}${typed ? ' (+ ' + typed + ' typed field' + (typed > 1 ? 's' : '') + ')' : ''} ${extra}`);

  // F2: a cook works 5 tickets from first touch to bump
  const results = [];
  const ids = await page.evaluate(() => SB.store.getState().tickets.slice(0, 5).map((t) => t.id));
  for (const id of ids) {
    reset();
    const nItems = await page.evaluate((id) => SB.store.getState().tickets.find((t) => t.id === id).items.length, id);
    for (let guard = 0; guard < 30; guard++) {
      const t = await page.evaluate((id) => { const t = SB.store.getState().tickets.find((x) => x.id === id); return { num: t.num, items: t.items.map((i) => ({ n: i.name, st: i.status })) }; }, id);
      const next = t.items.find((i) => i.st !== 'done');
      if (!next) { await tap(`[data-ticket="${id}"] button[aria-label^="Bump ticket"]`); results.push({ id, num: t.num, nItems, taps }); break; }
      const slip = `[data-ticket="${id}"]`;
      if (next.st === 'queued') await tap(`${slip} button[aria-label="Start now: ${next.n}"]`);
      else await tap(`${slip} button:has-text("${next.n}"):has-text("Press")`);
    }
  }
  console.log('F2 cook works a whole ticket (start/done every item, then bump):');
  for (const r of results) console.log(`   ticket #${r.num}: ${r.nItems} items -> ${r.taps} taps`);
  console.log('   average', (results.reduce((a, r) => a + r.taps, 0) / results.length).toFixed(1), 'taps per ticket; per 40-ticket rush ~', Math.round(40 * results.reduce((a, r) => a + r.taps, 0) / results.length));

  // F1: enter a 3-item order for Table 4
  reset();
  await tap('.fl-new'); await page.waitForSelector('.ord-tile');
  const tiles = await page.$$('.ord-tile');
  for (let i = 0; i < 3; i++) { await tiles[i].click(); taps++; }
  await type('.ord-cust-input', 'Table 4');
  await tap('.ord-send'); await page.waitForTimeout(500);
  row('F1 take a 3-item order for Table 4 (pay later)');

  // F5: take payment for it
  reset();
  await tap('.fl-orders'); await page.waitForSelector('.ox-row');
  const oid = await page.evaluate(() => { const r = [...document.querySelectorAll('.ox-row')].find((x) => x.querySelector('.ox-who').textContent === 'Table 4'); return r && r.dataset.order; });
  await tap(`.ox-row[data-order="${oid}"] .ox-take`); await page.waitForSelector('.ox-pay-go');
  const defMethod = await page.evaluate(() => (document.querySelector('.ox-method [aria-checked="true"], .ox-method [aria-pressed="true"]') || {}).textContent);
  await tap('.ox-pay-go'); await page.waitForTimeout(400);
  row('F5 take payment, default method (' + defMethod + ')');
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);

  // F3: 86 an item
  reset();
  await tap('.fl-tool[data-tool="board86"]'); await page.waitForSelector('.sheet');
  await page.waitForTimeout(500);
  const labels = await page.evaluate(() => [...document.querySelectorAll('.sheet button')].map((b) => (b.getAttribute('aria-label') || b.innerText).trim().replace(/\s+/g, ' ').slice(0, 40)).filter(Boolean));
  console.log('   86 sheet buttons:', labels.slice(0, 22).join(' | '));
  await page.screenshot({ path: './out/c-86board.png' });
  console.log('errors', logs.errors.length, logs.pageErrors.length);
});
