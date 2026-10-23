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
import os from 'node:os';
import path from 'node:path';
import { startHub, startRelay, stream, until, sleep, pairingCode, pairOver, listScreens, revokeScreen, ROOT } from './_connected.mjs';
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

const PAGE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sbsoak-')), 'smokebox.html'); fs.copyFileSync(path.join(ROOT, 'dist/smokebox.html'), PAGE);
const hub = await startHub({ env: { SMOKEBOX_HTML: PAGE } }); const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const snap = async () => { const s = stream(hub.origin); await until(() => s.state, 'hub snapshot', 15000); s.stop(); return s.state; };
// What a screen shows, reduced to what must match.
const PROJ = (s) => JSON.stringify({ t: s.tickets.map((t) => [t.id, t.num, t.customer, t.status, t.items.map((i) => i.id + i.status).join(',')]), o: s.orders.map((o) => [o.id, o.status]), b: s.batches.map((b) => [b.id, b.status, b.lastTempF]), m: Object.keys(s.manual86 || {}).sort() });
const proj = (p) => p.evaluate(`(${PROJ.toString()})(SB.store.getState())`);

const screens = [];
async function open(i, { follower = false, skewMs = 0, paired = false, trim = false } = {}) {
  const relay = await startRelay(hub.port);
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  if (skewMs) await ctx.addInitScript((d) => { const N = Date.now.bind(Date); const O = Date; globalThis.Date = new Proxy(O, { construct(t, a) { return a.length ? new t(...a) : new t(N() + d); }, get(t, k) { return k === 'now' ? () => N() + d : t[k]; } }); }, skewMs);
  const page = await ctx.newPage(); page.errs = [];
  page.on('pageerror', (e) => page.errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)|ERR_|Failed to load resource|net::/.test(m.text())) page.errs.push(m.text()); });
  const sc = { i, tag: follower ? 'F' : String.fromCharCode(65 + i), follower, relay, ctx, page, skewMs, creates: [], createsAfter: [], taps: 0, ok: 0, local: {}, n: 0, mode: 'hub', paired, trim, removed: false };
  if (paired) {   // paired with a one-time code: this screen has its own token and name, kept on the device like a real tablet's
    const r = await pairOver(relay.origin, pairingCode(hub), 'Paired tablet'); if (r.status !== 200) throw new Error('pairing failed: ' + JSON.stringify(r.body));
    sc.screenId = r.body.screen.id;
    await ctx.addInitScript(([u, t, id]) => { try { if (!localStorage.getItem('smokebox.v1.hubtoken')) localStorage.setItem('smokebox.v1.hubtoken', JSON.stringify({ v: 1, hubs: { [u]: { token: t, id, name: 'Paired tablet', owner: false } } })); } catch (e) { /* ignore */ } }, [relay.origin, r.body.token, sc.screenId]);
  }
  await load(sc); screens.push(sc); return sc;
}
const SUBSCRIBE = () => { if (!window.__sub) { window.__sub = 1; SB.store.subscribeRefusals((r) => { try { const l = JSON.parse(sessionStorage.getItem('__ref') || '[]'); l.push({ type: r.type, report: r.report, customer: r.payload && r.payload.customer, opId: r.opId }); sessionStorage.setItem('__ref', JSON.stringify(l)); } catch (e) { /* ignore */ } }); } window.__nav = 1; };
async function load(sc) {
  await sc.page.goto(sc.relay.origin + (sc.follower ? '/?follow' + (sc.trim ? '&trim=7' : '') : sc.paired ? '/?hub=' + encodeURIComponent(sc.relay.origin) : '/?hub'), { waitUntil: 'load' });
  await sc.page.waitForFunction(() => window.SB && SB.booted === true, null, { timeout: 30000 });
  if (!sc.follower) await sc.page.evaluate(SUBSCRIBE);
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
const tablets = []; for (let i = 0; i < NT; i++) tablets.push(await open(i, { skewMs: i === NT - 1 ? 7 * 60000 : 0, paired: i === 1 }));
const follower = await open(NT, { follower: true, trim: true });
const swWait = await Promise.all(tablets.map((sc) => sc.page.waitForFunction(() => SB.offline && SB.offline.status().state === 'ready', null, { timeout: 25000 }).then(() => true, () => false)));
check('every tablet has stored the page for opening while the hub is down (service worker ready)', swWait.every(Boolean), swWait);
for (const t of [...tablets]) await t.page.waitForFunction(() => SB.store.hubStatus().state === 'connected', null, { timeout: 30000 });
const m0 = measure(hub, 'start'); const series = [m0];
const t0 = Date.now(); let nextCheckpoint = t0 + Math.max(45000, DURATION / 4);

async function tapper(sc) {
  const rr = rng(SEED * 31 + sc.i + 1);
  while (!state.stop) {
    if (state.paused || state.hold || sc.reloading) { await sleep(100); continue; }
    sc.n++;
    const a = { tag: sc.tag, n: sc.n, r: [rr(), rr(), rr(), rr()] };
    try {
      const out = await sc.page.evaluate(`(${STEP.toString()})(${JSON.stringify(a)})`);
      if (out) { sc.taps++; sc.local[out.res] = (sc.local[out.res] || 0) + 1; if (out.res === 'ok') sc.ok++; if (out.type === 'createTicket' && out.res === 'ok') (sc.removed ? sc.createsAfter : sc.creates).push(out.customer); }
    } catch (e) { if (!sc.reloading && !state.stop) sc.err = String(e).slice(0, 200); }
    await sleep(Math.round(1000 / RATE * (0.5 + rr())));
  }
}
async function cutter(sc) {
  const rr = rng(SEED * 17 + sc.i + 7);
  while (!state.stop) {
    await sleepP(4000 + rr() * 16000); if (state.stop) break; if (state.paused || state.hold) continue;
    sc.relay.cut(); state.cuts++; await sleepP(1500 + rr() * 12000); sc.relay.heal();
  }
  sc.relay.heal();
}
const walCount = (type) => { try { return fs.readFileSync(hub.file + '.wal', 'utf8').split('\n').filter((l) => { try { return JSON.parse(l).type === type; } catch (e) { return false; } }).length; } catch (e) { return 0; } };
async function undoRace(n) {
  state.hold = true; for (const sc of screens) sc.relay.heal(); await sleep(1500);
  await until(async () => (await Promise.all(tablets.filter((x) => !x.removed).map((x) => x.page.evaluate(() => SB.store.hubStatus().queued).catch(() => 1)))).every((q) => q === 0), 'all queues empty', 30000).catch(() => {}); await sleep(1500);
  const a = tablets[0], b = tablets[Math.min(2, tablets.length - 1)], name = 'RACE-' + n;
  const made = await a.page.evaluate((name) => { const S = SB.store.getState(); for (const mi of S.menu) { if ((S.manual86 || {})[mi.id]) continue; const r = SB.store.dispatch('createTicket', { customer: name, items: [{ menuId: mi.id }] }); if (r === 'ok') return r; } return 'none'; }, name);
  const bumped = await a.page.evaluate((name) => { const t = SB.store.getState().tickets.find((x) => x.customer === name); return t ? SB.store.dispatch('bumpTicket', { ticketId: t.id, force: true }) : 'noticket'; }, name);   // a bump can be undone; a new ticket cannot
  await sleep(900); const before = walCount('undo'); const refBefore = await Promise.all([a, b].map((x) => x.page.evaluate(() => JSON.parse(sessionStorage.getItem('__ref') || '[]').filter((r) => r.type === 'undo').length)));
  const [ra, rb] = await Promise.all([a.page.evaluate(() => SB.store.dispatch('undo', {})), b.page.evaluate(() => SB.store.dispatch('undo', {}))]);
  await sleep(3000); const eff = walCount('undo') - before;
  const refAfter = await Promise.all([a, b].map((x) => x.page.evaluate(() => JSON.parse(sessionStorage.getItem('__ref') || '[]').filter((r) => r.type === 'undo').length)));
  const told = (ra !== 'ok' ? 1 : 0) + (rb !== 'ok' ? 1 : 0) + (refAfter[0] - refBefore[0]) + (refAfter[1] - refBefore[1]);
  check(`undo race ${n}: the ticket was made (${made}) and exactly one of the two simultaneous undos took effect at the hub (${eff})`, made === 'ok' && bumped === 'ok' && eff === 1, { made, bumped, ra, rb, eff });
  check(`undo race ${n}: the other undo was refused and its tablet was told (local ${ra}/${rb}, later refusals ${refAfter.map((x, i) => x - refBefore[i]).join('/')})`, told >= 1, { ra, rb, refBefore, refAfter });
  state.hold = false;
}
async function conductor() {
  const at = (f) => DURATION * f; const done = new Set(); const due = (k, f) => !done.has(k) && Date.now() - t0 >= at(f) && !state.paused && (done.add(k), true);
  while (!state.stop) {
    await sleep(500); const el = Date.now() - t0; if (state.paused) continue;
    if (due('race1', 0.2)) await undoRace(1);
    if (due('kill1', 0.33)) {                 // the hub dies; one tablet is reloaded while it is down and must open from its stored copy
      state.kills++; console.log(`  chaos hub SIGKILL #1 at ${Math.round(el / 1000)} s`); await hub.stop('SIGKILL');
      const sc = tablets[0]; sc.reloading = true; const had = await sc.page.evaluate(() => SB.store.getState().tickets.length).catch(() => -1);
      console.log(`  chaos reload tablet ${sc.tag} while the hub is down`);
      let opened = true; try { await sc.page.reload({ waitUntil: 'load', timeout: 25000 }); await sc.page.waitForFunction(() => window.SB && SB.booted === true, null, { timeout: 25000 }); await sc.page.evaluate(SUBSCRIBE); } catch (e) { opened = false; sc.err = 'reload while hub down: ' + String(e).slice(0, 120); }
      check('a tablet reloaded while the hub is down opens (from its stored copy)', opened, sc.err);
      if (opened) {
        const info = await sc.page.evaluate(() => ({ n: SB.store.getState() ? SB.store.getState().tickets.length : -1, st: SB.store.hubStatus() }));
        check(`it shows the last known kitchen (${info.n} tickets, had ${had}) and says it is the last known`, info.n > 0 && info.n === had && info.st.lastKnown === true, info);
        const names = ['DOWN-A', 'DOWN-B']; for (const nm of names) { const r = await sc.page.evaluate((nm) => { const S = SB.store.getState(); const m = S.menu.find((x) => !(S.manual86 || {})[x.id]); return SB.store.dispatch('createTicket', { customer: nm, items: [{ menuId: m.id }] }); }, nm); if (r === 'ok') sc.creates.push(nm); }
        const q = await sc.page.evaluate(() => SB.store.hubStatus().queued); check(`taps made while the hub is down are queued on the tablet (${q})`, q >= 2, q);
      }
      sc.reloading = false; await sleep(2500); await hub.restart('SIGKILL').catch(() => {}); console.log('  chaos hub back');
    }
    if (due('remove', 0.45)) {                // the paired tablet is removed at the hub
      const sc = tablets.find((x) => x.paired);
      if (sc) {
        sc.relay.heal(); state.hold = true; await sleep(1500); await until(async () => (await sc.page.evaluate(() => SB.store.hubStatus().queued).catch(() => 1)) === 0, 'paired tablet queue empty', 25000).catch(() => {});
        const listed = (await listScreens(hub)).find((x) => x.id === sc.screenId); check('the hub lists the paired tablet by the name it was paired with', !!listed && listed.name === 'Paired tablet', listed);
        const rv = revokeScreen(hub, sc.screenId); sc.removed = true; sc.removedAt = Date.now(); console.log(`  chaos screen ${sc.tag} removed at the hub at ${Math.round((Date.now() - t0) / 1000)} s`); check('the owner can remove it', rv.code === 0, rv);
        state.hold = false; await sleep(9000);
        const info = await sc.page.evaluate(() => ({ st: SB.store.hubStatus(), text: document.body.innerText, q: SB.store.hubStatus().queued }));
        check('the removed tablet\'s status says revoked', info.st.error === 'revoked', info.st);
        check('the removed tablet tells its person it was removed (not just "offline")', /removed/i.test(info.text), info.text.slice(0, 200));
        check(`its taps stay queued on the tablet and nothing is lost silently (${info.q} waiting)`, info.q > 0, info.q);
      }
    }
    if (due('sw', 0.5)) {                     // a new version of the page appears on the hub; tablets are told, and none reloads by itself
      state.hold = true; for (const x of screens) x.relay.heal(); await sleep(1500);
      fs.appendFileSync(PAGE, '\n<!-- soak: a newer page -->\n'); await sleep(1200);
      const live = tablets.filter((x) => !x.removed);
      await Promise.all(live.map((x) => x.page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); if (r) await r.update(); return !!r; }).catch(() => null)));
      const got = await Promise.all(live.map((x) => x.page.waitForFunction(() => SB.offline.status().state === 'update', null, { timeout: 25000 }).then(() => true, () => false)));
      const kept = await Promise.all(live.map((x) => x.page.evaluate(() => window.__nav === 1).catch(() => false)));
      check(`the service worker stored the new page and told ${got.filter(Boolean).length}/${live.length} tablets`, got.every(Boolean), got);
      check('and no tablet reloaded by itself (page state kept)', kept.every(Boolean), kept); state.hold = false;
    }
    if (due('reload', 0.6)) {                 // a tablet (the one whose clock is fast) is reloaded in the middle of service
      state.reloads++; const sc = tablets[tablets.length - 1]; sc.reloading = true; console.log(`  chaos reload tablet ${sc.tag}`);
      await sc.page.reload({ waitUntil: 'load' }).catch(() => {}); await load(sc).catch((e) => { sc.err = String(e); }); sc.reloading = false;
    }
    if (due('kill2', 0.75)) { state.kills++; console.log(`  chaos hub SIGKILL #2 at ${Math.round(el / 1000)} s`); await hub.stop('SIGKILL'); await sleep(2500); await hub.restart('SIGKILL').catch(() => {}); console.log('  chaos hub back'); }
    if (due('race2', 0.55)) await undoRace(2);
    if (due('race3', 0.85)) await undoRace(3);
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
      vs = await Promise.all(screens.filter((s) => !s.removed).map((s) => proj(s.page).catch(() => 'ERR')));
      const q = await Promise.all(tablets.filter((s) => !s.removed).map((s) => s.page.evaluate(() => SB.store.hubStatus().queued).catch(() => -1)));
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
  let st = r.ok ? r.st : await snap();
  // The hub moves time on once a second, so a thing that became due in the last second can look late: look again after the next ticks and fail only if it stays.
  let inv = E.checkInvariants(st, Date.now());
  if (inv.length) { await sleep(3000); st = await snap(); inv = E.checkInvariants(st, Date.now() - 2000); }
  let invDetail = inv.slice(0, 5);
  if (inv.length) { const m = /(t_\d+)\.(\d+)/.exec(inv[0]); if (m) { const t = st.tickets.find((x) => x.id === m[1]); const it = t && t.items.find((i) => String(i.id).endsWith('.' + m[2]) || i.id === m[0]); invDetail = { inv: inv.slice(0, 3), hubNow: st.serverNow, now: Date.now(), ticket: t && { id: t.id, status: t.status, createdAt: t.createdAt }, item: it }; } }
  check(label + ': engine invariants hold on the hub state', inv.length === 0, invDetail);
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
  if (final) { const rem = tablets.find((x) => x.removed); if (rem) { const onHub = rem.createsAfter.filter((nm) => byName.has(nm)); const q = await rem.page.evaluate(() => SB.store.hubStatus().queued).catch(() => -1); check(label + ': nothing the removed tablet did after its removal reached the hub (' + rem.createsAfter.length + ' creates held back, ' + q + ' taps queued)', onHub.length === 0 && q > 0, { onHub: onHub.slice(0, 5), q }); } }
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
