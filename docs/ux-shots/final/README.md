# Final board screenshots (round 15)

Simulated in headless Chromium, built from `night/a1-r15`. Nothing here was captured on a real device or in a real kitchen. Files are named `<state>-<theme>-<width>.png`: theme is `day` or `night`, width is the screen width in pixels (1024x768, 1280x800, 390x844 phone, 1920x1080). The demo banner at the top is the demo kitchen, not a real one.

| State | Sizes | What to look for |
|---|---|---|
| `01-blank` | 1024, 390 | A new kitchen: one big "Add your first dish" button, a quiet "Practice run (2 minutes)", no Cabinet tab, no zero badges. |
| `02-setup-card` | 1024, 390 | Three dishes added: the "Your menu is ready" card above the empty board. |
| `03-counter-board` | 1280, 390 | Counter service (a bakery): no station or EXP tabs, no START or DONE words, no next-step lines, no late colors. Each order is a plain list ended with Bump. |
| `04-cold-cabinet` | 1024, 1280, 390 | The hold cabinet with hot and cold items together. Cold fridge cards show the out-of-fridge ring, "In the fridge since" or "Out of the fridge since" with the made date, the fridge date, one line in words ("Under 1 min out of your 2 h limit", "no limit set") and Take out or Put back as the one main button. Hot cards are unchanged. |
| `05-wall` | 1920 | Wall mode: orders on the left, tickets in the middle (late ones first, in the page as well as on screen), manager glance on the right. |
| `06-far-display` | 1920 | Far display: bigger strip and ticket text, one strip row, fewer tickets on purpose. |

Known: the sound bar ("Tap here to turn on warning sounds") shows in most shots because headless Chromium has had no tap yet. The cold card is a little taller than a hot card because of its extra line.
