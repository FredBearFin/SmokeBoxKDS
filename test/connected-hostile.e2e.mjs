// Hostile text on the connected screens (browser against a real hub, about 1 minute). Run: node test/connected-hostile.e2e.mjs
// A screen name, a refusal sentence, a pairing error or a status text may be 50,000 characters long or full of markup (a hub that is old,
// broken or not ours). Everything must render as plain text, cut short, inside the screen, with no element made from it:
// the pairing box ("Paired as ..."), the pairing errors, a refusal toast from the hub, and the "Entered by ..." line of a ticket on the office page.
import { toolRequire } from '../tools/_deps.mjs';
import { startHub, sleep } from './_connected.mjs';

const { chromium } = toolRequire('playwright');
let fail = 0;
// Records one check and prints it.
function check(name, ok, detail) { if (!ok) fail++; console.log((ok ? '  ok    ' : '  FAIL  ') + name + (ok ? '' : ' -> ' + String(JSON.stringify(detail)).slice(0, 300))); }
// Polls until fn() answers true, up to ms.
async function until(fn, ms = 10000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await sleep(100); } return false; }
const SHOTS = process.env.SHOT_DIR || '/tmp';
const MARK = '<img src=x onerror="window.__pwn=1"><script>window.__pwn=2</script><b>bold</b>';
const HUGE = MARK + 'A'.repeat(50000);
const hub = await startHub({ starter: true });
const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const errs = [];
// Reads what a hostile string left on the page: made elements, the pwn flag, and sideways scroll.
const damage = (p) => p.evaluate(() => ({ pwn: window.__pwn || 0, img: document.querySelectorAll('img[src="x"]').length, scripts: [...document.querySelectorAll('script')].filter((s) => /__pwn/.test(s.textContent)).length, bold: [...document.querySelectorAll('b')].filter((b) => b.textContent === 'bold').length, over: document.documentElement.scrollWidth > innerWidth + 1 }));
// Opens a writing tablet on the hub at a phone width.
async function tablet(w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto(hub.origin + '/?hub');
  await p.waitForFunction(() => window.SB && SB.booted === true, null, { timeout: 15000 });
  await p.waitForFunction(() => SB.store.hubStatus && SB.store.hubStatus().state === 'connected', null, { timeout: 15000 });
  await p.evaluate(() => SB.floor.setWelcome(false));
  p.ctx = ctx;
  return p;
}

// 1. The pairing box: a hub that answers with a hostile screen name, and one that answers with a hostile error
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage(); p.ctx = ctx;
  p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto(hub.origin + '/'); await p.waitForFunction(() => window.SB && SB.booted === true, null, { timeout: 15000 });
  await p.evaluate(() => SB.floor.setWelcome(false));
  await p.evaluate(() => SB.sheets.open('follow')); await p.waitForTimeout(800); await p.click('[data-mode="orders"]'); await p.waitForTimeout(300);
  await p.evaluate(() => { const b = document.querySelector('[data-role="pair-box"]'); if (b) b.hidden = false; });
  const fill = async () => {
    await p.fill('#hu-url', 'http://127.0.0.1:1'); await p.fill('#hu-name', 'Pass'); await p.fill('#hu-pair', 'ABC234');
    const btn = p.locator('[data-role="pair-box"] button').first(); await btn.click({ force: true }); await p.waitForTimeout(700);
  };
  await p.evaluate(() => { window.__msgs = []; const e = document.querySelector('[data-role="hub-msg"]'); new MutationObserver((ms) => { for (const m of ms) { m.addedNodes.forEach((n) => window.__msgs.push(n.textContent)); if (m.type === 'characterData') window.__msgs.push(m.target.textContent); } }).observe(e, { childList: true, characterData: true, subtree: true }); });
  await p.evaluate((n) => { SB.store.pairHub = async () => ({ ok: true, name: n, owner: false, id: 's1' }); SB.store.probeHub = () => new Promise(() => {}); }, HUGE);
  await fill();
  const m1 = await p.evaluate(() => { const e = document.querySelector('[data-role="hub-msg"]'); const paired = window.__msgs.filter((x) => /^Paired as/.test(x)); return e ? { t: Math.max(0, ...window.__msgs.map((x) => x.length)), head: paired[0] ? paired[0].slice(0, 40) : 'no Paired line seen', seen: paired.length, html: e.children.length } : null; });
  console.log('  note  ', JSON.stringify(m1));
  check('a 50k-char screen name from the hub shows as short plain text in the pairing box', !!m1 && m1.seen > 0 && m1.t < 200 && m1.html === 0, m1);
  const d1 = await damage(p);
  check('no element, script or sideways scroll came from that name', !d1.pwn && !d1.img && !d1.scripts && !d1.bold && !d1.over, d1);
  await p.screenshot({ path: SHOTS + '/hostile-pair-name-390.png' });
  await p.evaluate((n) => { SB.store.pairHub = async () => ({ ok: false, error: n, reason: n }); }, HUGE);
  await fill();
  const m2 = await p.evaluate(() => { const e = document.querySelector('[data-role="hub-msg"]'); return e ? { t: e.textContent.length, txt: e.textContent.slice(0, 120) } : null; });
  console.log('  note  ', JSON.stringify(m2));
  check('a hostile pairing error shows a plain sentence, not the hostile text', !!m2 && m2.t < 300 && !/img|script|undefined|AAAA/.test(m2.txt), m2);
  const d2 = await damage(p);
  check('no element, script or sideways scroll came from the error either', !d2.pwn && !d2.img && !d2.scripts && !d2.bold && !d2.over, d2);
  await p.ctx.close();
}

// 2. A refusal from a hub whose answer is hostile: one toast, short, inside the screen
{
  const p = await tablet(390, 844);
  await p.route('**/action', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ report: HUGE, info: {}, text: HUGE, seq: 99 }) }));
  const mid = await p.evaluate(() => SB.store.getState().menu[0].id);
  await p.evaluate((mid) => SB.store.dispatch('createTicket', { customer: 'X', channel: 'takeout', items: [{ menuId: mid, qty: 1 }], note: '', rush: false }), mid);
  const shown = await until(() => p.evaluate(() => document.querySelectorAll('.toast').length > 0), 6000);
  const t = await p.evaluate(() => { const e = document.querySelector('.toast'); if (!e) return null; const b = e.getBoundingClientRect(); return { len: e.innerText.length, l: b.left, r: b.right, h: b.height, vh: innerHeight, kids: e.querySelectorAll('img,script,b').length }; });
  console.log('  note  ', JSON.stringify(t));
  check('a hostile refusal from the hub shows one toast', shown && !!t, t);
  check('the toast text is cut short, inside the screen, and taller than nothing but not the whole screen', !!t && t.len < 600 && t.l >= 0 && t.r <= 391 && t.h < t.vh * 0.6 && t.kids === 0, t);
  const d3 = await damage(p);
  check('no element, script or sideways scroll came from the refusal', !d3.pwn && !d3.img && !d3.scripts && !d3.bold && !d3.over, d3);
  await p.screenshot({ path: SHOTS + '/hostile-refusal-390.png' });
  await p.ctx.close();
}

// 3. A ticket entered by a screen with a hostile name: the office page shows a short plain "Entered by" line
{
  const p = await tablet(390, 844);
  await p.evaluate((n) => { const s = SB.store.getState(); const t = s.tickets[0]; if (t) t.screen = n; }, HUGE).catch(() => {});
  const mid = await p.evaluate(() => SB.store.getState().menu[0].id);
  await p.evaluate((mid) => SB.store.dispatch('createTicket', { customer: 'Y', channel: 'takeout', items: [{ menuId: mid, qty: 1 }], note: '', rush: false }), mid);
  await sleep(800);
  const name = await p.evaluate((n) => { const t = SB.store.getState().tickets[SB.store.getState().tickets.length - 1]; t.screen = n; return SB.sheets && 1 && (window.SB.office && SB.office.screenName ? SB.office.screenName(t) : null); }, HUGE);
  check('the office screen-name helper cuts a hostile name to 24 plain characters', typeof name === 'string' && name.length <= 24, name && name.length);
  await p.ctx.close();
}

check('no uncaught page errors', errs.length === 0, errs.slice(0, 3));
await browser.close();
await hub.stop();
console.log(fail ? fail + ' check(s) failed' : 'all checks passed');
process.exit(fail ? 1 : 0);
