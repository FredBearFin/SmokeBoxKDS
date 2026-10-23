# Privacy and data retention (DRAFT for a lawyer to review)

**This is not legal advice.** It is a plain description of what the Solo product does with data today, plus proposed rules, written so a lawyer can check it, correct it and turn it into customer-facing terms. Nothing here has been reviewed by a lawyer. Do not publish or send it to a customer as is. Open items are collected in section 7 and in `docs/commercial-decisions.md` rows 7 to 9.

## 1. What the app is, in data terms

Smokebox Solo is one HTML file. After it is installed, the app makes no network requests to us or anyone else for its function (one exception: the page may ask Google Fonts for typefaces, which fall back to local fonts when offline; a lawyer should decide whether to remove this request or disclose it). There is no account, no sign-in, no analytics, no crash reporting and no server. Everything the app records stays in the browser storage of the device it runs on.

## 2. What the app stores on the device

| Data | Examples | Personal data? |
|---|---|---|
| Orders and tickets | Items, quantities, times, channel, a customer label such as a first name or "Table 4", notes (may contain allergies) | The label and notes can identify a person or reveal health information if the cook types it |
| Payments recorded | Cash, card or other, amount, tip, discount. Never card numbers; Smokebox does not process cards | No card data by design |
| Kitchen records | Batches, temperatures, discards, hold times, sanitizing log, who or which station if entered | Staff names only if typed |
| Settings | Menu, costs, hold limits, hours, optional back office PIN | PIN is a shared secret, stored on the device (a lawyer or security reviewer should say whether it needs hashing) |
| Backups | A JSON file the owner downloads. Contains all of the above, including the PIN | Same as above, and it leaves the device |

## 3. What we (the seller) hold

By default: nothing. We hold data only if a customer sends it, for example a backup file for support or a pilot report. Proposed rules, for a lawyer to confirm:

- Ask for it only when needed to fix a problem; say what we will do with it.
- Use it only for that support case or that pilot's report.
- Keep it in one named place, not forwarded or copied into chat tools or shared drives.
- Delete it within 30 days of the case closing, and confirm to the customer in writing.
- Never ask for card numbers, bank details or passwords.

## 4. Roles

Proposed: the restaurant owner is the data controller (or equivalent term in the governing law) for guest and staff data in the app; we act as a supplier of software and, only when we receive a backup, as a temporary processor of that file. A lawyer must confirm the roles and the right words for the customer's state.

## 5. Retention proposals (customer's device)

| Data | Proposal |
|---|---|
| Finished tickets and events | The app already trims the oldest history when storage fills; the owner decides how long to keep backups |
| Customer labels and notes | Tell staff not to type full names, phone numbers or health details; use table or pickup labels |
| Backups | Owner's responsibility. Suggest keeping the last 30 daily backups and deleting older ones |
| Food-safety records (temperatures, discards) | The health department may require records for a set period; the owner must check local rules. The app is not the legal record |
| Device disposal | Reset everything and clear site data before selling or recycling the device |

## 6. Rights and requests

Because we hold no customer data by default, most requests (access, deletion) go to the restaurant. If we hold a support file, we must be able to find and delete it on request. A lawyer should say which privacy laws apply to a small US restaurant software seller (state laws differ), whether any notice is required on the app itself, and whether the pilot needs a signed data agreement.

## 7. Open questions for the lawyer

1. Which state privacy and consumer-protection laws apply to us as a seller, and to the restaurant as the user?
2. Is a customer name or an allergy note in an order "personal" or "health" data, and does that change what we should tell owners?
3. Do we need terms for support files, and is deletion within 30 days acceptable?
4. Should the Google Fonts request be removed or disclosed?
5. Is a plain shared PIN stored on the device acceptable, given that it protects only back office screens and not the data in storage?
6. What does the future Connected plan (`docs/connected-plan.md`) change? A hub or hosted service stores guest data on a machine we or the owner run, which needs its own review before any build.
7. Who signs, and with what entity (`docs/commercial-decisions.md` row 10)?

## 8. What this draft does not cover

Software license terms, warranty and liability disclaimers, insurance, payment-card rules (we do not process cards), tax, employment law for staff data, and any hosted or hub service. Those need professional advice.
