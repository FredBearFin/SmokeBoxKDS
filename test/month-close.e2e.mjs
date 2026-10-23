/*
 * WHAT THIS FILE IS: Browser check for the Close the month flow (SB.setup.openCloseMonth, sheet name closemonth): the PIN keypad first, step 1
 * counts that match the store's preview, step 2 downloads (backup + three CSV files + a list) and the "I saved the files" box, step 3 the typed
 * word and red button, the done screen with its counts and Undo, and the plain refusals (files out of date, demo, hub tablet, nothing to close).
 * USES: tools/pw.mjs, test/_load.mjs (builds 60 days of history with the engine), dist/smokebox.html. RUN: node test/month-close.e2e.mjs
 */
import { withPage } from '../tools/pw.mjs';
import { loadSB } from './_load.mjs';
let fails = 0;
// Records one check result and prints it.
function ok(c, m) { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; }
// Types four digits on the PIN keypad.
async function keypad(page, pin) { await page.waitForSelector('.keypad'); for (const d of pin) await page.locator('.keypad button', { hasText: new RegExp('^' + d + '$') }).first().click(); await page.waitForTimeout(400); }

// Builds a saved kitchen with 60 closed service days ending now (a few paid orders a day, one safety reading, a closeDay each night), as the text the page loads.
async function savedKitchen() {
  const SB = await loadSB(['00-util', '10-config', '20-engine']);
  const E = SB.engine, U = SB.util;
  const end = Date.now() - 3600e3, days = 60;
  let now = end - (days - 1) * 86400e3; now = new Date(now).setHours(9, 0, 0, 0);
  let s = E.newState({ now, blank: true });
  const go = (type, p, at) => { if (at > now) now = at; const res = E.apply(s, type, p, now); if (res.report !== 'ok') throw new Error(type + ' ' + res.report + ' ' + JSON.stringify(res.info)); s = res.state; return res; };
  const dish = go('addMenuItem', { name: 'Plain dish', zone: 'pit', cat: 'meat', price: 6.5, prepSec: 120, track: 'one', prepGuess: false }, now + 1000).info.id;
  const first = now;
  for (let d = 0; d < days; d++) {
    const base = new Date(first); base.setDate(base.getDate() + d); base.setHours(11, 0, 0, 0);
    for (let k = 0; k < 3; k++) {
      const at = base.getTime() + k * 600e3;
      const res = go('createTicket', { customer: 'C' + k, channel: 'dine_in', items: [{ menuId: dish, qty: 1 }], allowPast: true }, at);
      const oid = res.info.orderId, tk = s.tickets[s.tickets.length - 1];
      for (const it of tk.items) for (let i = 0; i < 2; i++) { const cur = s.tickets.find((x) => x.id === tk.id).items.find((x) => x.id === it.id); if (cur.status !== 'done') go('advanceItem', { ticketId: tk.id, itemId: it.id }, at + 20000 * (i + 1)); }
      go('bumpTicket', { ticketId: tk.id }, at + 70000);
      go('payOrder', { orderId: oid, method: 'cash', tip: 0 }, at + 80000);
    }
    go('sanitizeDone', { who: 'JM' }, base.getTime() + 9 * 3600e3);
    go('closeDay', {}, base.getTime() + 10 * 3600e3);
  }
  const t = Math.max(now, end);
  s = E.tick(s, t).state;
  return JSON.stringify({ v: 1, savedAt: t, rev: s.rev, clock: { virtual: t, real: t, speed: 1 }, state: s });
}
const saved = await savedKitchen();
// The start-up script that puts the saved kitchen in storage once (a string, because the page cannot see this file's variables).
const seed = (text) => 'try { if (!localStorage.getItem("__seeded")) { localStorage.setItem("__seeded", "1"); localStorage.setItem("smokebox.v1.state", ' + JSON.stringify(text) + '); } } catch (e) { /* storage blocked */ }';
const nTickets = (page) => page.evaluate(() => SB.store.getState().tickets.length);

await withPage({ w: 1024, h: 800, init: seed(saved), clearStorage: false }, async (page, logs) => {
  await page.waitForFunction(() => window.SB && SB.booted === true);
  const total0 = await nTickets(page);
  ok(total0 > 100, 'the page opened with the seeded history: ' + total0 + ' tickets');
  const pv = await page.evaluate(() => SB.store.closeMonthPreview({ before: new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0') + '-01' }));
  ok(pv.ok && pv.preview.tickets > 0, 'the store has something to close: ' + JSON.stringify(pv.preview && { d: pv.preview.days.length, t: pv.preview.tickets, o: pv.preview.orders }));

  // The PIN keypad comes first when a PIN is set.
  await page.evaluate(async () => { await SB.shell.setPin('1234'); });
  await page.evaluate(() => SB.setup.openCloseMonth());
  await page.waitForSelector('.keypad');
  ok(await page.locator('[data-act="cm-next1"]').count() === 0, 'with a PIN set, the keypad comes first and the sheet is not open');
  await page.getByRole('button', { name: 'Cancel' }).last().click(); await page.waitForTimeout(400);
  ok(await page.locator('[data-act="cm-next1"]').count() === 0 && (await nTickets(page)) === total0, 'cancelling the keypad opens nothing and removes nothing');
  await page.evaluate(() => SB.sheets.open('closemonth')); await keypad(page, '1234');
  await page.waitForSelector('[data-act="cm-next1"]');
  ok(true, 'the right PIN opens Close the month (also by the sheet name closemonth)');

  // Step 1: the counts.
  const t1 = await page.locator('[data-role="cm-counts"]').innerText();
  ok(/This moves out/.test(t1) && /This stays/.test(t1) && /last 35 days/.test(t1) && /food-safety/.test(t1), 'step 1 says what moves out and what stays: ' + t1.replace(/\n/g, ' ').slice(0, 160));
  ok(new RegExp(pv.preview.days.length + ' days of history').test(t1) && new RegExp(pv.preview.tickets + ' tickets').test(t1) && new RegExp(pv.preview.orders + ' orders').test(t1), 'the counts match the store preview (' + pv.preview.tickets + ' tickets, ' + pv.preview.orders + ' orders)');
  ok(await page.locator('[data-act="cm-next1"]').isEnabled(), 'Next is on when there is something to close');
  await page.click('[data-act="cm-next1"]');

  // Step 2: files and the box.
  ok(await page.locator('[data-act="cm-next2"]').isDisabled() && await page.locator('#cm-saw').isDisabled(), 'before saving: the box and Next are off');
  const downloads = []; page.on('download', (d) => downloads.push(d.suggestedFilename()));
  await page.click('[data-act="cm-save-files"]');
  await page.waitForTimeout(2800);
  const names = await page.locator('[data-role="cm-files"] li strong').allInnerTexts();
  ok(names.length === 5 && /\.json$/.test(names[0]) && names.slice(1, 4).every((n) => /\.csv$/.test(n)), 'five files are listed with their names: ' + names.join(', '));
  ok((await page.locator('[data-role="cm-files"]').innerText()).match(/KB/g).length === 5, 'every file shows its size');
  ok(downloads.length === 5 && names.every((n) => downloads.includes(n)), 'the browser was handed all five files: ' + downloads.join(', '));
  ok(await page.locator('#cm-saw').isEnabled() && await page.locator('[data-act="cm-next2"]').isDisabled(), 'the box wakes up; Next waits for it');
  await page.check('#cm-saw');
  ok(await page.locator('[data-act="cm-next2"]').isEnabled(), 'ticking "I saved the files and I can find them" turns Next on');
  ok((await nTickets(page)) === total0, 'saving the files removed nothing');

  // Step 3: the word.
  await page.click('[data-act="cm-next2"]');
  ok(await page.locator('[data-act="cm-go"]').isDisabled(), 'the red button is off until the word is typed');
  await page.fill('input[aria-label="Type CLOSE to confirm"]', 'clos');
  ok(await page.locator('[data-act="cm-go"]').isDisabled(), 'a wrong word keeps it off');
  await page.fill('input[aria-label="Type CLOSE to confirm"]', 'close');
  ok(await page.locator('[data-act="cm-go"]').isEnabled(), 'the word CLOSE (any case) turns it on');
  await page.click('[data-act="cm-go"]');
  await page.waitForSelector('[data-role="cm-done"]:not([hidden])');
  const doneText = await page.locator('[data-role="cm-done"]').innerText();
  const after = await nTickets(page);
  ok(after === total0 - pv.preview.tickets, 'the tickets were removed: ' + total0 + ' -> ' + after);
  ok(new RegExp('Moved out: ' + pv.preview.days.length + ' days').test(doneText) && new RegExp(pv.preview.tickets + ' tickets').test(doneText), 'done screen shows the counts: ' + doneText.replace(/\n/g, ' ').slice(0, 200));
  ok(/kept for 7 days/.test(doneText) && await page.locator('[data-act="cm-undo"]').count() === 1, 'it says the old kitchen is kept for 7 days and offers Undo');
  await page.click('[data-act="cm-undo"]'); await page.waitForTimeout(600);
  ok((await nTickets(page)) === total0, 'Undo puts the whole history back: ' + await nTickets(page));
  ok(/Undone/.test(await page.locator('[data-role="cm-undo-msg"]').innerText()), 'and says so in words');
  ok(logs.pageErrors.length === 0, 'no page errors ' + logs.pageErrors.join('|').slice(0, 200));
});

// Refusals in plain words.
await withPage({ w: 1024, h: 800, init: seed(saved), clearStorage: false }, async (page) => {
  await page.waitForFunction(() => window.SB && SB.booted === true);
  await page.evaluate(() => SB.setup.openCloseMonth());
  await page.waitForSelector('[data-act="cm-next1"]');
  await page.click('[data-act="cm-next1"]'); await page.click('[data-act="cm-save-files"]'); await page.waitForTimeout(500);
  await page.check('#cm-saw'); await page.click('[data-act="cm-next2"]');
  // The files go out of date after saving (a record changed): the store refuses, the screen sends the person back to save again.
  await page.evaluate(() => { SB.store.closeMonthPrune = () => ({ ok: false, report: 'exportStale', info: {} }); });
  await page.fill('input[aria-label="Type CLOSE to confirm"]', 'CLOSE'); const t0 = await nTickets(page); await page.click('[data-act="cm-go"]');
  await page.waitForTimeout(300);
  const msg = await page.locator('[data-role="cm-go-msg"]').innerText();
  ok(/Save the files again/.test(msg) && /Nothing was removed/.test(msg), 'files out of date: plain words ("' + msg.slice(0, 90) + '")');
  ok(await page.locator('[data-act="cm-save-files"]').isVisible() && await page.locator('#cm-saw').isDisabled() && (await nTickets(page)) === t0, 'and the person is back at step 2 to save again, nothing removed');
});
await withPage({ w: 1024, h: 800, init: seed(saved), clearStorage: false }, async (page) => {
  await page.waitForFunction(() => window.SB && SB.booted === true);
  await page.evaluate(() => { SB.store.isHubClient = () => true; SB.setup.openCloseMonth(); });
  await page.waitForSelector('[data-role="cm-counts"]');
  ok(/main computer's own screen or the main tablet/.test(await page.locator('[data-role="cm-counts"]').innerText()) && await page.locator('[data-act="cm-next1"]').isDisabled(), 'a tablet that works through the hub is told to do it on the main computer, and cannot go on');
});
await withPage({ w: 1024, h: 800, query: '?demo' }, async (page) => {
  await page.waitForFunction(() => window.SB && SB.booted === true);
  await page.evaluate(() => SB.setup.openCloseMonth());
  await page.waitForSelector('[data-role="cm-counts"]');
  ok(/demo/.test(await page.locator('[data-role="cm-counts"]').innerText()) && await page.locator('[data-act="cm-next1"]').isDisabled(), 'in the demo: plain words, cannot go on');
});
await withPage({ w: 1024, h: 800 }, async (page) => {
  await page.evaluate(() => SB.setup.openCloseMonth());
  await page.waitForSelector('[data-role="cm-counts"]');
  ok(/nothing to close/i.test(await page.locator('[data-role="cm-counts"]').innerText()) && await page.locator('[data-act="cm-next1"]').isDisabled(), 'a new kitchen with no old history: "nothing to close", cannot go on');
});
process.exit(fails ? 1 : 0);
