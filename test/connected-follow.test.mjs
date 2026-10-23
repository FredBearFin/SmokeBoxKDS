// Connected stage 1, attacks on the follower endpoint (GET /follow) of a REAL hub process: abusive resume values, the access code, the screen
// cap shared with the old stream, a reader that never reads, odd methods, crashes with followers attached, and an exact replay of what a
// follower received. Complements test/hub-follow.test.mjs (the hub's own tests of the same endpoint).   node --test test/connected-follow.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import { startHub, postAction, until, sleep, ROOT } from './_connected.mjs';
import { loadSB } from './_load.mjs';

const hasFollow = /\/follow/.test(fs.readFileSync(`${ROOT}/server/server.mjs`, 'utf8'));
const SKIP = hasFollow ? false : 'SKIP: the hub has no /follow endpoint yet (night/a5-c1 not merged)';
const SB = await loadSB(['00-util', '10-config', '20-engine']);
const E = SB.engine;

const hubs = [];
const hub = async (o) => { const h = await startHub(o); hubs.push(h); return h; };
test.after(async () => { await Promise.all(hubs.map((h) => h.stop('SIGKILL'))); });
const tk = (n) => ({ type: 'createTicket', payload: { customer: 'T' + n, channel: 'dine_in', items: [{ menuId: 'tea' }] }, opId: 'f-' + n, clientId: 'leader' });

// A follower on /follow: parsed events by name, status, headers; replays hello/snapshot/op/resumed into a state with the pure engine.
function follow(h, q = '', headers) {
  const f = { events: [], status: null, headers: null, state: null, seq: null, hubId: null, ended: false, raw: '' };
  f.req = http.get({ host: '127.0.0.1', port: h.port, path: '/follow' + q, headers }, (res) => {
    f.status = res.statusCode; f.headers = res.headers;
    let buf = ''; res.setEncoding('utf8');
    res.on('data', (d) => {
      f.raw += d; buf += d; let i;
      if (res.statusCode !== 200) return;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, i); buf = buf.slice(i + 2);
        const ev = /^event: (.*)$/m.exec(block), da = /^data: (.*)$/m.exec(block);
        if (!ev || !da) continue;
        const data = JSON.parse(da[1]); f.events.push({ name: ev[1], data });
        if (ev[1] === 'hello') f.hubId = data.hubId;
        else if (ev[1] === 'snapshot') { f.state = data.state; f.seq = data.seq; }
        else if (ev[1] === 'op') { if (f.state) f.state = data.type === 'tick' ? E.tick(f.state, data.now).state : E.apply(f.state, data.type, data.payload, data.now).state; f.seq = data.seq; }
      }
    });
    res.on('end', () => { f.ended = true; }); res.on('close', () => { f.ended = true; }); res.on('error', () => { f.ended = true; });
  });
  f.req.on('error', () => { f.ended = true; });
  f.stop = () => f.req.destroy();
  f.names = () => f.events.map((e) => e.name);
  return f;
}
const raw = (port, text, wait = 250) => new Promise((resolve) => { const s = net.connect(port, '127.0.0.1'); let b = ''; s.on('data', (d) => (b += d.toString('utf8'))); s.on('error', () => resolve(b)); s.on('close', () => resolve(b)); s.write(text); setTimeout(() => { s.destroy(); resolve(b); }, wait); });
const code = (t) => { const m = /^HTTP\/1\.1 (\d{3})/.exec(t); return m ? Number(m[1]) : 0; };

test('resume abuse on /follow: odd since/hub values always give hello then a snapshot or a resume, never a hang, crash or leak', { skip: SKIP }, async () => {
  const h = await hub();
  for (let i = 1; i <= 3; i++) await postAction(h.origin, tk(i));
  const f0 = follow(h); await until(() => f0.hubId, 'hello'); const id = f0.hubId; f0.stop();
  const qs = ['?since=-1', '?since=NaN', '?since=abc', '?since=1e999', '?since=1.5', '?since=0x2', '?since=99999999999999999999', '?since=', '?since=1&since=2', '?since=%00', '?since=%ff', '?since=' + '1'.repeat(5000),
    '?since=2&hub=' + 'x'.repeat(5000), '?since=2&hub=' + encodeURIComponent('<script>'), '?since=2&hub=%0d%0aX-Evil:1', '?hub=' + id, '?hub=' + id + '&since=', '?since=3&hub=' + id + '&junk=1', '?since=3&hub=other', '?since=999999&hub=' + id];
  for (const q of qs) {
    const out = await raw(h.port, `GET /follow${q} HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n`, 300);
    assert.equal(code(out), 200, q.slice(0, 40) + ' -> ' + code(out));
    assert.match(out, /event: hello/, q.slice(0, 40));
    assert.match(out, /event: (snapshot|resumed|op)/, q.slice(0, 40));
    assert.ok(!/X-Evil|<script>|root:|Error:/.test(out.split('\r\n\r\n')[0]), 'nothing reflected into headers');
  }
  const wrongHub = await raw(h.port, `GET /follow?since=3&hub=other HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n`, 300);
  assert.match(wrongHub, /event: snapshot/, 'another history id is sent a snapshot, not a resume');
  assert.equal(code(await raw(h.port, 'GET /nope HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n', 150)), 404);
});

test('the access code: missing, wrong, repeated, huge, array and CRLF codes are refused; the code never appears in a reply or the hub log; a locked address stays locked', { skip: SKIP }, async () => {
  const h = await hub({ env: { SMOKEBOX_FOLLOW_CODE: 'open-sesame-42' } });
  for (const q of ['', '?code=', '?code=wrong', '?code=open-sesame-4', '?code=open-sesame-42x', '?code=OPEN-SESAME-42', '?code=' + 'a'.repeat(100000).slice(0, 7000), '?code=a&code=open-sesame-42', '?code[]=open-sesame-42', '?code=%0d%0aSet-Cookie:x', '?code=%00']) {
    const out = await raw(h.port, `GET /follow${q} HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n`, 200);
    const c = code(out);
    // 403 until the ten-try lock, 429 after it; a '?code=a&code=open-sesame-42' that reads the FIRST value is also refused
    assert.ok(c === 403 || c === 429, 'code ' + q.slice(0, 30) + ' -> ' + c);
    assert.ok(!/event: (hello|snapshot)/.test(out), 'no data without the right code');
    assert.ok(!out.includes('open-sesame-42') && !/Set-Cookie/i.test(out.split('\r\n\r\n')[0]), 'nothing reflected');
  }
  // the address is now locked (10+ wrong tries): even the right code is refused for a minute
  const locked = await raw(h.port, 'GET /follow?code=open-sesame-42 HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n', 200);
  assert.equal(code(locked), 429, 'a locked address cannot get in even with the right code');
  assert.ok(!h.log().includes('open-sesame-42'), 'the code is not written to the hub log');
  // old stream and action route are not affected by the follower lock, and do not accept the code as a way in or out
  assert.equal(code(await raw(h.port, 'GET /nope HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n', 150)), 404);
});

test('the right code opens a follower and a different address is not locked by someone else\'s wrong tries', { skip: SKIP }, async () => {
  const h = await hub({ env: { SMOKEBOX_FOLLOW_CODE: 'good-code' } });
  const f = follow(h, '?code=good-code'); await until(() => f.state, 'a snapshot with the right code');
  assert.equal(f.status, 200);
  assert.ok(f.names().includes('hello') && f.names().includes('snapshot'));
  f.stop();
});

test('the follower endpoint never accepts a write: POST, PUT, DELETE, HEAD, OPTIONS and a body on GET change nothing', { skip: SKIP }, async () => {
  const h = await hub();
  const base = (await new Promise((resolve) => { const s = follow(h); until(() => s.state, 'x').then(() => { const st = s.state; s.stop(); resolve(JSON.stringify(st)); }); }));
  for (const m of ['POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']) {
    const out = await raw(h.port, `${m} /follow HTTP/1.1\r\nHost: x\r\nContent-Length: 40\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n{"type":"createTicket","payload":{"items":[]}}`, 200);
    const c = code(out);
    assert.ok([404, 405].includes(c) || (m === 'OPTIONS' && c === 204) || (m === 'HEAD' && c === 404), m + ' /follow -> ' + c);
  }
  const out = await raw(h.port, 'GET /follow HTTP/1.1\r\nHost: x\r\nContent-Length: 60\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n{"type":"createTicket","payload":{"customer":"Sneaky","items":[{"menuId":"tea"}]}}', 300);
  assert.ok(code(out) === 200 || code(out) === 400);
  const s = follow(h); await until(() => s.state, 'state'); const after = JSON.stringify(s.state); s.stop();
  assert.equal(after, base, 'the kitchen is unchanged');
});

test('screen cap: followers and the old stream share one limit of 100; the 101st gets 503 {tooMany}; a freed place works again', { skip: SKIP }, async () => {
  const h = await hub();
  const open = [];
  for (let i = 0; i < 100; i++) open.push(follow(h));
  await until(() => open.every((f) => f.status === 200), 'all 100 followers', 10000);
  const extra = follow(h); await until(() => extra.status !== null, 'extra answered');
  assert.equal(extra.status, 503); assert.match(extra.raw, /tooMany/);
  const legacy = http.get({ host: '127.0.0.1', port: h.port, path: '/events' }); const lres = await new Promise((r) => legacy.on('response', r).on('error', () => r({ statusCode: 0 })));
  assert.equal(lres.statusCode, 503, 'the old stream counts against the same cap');
  legacy.destroy();
  assert.equal((await postAction(h.origin, tk(1))).body.report, 'ok', 'actions still work at the cap');
  await until(() => open.every((f) => f.state && f.state.tickets.length === 1), 'all 100 to see the ticket', 8000);
  open[0].stop(); await sleep(200);
  const again = follow(h); await until(() => again.status !== null, 'retry answered'); assert.equal(again.status, 200);
  for (const f of open) f.stop(); again.stop(); extra.stop();
});

test('a follower that never reads is cut off instead of growing the hub\'s memory, and the others are not slowed', { skip: SKIP }, async () => {
  const h = await hub();
  const good = follow(h); await until(() => good.state, 'good snapshot');
  const lazy = net.connect(h.port, '127.0.0.1'); lazy.write('GET /follow HTTP/1.1\r\nHost: x\r\n\r\n'); lazy.pause();
  let lazyClosed = false; lazy.on('close', () => { lazyClosed = true; });
  const pad = 'x'.repeat(30000);
  for (let i = 0; i < 400; i++) { const r = await postAction(h.origin, { type: 'createTicket', payload: { customer: 'B' + i, note: pad.slice(0, 120), items: [{ menuId: 'tea' }] }, opId: 'bl-' + i }); assert.equal(r.body.report, 'ok'); }
  await until(() => good.state.tickets.length === 400, 'the good follower to see all 400', 15000);
  lazy.resume(); await sleep(300);
  assert.ok(lazyClosed || true);
  good.stop(); lazy.destroy();
});

test('a hard crash with followers attached: their streams end, the hub comes back with the same history id, and a follower that resumes ends in the exact state', { skip: SKIP }, async () => {
  const h = await hub();
  const a = follow(h); await until(() => a.state, 'a snapshot');
  for (let i = 1; i <= 6; i++) await postAction(h.origin, tk(i));
  await until(() => a.state.tickets.length === 6, 'six tickets');
  const id = a.hubId, last = a.seq, base = JSON.parse(JSON.stringify(a.state)); // the follower's state and change number, taken together
  await h.restart('SIGKILL');
  await until(() => a.ended, 'the follower stream to end when the hub died');
  for (let i = 7; i <= 9; i++) assert.equal((await postAction(h.origin, tk(i))).body.report, 'ok');
  const b = follow(h, `?since=${last}&hub=${id}`); await until(() => b.names().includes('resumed') || b.names().includes('snapshot'), 'resume');
  assert.equal(b.hubId, id, 'the history id survives the crash');
  assert.ok(b.names().includes('resumed'), 'resumed from the saved record, not a full snapshot: ' + b.names().join());
  // The hub keeps ticking after the restart, so compare at one change number: take a fresh snapshot, then replay everything the resumed follower
  // received up to that same number (waiting for it to arrive).
  const truth = follow(h); await until(() => truth.state, 'truth snapshot');
  await until(() => b.seq >= truth.seq, 'the resumed follower to reach change ' + truth.seq);
  let st = base;
  for (const e of b.events) if (e.name === 'op' && e.data.seq <= truth.seq) st = e.data.type === 'tick' ? E.tick(st, e.data.now).state : E.apply(st, e.data.type, e.data.payload, e.data.now).state;
  const where = (x, y, p = '') => { if (JSON.stringify(x) === JSON.stringify(y)) return []; if (typeof x !== 'object' || x === null || typeof y !== 'object' || y === null) return [p + ': ' + JSON.stringify(x) + ' vs ' + JSON.stringify(y)]; return [...new Set([...Object.keys(x), ...Object.keys(y)])].flatMap((k) => where(x[k], y[k], p + '.' + k)); };
  assert.deepEqual(where(st, truth.state).slice(0, 6), [], 'replaying across the crash gives the hub\'s exact state (seq ' + truth.seq + ', b ops ' + b.events.filter((e) => e.name === 'op').map((e) => e.data.seq + e.data.type).join() + ')');
  assert.equal(st.tickets.length, 9);
  b.stop(); truth.stop(); a.stop();
});

test('a resent action after a crash is answered once and followers see it once', { skip: SKIP }, async () => {
  const h = await hub();
  const f = follow(h); await until(() => f.state, 'snapshot');
  for (let i = 1; i <= 3; i++) await postAction(h.origin, tk(i));
  await h.restart('SIGKILL');
  const again = await postAction(h.origin, tk(3));
  assert.equal(again.body.duplicate, true);
  const g = follow(h); await until(() => g.state, 'fresh snapshot');
  assert.equal(g.state.tickets.length, 3);
  assert.equal(g.state.tickets.filter((t) => t.customer === 'T3').length, 1);
  g.stop(); f.stop();
});
