// Contrast and keyboard checks for the board and its sheets (browser, about 60 s). Run: node test/board-contrast.e2e.mjs
// Computes text/background pairs from the real computed styles in Day, Night and Large text (4.5:1 for small text, 3:1 for
// large), checks that the keyboard focus ring is visible, and walks the board, New ticket, Orders and the cabinet with the
// keyboard (Escape closes, focus comes back). Needs dist/smokebox.html.
import { withPage } from '../tools/pw.mjs';

let fail = 0;
// Records one check and prints it.
function check(name, ok, detail) { if (!ok) fail++; console.log((ok ? '  ok    ' : '  FAIL  ') + name + (ok ? '' : ' -> ' + JSON.stringify(detail))); }
const ready = (page) => page.waitForFunction(() => window.SB && SB.booted === true, null, { timeout: 8000 });
const checker = () => {
  const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(',').map((x) => parseFloat(x)); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const blend = (top, bot) => ({ r: top.r * top.a + bot.r * (1 - top.a), g: top.g * top.a + bot.g * (1 - top.a), b: top.b * top.a + bot.b * (1 - top.a), a: 1 });
  const bgOf = (el) => { const pb = getComputedStyle(el, '::before'); const pbc = pb.content !== 'none' ? parse(pb.backgroundColor) : null; if (pbc && pbc.a > 0.9 && pb.position === 'absolute') return pbc; const stack = []; let e = el; while (e) { const cs = getComputedStyle(e); const pq = getComputedStyle(e, '::before'); const pqc = pq.content !== 'none' && pq.position === 'absolute' ? parse(pq.backgroundColor) : null; if (pqc && pqc.a > 0.9 && e !== el) return pqc; const c = parse(cs.backgroundColor); if (cs.backgroundImage !== 'none') return null; if (c && c.a > 0) { stack.push(c); if (c.a >= 1) break; } e = e.parentElement; } let base = { r: 255, g: 255, b: 255, a: 1 }; for (let i = stack.length - 1; i >= 0; i--) base = blend(stack[i], base); return base; };
  const out = []; const seen = new Set();
  const root = document.querySelector('.sheet-root:last-of-type') || document.body;
  for (const el of root.querySelectorAll('*')) {
    if (!el.childNodes.length) continue;
    const own = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).map((n) => n.textContent.trim()).join(' ');
    if (!own) continue;
    const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2 || !el.offsetParent) continue;
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || +cs.opacity === 0) continue;
    const fg = parse(cs.color); const bg = bgOf(el); if (!fg || !bg) continue;
    let op = 1; let p = el; while (p) { op *= +getComputedStyle(p).opacity; p = p.parentElement; }
    const f = blend({ ...fg, a: fg.a * op }, bg);
    const L1 = lum(f), L2 = lum(bg); const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const size = parseFloat(cs.fontSize), bold = parseInt(cs.fontWeight) >= 700; const large = size >= 24 || (bold && size >= 18.66);
    if (ratio < (large ? 3 : 4.5)) { const key = (el.className || el.tagName) + '|' + own.slice(0, 20); if (!seen.has(key)) { seen.add(key); out.push({ t: own.slice(0, 40), cls: String(el.className).slice(0, 40), ratio: +ratio.toFixed(2), size, need: large ? 3 : 4.5 }); } }
  }
  return out;
};

const states = {
  board: async () => {},
  order: async (p) => { await p.evaluate(() => SB.sheets.open('order')); await p.waitForTimeout(600); },
  orders: async (p) => { await p.evaluate(() => SB.sheets.open('orders')); await p.waitForTimeout(600); },
  cabinet: async (p) => { await p.click('.fl-seg button:has-text("Cabinet")'); await p.waitForTimeout(600); },
  board86: async (p) => { await p.evaluate(() => SB.sheets.open('board86')); await p.waitForTimeout(600); },
  recall: async (p) => { await p.evaluate(() => SB.sheets.open('recall')); await p.waitForTimeout(600); },
  menu: async (p) => { await p.evaluate(() => SB.sheets.open('menu')); await p.waitForTimeout(600); },
  help: async (p) => { await p.evaluate(() => SB.sheets.open('help')); await p.waitForTimeout(600); },
  discards: async (p) => { await p.evaluate(() => SB.sheets.open('discards')); await p.waitForTimeout(600); },
};
for (const th of ['day', 'night', 'night-large']) {
  await withPage({ w: 1280, h: 800, hash: '' }, async (page) => {
    await ready(page);
    await page.goto(page.url().split('#')[0].split('?')[0] + '?demo'); await ready(page);
    await page.evaluate((t) => { SB.floor.setWelcome(false); SB.theme.set(t.startsWith('night') ? 'night' : 'day'); if (t.includes('large')) SB.theme.setTextSize('large'); SB.sim.live.crew(false); SB.store.resetLive({ keepSettings: true, starter: true, stagger: true, catalog: 'sample', replaceOwn: true }); SB.sim.seedFirstRun({ force: true }); SB.sim.live.burst(8); SB.store.setSpeed(300); }, th);
    await page.waitForTimeout(5000); await page.evaluate(() => SB.store.setSpeed(1)); await page.waitForTimeout(500);
    for (const [name, fn] of Object.entries(states)) {
      await fn(page);
      const bad = await page.evaluate(checker);
      check(th + ' ' + name + ': every text pair has enough contrast', bad.length === 0, bad.slice(0, 4));
      await page.keyboard.press('Escape'); await page.waitForTimeout(500);
      if (name === 'order' && (await page.locator('button:has-text("Close, keep draft")').count())) await page.click('button:has-text("Close, keep draft")');
      await page.waitForTimeout(300);
      if (name === 'cabinet') await page.click('.fl-seg button:has-text("All")');
    }
  });
}

// Focus rings on every kind of control, in Day and Night: each must show an outline of at least 2 px whose colour has 3:1 against what is behind it.
for (const th of ['day', 'night']) {
  await withPage({ w: 1280, h: 800, hash: '' }, async (page) => {
    await ready(page);
    await page.goto(page.url().split('#')[0].split('?')[0] + '?demo'); await ready(page);
    await page.evaluate((t) => { SB.floor.setWelcome(false); SB.theme.set(t); SB.sim.live.crew(false); SB.store.resetLive({ keepSettings: true, starter: true, stagger: true, catalog: 'sample', replaceOwn: true }); SB.sim.seedFirstRun({ force: true }); }, th);
    await page.waitForTimeout(800);
    await page.keyboard.press('Tab');
    const kinds = { 'tab button': '.fl-seg [role="tab"][aria-selected="true"]', 'header button': '.fl-new', 'ticket button': '.fl-bump', 'dish tile button': 'button.fl-item', 'strip clear button': '.fl-strip-x', 'help link': '.gd-help' };
    for (const [name, sel] of Object.entries(kinds)) {
      const r = await page.evaluate((sel) => { const e = [...document.querySelectorAll(sel)].find((x) => x.offsetParent !== null); if (!e) return null; e.focus({ focusVisible: true }); const cs = getComputedStyle(e); const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); const q = m[1].split(',').map(Number); return { r: q[0], g: q[1], b: q[2] }; }; const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); }; let bg = null, x = e.parentElement; while (x) { const b = getComputedStyle(x).backgroundColor; const m = b.match(/rgba?\(([^)]+)\)/); if (m) { const q = m[1].split(',').map(Number); if (q.length < 4 || q[3] > 0.9) { bg = { r: q[0], g: q[1], b: q[2] }; break; } } x = x.parentElement; } const oc = parse(cs.outlineColor); const L1 = lum(oc), L2 = bg ? lum(bg) : 1; return { w: parseFloat(cs.outlineWidth), style: cs.outlineStyle, ratio: +((Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)).toFixed(2) }; }, sel);
      if (r) check(th + ' focus ring on ' + name, r.style !== 'none' && r.w >= 2 && r.ratio >= 3, r);
    }
  });
}

await withPage({ w: 1280, h: 800, hash: '' }, async (page, logs) => {
  await ready(page);
  await page.goto(page.url().split('#')[0].split('?')[0] + '?demo'); await ready(page);
  await page.evaluate(() => { SB.floor.setWelcome(false); SB.sim.live.crew(false); SB.store.resetLive({ keepSettings: true, starter: true, stagger: true, catalog: 'sample', replaceOwn: true }); SB.sim.seedFirstRun({ force: true }); });
  await page.waitForTimeout(800);
  // Focus ring: Tab onto a button and read its outline
  await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
  const ring = await page.evaluate(() => { const e = document.activeElement; const cs = getComputedStyle(e); return { tag: e.tagName, w: parseFloat(cs.outlineWidth), style: cs.outlineStyle, col: cs.outlineColor }; });
  check('a focused control shows a visible outline', ring.style !== 'none' && ring.w >= 2, ring);
  // New ticket by keyboard, Escape closes, focus returns to the button
  await page.focus('.fl-new'); await page.keyboard.press('Enter'); await page.waitForSelector('.sheet .ord'); await page.waitForTimeout(500);
  await page.keyboard.press('Escape'); await page.waitForTimeout(500);
  const back = await page.evaluate(() => { const a = document.activeElement; return a ? (a.className || a.tagName).toString().slice(0, 40) : null; });
  const stillOpen = await page.locator('.sheet .ord').count();
  check('Escape closes the New ticket sheet', stillOpen === 0 || (await page.locator('button:has-text("Close, keep draft")').count()) === 0, stillOpen);
  check('focus returns to the board after the sheet closes', /fl-new|fl-/.test(back || ''), back);
  await page.focus('[data-tool="orders"]'); await page.keyboard.press('Enter'); await page.waitForSelector('.sheet .ox-row'); await page.keyboard.press('Escape'); await page.waitForTimeout(500);
  check('Escape closes Orders', (await page.locator('.sheet .ox-row').count()) === 0);
  check('no page errors', logs.pageErrors.length === 0, logs.pageErrors);
});
process.exit(fail ? 1 : 0);
