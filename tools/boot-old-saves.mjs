#!/usr/bin/env node
// WHAT THIS FILE IS: Release check in a real headless browser. For each old-build fixture in test/fixtures/old-saves/ it puts that
// build's storage into the page, opens dist/smokebox.html, and checks the app boots, shows the board with the saved
// dishes, keeps the saved data, and shows no warning or error notice and no console error. Then it checks the safety net:
// a damaged live save is replaced by the last good copy (with the notice), and a tiny stubbed storage quota leaves the app running.
// Run: node tools/build.mjs --quiet && node tools/boot-old-saves.mjs     Simulated only: no real device, no real kitchen.
// PARTS: seeding, one boot per fixture, the safety-net checks. USES: tools/pw.mjs, the fixtures, dist/smokebox.html.
import fs from 'node:fs';
import path from 'node:path';
import { withPage, ROOT } from './pw.mjs';

const DIR = path.join(ROOT, 'test/fixtures/old-saves');
const rows = [];
// Records one named check.
const check = (name, ok, detail = '') => rows.push({ name, ok: !!ok, detail: String(detail).slice(0, 120) });
// Script text that puts the given storage into the page once per tab (before the app starts).
const seed = (storage) => `try { if (!sessionStorage.getItem('__seeded')) { sessionStorage.setItem('__seeded', '1'); localStorage.clear(); const d = ${JSON.stringify(storage)}; for (const k in d) localStorage.setItem(k, d[k]); } } catch (e) {}`;
// The notices on screen: text and tone.
const toasts = (page) => page.evaluate(() => Array.from(document.querySelectorAll('.toast')).map((t) => ({ tone: t.dataset.tone, text: (t.textContent || '').trim().slice(0, 160) })));

for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.json')).sort()) {
  const fx = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
  await withPage({ w: 1280, h: 800, clearStorage: false, init: seed(fx.storage) }, async (page, logs) => {
    try {
      await page.waitForFunction(() => window.SB && SB.booted === true, undefined, { timeout: 8000 });
      await page.waitForSelector('.fl-new', { timeout: 8000 });
      await page.waitForTimeout(600);
      const s = await page.evaluate(() => { const st = SB.store.getState(); return { menu: st.menu.length, tickets: st.tickets.length, batches: st.batches.length, pin: st.settings.office.pinHash, tax: st.settings.service.taxRatePct, own: SB.store.isOwn(), inv: SB.engine.checkInvariants(st, SB.store.now()).length, board: !!document.querySelector('.fl-new') && !!document.querySelector('.fl-tabs, .fl-head, header') }; });
      const t = await toasts(page);
      check(f + ': boots and shows the board', s.board, JSON.stringify(s));
      check(f + ': keeps its data', s.menu === fx.expect.menu && s.tickets === fx.expect.tickets && s.pin === fx.expect.pinHash && s.tax === fx.expect.taxRatePct && s.own === false && s.inv === 0, JSON.stringify(s));
      check(f + ': no warning or error notice', t.every((x) => x.tone !== 'warn' && x.tone !== 'bad'), JSON.stringify(t));
      check(f + ': no console or page errors', logs.errors.length === 0 && logs.pageErrors.length === 0, logs.errors.concat(logs.pageErrors)[0] || '');
      // the old kitchen survives a reload
      await page.reload(); await page.waitForSelector('.fl-new', { timeout: 8000 });
      check(f + ': still the same after a reload', (await page.evaluate(() => SB.store.getState().menu.length)) === fx.expect.menu);
    } catch (e) { check(f + ' (step crashed)', false, e.message.split('\n')[0]); }
  });
}

// Start over with an empty menu, on an old kitchen in the real browser: refused without the word, then the empty first-run kitchen.
await withPage({ w: 1280, h: 800, clearStorage: false, init: seed(JSON.parse(fs.readFileSync(path.join(DIR, 'b8e569e.json'), 'utf8')).storage) }, async (page, logs) => {
  try {
    await page.waitForSelector('.fl-new', { timeout: 8000 });
    const r = await page.evaluate(() => {
      const no = SB.store.startOver({ confirm: 'nope' });
      const yes = SB.store.startOver({ confirm: 'erase' });
      const s = SB.store.getState();
      return { no: no.report, yes: yes.ok, backupChars: yes.backup && yes.backup.text.length, blank: SB.store.isBlank(), menu: s.menu.length, tickets: s.tickets.length, demoKeys: Object.keys(localStorage).filter((k) => k.indexOf('smokebox.demo.') === 0).length };
    });
    check('Start over needs the typed word', r.no === 'confirmWord', JSON.stringify(r));
    check('Start over gives a backup and leaves an empty first-run kitchen', r.yes === true && r.backupChars > 1000 && r.blank && r.menu === 0 && r.tickets === 0, JSON.stringify(r));
    await page.waitForTimeout(900); await page.reload(); await page.waitForSelector('.fl-new', { timeout: 8000 });
    check('The empty kitchen survives a reload', await page.evaluate(() => SB.store.isBlank() && SB.store.getState().menu.length === 0));
    check('No page errors after starting over', logs.pageErrors.length === 0, logs.pageErrors[0] || '');
  } catch (e) { check('start over (step crashed)', false, e.message.split('\n')[0]); }
});

// The safety net, in a kitchen the app itself wrote: add a dish, wait for the first save and the last good copy, damage the live key, reload.
await withPage({ w: 1280, h: 800 }, async (page, logs) => {
  try {
    await page.waitForSelector('.fl-new', { timeout: 8000 });
    await page.evaluate(() => { SB.store.dispatch('addMenuItem', { name: 'Test pie', zone: 'cold', cat: 'cold', price: 4, prepSec: 30, track: 'one' }); SB.store.flush(); });
    const copy = await page.evaluate(() => { const g = localStorage.getItem('smokebox.v1.lastgood'); return g ? JSON.parse(g).state.menu.length : 0; });
    check('Last good copy is written after the first save', copy === 1, 'dishes in copy: ' + copy);
    await page.evaluate(() => { SB.store.destroy(); localStorage.setItem('smokebox.v1.state', '{"v":1,"state":{broken'); });
    await page.reload(); await page.waitForSelector('.fl-new', { timeout: 8000 });
    await page.waitForTimeout(500);
    const r = await page.evaluate(() => ({ menu: SB.store.getState().menu.map((m) => m.name), st: SB.store.status().restoredFromCopy, parked: localStorage.getItem('smokebox.v1.corrupt') }));
    const t = await toasts(page);
    check('A damaged live save is replaced by the last good copy', r.menu.join() === 'Test pie' && !!r.st, JSON.stringify(r));
    check('The damaged text is kept aside', !!r.parked && r.parked.indexOf('broken') >= 0);
    check('The owner is told, in plain words', t.some((x) => /restored the last good copy/.test(x.text)), JSON.stringify(t));
    await page.waitForTimeout(900);
    const live = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('smokebox.v1.state')).state.menu.length; } catch (e) { return -1; } });
    check('The live save is whole again after the restore', live === 1, 'dishes in live save: ' + live);
  } catch (e) { check('last good copy (step crashed)', false, e.message.split('\n')[0]); }
});

// Quota: the browser refuses any value over about 80,000 characters (a stub on localStorage.setItem).
await withPage({ w: 1280, h: 800, init: `(() => { const real = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (String(v).length > 80000 && k.indexOf('smokebox.') === 0) { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; } return real.call(this, k, v); }; })();` }, async (page, logs) => {
  try {
    await page.waitForSelector('.fl-new', { timeout: 8000 });
    const res = await page.evaluate(() => {
      for (let i = 0; i < 40; i++) SB.store.dispatch('addMenuItem', { name: 'Dish number ' + i, zone: 'cold', cat: 'cold', price: 4, prepSec: 30, track: 'one' });
      // paid tickets: these are history (an unpaid order is an open bill and is never trimmed), and history is what a full browser trims first
      for (let i = 0; i < 100; i++) {
        SB.store.dispatch('createTicket', { customer: 'Guest ' + i, channel: 'dine_in', items: [{ menuId: 'dish_number_' + (i % 40), qty: 1 }] });
        const tk = SB.store.getState().tickets[SB.store.getState().tickets.length - 1];
        SB.store.dispatch('completeItem', { ticketId: tk.id, itemId: tk.items[0].id });
        SB.store.dispatch('bumpTicket', { ticketId: tk.id });
        SB.store.dispatch('payOrder', { orderId: tk.orderId, method: 'cash', tip: 0, discount: 0 });
      }
      const ok = SB.store.flush();
      const saved = localStorage.getItem('smokebox.v1.state');
      return { ok, status: SB.store.status(), savedLen: saved ? saved.length : 0, menu: SB.store.getState().menu.length };
    });
    check('Under a small quota the app keeps running and saves what fits', res.menu === 40 && res.status.lastSaveOk === true, JSON.stringify({ ok: res.ok, trimmed: res.status.trimmed, lastSaveOk: res.status.lastSaveOk, savedLen: res.savedLen }));
    check('History was trimmed, the dishes were kept', res.status.trimmed === true && res.savedLen > 0 && res.savedLen <= 80000, 'lastSaveOk ' + res.status.lastSaveOk + ', trimmed ' + res.status.trimmed + ', length ' + res.savedLen);
    // Far too many open tickets to trim: the save fails, the app still runs and says so on screen.
    const bad = await page.evaluate(() => { for (let i = 0; i < 300; i++) SB.store.dispatch('createTicket', { customer: 'Open ' + i, channel: 'dine_in', items: [{ menuId: 'dish_number_' + (i % 40), qty: 1 }] }); SB.store.flush(); SB.store.tick(); return { ok: SB.store.status().lastSaveOk, tickets: SB.store.getState().tickets.length }; });
    // The store announces a failed save, so the strip should show within a second or two.
    let banner = '', waited = 0;
    for (let i = 0; i < 6 && !banner; i++) { await page.waitForTimeout(500); waited += 500; banner = await page.evaluate(() => (document.body.innerText.match(/save failed[^.]*\./i) || [''])[0]); }
    check('When nothing fits, the app keeps running and the screen says the save failed', bad.ok === false && bad.tickets > 300 && /save failed/i.test(banner), JSON.stringify(bad) + ' after ' + waited + ' ms: ' + banner);
    check('No page errors under quota pressure', logs.pageErrors.length === 0, logs.pageErrors[0] || '');
  } catch (e) { check('quota (step crashed)', false, e.message.split('\n')[0]); }
});

const w = Math.max(...rows.map((r) => r.name.length));
console.log('\nSmokebox old-save and safety-net browser check (headless Chromium, simulated only)');
for (const r of rows) console.log((r.ok ? 'PASS  ' : 'FAIL  ') + r.name.padEnd(w) + (r.detail && !r.ok ? '  ' + r.detail : ''));
const bad = rows.filter((r) => !r.ok).length;
console.log(`\n${rows.length - bad}/${rows.length} passed` + (bad ? ` - ${bad} FAILED` : ' - all pass'));
process.exit(bad ? 1 : 0);
