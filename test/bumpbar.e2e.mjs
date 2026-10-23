// Quick browser check (about 10 s, not part of the unit suite): bump-bar keys pick, start, finish, bump and recall a
// ticket. Needs dist/smokebox.html built first. Usage: node test/bumpbar.e2e.mjs [screenshot.png]
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import assert from 'node:assert/strict';
import path from 'node:path';
import { ROOT } from './_load.mjs';

const req = createRequire(execSync('npm root -g').toString().trim() + '/');
const { chromium } = req('playwright');
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto('file://' + path.join(ROOT, 'dist/smokebox.html') + '?demo');
await p.waitForTimeout(600);
await p.evaluate(() => { SB.floor.setWelcome(false); SB.sim.restartDemo(); });
await p.waitForTimeout(800);
const sel = () => p.evaluate(() => { const e = document.querySelector('.fl-slip[data-sel="true"]'); return e ? e.dataset.ticket : null; });
const st = () => p.evaluate(() => { const t = SB.store.getState().tickets.filter((x) => x.status === 'active')[0]; return { id: t.id, items: t.items.map((i) => i.status), n: SB.store.getState().tickets.filter((x) => x.status === 'active').length }; });
assert.equal(await sel(), null);
await p.keyboard.press('j'); await p.waitForTimeout(200);
const first = await sel(); assert.ok(first, 'j picks the first ticket');
await p.keyboard.press('j'); await p.waitForTimeout(200);
assert.notEqual(await sel(), first, 'j again moves on');
await p.keyboard.press('k'); await p.waitForTimeout(200);
assert.equal(await sel(), first, 'k goes back');
if (process.argv[2]) await p.screenshot({ path: process.argv[2] });
const before = await st();
await p.keyboard.press('s'); await p.waitForTimeout(700);
await p.keyboard.press('f'); await p.waitForTimeout(700);
const mid = await st();
assert.notDeepEqual(mid.items, before.items, 's and f changed a dish');
// Bump (force) the picked ticket with b, accept the "bump anyway" question with Enter on its confirm button.
const n0 = before.n;
await p.keyboard.press('b'); await p.waitForTimeout(500);
const dlg = await p.$('[role="alertdialog"] .btn-danger, [role="alertdialog"] .btn-primary');
if (dlg) { await dlg.click(); await p.waitForTimeout(500); }
assert.equal((await st()).n, n0 - 1, 'b bumped the picked ticket');
assert.ok(await sel(), 'the pick moved on to the next ticket');
await p.keyboard.press('l'); await p.waitForTimeout(500);
assert.equal((await st()).n, n0, 'l brought it back');
assert.deepEqual(errs, []);
console.log('bump bar ok');
await b.close();
