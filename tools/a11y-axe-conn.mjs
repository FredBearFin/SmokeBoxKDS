// WHAT THIS FILE IS: The same axe-core accessibility audit as tools/a11y-axe.mjs, for the connected-kitchen screens: the follower board, the
//   hub-mode board and its connection chip states, "Use one kitchen on several tablets" in every state, the boot cards for a follow or hub link that
//   fails, the held-data card, the clock notice and question, the update-ready line and Settings, and Reset the offline copy. Real hub processes
//   are used where a real hub is needed; the rest uses small stand-ins for the page's store calls (named in each screen's label).
// USAGE: node tools/a11y-axe-conn.mjs   (about 15 minutes)   ONLY=text keeps screens whose name has the text; QUICK=1 one look, 390 wide.
//   OUT=path.json where the JSON goes (default docs/audit/axe-conn-after.json); DIST=path.html a different built page for the file:// screens.
// NOTHING IS TURNED OFF: no rule is disabled or excluded. Violations are listed per screen; the report is docs/audit/axe-conn-report.md
//   (set NOREPORT=1 to skip it; BEFORE=path.json adds the before column).
// USES: Playwright, axe-core (tools/_deps.mjs), the hub in server/server.mjs through test/_connected.mjs, dist/smokebox.html.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withPage } from './pw.mjs';
import { toolRequire } from './_deps.mjs';
import { startHub, startRelay, httpLeader, pairingCode, listScreens, revokeScreen, sleep } from '../test/_connected.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const axeSource = toolRequire('axe-core').source;
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];
const SIZES = process.env.QUICK ? [[390, 844]] : [[390, 844], [1280, 800]];
const LOOKS = process.env.QUICK ? [['light', 'normal']] : [['light', 'normal'], ['dark', 'normal'], ['light', 'large']];
const ONLY = (process.env.ONLY || '').toLowerCase();
const FILE = process.env.DIST || undefined;
const ready = (page) => page.waitForFunction(() => window.SB && SB.booted === true, null, { timeout: 20000 });

// The stand-in for the page's store calls used by the join form (the same ones test/hub-join-ui.e2e.mjs uses): a hub that answers as told.
const stubs = () => {
  window.__hub = { empty: true, error: null, joined: false, tokens: false, paired: false, state: 'connected' };
  SB.store.probeHub = () => (window.__hub.tokens && !window.__hub.paired ? Promise.resolve({ ok: false, error: 'unpaired', tokensRequired: true }) : Promise.resolve({ ok: true, empty: window.__hub.empty, tokensRequired: window.__hub.tokens }));
  SB.store.pairHub = (o) => { window.__hub.paired = true; return Promise.resolve({ ok: true, name: o.name }); };
  SB.store.unpair = () => { window.__hub.paired = false; };
  SB.store.initHubClient = () => { window.__hub.joined = true; return Promise.resolve({ ok: true }); };
  SB.store.isHubClient = () => window.__hub.joined;
  SB.store.hubStatus = () => Object.assign({ state: window.__hub.state, queued: window.__hub.queued || 0, lastUpdate: Date.now() }, window.__hub.extra || {});
  SB.store.leaveHub = () => { if (window.__hub.pending) return Promise.resolve({ ok: false, error: 'pending' }); window.__hub.joined = false; return Promise.resolve({ ok: true }); };
};
// Opens the follow sheet on a local page with the stand-in hub and returns after it is drawn.
const followSheet = async (page, set) => {
  await page.evaluate(stubs); if (set) await page.evaluate(set);
  await page.evaluate(() => SB.sheets.open('follow')); await page.waitForSelector('[data-part="main"]'); await page.waitForTimeout(400);
};
const fill = async (page, name, url) => { await page.click('[data-mode="orders"]'); await page.fill('[data-field="hub-url"]', url || 'kitchen.example.com'); await page.fill('[data-field="hub-name"]', name || 'Pass'); await page.fill('[data-field="hub-code"]', 'abc123').catch(() => {}); };
// Makes the page's offline module report the given state (a stand-in: a file page has no service worker).
const offlineStub = (page, o) => page.evaluate((o) => { SB.offline.status = () => Object.assign({ supported: true, secure: true, state: 'ready', cachedVersion: '1', pageVersion: '1', updateReady: false, reason: '' }, o); }, o);

// Every screen: name, where it runs ('file' = the built page opened as a file; 'hub' = served by a real hub), prep(page, env).
function screens(env) {
  const L = [];
  const add = (name, where, prep, opts) => L.push({ name, where, prep, opts: opts || {} });
  // --- the follower board (a screen that only shows the kitchen) ---
  add('Follower board (connected, real hub)', 'hub', async (p) => { await p.goto(env.hubA.origin + '/?follow'); await ready(p); await p.waitForTimeout(1500); });
  add('Follower board (reconnecting, hub cut off)', 'hub', async (p) => { const r = await startRelay(env.hubA.port); await p.goto(r.origin + '/?follow'); await ready(p); await p.waitForTimeout(1200); r.cut(); await p.waitForTimeout(4500); return () => r.close(); });
  // --- the hub-mode board (a tablet that takes orders through the hub) and its chip states ---
  add('Hub-mode board (chip: connected)', 'hub', async (p) => { await p.goto(env.hubA.origin + '/?hub=' + encodeURIComponent(env.hubA.origin)); await ready(p); await p.waitForTimeout(1500); });
  add('Hub-mode board (chip: offline, taps waiting)', 'hub', async (p) => { const r = await startRelay(env.hubA.port); await p.goto(r.origin + '/?hub=' + encodeURIComponent(r.origin)); await ready(p); await p.waitForTimeout(1200); r.cut(); await p.evaluate(() => { const m = SB.store.getState().menu[0]; if (m) SB.store.dispatch('createTicket', { customer: 'Offline tap', items: [{ menuId: m.id }] }); }); await p.waitForTimeout(4500); return () => r.close(); });
  add('Hub-mode board (chip: removed from the kitchen)', 'hub', async (p) => {
    const code = pairingCode(env.hubT); await p.goto(env.hubT.origin + '/?hub=' + encodeURIComponent(env.hubT.origin)); await ready(p);
    await p.evaluate(([u, c]) => SB.store.pairHub({ url: u, code: c, name: 'Audit tablet' }), [env.hubT.origin, code]);
    await p.goto(env.hubT.origin + '/?hub=' + encodeURIComponent(env.hubT.origin)); await ready(p); await p.waitForTimeout(1500);
    const mine = (await listScreens(env.hubT)).find((s) => s.name === 'Audit tablet'); if (mine) revokeScreen(env.hubT, mine.id);
    await p.waitForFunction(() => /removed/i.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {}); await p.waitForTimeout(500);
  });
  add('Hub-mode board (chip: last known copy, stand-in)', 'file', async (p) => { await p.evaluate(stubs); await p.evaluate(() => { SB.store.isHubClient = () => true; SB.store.hubStatus = () => ({ state: 'offline', lastKnown: true, lastKnownAt: Date.now() - 600000, queued: 2 }); }); await p.evaluate(() => SB.sheets.closeAll()); await p.waitForTimeout(2500); });
  // --- "Use one kitchen on several tablets" in every state (stand-in hub) ---
  add('Follow sheet: show-only form', 'file', async (p) => { await followSheet(p); });
  add('Follow sheet: show-only form with an error', 'file', async (p) => { await followSheet(p); await p.click('[data-act="follow-connect"]'); await p.waitForTimeout(300); });
  add('Follow sheet: main-computer form', 'file', async (p) => { await followSheet(p); await p.click('[data-mode="orders"]'); await p.waitForTimeout(300); });
  add('Follow sheet: main-computer form, name missing', 'file', async (p) => { await followSheet(p); await p.click('[data-mode="orders"]'); await p.fill('[data-field="hub-url"]', 'kitchen.example.com'); await p.click('[data-act="hub-check"]'); await p.waitForTimeout(300); });
  add('Follow sheet: pairing box', 'file', async (p) => { await followSheet(p, () => { window.__hub.tokens = true; }); await fill(p); await p.click('[data-act="hub-check"]'); await p.waitForSelector('[data-role="pair-box"]:not([hidden])'); await p.waitForTimeout(300); });
  add('Follow sheet: choice (empty hub)', 'file', async (p) => { await followSheet(p); await fill(p); await p.click('[data-act="hub-check"]'); await p.waitForSelector('[data-opt="adopt"]'); await p.waitForTimeout(300); });
  add('Follow sheet: choice with the stop (hub has a kitchen)', 'file', async (p) => { await followSheet(p, () => { window.__hub.empty = false; }); await fill(p); await p.click('[data-act="hub-check"]'); await p.waitForSelector('[data-role="stop"]'); await p.waitForTimeout(300); });
  add('Follow sheet: joined', 'file', async (p) => { await followSheet(p); await fill(p); await p.click('[data-act="hub-check"]'); await p.waitForSelector('[data-opt="adopt"]'); await p.check('[data-choice="adopt"]'); await p.click('[data-act="hub-join"]'); await p.waitForSelector('[data-role="hub-joined"]:not([hidden])'); await p.waitForTimeout(400); });
  add('Follow sheet: joined, taps waiting, leave warning', 'file', async (p) => { await followSheet(p, () => { window.__hub.joined = true; window.__hub.pending = true; window.__hub.queued = 3; window.__hub.state = 'offline'; }); await p.click('[data-act="hub-leave"]'); await p.waitForTimeout(500); });
  add('Follow sheet: removed from the kitchen', 'file', async (p) => { await followSheet(p, () => { window.__hub.joined = true; window.__hub.state = 'error'; window.__hub.extra = { error: 'revoked', reason: 'removed' }; }); await p.waitForTimeout(500); });
  add('Follow sheet: following, wrong code', 'file', async (p) => { await p.evaluate(() => { SB.store.isFollower = () => true; SB.store.followStatus = () => ({ state: 'error', error: 'badCode' }); SB.sheets.open('follow'); }); await p.waitForSelector('[data-act="follow-back"]'); await p.waitForTimeout(300); });
  add('Follow sheet: following, may be out of date', 'file', async (p) => { await p.evaluate(() => { SB.store.isFollower = () => true; SB.store.followStatus = () => ({ state: 'stale', lastUpdate: Date.now() }); SB.sheets.open('follow'); }); await p.waitForSelector('[data-act="follow-disconnect"]'); await p.waitForTimeout(2300); });
  // --- boot cards when a follow or hub link fails ---
  add('Boot card: tablet not paired (?hub, hub wants passes)', 'hub', async (p) => { await p.goto(env.hubT.origin + '/?hub=' + encodeURIComponent(env.hubT.origin)); await p.waitForSelector('.follow-fail', { timeout: 20000 }); });
  add('Boot card: wrong access code (?follow)', 'hub', async (p) => { await p.goto(env.hubC.origin + '/?follow&code=WRONG1'); await p.waitForSelector('.follow-fail', { timeout: 20000 }); });
  add('Boot card: not a Smokebox address (?follow)', 'hub', async (p) => { await p.goto(env.hubA.origin + '/?follow=' + encodeURIComponent(env.hubA.origin + '/nothing-here')); await p.waitForSelector('.follow-fail', { timeout: 20000 }); });
  add('Boot card: Smokebox could not start', 'file', async (p) => { await p.evaluate(() => SB.boot.showError(new Error('Stand-in error for the audit'), 'shell')); await p.waitForTimeout(300); });
  // --- the held-data card (saved data unreadable and the browser too full to set it aside) ---
  add('Held-data card (unreadable save, no room to copy it)', 'held', async (p) => { await p.waitForSelector('#held-data', { timeout: 10000 }); });
  // --- the clock notice and question ---
  add('Clock question (device clock jumped ahead)', 'file', async (p) => { await p.evaluate(() => { const real = Date.now.bind(Date); window.__off = 0; Date.now = () => real() + window.__off; window.__off = 5 * 86400e3; }); await p.waitForSelector('.confirm, [role="alertdialog"], [role="dialog"]', { timeout: 20000 }).catch(() => {}); await p.waitForTimeout(600); });
  add('Clock notice (toast: clock looks wrong)', 'file', async (p) => { await p.evaluate(() => { const real = Date.now.bind(Date); window.__off = 0; Date.now = () => real() + window.__off; window.__off = 5 * 86400e3; SB.store.status = () => Object.assign({}, SB.store.getState && { persistent: true }, { clockWrong: true, clockSuspect: null }); }); await p.waitForTimeout(6500); });
  // --- update ready, the offline card and Reset the offline copy ---
  add('Board with the update-ready line', 'file', async (p) => { await offlineStub(p, { state: 'update', cachedVersion: '1', pageVersion: '2', updateReady: true }); await p.waitForTimeout(2500); });
  add('Settings with the update-ready button', 'file', async (p) => { await offlineStub(p, { state: 'update', cachedVersion: '1', pageVersion: '2', updateReady: true }); await p.evaluate(() => SB.sheets.open('menu')); await p.waitForTimeout(600); });
  add('Reload to update (question)', 'file', async (p) => { await offlineStub(p, { state: 'update', cachedVersion: '1', pageVersion: '2', updateReady: true }); await p.evaluate(() => SB.sheets.open('menu')); await p.waitForTimeout(500); await p.locator('[data-act="reload-update"]').first().click(); await p.waitForTimeout(500); });
  add('Help: Opens without the internet (copy stored)', 'file', async (p) => { await offlineStub(p, {}); await p.evaluate(() => SB.sheets.open('help', { tab: 'about' })); await p.waitForTimeout(600); });
  add('Help: Opens without the internet (not yet)', 'file', async (p) => { await offlineStub(p, { state: 'none', cachedVersion: null }); await p.evaluate(() => SB.sheets.open('help', { tab: 'about' })); await p.waitForTimeout(600); });
  add('Help About: Reset the offline copy (question)', 'file', async (p) => { await offlineStub(p, {}); await p.evaluate(() => SB.sheets.open('help', { tab: 'about' })); await p.waitForTimeout(500); await p.locator('[data-act="reset-offline"]').first().click(); await p.waitForTimeout(500); });
  add('Tablet checks: Opens without the internet', 'file', async (p) => { await offlineStub(p, {}); await p.evaluate(() => SB.sheets.open('ready')); await p.waitForTimeout(800); });
  return L.filter((s) => !ONLY || s.name.toLowerCase().includes(ONLY));
}

// Runs axe on the page as it is now; returns the violations in a plain shape.
async function runAxe(page) {
  return page.evaluate(async (tags) => {
    const r = await axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] });
    return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, tags: v.tags.filter((t) => /^wcag\d/.test(t)).slice(0, 2), count: v.nodes.length, nodes: v.nodes.slice(0, 6).map((n) => ({ target: n.target.join(' '), html: n.html.slice(0, 140), why: (n.failureSummary || '').split('\n').slice(1, 3).join(' ').slice(0, 220) })) }));
  }, TAGS);
}

// Starts a tiny web server that answers every request with 404 text, to stand in for an address that is not a Smokebox kitchen.
function startDummy() {
  return new Promise((resolve) => { const s = http.createServer((q, r) => { r.statusCode = 404; r.end('not here'); }); s.listen(0, '127.0.0.1', () => resolve({ s, url: 'http://127.0.0.1:' + s.address().port })); });
}
// Puts a menu and three tickets on a hub through the plain action route, as a cooking tablet would.
async function fillHub(hub, hdr) {
  const lead = httpLeader(hub.origin, 'audit');
  await lead.act('addMenuItem', { name: 'Pulled pork plate', zone: 'pit', cat: 'meat', price: 12, prepSec: 120, track: 'two' }, hdr);
  await lead.act('addMenuItem', { name: 'Fries', zone: 'fry', cat: 'fried', price: 4, prepSec: 180, track: 'two' }, hdr);
  const snap = await (await fetch(hub.origin + '/state', { headers: hdr || {} })).json().catch(() => null);
  return snap;
}

const results = [];
const env = {};
env.hubA = await startHub(); env.hubT = await startHub({ tokens: true }); env.hubC = await startHub({ env: { SMOKEBOX_FOLLOW_CODE: 'RIGHT1' } });
const dummy = await startDummy(); env.dummy = dummy.url;
try { await fillHub(env.hubA); } catch (e) { console.log('hub fill failed', e.message); }
try {
  for (const [w, h] of SIZES) for (const [theme, text] of LOOKS) {
    const tag = w + ' ' + theme + ' ' + text;
    for (const sc of screens(env)) {
      const init = sc.where === 'held' ? () => { try { if (!localStorage.getItem('__held')) { localStorage.setItem('__held', '1'); localStorage.setItem('smokebox.v1.state', '{not json at all'); } const set = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (/corrupt/.test(k)) throw new Error('QuotaExceededError'); return set.call(this, k, v); }; } catch (e) { /* storage blocked */ } } : undefined;
      try {
        await withPage({ w, h, file: FILE, touch: true, init, clearStorage: sc.where !== 'held' }, async (page) => {
          if (sc.where !== 'held') { await ready(page); }
          const look = async () => { await page.evaluate(([t, x]) => { SB.theme.set(t); SB.theme.setTextSize(x); }, [theme, text]); };
          if (sc.where === 'file') await page.addScriptTag({ content: axeSource }).then(look);
          if (sc.where === 'file') await page.evaluate(() => { const d = (t, p) => SB.store.dispatchEx(t, p, { source: 'ui' }); d('addMenuItem', { name: 'Pulled pork plate', zone: 'pit', cat: 'meat', price: 12, prepSec: 120, track: 'two' }); const m = SB.store.getState().menu[0]; if (m) d('createTicket', { customer: 'Maria', items: [{ menuId: m.id, qty: 1 }] }); });
          const cleanup = await sc.prep(page);
          if (sc.where !== 'file') { await page.addScriptTag({ content: axeSource }); try { await page.evaluate(([t, x]) => { SB.theme.set(t); SB.theme.setTextSize(x); }, [theme, text]); } catch (e) { /* page without SB */ } await page.waitForTimeout(400); }
          const v = await runAxe(page);
          const shown = await page.evaluate(() => { const s = [...document.querySelectorAll('.sheet')].pop(); const f = document.querySelector('.follow-fail,#held-data,#boot-error'); return f ? 'card: ' + (f.querySelector('h2') || f).textContent.slice(0, 50) : s ? 'sheet: ' + (s.querySelector('h1,h2,.sheet-title') || s).textContent.trim().slice(0, 40) : 'page ' + location.pathname + location.search.slice(0, 40); });
          results.push({ screen: sc.name, look: tag, shown, violations: v });
          if (typeof cleanup === 'function') await cleanup();
        });
      } catch (e) { results.push({ screen: sc.name, look: tag, error: String(e.message || e).split('\n')[0].slice(0, 200), violations: [] }); }
    }
    console.log('done', tag, results.length);
  }
} finally { for (const k of ['hubA', 'hubT', 'hubC']) await env[k].stop().catch(() => {}); dummy.s.close(); }

const out = process.env.OUT || path.join(ROOT, 'docs/audit/axe-conn-after.json');
fs.writeFileSync(out, JSON.stringify(results));
const nodes = {}; for (const r of results) for (const v of r.violations) nodes[v.impact] = (nodes[v.impact] || 0) + v.count;
console.log('nodes', JSON.stringify(nodes), 'errors', results.filter((r) => r.error).length);
for (const r of results) if (r.error) console.log('ERR', r.screen, '|', r.look, '|', r.error);
