// Router role tests: pure address parsing for the kitchen, new (order entry) and office views, the
// ?role= query, start screens per role, and that the old floor and office addresses still round-trip.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSB } from './_load.mjs';

const SB = await loadSB(['00-util', '05-icons', '10-config', '60-shell']);
const R = SB.router;

test('old floor and office addresses are unchanged', () => {
  assert.deepEqual(R.viewFor('#/'), { kind: 'floor', zone: 'all' });
  assert.deepEqual(R.viewFor('#/s/pit'), { kind: 'floor', zone: 'pit' });
  assert.deepEqual(R.viewFor('#/office/money'), { kind: 'office', section: 'money' });
  assert.deepEqual(R.viewFor('#/office/nonsense'), { kind: 'office', section: 'pace' });
  assert.equal(R.hashFor({ kind: 'floor', zone: 'all' }), '#/');
  assert.equal(R.hashFor({ kind: 'office', section: 'pace' }), '#/office');
});

test('kitchen and new views parse and round-trip', () => {
  assert.deepEqual(R.viewFor('#/kitchen'), { kind: 'kitchen', zone: 'all' });
  assert.deepEqual(R.viewFor('#/Kitchen/PIT'), { kind: 'kitchen', zone: 'pit' });
  assert.deepEqual(R.viewFor('#/kitchen/nope'), { kind: 'kitchen', zone: 'all' });
  assert.deepEqual(R.viewFor('#/new'), { kind: 'new' });
  assert.deepEqual(R.viewFor('#/new/extra?x=1'), { kind: 'new' });
  for (const v of [{ kind: 'kitchen', zone: 'all' }, { kind: 'kitchen', zone: 'fry' }, { kind: 'new' }]) {
    assert.deepEqual(R.viewFor(R.hashFor(v)), v);
  }
  assert.equal(R.hashFor({ kind: 'kitchen', zone: 'all' }), '#/kitchen');
  assert.equal(R.hashFor({ kind: 'new' }), '#/new');
});

test('garbage never throws and lands on the whole floor', () => {
  for (const g of [null, undefined, 0, {}, [], '%', '#/new%', { kind: 'kitchen', zone: 'x' }, { kind: 'new', zone: 'pit' }]) {
    const v = R.viewFor(typeof g === 'string' ? g : String(g));
    assert.ok(['floor', 'kitchen', 'new', 'office'].includes(v.kind));
    assert.deepEqual(R.viewFor(R.hashFor(g)), R.viewFor(R.hashFor(R.viewFor(R.hashFor(g)))));
  }
  assert.deepEqual(R.viewFor(R.hashFor({ kind: 'new', zone: 'pit' })), { kind: 'new' });
});

test('?role= is read for known roles only', () => {
  assert.equal(R.roleFor('?role=kitchen'), 'kitchen');
  assert.equal(R.roleFor('?a=1&role=Front'), 'front');
  assert.equal(R.roleFor('?role=manager'), 'manager');
  assert.equal(R.roleFor('?role=all'), 'all');
  assert.equal(R.roleFor('?role=chef'), null);
  assert.equal(R.roleFor(''), null);
  assert.equal(R.roleFor(null), null);
});

test('each role has a start screen; all-in-one has none', () => {
  assert.deepEqual(R.startViewFor('kitchen'), { kind: 'kitchen', zone: 'all' });
  assert.deepEqual(R.startViewFor('front'), { kind: 'new' });
  assert.deepEqual(R.startViewFor('manager'), { kind: 'office', section: 'pace' });
  assert.equal(R.startViewFor('all'), null);
});

test('role() defaults to all and setRole ignores unknown names', () => {
  assert.equal(R.role(), 'all');
  assert.equal(R.setRole('chef'), 'all');
  assert.equal(R.setRole('kitchen'), 'kitchen');
  assert.equal(R.role(), 'kitchen');
  R.setRole('all');
});
