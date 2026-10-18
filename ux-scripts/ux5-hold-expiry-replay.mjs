// UX test 4: replay the hold-limit failure. Idle kitchen, fast-forward the clock, screenshot the main screen at each stage.
import { withPage } from '../tools/pw.mjs';
const out = './out/';
await withPage({ w: 1280, h: 800, touch: true }, async (page, logs) => {
  await page.waitForTimeout(800);
  await page.evaluate(() => { SB.floor.setWelcome(false); SB.sim.live.crew(false); SB.sim.live.stop && SB.sim.live.stop(); });
  const t0 = await page.evaluate(() => SB.store.now());
  const probe = async (label) => {
    const r = await page.evaluate((t0) => {
      const s = SB.store.getState(), now = SB.store.now();
      const hb = document.querySelector('.fl-tool[data-tool="hold"]'), b86 = document.querySelector('.fl-tool[data-tool="board86"]');
      const badge = (b) => { const n = b && b.querySelector('.fl-tool-n'); return n && !n.hidden ? n.textContent + '/' + (n.dataset.tone || '') : '(none)'; };
      const batches = s.batches.filter((b) => b.status !== 'discard');
      const worst = batches.map((b) => ({ ing: b.ing, st: b.status, left: Math.round((b.enteredAt + 4 * 3600e3 - now) / 60e3) }));
      const live = s.batches.filter((b) => b.status !== 'discard' && b.remainingG > 0).length;
      return { elapsedMin: Math.round((now - t0) / 60e3), holdBadge: badge(hb), badge86: badge(b86), holdAria: hb && hb.getAttribute('aria-label'), live, statuses: [...new Set(batches.map((b) => b.status))].join(','), minLeft: Math.min(...worst.map((w) => w.left)), offMenu: SB.engine.availability ? undefined : undefined };
    }, t0);
    console.log(label.padEnd(28), JSON.stringify(r));
    await page.screenshot({ path: `${out}d-${label.replace(/\W+/g, '_')}.png` });
    return r;
  };
  await probe('T+0');
  // fast-forward in steps
  const goTo = async (targetMin) => {
    await page.evaluate(() => SB.store.setSpeed(1000));
    for (let i = 0; i < 200; i++) {
      const el = await page.evaluate((t0) => (SB.store.now() - t0) / 60e3, t0);
      if (el >= targetMin) break;
      await page.waitForTimeout(100);
    }
    await page.evaluate(() => SB.store.setSpeed(0.1));
    await page.waitForTimeout(600);
  };
  await goTo(200); await probe('T+3h20');
  await goTo(235); await probe('T+3h55 five min before');
  await goTo(242); await probe('T+4h02 just past the limit');
  // what does the 86 board look like then
  await page.click('.fl-tool[data-tool="board86"]'); await page.waitForTimeout(600);
  await page.screenshot({ path: out + 'd-after-86board.png' });
  const off = await page.evaluate(() => (document.querySelector('.sheet') || {}).innerText.match(/Off the menu\s*\d+/)?.[0]);
  console.log('86 board says:', off);
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  await page.click('.fl-tool[data-tool="hold"]'); await page.waitForTimeout(700);
  await page.screenshot({ path: out + 'd-after-hold.png' });
  console.log('errors', logs.errors.length, logs.pageErrors.length);
});
