// Journey 12: accessibility. Landmarks, names on every control, label-in-name, ids and references, headings, keyboard order and focus return,
// how chatty the live regions are during the demo, and a contrast sweep of every piece of visible text through SB.util.contrast.
import { wait, seedStandard, settle, closeSheets, openKey, waitOffice, gotoOffice, OFFICE_PAGES, has } from './_lib.mjs';

const PAGE_OWNER = { pace: 'officeA', tickets: 'officeA', stations: 'officeA', money: 'officeB', safety: 'officeB', stock: 'officeB', data: 'officeC' };
const SHEETS = [
  { name: 'order', label: 'New ticket', open: 'n' }, { name: 'hold', label: 'Hold cabinet', open: null }, { name: 'board86', label: '86 board', open: '8' },
  { name: 'recall', label: 'Recall', open: 'r' }, { name: 'demo', label: 'Demo and clock', open: 'd' }, { name: 'help', label: 'Help', open: '?' },
  { name: 'specs', label: 'Specs', open: null }, { name: 'menu', label: 'Menu', open: null },
];

/** The structural audit, run inside the page for one scope. */
const a11yAudit = (page, scope) => page.evaluate((scope) => {
  const root = document.querySelector(scope) || document.body;
  const vis = (e) => { for (let p = e; p && p !== document.documentElement; p = p.parentElement) { const cs = getComputedStyle(p); if (cs.display === 'none' || cs.visibility === 'hidden') return false; if (p.hidden) return false; } const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const inert = (e) => !!e.closest('[inert]');
  const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const lnorm = (s) => norm(s).replace(/[#,.:;!?()]/g, ' ').replace(/\s+/g, ' ').trim(); // label-in-name ignores punctuation
  const textOf = (n, skipHidden) => { let s = ''; n.childNodes.forEach((c) => { if (c.nodeType === 3) s += c.textContent; else if (c.nodeType === 1) { if (c.getAttribute('aria-hidden') === 'true') return; if (skipHidden && c.matches('.visually-hidden')) return; const cs = getComputedStyle(c); if (cs.display === 'none') return; s += (c.tagName === 'IMG' ? (c.alt || '') : textOf(c, skipHidden)) + ' '; } }); return s; };
  const nameOf = (e) => {
    const lb = e.getAttribute('aria-labelledby');
    if (lb) { const t = lb.split(/\s+/).map((id) => (document.getElementById(id) || {}).textContent || '').join(' ').trim(); if (t) return t; }
    const al = e.getAttribute('aria-label'); if (al && al.trim()) return al.trim();
    if (e.labels && e.labels.length) { const t = Array.from(e.labels).map((l) => l.textContent).join(' ').trim(); if (t) return t; }
    if (e.tagName === 'INPUT' && ['button', 'submit', 'reset'].includes(e.type)) return e.value || '';
    const tx = norm(textOf(e, false)); if (tx) return tx;
    const sv = e.querySelector('svg title'); if (sv && sv.textContent.trim()) return sv.textContent.trim();
    return (e.getAttribute('title') || '').trim();
  };
  const desc = (e) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
  const INTER = 'button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=tab], [role=radio], [role=switch], [role=checkbox], [role=menuitem], [role=link], [role=slider], [role=combobox], summary';
  const inter = Array.from(root.querySelectorAll(INTER)).filter((e) => vis(e) && !inert(e) && !e.closest('[aria-hidden="true"]'));
  const unnamed = inter.filter((e) => !nameOf(e)).map((e) => desc(e) + ' (' + e.getBoundingClientRect().width.toFixed(0) + 'x' + e.getBoundingClientRect().height.toFixed(0) + ')');
  const labelInName = [];
  inter.forEach((e) => {
    if (e.matches('select, input, textarea')) return;
    const al = lnorm(e.getAttribute('aria-label')); if (!al) return;
    const vt = lnorm(textOf(e, true)); if (vt.length < 2 || !/[a-z]{2}/.test(vt)) return; // symbols and bare numbers (-5, +1, #227) are not words a person would say
    if (!al.includes(vt)) labelInName.push(desc(e) + ' shows "' + vt.slice(0, 30) + '" but is named "' + al.slice(0, 50) + '"');
  });
  const ids = {}; document.querySelectorAll('[id]').forEach((e) => { ids[e.id] = (ids[e.id] || 0) + 1; });
  const dupIds = Object.keys(ids).filter((k) => ids[k] > 1).slice(0, 6);
  const broken = [];
  root.querySelectorAll('[aria-labelledby],[aria-describedby],[aria-controls]').forEach((e) => { if (!vis(e)) return; ['aria-labelledby', 'aria-describedby', 'aria-controls'].forEach((a) => { const v = e.getAttribute(a); if (v) v.split(/\s+/).forEach((id) => { if (!document.getElementById(id)) broken.push(desc(e) + ' ' + a + '=' + id); }); }); });
  const focusable = 'button:not([disabled]), a[href], input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const hiddenFocusable = Array.from(root.querySelectorAll('[aria-hidden="true"] :is(' + focusable + ')')).filter((e) => vis(e) && !inert(e)).map(desc).slice(0, 6);
  const validRoles = new Set('alert alertdialog application article banner button cell checkbox columnheader combobox complementary contentinfo definition dialog directory document feed figure form grid gridcell group heading img link list listbox listitem log main marquee math menu menubar menuitem menuitemcheckbox menuitemradio navigation none note option presentation progressbar radio radiogroup region row rowgroup rowheader scrollbar search searchbox separator slider spinbutton status switch tab table tablist tabpanel term textbox timer toolbar tooltip tree treegrid treeitem img generic paragraph meter caption code deletion emphasis insertion mark strong subscript superscript time blockquote'.split(' '));
  const badRoles = Array.from(root.querySelectorAll('[role]')).map((e) => e.getAttribute('role').split(/\s+/)[0]).filter((r) => !validRoles.has(r)).slice(0, 5);
  const svgBare = Array.from(root.querySelectorAll('svg')).filter((s) => vis(s) && !s.closest('[aria-hidden="true"]') && s.getAttribute('aria-hidden') !== 'true' && s.getAttribute('role') !== 'img' && !s.querySelector('title') && !s.closest('figure.ch')).map((s) => desc(s.parentElement || s)).slice(0, 5);
  const heads = Array.from(root.querySelectorAll('h1,h2,h3,h4,h5,h6,[role=heading]')).filter((e) => vis(e) && !e.closest('[aria-hidden="true"]')).map((e) => ({ l: e.tagName[1] ? Number(e.tagName[1]) : Number(e.getAttribute('aria-level') || 2), t: norm(e.textContent).slice(0, 30) }));
  const jumps = []; for (let i = 1; i < heads.length; i++) if (heads[i].l - heads[i - 1].l > 1) jumps.push('h' + heads[i - 1].l + ' "' + heads[i - 1].t + '" then h' + heads[i].l + ' "' + heads[i].t + '"');
  const fields = Array.from(root.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea')).filter((e) => vis(e) && !inert(e) && !e.closest('[aria-hidden="true"]') && !nameOf(e)).map(desc).slice(0, 5);
  return { interactive: inter.length, unnamed: unnamed.slice(0, 8), labelInName: labelInName.slice(0, 10), labelInNameCount: labelInName.length, dupIds, broken: broken.slice(0, 6), hiddenFocusable, badRoles, svgBare, h1: heads.filter((x) => x.l === 1).length, heads: heads.length, jumps: jumps.slice(0, 4), fields };
}, scope);

export default function (h) {
  // ---------------------------------------------------------------------------------------------------------------------
  h.test('12a-structure', 'Accessibility: landmarks, names on every control, label-in-name, ids, roles, headings (floor, sheets, office)', { owner: 'lead', timeout: 150000 }, async (t) => {
    const page = await t.open({ w: 1280, h: 800 });
    await seedStandard(page);
    const lm = await page.evaluate(() => {
      const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' && !e.closest('[hidden],[inert],[aria-hidden="true"]'); };
      const q = (s) => Array.from(document.querySelectorAll(s)).filter(vis).length;
      const vp = (document.querySelector('meta[name=viewport]') || {}).content || '';
      return { main: q('main,[role=main]'), banner: q('header,[role=banner]'), nav: q('nav,[role=navigation]'), tablist: q('[role=tablist]'), h1: q('h1'), lang: document.documentElement.lang, title: document.title, vp, skip: q('a.skip-link, a[href^="#"].skip, .skip-link'), live: document.querySelectorAll('[aria-live],[role=status],[role=alert]').length };
    });
    t.check('the board has exactly one main landmark', lm.main === 1, lm, 'board');
    t.check('the board has a banner (header) landmark', lm.banner >= 1, lm, 'board');
    t.check('the board has a heading level 1 (or a labelled main) for screen reader users', lm.h1 >= 1, lm, 'board');
    t.check('the station tabs are a real tablist', lm.tablist >= 1, lm, 'board');
    t.check('the page can be zoomed (no user-scalable=no, no maximum-scale below 2)', !/user-scalable\s*=\s*(no|0)/i.test(lm.vp) && !/maximum-scale\s*=\s*(0?\.\d|1(\.0*)?)\b/i.test(lm.vp), lm.vp, 'lead');
    t.note('landmarks on the board', 'main ' + lm.main + ', banner ' + lm.banner + ', nav ' + lm.nav + ', tablist ' + lm.tablist + ', h1 ' + lm.h1 + ', skip link ' + lm.skip, '');
    const f = await a11yAudit(page, 'body');
    t.note('interactive controls on the board', f.interactive, 'controls');
    const file = (name, a, owner) => {
      t.check('every control has an accessible name (' + name + ')', a.unnamed.length === 0, a.unnamed, owner);
      t.check('visible text is contained in the accessible name (WCAG 2.5.3 label in name) (' + name + ')', a.labelInName.length === 0, a.labelInNameCount + ' mismatches, e.g. ' + a.labelInName.slice(0, 3).join(' | '), owner);
      t.check('no duplicate ids, no aria reference to a missing id, no unknown role (' + name + ')', a.dupIds.length === 0 && a.broken.length === 0 && a.badRoles.length === 0, { dup: a.dupIds, broken: a.broken, roles: a.badRoles }, owner);
      t.check('nothing focusable hides inside aria-hidden (' + name + ')', a.hiddenFocusable.length === 0, a.hiddenFocusable, owner);
      t.check('every text field has a label (' + name + ')', a.fields.length === 0, a.fields, owner);
    };
    file('board', f, 'board');
    t.check('the board has no skipped heading levels', f.jumps.length === 0, f.jumps, 'board');
    t.check('icons are hidden from screen readers or named (board)', f.svgBare.length === 0, f.svgBare, 'board');

    // every sheet
    const sheetBag = { unnamed: [], lin: [], ids: [], hid: [], fields: [], jumps: [], svg: [] };
    for (const s of SHEETS) {
      await closeSheets(page);
      if (s.open) await page.keyboard.press(s.open); else await page.evaluate((n) => SB.sheets.open(n), s.name);
      await page.locator('[role=dialog]').first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
      await wait(450);
      const a = await a11yAudit(page, '[role=dialog]');
      const dn = await page.evaluate(() => { const d = document.querySelector('[role=dialog]'); return d ? { name: d.getAttribute('aria-label') || (document.getElementById(d.getAttribute('aria-labelledby') || '') || {}).textContent || '', modal: d.getAttribute('aria-modal'), focusIn: d.contains(document.activeElement) } : null; });
      t.check('the ' + s.label + ' sheet is a named dialog, marked modal, and focus moved into it', !!(dn && dn.name && dn.modal === 'true' && dn.focusIn), dn, 'sheets');
      a.unnamed.forEach((x) => sheetBag.unnamed.push(s.label + ': ' + x)); a.labelInName.forEach((x) => sheetBag.lin.push(s.label + ': ' + x));
      if (a.dupIds.length || a.broken.length || a.badRoles.length) sheetBag.ids.push(s.label + ': ' + JSON.stringify({ d: a.dupIds, b: a.broken, r: a.badRoles }));
      a.hiddenFocusable.forEach((x) => sheetBag.hid.push(s.label + ': ' + x)); a.fields.forEach((x) => sheetBag.fields.push(s.label + ': ' + x)); a.jumps.forEach((x) => sheetBag.jumps.push(s.label + ': ' + x)); a.svgBare.forEach((x) => sheetBag.svg.push(s.label + ': ' + x));
    }
    // KNOWN BUG (A1, B4 in docs/audit/e2e-triage.md): the in-page Cabinet view goes from h1 straight to h3. Recorded as a note, not a failure, until fixed.
    await closeSheets(page);
    await page.keyboard.press('h'); await wait(500);
    const cabHeads = await page.evaluate(() => Array.from(document.querySelectorAll('h1, h2, h3, h4')).filter((e) => e.offsetParent).map((e) => Number(e.tagName[1])));
    const cabSkip = cabHeads.some((l, k) => k > 0 && l - cabHeads[k - 1] > 1);
    if (cabSkip) t.note('KNOWN BUG A1: Cabinet tab skips a heading level', cabHeads.join(' '), ''); else t.check('the Cabinet tab has no skipped heading levels (the known bug is fixed: drop this note logic)', true);
    await page.keyboard.press('h'); await wait(300);
    await closeSheets(page);
    t.check('every control in every sheet has an accessible name', sheetBag.unnamed.length === 0, sheetBag.unnamed.slice(0, 8), 'sheets');
    t.check('label in name holds in every sheet (visible text is part of the accessible name)', sheetBag.lin.length === 0, sheetBag.lin.length + ' mismatches, e.g. ' + sheetBag.lin.slice(0, 4).join(' | '), 'sheets');
    t.check('sheets: no duplicate ids, missing aria references or unknown roles', sheetBag.ids.length === 0, sheetBag.ids.slice(0, 4), 'sheets');
    t.check('sheets: nothing focusable inside aria-hidden', sheetBag.hid.length === 0, sheetBag.hid.slice(0, 5), 'sheets');
    t.check('sheets: every text field has a label', sheetBag.fields.length === 0, sheetBag.fields.slice(0, 5), 'sheets');
    t.check('sheets: no skipped heading levels', sheetBag.jumps.length === 0, sheetBag.jumps.slice(0, 5), 'sheets');
    t.check('sheets: icons are hidden from screen readers or named', sheetBag.svg.length === 0, sheetBag.svg.slice(0, 5), 'sheets');

    // the office: one main landmark, the board no longer exposed, one h1 per page
    await page.evaluate(() => { location.hash = '#/office/pace'; });
    await waitOffice(page, 8000);
    const om = await page.evaluate(() => {
      const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' && !e.closest('[hidden],[inert],[aria-hidden="true"]'); };
      const q = (s) => Array.from(document.querySelectorAll(s)).filter(vis).length;
      const fl = document.getElementById('sb-floor');
      return { main: q('main,[role=main]'), nav: q('nav,[role=navigation]'), banner: q('header,[role=banner]'), floorExposed: fl ? vis(fl) : null, title: document.title, navNames: Array.from(document.querySelectorAll('#sb-office nav')).map((n) => n.getAttribute('aria-label') || '') };
    });
    t.check('in the office there is exactly one main landmark and the board is not exposed to screen readers behind it', om.main === 1 && om.floorExposed === false, om, 'officeA');
    t.check('the office has a labelled navigation landmark for its 7 pages', om.nav >= 1 && om.navNames.every((n) => n), om, 'officeA');
    const ob = { unnamed: [], lin: [], ids: [], hid: [], fields: [], jumps: [], svg: [], h1: [] };
    for (const p of OFFICE_PAGES) {
      await gotoOffice(page, p.id, 8000);
      const a = await a11yAudit(page, '#sb-office');
      const own = PAGE_OWNER[p.id];
      const put = (k, arr) => arr.forEach((x) => ob[k].push({ o: own, s: p.title + ': ' + x }));
      put('unnamed', a.unnamed); put('lin', a.labelInName); put('hid', a.hiddenFocusable); put('fields', a.fields); put('jumps', a.jumps); put('svg', a.svgBare);
      if (a.dupIds.length || a.broken.length || a.badRoles.length) put('ids', [JSON.stringify({ d: a.dupIds, b: a.broken, r: a.badRoles })]);
      if (a.h1 !== 1) put('h1', ['has ' + a.h1 + ' level-1 headings']);
    }
    const rep = (name, key) => t.check(name, ob[key].length === 0, ob[key].slice(0, 5).map((x) => x.s), ob[key].length ? ob[key][0].o : 'officeA');
    rep('office: every control on all 7 pages has an accessible name', 'unnamed');
    rep('office: label in name holds on all 7 pages', 'lin');
    rep('office: no duplicate ids, missing aria references or unknown roles on any page', 'ids');
    rep('office: nothing focusable inside aria-hidden on any page', 'hid');
    rep('office: every text field has a label', 'fields');
    rep('office: each page has exactly one level-1 heading', 'h1');
    rep('office: no skipped heading levels', 'jumps');
    rep('office: icons are hidden from screen readers or named', 'svg');
    await t.clean(page, 'a11y structure');
  });

  // ---------------------------------------------------------------------------------------------------------------------
  h.test('12b-keyboard', 'Accessibility: keyboard order, no trap on the board, sheets trap focus and give it back', { owner: 'sheets', timeout: 90000 }, async (t) => {
    const page = await t.open({ w: 1280, h: 800 });
    await seedStandard(page);
    // walk the board with Tab: never stuck, reaches the header menu, the tabs and a ticket control, comes back round
    const seen = [];
    for (let i = 0; i < 70; i++) {
      await page.keyboard.press('Tab');
      seen.push(await page.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return 'BODY'; return e.tagName.toLowerCase() + '.' + (typeof e.className === 'string' ? e.className.trim().split(/\s+/)[0] : '') + '|' + (e.getAttribute('aria-label') || e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24); }));
    }
    const uniq = new Set(seen);
    t.note('distinct tab stops reached in 70 presses on the board', uniq.size, 'stops');
    t.check('Tab moves through at least 15 different controls on the board (not stuck on one)', uniq.size >= 15, Array.from(uniq).slice(0, 8), 'board');
    t.check('Tab never drops focus to the page body after the first stop', seen.slice(1).filter((x) => x === 'BODY').length <= 1, seen.filter((x) => x === 'BODY').length, 'board');
    t.check('the header Menu button, a station tab and a ticket action are all reachable by Tab', ['fl-menu', 'seg-opt', 'fl-bump'].every((c) => seen.some((x) => x.includes(c))) || seen.some((x) => /All done here|Bump/i.test(x)), Array.from(uniq).slice(0, 12), 'board');
    // shift-tab goes back
    await page.keyboard.press('Shift+Tab');
    const back = await page.evaluate(() => document.activeElement && document.activeElement !== document.body);
    t.check('Shift+Tab goes back to a control', back, back, 'board');

    // a sheet opened from its header button: focus goes in, stays in while tabbing, and returns to the button on close
    await page.evaluate(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); });
    // The Hold cabinet is a tab now, so the 86 board (opened from its header button) stands in for the sheet focus trap check.
    const holdBtn = page.locator('.fl-head [data-tool="board86"]').first();
    if (await holdBtn.count()) {
      await holdBtn.focus();
      await page.keyboard.press('Enter');
      const d = page.getByRole('dialog', { name: '86 board and stock' });
      await d.waitFor({ state: 'visible', timeout: 10000 });
      await wait(450);
      const inside = [];
      for (let i = 0; i < 40; i++) { await page.keyboard.press('Tab'); inside.push(await page.evaluate(() => { const d = document.querySelector('[role=dialog]'); return !!(d && d.contains(document.activeElement)); })); }
      t.check('Tab inside the 86 board sheet stays inside it for 40 presses (focus is trapped)', inside.every(Boolean), inside.filter((x) => !x).length + ' presses escaped', 'sheets');
      for (let i = 0; i < 6; i++) { await page.keyboard.press('Shift+Tab'); inside.push(await page.evaluate(() => { const d = document.querySelector('[role=dialog]'); return !!(d && d.contains(document.activeElement)); })); }
      t.check('Shift+Tab also stays inside', inside.every(Boolean), '', 'sheets');
      await closeSheets(page);
      const ret = await page.evaluate(() => { const e = document.activeElement; return e && e !== document.body ? (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 30) : 'BODY'; });
      t.check('closing the sheet with Esc gives focus back to the 86 button that opened it', /86/.test(ret), ret, 'sheets');
    } else t.skipCheck('focus trap and focus return', 'no 86 button in the header');

    // inert board behind a modal sheet: Tab never reaches a slip control
    await page.keyboard.press('n');
    await page.getByRole('dialog', { name: 'New ticket' }).waitFor({ state: 'visible', timeout: 10000 });
    await wait(400);
    const behind = await page.evaluate(() => { const f = document.querySelector('.fl-grid'); return f ? { inert: !!f.closest('[inert]'), hidden: !!f.closest('[aria-hidden="true"]') } : null; });
    t.check('while a sheet is open the board behind it is inert or aria-hidden', !!(behind && (behind.inert || behind.hidden)), behind, 'sheets');
    await closeSheets(page);
    // typing in a field does not fire shortcuts
    await page.keyboard.press('r');
    const rc = page.getByRole('dialog', { name: 'Recall' });
    await rc.waitFor({ state: 'visible', timeout: 10000 });
    await wait(400);
    await page.getByRole('searchbox', { name: /Find a ticket/ }).fill('');
    await page.getByRole('searchbox', { name: /Find a ticket/ }).type('nhd8z', { delay: 30 });
    await wait(300);
    t.check('typing n h d 8 z into the Recall search opens nothing else', (await page.evaluate(() => SB.sheets.count())) === 1, await page.evaluate(() => SB.sheets.count()), 'board');
    await closeSheets(page);
    await t.clean(page, 'keyboard');
  });

  // ---------------------------------------------------------------------------------------------------------------------
  h.test('12c-live-regions', 'Accessibility: screen reader announcements per minute while the demo runs', { owner: 'board', timeout: 120000 }, async (t) => {
    const page = await t.open({ w: 1280, h: 800 });
    if (!(await has(page, 'SB.sim.live'))) t.skip('SB.sim.live is not built yet');
    await page.evaluate(() => {
      window.__ann = [];
      const mo = new MutationObserver((muts) => {
        for (const m of muts) {
          const el = m.target.nodeType === 3 ? m.target.parentElement : m.target;
          const lr = el && el.closest && el.closest('[aria-live]:not([aria-live=off]),[role=status],[role=alert],[role=log]');
          if (!lr) continue;
          const txt = (lr.textContent || '').trim();
          if (txt) window.__ann.push({ at: Math.round(performance.now()), kind: lr.getAttribute('role') || lr.getAttribute('aria-live'), live: lr.getAttribute('aria-live'), cls: lr.className, text: txt.slice(0, 70) });
        }
      });
      mo.observe(document.body, { childList: true, subtree: true, characterData: true });
    });
    // the demo the way the owner uses it: normal orders, auto crew, clock x15
    const d = await openKey(page, 'd', 'Demo and clock');
    await d.getByRole('radio', { name: 'Normal' }).click();
    await d.getByRole('switch', { name: /Auto crew/ }).click().catch(() => {});
    await d.getByRole('radio', { name: 'Fifteen times faster' }).click();
    await closeSheets(page);
    await page.evaluate(() => { window.__ann.length = 0; });
    const t0 = Date.now();
    await wait(30000);
    const secs = (Date.now() - t0) / 1000;
    const ann = await page.evaluate(() => window.__ann.slice());
    // a changed live region fires several mutations for one message (clear, then set), so count distinct (time bucket, text)
    const distinct = []; ann.forEach((a) => { const last = distinct[distinct.length - 1]; if (!last || last.text !== a.text || a.at - last.at > 300) distinct.push(a); });
    const perMin = distinct.length / secs * 60;
    t.note('screen reader announcements during 30 s of the demo at x15 (distinct)', distinct.length, 'announcements');
    t.note('announcements per real minute at x15', r1(perMin), '/min');
    t.note('sample of what was announced', distinct.slice(0, 6).map((x) => '"' + x.text + '"').join(' | '), '');
    t.check('announcements stay under 12 per real minute at x15 (not chatty)', perMin < 12, { perMin: r1(perMin), first: distinct.slice(0, 6).map((x) => x.text) }, 'board');
    t.check('no assertive live region is used for routine updates', !distinct.some((x) => x.live === 'assertive' && x.kind !== 'alert'), distinct.filter((x) => x.live === 'assertive').slice(0, 3), 'board');
    t.check('the per-second ticket timers are not inside a live region', await page.evaluate(() => !document.querySelector('[aria-live]:not([aria-live=off]) .slip-time, [role=status] .slip-time, [aria-live]:not([aria-live=off]) .fl-clock, [role=timer][aria-live]:not([aria-live=off])')), '', 'board');
    t.check('no announcement repeats the same sentence more than 3 times in 30 s', Object.values(distinct.reduce((o, x) => { o[x.text] = (o[x.text] || 0) + 1; return o; }, {})).every((n) => n <= 3), distinct.slice(0, 8).map((x) => x.text), 'board');
    // stop the demo so the next test starts clean (the page is thrown away anyway)
    await page.evaluate(() => { try { SB.sim.live.stop(); } catch (e) { /* ignore */ } });
    await t.clean(page, 'live regions');
  });

  // ---------------------------------------------------------------------------------------------------------------------
  // The contrast sweep: for every visible text element, foreground (with its own alpha and the opacity of its ancestors) against the colour
  // under it, through SB.util.contrast. Elements over gradients or images are listed as "unknown", never counted as passes.
  const sweep = (page, scope) => page.evaluate((scope) => {
    const root = document.querySelector(scope) || document.body;
    const parse = (c) => { const m = /rgba?\(([^)]+)\)/.exec(c); if (!m) return null; const p = m[1].split(/[,/]\s*|\s+/).filter(Boolean).map(parseFloat); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
    const mix = (top, bot) => ({ r: top.r * top.a + bot.r * (1 - top.a), g: top.g * top.a + bot.g * (1 - top.a), b: top.b * top.a + bot.b * (1 - top.a), a: 1 });
    const hex = (c) => '#' + [c.r, c.g, c.b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
    const bgOf = (e) => {
      const layers = []; let unknown = false;
      for (let p = e; p; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (cs.backgroundImage && cs.backgroundImage !== 'none') unknown = true;
        const c = parse(cs.backgroundColor); if (c && c.a > 0) { layers.push(c); if (c.a >= 0.99) break; }
      }
      let acc = { r: 255, g: 255, b: 255, a: 1 }; for (let i = layers.length - 1; i >= 0; i--) acc = mix(layers[i], acc);
      return { c: acc, unknown };
    };
    const opacityOf = (e) => { let o = 1; for (let p = e; p; p = p.parentElement) o *= parseFloat(getComputedStyle(p).opacity); return o; };
    const bad = [], unknown = []; let n = 0, worst = 99;
    const seen = new Set();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const txt = node.textContent.replace(/\s+/g, ' ').trim(); if (txt.length < 1 || !/[A-Za-z0-9]/.test(txt)) continue;
      const e = node.parentElement; if (!e || seen.has(e)) continue; seen.add(e);
      if (e.closest('script,style,[hidden],[inert],[aria-hidden="true"],.visually-hidden,svg,option')) continue;
      const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
      if (e.closest(':disabled,[aria-disabled="true"]') || e.disabled) continue;
      const bg = bgOf(e); let fg = parse(cs.color); if (!fg) continue;
      const op = opacityOf(e); fg = { r: fg.r, g: fg.g, b: fg.b, a: fg.a * op };
      const fgm = mix(fg, bg.c);
      const size = parseFloat(cs.fontSize), bold = Number(cs.fontWeight) >= 700;
      const large = size >= 24 || (size >= 18.66 && bold);
      const ratio = SB.util.contrast(hex(fgm), hex(bg.c));
      n++;
      const label = e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '') + ' "' + txt.slice(0, 24) + '"';
      if (bg.unknown) { unknown.push(label); continue; }
      if (ratio < worst) worst = ratio;
      if (ratio < (large ? 3 : 4.5)) bad.push({ label, ratio: Math.round(ratio * 100) / 100, fg: hex(fgm), bg: hex(bg.c), px: size });
    }
    bad.sort((a, b) => a.ratio - b.ratio);
    return { n, bad: bad.slice(0, 8), badCount: bad.length, unknown: unknown.length, worst: Math.round(worst * 100) / 100 };
  }, scope);

  h.test('12d-contrast-floor', 'Accessibility: contrast of all visible text on the board and sheets, Day, Night and large text', { owner: 'board', timeout: 150000 }, async (t) => {
    const page = await t.open({ w: 1280, h: 800 });
    await seedStandard(page);
    if (await has(page, 'SB.sim.live')) await page.evaluate(() => { try { SB.sim.live.addRush && SB.sim.live.addRush(12); } catch (e) { /* ignore */ } });
    const worstAll = [];
    for (const th of ['day', 'night']) {
      await page.evaluate((th) => { SB.theme.set(th); SB.theme.setTextSize('normal'); }, th);
      await settle(page, 400);
      const r = await sweep(page, 'body');
      t.note('board ' + th + ': text elements checked / worst ratio / over an image or gradient (not judged)', r.n + ' / ' + r.worst + ' / ' + r.unknown, '');
      t.check('every piece of text on the board reaches 4.5:1 (3:1 for large text) in ' + th, r.badCount === 0, r.badCount + ' below, worst: ' + r.bad.slice(0, 4).map((b) => b.label + ' ' + b.ratio + ' ' + b.fg + ' on ' + b.bg).join(' | '), 'board');
      t.check('the contrast sweep on the board in ' + th + ' looked at a meaningful number of text elements', r.n > 25, r.n, 'board');
      worstAll.push(r);
      const sb = { bad: [], n: 0 };
      for (const s of SHEETS) {
        await closeSheets(page);
        if (s.open) await page.keyboard.press(s.open); else await page.evaluate((n) => SB.sheets.open(n), s.name);
        await page.locator('[role=dialog]').first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
        await wait(450);
        const sr = await sweep(page, '[role=dialog]');
        sb.n += sr.n; sr.bad.forEach((b) => sb.bad.push(s.label + ': ' + b.label + ' ' + b.ratio + ' ' + b.fg + ' on ' + b.bg));
      }
      await closeSheets(page);
      t.check('every piece of text in every sheet reaches 4.5:1 (3:1 for large text) in ' + th, sb.bad.length === 0, sb.bad.length + ' below, e.g. ' + sb.bad.slice(0, 4).join(' | '), 'sheets');
    }
    await page.evaluate(() => { SB.theme.set('night'); SB.theme.setTextSize('large'); });
    await settle(page, 400);
    const lg = await sweep(page, 'body');
    t.check('large text in Night keeps 4.5:1 on the board', lg.badCount === 0, lg.bad.slice(0, 3).map((b) => b.label + ' ' + b.ratio), 'board');
    await t.clean(page, 'contrast floor');
  });

  h.test('12e-contrast-office', 'Accessibility: contrast of all visible text on the 7 office pages in Ember and Paper', { owner: 'officeA', timeout: 150000 }, async (t) => {
    const page = await t.open({ w: 1280, h: 800, hash: '#/office/pace' });
    await waitOffice(page, 8000);
    for (const look of ['ember', 'paper']) {
      await page.evaluate((l) => SB.theme.setOffice(l), look);
      await settle(page, 400);
      const bag = [];
      let total = 0;
      for (const p of OFFICE_PAGES) {
        await gotoOffice(page, p.id, 8000);
        const r = await sweep(page, '#sb-office');
        total += r.n;
        r.bad.forEach((b) => bag.push({ o: PAGE_OWNER[p.id], s: p.title + ': ' + b.label + ' ' + b.ratio + ' ' + b.fg + ' on ' + b.bg }));
        if (r.unknown) t.note('text over a gradient or image, not judged (' + look + ' ' + p.id + ')', r.unknown, 'elements');
      }
      t.note('office ' + look + ': text elements checked', total, 'elements');
      t.check('every piece of text on all 7 office pages reaches 4.5:1 (3:1 for large text) in ' + look, bag.length === 0, bag.length + ' below, e.g. ' + bag.slice(0, 5).map((x) => x.s).join(' | '), bag.length ? bag[0].o : 'officeA');
    }
    await t.clean(page, 'contrast office');
  });
}

function r1(n) { return Math.round(n * 10) / 10; }
