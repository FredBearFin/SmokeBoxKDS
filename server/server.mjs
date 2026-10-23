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

// The follower stream version: a follower that expects another number is told 'wrongVersion' and stops.
const PROTO = 1;

// Reads the saved JSON file and checks it with the engine's validateBackup; returns { state, seq, hubId } or null.
function loadSaved(E, file) {
  if (!file || !fs.existsSync(file)) return null;
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    const v = E.validateBackup(saved.state);
    if (!v.ok) { console.warn('[hub] saved file refused: ' + v.error); return null; }
    return { state: v.state, seq: Number.isInteger(saved.seq) ? saved.seq : 0, hubId: typeof saved.hubId === 'string' ? saved.hubId : null };
  } catch (e) { console.warn('[hub] saved file unreadable: ' + e.message); return null; }
}

// Writes state and seq to the JSON file through a temp file and a rename, so a crash never leaves half a file.
function writeSaved(file, state, seq, hubId) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify({ v: 1, seq, hubId, state }));
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
  const hubId = (saved && saved.hubId) || crypto.randomBytes(6).toString('hex');
  const followCode = opts.followCode !== undefined ? opts.followCode : (process.env.SMOKEBOX_FOLLOW_CODE || '');
  const walFile = opts.walFile !== undefined ? opts.walFile : (dataFile ? dataFile + '.wal' : null);
  const clients = new Set();
  const followers = new Set();
  const ops = []; // recent applied actions {seq, opId, actionType, payload, now, by}, so a returning screen can catch up
  const MAX_OPS = opts.maxOps ?? 5000;
  let lastAt = 0; // the time of the last applied action; action times never go backwards
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
  const walEntry = (o) => ({ seq: o.seq, opId: o.opId, type: o.actionType, payload: o.payload, now: o.now, by: o.by, info: o.info });
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
      if (!e || !Number.isInteger(e.seq) || typeof e.type !== 'string') continue;
      walLines++;
      if (e.seq <= seq) { remember(e); continue; }        // already in the saved state: only the log and the answers are rebuilt
      if (e.seq !== seq + 1) { console.warn('[hub] a gap in the record at ' + e.seq + '; replay stopped'); break; }
      const r = e.type === 'tick' ? { report: 'ok', state: E.tick(state, e.now).state } : E.apply(state, e.type, e.payload, e.now);
      if (r.report !== 'ok') { console.warn('[hub] record entry ' + e.seq + ' did not replay (' + r.report + '); replay stopped'); break; }
      state = r.state; seq = e.seq; lastAt = Math.max(lastAt, e.now); n++;
      remember(e);
    }
    return n;
  }
  // Keeps a replayed or applied entry in the recent log and, when it has an action id, its answer.
  function remember(e) {
    const op = { seq: e.seq, opId: e.opId || null, actionType: e.type, payload: e.payload ?? {}, now: e.now, by: e.by ?? null, info: e.info };
    op.bytes = JSON.stringify(op).length;
    ops.push(op); opsBytes += op.bytes;
    while (ops.length > MAX_OPS || (opsBytes > MAX_OPS_BYTES && ops.length > 1)) opsBytes -= ops.shift().bytes || 0;
    if (op.opId) { replies.set(op.opId, { report: 'ok', info: op.info ?? {}, seq: op.seq }); if (replies.size > MAX_REPLIES) replies.delete(replies.keys().next().value); }
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
    if (dataFile && dirty) { dirty = false; try { writeSaved(dataFile, state, seq, hubId); walCompact(); } catch (e) { console.warn('[hub] save failed: ' + e.message); } }
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
  const opMessage = (o) => ({ seq: o.seq, opId: o.opId, type: o.actionType, payload: o.payload, now: o.now, by: o.by, serverNow: now() });

  // Runs one action through the engine with the hub clock; repeats of a known opId get the first answer back.
  function runAction(body) {
    const { type, payload, clientId, opId, at } = body || {};
    if (typeof type !== 'string') return { status: 400, body: { report: 'unknownAction', info: {}, seq } };
    if (typeof opId === 'string' && replies.has(opId)) return { status: 200, body: Object.assign({}, replies.get(opId), { duplicate: true }) };
    // A client may say when it did the action (a queued action replayed after being offline). The hub trusts that
    // time only between the last applied action and its own clock, so time never runs backwards or into the future.
    const t = typeof at === 'number' && isFinite(at) ? Math.min(now(), Math.max(lastAt, at)) : Math.max(lastAt, now());
    const r = E.apply(state, type, payload, t);
    let reply;
    if (r.report === 'ok') {
      const by = typeof clientId === 'string' ? clientId : null;
      const entry = { seq: seq + 1, opId: typeof opId === 'string' ? opId : null, type, payload: payload ?? {}, now: t, by, info: r.info };
      // Durable first: if the record cannot be written the action is not applied and not acknowledged.
      try { walAppend(entry, true); } catch (e) { console.warn('[hub] could not record an action: ' + e.message); return { status: 500, body: { report: 'badPatch', info: { error: 'could not record the action' }, seq } }; }
      state = r.state;
      lastAt = t;
      const op = remember(entry);
      changed({ by, opId: op.opId, type, op });
      reply = { report: 'ok', info: r.info, seq };
    } else reply = { report: r.report, info: r.info, seq };
    if (typeof opId === 'string') {
      replies.set(opId, reply);
      if (replies.size > MAX_REPLIES) replies.delete(replies.keys().next().value);
    }
    return { status: 200, body: reply };
  }

  // Reads a request body up to MAX_BODY bytes and calls back with the parsed JSON (or null if it is not JSON). A bigger body is answered
  // with 413 at once and the connection is closed, so nothing large is ever held. A Content-Length that is already too big is refused up front.
  function readJson(req, res, cb) {
    let n = 0, done = false; const chunks = [];
    // Refuses a request that is too large: answers 413 once and closes the connection.
    const tooBig = () => {
      if (done) return; done = true;
      res.writeHead(413, { 'content-type': 'application/json', connection: 'close' });
      res.end(JSON.stringify({ report: 'badPatch', info: { error: 'body too large', max: MAX_BODY }, seq }), () => req.destroy());
    };
    if (Number(req.headers['content-length']) > MAX_BODY) return tooBig();
    req.on('data', (c) => { n += c.length; if (n > MAX_BODY) tooBig(); else if (!done) chunks.push(c); });
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
  function codeOk(given) {
    const a = crypto.createHash('sha256').update(String(given || '')).digest(), b = crypto.createHash('sha256').update(followCode).digest();
    return crypto.timingSafeEqual(a, b);
  }
  // Answers a read-only follower: checks the access code, then sends hello, then either a snapshot or the ordered actions it missed (if the
  // log still reaches back and is smaller than a snapshot), then every new action as it is applied. It can never write.
  function handleFollow(req, res) {
    const q = new URL(req.url, 'http://x').searchParams;
    const cors = followCode ? { 'access-control-allow-origin': '*' } : {};
    // Answers a refused follower with a status and a short reason in JSON, then closes the connection.
    const fail = (code, error, extra) => { res.writeHead(code, Object.assign({ 'content-type': 'application/json', connection: 'close' }, cors, extra || {})); res.end(JSON.stringify({ error })); };
    const who = req.socket.remoteAddress || '?';
    if (followCode) {
      const f = failures.get(who);
      if (f && f.until > Date.now()) return fail(429, 'tooManyTries', { 'retry-after': '60' });
      if (!codeOk(q.get('code'))) {
        const n = (f ? (f.until && f.until <= Date.now() ? 0 : f.n) : 0) + 1;
        failures.set(who, { n, until: n >= FAIL_MAX ? Date.now() + FAIL_LOCK_MS : 0 });
        if (failures.size > 1000) failures.delete(failures.keys().next().value);
        return fail(403, 'badCode');
      }
      failures.delete(who);
    }
    if (clients.size + followers.size >= MAX_CLIENTS) return fail(503, 'tooMany', { 'retry-after': '10' });
    res.writeHead(200, Object.assign({ 'content-type': 'text/event-stream', 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff', connection: 'keep-alive' }, cors));
    followers.add(res);
    req.on('close', () => followers.delete(res));
    send(res, 'hello', { proto: PROTO, hubId, seq, serverNow: now() });
    const sinceText = q.get('since'), since = sinceText === null || sinceText === '' ? NaN : Number(sinceText);
    const sameHub = q.get('hub') === hubId;
    const missed = Number.isInteger(since) && since >= 0 && since <= seq && sameHub && (since === seq || (ops.length && ops[0].seq <= since + 1)) ? ops.filter((o) => o.seq > since) : null;
    // Resuming is only worth it while the missed actions are smaller than a snapshot would be.
    const stateBytes = missed && missed.length ? JSON.stringify(state).length : 0;
    if (missed && (missed.length === 0 || missed.reduce((a, o) => a + (o.bytes || 0), 0) <= stateBytes)) {
      for (const o of missed) send(res, 'op', opMessage(o));
      send(res, 'resumed', { seq, hubId, count: missed.length, serverNow: now() });
    } else send(res, 'snapshot', { state, seq, hubId, proto: PROTO, serverNow: now() });
  }
  // Answers one HTTP request: the page, the event stream, or an action.
  function handle(req, res) {
    const url = (req.url || '/').split('?')[0];
    if (req.method === 'GET' && url === '/events') {
      if (clients.size + followers.size >= MAX_CLIENTS) { res.writeHead(503, { 'content-type': 'text/plain', 'retry-after': '10' }); res.end('too many screens connected'); return; }
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff', connection: 'keep-alive' });
      clients.add(res);
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
    if (req.method === 'GET' && url === '/follow') return handleFollow(req, res);
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
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'x-frame-options': 'DENY' });
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
  return { server, listen, close, crash, flush, snapshot, hubId, replayed };
}

// Command line start: reads PORT and HOST, prints the address, and saves on Ctrl-C.
async function main() {
  const hub = await createHub();
  const port = await hub.listen(Number(process.env.PORT || 8787), process.env.HOST || '127.0.0.1');
  console.log('[hub] Smokebox prototype hub on http://' + (process.env.HOST || '127.0.0.1') + ':' + port + ' (time zone ' + (process.env.TZ || 'system') + ')');
  // Closes the hub cleanly (saving the file) and exits the process.
  const stop = () => hub.close().then(() => process.exit(0));
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
