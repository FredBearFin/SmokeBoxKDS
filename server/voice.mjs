// WHAT THIS FILE IS: The natural kitchen voice, made on the server. It turns a call-out ("Fire French fries now! Ticket
//    103!") into speech with the free Kokoro voice model, so every tablet hears a human-sounding voice instead of the
//    device's robot voice. Lines are made one at a time, kept on disk and in memory, and made ahead of time by the tablets
//    (they ask for the next calls before they are due), so a call is not late.
// PARTS: find the model and runtime, turn text into sounds (espeak-ng), run the model, write a WAV, the cache, the queue.
// USES: onnxruntime-node (installed by setup-server.sh into /opt/smokebox-voice), espeak-ng (apt), the model file
//    kokoro-v1.0.onnx (downloaded by setup-server.sh), server/voices/*.bin and server/voices/vocab.json (in the repo).
// USED BY: server/server.mjs (GET /api/voice). Missing pieces switch the voice off; the tablets then use their own voice.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// The voices offered, by the language the call-outs are spoken in. The letter before the underscore is the model's
// accent: a American, b British. The call-out wording is English for now.
export const VOICES = {
  bf_emma: 'Emma (British)', bf_isabella: 'Isabella (British)', bf_alice: 'Alice (British)', bf_lily: 'Lily (British)',
  bm_george: 'George (British)', bm_lewis: 'Lewis (British)', bm_daniel: 'Daniel (British)', bm_fable: 'Fable (British)',
  af_heart: 'Heart (American)', af_bella: 'Bella (American)', am_michael: 'Michael (American)', am_adam: 'Adam (American)',
};
// The espeak-ng accent for each voice's first letter.
const ACCENT = { a: 'en-us', b: 'en-gb' };
const RATE = 24000;
// Sentences every kitchen hears all day, in the exact words the tablets use (src/js/25-deadlines.js phrase()). Once the model
// is loaded they are made for every voice in the background, so a voice test or a common call plays at once.
const COMMON = ['Sound is on.', 'This is a test.', 'Spoken warnings are on.', 'Order up!', 'Ring it out!', 'Ring it out now!', 'Fire it now!', 'one item!', 'two items!', 'three items!', 'four items!'];
const MAX_TEXT = 200;
const MAX_QUEUE = 200;
// Lines kept on disk (about 100 KB each); past this the oldest are removed, so the disk Postgres shares never fills up.
const MAX_CACHE_FILES = 5000;

/**
 * Starts the voice in the background and returns { ready(), voices, say(text, voice) }. say() gives a Promise of a WAV
 * Buffer, or null when the voice is off or the request is not allowed. Never throws.
 * opts: { modelFile, runtimeDir, cacheDir, threads, log }.
 */
export function createVoice(opts = {}) {
  const log = opts.log || (() => {});
  const modelFile = opts.modelFile || process.env.SMOKEBOX_VOICE_MODEL || '/opt/smokebox-voice/kokoro-v1.0.onnx';
  const runtimeDir = opts.runtimeDir || process.env.SMOKEBOX_VOICE_RUNTIME || '/opt/smokebox-voice';
  const cacheDir = opts.cacheDir || process.env.SMOKEBOX_VOICE_CACHE || '/var/lib/smokebox/voice-cache';
  let ort = null, sess = null, vocab = null, off = false;
  const styles = new Map(), mem = new Map(), waiting = new Map();
  // Lines waiting to be made, one at a time, by priority: 2 a call due now, 1 a line a tablet fetches ahead, 0 the server's
  // own warm-up. The same priority goes in arrival order.
  const jobs = [];
  let busy = false;
  // Makes the next waiting line, urgent ones first, then the next, until none is left.
  function pump() {
    if (busy || !jobs.length) return;
    let i = 0;
    for (let k = 1; k < jobs.length; k++) if (jobs[k].prio > jobs[i].prio) i = k;
    const job = jobs.splice(i, 1)[0];
    busy = true;
    make(job.text, job.voice).then(job.resolve, job.reject).finally(() => { busy = false; pump(); });
  }

  // Loads the runtime, the model and the sound table once; any missing piece switches the voice off (logged once).
  const started = (async () => {
    try {
      if (!fs.existsSync(modelFile)) throw new Error('no model file at ' + modelFile);
      ort = createRequire(path.join(runtimeDir, 'x.js'))('onnxruntime-node');
      vocab = JSON.parse(fs.readFileSync(path.join(HERE, 'voices', 'vocab.json'), 'utf8'));
      sess = await ort.InferenceSession.create(modelFile, { intraOpNumThreads: opts.threads || 2 });
      try { fs.mkdirSync(cacheDir, { recursive: true }); } catch (e) { /* memory cache still works */ }
      log('natural voice ready');
      // Warm-up: the common sentences for every voice, behind any line a tablet asks for (they are not urgent).
      // Emma (the default voice) first, then the others.
      for (const v of ['bf_emma'].concat(Object.keys(VOICES).filter((x) => x !== 'bf_emma'))) for (const t of COMMON) say(t, v, 0).catch(() => {});
    } catch (e) { off = true; log('natural voice off: ' + e.message); }
  })();

  // The voice's style table (510 rows of 256 numbers, one row per sound count), read once from server/voices.
  function style(voice) {
    if (!styles.has(voice)) {
      const b = fs.readFileSync(path.join(HERE, 'voices', voice + '.bin'));
      styles.set(voice, new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4));
    }
    return styles.get(voice);
  }
  // The text as speech sounds (IPA), from espeak-ng in the voice's accent. The text goes in on stdin, never on the command line,
  // so a line that starts with "-" is spoken, not taken as an espeak-ng option (like -f, which would read a file).
  function sounds(text, accent) {
    return new Promise((resolve, reject) => {
      const child = execFile('espeak-ng', ['-q', '--ipa', '-v', accent, '--stdin'], { timeout: 5000 }, (err, out) => (err ? reject(err) : resolve(String(out).replace(/\s+/g, ' ').trim())));
      child.stdin.on('error', () => { /* the exit is reported above */ });
      child.stdin.end(text);
    });
  }
  // Runs the model for one line and returns 16-bit mono WAV bytes at 24 kHz.
  async function make(text, voice) {
    const ps = await sounds(text, ACCENT[voice[0]] || 'en-us');
    const ids = [...ps].map((c) => vocab[c]).filter((x) => x !== undefined).slice(0, 508);
    if (!ids.length) return null;
    const st = style(voice), row = ids.length - 1;
    const out = await sess.run({
      tokens: new ort.Tensor('int64', BigInt64Array.from([0, ...ids, 0].map(BigInt)), [1, ids.length + 2]),
      style: new ort.Tensor('float32', st.slice(row * 256, row * 256 + 256), [1, 256]),
      speed: new ort.Tensor('float32', new Float32Array([1.1]), [1]),
    });
    const a = out[sess.outputNames[0]].data;
    const buf = Buffer.alloc(44 + a.length * 2);
    buf.write('RIFF', 0); buf.writeUInt32LE(36 + a.length * 2, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16);
    buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(RATE, 24); buf.writeUInt32LE(RATE * 2, 28);
    buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(a.length * 2, 40);
    for (let i = 0; i < a.length; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, a[i])) * 32767), 44 + i * 2);
    return buf;
  }

  // One line as speech: from memory, from disk, or made now (one at a time, so two tablets asking at once share the work).
  let writes = 0;
  // Every 100 new lines, removes the oldest cached lines past MAX_CACHE_FILES.
  function trimCache() {
    if (++writes % 100) return;
    try {
      const files = fs.readdirSync(cacheDir).filter((f) => f.endsWith('.wav'));
      if (files.length <= MAX_CACHE_FILES) return;
      const aged = files.map((f) => { const p = path.join(cacheDir, f); return { p, t: fs.statSync(p).mtimeMs }; }).sort((a, b) => a.t - b.t);
      for (const f of aged.slice(0, files.length - MAX_CACHE_FILES)) fs.unlinkSync(f.p);
    } catch (e) { log('voice cache trim failed: ' + e.message); }
  }
  // prio: 2 due now, 1 fetched ahead by a tablet (the default), 0 the server's warm-up. true and false are taken as 2 and 1.
  async function say(text, voice, prio) {
    prio = prio === true ? 2 : prio === false || prio === undefined ? 1 : prio;
    const t = String(text || '').replace(/\s+/g, ' ').trim();
    if (!t || t.length > MAX_TEXT || !Object.prototype.hasOwnProperty.call(VOICES, voice)) return null;
    await started;
    if (off) return null;
    const key = crypto.createHash('sha256').update(voice + '|' + t).digest('hex').slice(0, 32);
    if (mem.has(key)) return mem.get(key);
    if (waiting.has(key)) { const j = jobs.find((x) => x.key === key); if (j && prio > j.prio) j.prio = prio; return waiting.get(key); }
    const file = path.join(cacheDir, key + '.wav');
    // Reads the line from disk, or makes it, then keeps it in memory (the newest 400 lines).
    const p = (async () => {
      let wav = null;
      try { wav = fs.readFileSync(file); } catch (e) { wav = null; }
      if (!wav) {
        // A full queue (more than 200 lines waiting) refuses new lines; the tablet then uses its own voice.
        if (jobs.length >= MAX_QUEUE) return null;
        const job = new Promise((resolve, reject) => { jobs.push({ key, text: t, voice, prio, resolve, reject }); pump(); });
        wav = await job.catch((e) => { log('voice line failed: ' + e.message); return null; });
        if (wav) { try { fs.writeFileSync(file, wav); trimCache(); } catch (e) { /* kept in memory only */ } }
      }
      if (wav) { mem.set(key, wav); if (mem.size > 400) mem.delete(mem.keys().next().value); }
      return wav;
    })();
    waiting.set(key, p);
    try { return await p; } finally { waiting.delete(key); }
  }

  // ready: true once the model is loaded and nothing is missing.
  return { ready: () => !!sess && !off, voices: VOICES, say, started };
}
