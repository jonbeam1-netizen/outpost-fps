# Outpost — Deathmatch

A small browser FPS: free-for-all deathmatch for 2–10 players, peer-to-peer, no server.
One player hosts and gets a code like `DM-7K2F`; friends type the code to join.

## Put it online with GitHub Pages

1. Create a new **public** repository on GitHub (for example `outpost`).
2. Upload everything in this folder (`index.html`, `style.css`, `.nojekyll`, and the `js` folder).
3. In the repo: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, branch `main`, folder `/ (root)`, Save.
4. After a minute the game is live at `https://<your-username>.github.io/<repo-name>/`. Send that link to your friends.

## Playing

- **Host:** press HOST GAME. The code shows in the top-left corner and in the pause menu (click it to copy).
- **Join:** type the code and press JOIN.
- The match is unlimited free-for-all. If the host closes the tab, the match ends for everyone.

| Key | Action |
| --- | --- |
| WASD | move |
| Shift | sprint |
| C | crouch (toggle) |
| Space | jump |
| Q / E | lean |
| Right mouse | aim (hold, or toggle in settings) |
| Left mouse | fire |
| R | reload |
| B | fire mode |
| 1 / 2, wheel | primary / pistol |
| Tab | scoreboard |
| Esc | pause: loadout, settings, bots, leave |
| Enter (or T) | chat and commands |

## Bots

Type in the chat box (Enter), or use the + BOT / − BOT buttons in the pause menu:

- `/addbot` or `/addbot 3` — add bots (up to 10)
- `/removebot`, `/removebot 2`, `/removebot all` — remove bots
- `/botdiff easy|normal|hard` — bot skill

Bots run on the host's computer and show up for everyone like normal players. Anyone in the match can use the commands. Bots also work in offline practice.

Settings (volume starts at 10%, sensitivity, FOV, shadows, render scale, grass) are saved in your browser.

## Weapons

M4A1, AK-74, MP5A3, M870 and Mosin M91/30 as primaries, plus a Glock 17. Optics (red dot, holographic, 4x, PU scope) and suppressors can be changed in the loadout screen.

## Notes

- Peer-to-peer uses the free PeerJS matchmaking server only to connect players; game traffic goes directly between players' browsers.
- Some strict networks (school/work Wi-Fi, some mobile hotspots) block direct connections. If a friend can't join, try another network.
- Run it locally with any static server, for example `python -m http.server` in this folder, then open http://localhost:8000.
