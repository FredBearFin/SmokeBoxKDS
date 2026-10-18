/*
 * WHAT THIS FILE IS: Small shared helpers: maths, dates (including the 4 am service day), text formatting,
 *    seeded dice, safe browser storage and tiny page-building tools. All of them hang on SB.util.
 * PARTS: numbers and lists, seeded dice, formatting, dates, colour contrast, storage, page helpers.
 * USES: nothing. USED BY: every other file. Loads in Node (tests): nothing touches the page at load time.
 */
(function (g) {
  'use strict';
  const SB = (g.SB = g.SB || {});
  const U = (SB.util = {});

  /* ---------- numbers & collections ---------- */
  // True only for a real, finite number (not text, not "not a number", not infinity).
  // Used before any maths on values that may be missing.
  U.isNum = (n) => typeof n === 'number' && isFinite(n);
  // Forces a number into the range lo to hi, so clamp(15, 0, 10) gives 10.
  U.clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  // Slides from a to b by the fraction t (t = 0 gives a, t = 1 gives b).
  U.lerp = (a, b, t) => a + (b - a) * t;
  // Adds up a list of numbers. An empty list gives 0.
  U.sum = (a) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return s; };
  // Average of a list. An empty list gives 0 instead of a divide-by-zero.
  U.mean = (a) => (a.length ? U.sum(a) / a.length : 0);
  // Value at percent p (0 to 100) of a list, blending the two nearest entries when p falls between them.
  // Works on a sorted copy, so the caller's list keeps its order. An empty list gives 0.
  U.percentile = (arr, p) => {
    if (!arr.length) return 0;
    const s = arr.slice().sort((x, y) => x - y);
    const idx = (U.clamp(p, 0, 100) / 100) * (s.length - 1);
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    return s[lo] + (s[hi] - s[lo]) * (idx - lo);
  };
  // The middle value of a list (the 50th percentile).
  U.median = (a) => U.percentile(a, 50);
  // Sorts a list into labelled piles. fn(item) names the pile; the result has one list per label.
  U.groupBy = (arr, fn) => {
    const m = {};
    for (const x of arr) { const k = fn(x); (m[k] || (m[k] = [])).push(x); }
    return m;
  };
  // Rounds to d decimal places (0 by default).
  U.round = (n, d = 0) => { const f = Math.pow(10, d); return Math.round(n * f) / f; };
  // Picks the singular or plural word for a count. "many" defaults to the singular plus "s".
  U.plural = (n, one, many) => (n === 1 ? one : many || one + 's');
  // Makes a fully independent copy of plain data, so changing the copy never changes the original.
  U.clone = (o) => (typeof structuredClone === 'function' ? structuredClone(o) : JSON.parse(JSON.stringify(o)));
  // Wraps fn so a burst of calls becomes one run, ms after the last call.
  // WATCH OUT: .flush() runs fn at once with no arguments, even if no call is waiting.
  U.debounce = (fn, ms) => { let t; const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; d.flush = () => { clearTimeout(t); fn(); }; return d; };
  // Wraps fn so it runs at most once every ms. A call made too soon is held and runs when the wait is over.
  U.throttle = (fn, ms) => { let last = 0, t; return (...a) => { const n = Date.now(); const rem = ms - (n - last); if (rem <= 0) { last = n; fn(...a); } else { clearTimeout(t); t = setTimeout(() => { last = Date.now(); fn(...a); }, rem); } }; };

  let uidN = 0;
  // Makes an id like "t_3k9f": the prefix, a counter and a random part. For labels, not for security.
  U.uid = (prefix) => (prefix || 'id') + '_' + (++uidN).toString(36) + Math.floor(Math.random() * 46656).toString(36);

  /* ---------- seeded random (mulberry32). Used by the simulator so sample history is reproducible. ---------- */
  // Seeded dice (the mulberry32 formula). The same seed always rolls the same numbers, which is how the
  // sample
  // history comes out identical every time. Returns an object with next, range, int, chance, pick, normal,
  // logNormal, weighted and shuffle.
  U.rng = function (seed) {
    let a = seed >>> 0;
    // Next random number from 0 up to, but not including, 1. Each call moves the seed along.
    const next = () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const r = {
      next,
      // Random number between lo and hi.
      range: (lo, hi) => lo + next() * (hi - lo),
      // Random whole number from lo to hi, both ends possible.
      int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
      // True with probability p, so chance(0.2) is true about one time in five.
      chance: (p) => next() < p,
      // One random entry from a list.
      pick: (arr) => arr[Math.floor(next() * arr.length)],
      // Bell-curve number centred on mu with spread sd (Box-Muller method).
      normal: (mu = 0, sd = 1) => {
        let u = 0, v = 0;
        // Zero is skipped because the logarithm below cannot take it.
        while (u === 0) u = next();
        while (v === 0) v = next();
        return mu + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
      },
      // Random number whose middle is "median", with a long tail of slower values: most cooks near the
      // usual time, a few much slower. Right shape for item times. Bigger sigma means a longer tail.
      logNormal: (median, sigma) => median * Math.exp(sigma * r.normal()),
      // Picks one item, favouring items whose wfn(item) is larger. Negative weights count as 0.
      weighted: (items, wfn) => {
        let tot = 0; const w = items.map((it) => { const x = Math.max(0, wfn(it)); tot += x; return x; });
        let t = next() * tot;
        for (let i = 0; i < items.length; i++) { t -= w[i]; if (t <= 0) return items[i]; }
        return items[items.length - 1];
      },
      // Returns a shuffled copy of a list (Fisher-Yates). The original is left alone.
      shuffle: (arr) => { const s = arr.slice(); for (let i = s.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [s[i], s[j]] = [s[j], s[i]]; } return s; },
    };
    return r;
  };

  /* ---------- formatting ---------- */
  // Pads a number to two digits: 7 becomes "07".
  // Used by the clock and date text.
  U.pad2 = (n) => (n < 10 ? '0' : '') + n;
  /** Elapsed clock "05:14". Minutes grow past 99 ("100:05"). Negative values get a leading minus. */
  U.fmtClock = (ms) => {
    const neg = ms < 0; let s = Math.floor(Math.abs(ms) / 1000);
    const m = Math.floor(s / 60); s = s % 60;
    return (neg ? '-' : '') + U.pad2(m) + ':' + U.pad2(s);
  };
  /** Human duration "5m 14s", "42s", "1h 05m". */
  U.fmtDur = (ms) => {
    if (!U.isNum(ms)) return '-';
    const neg = ms < 0; let s = Math.round(Math.abs(ms) / 1000);
    const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const sec = s % 60;
    let out;
    if (h > 0) out = h + 'h ' + U.pad2(m) + 'm';
    else if (m > 0) out = m + 'm ' + U.pad2(sec) + 's';
    else out = sec + 's';
    return (neg ? '-' : '') + out;
  };
  /** Local time of day "1:42 pm". */
  U.fmtTime = (ts) => {
    const d = new Date(ts); let h = d.getHours(); const m = d.getMinutes();
    const ap = h >= 12 ? 'pm' : 'am'; h = h % 12; if (h === 0) h = 12;
    return h + ':' + U.pad2(m) + ' ' + ap;
  };
  /** Hour-of-service label for a decimal hour ("13.25" -> "1 pm", 24.75 -> "12 am"). */
  U.fmtHour = (h) => { const hh = ((Math.floor(h) % 24) + 24) % 24; const ap = hh >= 12 ? 'pm' : 'am'; const x = hh % 12 === 0 ? 12 : hh % 12; return x + ' ' + ap; };
  // Dollars with thousands commas, like "$1,234.50". Negatives read "-$5.00". Not a number gives "-".
  U.fmtMoney = (n, dec = 2) => {
    if (!U.isNum(n)) return '-';
    const neg = n < 0; const s = Math.abs(n).toFixed(dec).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (neg ? '-$' : '$') + s;
  };
  // Reads typed dollars like "2.50", "$3" or ".5" into a number rounded to cents. A blank box is 0, anything else
  // (letters, a minus sign, more than two decimals, over 99,999.99) is NaN so the screen can say what is wrong.
  U.parseDollars = (txt) => {
    const t = String(txt == null ? '' : txt).trim().replace(/^\$/, '');
    if (t === '') return 0;
    if (!/^\d{0,5}(\.\d{0,2})?$/.test(t) || t === '.') return NaN;
    return Math.round(parseFloat(t) * 100) / 100;
  };
  /** Grams for display. User preference: weights in grams, not cups. 850 -> "850 g", 2400 -> "2.40 kg". */
  U.fmtG = (g) => { if (!U.isNum(g)) return '-'; return Math.abs(g) >= 1000 ? (g / 1000).toFixed(2) + ' kg' : Math.round(g) + ' g'; };
  // Fraction to percent text: 0.874 gives "87%" (d = number of decimals). Not a number gives "-".
  U.fmtPct = (x, d = 0) => (U.isNum(x) ? (x * 100).toFixed(d) + '%' : '-');
  // Number with thousands commas and d decimals. Not a number gives "-".
  U.fmtNum = (n, d = 0) => (U.isNum(n) ? n.toFixed(d).replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '-');
  // Whole degrees Fahrenheit with the degree sign, like "135 F". Not a number gives "-".
  U.fmtTemp = (f) => (U.isNum(f) ? Math.round(f) + '°F' : '-');

  /* ---------- dates (all local time). The "service day" runs from dayStartHour (4 am) so a 12:45 am sale belongs to last night. ---------- */
  // 4 am: the service day turns over at 4 am, so a 12:45 am sale still belongs to the night before.
  U.DAY_START_HOUR = 4;
  // Local calendar date of a moment as "YYYY-MM-DD" (a moment is a timestamp: milliseconds since 1970).
  U.dateKey = (ts) => { const d = new Date(ts); return d.getFullYear() + '-' + U.pad2(d.getMonth() + 1) + '-' + U.pad2(d.getDate()); };
  // The service day a moment belongs to. 12:45 am on the 18th gives the 17th, because the day only
  // turns over at dayStartHour (4 am unless given).
  U.serviceDate = (ts, dayStartHour) => U.dateKey(ts - (dayStartHour == null ? U.DAY_START_HOUR : dayStartHour) * 3600e3);
  // Turns "YYYY-MM-DD" back into the moment of local midnight starting that date.
  U.dateKeyToMs = (key) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d).getTime(); };
  // Date text n days later (earlier if n is negative). It steps from midday so a daylight-saving change
  // cannot slip the answer by a day.
  U.addDays = (key, n) => { const [y, m, d] = key.split('-').map(Number); return U.dateKey(new Date(y, m - 1, d + n).getTime() + 12 * 3600e3); };
  // Day of the week for a "YYYY-MM-DD" text.
  U.weekday = (key) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d).getDay(); }; // 0 = Sunday
  // Short day names in the same order as U.weekday numbers.
  U.WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  /** Decimal hour since midnight of the service date. 12:45 am after a night service = 24.75. */
  // Hours since midnight of the moment's service date, as a decimal.
  // Right after a night service, 12:45 am is hour 24.75.
  U.serviceHour = (ts, dayStartHour) => (ts - U.dateKeyToMs(U.serviceDate(ts, dayStartHour))) / 3600e3;
  // Short label for a "YYYY-MM-DD" text, like "Sat 10/17".
  U.fmtDateShort = (key) => { const [y, m, d] = key.split('-').map(Number); return U.WEEKDAYS[new Date(y, m - 1, d).getDay()] + ' ' + m + '/' + d; };

  /* ---------- contrast (used by the live Specs panel so claims are computed, not typed) ---------- */
  // How bright a "#RRGGBB" colour is, from 0 (black) to 1 (white), by the standard web-accessibility
  // formula.
  U.luminance = (hex) => {
    const n = parseInt(hex.replace('#', ''), 16);
    // Converts one colour channel (0 to 255) to its light level. The 0.03928 switch is part of the standard.
    const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    return 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255);
  };
  // Contrast ratio of two "#RRGGBB" colours, 1 to 21. Small text needs 4.5 or more;
  // large text and borders need 3.
  U.contrast = (a, b) => { const x = U.luminance(a), y = U.luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

  /* ---------- safe storage: never throws, falls back to memory (private windows, previews, blocked storage) ---------- */
  // Probe: write and delete a test key. Some browsers show storage but refuse to use it (private windows,
  // blocked site data); then "ls" stays null and everything is kept in memory instead.
  const mem = new Map();
  let ls = null;
  try { ls = g.localStorage || null; if (ls) { ls.setItem('__sb_probe', '1'); ls.removeItem('__sb_probe'); } } catch (e) { ls = null; }
  U.storage = {
    persistent: !!ls,
    // Reads a saved value. Gives fallback if it is missing, unreadable, or storage is blocked. Never throws.
    get(key, fallback) {
      try { const raw = ls ? ls.getItem(key) : mem.get(key); if (raw == null) return fallback; return JSON.parse(raw); } catch (e) { return fallback; }
    },
    // The saved text exactly as stored, or null if nothing is saved or storage is blocked. Lets a caller tell
    // "nothing saved" apart from "saved but unreadable", which get() cannot (it gives the fallback for both).
    raw(key) {
      try { const raw = ls ? ls.getItem(key) : mem.get(key); return raw == null ? null : String(raw); } catch (e) { return null; }
    },
    // Saves a value as text. Returns false if the value cannot be turned into text or the browser refused it
    // (then it is kept in memory only, so the page still works until it is closed).
    set(key, val) {
      let raw; try { raw = JSON.stringify(val); } catch (e) { return false; }
      try { if (ls) ls.setItem(key, raw); else mem.set(key, raw); return true; } catch (e) { mem.set(key, raw); return false; }
    },
    // Deletes a saved value from the browser and from memory.
    remove(key) { try { if (ls) ls.removeItem(key); } catch (e) { /* ignore */ } mem.delete(key); },
  };

  /* ---------- DOM helpers (browser only; call after load) ---------- */
  // Makes text safe to place inside page markup by replacing & < > and quotes.
  // Use it on anything a person typed.
  U.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // First page element matching a selector (an address like ".slip"), looking inside root or the whole page.
  U.$ = (sel, root) => (root || document).querySelector(sel);
  // Same as U.$ but returns a list of every match.
  U.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const SVGNS = 'http://www.w3.org/2000/svg';
  // Copies a labelled card of settings onto an element: class, style, dataset, onClick-style handlers, text,
  // or a plain attribute. Skips null and false. A value of true sets an empty attribute (like "disabled").
  function applyProps(el, props) {
    for (const k in props) {
      const v = props[k];
      if (v == null || v === false) continue;
      if (k === 'class' || k === 'className') el.setAttribute('class', v);
      else if (k === 'style') { if (typeof v === 'string') el.setAttribute('style', v); else Object.assign(el.style, v); }
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'text') el.textContent = v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  // Adds children to an element. Text and numbers become text, nested lists are flattened,
  // null and false are skipped.
  function appendKids(el, kids) {
    for (const k of kids) {
      if (k == null || k === false) continue;
      if (Array.isArray(k)) appendKids(el, k);
      else el.appendChild(k.nodeType ? k : document.createTextNode(String(k)));
    }
  }
  /** h('div', {class:'x', onClick:fn}, child, 'text', [more]) -> HTMLElement. Text is always escaped (textNodes). */
  U.h = (tag, props, ...kids) => { const el = document.createElement(tag); if (props) applyProps(el, props); appendKids(el, kids); return el; };
  // svg("path", {d: "..."}) makes a drawing-namespace element, the same way h() makes a normal one.
  U.svg = (tag, props, ...kids) => { const el = document.createElementNS(SVGNS, tag); if (props) applyProps(el, props); appendKids(el, kids); return el; };
  // Removes every child from an element and returns the element.
  U.clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
  // True when the device asks for less animation. False if the browser cannot say.
  U.prefersReducedMotion = () => { try { return g.matchMedia && g.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
})(typeof globalThis !== 'undefined' ? globalThis : window);
