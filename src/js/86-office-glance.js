/*
 * WHAT THIS FILE IS: The manager "at a glance" summary: money so far today, open orders, late tickets, the
 * 86 list and when brisket runs out. Read only, live data only, built for a phone or a wall screen.
 * PARTS: 1 pure model (runs in Node tests), 2 reading the live kitchen, 3 SB.office.glance(host).
 * USES: SB.util, SB.store, SB.metrics, SB.deadlines.   USED BY: 81-office-pace.js (top of the Pace page);
 * the board wall mode can call SB.office.glance(host) to draw the same panel.
 */
(function (g) {
  'use strict';
  const SB = (g.SB = g.SB || {});
  const U = SB.util;
  const O = (SB.office = SB.office || {});
  // True only for a real, finite number.
  const isNum = (n) => typeof n === 'number' && isFinite(n);
  // 5000 ms: how often the panel re-reads the kitchen on its own.
  const EVERY_MS = 5000;

  // ---- 1. Pure model ----

  // The plain sentence about when brisket runs out. b = {onHandG, shortfallAt, rateKnown}. This is an
  // estimate from today's own sales pace, and the sentence says so; it is never a promise.
  function runOutLine(b, now) {
    b = b || {};
    if (!isNum(b.onHandG) || b.onHandG <= 0) return { tone: 'bad', text: 'No brisket is ready to serve right now.' };
    const kg = U.fmtG(b.onHandG) + ' on hand. ';
    if (isNum(b.shortfallAt) && b.shortfallAt > now) return { tone: 'warn', text: kg + 'At the current pace it runs out around ' + U.fmtTime(b.shortfallAt) + ' (an estimate from the last 2 hours of sales).' };
    if (b.rateKnown) return { tone: 'good', text: kg + 'At the current pace it should last until close (an estimate from the last 2 hours of sales).' };
    return { tone: 'info', text: kg + 'Not enough sales yet to estimate when it runs out.' };
  }

  // Turns raw numbers into the five panel cards. in = {now, collected, paidOrders, openOrders, openValue,
  // tickets, late, nearLate, out86: [names], brisket}. Each card has an id, label, value, a small line
  // under it and a tone (good, info, warn, bad).
  function glanceModel(inp) {
    inp = inp || {};
    // Picks the singular or plural word for a count.
    const plural = (n, one, many) => (n === 1 ? one : many);
    const late = inp.late || 0, near = inp.nearLate || 0, names = Array.isArray(inp.out86) ? inp.out86 : [];
    const run = runOutLine(inp.brisket, inp.now);
    return {
      cards: [
        { id: 'money', label: 'Paid so far today', value: U.fmtMoney(inp.collected || 0), tone: 'info',
          sub: inp.paidOrders > 0 ? inp.paidOrders + ' paid ' + plural(inp.paidOrders, 'order', 'orders') + ', with tax and tips' : 'No paid orders yet' },
        { id: 'open', label: 'Open orders', value: String(inp.openOrders || 0), tone: 'info',
          sub: (inp.openOrders > 0 && inp.openValue > 0 ? U.fmtMoney(inp.openValue) + ' not paid yet. ' : '') + (inp.tickets || 0) + ' ' + plural(inp.tickets, 'ticket', 'tickets') + ' on the line' },
        { id: 'late', label: 'Late tickets', value: String(late), tone: late > 0 ? 'bad' : 'good',
          sub: late > 0 ? 'Past their overdue time' : near > 0 ? 'None late, ' + near + ' close to late' : 'Nothing late' },
        { id: 'out86', label: '86 list', value: String(names.length), tone: names.length ? 'warn' : 'good',
          sub: names.length ? names.slice(0, 4).join(', ') + (names.length > 4 ? ' and ' + (names.length - 4) + ' more' : '') : 'Everything is on the menu' },
        { id: 'brisket', label: 'Brisket', value: run.tone === 'bad' ? 'None' : run.tone === 'warn' ? U.fmtTime(inp.brisket.shortfallAt) : run.tone === 'good' ? 'Lasts' : '-', tone: run.tone, sub: run.text, wide: true },
      ],
    };
  }

  O.glancePure = { runOutLine, glanceModel };
  if (!g.document) return; // Node: the pure model is all the tests need

  // ---- 2. Reading the live kitchen ----

  // Reads everything the panel shows from the live store (never sample history) and returns the model
  // input. Any part that cannot be read comes back as nothing, so the panel still draws.
  function readLive() {
    const st = SB.store, now = st.now(), state = st.getState();
    const ds = st.dataset({ sample: false }), dsh = ds.settings && ds.settings.service && isNum(ds.settings.service.dayStartHour) ? ds.settings.service.dayStartHour : U.DAY_START_HOUR;
    const today = SB.metrics.rangePresets(now, dsh)[0];
    const sales = SB.metrics.sales(ds, { from: today.from, to: today.to, now });
    const counts = st.select.counts(), out = st.select.unavailable();
    let shortfallAt = null, rateKnown = false;
    try {
      const rows = SB.deadlines.build(state, now);
      const row = rows.find((r) => r.kind === 'shortfall' && r.ing === 'brisket');
      if (row && isNum(row.at)) shortfallAt = row.at;
      rateKnown = isNum(SB.deadlines.salesRate(state, now).rate.brisket);
    } catch (e) { /* no estimate: the card then says there is not enough data */ }
    const onHandG = st.select.batches().filter((b) => b.ing === 'brisket' && b.canServe !== false && b.kind !== 'cooling' && b.remainingG > 0).reduce((a, b) => a + b.remainingG, 0);
    return { now, collected: sales.collected, paidOrders: sales.checks, openOrders: sales.open ? sales.open.orders : 0, openValue: sales.open ? sales.open.value : 0,
      tickets: counts.all, late: counts.overdue, nearLate: counts.warn, out86: out.map((x) => x.name), brisket: { onHandG, shortfallAt, rateKnown } };
  }

  // ---- 3. The panel ----

  /**
   * Draws the at-a-glance panel into host and keeps it fresh (every 5 s, and on update()).
   * opts.size: 'phone' (default, two columns) or 'wall' (big type for a screen across the room).
   * Returns {el, update(), destroy()}. destroy stops the timer and removes the panel.
   */
  O.glance = function (host, opts) {
    const h = U.h;
    const size = opts && opts.size === 'wall' ? 'wall' : 'phone';
    const root = h('section', { class: 'sb-glance', dataset: { size }, 'aria-label': 'At a glance, live kitchen' });
    const note = h('p', { class: 'sb-glance-note' }, 'Live kitchen only. Sample history is never shown here. Run-out times are estimates.');
    const grid = h('ul', { class: 'sb-glance-grid' });
    const els = {};
    root.append(grid, note);
    host.appendChild(root);
    let timer = 0, dead = false;
    // Sets text only when it changed, so a screen reader is not re-read on every refresh.
    const setText = (el, t) => { if (el.textContent !== t) el.textContent = t; };
    // Re-reads the kitchen and repaints the cards. A failure leaves the last good numbers on screen.
    function update() {
      if (dead) return;
      let m;
      try { m = glanceModel(readLive()); } catch (e) { if (g.console) console.error('[smokebox] glance failed', e); return; }
      m.cards.forEach((c) => {
        let e = els[c.id];
        if (!e) {
          e = els[c.id] = { li: h('li', { class: 'sb-g-card' + (c.wide ? ' is-wide' : ''), dataset: { id: c.id } }), l: h('span', { class: 'sb-g-l' }), v: h('span', { class: 'sb-g-v num' }), s: h('span', { class: 'sb-g-s' }) };
          e.li.append(e.l, e.v, e.s); grid.appendChild(e.li);
        }
        e.li.dataset.tone = c.tone; setText(e.l, c.label); setText(e.v, c.value); setText(e.s, c.sub);
      });
    }
    update();
    timer = g.setInterval(update, EVERY_MS);
    // Stops the refresh timer and removes the panel from the page.
    const destroy = () => { dead = true; g.clearInterval(timer); root.remove(); };
    return { el: root, update, destroy };
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
