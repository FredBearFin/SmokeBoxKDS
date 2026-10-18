#!/usr/bin/env node
// WHAT THIS FILE IS: Takes a screenshot of the built app. Run: node tools/shot.mjs out.png [--w 1280] [--h
// 800] [--hash '#/office'] [--wait 800] [--eval "SB.store.dispatch(...)"] [--full] [--scale 1]. It prints
// any console or page errors so a broken build is obvious.
// PARTS: read options, open the page, optionally run a snippet, wait, save. USES: pw.mjs. USED BY: you, from
// the command line.
import { withPage } from './pw.mjs';
const a = process.argv.slice(2);
const out = a[0] || 'shot.png';
// Reads the value after --name on the command line, or the default d.
const get = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
const opts = { w: +get('w', 1280), h: +get('h', 800), hash: get('hash', ''), scale: +get('scale', 1) };
await withPage(opts, async (page, logs) => {
  const ev = get('eval', null);
  if (ev) await page.evaluate(ev);
  await page.waitForTimeout(+get('wait', 800));
  await page.screenshot({ path: out, fullPage: a.includes('--full') });
  console.log('saved', out);
  if (logs.errors.length || logs.pageErrors.length) { console.log('CONSOLE ERRORS:', logs.errors, 'PAGE ERRORS:', logs.pageErrors); process.exitCode = 2; }
});
