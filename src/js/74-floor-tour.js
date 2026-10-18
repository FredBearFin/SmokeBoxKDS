/*
 * WHAT THIS FILE IS: The "Show me how it works" walkthrough (SB.tour). It adds one demo ticket and guides a
 *    first-time user through it with a caption card and a pulsing ring, moving on only when the real ticket changes.
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

  const POLL_MS = 250;      // four checks a second: quick enough to feel live, light enough to ignore
  const LAST = 9;           // the number of steps
  const TOUR_SPEED = 30;    // 30x clock: a 5-minute fry takes 10 real seconds
  const SETTLE_MS = 2000;   // after a step starts the board may still shift (the hint line re-wraps), so the card keeps adjusting
  const MARGIN = 12;        // pixels kept free around the card
  const MIN_SIDE = 340;     // the narrowest the card may be when it sits beside the ticket
  const MAX_W = 560;        // the widest the card gets
  const DWELL_MS = 5000;    // step 5 stays this long so the gray countdown can be read, even if it already ended
  // The walkthrough order: menu id and quantity. Hush puppies are the slowest dish, tea the quickest.
  const ORDER = [['hushpuppies', 1], ['brisket_sand', 1], ['tea', 1]];
  // Steps that wait for the Next button because there is nothing for the person to tap.
  const MANUAL = { 1: true, 2: true, 4: true, 5: true };

  let T = null; // the running walkthrough, or null when none is running

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
    T.step = n; T.at = Date.now(); T.shown = null;
    if (n >= 5) ensureSpeed();
    if (n === LAST) restoreSpeed(T);
  }

  // Moves the step forward when the real ticket has moved on. Steps only go forward, and a step the person
  // already did by themselves is skipped, so doing things in a different order never leaves the caption behind.
  function advance(t) {
    const hp = dish(t, 'hushpuppies'), bs = dish(t, 'brisket_sand');
    const all = t.items.every((i) => i.status === 'done');
    let s = T.step;
    for (let guard = 0; guard < 10; guard++) {
      const before = s;
      if (t.status === 'expedited') s = LAST;
      else if (all && s < 8) s = 8;
      else if (begun(bs) && s >= 4 && s < 7) s = 7;
      else if (begun(hp) && s < 4) s = 4;
      else if (s === 5 && bs && bs.status !== 'queued' && Date.now() - T.at >= DWELL_MS) s = 6;
      if (s === before) break;
    }
    if (s !== T.step) goTo(s);
  }

  // The "do this next" line under the ticket header, or null when it is turned off in Settings.
  function hint() {
    const sl = slip(), n = sl && sl.querySelector('.slip-next');
    return n && n.getClientRects().length ? n : null;
  }

  // The words for the current step. They are chosen from the real ticket so they never ask for a button
  // that is not there yet.
  function words(t) {
    const hp = dish(t, 'hushpuppies'), bs = dish(t, 'brisket_sand'), tea = dish(t, 'tea');
    switch (T.step) {
      case 1: return "This is a ticket. It is one customer's order." + (hint() ? ' The line under the name always says what to do next.' : '');
      case 2: return 'The clock counts up from the moment the order came in. It turns amber, then red, when the time limit for that kind of order runs out.';
      case 3: return 'Each dish belongs to a station: FRY, PIT, CLD. Hush puppies take the longest, so they can start right now. Tap START when you begin cooking them.';
      case 4: return 'The orange countdown under the dish is the estimated cooking time left. At zero the row flashes Check it. Smokebox cannot see your fryer, so it never marks a dish done by itself.';
      case 5: return 'The other two dishes are gray on purpose. Smokebox is holding them back so everything finishes together. Watch the countdown: it says when to start.';
      case 6: return bs && bs.status === 'queued'
        ? 'Almost there. When the countdown reaches zero, START appears on the brisket sandwich. You can also tap Start now to begin it early.'
        : 'Its time has come. Tap START on the brisket sandwich.';
      case 7: {
        const open = [];
        if (hp && !isDone(hp)) open.push('the hush puppies');
        if (bs && !isDone(bs)) open.push('the brisket sandwich');
        const teaReady = tea && tea.status === 'displayed';
        let s = open.length || !teaReady ? 'When a dish is really finished, tap DONE on it. You are the one who says it is done.' : '';
        if (open.length) s += ' Finish ' + open.join(' and ') + '.';
        if (tea && !isDone(tea)) s += teaReady ? (open.length ? ' Then tap DONE on the sweet tea.' : 'Tap DONE on the sweet tea.') : ' The sweet tea is still waiting its turn; it joins in a moment.';
        return s;
      }
      case 8: return slip() && slip().querySelector('.fl-bump')
        ? 'Everything is done, so Bump is green. Tap Bump to send the ticket away. The clock stops.'
        : 'Everything is done. Tap the All tab, then tap Bump to send the ticket away. The clock stops.';
      default: return 'That is the whole loop: a ticket arrives, you start what is ready, tap done, then bump. The back office turns these taps into charts: tap Back office at the top of the screen. To add dishes and set prices and prep times, open Menu and settings there.';
    }
  }

  // The elements the ring should point at for this step.
  function targets(t) {
    const sl = slip();
    if (!sl) return [];
    // Every element inside the slip that matches a selector.
    const q = (sel) => Array.from(sl.querySelectorAll(sel));
    // The row for one dish, found by its menu id.
    const row = (id) => q('.fl-row[data-menu="' + id + '"]');
    switch (T.step) {
      case 1: return q('.slip-head').concat(hint() ? [hint()] : []);
      case 2: return q('.slip-timer, .fl-bw'); // the wrapper .slip-time has no box of its own, so ring the digits and the badge
      case 3: case 4: return row('hushpuppies');
      case 5: case 6: return row('brisket_sand');
      case 7: {
        const out = [];
        t.items.forEach((i) => { if (i.status === 'cooking' || (i.track === 'one' && i.status === 'displayed')) out.push(...row(i.menuId)); });
        return out.length ? out : row('tea');
      }
      case 8: { const b = q('.fl-bump'); return b.length ? b : Array.from(doc.querySelectorAll('.fl-seg [data-id="all"]')); }
      default: return [];
    }
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
    put(u.step, 'Step ' + s + ' of ' + LAST);
    put(u.text, words(t));
    u.skip.hidden = s === LAST;
    u.next.hidden = !MANUAL[s];
    u.mine.hidden = u.demo.hidden = u.done.hidden = s !== LAST;
    const els = targets(t);
    ring(els);
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

  // Builds the caption card with all its buttons; render() shows the ones each step needs.
  function buildCard() {
    const step = h('p', { class: 'tour-step' });
    const text = h('p', { class: 'tour-text' });
    const say = h('div', { class: 'tour-say', role: 'status', 'aria-live': 'polite' }, step, text);
    const skip = h('button', { type: 'button', class: 'btn tour-skip', onClick: onEnd }, 'Skip');
    const next = h('button', { type: 'button', class: 'btn btn-primary tour-next', onClick: onNext }, 'Next');
    const mine = h('button', { type: 'button', class: 'btn tour-mine', hidden: true, onClick: onMine }, 'Add my own ticket');
    const demo = h('button', { type: 'button', class: 'btn tour-demo', hidden: true, onClick: onDemo }, 'Start the demo');
    const done = h('button', { type: 'button', class: 'btn btn-primary tour-done', hidden: true, onClick: onEnd }, 'Done');
    const card = h('div', { class: 'tour-card', hidden: true, dataset: { dock: 'bottom' } }, say, h('div', { class: 'tour-actions' }, skip, next, mine, demo, done));
    return { card, step, text, skip, next, mine, demo, done };
  }

  // Shows the All tab, because Bump lives on the whole ticket and a station tab hides it.
  function goAll() {
    const b = doc.querySelector('.fl-seg [data-id="all"]');
    if (b && b.getAttribute('aria-selected') !== 'true') b.click();
  }

  // Adds the walkthrough ticket and starts the guide. Starting again while one is running begins again at
  // step 1 with a fresh ticket. Returns true when it started.
  function start(opts) {
    const S = SB.store;
    if (!S || typeof S.dispatchEx !== 'function') return false;
    if (T) stop(true);
    const items = ORDER.map((x) => ({ menuId: x[0], qty: x[1] }));
    const r = S.dispatchEx('createTicket', { customer: 'Walk-up', channel: 'dine_in', items, note: '', rush: false, src: 'demo' }, { source: 'sim' });
    const id = r && r.report === 'ok' && r.info ? r.info.ticketId : null;
    if (!id) {
      toast('The walkthrough ticket could not be added. Check that hush puppies, brisket sandwich and sweet tea are not marked 86.', { tone: 'warn' });
      return false;
    }
    goAll();
    T = { id, step: 1, at: Date.now(), shown: null, fast: false, restored: false, prev: 1, ui: buildCard(), timer: 0, opts: opts || {} };
    doc.body.appendChild(T.ui.card);
    doc.addEventListener('keydown', onKey);
    T.timer = setInterval(poll, POLL_MS);
    poll();
    return true;
  }

  // Ends the walkthrough: removes the card and every ring, puts the clock back and returns focus to the
  // board. The demo ticket is left alone. A quiet stop (used when restarting) skips the focus move.
  function stop(quiet) {
    if (!T) return false;
    const was = T; T = null;
    clearInterval(was.timer);
    doc.removeEventListener('keydown', onKey);
    restoreSpeed(was);
    doc.querySelectorAll('.tour-ring').forEach((e) => e.classList.remove('tour-ring'));
    was.ui.card.remove();
    if (!quiet && !doc.querySelector('.sheet-root')) {
      const main = doc.getElementById('fl-board');
      if (main) { try { main.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
    }
    return true;
  }

  // True while a walkthrough is running.
  const active = () => !!T;

  SB.tour = { start, stop, active, running: active };
})(typeof globalThis !== 'undefined' ? globalThis : window);
