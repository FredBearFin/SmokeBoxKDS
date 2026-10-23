# Pilot kit

Everything for one observed visit to one barbecue restaurant, written for the app as it is today. Nothing here has been tried in a real kitchen or on a real tablet. Price, restaurant, support contact and terms are not decided; they are left blank on purpose.

| File | What it is |
|---|---|
| [offer-one-pager.md](offer-one-pager.md) | The plain-words offer for the owner. Price blank, three pricing models compared. |
| [visit-plan.md](visit-plan.md) | The day of the visit: before, a 15-minute setup, how to observe, what to say. |
| [observer-sheet.md](observer-sheet.md) | One printable page for the observer. |
| [exit-gates.md](exit-gates.md) | The four gates, how each is measured, and what to do if one fails. |
| [risks-and-open-questions.md](risks-and-open-questions.md) | What could make this fail, and what nobody knows yet. |

Older documents, refreshed to match the build: `docs/pilot-protocol.md` (the gate and decision table), `docs/pilot-readiness.md` (device and warning tests), `docs/solo-offer.md` (what is and is not sold), `docs/commercial-decisions.md` (open business decisions), `docs/support-runbook.md`, `docs/server-access.md`, `docs/privacy-and-retention.md`.

## The idea in one paragraph

A small barbecue restaurant cooks meat ahead and holds it. Smokebox is a tablet screen beside the pit that warns before held food runs out of its time, logs what is thrown out, and records orders and payments (without charging cards). The pilot runs it for one real service next to the restaurant's own system, with an observer counting independently. It can say "this does not work" much better than "this works". It is not statistics and not a compliance claim.

## What changed since the first pilot plan

- A new kitchen starts empty: "Add your first dish", an optional menu import, no sample data.
- Cooked-ahead food is a Yes, No or Not sure question. Cold items have limits the owner types (days in the fridge, hours out).
- Counter service, order buttons and a currency symbol are in Settings, How you serve.
- A PIN shows a recovery code once. Start over with an empty menu makes a backup first.
- The server and tunnel scripts were reviewed for security (docs/audit/server-security-review.md). The Solo offer does not use them: it is one tablet.
