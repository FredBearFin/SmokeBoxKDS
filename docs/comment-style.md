# How to comment Smokebox (LEAN)

The owner's rule: keep the comments **lean**. The point is that someone can understand the program well enough to maintain it. Not a tutorial, not a wall of text. (An earlier, much heavier standard was withdrawn. If you already wrote heavy comments, trim them to this.)

## Who is reading
Someone who runs a BBQ restaurant and is learning to look after this code. Use plain words and short sentences. Prefer an everyday word to a code word. If a code word is really needed to follow a comment, put a few words of explanation in brackets the first time it appears in that file, for example: state (everything the app knows right now). Do not talk down, and do not use "simply", "just" or "obviously".

## The rules

1. **File header, at most 8 lines**, a block comment at the very top with:
   `WHAT THIS FILE IS:` one to three plain sentences. `PARTS:` the sections in order, one short line each (or one line listing them). `USES / USED BY:` which other files it depends on and which ones call it.
2. **Above every function, one to three plain sentences:** what it does and what it gives back. Name the inputs only if their meaning is not obvious from their names. Add a `WATCH OUT:` line only when there is a real trap (a rule it protects, such as never negative stock or hot food stays at 135 F or above, or a case it handles on purpose). No labelled blocks, no kitchen analogies, no examples. The one exception: a small example with numbers is welcome where the logic is truly tricky (meal-pacing maths, yield, service-day rollover).
3. **Inside a function, comment only the "why"**: a rule being enforced, a workaround, a surprising choice, the reason for a number. Do not narrate what each line does. A long function (over about 40 lines) gets a short note at each major step so a maintainer can find their way.
4. **Constants and settings:** a few words for the unit and the reason, like `// 135 F: lowest legal hot-holding temperature` or `// 10 000 ms = the 10 seconds you get to undo`. Mark starter estimates: "starter estimate, owner to confirm".
5. **Keep existing comments that are already clear.** Do not rewrite them for style. Fix any that are wrong or out of date. No commented-out code, no TODO or FIXME.
6. **Tables of data** (menu items, icon paths, colour lists): one comment above explaining the columns, then wrap the table in `// audit:data-start` and `// audit:data-end`.
7. **CSS:** a short header, then one short line above each group of rules saying which part of the screen it styles ("the paper ticket slip and its torn edge"). Explain custom properties (`--name`) once in the header.
8. **The template** (`src/index.template.html`) has a short "READ ME FIRST" comment at the top (about 40 to 60 lines): what Smokebox is, how this one file is built from small source files (each starts at a banner line like `===== 20-engine.js =====` that you can search for), a map of the files in order with one line each, how an order flows through the program in five lines, the back office door (the Back office button, or tap the flame five times), and a short word list of about a dozen code words.

**Target:** roughly one line of comment for every 6 to 10 lines of code. More than that is too much.

## Technical rules (so nothing breaks)

* **Do not change any code.** Only add or edit comments (plus blank lines next to them). Check with `node tools/code-fingerprint.mjs check <file>`: it must print SAME for every file you touched (it parses the program, so one moved bracket is caught). Wave-2 builders: when your code is final run `node tools/code-fingerprint.mjs snapshot <files>` first, then comment, then `check`.
* Never write `</script` in a comment. Never write `*/` inside a block comment. Keep lines to about 110 characters. Plain ASCII only (no curly quotes, arrows or emoji).
* In `20-engine.js` and `30-store.js` do not copy lines of code into comments: some tests plant bugs by searching the source text for an exact expression.
* Run `node tools/comment-audit.mjs <files>` before you finish. It checks only: a file header, a plain comment above every named function (at least 6 words), no stretch of more than 40 lines of code with no note at all, and no `</script`. It is a floor, not a goal.

## A lean example (match this size and voice)

```js
/*
 * WHAT THIS FILE IS: Works out how long each dish should take for the quantity ordered.
 * PARTS: lookup of starter times, quantity scaling, rounding.   USES: 10-config.js.   USED BY: 20-engine.js.
 */

// Seconds a dish may take for this quantity (600 s for one brisket, 720 s for two). Never below the
// 15-second floor, and an unknown dish gives the floor instead of crashing the board.
function plannedSeconds(menuId, quantity) {
  const item = menuById[menuId];
  if (!item) return FLOOR_SECONDS;
  // Each extra portion adds 20 percent, up to a cap, because a big rack still fits in one oven.
  const extra = Math.min(CAP, 1 + 0.2 * (quantity - 1));
  return Math.max(FLOOR_SECONDS, Math.round(item.prepSec * extra));
}
```
