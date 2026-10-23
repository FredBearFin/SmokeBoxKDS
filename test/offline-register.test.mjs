// A second call to SB.offline.register() while the first is still installing must wait for the same answer (it used to return a false "not ok").
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { ROOT } from './_load.mjs';

// A fake browser with a service worker that takes a while to become ready.
function rig(delay) {
  const listeners = {};
  // A message channel that is just two plain objects (a real one keeps Node alive).
  class FakeChannel { constructor() { const p1 = {}; this.port1 = p1; this.port2 = { postMessage: (d) => setTimeout(() => p1.onmessage && p1.onmessage({ data: d }), 0) }; } }
  const worker = { postMessage(msg, ports) { ports[0].postMessage({ version: 'abc123abc123', readable: true }); } };
  const sw = {
    controller: null,
    addEventListener(n, f) { listeners[n] = f; },
    register: () => new Promise((r) => setTimeout(() => r({ active: worker, addEventListener() {}, update() {} }), delay)),
    get ready() { return new Promise((r) => setTimeout(() => r({ active: worker }), delay + 5)); },
    getRegistrations: async () => [],
  };
  const ctx = { console, setTimeout, clearTimeout, setInterval() { return 0; }, clearInterval() {}, MessageChannel: FakeChannel, navigator: { serviceWorker: sw }, location: { protocol: 'https:', search: '' }, isSecureContext: true };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/js/31-offline.js'), 'utf8'), ctx, { filename: '31-offline.js' });
  return ctx.SB.offline;
}

test('a second register() during installation waits for the same answer', async () => {
  const O = rig(50);
  const a = O.register(), b = O.register();
  assert.equal(a, b, 'one registration job');
  const [ra, rb] = await Promise.all([a, b]);
  assert.equal(ra.ok, true); assert.equal(rb.ok, true);
  assert.equal(O.status().state, 'ready');
});

test('a reset during installation stops the registration quietly', async () => {
  const O = rig(50);
  const a = O.register();
  await new Promise((r) => setTimeout(r, 10));
  await O.reset({ reload: false });
  const r = await a;
  assert.equal(r.ok, false); assert.equal(r.reason, 'reset');
  assert.equal(O.status().state, 'none');
});
