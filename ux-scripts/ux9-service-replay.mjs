// UX replay 9: an 8-hour simulated service, scored for false alarms and misses.
// Definitions are in docs/ux-test-report.md ("Phase A replay"), written before the first run.
// This is a SIMULATION: a scripted pit master plus the demo crew in a headless browser at high speed. It is not a real service.
// Usage: node ux-scripts/ux9-service-replay.mjs [speed=120] [out.json]
import { withPage } from '../tools/pw.mjs';
import fs from 'node:fs';

const SPEED = Number(process.argv[2]) || 120;
const OUT = process.argv[3] || '';
const HOURS = 8;
const H = 3600e3, MIN = 60e3;

// The pit master's plan: hours after the start, product, cooked grams.
const COOK = [[0.5, 'brisket', 9000], [1, 'pork', 7000], [1.5, 'ribs', 5000], [2, 'mac', 4000], [2.5, 'beans', 4000], [3, 'sausage', 3000],
  [3.5, 'brisket', 8000], [4.5, 'pork', 6000], [5, 'ribs', 4000], [5.5, 'mac', 3000], [6, 'beans', 3000]];
// Hand pulls (as if beside a POS): every 45 virtual minutes, a set unit of each protein, staggered.
const PULL = [['brisket', 4500, 0], ['pork', 2500, 15], ['ribs', 1200, 30]];

await withPage({ w: 1280, h: 800 }, async (page, logs) => {
  await page.waitForTimeout(1200);
  const startInfo = await page.evaluate((hours) => {
    SB.floor.setWelcome(false);
    const now = SB.store.now(), hr = new Date(now).getHours();
    // Service hours: open at the current hour, close HOURS later (a close above 24 means after midnight).
    SB.store.dispatchEx('updateSettings', { patch: { service: { openHour: hr, closeHour: Math.min(30, hr + hours), soundStartHour: hr } } }, { source: 'ui' });
    // The alert log is NOT cleared: sounds made at start-up (starter batches already near their limit) are part of the run.
    SB.floor._alerts = SB.floor._alerts || [];
    SB.sim.live.crew(true); SB.sim.live.start({ rate: 'normal' });
    return { t0: now, openHour: hr };
  }, HOURS);
  await page.evaluate((sp) => SB.store.setSpeed(sp), SPEED);

  const t0 = startInfo.t0, tEnd = t0 + HOURS * H - 5 * MIN;
  const done = new Set(), nextPull = PULL.map((p) => t0 + p[2] * MIN), limits = [], seenPast = new Set();
  let step = 0;
  for (;;) {
    await page.waitForTimeout(1000);
    const now = await page.evaluate(() => SB.store.now());
    // Cook the batches that are due.
    for (const [h, ing, g] of COOK) {
      const key = h + ing;
      if (!done.has(key) && now >= t0 + h * H) { done.add(key); await page.evaluate(([i, gg]) => SB.store.dispatchEx('addBatch', { ing: i, tempF: 160, cookedG: gg }, { source: 'ui' }), [ing, g]); }
    }
    // Hand pulls.
    for (let i = 0; i < PULL.length; i++) {
      while (now >= nextPull[i]) { nextPull[i] += 45 * MIN; await page.evaluate(([ing, g]) => SB.store.dispatchEx('pullBatch', { ing, g }, { source: 'ui' }), [PULL[i][0], PULL[i][1]]); }
    }
    // The cook tastes anything past its quality limit: keep it an hour if more than 1 kg is left, else throw it out.
    const past = await page.evaluate(() => SB.store.getState().batches.filter((b) => b.status === 'past').map((b) => ({ id: b.id, ing: b.ing, remainingG: b.remainingG, cookedG: b.cookedG })));
    for (const b of past) {
      if (!seenPast.has(b.id)) { seenPast.add(b.id); limits.push({ batchId: b.id, ing: b.ing, t: now, remainingG: Math.round(b.remainingG), cookedG: Math.round(b.cookedG), kind: 'quality' }); }
      await page.evaluate(([id, keep, cold]) => {
        // The reading is in range for the kind of food: 150 F hot, 38 F cold.
        if (keep) { SB.store.dispatchEx('logTemp', { batchId: id, tempF: cold ? 38 : 150 }, { source: 'ui' }); SB.store.dispatchEx('keepServing', { batchIds: [id], forMin: 60, who: 'PM' }, { source: 'ui' }); }
        else SB.store.dispatchEx('discardBatch', { batchId: id, reason: 'quality' }, { source: 'ui' });
      }, [b.id, b.remainingG > 1000, ['slaw', 'potato', 'pudding'].includes(b.ing)]);
    }
    if (now >= tEnd || ++step > 3000) break;
  }

  const result = await page.evaluate(() => {
    const ev = SB.engine.allEvents(SB.store.getState());
    return {
      alerts: SB.floor._alerts,
      expired: ev.filter((e) => e.type === 'batch_discard' && e.reason === 'expired').map((e) => ({ batchId: e.batchId, ing: e.ing, t: e.t, g: e.g })),
      cooked: SB.store.getState().batches.map((b) => ({ id: b.id, ing: b.ing, cookedG: b.cookedG })),
      closedAt: (() => { const sv = SB.store.getState().settings.service; return sv.closeHour; })(),
    };
  });
  const allowedAt = async (t) => page.evaluate((tt) => SB.deadlines.soundsAllowed(SB.store.getState(), tt), t);

  // Limits reached: quality batches that went past (snapshotted above) and batches the engine threw out at a safety limit or the hard cap.
  const cookedOf = Object.fromEntries(result.cooked.map((b) => [b.id, b.cookedG]));
  for (const e of result.expired) limits.push({ batchId: e.batchId, ing: e.ing, t: e.t, remainingG: Math.round(e.g), cookedG: Math.round(cookedOf[e.batchId] || e.g), kind: 'expired' });
  const floorOf = (cookedG) => Math.min(500, 0.15 * cookedG);

  // ---- score ----
  const sounds = result.alerts;
  const nonRepeat = sounds.filter((a) => !a.repeat);
  const falseAlarms = [];
  for (const a of sounds) {
    const why = [];
    if (a.wasteG != null && a.wasteG < 500 && a.remainingG != null && a.wasteG < 0.15 * a.remainingG) why.push('1 projected waste below the floor');
    if (a.remainingG != null && a.remainingG < 300) why.push('2 under 300 g remained');
    if (a.allowed === false) why.push('3 kitchen closed, setting off');
    if (a.level <= 3 && a.msLeft < 60000 && a.kind === 'expiry') why.push('4 under 60 seconds left');
    if (why.length) falseAlarms.push({ id: a.id, t: a.t, level: a.level, repeat: a.repeat, why });
  }
  const misses = [], closedLimits = [], handled = [];
  for (const l of limits) {
    const atFloor = l.remainingG >= floorOf(l.cookedG);
    const allowed = await allowedAt(l.t);
    const warned = sounds.some((a) => a.batchId === l.batchId && a.kind === 'expiry' && a.level >= 1 && !a.repeat && a.allowed && a.t <= l.t - 10 * MIN);
    // Informational: the same batch's sounds, scored ex post by what was really left at the limit.
    const row = { batchId: l.batchId, ing: l.ing, kind: l.kind, remainingG: l.remainingG, floorG: Math.round(floorOf(l.cookedG)), warned10min: warned };
    if (!atFloor) { handled.push(Object.assign(row, { note: 'below the floor, no warning required' })); continue; }
    if (!allowed) { closedLimits.push(row); continue; }
    if (!warned) misses.push(row); else handled.push(row);
  }
  // Informational: sounds for batches whose real waste at the limit was below the floor.
  const exPost = sounds.filter((a) => { const l = limits.find((x) => x.batchId === a.batchId); return l && l.remainingG < floorOf(l.cookedG); }).length;
  const leads = limits.filter((l) => l.remainingG >= floorOf(l.cookedG)).map((l) => {
    const first = sounds.filter((a) => a.batchId === l.batchId && a.kind === 'expiry' && !a.repeat && a.level >= 1).sort((x, y) => x.t - y.t)[0];
    return first ? Math.round((l.t - first.t) / MIN) : null;
  });
  const summary = {
    speed: SPEED, tickGranularityVirtualMin: SPEED / 60, virtualHours: HOURS,
    soundsTotal: sounds.length, soundsFirstAtRung: nonRepeat.length, soundsPerHour: Math.round(sounds.length / HOURS * 10) / 10, repeats: sounds.length - nonRepeat.length,
    falseAlarms: falseAlarms.length, falseAlarmDetail: falseAlarms,
    limitsReached: limits.length, limitsAtOrAboveFloor: limits.filter((l) => l.remainingG >= floorOf(l.cookedG)).length,
    misses: misses.length, missDetail: misses, limitsWhileClosed: closedLimits.length, limitsWhileClosedDetail: closedLimits,
    exPostSoundsForBatchesBelowFloor: exPost, firstSoundLeadMinutes: leads,
    consoleErrors: (logs.errors || []).length, pageErrors: (logs.pageErrors || []).length,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (OUT) fs.writeFileSync(OUT, JSON.stringify({ summary, sounds, limits }, null, 2));
});
