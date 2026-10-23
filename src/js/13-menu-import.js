/*
 * WHAT THIS FILE IS: Reads a menu an owner pastes or loads (typed lines, a spreadsheet CSV, or an item export from
 *    Square, Toast or Clover) and turns it into checked dish rows, then into engine actions. It never touches the page.
 * PARTS: limits and words, price reading, text tables (CSV), the line reader, column and format detection, row
 *    checks, parse, toActions, exportMenu.
 * USES: 10-config.js (station and category names, read when called). USED BY: the menu import screen.
 */
(function (g) {
  'use strict';
  const SB = (g.SB = g.SB || {});
  const M = (SB.menuImport = {});

  // The engine's own bounds for a dish, copied here because this file loads before the engine. A test checks the engine
  // refuses exactly what these refuse. 150 dishes, names up to 60 characters, price 0 to 1000 dollars.
  const LIMITS = { maxDishes: 150, nameMax: 60, priceMax: 1000, textMax: 1000000, rowsRead: 2000 };
  M.limits = LIMITS;
  // The dish form fields the importer uses when the file does not say: one tap to finish, a 5 minute guess.
  const DEFAULTS = { prepSec: 300, track: 'one' };

  // The money symbol in use (the owner's, or $), for messages.
  const cs = () => (SB.util && SB.util.currencySymbol ? SB.util.currencySymbol() : '$');
  // Collapses runs of white space and trims, as the engine does to a dish name.
  const clean = (s) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  // The name compared for duplicates: lower case, single spaces.
  const key = (s) => clean(s).toLowerCase();

  /* ---------- reading a price ---------- */

  // Reads a typed price: "$9", "9.50", "USD 12", "1,250.00", "9,50" (a comma for the cents). Returns
  // { value, rounded } with value in dollars, or { error: 'missing'|'bad'|'range' } when it is not one price.
  function readPrice(raw) {
    let t = clean(raw);
    if (!t) return { error: 'missing' };
    if (/^(mp|m\/p|market( price)?|varies|variable|ask|tbd|\?+)$/i.test(t)) return { error: 'variable' };
    if (/\d\s*(-|to|–|—)\s*\$?\s*\d/i.test(t.replace(/^\$/, ''))) return { error: 'range' };
    t = t.replace(/usd|us\$|\p{Sc}/giu, '');
    const sym = cs();
    if (sym && /^\p{L}+$/u.test(sym) && t.toLowerCase().indexOf(sym.toLowerCase()) === 0) t = t.slice(sym.length);   // a lettered symbol such as KSh
    t = t.replace(/\s+/g, '');
    if (!/^[+-]?[\d.,]+$/.test(t)) return { error: 'bad' };
    let neg = false;
    if (t[0] === '-') { neg = true; t = t.slice(1); } else if (t[0] === '+') t = t.slice(1);
    // One comma and two digits after it, and no dot: a comma for the cents. Otherwise commas are thousands marks.
    if (/^\d+,\d{2}$/.test(t)) t = t.replace(',', '.');
    else t = t.replace(/,/g, '');
    if (!/^\d*\.?\d+$|^\d+\.$/.test(t)) return { error: 'bad' };
    let v = Number(t);
    if (!isFinite(v)) return { error: 'bad' };
    if (neg) v = -v;
    const r = Math.round(v * 100) / 100;
    return { value: r, rounded: Math.abs(r - v) > 1e-9 };
  }
  M.readPrice = readPrice;

  /* ---------- text tables ---------- */

  // Splits text into rows of cells following the CSV rules: quotes, doubled quotes, delimiters and line breaks inside
  // quotes. delim is one character. Blank lines come back as rows with one empty cell; the caller drops them.
  function splitTable(text, delim) {
    const rows = [];
    let row = [], cell = '', q = false, i = 0;
    const n = text.length;
    while (i < n) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i += 2; continue; } q = false; i++; continue; }
        cell += c; i++; continue;
      }
      if (c === '"' && cell === '') { q = true; i++; continue; }
      if (c === delim) { row.push(cell); cell = ''; i++; continue; }
      if (c === '\r' || c === '\n') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = ''; i++; continue;
      }
      cell += c; i++;
    }
    row.push(cell);
    if (row.length > 1 || row[0] !== '' || rows.length === 0) rows.push(row);
    return rows;
  }
  // Picks the column separator from the first line: tab, semicolon or comma, whichever appears most outside quotes.
  function pickDelimiter(text) {
    const first = text.split(/\r\n|\r|\n/)[0] || '';
    const count = { '\t': 0, ';': 0, ',': 0 };
    let q = false;
    for (const c of first) { if (c === '"') q = !q; else if (!q && c in count) count[c]++; }
    let best = ',', n = 0;
    for (const d of ['\t', ';', ',']) if (count[d] > n) { best = d; n = count[d]; }
    return best;
  }
  // Takes off a leading byte-order mark and the apostrophe a spreadsheet guard puts before = + - @.
  const stripBom = (t) => String(t == null ? '' : t).replace(/^﻿/, '');
  const unguard = (s) => (/^'[=+\-@]/.test(s) ? s.slice(1) : s);

  /* ---------- column and format detection ---------- */

  // Header words for each field, compared after lower-casing and removing spaces and punctuation.
  const WORDS = {
    name: ['name', 'item', 'itemname', 'dish', 'product', 'title', 'menuitem', 'itemtitle', 'dishname', 'productname'],
    price: ['price', 'amount', 'baseprice', 'sellprice', 'unitprice', 'saleprice', 'menuprice', 'cost'],
    station: ['station', 'zone', 'prepstation', 'kitchen', 'kitchenstation', 'madein', 'wheremade'],
    category: ['category', 'group', 'menugroup', 'section', 'type', 'menucategory', 'reportingcategory'],
    description: ['description', 'desc', 'details', 'notes'],
  };
  // A header made comparable: lower case, letters and digits only.
  const norm = (h) => String(h == null ? '' : h).toLowerCase().replace(/[^a-z0-9]/g, '');
  // The column number whose header is one of the words, or -1. "cost" only counts as a price when no better word exists.
  function findCol(headers, words, skip) {
    for (const w of words) { const i = headers.findIndex((h, ix) => h === w && !(skip && skip.indexOf(ix) >= 0)); if (i >= 0) return i; }
    return -1;
  }
  // Which export a header row comes from, by the column names each point-of-sale system writes. Returns
  // 'square', 'toast', 'clover', 'csv' (any other table with a name and a price) or null.
  function detectFormat(headers) {
    const h = headers.map(norm);
    // True when the header row has a column with this normalised name.
    const has = (x) => h.indexOf(x) >= 0;
    if (has('itemname') && (has('variationname') || has('token') || has('sku')) && has('price')) return 'square';
    if (has('cloverid') || (has('name') && has('pricetype') && (has('alternatename') || has('producecode') || has('productcode')))) return 'clover';
    if ((has('menugroup') || has('menu') || has('menuitem') || has('menuitemname')) && (has('price') || has('baseprice') || has('basepricedollars') || has('itemprice'))) return 'toast';
    const nameOk = WORDS.name.some((w) => has(w)), priceOk = WORDS.price.some((w) => has(w));
    return nameOk && priceOk ? 'csv' : null;
  }
  const FORMAT_LABEL = {
    square: 'Square item library export', toast: 'Toast menu export', clover: 'Clover items export',
    csv: 'spreadsheet table (CSV, TSV or pasted from Excel or Google Sheets)', lines: 'typed or pasted lines',
  };

  /* ---------- station and category words from the live config ---------- */

  // Looks up a station written in the file by id, name, long name or three-letter code. Returns its id or undefined.
  function zoneFrom(text, opts) {
    const t = key(text);
    if (!t) return undefined;
    const list = (opts && opts.zones) || (SB.config && SB.config.zones) || [];
    for (const z of list) {
      if (z.id === 'expo') continue;
      if ([z.id, z.name, z.long, z.code].some((x) => x && key(x) === t)) return z.id;
    }
    return undefined;
  }
  // Same for a menu category (id or name).
  function catFrom(text, opts) {
    const t = key(text);
    if (!t) return undefined;
    const list = (opts && opts.categories) || (SB.config && SB.config.categories) || [];
    for (const c of list) if ([c.id, c.name].some((x) => x && key(x) === t)) return c.id;
    return undefined;
  }

  /* ---------- the line reader ---------- */

  const PRICE_TOKEN = /^(?:usd\s*|us\$\s*)?[$€£]?\s*\d[\d.,]*\s*(?:usd|[$€£])?$/i;
  // Reads one typed line such as "Brisket plate, 14.00, pit", "Burger 9.50", "Name - $9" or a tab or semicolon line.
  // Returns { name, priceText, extras:[] } or null when the line has no usable shape (it still becomes a row with problems).
  function readLine(line) {
    const delims = ['\t', ';'];
    let parts = null;
    // "Pickles 3,50": a single comma that only marks the cents is not a column separator.
    if ((line.match(/,/g) || []).length === 1 && line.indexOf('\t') < 0 && line.indexOf(';') < 0 && /^.*\S\s+[$€£]?\d+,\d{2}$/.test(line)) {
      const m = line.match(/^(.*\S)\s+([$€£]?\d+,\d{2})$/);
      return { name: clean(m[1]), priceText: m[2], extras: [] };
    }
    for (const d of delims) if (line.indexOf(d) >= 0) { parts = splitTable(line, d)[0].map(clean); break; }
    if (!parts && /\s[-–—]\s/.test(line)) {
      const m = line.match(/^(.*\S)\s+[-–—]\s+([^-–—]*)$/);
      if (m) parts = [clean(m[1]), clean(m[2])];
    }
    if (!parts && line.indexOf(',') >= 0) parts = splitTable(line, ',')[0].map(clean);
    if (parts) {
      parts = parts.filter((p, i) => p !== '' || i === 0);
      // The price is the first cell after the first that looks like one; a name may itself contain commas.
      let pi = -1;
      for (let i = 1; i < parts.length; i++) if (PRICE_TOKEN.test(parts[i])) { pi = i; break; }
      if (pi < 0) {
        // No cell looks like a price: the second cell is offered as the price so the row can say what is wrong.
        return { name: parts[0] || '', priceText: parts.length > 1 ? parts[1] : '', extras: parts.slice(2) };
      }
      return { name: parts.slice(0, pi).join(', '), priceText: parts[pi], extras: parts.slice(pi + 1) };
    }
    // No separator: the price is the last word ("Burger 9.50", "Burger $9", "Burger 9,50").
    const m = line.match(/^(.*\S)\s+((?:usd\s*)?[$€£]?\s*\d[\d.,]*)$/i);
    if (m) return { name: clean(m[1]), priceText: m[2], extras: [] };
    return { name: clean(line), priceText: '', extras: [] };
  }

  /* ---------- row checks ---------- */

  // Builds one problem: code (for tests and screens), level 'error' (the row cannot be added) or 'warn', the plain words,
  // and what to do about it.
  const prob = (code, level, message, fix) => ({ code, level, message, fix });

  // Checks one dish row and fills its problems. seen holds the names already used in the file (name key -> first line).
  function checkRow(row, seen, existing, state) {
    const P = row.problems;
    const name = row.name;
    if (!name) P.push(prob('noName', 'error', 'This row has no dish name.', 'Type a name in the first column, or delete the row.'));
    else {
      if (name.length > LIMITS.nameMax) P.push(prob('nameTooLong', 'error', 'The name is ' + name.length + ' characters long. A dish name holds up to ' + LIMITS.nameMax + '.', 'Shorten the name to ' + LIMITS.nameMax + ' characters or fewer.'));
      const k = key(name);
      if (existing.has(k)) P.push(prob('duplicateExisting', 'error', '"' + name + '" is already on your menu.', 'Skip this row, or rename it (for example add "large").'));
      else if (seen.has(k)) P.push(prob('duplicateInFile', 'error', '"' + name + '" appears again; line ' + seen.get(k) + ' already has it.', 'Keep one of the two rows, or rename this one.'));
      else seen.set(k, row.line);
    }
    const pr = row.priceError;
    if (pr === 'missing') P.push(prob('noPrice', 'error', 'This row has no price.', 'Enter the price in dollars, for example 9.50. A price is never guessed.'));
    else if (pr === 'variable') P.push(prob('variablePrice', 'error', 'The price says "' + row.priceText + '", not an amount.', 'Enter a fixed price in dollars. You can change it later.'));
    else if (pr === 'range') P.push(prob('priceRange', 'error', 'The price "' + row.priceText + '" is a range.', 'Pick one price in dollars.'));
    else if (pr === 'bad') P.push(prob('badPrice', 'error', 'The price "' + row.priceText + '" is not a number.', 'Use digits only, for example 9.50.'));
    else if (typeof row.price === 'number') {
      if (row.price < 0) P.push(prob('negativePrice', 'error', 'The price ' + row.price + ' is below zero.', 'Enter the price as a positive amount.'));
      else if (row.price > LIMITS.priceMax) P.push(prob('hugePrice', 'error', 'The price ' + row.price + ' is above ' + cs() + LIMITS.priceMax + '.', row.fromCents ? 'The file may already be in dollars; choose "Prices are in dollars".' : 'Check for a stray digit, for example 9.50 not 950.'));
      else if (row.price === 0) P.push(prob('freeItem', 'warn', 'The price is ' + cs() + '0.00.', 'Keep it if the dish is free, or enter a price.'));
      if (row.rounded) P.push(prob('priceRounded', 'warn', 'The price had more than two decimals and was rounded to the cent.', 'Check the price shown.'));
    }
    if (row.extraCells) P.push(prob('extraColumns', 'warn', 'This row has ' + row.extraCells + ' more ' + (row.extraCells === 1 ? 'column' : 'columns') + ' than the header, so a value may have been split at a comma.' + (row.maybePrice ? ' The price may be ' + row.maybePrice + ', not ' + row.price + '.' : ''), 'Put quotes around a price with a comma (for example "4,50"), or use a dot (4.50), then read the file again.'));
    else if (/^\d+([.,]\d+)?$/.test(row.categoryText || '')) P.push(prob('numericCategory', 'warn', 'The menu section (category) "' + row.categoryText + '" is a number, which usually means a price was split in two.', 'Check the price and the menu section (category) in the file.'));
    if (row.stationText && !row.station) P.push(prob('unknownStation', 'warn', 'The station "' + row.stationText + '" is not one of yours, so the default station is used.', 'Pick the station after adding the dish.'));
    if (row.categoryText && !row.category) P.push(prob('unknownCategory', 'warn', 'The menu section (category) "' + row.categoryText + '" is not one of yours, so the default section is used.', 'Change the menu section after adding the dish.'));
    if (row.fromCents) P.push(prob('centsConverted', 'warn', 'The price was read in cents (' + row.priceText + ' becomes ' + cs() + (row.price != null ? row.price.toFixed(2) : '?') + ').', 'If this is wrong, choose "Prices are in dollars".'));
    row.ok = !P.some((p) => p.level === 'error');
  }

  /* ---------- parse ---------- */

  // Builds a fresh, empty dish row for one line of the file.
  function newRow(line) {
    return { name: '', price: null, station: undefined, category: undefined, description: undefined, line, problems: [], ok: false, priceText: '', priceError: null, stationText: '', categoryText: '', fromCents: false, rounded: false };
  }
  // Gives a row its price from text. cents: true reads a whole-number price as cents (Clover).
  function setPrice(row, text, cents) {
    row.priceText = clean(text);
    const r = readPrice(text);
    if (r.error) { row.priceError = r.error; return; }
    let v = r.value;
    if (cents && /^[+-]?\d+$/.test(row.priceText.replace(/[$€£\s]/g, ''))) { v = Math.round(v) / 100; row.fromCents = true; }
    row.price = v; row.rounded = !!r.rounded && !row.fromCents;
  }
  // Fills the station and category of a row from the config words.
  function setWhere(row, stationText, categoryText, opts) {
    row.stationText = clean(stationText); row.categoryText = clean(categoryText);
    row.station = zoneFrom(row.stationText, opts); row.category = catFrom(row.categoryText, opts);
  }

  // Rows from the typed-lines format.
  function parseLines(text, opts) {
    const out = [];
    const lines = text.split(/\r\n|\r|\n/);
    for (let i = 0; i < lines.length && out.length < LIMITS.rowsRead; i++) {
      const raw = lines[i];
      if (!clean(raw)) continue;
      if (/^\s*(#|\/\/)/.test(raw)) continue;
      const f = readLine(raw.trim());
      const row = newRow(i + 1);
      row.name = clean(unguard(f.name));
      setPrice(row, f.priceText, opts.priceUnit === 'cents');
      // Extra cells after the price: a station, a category, or a note.
      let stationText = '', categoryText = '';
      for (const x of f.extras) { if (zoneFrom(x, opts)) stationText = x; else if (catFrom(x, opts)) categoryText = x; else if (!stationText && !categoryText) stationText = x; }
      setWhere(row, stationText, categoryText, opts);
      out.push(row);
    }
    return out;
  }

  // Rows from a table with a header row. cols tells where each field is; square joins the variation name when an item has several.
  function parseTable(table, format, opts, summary) {
    const headers = table[0].map(norm);
    const col = {
      name: findCol(headers, format === 'toast' ? ['itemname', 'menuitem', 'menuitemname', 'name'] : WORDS.name),
      price: findCol(headers, format === 'toast' ? ['price', 'baseprice', 'basepricedollars', 'itemprice'] : WORDS.price.filter((w) => w !== 'cost')),
      station: findCol(headers, WORDS.station),
      category: findCol(headers, format === 'toast' ? ['menugroup', 'category', 'menucategory'] : WORDS.category),
      description: findCol(headers, WORDS.description),
      variation: format === 'square' ? headers.indexOf('variationname') : -1,
      priceType: format === 'clover' ? headers.indexOf('pricetype') : -1,
      hidden: Math.max(headers.indexOf('hidden'), headers.indexOf('archived'), headers.indexOf('visibility')),
    };
    if (col.price < 0) col.price = findCol(headers, ['cost']);
    // Columns the importer does not use are named, so a screen can say what was left out ("Ignored column: Notes").
    const usedCols = new Set([col.name, col.price, col.station, col.category, col.description, col.variation, col.priceType, col.hidden].filter((x) => x >= 0));
    if (summary) summary.ignoredColumns = table[0].map((h, i) => [clean(h), i]).filter(([h, i]) => h && !usedCols.has(i)).map(([h]) => h);
    const cents = opts.priceUnit === 'cents' || (opts.priceUnit !== 'dollars' && format === 'clover');
    const data = [];
    for (let i = 1; i < table.length && data.length < LIMITS.rowsRead; i++) {
      const r = table[i];
      if (r.every((c) => !clean(c))) continue;
      data.push({ cells: r, line: i + 1 });
    }
    // Square lists one row per variation; the variation name is added to the dish name when an item has more than one.
    const count = {};
    if (col.variation >= 0) for (const d of data) { const k = key(d.cells[col.name]); count[k] = (count[k] || 0) + 1; }
    const out = [];
    for (const d of data) {
      // The text in column ix of this row, or empty when the column is missing.
      const c = (ix) => (ix >= 0 && ix < d.cells.length ? d.cells[ix] : '');
      const row = newRow(d.line);
      let name = clean(unguard(c(col.name)));
      if (col.variation >= 0) {
        const v = clean(c(col.variation));
        if (v && count[key(name)] > 1 && !/^(regular|default|standard)$/i.test(v)) name = clean(name + ' (' + v + ')');
      }
      row.name = name;
      const typ = col.priceType >= 0 ? clean(c(col.priceType)).toUpperCase() : '';
      if (typ === 'VARIABLE' || typ === 'PER_UNIT') { row.priceText = clean(c(col.price)) || typ.toLowerCase(); row.priceError = 'variable'; } else setPrice(row, c(col.price), cents);
      setWhere(row, c(col.station), c(col.category), opts);
      // More filled cells than the header has columns: a comma inside an unquoted value pushed the rest along.
      let used = d.cells.length;
      while (used > 0 && !clean(d.cells[used - 1])) used--;
      if (used > headers.length) {
        row.extraCells = used - headers.length;
        const next = clean(c(col.price + 1));
        if (col.price >= 0 && /^\d{2}$/.test(next) && /^\d+$/.test(clean(c(col.price)))) row.maybePrice = clean(c(col.price)) + '.' + next;
      }
      const desc = clean(c(col.description));
      if (desc) row.description = desc;
      if (col.hidden >= 0 && /^(true|yes|y|1|hidden|archived)$/i.test(clean(c(col.hidden)))) row.hidden = true;
      out.push(row);
    }
    return out;
  }

  // Reads menu text and says what it found. opts: format (force 'lines', 'csv', 'square', 'toast' or 'clover'),
  // existing (the dishes already on the menu), priceUnit ('dollars' or 'cents'; Clover is read as cents unless told),
  // zones and categories (override the config lists). Returns { format, label, rows, summary, error? }; never throws.
  M.parse = function parse(text, opts) {
    opts = opts || {};
    const res = { format: null, label: '', rows: [], summary: { total: 0, ok: 0, errors: 0, warnings: 0, notes: [], ignoredColumns: [] } };
    try {
      if (typeof text !== 'string') { res.error = 'No text to read.'; return res; }
      text = stripBom(text);
      if (text.length > LIMITS.textMax) { res.error = 'That is too much text (more than ' + (LIMITS.textMax / 1000) + ' KB). A menu file is far smaller; check that it is the right file.'; return res; }
      if (!clean(text)) { res.error = 'The text is empty.'; return res; }
      const delim = pickDelimiter(text);
      let table = null, format = opts.format || null;
      // A table is tried first unless the caller asked for lines.
      if (format !== 'lines') {
        table = splitTable(text, delim).filter((r) => r.some((c) => clean(c)));
        const found = table.length ? detectFormat(table[0]) : null;
        if (format && format !== 'csv' && found === null && table.length) format = null;
        if (!format) format = found || 'lines';
        else if (format === 'csv' && found === null) format = 'lines';
      }
      res.format = format; res.label = FORMAT_LABEL[format] || format;
      if (format === 'lines') res.rows = parseLines(text, opts);
      else {
        if (table.length < 2) { res.summary.notes.push('The file has a header row but no dishes under it.'); res.rows = []; } else res.rows = parseTable(table, format, opts, res.summary);
        if (format === 'clover' && opts.priceUnit !== 'dollars') res.summary.notes.push('Clover prices are read as cents (1400 is ' + cs() + '14.00). If the first rows look wrong, read the file again with prices in dollars.');
      }
      if (res.rows.length >= LIMITS.rowsRead) res.summary.notes.push('Only the first ' + LIMITS.rowsRead + ' rows were read.');
      const existing = new Set(((opts.existing) || []).map((m) => key(m && m.name)));
      const seen = new Map();
      const room = Math.max(0, LIMITS.maxDishes - ((opts.existing) || []).length);
      let okCount = 0;
      for (const row of res.rows) {
        checkRow(row, seen, existing, null);
        // A row that passes every other check still needs room on the menu.
        if (row.ok) {
          if (okCount >= room) { row.problems.push(prob('menuFull', 'error', 'The menu holds up to ' + LIMITS.maxDishes + ' dishes and this one does not fit.', 'Archive dishes you no longer sell, or import fewer rows.')); row.ok = false; } else okCount++;
        }
        if (row.hidden) row.problems.push(prob('hiddenItem', 'warn', 'The file marks this item as hidden.', 'Skip it if you do not sell it.'));
      }
      const S = res.summary;
      S.total = res.rows.length;
      for (const r of res.rows) { if (r.ok) S.ok++; if (r.problems.some((p) => p.level === 'error')) S.errors++; if (r.problems.some((p) => p.level === 'warn')) S.warnings++; }
      // Station and category words the file used that match none of the kitchen's, so a screen can offer to add them.
      S.unmatched = { stations: [], categories: [] };
      for (const r of res.rows) {
        if (r.stationText && !r.station && S.unmatched.stations.indexOf(r.stationText) < 0) S.unmatched.stations.push(r.stationText);
        if (r.categoryText && !r.category && S.unmatched.categories.indexOf(r.categoryText) < 0) S.unmatched.categories.push(r.categoryText);
      }
      S.duplicates = res.rows.filter((r) => r.problems.some((p) => p.code === 'duplicateInFile' || p.code === 'duplicateExisting')).length;
      S.message = S.total === 0 ? 'No dishes were found.' : S.ok + ' of ' + S.total + ' dishes are ready to add' + (S.errors ? '; ' + S.errors + ' need a fix or will be skipped.' : '.');
    } catch (e) {
      res.error = 'That text could not be read. Check that it is a menu list or a table with a name and a price.';
    }
    return res;
  };

  /* ---------- engine actions ---------- */

  // Turns checked rows into the engine's addMenuItem actions, with safe defaults: the first work station and category (or
  // opts.zone / opts.cat), a 5 minute prep time marked as a guess, one tap to finish. Rows with an error are skipped and
  // listed. The dishes already on the menu and the 150 dish limit are checked again here. Returns { actions, skipped }.
  M.toActions = function toActions(rows, existingMenu, opts) {
    opts = opts || {};
    const zones = (opts.zones || (SB.config && SB.config.workZones) || ['pit']);
    const cats = (opts.categories || (SB.config && SB.config.categories) || [{ id: 'meat' }]);
    const zoneDef = opts.zone || zones[0];
    const catDef = opts.cat || (cats[0] && cats[0].id);
    const have = new Set((existingMenu || []).map((m) => key(m && m.name)));
    let room = LIMITS.maxDishes - (existingMenu || []).length;
    const actions = [], skipped = [];
    for (const r of Array.isArray(rows) ? rows : []) {
      const reason = !r || !r.ok ? 'This row has a problem to fix first.' : have.has(key(r.name)) ? 'That dish is already on the menu.' : room <= 0 ? 'The menu is full.' : null;
      if (reason) { skipped.push({ line: r && r.line, name: r && r.name, reason }); continue; }
      have.add(key(r.name)); room--;
      actions.push({ type: 'addMenuItem', line: r.line, payload: { name: r.name, zone: r.station || zoneDef, cat: r.category || catDef, price: r.price, prepSec: opts.prepSec || DEFAULTS.prepSec, track: opts.track || DEFAULTS.track, prepGuess: true } });
    }
    return { actions, skipped };
  };

  /* ---------- export ---------- */

  // One spreadsheet cell: quoted when it has a comma, quote or line break; text starting with = + - @ gets an apostrophe so a
  // spreadsheet cannot run it as a formula (the importer takes the apostrophe off again).
  function cell(v) {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@\t]/.test(s)) s = "'" + s;
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  // Writes the menu as CSV the importer can read back: Name, Price, Station, Category. Archived dishes are left out.
  // Station and category are written by their names. Lines end with CRLF so Excel opens it cleanly.
  M.exportMenu = function exportMenu(menu, opts) {
    const zones = (opts && opts.zones) || (SB.config && SB.config.zones) || [];
    const cats = (opts && opts.categories) || (SB.config && SB.config.categories) || [];
    // The station name for an id (the id itself when unknown).
    const zn = (id) => { const z = zones.find((x) => x.id === id); return z ? z.name : id; };
    // The category name for an id (the id itself when unknown).
    const cn = (id) => { const c = cats.find((x) => x.id === id); return c ? c.name : id; };
    const lines = [['Name', 'Price', 'Station', 'Category'].join(',')];
    for (const m of Array.isArray(menu) ? menu : []) {
      if (!m || m.archived) continue;
      lines.push([cell(m.name), cell(typeof m.price === 'number' ? m.price.toFixed(2) : ''), cell(zn(m.zone)), cell(cn(m.cat))].join(','));
    }
    return lines.join('\r\n') + '\r\n';
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
