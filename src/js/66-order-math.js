/*
 * WHAT THIS FILE IS: The money shown before an order is sent. It asks the engine's own order totals (whole cents, half-up tax) what a
 *    draft would come to, so the preview on the order screen and the charge are always the same numbers. Nothing here does its own
 *    rounding of tax. It also splits a tip percentage in whole cents.
 * PARTS: previewTotals, pctOfDollars.
 * USES: 20-engine.js (orderTotals). USED BY: 71-floor-order.js (the order screen), 73-floor-orders.js (tip choices), and tests.
 */
(function (g) {
  'use strict';
  const SB = (g.SB = g.SB || {});
  // What the order would come to if the draft lines were sent now: the food already on the order (if any) plus the draft lines at menu
  // price, less nothing, plus tax, worked out by the engine's own orderTotals on a copy of the state that holds the draft as one more
  // ticket. lines is [{ price, qty }]. order is the open order the round goes to, or null for a new order. Returns { sub, tax, total }.
  function previewTotals(state, order, lines) {
    const E = SB.engine;
    const oid = order ? order.id : '_draft';
    const items = (lines || []).map((l) => ({ price: l.price, qty: l.qty }));
    const probe = Object.assign({}, state, { tickets: state.tickets.concat([{ id: '_draft', orderId: oid, status: 'active', items }]) });
    const t = E.orderTotals(probe, order && order.status === 'open' ? order : { id: oid, status: 'open' });
    return { sub: t.subtotal, tax: t.tax, total: t.total };
  }
  // A percentage of a dollar amount in whole cents, half a cent rounding up (15 percent of 23.50 is 3.53, not 3.52), for tip choices.
  function pctOfDollars(amount, pct) {
    const c = Math.round(Math.max(0, Number(amount) || 0) * 100 + 1e-7);
    return Math.floor((c * pct + 50) / 100) / 100;
  }
  SB.orderMath = { previewTotals, pctOfDollars };
})(typeof globalThis !== 'undefined' ? globalThis : window);
