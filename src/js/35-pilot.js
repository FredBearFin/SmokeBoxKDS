/*
 * WHAT THIS FILE IS: The pilot report. For a real watched service, it turns the event log, the batches and the
 *    saved sound log into the few numbers the real-service gate needs: pulls logged against the cuts an observer
 *    counted, sounds and what people did about them, discards and their weekly cost, taps per job, and how the
 *    pace estimate compares with what was really pulled. Pure functions: no screen, no storage.
 * PARTS: 1 helpers, 2 the report, 3 text and CSV.
 * USES: 00-util, 10-config, 20-engine (allEvents), 25-deadlines (salesRate, optional).
 *    USED BY: the Data page of the back office, the board (saved sound log), tests.
 */
(function (g) {
  'use strict';
  const SB = (g.SB = g.SB || {});
  const U = SB.util;
  const C = SB.config;
  const MIN = 60e3, H = 3600e3;
  // The engine, looked up when used so tests can swap it.
  const E = () => SB.engine;

  // ---------- 1. helpers ----------
  // Rounds a number to one decimal place for the report.
  const r1 = (n) => Math.round(n * 10) / 10;
  // A count per hour over a window, or null when the window is empty.
  const perHour = (n, hours) => (hours > 0 ? r1(n / hours) : null);
  // The middle value of a list of numbers, or null when empty.
  function median(a) {
    if (!a.length) return null;
    const s = a.slice().sort((x, y) => x - y), m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
  // The start of the current service day's opening, from the service hours, as the default start of a report.
  function defaultFrom(state, now) {
    const sv = state.settings && state.settings.service ? state.settings.service : C.service;
    const d = new Date(now);
    d.setHours(Math.floor(sv.openHour || 0), Math.round(((sv.openHour || 0) % 1) * 60), 0, 0);
    if (d.getTime() > now) d.setDate(d.getDate() - 1);
    return d.getTime();
  }

  // ---------- 2. the report ----------
  // Builds the report for the window opts.from to opts.to (default: since opening, until now). opts.alerts is the
  // saved sound log, opts.cutsCounted the number of cuts an observer counted by eye (or null). Events that were
  // undone and tickets or batches made by the demo or the sample data are left out and counted.
  function build(state, opts) {
    opts = opts || {};
    const to = U.isNum(opts.to) ? opts.to : (U.isNum(opts.now) ? opts.now : Date.now());
    const from = U.isNum(opts.from) ? opts.from : defaultFrom(state, to);
    const hours = Math.max(0, (to - from) / H);
    // True when a time falls inside the report window.
    const inWin = (t) => U.isNum(t) && t >= from && t <= to;
    const all = E().allEvents(state).filter((e) => inWin(e.t));
    const ev = all.filter((e) => !e.reverted);
    const demoTickets = new Set((state.tickets || []).filter((t) => t.src === 'demo' || t.src === 'sample').map((t) => t.id));
    const sampleBatches = new Set((state.batches || []).filter((b) => b.src === 'sample' || b.src === 'starter').map((b) => b.id));
    const out = {
      window: { from, to, hours: r1(hours) },
      excluded: { reverted: all.length - ev.length, demoTickets: demoTickets.size, sampleOrStarterBatches: sampleBatches.size, demoClock: !!opts.demoClock },
      pulls: { n: 0, g: 0, byIng: {}, cutsCounted: U.isNum(opts.cutsCounted) && opts.cutsCounted > 0 ? Math.round(opts.cutsCounted) : null, tapRate: null },
      sounds: { total: 0, firstSounds: 0, repeats: 0, byLevel: { 1: 0, 2: 0, 3: 0, 4: 0 }, acknowledged: 0, notLeader: 0, lapses: 0, warnings: 0, warningsAcked: 0, ackRate: null },
      undos: 0, refused: 0,
      keeps: { kept: 0, corrected: 0, snoozed: 0 },
      discards: { n: 0, g: 0, cost: null, costKnownN: 0, costUnknownN: 0, byIng: {}, byReason: {}, perDayCost: null, perWeekCost: null, days: r1(Math.max(hours / 24, 0)) },
      taps: { hours: r1(hours), jobs: {} },
      tickets: { used: false, n: 0, medianSec: null },
      settings: {
        hotHoldF: state.settings && state.settings.safety ? state.settings.safety.hotHoldF : C.safety.hotHoldF,
        tempCheckEveryMin: state.settings && state.settings.safety ? state.settings.safety.tempCheckEveryMin : C.safety.tempCheckEveryMin,
        hardCapH: state.settings && state.settings.safety ? state.settings.safety.hardCapH : C.safety.hardCapH,
        ladder: state.settings && state.settings.alerts && state.settings.alerts.ladderThresholds ? state.settings.alerts.ladderThresholds : 'built in',
      },
    };
    const job = (name, n) => { out.taps.jobs[name] = { n, perHour: perHour(n, hours) }; };
    // Pulls: per product, with the pace the board estimates now beside what was pulled in the last 2 hours.
    const recent = to - 2 * H;
    for (const e of ev) {
      if (e.type !== 'cabinet_pull' || !U.isNum(e.g)) continue;
      // A pull drawn only from sample or starter batches is pretend food, left out like the other sample things.
      if (Array.isArray(e.batchIds) && e.batchIds.length && e.batchIds.every((id) => sampleBatches.has(id))) continue;
      out.pulls.n++; out.pulls.g += e.g;
      const p = out.pulls.byIng[e.ing] || (out.pulls.byIng[e.ing] = { n: 0, g: 0, last2hG: 0, estGPerMin: null, realizedGPerMin: null });
      p.n++; p.g += e.g;
      if (e.t >= recent) p.last2hG += e.g;
    }
    const span2h = Math.max(30, Math.min(120, hours * 60));
    let est = null;
    try { est = SB.deadlines && SB.deadlines.salesRate ? SB.deadlines.salesRate(state, to).rate : null; } catch (e) { est = null; }
    for (const id of Object.keys(out.pulls.byIng)) {
      const p = out.pulls.byIng[id];
      p.g = Math.round(p.g);
      p.realizedGPerMin = r1(p.last2hG / span2h);
      p.estGPerMin = est && U.isNum(est[id]) ? r1(est[id] * MIN) : null;
      delete p.last2hG;
    }
    out.pulls.g = Math.round(out.pulls.g);
    if (out.pulls.cutsCounted) out.pulls.tapRate = Math.round(1000 * out.pulls.n / out.pulls.cutsCounted) / 10;
    // Discards: grams, cost, per product and reason, and what a week would cost at this day's rate. A discard with no cost
    // on record is counted as unknown: it never adds zero, and a group where nothing is known reads as unknown (null).
    const money = (o) => { o.cost = o.known ? Math.round(o.sum * 100) / 100 : null; o.costUnknownN = o.unknown; delete o.sum; delete o.known; delete o.unknown; };
    const grp = (o, k) => o[k] || (o[k] = { g: 0, sum: 0, known: 0, unknown: 0 });
    let sumKnown = 0;
    for (const e of ev) {
      if (e.type !== 'batch_discard' || sampleBatches.has(e.batchId)) continue;
      const g0 = U.isNum(e.g) ? e.g : 0, hasCost = U.isNum(e.cost);
      out.discards.n++; out.discards.g += g0;
      if (hasCost) { out.discards.costKnownN++; sumKnown += e.cost; } else out.discards.costUnknownN++;
      for (const gp of [grp(out.discards.byIng, e.ing), grp(out.discards.byReason, e.reason || 'other')]) { gp.g += g0; if (hasCost) { gp.sum += e.cost; gp.known++; } else gp.unknown++; }
    }
    out.discards.g = Math.round(out.discards.g);
    out.discards.cost = out.discards.costKnownN ? Math.round(sumKnown * 100) / 100 : out.discards.n ? null : 0;       // no discards is a calm 0; discards with no cost on record are unknown
    for (const o of [out.discards.byIng, out.discards.byReason]) for (const k of Object.keys(o)) { o[k].g = Math.round(o[k].g); money(o[k]); }
    const days = Math.max(hours / 24, 1 / 3);
    out.discards.perDayCost = out.discards.cost == null ? null : Math.round(out.discards.cost / days * 100) / 100;
    out.discards.perWeekCost = out.discards.cost == null ? null : Math.round(out.discards.cost / days * 7 * 100) / 100;
    // Sounds from the saved log (real tablets only keep what the board wrote).
    const warned = new Set(), acked = new Set();
    for (const a of opts.alerts || []) {
      if (!inWin(a.t)) continue;
      if (a.ack) { out.sounds.acknowledged++; if (typeof a.id === 'string') acked.add(a.id); continue; }
      if (typeof a.id === 'string') warned.add(a.id);
      out.sounds.total++;
      if (a.repeat) out.sounds.repeats++; else out.sounds.firstSounds++;
      if (out.sounds.byLevel[a.level] !== undefined) out.sounds.byLevel[a.level]++;
      if (a.leader === false) out.sounds.notLeader++;
      if (a.kind === 'past' && !a.repeat && /:[1-9]\d*$/.test(a.id || '')) out.sounds.lapses++;
    }
    // Each distinct warning counts once, however many times it repeated; it is acknowledged when someone tapped it.
    out.sounds.warnings = warned.size;
    out.sounds.warningsAcked = Array.from(warned).filter((id) => acked.has(id)).length;
    out.sounds.ackRate = warned.size ? Math.round(1000 * out.sounds.warningsAcked / warned.size) / 10 : null;
    // Undos and refused taps (the screen reports a refusal back to the log) in the window; undone events themselves stay excluded.
    out.undos = ev.filter((e) => e.type === 'undo').length;
    out.refused = ev.filter((e) => e.type === 'ui_report').length;
    for (const e of ev) {
      if (e.type === 'quality_extend') out.keeps.kept++;
      else if (e.type === 'quality_extend_corrected') out.keeps.corrected++;
      else if (e.type === 'alert_snoozed') out.keeps.snoozed++;
    }
    // Taps per job: each job is one dispatched action, so the events that record it are the count.
    const count = (type, pred) => ev.filter((e) => e.type === type && (!pred || pred(e))).length;
    job('pull', out.pulls.n);
    job('log a temperature', count('temp_logged'));
    job('new batch', count('batch_in', (e) => e.src === 'cook' && !sampleBatches.has(e.batchId)));
    job('keep serving', out.keeps.kept);
    job('discard', out.discards.n);
    job('remind me later', out.keeps.snoozed);
    // Tickets, only when Smokebox tickets were used (a pit-only pilot has none).
    const secs = [];
    for (const t of state.tickets || []) {
      if (demoTickets.has(t.id) || !inWin(t.createdAt)) continue;
      out.tickets.n++;
      if (U.isNum(t.expeditedAt)) secs.push((t.expeditedAt - t.createdAt) / 1000);
    }
    out.tickets.used = out.tickets.n > 0;
    out.tickets.medianSec = secs.length ? Math.round(median(secs)) : null;
    return out;
  }

  // ---------- 3. text and CSV ----------
  // Writes a money amount in dollars with two cents digits.
  const usd = (n) => (U.isNum(n) ? U.currencySymbol() + n.toFixed(2) : 'unknown');
  // Plain-words summary of a report, one line per fact, for the screen and for pasting into notes.
  function toText(r) {
    const L = [];
    // Writes a time in the reader's own date format.
    const when = (t) => new Date(t).toLocaleString();
    L.push('Pilot report: ' + when(r.window.from) + ' to ' + when(r.window.to) + ' (' + r.window.hours + ' hours).');
    if (r.excluded.demoClock) L.push('WARNING: the demo clock or demo orders were on; demo pulls cannot be told apart, so do not trust these numbers.');
    L.push('Left out: ' + r.excluded.reverted + ' undone events, ' + r.excluded.demoTickets + ' demo tickets, ' + r.excluded.sampleOrStarterBatches + ' sample or starter batches.');
    L.push('Pulls: ' + r.pulls.n + ' taps, ' + U.fmtG(r.pulls.g) + '.' + (r.pulls.cutsCounted ? ' Observer counted ' + r.pulls.cutsCounted + ' cuts: ' + r.pulls.tapRate + ' percent got a pull tap (the gate needs at least 50).' : ' No observer count entered yet.'));
    for (const id of Object.keys(r.pulls.byIng)) { const p = r.pulls.byIng[id]; L.push('  ' + id + ': ' + p.n + ' pulls, ' + U.fmtG(p.g) + '; last 2 h pulled ' + p.realizedGPerMin + ' g/min, board estimates ' + (p.estGPerMin == null ? 'unknown' : p.estGPerMin + ' g/min') + '.'); }
    L.push('Sounds: ' + r.sounds.total + ' (' + r.sounds.firstSounds + ' first sounds, ' + r.sounds.repeats + ' repeats; chime ' + r.sounds.byLevel[1] + ', voice ' + r.sounds.byLevel[2] + ', loud ' + r.sounds.byLevel[3] + ', limit ' + r.sounds.byLevel[4] + '); ' + r.sounds.acknowledged + ' taps on a warning; ' + r.sounds.lapses + ' lapses after a keep; ' + r.sounds.notLeader + ' held back by another tab.');
    L.push('Batches kept serving: ' + r.keeps.kept + ' (' + r.keeps.corrected + ' corrected); reminders put off: ' + r.keeps.snoozed + '.');
    const dc = r.discards;
    L.push('Discards: ' + dc.n + ' batches, ' + U.fmtG(dc.g) + ', ' + (dc.cost == null ? (dc.n ? 'cost unknown (no ingredient cost on record)' : usd(0)) : usd(dc.cost) + (dc.costUnknownN ? ' plus ' + dc.costUnknownN + ' with no cost recorded' : '')) + (dc.perWeekCost == null ? '.' : r.window.hours < 12 ? ' in this window. A week at this rate would be about ' + usd(dc.perWeekCost) + ' (one service only: a rough guess).' : '; about ' + usd(dc.perWeekCost) + ' a week at this rate.'));
    L.push('Warnings: ' + r.sounds.warnings + ' distinct, ' + r.sounds.warningsAcked + ' acknowledged' + (r.sounds.ackRate == null ? '' : ' (' + r.sounds.ackRate + ' percent)') + '. Undos: ' + r.undos + '. Refused taps: ' + r.refused + '.');
    L.push('Taps per hour: ' + Object.keys(r.taps.jobs).map((k) => k + ' ' + r.taps.jobs[k].n + (r.taps.jobs[k].perHour == null ? '' : ' (' + r.taps.jobs[k].perHour + '/h)')).join(', ') + '.');
    L.push(r.tickets.used ? 'Tickets: ' + r.tickets.n + ', median ' + (r.tickets.medianSec == null ? 'unknown' : r.tickets.medianSec + ' s') + ' to bump.' : 'Tickets: Smokebox tickets were not used.');
    L.push('Settings in force: hot hold ' + r.settings.hotHoldF + ' F, temperature check every ' + r.settings.tempCheckEveryMin + ' min, hard cap ' + r.settings.hardCapH + ' h, warning times ' + (typeof r.settings.ladder === 'string' ? r.settings.ladder : JSON.stringify(r.settings.ladder)) + '.');
    return L.join('\n');
  }
  // CSV text of the report in a long layout (section, name, value, unit): easy to open in a spreadsheet and to paste into notes.
  function toCsv(r) {
    const rows = [['section', 'name', 'value', 'unit']];
    // Adds one fact as a line of the table.
    const add = (s, n, v, u) => rows.push([s, n, v == null ? '' : v, u || '']);
    add('window', 'from', new Date(r.window.from).toISOString()); add('window', 'to', new Date(r.window.to).toISOString()); add('window', 'hours', r.window.hours, 'h');
    for (const k of Object.keys(r.excluded)) add('excluded', k, r.excluded[k]);
    add('pulls', 'taps', r.pulls.n); add('pulls', 'grams', r.pulls.g, 'g'); add('pulls', 'cuts counted by observer', r.pulls.cutsCounted); add('pulls', 'pull-tap rate', r.pulls.tapRate, '%');
    for (const id of Object.keys(r.pulls.byIng)) { const p = r.pulls.byIng[id]; add('pulls ' + id, 'taps', p.n); add('pulls ' + id, 'grams', p.g, 'g'); add('pulls ' + id, 'realized last 2h', p.realizedGPerMin, 'g/min'); add('pulls ' + id, 'board estimate', p.estGPerMin, 'g/min'); }
    for (const k of Object.keys(r.sounds)) if (k !== 'byLevel') add('sounds', k, r.sounds[k]);
    for (const l of [1, 2, 3, 4]) add('sounds', 'level ' + l, r.sounds.byLevel[l]);
    for (const k of Object.keys(r.keeps)) add('keeps', k, r.keeps[k]);
    add('discards', 'batches', r.discards.n); add('discards', 'grams', r.discards.g, 'g'); add('discards', 'cost', r.discards.cost, '$'); add('discards', 'batches with no cost recorded', r.discards.costUnknownN);
    add('warnings', 'distinct', r.sounds.warnings); add('warnings', 'acknowledged', r.sounds.warningsAcked); add('warnings', 'acknowledged rate', r.sounds.ackRate, '%'); add('undo', 'undos', r.undos); add('undo', 'refused taps', r.refused); add('discards', 'cost per week at this rate', r.discards.perWeekCost, '$');
    for (const id of Object.keys(r.discards.byIng)) add('discards ' + id, 'cost', r.discards.byIng[id].cost, '$');
    for (const k of Object.keys(r.discards.byReason)) add('discards by reason', k, r.discards.byReason[k].cost, '$');
    for (const k of Object.keys(r.taps.jobs)) { add('taps', k, r.taps.jobs[k].n); add('taps', k + ' per hour', r.taps.jobs[k].perHour, '/h'); }
    add('tickets', 'count', r.tickets.n); add('tickets', 'median seconds to bump', r.tickets.medianSec, 's');
    add('settings', 'hot hold', r.settings.hotHoldF, 'F'); add('settings', 'temperature check', r.settings.tempCheckEveryMin, 'min'); add('settings', 'hard cap', r.settings.hardCapH, 'h');
    // Quote a cell when it holds a comma, quote or line break; text cells never start with a formula sign.
    const cell = (v) => { let s = String(v); if (/^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s)) s = "'" + s; return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    return rows.map((x) => x.map(cell).join(',')).join('\n') + '\n';
  }

  SB.pilot = { build, toText, toCsv, defaultFrom, KEY_ALERTLOG: 'smokebox.v1.alertlog', LOG_MAX: 400 };
})(typeof globalThis !== 'undefined' ? globalThis : window);
