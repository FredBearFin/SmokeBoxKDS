// WHAT THIS FILE IS: Test helpers for the hub prototype. hubTransport(port) is a store transport (the interface
// described in src/js/30-store.js) that talks to server/server.mjs over HTTP and server-sent events, and
// newClient(...) boots a second copy of the store in its own VM context so one test can run two "devices".
// PARTS: hubTransport, newClient. USES: src/js/*.js, the hub. USED BY: test/hub-sync.test.mjs.
// The transport adopts the hub's authoritative state on every change (message type 'state').
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { ROOT } from './_load.mjs';

/** hubTransport(port, clientId) -> a store transport plus setOnline(bool) to simulate losing the network. */
export function hubTransport(port, clientId) {
  let deliver = null, req = null, online = true, lastSeq = null, closed = false;
  const t = { name: 'hub-test', clientId, snapshots: 0 };

  // Reads one named event from the stream. A snapshot or state event hands the store the hub's whole state plus the
  // opIds already in it; the store adopts it and replays its own unconfirmed actions on top (store transport 'state' message).
  function onEvent(name, data) {
    if (typeof data.seq === 'number') lastSeq = data.seq;
    if (name === 'snapshot') t.snapshots++;
    if ((name === 'snapshot' || name === 'state') && deliver) deliver({ type: 'state', state: data.state, opIds: data.opIds });
  }
  // Opens the event stream (asking only for what was missed if we have been connected before).
  function connect() {
    if (!online || closed) return;
    const q = ''; // always ask for a full snapshot: the store adopts it (the hub's ?since= catch-up is not used here)
    req = http.get({ host: '127.0.0.1', port, path: '/events' + q }, (res) => {
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', (d) => {
        buf += d; let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, i); buf = buf.slice(i + 2);
          const ev = /^event: (.*)$/m.exec(block), da = /^data: (.*)$/m.exec(block);
          if (ev && da) onEvent(ev[1], JSON.parse(da[1]));
        }
      });
    });
    req.on('error', () => {});
  }
  // Sends one action to the hub and resolves with its HTTP status and parsed answer.
  function postAction(e) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify({ type: e.type, payload: e.payload, clientId, opId: e.opId, at: e.now });
      const r = http.request({ host: '127.0.0.1', port, path: '/action', method: 'POST', headers: { 'content-type': 'application/json' } }, (res) => {
        let s = ''; res.on('data', (c) => (s += c)); res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(s) }); } catch (er) { reject(er); } });
      });
      r.on('error', reject); r.end(data);
    });
  }
  t.open = (d) => { deliver = d; connect(); return true; };
  t.inject = (m) => deliver(m); // lets a test hand the store a message as if the hub had sent it
  t.post = () => true; // same-browser tab messages are not for the hub
  // Pushes the unconfirmed actions in order; every answered action (even a refusal) counts as confirmed.
  t.push = async (entries) => {
    if (!online) throw new Error('offline');
    const acked = [];
    for (const e of entries) { const r = await postAction(e); if (r.status === 200) acked.push(e.opId); else break; }
    return { acked };
  };
  t.close = () => { closed = true; if (req) req.destroy(); };
  // Simulates losing or regaining the network: going offline drops the stream and makes pushes fail.
  t.setOnline = (on) => { online = on; if (!on && req) { req.destroy(); req = null; } if (on && !req) connect(); };
  return t;
}

/** newClient(clock, storage) -> the store of a fresh VM context (a separate device) with the same engine files. */
export function newClient() {
  const ctx = { console, setTimeout, clearTimeout, setInterval, clearInterval };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of ['00-util.js', '10-config.js', '20-engine.js', '30-store.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8'), ctx, { filename: f });
  return ctx.SB.store;
}
