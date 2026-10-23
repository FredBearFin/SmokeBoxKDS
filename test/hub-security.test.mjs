// Hub security checks: hostile requests against server/server.mjs on a random local port. The hub must stay up, answer with a plain
// error, keep its memory bounded and never write outside its data file. (The login lives in Caddy in front of it; see docs/audit/server-security-review.md.)
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHub } from '../server/server.mjs';

const hubs = [];
async function start(opts = {}) {
  const hub = await createHub(Object.assign({ tickMs: 100000, heartbeatMs: 100000, saveMs: 20 }, opts));
  const port = await hub.listen(0);
  hubs.push(hub);
  return { hub, port };
}
test.after(async () => { for (const h of hubs) await h.close(); });

// One raw HTTP exchange over a TCP socket, so malformed requests can be sent exactly as written. Resolves with the status line and body.
function raw(port, text, wait = 400) {
  return new Promise((resolve) => {
    const s = net.connect(port, '127.0.0.1');
    let buf = '';
    s.on('data', (d) => { buf += d.toString('utf8'); });
    s.on('error', () => resolve(buf));
    s.on('close', () => resolve(buf));
    s.write(text);
    setTimeout(() => { s.destroy(); resolve(buf); }, wait);
  });
}
const status = (txt) => { const m = /^HTTP\/1\.1 (\d{3})/.exec(txt); return m ? Number(m[1]) : 0; };
function post(port, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = typeof body === 'string' ? body : JSON.stringify(body);
    const req = http.request({ port, host: '127.0.0.1', path: '/action', method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, headers) }, (res) => {
      let s = ''; res.on('data', (c) => (s += c)); res.on('end', () => { let j = null; try { j = JSON.parse(s); } catch (e) { /* not JSON */ } resolve({ status: res.statusCode, body: j, text: s }); });
    });
    req.on('error', (e) => resolve({ status: 0, error: e.code || e.message }));
    req.end(data);
  });
}
const alive = async (port) => { const r = await raw(port, 'GET /nope HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n'); return status(r) === 404; };

test('hostile action types and payloads never crash the hub or pollute prototypes', async () => {
  const { port } = await start();
  const types = ['__proto__', 'constructor', 'prototype', 'toString', 'hasOwnProperty', 'A', '', ' ', 'createTicket\u0000', 'x'.repeat(100000), 'resetLive', 'importAll'];
  for (const type of types) {
    const r = await post(port, { type, payload: { __proto__: { polluted: 1 }, items: 'x' } });
    assert.ok(r.status === 200 || r.status === 400 || r.status === 413 || r.status === 0, 'type ' + type.slice(0, 20) + ' -> ' + r.status);
  }
  for (const body of ['{"type":"createTicket","payload":{"__proto__":{"polluted":1}}}', '{"type":"createTicket","payload":{"constructor":{"prototype":{"polluted":1}}}}', '[]', 'null', '"str"', '5', '{"type":5}', '{"type":"createTicket","payload":5}', '{"type":"createTicket","payload":null}', '{"type":"createTicket","payload":[]}', '{"type":"createTicket","opId":{"a":1},"payload":{}}', '{"type":"createTicket","at":"x","payload":{}}', '{"type":"createTicket","at":1e999,"payload":{}}', '{"type":"createTicket","clientId":{"x":1},"payload":{}}', '\u0000', '{']) {
    const r = await post(port, body);
    assert.ok([200, 400].includes(r.status), body.slice(0, 40) + ' -> ' + r.status);
  }
  assert.equal({}.polluted, undefined, 'no prototype pollution');
  assert.ok(await alive(port), 'the hub still answers');
});

test('a very deep JSON body is refused, not a crash', async () => {
  const { port } = await start();
  const deep = '['.repeat(200000) + ']'.repeat(200000);
  const r = await post(port, deep);
  assert.ok([400, 413, 0].includes(r.status), String(r.status));
  assert.ok(await alive(port));
});

test('an oversized body gets 413 and does not stay in memory (the action log is bounded in bytes)', async () => {
  const { port, hub } = await start();
  const big = JSON.stringify({ type: 'createTicket', payload: { items: [{ menuId: 'x' }], note: 'x'.repeat(900000) } });
  const r = await post(port, big);
  assert.ok([413, 400].includes(r.status), 'a 900 KB action must be refused, got ' + r.status);
  const huge = await post(port, 'x'.repeat(3e6));
  assert.ok([413, 0].includes(huge.status), 'a 3 MB body is cut off: ' + huge.status);
  assert.ok(await alive(port));
  assert.ok(JSON.stringify(hub.snapshot().state).length < 2e5, 'the state did not grow');
});

test('many connected screens are capped, and a flood of garbage requests leaves the hub up', async () => {
  const { port } = await start({ maxClients: 20 });
  const socks = [];
  for (let i = 0; i < 40; i++) socks.push(await new Promise((resolve) => { const req = http.get({ port, host: '127.0.0.1', path: '/events' }, (res) => resolve({ req, res })); req.on('error', () => resolve({ req, res: null })); }));
  const codes = socks.map((s) => (s.res ? s.res.statusCode : 0));
  assert.ok(codes.filter((c) => c === 200).length <= 20, 'at most 20 event streams: ' + codes.filter((c) => c === 200).length);
  assert.ok(codes.some((c) => c === 503), 'the rest are told the hub is busy');
  for (const s of socks) s.req.destroy();
  const junk = ['GET / HTTP/1.1\r\n\r\n', 'GARBAGE\r\n\r\n', 'GET /events?since=%ff%fe HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n', 'GET //[ HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n', 'POST /action HTTP/1.1\r\nHost: x\r\nContent-Length: 99999999\r\nConnection: close\r\n\r\n', 'GET /../../etc/passwd HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n', 'GET /%2e%2e/%2e%2e/etc/passwd HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n'];
  for (const j of junk) { const out = await raw(port, j, 200); assert.ok(!/root:x:0/.test(out), 'no file leaked'); }
  assert.ok(await alive(port));
});

test('only the page and the two routes exist; other methods and paths are 404 or 405 and nothing else is readable', async () => {
  const { port } = await start();
  for (const [m, p] of [['GET', '/server.mjs'], ['GET', '/src/js/20-engine.js'], ['GET', '/package.json'], ['GET', '/state.json'], ['PUT', '/action'], ['DELETE', '/'], ['GET', '/action'], ['POST', '/events'], ['POST', '/']]) {
    const out = await raw(port, `${m} ${p} HTTP/1.1\r\nHost: x\r\nContent-Length: 0\r\nConnection: close\r\n\r\n`, 200);
    const code = status(out);
    assert.ok([404, 405].includes(code), `${m} ${p} -> ${code}`);
    assert.ok(!/createHub|loadEngine|"state"/.test(out), 'no source or state leaked by ' + p);
  }
});

test('the data file is written only at its own path and an unreadable or hostile file is ignored, not run', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sbhub-'));
  const file = path.join(dir, 'state.json');
  fs.writeFileSync(file, '{"v":1,"seq":"x","state":{"menu":"nope","__proto__":{"polluted":1}}}');
  const { port, hub } = await start({ dataFile: file });
  assert.equal({}.polluted, undefined);
  await post(port, { type: 'createTicket', payload: { items: [{ menuId: 'brisket_half' }] } });
  hub.flush();
  const files = fs.readdirSync(dir);
  assert.ok(files.every((f) => f === 'state.json' || /^state\.json\.(tmp|wal|wal\.tmp|screens|screens\.tmp|admin)$/.test(f)), 'only the data file and its own companions: ' + files);
  JSON.parse(fs.readFileSync(file, 'utf8'));
});

test('a replayed opId is answered, not applied twice, even under 200 parallel duplicates', async () => {
  const { port, hub } = await start({ starter: true });
  const body = { type: 'createTicket', opId: 'same-op', payload: { items: [{ menuId: 'tea' }] } };
  const rs = await Promise.all(Array.from({ length: 200 }, () => post(port, body)));
  assert.ok(rs.every((r) => r.status === 200));
  assert.equal(hub.snapshot().state.tickets.length, 1, 'one ticket');
  assert.equal(rs.filter((r) => r.body && r.body.duplicate).length, 199);
});

test('time never runs backwards or into the future through the at field', async () => {
  const { port, hub } = await start({ starter: true, now: () => 1_800_000_000_000 });
  await post(port, { type: 'createTicket', payload: { items: [{ menuId: 'tea' }] }, at: 1_800_000_000_000 + 86400e3 * 365 });
  await post(port, { type: 'createTicket', payload: { items: [{ menuId: 'tea' }] }, at: 5 });
  const t = hub.snapshot().state.tickets;
  assert.ok(t.every((x) => x.createdAt <= 1_800_000_000_000), 'no ticket is stamped in the future');
  assert.ok(t.every((x) => x.createdAt >= 1_700_000_000_000), 'and none is stamped in 1970');
});

test('cross-site forgery: a form-style POST or a POST that names another origin is refused and changes nothing', async () => {
  const { port, hub } = await start({ starter: true });
  const body = JSON.stringify({ type: 'createTicket', payload: { items: [{ menuId: 'tea' }] } });
  const textPlain = await post(port, body, { 'content-type': 'text/plain' });
  assert.equal(textPlain.status, 415, 'text/plain (a "simple" cross-site request) is refused');
  const form = await post(port, body, { 'content-type': 'application/x-www-form-urlencoded' });
  assert.equal(form.status, 415);
  const evil = await post(port, body, { origin: 'https://evil.example' });
  assert.equal(evil.status, 403, 'another origin is refused');
  const same = await post(port, body, { origin: 'http://127.0.0.1:' + port });
  assert.equal(same.status, 200, 'the page itself still works');
  assert.equal(hub.snapshot().state.tickets.length, 1, 'only the legitimate order was applied');
});
