// Journey 3: station views and keyboard shortcuts.
import { seedStandard, boardSummary, storeTickets, ZONES, ZONE_CODE, settle, wait, dialog } from './_lib.mjs';

export default function (h) {
  h.test('03a-station-views', 'Station views PIT/HOT/FRY/CLD/EXP show the right items and the counts match', { owner: 'board', timeout: 50000 }, async (t) => {
    const page = await t.open({ w: 1280, h: 800 });
    await seedStandard(page);
    // the expected sets are computed here from raw store tickets, not from the app's own views
    const tickets = (await storeTickets(page)).filter((x) => x.status === 'active');
    const expect = {};
    for (const z of ZONES.filter((z) => z !== 'expo')) {
      expect[z] = tickets.filter((x) => x.items.some((i) => i.zone === z && i.status !== 'done')).map((x) => x.customer).sort();
    }
    expect.expo = tickets.map((x) => x.customer).sort();
    expect.all = expect.expo;
    const order = ['all', 'pit', 'sides', 'fry', 'cold', 'expo'];
    for (let k = 0; k < order.length; k++) {
      const z = order[k];
      await page.locator('.fl-seg [role=tab]').nth(k).click();
      await settle(page, 350);
      const s = await boardSummary(page);
      const who = s.slips.map((x) => x.customer).sort();
      const tab = s.tabs.find((x) => x.id === z);
      t.check(z + ': tab is selected and the hash says ' + (z === 'all' ? '#/' : '#/s/' + z), tab && tab.selected && (z === 'all' ? /^#\/?$/.test(s.hash) || s.hash === '' : s.hash === '#/s/' + z), { sel: tab, hash: s.hash });
      t.check(z + ': shows exactly the tickets that have work there', JSON.stringify(who) === JSON.stringify(expect[z]), { shown: who, expected: expect[z] });
      t.check(z + ': tab count equals the number of slips shown (' + who.length + ')', tab && tab.count === s.slips.length, { tab: tab && tab.count, slips: s.slips.length });
      if (z !== 'all' && z !== 'expo') {
        // every row on a station view belongs to that station
        const rows = await page.evaluate(() => Array.from(document.querySelectorAll('.fl-grid .fl-row')).map((r) => ({ menu: r.dataset.menu, zone: SB.config.menuById[r.dataset.menu] && SB.config.menuById[r.dataset.menu].zone })));
        t.check(z + ': every item row belongs to that station', rows.length > 0 && rows.every((r) => r.zone === z), rows.filter((r) => r.zone !== z));
        const stationButtons = await page.locator('.fl-grid .fl-slip button', { hasText: 'All done here' }).count();
        t.check(z + ': every slip has an All done here button', stationButtons === s.slips.length, { buttons: stationButtons, slips: s.slips.length });
      }
      if (z === 'expo') {
        const withChips = await page.evaluate(() => Array.from(document.querySelectorAll('.fl-grid .fl-slip')).every((s) => s.querySelector('.chip-zone, [data-zone]')));
        t.check('expo: slips show whole tickets with a station chip on each item', withChips);
        const bumpBtns = await page.locator('.fl-grid .fl-slip button', { hasText: 'Bump' }).count();
        t.check('expo: every slip offers Bump', bumpBtns === s.slips.length, bumpBtns);
      }
    }
    // the choice persists across reload
    await page.locator('.fl-seg [role=tab]').nth(3).click();
    await settle(page, 300);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.SB && SB.booted === true, null, { timeout: 8000 });
    await settle(page, 400);
    const after = await boardSummary(page);
    t.check('the chosen station (FRY) is still selected after a reload', after.tabs.find((x) => x.id === 'fry').selected, after.hash);
    await t.shot(page, 'stations-fry');
    await t.clean(page, 'station views');
  });

  h.test('03b-keyboard', 'Keyboard shortcuts N R H 8 D 1..6 Z Esc work and stay quiet while typing', { owner: 'board', timeout: 60000 }, async (t) => {
    const page = await t.open({ w: 1280, h: 800 });
    await seedStandard(page);
    const top = () => page.evaluate(() => SB.sheets.top && SB.sheets.top() ? (SB.sheets.top().name || SB.sheets.top().el.getAttribute('aria-label')) : null);
    const sheets = [['n', 'order'], ['r', 'recall'], ['h', 'hold'], ['8', 'board86'], ['d', 'demo'], ['?', 'help']];
    for (const [key, name] of sheets) {
      await page.keyboard.press(key);
      await settle(page, 450);
      const open = await page.evaluate((n) => SB.sheets.isOpen(n), name);
      t.check('key ' + key.toUpperCase() + ' opens the ' + name + ' sheet', open, await top());
      await page.keyboard.press('Escape');
      await settle(page, 450);
      t.check('Esc closes the ' + name + ' sheet', !(await page.evaluate((n) => SB.sheets.isOpen(n), name)));
    }
    // station keys 1..6
    for (let k = 1; k <= 6; k++) {
      await page.keyboard.press(String(k));
      await settle(page, 200);
      const s = await boardSummary(page);
      const want = ['all', 'pit', 'sides', 'fry', 'cold', 'expo'][k - 1];
      t.check('key ' + k + ' selects the ' + want + ' view', s.tabs.find((x) => x.id === want).selected, s.tabs.filter((x) => x.selected));
    }
    await page.keyboard.press('1');
    await settle(page, 200);

    // Z undoes the last undoable action
    const walk = page.locator('.fl-slip', { has: page.locator('.slip-who', { hasText: 'Walk-up' }) });
    await walk.getByRole('button', { name: /Smoked sausage link/ }).click();
    await settle(page, 300);
    const statusOf = async () => (await storeTickets(page)).find((x) => x.customer === 'Walk-up').items.find((i) => i.menuId === 'sausage').status;
    const before = await statusOf();
    await page.keyboard.press('z');
    await settle(page, 300);
    const afterZ = await statusOf();
    t.check('Z undoes the last action (sausage tap)', before !== afterZ, { before, afterZ });

    // typing in a field must not fire shortcuts: open the order sheet, type into the search box
    await page.keyboard.press('n');
    const dlg = dialog(page, 'New ticket');
    await dlg.waitFor({ state: 'visible', timeout: 8000 });
    const search = dlg.getByRole('textbox', { name: 'Search the menu' });
    await search.click();
    await page.keyboard.type('nrh8dz1?', { delay: 15 });
    await settle(page, 250);
    const val = await search.inputValue();
    const openNames = await page.evaluate(() => ['order', 'recall', 'hold', 'board86', 'demo', 'help'].filter((n) => SB.sheets.isOpen(n)));
    t.check('typing "nrh8dz1?" in the search box lands in the box', val === 'nrh8dz1?', val);
    t.check('typing in a field opens no other sheet', JSON.stringify(openNames) === JSON.stringify(['order']), openNames);
    const sel = (await boardSummary(page)).tabs.find((x) => x.selected).id;
    t.check('typing a digit in a field does not change the station', sel === 'all', sel);
    // the first Esc clears the search text (the field keeps focus), the second closes the sheet
    await page.keyboard.press('Escape');
    await settle(page, 250);
    t.check('Esc inside a filled search box clears the text first and keeps the sheet open', (await search.inputValue()) === '' && await page.evaluate(() => SB.sheets.isOpen('order')), await search.inputValue());
    await page.keyboard.press('Escape');
    await settle(page, 400);
    t.check('a second Esc closes the order sheet', !(await page.evaluate(() => SB.sheets.isOpen('order'))));

    // shortcut keys must be inert behind an open sheet (the board is inert)
    await page.keyboard.press('h');
    await settle(page, 400);
    await page.keyboard.press('3');
    await page.keyboard.press('n');
    await settle(page, 300);
    const stillHold = await page.evaluate(() => SB.sheets.isOpen('hold') && !SB.sheets.isOpen('order'));
    const sel2 = (await boardSummary(page)).tabs.find((x) => x.selected).id;
    t.check('with the hold sheet open, keys N and 3 do nothing', stillHold && sel2 === 'all', { stillHold, sel2 });
    await page.keyboard.press('Escape');
    await settle(page, 300);

    // Esc clears the all-day highlight
    const chip = page.locator('.fl-dchip').first();
    if (await chip.count()) {
      await chip.click();
      await settle(page, 200);
      const pressed = await chip.getAttribute('aria-pressed');
      await page.keyboard.press('Escape');
      await settle(page, 200);
      const pressed2 = await chip.getAttribute('aria-pressed');
      t.check('tapping an all-day chip highlights it and Esc clears it', pressed === 'true' && pressed2 === 'false', { pressed, pressed2 });
    } else t.skipCheck('all-day highlight and Esc', 'no all-day chips on the board');

    // modifier keys must not trigger shortcuts (Ctrl+R reload etc. stay with the browser)
    await page.keyboard.press('Control+h');
    await settle(page, 250);
    t.check('Ctrl+H does not open the hold sheet', !(await page.evaluate(() => SB.sheets.isOpen('hold'))));
    await t.clean(page, 'keyboard');
  });
}
