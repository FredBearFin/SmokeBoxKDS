#!/usr/bin/env node
// WHAT THIS FILE IS: Runs every test/*.test.mjs file with Node's built-in test runner and exits with its
// result. Run: node tools/test.mjs [pattern], where pattern keeps only test files whose name contains it
// (for example "store").
// PARTS: pick the files, run them, pass the exit code on. USES: test/*.test.mjs. USED BY: you, from the
// command line.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pat = process.argv[2];
const files = fs.readdirSync(path.join(root, 'test')).filter((f) => f.endsWith('.test.mjs') && (!pat || f.includes(pat))).map((f) => path.join('test', f));
if (!files.length) { console.log('no tests found'); process.exit(0); }
const r = spawnSync(process.execPath, ['--test', '--test-reporter=spec', ...files], { cwd: root, stdio: 'inherit' });
process.exit(r.status ?? 1);
