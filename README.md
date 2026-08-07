# Break – A Player Buzzer for Foundry VTT

![Foundry v13](https://img.shields.io/badge/Foundry-v13-informational)
![Latest Release](https://img.shields.io/github/v/release/Blyndone/Break?label=latest)
![License](https://img.shields.io/badge/license-GPL--3.0-blue)

## Module Preview

Break is a game-show style buzzer for Foundry VTT. The GM calls a break, every
player gets a full width prompt across their screen, and the fastest to respond
act first.

It is built for low planning moments — an ambush, a trap springing, a bar fight
starting — where turn order should come from how quickly the table reacts rather
than from an initiative roll.

Each client times its own player, so a slow connection costs nothing. The
ordering reflects reaction speed, not latency.

## ✨ Features

✅ **One-command rounds** – `/break` in chat prompts every connected player.

✅ **Client-measured timing** – Every client measures the gap between its own
overlay painting and its player responding, then reports that number. The GM
ranks on reported times, never on message arrival order.

✅ **Live GM results window** – Ranks fill in as buzzes land, with the players
who have not answered yet still listed.

✅ **Response caps** – `/break 3` keeps only the fastest three. Capped-out
responses stay visible but greyed, so the GM can still read the whole field.

✅ **Countdown timer** – A bar across the band counts down, with a hovering
millisecond clock at its centre.

✅ **Chat results** – The final ranking posts to chat when the round ends.

## 📥 Installation

### 🔹 Foundry VTT (Manifest URL)

Copy and paste the following manifest URL into Foundry VTT's **Install Module**
screen:

```
https://github.com/Blyndone/Break/releases/latest/download/module.json
```

### 🔹 Foundry VTT (Manual Installation)

1. Download `module.zip` from the
   [Releases page](https://github.com/Blyndone/Break/releases/latest).
2. Extract the folder into `FoundryVTT/Data/modules/`.
3. Enable the module in **Game Settings > Manage Modules**.

## 🎲 Usage

Type in chat as the GM:

| Command                   | Effect                                   |
| ------------------------- | ---------------------------------------- |
| `/break`                  | Prompt everyone, keep every response      |
| `/break 3`                | Prompt everyone, keep only the fastest 3  |
| `/break Zombies burst in` | Prompt with a message                     |
| `/break 3 Zombies burst!` | Both: cap at 3, with a message            |

A leading integer is always read as the cap, so `/break 3 goblins` caps at three
and prompts "goblins". To open with a number in the text, put something before
it: `/break the 3 goblins charge`.

Players respond with the **BREAK** button on their own portrait, or the space
bar.

### API

The module also exposes an API for macros:

```js
const api = game.modules.get('break').api

api.prompt({ text: 'Zombies burst in', limit: 3 })
api.dismiss()
```

## ⚙️ Settings

| Setting           | Scope  | Default | Effect                                        |
| ----------------- | ------ | ------- | --------------------------------------------- |
| **Response Time** | World  | 5       | Seconds to respond. 0 removes the time limit. |
| **Enabled**       | Client | on      | Turn the prompt off for one client            |

When the countdown runs out the buzzer closes and that player is marked as
having missed it. The GM's window ends the round on its own one second after the
deadline, which posts the results; the extra second lets a buzz sent just under
the wire on a slow connection still count.

With Response Time at 0 there is no countdown and the round stays open until the
GM clicks **End Round**.

## 🧮 How the ordering works

Each client measures its own elapsed time between the prompt painting and the
player responding, then reports that number. The GM ranks on the reported times,
not on the order the messages arrive, so a player on a slow connection is not
penalised for their latency.

The clock starts after the overlay has actually painted rather than when
`render()` resolves, so a slow client is timed on the player's reaction rather
than on its own render cost.

The cap is applied after sorting for the same reason: a fast reaction that
reaches the GM late still displaces a slower one that arrived first.

## 📋 Requirements

- Foundry VTT **v13** (13.302 or later)
- [socketlib](https://github.com/manuelVo/foundryvtt-socketlib)

## 📄 License

Released under the [GPL-3.0](LICENSE) license.
