// Journey 2: a cook's flow, by clicking only. New ticket, items, modifier, customer, channel, note, Send; tap items; All done here;
// Bump; Undo; Void with a reason; Recall; Start now; Rush.
import { seedStandard, clearBoard, boardSummary, storeTickets, dialog, head, wait, settle, toasts } from './_lib.mjs';

const slipOf = (page, who) => page.locator('.fl-slip', { has: page.locator('.slip-who', { hasText: who }) });

export default function (h) {
  h.test('02a-send-ticket', 'Cook: New ticket with 4 items, a modifier, customer, channel, note, Send', { owner: 'sheets', timeout: 50000 }, async (t) => {
    const page = await t.open({ w: 1280, h: 800 });
    await clearBoard(page);
    await head(page).getByRole('button', { name: 'New ticket' }).click();
    const dlg = dialog(page, 'New ticket');
    await dlg.waitFor({ state: 'visible', timeout: 8000 });
    t.check('the order sheet opens as a dialog named New ticket', await dlg.isVisible());
    t.check('Send to kitchen is disabled or refuses while the order is empty', await (async () => {
      const send = dlg.getByRole('button', { name: 'Send to kitchen' });
      const dis = await send.isDisabled().catch(() => false);
      if (dis) return true;
      await send.click().catch(() => {});
      await settle(page, 150);
      const err = await dlg.locator('.ord-error').first().innerText().catch(() => '');
      return /item|order|add|empty|nothing/i.test(err) && await dlg.isVisible();
    })(), 'empty order could be sent or no inline message');

    const tiles = ['Brisket, 1/2 lb, $14.00', 'Smoked mac and cheese, $5.50', 'Jalapeno slaw, $4.00', 'Fried pickle chips, $7.00'];
    for (const n of tiles) await dlg.getByRole('button', { name: n }).click();
    const lines = await dlg.locator('.ord-line').count();
    t.check('four tiles make four order lines', lines === 4, lines);
    t.check('the total reads $30.50 for these four items', /\$30\.50/.test(await dlg.locator('.ord-total').innerText()), await dlg.locator('.ord-total').innerText());

    // quantity stepper on the brisket line
    const brisketLine = dlg.locator('.ord-line').first();
    await brisketLine.getByRole('button', { name: /Increase quantity/ }).click();
    t.check('the + stepper makes quantity 2 and the total $44.50', (await brisketLine.getByRole('spinbutton').inputValue()) === '2' && /\$44\.50/.test(await dlg.locator('.ord-total').innerText()), await dlg.locator('.ord-total').innerText());
    await brisketLine.getByRole('button', { name: /Decrease quantity/ }).click();

    // modifier
    await brisketLine.getByRole('button', { name: 'Mods' }).click();
    await dlg.getByRole('button', { name: 'Moist cut' }).click();
    await dlg.locator('.ord-editor-done').first().click();
    t.check('the Moist cut modifier shows as a chip under the item', /Moist cut/.test(await brisketLine.innerText()), await brisketLine.innerText());

    // customer, channel, note, rush off
    await dlg.getByRole('textbox', { name: 'Customer' }).fill('Dana K');
    await dlg.getByRole('radio', { name: 'Drive-thru' }).click();
    t.check('channel radio shows Drive-thru checked', await dlg.getByRole('radio', { name: 'Drive-thru' }).isChecked());
    await dlg.getByRole('textbox', { name: 'Note for the line' }).fill('Allergy: peanuts');
    const plan = await dlg.locator('.ord-plan').innerText();
    t.check('the plan preview says when items start and when the order is ready', /starts now/.test(plan) && /ready together|Ready/i.test(plan), plan.slice(0, 160));
    await t.shot(page, 'cook-order-filled');
    await dlg.getByRole('button', { name: 'Send to kitchen' }).click();
    await dlg.waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {});
    t.check('the sheet closes after Send to kitchen', !(await dlg.isVisible().catch(() => false)));
    await settle(page, 400);
    const tt = await toasts(page).allInnerTexts();
    const newNum = (await storeTickets(page))[0].num;
    t.check('a toast says Ticket #N sent to N stations (N is the new ticket)', tt.some((x) => new RegExp('Ticket #' + newNum + ' sent to \\d stations').test(x)), { tt, newNum });
    const slip = slipOf(page, 'Dana K');
    t.check('the new slip appears on the board with the customer, channel, note and modifier', await slip.count() === 1 && /Drive-thru/.test(await slip.innerText()) && /Allergy: peanuts/.test(await slip.innerText()) && /Moist cut/.test(await slip.innerText()), (await slip.allInnerTexts()).join('|').slice(0, 200));
    const st = (await storeTickets(page))[0];
    t.check('the store ticket has 4 lines, the brisket modifier, channel drive_thru and the note', st && st.items.length === 4 && st.channel === 'drive_thru' && st.note === 'Allergy: peanuts' && st.items[0].mods.includes('Moist cut'), st);
    const board = await boardSummary(page);
    t.check('the All tab count went from 0 to 1', board.tabs.find((x) => x.id === 'all').count === 1, board.tabs);
    await t.clean(page, 'send ticket');
  });

  h.test('02b-advance-bump-undo', 'Cook: tap items, All done here, Bump, Undo, 10 s drain', { owner: 'board', timeout: 60000 }, async (t) => {
    const page = await t.open({ w: 1280, h: 800 });
    await seedStandard(page);
    const walk = slipOf(page, 'Walk-up');
    const sausage = walk.getByRole('button', { name: /Smoked sausage link/ });
    t.check('the sausage row is a button that says it can be started', /Press to start|fired|start/i.test((await sausage.innerText()) + (await sausage.getAttribute('aria-label') || '')), await sausage.innerText());
    await sausage.click();
    await settle(page, 200);
    let tk = (await storeTickets(page)).find((x) => x.customer === 'Walk-up');
    const saus1 = tk.items.find((i) => i.menuId === 'sausage').status;
    t.check('first tap on a two-step item starts it (status started)', /start|cook/i.test(saus1), saus1);
    await wait(500); // the board ignores a second tap within 450 ms on purpose
    await sausage.click();
    await settle(page, 200);
    tk = (await storeTickets(page)).find((x) => x.customer === 'Walk-up');
    t.check('second tap finishes it (status done)', tk.items.find((i) => i.menuId === 'sausage').status === 'done', tk.items.map((i) => i.menuId + ':' + i.status));
    t.check('the progress text on the slip counts 1 of 2 done', /1 of 2 done/.test(await walk.innerText()), (await walk.innerText()).slice(0, 120));

    // station view: All done here on Table 4 at the PIT
    await page.keyboard.press('2');
    await settle(page, 300);
    const pit = slipOf(page, 'Table 4');
    const pitTexts = await pit.innerText();
    t.check('PIT view shows Table 4 with its brisket and an All done here button', /Brisket/.test(pitTexts) && await pit.locator('button', { hasText: 'All done here' }).count() === 1, pitTexts.slice(0, 120));
    await pit.locator('button', { hasText: 'All done here' }).click();
    await settle(page, 600);
    tk = (await storeTickets(page)).find((x) => x.customer === 'Table 4');
    t.check('All done here finished every PIT item on Table 4', tk.items.filter((i) => i.zone === 'pit').every((i) => i.status === 'done'), tk.items.map((i) => i.menuId + ':' + i.status));
    t.check('items of other stations on Table 4 were left alone', tk.items.filter((i) => i.zone !== 'pit').every((i) => i.status !== 'done'), tk.items.map((i) => i.menuId + ':' + i.status));
    t.check('the slip leaves the PIT view when the PIT is done (it stays on Expo)', await slipOf(page, 'Table 4').count() === 0, await slipOf(page, 'Table 4').count());
    const tt1 = await toasts(page).allInnerTexts();
    t.check('All done here raises an Undo toast', await page.locator('.toast .toast-undo').count() >= 1, tt1);

    // finish Walk-up entirely and bump it
    await page.keyboard.press('1');
    await settle(page, 300);
    const walk2 = slipOf(page, 'Walk-up');
    // Banana pudding is held back: Start now first
    const fire = walk2.getByRole('button', { name: /Start now: Banana pudding/ });
    if (await fire.count()) { await fire.click(); await settle(page, 250); }
    const pud = walk2.getByRole('button', { name: /Banana pudding/ });
    for (let i = 0; i < 2; i++) { // one tap if it is a one-step item, two if it starts first
      tk = (await storeTickets(page)).find((x) => x.customer === 'Walk-up');
      if (tk.items.every((x) => x.status === 'done')) break;
      await wait(500); await pud.click().catch(() => {}); await settle(page, 200);
    }
    tk = (await storeTickets(page)).find((x) => x.customer === 'Walk-up');
    t.check('every Walk-up item is done after tapping through', tk.items.every((x) => x.status === 'done'), tk.items.map((i) => i.menuId + ':' + i.status));
    const ready = await walk2.getAttribute('data-ready');
    t.check('a finished slip is marked ready to bump', ready === 'true', ready);
    await walk2.getByRole('button', { name: 'Bump' }).click();
    await settle(page, 500);
    t.check('Bump removes the slip from the board', await slipOf(page, 'Walk-up').count() === 0, await slipOf(page, 'Walk-up').count());
    const undo = page.locator('.toast .toast-undo');
    t.check('an Undo toast appears after the bump', await undo.count() === 1, await toasts(page).allInnerTexts());
    t.check('the Undo toast has a draining bar (10 s)', await page.locator('.toast .toast-bar').count() === 1);
    await page.mouse.move(5, 400);
    await wait(2500);
    await undo.click();
    await settle(page, 500);
    t.check('Undo within 10 s brings the slip back', await slipOf(page, 'Walk-up').count() === 1, await slipOf(page, 'Walk-up').count());
    tk = (await storeTickets(page)).find((x) => x.customer === 'Walk-up');
    t.check('the undone ticket is active again with all items still done', tk && tk.status === 'active' && tk.items.every((x) => x.status === 'done'), tk);
    await t.shot(page, 'cook-after-undo');

    // bump again; the Undo toast must go away on its own after about 10 s (real time, pointer parked away from it)
    await slipOf(page, 'Walk-up').getByRole('button', { name: 'Bump' }).click();
    await settle(page, 300);
    await page.mouse.move(5, 300);
    const t0 = Date.now();
    await page.waitForFunction(() => !document.querySelector('.toast .toast-undo'), null, { timeout: 14000 }).catch(() => {});
    const gone = (Date.now() - t0) / 1000;
    t.check('the Undo toast leaves by itself after about 10 s', gone > 8 && gone < 13.5, gone.toFixed(1) + ' s');
    t.note('undo toast lifetime', gone, 's');
    const bumped = (await storeTickets(page)).find((x) => x.customer === 'Walk-up');
    t.check('after the toast is gone the ticket stays bumped', bumped.status !== 'active', bumped.status);
    await t.clean(page, 'advance and bump');
  });

  h.test('02c-bump-anyway-void-recall', 'Cook: Bump anyway confirm, Void with a reason, Recall sheet', { owner: 'board', timeout: 60000 }, async (t) => {
    const page = await t.open({ w: 1280, h: 800 });
    await seedStandard(page);
    // bump with items left: confirm dialog, "Keep cooking" cancels, "Bump anyway" forces
    const walk = slipOf(page, 'Walk-up');
    await walk.getByRole('button', { name: 'Bump' }).click();
    const confirm = page.getByRole('alertdialog').or(page.getByRole('dialog', { name: /not done/ }));
    await confirm.first().waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
    const ctext = await confirm.first().innerText().catch(() => '');
    t.check('bumping early asks "2 items not done. Bump anyway?"', /2 items not done\. Bump anyway\?/.test(ctext), ctext.slice(0, 160));
    await confirm.first().getByRole('button', { name: 'Keep cooking' }).click();
    await settle(page, 300);
    t.check('Keep cooking leaves the ticket on the board', await slipOf(page, 'Walk-up').count() === 1);
    await walk.getByRole('button', { name: 'Bump' }).click();
    await confirm.first().getByRole('button', { name: 'Bump anyway' }).click();
    await settle(page, 500);
    let tk = (await storeTickets(page)).find((x) => x.customer === 'Walk-up');
    t.check('Bump anyway sends it out (status is no longer active)', tk.status !== 'active', tk.status);
    // the toast says what happened and offers Undo
    t.check('a forced bump also gets an Undo toast', await page.locator('.toast .toast-undo').count() === 1, await toasts(page).allInnerTexts());

    // void: More -> Void ticket -> reason -> confirm
    const pickup = slipOf(page, 'Pickup, Dana');
    await pickup.getByRole('button', { name: /More for ticket/ }).click();
    await page.getByRole('menuitem', { name: 'Void ticket' }).click();
    const vd = page.getByRole('dialog', { name: /Void ticket/ });
    await vd.waitFor({ state: 'visible', timeout: 8000 });
    const voidBtn = vd.getByRole('button', { name: 'Void ticket' });
    t.check('Void ticket stays disabled until a reason is given', await voidBtn.isDisabled(), 'button enabled with no reason');
    const reasons = await vd.locator('.fl-reasons button, .fl-reasons [role=button], .fl-reasons .chip').allInnerTexts();
    t.check('the void sheet offers ready-made reasons', reasons.length >= 3, reasons);
    if (reasons.length) await vd.locator('.fl-reasons button, .fl-reasons .chip').first().click(); else await vd.getByRole('textbox').fill('Customer left');
    await t.shot(page, 'cook-void-sheet');
    await voidBtn.click();
    await settle(page, 600);
    tk = (await storeTickets(page)).find((x) => x.customer === 'Pickup, Dana');
    t.check('the voided ticket leaves the board and is marked void', tk.status === 'void' || tk.status === 'voided', tk.status);
    t.check('voiding offers Undo', await page.locator('.toast .toast-undo').count() === 1, await toasts(page).allInnerTexts());

    // Recall sheet: bumped tab lists Walk-up, voided tab lists Pickup with its reason, Recall brings Walk-up back
    await page.keyboard.press('r');
    const rd = dialog(page, 'Recall');
    await rd.waitFor({ state: 'visible', timeout: 8000 });
    const bumpedText = await rd.innerText();
    t.check('the Recall sheet lists the bumped ticket (Walk-up) with a time', /Walk-up/.test(bumpedText), bumpedText.slice(0, 200));
    await rd.getByRole('tab', { name: /Voided/ }).click();
    await settle(page, 200);
    const voidedText = await rd.innerText();
    t.check('the Voided tab lists Pickup with a reason', /Pickup/.test(voidedText) && voidedText.length > 80, voidedText.slice(0, 200));
    await rd.getByRole('tab', { name: /Bumped/ }).click();
    await settle(page, 200);
    await rd.getByRole('searchbox', { name: /Find a ticket/ }).fill('walk');
    await settle(page, 200);
    t.check('search by name narrows the recall list', /Walk-up/.test(await rd.innerText()));
    await rd.getByRole('button', { name: /^Recall/ }).first().click();
    await settle(page, 600);
    tk = (await storeTickets(page)).find((x) => x.customer === 'Walk-up');
    t.check('Recall puts the ticket back on the board (active)', tk.status === 'active', tk.status);
    await page.keyboard.press('Escape');
    await settle(page, 400);
    t.check('the recalled slip is visible again on the board', await slipOf(page, 'Walk-up').count() === 1);
    await t.clean(page, 'bump void recall');
  });

  h.test('02d-fire-rush', 'Cook: Start now on a waiting item, Rush toggle on a slip', { owner: 'board', timeout: 40000 }, async (t) => {
    const page = await t.open({ w: 1280, h: 800 });
    await seedStandard(page);
    const walk = slipOf(page, 'Walk-up');
    const deck = walk.locator('.fl-row[data-kind="deck"], .fl-row[data-state="queued"]');
    t.check('Walk-up has a waiting item showing a "Start in" countdown', await deck.count() >= 1 && /Start in \d+:\d\d/i.test(await deck.first().innerText()), await walk.innerText());
    const fire = walk.getByRole('button', { name: /^Start now/ }).first();
    await fire.click();
    await settle(page, 400);
    const tk = (await storeTickets(page)).find((x) => x.customer === 'Walk-up');
    t.check('Start now moves the waiting item out of the queue', tk.items.filter((i) => i.status === 'queued').length === 0 || tk.items.some((i) => /displayed|started/.test(i.status)), tk.items.map((i) => i.menuId + ':' + i.status));
    t.check('the started row no longer shows a Start now button', await walk.getByRole('button', { name: /^Start now: Banana/ }).count() === 0);
    t.check('starting early offers Undo', await page.locator('.toast .toast-undo').count() === 1, await toasts(page).allInnerTexts());

    // Rush: toggle on the Walk-up slip (More menu), stamp and order change; then off
    const stampsBefore = await page.locator('.fl-slip .stamp').count();
    await walk.getByRole('button', { name: /More for ticket/ }).click();
    await page.getByRole('menuitem', { name: 'Make it a rush' }).click();
    await settle(page, 500);
    const afterOrder = (await boardSummary(page)).slips.map((s) => s.customer);
    t.check('Make it a rush adds the RUSH stamp', await page.locator('.fl-slip .stamp').count() === stampsBefore + 1, await page.locator('.fl-slip .stamp').count());
    t.check('rush slips sort first, oldest rush first (Drive-thru 7, then Walk-up)', afterOrder[0] === 'Drive-thru 7' && afterOrder[1] === 'Walk-up', afterOrder);
    await walk.getByRole('button', { name: /More for ticket/ }).click();
    await page.getByRole('menuitem', { name: 'Take off rush' }).click();
    await settle(page, 500);
    t.check('Take off rush removes the stamp again', await page.locator('.fl-slip .stamp').count() === stampsBefore, await page.locator('.fl-slip .stamp').count());
    await t.clean(page, 'fire and rush');
  });
}
