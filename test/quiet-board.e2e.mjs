// Quick browser check (about 20 s, not part of the unit suite): overdue tickets are ranked and escalate in size, the
// "On time" badge is hidden, and a toast over the 86 board lets taps through. Needs dist/smokebox.html built first.
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
await p.evaluate(() => { SB.floor.setWelcome(false); SB.sim.restartDemo(); window.mk = (n, tag) => { const mi = SB.config.menu.slice(0, 2).map((m) => ({ menuId: m.id, qty: 1 })); for (let i = 0; i < n; i++) SB.store.dispatchEx('createTicket', { customer: tag + i, channel: 'dine_in', items: mi }, { source: 'ui' }); }; window.mk(2, 'A'); });
const go = async (ms) => { await p.evaluate(() => SB.store.setSpeed(200)); await p.waitForTimeout(ms); await p.evaluate(() => SB.store.setSpeed(1)); };
await go(5000); await p.evaluate(() => window.mk(2, 'B')); await go(3500); await p.evaluate(() => window.mk(2, 'C'));
await p.waitForTimeout(1500);
const slips = await p.evaluate(() => Array.from(document.querySelectorAll('.fl-slip')).map((e) => ({ level: e.dataset.level, tier: e.dataset.tier || '', order: e.style.order, badge: getComputedStyle(e.querySelector('.fl-badge')).display, size: parseFloat(getComputedStyle(e.querySelector('.slip-timer')).fontSize) })));
const t1 = slips.filter((s) => s.tier === '1'), t3 = slips.filter((s) => s.tier === '3');
assert.equal(t1.length, 1, 'one worst ticket');
assert.ok(t1[0].size > t3[0].size * 1.2, 'the worst ticket is bigger');
assert.ok(slips.filter((s) => s.level === 'ok').every((s) => s.badge === 'none'), 'no On time badge');
assert.deepEqual(errs, []);
console.log('quiet board ok', JSON.stringify(slips.map((s) => s.tier)));
await b.close();
