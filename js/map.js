'use strict';
// ---------- The map: "Outpost" — a small abandoned compound, ~165 m across ----------
// Everything here uses a seeded random so every player builds the exact same world.
const MAP = { half: 82, spawns: [], surf: [], noGrass: [] };
const M = {};
let rng = makeRng(1337);
const rr = (a, b) => a + rng() * (b - a);

function buildMaterials() {
  // hex colours are sRGB; three r128 treats them as linear, so convert (keeps tints from washing out)
  const std = (o, s = 2) => { const m = new THREE.MeshStandardMaterial(o); m.color.convertSRGBToLinear(); m.emissive.convertSRGBToLinear(); m.userData.s = s; return m; };
  M.concrete = std({ map: TEX.concrete, roughness: 0.95 }, 3);
  M.concreteDark = std({ map: TEX.concrete, color: 0x7d7c78, roughness: 0.95 }, 3);
  M.plaster = std({ map: TEX.plaster, roughness: 0.95 }, 3);
  M.plasterIn = std({ map: TEX.plaster, color: 0xd8d4c8, roughness: 0.95 }, 3);
  M.brick = std({ map: TEX.brick, roughness: 0.9 }, 2.5);
  M.corrGrey = std({ map: TEX.corrugated, color: 0xa3aaa9, roughness: 0.55, metalness: 0.25 }, 3);
  M.corrBlue = std({ map: TEX.corrugated, color: 0x5f7c92, roughness: 0.55, metalness: 0.25 }, 3);
  M.wood = std({ map: TEX.wood, roughness: 0.9 }, 1.5);
  M.woodDark = std({ map: TEX.wood, color: 0x8c7b66, roughness: 0.9 }, 1.5);
  M.crate = std({ map: TEX.wood, color: 0xc9b089, roughness: 0.9 }, 1);
  M.asphalt = std({ map: TEX.asphalt, roughness: 0.95 }, 6);
  M.dirt = std({ map: TEX.dirt, roughness: 1 }, 4);
  M.tiles = std({ map: TEX.tiles, roughness: 0.7 }, 1.5);
  M.roof = std({ map: TEX.roof, roughness: 0.85 }, 2);
  M.sandbag = std({ map: TEX.sandbag, roughness: 1 }, 0.6);
  M.steel = std({ map: TEX.metalNoise, color: 0x6d7275, roughness: 0.5, metalness: 0.35 }, 1);
  M.steelOrange = std({ map: TEX.metalNoise, color: 0xc05f1c, roughness: 0.6, metalness: 0.4 }, 1);
  M.steelBlue = std({ map: TEX.metalNoise, color: 0x2f5d8a, roughness: 0.6, metalness: 0.4 }, 1);
  M.steelYellow = std({ map: TEX.metalNoise, color: 0xd1a21c, roughness: 0.6, metalness: 0.3 }, 1);
  M.rust = std({ map: TEX.metalNoise, color: 0x7a4a2c, roughness: 0.85, metalness: 0.3 }, 1);
  M.dark = std({ color: 0x1c1d1f, roughness: 0.6 });
  M.rubber = std({ color: 0x18181a, roughness: 0.9 });
  M.glass = std({ color: 0x26343c, roughness: 0.15, metalness: 0.3 });
  M.lightW = std({ color: 0xeeeedd, emissive: 0x333322, roughness: 0.3 });
  M.lightR = std({ color: 0xa01010, emissive: 0x300000, roughness: 0.3 });
  M.chain = std({ map: TEX.chain, alphaTest: 0.45, side: THREE.DoubleSide, color: 0xb0b4b4, metalness: 0.3, roughness: 0.5 }, 0.6);
  M.chain.userData.noCast = true;
  M.canvas = std({ map: TEX.sandbag, color: 0x6b6e4a, roughness: 1 }, 1.5);
  M.trunk = std({ color: 0x4f3d2c, roughness: 1, flatShading: true });
  M.pine = std({ color: 0x2c4a2c, roughness: 0.95, flatShading: true });
  M.pine2 = std({ color: 0x38542f, roughness: 0.95, flatShading: true });
  M.leaf = [0x4d6b2f, 0x5b7834, 0x6c7d38, 0x7f7a36].map(c => std({ color: c, roughness: 0.95, flatShading: true }));
  M.bush = [0x46622c, 0x55702f, 0x3e5a2a].map(c => std({ color: c, roughness: 0.95, flatShading: true }));
  M.rock = std({ map: TEX.concrete, color: 0x9a968c, roughness: 1, flatShading: true }, 2);
  M.paintW = std({ color: 0xd8d6cc, roughness: 0.8 }); M.paintY = std({ color: 0xc9a227, roughness: 0.8 });
  M.sign = std({ map: TEX.sign, roughness: 0.6 }); M.sign.userData.keepUV = true;
  M.signW = std({ map: TEX.signW, roughness: 0.6 }); M.signW.userData.keepUV = true;
  M.contColors = [0x8e2f24, 0x2c5677, 0x33613b, 0xb8661f, 0x777b7c, 0x5a3d6b, 0x9a8a3a].map(c => std({ map: TEX.corrugated, color: c, roughness: 0.65, metalness: 0.35 }, 2.6));
  M.carColors = [0x7b2a22, 0x2d4b6b, 0x5c6458, 0x8a8576, 0x3b3f2c, 0x9b7a2a, 0x3a3a3c].map(c => std({ map: TEX.metalNoise, color: c, roughness: 0.5, metalness: 0.25 }, 1));
}

// ---------- Primitive builders ----------
// Solid box from corner to corner; cm = collision material (null for decoration)
function B(x0, y0, z0, x1, y1, z1, mat, cm = 'concrete', bullets = true) {
  const w = x1 - x0, h = y1 - y0, d = z1 - z0; if (w <= 0.001 || h <= 0.001 || d <= 0.001) return;
  const g = new THREE.BoxGeometry(w, h, d); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  staticAdd(g, mat, mat.userData.s || 2);
  if (cm) addCollider(x0, y0, z0, x1, y1, z1, cm, bullets);
}
// Any geometry placed with a yaw, decoration only
function G(geo, mat, x, y, z, ry = 0, rx = 0, rz = 0) {
  const g = geo.clone ? geo.clone() : geo;
  if (rz) g.rotateZ(rz); if (rx) g.rotateX(rx); if (ry) g.rotateY(ry);
  g.translate(x, y, z); staticAdd(g, mat, mat.userData.s || 2, !!mat.userData.keepUV);
}
// Bake a whole group of meshes into the static world
function addGroupStatic(group) {
  group.updateMatrixWorld(true);
  group.traverse(o => { if (o.isMesh) { const g = o.geometry.clone().applyMatrix4(o.matrixWorld); staticAdd(g, o.material, o.material.userData.s || 2, !!o.material.userData.keepUV); } });
}
// Flat ground surface patch (no collision), records surface type and stops grass growing there
function pad(x0, z0, x1, z1, mat, y = 0.015, surface = 'concrete', grass = true) {
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0); g.rotateX(-Math.PI / 2); g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
  staticAdd(g, mat, mat.userData.s || 2);
  MAP.surf.push({ x0, z0, x1, z1, s: surface });
  if (grass) MAP.noGrass.push({ x0, z0, x1, z1 });
}
// Wall along x at depth z with openings. ops: [{c (from x0), w, b, t}] heights from y0
function wallX(x0, x1, z, t, y0, y1, mat, ops = [], cm = 'concrete', trim = M.concreteDark) {
  ops = ops.slice().sort((a, b) => a.c - b.c); let cur = x0;
  for (const o of ops) {
    const a = x0 + o.c - o.w / 2, b = x0 + o.c + o.w / 2;
    if (a > cur) B(cur, y0, z - t / 2, a, y1, z + t / 2, mat, cm);
    if (o.b > 0) { B(a, y0, z - t / 2, b, y0 + o.b, z + t / 2, mat, cm); if (trim) B(a - 0.06, y0 + o.b - 0.07, z - t / 2 - 0.07, b + 0.06, y0 + o.b, z + t / 2 + 0.07, trim, null); }
    if (y0 + o.t < y1) B(a, y0 + o.t, z - t / 2, b, y1, z + t / 2, mat, cm);
    if (trim) B(a - 0.04, y0 + o.t, z - t / 2 - 0.03, b + 0.04, y0 + o.t + 0.08, z + t / 2 + 0.03, trim, null);   // lintel
    cur = b;
  }
  if (cur < x1) B(cur, y0, z - t / 2, x1, y1, z + t / 2, mat, cm);
}
function wallZ(z0, z1, x, t, y0, y1, mat, ops = [], cm = 'concrete', trim = M.concreteDark) {
  ops = ops.slice().sort((a, b) => a.c - b.c); let cur = z0;
  for (const o of ops) {
    const a = z0 + o.c - o.w / 2, b = z0 + o.c + o.w / 2;
    if (a > cur) B(x - t / 2, y0, cur, x + t / 2, y1, a, mat, cm);
    if (o.b > 0) { B(x - t / 2, y0, a, x + t / 2, y0 + o.b, b, mat, cm); if (trim) B(x - t / 2 - 0.07, y0 + o.b - 0.07, a - 0.06, x + t / 2 + 0.07, y0 + o.b, b + 0.06, trim, null); }
    if (y0 + o.t < y1) B(x - t / 2, y0 + o.t, a, x + t / 2, y1, b, mat, cm);
    if (trim) B(x - t / 2 - 0.03, y0 + o.t, a - 0.04, x + t / 2 + 0.03, y0 + o.t + 0.08, b + 0.04, trim, null);
    cur = b;
  }
  if (cur < z1) B(x - t / 2, y0, cur, x + t / 2, y1, z1, mat, cm);
}
const door = (c, w = 1.3) => ({ c, w, b: 0, t: 2.25 });
const win = (c, w = 1.6, b = 1.0, t = 2.2) => ({ c, w, b, t });
// Straight stairs: start at (x,z) going in dir ('+x','-x','+z','-z'), n steps
function stairs(x, z, dir, width, rise, run, n, mat, cm = 'concrete', open = false) {
  for (let i = 0; i < n; i++) {
    const a = i * run, b = (i + 1) * run, top = (i + 1) * rise, bot = open ? top - 0.07 : 0;
    const hw = width / 2;
    if (dir === '+x') B(x + a, bot, z - hw, x + b, top, z + hw, mat, cm);
    else if (dir === '-x') B(x - b, bot, z - hw, x - a, top, z + hw, mat, cm);
    else if (dir === '+z') B(x - hw, bot, z + a, x + hw, top, z + b, mat, cm);
    else B(x - hw, bot, z - b, x + hw, top, z - a, mat, cm);
  }
}

// ---------- Props ----------
function crate(x, z, s = 1, y = 0, rot = 0) {
  B(x - s / 2, y, z - s / 2, x + s / 2, y + s, z + s / 2, M.crate, 'wood');
  // darker plank frame around the edges
  const e = 0.06, f = M.woodDark;
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => B(x + a * s / 2 - e / 2 + (a < 0 ? e / 2 : -e / 2) * 0, y, z + b * s / 2 - e / 2, x + a * s / 2 + e / 2, y + s, z + b * s / 2 + e / 2, f, null));
  B(x - s / 2 - 0.01, y + s - e, z - s / 2 - 0.01, x + s / 2 + 0.01, y + s + 0.01, z + s / 2 + 0.01, f, null);
  B(x - s / 2 - 0.01, y, z - s / 2 - 0.01, x + s / 2 + 0.01, y + e, z + s / 2 + 0.01, f, null);
}
function barrel(x, z, mat = M.steelBlue, y = 0) {
  const g = new THREE.CylinderGeometry(0.29, 0.29, 0.88, 18); G(g, mat, x, y + 0.44, z);
  [0.2, 0.62].forEach(h => G(new THREE.TorusGeometry(0.292, 0.012, 4, 18), mat, x, y + h, z, 0, Math.PI / 2));
  G(new THREE.CylinderGeometry(0.27, 0.27, 0.01, 18), M.dark, x, y + 0.885, z);
  addCollider(x - 0.29, y, z - 0.29, x + 0.29, y + 0.88, z + 0.29, 'metal');
}
function pallet(x, z, y = 0, alongX = true) {
  const L = 1.2, W = 1.0;
  const hx = alongX ? L / 2 : W / 2, hz = alongX ? W / 2 : L / 2;
  for (let i = 0; i < 5; i++) { const o = -0.42 + i * 0.21; if (alongX) B(x - hx, y + 0.12, z + o - 0.05, x + hx, y + 0.145, z + o + 0.05, M.wood, null); else B(x + o - 0.05, y + 0.12, z - hz, x + o + 0.05, y + 0.145, z + hz, M.wood, null); }
  [-1, 0, 1].forEach(k => { if (alongX) B(x - hx, y, z + k * 0.42 - 0.05, x + hx, y + 0.12, z + k * 0.42 + 0.05, M.woodDark, null); else B(x + k * 0.42 - 0.05, y, z - hz, x + k * 0.42 + 0.05, y + 0.12, z + hz, M.woodDark, null); });
  addCollider(x - hx, y, z - hz, x + hx, y + 0.145, z + hz, 'wood');
}
function sandbags(x0, z0, x1, z1, layers = 3) {
  const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0), len = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
  const n = Math.max(1, Math.round(len / 0.56)), bag = rboxGeo(0.56, 0.17, 0.32, 0.07, 2);
  for (let l = 0; l < layers; l++) for (let i = 0; i < n - (l % 2); i++) {
    const t = (i + 0.5 + (l % 2) * 0.5) / n, x = lerp(x0, x1, t), z = lerp(z0, z1, t);
    G(bag, M.sandbag, x + rr(-0.02, 0.02), 0.085 + l * 0.165, z + rr(-0.02, 0.02), (alongX ? 0 : Math.PI / 2) + rr(-0.08, 0.08));
  }
  const h = layers * 0.165 + 0.02;
  addCollider(Math.min(x0, x1) - (alongX ? 0 : 0.18), 0, Math.min(z0, z1) - (alongX ? 0.18 : 0), Math.max(x0, x1) + (alongX ? 0 : 0.18), h, Math.max(z0, z1) + (alongX ? 0.18 : 0), 'dirt');
}
const _jerseyGeo = () => profileGeo([[-0.3, 0], [0.3, 0], [0.3, 0.08], [0.13, 0.3], [0.08, 0.81], [-0.08, 0.81], [-0.13, 0.3], [-0.3, 0.08]], 3.0, 0.01);
function jersey(x, z, alongX = true) {
  const g = _jerseyGeo(); if (!alongX) g.rotateY(Math.PI / 2); g.translate(x, 0, z); staticAdd(g, M.concrete, 3);
  // the shape spans z in the profile; extrusion runs along x, so a barrier "alongX" is 3 m long in x
  if (alongX) addCollider(x - 1.5, 0, z - 0.3, x + 1.5, 0.81, z + 0.3, 'concrete');
  else addCollider(x - 0.3, 0, z - 1.5, x + 0.3, 0.81, z + 1.5, 'concrete');
}
function rock(x, z, s) {
  const g = new THREE.IcosahedronGeometry(s, 0), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * rr(0.8, 1.2), p.getY(i) * rr(0.5, 0.8), p.getZ(i) * rr(0.8, 1.2));
  g.computeVertexNormals(); G(g, M.rock, x, s * 0.25, z, rr(0, TAU));
  addCollider(x - s * 0.8, 0, z - s * 0.8, x + s * 0.8, s * 0.8, z + s * 0.8, 'concrete');
}
// A wrecked car, length along local x, yawed
function car(x, z, yaw, colorIdx) {
  const grp = new THREE.Group(), paint = M.carColors[colorIdx % M.carColors.length];
  mesh(rboxGeo(4.3, 0.62, 1.8, 0.14, 2), paint, 0, 0.66, 0, grp);
  mesh(rboxGeo(2.2, 0.58, 1.64, 0.16, 2), M.glass, -0.25, 1.24, 0, grp);
  mesh(rboxGeo(2.0, 0.08, 1.6, 0.03, 1), paint, -0.25, 1.53, 0, grp);
  [-1.08, 0.54].forEach(px => mesh(new THREE.BoxGeometry(0.1, 0.55, 1.62), paint, px - 0.25, 1.22, 0, grp));   // pillars
  mesh(rboxGeo(0.12, 0.22, 1.84, 0.04, 1), M.dark, 2.18, 0.48, 0, grp); mesh(rboxGeo(0.12, 0.22, 1.84, 0.04, 1), M.dark, -2.18, 0.48, 0, grp);
  [-0.65, 0.65].forEach(pz => { mesh(new THREE.BoxGeometry(0.03, 0.12, 0.3), M.lightW, 2.16, 0.74, pz, grp); mesh(new THREE.BoxGeometry(0.03, 0.12, 0.25), M.lightR, -2.16, 0.74, pz, grp); });
  const tyre = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 18); tyre.rotateX(Math.PI / 2);
  const hub = new THREE.CylinderGeometry(0.18, 0.18, 0.25, 10); hub.rotateX(Math.PI / 2);
  [[1.35, 0.85], [1.35, -0.85], [-1.35, 0.85], [-1.35, -0.85]].forEach(([px, pz], i) => { const flat = i === 2 ? 0.08 : 0; mesh(tyre, M.rubber, px, 0.34 - flat, pz, grp).scale.y = 1 - flat; mesh(hub, M.steel, px, 0.34 - flat, pz, grp); });
  mesh(new THREE.BoxGeometry(0.02, 0.3, 0.5), M.dark, 0.7, 0.75, 0.905, grp); // door seam
  grp.position.set(x, 0, z); grp.rotation.y = yaw; addGroupStatic(grp);
  const c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw)), ex = c * 2.2 + s * 0.92, ez = s * 2.2 + c * 0.92;
  addCollider(x - ex, 0, z - ez, x + ex, 1.15, z + ez, 'metal');
  addCollider(x - ex * 0.6, 1.15, z - ez * 0.6, x + ex * 0.6, 1.58, z + ez * 0.6, 'metal');
}
// Military truck with a canvas-covered bed, length along local x
function truck(x, z, yaw) {
  const grp = new THREE.Group(), paint = M.carColors[4];
  mesh(rboxGeo(7.2, 0.35, 2.3, 0.05, 1), M.dark, 0, 0.95, 0, grp);       // chassis
  mesh(rboxGeo(1.9, 1.7, 2.3, 0.15, 2), paint, 2.55, 1.95, 0, grp);       // cab
  mesh(new THREE.BoxGeometry(0.05, 0.6, 2.0), M.glass, 3.51, 2.3, 0, grp);
  mesh(rboxGeo(1.1, 0.9, 2.2, 0.12, 2), paint, 3.9, 1.5, 0, grp);         // engine hood
  mesh(rboxGeo(4.8, 0.6, 2.4, 0.04, 1), paint, -1.1, 1.45, 0, grp);       // bed
  // canvas cover: a half cylinder lying along x (after rotateZ, theta 0..PI is the upper half)
  const cover = new THREE.CylinderGeometry(1.2, 1.2, 4.8, 14, 1, false, 0, Math.PI); cover.rotateZ(Math.PI / 2);
  mesh(cover, M.canvas, -1.1, 1.75, 0, grp);
  const tyre = new THREE.CylinderGeometry(0.5, 0.5, 0.36, 18); tyre.rotateX(Math.PI / 2);
  [[2.6, 1.05], [2.6, -1.05], [-0.6, 1.05], [-0.6, -1.05], [-2.0, 1.05], [-2.0, -1.05]].forEach(([px, pz]) => mesh(tyre, M.rubber, px, 0.5, pz, grp));
  grp.position.set(x, 0, z); grp.rotation.y = yaw; addGroupStatic(grp);
  const c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw)), ex = c * 3.6 + s * 1.2, ez = s * 3.6 + c * 1.2;
  addCollider(x - ex, 0.25, z - ez, x + ex, 2.95, z + ez, 'metal');
}
function forklift(x, z, yaw) {
  const grp = new THREE.Group();
  mesh(rboxGeo(2.0, 0.9, 1.1, 0.1, 2), M.steelYellow, 0, 0.75, 0, grp);
  mesh(rboxGeo(0.7, 0.7, 1.1, 0.12, 2), M.dark, -0.75, 0.9, 0, grp); // counterweight
  [[-0.5, 1], [0.5, 1]].forEach(([px]) => { mesh(new THREE.BoxGeometry(0.06, 1.2, 0.06), M.dark, px, 1.8, 0.5, grp); mesh(new THREE.BoxGeometry(0.06, 1.2, 0.06), M.dark, px, 1.8, -0.5, grp); });
  mesh(new THREE.BoxGeometry(1.1, 0.06, 1.1), M.dark, 0, 2.4, 0, grp);
  mesh(new THREE.BoxGeometry(0.1, 2.6, 0.9), M.dark, 1.05, 1.4, 0, grp); // mast
  [-0.3, 0.3].forEach(pz => mesh(new THREE.BoxGeometry(1.1, 0.05, 0.12), M.steel, 1.6, 0.12, pz, grp));
  const tyre = new THREE.CylinderGeometry(0.3, 0.3, 0.22, 14); tyre.rotateX(Math.PI / 2);
  [[0.6, 0.55], [0.6, -0.55], [-0.6, 0.55], [-0.6, -0.55]].forEach(([px, pz]) => mesh(tyre, M.rubber, px, 0.3, pz, grp));
  grp.position.set(x, 0, z); grp.rotation.y = yaw; addGroupStatic(grp);
  const c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw)), ex = c * 1.3 + s * 0.6, ez = s * 1.3 + c * 0.6;
  addCollider(x - ex, 0, z - ez, x + ex, 1.25, z + ez, 'metal');
}
// 20 ft shipping container. alongX: long side runs along x. open: one end open with doors swung out
function container(cx, cz, alongX, y0, mat, open = false) {
  const L = 6.06, W = 2.44, H = 2.59, hx = alongX ? L / 2 : W / 2, hz = alongX ? W / 2 : L / 2;
  const x0 = cx - hx, x1 = cx + hx, z0 = cz - hz, z1 = cz + hz, y1 = y0 + H;
  const dark = M.dark, t = 0.06;
  if (!open) B(x0, y0, z0, x1, y1, z1, mat, 'metal');
  else {
    B(x0, y0, z0, x1, y0 + 0.12, z1, M.woodDark, 'wood');
    B(x0, y1 - t, z0, x1, y1, z1, mat, 'metal');
    if (alongX) { B(x0, y0, z0, x1, y1, z0 + t, mat, 'metal'); B(x0, y0, z1 - t, x1, y1, z1, mat, 'metal'); B(x1 - t, y0, z0, x1, y1, z1, mat, 'metal'); }
    else { B(x0, y0, z0, x0 + t, y1, z1, mat, 'metal'); B(x1 - t, y0, z0, x1, y1, z1, mat, 'metal'); B(x0, y0, z1 - t, x1, y1, z1, mat, 'metal'); }
    // doors swung flat against the sides
    if (alongX) { B(x0 - 1.2, y0 + 0.05, z0 - 0.06, x0, y1 - 0.05, z0, mat, 'metal'); B(x0 - 1.2, y0 + 0.05, z1, x0, y1 - 0.05, z1 + 0.06, mat, 'metal'); }
    else { B(x0 - 0.06, y0 + 0.05, z0 - 1.2, x0, y1 - 0.05, z0, mat, 'metal'); B(x1, y0 + 0.05, z0 - 1.2, x1 + 0.06, y1 - 0.05, z0, mat, 'metal'); }
  }
  // corner posts, top and bottom rails
  const p = 0.16;
  [[x0, z0], [x1, z0], [x0, z1], [x1, z1]].forEach(([px, pz]) => B(px - (px === x0 ? 0.01 : p - 0.01), y0, pz - (pz === z0 ? 0.01 : p - 0.01), px + (px === x0 ? p - 0.01 : 0.01), y1 + 0.005, pz + (pz === z0 ? p - 0.01 : 0.01), dark, null));
  if (alongX) { [z0 - 0.015, z1 - 0.1].forEach(z => { B(x0, y0, z, x1, y0 + 0.14, z + 0.115, dark, null); B(x0, y1 - 0.12, z, x1, y1 + 0.005, z + 0.115, dark, null); }); }
  else { [x0 - 0.015, x1 - 0.1].forEach(x => { B(x, y0, z0, x + 0.115, y0 + 0.14, z1, dark, null); B(x, y1 - 0.12, z0, x + 0.115, y1 + 0.005, z1, dark, null); }); }
  // locking bars on the closed door end
  if (!open) {
    const rod = new THREE.CylinderGeometry(0.018, 0.018, H - 0.3, 6);
    for (let k = 0; k < 4; k++) {
      const o = -W / 2 + 0.35 + k * ((W - 0.7) / 3);
      if (alongX) G(rod, M.steel, x1 + 0.03, y0 + H / 2, cz + o); else G(rod, M.steel, cx + o, y0 + H / 2, z1 + 0.03);
    }
  }
}
function fenceX(x0, x1, z, h = 2.2, gaps = []) {
  let segs = [[x0, x1]];
  gaps.forEach(([a, b]) => { segs = segs.flatMap(([s, e]) => (b <= s || a >= e) ? [[s, e]] : [[s, a], [b, e]].filter(([u, v]) => v - u > 0.2)); });
  segs.forEach(([s, e]) => {
    const g = new THREE.PlaneGeometry(e - s, h); g.translate((s + e) / 2, h / 2 + 0.05, z); staticAdd(g, M.chain, 0.6);
    addCollider(s, 0, z - 0.04, e, h, z + 0.04, 'metal', false);
    G(xcylGeo(0.03, e - s, 6), M.steel, (s + e) / 2, h + 0.05, z);
    for (let x = s; x <= e + 0.01; x += Math.max(1, (e - s) / Math.ceil((e - s) / 3))) G(new THREE.CylinderGeometry(0.04, 0.04, h + 0.1, 8), M.steel, x, (h + 0.1) / 2, z);
  });
}
function fenceZ(z0, z1, x, h = 2.2, gaps = []) {
  let segs = [[z0, z1]];
  gaps.forEach(([a, b]) => { segs = segs.flatMap(([s, e]) => (b <= s || a >= e) ? [[s, e]] : [[s, a], [b, e]].filter(([u, v]) => v - u > 0.2)); });
  segs.forEach(([s, e]) => {
    const g = new THREE.PlaneGeometry(e - s, h); g.rotateY(Math.PI / 2); g.translate(x, h / 2 + 0.05, (s + e) / 2); staticAdd(g, M.chain, 0.6);
    addCollider(x - 0.04, 0, s, x + 0.04, h, e, 'metal', false);
    const r = new THREE.CylinderGeometry(0.03, 0.03, e - s, 6); r.rotateX(Math.PI / 2); G(r, M.steel, x, h + 0.05, (s + e) / 2);
    for (let z = s; z <= e + 0.01; z += Math.max(1, (e - s) / Math.ceil((e - s) / 3))) G(new THREE.CylinderGeometry(0.04, 0.04, h + 0.1, 8), M.steel, x, (h + 0.1) / 2, z);
  });
}
function woodFenceX(x0, x1, z, h = 1.2) {
  for (let x = x0; x < x1 - 0.05; x += 0.16) B(x, 0, z - 0.02, x + 0.12, h + rr(-0.05, 0.05), z + 0.02, M.wood, null);
  B(x0, h * 0.25, z - 0.05, x1, h * 0.25 + 0.08, z - 0.02, M.woodDark, null); B(x0, h * 0.75, z - 0.05, x1, h * 0.75 + 0.08, z - 0.02, M.woodDark, null);
  addCollider(x0, 0, z - 0.05, x1, h, z + 0.05, 'wood');
}
function woodFenceZ(z0, z1, x, h = 1.2) {
  for (let z = z0; z < z1 - 0.05; z += 0.16) B(x - 0.02, 0, z, x + 0.02, h + rr(-0.05, 0.05), z + 0.12, M.wood, null);
  B(x - 0.05, h * 0.25, z0, x - 0.02, h * 0.25 + 0.08, z1, M.woodDark, null); B(x - 0.05, h * 0.75, z0, x - 0.02, h * 0.75 + 0.08, z1, M.woodDark, null);
  addCollider(x - 0.05, 0, z0, x + 0.05, h, z1, 'wood');
}
function desk(x, z, alongX = true) {
  const hx = alongX ? 0.75 : 0.38, hz = alongX ? 0.38 : 0.75;
  B(x - hx, 0.72, z - hz, x + hx, 0.77, z + hz, M.woodDark, null);
  B(x - hx + 0.03, 0, z - hz + 0.03, x - hx + 0.43, 0.72, z + hz - 0.03, M.steel, null);   // drawer pedestal
  B(x + hx - 0.07, 0, z - hz + 0.03, x + hx - 0.03, 0.72, z + hz - 0.03, M.steel, null);
  addCollider(x - hx, 0, z - hz, x + hx, 0.77, z + hz, 'wood');
}
function cabinet(x, z, alongX = true) {
  const hx = alongX ? 0.45 : 0.3, hz = alongX ? 0.3 : 0.45;
  B(x - hx, 0, z - hz, x + hx, 1.35, z + hz, M.steel, 'metal');
  for (let k = 0; k < 3; k++) { const y = 0.3 + k * 0.42; if (alongX) B(x - 0.1, y, z - hz - 0.02, x + 0.1, y + 0.03, z + hz + 0.02, M.dark, null); else B(x - hx - 0.02, y, z - 0.1, x + hx + 0.02, y + 0.03, z + 0.1, M.dark, null); }
}
function shelfUnit(x, z, len, alongX, h = 2) {
  const hx = alongX ? len / 2 : 0.25, hz = alongX ? 0.25 : len / 2;
  [0.05, 0.7, 1.35, h].forEach(y => B(x - hx, y - 0.04, z - hz, x + hx, y, z + hz, M.steel, 'metal'));
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => B(x + a * hx - (a > 0 ? 0.05 : 0), 0, z + b * hz - (b > 0 ? 0.05 : 0), x + a * hx + (a < 0 ? 0.05 : 0), h, z + b * hz + (b < 0 ? 0.05 : 0), M.steel, 'metal'));
  // stock on the shelves
  [0.05, 0.7, 1.35].forEach(y => { for (let i = 0; i < len / 0.4 - 1; i++) if (rng() < 0.7) { const t = -len / 2 + 0.25 + i * 0.4, s = rr(0.22, 0.32), hh = rr(0.2, 0.45); if (alongX) B(x + t - s / 2, y, z - s / 2, x + t + s / 2, y + hh, z + s / 2, M.crate, null); else B(x - s / 2, y, z + t - s / 2, x + s / 2, y + hh, z + t + s / 2, M.crate, null); } });
}

// ---------- Foliage ----------
function jitter(g, amt) { const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) + rr(-amt, amt), p.getY(i) + rr(-amt, amt) * 0.6, p.getZ(i) + rr(-amt, amt)); g.computeVertexNormals(); return g; }
function pine(x, z, h, y = 0, collide = true) {
  G(new THREE.CylinderGeometry(0.07 * h / 8, 0.22 * h / 8, h * 0.55, 7), M.trunk, x, y + h * 0.27, z);
  const n = 4;
  for (let i = 0; i < n; i++) {
    const t = i / n, r = h * (0.32 - t * 0.2), ch = h * (0.42 - t * 0.06);
    const g = jitter(new THREE.ConeGeometry(r, ch, 8, 2).toNonIndexed(), r * 0.12);
    G(g, i % 2 ? M.pine : M.pine2, x, y + h * 0.22 + t * h * 0.6 + ch / 2, z, rr(0, TAU));
  }
  if (collide) addCollider(x - 0.22, 0, z - 0.22, x + 0.22, h * 0.6, z + 0.22, 'wood');
}
function broadleaf(x, z, h, y = 0, collide = true) {
  G(new THREE.CylinderGeometry(0.12, 0.22, h * 0.55, 7), M.trunk, x, y + h * 0.27, z);
  const b = new THREE.CylinderGeometry(0.05, 0.1, h * 0.35, 5);
  G(b, M.trunk, x + 0.35, y + h * 0.5, z, 0, 0, -0.7); G(b, M.trunk, x - 0.3, y + h * 0.55, z + 0.1, 0.5, 0, 0.6);
  const leaf = M.leaf[Math.floor(rng() * M.leaf.length)];
  const k = 4 + Math.floor(rng() * 3);
  for (let i = 0; i < k; i++) {
    const r = h * rr(0.14, 0.22), a = rng() * TAU, d = i === 0 ? 0 : h * rr(0.12, 0.22);
    const g = jitter(new THREE.IcosahedronGeometry(r, 1), r * 0.15);
    G(g, leaf, x + Math.cos(a) * d, y + h * rr(0.62, 0.85), z + Math.sin(a) * d, rr(0, TAU));
  }
  if (collide) addCollider(x - 0.24, 0, z - 0.24, x + 0.24, h * 0.55, z + 0.24, 'wood');
}
function bush(x, z, s = 1) {
  const mat = M.bush[Math.floor(rng() * M.bush.length)], k = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < k; i++) {
    const r = s * rr(0.45, 0.75), a = rng() * TAU, d = i === 0 ? 0 : s * rr(0.3, 0.6);
    const g = jitter(new THREE.IcosahedronGeometry(r, 1), r * 0.18); g.scale(1, 0.75, 1);
    G(g, mat, x + Math.cos(a) * d, r * 0.55, z + Math.sin(a) * d, rr(0, TAU));
  }
}
// Is a spot clear of buildings and props (for placing trees, bushes, grass)?
function clearAt(x, z, pad = 1) {
  if (Math.abs(x) > MAP.half - 1.5 || Math.abs(z) > MAP.half - 1.5) return false;
  for (const c of COLL) if (x > c.x0 - pad && x < c.x1 + pad && z > c.z0 - pad && z < c.z1 + pad) return false;
  for (const r of MAP.noGrass) if (x > r.x0 - pad * 0.5 && x < r.x1 + pad * 0.5 && z > r.z0 - pad * 0.5 && z < r.z1 + pad * 0.5) return false;
  return true;
}
function terrainY(x, z) {   // flat inside the walls, rolling hills outside
  const d = Math.max(Math.abs(x), Math.abs(z)) - (MAP.half + 4);
  if (d <= 0) return 0;
  return smoothT(d / 30) * (5 + 4 * Math.sin(x * 0.045 + 1.3) * Math.cos(z * 0.038) + 2 * Math.sin(x * 0.11 + z * 0.07));
}

// ---------- Buildings ----------
function office(ox, oz) {
  const W = 18, D = 14, t = 0.3, H1 = 3.45, H2 = 6.4;
  const X = lx => ox + lx, Z = lz => oz + lz, ext = M.plaster, inn = M.plasterIn;
  // ground floor outer walls
  wallX(X(0), X(W), Z(0), t, 0, H1, ext, [door(4), win(9), win(14)]);
  wallX(X(0), X(W), Z(D), t, 0, H1, ext, [win(3), door(9, 1.6), win(14)]);
  wallZ(Z(0), Z(D), X(0), t, 0, H1, ext, [win(7)]);
  wallZ(Z(0), Z(D), X(W), t, 0, H1, ext, [door(3), win(10.5)]);
  // upper floor outer walls
  wallX(X(0), X(W), Z(0), t, H1, H2, ext, [win(3), win(9), win(14)]);
  wallX(X(0), X(W), Z(D), t, H1, H2, ext, [win(3), win(9), win(14)]);
  wallZ(Z(0), Z(D), X(0), t, H1, H2, ext, [win(3.5), win(10.5)]);
  wallZ(Z(0), Z(D), X(W), t, H1, H2, ext, [win(3.5), win(10.5)]);
  // concrete plinth band and floor line
  B(X(-0.2), 0, Z(-0.2), X(W + 0.2), 0.35, Z(-0.15), M.concreteDark, null); B(X(-0.2), 0, Z(D + 0.15), X(4.2), 0.35, Z(D + 0.2), M.concreteDark, null); B(X(9.8), 0, Z(D + 0.15), X(W + 0.2), 0.35, Z(D + 0.2), M.concreteDark, null);
  B(X(-0.2), H1 - 0.25, Z(-0.2), X(W + 0.2), H1, Z(D + 0.2), M.concreteDark, null);
  // ground interior walls
  wallX(X(0.15), X(12), Z(7), 0.15, 0, 3.2, inn, [door(5.85, 1.2)], 'concrete', null);
  wallZ(Z(0.15), Z(7), X(12), 0.15, 0, 3.2, inn, [door(3.35, 1.2)], 'concrete', null);
  wallZ(Z(7), Z(D - 0.15), X(12), 0.15, 0, 3.2, inn, [{ c: 3.6, w: 3, b: 0, t: 2.5 }], 'concrete', null);
  // stairs up the east side, climbing north
  stairs(X(16.7), Z(12.6), '-z', 2.1, 0.246, 0.35, 14, M.concrete);
  // second floor slab with the stair hole
  B(X(0.15), 3.2, Z(0.15), X(15.6), H1, Z(D - 0.15), M.concrete);
  B(X(15.6), 3.2, Z(0.15), X(W - 0.15), H1, Z(7.7), M.concrete);
  B(X(15.6), 3.2, Z(12.65), X(W - 0.15), H1, Z(D - 0.15), M.concrete);
  B(X(15.55), H1, Z(7.7), X(15.65), H1 + 1.0, Z(12.65), M.steel, 'metal');
  B(X(15.55), H1, Z(12.6), X(W - 0.15), H1 + 1.0, Z(12.7), M.steel, 'metal');
  // upper interior walls
  wallX(X(0.15), X(15.5), Z(7), 0.15, H1, H2, inn, [door(3.85, 1.2), door(10.85, 1.2)], 'concrete', null);
  wallZ(Z(7.05), Z(D - 0.15), X(7.6), 0.15, H1, H2, inn, [door(3.5, 1.2)], 'concrete', null);
  // roof and parapet
  B(X(-0.15), H2, Z(-0.15), X(W + 0.15), H2 + 0.25, Z(D + 0.15), M.concreteDark);
  B(X(-0.15), H2 + 0.25, Z(-0.15), X(W + 0.15), H2 + 1.0, Z(0.05), M.concreteDark); B(X(-0.15), H2 + 0.25, Z(D - 0.05), X(W + 0.15), H2 + 1.0, Z(D + 0.15), M.concreteDark);
  B(X(-0.15), H2 + 0.25, Z(0.05), X(0.05), H2 + 1.0, Z(D - 0.05), M.concreteDark); B(X(W - 0.05), H2 + 0.25, Z(0.05), X(W + 0.15), H2 + 1.0, Z(D - 0.05), M.concreteDark);
  B(X(3), H2 + 0.25, Z(3), X(5), H2 + 1.4, Z(4.2), M.steel, null);   // AC units
  B(X(8), H2 + 0.25, Z(9), X(9.6), H2 + 1.2, Z(10.4), M.steel, null);
  G(new THREE.CylinderGeometry(1, 1, 1.8, 16), M.rust, X(14), H2 + 1.6, Z(4));
  // floors
  pad(X(0.15), Z(0.15), X(W - 0.15), Z(D - 0.15), M.tiles, 0.012, 'concrete');
  { const g = new THREE.PlaneGeometry(W - 0.3, D - 0.3); g.rotateX(-Math.PI / 2); g.translate(X(W / 2), H1 + 0.004, Z(D / 2)); staticAdd(g, M.tiles, 1.5); }
  // furniture: desks and cabinets for cover
  desk(X(3), Z(3)); desk(X(7), Z(3)); desk(X(3), Z(5.2)); cabinet(X(11.3), Z(1)); cabinet(X(0.7), Z(9), false);
  desk(X(5), Z(10.5)); desk(X(9), Z(11.5), false); cabinet(X(14.6), Z(1.0)); crate(X(14), Z(5), 0.9);
  // upstairs
  [[3, 2.5], [9, 2.5], [13, 4.5]].forEach(([a, b]) => { const y = H1; B(X(a) - 0.75, y + 0.72, Z(b) - 0.38, X(a) + 0.75, y + 0.77, Z(b) + 0.38, M.woodDark, null); B(X(a) - 0.72, y, Z(b) - 0.35, X(a) - 0.3, y + 0.72, Z(b) + 0.35, M.steel, null); B(X(a) + 0.68, y, Z(b) - 0.35, X(a) + 0.72, y + 0.72, Z(b) + 0.35, M.steel, null); addCollider(X(a) - 0.75, y, Z(b) - 0.38, X(a) + 0.75, y + 0.77, Z(b) + 0.38, 'wood'); });
  crate(X(4), Z(11), 1, H1); crate(X(4.9), Z(11.2), 0.7, H1); B(X(10), H1, Z(10), X(11.4), H1 + 1.35, Z(10.6), M.steel, 'metal'); crate(X(13.5), Z(11.5), 1, H1);
  MAP.noGrass.push({ x0: X(-1), z0: Z(-1), x1: X(W + 1), z1: Z(D + 1) });
}
function warehouse(ox, oz) {
  const W = 26, D = 20, t = 0.25, H = 7.5, X = lx => ox + lx, Z = lz => oz + lz, mat = M.corrBlue;
  const hw = c => ({ c, w: 2.2, b: 5.6, t: 6.6 });
  wallX(X(0), X(W), Z(D), t, 0, H, mat, [{ c: 8, w: 5, b: 0, t: 5 }, door(20, 1.2), hw(3), hw(14), hw(23.5)], 'metal', M.steel);
  wallX(X(0), X(W), Z(0), t, 0, H, mat, [door(18, 1.2), hw(6), hw(13), hw(22)], 'metal', M.steel);
  wallZ(Z(0), Z(D), X(0), t, 0, H, mat, [{ c: 10, w: 5, b: 0, t: 5 }, hw(3.5), hw(16.5)], 'metal', M.steel);
  wallZ(Z(0), Z(D), X(W), t, 0, H, mat, [door(10, 1.2), hw(4), hw(16)], 'metal', M.steel);
  B(X(-0.2), 0, Z(-0.2), X(W + 0.2), 0.6, Z(-0.12), M.concreteDark, null); B(X(-0.2), 0, Z(D + 0.12), X(5.5), 0.6, Z(D + 0.2), M.concreteDark, null); B(X(10.5), 0, Z(D + 0.12), X(W + 0.2), 0.6, Z(D + 0.2), M.concreteDark, null);
  // roof with a shallow pitch, and steel trusses under it
  B(X(-0.3), H, Z(-0.3), X(W + 0.3), H + 0.2, Z(D + 0.3), M.corrGrey, 'metal');
  const s = D / 2 + 0.5, a = Math.atan2(1.2, s), L = Math.hypot(s, 1.2);
  [-1, 1].forEach(k => { const g = new THREE.BoxGeometry(W + 0.8, 0.08, L); g.rotateX(k * a); g.translate(X(W / 2), H + 0.2 + 0.6, Z(D / 2) + k * s / 2); staticAdd(g, M.corrGrey, 3); });
  for (let x = 3; x < W; x += 4) { B(X(x) - 0.08, H - 0.45, Z(0.2), X(x) + 0.08, H - 0.15, Z(D - 0.2), M.steel, null); B(X(x) - 0.03, H - 0.9, Z(0.2), X(x) + 0.03, H - 0.45, Z(D - 0.2), M.steel, null); }
  B(X(5.4), 5, Z(D - 0.05), X(10.6), 5.4, Z(D + 0.3), M.steelYellow, null);   // roller door housing
  // sign over the big door
  { const g = new THREE.PlaneGeometry(4, 1); g.translate(X(8), 6.0, Z(D) + 0.14); staticAdd(g, M.signW, 1, true); }
  pad(X(0.1), Z(0.1), X(W - 0.1), Z(D - 0.1), M.concrete, 0.012, 'concrete');
  pad(X(3), Z(D), X(13), Z(D + 6), M.concrete, 0.013, 'concrete');
  // racking
  const rack = (lx0, lx1, lz, h = 4.6) => {
    const z0 = Z(lz), z1 = Z(lz + 1.2);
    for (let x = lx0; x <= lx1 + 0.01; x += 2.75) { B(X(x) - 0.05, 0, z0, X(x) + 0.05, h, z0 + 0.1, M.steelBlue, 'metal'); B(X(x) - 0.05, 0, z1 - 0.1, X(x) + 0.05, h, z1, M.steelBlue, 'metal'); }
    [0.15, 1.6, 3.05, 4.5].forEach(y => { B(X(lx0), y - 0.12, z0, X(lx1), y, z0 + 0.08, M.steelOrange, 'metal'); B(X(lx0), y - 0.12, z1 - 0.08, X(lx1), y, z1, M.steelOrange, 'metal'); B(X(lx0), y - 0.03, z0, X(lx1), y, z1, M.woodDark, 'wood'); });
    [0.15, 1.6, 3.05].forEach(y => { for (let x = lx0 + 0.3; x < lx1 - 1; x += rr(1.1, 1.6)) { if (rng() < 0.25) continue; const w = rr(0.8, 1.1), hh = rr(0.6, 1.2); B(X(x), y, z0 + 0.12, X(x + w), y + hh, z1 - 0.12, rng() < 0.5 ? M.crate : M.sandbag, 'wood'); } });
  };
  rack(4, 20.5, 3.2); rack(4, 20.5, 14.2);
  forklift(X(15), Z(9.5), 0.3);
  pallet(X(6), Z(9)); crate(X(6), Z(9), 1, 0.145); crate(X(6.2), Z(9.1), 0.8, 1.145);
  pallet(X(9), Z(11)); crate(X(9), Z(11), 1, 0.145);
  pallet(X(21.5), Z(9.5), 0, false); crate(X(21.5), Z(9.5), 1, 0.145); crate(X(23), Z(6), 1.2); crate(X(23.2), Z(13.5), 1); barrel(X(24.5), Z(2)); barrel(X(25), Z(2.7), M.steelOrange); barrel(X(1.2), Z(18.5));
  MAP.noGrass.push({ x0: X(-1), z0: Z(-1), x1: X(W + 1), z1: Z(D + 1) });
}
function house(ox, oz, W = 9, D = 7, doorSide = 'S') {
  const t = 0.3, H = 3, X = lx => ox + lx, Z = lz => oz + lz, mat = M.brick;
  wallX(X(0), X(W), Z(0), t, 0, H, mat, doorSide === 'N' ? [door(W * 0.3), win(W * 0.72, 1.3)] : [win(W * 0.3, 1.3), win(W * 0.72, 1.3)], 'concrete', M.wood);
  wallX(X(0), X(W), Z(D), t, 0, H, mat, doorSide === 'S' ? [door(W * 0.3), win(W * 0.72, 1.3)] : [win(W * 0.3, 1.3), win(W * 0.72, 1.3)], 'concrete', M.wood);
  wallZ(Z(0), Z(D), X(0), t, 0, H, mat, [win(D / 2, 1.3)], 'concrete', M.wood);
  wallZ(Z(0), Z(D), X(W), t, 0, H, mat, [doorSide === 'E' ? door(D / 2) : win(D / 2, 1.3)], 'concrete', M.wood);
  wallZ(Z(0.15), Z(D - 0.15), X(W * 0.55), 0.15, 0, H, M.plasterIn, [door(D * 0.6, 1.1)], 'concrete', null);
  B(X(-0.15), H - 0.15, Z(-0.15), X(W + 0.15), H, Z(D + 0.15), M.plasterIn);   // ceiling
  // gable roof, ridge along x
  const oh = 0.45, s = D / 2 + oh, rise = 1.7, a = Math.atan2(rise, s), L = Math.hypot(s, rise);
  [-1, 1].forEach(k => { const g = new THREE.BoxGeometry(W + 2 * oh, 0.12, L); g.rotateX(k * a); g.translate(X(W / 2), H + rise / 2 + 0.05, Z(D / 2) + k * s / 2); staticAdd(g, M.roof, 2); });
  const gab = profileGeo([[Z(0), H], [Z(D), H], [Z(D / 2), H + rise - 0.1]], W, 0.001); gab.translate(X(W / 2), 0, 0); staticAdd(gab, M.brick, 2.5);
  addCollider(X(0), H, Z(0), X(W), H + rise * 0.6, Z(D), 'wood');
  B(X(W * 0.7), H, Z(D * 0.3), X(W * 0.7 + 0.6), H + 2.3, Z(D * 0.3 + 0.6), M.brick, null);   // chimney
  pad(X(0.15), Z(0.15), X(W - 0.15), Z(D - 0.15), M.woodDark, 0.012, 'wood');
  // a little furniture
  B(X(1.5), 0.72, Z(1.5), X(2.9), 0.77, Z(2.4), M.woodDark, null); addCollider(X(1.5), 0, Z(1.5), X(2.9), 0.77, Z(2.4), 'wood');
  crate(X(W - 1), Z(1), 0.8); B(X(W * 0.55 + 0.4), 0, Z(D - 1.2), X(W * 0.55 + 2.2), 0.9, Z(D - 0.3), M.woodDark, 'wood');
  MAP.noGrass.push({ x0: X(-0.6), z0: Z(-0.6), x1: X(W + 0.6), z1: Z(D + 0.6) });
}
function gasStation() {
  // shop
  const ox = -44, oz = 24, W = 10, D = 8, H = 3.4, X = lx => ox + lx, Z = lz => oz + lz;
  wallX(X(0), X(W), Z(0), 0.3, 0, H, M.plaster, [door(5, 1.6), { c: 2.2, w: 2.8, b: 0.9, t: 2.5 }, { c: 7.9, w: 2.8, b: 0.9, t: 2.5 }]);
  wallX(X(0), X(W), Z(D), 0.3, 0, H, M.plaster, [door(8)]);
  wallZ(Z(0), Z(D), X(0), 0.3, 0, H, M.plaster, [win(4)]);
  wallZ(Z(0), Z(D), X(W), 0.3, 0, H, M.plaster, [win(4)]);
  B(X(-0.3), H, Z(-0.6), X(W + 0.3), H + 0.3, Z(D + 0.3), M.concreteDark);
  B(X(-0.3), H + 0.3, Z(-0.65), X(W + 0.3), H + 0.95, Z(-0.45), M.paintY, null);
  { const g = new THREE.PlaneGeometry(5, 0.6); g.translate(X(5), H + 0.62, Z(-0.66)); staticAdd(g, M.sign, 1, true); }
  // counter and shelves
  B(X(1), 0, Z(4.6), X(4), 1.05, Z(5.3), M.woodDark, 'wood');
  shelfUnit(X(6.5), Z(3), 3, true, 1.7); shelfUnit(X(6.5), Z(5.6), 3, true, 1.7);
  pad(X(0.15), Z(0.15), X(W - 0.15), Z(D - 0.15), M.tiles, 0.012, 'concrete');
  MAP.noGrass.push({ x0: X(-1), z0: Z(-1), x1: X(W + 1), z1: Z(D + 1) });
  // canopy on four pillars, with pump islands
  const cx0 = -33, cx1 = -17, cz0 = 9, cz1 = 20, ch = 4.6;
  B(cx0, ch, cz0, cx1, ch + 0.45, cz1, M.paintW);
  B(cx0 - 0.02, ch + 0.05, cz0 - 0.02, cx1 + 0.02, ch + 0.4, cz0, M.paintY, null);
  [[-30, 11.5], [-20, 11.5], [-30, 17.5], [-20, 17.5]].forEach(([x, z]) => B(x - 0.25, 0, z - 0.25, x + 0.25, ch, z + 0.25, M.paintW));
  [12.5, 16.5].forEach(z => {
    B(-28, 0, z - 0.45, -22, 0.2, z + 0.45, M.concreteDark);
    [-26.5, -23.5].forEach(x => {
      B(x - 0.4, 0.2, z - 0.3, x + 0.4, 1.9, z + 0.3, M.carColors[0], 'metal');
      B(x - 0.35, 1.3, z - 0.31, x + 0.35, 1.7, z + 0.31, M.glass, null);
      B(x - 0.42, 1.9, z - 0.32, x + 0.42, 2.05, z + 0.32, M.paintW, null);
    });
  });
  pad(-48, 6, -14, 36, M.concrete, 0.014, 'concrete');
  // price sign on a pole by the road
  B(-15.2, 0, 6.3, -14.8, 5.5, 6.7, M.steel);
  B(-16.5, 5.0, 6.35, -13.5, 6.6, 6.65, M.paintY, 'metal');
  { const g = new THREE.PlaneGeometry(2.8, 1.4); g.translate(-15, 5.8, 6.67); staticAdd(g, M.sign, 1, true); }
}
function watchtower(x, z) {
  const h = 3.0, s = 1.6;
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => B(x + a * s - 0.1, 0, z + b * s - 0.1, x + a * s + 0.1, h + 1.1, z + b * s + 0.1, M.woodDark, 'wood'));
  B(x - s - 0.1, h - 0.15, z - s - 0.1, x + s + 0.1, h, z + s + 0.1, M.wood, 'wood');
  // parapet of planks on three sides, gap on the stair side (east)
  B(x - s - 0.1, h, z - s - 0.1, x + s + 0.1, h + 1.05, z - s + 0.02, M.wood, 'wood');
  B(x - s - 0.1, h, z + s - 0.02, x + s + 0.1, h + 1.05, z + s + 0.1, M.wood, 'wood');
  B(x - s - 0.1, h, z - s - 0.1, x - s + 0.02, h + 1.05, z + s + 0.1, M.wood, 'wood');
  B(x + s - 0.02, h, z - s - 0.1, x + s + 0.1, h + 1.05, z - 0.4, M.wood, 'wood');
  // roof
  B(x - s - 0.4, h + 2.3, z - s - 0.4, x + s + 0.4, h + 2.42, z + s + 0.4, M.roof, 'wood');
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => B(x + a * s - 0.06, h + 1.05, z + b * s - 0.06, x + a * s + 0.06, h + 2.3, z + b * s + 0.06, M.woodDark, null));
  // cross braces
  [[-1], [1]].forEach(([a]) => { const g = new THREE.BoxGeometry(0.08, Math.hypot(2 * s, h), 0.08); g.rotateX(Math.atan2(2 * s, h)); g.translate(x + a * s, h / 2, z); staticAdd(g, M.woodDark, 1.5); });
  // open wooden stairs climbing west up to the gap
  stairs(x + s + 3.3, z + 0.5, '-x', 0.9, 0.25, 0.28, 12, M.wood, 'wood', true);
  [-0.45, 0.45].forEach(o => { const len = Math.hypot(3.36, 3), g = new THREE.BoxGeometry(len, 0.18, 0.06); g.rotateZ(-Math.atan2(3, 3.36)); g.translate(x + s + 3.3 - 1.68, 1.45, z + 0.5 + o); staticAdd(g, M.woodDark, 1.5); });
  sandbags(x - s + 0.3, z - s + 0.25, x + s - 0.3, z - s + 0.25, 2);
}
function guardBooth(x, z) {
  const s = 1.25, H = 2.6;
  wallX(x - s, x + s, z - s, 0.15, 0, H, M.plaster, [win(1.25, 1.6, 1.0, 2.0)]);
  wallX(x - s, x + s, z + s, 0.15, 0, H, M.plaster, [door(1.25, 0.9)]);
  wallZ(z - s, z + s, x - s, 0.15, 0, H, M.plaster, [win(1.25, 1.6, 1.0, 2.0)]);
  wallZ(z - s, z + s, x + s, 0.15, 0, H, M.plaster, [win(1.25, 1.6, 1.0, 2.0)]);
  B(x - s - 0.3, H, z - s - 0.3, x + s + 0.3, H + 0.15, z + s + 0.3, M.concreteDark);
  // boom barrier
  B(x + s + 0.2, 0, z - 0.2, x + s + 0.6, 1.0, z + 0.2, M.steel, 'metal');
  G(xcylGeo(0.05, 6, 8), M.paintW, x + s + 3.5, 1.0, z);
  for (let k = 0; k < 6; k++) G(xcylGeo(0.052, 0.5, 8), M.lightR, x + s + 1 + k, 1.0, z);
}

// ---------- Assemble ----------
function buildMap(scene) {
  rng = makeRng(1337);
  buildMaterials();
  const H = MAP.half;
  // Ground (with hills outside the wall) and macro colour variation so tiling never shows
  {
    const N = 120, size = 420, g = new THREE.PlaneGeometry(size, size, N, N); g.rotateX(-Math.PI / 2);
    const p = g.attributes.position, col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i); p.setY(i, terrainY(x, z));
      const n = 0.5 + 0.25 * Math.sin(x * 0.07 + Math.cos(z * 0.05) * 2) + 0.25 * Math.sin(z * 0.09 + x * 0.02);
      const dry = smoothT(n);
      col[i * 3] = lerp(0.92, 1.12, dry); col[i * 3 + 1] = lerp(0.98, 1.02, dry); col[i * 3 + 2] = lerp(0.9, 0.85, dry);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / 7, p.getZ(i) / 7);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: TEX.ground, vertexColors: true, roughness: 1 }));
    m.receiveShadow = true; scene.add(m);
  }
  // Roads: an E-W highway and a N-S road meeting at a checkpoint in the middle
  pad(-H, -4, H, 4, M.asphalt, 0.02, 'concrete'); pad(-3.5, -H, 3.5, -4, M.asphalt, 0.021, 'concrete'); pad(-3.5, 4, 3.5, H, M.asphalt, 0.021, 'concrete');
  for (let x = -H; x < H; x += 6) if (Math.abs(x) > 6) { const g = new THREE.PlaneGeometry(3, 0.15); g.rotateX(-Math.PI / 2); g.translate(x + 1.5, 0.026, 0); staticAdd(g, M.paintW, 1); }
  for (let z = -H; z < H; z += 6) if (Math.abs(z) > 6) { const g = new THREE.PlaneGeometry(0.15, 3); g.rotateX(-Math.PI / 2); g.translate(0, 0.027, z + 1.5); staticAdd(g, M.paintY, 1); }
  [-3.75, 3.75].forEach(z => { const g = new THREE.PlaneGeometry(2 * H, 0.18); g.rotateX(-Math.PI / 2); g.translate(0, 0.026, z); staticAdd(g, M.paintW, 1); });
  // dirt tracks into the village and the yard
  pad(-74, -46, -28, -41, M.dirt, 0.018, 'dirt'); pad(-36, -41, -31, -4, M.dirt, 0.018, 'dirt');
  // Perimeter wall with posts and razor wire
  const wallH = 3.6;
  B(-H - 0.5, 0, -H - 0.5, H + 0.5, wallH, -H, M.concrete); B(-H - 0.5, 0, H, H + 0.5, wallH, H + 0.5, M.concrete);
  B(-H - 0.5, 0, -H, -H, wallH, H, M.concrete); B(H, 0, -H, H + 0.5, wallH, H, M.concrete);
  for (let k = -H; k <= H; k += 4) { B(k - 0.15, 0, -H - 0.1, k + 0.15, wallH + 0.25, -H + 0.12, M.concreteDark, null); B(k - 0.15, 0, H - 0.12, k + 0.15, wallH + 0.25, H + 0.1, M.concreteDark, null); B(-H - 0.1, 0, k - 0.15, -H + 0.12, wallH + 0.25, k + 0.15, M.concreteDark, null); B(H - 0.12, 0, k - 0.15, H + 0.1, wallH + 0.25, k + 0.15, M.concreteDark, null); }
  const wire = (ax, az, bx, bz) => {
    const pts = [], n = Math.floor(Math.hypot(bx - ax, bz - az) * 2.2), dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz), nx = -dz / L, nz = dx / L;
    for (let i = 0; i <= n * 8; i++) { const t = i / (n * 8), a = t * n * TAU; pts.push(new V3(ax + dx * t + nx * Math.cos(a) * 0.28, wallH + 0.32 + Math.sin(a) * 0.28, az + dz * t + nz * Math.cos(a) * 0.28)); }
    const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length, 0.008, 3); staticAdd(g, M.steel, 1, true);
  };
  wire(-H, -H + 0.1, H, -H + 0.1); wire(-H, H - 0.1, H, H - 0.1); wire(-H + 0.1, -H, -H + 0.1, H); wire(H - 0.1, -H, H - 0.1, H);

  // Buildings
  office(10, -30);
  pad(8, -15, 30, -5, M.asphalt, 0.019, 'concrete');   // car park
  for (let x = 11; x < 29; x += 3) { const g = new THREE.PlaneGeometry(0.12, 4); g.rotateX(-Math.PI / 2); g.translate(x, 0.024, -9.5); staticAdd(g, M.paintW, 1); }
  warehouse(42, -72);
  house(-70, -70); house(-56, -72, 8, 7); house(-70, -56, 9, 7, 'E'); house(-50, -56, 8, 6, 'N');
  house(-66, 52, 9, 7, 'N'); house(-50, 60, 8, 7, 'N');
  woodFenceX(-70, -60, 64); woodFenceZ(52, 64, -71.5); woodFenceX(-52, -40, 70); woodFenceZ(60, 70, -38);
  gasStation();
  watchtower(-18, -18);
  guardBooth(8, 8);

  // Container yard (south-east), fenced with gates
  pad(28, 18, 78, 74, M.concreteDark, 0.014, 'concrete');
  fenceX(28, 78, 18, 2.4, [[36, 40], [58, 63]]); fenceZ(18, 74, 28, 2.4, [[30, 34], [50, 54], [64, 68]]);
  const cm = () => M.contColors[Math.floor(rng() * M.contColors.length)];
  [[35, 27, 1, 0], [42, 27, 1, 0], [42, 27, 1, 1], [57, 26, 1, 0], [64, 26, 1, 0], [64, 26, 1, 1],
   [34, 40, 0, 0], [47, 42, 0, 0], [47, 42, 0, 1], [61, 40, 0, 0], [71, 39, 0, 0],
   [37, 54, 1, 0], [44, 55, 1, 0], [44, 55, 1, 1], [57, 54, 1, 0], [65, 53, 1, 0], [72, 56, 0, 0],
   [36, 66, 1, 0], [50, 66, 1, 0], [57, 67, 1, 0], [57, 67, 1, 1], [69, 68, 1, 0]].forEach(([x, z, ax, lv]) => container(x, z, !!ax, lv * 2.59, cm()));
  container(54, 47, true, 0, cm(), true); container(39, 47, false, 0, cm(), true);
  crate(52, 33, 1.2); crate(52.9, 33.4, 0.9); crate(52.3, 33.2, 0.8, 1.2); pallet(68, 33); pallet(68, 33, 0.145); barrel(31, 60); barrel(31.7, 60.4, M.steelOrange); barrel(75, 45); barrel(74.5, 45.7, M.rust);
  sandbags(48, 60, 52, 60, 3);

  // Checkpoint at the crossroads
  sandbags(-8, -7, -4.5, -7, 3); sandbags(-8, -7, -8, -10, 3);
  sandbags(5, 6.5, 5, 10.5, 3);
  jersey(0, -13, true); jersey(-1.5, 14, true); jersey(14, 0.8, false); jersey(-14, -1, false); jersey(20, -1.5, false); jersey(-26, 1.8, false);
  jersey(-5.5, 17, false); jersey(5.5, -18, false);

  // Vehicles
  car(16, -9.5, Math.PI / 2 + 0.05, 0); car(22, -10, Math.PI / 2 - 0.08, 1); car(27, -12, 0.3, 2);
  car(-24, -1, 0.08, 3); car(36, 1.5, Math.PI + 0.15, 4); car(-58, 1, -0.2, 5); car(1.5, 34, Math.PI / 2 + 0.2, 6); car(-1, -48, Math.PI / 2 - 0.1, 2);
  car(-24.5, 14.5, 0.0, 1); car(62, -2, 0.1, 0); car(-1.8, 64, Math.PI / 2 + 0.15, 3);
  truck(34, -58, Math.PI / 2); truck(-40, -26, 0.1);

  // Scattered cover
  crate(-30, 30, 1.1); crate(-29.1, 30.4, 0.8); barrel(-46.5, 22); barrel(-46, 21.3, M.steelOrange); pallet(-36.5, 33.5);
  crate(-60, -40, 1.2); crate(-58.8, -40.2, 1); crate(-59.5, -40, 0.8, 1.2); pallet(-43, -38);
  crate(32, -22, 1.2); crate(33.2, -22.4, 1); barrel(30.5, -24); sandbags(34, -40, 38, -40, 3); sandbags(38, -40, 38, -43, 3);
  crate(16, 24, 1.1); crate(17.1, 24.5, 0.9); barrel(15, 26); pallet(19, 22); sandbags(14, 30, 18, 30, 3);
  crate(-14, 44, 1.2); sandbags(-18, 50, -14, 50, 3); crate(10, 52, 1.1); crate(10.8, 53, 0.9);
  crate(56, -30, 1.2); barrel(58, -30.5); sandbags(60, -26, 64, -26, 3); crate(70, -14, 1.2); crate(71.1, -13.6, 0.9);
  crate(-70, 18, 1.2); crate(-69, 18.4, 0.8); sandbags(-66, 12, -62, 12, 3); barrel(-74, 30);
  crate(-6, -60, 1.2); sandbags(-10, -66, -6, -66, 3); crate(10, -66, 1); crate(10.8, -65.2, 0.8); barrel(12, -64);
  crate(24, 70, 1.2); crate(-26, 72, 1.1); sandbags(-30, 66, -26, 66, 3);
  rock(-20, 30, 1.4); rock(-8, 40, 1.1); rock(20, 46, 1.6); rock(-62, -16, 1.3); rock(-36, 52, 1.2); rock(72, -48, 1.5); rock(14, -46, 1.2); rock(-12, -34, 1.0); rock(76, 8, 1.2);

  // Trees: a wood in the north-west, tree lines elsewhere, and dense forest beyond the wall
  const placeTree = (x, z) => { if (!clearAt(x, z, 2.2)) return; const h = rr(7, 12); rng() < 0.55 ? pine(x, z, h) : broadleaf(x, z, h * 0.8); };
  for (let i = 0; i < 70; i++) placeTree(rr(-34, -6), rr(-72, -24));
  for (let i = 0; i < 26; i++) placeTree(rr(-78, -40), rr(-30, -6));
  for (let i = 0; i < 20; i++) placeTree(rr(-78, -8), rr(8, 46));
  for (let i = 0; i < 18; i++) placeTree(rr(6, 26), rr(36, 78));
  for (let i = 0; i < 14; i++) placeTree(rr(30, 78), rr(-44, -8));
  for (let i = 0; i < 10; i++) placeTree(rr(-78, 78), rr(74, 80));
  for (let i = 0; i < 360; i++) {
    const a = rng() * TAU, r = rr(H + 6, 160), x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.max(Math.abs(x), Math.abs(z)) < H + 5) continue;
    const h = rr(9, 16); rng() < 0.75 ? pine(x, z, h, terrainY(x, z) - 0.3, false) : broadleaf(x, z, h * 0.8, terrainY(x, z) - 0.3, false);
  }
  for (let i = 0; i < 170; i++) { const x = rr(-H + 2, H - 2), z = rr(-H + 2, H - 2); if (clearAt(x, z, 1.2)) bush(x, z, rr(0.8, 1.4)); }
  for (let i = 0; i < 40; i++) { const x = rr(-34, -6), z = rr(-72, -24); if (clearAt(x, z, 1)) bush(x, z, rr(0.9, 1.5)); }

  staticBuild(scene);
  buildGrass(scene);
  buildSpawns();
}

// Instanced grass tufts
let GRASS = null;
function buildGrass(scene) {
  const g = new THREE.BufferGeometry(), pos = [], uv = [], nor = [];
  for (let k = 0; k < 3; k++) {
    const a = k * Math.PI / 3, c = Math.cos(a) * 0.35, s = Math.sin(a) * 0.35, h = 0.42;
    const quad = [[-c, 0, -s, 0, 0], [c, 0, s, 1, 0], [c, h, s, 1, 1], [-c, 0, -s, 0, 0], [c, h, s, 1, 1], [-c, h, -s, 0, 1]];
    quad.forEach(([x, y, z, u, v]) => { pos.push(x, y, z); uv.push(u, v); nor.push(0, 1, 0); });
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  const mat = new THREE.MeshLambertMaterial({ map: TEX.grass, alphaTest: 0.5, side: THREE.DoubleSide, color: 0x9aa47a }); mat.color.convertSRGBToLinear();
  const N = 10000, im = new THREE.InstancedMesh(g, mat, N), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new V3(), p = new V3();
  let n = 0;
  for (let i = 0; i < N * 3 && n < N; i++) {
    const x = rr(-MAP.half + 1, MAP.half - 1), z = rr(-MAP.half + 1, MAP.half - 1);
    if (!clearAt(x, z, 0.4)) continue;
    q.setFromAxisAngle(UP, rng() * TAU); const k = rr(0.6, 1.25); s.set(k, k * rr(0.55, 1.0), k); p.set(x, 0, z);
    m4.compose(p, q, s); im.setMatrixAt(n++, m4);
  }
  im.count = n; im.receiveShadow = true; scene.add(im); GRASS = im;
}
// Spawn points spread around the edges and in a few buildings, nudged until they are clear
function buildSpawns() {
  const cand = [[-74, -76], [-40, -78], [-8, -76], [22, -78], [74, -76], [76, -36], [76, 12], [76, 44], [74, 78], [44, 78], [10, 78], [-24, 78], [-74, 76], [-77, 40], [-77, 2], [-77, -30],
    [19, -27], [55, -62], [-61, -67], [-39, 28], [-20, -40], [40, 10], [12, 40], [-50, -10], [-12, 60]];
  cand.forEach(([x, z]) => {
    for (let r = 0; r < 6; r += 0.5) {
      let ok = false;
      for (let a = 0; a < TAU; a += 0.8) {
        const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
        if (spotFree(px, pz)) { MAP.spawns.push({ x: px, z: pz, yaw: Math.atan2(px, pz) }); ok = true; break; }
        if (r === 0) break;
      }
      if (ok) break;
    }
  });
}
function spotFree(x, z) {
  if (Math.abs(x) > MAP.half - 1 || Math.abs(z) > MAP.half - 1) return false;
  for (const c of COLL) if (c.solid && x > c.x0 - 0.6 && x < c.x1 + 0.6 && z > c.z0 - 0.6 && z < c.z1 + 0.6 && c.y0 < 1.9 && c.y1 > 0.3) return false;
  return true;
}
// Surface under a point, for footstep sounds
function surfaceAt(x, z, y) {
  for (const c of COLL) if (c.solid && x >= c.x0 && x <= c.x1 && z >= c.z0 && z <= c.z1 && Math.abs(c.y1 - y) < 0.12) return c.mat === 'dirt' ? 'grass' : c.mat;
  for (let i = MAP.surf.length - 1; i >= 0; i--) { const r = MAP.surf[i]; if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1 && y < 0.3) return r.s === 'dirt' ? 'grass' : r.s; }
  return 'grass';
}
