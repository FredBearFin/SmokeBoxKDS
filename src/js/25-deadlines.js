/*
 * WHAT THIS FILE IS: The deadline feed (SB.deadlines). One list of everything about to go wrong in the kitchen,
 *    sorted by urgency, each with what happens if nobody acts and what to do. It reads the whole state and the
 *    time and changes nothing.
 * PARTS: warning rungs, sales rate, batch rows (expiry with projected waste, run-out), safety rows (checks,
 *    reheat, chill, cooling), ticket and sanitize rows, the sorted list.
 * USES: 00-util.js, 10-config.js, 20-engine.js. USED BY: the attention strip and the warning ladder in the
 *    kitchen screens.
 */
(function (g) {
  'use strict';
  const SB = (g.SB = g.SB || {});
  const U = SB.util, C = SB.config;
  const MIN = 60e3, H = 3600e3;
  // The engine, looked up each time so tests can swap it.
  const E = () => SB.engine;
  // How far back sales count toward the current pace: 90 minutes.
  const RATE_WINDOW_MS = 90 * MIN;
  // Sales pace is trusted only with at least this many grams seen in the window; below it the pace is "no data".
  const RATE_MIN_G = 200;
  // Under this many grams left a batch is not worth a sounded warning.
  const TRIVIAL_G = 300;
  // Projected waste counts as worth a sounded warning only from this many grams, or this share of the batch.
  const NOTABLE_G = 500, NOTABLE_SHARE = 0.15;
  // Ordering of severities, worst first.
  const SEV_RANK = { bad: 0, warn: 1, info: 2 };

  // Minutes-before-the-deadline at which each warning rung fires, for one ingredient. Brisket starts earlier
  // because a long cook cannot be replaced in an hour.
  function rungsFor(ingId) {
    const L = C.ladderMin || {};
    return (L.byIng && L.byIng[ingId]) || L.defaultMin || [60, 30, 10];
  }
  // Which rung a deadline is on: 0 means none yet, 1 to n means that many thresholds have been crossed, and
  // n + 1 means the deadline has passed.
  function rungOf(msLeft, rungsMin) {
    if (msLeft <= 0) return rungsMin.length + 1;
    let r = 0;
    for (const m of rungsMin) if (msLeft <= m * MIN) r++;
    return r;
  }
  // Grams per millisecond taken out of the cabinet for each cooked ingredient over the recent window, from
  // finished tickets and hand pulls. Returns { rate: {ingId: g per ms}, seenG: {ingId: grams} }.
  function salesRate(state, now) {
    const from = now - RATE_WINDOW_MS, seen = Object.create(null);
    // Finished items carry the grams they used; walk back from the newest tickets and stop once they are old.
    for (let i = state.tickets.length - 1; i >= 0; i--) {
      const t = state.tickets[i];
      if (t.createdAt < from - 12 * H) break;
      for (const it of t.items) {
        if (it.status !== 'done' || !(it.doneAt >= from) || !it.depleted) continue;
        for (const r of it.depleted) if (r.g > 0 && r.batchId) seen[r.ing] = (seen[r.ing] || 0) + r.g;
      }
    }
    for (const e of E().allEvents(state)) if (e.type === 'cabinet_pull' && e.t >= from && !e.reverted) seen[e.ing] = (seen[e.ing] || 0) + e.g;
    const rate = Object.create(null);
    for (const k of Object.keys(seen)) if (seen[k] >= RATE_MIN_G) rate[k] = seen[k] / RATE_WINDOW_MS;
    return { rate, seenG: seen };
  }
  // Picks the severity for a countdown: the last rung or expiry is bad, the middle rungs are warnings, and it is
  // one step worse when no other batch of that food is left to take over.
  function sevOf(rung, n, lastOne) {
    if (rung >= n) return 'bad';
    if (lastOne && rung >= 2) return 'bad';
    if (rung >= 2 || (rung >= 1 && lastOne)) return 'warn';
    return rung >= 1 ? 'warn' : 'info';
  }
  // Rows for the cooked batches: expiry with projected waste, and run-out time, per ingredient.
  function batchRows(state, now, S, sales, out) {
    const byIng = Object.create(null);
    for (const b of state.batches) {
      if (b.status === 'discard' || !(b.remainingG > 0) || b.kind === 'cooling') continue;
      (byIng[b.ing] = byIng[b.ing] || []).push(b);
    }
    for (const ingId of Object.keys(byIng)) {
      const ing = state.ingredients.find((x) => x.id === ingId);
      const name = ing ? ing.name : ingId;
      const list = byIng[ingId].slice().sort((a, b) => a.enteredAt - b.enteredAt);
      const rungs = rungsFor(ingId), rate = sales.rate[ingId];
      // Only batches that have finished resting can be sold, so the run-out total counts those alone.
      const isReady = (b) => !(U.isNum(b.restUntil) && b.restUntil > now);
      let soldBefore = 0, totalLeft = 0;
      for (const b of list) if (isReady(b)) totalLeft += b.remainingG;
      list.forEach((b, i) => {
        const exp = b.enteredAt + E()._internal.holdLimitMs(b, S);
        const msLeft = exp - now;
        const rung = rungOf(msLeft, rungs);
        const lastOne = list.length === 1;
        // How much of this batch the sales pace will clear before it expires, after the older batches took theirs.
        let sold = 0, waste = null;
        if (rate !== undefined) {
          // A batch that is still resting can only sell from the moment it is ready.
          const sellMs = Math.max(0, exp - Math.max(now, isReady(b) ? now : b.restUntil));
          sold = Math.max(0, Math.min(b.remainingG, rate * sellMs - soldBefore));
          waste = b.remainingG - sold;
          soldBefore += sold;
        }
        // A few hundred grams left is not worth a warning: the row still shows but never sounds.
        const trivial = b.remainingG < TRIVIAL_G || (waste != null && waste < NOTABLE_G && waste < NOTABLE_SHARE * b.remainingG);
        const usd = waste != null && U.isNum(b.costPerCookedKg) ? waste / 1000 * b.costPerCookedKg : null;
        let consequence, action;
        const amount = U.fmtG(b.remainingG) + (U.isNum(b.costPerCookedKg) ? ' ($' + (b.remainingG / 1000 * b.costPerCookedKg).toFixed(0) + ')' : '');
        const goes86 = lastOne ? ' and ' + name + ' goes 86' : '';
        if (msLeft <= 0) { consequence = 'Expired: ' + amount + ' must be thrown out' + goes86 + '.'; action = 'Discard and log it.'; }
        else if (waste == null) { consequence = amount + ' will be thrown out at expiry' + goes86 + '.'; action = 'Use it first.'; }
        else if (waste > 50) { consequence = 'About ' + U.fmtG(waste) + ' of ' + U.fmtG(b.remainingG) + ' will be thrown out' + (usd != null ? ' ($' + usd.toFixed(0) + ')' : '') + goes86 + '.'; action = 'Sell it: run a special, tell the front.'; }
        else { consequence = 'On pace to sell all ' + U.fmtG(b.remainingG) + ' in time.'; action = 'Nothing to do.'; }
        // A batch gets a row once a rung is crossed, or earlier when the pace says food will be thrown out within 2 hours.
        if (rung >= 1 || (waste != null && waste > 50 && msLeft <= 2 * H)) {
          const quiet = rung === 0 || trivial;
          out.push({ id: 'expiry:' + b.id, kind: 'expiry', ing: ingId, batchId: b.id, label: b.label || name, at: exp, msLeft, rung, rungs: rungs.length,
            sev: quiet ? 'info' : sevOf(rung, rungs.length, lastOne), consequence, action, wasteG: waste, wasteUsd: usd, goes86: lastOne, trivial, guess: rate === undefined });
        }
      });
      // Run-out: when the whole stock of this item will be gone at the current pace.
      if (rate !== undefined && totalLeft > 0) {
        const ms = totalLeft / rate;
        if (ms <= 2 * H) {
          const at = now + ms;
          out.push({ id: 'runout:' + ingId, kind: 'runout', ing: ingId, label: name, at, msLeft: ms, rung: 0, rungs: 0, sev: ms <= 30 * MIN ? 'warn' : 'info',
            consequence: name + ' runs out at ' + U.fmtTime(at) + ' at the current pace (' + U.fmtG(totalLeft) + ' left).', action: 'Start the next batch now if there is one coming.', guess: false });
        }
      }
    }
  }
  // Rows for food-safety gates: a temperature check due, a reheat or chill decision, a cooling stage.
  function safetyRows(state, now, S, out) {
    for (const b of state.batches) {
      if (b.status === 'discard' || !(b.remainingG > 0)) continue;
      const gt = E().gate(b, now, S);
      if (gt.action === 'NONE' && !(b.kind === 'cooling')) {
        const due = gt.nextDeadlineAt;
        if (U.isNum(due) && due !== Infinity && due - now <= 15 * MIN && b.enteredAt + E()._internal.holdLimitMs(b, S) > due) {
          out.push({ id: 'check:' + b.id, kind: 'check', ing: b.ing, batchId: b.id, label: b.label || b.ing, at: due, msLeft: due - now, rung: 0, rungs: 0, sev: 'info',
            consequence: 'A temperature reading is due at ' + U.fmtTime(due) + '.', action: 'Log a temperature.', guess: false });
        }
        continue;
      }
      if (gt.action === 'NONE' || gt.action === 'DISCARD_LOCKOUT') continue;
      const at = U.isNum(gt.nextDeadlineAt) && gt.nextDeadlineAt !== Infinity ? gt.nextDeadlineAt : now;
      const kind = gt.action === 'CHECK_TEMP' ? 'check' : gt.action === 'REHEAT_IMMEDIATE' ? 'reheat' : gt.action === 'CHILL_NOW' ? 'chill' : 'cooling';
      const text = (gt.text || '').replace(' ' + C.safetyLine, '');
      out.push({ id: kind + ':' + b.id, kind, ing: b.ing, batchId: b.id, label: b.label || b.ing, at, msLeft: at - now, rung: 0, rungs: 0, sev: gt.severity === 'bad' ? 'bad' : 'warn',
        consequence: text, action: kind === 'check' ? 'Log a temperature.' : kind === 'reheat' ? 'Reheat it and log the reading.' : kind === 'chill' ? 'Chill it now.' : 'Log a reading as it cools.', guess: false });
    }
  }
  // Rows for batches that expired and were thrown out in the last 30 minutes, so the loss is not silent.
  function expiredRows(state, now, out) {
    for (const b of state.batches) {
      if (b.status !== 'discard' || b.discardReason !== 'expired' || !U.isNum(b.discardedAt) || now - b.discardedAt > 30 * MIN || !(b.wasteG >= TRIVIAL_G)) continue;
      const ing = state.ingredients.find((x) => x.id === b.ing);
      const name = ing ? ing.name : b.ing;
      const left = state.batches.some((x) => x.ing === b.ing && x.status !== 'discard' && x.remainingG > 0 && x.kind !== 'cooling');
      const usd = U.isNum(b.costPerCookedKg) && b.wasteG > 0 ? ' ($' + (b.wasteG / 1000 * b.costPerCookedKg).toFixed(0) + ')' : '';
      out.push({ id: 'expired:' + b.id, kind: 'expired', ing: b.ing, batchId: b.id, label: b.label || name, at: b.discardedAt, msLeft: b.discardedAt - now, rung: 0, rungs: 0, sev: 'bad',
        consequence: 'Expired and thrown out: ' + U.fmtG(b.wasteG) + usd + (left ? '.' : '. ' + name + ' is 86.'), action: 'Tap to confirm it is logged.', guess: false });
    }
  }
  // Rows for tickets and the sanitize timer.
  function otherRows(state, now, out) {
    const C0 = E().views.counts(state, now);
    if (C0.overdue > 0) out.push({ id: 'late', kind: 'late', label: 'Late tickets', at: now, msLeft: 0, rung: 0, rungs: 0, sev: 'warn',
      consequence: C0.overdue + ' ' + U.plural(C0.overdue, 'ticket is', 'tickets are') + ' past ' + U.plural(C0.overdue, 'its', 'their') + ' time limit.', action: 'Clear the oldest ticket first.', guess: false });
    if (U.isNum(C0.sanitizeDueAt) && C0.sanitizeDueAt - now <= 15 * MIN) {
      const late = C0.sanitizeDueAt < now;
      out.push({ id: 'sanitize', kind: 'sanitize', label: 'Sanitize surfaces', at: C0.sanitizeDueAt, msLeft: C0.sanitizeDueAt - now, rung: 0, rungs: 0, sev: late && now - C0.sanitizeDueAt > 15 * MIN ? 'warn' : 'info',
        consequence: late ? 'Food-contact surfaces are overdue for sanitizing.' : 'Food-contact surfaces are due for sanitizing at ' + U.fmtTime(C0.sanitizeDueAt) + '.', action: 'Sanitize and tick it off.', guess: false });
    }
  }
  // True when warning sounds may play: the kitchen is open. Before opening and after closing the strip still
  // shows the rows, but nothing beeps or speaks into an empty kitchen. Rungs missed while closed sound once at opening.
  function soundsAllowed(state, now) {
    if (!state || !U.isNum(now)) return false;
    const sv = state.settings && state.settings.service ? state.settings.service : C.service;
    const d = new Date(now);
    const hr = d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
    return (hr >= sv.openHour && hr < sv.closeHour) || (hr + 24 >= sv.openHour && hr + 24 < sv.closeHour);
  }
  // Builds the feed: every deadline worth showing right now, worst first. Each row has id, kind, label, at,
  // msLeft, rung, sev (bad, warn, info), consequence and action. Batch rows also carry projected waste.
  function build(state, now) {
    const out = [];
    if (!state || !U.isNum(now)) return out;
    const S = state.settings && state.settings.safety ? Object.assign({}, C.safety, state.settings.safety) : C.safety;
    const sales = salesRate(state, now);
    batchRows(state, now, S, sales, out);
    safetyRows(state, now, S, out);
    expiredRows(state, now, out);
    otherRows(state, now, out);
    out.sort((a, b) => (SEV_RANK[a.sev] - SEV_RANK[b.sev]) || (a.msLeft - b.msLeft) || (a.id < b.id ? -1 : 1));
    return out;
  }
  // Public API: build(state, now) gives the sorted feed; rungOf, rungsFor and soundsAllowed are shared with the sound ladder.
  SB.deadlines = { build, rungOf, rungsFor, salesRate, soundsAllowed };
})(typeof globalThis !== 'undefined' ? globalThis : window);
