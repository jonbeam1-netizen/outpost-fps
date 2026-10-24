# HOLDOVER QA round 3

Tester: QA agent (round 3), 2026-10-24. Own tab in the built-in browser (358x846 pane), fresh scripts (reloaded once more mid-run
to pick up killcam.js and the newer map.js), started via the PRACTICE button. Game stepped by hand: virtual `performance.now`,
rAF disabled, `frame(t)` or the tick functions called with a fixed dt (1/60 unless stated). No game files edited.
Balance trials: bot damage to the player is intercepted in `hostDeliverHit` (recorded, not applied), so each trial runs its full
length. "Lethal" = first head hit, or 150 cumulative (100 hp + 50 plates).

---------------------------------------------------------------------------------------------------------------------------

## Prioritized findings

| # | Sev | File | Finding |
|---|---|---|---|
| 1 | **major** | bots.js:427 | Bots react to only 1 in 8 bird flushes: they read the last array slot of a ring buffer |
| 2 | **major** | bots.js `canSee` / `visibility` | Prone in a bush makes you invisible at any range, **even while firing unsuppressed** — bots never shoot back |
| 3 | **major** | ui.js:363 | Laser rangefinder ignores people: on a target it ranges the wall/hill behind, so HOLD is wrong |
| 4 | minor | wildlife.js / bots.js | 96% of flushes are caused by bots (13 per minute with 8 bots), so a flush tells you nothing |
| 5 | minor | bots.js | At 50 m strafing barely helps (normal 68% hits, killed 4/5 in ~4.4 s); range does most of the balancing |
| 6 | minor | player.js:62 | Slope limit (F) still open: 63–69° slopes climbable at 60/144 fps, nothing at 30 fps |
| 7 | minor | README / wildlife.js | A normal walk flushes birds within 12 m; README says only sprint/jump/shots do |
| 8 | minor | ui.js:152 | Loadout only applies on the next respawn, even right after starting practice |
| 9 | polish | ui.js:235 | Leaving with a round in flight leaves a frozen tracer streak hanging in the sky (menu + next match) |
| 10 | polish | pickups.js:50–54 | Plate pickups leak 3 geometries each (~3/min): new BoxGeometry per plate, removed without dispose |
| 11 | polish | ui.js | K (kill feed cap) and L (FOV 80 migration) from QA2 still open |
| 12 | polish | bots.js:371 | `bodyAim` ignores `proneTilt`: on slopes bots aim up to 0.17 m off a prone head |
| 13 | polish | guns.js:12 | M82 description says rounds "go through cover"; there is no penetration |
| 14 | polish | post.js / player.js | Chromatic aberration fringes in the corners; LPVO at "1x" is still a 1.46x zoom inside a heavy scope vignette at FOV 80 |
| 15 | polish | ui.js / killcam | The pause menu can sit on top of the kill cam (when the pointer is unlocked during death) |
| 16 | polish | net.js | Two players with the default name are both "Operator" (no suffix) |

Details below.

---------------------------------------------------------------------------------------------------------------------------

## 1. MAJOR — bots ignore 7 of 8 flushes (bots.js:427)

```js
const e = WL.log[WL.log.length - 1];          // bots.js:427 — always slot 7
function wlLog(x, y, z) { const L = WL.log[WL.logI++ % WL.log.length]; ... }   // wildlife.js:298 — 8-slot ring
```
Repro: bot in watch 60 m from a perched flock, `wlFlush(fi)`: no `alertPos` within 2 s. Set `WL.logI` so the flush lands in
slot 7: alert after 0.08 s. In the soak, bots only reacted because some flushes happen to land in slot 7.
Fix: `const e = WL.log[(WL.logI + WL.log.length - 1) % WL.log.length]`, or better loop over all entries with `t > b.wlSeen`
and pick the nearest within 150 m (several flocks often go up in the same second).
Caveat: once fixed, bots will react to ~13 flushes a minute that they caused themselves (see 4) — fix 4 together with this.

## 2. MAJOR — prone in a bush = permanent invisibility, even while shooting

QA2's bush fix works — and now goes too far. Player prone in the middle of a 1.7–3 m bush, bot in the open looking straight at it:

| bot | 8 m | 15 m | 25 m | 50 m | 100 m | 200 m |
|---|---|---|---|---|---|---|
| normal | – | – | – | never seen (5/5) | never (5/5) | never (5/5) |
| hard | never (3/3) | never (3/3) | never (3/3) | never (5/5) | – | – |

Then from the bush at 50 m: an unsuppressed shot every 3 s (`botsHearShot`) plus one 60 dmg leg hit on the bot at t = 6 s. In 4/4
trials the bot turned to the sound and stayed scoped on the bush for 25 s but never spotted or fired. A human in a bush can farm bots.
`visibility()`'s comment says it covers "shooting", but nothing does.
Fix (any of):
- for ~2 s after an unsuppressed shot, bots that heard it within ~150 m treat foliage as see-through for that shooter
  (muzzle flash + dust); suppressed shots only inside ~30 m;
- a hit bot or one that hears 2+ shots from the same spot fires 1–2 rounds into `alertPos` (rounds already pass through foliage);
- foliage stops hiding you inside ~8–10 m (they'd see the ghillie move), or when you move.

## 3. MAJOR (for a sniper game) — rangefinder ranges past people (ui.js:363)

`rayWorld(CAMERA.position, d, 900, true)` has no body test, so with the crosshair on a bot at 100 m the readout said 142 m (the wall
behind) and HOLD ▼0.4 mil instead of 0.0. At 300 m with a hill at 500 m behind, the hold shown is for 500 m and the round goes metres
high. Fix: also test `remoteBodies()` hitboxes, as `projTrace` does, and take the nearer hit.

## 4. MINOR — the bird cue is mostly noise

15-min soak (8 normal bots, AFK player): 274 flushes in 1235 s = 13/min. Nearest body to the perch when it went up: a bot within 14 m
for 49, a bot farther (alarm spread / shots / passing rounds) for 144, the player 9. Bots walk at 2.7–3.2 m/s and sprint at 5.2+,
both above `WL_FLUSH_SPD` 2.5, so they flush every flock on their route. For the human, a flush almost never means "the player I'm
hunting is there".
Fix: bots slow to a crouch-walk (or path around) within ~14 m of a perched flock unless they're engaged/fleeing; or require
`> 4.5 m/s` (sprint) for bots. Keep the flush itself — a bot that sprints past a roof *should* give itself away.

## 5. MINOR — bot balance (A re-measured)

Current build, dt 1/60, AWM/M200-class bot (AWM forced) placed in the open facing the player, 5 x 30 s trials per cell. Strafe =
A/D reversing every 0.6–1.8 s inside a 10 m lane. Hit% = hits / rounds fired.

| diff | dist | still: hit% | killed | lethal med | strafe: hit% | killed | lethal med | spot | 1st shot |
|---|---|---|---|---|---|---|---|---|---|
| easy | 50 | 91% | 5/5 | 6.3 s | 36% | 2/5 | 6.0 s | 1.0 s | 4.0 s |
| easy | 100 | 49% | 5/5 | 9.0 s | 14% | 1/5 | 28 s | 1.1 s | 4.3 s |
| easy | 200 | 7% | 1/5 | 17 s | 0% | 0/5 | – | 1.3 s | 4.7 s |
| normal | 50 | 99% | 5/5 | 4.2 s | 68% | 4/5 | 4.4 s | 0.5 s | 2.2 s |
| normal | 100 | 61% | 5/5 | 8.3 s | 21% | 5/5 | 10.9 s | 0.6 s | 2.7 s |
| normal | 200 | 20% | 3/5 | 10.3 s | 10% | 2/5 | 27 s | 0.8 s | 3.7 s |
| hard | 50 | 100% | 5/5 | 1.6 s | 61% | 4/5 | 3.2 s | 0.3 s | 1.2 s |
| hard | 100 | 88% | 5/5 | 3.5 s | 45% | 4/5 | 8.3 s | 0.5 s | 1.4 s |
| hard | 200 | 39% | 5/5 | 9.1 s | 10% | 2/5 | 24 s | 0.6 s | 1.8 s |

Prone, open ground: normal 50 m spotted 0.8 s, 59/72 hits, killed 5/5 (4.4 s); normal 100 m spotted 1.0 s, 17/42, killed 3/5 (5.2 s);
normal 200 m never spotted; hard 100 m spotted 0.8 s, 30/44, 3/5; easy 100 m spotted 1.6 s, 18/37, 2/5.
Prone in a bush: never spotted (see 2).

Against the target feel: normal is dangerous at 50–100 m to a careless (standing, still) player — yes. Weak past 200 m — yes
(20% / 10%). Beatable by hiding — yes (too much, see 2). Beatable by moving — at 100 m yes (61% → 21%), **at 50 m no**
(99% → 68%, still dead in ~4.4 s): with 0.07 s flight the lead barely matters and `floor*(1 + hd/250)` is only ~16 cm at 50 m.
Most strafing deaths at 100 m come from the 20% head roll (one head hit = dead), not body hits.
Suggestion: add an angular-speed term to the wander, e.g. `floorE += k * |target angular velocity|` (k ≈ 0.25 s), so a fast lateral
mover at close range is genuinely harder; optionally make `aimHead` only when the target has been still > 1 s.

Stealth from behind (D, bot in a nest facing away, normal): walking heard at 11–12 m, seen ~5 m; sprinting heard 24 m, seen 12–14 m;
crouch-walk heard 5.6–5.9 m, seen 3.1–3.4 m (and knifed); prone crawl never heard, seen at 1.9–2.0 m — knife reach is 2.3 m, so a
crawl-stab works and crouch flanks don't. That reads fair.

## 6. MINOR — slope limit (QA2 F) still climbable (player.js:62)

Straight up the 63–68° slopes at (-122..-127, -37..-41): +3.4–5.3 m in 2–3 s at 60 and 144 fps, max path grade 67–69°; at 30 fps
blocked. 38–45° slopes climb normally at all rates. Cause: after a block `vel *= 0.3`; the next tiny substeps hit the absolute floor in
`max(0.05, hm * 1.2) + 0.02`, i.e. 0.07 m of rise allowed for a 0.02 m move. Fix: pure ratio, `g > b.pos.y + hm * 1.19 + 0.005`.

## 7. MINOR — walking flushes birds; README says otherwise

Six flocks, player 6 m away horizontally on the street (6.6–9 m below): crouch-walk never flushed, a plain walk flushed 6/6 in 0.1 s.
`WL_FLUSH_SPD = 2.5`, walk with a rifle is 3.3–3.7 m/s. README: "Sprint, jump or fire an unsuppressed shot near them". Either README
→ "Walk, sprint, jump or shoot near them… crouch-walk or crawl past", or raise the threshold to ~4.5 (sprint only).

## 8. MINOR — loadout only on respawn

"DONE — APPLIES ON NEXT RESPAWN". Start practice, open LOADOUT, pick the M82: you keep the AWM until you die. For a first-time player in
practice that reads as broken. Suggest applying immediately when not hurt and < ~10 s after spawning (or always in practice).
All 4 rifles × every optic were applied via respawn and scoped: correct gun/optic each time, zoom ranges match `OPTICS` (5–25, 4.5–14,
7–35, 1–6, PSO 4 fixed), scope-in 18–26 frames, no errors.

## 9. POLISH — frozen tracer after leaving (ui.js:235)

`leaveToMenu` does `PROJ.length = 0` without calling `pr.fx.end()`, so any round in flight keeps its bullet head + streak visible
(slot `active`) until 32 newer rounds steal the slot. I hit the same thing in my harness: a bright streak frozen in the sky across
many frames. Fix: `PROJ.forEach(p => p.fx && p.fx.end()); PROJ.length = 0;`.

## 10. POLISH — plate geometry leak (pickups.js:50, 54, 84, 95, 138)

Soak: geometries 309 → 424 over 20 min, a steady +3/min after warm-up; scene geometry count flat (223 both times). Each plate builds
3 new BoxGeometries and is removed with `SCENE.remove` only. Build the plate geometry once and share it, or dispose on removal.
(Respawning the player does not leak: 433 → 430 → 430. Gun swaps don't leak either, see I.)

## 11–16. Polish

- **K** kill feed: no cap (ui.js:194, 288, 291). **L**: stored `fov: 80` still wins over the new default 70 (ui.js:4).
- **12** `bodyAim` prone: on a 13° slope the head sits at 0.21 m (facing downhill) / 0.35 m (uphill) while bots aim at 0.38 m; use
  `proneTilt` like `operatorHitboxes` does.
- **13** M82 "go through cover": no penetration anywhere. Change the text, or let .50 pass wood/glass.
- **14** post.js `ca: 0.002` gives visible red/blue fringes on trees in the top corners at hip. The LPVO at 1x is FOV 55° (fixed 27.5°
  half-angle) vs hip 80° → 1.46x, inside the full scope mask; true 1x would want `fov = SETTINGS.fov` at the low end.
- **15** If the pointer is unlocked while dead, the pause menu covers the kill cam (seen in my harness, where the pointer never locks).
- **16** Host + joiner both showed as "Operator".

---------------------------------------------------------------------------------------------------------------------------

## QA2 items A–L

| # | Item | Status | Evidence |
|---|---|---|---|
| A | Bot aim near-aimbot | **FIXED** | table above; frame-rate independent wander + lagged lead. 50 m strafing still weak (5) |
| B | Crouched hitboxes | **FIXED** | bone positions vs hitboxes, stand/crouch/prone: head, knees, shin and thigh mids all inside a hitbox (crouch head centre exactly on the sphere surface, head top inside); feet 0.03–0.09 m outside (fine) |
| C | Bush hiding | **FIXED — now too strong** | see 2 |
| D | Seeing behind | **FIXED** | see 5, stealth from behind |
| E | Blood at range / own trail | **FIXED** | M82 chest hit at 100 m through 26.7x: clear pink-red mist beside the target, no trail glare over it (AWM unscopes on the bolt, so you don't see it with bolt guns) |
| F | Slope limit | **OPEN** | see 6 |
| G | Spawn deaths | improved | soak: 9/111 bot deaths < 10 s after spawn (8%, was 14%), e.g. 3.8 s @132 m, 5.1 s @67 m; AFK player's first life 9.5 s |
| H | Hearing range | **FIXED** | code: `hear` 150/250/380 m by difficulty, `alertWait = d/343 + 0.3–0.9 s`, turn at 3/s |
| I | Gun-swap leak | **FIXED** | 96 rifle/knife/4-rifle swaps on one bot: 655 → 658 geometries (first builds only) |
| J | Prone on slopes, pool | **FIXED** | 13° slope: model and hitboxes tilt together, feet 0.12 m above the ground behind; pool offset 0.7 m along the fall (net.js:167) |
| K | Kill feed cap | OPEN | |
| L | FOV migration | OPEN | |

## Wildlife

- 66 perches (20 parapet, 21 ridge, 22 wire, chimney, tower, canopy), 25 flocks, 131 birds. No perch slot inside a collider. Visual checks:
  chimney crows sit on the rim, tower birds on the deck rail, gable birds on the ridge — all fine. Three parapet perches have one
  end bird ~0.1 m past the roof edge (floating over an 11–14 m drop: (5.9,12.2,-57.8), (-13.8,12.2,-53.3), (67.0,23.2,-99.4)) — clamp
  the end slots 0.15 m inside the run.
- Flush rules match the code: crouch-walk never flushes, walk flushes within 12 m (see 7), unsuppressed shots 40 m, suppressed 9 m.
- Bots turn to a flush (when they see it, see 1): alert 0.08 s, facing it in ~1.2–1.9 s more, scoped.
- Flight: circles 12–22 m above max(perch, ground + 6); no bird inside geometry seen, not exhaustively checked in flight.

## Post-processing, scope, performance

- Post high / low / off switch live from SETTINGS without errors; render target rebuilt on render-scale change (1.5 → 537x1269);
  scoped: bloom + vignette off, reticle crisp. MSAA 4, half float.
- Look: post on adds a subtle warm grade and vignette, dark windows stay readable; CA fringes (14).
- Timing (frame + readPixels sync, CPU side) at an emulated 1920x1080 buffer: 2.2–3.0 ms in every mode — no measurable cost from post
  here; GPU time isn't measurable in this pane, so test on a real low-end GPU before calling it free.
- Game logic per frame with 8 bots: ~0.25 ms (remotesTick 0.12, botsTick 0.055, wildlife 0.03, hud 0.01). 27 frames > 8 ms out of
  55k (max 20 ms) — probably `navPath` on repath.

## Full flow

Menu → PRACTICE → +BOT x6 / difficulty select (pause menu) → died (Bot Yuri, M82, 139 m) → death screen + kill cam (bullet follow,
"0.20 s flight · 0.20 m drop") → respawn at 3.98 s with full hp/plates, FOV back → settings (post, scale, shadows, grass, FOV) →
LEAVE GAME (bots/remotes/PROJ cleared) → HOST GAME: PeerJS gave DM-83AG in ~2 s, HUD + pause show the code. A second tab joined;
the host kept it for 10 s on keepalive with the client hidden; closing the client tab dropped it after ~9 s ("Operator left").
No errors anywhere.

## Soak: 8 normal bots + AFK player, 1235 s game time

- Errors: none. Stuck bots: none (no bot in 'move' without a target stayed within 1 m for 10 s).
- Kills: 111 bot deaths; killing distance p25 58 m, median 79 m, p75 109 m, max 257 m; 28/76 headshots; weapons m200 45, m82 21,
  svd 10 (no bot drew the AWM this run — random). Scores 6–13 kills per bot. AFK player died 11 times (lives 9.5–482 s).
- PROJ max 2; particles max 393. Heap 140–191 MB, no trend. Textures 74 → 87 then flat. Geometries +3/min (plates, 10).
- Flushes 13/min, 96% bot-caused (4).
