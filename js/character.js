'use strict';
// ---------- Operators: the Concrete Lines body, re-dressed in combat kit ----------
// Built facing -z (forward), +x is the operator's right. Feet at y = 0. IK legs and arms like the skater rig.
const OUTFITS = {
  ranger: { name: 'Ranger', base: '#5f6448', c1: '#7a7a58', c2: '#3e4430', c3: '#8a7d5a', vest: 0x5b5d43, helmet: 0x5a5c45, glove: 0x2c2b26 },
  desert: { name: 'Desert', base: '#a8946a', c1: '#c2ab7c', c2: '#7e6a48', c3: '#d0bf98', vest: 0x9a8762, helmet: 0xa08d68, glove: 0x6a5a40 },
  black: { name: 'Black ops', base: '#26272a', c1: '#323438', c2: '#1a1b1d', c3: null, vest: 0x232426, helmet: 0x2a2b2e, glove: 0x161616 },
  woodland: { name: 'Woodland', base: '#4e5a3a', c1: '#2f3a24', c2: '#6b5a3a', c3: '#1c1e18', vest: 0x4a5236, helmet: 0x434b33, glove: 0x2a2a22 },
  urban: { name: 'Urban', base: '#7c8084', c1: '#5c6064', c2: '#a0a4a6', c3: '#3a3c40', vest: 0x55595d, helmet: 0x5c6064, glove: 0x252628 },
  navy: { name: 'Navy', base: '#2b3a52', c1: '#3b4c66', c2: '#1d2738', c3: null, vest: 0x2c394c, helmet: 0x2d3a4e, glove: 0x1a1d24 },
  red: { name: 'Red team', base: '#6b2a22', c1: '#84372c', c2: '#4a1c17', c3: null, vest: 0x5a2a22, helmet: 0x4a2620, glove: 0x231816 },
};
const SKINS = [0xd29a74, 0xc08562, 0x9a6444, 0x6e4430, 0xe0b090];
const L1 = 0.45, L2 = 0.45, A1 = 0.29, A2 = 0.27;
const _d = new V3(), _n = new V3(), _perp = new V3(), _el = new V3(), _tg = new V3(), _tmp = new V3(), _tmp2 = new V3();
const _q = new THREE.Quaternion(), _m4 = new THREE.Matrix4();
// two-bone IK: positions upper at root, lower at the knee/elbow; both meshes hang along -y
function solve2(upper, lower, root, target, hint, la, lb, stretch = false) {
  _d.subVectors(target, root);
  let dist = _d.length();
  if (stretch && dist > la + lb - 0.005) { root = _tmp2.copy(target).addScaledVector(_d.normalize(), -(la + lb - 0.005)); _d.subVectors(target, root); dist = _d.length(); }
  dist = clamp(dist, Math.abs(la - lb) + 0.01, la + lb - 0.002); _d.normalize();
  const a = Math.acos(clamp((la * la + dist * dist - lb * lb) / (2 * la * dist), -1, 1));
  _n.crossVectors(_d, hint); if (_n.lengthSq() < 1e-8) _n.set(1, 0, 0); _n.normalize();
  _perp.crossVectors(_n, _d);
  const up = _tmp.copy(_d).multiplyScalar(Math.cos(a)).addScaledVector(_perp, Math.sin(a));
  upper.position.copy(root); upper.quaternion.setFromUnitVectors(DOWN, up);
  _el.copy(root).addScaledVector(up, la);
  _tg.copy(root).addScaledVector(_d, dist);
  lower.position.copy(_el); lower.quaternion.setFromUnitVectors(DOWN, _tg.clone().sub(_el).normalize());
  return _tg;
}
function charMats(outfitKey, skinIdx) {
  const o = OUTFITS[outfitKey] || OUTFITS.ranger;
  const camo = camoTex(o.base, o.c1, o.c2, o.c3);
  const s = p => { const m = new THREE.MeshStandardMaterial(p); m.color.convertSRGBToLinear(); return m; };
  return {
    camo: s({ map: camo, roughness: 0.92 }),
    vest: s({ map: TEX.sandbag, color: o.vest, roughness: 0.95 }),
    pouch: s({ map: TEX.sandbag, color: new THREE.Color(o.vest).multiplyScalar(0.85), roughness: 0.95 }),
    helmet: s({ map: TEX.metalNoise, color: o.helmet, roughness: 0.75, metalness: 0.1 }),
    glove: s({ color: o.glove, roughness: 0.85 }),
    skin: s({ color: SKINS[skinIdx % SKINS.length], roughness: 0.65 }),
    boot: s({ color: 0x2b241c, roughness: 0.8 }),
    sole: s({ color: 0x141414, roughness: 0.9 }),
    dark: s({ color: 0x0e0e10, roughness: 0.5 }),
    strap: s({ color: 0x1e1f1c, roughness: 0.9 }),
    knee: s({ color: 0x1f2020, roughness: 0.7 }),
    hair: s({ color: 0x3a2618, roughness: 0.9 }),
    lens: s({ color: 0x0c1418, roughness: 0.1, metalness: 0.7 }),
  };
}
const _add = (parent, geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
const _lathe = (pts, seg, mat) => { const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg); const m = new THREE.Mesh(g, mat); m.castShadow = true; return m; };
const _limb = (r1, r2, L, mat, seg = 14) => { const g = new THREE.CylinderGeometry(r1, r2, L, seg, 3); g.translate(0, -L / 2, 0); const m = new THREE.Mesh(g, mat); m.castShadow = true; return m; };
// A gloved hand gripping something along its local -z axis. side +1 = right hand
function buildHand(parent, mats, side, pose = 'grip') {
  const hand = new THREE.Group(); parent.add(hand);
  const gl = mats.glove;
  _add(hand, rboxGeo(0.034, 0.08, 0.085, 0.014, 2), gl, side * 0.024, 0, 0.0);                  // back of the hand, beside the grip
  _add(hand, rboxGeo(0.03, 0.03, 0.06, 0.01, 1), mats.knee, side * 0.042, 0.01, 0);               // knuckle armour
  // four fingers curling round to the far side
  for (let k = 0; k < 4; k++) {
    const y = 0.028 - k * 0.019;
    const f = new THREE.Group(); f.position.set(side * 0.02, y, -0.035); hand.add(f);
    _add(f, rboxGeo(0.03, 0.017, 0.02, 0.007, 1), gl, -side * 0.012, 0, 0);
    _add(f, rboxGeo(0.018, 0.016, 0.026, 0.007, 1), gl, -side * 0.03, 0, 0.012);
  }
  const th = new THREE.Group(); th.position.set(side * 0.006, 0.04, 0.012); hand.add(th);
  _add(th, rboxGeo(0.018, 0.018, 0.05, 0.008, 1), gl, -side * 0.014, 0, -0.016).rotation.y = side * 0.5;
  _add(hand, rboxGeo(0.05, 0.045, 0.06, 0.016, 1), gl, side * 0.018, -0.02, 0.05);               // wrist / cuff
  return hand;
}
// An arm: shoulder (upper arm) and elbow (forearm) groups that the IK places, and a hand
function buildArm(parent, mats, side, fp = false) {
  const la = fp ? 0.36 : A1, lb = fp ? 0.36 : A2;
  const upper = new THREE.Group(), lower = new THREE.Group(); parent.add(upper); parent.add(lower);
  upper.add(_limb(0.058, 0.048, la, mats.camo, 12));
  _add(upper, new THREE.SphereGeometry(0.064, 12, 10), mats.camo).scale.set(1, 0.9, 1);
  if (!fp) _add(upper, rboxGeo(0.07, 0.09, 0.09, 0.02, 2), mats.pouch, side * 0.025, -0.08, 0);   // shoulder pocket
  _add(lower, new THREE.SphereGeometry(0.05, 10, 8), mats.camo);
  lower.add(_limb(0.05, 0.04, lb, mats.camo, 12));
  _add(lower, new THREE.CylinderGeometry(0.046, 0.046, 0.05, 12), mats.camo, 0, -lb + 0.035, 0);   // cuff rolled over the glove
  const hand = buildHand(parent, mats, side);
  return { upper, lower, hand, la, lb, side };
}
function buildBoot(foot, mats) {
  _add(foot, rboxGeo(0.11, 0.032, 0.29, 0.012, 2), mats.sole, 0, -0.068, -0.055);
  _add(foot, rboxGeo(0.1, 0.07, 0.25, 0.03, 2), mats.boot, 0, -0.03, -0.06);
  _add(foot, rboxGeo(0.095, 0.05, 0.08, 0.02, 2), mats.boot, 0, -0.01, -0.16).rotation.x = 0.35;
  _add(foot, new THREE.CylinderGeometry(0.058, 0.06, 0.16, 12), mats.boot, 0, 0.05, 0.0);
  for (let i = 0; i < 4; i++) _add(foot, new THREE.BoxGeometry(0.07, 0.006, 0.01), mats.dark, 0, -0.0 + i * 0.03, -0.06 + i * 0.005);
}
function buildOperator(outfitKey = 'ranger', skinIdx = 0) {
  const mats = charMats(outfitKey, skinIdx);
  const root = new THREE.Group(), char = new THREE.Group(); root.add(char);
  const pelvis = new THREE.Group(); char.add(pelvis);
  const spine = new THREE.Group(); spine.position.y = 0.05; pelvis.add(spine);
  const head = new THREE.Group(); head.position.y = 0.6; spine.add(head);
  // hips and belt
  { const h = _lathe([[0.02, -0.14], [0.14, -0.12], [0.165, -0.03], [0.162, 0.07]], 20, mats.camo); h.scale.set(1, 1, 0.7); pelvis.add(h); }
  { const b = _add(pelvis, new THREE.CylinderGeometry(0.172, 0.172, 0.05, 22, 1, true), mats.strap, 0, 0.055, 0); b.scale.z = 0.7; }
  _add(pelvis, rboxGeo(0.06, 0.04, 0.02, 0.005, 1), mats.dark, 0, 0.055, -0.123);   // buckle
  [-1, 1].forEach(s => { _add(pelvis, rboxGeo(0.05, 0.11, 0.06, 0.012, 2), mats.pouch, s * 0.16, 0.0, 0.03); });   // hip pouches
  _add(pelvis, rboxGeo(0.06, 0.18, 0.04, 0.01, 2), mats.dark, 0.17, -0.1, -0.02);   // drop-leg holster
  // torso: combat shirt, plate carrier, pouches
  {
    const tee = _lathe([[0.2, -0.16], [0.205, -0.05], [0.2, 0.1], [0.212, 0.3], [0.226, 0.42], [0.215, 0.49], [0.165, 0.525], [0.1, 0.552], [0.056, 0.572]], 28, mats.camo);
    tee.scale.set(1, 1, 0.72); spine.add(tee);
  }
  _add(spine, rboxGeo(0.33, 0.34, 0.07, 0.025, 2), mats.vest, 0, 0.27, -0.14);        // front plate bag
  _add(spine, rboxGeo(0.33, 0.37, 0.07, 0.025, 2), mats.vest, 0, 0.27, 0.14);         // back plate bag
  _add(spine, new THREE.CylinderGeometry(0.218, 0.218, 0.16, 22, 1, true), mats.vest, 0, 0.13, 0).scale.z = 0.76;   // cummerbund
  [-1, 1].forEach(s => { const st = _add(spine, rboxGeo(0.06, 0.02, 0.32, 0.008, 1), mats.vest, s * 0.11, 0.49, 0); st.rotation.x = 0; });   // shoulder straps
  [-0.1, 0, 0.1].forEach(x => { _add(spine, rboxGeo(0.085, 0.12, 0.045, 0.012, 2), mats.pouch, x, 0.19, -0.19); _add(spine, rboxGeo(0.086, 0.025, 0.05, 0.006, 1), mats.vest, x, 0.255, -0.19); });   // triple mag pouch
  _add(spine, rboxGeo(0.12, 0.08, 0.035, 0.01, 2), mats.pouch, 0.04, 0.36, -0.185);   // admin pouch
  _add(spine, rboxGeo(0.03, 0.12, 0.03, 0.008, 1), mats.dark, -0.12, 0.37, -0.185);   // radio
  _add(spine, rboxGeo(0.24, 0.3, 0.07, 0.03, 2), mats.pouch, 0, 0.25, 0.2);           // hydration pack
  _add(spine, new THREE.TorusGeometry(0.05, 0.014, 6, 16), mats.camo, 0, 0.565, 0).rotation.x = Math.PI / 2;
  _add(spine, new THREE.CylinderGeometry(0.046, 0.05, 0.1, 10), mats.skin, 0, 0.57, 0);
  // head: same proportions as the skater, then a helmet with ear cups and an NVG mount
  const sk = _add(head, new THREE.SphereGeometry(0.112, 20, 16), mats.skin, 0, 0.1, 0); sk.scale.set(0.94, 1.08, 1);
  _add(head, new THREE.SphereGeometry(0.083, 16, 10), mats.skin, 0, 0.04, -0.03).scale.set(1.05, 0.8, 1);
  [-1, 1].forEach(s => {
    _add(head, new THREE.SphereGeometry(0.014, 8, 6), mats.dark, s * 0.038, 0.112, -0.1);
    _add(head, new THREE.BoxGeometry(0.035, 0.008, 0.01), mats.hair, s * 0.04, 0.142, -0.105).rotation.z = -s * 0.15;
    const cup = _add(head, new THREE.CylinderGeometry(0.042, 0.042, 0.035, 16), mats.dark, s * 0.112, 0.095, 0.005); cup.rotation.z = Math.PI / 2;
  });
  _add(head, new THREE.ConeGeometry(0.017, 0.04, 6), mats.skin, 0, 0.085, -0.122).rotation.x = -Math.PI / 2;
  const helm = _add(head, new THREE.SphereGeometry(0.14, 24, 14, 0, TAU, 0, Math.PI * 0.52), mats.helmet, 0, 0.12, 0.005); helm.scale.set(0.98, 0.95, 1.05);
  _add(head, new THREE.TorusGeometry(0.138, 0.008, 6, 28), mats.helmet, 0, 0.115, 0.005).rotation.x = Math.PI / 2;
  [-1, 1].forEach(s => _add(head, rboxGeo(0.012, 0.03, 0.12, 0.004, 1), mats.dark, s * 0.135, 0.15, 0.0));   // side rails
  _add(head, rboxGeo(0.04, 0.03, 0.02, 0.006, 1), mats.dark, 0, 0.21, -0.135);                              // NVG shroud
  _add(head, rboxGeo(0.06, 0.04, 0.02, 0.008, 1), mats.pouch, 0, 0.2, 0.14);                                 // counterweight
  _add(head, rboxGeo(0.15, 0.03, 0.02, 0.01, 1), mats.lens, 0, 0.14, -0.118).visible = false;
  // legs: cargo pants with knee pads, boots
  const legs = [];
  [-1, 1].forEach(s => {
    const thigh = new THREE.Group(), shin = new THREE.Group(), foot = new THREE.Group(); char.add(thigh, shin, foot);
    thigh.add(_limb(0.085, 0.074, L1, mats.camo, 16));
    _add(thigh, rboxGeo(0.06, 0.13, 0.09, 0.015, 2), mats.camo, s * 0.08, -0.2, 0);    // cargo pocket
    shin.add(_limb(0.074, 0.06, L2 - 0.08, mats.camo, 16));
    _add(shin, new THREE.SphereGeometry(0.075, 12, 10), mats.camo);
    _add(shin, rboxGeo(0.09, 0.11, 0.05, 0.02, 2), mats.knee, 0, -0.04, -0.06);       // knee pad
    _add(shin, new THREE.CylinderGeometry(0.068, 0.066, 0.06, 14, 1, true), mats.camo, 0, -(L2 - 0.12), 0);
    buildBoot(foot, mats);
    legs.push({ s, thigh, shin, foot });
  });
  // arms + gun mount
  const arms = [buildArm(char, mats, 1), buildArm(char, mats, -1)];
  const aim = new THREE.Group(); char.add(aim);         // the gun hangs from this, pitched with aim
  const gunHolder = new THREE.Group(); aim.add(gunHolder);
  // static parts merged per material for speed
  bakeGroup(pelvis, [spine], true); bakeGroup(spine, [head], true); bakeGroup(head, [], true);
  legs.forEach(l => { bakeGroup(l.thigh, [], true); bakeGroup(l.shin, [], true); bakeGroup(l.foot, [], true); });
  arms.forEach(a => { bakeGroup(a.upper, [], true); bakeGroup(a.lower, [], true); bakeGroup(a.hand, [], true); });
  const op = { root, char, pelvis, spine, head, legs, arms, aim, gunHolder, mats, gun: null, gunId: null,
    phase: 0, crouch: 0, speed: 0, dead: 0, lean: 0, yaw: 0, pitch: 0, ads: 0, sprint: 0, reloadT: 0, kick: 0, lastPos: new V3(), lv: new V3(), stepAcc: 0 };
  return op;
}
function setOperatorGun(op, id, mods) {
  if (op.gun) { op.gunHolder.remove(op.gun.group); op.gun.group.traverse(m => { if (m.isMesh) m.geometry.dispose(); }); }   // geometries are merged per gun, so they're safe to free
  const m = buildGun(id, mods, true); op.gun = m; op.gunId = id; op.gunKey = id + JSON.stringify(mods || {});
  op.gunHolder.add(m.group);
}
const _hip = new V3(), _ft = new V3(), _hint = new V3(), _sh = new V3(), _gp = new V3(), _wq = new THREE.Quaternion(), _iq = new THREE.Quaternion();
const _fwd = new V3(), _rgt = new V3();
// Pose the operator for this frame. st: {pos, yaw, pitch, crouch, ads, sprint, reload, lean, alive}, vel = world velocity
function animateOperator(op, st, dt) {
  const root = op.root;
  root.position.copy(st.pos);
  op.yaw = st.yaw; root.rotation.y = st.yaw;
  op.crouch = lerp(op.crouch, st.crouch ? 1 : 0, 1 - Math.exp(-dt * 10));
  op.ads = lerp(op.ads, st.ads ? 1 : 0, 1 - Math.exp(-dt * 10));
  op.sprint = lerp(op.sprint, st.sprint ? 1 : 0, 1 - Math.exp(-dt * 8));
  op.lean = lerp(op.lean, st.lean || 0, 1 - Math.exp(-dt * 10));
  op.kick = Math.max(0, op.kick - dt * 6);
  // velocity in the operator's frame
  op.lv.subVectors(st.pos, op.lastPos).divideScalar(Math.max(dt, 1e-3)); op.lastPos.copy(st.pos);
  if (op.lv.lengthSq() > 400) op.lv.set(0, 0, 0);   // teleport (respawn)
  const cy = Math.cos(st.yaw), sy = Math.sin(st.yaw);
  const vf = -op.lv.x * sy - op.lv.z * cy, vr = op.lv.x * cy - op.lv.z * sy;   // forward (+) / right (+)
  const sp = Math.hypot(op.lv.x, op.lv.z);
  op.speed = lerp(op.speed, sp, 1 - Math.exp(-dt * 8));
  // death: fall over backwards
  const targetDead = st.alive ? 0 : 1;
  op.dead = targetDead ? Math.min(1, op.dead + dt * 2.2) : 0;
  const c = op.crouch, char = op.char;
  const hipY = lerp(0.93, 0.62, c) + (op.speed > 0.3 ? Math.abs(Math.sin(op.phase)) * 0.035 : 0);
  if (op.dead > 0) {
    const d = smoothT(op.dead);
    char.rotation.set(d * Math.PI / 2 * 0.98, 0, d * 0.2); char.position.set(0, d * 0.12, d * 0.55);
  } else { char.rotation.set(0, 0, 0); char.position.set(0, 0, 0); }
  op.pelvis.position.set(op.lean * 0.12, hipY, 0);
  op.pelvis.rotation.set(0, 0, -op.lean * 0.18);
  // spine leans into the aim and bends while crouched/sprinting
  op.spine.rotation.set(-0.08 - c * 0.18 - op.sprint * 0.12 + (-st.pitch) * 0.25 * 0, 0, -op.lean * 0.15);
  op.head.rotation.set(-st.pitch * 0.6, 0, 0);
  // legs: a walk cycle driven by distance travelled
  const stride = clamp(op.speed / 5, 0, 1.4);
  op.phase += (op.speed * dt) / (0.55 + c * 0.2) * Math.PI;
  const mvx = op.speed > 0.2 ? vr / Math.max(op.speed, 0.01) : 0, mvz = op.speed > 0.2 ? -vf / Math.max(op.speed, 0.01) : 0;
  op.legs.forEach((leg, i) => {
    const ph = op.phase + (i ? Math.PI : 0), sw = Math.sin(ph), lift = Math.max(0, Math.cos(ph));
    _hip.set(leg.s * 0.095 + op.lean * 0.12, hipY - 0.04, 0);
    _ft.set(leg.s * (0.12 + c * 0.04), 0.085 + lift * 0.12 * stride, c * -0.08);
    _ft.x += mvx * sw * 0.28 * stride; _ft.z += mvz * sw * 0.32 * stride;
    if (c > 0.5 && i === 1) { _ft.z += 0.22 * c; _ft.y += 0.0; }   // one knee down-ish
    _hint.set(0, 0, -1);
    solve2(leg.thigh, leg.shin, _hip, _ft, _hint, L1, L2);
    leg.foot.position.copy(_ft); leg.foot.rotation.set(0, 0, 0);
  });
  // gun: held at the shoulder, pitched with aim; lowered while sprinting
  char.updateMatrixWorld(true);
  _sh.set(0.2, 0.5, -0.06); op.spine.localToWorld(_sh); char.worldToLocal(_sh);   // right shoulder
  const gun = op.gun;
  if (gun) {
    const pistol = gun.def.pistol, sprintDown = op.sprint * (pistol ? 0.9 : 0.75);
    op.aim.position.set(lerp(0.12, 0.0, op.ads) * (pistol ? 0.3 : 1) + op.lean * 0.1, _sh.y - 0.04 + (pistol ? 0.04 : 0), _sh.z - 0.02);
    op.aim.rotation.set(-st.pitch * (1 - op.sprint) + -sprintDown, op.sprint * 0.6, 0);
    // stock at the shoulder: put the gun so its stock end sits at the aim origin
    const reach = pistol ? -0.42 : -gun.stockZ + 0.03;
    op.gunHolder.position.set(0, -0.0 - (pistol ? 0.0 : 0.0), reach + op.kick * 0.05);
    op.gunHolder.rotation.set(op.kick * 0.15 + (st.reload ? 0.5 : 0), 0, st.reload ? 0.4 : 0);
    char.updateMatrixWorld(true);
    // hands to the grip and the fore grip
    gun.group.updateMatrixWorld(true);
    _wq.setFromRotationMatrix(gun.group.matrixWorld); _iq.setFromRotationMatrix(char.matrixWorld).invert(); _wq.premultiply(_iq);
    op.arms.forEach(arm => {
      const mk = arm.side > 0 ? gun.grip : gun.fore;
      mk.getWorldPosition(_gp); char.worldToLocal(_gp);
      if (arm.side < 0 && st.reload && gun.magWell) { _gp.copy(gun.magWell).add(new V3(0, -0.1, 0)); gun.group.localToWorld(_gp); char.worldToLocal(_gp); }
      arm.hand.position.copy(_gp); arm.hand.quaternion.copy(_wq);
      if (arm.side < 0) arm.hand.rotateZ(Math.PI);   // support hand under the handguard
      // wrist sits a little behind and below the grip
      _tmp.set(arm.side > 0 ? 0.02 : -0.0, -0.04 * arm.side, 0.06).applyQuaternion(_wq).add(_gp);
      const shoulder = _sh.clone(); if (arm.side < 0) { shoulder.set(-0.2, 0.5, -0.06); op.spine.localToWorld(shoulder); char.worldToLocal(shoulder); }
      solve2(arm.upper, arm.lower, shoulder, _tmp, _hint.set(arm.side * 1, -1, 0.6).normalize(), arm.la, arm.lb, true);
    });
  }
}
// Hitboxes in world space: head sphere, chest capsule, legs capsule. Returns list of {zone, ...}
function operatorHitboxes(pos, crouch, lean, yaw) {
  const c = crouch ? 1 : 0, hy = lerp(1.62, 1.18, c);
  const rx = Math.cos(yaw) * lean * 0.25, rz = -Math.sin(yaw) * lean * 0.25;
  return [
    { zone: 'head', type: 's', x: pos.x + rx * 1.4, y: pos.y + hy, z: pos.z + rz * 1.4, r: 0.13 },
    { zone: 'chest', type: 'c', x: pos.x + rx, y0: pos.y + lerp(0.95, 0.68, c), y1: pos.y + hy - 0.2, z: pos.z + rz, r: 0.24 },
    { zone: 'legs', type: 'c', x: pos.x, y0: pos.y + 0.1, y1: pos.y + lerp(0.9, 0.62, c), z: pos.z, r: 0.2 },
  ];
}
