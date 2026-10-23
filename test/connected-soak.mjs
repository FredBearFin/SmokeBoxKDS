// Multi-tablet soak and chaos: a real hub, 3 writing tablets and 1 follower in Chromium, random realistic taps for a while, with a relay cutting each
// screen's link at random, the hub killed (SIGKILL) and restarted twice, one tablet reloaded mid-service and one tablet whose clock is 7 minutes fast.
// Usage: SMOKEBOX_TOOLS=$(npm root -g) node test/connected-soak.mjs [--minutes=3] [--seed=N] [--tablets=3] [--rate=2] [--keep]
//   minutes: 3 is the quick run; 10 or more is the real soak.  seed: the random numbers for taps and chaos (printed, so a failure can be replayed; the
//   timing of a browser and a hub is not exactly repeatable, so a replay is close, not identical).  rate: taps per second per tablet.
// Checks at every checkpoint and at the end: every screen equals the hub; the engine's invariants hold on the hub state; each created ticket exists exactly once
// or was reported refused (no duplicate, no silent loss); every opId in the hub's record is unique; ticket numbers are unique and identical everywhere; no page
// errors; the hub's memory and files are measured at start and end. Exit 0 only if every check passed.
import fs from 'node:fs';
import { toolRequire } from '../tools/_deps.mjs';
import { startHub, startRelay, stream, until, sleep } from './_connected.mjs';
import { loadSB } from './_load.mjs';

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const MINUTES = Number(arg('minutes', 3)), SEED = Number(arg('seed', Math.floor(Math.random() * 1e9))), NT = Number(arg('tablets', 3)), RATE = Number(arg('rate', 2));
const DURATION = MINUTES * 60000;
console.log(`soak: ${MINUTES} min, seed ${SEED}, ${NT} tablets + 1 follower, ${RATE} taps/s per tablet   (replay: node test/connected-soak.mjs --minutes=${MINUTES} --seed=${SEED} --tablets=${NT} --rate=${RATE})`);
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const R = rng(SEED);
const { chromium } = toolRequire('playwright');
const SBn = await loadSB(['00-util', '10-config', '20-engine']); const E = SBn.engine;

let pass = 0, fail = 0; const failures = [];
const check = (n, ok, d) => { if (ok) pass++; else { fail++; failures.push(n); } console.log((ok ? '  ok    ' : '  FAIL  ') + n + (ok ? '' : '  -> ' + String(JSON.stringify(d)).slice(0, 600))); };
const rss = (pid) => { try { return Math.round(Number(/VmRSS:\s+(\d+)/.exec(fs.readFileSync(`/proc/${pid}/status`, 'utf8'))[1]) / 1024); } catch (e) { return -1; } };
const size = (f) => { try { return fs.statSync(f).size; } catch (e) { return 0; } };
const measure = (h, label) => { const m = { label, rssMb: rss(h.pid), stateKb: Math.round(size(h.file) / 1024), walKb: Math.round(size(h.file + '.wal') / 1024) }; console.log('  size  ' + JSON.stringify(m)); return m; };

const hub = await startHub(); const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const snap = async () => { const s = stream(hub.origin); await until(() => s.state, 'hub snapshot', 15000); s.stop(); return s.state; };
// What a screen shows, reduced to what must match.
const PROJ = (s) => JSON.stringify({ t: s.tickets.map((t) => [t.id, t.num, t.customer, t.status, t.items.map((i) => i.id + i.status).join(',')]), o: s.orders.map((o) => [o.id, o.status]), b: s.batches.map((b) => [b.id, b.status, b.lastTempF]), m: Object.keys(s.manual86 || {}).sort() });
const proj = (p) => p.evaluate(`(${PROJ.toString()})(SB.store.getState())`);

const screens = [];
async function open(i, { follower = false, skewMs = 0 } = {}) {
  const relay = await startRelay(hub.port);
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  if (skewMs) await ctx.addInitScript((d) => { const N = Date.now.bind(Date); const O = Date; globalThis.Date = new Proxy(O, { construct(t, a) { return a.length ? new t(...a) : new t(N() + d); }, get(t, k) { return k === 'now' ? () => N() + d : t[k]; } }); }, skewMs);
  const page = await ctx.newPage(); page.errs = [];
  page.on('pageerror', (e) => page.errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)|ERR_|Failed to load resource|net::/.test(m.text())) page.errs.push(m.text()); });
  const sc = { i, tag: follower ? 'F' : String.fromCharCode(65 + i), follower, relay, ctx, page, skewMs, creates: [], taps: 0, ok: 0, local: {}, n: 0, mode: 'hub' };
  await load(sc); screens.push(sc); return sc;
}
async function load(sc) {
  await sc.page.goto(sc.relay.origin + (sc.follower ? '/?follow' : '/?hub'), { waitUntil: 'load' });
  await sc.page.waitForFunction(() => window.SB && SB.booted === true, null, { timeout: 30000 });
  if (!sc.follower) await sc.page.evaluate(() => { if (!window.__sub) { window.__sub = 1; SB.store.subscribeRefusals((r) => { try { const l = JSON.parse(sessionStorage.getItem('__ref') || '[]'); l.push({ type: r.type, report: r.report, customer: r.payload && r.payload.customer, opId: r.opId }); sessionStorage.setItem('__ref', JSON.stringify(l)); } catch (e) { /* ignore */ } }); } });
}
const STEP = (a) => {
  const S = SB.store.getState(); if (!S || !S.tickets) return null;
  const pick = (arr, x) => arr[Math.floor(x * arr.length)];
  const act = S.tickets.filter((t) => t.status === 'active'), r = a.r, k = r[0], off = S.manual86 || {};
  let type, payload, customer = null;
  const menu = S.menu.filter((m) => !off[m.id]);
  if ((k < 0.24 || !act.length) && menu.length) { type = 'createTicket'; customer = a.tag + '-' + a.n; const n = 1 + Math.floor(r[1] * 3); payload = { customer, items: Array.from({ length: n }, (_, i) => ({ menuId: pick(menu, (r[2] + i * 0.37) % 1).id })) }; }
  else if (k < 0.5 && act.length) { const t = pick(act, r[1]); const open = t.items.filter((i) => i.status !== 'done'); if (!open.length) { type = 'bumpTicket'; payload = { ticketId: t.id, force: true }; } else { const it = pick(open, r[2]); type = r[3] < 0.5 ? 'advanceItem' : 'completeItem'; payload = { ticketId: t.id, itemId: it.id }; } }
  else if (k < 0.58 && act.length) { type = 'bumpTicket'; payload = { ticketId: pick(act, r[1]).id, force: true }; }
  else if (k < 0.68) { const os = S.orders.filter((o) => o.status === 'open'); if (os.length) { type = 'payOrder'; payload = { orderId: pick(os, r[1]).id, method: 'cash' }; } else { type = 'advanceItem'; payload = { ticketId: 'none', itemId: 'none' }; } }
  else if (k < 0.72) { type = 'addBatch'; payload = { ing: 'brisket', tempF: 160, cookedG: 2000 + Math.floor(r[1] * 2000) }; }
  else if (k < 0.77 && S.batches.length) { type = 'logTemp'; payload = { batchId: pick(S.batches, r[1]).id, tempF: pick([120, 140, 150, 165], r[2]) }; }
  else if (k < 0.8) { type = 'pullBatch'; payload = { ing: 'brisket', g: 100 + Math.floor(r[1] * 200) }; }
  else if (k < 0.85 && S.menu.length) { const m = pick(S.menu, r[1]); type = 'toggle86'; payload = { menuId: m.id, on: !off[m.id] }; }
  else if (k < 0.9) { type = 'undo'; payload = {}; }
  else if (act.length) { const t = pick(act, r[1]); type = 'recallTicket'; payload = { ticketId: t.id }; }
  else return null;
  const res = SB.store.dispatch(type, payload);
  return { type, res: typeof res === 'string' ? res : res && res.report, customer };
};

// ---- the run
const state = { paused: false, stop: false, kills: 0, reloads: 0, cuts: 0 };
const sleepP = async (ms) => { const e = Date.now() + ms; while (Date.now() < e && !state.stop) await sleep(Math.min(200, e - Date.now() + 1)); };
const tablets = []; for (let i = 0; i < NT; i++) tablets.push(await open(i, { skewMs: i === NT - 1 ? 7 * 60000 : 0 }));
const follower = await open(NT, { follower: true });
for (const t of [...tablets]) await t.page.waitForFunction(() => SB.store.hubStatus().state === 'connected', null, { timeout: 30000 });
const m0 = measure(hub, 'start'); const series = [m0];
const t0 = Date.now(); let nextCheckpoint = t0 + Math.max(45000, DURATION / 4);

async function tapper(sc) {
  const rr = rng(SEED * 31 + sc.i + 1);
  while (!state.stop) {
    if (state.paused || sc.reloading) { await sleep(100); continue; }
    sc.n++;
    const a = { tag: sc.tag, n: sc.n, r: [rr(), rr(), rr(), rr()] };
    try {
      const out = await sc.page.evaluate(`(${STEP.toString()})(${JSON.stringify(a)})`);
      if (out) { sc.taps++; sc.local[out.res] = (sc.local[out.res] || 0) + 1; if (out.res === 'ok') sc.ok++; if (out.type === 'createTicket' && out.res === 'ok') sc.creates.push(out.customer); }
    } catch (e) { if (!sc.reloading && !state.stop) sc.err = String(e).slice(0, 200); }
    await sleep(Math.round(1000 / RATE * (0.5 + rr())));
  }
}
async function cutter(sc) {
  const rr = rng(SEED * 17 + sc.i + 7);
  while (!state.stop) {
    await sleepP(4000 + rr() * 16000); if (state.stop) break; if (state.paused) continue;
    sc.relay.cut(); state.cuts++; await sleepP(1500 + rr() * 12000); sc.relay.heal();
  }
  sc.relay.heal();
}
async function conductor() {
  const kill = [DURATION * 0.33, DURATION * 0.66]; let ki = 0, reloaded = false;
  while (!state.stop) {
    await sleep(500); const el = Date.now() - t0;
    if (ki < 2 && el >= kill[ki] && !state.paused) { ki++; state.kills++; console.log(`  chaos hub SIGKILL #${ki} at ${Math.round(el / 1000)} s`); await hub.stop('SIGKILL'); await sleep(2500); await hub.restart('SIGKILL').catch(() => {}); console.log('  chaos hub back'); }
    if (!reloaded && el >= DURATION * 0.5 && !state.paused) { reloaded = true; state.reloads++; const sc = tablets[1 % tablets.length]; sc.reloading = true; console.log(`  chaos reload tablet ${sc.tag}`); await sc.page.reload({ waitUntil: 'load' }).catch(() => {}); await load(sc).catch((e) => { sc.err = String(e); }); sc.reloading = false; }
  }
}

// ---- the check: wait for quiet, compare
async function settle(label) {
  state.paused = true; for (const s of screens) s.relay.heal();
  const end = Date.now() + 90000; let hv, vs, last = '';
  while (Date.now() < end) {
    await sleep(500);
    try {
      const st = await snap(); hv = PROJ(st);
      vs = await Promise.all(screens.map((s) => proj(s.page).catch(() => 'ERR')));
      const q = await Promise.all(tablets.map((s) => s.page.evaluate(() => SB.store.hubStatus().queued).catch(() => -1)));
      last = `queued ${q.join(',')}`;
      if (vs.every((v) => v === hv) && q.every((x) => x === 0)) return { ok: true, st };
    } catch (e) { last = String(e); }
  }
  return { ok: false, hv, vs, last };
}
async function verify(label, final) {
  console.log(`\n# ${label}`);
  const r = await settle(label);
  check(label + ': every screen equals the hub state', r.ok, r.ok ? null : { last: r.last, hub: (r.hv || '').slice(0, 120), screens: (r.vs || []).map((v) => String(v).slice(0, 120)) });
  const st = r.ok ? r.st : await snap();
  const inv = E.checkInvariants(st, st.events && st.events.length ? Date.now() : Date.now());
  check(label + ': engine invariants hold on the hub state', inv.length === 0, inv.slice(0, 5));
  const nums = st.tickets.map((t) => t.num); check(label + ': ticket numbers unique (' + nums.length + ' tickets)', new Set(nums).size === nums.length, nums.length);
  const ids = st.tickets.map((t) => t.id); check(label + ': ticket ids unique', new Set(ids).size === ids.length);
  // each ok-created ticket: exactly once on the hub, or reported refused by its screen
  const byName = new Map(); for (const t of st.tickets) byName.set(t.customer, (byName.get(t.customer) || 0) + 1);
  const dup = [], lost = [];
  for (const sc of tablets) {
    const refused = new Set(await sc.page.evaluate(() => JSON.parse(sessionStorage.getItem('__ref') || '[]').filter((x) => x.type === 'createTicket').map((x) => x.customer)).catch(() => []));
    for (const name of sc.creates) { const n = byName.get(name) || 0; if (n > 1) dup.push(name); else if (n === 0 && !refused.has(name)) lost.push(name); }
  }
  check(label + ': no created ticket appears twice', dup.length === 0, dup.slice(0, 5));
  check(label + ': no created ticket lost without a refusal (' + tablets.reduce((a, s) => a + s.creates.length, 0) + ' creates)', lost.length === 0, lost.slice(0, 8));
  // the hub's record: every opId once
  const wal = (fs.existsSync(hub.file + '.wal') ? fs.readFileSync(hub.file + '.wal', 'utf8') : '').split('\n').filter(Boolean); const seen = new Map(); let bad = 0, parsed = 0;
  for (const l of wal) { let o; try { o = JSON.parse(l); parsed++; } catch (e) { bad++; continue; } const id = o.opId; if (id) seen.set(id, (seen.get(id) || 0) + 1); }
  const dups = [...seen].filter(([, n]) => n > 1);
  check(label + ': every opId in the hub\'s record is there once (' + seen.size + ' ops in the record)', dups.length === 0, dups.slice(0, 5));
  if (final) check(label + ': the record has no unreadable line (a torn last line from a crash is the only allowed one)', bad <= 1, bad);
  const errs = screens.flatMap((s) => s.page.errs.map((e) => s.tag + ': ' + e)); check(label + ': no page errors', errs.length === 0, errs.slice(0, 3));
  const skew = tablets.find((s) => s.skewMs); if (skew && st.tickets.length) { const ages = await Promise.all(screens.map((s) => s.page.evaluate(() => { const ts = SB.store.getState().tickets; const t = ts[ts.length - 1]; return t ? SB.store.now() - t.createdAt : null; }).catch(() => null))); check(label + ': the tablet whose clock is 7 minutes fast shows times like the others (last ticket age ms ' + ages.join(',') + ')', ages.every((a) => a === null || Math.abs(a) < 120000), ages); }
  series.push(measure(hub, label)); state.paused = false; return st;
}

const workers = [...tablets.map(tapper), ...tablets.map(cutter), cutter(follower), conductor()];
while (Date.now() - t0 < DURATION) {
  await sleep(1000);
  if (Date.now() >= nextCheckpoint && Date.now() - t0 < DURATION - 20000) { await verify('checkpoint at ' + Math.round((Date.now() - t0) / 1000) + ' s', false); nextCheckpoint = Date.now() + Math.max(45000, DURATION / 4); }
}
state.stop = true; await Promise.allSettled(workers);
const final = await verify('final', true);
const m1 = series[series.length - 1];
console.log('\n# numbers');
console.log(`  taps ${tablets.map((s) => s.tag + ':' + s.taps + ' (' + JSON.stringify(s.local) + ')').join('  ')}`);
console.log(`  chaos: ${state.cuts} link cuts, ${state.kills} hub kills, ${state.reloads} reload; hub: ${final.tickets.length} tickets, ${final.batches.length} batches`);
console.log(`  hub start ${JSON.stringify(m0)}  end ${JSON.stringify(m1)}`);
check('the hub\'s memory did not grow without bound (end RSS under 3x start + 150 MB)', m1.rssMb < m0.rssMb * 3 + 150, [m0.rssMb, m1.rssMb]);
check('the hub\'s files stay modest (state under 40 MB, record under 100 MB)', m1.stateKb < 40000 && m1.walKb < 100000, m1);
const tabErr = tablets.filter((s) => s.err).map((s) => s.tag + ': ' + s.err); if (tabErr.length) console.log('  note  tap loop errors: ' + tabErr.join(' | '));
for (const s of screens) { try { s.relay.close(); await s.ctx.close(); } catch (e) { /* closed */ } }
await browser.close(); await hub.stop('SIGKILL');
console.log(`\nseed ${SEED}: ${pass} passed, ${fail} failed` + (fail ? ': ' + [...new Set(failures)].join('; ') : ''));
process.exit(fail ? 1 : 0);
