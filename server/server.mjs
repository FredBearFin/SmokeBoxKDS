#!/usr/bin/env node
// WHAT THIS FILE IS: PROTOTYPE hub for Smokebox. One small Node process that keeps the single kitchen state,
//    runs the pure engine on every action, and tells every connected screen what changed. It is not part of
//    the Solo offer and does not change dist/smokebox.html.
// PARTS: engine loading, persistence, createHub (state, dedupe, broadcast, tick, HTTP routes), command line start.
// USES: src/js engine files, dist/smokebox.html (served as the page). USED BY: server/README.md users, test/hub.test.mjs.
// ENV: PORT (default 8787), HOST (default 127.0.0.1), SMOKEBOX_TZ (process time zone), SMOKEBOX_DATA (JSON file),
//    SMOKEBOX_HTML (page to serve),
//    SMOKEBOX_STARTER=1 (start with the demo stock instead of an empty kitchen).

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import net from 'node:net';
import { createScreens, WORDS } from './screens.mjs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Sets the process time zone from SMOKEBOX_TZ before any date maths runs, because the engine's service
// day (4 am rollover) uses local time.
if (process.env.SMOKEBOX_TZ) process.env.TZ = process.env.SMOKEBOX_TZ;

// Loads the pure engine files into globalThis.SB the same way test/_load.mjs does, and returns SB.
async function loadEngine() {
  for (const n of ['00-util', '10-config', '20-engine']) await import(pathToFileURL(path.join(ROOT, 'src/js', n + '.js')).href);
  return globalThis.SB;
}

// Offline page load: the service worker template (version stamp filled in per request), the small web manifest and the icons.
const SW_TEMPLATE = path.join(ROOT, 'server', 'sw.template.js');
// A worker that removes itself and the app's stores: served when the hub is started with the service worker off, so a tablet that has the
// worker can be cleaned from the hub side the next time it checks for a newer worker. It never reloads a page.
const SW_KILL = "'use strict';\nself.addEventListener('install', () => self.skipWaiting());\nself.addEventListener('activate', (event) => { event.waitUntil((async () => { for (const k of await caches.keys()) if (k.indexOf('smokebox-') === 0) await caches.delete(k); await self.registration.unregister(); })()); });\n";
// The app icon as a vector picture: a warm square with a flame-like shape.
const ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="96" fill="#b4452a"/><path d="M256 96c30 70 96 104 96 190a96 96 0 0 1-192 0c0-52 34-72 52-112 12 22 20 34 34 40-8-40 0-78 10-118z" fill="#f7e6c4"/></svg>';
// Builds a plain PNG of the icon at a size: a warm square with a light circle, no outside libraries.
function iconPng(size) {
  const crcTable = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; }
  // CRC-32 of a buffer, as PNG chunks need.
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  // One PNG chunk: length, type, data and checksum.
  const chunk = (type, data) => { const t = Buffer.from(type), len = Buffer.alloc(4), cr = Buffer.alloc(4); len.writeUInt32BE(data.length); cr.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, cr]); };
  const rows = [], r = size * 0.22, cx = size / 2, cy = size * 0.58, rad = size * 0.27;
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);
    for (let x = 0; x < size; x++) {
      const dx = Math.max(r - x, 0, x - (size - 1 - r)), dy = Math.max(r - y, 0, y - (size - 1 - r));
      const inside = dx * dx + dy * dy <= r * r;
      const inCircle = (x - cx) * (x - cx) + (y - cy) * (y - cy) <= rad * rad;
      const o = 1 + x * 4;
      if (!inside) { row[o + 3] = 0; continue; }
      const c = inCircle ? [247, 230, 196] : [180, 69, 42];
      row[o] = c[0]; row[o + 1] = c[1]; row[o + 2] = c[2]; row[o + 3] = 255;
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}

// The follower stream version: a follower that expects another number is told 'wrongVersion' and stops.
const PROTO = 1;
// The oldest client protocol the hub still accepts when a client says its own (x-smokebox-client). 0 accepts any client, including ones that say nothing.
const DEFAULT_MIN_CLIENT = 0;

// Reads the saved JSON file and checks it with the engine's validateBackup; returns { state, seq, hubId } or null.
function loadSaved(E, file) {
  if (!file || !fs.existsSync(file)) return null;
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    const v = E.validateBackup(saved.state);
    if (!v.ok) { console.warn('[hub] saved file refused: ' + v.error); return null; }
    return { state: v.state, seq: Number.isInteger(saved.seq) ? saved.seq : 0, hubId: typeof saved.hubId === 'string' ? saved.hubId : null, seeded: saved.seeded === true };
  } catch (e) { console.warn('[hub] saved file unreadable: ' + e.message); return null; }
}

// Writes state and seq to the JSON file through a temp file and a rename, so a crash never leaves half a file.
function writeSaved(file, state, seq, hubId, seeded) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify({ v: 1, seq, hubId, seeded: seeded === true, state }));
  fs.renameSync(tmp, file);
}

/** createHub(opts) -> { server, listen(port), close(), snapshot() }. Options: starter (demo stock; default empty like a real first run), dataFile, htmlFile, tickMs, heartbeatMs, saveMs, now. */
export async function createHub(opts = {}) {
  const SB = await loadEngine();
  const E = SB.engine;
  const now = opts.now || (() => Date.now());
  const tickMs = opts.tickMs ?? 1000, heartbeatMs = opts.heartbeatMs ?? 15000, saveMs = opts.saveMs ?? 500;
  const htmlFile = opts.htmlFile || process.env.SMOKEBOX_HTML || path.join(ROOT, 'dist/smokebox.html');
  const dataFile = opts.dataFile === undefined ? process.env.SMOKEBOX_DATA : opts.dataFile;
  const saved = loadSaved(E, dataFile);
  let state = saved ? saved.state : E.newState({ now: now(), starter: opts.starter ?? process.env.SMOKEBOX_STARTER === '1' });
  let seq = saved ? saved.seq : 0;
  // A name for this kitchen's history. It stays the same across restarts (it is saved with the state), and changes only when the
  // history is lost, so a follower that remembers a change number from a different history is sent a fresh snapshot instead.
  let hubId = (saved && saved.hubId) || crypto.randomBytes(6).toString('hex');
  let seeded = !!(saved && saved.seeded);   // true once a device sent its kitchen here: the hub is no longer "empty" even at change number 0
  const followCode = opts.followCode !== undefined ? opts.followCode : (process.env.SMOKEBOX_FOLLOW_CODE || '');
  // The code a screen needs to change anything (write actions, send its kitchen). Empty means writing needs no code (a trusted network).
  const writeCode = opts.writeCode !== undefined ? opts.writeCode : (process.env.SMOKEBOX_WRITE_CODE || '');
  const walFile = opts.walFile !== undefined ? opts.walFile : (dataFile ? dataFile + '.wal' : null);
  // Per-screen tokens: with requireTokens every read and write needs a valid token; without it a token is optional but, when given, must be valid.
  const requireTokens = opts.requireTokens !== undefined ? !!opts.requireTokens : (process.env.SMOKEBOX_REQUIRE_TOKENS === '1' || process.env.SMOKEBOX_REQUIRE_TOKEN === '1');
  const minClient = opts.minClient !== undefined ? opts.minClient : (Number(process.env.SMOKEBOX_MIN_CLIENT) || DEFAULT_MIN_CLIENT);
  const screensFile = opts.screensFile !== undefined ? opts.screensFile : (dataFile ? dataFile + '.screens' : null);
  // Removing a screen cuts its open streams at once (cutScreen is defined below).
  const cutOnRevoke = (id) => cutScreen(id);
  const screens = createScreens({ file: screensFile, now, pairMs: opts.pairMs, onRevoke: cutOnRevoke });
  // The owner's key for the hub's admin calls (pair, list, remove). Kept in a file next to the data (owner-only) or given; never sent to a screen.
  const adminFile = dataFile ? dataFile + '.admin' : null;
  const adminKey = opts.adminKey || process.env.SMOKEBOX_ADMIN_KEY || (() => {
    if (adminFile && fs.existsSync(adminFile)) { try { const k = fs.readFileSync(adminFile, 'utf8').trim(); if (k.length >= 32) return k; } catch (e) { /* make a new one */ } }
    const k = crypto.randomBytes(24).toString('hex');
    if (adminFile) { try { fs.writeFileSync(adminFile, k + '\n', { mode: 0o600 }); } catch (e) { console.warn('[hub] could not save the admin key: ' + e.message); } }
    return k;
  })();
  const streamScreen = new WeakMap();   // an open stream -> the id of the screen that opened it, so removing a screen cuts it off at once
  const clients = new Set();
  const followers = new Set();
  // Offline page load can be switched off (option serviceWorker:false or SMOKEBOX_NO_SW=1): then /sw.js is a worker that removes itself.
  const swOn = opts.serviceWorker !== undefined ? opts.serviceWorker !== false : process.env.SMOKEBOX_NO_SW !== '1';
  let pageStamp = null;       // { key, version }: the hash of the page file, worked out again only when the file changes
  // The version stamp of the page being served: a short hash of the page file (null if the file is missing).
  function pageVersion() {
    try {
      const st = fs.statSync(htmlFile), key = st.mtimeMs + ':' + st.size;
      if (!pageStamp || pageStamp.key !== key) pageStamp = { key, version: crypto.createHash('sha256').update(fs.readFileSync(htmlFile)).digest('hex').slice(0, 12) };
      return pageStamp.version;
    } catch (e) { return null; }
  }
  const pngCache = new Map();
  // Answers the offline-load requests (/sw.js, /manifest.webmanifest, the icons). Returns true when the request was one of them.
  function handleOffline(req, res, url) {
    if (req.method !== 'GET') return false;
    const base = { 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' };
    if (url === '/sw.js') {
      const v = pageVersion();
      if (!swOn || !v) {
        res.writeHead(swOn ? 404 : 200, Object.assign({ 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-cache, no-store, must-revalidate' }, base));
        res.end(swOn ? 'no page to store' : SW_KILL);
        return true;
      }
      let src = null;
      try { src = fs.readFileSync(SW_TEMPLATE, 'utf8'); } catch (e) { src = null; }       // a missing worker file is a 404, never a crash
      if (src === null) { res.writeHead(404, Object.assign({ 'content-type': 'text/plain' }, base)); res.end('no worker file'); return true; }
      res.writeHead(200, Object.assign({ 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-cache, no-store, must-revalidate', 'service-worker-allowed': '/' }, base));
      res.end(src.split('__VERSION__').join(v));
      return true;
    }
    if (!swOn) return false;
    if (url === '/manifest.webmanifest') {
      res.writeHead(200, Object.assign({ 'content-type': 'application/manifest+json; charset=utf-8', 'cache-control': 'no-cache' }, base));
      res.end(JSON.stringify({ name: 'Smokebox', short_name: 'Smokebox', start_url: './', scope: './', display: 'standalone', background_color: '#1b1511', theme_color: '#b4452a',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' }, { src: 'icon-192.png', sizes: '192x192', type: 'image/png' }, { src: 'icon-512.png', sizes: '512x512', type: 'image/png' }] }));
      return true;
    }
    if (url === '/icon.svg') { res.writeHead(200, Object.assign({ 'content-type': 'image/svg+xml', 'cache-control': 'public, max-age=86400' }, base)); res.end(ICON_SVG); return true; }
    const m = /^\/icon-(192|512)\.png$/.exec(url);
    if (m) {
      if (!pngCache.has(m[1])) pngCache.set(m[1], iconPng(Number(m[1])));
      res.writeHead(200, Object.assign({ 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' }, base));
      res.end(pngCache.get(m[1]));
      return true;
    }
    return false;
  }
  const ops = []; // recent applied actions {seq, opId, actionType, payload, now, by}, so a returning screen can catch up
  const MAX_OPS = opts.maxOps ?? 5000;
  let lastAt = 0; // the time of the last applied action; action times never go backwards
  // Undo with several screens: which action made each undo entry, and which action was applied last (ticks and screen reports do not count).
  const undoOwner = new Map();
  let lastActionKey = null;
  const WAL_KEEP = 1000, WAL_COMPACT_AT = 3000; // lines kept after a save, and how many lines trigger a rewrite
  let walFd = null, walLines = 0;
  const replies = new Map(); // opId -> reply already given, so a resend is answered but not applied twice
  const MAX_REPLIES = 5000;
  // Hard limits so one misbehaving screen cannot use up the hub's memory: the biggest action body, the most connected screens, and the
  // most bytes the recent-actions log may hold (oldest dropped first).
  const MAX_BODY = opts.maxBody ?? 256 * 1024, MAX_CLIENTS = opts.maxClients ?? 100, MAX_OPS_BYTES = opts.maxOpsBytes ?? 8 * 1024 * 1024;
  let opsBytes = 0;
  let saveTimer = null, dirty = false;

  // The write-ahead record: one JSON line per applied action or state-changing tick, written before the action is answered. An action is
  // acknowledged only after its line (with the action's id and answer) is on disk, so a restart can never forget an answered action or
  // apply a resent one twice. Replay on start puts back everything after the last saved state.
  function walOpen() {
    if (!walFile || walFd !== null) return;
    walFd = fs.openSync(walFile, 'a');
  }
  // Appends one entry; sync true waits until the disk has it. Throws when it cannot, and the caller then refuses the action.
  function walAppend(entry, sync) {
    if (!walFile) return;
    walOpen();
    fs.writeSync(walFd, JSON.stringify(entry) + '\n');
    if (sync) fs.fsyncSync(walFd);
    walLines++;
  }
  // After the state file holds everything up to seq, rewrites the record to just the recent entries (enough to resume a screen that was away briefly).
  function walCompact() {
    if (!walFile || walLines < WAL_COMPACT_AT) return;
    const keep = ops.filter((o) => o.seq > seq - WAL_KEEP);
    const tmp = walFile + '.tmp';
    fs.writeFileSync(tmp, keep.map((o) => JSON.stringify(walEntry(o))).join('\n') + (keep.length ? '\n' : ''));
    if (walFd !== null) { try { fs.closeSync(walFd); } catch (e) { /* ignore */ } walFd = null; }
    fs.renameSync(tmp, walFile);
    walLines = keep.length;
  }
  // The shape stored in the record and in the log of recent actions.
  const walEntry = (o) => ({ seq: o.seq, opId: o.opId, type: o.actionType, payload: o.payload, now: o.now, by: o.by, screen: o.screen, info: o.info });
  // Reads the record and puts back what the state file does not have yet: replays each entry through the engine in order, and rebuilds the
  // recent log and the answers already given. A damaged last line (a crash mid-write) is ignored. Returns how many entries were replayed.
  function walReplay() {
    if (!walFile || !fs.existsSync(walFile)) return 0;
    let n = 0;
    const lines = fs.readFileSync(walFile, 'utf8').split('\n');
    for (const line of lines) {
      if (!line) continue;
      let e;
      try { e = JSON.parse(line); } catch (err) { console.warn('[hub] a damaged record line was ignored'); continue; }
      // An answered refusal: remembered so a resent action id gets the same answer after a restart.
      if (e && e.ref === true && typeof e.opId === 'string') { replies.set(e.opId, { ok: false, report: e.report, info: e.info ?? {}, seq: e.seq, words: E.describe(e.report, e.info ?? {}) }); if (replies.size > MAX_REPLIES) replies.delete(replies.keys().next().value); continue; }
      if (!e || !Number.isInteger(e.seq) || typeof e.type !== 'string') continue;
      walLines++;
      if (e.seq <= seq) { remember(e); continue; }        // already in the saved state: only the log and the answers are rebuilt
      if (e.seq !== seq + 1) { console.warn('[hub] a gap in the record at ' + e.seq + '; replay stopped'); break; }
      const r = e.type === 'tick' ? { report: 'ok', state: E.tick(state, e.now).state } : E.apply(state, e.type, e.payload, e.now, { screen: e.screen });
      if (r.report !== 'ok') { console.warn('[hub] record entry ' + e.seq + ' did not replay (' + r.report + '); replay stopped'); break; }
      state = r.state; seq = e.seq; lastAt = Math.max(lastAt, e.now); n++;
      noteApplied(e.opId || 'seq:' + e.seq, e.type, state, e.by || null);
      remember(e);
    }
    return n;
  }
  // After an action was applied: remembers which action made the newest undo entry and which action is now the last one.
  function noteApplied(key, type, newState, by) {
    if (type === 'tick' || type === 'uiReport') return;
    lastActionKey = key;
    const u = Array.isArray(newState.undo) ? newState.undo : [];
    const top = u.length ? u[u.length - 1] : null;
    if (top && typeof top.id === 'string' && !undoOwner.has(top.id)) undoOwner.set(top.id, { key, by: by || null });
    if (undoOwner.size > 400) { const live = new Set(u.map((x) => x.id)); for (const k of Array.from(undoOwner.keys())) if (!live.has(k)) undoOwner.delete(k); }
  }
  // Keeps a replayed or applied entry in the recent log and, when it has an action id, its answer.
  function remember(e) {
    const op = { seq: e.seq, opId: e.opId || null, actionType: e.type, payload: e.payload ?? {}, now: e.now, by: e.by ?? null, screen: e.screen || undefined, info: e.info, rev: state && state.rev };
    op.bytes = JSON.stringify(op).length;
    ops.push(op); opsBytes += op.bytes;
    while (ops.length > MAX_OPS || (opsBytes > MAX_OPS_BYTES && ops.length > 1)) opsBytes -= ops.shift().bytes || 0;
    if (op.opId) { replies.set(op.opId, { ok: true, report: 'ok', info: op.info ?? {}, seq: op.seq }); if (replies.size > MAX_REPLIES) replies.delete(replies.keys().next().value); }
    return op;
  }

  // Writes the file soon (one write per burst of changes) when a data file is set.
  function scheduleSave() {
    if (!dataFile) return;
    dirty = true;
    if (saveTimer) return;
    saveTimer = setTimeout(() => { saveTimer = null; flush(); }, saveMs);
  }
  // Writes the file right now if anything changed since the last write.
  function flush() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    if (dataFile && dirty) { dirty = false; try { writeSaved(dataFile, state, seq, hubId, seeded); walCompact(); } catch (e) { console.warn('[hub] save failed: ' + e.message); } }
  }
  // Builds the message every screen gets: the whole state, the hub clock and the change counter.
  // opIds lists the actions in the recent log, so a screen knows which of its own unconfirmed actions are already in this state.
  const view = (extra) => Object.assign({ state, serverNow: now(), seq, hubId, opIds: ops.map((o) => o.opId).filter(Boolean) }, extra || {});
  // Sends one server-sent event (a named message with a JSON body) to one connected screen.
  const send = (res, event, data) => res.write('event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n');
  // Counts one more change, tells every connected screen, and queues a save.
  function changed(extra) {
    seq++;
    for (const res of clients) send(res, 'state', view(extra));
    if (extra && extra.op) {
      const m = opMessage(extra.op);
      for (const res of Array.from(followers)) {
        // A follower that cannot keep up is dropped (it reconnects and resumes) rather than letting the hub's memory grow.
        if (res.writableLength > MAX_FOLLOW_BACKLOG) { followers.delete(res); res.destroy(); continue; }
        send(res, 'op', m);
      }
    }
    scheduleSave();
  }
  const MAX_FOLLOW_BACKLOG = 4 * 1024 * 1024;
  // What a follower receives for one applied action or tick: its place in the order, what it was, and the hub clock.
  const opMessage = (o) => ({ seq: o.seq, opId: o.opId, type: o.actionType, payload: o.payload, now: o.now, by: o.by, screen: o.screen, rev: o.rev, serverNow: now() });

  // Runs one action through the engine with the hub clock; repeats of a known opId get the first answer back.
  function runAction(body) {
    const { type, payload, clientId, opId, at } = body || {};
    // The screen's name (not a security feature): short plain text, stamped on the events the action makes.
    const screen = typeof body.who === 'string' ? body.who.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 20) : '';
    if (typeof type !== 'string') return { status: 400, body: { report: 'unknownAction', info: {}, seq } };
    if (typeof opId === 'string' && replies.has(opId)) return { status: 200, body: Object.assign({}, replies.get(opId), { duplicate: true }) };
    // A client may say when it did the action (a queued action replayed after being offline). The hub trusts that
    // time only between the last applied action and its own clock, so time never runs backwards or into the future.
    const t = typeof at === 'number' && isFinite(at) ? Math.min(now(), Math.max(lastAt, at)) : Math.max(lastAt, now());
    let r = E.apply(state, type, payload, t, { screen });
    // Undo with several screens: allowed only when the newest undo entry was made by the action the caller names and that action is still the last
    // one applied. Anything else means someone else changed the kitchen since, and the undo is refused.
    if (type === 'undo' && r.report === 'ok') {
      const u = Array.isArray(state.undo) ? state.undo : [], top = u.length ? u[u.length - 1] : null;
      const owner = top ? undoOwner.get(top.id) : null;
      const named = payload && typeof payload.ofOpId === 'string' ? payload.ofOpId : null;
      if (!owner || named !== owner.key || lastActionKey !== owner.key || owner.by !== (typeof clientId === 'string' ? clientId : null)) r = { state, report: 'undoElsewhere', events: [], info: {} };
    }
    let reply;
    if (r.report === 'ok') {
      const by = typeof clientId === 'string' ? clientId : null;
      const entry = { seq: seq + 1, opId: typeof opId === 'string' ? opId : null, type, payload: payload ?? {}, now: t, by, screen: screen || undefined, info: r.info };
      // Durable first: if the record cannot be written the action is not applied and not acknowledged.
      try { walAppend(entry, true); } catch (e) { console.warn('[hub] could not record an action: ' + e.message); return { status: 500, body: { report: 'badPatch', info: { error: 'could not record the action' }, seq } }; }
      state = r.state;
      lastAt = t;
      noteApplied(entry.opId || 'seq:' + entry.seq, type, state, entry.by);
      const op = remember(entry);
      changed({ by, opId: op.opId, type, op });
      reply = { ok: true, report: 'ok', info: r.info, seq };
    } else {
      reply = { ok: false, report: r.report, info: r.info, seq, words: E.describe(r.report, r.info) };
      // A refusal with an action id is recorded too, so the same id gets the same answer after a restart.
      if (typeof opId === 'string') { try { walAppend({ ref: true, opId, report: r.report, info: r.info, seq }, true); } catch (e) { /* the answer is still given, only not durable */ } }
    }
    if (typeof opId === 'string') {
      replies.set(opId, reply);
      if (replies.size > MAX_REPLIES) replies.delete(replies.keys().next().value);
    }
    return { status: 200, body: reply };
  }

  // Reads a request body up to MAX_BODY bytes and calls back with the parsed JSON (or null if it is not JSON). A bigger body is answered
  // with 413 at once and the connection is closed, so nothing large is ever held. A Content-Length that is already too big is refused up front.
  function readJson(req, res, cb, maxBody) {
    const LIMIT = maxBody || MAX_BODY;
    let n = 0, done = false; const chunks = [];
    // Refuses a request that is too large: answers 413 once and closes the connection.
    const tooBig = () => {
      if (done) return; done = true;
      res.writeHead(413, { 'content-type': 'application/json', connection: 'close' });
      res.end(JSON.stringify({ report: 'badPatch', info: { error: 'body too large', max: LIMIT }, seq }), () => req.destroy());
    };
    if (Number(req.headers['content-length']) > LIMIT) return tooBig();
    req.on('data', (c) => { n += c.length; if (n > LIMIT) tooBig(); else if (!done) chunks.push(c); });
    req.on('end', () => {
      if (done) return; done = true;
      let body = null;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (e) { body = null; }
      cb(body);
    });
    req.on('error', () => { done = true; });
  }

  const failures = new Map(); // remote address -> { n, until }: wrong access codes are counted so a code cannot be guessed quickly
  const FAIL_MAX = 10, FAIL_LOCK_MS = 60000;
  // True when the given code equals the hub's access code (compared without leaking where they differ).
  function codeEq(given, want) {
    const a = crypto.createHash('sha256').update(String(given || '')).digest(), b = crypto.createHash('sha256').update(String(want)).digest();
    return crypto.timingSafeEqual(a, b);
  }
  // True when a reading screen's code is right: either code opens the stream (a writing screen also reads), and no code set means open.
  const readOk = (given) => (!followCode && !writeCode) || (!!followCode && codeEq(given, followCode)) || (!!writeCode && codeEq(given, writeCode));
  // True when a writing screen's code is right (no write code set means open).
  const writeOk = (given) => !writeCode || codeEq(given, writeCode);
  // Behind a reverse proxy every screen reaches the hub from 127.0.0.1. With SMOKEBOX_TRUST_PROXY=1 the real address is read from X-Forwarded-For, but only
  // when the connection itself comes from this computer (loopback): from anywhere else the header is ignored, so a screen cannot pick its own address. The
  // last entry is used (the one the proxy added), never the first (which the client can write), and it must be a real IP address.
  const gzipOn = opts.gzip !== undefined ? opts.gzip !== false : process.env.SMOKEBOX_NO_GZIP !== '1';
  const startedAt = Date.now();
  const trustProxy = opts.trustProxy !== undefined ? !!opts.trustProxy : process.env.SMOKEBOX_TRUST_PROXY === '1';
  // The address used for the per-address limits.
  function addrOf(req) {
    const direct = req.socket.remoteAddress || '?';
    if (!trustProxy || !(direct === '127.0.0.1' || direct === '::1' || direct === '::ffff:127.0.0.1')) return direct;
    const xff = req.headers['x-forwarded-for'];
    if (typeof xff !== 'string' || xff.length > 500) return direct;
    const last = xff.split(',').pop().trim().replace(/^::ffff:/, '');
    return net.isIP(last) ? last : direct;
  }
  // Reads the token header and checks it. Returns { screen } (a valid token), { none: true } (no token and none needed), or { fail: { status, report } }.
  function authReq(req) {
    const raw = req.headers['x-smokebox-token'];
    if (raw === undefined || raw === '') return requireTokens ? { fail: { status: 403, report: 'unpaired' } } : { none: true };
    const a = screens.authenticate(raw);
    if (a.screen) { screens.touch(a.screen); return { screen: a.screen }; }
    return { fail: { status: 403, report: a.report } };
  }
  // The version check: a client that says its protocol is older than the hub's minimum is refused with plain words.
  function versionFail(req) {
    if (!(minClient > 0)) return null;
    const n = Number(req.headers['x-smokebox-client']);
    return n >= minClient ? null : { status: 426, report: 'wrongVersion' };
  }
  // Cuts every open stream of a screen (used when the screen is removed).
  function cutScreen(id) { for (const set of [clients, followers]) for (const r of Array.from(set)) if (streamScreen.get(r) === id) { set.delete(r); r.destroy(); } }
  // The same-origin and content-type check for posted JSON; returns true when the request may go on.
  function postGuard(req, res) {
    const ct = String(req.headers['content-type'] || '').toLowerCase(), origin = req.headers.origin;
    let same = true;
    if (origin) { try { same = new URL(origin).host === req.headers.host; } catch (e) { same = false; } }
    if (ct.startsWith('application/json') && same) return true;
    res.writeHead(!same ? 403 : 415, { 'content-type': 'application/json', connection: 'close' });
    res.end(JSON.stringify({ ok: false, report: 'badPatch', info: { error: !same ? 'cross-site request refused' : 'content-type must be application/json' } }));
    req.resume();
    return false;
  }
  // True when the caller said it accepts gzip and compression is not switched off.
  const wantsGzip = (req) => gzipOn && /\bgzip\b/i.test(String(req.headers['accept-encoding'] || ''));
  // Turns a streaming answer into a gzip stream that is flushed after every write, so each event still arrives at once.
  function gzipStream(req, res) {
    const gz = zlib.createGzip({ level: 6 }), rawWrite = res.write.bind(res), rawEnd = res.end.bind(res);
    gz.on('data', (c) => rawWrite(c));
    gz.on('end', () => rawEnd());
    // Compresses what is written and flushes it at once, so an event is never held back.
    res.write = (c) => { if (!gz.destroyed && !gz.writableEnded) { gz.write(c); gz.flush(zlib.constants.Z_SYNC_FLUSH); } return true; };
    res.end = () => { if (!gz.destroyed && !gz.writableEnded) gz.end(); else rawEnd(); return res; };
    res.on('close', () => gz.destroy());
  }
  // Writes a JSON answer with a status.
  function sendJson(res, code, body, extra) { res.writeHead(code, Object.assign({ 'content-type': 'application/json' }, extra || {})); res.end(JSON.stringify(body)); }
  // Writes a refusal with a stable code and plain words.
  function refuse(res, status, report, extra) { sendJson(res, status, Object.assign({ ok: false, error: report, report, words: WORDS[report] || report, info: {}, seq }, extra || {})); }
  // The access code a read request carries: the x-smokebox-code header (kept out of addresses and logs), or the code in the address.
  const codeFrom = (req, q) => String(req.headers['x-smokebox-code'] || q.get('code') || '');
  // Counts a wrong code against the caller's address and returns the status to answer (403, or 429 while locked); null when fine to try.
  function lockState(who) {
    const f = failures.get(who);
    return f && f.until > Date.now() ? 429 : null;
  }
  // Records one wrong code for an address; ten in a row lock it for a minute.
  function noteFailure(who) {
    const f = failures.get(who);
    const n = (f ? (f.until && f.until <= Date.now() ? 0 : f.n) : 0) + 1;
    failures.set(who, { n, until: n >= FAIL_MAX ? Date.now() + FAIL_LOCK_MS : 0 });
    if (failures.size > 1000) failures.delete(failures.keys().next().value);
  }
  // Answers a read-only follower: checks the access code, then sends hello, then either a snapshot or the ordered actions it missed (if the
  // log still reaches back and is smaller than a snapshot), then every new action as it is applied. It can never write.
  function handleFollow(req, res) {
    const q = new URL(req.url, 'http://x').searchParams;
    const cors = followCode || writeCode || requireTokens ? { 'access-control-allow-origin': '*' } : {};
    // Answers a refused follower with a status and a short reason in JSON, then closes the connection.
    const fail = (code, error, extra) => { res.writeHead(code, Object.assign({ 'content-type': 'application/json', connection: 'close' }, cors, extra || {})); res.end(JSON.stringify({ error })); };
    const who = addrOf(req);
    const vf = versionFail(req);
    if (vf) return refuse(res, vf.status, vf.report, cors);
    const au = authReq(req);
    if (au.fail) return refuse(res, au.fail.status, au.fail.report, cors);
    if (!au.screen && (followCode || writeCode)) {
      if (lockState(who)) return fail(429, 'tooManyTries', { 'retry-after': '60' });
      if (!readOk(codeFrom(req, q))) { noteFailure(who); return fail(403, 'badCode'); }
      failures.delete(who);
    }
    if (clients.size + followers.size >= MAX_CLIENTS) return fail(503, 'tooMany', { 'retry-after': '10' });
    const gzip = wantsGzip(req);
    const trimDays = (() => { const n = Number(q.get('trim')); return q.get('trim') !== null && Number.isInteger(n) && n >= 1 && n <= 365 ? n : 0; })();
    res.writeHead(200, Object.assign({ 'content-type': 'text/event-stream', 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff', connection: 'keep-alive' }, gzip ? { 'content-encoding': 'gzip', vary: 'Accept-Encoding' } : {}, cors));
    if (gzip) gzipStream(req, res);
    followers.add(res);
    if (au.screen) streamScreen.set(res, au.screen.id);
    req.on('close', () => followers.delete(res));
    send(res, 'hello', { proto: PROTO, minClient, hubId, seq, serverNow: now() });
    const sinceText = q.get('since'), since = sinceText === null || sinceText === '' ? NaN : Number(sinceText);
    const sameHub = q.get('hub') === hubId;
    const missed = Number.isInteger(since) && since >= 0 && since <= seq && sameHub && (since === seq || (ops.length && ops[0].seq <= since + 1)) ? ops.filter((o) => o.seq > since) : null;
    // Resuming is only worth it while the missed actions are smaller than a snapshot would be.
    const stateBytes = missed && missed.length ? JSON.stringify(state).length : 0;
    if (missed && (missed.length === 0 || missed.reduce((a, o) => a + (o.bytes || 0), 0) <= stateBytes)) {
      for (const o of missed) send(res, 'op', opMessage(o));
      send(res, 'resumed', { seq, hubId, count: missed.length, serverNow: now() });
    } else {
      // A screen that asked for ?trim=<days> gets only the recent part of the kitchen; the hub keeps everything.
      const t = trimDays ? E.trimState(state, now(), trimDays) : null;
      send(res, 'snapshot', Object.assign({ state: t ? t.state : state, seq, hubId, proto: PROTO, serverNow: now(), opIds: ops.slice(-1000).map((o) => o.opId).filter(Boolean) }, t && t.trimmed ? { trimmed: t.trimmed } : {}));
    }
  }
  // Tells a screen about this hub without joining: its protocol, its history name, and whether it is empty (no action ever applied and
  // no kitchen sent to it), so a device can decide whether it may send its own kitchen here.
  function handleProbe(req, res) {
    const q = new URL(req.url, 'http://x').searchParams;
    const cors = followCode || writeCode || requireTokens ? { 'access-control-allow-origin': '*' } : {};
    const who = addrOf(req);
    // Writes one JSON answer with the given status.
    const answer = (code, body) => {
      const text = JSON.stringify(body);
      if (wantsGzip(req) && text.length > 1024) { res.writeHead(code, Object.assign({ 'content-type': 'application/json', 'content-encoding': 'gzip', vary: 'Accept-Encoding' }, cors)); res.end(zlib.gzipSync(text)); return; }
      res.writeHead(code, Object.assign({ 'content-type': 'application/json' }, cors)); res.end(text);
    };
    const vf = versionFail(req);
    if (vf) return answer(vf.status, { error: vf.report, report: vf.report, words: WORDS[vf.report], tokensRequired: requireTokens, minClient });
    const au = authReq(req);
    if (au.fail) return answer(au.fail.status, { error: au.fail.report, report: au.fail.report, words: WORDS[au.fail.report], tokensRequired: requireTokens, minClient });
    if (!au.screen && (followCode || writeCode)) {
      if (lockState(who)) return answer(429, { error: 'tooManyTries' });
      if (!readOk(codeFrom(req, q))) { noteFailure(who); return answer(403, { error: 'badCode' }); }
      failures.delete(who);
    }
    answer(200, { proto: PROTO, minClient, tokensRequired: requireTokens, hubId, seq, empty: seq === 0 && !seeded, serverNow: now() });
  }
  // A device sends its whole kitchen to an empty hub (change number 0, nothing seeded before). Needs the write code; refuses with 409
  // notEmpty otherwise. The hub starts a new history from it: new history name, every connected stream is ended so screens take a fresh
  // snapshot, and the record is reset. Same-origin and JSON only, like actions.
  function handleSeed(req, res) {
    const ct = String(req.headers['content-type'] || '').toLowerCase(), origin = req.headers.origin;
    let sameOrigin = true;
    if (origin) { try { sameOrigin = new URL(origin).host === req.headers.host; } catch (e) { sameOrigin = false; } }
    // Writes one JSON answer with the given status.
    const reply = (code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (!ct.startsWith('application/json') || !sameOrigin) { req.resume(); return reply(!sameOrigin ? 403 : 415, { ok: false, report: 'badPatch', info: { error: 'refused' } }); }
    readJson(req, res, (body) => {
      const who = addrOf(req);
      const vf = versionFail(req);
      if (vf) return refuse(res, vf.status, vf.report);
      const au = authReq(req);
      if (au.fail) return refuse(res, au.fail.status, au.fail.report);
      if (au.screen && !au.screen.owner) return refuse(res, 403, 'notOwner');
      if (writeCode && !au.screen) {
        if (lockState(who)) return reply(429, { ok: false, report: 'badCode' });
        if (!(body && typeof body === 'object' && writeOk(body.code))) { noteFailure(who); return reply(403, { ok: false, report: 'badCode' }); }
        failures.delete(who);
      }
      if (!body || typeof body !== 'object' || !body.state) return reply(400, { ok: false, report: 'badPatch', info: { error: 'no state' } });
      if (seq !== 0 || seeded) return reply(409, { ok: false, report: 'notEmpty', info: {} });
      const v = E.validateBackup(body.state);
      if (!v.ok) return reply(400, { ok: false, report: 'invalidBackup', info: { error: v.error } });
      state = v.state; seeded = true; seq = 0; lastAt = 0;
      hubId = crypto.randomBytes(6).toString('hex');
      ops.length = 0; opsBytes = 0; replies.clear(); undoOwner.clear(); lastActionKey = null;
      if (walFd !== null) { try { fs.closeSync(walFd); } catch (e) { /* ignore */ } walFd = null; }
      if (walFile) { try { fs.rmSync(walFile, { force: true }); } catch (e) { /* ignore */ } walLines = 0; }
      dirty = true; flush();
      for (const r of Array.from(clients)) r.end();
      for (const r of Array.from(followers)) r.end();
      clients.clear(); followers.clear();
      reply(200, { ok: true, report: 'ok', hubId, seq });
    }, 8 * 1024 * 1024);
  }
  // The pairing routes. /pair exchanges a one-time code for a token. /screen/* is for an owner screen (its token). /admin/* is for the person who runs
  // the hub (the admin key in a bearer header, from the command line). Screens cannot reach /admin/*.
  function handleScreens(req, res, url) {
    const who = addrOf(req);
    if (url === '/pair' && req.method === 'POST') {
      if (!postGuard(req, res)) return;
      return readJson(req, res, (body) => {
        const vf = versionFail(req);
        if (vf) return refuse(res, vf.status, vf.report);
        if (!body || typeof body !== 'object') return refuse(res, 400, 'badPairCode');
        const r = screens.exchange(body.code, body.name, who);
        if (!r.ok) return refuse(res, r.report === 'tooManyTries' ? 429 : 403, r.report, r.report === 'tooManyTries' ? { 'retry-after': '300' } : {});
        sendJson(res, 200, { ok: true, token: r.token, screen: r.screen, proto: PROTO, minClient, hubId });
      }, 4096);
    }
    // Is this an owner screen (by token) or the admin (by key)? Returns 'owner', 'admin' or null after writing the refusal.
    const who2 = () => {
      const h = req.headers.authorization;
      if (url.indexOf('/admin/') === 0) {
        if (!h || !/^Bearer /.test(h) || !codeEq(h.slice(7), adminKey)) { refuse(res, 403, 'unpaired'); return null; }
        return 'admin';
      }
      const au = authReq(req);
      if (au.fail || !au.screen) { refuse(res, 403, au.fail ? au.fail.report : 'unpaired'); return null; }
      if (!au.screen.owner) { refuse(res, 403, 'notOwner'); return null; }
      return 'owner';
    };
    const isList = (url === '/screen/list' || url === '/admin/screens') && req.method === 'GET';
    const isPair = (url === '/screen/pair' || url === '/admin/pair') && req.method === 'POST';
    const isRevoke = (url === '/screen/revoke' || url === '/admin/revoke') && req.method === 'POST';
    if (!isList && !isPair && !isRevoke) { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('not found'); return; }
    if (url.indexOf('/admin/') === 0 && lockState('admin:' + who)) return refuse(res, 429, 'tooManyTries');
    const role = who2();
    if (!role) { if (url.indexOf('/admin/') === 0) noteFailure('admin:' + who); return; }
    if (isList) return sendJson(res, 200, { ok: true, screens: screens.list(), tokensRequired: requireTokens });
    if (!postGuard(req, res)) return;
    readJson(req, res, (body) => {
      if (isPair) {
        const c = screens.issueCode({ owner: role === 'admin' && !!(body && body.owner) });
        return sendJson(res, 200, { ok: true, code: c.code, expiresAt: c.expiresAt, owner: c.owner, minutes: Math.round((c.expiresAt - now()) / 60000) });
      }
      const s = body && typeof body.id === 'string' ? screens.revoke(body.id) : null;
      if (!s) return refuse(res, 404, 'unpaired', { info: { error: 'no such screen' } });
      sendJson(res, 200, { ok: true, screen: screens.pub(s) });
    }, 4096);
  }
  // Answers one HTTP request: the page, the event stream, or an action.
  function handle(req, res) {
    const url = (req.url || '/').split('?')[0];
    // Health for an owner's monitor and the updater: no secrets, no codes, only counts.
    if ((req.method === 'GET' || req.method === 'HEAD') && url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : JSON.stringify({ ok: true, hubId, seq, screens: clients.size + followers.size, uptime: Math.floor((Date.now() - startedAt) / 1000) }));
      return;
    }
    if (req.method === 'GET' && url === '/events') {
      const ea = authReq(req);
      if (ea.fail) return refuse(res, ea.fail.status, ea.fail.report);
      if (clients.size + followers.size >= MAX_CLIENTS) { res.writeHead(503, { 'content-type': 'text/plain', 'retry-after': '10' }); res.end('too many screens connected'); return; }
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff', connection: 'keep-alive' });
      clients.add(res);
      if (ea.screen) streamScreen.set(res, ea.screen.id);
      req.on('close', () => clients.delete(res));
      // ?since=N: a screen that was away asks for the actions after N. If the log still reaches back that far it gets
      // them as one catchup message; otherwise it gets a full snapshot.
      const sinceText = new URL(req.url, 'http://x').searchParams.get('since');
      const since = sinceText === null || sinceText === '' ? NaN : Number(sinceText);
      const covered = Number.isInteger(since) && since >= 0 && since <= seq && (since === seq || (ops.length && ops[0].seq <= since + 1) || (!ops.length && since === seq));
      if (covered) send(res, 'catchup', { ops: ops.filter((o) => o.seq > since), serverNow: now(), seq });
      else send(res, 'snapshot', view());
      return;
    }
    if (req.method === 'OPTIONS' && (url === '/follow' || url === '/probe')) {
      const open = followCode || writeCode || requireTokens;
      res.writeHead(204, open ? { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'x-smokebox-code, x-smokebox-token, x-smokebox-client, accept', 'access-control-allow-methods': 'GET', 'access-control-max-age': '600' } : {});
      res.end();
      return;
    }
    if (handleOffline(req, res, url)) return;
    if (req.method === 'GET' && url === '/follow') return handleFollow(req, res);
    if (req.method === 'GET' && url === '/probe') return handleProbe(req, res);
    if (req.method === 'POST' && url === '/seed') return handleSeed(req, res);
    if (url === '/pair' || url.indexOf('/screen/') === 0 || url.indexOf('/admin/') === 0) return handleScreens(req, res, url);
    if (req.method === 'POST' && url === '/action') {
      // Cross-site request forgery: a web page the signed-in person visits could send a "simple" POST here and the browser would attach the
      // cached login. Two cheap guards: the body must say it is application/json (a cross-site page cannot send that without a permission
      // check the hub never grants), and a request that names another origin is refused.
      const ct = String(req.headers['content-type'] || '').toLowerCase();
      const origin = req.headers.origin;
      let sameOrigin = true;
      if (origin) { try { sameOrigin = new URL(origin).host === req.headers.host; } catch (e) { sameOrigin = false; } }
      if (!ct.startsWith('application/json') || !sameOrigin) {
        res.writeHead(!sameOrigin ? 403 : 415, { 'content-type': 'application/json', connection: 'close' });
        res.end(JSON.stringify({ report: 'badPatch', info: { error: !sameOrigin ? 'cross-site request refused' : 'content-type must be application/json' }, seq }));
        req.resume();
        return;
      }
      readJson(req, res, (body) => {
        const who = addrOf(req);
        const vf = versionFail(req);
        if (vf) return refuse(res, vf.status, vf.report);
        const au = authReq(req);
        if (au.fail) return refuse(res, au.fail.status, au.fail.report);
        // A paired screen is known by its token: its name and identity come from the hub's list, never from the request, so they cannot be spoofed.
        if (au.screen && body && typeof body === 'object') { body.clientId = 's:' + au.screen.id; body.who = au.screen.name; }
        // Writing needs the write code when the hub has one and the screen has no token; wrong tries are counted like for the stream.
        if (writeCode && !au.screen) {
          if (lockState(who)) { res.writeHead(429, { 'content-type': 'application/json', 'retry-after': '60' }); res.end(JSON.stringify({ ok: false, report: 'badCode', info: { error: 'tooManyTries' }, seq })); return; }
          if (!(body && typeof body === 'object' && writeOk(body.code))) { noteFailure(who); res.writeHead(403, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: false, report: 'badCode', info: { error: 'badCode' }, seq })); return; }
          failures.delete(who);
        }
        // An action that makes the engine throw is answered with 500 and changes nothing, instead of taking the hub down.
        let out;
        try { out = body && typeof body === 'object' && !Array.isArray(body) ? runAction(body) : { status: 400, body: { report: 'badPatch', info: { error: 'not a JSON object' }, seq } }; }
        catch (e) { console.warn('[hub] action failed: ' + e.message); out = { status: 500, body: { report: 'badPatch', info: { error: 'action failed' }, seq } }; }
        res.writeHead(out.status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(out.body));
      });
      return;
    }
    if (req.method === 'GET' && (url === '/' || url === '/smokebox.html')) {
      if (!fs.existsSync(htmlFile)) { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('dist/smokebox.html is not built; run node tools/build.mjs'); return; }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'x-frame-options': 'DENY' });
      fs.createReadStream(htmlFile).on('error', () => res.destroy()).pipe(res);
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain' }); res.end('not found');
  }

  // Start-up: put back whatever the record holds beyond the saved state, and write the starting state to disk at once so the record always
  // has a saved base to replay onto.
  // With no usable state file the record has nothing to replay onto (it belongs to a history that was lost), so it is set aside, never applied.
  if (!saved && walFile && fs.existsSync(walFile)) { try { fs.renameSync(walFile, walFile + '.old'); } catch (e) { /* ignore */ } }
  const replayed = saved ? walReplay() : 0;
  if (dataFile && (!saved || replayed)) { dirty = true; flush(); }
  const server = http.createServer(handle);
  // A slow or stalled sender is cut off (these limits apply to receiving a request, not to the long event stream).
  server.headersTimeout = 15000; server.requestTimeout = 30000;
  let tickTimer = null, hbTimer = null;
  // Starts listening, the 1 s tick and the heartbeat; resolves with the port actually used.
  function listen(port = 0, host = '127.0.0.1') {
    // The tick lets the engine move time forward (deadlines, expiries) and tells screens only if something changed.
    tickTimer = setInterval(() => {
      const tt = Math.max(lastAt, now());
      const t = E.tick(state, tt);
      if (t.state === state) return;
      // A tick that changed something is part of the ordered history too, so a follower that replays the history ends in the same state.
      const entry = { seq: seq + 1, opId: null, type: 'tick', payload: {}, now: tt, by: null };
      try { walAppend(entry, true); } catch (e) { console.warn('[hub] could not record a tick: ' + e.message); }
      state = t.state; lastAt = tt;
      const op = remember(entry);
      changed({ type: 'tick', op });
    }, tickMs);
    hbTimer = setInterval(() => { for (const res of clients) send(res, 'hb', { serverNow: now(), seq }); for (const res of followers) send(res, 'hb', { serverNow: now(), seq, hubId }); }, heartbeatMs);
    return new Promise((resolve) => server.listen(port, host, () => resolve(server.address().port)));
  }
  // Stops timers, ends every stream, writes the file one last time and closes the server.
  function close() {
    clearInterval(tickTimer); clearInterval(hbTimer);
    flush();
    if (walFd !== null) { try { fs.fsyncSync(walFd); fs.closeSync(walFd); } catch (e) { /* ignore */ } walFd = null; }
    for (const res of clients) res.end();
    for (const res of followers) res.end();
    clients.clear(); followers.clear();
    return new Promise((resolve) => { server.close(() => resolve()); server.closeAllConnections?.(); });
  }
  // Stops the hub the way a power cut would: no final save, no flush of the record's buffers beyond what was already written (used by tests).
  function crash() {
    clearInterval(tickTimer); clearInterval(hbTimer);
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    if (walFd !== null) { try { fs.closeSync(walFd); } catch (e) { /* ignore */ } walFd = null; }
    for (const res of clients) res.destroy();
    for (const res of followers) res.destroy();
    clients.clear(); followers.clear();
    return new Promise((resolve) => { server.close(() => resolve()); server.closeAllConnections?.(); });
  }
  // Returns the current state, hub clock and change counter (used by tests).
  function snapshot() { return view(); }
  // Which protections are on, with no secret in it (only whether a code exists).
  const protections = { trustProxy, tokensRequired: requireTokens, writeCode: !!writeCode, followCode: !!followCode, serviceWorker: swOn, gzip: gzipOn };
  return { server, listen, close, crash, flush, snapshot, hubId, replayed, adminKey, screens, protections };
}

// The owner's commands for a running hub: node server/server.mjs admin pair [--owner] | list | revoke ID  (options --port N, --data FILE).
// They talk to the hub on this computer with the admin key kept next to the data file (or SMOKEBOX_ADMIN_KEY).
async function adminCli(args) {
  const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : dflt; };
  const port = Number(opt('--port', process.env.PORT || 8787)), dataFile = opt('--data', process.env.SMOKEBOX_DATA || '');
  let key = process.env.SMOKEBOX_ADMIN_KEY || '';
  if (!key && dataFile) { try { key = fs.readFileSync(dataFile + '.admin', 'utf8').trim(); } catch (e) { key = ''; } }
  if (!key) { console.error('No admin key found. Give --data FILE (the hub\'s data file) or set SMOKEBOX_ADMIN_KEY.'); return 2; }
  const cmd = args[0];
  // Runs one admin command against the hub on this computer and resolves its status and JSON answer.
  const call = (method, p, body) => new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request({ host: '127.0.0.1', port, path: p, method, headers: Object.assign({ authorization: 'Bearer ' + key }, data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {}) }, (res) => {
      let t = ''; res.on('data', (c) => (t += c)); res.on('end', () => { let j = null; try { j = JSON.parse(t); } catch (e) { /* not JSON */ } resolve({ status: res.statusCode, body: j }); });
    });
    r.on('error', (e) => resolve({ status: 0, error: e.message })); if (data) r.write(data); r.end();
  });
  if (cmd === 'pair') {
    const r = await call('POST', '/admin/pair', { owner: args.includes('--owner') });
    if (!r.body || !r.body.ok) { console.error(r.error ? 'Cannot reach the hub on port ' + port + ': ' + r.error : 'Refused: ' + ((r.body && r.body.words) || r.status)); return 1; }
    console.log('Pairing code: ' + r.body.code + (r.body.owner ? '  (owner screen)' : '') + '\nEnter it on the new screen within ' + r.body.minutes + ' minutes. It works once.');
    return 0;
  }
  if (cmd === 'list') {
    const r = await call('GET', '/admin/screens');
    if (!r.body || !r.body.ok) { console.error(r.error ? 'Cannot reach the hub on port ' + port + ': ' + r.error : 'Refused: ' + ((r.body && r.body.words) || r.status)); return 1; }
    if (!r.body.screens.length) console.log('No screens are paired.');
    for (const sc of r.body.screens) console.log(sc.id + '  ' + (sc.name || '(no name)').padEnd(22) + (sc.owner ? ' owner ' : '       ') + (sc.revokedAt ? 'REMOVED ' + new Date(sc.revokedAt).toISOString() : 'last seen ' + new Date(sc.lastSeen).toISOString()));
    console.log('Tokens ' + (r.body.tokensRequired ? 'are required' : 'are optional (the access code still works)') + '.');
    return 0;
  }
  if (cmd === 'revoke' && args[1]) {
    const r = await call('POST', '/admin/revoke', { id: args[1] });
    if (!r.body || !r.body.ok) { console.error(r.error ? 'Cannot reach the hub on port ' + port + ': ' + r.error : 'Refused: ' + ((r.body && (r.body.info && r.body.info.error || r.body.words)) || r.status)); return 1; }
    console.log('Removed ' + r.body.screen.id + ' (' + (r.body.screen.name || 'no name') + '). It is cut off now.');
    return 0;
  }
  console.error('Usage: node server/server.mjs admin pair [--owner] | list | revoke ID   [--port N] [--data FILE]');
  return 2;
}

// Command line start: reads PORT and HOST, prints the address, and saves on Ctrl-C.
async function main() {
  if (process.argv[2] === 'admin') { process.exit(await adminCli(process.argv.slice(3))); }
  const hub = await createHub();
  const port = await hub.listen(Number(process.env.PORT || 8787), process.env.HOST || '127.0.0.1');
  console.log('[hub] Smokebox prototype hub on http://' + (process.env.HOST || '127.0.0.1') + ':' + port + ' (time zone ' + (process.env.TZ || 'system') + ')');
  // Says on or off for one protection.
  const pr = hub.protections, on = (b) => (b ? 'on' : 'off');
  console.log('[hub] Protections: pairing tokens required ' + on(pr.tokensRequired) + ', write code ' + on(pr.writeCode) + ', follow code ' + on(pr.followCode) + ', trust proxy ' + on(pr.trustProxy) + ', service worker ' + on(pr.serviceWorker) + ', gzip ' + on(pr.gzip));
  if (!pr.writeCode && !pr.tokensRequired && (process.env.HOST || '127.0.0.1') !== '127.0.0.1') console.log('[hub] Warning: anyone who can reach this address can write to the kitchen. Set SMOKEBOX_WRITE_CODE or SMOKEBOX_REQUIRE_TOKENS=1.');
  if (process.env.SMOKEBOX_REQUIRE_TOKENS === '1' || process.env.SMOKEBOX_REQUIRE_TOKEN === '1') console.log('[hub] Screens need a pairing code: node server/server.mjs admin pair --port ' + port + (process.env.SMOKEBOX_DATA ? ' --data ' + process.env.SMOKEBOX_DATA : ''));
  // Closes the hub cleanly (saving the file) and exits the process.
  const stop = () => hub.close().then(() => process.exit(0));
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
