// UX replay 10: fake-clock, seeded, repeatable service replays (5 scenarios of 10 virtual hours), scored for false alarms,
// misses, lapses and kept-batch rung sounds. Definitions: docs/ux-test-report.md ("Fake-clock replay (ux10)"), committed
// before the first run. This is a SIMULATION: a scripted pit master and the demo crew in a headless browser. It is not a real service.
// Usage: node ux-scripts/ux10-fake-clock-replay.mjs <seed> [scenarios=A,B,C,D,E] [out.json] [hours=10]
import { createRequire } from 'node:module';
import path from 'node:path';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire('/opt/npm-tools/node_modules/');
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist/smokebox.html');
const SEED = Number(process.argv[2]);
if (!Number.isFinite(SEED)) { console.error('usage: node ux10-fake-clock-replay.mjs <seed> [A,B,C,D,E] [out.json] [hours]'); process.exit(2); }
const WANT = (process.argv[3] || 'A,B,C,D,E').split(',');
const OUT = process.argv[4] || '';
const HOURS = Number(process.argv[5]) || 10;
const SPEED = 15;
const H = 3600e3, MIN = 60e3;
console.log('seed', SEED, 'scenarios', WANT.join(','), 'hours', HOURS, 'speed', SPEED + 'x');

// The pit master's cook list: minutes after opening, product, cooked grams.
const COOK_A = [[0, 'brisket', 9000], [30, 'pork', 7000], [60, 'ribs', 5000], [90, 'mac', 4000], [120, 'beans', 4000], [150, 'sausage', 3000],
  [210, 'brisket', 8000], [270, 'pork', 6000], [300, 'ribs', 4000], [330, 'mac', 3000], [360, 'beans', 3000]];
// Scenario E overproduces on purpose (the first version, a batch of each product every 90 minutes, sold out before any limit: see the report).
const COOK_E = []; { const ings = ['brisket', 'pork', 'ribs', 'sausage', 'mac', 'beans', 'turkey', 'potato', 'pudding', 'slaw']; for (let i = 0; i < 6; i++) ings.forEach((ing, j) => COOK_E.push([i * 60 + j * 4, ing, 10000])); }
// Scenario table. day: the clock install time (and so the demo crew seed). cook: the pit master's schedule. One removal path each.
const SCEN = {
  A: { name: 'A normal day', day: [2026, 10, 19], cook: COOK_A, crew: 'normal', keepPolicy: 'hour', keepStarters: true },
  B: { name: 'B busy day, 150 g/min of pork', day: [2026, 10, 20], cook: [[0, 'pork', 24000], [150, 'pork', 16000], [300, 'pork', 16000], [450, 'pork', 12000]], pulls: { ing: 'pork', g: 1500, minGap: 8, maxGap: 12, startMin: 60, trueGPerMin: 150 }, keepPolicy: 'hour' },
  C: { name: 'C late batch with a gap, 75 g/min of pork', day: [2026, 10, 21], cook: [[0, 'pork', 12000], [210, 'pork', 14000]], pulls: { ing: 'pork', g: 1000, minGap: 11, maxGap: 15.6, startMin: 60, trueGPerMin: 75 }, keepPolicy: 'hour' },
  D: { name: 'D one ribs batch kept three times', day: [2026, 10, 22], cook: [[0, 'ribs', 6000]], keepPolicy: 'three30' },
  E: { name: 'E busy demand with many limits', day: [2026, 10, 23], cook: COOK_E, crew: 'rush', keepPolicy: 'hour', keepStarters: true },
};

// Replaces Math.random before the app loads (mulberry32), so the page's random numbers repeat run to run.
const seedScript = ({ seed }) => { let a = seed >>> 0; Math.random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

async function runScenario(key) {
  const sc = SCEN[key];
  const t0 = new Date(sc.day[0], sc.day[1] - 1, sc.day[2], 11, 0, 0).getTime();
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: false });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.stack || e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)|ERR_TUNNEL|ERR_NAME_NOT_RESOLVED|ERR_INTERNET/.test(m.text() + ((m.location && m.location().url) || ''))) errors.push(m.text()); });
  await page.addInitScript(seedScript, { seed: SEED + key.charCodeAt(0) });
  await page.addInitScript(() => { try { localStorage.clear(); } catch (e) { /* storage blocked */ } });
  await page.clock.install({ time: t0 - 3600e3 });
  await page.goto(pathToFileURL(DIST).href);
  await page.waitForTimeout(1500);
  // Jump to a fixed moment and stop: from here on only runFor moves time, so every step is the same on every run.
  await page.clock.pauseAt(t0 - 600e3);
  await page.clock.runFor(2000);
  const cfg = { key, t0, cook: sc.cook.map(([atMin, ing, g]) => ({ atMin, ing, g })), pulls: sc.pulls || null, keepPolicy: sc.keepPolicy, keepStarters: !!sc.keepStarters, hours: HOURS, crew: sc.crew || null };
  await page.evaluate((c) => {
    SB.floor.setWelcome(false);
    SB.sim.live.crew(false);
    SB.store.dispatchEx('resetLive', { keepSettings: true }, { source: 'ui' });
    SB.store.dispatchEx('updateSettings', { patch: { service: { openHour: 11, closeHour: 11 + c.hours, soundStartHour: 11 } } }, { source: 'ui' });
    if (!c.keepStarters) for (const b of SB.store.getState().batches.slice()) SB.store.dispatchEx('discardBatch', { batchId: b.id, reason: 'manual' }, { source: 'ui' });
    SB.floor._alerts = [];
  }, cfg);
  // The clock sits ten minutes before opening: run up to 11:00 first, so the demo crew starts at the opening time.
  await page.clock.runFor(600e3);
  await page.evaluate((c) => {
    if (c.crew) { SB.sim.live.crew(true); SB.sim.live.start({ rate: c.crew }); }
    SB.store.setSpeed(15);
    const MIN = 60e3, H = 3600e3;
    const P = { cooked: new Set(), seen: new Set(), lapseSeen: new Set(), limits: [], lapses: [], keeps: [], pulled: [], estLog: [], keepCount: {}, remAt: {}, alerts: [], nextEst: c.t0 + 10 * MIN, nextPull: c.pulls ? c.t0 + c.pulls.startMin * MIN : null, firstPull: null };
    window.__pm = P;
    const st = () => SB.store.getState();
    const COLD = ['slaw', 'potato', 'pudding'];
    // The last warning rung of a product, in minutes, as configured (10 unless the owner changed the ladder).
    const lastRungMin = (ing) => { const r = SB.deadlines.rungsFor(ing, st().settings); return r[r.length - 1]; };
    // One minute of the scripted pit master: cook what is due, pull at the scripted pace, taste what is past its limit, log the estimator.
    window.__pmStep = () => {
      const now = SB.store.now();
      if (SB.floor._alerts && SB.floor._alerts.length) P.alerts.push(...SB.floor._alerts.splice(0));
      for (const cook of c.cook) { const k = cook.atMin + cook.ing; if (!P.cooked.has(k) && now >= c.t0 + cook.atMin * MIN) { P.cooked.add(k); SB.store.dispatchEx('addBatch', { ing: cook.ing, tempF: 160, cookedG: cook.g }, { source: 'ui' }); } }
      if (c.pulls) while (now >= P.nextPull) {
        const g = Math.round(c.pulls.g * (0.7 + 0.6 * Math.random()));
        const r = SB.store.dispatchEx('pullBatch', { ing: c.pulls.ing, g }, { source: 'ui' });
        if (r.report === 'ok') { if (P.firstPull == null) P.firstPull = P.nextPull; P.pulled.push([P.nextPull, r.info && r.info.g != null ? r.info.g : g]); }
        P.nextPull += (c.pulls.minGap + Math.random() * (c.pulls.maxGap - c.pulls.minGap)) * MIN;
      }
      const s = st(), S = s.settings.safety;
      for (const b of s.batches) {
        if (b.status === 'past' && b.remainingG > 0) {
          if (!P.seen.has(b.id)) { P.seen.add(b.id); P.limits.push({ batchId: b.id, ing: b.ing, t: b.enteredAt + SB.engine._internal.holdLimitMs(b, S), remainingG: Math.round(b.remainingG), cookedG: Math.round(b.cookedG), kind: 'quality' }); }
          if (b.keepUntil > 0 && b.keepUntil <= now && !P.lapseSeen.has(b.id + ':' + b.keepUntil)) { P.lapseSeen.add(b.id + ':' + b.keepUntil); P.lapses.push({ batchId: b.id, at: b.keepUntil, remainingG: Math.round(b.remainingG) }); }
          const n = P.keepCount[b.id] || 0;
          const keep = c.keepPolicy === 'three30' ? n < 3 : b.remainingG > 1000;
          if (keep) {
            SB.store.dispatchEx('logTemp', { batchId: b.id, tempF: COLD.includes(b.ing) ? 38 : 150 }, { source: 'ui' });
            const r = SB.store.dispatchEx('keepServing', { batchIds: [b.id], forMin: c.keepPolicy === 'three30' ? 30 : 60, who: 'PM' }, { source: 'ui' });
            if (r.report === 'ok') { P.keepCount[b.id] = n + 1; const nb = st().batches.find((x) => x.id === b.id); P.keeps.push({ batchId: b.id, ing: b.ing, tap: now, until: nb.keepUntil }); }
          } else SB.store.dispatchEx('discardBatch', { batchId: b.id, reason: 'quality' }, { source: 'ui' });
        }
      }
      // Remaining grams when an extension has 10 minutes to run (to decide whether its rung sound is required).
      for (const k of P.keeps) if (P.remAt[k.batchId + ':' + k.until] === undefined && now >= k.until - lastRungMin(k.ing) * MIN) { const b = st().batches.find((x) => x.id === k.batchId); P.remAt[k.batchId + ':' + k.until] = b && b.status !== 'discard' ? Math.round(b.remainingG) : null; }
      // Estimator against realized pace, every 10 virtual minutes (scripted pulls only).
      if (c.pulls && now >= P.nextEst) {
        P.nextEst += 10 * MIN;
        const r = SB.deadlines.salesRate(st(), now).rate[c.pulls.ing];
        const since = Math.min(2 * H, now - c.t0);
        const win = Math.max(30 * MIN, since);
        const g = P.pulled.filter((x) => x[0] > now - 2 * H).reduce((a, x) => a + x[1], 0);
        P.estLog.push({ t: now, est: r === undefined ? null : Math.round(r * MIN * 10) / 10, realized: P.pulled.length ? Math.round(g / (win / MIN) * 10) / 10 : null, trueG: c.pulls.trueGPerMin });
      }
    };
  }, cfg);
  const steps = Math.round(HOURS * 3600 / SPEED);
  const t00 = Date.now();
  for (let i = 0; i < steps; i++) {
    await page.clock.runFor(1000);
    if (i % 4 === 3) await page.evaluate(() => window.__pmStep());
  }
  await page.evaluate(() => window.__pmStep());
  const end = await page.evaluate(() => {
    const P = window.__pm, s = SB.store.getState();
    if (SB.floor._alerts && SB.floor._alerts.length) P.alerts.push(...SB.floor._alerts.splice(0));
    const ev = SB.engine.allEvents(s);
    return {
      alerts: P.alerts, limits: P.limits, lapses: P.lapses, keeps: P.keeps, remAt: P.remAt, estLog: P.estLog, pulled: P.pulled.length,
      pulledG: Math.round(P.pulled.reduce((a, x) => a + x[1], 0)), firstPull: P.firstPull,
      expired: ev.filter((e) => e.type === 'batch_discard' && e.reason === 'expired').map((e) => ({ batchId: e.batchId, ing: e.ing, t: e.t, g: e.g })),
      cooked: s.batches.map((b) => ({ id: b.id, cookedG: b.cookedG })), now: SB.store.now(),
      tickets: s.tickets.length, closeHour: s.settings.service.closeHour,
      lastRung: Object.fromEntries(s.ingredients.filter((i) => i.tcs).map((i) => { const r = SB.deadlines.rungsFor(i.id, s.settings); return [i.id, r[r.length - 1]]; })),
    };
  });
  const allowedAt = async (t) => page.evaluate((tt) => SB.deadlines.soundsAllowed(SB.store.getState(), tt), t);
  const out = await score(key, sc, end, allowedAt);
  out.realSeconds = Math.round((Date.now() - t00) / 100) / 10;
  out.consoleErrors = errors.length;
  await browser.close();
  return out;
}

// Scores one scenario against the definitions in the report.
async function score(key, sc, end, allowedAt) {
  const floorOf = (cookedG) => Math.min(500, 0.15 * cookedG);
  const sounds = end.alerts;
  const idParts = (id) => id.split(':');
  const firstOf = new Map();   // rung sound that a repeat takes its verdict from: same id and rung, first non-repeat
  for (const a of sounds) if (!a.repeat && !firstOf.has(a.id + '|' + a.rung)) firstOf.set(a.id + '|' + a.rung, a);
  const verdict = (a) => {
    const why = [];
    if (a.wasteG != null && a.wasteG < 500 && a.remainingG != null && a.wasteG < 0.15 * a.remainingG) why.push('1 projected waste below the floor');
    if (a.remainingG != null && a.remainingG < 300) why.push('2 under 300 g remained');
    if (a.allowed === false) why.push('3 kitchen closed, setting off');
    if (a.level <= 3 && a.msLeft < 60000 && a.kind === 'expiry') why.push('4 under 60 seconds left');
    if (a.kind === 'past' && a.status !== 'past') why.push('5 past sound for a batch not past its limit');
    return why;
  };
  const falseAlarms = [];
  for (const a of sounds) {
    const base = a.repeat ? (firstOf.get(a.id + '|' + a.rung) || a) : a;
    const why = verdict(base);
    if (why.length) falseAlarms.push({ id: a.id, t: a.t, level: a.level, repeat: a.repeat, why });
  }
  // Sounds at a keep tap (within 1 virtual minute) for the new extension's row.
  const tapSounds = [];
  for (const k of end.keeps) {
    const hit = sounds.filter((a) => a.batchId === k.batchId && a.id.endsWith(':' + k.until) && a.t >= k.tap && a.t <= k.tap + MIN);
    if (hit.length) tapSounds.push({ batchId: k.batchId, tap: k.tap, sounds: hit.map((a) => a.id) });
  }
  // Limits: first quality limits and engine expiries; misses by the 10-minute rule.
  const limits = end.limits.slice();
  const cookedOf = Object.fromEntries(end.cooked.map((b) => [b.id, b.cookedG]));
  for (const e of end.expired) limits.push({ batchId: e.batchId, ing: e.ing, t: e.t, remainingG: Math.round(e.g), cookedG: Math.round(cookedOf[e.batchId] || e.g), kind: 'expired' });
  const misses = [], closedLimits = [], handled = [];
  for (const l of limits) {
    const atFloor = l.remainingG >= floorOf(l.cookedG);
    const warned = sounds.some((a) => a.batchId === l.batchId && a.kind === 'expiry' && a.level >= 1 && !a.repeat && a.allowed && a.t <= l.t - (end.lastRung[l.ing] || 10) * MIN);
    const row = { batchId: l.batchId, ing: l.ing, kind: l.kind, remainingG: l.remainingG, warned10min: warned };
    if (!atFloor) { handled.push(Object.assign(row, { note: 'below the floor' })); continue; }
    if (!(await allowedAt(l.t))) { closedLimits.push(row); continue; }
    if (!warned) misses.push(row); else handled.push(row);
  }
  // Lapses: a fresh past sound within 2 virtual minutes.
  const lapseRows = end.lapses.map((l) => {
    const ok = sounds.some((a) => a.kind === 'past' && a.batchId === l.batchId && !a.repeat && a.id === 'past:' + l.batchId + ':' + l.at && a.t >= l.at && a.t <= l.at + 2 * MIN);
    return Object.assign({}, l, { soundedWithin2min: ok });
  });
  const lapseMisses = lapseRows.filter((l) => !l.soundedWithin2min);
  // Extension-end rung sounds: required when 300 g or more remained 10 minutes before the extension ended.
  const rungRows = end.keeps.filter((k) => (end.remAt[k.batchId + ':' + k.until] || 0) >= 300).map((k) => {
    const ok = sounds.some((a) => a.kind === 'expiry' && a.batchId === k.batchId && !a.repeat && a.level >= 1 && a.id === 'expiry:' + k.batchId + ':' + k.until && a.t <= k.until - 5 * MIN);
    return { batchId: k.batchId, until: k.until, rungSound: ok };
  });
  const rungMisses = rungRows.filter((r) => !r.rungSound);
  const pastSounds = sounds.filter((a) => a.kind === 'past');
  const est = end.estLog.filter((x) => x.est != null && x.realized != null && x.realized > 0);
  const errs = est.map((x) => Math.abs(x.est - x.trueG) / x.trueG).sort((a, b) => a - b);
  const q = (p) => errs.length ? Math.round(errs[Math.min(errs.length - 1, Math.floor(p * errs.length))] * 1000) / 10 : null;
  const nonRepeat = sounds.filter((a) => !a.repeat);
  const slim = (a) => [a.t, a.id, a.kind, a.level, a.repeat ? 1 : 0, a.rung, a.msLeft, a.wasteG, a.remainingG];
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify({ s: sounds.map(slim), l: limits, lp: end.lapses, k: end.keeps, e: end.expired, est: end.estLog, pg: end.pulledG, tk: end.tickets })).digest('hex').slice(0, 16);
  return {
    scenario: sc.name, tickets: end.tickets, pulledG: end.pulledG,
    soundsTotal: sounds.length, soundsFirstAtRung: nonRepeat.length, repeats: sounds.length - nonRepeat.length, pastSounds: pastSounds.length,
    falseAlarms: falseAlarms.length, falseAlarmDetail: falseAlarms.slice(0, 8), soundsAtKeepTap: tapSounds.length,
    limitsReached: limits.length, limitsAtOrAboveFloor: limits.filter((l) => l.remainingG >= floorOf(l.cookedG)).length, misses: misses.length, missDetail: misses, limitsWhileClosed: closedLimits.length,
    lapses: lapseRows.length, lapsesSoundedWithin2min: lapseRows.length - lapseMisses.length, lapseMisses: lapseMisses.length,
    keeps: end.keeps.length, extensionRungRequired: rungRows.length, extensionRungMisses: rungMisses.length, extensionRungMissDetail: rungMisses,
    paceEstimateLogs: est.length, paceErrVsTruePct: { median: q(0.5), p90: q(0.9), worst: errs.length ? Math.round(errs[errs.length - 1] * 1000) / 10 : null },
    estLogSample: end.estLog.filter((_, i) => i % 6 === 0).map((x) => ({ vmin: Math.round((x.t - end.estLog[0].t) / MIN) + 10, est: x.est, realized: x.realized, true: x.trueG })),
    fingerprint,
    rawSounds: sounds.map((a) => ({ t: a.t, id: a.id, kind: a.kind, level: a.level, repeat: a.repeat, rung: a.rung, msLeft: a.msLeft, wasteG: a.wasteG, remainingG: a.remainingG, status: a.status, allowed: a.allowed })),
    limitsList: limits, lapseList: lapseRows, keepList: end.keeps,
  };
}

const results = {};
for (const key of WANT) { process.stdout.write('running ' + key + ' ... '); results[key] = await runScenario(key); console.log('done in', results[key].realSeconds, 's, fingerprint', results[key].fingerprint); }
const summary = Object.fromEntries(Object.entries(results).map(([k, r]) => { const c = Object.assign({}, r); for (const x of ['estLogSample', 'falseAlarmDetail', 'missDetail', 'extensionRungMissDetail', 'rawSounds', 'limitsList', 'lapseList', 'keepList']) delete c[x]; return [k, c]; }));
console.log(JSON.stringify(summary, null, 2));
for (const k of Object.keys(results)) if (results[k].falseAlarmDetail.length) console.log(k, 'false alarms:', JSON.stringify(results[k].falseAlarmDetail));
if (OUT) fs.writeFileSync(OUT, JSON.stringify({ seed: SEED, speed: SPEED, hours: HOURS, results }, null, 2));
