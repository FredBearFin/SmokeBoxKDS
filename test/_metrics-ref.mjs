// WHAT THIS FILE IS: A deliberately naive, obviously-correct second version of the office statistics, written only from the plain-words
// definitions the pages state (docs/audit/office.md, "How each number is worked out"). It sorts copies of arrays, loops, and reads the
// wall clock through plain Date parts. It shares no code with src/js/40-metrics.js (only the channel limits in the config are read).
// USED BY: test/metrics-reference.test.mjs.  Every function takes the raw tickets, never the metrics context, and caches nothing.

const HOUR = 3600e3, MIN = 60e3;
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const pad = (n) => (n < 10 ? '0' : '') + n;

// Calendar parts of a moment on the wall clock.
function parts(ts) { const d = new Date(ts); return { y: d.getFullYear(), m: d.getMonth(), d: d.getDate(), h: d.getHours(), mi: d.getMinutes(), s: d.getSeconds(), ms: d.getMilliseconds() }; }
// "YYYY-MM-DD" for a calendar day (month 0-based; day may be 0 or 32 and rolls over).
function key(y, m, d) { const x = new Date(y, m, d, 12, 0, 0, 0); return x.getFullYear() + '-' + pad(x.getMonth() + 1) + '-' + pad(x.getDate()); }

// The service day of a moment: the calendar day, unless the wall clock is before the day-start hour, then the day before.
// Also the hours since that service day's midnight on the wall clock (12:45 am the next morning is 24.75).
export function serviceOf(ts, dsh) {
  const p = parts(ts), frac = p.h + p.mi / 60 + p.s / 3600 + p.ms / HOUR;
  const early = frac < dsh;
  const date = early ? key(p.y, p.m, p.d - 1) : key(p.y, p.m, p.d);
  const sy = early ? new Date(p.y, p.m, p.d - 1, 12).getDay() : new Date(p.y, p.m, p.d, 12).getDay();
  const hours = early ? frac + 24 : frac;
  return { date, hours, hour: Math.floor(hours), weekday: sy };
}

// Sorted copy, then the value at percentile p by straight-line blending between the two neighbours: position p/100 x (n - 1).
export function pct(values, p) {
  const v = values.filter(isNum).slice().sort((a, b) => a - b), n = v.length;
  if (!n) return null;
  const pos = (p / 100) * (n - 1), lo = Math.floor(pos), hi = Math.ceil(pos);
  return v[lo] + (v[hi] - v[lo]) * (pos - lo);
}
export const avg = (values) => { const v = values.filter(isNum); if (!v.length) return null; let s = 0; for (const x of v) s += x; return s / v.length; };

// The warn and overdue limits of a channel (seconds): the saved override, else the built-in default.
function limits(ds, ch, C) {
  const ov = ((ds.settings && ds.settings.channels) || []).find((c) => c && c.id === ch) || {};
  const base = C.channelById[ch] || C.channels[0];
  return { warn: (isNum(ov.warnSec) ? ov.warnSec : base.warnSec) * 1000, breach: (isNum(ov.breachSec) ? ov.breachSec : base.breachSec) * 1000 };
}

// Every ticket in scope with its day, hour and (when finished) its time. scope: created in [from, to), optional channel.
export function model(ds, o, C) {
  o = o || {};
  const dsh = ds.settings && ds.settings.service && isNum(ds.settings.service.dayStartHour) ? ds.settings.service.dayStartHour : C.service.dayStartHour;
  const from = isNum(o.from) ? o.from : -Infinity, to = isNum(o.to) ? o.to : Infinity;
  const rows = [];
  for (const t of ds.tickets) {
    if (!isNum(t.createdAt) || t.createdAt < from || t.createdAt >= to) continue;
    if (o.channel && t.channel !== o.channel) continue;
    const sv = serviceOf(t.createdAt, dsh);
    const finished = t.status === 'expedited' && isNum(t.expeditedAt) && t.expeditedAt >= t.createdAt && t.auto !== true;
    const r = { t, voided: t.status === 'voided', sv, finished: false, totalMs: null, level: null };
    if (!r.voided && finished) { r.finished = true; r.totalMs = t.expeditedAt - t.createdAt; const L = limits(ds, t.channel, C); r.level = r.totalMs >= L.breach ? 'breach' : r.totalMs >= L.warn ? 'warn' : 'ok'; }
    rows.push(r);
  }
  return { rows, dsh, live: rows.filter((r) => !r.voided), done: rows.filter((r) => r.finished) };
}

// The headline numbers of a range.
export function summary(ds, o, C) {
  const m = model(ds, o, C), times = m.done.map((r) => r.totalMs);
  const ok = m.done.filter((r) => r.level === 'ok').length, warn = m.done.filter((r) => r.level === 'warn').length, od = m.done.filter((r) => r.level === 'breach').length;
  const hours = new Set(m.live.map((r) => r.sv.date + '|' + r.sv.hour));
  let items = 0, recalls = 0, forced = 0;
  for (const r of m.live) { for (const it of r.t.items || []) if (it && it.status === 'done') items++; if (isNum(r.t.recalls)) recalls += r.t.recalls; }
  for (const r of m.done) if (r.t.forced === true) forced++;
  const n = m.done.length;
  return { count: n, created: m.live.length, avg: avg(times), median: pct(times, 50), p90: pct(times, 90), p95: pct(times, 95), min: n ? Math.min(...times) : null, max: n ? Math.max(...times) : null,
    ok, warn, overdue: od, onTimePct: n ? ok / n : null, activeHours: hours.size, perHour: hours.size ? m.live.length / hours.size : null, itemsPerHour: hours.size && items ? items / hours.size : null, items,
    voids: m.rows.filter((r) => r.voided).length, recalls, forced };
}

// Ticket time by service hour: first to last hour with a placed ticket, each with created and finished counts and the middle time.
export function byHour(ds, o, C) {
  const m = model(ds, o, C); if (!m.live.length) return [];
  const hs = m.live.map((r) => r.sv.hour); let lo = Math.min(...hs), hi = Math.max(...hs);
  const out = [];
  for (let h = lo; h <= hi; h++) {
    const f = m.done.filter((r) => r.sv.hour === h).map((r) => r.totalMs);
    out.push({ hour: h, created: m.live.filter((r) => r.sv.hour === h).length, count: f.length, medianMs: pct(f, 50), p90Ms: pct(f, 90), avgMs: avg(f) });
  }
  return out;
}

// Weekday x hour cells of the middle finished time and the count.
export function heat(ds, o, C) {
  const m = model(ds, o, C), cells = {};
  for (const r of m.done) { const k = r.sv.weekday + '|' + r.sv.hour; (cells[k] = cells[k] || []).push(r.totalMs); }
  const out = {}; for (const k of Object.keys(cells)) out[k] = { n: cells[k].length, median: pct(cells[k], 50) };
  return out;
}

// Per order type: placed, finished, middle time and counts by level.
export function byChannel(ds, o, C) {
  const m = model(ds, o, C), out = {};
  for (const r of m.live) { const c = out[r.t.channel] || (out[r.t.channel] = { created: 0, times: [], ok: 0, warn: 0, overdue: 0 }); c.created++; }
  for (const r of m.done) { const c = out[r.t.channel]; c.times.push(r.totalMs); if (r.level === 'ok') c.ok++; else if (r.level === 'warn') c.warn++; else c.overdue++; }
  for (const k of Object.keys(out)) { out[k].count = out[k].times.length; out[k].median = pct(out[k].times, 50); delete out[k].times; }
  return out;
}

// Per day: tickets placed, voided, finished, middle time.
export function byDay(ds, o, C) {
  const m = model(ds, o, C), out = {};
  // A day appears only when it has at least one ticket that was not voided.
  for (const r of m.live) { const d = out[r.sv.date] || (out[r.sv.date] = { tickets: 0, voids: 0, times: [] }); d.tickets++; }
  for (const r of m.rows) if (r.voided && out[r.sv.date]) out[r.sv.date].voids++;
  for (const r of m.done) out[r.sv.date].times.push(r.totalMs);
  for (const k of Object.keys(out)) { out[k].count = out[k].times.length; out[k].median = pct(out[k].times, 50); delete out[k].times; }
  return out;
}

// Per station: done lines on tickets that are not voided; waiting (fire to start, two-step lines only) and work (start, or fire for one-step, to done);
// and how many finished tickets had their LAST finished item at that station.
export function byZone(ds, o, C) {
  const m = model(ds, o, C), out = {};
  const z = (id) => out[id] || (out[id] = { lines: 0, qty: 0, resp: [], work: [], critical: 0, overdueCritical: 0 });
  for (const r of m.live) for (const it of r.t.items || []) {
    if (!it || it.status !== 'done' || !it.zone) continue;
    const a = z(it.zone); a.lines++; a.qty += isNum(it.qty) && it.qty > 0 ? it.qty : 1;
    if (it.auto === true || !isNum(it.firedAt) || !isNum(it.doneAt) || it.doneAt < it.firedAt) continue;
    if (isNum(it.startedAt)) { if (it.startedAt >= it.firedAt && it.startedAt <= it.doneAt) { a.work.push(it.doneAt - it.startedAt); a.resp.push(it.startedAt - it.firedAt); } } else a.work.push(it.doneAt - it.firedAt);
  }
  let anatomy = 0;
  for (const r of m.done) {
    if (r.t.forced === true) continue;
    let last = null;
    for (const it of r.t.items || []) {
      if (!it || it.status !== 'done' || !isNum(it.doneAt)) continue;
      if (!last || it.doneAt > last.doneAt || (it.doneAt === last.doneAt && isNum(it.firedAt) && (!isNum(last.firedAt) || it.firedAt > last.firedAt))) last = it;
    }
    if (!last || !isNum(last.firedAt)) continue;
    const f = last.firedAt, d = last.doneAt, s = isNum(last.startedAt) ? last.startedAt : null;
    if (f < r.t.createdAt || d < f || (s !== null && (s < f || s > d)) || r.t.expeditedAt < d) continue;
    anatomy++; const a = z(last.zone); a.critical++; if (r.level === 'breach') a.overdueCritical++;
  }
  for (const k of Object.keys(out)) { const a = out[k]; a.respMedian = pct(a.resp, 50); a.workMedian = pct(a.work, 50); a.respN = a.resp.length; a.workN = a.work.length; a.respP90 = pct(a.resp, 90); a.workP90 = pct(a.work, 90); a.share = anatomy ? a.critical / anatomy : null; delete a.resp; delete a.work; }
  return { zones: out, anatomy };
}

// Units sold per dish: only lines marked done, on tickets that are not voided. (A line that was sent but not finished is not sold.)
export function items(ds, o, C) {
  const m = model(ds, o, C), out = {};
  for (const r of m.live) for (const it of r.t.items || []) {
    if (!it || it.status !== 'done' || it.menuId == null) continue;
    const a = out[it.menuId] || (out[it.menuId] = { sold: 0, lines: 0, revenue: 0, priced: 0 });
    const q = isNum(it.qty) && it.qty > 0 ? it.qty : 1; a.sold += q; a.lines++; if (isNum(it.price)) { a.revenue += it.price * q; a.priced++; }
  }
  return out;
}

// Tickets per bucket on the wall clock (bucket width bmin minutes, a divisor of 60): placed (not voided) and finished (by send-out time).
// Returns { cells: { "YYYY-MM-DD hh:mm": {created, completed} } }, merging the repeated hour of a clock change.
export function buckets(ds, o, C, bmin) {
  const m = model(ds, o, C), cells = {};
  const cell = (ts) => { const p = parts(ts); return p.y + '-' + pad(p.m + 1) + '-' + pad(p.d) + ' ' + pad(p.h) + ':' + pad(Math.floor(p.mi / bmin) * bmin); };
  for (const r of m.live) { const c = cells[cell(r.t.createdAt)] || (cells[cell(r.t.createdAt)] = { created: 0, completed: 0 }); c.created++; }
  for (const r of m.done) { const c = cells[cell(r.t.expeditedAt)] || (cells[cell(r.t.expeditedAt)] = { created: 0, completed: 0 }); c.completed++; }
  return { cells, cellOf: cell, dsh: m.dsh };
}
// The wall-clock cell name of a moment (same format as buckets()).
export function cellName(ts, bmin) { const p = parts(ts); return p.y + '-' + pad(p.m + 1) + '-' + pad(p.d) + ' ' + pad(p.h) + ':' + pad(Math.floor(p.mi / bmin) * bmin); }

// One short sentence form of a time: 391000 ms -> "6m 31s" (minutes and two-digit seconds, seconds rounded).
export function mmss(ms) { const s = Math.round(ms / 1000); return Math.floor(s / 60) + 'm ' + pad(s % 60) + 's'; }
