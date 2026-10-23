// Independent-review fix #13: PIN and recovery hashes are salted and slowed (PBKDF2), old unsalted hashes still work and are upgraded on the next
// good entry. A 4-digit PIN stays a door latch; this only makes a copy of the backup file harder to read the PIN from.
import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { loadSB } from './_load.mjs';

const SB = await loadSB(['00-util', '10-config', '20-engine', '30-store']);
const U = SB.util, S = SB.store;
if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
const T0 = new Date(2026, 9, 17, 12, 0, 0).getTime();
// The old unsalted form, as earlier builds saved it.
const legacy = async (domain, plain) => 'sha256:' + Buffer.from(await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(domain + plain))).toString('hex');
// A memory storage like the app's.
function mem() { const m = new Map(); return { persistent: true, m, get: (k, f) => (m.has(k) ? JSON.parse(m.get(k)) : f), raw: (k) => (m.has(k) ? m.get(k) : null), set: (k, v) => { m.set(k, JSON.stringify(v)); return true; }, remove: (k) => m.delete(k), keys: () => [...m.keys()] }; }
const boot = () => S.init({ now: () => T0, storage: mem(), noTimers: true, noSync: true, starter: true, mode: 'real' });

test('#13: a new hash is salted (two hashes of one secret differ), slow-form, and checks back', async () => {
  const a = await U.secretHash('smokebox.v1:', '0000'), b = await U.secretHash('smokebox.v1:', '0000');
  assert.match(a, /^pbkdf2:100000:[0-9a-f]{32}:[0-9a-f]{64}$/);
  assert.notEqual(a, b, 'a fresh salt each time');
  assert.ok(a.length <= 128, 'fits the settings field');
  assert.deepEqual(await U.secretCheck('smokebox.v1:', '0000', a), { ok: true, legacy: false });
  assert.equal((await U.secretCheck('smokebox.v1:', '0001', a)).ok, false);
  assert.equal((await U.secretCheck('smokebox-recovery-v1:', '0000', a)).ok, false, 'a PIN hash is not a recovery hash');
});

test('#13: an old unsalted hash still checks out and says it is old; wrong secrets and junk never match or throw', async () => {
  const old = await legacy('smokebox.v1:', '4321');
  assert.deepEqual(await U.secretCheck('smokebox.v1:', '4321', old), { ok: true, legacy: true });
  assert.equal((await U.secretCheck('smokebox.v1:', '1234', old)).ok, false);
  for (const junk of [null, undefined, 5, '', 'sha256:abc', 'pbkdf2:x', 'pbkdf2:99999999:aa:bb', 'pbkdf2:1:zz:' + '0'.repeat(64)]) assert.equal((await U.secretCheck('d', 'x', junk)).ok, false);
});

test('#13: offline cracking costs real work now: ten thousand PIN guesses cost seconds, not a millisecond', async () => {
  const h = await U.secretHash('smokebox.v1:', '9999');
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < 20; i++) await U.secretCheck('smokebox.v1:', String(1000 + i), h);
  const per = Number(process.hrtime.bigint() - t0) / 1e6 / 20;
  assert.ok(per >= 3, 'each guess takes ' + per.toFixed(1) + ' ms; the old hash took well under 0.1');
});

test('#13: a new recovery code is stored salted, works, and an old unsalted recovery hash still works for recovery', async () => {
  boot();
  S.dispatch('updateSettings', { patch: { office: { pinHash: 'sha256:' + 'ab12'.repeat(16) } } }, { source: 'user' });
  const made = await S.createRecoveryCode();
  assert.equal(made.ok, true);
  assert.match(S.getState().settings.office.recoveryHash, /^pbkdf2:100000:[0-9a-f]{32}:[0-9a-f]{64}$/);
  const ok = await S.recoverPin(made.code, 'sha256:' + 'cd34'.repeat(16));
  assert.equal(ok.ok, true);
  // an old unsalted recovery hash from an earlier build
  boot();
  S.dispatch('updateSettings', { patch: { office: { pinHash: 'sha256:' + 'ab12'.repeat(16), recoveryHash: await legacy('smokebox-recovery-v1:', 'ABCDEFGHJK') } } }, { source: 'user' });
  const bad = await S.recoverPin('ZZZZZ-ZZZZZ', null);
  assert.equal(bad.ok, false);
  const good = await S.recoverPin('ABCDE-FGHJK', 'sha256:' + 'cd34'.repeat(16));
  assert.equal(good.ok, true, JSON.stringify(good));
});
