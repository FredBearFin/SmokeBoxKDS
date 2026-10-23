// /health (counts only, no secrets), the startup protections summary, and gzip for the follower stream and the probe answer.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import zlib from 'node:zlib';
import { createHub } from '../server/server.mjs';

// Sends one request and returns status, headers and the raw body bytes.
const call = (port, p, { method = 'GET', headers = {}, body } = {}) => new Promise((resolve, reject) => {
  const r = http.request({ host: '127.0.0.1', port, path: p, method, agent: false, headers }, (res) => {
    const parts = []; res.on('data', (c) => parts.push(c)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, raw: Buffer.concat(parts) }));
  });
  r.on('error', reject); r.end(body);
});
const tk = (n) => JSON.stringify({ type: 'createTicket', payload: { customer: 'Guest number ' + n, items: [{ menuId: 'tea' }] }, opId: 'o:' + n });
async function hub(opts) { const h = await createHub(Object.assign({ dataFile: null, starter: true, tickMs: 600000, now: () => Date.now() }, opts)); return { h, port: await h.listen(0) }; }

test('/health: ok, hubId, seq, a count of screens and the uptime, and nothing secret', async () => {
  const { h, port } = await hub({ writeCode: 'SECRETWRITE99', followCode: 'SECRETFOLLOW99' });
  try {
    const r = await call(port, '/health');   // no code needed: a monitor must work without any secret
    assert.equal(r.status, 200); assert.match(r.headers['cache-control'], /no-store/);
    const j = JSON.parse(r.raw.toString());
    assert.deepEqual(Object.keys(j).sort(), ['hubId', 'ok', 'screens', 'seq', 'uptime']);
    assert.equal(j.ok, true); assert.equal(j.hubId, h.hubId); assert.equal(j.seq, 0); assert.equal(j.screens, 0); assert.ok(Number.isInteger(j.uptime) && j.uptime >= 0);
    const all = r.raw.toString();
    for (const secret of ['SECRETWRITE99', 'SECRETFOLLOW99', h.adminKey]) assert.ok(!all.includes(secret));
    assert.equal((await call(port, '/health', { method: 'HEAD' })).status, 200);
    assert.equal((await call(port, '/health', { method: 'POST', body: '{}' })).status === 200, false);
  } finally { await h.close(); }
});

test('protections summary lists what is on and never a code', async () => {
  const { h } = await hub({ writeCode: 'SECRETWRITE99', trustProxy: true, requireTokens: true, serviceWorker: false });
  try {
    assert.deepEqual(h.protections, { trustProxy: true, tokensRequired: true, writeCode: true, followCode: false, serviceWorker: false, gzip: true });
    assert.ok(!JSON.stringify(h.protections).includes('SECRETWRITE99'));
  } finally { await h.close(); }
});

test('the follower snapshot is gzip when accepted, plain otherwise, and a big kitchen stays under a size cap', async () => {
  const { h, port } = await hub({});
  try {
    for (let i = 0; i < 150; i++) await call(port, '/action', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:' + port }, body: tk(i) });
    // Opens /follow, waits for the snapshot, and returns the bytes that crossed the wire plus the decoded text.
    const open = (gz) => new Promise((resolve, reject) => {
      const r = http.request({ host: '127.0.0.1', port, path: '/follow', agent: false, headers: gz ? { 'accept-encoding': 'gzip' } : {} }, (res) => {
        const wire = []; let text = '', n = 0; const g = gz ? zlib.createGunzip() : null;
        const feed = (t) => { text += t; if (text.includes('event: snapshot') && /\n\n$/.test(text)) { res.destroy(); resolve({ enc: res.headers['content-encoding'], wire: n, text }); } };
        if (g) { g.on('data', (c) => feed(c.toString())); g.on('error', reject); }
        res.on('data', (c) => { n += c.length; wire.push(c); if (g) g.write(c); else feed(c.toString()); });
      });
      r.on('error', reject); r.end();
    });
    const plain = await open(false), gz = await open(true);
    assert.equal(plain.enc, undefined); assert.equal(gz.enc, 'gzip');
    assert.ok(gz.text.includes('Guest number 149'), 'the decoded snapshot holds the whole kitchen');
    assert.ok(gz.wire < plain.wire / 3, 'compressed ' + gz.wire + ' vs plain ' + plain.wire);
    assert.ok(gz.wire < 120 * 1024, 'a 150-ticket first snapshot stays under 120 KB on the wire');
  } finally { await h.close(); }
});

test('events after the snapshot still arrive at once on a gzip stream, and the stream ends when the hub closes', async () => {
  const { h, port } = await hub({});
  const seen = await new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, path: '/follow', agent: false, headers: { 'accept-encoding': 'gzip' } }, (res) => {
      const g = zlib.createGunzip(); let text = '', posted = false, ended = false;
      g.on('data', (c) => {
        text += c.toString();
        if (!posted && text.includes('event: snapshot')) { posted = true; call(port, '/action', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:' + port }, body: tk(1) }); }
        if (posted && text.includes('Guest number 1') && /event: op/.test(text) && !ended) { ended = true; resolve(text); }
      });
      g.on('error', reject); res.pipe(g);
    });
    r.on('error', reject); r.end(); setTimeout(() => reject(new Error('no live event on the gzip stream')), 5000);
  });
  assert.match(seen, /event: op/);
  await h.close();
});

test('the probe answer is gzip when large and accepted; a small one stays plain', async () => {
  const { h, port } = await hub({});
  try {
    const small = await call(port, '/probe', { headers: { 'accept-encoding': 'gzip' } });
    assert.equal(small.status, 200); assert.equal(small.headers['content-encoding'], undefined); assert.ok(JSON.parse(small.raw.toString()));
  } finally { await h.close(); }
});

test('gzip can be switched off', async () => {
  const { h, port } = await hub({ gzip: false });
  try {
    const r = await new Promise((resolve) => { const q = http.request({ host: '127.0.0.1', port, path: '/follow', agent: false, headers: { 'accept-encoding': 'gzip' } }, (res) => { res.destroy(); resolve(res.headers); }); q.end(); });
    assert.equal(r['content-encoding'], undefined);
  } finally { await h.close(); }
});
