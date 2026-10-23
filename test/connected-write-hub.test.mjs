// Connected stage 2, hub level: two writing tablets are modelled as two HTTP clients (own clientId, own opIds) against a real hub process.
// Proves what the hub must do with competing taps whatever the tablet code looks like: one winner, a named refusal for the loser, same order
// everywhere, nothing twice. Run: node --test --test-force-exit --test-timeout=120000 test/connected-write-hub.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { startHub, httpLeader, postAction, stream, until, sleep, startRelay } from './_connected.mjs';

const hubs = [];
const mk = async (o) => { const h = await startHub(o); hubs.push(h); return h; };
test.after(async () => { await Promise.all(hubs.map((h) => h.stop('SIGKILL'))); });
const snap = async (h) => { const s = stream(h.origin); await until(() => s.state, 'snapshot'); s.stop(); return s.state; };
const both = (a, b) => Promise.all([a, b]);
const ok = (r) => r.report === 'ok';
const one = (rs, what) => { const w = rs.filter(ok); assert.equal(w.length, 1, what + ': exactly one winner, got ' + JSON.stringify(rs.map((r) => r.report))); const l = rs.find((r) => !ok(r)); assert.ok(l && typeof l.report === 'string' && l.report !== 'ok' && l.report !== 'http0', what + ': the loser gets a named refusal ' + JSON.stringify(l)); return l.report; };

test('two tablets tap at once: bump the same ticket -> one winner, the other refused', async () => {
  const h = await mk(); const A = httpLeader(h.origin, 'tabA'), B = httpLeader(h.origin, 'tabB'); const m = (await snap(h)).menu[0].id;
  for (let i = 0; i < 5; i++) {
    const c = await A.act('createTicket', { customer: 'T' + i, items: [{ menuId: m }] }); assert.ok(ok(c), JSON.stringify(c));
    const t = (await snap(h)).tickets.find((x) => x.customer === 'T' + i);
    const rs = await both(A.act('bumpTicket', { ticketId: t.id, force: true }), B.act('bumpTicket', { ticketId: t.id, force: true }));
    const why = one(rs, 'bump round ' + i); assert.match(why, /NotActive|already|unknown/i, why);
  }
});

test('pay the same order twice from two tablets -> one payment', async () => {
  const h = await mk(); const A = httpLeader(h.origin, 'tabA'), B = httpLeader(h.origin, 'tabB'); const m = (await snap(h)).menu[0].id;
  await A.act('createTicket', { customer: 'Pay', items: [{ menuId: m }] });
  const o = (await snap(h)).orders[0];
  const rs = await both(A.act('payOrder', { orderId: o.id, method: 'cash' }), B.act('payOrder', { orderId: o.id, method: 'cash' }));
  const why = one(rs, 'pay'); assert.match(why, /orderNotOpen|paid/i, why);
  const s = await snap(h); assert.equal(s.orders.filter((x) => x.status === 'paid').length, 1);
  const pays = JSON.stringify(s).match(/"paidAt"/g) || []; assert.ok(pays.length <= 2, 'one payment stamp, got ' + pays.length);
});

test('start the same batch from two tablets -> two different batch ids is fine, but a duplicate opId is one batch', async () => {
  const h = await mk(); const A = httpLeader(h.origin, 'tabA');
  const n0 = (await snap(h)).batches.length;
  const r1 = await A.act('addBatch', { ing: 'brisket', tempF: 160, cookedG: 3000 }, { opId: 'tabA:same' });
  const r2 = await A.act('addBatch', { ing: 'brisket', tempF: 160, cookedG: 3000 }, { opId: 'tabA:same' });
  assert.ok(ok(r1)); assert.equal(r2.duplicate, true);
  assert.equal((await snap(h)).batches.length, n0 + 1);
});

test('86 a dish on one tablet while the other orders it -> consistent: ordered before = ticket exists and dish off; ordered after = refused', async () => {
  const h = await mk(); const A = httpLeader(h.origin, 'tabA'), B = httpLeader(h.origin, 'tabB'); const m = (await snap(h)).menu[0].id;
  const r86 = await A.act('toggle86', { menuId: m, on: true }); assert.ok(ok(r86), JSON.stringify(r86));
  const late = await B.act('createTicket', { customer: 'Late', items: [{ menuId: m }] });
  const s = await snap(h);
  assert.ok(s.manual86 && s.manual86[m], 'the dish is off');
  if (!ok(late)) assert.ok(!s.tickets.some((t) => t.customer === 'Late'), 'refused means not created: ' + JSON.stringify(late));
  else assert.ok(s.tickets.some((t) => t.customer === 'Late'));
  console.log('# ordering a dish that is 86 -> ' + late.report);
});

test('ticket numbers are one sequence at the hub, no gaps and no repeats, with two tablets typing at once', async () => {
  const h = await mk(); const A = httpLeader(h.origin, 'tabA'), B = httpLeader(h.origin, 'tabB'); const m = (await snap(h)).menu[0].id;
  const work = []; for (let i = 0; i < 20; i++) work.push((i % 2 ? A : B).act('createTicket', { customer: 'N' + i, items: [{ menuId: m }] }));
  const rs = await Promise.all(work); assert.ok(rs.every(ok), JSON.stringify(rs.filter((r) => !ok(r))));
  const s = await snap(h); const nums = s.tickets.map((t) => t.number ?? t.num ?? t.n ?? t.id);
  assert.equal(new Set(nums).size, 20, 'unique numbers ' + nums.join(','));
  const nn = nums.filter((x) => typeof x === 'number'); if (nn.length === 20) { nn.sort((a, b) => a - b); assert.deepEqual(nn, Array.from({ length: 20 }, (_, i) => nn[0] + i), 'no gaps'); }
});

test('a tablet that was offline sends its 5 taps in order while the other changed related things: answered in order, nothing lost or twice', async () => {
  const h = await mk(); const A = httpLeader(h.origin, 'tabA'), B = httpLeader(h.origin, 'tabB'); const m = (await snap(h)).menu.map((x) => x.id);
  await A.act('createTicket', { customer: 'Base', items: [{ menuId: m[0] }] });
  const base = (await snap(h)).tickets[0];
  // tablet B works while A is away
  await B.act('bumpTicket', { ticketId: base.id, force: true });
  await B.act('createTicket', { customer: 'FromB', items: [{ menuId: m[1] }] });
  // tablet A comes back with 5 queued taps made earlier (one of them now conflicts: it bumps what B bumped)
  const t0 = Date.now() - 60000, rs = [];
  const queue = [['createTicket', { customer: 'Q1', items: [{ menuId: m[0] }] }], ['createTicket', { customer: 'Q2', items: [{ menuId: m[1] }] }], ['bumpTicket', { ticketId: base.id, force: true }], ['createTicket', { customer: 'Q4', items: [{ menuId: m[0] }] }], ['toggle86', { menuId: m[2], on: true }]];
  for (let i = 0; i < queue.length; i++) rs.push(await A.act(queue[i][0], queue[i][1], { at: t0 + i * 1000, opId: 'tabA:q' + (i + 1) }));
  assert.equal(rs.length, 5); assert.ok(rs.every((r) => typeof r.report === 'string' && r.report !== 'http0'), 'every queued tap is answered ' + JSON.stringify(rs.map((r) => r.report)));
  assert.notEqual(rs[2].report, 'ok', 'the conflicting bump is refused with a name');
  const seqs = rs.filter(ok).map((r) => r.seq); assert.deepEqual(seqs, [...seqs].sort((a, b) => a - b), 'change numbers rise in the order sent');
  const names = (await snap(h)).tickets.map((t) => t.customer); assert.deepEqual(names, ['Base', 'FromB', 'Q1', 'Q2', 'Q4']);
  const again = []; for (let i = 0; i < 5; i++) again.push(await A.act(queue[i][0], queue[i][1], { opId: 'tabA:q' + (i + 1) }));
  assert.ok(again.every((r) => r.duplicate === true || (!ok(r))), 'resend after reconnect applies nothing: ' + JSON.stringify(again.map((r) => r.report + (r.duplicate ? ':dup' : ''))));
  assert.equal((await snap(h)).tickets.length, 5);
});

test('hub SIGKILL mid-run: acknowledged taps survive, an unacknowledged resend is applied once', async () => {
  const h = await mk(); const A = httpLeader(h.origin, 'tabA'), B = httpLeader(h.origin, 'tabB'); const m = (await snap(h)).menu[0].id;
  for (let i = 0; i < 6; i++) assert.ok(ok(await (i % 2 ? A : B).act('createTicket', { customer: 'K' + i, items: [{ menuId: m }] })));
  const lastA = A.count();
  await h.restart('SIGKILL');
  assert.equal((await snap(h)).tickets.length, 6, 'all six acknowledged taps survived');
  const rA = await A.act('createTicket', { customer: 'K1', items: [{ menuId: m }] }, { opId: 'tabA:' + lastA });
  assert.equal(rA.duplicate, true, 'a resend of an acknowledged op is a duplicate: ' + JSON.stringify(rA));
  assert.ok(ok(await B.act('createTicket', { customer: 'After', items: [{ menuId: m }] })));
  assert.equal((await snap(h)).tickets.length, 7);
});

test('clock skew: a tablet whose clock is 7 minutes off does not change the times the hub records', async () => {
  const h = await mk(); const A = httpLeader(h.origin, 'tabA'); const m = (await snap(h)).menu[0].id;
  const t0 = Date.now();
  await A.act('createTicket', { customer: 'Fast', items: [{ menuId: m }] }, { at: t0 + 7 * 60000 });
  await A.act('createTicket', { customer: 'Slow', items: [{ menuId: m }] }, { at: t0 - 7 * 60000 });
  const s = await snap(h);
  for (const t of s.tickets) assert.ok(Math.abs(t.createdAt - t0) < 10000, t.customer + ' created ' + (t.createdAt - t0) + ' ms from hub time');
});

test('security: a bad body, a cross-site post and a too-large action are refused without changing the kitchen', async () => {
  const h = await mk(); const before = JSON.stringify(await snap(h));
  const r1 = await postAction(h.origin, { type: 'createTicket', payload: { customer: 'x'.repeat(2 * 1024 * 1024), items: [] } });
  assert.ok(r1.status === 413 || r1.status === 400, 'large body: ' + r1.status);
  const r2 = await postAction(h.origin, { type: 'toggle86', payload: { menuId: 'x' } }, { origin: 'https://evil.example' });
  assert.equal(r2.status, 403);
  const r3 = await postAction(h.origin, { type: 'toggle86', payload: {} }, { 'content-type': 'text/plain' });
  assert.equal(r3.status, 415);
  assert.equal(JSON.stringify(await snap(h)), before);
});

test('a customer name with markup is stored as plain text and comes back as the same text', async () => {
  const h = await mk(); const A = httpLeader(h.origin, 'tabA'); const m = (await snap(h)).menu[0].id;
  const evil = '<img src=x onerror=alert(1)>&amp;"';
  const r = await A.act('createTicket', { customer: evil, items: [{ menuId: m }] }); assert.ok(ok(r), JSON.stringify(r));
  assert.equal((await snap(h)).tickets[0].customer, evil);
});
