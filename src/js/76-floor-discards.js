/*
 * WHAT THIS FILE IS: The thrown-out log sheet. Every batch thrown out (expired, too cold, cooling missed, by hand)
 *    in one table an inspector can read: date, food, amount, times, reason, initials. The owner can rename or
 *    hide columns to match the local health department's form, add one free-text column, print the log or save
 *    it as a spreadsheet file, and gets a daily reminder to save a copy.
 * PARTS: saved settings, rows from the state, table sheet, print and save, daily reminder.
 * USES: 00-util.js, 05-icons.js, 20-engine.js (through the store), 60-shell.js (sheets, toasts), 72-floor-sheets.js
 *    (sheet registry). USED BY: the Hold cabinet button, the board menu and the board startup.
 */
(function (g) {
  'use strict';
  const SB = (g.SB = g.SB || {});
  const U = SB.util;
  const doc = g.document;
  const h = U.h;
  // Builds an icon element, or an empty span when icons are missing.
  const ico = (name, size) => { try { return SB.icons.svg(name, { size: size || 20 }); } catch (e) { return doc.createElement('span'); } };
  const KEY = 'smokebox.v1.dlog';
  const H1 = 3600e3;
  // The columns of the log, in order. label is what the owner can rename; on says whether it shows.
  const DEFAULT_COLS = [
    { key: 'date', label: 'Date', on: true }, { key: 'food', label: 'Food', on: true }, { key: 'amount', label: 'Amount', on: true },
    { key: 'since', label: 'In the cabinet since', on: true }, { key: 'out', label: 'Thrown out at', on: true }, { key: 'reason', label: 'Reason', on: true },
    { key: 'initials', label: 'Initials', on: true }, { key: 'extra', label: 'Notes', on: false },
  ];
  // Plain-words reasons for each reason code.
  const REASON = { expired: 'Hold time ran out', temp: 'Temperature out of range', cooling: 'Cooling missed', manual: 'Thrown out by hand', quality: 'Quality', other: 'Other' };

  // The saved log settings: column labels and visibility, initials and notes per batch, last save time. Always
  // returns a full, valid record.
  function load() {
    const raw = U.storage.get(KEY, null) || {};
    const cols = DEFAULT_COLS.map((d) => { const s = Array.isArray(raw.cols) ? raw.cols.find((c) => c && c.key === d.key) : null; return { key: d.key, label: s && typeof s.label === 'string' && s.label.trim() ? s.label.slice(0, 40) : d.label, on: s && typeof s.on === 'boolean' ? s.on : d.on }; });
    return { cols, initials: raw.initials && typeof raw.initials === 'object' ? raw.initials : {}, extra: raw.extra && typeof raw.extra === 'object' ? raw.extra : {}, exportedAt: Number.isFinite(raw.exportedAt) ? raw.exportedAt : 0 };
  }
  // Writes the log settings back to the browser's storage.
  function save(rec) { U.storage.set(KEY, rec); }

  // The discarded batches, newest first, as plain rows ready to show, print or save.
  function rows(state, rec) {
    const out = [];
    // The engine's own discard entries by batch: who threw it out, the entry id for a fix, and fixes already made.
    const logged = new Map();
    for (const row of SB.engine.safetyLog(state)) if (row.event.type === 'batch_discard' && row.event.batchId) logged.set(row.event.batchId, row);
    const seen = new Set();
    for (const b of state.batches) {
      if (b.status !== 'discard' || !Number.isFinite(b.discardedAt)) continue;
      seen.add(b.id);
      out.push({
        id: b.id, t: b.discardedAt, date: U.fmtDateShort(U.dateKey(b.discardedAt)), food: b.label || b.ing,
        amount: U.weightText(b.wasteG), since: U.fmtTime(b.enteredAt), out: U.fmtTime(b.discardedAt), reason: REASON[b.discardReason] || 'Other',
        initials: rec.initials[b.id] || (logged.get(b.id) && logged.get(b.id).event.who) || '', extra: rec.extra[b.id] || '',
        eventId: logged.get(b.id) ? logged.get(b.id).event.id : '', fixes: logged.get(b.id) ? logged.get(b.id).corrections : [],
      });
    }
    // Discards whose batch has since been dropped from the cabinet list are still in the safety record (kept for the engine's keep time):
    // show them from that entry, with what the entry holds (the amount, the reason, who) and nothing invented.
    const ingName = (id) => { const i = (state.ingredients || []).find((x) => x && x.id === id); return i && i.name ? i.name : id || 'Food'; };
    for (const [batchId, row] of logged) {
      const e = row.event;
      if (seen.has(batchId) || !Number.isFinite(e.t)) continue;
      out.push({
        id: batchId, t: e.t, date: U.fmtDateShort(U.dateKey(e.t)), food: ingName(e.ing), amount: Number.isFinite(e.g) ? U.weightText(e.g) : '',
        since: '', out: U.fmtTime(e.t), reason: REASON[e.reason] || 'Other',
        initials: rec.initials[batchId] || e.who || '', extra: rec.extra[batchId] || e.note || '', eventId: e.id || '', fixes: row.corrections || [],
      });
    }
    return out.sort((a, b) => b.t - a.t);
  }
  // How far back the log reaches, in plain words, so nobody reads it as more than it is. The keep time comes from the engine
  // (SB.retention); a kitchen newer than that has everything from its first record.
  function coverageText(state, list, now) {
    if (!list.length) return '';
    const oldest = list[list.length - 1].t;
    let first = oldest;
    for (const row of SB.engine.safetyLog(state)) if (Number.isFinite(row.event.t) && row.event.t < first) first = row.event.t;
    for (const b of state.batches || []) if (b && Number.isFinite(b.enteredAt) && b.enteredAt < first) first = b.enteredAt;
    const since = U.fmtDateShort(U.dateKey(oldest));
    const n = list.length + ' ' + U.plural(list.length, 'batch', 'batches');
    const keep = SB.retention ? SB.retention.days() : null;
    // A kitchen younger than the keep time (less a two-week margin) has everything from its first record.
    if (keep && now - first < (keep - 14) * 86400e3) return 'Showing every batch thrown out since ' + U.fmtDateShort(U.dateKey(first)) + ' (' + n + '), the first record this app has.';
    return 'Showing the ' + n + ' thrown out since ' + since + '. ' + (SB.retention ? SB.retention.words() : '') + ' Older ones are not here.';
  }
  // Escapes text for safe use inside HTML.
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // Builds the log as plain HTML for printing: a heading and one table with the columns that are switched on.
  function printHtml(list, rec, note) {
    const cols = rec.cols.filter((c) => c.on);
    const head = '<tr>' + cols.map((c) => '<th>' + esc(c.label) + '</th>').join('') + '</tr>';
    const body = list.map((r) => '<tr>' + cols.map((c) => '<td>' + esc(r[c.key]) + '</td>').join('') + '</tr>').join('');
    return '<!doctype html><meta charset="utf-8"><title>Thrown-out log</title><style>body{font:14px system-ui,sans-serif;margin:24px}h1{font-size:20px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #444;padding:6px 8px;text-align:left}th{background:#eee}</style><h1>Thrown-out log</h1><p>Printed ' + esc(new Date().toLocaleString()) + '</p>' + (note ? '<p>' + esc(note) + '</p>' : '') + '<table>' + head + body + '</table>';
  }
  // Builds the log as CSV text with the columns that are switched on.
  function csv(list, rec, note) {
    const cols = rec.cols.filter((c) => c.on);
    // Each cell goes through the shared guard (36-csv.js): quotes where needed and an apostrophe before anything a spreadsheet could run as a formula.
    const rowsOut = [cols.map((c) => c.label)].concat(list.map((r) => cols.map((c) => r[c.key])));
    if (note) rowsOut.push([note]);
    return SB.csv.text(rowsOut);
  }
  SB.discardsPure = { rows, coverageText, csv, printHtml };
  if (!doc || !SB.sheets) return;
  // Prints the log through a hidden frame so the board behind the sheet is not printed with it.
  function printLog(list, rec, note) {
    const f = doc.createElement('iframe');
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    doc.body.appendChild(f);
    f.srcdoc = printHtml(list, rec, note);
    // Prints once the hidden frame has loaded its page, then removes it.
    f.onload = () => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { /* printing is optional */ } setTimeout(() => f.remove(), 2000); };
  }
  // Saves the log as a CSV file with the browser's normal download, and notes the save time.
  function saveCsv(list, rec, note) {
    try {
      const url = URL.createObjectURL(new Blob([csv(list, rec, note)], { type: 'text/csv' }));
      const a = doc.createElement('a');
      a.href = url; a.download = 'smokebox-thrown-out-log-' + new Date().toISOString().slice(0, 10) + '.csv'; a.style.display = 'none';
      doc.body.appendChild(a); a.click();
      setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 1000);
      rec.exportedAt = SB.store.now(); save(rec);
      return true;
    } catch (e) { return false; }
  }

  // Opens the thrown-out log sheet and keeps its table in step with the saved data.
  function openDiscards() {
    const rec = load();
    const offs = [];
    // Stops listening to the store when the sheet closes.
    const onClose = () => offs.splice(0).forEach((f) => f());
    const sheet = SB.ui.sheet({ title: 'Thrown-out log', side: 'right', width: 'min(1040px, 96vw)', name: 'discards', onClose });
    const note = h('p', { class: 'fs-sub' }, 'Batches thrown out, newest first. Add initials on each row. Copy these to your health department\'s own form if it asks for a different layout. Save a copy every day: this log lives on this device only.');
    const status = h('p', { class: 'fs-sub', role: 'status' });
    const cover = h('p', { class: 'fs-sub dlog-cover' });
    // The plain words for how far back the log reaches, for the sheet, print and file.
    const noteFor = (list) => coverageText(SB.store.getState(), list, SB.store.now());
    const wrap = h('div', { class: 'dlog-wrap', style: 'overflow:auto' });
    const colsBox = h('div', { class: 'dlog-cols', hidden: true });

    // Opens a small box to fix a wrong entry. The log never erases anything: the fix is saved as a new entry next to the old one.
    function fixEntry(r, opener) {
      const sh = SB.ui.sheet({ title: 'Fix this entry', side: 'center', width: 480, name: 'fix-entry', opener });
      const note = h('input', { class: 'input', type: 'text', maxlength: 120, 'aria-label': 'What was wrong', placeholder: 'What was wrong, like "wrong food picked"' });
      const who = h('input', { class: 'input', type: 'text', maxlength: 12, 'aria-label': 'Your initials', placeholder: 'Your initials', value: SB.who ? SB.who.get() : '' });
      const err = h('p', { class: 'fs-sub', role: 'alert', hidden: true });
      sh.body.append(h('p', null, 'The old entry stays in the log, so the record is honest. Your fix is saved as a new entry next to it, with your initials and the time.'),
        h('p', { class: 'fs-sub' }, r.food + ', thrown out at ' + r.out + '.'), h('div', { class: 'field-label' }, 'What was wrong?'), note, h('div', { class: 'field-label' }, 'Your initials'), who, err);
      // Saves the fix through the engine; a refusal is shown in plain words and nothing is lost.
      const saveFix = () => {
        const res = SB.store.dispatchEx('correctSafety', { eventId: r.eventId, note: note.value, who: who.value }, { source: 'ui' });
        if (res.report !== 'ok') { err.textContent = SB.engine.describe(res.report, res.info, SB.store.getState().settings); err.hidden = false; return; }
        if (SB.who) SB.who.set(who.value.trim());
        sh.close('saved'); draw();
        SB.ui.toast('Fix saved as a new entry.', { tone: 'ok' });
      };
      // Cancel closes the box and changes nothing.
      const cancelFix = () => sh.close('cancel');
      sh.footer.append(h('button', { type: 'button', class: 'btn', onClick: cancelFix }, 'Cancel'), h('button', { type: 'button', class: 'btn btn-primary', onClick: saveFix }, 'Save the fix'));
    }
    // Draws the table from the current state and column settings.
    function draw() {
      U.clear(wrap);
      const list = rows(SB.store.getState(), rec);
      cover.textContent = noteFor(list);
      const cols = rec.cols.filter((c) => c.on);
      if (!list.length) { wrap.appendChild(h('div', { class: 'empty' }, ico('trash', 40), h('h3', null, 'Nothing thrown out yet'), h('p', null, 'Batches you throw out show up here with their time and reason.'))); return; }
      const table = h('table', { class: 'dlog-table', style: 'border-collapse:collapse;width:100%' });
      table.appendChild(h('thead', null, h('tr', null, ...cols.map((c) => h('th', { style: 'text-align:left;padding:8px;border-bottom:2px solid var(--line);' + (c.label.length <= 12 ? 'white-space:nowrap' : '') }, c.label)), h('th', { style: 'padding:8px;border-bottom:2px solid var(--line)' }, h('span', { class: 'visually-hidden' }, 'Fix')))));
      const tb = h('tbody');
      list.forEach((r) => {
        // Opens the fix box for this row.
        const openFix = (e) => fixEntry(r, e.currentTarget);
        tb.appendChild(h('tr', null, ...cols.map((c) => {
          let cell;
          if (c.key === 'initials' || c.key === 'extra') {
            const bag = c.key === 'initials' ? rec.initials : rec.extra;
            cell = h('input', { class: 'input', type: 'text', maxlength: c.key === 'initials' ? 6 : 60, value: c.key === 'initials' ? r.initials : (bag[r.id] || ''), 'aria-label': c.label + ' for ' + r.food, style: 'min-width:' + (c.key === 'initials' ? 80 : 180) + 'px' });
            // Saves what was typed for this row as soon as the box loses focus or changes.
            cell.addEventListener('change', () => { bag[r.id] = cell.value.trim(); save(rec); });
          } else if (c.key === 'food' && r.fixes.length) {
            cell = h('div', null, r.food, ...r.fixes.map((f) => h('div', { class: 'fs-sub dlog-fix' }, 'Fixed by ' + f.who + ' at ' + U.fmtTime(f.t) + ': ' + f.note)));
          } else cell = doc.createTextNode(r[c.key]);
          return h('td', { style: 'padding:8px;border-bottom:1px solid var(--line);vertical-align:middle' }, cell);
        }), h('td', { style: 'padding:8px;border-bottom:1px solid var(--line);vertical-align:middle' }, r.eventId ? h('button', { type: 'button', class: 'btn btn-sm', dataset: { act: 'fix-entry' }, onClick: openFix }, 'Fix this entry') : null)));
      });
      table.appendChild(tb);
      wrap.appendChild(table);
    }
    // Builds the column editor: show or hide each column and rename it.
    function drawCols() {
      U.clear(colsBox);
      colsBox.appendChild(h('p', { class: 'fs-sub' }, 'Match your local form: show or hide a column and rename it.'));
      rec.cols.forEach((c) => {
        const on = h('input', { type: 'checkbox', checked: c.on, 'aria-label': 'Show ' + c.label });
        const nm = h('input', { class: 'input', type: 'text', value: c.label, maxlength: 40, 'aria-label': 'Name of the ' + c.key + ' column' });
        // Applies a change to this column and redraws the table.
        const apply = () => { c.on = on.checked; c.label = nm.value.trim() || DEFAULT_COLS.find((d) => d.key === c.key).label; save(rec); draw(); };
        on.addEventListener('change', apply); nm.addEventListener('change', apply);
        colsBox.appendChild(h('label', { style: 'display:flex;gap:12px;align-items:center;margin:6px 0' }, on, nm));
      });
    }
    // Prints the log as it stands.
    const doPrint = () => { const l = rows(SB.store.getState(), rec); printLog(l, rec, noteFor(l)); };
    // Saves a spreadsheet copy and says whether it worked.
    const doCsv = () => { const l = rows(SB.store.getState(), rec); status.textContent = saveCsv(l, rec, noteFor(l)) ? 'Saved a copy to your downloads.' : 'The browser blocked the download. Use Print instead.'; };
    // Shows or hides the column editor.
    const doCols = () => { colsBox.hidden = !colsBox.hidden; if (!colsBox.hidden) drawCols(); };
    const bPrint = h('button', { type: 'button', class: 'btn', onClick: doPrint }, ico('receipt', 20), h('span', null, 'Print or save as PDF'));
    const bCsv = h('button', { type: 'button', class: 'btn btn-primary', onClick: doCsv }, ico('package', 20), h('span', null, 'Save as spreadsheet'));
    const bCols = h('button', { type: 'button', class: 'btn', onClick: doCols }, ico('sliders', 20), h('span', null, 'Edit columns'));
    sheet.body.append(note, cover, h('div', { class: 'row', style: 'display:flex;gap:12px;flex-wrap:wrap;margin:12px 0' }, bCsv, bPrint, bCols), status, colsBox, wrap);
    draw();
    offs.push(SB.store.subscribe(() => draw()));
    return sheet;
  }

  // At the start of a service, reminds the owner to save a copy of the thrown-out log when there are entries not
  // saved yet. Shows once per page load.
  let reminded = false;
  function remind() {
    if (reminded || !SB.store || !SB.ui) return;
    const rec = load();
    const unsaved = rows(SB.store.getState(), rec).filter((r) => r.t > rec.exportedAt).length;
    if (!unsaved || SB.store.now() - rec.exportedAt < 20 * H1) return;
    reminded = true;
    // Opens the thrown-out log from the reminder.
    const openLog = () => SB.sheets.open('discards');
    const open = h('button', { type: 'button', class: 'btn', onClick: openLog }, 'Open the log');
    SB.ui.toast(h('span', null, unsaved + ' thrown-out ' + U.plural(unsaved, 'batch', 'batches') + ' not saved yet. ', open), { tone: 'warn', ms: 12000 });
  }
  // Asks the browser to keep this site's saved data even when space runs low. Ignored where unsupported.
  function persist() { try { if (g.navigator && g.navigator.storage && g.navigator.storage.persist) g.navigator.storage.persist(); } catch (e) { /* optional */ } }

  SB.sheets.register('discards', openDiscards);
  // Rows for the state, with the saved initials and notes filled in.
  const rowsFor = (state) => rows(state, load());
  // The whole log for the state as CSV text.
  const csvFor = (state) => { const l = rows(state, load()); return csv(l, load(), coverageText(state, l, SB.store.now())); };
  SB.discards = { rows: rowsFor, csv: csvFor, remind, persist };
})(typeof globalThis !== 'undefined' ? globalThis : window);
