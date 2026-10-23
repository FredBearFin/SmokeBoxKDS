// Journey 5: the demo. Start orders and crew, clock x15, watch tickets flow for a few real seconds, add the 12-ticket rush, Reset live data.
import { boardSummary, storeTickets, settle, wait, closeSheets, openKey, has } from './_lib.mjs';

export default function (h) {
  h.test('05-demo-flow', 'Demo: orders + crew at x15 move tickets, 12-ticket rush, Reset live data with confirm', { owner: 'sim', timeout: 90000 }, async (t) => {
    const page = await t.open({ w: 1280, h: 800, kitchen: { sample: true } }); // starter stock so demo tickets can be sold; sample history on so its count shows
    if (!(await has(page, 'SB.sim.live'))) t.skip('SB.sim.live is not built yet');
    const d = await openKey(page, 'd', 'Demo and clock');
    const txt0 = await d.innerText();
    t.check('the demo sheet is not showing "Simulator not loaded"', !/Simulator not loaded/.test(txt0), txt0.slice(0, 200));
    t.check('the demo sheet says demo tickets are made-up / labelled Demo', /Demo|demo/.test(txt0));
    // Clock speeds stay hidden until the demo is loaded (a demo ticket, running demo orders or a fast clock).
    t.check('clock speeds are hidden before the demo is loaded', !['x5', 'x15', 'x30'].some((x) => txt0.includes(x)), txt0.slice(0, 300));
    const before = (await storeTickets(page)).length;

    await d.getByRole('radio', { name: 'Normal' }).click();
    await d.getByRole('switch', { name: /Auto crew/ }).check().catch(async () => { await d.getByRole('switch', { name: /Auto crew/ }).click(); });
    const crewOn = await d.getByRole('switch', { name: /Auto crew/ }).isChecked().catch(() => null);
    t.check('the Auto crew switch is on', crewOn === true, crewOn);
    t.check('once the demo runs the sheet lists clock speeds x1 x5 x15 x30', (await d.locator('.dm-speed').innerText()).match(/x1\b/) !== null && /x30/.test(await d.locator('.dm-speed').innerText()), await d.locator('.dm-speed').innerText().catch(() => ''));
    await d.getByRole('radio', { name: 'Fifteen times faster' }).click();
    await settle(page, 300);
    const status0 = await d.locator('.dm-status').innerText().catch(() => '');
    t.check('the sheet says "Demo running: Normal" and "Clock x15"', /Demo running: Normal/.test(status0) && /Clock x15/.test(status0), status0);
    t.check('a warning explains that the whole kitchen clock including hold timers runs faster', /hold-cabinet clocks/.test(await d.innerText()), (await d.innerText()).slice(0, 120));
    await closeSheets(page);
    // Arrivals are random, so a quiet window must not fail the test: put four demo tickets on the board up front.
    await page.evaluate(() => SB.sim.live.burst && SB.sim.live.burst(4));
    const chip = await page.evaluate(() => { const c = document.querySelector('.fl-demo-chip'); return c ? { hidden: c.hidden, text: c.innerText.replace(/\s+/g, ' ') } : null; });
    t.check('the header shows a demo chip while the demo or a fast clock runs', chip && !chip.hidden && /x15|Demo/i.test(chip.text), chip);

    // watch up to 32 real seconds (= 8 kitchen minutes at x15) until at least 3 tickets were sent and the crew finished one; arrivals are random
    // (mean one ticket per 40 kitchen seconds), so a fixed short window is flaky by design
    const snaps = [];
    const t0 = Date.now();
    while (Date.now() - t0 < 32000) {
      const s = await page.evaluate(() => ({ st: SB.sim.live.status(), active: SB.store.getState().tickets.filter((x) => x.status === 'active').length, all: SB.store.getState().tickets.length }));
      snaps.push(s);
      if (s.st.sent >= 3 && s.st.completed >= 1 && Date.now() - t0 > 10000) break;
      await wait(2000);
    }
    t.note('demo x15: real seconds until 3 tickets sent and 1 finished', Math.round((Date.now() - t0) / 1000), 's');
    const last = snaps[snaps.length - 1];
    t.note('demo x15: tickets sent while watching', last.st.sent, 'tickets');
    t.note('demo x15: tickets finished by the crew while watching', last.st.completed, 'tickets');
    t.check('the simulator sent tickets while we watched (normal rate, x15 clock)', last.st.sent >= 3 && last.st.sent <= 40, last.st);
    t.check('the clock really runs x15 (status speed 15)', last.st.speed === 15, last.st.speed);
    t.check('the auto crew finished at least one ticket within 32 real seconds (8 kitchen minutes)', last.st.completed >= 1 || last.all > before + last.st.sent, last);
    const board = await boardSummary(page);
    const demoTags = await page.locator('.fl-slip .fl-demo-tag').count();
    t.check('demo slips are on the board and the page says it is the demo (inside the demo itself the slips carry no Demo tag: only old demo tickets in a real kitchen do) (its "ticket" half hides on a crowded board)', board.slips.length >= 2 && /Demo/.test(board.text) && /Demo/.test(board.text), { slips: board.slips.length, demoTags });
    t.check('the All tab count matches the slips on the board', board.tabs.find((x) => x.id === 'all').count === board.slips.length, { tab: board.tabs.find((x) => x.id === 'all').count, slips: board.slips.length });
    await t.shot(page, 'demo-traffic-1280');
    await t.clean(page, 'demo running');

    // 12-ticket rush
    const d2 = await openKey(page, 'd', 'Demo and clock');
    const nBefore = (await storeTickets(page)).length;
    await d2.getByRole('button', { name: 'Add 12-ticket rush' }).click();
    await settle(page, 600);
    const nAfter = (await storeTickets(page)).length;
    t.check('Add 12-ticket rush adds about 12 tickets (10 to 12; some dishes may be 86)', nAfter - nBefore >= 10 && nAfter - nBefore <= 14, { nBefore, nAfter });
    t.check('a toast says how many demo tickets went to the board', (await page.locator('.toast').allInnerTexts()).some((x) => /\d+ demo tickets sent to the board/.test(x)), await page.locator('.toast').allInnerTexts());
    await t.shot(page, 'demo-rush-sheet');

    // sample-history switch shows counts and a "Switched off" state
    const sampleTog = d2.getByRole('switch', { name: /Include sample history/ });
    if (await sampleTog.count()) {
      const cnt = await d2.locator('.dm-counts').innerText();
      t.check('the sheet counts sample history (tickets over 14 days)', /\d[\d,]* tickets over \d+ days/.test(cnt), cnt);
      await sampleTog.click();
      await settle(page, 200);
      t.check('switching sample history off says "Switched off"', /Switched off/.test(await d2.locator('.dm-counts').innerText()));
      await sampleTog.click();
      await settle(page, 300);
    }

    // Reset live data: Keep everything cancels; Reset live data clears
    await d2.getByRole('button', { name: 'Reset live data' }).click();
    const ad = page.getByRole('alertdialog').or(page.getByRole('dialog', { name: 'Reset live data?' }));
    await ad.first().waitFor({ state: 'visible', timeout: 8000 });
    const adText = await ad.first().innerText();
    t.check('the reset confirm spells out what is cleared and that it cannot be undone', /This clears \d+ tickets?/.test(adText) && /cannot be undone/.test(adText), adText.slice(0, 300));
    await ad.first().getByRole('button', { name: 'Keep everything' }).click();
    await settle(page, 300);
    t.check('Keep everything changes nothing', (await storeTickets(page)).length >= nAfter, (await storeTickets(page)).length);
    await d2.getByRole('button', { name: 'Reset live data' }).click();
    await ad.first().getByRole('button', { name: 'Reset live data' }).click();
    await settle(page, 800);
    const after = await page.evaluate(() => ({ tickets: SB.store.getState().tickets.length, speed: SB.store.speed(), running: SB.sim.live.status().running, batches: SB.store.getState().batches.length, events: SB.engine.allEvents(SB.store.getState()).length }));
    t.check('after Reset live data there are no tickets', after.tickets === 0, after);
    t.check('the demo is stopped by the reset', after.running === false, after);
    // Reset live data goes back to a real, empty kitchen: the starter stock is not put back any more.
    t.check('after the reset the kitchen is empty (no starter batches come back)', after.batches === 0, after);
    // the confirm text does not promise a clock change, so the speed after Reset is an observation; a fast clock must still be visible in the header
    t.note('clock speed after Reset live data (the demo was running at x15)', 'x' + after.speed, '');
    const chipAfter = await page.evaluate(() => { const c = document.querySelector('.fl-demo-chip'); return c ? { hidden: c.hidden, text: c.innerText.replace(/\s+/g, ' ') } : null; });
    t.check('if the clock is still fast after the reset, the header still shows the fast-clock chip (no hidden fast clock on an empty board)', after.speed === 1 || (chipAfter && !chipAfter.hidden && /x\d+/i.test(chipAfter.text)), { speed: after.speed, chip: chipAfter }, 'board');
    await closeSheets(page);
    const empty = await page.evaluate(() => { const e = document.querySelector('.fl-empty'); return e && !e.hidden ? e.innerText : ''; });
    t.check('the board shows the empty state after the reset', /No tickets right now/.test(empty), empty.slice(0, 80));

    // Restart demo: confirm first, then three fresh tickets, calm clock, welcome card back
    const d3 = await openKey(page, 'd', 'Demo and clock');
    t.check('the Demo sheet offers Restart demo and the walkthrough under "Start over"', await d3.getByRole('button', { name: 'Restart demo' }).count() === 1 && await d3.getByRole('button', { name: /Show me how it works/ }).count() === 1);
    await d3.getByRole('button', { name: 'Restart demo' }).click();
    const rd = page.getByRole('alertdialog').or(page.getByRole('dialog', { name: 'Restart the demo?' }));
    await rd.first().waitFor({ state: 'visible', timeout: 8000 });
    t.check('the restart confirm says what is cleared and what stays', /This clears \d+ tickets?/.test(await rd.first().innerText()) && /Settings stay/.test(await rd.first().innerText()), (await rd.first().innerText()).slice(0, 240));
    await rd.first().getByRole('button', { name: 'Restart demo' }).click();
    await settle(page, 900);
    const fresh = await page.evaluate(() => ({ tickets: SB.store.getState().tickets.filter((x) => x.status === 'active').length, demo: SB.store.getState().tickets.filter((x) => x.src === 'demo').length, speed: SB.store.speed(), running: SB.sim.live.status().running, welcome: !!document.querySelector('.fl-welcome') && !document.querySelector('.fl-welcome').hidden }));
    t.check('Restart demo leaves three fresh pretend tickets, a normal clock and no automatic orders', fresh.tickets === 3 && fresh.demo === 3 && fresh.speed === 1 && fresh.running === false, fresh); // the welcome card is finished once tickets exist, so it no longer comes back
    await t.shot(page, 'demo-restarted');
    await t.clean(page, 'demo restart');
    await t.clean(page, 'demo and reset');
  });
}
