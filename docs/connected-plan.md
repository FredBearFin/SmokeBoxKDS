# Connected plan: more than one screen (proposal, nothing here is built or sold)

Solo is one device with no sync. This note compares ways to let a pit screen, a line screen, a counter tablet and an owner's phone share one kitchen. `docs/commercial-decisions.md` says Connected mode stays unbuilt and unsold until a validated pilot and a named buyer ask for it. This is the thinking to have ready when that happens. A hub prototype exists (`server/`, PR for `a6/hub-server`) and a two-client sync test (`a6/hub-sync`); the prototype proves the plumbing in Node only, not any of the claims below about kitchens.

## 1. What has to be true

- The engine is pure: `apply(state, type, payload, now)`. One place applying every action in one order is enough to keep screens in step. The hub prototype does exactly that and tells the screens what changed.
- Screens must keep working when the link drops. A cook who cannot bump a ticket because the Wi-Fi blinked will stop trusting the app.
- Food-safety records and warnings must not depend on the internet.

## 2. Options

| | A. Hosted (cloud) | B. Local hub (a small computer in the kitchen that we supply or the owner installs) | C. Bring your own box (BYO: the owner's existing PC or laptop runs the hub program) |
|---|---|---|---|
| Where state lives | Our server | A box in the building | A computer the owner already has |
| Needs internet | Always, for every action | No (only the local network) | No |
| Setup | Easiest: sign in | Plug in, join Wi-Fi | Install a program, keep the computer on |
| Our cost to run | Servers, monitoring, on-call, backups | Hardware to buy, ship, replace | Support time for installs on unknown machines |
| Failure we own | Our outage stops every kitchen | A dead box stops one kitchen | The owner turns the PC off or it updates mid-service |
| Privacy/legal | Guest data on our servers: most review | Data stays on site | Data stays on site |
| Fit for rural kitchens | Weak (see section 5) | Strong | Medium |
| Fit with "software only" | Yes | No (hardware) | Yes |

Opinion, to be tested: C first as the cheapest way to learn, B only if C installs fail in the field, A last and only for owners who ask for remote access and have solid internet.

## 3. Failure modes and what the design must do

| Failure | What the cook sees today (Solo) | Required behavior when connected |
|---|---|---|
| Wi-Fi drops for minutes | Not applicable | Screens keep working alone and queue actions; a clear "not connected" badge; replay on reconnect (prototype: queued actions are replayed with their original times) |
| Hub or hosted service down | Not applicable | Every screen keeps working as a Solo screen on its own copy; no data entry blocked |
| Two screens act on the same ticket | Not applicable | One order wins; the other screen shows the result, not an error |
| Two screens disagree after a long outage | Not applicable | Known gap in the prototype: clients and hub can number tickets differently after an offline replay. Needs the screens to adopt the hub's state. Must be solved before any pilot |
| Screen clocks differ | One clock | The hub clock is the truth; screens correct to `serverNow`; test with clocks off by minutes |
| Power cut to the hub | Not applicable | Hub saves to disk after each change; restart restores; screens re-sync from the log or a snapshot |
| Hub restart loses recent history | Not applicable | Recent action log is in memory in the prototype; after a restart screens take a full snapshot |
| Wrong person on the network | Not applicable | Prototype has no login and no TLS. Not acceptable beyond a trusted private network; needs a join code or pairing before real use |
| Update mid-service | Owner replaces the file | Never update a hub or screens during service; version check on connect |
| Warnings (batch expiry, temperature checks) | Run on the one screen | Must still fire locally with no link; the hub must never be the only thing that can warn |

## 4. Build order with kill criteria

Each step ends with a stop-or-continue decision. A kill criterion means: if true, stop and do not start the next step.

1. **Pilot of Solo finishes** (`docs/pilot-protocol.md`). Kill: the gate fails, or no owner asks for a second screen. Connected stays unbuilt.
2. **Make clients adopt hub state** (fix the numbering gap above) and a browser transport that talks to the hub; test with several simulated clients and a flaky link. Kill: cannot make two simulated clients agree after random drops without changing the engine's rules.
3. **Pairing and access**: a join code, a name per screen, TLS or a trusted-network rule. Kill: a setup a non-technical owner cannot finish in 10 minutes unaided on the first try (measured with two real owners).
4. **One real kitchen, observer present, two screens on the owner's own computer (option C)** for one service. Kill: any lost or duplicated ticket, or any minute the board was unusable because of the link.
5. **Decide A, B or stay with C** from step 4 evidence and from the rural internet answer (section 5). Kill: nobody will pay more than the Solo price for it.

Nothing in steps 2 to 5 is promised to anyone until step 4 has passed.

## 5. The internet question for rural kitchens

The mental model customer is rural West Virginia. Many such places have slow, expensive or unreliable internet, cell signal may be weak inside a metal-and-brick building, and some have no broadband at all. That is the strongest argument for local options B and C and against A as the default. To find out, before building anything:

1. Ask each pilot owner: is there internet in the kitchen itself (not the office), who provides it, what does it cost, how often does it drop, and does the card reader depend on it?
2. Measure at the pit position: Wi-Fi signal and a 10-minute dropout log on the owner's own network. A local network does not need internet, only a working router.
3. Write down where a router and a power outlet could go near the pit and the counter.
4. Decide: if more than a third of target kitchens cannot rely on the internet all service long, hosted-only is ruled out.

This has not been asked of any real kitchen yet.

## 6. Pricing and support (open)

A second screen changes support: more devices, network problems we do not control. Decide before any build whether Connected is a higher monthly price, a one-time setup, or not offered. See `docs/commercial-decisions.md`; privacy review for any option that holds guest data off the device is in `docs/privacy-and-retention.md`.
