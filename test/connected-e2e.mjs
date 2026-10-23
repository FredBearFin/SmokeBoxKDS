// Connected stage 1, browser level: a real hub process on a free port with a temp data folder, a LEADER (plain HTTP posts of actions with an opId
// each, as a cooking tablet will send them; there is no writing tablet in stage 1) and one or more FOLLOWER pages (the hub's own page opened
// with ?follow). Run: node test/connected-e2e.mjs   (about 2 minutes). Prints one SKIP line and exits 0 while the follower code is absent.
import { toolRequire } from '../tools/_deps.mjs';
import { startHub, followerBuilt, SKIP_MESSAGE, followerUrl, httpLeader, stream, until, sleep } from './_connected.mjs';

if (!followerBuilt()) { console.log(SKIP_MESSAGE); process.exit(0); }
const { chromium } = toolRequire('playwright');

// ADAPTER: the words on the follower's connection chip and the controls that would write. The only place to edit if the screen changes.
const CHIP = { following: /Connected/, reconnecting: /Reconnecting/, stale: /Out of date/ };
const WRITE_BUTTONS = '.fl-new, .fl-bump, [data-act="zone"], .fl-row button[data-act="item"], .fl-slip button[data-act="bump"], [data-tool="board86"], [data-tool="recall"]';
const STALE_MS = 6000; // the follower's silence limit, shortened for the test (the real default is 45 s)

let pass = 0, fail = 0; const failures = [];
const check = (name, ok, detail) => { if (ok) { pass++; console.log('  ok    ' + name); } else { fail++; failures.push(name); console.log('  FAIL  ' + name + (detail !== undefined ? '  -> ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 500) : '')); } };
const group = (t) => console.log('\n# ' + t);

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const hubs = [];
async function newHub(o) { const h = await startHub(o); hubs.push(h); return h; }
async function openFollower(hub, ctx, { code } = {}) {
  ctx = ctx || await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript((ms) => { let w = false; const iv = setInterval(() => { if (w || !window.SB || !SB.store || !SB.store.initFollower) return; w = true; clearInterval(iv); const f = SB.store.initFollower; SB.store.initFollower = (o) => f(Object.assign({ staleMs: ms }, o)); }, 1); }, STALE_MS);
  const page = await ctx.newPage();
  page.logs = { errors: [], posts: [], gets: [] };
  page.on('pageerror', (e) => page.logs.errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)|ERR_|Failed to load resource/.test(m.text())) page.logs.errors.push(m.text()); });
  page.on('request', (r) => { if (r.method() !== 'GET' && /\/(action|follow|events)/.test(r.url())) page.logs.posts.push(r.method() + ' ' + r.url()); if (/\/follow\?|\/follow$/.test(r.url())) page.logs.gets.push(r.url()); });
  await page.goto(followerUrl(hub.origin, code), { waitUntil: 'load' });
  await page.waitForFunction(() => window.SB && SB.booted === true, null, { timeout: 15000 });
  page.ctx = ctx;
  return page;
}
// What a screen shows, reduced to what must match: tickets with item statuses, batches, the safety events and the 86 list.
const PROJ = (s, E) => JSON.stringify({
  tickets: s.tickets.map((t) => [t.id, t.customer, t.status, t.items.map((i) => i.status).join('')]),
  batches: s.batches.map((b) => [b.id, b.status, b.lastTempF]),
  safety: E.allEvents(s).filter((e) => /^(temp_logged|batch_|reheat|cool|discard|sanitize)/.test(e.type)).map((e) => e.type),
  off: s.menu.filter((m) => m.off).map((m) => m.id),
});
const view = (page) => page.evaluate(`(${PROJ.toString()})(SB.store.getState(), SB.engine)`);
const hubView = async (hub) => { const s = stream(hub.origin); await until(() => s.state, 'hub snapshot'); s.stop(); const { default: _ } = { default: 0 }; return s.state; };
let SBnode = null;
async function nodeEngine() { if (!SBnode) { const { loadSB } = await import('./_load.mjs'); SBnode = await loadSB(['00-util', '10-config', '20-engine']); } return SBnode.engine; }
const hubProj = async (hub) => PROJ(await hubView(hub), await nodeEngine());
const chipText = (page) => page.evaluate(() => { const c = document.querySelector('.fl-fchip'); return c ? c.innerText.replace(/\n/g, ' ') : ''; });
const waitChip = (page, re, ms = 15000) => page.waitForFunction((src) => { const c = document.querySelector('.fl-fchip'); return !!c && new RegExp(src).test(c.innerText); }, re.source, { timeout: ms }).then(() => true, () => false);
const converge = async (pages, hub, what, ms = 15000) => { const end = Date.now() + ms; let vs = [], hv = ''; while (Date.now() < end) { hv = await hubProj(hub); vs = await Promise.all(pages.map(view)); if (vs.every((v) => v === hv)) return true; await sleep(150); } check(what + ': screens differ from the hub', false, { hub: hv.slice(0, 160), screens: vs.map((v) => v.slice(0, 160)) }); return false; };
const hubTickets = async (hub) => (await hubView(hub)).tickets;

try {
  /* 1. convergence */
  group('convergence: a leader and two followers after 40 random leader actions');
  {
    const hub = await newHub(); const lead = httpLeader(hub.origin);
    const F1 = await openFollower(hub), F2 = await openFollower(hub);
    check('both followers say Connected', await waitChip(F1, CHIP.following) && await waitChip(F2, CHIP.following), [await chipText(F1), await chipText(F2)]);
    let seed = 31337; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296); const pick = (a) => a[Math.floor(rnd() * a.length)];
    const menu = (await hubView(hub)).menu.map((m) => m.id);
    for (let i = 0; i < 40; i++) {
      const st = await hubView(hub), act = st.tickets.filter((t) => t.status === 'active'), r = rnd();
      if (r < 0.35 || !act.length) await lead.act('createTicket', { customer: 'C' + i, items: [{ menuId: pick(menu) }, { menuId: pick(menu) }] });
      else if (r < 0.6) { const t = pick(act); await lead.act('completeItem', { ticketId: t.id, itemId: pick(t.items).id }); }
      else if (r < 0.7) await lead.act('toggle86', { menuId: pick(menu), on: rnd() < 0.5 });
      else if (r < 0.8) await lead.act('addBatch', { ing: 'brisket', tempF: 160, cookedG: 3000 });
      else if (r < 0.88 && st.batches.length) await lead.act('logTemp', { batchId: pick(st.batches).id, tempF: pick([110, 140, 165]) });
      else await lead.act('bumpTicket', { ticketId: pick(act).id, force: true });
      if (i % 6 === 0) await sleep(40);
    }
    check('both followers show exactly what the hub holds', await converge([F1, F2], hub, 'convergence'));
    const st = await hubView(hub);
    check('the followers saw tickets, batches and the safety log, not an empty board', st.tickets.length > 3 && st.batches.length >= 1, { tickets: st.tickets.length, batches: st.batches.length });
    check('the board draws one slip per active ticket', await F1.evaluate(() => document.querySelectorAll('.fl-slip').length) === st.tickets.filter((t) => t.status === 'active').length);
    check('no page errors on any follower', F1.logs.errors.length === 0 && F2.logs.errors.length === 0, [F1.logs.errors, F2.logs.errors]);
    await F1.ctx.close(); await F2.ctx.close();
  }

  /* 2. read-only */
  group('read-only: a follower has no way to write');
  {
    const hub = await newHub(); const lead = httpLeader(hub.origin);
    const F = await openFollower(hub);
    const menu = (await hubView(hub)).menu.map((m) => m.id);
    await lead.act('createTicket', { customer: 'Look', items: [{ menuId: menu[0] }] });
    await converge([F], hub, 'first sync');
    const before = JSON.stringify(await hubView(hub));
    check('the follower shows the leader\'s ticket', await F.evaluate(() => SB.store.getState().tickets.some((t) => t.customer === 'Look')));
    const visible = await F.evaluate((sel) => Array.from(document.querySelectorAll(sel)).filter((b) => b.offsetParent && !b.disabled && b.getAttribute('aria-disabled') !== 'true').map((b) => (b.getAttribute('aria-label') || b.textContent).trim().slice(0, 30)), WRITE_BUTTONS);
    check('no enabled control on the follower would add, start, finish, bump or 86', visible.length === 0, visible);
    const n0 = F.logs.posts.length;
    for (const key of ['n', 'r', 'h', '8', 'd', 'z', '1', '2', '3', 'Escape', 'Enter', ' ']) { await F.keyboard.press(key).catch(() => {}); await sleep(50); }
    for (const b of await F.locator('button:visible').all()) { await b.click({ timeout: 400 }).catch(() => {}); await F.keyboard.press('Escape').catch(() => {}); }
    for (const t of await F.locator('.fl-slip, .fl-row').all()) { await t.click({ timeout: 300 }).catch(() => {}); await t.dblclick({ timeout: 300 }).catch(() => {}); }
    await sleep(300);
    check('pressing every button, key, slip and row sent nothing to the hub', F.logs.posts.length === n0, F.logs.posts.slice(n0));
    check('and the hub is unchanged', JSON.stringify(await hubView(hub)) === before);
    const results = await F.evaluate(() => ['createTicket', 'completeItem', 'advanceItem', 'bumpTicket', 'toggle86', 'addBatch', 'logTemp', 'resetLive', 'updateSettings', 'startOver'].map((t) => { try { const m = SB.store.getState().menu[0].id; return [t, SB.store.dispatch(t, { customer: 'Hack', items: [{ menuId: m }], ticketId: 't_1', itemId: 'i_1', menuId: m, on: true, ing: 'brisket', tempF: 150, cookedG: 100, patch: { service: { taxRatePct: 9 } }, batchId: 'b_1' })]; } catch (e) { return [t, 'threw']; } }));
    check('programmatic dispatch is refused with followerReadOnly (and never "ok")', results.every(([, r]) => r !== 'ok') && results.filter(([, r]) => r === 'followerReadOnly').length >= 8, results);
    const imp = await F.evaluate(() => { try { const r = SB.store.importAll(JSON.stringify({ v: 1 })); return r && r.ok ? 'imported' : 'refused'; } catch (e) { return 'refused'; } });
    const so = await F.evaluate(() => { try { const r = SB.store.startOver({ confirm: 'ERASE' }); return r && r.ok ? 'erased' : 'refused'; } catch (e) { return 'refused'; } });
    const rc = await F.evaluate(async () => { try { const r = await SB.store.createRecoveryCode(); return r && r.ok ? 'made' : 'refused'; } catch (e) { return 'refused'; } });
    check('import, Start over and a recovery code are refused too', imp === 'refused' && so === 'refused' && rc === 'refused', { imp, so, rc });
    await sleep(300);
    check('after all that the follower posted nothing and the hub is unchanged', F.logs.posts.length === n0 && JSON.stringify(await hubView(hub)) === before, F.logs.posts.slice(n0));
    check('the screen says it only shows the kitchen', /only shows the kitchen/i.test(await F.evaluate(() => document.body.innerText)));
    await F.ctx.close();
  }

  /* 3. the follower never writes this device's own saved kitchen */
  group('a follower never writes the device\'s own saved kitchen');
  {
    const hub = await newHub(); const lead = httpLeader(hub.origin);
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const solo = await ctx.newPage();                       // a normal kitchen on the same origin and browser profile
    await solo.goto(hub.origin + '/', { waitUntil: 'load' });
    await solo.waitForFunction(() => window.SB && SB.booted === true);
    await solo.evaluate(() => { SB.store.dispatchEx('addMenuItem', { name: 'My own dish', zone: SB.config.workZones[0], cat: SB.config.categories[0].id, price: 9, prepSec: 60, track: 'one' }, { source: 'ui' }); SB.store.saveDraft && SB.store.saveDraft({ lines: [{ menuId: 'x', qty: 1 }] }); SB.store.flush(); });
    await sleep(700);
    const dump = (pg) => pg.evaluate(() => JSON.stringify(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)])));
    const before = await dump(solo);
    await solo.close();
    const F = await openFollower(hub, ctx);                 // the follower shares that browser profile's storage
    const menu = (await hubView(hub)).menu.map((m) => m.id);
    for (let i = 0; i < 6; i++) await lead.act('createTicket', { customer: 'W' + i, items: [{ menuId: menu[0] }] });
    await lead.act('addBatch', { ing: 'brisket', tempF: 150, cookedG: 2000 });
    await converge([F], hub, 'follower sync');
    await sleep(1500);
    const keep = (s) => JSON.stringify(JSON.parse(s).filter(([k]) => !/follow\.sound|sid$|tab/i.test(k)));
    const mid = await dump(F);
    check('while following, localStorage is exactly what the device had before (kitchen, draft, outbox, copies)', keep(mid) === keep(before), { before: JSON.parse(before).map(([k, v]) => k + ':' + v.length), after: JSON.parse(mid).map(([k, v]) => k + ':' + v.length) });
    await F.reload({ waitUntil: 'load' }); await F.waitForFunction(() => window.SB && SB.booted === true); await sleep(600);
    await converge([F], hub, 'after reload');
    check('and still the same after the follower page is reloaded', keep(await dump(F)) === keep(before));
    check('the follower\'s own state is the hub\'s kitchen, not the device\'s (no "My own dish")', await F.evaluate(() => !SB.store.getState().menu.some((m) => m.name === 'My own dish')));
    const back = await ctx.newPage(); await back.goto(hub.origin + '/', { waitUntil: 'load' }); await back.waitForFunction(() => window.SB && SB.booted === true);
    check('the same device opened as a normal kitchen still shows its own dish and none of the hub\'s tickets', await back.evaluate(() => SB.store.getState().menu.some((m) => m.name === 'My own dish') && SB.store.getState().tickets.length === 0));
    await ctx.close();
  }

  /* 4. hub restart */
  group('hub restart in the middle of a session (hard crash)');
  {
    const hub = await newHub(); const lead = httpLeader(hub.origin);
    const F = await openFollower(hub);
    const menu = (await hubView(hub)).menu.map((m) => m.id);
    for (let i = 0; i < 4; i++) await lead.act('createTicket', { customer: 'Pre' + i, items: [{ menuId: menu[0] }] });
    await converge([F], hub, 'before the restart');
    const seqBefore = await F.evaluate(() => SB.store.followStatus().seq);
    await hub.restart('SIGKILL');
    check('the follower leaves "Connected" while the hub is away (Reconnecting, then Out of date)', await F.waitForFunction(() => { const c = document.querySelector('.fl-fchip'); return !!c && !/Connected/.test(c.innerText); }, null, { timeout: 15000 }).then(() => true, () => false), await chipText(F));
    for (let i = 0; i < 3; i++) await lead.act('createTicket', { customer: 'Post' + i, items: [{ menuId: menu[1] }] });
    check('the follower is Connected again after the hub is back', await waitChip(F, CHIP.following, 30000), await chipText(F));
    check('everyone converges', await converge([F], hub, 'after restart', 25000));
    const names = (await hubTickets(hub)).map((t) => t.customer);
    check('the hub holds 7 tickets with 7 different names (nothing twice)', names.length === 7 && new Set(names).size === 7, names);
    const resumed = F.logs.gets.filter((u) => /since=\d+/.test(u));
    check('the follower asked to resume from its change number (' + seqBefore + ') and the same history id', resumed.some((u) => new RegExp('since=' + seqBefore + '(&|$)').test(u) && /hub=[0-9a-f]+/.test(u)), F.logs.gets.slice(-3));
    // a resent action after the restart is answered once
    const again = await lead.act('createTicket', { customer: 'Pre0', items: [{ menuId: menu[0] }] }, { opId: 'leader:1' });
    check('a resent action is answered as a duplicate and not applied again', again.duplicate === true && (await hubTickets(hub)).length === 7, again);
    await F.ctx.close();
  }

  /* 5. the follower's network drops */
  group('the follower loses its network');
  {
    const hub = await newHub(); const lead = httpLeader(hub.origin);
    const F = await openFollower(hub);
    const menu = (await hubView(hub)).menu.map((m) => m.id);
    await lead.act('createTicket', { customer: 'A', items: [{ menuId: menu[0] }] });
    await converge([F], hub, 'before the drop');
    await F.ctx.setOffline(true);
    for (let i = 0; i < 5; i++) await lead.act('createTicket', { customer: 'Gone' + i, items: [{ menuId: menu[1] }] });
    check('while offline the follower says Out of date (it does not pretend to be live)', await waitChip(F, CHIP.stale, 25000), await chipText(F));
    check('a banner warns that what is shown may not be what is happening', /may not be what is happening/i.test(await F.evaluate(() => document.body.innerText)));
    check('it keeps the last board it had, unchanged (1 ticket)', await F.evaluate(() => SB.store.getState().tickets.length) === 1);
    await F.ctx.setOffline(false);
    check('back online it catches up to the hub', await converge([F], hub, 'after the drop', 40000));
    check('and the chip is Connected again', await waitChip(F, CHIP.following, 30000), await chipText(F));
    check('the follower still posted nothing', F.logs.posts.length === 0, F.logs.posts);
    await F.ctx.close();
  }

  /* 6. the leader's queue replays in order and is answered */
  group('the leader works offline, then sends its queue');
  {
    const hub = await newHub(); const lead = httpLeader(hub.origin);
    const F = await openFollower(hub);
    const menu = (await hubView(hub)).menu.map((m) => m.id);
    await lead.act('createTicket', { customer: 'First', items: [{ menuId: menu[0] }] });
    // five taps made while the link was down, each with the time it was made and its own id, sent together afterwards, in order
    const t0 = Date.now() - 20000, replies = [];
    for (let i = 1; i <= 5; i++) replies.push(await lead.act('createTicket', { customer: 'Q' + i, items: [{ menuId: menu[i % menu.length] }] }, { at: t0 + i * 1000 }));
    check('the hub answered every queued tap (5 answers, all ok, change numbers rising by one)', replies.every((r, i) => r.report === 'ok' && (i === 0 || r.seq === replies[i - 1].seq + 1)), replies.map((r) => r.report + ':' + r.seq));
    const names = (await hubTickets(hub)).map((t) => t.customer);
    check('the hub applied them in the order they were made', JSON.stringify(names) === JSON.stringify(['First', 'Q1', 'Q2', 'Q3', 'Q4', 'Q5']), names);
    const resend = [];
    for (let i = 1; i <= 5; i++) resend.push(await lead.act('createTicket', { customer: 'Q' + i, items: [{ menuId: menu[i % menu.length] }] }, { opId: 'leader:' + (i + 1) }));
    check('sending the same queue again is answered as duplicates and applies nothing', resend.every((r) => r.duplicate === true) && (await hubTickets(hub)).length === 6, resend.map((r) => r.report + (r.duplicate ? ':dup' : '')));
    check('the follower shows the same six tickets', await converge([F], hub, 'after the replay'));
    await F.ctx.close();
  }

  /* 7. a follower with an access code */
  group('the access code');
  {
    const hub = await newHub({ env: { SMOKEBOX_FOLLOW_CODE: 'kitchen-42' } });
    const bad = await openFollower(hub, null, { code: 'nope' });
    check('a wrong code shows a plain message and a way back to the device\'s own kitchen', await bad.waitForFunction(() => /could not follow/i.test(document.body.innerText) && /Back to my own kitchen/.test(document.body.innerText), null, { timeout: 8000 }).then(() => true, () => false), (await bad.evaluate(() => document.body.innerText)).slice(0, 200));
    const good = await openFollower(hub, null, { code: 'kitchen-42' });
    check('the right code connects', await waitChip(good, CHIP.following), await chipText(good));
    check('the code is not kept in this device\'s storage', await good.evaluate(() => !JSON.stringify(Object.entries(localStorage)).includes('kitchen-42')));
    await bad.ctx.close(); await good.ctx.close();
  }

  /* 8. demo and normal kitchens are not affected */
  group('demo and normal kitchens stay solo and never contact the hub');
  {
    const hub = await newHub();
    for (const [label, url] of [['a normal kitchen', hub.origin + '/'], ['the demo', hub.origin + '/?demo']]) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const p = await ctx.newPage(); const calls = [];
      p.on('request', (r) => { if (/\/(events|action|follow)/.test(r.url())) calls.push(r.method() + ' ' + r.url()); });
      await p.goto(url, { waitUntil: 'load' }); await p.waitForFunction(() => window.SB && SB.booted === true); await sleep(1500);
      check(label + ' made no request to the hub and shows no follower chip', calls.length === 0 && await p.evaluate(() => !document.querySelector('.fl-fchip') && SB.store.followStatus().mode === 'off'), calls);
      await ctx.close();
    }
    check('and the hub saw no screen at all', (await hubTickets(hub)).length === 0);
  }
} finally {
  await browser.close();
  for (const h of hubs) await h.stop('SIGKILL');
}
console.log('\n' + pass + ' passed, ' + fail + ' failed' + (fail ? ': ' + failures.join('; ') : ''));
process.exit(fail ? 1 : 0);
