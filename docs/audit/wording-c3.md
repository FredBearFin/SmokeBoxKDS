# Wording rows, connected track (strings new since round 15)

Re-ran `tools/extract-strings.mjs` on `kds/connected` af5d394. Most new strings are the follower screens and the readings sheet. Rows to fix:

## A2 (src/js/77-floor-setup.js, 72-floor-sheets.js)
1. Line 1440 "Tick each step as you go." and line 1260 "A tick means the tablet or you confirmed it" use a UK word. Say "Check each step" and "A check mark means".
2. Settings now has two similar entries: "Set up this tablet" (seven steps) and "Get this tablet ready" (five checks), at 72-floor-sheets.js:2175 and 77-floor-setup.js:25 and 1250. An owner will not know which to open. Merge them, or name the difference ("Get this tablet ready" = the five checks; "Set up this tablet" = the longer list).
3. Lines 1386 and 1405 are clear for a test feature. Keep "hub" as the one word everywhere on these screens (the Guide page uses it).

## A1 (src/js/70-floor-board.js)
1. Lines 1998, 2004 and 2005 say "The hub could not be reached" and "Looking for the hub again" on the follower screen. That is the only word a cook sees on a TV; keep it only if the screen also says what it means ("the main kitchen screen"). Suggest "The kitchen could not be reached" and "Looking for the kitchen again".

## A5 (src/js/30-store.js, 99-boot.js)
1. The refusal lines at 30-store.js:842-843 and 99-boot.js:120-126 are plain. One mismatch: 99-boot.js:120 says "The hub has too many screens connected right now. Try again in a minute." and 30-store.js:843 says "The hub has too many screens connected." Use one wording.

## Checked and fine
Follower chip words (Connected, Reconnecting..., Out of date since), "This screen only shows the kitchen.", the Readings sheet, the equipment and thermometer entries, the fridge-limit and out-of-fridge messages. No UK spellings other than "tick". No safe, compliant or guarantee words.

## Round 19 rows (connected 82d109f)
- A2 `77-floor-setup.js:1465`: "stays safe on this tablet" is a claim. Say "stays untouched on this tablet".
- One word for the other machine. The sheets say "hub" (77:1381-1394), the board says "the kitchen" (70:2080-2087), and the office says "main screen" (84-office-data.js:1409-1410, 87-office-closeday.js:158, 82-office-money.js:823), "main computer" (84-office-data.js:1409-1410) and "hub computer" (20-engine.js:88). An owner cannot tell these are the same thing. Suggest "the hub computer" for the machine, "the kitchen" for the shared kitchen (A2, A3, A5).
- Checked and fine: Last known, Offline, Sending, Not confirmed yet, Not done:, Reload to update, Reset the offline copy, Opens without the internet, A new version is ready, the undo refusal.
