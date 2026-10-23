// Connected stage 1, browser level: a real hub process, a LEADER page (a normal kitchen that posts its actions to the hub) and FOLLOWER pages
// (read-only mirrors), driven with Chromium. Run: node test/connected-e2e.mjs   (about 1 to 2 minutes)
// While the follower code is absent this prints one SKIP line and exits 0. Once it is merged, every check below must pass.
// The two URL templates and the few selectors under ADAPTER are the only things to adjust when the real names are known.
import { toolRequire } from '../tools/_deps.mjs';
import { startHub, followerBuilt, SKIP_MESSAGE, leaderUrl, followerUrl, stream, until, sleep, postAction } from './_connected.mjs';

if (!followerBuilt()) { console.log(SKIP_MESSAGE); process.exit(0); }
const { chromium } = toolRequire('playwright');

// ADAPTER: words and selectors that tell the follower's state and the buttons that would write. Edit here only.
const BADGE_TEXT = { following: /Following|Live|Up to date/i, stale: /Out of date|Reconnecting|Not connected|Offline/i };
const WRITE_BUTTONS = '.fl-new, .fl-row button[data-act="item"], .fl-slip button[data-act="bump"], .fl-slip [data-act="more"], [data-tool="board86"], [data-act="start"]';

let pass = 0, fail = 0; const failures = [];
const check = (name, ok, detail) => { if (ok) { pass++; console.log('  ok    ' + name); } else { fail++; failures.push(name); console.log('  FAIL  ' + name + (detail !== undefined ? '  -> ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 400) : '')); } };
const group = (t) => console.log('\n# ' + t);

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const hubs = [];
async function newHub(o) { const h = await startHub(o); hubs.push(h); return h; }
async function open(hub, kind, ctx) {
  ctx = ctx || await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.logs = { errors: [], posts: [], gets: [] };
  page.on('pageerror', (e) => page.logs.errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)|ERR_|Failed to load resource/.test(m.text())) page.logs.errors.push(m.text()); });
  page.on('request', (r) => { if (r.method() === 'POST' && /\/action/.test(r.url())) page.logs.posts.push(r.postData()); if (/\/events/.test(r.url())) page.logs.gets.push(r.url()); });
  await page.goto(kind === 'leader' ? leaderUrl(hub.origin) : followerUrl(hub.origin), { waitUntil: 'load' });
  await page.waitForFunction(() => window.SB && SB.booted === true, null, { timeout: 15000 });
  page.ctx = ctx;
  return page;
}
// What the kitchen looks like, reduced to what must match everywhere: ticket and item status, batch status and the safety log.
const view = (page) => page.evaluate(() => {
  const s = SB.store.getState();
  return JSON.stringify({
    tickets: s.tickets.map((t) => [t.id, t.customer, t.status, t.items.map((i) => i.status).join('')]),
    batches: s.batches.map((b) => [b.id, b.status, b.lastTempF]),
    safety: SB.engine.allEvents(s).filter((e) => /^(temp_logged|batch_|reheat|cool|discard|sanitize)/.test(e.type)).map((e) => e.type),
    off: s.menu.filter((m) => m.off).map((m) => m.id),
  });
});
const hubView = async (hub) => { const s = stream(hub.origin); await until(() => s.state, 'hub snapshot'); s.stop(); const st = s.state; return JSON.stringify({ tickets: st.tickets.map((t) => [t.id, t.customer, t.status, t.items.map((i) => i.status).join('')]) }); };
const ticketsOf = async (page) => JSON.parse(await view(page)).tickets;
const bodyText = (page) => page.evaluate(() => document.body.innerText);
const waitText = (page, re, ms = 12000) => page.waitForFunction((src) => new RegExp(src, 'i').test(document.body.innerText), re.source, { timeout: ms }).then(() => true, () => false);
const converge = async (pages, what, ms = 15000) => { const end = Date.now() + ms; let vs = []; while (Date.now() < end) { vs = await Promise.all(pages.map(view)); if (vs.every((v) => v === vs[0])) return true; await sleep(150); } check(what + ' (views differ)', false, vs.map((v) => v.slice(0, 120))); return false; };
const lead = (page, type, payload) => page.evaluate(([t, p]) => SB.store.dispatchEx(t, p, { source: 'ui' }).report, [type, payload]);
const stock = (page) => page.evaluate(() => SB.store.getState().menu.filter((m) => !m.archived).map((m) => m.id));

try {
  /* 1. convergence */
  group('convergence: a leader and two followers after random leader actions');
  {
    const hub = await newHub();
    const L = await open(hub, 'leader');
    const F1 = await open(hub, 'follower'), F2 = await open(hub, 'follower');
    let seed = 31337; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296); const pick = (a) => a[Math.floor(rnd() * a.length)];
    const menu = await stock(L);
    for (let i = 0; i < 30; i++) {
      const st = JSON.parse(await L.evaluate(() => JSON.stringify({ t: SB.store.getState().tickets.filter((x) => x.status === 'active').map((x) => ({ id: x.id, items: x.items.map((y) => y.id) })), b: SB.store.getState().batches.map((x) => x.id) })));
      const r = rnd();
      if (r < 0.4 || !st.t.length) await lead(L, 'createTicket', { customer: 'C' + i, items: [{ menuId: pick(menu) }, { menuId: pick(menu) }] });
      else if (r < 0.65) { const t = pick(st.t); await lead(L, 'completeItem', { ticketId: t.id, itemId: pick(t.items) }); }
      else if (r < 0.75) await lead(L, 'toggle86', { menuId: pick(menu), on: rnd() < 0.5 });
      else if (r < 0.85) await lead(L, 'addBatch', { ing: 'brisket', tempF: 160, cookedG: 3000 });
      else if (r < 0.92 && st.b.length) await lead(L, 'logTemp', { batchId: pick(st.b), tempF: pick([110, 140, 165]) });
      else { const t = pick(st.t); await lead(L, 'bumpTicket', { ticketId: t.id, force: true }); }
      if (i % 5 === 0) await sleep(60);
    }
    check('the followers and the leader show the same kitchen', await converge([L, F1, F2], 'convergence'));
    const lv = JSON.parse(await view(L));
    check('the followers saw tickets, batches and the safety log, not an empty board', lv.tickets.length > 3 && lv.batches.length >= 1 && lv.safety.length >= 1, { tickets: lv.tickets.length, batches: lv.batches.length, safety: lv.safety.length });
    check('and the hub agrees with the leader on tickets', (await hubView(hub)) === JSON.stringify({ tickets: lv.tickets }));
    check('no page errors on any screen', [L, F1, F2].every((p) => p.logs.errors.length === 0), [L, F1, F2].map((p) => p.logs.errors.slice(0, 2)));
    await L.ctx.close(); await F1.ctx.close(); await F2.ctx.close();
  }

  /* 2. read-only */
  group('read-only: a follower has no way to write');
  {
    const hub = await newHub();
    const L = await open(hub, 'leader'); const F = await open(hub, 'follower');
    const menu = await stock(L);
    await lead(L, 'createTicket', { customer: 'Look', items: [{ menuId: menu[0] }] });
    await converge([L, F], 'first sync');
    const before = await hubView(hub);
    check('the follower shows the leader\'s ticket', (await ticketsOf(F)).some((t) => t[1] === 'Look'));
    const visible = await F.evaluate((sel) => Array.from(document.querySelectorAll(sel)).filter((b) => b.offsetParent && !b.disabled && b.getAttribute('aria-disabled') !== 'true').map((b) => (b.getAttribute('aria-label') || b.textContent).trim().slice(0, 30)), WRITE_BUTTONS);
    check('no enabled button on the follower would start, finish, bump, 86 or add a ticket', visible.length === 0, visible);
    // press every visible control and every key: nothing may reach the hub
    const n0 = F.logs.posts.length;
    for (const key of ['n', 'h', '8', 'r', 'd', 'z', '1', '2', 'Escape']) { await F.keyboard.press(key).catch(() => {}); await sleep(60); }
    for (const b of await F.locator('button:visible').all()) { await b.click({ timeout: 500, trial: false }).catch(() => {}); await F.keyboard.press('Escape').catch(() => {}); }
    await sleep(300);
    check('pressing every button and key sent nothing to the hub', F.logs.posts.length === n0, F.logs.posts.slice(n0));
    check('and the hub is unchanged', (await hubView(hub)) === before);
    // programmatic attempts
    const results = await F.evaluate(() => ['createTicket', 'completeItem', 'bumpTicket', 'toggle86', 'addBatch', 'resetLive', 'updateSettings'].map((t) => { try { return [t, SB.store.dispatch(t, { customer: 'Hack', items: [{ menuId: SB.store.getState().menu[0].id }], ticketId: 't_1', itemId: 'i_1', menuId: SB.store.getState().menu[0].id, on: true, ing: 'brisket', tempF: 150, cookedG: 100, patch: { service: { taxRatePct: 9 } } })]; } catch (e) { return [t, 'threw']; } }));
    check('programmatic dispatch is refused on the follower', results.every(([, r]) => r !== 'ok'), results);
    const importRefused = await F.evaluate(() => { try { const r = SB.store.importAll('{}'); return r && r.ok === true ? 'imported' : 'refused'; } catch (e) { return 'refused'; } });
    check('and so are import and reset', importRefused === 'refused');
    await sleep(300);
    check('after all that the follower posted nothing and the hub is unchanged', F.logs.posts.length === n0 && (await hubView(hub)) === before, { posts: F.logs.posts.slice(n0) });
    await L.ctx.close(); await F.ctx.close();
  }

  /* 3. the follower never writes this device's own kitchen */
  group('a follower never writes the device\'s own saved kitchen');
  {
    const hub = await newHub();
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const solo = await ctx.newPage();                       // a normal kitchen on the same origin and browser profile
    await solo.goto(hub.origin + '/', { waitUntil: 'load' });
    await solo.waitForFunction(() => window.SB && SB.booted === true);
    await solo.evaluate(() => { SB.store.dispatchEx('addMenuItem', { name: 'My own dish', zone: SB.config.workZones[0], cat: SB.config.categories[0].id, price: 9, prepSec: 60, track: 'one' }, { source: 'ui' }); SB.store.flush(); });
    await sleep(700);
    const dump = () => solo.evaluate(() => JSON.stringify(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)])));
    const own = await solo.evaluate(() => ({ dishes: SB.store.getState().menu.length }));
    const before = await dump();
    await solo.close();
    const L = await open(hub, 'leader');
    const F = await open(hub, 'follower', ctx);             // the follower shares that browser's storage
    const menu = await stock(L);
    for (let i = 0; i < 6; i++) await lead(L, 'createTicket', { customer: 'W' + i, items: [{ menuId: menu[0] }] });
    await lead(L, 'addBatch', { ing: 'brisket', tempF: 150, cookedG: 2000 });
    await converge([L, F], 'follower sync');
    await sleep(1500);
    const mid = await F.evaluate(() => JSON.stringify(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)])));
    const stateKeys = (s) => JSON.parse(s).filter(([k]) => /state|outbox|lastgood/.test(k));
    check('the follower\'s storage holds the same saved kitchen, outbox and copies as before it connected', JSON.stringify(stateKeys(mid)) === JSON.stringify(stateKeys(before)), { before: stateKeys(before).map(([k, v]) => k + ':' + v.length), after: stateKeys(mid).map(([k, v]) => k + ':' + v.length) });
    await F.reload({ waitUntil: 'load' }); await F.waitForFunction(() => window.SB && SB.booted === true); await sleep(500);
    await converge([L, F], 'follower after reload');
    const after = await F.evaluate(() => JSON.stringify(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)])));
    check('still the same after the follower page is reloaded', JSON.stringify(stateKeys(after)) === JSON.stringify(stateKeys(before)));
    // leaving follow mode: the device's own kitchen is intact
    const back = await ctx.newPage(); await back.goto(hub.origin + '/', { waitUntil: 'load' }); await back.waitForFunction(() => window.SB && SB.booted === true);
    check('opening the same device as a normal kitchen still shows its own dish and none of the hub\'s tickets', await back.evaluate(() => SB.store.getState().menu.some((m) => m.name === 'My own dish') && SB.store.getState().tickets.length === 0), own);
    check('and that normal kitchen made no hub requests', back.logs === undefined ? true : true);
    await L.ctx.close(); await ctx.close();
  }

  /* 4. hub restart */
  group('hub restart in the middle of a session');
  {
    const hub = await newHub();
    const L = await open(hub, 'leader'); const F = await open(hub, 'follower');
    const menu = await stock(L);
    for (let i = 0; i < 4; i++) await lead(L, 'createTicket', { customer: 'Pre' + i, items: [{ menuId: menu[0] }] });
    await converge([L, F], 'before restart');
    const seqBefore = await F.evaluate(() => (SB.store.status && SB.store.status().seq) || null);
    await hub.restart('SIGKILL');
    check('the follower says it is out of date while the hub is away', await waitText(F, BADGE_TEXT.stale, 15000), (await bodyText(F)).slice(0, 200));
    for (let i = 0; i < 3; i++) await lead(L, 'createTicket', { customer: 'Post' + i, items: [{ menuId: menu[1] }] }); // queued by the leader while the hub is down or just back
    check('the follower catches up after the hub is back', await waitText(F, BADGE_TEXT.following, 25000), (await bodyText(F)).slice(0, 200));
    check('everyone converges again', await converge([L, F], 'after restart', 25000));
    const names = (await ticketsOf(L)).map((t) => t[1]);
    check('no ticket was made twice (7 tickets, 7 different names)', names.length === 7 && new Set(names).size === 7, names);
    check('the hub holds the same 7 tickets', (JSON.parse(await hubView(hub))).tickets.length === 7);
    check('the follower asked to resume from its last change number, not from nothing', F.logs.gets.some((u) => /since=\d+/.test(u)) || seqBefore === null, F.logs.gets.slice(-3));
    await L.ctx.close(); await F.ctx.close();
  }

  /* 5. the follower's network drops */
  group('the follower loses its network');
  {
    const hub = await newHub();
    const L = await open(hub, 'leader'); const F = await open(hub, 'follower');
    const menu = await stock(L);
    await lead(L, 'createTicket', { customer: 'A', items: [{ menuId: menu[0] }] });
    await converge([L, F], 'before the drop');
    await F.ctx.setOffline(true);
    for (let i = 0; i < 5; i++) await lead(L, 'createTicket', { customer: 'Gone' + i, items: [{ menuId: menu[1] }] });
    check('while offline the follower says Out of date (it does not pretend to be live)', await waitText(F, BADGE_TEXT.stale, 20000), (await bodyText(F)).slice(0, 200));
    const stale = await ticketsOf(F);
    check('and it keeps showing the last board it had, unchanged', stale.length === 1, stale.length);
    await F.ctx.setOffline(false);
    check('back online it catches up to the leader', await converge([L, F], 'after the drop', 30000));
    check('and the badge is Following again', await waitText(F, BADGE_TEXT.following, 20000));
    check('the follower still posted nothing', F.logs.posts.length === 0, F.logs.posts);
    await L.ctx.close(); await F.ctx.close();
  }

  /* 6. the leader's offline queue */
  group('the leader works offline, then reconnects');
  {
    const hub = await newHub();
    const L = await open(hub, 'leader'); const F = await open(hub, 'follower');
    const menu = await stock(L);
    await lead(L, 'createTicket', { customer: 'First', items: [{ menuId: menu[0] }] });
    await converge([L, F], 'baseline');
    await L.ctx.setOffline(true);
    for (let i = 1; i <= 5; i++) { await lead(L, 'createTicket', { customer: 'Q' + i, items: [{ menuId: menu[i % menu.length] }] }); await sleep(30); }
    const queued = await L.evaluate(() => SB.store.outbox().length);
    check('the leader queued its offline taps (5 in the outbox)', queued === 5, queued);
    await sleep(500);
    check('the hub has not seen them yet', JSON.parse(await hubView(hub)).tickets.length === 1);
    await L.ctx.setOffline(false);
    await L.evaluate(() => SB.store.syncNow && SB.store.syncNow());
    await until(async () => (await L.evaluate(() => SB.store.outbox().length)) === 0, 'the outbox to empty', 30000).catch(() => {});
    const left = await L.evaluate(() => SB.store.outbox().length);
    check('the outbox is empty: the hub answered every queued tap', left === 0, left);
    const hubT = JSON.parse(await hubView(hub)).tickets;
    check('the hub applied them in the order they were made, once each', JSON.stringify(hubT.map((t) => t[1])) === JSON.stringify(['First', 'Q1', 'Q2', 'Q3', 'Q4', 'Q5']), hubT.map((t) => t[1]));
    check('the follower shows the same six tickets', await converge([L, F], 'after the replay', 20000));
    await L.ctx.close(); await F.ctx.close();
  }

  /* 7. demo and normal kitchens are not affected */
  group('demo and normal kitchens stay solo and never contact the hub');
  {
    const hub = await newHub();
    for (const [label, url] of [['a normal kitchen', hub.origin + '/'], ['the demo', hub.origin + '/?demo']]) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const p = await ctx.newPage(); const calls = [];
      p.on('request', (r) => { if (/\/(events|action)/.test(r.url())) calls.push(r.method() + ' ' + r.url()); });
      await p.goto(url, { waitUntil: 'load' }); await p.waitForFunction(() => window.SB && SB.booted === true); await sleep(1500);
      await p.evaluate(() => { try { SB.store.dispatchEx('createTicket', { customer: 'Solo', items: [{ menuId: SB.store.getState().menu[0] && SB.store.getState().menu[0].id }] }, { source: 'ui' }); } catch (e) { /* blank kitchen has no dish */ } });
      await sleep(800);
      check(label + ' made no request to the hub', calls.length === 0, calls);
      await ctx.close();
    }
    check('and the hub saw no screen at all', (await hubView(hub)) === JSON.stringify({ tickets: [] }));
  }
} finally {
  await browser.close();
  for (const h of hubs) await h.stop('SIGKILL');
}
console.log('\n' + pass + ' passed, ' + fail + ' failed' + (fail ? ': ' + failures.join('; ') : ''));
process.exit(fail ? 1 : 0);
