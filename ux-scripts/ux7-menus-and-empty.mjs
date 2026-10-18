// UX test 6: the "..." menu, the New batch form, and the empty-kitchen screen.
import { withPage } from '../tools/pw.mjs';
const out = './out/';
await withPage({ w: 1280, h: 800, touch: true }, async (page, logs) => {
  await page.waitForTimeout(800);
  await page.evaluate(() => { SB.floor.setWelcome(false); SB.sim.live.crew(false); SB.sim.live.burst(3); });
  await page.waitForTimeout(600);
  // the "..." menu
  await page.click('[data-ticket="t_1"] button[aria-label^="More for ticket"]'); await page.waitForTimeout(400);
  const menu = await page.evaluate(() => [...document.querySelectorAll('[role=menu] [role=menuitem], .menu button, .popover button, .sb-menu button')].map((b) => b.innerText.trim().replace(/\s+/g, ' ')).filter(Boolean));
  console.log('"..." menu items:', JSON.stringify(menu));
  await page.screenshot({ path: out + 'g-more-menu.png' });
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  // New batch form
  let taps = 0; const tap = async (s) => { await page.click(s); taps++; await page.waitForTimeout(250); };
  await tap('.fl-tool[data-tool="hold"]');
  await page.waitForSelector('.sheet');
  const tabs = await page.evaluate(() => [...document.querySelectorAll('.sheet [role=tab]')].map((t) => t.innerText.trim().replace(/\s+/g, ' ')));
  console.log('hold tabs', JSON.stringify(tabs));
  await page.evaluate(() => { const t = [...document.querySelectorAll('.sheet [role=tab]')].find((x) => /New batch/.test(x.innerText)); t && t.click(); }); taps++;
  await page.waitForTimeout(500);
  const fields = await page.evaluate(() => [...document.querySelectorAll('.sheet input, .sheet select, .sheet textarea, .sheet [role=radio], .sheet button.chip')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => (e.getAttribute('aria-label') || e.name || e.placeholder || e.innerText || e.tagName).trim().slice(0, 28)));
  console.log('new batch form controls:', JSON.stringify(fields));
  await page.screenshot({ path: out + 'g-new-batch.png' });
  console.log('taps so far (open hold + new batch tab):', taps);
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  // empty kitchen
  await page.evaluate(() => SB.store.dispatch('resetLive', {}));
  await page.waitForTimeout(900);
  await page.screenshot({ path: out + 'g-empty.png' });
  console.log('empty board text:', (await page.evaluate(() => (document.querySelector('main') || document.body).innerText)).replace(/\s+/g, ' ').slice(0, 400));
  console.log('sound on by default?', await page.evaluate(() => SB.floor.sound()), '| wakeLock in app:', await page.evaluate(() => /wakeLock/.test(document.documentElement.outerHTML)));
  console.log('errors', logs.errors.length, logs.pageErrors.length);
});
