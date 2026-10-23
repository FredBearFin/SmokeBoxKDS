# Test plan: two real tablets on one kitchen

For Freddy. Plain steps to try the connected build on two real tablets. **Nothing here has been tried on real hardware.** Every step says what should happen. Write down what you see when it does not. Do not run a real kitchen on this.

## What you need

- Two tablets (try one Android and one iPad if you can), charged, with Chrome (Android) and Safari (iPad).
- A third screen if you have one (a TV or phone), for Show only.
- One computer on the same Wi-Fi to run the main computer. Or a server: use the beta instance below.
- A pen, and a phone to take photos of anything odd.

## Part 1: the main computer (the hub) on your own computer, same Wi-Fi

1. On the computer: `node tools/build.mjs --quiet`, then `PORT=8787 SMOKEBOX_FOLLOW_CODE=ABC123 SMOKEBOX_STARTER=1 node server/server.mjs`. Find the computer's address on the Wi-Fi (like 192.168.1.20).
2. Open `http://<that address>:8787/?hub&code=ABC123` on tablet 1.
   - Should happen: the board opens with demo dishes and "Connected" in a small bar.
   - If not: write the message on the screen and the address you typed.
3. Open the same address on tablet 2.
4. Be aware: a plain http address on Wi-Fi **cannot** open without the internet later. That is expected. Part 3 needs https.

## Part 2: two tablets taking orders

Do each and write down yes or no.

| Step | Should happen |
|---|---|
| Tablet 1: New ticket, a dish, Send to kitchen | The ticket shows on tablet 2 within a few seconds |
| Tablet 2: tap Start on that dish | Tablet 1 shows it started |
| Both: tap Start on the same dish at the same moment | One tablet may be refused with "Not done:" and a reason, and both screens end up the same (the builders tested one kind of conflict only) |
| Tablet 1: Start a dish, then on tablet 2 send another ticket, then tap Undo on tablet 1 | Tablet 1 says "Someone else changed the kitchen since..." and does not undo |
| Tablet 1: Start a dish, then tap Undo straight away | The dish goes back to not started |
| Turn Wi-Fi off on tablet 2. Take an order there | The bar says "Offline: your taps are saved and will be sent". The ticket shows "Not confirmed yet" |
| Turn Wi-Fi back on | The bar says "Connected", the marker goes away, both tablets agree |
| Open `http://<address>:8787/?follow&code=ABC123` on the third screen | "Connected" and "This screen only shows the kitchen." Taps on it do nothing |
| Stop the main computer (Ctrl+C on the computer) and wait a minute | The Show only screen says "Reconnecting..." and then "Out of date since" with a red banner |
| Start the main computer again | Everything says "Connected" |

If a step goes wrong, write down: which tablet, what you tapped, the exact words on the screen, the time, and take a photo.

## Part 3: opening without the internet (needs https)

This needs a secure address, so use the beta instance (below) or another https address.

1. On each tablet open the main computer address once with the main computer reachable. Then Settings, **Tablet checks: screen, sound, home screen**.
   - Should happen: the card **Opens without the internet** says "Yes: this tablet can open Smokebox without the internet."
2. Turn Wi-Fi off, close the page fully, and open Smokebox again from the home screen icon.
   - Should happen: the page opens and the bar says "Last known, from" a time, and "Offline: your taps are saved and will be sent".
3. Take an order while offline, turn Wi-Fi on. It should send.
4. iPad only: add Smokebox to the Home Screen first and use it from that icon. Check again after a week, because Safari may clear stored data after about a week if you do not. Write down whether it opened without the internet on day 7.
5. If the stored copy misbehaves: Settings, **Help and about**, **Reset the offline copy**. It should reload from the server and not touch the board.

## Part 4: the beta instance on a real server

**Not run on a real server.** Read `beta.sh` once first. Run it at a quiet time.

1. On the server that already ran `go.sh`, as root: `bash beta.sh` (with an `.sslip.io` name) or `bash beta.sh beta.yourdomain.com` (its DNS must already point at the server).
2. It prints two addresses, once: one for writing tablets (`/?hub&code=...`) and one for watching screens (`/?follow&code=...`). Copy them now. Sign in with the real site's login.
3. Open the first on both tablets and the second on the third screen. Repeat Part 2 and Part 3.
4. The real Smokebox must keep working the whole time. Open it and check after the install and after the removal.
5. To remove: `bash beta-remove.sh` (or `--keep-data`).
   - If the script stops with a message, write it down. It says it undoes its own Caddy change if Caddy refuses.

## Part 5: pairing

On the tablet the join form shows **Pairing code** and **Pair this tablet** once the main computer asks for pairing.

1. Start the main computer with `SMOKEBOX_REQUIRE_TOKENS=1 SMOKEBOX_DATA=/path/hub.json`. Open it on a tablet: it should say it is not paired and ask for a pairing code.
2. On the main computer: `node server/server.mjs admin pair --data /path/hub.json`. It prints six letters and digits and says it works once, for 10 minutes.
3. Type the code in **Pairing code**, tap **Pair this tablet**, then choose and tap **Join this kitchen**. It should join. Use the same code on a second tablet: it should be refused (a code works once).
4. `node server/server.mjs admin list --data /path/hub.json` shows both screens. Remove one with `admin revoke ID`: that tablet should stop at once and say it was removed. Pair it again with a new code and any taps it was holding should be sent.
5. Type a wrong code five times: that address is locked for ten minutes, even for the right code.

## What to write down

Copy this table onto paper. One row for every step that did not do what the plan says.

| When (time) | Part and step | Which screen (tablet 1, 2, third) and its browser | What you tapped | What should have happened | What happened, in the screen's exact words | Photo taken (yes/no) |
|---|---|---|---|---|---|---|
| | | | | | | |
| | | | | | | |
| | | | | | | |

Also write down, even when everything worked: the main computer's address, which tablets and browsers, the Wi-Fi name, how long each part took, anything slow, anything that flickered, and any time a tap seemed to vanish. Do not share photos of the address bar: it contains the access code or pairing details.

## If it goes wrong (one page)

1. **Stop and write.** Note the time, the screen, what you tapped and the exact words. Take a photo. Do not fix anything yet.
2. **The tablet shows an error instead of the board.** Read the words. "Not paired" means you need a pairing code. "Removed" means pair it again. "Different versions" means reload the page from the main computer. "Cannot reach the main computer" means check Wi-Fi and the address.
3. **A tap did not do what you expected.** Look for "Not done:" and read the reason. Look for "Not confirmed yet": the main computer has not answered. Wait for "Connected" before you try again.
4. **Undo says "Someone else changed the kitchen since".** That is expected when another tablet acted. Fix it by hand.
5. **The tablet says "Offline".** Check Wi-Fi. Taps are saved and will be sent. Do not reload the page until it says "Connected" (what happens to waiting taps after a reload is not checked).
6. **A screen shows "Out of date since".** Do not trust it. Check the main computer is running and the network is up.
7. **The page will not open without the internet.** Check Tablet checks: screen, sound, home screen, the card "Opens without the internet". It needs https. Try **Reset the offline copy** in Help and about.
8. **A tablet looks wrong or stuck.** Go back to your own kitchen: menu button, then **Back to my own kitchen** (Show only), or **Leave the shared kitchen**. Your own saved kitchen is untouched.
9. **The main computer misbehaves.** Stop it with Ctrl+C, start it again with the same `SMOKEBOX_DATA` file. The kitchen is kept. Write down what the terminal said.
10. **The beta server install stops.** Read its message. It undoes its own Caddy change if Caddy refuses. Run `bash beta-remove.sh` if you want it gone. The real Smokebox must still open; check it first.
11. **You are not sure.** Stop. Nothing here is a real kitchen. Write it down and move on.

## What this plan does not cover

Phones as kitchen displays, more than two tablets, a long service, a power cut, a hub restart that changes its identity, and any real food-safety use.
