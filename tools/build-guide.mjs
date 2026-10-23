#!/usr/bin/env node
// WHAT THIS FILE IS: Keeps the in-app Guide and its source text in step. The source is the Markdown files in
//    docs/sop/ (one file per Guide page). This tool turns them into the data block inside src/js/78-guide.js.
// PARTS: a small Markdown reader, the data block writer, a check mode.
// USES: docs/sop/*.md and src/js/78-guide.js. USED BY: people (node tools/build-guide.mjs) and
//    test/guide.test.mjs (which calls it with --check to fail when the two have drifted apart).
// Run: node tools/build-guide.mjs          rewrites the data block in 78-guide.js
//      node tools/build-guide.mjs --check  exits 1 (and says so) when the block no longer matches docs/sop
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOP = path.join(ROOT, 'docs', 'sop');
const TARGET = path.join(ROOT, 'src', 'js', '78-guide.js');
const START = '  // guide:data-start (written by tools/build-guide.mjs from docs/sop; do not edit by hand)';
const END = '  // guide:data-end';

// Reads one Markdown file into a page: { id, title, summary, blocks }. Understands only what the Guide uses:
// one "# Title", a first paragraph (the summary), "## Heading", paragraphs, "1." lists and "- " lists.
function parsePage(file, text) {
  const id = path.basename(file, '.md').replace(/^\d+-/, '');
  const lines = text.replace(/\r/g, '').split('\n');
  const page = { id, title: '', summary: '', blocks: [] };
  let para = [], list = null;
  // Closes the paragraph or list being collected and files it as the summary or a block.
  const flush = () => {
    if (para.length) {
      const x = para.join(' ').trim();
      if (!page.summary && page.blocks.length === 0) page.summary = x; else page.blocks.push({ t: 'p', x });
      para = [];
    }
    if (list) { page.blocks.push({ t: list.t, x: list.items }); list = null; }
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    let m;
    if (!line.trim()) { flush(); continue; }
    if ((m = /^# (.+)$/.exec(line))) { flush(); page.title = m[1].trim(); continue; }
    if ((m = /^## (.+)$/.exec(line))) { flush(); page.blocks.push({ t: 'h', x: m[1].trim() }); continue; }
    if ((m = /^\d+\. (.+)$/.exec(line))) { if (!list || list.t !== 'ol') { flush(); list = { t: 'ol', items: [] }; } list.items.push(m[1].trim()); continue; }
    if ((m = /^- (.+)$/.exec(line))) { if (!list || list.t !== 'ul') { flush(); list = { t: 'ul', items: [] }; } list.items.push(m[1].trim()); continue; }
    if (list) flush();
    para.push(line.trim());
  }
  flush();
  return page;
}

// All pages from docs/sop, in file-name order (the two-digit prefix sets the order).
function readPages() {
  return fs.readdirSync(SOP).filter((f) => /^\d\d-.+\.md$/.test(f)).sort()
    .map((f) => parsePage(f, fs.readFileSync(path.join(SOP, f), 'utf8')));
}

// The text of the data block: the pages as JSON, one page per paragraph of lines, between the two marker lines.
function dataBlock(pages) {
  const json = JSON.stringify(pages, null, 1).split('\n').map((l) => '  ' + l).join('\n');
  return START + '\n  const PAGES = ' + json.trimStart() + ';\n' + END;
}

// Replaces the marked block in the target file text; throws when the markers are missing.
function inject(src, block) {
  const a = src.indexOf(START), b = src.indexOf(END);
  if (a < 0 || b < 0 || b < a) throw new Error('78-guide.js has no guide:data-start / guide:data-end markers');
  return src.slice(0, a) + block + src.slice(b + END.length);
}

export { parsePage, readPages, dataBlock, inject };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const pages = readPages();
  const src = fs.readFileSync(TARGET, 'utf8');
  const next = inject(src, dataBlock(pages));
  if (process.argv.includes('--check')) {
    if (next !== src) { console.error('Guide data in src/js/78-guide.js differs from docs/sop. Run: node tools/build-guide.mjs'); process.exit(1); }
    console.log('guide data matches docs/sop (' + pages.length + ' pages)');
  } else {
    fs.writeFileSync(TARGET, next);
    console.log('wrote ' + pages.length + ' pages into src/js/78-guide.js');
  }
}
