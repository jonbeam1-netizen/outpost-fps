# Rework spec — "sniper deathmatch in a run-down town"

Shared contract between the files. Plain browser JS, three.js r128 (global `THREE`), no build step,
scripts loaded in this order by index.html: util, audio, map, guns, character, fx, player, net, bots, pickups, ui, main.
Everything is global (`const`/`function` at top level). Keep the existing code style: dense, short helper names,
sparse comments that explain *why*. Every player must build the identical world: map randomness uses the seeded `rng`.

Vibe: sneaky, tense, grim. Overcast late afternoon, haze, muted dirty palette, a ruined/abandoned town.
Long sightlines broken by cover, bushes and tall grass you can hide in, dark windows to snipe from.

## Ownership (do not edit files you don't own)
- js/guns.js, dev/guns.html — guns agent
- js/map.js — map agent
- js/audio.js, js/fx.js — audio/fx agent
- js/character.js, dev/char.html — character agent (ghillie suits, prone, hitboxes)
- everything else (util, player, net, bots, pickups, ui, main, index.html, style.css) — lead

## Units / world
- metres, y up. Map spans x,z in [-MAP.half, MAP.half], MAP.half = 160.
- `COLL` (util.js): array of axis-aligned boxes `{x0,y0,z0,x1,y1,z1, mat, bullets, solid}`, added with
  `addCollider(x0,y0,z0,x1,y1,z1, mat='concrete', bullets=true, solid=true)`.
  - mat: 'concrete' | 'metal' | 'wood' | 'dirt' | 'glass' | 'foliage'
  - bullets=false → bullets pass through (chain-link, foliage). solid=false → players walk through.
  - Foliage volumes (bushes, tree canopies, tall-grass patches): `addCollider(..., 'foliage', false, false)`.
    Nothing physical — bots use them to block *line of sight* (you can hide in a bush).
- Colliders must hug the visible mesh. No invisible ledges. Rotated props: split into several boxes or keep axis-aligned.
- Terrain (map.js provides): `terrainY(x,z)` — fast (bilinear lookup in a precomputed Float32Array grid);
  `rayTerrain(o, d, maxT)` → t or -1 (o,d THREE.Vector3, d normalised). Terrain is walkable ground under everything.

## map.js exports
- `buildMap(scene)`; `MAP = { half, spawns:[{x,y,z,yaw}], ammoSpots:[{x,y,z}], plateSpots:[{x,y,z}], nests:[{x,y,z,yaw}], atmo:{...} }`
  - spawns ≥ 24, on the ground, spread out, not in the open middle of a street.
  - ammoSpots ≈ 18 (ground or floors), y = floor height the box rests above.
  - plateSpots ≈ 30 candidate spots (random plates appear at some of them).
  - nests ≈ 30 sniper positions reachable on foot at ground level (behind cover, in bushes, at ground-floor windows),
    yaw = the direction worth watching. Bots walk to these.
  - `MAP.atmo = { fog:0xRRGGBB, fogNear, fogFar, skyTop, skyHorizon, skyGround, sunColor, sunInt, sunDir:[x,y,z], hemiSky, hemiGround, hemiInt, exposure }`
    main.js reads this for lighting/sky/fog.
- `surfaceAt(x,z,y)` → 'concrete'|'metal'|'wood'|'grass'|'dirt'|'gravel'|'water' for footsteps.
- `terrainY`, `rayTerrain`, `GRASS` (instanced mesh or null).
- Ground-level navigation: doors ≥ 1.4 m wide, 2.2 m tall; every building's ground floor reachable; no gaps < 0.8 m.

## Weapons (guns.js)
`WEAPONS[id]` fields:
`name, cal, desc, kind ('bolt'|'semi'|'melee'), mag, reserve, rpm, cycle (bolt: seconds), reload, reloadEmpty,
 vel (m/s muzzle velocity), dmg:{head, chest, legs}, recoil:{v,h} (deg), move (speed mult), adsTime (s),
 sway (scope sway mult), hip:[x,y,z] (viewmodel hip offset), snd:{...} (passed to SFX.shot), slots:{optic:[], muzzle:[], under:[]},
 def:{optic, muzzle, under}, pistol?:true, melee?:true`

| id | name | kind | mag | reserve | rpm | cycle | reload/empty | vel | dmg head/chest/legs | move |
|---|---|---|---|---|---|---|---|---|---|---|
| awm | AWM .338 | bolt | 5 | 20 | 40 | 1.15 | 3.0/3.6 | 720 | 300/85/60 | 0.9 |
| m82 | Barrett M82A1 | semi | 10 | 20 | 90 | – | 3.6/4.3 | 680 | 300/95/70 | 0.8 |
| svd | Dragunov SVD | semi | 10 | 30 | 150 | – | 2.6/3.2 | 620 | 300/62/45 | 0.95 |
| m200 | CheyTac M200 Intervention | bolt | 7 | 21 | 35 | 1.3 | 3.4/4.0 | 780 | 300/90/65 | 0.85 |
| deagle | Desert Eagle .50 AE | semi | 7 | 35 | 240 | – | 1.8/2.2 | 420 | 95/45/32 | 1.05 |
| knife | M9 Bayonet | melee | – | – | 75 | – | – | – | instant kill | 1.1 |

Optics (`OPTICS[id] = {name, zoom:[min,max], reticle, scope:true}`), no iron sights anywhere:
- `lpvo` Vortex Razor 1–6x, reticle 'lpvo' (dot + circle + hashes)
- `pso` PSO-1 4x, reticle 'pso' (chevrons + rangefinder curve) — SVD only, default for SVD
- `mk4` Leupold Mk4 4.5–14x, reticle 'mildot'
- `pm2` Schmidt & Bender PM II 5–25x, reticle 'mildot'
- `atacr` Nightforce ATACR 7–35x, reticle 'tree' (Christmas-tree holdover grid)
Muzzles `MUZZLES[id] = {name, supp, recoil (mult), vel (mult)}`: `brake` (default, recoil 0.75), `supp` (supp true, vel 0.95, recoil 0.85), `none`.
Under `UNDER[id] = {name, bipod}`: `none`, `bipod` (cuts sway when crouched/prone and still).
Defaults: awm pm2/brake/bipod, m82 atacr/brake/bipod, svd pso/none/none, m200 atacr/brake/bipod.

`buildGun(id, mods, shadows)` returns
`{ group, id, def, mods, optic:OPTICS[..]|null, supp:bool, bipod:bool,
   grip, fore, muzzle, eject (Object3D markers), sightY, eyeZ, stockZ, magWell (V3),
   mag (Group, drops on reload), bolt (Group on the bore axis; rotation.z>0 lifts the handle, +z slides back),
   boltKnob (marker on the bolt handle), ch (charging handle Group, semis), slide (deagle Group, slides +z),
   blade/tip (knife markers) }`
Gun-local space: origin at the trigger, barrel points -z, y up, metres.

## Ballistics (player.js / bots.js)
Projectiles: gravity 9.81, no drag, rifles zeroed at 100 m. A shot = `{o, v}`; simulated per frame,
segment-tested against world (rayWorld incl. terrain) and hitboxes.

## Health
hp 100 shown as 4 hearts (25 each), 2 armor plates of 25 each absorb damage first, overflow goes to hp.
Partial hearts slowly heal back up to the next whole heart. Plates come back only from pickups.
Headshot from any rifle = dead. Knife = dead regardless of plates.

## audio.js API (SFX) — used by lead code
`init, setVolume(v), shot(snd, pos|null, suppressed, weaponId), mech(kind, pos)` kinds: magOut magIn bolt boltUp boltBack boltFwd
equip empty select chamber knifeDraw; `step(pos|null, surface, loud)`, `land(pos)`, `hit(head, kill)`, `hurt(plate)`,
`plateBreak(pos)`, `plateInsert()`, `pickup(kind)`, `impact(pos, mat)`, `fleshHit(pos, head)`, `whiz(pos)`, `crack(pos)` (supersonic
crack of a near miss), `knifeSwing(pos)`, `knifeHit(pos)`, `scopeIn()`, `scopeOut()`, `zoomTick()`, `ambient(on)` (wind, distant
crows/dogs/thunder, very quiet), `heartbeat(rate|0)` (low health), `breath(on)`.

## fx.js API (FX) — used by lead code
`fxInit(scene, vmScene), fxTick(dt), fxImpact(p, n:[x,y,z], mat), fxMuzzle(p, dir, big), fxTracer(o, e, opts)`,
`fxBullet(o, v)` → handle with `.update(pos)`/`.end()` for a visible projectile streak (suppressed: faint),
`fxBlood(p, dir, amount, head)` — lots of blood: spray particles, mist, droplets that fall and leave splats on the ground and on
walls behind the victim (use rayWorld to find surfaces), `fxBloodPool(p)` — pool spreading under a body,
`fxScreenBlood(amount)` — DOM/canvas blood splatter on the player's screen when hurt, `fxGlint(p, strength)` scope glint sprite,
`fxDust(p)` for misses near ground, `fxBrass(scene, p, right, up, big)`, `fxKnifeSlash()`.
