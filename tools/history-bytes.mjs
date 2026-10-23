#!/usr/bin/env node
// WHAT THIS FILE IS: Prints what one finished ticket costs in saved characters, by part (the ticket, its order, each kind of event), in the plain
//    and in the compact saved form. Run: node tools/history-bytes.mjs [tickets]
// USES: test/_big-kitchen.mjs, src/js/*.js. USED BY: people (the numbers behind docs/audit/history-storage-v2.md).
import { buildBig } from '../test/_big-kitchen.mjs';

const n = Number(process.argv[2] || 1500);
const { SB, state } = await buildBig({ tickets: n, days: 6, uncap: true });
const E = SB.engine, U = SB.util;
const per = state.tickets.length;
const pk = U.makePacker();
const size = (v) => JSON.stringify(v).length;
const packed = (v) => JSON.stringify(pk.pack(v)).length;
const rows = [['ticket (with its items)', size(state.tickets), packed({ tickets: state.tickets })], ['order', size(state.orders), packed({ orders: state.orders })]];
const byType = new Map();
for (const e of E.allEvents(state)) { const r = byType.get(e.type) || { plain: 0, n: 0, list: [] }; r.plain += size(e); r.n++; r.list.push(e); byType.set(e.type, r); }
for (const [type, r] of [...byType].sort((a, b) => b[1].plain - a[1].plain)) rows.push(['event ' + type + ' (' + (r.n / per).toFixed(2) + ' per ticket)', r.plain, packed({ events: r.list })]);
console.log(per + ' finished tickets. Characters per ticket, plain / compact (the compact figure of a part counts the tables it needs, so small parts look worse than they are):');
let tp = 0, tc = 0;
for (const [name, plain, cmp] of rows) { console.log(name.padEnd(46), String(Math.round(plain / per)).padStart(6), String(Math.round(cmp / per)).padStart(6)); tp += plain; }
console.log('whole save'.padEnd(46), String(Math.round(size(state) / per)).padStart(6), String(Math.round(packed(state) / per)).padStart(6), '  (' + Math.round(100 * packed(state) / size(state)) + '% of plain)');
void tc; void tp;
