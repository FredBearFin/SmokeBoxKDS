Paste this as your first message in the new conversation, and attach smokebox-kds-handoff.zip and smokebox.html.

---

I'm continuing a project called Smokebox KDS, a kitchen display and order-entry app for small BBQ restaurants. I've attached smokebox-kds-handoff.zip (the full source plus HANDOFF.md) and smokebox.html (the current built app).

Start by unzipping the zip, reading HANDOFF.md all the way through, running `node tools/build.mjs --quiet` and `node tools/test.mjs` to confirm it works, and telling me in a few sentences what you understood. Don't change any code yet.

Rules: Smokebox is separate from Pitcall, so never touch Pitcall code, docs or memory. Quick targeted checks only; never run the long browser suites. Keep the LEAN comments (comment-audit must pass) and US spelling. Give me deep, analytical answers, write lists out in full, and use grams for food.

What I want next: I tested it myself and the kitchen experience needs a lot of work. The problems are in section 3 of HANDOFF.md. The meat in the hold cabinet expired and went 86 with no real warning, sound is off by default, tablets hide the Hold and 86 buttons, the text is too small to read from across a kitchen, and cooks need too many taps. The kitchen screen is for tablets and TVs, not phones; the phone is only for a manager glance tab. I want it to act more like an expo who tells cooks what to do, not a passive ticket board.

Propose the build order for Phase A (stop losing meat silently) from section 4, tell me what you'd change about it, and wait for my OK before writing code. When you build, test the user interface for real (device sizes, reading distance, tap counts, and a replay of the expiry scenario), not only the functions.
