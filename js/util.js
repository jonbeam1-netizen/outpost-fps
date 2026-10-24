'use strict';
// ---------- Shared helpers: math, procedural textures, geometry builders, static batching, collision ----------
const TAU = Math.PI * 2, V3 = THREE.Vector3, UP = new V3(0, 1, 0), DOWN = new V3(0, -1, 0);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const smoothT = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const rand = (a, b) => a + Math.random() * (b - a);
const angLerp = (a, b, t) => { let d = ((b - a) % TAU + TAU * 1.5) % TAU - TAU / 2; return a + d * t; };
const $ = id => document.getElementById(id);
// seeded random, so every player builds the exact same map
function makeRng(seed) { let a = seed >>> 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// ---------- Canvas textures ----------
const TEX = {};
function canvasTex(w, h, draw, opts = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  if (!opts.linear) t.encoding = THREE.sRGBEncoding;
  return t;
}
function grain(g, w, h, amt, mono = true) {
  const img = g.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amt;
    d[i] += n; d[i + 1] += mono ? n : (Math.random() - 0.5) * amt; d[i + 2] += mono ? n : (Math.random() - 0.5) * amt;
  }
  g.putImageData(img, 0, 0);
}
function blotches(g, w, h, n, rMin, rMax, colorFn) {
  for (let i = 0; i < n; i++) {
    const x = Math.random() * w, y = Math.random() * h, r = rand(rMin, rMax);
    g.fillStyle = colorFn(); g.beginPath();
    for (let a = 0; a < TAU; a += 0.5) { const rr = r * (0.7 + Math.random() * 0.5); g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    g.fill();
    // wrap so the texture tiles
    if (x < rMax || x > w - rMax || y < rMax || y > h - rMax) {
      g.save(); g.translate(x < w / 2 ? w : -w, 0); g.beginPath(); g.arc(x, y, r * 0.85, 0, TAU); g.fill(); g.restore();
      g.save(); g.translate(0, y < h / 2 ? h : -h); g.beginPath(); g.arc(x, y, r * 0.85, 0, TAU); g.fill(); g.restore();
    }
  }
}
function buildTextures() {
  TEX.concrete = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#8f8e88'; g.fillRect(0, 0, w, h);
    blotches(g, w, h, 60, 10, 60, () => `rgba(${rand(90, 130)|0},${rand(90, 125)|0},${rand(85, 115)|0},0.12)`);
    grain(g, w, h, 26);
    g.strokeStyle = 'rgba(40,40,38,0.35)'; g.lineWidth = 1;
    for (let i = 0; i < 6; i++) { g.beginPath(); let x = Math.random() * w, y = Math.random() * h; g.moveTo(x, y); for (let k = 0; k < 8; k++) { x += rand(-18, 18); y += rand(4, 20); g.lineTo(x, y); } g.stroke(); }
    // form-tie holes and a seam, like poured concrete panels
    g.fillStyle = 'rgba(50,50,48,0.5)'; for (let x = 64; x < w; x += 128) for (let y = 64; y < h; y += 128) { g.beginPath(); g.arc(x, y, 3, 0, TAU); g.fill(); }
    g.fillStyle = 'rgba(60,60,56,0.35)'; g.fillRect(0, 0, w, 2); g.fillRect(0, 0, 2, h);
    // water streaks
    for (let i = 0; i < 14; i++) { const x = Math.random() * w, gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(50,48,40,0.18)'); gr.addColorStop(1, 'rgba(50,48,40,0)'); g.fillStyle = gr; g.fillRect(x, 0, rand(3, 10), h * rand(0.3, 0.9)); }
  });
  TEX.plaster = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#b9ae96'; g.fillRect(0, 0, w, h);
    blotches(g, w, h, 80, 8, 50, () => `rgba(${rand(120, 170)|0},${rand(110, 150)|0},${rand(90, 120)|0},0.12)`);
    grain(g, w, h, 20);
    for (let i = 0; i < 20; i++) { const x = Math.random() * w, gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(70,60,40,0.22)'); gr.addColorStop(1, 'rgba(70,60,40,0)'); g.fillStyle = gr; g.fillRect(x, 0, rand(2, 8), h * rand(0.2, 0.7)); }
    g.fillStyle = 'rgba(70,64,52,0.6)'; g.fillRect(0, h - 40, w, 40); // grimy skirting at the base
    grain(g, w, h, 10);
  });
  TEX.brick = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#6e6458'; g.fillRect(0, 0, w, h);
    const bw = 64, bh = 24;
    for (let r = 0; r * bh < h; r++) for (let c = -1; c * bw < w; c++) {
      const x = c * bw + (r % 2 ? bw / 2 : 0), y = r * bh;
      const k = rand(0.75, 1.1); g.fillStyle = `rgb(${(128 * k)|0},${(62 * k)|0},${(46 * k)|0})`;
      g.fillRect(x + 2, y + 2, bw - 4, bh - 4);
      g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(x + 2, y + bh - 6, bw - 4, 4);
    }
    grain(g, w, h, 30);
  });
  TEX.corrugated = canvasTex(256, 256, (g, w, h) => {
    for (let x = 0; x < w; x++) { const v = 150 + Math.sin(x / w * TAU * 8) * 60; g.fillStyle = `rgb(${v|0},${v|0},${v|0})`; g.fillRect(x, 0, 1, h); }
    for (let i = 0; i < 26; i++) { const x = Math.random() * w, gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(110,55,25,0.5)'); gr.addColorStop(1, 'rgba(110,55,25,0)'); g.fillStyle = gr; g.fillRect(x, rand(0, h * 0.4), rand(2, 7), h * rand(0.2, 0.7)); }
    blotches(g, w, h, 16, 4, 18, () => 'rgba(120,60,30,0.35)');
    grain(g, w, h, 20);
  });
  TEX.wood = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#8a6a45'; g.fillRect(0, 0, w, h);
    const pw = 32;
    for (let x = 0; x < w; x += pw) {
      const k = rand(0.8, 1.15); g.fillStyle = `rgb(${(140 * k)|0},${(104 * k)|0},${(66 * k)|0})`; g.fillRect(x + 1, 0, pw - 2, h);
      g.strokeStyle = 'rgba(60,40,20,0.25)';
      for (let i = 0; i < 6; i++) { g.beginPath(); const xx = x + rand(3, pw - 3); g.moveTo(xx, 0); for (let y = 0; y <= h; y += 16) g.lineTo(xx + Math.sin(y / 30 + i) * 2, y); g.stroke(); }
      g.fillStyle = 'rgba(30,20,10,0.6)'; g.fillRect(x, 0, 1, h);
      g.fillStyle = 'rgba(40,40,40,0.8)'; g.fillRect(x + pw / 2 - 1, 20, 2, 2); g.fillRect(x + pw / 2 - 1, 148, 2, 2);
    }
    grain(g, w, h, 18);
  });
  TEX.gunWood = canvasTex(256, 64, (g, w, h) => {
    g.fillStyle = '#6b3a1e'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) { g.strokeStyle = `rgba(${rand(30, 60)|0},${rand(12, 25)|0},5,${rand(0.2, 0.5)})`; g.lineWidth = rand(0.5, 2); g.beginPath(); const y0 = Math.random() * h; g.moveTo(0, y0); for (let x = 0; x <= w; x += 16) g.lineTo(x, y0 + Math.sin(x / rand(20, 50)) * rand(1, 4)); g.stroke(); }
    grain(g, w, h, 12);
  });
  TEX.asphalt = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#3b3c3d'; g.fillRect(0, 0, w, h);
    grain(g, w, h, 40);
    blotches(g, w, h, 30, 10, 50, () => `rgba(${rand(20, 40)|0},${rand(20, 40)|0},${rand(20, 40)|0},0.25)`);
    g.strokeStyle = 'rgba(20,20,20,0.6)'; g.lineWidth = 1.5;
    for (let i = 0; i < 5; i++) { g.beginPath(); let x = Math.random() * w, y = Math.random() * h; g.moveTo(x, y); for (let k = 0; k < 10; k++) { x += rand(-20, 20); y += rand(-20, 20); g.lineTo(x, y); } g.stroke(); }
  });
  TEX.ground = canvasTex(1024, 1024, (g, w, h) => {
    g.fillStyle = '#5b6a3a'; g.fillRect(0, 0, w, h);
    blotches(g, w, h, 160, 10, 70, () => { const r = Math.random(); return r < 0.25 ? `rgba(${rand(100, 125)|0},${rand(90, 105)|0},${rand(60, 75)|0},0.35)` : r < 0.6 ? `rgba(${rand(60, 80)|0},${rand(85, 105)|0},${rand(35, 50)|0},0.3)` : `rgba(${rand(80, 100)|0},${rand(95, 110)|0},${rand(45, 60)|0},0.3)`; });
    for (let i = 0; i < 26000; i++) { const x = Math.random() * w, y = Math.random() * h, l = rand(2, 6); g.strokeStyle = `rgba(${rand(50, 110)|0},${rand(80, 130)|0},${rand(30, 60)|0},0.6)`; g.beginPath(); g.moveTo(x, y); g.lineTo(x + rand(-1.5, 1.5), y - l); g.stroke(); }
    for (let i = 0; i < 600; i++) { g.fillStyle = `rgba(${rand(110, 150)|0},${rand(100, 130)|0},${rand(80, 100)|0},0.7)`; g.fillRect(Math.random() * w, Math.random() * h, rand(1, 3), rand(1, 3)); }
    grain(g, w, h, 18);
  });
  TEX.dirt = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#7a6a50'; g.fillRect(0, 0, w, h);
    blotches(g, w, h, 90, 6, 40, () => `rgba(${rand(80, 120)|0},${rand(65, 95)|0},${rand(45, 65)|0},0.4)`);
    for (let i = 0; i < 1600; i++) { g.fillStyle = `rgba(${rand(120, 170)|0},${rand(110, 150)|0},${rand(90, 120)|0},0.8)`; g.fillRect(Math.random() * w, Math.random() * h, rand(1, 3), rand(1, 3)); }
    grain(g, w, h, 26);
  });
  TEX.tiles = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#5f5a52'; g.fillRect(0, 0, w, h);
    const s = 64; for (let x = 0; x < w; x += s) for (let y = 0; y < h; y += s) { const k = rand(0.85, 1.05); g.fillStyle = `rgb(${(160 * k)|0},${(152 * k)|0},${(138 * k)|0})`; g.fillRect(x + 2, y + 2, s - 4, s - 4); }
    blotches(g, w, h, 16, 6, 26, () => 'rgba(80,70,55,0.18)');
    grain(g, w, h, 14);
  });
  TEX.roof = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#45403b'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) for (let x = (y / 16 % 2) * 12; x < w; x += 24) { const k = rand(0.8, 1.15); g.fillStyle = `rgb(${(92 * k)|0},${(58 * k)|0},${(46 * k)|0})`; g.fillRect(x, y, 22, 14); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x, y + 12, 22, 3); }
    grain(g, w, h, 18);
  });
  TEX.sandbag = canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = '#9a8b66'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 2) { g.fillStyle = `rgba(80,70,50,${rand(0.05, 0.2)})`; g.fillRect(x, 0, 1, h); }
    for (let y = 0; y < h; y += 2) { g.fillStyle = `rgba(80,70,50,${rand(0.05, 0.2)})`; g.fillRect(0, y, w, 1); }
    blotches(g, w, h, 20, 6, 20, () => 'rgba(90,75,50,0.25)');
    grain(g, w, h, 18);
  });
  TEX.chain = canvasTex(64, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(170,175,175,1)'; g.lineWidth = 2;
    for (let k = -1; k <= 1; k++) { g.beginPath(); g.moveTo(k * 32, 0); g.lineTo(k * 32 + 64, 64); g.stroke(); g.beginPath(); g.moveTo(k * 32 + 64, 0); g.lineTo(k * 32, 64); g.stroke(); }
  });
  TEX.leaf = canvasTex(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) { const x = rand(10, w - 10), y = rand(10, h - 10); g.fillStyle = `rgb(${rand(50, 90)|0},${rand(85, 125)|0},${rand(30, 50)|0})`; g.beginPath(); g.ellipse(x, y, rand(4, 8), rand(2, 4), Math.random() * TAU, 0, TAU); g.fill(); }
  });
  TEX.grass = canvasTex(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 46; i++) {
      const x = rand(8, w - 8), lean = rand(-14, 14), top = rand(10, 60);
      g.strokeStyle = `rgb(${rand(70, 120)|0},${rand(100, 145)|0},${rand(35, 60)|0})`; g.lineWidth = rand(1.5, 3);
      g.beginPath(); g.moveTo(x, h); g.quadraticCurveTo(x + lean * 0.3, (h + top) / 2, x + lean, top); g.stroke();
    }
  });
  TEX.camo = {};
  TEX.metalNoise = canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#808080'; g.fillRect(0, 0, w, h); grain(g, w, h, 30); blotches(g, w, h, 10, 4, 14, () => 'rgba(60,60,60,0.25)'); });
  TEX.sign = canvasTex(256, 64, (g, w, h) => { g.fillStyle = '#c9a227'; g.fillRect(0, 0, w, h); g.fillStyle = '#1a1a1a'; g.font = 'bold 40px Rajdhani, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('FUEL · SHOP', w / 2, h / 2 + 2); }, {});
  TEX.signW = canvasTex(256, 64, (g, w, h) => { g.fillStyle = '#e6e2d6'; g.fillRect(0, 0, w, h); g.fillStyle = '#a3241a'; g.fillRect(0, 0, w, 10); g.fillRect(0, h - 10, w, 10); g.fillStyle = '#1a1a1a'; g.font = 'bold 34px Rajdhani, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('WAREHOUSE 3', w / 2, h / 2); });
}
// Clothing camo, tinted per outfit
function camoTex(base, c1, c2, c3) {
  const key = [base, c1, c2, c3].join();
  if (TEX.camo[key]) return TEX.camo[key];
  const t = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    [c1, c2, c3].forEach((c, i) => { if (c) blotches(g, w, h, 26 - i * 6, 8, 26 - i * 4, () => c); });
    for (let y = 0; y < h; y += 2) { g.fillStyle = 'rgba(0,0,0,0.05)'; g.fillRect(0, y, w, 1); }
    grain(g, w, h, 16);
  });
  TEX.camo[key] = t; return t;
}

// ---------- Geometry helpers ----------
// A box whose edges are rounded: a rounded rectangle (w x h) extruded through d, centred on the origin
const _rbCache = new Map();
function rboxGeo(w, h, d, r = 0.004, seg = 2) {
  const key = [w, h, d, r, seg].map(v => v.toFixed(4)).join();
  if (_rbCache.has(key)) return _rbCache.get(key);
  r = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
  const iw = w / 2 - r, ih = h / 2 - r, sh = new THREE.Shape();
  sh.moveTo(-iw, -ih); sh.lineTo(iw, -ih); sh.lineTo(iw, ih); sh.lineTo(-iw, ih); sh.lineTo(-iw, -ih);
  const g = new THREE.ExtrudeGeometry(sh, { depth: d - 2 * r, bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: seg, curveSegments: 4 });
  g.translate(0, 0, -(d - 2 * r) / 2); g.computeVertexNormals();
  _rbCache.set(key, g); return g;
}
// Profile in the side view (z forward/back, y up) extruded across x with a soft bevel. pts = [[z,y],...]
function profileGeo(pts, thick, bevel = 0.002, holes = null) {
  const sh = new THREE.Shape(); sh.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]);
  if (holes) holes.forEach(hp => { const p = new THREE.Path(); p.moveTo(hp[0][0], hp[0][1]); for (let i = 1; i < hp.length; i++) p.lineTo(hp[i][0], hp[i][1]); sh.holes.push(p); });
  const b = Math.min(bevel, thick / 2 - 1e-4);
  const g = new THREE.ExtrudeGeometry(sh, { depth: Math.max(0.0005, thick - 2 * b), bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 6 });
  g.translate(0, 0, -(thick - 2 * b) / 2);
  g.rotateY(-Math.PI / 2);   // shape x -> world z, extrusion -> world x
  g.computeVertexNormals();
  return g;
}
// smooth profile through control points (Catmull-Rom), for curved stocks and magazines
function smoothPts(pts, n = 6, closed = true) {
  const v = pts.map(p => new THREE.Vector2(p[0], p[1]));
  const curve = new THREE.SplineCurve(closed ? v.concat([v[0]]) : v);
  return curve.getPoints(pts.length * n).map(p => [p.x, p.y]);
}
// cylinder lying along z
function zcylGeo(r1, r2, len, seg = 16, open = false) { const g = new THREE.CylinderGeometry(r1, r2, len, seg, 1, open); g.rotateX(Math.PI / 2); return g; }
function xcylGeo(r, len, seg = 12) { const g = new THREE.CylinderGeometry(r, r, len, seg); g.rotateZ(Math.PI / 2); return g; }
function mesh(geo, mat, x = 0, y = 0, z = 0, parent = null) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); if (parent) parent.add(m); return m; }

// Merge every mesh under `root` into one mesh per material (except those inside `keep` groups). Saves draw calls on guns and characters.
function mergeGeos(list) {
  let total = 0; const parts = list.map(g => { const ng = g.index ? g.toNonIndexed() : g; total += ng.attributes.position.count; return ng; });
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uv = new Float32Array(total * 2);
  let o = 0;
  parts.forEach(g => {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    if (g.attributes.normal) nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    o += n;
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return out;
}
function bakeGroup(root, keep = [], shadows = true) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const byMat = new Map(), remove = [];
  const skip = new Set(keep);
  const visit = obj => {
    if (skip.has(obj)) return;
    if (obj.isMesh && obj !== root) {
      const m = new THREE.Matrix4().multiplyMatrices(inv, obj.matrixWorld);
      const g = obj.geometry.clone().applyMatrix4(m);
      if (!byMat.has(obj.material)) byMat.set(obj.material, []);
      byMat.get(obj.material).push(g); remove.push(obj);
    }
    obj.children.forEach(visit);
  };
  root.children.forEach(visit);
  remove.forEach(m => m.parent.remove(m));
  byMat.forEach((geos, mat) => { const mm = new THREE.Mesh(mergeGeos(geos), mat); mm.castShadow = shadows; mm.receiveShadow = shadows; root.add(mm); });
  return root;
}

// ---------- Static world: merged per material, with box-mapped UVs in world metres ----------
const STATIC = new Map();   // material -> {geos:[], scale}
function staticAdd(geo, mat, scale = 2, keepUV = false) {
  if (!STATIC.has(mat)) STATIC.set(mat, { geos: [], scale });
  if (!keepUV) worldUV(geo, scale);
  STATIC.get(mat).geos.push(geo);
}
function worldUV(geo, s) {
  const p = geo.attributes.position, n = geo.attributes.normal; let uv = geo.attributes.uv;
  if (!uv) { uv = new THREE.BufferAttribute(new Float32Array(p.count * 2), 2); geo.setAttribute('uv', uv); }
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ay >= ax && ay >= az) { u = p.getX(i); v = p.getZ(i); }
    else if (ax >= az) { u = p.getZ(i); v = p.getY(i); }
    else { u = p.getX(i); v = p.getY(i); }
    uv.setXY(i, u / s, v / s);
  }
}
function staticBuild(scene) {
  STATIC.forEach((e, mat) => {
    const m = new THREE.Mesh(mergeGeos(e.geos), mat);
    m.castShadow = !mat.userData.noCast; m.receiveShadow = true; m.matrixAutoUpdate = false;
    scene.add(m);
  });
  STATIC.clear();
}

// ---------- Collision world: axis-aligned boxes ----------
// Each collider: {x0,y0,z0,x1,y1,z1, mat:'concrete'|'metal'|'wood'|'dirt'|'foliage', bullets:true}
const COLL = [];
function addCollider(x0, y0, z0, x1, y1, z1, mat = 'concrete', bullets = true, solid = true) {
  const c = { x0: Math.min(x0, x1), y0: Math.min(y0, y1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), y1: Math.max(y0, y1), z1: Math.max(z0, z1), mat, bullets, solid };
  COLL.push(c); return c;
}
// ---------- Broadphase: colliders bucketed into an 8 m grid, so queries only look at what's nearby ----------
const CG = { cs: 8, n: 0, x0: 0, cells: null, stamp: 1 };
function collGridBuild(half) {
  const cs = CG.cs, x0 = -half - 40, n = Math.ceil((half + 40) * 2 / cs), cells = Array.from({ length: n * n }, () => []);
  const ci = v => clamp(Math.floor((v - x0) / cs), 0, n - 1);
  COLL.forEach(c => { c._s = 0; for (let j = ci(c.z0); j <= ci(c.z1); j++) for (let i = ci(c.x0); i <= ci(c.x1); i++) cells[j * n + i].push(c); });
  Object.assign(CG, { n, x0, cells });
}
const _cq = [];
// colliders whose cells touch the box [x0,x1]x[z0,z1] (each once); returns a shared array
function collNear(x0, z0, x1, z1, keep = false) {
  if (!keep) { _cq.length = 0; CG.stamp++; }
  if (!CG.cells) { if (!_cq.length) for (const c of COLL) _cq.push(c); return _cq; }
  const cs = CG.cs, n = CG.n, st = CG.stamp;
  const i0 = clamp(Math.floor((x0 - CG.x0) / cs), 0, n - 1), i1 = clamp(Math.floor((x1 - CG.x0) / cs), 0, n - 1);
  const j0 = clamp(Math.floor((z0 - CG.x0) / cs), 0, n - 1), j1 = clamp(Math.floor((z1 - CG.x0) / cs), 0, n - 1);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const cell = CG.cells[j * n + i]; for (let k = 0; k < cell.length; k++) { const c = cell[k]; if (c._s !== st) { c._s = st; _cq.push(c); } } }
  return _cq;
}
// Ray vs colliders: returns {t, n:[nx,ny,nz], c} of the nearest hit within maxT. Walks the grid in short segments.
function rayWorld(o, d, maxT, forBullets = true) {
  let best = maxT, bn = null, bc = null;
  const ix = 1 / (d.x || 1e-9), iy = 1 / (d.y || 1e-9), iz = 1 / (d.z || 1e-9);
  const seg = CG.cells ? CG.cs * 0.75 : maxT;
  _cq.length = 0; CG.stamp++;
  for (let t0 = 0; t0 < best; t0 += seg) {
    const t1 = Math.min(best, t0 + seg), ax = o.x + d.x * t0, az = o.z + d.z * t0, bx = o.x + d.x * t1, bz = o.z + d.z * t1;
    const from = _cq.length; collNear(Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz), true);
  for (let i = from; i < _cq.length; i++) {
    const c = _cq[i];
    if (forBullets && !c.bullets) continue;
    let t1 = (c.x0 - o.x) * ix, t2 = (c.x1 - o.x) * ix;
    let tmin = Math.min(t1, t2), tmax = Math.max(t1, t2), ax = 0;
    t1 = (c.y0 - o.y) * iy; t2 = (c.y1 - o.y) * iy;
    let a = Math.min(t1, t2), b = Math.max(t1, t2);
    if (a > tmin) { tmin = a; ax = 1; } if (b < tmax) tmax = b;
    t1 = (c.z0 - o.z) * iz; t2 = (c.z1 - o.z) * iz;
    a = Math.min(t1, t2); b = Math.max(t1, t2);
    if (a > tmin) { tmin = a; ax = 2; } if (b < tmax) tmax = b;
    if (tmax < Math.max(tmin, 0) || tmin > best) continue;
    if (tmin < 0) continue;   // started inside
    best = tmin; bc = c;
    bn = ax === 0 ? [-Math.sign(d.x), 0, 0] : ax === 1 ? [0, -Math.sign(d.y), 0] : [0, 0, -Math.sign(d.z)];
  }
    if (best <= t1) break;   // a hit inside this stretch beats anything further on
  }
  // the ground itself (map.js heightfield)
  if (typeof rayTerrain === 'function') {
    const tt = rayTerrain(o, d, best);
    if (tt >= 0 && tt < best) { const x = o.x + d.x * tt, z = o.z + d.z * tt; return { t: tt, n: terrainNormal(x, z), c: TERRAIN_C }; }
  }
  return bc ? { t: best, n: bn, c: bc } : null;
}
const TERRAIN_C = { mat: 'dirt', terrain: true, bullets: true, solid: true };
function terrainNormal(x, z) {
  const e = 0.5, hx = terrainY(x + e, z) - terrainY(x - e, z), hz = terrainY(x, z + e) - terrainY(x, z - e);
  const l = Math.hypot(hx, 2 * e, hz); return [-hx / l, 2 * e / l, -hz / l];
}
const groundY = (x, z) => typeof terrainY === 'function' ? terrainY(x, z) : 0;
// Ray vs foliage volumes only (bots use it for line of sight: you can hide in a bush)
function rayFoliage(o, d, maxT) {
  const ix = 1 / (d.x || 1e-9), iy = 1 / (d.y || 1e-9), iz = 1 / (d.z || 1e-9);
  let depth = 0;
  const ex = o.x + d.x * maxT, ez = o.z + d.z * maxT, list = collNear(Math.min(o.x, ex), Math.min(o.z, ez), Math.max(o.x, ex), Math.max(o.z, ez));
  for (let i = 0; i < list.length; i++) {
    const c = list[i]; if (c.mat !== 'foliage') continue;
    let t1 = (c.x0 - o.x) * ix, t2 = (c.x1 - o.x) * ix, tmin = Math.min(t1, t2), tmax = Math.max(t1, t2);
    t1 = (c.y0 - o.y) * iy; t2 = (c.y1 - o.y) * iy; tmin = Math.max(tmin, Math.min(t1, t2)); tmax = Math.min(tmax, Math.max(t1, t2));
    t1 = (c.z0 - o.z) * iz; t2 = (c.z1 - o.z) * iz; tmin = Math.max(tmin, Math.min(t1, t2)); tmax = Math.min(tmax, Math.max(t1, t2));
    tmin = Math.max(tmin, 0); tmax = Math.min(tmax, maxT);
    if (tmax > tmin) depth += tmax - tmin;
  }
  return depth;   // metres of leaves the ray passes through
}
function inFoliage(x, y, z) {
  const list = collNear(x, z, x, z);
  for (let i = 0; i < list.length; i++) { const c = list[i]; if (c.mat === 'foliage' && x > c.x0 && x < c.x1 && y > c.y0 && y < c.y1 && z > c.z0 && z < c.z1) return true; }
  return false;
}
// Ray vs sphere / vertical capsule (for player hitboxes)
function raySphere(o, d, cx, cy, cz, r) {
  const ox = o.x - cx, oy = o.y - cy, oz = o.z - cz;
  const b = ox * d.x + oy * d.y + oz * d.z, c = ox * ox + oy * oy + oz * oz - r * r;
  const h = b * b - c; if (h < 0) return -1;
  const t = -b - Math.sqrt(h); return t >= 0 ? t : -1;
}
function rayCapsule(o, d, cx, y0, y1, cz, r) {
  // closest approach of the ray to the vertical segment, then a sphere test there
  let best = -1;
  const steps = 6;
  for (let i = 0; i <= steps; i++) {
    const t = raySphere(o, d, cx, lerp(y0, y1, i / steps), cz, r);
    if (t >= 0 && (best < 0 || t < best)) best = t;
  }
  return best;
}
