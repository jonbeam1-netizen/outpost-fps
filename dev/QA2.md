# HOLDOVER QA round 2

Tester: QA agent (round 2), 2026-10-24. Offline practice in my own tab of the built-in browser, fresh scripts.
The game was stepped by hand: `performance.now()` replaced by a virtual clock, `requestAnimationFrame` disabled, and
`playerTick/botsTick/remotesTick/pickupsTick/fxTick` (+`hudTick` in the soak) called with a fixed dt (1/60 unless stated).
For the balance trials, damage from bots to the player is intercepted in `hostDeliverHit` (recorded, not applied) so each trial
runs its full length. "Lethal" = time of the hit that would have killed a 100 hp / 50 armour player (a head hit, or 150 cumulative).
Screenshots at 358x420 (pane limit), drawing buffer 716x840. No game files edited.

---------------------------------------------------------------------------------------------------------------------------

## Prioritized findings

| # | Sev | File | Finding |
|---|---|---|---|
| A | **major** | bots.js | Bots now near-aimbots: aim noise is frame-rate dependent and far too small; bots also lead with the target's exact live velocity |
| B | **major** | character.js `operatorHitboxes` | Crouched: the visible head is outside every hitbox (shots at a crouched head miss); crouched knees/shins too |
| C | major | bots.js `canSee` | Hiding inside a bush doesn't work: the last 0.5 m of the ray is skipped, so a player in a <2.4 m bush is never screened |
| D | major | bots.js `botThink` | Bots see 360 deg: sneaking up from behind is detected at 21 m walking, 17 m crouched, 9 m prone-crawling — knife flanks are impossible |
| E | minor | fx.js | Blood at 100 m is almost invisible through the scope; your own tracer, seen end-on, blooms over the target at impact and hides it |
| F | minor | player.js `bodyMoveAxis` | Slope limit is per axis: diagonal walking climbs 59–62 deg terrain (R1 #9 still open) |
| G | minor | bots.js / player.js spawns | 14% of bot deaths happen < 10 s after spawning (killed at ~100 m); spawn protection is 1.5 s and spawns ignore enemy line of sight |
| H | minor | bots.js `botsHearShot` | Any unsuppressed shot alerts every bot within 380 m (the whole map); each turns 180 deg in 0.7 s and fires within ~3 s |
| I | polish | character.js `_skinGun` | Geometry leak: +1 `BufferGeometry` per character gun swap (bots swap rifle <-> knife a lot): +40 over 11 min with 8 bots |
| J | polish | character.js / fx.js | Prone body doesn't follow slope (legs sink into rising ground); blood pool spawns ~1 m from where the corpse falls |
| K | polish | ui.js | Kill feed has no line cap (many quick messages fill the whole right side) |
| L | polish | ui.js / character.js | Existing users keep FOV 80 from localStorage (default change to 70 only affects new users); LOD comment/scale still "relative to an 80 deg fov" |

Details, repro and fixes for each are below.

---------------------------------------------------------------------------------------------------------------------------

## Round-1 OPEN items, re-checked

| R1 # | Issue | Now | Evidence |
|---|---|---|---|
| 1 | Bots never hear the host's shots | **FIXED** | `fireWeapon` -> `botsHearShot` (player.js:254). Unsuppressed AWM shot behind a bot at 50/100/200 m: alertPos set 9/9 times (error 1–10 m), bot turns 180 deg in 0.6–0.7 s. Suppressed: heard at 30 m, not at 50 m+ (45 m radius, as designed). |
| 2 | Bots can't hit a strafer | **FIXED — now overshoots** | normal 100 m strafing: 69% of shots hit; easy 50 m strafing 90%. See A. |
| 3 | Prone head aim point | **FIXED** | `bodyAim` prone head (0.30 fwd, 0.38 up) = hitbox = model head (0.28 fwd, 0.40 up). `botEye` now ray-clamps the prone head (bots.js:175). |
| 8 | Knife on setTimeout | **FIXED** | `b.stabT` counted down in botsTick (bots.js:272); 2 knife kills in the soak. |
| 9 | Player walks up ~69 deg terrain | **OPEN** (better) | Walked up a 59 deg slope at (156.9,149.8) — climbed 7.1 m — and 62 deg at (-128.1,-40.8). Same at 30/60/144/240 fps. See F. |
| 10 | Arch / hole colliders | probably FIXED | `opBands` now cuts arches and holes as outline-following bands. Not re-measured in-game. |
| 11 | SVD vs README | **FIXED** | README: "three from the SVD against full plates". |
| 12 | Geometry leak on bot removal | **FIXED** | 4x addBots(8)/removeBots('all'): 211 -> 212 -> 214 -> 215 -> 216 (was +90 per cycle). A different, smaller leak remains (I). |
| 13 | Prone body is a 0.3 m cylinder | OPEN (unchanged) | `bodyPhysics(..., plHeight(), R_PLAYER)` for prone; model spans ~1.6 m. |
| 14 | Narrow-window HUD overlaps | not re-tested | UI-polish agent was editing ui/style during this run. |
| 15 | FOV vertical / default 80 | **FIXED for new users** | Default 70, but stored settings keep 80 (my tab came up at 80). LPVO 1x (55 deg) is still 1.27x zoom vs 70 hip. See L. |
| 16 | Name tag through foliage | **FIXED** | `hudTick` drops the tag when `rayFoliage(...) >= 0.8`. |
| 17 | Interiors / characters near black | **mostly FIXED** | From the hall's north arch (1.75,-40) a bot 11 m inside is clearly readable; characters are dimmed by `occAt` to match. |

---------------------------------------------------------------------------------------------------------------------------

## A. MAJOR — Bot balance (bots.js)

### Current build (dt 1/60, AWM bot placed in the open facing the player, 5 x 30 s trials per cell)

Player standing; "strafe" = A/D, reversing every 0.6–1.8 s at walk speed (avg 3.1 m/s), staying inside a 10 m lane.

| diff | dist | still: hit% | still: lethal (s) | strafe: hit% | strafe: lethal (s) |
|---|---|---|---|---|---|
| easy | 50 | 97% | 3.2–6.8 | 90% | 5.2–8.7 |
| easy | 100 | 68% | 5.8–9.4 | 57% | 5.5–18 |
| easy | 200 | 19% | 9.5–26 (4/5) | 18% | 8–27 (3/5) |
| normal | 50 | 97% | 2.1–4.4 | 93% | 3.7–5.7 |
| normal | 100 | 82% | 5.5–6.7 | 69% | 3.9–8.5 |
| normal | 200 | 44% | 3.2–21 | 27% | 8–19 (4/5) |
| hard | 50 | 100% | 2.9–3.6 | 91% | 1.5–3.2 |
| hard | 100 | 96% | 1.8–3.5 | 80% | 1.3–7.2 |
| hard | 200 | 72% | 2.0–7.1 | 34% | 4–28 |

First shot: easy ~3.3 s, normal ~2.3 s, hard ~1.4 s after first sight; then one round every ~2 s (bolt cycle + `fireCD`).
Even **easy** kills a moving player at 50 m in ~6 s and hits 9 of 10 shots. Strafing barely matters. That is aimbot territory.

**Cause 1 — the aim noise is tiny and frame-rate dependent** (bots.js:313–315):
`aimErr = aimErr*k + rand(-1,1)*floor*(1-k)*6`, k = exp(-dt*settle). The stationary spread of that process is
`sd = floor*sqrt(12(1-k)/(1+k))` ~ `floor*sqrt(6*dt*settle)`: at 60 fps about 0.2–0.4 x `floor` (measured: normal at 100 m sd 0.095 deg
= 17 cm while `floor*(1+hd/250)` = 0.224 deg). It shrinks with frame rate — same bot, normal, 200 m, still player:
**30 fps 29% hits, 60 fps 45%, 144 fps 61%**. High-refresh hosts get harder bots.

**Cause 2 — exact lead**: `if (t.vel) b.tVel.set(t.vel.x, 0, t.vel.z)` — the live velocity of the player, with no reaction delay,
plus the feed-forward `wRate`. Only a direction change during the ~0.14 s flight saves you.

### Proposed fix (prototyped in-page by patching `botsTick` source; numbers below are from the patched code)

1. Replace the per-frame noise with a smooth, frame-rate-independent wander. In botsTick, instead of the two `b.aimErr.x = ...` lines:
   ```js
   b.aimErr.multiplyScalar(k);   // first-sight error + recoil still settle at diff.settle
   if (!b.wd) { b.wd = new THREE.Vector2(); b.wg = new THREE.Vector2(); b.wT = 0; }
   const g = () => (Math.random() + Math.random() + Math.random() - 1.5) * 2;   // ~N(0,1)
   if ((b.wT -= dt) <= 0) { b.wT = rand(0.5, 1.1); b.wg.set(g() * floor, g() * floor * 0.7); }
   b.wd.lerp(b.wg, 1 - Math.exp(-dt * 2.5));
   ```
   and add `+ b.wd.x` / `+ b.wd.y` to `wantYaw` / `wantPitch` (guard `b.wd` undefined on the first frame).
   (A plain OU process with `sqrt(1-k*k)` scaling is frame-rate independent too, but its per-frame jitter makes `wantYaw` jump
   10+ cm a frame at 200 m and the 15 cm `onTarget` gate rarely opens — hit rates collapsed to 4% at 200 m. Smooth wander avoids that.)
2. Lead with a reaction-lagged velocity: `if (t.vel) b.tVel.lerp(_bo.set(t.vel.x, 0, t.vel.z), 1 - Math.exp(-dt / diff.lag));`
3. New numbers: `easy: floor 0.25 (or 0.22), lag 0.5` · `normal: floor 0.15, lag 0.3` · `hard: floor 0.09, lag 0.18` (other fields unchanged).

Result with the patch (6 x 30 s per cell):

| diff | dist | still: hit% | still: lethal median | strafe: hit% | strafe: lethal median |
|---|---|---|---|---|---|
| easy | 50 | 73% | 8.0 s | 45% | 7.2 s |
| easy | 100 | 28% | 21.5 s | 18% | 18.7 s |
| easy | 200 | 6% | none in 30 s | 9% | (1/6 killed) |
| normal | 50 | 88% | 4.7 s | 55% | 6.3 s |
| normal | 100 | 49% | 8.5 s | 19% | 18.3 s |
| normal | 200 | 21% | 27.6 s | 8% | (1/6 killed) |
| hard | 50 | 94% | 3.6 s | 59% | 6.8 s |
| hard | 100 | 73% | 5.0 s | 34% | 9.1 s |
| hard | 200 | 34% | 7.6 s | 12% | 24.8 s (3/6) |

Frame-rate check (normal 100 m still, patched): 30 fps 53%, 60 fps 45%, 144 fps 38% — within trial noise (5 trials).
This keeps bots dangerous to someone standing in the open at 50–100 m, makes moving and range matter, and leaves hard as a real threat.
If easy feels useless at 100 m, use floor 0.22.

### Stealth / reaction (current build, normal unless noted)

| Situation | Result |
|---|---|
| Prone in the open, 100 m, still | spotted ~1 s (hard 0.8 s), then hit 53/75 shots (normal), lethal 2.7–9.9 s |
| Prone in the open, 200 m | never spotted in 40 s (normal and hard) |
| Prone in tall grass, 50 m and 100 m | never spotted in 40 s (normal and hard) — good |
| Crouched in tall grass, 50 m | spotted 0.8 s, hit 78/78 (head above the 1.15 m grass — fair) |
| Prone **inside a bush**, 100 m | never spotted |
| Prone **inside a bush**, 50 m | **spotted 1.1–1.3 s, hit 75/76** — see C |
| Standing in a bush, 100 m | spotted 1 s, hit 65/77 |
| Unsuppressed shot behind a bot (it faces away), 50/100/200 m, standing | turns in 0.7 s, spots 0.8–1.5 s, first shot 2.4–3.6 s, lethal ~5 s |
| Same, prone | 50/100 m spotted 0.9–1.5 s and killed; 200 m: alerted but never spotted |
| Suppressed shot, 30 m | heard (spot 0.3), spotted 1.0–1.3 s, lethal 3–5 s |
| Suppressed shot, 50/100/200 m | not heard (45 m radius) |
| Leg hit from behind, no sound, 100 m | bot knows the exact attacker position, turns 40% at once, relocates; standing shooter spotted 0.2–3.8 s |

---------------------------------------------------------------------------------------------------------------------------

## B. MAJOR — Crouched hitboxes don't match the new model (character.js:722 `operatorHitboxes`)

Model part positions (bones after `animateOperator`, yaw 0 so forward = -z) vs hitboxes, relative to the body origin:

| stance | model head | hitbox head | model knee/shin | hitbox legs |
|---|---|---|---|---|
| stand | (0, 1.69, -0.05) | (0, 1.62, 0) r 0.14 — OK (0.09 off) | thigh (-0.11, 0.69, -0.10) | capsule x0 z0 y 0.28–0.72 r 0.20 — OK |
| **crouch** | **(0, 1.36, -0.18)** | **(0, 1.18, 0) r 0.14 — 0.25 m off, outside the sphere** | thigh (-0.11, 0.49, -0.21), shin (-0.14, 0.24, -0.25) | capsule y 0.28–0.40 r 0.20 at z 0 — knees/shins outside |
| prone | (0, 0.40, -0.28) | (0, 0.38, -0.30) — OK | shin (-0.17, 0.05, 1.01) | spheres on the centre line x 0, r 0.15 — shins 0.17 to the side |

Projectile test — real AWM rounds from 40 m fired at each visible part (bone position), from the front, side, back, 45 deg:
- stand: head/chest/belly/thigh/shin all hit the right zone from every side.
- **crouch: head -> MISS from all four directions**; side: thigh and shin -> miss.
- prone side/45 deg: head, chest, thigh hit right; shin -> miss (legs splay sideways). From behind, aiming at the head hits chest (body in the way — fine).
- Screenshot with the hitboxes drawn as wireframes: the crouched red head sphere sits on the upper back while the hooded head is
  ~0.2 m higher and forward.

Repro: `addBots(1)`, hold the bot crouched (`b.stance=1`, feed `botSend` + `remotesTick`), read `REMOTES.get(id).op.head` world position,
fire `spawnProjectile(from, v, 'me', 'awm', 'me')` at it.
Fix: crouch head `hy = 1.36` and offset it forward by ~0.16 m along the facing (`fx,fz` as in the prone branch); move the crouched chest
capsule forward ~0.06 and top it at ~1.22; give crouched legs a forward-offset capsule or two spheres (knee at fwd 0.2, y 0.45; shin at fwd 0.22, y 0.25).
Prone: add a sideways offset per leg (two rows of spheres at x +-0.13) or widen the lower leg spheres to r 0.2. Also update `bodyAim`
crouch head (1.18 -> 1.36 + forward) so bots aim at the new head.

---------------------------------------------------------------------------------------------------------------------------

## C. MAJOR — A player inside a bush is not screened (bots.js:183 `canSee`)

`rayFoliage(from, _bd, dist - 0.5) > 1.2` skips the last 0.5 m before the target, and the target point is inside the bush. A prone
player in the middle of a 1.95 m bush (collider 147.22..149.17 x 71.02..72.97) gets 0.71 m of counted leaves: below 1.2, so visible.
Their `visibility()` is 0.32 x 0.35 = 0.11, so a scoped bot facing them sees to 240 x 0.11 x 2.6 = 70 m. Result: prone in a bush at 50 m,
spotted in 1.2 s and shot dead every trial. Bushes only work when the player is *behind* them.
Repro: player prone at (148.2, -1.85, 72.0), bot at (107.7, 101.4) facing it.
Fix: count the full ray (`dist`), and lower the threshold to ~0.6 m, or treat `inFoliage(target)` + prone/crouched as screened beyond ~15 m.

## D. MAJOR — Bots see behind them (bots.js:207)

The "behind" look factor 0.08 still gives 240 x visibility x 0.08: walking 27 m, crouch-walk 17 m, prone-crawl 9 m. Measured (bot in a nest
facing away, player walks straight at its back, knife out): detected at 20.5–21 m walking, 17–17.5 m crouched, 9.2–9.4 m prone, 19–20 m sprinting.
Once detected inside 9 m the bot switches to its own knife and charges. A sneaky flank for a knife kill can never work, and the rear
detection ignores how loud you are.
Fix: drop the behind factor to ~0.02 (5 m), and model footsteps as hearing instead: walking ~12 m, crouched ~6 m, prone ~3 m, sprinting ~25 m
(set `alertPos`/a small `spot` bump like `botsHearShot`, so the bot turns rather than instantly seeing you).

## E. MINOR — Blood hard to see; own tracer hides the hit (fx.js)

- Shot a bot in the chest at 100 m, viewed through the scope 50–100 ms after impact: at 15x only a small orange speck; at 25x a faint pink
  haze at the chest and a few dots on the ground. Blood colours are dark (linear R 0.10–0.35), the exit spray is behind the body, and
  the target is back-lit at dusk — it reads as nothing. Hitmarker is the only confirmation.
- Worse: your own round's trail, seen end-on from the shooter, draws a big warm glow (~70 px radius at 15x) right on the target for the
  trail's life (1.3 s). With the trail meshes hidden the target is clean, so it's the trail (`b.tr.mesh`), not the head sprite.
- Fix: for the shooter's own rounds, fade the trail with view angle (`1 - |dot(trailDir, viewDir)|`) or skip it within ~0.2 s of impact;
  add a brighter, short-lived "mist" sprite at the entry point with a minimum angular size (like `fxGlint`), colour ~ (0.55, 0.06, 0.05).
- Tracers seen from the side are clearly visible (long bright streak, unsuppressed fades over 1.3 s). Incoming rounds read as a bright
  point with a trail pointing back at the shooter — good.
- Glint: at hip FOV 70 on a bot scoped at you from 100 m, a ~13 px saturated blob (716x840 buffer); through an 8x scope, a large flare
  with a halo ~2 m across on the ground. It is sized by distance, so it reads the same at 300 m. Fine as a mechanic; the 8x halo may be
  a bit much, but it's the main way to find a prone bot.

## F. MINOR — Slope limit per axis (player.js:43)

`bodyMoveAxis` checks the terrain rise per axis move. Walking diagonally up a slope, each axis sees only cos 45 of the gradient, so a
59 deg slope passes as ~49 deg. Also the `max(0.06, |amt|*1.2) + 0.02` floor allows ~57 deg at 60 fps for straight moves.
Repro: start 3 m downhill of (156.9, 149.8), face uphill, hold W 5 s: +7.1 m. Fix: after both axes of a substep, compare the terrain
rise against the combined horizontal displacement (or reject when `terrainNormal(x,z)[1] < cos(50 deg)` and the move goes uphill).

## G. MINOR — Spawn deaths (bots.js `botRespawn`, player.js `pickSpawn`)

Soak (8 bots, normal): 5 of 35 bot deaths were 4.0–9.6 s after spawning, killed from 94–142 m. Spawns are chosen by distance only
(top 5 farthest + 15 m random), not by who can see them, and spawn protection is 1.5 s. The same applies to the player.
Fix: skip spawns with a clear `canSee` from any living enemy's eye within ~250 m, and/or give bots an extra ~2 s `react` on a target
that spawned < 3 s ago.

## H. MINOR — Hearing range (bots.js:231)

Unsuppressed shots are heard to 380 m — every bot on the map. With spot 0.6 the bot is a fraction of a second from engaging, and it turns
180 deg in 0.7 s. Design call, but for "fun-fair": scale with difficulty (easy 150 m, normal 250 m, hard 380 m), add a 0.3–0.8 s delay
before the turn, and turn at the watch rate (3/s, already used) rather than snapping.

## I. POLISH — Gun-swap geometry leak (character.js `_skinGun` / `setOperatorGun`)

The per-operator "view" geometry is added to `SHARED_GEO`, so `setOperatorGun` never disposes it. Measured: 20 swaps rifle <-> knife on
one remote = +20 geometries. Soak with 8 bots: 266 -> 305 over 11 min (bots draw the knife inside 9 m). It can't simply be disposed
(three.js deletes a geometry's attribute buffers on dispose, and these are shared). Simplest fix: cache one view per (operator, gun key)
on the operator and reuse it when the bot swaps back, so each operator holds at most one view per gun it has carried.

## J. POLISH — Prone on slopes, blood pool position

- The prone pose and hitboxes stay level: on an 8 deg rise the feet are 0.14 m lower than the ground behind (legs sink in). On steeper
  ground the head will float or clip. Pitch the prone root (and hitboxes) to the terrain slope along the body.
- Death: the body falls ~1 m back from its origin, but `fxBloodPool(r.state.pos)` is placed at the origin, so the pool sits beside the boots.

## K. POLISH — Kill feed has no cap (ui.js `hudFeedText`)
Twenty quick messages ("Added a bot" etc.) fill the whole right edge. Cap at ~6 entries (remove the oldest).

## L. POLISH — FOV 80 persists; LOD reference
`SETTINGS = Object.assign({ fov: 70, ... }, store.get('outpost-settings'))` — anyone who opened the settings before keeps 80. If 70 is the
intended default, migrate once (e.g. a settings version key). character.js:591 scales LOD "relative to an 80 deg fov".

---------------------------------------------------------------------------------------------------------------------------

## Character rewrite: what works

- **LOD while scoped**: bot at 40/80/170/200 m: hip FOV 70 gives LOD 0/1/1/2 (draw count 56406/34044/34044/22902); through a 5x or 25x
  scope it is LOD 0 at every distance. Switches instantly.
- **Death pose**: falls back and lies flat with the rifle across; no clipping into the ground on flat terrain.
- **Indoors**: readable through the hall door at 11 m; `occAt` dims the suit (colour 0.59).
- **Standing hitboxes** match the model; prone head/chest match (see B for crouch and prone shins).

## Soak: 8 bots, normal, 17 min game time (1020 s), player AFK at a spawn

- **Errors**: none (`_seenErr` empty, nothing in the console).
- **Kills**: 100 in 1020 s (≈ 5.9/min); weapons awm 38, svd 16, m82 12, knife 2 (first 68); 29/68 headshots. Kill distances p25 59 m,
  median 95 m, p75 127 m, max 222 m. Bot K/D spread 4–16 kills each — no bot dominates or idles.
- **Stuck bots**: none. One bot stood 62 s in 'move' state in the first pass, but that counter included engaging a target; with
  `!b.target` excluded, 0 bots stood still > 4 s in 'move' over 3 minutes.
- **Counts**: PROJ max 2, FX.list max 2, particles max 673 (cap not reached). All back to ~0 between fights.
- **Memory**: textures flat at 93; geometries 266 -> 305 (+3.5/min, see I); JS heap 124–175 MB, no trend.
- **CPU**: game tick p50 0.1 ms, p99 0.4 ms, 4 spikes 9–16 ms in 3 min (probably navPath A* on a repath; not profiled); render submit p50 0.7 ms, p99 7.3 ms
  (GPU time not measurable in this pane).
- The AFK player at spawn (95,-140) died 10 times in the first 12 minutes, then survived 400+ s in a corner.

## Not tested
Real multiplayer, audio by ear, GPU frame time, narrow-window HUD (UI agent was editing), blast-hole colliders (R1 #10) in-game.
