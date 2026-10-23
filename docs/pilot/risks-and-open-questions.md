# Risks and open questions

Honest list. Nothing here is a finding from a real kitchen, because none has happened.

## Not validated

- **Nothing has run on a real tablet.** Every test so far used a desktop test browser. Real tablet sound, screen sleep, keyboard behavior, touch size and storage have not been seen.
- **No real kitchen has used it.** No owner has said they would pay. No cook has used it through a rush.
- **Reliability on real hardware** is unknown: the tablet sleeping, the browser clearing data, power cuts, a Bluetooth speaker disconnecting.
- **iPad Safari** is untested (sound unlock, keep-awake). Do not sell on it until tested.

## Business risks

- **Narrow target.** Small barbecue restaurants that cook ahead and hold. How many exist, and whether they pay, is unknown.
- **Willingness to pay** is unknown, and gate 1 assumes owners compare price with waste.
- **Manual logging friction.** The waste numbers depend on cooks tapping Pull and logging temperatures. Gate 2 tests that. A cook who is busy will skip it.
- **Two-tablet (Connected) mode is not built.** A prototype hub exists in `server/` but the app does not use it. A restaurant with a pit and a counter wanting one shared board cannot have it.
- **Not to be sold as compliance.** The app reminds and keeps records. It does not know local rules. Every sentence about food safety must say that.

## Product risks

- Warnings sound only while the screen is on and the app is in front. A sleeping tablet means silence.
- A starting limit (such as a 4-hour hold) is the app's own starting value, not a rule. Owners must set the limits their health department gives them. The cold-item limits are typed by the owner; none is pre-filled.
- Data lives only on the tablet. A lost tablet without a backup loses everything. A PIN recovery code is shown once; if it is lost and no backup exists, the only way in erases the data.
- A cook can enter a wrong reading or skip a log. The app cannot see the food.

## Server and tunnel

`go.sh`, `tunnel.sh` and the hub were reviewed for security (docs/audit/server-security-review.md): request limits, cross-site request protection, password length, headers, and a safer updater were added. The review read code and ran local tests; the live server, the Cloudflare tunnel and the nightly update on a real machine were not checked. The Solo offer does not need any of it: it is one file on one tablet.

## Open questions (need a person)

- Price and pricing model. Which restaurant. Who answers support and how fast. Written terms, liability and insurance, and a lawyer's review.
- Whether the owner's health department accepts an electronic log, and what limits they use.
- How many support minutes a restaurant really needs.
- Whether the 15-minute setup is true for a real owner. It is a target.
- What the research could not read: it was based on search summaries, not the code itself (docs/research).
