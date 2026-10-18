#!/usr/bin/env node
// WHAT THIS FILE IS: Builds dist/charts-gallery.html: one page that loads the real chart styles and code
//    plus a harness drawing EVERY chart type, with realistic BBQ data, in both office themes side by side,
//    and a block of broken-data cases (empty, zeros, one point, NaN, negatives, 10 000 points). Run: node
//    tools/charts-gallery.mjs to build only; add --check to open it in headless Chromium at two sizes and
//    test tooltips, keyboard, touch, table view, legend and theme switch; add --shots DIR to save
//    screenshots. Page hash: #ember or #paper shows one theme, #texture turns hatching on.
// PARTS: harness (runs in the browser), page styles, buildGallery, check.
// USES: 00-util.js, 10-config.js, 50-charts.js, two CSS files, pw.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const outFile = path.join(root, 'dist/charts-gallery.html');

/* ------------------------------------------------------------------------------------------------------------------
 * The harness runs in the browser. It is written as a real function (syntax-checked by Node) and serialised into the page.
 * ---------------------------------------------------------------------------------------------------------------- */
function harness() {
  const SB = window.SB, U = SB.util, CH = SB.charts;
  const hash = location.hash || '';
  const themes = /#ember/.test(hash) ? ['ember'] : /#paper/.test(hash) ? ['paper'] : ['ember', 'paper'];
  if (/texture/.test(hash)) CH.setTexture(true);
  const R = U.rng(20261017);
  const errors = (window.__galleryErrors = []);
  const CHANNELS = [{ id: 'dine_in', name: 'Dine-in', med: 7.3 }, { id: 'takeout', name: 'Takeout', med: 6.6 }, { id: 'drive_thru', name: 'Drive-thru', med: 5.2 }, { id: 'third_party', name: 'Delivery app', med: 8.4 }];
  const midnight = new Date(2026, 9, 17).getTime();
  const HR = 3600e3;
  // A made-up busyness curve over the day: a small base, a lunch bump near 12:30 and a bigger dinner bump
  // near 6:30 pm. Scales the sample numbers.
  const shape = (h) => 0.78 + 0.95 * Math.exp(-Math.pow(h - 12.6, 2) / 1.3) + 1.15 * Math.exp(-Math.pow(h - 18.4, 2) / 1.7);
  // Random wobble: a number near 1 (within half of s either side), so the sample data is not perfectly
  // smooth.
  const jitter = (s) => 1 + (R.next() - 0.5) * s;

  /* ---------- data ---------- */
  const halfHours = []; for (let h = 11; h <= 21.001; h += 0.5) halfHours.push(h);
  const medianToday = halfHours.filter((h) => h <= 17.5).map((h) => [h, Math.round(6.1 * 60e3 * shape(h) * jitter(0.14))]);
  const median14 = halfHours.map((h) => [h, Math.round(6.4 * 60e3 * shape(h) * jitter(0.05))]);
  const band14 = median14.map(([h, m]) => [h, Math.round(m * 0.68), Math.round(m * 1.42)]);
  const quarter = []; for (let t = 11; t < 21; t += 0.25) quarter.push(t);
  const chanSeries = CHANNELS.map((c, i) => ({ id: c.id, name: c.name, points: quarter.map((h) => [midnight + h * HR, Math.max(0, Math.round((i === 0 ? 5 : i === 1 ? 4 : i === 2 ? 3 : 1.6) * shape(h) * jitter(0.5)))]) }));
  const ZONES = [{ id: 'pit', name: 'Pit' }, { id: 'sides', name: 'Hot sides' }, { id: 'fry', name: 'Fry' }, { id: 'cold', name: 'Cold and drinks' }];
  const loadSeries = ZONES.map((z, i) => ({ id: z.id, name: z.name, points: halfHours.map((h) => [h, Math.max(0, Math.round([4.2, 3, 2.2, 1.4][i] * shape(h) * jitter(0.5)))]) }));
  const days = []; for (let d = 13; d >= 0; d--) days.push(U.dateKey(midnight - d * 864e5));
  const onTime = days.map((k, i) => [U.fmtDateShort(k), Math.min(0.99, 0.74 + i * 0.012 + (R.next() - 0.5) * 0.07)]);
  // Makes a stock burn-down series: grams falling from the par amount through the service day, faster at
  // busy hours.
  const burn = (name, par, id) => { const pts = []; let g = par; for (let h = 10.5; h <= 21; h += 0.25) { g = Math.max(0, g - par * 0.011 * shape(h) * jitter(0.6)); pts.push([midnight + h * HR, Math.round(g)]); } return { id, name, points: pts }; };
  const burnSeries = [burn('Brisket', 14000, 'brisket'), burn('Pulled pork', 10000, 'pork'), burn('Ribs', 12000, 'ribs')];
  const ticketTimes = CHANNELS.map((c) => ({ id: c.id, name: c.name, values: Array.from({ length: 220 }, () => Math.round(R.logNormal(c.med * 60e3, 0.34))) }));
  const allTimes = [].concat(...ticketTimes.map((s) => s.values));
  const items = [['Brisket 1/2 lb', 212], ['Pulled pork 1/4 lb', 168], ['Smoked mac', 151], ['Jalapeno slaw', 139], ['Cornbread', 127], ['Sweet tea', 118], ['Ribs half rack', 96], ['Brisket sandwich', 91], ['Fried pickles', 74], ['Banana pudding', 52], ['Smoked sausage', 44], ['Hush puppies', 31]];
  const slots = []; for (let t = 11; t < 21; t += 0.25) slots.push(t % 1 === 0 ? U.fmtHour(t) : (Math.floor(t) % 12 || 12) + ':' + U.pad2(Math.round((t % 1) * 60)) + ' ' + (t >= 12 ? 'pm' : 'am'));
  const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const heatHours = []; for (let h = 11; h <= 20; h++) heatHours.push(U.fmtHour(h));
  const heatVals = WD.map((d, wi) => heatHours.map((_, hi) => { const h = 11 + hi; if (wi < 1 && h < 12) return null; return Math.round(6.0 * 60e3 * shape(h + 0.5) * (wi >= 4 ? 1.18 : 1) * jitter(0.18)); }));
  const target = 8 * 60e3;
  const heatDelta = heatVals.map((r) => r.map((v) => (v == null ? null : v - target)));
  const stationsPlain = ['Pit', 'Hot sides', 'Fry', 'Cold and drinks'];
  const calib = [['Smoked mac', 300, 391, 380], ['Fried pickles', 360, 272, 280], ['Hush puppies', 300, 322, 310], ['Brisket 1/2 lb', 120, 118, 121], ['Ribs half rack', 180, 241, 236], ['Smoked sausage', 240, 205, 199], ['Banana pudding', 45, 44, 47], ['Brisket sandwich', 170, 214, 209]];
  // Seconds as short readable time, like "5m 14s".
  const fmtMS = (s) => U.fmtDur(s * 1000);

  /* ---------- builders ---------- */
  // Adds an empty chart card with a small label to a grid and returns it.
  // The label is what the check output and screenshots name the chart by.
  function card(grid, title, cls) {
    const c = U.h('div', { class: 'ch-card' + (cls ? ' ' + cls : '') });
    if (title) c.appendChild(U.h('div', { class: 'gal-tag', text: title }));
    grid.appendChild(c); return c;
  }
  // Builds one chart of the given type in a new card and remembers it for the checks. If the chart code
  // throws, the error is recorded and the page carries on.
  function make(grid, name, type, spec, cls) {
    const c = card(grid, name, cls);
    const host = U.h('div'); c.appendChild(host);
    try { const chart = CH[type](host, spec); (window.__gallery = window.__gallery || []).push({ name, type, chart, host }); return chart; }
    catch (e) { errors.push(name + ': ' + (e && e.stack || e)); }
  }
  // Adds a heading, an optional note and an empty grid to a column and returns the grid.
  function section(col, title, note) {
    col.appendChild(U.h('h2', { text: title, id: 'sec-' + title.toLowerCase().replace(/[^a-z]+/g, '-') }));
    if (note) col.appendChild(U.h('p', { class: 'gal-note', text: note }));
    const g = U.h('div', { class: 'grid' }); col.appendChild(g); return g;
  }

  // Draws every chart type into one column (one theme): line, bar, histogram, heat map, scatter and
  // dumbbell, gantt, meter, ring, spark, stack, then the broken-data cases.
  function build(col) {
    /* ===== line ===== */
    let g = section(col, 'Line', 'time / hour / category axes, bands, reference lines, annotations, stacked area');
    make(g, 'line: ticket time by hour (hero)', 'line', {
      title: 'Ticket time by hour of service', sub: 'Median today against the middle 80% of the last 14 days',
      series: [
        { id: 'range', name: '14-day middle 80%', kind: 'band', tone: 'muted', points: band14 },
        { id: 'med14', name: '14-day median', tone: 'muted', dash: true, points: median14 },
        { id: 'today', name: 'Today', slot: 1, points: medianToday },
      ],
      x: { type: 'hour' }, y: { format: 'dur', label: 'Minutes per ticket' },
      bands: [{ x0: 11.5, x1: 13.5, label: 'Lunch' }, { x0: 17, x1: 19.5, label: 'Dinner' }],
      refLines: [{ y: 8 * 60e3, label: 'Warn 8m', tone: 'warn' }, { y: 12 * 60e3, label: 'Overdue 12m', tone: 'bad' }],
      annotations: [{ x: medianToday[3][0], y: medianToday[3][1], label: 'Lunch peak' }],
    }, 'span2');
    make(g, 'line: tickets per 15 min by channel (4 series, time axis)', 'line', {
      title: 'Tickets per 15 minutes', sub: 'By order channel', series: chanSeries, x: { type: 'time' }, y: { format: 'int' },
    });
    make(g, 'line: stacked area, open items per station', 'line', {
      title: 'Open items per station', sub: 'Items fired and not yet done, by half hour', stacked: true, series: loadSeries, x: { type: 'hour' }, y: { format: 'int', label: 'Items' },
    });
    make(g, 'line: on-time % by day (category axis, area, target)', 'line', {
      title: 'On-time share by day', sub: 'Tickets finished before the warn line', series: [{ id: 'ontime', name: 'On time', area: true, points: onTime }],
      x: { type: 'cat' }, y: { format: 'pct', min: 0.5, max: 1 }, refLines: [{ y: 0.9, label: 'Target 90%', tone: 'ok' }],
    });
    make(g, 'line: stock burn-down with 86 threshold (grams)', 'line', {
      title: 'Brisket, pork and rib stock', sub: 'Grams on hand through the day', series: burnSeries, x: { type: 'time' }, y: { format: 'g', min: 0 },
      refLines: [{ y: 700, label: 'Auto-86 at 700 g', tone: 'bad' }],
    });

    /* ===== bar ===== */
    g = section(col, 'Bar', 'vertical, horizontal, grouped, stacked, tones, sort, emphasis');
    make(g, 'bar: top items (horizontal, sorted desc)', 'bar', {
      title: 'Top items sold', sub: 'Portions, last 14 days', orient: 'h', categories: items.map((i) => i[0]), series: [{ id: 'sold', name: 'Sold', values: items.map((i) => i[1]) }], sort: 'desc', format: 'int',
    });
    make(g, 'bar: throughput per 15 min (40 columns, thinned labels)', 'bar', {
      title: 'Tickets per 15 minutes', sub: 'Today', orient: 'v', categories: slots, series: [{ id: 'n', name: 'Tickets', values: quarter.map((h) => Math.max(0, Math.round(12 * shape(h) * jitter(0.5)))) }], format: 'int',
    });
    make(g, 'bar: grouped, response vs work by station', 'bar', {
      title: 'Where the time goes by station', sub: 'Median seconds from fire to first touch, and hands-on work', orient: 'v', categories: stationsPlain,
      series: [{ id: 'response', name: 'Response', values: [22e3, 31e3, 48e3, 12e3] }, { id: 'work', name: 'Work', values: [96e3, 171e3, 214e3, 38e3] }], format: 'dur',
    });
    make(g, 'bar: stacked discards by reason (v)', 'bar', {
      title: 'Discards by reason', sub: 'Grams thrown away, last 7 days', orient: 'v', stacked: true, categories: days.slice(-7).map((k) => U.fmtDateShort(k)),
      series: [{ id: 'expired', name: 'Hold time up', values: [820, 400, 1100, 300, 650, 900, 480] }, { id: 'temp', name: 'Out of range', values: [200, 0, 350, 150, 0, 420, 90] }, { id: 'manual', name: 'Quality', values: [90, 140, 60, 0, 210, 80, 130] }], format: 'g',
    });
    make(g, 'bar: overdue by station with status tones (h)', 'bar', {
      title: 'Overdue tickets by station', sub: 'Count today. Tone follows the share of tickets over the limit', orient: 'h', categories: stationsPlain.concat(['Expo']), series: [{ id: 'od', name: 'Overdue', values: [3, 5, 9, 0, 2] }], tones: ['warn', 'warn', 'bad', 'ok', 'warn'], format: 'int',
      toneWords: { ok: 'None overdue', warn: 'Some overdue', bad: 'Many overdue' },
    });
    make(g, 'bar: pacing on vs off (emphasis)', 'bar', {
      title: 'Finished food waiting per plate', sub: 'Average wait for the last item, pacing on against off', orient: 'v', categories: ['Pacing off', 'Pacing on'], series: [{ id: 'lamp', name: 'Wait', values: [185e3, 48e3] }], format: 'dur', emphasis: 1, labels: 'all',
    });
    make(g, 'bar: margin by item, negatives (h)', 'bar', {
      title: 'Margin per portion', sub: 'Price less ingredient cost', orient: 'h', categories: ['Brisket 1/2 lb', 'Pork 1/4 lb', 'Mac', 'Fried pickles', 'Ribs full rack', 'Sweet tea', 'Burnt ends'], series: [{ id: 'm', name: 'Margin', values: [6.2, 4.9, 4.1, 5.5, -1.3, 3.2, 3.6] }], format: 'money', sort: 'desc',
    });

    /* ===== hist ===== */
    g = section(col, 'Histogram', 'binned counts, warn / overdue lines, overlay by channel');
    make(g, 'hist: ticket times with channel overlay', 'hist', {
      title: 'Ticket time distribution', sub: 'All tickets as bars, one outline per channel', values: allTimes, series: ticketTimes, binSize: 30e3, min: 0, max: 15 * 60e3, format: 'dur',
      refLines: [{ x: 8 * 60e3, label: 'Warn 8m', tone: 'warn' }, { x: 12 * 60e3, label: 'Overdue 12m', tone: 'bad' }], y: { label: 'Tickets' },
    }, 'span2');
    make(g, 'hist: single series', 'hist', { title: 'Dine-in ticket times', values: ticketTimes[0].values, binSize: 45e3, format: 'dur', refLines: [{ x: 9 * 60e3, label: 'Warn 9m', tone: 'warn' }] });

    /* ===== heat ===== */
    g = section(col, 'Heat map', 'sequential and diverging, in-cell text only where it fits');
    make(g, 'heat: weekday x hour median ticket time (sequential)', 'heat', {
      title: 'Median ticket time by weekday and hour', sub: 'Colour runs from fastest to slowest, as the key shows. Empty cells have no tickets', rows: WD, cols: heatHours, values: heatVals, scale: 'seq', format: 'dur', legendLabel: 'Median ticket time',
    }, 'span2');
    make(g, 'heat: delta vs 8m target (diverging)', 'heat', {
      title: 'Time against the 8 minute target', sub: 'Faster than target to the left of zero', rows: WD, cols: heatHours, values: heatDelta, scale: 'div', mid: 0, format: 'dur', legendLabel: 'Against target',
    }, 'span2');

    /* ===== scatter / dumbbell ===== */
    g = section(col, 'Scatter and dumbbell');
    make(g, 'scatter: ticket size vs total time (3 channels)', 'scatter', {
      title: 'Ticket size against time', sub: 'Each dot is one ticket', x: { label: 'Items on ticket', min: 0 }, y: { format: 'dur', label: 'Total time' },
      refLines: [{ y: 8 * 60e3, label: 'Warn 8m', tone: 'warn' }],
      series: CHANNELS.slice(0, 3).map((c) => ({ id: c.id, name: c.name, points: Array.from({ length: 40 }, () => { const n = R.int(1, 14); return [n, Math.round(R.logNormal((c.med - 1.6 + n * 0.28) * 60e3, 0.2)), 'Ticket #' + R.int(101, 380)]; }) })),
    });
    make(g, 'dumbbell: starter vs learned vs observed prep time', 'dumbbell', {
      title: 'Prep times: starter, learned, observed', sub: 'The tick is what the line actually did. Flagged rows drift more than 25% from the starter estimate', format: 'durS', aName: 'Starter estimate', bName: 'Learned', cName: 'Observed median',
      rows: calib.map(([label, a, b, c]) => ({ label, a, b, c, aLabel: fmtMS(a), bLabel: fmtMS(b), flag: c / a > 1.25 || c / a < 0.8 })),
    });

    /* ===== gantt ===== */
    g = section(col, 'Gantt');
    const anatomy = [['Mac, large', 40, 66, 338, 360], ['Brisket 1/2 lb', 128, 150, 268, 360], ['Slaw', 330, 336, 351, 360], ['Fried pickles', 20, 44, 352, 360], ['Sweet tea', 335, 340, 348, 360]];
    make(g, 'gantt: ticket anatomy (seconds)', 'gantt', {
      title: 'Ticket #204 anatomy', sub: 'Each item against the ticket clock', x: { type: 'sec', label: 'Time since order' },
      toneNames: { hold: 'Pacing hold', response: 'Waiting for a cook', work: 'Hands-on', dwell: 'Waiting at expo' },
      rows: anatomy.map(([label, fire, start, done, bump]) => ({ label, segments: [{ start: 0, end: fire, tone: 'hold', label: fire > 60 ? 'Hold' : '' }, { start: fire, end: start, tone: 'response' }, { start, end: done, tone: 'work', label: 'Work' }, { start: done, end: bump, tone: 'dwell' }], marks: [{ at: done, label: 'Marked done' }] })),
      refLines: [{ x: 480, label: 'Warn 8:00', tone: 'warn' }],
    }, 'span2');
    const batchRows = [['Brisket batch 3', 10.5, [[10.5, 13.4, 'ok'], [13.4, 13.6, 'check'], [13.6, 15.2, 'ok'], [15.2, 15.3, 'reheat'], [15.3, 17.0, 'ok'], [17.0, 18.0, 'discard']]], ['Pulled pork batch 2', 10.75, [[10.75, 14.75, 'ok']]], ['Pit beans batch 4', 11.5, [[11.5, 12.9, 'ok'], [12.9, 13.2, 'check'], [13.2, 15.5, 'ok']]], ['Jalapeno slaw batch 5', 12, [[12, 16, 'ok']]], ['Mac batch 6', 14, [[14, 15.8, 'ok'], [15.8, 17.9, 'check'], [17.9, 18.2, 'discard']]]];
    make(g, 'gantt: batch timeline (time axis, status tones)', 'gantt', {
      title: 'Hold cabinet timeline', sub: 'Status of each batch through the day', x: { type: 'time' }, toneNames: { ok: 'In range', check: 'Temperature check due', reheat: 'Reheat', discard: 'Discard' },
      rows: batchRows.map(([label, start, segs]) => ({ label, segments: segs.map(([a, b, tone]) => ({ start: midnight + a * HR, end: midnight + b * HR, tone })), marks: [0, 1, 2, 3, 4, 5].map((i) => ({ at: midnight + (start + i * 1.5) * HR, label: 'Temperature logged', tone: 'text' })).filter((mk) => mk.at < midnight + segs[segs.length - 1][1] * HR) })),
    }, 'span2');

    /* ===== meter / ring / spark / stack ===== */
    g = section(col, 'Meter, ring, spark, stack');
    const mc = card(g, 'meter: stock against par, low is bad');
    mc.appendChild(U.h('div', { class: 'ch-title', text: 'Stock on hand', style: 'margin-bottom:12px;font-size:15px;font-weight:600' }));
    const mwrap = U.h('div', { style: 'display:grid;gap:14px' }); mc.appendChild(mwrap);
    [['Brisket', 9800, 14000, 2800, 700, 'g'], ['Pulled pork', 3100, 10000, 2000, 600, 'g'], ['Ribs', 800, 12000, 1800, 900, 'g'], ['Cornbread', 96, 120, 30, 8, 'int'], ['Sweet tea', 0, 40000, 6000, 2000, 'g']].forEach(([label, v, max, warn, breach, fmt]) => {
      const h = U.h('div'); mwrap.appendChild(h);
      (window.__gallery = window.__gallery || []).push({ name: 'meter: ' + label, type: 'meter', host: h, chart: CH.meter(h, { label, value: v, max, warn, breach, invert: true, format: fmt, sub: 'Auto-86 at ' + (fmt === 'g' ? U.fmtG(breach) : breach + ' pieces') }) });
    });
    const pc = card(g, 'meter + ring: pace, high is bad');
    const prow = U.h('div', { style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:20px;align-items:start' }); pc.appendChild(prow);
    const ph = U.h('div'); prow.appendChild(ph);
    // The pace ring: format shows the index with two decimals, and words names each level.
    (window.__gallery = window.__gallery || []).push({ name: 'ring: pace', type: 'ring', host: ph, chart: CH.ring(ph, { value: 0.86, max: 1.5, target: 1, warn: 0.8, breach: 1, label: 'Pace index', sub: 'Last 10 tickets against target', format: (v) => v.toFixed(2), words: { ok: 'Comfortable', warn: 'Busy', bad: 'Behind' } }) });
    const pm = U.h('div', { style: 'display:grid;gap:14px;align-content:start' }); prow.appendChild(pm);
    [['Drive-thru median', 4.4 * 60e3, 9 * 60e3, 6 * 60e3, 9 * 60e3], ['Dine-in median', 7.5 * 60e3, 13 * 60e3, 9 * 60e3, 13 * 60e3], ['Delivery median', 10.2 * 60e3, 12 * 60e3, 8 * 60e3, 10 * 60e3]].forEach(([label, v, max, warn, breach]) => {
      const h = U.h('div'); pm.appendChild(h);
      (window.__gallery = window.__gallery || []).push({ name: 'meter: ' + label, type: 'meter', host: h, chart: CH.meter(h, { label, value: v, max, warn, breach, format: 'dur' }) });
    });
    const kc = card(g, 'spark: KPI tiles', 'span2');
    const krow = U.h('div', { class: 'kpis' }); kc.appendChild(krow);
    [['Median ticket time', '7m 12s', 'Up 0m 20s on last week', 'dur', 1], ['On-time share', '88%', 'Up 3 points on last week', 'pct', 3], ['Tickets per hour', '41', 'Down 2 on last week', 'int', 2], ['86 events', '4', 'Same as last week', 'int', 4]].forEach(([label, big, delta, fmt, slotn]) => {
      const t = U.h('div', { class: 'kpi' }); krow.appendChild(t);
      t.appendChild(U.h('div', { class: 'kpi-l', text: label }));
      t.appendChild(U.h('div', { class: 'ch-big-h kpi-v', text: big }));
      t.appendChild(U.h('div', { class: 'kpi-d', text: delta }));
      const sh = U.h('div'); t.appendChild(sh);
      const vals = Array.from({ length: 14 }, (_, i) => 10 + i * 0.4 + Math.sin(i * 0.9) * 2 + R.next() * 2);
      (window.__gallery = window.__gallery || []).push({ name: 'spark: ' + label, type: 'spark', host: sh, chart: CH.spark(sh, { values: vals, prev: vals.map((v) => v * 0.92 + 0.8), area: true, width: 150, height: 34, label, format: fmt === 'pct' ? (v) => v.toFixed(1) : fmt, tone: slotn === 1 ? 'warn' : 'accent', labels: vals.map((_, i) => U.fmtDateShort(days[i])), prevLabel: 'Last week' }) });
    });
    make(g, 'stack: ticket anatomy by channel (absolute)', 'stack', {
      title: 'Where the time goes by channel', sub: 'Average per ticket', categories: CHANNELS.map((c) => c.name),
      parts: [{ id: 'hold', name: 'Pacing hold', values: [52e3, 38e3, 18e3, 61e3] }, { id: 'response', name: 'Waiting for a cook', values: [41e3, 33e3, 29e3, 52e3] }, { id: 'work', name: 'Hands-on', values: [248e3, 219e3, 171e3, 266e3] }, { id: 'dwell', name: 'Waiting at expo', values: [64e3, 71e3, 22e3, 118e3] }], format: 'dur',
    });
    make(g, 'stack: status mix of tickets (percent)', 'stack', {
      title: 'Ticket status mix by hour', sub: 'Share of tickets', percent: true, categories: ['11 am', '12 pm', '1 pm', '5 pm', '6 pm', '7 pm'],
      parts: [{ id: 'ontime', name: 'On time', tone: 'ok', values: [58, 40, 47, 52, 33, 44] }, { id: 'warn', name: 'Warn', tone: 'warn', values: [9, 14, 11, 10, 15, 12] }, { id: 'overdue', name: 'Overdue', tone: 'bad', values: [2, 8, 5, 3, 11, 6] }], format: 'int',
    });

    /* ===== degenerate data ===== */
    g = section(col, 'Degenerate data', 'None of these may throw or log a console error');
    const big = Array.from({ length: 10000 }, (_, i) => [i, Math.sin(i / 300) * 40 + 60 + R.next() * 8]);
    const spike = big.slice(); spike[5000] = [5000, 400];
    // Draws a chart of type t from deliberately broken data s, titled n. None of these may throw.
    const D = (n, t, s) => make(g, 'degenerate ' + t + ': ' + n, t, Object.assign({ title: n }, s));
    // Line: no data, zeros, one point, gaps and NaN, negatives, 10 000 points, equal values.
    D('no series', 'line', { series: [] });
    D('all zeros', 'line', { series: [{ id: 'a', name: 'Zeros', points: [[0, 0], [1, 0], [2, 0], [3, 0]] }] });
    D('single point', 'line', { series: [{ id: 'a', name: 'One', points: [[5, 12]] }] });
    D('NaN and null mixed', 'line', { series: [{ id: 'a', name: 'Gappy', points: [[0, 1], [1, NaN], [2, 3], [3, null], [4, 5], [NaN, 2], [6, Infinity], [7, 8]] }] });
    D('negative values', 'line', { series: [{ id: 'a', name: 'Down', area: true, points: [[0, -5], [1, -2], [2, 4], [3, -8]] }, { id: 'b', name: 'Up', points: [[0, 3], [1, 2], [2, 1], [3, -1]] }] });
    D('10,000 points with one spike', 'line', { series: [{ id: 'a', name: 'Dense', points: spike }], x: { type: 'linear' } });
    D('equal values', 'line', { series: [{ id: 'a', name: 'Flat', points: [[0, 7], [1, 7], [2, 7]] }, { id: 'b', name: 'Flat 2', points: [[0, 7], [1, 7], [2, 7]] }] });
    // Bar: no data, zeros, NaN and negative, one bar, 300 columns, very long names.
    D('no categories', 'bar', { categories: [], series: [] });
    D('all zeros', 'bar', { categories: ['A', 'B', 'C'], series: [{ id: 'a', name: 'Zero', values: [0, 0, 0] }] });
    D('NaN and negative', 'bar', { categories: ['A', 'B', 'C', 'D'], series: [{ id: 'a', name: 'Mixed', values: [NaN, -4, 6, null] }], labels: 'all' });
    D('one bar', 'bar', { categories: ['Only'], series: [{ id: 'a', name: 'One', values: [42] }] });
    D('300 columns', 'bar', { categories: Array.from({ length: 300 }, (_, i) => 'Item ' + (i + 1)), series: [{ id: 'a', name: 'Many', values: Array.from({ length: 300 }, () => R.int(0, 50)) }] });
    D('very long names', 'bar', { orient: 'h', categories: ['A very long category name that keeps going and going past any sensible label gutter', 'Short'], series: [{ id: 'a', name: 'x', values: [4, 9] }] });
    // Histogram: empty, all the same value, one value, 10 000 values.
    D('empty', 'hist', { values: [] });
    D('all the same value', 'hist', { values: [300e3, 300e3, 300e3, 300e3], format: 'dur' });
    D('one value and NaN', 'hist', { values: [NaN, 5], binSize: 0 });
    D('10,000 values', 'hist', { values: Array.from({ length: 10000 }, () => R.normal(50, 12)), binSize: 2 });
    // Heat map: no rows, all empty cells, one column of equal values.
    D('no rows', 'heat', { rows: [], cols: [], values: [] });
    D('all null', 'heat', { rows: ['A'], cols: ['x', 'y'], values: [[null, NaN]] });
    D('1 by 1 and constant', 'heat', { rows: ['A', 'B'], cols: ['x'], values: [[5], [5]], format: 'int' });
    // Scatter and dumbbell: empty, one point, 10 000 points, NaN, missing ends.
    D('empty', 'scatter', { series: [] });
    D('one point', 'scatter', { series: [{ id: 'a', name: 'P', points: [[3, 4]] }] });
    D('10,000 points', 'scatter', { series: [{ id: 'a', name: 'Cloud', points: Array.from({ length: 10000 }, () => [R.normal(50, 15), R.normal(50, 15)]) }] });
    D('NaN points', 'scatter', { series: [{ id: 'a', name: 'P', points: [[NaN, 1], [2, NaN], [3, 3]] }] });
    D('no rows', 'dumbbell', { rows: [] });
    D('missing and equal ends', 'dumbbell', { rows: [{ label: 'Only start', a: 5 }, { label: 'Equal', a: 4, b: 4 }, { label: 'Both zero', a: 0, b: 0 }], format: 'int' });
    // Gantt: no rows, an empty row, a zero-length segment.
    D('no rows', 'gantt', { rows: [] });
    D('empty row and zero length', 'gantt', { rows: [{ label: 'Nothing', segments: [] }, { label: 'Instant', segments: [{ start: 5, end: 5, tone: 'ok' }] }], x: { type: 'sec' } });
    // Meter and ring: NaN, zero maximum, value above the maximum, negative, no data.
    D('NaN, zero max, over max', 'meter', { label: 'Odd', value: NaN, max: 0 });
    D('value above max', 'meter', { label: 'Overfull', value: 150, max: 100, warn: 70, breach: 90, format: 'int' });
    D('negative value', 'meter', { label: 'Below zero', value: -5, max: 100 });
    D('ring: no data', 'ring', { value: null, max: 1, label: 'Pace' });
    D('ring: over max', 'ring', { value: 9, max: 2, label: 'Huge', warn: 1, breach: 1.5 });
    // Spark: empty, single value, NaN inside.
    D('empty and NaN', 'spark', { values: [] });
    D('single and flat', 'spark', { values: [3] });
    D('NaN inside', 'spark', { values: [1, NaN, 3, null, 5] });
    // Stack: no data, all zeros.
    D('no categories', 'stack', { categories: [], parts: [] });
    D('all zeros', 'stack', { categories: ['A', 'B'], parts: [{ id: 'x', name: 'X', values: [0, 0] }, { id: 'y', name: 'Y', values: [0, 0] }] });
  }

  const wrap = document.getElementById('gal');
  if (themes.length === 1) wrap.style.gridTemplateColumns = '1fr';
  themes.forEach((t) => {
    const col = U.h('div', { class: 'office gal', 'data-otheme': t });
    col.appendChild(U.h('h1', { class: 'gal-h1', text: t === 'ember' ? 'Ember (dark office)' : 'Paper (light office)' }));
    wrap.appendChild(col);
    try { build(col); } catch (e) { errors.push('build ' + t + ': ' + (e && e.stack || e)); }
  });
  window.__galleryReady = true;
}

/* ------------------------------------------------------------------------------------------------------------------ */
// Styles for the gallery page only: the two theme columns, headings, KPI tiles and the sticky button bar.
// Chart styles come from 40-charts.css.
const CSS_HARNESS = `
html,body{margin:0;background:#101213;}
body{font-family:var(--font-body,Barlow,system-ui,sans-serif);}
#gal{display:grid;grid-template-columns:1fr 1fr;align-items:start;}
@media (max-width:1100px){#gal{grid-template-columns:1fr;}}
.gal{box-sizing:border-box;padding:8px 20px 56px;min-width:0;background:#181513;color:var(--ch-text);}
.gal[data-otheme="paper"]{background:#F5F2EB;}
.gal-h1{font-family:var(--font-display,"Barlow Condensed","Arial Narrow",system-ui,sans-serif);font-size:30px;font-weight:600;margin:18px 0 0;color:var(--ch-text);}
.gal h2{font-family:var(--font-display,"Barlow Condensed","Arial Narrow",system-ui,sans-serif);font-size:24px;font-weight:600;margin:34px 0 4px;color:var(--ch-text);}
.gal-note{margin:0 0 12px;color:var(--ch-text2);font-size:13px;}
.gal .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,400px),1fr));gap:16px;margin-top:12px;align-items:start;}
.gal .span2{grid-column:1/-1;}
.gal-tag{font-size:11px;color:var(--ch-text2);margin:0 0 10px;padding-bottom:6px;border-bottom:1px solid var(--ch-grid);}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:16px;}
.kpi{min-width:0;}
.kpi-l{font-size:13px;color:var(--ch-text2);}
.kpi-v{white-space:nowrap;font-size:clamp(30px,9vw,44px);line-height:1.05;margin:2px 0;font-family:var(--font-display,"Barlow Condensed","Arial Narrow",system-ui,sans-serif);font-weight:600;}
.kpi-d{font-size:12px;color:var(--ch-text2);margin-bottom:6px;}
.gal-bar{position:sticky;top:0;z-index:20;display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;padding:8px 20px;background:#0c0e0f;color:#d8d3c6;font-size:13px;border-bottom:1px solid #2c3234;}
.gal-bar button{font:inherit;color:inherit;background:#1d2224;border:1px solid #4a5254;border-radius:6px;padding:4px 10px;cursor:pointer;}
`;

// Reads a text file, or gives empty text if it is missing, so an absent optional file never stops the build.
function readIf(p) { return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : ''; }
// Wraps one source file in the same banner line and safety wrapper build.mjs uses, so a broken file is
// reported by name.
function wrapModule(name, body) {
  return `\n/* ===== ${name} ===== */\n;try{\n${body}\n}catch(e){console.error('[smokebox] module ${name} failed to load:',e);window.__sbLoadErrors=(window.__sbLoadErrors||[]);window.__sbLoadErrors.push({file:'${name}',message:String(e&&e.message||e)});}\n`;
}

// Writes dist/charts-gallery.html with the real styles and code inlined and the harness run on load. Returns
// { html, bytes, css, js }.
export function buildGallery() {
  const cssFiles = ['00-tokens.css', '40-charts.css'].filter((f) => fs.existsSync(path.join(root, 'src/css', f)));
  const jsFiles = ['00-util.js', '10-config.js', '50-charts.js'].filter((f) => fs.existsSync(path.join(root, 'src/js', f)));
  let css = '';
  for (const f of cssFiles) css += `\n/* ===== ${f} ===== */\n` + readIf(path.join(root, 'src/css', f));
  let js = '';
  for (const f of jsFiles) {
    const body = readIf(path.join(root, 'src/js', f));
    if (/<\/script/i.test(body)) throw new Error(`${f} contains "</script"`);
    js += wrapModule(f, body);
  }
  const tpl = readIf(path.join(root, 'src/index.template.html'));
  const fonts = (tpl.match(/<link[^>]+fonts\.googleapis[^>]*>/g) || []).join('\n');
  // The page: font links and styles, the button bar, the chart code (each file wrapped), then the harness
  // and the button wiring.
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark light">
<title>Smokebox charts gallery</title>
${fonts}
<style>${css}\n${CSS_HARNESS}</style>
</head>
<body>
<div class="gal-bar"><strong>Smokebox charts gallery</strong>
<button type="button" id="b-tex" aria-pressed="false">Texture: off</button>
<button type="button" id="b-tbl">View every chart as a table</button>
<button type="button" id="b-theme">Flip both themes at runtime</button>
<span>Barlow loads from Google Fonts when online; offline it falls back to the system sans.</span></div>
<div id="gal"></div>
<script>${js}\n</script>
<script>
;try{(${harness.toString()})();
var q=function(i){return document.getElementById(i)};
q('b-tex').onclick=function(){var on=this.getAttribute('aria-pressed')!=='true';this.setAttribute('aria-pressed',on);this.textContent='Texture: '+(on?'on':'off');SB.charts.setTexture(on);};
q('b-tbl').onclick=function(){(window.__gallery||[]).forEach(function(g){try{g.chart.setTable(true)}catch(e){}});};
q('b-theme').onclick=function(){document.querySelectorAll('.gal').forEach(function(c){c.setAttribute('data-otheme',c.getAttribute('data-otheme')==='ember'?'paper':'ember')});SB.charts.refreshTheme();};
}catch(e){console.error('[gallery] harness failed',e);(window.__galleryErrors=window.__galleryErrors||[]).push(String(e&&e.stack||e));}
</script>
</body>
</html>
`;
  // Save the page, creating dist/ first if it does not exist.
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, html);
  return { html, bytes: html.length, css: cssFiles, js: jsFiles };
}

/* ------------------------------------------------------------------------------------------------------------------
 * --check: drive the gallery in headless Chromium
 * ---------------------------------------------------------------------------------------------------------------- */
// The --check mode: opens the gallery in headless Chromium at a wide and a phone size, runs the probes,
// prints ok or FAIL lines and exits 1 if any failed.
async function check() {
  const { withPage } = await import('./pw.mjs');
  const shotsIdx = args.indexOf('--shots');
  const shots = shotsIdx >= 0 ? path.resolve(args[shotsIdx + 1]) : null;
  if (shots) fs.mkdirSync(shots, { recursive: true });
  let failures = 0;
  // Prints one check result line and counts the failures.
  const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) failures++; };

  for (const vp of [{ w: 1280, h: 900, tag: 'wide' }, { w: 390, h: 844, tag: 'phone', touch: true }]) {
    console.log(`\n== ${vp.tag} ${vp.w}x${vp.h}`);
    await withPage({ w: vp.w, h: vp.h, file: outFile, touch: !!vp.touch, hash: '' }, async (page, logs) => {
      await page.waitForFunction(() => window.__galleryReady === true, null, { timeout: 15000 });
      await page.waitForTimeout(900);                                    // entry animations (<= 400 ms) settle
      const stats = await page.evaluate(() => ({
        charts: (window.__gallery || []).length, errors: window.__galleryErrors, loadErrors: window.__sbLoadErrors || [],
        svgs: document.querySelectorAll('.ch-svg').length, empties: document.querySelectorAll('.ch-empty:not([hidden])').length,
        hscroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      }));
      ok(stats.charts > 60, `${stats.charts} charts built (${stats.svgs} svg, ${stats.empties} empty states)`);
      ok(!stats.errors.length, 'harness errors: ' + JSON.stringify(stats.errors));
      ok(!stats.loadErrors.length, 'module load errors: ' + JSON.stringify(stats.loadErrors));
      ok(!stats.hscroll, 'no horizontal page scroll');
      ok(!logs.errors.length && !logs.pageErrors.length, 'console clean ' + JSON.stringify(logs.errors.concat(logs.pageErrors)).slice(0, 400));

      // --- interaction probes on the first ember column
      const probe = await page.evaluate(async () => {
        const out = {};
        const col = document.querySelector('.gal[data-otheme="ember"]') || document.querySelector('.gal');
        // The first chart of this type inside the ember column.
        const first = (type) => (window.__gallery || []).find((g) => g.type === type && col.contains(g.host));
        // True when the element is completely on screen.
        const inView = (el) => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5; };
        // Sends a pointer event (mouse or touch) to an element at the point x, y.
        const fire = (el, type, x, y, pt) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerType: pt || 'mouse', isPrimary: true }));
        // line: hover near the right edge so clipping would show
        const line = first('line'); line.host.scrollIntoView({ block: 'center' }); await new Promise((r) => setTimeout(r, 80));
        const hit = line.host.querySelector('.ch-hit'); const rb = hit.getBoundingClientRect();
        fire(hit, 'pointermove', rb.right - 3, rb.top + 40);
        const tip = line.host.querySelector('.ch-tip');
        out.lineTip = { shown: !tip.hidden, inView: inView(tip), text: tip.textContent.slice(0, 80), cross: line.host.querySelector('.ch-xh').getAttribute('visibility') };
        fire(hit, 'pointerleave', 0, 0);
        out.lineTipHidden = tip.hidden;
        // bar: hover first mark
        const bar = first('bar'); bar.host.scrollIntoView({ block: 'center' }); await new Promise((r) => setTimeout(r, 80));
        const mk = bar.host.querySelector('[data-m]'); const mb = mk.getBoundingClientRect();
        fire(mk, 'pointermove', mb.left + mb.width / 2, mb.top + mb.height / 2);
        const btip = bar.host.querySelector('.ch-tip');
        out.barTip = { shown: !btip.hidden, inView: inView(btip), text: btip.textContent.slice(0, 60), lifted: !!bar.host.querySelector('.ch-hot') };
        // touch tap on a heat cell, then tap elsewhere hides
        const heat = first('heat'); heat.host.scrollIntoView({ block: 'center' }); await new Promise((r) => setTimeout(r, 80));
        const cell = heat.host.querySelectorAll('[data-m]')[12]; const cb = cell.getBoundingClientRect();
        fire(cell, 'pointerdown', cb.left + 3, cb.top + 3, 'touch');
        const htip = heat.host.querySelector('.ch-tip');
        out.heatTap = { shown: !htip.hidden, inView: inView(htip), text: htip.textContent.slice(0, 60) };
        document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' }));
        out.heatTapOutsideHides = htip.hidden;
        // keyboard: focus a mark, arrow, tooltip follows
        const marks = bar.host.querySelectorAll('[data-m]'); marks[0].focus();
        marks[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        out.kbd = { focusIdx: document.activeElement && document.activeElement.getAttribute('data-m'), aria: document.activeElement && document.activeElement.getAttribute('aria-label'), tabindex0: bar.host.querySelectorAll('[data-m][tabindex="0"]').length };
        // table view
        const hist = first('hist'); hist.chart.setTable(true);
        out.table = { rows: hist.host.querySelectorAll('.ch-tbl tbody tr').length, svgHidden: hist.host.querySelector('.ch-plot').hidden, pressed: hist.host.querySelector('.ch-tbtn').getAttribute('aria-pressed') };
        hist.chart.setTable(false);
        out.tableBack = !hist.host.querySelector('.ch-plot').hidden;
        // legend toggle keeps survivor colours
        const l2 = first('line'); const btns = l2.host.querySelectorAll('.ch-legend button');
        const before = Array.from(l2.host.querySelectorAll('.ch-g-marks path.ch-ln')).map((p) => p.getAttribute('style'));
        btns[btns.length - 1].click();
        const after = Array.from(l2.host.querySelectorAll('.ch-g-marks path.ch-ln')).map((p) => p.getAttribute('style'));
        out.legend = { buttons: btns.length, before: before.length, after: after.length, survivorsKeepColour: after.every((s) => before.indexOf(s) >= 0) };
        l2.host.querySelectorAll('.ch-legend button')[btns.length - 1].click();
        // runtime theme switch repaints
        const probeEl = bar.host.querySelector('.ch-g-bars path'); const pal0 = SB.charts.palette(col);
        col.setAttribute('data-otheme', 'paper'); SB.charts.refreshTheme(); const pal1 = SB.charts.palette(col);
        out.theme = { before: pal0.theme, after: pal1.theme, surfaceChanged: pal0.surface !== pal1.surface, cat1Changed: pal0.cat[0] !== pal1.cat[0], bars: !!bar.host.querySelector('.ch-g-bars path') };
        col.setAttribute('data-otheme', 'ember'); SB.charts.refreshTheme();
        return out;
      });
      ok(probe.lineTip.shown && probe.lineTip.inView && probe.lineTip.cross === 'visible', 'line tooltip shows near the right edge and stays on screen: ' + JSON.stringify(probe.lineTip));
      ok(probe.lineTipHidden, 'line tooltip hides on leave');
      ok(probe.barTip.shown && probe.barTip.inView && probe.barTip.lifted, 'bar tooltip shows, on screen, hovered bar lifts: ' + JSON.stringify(probe.barTip));
      ok(probe.heatTap.shown && probe.heatTap.inView && probe.heatTapOutsideHides, 'touch tap shows heat-cell tooltip; tapping elsewhere hides it: ' + JSON.stringify(probe.heatTap));
      ok(probe.kbd.focusIdx === '1' && probe.kbd.tabindex0 === 1 && !!probe.kbd.aria, 'keyboard arrows move roving focus; marks have aria-labels: ' + JSON.stringify(probe.kbd));
      ok(probe.table.rows > 3 && probe.table.svgHidden && probe.table.pressed === 'true' && probe.tableBack, 'table view toggles: ' + JSON.stringify(probe.table));
      ok(probe.legend.buttons >= 3 && probe.legend.after === probe.legend.before - 1 && probe.legend.survivorsKeepColour, 'legend toggle removes one series, survivors keep their colour: ' + JSON.stringify(probe.legend));
      ok(probe.theme.before === 'ember' && probe.theme.after === 'paper' && probe.theme.surfaceChanged && probe.theme.cat1Changed, 'runtime theme switch re-reads tokens: ' + JSON.stringify(probe.theme));
      const after = await page.evaluate(() => ({ e: window.__galleryErrors }));
      ok(!logs.errors.length && !logs.pageErrors.length && !after.e.length, 'console still clean after interaction');

      if (shots) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: path.join(shots, `gallery-${vp.tag}-full.png`), fullPage: true });
        const secs = await page.evaluate(() => Array.from(document.querySelectorAll('.gal')).map((c, ci) => Array.from(c.querySelectorAll('h2')).map((h) => ({ ci, id: h.id }))).flat());
        for (const s of secs) {
          const el = await page.$(`.gal:nth-of-type(${s.ci + 1}) #${s.id}`);
          const box = await page.evaluate(({ ci, id }) => {
            const h = document.querySelectorAll('.gal')[ci].querySelector('#' + id); const grid = h.nextElementSibling.classList.contains('gal-note') ? h.nextElementSibling.nextElementSibling : h.nextElementSibling;
            const a = h.getBoundingClientRect(), b = grid.getBoundingClientRect(); return { x: Math.max(0, a.left + scrollX - 8), y: a.top + scrollY - 6, w: Math.min(innerWidth, b.width + 16), h: b.bottom - a.top + 12 };
          }, s);
          await page.screenshot({ path: path.join(shots, `${vp.tag}-${s.ci ? 'paper' : 'ember'}-${s.id.replace('sec-', '')}.png`), fullPage: true, clip: { x: box.x, y: box.y, width: box.w, height: Math.min(box.h, 6000) } });
        }
      }
    });
  }
  console.log(failures ? `\n${failures} check(s) FAILED` : '\nall gallery checks passed');
  process.exit(failures ? 1 : 0);
}

// Main: build the page, then run the checks if --check was given.
const info = buildGallery();
console.log(`built ${path.relative(root, outFile)}  ${(info.bytes / 1024).toFixed(0)} KB`);
console.log(`  css: ${info.css.join(', ')}`);
console.log(`  js:  ${info.js.join(', ')}`);
if (args.includes('--check')) await check();
