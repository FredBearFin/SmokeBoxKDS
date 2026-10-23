// A path prefix behind a reverse proxy (a small Node stand-in that strips /beta): a bare ?hub and a bare ?follow build their addresses from the page's
// own folder, an explicit absolute address still works, and the service worker's scope follows the folder. NOT real Caddy, real TLS or a real server.
// Run: SMOKEBOX_TOOLS=$(npm root -g) node test/prefix-proxy.e2e.mjs   (about 20 s)
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toolRequire } from '../tools/_deps.mjs';
import { createHub } from '../server/server.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fail = 0; const check = (n, ok, d) => { if (!ok) fail++; console.log((ok ? '  ok    ' : '  FAIL  ') + n + (ok ? '' : ' -> ' + String(JSON.stringify(d)).slice(0, 300))); };
const hub = await createHub({ dataFile: null, starter: true, htmlFile: path.join(ROOT, 'dist/smokebox.html'), writeCode: 'WRITECODE12345', followCode: 'FOLLOWCODE12345', tickMs: 1000 });
const hubPort = await hub.listen(0);
const PROXY = 28810;
const proxy = http.createServer((req, res) => {
  if (!/^\/beta(\/|\?|$)/.test(req.url)) { res.writeHead(404); res.end('not found'); return; }
  const url = req.url.replace(/^\/beta/, '') || '/';
  const up = http.request({ host: '127.0.0.1', port: hubPort, path: url, method: req.method, headers: Object.assign({}, req.headers, { 'x-forwarded-for': '203.0.113.9' }) }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); res.flushHeaders(); });
  up.on('error', () => { res.writeHead(502); res.end(); }); req.pipe(up); res.on('close', () => up.destroy());
});
await new Promise((r) => proxy.listen(PROXY, '127.0.0.1', r));
const { chromium } = toolRequire('playwright');
const browser = await chromium.launch({ args: ['--no-sandbox'] });
async function open(url) { const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }); const p = await ctx.newPage(); p.errs = []; p.on('pageerror', (e) => p.errs.push(String(e))); await p.goto(url, { waitUntil: 'load' }); await p.waitForFunction(() => window.SB && SB.booted === true, null, { timeout: 15000 }).catch(() => {}); p.ctx = ctx; return p; }
const status = (p) => p.evaluate(() => (/[?&]follow/.test(location.search) ? SB.store.followStatus() : SB.store.hubStatus()).state);
async function waitState(p, want, ms = 12000) { const e = Date.now() + ms; let s; while (Date.now() < e) { s = await status(p).catch(() => 'err'); if (s === want) return s; await sleep(200); } return s; }
const base = `http://127.0.0.1:${PROXY}/beta/`;
try {
  const T = await open(base + '?hub&code=WRITECODE12345');
  check('a bare ?hub under /beta/ connects', (await waitState(T, 'connected')) === 'connected', await status(T));
  const m = await T.evaluate(() => SB.store.getState().menu[0].id);
  await T.evaluate((m) => SB.store.dispatch('createTicket', { customer: 'Prefix guest', items: [{ menuId: m }] }), m);
  const F = await open(base + '?follow&code=FOLLOWCODE12345');
  check('a bare ?follow under /beta/ connects and shows the ticket', (await waitState(F, 'following')) === 'following' && await F.evaluate(() => SB.store.getState().tickets.some((t) => t.customer === 'Prefix guest')), await status(F));
  const X = await open(base + `?hub=${encodeURIComponent(base.replace(/\/$/, ''))}&code=WRITECODE12345`);
  check('an explicit absolute address with the prefix still works', (await waitState(X, 'connected')) === 'connected', await status(X));
  const reg = await T.evaluate(async () => { await SB.offline.register(); const r = await navigator.serviceWorker.getRegistration(); return r ? { scope: r.scope, script: r.active && r.active.scriptURL || (r.installing && r.installing.scriptURL) || (r.waiting && r.waiting.scriptURL) } : null; });
  check('the service worker scope follows the folder', reg && reg.scope === base && /\/beta\/sw\.js$/.test(reg.script || ''), reg);
  const mf = await T.evaluate(() => { const l = document.querySelector('link[rel="manifest"]'); return l && l.href; });
  check('the manifest link is inside the folder', mf === base + 'manifest.webmanifest', mf);
  const mj = await (await fetch(base + 'manifest.webmanifest')).json();
  check('the manifest starts and scopes at the folder', mj.start_url === './' && mj.scope === './' && mj.icons.every((i) => !i.src.startsWith('/')), mj);
  const TR = await open(base + '?follow&trim=3&code=FOLLOWCODE12345');
  check('?follow&trim=3 asks for the trimmed copy and the page knows it', (await waitState(TR, 'following')) === 'following' && await TR.evaluate(() => { const t = SB.store.trimInfo(); return !!t && t.days === 3; }), await TR.evaluate(() => SB.store.trimInfo()));
  check('no page errors', [T, F, X].every((p) => p.errs.length === 0), [T, F, X].map((p) => p.errs));
  const R = await open(`http://127.0.0.1:${PROXY}/beta/`);
  check('a page with no ?hub at the prefix is a normal local kitchen', await R.evaluate(() => !(SB.store.isHubClient && SB.store.isHubClient())));
} finally { await browser.close(); proxy.close(); await hub.close(); }
console.log(fail ? `\n${fail} FAILED` : '\nall checks passed'); process.exit(fail ? 1 : 0);
