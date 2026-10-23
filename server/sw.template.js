/*
 * WHAT THIS FILE IS: The Smokebox service worker (served by server/server.mjs as /sw.js, with __VERSION__ replaced by a hash of the page file).
 *    It stores the app page when it is installed and serves that stored page for a visit to "/" or "/smokebox.html", so a tablet can open
 *    the app when the hub or the internet is down. It never touches anything else: /action, /follow, /events, /probe, /seed and every other
 *    request go straight to the network and are never stored.
 * PARTS: constants, fetching a checked page, install, activate, fetch, messages.
 * USES: nothing. USED BY: src/js/31-offline.js (the page side), tests.
 * SAFETY: a page is stored only if it is a plain 200 text/html answer, not a redirect, big enough, and contains the Smokebox title (so a
 *    login page or a captive portal can never replace the app). Any error while serving falls back to the network. A visit to ?nosw is
 *    never served from the store. An update is stored first and takes over only afterwards; the page is never reloaded by the worker.
 */
'use strict';
const VERSION = '__VERSION__';
const CACHE = 'smokebox-shell-' + VERSION;      // one store per version; older stores are deleted when this one is active
const SHELL = '/__smokebox_shell__';            // the fixed key the page is kept under
const PAGE_PATHS = ['/', '/smokebox.html'];
const NEVER = ['/action', '/follow', '/events', '/probe', '/seed'];   // listed for the reader; these are never intercepted
const MARKER = '<title>Smokebox KDS</title>';
const MIN_BYTES = 50000;

// Fetches the page from the network and checks that it really is the app. Throws if it is not.
async function fetchShell() {
  const res = await fetch('/', { cache: 'reload', credentials: 'same-origin' });
  if (!res.ok || res.redirected || res.status !== 200) throw new Error('not a plain answer');
  if (!/text\/html/i.test(res.headers.get('content-type') || '')) throw new Error('not html');
  const text = await res.clone().text();
  if (text.length < MIN_BYTES || text.indexOf(MARKER) < 0) throw new Error('not the Smokebox page');
  return res;
}
// Tells every open page something (best effort).
async function tell(msg) {
  const all = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
  for (const c of all) { try { c.postMessage(msg); } catch (e) { /* ignore */ } }
}
// The names of the stores that belong to this app.
async function ourCaches() { return (await caches.keys()).filter((k) => k.indexOf('smokebox-shell-') === 0); }

// Install: store the page first. If that fails (offline, or not the app) the install fails and the worker already in place stays.
self.addEventListener('install', (event) => {
  event.waitUntil(fetchShell().then((res) => caches.open(CACHE).then((c) => c.put(SHELL, res))).then(() => self.skipWaiting()));
});

// Activate: delete the stores of older versions, take over open pages, and say so if this replaced an older version.
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const mine = await ourCaches();
    const hadOld = mine.some((k) => k !== CACHE);
    for (const k of mine) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
    if (hadOld) await tell({ type: 'smokebox-update', version: VERSION });
  })());
});

// Fetch: only a visit to the page itself is answered here; everything else is left to the browser (network only).
self.addEventListener('fetch', (event) => {
  try {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    if (url.origin !== self.location.origin || NEVER.indexOf(url.pathname) >= 0) return;
    if (req.mode !== 'navigate' || PAGE_PATHS.indexOf(url.pathname) < 0) return;
    if (url.searchParams.has('nosw')) return;
    event.respondWith(serve(req).catch(() => fetch(req).catch(() => offlinePage())));
    event.waitUntil(self.registration.update().catch(() => {}));      // look for a newer worker while the stored page is shown
  } catch (e) { /* never break a visit: the browser goes to the network */ }
});
// The stored page if there is one (instantly); otherwise the network, keeping the answer if it is the app.
async function serve(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(SHELL);
  if (hit) return hit;
  const res = await fetch(req);
  try { const ok = await fetchShell(); await cache.put(SHELL, ok); } catch (e) { /* not storable: still show what came */ }
  return res;
}
// A plain page for a visit with no network and nothing stored yet.
function offlinePage() {
  return new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Smokebox</title>' +
    '<body style="font:18px system-ui;margin:2em;max-width:30em"><h1>Smokebox cannot open yet</h1><p>This tablet has no saved copy of the app and cannot reach it now. Connect to the hub or the internet and reload.</p></body>',
    { status: 503, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}

// Messages from the page: version (which version and whether the page can be read from the store), check (look for a newer worker), reset.
self.addEventListener('message', (event) => {
  const d = event.data || {}, port = event.ports && event.ports[0];
  const reply = (m) => { try { (port || event.source).postMessage(m); } catch (e) { /* ignore */ } };
  if (d.type === 'version') {
    event.waitUntil((async () => {
      let readable = false;
      try { const c = await caches.open(CACHE); const r = await c.match(SHELL); if (r) { const t = await r.clone().text(); readable = t.length >= MIN_BYTES && t.indexOf(MARKER) >= 0; } } catch (e) { readable = false; }
      reply({ type: 'smokebox-version', version: VERSION, readable });
    })());
  } else if (d.type === 'check') {
    event.waitUntil(self.registration.update().then(() => reply({ type: 'smokebox-checked' }), () => reply({ type: 'smokebox-checked', failed: true })));
  } else if (d.type === 'reset') {
    event.waitUntil((async () => { for (const k of await ourCaches()) await caches.delete(k); await self.registration.unregister(); reply({ type: 'smokebox-reset' }); })());
  }
});
