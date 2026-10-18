/*
 * WHAT THIS FILE IS: Helper for browser tests. withPage({ w, h, hash, file, ... }, async (page, logs) =>
 *    {...}) opens the built app in headless Chromium (Playwright), runs your steps, then closes the browser.
 *    logs collects errors, warnings, page errors and failed requests; a clean run has no errors and no page
 *    errors.
 * PARTS: font-noise filter, storage reset, withPage. USES: Playwright from /opt/npm-tools,
 *    dist/smokebox.html. USED BY: shot.mjs, charts-gallery.mjs and the browser tests.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire('/opt/npm-tools/node_modules/');
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DIST = path.join(root, 'dist/smokebox.html');
export const ROOT = root;

// Opens the page (dist/smokebox.html unless file is given) at size w by h and runs fn(page, logs); returns
// what fn returns and always closes the browser. Options: hash, scale, touch, colorScheme, reducedMotion,
// init (a script run before the app) and clearStorage (default true: start from empty storage once per run).
export async function withPage(opts, fn) {
  const { w = 1280, h = 800, hash = '', file = DIST, scale = 1, touch = false, colorScheme = 'light', reducedMotion = 'no-preference', clearStorage = true, init } = opts || {};
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: scale, hasTouch: touch, isMobile: false, colorScheme, reducedMotion });
  const page = await ctx.newPage();
  const logs = { errors: [], warnings: [], pageErrors: [], failedRequests: [] };
  // The sandbox has no route to Google Fonts, so font requests always fail here. That is not an app error (the CSS has fallback stacks).
  // True for console messages caused only by the unreachable Google Fonts links; those are not app errors.
  const isFontNoise = (m) => /fonts\.(googleapis|gstatic)\.com/.test((m.location && m.location().url) || '') || /ERR_TUNNEL_CONNECTION_FAILED|ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED/.test(m.text());
  page.on('console', (m) => { if (m.type() === 'error') { if (!isFontNoise(m)) logs.errors.push(m.text()); } else if (m.type() === 'warning') logs.warnings.push(m.text()); });
  page.on('pageerror', (e) => logs.pageErrors.push(String(e && e.stack || e)));
  page.on('requestfailed', (r) => logs.failedRequests.push(r.url()));
  // external font requests may fail offline; they are not app errors
  if (init) await page.addInitScript(init);
  // Start from empty storage exactly once per page session (marked in both sessionStorage and window.name, because a reload
  // occasionally came back without sessionStorage and wiped what the test had just saved). An init script runs before the app's own code, so the store never
  // sees (or re-saves on page close) stale data, and later reloads inside a test keep what the test saved.
  if (clearStorage) await page.addInitScript(() => { try { if (!sessionStorage.getItem('__pwcleared') && window.name !== '__pwcleared') { localStorage.clear(); sessionStorage.setItem('__pwcleared', '1'); } window.name = '__pwcleared'; } catch (e) { /* storage blocked */ } });
  const url = pathToFileURL(file).href + hash;
  await page.goto(url, { waitUntil: 'load' });
  try { return await fn(page, logs); } finally { await browser.close(); }
}
