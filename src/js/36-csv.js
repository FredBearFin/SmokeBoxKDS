/*
 * WHAT THIS FILE IS: The one place that turns values into spreadsheet (CSV) cells safely. A text cell that starts with
 *    = + - @ or a tab or carriage return could be run as a formula by a spreadsheet (a note typed as =HYPERLINK(...) in a
 *    file handed to an inspector or an accountant), so such text gets a leading apostrophe. Real numbers and plain
 *    number text stay numbers.
 * PARTS: the cell, the line, the whole file.
 * USES: nothing. USED BY: 35-pilot.js (pilot report), 76-floor-discards.js (thrown-out log), 88-office-backup.js (sales by day),
 *    tests. The store has its own copy of the same rule for its five data files (30-store.js).
 */
(function (g) {
  'use strict';
  const SB = (g.SB = g.SB || {});
  // Text that is only a number (an optional minus, digits, an optional decimal part): safe to leave as it is.
  const PLAIN_NUMBER = /^-?\d+(?:\.\d+)?$/;
  // Text that a spreadsheet may read as a formula or a command.
  const DANGEROUS = /^[=+\-@\t\r]/;

  // One CSV cell: numbers as digits, text with a leading apostrophe when it could be a formula, and quotes when it holds a comma, quote or line break.
  function cell(v) {
    if (v === undefined || v === null) return '';
    if (typeof v === 'number') return isFinite(v) ? String(v) : '';
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    let s = typeof v === 'string' ? v : String(v);
    if (DANGEROUS.test(s) && !PLAIN_NUMBER.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  // One CSV line from a list of values (no line break at the end).
  const line = (a) => a.map(cell).join(',');
  // A whole CSV text from a list of lists, with a carriage return and line feed after each line.
  const text = (rows) => rows.map(line).join('\r\n') + '\r\n';

  SB.csv = { cell, line, text };
})(typeof globalThis !== 'undefined' ? globalThis : window);
