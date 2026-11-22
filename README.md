# Harkade

Browser games, deployed as a static site on Vercel (no build step).

## Games
- **LOADED!** (`/loaded/`): roll dice. stack charms. get loaded. A Yahtzee x Balatro dice roguelite with charms, mystery boxes, boss rounds, a Daily Run, Vs Bots, and online rooms via PeerJS room codes.
- **DEEP END** (`/deepend/`): shared-field Minesweeper meets push-your-luck, with solo rivals, PeerJS room links, reactions, and a four-depth score race.
- **GHOST CIRCUIT** (`/ghost-circuit/`): one-thumb oval racing where your past laps return as moving hazards; bank fictional shells or push the multiplier, solo or in PeerJS rooms.

## Deploy
Vercel → Add New Project → import this repo → Framework Preset: Other → Deploy. `/` redirects to `/loaded/`.

## Add a game
Drop it in its own folder (e.g. `/newgame/index.html`).
