'use strict';
// ---------- Pickups: ammo cans that float and spin at fixed spots, and the odd armor plate ----------
// The host owns which pickups exist; everyone else asks to take one and is told who got it.
const PICKUPS = new Map();   // id -> {id, kind, x, y, z, active, respawnAt, expireAt, mesh}
const PK = { mats: null, geo: null, plateT: 30, seq: 0 };
const AMMO_RESPAWN = 30, PLATE_LIFE = 90, PLATE_MAX = 3;

function pickupMats() {
  if (PK.mats) return PK.mats;
  const s = o => { const m = new THREE.MeshStandardMaterial(o); m.color.convertSRGBToLinear(); if (m.emissive) m.emissive.convertSRGBToLinear(); return m; };
  const stencil = canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = '#4b5232'; g.fillRect(0, 0, w, h); grain(g, w, h, 20);
    g.fillStyle = 'rgba(30,30,20,0.35)'; for (let i = 0; i < 6; i++) g.fillRect(Math.random() * w, Math.random() * h, rand(10, 40), rand(2, 6));
    g.fillStyle = '#d8cfa0'; g.font = 'bold 30px "Share Tech Mono", monospace'; g.textAlign = 'center';
    g.fillText('CTG .50 CAL', w / 2, 54); g.font = 'bold 20px "Share Tech Mono", monospace'; g.fillText('M33  LOT 7-41', w / 2, 86);
    g.fillStyle = '#c9a227'; g.fillRect(0, 104, w, 8);
  });
  const plateTex = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#3a3d38'; g.fillRect(0, 0, w, h); grain(g, w, h, 30);
    g.strokeStyle = 'rgba(20,20,18,0.6)'; g.lineWidth = 3; g.strokeRect(10, 10, w - 20, h - 20);
    g.fillStyle = '#8a8f80'; g.font = 'bold 18px "Share Tech Mono", monospace'; g.textAlign = 'center'; g.fillText('LVL IV', w / 2, h / 2 + 6);
  });
  PK.mats = {
    can: s({ map: stencil, roughness: 0.6, metalness: 0.35 }),
    canDark: s({ color: 0x3c4229, roughness: 0.55, metalness: 0.4 }),
    steel: s({ color: 0x8a8c86, roughness: 0.35, metalness: 0.8 }),
    plate: s({ map: plateTex, roughness: 0.75, metalness: 0.15 }),
    strap: s({ color: 0x2a2c24, roughness: 0.95 }),
    glow: new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending }),
  };
  return PK.mats;
}
// An M2A1 ammo can: box, lid with the latch, carry handle, a few rounds peeking out on top
function ammoMesh() {
  const M = pickupMats(), g = new THREE.Group();
  mesh(rboxGeo(0.3, 0.19, 0.16, 0.012, 2), M.can, 0, 0, 0, g);
  mesh(rboxGeo(0.31, 0.03, 0.17, 0.008, 1), M.canDark, 0, 0.105, 0, g);           // lid
  mesh(rboxGeo(0.05, 0.08, 0.02, 0.006, 1), M.canDark, -0.1, 0.06, 0.088, g);     // latch
  mesh(rboxGeo(0.14, 0.012, 0.02, 0.005, 1), M.steel, 0, 0.135, 0, g);            // handle
  [-0.06, 0.06].forEach(x => mesh(rboxGeo(0.012, 0.03, 0.012, 0.003, 1), M.steel, x, 0.12, 0, g));
  for (let i = 0; i < 4; i++) { const r = new THREE.CylinderGeometry(0.0065, 0.0065, 0.07, 8); mesh(r, GM.brass || M.steel, -0.05 + i * 0.03, 0.15, -0.045, g).rotation.z = 0.15 * (i - 1.5); }
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color: 0xffcf7a, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.scale.set(0.9, 0.9, 1); g.add(halo);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}
// A ceramic plate in its carrier sleeve, slightly curved
function plateMesh() {
  const M = pickupMats(), g = new THREE.Group();
  const geo = new THREE.BoxGeometry(0.26, 0.33, 0.025, 6, 6, 1), p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setZ(i, p.getZ(i) - x * x * 0.9); }
  geo.computeVertexNormals();
  mesh(geo, M.plate, 0, 0, 0, g);
  [-0.09, 0.09].forEach(y => mesh(new THREE.BoxGeometry(0.28, 0.025, 0.03), M.strap, 0, y, -0.01, g));
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color: 0x9ad0ff, transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.scale.set(1, 1, 1); g.add(halo);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}
function pickupAdd(id, kind, x, y, z, active, f = 0) {
  let p = PICKUPS.get(id);
  if (!p) {
    p = { id, kind, x, y, z, f, active: false, respawnAt: 0, expireAt: 0, mesh: kind === 'ammo' ? ammoMesh() : plateMesh(), phase: Math.random() * TAU };
    p.mesh.position.set(x, y + 0.55, z); SCENE.add(p.mesh); PICKUPS.set(id, p);
  }
  p.active = active; p.mesh.visible = active;
  return p;
}
// drop a pickup's model and free its buffers (materials are shared)
function pickupDrop(p) { SCENE.remove(p.mesh); p.mesh.traverse(o => { if (o.isMesh && !(o.geometry.parameters && o.geometry === _rbShared(o))) o.geometry.dispose(); if (o.isSprite) o.material.dispose(); }); PICKUPS.delete(p.id); }
const _rbShared = o => _rbCache && [..._rbCache.values()].includes(o.geometry) ? o.geometry : null;   // rboxGeo results are cached: keep them
function pickupsClear() { PICKUPS.forEach(p => pickupDrop(p)); PICKUPS.clear(); PK.plateT = 30; }
// host: the fixed ammo cans
function pickupsInit() {
  pickupsClear();
  if (!NET.host) return;
  (MAP.ammoSpots || []).forEach((s, i) => pickupAdd('a' + i, 'ammo', s.x, s.y !== undefined ? s.y : groundY(s.x, s.z), s.z, true, s.f || 0));
}
const pickupSnapshot = () => [...PICKUPS.values()].map(p => ({ id: p.id, k: p.kind, p: [p.x, p.y, p.z], a: p.active ? 1 : 0 }));
function pickupApplySnapshot(list) { pickupsClear(); list.forEach(m => pickupAdd(m.id, m.k, m.p[0], m.p[1], m.p[2], !!m.a)); }
function pickupBroadcast(p, by) { const m = { t: 'pk', id: p.id, k: p.kind, p: [p.x, p.y, p.z], a: p.active ? 1 : 0, by }; netBroadcast(m); if (by === NET.myId) pickupGot(p.kind); }
// everyone: the host says a pickup changed
function pickupApply(m) {
  if (!Array.isArray(m.p)) return;
  const p = pickupAdd(m.id, m.k, m.p[0], m.p[1], m.p[2], !!m.a);
  if (!m.a && m.by && m.by === NET.myId) pickupGot(p.kind);
  if (!m.a && p.kind === 'plate') pickupDrop(p);   // plates never come back
  if (!m.a && m.by && m.by !== NET.myId && dist2(p, CAMERA.position) < 400) SFX.pickup(p.kind, p.mesh.position);
}
const dist2 = (p, c) => (p.x - c.x) ** 2 + (p.z - c.z) ** 2;
// do we actually need it? (no point wasting a plate at full armor)
function wantsPickup(kind, ammoFull, armor) { return kind === 'ammo' ? !ammoFull : armor < 50; }
// host: someone asked to take one
function pickupTake(from, id) {
  const p = PICKUPS.get(id); if (!p || !p.active) return;
  p.active = false; p.mesh.visible = false;
  if (p.kind === 'ammo') p.respawnAt = performance.now() + AMMO_RESPAWN * 1000;
  else pickupDrop(p);
  pickupBroadcast(p, from);
  const b = BOTS.get(from);
  if (b) { if (p.kind === 'ammo') { b.reserve = b.def.reserve; } else b.armor = Math.min(50, b.armor + 25); }
}
// we got it
function pickupGot(kind) {
  if (kind === 'ammo') { PL.weapons.forEach(w => { if (!w.def.melee) w.reserve = w.def.reserve; }); hudCenter('AMMO', 1.2); }
  else { PL.armor = Math.min(50, PL.armor + 25); SFX.plateInsert(); hudCenter('ARMOR PLATE', 1.2); }
  SFX.pickup(kind);
}
function nearestPickup(kind, pos, maxD) {
  let best = null, bd = maxD;
  PICKUPS.forEach(p => { if (p.kind !== kind || !p.active || p.f > 0) return;   // bots only walk the ground floor
 const d = Math.hypot(p.x - pos.x, p.z - pos.z); if (d < bd) { bd = d; best = p; } });
  return best;
}
function botPickups(b) {
  PICKUPS.forEach(p => {
    if (!p.active || Math.abs(p.x - b.pos.x) > 1.3 || Math.abs(p.z - b.pos.z) > 1.3 || Math.abs(p.y - b.pos.y) > 1.5) return;
    if (wantsPickup(p.kind, b.reserve >= b.def.reserve, b.armor)) pickupTake(b.id, p.id);
  });
}
let _pkAsk = 0;
function pickupsTick(dt) {
  const now = performance.now(), t = now / 1000;
  PICKUPS.forEach(p => {
    if (!p.mesh.visible) return;
    p.mesh.rotation.y = t * 0.7 + p.phase; p.mesh.position.y = p.y + 0.55 + Math.sin(t * 1.6 + p.phase) * 0.05;
  });
  // walk over one to take it
  if (PL.alive && (_pkAsk -= dt) <= 0) {
    PICKUPS.forEach(p => {
      if (!p.active || Math.abs(p.x - PL.pos.x) > 1.1 || Math.abs(p.z - PL.pos.z) > 1.1 || Math.abs(p.y - PL.pos.y) > 1.6) return;
      const full = PL.weapons.every(w => w.def.melee || w.reserve >= w.def.reserve);
      if (!wantsPickup(p.kind, full, PL.armor)) return;
      _pkAsk = 0.4; netOut({ t: 'take', id: p.id });
    });
  }
  if (!NET.host) return;
  // host: ammo comes back, plates appear now and then and rot away if nobody takes them
  PICKUPS.forEach(p => {
    if (p.kind === 'ammo' && !p.active && now > p.respawnAt) { p.active = true; p.mesh.visible = true; pickupBroadcast(p); }
    if (p.kind === 'plate' && p.active && now > p.expireAt) { p.active = false; pickupDrop(p); pickupBroadcast(p); }
  });
  PK.plateT -= dt;
  if (PK.plateT <= 0) {
    PK.plateT = rand(35, 70);
    const plates = [...PICKUPS.values()].filter(p => p.kind === 'plate').length, spots = MAP.plateSpots || [];
    if (plates < PLATE_MAX && spots.length) {
      const bodies = matchBodies(null);
      for (let i = 0; i < 10; i++) {
        const s = spots[Math.floor(Math.random() * spots.length)];
        if (bodies.some(b => Math.hypot(b.pos.x - s.x, b.pos.z - s.z) < 25)) continue;
        if ([...PICKUPS.values()].some(p => p.kind === 'plate' && Math.hypot(p.x - s.x, p.z - s.z) < 2)) continue;   // one plate per spot
        const p = pickupAdd('p' + (++PK.seq), 'plate', s.x, s.y !== undefined ? s.y : groundY(s.x, s.z), s.z, true, s.f || 0);
        p.expireAt = now + PLATE_LIFE * 1000; pickupBroadcast(p); break;
      }
    }
  }
}
