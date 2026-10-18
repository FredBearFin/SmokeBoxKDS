// Journey 9: viewport sweep. 2560x1440, 1280x800, 1024x768, 390x844 (touch), 280x640 for the floor, every sheet and every office page,
// in Day, Night, large text (floor) and Ember, Paper (office). For each: no horizontal scroll, nothing wider than the viewport,
// primary buttons at least 44 px (every control on touch screens), text not clipped, a visible focus ring on Tab.
import { wait, seedStandard, settle, closeSheets, waitOffice, gotoOffice, layoutAudit, scrollers, focusRings, sheetStable, OFFICE_PAGES } from './_lib.mjs';

const VP = {
  '2560': { w: 2560, h: 1440, touch: false },
  '1280': { w: 1280, h: 800, touch: false },
  '1024': { w: 1024, h: 768, touch: false },
  '390': { w: 390, h: 844, touch: true },
  '280': { w: 280, h: 640, touch: true },
};
const SHEETS = [
  { name: 'order', label: 'New ticket', open: 'key:n' }, { name: 'hold', label: 'Hold cabinet', open: 'key:h' }, { name: 'board86', label: '86 board', open: 'key:8' },
  { name: 'recall', label: 'Recall', open: 'key:r' }, { name: 'demo', label: 'Demo and clock', open: 'key:d' }, { name: 'help', label: 'Help', open: 'key:?' },
  { name: 'specs', label: 'Specs', open: 'api' }, { name: 'menu', label: 'Menu', open: 'api' },
];
const PAGE_OWNER = { pace: 'officeA', tickets: 'officeA', stations: 'officeA', money: 'officeB', safety: 'officeB', stock: 'officeB', data: 'officeC' };

const newBag = () => ({ hscroll: [], wide: [], prim: [], tap: [], clip: [], inner: [] });

/** Run the layout audit on the current screen and file what it finds under the bag, labelled with the scene. */
async function auditInto(page, label, bag, o) {
  const a = await layoutAudit(page, { scope: o.scope || 'body' });
  const own = o.owner;
  if (a.docOver > 0 || a.bodyOver > 0) bag.hscroll.push({ label, owner: own, d: 'page scrolls sideways by ' + Math.max(a.docOver, a.bodyOver) + ' px' });
  if (a.wide.length) bag.wide.push({ label, owner: own, d: a.wide.slice(0, 3).join('; ') });
  if (a.smallPrimary.length) bag.prim.push({ label, owner: own, d: a.smallPrimary.slice(0, 3).join('; ') });
  if (o.touch) { if (a.small.length) bag.tap.push({ label, owner: own, d: a.smallCount + ' under 44 px: ' + a.small.slice(0, 3).join('; ') }); }
  else { const tiny = a.small.filter((s) => Number((/(\d+)px$/.exec(s) || [0, 99])[1]) < 32); if (tiny.length) bag.tap.push({ label, owner: own, d: tiny.length + ' under 32 px: ' + tiny.slice(0, 3).join('; ') }); }
  if (a.clipped.length || a.spill.length) bag.clip.push({ label, owner: own, d: a.clipped.concat(a.spill).slice(0, 3).join('; ') });
  const sc = await scrollers(page, o.scope || 'body');
  if (sc.length) bag.inner.push({ label, owner: own, d: sc.slice(0, 3).join('; ') });
  return a;
}

/** One check per category, with the failing scenes in the detail. */
function emit(t, bag, where, owner, touch) {
  const row = (key, name) => { const l = bag[key]; t.check(name + ' (' + where + ')', !l.length, l.slice(0, 4).map((x) => x.label + ': ' + x.d).join(' | ') + (l.length > 4 ? ' | +' + (l.length - 4) + ' more scenes' : ''), l.length ? l[0].owner : owner); };
  row('hscroll', 'no horizontal page scroll');
  row('wide', 'no element wider than the viewport');
  row('prim', 'primary buttons are at least 44 px tall');
  row('tap', touch ? 'every control is at least 44 px tall on a touch screen' : 'no control is under 32 px tall');
  row('clip', 'no text is clipped or spills out of its control');
  if (bag.inner.length) t.note('inner horizontal scrollers (' + where + ')', bag.inner.slice(0, 5).map((x) => x.label + ': ' + x.d).join(' | '), '');
}

async function openSheet(page, s) {
  await closeSheets(page);
  if (s.open.startsWith('key:')) await page.keyboard.press(s.open.slice(4));
  else await page.evaluate((n) => SB.sheets.open(n), s.name);
  const d = page.locator('[role=dialog]').first();
  await d.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
  await wait(300);
  await sheetStable(page);
}

async function ringCheck(t, page, label, owner) {
  const rings = await focusRings(page, 3);
  const bad = rings.filter((r) => !r.none && !(r.ring || r.shadow));
  const off = rings.filter((r) => !r.none && !r.onscreen);
  const none = rings.filter((r) => r.none).length;
  t.check('Tab shows a focus ring on the control it lands on (' + label + ')', bad.length === 0 && none < 3, JSON.stringify(rings.map((r) => r.none ? 'body' : r.name + (r.ring || r.shadow ? '' : ' NO RING'))), owner);
  t.check('Tab keeps the focused control on screen (' + label + ')', off.length === 0, off.map((r) => r.name), owner);
}

export default function (h) {
  // ---------------------------------------------------------------------------------------------------------------------
  h.test('09a-floor-viewports', 'Viewports: the board at 2560, 1280, 1024, 390 and 280 wide in Day, Night and large text', { owner: 'board', timeout: 150000 }, async (t) => {
    for (const id of Object.keys(VP)) {
      const vp = VP[id];
      const page = await t.open({ w: vp.w, h: vp.h, touch: vp.touch });
      await seedStandard(page);
      const bag = newBag();
      const scenes = [['day', 'normal'], ['night', 'normal'], ['day', 'large'], ['night', 'large']];
      for (const [th, tx] of scenes) {
        await page.evaluate(([th, tx]) => { SB.theme.set(th); SB.theme.setTextSize(tx); }, [th, tx]);
        await settle(page, 350);
        await auditInto(page, th + '/' + tx, bag, { owner: 'board', touch: vp.touch });
        if (th === 'day' && tx === 'normal') {
          await t.shot(page, 'vp-floor-' + id + '-day');
          await ringCheck(t, page, 'board ' + id, 'board');
          await page.evaluate(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); });
        }
        if (th === 'night' && tx === 'large' && (id === '390' || id === '280')) await t.shot(page, 'vp-floor-' + id + '-night-large');
      }
      emit(t, bag, 'board ' + id, 'board', vp.touch);
      // the header must still show the brand, the clock and a way into the menu at every size
      const hd = await page.evaluate(() => { const q = (s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return { w: Math.round(r.width), h: Math.round(r.height), shown: cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 }; }; return { menu: q('.fl-head .fl-menu'), brand: q('.fl-head [data-brand]'), tabs: q('.fl-seg') }; });
      t.check('the header menu button, the flame and the station tabs are all visible at ' + id, !!(hd.menu && hd.menu.shown && hd.brand && hd.brand.shown && hd.tabs && hd.tabs.shown), hd, 'board');
      await page.context().close().catch(() => {});
    }
    // the slip grid at 2560 uses the width (more than one column) and at 280 stacks to one column
    const wide = await t.open({ w: 2560, h: 1440 });
    await seedStandard(wide);
    const cols2560 = await wide.evaluate(() => new Set(Array.from(document.querySelectorAll('.fl-grid > .fl-slip')).map((s) => Math.round(s.getBoundingClientRect().left))).size);
    t.check('at 2560 the four demo slips sit in several columns, not one narrow stack', cols2560 >= 3, cols2560, 'board');
    const narrow = await t.open({ w: 280, h: 640, touch: true });
    await seedStandard(narrow);
    const cols280 = await narrow.evaluate(() => new Set(Array.from(document.querySelectorAll('.fl-grid > .fl-slip')).map((s) => Math.round(s.getBoundingClientRect().left))).size);
    const w280 = await narrow.evaluate(() => Array.from(document.querySelectorAll('.fl-grid > .fl-slip')).map((s) => Math.round(s.getBoundingClientRect().width)));
    t.note('at 280 wide the slips are this wide / in this many columns', w280.join(', ') + ' px / ' + cols280, '');
    t.check('at 280 each slip is at least 85 percent of the screen width (the board uses the little room there is)', w280.length > 0 && w280.every((w) => w >= 0.85 * 280), w280, 'board');
    await t.clean(narrow, 'viewport sweep');
  });

  // ---------------------------------------------------------------------------------------------------------------------
  const sheetSweep = (ids, tid) => async (t) => {
    for (const id of ids) {
      const vp = VP[id];
      const page = await t.open({ w: vp.w, h: vp.h, touch: vp.touch });
      await seedStandard(page);
      const bag = newBag();
      for (const [th, tx] of [['day', 'normal'], ['night', 'large']]) {
        await page.evaluate(([th, tx]) => { SB.theme.set(th); SB.theme.setTextSize(tx); }, [th, tx]);
        for (const s of SHEETS) {
          await openSheet(page, s);
          const opened = await page.evaluate(() => SB.sheets.count());
          if (!opened) { bag.hscroll.push({ label: s.label, owner: 'sheets', d: 'did not open' }); continue; }
          await auditInto(page, s.label + ' ' + th + '/' + tx, bag, { owner: 'sheets', touch: vp.touch, scope: '[role=dialog]' });
          // the sheet itself must fit the screen: its box inside the viewport, and its Close control reachable
          const fit = await page.evaluate(() => { const d = document.querySelector('[role=dialog]'); const r = d.getBoundingClientRect(); const c = d.querySelector('[aria-label*="Close" i], .sheet-close, button.sh-close'); const cr = c ? c.getBoundingClientRect() : null; return { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom), vw: innerWidth, vh: innerHeight, close: cr ? { x: Math.round(cr.left), y: Math.round(cr.top), w: Math.round(cr.width), h: Math.round(cr.height) } : null }; });
          if (fit.l < -1 || fit.r > fit.vw + 1 || fit.t < -1 || fit.b > fit.vh + 1) bag.wide.push({ label: s.label + ' ' + th + '/' + tx, owner: 'sheets', d: 'sheet box ' + JSON.stringify(fit) });
          if (fit.close && (fit.close.x < 0 || fit.close.x + fit.close.w > fit.vw + 1 || fit.close.y < 0 || fit.close.y > fit.vh)) bag.wide.push({ label: s.label + ' ' + th + '/' + tx, owner: 'sheets', d: 'Close control off screen ' + JSON.stringify(fit.close) });
          if (th === 'day' && (id === '390' || id === '280' || id === '1280') && ['order', 'hold', 'board86'].includes(s.name)) await t.shot(page, 'vp-sheet-' + s.name + '-' + id);
          if (th === 'day' && s.name === 'order') await ringCheck(t, page, 'order sheet ' + id, 'sheets');
        }
        await closeSheets(page);
      }
      emit(t, bag, 'sheets ' + id, 'sheets', vp.touch);
      await page.context().close().catch(() => {});
    }
  };
  h.test('09b-sheets-wide', 'Viewports: every sheet at 2560, 1280 and 1024 wide', { owner: 'sheets', timeout: 170000 }, sheetSweep(['2560', '1280', '1024']));
  h.test('09c-sheets-narrow', 'Viewports: every sheet at 390 (touch) and 280 wide', { owner: 'sheets', timeout: 170000 }, sheetSweep(['390', '280']));

  // ---------------------------------------------------------------------------------------------------------------------
  const officeSweep = (runs, tid) => async (t) => {
    for (const run of runs) {
      const vp = VP[run.vp];
      const page = await t.open({ w: vp.w, h: vp.h, touch: vp.touch, hash: '#/office/pace' });
      await waitOffice(page, 8000);
      await page.evaluate(([o, tx]) => { SB.theme.setOffice(o); SB.theme.setTextSize(tx); }, [run.look, run.text || 'normal']);
      await settle(page, 400);
      const bag = newBag();
      for (const p of OFFICE_PAGES) {
        await gotoOffice(page, p.id, 8000);
        const a = await auditInto(page, p.title, bag, { owner: PAGE_OWNER[p.id], touch: vp.touch, scope: '#sb-office' });
        const mainOver = await page.evaluate(() => { const m = document.querySelector('#sb-office .of-main'); return m ? m.scrollWidth - m.clientWidth : 0; });
        if (mainOver > 1) bag.hscroll.push({ label: p.title, owner: PAGE_OWNER[p.id], d: 'the page area scrolls sideways by ' + mainOver + ' px' });
        if (p.id === 'pace') {
          await t.shot(page, 'vp-office-' + run.vp + '-' + run.look + (run.text === 'large' ? '-large' : '') + '-pace');
          await ringCheck(t, page, 'office ' + run.vp + ' ' + run.look, 'officeA');
        }
        if (run.vp === '280' && p.id === 'money') await t.shot(page, 'vp-office-280-ember-money');
      }
      emit(t, bag, 'office ' + run.vp + ' ' + run.look + (run.text === 'large' ? ' large text' : ''), 'officeA', vp.touch);
      await t.clean(page, 'office sweep ' + run.vp + ' ' + run.look);
      await page.context().close().catch(() => {});
    }
  };
  h.test('09d-office-wide', 'Viewports: the 7 office pages at 2560, 1280 and 1024 wide (Ember, and Paper at 1280)', { owner: 'officeA', timeout: 170000 },
    officeSweep([{ vp: '2560', look: 'ember' }, { vp: '1280', look: 'ember' }, { vp: '1280', look: 'paper' }, { vp: '1024', look: 'ember' }]));
  h.test('09e-office-narrow', 'Viewports: the 7 office pages at 390 (touch) and 280 wide (Ember, Paper, large text)', { owner: 'officeA', timeout: 170000 },
    officeSweep([{ vp: '390', look: 'ember' }, { vp: '390', look: 'paper' }, { vp: '390', look: 'ember', text: 'large' }, { vp: '280', look: 'ember' }]));
}
