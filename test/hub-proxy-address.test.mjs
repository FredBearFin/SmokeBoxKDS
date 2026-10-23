// The address used for the hub's per-address limits behind a reverse proxy (SMOKEBOX_TRUST_PROXY=1): the real client address comes from X-Forwarded-For only
// when the connection is from this computer, the last entry is used, and a screen that writes its own header can neither dodge a limit nor poison another's.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import { createHub } from '../server/server.mjs';

const lan = Object.values(os.networkInterfaces()).flat().find((i) => i && i.family === 'IPv4' && !i.internal);
// Posts JSON to the hub from the given host address (so the hub sees that as the connection's address) with extra headers.
const post = (host, port, p, body, headers) => new Promise((resolve, reject) => {
  const data = JSON.stringify(body);
  const r = http.request({ host, port, path: p, method: 'POST', agent: false, headers: Object.assign({ 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) }, headers || {}) }, (res) => {
    let s = ''; res.on('data', (c) => (s += c)); res.on('end', () => { let j = null; try { j = JSON.parse(s); } catch (e) { /* not JSON */ } resolve({ status: res.statusCode, body: j }); });
  });
  r.on('error', reject); r.end(data);
});
const wrong = (host, port, xff, n = 1) => post(host, port, '/pair', { code: 'ZZZZ' + (n % 10) + 'Z', name: 'x' }, xff === undefined ? {} : { 'x-forwarded-for': xff });
async function hub(opts) { const h = await createHub(Object.assign({ dataFile: null, starter: true, tickMs: 600000, now: () => Date.now() }, opts)); const port = await h.listen(0, '0.0.0.0'); return { h, port }; }

test('default: the header is ignored, so a screen cannot dodge the pairing limit by changing it', async () => {
  const { h, port } = await hub({});
  try {
    const code = h.screens.issueCode().code;
    for (let i = 0; i < 5; i++) await wrong('127.0.0.1', port, '10.0.0.' + i, i);
    const r = await post('127.0.0.1', port, '/pair', { code, name: 'Late' }, { 'x-forwarded-for': '10.9.9.9' });
    assert.equal(r.status, 429, 'five wrong tries from one connection address lock it whatever the header says');
  } finally { await h.close(); }
});

test('trust proxy: each real client address has its own limit; the last entry counts, so a client cannot poison another\'s limit', async () => {
  const { h, port } = await hub({ trustProxy: true });
  try {
    for (let i = 0; i < 5; i++) await wrong('127.0.0.1', port, '10.0.0.1', i);
    assert.equal((await wrong('127.0.0.1', port, '10.0.0.1', 9)).status, 429, '10.0.0.1 is locked');
    const code = h.screens.issueCode().code;
    assert.equal((await wrong('127.0.0.1', port, '10.0.0.2', 1)).body.report, 'badPairCode', 'another client is not locked');
    assert.equal((await post('127.0.0.1', port, '/pair', { code, name: 'Other' }, { 'x-forwarded-for': '10.0.0.2' })).status, 200);
    // a client writes a header naming a victim first; the proxy appends the real address last
    for (let i = 0; i < 5; i++) await wrong('127.0.0.1', port, '10.0.0.3, 10.0.0.4', i);
    assert.equal((await wrong('127.0.0.1', port, '10.0.0.4', 9)).status, 429, 'the attacker\'s own address is the one locked');
    assert.equal((await wrong('127.0.0.1', port, '10.0.0.3', 9)).body.report, 'badPairCode', 'the named victim is untouched');
    // not an address, or too long: the connection\'s own address is used
    for (const bad of ['garbage', 'x'.repeat(600), '999.1.1.1', '']) {
      const r = await wrong('127.0.0.1', port, bad, 1);
      assert.ok(r.status === 403 || r.status === 429, String(bad).slice(0, 10) + ' -> ' + r.status);
    }
    // IPv6 and mapped IPv4 forms
    assert.equal((await wrong('127.0.0.1', port, '2001:db8::7', 1)).body.report, 'badPairCode');
    assert.equal((await wrong('127.0.0.1', port, '::ffff:10.0.0.4', 1)).status, 429, 'a mapped form is the same address');
  } finally { await h.close(); }
});

test('trust proxy: from any address that is not this computer the header is never believed', { skip: lan ? false : 'no network address other than loopback in this environment' }, async () => {
  const { h, port } = await hub({ trustProxy: true });
  try {
    for (let i = 0; i < 5; i++) await wrong(lan.address, port, '10.0.0.' + (50 + i), i);
    const code = h.screens.issueCode().code;
    const r = await post(lan.address, port, '/pair', { code, name: 'Spoof' }, { 'x-forwarded-for': '10.0.0.99' });
    assert.equal(r.status, 429, 'a direct client cannot pick another address');
    // and it did not touch the address it pretended to be, nor the loopback one
    assert.equal((await post('127.0.0.1', port, '/pair', { code, name: 'Real' }, { 'x-forwarded-for': '10.0.0.99' })).status, 200);
  } finally { await h.close(); }
});

test('trust proxy: admin key tries are counted per real address too, and the setting is off unless asked for', async () => {
  const { h, port } = await hub({ trustProxy: true });
  try {
    for (let i = 0; i < 10; i++) await post('127.0.0.1', port, '/admin/pair', {}, { authorization: 'Bearer wrong', 'x-forwarded-for': '10.1.1.1' });
    assert.equal((await post('127.0.0.1', port, '/admin/pair', {}, { authorization: 'Bearer wrong', 'x-forwarded-for': '10.1.1.1' })).status, 429, 'wrong keys from that address are held off');
    assert.equal((await post('127.0.0.1', port, '/admin/pair', {}, { authorization: 'Bearer ' + h.adminKey, 'x-forwarded-for': '10.1.1.1' })).status, 200, 'but the right key is never refused because of someone else\'s wrong tries');
    assert.equal((await post('127.0.0.1', port, '/admin/pair', {}, { authorization: 'Bearer ' + h.adminKey, 'x-forwarded-for': '10.1.1.2' })).status, 200);
  } finally { await h.close(); }
  const env = process.env.SMOKEBOX_TRUST_PROXY; delete process.env.SMOKEBOX_TRUST_PROXY;
  const off = await hub({});
  try {
    for (let i = 0; i < 10; i++) await post('127.0.0.1', off.port, '/admin/pair', {}, { authorization: 'Bearer wrong', 'x-forwarded-for': '10.1.1.1' });
    assert.equal((await post('127.0.0.1', off.port, '/admin/pair', {}, { authorization: 'Bearer wrong', 'x-forwarded-for': '10.1.1.2' })).status, 429, 'off by default: one address for everyone');
  } finally { await off.h.close(); if (env !== undefined) process.env.SMOKEBOX_TRUST_PROXY = env; }
});
