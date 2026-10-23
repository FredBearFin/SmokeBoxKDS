// Per-screen pairing and tokens on the hub: one-time pairing codes, tokens stored only as hashes, the name bound to the token, tokens required
// or optional, removing a screen cuts it off at once, owner screens, the version check, rate limits and the owner's command line.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { createHub } from '../server/server.mjs';
import { createScreens } from '../server/screens.mjs';
import { ROOT } from './_load.mjs';

// Runs a command without blocking this process (the hub under test lives in it); resolves { status, stdout, stderr }.
const runNode = (args, env) => new Promise((resolve) => execFile(process.execPath, args, { env: Object.assign({}, process.env, env || {}), timeout: 15000 }, (err, stdout, stderr) => resolve({ status: err ? (typeof err.code === 'number' ? err.code : 1) : 0, stdout, stderr })));
const T0 = new Date(2026, 9, 23, 12, 0, 0).getTime();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, what, ms = 4000) { for (let i = 0; i < ms / 20; i++) { if (await fn()) return; await sleep(20); } assert.fail('timed out waiting for ' + what); }
const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pair-')), 'state.json');
const J = (port, p, o = {}) => fetch('http://127.0.0.1:' + port + p, Object.assign({}, o, { headers: Object.assign({ 'content-type': 'application/json' }, o.headers || {}) })).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null), headers: r.headers }));
const post = (port, p, body, headers) => J(port, p, { method: 'POST', body: JSON.stringify(body), headers });
const admin = (hub, port, p, body) => (body === undefined ? J(port, p, { headers: { authorization: 'Bearer ' + hub.adminKey } }) : post(port, p, body, { authorization: 'Bearer ' + hub.adminKey }));
async function pair(hub, port, name, owner) { const c = (await admin(hub, port, '/admin/pair', { owner: !!owner })).body.code; const r = await post(port, '/pair', { code: c, name }); return r.body; }
const tk = (n) => ({ type: 'createTicket', payload: { customer: 'T' + n, items: [{ menuId: 'tea' }] }, opId: 'o:' + n });
// Opens /follow with headers and keeps the status, events and whether it ended.
function follow(port, headers) {
  const f = { status: null, events: [], ended: false };
  f.req = http.get({ host: '127.0.0.1', port, path: '/follow', headers: headers || {} }, (res) => {
    f.status = res.statusCode; let buf = ''; res.setEncoding('utf8');
    res.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n\n')) >= 0) { const b = buf.slice(0, i); buf = buf.slice(i + 2); const ev = /^event: (.*)$/m.exec(b), da = /^data: (.*)$/m.exec(b); if (ev && da) { try { f.events.push({ name: ev[1], data: JSON.parse(da[1]) }); } catch (e) { /* not JSON */ } } } });
    res.on('end', () => { f.ended = true; }); res.on('close', () => { f.ended = true; });
  });
  f.req.on('error', () => { f.ended = true; });
  f.stop = () => f.req.destroy();
  return f;
}

test('pairing: a one-time 6-character code is exchanged for a token; the code works once; only a hash of the token is kept', async () => {
  const file = tmp();
  const hub = await createHub({ dataFile: file, starter: true, tickMs: 600000, now: () => T0 });
  const port = await hub.listen(0);
  try {
    assert.equal((await post(port, '/admin/pair', {})).status, 403, 'no admin key, no code');
    assert.equal((await post(port, '/admin/pair', {}, { authorization: 'Bearer wrong' })).status, 403);
    const c = await admin(hub, port, '/admin/pair', {});
    assert.match(c.body.code, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/); assert.equal(c.body.minutes, 10);
    const r = await post(port, '/pair', { code: c.body.code.toLowerCase(), name: 'Pit tablet' });
    assert.equal(r.status, 200); assert.match(r.body.token, /^[0-9a-f]{10}\.[A-Za-z0-9_-]{40,}$/); assert.equal(r.body.screen.name, 'Pit tablet'); assert.equal(r.body.screen.owner, false);
    const again = await post(port, '/pair', { code: c.body.code, name: 'Other' });
    assert.deepEqual([again.status, again.body.report], [403, 'badPairCode']); assert.match(again.body.words, /wrong or has expired/);
    const secret = r.body.token.split('.')[1];
    assert.equal(fs.readFileSync(file + '.screens', 'utf8').includes(secret), false, 'the token itself is never stored');
    assert.equal(JSON.stringify(hub.screens.list()).includes('hash'), false);
    assert.equal(fs.statSync(file + '.screens').mode & 0o077, 0, 'owner-only permissions'); assert.equal(fs.statSync(file + '.admin').mode & 0o077, 0);
    // bad names are refused, and nothing is used up
    const c2 = await admin(hub, port, '/admin/pair', {});
    assert.equal((await post(port, '/pair', { code: c2.body.code, name: '<b>x</b>' })).body.report, 'badName');
    assert.equal((await post(port, '/pair', { code: c2.body.code, name: 'Fine' })).status, 200, 'the code survived a bad name');
  } finally { await hub.close(); }
});

test('an expired code is refused; codes are not shared between pairings', async () => {
  let t = T0;
  const hub = await createHub({ dataFile: null, starter: true, tickMs: 600000, now: () => t });
  const port = await hub.listen(0);
  try {
    const c = (await admin(hub, port, '/admin/pair', {})).body.code;
    t += 11 * 60 * 1000;
    assert.equal((await post(port, '/pair', { code: c, name: 'Late' })).body.report, 'badPairCode');
    const c1 = (await admin(hub, port, '/admin/pair', {})).body.code, c2 = (await admin(hub, port, '/admin/pair', {})).body.code;
    assert.notEqual(c1, c2);
    assert.equal((await post(port, '/pair', { code: c1, name: 'A' })).status, 200); assert.equal((await post(port, '/pair', { code: c2, name: 'B' })).status, 200);
  } finally { await hub.close(); }
});

test('with tokens required: no token, no read, no write; the name and identity come from the token, not the request', async () => {
  const hub = await createHub({ dataFile: null, starter: true, tickMs: 600000, requireTokens: true, now: () => T0 });
  const port = await hub.listen(0);
  try {
    for (const [p, o] of [['/action', { method: 'POST', body: JSON.stringify(tk(1)) }], ['/probe', {}], ['/events', {}], ['/seed', { method: 'POST', body: '{}' }]]) {
      const r = await J(port, p, o); assert.deepEqual([r.status, r.body.report], [403, 'unpaired'], p); assert.match(r.body.words, /not paired/);
    }
    const f0 = follow(port); await until(() => f0.status !== null, 'answer'); assert.equal(f0.status, 403);
    assert.equal((await J(port, '/probe')).body.tokensRequired, true, 'a probe tells a new screen it needs a pairing code');
    // the shared access codes are not accepted in this mode
    assert.equal((await J(port, '/probe?code=anything')).status, 403);
    const A = await pair(hub, port, 'Front', false), B = await pair(hub, port, 'Pit', false);
    const hdr = (t) => ({ 'x-smokebox-token': t });
    assert.equal((await J(port, '/probe', { headers: hdr(A.token) })).status, 200);
    const f = follow(port, hdr(A.token)); await until(() => f.events.some((e) => e.name === 'snapshot'), 'snapshot'); f.stop();
    // A tries to be B and to name itself something else
    const r = await post(port, '/action', Object.assign(tk(2), { who: 'Pit', clientId: 's:' + B.screen.id }), hdr(A.token));
    assert.equal(r.body.ok, true);
    const ev = hub.snapshot().state.events.filter((e) => e.screen);
    assert.ok(ev.length > 0 && ev.every((e) => e.screen === 'Front'), 'stamped with the token\'s name');
    const op = hub.snapshot().state.events.at(-1);
    void op;
    // B cannot undo A's tap even by claiming A's id: identity is the token
    assert.equal((await post(port, '/action', { type: 'toggle86', payload: { menuId: 'tea', on: true }, opId: 'o:86' }, hdr(A.token))).body.ok, true);
    const u = await post(port, '/action', { type: 'undo', payload: { ofOpId: 'o:86' }, opId: 'u:1', clientId: 's:' + A.screen.id }, hdr(B.token));
    assert.equal(u.body.report, 'undoElsewhere');
    assert.equal((await post(port, '/action', { type: 'undo', payload: { ofOpId: 'o:86' }, opId: 'u:2' }, hdr(A.token))).body.ok, true, 'the owner of the tap can undo it');
    // a made-up token and a token with the wrong secret
    assert.equal((await post(port, '/action', tk(3), hdr('0123456789.' + 'a'.repeat(43)))).body.report, 'unpaired');
    assert.equal((await post(port, '/action', tk(3), hdr(A.token.split('.')[0] + '.' + 'b'.repeat(43)))).body.report, 'unpaired');
    assert.equal((await post(port, '/action', tk(3), hdr('garbage'))).body.report, 'unpaired');
  } finally { await hub.close(); }
});

test('removing a screen cuts its streams at once and refuses it from then on; the list shows it; it survives a restart', async () => {
  const file = tmp();
  const hub = await createHub({ dataFile: file, starter: true, tickMs: 600000, requireTokens: true, now: () => T0 });
  const port = await hub.listen(0);
  const A = await pair(hub, port, 'Front', false), B = await pair(hub, port, 'Pit', false);
  const fa = follow(port, { 'x-smokebox-token': A.token }), fb = follow(port, { 'x-smokebox-token': B.token });
  await until(() => fa.events.length > 0 && fb.events.length > 0, 'both streams');
  const rv = await admin(hub, port, '/admin/revoke', { id: A.screen.id });
  assert.equal(rv.body.ok, true);
  await until(() => fa.ended, 'the removed screen\'s stream to end');
  assert.equal(fb.ended, false, 'the other screen is not affected');
  const r = await post(port, '/action', tk(1), { 'x-smokebox-token': A.token });
  assert.deepEqual([r.status, r.body.report], [403, 'revoked']); assert.match(r.body.words, /removed from the kitchen/);
  assert.equal((await J(port, '/probe', { headers: { 'x-smokebox-token': A.token } })).body.report, 'revoked');
  assert.equal((await post(port, '/action', tk(2), { 'x-smokebox-token': B.token })).body.ok, true);
  const list = (await admin(hub, port, '/admin/screens')).body.screens;
  assert.equal(list.find((s) => s.id === A.screen.id).revokedAt > 0, true); assert.equal(list.find((s) => s.id === B.screen.id).revokedAt, null);
  assert.equal((await admin(hub, port, '/admin/revoke', { id: 'ffffffffff' })).status, 404);
  fb.stop(); await hub.close();
  const h2 = await createHub({ dataFile: file, starter: true, tickMs: 600000, requireTokens: true, now: () => T0 });
  const p2 = await h2.listen(0);
  try {
    assert.equal((await post(p2, '/action', tk(3), { 'x-smokebox-token': B.token })).body.ok, true, 'a valid token survives a restart');
    assert.equal((await post(p2, '/action', tk(4), { 'x-smokebox-token': A.token })).body.report, 'revoked', 'a removed screen stays removed');
    assert.equal(h2.adminKey, hub.adminKey, 'the admin key is kept');
  } finally { await h2.close(); }
});

test('tokens optional (the default): the access code still works; a token, when sent, must be valid; a valid token needs no code', async () => {
  const hub = await createHub({ dataFile: null, starter: true, tickMs: 600000, writeCode: 'W1', followCode: 'F1', now: () => T0 });
  const port = await hub.listen(0);
  try {
    assert.equal((await post(port, '/action', Object.assign(tk(1), { code: 'W1' }))).body.ok, true, 'today\'s behavior');
    assert.equal((await post(port, '/action', tk(2))).status, 403);
    const A = await pair(hub, port, 'Tab', false);
    assert.equal((await post(port, '/action', tk(3), { 'x-smokebox-token': A.token })).body.ok, true, 'a token replaces the code');
    assert.equal((await J(port, '/probe', { headers: { 'x-smokebox-token': A.token } })).status, 200);
    assert.equal((await post(port, '/action', Object.assign(tk(4), { code: 'W1' }), { 'x-smokebox-token': 'bad.token' })).body.report, 'unpaired', 'a given token must be valid even when the code is right');
    hub.screens.revoke(A.screen.id);
    assert.equal((await post(port, '/action', Object.assign(tk(5), { code: 'W1' }), { 'x-smokebox-token': A.token })).body.report, 'revoked');
  } finally { await hub.close(); }
});

test('owner screens: they can make codes, list and remove screens and send a kitchen; other screens cannot; /admin is closed to every screen', async () => {
  const hub = await createHub({ dataFile: null, starter: false, tickMs: 600000, requireTokens: true, now: () => T0 });
  const port = await hub.listen(0);
  try {
    const O = await pair(hub, port, 'Main', true), P = await pair(hub, port, 'Side', false);
    assert.equal(O.screen.owner, true);
    const ho = { 'x-smokebox-token': O.token }, hp = { 'x-smokebox-token': P.token };
    const code = await post(port, '/screen/pair', {}, ho); assert.equal(code.status, 200); assert.match(code.body.code, /^[A-Z2-9]{6}$/); assert.equal(code.body.owner, false, 'an owner screen cannot make another owner');
    assert.equal((await post(port, '/pair', { code: code.body.code, name: 'Third' })).status, 200);
    assert.equal((await J(port, '/screen/list', { headers: ho })).body.screens.length, 3);
    for (const [p, o] of [['/screen/pair', { method: 'POST', body: '{}' }], ['/screen/list', {}], ['/screen/revoke', { method: 'POST', body: JSON.stringify({ id: O.screen.id }) }]]) {
      const r = await J(port, p, Object.assign({}, o, { headers: hp })); assert.deepEqual([r.status, r.body.report], [403, 'notOwner'], p);
    }
    for (const t of [O.token, P.token]) assert.equal((await J(port, '/admin/screens', { headers: { 'x-smokebox-token': t, authorization: 'Bearer ' + t } })).status, 403, 'a token is not the admin key');
    assert.equal((await post(port, '/seed', { state: { v: 1 } }, hp)).body.report, 'notOwner');
    assert.equal((await post(port, '/screen/revoke', { id: P.screen.id }, ho)).body.ok, true);
    assert.equal((await post(port, '/action', tk(1), hp)).body.report, 'revoked');
  } finally { await hub.close(); }
});

test('the version check: a client older than the hub\'s minimum, or one that says nothing, gets wrongVersion in plain words on every route', async () => {
  const hub = await createHub({ dataFile: null, starter: true, tickMs: 600000, minClient: 2, now: () => T0 });
  const port = await hub.listen(0);
  try {
    const old = { 'x-smokebox-client': '1' }, none = {}, ok = { 'x-smokebox-client': '2' };
    for (const h of [old, none]) {
      for (const [p, o] of [['/action', { method: 'POST', body: JSON.stringify(tk(1)) }], ['/probe', {}], ['/pair', { method: 'POST', body: JSON.stringify({ code: 'AAAAAA' }) }]]) {
        const r = await J(port, p, Object.assign({}, o, { headers: h })); assert.deepEqual([r.status, r.body.report], [426, 'wrongVersion'], p); assert.match(r.body.words, /different versions/);
      }
      const f = follow(port, h); await until(() => f.status !== null, 'follow answer'); assert.equal(f.status, 426);
    }
    assert.equal((await post(port, '/action', tk(2), ok)).body.ok, true);
    const pr = await J(port, '/probe', { headers: ok }); assert.deepEqual([pr.body.proto, pr.body.minClient], [1, 2]);
    const f = follow(port, ok); await until(() => f.events.some((e) => e.name === 'hello'), 'hello'); assert.equal(f.events[0].data.minClient, 2); f.stop();
  } finally { await hub.close(); }
});

test('brute force: five wrong pairing codes lock that address even for the right code; spread-out guessing burns every open code and pauses pairing', async () => {
  const hub = await createHub({ dataFile: null, starter: true, tickMs: 600000, now: () => T0 });
  const port = await hub.listen(0);
  try {
    const c = (await admin(hub, port, '/admin/pair', {})).body.code;
    for (let i = 0; i < 4; i++) assert.equal((await post(port, '/pair', { code: 'ZZZZZ' + i, name: 'x' })).body.report, 'badPairCode');
    assert.equal((await post(port, '/pair', { code: 'ZZZZZ9', name: 'x' })).status, 429);
    const r = await post(port, '/pair', { code: c, name: 'Late' });
    assert.deepEqual([r.status, r.body.report], [429, 'tooManyTries'], 'the right code is held off during the lock');
    assert.match(r.body.words, /Too many wrong tries/);
  } finally { await hub.close(); }
  // many addresses (a guesser behind a proxy or with many machines): unit level, with different addresses
  let t = T0;
  const S = createScreens({ now: () => t });
  const code = S.issueCode().code;
  for (let i = 0; i < 31; i++) S.exchange('ZZZZZ' + (i % 10), 'x', 'addr-' + i);
  const r = S.exchange(code, 'Real', 'addr-new');
  assert.deepEqual([r.ok, r.report], [false, 'tooManyTries'], 'the code was burned and pairing is paused');
  t += 11 * 60 * 1000;
  const c2 = S.issueCode().code;
  assert.equal(S.exchange(c2, 'Real', 'addr-new').ok, true, 'pairing works again after the pause');
});

test('the owner\'s command line: pair, list and revoke against a running hub, using the admin key beside the data file', async () => {
  const file = tmp();
  const hub = await createHub({ dataFile: file, starter: true, tickMs: 600000, requireTokens: true, now: () => Date.now() });
  const port = await hub.listen(0);
  try {
    const run = (...a) => runNode([path.join(ROOT, 'server/server.mjs'), 'admin', ...a, '--port', String(port), '--data', file]);
    const p = await run('pair');
    assert.equal(p.status, 0, p.stderr); const code = /Pairing code: ([A-Z2-9]{6})/.exec(p.stdout)[1];
    const r = await post(port, '/pair', { code, name: 'From CLI' }); assert.equal(r.status, 200);
    const l = await run('list'); assert.equal(l.status, 0); assert.match(l.stdout, /From CLI/); assert.match(l.stdout, /Tokens are required/);
    const v = await run('revoke', r.body.screen.id); assert.equal(v.status, 0); assert.match(v.stdout, /cut off now/);
    assert.match((await run('list')).stdout, /REMOVED/);
    assert.equal((await post(port, '/action', tk(1), { 'x-smokebox-token': r.body.token })).body.report, 'revoked');
    assert.equal((await run('revoke', 'nonexistent')).status, 1);
    const wrong = await runNode([path.join(ROOT, 'server/server.mjs'), 'admin', 'list', '--port', String(port)], { SMOKEBOX_ADMIN_KEY: 'x'.repeat(48), SMOKEBOX_DATA: '' });
    assert.equal(wrong.status, 1); assert.match(wrong.stderr, /Refused/);
    assert.equal((await runNode([path.join(ROOT, 'server/server.mjs'), 'admin', 'list'], { SMOKEBOX_DATA: '', SMOKEBOX_ADMIN_KEY: '' })).status, 2, 'no key, no call');
  } finally { await hub.close(); }
});
