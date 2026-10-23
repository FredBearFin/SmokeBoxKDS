// Every stylesheet in src/css has matching braces (a stray closing brace silently drops the rules after it).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/css');
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.css'))) {
  test('css braces balance in ' + f, () => {
    const css = fs.readFileSync(path.join(dir, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, '""');
    let depth = 0;
    for (const c of css) { if (c === '{') depth++; else if (c === '}') depth--; assert.ok(depth >= 0, 'a closing brace has no opening brace'); }
    assert.equal(depth, 0, 'unclosed brace');
  });
}
