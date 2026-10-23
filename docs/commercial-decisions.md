# Commercial and operational decisions (open register)

Refreshed after an outside review (round 16). The review's summary: a promising niche for small barbecue restaurants; risks are no real-kitchen evidence or willingness to pay yet, a narrow target, manual logging friction, no two-tablet mode, reliability not validated on real tablets, and it must not be sold as compliance. Its recommendation: a narrow observed pilot beside the restaurant's own system, with a real price set before the visit. The pilot kit is in `docs/pilot/`.

Nothing in this file is settled. The repository does not decide these; the owner does, with professional advice where marked. Fill in each answer and date it. Proposals are starting points only.

| # | Decision | Proposal to react to | Decided (who, when) |
|---|---|---|---|
| 1 | Target customer for the pilot | Small BBQ counter-service restaurant with a smoker and cooked-ahead hold, owner on site. Which restaurant: not chosen | |
| 2 | Monthly price (set before the visit; the gate compares discard cost to it) | One flat monthly price for Solo, no setup fee during the pilot. Amount: $____ (blank; three pricing models are compared in `docs/pilot/offer-one-pager.md`) | |
| 3 | Billing | Invoice by email, monthly, cancel any month; no card data stored by Smokebox | |
| 4 | Onboarding | 30-minute on-site setup (`docs/solo-offer.md`), one follow-up call after the first week | |
| 5 | Support | Email or text, next business day; see the support boundaries in `docs/solo-offer.md` | |
| 6 | Updates and device replacement | Manual file replacement with a backup first; no automatic updates. (The server's nightly updater exists but Solo does not use a server.) | |
| 7 | Privacy and data retention | Data stays on the customer's device; Freddy holds no customer data except what the customer sends for support, deleted within 30 days of resolution. Needs written terms and a lawyer's review | |
| 8 | Software terms | Short license, as-is, no warranty of food safety, no liability for discarded or spoiled food, customer is responsible for compliance. **Needs a lawyer** | |
| 9 | Liability and insurance | Ask an insurance broker whether a software seller needs technology errors and omissions cover, and how the food-safety context affects it, before taking money. **Needs a professional** | |
| 10 | Business entity and tax | Decide who contracts with the customer and how sales tax is handled | |
| 11 | Pilot terms | Written one-page agreement: observer-only, owner's own system stays primary, data from the pilot is used only for the report | |

## What pilot evidence changes
Use `docs/pilot-protocol.md` for the gate and decision table. After it:
- **Gate fails:** stop. Write down which of the four failed and rethink the customer before any new feature.
- **Gate passes:** fix what the observed service exposed (this list lives in the observer sheet notes), then repeat the validation in a second kitchen. Only after that decide on the line board, Square import, Phase C and D, then Connected mode.
- Connected mode and POS integrations stay unbuilt and unsold until a validated pilot and a named buyer ask for them.
