#!/usr/bin/env node
// Verifies every text/background and UI-border pair of the shell tokens with SB.util.contrast.
// Reads src/css/00-tokens.css directly (so the check can never drift from the real tokens).
//   node test/shell.contrast.mjs            print the table, exit 1 when a pair fails
//   node test/shell.contrast.mjs --write    also replace the <!--CONTRAST--> block in docs/design-notes.md
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import '../src/js/00-util.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = fs.readFileSync(path.join(root, 'src/css/00-tokens.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const { contrast } = globalThis.SB.util;

/* tiny parser: "selector { --a: b; ... }" blocks, no nesting in the token file */
const blocks = [];
css.replace(/([^{}]+)\{([^{}]*)\}/g, (_, sel, body) => {
  const vars = {};
  body.replace(/(--[\w-]+)\s*:\s*([^;]+);/g, (__, k, v) => { vars[k] = v.trim(); return ''; });
  blocks.push({ sel: sel.trim().replace(/\s+/g, ' '), vars });
  return '';
});
const get = (sel) => { const b = blocks.filter((x) => x.sel === sel); if (!b.length) throw new Error('token block missing: ' + sel); return Object.assign({}, ...b.map((x) => x.vars)); };

const DAY = get(':root, :root[data-theme="day"]');
const BASE = get(':root');
const NIGHT = Object.assign({}, DAY, get(':root[data-theme="night"]'));
const EMBER = Object.assign({}, get('.office, .office[data-otheme="ember"]'));
const PAPER = Object.assign({}, EMBER, get('.office[data-otheme="paper"]'));
const REMAP = get('.office');
const SLIPREMAP = get('.slip');

function resolve(map, v, depth = 0) {
  if (depth > 8) return v;
  const m = /^var\((--[\w-]+)\)$/.exec(v);
  return m ? resolve(map, map[m[1]] || '', depth + 1) : v;
}
function office(base) {
  const m = Object.assign({}, DAY, base, REMAP);
  const out = {};
  for (const k in m) out[k] = resolve(m, m[k]);
  return out;
}
const flat = (m) => { const o = {}; for (const k in m) o[k] = resolve(m, m[k]); return o; };
function withSlip(theme) { // floor theme map, then the .slip remap on top
  const m = Object.assign({}, theme, SLIPREMAP);
  const out = {}; for (const k in m) out[k] = resolve(m, m[k]);
  return out;
}

const THEMES = [
  { name: 'Day', t: flat(DAY) },
  { name: 'Night', t: flat(NIGHT) },
  { name: 'Ember', t: office(EMBER) },
  { name: 'Paper', t: office(PAPER) },
];

/* [foreground token, background token, minimum ratio, what it is] */
const TEXT = 4.5, UI = 3;
const floorPairs = [
  ['ink', 'bg', TEXT, 'body text on board'], ['ink', 'paper', TEXT, 'body text on card/field'], ['ink', 'sub', TEXT, 'body text on sub-surface'],
  ['ink2', 'bg', TEXT, 'secondary text'], ['ink2', 'paper', TEXT, 'secondary text on card'], ['ink2', 'sub', TEXT, 'secondary text on sub'],
  ['ink3', 'bg', TEXT, 'tertiary text'], ['ink3', 'paper', TEXT, 'tertiary text on card'], ['ink3', 'sub', TEXT, 'tertiary text on sub'],
  ['amber-ink', 'bg', TEXT, 'amber text'], ['amber-ink', 'paper', TEXT, 'amber text on card'], ['amber-ink', 'sub', TEXT, 'amber text on sub'], ['amber-ink', 'tint-warn', TEXT, 'amber text on warn tint'],
  ['sage-ink', 'bg', TEXT, 'sage text'], ['sage-ink', 'paper', TEXT, 'sage text on card'], ['sage-ink', 'sub', TEXT, 'sage text on sub'], ['sage-ink', 'tint-ok', TEXT, 'sage text on ok tint'],
  ['crimson', 'bg', TEXT, 'overdue text'], ['crimson', 'paper', TEXT, 'overdue text on card'], ['crimson', 'sub', TEXT, 'overdue text on sub'], ['crimson', 'tint-bad', TEXT, 'overdue text on bad tint'],
  ['ink', 'tint-warn', TEXT, 'ink on warn tint'], ['ink', 'tint-bad', TEXT, 'ink on bad tint'], ['ink', 'tint-ok', TEXT, 'ink on ok tint'],
  ['ink3', 'tint-warn', TEXT, 'ink3 on warn tint'], ['ink3', 'tint-bad', TEXT, 'ink3 on bad tint'],
  ['on-primary', 'primary', TEXT, 'primary button label'], ['on-success', 'success', TEXT, 'success button label'], ['on-danger', 'danger', TEXT, 'danger button label'],
  ['inv-ink', 'inv-bg', TEXT, 'toast text'], ['inv-ok', 'inv-bg', UI, 'toast ok icon/stripe'], ['inv-warn', 'inv-bg', UI, 'toast warn icon/stripe'], ['inv-bad', 'inv-bg', UI, 'toast bad icon/stripe'], ['inv-ink2', 'inv-bg', TEXT, 'toast secondary'], ['inv-accent', 'inv-bg', TEXT, 'toast action (Undo)'],
  ['z-pit', 'bg', TEXT, 'PIT hue as text'], ['z-sides', 'bg', TEXT, 'HOT hue as text'], ['z-fry', 'bg', TEXT, 'FRY hue as text'], ['z-cold', 'bg', TEXT, 'CLD hue as text'], ['z-expo', 'bg', TEXT, 'EXP hue as text'],
  ['z-pit', 'paper', TEXT, 'PIT hue on card'], ['z-sides', 'paper', TEXT, 'HOT hue on card'], ['z-fry', 'paper', TEXT, 'FRY hue on card'], ['z-cold', 'paper', TEXT, 'CLD hue on card'], ['z-expo', 'paper', TEXT, 'EXP hue on card'],
  ['z-pit', 'sub', TEXT, 'PIT hue on sub'], ['z-sides', 'sub', TEXT, 'HOT hue on sub'], ['z-fry', 'sub', TEXT, 'FRY hue on sub'], ['z-cold', 'sub', TEXT, 'CLD hue on sub'], ['z-expo', 'sub', TEXT, 'EXP hue on sub'],
  /* UI components: borders, focus, fills against the surface they sit on */
  ['line', 'bg', UI, 'border on board'], ['line', 'paper', UI, 'border on card'], ['line', 'sub', UI, 'border on sub'],
  ['focus', 'bg', UI, 'focus ring on board'], ['focus', 'paper', UI, 'focus ring on card'], ['focus', 'sub', UI, 'focus ring on sub'],
  ['amber', 'bg', UI, 'amber border/fill on board'], ['amber', 'paper', UI, 'amber border/fill on card'],
  ['sage', 'bg', UI, 'sage fill on board'], ['sage', 'paper', UI, 'sage fill on card'],
  ['primary', 'bg', UI, 'primary button vs board'], ['danger', 'bg', UI, 'danger button vs board'], ['success', 'bg', UI, 'success button vs board'],
  ['stamp', 'paper', TEXT, 'RUSH stamp on white'],
  ['focus-inv', 'inv-bg', UI, 'focus ring on toast'], ['inv-line', 'inv-bg', 1.5, 'toast edge (decorative)'],
  ['line-soft', 'bg', 1.15, 'divider (decorative, no requirement)'],
];
const slipPairs = [
  ['ink', 'paper', TEXT, 'slip text'], ['ink2', 'paper', TEXT, 'slip secondary'], ['ink3', 'paper', TEXT, 'slip tertiary'], ['ink3', 'sub', TEXT, 'slip tertiary on row hover'], ['ink', 'sub', TEXT, 'slip text on row hover'],
  ['amber-ink', 'paper', TEXT, 'slip amber text'], ['amber-ink', 'tint-warn', TEXT, 'slip amber on warn tint'], ['crimson', 'paper', TEXT, 'slip overdue text'], ['crimson', 'tint-bad', TEXT, 'slip overdue on bad tint'],
  ['sage-ink', 'paper', TEXT, 'slip sage text'], ['ink', 'tint-warn', TEXT, 'slip note text'], ['ink', 'tint-bad', TEXT, 'slip ink on bad tint'],
  ['stamp', 'paper', TEXT, 'RUSH stamp on slip'],
  ['line', 'paper', UI, 'slip border'], ['focus', 'paper', UI, 'focus ring on slip'], ['amber', 'paper', UI, 'warn border on slip'],
  ['z-pit', 'paper', TEXT, 'PIT hue on slip'], ['z-sides', 'paper', TEXT, 'HOT hue on slip'], ['z-fry', 'paper', TEXT, 'FRY hue on slip'], ['z-cold', 'paper', TEXT, 'CLD hue on slip'], ['z-expo', 'paper', TEXT, 'EXP hue on slip'],
  ['on-primary', 'primary', TEXT, 'primary button on slip'], ['on-success', 'success', TEXT, 'success button on slip'],
  ['primary', 'paper', UI, 'primary button vs slip'], ['success', 'paper', UI, 'success button vs slip'],
];
const officePairs = [
  ['o-ink', 'o-bg', TEXT, 'body text'], ['o-ink', 'o-surface', TEXT, 'text on surface'], ['o-ink', 'o-surface2', TEXT, 'text on surface 2'],
  ['o-ink2', 'o-bg', TEXT, 'secondary'], ['o-ink2', 'o-surface', TEXT, 'secondary on surface'], ['o-ink2', 'o-surface2', TEXT, 'secondary on surface 2'],
  ['o-ink3', 'o-bg', TEXT, 'tertiary'], ['o-ink3', 'o-surface', TEXT, 'tertiary on surface'], ['o-ink3', 'o-surface2', TEXT, 'tertiary on surface 2'],
  ['o-accent', 'o-bg', TEXT, 'accent text'], ['o-accent', 'o-surface', TEXT, 'accent text on surface'], ['o-accent', 'o-surface2', TEXT, 'accent text on surface 2'],
  ['o-good', 'o-bg', TEXT, 'good text'], ['o-good', 'o-surface', TEXT, 'good on surface'], ['o-good', 'o-surface2', TEXT, 'good on surface 2'], ['o-good', 'o-tint-ok', TEXT, 'good on ok tint'],
  ['o-warn', 'o-bg', TEXT, 'warn text'], ['o-warn', 'o-surface', TEXT, 'warn on surface'], ['o-warn', 'o-surface2', TEXT, 'warn on surface 2'], ['o-warn', 'o-tint-warn', TEXT, 'warn on warn tint'],
  ['o-bad', 'o-bg', TEXT, 'bad text'], ['o-bad', 'o-surface', TEXT, 'bad on surface'], ['o-bad', 'o-surface2', TEXT, 'bad on surface 2'], ['o-bad', 'o-tint-bad', TEXT, 'bad on bad tint'],
  ['o-on-accent', 'o-accent', TEXT, 'primary button label'], ['o-on-good', 'o-good', TEXT, 'success button label'], ['o-on-bad', 'o-bad', TEXT, 'danger button label'],
  ['o-line-strong', 'o-bg', UI, 'control border on bg'], ['o-line-strong', 'o-surface', UI, 'control border on surface'], ['o-line-strong', 'o-surface2', UI, 'control border on surface 2'],
  ['o-focus', 'o-bg', UI, 'focus ring on bg'], ['o-focus', 'o-surface', UI, 'focus ring on surface'], ['o-focus', 'o-surface2', UI, 'focus ring on surface 2'],
  ['o-accent', 'o-bg', UI, 'accent fill vs bg'],
  ['o-line', 'o-bg', 1.1, 'divider (decorative)'],
  ['o-ink', 'o-tint-warn', TEXT, 'text on warn tint'], ['o-ink', 'o-tint-bad', TEXT, 'text on bad tint'], ['o-ink', 'o-tint-ok', TEXT, 'text on ok tint'],
];

const rows = [];
let failed = 0;
function run(themeName, map, pairs, group) {
  for (const [fg, bg, min, what] of pairs) {
    const a = map['--' + fg], b = map['--' + bg];
    if (!/^#[0-9a-f]{6}$/i.test(a || '') || !/^#[0-9a-f]{6}$/i.test(b || '')) { rows.push({ themeName, group, fg, bg, min, what, ratio: NaN, ok: false, a, b }); failed++; continue; }
    const ratio = contrast(a, b);
    const ok = ratio + 1e-9 >= min;
    if (!ok) failed++;
    rows.push({ themeName, group, fg, bg, min, what, ratio, ok, a, b });
  }
}
for (const th of THEMES) {
  if (th.name === 'Day' || th.name === 'Night') {
    run(th.name, th.t, floorPairs, 'board');
    run(th.name, withSlip(th.t), slipPairs, 'slip');
  } else run(th.name, th.t, officePairs, 'office');
}

/* console output */
const pad = (s, n) => String(s).padEnd(n);
for (const r of rows) if (!r.ok) console.log('FAIL', pad(r.themeName, 6), pad(r.group, 6), pad(r.fg + ' on ' + r.bg, 30), r.a, r.b, Number.isNaN(r.ratio) ? 'unresolved' : r.ratio.toFixed(2), 'need', r.min, '-', r.what);
const total = rows.length;
console.log(`${total - failed}/${total} pairs pass`);

/* markdown table */
const f2 = (x) => (Number.isNaN(x) ? 'n/a' : x.toFixed(2));
let md = '## 5. Contrast table (generated)\n\n';
md += 'Generated by `node test/shell.contrast.mjs --write` from `src/css/00-tokens.css` using `SB.util.contrast`. Text needs 4.5:1, large text and UI borders 3:1. Decorative dividers are listed for transparency only. Totals: ';
const sum = {};
for (const r of rows) { const s = sum[r.themeName] || (sum[r.themeName] = { n: 0, ok: 0, min: 99, minWhat: '' }); s.n++; if (r.ok) s.ok++; if (r.min >= 3 && r.ratio < s.min) { s.min = r.ratio; s.minWhat = `${r.fg} on ${r.bg}`; } }
md += Object.entries(sum).map(([k, s]) => `${k} ${s.ok}/${s.n}`).join(', ') + '.\n\n';
md += 'Lowest checked ratio among text/UI pairs per theme: ' + Object.entries(sum).map(([k, s]) => `${k} ${f2(s.min)} (${s.minWhat})`).join('; ') + '.\n\n';
for (const th of THEMES) {
  const groups = [...new Set(rows.filter((r) => r.themeName === th.name).map((r) => r.group))];
  for (const g of groups) {
    md += `### ${th.name}${g === 'slip' ? ' (inside .slip)' : g === 'office' ? ' office' : ' floor'}\n\n| Foreground | Background | Ratio | Need | Pass | Use |\n|---|---|---|---|---|---|\n`;
    for (const r of rows.filter((x) => x.themeName === th.name && x.group === g)) md += `| \`${r.fg}\` ${r.a} | \`${r.bg}\` ${r.b} | ${f2(r.ratio)} | ${r.min} | ${r.ok ? 'yes' : '**NO**'} | ${r.what} |\n`;
    md += '\n';
  }
}
if (process.argv.includes('--write')) {
  const file = path.join(root, 'docs/design-notes.md');
  let doc = fs.readFileSync(file, 'utf8');
  const start = doc.indexOf('<!--CONTRAST-->');
  if (start < 0) { console.error('marker <!--CONTRAST--> not found'); process.exit(2); }
  const end = doc.indexOf('<!--/CONTRAST-->');
  const tail = end >= 0 ? doc.slice(end + '<!--/CONTRAST-->'.length) : doc.slice(start + '<!--CONTRAST-->'.length);
  doc = doc.slice(0, start) + '<!--CONTRAST-->\n' + md + '<!--/CONTRAST-->' + tail;
  fs.writeFileSync(file, doc);
  console.log('wrote docs/design-notes.md');
}
process.exit(failed ? 1 : 0);
