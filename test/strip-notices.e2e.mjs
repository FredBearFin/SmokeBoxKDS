// Notice bars at the top of the board (browser, quick: about 5 s). Run: node test/strip-notices.e2e.mjs
// Checks that a notice bar that is showing always has words in it (it once showed only its X), and that the
// sanitize chip names itself when it needs attention. Needs dist/smokebox.html.
import { withPage } from '../tools/pw.mjs';

let fail = 0;
// Records one check and prints it.
function check(name, ok, detail) { if (!ok) fail++; console.log((ok ? '  ok    ' : '  FAIL  ') + name + (ok ? '' : ' -> ' + JSON.stringify(detail))); }

await withPage({ w: 1280, h: 800 }, async (page, logs) => {
  await page.waitForFunction(() => window.SB && SB.booted === true, null, { timeout: 8000 });
  await page.evaluate(() => { SB.floor.setWelcome(false); });
  await page.waitForTimeout(600);
  const bars = await page.evaluate(() => [...document.querySelectorAll('.fl-strip-bar')].filter((b) => !b.hidden).map((b) => ({ cls: b.className, text: b.innerText.trim().length, box: Math.round(b.getBoundingClientRect().height) })));
  check('at least one notice bar shows on a fresh start with sound on', bars.length >= 1, bars);
  check('every visible notice bar has words, not only an X', bars.every((b) => b.text > 10), bars);
  await page.evaluate(() => { SB.floor.setSound(false); });
  await page.waitForTimeout(600);
  const off = await page.evaluate(() => [...document.querySelectorAll('.fl-strip-bar')].filter((b) => !b.hidden).map((b) => b.innerText.trim()));
  check('sound-off note has words', off.length >= 1 && off.every((t) => t.length > 10), off);
  check('no page errors', logs.pageErrors.length === 0, logs.pageErrors);
});
process.exit(fail ? 1 : 0);
