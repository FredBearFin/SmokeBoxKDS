/*
 * WHAT THIS FILE IS: Plain-words helpers for the Data page's backup, restore and reset flow: how fresh the last
 * backup is, what a chosen backup file contains (and whether it belongs to this kitchen), and the typed word that
 * guards a reset. Pure functions, so they run in Node tests.
 * PARTS: freshness, backup summary, reset word.   USES: SB.util.   USED BY: 84-office-data.js (the Data page).
 */
(function (g) {
  'use strict';
  const SB = (g.SB = g.SB || {});
  const U = SB.util;
  const O = (SB.office = SB.office || {});
  // True only for a real, finite number.
  const isNum = (n) => typeof n === 'number' && isFinite(n);
  // 3 600 000 ms in an hour.
  const HOUR = 3600e3;

  // How fresh the last backup is: {tone: 'ok'|'warn'|'bad', text}. Never backed up is bad; over 3 days is bad;
  // over about a day is a warning; anything newer is fine. at is the time of the last backup or null.
  function backupFreshness(at, now) {
    if (!isNum(at)) return { tone: 'bad', text: 'You have never backed up this kitchen from this device. Back up now.' };
    const hrs = Math.max(0, (now - at) / HOUR);
    const when = U.fmtDateShort(U.dateKey(at)) + ', ' + U.fmtTime(at);
    const ago = hrs < 1 ? 'less than an hour ago' : hrs < 36 ? Math.round(hrs) + ' ' + U.plural(Math.round(hrs), 'hour') + ' ago' : Math.round(hrs / 24) + ' days ago';
    if (hrs <= 26) return { tone: 'ok', text: 'Last backup: ' + when + ' (' + ago + ').' };
    if (hrs <= 72) return { tone: 'warn', text: 'Last backup: ' + when + ' (' + ago + '). Back up again today.' };
    return { tone: 'bad', text: 'Last backup: ' + when + ' (' + ago + '). That is old. Back up now.' };
  }

  // What a checked backup file holds, as plain rows, plus whether it belongs to this kitchen.
  // res = {state, savedAt, mode ('real' or 'demo'), bySrc}; storeMode is this device's mode ('real' or 'demo').
  // Returns {rows:[[label,value]], wrongKitchen:boolean, kindText, refusal}. Counts only real data, never guesses.
  function describeBackup(res, storeMode) {
    const s = res.state || {};
    const menu = Array.isArray(s.menu) ? s.menu : [];
    const archived = menu.filter((m) => m && m.archived).length;
    const orders = Array.isArray(s.orders) ? s.orders.length : 0;
    const tickets = Array.isArray(s.tickets) ? s.tickets.length : 0;
    const mode = res.mode === 'demo' ? 'demo' : 'real';
    const kindText = mode === 'demo' ? 'Demo kitchen' : 'Your own kitchen';
    const pin = s.settings && s.settings.office && s.settings.office.pinHash ? 'Set (this device will ask for it)' : 'Not set';
    const rows = [];
    if (isNum(res.savedAt)) rows.push(['Saved', U.fmtDateShort(U.dateKey(res.savedAt)) + ', ' + U.fmtTime(res.savedAt)]);
    rows.push(['Kind', kindText]);
    rows.push(['Dishes', menu.length + (archived ? ' (' + archived + ' hidden)' : '')]);
    rows.push(['Orders', U.fmtNum(orders)]);
    rows.push(['Tickets', U.fmtNum(tickets)]);
    rows.push(['Manager PIN', pin]);
    const wrongKitchen = !!storeMode && mode !== storeMode;
    const refusal = wrongKitchen
      ? (mode === 'demo' ? 'This backup comes from the demo kitchen, not from your own kitchen, so it cannot be restored here.' : 'This backup comes from a real kitchen, so it cannot be restored into the demo kitchen.')
      : '';
    return { rows, wrongKitchen, kindText, refusal };
  }


  // Quotes one value for a CSV cell: wraps it in quotes when it holds a comma, quote or line break.
  function csvCell(v) { return SB.csv.cell(v); }
  // Whole cents as plain digits with two decimals (1240 gives "12.40"), with no dollar sign or thousands commas, so a spreadsheet adds them up.
  const plainMoney = (v) => (isNum(v) ? (Math.round(v) / 100).toFixed(2) : '0.00');

  // The sales-by-day CSV for an accountant, from the saved state: one row per service day with paid orders, then a Total row.
  // Columns: Date, Orders paid, Sales (after discounts), Discounts given, Tax, Tips, Total collected, then collected by Cash, Card and Other.
  // Paid orders count on the service day they were paid; voided and open orders are left out.
  function salesCsv(state, dayStartHour) {
    const dsh = isNum(dayStartHour) ? dayStartHour : U.DAY_START_HOUR;
    const days = {};
    const orders = state && Array.isArray(state.orders) ? state.orders : [];
    orders.forEach((o) => {
      if (!o || o.status !== 'paid' || !isNum(o.paidAt) || !o.totals) return;
      const day = U.serviceDate(o.paidAt, dsh);
      const d = days[day] || (days[day] = { orders: 0, sales: 0, discounts: 0, tax: 0, tips: 0, total: 0, cash: 0, card: 0, other: 0 });
      // Every amount is added in whole cents so a long list never picks up a stray cent.
      const cc = (v) => Math.round((isNum(v) ? v : 0) * 100);
      const T = o.totals, tip = cc(o.tip);
      const collected = cc(T.total) + tip;
      d.orders++; d.sales += cc(T.subtotal) - cc(T.discount); d.discounts += cc(T.discount); d.tax += cc(T.tax); d.tips += tip; d.total += collected;
      d[o.method === 'cash' ? 'cash' : o.method === 'card' ? 'card' : 'other'] += collected;
    });
    const head = ['Date', 'Orders paid', 'Sales (after discounts)', 'Discounts given', 'Tax', 'Tips', 'Total collected', 'Collected in cash', 'Collected by card', 'Collected other'];
    const sum = { orders: 0, sales: 0, discounts: 0, tax: 0, tips: 0, total: 0, cash: 0, card: 0, other: 0 };
    // One CSV line for a day or for the totals.
    const line = (label, d) => [label, d.orders, plainMoney(d.sales), plainMoney(d.discounts), plainMoney(d.tax), plainMoney(d.tips), plainMoney(d.total), plainMoney(d.cash), plainMoney(d.card), plainMoney(d.other)].map(csvCell).join(',');
    const rows = Object.keys(days).sort().map((k) => { Object.keys(sum).forEach((f) => { sum[f] += days[k][f]; }); return line(k, days[k]); });
    return [head.map(csvCell).join(',')].concat(rows, rows.length ? [line('Total', sum)] : []).join('\r\n') + '\r\n';
  }

  // True when the typed text is the confirming word (any capitals, spaces around it ignored).
  function resetWordOk(typed, word) {
    return String(typed == null ? '' : typed).trim().toLowerCase() === String(word || 'reset').toLowerCase();
  }

  O.backupPure = { backupFreshness, describeBackup, resetWordOk, salesCsv };
})(typeof globalThis !== 'undefined' ? globalThis : window);
