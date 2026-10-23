// Quick browser check (about 10 s) of owner names: rename and add in the Data page, reload, and see the
// new names on the board and in the order sheet; a ticket on an added station and channel is accepted.
import { withPage } from '../tools/pw.mjs';
let bad = 0;
const check = (n, ok, x) => { console.log((ok ? 'ok   ' : 'FAIL ') + n + (ok ? '' : ' ' + JSON.stringify(x))); if (!ok) bad++; };
await withPage({ w: 1280, h: 800, clearStorage: true, hash: '#/office/data' }, async (page, logs) => {
  await page.waitForTimeout(900);
  await page.locator('input[aria-label="Name of station Pit"]').fill('Smoker');
  await page.locator('input[aria-label="Name of station Pit"]').locator('xpath=following-sibling::button').click();
  await page.locator('input[aria-label="New station name"]').fill('Bar');
  await page.locator('input[aria-label="New station name"]').locator('xpath=following-sibling::button').click();
  await page.locator('input[aria-label="New channel name"]').fill('Catering');
  await page.locator('input[aria-label="New channel name"]').locator('xpath=following-sibling::button').click();
  const saved = await page.evaluate(() => JSON.stringify(SB.util.storage.get('smokebox.v1.names', null)));
  check('names saved in this browser', /Smoker/.test(saved) && /Bar/.test(saved) && /Catering/.test(saved), saved);
  await page.reload(); await page.waitForTimeout(1200);
  const cfg = await page.evaluate(() => ({ pit: SB.config.zoneById.pit.name, work: SB.config.workZones.slice(), ch: !!SB.config.channelById.ch_catering }));
  check('after a reload the config has the new names', cfg.pit === 'Smoker' && cfg.work.includes('z_bar') && cfg.ch, cfg);
  await page.evaluate(() => { location.hash = '#/'; }); await page.waitForTimeout(600);
  const tabs = await page.evaluate(() => Array.from(document.querySelectorAll('.fl-seg [role=tab]')).map((b) => b.textContent.replace(/\d+$/, '').trim()));
  check('station tabs show the renamed and the added station', tabs.some((t) => /SMO/.test(t)) && tabs.some((t) => /BAR/.test(t)), tabs);
  const r = await page.evaluate(() => {
    const s = SB.store.getState(), it = s.menu.find((m) => !m.archived && (SB.store.select.availability(m.id) || {}).ok);
    const a = SB.store.dispatchEx('updateMenuItem', { id: it.id, patch: { zone: 'z_bar' } }, { source: 'ui' });
    const b = SB.store.dispatchEx('createTicket', { customer: 'T', channel: 'ch_catering', items: [{ menuId: it.id, qty: 1 }] }, { source: 'ui' });
    const t = SB.store.getState().tickets.slice(-1)[0];
    return { a: a.report, b: b.report, zone: t && t.items[0].zone, ch: t && t.channel };
  });
  check('a ticket routes to the added station on the added channel', r.a === 'ok' && r.b === 'ok' && r.zone === 'z_bar' && r.ch === 'ch_catering', r);
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/tmp/claude-0/-home-user/9ad563c9-fa82-588a-a959-8a11f3fc33d2/scratchpad/names.png' });
  check('no page errors', logs.pageErrors.length === 0, logs.pageErrors);
});
process.exit(bad ? 1 : 0);
