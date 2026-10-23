// WHAT THIS FILE IS: Runs one slow browser suite (or all of them, one after another) with a time limit and saves the full
// output to a log file, then prints the runtime and a pass/fail line. Usage: node tools/run-slow.mjs <suite|all> [--log-dir=/tmp] [--timeout=600]
// PARTS: suite list, runOne, main. USES: node and the suites in test/. USED BY: people running the slow checks.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Every slow suite by short name; the e2e folder files are added by scanning the folder.
function suites() {
  const out = {};
  for (const f of fs.readdirSync(path.join(ROOT, 'test'))) {
    if (/\.e2e\.mjs$/.test(f)) out[f.replace(/\.e2e\.mjs$/, '')] = 'test/' + f;
  }
  // The journeys in test/e2e/ have no main of their own; tools/qa.mjs runs them all. --no-report keeps docs/qa-report.md untouched.
  out.qa = 'tools/qa.mjs --no-report';
  return out;
}

// Runs one suite file under a timeout, writes <logDir>/<name>.log, and returns the exit code and seconds taken.
function runOne(name, file, logDir, timeoutS) {
  const t0 = Date.now();
  const r = spawnSync('timeout', [String(timeoutS), 'node', ...file.split(' ')], { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, env: process.env });
  const secs = (Date.now() - t0) / 1000;
  fs.mkdirSync(logDir, { recursive: true });
  fs.writeFileSync(path.join(logDir, name + '.log'), `$ node ${file}\n` + (r.stdout || '') + (r.stderr || '') + `\n[exit ${r.status}] ${secs.toFixed(1)} s\n`);
  return { name, code: r.status, secs };
}

const args = process.argv.slice(2);
const opt = (k, d) => (args.find((a) => a.startsWith('--' + k + '=')) || '').split('=')[1] || d;
const want = args.find((a) => !a.startsWith('--'));
const all = suites();
if (!want || (want !== 'all' && !all[want])) {
  console.log('Usage: node tools/run-slow.mjs <suite|all> [--log-dir=/tmp/slow] [--timeout=600]\nSuites: ' + Object.keys(all).join(', '));
  process.exit(want ? 2 : 0);
}
const names = want === 'all' ? Object.keys(all) : [want];
let bad = 0;
for (const n of names) {
  const r = runOne(n, all[n], opt('log-dir', '/tmp/slow'), Number(opt('timeout', 600)));
  console.log(`${r.code === 0 ? 'PASS' : 'FAIL'} ${n} exit=${r.code} ${r.secs.toFixed(1)} s`);
  if (r.code !== 0) bad++;
}
process.exit(bad ? 1 : 0);
