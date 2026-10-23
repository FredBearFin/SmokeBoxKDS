// Independent check of the office STATISTICS (not only the sums): the naive reference in test/_metrics-ref.mjs, written from the plain-words
// definitions, is compared with src/js/40-metrics.js on many random kitchens: counter-service (auto) tickets, voids, forced bumps, unfinished
// lines, tickets across midnight, ties, the two clock-change weekends, empty and one-ticket ranges. Run it in several time zones:
//   TZ=America/New_York node --test test/metrics-reference.test.mjs     (also America/Chicago and UTC)
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSB } from './_load.mjs';
import * as R from './_metrics-ref.mjs';
import { buildBig } from './_big-kitchen.mjs';

const SB = await loadSB(['00-util', '10-config', '20-engine', '40-metrics']);
const M = SB.metrics, C = SB.config, U = SB.util;
const SEEDS = Number(process.env.SEEDS) || 60;
// Six kitchens built by the real engine (two-step items, pacing holds, real stamps), the last days of which touch the two clock changes.
const ENGINE = [];
for (const [i, end] of [[1, new Date(2026, 2, 10)], [2, new Date(2026, 2, 8)], [3, new Date(2026, 10, 2)], [4, new Date(2026, 10, 1)], [5, new Date(2026, 9, 20)], [6, new Date(2026, 2, 9)]]) {
  const k = await buildBig({ tickets: 160, days: 6, seed: i, endDay: end.getTime() });
  const st = k.state;
  ENGINE.push({ tickets: st.tickets, events: k.SB.engine.allEvents(st), batches: st.batches, learned: st.learned || {}, menu: st.menu, ingredients: st.ingredients, settings: st.settings, range: { from: -Infinity, to: Infinity } });
}
const TOTAL = SEEDS + ENGINE.length;

// A small seeded random generator so every run builds the same kitchens.
function rng(seed) { let s = seed >>> 0; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; }
const START_DATES = [[2026, 2, 6], [2026, 9, 29], [2026, 9, 12], [2026, 10, 1], [2026, 2, 7], [2026, 10, 0]];
const ZONES = ['pit', 'fry', 'cold', 'sides'];

// Builds a dataset of hand-made tickets over several days (some at the clock changes) with every awkward case the pages must survive.
function makeDs(seed) {
  if (seed >= SEEDS) return ENGINE[seed - SEEDS];
  const r = rng(seed * 7919 + 13), pick = (a) => a[Math.floor(r() * a.length)];
  const [y, m, d0] = START_DATES[seed % START_DATES.length];
  const tickets = []; let id = 0;
  const days = 3 + Math.floor(r() * 4);
  for (let d = 0; d < days; d++) {
    const n = 4 + Math.floor(r() * 22);
    for (let k = 0; k < n; k++) {
      // hour 10 to 27.9: after midnight too (hours 24 to 27 are the night of the same service day)
      const hr = 10 + r() * 18, create = new Date(y, m, d0 + d, Math.floor(hr), Math.floor((hr % 1) * 60), r() < 0.3 ? 0 : Math.floor(r() * 60), r() < 0.5 ? 0 : Math.floor(r() * 1000)).getTime();
      const channel = r() < 0.04 ? 'weird_channel' : pick(['dine_in', 'takeout', 'drive_thru', 'third_party']);
      const roll = r();
      const status = roll < 0.08 ? 'voided' : roll < 0.14 ? 'active' : 'expedited';
      const items = [];
      let lastDone = create;
      const usedDone = new Set();
      for (let i = 0, ni = 1 + Math.floor(r() * 4); i < ni; i++) {
        const zone = pick(ZONES), twoStep = r() < 0.5;
        const fired = create + Math.floor(r() * 90) * 1000 + (r() < 0.2 ? 0 : 0);
        const started = twoStep ? fired + Math.floor(r() * 200) * 1000 : undefined;
        let done = (started || fired) + Math.floor(r() * 600) * 1000 + i + 1;
        if (r() < 0.12 && lastDone > fired) done = lastDone;          // a tie with the previous item's finish time
        while (usedDone.has(done) && !(done === lastDone)) done += 1;
        usedDone.add(done);
        const st = status === 'expedited' ? (r() < 0.9 ? 'done' : 'displayed') : (r() < 0.5 ? 'done' : 'queued');
        const it = { id: 'i' + id + '_' + i, menuId: 'm' + Math.floor(r() * 6), name: 'Dish', zone, qty: 1 + Math.floor(r() * 3), price: r() < 0.9 ? 5 + Math.floor(r() * 12) : undefined, status: st, firedAt: fired };
        if (twoStep && r() < 0.95) it.startedAt = started;
        if (st === 'done') it.doneAt = done;
        if (r() < 0.05) it.auto = true;
        if (r() < 0.03) delete it.firedAt;
        items.push(it);
        if (st === 'done' && done > lastDone) lastDone = done;
      }
      const t = { id: 't' + (id++), num: id, channel, createdAt: create, status, items, recalls: r() < 0.1 ? 1 : 0, forced: status === 'expedited' && r() < 0.06 };
      if (status === 'voided') t.voidedAt = create + 60000;
      if (status === 'expedited') {
        t.expeditedAt = Math.max(lastDone, create) + Math.floor(r() * 120) * 1000;
        if (r() < 0.12) { t.auto = true; t.expeditedAt = create + 1000; }                       // counter service: closed when paid
        if (r() < 0.02) t.expeditedAt = create;                                                  // zero time
      }
      tickets.push(t);
    }
  }
  tickets.sort((a, b) => a.createdAt - b.createdAt);
  const settings = r() < 0.2 ? { service: { dayStartHour: pick([0, 3, 5]) } } : {};
  return { tickets, events: [], batches: [], learned: {}, menu: [], ingredients: [], settings, range: { from: -Infinity, to: Infinity } };
}
// The ranges each dataset is checked over: everything, one channel, a cut through the middle, nothing, and exactly one ticket.
function rangesOf(ds) {
  const ts = ds.tickets.map((t) => t.createdAt), mid = ts[Math.floor(ts.length / 2)], one = ts[1];
  return [{}, { channel: 'takeout' }, { from: mid, to: Infinity }, { from: -Infinity, to: mid }, { from: 5, to: 5 }, { from: one, to: one + 1 }];
}
// Compares two numbers (or two nulls) within a tiny tolerance, with a message that names the case.
function same(a, b, msg) {
  if (a === null || b === null || a === undefined || b === undefined) { assert.equal(a == null ? null : a, b == null ? null : b, msg); return; }
  assert.ok(Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b)), msg + ': got ' + a + ', expected ' + b);
}
const tag = (seed, o) => 'seed ' + seed + ' ' + JSON.stringify(o) + ' TZ ' + (process.env.TZ || '') + ': ';
const withR = (ds, o) => Object.assign({}, ds, { range: { from: o.from !== undefined ? o.from : -Infinity, to: o.to !== undefined ? o.to : Infinity } });

test('headline numbers, ticket-time percentiles and on-time counts agree with the naive reference', () => {
  for (let seed = 0; seed < TOTAL; seed++) {
    const ds = makeDs(seed);
    for (const o of rangesOf(ds)) {
      const g = M.summary(withR(ds, o), o.channel ? { channel: o.channel } : {}), e = R.summary(ds, o, C), tg = tag(seed, o);
      for (const k of ['count', 'created', 'avg', 'median', 'p90', 'p95', 'min', 'max', 'ok', 'warn', 'overdue', 'onTimePct', 'activeHours', 'perHour', 'itemsPerHour', 'items', 'voids', 'recalls', 'forced']) same(g[k], e[k], tg + 'summary.' + k);
    }
  }
});

test('ticket time by hour, the weekday heatmap, order types and days agree with the reference', () => {
  for (let seed = 0; seed < TOTAL; seed++) {
    const ds = makeDs(seed);
    for (const o of rangesOf(ds)) {
      const tg = tag(seed, o), d2 = withR(ds, o), mo = o.channel ? { channel: o.channel } : {};
      const bh = M.byHour(d2, mo), eh = R.byHour(ds, o, C);
      assert.deepEqual(bh.map((x) => x.hour), eh.map((x) => x.hour), tg + 'hours listed');
      bh.forEach((x, i) => { same(x.created, eh[i].created, tg + 'hour ' + x.hour + ' created'); same(x.count, eh[i].count, tg + 'hour count'); same(x.medianMs, eh[i].medianMs, tg + 'hour median'); same(x.p90Ms, eh[i].p90Ms, tg + 'hour p90'); same(x.avgMs, eh[i].avgMs, tg + 'hour avg'); });
      const hm = M.byWeekdayHour(d2, mo), eheat = R.heat(ds, o, C);
      let cells = 0;
      hm.rowIds.forEach((wd, ri) => hm.colIds.forEach((h, ci) => { const ex = eheat[wd + '|' + h]; same(hm.values[ri][ci], ex ? ex.median : null, tg + 'heat ' + wd + '/' + h); assert.equal(hm.counts[ri][ci], ex ? ex.n : 0, tg + 'heat count'); if (ex) cells++; }));
      assert.equal(cells, Object.keys(eheat).length, tg + 'every reference cell is on the map');
      const ec = R.byChannel(ds, o, C), bc = M.byChannel(d2, mo);
      assert.deepEqual(bc.map((x) => x.channel).sort(), Object.keys(ec).sort(), tg + 'order types');
      for (const x of bc) { const e = ec[x.channel]; assert.equal(x.created, e.created, tg + x.channel + ' created'); assert.equal(x.count, e.count); same(x.medianMs, e.median, tg + x.channel + ' median'); assert.equal(x.ok, e.ok); assert.equal(x.warn, e.warn); assert.equal(x.overdue, e.overdue); }
      const ed = R.byDay(ds, o, C), bd = M.byDay(d2, mo);
      assert.deepEqual(bd.map((x) => x.date), Object.keys(ed).sort(), tg + 'days listed');
      for (const x of bd) { const e = ed[x.date]; assert.equal(x.tickets, e.tickets, tg + x.date + ' tickets'); assert.equal(x.voids, e.voids, tg + x.date + ' voids'); assert.equal(x.count, e.count); same(x.medianMs, e.median, tg + x.date + ' median'); }
    }
  }
});

test('per-station times, last-finisher counts and top-item counts (done versus sent) agree with the reference', () => {
  for (let seed = 0; seed < TOTAL; seed++) {
    const ds = makeDs(seed);
    for (const o of rangesOf(ds)) {
      const tg = tag(seed, o), d2 = withR(ds, o), mo = o.channel ? { channel: o.channel } : {};
      const ez = R.byZone(ds, o, C), bz = M.byZone(d2, mo);
      assert.deepEqual(bz.map((x) => x.zone).sort(), Object.keys(ez.zones).sort(), tg + 'stations listed');
      for (const x of bz) {
        const e = ez.zones[x.zone];
        assert.equal(x.lines, e.lines, tg + x.zone + ' lines'); assert.equal(x.qty, e.qty, tg + x.zone + ' qty');
        assert.equal(x.responseN, e.respN, tg + x.zone + ' response n'); assert.equal(x.workN, e.workN, tg + x.zone + ' work n');
        same(x.medianResponseMs, e.respMedian, tg + x.zone + ' response median'); same(x.medianWorkMs, e.workMedian, tg + x.zone + ' work median');
        same(x.p90ResponseMs, e.respP90, tg + x.zone + ' response p90'); same(x.p90WorkMs, e.workP90, tg + x.zone + ' work p90');
        assert.equal(x.criticalCount, e.critical, tg + x.zone + ' finished last'); assert.equal(x.overdueCritical, e.overdueCritical, tg + x.zone + ' overdue last');
        same(x.criticalShare, e.share, tg + x.zone + ' last-finisher share');
      }
      const ei = R.items(ds, o, C), bi = M.byItem(d2, mo);
      assert.deepEqual(bi.map((x) => x.menuId).sort(), Object.keys(ei).sort(), tg + 'dishes listed');
      for (const x of bi) { const e = ei[x.menuId]; assert.equal(x.sold, e.sold, tg + x.menuId + ' sold'); assert.equal(x.lines, e.lines); same(x.revenue, e.priced ? e.revenue : null, tg + x.menuId + ' revenue'); }
    }
  }
});

// Counts tickets per wall-clock bucket the way the Pace chart draws them, for one width, and compares with the reference cell by cell.
function checkBuckets(ds, o, bmin, tg) {
  const th = M.throughput(withR(ds, o), Object.assign({ bucketMin: bmin }, o.channel ? { channel: o.channel } : {}));
  const ref = R.buckets(ds, o, C, bmin);
  const seen = new Set(); let tc = 0, td = 0;
  for (const p of th.points) {
    const name = R.cellName(p.t, bmin);
    assert.ok(!seen.has(name), tg + 'bucket drawn once: ' + name); seen.add(name);
    const e = ref.cells[name] || { created: 0, completed: 0 };
    assert.equal(p.created, e.created, tg + 'created in ' + name); assert.equal(p.completed, e.completed, tg + 'finished in ' + name);
    const sv = R.serviceOf(p.t, ref.dsh); same(p.hour, sv.hours - (new Date(p.t).getMinutes() % bmin) / 60 - new Date(p.t).getSeconds() / 3600, tg + 'hour label of ' + name);
    tc += p.created; td += p.completed;
  }
  for (const k of Object.keys(ref.cells)) assert.ok(seen.has(k), tg + 'reference bucket missing from the chart: ' + k);
  assert.equal(tc, Object.values(ref.cells).reduce((a, c) => a + c.created, 0), tg + 'placed total'); assert.equal(td, Object.values(ref.cells).reduce((a, c) => a + c.completed, 0), tg + 'finished total');
  // the busiest bucket is the first one with the most finished tickets
  const best = th.points.reduce((a, p) => (p.y > a ? p.y : a), 0);
  assert.equal(th.peak ? th.peak.y : 0, best, tg + 'peak');
}
test('tickets per 15 minutes and per hour sit in the right wall-clock buckets, also on the clock-change days', () => {
  for (let seed = 0; seed < TOTAL; seed++) {
    const ds = makeDs(seed);
    for (const o of rangesOf(ds).slice(0, 4)) for (const b of [15, 60]) checkBuckets(ds, o, b, tag(seed, o) + 'bucket ' + b + ': ');
  }
});

test('the folded day (average per service day) agrees with the reference', () => {
  for (let seed = 0; seed < TOTAL; seed++) {
    const ds = makeDs(seed), o = {}, bmin = 15, tg = tag(seed, o) + 'fold: ';
    const th = M.throughput(withR(ds, o), { bucketMin: bmin, fold: true }), ref = R.buckets(ds, o, C, bmin);
    // reference: per service day, the wall hour of each non-empty bucket
    const days = new Set(), sums = {};
    for (const [name, c] of Object.entries(ref.cells)) {
      const [dt, tm] = name.split(' '), [yy, mm, dd] = dt.split('-').map(Number), [hh, mi] = tm.split(':').map(Number);
      const sv = R.serviceOf(new Date(yy, mm - 1, dd, hh, mi, 0, 0).getTime(), ref.dsh);
      days.add(sv.date); const slot = Math.round((Math.floor(sv.hours) * 60 + mi) / bmin);
      const s = sums[slot] || (sums[slot] = { created: 0, completed: 0 }); s.created += c.created; s.completed += c.completed;
    }
    if (!days.size) { assert.equal(th.days, 0); continue; }
    assert.equal(th.days, days.size, tg + 'days averaged');
    for (const p of th.points) { const e = sums[p.slot] || { created: 0, completed: 0 }; same(p.created, e.created / days.size, tg + 'slot ' + p.slot + ' created'); same(p.completed, e.completed / days.size, tg + 'slot ' + p.slot + ' finished'); }
    for (const k of Object.keys(sums)) assert.ok(th.points.some((p) => p.slot === Number(k)), tg + 'slot present ' + k);
  }
});

test('the page sentences quote the reference numbers (Speed, Tickets and Stations headlines)', () => {
  for (let seed = 0; seed < TOTAL; seed++) {
    const ds = makeDs(seed), tg = tag(seed, {});
    const e = R.summary(ds, {}, C), pace = M.headline('pace', ds, {});
    if (!e.count) { assert.match(pace, /No finished tickets/, tg); continue; }
    assert.ok(pace.includes('Half of tickets are out in ' + R.mmss(e.median) + ' and 9 in 10 within ' + R.mmss(e.p90) + '; ' + Math.round(e.onTimePct * 100) + '% beat their warning time'), tg + pace);
    const hrs = R.byHour(ds, {}, C).filter((h) => h.count >= 5);
    const tickets = M.headline('tickets', ds, {});
    if (hrs.length) { const top = Math.max(...hrs.map((h) => h.medianMs)); assert.ok(tickets.includes('is the slowest hour at a median of ' + R.mmss(top)), tg + tickets); } else assert.ok(!tickets.includes('slowest hour'), tg + tickets);
    const z = R.byZone(ds, {}, C), stations = M.headline('stations', ds, {});
    const shares = Object.values(z.zones).map((a) => a.share).filter((x) => x !== null);
    if (shares.length) assert.ok(stations.includes('finished last on ' + Math.round(Math.max(...shares) * 100) + '% of tickets'), tg + stations);
  }
});

test('boundaries: exactly the warning time is "warn", exactly the overdue time is "overdue", one millisecond less is not', () => {
  const ch = C.channelById.dine_in, mk = (id, ms) => ({ id, num: 1, channel: 'dine_in', createdAt: 1e12 + Number(id.slice(1)) * 1e6, status: 'expedited', expeditedAt: 1e12 + Number(id.slice(1)) * 1e6 + ms, items: [] });
  const ds = { tickets: [mk('t1', ch.warnSec * 1000 - 1), mk('t2', ch.warnSec * 1000), mk('t3', ch.breachSec * 1000 - 1), mk('t4', ch.breachSec * 1000)], events: [], settings: {}, range: {} };
  const s = M.summary(ds), e = R.summary(ds, {}, C);
  assert.deepEqual([s.ok, s.warn, s.overdue], [1, 2, 1]);
  assert.deepEqual([e.ok, e.warn, e.overdue], [1, 2, 1]);
});

test('an empty range and a range with one ticket say "not known" rather than zero', () => {
  const ds = makeDs(3), empty = M.summary(withR(ds, { from: 5, to: 5 }));
  assert.equal(empty.count, 0); assert.equal(empty.median, null); assert.equal(empty.p90, null); assert.equal(empty.onTimePct, null); assert.equal(empty.perHour, null);
  const t = ds.tickets.find((x) => x.status === 'expedited' && x.auto !== true), one = M.summary(withR({ tickets: [t], events: [], settings: {}, range: {} }, {}));
  assert.equal(one.count, 1); assert.equal(one.median, one.p90); assert.equal(one.median, one.min); assert.equal(one.median, t.expeditedAt - t.createdAt);
});
