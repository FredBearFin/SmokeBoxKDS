// Shared test helper: puts a page's kitchen into a known state on purpose, so no test depends on what a first run happens to show.
// startKitchen clears live data and (by default) loads the starter hold batches so every dish can be sold; sample history is switched
// on or off explicitly (opts.welcome:false also hides the welcome card). Run it after SB.booted. Everything it needs is optional, so it works in the small private bundles too.
// Why: a brand-new install starts as an empty kitchen (no stock, no sample history), where every dish is 86 and the back office is empty.

/** Page-side function body, exported as text so tools that cannot import this file can reuse it. */
export function kitchenScript({ sample = false, starter = true, welcome = true } = {}) {
  return `(() => {
    const out = { reset: null, sample: null };
    try { if (SB.sim && SB.sim.live && SB.sim.live.stop) SB.sim.live.stop(); } catch (e) {}
    try { if (SB.sim && SB.sim.live && SB.sim.live.crew) SB.sim.live.crew(false); } catch (e) {}
    out.reset = SB.store.resetLive({ keepSettings: true, starter: ${starter ? 'true' : 'false'} });
    try { if (SB.sim && typeof SB.sim.setSampleEnabled === 'function') { SB.sim.setSampleEnabled(${sample ? 'true' : 'false'}); out.sample = ${sample ? 'true' : 'false'}; } } catch (e) {}
    ${welcome ? '' : 'try { if (SB.floor && SB.floor.setWelcome) SB.floor.setWelcome(false); } catch (e) {}'}
    return out;
  })()`;
}

/** Puts the kitchen into the known state. Returns what the store said (reset report). */
export async function startKitchen(page, opts = {}) {
  await page.waitForFunction(() => window.SB && SB.booted === true, null, { timeout: 15000 });
  return page.evaluate(kitchenScript(opts));
}
