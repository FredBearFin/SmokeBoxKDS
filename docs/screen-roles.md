# Screen roles (step 3, revised after Freddy's review)

## The problem today
The Pit station (`C.zones` in `10-config.js`, "Pit and slicing") is one tab that mixes two jobs on two clocks:
the **pit master** (batches, hours: cook, load, hold, discard) and the **cutter** (portioning, minutes). The Hold
cabinet is a right-side sheet built by `openHold` (`72-floor-sheets.js:268`) behind a header button that is
hidden below 1180 px. Nothing tells anyone what to do next about a batch.

## Ground rules
- **Before the gate there is one tablet.** Solo mode is one device with views on it. Anything that needs two
  devices (shared acknowledgements, sound on one device only, the Manager phone tab) belongs to Connected or
  Phase D, after the gate. Acknowledgements are local to the tablet.
- **The lead product is a pit and hold manager beside someone else's POS.** In that mode there are no Smokebox
  tickets, so nothing in the design may depend on a ticket existing.
- **Name screens for where they sit, not for a job title.** "Pit and cabinet" and "Cutting board" work for one
  person wearing both hats. Role labels are a setting in the business profile. We do not pick between
  "cutter", "slicer" and "carver"; visit one asks what each place calls the role.

## Views (all on the same tablet before the gate)

| View | Clock | Must show with zero taps | One-tap actions |
|---|---|---|---|
| Pit and cabinet | hours | Which batch goes first, what is lost if nothing is done (grams and dollars), run-out time, "if started now, ready at HH:MM" flagged "after close" | Log a temperature, New batch (same as last), acknowledge |
| Cutting board | minutes | Oldest batch to pull from, the attention strip | **Pull** on a batch card; with Smokebox tickets, start or finish an item |
| Front | minutes | Order entry, open orders, 86 | New ticket, take payment |
| Manager (phone) | day | Money so far, open orders, anything late, 86, run-out | none. **After the gate.** |

## Decisions
1. **Two views of the same data, one deadline feed behind both.** Add a "Cabinet" tab that is not a station
   (a tab type separate from `C.zones`, `70-floor-board.js:42`), mounting the same builder as `openHold` in the
   page. This is a refactor, not a relabel, and it also fixes the Hold button hidden at 1024 px.
2. **Pulls live on the cabinet, not on tickets.**
   - Beside a POS: every batch card has a **Pull** button that moves one set unit (one whole brisket, one
     rack, one pan). The unit size is a per-product setting. This is the main mechanism.
   - With Smokebox tickets: when an item is marked done, deduct its portion weight from the oldest batch
     automatically (zero extra taps); the manual pull becomes a correction.
   - Always the oldest batch of that ingredient first.
   - The demo simulator also generates pulls, so the feed is not dead in the demo.
3. **The attention strip shows on every view**, as a tap-to-open target. Views never switch automatically (a
   screen that changes under a finger causes wrong taps).
4. **One-person default: toggle between the two views**, strip on both. The last view is remembered. Side by
   side only on TV or wide screens, about 1600 px and up (at 1280 px each half is about 640 px, which breaks the
   big-type goal and the 1024 px floor).
5. **Sound and speech** play from the tablet, with per-screen toggles. "Sound on one device only" waits for Connected.
6. **Tablet placement is part of the test.** The warmer and the cutting board may be meters apart. Put the
   tablet where the cutter can tap it without walking, and record the layout at every visit. Otherwise the gate's
   "under half of cuts get a pull tap" fails for a layout reason, not a product reason.
7. **"What to cook next and by when", cheap version, before the gate:** "if started now, ready at 11:40 pm" =
   now + cook time + rest time from the New batch form, shown beside the run-out time and flagged "after close".
   Planning tomorrow's quantities is post-gate.
8. **Dollar figures need real prices.** The loss number needs cost per kg and portion weight per product. Step 7's
   hand-entry of 5 to 8 products captures both, with set unit size for Pull. Until then the numbers are sample data.

## What this means for each step
- Step 4: Pull button per batch card with a per-product unit size; auto-deduct on ticket completion; simulator pulls.
- Step 5: one feed, rendered per view; includes "ready at" next to run-out. Strip on all views.
- Step 6a: sound and speech from the tablet; acknowledgements local.
- Step 7: capture cost per kg, portion weight and pull unit per product.
- Step 8: big type on "Pit and cabinet" first; the Cabinet tab as a page view.

## Added to visit one
- What do you call the person at the cutting board? What do you call the other roles?
- Where is the warmer relative to the cutting board, and where could a tablet sit within one-hand reach of both?
- Do cutters pull whole units from the warmer, or portion directly from it?
- Who looks at a screen during a rush today, and how often?
