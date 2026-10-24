# Where the rework stands (update as you go)

Goal from the user: turn Outpost into HOLDOVER, a sneaky sniper deathmatch in a grim run-down hilly town
(see dev/SPEC.md for the contract between files). Stop working when the weekly usage resets.

## Done (lead)
- util.js: rayWorld also hits terrain (rayTerrain from map.js), rayFoliage/inFoliage for bot sight, groundY.
- player.js: rewritten — stances (stand/crouch/prone, C/Z), shared bodyPhysics (terrain aware), projectile
  ballistics (PROJ, gravity, 100 m zero), hearts+plates damage, knife (3 / V quick knife, instant kill),
  scope zoom on wheel, scope sway (bipod), bolt cycling unscope, Deagle secondary.
- net.js: state has stance/scoped/melee, shots carry velocity, 'fx' blood relay, pickups msgs, scope glint.
- bots.js: rewritten — 0.5 m nav grid + A* + string pulling, sniper nests, spotting meter (stance/foliage/movement),
  hearing gunshots, drop+lead compensation, knife when close, relocating, ammo/plate runs.
- pickups.js: new — floating spinning ammo cans (respawn 30 s), rare plates (host authoritative).
- index.html: renamed HOLDOVER, hearts/plates HUD, scope canvas, pickups.js script.

## In progress / todo (lead)
- ui.js: HUD hearts/plates, drawScope reticles (mildot/tree/pso/lpvo + range marks + rangefinder), loadout with
  3 mod slots, pickupsInit on start. (script: dev/ui_patch.py)
- main.js: MAP.atmo lighting/sky/fog (dusk), logarithmicDepthBuffer, gunEnv(RENDERER), pickupsTick, navBuild,
  grain overlay toggle.
- style.css: hearts/plates/scope/grain styles.
- Integrate agent outputs (guns.js, map.js, audio.js+fx.js, character.js), boot the game, fix errors, playtest
  with bots, README, delete dev/ pages or keep as tools, commit.

## Status 2026-10-24 ~15:30 UTC
- All round-1 agents finished and integrated; game boots, offline practice + bots + pickups + scope + blood work.
- Added collider broadphase grid (util.js collGridBuild/collNear), sky linearToOutputTexel, indoor dimming of characters.
- Round 2 agents running: QA playtest (writes dev/QA.md), map polish, guns polish (hip offsets), fx/audio tuning.
- Next for lead: fix bugs listed in dev/QA.md (player/bots/net/ui), then commit (user hasn't asked to commit yet — ask).

## Status ~16:15 UTC
- Guns polish + map polish done and integrated (hipRot, reload pose, bot pickups skip upper floors, gun shadows off for remotes).
- Fixed from dev/QA.md: prone camera/bot eye in walls (shoot-through), bot strafe lead + fire gate, A* cap, chat dup,
  stacked plates, steep slopes, geometry leak on bot removal, chest hitbox swallowing the head, AWM text.
- Running: QA (more findings → dev/QA.md), map agent fixing QA map items, character draw-call optimisation,
  multiplayer two-tab test (dev/NETTEST.md), fx/audio tuning.

## Status ~16:45 UTC
- Characters now skinned meshes with LOD (2–3 draw calls each, was 41). fx log-depth bug fixed (blood particles visible).
- Multiplayer verified over real WebRTC; fixed ghost peers (silence timeout), vis rounds passing through bodies,
  muzzle flash placement, client plate cleanup, welcome merge. Re-test running (dev/NETTEST.md).
- Running: QA round 2 (dev/QA2.md), menu/HUD polish agent (owns index.html, style.css, ui.js).
- Still nothing committed — ask the user before committing.

## Status ~17:30 UTC
- Menu/HUD polish done (PRACTICE button, stencil logo). Keepalive timer added for hidden tabs.
- QA2 fixes: bot aim = decaying first-sight error + slow wander (frame-rate independent), lagged target velocity,
  BOT_DIFF lag/hear, bush hiding works (full-ray foliage), no seeing behind (+ footstep hearing), shot-hearing delay,
  safe spawns (out of enemy sight, 2.5 s protection), slope check on combined move, dry bots go find ammo.
- Waiting: character agent (crouch head hitbox, gun-swap leak, prone on slopes), fx agent (blood mist at range,
  own-trail end-on fade), wildlife agent (flushing birds, smoke columns — new js/wildlife.js).
- After those: update bots.js bodyAim crouch head to match character hitbox.

## Status ~17:40 UTC
- Character hitbox fixes (crouch head forward/up, knees, prone splay, prone tilts on slopes), gun-swap leak fixed,
  bodyAim matched. fx: blood mist visible at range, own trail fades end-on. Blood pool offset to where bodies fall.
- Wildlife (js/wildlife.js): 25 flocks flush on fast movement/loud shots (bots investigate flushes), smoke columns,
  dust/ash, flies on pools. README updated.
- Running: post-processing agent (js/post.js, grade/bloom/vignette, 'post' setting).
- Then: final regression check, ask user to commit.

## Status ~17:55 UTC
- Post-processing done (js/post.js). Full regression passed (no errors, 8 bots, weapons/knife/prone/scope/damage).
- Running (final batch): QA round 3 (dev/QA3.md), map round 3 (hides, hedgerows, fog banks, more nests),
  kill-cam (js/killcam.js + small hooks in player.js/net.js/index.html).
- Weekly usage resets 19:00 UTC — user asked to stop at the reset. Nothing committed yet; ask the user.

## Status ~18:20 UTC — stopping point
- Kill-cam (js/killcam.js), map round 3 (ditches, hedgerows, collapsed walls, hay, hunting stands, loopholes,
  flickering windows, lanterns, burning car, creek mist, sky reflections; 42 nests) all integrated.
- QA3 fixes: bots read every bird flush (ring buffer), firing unsuppressed from a bush reveals you for 2.5 s and
  leaves don't hide you within 8 m, rangefinder counts people, birds flush at 3.3 m/s (bot walk no longer spams),
  aim error grows with target cross speed, strict slope ratio, plate geometry freed, tracers ended on leave,
  stored FOV 80 migrated to 70, M82 text, README bird text.
- Verified: boots clean, 8-bot 6-minute sims ~28 kills, no errors, flat memory.
- Known small leftovers (dev/QA3.md): loadout applies on next respawn; prone bodyAim ignores proneTilt (≤0.17 m);
  3 parapet perches have an end bird 0.1 m past the edge; pause can cover the kill cam; duplicate default names.
- Not committed. dev/ contains test pages (guns/map/char/fx.html) and QA reports — keep or delete before committing.

## Agents (background, round 1 — done)
- guns.js detailed models + M9 bayonet (shiny damascus)  - map.js big dusk town
- audio.js + fx.js (blood, cool tracers, quieter-but-audible suppressors)  - character.js ghillie suits + prone

## Open at end of session (2026-10-24)
- js/map.js has UNPUSHED, unverified edits from a map agent working on: church arched doorway (stepped/smeared
  reveal, table in the door path), removing the factory-district chain-link fence, lifting pitch-black interiors
  (occlusion ~0.6 -> ~0.4, near-black materials to dark grey). Check `git diff js/map.js`, test in game, then push.
