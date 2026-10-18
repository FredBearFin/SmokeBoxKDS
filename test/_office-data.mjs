// Sample history for the Office A tests. While SB.sim is not available this borrows the real-engine generator Office B wrote
// (test/_office-b-data.mjs: ~2000 tickets over 14 days, every channel, every zone) and caches the JSON so repeated runs start fast.
// When src/js/45-sim.js exists the e2e uses SB.sim.sample() directly (see useSim in office.e2e.mjs).
//   const ds = await sampleDs();           // 14 days ending yesterday
//   const thin = await thinDs();            // 2 days, a handful of tickets per hour: exercises "only n tickets" paths
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const cache = path.join(here, '.out', 'officeA', '_ds-cache.json');

export async function sampleDs({ fresh = false } = {}) {
  const today = new Date().toISOString().slice(0, 10);
  try {
    if (!fresh && fs.existsSync(cache)) { const j = JSON.parse(fs.readFileSync(cache, 'utf8')); if (j.stamp === today) return j.ds; }
  } catch (e) { /* rebuild */ }
  const { makeDataset } = await import('./_office-b-data.mjs');
  const ds = await makeDataset({ days: 14 });
  fs.mkdirSync(path.dirname(cache), { recursive: true });
  fs.writeFileSync(cache, JSON.stringify({ stamp: today, ds }));
  return ds;
}

/** A thin variant: keep only the last two sample days and every 7th ticket of them (one-ticket hours, null medians, tiny buckets). */
export async function thinDs() {
  const ds = JSON.parse(JSON.stringify(await sampleDs()));
  const last = Math.max.apply(null, ds.tickets.map((t) => t.createdAt));
  const keep = ds.tickets.filter((t) => last - t.createdAt < 2 * 864e5).filter((_, i) => i % 7 === 0);
  const ids = new Set(keep.map((t) => t.id));
  ds.tickets = keep;
  ds.events = ds.events.filter((e) => !e.ticketId || ids.has(e.ticketId));
  ds.range = { from: Math.min.apply(null, keep.map((t) => t.createdAt)), to: last + 1 };
  return ds;
}

export const emptyDs = () => ({ tickets: [], events: [], batches: [], learned: {}, menu: [], ingredients: [], settings: {}, range: { from: 0, to: 0 } });

/* ---- time travel: a dataset whose last day is TODAY, cut at a fake "now" so the Today range and the live pace ring have something to show ---- */
const HR = 3600e3;
/** local ms of today at hh:mm */
export const todayAt = (h, m = 0) => { const d = new Date(); d.setHours(h, m, 0, 0); return d.getTime(); };
/** init script: Date.now() and new Date() report `target` (plus elapsed real time) so every module sees the same fake "now" */
export const fakeClock = (target) => `(() => { const RD = Date, off = ${target} - RD.now(); function FD(...a) { if (!(this instanceof FD)) return new RD(RD.now() + off).toString(); if (a.length === 0) return new RD(RD.now() + off); return new RD(...a); } FD.prototype = RD.prototype; FD.now = () => RD.now() + off; FD.UTC = RD.UTC; FD.parse = RD.parse; window.Date = FD; })();`;

export async function todayDs(nowMs, { fresh = false } = {}) {
  const { makeDataset, todayKey } = await import('./_office-b-data.mjs');
  const U = globalThis.SB.util;
  const ds = JSON.parse(JSON.stringify(await makeDataset({ days: 14, todayKey: U.addDays(todayKey(), 1) })));   // 14 days ending TODAY
  ds.tickets = ds.tickets.filter((t) => t.createdAt <= nowMs && (t.status === 'voided' || (isFinite(t.expeditedAt) && t.expeditedAt <= nowMs)));
  const ids = new Set(ds.tickets.map((t) => t.id));
  ds.events = ds.events.filter((e) => e.t <= nowMs && (!e.ticketId || ids.has(e.ticketId)));
  ds.batches = (ds.batches || []).filter((b) => !isFinite(b.enteredAt) || b.enteredAt <= nowMs);
  ds.range = { from: Math.min.apply(null, ds.tickets.map((t) => t.createdAt)), to: nowMs + 1 };
  return ds;
}
