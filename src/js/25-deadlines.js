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
  // Sales pace is trusted only with at least this many grams seen in the window; below it the pace is "no data".
  const RATE_MIN_G = 200;
  // How far back removals count (6 hours), at most how many of them, and the shortest span a pace is worked over.
  const RECENT_MS = 6 * H, MIN_SPAN_MS = 30 * MIN;
  // Pace tuning: removals closer than 15 minutes merge; dense needs 5 merged removals in 2 hours; a lone removal counts only
  // after 120 minutes since opening; the sparse span never counts for less than 90 minutes.
  const MERGE_MS = 15 * MIN, DENSE_WINDOW_MS = 2 * H, DENSE_MIN = 5, SINGLE_PULL_MS = 120 * MIN, SPARSE_FLOOR_MS = 90 * MIN;
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
  // The most recent opening time at or before now, in ms, from the service hours; null when the settings have none.
  function lastOpenAt(state, now) {
    const sv = state.settings && state.settings.service ? state.settings.service : C.service;
    if (!U.isNum(sv.openHour)) return null;
    const d = new Date(now);
    d.setHours(Math.floor(sv.openHour), Math.round((sv.openHour % 1) * 60), 0, 0);
    if (d.getTime() > now) d.setDate(d.getDate() - 1);
    return d.getTime();
  }
  // Merges removals that fall inside one 15-minute stretch (counted from the first of them) into a single event: grams
  // summed, time of the last. A burst of small items, or two pulls a few minutes apart, is one removal for pacing.
  function mergeRemovals(list) {
    const out = [];
    let start = null;
    for (const x of list.slice().sort((p, q) => p.t - q.t)) {
      if (start !== null && x.t - start < MERGE_MS) { const l = out[out.length - 1]; l.g += x.g; l.t = x.t; } else { out.push({ t: x.t, g: x.g }); start = x.t; }
    }
    return out;
  }
  // Each cooked ingredient's grams per millisecond leaving the cabinet, from finished tickets and hand pulls. A pure
  // function of the state: no memory between calls.
  //   Removals are merged (see mergeRemovals). Dense: 5 or more merged removals in the last 2 hours, the pace is the
  //   grams in that window over the time it covers (since opening if that is shorter, never under 30 minutes).
  //   Sparse: fewer, the pace is a renewal estimate, total grams over the span from the first to the latest removal plus
  //   one average interval (never under 90 minutes), which reads a lumpy cadence such as a whole brisket every 100
  //   minutes steadily. After a silence of more than two intervals (and 90 minutes) it is unknown again.
  //   A pace needs 2 removals, or 120 minutes since opening for a single removal. No removals, or too little food
  //   moved, means the pace is UNKNOWN: the ingredient is missing from `rate`, which is not the same as zero.
  // Returns { rate: {ingId: g per ms}, seenG: {ingId: grams} }.
  function salesRate(state, now) {
    const from = now - RECENT_MS, list = Object.create(null);
    // Finished items carry the grams they used; walk back from the newest tickets and stop once they are old.
    for (let i = state.tickets.length - 1; i >= 0; i--) {
      const t = state.tickets[i];
      if (t.createdAt < from - 12 * H) break;
      for (const it of t.items) {
        if (it.status !== 'done' || !(it.doneAt >= from) || !it.depleted) continue;
        for (const r of it.depleted) if (r.g > 0 && r.batchId) (list[r.ing] = list[r.ing] || []).push({ t: it.doneAt, g: r.g });
      }
    }
    for (const e of E().allEvents(state)) if (e.type === 'cabinet_pull' && e.t >= from && e.t <= now && !e.reverted) (list[e.ing] = list[e.ing] || []).push({ t: e.t, g: e.g });
    const openAt = lastOpenAt(state, now), sinceOpen = openAt == null ? 0 : now - openAt;
    const rate = Object.create(null), seen = Object.create(null);
    for (const k of Object.keys(list)) {
      const ev = mergeRemovals(list[k]);
      const total = ev.reduce((a, x) => a + x.g, 0);
      seen[k] = total;
      if (total < RATE_MIN_G) continue;
      const r = estimateRate(ev, total, now, openAt, sinceOpen);
      if (r !== undefined) rate[k] = r;
    }
    return { rate, seenG: seen };
  }
  // The pace for one ingredient from its merged removals, or undefined when unknown. See salesRate.
  function estimateRate(ev, total, now, openAt, sinceOpen) {
    const win = ev.filter((x) => x.t >= now - DENSE_WINDOW_MS);
    if (ev.length < 2 && sinceOpen < SINGLE_PULL_MS) return undefined;
    if (win.length >= DENSE_MIN) {
      const g = win.reduce((a, x) => a + x.g, 0);
      const covered = openAt == null ? now - win[0].t : Math.min(DENSE_WINDOW_MS, now - openAt);
      return g / Math.max(covered, MIN_SPAN_MS);
    }
    if (ev.length < 2) return total / Math.max(sinceOpen, SPARSE_FLOOR_MS);
    const span = ev[ev.length - 1].t - ev[0].t, mean = span / (ev.length - 1);
    // A silence longer than two intervals (and 90 minutes) is not a pace of zero: pulls may simply not be logged.
    if (now - ev[ev.length - 1].t > Math.max(2 * mean, SPARSE_FLOOR_MS)) return undefined;
    // The floor is 90 minutes, or the time since opening when that is shorter (never under 30 minutes), so a busy
    // start is not diluted by time before the doors opened.
    const floor = Math.max(MIN_SPAN_MS, Math.min(SPARSE_FLOOR_MS, openAt == null ? SPARSE_FLOOR_MS : sinceOpen));
    return total / Math.max(span + mean, floor);
  }
  // Picks the severity for a countdown: the last rung or expiry is bad, the middle rungs are warnings, and it is
  // one step worse when no other batch of that food is left to take over.
  function sevOf(rung, n, lastOne) {
    if (rung >= n) return 'bad';
    if (lastOne && rung >= 2) return 'bad';
    if (rung >= 2 || (rung >= 1 && lastOne)) return 'warn';
    return rung >= 1 ? 'warn' : 'info';
  }
  // The row for a batch that is past its quality limit: it is off the menu and waits for a taste test.
  function pastRow(state, b, now, out) {
    const ing = state.ingredients.find((x) => x.id === b.ing);
    const name = ing ? ing.name : b.ing;
    const left = state.batches.some((x) => x !== b && x.ing === b.ing && x.status !== 'discard' && x.canServe === true && x.remainingG > 0);
    const amount = U.fmtG(b.remainingG) + (U.isNum(b.costPerCookedKg) ? ' ($' + (b.remainingG / 1000 * b.costPerCookedKg).toFixed(0) + ')' : '');
    out.push({ id: 'past:' + b.id, kind: 'past', ing: b.ing, batchId: b.id, label: b.label || name, at: b.enteredAt + E()._internal.holdLimitMs(b, state.settings.safety ? Object.assign({}, C.safety, state.settings.safety) : C.safety), msLeft: 0, rung: 0, rungs: 0, sev: 'bad',
      consequence: amount + ' is past its quality limit and off the menu' + (left ? '.' : ', so ' + name + ' is 86.'), action: 'Taste it, then keep serving or discard it.', trivial: b.remainingG < TRIVIAL_G, unknown: false });
  }
  // The next closing time after now, in ms, from the service hours (a close above 24 means after midnight, so last
  // night's close can still be ahead at 12:30 am). Null once today's close has passed.
  function closeAtMs(state, now) {
    const sv = state.settings && state.settings.service ? state.settings.service : C.service;
    if (!U.isNum(sv.closeHour)) return null;
    let best = null;
    for (const day of [-1, 0]) {
      const d = new Date(now);
      d.setDate(d.getDate() + day); d.setHours(0, 0, 0, 0);
      const at = d.getTime() + sv.closeHour * H;
      if (at > now && (best == null || at < best)) best = at;
    }
    return best;
  }
  // Walks from now to close in steps between the moments something changes (a resting batch becomes ready, a
  // batch passes its limit), serving the pace from the oldest ready batch first. Returns the grams left at close in
  // batches still alive minus any demand nobody could serve (so negative means short), the first moment the
  // ready stock ran out, and the grams that passed their limit before close. Each batch is { remainingG, enteredAt,
  // readyAt, expAt }.
  function sweepToClose(batches, rate, now, closeAt) {
    const bs = batches.map((b) => ({ rem: b.remainingG, ent: b.enteredAt, ready: Math.max(now, b.readyAt || 0), exp: b.expAt })).sort((x, y) => x.ent - y.ent);
    const marks = new Set([now, closeAt]);
    for (const b of bs) for (const t of [b.ready, b.exp]) if (t > now && t < closeAt) marks.add(t);
    const times = Array.from(marks).sort((x, y) => x - y);
    let unmet = 0, runOutAt = null, wasteBefore = 0;
    for (let i = 0; i + 1 < times.length; i++) {
      const a = times[i], z = times[i + 1], dem = rate * (z - a);
      let need = dem;
      for (const b of bs) { if (need <= 0) break; if (b.rem > 0 && b.ready <= a && b.exp > a) { const take = Math.min(need, b.rem); b.rem -= take; need -= take; } }
      if (need > 1e-6) { if (runOutAt == null) runOutAt = a + (dem - need) / rate; unmet += need; }
      for (const b of bs) if (b.exp <= z && b.rem > 0) { wasteBefore += b.rem; b.rem = 0; }
    }
    const alive = bs.reduce((acc, b) => acc + (b.exp > closeAt ? b.rem : 0), 0);
    return { leftoverG: alive - unmet, runOutAt, wasteBefore };
  }
  // Whether a new batch started now would be ready before close: now + cook time + rest time against closing. Returns
  // null when the product has no cook time, else { readyAt, fits }.
  function nextBatchFit(ing, now, closeAt) {
    if (!ing || !U.isNum(ing.cookH) || !(ing.cookH > 0)) return null;
    const readyAt = now + (ing.cookH + (U.isNum(ing.restH) ? ing.restH : 0)) * H;
    return { readyAt, fits: readyAt < closeAt };
  }
  // Rows for one ingredient at the current pace: grams left over at close (waste, silent) or a shortfall (it runs out
  // early, a silent caution with what to do). Only batches that can be served count; a pull counts as sold, so
  // food already on the block is not counted.
  function closeRows(state, ing, name, list, rate, now, S, out) {
    const closeAt = closeAtMs(state, now);
    if (closeAt == null) return;
    const bs = list.filter((b) => b.canServe !== false).map((b) => {
      const hardAt = b.enteredAt + S.defaultMaxHoldH * H, limAt = b.enteredAt + E()._internal.holdLimitMs(b, S);
      const q = b.holdBasis === 'quality' && limAt < hardAt;
      return { remainingG: b.remainingG, enteredAt: b.enteredAt, readyAt: b.restUntil, expAt: q && U.isNum(b.keepUntil) && b.keepUntil > now ? Math.min(b.keepUntil, hardAt) : limAt };
    });
    if (!bs.length) return;
    const stock = bs.reduce((acc, b) => acc + b.remainingG, 0);
    const r = sweepToClose(bs, rate, now, closeAt);
    const toClose = closeAt - now;
    if (r.leftoverG >= Math.max(NOTABLE_G, NOTABLE_SHARE * stock)) {
      out.push({ id: 'leftover:' + ing.id, kind: 'leftover', ing: ing.id, label: name, at: closeAt, msLeft: toClose, rung: 0, rungs: 0, sev: 'info', leftoverG: r.leftoverG,
        consequence: 'At the current pace about ' + U.fmtG(r.leftoverG) + ' of ' + name + ' will be left at close, not counting what is already on the block.', action: 'Sell it: run a special, tell the front.', unknown: false });
    } else if (r.leftoverG <= -NOTABLE_G && r.runOutAt != null) {
      const fit = nextBatchFit(ing, now, closeAt);
      const next = !fit ? '' : fit.fits ? ' A batch started now is ready at ' + U.fmtTime(fit.readyAt) + '.' : ' A new batch would be ready at ' + U.fmtTime(fit.readyAt) + ', after close.';
      const early = closeAt - r.runOutAt;
      out.push({ id: 'shortfall:' + ing.id, kind: 'shortfall', ing: ing.id, label: name, at: r.runOutAt, msLeft: r.runOutAt - now, rung: 0, rungs: 0, sev: 'warn', leftoverG: r.leftoverG, shortG: -r.leftoverG,
        consequence: 'At the current pace ' + name + ' runs out at ' + U.fmtTime(r.runOutAt) + ', ' + hmText(early) + ' before close, about ' + U.fmtG(-r.leftoverG) + ' short.' + next,
        action: 'Shorten portions, stop preorders, run a special.' + (fit && fit.fits ? ' Start the next batch now.' : ''), nextBatch: fit, unknown: false });
    }
  }
  // A span of time in words: "45 min", "2 h 10 min".
  function hmText(ms) {
    const m = Math.max(0, Math.round(ms / MIN));
    return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h' + (m % 60 ? ' ' + m % 60 + ' min' : '');
  }
  // Rows for the cooked batches: expiry with projected waste, and run-out time, per ingredient.
  function batchRows(state, now, S, sales, out) {
    const byIng = Object.create(null);
    for (const b of state.batches) {
      if (b.status === 'discard' || !(b.remainingG > 0) || b.kind === 'cooling') continue;
      // A batch past its quality limit is off the menu: it cannot sell, so it gets its own row and no projection.
      if (b.status === 'past') { pastRow(state, b, now, out); continue; }
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
        // A quality limit is a house rule: the batch passes it and waits for a taste test. A kept batch counts down
        // to the end of its extension instead.
        const hardAt = b.enteredAt + S.defaultMaxHoldH * H, limAt = b.enteredAt + E()._internal.holdLimitMs(b, S);
        const q = b.holdBasis === 'quality' && limAt < hardAt;
        const exp = q && U.isNum(b.keepUntil) && b.keepUntil > now ? Math.min(b.keepUntil, hardAt) : limAt;
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
        const fate = q ? 'pass its quality limit' : 'be thrown out';
        if (msLeft <= 0) { consequence = 'Expired: ' + amount + ' must be thrown out' + goes86 + '.'; action = 'Discard and log it.'; }
        else if (waste == null) { consequence = 'Pace unknown (nothing pulled yet): up to ' + amount + ' may ' + (q ? 'pass its quality limit' : 'be thrown out') + goes86 + '.'; action = 'Use it first, and log pulls so the pace can be worked out.'; }
        else if (waste > 50) { consequence = 'About ' + U.fmtG(waste) + ' of ' + U.fmtG(b.remainingG) + ' will ' + fate + (usd != null ? ' ($' + usd.toFixed(0) + ')' : '') + goes86 + '.'; action = 'Sell it: run a special, tell the front.'; }
        else { consequence = 'On pace to sell all ' + U.fmtG(b.remainingG) + ' in time.'; action = 'Nothing to do.'; }
        // A batch gets a row once a rung is crossed, or earlier when the pace says food will be thrown out within 2 hours.
        if (rung >= 1 || (waste != null && waste > 50 && msLeft <= 2 * H)) {
          const quiet = rung === 0 || trivial;
          out.push({ id: 'expiry:' + b.id, kind: 'expiry', ing: ingId, batchId: b.id, label: b.label || name, at: exp, msLeft, rung, rungs: rungs.length,
            sev: quiet ? 'info' : sevOf(rung, rungs.length, lastOne), consequence, action, wasteG: waste, wasteUsd: usd, goes86: lastOne, quality: q, trivial, unknown: rate === undefined });
        }
      });
      // What is left at close, or when it runs out early, at the current pace.
      if (rate !== undefined) closeRows(state, ing, name, list, rate, now, S, out);
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
            consequence: 'A temperature reading is due at ' + U.fmtTime(due) + '.', action: 'Log a temperature.', unknown: false });
        }
        continue;
      }
      if (gt.action === 'NONE' || gt.action === 'DISCARD_LOCKOUT' || gt.action === 'PAST_QUALITY') continue;
      const at = U.isNum(gt.nextDeadlineAt) && gt.nextDeadlineAt !== Infinity ? gt.nextDeadlineAt : now;
      const kind = gt.action === 'CHECK_TEMP' ? 'check' : gt.action === 'REHEAT_IMMEDIATE' ? 'reheat' : gt.action === 'CHILL_NOW' ? 'chill' : 'cooling';
      const text = (gt.text || '').replace(' ' + C.safetyLine, '');
      out.push({ id: kind + ':' + b.id, kind, ing: b.ing, batchId: b.id, label: b.label || b.ing, at, msLeft: at - now, rung: 0, rungs: 0, sev: gt.severity === 'bad' ? 'bad' : 'warn',
        consequence: text, action: kind === 'check' ? 'Log a temperature.' : kind === 'reheat' ? 'Reheat it and log the reading.' : kind === 'chill' ? 'Chill it now.' : 'Log a reading as it cools.', unknown: false });
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
        consequence: 'Expired and thrown out: ' + U.fmtG(b.wasteG) + usd + (left ? '.' : '. ' + name + ' is 86.'), action: 'Tap to confirm it is logged.', unknown: false });
    }
  }
  // Rows for tickets and the sanitize timer.
  function otherRows(state, now, out) {
    const C0 = E().views.counts(state, now);
    if (C0.overdue > 0) out.push({ id: 'late', kind: 'late', label: 'Late tickets', at: now, msLeft: 0, rung: 0, rungs: 0, sev: 'warn',
      consequence: C0.overdue + ' ' + U.plural(C0.overdue, 'ticket is', 'tickets are') + ' past ' + U.plural(C0.overdue, 'its', 'their') + ' time limit.', action: 'Clear the oldest ticket first.', unknown: false });
    if (U.isNum(C0.sanitizeDueAt) && C0.sanitizeDueAt - now <= 15 * MIN) {
      const late = C0.sanitizeDueAt < now;
      out.push({ id: 'sanitize', kind: 'sanitize', label: 'Sanitize surfaces', at: C0.sanitizeDueAt, msLeft: C0.sanitizeDueAt - now, rung: 0, rungs: 0, sev: late && now - C0.sanitizeDueAt > 15 * MIN ? 'warn' : 'info',
        consequence: late ? 'Food-contact surfaces are overdue for sanitizing.' : 'Food-contact surfaces are due for sanitizing at ' + U.fmtTime(C0.sanitizeDueAt) + '.', action: 'Sanitize and tick it off.', unknown: false });
    }
  }
  // The hour of day (0 to 24 and a fraction) that warning sounds may start: the sound start hour, or opening if that
  // is earlier. Returns the service settings with it.
  function soundWindow(state) {
    const sv = state && state.settings && state.settings.service ? state.settings.service : C.service;
    const start = Math.min(U.isNum(sv.soundStartHour) ? sv.soundStartHour : sv.openHour, sv.openHour);
    return { start, end: sv.closeHour, all: sv.soundOutsideHours === true };
  }
  // True when warning sounds may play: from the sound start hour (opening unless set earlier) to closing, or any
  // hour when the owner allows sound outside open hours. Before that and after closing the strip still shows the
  // rows, but nothing beeps or speaks into an empty kitchen. Rungs missed while quiet sound once when it opens.
  function soundsAllowed(state, now) {
    if (!state || !U.isNum(now)) return false;
    const w = soundWindow(state);
    if (w.all) return true;
    const d = new Date(now);
    const hr = d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
    return (hr >= w.start && hr < w.end) || (hr + 24 >= w.start && hr + 24 < w.end);
  }
  // The next moment warning sounds start, or null when they may sound now.
  function nextOpenAt(state, now) {
    if (!state || !U.isNum(now) || soundsAllowed(state, now)) return null;
    const w = soundWindow(state);
    const whole = Math.floor(w.start), mins = Math.round((w.start - whole) * 60);
    for (let day = 0; day < 3; day++) {
      const d = new Date(now);
      d.setDate(d.getDate() + day); d.setHours(whole, mins, 0, 0);
      if (d.getTime() > now) return d.getTime();
    }
    return null;
  }
  // The words for the strip while sounds are paused, for example "Sound paused: kitchen closed until 11:00 am", or null.
  function pauseNote(state, now) {
    const at = nextOpenAt(state, now);
    return at == null ? null : 'Sound paused: kitchen closed until ' + U.fmtTime(at);
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
  SB.deadlines = { build, rungOf, rungsFor, salesRate, soundsAllowed, nextOpenAt, pauseNote, closeAtMs, sweepToClose, nextBatchFit };
})(typeof globalThis !== 'undefined' ? globalThis : window);
