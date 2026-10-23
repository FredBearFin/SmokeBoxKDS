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
    const kindText = mode === 'demo' ? 'Practice kitchen (the demo)' : 'Your own kitchen';
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
      ? (mode === 'demo' ? 'This backup comes from the practice kitchen (the demo), not from your own kitchen, so it cannot be restored here.' : 'This backup comes from a real kitchen, so it cannot be restored into the practice kitchen.')
      : '';
    return { rows, wrongKitchen, kindText, refusal };
  }

  // True when the typed text is the confirming word (any capitals, spaces around it ignored).
  function resetWordOk(typed, word) {
    return String(typed == null ? '' : typed).trim().toLowerCase() === String(word || 'reset').toLowerCase();
  }

  O.backupPure = { backupFreshness, describeBackup, resetWordOk };
})(typeof globalThis !== 'undefined' ? globalThis : window);
