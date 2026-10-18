// Pace estimator acceptance: each estimate is scored against the generator's TRUE rate (never against the span the
// estimator itself uses), every minute from the 40th, with explicit seeds.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSB } from './_load.mjs';

const SB = await loadSB(['00-util', '10-config', '20-engine', '25-deadlines']);
const E = SB.engine, D = SB.deadlines, U = SB.util;
const MIN = 60e3, HR = 60 * MIN;
const at = (m) => new Date(2026, 9, 12, 11, 0, 0).getTime() + m * MIN;
const rank = { info: 0, warn: 1, bad: 2 };

// A kitchen open at 11:00 with a huge pork batch cooked at 11:00 so pulls never run it dry.
function kitchen() {
  const settings = E.defaultSettings(); settings.service.openHour = 11; settings.service.closeHour = 23;
  let s = E.newState({ now: at(0), empty: true, settings });
  // Twelve hours of hold so the batch stays on the menu for the whole replay.
  s = E.apply(s, 'updateIngredient', { id: 'pork', patch: { maxHoldH: 12 } }, at(0)).state;
  return E.apply(s, 'addBatch', { ing: 'pork', tempF: 160, cookedG: 900000 }, at(0)).state;
}
// Jittered-regular arrivals at a true rate: interval = mean x U(0.5, 1.5), item grams = 150 x U(0.5, 1.5); returns [{ m, g }].
function jittered(rate, seed, minutes) {
  const r = U.rng(seed), meanInt = 150 / rate, out = [];
  for (let m = meanInt * r.range(0.5, 1.5); m < minutes; m += meanInt * r.range(0.5, 1.5)) out.push({ m, g: 150 * r.range(0.5, 1.5) });
  return out;
}
// Poisson arrivals at a true rate: exponential intervals, fixed 150 g items.
function poisson(rate, seed, minutes) {
  const r = U.rng(seed), meanInt = 150 / rate, out = [];
  for (let m = -meanInt * Math.log(1 - r.next()); m < minutes; m += -meanInt * Math.log(1 - r.next())) out.push({ m, g: 150 });
  return out;
}
// Sparse lumpy pulls: 4.5 kg every 100 +/- 25 minutes (true rate 45 g/min).
function lumpy(seed, minutes) {
  const r = U.rng(seed), out = [];
  for (let m = 100 + r.range(-25, 25); m < minutes; m += 100 + r.range(-25, 25)) out.push({ m, g: 4500 });
  return out;
}
// Plays arrivals into the kitchen minute by minute and returns the per-minute scoring rows and severities.
// Each row is { m, est, errPct } for minutes from `from` once the pace is known.
function play(arrivals, trueRate, minutes, from) {
  let s = kitchen();
  const rows = [], sevs = [];
  let ai = 0, wasKnown = false, flips = 0;
  for (let m = 1; m <= minutes; m++) {
    while (ai < arrivals.length && arrivals[ai].m <= m) {
      const r = E.apply(s, 'pullBatch', { ing: 'pork', g: arrivals[ai].g }, at(Math.round(arrivals[ai].m * 100) / 100));
      if (r.report === 'ok') s = r.state;
      ai++;
    }
    s = E.tick(s, at(m)).state;
    const est = D.salesRate(s, at(m)).rate.pork;
    const known = est !== undefined;
    if (m >= from) {
      if (wasKnown && !known) flips++;
      if (known) rows.push({ m, n: ai, est: est * MIN, errPct: Math.abs(est * MIN - trueRate) / trueRate * 100 });
      const row = D.build(s, at(m)).find((x) => x.kind === 'expiry');
      sevs.push({ m, sev: row ? rank[row.sev] : 0 });
    }
    if (known) wasKnown = true;
  }
  return { rows, sevs, flips };
}
const pct = (a, q) => { const x = a.slice().sort((p, r) => p - r); return x[Math.min(x.length - 1, Math.floor(q * x.length))]; };
// The largest number of severity changes inside any 60-minute window.
const sevChangesPerHour = (sevs) => { let worst = 0; for (let i = 0; i < sevs.length; i++) { let n = 0; for (let j = i + 1; j < sevs.length && sevs[j].m - sevs[i].m <= 60; j++) if (sevs[j].sev !== sevs[j - 1].sev) n++; worst = Math.max(worst, n); } return worst; };

for (const rate of [30, 75, 150]) {
  test('pace: jittered-regular arrivals at a true ' + rate + ' g/min, scored against the true rate', () => {
    const errs = []; let worstSev = 0, flips = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const r = play(jittered(rate, seed * 7919, 300), rate, 300, 40);
      assert.ok(r.rows.length >= 255, 'known from the 40th minute (seed ' + seed + '): ' + r.rows.length);
      for (const x of r.rows) errs.push(x.errPct);
      worstSev = Math.max(worstSev, sevChangesPerHour(r.sevs)); flips += r.flips;
    }
    const med = pct(errs, 0.5), p90 = pct(errs, 0.9), worst = Math.max(...errs);
    console.log('# ' + rate + ' g/min jittered: median ' + med.toFixed(1) + '%, p90 ' + p90.toFixed(1) + '%, worst ' + worst.toFixed(1) + '%, severity changes/h ' + worstSev + ', flips ' + flips);
    assert.ok(med <= 10, 'median ' + med);
    assert.ok(p90 <= 20, 'p90 ' + p90);
    assert.ok(worst <= 45, 'worst ' + worst);
    assert.equal(flips, 0);
    assert.ok(worstSev <= 3, 'severity changes per hour ' + worstSev);
  });
}

test('pace: sparse 4.5 kg every 100 +/- 25 minutes, 20 seeds, scored against the true 45 g/min', () => {
  const errs = [], single = []; let worstSev = 0, flips = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const r = play(lumpy(seed * 104729, 700), 45, 700, 40);
    assert.ok(r.rows.length > 300, 'known for most of the day (seed ' + seed + '): ' + r.rows.length);
    // Scored once there are at least 2 removals; the minutes with a single removal read the average since opening and are reported apart.
    for (const x of r.rows) (x.n >= 2 ? errs : single).push(x.errPct);
    worstSev = Math.max(worstSev, sevChangesPerHour(r.sevs)); flips += r.flips;
  }
  console.log('# sparse 4.5 kg, single removal only (reported, not scored): median ' + pct(single, 0.5).toFixed(1) + '%, p90 ' + pct(single, 0.9).toFixed(1) + '%, worst ' + Math.max(...single).toFixed(1) + '%');
  const med = pct(errs, 0.5), p90 = pct(errs, 0.9), worst = Math.max(...errs);
  console.log('# sparse 4.5 kg: median ' + med.toFixed(1) + '%, p90 ' + p90.toFixed(1) + '%, worst ' + worst.toFixed(1) + '%, severity changes/h ' + worstSev + ', flips ' + flips);
  assert.ok(med <= 10, 'median ' + med);
  assert.ok(p90 <= 25, 'p90 ' + p90);
  assert.ok(worst <= 35, 'worst ' + worst);
  assert.equal(flips, 0);
  assert.ok(worstSev <= 3, 'severity changes per hour ' + worstSev);
});

test('pace: Poisson arrivals are reported (median and 90th percentile), not pass or fail', () => {
  for (const rate of [30, 75, 150]) {
    const errs = [];
    for (let seed = 1; seed <= 10; seed++) for (const x of play(poisson(rate, seed * 31337, 300), rate, 300, 40).rows) errs.push(x.errPct);
    console.log('# ' + rate + ' g/min Poisson: median ' + pct(errs, 0.5).toFixed(1) + '%, p90 ' + pct(errs, 0.9).toFixed(1) + '%');
  }
});
