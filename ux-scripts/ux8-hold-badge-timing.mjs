// UX test 7: when does the Hold badge first light, and what does the Hold sheet say about the first alert?
import { withPage } from '../tools/pw.mjs';
await withPage({ w: 1280, h: 800 }, async (page) => {
  await page.waitForTimeout(800);
  await page.evaluate(() => { SB.floor.setWelcome(false); SB.sim.live.crew(false); });
  const t0 = await page.evaluate(() => SB.store.now());
  const badge = () => page.evaluate(() => { const n = document.querySelector('.fl-tool[data-tool="hold"] .fl-tool-n'); return n && !n.hidden ? n.textContent : '(none)'; });
  await page.evaluate(() => SB.store.setSpeed(1000));
  let lit = null;
  for (let i = 0; i < 400; i++) {
    const [el, b] = [await page.evaluate((t0) => Math.round((SB.store.now() - t0) / 60e3), t0), await badge()];
    if (b !== '(none)' && lit === null) { lit = el; await page.evaluate(() => SB.store.setSpeed(0.1)); break; }
    await page.waitForTimeout(40);
  }
  console.log('Hold badge first lit at about', lit, 'minutes in');
  await page.click('.fl-tool[data-tool="hold"]'); await page.waitForTimeout(700);
  const msg = await page.evaluate(() => [...document.querySelectorAll('.sheet')].pop().innerText.replace(/\s+/g, ' ').slice(0, 420));
  console.log('Hold sheet says:', msg);
});
