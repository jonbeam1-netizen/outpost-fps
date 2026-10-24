# Holdover — Sniper Deathmatch

A browser sniper deathmatch for 2–10 players in a ruined hillside town at dusk. Peer-to-peer, no server:
one player hosts and gets a code like `DM-7K2F`, friends type the code to join. Bots fill the gaps.

*Holdover* is the sniper's word for aiming above a target to make up for bullet drop — which you'll be doing a lot.

## Put it online with GitHub Pages

1. Create a new **public** repository on GitHub.
2. Upload everything in this folder (`index.html`, `style.css`, `.nojekyll`, and the `js` folder).
3. In the repo: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, branch `main`, folder `/ (root)`, Save.
4. After a minute the game is live at `https://<your-username>.github.io/<repo-name>/`.

## Playing

- **Host:** press HOST GAME. The code shows in the top-left corner and in the pause menu (click it to copy).
- **Join:** type the code and press JOIN.
- **Practice:** press PRACTICE to play offline against bots (`/addbot 4`).
- **Modes** (pause menu, or type `/mode lms` / `/mode ffa`):
  - **Free-for-all** — unlimited respawns.
  - **Last Sniper Standing** — one life each. When one sniper is left they win the round (★ on the scoreboard),
    and after a few seconds everyone drops back in for the next round. Bots count as players.
- If the host closes the tab, the match ends for everyone.

| Key | Action |
| --- | --- |
| WASD | move |
| Shift | sprint |
| C | crouch (toggle) |
| Z | prone (toggle) |
| Space | jump / stand up |
| Q / E | lean |
| Right mouse | scope in (hold, or toggle in settings) |
| Mouse wheel | zoom while scoped, otherwise swap weapons |
| Left mouse | fire / stab |
| R | reload |
| 1 / 2 / 3 | rifle / Desert Eagle / M9 bayonet |
| V | quick knife |
| Tab | scoreboard |
| Esc | pause: loadout, settings, bots, leave |
| Enter (or T) | chat and commands |

## How it plays

- **Rounds really fly.** Bullets travel and drop with gravity; rifles are zeroed at 100 m. Scope reticles carry
  range marks (200/300/400/500 m) worked out from each rifle's velocity, and the scope shows a laser range readout.
- **Health:** 4 hearts (25 each) and 2 armor plates (25 each). Plates soak damage first, then hearts.
  A damaged heart slowly knits back to full; a lost heart stays lost. Plates come back only from plate pickups.
- **Headshots kill** with every rifle. Body shots take two or more (three from the SVD against full plates).
  The **M9 bayonet kills in one stab**, plates or not.
- **Ammo cans** float and spin at fixed spots around town and come back 30 s after someone takes one.
  **Armor plates** appear rarely at random spots and rot away if nobody grabs them.
- **Stay hidden.** Bushes and tall grass hide you from bots, going prone makes you hard to spot, and a scope pointed
  at someone glints. Unsuppressed shots give your position away; suppressors are much quieter but not silent.
- **Kill cam.** Taken out by a rifle round? Watch it fly in from your killer's muzzle in slow motion, with range,
  flight time and drop. Press any key to skip.
- **Mind the birds.** Crows and pigeons perch on roofs, parapets and power lines. Walk, sprint, jump or fire an unsuppressed
  shot near them and the flock bursts into the air, loudly. Everyone (bots included) can read that as "someone's there".
  Crouch-walk or crawl past and they stay put.

## Weapons

Primaries: AWM / L115A3 (.338), Barrett M82A1 (.50 BMG), Dragunov SVD (7.62x54R), CheyTac M200 Intervention (.408).
Secondary: Desert Eagle .50 AE. Melee: M9 Bayonet.

Loadout mods (pause → LOADOUT): scopes — Vortex Razor 1–6x, PSO-1 4x (SVD), Leupold Mk4 4.5–14x,
S&B PM II 5–25x, Nightforce ATACR 7–35x; muzzle brake or suppressor; bipod (steadies the scope crouched or prone).

## Bots

Type in the chat box (Enter), or use the + BOT / − BOT buttons in the pause menu:

- `/addbot` or `/addbot 3` — add bots (up to 10)
- `/removebot`, `/removebot 2`, `/removebot all` — remove bots
- `/botdiff easy|normal|hard` — bot skill
- `/mode lms` or `/mode ffa` — switch game mode

Bots run on the host's computer. They pick sniper nests, glass the streets through their scopes, relocate after
shooting, compensate for drop, hear unsuppressed gunshots, and go for the knife up close.

Settings (volume starts at 10%, sensitivity, FOV, shadows, render scale, grass, film grain) are saved in your browser.

## Notes

- Peer-to-peer uses the free PeerJS matchmaking server only to connect players; game traffic goes directly between browsers.
- Some strict networks (school/work Wi-Fi, some mobile hotspots) block direct connections. If a friend can't join, try another network.
- Run it locally with any static server, for example `python -m http.server` in this folder, then open http://localhost:8000.
