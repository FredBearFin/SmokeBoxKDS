// Shared test helper: puts a page's kitchen into a known state on purpose, so no test depends on what a first run happens to show.
// startKitchen clears live data and (by default) loads the starter hold batches so every dish can be sold; sample history is switched
// on or off explicitly (opts.welcome:false also hides the welcome card). Run it after SB.booted. Everything it needs is optional, so it works in the small private bundles too.
// Why: a brand-new install starts as an empty kitchen (no stock, no sample history), where every dish is 86 and the back office is empty.

/** Page-side function body, exported as text so tools that cannot import this file can reuse it. */
export function kitchenScript({ sample = false, starter = true, welcome = true, who = 'QA' } = {}) {
  return `(() => {
    const out = { reset: null, sample: null };
    try { if (SB.sim && SB.sim.live && SB.sim.live.stop) SB.sim.live.stop(); } catch (e) {}
    try { if (SB.sim && SB.sim.live && SB.sim.live.crew) SB.sim.live.crew(false); } catch (e) {}
    out.reset = SB.store.resetLive({ keepSettings: true, starter: ${starter ? 'true' : 'false'} });
    try { if (SB.sim && typeof SB.sim.setSampleEnabled === 'function') { SB.sim.setSampleEnabled(${sample ? 'true' : 'false'}); out.sample = ${sample ? 'true' : 'false'}; } } catch (e) {}
    ${welcome ? '' : 'try { if (SB.floor && SB.floor.setWelcome) SB.floor.setWelcome(false); } catch (e) {}'}
    // Safety actions in the hold cabinet ask "Who is this?" once per tablet; remembered initials keep that box out of the way (who:'' to leave it asked).
    ${who ? `try { SB.util.storage.set('smokebox.v1.initials', { who: ${JSON.stringify(who)}, at: SB.store.now() }); } catch (e) {}` : ''}
    return out;
  })()`;
}

/** Puts the page into the barbecue demo kitchen in a known state. A real install starts blank and keeps the demo apart (the demo lives
 *  under its own saved keys and opens with ?demo), so a page that is not in the demo yet is reloaded into it first (same file and hash).
 *  Returns what the store said (reset report). Pass demo:false to keep a real kitchen (then only the reset runs, and a real kitchen
 *  refuses starter stock). */
export async function startKitchen(page, opts = {}) {
  await page.waitForFunction(() => window.SB && SB.booted === true, null, { timeout: 15000 });
  const inDemo = await page.evaluate(() => !!(SB.store && SB.store.isDemo && SB.store.isDemo()));
  if (!inDemo && opts.demo !== false) {
    const u = new URL(page.url());
    u.search = '?demo';
    await page.goto(u.href, { waitUntil: 'load' });
    await page.waitForFunction(() => window.SB && SB.booted === true, null, { timeout: 15000 });
  }
  return page.evaluate(kitchenScript(opts));
}

/** A REAL kitchen (no ?demo) that has a menu and some orders, built only through the normal actions: a few dishes, then orders for them. A real
 *  install starts blank, so tests that need "data on the device" (the backup nudge, the Orders list) use this. Returns { dishes, orders }. */
export async function realKitchen(page, { dishes = 3, orders = 2 } = {}) {
  await page.waitForFunction(() => window.SB && SB.booted === true, null, { timeout: 15000 });
  return page.evaluate(({ dishes, orders }) => {
    const S = SB.store, out = { dishes: [], orders: [], bad: [] };
    const specs = [['Smoked brisket plate', 'pit', 'meat', 14, 600, 'two'], ['Mac and cheese', 'sides', 'side', 5, 120, 'one'], ['Sweet tea', 'cold', 'cold', 3, 30, 'one'], ['Fried pickles', 'fry', 'fried', 6, 240, 'two']];
    for (const [name, zone, cat, price, prepSec, track] of specs.slice(0, dishes)) {
      const r = S.dispatchEx('addMenuItem', { name, zone, cat, price, prepSec, track }, { source: 'ui' });
      if (r.report === 'ok') out.dishes.push(r.info.id); else out.bad.push(name + ': ' + r.report);
    }
    for (let i = 0; i < orders && out.dishes.length; i++) {
      const r = S.dispatchEx('createTicket', { customer: 'Table ' + (i + 1), channel: 'dine_in', items: [{ menuId: out.dishes[i % out.dishes.length] }] }, { source: 'ui' });
      if (r.report === 'ok') out.orders.push(r.info && r.info.ticketId); else out.bad.push('order ' + i + ': ' + r.report);
    }
    return out;
  }, { dishes, orders });
}
