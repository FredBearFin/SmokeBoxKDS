// Pairing on the tablet side: pairHub, the saved token, the bound screen name, errors in plain codes, removal cutting a screen off, owner calls and the
// version check, against the real hub in the same process.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHub } from '../server/server.mjs';
import { ROOT } from './_load.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, what, ms = 8000) { for (let i = 0; i < ms / 20; i++) { if (fn()) return; await sleep(20); } assert.fail('timed out waiting for ' + what); }
const T0 = new Date(2026, 9, 23, 12, 0, 0).getTime();
function device(seed) {
  const disk = new Map(Object.entries(seed || {})), writes = [];
  const localStorage = { getItem: (k) => (disk.has(k) ? disk.get(k) : null), setItem: (k, v) => { writes.push(k); disk.set(k, String(v)); }, removeItem: (k) => { disk.delete(k); } };
  const ctx = { console, setTimeout, clearTimeout, setInterval, clearInterval, localStorage };
  ctx.globalThis = ctx; vm.createContext(ctx);
  for (const f of ['00-util.js', '10-config.js', '20-engine.js', '30-store.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8'), ctx, { filename: f });
  const urls = [];
  const fetchSpy = async (u, o) => { urls.push(u); return fetch(u, o); };
  return { store: ctx.SB.store, disk, writes, urls, env: { fetch: fetchSpy, TextDecoder, AbortController } };
}
const url = (port) => 'http://127.0.0.1:' + port;
const adminCode = async (hub, owner) => hub.screens.issueCode({ owner: !!owner }).code;
const tix = (n) => ({ customer: 'C' + n, items: [{ menuId: 'tea' }], allowPast: true });
const plain = (x) => JSON.parse(JSON.stringify(x));

test('an unpaired tablet is told to pair (probe, join and follow), in plain codes; a wrong code is refused', async () => {
  const hub = await createHub({ dataFile: null, starter: true, tickMs: 600000, requireTokens: true, heartbeatMs: 150, now: () => T0 + 5000 });
  const port = await hub.listen(0);
  const d = device();
  try {
    const p = await d.store.probeHub(Object.assign({ url: url(port) }, d.env));
    assert.deepEqual([p.ok, p.error, p.tokensRequired], [false, 'unpaired', true]);
    assert.equal((await d.store.initHubClient(Object.assign({ url: url(port), adopt: 'hub' }, d.env))).error, 'unpaired');
    assert.equal((await d.store.initFollower(Object.assign({ url: url(port) }, d.env))).error, 'unpaired');
    assert.equal(d.store.followStatus().state, 'error'); assert.match(d.store.followStatus().reason, /not paired/);
    d.store.destroy();
    const bad = await d.store.pairHub(Object.assign({ url: url(port), code: 'AAAAAA', name: 'Tab' }, d.env));
    assert.deepEqual([bad.ok, bad.error], [false, 'badPairCode']); assert.match(bad.reason, /wrong or has expired/);
    assert.deepEqual(plain(d.store.pairedFor(url(port))), { paired: false, name: '', owner: false, id: null });
    assert.equal(d.disk.get('smokebox.v1.hubtoken'), undefined);
    const code = await adminCode(hub);
    assert.equal((await d.store.pairHub(Object.assign({ url: url(port), code, name: '<b>x</b>' }, d.env))).error, 'badName');
  } finally { d.store.destroy(); await hub.close(); }
});

test('pairing saves a token on the device; later joins need no code; the name is the one bound to the token; the token never appears in an address', async () => {
  const hub = await createHub({ dataFile: null, starter: true, tickMs: 600000, requireTokens: true, heartbeatMs: 150, now: () => T0 + 5000 });
  const port = await hub.listen(0);
  const d = device();
  try {
    const code = await adminCode(hub);
    const r = await d.store.pairHub(Object.assign({ url: url(port), code: code.toLowerCase(), name: 'Pit tablet' }, d.env));
    assert.deepEqual([r.ok, r.name, r.owner], [true, 'Pit tablet', false]);
    assert.deepEqual(plain(d.store.pairedFor(url(port))), { paired: true, name: 'Pit tablet', owner: false, id: r.id });
    const saved = JSON.parse(d.disk.get('smokebox.v1.hubtoken')); const tok = saved.hubs[url(port)].token;
    assert.match(tok, /^[0-9a-f]{10}\./);
    const j = await d.store.initHubClient(Object.assign({ url: url(port), adopt: 'hub', name: 'Spoofed name' }, d.env));
    assert.equal(j.ok, true, JSON.stringify(j));
    assert.equal(d.store.hubStatus().name, 'Pit tablet', 'the hub\'s name for the token, not the one asked for');
    assert.equal(d.store.hubStatus().paired, true);
    assert.equal(d.store.dispatch('createTicket', tix(1)), 'ok');
    await until(() => d.store.hubStatus().queued === 0 && d.store.hubStatus().seq === hub.snapshot().seq, 'the tap to settle');
    assert.ok(hub.snapshot().state.events.filter((e) => e.screen).every((e) => e.screen === 'Pit tablet'));
    assert.ok(d.urls.every((u) => !u.includes(tok) && !/token=|code=/.test(u)), 'no secret in any address');
    d.store.destroy();
    // a follower on the same device uses the token too
    assert.equal((await d.store.initFollower(Object.assign({ url: url(port) }, d.env))).ok, true);
    d.store.destroy();
    assert.equal(d.store.unpair(url(port)), true); assert.equal(d.store.pairedFor(url(port)).paired, false); assert.equal(d.disk.get('smokebox.v1.hubtoken'), undefined);
    assert.equal((await d.store.initHubClient(Object.assign({ url: url(port), adopt: 'hub' }, d.env))).error, 'unpaired');
  } finally { d.store.destroy(); await hub.close(); }
});

test('a screen that is removed is cut off at once: the stream ends, its status is an error with plain words, and its queued taps are kept for a re-pair', async () => {
  const hub = await createHub({ dataFile: null, starter: true, tickMs: 600000, requireTokens: true, heartbeatMs: 150, now: () => T0 + 5000 });
  const port = await hub.listen(0);
  const A = device(), B = device();
  try {
    for (const [d, n] of [[A, 'Front'], [B, 'Pit']]) assert.equal((await d.store.pairHub(Object.assign({ url: url(port), code: await adminCode(hub), name: n }, d.env))).ok, true);
    assert.equal((await A.store.initHubClient(Object.assign({ url: url(port), adopt: 'hub' }, A.env))).ok, true);
    assert.equal((await B.store.initHubClient(Object.assign({ url: url(port), adopt: 'hub' }, B.env))).ok, true);
    A.store.dispatch('createTicket', tix(1));
    await until(() => B.store.getState().tickets.length === 1, 'B to see it');
    hub.screens.revoke(A.store.pairedFor(url(port)).id);
    // the hub cuts the stream; A's next call is answered "removed"
    await until(() => A.store.hubStatus().state === 'error', 'A to be cut off', 12000);
    const s = A.store.hubStatus();
    assert.equal(s.error, 'revoked'); assert.match(s.reason, /removed from the hub/);
    assert.equal(A.store.dispatch('createTicket', tix(2)), 'ok');                               // still predicted on the screen, but it cannot be sent
    await sleep(300);
    assert.equal(hub.snapshot().state.tickets.length, 1);
    assert.equal(B.store.hubStatus().state, 'connected', 'the other screen is not affected');
    // pairing again with a new code restores it
    A.store.destroy();
    assert.equal((await A.store.pairHub(Object.assign({ url: url(port), code: await adminCode(hub), name: 'Front again' }, A.env))).ok, true);
    assert.equal((await A.store.initHubClient(Object.assign({ url: url(port), adopt: 'hub' }, A.env))).ok, true);
    await until(() => A.store.hubStatus().queued === 0 && hub.snapshot().state.tickets.length === 2, 'the saved tap to go through after re-pairing', 12000);
  } finally { A.store.destroy(); B.store.destroy(); await hub.close(); }
});

test('owner screen: lists screens, makes a code for another screen and removes it; other screens get notOwner', async () => {
  const hub = await createHub({ dataFile: null, starter: true, tickMs: 600000, requireTokens: true, heartbeatMs: 150, now: () => T0 + 5000 });
  const port = await hub.listen(0);
  const O = device(), N = device();
  try {
    const po = await O.store.pairHub(Object.assign({ url: url(port), code: await adminCode(hub, true), name: 'Main' }, O.env));
    assert.deepEqual([po.ok, po.owner], [true, true]);
    const code = await O.store.hubNewPairingCode({ url: url(port), fetch: O.env.fetch });
    assert.equal(code.ok, true); assert.match(code.code, /^[A-Z2-9]{6}$/);
    const pn = await N.store.pairHub(Object.assign({ url: url(port), code: code.code, name: 'Side' }, N.env));
    assert.deepEqual([pn.ok, pn.owner], [true, false]);
    const list = await O.store.hubScreens({ url: url(port), fetch: O.env.fetch });
    assert.deepEqual(plain(list.screens.map((s) => s.name).sort()), ['Main', 'Side']);
    assert.equal((await N.store.hubScreens({ url: url(port), fetch: N.env.fetch })).error, 'notOwner');
    assert.equal((await N.store.hubNewPairingCode({ url: url(port), fetch: N.env.fetch })).error, 'notOwner');
    assert.equal((await device().store.hubScreens({ url: url(port), fetch })).error, 'unpaired');
    assert.equal((await O.store.hubRemoveScreen({ url: url(port), id: pn.id, fetch: O.env.fetch })).ok, true);
    assert.equal((await N.store.initHubClient(Object.assign({ url: url(port), adopt: 'hub' }, N.env))).error, 'revoked');
  } finally { O.store.destroy(); N.store.destroy(); await hub.close(); }
});

test('the version check from the tablet: a hub that wants a newer client gives wrongVersion on probe, join and pairing, with plain words', async () => {
  const hub = await createHub({ dataFile: null, starter: true, tickMs: 600000, minClient: 2, heartbeatMs: 150, now: () => T0 + 5000 });
  const port = await hub.listen(0);
  const d = device();
  try {
    assert.equal((await d.store.probeHub(Object.assign({ url: url(port) }, d.env))).error, 'wrongVersion');
    const j = await d.store.initHubClient(Object.assign({ url: url(port), adopt: 'hub' }, d.env));
    assert.equal(j.error, 'wrongVersion');
    const p = await d.store.pairHub(Object.assign({ url: url(port), code: await adminCode(hub), name: 'X' }, d.env));
    assert.equal(p.error, 'wrongVersion'); assert.match(p.reason, /different versions|do not speak the same version/);
    assert.equal((await d.store.initFollower(Object.assign({ url: url(port) }, d.env))).error, 'wrongVersion');
  } finally { d.store.destroy(); await hub.close(); }
});

test('tokens optional (the default): an unpaired tablet still joins with the access code; a paired one needs none', async () => {
  const hub = await createHub({ dataFile: null, starter: true, tickMs: 600000, writeCode: 'W1', heartbeatMs: 150, now: () => T0 + 5000 });
  const port = await hub.listen(0);
  const a = device(), b = device();
  try {
    assert.equal((await a.store.initHubClient(Object.assign({ url: url(port), adopt: 'hub', code: 'W1', name: 'Old way' }, a.env))).ok, true);
    assert.equal(a.store.hubStatus().paired, false);
    assert.equal((await b.store.pairHub(Object.assign({ url: url(port), code: await adminCode(hub), name: 'New way' }, b.env))).ok, true);
    assert.equal((await b.store.initHubClient(Object.assign({ url: url(port), adopt: 'hub' }, b.env))).ok, true);
    b.store.dispatch('createTicket', tix(1));
    await until(() => b.store.hubStatus().queued === 0 && hub.snapshot().state.tickets.length === 1, 'the paired tap');
    assert.equal((await device().store.initHubClient(Object.assign({ url: url(port), adopt: 'hub', code: 'nope' }, a.env))).error, 'badCode');
  } finally { a.store.destroy(); b.store.destroy(); await hub.close(); }
});
