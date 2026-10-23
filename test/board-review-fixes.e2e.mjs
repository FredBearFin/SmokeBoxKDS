// The board side of the review fixes (browser, about 2 minutes). Run: node test/board-review-fixes.e2e.mjs
// 1. The boot screen for saved data that could not be read and could not be set aside: plain words, a way forward only after the data is
//    downloaded or shown, nothing over it, at 390 and 1280 in Day, Night and Large text.
// 2. The load note counts what was left out.
// 3. A device clock that jumps ahead: a calm strip notice with two choices, a second tap to use the new time, tickets keep working.
// 4. Reopening a paid order of a closed day says why, in plain words.
// Needs dist/smokebox.html.
import { toolRequire } from '../tools/_deps.mjs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { chromium } = toolRequire('playwright');
const DIST = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), 'dist/smokebox.html');
let fail = 0;
// Records one check and prints it.
function check(name, ok, detail) { if (!ok) fail++; console.log((ok ? '  ok    ' : '  FAIL  ') + name + (ok ? '' : ' -> ' + String(JSON.stringify(detail)).slice(0, 300))); }
const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const errs = [];
const URL0 = pathToFileURL(DIST).href;
const SHOTS = process.env.SHOT_DIR || '/tmp';
const addDish = "SB.store.dispatchEx('addMenuItem', { name: 'Wings', zone: 'pit', cat: 'meat', price: 14, prepSec: 60, track: 'one' }, { source: 'ui' });";

// 1. The held-data screen
for (const [label, w, h, theme, size] of [['390 day', 390, 844, 'day', 'normal'], ['390 night large', 390, 844, 'night', 'large'], ['1280 day', 1280, 800, 'day', 'normal'], ['1280 night large', 1280, 800, 'night', 'large']]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, acceptDownloads: true });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(String(e)));
  await p.addInitScript(`(() => { try { localStorage.setItem('smokebox.v1.state', '{"damaged ticket data'); localStorage.setItem('smokebox.v1.theme', JSON.stringify('${theme}')); localStorage.setItem('smokebox.v1.textsize', JSON.stringify('${size}')); } catch (e) {} const real = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (/corrupt/.test(k)) throw new Error('quota'); return real.call(this, k, v); }; })();`);
  await p.goto(URL0);
  await p.waitForFunction(() => window.SB && SB.booted === true, null, { timeout: 15000 });
  const held = await p.waitForSelector('#held-data', { timeout: 5000 }).catch(() => null);
  check(label + ': the screen for data that could not be kept safe shows', !!held);
  if (!held) { await p.context().close(); continue; }
  const r = await p.evaluate(() => {
    const el = document.getElementById('held-data'), c = el.getBoundingClientRect();
    const top = document.elementFromPoint(c.left + c.width / 2, c.top + 40);
    const btns = [...el.querySelectorAll('button')].map((b) => ({ t: b.textContent, h: Math.round(b.getBoundingClientRect().height), dis: b.disabled }));
    return { txt: el.innerText, btns, covered: !(top && el.contains(top)), sw: document.documentElement.scrollWidth, vw: innerWidth, bg: getComputedStyle(el).backgroundColor };
  });
  check(label + ': plain words say what happened and what to do', /could not be read/.test(r.txt) && /Download the old data/.test(r.txt) && /keep the file/i.test(r.txt), r.txt.slice(0, 200));
  check(label + ': nothing covers it and the page does not scroll sideways', !r.covered && r.sw <= r.vw, { covered: r.covered, sw: r.sw, vw: r.vw });
  check(label + ': every button is at least 44 px tall and the way forward waits', r.btns.every((b) => b.h >= 44) && r.btns.find((b) => /continue/.test(b.t)).dis === true, r.btns);
  await p.screenshot({ path: SHOTS + '/held-' + label.replace(/ /g, '-') + '.png' });
  if (label === '390 day') {
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 4000 }).catch(() => null), p.click('#held-data button:has-text("Download")')]);
    check(label + ': Download gives a file with the old data', !!dl && /smokebox-damaged-data\.json/.test(dl.suggestedFilename()), dl && dl.suggestedFilename());
    check(label + ': after downloading, continue turns on', await p.evaluate(() => !document.querySelector('#held-data button:last-of-type').disabled));
    await p.click('#held-data button:has-text("continue")'); await p.waitForTimeout(600);
    check(label + ': continue lets the board open', await p.evaluate(() => !document.getElementById('held-data') && !!document.querySelector('.fl')));
  }
  await ctx.close();
}

// 2. The load note
{
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  const a = await ctx.newPage();
  await a.goto(URL0); await a.waitForFunction(() => window.SB && SB.booted === true);
  await a.evaluate(`SB.floor.setWelcome(false); ${addDish}`);
  await a.waitForTimeout(800);
  const saved = await a.evaluate(() => { const k = Object.keys(localStorage).find((x) => /\.state$/.test(x)); return { k, v: localStorage.getItem(k) }; });
  await a.close();
  const broken = JSON.parse(saved.v);
  const root = broken.state ? broken.state : broken;
  root.tickets = (root.tickets || []).concat([{ id: 'junk1' }, { id: 'junk2', items: 5 }]); root.orders = (root.orders || []).concat([{ id: 'junkO' }]); root.batches = (root.batches || []).concat([{ id: 'junkB' }]);
  const b = await ctx.newPage();
  b.on('pageerror', (e) => errs.push(String(e)));
  await b.addInitScript(`try { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(${JSON.stringify(saved.k)}, ${JSON.stringify(JSON.stringify(broken))}); sessionStorage.setItem('seeded', '1'); } } catch (e) {}`);
  await b.goto(URL0); await b.waitForFunction(() => window.SB && SB.booted === true); await b.waitForTimeout(1200);
  const toast = await b.evaluate(() => [...document.querySelectorAll('.toast')].map((e) => e.innerText).join(' | '));
  check('the load note says how many records were left out, in words', /left out 1 order, 2 tickets, 1 batch/.test(toast), toast);
  check('the load note is a toast (it does not block the board) and can be cleared', await b.evaluate(() => !!document.querySelector('.fl') && !!document.querySelector('.toast button, .toast .toast-x')), toast);
  await b.screenshot({ path: SHOTS + '/load-note-1024.png' });
  await ctx.close();
}

// 3. A device clock that jumps ahead
{
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto(URL0); await p.waitForFunction(() => window.SB && SB.booted === true);
  await p.evaluate(`SB.floor.setWelcome(false); ${addDish} SB.store.dispatchEx('createTicket', { customer: 'Table 4', channel: 'dine_in', items: [{ menuId: SB.store.getState().menu[0].id, qty: 1 }], note: '', rush: false }, { source: 'ui' });`);
  await p.waitForTimeout(1500);
  const t0 = await p.evaluate(() => SB.store.now());
  await p.evaluate(() => { const real = Date.now.bind(Date); window.__jump = 3 * 86400e3; Date.now = () => real() + window.__jump; });
  await p.waitForFunction(() => SB.store.status().clockSuspect, null, { timeout: 8000 }).catch(() => {});
  const sus = await p.evaluate(() => SB.store.status().clockSuspect);
  check('a three-day forward jump makes the store hold time (clockSuspect)', !!sus && sus.aheadMs > 2 * 86400e3, sus);
  await p.waitForSelector('.fl-bar-clock:not([hidden])', { timeout: 6000 }).catch(() => {});
  const bar = await p.evaluate(() => { const e = document.querySelector('.fl-bar-clock'); return e && !e.hidden ? { txt: e.innerText.replace(/\s+/g, ' '), btns: [...e.querySelectorAll('button')].map((b) => [b.textContent, Math.round(b.getBoundingClientRect().height)]) } : null; });
  check('the board shows a calm notice with the old time kept and two choices', !!bar && /clock jumped ahead by about 3 days/.test(bar.txt) && /still using the old time/.test(bar.txt) && bar.btns.length === 2, bar);
  check('both choices are at least 44 px tall', !!bar && bar.btns.every((b) => b[1] >= 44), bar && bar.btns);
  check('no box covers the board (no sheet or dialog is open)', await p.evaluate(() => !document.querySelector('[role="dialog"], [role="alertdialog"]')));
  check('the ticket still shows and its timer did not jump (still under a minute old)', await p.evaluate(() => { const s = document.querySelector('.fl-slip .slip-timer'); return !!s && /^00:/.test(s.textContent.trim()); }), await p.evaluate(() => (document.querySelector('.fl-slip .slip-timer') || {}).textContent));
  await p.click('.fl-slip button[data-act="item"]'); await p.waitForTimeout(500);
  check('tickets can still be worked while the notice is up (an item was started or finished)', await p.evaluate(() => SB.store.getState().tickets[0].items[0].status !== 'displayed'), await p.evaluate(() => SB.store.getState().tickets[0].items[0].status));
  await p.screenshot({ path: SHOTS + '/clock-notice-1024.png' });
  await p.click('.fl-bar-clock [data-act="clock-use"]'); await p.waitForTimeout(500);
  check('one tap on Use the new time only asks (a second tap is needed)', await p.evaluate(() => !!document.querySelector('[role="alertdialog"], [role="dialog"]') && !!SB.store.status().clockSuspect));
  check('the question has Keep the old time as the other choice', /Keep the old time/.test(await p.evaluate(() => (document.querySelector('[role="alertdialog"], [role="dialog"]') || { innerText: '' }).innerText)));
  await p.click('[role="alertdialog"] button:has-text("Keep the old time"), [role="dialog"] button:has-text("Keep the old time")'); await p.waitForTimeout(1600);
  check('Keep the old time leaves the old time and hides the notice for a while', await p.evaluate(() => !!SB.store.status().clockSuspect && !!document.querySelector('.fl-bar-clock') && document.querySelector('.fl-bar-clock').hidden));
  await p.evaluate(() => { SB.floor.unmount(); });
  await ctx.close();
  // Use the new time, end to end (a fresh page)
  const ctx2 = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  const q = await ctx2.newPage();
  q.on('pageerror', (e) => errs.push(String(e)));
  await q.goto(URL0); await q.waitForFunction(() => window.SB && SB.booted === true);
  await q.evaluate(`SB.floor.setWelcome(false);`);
  await q.evaluate(() => { const real = Date.now.bind(Date); Date.now = () => real() + 3 * 86400e3; });
  await q.waitForSelector('.fl-bar-clock:not([hidden])', { timeout: 8000 });
  await q.click('.fl-bar-clock [data-act="clock-use"]'); await q.waitForSelector('[role="alertdialog"], [role="dialog"]');
  await q.click('[role="alertdialog"] button:has-text("Use the new time"), [role="dialog"] button:has-text("Use the new time")'); await q.waitForTimeout(800);
  check('Use the new time accepts it: the hold ends, the notice goes and the time is the tablet\'s', await q.evaluate(() => !SB.store.status().clockSuspect && document.querySelector('.fl-bar-clock').hidden && Math.abs(SB.store.now() - Date.now()) < 5000), await q.evaluate(() => [SB.store.status().clockSuspect, SB.store.now() - Date.now()]));
  await ctx2.close();
}

// 4. Reopening a paid order of a closed day
{
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto(URL0); await p.waitForFunction(() => window.SB && SB.booted === true);
  const made = await p.evaluate(`SB.floor.setWelcome(false); ${addDish} const r = SB.store.dispatchEx('createTicket', { customer: 'Paid Pam', channel: 'dine_in', items: [{ menuId: SB.store.getState().menu[0].id, qty: 1 }], note: '', rush: false, pay: { method: 'cash' } }, { source: 'ui' }); const t = SB.store.getState().tickets[0]; SB.store.dispatchEx('completeItem', { ticketId: t.id, itemId: t.items[0].id }, { source: 'ui' }); SB.store.dispatchEx('bumpTicket', { ticketId: t.id }, { source: 'ui' }); const c = SB.store.dispatchEx('closeDay', { leftovers: 'keep' }, { source: 'ui' }); [r.report, c.report, SB.store.getState().orders.map((o) => o.status).join()]`);
  console.log('  note  setup: ' + JSON.stringify(made));
  await p.evaluate(() => SB.sheets.open('orders')); await p.waitForTimeout(600);
  await p.click('.seg-opt[data-id="paid"], button:has-text("Paid today")').catch(() => {}); await p.waitForTimeout(400);
  const reopen = p.locator('[data-act="reopen"], button:has-text("Reopen")').first();
  check('the paid order shows with a Reopen button', (await reopen.count()) > 0);
  if (await reopen.count()) {
    await reopen.click({ force: true }); await p.waitForTimeout(600);
    const toast = await p.evaluate(() => [...document.querySelectorAll('.toast')].map((e) => e.innerText).join(' | '));
    check('refused with the plain reason: the day is closed, it would count twice, what to do', /already closed/.test(toast) && /count twice/.test(toast) && /correction/.test(toast), toast);
    check('the order stays paid', await p.evaluate(() => SB.store.getState().orders.every((o) => o.status === 'paid')));
    await p.screenshot({ path: SHOTS + '/reopen-refused-1024.png' });
  }
  await ctx.close();
}

// 5. The clock notice at 390 and in Night and Large text, with a toast up; the closed-day Reopen button on a phone; the clock question on an office page
for (const [label, w, h, theme, size] of [['1024 day', 1024, 768, 'day', 'normal'], ['390 day', 390, 844, 'day', 'normal'], ['390 night large', 390, 844, 'night', 'large']]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(String(e)));
  await p.addInitScript(`(() => { try { localStorage.setItem('smokebox.v1.theme', JSON.stringify('${theme}')); localStorage.setItem('smokebox.v1.textsize', JSON.stringify('${size}')); } catch (e) {} })();`);
  await p.goto(URL0); await p.waitForFunction(() => window.SB && SB.booted === true);
  await p.evaluate(`SB.floor.setWelcome(false); ${addDish}`);
  await p.evaluate(() => { const real = Date.now.bind(Date); Date.now = () => real() + 3 * 86400e3; });
  await p.waitForSelector('.fl-bar-clock:not([hidden])', { timeout: 8000 });
  await p.evaluate(() => SB.ui.toast('Order saved. Tap Undo to take it back.', { tone: 'info', ms: 20000, undo: () => {} }));
  await p.waitForTimeout(1500);
  const g = await p.evaluate(() => {
    const r = (e) => { const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; };
    const bs = [...document.querySelectorAll('.fl-bar-clock button')].map(r), ts = [...document.querySelectorAll('.toast')].map(r);
    const hit = bs.some((a) => ts.some((t) => a.l < t.r && t.l < a.r && a.t < t.b && t.t < a.b));
    const bar = document.querySelector('.fl-bar-clock');
    return { hit, nb: bs.length, nt: ts.length, over: document.documentElement.scrollWidth > innerWidth + 1, barH: Math.round(bar.getBoundingClientRect().height), clipped: [...bar.querySelectorAll('button')].some((e) => e.getBoundingClientRect().right > innerWidth + 1) };
  });
  check('clock notice ' + label + ': a toast never covers its buttons', g.nb === 2 && g.nt > 0 && !g.hit, g);
  check('clock notice ' + label + ': the sound bar waits behind it (one notice at a time)', await p.evaluate(() => { const e = document.querySelector('.fl-bar-sound'); return !e || e.hidden; }));
  check('clock notice ' + label + ': buttons inside the screen, no sideways scroll', !g.clipped && !g.over, g);
  await p.screenshot({ path: SHOTS + '/clock-notice-' + label.replace(/ /g, '-') + '.png' });
  await ctx.close();
}
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto(URL0); await p.waitForFunction(() => window.SB && SB.booted === true);
  await p.evaluate(`SB.floor.setWelcome(false); ${addDish} SB.store.dispatchEx('createTicket', { customer: 'Paid Pam', channel: 'dine_in', items: [{ menuId: SB.store.getState().menu[0].id, qty: 1 }], note: '', rush: false, pay: { method: 'cash' } }, { source: 'ui' }); SB.store.dispatchEx('closeDay', {}, { source: 'ui' });`);
  await p.evaluate(() => SB.sheets.open('orders')); await p.waitForTimeout(600);
  await p.click('.seg-opt[data-id="paid"], button:has-text("Paid today")').catch(() => {}); await p.waitForTimeout(400);
  const rb = p.locator('[data-act="reopen"]').first();
  if (await rb.count()) {
    const lab = await rb.innerText();
    check('closed day: the Reopen button says so before the tap', /Closed day: cannot reopen/.test(lab), lab);
    const bx = await rb.boundingBox();
    check('closed day button fits the phone and is at least 44 px tall', !!bx && bx.x >= 0 && bx.x + bx.width <= 391 && bx.height >= 44, bx);
    await rb.click({ force: true }); await p.waitForTimeout(500);
    const toast = await p.evaluate(() => [...document.querySelectorAll('.toast')].map((e) => ({ t: e.innerText, r: e.getBoundingClientRect().right, l: e.getBoundingClientRect().left })));
    check('a tap gives the plain reason on a phone, inside the screen', toast.length > 0 && /already closed/.test(toast[0].t) && toast[0].l >= 0 && toast[0].r <= 391, toast);
    await p.screenshot({ path: SHOTS + '/reopen-refused-390.png' });
  } else check('closed day: a Reopen button exists to test', false);
  await ctx.close();
}
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto(URL0); await p.waitForFunction(() => window.SB && SB.booted === true);
  await p.evaluate(`SB.floor.setWelcome(false);`);
  await p.evaluate(() => SB.shell.ignite({ section: 'data' })); await p.waitForTimeout(1500);
  await p.evaluate(() => { const real = Date.now.bind(Date); Date.now = () => real() + 3 * 86400e3; });
  await p.waitForSelector('.sb-banner[data-kind="clock"]', { timeout: 12000 }).catch(() => {});
  const c = await p.evaluate(() => {
    const b = document.querySelector('.sb-banner[data-kind="clock"]');
    if (!b) return null;
    const br = b.getBoundingClientRect(), lay = document.querySelector('.sb-shell > .layer');
    return { h: Math.round(br.height), layerTop: lay ? Math.round(lay.getBoundingClientRect().top) : -1, dialog: !!document.querySelector('[role="alertdialog"], [role="dialog"]'), btn: [...b.querySelectorAll('button')].map((e) => e.textContent.trim() || e.title) };
  });
  check('office page: a slim strip asks about the clock, with no box over the page', !!c && !c.dialog && c.h <= 90, c);
  check('office page: the page starts below the strip (its actions are not covered)', !!c && c.layerTop >= c.h - 1, c);
  await p.screenshot({ path: SHOTS + '/clock-office-390.png' });
  if (c) {
    await p.click('.sb-banner[data-kind="clock"] button:has-text("Use the new time")'); await p.waitForTimeout(600);
    check('office page: Use the new time accepts it and the strip goes', await p.evaluate(() => !SB.store.status().clockSuspect && !document.querySelector('.sb-banner[data-kind="clock"]')));
  }
  await ctx.close();
}

// 6. Tab names read "1 ticket", never "1 tickets"
{
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto(URL0); await p.waitForFunction(() => window.SB && SB.booted === true);
  await p.evaluate(`SB.floor.setWelcome(false); ${addDish} SB.store.dispatchEx('createTicket', { customer: 'T1', channel: 'dine_in', items: [{ menuId: SB.store.getState().menu[0].id, qty: 1 }], note: '', rush: false }, { source: 'ui' });`);
  await p.waitForTimeout(1500);
  const one = await p.evaluate(() => document.querySelector('.fl-tabs [data-id="all"]').textContent.replace(/\s+/g, ' '));
  check('one ticket: the All tab reads "1 ticket" and never "1 tickets"', /1\D*ticket$/.test(one.trim()), one);
  await p.evaluate(`SB.store.dispatchEx('createTicket', { customer: 'T2', channel: 'dine_in', items: [{ menuId: SB.store.getState().menu[0].id, qty: 1 }], note: '', rush: false }, { source: 'ui' });`);
  await p.waitForTimeout(1500);
  const two = await p.evaluate(() => document.querySelector('.fl-tabs [data-id="all"]').textContent.replace(/\s+/g, ' '));
  check('two tickets: the All tab reads "2 tickets"', /2\D*tickets$/.test(two.trim()), two);
  await ctx.close();
}
check('no uncaught page errors', errs.length === 0, errs.slice(0, 3));
await browser.close();
console.log(fail ? fail + ' check(s) failed' : 'all checks passed');
process.exit(fail ? 1 : 0);
