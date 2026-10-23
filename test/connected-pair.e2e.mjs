// Pairing and per-screen tokens against real hub processes, with Chromium tablets. Run: SMOKEBOX_TOOLS=$(npm root -g) node test/connected-pair.e2e.mjs (about 2 minutes).
// Covers: pair a tablet with a code and act; remove the screen at the hub (streams cut, removed state shown); a used or expired code is refused; five wrong
// codes lock; a token from another hub does not work; tokens required refuses anonymous actions and follows; the screen name cannot be spoofed;
// a reload keeps the pairing; leaving restores the tablet's own kitchen. Prints one SKIP line while pairing is absent from the source.
import fs from 'node:fs';
import path from 'node:path';
import { toolRequire } from '../tools/_deps.mjs';
import { ROOT, startHub, stream, until, sleep, postAction, postJson, pairOver, pairingCode, listScreens, revokeScreen } from './_connected.mjs';
import { createHub } from '../server/server.mjs';

if (!/pairHub/.test(fs.readFileSync(path.join(ROOT, 'src/js/30-store.js'), 'utf8'))) { console.log('SKIP: pairing (SB.store.pairHub) is not in this source tree yet. Merge the connected branch, then run this again.'); process.exit(0); }
const { chromium } = toolRequire('playwright');
let pass = 0, fail = 0; const failures = [];
const check = (n, ok, d) => { if (ok) { pass++; console.log('  ok    ' + n); } else { fail++; failures.push(n); console.log('  FAIL  ' + n + (d !== undefined ? '  -> ' + String(JSON.stringify(d)).slice(0, 400) : '')); } };
const group = (t) => console.log('\n# ' + t);
const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const hubs = []; const mk = async (o) => { const h = await startHub(o); hubs.push(h); return h; };
const snap = async (h, headers) => { const s = stream(h.origin, { headers }); await until(() => s.state, 'snapshot'); s.stop(); return s.state; };
const ctxs = [];
async function page(url, ctx) {
  ctx = ctx || await browser.newContext({ viewport: { width: 1280, height: 800 } }); ctxs.push(ctx);
  const p = await ctx.newPage(); p.errs = []; p.on('pageerror', (e) => p.errs.push(String(e)));
  await p.goto(url, { waitUntil: 'load' }); await p.waitForFunction(() => window.SB && SB.booted === true, null, { timeout: 15000 }); p.ctx = ctx; return p;
}
const text = (p) => p.evaluate(() => document.body.innerText);
const hubState = (p) => p.evaluate(() => SB.store.hubStatus());
async function waitHub(p, want, ms = 15000) { const e = Date.now() + ms; let s; while (Date.now() < e) { s = await hubState(p).catch(() => ({})); if (s.state === want || (want === 'error' && s.state === 'error')) return s; await sleep(200); } return s; }
const pair = (p, hub, code, name) => p.evaluate(([u, c, n]) => SB.store.pairHub({ url: u, code: c, name: n }), [hub.origin, code, name]);
const dish = async (h) => (await snap(h, h.hdr)).menu[0].id;

try {
  group('pairing a tablet and acting');
  {
    const hub = await mk({ tokens: true });
    check('anonymous actions, follows and streams are refused when tokens are required', (await postAction(hub.origin, { type: 'toggle86', payload: { menuId: 'x', on: true } })).status === 403 && (await fetch(hub.origin + '/follow')).status === 403 && (await fetch(hub.origin + '/events')).status === 403);
    const un = await page(hub.origin + '/?hub=' + encodeURIComponent(hub.origin));
    await sleep(2500);
    check('a tablet that is not paired shows the could-not-join screen, not a kitchen', /could not join/i.test(await text(un)) && await un.evaluate(() => !(SB.store.getState() && SB.store.getState().tickets.length)), (await text(un)).slice(0, 120));
    check('(wording) and that screen says the tablet is not paired and to ask for a code', /not paired|pairing code/i.test(await text(un)), (await text(un)).slice(0, 160));
    const code = pairingCode(hub);
    const r = await pair(un, hub, code, 'Pit tablet');
    check('pairing with the code works and names the screen', r.ok === true && r.name === 'Pit tablet', r);
    check('the saved record never gives the token back to the page', JSON.stringify(await un.evaluate((u) => SB.store.pairedFor(u), hub.origin)).indexOf('token') < 0);
    await un.goto(hub.origin + '/?hub=' + encodeURIComponent(hub.origin)); await un.waitForFunction(() => window.SB && SB.booted === true);
    check('after the reload the tablet is connected without a code (the pairing is kept on the device)', (await waitHub(un, 'connected')).state === 'connected', await hubState(un));
    const m = await un.evaluate(() => SB.store.getState().menu[0].id);
    const tap = await un.evaluate((m) => SB.store.dispatch('createTicket', { customer: 'Paired', items: [{ menuId: m }] }), m); await sleep(1200);
    const key = await un.evaluate(() => JSON.parse(localStorage.getItem('smokebox.v1.hubtoken')).hubs); const tok = Object.values(key)[0].token;
    const st = await snap(hub, { 'x-smokebox-token': tok, 'x-smokebox-client': '1' });
    check('the tap reached the hub', tap === 'ok' && st.tickets.some((t) => t.customer === 'Paired'), tap);
    const ev = (st.events || []).filter((e) => e.screen);
    check('the hub stamped the screen\'s paired name on the events', ev.length > 0 && ev.every((e) => e.screen === 'Pit tablet'), ev.map((e) => e.screen));

    group('the screen name cannot be spoofed');
    const sp = await postAction(hub.origin, { type: 'createTicket', payload: { customer: 'Spoof', items: [{ menuId: m }] }, opId: 'sp:1', clientId: 'sp', screen: 'Owner', by: 's:fake', name: 'Owner' }, { 'x-smokebox-token': tok, 'x-smokebox-client': '1' });
    const st2 = await snap(hub, { 'x-smokebox-token': tok, 'x-smokebox-client': '1' });
    const spoofEv = (st2.events || []).filter((e) => e.screen && e.screen !== 'Pit tablet');
    check('an action that claims another screen name or id is stamped with the token\'s own name', sp.status === 200 && spoofEv.length === 0, { status: sp.status, other: spoofEv.map((e) => e.screen) });
    const badName = await pairOver(hub.origin, pairingCode(hub), '<img src=x onerror=alert(1)>');
    check('a screen name with markup cannot be used to pair', badName.status >= 400 && badName.body && badName.body.report === 'badName', badName);

    group('a used code, wrong codes and the lock');
    const c2 = pairingCode(hub); const ok1 = await pairOver(hub.origin, c2, 'Second'); const again = await pairOver(hub.origin, c2, 'Third');
    check('a code works once; the second use is refused', ok1.status === 200 && again.status === 403 && again.body.report === 'badPairCode', [ok1.status, again.status, again.body]);

    group('removing the screen at the hub');
    const watchers = [await page(hub.origin + '/?hub=' + encodeURIComponent(hub.origin), un.ctx)];
    const list = await listScreens(hub); const mine = list.find((s) => s.name === 'Pit tablet');
    const cut = revokeScreen(hub, mine.id); check('the owner can remove a screen from the hub', cut.code === 0, cut);
    const gone = await waitHub(un, 'error', 15000);
    check('the removed tablet\'s stream is cut and its status says revoked, with plain words', gone.error === 'revoked' && /removed/i.test(gone.reason || ''), [gone.error, gone.reason]);
    check('and the person at the tablet is TOLD it was removed (not just "offline, taps are saved")', /removed/i.test(await text(un)), (await un.evaluate(() => [...document.querySelectorAll('.fl-hchip, .fl-hnote')].map((e) => e.innerText).join(' / '))));
    const after = await postAction(hub.origin, { type: 'createTicket', payload: { customer: 'AfterRevoke', items: [{ menuId: m }] } }, { 'x-smokebox-token': tok, 'x-smokebox-client': '1' });
    check('a removed token is refused from then on', after.status === 403 && after.body && after.body.report === 'revoked', after);
    check('and the hub never made the ticket', !(await snap(hub, { 'x-smokebox-token': (await pair2(hub)) , 'x-smokebox-client': '1' })).tickets.some((t) => t.customer === 'AfterRevoke'));
    check('no page errors', un.errs.length === 0, un.errs);
  }

  group('five wrong pairing codes lock the address');
  {
    const hub = await mk({ tokens: true }); const good = pairingCode(hub); const res = [];
    for (let i = 0; i < 6; i++) res.push((await pairOver(hub.origin, 'ZZZZZ' + i, 'x')).status);
    const right = await pairOver(hub.origin, good, 'Late');
    check('the fifth wrong code locks the address: from then on even the right code gets 429', res.slice(0, 4).every((s) => s === 403) && res[4] === 429 && res[5] === 429 && right.status === 429, { res, right: right.status });
    const adm = pairingCode(hub); check('the owner can still make a new code (the lock is for screens)', /^[A-Z2-9]{6}$/.test(adm));
  }

  group('a token from another hub');
  {
    const A = await mk({ tokens: true }), B = await mk({ tokens: true });
    const r = await pairOver(A.origin, pairingCode(A), 'On A'); const tok = r.body.token;
    const onB = await postAction(B.origin, { type: 'toggle86', payload: { menuId: 'x', on: true } }, { 'x-smokebox-token': tok, 'x-smokebox-client': '1' });
    const fB = await fetch(B.origin + '/follow', { headers: { 'x-smokebox-token': tok, 'x-smokebox-client': '1' } });
    check('A\'s token is refused by B for actions and for follows', onB.status === 403 && fB.status === 403, [onB.status, fB.status]);
    const stolen = await page(B.origin + '/?hub=' + encodeURIComponent(B.origin));
    await stolen.evaluate(([u, t]) => localStorage.setItem('smokebox.v1.hubtoken', JSON.stringify({ v: 1, hubs: { [u]: { token: t, id: 'x', name: 'Stolen', owner: true } } })), [B.origin, tok]);
    await stolen.reload({ waitUntil: 'load' }); await stolen.waitForFunction(() => window.SB && SB.booted === true);
    await sleep(3000); check('a page carrying A\'s token gets no kitchen from B and says it could not join', /could not join/i.test(await text(stolen)) && (await stolen.evaluate(() => !(SB.store.getState() && SB.store.getState().tickets.length) && !(SB.store.hubStatus().connected))), (await text(stolen)).slice(0, 120));
    check('(wording) and it says the screen is not paired', /not paired|pairing code/i.test(await text(stolen)), (await text(stolen)).slice(0, 160));
  }

  group('a used code that has run out of time (in-process hub with a short code life)');
  {
    const hub = await createHub({ requireTokens: true, pairMs: 400, adminKey: 'k'.repeat(40) }); const port = await hub.listen(0, '127.0.0.1');
    const origin = 'http://127.0.0.1:' + port;
    const code = await new Promise((res) => { const http = import('node:http'); http.then(({ default: h }) => { const r = h.request({ host: '127.0.0.1', port, path: '/admin/pair', method: 'POST', headers: { authorization: 'Bearer ' + 'k'.repeat(40), 'content-type': 'application/json', 'x-smokebox-client': '1' } }, (x) => { let t = ''; x.on('data', (c) => (t += c)); x.on('end', () => res(JSON.parse(t).code)); }); r.end('{}'); }); });
    await sleep(700); const late = await pairOver(origin, code, 'Slow');
    check('an expired code is refused', late.status === 403 && late.body.report === 'badPairCode', late); await hub.close();
  }

  group('tokens required: a follower and a hub tablet without pairing');
  {
    const hub = await mk({ tokens: true, env: { SMOKEBOX_FOLLOW_CODE: 'FOLLOWCODE1', SMOKEBOX_WRITE_CODE: 'WRITECODE12' } });
    const f = await page(hub.origin + '/?follow&code=FOLLOWCODE1'); check('the shared follow code no longer opens the board', /could not follow/i.test(await text(f)) || (await f.evaluate(() => SB.store.followStatus().state)) !== 'following', (await text(f)).slice(0, 100));
    const w = await postAction(hub.origin, { type: 'toggle86', payload: { menuId: 'x', on: true } }, { 'x-smokebox-code': 'WRITECODE12' }); check('nor the write code for taps', w.status === 403, w.status);
  }

  group('leaving the hub restores the tablet\'s own kitchen');
  {
    const hub = await mk({ tokens: true }); const p = await page(hub.origin + '/');
    await p.evaluate(() => SB.store.dispatchEx('addMenuItem', { name: 'My own dish', zone: SB.config.workZones[0], cat: SB.config.categories[0].id, price: 9, prepSec: 60, track: 'one' }, { source: 'ui' })); await sleep(700);
    const proj = () => p.evaluate(() => JSON.stringify(SB.store.getState().menu.map((x) => x.name)));
    const mineBefore = await proj(); const lsBefore = await p.evaluate(() => JSON.stringify(Object.keys(localStorage).filter((k) => /state|lastgood|orderdraft/.test(k)).sort().map((k) => [k, localStorage.getItem(k)])));
    const r = await pair(p, hub, pairingCode(hub), 'Temp'); const j = await p.evaluate((u) => SB.store.initHubClient({ url: u, adopt: 'hub' }), hub.origin);
    check('pairing then joining shows the hub\'s kitchen, not its own dish', r.ok && j.ok && !(await proj()).includes('My own dish'), [r, j && j.error]);
    await sleep(600); const lv = await p.evaluate(() => SB.store.leaveHub()); await sleep(500);
    check('leaving shows the tablet\'s own menu again, exactly', lv.ok === true && (await proj()) === mineBefore, lv);
    check('and its saved kitchen was not touched meanwhile', JSON.stringify(await p.evaluate(() => Object.keys(localStorage).filter((k) => /state|lastgood|orderdraft/.test(k)).sort().map((k) => [k, localStorage.getItem(k)]))) === lsBefore);
  }
} finally { await browser.close(); for (const h of hubs) await h.stop('SIGKILL'); }
console.log('\n' + pass + ' passed, ' + fail + ' failed' + (fail ? ': ' + failures.join('; ') : ''));
process.exit(fail ? 1 : 0);
async function pair2(h) { const c = pairingCode(h); const r = await pairOver(h.origin, c, 'Checker'); return r.body.token; }
