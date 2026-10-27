# Onboarding: the demo becomes a practice run

## What the research says
- **Upfront tutorials don't work.** Swipe-through "how to" cards at first launch don't make people better at the tasks. Nielsen Norman Group tested this with 70 users. What works is learning by doing, one thing at a time, when it's needed.
- **Value before sign-up.** Duolingo runs a real first lesson before it asks for an account.
- **Practice on the real thing.** Toast added hands-on POS tutorials in a sandbox. Restaurants ask for training on their own menu while they're open. Aloha's training tickets say "Do not make." Kitchen screens almost never have a training mode, so this sets SmokeBox apart.
- **High-turnover, mixed-language crews:**
  - pictures, voice and very short steps (3–5 minutes in total);
  - translated text alone isn't enough;
  - visual, minimal-text materials for food workers have been tested with Mandarin-speaking food service workers (Journal of Extension, 2019).

## The design
1. **Practice run, about 2 minutes, learn by doing.** It's built on the existing walkthrough (`src/js/74-floor-tour.js`), which already moves on only when the cook really taps, and uses practice tickets marked as demo that are cleared at the end and never counted in reports.
   - **Every step** has one big picture, at most about 10 words, and the same words spoken aloud in the kitchen voice.
   - **A hand animation** taps the exact button to press, on top of the existing pulsing ring.
   - **The steps:**
     1. a ticket arrives;
     2. tap Start on the flashing dish;
     3. the countdown;
     4. the gray dish waits to finish together;
     5. tap Done;
     6. wrong tap → Undo;
     7. Bump;
     8. "You're ready."
   - **The finish card** offers a next step: add your menu, add a tablet, or try the Hold cabinet.
2. **The first thing a new kitchen sees.** On the empty board, **Practice run (2 minutes)** becomes the big button.
   - **An empty kitchen** practices on a short practice menu: tickets marked practice, cleared after.
   - **A kitchen that already has dishes** practices on its own menu.
   - **Watch a busy night** (the old self-playing demo) becomes the smaller button.
3. **Always one tap away.** Help → Practice run, so a new cook on their first shift can do it on any joined tablet without touching real orders.
4. **First-time tips during real service** (next phase):
   - the first time something new happens for real (a full station, the first cabinet warning), one short tip is shown and spoken, once;
   - never more than one at a time, and never when more than 3 tickets are open.

## Verification
- A browser test runs the practice run on an empty kitchen and on a kitchen with a menu, doing each step for real.
- The run must end with no practice tickets left and no change to sales or reports.
- The words for each step are checked: at most 12 words, and each step has a picture.
