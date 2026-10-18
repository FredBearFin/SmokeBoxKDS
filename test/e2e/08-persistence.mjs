// Journey 8: persistence and sync. Reload keeps tickets, settings and theme; two pages in one browser stay in sync; corrupt storage starts fresh with a notice.
import { seedStandard, boardSummary, storeTickets, settle, wait, dialog, openKey, closeSheets, head } from './_lib.mjs';

const ageText = (page, who) => page.evaluate((who) => { const s = Array.from(document.querySelectorAll('.fl-slip')).find((x) => x.querySelector('.slip-who') && x.querySelector('.slip-who').textContent.includes(who)); return s ? s.querySelector('.slip-timer').textContent : null; }, who);
const secs = (mmss) => { const m = /^(\d+):(\d\d)$/.exec(mmss || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : NaN; };
const bootWait = (page) => page.waitForFunction(() => window.SB && SB.booted === true, null, { timeout: 10000 }).catch(() => {});

export default function (h) {
  h.test('08a-reload-keeps', 'Persistence: reload keeps tickets, item progress, 86, settings, theme and the running clocks', { owner: 'lead', timeout: 80000 }, async (t) => {
    // records every change of the theme attributes with its time, so the first paint can be compared with the moment Night and Large text were applied
    const probe = () => { window.__thm = []; const rec = () => { const r = document.documentElement; if (!r) return; const x = { at: performance.now(), theme: r.getAttribute('data-theme'), large: r.classList.contains('text-large') }; const l = window.__thm[window.__thm.length - 1]; if (!l || l.theme !== x.theme || l.large !== x.large) window.__thm.push(x); }; rec(); new MutationObserver(rec).observe(document, { attributes: true, attributeFilter: ['data-theme', 'class'], subtree: true, childList: true }); };
    const page = await t.open({ w: 1280, h: 800, init: probe });
    await seedStandard(page);
    const walk = page.locator('.fl-slip', { has: page.locator('.slip-who', { hasText: 'Walk-up' }) });
    await walk.getByRole('button', { name: /Smoked sausage link/ }).click();
    await settle(page, 300);
    // settings through the Settings sheet, as a person would
    await page.locator('.fl-head .fl-menu').click();
    const sd = page.getByRole('dialog', { name: 'Settings' });
    await sd.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
    await sd.getByRole('radio', { name: 'Night' }).click().catch(async () => { await sd.getByRole('tab', { name: 'Night' }).click(); });
    await sd.getByRole('radio', { name: 'Large' }).click().catch(async () => { await sd.getByRole('tab', { name: 'Large' }).click(); });
    await sd.getByRole('radio', { name: 'Hot sides' }).click().catch(async () => { await sd.getByRole('tab', { name: 'Hot sides' }).click(); });
    await settle(page, 400);
    t.check('Night and Large text are applied right away', await page.evaluate(() => document.documentElement.getAttribute('data-theme') === 'night' && document.documentElement.classList.contains('text-large')), await page.evaluate(() => document.documentElement.outerHTML.slice(0, 120)), 'sheets');
    await closeSheets(page);
    // a manual 86 and a hold reading
    await page.evaluate(() => { SB.store.dispatchEx('toggle86', { menuId: 'pork_half', on: true }, { source: 'ui' }); });
    const before = {
      tickets: (await storeTickets(page)).map((x) => x.num + ':' + x.customer + ':' + x.items.map((i) => i.status).join(',')),
      manual86: await page.evaluate(() => JSON.stringify(SB.store.getState().manual86)),
      batches: await page.evaluate(() => SB.store.getState().batches.length),
      age: await ageText(page, 'Table 4'),
      hash: await page.evaluate(() => location.hash),
    };
    await wait(2200);
    await page.reload({ waitUntil: 'load' });
    await bootWait(page);
    await settle(page, 600);
    const after = {
      tickets: (await storeTickets(page)).map((x) => x.num + ':' + x.customer + ':' + x.items.map((i) => i.status).join(',')),
      manual86: await page.evaluate(() => JSON.stringify(SB.store.getState().manual86)),
      batches: await page.evaluate(() => SB.store.getState().batches.length),
      age: await ageText(page, 'Table 4'),
      hash: await page.evaluate(() => location.hash),
      boot: await page.evaluate(() => { const fp = (performance.getEntriesByName('first-paint')[0] || performance.getEntriesByName('first-contentful-paint')[0] || {}).startTime; const h = window.__thm || []; const atPaint = h.filter((x) => fp == null || x.at <= fp).pop() || h[0]; return { fp: fp == null ? null : Math.round(fp), atPaint, changes: h.map((x) => Math.round(x.at) + ':' + x.theme + (x.large ? '+large' : '')).join(' ') }; }),
      theme: await page.evaluate(() => SB.theme.get()),
      text: await page.evaluate(() => SB.theme.textSize()),
    };
    t.check('the 4 tickets and each item status survive a reload', JSON.stringify(before.tickets) === JSON.stringify(after.tickets), { before: before.tickets, after: after.tickets }, 'lead');
    t.check('the manual 86 survives a reload', before.manual86 === after.manual86, { before: before.manual86, after: after.manual86 }, 'lead');
    t.check('the hold batches survive a reload', before.batches === after.batches, { before: before.batches, after: after.batches }, 'lead');
    t.check('Night and Large text are already applied at the first paint (no flash of Day)', after.boot && after.boot.atPaint && after.boot.atPaint.theme === 'night' && after.boot.atPaint.large === true, after.boot, 'lead');
    t.check('after the reload the theme API agrees (night, large)', after.theme === 'night' && after.text === 'large', after, 'lead');
    const dAge = secs(after.age) - secs(before.age);
    t.check('the ticket clock keeps counting through a reload (Table 4 age grew by about 2 to 12 s, not reset to 0)', dAge >= 1 && dAge <= 14, { before: before.age, after: after.age }, 'lead');
    t.check('the chosen station (Hot sides) is the one that opens', /#\/s\/sides/.test(after.hash), after.hash, 'board');
    await t.clean(page, 'reload');
  });

  h.test('08b-two-pages-sync', 'Persistence: two pages in one browser stay in sync and never duplicate ticket numbers', { owner: 'lead', timeout: 80000 }, async (t) => {
    const a = await t.open({ w: 1100, h: 800 });
    const b = await t.newPage(a);
    t.check('both pages booted', await a.evaluate(() => SB.booted) && await b.evaluate(() => SB.booted));
    await seedStandard(a);
    await b.waitForFunction(() => SB.store.getState().tickets.length >= 4, null, { timeout: 6000 }).catch(() => {});
    t.check('tickets created on page A appear on page B within 6 s', (await storeTickets(b)).length === 4, (await storeTickets(b)).length, 'lead');
    t.check('page B draws the 4 slips', (await boardSummary(b)).slips.length === 4, (await boardSummary(b)).slips.length, 'board');
    // B bumps through the UI; A sees it go
    const walk = b.locator('.fl-slip', { has: b.locator('.slip-who', { hasText: 'Walk-up' }) });
    await walk.getByRole('button', { name: /^Start now/ }).first().click().catch(() => {});
    await walk.getByRole('button', { name: /Smoked sausage link/ }).click();
    await wait(900);
    await walk.getByRole('button', { name: /Smoked sausage link/ }).click().catch(() => {});
    await a.waitForFunction(() => { const t = SB.store.getState().tickets.find((x) => x.customer === 'Walk-up'); return t && t.items.some((i) => i.menuId === 'sausage' && i.status === 'done'); }, null, { timeout: 6000 }).catch(() => {});
    const sa = (await storeTickets(a)).find((x) => x.customer === 'Walk-up');
    t.check('a tap on page B reaches page A (sausage done on both)', sa && sa.items.find((i) => i.menuId === 'sausage').status === 'done', sa && sa.items.map((i) => i.menuId + ':' + i.status), 'lead');
    // simultaneous creates: numbers and ids must stay unique and both pages must end with the same set
    await Promise.all([
      a.evaluate(() => { for (let i = 0; i < 3; i++) SB.store.dispatchEx('createTicket', { customer: 'A' + i, channel: 'takeout', items: [{ menuId: 'mac' }], src: 'live' }, { source: 'ui' }); }),
      b.evaluate(() => { for (let i = 0; i < 3; i++) SB.store.dispatchEx('createTicket', { customer: 'B' + i, channel: 'dine_in', items: [{ menuId: 'slaw' }], src: 'live' }, { source: 'ui' }); }),
    ]);
    await wait(2500);
    const ta = await storeTickets(a), tb = await storeTickets(b);
    const nums = (arr) => arr.map((x) => x.num).sort((x, y) => x - y);
    const uniq = (arr) => new Set(arr).size === arr.length;
    t.check('after simultaneous orders on two pages every ticket number is unique on page A', uniq(nums(ta)), nums(ta), 'lead');
    t.check('after simultaneous orders on two pages every ticket number is unique on page B', uniq(nums(tb)), nums(tb), 'lead');
    t.check('both pages end with the same tickets (10 in total: 4 + 3 + 3)', ta.length === 10 && tb.length === 10 && JSON.stringify(nums(ta)) === JSON.stringify(nums(tb)), { a: ta.length, b: tb.length }, 'lead');
    // the same thing a little less brutal: one page after the other, 700 ms apart. Nothing may be lost.
    const n0 = ta.length;
    await a.evaluate(() => SB.store.dispatchEx('createTicket', { customer: 'A9', channel: 'takeout', items: [{ menuId: 'mac' }], src: 'live' }, { source: 'ui' }));
    await wait(700);
    await b.evaluate(() => SB.store.dispatchEx('createTicket', { customer: 'B9', channel: 'dine_in', items: [{ menuId: 'slaw' }], src: 'live' }, { source: 'ui' }));
    await wait(1800);
    const sa2 = await storeTickets(a), sb2 = await storeTickets(b);
    t.check('orders made on the two pages 700 ms apart are both kept on both pages', sa2.length === n0 + 2 && sb2.length === n0 + 2 && ['A9', 'B9'].every((c) => sa2.some((x) => x.customer === c) && sb2.some((x) => x.customer === c)), { a: sa2.length, b: sb2.length, expected: n0 + 2 }, 'lead');
    // a 86 on one page blocks the tile on the other
    await a.evaluate(() => SB.store.dispatchEx('toggle86', { menuId: 'pork_half', on: true }, { source: 'ui' }));
    await wait(1500);
    const eighty = await b.evaluate(() => JSON.stringify(SB.store.getState().manual86));
    t.check('a manual 86 on A reaches B', /pork_half/.test(eighty), eighty, 'lead');
    await t.clean(a, 'page A');
    await t.clean(b, 'page B');
  });

  h.test('08c-corrupt-storage', 'Persistence: corrupt or odd saved data starts fresh, keeps a copy, and TELLS the user', { owner: 'lead', timeout: 90000 }, async (t) => {
    const cases = [
      ['broken JSON', '{"v":1,"state":{"tickets":[{"id":'],
      ['wrong shape', JSON.stringify({ v: 1, state: { tickets: 'nope', batches: 5 } })],
      ['a bare number', '12345'],
      ['an array', '[1,2,3]'],
      ['an old version', JSON.stringify({ v: 0, state: {} })],
    ];
    let shownNotice = 0;
    const flaked = new Set();
    for (let ci = 0; ci < cases.length; ci++) {
      const [name, payload] = cases[ci];
      const page = await t.open({ w: 1280, h: 800, preset: { 'smokebox.v1.state': payload } });
      const info = await page.evaluate(() => ({ booted: !!SB.booted, bootErr: !!document.getElementById('boot-error'), status: SB.store.status(), tickets: SB.store.getState().tickets.length, parked: localStorage.getItem('smokebox.v1.corrupt') != null }));
      t.check(name + ': the app boots (no boot error screen)', info.booted && !info.bootErr, info, 'lead');
      t.check(name + ': it starts with a clean state (a fresh store, not half-loaded data)', info.tickets === 0 || info.tickets === 5, info, 'lead');
      t.check(name + ': the unreadable copy is parked under smokebox.v1.corrupt so it can be recovered', info.parked, info, 'lead');
      await settle(page, 600);
      const visible = await page.evaluate(() => (document.querySelector('.toast-host') ? document.querySelector('.toast-host').innerText : '') + ' ' + (document.querySelector('.fl') ? document.querySelector('.fl').innerText : ''));
      const noticed = /saved data|could not be read|unreadable|damaged|corrupt|started fresh|starting fresh|start(ed)? over|could not load/i.test(visible);
      if (noticed) shownNotice++;
      t.check(name + ': the user is told that the saved data could not be read and the board started fresh', noticed, visible.replace(/\s+/g, ' ').slice(0, 160), 'lead');
      // new work after the reset must persist (the bad payload was replaced): first it must reach storage, then it must survive a reload
      await page.evaluate(() => SB.store.dispatchEx('createTicket', { customer: 'After', channel: 'takeout', items: [{ menuId: 'mac' }], src: 'live' }, { source: 'ui' }));
      let saved = false;
      for (let i = 0; i < 12 && !saved; i++) { await wait(400); saved = await page.evaluate(() => /"customer":"After"/.test(localStorage.getItem('smokebox.v1.state') || '')); }
      t.check(name + ': a ticket made after the reset is written to storage within 5 s', saved, await page.evaluate(() => ({ head: String(localStorage.getItem('smokebox.v1.state')).slice(0, 70), status: SB.store.status() })), 'lead');
      await page.reload({ waitUntil: 'load' });
      await bootWait(page);
      // Chromium on file:// sometimes drops ALL localStorage of a fresh context on its first reload (seen with a bare scratch script, no Smokebox code involved; the app never clears storage, and not even the parked copy
      // it wrote survives). When every key is gone although the write was seen before the reload, repeat that case once on a new context and note it.
      const everythingGone = await page.evaluate(() => localStorage.getItem('smokebox.v1.state') == null && localStorage.getItem('smokebox.v1.corrupt') == null);
      if (everythingGone && !flaked.has(name)) { flaked.add(name); t.note('browser dropped all storage on reload, case repeated: ' + name, flaked.size, 'x'); await page.context().close().catch(() => {}); ci--; continue; }
      const kept = (await storeTickets(page)).some((x) => x.customer === 'After');
      t.check(name + ': a ticket made after the reset survives the next reload', kept, await page.evaluate(() => ({ tickets: SB.store.getState().tickets.length, keys: Object.keys(localStorage).join('|'), head: String(localStorage.getItem('smokebox.v1.state')).slice(0, 70), status: SB.store.status() })), 'lead');
      if (name === 'broken JSON') await t.shot(page, 'corrupt-storage-board');
      await t.clean(page, name);
      await page.context().close().catch(() => {}); // one case at a time: a page left running next to the next case could share its saved data
    }
  });

  h.test('08d-storage-blocked', 'Persistence: with browser storage blocked the app still runs and says it cannot save', { owner: 'lead', timeout: 60000 }, async (t) => {
    const block = () => { const e = () => { throw new DOMException('blocked', 'SecurityError'); }; try { Object.defineProperty(window, 'localStorage', { get: e, configurable: true }); } catch (x) { /* ignore */ } };
    const page = await t.open({ w: 1280, h: 800, init: block, clear: false });
    const booted = await page.evaluate(() => ({ b: !!SB.booted, err: !!document.getElementById('boot-error') }));
    t.check('with localStorage throwing the app still boots', booted.b && !booted.err, booted, 'lead');
    await page.evaluate(() => SB.store.dispatchEx('createTicket', { customer: 'NoSave', channel: 'takeout', items: [{ menuId: 'mac' }], src: 'live' }, { source: 'ui' }));
    await settle(page, 400);
    t.check('a ticket can still be made and is drawn', (await boardSummary(page)).slips.some((s) => /NoSave/.test(s.customer)), (await boardSummary(page)).slips.length, 'board');
    const st = await page.evaluate(() => SB.store.status());
    t.check('the store knows it cannot save (persistent false or lastSaveOk false)', st.persistent === false || st.lastSaveOk === false, st, 'lead');
    const SAYS = /not letting (smokebox )?save|(can't|cannot|unable to) save|not (being )?(saved|kept)|lasts until you close|will be lost|until you close the page/i;
    let visible = '';
    for (let i = 0; i < 12; i++) { visible = await page.evaluate(() => document.body.innerText); if (SAYS.test(visible)) break; await wait(300); }
    t.check('the user is told the browser is not letting Smokebox save (a toast: the board lasts until the page is closed)', SAYS.test(visible), visible.replace(/\s+/g, ' ').slice(0, 160), 'lead');
    await t.clean(page, 'storage blocked');
  });
}
