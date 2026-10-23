// The hub's write-ahead log: an action applied after the last save but before a crash is replayed from the log, its answer is remembered, and a
// resend is a duplicate. Run: node --test --test-force-exit test/hub-wal.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createHub } from '../server/server.mjs';

const post = (port, body) => new Promise((resolve) => {
  const d = JSON.stringify(body);
  const r = http.request({ host: '127.0.0.1', port, path: '/action', method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(d) } }, (res) => { let t = ''; res.on('data', (c) => (t += c)); res.on('end', () => resolve(JSON.parse(t))); });
  r.end(d);
});

test('an action after the last save survives a crash through the log, and a resend is a duplicate', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sbwal-')), file = path.join(dir, 'state.json');
  const hub = await createHub({ dataFile: file, starter: true, saveMs: 600000 });
  const port = await hub.listen(0, '127.0.0.1');
  const m = hub.snapshot().state.menu[0].id;
  const a1 = { type: 'createTicket', payload: { customer: 'Saved', items: [{ menuId: m }] }, opId: 't:1', clientId: 't' };
  const a2 = { type: 'createTicket', payload: { customer: 'OnlyInLog', items: [{ menuId: m }] }, opId: 't:2', clientId: 't' };
  assert.equal((await post(port, a1)).report, 'ok');
  hub.flush();                                       // the file now holds the first ticket
  assert.equal((await post(port, a2)).report, 'ok'); // the file does not hold this one, the log does
  const crash = path.join(dir, 'crash.json');
  fs.copyFileSync(file, crash); fs.copyFileSync(file + '.wal', crash + '.wal');
  assert.ok(!fs.readFileSync(crash, 'utf8').includes('OnlyInLog'));
  await hub.close();
  const hub2 = await createHub({ dataFile: crash, starter: true });
  const port2 = await hub2.listen(0, '127.0.0.1');
  try {
    const names = hub2.snapshot().state.tickets.map((t) => t.customer).sort();
    assert.deepEqual(names, ['OnlyInLog', 'Saved']);
    const again = await post(port2, a2);
    assert.equal(again.duplicate, true);
    assert.equal(hub2.snapshot().state.tickets.length, 2);
    // the resend of the first action is a duplicate too, and a new action still works
    assert.equal((await post(port2, a1)).duplicate, true);
    assert.equal((await post(port2, { type: 'createTicket', payload: { customer: 'New', items: [{ menuId: m }] }, opId: 't:3', clientId: 't' })).report, 'ok');
  } finally { await hub2.close(); }
});

test('a half-written last line in the log is ignored', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sbwal2-')), file = path.join(dir, 'state.json');
  const hub = await createHub({ dataFile: file, starter: true, saveMs: 600000 });
  const port = await hub.listen(0, '127.0.0.1');
  const m = hub.snapshot().state.menu[0].id;
  await post(port, { type: 'createTicket', payload: { customer: 'One', items: [{ menuId: m }] }, opId: 'x:1', clientId: 'x' });
  hub.flush();
  await post(port, { type: 'createTicket', payload: { customer: 'Two', items: [{ menuId: m }] }, opId: 'x:2', clientId: 'x' });
  const crash = path.join(dir, 'c.json');
  fs.copyFileSync(file, crash); fs.writeFileSync(crash + '.wal', fs.readFileSync(file + '.wal', 'utf8') + '{"n":99,"type":"createTi');
  await hub.close();
  const hub2 = await createHub({ dataFile: crash, starter: true });
  try { assert.deepEqual(hub2.snapshot().state.tickets.map((t) => t.customer).sort(), ['One', 'Two']); } finally { await hub2.close(); }
});
