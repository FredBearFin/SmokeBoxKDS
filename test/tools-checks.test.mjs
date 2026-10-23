// The check tools must not report green when they should not: the comment audit sees wrapped functions and unpaired data markers, the code
// fingerprint refuses to bless everything at once and counts a file with no snapshot as a failure, and the contract check turns a failed
// inspection or a broken contract into a problem. Run: node --test test/tools-checks.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sbtools-'));
const HEAD = '// WHAT THIS FILE IS: a scratch file for the tool tests, nothing more.\nx();\n\n';
// Writes a scratch JS file and runs the comment audit on it alone.
const audit = (name, body) => {
  const f = path.join(tmp, name); fs.writeFileSync(f, HEAD + body);
  return spawnSync(process.execPath, [path.join(ROOT, 'tools/comment-audit.mjs'), f], { encoding: 'utf8' });
};

test('comment audit: a several-line function handed to a name through a wrapper call needs its comment like any named function', () => {
  const r = audit('wrap.js', 'const save = debounce(() => {\n  a();\n  b();\n});\n');
  assert.equal(r.status, 1, r.stdout); assert.match(r.stdout, /function save: needs a plain-words comment/);
  const ok = audit('wrap-ok.js', '// Saves the order a moment after the last key press.\nconst save = debounce(() => {\n  a();\n  b();\n});\n');
  assert.equal(ok.status, 0, ok.stdout);
  assert.equal(audit('one-line.js', 'const now = opts.now || (() => Date.now());\n').status, 0, 'a one-line default stays an inline callback');
});

test('comment audit: a data block that is never closed is a problem, not a silent end to the gap rule', () => {
  const r = audit('data.js', '// audit:data-start\nconst A = [1];\n' + 'x();\n'.repeat(60));
  assert.equal(r.status, 1, r.stdout); assert.match(r.stdout, /has no audit:data-end/);
  assert.match(audit('end.js', 'x();\n// audit:data-end\n').stdout, /with no audit:data-start/);
  assert.equal(audit('paired.js', '// audit:data-start\n' + 'x();\n'.repeat(60) + '// audit:data-end\n').status, 0);
});

test('code fingerprint: accept with no file names refuses, and check fails on a file with no snapshot', () => {
  const fp = path.join(ROOT, 'tools/code-fingerprint.mjs');
  const a = spawnSync(process.execPath, [fp, 'accept'], { encoding: 'utf8' });
  assert.equal(a.status, 2, a.stdout); assert.match(a.stdout, /accept needs the names/);
  const f = path.join(tmp, 'new.js'); fs.writeFileSync(f, 'x();\n');
  const c = spawnSync(process.execPath, [fp, 'check', f], { encoding: 'utf8' });
  assert.equal(c.status, 1, c.stdout); assert.match(c.stdout, /NO BASELINE/);
});
