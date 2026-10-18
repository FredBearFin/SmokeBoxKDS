// Journey 11: performance probes with numbers. The machine is shared, so every budget is loose and the load average is recorded
// next to the numbers; a failure means "clearly too slow even allowing for that", not "a few ms over".
import os from 'node:os';
import { wait, seedStandard, settle, waitOffice, gotoOffice, OFFICE_PAGES, closeSheets } from './_lib.mjs';

const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
const r1 = (n) => Math.round(n * 10) / 10;

/** Long tasks (over 50 ms of blocked main thread) seen from now on in this page. */
const watchLongTasks = (page) => page.evaluate(() => { window.__lt = []; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push(Math.round(e.duration)); }).observe({ entryTypes: ['longtask'] }); } catch (e) { /* unsupported */ } });

export default function (h) {
  h.test('11a-startup-and-sample', 'Performance: time to first paint, boot, SB.sim.sample() cold and memoised', { owner: 'lead', timeout: 90000 }, async (t) => {
    const load0 = os.loadavg()[0];
    t.note('machine load average (1 min, 2 cores shared) before the probes', r1(load0), '');
    const timing = () => {
      window.__tm = {};
      const poll = () => {
        if (!window.__tm.booted && window.SB && window.SB.booted) window.__tm.booted = performance.now();
        if (!window.__tm.board && document.querySelector('.fl-grid .fl-slip, .fl-empty:not([hidden])')) window.__tm.board = performance.now();
        if (!(window.__tm.booted && window.__tm.board)) requestAnimationFrame(poll);
      };
      requestAnimationFrame(poll);
    };
    const runs = [];
    for (let i = 0; i < 3; i++) {
      const page = await t.open({ w: 1280, h: 800, init: timing });
      await wait(400);
      runs.push(await page.evaluate(() => {
        const nav = performance.getEntriesByType('navigation')[0] || {};
        const fcp = (performance.getEntriesByName('first-contentful-paint')[0] || {}).startTime;
        const fp = (performance.getEntriesByName('first-paint')[0] || {}).startTime;
        return { fp, fcp, dcl: nav.domContentLoadedEventEnd, load: nav.loadEventEnd, booted: window.__tm.booted, board: window.__tm.board, heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null };
      }));
      if (i < 2) await page.context().close().catch(() => {});
    }
    const med = (k) => median(runs.map((r) => r[k]).filter((x) => typeof x === 'number'));
    t.note('first paint (median of 3 cold loads)', r1(med('fp')), 'ms');
    t.note('first contentful paint (median of 3)', r1(med('fcp')), 'ms');
    t.note('DOMContentLoaded (parse + run all scripts, median of 3)', r1(med('dcl')), 'ms');
    t.note('SB.booted true (median of 3)', r1(med('booted')), 'ms');
    t.note('board has slips or the empty state painted (median of 3)', r1(med('board')), 'ms');
    if (runs[0].heapMB != null) t.note('JS heap after boot', runs[0].heapMB, 'MB');
    const budget = load0 > 6 ? 3000 : 1500;
    t.check('first contentful paint within ' + budget + ' ms (budget loosened when the machine is loaded)', med('fcp') < budget, runs.map((r) => Math.round(r.fcp)), 'lead');
    t.check('the app is booted and the board painted within ' + (budget + 1000) + ' ms of navigation start', med('board') < budget + 1000, runs.map((r) => Math.round(r.board)), 'board');

    const page = await t.open({ w: 1280, h: 800 });
    const s = await page.evaluate(() => {
      const out = {};
      const had = typeof SB.sim !== 'undefined' && typeof SB.sim.sample === 'function';
      if (!had) return { missing: true };
      // a service date three days out cannot be in the memo yet, so this is the cold cost
      let t0 = performance.now(); const cold = SB.sim.sample({ now: Date.now() + 40 * 864e5 }); out.coldMs = performance.now() - t0;
      out.generatedMs = cold.generatedMs; out.tickets = cold.tickets.length; out.events = cold.events.length; out.days = cold.days.length;
      t0 = performance.now(); SB.sim.sample({ now: Date.now() + 40 * 864e5 }); out.memoMs = performance.now() - t0;
      out.json = JSON.stringify(cold.tickets).length;
      return out;
    });
    if (s.missing) { t.skipCheck('SB.sim.sample timing', 'SB.sim.sample is not built'); } else {
      t.note('SB.sim.sample() cold (14 days)', r1(s.coldMs), 'ms');
      t.note('SB.sim.sample() generatedMs reported by the simulator', s.generatedMs, 'ms');
      t.note('SB.sim.sample() second call (memoised)', r1(s.memoMs), 'ms');
      t.note('sample history size', s.tickets + ' tickets, ' + s.events + ' events, ' + s.days + ' days, tickets JSON ' + Math.round(s.json / 1024) + ' KB', '');
      t.check('SB.sim.sample() cold finishes in under ' + (load0 > 6 ? 4000 : 2000) + ' ms', s.coldMs < (load0 > 6 ? 4000 : 2000), s, 'sim');
      t.check('a second SB.sim.sample() call is memoised (under 20 ms)', s.memoMs < 20, s.memoMs, 'sim');
      t.check('the sample has 14 days and a few thousand tickets', s.days === 14 && s.tickets > 1500, { days: s.days, tickets: s.tickets }, 'sim');
    }
    await t.clean(page, 'startup');
  });

  h.test('11b-office-render', 'Performance: render time of each office page (with 14 days of sample history)', { owner: 'officeA', timeout: 120000 }, async (t) => {
    const page = await t.open({ w: 1280, h: 800, hash: '#/office/pace' });
    const t0 = Date.now();
    await page.waitForFunction(() => window.SB && SB.shell && SB.shell.inOffice() && document.querySelector('#sb-office .of-main figure.ch'), null, { timeout: 15000 }).catch(() => {});
    t.note('deep link #/office/pace to first chart in the DOM (includes the 0.7 s ignition)', Date.now() - t0, 'ms');
    await wait(1200);
    await watchLongTasks(page);
    const rows = [];
    for (const p of OFFICE_PAGES.slice().reverse().concat([OFFICE_PAGES[0]])) {
      const ms = await page.evaluate(async (id) => {
        const t0 = performance.now();
        location.hash = '#/office/' + id;
        await new Promise((res) => { const tick = () => { const o = document.querySelector('#sb-office .of'); if (o && o.dataset.page === id) res(); else if (performance.now() - t0 > 6000) res(); else requestAnimationFrame(tick); }; tick(); });
        await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
        return performance.now() - t0;
      }, p.id);
      await wait(900);
      const ltp = await page.evaluate(() => { const a = window.__lt || []; window.__lt = []; return a; });
      rows.push({ id: p.id, ms, lt: ltp });
    }
    const lt = rows.flatMap((r) => r.lt);
    const ltWorst = rows.reduce((a, r) => (Math.max(0, ...r.lt) > Math.max(0, ...a.lt) ? r : a), rows[0]);
    for (const r of rows) t.note('office page "' + r.id + '" navigate to painted', r1(r.ms), 'ms');
    t.note('long tasks (over 50 ms) while paging through the office', lt.length ? lt.join(', ') : 'none', 'ms');
    const worst = rows.reduce((a, b) => (b.ms > a.ms ? b : a), rows[0]);
    const budget = os.loadavg()[0] > 6 ? 1500 : 800;
    t.check('every office page paints within ' + budget + ' ms of the navigation (worst: ' + worst.id + ' ' + Math.round(worst.ms) + ' ms)', worst.ms < budget, rows.map((r) => r.id + ' ' + Math.round(r.ms)).join(', '), worst.id === 'money' || worst.id === 'safety' || worst.id === 'stock' ? 'officeB' : worst.id === 'data' ? 'officeC' : 'officeA');
    t.check('no single long task over 400 ms while paging through the office (worst page: ' + ltWorst.id + ', ' + Math.max(0, ...ltWorst.lt) + ' ms)', lt.every((x) => x < 400), rows.filter((r) => r.lt.length).map((r) => r.id + ': ' + r.lt.join('+')).join(' | '), ltWorst.id === 'money' || ltWorst.id === 'safety' || ltWorst.id === 'stock' ? 'officeB' : ltWorst.id === 'data' ? 'officeC' : 'officeA');
    // filter change on Pace: how long until the numbers change
    await gotoOffice(page, 'pace', 8000);
    const fl = await page.evaluate(async () => {
      const seg = Array.from(document.querySelectorAll('#sb-office [role=radio], #sb-office [role=tab], #sb-office .seg-opt')).find((b) => /^\s*(7 days|Last 7|7)\b/i.test(b.textContent));
      if (!seg) return { missing: true };
      const t0 = performance.now(); seg.click();
      await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      return { ms: performance.now() - t0 };
    });
    if (fl.missing) t.skipCheck('filter change timing', 'no "7 days" control found on Pace'); else { t.note('Pace: change the date range to 7 days, until painted', r1(fl.ms), 'ms'); t.check('changing the date range repaints within 700 ms', fl.ms < 700, fl.ms, 'officeA'); }
    await t.clean(page, 'office perf');
  });

  h.test('11c-sixty-tickets', 'Performance: 60 active tickets on the board, 1 Hz update cost and frame health', { owner: 'board', timeout: 90000 }, async (t) => {
    const page = await t.open({ w: 1280, h: 800 });
    const made = await page.evaluate(() => {
      const S = SB.store, now = S.now(); let ok = 0, bad = [];
      const menus = ['brisket_half', 'ribs_full', 'sausage', 'mac', 'slaw', 'cornbread', 'hushpuppies', 'fried_pickles', 'tea', 'pudding', 'brisket_sand'];
      for (let i = 0; i < 60; i++) {
        const items = [{ menuId: menus[i % menus.length] }, { menuId: menus[(i * 5 + 3) % menus.length] }, { menuId: menus[(i * 7 + 1) % menus.length], qty: 1 + (i % 2) }];
        const r = S.dispatchEx('createTicket', { customer: 'Perf ' + (i + 1), channel: ['dine_in', 'takeout', 'drive_thru'][i % 3], items, src: 'demo', allowPast: true, createdAt: now - (i % 20) * 60e3 - 10e3, rush: i % 11 === 0 }, { source: 'sim' });
        if (r.report === 'ok') ok++; else bad.push(r.report);
      }
      S.tick();
      return { ok, bad: bad.slice(0, 3) };
    });
    t.check('60 test tickets could be created (some dishes may be 86, so 50 or more)', made.ok >= 50, made, 'sim');
    await settle(page, 800);
    const slips = await page.evaluate(() => ({ dom: document.querySelectorAll('.fl-grid > .fl-slip').length, tab: Number((document.querySelector('.fl-seg .seg-opt[data-id=all] .seg-count') || {}).textContent), active: SB.store.getState().tickets.filter((x) => x.status === 'active').length, stats: SB.floor && SB.floor.stats ? SB.floor.stats() : null }));
    t.note('slips on the board after creating ' + made.ok + ' tickets', slips.dom, 'slips');
    if (slips.stats) t.note('board full render with that many slips (lastRenderMs)', r1(slips.stats.lastRenderMs), 'ms');
    t.check('every active ticket has a slip in the DOM (no hidden or virtualised ones lost)', slips.dom === slips.active, slips, 'board');
    t.check('the All tab count matches the slips', slips.tab === slips.dom, slips, 'board');
    await t.shot(page, 'perf-60-tickets');
    await watchLongTasks(page);
    // frame counter for 6 s of 1 Hz ticking
    await page.evaluate(() => { window.__fr = { n: 0, slow: 0, last: performance.now(), worst: 0 }; const f = () => { const n = performance.now(), d = n - window.__fr.last; window.__fr.last = n; window.__fr.n++; if (d > 50) window.__fr.slow++; if (d > window.__fr.worst) window.__fr.worst = d; requestAnimationFrame(f); }; requestAnimationFrame(f); });
    const ticks = [];
    for (let i = 0; i < 6; i++) { await wait(1000); const s = await page.evaluate(() => SB.floor.stats()); ticks.push(s); }
    const fr = await page.evaluate(() => window.__fr);
    const lt = await page.evaluate(() => window.__lt || []);
    const last = ticks.map((x) => x.lastTickMs);
    t.note('1 Hz tick with ' + slips.dom + ' slips: median cost', r1(median(last)), 'ms');
    t.note('1 Hz tick: worst cost seen (maxTickMs)', r1(ticks[ticks.length - 1].maxTickMs), 'ms');
    t.note('frames in 6 s / frames slower than 50 ms / worst frame', fr.n + ' / ' + fr.slow + ' / ' + Math.round(fr.worst) + ' ms', '');
    t.note('long tasks over 50 ms during the 6 s', lt.length ? lt.join(', ') : 'none', 'ms');
    t.check('the 1 Hz tick with 60 slips costs under 25 ms (median)', median(last) < 25, last.map((x) => r1(x)), 'board');
    t.check('the worst single tick stays under 120 ms', ticks[ticks.length - 1].maxTickMs < 120, ticks[ticks.length - 1].maxTickMs, 'board');
    t.check('the clock ticked about once a second (5 to 7 ticks in 6 s)', ticks[5].ticks - ticks[0].ticks >= 4, ticks.map((x) => x.ticks), 'board');
    t.check('no main-thread stall over 250 ms during the 6 s', lt.every((x) => x < 250), lt, 'board');
    // one action on a big board: bump a ticket and time the redraw
    const act = await page.evaluate(async () => {
      const tk = SB.store.getState().tickets.find((x) => x.status === 'active'); if (!tk) return null;
      const t0 = performance.now(); SB.store.dispatchEx('completeZone', { ticketId: tk.id, zone: tk.items[0].zone }, { source: 'ui' });
      await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      return performance.now() - t0;
    });
    if (act != null) { t.note('one "All done here" on a board of 60: dispatch to painted', r1(act), 'ms'); }
    await t.clean(page, '60 tickets');
  });
}
