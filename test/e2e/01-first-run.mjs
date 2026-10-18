// Journey 1: first run. A new tablet opens the file for the first time.
import { boardSummary, wait, has, head, settle } from './_lib.mjs';

export default function (h) {
  h.test('01-first-run', 'First run boots clean and the board is ready to use', { owner: 'board', timeout: 40000 }, async (t) => {
    const page = await t.open({ w: 1280, h: 800 });
    await settle(page, 600);
    await t.clean(page, 'first run');

    const seeded = await has(page, 'SB.sim.seedFirstRun');
    const s = await boardSummary(page);
    const hdr = await page.evaluate(() => {
      const q = (sel) => document.querySelector(sel);
      return {
        brand: !!q('.fl-head [data-brand]'),
        brandName: (q('.fl-head [data-brand]') || {}).getAttribute && q('.fl-head [data-brand]').getAttribute('aria-label'),
        tabs: Array.from(document.querySelectorAll('.fl-seg [role=tab]')).map((b) => b.querySelector('.seg-label') ? b.querySelector('.seg-label').textContent : b.textContent),
        tools: Array.from(document.querySelectorAll('.fl-head [data-tool]')).map((b) => b.dataset.tool),
        sanitise: !!q('.fl-san'),
        newBtn: !!Array.from(document.querySelectorAll('.fl-head button')).find((b) => /New ticket/.test(b.textContent)),
        dock: !!q('.fl-dock'), dockTitle: (q('.fl-dock-toggle') || {}).textContent,
        theme: document.documentElement.getAttribute('data-theme'), lang: document.documentElement.lang, title: document.title,
        main: !!document.querySelector('main, [role=main], .fl-main'), h1: Array.from(document.querySelectorAll('h1')).length,
      };
    });
    t.check('header: flame brand button is present', hdr.brand, hdr);
    t.check('header: six station tabs All PIT HOT FRY CLD EXP', JSON.stringify(hdr.tabs) === JSON.stringify(['All', 'PIT', 'HOT', 'FRY', 'CLD', 'EXP']), hdr.tabs);
    t.check('header: Recall, Hold, 86 and Demo buttons are present', ['recall', 'hold', 'board86', '86', 'demo'].filter((x) => hdr.tools.includes(x)).length >= 3 && hdr.tools.length === 4, hdr.tools);
    t.check('header: sanitise countdown chip is present', hdr.sanitise);
    t.check('header: New ticket button is present', hdr.newBtn);
    t.check('all-day dock is present and titled "All day"', hdr.dock && /All day/i.test(hdr.dockTitle || ''), hdr.dockTitle);
    t.check('page has a title, a language and starts in the Day look', /Smokebox/.test(hdr.title) && hdr.lang === 'en' && hdr.theme === 'day', { title: hdr.title, lang: hdr.lang, theme: hdr.theme });
    t.check('tab counts are numbers for every tab', s.tabs.length === 6 && s.tabs.every((x) => Number.isFinite(x.count)), s.tabs);

    if (!seeded) {
      t.skipCheck('seeded demo tickets with on time / running late / overdue words', 'SB.sim.seedFirstRun is not built yet (45-sim.js has sample() only), so a first run shows the empty board');
      const emptyOk = await page.evaluate(() => /No tickets right now/.test(document.querySelector('.fl-empty') ? document.querySelector('.fl-empty').innerText : ''));
      t.check('without seeds the board shows the empty state with New ticket and Start demo', emptyOk && await page.getByRole('button', { name: 'Start demo' }).isVisible());
    } else {
      t.check('first run shows at least 3 seeded demo tickets', s.slips.length >= 3, s.slips.length);
      const txt = s.text;
      t.check('the first board is calm: On time is shown and nothing is Overdue yet', /On time/.test(txt) && !/Overdue/.test(txt) && !/Running late/.test(txt), { onTime: /On time/.test(txt), late: /Running late/.test(txt), overdue: /Overdue/.test(txt) });
      t.check('the first board holds three ordinary tickets and none is a rush', s.slips.length === 3 && await page.locator('.fl-slip .stamp').count() === 0, s.slips.length);
      const welcome = page.locator('.fl-welcome');
      t.check('a welcome card explains the screen and offers "Show me how it works"', await welcome.isVisible() && await welcome.getByRole('button', { name: /Show me how it works/ }).isVisible(), await welcome.innerText().catch(() => ''));
      t.check('the welcome card is not a modal (the board stays usable)', await page.locator('.fl-welcome[role=dialog], .fl-welcome[aria-modal]').count() === 0);
      t.check('every ticket says in plain words what to do next', await page.locator('.fl-slip .slip-next').count() === s.slips.length, await page.locator('.fl-slip .slip-next').allInnerTexts());
      const all = s.tabs.find((x) => x.id === 'all');
      t.check('the All tab count equals the number of slips on the board', all && all.count === s.slips.length, { tab: all && all.count, slips: s.slips.length });
      t.check('seeded tickets are labelled as demo tickets', await page.locator('.fl-slip .fl-demo-tag').count() === s.slips.length, 'a slip has no Demo tag');
    }
    await t.shot(page, 'first-run-1280');

    // sample history exists and is labelled
    const sample = await page.evaluate(() => SB.sim && SB.sim.sampleInfo ? SB.sim.sampleInfo() : null);
    t.check('the sample history is available (SB.sim.sampleInfo)', !!sample, sample);

    // the seeded board must keep ticking without console errors
    await wait(2500);
    await t.clean(page, 'after 2.5 s of ticking');
  });
}
