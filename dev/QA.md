# HOLDOVER QA playtest

Tester: QA agent, 2026-10-24. Offline practice, driven through globals in the built-in browser (358x846 pane).
The tab ran in the background (rAF paused), so most tests step the game by hand: a copy of `frame()` with a fixed dt and
a virtual `performance.now()` clock. Other agents fixed things while I tested, so the last section re-checks every finding
on fresh scripts (final re-test ~1h40m in). **Status: OPEN = still broken at the final re-test; FIXED = gone at the re-test.**

Boot: no errors in `_seenErr` or the console in any session. 51 buildings, 40 spawns, 32 nests, 18 ammo spots, 30 plate spots, ~7600 colliders, 21 stairs.

---------------------------------------------------------------------------------------------------------------------------

## Prioritized list

| # | Sev | Status | File | Issue |
|---|---|---|---|---|
| 1 | major | OPEN | net.js / player.js | Bots never hear the host's (or the offline player's) gunshots |
| 2 | major | OPEN | bots.js | Bots can't hit a strafing player (0 hits at 100 m, even on hard) |
| 3 | major | OPEN | bots.js | Bots aim at empty air when going for a prone, side-on player's head |
| 4 | major | FIXED | player.js | Prone against a wall: camera inside the wall, see and shoot through it |
| 5 | major | FIXED | player.js | Prone facing up a steep slope: camera under the terrain |
| 6 | major | FIXED | map.js | Hall north arched door 1.80 m clear: standing players and bots stuck |
| 7 | major | FIXED | bots.js / pickups.js | Out-of-ammo bots stuck forever under rooftop ammo cans |
| 8 | minor | OPEN | bots.js | Bot knife hit uses a real-time `setTimeout(170)` |
| 9 | minor | OPEN | player.js | Player walks up ~69 deg terrain |
| 10 | minor | OPEN? | map.js | Blast-hole / arch colliders don't match the visible opening (not re-checked) |
| 11 | minor | OPEN | guns.js / README | SVD needs 3 chest shots vs full armour; README says body shots take two |
| 12 | polish | OPEN | net.js / ui.js | Geometry leak when bots are removed (~12 per bot), loadout preview gun not disposed |
| 13 | polish | OPEN | player.js | Prone body is a 0.3 m cylinder: legs/rifle (3.2 m total) poke through walls |
| 14 | polish | OPEN | ui.js / style.css | Narrow window: "K · D" overlaps the optic line; scope RNG/zoom text overlaps the hearts |
| 15 | polish | OPEN | player.js / ui.js | FOV setting is vertical: default 80 = ~115 deg horizontal on 16:9; LPVO at 1x is narrower than hip (55 deg) |
| 16 | polish | OPEN | ui.js | Name tag under the crosshair (40 m) shows players hidden in bushes/grass (projTrace ignores foliage) |
| 17 | polish | OPEN | main.js / character.js | Interiors and back-lit characters render near black (urban ghillie at 3 m looks like a silhouette) |
| – | minor | FIXED | ui.js | Offline chat lines appeared twice |
| – | minor | FIXED | pickups.js | Two plates could spawn on the same spot; bots chased taken plates |
| – | minor | FIXED | map.js | Ammo #9 / plate #20 floated over holes in ruined upper floors |
| – | minor | FIXED | bots.js | A* gave up on 35/1280 spawn->nest routes (iteration cap); now 1280/1280 |
| – | minor | FIXED | map.js | Tree colliders blocked shots beside trunks (now 2% of grazing rays, and those are barn walls) |
| – | text | FIXED | guns.js | AWM description "one to the chest and they stay down" (chest 85 leaves 65/0) |

---------------------------------------------------------------------------------------------------------------------------

## Details

### 1. MAJOR OPEN — Bots never hear the host's gunshots (net.js, player.js)
- `botsHearShot` is only called from `remoteShot` (clientReceive 'shot') and `botFire`. The host's own `netShot` goes
  `netOut -> hostReceive('shot')`, which skips `clientReceive` when `from === NET.myId`, so the host player's shots never alert bots.
- Repro: `addBots(1)`, hold the bot at (4,44) facing away (yaw +90 deg, nest yaw the same), player at (64,44.1), fire the AWM
  unsuppressed (`fireWeapon()`): `b.alertPos` stays null, `b.spot.me` stays 0. Calling `botsHearShot('me', CAMERA.position, false)`
  by hand sets alertPos (66.2,46.1) and spot 0.6. Re-tested on the final scripts: still not heard.
- README "Unsuppressed shots give your position away" is false offline and for whoever hosts (clients' shots are heard).
- Fix: call `botsHearShot(NET.myId, o, supp)` from `fireWeapon` (host only), or in `hostReceive` 'shot' for every sender.

### 2. MAJOR OPEN — Bots can't hit a strafing player (bots.js)
- Setup: hard bot with an AWM 100 m away, clear LOS, nest facing the player; player walks A/D, switching every 3 s or 1.5 s.
  - First build: 3 shots, 0 hits per 25 s; lateral misses at the player's plane -0.51, 0.87, -0.82, 0.50, 0.95 m.
    Same bot vs a still player: 12 shots, 11 hits.
  - Final build (feed-forward `wRate` + `onTarget` 15 cm gate added): strafing 3 s -> 2 shots / 0 hits, 1.5 s -> 2 shots / 0 hits;
    still player 12 / 12. So now bots mostly hold fire against a strafer.
- Likely: the target velocity `tVel` is low-passed (`1-exp(-dt*3)`, tau 0.33 s) and the yaw lerp still lags, so the lead is
  wrong right after every direction change and the 15 cm gate rarely opens. Consider leading with the raw velocity over the last
  ~0.2 s and letting "normal/hard" fire when within ~0.3 m.

### 3. MAJOR OPEN — Bots aim at empty air for a prone player's head (bots.js `bodyAim`)
- `bodyAim` puts a prone head 0.75 m in front of the body origin (body 0.25 m); `operatorHitboxes` and the model
  (`op.head` world pos: +0.29 m forward, 0.29 m up) put it at +0.30 m. Side-on, the aim point is 0.45 m off the head.
- Repro: hard AWM bot at 50 m, player prone and side-on (yaw 90 deg to the bot), force `b.aimHead=true` each frame:
  9/9 and (final build) 10/10 shots miss in 20 s. `aimHead=false`: 5/10 hit. Facing the bot, head-aim hits 9/9 (offset along the line of fire).
- Crouched: model head is 0.15 m forward of the hitbox head sphere (r 0.14) — borderline, align too (character.js).
- `botEye` still uses the old fixed 0.35 m prone offset (no wall check like the player's new one) — a prone bot against a wall
  can probably see/shoot through it. Not tested directly.

### 4. MAJOR FIXED — Prone against a wall: camera inside the wall (player.js)
- Was: `QA.go(6,-42,0)` (outside the hall's north wall, z -44.32..-44), prone, hold W: camera at z -44.05 (inside the wall);
  screenshot showed the hall interior; `rayWorld` from there returned null and one AWM round hit a bot standing inside (100/50 -> 65/0).
- Final build: camera stops at z -43.80 (ray-clamped head offset). Fixed.

### 5. MAJOR FIXED — Prone up a steep slope: camera under the terrain (player.js)
- Was: (-108,-46), 47 deg slope, prone facing uphill: camera 0.36 m below `groundY`; screenshot showed the underside of the world.
- Final build: camera 0.38 m above the ground there. Fixed by the same clamp.

### 6. MAJOR FIXED — Hall north door too low (map.js)
- Was: building x -14..14 z -58..-44, arched door x 0.55..2.95, lintel collider bottom 3.01 = 1.80 m above the floor slab
  (1.79 above the ground outside). `QA.go(1.75,-41,0)` + W stopped dead at z -43.70; crouched it passed. NAV (blocks only below
  ground+1.75) routed bots through it. Cause: arched doors' collider top `dh - w*0.25`.
- Final build: walks straight through to z -46.8. (The arch rule is still `dh - w*0.25`, so wide arched doors elsewhere may
  still lose 0.5 m+ of the visible arch to the rectangular lintel collider — see 10.)

### 7. MAJOR FIXED — Out-of-ammo bots stuck under rooftop ammo cans (bots.js, pickups.js)
- Was: 8/18 ammo spots 3.3–10.3 m up; a bot with 0 ammo walked under the hall-roof can (10 m up) and stood there 30 s+
  (arrive -> pick nest -> shopping picks the same can, every frame).
- Final build: `nearestPickup` skips cans with `p.f > 0`; the bot went for a ground can and got reserve 15–21. Fixed.

### 8. MINOR OPEN — Bot knife hit applied from `setTimeout(…,170)` (bots.js)
- It works in normal play (bot charged from 7 m and killed the player, `knife:999`). But a hidden host tab throttles timers to
  >= 1 s, so stabs land late, and the timing ignores the game clock. Apply it from `meleeT` inside botsTick.

### 9. MINOR OPEN — Player walks up ~69 deg terrain (player.js)
- `bodyMoveAxis` allows STEP (0.48 m) per 0.2 m substep (any slope under ~67 deg). Walked from (-124,-43) y 5.07 to the water-tower
  pad at y 10.37 in 4 m horizontal. Bots can't (nav blocks > 31 deg), so players can reach spots bots never will.

### 10. MINOR (not re-checked) — Colliders vs visible openings (map.js)
- Building x 46..58 z -19.6..-7.6, 3rd floor, looking out of the ragged hole in the east wall from (52, 9, -13.6) heading 240 deg:
  collider strip `57.68,0.32,-10.45,58,8.72,-10.24` stands in the left part of the visible hole (screenshot with a debug box).
- Hall arch (old build): bullets blocked in the top ~0.5 m of the visible arch by the rectangular lintel.
- Some gable-roof step colliders poke ~0.4 m above the visible roof (e.g. `-8.3,9.42,29.75,1.3,9.63,30.5`); stairs are solid
  blocks under open treads (shooting under a staircase hits nothing visible).

### 11. MINOR OPEN — Damage text vs numbers
- SVD chest 62: 100/50 -> 88/0 -> 26/0 -> dead (3 chest shots vs full armour). README: "Body shots take two (or a plate-less one
  from the Barrett and a follow-up)" — the Barrett (95) also needs two even without plates. Either tweak the README or the numbers.
- Design note: plates also soak leg hits; one 60-dmg leg hit removes both plates.

### 12. POLISH OPEN — Geometry leak (net.js 'bye', ui.js `refreshLoadout`)
- 4 cycles of `addBots(8)` / `removeBots('all')`: `RENDERER.info.memory.geometries` 902 -> 993 -> 1087 -> 1191 -> 1285.
  'bye' only `SCENE.remove(r.op.root)`; loadout preview drops the old gun model without disposing. Bot gun swaps don't leak.

### 13–17. POLISH
- 13: prone bot body+gun spans x 43.35..46.57 around an origin at 44.8 (–1.45/+1.77 m) on a 0.3 m collision cylinder.
- 14: at 358 px wide the bottom-left "K 10 · D 3" sits on top of "Schmidt & Bender PM II 5-25x · BOLT", and the scope's
  "8.0x RNG 59 m" line sits on the hearts row. Probably fine on desktop, but worth a min-width rule.
- 15: `CAMERA.fov = SETTINGS.fov` is vertical; `scopeFov` uses a 55 deg base, so the LPVO at 1x is 1.45x zoom vs hip.
- 16: `hudTick` name tag uses `projTrace` (bullets pass foliage), so aiming at a bush within 40 m names the player hiding in it.
- 17: hall interior and the far side of most rooms are nearly black even at the doorway; ghillie "urban" bot backlit at 3 m is a black silhouette.

---------------------------------------------------------------------------------------------------------------------------

## Things that work (with evidence)

- **Stairs**: walked every flight of all 21 `MAP.stairs` with a scripted route (lane A, landing, lane B): every floor reached at
  y0+FH*k, including the water tower (13.82 / 17.32). Max per-frame rise 0.19 m, camera smooth, never airborne going down.
- **Buildings**: all 51 entered standing by following `navPath` from 6 m outside to the centre. No building with terrain poking through the floor.
- **Ballistics match the reticle**: level shots from 40 m up, no sway: AWM drop at 50/100/200/300/400 m = +0.025/+0.002/-0.186/-0.562/-1.128 m
  vs `dropAngle` marks +0.024/0/-0.189/-0.568/-1.135. M82, SVD, M200 within 1 cm. Deagle zeroed at 25 m. Rounds die at |x|,|z| > 360.
- **Damage model** (real projectiles at 80 m on a held bot): AWM head kills; AWM chest x2 (65/0, dead); legs 90/0, 30/0; M82 chest 55/0 then dead;
  M200 legs+chest dead; Deagle chest 100/5, 60/0, 15/0, head dead; Deagle head on fresh target 55/0. Knife kills through plates at 1.5 m,
  quick knife (V) at 2.1 m kills and returns to the rifle, misses at 2.6 m, kills prone targets. Player: 30 -> armour 20; 40 -> hp 80;
  33 -> hp 47; regen starts after 6 s, stops at 50. Death screen + 4 s respawn work.
- **Bot accuracy vs a still, standing player** (time to lethal hit, s, 5 trials, AWM, nest facing the player):
  easy 50 m 6.2–9.6, 100 m 7.8–11.7, 200 m mostly >20; normal 50 m 2.0–5.8, 100 m 5.0–8.3, 200 m mostly >20;
  hard 50 m 1.2–3.3, 100 m 3.2–5.6, 200 m 2.5–19.3. Prone at 100 m (normal) 4.3–16.9 s; prone at 200 m never spotted. Sensible curve.
- **Bot sim** (8 bots, 10 min game time): 26 kills / 250 shots, ~50% moving between nests, ~45% watching; no bot stuck in a building;
  a prone player 215 m away in a corner was found and engaged. Bots charge with the knife inside 9 m and kill.
- **Nav**: final build 1280/1280 spawn->nest paths; all spawns, nests, ammo and plate spots in one connected region.
- **Pickups**: can bobs and spins 0.54 m above its spot; walking over it with 3/0 reserve -> 20/35; back after exactly 30 s; not taken
  when full. Plate gives +25 and disappears. Final build: no floating spots, one plate per spot.
- **Scope**: wheel 5x -> 25x (PM II) in x1.25 steps, back x0.8; FOV 11.9 -> 2.39 deg; bolt drops you out for 1.15 s and rescopes ~0.35 s
  later while RMB is held, zoom kept; wheel unscoped swaps weapons; rangefinder reads.
- **Menus/commands**: `/addbot 3`, `/removebot`, `/botdiff insane` (rejected with a hint), `/addbot 20` (clamped to 10), `/removebot all`,
  `/help`; scoreboard (Tab); settings panel opens/closes; loadout turntable renders; all 72 gun/optic/muzzle/underbarrel combos build.
- **Perf (CPU only, GPU not measurable in a background tab)**: game tick 0.06 ms with no bots, 0.2 ms with 8; render submit ~1.1 ms.

## Not tested
- Real multiplayer (host + client), audio, GPU frame time, pointer-lock input, fullscreen/keyboard lock.
