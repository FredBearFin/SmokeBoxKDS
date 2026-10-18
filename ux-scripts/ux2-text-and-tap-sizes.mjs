// UX test 2: measure font sizes and tap targets on the board at 1280x800 and 1920x1080, convert to physical size and reading distance.
import { withPage } from '../tools/pw.mjs';
for (const [w, h] of [[1280, 800], [1920, 1080]]) {
  await withPage({ w, h, touch: true }, async (page) => {
    await page.waitForTimeout(800);
    await page.evaluate(() => { SB.floor.setWelcome(false); SB.sim.live.crew(false); SB.sim.live.burst(9); });
    await page.waitForTimeout(1000);
    const r = await page.evaluate(() => {
      const slip = document.querySelector('.slip');
      const seen = new Map();
      const walk = (e) => {
        const txt = [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ').trim();
        if (txt) { const cs = getComputedStyle(e); const k = e.className + '|' + cs.fontSize; if (!seen.has(k)) seen.set(k, { cls: String(e.className).slice(0, 40), px: parseFloat(cs.fontSize), weight: cs.fontWeight, sample: txt.slice(0, 34) }); }
        for (const c of e.children) walk(c);
      };
      walk(slip);
      const text = [...seen.values()].sort((a, b) => b.px - a.px);
      // interactive elements on the board (not inside a sheet)
      const els = [...document.querySelectorAll('button, [role=tab], a, input, select')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !e.closest('.sheet, dialog'); });
      const sizes = els.map((e) => { const r = e.getBoundingClientRect(); return { t: (e.getAttribute('aria-label') || e.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 24), w: Math.round(r.width), h: Math.round(r.height), inSlip: !!e.closest('.slip') }; });
      const group = (arr) => { const m = new Map(); for (const s of arr) { const k = s.t.replace(/[0-9#:]+/g, '').trim() || '(icon)'; const o = m.get(k) || { k, w: s.w, h: s.h, n: 0 }; o.n++; o.w = Math.min(o.w, s.w); o.h = Math.min(o.h, s.h); m.set(k, o); } return [...m.values()]; };
      return { text, slipTargets: group(sizes.filter((s) => s.inSlip)), headTargets: group(sizes.filter((s) => !s.inSlip)), vw: innerWidth };
    });
    console.log(`\n=== ${w}x${h}`);
    console.log('TEXT (largest first):'); for (const t of r.text) console.log(`  ${String(t.px).padStart(5)}px w${t.weight}  .${t.cls}  "${t.sample}"`);
    console.log('SLIP TARGETS (min size, count):', r.slipTargets.map((g) => `${g.k}[${g.w}x${g.h}]x${g.n}`).join('  '));
    console.log('OTHER TARGETS:', r.headTargets.map((g) => `${g.k}[${g.w}x${g.h}]`).join('  '));
  });
}
