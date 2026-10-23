// Journey 4: hold cabinet (temperature logs, thermal batch, below-135 wording, safety line) and the 86 board.
import { dialog, head, settle, wait, closeSheets, openKey } from './_lib.mjs';

// The hold cabinet is the Cabinet tab on the board now (an in-page region, not a sheet).
const openHold = async (page) => { await page.locator('.fl-seg').getByRole('tab', { name: /Cabinet/ }).click(); const d = page.locator('.fl-cabinet'); await d.waitFor({ state: 'visible', timeout: 5000 }); await settle(page, 250); return d; };
const open86 = async (page) => { await head(page).getByRole('button', { name: /86 board/ }).click(); const d = dialog(page, '86 board and stock'); await d.waitFor({ state: 'visible', timeout: 8000 }); await settle(page, 250);
  // The channel sync block is a collapsed details element now; open it so its chips can be read.
  await d.evaluate((el) => { const x = el.querySelector('details.bd-sync'); if (x) x.open = true; }); await settle(page, 100); return d; };
const num = (s) => Number(String(s).replace(/[^0-9.\-]/g, ''));

export default function (h) {
  h.test('04a-hold-cabinet', 'Hold cabinet: log a temperature, thermal brisket batch yield, below 135 wording, safety line', { owner: 'sheets', timeout: 60000 }, async (t) => {
    const page = await t.open({ w: 1280, h: 800, kitchen: true });
    const safety = await page.evaluate(() => SB.config.safetyLine);
    let d = await openHold(page);
    const body0 = await d.innerText();
    t.check('the hold cabinet shows the food-safety line (SB.config.safetyLine)', body0.replace(/\s+/g, ' ').includes(safety.replace(/\s+/g, ' ')), { safety, shown: body0.slice(0, 200) });
    t.check('the hold cabinet lists 10 starter batches and says all are holding fine', /10 batches in the cabinet/.test(body0) && /All are (in range|holding fine)/.test(body0), body0.slice(0, 260));

    // log a normal temperature reading on Brisket batch 1
    const card1 = d.getByRole('article', { name: /Brisket batch 1/ });
    await card1.getByRole('button', { name: 'Log temp' }).click();
    const inc = card1.getByRole('button', { name: 'Increase temperature in degrees fahrenheit by 5' });
    await inc.click();
    const spin = card1.getByRole('spinbutton', { name: 'Temperature in degrees Fahrenheit' });
    t.check('the +5 button moves 155 to 160', (await spin.inputValue()) === '160', await spin.inputValue());
    await card1.getByRole('button', { name: 'Save reading' }).click();
    await settle(page, 400);
    t.check('the card now shows Last reading 160 °F, just now', /160 °F, just now/.test(await card1.innerText()), (await card1.innerText()).slice(0, 220));
    const logged = await page.evaluate(() => { const b = SB.store.getState().batches.find((x) => /Brisket batch 1/.test(x.label || x.name || '')); return b ? { temps: (b.temps || b.readings || []).length, last: (b.temps || b.readings || []).slice(-1)[0] } : null; });
    t.check('the reading is stored on the batch', !!logged && logged.temps >= 1, logged);

    // a typed number the thermometer could never read must be refused or clamped, never NaN
    await card1.getByRole('button', { name: 'Log temp' }).click();
    const spin2 = card1.getByRole('spinbutton', { name: 'Temperature in degrees Fahrenheit' });
    await spin2.fill('99999');
    await spin2.blur();
    const clamped = await spin2.inputValue();
    t.check('an absurd reading (99999) is clamped to a sane range', /^\d+(\.\d+)?$/.test(clamped) && Number(clamped) < 1000, clamped);
    await spin2.fill('abc').catch(() => {});
    const textVal = await spin2.inputValue().catch(() => '');
    t.check('letters in the temperature box never produce NaN', !/NaN/.test(textVal), textVal);
    await card1.getByRole('button', { name: 'Cancel' }).click();

    // New batch: thermal brisket yield numbers
    await d.getByRole('tab', { name: 'New batch' }).click();
    await settle(page, 250);
    const exp = d.getByRole('region', { name: 'Expected result' });
    const e1 = await exp.innerText();
    t.check('the new-batch form shows expected yield, cooked weight and cost per cooked kg', /Expected yield\s*\n?\s*\d+(\.\d+)?%/.test(e1) && /Cooked weight\s*\n?\s*\d+(\.\d+)? kg/.test(e1) && /This model says [\d.]+ kg at \$\d+(\.\d+)? per kg/.test(e1), e1.slice(0, 300));
    const yieldPct = num((/Expected yield\s*\n?\s*([\d.]+)%/.exec(e1) || [])[1]);
    const cooked = num((/Cooked weight\s*\n?\s*([\d.]+) kg/.exec(e1) || [])[1]);
    const rawKg = num(await d.getByRole('spinbutton', { name: /Raw weight/ }).inputValue());
    t.check('cooked weight equals raw weight times the yield (' + rawKg + ' kg x ' + yieldPct + '% = ' + cooked + ' kg)', Math.abs(rawKg * yieldPct / 100 - cooked) < 0.02, { rawKg, yieldPct, cooked });
    const costKg = num((/This model says [\d.]+ kg at \$([\d.]+) per kg/.exec(e1) || [])[1]);
    const rawCost = num((/Raw cost of \$([\d.]+) per kg/.exec(e1) || [])[1]);
    t.check('cost per cooked kg equals raw cost per kg divided by the yield', rawCost > 0 && Math.abs(rawCost / (yieldPct / 100) - costKg) < 0.05, { rawCost, yieldPct, costKg });
    t.check('the form compares with the flat 50% rule', /flat 50% rule/.test(e1), e1.slice(-300));
    t.check('starter numbers say "starter"', /starter/i.test(e1), e1.slice(-200));
    // a heavier raw weight raises the cooked weight
    await d.getByRole('button', { name: 'Increase raw weight in kilograms by 1' }).click();
    await settle(page, 200);
    const e2 = await exp.innerText();
    const cooked2 = num((/Cooked weight\s*\n?\s*([\d.]+) kg/.exec(e2) || [])[1]);
    t.check('adding 1 kg raw increases the expected cooked weight', cooked2 > cooked, { cooked, cooked2 });
    // a longer rest changes the yield (thermal model reacts to the hold)
    await d.getByRole('button', { name: 'Increase cook endpoint in degrees celsius' }).click();
    await settle(page, 200);
    const e3 = await exp.innerText();
    const yield3 = num((/Expected yield\s*\n?\s*([\d.]+)%/.exec(e3) || [])[1]);
    t.check('a hotter cook endpoint lowers the expected yield', yield3 < yieldPct, { yieldPct, yield3 });
    await t.shot(page, 'hold-new-batch');
    await d.getByRole('button', { name: 'Put in hold cabinet' }).click();
    await settle(page, 600);
    const body2 = await d.innerText();
    t.check('after Put in hold cabinet the cabinet counts 11 batches and lists "Brisket batch 2"', /11 batches in the cabinet/.test(body2) && /Brisket batch 2/.test(body2), body2.slice(0, 200));

    // a below-135 reading: wording, then Reheat
    const card2 = d.getByRole('article', { name: /Brisket batch 2/ });
    await card2.getByRole('button', { name: 'Log temp' }).click();
    for (let i = 0; i < 6; i++) await card2.getByRole('button', { name: 'Decrease temperature in degrees fahrenheit by 5' }).click();
    const warn = await card2.getByRole('status').allInnerTexts();
    t.check('before saving, the form warns that 120 °F is below 135 °F and the batch stops being served', warn.some((x) => /Below 135 °F/.test(x) && /stops being served|not being served/.test(x)), warn);
    await card2.getByRole('button', { name: 'Save reading' }).click();
    await settle(page, 500);
    const low = await card2.innerText();
    t.check('the card says Reheat now with the 165 °F instruction', /Reheat now/.test(low) && /Reheat to 165 °F/.test(low), low.slice(0, 400));
    t.check('the card says it is not being served and the menu items are 86', /Not being served/.test(low) && /86/.test(low), low.slice(-300));
    t.check('the card offers Reheat and Discard', await card2.getByRole('button', { name: 'Reheat' }).count() === 1 && await card2.getByRole('button', { name: 'More for this batch' }).count() === 1); // Discard now sits behind More
    const chipText = await page.evaluate(() => { const b = document.querySelector('.fl-seg [data-id="cabinet"]'); return b ? b.innerText.replace(/\s+/g, ' ') + ' | ' + (b.querySelector('.seg-dot') ? b.querySelector('.seg-dot').textContent : '') : ''; });
    t.check('the Cabinet tab shows how many batches need attention', /\b1\b|\b2\b/.test(chipText), chipText);
    await t.shot(page, 'hold-below-135');

    await card2.getByRole('button', { name: 'Reheat' }).click();
    await settle(page, 300);
    const reheatSpin = card2.getByRole('spinbutton', { name: /Temperature|Reheat/i });
    t.check('Reheat opens a reading form that starts at 165 °F or more', await reheatSpin.count() >= 1 && Number(await reheatSpin.first().inputValue()) >= 165, await reheatSpin.count() ? await reheatSpin.first().inputValue() : 'no spinbutton');
    await card2.getByRole('button', { name: 'Log reheat' }).click();
    await settle(page, 500);
    const afterReheat = await card2.innerText().catch(() => '');
    t.check('Log reheat puts the batch back in service ("Holding fine", no more Reheat now)', /Holding fine|In range/.test(afterReheat) && !/Reheat now/.test(afterReheat), afterReheat.slice(0, 300));
    t.check('after the reheat the header no longer flags the Hold button', !(await page.evaluate(() => { const n = document.querySelector('.fl-head [data-tool="hold"] .fl-tool-n'); return n && !n.hidden && Number(n.textContent) > 0; })), 'attention count still showing');

    // discard asks for a reason first; the confirm button stays off until one is picked
    const pork = d.getByRole('article', { name: /Pulled pork batch 1/ });
    await pork.getByRole('button', { name: 'More for this batch' }).click();
    await page.getByRole('menuitem', { name: /Discard/ }).click();
    const dd = page.getByRole('dialog', { name: /Discard Pulled pork batch 1/ });
    await dd.waitFor({ state: 'visible', timeout: 8000 });
    t.check('Discard batch is disabled until a reason is picked', await dd.getByRole('button', { name: 'Discard batch' }).isDisabled());
    t.check('the discard dialog lists the menu items that go 86', /go 86/.test(await dd.innerText()), (await dd.innerText()).slice(0, 300));
    await dd.getByRole('radio', { name: 'Quality' }).click();
    await dd.getByRole('button', { name: 'Discard batch' }).click();
    await settle(page, 500);
    t.check('after the discard the cabinet lists 10 batches (the pork pan is gone) and an Undo toast shows', /10 batches in the cabinet/.test(await d.innerText()) && await page.locator('.toast .toast-undo').count() === 1, (await d.innerText()).slice(0, 120));
    await page.locator('.toast .toast-undo').click();
    await settle(page, 500);
    t.check('Undo brings the discarded pan back', /Pulled pork batch 1/.test(await d.innerText()) && /11 batches in the cabinet/.test(await d.innerText()), (await d.innerText()).slice(0, 120));

    // cooling: a confirm that spells out the consequence, then the stage meter
    await d.getByRole('article', { name: /Pulled pork batch 1/ }).getByRole('button', { name: 'More for this batch' }).click(); // Start cooling sits behind More
    await page.getByRole('menuitem', { name: /Start cooling/ }).click();
    const cd = page.getByRole('dialog', { name: /Start cooling Pulled pork batch 1/ });
    await cd.waitFor({ state: 'visible', timeout: 8000 });
    const cdText = await cd.innerText();
    t.check('Start cooling explains the 135 to 70 °F in 2 hours, then to 41 °F in 4 more hours', /135 °F to 70 °F within 2 hours/.test(cdText) && /41 °F within 4 more hours/.test(cdText), cdText.slice(0, 260));
    t.check('the cooling dialog does not end its list with a double period (sand..)', !/\.\.(?!\.)/.test(cdText.replace(/\.\.\./g, '')), cdText.match(/[^.]{0,30}\.\.[^.]/));
    await cd.getByRole('button', { name: 'Start cooling' }).click();
    await settle(page, 500);
    const cooling = await d.getByRole('article', { name: /Pulled pork batch 1/ }).innerText();
    t.check('the pork card now shows a cooling stage (word "cool")', /cool/i.test(cooling) && !/Holding fine/.test(cooling), cooling.slice(0, 260));
    await t.clean(page, 'hold cabinet');
  });

  h.test('04b-lockout-86', 'A batch under 135 F for 2 hours is discarded and its menu items go 86 (safety hold)', { owner: 'sheets', timeout: 60000 }, async (t) => {
    const page = await t.open({ w: 1280, h: 800, kitchen: true });
    // The only brisket pan drops to 120 F. Then the clock runs ahead (a bench shortcut: x1000 for 8 s is about 2 h 13 min of kitchen time).
    let d = await openHold(page);
    const card = d.getByRole('article', { name: /Brisket batch 1/ });
    await card.getByRole('button', { name: 'Log temp' }).click();
    for (let i = 0; i < 7; i++) await card.getByRole('button', { name: 'Decrease temperature in degrees fahrenheit by 5' }).click();
    await card.getByRole('button', { name: 'Save reading' }).click();
    await settle(page, 500);
    await page.keyboard.press('Escape');
    await settle(page, 400);
    // immediately: brisket tiles are blocked in the order sheet with the word 86 and a reason
    await page.keyboard.press('n');
    const od = dialog(page, 'New ticket');
    await od.waitFor({ state: 'visible', timeout: 8000 });
    const tile = od.getByRole('button', { name: /^Brisket, 1\/2 lb/ });
    const label = await tile.getAttribute('aria-label');
    t.check('with the only brisket pan below 135 °F the brisket tile says 86 and cannot be ordered', /86/.test(label || '') && (await tile.isDisabled() || (await tile.getAttribute('aria-disabled')) === 'true'), label);
    const tileText = await tile.innerText();
    t.check('the tile spells out the reason in words (safety hold)', /safety/i.test(tileText + label), tileText);
    await t.shot(page, 'order-86-safety');
    await page.keyboard.press('Escape');
    await settle(page, 400);
    // clock shortcut (bench only): x1000 for ~6 s is about 1 h 40 min of kitchen time, a second burst later passes the 2 h limit.
    // Poll the toasts meanwhile: whatever the app says about a pan being thrown out must be visible to the cook.
    const said = new Set();
    const poll = async (ms) => { const end = Date.now() + ms; while (Date.now() < end) { for (const x of await page.locator('.toast .toast-msg').allInnerTexts().catch(() => [])) said.add(x); await wait(250); } };
    await page.evaluate(() => SB.store.setSpeed(1000));
    await poll(8200);
    await page.evaluate(() => SB.store.setSpeed(1));
    await settle(page, 600);
    const sayList = Array.from(said);
    const batchState = await page.evaluate(() => { const b = SB.store.getState().batches.find((x) => /Brisket batch 1/.test(x.label || '')); return b ? { status: b.status, discardReason: b.discardReason, remainingG: b.remainingG, wasteG: b.wasteG } : null; });
    t.check('after 2 hours below 135 °F the pan is at the discard stage (discard, reason temp)', batchState && batchState.status === 'discard' && batchState.discardReason === 'temp', batchState);
    t.check('the cook is TOLD when a pan is thrown out by the clock (a toast mentioning the batch and discard)', sayList.some((x) => /Brisket batch 1/.test(x) && /discard|thrown|throw (it )?out/i.test(x)), sayList);
    d = await openHold(page);
    const dtext = await d.innerText();
    const stillThere = await d.getByRole('article', { name: /Brisket batch 1/ }).count() > 0;
    t.check('the pan is either shown with a clear Discard instruction or gone from the cabinet (not silently half there)', !stillThere || /Discard/.test(await d.getByRole('article', { name: /Brisket batch 1/ }).innerText()), dtext.slice(0, 200));
    await t.shot(page, 'hold-lockout');
    await page.keyboard.press('Escape');
    await settle(page, 400);
    // with no brisket left the order screen must keep brisket items blocked and say why
    await page.keyboard.press('n');
    await od.waitFor({ state: 'visible', timeout: 8000 });
    const tile2 = od.getByRole('button', { name: /^Brisket, 1\/2 lb/ });
    const label2 = (await tile2.getAttribute('aria-label')) || '';
    t.check('brisket tiles stay blocked with the word 86 after the pan is gone', /86/.test(label2), label2);
    await t.shot(page, 'order-86-after-lockout');
    await t.clean(page, 'lockout');
  });

  h.test('04c-board-86', '86 board: manual 86 hides the item from the order screen, Back on restores, sync strip is labelled Simulated', { owner: 'sheets', timeout: 60000 }, async (t) => {
    const page = await t.open({ w: 1280, h: 800, kitchen: true });
    let d = await open86(page);
    const txt = await d.innerText();
    t.check('the sync strip says "Simulated: no live POS connected"', /(Simulated|Demo only|Practice only): no live POS connected/.test(txt), txt.slice(0, 160));
    t.check('four channel chips are listed (Counter POS, Online ordering, Drive-thru board, Delivery apps)', ['Counter POS', 'Online ordering', 'Drive-thru board', 'Delivery apps'].every((x) => txt.includes(x)), txt.slice(0, 400));
    await d.getByRole('button', { name: '86 it: Brisket, 1/4 lb' }).click();
    await settle(page, 400);
    const afterTxt = await d.innerText();
    t.check('the row says "86 manual" and "Marked 86 by hand"', /86 manual/.test(afterTxt) && /Marked 86 by hand/.test(afterTxt), afterTxt.slice(180, 600));
    t.check('the Off the menu count becomes 1', /Off the menu\s*\n?\s*1/.test(afterTxt), afterTxt.slice(380, 520));
    t.check('the channels show Syncing right after the 86', /Syncing/.test(afterTxt), afterTxt.slice(0, 300));
    t.check('a toast with Undo confirms the 86', await page.locator('.toast .toast-undo').count() === 1, await page.locator('.toast').allInnerTexts());
    // let the simulated channels catch up (bench shortcut: clock x1000 for 1.5 s is about 25 minutes of kitchen time)
    await page.evaluate(() => SB.store.setSpeed(1000));
    await wait(1500);
    await page.evaluate(() => SB.store.setSpeed(1));
    await settle(page, 500);
    const synced = await d.innerText();
    t.check('after the sync window the chips say "synced N s after 86"', /[Ss]ynced \d+\s*s? after/.test(synced) || /synced/i.test(synced), synced.slice(0, 500));
    t.check('the strip still says Simulated after syncing', /Simulated|Demo only|Practice only|no live POS/.test(synced));
    await t.shot(page, 'board86-manual');
    const od = await openKey(page, 'n', 'New ticket');
    const tile = od.getByRole('button', { name: /^Brisket, 1\/4 lb/ });
    const label = await tile.getAttribute('aria-label');
    const tileText = await tile.innerText();
    t.check('the order screen shows the word 86 on the Brisket 1/4 lb tile', /86/.test(tileText) && /86/.test(label || ''), { label, tileText });
    t.check('the 86 tile cannot be added to an order', (await tile.isDisabled()) || (await tile.getAttribute('aria-disabled')) === 'true', label);
    await tile.click({ force: true }).catch(() => {});
    await settle(page, 200);
    t.check('clicking the 86 tile adds nothing to the order', await od.locator('.ord-line').count() === 0, await od.locator('.ord-line').count());
    // the combo that contains it should also be flagged or refuse
    await closeSheets(page);

    // restock: Back on
    d = await open86(page);
    await d.getByRole('button', { name: /Back on the menu/ }).first().click();
    await settle(page, 400);
    const back = await d.innerText();
    t.check('Back on returns the item (Off the menu 0)', /Off the menu\s*\n?\s*0/.test(back), back.slice(380, 520));
    // restock an ingredient
    const rs = d.getByRole('button', { name: /^Restock / }).first();
    await rs.click();
    await settle(page, 300);
    const rtoasts = await page.locator('.toast').allInnerTexts();
    t.check('Restock answers with a toast', rtoasts.length >= 1, rtoasts);
    await openKey(page, 'n', 'New ticket');
    t.check('after Back on the tile can be ordered again', !(await od.getByRole('button', { name: /^Brisket, 1\/4 lb/ }).isDisabled()));
    await t.clean(page, '86 board');
  });
}
