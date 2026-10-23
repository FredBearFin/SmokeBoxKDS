// WHAT THIS FILE IS: The hub's list of paired screens. A screen joins with a one-time pairing code (6 characters, valid 10 minutes) and gets
//    its own long random token back. The hub keeps only a hash of each token, a name that belongs to the token, whether the screen is an
//    owner screen, and when it was last seen or removed. Pairing attempts are rate limited, per address and for the hub as a whole.
// PARTS: names and words, createScreens (the list, codes, pairing, checking a token, listing, revoking).
// USES: node crypto and fs only. USED BY: server/server.mjs, tests.
import crypto from 'node:crypto';
import fs from 'node:fs';

// Letters and digits for a pairing code, leaving out I, O, 0 and 1 so it is not misread when read aloud or typed.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const NAME_OK = /^[\p{L}\p{N} .,'&()#_-]{1,20}$/u;
// Plain words for each refusal, shared with the hub's answers.
export const WORDS = {
  unpaired: 'This screen is not paired with the main computer. Ask the owner for a pairing code.',
  revoked: 'This screen was removed from the kitchen. Ask the owner to pair it again.',
  badPairCode: 'That pairing code is wrong or has expired. Ask the owner for a new one.',
  tooManyTries: 'Too many wrong tries. Wait a few minutes, or ask the owner for a new code.',
  badName: 'The screen name may use letters, digits, spaces and . , \' & ( ) # _ - and up to 20 characters.',
  wrongVersion: 'This screen and the main computer run different versions. Reload the page from the main computer.',
  notOwner: 'Only an owner screen can do that.',
};

/** createScreens({ file?, now?, pairMs? }) -> the list of paired screens with its operations. file keeps the list between restarts. */
export function createScreens(opts = {}) {
  const now = opts.now || (() => Date.now());
  const file = opts.file || null;
  const pairMs = opts.pairMs ?? 10 * 60 * 1000;
  const codes = new Map();             // pairing code -> { expiresAt, owner }
  const addrFails = new Map();         // address -> { n, until }
  let wrong = [];                      // times of wrong pairing codes, for the hub-wide limit
  let lockedUntil = 0;
  let screens = [];
  let touchedAt = 0;
  const S = {};

  // Reads the saved list (ignored if it is damaged: pairing then starts empty).
  function load() {
    if (!file || !fs.existsSync(file)) return [];
    try { const j = JSON.parse(fs.readFileSync(file, 'utf8')); return Array.isArray(j.screens) ? j.screens.filter((s) => s && typeof s.id === 'string' && typeof s.hash === 'string') : []; } catch (e) { return []; }
  }
  // Writes the list through a temporary file and a rename, with owner-only permissions.
  function save() {
    if (!file) return;
    try { const tmp = file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify({ v: 1, screens }), { mode: 0o600 }); fs.renameSync(tmp, file); } catch (e) { console.warn('[hub] could not save the screen list: ' + e.message); }
  }
  screens = load();
  // A random pairing code of 6 characters.
  const makeCode = () => Array.from(crypto.randomBytes(6), (b) => ALPHABET[b % 32]).join('');
  // A fixed-length hash of a text, for comparing secrets without leaking where they differ.
  const sha = (t) => crypto.createHash('sha256').update(String(t)).digest();
  // Removes pairing codes that ran out.
  function sweep() { const t = now(); for (const [c, v] of codes) if (v.expiresAt <= t) codes.delete(c); }

  // Makes a one-time pairing code that works for 10 minutes. owner true makes the screen that uses it an owner screen.
  S.issueCode = (o) => {
    sweep();
    if (codes.size >= 20) codes.delete(codes.keys().next().value);
    let c = makeCode(); while (codes.has(c)) c = makeCode();
    const expiresAt = now() + pairMs;
    codes.set(c, { expiresAt, owner: !!(o && o.owner) });
    return { code: c, expiresAt, owner: !!(o && o.owner) };
  };
  // Exchanges a pairing code and a name for a token. Returns { ok, token, screen } or { ok:false, report }. The code is used up on success.
  S.exchange = (code, name, addr) => {
    const t = now();
    if (lockedUntil > t) return { ok: false, report: 'tooManyTries' };
    const f = addrFails.get(addr);
    if (f && f.until > t) return { ok: false, report: 'tooManyTries' };
    const nm = typeof name === 'string' ? name.trim() : '';
    if (nm !== '' && !NAME_OK.test(nm)) return { ok: false, report: 'badName' };
    sweep();
    const given = String(typeof code === 'string' ? code : '').toUpperCase().replace(/[\s-]/g, '');
    let hit = null;
    for (const [c, v] of codes) if (crypto.timingSafeEqual(sha(c), sha(given))) hit = [c, v];
    if (!hit) {
      const n = (f ? (f.until && f.until <= t ? 0 : f.n) : 0) + 1;
      addrFails.set(addr, { n, until: n >= 5 ? t + 10 * 60 * 1000 : 0 });
      if (addrFails.size > 500) addrFails.delete(addrFails.keys().next().value);
      wrong = wrong.filter((x) => x > t - 10 * 60 * 1000); wrong.push(t);
      // Very many wrong guesses from anywhere (more than 300 in ten minutes; each address is already held to 5): every open code is burned and pairing pauses for ten minutes, so a spread-out guesser gets nowhere.
      if (wrong.length > 300) { codes.clear(); lockedUntil = t + 10 * 60 * 1000; wrong = []; return { ok: false, report: 'tooManyTries' }; }
      return { ok: false, report: n >= 5 ? 'tooManyTries' : 'badPairCode' };
    }
    codes.delete(hit[0]); addrFails.delete(addr);
    const id = crypto.randomBytes(5).toString('hex'), secret = crypto.randomBytes(32).toString('base64url');
    const screen = { id, name: nm, owner: hit[1].owner, hash: sha(secret).toString('hex'), createdAt: t, lastSeen: t, revokedAt: null };
    screens.push(screen); save();
    return { ok: true, token: id + '.' + secret, screen: S.pub(screen) };
  };
  // The fields of a screen that may be shown (never the hash).
  S.pub = (s) => ({ id: s.id, name: s.name, owner: !!s.owner, createdAt: s.createdAt, lastSeen: s.lastSeen, revokedAt: s.revokedAt });
  // Checks a token: { screen } when it is valid, else { report: 'unpaired' | 'revoked' }.
  S.authenticate = (token) => {
    const m = /^([0-9a-f]{10})\.([A-Za-z0-9_-]{20,64})$/.exec(String(token || ''));
    if (!m) return { report: 'unpaired' };
    const s = screens.find((x) => x.id === m[1]);
    if (!s || !crypto.timingSafeEqual(sha(m[2]), Buffer.from(s.hash, 'hex'))) return { report: 'unpaired' };
    if (s.revokedAt) return { report: 'revoked' };
    return { screen: s };
  };
  // Notes that a screen was just seen; saved at most once a minute.
  S.touch = (s) => { const t = now(); if (t - s.lastSeen < 60000) return; s.lastSeen = t; if (t - touchedAt > 60000) { touchedAt = t; save(); } };
  // Every screen, for the owner: no hashes.
  S.list = () => screens.map(S.pub);
  // Removes a screen: its token stops working at once. Returns the screen or null.
  S.revoke = (id) => { const s = screens.find((x) => x.id === id); if (!s) return null; if (!s.revokedAt) { s.revokedAt = now(); save(); } if (typeof opts.onRevoke === 'function') { try { opts.onRevoke(id); } catch (e) { /* the screen is removed all the same */ } } return s; };
  // How many screens are paired and not removed.
  S.activeCount = () => screens.filter((s) => !s.revokedAt).length;
  return S;
}
