#!/usr/bin/env node
// WHAT THIS FILE IS: One command that runs every check in order, one after another, and prints a final table: build, unit files, comment audit, smoke,
//    Guide checks, the Guide walk, then every slow browser suite (test/*.e2e.mjs) and the qa journeys. Each step has a time limit and its own log.
// Usage: node tools/run-all.mjs [--only=unit,smoke,...] [--skip=qa,...] [--log-dir=/tmp/slow/run-all] [--timeout=1200] [--fast]
//    --fast runs only build, unit, comment audit, smoke and the Guide checks. A step name is one of: build, unit, audit, smoke, guide, walk, qa, or a slow suite name
//    (see `node tools/run-slow.mjs`). Exit 0 only if every step passed. Timing-only failures on a busy machine: run the failing step alone with run-slow.
// PARTS: step list, runner, table. USES: node, tools/*.mjs, test/*.e2e.mjs. USED BY: people, before a merge or a release.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find((x) => x.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const only = opt('only', '') ? opt('only', '').split(',') : null, skip = opt('skip', '').split(',').filter(Boolean);
const logDir = opt('log-dir', '/tmp/slow/run-all-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)), timeout = Number(opt('timeout', 1200)), fast = args.includes('--fast');
fs.mkdirSync(logDir, { recursive: true });

// The suites run-slow knows (its usage line lists them); the optional ux-* scripts are not part of a full run.
const list = spawnSync('node', [path.join(ROOT, 'tools/run-slow.mjs')], { encoding: 'utf8' }).stdout || '';
const slow = ((/Suites: (.*)/.exec(list) || [])[1] || '').split(',').map((x) => x.trim()).filter((x) => x && !x.startsWith('ux-') && x !== 'qa');
const steps = [
  { name: 'build', cmd: ['node', 'tools/build.mjs', '--quiet'], fast: true },
  { name: 'unit', cmd: ['node', 'tools/test.mjs'], fast: true },
  { name: 'audit', cmd: ['node', 'tools/comment-audit.mjs'], fast: true },
  { name: 'smoke', cmd: ['node', 'tools/smoke.mjs'], fast: true },
  { name: 'guide', cmd: ['sh', '-c', 'node --test test/guide.test.mjs && node tools/build-guide.mjs --check && node tools/guide-a11y.mjs'], fast: true },
  { name: 'walk', cmd: ['node', 'tools/guide-walk.mjs'] },
  ...slow.map((n) => ({ name: n, cmd: ['node', 'tools/run-slow.mjs', n, '--log-dir=' + logDir, '--timeout=' + timeout], own: true })),
  { name: 'qa', cmd: ['node', 'tools/run-slow.mjs', 'qa', '--log-dir=' + logDir, '--timeout=' + Math.max(timeout, 1800)], own: true },
];
const chosen = steps.filter((s) => (only ? only.includes(s.name) : fast ? s.fast : true) && !skip.includes(s.name));
const rows = [];
for (const s of chosen) {
  const t0 = Date.now(); process.stdout.write(`running ${s.name} ... `);
  const r = spawnSync(s.cmd[0], s.cmd.slice(1), { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, env: process.env, timeout: (s.own ? Math.max(timeout, 1800) + 60 : timeout) * 1000 });
  const secs = (Date.now() - t0) / 1000, out = (r.stdout || '') + (r.stderr || '');
  fs.writeFileSync(path.join(logDir, s.name + '.log'), `$ ${s.cmd.join(' ')}\n${out}\n[exit ${r.status}] ${secs.toFixed(1)} s\n`);
  const code = r.status === null ? 'timeout' : r.status;
  rows.push({ name: s.name, ok: r.status === 0, code, secs });
  console.log(`${r.status === 0 ? 'PASS' : 'FAIL'} ${secs.toFixed(0)} s`);
}
const bad = rows.filter((r) => !r.ok);
const table = ['', 'step'.padEnd(24) + 'result   seconds', '-'.repeat(46), ...rows.map((r) => r.name.padEnd(24) + (r.ok ? 'PASS' : 'FAIL (' + r.code + ')').padEnd(9) + r.secs.toFixed(0).padStart(6)), '-'.repeat(46), `${rows.length - bad.length} passed, ${bad.length} failed.  Logs: ${logDir}`, bad.length ? 'Failed: ' + bad.map((r) => r.name).join(', ') + '   (a failure that looks like timing: rerun alone with `node tools/run-slow.mjs <name>`)' : 'All steps passed.'].join('\n');
fs.writeFileSync(path.join(logDir, 'table.txt'), table + '\n');
console.log(table);
process.exit(bad.length ? 1 : 0);
