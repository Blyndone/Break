---
name: buzz-race
description: Run the multi-client buzz race against a real Foundry world via foundry-bridge — opens a GM plus N player clients as separate accounts, calls a break, has each player buzz by pressing Space at a staged delay, and asserts the GM's rank order matches. Use when the user asks to "test the buzzer", "run the buzz race", "check turn order", "verify reaction timing", "test with multiple players/clients", or wants proof that a change to prompt/clock/results code didn't break ordering.
---

# The buzz race

Break's premise is that **each client times its own player** — turn order comes
from reaction speed, not from network latency or a roll. That claim cannot be
tested in one browser. It needs a GM plus several simultaneously logged-in
players, each buzzing at a different moment. `foundry-bridge` exists to make
this test runnable, and this is the one test worth running before any release.

Players buzz by **pressing Space**, the same path a human takes — not by calling
`breakUI` internals — so the client-side clock is exercised for real.

## Prerequisites

- Local Foundry running at `http://127.0.0.1:30000` with a dnd5e world loaded.
  Cheapest check, no browser: `curl -s http://127.0.0.1:30000/api/status`
- `break` and `socketlib` both **enabled** in that world. Break's ordering is
  entirely socket-driven; without socketlib the prompt never leaves the GM.
- Distinct Foundry accounts for each client, with passwords in the bridge's
  `.env`. Sessions are named in `bridge.config.json` (`gm`, `p2`, `p3`, `p4`),
  not by Foundry user name.

## Running it

From the bridge repo (`C:/Users/Rickd/Documents/foundry-bridge`):

```powershell
node C:/Users/Rickd/Documents/foundry-bridge/profiles/break/buzz-race.mjs --env local --players p2,p3,p4 --delays 300,900,1500
```

Useful flags:

| Flag | Effect |
|---|---|
| `--players p2,p4` | Which sessions seat as players. Needs one delay each. |
| `--delays 300,1200` | Milliseconds each player waits before buzzing. |
| `--text "..."` | The break prompt text the GM sends. |
| `--gm gm` | Which session runs as GM. |
| `--keep-open` | Leave the clients up afterwards so you can look at them. |

**Exit code is the result.** Non-zero means the GM's rank order did not match the
staged delays — that is the regression. Report the printed order alongside the
staged order rather than just "it failed."

## Reading the output

The profile screenshots the GM's `#break-results` window at the end. Read that
PNG — it is the user-visible artifact and often shows the real problem (a missing
row, a clock reading 0ms, a name attributed to the wrong seat) more directly than
the ordering assertion does.

## The staging caveat — do not "fix" this

Each delay is measured from **that client's own prompt arrival**, not from a
shared `t0`. This is load-bearing:

- Prompts do not arrive simultaneously. **1.9s of spread has been observed
  between two local clients.**
- Break times each player on their own clock.
- So staging from one shared start makes the client that got the prompt *late*
  look like the fastest buzzer, and the test reports a failure that isn't one.

If the race seems to produce nonsense ordering, suspect a change to how the
prompt-arrival timestamp is captured (`apps/break.js`, `apps/clock.js`) before
suspecting the harness.

## When it fails

1. Read `#break-results` in the screenshot.
2. Pull console errors from **each** client, not just the GM — a player-side
   throw is invisible on the GM screen:
   `fvtt_console_tail` per session, or
   `node .../hub/cli.js console --env local --session p2 --type error`
3. Ordering-only failures with clean consoles point at `apps/results.js`
   (`record`) or the socket payload in `scripts/module.js`.

## Do not run this against `live`

`live` is the real campaign with real people connected. The bridge refuses to
log in as an already-connected user, but the race also *calls a break* — a
full-width prompt on every connected client. Keep it on `local`.

## Related

- `break-dev-loop` — the edit → reload → read-the-errors loop for ordinary
  changes. Use that while iterating; use this to prove the result.
- Bridge docs: `C:/Users/Rickd/Documents/foundry-bridge/docs/recipes.md`
