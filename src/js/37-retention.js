/*
 * WHAT THIS FILE IS: How long the app keeps safety records, in one place, so every screen and printout that talks about
 *    "how far back" reads the engine's own number instead of repeating one. If the engine does not tell us, no number is
 *    claimed.
 * PARTS: days, words.
 * USES: 20-engine.js (SAFETY_KEEP_DAYS or SAFETY_KEEP_MS, when exported).   USED BY: 76-floor-discards.js, 89-office-inspector.js, tests.
 */
(function (g) {
  'use strict';
  const SB = (g.SB = g.SB || {});

  // The number of days the engine keeps a safety record, or null when the engine does not say.
  function days() {
    const E = SB.engine || {};
    if (typeof E.SAFETY_KEEP_DAYS === 'number' && E.SAFETY_KEEP_DAYS > 0) return Math.round(E.SAFETY_KEEP_DAYS);
    if (typeof E.SAFETY_KEEP_MS === 'number' && E.SAFETY_KEEP_MS > 0) return Math.round(E.SAFETY_KEEP_MS / 86400e3);
    return null;
  }
  // Plain words for the keep time: "Records are kept for about 400 days." or, when unknown, a line that claims no number.
  function words() {
    const d = days();
    return d ? 'Safety records are kept for about ' + d + ' days; older ones are not kept.' : 'Safety records are not kept forever; older ones may be gone.';
  }

  SB.retention = { days, words };
})(typeof globalThis !== 'undefined' ? globalThis : window);
