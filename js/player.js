'use strict';
// ---------- The local player: input, movement, camera, weapons, ballistics, first-person view ----------
let CAMERA = null, VMCAM = null, VMSCENE = null;
const INPUT = { keys: {}, pressed: {}, mouse: { l: false, r: false, lPressed: false, rPressed: false }, dx: 0, dy: 0, wheel: 0, locked: false };
// BULLET_G is game gravity for rounds, softer than real (9.81) so drop only bites past ~250 m; reticles, bots and the kill cam all use it
const R_PLAYER = 0.3, STEP = 0.48, GRAV = 18, BULLET_G = 4.0;
const STANCE = [   // height of the body box, eye height, move speed
  { h: 1.8, eye: 1.64, speed: 4.1 },
  { h: 1.25, eye: 1.1, speed: 2.1 },
  { h: 0.6, eye: 0.38, speed: 0.9 },
];
const PLAYER = {
  pos: new V3(), vel: new V3(), yaw: 0, pitch: 0, onGround: true, stance: 0, stanceT: 0, eyeH: 1.64, lean: 0, smoothY: 0,
  hp: 100, armor: 50, alive: false, sprint: false, sprintT: 0, ads: false, adsT: 0, adsToggle: false, scoped: false,
  weapons: [], cur: 0, prev: 0, fireCD: 0, cycleT: 0, cycleDur: 0, reloadT: 0, reloadDur: 0, reloading: false, equipT: 0,
  recoilP: 0, recoilY: 0, kick: 0, bob: 0, stepDist: 0, lastHurt: -99, spawnTime: 0, killerId: null, deathTime: 0,
  swayX: 0, swayY: 0, outfit: 'woodland', skin: 0, kills: 0, deaths: 0, slideT: 0, triggerUp: true,
  meleeT: 0, meleeHit: false, quickKnife: false, shotSway: 0, still: 0, sx: 0, sy: 0,
};
const PL = PLAYER;
function plHeight() { return STANCE[PL.stance].h; }
function boxHits(x, z, y0, y1, r = R_PLAYER) {
  const L = collNear(x - r, z - r, x + r, z + r);
  for (let i = 0; i < L.length; i++) { const c = L[i]; if (!c.solid) continue; if (c.y1 > y0 && c.y0 < y1 && x + r > c.x0 && x - r < c.x1 && z + r > c.z0 && z - r < c.z1) return c; }
  return null;
}
const headroom = (x, z, y, h) => !boxHits(x, z, y + 0.1, y + h, R_PLAYER - 0.02) && groundY(x, z) < y + 0.6;
// ---------- Shared body physics (the player and bots): boxes + heightfield ----------
// b: {pos, vel, onGround}, h: body height. Returns true if a wall blocked the move.
function bodyMoveAxis(b, axis, amt, h, r) {
  if (amt === 0) return false;
  const p = b.pos; p[axis] += amt; let hit = false;
  const feet = p.y, head = p.y + h, L = collNear(p.x - r, p.z - r, p.x + r, p.z + r);
  for (let i = 0; i < L.length; i++) {
    const c = L[i]; if (!c.solid) continue;
    if (c.y1 <= feet + (b.onGround ? STEP : 0.05) || c.y0 >= head) continue;
    if (p.x + r > c.x0 && p.x - r < c.x1 && p.z + r > c.z0 && p.z - r < c.z1) {
      if (axis === 'x') p.x = amt > 0 ? c.x0 - r - 1e-4 : c.x1 + r + 1e-4;
      else p.z = amt > 0 ? c.z0 - r - 1e-4 : c.z1 + r + 1e-4;
      b.vel[axis] = 0; hit = true;
    }
  }
  return hit;
}
function supportY(x, z, maxTop, r = R_PLAYER) {
  let best = groundY(x, z);
  const L = collNear(x - r, z - r, x + r, z + r);
  for (let i = 0; i < L.length; i++) {
    const c = L[i]; if (!c.solid) continue;
    if (c.y1 > maxTop || c.y1 <= best) continue;
    if (x + r - 0.04 > c.x0 && x - r + 0.04 < c.x1 && z + r - 0.04 > c.z0 && z - r + 0.04 < c.z1) best = c.y1;
  }
  return best;
}
function bodyPhysics(b, wx, wz, speed, dt, h, r = R_PLAYER, onLand) {
  const v = b.vel, k = b.onGround ? 1 - Math.exp(-dt * 11) : 1 - Math.exp(-dt * 1.5);
  v.x = lerp(v.x, wx * speed, k); v.z = lerp(v.z, wz * speed, k);
  // horizontal, one axis at a time, in small steps so fast movement never tunnels
  const steps = Math.ceil(Math.max(Math.abs(v.x), Math.abs(v.z)) * dt / 0.2) || 1;
  let blocked = false;
  for (let s = 0; s < steps; s++) {
    const sx = b.pos.x, sz = b.pos.z;
    blocked = bodyMoveAxis(b, 'x', v.x * dt / steps, h, r) || blocked; blocked = bodyMoveAxis(b, 'z', v.z * dt / steps, h, r) || blocked;
    // the ground can be too steep to walk up (about 50°); steps and stairs are colliders, so only the terrain is limited
    const hm = Math.hypot(b.pos.x - sx, b.pos.z - sz), g = groundY(b.pos.x, b.pos.z);
    if (hm > 0 && g > b.pos.y + (b.onGround ? hm * 1.2 : 0.05) + 0.004) { b.pos.x = sx; b.pos.z = sz; b.vel.x *= 0.3; b.vel.z *= 0.3; blocked = true; }
  }
  const p = b.pos, oldY = p.y; v.y -= GRAV * dt; let ny = p.y + v.y * dt;
  if (v.y > 0) for (const c of collNear(p.x - r, p.z - r, p.x + r, p.z + r)) if (c.solid && c.y0 >= oldY + h - 0.05 && c.y0 < ny + h && p.x + r > c.x0 && p.x - r < c.x1 && p.z + r > c.z0 && p.z - r < c.z1) { ny = c.y0 - h; v.y = 0; }
  const sup = supportY(p.x, p.z, oldY + (b.onGround ? STEP : 0.06), r);
  const was = b.onGround;
  if (ny <= sup) { if (!was && v.y < -7 && onLand) onLand(); ny = sup; v.y = 0; b.onGround = true; }
  else if (was && v.y <= 0 && oldY - sup <= STEP + 0.02) { ny = sup; v.y = 0; b.onGround = true; }   // stick to stairs and slopes going down
  else b.onGround = false;
  p.y = ny;
  const lim = MAP.half - 1; p.x = clamp(p.x, -lim, lim); p.z = clamp(p.z, -lim, lim);
  return blocked;
}
// ---------- Movement ----------
function setStance(s) {
  if (s === PL.stance) return;
  const p = PL.pos;
  if (s < PL.stance && !headroom(p.x, p.z, p.y, STANCE[s].h)) return;   // no room to get up
  PL.stance = s; SFX.step(null, surfaceAt(p.x, p.z, p.y), 0.4);
}
function playerPhysics(dt) {
  const k = INPUT.keys, p = PL.pos, v = PL.vel;
  if (INPUT.pressed.KeyC) setStance(PL.stance === 1 ? 0 : 1);   // not Ctrl: Ctrl+W would close the browser tab
  if (INPUT.pressed.KeyZ) setStance(PL.stance === 2 ? 0 : 2);
  const fwd = (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0), str = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0);
  const w = curW(), def = w ? w.def : null;
  const wantSprint = !!(k.ShiftLeft || k.ShiftRight) && fwd > 0 && !PL.ads && PL.onGround;
  if (wantSprint && PL.stance) setStance(0);
  PL.sprint = wantSprint && PL.stance === 0;
  let speed = PL.sprint ? 6.2 : STANCE[PL.stance].speed;
  if (PL.ads) speed *= PL.scoped ? 0.45 : 0.6;
  if (def) speed *= def.move;
  const sy = Math.sin(PL.yaw), cy = Math.cos(PL.yaw);
  let wx = -sy * fwd + cy * str, wz = -cy * fwd - sy * str;
  const wl = Math.hypot(wx, wz); if (wl > 0) { wx /= wl; wz /= wl; }
  if (INPUT.pressed.Space && PL.onGround) {
    if (PL.stance) setStance(0);
    else { v.y = 5.0; PL.onGround = false; }
  }
  bodyPhysics(PL, wx, wz, speed, dt, plHeight(), R_PLAYER, () => SFX.land(null));
  if (PL.pos.y < -20) PL.pos.y = groundY(PL.pos.x, PL.pos.z);
  // smooth the camera over steps
  PL.smoothY = PL.onGround && Math.abs(PL.smoothY - p.y) < 0.6 ? lerp(PL.smoothY, p.y, 1 - Math.exp(-dt * 18)) : p.y;
  // footsteps
  const hs = Math.hypot(v.x, v.z);
  PL.still = hs < 0.3 ? PL.still + dt : 0;
  if (PL.onGround && hs > 0.4) {
    PL.stepDist += hs * dt;
    const stride = PL.sprint ? 2.1 : [1.75, 1.3, 0.9][PL.stance];
    if (PL.stepDist > stride) { PL.stepDist = 0; SFX.step(null, surfaceAt(p.x, p.z, p.y), [0.7, 0.35, 0.25][PL.stance] * (PL.sprint ? 1.45 : 1)); }
  }
  PL.bob += hs * dt * (PL.sprint ? 1.25 : 1.5);
}
// ---------- Weapons ----------
function makeWeapon(id, mods) {
  const def = WEAPONS[id];
  const m = Object.assign({}, def.def || {}, mods || {});
  const opt = OPTICS[m.optic];
  return { id, def, mods: m, ammo: def.mag || 0, reserve: def.reserve || 0, zoom: opt ? opt.zoom[0] : 1 };
}
function equipLoadout(lo) {
  PL.weapons = [makeWeapon(lo.primary, lo.mods[lo.primary]), makeWeapon('deagle', {}), makeWeapon('knife', {})];
  PL.cur = 0; PL.prev = 1; buildViewmodel(); PL.equipT = 0.5;
}
function curW() { return PL.weapons[PL.cur]; }
function switchWeapon(i) {
  if (i === PL.cur || !PL.weapons[i] || !PL.alive) return;
  PL.prev = PL.cur; PL.cur = i; PL.reloading = false; PL.cycleT = 0; PL.meleeT = 0; PL.equipT = 0.45; PL.adsT = 0; buildViewmodel();
  SFX.mech(curW().def.melee ? 'knifeDraw' : 'equip');
}
function startReload() {
  const w = curW(); if (!w || w.def.melee || PL.reloading || PL.equipT > 0 || PL.cycleT > 0) return;
  const d = w.def;
  if (w.ammo >= d.mag || w.reserve <= 0) return;
  PL.reloading = true; PL.reloadT = 0; PL.reloadStage = 0; PL.reloadEmpty = w.ammo === 0;
  PL.reloadDur = PL.reloadEmpty ? d.reloadEmpty : d.reload;
}
function reloadTick(dt) {
  const w = curW(); if (!PL.reloading || !w) return;
  const d = w.def; PL.reloadT += dt;
  const u = PL.reloadT / PL.reloadDur;
  if (PL.reloadStage === 0 && u > 0.2) { PL.reloadStage = 1; SFX.mech('magOut'); }
  if (PL.reloadStage === 1 && u > 0.58) { PL.reloadStage = 2; SFX.mech('magIn'); }
  if (PL.reloadStage === 2 && PL.reloadEmpty && u > 0.8) { PL.reloadStage = 3; SFX.mech(d.kind === 'bolt' ? 'boltBack' : 'bolt'); }
  if (PL.reloadStage === 3 && d.kind === 'bolt' && u > 0.9) { PL.reloadStage = 4; SFX.mech('boltFwd'); }
  if (u >= 1) {
    const want = d.mag + (w.ammo > 0 ? 1 : 0) - w.ammo, take = Math.min(want, w.reserve);   // +1 in the chamber on a tactical reload
    w.ammo += take; w.reserve -= take; PL.reloading = false;
  }
}
// ---------- Ballistics ----------
// zero: tilt the bore up so the round crosses the line of sight again at 100 m
function zeroAngle(vel, range = 100) { const t = range / vel; return Math.atan2(0.5 * BULLET_G * t * t, range); }
// how far below the aim line a round lands at a distance (for reticle range marks and bots), in radians
function dropAngle(vel, dist, zeroed = true) { const t = dist / vel; return Math.atan2(0.5 * BULLET_G * t * t, dist) - (zeroed ? zeroAngle(vel) : 0); }
function muzzleVel(w) { const m = MUZZLES[w.mods.muzzle]; return w.def.vel * (m && m.vel ? m.vel : 1); }
const PROJ = [];
// spawn a round. owner: who gets credit; mode: 'me' (hits players and reports them), 'bot' (host simulates bot rounds), 'vis' (just looks)
function spawnProjectile(o, v, owner, wid, mode, supp) {
  const pr = { pos: o.clone(), vel: v.clone(), owner, wid, mode, supp, dist: 0, life: 3.5, start: o.clone(), whizzed: false };
  if (typeof fxBullet === 'function') { try { pr.fx = fxBullet(o, v, supp); } catch (e) { pr.fx = null; } }
  PROJ.push(pr); return pr;
}
const _pd = new V3(), _pn = new V3();
function projTick(dt) {
  for (let i = PROJ.length - 1; i >= 0; i--) {
    const pr = PROJ[i]; pr.life -= dt;
    let done = pr.life <= 0;
    // a few substeps so the curve stays smooth and fast rounds never skip a head
    const sub = 3, h = dt / sub;
    for (let s = 0; s < sub && !done; s++) {
      _pn.copy(pr.pos).addScaledVector(pr.vel, h); pr.vel.y -= BULLET_G * h;
      _pd.subVectors(_pn, pr.pos); const len = _pd.length(); _pd.divideScalar(len || 1);
      const hit = projTrace(pr, pr.pos, _pd, len);   // 'vis' rounds stop at bodies too, so they don't sail on through whoever they hit
      if (hit) { projImpact(pr, hit, _pd); done = true; break; }
      projNearMiss(pr, pr.pos, _pd, len);
      pr.pos.copy(_pn); pr.dist += len;
      if (Math.abs(pr.pos.x) > MAP.half + 200 || Math.abs(pr.pos.z) > MAP.half + 200 || pr.pos.y < -50) done = true;
    }
    if (pr.fx && pr.fx.update) pr.fx.update(pr.pos);
    if (done) { if (pr.fx && pr.fx.end) pr.fx.end(); PROJ.splice(i, 1); }
  }
}
// world + every body this round can hurt
function projTrace(pr, o, d, len) {
  const wh = rayWorld(o, d, len, true);
  let best = wh ? wh.t : len, res = wh;
  const bodies = pr.mode === 'me' ? remoteBodies() : pr.mode === 'vis' ? visBodies(pr.owner) : matchBodies(pr.owner);
  for (const b of bodies) {
    if (b.id === pr.owner) continue;
    if (Math.abs(b.pos.x - o.x) > len + 3 && Math.abs(b.pos.z - o.z) > len + 3) continue;
    for (const hb of operatorHitboxes(b.pos, b.stance, b.lean, b.yaw)) {
      const t = hb.type === 's' ? raySphere(o, d, hb.x, hb.y, hb.z, hb.r) : rayCapsule(o, d, hb.x, hb.y0, hb.y1, hb.z, hb.r);
      if (t >= 0 && t < best) { best = t; res = { t, player: b.id, zone: hb.zone }; }
    }
  }
  return res;
}
// everyone a display-only round could hit: other remotes and us
function visBodies(owner) {
  const out = remoteBodies().filter(b => b.id !== owner);
  if (PL.alive) out.push({ id: NET.myId, pos: PL.pos, stance: PL.stance, lean: PL.leanEff || 0, yaw: PL.yaw });
  return out;
}
function remoteBodies() {
  const out = [];
  REMOTES.forEach((r, id) => { if (r.alive && r.state) out.push({ id, pos: r.state.pos, stance: r.state.stance || 0, lean: r.state.lean || 0, yaw: r.state.yaw || 0 }); });
  return out;
}
function projImpact(pr, hit, d) {
  const p = pr.pos.clone().addScaledVector(d, hit.t);
  if (hit.player && pr.mode === 'vis') return;   // the shooter decides the damage; the blood arrives through 'fx'
  if (hit.player) {
    const def = WEAPONS[pr.wid], dmg = def.dmg[hit.zone] || def.dmg.chest;
    const dir = [+d.x.toFixed(2), +d.y.toFixed(2), +d.z.toFixed(2)], pp = [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)];
    if (pr.mode === 'me') { netHit(hit.player, dmg, hit.zone, pr.wid); hudHit(hit.zone === 'head'); netOut({ t: 'fx', k: 'blood', p: pp, d: dir, h: hit.zone === 'head' ? 1 : 0 }); }
    else { hostDeliverHit(pr.owner, hit.player, dmg, hit.zone, pr.wid); hostReceive(pr.owner, { t: 'fx', k: 'blood', p: pp, d: dir, h: hit.zone === 'head' ? 1 : 0 }); }
    if (pr.mode === 'me') { fxBlood(p, d, hit.zone === 'head' ? 1.6 : 1, hit.zone === 'head'); SFX.fleshHit(p, hit.zone === 'head'); }   // bot hits come back through the 'fx' relay
  } else {
    fxImpact(p, hit.n, hit.c.mat); SFX.impact(p, hit.c.mat);
    if (hit.c.terrain || hit.c.mat === 'dirt') fxDust(p);
  }
}
// the snap of a round passing close to our head
function projNearMiss(pr, o, d, len) {
  if (pr.whizzed || !PL.alive || pr.owner === NET.myId) return;
  _toCam.copy(CAMERA.position).sub(o); const t = _toCam.dot(d);
  if (t < 0 || t > len) return;
  const closest = o.clone().addScaledVector(d, t), dist = closest.distanceTo(CAMERA.position);
  if (dist < 4) { pr.whizzed = true; SFX.whiz(closest); if (pr.dist > 30) SFX.crack(closest); }
}
const _toCam = new V3();
// ---------- Firing ----------
const _sd = new V3(), _sr = new V3(), _su = new V3(), _so = new V3();
function fireWeapon() {
  const w = curW(), d = w.def;
  w.ammo--; PL.fireCD = Math.max(PL.fireCD, -1 / 60) + 60 / d.rpm; PL.slideT = 1;   // carry leftover time so fire rate doesn't depend on frame rate
  if (d.kind === 'bolt') { PL.cycleT = d.cycle; PL.cycleDur = d.cycle; PL.cycleSnd = 0; }
  // accuracy: scoped and still is dead on; hip fire with a sniper is a gamble
  const moving = Math.hypot(PL.vel.x, PL.vel.z) > 0.6;
  let spread = PL.scoped || (d.pistol && PL.adsT > 0.8) ? 0 : d.pistol ? 1.6 : 4.5;
  if (moving) spread += PL.scoped ? 0.6 : 1.5;
  if (!PL.onGround) spread += 4;
  CAMERA.getWorldDirection(_sd); _so.copy(CAMERA.position);
  _sr.set(1, 0, 0).applyQuaternion(CAMERA.quaternion); _su.set(0, 1, 0).applyQuaternion(CAMERA.quaternion);
  const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * spread * Math.PI / 180;
  const dir = _sd.clone().addScaledVector(_sr, Math.cos(a) * Math.tan(r)).addScaledVector(_su, Math.sin(a) * Math.tan(r)).normalize();
  const vel = muzzleVel(w), za = d.pistol ? zeroAngle(vel, 25) : zeroAngle(vel);
  dir.applyAxisAngle(_sr, za);
  const supp = !!(VM.gun && VM.gun.supp);
  spawnProjectile(_so, dir.clone().multiplyScalar(vel), NET.myId, w.id, 'me', supp);
  netShot(_so, dir.clone().multiplyScalar(vel), w.id, supp);
  if (NET.host) botsHearShot(NET.myId, _so, supp);   // the host's own shots never come back through remoteShot
  // recoil: part of it climbs the view for good, part is a kick that settles
  const mz = MUZZLES[w.mods.muzzle], rm = (mz && mz.recoil ? mz.recoil : 1) * [1, 0.8, 0.55][PL.stance] * (VM.gun && VM.gun.bipod && PL.stance && PL.still > 0.3 ? 0.6 : 1);
  const rv = d.recoil.v * rm * Math.PI / 180, rh = d.recoil.h * rm * Math.PI / 180;
  // the kick pops the view up and settles back to the aim point; semis keep a little climb so spamming costs
  const keep = d.kind === 'bolt' ? 0 : 0.15, hk = rand(-rh, rh);
  PL.pitch = clamp(PL.pitch + rv * keep, -1.5, 1.5); PL.yaw += hk * keep;
  PL.recoilP += rv * (1 - keep); PL.recoilY += hk * (1 - keep);
  PL.kick = Math.min(1.5, PL.kick + (d.pistol ? 0.9 : 1.4)); PL.shotSway = 1;
  SFX.shot(d.snd, null, supp, w.id);
  vmMuzzleFlash(supp, d.pistol ? 1 : 1.6);
  if (d.kind === 'semi') vmEject(!d.pistol);
  if (w.ammo === 0 && d.pistol) PL.slideLocked = true;
}
// The knife: one stab ends it
function knifeTick(dt) {
  const w = curW(); if (!w || !w.def.melee) return;
  if (PL.meleeT > 0) {
    const prevT = PL.meleeT; PL.meleeT = Math.max(0, PL.meleeT - dt);
    const u = 1 - PL.meleeT / 0.55;
    if (!PL.meleeHit && u > 0.3) {
      PL.meleeHit = true;
      const t = knifeTarget(CAMERA.position, PL.yaw, PL.pitch, remoteBodies());
      if (t) { netHit(t.id, 999, 'chest', 'knife'); hudHit(false); SFX.knifeHit(t.pos); const bp = new V3(t.pos.x, t.pos.y + 1.2, t.pos.z); fxBlood(bp, new V3(-Math.sin(PL.yaw), 0, -Math.cos(PL.yaw)), 2, false); netOut({ t: 'fx', k: 'blood', p: [bp.x, bp.y, bp.z], d: [-Math.sin(PL.yaw), 0, -Math.cos(PL.yaw)], h: 0 }); }
    }
    if (prevT > 0 && PL.meleeT === 0 && PL.quickKnife) { PL.quickKnife = false; switchWeapon(PL.prev); }
  }
}
// nearest visible body in a cone in front of the blade
function knifeTarget(eye, yaw, pitch, bodies) {
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  let best = null, bd = 2.3;
  for (const b of bodies) {
    const tx = b.pos.x - eye.x, tz = b.pos.z - eye.z, ty = b.pos.y + 1 - eye.y, d = Math.hypot(tx, tz);
    if (d > bd || Math.abs(ty) > 1.6) continue;
    if (d > 0.4 && (tx * fx + tz * fz) / d < 0.55) continue;
    const to = new V3(b.pos.x, b.pos.y + (b.stance === 2 ? 0.3 : 1.1), b.pos.z), dir = to.clone().sub(eye), L = dir.length(); dir.normalize();
    if (rayWorld(eye, dir, L - 0.2, true)) continue;
    best = b; bd = d;
  }
  return best;
}
function startMelee(quick) {
  if (PL.meleeT > 0) return;
  if (quick && !curW().def.melee) { PL.quickKnife = true; const prev = PL.cur; switchWeapon(2); PL.prev = prev; PL.equipT = 0.08; }
  PL.meleeT = 0.55; PL.meleeHit = false; SFX.knifeSwing(null); if (typeof fxKnifeSlash === 'function') fxKnifeSlash();
}
function weaponTick(dt) {
  const w = curW(); if (!w) return;
  const d = w.def;
  PL.fireCD -= dt; PL.equipT = Math.max(0, PL.equipT - dt); PL.slideT = Math.max(0, PL.slideT - dt * 14);
  PL.shotSway = Math.max(0, PL.shotSway - dt * 1.5);
  // aiming (a bolt rifle drops out of the scope while you work the bolt)
  if (SETTINGS.aimMode === 'toggle') { if (INPUT.mouse.rPressed) PL.adsToggle = !PL.adsToggle; PL.ads = PL.adsToggle; }
  else PL.ads = INPUT.mouse.r;
  if (d.melee || PL.sprint || PL.equipT > 0.2 || PL.reloading || PL.cycleT > 0) PL.ads = false;
  if (!PL.ads && (PL.sprint || PL.reloading)) PL.adsToggle = false;
  const wasScoped = PL.scoped;
  PL.adsT = clamp(PL.adsT + (PL.ads ? dt : -dt * 1.6) / Math.max(0.05, (d.adsTime || 0) * 0.75), 0, 1) || 0;   // the knife's adsTime is 0: never divide by it   // a touch quicker than the guns' listed times
  PL.sprintT = clamp(PL.sprintT + (PL.sprint ? dt : -dt) * 5, 0, 1);
  if (PL.adsT > 0.6 && PL.adsT - dt / Math.max(0.05, (d.adsTime || 0) * 0.75) <= 0.6 && PL.ads && VM.gun && VM.gun.optic) SFX.scopeIn();
  if (PL.adsT < 0.85 && wasScoped) SFX.scopeOut();
  // bolt cycling
  if (PL.cycleT > 0) {
    PL.cycleT -= dt; const u = 1 - PL.cycleT / PL.cycleDur;
    if (PL.cycleSnd === 0 && u > 0.12) { PL.cycleSnd = 1; SFX.mech('boltUp'); }
    if (PL.cycleSnd === 1 && u > 0.3) { PL.cycleSnd = 2; SFX.mech('boltBack'); vmEject(true); }
    if (PL.cycleSnd === 2 && u > 0.62) { PL.cycleSnd = 3; SFX.mech('boltFwd'); }
    if (PL.cycleT <= 0) PL.cycleT = 0;
  }
  reloadTick(dt); knifeTick(dt);
  // trigger (semi and bolt only: one shot per press)
  const trig = INPUT.mouse.l && INPUT.locked;
  if (!trig) PL.triggerUp = true;
  if (INPUT.pressed.KeyV) startMelee(true);
  const canShoot = PL.alive && PL.equipT <= 0 && PL.sprintT < 0.3 && PL.fireCD <= 0 && PL.cycleT <= 0 && !PL.reloading;
  if (trig && PL.triggerUp) {
    if (d.melee) { if (PL.equipT <= 0) startMelee(false); }
    else if (canShoot) {
      if (w.ammo > 0) fireWeapon();
      else { SFX.mech('empty'); PL.fireCD = 0.25; startReload(); }
    }
    PL.triggerUp = false;
  }
  if (w.ammo > 0) PL.slideLocked = false;
  PL.kick = Math.max(0, PL.kick - dt * 5);
  PL.recoilP *= Math.exp(-dt * 7); PL.recoilY *= Math.exp(-dt * 7);
  if (INPUT.pressed.KeyR) startReload();
  if (INPUT.pressed.Digit1) switchWeapon(0);
  if (INPUT.pressed.Digit2) switchWeapon(1);
  if (INPUT.pressed.Digit3) switchWeapon(2);
  // the wheel zooms while scoped, otherwise it swaps weapons
  if (INPUT.wheel) {
    const opt = VM.gun && VM.gun.optic;
    if (PL.scoped && opt && opt.zoom[1] > opt.zoom[0]) {
      const nz = clamp(w.zoom * (INPUT.wheel < 0 ? 1.25 : 0.8), opt.zoom[0], opt.zoom[1]);
      if (Math.abs(nz - w.zoom) > 0.01) { w.zoom = nz; SFX.zoomTick(); }
    } else if (!PL.scoped) switchWeapon((PL.cur + (INPUT.wheel > 0 ? 1 : PL.weapons.length - 1)) % PL.weapons.length);
  }
}
// ---------- Camera ----------
const _pe = new V3(), _pf = new V3();
const scopeFov = z => 2 * Math.atan(Math.tan(27.5 * Math.PI / 180) / z) * 180 / Math.PI;
function cameraTick(dt) {
  // mouse look (slower through a scope so the reticle moves the same on screen)
  const zoomK = Math.tan(CAMERA.fov * Math.PI / 360) / Math.tan(SETTINGS.fov * Math.PI / 360);   // 0% monitor distance, like CS2/Valorant
  const sens = SETTINGS.sens * 0.0022 * zoomK * lerp(1, SETTINGS.adsSens, Math.max(PL.scopeA || 0, PL.adsT * (curW() && curW().def.pistol ? 1 : 0)));
  PL.yaw -= INPUT.dx * sens; PL.pitch -= INPUT.dy * sens * (SETTINGS.invert ? -1 : 1);
  PL.pitch = clamp(PL.pitch, -1.52, 1.52);
  PL.swayX = lerp(PL.swayX, clamp(INPUT.dx * 0.02, -1, 1), 1 - Math.exp(-dt * 10)); PL.swayY = lerp(PL.swayY, clamp(INPUT.dy * 0.02, -1, 1), 1 - Math.exp(-dt * 10));
  // lean (Q/E), stopped by walls; not while prone
  const lt = PL.stance === 2 ? 0 : (INPUT.keys.KeyE ? 1 : 0) - (INPUT.keys.KeyQ ? 1 : 0);
  PL.lean = lerp(PL.lean, PL.sprint ? 0 : lt, 1 - Math.exp(-dt * 10));
  PL.eyeH = lerp(PL.eyeH, STANCE[PL.stance].eye, 1 - Math.exp(-dt * (PL.stance === 2 ? 5 : 10)));
  const eye = PL.eyeH;
  const rx = Math.cos(PL.yaw), rz = -Math.sin(PL.yaw);
  let lean = PL.lean;
  if (Math.abs(lean) > 0.01) {
    const o = new V3(PL.pos.x, PL.smoothY + eye, PL.pos.z), d = new V3(rx * Math.sign(lean), 0, rz * Math.sign(lean));
    const h = rayWorld(o, d, 0.6, false); if (h) lean = Math.sign(lean) * Math.min(Math.abs(lean), Math.max(0, (h.t - 0.2) / 0.4));
  }
  PL.leanEff = lean;
  // prone: the head is out in front of the body
  let pf = smoothT((1.64 - eye) / 1.26) * (PL.stance === 2 ? 0.35 : 0);
  if (pf > 0) { const h = rayWorld(_pe.set(PL.pos.x, PL.smoothY + eye, PL.pos.z), _pf.set(-Math.sin(PL.yaw), 0, -Math.cos(PL.yaw)), pf + 0.2, false); if (h) pf = Math.max(0, h.t - 0.2); }   // never poke the head into a wall
  const fx = -Math.sin(PL.yaw) * pf, fz = -Math.cos(PL.yaw) * pf;
  CAMERA.position.set(PL.pos.x + rx * lean * 0.4 + fx, PL.smoothY + eye - Math.abs(lean) * 0.06, PL.pos.z + rz * lean * 0.4 + fz);
  const bobAmt = PL.onGround ? Math.min(1, Math.hypot(PL.vel.x, PL.vel.z) / 5) * (1 - PL.adsT * 0.8) : 0;
  CAMERA.position.y += Math.sin(PL.bob * 2) * 0.025 * bobAmt;
  // scope sway: breathing drift, worse standing, moving and just after a shot; a bipod nearly kills it
  const g = VM.gun, w = curW();
  let sw = 0;
  if (PL.adsT > 0.5 && w && !w.def.melee) {
    const bip = g && g.bipod && PL.stance > 0 && PL.still > 0.4;
    sw = (w.def.sway || 1) * [1, 0.55, 0.3][PL.stance] * (bip ? 0.25 : 1) * (1 + Math.min(1, Math.hypot(PL.vel.x, PL.vel.z)) * 2.5) * (1 + PL.shotSway * 1.5) * (PL.hp < 50 ? 1.4 : 1);
  }
  const tn = performance.now() / 1000, A = 0.0016 * sw;
  PL.sx = lerp(PL.sx, A * (Math.sin(tn * 0.9) * 0.8 + Math.sin(tn * 2.3 + 1) * 0.3), 1 - Math.exp(-dt * 4));
  PL.sy = lerp(PL.sy, A * (Math.sin(tn * 1.4 + 2) * 0.7 + Math.cos(tn * 0.6) * 0.5), 1 - Math.exp(-dt * 4));
  CAMERA.rotation.order = 'YXZ';
  CAMERA.rotation.set(PL.pitch + PL.recoilP + PL.sy, PL.yaw + PL.recoilY + PL.sx, -lean * 0.14 + Math.sin(PL.bob) * 0.004 * bobAmt);
  // FOV: through a scope it's the magnification, otherwise a slight zoom for the pistol
  const opt = g && g.optic;
  // the scope comes up gradually: past halfway you start looking through the glass and the zoom eases in
  const sa = opt ? smoothT((PL.adsT - 0.45) / 0.5) : 0;
  const hipF = SETTINGS.fov * lerp(1, opt ? 0.9 : 0.82, PL.adsT) * (1 + PL.sprintT * 0.04);
  const fov = sa > 0 ? Math.exp(lerp(Math.log(hipF), Math.log(scopeFov(w.zoom)), sa)) : hipF;
  if (Math.abs(CAMERA.fov - fov) > 0.01) { CAMERA.fov = sa > 0 ? fov : lerp(CAMERA.fov, fov, 1 - Math.exp(-dt * 18)); CAMERA.updateProjectionMatrix(); }
  PL.scopeA = sa; PL.scoped = sa > 0.97;
}
// ---------- First-person viewmodel ----------
const VM = { root: null, pivot: null, gun: null, arms: [], flash: null, flashT: 0 };
function vmInit() {
  VMSCENE = new THREE.Scene();
  VMCAM = new THREE.PerspectiveCamera(62, 1, 0.01, 10);
  VMSCENE.add(new THREE.HemisphereLight(0xc8ccd0, 0x3a352c, 0.7));
  const sun = new THREE.DirectionalLight(0xffe2c0, 1.0); sun.position.set(-0.5, 1, 0.4); VMSCENE.add(sun);
  const fill = new THREE.DirectionalLight(0x8a98aa, 0.35); fill.position.set(0.6, 0.2, 1); VMSCENE.add(fill);
  VM.root = new THREE.Group(); VMSCENE.add(VM.root);
  VM.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  VM.flash.visible = false; VMSCENE.add(VM.flash);
  VM.flashLight = new THREE.PointLight(0xffb060, 0, 1.5, 2); VMSCENE.add(VM.flashLight);
}
function buildViewmodel() {
  // free the old model's GPU buffers (gun materials are shared, the arm materials are per build)
  const free = (o, mats) => o.traverse(m => { if (m.isMesh) { m.geometry.dispose(); if (mats) (Array.isArray(m.material) ? m.material : [m.material]).forEach(x => x.dispose()); } });
  if (VM.pivot) { VM.root.remove(VM.pivot); free(VM.pivot, false); }
  VM.arms.forEach(a => { [a.upper, a.lower, a.hand].forEach(o => { VM.root.remove(o); free(o, true); }); });
  VM.arms = [];
  const w = curW(); if (!w) return;
  VM.pivot = new THREE.Group(); VM.root.add(VM.pivot);
  VM.gun = buildGun(w.id, w.mods, false); VM.pivot.add(VM.gun.group);
  const mats = charMats(PL.outfit, PL.skin);
  VM.arms = [buildArm(VM.root, mats, 1, true), buildArm(VM.root, mats, -1, true)];
  VM.arms.forEach(a => [a.upper, a.lower, a.hand].forEach(o => o.traverse(m => { if (m.isMesh) { m.frustumCulled = false; m.castShadow = false; } })));
}
function vmMuzzleFlash(supp, big) {
  if (!VM.gun || supp) return;
  VM.flashT = 0.05; VM.flash.material.rotation = Math.random() * TAU; VM.flash.scale.setScalar(0.075 * big * rand(0.8, 1.2));
  FX.flashLight.position.copy(CAMERA.position); FX.flashLight.intensity = 2.5; FX.flashT = 0.05;
}
function vmEject(big) {
  if (!VM.gun || !VM.gun.eject) return;
  const p = new V3(); VM.gun.eject.getWorldPosition(p);
  fxBrass(VMSCENE, p, new V3(1, 0, 0.2), new V3(0, 1, 0), big);
}
const KNIFE_KEYS = [
  [0, 0, 0, 0, 0, 0, 0],
  [0.2, 0.1, 0.06, 0.04, -0.15, -0.55, 0.6],     // wound up: out to the right, blade laid back
  [0.48, -0.32, -0.05, -0.14, -0.3, 1.05, -0.75], // the slash: across to the left, reaching forward
  [0.62, -0.28, -0.07, -0.08, -0.2, 0.9, -0.6],   // follow-through
  [1, 0, 0, 0, 0, 0, 0],
];
const _vp = new V3(), _wp = new V3(), _wq2 = new THREE.Quaternion(), _hintV = new V3();
function vmTick(dt) {
  const w = curW(), g = VM.gun; if (!w || !g) return;
  const d = w.def, a = smoothT(PL.adsT), sp = PL.sprintT;
  const hip = d.hip || [0.14, -0.14, -0.5];
  // the pistol is held out at arm's length when aiming, so its back end doesn't fill the screen (sights stay on the line)
  const px = lerp(hip[0], 0, a), py = lerp(hip[1], -g.sightY, a), pz = lerp(hip[2], -g.eyeZ - (d.pistol ? 0.22 : 0), a);
  let rx = 0, ry = lerp(0.03, 0, a), rz = lerp(0.02, 0, a), ox = 0, oy = 0, oz = 0;
  const hr = d.hipRot; if (hr) { rx += hr[0] * (1 - a); ry += hr[1] * (1 - a); rz += hr[2] * (1 - a); }
  // bob and sway
  const bobAmt = PL.onGround ? Math.min(1, Math.hypot(PL.vel.x, PL.vel.z) / 5) : 0;
  const bk = (1 - a * 0.85) * bobAmt;
  ox += Math.sin(PL.bob) * 0.011 * bk; oy += -Math.abs(Math.cos(PL.bob)) * 0.009 * bk;
  ry += -PL.swayX * 0.05 * (1 - a * 0.7); rx += -PL.swayY * 0.04 * (1 - a * 0.7);
  ox += -PL.swayX * 0.006; oy += PL.swayY * 0.006;
  const tnow = performance.now() / 1000; oy += Math.sin(tnow * 1.4) * 0.0015 * (1 - a * 0.6); rx += Math.sin(tnow * 1.1) * 0.003 * (1 - a * 0.5);
  // sprint: gun tilted down and across
  rx += -0.55 * sp; ry += 0.6 * sp; rz += 0.25 * sp; ox += -0.04 * sp; oy += -0.03 * sp; oz += 0.04 * sp;
  // prone: the rifle rests low and level
  if (PL.stance === 2) { oy -= 0.015 * (1 - a); rz -= 0.05 * (1 - a); }
  const kk = PL.kick;
  oz += kk * (d.pistol ? 0.03 : 0.06); rx += kk * (d.pistol ? 0.12 : 0.06) * (1 - a * 0.4); oy += kk * 0.004;
  oy -= PL.equipT * 0.6; rx -= PL.equipT * 1.2;
  // knife: cock it back to the right, rip across to the left, recover (keys: u, ox, oy, oz, rx, ry, rz)
  if (d.melee && PL.meleeT > 0) {
    const u = 1 - PL.meleeT / 0.55;
    let k = 0; while (k < KNIFE_KEYS.length - 2 && u > KNIFE_KEYS[k + 1][0]) k++;
    const A = KNIFE_KEYS[k], B = KNIFE_KEYS[k + 1], f = smoothT((u - A[0]) / (B[0] - A[0])), L = i => lerp(A[i], B[i], f);
    ox += L(1); oy += L(2); oz += L(3); rx += L(4); ry += L(5); rz += L(6);
  }
  // reload: tilt the gun, drop the mag and bring a new one up
  let magDrop = 0;
  if (PL.reloading) {
    const u = PL.reloadT / PL.reloadDur, env = smoothT(u / 0.15) * (1 - smoothT((u - 0.85) / 0.15));
    rz -= 0.3 * env; rx += 0.38 * env; ry += 0.25 * env; oy -= 0.05 * env; ox -= 0.02 * env;   // roll the mag toward you so the swap shows
    magDrop = u < 0.2 ? 0 : u < 0.38 ? smoothT((u - 0.2) / 0.18) : u < 0.48 ? 1 : u < 0.6 ? 1 - smoothT((u - 0.48) / 0.12) : 0;
  }
  // bolt cycling
  let boltRot = 0, boltBack = 0;
  if (PL.cycleT > 0) {
    const u = 1 - PL.cycleT / PL.cycleDur;
    boltRot = u < 0.1 ? 0 : u < 0.25 ? smoothT((u - 0.1) / 0.15) : u < 0.7 ? 1 : 1 - smoothT((u - 0.7) / 0.15);
    boltBack = u < 0.25 ? 0 : u < 0.42 ? smoothT((u - 0.25) / 0.17) : u < 0.55 ? 1 : 1 - smoothT((u - 0.55) / 0.15);
    rz += 0.15 * Math.sin(u * Math.PI); oy -= 0.01 * Math.sin(u * Math.PI);
  }
  if (PL.reloading && d.kind === 'bolt' && PL.reloadEmpty) { const u = PL.reloadT / PL.reloadDur; if (u > 0.75) { boltRot = 1; boltBack = u < 0.88 ? 1 : 0; } }
  VM.pivot.position.set(px + ox, py + oy, pz + oz);
  VM.pivot.rotation.set(rx, ry, rz);
  if (g.mag) { g.mag.position.set(0, -0.3 * magDrop, 0.04 * magDrop); g.mag.visible = magDrop < 0.98; }
  if (g.ch) g.ch.position.z = d.kind === 'semi' && !d.pistol ? 0.06 * PL.slideT : 0;
  if (g.bolt) { g.bolt.rotation.z = boltRot * 1.1; g.bolt.position.z = boltBack * 0.1; }
  if (g.slide) g.slide.position.z = PL.slideLocked ? 0.035 : PL.slideT * 0.035;
  // through the scope the model would only get in the way
  VM.root.visible = !(g.optic && PL.scopeA > 0.35);   // hand over to the scope view once it's mostly up
  // arms: IK to the grip and the support hand
  VM.root.updateMatrixWorld(true);
  g.group.updateMatrixWorld(true);
  _wq2.setFromRotationMatrix(g.group.matrixWorld);
  VM.arms.forEach(arm => {
    let mk = arm.side > 0 ? g.grip : (g.fore || g.grip);
    if (arm.side > 0 && g.boltKnob && (boltRot > 0.05 || boltBack > 0.05)) mk = g.boltKnob;
    if (!mk) return;
    mk.getWorldPosition(_wp);
    if (arm.side < 0 && d.melee) _wp.set(-0.2, -0.32, -0.25);   // free hand stays low
    else if (arm.side < 0 && magDrop > 0.3 && g.mag) { _wp.set(0, -0.2, -0.08); g.group.localToWorld(_wp); }
    arm.hand.position.copy(_wp); arm.hand.quaternion.copy(_wq2);
    if (arm.side < 0) arm.hand.rotateZ(d.pistol ? -0.3 : Math.PI);
    if (arm.side > 0 && mk === g.boltKnob) arm.hand.rotateX(-0.8);
    if (mk === g.boltKnob) _vp.set(0.005, -0.02, 0.05); else _vp.set(arm.side > 0 ? 0.015 : 0, -0.045 * (arm.side > 0 ? 1 : -1), 0.07);   // close the hand on the bolt knob
    _vp.applyQuaternion(arm.hand.quaternion).add(_wp);
    const shoulder = d.pistol ? new V3(arm.side * lerp(0.24, 0.17, a), lerp(-0.36, -0.5, a), lerp(0.08, -0.12, a)) : new V3(arm.side * 0.24, -0.36, 0.08);   // arms out straight for the pistol, below the sight line
    solve2(arm.upper, arm.lower, shoulder, _vp, _hintV.set(arm.side * 1.2, -1, 0.3).normalize(), arm.la, arm.lb, true);
  });
  if (VM.flashT > 0 && g.muzzle) { VM.flashT -= dt; g.muzzle.getWorldPosition(VM.flash.position); VM.flash.visible = true; VM.flashLight.position.copy(VM.flash.position); VM.flashLight.intensity = 4; }
  else { VM.flash.visible = false; VM.flashLight.intensity = 0; }
  VMCAM.fov = lerp(62, 50, a); VMCAM.updateProjectionMatrix();
}
// ---------- Life cycle ----------
function pickSpawn() { return safeSpawn(NET.myId); }
function respawn() {
  const s = pickSpawn();
  PL.pos.set(s.x, 0, s.z); PL.vel.set(0, 0, 0); PL.yaw = s.yaw !== undefined ? s.yaw + rand(-0.3, 0.3) : rand(0, TAU); PL.pitch = 0;
  PL.pos.y = supportY(s.x, s.z, (s.y || groundY(s.x, s.z)) + 0.5); PL.smoothY = PL.pos.y;
  PL.hp = 100; PL.armor = 50; PL.alive = true; PL.stance = 0; PL.eyeH = STANCE[0].eye; PL.reloading = false; PL.cycleT = 0; PL.adsT = 0; PL.meleeT = 0; PL.quickKnife = false;
  PL.spawnTime = performance.now();
  equipLoadout(LOADOUT);
  netRespawn();
  hudRespawn();
}
function playerDied(killerId) {
  PL.alive = false; PL.deathTime = performance.now(); PL.killerId = killerId; PL.reloading = false;
  PL.scoped = false; PL.adsT = 0; PL.ads = false; PL.adsToggle = false;
  VM.root.visible = false;
  fxBloodPool(PL.pos.clone());
}
function deathCam(dt) {
  // sink to the ground and look at whoever got you
  const t = (performance.now() - PL.deathTime) / 1000;
  // kill-cam (killcam.js) owns the camera while it plays (1); on the frame it hands back (2) snap straight onto the killer
  const kc = typeof kcTick === 'function' ? kcTick(dt) : 0;
  if (kc === 1) return;
  const k = REMOTES.get(PL.killerId);
  CAMERA.position.set(PL.pos.x, PL.smoothY + lerp(PL.eyeH, 0.3, smoothT(t / 0.6)) + smoothT((t - 0.8) / 2) * 2.2, PL.pos.z);
  if (k && k.state) { const tp = k.state.pos; const m = new THREE.Matrix4().lookAt(CAMERA.position, new V3(tp.x, tp.y + 1.2, tp.z), UP); const q = new THREE.Quaternion().setFromRotationMatrix(m); CAMERA.quaternion.slerp(q, kc === 2 ? 1 : 1 - Math.exp(-dt * 4)); }
  // zoom on the killer: you see where the shot came from
  const fov = k && k.state ? lerp(SETTINGS.fov, 25, smoothT((t - 0.8) / 1.5)) : SETTINGS.fov;
  if (Math.abs(CAMERA.fov - fov) > 0.05) { CAMERA.fov = fov; CAMERA.updateProjectionMatrix(); }
}
// Each player owns their own health: shooters send hits, the victim applies them and reports the death.
// Plates soak 25 each first, the rest comes off the hearts.
function takeDamage(dmg, fromId, zone, w) {
  if (!PL.alive) return;
  if (performance.now() - PL.spawnTime < 2500 && w !== 'fall') return;   // brief spawn protection
  const before = PL.armor;
  if (w === 'knife' || dmg >= 999) { PL.armor = 0; PL.hp = 0; }
  else {
    const soak = Math.min(PL.armor, dmg); PL.armor -= soak; PL.hp -= dmg - soak;
  }
  if (Math.ceil(PL.armor / 25) < Math.ceil(before / 25)) SFX.plateBreak(null);
  PL.lastHurt = performance.now();
  SFX.hurt(before > 0 && PL.armor < before); hudDamage(fromId);
  fxScreenBlood(clamp(dmg / 100, 0.2, 1));
  if (PL.hp <= 0) {
    PL.hp = 0; PL.deaths++;
    playerDied(fromId);
    netDied(fromId, w, zone === 'head');
    hudDeath(fromId, w, zone === 'head');
  }
}
function playerTick(dt) {
  if (PL.alive) {
    playerPhysics(dt); cameraTick(dt); weaponTick(dt); vmTick(dt);
    // a wounded heart knits back together, a lost heart stays lost
    const cap = Math.ceil(PL.hp / 25 - 1e-6) * 25;
    if (performance.now() - PL.lastHurt > 6000 && PL.hp < cap) PL.hp = Math.min(cap, PL.hp + 4 * dt);
    if (PL.pos.y < groundY(PL.pos.x, PL.pos.z) - 5) takeDamage(999, null, 'chest', 'fall');
  } else deathCam(dt);
  projTick(dt);
}
