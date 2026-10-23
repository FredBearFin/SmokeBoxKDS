// Golden hashes: the barbecue starter states and the default settings must stay byte for byte what they were
// before the clean-start work. If one of these fails, the demo or every legacy save would change.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { loadSB } from './_load.mjs';

const SB = await loadSB(['00-util', '10-config', '20-engine']);
const E = SB.engine;
const T = 1780326000000;
const h = (o) => crypto.createHash('sha256').update(JSON.stringify(o)).digest('hex').slice(0, 16);

test('newState() default is unchanged', () => assert.equal(h(E.newState({ now: T })), 'd1e3dde4245f337c'));
test('newState starter+stagger (the demo) is unchanged', () => assert.equal(h(E.newState({ now: T, starter: true, stagger: true })), '1c01446dc2188340'));
test('newState starter:false is unchanged', () => assert.equal(h(E.newState({ now: T, starter: false })), 'a0611925cf0dd67d'));
test('newState empty:true is unchanged', () => assert.equal(h(E.newState({ now: T, empty: true })), '341a3ab02b13a469'));
test('defaultSettings() is unchanged', () => assert.equal(h(E.defaultSettings()), 'f13053e155e5c4dc'));
test('a barbecue demo state passes the backup check with no repairs', () => {
  const v = E.validateBackup(JSON.stringify(E.newState({ now: T, starter: true, stagger: true })));
  assert.equal(v.ok, true);
  assert.deepEqual(v.repaired, []);
});
