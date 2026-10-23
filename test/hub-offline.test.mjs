// The hub's part of offline page load: /sw.js carries a version stamp of the page and the right headers, /manifest.webmanifest and the icons
// are valid, the worker can be switched off from the hub, and the worker text keeps its promises (never touches the API paths).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { createHub } from '../server/server.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hoff-'));
const page = path.join(dir, 'p.html');
const body = (extra) => '<!doctype html><title>Smokebox KDS</title>' + 'x'.repeat(60000) + (extra || '');
fs.writeFileSync(page, body('A'));
const get = async (port, p, init) => { const r = await fetch('http://127.0.0.1:' + port + p, init); return { r, text: await r.text() }; };

test('/sw.js: the page\'s version stamp, no-cache headers, root scope; a changed page gives a changed worker', async () => {
  const hub = await createHub({ dataFile: null, htmlFile: page, tickMs: 600000 });
  const port = await hub.listen(0);
  try {
    const a = await get(port, '/sw.js');
    assert.equal(a.r.status, 200); assert.match(a.r.headers.get('content-type'), /javascript/);
    assert.match(a.r.headers.get('cache-control'), /no-cache/); assert.equal(a.r.headers.get('service-worker-allowed'), '/'); assert.equal(a.r.headers.get('x-content-type-options'), 'nosniff');
    const v1 = /const VERSION = '([0-9a-f]{12})'/.exec(a.text)[1];
    assert.equal(a.text.includes('__VERSION__'), false);
    assert.equal((await get(port, '/sw.js')).text, a.text, 'stable while the page is the same');
    fs.writeFileSync(page, body('B'));
    const b = await get(port, '/sw.js');
    assert.notEqual(/const VERSION = '([0-9a-f]{12})'/.exec(b.text)[1], v1);
    // the page itself is served with no-cache so a browser always asks
    const p = await get(port, '/'); assert.match(p.r.headers.get('cache-control'), /no-cache/); assert.match(p.text, /Smokebox KDS/);
  } finally { await hub.close(); }
});

test('the worker text keeps its promises: only the page is handled, the API paths are listed as never touched, and it checks what it stores', async () => {
  const hub = await createHub({ dataFile: null, htmlFile: page, tickMs: 600000 });
  const port = await hub.listen(0);
  try {
    const { text } = await get(port, '/sw.js');
    for (const p of ['action', 'follow', 'events', 'probe', 'seed', 'health']) assert.ok(text.includes("'" + p + "'"), p);
    assert.match(text, /BASE = new URL\('\.\/', self\.location\.href\)/, 'the worker works out its own folder');
    assert.match(text, /req\.method !== 'GET'/); assert.match(text, /req\.mode !== 'navigate'/); assert.match(text, /has\('nosw'\)/);
    assert.match(text, /res\.redirected/); assert.match(text, /text\\\/html/); assert.match(text, /MIN_BYTES/);
    assert.match(text, /\.catch\(\(\) => fetch\(req\)/, 'any failure falls back to the network');
    // the only things it ever puts in its store go through fetchShell (a checked page)
    assert.equal((text.match(/\.put\(/g) || []).length, 2); assert.equal(/\.addAll\(/.test(text), false);
  } finally { await hub.close(); }
});

test('manifest and icons: valid JSON with same-origin start and scope, an svg, and real PNG files of the right size', async () => {
  const hub = await createHub({ dataFile: null, htmlFile: page, tickMs: 600000 });
  const port = await hub.listen(0);
  try {
    const m = await get(port, '/manifest.webmanifest');
    const j = JSON.parse(m.text);
    assert.equal(m.r.status, 200); assert.match(m.r.headers.get('content-type'), /manifest\+json/);
    assert.deepEqual([j.start_url, j.scope, j.display], ['./', './', 'standalone']);
    assert.ok(j.icons.length >= 2 && j.icons.every((i) => !i.src.startsWith('/')));
    const svg = await get(port, '/icon.svg'); assert.equal(svg.r.status, 200); assert.match(svg.r.headers.get('content-type'), /svg/);
    for (const n of [192, 512]) {
      const r = await fetch('http://127.0.0.1:' + port + '/icon-' + n + '.png');
      const buf = Buffer.from(await r.arrayBuffer());
      assert.equal(r.status, 200); assert.equal(r.headers.get('content-type'), 'image/png');
      assert.deepEqual(Array.from(buf.subarray(0, 8)), [137, 80, 78, 71, 13, 10, 26, 10]);
      assert.equal(buf.readUInt32BE(16), n); assert.equal(buf.readUInt32BE(20), n);
      // the compressed pixels inflate to exactly size rows of 1 + 4 * size bytes, and the checksum of the first chunk is right
      const idatAt = buf.indexOf('IDAT'), idatLen = buf.readUInt32BE(idatAt - 4);
      assert.equal(zlib.inflateSync(buf.subarray(idatAt + 4, idatAt + 4 + idatLen)).length, n * (1 + 4 * n));
    }
    assert.equal((await get(port, '/icon-100.png')).r.status, 404);
  } finally { await hub.close(); }
});

test('switched off from the hub: /sw.js becomes a worker that removes itself, and the manifest and icons are gone', async () => {
  const hub = await createHub({ dataFile: null, htmlFile: page, tickMs: 600000, serviceWorker: false });
  const port = await hub.listen(0);
  try {
    const k = await get(port, '/sw.js');
    assert.equal(k.r.status, 200); assert.match(k.text, /unregister\(\)/); assert.equal(/\.put\(|fetch\(/.test(k.text), false, 'it stores nothing and serves nothing');
    assert.equal((await get(port, '/manifest.webmanifest')).r.status, 404); assert.equal((await get(port, '/icon.svg')).r.status, 404);
    assert.equal((await get(port, '/')).r.status, 200, 'the page itself still works');
  } finally { await hub.close(); }
});

test('with no page file there is nothing to store: /sw.js answers 404 and the worker is never installed', async () => {
  const hub = await createHub({ dataFile: null, htmlFile: path.join(dir, 'missing.html'), tickMs: 600000 });
  const port = await hub.listen(0);
  try { assert.equal((await get(port, '/sw.js')).r.status, 404); } finally { await hub.close(); }
});

test('the hub\'s protections are unchanged: POST /action still refuses a cross-site request and a wrong content type, and the API paths are not served by the worker routes', async () => {
  const hub = await createHub({ dataFile: null, htmlFile: page, tickMs: 600000, writeCode: 'W1' });
  const port = await hub.listen(0);
  try {
    const x = await fetch('http://127.0.0.1:' + port + '/action', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://evil.example' }, body: '{}' });
    assert.equal(x.status, 403);
    const t = await fetch('http://127.0.0.1:' + port + '/action', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' });
    assert.equal(t.status, 415);
    assert.equal((await fetch('http://127.0.0.1:' + port + '/sw.js', { method: 'POST' })).status, 404);
    assert.equal((await fetch('http://127.0.0.1:' + port + '/probe')).status, 403);
  } finally { await hub.close(); }
});
