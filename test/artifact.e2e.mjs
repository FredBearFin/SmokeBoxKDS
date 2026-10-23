// Loads dist/smokebox.artifact.html inside a mock of the Artifact host skeleton (doctype/head/body + reset + root safe-area padding)
// and the host's own data-theme="dark" on the root, to prove the body-only page works and does not fight the host.
//   node test/artifact.e2e.mjs
import fs from 'node:fs';
import path from 'node:path';
import { toolRequire } from '../tools/_deps.mjs';
import { spawnSync } from 'node:child_process';
import { ROOT } from '../tools/pw.mjs';
const { chromium } = toolRequire('playwright');

const b = spawnSync(process.execPath, [path.join(ROOT, 'tools/build-artifact.mjs'), '--out', 'dist/smokebox.artifact.html'], { cwd: ROOT, encoding: 'utf8' });
process.stdout.write(b.stdout + b.stderr);
if (b.status !== 0) process.exit(1);
const frag = fs.readFileSync(path.join(ROOT, 'dist/smokebox.artifact.html'), 'utf8');
const host = (extraHead = '') => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style>${extraHead}</head><body>${frag}</body></html>`;

let failed = 0;
const ok = (c, m) => { if (!c) { failed++; console.log('FAIL', m); } else console.log('ok  ', m); };
const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
for (const vp of [{ w: 1280, h: 800 }, { w: 390, h: 844 }]) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)|ERR_(TUNNEL|NAME|INTERNET)/.test(m.text() + (m.location().url || ''))) errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push(String(e)));
  // the host marks the root with its own theme choice (before our page runs), as the real viewer does
  await page.setContent(host(`<script>document.documentElement.setAttribute('data-theme','dark');</script>`), { waitUntil: 'load' });
  await page.waitForTimeout(600);
  const r = await page.evaluate(() => ({
    look: document.documentElement.getAttribute('data-look'),
    hostTheme: document.documentElement.getAttribute('data-theme'),
    bg: getComputedStyle(document.body).backgroundColor,
    booted: !!(window.SB && window.SB.booted),
    errs: window.__sbLoadErrors || [],
    hscroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    hasApp: !!document.querySelector('#sb-floor'),
  }));
  console.log(vp.w + 'px', JSON.stringify(r));
  ok(r.booted, vp.w + ': app booted'); ok(r.look === 'day', vp.w + ': our look is data-look=day, untouched by the host'); ok(r.hostTheme === 'dark', vp.w + ': host data-theme left alone');
  ok(r.bg !== 'rgba(0, 0, 0, 0)' && r.bg !== 'rgb(255, 255, 255)', vp.w + ': body has our explicit background (' + r.bg + ')');
  ok(!r.hscroll, vp.w + ': no horizontal scroll'); ok(r.hasApp, vp.w + ': floor layer mounted'); ok(!r.errs.length, vp.w + ': no module load errors'); ok(!errs.length, vp.w + ': console clean ' + errs.join(' | '));
  // theme toggle still works inside the host
  const t = await page.evaluate(() => { SB.theme.set('night'); return document.documentElement.getAttribute('data-look'); });
  ok(t === 'night', vp.w + ': night look applied through data-look');
  await page.screenshot({ path: path.join(ROOT, `test/.out/artifact-${vp.w}.png`) });
  await ctx.close();
}
await browser.close();
console.log(failed ? failed + ' FAILED' : 'all passed');
process.exit(failed ? 1 : 0);
