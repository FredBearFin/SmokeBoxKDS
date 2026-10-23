#!/usr/bin/env node
// WHAT THIS FILE IS: A quick accessibility check of the Guide on the built app: landmarks, heading order, a name and a role on
//    every control, no duplicate ids, a skip link, the page list marking the current page, and keyboard-only use (Tab, Enter, Escape).
// PARTS: the page checks, the keyboard walk, the summary. USES: Playwright through tools/_deps.mjs and dist/smokebox.html.
// USED BY: people, after changing the Guide. Run: node tools/build.mjs --quiet && node tools/guide-a11y.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toolRequire } from './_deps.mjs';

const { chromium } = toolRequire('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = 'file://' + path.join(ROOT, 'dist', 'smokebox.html');
const results = [];
// Records one check and prints it.
const check = (name, ok, detail) => { results.push({ name, ok: !!ok }); console.log((ok ? '  ok    ' : '  FAIL  ') + name + (ok ? '' : '  -> ' + JSON.stringify(detail))); };

// Looks at the open Guide page inside the page and returns what is wrong with it.
function audit() {
  const root = document.getElementById('sb-guide');
  const out = { unnamed: [], dupIds: [], headings: [], landmarks: {}, imgNoName: [], skip: false, current: 0 };
  // The accessible name of an element: aria-label, aria-labelledby, an image title, its text, or its title.
  const nameOf = (e) => {
    const al = e.getAttribute('aria-label'); if (al && al.trim()) return al.trim();
    const lb = e.getAttribute('aria-labelledby'); if (lb) { const t = lb.split(' ').map((i) => (document.getElementById(i) || {}).textContent || '').join(' ').trim(); if (t) return t; }
    if (e.id) { const l = document.querySelector('label[for="' + e.id + '"]'); if (l && l.textContent.trim()) return l.textContent.trim(); }
    const t = (e.textContent || '').trim(); if (t) return t;
    return (e.getAttribute('title') || '').trim();
  };
  root.querySelectorAll('a[href], button, input, summary, [tabindex]:not([tabindex="-1"]), [role=button]').forEach((e) => { if (e.getClientRects().length && !nameOf(e)) out.unnamed.push(e.outerHTML.slice(0, 80)); });
  const ids = {}; document.querySelectorAll('[id]').forEach((e) => { ids[e.id] = (ids[e.id] || 0) + 1; }); Object.keys(ids).forEach((k) => { if (ids[k] > 1) out.dupIds.push(k); });
  root.querySelectorAll('h1, h2, h3, h4').forEach((e) => { if (e.getClientRects().length) out.headings.push(+e.tagName[1]); });
  out.landmarks = { nav: root.querySelectorAll('nav[aria-label]').length, main: root.querySelectorAll('main').length, search: root.querySelectorAll('[role=search]').length, region: root.getAttribute('role') === 'region' && !!root.getAttribute('aria-label') };
  root.querySelectorAll('svg[role=img]').forEach((e) => { if (!(e.getAttribute('aria-label') || '').trim()) out.imgNoName.push('svg'); });
  out.skip = !!root.querySelector('a.gd-skip');
  out.current = root.querySelectorAll('[aria-current="page"]').length;
  return out;
}

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium' });
try {
  for (const pg of ['getting-started', 'running-the-line', 'hold-cabinet-and-warnings', 'card-opening-checklist']) {
    console.log('Page ' + pg);
    const p = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await p.goto(FILE + '#/guide/' + pg); await p.waitForTimeout(700);
    const a = await p.evaluate(audit);
    check(pg + ': every control has a name', a.unnamed.length === 0, a.unnamed);
    check(pg + ': no duplicate ids', a.dupIds.length === 0, a.dupIds);
    check(pg + ': one h1, then headings never skip a level', a.headings[0] === 1 && a.headings.filter((x) => x === 1).length === 1 && a.headings.every((x, i) => i === 0 || x <= a.headings[i - 1] + 1), a.headings);
    check(pg + ': landmarks (region, nav, main, search)', a.landmarks.region && a.landmarks.nav === 1 && a.landmarks.main === 1 && a.landmarks.search === 1, a.landmarks);
    check(pg + ': pictures have descriptions', a.imgNoName.length === 0, a.imgNoName);
    check(pg + ': skip link present', a.skip);
    check(pg + ': exactly one page marked current', a.current === 1, a.current);
    await p.close();
  }
  console.log('Print');
  const q = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await q.goto(FILE + '#/guide/card-closing-checklist'); await q.waitForTimeout(700);
  await q.emulateMedia({ media: 'print' });
  check('printing a quick card shows the card (other print rules must not hide the whole app)', await q.evaluate(() => { const g = document.getElementById('sb-guide'); return g.getBoundingClientRect().height > 100 && getComputedStyle(document.getElementById('app')).display !== 'none'; }));
  await q.close();
  console.log('Keyboard only');
  const k = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await k.goto(FILE); await k.waitForTimeout(800);
  await k.evaluate(() => SB.guide.open('taking-an-order')); await k.waitForTimeout(500);
  check('opening focuses the page title', await k.evaluate(() => document.activeElement.className.indexOf('gd-page-title') >= 0));
  await k.keyboard.press('Shift+Tab');
  const order = [];
  for (let i = 0; i < 8; i++) { await k.keyboard.press('Tab'); order.push(await k.evaluate(() => { const e = document.activeElement; return (e.className || e.tagName) + ':' + ((e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 20)); })); }
  check('Tab moves forward through real controls', order.every((x) => x.length > 3), order);
  await k.focus('#gd-search'); await k.keyboard.type('sound'); await k.waitForTimeout(200);
  check('search results are announced politely', await k.evaluate(() => { const s = document.querySelector('.gd-search-n'); return s.getAttribute('role') === 'status' && s.getAttribute('aria-live') === 'polite' && /match/.test(s.textContent); }));
  await k.keyboard.press('ArrowDown'); await k.keyboard.press('Enter'); await k.waitForTimeout(400);
  check('Arrow Down then Enter opens a result and moves focus to its title', await k.evaluate(() => location.hash.indexOf('#/guide/') === 0 && document.activeElement.className.indexOf('gd-page-title') >= 0), await k.evaluate(() => location.hash));
  await k.keyboard.press('Escape'); await k.waitForTimeout(400);
  check('Escape returns to the board', await k.evaluate(() => location.hash === '#/' || location.hash === ''), await k.evaluate(() => location.hash));
  await k.close();
} finally { await browser.close(); }
const bad = results.filter((r) => !r.ok);
console.log('\n' + (results.length - bad.length) + ' of ' + results.length + ' checks held');
process.exit(bad.length ? 1 : 0);
