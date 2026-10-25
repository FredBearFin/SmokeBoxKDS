#!/usr/bin/env node
// WHAT THIS FILE IS: The natural kitchen voice on its own, for the hosted server. The Rust server (server-rs) runs the kitchens; this small
//    Node service answers only /api/voice and /api/voices, and the web server in front (Caddy) sends those two paths here. The voice itself
//    is server/voice.mjs (Kokoro through the ONNX runtime), the same one the one-kitchen hub uses.
// PARTS: the two routes, the command line start.
// USES: server/voice.mjs. USED BY: server/setup-server.sh (the smokebox-voice service).
// ENV: PORT (default 8788), HOST (default 127.0.0.1), and the SMOKEBOX_VOICE_* paths voice.mjs reads.
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createVoice } from './voice.mjs';

/** createVoiceServer(opts) -> { server, listen(port, host), close() }. opts.voice replaces the real voice (tests). */
export function createVoiceServer(opts = {}) {
  const voice = opts.voice || createVoice({ log: (m) => console.log('[voice] ' + m) });
  // Answers /api/voices (which voices, and whether the voice is on) and /api/voice?v=&t=&p= (a WAV of one line, 503 while it is off).
  function handle(req, res) {
    const url = new URL(req.url || '/', 'http://x');
    if (req.method === 'GET' && url.pathname === '/api/voices') {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      return res.end(JSON.stringify({ ready: voice.ready(), voices: voice.voices }));
    }
    if (req.method === 'GET' && url.pathname === '/api/voice') {
      const q = url.searchParams;
      // Sends the line's sound, or 503 so the tablet uses its own voice.
      return voice.say(q.get('t'), q.get('v'), q.get('p') === '1').then((wav) => {
        if (!wav) { res.writeHead(503, { 'content-type': 'text/plain', 'retry-after': '5' }); res.end('voice not available'); return; }
        res.writeHead(200, { 'content-type': 'audio/wav', 'content-length': wav.length, 'cache-control': 'private, max-age=86400', 'x-content-type-options': 'nosniff' });
        res.end(wav);
      }, () => { res.writeHead(503, { 'content-type': 'text/plain' }); res.end('voice not available'); });
    }
    res.writeHead(404, { 'content-type': 'text/plain' }); res.end('not found');
  }
  const server = http.createServer(handle);
  return {
    server,
    // Starts listening; resolves with the port in use.
    listen: (port = 0, host = '127.0.0.1') => new Promise((resolve) => server.listen(port, host, () => resolve(server.address().port))),
    // Stops listening and lets open requests finish.
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

// Command line start: reads PORT and HOST and says where it listens.
async function main() {
  const v = createVoiceServer();
  const host = process.env.HOST || '127.0.0.1';
  const port = await v.listen(Number(process.env.PORT || 8788), host);
  console.log('[voice] natural voice service on http://' + host + ':' + port);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
