// Journey 10: offline and host. The page may talk to Google Fonts and nothing else. It still works with the network off.
// The artifact build still passes its own host test (node test/artifact.e2e.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { wait, seedStandard, settle, closeSheets, openKey, waitOffice, gotoOffice, OFFICE_PAGES, storeTickets } from './_lib.mjs';

const ALLOWED = /^https:\/\/fonts\.(googleapis|gstatic)\.com(\/|$)/;
const isRemote = (u) => /^(https?|wss?|ftp):/i.test(u);

export default function (h) {
  h.test('10a-no-network', 'Offline: only Google Fonts is requested, no fetch/XHR/beacon/socket, and it works with the network off', { owner: 'lead', timeout: 120000 }, async (t) => {
    // static read of the built file
    const file = path.join(h.ROOT, 'dist/qa.html');
    const html = fs.readFileSync(file, 'utf8');
    t.note('built file size', Math.round(fs.statSync(file).size / 1024), 'KB');
    const tags = html.match(/<(script|link|img|iframe|source|video|audio|embed|object)\b[^>]*\b(src|href|data)=["'][^"']+["'][^>]*>/gi) || [];
    const remoteTags = tags.map((x) => (/\b(?:src|href|data)=["']([^"']+)["']/i.exec(x) || [])[1]).filter((u) => u && isRemote(u) && !ALLOWED.test(u) && !/^http:\/\/www\.w3\.org\//.test(u));
    t.check('the built page has no script, stylesheet, image or frame pointing off the device (except Google Fonts)', remoteTags.length === 0, remoteTags.slice(0, 5), 'lead');
    const fontLinks = tags.filter((x) => /fonts\.googleapis\.com\/css/.test(x));
    t.check('the font stylesheet uses display=swap so text is never hidden while fonts load', fontLinks.length === 0 || fontLinks.every((x) => /display=swap/.test(x)), fontLinks.slice(0, 2), 'lead');
    const cssUrls = (html.match(/url\(\s*["']?(https?:[^)"']+)/gi) || []).map((x) => x.replace(/url\(\s*["']?/i, '')).filter((u) => !ALLOWED.test(u));
    t.check('no CSS url() or @import pulls from anywhere but Google Fonts', cssUrls.length === 0, cssUrls.slice(0, 5), 'lead');

    const monitor = () => {
      window.__net = [];
      const log = (k, u) => { try { window.__net.push(k + ' ' + String(u).slice(0, 120)); } catch (e) { /* ignore */ } };
      const wf = window.fetch; if (wf) window.fetch = function (a) { log('fetch', a && a.url ? a.url : a); return wf.apply(this, arguments); };
      const xo = XMLHttpRequest.prototype.open; XMLHttpRequest.prototype.open = function (m, u) { log('xhr', u); return xo.apply(this, arguments); };
      if (navigator.sendBeacon) { const sb = navigator.sendBeacon.bind(navigator); navigator.sendBeacon = function (u) { log('beacon', u); return sb.apply(null, arguments); }; }
      const WS = window.WebSocket; if (WS) window.WebSocket = function (u) { log('websocket', u); return new WS(...arguments); };
      const ES = window.EventSource; if (ES) window.EventSource = function (u) { log('eventsource', u); return new ES(...arguments); };
      const imgSrc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
      if (imgSrc && imgSrc.set) Object.defineProperty(HTMLImageElement.prototype, 'src', { get: imgSrc.get, set(v) { if (/^https?:/i.test(v)) log('img', v); imgSrc.set.call(this, v); } });
    };
    const page = await t.open({ w: 1280, h: 800, init: monitor });
    await seedStandard(page);
    // walk the whole app: every floor sheet, then every office page, then export from the Data page
    for (const [k, n, api] of [['n', 'New ticket'], ['h', 'Hold cabinet', 'hold'], ['8', '86 board'], ['r', 'Recall'], ['d', 'Demo and clock']]) { try { await openKey(page, k, n, api); } catch (e) { t.check('sheet ' + n + ' opens', false, String(e).slice(0, 100), 'sheets'); } }
    await closeSheets(page);
    for (const s of ['help', 'specs', 'menu']) { await page.evaluate((s) => SB.sheets.open(s), s); await wait(500); await closeSheets(page); }
    await page.evaluate(() => { location.hash = '#/office/pace'; });
    await waitOffice(page, 8000);
    for (const p of OFFICE_PAGES) await gotoOffice(page, p.id, 8000);
    const exportBtn = page.getByRole('button', { name: /Export/i }).first();
    if (await exportBtn.count()) {
      const dl = page.waitForEvent('download', { timeout: 6000 }).catch(() => null);
      await exportBtn.click().catch(() => {});
      await dl;
      await wait(400);
    }
    const net = await page.evaluate(() => window.__net || []);
    const remote = page.logs.requests.filter((u) => isRemote(u) && !ALLOWED.test(u));
    const failedOther = page.logs.failedRequests.filter((u) => !ALLOWED.test(u) && !/^data:|^blob:/.test(u));
    t.note('page requests (http/https) in a full walk of floor + 7 office pages', page.logs.requests.filter(isRemote).length, 'requests');
    t.check('the only network requests are to Google Fonts (fonts.googleapis.com, fonts.gstatic.com)', remote.length === 0, remote.slice(0, 5), 'lead');
    t.check('no request failed except the font files (logs.failedRequests)', failedOther.length === 0, failedOther.slice(0, 5), 'lead');
    t.check('the app never calls fetch, XMLHttpRequest, sendBeacon, WebSocket or EventSource', net.length === 0, net.slice(0, 5), 'lead');
    t.check('no console errors during the whole walk', page.logs.errors.length === 0 && page.logs.pageErrors.length === 0, { e: page.logs.errors.slice(0, 3), p: page.logs.pageErrors.slice(0, 3) });
    const lang = await page.evaluate(() => ({ lang: document.documentElement.lang, title: document.title, viewport: (document.querySelector('meta[name=viewport]') || {}).content }));
    t.check('the page has a language, a title and a viewport tag', !!lang.lang && !!lang.title && /width=device-width/.test(lang.viewport || ''), lang, 'lead');

    // network completely off: a fresh load still boots and the cook can still send a ticket
    const ctx = page.context();
    const n0 = (await storeTickets(page)).length;
    await ctx.setOffline(true);
    await page.evaluate(() => { location.hash = ''; });
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.SB && SB.booted === true, null, { timeout: 12000 }).catch(() => {});
    const boot = await page.evaluate(() => ({ booted: !!(window.SB && SB.booted), err: !!document.getElementById('boot-error'), tickets: SB.store.getState().tickets.length, fonts: getComputedStyle(document.body).fontFamily, text: (document.querySelector('.fl') || document.body).innerText.length }));
    t.check('with the network off the page boots, shows the board and keeps the saved tickets', boot.booted && !boot.err && boot.tickets === n0 && n0 >= 4 && boot.text > 100, boot, 'lead');
    t.check('the font stack ends in a generic family so text shows without the web fonts', /(sans-serif|serif|monospace|system-ui)\s*$/.test(boot.fonts), boot.fonts, 'lead');
    await page.keyboard.press('n');
    const d = page.getByRole('dialog', { name: 'New ticket' });
    await d.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
    t.check('the New ticket sheet opens offline', await d.isVisible().catch(() => false), '', 'sheets');
    await closeSheets(page);
    await t.shot(page, 'offline-board');
    await ctx.setOffline(false);
  });

  h.test('10b-artifact-host', 'Host: node test/artifact.e2e.mjs still passes (artifact build in a mock host page at 1280 and 390)', { owner: 'lead', timeout: 170000 }, async (t) => {
    const out = await new Promise((resolve) => {
      const child = spawn(process.execPath, [path.join(h.ROOT, 'test/artifact.e2e.mjs')], { cwd: h.ROOT });
      let buf = '';
      child.stdout.on('data', (d) => { buf += d; }); child.stderr.on('data', (d) => { buf += d; });
      const to = setTimeout(() => { child.kill('SIGKILL'); resolve({ code: -1, buf: buf + '\n(timed out after 150 s)' }); }, 150000);
      child.on('close', (code) => { clearTimeout(to); resolve({ code, buf }); });
    });
    const lines = out.buf.split('\n');
    const fails = lines.filter((l) => /^FAIL/.test(l));
    const oks = lines.filter((l) => /^ok /.test(l)).length;
    t.note('artifact host checks passed', oks, 'checks');
    t.check('test/artifact.e2e.mjs exits 0 with no FAIL lines', out.code === 0 && fails.length === 0, { code: out.code, fails: fails.slice(0, 5), tail: lines.slice(-4).join(' | ') }, 'lead');
  });
}
