// WHAT THIS FILE IS: Lists every piece of text a person can see in the app, so the wording can be reviewed in one place.
// It reads each file in src/js with acorn (a JavaScript parser), picks out the string literals that look like
// human text, labels each with a kind (button, toast, help, aria-label, report, insight...) and the nearest named
// function, and writes docs/audit/strings.tsv (file, line, kind, area, text).
// PARTS: skip rules, kind guesser, tree walk, output. USES: acorn through tools/_deps.mjs. USED BY: people, by hand.
// Run: node tools/extract-strings.mjs   (add --stdout to print instead of writing the file)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toolRequire } from './_deps.mjs';

const acorn = toolRequire('acorn');
const walk = toolRequire('acorn-walk');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src', 'js');

// Which screen a file mostly belongs to (the nearest named function is added after it).
const SCREEN = {
  '10-config': 'config (menu, ingredients, defaults)', '20-engine': 'engine messages', '25-deadlines': 'attention strip and alerts',
  '30-store': 'data and backup', '35-pilot': 'pilot notes', '40-metrics': 'back office insights', '45-sim': 'demo data',
  '50-charts': 'charts', '60-shell': 'shared kit (sheets, toasts, menu)', '70-floor-board': 'kitchen board',
  '71-floor-order': 'new ticket', '72-floor-sheets': 'floor sheets (cabinet, 86, recall, help, menu, settings)',
  '73-floor-orders': 'orders and payment', '74-floor-tour': 'guided tour', '76-floor-discards': 'discard log',
  '77-floor-setup': 'first-time setup', '80-office-core': 'back office shell', '81-office-pace': 'back office: Pace and Tickets',
  '82-office-money': 'back office: Sales and money', '83-office-safety': 'back office: Safety', '84-office-data': 'back office: Data and Menu',
  '85-office-stock': 'back office: Stock and 86', '86-office-glance': 'manager glance', '99-boot': 'startup'
};

// Property names whose string value is shown to people, mapped to a kind.
const PROP_KIND = {
  title: 'title', label: 'label', text: 'text', msg: 'message', message: 'message', help: 'help', hint: 'help',
  placeholder: 'placeholder', 'aria-label': 'aria-label', ariaLabel: 'aria-label', summary: 'text', body: 'text',
  confirmLabel: 'button', cancelLabel: 'button', heading: 'title', sub: 'text', note: 'text', detail: 'text',
  desc: 'text', description: 'text', empty: 'text', headline: 'insight', why: 'insight', action: 'insight', fix: 'insight',
  name: 'name', tip: 'help', subtitle: 'text', caption: 'text', alt: 'aria-label', blurb: 'text', say: 'message',
  reason: 'text', line: 'text', short: 'label', long: 'text', noun: 'name', plural: 'name', unit: 'unit'
};
// Property names whose string values are code, not words.
const CODE_PROPS = new Set(['id', 'class', 'className', 'type', 'kind', 'role', 'icon', 'tone', 'key', 'href', 'src', 'for',
  'htmlFor', 'inputmode', 'autocomplete', 'rel', 'target', 'method', 'event', 'on', 'mode', 'order', 'section', 'view', 'tab',
  'field', 'ingredient', 'menuId', 'cat', 'category', 'channel', 'zone', 'station', 'status', 'state', 'sort', 'viewBox',
  'fill', 'stroke', 'd', 'color', 'colour', 'font', 'style', 'width', 'height', 'transform', 'points', 'act', 'dataset',
  'min', 'max', 'step', 'pattern', 'accept', 'selector', 'sel', 'rule', 'code', 'fmt', 'format', 'var', 'tabindex']);

// True when the text looks like words a person reads (not an id, class, selector, path, color or format string).
function looksHuman(t) {
  if (t.length < 2 || !/[A-Za-z]{2}/.test(t)) return false;
  if (/^(https?:|\/|\.\/|data:|#|\.|\[)/.test(t)) return false;
  if (/^[a-z]+(-[a-z0-9]+)+$/.test(t)) return false;                 // css-like word-word
  if (/^[a-z]+([A-Z][a-z0-9]+)+$/.test(t)) return false;             // camelCase id
  if (/^[A-Z_0-9]+$/.test(t)) return false;                          // CONSTANT_ID
  if (/^[MLCQZHVA][ \d.,-]+/.test(t)) return false;                  // svg path
  if (/^(rgb|hsl|var|calc|translate|scale|rotate|linear-gradient)\(/.test(t)) return false;
  if (/^\d+(\.\d+)?(px|em|rem|%|ms|s|vh|vw)$/.test(t)) return false;
  if (/^[\w-]+\s*:\s*[^ ]+;?$/.test(t) && !/^[A-Z]/.test(t)) return false;   // inline style
  if (/^<\/?[a-z]/i.test(t)) return false;                           // markup fragment
  if (/^[a-z]+$/.test(t)) return false;                              // one lowercase word: almost always an id
  if (/^&[a-z]+;$/.test(t) || /="|"\/>|" \w+="/.test(t)) return false;   // html entity or markup piece
  if (/^[a-z0-9_-]+( [a-z0-9_-]+)+$/.test(t) && t.split(' ').every((w) => /-/.test(w) || /^(is|on|has|btn|sr|fl)$/.test(w))) return false;   // class list
  if (!t.includes(' ') && /^[a-z0-9_.:\/-]+$/.test(t)) return false;
  return true;
}

// Collapse whitespace so each string sits on one tab-separated line.
function clean(s) { return s.replace(/\s+/g, ' ').trim(); }

// Names of calls that show text, mapped to a kind.
const CALL_KIND = {
  toast: 'toast', announce: 'announce', confirm: 'confirm', sheet: 'sheet', settingBlock: 'settingBlock',
  segmented: 'toggle', say: 'message', speak: 'spoken'
};
// Calls whose string arguments are never shown.
const QUIET_CALL = /^(querySelector|querySelectorAll|closest|matches|getElementById|addEventListener|removeEventListener|dispatchEvent|getItem|setItem|removeItem|require|test|match|replace|split|join|indexOf|includes|startsWith|endsWith|hasOwnProperty|setProperty|getPropertyValue|createElement|createElementNS|matchMedia|mq|ico|icon|setTimeout|fetch|URL|RegExp|Symbol|emit|on|off|dispatch|go|get|set|has|delete|add|remove|contains|setAttribute|getAttribute|hasAttribute|removeAttribute|push|assign|parse|stringify|run|byId)$/;

const rows = [];

// Name of the nearest named function around a node, for the "area" column.
function nearestName(ancestors) {
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const a = ancestors[i];
    if (a.type === 'FunctionDeclaration' && a.id) return a.id.name;
    if ((a.type === 'FunctionExpression' || a.type === 'ArrowFunctionExpression') && i > 0) {
      const pa = ancestors[i - 1];
      if (pa.type === 'VariableDeclarator' && pa.id.type === 'Identifier') return pa.id.name;
      if (pa.type === 'Property' && pa.key && (pa.key.name || pa.key.value)) return String(pa.key.name || pa.key.value);
      if (pa.type === 'AssignmentExpression' && pa.left.type === 'MemberExpression' && pa.left.property.name) return pa.left.property.name;
    }
  }
  return '';
}

// Reads one file, walks its tree, and adds a row for each human-looking string.
function scan(file) {
  const base = path.basename(file, '.js');
  const ast = acorn.parse(fs.readFileSync(file, 'utf8'), { ecmaVersion: 'latest', locations: true, allowHashBang: true });
  const area = SCREEN[base] || base;
  walk.fullAncestor(ast, (node, _s, ancestors) => {
    let text = null;
    if (node.type === 'Literal' && typeof node.value === 'string') text = node.value;
    else if (node.type === 'TemplateElement') text = node.value.cooked;
    if (text == null) return;
    const parent = ancestors[ancestors.length - 2];
    if (!parent) return;
    if (parent.type === 'ExpressionStatement' || parent.type === 'ImportDeclaration' || parent.type === 'SwitchCase') return;
    if (parent.type === 'Property' && parent.key === node && !parent.computed) return;
    if (parent.type === 'MemberExpression' && parent.property === node) return;
    if (parent.type === 'BinaryExpression' && ['===', '!==', '==', '!='].includes(parent.operator)) return;
    if (parent.type === 'UnaryExpression') return;
    let kind = 'text';
    // nearest property (within 4 ancestors) gives the field name
    let propName = null;
    for (let i = ancestors.length - 2; i >= 0 && i >= ancestors.length - 5; i--) {
      if (ancestors[i].type === 'Property' && !ancestors[i].computed && ancestors[i].key) { propName = ancestors[i].key.name || ancestors[i].key.value; break; }
      if (ancestors[i].type === 'CallExpression') break;
    }
    if (propName) {
      if (PROP_KIND[propName]) kind = PROP_KIND[propName];
      else if (CODE_PROPS.has(propName)) return;
      else if (/^aria-/.test(propName) || /^data-/.test(propName)) return;
    }
    // nearest call
    let callName = null, argIndex = -1;
    for (let i = ancestors.length - 2; i >= 0 && i >= ancestors.length - 8; i--) {
      const a = ancestors[i];
      if (a.type === 'CallExpression') {
        const c = a.callee;
        callName = c.type === 'Identifier' ? c.name : (c.type === 'MemberExpression' && !c.computed ? c.property.name : null);
        argIndex = a.arguments.indexOf(ancestors[i + 1]);
        break;
      }
    }
    if (callName === 'h') { if (argIndex === 0) return; if (!propName) kind = 'text'; }
    else if (callName && QUIET_CALL.test(callName) && !propName) return;
    else if (callName && CALL_KIND[callName] && !PROP_KIND[propName || '']) kind = CALL_KIND[callName];
    if (parent.type === 'AssignmentExpression' && parent.left.type === 'MemberExpression') {
      const lp = parent.left.property.name;
      if (['textContent', 'innerText'].includes(lp)) kind = 'text';
      else if (['title', 'placeholder', 'label'].includes(lp)) kind = lp;
      else return;
    }
    if (propName === 'title' && callName === 'h') kind = 'tooltip';
    const t = clean(text);
    if (!looksHuman(t)) return;
    let fn = nearestName(ancestors);
    if (base === '20-engine') {
      const decl = ancestors.find((a) => a.type === 'VariableDeclarator' && a.id && a.id.name === 'REPORTS');
      if (decl) { kind = 'report'; fn = 'REPORTS.' + (propName || ''); }
      else if (fn === 'describe') kind = 'report-live';
    }
    if (base === '40-metrics' && kind === 'text' && /rule|insight|finding/i.test(fn)) kind = 'insight';
    rows.push({ file: path.basename(file), line: node.loc.start.line, kind, area: area + (fn ? ' > ' + fn : ''), text: t });
  });
}

const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.js') && !f.startsWith('_')).sort();
files.filter((f) => f !== '05-icons.js').forEach((f) => scan(path.join(SRC, f)));   // icons file holds only drawing data
rows.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
const seen = new Set();
const out = rows.filter((r) => { const k = r.file + '|' + r.line + '|' + r.text; if (seen.has(k)) return false; seen.add(k); return true; });
const tsv = ['file\tline\tkind\tarea\ttext'].concat(out.map((r) => [r.file, r.line, r.kind, r.area, r.text].join('\t'))).join('\n') + '\n';
if (process.argv.includes('--stdout')) process.stdout.write(tsv);
else {
  const dest = path.join(ROOT, 'docs', 'audit', 'strings.tsv');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, tsv);
  const byFile = {};
  out.forEach((r) => { byFile[r.file] = (byFile[r.file] || 0) + 1; });
  console.log('wrote ' + path.relative(ROOT, dest) + ': ' + out.length + ' strings');
  Object.keys(byFile).forEach((f) => console.log('  ' + f + ' ' + byFile[f]));
}
