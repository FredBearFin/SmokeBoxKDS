// Which notice shows first on the strip when sound is off and a new version waits (browser, about 20 s).
// Run: node test/board-update-priority.e2e.mjs
// Rule: safety first. "Warnings are silent: sound is off" shows first and says one more notice waits; the Settings button carries a dot
// and a spoken name that mentions the new version; clearing the silent line lets "A new version is ready. Reload when it is quiet." show.
// The offline module is stubbed here (SB.offline.status), so this runs on any build that has the update line. Needs dist/smokebox.html.
import { toolRequire } from '../tools/_deps.mjs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { chromium } = toolRequire('playwright');
const DIST = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), 'dist/smokebox.html');
let fail = 0;
// Records one check and prints it.
function check(name, ok, detail) { if (!ok) fail++; console.log((ok ? '  ok    ' : '  FAIL  ') + name + (ok ? '' : ' -> ' + JSON.stringify(detail))); }
const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const errs = [];
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const p = await ctx.newPage();
p.on('pageerror', (e) => errs.push(String(e)));
await p.addInitScript("(() => { const iv = setInterval(() => { if (window.SB) { clearInterval(iv); SB.offline = { status: () => ({ supported: true, state: 'update', updateReady: true }), subscribe: () => () => {}, register: () => Promise.resolve({ ok: true }), check: () => Promise.resolve({ ok: true }), applyUpdate() {}, reset() {} }; } }, 1); })();");
await p.goto(pathToFileURL(DIST).href + '?demo');
await p.waitForFunction(() => window.SB && SB.booted === true);
await p.evaluate(() => { SB.floor.setWelcome(false); SB.floor.setSound(false); });
await p.waitForTimeout(1500);
const bars = () => p.evaluate(() => [...document.querySelectorAll('.fl-strip-bar')].filter((e) => e.offsetParent !== null).map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
const b1 = await bars();
check('sound off: the silent line shows first and says one more notice waits', b1.length === 1 && /Warnings are silent/.test(b1[0]) && /\(1 more notice\)/.test(b1[0]), b1);
const label = await p.evaluate(() => document.querySelector('.fl-menu').getAttribute('aria-label'));
check('the Settings button says a new version is ready', /new version is ready/.test(label), label);
check('the Settings button carries a dot', await p.evaluate(() => { const d = document.querySelector('.fl-menu-dot'); return !!d && !d.hidden; }));
await p.click('.fl-bar-pause .fl-strip-x'); await p.waitForTimeout(1200);
const b2 = await bars();
check('after the silent line is cleared the update line shows', b2.length === 1 && /A new version is ready\. Reload when it is quiet\./.test(b2[0]), b2);
check('no page errors', errs.length === 0, errs);
await browser.close();
console.log(fail ? fail + ' check(s) failed' : 'all checks passed');
process.exit(fail ? 1 : 0);
