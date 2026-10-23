// Review finding #14 (second half): after the hub restarts, an action the screen sends again (its answer was lost with the old process) must be answered as
// a duplicate and not applied twice. Uses the hub in this process with a data file, closed and opened again (a clean stop) and with the file copied
// before the close (a crash that lost the in-memory memory). Run: node --test --test-force-exit test/review-fix-restart.test.mjs
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

for (const mode of ['clean stop', 'crash (file copied before the stop)']) {
  test('#14: after a restart (' + mode + ') a resent action is a duplicate, not a second ticket', { todo: 'known open: backport the connected hub write-ahead log (A5)' }, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sbrestart-')), file = path.join(dir, 'state.json');
    let hub = await createHub({ dataFile: file, starter: true }); let port = await hub.listen(0, '127.0.0.1');
    const snapRes = await fetch('http://127.0.0.1:' + port + '/events'); const rd = snapRes.body.getReader(); let buf = ''; while (!/data: /.test(buf)) buf += Buffer.from((await rd.read()).value).toString(); await rd.cancel();
    const m = JSON.parse(/data: (.*)/.exec(buf)[1]).state.menu[0].id;
    const act = { type: 'createTicket', payload: { customer: 'Once', items: [{ menuId: m }] }, opId: 'tab:1', clientId: 'tab' };
    const first = await post(port, act); assert.equal(first.report, 'ok', JSON.stringify(first));
    let saved = file;
    if (mode.startsWith('crash')) { saved = path.join(dir, 'copy.json'); await new Promise((r) => setTimeout(r, 1200)); fs.copyFileSync(file, saved); for (const ext of ['.wal', '.admin', '.screens']) if (fs.existsSync(file + ext)) fs.copyFileSync(file + ext, saved + ext); }
    await hub.close();
    hub = await createHub({ dataFile: saved, starter: true }); port = await hub.listen(0, '127.0.0.1');
    const again = await post(port, act);
    const s2 = await fetch('http://127.0.0.1:' + port + '/events'); const rd2 = s2.body.getReader(); let b2 = ''; while (!/data: /.test(b2)) b2 += Buffer.from((await rd2.read()).value).toString(); await rd2.cancel();
    const n = JSON.parse(/data: (.*)/.exec(b2)[1]).state.tickets.filter((t) => t.customer === 'Once').length;
    await hub.close();
    assert.equal(again.duplicate, true, 'the resend is answered as a duplicate: ' + JSON.stringify(again));
    assert.equal(n, 1, 'exactly one ticket, got ' + n);
  });
}
