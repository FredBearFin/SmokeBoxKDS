# Final board screenshots (round 8)

Simulated in headless Chromium, built from `night/a1-r8`. Files are named `<state>-<theme>-<width>.png`: theme is `day`, `night` or `large` (Day with Large text), width is 1024 (1024x768) or 1920 (1920x1080). The wall state exists only at 1920 because wall mode needs a window 1700 px wide. The demo states show the demo bar at the top ("You are trying the demo"). Nothing here was seen on a real tablet or TV.

| State | What to look for |
|---|---|
| `01-blank` | A new kitchen: one big "Add your first dish" button, a quiet "Show me how it works" and the demo link. No Cabinet tab, no Sanitize chip, no zero badges. The sound bar has words, a "?" and an X. |
| `02-setup-card` | Three dishes added: the "Your menu is ready" card and the empty board under it. Known: "Show me how it works" appears twice (card and empty board). |
| `03-one-ticket` | A single ticket with a rush stamp and an allergy note. Number and timer first, dish names large, helper lines quiet, Bump under the dishes. |
| `04-twelve-tickets` | Tickets in one grid row share a height. Check nothing is cut off at the right edge and the all-day strip fades at its end. |
| `05-overdue` | Late board: "Do this first" and "Next" tags, calm paper for the rest, one warning row, "+N more" on the strip name. At Night the paper tickets must still be readable (they were not before round 6). |
| `06-cabinet` | The compact cabinet cards: one main button and "...", the same layout on every card, three across at 1920. |
| `07-wall` | Wall mode: orders on the left, tickets in the middle, manager glance on the right. No horizontal scroll; one notice row. |
| `08-far-display` | Far display: bigger strip and ticket text, the Overdue badge on its own line, one strip row. Fewer tickets fit on purpose. |
