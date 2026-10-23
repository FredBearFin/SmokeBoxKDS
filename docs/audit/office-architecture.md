# Back office: how it is put together

Read with `docs/office-contract.md` (the contract the three office builders worked to) and `docs/metrics.md` (every statistic's definition). This page describes the code as it is.

## Files
| File | Job |
|---|---|
| `36-csv.js` | `SB.csv.cell/line/text`: the one guarded way to write a CSV cell (formula-looking text gets a leading apostrophe). |
| `37-retention.js` | `SB.retention.days()/words()`: how long safety records are kept, read from `SB.engine.SAFETY_KEEP_DAYS`. |
| `40-metrics.js` | `SB.metrics`: pure functions over a dataset (no DOM): summary, by hour/day/channel/station/item, throughput, sales, safety compliance, headlines, insights; `M.prepare` builds the shared handle. |
| `50-charts.js` | `SB.charts`: SVG charts (line, bar, histogram, heat map, scatter, dumbbell, gantt, meter, ring, spark). |
| `80-office-core.js` | The frame (side rail, filters, data line, refresh loop), the kit every page is built from (`SB.office.kit`: cards, tiles, tables, findings) and `registerPage`. Also `SB.office.archivedWords`. |
| `81-office-pace.js` | Pages Speed, Tickets, Stations. |
| `82-office-money.js` | Sales and money; also defines `SB.officeB`, the small helper set (`memoP`, `addAction`, `seg`, `scopeText`, ...) shared with 83 and 85. |
| `83-office-safety.js`, `85-office-stock.js` | Safety page, Stock and 86 page. |
| `84-office-data.js` | Menu and settings and the Data panel (backup, restore, undo restore, Close the month card, pilot report, sales-by-day file, erase). |
| `86-office-glance.js` | The manager glance (today only), also drawn on the wall board. |
| `87-office-closeday.js` | Close the day sheet and its printout. |
| `88-office-backup.js` | Plain-words helpers for backup, restore and reset; `salesCsv`. |
| `89-office-inspector.js` | The printable food safety record and its Safety-page bar. |
Style files: `30-office.css` (frame and kit), `31-office-money.css`, `32-office-data.css`, `33-office-closeday.css`, `34-office-inspector.css`, `40-charts.css`. Files are glued in name order by `tools/build.mjs`, so 80 loads before the pages that register into it.

## Data flow, state to page
1. The engine's state is immutable; `SB.store.dataset({ sample })` turns it into a plain dataset (`tickets`, `orders`, `events`, `batches`, `menu`, `ingredients`, `settings`, `archivedBefore`, ...) and remembers the result per state object.
2. `80-office-core.js` `makeCtx` gives each page a `ctx`: `ctx.filters` (range, channel, source), `ctx.dataset()`, `ctx.opts()`, `ctx.prepared()` and `ctx.previous()` (the shared metrics handles for the range and for the period just before it), `ctx.now`, `ctx.metrics`.
3. `SB.metrics.prepare(dataset, opts)` does one pass over the tickets (the "context") and returns a handle. Every `M.*` function accepts a handle in place of a dataset and reuses it, so a page's twenty cards cost one pass.
4. A page file's `render(container, ctx)` builds its cards with `kit.page(...)` and returns `{ update(ctx), destroy() }`. A chart card's `spec(p)` receives the handle and returns the chart spec (or nothing, and the card shows its `empty` message); the kit draws it with `SB.charts`, tiles and tables take their numbers the same way, and the headline sentence comes from `M.headline`.
5. The banner line under the filters (`paintBanner`) says how many tickets, sample or live data, and, when the range reaches days before `archivedBefore`, that those days were cleared. The Safety and Data pages leave that sentence out.

## Caching, and where it can go stale
- Store: one dataset per state object (`dsMemo`, a WeakMap), so an unchanged state gives the same object.
- Metrics: `M.prepare` remembers up to four handles per dataset object and options (a WeakMap keyed by the dataset); it returns the same handle while the tickets, events, batches, settings, menu, ingredients, learned list and range are the same objects and lengths. Inside a handle `ctx.memo` holds each derived list once.
- Office frame: `ctx.prepared()` and `ctx.previous()` are remembered per refresh number (`M.gen`) and filter, so cards never prepare their own. `bannerCache` remembers the banner counts while range, channel and data are unchanged. `SB.officeB.memoP(fn)` caches a page-level derived value per handle.
- Refresh loop: the store calls `onStoreChange`, which marks the page stale and plans one refresh, at most once every 3 seconds (`REFRESH_MS`); it waits while the browser tab is hidden, and while someone is typing or holding a control, for up to 10 seconds (`BUSY_CAP_MS`). A refresh bumps `M.gen`, re-prepares, calls each kit page's refresh and the page's `update(ctx)`, then repaints the banner. Preset ranges (Today, Last 7 days) roll forward on each refresh.
- Rule: never edit a dataset in place; if a test must, call `M.unprepare(ds)` or build a new object.

## Naming of what `SB.office` exports
`mount`, `unmount`, `navigate`, `current`, `isMounted`, `filters`, `refresh`, `pages`, `registerPage` (frame); `kit` (page builders); `glance`, `openCloseDay`, `maybeOpenCloseDay`, `openInspectorLog`, `safetyLogBar` (entry points other screens call); `archivedWords` (the cleared-days sentence); and a `...Pure` object for the part of a file that runs without a DOM so tests can load it: `pure` (frame), `glancePure`, `closeDayPure`, `backupPure`, `inspectorPure`. `_debug` is for tests only. `SB.officeB` is the shared helper set (the name is historical; it is not a second office).

## How to add a page
1. Add the page to `PAGES` in `80-office-core.js` (id, title, short name, icon) and to the table in `docs/office-contract.md`. The router already serves `#/office/<id>`.
2. Make `src/js/8x-office-<name>.js` (a name between 81 and 89 loads after the core) as an IIFE that reads `SB.office` and calls `SB.office.registerPage('<id>', { title, icon, order, render })`. Return early if `SB.office.registerPage` is missing, so the file can load alone in a test.
3. In `render(container, ctx)`: `const page = kit.page(container, ctx, { id })`; then `page.headline()`, `page.how('plain words')`, `page.tiles([...])`, `page.section(title, sub)`, `page.card({ type, span, title, sub, spec: (p) => chartSpec, empty: { title, body } })`, `page.panel`, `page.table`, `page.insights`. Use `ctx.prepared()` for numbers, never `SB.metrics.prepare` yourself. Return `{ update(ctx), destroy() }` and release every listener and timer in `destroy`.
4. If the page depends on a setting (like cooked-ahead tracking or counter service), add it to `GATED` or `COUNTER_PAGES` in the core so the page shows the plain "this is off" card instead of empty charts.
5. Every statistic you add gets a definition in `docs/audit/office.md` ("How each number is worked out"), a function in `40-metrics.js` (pure, null for unknown, never zero), a case in `test/metrics-reference.test.mjs`'s naive reference, and a plain-words comment above every named function (`node tools/comment-audit.mjs`).
6. Add the page's styles in a `3x-office-*.css` file (loaded in name order) and, if it prints, a print block and a case in `test/print-qa.e2e.mjs`.
