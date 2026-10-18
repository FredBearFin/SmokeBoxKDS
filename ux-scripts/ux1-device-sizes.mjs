// UX test 1: first-run screens and a busy board at kitchen device sizes; dumps header buttons and card structure.
import { withPage } from '../tools/pw.mjs';
const out = './out/';
const sizes = [[1024, 768], [1180, 820], [1280, 800], [1920, 1080]];
for (const [w, h] of sizes) {
  await withPage({ w, h, touch: true }, async (page, logs) => {
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${out}a-first-${w}x${h}.png` });
    const welcome = await page.evaluate(() => (document.querySelector('.fl-welcome') || {}).innerText || '(no welcome)');
    console.log(`\n=== ${w}x${h} FIRST RUN welcome text: ${welcome.replace(/\n+/g, ' | ').slice(0, 300)}`);
    await page.evaluate(() => { SB.floor.setWelcome(false); SB.sim.live.crew(false); SB.sim.live.burst(9); });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${out}b-board-${w}x${h}.png` });
    const info = await page.evaluate(() => {
      const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
      const head = document.querySelector('.fl-head') || document.querySelector('header');
      const btns = head ? [...head.querySelectorAll('button, a, [role=tab]')].map((b) => ({ t: (b.getAttribute('aria-label') || b.innerText || b.title || '').trim().replace(/\s+/g, ' ').slice(0, 30), vis: vis(b), w: Math.round(b.getBoundingClientRect().width), h: Math.round(b.getBoundingClientRect().height) })) : [];
      const card = document.querySelector('.fl-ticket, .fl-card, .tk, [data-ticket]');
      return { headClass: head && head.className, btns, cardTag: card && (card.tagName + '.' + card.className), cardHtml: card && card.outerHTML.slice(0, 1200) };
    });
    console.log('header buttons (visible):', info.btns.filter((b) => b.vis).map((b) => `${b.t || '(icon)'}[${b.w}x${b.h}]`).join('  '));
    console.log('header buttons (hidden at this size):', info.btns.filter((b) => !b.vis).map((b) => b.t || '(icon)').join(', '));
    if (w === 1280) console.log('card:', info.cardTag, '\n', info.cardHtml);
    console.log('errors', logs.errors.length, logs.pageErrors.length);
  });
}
