// Second independent review (connected track), hub items: per-action permission, /events codes, Host check against DNS rebinding, a torn last record line,
// one hub per data folder, and pairing lockouts that one caller cannot use to block everyone. Each test failed before the fix.
// Run: node --test --test-force-exit test/review2-hub.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import * as SERVER from '../server/server.mjs';
const { createHub, ACTION_CLASS } = SERVER;
import { loadSB } from './_load.mjs';

const KEY = 'k'.repeat(40);
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sbr2-'));
// One request with any headers (including Host). Resolves { status, body, text }.
function req(port, method, p, { headers = {}, body } = {}) {
  return new Promise((resolve) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const r = http.request({ host: '127.0.0.1', port, path: p, method, headers: Object.assign({ 'x-smokebox-client': '1' }, data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {}, headers) }, (res) => {
      let t = ''; res.on('data', (c) => { t += c; if (res.headers['content-type'] && /event-stream/.test(res.headers['content-type']) && t.length > 20) { res.destroy(); } }); res.on('close', () => { let j = null; try { j = JSON.parse(t); } catch (e) { /* not JSON */ } resolve({ status: res.statusCode, body: j, text: t }); });
    });
    r.on('error', () => resolve({ status: 0, body: null, text: '' })); if (data) r.write(data); r.end();
  });
}
const admin = (port, p, body) => req(port, body ? 'POST' : 'GET', p, { headers: { authorization: 'Bearer ' + KEY }, body });
async function pairedHub(extra = {}) {
  const hub = await createHub(Object.assign({ requireTokens: true, adminKey: KEY, dataFile: null }, extra)); const port = await hub.listen(0, '127.0.0.1');
  const mkTok = async (owner, name) => { const c = (await admin(port, '/admin/pair', { owner })).body.code; return (await req(port, 'POST', '/pair', { body: { code: c, name } })).body.token; };
  return { hub, port, owner: await mkTok(true, 'Boss'), cook: await mkTok(false, 'Cook') };
}
const act = (port, token, type, payload) => req(port, 'POST', '/action', { headers: { 'x-smokebox-token': token }, body: { type, payload, opId: type + Math.random(), clientId: 'x' } });
const snapshot = (hub) => hub.snapshot ? hub.snapshot() : null;

test('#2: every engine action has a permission class, and no class names an action that does not exist', async () => {
  assert.ok(ACTION_CLASS && typeof ACTION_CLASS === 'object', 'server.mjs exports ACTION_CLASS');
  const E = (await loadSB(['00-util', '10-config', '20-engine'])).engine;
  const names = Object.keys(E.ACTIONS);
  const missing = names.filter((n) => !['any', 'owner', 'never'].includes(ACTION_CLASS[n]));
  assert.deepEqual(missing, [], 'add these to ACTION_CLASS in server/server.mjs: ' + missing.join(', '));
  assert.deepEqual(Object.keys(ACTION_CLASS).filter((n) => !names.includes(n)), [], 'ACTION_CLASS names an action the engine does not have');
  for (const n of ['resetLive', 'updateSettings', 'closeDay', 'voidOrder', 'reopenOrder', 'addMenuItem']) assert.equal(ACTION_CLASS[n], 'owner', n);
  for (const n of ['createTicket', 'bumpTicket', 'payOrder', 'toggle86', 'logTemp', 'undo']) assert.equal(ACTION_CLASS[n], 'any', n);
});

test('#2: a paired cook screen cannot wipe or reconfigure the kitchen; an owner screen can; service taps work for both', async () => {
  const { hub, port, owner, cook } = await pairedHub({ starter: true });
  const menu0 = hub.snapshot().state.menu.length; assert.ok(menu0 > 5);
  let r = await act(port, cook, 'resetLive', { catalog: 'blank', keepSettings: false });
  assert.equal(r.status, 403, JSON.stringify(r.body)); assert.equal(hub.snapshot().state.menu.length, menu0, 'the menu is still there');
  r = await act(port, cook, 'closeDay', {}); assert.equal(r.status, 403, 'closing the day is for an owner screen'); assert.equal(r.body.report, 'notOwner');
  r = await act(port, cook, 'updateSettings', { patch: { service: { taxRatePct: 9 } } }); assert.equal(r.status, 403); assert.equal(r.body.report, 'notOwner');
  r = await act(port, owner, 'updateSettings', { patch: { service: { taxRatePct: 9 } } }); assert.equal(r.status, 200); assert.notEqual(r.body.report, 'notOwner');
  const m = hub.snapshot().state.menu[0].id;
  r = await act(port, owner, 'createTicket', { customer: 'Owner tap', items: [{ menuId: m }] }); assert.equal(r.body.report, 'ok');
  r = await act(port, cook, 'createTicket', { customer: 'Cook tap', items: [{ menuId: m }] }); assert.equal(r.status, 200); assert.equal(r.body.report, 'ok');
  await hub.close();
});

test('#2: with no tokens at all (a trusted network) everything works as before; an unknown action type is refused by the engine', async () => {
  const hub = await createHub({ dataFile: null, starter: true }); const port = await hub.listen(0, '127.0.0.1');
  const m = hub.snapshot().state.menu[0].id;
  assert.equal((await req(port, 'POST', '/action', { body: { type: 'createTicket', payload: { customer: 'x', items: [{ menuId: m }] } } })).body.report, 'ok');
  assert.equal((await req(port, 'POST', '/action', { body: { type: 'updateSettings', payload: { patch: { service: { taxRatePct: 7 } } } } })).status, 200);
  assert.equal((await req(port, 'POST', '/action', { body: { type: 'notAnAction', payload: {} } })).body.report, 'unknownAction'); await hub.close();
});

test('#6: /events needs the same code or token as /follow, and the same version check', async () => {
  const hub = await createHub({ dataFile: null, followCode: 'FOLLOWCODE1', writeCode: 'WRITECODE12', minClient: 1 }); const port = await hub.listen(0, '127.0.0.1');
  assert.equal((await req(port, 'GET', '/follow')).status, 403, 'control: /follow refuses');
  assert.equal((await req(port, 'GET', '/events')).status, 403, '/events without a code is refused too');
  assert.equal((await req(port, 'GET', '/events', { headers: { 'x-smokebox-code': 'nope' } })).status, 403);
  assert.equal((await req(port, 'GET', '/events', { headers: { 'x-smokebox-code': 'FOLLOWCODE1' } })).status, 200);
  assert.equal((await req(port, 'GET', '/events', { headers: { 'x-smokebox-code': 'FOLLOWCODE1', 'x-smokebox-client': '0' } })).status, 426, 'an old client is refused');
  await hub.close();
});

test('#7: a request whose Host is some other dotted name is refused (DNS rebinding) unless the hub is behind a proxy or the name is allowed', async () => {
  const hub = await createHub({ dataFile: null }); const port = await hub.listen(0, '127.0.0.1');
  const evil = { host: 'rebind.evil.example', origin: 'http://rebind.evil.example' };
  assert.equal((await req(port, 'GET', '/events', { headers: evil })).status, 421);
  assert.equal((await req(port, 'POST', '/action', { headers: evil, body: { type: 'uiReport', payload: {} } })).status, 421);
  for (const h of ['127.0.0.1:' + port, 'localhost:' + port, '192.168.1.20:8787', '[::1]:' + port, 'kitchen', 'smokebox.local']) assert.notEqual((await req(port, 'GET', '/health', { headers: { host: h } })).status, 421, h + ' is fine');
  await hub.close();
  const h2 = await createHub({ dataFile: null, allowedHosts: ['kitchen.example.com'] }); const p2 = await h2.listen(0, '127.0.0.1');
  assert.notEqual((await req(p2, 'GET', '/health', { headers: { host: 'Kitchen.Example.com:443' } })).status, 421, 'a listed name works, any case, any port');
  assert.equal((await req(p2, 'GET', '/health', { headers: evil })).status, 421); await h2.close();
  const h3 = await createHub({ dataFile: null, trustProxy: true }); const p3 = await h3.listen(0, '127.0.0.1');
  assert.notEqual((await req(p3, 'GET', '/health', { headers: evil })).status, 421, 'behind a proxy the proxy decides which names reach the hub'); await h3.close();
});

test('#3: a torn last line in the record is cut off at start, so the next acknowledged action is not glued to it', async () => {
  const dir = tmp(), file = path.join(dir, 'state.json');
  let hub = await createHub({ dataFile: file, starter: true }); let port = await hub.listen(0, '127.0.0.1');
  const m = hub.snapshot().state.menu[0].id;
  for (const n of ['T1', 'T2']) assert.equal((await req(port, 'POST', '/action', { body: { type: 'createTicket', payload: { customer: n, items: [{ menuId: m }] }, opId: n } })).body.report, 'ok');
  hub.crash ? hub.crash() : await hub.close();
  fs.appendFileSync(file + '.wal', '{"seq":3,"opId":"T3","type":"createTicket","payload":{"cust');   // a crash in the middle of a write
  hub = await createHub({ dataFile: file, starter: true }); port = await hub.listen(0, '127.0.0.1');
  for (const n of ['T4', 'T5']) assert.equal((await req(port, 'POST', '/action', { body: { type: 'createTicket', payload: { customer: n, items: [{ menuId: m }] }, opId: n } })).body.report, 'ok');
  hub.crash ? hub.crash() : await hub.close();           // crashes again before the state file is written
  hub = await createHub({ dataFile: file, starter: true });
  const names = hub.snapshot().state.tickets.map((t) => t.customer); await hub.close();
  assert.deepEqual(names, ['T1', 'T2', 'T4', 'T5'], 'both actions acknowledged after the first restart survive the second crash');
});

test('#4: two hubs cannot run on one data folder; a stale lock from a dead process is taken over; closing frees it', async () => {
  const dir = tmp(), file = path.join(dir, 'state.json');
  const a = await createHub({ dataFile: file }); await a.listen(0, '127.0.0.1');
  await assert.rejects(() => createHub({ dataFile: file }), /already (running|using)|another hub/i, 'the second hub refuses to start');
  await a.close();
  const b = await createHub({ dataFile: file }); await b.listen(0, '127.0.0.1'); await b.close();
  fs.writeFileSync(file + '.lock', '999999999\n');           // a process that does not exist
  const c = await createHub({ dataFile: file }); await c.close();
});

test('#10: behind a trusted proxy wrong guesses are counted per caller address, and the admin command is never locked out by callers', async () => {
  const { hub, port } = await pairedHub({ trustProxy: true });
  const code = (await admin(port, '/admin/pair', { owner: false })).body.code;
  for (let i = 0; i < 40; i++) await req(port, 'POST', '/pair', { headers: { 'x-forwarded-for': '203.0.113.' + (i + 1) }, body: { code: 'ZZZZ' + (10 + i), name: 'x' } });
  assert.equal((await req(port, 'POST', '/pair', { headers: { 'x-forwarded-for': '198.51.100.7' }, body: { code, name: 'Real' } })).status, 200, 'a different caller can still pair after 40 wrong guesses from 40 other addresses');
  const bad = []; for (let i = 0; i < 12; i++) bad.push((await req(port, 'GET', '/admin/screens', { headers: { authorization: 'Bearer nope' + i, 'x-forwarded-for': '203.0.113.99' } })).status);
  assert.ok(bad.includes(429), 'wrong admin keys from one caller do get locked');
  assert.equal((await admin(port, '/admin/screens')).status, 200, 'but the real key from the computer itself still works');
  await hub.close();
});
