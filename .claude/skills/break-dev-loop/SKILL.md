---
name: break-dev-loop
description: Verify a change to the Break module in a real running Foundry world using foundry-bridge — reload the client, read captured console errors with real stacks, watch socket-driven state, screenshot the prompt/results windows, and stage several live clients. Use when the user asks to "test this change", "does it work in Foundry", "check for errors", "reload and see", "show me the prompt/results window", or after editing anything under `apps/` or `scripts/`.
---

# The Break dev loop

Break has no build step and no test suite — the browser inside Foundry loads
`scripts/module.js` as authored. Verifying a change means loading it in a real
world and looking. `foundry-bridge` turns that into commands instead of clicking.

The bridge is an MCP server registered at user scope, so the `fvtt_*` tools are
available here with no setup. Prefer them over the CLI: the MCP server is
long-lived, so **sessions and hook subscriptions persist across calls**. The
one-shot CLI (`node C:/Users/Rickd/Documents/foundry-bridge/hub/cli.js …`) drops
its clients when the process exits, which matters below.

## The loop

1. **Edit files in place.** This directory *is* the installed module
   (`FoundryVTT/Data/modules/break`), so there is nothing to copy.
2. **Reload** — `fvtt_reload`. Waits for `game.ready`; never evaluate before it.
   CSS and `.hbs` edits apply without this (`hotReload: true` in local's
   `Config/options.json`); **JS always needs a reload.**
3. **Read the errors** — `fvtt_console_tail`. Capture starts when the session
   opens, so world-startup errors are included, and stacks resolve to real files
   (`modules/break/scripts/module.js:30`) with Foundry's package attribution.

That third step is the highest-value tool in the bridge for this module. Check it
even when the change "looks fine" — a throw inside a socket handler is silent.

## Seeing the UI

Break's two applications:

| Selector | What |
|---|---|
| `#break` | The player-facing full-width prompt |
| `#break-results` | The GM's results/order window |

```
fvtt_screenshot { target: "#break-results", label: "results" }
fvtt_dom        { selector: "#break-results" }     # structure, no picture
```

Element captures clip to a box measured immediately before the shot, so these
absolutely-positioned windows are captured where they actually are.

## Several clients at once

Break is a multi-client module; a single GM client proves almost nothing about
it. Each session must be a **different Foundry account** — that is what makes
them separate connected clients. Two sessions on one account cannot coexist; the
second kicks the first.

Over MCP, just open them and they stay:

```
fvtt_open { session: "gm" }   fvtt_open { session: "p2" }   fvtt_open { session: "p3" }
```

From the CLI, sessions die with the process, so use `hold` to keep real clients
on screen:

```powershell
node C:/Users/Rickd/Documents/foundry-bridge/hub/cli.js hold --sessions gm,p2,p4 --env local --minutes 30
```

Check who is actually connected with `fvtt_users` (no login, safe anywhere) or
`curl -s http://127.0.0.1:30000/api/status`.

For the full staged-timing test, use the **`buzz-race`** skill instead of doing
this by hand.

## Watching socket-driven state

Break drives everything through socketlib (`showPrompt`, `dismissPrompt`,
`syncStatus`, `buzz` — registered in `scripts/module.js`). To see world-level
effects, subscribe to hooks and drain the buffer:

```
fvtt_events_subscribe { hooks: ["createChatMessage", "updateSetting"] }
fvtt_events_tail {}
```

Subscriptions **survive `fvtt_reload`**, which is the point. They only work
within one process, so this is MCP-only in practice — a CLI `events subscribe`
is gone by the next command.

## Exercising settings

Break registers `enable` and `duration` under the `break` namespace
(`scripts/module.js`). To test a config path without clicking through the
settings dialog:

```
fvtt_setting_set { namespace: "break", key: "duration", value: 15 }
```

This is a world write — fine on `local`, refused on `live`.

## Rules that apply here

- **Stay on `local`.** `live` is the real campaign with people connected. Break's
  whole behavior is "interrupt every connected client with a full-width prompt."
- Writes on `live` are locked by default and every mutating tool snapshots to
  `captures/undo/` first; `fvtt_restore` puts a document back.
- The bridge refuses to log in as an already-connected user, because doing so
  kicks them out mid-session.

## Related

- `buzz-race` — the staged multi-client ordering test.
- Bridge docs: `docs/recipes.md` (how to run things), `docs/tools.md` (the tool
  reference), `docs/troubleshooting.md` (symptoms first), under
  `C:/Users/Rickd/Documents/foundry-bridge/`.
