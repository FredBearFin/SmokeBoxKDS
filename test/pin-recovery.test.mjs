// PIN recovery code: made once for a PIN, only its hash is kept, resets the PIN, attempts are limited, old PINs can add one.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadSB, ROOT } from './_load.mjs';

const SB = await loadSB(['00-util', '10-config', '20-engine', '30-store']);
const { store: S, engine: E, util: U } = SB;
const T = 1780326000000, MIN = 60e3;
const PIN = 'sha256:' + 'ab12'.repeat(16), NEWPIN = 'sha256:' + 'cd34'.repeat(16);
let clock = T;
function backend(entries) {
  const m = new Map(Object.entries(entries || {}));
  return { m, persistent: true, get: (k, f) => (m.has(k) ? JSON.parse(m.get(k)) : f), raw: (k) => (m.has(k) ? m.get(k) : null), set: (k, v) => { m.set(k, JSON.stringify(v)); return true; }, remove: (k) => { m.delete(k); }, keys: (p) => Array.from(m.keys()).filter((k) => k.indexOf(p) === 0) };
}
const start = (b, mode) => S.init({ storage: b, mode: mode || 'real', blank: true, noTimers: true, noSync: true, now: () => clock });
const withPin = (b) => { start(b); S.dispatch('updateSettings', { patch: { office: { pinHash: PIN } } }); };

test('a recovery code needs a PIN, looks like ABCDE-FGHJK, and only its hash is saved anywhere', async () => {
  clock = T;
  const b = backend(); start(b);
  try {
    assert.deepEqual([(await S.createRecoveryCode()).ok, (await S.createRecoveryCode()).report], [false, 'pinRequired']);
    S.dispatch('updateSettings', { patch: { office: { pinHash: PIN } } });
    assert.equal(S.hasRecoveryCode(), false);
    const r = await S.createRecoveryCode();
    assert.equal(r.ok, true); assert.match(r.code, /^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/);
    assert.equal(S.hasRecoveryCode(), true);
    S.flush();
    const plain = r.code.replace('-', '');
    assert.match(S.getState().settings.office.recoveryHash, /^sha256:[0-9a-f]{64}$/);
    for (const text of [b.m.get('smokebox.v1.state'), S.exportAll(), JSON.stringify(E.allEvents(S.getState())), JSON.stringify(S.getState())]) { assert.equal(text.indexOf(plain), -1); assert.equal(text.indexOf(r.code), -1); }
    const r2 = await S.createRecoveryCode();                                   // a new code replaces the old one
    assert.notEqual(r2.code, r.code);
    assert.deepEqual([(await S.recoverPin(r.code, NEWPIN)).report, S.getState().settings.office.pinHash === PIN], ['wrongRecoveryCode', true]);
    assert.deepEqual(E.checkInvariants(S.getState(), S.now()), []);
    const codes = new Set(); for (let i = 0; i < 20; i++) codes.add((await S.createRecoveryCode()).code); assert.equal(codes.size, 20);
  } finally { S.destroy(); }
});

test('the right code resets the PIN (or removes it) and is spent; typing is forgiving', async () => {
  clock = T;
  const b = backend(); withPin(b);
  try {
    let { code } = await S.createRecoveryCode();
    const messy = ' ' + code.toLowerCase().replace('-', ' - ') + ' ';
    const r = await S.recoverPin(messy, NEWPIN);
    assert.deepEqual([r.ok, r.report], [true, 'ok']);
    assert.equal(S.getState().settings.office.pinHash, NEWPIN);
    assert.equal(S.hasRecoveryCode(), false);                                          // spent
    assert.equal((await S.recoverPin(code, PIN)).report, 'noRecoveryCode');
    assert.equal(S.getState().settings.office.pinHash, NEWPIN);
    // remove the PIN with a new code
    code = (await S.createRecoveryCode()).code;
    const rm = await S.recoverPin(code, null);
    assert.deepEqual([rm.ok, rm.info.pinRemoved, S.getState().settings.office.pinHash], [true, true, null]);
    assert.ok(E.allEvents(S.getState()).some((e) => e.type === 'settings_changed'));
    assert.deepEqual(E.checkInvariants(S.getState(), S.now()), []);
    // bad new PIN values are refused without spending the code
    code = (await S.createRecoveryCode()).code;                                         // refused: no PIN now
    assert.equal((await S.createRecoveryCode()).report, 'pinRequired');
  } finally { S.destroy(); }
  clock = T; const c = backend(); withPin(c);
  try {
    const { code } = await S.createRecoveryCode();
    for (const bad of [undefined, 5, '', {}, 'x'.repeat(200)]) assert.equal((await S.recoverPin(code, bad)).report, 'badPatch', String(bad));
    assert.equal(S.hasRecoveryCode(), true);
  } finally { S.destroy(); }
});

test('wrong codes are counted, five lock it for 15 minutes even for the right code, and the count survives a reload', async () => {
  clock = T;
  const b = backend(); withPin(b);
  try {
    const { code } = await S.createRecoveryCode();
    S.flush();
    for (let i = 1; i <= 4; i++) { const r = await S.recoverPin('AAAAA-AAAAA', NEWPIN); assert.deepEqual([r.report, r.info.triesLeft], ['wrongRecoveryCode', 5 - i]); }
    assert.match(E.describe('wrongRecoveryCode', { triesLeft: 1 }), /1 try left/);
    S.destroy(); start(b);                                                                // the count is saved
    const r5 = await S.recoverPin('not a code', NEWPIN);
    assert.deepEqual([r5.report, r5.info.waitMs], ['recoveryLocked', 15 * MIN]);          // the fifth wrong try locks
    assert.equal((await S.recoverPin(code, NEWPIN)).report, 'recoveryLocked');            // even the right code
    assert.equal(S.getState().settings.office.pinHash, PIN);
    assert.match(E.describe('recoveryLocked', { waitMs: 14 * MIN + 1 }), /15 minutes/);
    clock = T + 10 * MIN; const mid = await S.recoverPin(code, NEWPIN); assert.equal(mid.report, 'recoveryLocked'); assert.ok(mid.info.waitMs <= 5 * MIN);
    S.destroy(); clock = T + 16 * MIN; start(b);                                         // locked state survives a reload, then ends
    const ok = await S.recoverPin(code, NEWPIN);
    assert.deepEqual([ok.ok, S.getState().settings.office.pinHash], [true, NEWPIN]);
    assert.equal(b.keys('smokebox.v1.pinrecovery').length, 0);                           // the counter is cleared
  } finally { S.destroy(); }
});

test('an old PIN without a code keeps working and can add one; kitchens without a PIN are unaffected; the demo keeps its own', async () => {
  const dir = path.join(ROOT, 'test/fixtures/old-saves');
  const fx = JSON.parse(fs.readFileSync(path.join(dir, '5e02d1e.json'), 'utf8'));
  clock = Date.UTC(2026, 9, 17, 20);
  const b = backend(fx.storage); start(b);
  try {
    assert.equal(S.getState().settings.office.pinHash, fx.expect.pinHash);               // the old PIN is untouched
    assert.equal(S.hasRecoveryCode(), false);
    assert.equal((await S.recoverPin('ABCDE-FGHJK', NEWPIN)).report, 'noRecoveryCode');
    const r = await S.createRecoveryCode(); assert.equal(r.ok, true);
    assert.equal(S.getState().settings.office.pinHash, fx.expect.pinHash);               // adding a code does not change the PIN
    assert.deepEqual(E.checkInvariants(S.getState(), S.now()), []);
    assert.equal((await S.recoverPin(r.code, NEWPIN)).ok, true);
    // the schema accepts the field and refuses junk
    const s = E.newState({ now: T, blank: true });
    assert.equal(E.apply(s, 'updateSettings', { patch: { office: { recoveryHash: 5 } } }, T).report, 'badPatch');
    assert.equal(E.apply(s, 'updateSettings', { patch: { office: { recoveryHash: 'sha256:abc' } } }, T).report, 'ok');
  } finally { S.destroy(); }
  assert.ok(U.dataKeys.includes('smokebox.v1.pinrecovery'));
  clock = T;
  const d = backend(); start(d, 'demo');
  try {
    S.dispatch('updateSettings', { patch: { office: { pinHash: PIN } } }); await S.createRecoveryCode(); S.flush();
    assert.deepEqual(d.keys('smokebox.v1.'), []);                                         // nothing under the real names
  } finally { S.destroy(); }
});
