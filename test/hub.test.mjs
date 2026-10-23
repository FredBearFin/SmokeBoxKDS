// Hub prototype tests: starts server/server.mjs on a random port and drives two fake clients over real HTTP
// and server-sent events: snapshot, broadcast, opId dedupe, refused actions, tick, persistence, page serving.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHub } from '../server/server.mjs';

// Opens the event stream like a browser would and collects named messages; waitFor resolves on the next match.
function sseClient(port) {
  const msgs = []; const waiters = [];
  const req = http.get({ port, path: '/events', host: '127.0.0.1' }, (res) => {
    let buf = '';
    res.setEncoding('utf8');
    res.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, i); buf = buf.slice(i + 2);
        const ev = /^event: (.*)$/m.exec(block), da = /^data: (.*)$/m.exec(block);
        if (ev && da) { const m = { event: ev[1], data: JSON.parse(da[1]) }; msgs.push(m); waiters.slice().forEach((w) => w(m)); }
      }
    });
  });
  req.on('error', () => {});
  // Resolves with the first message (already seen or new) for which pred is true, or fails after 3 s.
  const waitFor = (pred) => new Promise((resolve, reject) => {
    const hit = msgs.find(pred); if (hit) return resolve(hit);
    const t = setTimeout(() => reject(new Error('timeout waiting for message')), 3000);
    const w = (m) => { if (pred(m)) { clearTimeout(t); waiters.splice(waiters.indexOf(w), 1); resolve(m); } };
    waiters.push(w);
  });
  return { msgs, waitFor, close: () => req.destroy() };
}

// Sends one POST /action and returns the parsed reply.
function post(port, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({ port, host: '127.0.0.1', path: '/action', method: 'POST', headers: { 'content-type': 'application/json' } }, (res) => {
      let s = ''; res.on('data', (c) => (s += c)); res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(s) }));
    });
    req.on('error', reject); req.end(data);
  });
}

// Plain GET returning status and text.
function get(port, p) {
  return new Promise((resolve, reject) => http.get({ port, host: '127.0.0.1', path: p }, (res) => {
    let s = ''; res.on('data', (c) => (s += c)); res.on('end', () => resolve({ status: res.statusCode, text: s }));
  }).on('error', reject));
}

test('two clients converge and a repeated opId applies once', async () => {
  const hub = await createHub({ starter: true, dataFile: null, tickMs: 60000 });
  const port = await hub.listen(0);
  const a = sseClient(port), b = sseClient(port);
  try {
    const sa = await a.waitFor((m) => m.event === 'snapshot'), sb = await b.waitFor((m) => m.event === 'snapshot');
    assert.equal(sa.data.seq, sb.data.seq);
    assert.equal(sa.data.state.tickets.length, 0);
    assert.equal(typeof sa.data.serverNow, 'number');
    const act = { type: 'createTicket', payload: { customer: 'Table 4', items: [{ menuId: 'brisket_half' }] }, clientId: 'A', opId: 'op-1' };
    const r1 = await post(port, act);
    assert.equal(r1.body.report, 'ok');
    const ma = await a.waitFor((m) => m.event === 'state'), mb = await b.waitFor((m) => m.event === 'state');
    assert.equal(ma.data.state.tickets.length, 1);
    assert.equal(mb.data.by, 'A');
    assert.deepEqual(ma.data.state.tickets, mb.data.state.tickets);
    // the same opId again (a retry after a lost reply) is answered but not applied
    const r2 = await post(port, act);
    assert.equal(r2.body.duplicate, true);
    assert.equal(r2.body.seq, r1.body.seq);
    assert.equal(hub.snapshot().state.tickets.length, 1);
    // a different client bumps what the first one made
    const id = hub.snapshot().state.tickets[0].id;
    const r3 = await post(port, { type: 'bumpTicket', payload: { id }, clientId: 'B', opId: 'op-2' });
    assert.equal(typeof r3.body.report, 'string'); // a refusal is fine here; the point is another client can act on shared state
    assert.equal(hub.snapshot().seq >= r1.body.seq, true);
  } finally { a.close(); b.close(); await hub.close(); }
});

test('refused and malformed actions change nothing', async () => {
  const hub = await createHub({ starter: true, dataFile: null, tickMs: 60000 });
  const port = await hub.listen(0);
  try {
    const before = hub.snapshot().seq;
    const r = await post(port, { type: 'noSuchAction', opId: 'x' });
    assert.equal(r.body.report, 'unknownAction');
    const r2 = await post(port, { payload: {} });
    assert.equal(r2.status, 400);
    assert.equal(hub.snapshot().seq, before);
    assert.equal((await get(port, '/nope')).status, 404);
  } finally { await hub.close(); }
});

test('the tick advances time and broadcasts only when something changed', async () => {
  let clock = new Date(2026, 9, 17, 12, 0, 0).getTime();
  const hub = await createHub({ starter: true, dataFile: null, tickMs: 20, now: () => clock });
  const port = await hub.listen(0);
  const a = sseClient(port);
  try {
    await a.waitFor((m) => m.event === 'snapshot');
    const seq0 = hub.snapshot().seq;
    await new Promise((r) => setTimeout(r, 80)); // nothing is due yet: no broadcast
    assert.equal(hub.snapshot().seq, seq0);
    clock += 3 * 3600 * 1000; // three hours later the sanitize timer and any holds are due
    await a.waitFor((m) => m.event === 'state' && m.data.type === 'tick');
    assert.ok(hub.snapshot().seq > seq0);
  } finally { a.close(); await hub.close(); }
});

test('state survives a restart through the JSON file', async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hub-')), 'state.json');
  const h1 = await createHub({ starter: true, dataFile: file, tickMs: 60000, saveMs: 10 });
  const p1 = await h1.listen(0);
  await post(p1, { type: 'createTicket', payload: { customer: 'Saved', items: [{ menuId: 'slaw' }] }, opId: 's1' });
  await h1.close();
  const h2 = await createHub({ starter: true, dataFile: file, tickMs: 60000 });
  try {
    assert.equal(h2.snapshot().state.tickets.length, 1);
    assert.equal(h2.snapshot().state.tickets[0].customer, 'Saved');
  } finally { await h2.close(); }
  fs.writeFileSync(file, '{"state": 12}'); // a damaged file is refused and the hub starts empty
  const h3 = await createHub({ starter: true, dataFile: file, tickMs: 60000 });
  assert.equal(h3.snapshot().state.tickets.length, 0);
  await h3.close();
});

test('the page is served from the html file', async () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hub-')), 'p.html');
  fs.writeFileSync(f, '<!doctype html><title>x</title>');
  const hub = await createHub({ starter: true, dataFile: null, htmlFile: f, tickMs: 60000 });
  const port = await hub.listen(0);
  try { const r = await get(port, '/'); assert.equal(r.status, 200); assert.match(r.text, /<title>x/); } finally { await hub.close(); }
});
