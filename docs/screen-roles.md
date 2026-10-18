# Screen roles (step 3 sketch, for Freddy's OK before steps 4 to 8)

## The problem today
The Pit station (`C.zones` in `10-config.js`, "Pit and slicing") is one tab that mixes two jobs on two clocks:
the **pit master** (batches, hours: cook, load, hold, discard) and the **cutter** (tickets, minutes: slice to
order). The Hold cabinet, 86 board and Recall are header sheets shared by everyone. Nothing on the board
tells either person what to do next about a batch.

## Roles and what each one must see with zero taps

| Role | Clock | Must see without touching | Must be able to do in 1 tap | Device |
|---|---|---|---|---|
| Pit master | hours | Which batch goes first, what is lost if nothing is done (grams, dollars), when each item runs out, what to cook next and by when | Log a temperature, start a new batch (same as last), acknowledge an alert | Tablet or TV near the pit, 1024x768 minimum |
| Cutter / line | minutes | Oldest ticket, what to slice or assemble now, which cabinet batch to pull from (oldest first) | "Pulled 1 kg" from a batch; start or finish an item | Tablet at the cutting station |
| Front / counter | minutes | Order entry, open orders, what is 86 | New ticket, take payment | iPad at the register |
| Manager | day | Money so far, open orders, anything late, what is 86, when brisket runs out | none required (glance) | Phone, glance tab only |
| Owner-operator (one person, many hats) | both | Whatever the current hat needs | Same as above | Switch role with one tap, device remembers it |

Device follows role, not person. Tiny places will run one tablet showing the pit master and cutter views
side by side or toggled.

## Decision for steps 4 to 8 (recommendation)

1. **Split the Pit tab into two views of the same data, not two stations.** Tickets stay on the Pit station.
   Add a **Cabinet** view (the pit master's screen) next to it. The Hold cabinet sheet becomes this view
   rather than a modal behind a header button.
2. **Cabinet pulls live on the cutter's view, not the pit master's.** The cutter's hands are on the meat, so
   the "pulled 1 kg" tap belongs on each pit ticket item (and on a quick bar on the Cabinet view for
   the one-person case). The pit master never has to enter sales.
3. **The attention strip appears on both views and on the Manager tab.** It is the same deadline feed; the
   pit master gets batch rows (expiry, projected waste, run-out), the cutter gets ticket rows plus "pull from
   [oldest batch]". Acknowledging on either clears it everywhere.
4. **Ladder sounds play on the pit master's device** (and the one-person device). A cutter-only device gets
   visual rungs only, so two tablets in one room do not both shout.
5. **Pit screen first, line screen after the gate**, as agreed. The only line-side change before the gate is the
   "pulled 1 kg" tap.

## What this means for each step
- Step 4 (cabinet pulls): pull button on pit-ticket items plus a quick bar on the Cabinet view; pulls deduct from the oldest batch.
- Step 5 (feed + strip): one feed, rendered per role.
- Step 6a (ladder, sound): sound owner is the pit master device; speech toggle per screen.
- Step 8 (big type): applies to the Cabinet view first.

## Open questions for Freddy
- One-person kitchen default: toggle between the two views, or show them side by side at 1280 px and above?
- Is "cutter" the right word for the BBQ places you know ("slicer", "line")?
