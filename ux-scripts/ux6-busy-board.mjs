// UX test 5: a busy 1920x1080 board with a mix of fresh, warning and overdue tickets, for the distance simulation.
import { withPage } from '../tools/pw.mjs';
const out = './out/';
for (const [w, h, tag] of [[1920, 1080, 'tv'], [1280, 800, 'tab']]) {
  await withPage({ w, h, touch: true }, async (page) => {
    await page.waitForTimeout(800);
    await page.evaluate(() => { SB.floor.setWelcome(false); SB.sim.live.crew(false); SB.sim.live.burst(5); });
    await page.waitForTimeout(400);
    // age those tickets about 14 minutes, then add fresh ones
    await page.evaluate(() => SB.store.setSpeed(1000));
    for (let i = 0; i < 60; i++) { const m = await page.evaluate(() => SB.store.clock().now); if (i === 0) globalThis.__s = m; if (m - globalThis.__s > 14 * 60e3) break; await page.waitForTimeout(50); }
    await page.evaluate(() => SB.store.setSpeed(1));
    await page.evaluate(() => SB.sim.live.burst(5));
    await page.waitForTimeout(1200);
    const lv = await page.evaluate(() => [...document.querySelectorAll('.slip')].map((s) => s.dataset.level + (s.dataset.rush === 'true' ? '+rush' : '')).join(' '));
    console.log(tag, 'levels:', lv);
    await page.screenshot({ path: `${out}e-busy-${tag}.png` });
  });
}
