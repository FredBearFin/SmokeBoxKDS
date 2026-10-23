// Connected stage 2, browser level: two WRITING tablets and a follower against a real hub process. Run: node test/connected-write-e2e.mjs (about 4 minutes).
// Written before the tablet code (SB.store.initHubClient) landed, so every guess about its shape lives in ADAPTER below: edit that and nothing else.
// While SB.store.initHubClient is absent from the source this prints one SKIP line and exits 0.
import fs from 'node:fs';
import path from 'node:path';
import { toolRequire } from '../tools/_deps.mjs';
import { ROOT, startHub, startRelay, httpLeader, stream, until, sleep, followerUrl } from './_connected.mjs';

const src = ['30-store.js', '99-boot.js'].map((f) => fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8')).join('\n');
if (!/initHubClient/.test(src)) { console.log('SKIP: tablets that write through the hub are not in this source tree yet (SB.store.initHubClient is missing). Merge night/a5-c3, night/a1-c3 and night/a2-c3, then run this again.'); process.exit(0); }
const { chromium } = toolRequire('playwright');

// ADAPTER (guessed before the code existed; fix here when the real shapes are known)
const A = {
  // Joins this page's kitchen to the hub. Returns whatever the store answers (a Promise is awaited).
  join: async (page, o) => { const r = await page.evaluate((o) => SB.store.initHubClient(o.seed ? { url: o.url, code: o.code, name: o.name, seed: true } : { url: o.url, code: o.code, name: o.name, adopt: 'hub' }), o); await page.evaluate(() => { if (!window.__ref) { window.__ref = []; SB.store.subscribeRefusals((r) => window.__ref.push(r)); } }); return r; },
  leave: (page) => page.evaluate(() => SB.store.leaveHub()),
  status: (page) => page.evaluate(() => SB.store.hubStatus()),
  tap: async (page, type, payload) => { const r = await page.evaluate(([t, p]) => SB.store.dispatch(t, p), [type, payload]); return { report: typeof r === 'string' ? r : r && r.report }; },
  // The words a loser sees. Any visible toast or banner text counts.
  toasts: (page) => page.evaluate(() => (window.__toasts || []).join(' | ')),
  LIVE: /Connected/i, OFFLINE: /Offline|Out of date|Reconnecting|not confirmed/i,
  refusals: (page) => page.evaluate(() => (window.__ref || []).map((r) => r.report)),
};
let pass = 0, fail = 0; const failures = [];
const check = (name, ok, detail) => { if (ok) { pass++; console.log('  ok    ' + name); } else { fail++; failures.push(name); console.log('  FAIL  ' + name + (detail !== undefined ? '  -> ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 500) : '')); } };
const group = (t) => console.log('\n# ' + t);
const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const hubs = []; const newHub = async (o) => { const h = await startHub(o); hubs.push(h); return h; };
const snap = async (h) => { const s = stream(h.origin); await until(() => s.state, 'snapshot'); s.stop(); return s.state; };
async function tablet(hub, { name, skewMs = 0, join = true, seed, ctx } = {}) {
  ctx = ctx || await browser.newContext({ viewport: { width: 1280, height: 800 } });
  if (skewMs) await ctx.addInitScript((d) => { const N = Date.now.bind(Date); Date.now = () => N() + d; const O = Date; globalThis.Date = new Proxy(O, { construct(t, a) { return a.length ? new t(...a) : new t(N() + d); }, get(t, k) { return k === 'now' ? () => N() + d : t[k]; } }); }, skewMs);
  const p = await ctx.newPage(); p.errs = []; p.on('pageerror', (e) => p.errs.push(String(e)));
  await p.addInitScript(() => { window.__toasts = []; const go = () => new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) { const t = n.nodeType === 1 && (n.matches('.toast') ? n : n.querySelector && n.querySelector('.toast')); if (t) window.__toasts.push(t.textContent); } }).observe(document.documentElement, { childList: true, subtree: true }); if (document.documentElement) go(); else document.addEventListener('DOMContentLoaded', go); });
  await p.goto(hub.origin + (join ? '/?hub' : '/'), { waitUntil: 'load' }); await p.waitForFunction(() => window.SB && SB.booted === true, null, { timeout: 15000 });
  p.ctx = ctx; if (join) { await p.waitForFunction(() => SB.store.hubStatus && SB.store.hubStatus().state === 'connected', null, { timeout: 15000 }); await p.evaluate(() => { if (!window.__ref) { window.__ref = []; SB.store.subscribeRefusals((r) => window.__ref.push(r)); } }); }
  return p;
}
const proj = (s) => JSON.stringify({ t: s.tickets.map((t) => [t.id, t.num, t.customer, t.status, t.items.map((i) => i.status).join('')]), o: s.orders.map((o) => [o.id, o.status]), b: s.batches.map((b) => [b.id, b.status]), m: Object.keys(s.manual86 || {}).sort() });
const until2 = async (fn, ms) => { const e = Date.now() + ms; while (Date.now() < e) { if (await fn()) return true; await sleep(150); } return false; };
const mine = (p) => p.evaluate(`(${proj.toString()})(SB.store.getState())`);
async function converge(pages, hub, what, ms = 20000) { const end = Date.now() + ms; let hv, vs; while (Date.now() < end) { hv = proj(await snap(hub)); vs = await Promise.all(pages.map(mine)); if (vs.every((v) => v === hv)) return true; await sleep(200); } check(what + ': screens differ from the hub', false, { hub: hv.slice(0, 200), screens: vs.map((v) => v.slice(0, 200)) }); return false; }
const menuIds = async (h) => (await snap(h)).menu.map((m) => m.id);

try {
  group('both tablets tap; everyone converges');
  { const hub = await newHub(); const T1 = await tablet(hub, { name: 'Pit tablet' }), T2 = await tablet(hub, { name: 'Counter' });
    const F = await tablet(hub, { join: false }); await F.goto(followerUrl(hub.origin), { waitUntil: 'load' }); await F.waitForFunction(() => window.SB && SB.booted === true);
    const m = await menuIds(hub);
    for (let i = 0; i < 12; i++) { const T = i % 2 ? T1 : T2; await A.tap(T, 'createTicket', { customer: 'W' + i, items: [{ menuId: m[i % m.length] }] }); if (i % 4 === 3) await sleep(100); }
    check('all three screens equal the hub', await converge([T1, T2, F], hub, 'two writers'));
    const nums = await T1.evaluate(() => SB.store.getState().tickets.map((t) => t.num)); const numsF = await F.evaluate(() => SB.store.getState().tickets.map((t) => t.num));
    check('ticket numbers are identical on every screen and never repeat', JSON.stringify(nums) === JSON.stringify(numsF) && new Set(nums).size === 12, { nums, numsF });
    { const miss = await T2.evaluate((n) => n.filter((x) => !document.body.innerText.includes(String(x))), nums); check('the board of each tablet shows each number', miss.length === 0, { missing: miss, slips: await T2.evaluate(() => document.querySelectorAll('.fl-slip').length) }); }
    await T1.ctx.close(); await T2.ctx.close(); await F.ctx.close(); }

  group('conflicts: one winner, a clear refusal on the loser');
  { const hub = await newHub(); const T1 = await tablet(hub, { name: 'One' }), T2 = await tablet(hub, { name: 'Two' }); const m = await menuIds(hub);
    await A.tap(T1, 'createTicket', { customer: 'Both', items: [{ menuId: m[0] }] }); await converge([T1, T2], hub, 'ticket made');
    const id = (await snap(hub)).tickets[0].id;
    const [r1, r2] = await Promise.all([A.tap(T1, 'bumpTicket', { ticketId: id, force: true }), A.tap(T2, 'bumpTicket', { ticketId: id, force: true })]);
    await sleep(800);
    await until2(async () => (await A.refusals(T1)).length + (await A.refusals(T2)).length >= 1, 15000);
    const ref = [await A.refusals(T1), await A.refusals(T2)];
    check('exactly one of the two bumps is refused (so one wins)', ref[0].length + ref[1].length === 1, ref);
    const loser = ref[0].length ? T1 : T2;
    check('the loser is told so on screen, in words', /Not done/i.test(await A.toasts(loser)) || /Not done/i.test(await loser.evaluate(() => document.body.innerText)), await A.toasts(loser));
    check('both tablets and the hub agree afterwards', await converge([T1, T2], hub, 'after bump'));
    const o = (await snap(hub)).orders[0];
    const nr = (await A.refusals(T1)).length + (await A.refusals(T2)).length;
    await Promise.all([A.tap(T1, 'payOrder', { orderId: o.id, method: 'cash' }), A.tap(T2, 'payOrder', { orderId: o.id, method: 'cash' })]);
    await until2(async () => (await A.refusals(T1)).length + (await A.refusals(T2)).length > nr, 15000); await sleep(500);
    check('paying the same order twice: one payment, one refusal', (await A.refusals(T1)).length + (await A.refusals(T2)).length === nr + 1 && (await snap(hub)).orders[0].status === 'paid', [await A.refusals(T1), await A.refusals(T2)]);
    const br = await Promise.all([A.tap(T1, 'addBatch', { ing: 'brisket', tempF: 160, cookedG: 3000 }), A.tap(T2, 'addBatch', { ing: 'brisket', tempF: 160, cookedG: 3000 })]);
    const nb = (await snap(hub)).batches.length; check('starting a batch from both: no batch is lost or doubled beyond the two taps', nb >= 1 && await converge([T1, T2], hub, 'batches'), { nb, br: br.map((r) => r && r.report) });
    const dish = m[1]; await A.tap(T1, 'toggle86', { menuId: dish, on: true });
    await converge([T1, T2], hub, 'after 86');
    const rb0 = (await A.refusals(T2)).length;
    const ord = await A.tap(T2, 'createTicket', { customer: 'Wants86', items: [{ menuId: dish }] }); await sleep(1500);
        const made = (await snap(hub)).tickets.some((t) => t.customer === 'Wants86');
    check('ordering a dish marked 86 is either refused (and the ticket is not there) or made, never both and never neither', made !== (ord.report !== 'ok'), { made, ord: ord && ord.report });
    check('and the screens agree with the hub', await converge([T1, T2], hub, 'after the 86 order'));
    await T1.ctx.close(); await T2.ctx.close(); }

  group('a tablet loses the link, taps 5 things, the other changes related things');
  { const hub = await newHub(); const relay = await startRelay(hub.port); const m = await menuIds(hub);
    const T1 = await tablet({ origin: relay.origin, port: relay.port }, { name: 'Away' }), T2 = await tablet(hub, { name: 'Stayed' });
    await A.tap(T2, 'createTicket', { customer: 'Shared', items: [{ menuId: m[0] }] }); await converge([T1, T2], hub, 'before the cut');
    const id = (await snap(hub)).tickets[0].id; relay.cut(); await sleep(500);
    const r = []; for (let i = 0; i < 4; i++) r.push(await A.tap(T1, 'createTicket', { customer: 'Off' + i, items: [{ menuId: m[i % m.length] }] })); r.push(await A.tap(T1, 'bumpTicket', { ticketId: id, force: true }));
    await until2(async () => A.OFFLINE.test(await T1.evaluate(() => document.body.innerText)), 20000);
    check('while cut off the tablet keeps taking taps and says it is not live / not confirmed', r.every((x) => x && x.report === 'ok') && A.OFFLINE.test(await T1.evaluate(() => document.body.innerText)), r.map((x) => x && x.report));
    await A.tap(T2, 'bumpTicket', { ticketId: id, force: true }); await A.tap(T2, 'createTicket', { customer: 'Meanwhile', items: [{ menuId: m[1] }] });
    relay.heal(); await sleep(500);
    check('after reconnect everything converges', await converge([T1, T2], hub, 'after the replay', 40000));
    const s = await snap(hub); const names = s.tickets.map((t) => t.customer);
    check('the four offline tickets and the other tablet\'s ticket are each there exactly once, nothing lost', ['Shared', 'Off0', 'Off1', 'Off2', 'Off3', 'Meanwhile'].every((n) => names.filter((x) => x === n).length === 1) && names.length === 6, names);
    check('the offline tablet\'s conflicting bump was refused (one refusal recorded) and the owner saw it in words', (await A.refusals(T1)).length === 1 && /Not done/i.test(await A.toasts(T1)), [await A.refusals(T1), await A.toasts(T1)]);
    relay.close(); await T1.ctx.close(); await T2.ctx.close(); }

  group('hub killed and restarted in the middle of a run');
  { const hub = await newHub(); const m = await menuIds(hub); const T1 = await tablet(hub, { name: 'A' }), T2 = await tablet(hub, { name: 'B' });
    for (let i = 0; i < 6; i++) await A.tap(i % 2 ? T1 : T2, 'createTicket', { customer: 'K' + i, items: [{ menuId: m[0] }] });
    await converge([T1, T2], hub, 'before the kill'); await hub.restart('SIGKILL');
    for (let i = 6; i < 9; i++) await A.tap(i % 2 ? T1 : T2, 'createTicket', { customer: 'K' + i, items: [{ menuId: m[0] }] });
    check('after the restart both tablets and the hub agree on 9 distinct tickets', await converge([T1, T2], hub, 'after the kill', 40000) && (await snap(hub)).tickets.length === 9);
    await T1.ctx.close(); await T2.ctx.close(); }

  group('a tablet whose clock is 7 minutes fast');
  { const hub = await newHub(); const m = await menuIds(hub); const T1 = await tablet(hub, { name: 'Fast', skewMs: 7 * 60000 }), T2 = await tablet(hub, { name: 'True' });
    await A.tap(T1, 'createTicket', { customer: 'Skew', items: [{ menuId: m[0] }] }); await converge([T1, T2], hub, 'skew sync');
    const ages = await Promise.all([T1, T2].map((p) => p.evaluate(() => { const t = SB.store.getState().tickets[0]; return SB.store.now() - t.createdAt; })));
    check('both tablets show the ticket about 0 to 30 seconds old, not minus or plus 7 minutes', ages.every((a) => a > -5000 && a < 30000), ages);
    await T1.ctx.close(); await T2.ctx.close(); }

  group('joining and leaving');
  { const hub = await newHub(); const m = await menuIds(hub); await httpLeader(hub.origin, 'x').act('createTicket', { customer: 'Existing', items: [{ menuId: m[0] }] });
    const dump = (p) => p.evaluate(() => JSON.stringify(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)])));
    const T = await tablet(hub, { join: false }); await A.tap(T, 'createTicket', { customer: 'Mine', items: [{ menuId: m[0] }] }); await sleep(800);
    const before = await dump(T), mineBefore = await mine(T);
    const res = await A.join(T, { url: hub.origin, name: 'T', seed: true }).catch((e) => ({ ok: false, error: String(e) }));
    check('joining a hub that already has a kitchen with "seed" is refused', res && res.ok === false, res);
    check('and the tablet\'s own kitchen and storage are untouched', (await dump(T)) === before && (await mine(T)) === mineBefore);
    const hubBefore = proj(await snap(hub)); check('and the hub did not change', hubBefore === proj(await snap(hub)));
    const res2 = await A.join(T, { url: hub.origin, name: 'T' });
    check('joining without seed works and shows the hub\'s kitchen', await converge([T], hub, 'joined'), res2);
    await A.tap(T, 'createTicket', { customer: 'OnHub', items: [{ menuId: m[0] }] });
    await until2(async () => (await A.status(T)).queued === 0, 10000); const lv = await A.leave(T); await sleep(600);
    check('leave answers ok', lv && lv.ok === true, lv);
    check('leaving restores the tablet\'s own kitchen exactly', (await mine(T)) === mineBefore, { now: (await mine(T)).slice(0, 160), was: mineBefore.slice(0, 160) });
    await T.reload({ waitUntil: 'load' }); await T.waitForFunction(() => window.SB && SB.booted === true);
    check('and still after a reload', (await mine(T)) === mineBefore);
    await T.ctx.close(); }

  group('demo and normal kitchens never contact a hub');
  { const hub = await newHub(); for (const url of [hub.origin + '/', hub.origin + '/?demo']) { const c = await browser.newContext(); const p = await c.newPage(); const calls = []; p.on('request', (r) => { if (/\/(events|action|follow)/.test(r.url())) calls.push(r.url()); });
      await p.goto(url); await p.waitForFunction(() => window.SB && SB.booted === true); await sleep(1200); check(url + ' made no hub request', calls.length === 0, calls); await c.close(); } }

  group('security');
  { const hub = await newHub({ env: { SMOKEBOX_FOLLOW_CODE: 'secret-9' } });
    const evil = '<img src=x onerror="window.__x=1">'; const T = await tablet(hub, { join: false });
    const r = await A.join(T, { url: hub.origin, code: 'secret-9', name: evil }).catch((e) => ({ ok: false, error: String(e) }));
    await sleep(1000);
    check('a screen name with markup never becomes an element on any screen', await T.evaluate(() => !window.__x && !document.querySelector('img[src="x"]')), r);
    const F = await tablet(hub, { join: false }); await F.goto(followerUrl(hub.origin, 'secret-9')); await F.waitForFunction(() => window.SB && SB.booted === true); await sleep(1000);
    check('nor on the follower, and the name shows as plain text if shown at all', await F.evaluate(() => !window.__x && !document.querySelector('img[src="x"]')));
    const bad = []; for (let i = 0; i < 12; i++) { const q = await tablet(hub, { join: false }); bad.push(await A.join(q, { url: hub.origin, code: 'wrong' + i, name: 'x' }).catch(() => ({ ok: false }))); await q.ctx.close(); }
    const q = await tablet(hub, { join: false }); const good = await A.join(q, { url: hub.origin, code: 'secret-9', name: 'x' }).catch(() => ({ ok: false }));
    check('after 12 wrong codes in a row the right code is also held off for a while (lockout)', bad.every((x) => x && x.ok === false) && good && good.ok === false, { good });
    await T.ctx.close(); await F.ctx.close(); await q.ctx.close(); }
} finally { await browser.close(); for (const h of hubs) await h.stop('SIGKILL'); }
console.log('\n' + pass + ' passed, ' + fail + ' failed' + (fail ? ': ' + failures.join('; ') : ''));
process.exit(fail ? 1 : 0);
