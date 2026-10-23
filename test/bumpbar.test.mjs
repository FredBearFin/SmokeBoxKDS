// Bump-bar keys: which dish a start or done key acts on, and the key list the Help sheet shows.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSB } from './_load.mjs';

const SB = await loadSB(['00-util', '10-config', '70-floor-board']);
const F = SB.floor;
const NOW = 1e9;

test('start picks the dish that has waited longest among two-step dishes that are ready', () => {
  const items = [
    { id: 'a', status: 'displayed', track: 'two', firedAt: NOW - 1000 },
    { id: 'b', status: 'displayed', track: 'two', firedAt: NOW - 9000 },
    { id: 'c', status: 'displayed', track: 'one', firedAt: NOW - 20000 },
    { id: 'd', status: 'queued', track: 'two', firedAt: 0 },
  ];
  assert.equal(F.pickItem(items, 'start', NOW).id, 'b');
});

test('done picks a cooking dish whose time is up before one still within its time, and counts one-step dishes ready', () => {
  const items = [
    { id: 'x', status: 'cooking', track: 'two', startedAt: NOW - 60e3, prepSec: 300 },
    { id: 'y', status: 'cooking', track: 'two', startedAt: NOW - 400e3, prepSec: 300 },
    { id: 'z', status: 'displayed', track: 'one', firedAt: NOW - 1000 },
  ];
  assert.equal(F.pickItem(items, 'done', NOW).id, 'y');
  assert.equal(F.pickItem(items.slice(2), 'done', NOW).id, 'z');
});

test('nothing to pick gives null', () => {
  assert.equal(F.pickItem([{ id: 'q', status: 'done', track: 'two' }], 'start', NOW), null);
  assert.equal(F.pickItem([], 'done', NOW), null);
  assert.equal(F.pickItem(null, 'done', NOW), null);
});

test('the key list names every bump-bar key', () => {
  const keys = F.shortcuts.flatMap((s) => s.keys);
  for (const k of ['J', 'K', 'S', 'F', 'B', 'Enter', 'L', 'Right', 'Left']) assert.ok(keys.includes(k), k);
});
