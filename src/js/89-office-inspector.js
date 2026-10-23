/*
 * WHAT THIS FILE IS: A printable food-safety record for the owner: temperature readings, reheats, cooling, sanitize
 * rounds and thrown-out food, each with who logged it, and any corrections added later. It opens from the Safety page.
 * PARTS: 1 pure rows (runs in Node tests), 2 the sheet and printing, 3 the Safety page bar.
 * USES: SB.engine.safetyLog (read only), SB.store, SB.ui.sheet, SB.util.   USED BY: 80-office-core.js (Safety page bar).
 * HONEST: this is the owner's own record, not an inspection result or a certificate. Entries are never edited; a
 * correction is a new line under the entry it corrects.
 */
(function (g) {
  'use strict';
  const SB = (g.SB = g.SB || {});
  const U = SB.util;
  const O = (SB.office = SB.office || {});
  // True only for a real, finite number.
  const isNum = (n) => typeof n === 'number' && isFinite(n);
  const KIND = {
    temp_logged: 'Temperature reading', batch_reheat: 'Reheated', batch_discard: 'Thrown out', cooling_started: 'Cooling started',
    batch_out: 'Taken out of the fridge', batch_back: 'Put back in the fridge', sanitize_done: 'Sanitized surfaces', quality_extend: 'Kept serving past its quality limit', quality_extend_corrected: 'Quality-limit note corrected',
  };
  const REASON = { expired: 'Expired', quality: 'Quality', temp: 'Temperature', cooling: 'Cooling', manual: 'Other', other: 'Other', fridgeDate: 'Past your fridge limit', outTime: 'Past your out-of-fridge limit' };

  // ---- 1. Pure rows ----

  // The plain "late by 12 min" / "on time" words for a reading or round.
  function lateWords(e) {
    if (e.onTime === true || (isNum(e.lateMs) && e.lateMs <= 0)) return 'on time';
    return isNum(e.lateMs) && e.lateMs > 0 ? 'late by ' + Math.max(1, Math.round(e.lateMs / 60000)) + ' min' : '';
  }

  // The food a safety entry is about: the batch's label, else the ingredient name, else nothing.
  function foodOf(state, e) {
    const b = (state.batches || []).find((x) => x && x.id === e.batchId);
    const ingId = e.ing || (b && b.ing);
    const ing = (state.ingredients || []).find((i) => i && i.id === ingId);
    const name = ing ? ing.name : ingId || '';
    return b && b.label ? b.label + (name && b.label.indexOf(name) < 0 ? ' (' + name + ')' : '') : name;
  }

  // The detail words for one entry: what was read, weighed or thrown out.
  function detailOf(e) {
    switch (e.type) {
      case 'temp_logged': return (isNum(e.f) ? U.tempText(e.f) : '') + (lateWords(e) ? ', ' + lateWords(e) : '');
      case 'batch_reheat': return isNum(e.f) ? 'Reached ' + U.tempText(e.f) : '';
      case 'batch_discard': return (isNum(e.g) ? U.weightText(e.g) : '') + (REASON[e.reason] ? ', ' + REASON[e.reason].toLowerCase() : '') + (isNum(e.cost) && e.cost > 0 ? ', about ' + U.fmtMoney(e.cost, 2) : '');
      case 'batch_out': case 'batch_back': return isNum(e.outMs) ? spanWords(e.outMs) + ' out of the fridge so far' : '';
      case 'cooling_started': return isNum(e.g) ? U.weightText(e.g) : '';
      case 'sanitize_done': return lateWords(e);
      case 'quality_extend': return isNum(e.until) ? 'Until ' + U.fmtTime(e.until) : '';
      default: return e.note || '';
    }
  }

  // How long a span is, in plain words: "45 min" under two hours, else "2.5 h".
  function spanWords(ms) {
    const min = Math.max(0, Math.round(ms / 60000));
    return min < 120 ? min + ' min' : Math.round(min / 6) / 10 + ' h';
  }

  // The plain facts about the batch an entry is about: when it was made, days since for cold food, and for cooling
  // the readings so far against the owner's own cooling limits. Words only, never a rule; empty when the batch is gone.
  function factsOf(state, e) {
    const b = (state.batches || []).find((x) => x && x.id === e.batchId);
    if (!b || !isNum(b.enteredAt)) return [];
    const out = [];
    const made = isNum(b.coolStartAt) ? b.coolStartAt : b.enteredAt;
    const S = (state.settings || {}).safety || {};
    if (b.kind === 'cooling') {
      out.push('Cooling began ' + U.fmtDateShort(U.dateKey(made)) + ' ' + U.fmtTime(made));
      if (isNum(e.t) && e.type === 'temp_logged' && e.t >= made) out.push(spanWords(e.t - made) + ' into cooling');
      const c = S.cooling || {};
      if (isNum(c.stage1ToF) && isNum(c.stage1H) && isNum(c.finalF) && isNum(c.totalH)) out.push('Your limit: ' + U.tempText(c.stage1ToF) + ' within ' + c.stage1H + ' h, ' + U.tempText(c.finalF) + ' within ' + c.totalH + ' h');
      if (e.type === 'cooling_started') return out.concat(readingsOf(b, made));
      return out;
    }
    out.push(b.fridge && b.madeOn ? 'Made ' + madeWords(b.madeOn) : 'Made ' + U.fmtDateShort(U.dateKey(b.enteredAt)) + ' ' + U.fmtTime(b.enteredAt));
    if (b.fridge) {
      if (isNum(b.fridgeDays) && b.madeOn) out.push('Your fridge limit: ' + b.fridgeDays + ' ' + U.plural(b.fridgeDays, 'day', 'days') + ', last day ' + madeWords(U.addDays(b.madeOn, b.fridgeDays - 1)));
      const ci = isNum(e.t) && SB.engine && SB.engine.coldInfo ? SB.engine.coldInfo(b, e.t) : null;
      const outMs = isNum(e.outMs) ? e.outMs : ci ? ci.outMs : isNum(b.lineMs) ? b.lineMs : null;
      if (isNum(outMs)) out.push('Out of the fridge so far: ' + spanWords(outMs) + (isNum(b.outHours) ? ' (your limit ' + b.outHours + ' h)' : ''));
      return out;
    }
    if (b.kind === 'cold' && isNum(e.t) && e.t >= b.enteredAt) {
      const days = Math.floor((e.t - b.enteredAt) / 86400e3);
      out.push(days + ' ' + U.plural(days, 'day', 'days') + ' in the fridge');
    }
    if (isNum(b.maxHoldH) && (e.type === 'batch_discard' || e.type === 'quality_extend')) out.push('Your limit: ' + U.plural(b.maxHoldH, b.maxHoldH + ' hour', b.maxHoldH + ' hours'));
    return out;
  }

  // A made-on day key as short words, like "Sat 10/17".
  function madeWords(key) { return U.fmtDateShort(key); }

  // The cooling readings of a batch as short words, oldest first, at most six.
  function readingsOf(b, from) {
    const t = (b.temps || []).filter((r) => r && isNum(r.t) && isNum(r.f)).slice(0, 6);
    return t.length ? ['Readings: ' + t.map((r) => U.fmtTime(r.t) + ' ' + U.tempText(r.f) + ' (' + spanWords(r.t - from) + ')').join(', ')] : [];
  }

  // Safety log rows from `from` up to (not including) `to`, oldest first:
  // [{id, at, kind, food, detail, who, corrections:[{at, who, note}]}]. Read only; never changes the state.
  function inspectorRows(state, from, to) {
    if (!state || !SB.engine || !SB.engine.safetyLog) return [];
    const rows = SB.engine.safetyLog(state).filter((r) => r.event.type !== 'safety_correction' && isNum(r.event.t) && r.event.t >= from && r.event.t < to);
    return rows.map((r) => ({
      id: r.event.id, at: r.event.t, kind: KIND[r.event.type] || 'Safety entry', food: foodOf(state, r.event), detail: detailOf(r.event), facts: factsOf(state, r.event), who: r.event.who || '',
      corrections: r.corrections.map((c) => ({ at: c.t, who: c.who || '', note: c.note || '' })),
    }));
  }

  // The preset date ranges for the printed record: [{id, label, days}].
  const RANGES = [{ id: 'today', label: 'Today', days: 1 }, { id: '7', label: 'Last 7 days', days: 7 }, { id: '30', label: 'Last 30 days', days: 30 }, { id: '90', label: 'Last 90 days', days: 90 }];
  // The service-day window for a preset, ending after today: {from, to, label}.
  function rangeFor(id, now, dayStartHour) {
    const r = RANGES.find((x) => x.id === id) || RANGES[1];
    const today = U.serviceDate(now, dayStartHour);
    const first = U.addDays(today, -(r.days - 1)), next = U.addDays(today, 1);
    // The moment a service day starts on the wall clock (the day-start hour that morning), even on a daylight-saving day.
    const at = (key) => { const p = key.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2], dayStartHour, 0, 0, 0).getTime(); };
    return { from: at(first), to: at(next), label: r.days === 1 ? U.fmtDateShort(today) : U.fmtDateShort(first) + ' to ' + U.fmtDateShort(today) };
  }

  O.inspectorPure = { inspectorRows, factsOf, rangeFor, RANGES };
  if (!g.document) return; // Node: the pure rows are all the tests need

  // ---- 2. The sheet and printing ----
  const h = U.h;

  // Reads the saved state, or null when the store is not ready.
  function stateNow() { try { return SB.store.getState(); } catch (e) { return null; } }

  // Builds the printable table for a window as an element (used for both the preview and the print block).
  function recordTable(rows) {
    const body = rows.map((r) => h('tr', null,
      h('td', null, U.fmtDateShort(U.dateKey(r.at)) + ' ' + U.fmtTime(r.at)), h('td', null, r.kind), h('td', null, r.food), h('td', null, r.detail, (r.facts || []).map((f) => h('div', { class: 'si-fact' }, f))), h('td', null, r.who || 'not recorded'),
      h('td', null, r.corrections.map((c) => h('div', { class: 'si-corr' }, 'Correction ' + U.fmtDateShort(U.dateKey(c.at)) + ' ' + U.fmtTime(c.at) + (c.who ? ' by ' + c.who : '') + ': ' + c.note)))));
    return h('table', { class: 'si-table' },
      h('thead', null, h('tr', null, ['When', 'What', 'Food', 'Detail', 'Logged by', 'Corrections added later'].map((t) => h('th', null, t)))),
      h('tbody', null, body.length ? body : h('tr', null, h('td', { colspan: 6 }, 'No safety entries in this range.'))));
  }

  // The honest line about what this record does not hold, so nobody reads it as the whole paperwork.
  const NOT_COVERED = 'This record covers batches only. It has no cooler or freezer readings, sanitizer strip readings or thermometer checks; keep those on your own sheet and ask your health department what to keep and for how long.';

  // Opens the sheet: pick a date range, see the record, print it.
  function openInspectorLog() {
    if (!SB.ui || !SB.ui.sheet || !stateNow()) return null;
    const sheet = SB.ui.sheet({ title: 'Print the food safety record', side: 'right', width: 'min(860px, 96vw)', name: 'inspectorlog' });
    const dsh = (stateNow().settings.service || {}).dayStartHour;
    let rangeId = '7';
    const preview = h('div', { class: 'si-preview' });
    const sel = h('select', { class: 'select', 'aria-label': 'Date range' }, RANGES.map((r) => h('option', { value: r.id, selected: r.id === rangeId }, r.label)));
    // Redraws the preview table for the chosen range.
    function paint() {
      const w = rangeFor(rangeId, SB.store.now(), dsh);
      const rows = inspectorRows(stateNow(), w.from, w.to);
      U.clear(preview);
      preview.append(h('p', { class: 'si-count' }, rows.length + ' ' + U.plural(rows.length, 'entry', 'entries') + ', ' + w.label + '.'), recordTable(rows));
    }
    // Picks a new range from the select and redraws.
    sel.addEventListener('change', () => { rangeId = sel.value; paint(); });
    // Prints the record for the chosen range.
    const doPrint = () => printRecord(rangeId);
    sheet.body.append(
      h('p', { class: 'si-lead' }, 'This is your own record of readings, reheats, cooling, sanitize rounds and thrown-out food. It is not an inspection result. Entries are never edited; if something was wrong, a correction is added under it.'),
      h('p', { class: 'si-lead si-notcovered' }, NOT_COVERED),
      h('div', { class: 'si-actions' }, h('label', null, 'Range ', sel), h('button', { type: 'button', class: 'btn btn-primary', onClick: doPrint }, 'Print')), preview);
    paint();
    return sheet;
  }

  // Builds the print-only record, prints it, and removes it again.
  function printRecord(id) {
    const s = stateNow(); if (!s) return;
    const dsh = (s.settings.service || {}).dayStartHour;
    const w = rangeFor(id, SB.store.now(), dsh);
    const rows = inspectorRows(s, w.from, w.to);
    const demo = (s.tickets || []).some((t) => t && t.src === 'demo');
    const root = h('div', { class: 'sb-printroot si-printroot' },
      h('h1', null, 'Food safety record, ' + w.label),
      h('p', { class: 'si-note' }, 'The owner\'s own record of what was logged in this kitchen. It is not an inspection result. Entries are never edited; corrections are added under the entry they correct.'),
      demo ? h('p', { class: 'si-note' }, 'This is a demo kitchen, so these entries are demo entries.') : null,
      recordTable(rows),
      h('p', { class: 'si-note' }, NOT_COVERED),
      h('p', { class: 'si-note' }, 'Printed ' + U.fmtDateShort(U.dateKey(Date.now())) + ' ' + U.fmtTime(Date.now()) + '. Reviewed by: ______________   Date: ________'));
    document.body.appendChild(root);
    // Removes the print-only block once the print dialog is done (or at once when printing is unavailable).
    const done = () => { try { root.remove(); } catch (e) { /* already gone */ } };
    g.addEventListener('afterprint', done, { once: true });
    try { g.print(); } catch (e) { done(); }
    setTimeout(done, 60000);
  }

  // ---- 3. The Safety page bar ----

  // A small bar for the top of the Safety page: the print button and the Guide "?" link.
  O.safetyLogBar = function () {
    const help = SB.guide && SB.guide.link ? SB.guide.link('hold-cabinet-and-warnings', 'the safety page') : null;
    return h('div', { class: 'si-bar' }, h('span', { class: 'si-bar-t' }, 'Your safety record'),
      h('button', { type: 'button', class: 'btn btn-sm', 'data-k': 'print-safety-log', onClick: openInspectorLog }, 'Print the safety record'), help);
  };
  O.openInspectorLog = openInspectorLog;
})(typeof globalThis !== 'undefined' ? globalThis : window);
