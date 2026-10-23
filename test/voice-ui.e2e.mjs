// The voice in the browser, with the speech engine stubbed (browser, about 20 s). Run: node test/voice-ui.e2e.mjs
// Covers: Test the voice speaks a sample call in speakable words with the style of a new ticket and says which voice it used (and
// whether it is stored on the tablet), a burst of new tickets is spoken as one summary, calls for a bumped ticket are not spoken, and
// the Light level makes no new-ticket call. Nothing is played: the page's speechSynthesis records what it was asked to say.
import { toolRequire } from '../tools/_deps.mjs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { chromium } = toolRequire('playwright');
const DIST = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), 'dist/smokebox.html');
let fail = 0;
// Records one check and prints it.
function check(name, ok, detail) { if (!ok) fail++; console.log((ok ? '  ok    ' : '  FAIL  ') + name + (ok ? '' : ' -> ' + JSON.stringify(detail))); }
const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const errs = [];
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const p = await ctx.newPage();
p.on('pageerror', (e) => errs.push(String(e)));
await p.addInitScript(`
  window.__said = [];
  window.SpeechSynthesisUtterance = function (t) { this.text = t; };
  const voices = [{ name: 'Bad News', lang: 'en-US', localService: true }, { name: 'Samantha', lang: 'en-US', localService: true }, { name: 'Google US English', lang: 'en-US', localService: false }];
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { speak: (u) => window.__said.push({ text: u.text, rate: u.rate, pitch: u.pitch, volume: u.volume, voice: u.voice && u.voice.name }), cancel() {}, getVoices: () => voices } });`);
await p.goto(pathToFileURL(DIST).href + '?demo');
await p.waitForFunction(() => window.SB && SB.booted === true);
await p.evaluate(() => { SB.floor.setWelcome(false); SB.sim.live.crew(false); SB.store.resetLive({ keepSettings: true, starter: true, stagger: true, catalog: 'sample', replaceOwn: true }); SB.store.dispatchEx('clearDemoTickets', {}, { source: 'ui' }); SB.store.dispatchEx('updateSettings', { patch: { modules: { cookAhead: false } } }, { source: 'ui' }); });
// Test the voice
await p.evaluate(() => SB.sheets.open('menu'));
await p.waitForSelector('[data-act="test-voice"]');
await p.click('[data-act="test-voice"]'); await p.waitForTimeout(600);
const said = await p.evaluate(() => window.__said.slice());
const line = said.find((x) => /Ticket twelve/.test(x.text));
check('Test the voice speaks a sample call in words', !!line && line.text === 'Order up! Ticket twelve! three items!', said);
check('it uses the new-ticket style and the best local voice', line && line.rate === 1.1 && line.voice === 'Samantha', line);
check('it says which voice, and that it is stored on the tablet', /Voice: Samantha, stored on this tablet/.test(await p.evaluate(() => document.querySelector('.mn-test-voice').textContent)));
await p.keyboard.press('Escape'); await p.waitForTimeout(400);

// Calls on the board (the audio is not unlocked in a headless page, so the page is told it may speak)
await p.evaluate(() => { SB.floor.setVoiceLevel('normal'); });
await p.waitForTimeout(4500);
const speakCalls = async (fn) => { await p.evaluate(() => { window.__said.length = 0; }); await p.evaluate(fn); await p.waitForTimeout(2500); return p.evaluate(() => window.__said.map((x) => x.text)); };
const burst = await speakCalls(() => { const m = SB.store.getState().menu; for (let i = 0; i < 6; i++) SB.store.dispatchEx('createTicket', { customer: 'R' + i, channel: 'takeout', items: [{ menuId: m[i % m.length].id, qty: 1 }], note: '', rush: false }, { source: 'ui' }); });
check('a burst of six new tickets is one spoken line, not six', burst.filter((t) => /new tickets/.test(t)).length === 1 && burst.filter((t) => /^Order up/.test(t)).length === 0, burst);
await p.evaluate(() => SB.floor.setVoiceLevel('light'));
await p.waitForTimeout(4500);
const light = await speakCalls(() => { const m = SB.store.getState().menu; SB.store.dispatchEx('createTicket', { customer: 'L', channel: 'takeout', items: [{ menuId: m[0].id, qty: 1 }], note: '', rush: false }, { source: 'ui' }); });
check('on Light there is no new-ticket call', light.filter((t) => /Order up/.test(t)).length === 0, light);
check('no page errors', errs.length === 0, errs);
await browser.close();
console.log(fail ? fail + ' check(s) failed' : 'all checks passed');
process.exit(fail ? 1 : 0);
