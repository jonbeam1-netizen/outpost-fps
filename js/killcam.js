'use strict';
// ---------- Kill-cam: ride the round that killed you, in slow motion ----------
// Camera-only. Nothing here touches the simulation: no projectiles, no hits, no net messages. Other players,
// bots and every real round keep running in real time; we only borrow CAMERA for ~2.8 s while you're dead.
// Hooks: net.js remoteShot → kcRecordShot (every remote/bot shot), ui.js hudDeath → kcBegin, ui.js hudRespawn → kcEnd,
// player.js deathCam → kcTick (returns 1 while it owns the camera, 2 on the frame it hands back).
const KC = {
  enabled: true, delay: 0.6, travel: 1.95, hold: 0.55,   // seconds: normal death cam first, then the flight, then the hit
  shots: new Map(),   // shooter id → last few shots [{o, v, w, s, t}]
  on: false, armed: false, skip: false, path: null, h: null, body: null, bodyKey: '', st: null, hitDone: false, lastTick: 0,
};
const _kcA = new V3(), _kcB = new V3(), _kcD = new V3(), _kcS = new V3(), _kcU = new V3(), _kcC = new V3(), _kcL = new V3(), _kcM = new THREE.Matrix4();

// remember what each shooter fired last (net.js remoteShot sees every shot that isn't ours: players and host bots)
function kcRecordShot(id, o, v, w, supp) {
  if (!id || !o || !v) return;
  let a = KC.shots.get(id); if (!a) KC.shots.set(id, a = []);
  a.push({ o: o.clone(), v: v.clone(), w, s: !!supp, t: performance.now() });
  if (a.length > 4) a.shift();
}
// Fly a shot the same way player.js does (gravity only, no drag) and find where it came closest to us.
// Returns the sampled path, or null if this round can't have been the one that killed us.
function kcSolve(sh, aim, deathAt) {
  const pts = [], dt = 1 / 500, p = sh.o.clone(), v = sh.v.clone();
  let best = Infinity, bi = 0, t = 0;
  for (let i = 0; i < 1750; i++) {   // 3.5 s, the projectile's life
    pts.push(p.clone());
    const d = p.distanceTo(aim); if (d < best) { best = d; bi = i; } else if (d > best + 30) break;
    p.addScaledVector(v, dt); v.y -= BULLET_G * dt; t += dt;
  }
  if (best > 3) return null;   // didn't pass anywhere near us
  const T = bi * dt, lag = (deathAt - sh.t) / 1000 - T;   // when it got here vs when we died (net latency on top)
  if (lag < -0.4 || lag > 2.5) return null;
  pts.length = bi + 1;
  return { pts, T, dt, o: sh.o.clone(), v0: sh.v.clone(), end: pts[bi], len: sh.o.distanceTo(pts[bi]), drop: 0.5 * BULLET_G * T * T };
}
// position along the path at flight time τ (linear between samples)
function kcAt(path, tau, out) {
  const f = clamp(tau / path.dt, 0, path.pts.length - 1), i = Math.floor(f), j = Math.min(i + 1, path.pts.length - 1);
  return out.copy(path.pts[i]).lerp(path.pts[j], f - i);
}

// called when the death screen goes up (ui.js hudDeath). Decide now whether there's a kill-cam to play.
function kcBegin(killerId, w, hs) {
  kcEnd();
  KC.armed = false; KC.path = null;
  if (!KC.enabled || !killerId || killerId === NET.myId || w === 'fall') return;
  const def = WEAPONS[w]; if (!def || def.melee) return;   // knife: just the normal death cam
  const head = !!hs, stance = PL.stance | 0;
  // where it hit us: head at eye height, otherwise the chest (prone bodies are low and long: aim at the middle)
  const aim = new V3(PL.pos.x, PL.smoothY + (head ? PL.eyeH : stance === 2 ? 0.25 : PL.eyeH * 0.78), PL.pos.z);
  const list = KC.shots.get(killerId) || [];
  for (let i = list.length - 1; i >= 0 && !KC.path; i--) KC.path = kcSolve(list[i], aim, PL.deathTime);
  if (!KC.path) return;   // nothing recorded (or it doesn't line up): the normal death cam
  if (def.pistol && KC.path.len < 40) { KC.path = null; return; }   // a close-range Deagle kill isn't worth a replay
  const cw = curW();
  KC.st = { pos: new V3(PL.pos.x, PL.smoothY, PL.pos.z), yaw: PL.yaw, pitch: PL.pitch, stance, lean: PL.leanEff || 0, ads: false, scoped: false, melee: 0, cycle: 0, sprint: false, reload: false, alive: true,
    gun: cw ? [cw.id, cw.mods] : null };
  KC.killer = killerId; KC.w = w; KC.head = head; KC.supp = (list[list.length - 1] || {}).s; KC.armed = true; KC.skip = false;
}
// our own body, so the round has someone to hit (the local player has no third-person model)
function kcBody() {
  const k = PL.outfit + '|' + PL.skin;
  if (KC.body && KC.bodyKey !== k) { SCENE.remove(KC.body.root); freeOperator(KC.body); KC.body = null; }
  if (!KC.body) { KC.body = buildOperator(PL.outfit, PL.skin); KC.bodyKey = k; KC.body.root.visible = false; SCENE.add(KC.body.root); KC.body.gunKey = ''; }
  const st = KC.st, op = KC.body;
  if (st.gun) { const gk = gunKey(st.gun[0], st.gun[1]); if (gk !== op.gunKey) { setOperatorGun(op, st.gun[0], st.gun[1]); op.gunKey = gk; } }
  op.lastPos.copy(st.pos); op.dead = 0;
  return op;
}
function kcStart() {
  const P = KC.path; KC.armed = false; KC.on = true; KC.hitDone = false; KC.skip = false;
  try { kcBody().root.visible = true; } catch (e) { KC.body = null; }
  // the streak: fx.js's visible-round effect, fed our simulated position (made before the camera moves so it isn't drawn as "our own" round)
  KC.h = typeof fxBullet === 'function' ? fxBullet(P.o, P.v0, KC.supp) : null;
  if (!KC.supp) fxMuzzle(P.o.clone().addScaledVector(_kcD.copy(P.v0).normalize(), 0.9), _kcD, 1.6);
  if (!KC.slug) {   // the round itself, a copper .338 (drawn a little big so it reads at speed)
    const g = new THREE.CylinderGeometry(0.0043, 0.0043, 0.03, 10); g.translate(0, -0.012, 0);
    const n = new THREE.ConeGeometry(0.0043, 0.022, 10); n.translate(0, 0.014, 0);
    const m = new THREE.MeshStandardMaterial({ color: 0xc8743a, metalness: 0.9, roughness: 0.28, emissive: 0x3a1404 });
    KC.slug = new THREE.Group(); KC.slug.add(new THREE.Mesh(g, m), new THREE.Mesh(n, m)); KC.slug.scale.setScalar(2.2);
    KC.slug.children.forEach(c => { c.frustumCulled = false; });
    // a stale slug can never linger: if the kill-cam stopped ticking (menu, respawn), hide it
    KC.slug.children[0].onBeforeRender = () => { if (!KC.on || performance.now() - KC.lastTick > 250) kcEnd(); };
    SCENE.add(KC.slug);
  }
  KC.slug.visible = true;
  kcOverlay(true);
}
// ui.js hudRespawn (and anything else that ends the death): put everything back
function kcEnd() {
  const was = KC.on; KC.on = false; KC.armed = false;
  if (KC.h) { try { KC.h.end(); } catch (e) {} KC.h = null; }
  if (KC.slug) KC.slug.visible = false;
  if (KC.body) KC.body.root.visible = false;
  kcOverlay(false);
  return was;
}
// any key or click skips it
window.addEventListener('keydown', () => { if (KC.on || KC.armed) KC.skip = true; }, true);
window.addEventListener('mousedown', () => { if (KC.on || KC.armed) KC.skip = true; }, true);

// letterbox + caption, inside #deathScreen so it hides with it; the death card waits until we're back
function kcOverlay(on) {
  const ds = $('deathScreen'); if (!ds) return;
  let el = $('kcOverlay');
  if (!el && on) {
    const css = document.createElement('style');
    css.textContent = `#hud.kcOn > :is(#scope, #scopeInfo, #crosshair, #hitmarker, #dmgDir, #vignette, #killfeed, #topLeft, #targetName, #bottomLeft, #bottomRight, #centerMsg) { visibility: hidden; }
#deathScreen.kc { background: none; } #deathScreen.kc .dsCard { visibility: hidden; }
#kcOverlay { position: absolute; inset: 0; pointer-events: none; display: none; }
#deathScreen.kc #kcOverlay { display: block; }
#kcOverlay .bar { position: absolute; left: 0; right: 0; height: 9vh; background: #000; }
#kcOverlay .bar.t { top: 0; } #kcOverlay .bar.b { bottom: 0; }
#kcOverlay .tag { position: absolute; top: calc(9vh + 14px); left: 22px; font: 700 13px/1 var(--f-mono, monospace); letter-spacing: 0.32em; color: #ffb066; text-shadow: 0 0 8px rgba(255,120,30,0.6); }
#kcOverlay .tag i { display: inline-block; width: 8px; height: 8px; margin-right: 9px; border-radius: 50%; background: #e33; animation: kcRec 1s steps(2) infinite; }
@keyframes kcRec { 50% { opacity: 0; } }
#kcOverlay .cap { position: absolute; bottom: calc(9vh + 16px); left: 0; right: 0; text-align: center; font: 600 14px/1.5 var(--f-mono, monospace); letter-spacing: 0.12em; color: #e8e0d4; text-shadow: 0 1px 3px #000; }
#kcOverlay .cap b { color: #fff; font-size: 18px; letter-spacing: 0.08em; }
#kcOverlay .skip { position: absolute; bottom: calc(9vh - 26px); right: 22px; font: 11px var(--f-mono, monospace); letter-spacing: 0.2em; color: #888; }
#kcOverlay .flash { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 50%, rgba(255,240,220,0.5), rgba(120,0,0,0.55)); opacity: 0; }`;
    document.head.appendChild(css);
    el = document.createElement('div'); el.id = 'kcOverlay';
    el.innerHTML = '<div class="bar t"></div><div class="bar b"></div><div class="tag"><i></i>KILL CAM</div><div class="cap"></div><div class="skip">ANY KEY TO SKIP</div><div class="flash"></div>';
    ds.appendChild(el);
  }
  ds.classList.toggle('kc', !!on); if (ds.parentElement) ds.parentElement.classList.toggle('kcOn', !!on);   // the rest of the HUD steps aside too
  if (typeof SB !== 'undefined' && SB.cv) SB.cv.style.visibility = on ? 'hidden' : '';   // fx.js's on-screen blood would cover the replay
  if (on && el) {
    const P = KC.path, def = WEAPONS[KC.w] || {};
    el.querySelector('.cap').innerHTML = `<b>${escapeHtml(nameOf(KC.killer))}</b><br>${escapeHtml(def.name || '')} · ${Math.round(P.len)} m · ${P.T.toFixed(2)} s flight · ${P.drop.toFixed(2)} m drop`;
    el.querySelector('.flash').style.opacity = 0;
  }
}

// Called from player.js deathCam every frame while dead. 1 = we drew the camera, 2 = just finished (snap back), 0 = not ours.
function kcTick(dt) {
  if (!KC.on && !KC.armed) return 0;
  const t = (performance.now() - PL.deathTime) / 1000 - KC.delay;
  // never run into the respawn; a skip, or losing the path, ends it too
  if (KC.skip || !KC.path || PL.alive || (typeof HUD !== 'undefined' && HUD.deathT < 0.5)) return kcEnd() ? 2 : (KC.armed = false, 0);
  if (KC.armed) { if (t < 0) return 0; try { kcStart(); } catch (e) { kcEnd(); reportError('killcam', e); return 0; } }
  KC.lastTick = performance.now();
  const P = KC.path, Ttr = KC.travel, x = clamp(t / Ttr, 0, 1);
  if (t > Ttr + KC.hold) { kcEnd(); return 2; }
  // flight time along the path: crawls out of the muzzle, rushes the middle, crawls again into the impact
  const e = 0.85 * smoothT(x) + 0.15 * x, tau = P.T * e;
  const B = kcAt(P, tau, _kcB), D = kcAt(P, Math.min(P.T, tau + 0.002), _kcD).sub(B);
  if (D.lengthSq() < 1e-8) D.copy(P.v0); D.normalize();
  // a frame of the camera around the round: right/up of its direction, slowly rolling
  _kcS.crossVectors(D, UP); if (_kcS.lengthSq() < 1e-6) _kcS.set(1, 0, 0); _kcS.normalize(); _kcU.crossVectors(_kcS, D);
  const roll = -0.2 + 0.32 * x;
  _kcA.copy(_kcS).multiplyScalar(Math.cos(roll)).addScaledVector(_kcU, Math.sin(roll)); _kcU.crossVectors(_kcA, D); _kcS.copy(_kcA);
  const hit = t >= Ttr;
  let back, side, up, look;
  if (!hit) {
    // starts over the shooter's shoulder, closes in behind the round, then swings out to the side for the impact
    back = lerp(3.0, 0.75, smoothT(x / 0.3)) + 0.5 * smoothT((x - 0.75) / 0.25);
    const k0 = smoothT(x / 0.3), k1 = smoothT((x - 0.7) / 0.3);
    side = lerp(0.5, 0.26, k0) + 1.16 * k1;
    up = lerp(0.3, 0.16, k0) + 0.26 * k1;
    look = _kcL.copy(B).addScaledVector(D, lerp(lerp(4, 2, k0), 0.6, smoothT((x - 0.6) / 0.4)));   // the round sits in the lower-left third
    look.y += 0.35 * k1;   // and as it arrives, frame the body rather than the ground
  } else {
    // hit frame: hold beside the impact and drift back a touch
    const h = (t - Ttr) / KC.hold;
    back = 1.25 + 0.5 * h; side = 1.42 + 0.4 * h; up = 0.42 + 0.15 * h;
    look = _kcL.copy(P.end); look.y -= 0.1;
    if (!KC.hitDone) {
      KC.hitDone = true;
      fxBlood(P.end.clone(), D.clone(), KC.head ? 1.6 : 1, KC.head); SFX.fleshHit(P.end, KC.head);
      if (KC.h) { KC.h.end(); KC.h = null; }
      if (KC.st) KC.st.alive = false;
    }
    const fl = $('kcOverlay'); if (fl) fl.querySelector('.flash').style.opacity = clamp(1 - h * 3, 0, 1) * 0.9;
  }
  const C = _kcC.copy(B).addScaledVector(D, -back).addScaledVector(_kcS, side).addScaledVector(_kcU, up);
  // keep the camera out of walls: pull it in toward the round if something's in the way
  _kcA.subVectors(C, B); const cl = _kcA.length(); _kcA.divideScalar(cl || 1);
  const wh = rayWorld(B, _kcA, cl, false); if (wh) C.copy(B).addScaledVector(_kcA, Math.max(0.15, wh.t - 0.12));
  const gy = typeof terrainY === 'function' ? terrainY(C.x, C.z) + 0.12 : -1e9; if (C.y < gy) C.y = gy;
  CAMERA.position.copy(C);
  _kcM.lookAt(C, look, UP); CAMERA.quaternion.setFromRotationMatrix(_kcM);
  const fov = hit ? 48 : lerp(62, 52, x);
  if (Math.abs(CAMERA.fov - fov) > 0.05) { CAMERA.fov = fov; CAMERA.updateProjectionMatrix(); }
  if (!hit) {
    if (KC.h) KC.h.update(B);
    KC.slug.position.copy(B); KC.slug.quaternion.setFromUnitVectors(UP, D);
    KC.slug.rotateY(t * 40);   // spin (rifling)
  } else KC.slug.visible = false;
  // our body: standing as we were, then dropping in slow motion when the round lands
  if (KC.body && KC.st) {
    const op = KC.body; animateOperator(op, KC.st, hit ? dt * 0.45 : dt);
    if (typeof occAt === 'function' && op.mats && op.mats.m) op.mats.m.color.setScalar(1 - occAt(KC.st.pos.x, KC.st.pos.z, KC.st.pos.y + 1));
  }
  return 1;
}
