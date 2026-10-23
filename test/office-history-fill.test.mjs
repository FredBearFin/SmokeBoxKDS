// The Saved history numbers and words: a real kitchen is driven by the engine to 50, 75, 90 and 100 percent of a (lowered) ticket limit, and the
// meter, the amber note, the days-left estimate and the dropped-history sentence are checked in plain words. The fill is read the way the store's
// historyFill() reports it ({ tickets, ticketsCap, events, eventsCap, bytes, quotaBytes, persisted }). Run in several time zones.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSB } from './_load.mjs';

const SB = await loadSB(['00-util', '10-config', '20-engine', '36-csv', '80-office-core', '88-office-backup']);
const E = SB.engine, BP = SB.office.backupPure;
const CAP = 200, MIN = 60e3, DAY = 864e5;
SB.config.limits.maxTickets = CAP;     // the engine drops the oldest finished tickets past this, as it does at 5,000 in a real kitchen
const T0 = new Date(2026, 8, 1, 8, 0).getTime();

// Builds a kitchen with `n` tickets spread at about 8 a day, each finished, paid and closed at night; returns { s, now }.
function kitchen(n) {
  let now = T0, s = E.newState({ now, blank: true });
  const go = (type, p, t) => { now = Math.max(now + 1000, t); const r = E.apply(s, type, p, now); assert.equal(r.report, 'ok', type + ' ' + r.report); s = r.state; return r; };
  const dish = go('addMenuItem', { name: 'Plate', zone: 'pit', cat: 'meat', price: 12, prepSec: 60, track: 'one', prepGuess: false }, now).info.id;
  for (let i = 0; i < n; i++) {
    const day = Math.floor(i / 8), t = new Date(2026, 8, 1 + day, 11 + (i % 8), 5).getTime();
    const cr = go('createTicket', { customer: 'T' + i, channel: 'dine_in', items: [{ menuId: dish }] }, t);
    const tk = s.tickets.find((x) => x.id === cr.info.ticketId);
    go('completeItem', { ticketId: tk.id, itemId: tk.items[0].id }, now + 20000);
    go('bumpTicket', { ticketId: tk.id }, now + 5000);
    go('payOrder', { orderId: cr.info.orderId, method: 'cash' }, now + 3 * MIN);
    if (i % 8 === 7) go('closeDay', {}, new Date(2026, 8, 1 + day, 23, 30).getTime());
  }
  return { s, now };
}
// What the store reports about how full the saved history is.
const fillOf = (s, extra) => Object.assign({ tickets: s.tickets.length, ticketsCap: CAP, events: E.allEvents(s).length, eventsCap: 1e6, bytes: 1e5, quotaBytes: 5e6, persisted: true }, extra || {});

test('50 percent: a plain meter with the days left from the last 14 days, and no warning', () => {
  const { s, now } = kitchen(100);
  const v = BP.historyView(fillOf(s), s, now);
  assert.equal(v.pct, 50); assert.equal(v.level, 'ok'); assert.equal(v.alert, '');
  assert.match(v.meter, /^Your saved history: 50% full \(about \d+ more days at today's pace\)$/);
  // the estimate by hand: tickets in the last 14 days per day, against the room that is left
  const recent = s.tickets.filter((t) => t.createdAt > now - 14 * DAY), span = Math.min(14, Math.ceil((now - Math.min(...recent.map((t) => t.createdAt))) / DAY));
  assert.equal(v.daysLeft, Math.floor((CAP - s.tickets.length) / (recent.length / span)));
});

test('75 percent: the calm warning with the exact words and the number', () => {
  const { s, now } = kitchen(150);
  const v = BP.historyView(fillOf(s), s, now);
  assert.equal(v.pct, 75); assert.equal(v.level, 'near');
  assert.equal(v.alert, 'Your saved history is 75% full. Close the month to save it to files before older days are dropped.');
});

test('90 percent is urgent (the Close the day sheet repeats the line from 85 percent)', () => {
  const { s, now } = kitchen(180);
  const v = BP.historyView(fillOf(s), s, now);
  assert.equal(v.pct, 90); assert.equal(v.level, 'urgent');
  assert.match(v.alert, /^Your saved history is 90% full\./);
});

test('100 percent: the engine really drops the oldest tickets at the limit, and the words say it is full', () => {
  const { s, now } = kitchen(CAP + 40);
  assert.equal(s.tickets.length, CAP, 'the engine holds the line at its limit');
  const v = BP.historyView(fillOf(s), s, now);
  assert.equal(v.pct, 100); assert.equal(v.level, 'full'); assert.equal(v.daysLeft, null);
  assert.equal(v.meter, 'Your saved history is full.');
  assert.match(v.alert, /older days are being dropped to make room\. Close the month to save them to files\.$/);
});

test('the largest of tickets, events and storage decides the percent, and the words never claim more than known', () => {
  const { s, now } = kitchen(40);
  assert.equal(BP.historyView(fillOf(s, { events: 30000, eventsCap: 40000 }), s, now).pct, 75, 'events lead');
  assert.equal(BP.historyView(fillOf(s, { bytes: 4.5e6 }), s, now).pct, 90, 'storage leads');
  const none = BP.historyView({}, s, now); assert.equal(none.pct, null); assert.equal(none.meter, '');
  assert.equal(BP.historyView(null, s, now).level, 'ok');
  // a young kitchen (under three days of tickets) gives no days-left guess
  const young = kitchen(10); assert.equal(BP.historyView(fillOf(young.s), young.s, young.now).daysLeft, null);
  assert.match(BP.historyView(fillOf(young.s), young.s, young.now).meter, /^Your saved history: \d+% full$/);
});

test('the browser-may-delete line appears only when the browser did not promise to keep the data', () => {
  const { s, now } = kitchen(20);
  assert.equal(BP.historyView(fillOf(s), s, now).safari, '');
  assert.match(BP.historyView(fillOf(s, { persisted: false }), s, now).safari, /^This browser may delete saved data if the tablet is unused for a while\. Add Smokebox to the home screen/);
});

test('dropped history and cleared days each have their own sentence', () => {
  assert.equal(BP.droppedWords('2026-09-10'), 'Older history was dropped to make room (days before ' + SB.util.fmtDateShort('2026-09-10') + '). Close the month regularly to keep it in files.');
  assert.equal(BP.droppedWords(''), ''); assert.equal(BP.droppedWords('nonsense'), '');
});

test('a range that reaches days dropped to make room gets the page note, and a range after them does not', () => {
  const w = SB.office.droppedRangeWords, day = '2026-09-10', start = new Date(2026, 8, 10, 4, 0).getTime();
  assert.equal(w(day, start, 4), ''); assert.equal(w(day, start + DAY, 4), '');
  assert.equal(w(day, start - DAY, 4), 'Older history was dropped to make room: days before ' + SB.util.fmtDateShort(day) + ' are not here, so totals for those days are missing.');
  assert.equal(w(day, -Infinity, 4), w(day, start - DAY, 4)); assert.equal(w(undefined, -Infinity, 4), '');
});
