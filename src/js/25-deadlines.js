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

  // Minutes-before-the-deadline at which each warning rung fires, for one ingredient: the owner's list from the settings
  // (settings.alerts.ladderThresholds, when given), else the built-in one. Brisket starts earlier because a long cook
  // cannot be replaced in an hour. The settings argument is optional.
  function rungsFor(ingId, settings) {
    const o = settings && settings.alerts ? settings.alerts.ladderThresholds : null;
    if (o) { if (o.byIng && o.byIng[ingId]) return o.byIng[ingId]; if (o.default) return o.default; }
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
    out.push({ id: 'past:' + b.id + ':' + (U.isNum(b.keepUntil) ? b.keepUntil : 0), epoch: U.isNum(b.keepUntil) ? b.keepUntil : 0, kind: 'past', step: 'last', ing: b.ing, batchId: b.id, label: b.label || name, at: b.enteredAt + E()._internal.holdLimitMs(b, state.settings.safety ? Object.assign({}, C.safety, state.settings.safety) : C.safety), msLeft: 0, rung: 0, rungs: 0, sev: 'bad',
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
  // batch passes its limit), serving the pace from the oldest ready batch first. Each batch is { remainingG,
  // enteredAt, readyAt, expAt, id?, quality? }. Returns two separate numbers, since either can matter and one
  // ingredient can have both: leftoverG (grams in batches still alive at close) and unmetG (demand nobody could
  // serve). Also runOutAt (the first moment demand went unserved), runOutCause ('rest-gap' when a batch is still
  // resting and ready later, gapEndAt; 'limit' when a batch passing its limit ended the supply, limitBatchId and
  // limitQuality; else 'stock'), and wasteBefore (grams that passed their limit before close).
  function sweepToClose(batches, rate, now, closeAt) {
    const bs = batches.map((b) => ({ rem: b.remainingG, ent: b.enteredAt, ready: Math.max(now, b.readyAt || 0), exp: b.expAt, id: b.id, quality: !!b.quality })).sort((x, y) => x.ent - y.ent);
    const marks = new Set([now, closeAt]);
    for (const b of bs) for (const t of [b.ready, b.exp]) if (t > now && t < closeAt) marks.add(t);
    const times = Array.from(marks).sort((x, y) => x - y);
    let unmet = 0, gapUnmet = 0, runOutAt = null, wasteBefore = 0, cause = null, gapEndAt = null, limitBatchId = null, limitQuality = false, lastLimit = null;
    for (let i = 0; i + 1 < times.length; i++) {
      const a = times[i], z = times[i + 1], dem = rate * (z - a);
      let need = dem;
      for (const b of bs) { if (need <= 0) break; if (b.rem > 0 && b.ready <= a && b.exp > a) { const take = Math.min(need, b.rem); b.rem -= take; need -= take; } }
      if (need > 1e-6) {
        if (runOutAt == null) {
          runOutAt = a + (dem - need) / rate;
          const gap = bs.filter((b) => b.rem > 0 && b.ready > runOutAt && b.ready < closeAt && b.exp > b.ready).sort((x, y) => x.ready - y.ready)[0];
          if (gap) { cause = 'rest-gap'; gapEndAt = gap.ready; }
          else if (lastLimit && Math.abs(lastLimit.exp - runOutAt) < 1000) { cause = 'limit'; limitBatchId = lastLimit.id; limitQuality = lastLimit.quality; }
          else cause = 'stock';
        }
        unmet += need;
        if (cause === 'rest-gap' && z <= gapEndAt) gapUnmet += need;
      }
      for (const b of bs) if (b.exp <= z && b.rem > 0) { wasteBefore += b.rem; b.rem = 0; if (!lastLimit || b.exp >= lastLimit.exp) lastLimit = { exp: b.exp, id: b.id, quality: b.quality }; }
    }
    const alive = bs.reduce((acc, b) => acc + (b.exp > closeAt ? b.rem : 0), 0);
    return { leftoverG: alive, unmetG: unmet, gapUnmetG: gapUnmet, runOutAt, runOutCause: cause, gapEndAt, limitBatchId, limitQuality, wasteBefore };
  }
  // Whether a new batch started now would be ready before close: now + cook time + rest time against closing. Returns
  // null when the product has no cook time, else { readyAt, fits }.
  function nextBatchFit(ing, now, closeAt) {
    if (!ing || !U.isNum(ing.cookH) || !(ing.cookH > 0)) return null;
    const readyAt = now + (ing.cookH + (U.isNum(ing.restH) ? ing.restH : 0)) * H;
    return { readyAt, fits: readyAt < closeAt };
  }
  // The sweep to close for one ingredient at the current pace, or null (closed, nothing servable). Only batches that
  // can be served count; a pull counts as sold, so food already on the block is not counted.
  function closeInfo(state, ing, list, rate, now, S) {
    const closeAt = closeAtMs(state, now);
    if (closeAt == null) return null;
    const bs = list.filter((b) => b.canServe !== false).map((b) => {
      const hardAt = b.enteredAt + (U.isNum(S.hardCapH) ? S.hardCapH : S.defaultMaxHoldH) * H, limAt = b.enteredAt + E()._internal.holdLimitMs(b, S);
      const q = b.holdBasis === 'quality' && limAt < hardAt;
      return { id: b.id, quality: q, remainingG: b.remainingG, enteredAt: b.enteredAt, readyAt: b.restUntil, expAt: q && U.isNum(b.keepUntil) && b.keepUntil > now ? Math.min(b.keepUntil, hardAt) : limAt };
    });
    if (!bs.length) return null;
    // Planned batches are supply from the moment they have rested. They are not stock, so they stay out of the stock total.
    const stock0 = bs.reduce((acc, b) => acc + b.remainingG, 0);
    for (const e of state.planned || []) {
      if (e.ing !== ing.id || now >= e.readyAt + 2 * H) continue;
      bs.push({ id: 'plan:' + e.id, quality: false, remainingG: e.grams, enteredAt: e.offAt, readyAt: e.readyAt, expAt: e.offAt + E()._internal.holdLimitMs({ maxHoldH: ing.maxHoldH }, S) });
    }
    return { closeAt, stock: stock0, r: sweepToClose(bs, rate, now, closeAt) };
  }
  // What to do about a run-out at runOutAt: start a new batch by a time that is still ahead, or say it is too late.
  // Null when the product has no cook time. The text never counts anything still on the smoker.
  function startBy(ing, now, runOutAt, unmetG) {
    if (!ing || !U.isNum(ing.cookH) || !(ing.cookH > 0)) return null;
    const latest = runOutAt - (ing.cookH + (U.isNum(ing.restH) ? ing.restH : 0)) * H;
    if (latest > now) return { ahead: true, latestStart: latest, text: 'Start the next batch by ' + U.fmtTime(latest) + ', not counting anything still on the smoker.' };
    return { ahead: false, latestStart: latest, text: 'Too late for a new batch to cover it: about ' + U.fmtG(unmetG) + ' of demand with nothing to sell. Shorten portions, stop preorders, run a special.' };
  }
  // Rows for one ingredient from its close sweep: grams left over at close (waste, silent) and demand with nothing to
  // sell (a silent caution with what to do). Either can raise a row. A shortfall that a quality limit causes has no row
  // of its own: the batch's expiry row says it and carries the start-by line.
  function closeRows(info, ing, name, now, out) {
    if (!info) return;
    const { closeAt, stock, r } = info;
    if (r.leftoverG >= Math.max(NOTABLE_G, NOTABLE_SHARE * stock)) {
      out.push({ id: 'leftover:' + ing.id, kind: 'leftover', ing: ing.id, label: name, at: closeAt, msLeft: closeAt - now, rung: 0, rungs: 0, sev: 'info', leftoverG: r.leftoverG,
        consequence: 'At the current pace about ' + U.fmtG(r.leftoverG) + ' of ' + name + ' will be left at close, not counting what is already on the block.', action: 'Sell it: run a special, tell the front.', unknown: false });
    }
    if ((r.runOutCause === 'rest-gap' ? r.gapUnmetG : r.unmetG) < NOTABLE_G || r.runOutAt == null || (r.runOutCause === 'limit' && r.limitQuality)) return;
    let consequence, action, sb = null;
    if (r.runOutCause === 'rest-gap') {
      consequence = 'At the current pace ' + name + ' runs out at ' + U.fmtTime(r.runOutAt) + ', next batch ready at ' + U.fmtTime(r.gapEndAt) + ', about ' + U.fmtG(r.gapUnmetG) + ' of demand with nothing to sell in between.';
      action = 'Shorten portions, stop preorders, run a special until then.';
    } else {
      sb = startBy(ing, now, r.runOutAt, r.unmetG);
      const verb = r.runOutCause === 'limit' ? ' is thrown out at ' : ' runs out at ';
      consequence = 'At the current pace ' + name + verb + U.fmtTime(r.runOutAt) + '.' + (sb && !sb.ahead ? ' ' + sb.text.split(' Shorten')[0] : sb ? '' : ' About ' + U.fmtG(r.unmetG) + ' of demand will have nothing to sell.');
      action = sb && sb.ahead ? sb.text : 'Shorten portions, stop preorders, run a special.';
    }
    out.push({ id: 'shortfall:' + ing.id, kind: 'shortfall', ing: ing.id, label: name, at: r.runOutAt, msLeft: r.runOutAt - now, rung: 0, rungs: 0, sev: 'warn', leftoverG: r.leftoverG, shortG: r.unmetG, unmetG: r.runOutCause === 'rest-gap' ? r.gapUnmetG : r.unmetG,
      runOutCause: r.runOutCause, gapEndAt: r.gapEndAt, startBy: sb ? sb.latestStart : null, planFor: { ing: ing.id, grams: r.runOutCause === 'rest-gap' ? r.gapUnmetG : r.unmetG, by: r.runOutAt }, consequence, action, unknown: false });
  }
  // A span of time in words: "45 min", "2 h 10 min".
  function hmText(ms) {
    const m = Math.max(0, Math.round(ms / MIN));
    return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h' + (m % 60 ? ' ' + m % 60 + ' min' : '');
  }
  // When a batch's early warnings are put off until, or 0 when they are not.
  function snoozeOf(state, batchId, now) { const t = state.alertSnoozes ? state.alertSnoozes[batchId] : 0; return U.isNum(t) && t > now ? t : 0; }
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
      const rungs = rungsFor(ingId, state.settings), rate = sales.rate[ingId];
      // Only batches that have finished resting can be sold, so the run-out total counts those alone.
      const isReady = (b) => !(U.isNum(b.restUntil) && b.restUntil > now);
      let soldBefore = 0, totalLeft = 0;
      for (const b of list) if (isReady(b)) totalLeft += b.remainingG;
      // The close sweep first: a quality limit that ends the supply is told in that batch's own expiry row.
      const ci = rate !== undefined ? closeInfo(state, ing, list, rate, now, S) : null;
      const lim = ci && ci.r.runOutCause === 'limit' && ci.r.limitQuality && ci.r.unmetG >= NOTABLE_G ? ci.r : null;
      const limSb = lim ? startBy(ing, now, lim.runOutAt, lim.unmetG) : null;
      list.forEach((b, i) => {
        // A quality limit is a house rule: the batch passes it and waits for a taste test. A kept batch counts down
        // to the end of its extension instead.
        const hardAt = b.enteredAt + (U.isNum(S.hardCapH) ? S.hardCapH : S.defaultMaxHoldH) * H, limAt = b.enteredAt + E()._internal.holdLimitMs(b, S);
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
        const isLim = !!lim && lim.limitBatchId === b.id;
        if (isLim) {
          consequence = name + ' passes its quality limit at ' + U.fmtTime(exp) + ', with about ' + U.fmtG(lim.unmetG) + ' of demand after it' + (waste != null && waste > 50 ? ' and about ' + U.fmtG(waste) + ' of this batch unsold' : '') + '.';
          action = limSb ? limSb.text : 'Shorten portions, stop preorders, run a special.';
        }
        if (rung >= 1 || (waste != null && waste > 50 && msLeft <= 2 * H) || isLim) {
          const quiet = rung === 0 || trivial;
          out.push({ id: 'expiry:' + b.id + ':' + (q && U.isNum(b.keepUntil) && b.keepUntil > now ? b.keepUntil : 0), epoch: q && U.isNum(b.keepUntil) && b.keepUntil > now ? b.keepUntil : 0, kind: 'expiry', ing: ingId, batchId: b.id, label: b.label || name, at: exp, msLeft, rung, rungs: rungs.length, rungsMin: rungs, step: rung >= rungs.length ? 'last' : rung <= 1 ? 'first' : 'middle', snoozedUntil: snoozeOf(state, b.id, now),
            sev: quiet ? 'info' : sevOf(rung, rungs.length, lastOne), consequence, action, planFor: isLim ? { ing: ingId, grams: lim.unmetG, by: lim.runOutAt } : undefined, wasteG: waste, wasteUsd: usd, goes86: lastOne, quality: q, trivial, unknown: rate === undefined });
        }
      });
      // What is left at close, or when it runs out early, at the current pace.
      closeRows(ci, ing, name, now, out);
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
      out.push({ id: 'expired:' + b.id + ':0', epoch: 0, kind: 'expired', step: 'last', ing: b.ing, batchId: b.id, label: b.label || name, at: b.discardedAt, msLeft: b.discardedAt - now, rung: 0, rungs: 0, sev: 'bad',
        consequence: 'Expired and thrown out: ' + U.fmtG(b.wasteG) + usd + (left ? '.' : '. ' + name + ' is 86.'), action: 'Tap to confirm it is logged.', unknown: false });
    }
  }
  // Rows for batches that are being kept serving: shown from 15 minutes before the extension ends, or when the last
  // reading is older than the check interval, to say what is needed to keep it longer. Information only: no sound.
  function keepRows(state, now, S, out) {
    for (const b of state.batches) {
      if (b.status === 'discard' || !U.isNum(b.keepUntil) || !(b.keepUntil > now)) continue;
      const stale = !U.isNum(b.lastTempAt) || now - b.lastTempAt > S.tempCheckEveryMin * MIN;
      if (b.keepUntil - now > 15 * MIN && !stale) continue;
      const cold = b.kind === 'cold';
      const need = cold ? S.coldHoldF + ' °F or lower' : S.hotHoldF + ' °F or higher';
      out.push({ id: 'keepcheck:' + b.id + ':' + b.keepUntil, epoch: b.keepUntil, kind: 'keepcheck', ing: b.ing, batchId: b.id, label: b.label || b.ing, at: b.keepUntil, msLeft: b.keepUntil - now, rung: 0, rungs: 0, sev: 'info',
        consequence: 'Kept serving until ' + U.fmtTime(b.keepUntil) + '. Log a temperature of ' + need + ' before then to keep it longer.', action: 'Log a temperature.', unknown: false });
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
  // How long a loud tone waits before repeating while nobody has tapped the row: 20 seconds of kitchen time.
  const LOUD_REPEAT_MS = 20e3;
  // Ladder memory entries older than this (kitchen time) are dropped.
  const LADDER_KEEP_MS = 24 * H;
  // The warning ladder as a pure object, so it can be tested without a screen. It remembers, per deadline id, the
  // rung already announced, the rung a person acknowledged by tapping, and when the loud tone last played.
  //   decide(feed, now, state) returns the sounds due right now as [{ level, d, repeat }] (level 1 chime, 2 voice,
  //   3 loud tone, 4 expiry or past) and updates the memory. now is kitchen time (the app clock), so the loud-tone
  //   spacing follows the same clock as everything else.
  //   A row whose id carries a new epoch (a keep that changed keepUntil) starts a fresh entry with every rung
  //   already crossed marked announced and acknowledged, so tapping "keep serving" never beeps by itself; the later
  //   rungs, the end of the extension and each lapse sound as usual. Past and expired notices always sound once.
  //   Entries for batches that are gone, and entries older than 24 hours, are dropped.
  function makeLadder() {
    const memory = new Map();
    // Decides the sound for one deadline row, or null. The memory per row keeps the smallest threshold (in minutes) that
    // has been announced, so editing the ladder mid-countdown cannot replay or degrade a warning. Which sound a rung
    // makes follows its place in the list: the first of several is a chime, the ones between are voice calls, the last
    // is the loud tone with speech (a one-rung list is just the loud tone).
    function one(d, now) {
      let st = memory.get(d.id);
      if (d.kind === 'expired' || d.kind === 'past') {
        if (st) return null;
        memory.set(d.id, { minAnn: 0, ack: false, loudAt: -Infinity, batchId: d.batchId, born: now, sig: '' });
        return d.trivial ? null : { level: 4, d, repeat: false };
      }
      if (d.kind !== 'expiry' || d.rung < 1) return null;
      const R = Array.isArray(d.rungsMin) && d.rungsMin.length ? d.rungsMin : rungsFor(d.ing);
      const sig = R.join(',');
      const fresh = !st;
      if (fresh) { st = { minAnn: Infinity, ack: false, loudAt: -Infinity, batchId: d.batchId, born: now, sig }; memory.set(d.id, st); }
      const crossed = R.filter((m) => d.msLeft <= m * MIN);
      const cur = crossed.length ? Math.min.apply(null, crossed) : Infinity;
      const lastMin = R[R.length - 1];
      // No sound when it is on pace to sell out in time, or when almost nothing is left in the batch.
      if (d.trivial || (U.isNum(d.wasteG) && d.wasteG <= 50)) { st.minAnn = Math.min(st.minAnn, cur); st.sig = sig; return null; }
      // A new extension epoch: everything already crossed counts as announced.
      if (fresh && d.epoch) { st.minAnn = cur; st.ack = true; return null; }
      // The thresholds were edited since this row was last looked at: rungs already crossed count as announced, except the last, which always sounds in full.
      if (st.sig !== sig) {
        st.sig = sig;
        const earlier = crossed.filter((m) => m !== lastMin);
        if (earlier.length) st.minAnn = Math.min(st.minAnn, Math.min.apply(null, earlier));
      }
      // At the very limit the batch is still alive for one more tick; its own past or expired row sounds next, so this one stays quiet (else the same moment sounds twice).
      if (d.msLeft <= 0) { st.minAnn = Math.min(st.minAnn, cur); return null; }
      const last = cur === lastMin;
      if (cur < st.minAnn) {
        // Put off with "remind me later": the chime and voice rungs wait (and sound when the time is up); the last rung never does.
        if (d.snoozedUntil > now && !last) return null;
        st.minAnn = cur; st.ack = false;
        if (last) { st.loudAt = now; return { level: 3, d, repeat: false }; }
        if (R.indexOf(cur) >= 1) return { level: 2, d, repeat: false };
        // With no pace to show waste, the first (soft) rung stays silent: it would chime for food that may sell.
        return d.unknown ? null : { level: 1, d, repeat: false };
      }
      if (last && !st.ack && now - st.loudAt >= LOUD_REPEAT_MS) { st.loudAt = now; return { level: 3, d, repeat: true }; }
      return null;
    }
    // Drops entries for batches that no longer exist and entries older than 24 hours of kitchen time.
    function prune(state, now) {
      const alive = new Set(state && Array.isArray(state.batches) ? state.batches.map((b) => b.id) : []);
      for (const [id, st] of memory) if ((state && st.batchId && !alive.has(st.batchId)) || now - st.born > LADDER_KEEP_MS) memory.delete(id);
    }
    return {
      memory,
      decide(feed, now, state) { prune(state, now); const calls = []; for (const d of feed) { const c = one(d, now); if (c) calls.push(c); } return calls; },
      // A tap on a row counts as seeing it: the loud tone stops until the next rung.
      acknowledge(id) { const st = memory.get(id); if (st) st.ack = st.minAnn < Infinity; },
      // True when the row has been acknowledged.
      isAcked(id) { const st = memory.get(id); return !!(st && st.ack); },
      size: () => memory.size,
    };
  }
  // Which tab makes the sound when the lock service is missing: from the hellos heard (and this tab), the visible tab wins,
  // then the lowest tab id, among tabs that can make sound. A tab not heard from for 15 seconds is gone. hellos:
  // [{ tab, visible, eligible, t }]; the answer is true when selfId is the one.
  function electLeader(hellos, now, selfId) {
    const live = (hellos || []).filter((x) => x && x.eligible && (x.tab === selfId || now - x.t <= 15000));
    if (!live.some((x) => x.tab === selfId)) return false;
    live.sort((a, b) => ((b.visible ? 1 : 0) - (a.visible ? 1 : 0)) || (a.tab < b.tab ? -1 : a.tab > b.tab ? 1 : 0));
    return live[0].tab === selfId;
  }
  // The sounds a follower tab held back, so a sound is not lost when the tab that should have played it goes away.
  //   add(call) keeps one (key: row id, level and epoch); played(keys) forgets what the leader played; forget(id) forgets a
  //   row someone acknowledged; drain(feed, isAcked) returns the one strongest call that is still true now (its row is
  //   still in the feed, not acknowledged, and for warnings the batch is not past its time) and empties the queue.
  function makePending() {
    const q = new Map(), done = new Map();
    // The key that names one held sound: its row, its level and its keep epoch.
    const keyOf = (c) => c.d.id + ':' + c.level + ':' + (c.d.epoch || 0);
    return {
      // A sound the leader already played (its message can arrive before this tab has even decided) is not held back.
      add(c, now) { const t = U.isNum(now) ? now : Date.now(), k = keyOf(c); if (done.has(k) && t - done.get(k) < 60000) return; q.set(k, c); },
      played(keys, now) { const t = U.isNum(now) ? now : Date.now(); for (const k of keys || []) { q.delete(k); done.set(k, t); } if (done.size > 200) for (const [k, v] of done) if (t - v > 60000) done.delete(k); },
      // Forgets every held sound for one row (someone acknowledged it).
      forget(id) { for (const k of Array.from(q.keys())) if (q.get(k).d.id === id) q.delete(k); },
      // Takes what is still true out of the queue: the one strongest sound, or nothing.
      drain(feed, isAcked) {
        const live = new Map((feed || []).map((d) => [d.id, d]));
        const ok = Array.from(q.values()).filter((c) => { const d = live.get(c.d.id); return d && (d.epoch || 0) === (c.d.epoch || 0) && !isAcked(d.id) && (c.level === 4 || d.msLeft > 0); });
        q.clear();
        if (!ok.length) return [];
        ok.sort((a, b) => (b.level - a.level) || (a.d.msLeft - b.d.msLeft));
        return [{ level: ok[0].level, d: live.get(ok[0].d.id), repeat: false }];
      },
      // Says how many sounds are being held back right now.
      size: () => q.size,
    };
  }
  // Voice call-outs: a short spoken line for a new ticket and for "start this dish now" when a dish's planned start
  // (fireAt) arrives. Nothing here speaks; it only works out what is worth saying and in what order.

  // A call older than this (45 s) is stale and dropped instead of read out late; at most this many calls wait (6).
  const CALL_STALE_MS = 45e3, CALL_MAX_WAIT = 6;
  // A dish name made speakable: the short name, with the abbreviation dot spelled out.
  const spokenName = (it) => String(it.short || it.name || 'item').replace(/ sand\.$/, ' sandwich');
  // Joins up to three dishes ("2 brisket, ribs and 1 more") for a spoken line.
  function nameList(items) {
    const bits = items.slice(0, 3).map((it) => (it.qty > 1 ? it.qty + ' ' : '') + spokenName(it));
    return bits.join(', ') + (items.length > 3 ? ' and ' + (items.length - 3) + ' more' : '');
  }
  // Every call that is true right now for one station tab: { id, kind, at, text, ticketNum }. kind is "new" (a ticket
  // arrived) or "start" (a dish's start time has come). zone is "all", a station id, or "expo" (new tickets only).
  // WATCH OUT: a station only gets calls for its own dishes; a ticket with nothing for it makes no call.
  function calloutWants(state, now, zone) {
    const out = [];
    if (!state || !Array.isArray(state.tickets) || !U.isNum(now)) return out;
    const z = zone || 'all';
    for (const t of state.tickets) {
      if (t.status !== 'active' || !Array.isArray(t.items)) continue;
      const mine = t.items.filter((it) => (z === 'all' || z === 'expo' || it.zone === z) && it.status !== 'done');
      if (!mine.length) continue;
      const text = z === 'all' || z === 'expo' ? 'New ticket ' + t.num + ', ' + t.items.length + ' ' + U.plural(t.items.length, 'item') + '.' : 'New ticket ' + t.num + ': ' + nameList(mine) + '.';
      out.push({ id: 'n:' + t.id, kind: 'new', at: t.createdAt, text, ticketNum: t.num });
      if (z === 'expo') continue;
      for (const it of mine) {
        // A dish whose start time came later than the ticket (paced) and is now due and not yet started.
        const due = it.status === 'displayed' || (it.status === 'queued' && it.fireAt <= now);
        if (!due || !(it.fireAt - t.createdAt > 1000)) continue;
        out.push({ id: 's:' + it.id, kind: 'start', at: it.fireAt, text: 'Start ' + (it.qty > 1 ? it.qty + ' ' : '') + spokenName(it) + ' now. Ticket ' + t.num + '.', ticketNum: t.num });
      }
    }
    return out;
  }
  // The waiting line of calls. sync(wants, now) takes the calls that are true now: new ones join, ones no longer true
  // (bumped, started) and ones older than the stale limit leave, and only the newest few are kept. next(now) hands out
  // the oldest call still fresh, or null. prime(wants) marks what is already true as heard, for a fresh start.
  function makeCallouts(o) {
    const staleMs = o && U.isNum(o.staleMs) ? o.staleMs : CALL_STALE_MS, maxWait = o && U.isNum(o.maxWait) ? o.maxWait : CALL_MAX_WAIT;
    const seen = new Set(), q = [];
    let dropped = 0;
    // Remembers a call id as handled; the memory is trimmed to the latest 600.
    const mark = (id) => { seen.add(id); if (seen.size > 600) seen.delete(seen.values().next().value); };
    return {
      // Marks the calls true right now as already heard and empties the waiting line.
      prime(wants) { q.length = 0; (wants || []).forEach((w) => mark(w.id)); },
      // Brings the waiting line in step with what is true now; drops gone, stale and surplus calls.
      sync(wants, now) {
        const live = new Set(wants.map((w) => w.id));
        for (let i = q.length - 1; i >= 0; i--) if (!live.has(q[i].id) || now - q[i].at > staleMs) { q.splice(i, 1); dropped++; }
        for (const w of wants) {
          if (seen.has(w.id)) continue;
          mark(w.id);
          if (now - w.at > staleMs) { dropped++; continue; }
          q.push(w);
        }
        q.sort((a, b) => (a.at - b.at) || (a.id < b.id ? -1 : 1));
        while (q.length > maxWait) { q.shift(); dropped++; }
      },
      // Hands out the oldest call that is still fresh, or null when none is left.
      next(now) {
        while (q.length) { const c = q.shift(); if (now - c.at <= staleMs) return c; dropped++; }
        return null;
      },
      // How many calls are waiting to be spoken right now.
      size: () => q.length,
      // How many calls were thrown away unspoken, for tests and the pilot notes.
      dropped: () => dropped,
    };
  }
  // Wall mode, orders pane: the open orders (oldest first, with rounds and total) and the orders paid on this service
  // day (newest first), plus how many were paid. Reads the state and changes nothing.
  function wallOrders(state, now) {
    const out = { paidCount: 0, open: [], paid: [] };
    if (!state || !U.isNum(now)) return out;
    const day = U.serviceDate(now, state.settings && state.settings.service ? state.settings.service.dayStartHour : undefined);
    const totals = E().openOrderTotals(state);
    for (const o of Array.isArray(state.orders) ? state.orders : []) {
      const t = totals.get(o.id);
      if (o.status === 'open') out.open.push({ id: o.id, name: o.customer, rounds: t ? t.rounds : 0, total: t ? t.total : 0, at: o.createdAt });
      else if (o.status === 'paid' && o.serviceDate === day && o.totals) { out.paidCount++; out.paid.push({ id: o.id, name: o.customer, total: o.totals.total, method: o.method, at: o.paidAt }); }
    }
    out.open.sort((a, b) => a.at - b.at);
    out.paid.sort((a, b) => b.at - a.at);
    return out;
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
    keepRows(state, now, S, out);
    otherRows(state, now, out);
    // Rows whose reminder was put off come after the others of the same severity, so they do not take a strip slot from a live one.
    out.sort((a, b) => (SEV_RANK[a.sev] - SEV_RANK[b.sev]) || ((a.snoozedUntil ? 1 : 0) - (b.snoozedUntil ? 1 : 0)) || (a.msLeft - b.msLeft) || (a.id < b.id ? -1 : 1));
    return out;
  }
  // Public API: build(state, now) gives the sorted feed; rungOf, rungsFor and soundsAllowed are shared with the sound ladder.
  SB.deadlines = { build, rungOf, rungsFor, salesRate, soundsAllowed, nextOpenAt, pauseNote, closeAtMs, sweepToClose, nextBatchFit, makeLadder, electLeader, makePending, calloutWants, makeCallouts };
  SB.deadlines = { build, rungOf, rungsFor, salesRate, soundsAllowed, nextOpenAt, pauseNote, closeAtMs, sweepToClose, nextBatchFit, makeLadder, electLeader, makePending, wallOrders };
})(typeof globalThis !== 'undefined' ? globalThis : window);
