// Touch audit of the setup screens: at 390x844, 768x1024 and 1024x768, in Day, Night and Large text, it opens each setup sheet
// with realistic content and reports tap targets under 44 px, anything running past the screen edge, and sideways scrolling.
// Headless Chromium only; not a real tablet. Run after building: node ux-scripts/touch-audit.mjs  (writes shots to docs/ux-shots/night/a2/audit/)
import fs from 'node:fs';
import path from 'node:path';
import { withPage, ROOT } from '../tools/pw.mjs';
const OUT = path.join(ROOT, 'docs/ux-shots/night/a2/audit');
fs.mkdirSync(OUT, { recursive: true });
const SIZES = [[390, 844], [768, 1024], [1024, 768], [1920, 1080]];
const LOOKS = [['day', 'normal'], ['night', 'normal'], ['day', 'large']];
const MIN = 44;
// Reports the small, clipped or sideways-scrolling things inside the top sheet (or the whole page when no sheet is open).
function measure() {
  const MIN = 44;
  const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const sheets = [...document.querySelectorAll('.sheet')].filter(vis);
  const top = sheets[sheets.length - 1] || document.body;
  const out = { small: [], clipped: [], hscroll: [] };
  const vw = window.innerWidth;
  top.querySelectorAll('button, input, select, textarea, summary, a[href], [role=radio]').forEach((e) => {
    if (!vis(e) || e.closest('[hidden]')) return;
    const r = e.getBoundingClientRect();
    const label = (e.getAttribute('aria-label') || e.textContent || e.placeholder || e.className).trim().slice(0, 30);
    if (e.type === 'file') return;
    if (e.type === 'checkbox') { const l = e.closest('label') || e; const lr = l.getBoundingClientRect(); if (lr.height < MIN && r.height < MIN) out.small.push(label + ' (checkbox ' + Math.round(r.width) + 'x' + Math.round(r.height) + ')'); return; }
    const ring = getComputedStyle(e, '::after'); const grow = ring.content !== 'none' && ring.position === 'absolute' ? 16 : 0; // a hidden ring round a small control widens its tap area
    if (r.height + grow < MIN - 0.5 || r.width + grow < MIN - 0.5) out.small.push(label + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
    if (r.right > vw + 1 || r.left < -1) out.clipped.push(label + ' right=' + Math.round(r.right));
  });
  top.querySelectorAll('*').forEach((e) => { if (e.scrollWidth > e.clientWidth + 2 && getComputedStyle(e).overflowX !== 'hidden' && e.clientWidth > 0 && /^(DIV|SECTION|FORM|MAIN)$/.test(e.tagName) && getComputedStyle(e).overflowX !== 'auto') out.hscroll.push(e.className.toString().slice(0, 30)); });
  if (document.documentElement.scrollWidth > vw + 1) out.hscroll.push('PAGE ' + document.documentElement.scrollWidth);
  return out;
}
const results = [];
for (const [w, h] of SIZES) for (const [theme, text] of LOOKS) {
  await withPage({ w, h, touch: true }, async (page) => {
    await page.waitForFunction(() => window.SB && SB.booted === true);
    await page.evaluate(([t, x]) => { SB.theme.set(t); SB.theme.setTextSize(x); }, [theme, text]);
    const tag = w + 'x' + h + '-' + theme + '-' + text;
    // Opens Start over; when the earlier snaps set a PIN, types it on the keypad first.
    const openStartOver = async () => { await page.evaluate(() => SB.sheets.open('startover')); await page.waitForTimeout(400); if (await page.locator('.keypad').count()) { for (const d of ['1', '2', '3', '4']) await page.locator('.keypad button', { hasText: new RegExp('^' + d + '$') }).first().click(); await page.waitForTimeout(500); } };
    const snap = async (name, prep) => {
      await page.evaluate(() => SB.sheets.closeAll()); await page.waitForTimeout(250);
      await prep(); await page.waitForTimeout(450);
      const m = await page.evaluate(measure);
      await page.screenshot({ path: path.join(OUT, tag + '-' + name + '.png') });
      results.push({ tag, name, ...m });
      // At the smallest and the widest screen also read the bottom of the sheet, where the long forms end.
      if (w === 390 || w === 1920) {
        await page.evaluate(() => { const top = [...document.querySelectorAll('.sheet')].pop(); if (top) top.querySelectorAll('*').forEach((e) => { if (e.scrollHeight > e.clientHeight + 40 && /auto|scroll/.test(getComputedStyle(e).overflowY)) e.scrollTop = e.scrollHeight; }); });
        await page.waitForTimeout(250);
        await page.screenshot({ path: path.join(OUT, tag + '-' + name + '-end.png') });
      }
    };
    await snap('first-run', async () => {});
    await snap('dishes-empty', async () => { await page.evaluate(() => SB.sheets.open('dishes')); });
    await page.evaluate(() => { ['Pulled pork plate', 'Coleslaw'].forEach((n, i) => SB.store.dispatchEx('addMenuItem', { name: n, zone: i ? 'cold' : 'pit', cat: i ? 'cold' : 'meat', price: 10, prepSec: 120, track: 'two' }, { source: 'ui' })); });
    await snap('dishes-with-dishes', async () => { await page.evaluate(() => SB.sheets.open('dishes')); });
    await snap('dishes-folds-open', async () => { await page.evaluate(() => SB.sheets.open('dishes')); await page.waitForTimeout(300); await page.evaluate(() => document.querySelectorAll('.sheet details').forEach((d) => { d.open = true; })); });
    await snap('portions-open', async () => { await page.evaluate(() => SB.sheets.open('dishes')); await page.waitForTimeout(300); await page.evaluate(() => document.querySelector('.dp-por details') && (document.querySelector('.dp-por details').open = true)); });
    await snap('cooked-ahead', async () => { await page.evaluate(() => SB.sheets.open('cookahead')); });
    await snap('shop', async () => { await page.evaluate(() => SB.sheets.open('shop')); });
    await snap('import', async () => { await page.evaluate(() => SB.sheets.open('menuimport')); await page.waitForTimeout(300); await page.fill('textarea', 'Lemonade 3\nBad one\nChili 6.50'); await page.click('[data-act=import-check]'); });
    await snap('tablet-ready', async () => { await page.evaluate(() => SB.sheets.open('ready')); await page.waitForTimeout(400); });
    await snap('tablet-ready-heard', async () => { await page.evaluate(() => SB.sheets.open('ready')); await page.waitForTimeout(300); await page.click('[data-act=sound-test]'); await page.click('[data-act=sound-yes]'); });
    await snap('pilot-checklist', async () => { await page.evaluate(() => SB.sheets.open('pilot')); });
    await snap('tablet-checklist', async () => { await page.evaluate(() => SB.sheets.open('setup')); });
    await snap('leftovers-card', async () => { await page.evaluate(() => { const id = SB.store.getState().menu[0].id; SB.store.dispatchEx('createTicket', { customer: 'Demo', src: 'demo', items: [{ menuId: id, qty: 1 }] }, { source: 'ui' }); SB.sheets.open('menu'); }); });
    await snap('cold-form', async () => { await page.evaluate(() => { SB.store.dispatchEx('updateSettings', { patch: { modules: { cookAhead: true } } }, { source: 'ui' }); SB.sheets.open('cookahead'); }); await page.waitForTimeout(400); await page.locator('.sheet .seg-opt', { hasText: 'Cold' }).click(); });
    await snap('cold-edit', async () => { await page.evaluate(() => { const r = SB.store.dispatchEx('addIngredient', { name: 'Coleslaw', unit: 'g', tcs: true, hold: 'cold', maxHoldH: 4, holdBasis: 'safety' }, { source: 'ui' }); SB.sheets.open('cookahead', { id: r.info.id }); }); });
    await snap('recovery-code', async () => { await page.evaluate(() => SB.sheets.open('shop')); await page.waitForTimeout(300); await page.fill('[aria-label="Manager PIN, 4 digits"]', '1234'); await page.getByRole('button', { name: 'Set PIN' }).click(); await page.waitForTimeout(700); });
    await snap('serve', async () => { await page.evaluate(() => SB.sheets.open('serve')); });
    await snap('startover-1', async () => { await openStartOver(); });
    await snap('startover-2', async () => { await openStartOver(); await page.waitForTimeout(300); await page.click('[data-act=so-next1]'); });
    await snap('startover-3', async () => { await openStartOver(); await page.waitForTimeout(300); await page.click('[data-act=so-next1]'); await page.click('[data-act=so-save-backup]'); await page.check('#so-saw'); await page.click('[data-act=so-next2]'); });
    await snap('demo-intro', async () => { await page.evaluate(() => SB.sheets.open('demo')); });
    // Round 18: screens added since the last sweep. The cold ingredient and cook-ahead are set up by the earlier snaps on this page.
    await snap('settings-menu', async () => { await page.evaluate(() => SB.sheets.open('menu')); });
    await snap('readings', async () => { await page.evaluate(() => { SB.store.dispatchEx('updateSettings', { patch: { modules: { cookAhead: true } } }, { source: 'ui' }); SB.sheets.open('readings'); }); });
    await snap('discards', async () => { await page.evaluate(() => SB.sheets.open('discards')); });
    await snap('cabinet-cold', async () => { await page.evaluate(() => { const s = SB.store.getState(); const ing = Object.values(s.inventory || s.ingredients || {}).find((x) => x && x.name === 'Coleslaw') || (s.ingredients || []).find((x) => x.name === 'Coleslaw'); if (ing) SB.store.dispatchEx('addBatch', { ing: ing.id, tempF: 38, cookedG: 3000, src: 'cook' }, { source: 'ui' }); }); const tab = page.locator('button', { hasText: 'Cabinet' }).first(); if (await tab.count()) await tab.click(); });
    await snap('counter-board', async () => { await page.locator('button', { hasText: /^All/ }).first().click().catch(() => {}); await page.evaluate(() => { SB.store.dispatchEx('updateSettings', { patch: { service: { counter: true } } }, { source: 'ui' }); const id = SB.store.getState().menu.find((m) => !m.archived).id; SB.store.dispatchEx('createTicket', { customer: 'Front', items: [{ menuId: id, qty: 2 }] }, { source: 'ui' }); }); });
    await snap('data-page', async () => { await page.evaluate(() => { location.hash = '#/office/data'; }); await page.waitForTimeout(500); const pad = page.locator('button', { hasText: /^1$/ }); if (await pad.count()) { for (const d of ['1', '2', '3', '4']) await page.locator('button', { hasText: new RegExp('^' + d + '$') }).first().click(); await page.waitForTimeout(600); } const rep = page.locator('summary, button', { hasText: /Pilot report/ }).first(); if (await rep.count()) await rep.click().catch(() => {}); });
  });
}
fs.writeFileSync(path.join(OUT, 'audit.json'), JSON.stringify(results, null, 1));
const agg = {};
for (const r of results) for (const k of ['small', 'clipped', 'hscroll']) for (const x of r[k]) { const key = r.name + ' | ' + k + ' | ' + x; (agg[key] = agg[key] || new Set()).add(r.tag); }
const lines = Object.entries(agg).map(([k, v]) => k + '   [' + v.size + ' of ' + SIZES.length * LOOKS.length + ' looks]');
console.log(lines.length ? lines.join('\n') : 'no problems found');
console.log('checked', results.length, 'screens');
