// UX test 3a: show the button labels on one ticket after each tap, so the tap counter can match them.
import { withPage } from '../tools/pw.mjs';
await withPage({ w: 1280, h: 800, touch: true }, async (page) => {
  await page.waitForTimeout(800);
  await page.evaluate(() => { SB.floor.setWelcome(false); SB.sim.live.crew(false); SB.sim.live.burst(4); });
  await page.waitForTimeout(800);
  const dump = () => page.evaluate(() => { const s = document.querySelector('[data-ticket="t_1"]'); const t = SB.store.getState().tickets.find((x) => x.id === 't_1'); return { items: t.items.map((i) => i.name + ':' + i.status), btns: [...s.querySelectorAll('button')].map((b) => (b.getAttribute('aria-label') || b.innerText).trim().replace(/\s+/g, ' ').slice(0, 70)) }; });
  console.log(JSON.stringify(await dump()));
  await page.click('[data-ticket="t_1"] button[aria-label^="Start now: Brisket"]'); await page.waitForTimeout(300);
  console.log(JSON.stringify(await dump()));
  await page.click('[data-ticket="t_1"] button[aria-label^="Start now: Brisket"]').catch(() => {});
  const b = await page.$$('[data-ticket="t_1"] button'); for (const x of b) { const l = await x.getAttribute('aria-label'); if (l && /Brisket/.test(l) && !/Start now/.test(l)) { await x.click(); break; } }
  await page.waitForTimeout(300);
  console.log(JSON.stringify(await dump()));
});
