# BREAK

A player buzzer module for Foundry VTT.

The GM calls a break; every player gets a full width prompt and the fastest to
respond act first. Intended for low planning scenarios where turn order should
come from how quickly players react rather than from an initiative roll.

## Usage

Type in chat as the GM:

| Command                   | Effect                                                  |
| ------------------------- | ------------------------------------------------------- |
| `/break`                  | Prompt everyone, keep every response                     |
| `/break 3`                | Prompt everyone, keep only the fastest 3                 |
| `/break Zombies burst in` | Prompt with a message                                    |
| `/break 3 Zombies burst!` | Both: cap at 3, with a message                           |

A leading integer is always read as the cap, so `/break 3 goblins` caps at three
and prompts "goblins". To open with a number in the text, put something before
it: `/break the 3 goblins charge`.

Players respond with the **BREAK** button on their own portrait, or the space
bar. The GM's results window shows the running order and who has not answered.

## How the ordering works

Each client measures its own elapsed time between the prompt painting and the
player responding, then reports that number. The GM ranks on the reported times,
not on the order the messages arrive, so a player on a slow connection is not
penalised for their latency.

The clock starts after the overlay has actually painted rather than when
`render()` resolves, so a slow client is timed on the player's reaction rather
than on its own render cost.

The cap is applied after sorting for the same reason: a fast reaction that
reaches the GM late still displaces a slower one that arrived first. Capped out
responses stay visible, greyed, so the GM can see the whole field.

## Requirements

- Foundry VTT v13
- [socketlib](https://github.com/manuelVo/foundryvtt-socketlib)

## Development

Styles are authored in `styles/input.scss` and compiled to `styles/styles.css`:

```
sass styles/input.scss styles/styles.css
```
