'use strict';
// ---------- The local player: input, movement, camera, weapons, first-person view ----------
let CAMERA = null, VMCAM = null, VMSCENE = null;
const INPUT = { keys: {}, pressed: {}, mouse: { l: false, r: false, lPressed: false, rPressed: false }, dx: 0, dy: 0, wheel: 0, locked: false };
const R_PLAYER = 0.3, STEP = 0.48, H_STAND = 1.8, H_CROUCH = 1.25, EYE_STAND = 1.64, EYE_CROUCH = 1.1, GRAV = 18;
const PLAYER = {
  pos: new V3(), vel: new V3(), yaw: 0, pitch: 0, onGround: true, crouch: false, crouchT: 0, lean: 0, leanT: 0, smoothY: 0,
  hp: 100, alive: false, sprint: false, sprintT: 0, ads: false, adsT: 0, adsToggle: false,
  weapons: [], cur: 0, fireCD: 0, cycleT: 0, cycleDur: 0, reloadT: 0, reloadDur: 0, reloading: false, reloadKind: '', equipT: 0,
  recoilP: 0, recoilY: 0, kick: 0, bob: 0, stepDist: 0, lastHurt: -99, spawnTime: 0, killerId: null, deathTime: 0,
  swayX: 0, swayY: 0, outfit: 'ranger', skin: 0, kills: 0, deaths: 0, burst: 0, slideT: 0, triggerUp: true,
};
const PL = PLAYER;
function plHeight() { return PL.crouch ? H_CROUCH : H_STAND; }
function boxHits(x, z, y0, y1, r = R_PLAYER) {
  for (let i = 0; i < COLL.length; i++) { const c = COLL[i]; if (!c.solid) continue; if (c.y1 > y0 && c.y0 < y1 && x + r > c.x0 && x - r < c.x1 && z + r > c.z0 && z - r < c.z1) return c; }
  return null;
}
// ---------- Movement and collision ----------
function moveAxis(axis, amt) {
  if (amt === 0) return;
  const p = PL.pos; p[axis] += amt;
  const feet = p.y, head = p.y + plHeight();
  for (let i = 0; i < COLL.length; i++) {
    const c = COLL[i]; if (!c.solid) continue;
    if (c.y1 <= feet + (PL.onGround ? STEP : 0.05) || c.y0 >= head) continue;
    if (p.x + R_PLAYER > c.x0 && p.x - R_PLAYER < c.x1 && p.z + R_PLAYER > c.z0 && p.z - R_PLAYER < c.z1) {
      if (axis === 'x') p.x = amt > 0 ? c.x0 - R_PLAYER - 1e-4 : c.x1 + R_PLAYER + 1e-4;
      else p.z = amt > 0 ? c.z0 - R_PLAYER - 1e-4 : c.z1 + R_PLAYER + 1e-4;
      PL.vel[axis] = 0;
    }
  }
}
function supportY(x, z, maxTop) {
  let best = 0;
  for (let i = 0; i < COLL.length; i++) {
    const c = COLL[i]; if (!c.solid) continue;
    if (c.y1 > maxTop || c.y1 <= best) continue;
    if (x + R_PLAYER - 0.04 > c.x0 && x - R_PLAYER + 0.04 < c.x1 && z + R_PLAYER - 0.04 > c.z0 && z - R_PLAYER + 0.04 < c.z1) best = c.y1;
  }
  return best;
}
function playerPhysics(dt) {
  const k = INPUT.keys, p = PL.pos, v = PL.vel;
  // crouch toggle (C) — standing up needs head room
  if (INPUT.pressed.KeyC || INPUT.pressed.ControlLeft) {
    if (PL.crouch) { if (!boxHits(p.x, p.z, p.y + H_CROUCH, p.y + H_STAND, R_PLAYER - 0.02)) PL.crouch = false; }
    else PL.crouch = true;
  }
  const fwd = (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0), str = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0);
  const w = PL.weapons[PL.cur], def = w ? w.def : null;
  PL.sprint = !!(k.ShiftLeft || k.ShiftRight) && fwd > 0 && !PL.ads && PL.onGround && !(PL.reloading && false);
  if (PL.sprint && PL.crouch) { if (!boxHits(p.x, p.z, p.y + H_CROUCH, p.y + H_STAND, R_PLAYER - 0.02)) PL.crouch = false; else PL.sprint = false; }
  let speed = PL.sprint ? 6.3 : PL.crouch ? 2.1 : 4.1;
  if (PL.ads) speed *= 0.62;
  if (def) speed *= def.move;
  const sy = Math.sin(PL.yaw), cy = Math.cos(PL.yaw);
  let wx = -sy * fwd + cy * str, wz = -cy * fwd - sy * str;
  const wl = Math.hypot(wx, wz); if (wl > 0) { wx /= wl; wz /= wl; }
  const accel = PL.onGround ? 1 - Math.exp(-dt * 11) : 1 - Math.exp(-dt * 1.5);
  v.x = lerp(v.x, wx * speed, accel); v.z = lerp(v.z, wz * speed, accel);
  if (INPUT.pressed.Space && PL.onGround) {
    if (PL.crouch) { if (!boxHits(p.x, p.z, p.y + H_CROUCH, p.y + H_STAND, R_PLAYER - 0.02)) PL.crouch = false; }
    else { v.y = 5.0; PL.onGround = false; }
  }
  // horizontal, one axis at a time, in small steps so fast movement never tunnels
  const steps = Math.ceil(Math.max(Math.abs(v.x), Math.abs(v.z)) * dt / 0.2) || 1;
  for (let s = 0; s < steps; s++) { moveAxis('x', v.x * dt / steps); moveAxis('z', v.z * dt / steps); }
  // vertical
  const oldY = p.y; v.y -= GRAV * dt; let ny = p.y + v.y * dt;
  if (v.y > 0) {
    const h = plHeight();
    for (const c of COLL) if (c.solid && c.y0 >= oldY + h - 0.05 && c.y0 < ny + h && p.x + R_PLAYER > c.x0 && p.x - R_PLAYER < c.x1 && p.z + R_PLAYER > c.z0 && p.z - R_PLAYER < c.z1) { ny = c.y0 - h; v.y = 0; }
  }
  const sup = supportY(p.x, p.z, oldY + (PL.onGround ? STEP : 0.06));
  const wasGround = PL.onGround;
  if (ny <= sup) { if (!wasGround && v.y < -7) SFX.land(null); ny = sup; v.y = 0; PL.onGround = true; }
  else if (wasGround && v.y <= 0 && oldY - sup <= STEP + 0.02) { ny = sup; v.y = 0; PL.onGround = true; }   // stick to stairs going down
  else PL.onGround = false;
  p.y = ny;
  // keep inside the walls
  p.x = clamp(p.x, -MAP.half + 0.4, MAP.half - 0.4); p.z = clamp(p.z, -MAP.half + 0.4, MAP.half - 0.4);
  if (p.y < -5) { p.y = 0; }
  // smooth the camera over steps
  PL.smoothY = PL.onGround && Math.abs(PL.smoothY - p.y) < 0.6 ? lerp(PL.smoothY, p.y, 1 - Math.exp(-dt * 18)) : p.y;
  // footsteps
  const hs = Math.hypot(v.x, v.z);
  if (PL.onGround && hs > 0.5) {
    PL.stepDist += hs * dt;
    const stride = PL.sprint ? 2.1 : PL.crouch ? 1.4 : 1.75;
    if (PL.stepDist > stride) { PL.stepDist = 0; SFX.step(null, surfaceAt(p.x, p.z, p.y), PL.crouch ? 0.35 : PL.sprint ? 1 : 0.7); }
  }
  PL.bob += hs * dt * (PL.sprint ? 1.25 : 1.5);
}
// ---------- Weapons ----------
function makeWeapon(id, mods) {
  const def = WEAPONS[id];
  return { id, def, mods: Object.assign({}, def.def, mods || {}), ammo: def.mag, reserve: def.reserve, mode: def.modes[0], chambered: true };
}
function equipLoadout(lo) {
  PL.weapons = [makeWeapon(lo.primary, lo.mods[lo.primary]), makeWeapon('glock', { muzzle: lo.glockMuzzle, optic: 'iron' })];
  PL.cur = 0; buildViewmodel(); PL.equipT = 0.5;
}
function curW() { return PL.weapons[PL.cur]; }
function switchWeapon(i) {
  if (i === PL.cur || !PL.weapons[i] || !PL.alive) return;
  PL.cur = i; PL.reloading = false; PL.cycleT = 0; PL.equipT = 0.45; buildViewmodel(); SFX.mech('equip');
  const w = curW(); if (w.needsCycle) { w.needsCycle = false; }
}
function startReload() {
  const w = curW(); if (!w || PL.reloading || PL.equipT > 0 || PL.cycleT > 0) return;
  const d = w.def;
  if (w.ammo >= d.mag || w.reserve <= 0) return;
  PL.reloading = true; PL.reloadT = 0; PL.reloadStage = 0;
  if (d.perRound) { PL.reloadKind = 'round'; PL.reloadDur = d.reload; PL.reloadOpen = d.kind === 'bolt' ? 0.35 : 0; PL.reloadEmpty = w.ammo === 0; }
  else { PL.reloadKind = 'mag'; PL.reloadEmpty = w.ammo === 0; PL.reloadDur = PL.reloadEmpty ? d.reloadEmpty : d.reload; }
}
function reloadTick(dt) {
  const w = curW(); if (!PL.reloading || !w) return;
  const d = w.def; PL.reloadT += dt;
  if (PL.reloadKind === 'mag') {
    const u = PL.reloadT / PL.reloadDur;
    if (PL.reloadStage === 0 && u > 0.22) { PL.reloadStage = 1; SFX.mech('magOut'); }
    if (PL.reloadStage === 1 && u > 0.6) { PL.reloadStage = 2; SFX.mech('magIn'); }
    if (PL.reloadStage === 2 && PL.reloadEmpty && u > 0.82) { PL.reloadStage = 3; SFX.mech('bolt'); }
    if (u >= 1) {
      const want = d.mag + (w.ammo > 0 ? 1 : 0) - w.ammo, take = Math.min(want, w.reserve);   // +1 in the chamber on a tactical reload
      w.ammo += take; w.reserve -= take; PL.reloading = false;
    }
  } else {
    // one round at a time; firing interrupts
    const open = PL.reloadOpen, t = PL.reloadT - open;
    if (PL.reloadStage === 0) { if (open > 0) SFX.mech('boltUp'); PL.reloadStage = 1; }
    if (t >= d.reload) {
      PL.reloadT -= d.reload;
      if (w.ammo < d.mag && w.reserve > 0) { w.ammo++; w.reserve--; SFX.mech('shell'); }
      if (w.ammo >= d.mag || w.reserve <= 0) {
        PL.reloading = false;
        if (d.kind === 'bolt') { SFX.mech('boltFwd'); }
        else if (PL.reloadEmpty) { PL.cycleT = d.cycle; PL.cycleDur = d.cycle; PL.cycleSnd = 0; }
      }
    }
  }
}
const _sd = new V3(), _sr = new V3(), _su = new V3(), _so = new V3();
function fireWeapon() {
  const w = curW(), d = w.def;
  w.ammo--; PL.fireCD = Math.max(PL.fireCD, -1 / 60) + 60 / d.rpm; PL.slideT = 1;   // carry the leftover time so the fire rate doesn't depend on frame rate
  if (d.kind === 'pump' || d.kind === 'bolt') { PL.cycleT = d.cycle; PL.cycleDur = d.cycle; PL.cycleSnd = 0; }
  // spread grows with movement, jumping, hip fire
  const moving = Math.hypot(PL.vel.x, PL.vel.z) > 1;
  let spread = lerp(d.spreadHip, d.spreadAds, PL.adsT) * (moving ? 1.6 : 1) * (PL.crouch ? 0.8 : 1) * (PL.onGround ? 1 : 2.5);
  if (d.pellets) spread = lerp(d.spreadHip, d.spreadAds, PL.adsT);
  CAMERA.getWorldDirection(_sd); _so.copy(CAMERA.position);
  _sr.set(1, 0, 0).applyQuaternion(CAMERA.quaternion); _su.set(0, 1, 0).applyQuaternion(CAMERA.quaternion);
  const n = d.pellets || 1; let firstEnd = null;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * spread * Math.PI / 180;
    const dir = _sd.clone().addScaledVector(_sr, Math.cos(a) * Math.tan(r)).addScaledVector(_su, Math.sin(a) * Math.tan(r)).normalize();
    const hit = traceShot(_so, dir, 700);
    const end = _so.clone().addScaledVector(dir, hit ? hit.t : 700);
    if (!firstEnd) firstEnd = end;
    if (hit && hit.player) {
      const dist = hit.t, fall = dist <= d.range[0] ? 1 : dist >= d.range[1] ? d.range[2] : lerp(1, d.range[2], (dist - d.range[0]) / (d.range[1] - d.range[0]));
      const mul = hit.zone === 'head' ? (d.kind === 'bolt' ? 3 : 2.4) : hit.zone === 'legs' ? 0.75 : 1;
      const dmg = Math.round(d.dmg * fall * mul);
      netHit(hit.player, dmg, hit.zone, w.id);
      fxImpact(end, [-dir.x, -dir.y, -dir.z], 'flesh');
      hudHit(hit.zone === 'head');
    } else if (hit) { fxImpact(end, hit.n, hit.c.mat); if (i === 0) SFX.impact(end, hit.c.mat); }
  }
  // recoil: part of it climbs the view for good, part is a kick that settles
  const rv = d.recoil.v * (PL.crouch ? 0.85 : 1) * (PL.adsT > 0.5 ? 0.85 : 1) * Math.PI / 180, rh = d.recoil.h * Math.PI / 180;
  const climb = PL.burst > 6 ? 0.45 : 0.6;
  PL.pitch = clamp(PL.pitch + rv * climb, -1.5, 1.5); PL.yaw += rand(-rh, rh) * 0.6;
  PL.recoilP += rv * (1 - climb); PL.recoilY += rand(-rh, rh) * 0.4;
  PL.kick = Math.min(1.5, PL.kick + (d.kind === 'bolt' || d.kind === 'pump' ? 1.4 : 0.55));
  PL.burst++;
  const m = VM.gun, supp = m && m.supp;
  SFX.shot(d.snd, null, supp);
  vmMuzzleFlash(supp, d.pellets ? 1.4 : 1);
  if (d.kind !== 'pump' && d.kind !== 'bolt') vmEject();
  // what other players see and hear
  const muzzleWorld = _so.clone().addScaledVector(_sd, 0.6).addScaledVector(_sr, 0.12 * (1 - PL.adsT)).addScaledVector(_su, -0.08 * (1 - PL.adsT));
  if (!supp || Math.random() < 0.3) fxTracer(muzzleWorld, firstEnd);
  netShot(_so, firstEnd, w.id, supp);
  if (w.ammo === 0 && d.kind === 'semi' && m && m.slide) PL.slideLocked = true;
}
// Ray against the world and every other player's hitboxes. Returns the nearest hit.
function traceShot(o, d, maxT) {
  const wh = rayWorld(o, d, maxT, true);
  let best = wh ? wh.t : maxT, res = wh;
  REMOTES.forEach((r, id) => {
    if (!r.alive || !r.state) return;
    const st = r.state;
    operatorHitboxes(st.pos, st.crouch, st.lean, st.yaw).forEach(hb => {
      const t = hb.type === 's' ? raySphere(o, d, hb.x, hb.y, hb.z, hb.r) : rayCapsule(o, d, hb.x, hb.y0, hb.y1, hb.z, hb.r);
      if (t >= 0 && t < best) { best = t; res = { t, player: id, zone: hb.zone }; }
    });
  });
  return res;
}
function weaponTick(dt) {
  const w = curW(); if (!w) return;
  const d = w.def;
  PL.fireCD -= dt; PL.equipT = Math.max(0, PL.equipT - dt); PL.slideT = Math.max(0, PL.slideT - dt * 14);
  // ADS
  if (SETTINGS.aimMode === 'toggle') { if (INPUT.mouse.rPressed) PL.adsToggle = !PL.adsToggle; PL.ads = PL.adsToggle; }
  else PL.ads = INPUT.mouse.r;
  if (PL.sprint || PL.equipT > 0.2 || (PL.reloading && PL.reloadKind === 'mag')) PL.ads = false;
  if (!PL.ads) PL.adsToggle = PL.adsToggle && !PL.sprint;
  const adsSpeed = 1 / (d.adsTime * (VM.gun ? VM.gun.optic.adsMul : 1));
  PL.adsT = clamp(PL.adsT + (PL.ads ? dt : -dt) * adsSpeed, 0, 1);
  PL.sprintT = clamp(PL.sprintT + (PL.sprint ? dt : -dt) * 5, 0, 1);
  // bolt / pump cycling
  if (PL.cycleT > 0) {
    PL.cycleT -= dt; const u = 1 - PL.cycleT / PL.cycleDur;
    if (d.kind === 'pump') { if (PL.cycleSnd === 0 && u > 0.15) { PL.cycleSnd = 1; SFX.mech('pumpBack'); vmEject(true); } if (PL.cycleSnd === 1 && u > 0.55) { PL.cycleSnd = 2; SFX.mech('pumpFwd'); } }
    if (d.kind === 'bolt') { if (PL.cycleSnd === 0 && u > 0.1) { PL.cycleSnd = 1; SFX.mech('boltUp'); } if (PL.cycleSnd === 1 && u > 0.28) { PL.cycleSnd = 2; SFX.mech('boltBack'); vmEject(); } if (PL.cycleSnd === 2 && u > 0.6) { PL.cycleSnd = 3; SFX.mech('boltFwd'); } }
    if (PL.cycleT <= 0) PL.cycleT = 0;
  }
  reloadTick(dt);
  // trigger
  const trig = INPUT.mouse.l && INPUT.locked;
  if (!trig) { PL.triggerUp = true; PL.burst = Math.max(0, PL.burst - dt * 20); }
  const canShoot = PL.alive && PL.equipT <= 0 && PL.sprintT < 0.3 && PL.fireCD <= 0 && PL.cycleT <= 0;
  if (trig && canShoot) {
    const auto = w.mode === 'auto';
    if (auto || PL.triggerUp) {
      if (PL.reloading && PL.reloadKind === 'round' && w.ammo > 0) { PL.reloading = false; if (d.kind === 'bolt') SFX.mech('boltFwd'); }
      if (!PL.reloading) {
        if (w.ammo > 0) fireWeapon();
        else { if (PL.triggerUp) SFX.mech('empty'); PL.fireCD = 0.25; startReload(); }
      }
      PL.triggerUp = false;
    }
  }
  if (w.ammo > 0) PL.slideLocked = false;
  PL.kick = Math.max(0, PL.kick - dt * 7);
  PL.recoilP *= Math.exp(-dt * 9); PL.recoilY *= Math.exp(-dt * 9);
  if (INPUT.pressed.KeyR) startReload();
  if (INPUT.pressed.KeyB && d.modes.length > 1) { const i = d.modes.indexOf(w.mode); w.mode = d.modes[(i + 1) % d.modes.length]; SFX.mech('select'); }
  if (INPUT.pressed.Digit1) switchWeapon(0);
  if (INPUT.pressed.Digit2) switchWeapon(1);
  if (INPUT.wheel) { switchWeapon((PL.cur + (INPUT.wheel > 0 ? 1 : 1)) % PL.weapons.length); }
}
// ---------- Camera ----------
function cameraTick(dt) {
  // mouse look
  const sens = SETTINGS.sens * 0.0022 * (PL.adsT > 0.5 ? SETTINGS.adsSens * (CAMERA.fov / SETTINGS.fov) : 1);
  PL.yaw -= INPUT.dx * sens; PL.pitch -= INPUT.dy * sens * (SETTINGS.invert ? -1 : 1);
  PL.pitch = clamp(PL.pitch, -1.52, 1.52);
  PL.swayX = lerp(PL.swayX, clamp(INPUT.dx * 0.02, -1, 1), 1 - Math.exp(-dt * 10)); PL.swayY = lerp(PL.swayY, clamp(INPUT.dy * 0.02, -1, 1), 1 - Math.exp(-dt * 10));
  // lean (Q/E), stopped by walls
  const lt = (INPUT.keys.KeyE ? 1 : 0) - (INPUT.keys.KeyQ ? 1 : 0);
  PL.lean = lerp(PL.lean, PL.sprint ? 0 : lt, 1 - Math.exp(-dt * 10));
  const eye = lerp(EYE_STAND, EYE_CROUCH, PL.crouchT);
  PL.crouchT = lerp(PL.crouchT, PL.crouch ? 1 : 0, 1 - Math.exp(-dt * 12));
  const rx = Math.cos(PL.yaw), rz = -Math.sin(PL.yaw);
  let lean = PL.lean;
  if (Math.abs(lean) > 0.01) {
    const o = new V3(PL.pos.x, PL.smoothY + eye, PL.pos.z), d = new V3(rx * Math.sign(lean), 0, rz * Math.sign(lean));
    const h = rayWorld(o, d, 0.6, false); if (h) lean = Math.sign(lean) * Math.min(Math.abs(lean), Math.max(0, (h.t - 0.2) / 0.4));
  }
  PL.leanEff = lean;
  CAMERA.position.set(PL.pos.x + rx * lean * 0.4, PL.smoothY + eye - Math.abs(lean) * 0.06, PL.pos.z + rz * lean * 0.4);
  const bobAmt = PL.onGround ? Math.min(1, Math.hypot(PL.vel.x, PL.vel.z) / 5) * (1 - PL.adsT * 0.8) : 0;
  CAMERA.position.y += Math.sin(PL.bob * 2) * 0.025 * bobAmt;
  CAMERA.rotation.order = 'YXZ';
  CAMERA.rotation.set(PL.pitch + PL.recoilP, PL.yaw + PL.recoilY, -lean * 0.14 + Math.sin(PL.bob) * 0.004 * bobAmt);
  // FOV: zoom when aiming, more through a scope
  const g = VM.gun, optFov = g ? g.optic.fov : 0.85;
  const scopeIn = g && g.optic.scope && PL.adsT > 0.85;
  const fov = scopeIn ? SETTINGS.fov * optFov : SETTINGS.fov * lerp(1, g && g.optic.scope ? 0.9 : optFov, PL.adsT) * (1 + PL.sprintT * 0.04);
  if (Math.abs(CAMERA.fov - fov) > 0.01) { CAMERA.fov = scopeIn ? fov : lerp(CAMERA.fov, fov, 1 - Math.exp(-dt * 18)); CAMERA.updateProjectionMatrix(); }
  PL.scoped = scopeIn;
}
// ---------- First-person viewmodel ----------
const VM = { root: null, pivot: null, gun: null, arms: [], flash: null, flashT: 0 };
function vmInit() {
  VMSCENE = new THREE.Scene();
  VMCAM = new THREE.PerspectiveCamera(62, 1, 0.01, 10);
  VMSCENE.add(new THREE.HemisphereLight(0xdfe8ff, 0x4a4030, 0.75));
  const sun = new THREE.DirectionalLight(0xfff0d8, 1.25); sun.position.set(-0.5, 1, 0.4); VMSCENE.add(sun);
  const fill = new THREE.DirectionalLight(0x9ab0d0, 0.35); fill.position.set(0.6, 0.2, 1); VMSCENE.add(fill);
  VM.root = new THREE.Group(); VMSCENE.add(VM.root);
  VM.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  VM.flash.visible = false; VMSCENE.add(VM.flash);
  VM.flashLight = new THREE.PointLight(0xffb060, 0, 1.5, 2); VMSCENE.add(VM.flashLight);
}
function buildViewmodel() {
  if (VM.pivot) VM.root.remove(VM.pivot);
  VM.arms.forEach(a => { VM.root.remove(a.upper); VM.root.remove(a.lower); VM.root.remove(a.hand); });
  const w = curW(); if (!w) return;
  VM.pivot = new THREE.Group(); VM.root.add(VM.pivot);
  VM.gun = buildGun(w.id, w.mods, false); VM.pivot.add(VM.gun.group);
  const mats = charMats(PL.outfit, PL.skin);
  VM.arms = [buildArm(VM.root, mats, 1, true), buildArm(VM.root, mats, -1, true)];
  VM.arms.forEach(a => [a.upper, a.lower, a.hand].forEach(o => o.traverse(m => { if (m.isMesh) m.frustumCulled = false; })));
}
function vmMuzzleFlash(supp, big) {
  if (!VM.gun || supp) return;
  VM.flashT = 0.045; VM.flash.material.rotation = Math.random() * TAU; VM.flash.scale.setScalar(0.12 * big * rand(0.8, 1.2));
  FX.flashLight.position.copy(CAMERA.position); FX.flashLight.intensity = 2.5; FX.flashT = 0.05;
}
function vmEject(shotgun) {
  if (!VM.gun) return;
  const p = new V3(); VM.gun.eject.getWorldPosition(p);
  fxBrass(VMSCENE, p, new V3(1, 0, 0.2), new V3(0, 1, 0), shotgun);
}
const _vp = new V3(), _vq = new THREE.Quaternion(), _wp = new V3(), _wq2 = new THREE.Quaternion(), _hintV = new V3();
function vmTick(dt) {
  const w = curW(), g = VM.gun; if (!w || !g) return;
  const d = w.def, a = smoothT(PL.adsT), sp = PL.sprintT;
  // base pose: hip → aim down sights
  const hip = d.hip;
  const px = lerp(hip[0], 0, a), py = lerp(hip[1], -g.sightY, a), pz = lerp(hip[2], -g.eyeZ, a);
  let rx = 0, ry = lerp(0.03, 0, a), rz = lerp(0.02, 0, a), ox = 0, oy = 0, oz = 0;
  // bob and sway
  const bobAmt = PL.onGround ? Math.min(1, Math.hypot(PL.vel.x, PL.vel.z) / 5) : 0;
  const bk = (1 - a * 0.85) * bobAmt;
  ox += Math.sin(PL.bob) * 0.011 * bk; oy += -Math.abs(Math.cos(PL.bob)) * 0.009 * bk;
  ry += -PL.swayX * 0.05 * (1 - a * 0.7); rx += -PL.swayY * 0.04 * (1 - a * 0.7);
  ox += -PL.swayX * 0.006; oy += PL.swayY * 0.006;
  // idle breathing
  const tnow = performance.now() / 1000; oy += Math.sin(tnow * 1.4) * 0.0015 * (1 - a * 0.6); rx += Math.sin(tnow * 1.1) * 0.003 * (1 - a * 0.5);
  // sprint: gun tilted down and across
  rx += -0.55 * sp * (d.pistol ? 1.3 : 1); ry += 0.6 * sp; rz += 0.25 * sp; ox += -0.04 * sp; oy += -0.03 * sp; oz += 0.04 * sp;
  // recoil kick
  const kk = PL.kick;
  oz += kk * 0.035; rx += kk * 0.05 * (1 - a * 0.4); oy += kk * 0.004;
  // equip
  oy -= PL.equipT * 0.6; rx -= PL.equipT * 1.2;
  // reload: tilt the gun to the side, drop the mag and bring a new one up
  let magDrop = 0, chPull = 0;
  if (PL.reloading && PL.reloadKind === 'mag') {
    const u = PL.reloadT / PL.reloadDur, env = smoothT(u / 0.15) * (1 - smoothT((u - 0.85) / 0.15));
    rz += 0.55 * env; rx += 0.2 * env; oy -= 0.025 * env; ox -= 0.02 * env;
    magDrop = u < 0.22 ? 0 : u < 0.4 ? smoothT((u - 0.22) / 0.18) : u < 0.5 ? 1 : u < 0.62 ? 1 - smoothT((u - 0.5) / 0.12) : 0;
    if (PL.reloadEmpty && u > 0.8) chPull = Math.sin(clamp((u - 0.8) / 0.15, 0, 1) * Math.PI);
  } else if (PL.reloading) {
    const env = smoothT(PL.reloadT / 0.2); rz += 0.35 * env; rx += 0.15 * env; oy -= 0.02 * env;
  }
  // bolt / pump cycling
  let boltRot = 0, boltBack = 0, pumpBack = 0;
  if (PL.cycleT > 0) {
    const u = 1 - PL.cycleT / PL.cycleDur;
    if (d.kind === 'bolt') {
      boltRot = u < 0.1 ? 0 : u < 0.25 ? smoothT((u - 0.1) / 0.15) : u < 0.7 ? 1 : 1 - smoothT((u - 0.7) / 0.15);
      boltBack = u < 0.25 ? 0 : u < 0.42 ? smoothT((u - 0.25) / 0.17) : u < 0.55 ? 1 : 1 - smoothT((u - 0.55) / 0.15);
      rz += 0.15 * Math.sin(u * Math.PI); oy -= 0.01 * Math.sin(u * Math.PI);
    } else if (d.kind === 'pump') {
      pumpBack = u < 0.12 ? 0 : u < 0.4 ? smoothT((u - 0.12) / 0.28) : u < 0.5 ? 1 : 1 - smoothT((u - 0.5) / 0.3);
      rz += 0.06 * Math.sin(u * Math.PI);
    }
  }
  if (PL.reloading && d.kind === 'bolt') { boltRot = 1; boltBack = 1; }
  VM.pivot.position.set(px + ox, py + oy, pz + oz);
  VM.pivot.rotation.set(rx, ry, rz);
  if (g.mag) { g.mag.position.set(0, -0.28 * magDrop, 0.04 * magDrop); g.mag.visible = magDrop < 0.98; }
  if (g.ch) g.ch.position.z = 0.08 * chPull + (d.kind === 'auto' && PL.slideT > 0 && w.id === 'ak74' ? 0.07 * PL.slideT : 0);
  if (g.bolt) { g.bolt.rotation.z = boltRot * 1.35; g.bolt.position.z = boltBack * 0.09; }
  if (g.pump) g.pump.position.z = pumpBack * 0.075;
  if (g.slide) g.slide.position.z = PL.slideLocked ? 0.03 : PL.slideT * 0.03;
  // scope: hide the model once you're looking through the glass
  VM.root.visible = !PL.scoped;
  // arms: IK to the grip and the support hand
  VM.root.updateMatrixWorld(true);
  g.group.updateMatrixWorld(true);
  _wq2.setFromRotationMatrix(g.group.matrixWorld);
  VM.arms.forEach(arm => {
    let mk = arm.side > 0 ? g.grip : g.fore;
    if (arm.side > 0 && g.boltKnob && (boltRot > 0.05 || boltBack > 0.05 || (PL.reloading && d.kind === 'bolt'))) mk = g.boltKnob;
    mk.getWorldPosition(_wp);
    if (arm.side < 0 && magDrop > 0.3 && g.mag) { _wp.set(0, -0.18, -0.08); g.group.localToWorld(_wp); }   // support hand goes to fetch the mag
    arm.hand.position.copy(_wp); arm.hand.quaternion.copy(_wq2);
    if (arm.side < 0) arm.hand.rotateZ(d.pistol ? -0.3 : Math.PI);
    if (arm.side > 0 && mk === g.boltKnob) arm.hand.rotateX(-0.8);
    _vp.set(arm.side > 0 ? 0.015 : 0, -0.045 * (arm.side > 0 ? 1 : -1), 0.07).applyQuaternion(arm.hand.quaternion).add(_wp);
    const shoulder = new V3(arm.side * 0.24, -0.36, 0.08);
    solve2(arm.upper, arm.lower, shoulder, _vp, _hintV.set(arm.side * 1.2, -1, 0.3).normalize(), arm.la, arm.lb, true);
  });
  // muzzle flash
  if (VM.flashT > 0) { VM.flashT -= dt; g.muzzle.getWorldPosition(VM.flash.position); VM.flash.visible = true; VM.flashLight.position.copy(VM.flash.position); VM.flashLight.intensity = 4; }
  else { VM.flash.visible = false; VM.flashLight.intensity = 0; }
  VMCAM.fov = lerp(62, 50, a); VMCAM.updateProjectionMatrix();
}
// ---------- Life cycle ----------
function pickSpawn() {
  const others = []; REMOTES.forEach(r => { if (r.alive && r.state) others.push(r.state.pos); });
  const scored = MAP.spawns.map(s => { let md = 999; others.forEach(o => { md = Math.min(md, Math.hypot(o.x - s.x, o.z - s.z)); }); return { s, md: md + Math.random() * 8 }; });
  scored.sort((a, b) => b.md - a.md);
  return scored[Math.floor(Math.random() * Math.min(scored.length, others.length ? 4 : scored.length))].s;
}
function respawn() {
  const s = pickSpawn();
  PL.pos.set(s.x, 0, s.z); PL.vel.set(0, 0, 0); PL.smoothY = 0; PL.yaw = Math.atan2(s.x, s.z) + rand(-0.4, 0.4); PL.pitch = 0;
  PL.pos.y = supportY(s.x, s.z, 0.5);
  PL.hp = 100; PL.alive = true; PL.crouch = false; PL.reloading = false; PL.cycleT = 0; PL.adsT = 0; PL.spawnTime = performance.now();
  equipLoadout(LOADOUT);
  netRespawn();
  hudRespawn();
}
function playerDied(killerId) {
  PL.alive = false; PL.deathTime = performance.now(); PL.killerId = killerId; PL.reloading = false;
  VM.root.visible = false;
}
function deathCam(dt) {
  // drift up and look at whoever got you
  const t = (performance.now() - PL.deathTime) / 1000;
  const k = REMOTES.get(PL.killerId);
  CAMERA.position.set(PL.pos.x, PL.smoothY + lerp(1.6, 0.4, smoothT(t / 0.6)) + smoothT((t - 0.6) / 2) * 2.5, PL.pos.z);
  if (k && k.state) { const tp = k.state.pos; const m = new THREE.Matrix4().lookAt(CAMERA.position, new V3(tp.x, tp.y + 1.4, tp.z), UP); const q = new THREE.Quaternion().setFromRotationMatrix(m); CAMERA.quaternion.slerp(q, 1 - Math.exp(-dt * 4)); }
  if (CAMERA.fov !== SETTINGS.fov) { CAMERA.fov = SETTINGS.fov; CAMERA.updateProjectionMatrix(); }
}
// Each player owns their own health: shooters send hits, the victim applies them and reports the death
function takeDamage(dmg, fromId, zone, w) {
  if (!PL.alive) return;
  if (performance.now() - PL.spawnTime < 1500 && w !== 'fall') return;   // brief spawn protection
  PL.hp -= dmg; PL.lastHurt = performance.now();
  SFX.hurt(); hudDamage(fromId);
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
    // slow regeneration after a few seconds without damage (each player owns their own health)
    if (performance.now() - PL.lastHurt > 5000 && PL.hp < 100) PL.hp = Math.min(100, PL.hp + 8 * dt);
    if (PL.pos.y < -3) takeDamage(999, null, 'chest', 'fall');
  } else deathCam(dt);
}
