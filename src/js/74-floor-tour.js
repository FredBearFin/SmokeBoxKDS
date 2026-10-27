/*
 * WHAT THIS FILE IS: The practice run (SB.tour): about two minutes of learning by doing. It adds one practice ticket and
 *    guides a first-time cook through it, one action per step: a big picture, a few words that are also spoken aloud,
 *    a pulsing ring and a hand that taps the button to press. It moves on only when the real ticket changes, and it
 *    includes one deliberate mistake (Done too early, then Undo). The dishes come from the owner's menu; a kitchen with no
 *    dishes yet practices in the demo kitchen (its own saved data), so nothing touches the real kitchen. See
 *    docs/onboarding-plan.md for the research behind it.
 * PARTS: constants, ticket lookups, step logic, captions, ring and card placement, the check that runs four
 *    times a second, start and stop.
 * USES: 30-store.js (state, createTicket, clock speed), 60-shell.js (toast, office view), the board markup
 *    from 70-floor-board.js. USED BY: buttons on the empty board and in Help, wired in those files.
 */
(function (g) {
  'use strict';
  const SB = (g.SB = g.SB || {});
  const doc = g.document;
  if (!doc) return; // Node: the walkthrough is DOM only

  const U = SB.util, h = U.h;
  // The shared config (station names come from it); an empty object when it is missing.
  const C = () => SB.config || {};

  const POLL_MS = 250;      // four checks a second: quick enough to feel live, light enough to ignore
  const LAST = 9;           // the number of steps
  const TOUR_SPEED = 30;    // 30x clock: a 5-minute fry takes 10 real seconds
  const SETTLE_MS = 2000;   // after a step starts the board may still shift (the hint line re-wraps), so the card keeps adjusting
  const MARGIN = 12;        // pixels kept free around the card
  const MIN_SIDE = 340;     // the narrowest the card may be when it sits beside the ticket
  const MAX_W = 560;        // the widest the card gets
    // Dishes the starter menu offers for the walkthrough, tried first when they are on the menu and not 86:
  // lead (the slowest, cooked in two steps), second (held back by pacing) and quick (finished with one tap).
  const PREFER = { lead: 'hushpuppies', second: 'brisket_sand', quick: 'tea' };
  // Steps that wait for the Next button because there is nothing for the person to tap.
  const MANUAL = { 1: true, 2: true, 6: true };

  let T = null; // the running walkthrough, or null when none is running

  // The three dishes this walkthrough uses: { lead, second, quick }, each a menu item or null. Filled by start().
  let PICK = { lead: null, second: null, quick: null };
  // The dish name as the walkthrough says it: no portion note after a comma or in brackets.
  const nameOf = (m) => (m ? String(m.name).replace(/\s*\(.*$/, '').replace(/,.*$/, '').trim() : '');
  // Picks the lead, second and quick dishes from the current menu. Needs at least one dish that is not archived and
  // not 86. The lead is a two-step dish (Start, then Done) when there is one; with only one-tap dishes the lead is
  // missing and the walkthrough skips the Start steps. Returns null when no dish can be ordered.
  function pickDishes() {
    const menu = (SB.store.getState().menu || []).filter((m) => !m.archived && ((SB.store.select.availability(m.id) || {}).ok));
    // The usable menu item with this id, or null.
    const find = (id) => menu.find((m) => m.id === id) || null;
    const twos = menu.filter((m) => m.track === 'two').sort((a, b) => b.prepSec - a.prepSec);
    if (!menu.length) return null;
    const lead = find(PREFER.lead) && find(PREFER.lead).track === 'two' ? find(PREFER.lead) : twos[0] || null;
    const shorter = lead ? twos.filter((m) => m.id !== lead.id && m.prepSec < lead.prepSec) : [];
    const second = lead && find(PREFER.second) && find(PREFER.second).track === 'two' && find(PREFER.second).prepSec < lead.prepSec ? find(PREFER.second) : shorter[0] || null;
    const ones = menu.filter((m) => m.track === 'one').sort((a, b) => a.prepSec - b.prepSec);
    const quick = find(PREFER.quick) && find(PREFER.quick).track === 'one' ? find(PREFER.quick) : ones[0] || null;
    return { lead, second, quick };
  }

  // The tour ticket in the current state, or undefined once it has been reset away.
  const ticket = () => SB.store.getState().tickets.find((t) => t.id === T.id);
  // One dish of the tour ticket by its menu id.
  const dish = (t, menuId) => t.items.find((i) => i.menuId === menuId);
  // True once a person has started or finished the dish.
  const begun = (it) => !!it && (it.status === 'cooking' || it.status === 'done');
  // True when the dish is finished.
  const isDone = (it) => !!it && it.status === 'done';
  // Writes text only when it changed, so a screen reader is not told the same caption again.
  const put = (el, s) => { if (el.textContent !== s) el.textContent = s; };
  // Shows a message on the board's toast strip; never throws.
  const toast = (msg, o) => { try { return SB.ui.toast(msg, o); } catch (e) { return null; } };
  // True while a sheet or the back office covers the board, when the caption must step aside.
  const covered = () => !!doc.querySelector('.sheet-root') || !!(SB.shell && SB.shell.inOffice && SB.shell.inOffice());

  // The tour ticket's slip on the board. Looked up fresh every time because the board redraws its rows.
  function slip() {
    const id = g.CSS && g.CSS.escape ? g.CSS.escape(T.id) : T.id;
    return doc.querySelector('.fl-slip[data-ticket="' + id + '"]');
  }

  // Runs the kitchen clock fast for the rest of the walkthrough and remembers the old speed. It starts at
  // step 5 because the other dishes are timed from when the ticket arrived, so a fast clock earlier would
  // hide the explanation behind a countdown that is already over.
  function ensureSpeed() {
    if (T.fast) return;
    T.fast = true; T.prev = SB.store.speed();
    if (T.prev !== TOUR_SPEED) SB.store.setSpeed(TOUR_SPEED);
  }
  // Puts the clock back, but only if nobody changed the speed in the meantime.
  function restoreSpeed(tour) {
    if (!tour.fast || tour.restored) return;
    tour.restored = true;
    if (SB.store.speed() === TOUR_SPEED && tour.prev !== TOUR_SPEED) SB.store.setSpeed(tour.prev);
  }

  // Moves to a step. The clock goes fast from step 5 and is put back as soon as the loop is complete.
  function goTo(n) {
    T.step = n; T.at = Date.now(); T.shown = null; T.said = null;
    if (n >= 6) ensureSpeed();
    if (n === LAST) restoreSpeed(T);
  }

  // Moves the step forward when the real ticket has moved on. Steps only go forward, and a step the person
  // already did by themselves is skipped, so doing things in a different order never leaves the caption behind.
  //   3 Start the slowest dish, 4 tap Done on it too early (on purpose), 5 tap Undo, 6 the gray dish waits,
  //   7 finish every dish, 8 Bump, 9 the end. The mistake steps are skipped when there is no two-step dish, and step 5
  //   is skipped once its 4-second Undo has gone by.
  function advance(t) {
    const hp = PICK.lead ? dish(t, PICK.lead.id) : null, bs = PICK.second ? dish(t, PICK.second.id) : null;
    const all = t.items.every((i) => i.status === 'done');
    let s = T.step;
    for (let guard = 0; guard < 12; guard++) {
      const before = s;
      if (t.status === 'expedited') s = LAST;
      else if (all && s < 8 && !(s === 5 && isDone(hp) && Date.now() - T.doneAt < 4500)) s = 8;
      else if (!hp && s >= 3 && s <= 5) s = 6;                         // no two-step dish: no Start, no mistake to practice
      else if (s === 3 && begun(hp)) s = isDone(hp) ? 6 : 4;
      else if (s === 4 && isDone(hp)) { T.doneAt = Date.now(); s = 5; }
      else if (s === 5 && hp && (hp.status === 'cooking' || Date.now() - T.doneAt > 4500)) s = 6;
      else if (s === 6 && (!bs || begun(bs))) s = 7;
      if (s === before) break;
    }
    if (s !== T.step) goTo(s);
  }

  // The "do this next" line under the ticket header, or null when it is turned off in Settings.
  function hint() {
    const sl = slip(), n = sl && sl.querySelector('.slip-next');
    return n && n.getClientRects().length ? n : null;
  }

  // The picture for each step, so a cook knows the step before reading it.
  const STEP_ICON = { 1: 'ticket', 2: 'clock', 3: 'play', 4: 'check', 5: 'undo', 6: 'timer', 7: 'check-circle', 8: 'arrow-right', 9: 'sparkle' };
  // The words for the current step: short (about ten words), chosen from the real ticket so they never ask for a button
  // that is not there yet. The same words are spoken aloud.
  function words(t) {
    const hp = PICK.lead ? dish(t, PICK.lead.id) : null, bs = PICK.second ? dish(t, PICK.second.id) : null, tea = PICK.quick ? dish(t, PICK.quick.id) : null;
    const lead = nameOf(PICK.lead), second = nameOf(PICK.second), quick = nameOf(PICK.quick);
    switch (T.step) {
      case 1: return 'A new order. One ticket is one customer.';
      case 2: return 'This clock counts up. Red means the order is late.';
      case 3: return 'Tap Start on ' + lead + '. It takes longest, so it goes first.';
      case 4: return 'Practice a mistake: tap Done on ' + lead + ' now.';
      case 5: return 'Wrong tap? Tap Undo right away.';
      case 6: return bs && bs.status === 'queued' ? 'Gray means wait. ' + second + ' starts later, to finish with ' + lead + '.' : 'Tap Start on ' + second + ' when it flashes red.';
      case 7: {
        const open = [hp, bs, tea].filter((x) => x && !isDone(x)).map((x) => nameOf(PICK.lead && x.menuId === PICK.lead.id ? PICK.lead : PICK.second && x.menuId === PICK.second.id ? PICK.second : PICK.quick));
        return open.length ? 'When food is ready, tap Done: ' + open.join(', ') + '.' : 'Everything is done.';
      }
      case 8: return slip() && slip().querySelector('.fl-bump') ? 'All done. Tap Bump to send it out.' : 'All done. Tap All, then Bump.';
      default: return 'You are ready. That is the whole job.';
    }
  }

  // The elements the ring should point at for this step, leaving out any that have no box on screen (a hidden badge).
  function targets(t) {
    return rawTargets(t).filter((e) => e.getClientRects().length > 0);
  }

  // Every element that could carry the ring for this step, visible or not.
  function rawTargets(t) {
    const sl = slip();
    if (!sl) return [];
    // Every element inside the slip that matches a selector.
    const q = (sel) => Array.from(sl.querySelectorAll(sel));
    // The row for one dish, found by its menu id.
    const row = (id) => q('.fl-row[data-menu="' + id + '"]');
    switch (T.step) {
      case 1: return q('.slip-head').concat(hint() ? [hint()] : []);
      case 2: return q('.slip-timer, .fl-bw'); // the wrapper .slip-time has no box of its own, so ring the digits and the badge
      case 3: case 4: return PICK.lead ? row(PICK.lead.id) : [];
      case 5: { const u = q('.fl-undo'); return u.length ? u : PICK.lead ? row(PICK.lead.id) : []; }
      case 6: return PICK.second ? row(PICK.second.id) : [];
      case 7: {
        const out = [];
        t.items.forEach((i) => { if (i.status === 'cooking' || (i.track === 'one' && i.status === 'displayed')) out.push(...row(i.menuId)); });
        return out.length ? out : (PICK.quick ? row(PICK.quick.id) : []);
      }
      case 8: { const b = q('.fl-bump'); return b.length ? b : Array.from(doc.querySelectorAll('.fl-seg [data-id="all"]')); }
      default: return [];
    }
  }

  // Builds an icon element, or an empty span when icons are missing.
  const icon = (name, size) => { try { return SB.icons.svg(name, { size: size || 24 }); } catch (e) { return doc.createElement('span'); } };
  // Moves the tapping hand onto the middle of the button to press, or hides it when there is nothing to tap.
  function pointAt(el) {
    const hand = T.ui.hand;
    if (!el) { hand.hidden = true; return; }
    const r = el.getBoundingClientRect();
    const b = el.querySelector('.fl-act, .fl-bump, .fl-undo') || el;
    const rb = b.getBoundingClientRect().width ? b.getBoundingClientRect() : r;
    hand.style.left = Math.round(rb.left + rb.width / 2) + 'px';
    hand.style.top = Math.round(rb.top + rb.height / 2) + 'px';
    hand.hidden = false;
  }

  // Puts the pulsing ring on exactly these elements and takes it off everything else.
  function ring(els) {
    doc.querySelectorAll('.tour-ring').forEach((e) => { if (els.indexOf(e) < 0) e.classList.remove('tour-ring'); });
    els.forEach((e) => { if (!e.classList.contains('tour-ring')) e.classList.add('tour-ring'); });
  }

  // The part of the window where the board can be seen: under the header, above the all-day strip.
  function view() {
    const head = doc.querySelector('.fl-head');
    const lift = parseFloat(doc.documentElement.style.getPropertyValue('--fl-lift')) || 0;
    return { top: head ? head.getBoundingClientRect().bottom : 0, bottom: (g.innerHeight || 800) - lift };
  }
  // True when two boxes on the screen overlap each other.
  const hit = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  // True when the card sits on top of any of these elements.
  const covers = (els) => { const c = T.ui.card.getBoundingClientRect(); return els.some((e) => hit(c, e.getBoundingClientRect())); };

  // Scrolls the target to the middle of the board when it is hidden behind the header or the all-day strip.
  function bring(el) {
    const v = view(), r = el.getBoundingClientRect();
    if (r.top < v.top + MARGIN || r.bottom > v.bottom - MARGIN) el.scrollIntoView({ block: 'center', inline: 'nearest' });
  }

  // Wide screens: parks the card in the free space beside the ticket, level with the first ring, so the
  // whole ticket stays uncovered. Returns false when there is no room.
  function beside(sl, first, v) {
    const card = T.ui.card, r = sl.getBoundingClientRect(), W = g.innerWidth || 1280;
    const right = W - r.right - 2 * MARGIN, left = r.left - 2 * MARGIN;
    if (Math.max(right, left) < MIN_SIDE) return false;
    const w = Math.min(MAX_W, Math.max(right, left)), x = right >= MIN_SIDE ? r.right + MARGIN : r.left - MARGIN - w;
    card.style.setProperty('--tour-w', w + 'px');
    card.style.setProperty('--tour-x', x + 'px');
    card.dataset.dock = 'side';
    const ch = card.offsetHeight, f = first.getBoundingClientRect();
    const y = Math.min(Math.max(f.top + f.height / 2 - ch / 2, v.top + MARGIN), v.bottom - ch - MARGIN);
    card.style.setProperty('--tour-y', Math.round(y) + 'px');
    return true;
  }

  // Keeps the caption card off what it points at. Beside the ticket when the screen is wide; otherwise at the
  // bottom or the top of the screen. While a step is new (settling) the board also scrolls, if it has to, so the
  // rings sit in the free part; later it never scrolls on its own, so the person can look around.
  function place(els, settling) {
    const card = T.ui.card, v = view(), sl = slip();
    card.style.setProperty('--tour-top', v.top + 'px');
    ['--tour-w', '--tour-x', '--tour-y'].forEach((k) => card.style.removeProperty(k));
    if (!els.length || !sl) { card.dataset.dock = 'bottom'; return; }
    if (beside(sl, els[0], v)) return;
    const keep = card.dataset.dock === 'top' ? ['top', 'bottom'] : ['bottom', 'top'];
    for (const d of keep) { card.dataset.dock = d; if (!covers(els)) return; }
    card.dataset.dock = 'bottom';
    if (settling) clearBy(els); // neither end is clear: nudge the board
  }

  // Scrolls the board just far enough that the rings clear the card, trying the bottom end of the screen first
  // and then the top. It stops where the board cannot scroll any further.
  function clearBy(els) {
    const card = T.ui.card, main = doc.getElementById('fl-board');
    if (!main) return;
    for (const d of ['bottom', 'top']) {
      card.dataset.dock = d;
      const c = card.getBoundingClientRect(), rs = els.map((e) => e.getBoundingClientRect());
      const top = Math.min(...rs.map((r) => r.top)), bottom = Math.max(...rs.map((r) => r.bottom));
      main.scrollTop += d === 'bottom' ? bottom - (c.top - MARGIN) : top - (c.bottom + MARGIN);
      if (!covers(els)) return;
    }
    card.dataset.dock = 'bottom';
  }

  // Draws the caption and ring for the current step, or hides them while a sheet or the office is open.
  function render(t) {
    const u = T.ui;
    if (covered()) { if (!u.card.hidden) u.card.hidden = true; ring([]); T.shown = null; return; }
    if (u.card.hidden) u.card.hidden = false;
    const s = T.step;
    put(u.step, s === LAST ? 'Done' : 'Step ' + s + ' of ' + (LAST - 1));
    const w = words(t);
    put(u.text, w);
    if (u.icon.dataset.icon !== STEP_ICON[s]) { u.icon.dataset.icon = STEP_ICON[s]; u.icon.replaceChildren(icon(STEP_ICON[s], 40)); }
    // Each step is spoken once, in the kitchen voice, when the tablet's sound is on.
    if (T.said !== s) { T.said = s; try { if (SB.floor && SB.floor.say) SB.floor.say(w); } catch (e) { /* the words are on screen */ } }
    u.skip.hidden = s === LAST;
    u.next.hidden = !MANUAL[s] || (s === 5 && !!PICK.second && (() => { const d = dish(t, PICK.second.id); return !!d && d.status !== 'queued'; })());
    u.mine.hidden = u.demo.hidden = u.done.hidden = s !== LAST;
    // Only elements that are on screen get the ring (the On time badge is hidden unless a ticket is late).
    const els = targets(t).filter((e) => e.getClientRects().length > 0);
    ring(els);
    pointAt(MANUAL[s] || s === LAST ? null : els[0]);
    const fresh = T.shown !== s && els.length > 0;
    if (fresh) { bring(els[0]); T.shown = s; }
    place(els, Date.now() - T.at < SETTLE_MS);
  }

  // One check: end if the ticket is gone or voided, then move the step and redraw. A failure stops the
  // walkthrough instead of leaving a half-working card on the board.
  function poll() {
    if (!T) return;
    try {
      const t = ticket();
      if (!t || t.status === 'voided') { stop(); return; }
      advance(t);
      render(t);
    } catch (e) {
      try { console.error('[smokebox] walkthrough stopped', e); } catch (e2) { /* ignore */ }
      stop();
    }
  }

  // Next button: only the explaining steps have it, so it simply goes one step on.
  function onNext() { if (T && MANUAL[T.step]) { goTo(T.step + 1); poll(); } }

  // Escape ends the walkthrough, but not while a sheet is open, because then Escape belongs to the sheet.
  function onKey(e) { if (e.key === 'Escape' && !doc.querySelector('.sheet-root')) stop(); }

  // The header's Demo button, found by its label, for the last step.
  function demoButton() {
    return Array.from(doc.querySelectorAll('.fl-head button')).find((b) => !b.classList.contains('fl-demo-chip') && /^\s*Demo\b/.test(b.textContent)) || null;
  }

  // Ends the walkthrough, then presses a real board button, so the new screen gets the focus.
  function leaveTo(finder) { stop(); const b = finder(); if (b) b.click(); }
  // Last-step buttons: add a ticket of your own, start the demo, or just finish.
  const onMine = () => leaveTo(() => doc.querySelector('.fl-new'));
  // Starts the demo from the empty board, or opens the Demo screen when the board has tickets.
  const onDemo = () => leaveTo(() => doc.querySelector('.fl-start-demo') || demoButton());
  // Ends the walkthrough from Skip or Done.
  const onEnd = () => stop();
  // In the practice kitchen: runs the practice again with a fresh ticket.
  const onAgain = () => { stop(true); start({ practice: true }); };
  // In the practice kitchen: goes back to the real kitchen and opens Dishes and prices there.
  // The note lives in the browser's lasting storage for a minute (the tab's own storage can be lost on this reload).
  const onHome = () => { stop(true); try { g.localStorage.setItem(AFTER_KEY, String(Date.now())); } catch (e) { /* the board still offers Add my menu */ } SB.store.leaveDemo(); };
  // The options of the walkthrough being built (read by buildCard).
  let T0opts = {};

  // Builds the caption card with all its buttons; render() shows the ones each step needs.
  function buildCard() {
    const step = h('p', { class: 'tour-step' });
    const text = h('p', { class: 'tour-text' });
    const pic = h('div', { class: 'tour-pic', 'aria-hidden': 'true' });
    const say = h('div', { class: 'tour-say', role: 'status', 'aria-live': 'polite' }, step, text);
    const hand = h('div', { class: 'tour-hand', hidden: true, 'aria-hidden': 'true' });
    const skip = h('button', { type: 'button', class: 'btn tour-skip', onClick: onEnd }, 'Skip');
    const next = h('button', { type: 'button', class: 'btn btn-primary tour-next', onClick: onNext }, 'Next');
    const practiceOnly = !!(SB.store && SB.store.isDemo && SB.store.isDemo() && T0opts.practice);
    const mine = h('button', { type: 'button', class: 'btn tour-mine', hidden: true, onClick: practiceOnly ? onAgain : onMine }, practiceOnly ? 'Practice again' : 'Add my own ticket');
    const demo = h('button', { type: 'button', class: 'btn tour-demo', hidden: true, onClick: onDemo }, 'Watch a busy night');
    const done = h('button', { type: 'button', class: 'btn btn-primary tour-done', hidden: true, onClick: practiceOnly ? onHome : onEnd }, practiceOnly ? 'Now add my menu' : 'Done');
    const card = h('div', { class: 'tour-card', hidden: true, dataset: { dock: 'bottom' } }, h('div', { class: 'tour-head' }, pic, say), h('div', { class: 'tour-actions' }, skip, next, mine, demo, done));
    return { card, step, text, icon: pic, hand, skip, next, mine, demo, done };
  }

  // Shows the All tab, because Bump lives on the whole ticket and a station tab hides it.
  function goAll() {
    const b = doc.querySelector('.fl-seg [data-id="all"]');
    if (b && b.getAttribute('aria-selected') !== 'true') b.click();
  }

  // Says why the walkthrough cannot start when there is no dish to use: with an empty menu it offers a button that opens
  // Dishes and prices; when every dish is sold out or archived it says so.
  function noDishNote() {
    const menu = (SB.store.getState().menu || []).filter((m) => !m.archived);
    if (menu.length) { toast('Every dish is sold out right now, so the walkthrough has nothing to order. Open the 86 board to see why, then try again.', { tone: 'warn' }); return; }
    // Opens the Dishes and prices sheet, where the first dish is added.
    const open = h('button', { type: 'button', class: 'btn', onClick: () => { try { SB.sheets.open('dishes'); } catch (e) { /* the sheet is optional */ } } }, 'Add my menu');
    toast(h('span', null, 'The walkthrough needs a dish to show. Add one first (a name and a price is enough), then try again. ', open), { tone: 'warn', ms: 12000 });
  }

  // The tab's notes that carry the practice run across the reload into the demo kitchen and back.
  const PRACTICE_KEY = 'smokebox.v1.practice', AFTER_KEY = 'smokebox.v1.afterPractice';
  // A kitchen with no dishes yet practices in the demo kitchen (its own saved data): notes it for after the reload and
  // switches. Returns false when that is not possible (already in the demo, or no demo in this build).
  function practiceInDemo() {
    const S = SB.store;
    if (!S || !S.enterDemo || (S.isDemo && S.isDemo()) || (S.isolated && !S.isolated())) return false;
    try { g.sessionStorage.setItem(PRACTICE_KEY, '1'); } catch (e) { return false; }
    // The address says ?practice too: a browser that loses the tab's note on reload still starts the practice.
    try { if (g.history && g.history.replaceState && !/[?&]practice(=|&|$)/.test(g.location.search || '')) g.history.replaceState(null, '', g.location.pathname + (g.location.search ? g.location.search + '&practice' : '?practice') + g.location.hash); } catch (e) { /* the tab's note still works */ }
    return S.enterDemo();
  }
  // True when a practice run is waiting to start after the reload: noted in the tab, or in the address (?practice).
  function pending() {
    try { if (g.sessionStorage.getItem(PRACTICE_KEY)) return true; } catch (e) { /* fall back to the address */ }
    try { return /[?&]practice(=|&|$)/.test(g.location.search || ''); } catch (e) { return false; }
  }
  // Called once the board is up: in the demo kitchen with a practice note, sets out a quiet sample kitchen (no orders
  // running, no tickets) and starts the practice; back in the real kitchen after "Now add my menu", opens Dishes and prices.
  function resume() {
    const S = SB.store;
    let after = null;
    const want = pending();
    try { after = Number(g.localStorage.getItem(AFTER_KEY)) || 0; } catch (e) { after = 0; }
    if (after && !(S.isDemo && S.isDemo())) {
      try { g.localStorage.removeItem(AFTER_KEY); } catch (e) { /* ignore */ }
      if (Date.now() - after < 60e3) { try { SB.sheets.open('dishes'); } catch (e) { /* optional */ } }
      return false;
    }
    if (!want || !(S.isDemo && S.isDemo())) return false;
    try { g.sessionStorage.removeItem(PRACTICE_KEY); } catch (e) { /* ignore */ }
    try { if (g.history && g.history.replaceState) g.history.replaceState(null, '', g.location.pathname + (g.location.search || '').replace(/([?&])practice(=[^&]*)?(&|$)/, (m, a, b, c) => (c ? a : '')).replace(/[?&]$/, '') + g.location.hash); } catch (e) { /* the note is gone anyway */ }
    try { if (SB.sim && SB.sim.live) { SB.sim.live.stop(); SB.sim.live.crew(false); } } catch (e) { /* no simulator */ }
    S.setSpeed(1);
    S.resetLive({ keepSettings: true, starter: true, catalog: 'sample', replaceOwn: true });
    return start({ practice: true });
  }

  // Adds the walkthrough ticket and starts the guide. Starting again while one is running begins again at
  // step 1 with a fresh ticket. Returns true when it started.
  function start(opts) {
    const S = SB.store;
    if (!S || typeof S.dispatchEx !== 'function') return false;
    if (T) stop(true);
    // Choose the dishes from the owner's menu. With no usable dish the walkthrough says why instead of failing quietly.
    const pick = pickDishes();
    if (!pick && practiceInDemo()) return true;
    if (!pick) { noDishNote(); return false; }
    PICK = pick;
    const items = [pick.lead, pick.second, pick.quick].filter(Boolean).map((m) => ({ menuId: m.id, qty: 1 }));
    const r = S.dispatchEx('createTicket', { customer: 'Walk-up', channel: 'dine_in', items, note: '', rush: false, src: 'demo' }, { source: 'sim' });
    const id = r && r.report === 'ok' && r.info ? r.info.ticketId : null;
    if (!id) {
      toast('The walkthrough ticket could not be added. Check that its dishes (' + items.map((x) => nameOf(SB.store.getState().menu.find((m) => m.id === x.menuId))).join(', ') + ') are not sold out.', { tone: 'warn' });
      return false;
    }
    goAll();
    T0opts = opts || {};
    T = { id, step: 1, at: Date.now(), shown: null, said: null, doneAt: 0, fast: false, restored: false, prev: 1, ui: buildCard(), timer: 0, opts: T0opts };
    doc.body.appendChild(T.ui.card);
    doc.body.appendChild(T.ui.hand);
    doc.addEventListener('keydown', onKey);
    T.timer = setInterval(poll, POLL_MS);
    poll();
    return true;
  }

  // Ends the walkthrough: removes the card and every ring, puts the clock back and returns focus to the
  // board. In a real kitchen the walkthrough ticket is removed, so it never sits in the owner's reports; the demo keeps it.
  // A quiet stop (used when restarting) skips the focus move.
  function stop(quiet) {
    if (!T) return false;
    const was = T; T = null;
    clearInterval(was.timer);
    const S = SB.store;
    if (S && !(S.isDemo && S.isDemo()) && typeof S.dispatchEx === 'function') { try { S.dispatchEx('clearDemoTickets', { ticketId: was.id }, { source: 'sim' }); } catch (e) { /* the leftovers offer still catches it */ } }
    doc.removeEventListener('keydown', onKey);
    restoreSpeed(was);
    doc.querySelectorAll('.tour-ring').forEach((e) => e.classList.remove('tour-ring'));
    was.ui.card.remove();
    was.ui.hand.remove();
    if (!quiet && !doc.querySelector('.sheet-root')) {
      const main = doc.getElementById('fl-board');
      if (main) { try { main.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
    }
    return true;
  }

  // True while a walkthrough is running.
  const active = () => !!T;
  // True while a practice run is going on in the demo kitchen (the banner then says it is practice).
  const practicing = () => !!T && !!T.opts.practice;

  // True when the practice can run on this kitchen's own dishes (otherwise it runs in the demo kitchen).
  const ownDishes = () => !!pickDishes();
  SB.tour = { start, stop, active, running: active, resume, ownDishes, pending, practicing };
})(typeof globalThis !== 'undefined' ? globalThis : window);
