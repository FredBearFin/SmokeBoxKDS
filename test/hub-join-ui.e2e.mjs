/*
 * WHAT THIS FILE IS: Browser check for the "Use one kitchen on several tablets" join flow, against a stand-in hub client
 * (the page's store calls are replaced by small stubs, so this checks the screen and its choices, not a real hub).
 * Covers: two ways to pick, name required, explicit choice, a stop for a hub that is not empty, plain errors, status, Leave.
 * USES: tools/pw.mjs, dist/smokebox.html. RUN: node test/hub-join-ui.e2e.mjs
 */
import { withPage } from '../tools/pw.mjs';
let fails = 0;
// Records one check result and prints it.
function ok(c, m) { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; }
const stubs = () => {
  window.__calls = []; window.__hub = { empty: true, error: null, joined: false };
  SB.store.probeHub = (o) => { window.__calls.push(['probe', o]); if (window.__hub.tokens && !window.__hub.paired) return Promise.resolve({ ok: false, error: 'unpaired', tokensRequired: true }); return Promise.resolve(window.__hub.error ? { ok: false, error: window.__hub.error } : { ok: true, empty: window.__hub.empty }); };
  SB.store.pairHub = (o) => { window.__calls.push(['pair', o]); if (window.__hub.pairError) return Promise.resolve({ ok: false, error: window.__hub.pairError }); window.__hub.paired = true; return Promise.resolve({ ok: true, name: o.name }); };
  SB.store.unpair = (u) => { window.__calls.push(['unpair', u]); window.__hub.paired = false; };
  SB.store.initHubClient = (o) => { window.__calls.push(['join', o]); if (window.__hub.joinError) return Promise.resolve({ ok: false, error: window.__hub.joinError }); window.__hub.joined = true; return Promise.resolve({ ok: true }); };
  SB.store.isHubClient = () => window.__hub.joined;
  SB.store.hubStatus = () => ({ state: window.__hub.state || 'connected', queued: window.__hub.queued || 0, lastUpdate: Date.now() });
  SB.store.leaveHub = (o) => { window.__calls.push(['leave', o]); if (window.__hub.pending && !(o && o.force)) return Promise.resolve({ ok: false, error: 'pending' }); window.__hub.joined = false; return Promise.resolve({ ok: true }); };
};
await withPage({ w: 1024, h: 768 }, async (page, logs) => {
  await page.evaluate(stubs);
  await page.evaluate(() => SB.sheets.open('follow'));
  await page.waitForSelector('[data-mode="orders"]');
  ok(await page.locator('[data-part="other"]').isVisible(), 'show-only form is the default');
  await page.click('[data-mode="orders"]');
  ok(await page.locator('[data-part="hub"]').isVisible() && !(await page.locator('[data-part="other"]').isVisible()), 'choosing orders shows the hub form only');
  ok(/test feature/.test(await page.locator('[data-part="hub"]').innerText()) && /does not start one/.test(await page.locator('[data-part="hub"]').innerText()), 'says test feature and that the hub is not started');
  // name is required
  await page.fill('[data-field="hub-url"]', 'kitchen.example.com');
  await page.click('[data-act="hub-check"]');
  ok(/Give this screen a name/.test(await page.locator('[data-role="hub-msg"]').innerText()), 'screen name required');
  ok((await page.evaluate(() => __calls.length)) === 0, 'nothing sent to the hub without a name');
  // empty hub: both options, nothing chosen by default, Join disabled
  await page.fill('[data-field="hub-name"]', 'Pass');
  await page.fill('[data-field="hub-code"]', 'abc123');
  await page.click('[data-act="hub-check"]');
  await page.waitForSelector('[data-opt="adopt"]');
  ok(await page.locator('[data-act="hub-join"]').isDisabled(), 'Join is off until one option is chosen');
  ok(await page.locator('[data-choice="seed"]').isEnabled(), 'empty hub: send-this-tablet option is on');
  ok(await page.locator('[data-role="stop"]').count() === 0, 'empty hub: no stop message');
  const txt = await page.locator('[data-role="choice"]').innerText();
  ok(/Show the shared kitchen on this tablet/.test(txt) && /stays untouched on this tablet and comes back/.test(txt) && /Send this tablet's kitchen to the main computer/.test(txt), 'both options use the agreed plain words');
  await page.check('[data-choice="seed"]');
  await page.click('[data-act="hub-join"]');
  await page.waitForSelector('[data-role="hub-joined"]:not([hidden])');
  const calls = await page.evaluate(() => __calls);
  ok(calls[0][0] === 'probe' && calls[0][1].url === 'https://kitchen.example.com' && calls[0][1].code === 'ABC123', 'probe got a clean address and code');
  ok(calls[1][0] === 'join' && calls[1][1].seed === true && calls[1][1].adopt === undefined && calls[1][1].name === 'Pass', 'join sent seed and the screen name only');
  ok(/Using the main computer/.test(await page.locator('[data-role="hub-status"]').innerText()), 'joined: status in plain words');
  ok(/stays on this tablet, untouched, and comes back/.test(await page.locator('[data-role="hub-joined"]').innerText()), 'joined: says what stays where');
  await page.evaluate(() => { __hub.state = 'offline'; __hub.queued = 2; });
  await page.waitForFunction(() => /out of date/.test(document.querySelector('[data-role="hub-status"]').textContent), null, { timeout: 5000 });
  ok(/2 taps are waiting/.test(await page.locator('[data-role="hub-status"]').innerText()), 'lost hub: says taps are waiting');
  await page.click('[data-act="hub-leave"]');
  await page.waitForSelector('[data-role="hub-form"]:not([hidden])');
  ok((await page.evaluate(() => __calls.at(-1)[0])) === 'leave', 'Leave the hub calls leaveHub');
  // leaving with unanswered taps asks first
  await page.click('[data-mode="orders"]');
  await page.evaluate(() => { __hub.empty = true; __hub.joined = false; });
  await page.evaluate(() => { __hub.pending = true; __hub.joined = true; });
  await page.waitForSelector('[data-role="hub-joined"]:not([hidden])');
  await page.click('[data-act="hub-leave"]');
  await page.waitForSelector('[data-act="hub-leave-anyway"]:not([hidden])');
  ok(/lost/.test(await page.locator('[data-role="hub-msg"]').innerText()), 'pending taps: asks before leaving');
  await page.click('[data-act="hub-leave-anyway"]');
  await page.evaluate(() => { __hub.pending = false; });
  await page.waitForSelector('[data-role="hub-form"]:not([hidden])');
  ok((await page.evaluate(() => __calls.at(-1)[1].force)) === true, 'leave anyway sends force');
  // not empty: stop, seed off, adopt still possible
  await page.evaluate(() => { __hub.empty = false; __calls.length = 0; });
  await page.click('[data-act="hub-check"]');
  await page.waitForSelector('[data-role="stop"]');
  ok(await page.locator('[data-choice="seed"]').isDisabled(), 'hub not empty: send option is off');
  ok(/will not mix two kitchens/.test(await page.locator('[data-role="stop"]').innerText()), 'hub not empty: clear stop');
  ok(await page.locator('[data-act="hub-join"]').isDisabled(), 'hub not empty: Join still off until adopt is chosen');
  await page.check('[data-choice="adopt"]');
  await page.click('[data-act="hub-join"]');
  await page.waitForSelector('[data-role="hub-joined"]:not([hidden])');
  ok((await page.evaluate(() => __calls.at(-1)[1].adopt)) === 'hub', 'adopt joins with adopt hub');
  await page.click('[data-act="hub-leave"]');
  // errors
  for (const [code, re] of [['badCode', /access code was not accepted/], ['notFound', /is a Smokebox main computer/], ['unreachable', /Could not reach/], ['wrongVersion', /different versions/], ['tooMany', /as many screens/]]) {
    await page.evaluate((c) => { __hub.error = c; }, code);
    await page.click('[data-act="hub-check"]');
    await page.waitForFunction((s) => new RegExp(s).test(document.querySelector('[data-role="hub-msg"]').textContent), re.source, { timeout: 3000 }).catch(() => {});
    ok(re.test(await page.locator('[data-role="hub-msg"]').innerText()), code + ' in plain words');
  }
  await page.evaluate(() => { __hub.error = null; __hub.empty = true; __hub.joinError = 'notEmpty'; });
  await page.click('[data-act="hub-check"]'); await page.waitForSelector('[data-opt="seed"]');
  await page.check('[data-choice="seed"]'); await page.click('[data-act="hub-join"]');
  await page.waitForFunction(() => /cannot be sent/.test(document.querySelector('[data-role="hub-msg"]').textContent), null, { timeout: 3000 });
  ok(await page.locator('[data-role="hub-form"]').isVisible(), 'refused join: stays on the form, nothing changed');
  ok(logs.pageErrors.length === 0, 'no page errors ' + logs.pageErrors.join('|').slice(0, 200));
});
// A hub that needs pairing: the pairing box shows, the access code field hides, errors are plain, and a removed tablet can start over.
await withPage({ w: 1024, h: 768 }, async (page) => {
  await page.evaluate(stubs);
  await page.evaluate(() => { __hub.tokens = true; SB.sheets.open('follow'); });
  await page.waitForSelector('[data-mode="orders"]'); await page.click('[data-mode="orders"]');
  ok(await page.locator('[data-role="access-box"]').isVisible() && !(await page.locator('[data-role="pair-box"]').isVisible()), 'before looking: access code field shows, no pairing box');
  await page.fill('[data-field="hub-url"]', 'kitchen.example.com'); await page.fill('[data-field="hub-name"]', 'Pass');
  await page.click('[data-act="hub-check"]');
  await page.waitForSelector('[data-role="pair-box"]:not([hidden])');
  ok(/Ask the person who runs the main computer for a pairing code. It works once and for 10 minutes./.test(await page.locator('[data-role="pair-box"]').innerText()), 'pairing box uses the agreed words');
  ok(!(await page.locator('[data-role="access-box"]').isVisible()), 'hub needs tokens: old access code field is hidden');
  await page.click('[data-act="hub-pair"]');
  ok(/6-character/.test(await page.locator('[data-role="hub-msg"]').innerText()), 'empty pairing code: plain message');
  await page.evaluate(() => { __hub.pairError = 'badPairCode'; });
  await page.fill('[data-field="hub-pair"]', 'abc-234'); await page.click('[data-act="hub-pair"]');
  await page.waitForFunction(() => /works once/.test(document.querySelector('[data-role="hub-msg"]').textContent), null, { timeout: 3000 });
  ok(true, 'wrong or used code: plain error');
  await page.evaluate(() => { __hub.pairError = null; });
  await page.click('[data-act="hub-pair"]');
  await page.waitForSelector('[data-opt="adopt"]');
  const pc = await page.evaluate(() => __calls.filter((c) => c[0] === 'pair').at(-1)[1]);
  ok(pc.code === 'ABC234' && pc.name === 'Pass' && pc.url === 'https://kitchen.example.com', 'pairHub got a clean code, name and address');
  await page.check('[data-choice="adopt"]'); await page.click('[data-act="hub-join"]');
  await page.waitForSelector('[data-role="hub-joined"]:not([hidden])');
  await page.evaluate(() => { SB.store.hubStatus = () => ({ state: 'error', error: 'revoked' }); });
  await page.waitForFunction(() => /removed from the kitchen/.test(document.querySelector('[data-role="hub-status"]').textContent), null, { timeout: 5000 });
  ok(true, 'removed tablet: plain state');
  await page.click('[data-act="hub-forget"]');
  await page.waitForSelector('[data-role="hub-form"]:not([hidden])');
  ok((await page.evaluate(() => __calls.some((c) => c[0] === 'unpair'))), 'Leave and pair again forgets the pass on this tablet');
});
// Without the store calls, the hub card says so plainly.
await withPage({ w: 1024, h: 768 }, async (page) => {
  await page.evaluate(() => { delete SB.store.initHubClient; delete SB.store.probeHub; SB.sheets.open('follow'); });
  await page.waitForSelector('[data-mode="orders"]'); await page.click('[data-mode="orders"]');
  ok(await page.locator('[data-role="no-hub-api"]').count() === 1, 'no hub client in this build: plain note');
});
process.exit(fails ? 1 : 0);
