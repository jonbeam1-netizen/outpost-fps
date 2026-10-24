'use strict';
// ---------- Operators in ghillie suits ----------
// Built facing -z (forward), +x is the operator's right. Feet at y = 0. Two-bone IK legs and arms.
// The whole character uses ONE material: a shared greyscale atlas (burlap / jute strands / leaves / plain / netting) tinted by
// vertex colours, so every limb group bakes down to a single draw call and every outfit shares the same texture.
// pal: jute strand colours, leaf: leaf/rag scrap colours, la: share of strands that are leaf scraps, under: burlap underlay
const OUTFITS = {
  woodland: { name: 'Woodland', base: '#4b5a32', c1: '#6b5a3a', under: '#3f4a2c', glove: '#2e2c24', la: 0.22,
    pal: ['#55663a', '#6a7840', '#46522e', '#7a6a44', '#8a7a50', '#3a4428', '#62703a', '#948656'], leaf: ['#4e6a2a', '#3c5222', '#6a7a34', '#5a4a2a', '#76683a'] },
  deadgrass: { name: 'Dead grass', base: '#9a8650', c1: '#c2a862', under: '#7a6a42', glove: '#4a4030', la: 0.06,
    pal: ['#bca050', '#a08640', '#d0b464', '#84703a', '#b09a58', '#6e5c30', '#dcc274', '#968040'], leaf: ['#a08a50', '#7a6a3e', '#b8a060'] },
  desert: { name: 'Desert', base: '#b09a6c', c1: '#d0bb8a', under: '#94805a', glove: '#6a5a40', la: 0.05,
    pal: ['#c2aa7a', '#a88e60', '#d6c49a', '#9a8056', '#bfa070', '#8a7450', '#e0d0aa'], leaf: ['#a89468', '#8e7a52', '#c6b07e'] },
  urban: { name: 'Rubble', base: '#7a7874', c1: '#a19d95', under: '#5e5c58', glove: '#28282a', la: 0.16,
    pal: ['#8a8782', '#6e6c68', '#a8a49c', '#5a5856', '#94908a', '#7c766c', '#4a4846', '#b4b0a6'], leaf: ['#6a6660', '#8a847a', '#4e4c4a', '#7a7064'] },
  autumn: { name: 'Autumn', base: '#8a4a24', c1: '#b8722e', under: '#5a3a22', glove: '#3a2a1e', la: 0.34,
    pal: ['#9a5228', '#7a3e1e', '#b86a2c', '#6a4a2a', '#a8803e', '#5a3a22', '#c4843a', '#8a6a3a'], leaf: ['#b8501e', '#d07a26', '#a8322a', '#c8a03a', '#7a4020', '#e09038'] },
  swamp: { name: 'Swamp', base: '#2e3420', c1: '#4a4a2c', under: '#23281a', glove: '#1a1c16', la: 0.28,
    pal: ['#3a4228', '#4a5030', '#2c3220', '#5a5634', '#252a1c', '#666038', '#40382a'], leaf: ['#34461e', '#465a28', '#28361a', '#5a5430'] },
  snow: { name: 'Snow', base: '#d8d8d2', c1: '#9a9a96', under: '#c4c4be', glove: '#d0d0ca', la: 0.05,
    pal: ['#e4e4de', '#d2d2cc', '#bcbcb6', '#f0f0ea', '#a8a8a4', '#c8c6bc', '#8e8e8a'], leaf: ['#9a9a94', '#b4b4ae', '#d6d6d0'] },
};
// old saves / net fallbacks still say 'ranger'
Object.defineProperty(OUTFITS, 'ranger', { value: OUTFITS.woodland, enumerable: false });
const SKINS = [0xd29a74, 0xc08562, 0x9a6444, 0x6e4430, 0xe0b090];
const L1 = 0.45, L2 = 0.45, A1 = 0.29, A2 = 0.27;
const _d = new V3(), _n = new V3(), _perp = new V3(), _el = new V3(), _tg = new V3(), _tmp = new V3(), _tmp2 = new V3();
const _q = new THREE.Quaternion(), _m4 = new THREE.Matrix4();
// two-bone IK: positions upper at root, lower at the knee/elbow; both meshes hang along -y. hint = where the knee/elbow points
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

// ---------- The ghillie atlas (greyscale, tinted per vertex) ----------
// uv regions [u0, v0, u1, v1]
const GR = { burlap: [0, 0.5, 0.5, 1], jute: [0.5, 0.5, 1, 1], leaf: [0, 0, 0.5, 0.5], solid: [0.5, 0, 0.75, 0.5], net: [0.75, 0, 1, 0.5] };
function ghAtlas() {
  if (TEX.ghillie) return TEX.ghillie;
  const S = 1024;
  const t = canvasTex(S, S, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const reg = (r, fn) => { const x = r[0] * w, y = (1 - r[3]) * h, rw = (r[2] - r[0]) * w, rh = (r[3] - r[1]) * h; g.save(); g.beginPath(); g.rect(x, y, rw, rh); g.clip(); g.translate(x, y); fn(rw, rh); g.restore(); };
    const grey = (v, a = 1) => `rgba(${v | 0},${v | 0},${v | 0},${a})`;
    // burlap weave
    reg(GR.burlap, (rw, rh) => {
      g.fillStyle = grey(150); g.fillRect(0, 0, rw, rh);
      for (let y = 0; y < rh; y += 5) { g.fillStyle = grey(rand(150, 225)); g.fillRect(0, y, rw, 3); }
      for (let x = 0; x < rw; x += 5) for (let y = (x / 5 % 2) * 5; y < rh; y += 10) { g.fillStyle = grey(rand(160, 235)); g.fillRect(x, y, 3, 5); }
      for (let i = 0; i < 300; i++) { g.strokeStyle = grey(rand(120, 230), 0.6); g.lineWidth = rand(0.6, 1.6); g.beginPath(); const x = Math.random() * rw, y = Math.random() * rh; g.moveTo(x, y); g.quadraticCurveTo(x + rand(-14, 14), y + rand(-14, 14), x + rand(-30, 30), y + rand(-30, 30)); g.stroke(); }
      blotches(g, rw, rh, 40, 10, 40, () => grey(rand(80, 140), 0.18));
    });
    // jute fibres: root at the bottom of the region, tips at the top; ragged lengths so tips fray
    reg(GR.jute, (rw, rh) => {
      for (let pass = 0; pass < 2; pass++) for (let x = 2; x < rw - 2; x += rand(2.5, 5.5)) {
        const top = rh * rand(0.0, pass ? 0.5 : 0.25), wv = rand(2, 6), ph = rand(0, TAU), lw = rand(1.4, 3.4);
        g.strokeStyle = grey(rand(140, 240)); g.lineWidth = lw; g.lineCap = 'round';
        g.beginPath(); g.moveTo(x, rh);
        for (let y = rh; y >= top; y -= 8) g.lineTo(x + Math.sin(y / rh * 9 + ph) * wv * (1 - y / rh) + (rh - y) / rh * rand(-1.5, 1.5), y);
        g.stroke();
        // a split fibre peeling off near the tip
        if (Math.random() < 0.3) { g.lineWidth = lw * 0.6; g.beginPath(); const y0 = lerp(rh, top, rand(0.4, 0.7)); g.moveTo(x, y0); g.quadraticCurveTo(x + rand(-8, 8), (y0 + top) / 2, x + rand(-14, 14), top + rand(0, 20)); g.stroke(); }
      }
      // darker knot band at the root where strands are tied on
      const gr = g.createLinearGradient(0, rh, 0, rh * 0.8); gr.addColorStop(0, 'rgba(0,0,0,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalCompositeOperation = 'source-atop'; g.fillStyle = gr; g.fillRect(0, 0, rw, rh); g.globalCompositeOperation = 'source-over';
    });
    // 4x4 tiles: leaves (stem at the bottom), then torn rag scraps
    reg(GR.leaf, (rw, rh) => {
      const tw = rw / 4;
      for (let i = 0; i < 16; i++) {
        const cx = (i % 4 + 0.5) * tw, by = (Math.floor(i / 4) + 1) * tw - 4;
        g.save(); g.translate(cx, by);
        if (i < 11) {
          const L = tw * rand(0.78, 0.92), W = tw * rand(0.18, 0.4) * (i % 3 === 2 ? 0.5 : 1), n = 14, lobes = i % 4 === 1 ? 3 : 0;
          g.fillStyle = grey(rand(185, 230)); g.beginPath(); g.moveTo(0, 0);
          for (let k = 0; k <= n; k++) { const t = k / n, ww = Math.sin(t * Math.PI) ** 0.8 * W * (1 + (lobes ? Math.sin(t * Math.PI * lobes * 2) * 0.3 : 0)) + rand(-2, 2); g.lineTo(ww, -t * L); }
          for (let k = n; k >= 0; k--) { const t = k / n, ww = Math.sin(t * Math.PI) ** 0.8 * W * (1 + (lobes ? Math.sin(t * Math.PI * lobes * 2) * 0.3 : 0)) + rand(-2, 2); g.lineTo(-ww, -t * L); }
          g.fill();
          // bites and holes, like dried leaves
          g.globalCompositeOperation = 'destination-out';
          for (let k = 0; k < 3; k++) if (Math.random() < 0.5) { g.beginPath(); g.arc(rand(-W, W), -rand(0.2, 0.9) * L, rand(3, 9), 0, TAU); g.fill(); }
          g.globalCompositeOperation = 'source-atop';
          g.strokeStyle = grey(110, 0.8); g.lineWidth = 2; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -L * 0.95); g.stroke();
          g.lineWidth = 1; for (let k = 1; k < 6; k++) { const y = -L * k / 6.5; g.beginPath(); g.moveTo(0, y); g.lineTo(W * 0.8, y - L * 0.08); g.moveTo(0, y); g.lineTo(-W * 0.8, y - L * 0.08); g.stroke(); }
          for (let k = 0; k < 20; k++) { g.fillStyle = grey(rand(90, 160), 0.35); g.beginPath(); g.arc(rand(-W, W), -rand(0, L), rand(1, 4), 0, TAU); g.fill(); }
          g.globalCompositeOperation = 'source-over';
        } else {
          // torn cloth / burlap scrap, frayed at the bottom edge
          const W = tw * 0.4, L = tw * 0.85;
          g.fillStyle = grey(rand(170, 220)); g.beginPath(); g.moveTo(-W * 0.5, 0);
          for (let k = 0; k <= 8; k++) g.lineTo(-W + rand(-6, 6), -k / 8 * L);
          for (let k = 0; k <= 10; k++) g.lineTo(lerp(-W, W, k / 10), -L + rand(-12, 6));
          for (let k = 8; k >= 0; k--) g.lineTo(W + rand(-6, 6), -k / 8 * L);
          g.fill();
          g.globalCompositeOperation = 'source-atop';
          for (let y = 0; y > -L; y -= 4) { g.fillStyle = grey(rand(120, 200), 0.4); g.fillRect(-W - 8, y, 2 * W + 16, 2); }
          g.globalCompositeOperation = 'destination-out';
          for (let k = 0; k < 6; k++) { g.fillRect(rand(-W, W), -rand(0, 14), rand(2, 5), 14); }
          g.globalCompositeOperation = 'source-over';
        }
        g.restore();
      }
    });
    reg(GR.solid, (rw, rh) => { g.fillStyle = grey(205); g.fillRect(0, 0, rw, rh); blotches(g, rw, rh, 30, 6, 24, () => grey(rand(170, 225), 0.3)); });
    // camouflage netting for the face veil
    reg(GR.net, (rw, rh) => {
      g.strokeStyle = grey(190); g.lineWidth = 3;
      for (let k = -rh; k < rw + rh; k += 22) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + rh, rh); g.stroke(); g.beginPath(); g.moveTo(k, rh); g.lineTo(k + rh, 0); g.stroke(); }
      for (let i = 0; i < 40; i++) { g.fillStyle = grey(rand(140, 210)); g.beginPath(); g.ellipse(Math.random() * rw, Math.random() * rh, rand(4, 10), rand(2, 5), Math.random() * TAU, 0, TAU); g.fill(); }
    });
    grain(g, w, h, 14);
  });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  TEX.ghillie = t; return t;
}
// three flips the normal of back faces on double-sided materials; strand cards carry their own outward "fur" normals, so keep them
const GH_PATCH = s => {
  s.fragmentShader = s.fragmentShader.replace('#include <normal_fragment_begin>',
    THREE.ShaderChunk.normal_fragment_begin.replace(/normal = normal \* faceDirection;|normal = normal \* \( float\( gl_FrontFacing \) \* 2\.0 - 1\.0 \);/g, ''));
};
let GH_DEPTH = null;
function charMats(outfitKey, skinIdx = 0) {
  const o = OUTFITS[outfitKey] || OUTFITS.woodland;
  const map = ghAtlas();
  const m = new THREE.MeshStandardMaterial({ map, vertexColors: true, roughness: 0.96, metalness: 0, alphaTest: 0.42, side: THREE.DoubleSide });
  m.onBeforeCompile = GH_PATCH;
  if (!GH_DEPTH) GH_DEPTH = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest: 0.42, side: THREE.DoubleSide });
  const C = h => new THREE.Color(h).convertSRGBToLinear();
  const skin = C(SKINS[(skinIdx | 0) % SKINS.length]);
  return { m, o, pal: o.pal.map(C), leaf: o.leaf.map(C), la: o.la,
    under: C(o.under), glove: C(o.glove), glove2: C(o.glove).multiplyScalar(0.7), boot: C('#2b241c'), sole: C('#141414'), lace: C('#0e0e10'),
    face: skin.clone().multiplyScalar(0.2).lerp(C(o.under).multiplyScalar(0.5), 0.4), eye: C('#0a0a08'), net: C(o.pal[0]).multiplyScalar(0.6) };
}

// ---------- Building blocks ----------
// Meshes are placeholders tagged with a colour and an atlas region; _bake recolours, remaps uv and merges them.
const _add = (parent, mats, geo, col, x = 0, y = 0, z = 0, reg = GR.solid) => { const m = new THREE.Mesh(geo, mats.m); m.position.set(x, y, z); m.userData.gh = { col, reg }; parent.add(m); return m; };
const _lathe = (pts, seg) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
const _limbGeo = (r1, r2, L, seg = 12) => { const g = new THREE.CylinderGeometry(r1, r2, L, seg, 3, true); g.translate(0, -L / 2, 0); return g; };
// Strand cards for one limb group: tapered, drooping quads written straight into indexed arrays (already coloured).
// cards: [start, end) index ranges, one per card, so the skinned merge can shuffle them and thin them out for LODs
class Fur {
  constructor(mats) { this.mats = mats; this.p = []; this.n = []; this.uv = []; this.c = []; this.i = []; this.cards = []; }
  // p: root, dir: initial direction, nrm: outward normal (also the card's facing), down: where it droops to
  card(p, dir, nrm, down, len, w, droop, col, uv, segs, taper) {
    const side = _cA.crossVectors(dir, nrm); if (side.lengthSq() < 1e-6) side.set(1, 0, 0); side.normalize();
    side.applyAxisAngle(dir, rand(-0.5, 0.5));
    const pt = _cB.copy(p), d = _cC.copy(dir).normalize(), v0 = this.p.length / 3, i0 = this.i.length;
    for (let s = 0; s <= segs; s++) {
      const t = s / segs, hw = w * 0.5 * (1 - taper * t), k = lerp(0.5, 1.08, t), v = lerp(uv[1], uv[3], t), ny = nrm.y + (s ? 0.25 : 0);
      this.p.push(pt.x - side.x * hw, pt.y - side.y * hw, pt.z - side.z * hw, pt.x + side.x * hw, pt.y + side.y * hw, pt.z + side.z * hw);
      this.n.push(nrm.x, ny, nrm.z, nrm.x, ny, nrm.z);
      this.uv.push(uv[0], v, uv[2], v);
      this.c.push(col.r * k, col.g * k, col.b * k, col.r * k, col.g * k, col.b * k);
      d.addScaledVector(down, droop / segs).normalize(); pt.addScaledVector(d, len / segs);
    }
    for (let s = 0; s < segs; s++) { const a = v0 + s * 2, b = a + 2; this.i.push(a, a + 1, b + 1, a, b + 1, b); }
    this.cards.push(i0, this.i.length);
  }
  // a jute strand, or (sometimes) a leaf / rag scrap
  strand(p, dir, nrm, down, len, droop = 0.9, leafOK = true) {
    const M = this.mats;
    if (leafOK && Math.random() < M.la) {
      const tile = Math.floor(Math.random() * 16), tx = tile % 4, ty = Math.floor(tile / 4), r = GR.leaf, s = (r[2] - r[0]) / 4;
      // tiles count rows from the top of the region in canvas space
      const v1 = r[3] - ty * s, uv = [r[0] + tx * s, v1 - s, r[0] + (tx + 1) * s, v1];
      const col = _cD.copy(tile < 11 ? M.leaf[Math.floor(Math.random() * M.leaf.length)] : M.pal[Math.floor(Math.random() * M.pal.length)]).multiplyScalar(rand(0.75, 1.15));
      const L = Math.min(len, rand(0.05, 0.1)); this.card(p, dir, nrm, down, L, L * rand(0.8, 1.1), droop * 0.5, col, uv, 2, 0);
      return;
    }
    const r = GR.jute, du = (r[2] - r[0]) * rand(0.05, 0.09), u0 = rand(r[0], r[2] - du);
    const col = _cD.copy(M.pal[Math.floor(Math.random() * M.pal.length)]).multiplyScalar(rand(0.78, 1.18));
    this.card(p, dir, nrm, down, len, rand(0.028, 0.05) * Math.min(1, len / 0.08 + 0.3), droop, col, [u0, r[1], u0 + du, r[3]], len < 0.06 ? 2 : 3, 0.55);
  }
  mesh(parent) {
    if (!this.p.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    const n = new THREE.Float32BufferAttribute(this.n, 3); g.setAttribute('normal', n); g.normalizeNormals();
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.i);
    const m = new THREE.Mesh(g, this.mats.m); m.userData.gh = { raw: true, cards: this.cards }; parent.add(m); return m;
  }
}
const _cA = new V3(), _cB = new V3(), _cC = new V3(), _cD = new THREE.Color(), _cP = new V3(), _cN = new V3(), _cDir = new V3(), _cDown = new V3();
// strands around a limb that hangs along -y (length L, radius r0 at the joint, r1 at the far end), flowing toward the far end.
// dn: where they droop to in limb space. The IK turns -y onto the limb by the shortest arc, so for an arm held out forward
// the limb's +z ends up pointing at the ground: arm strands droop toward +z and hang under the sleeve when aiming.
const _ARM_DN = new V3(0, -0.45, 1).normalize();
function furLimb(fur, L, r0, r1, n, t0, t1, lenMin, lenMax, out = 0.7, along = 1, dn = null, leafOK = true) {
  if (dn) _cDown.copy(dn); else _cDown.set(0, -1, 0);
  for (let i = 0; i < n; i++) {
    const t = rand(t0, t1), a = rand(0, TAU), r = lerp(r0, r1, t) * 0.92;
    _cN.set(Math.cos(a), 0, Math.sin(a));
    _cP.set(_cN.x * r, -L * t, _cN.z * r);
    _cDir.copy(_cN).multiplyScalar(out * rand(0.6, 1.3)).add(_tmp.set(0, -along, 0)).add(_tmp.set(rand(-0.2, 0.2), 0, rand(-0.2, 0.2))).normalize();
    fur.strand(_cP, _cDir, _cN, _cDown, rand(lenMin, lenMax), dn ? 1.5 : 0.8, leafOK);
  }
}
// bake: merge every tagged mesh under root (outside `keep`) into one mesh, keeping vertex colours
function _bake(root, mats, keep = [], shadows = true) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), skip = new Set(keep), parts = [], remove = [];
  const visit = obj => {
    if (skip.has(obj)) return;
    if (obj.isMesh && obj.userData.gh) {
      let g = obj.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, obj.matrixWorld));
      if (g.index) g = g.toNonIndexed();
      const tag = obj.userData.gh;
      if (!tag.raw) {
        const uv = g.attributes.uv, r = tag.reg, cnt = g.attributes.position.count, col = new Float32Array(cnt * 3);
        if (uv) for (let i = 0; i < uv.count; i++) uv.setXY(i, lerp(r[0], r[2], clamp(uv.getX(i), 0, 1)), lerp(r[1], r[3], clamp(uv.getY(i), 0, 1)));
        for (let i = 0; i < cnt; i++) { col[i * 3] = tag.col.r; col[i * 3 + 1] = tag.col.g; col[i * 3 + 2] = tag.col.b; }
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      }
      parts.push(g); remove.push(obj);
    }
    obj.children.forEach(visit);
  };
  root.children.forEach(visit);
  remove.forEach(m => m.parent.remove(m));
  if (!parts.length) return root;
  let total = 0; parts.forEach(g => total += g.attributes.position.count);
  const out = new THREE.BufferGeometry(), A = { position: 3, normal: 3, uv: 2, color: 3 };
  for (const k in A) {
    const arr = new Float32Array(total * A[k]); let o = 0;
    parts.forEach(g => { const a = g.attributes[k]; if (a) arr.set(a.array, o); o += g.attributes.position.count * A[k]; });
    out.setAttribute(k, new THREE.BufferAttribute(arr, A[k]));
  }
  out.computeBoundingSphere();
  const mm = new THREE.Mesh(out, mats.m); mm.castShadow = shadows; mm.receiveShadow = shadows; mm.customDepthMaterial = GH_DEPTH;
  root.add(mm); return root;
}

// ---------- GPU skinning: a whole character (or its gun) in one draw call ----------
// Every mesh under `root` that prep() accepts is moved into the local space of its nearest enclosing bone and bound to that
// bone with weight 1, so the skinned result is exactly the old rigid per-limb pose. Bones are the existing IK groups, with
// identity inverses: a vertex lands at bone.matrixWorld * p. Strand cards (prep returns {g, cards}) go after the solid parts in
// shuffled order, so a shorter draw range thins the fur out evenly for distance LODs.
function _skinMerge(root, bones, prep, keys) {
  root.updateMatrixWorld(true);
  const bi = new Map(bones.map((b, i) => [b, i])), parts = [], remove = [], inv = new THREE.Matrix4();
  const visit = (o, b) => {
    if (bi.has(o)) b = o;
    if (o.isMesh) {
      const r = prep(o);
      if (r !== undefined) remove.push(o);
      if (r && b) { r.g.applyMatrix4(inv.copy(b.matrixWorld).invert().multiply(o.matrixWorld)); r.bone = bi.get(b); parts.push(r); }
    }
    o.children.forEach(c => visit(c, b));
  };
  visit(root, null);
  remove.forEach(m => m.parent.remove(m));
  let nv = 0; parts.forEach(p => nv += p.g.attributes.position.count);
  const arr = {}; for (const k in keys) arr[k] = new Float32Array(nv * keys[k]);
  const si = new Uint16Array(nv * 4), sw = new Float32Array(nv * 4), base = [], cards = [];
  let o = 0;
  for (const { g, bone, cards: cr, sizes } of parts) {
    const n = g.attributes.position.count, idx = g.index ? g.index.array : null;
    for (const k in keys) { const a = g.attributes[k]; if (a) arr[k].set(a.array.length === n * keys[k] ? a.array : a.array.subarray(0, n * keys[k]), o * keys[k]); }
    for (let i = 0; i < n; i++) { si[(o + i) * 4] = bone; sw[(o + i) * 4] = 1; }
    if (cr) for (let c = 0; c < cr.length; c += 2) { const s = []; for (let j = cr[c]; j < cr[c + 1]; j++) s.push(idx[j] + o); if (sizes) s.size = sizes[c / 2]; cards.push(s); }
    else if (idx) for (let j = 0; j < idx.length; j++) base.push(idx[j] + o);
    else for (let j = 0; j < n; j++) base.push(o + j);
    o += n;
  }
  // index counts for three LODs: strand cards keep all / half / a quarter (shuffled); sized pieces drop the small ones first
  const sized = cards.length && cards[0].size !== undefined;
  if (sized) cards.sort((a, b) => b.size - a.size);
  else for (let i = cards.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)), t = cards[i]; cards[i] = cards[j]; cards[j] = t; }
  let ni = base.length; cards.forEach(c => ni += c.length);
  const index = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  index.set(base); let w = base.length;
  const lod = [ni, ni, ni], cut1 = c => sized ? c.size < 0.05 : false, cut2 = c => sized ? c.size < 0.12 : false;
  const at = sized ? [-1, -1] : [Math.floor(cards.length * 0.5), Math.floor(cards.length * 0.25)];
  cards.forEach((c, i) => {
    if (lod[1] === ni && (i === at[0] || cut1(c))) lod[1] = w;
    if (lod[2] === ni && (i === at[1] || cut2(c))) lod[2] = w;
    index.set(c, w); w += c.length;
  });
  lod[1] = Math.max(lod[1], lod[2]);
  const geo = new THREE.BufferGeometry();
  for (const k in keys) geo.setAttribute(k, new THREE.BufferAttribute(arr[k], keys[k]));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  return { geo, lod };
}
function _skinnedMesh(geo, mat, bones) {
  const m = new THREE.SkinnedMesh(geo, mat);
  m.bind(new THREE.Skeleton(bones, bones.map(() => new THREE.Matrix4())), new THREE.Matrix4());
  return m;
}
// body parts: placeholders get their atlas region and colour baked in (as in _bake), strand meshes keep their cards
function _ghPrep(o) {
  const tag = o.userData.gh; if (!tag) return undefined;
  const g = o.geometry.clone();
  if (!tag.raw) {
    const uv = g.attributes.uv, r = tag.reg, cnt = g.attributes.position.count, col = new Float32Array(cnt * 3);
    if (uv) for (let i = 0; i < uv.count; i++) uv.setXY(i, lerp(r[0], r[2], clamp(uv.getX(i), 0, 1)), lerp(r[1], r[3], clamp(uv.getY(i), 0, 1)));
    for (let i = 0; i < cnt; i++) { col[i * 3] = tag.col.r; col[i * 3 + 1] = tag.col.g; col[i * 3 + 2] = tag.col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  return { g, cards: tag.cards || null };
}
let GH_DEPTH_SK = null;
// ---------- Third-person guns: every part folded into one vertex-coloured material ----------
// Each source material becomes a vertex colour (its colour x its texture's average) plus per-vertex roughness/metalness.
const _TAVG = new WeakMap();
const _texAvg = tex => {
  if (!tex || !tex.image) return 1;
  if (_TAVG.has(tex)) return _TAVG.get(tex);
  let v = new THREE.Color(1, 1, 1);
  try {
    const c = _texAvg.c || (_texAvg.c = Object.assign(document.createElement('canvas'), { width: 8, height: 8 })), g = c.getContext('2d', { willReadFrequently: true });
    g.clearRect(0, 0, 8, 8); g.drawImage(tex.image, 0, 0, 8, 8);
    const d = g.getImageData(0, 0, 8, 8).data; let r = 0, gg = 0, b = 0; for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; }
    v.setRGB(r / 64 / 255, gg / 64 / 255, b / 64 / 255); if (tex.encoding === THREE.sRGBEncoding) v.convertSRGBToLinear();
  } catch (e) {}
  _TAVG.set(tex, v); return v;
};
const _gc = new THREE.Color();
function _gunPrep(o) {
  const mat = Array.isArray(o.material) ? o.material[0] : o.material;
  if (!mat || mat.transparent) return null;   // glass and decals: drop (lenses sit underneath)
  const g = o.geometry.clone(), n = g.attributes.position.count, col = new Float32Array(n * 3), rm = new Float32Array(n * 2);
  _gc.copy(mat.color || _gc.setRGB(0.2, 0.2, 0.2)); const ta = _texAvg(mat.map); if (ta !== 1) _gc.multiply(ta);
  if (mat.emissive) _gc.r += mat.emissive.r * (mat.emissiveIntensity || 1), _gc.g += mat.emissive.g * (mat.emissiveIntensity || 1), _gc.b += mat.emissive.b * (mat.emissiveIntensity || 1);
  const ro = mat.roughness !== undefined ? mat.roughness : 1, me = mat.metalness !== undefined ? mat.metalness : 0;
  for (let i = 0; i < n; i++) { col[i * 3] = _gc.r; col[i * 3 + 1] = _gc.g; col[i * 3 + 2] = _gc.b; rm[i * 2] = ro; rm[i * 2 + 1] = me; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('rm', new THREE.BufferAttribute(rm, 2));
  return _weld(g);
}
// guns arrive as triangle soup (merged per material): share corners again, roughly a third of the vertices to skin
function _weld(g) {
  if (g.index) return { g };
  const p = g.attributes.position.array, nr = g.attributes.normal.array, n = g.attributes.position.count;
  const map = new Map(), pmap = new Map(), idx = new Uint32Array(n), pid = new Uint32Array(n), keep = [];
  for (let i = 0; i < n; i++) {
    const kp = Math.round(p[i * 3] * 1e5) + ',' + Math.round(p[i * 3 + 1] * 1e5) + ',' + Math.round(p[i * 3 + 2] * 1e5), k = kp + ',' + Math.round(nr[i * 3] * 100) + ',' + Math.round(nr[i * 3 + 1] * 100) + ',' + Math.round(nr[i * 3 + 2] * 100);
    let j = map.get(k); if (j === undefined) { j = keep.length; map.set(k, j); keep.push(i); } idx[i] = j;
    let q = pmap.get(kp); if (q === undefined) { q = pmap.size; pmap.set(kp, q); } pid[i] = q;
  }
  // separate pieces (screws, rings, rails...) by shared corner positions, so far LODs can leave the small ones out
  const par = new Uint32Array(pmap.size).map((_, i) => i), find = x => { while (par[x] !== x) x = par[x] = par[par[x]]; return x; };
  for (let t = 0; t < n; t += 3) { const a = find(pid[t]), b = find(pid[t + 1]), c = find(pid[t + 2]); par[b] = a; par[find(c)] = a; }
  const comp = new Map();
  for (let t = 0; t < n; t += 3) {
    const r = find(pid[t]); let e = comp.get(r); if (!e) comp.set(r, e = { tris: [], b: [1e9, 1e9, 1e9, -1e9, -1e9, -1e9] });
    e.tris.push(t);
    for (let v = t; v < t + 3; v++) for (let c = 0; c < 3; c++) { const x = p[v * 3 + c]; if (x < e.b[c]) e.b[c] = x; if (x > e.b[c + 3]) e.b[c + 3] = x; }
  }
  const order = new Uint32Array(n), cards = [], sizes = []; let w = 0;
  comp.forEach(e => { cards.push(w); e.tris.forEach(t => { order[w++] = idx[t]; order[w++] = idx[t + 1]; order[w++] = idx[t + 2]; }); cards.push(w); sizes.push(Math.hypot(e.b[3] - e.b[0], e.b[4] - e.b[1], e.b[5] - e.b[2])); });
  const out = new THREE.BufferGeometry();
  for (const name in g.attributes) {
    const a = g.attributes[name], sz = a.itemSize, src = a.array, dst = new Float32Array(keep.length * sz);
    keep.forEach((i, j) => { for (let c = 0; c < sz; c++) dst[j * sz + c] = src[i * sz + c]; });
    out.setAttribute(name, new THREE.BufferAttribute(dst, sz));
  }
  out.setIndex(new THREE.BufferAttribute(order, 1));
  return { g: out, cards, sizes };
}
const GUN_SKIN = new Map(), SHARED_GEO = new WeakSet();
const GUN_PATCH = s => {
  s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 rm;\nvarying vec2 vRM;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRM = rm;');
  s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vRM;')
    .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vRM.x;').replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vRM.y;');
};
function _skinGun(op, m) {
  if (!op.gunMat) {
    op.gunMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 1, skinning: true });
    if (typeof GENV !== 'undefined' && GENV) op.gunMat.envMap = GENV;
    op.gunMat.onBeforeCompile = GUN_PATCH;
  }
  const bones = [m.group]; [m.mag, m.ch, m.bolt, m.slide].forEach(b => { if (b && b.isObject3D && !bones.includes(b)) bones.push(b); });
  // the merged geometry only depends on the gun and its attachments, so everyone carrying the same one shares it
  const key = m.id && m.mods ? m.id + JSON.stringify(m.mods) + bones.length : null;
  let geo = key && GUN_SKIN.get(key);
  if (geo) { const rm = []; m.group.traverse(o => { if (o.isMesh) rm.push(o); }); rm.forEach(o => o.parent.remove(o)); }
  else {
    const r = _skinMerge(m.group, bones, _gunPrep, { position: 3, normal: 3, color: 3, rm: 2 }); geo = r.geo; geo.userData.lod = r.lod;
    if (!geo.attributes.position.count) return;
    geo.computeBoundingSphere(); geo.boundingSphere.radius += 0.3;   // moving parts can stray a little from their rest spot
    if (key) { GUN_SKIN.set(key, geo); SHARED_GEO.add(geo); }
  }
  // a light per-operator view of the shared buffers, so each can pick its own LOD draw range. Views can't be disposed (that
  // frees the shared buffers), so each operator keeps one per gun it has carried and reuses it when swapping back
  if (key) {
    const views = op.gunViews || (op.gunViews = new Map());
    let view = views.get(key);
    if (!view) {
      view = new THREE.BufferGeometry(); for (const k in geo.attributes) view.setAttribute(k, geo.attributes[k]);
      view.setIndex(geo.index); view.boundingSphere = geo.boundingSphere; view.userData.lod = geo.userData.lod;
      SHARED_GEO.add(view); views.set(key, view);
    }
    geo = view;
  }
  const sk = _skinnedMesh(geo, op.gunMat, bones); sk.castShadow = false; sk.receiveShadow = false;
  m.group.add(sk); m.skin = sk;
}

// A gloved hand gripping something along its local -z axis. side +1 = right hand
function buildHand(parent, mats, side, pose = 'grip') {
  const hand = new THREE.Group(); parent.add(hand);
  const gl = mats.glove, g2 = mats.glove2;
  _add(hand, mats, rboxGeo(0.034, 0.08, 0.085, 0.014, 2), gl, side * 0.024, 0, 0.0);                  // back of the hand, beside the grip
  _add(hand, mats, rboxGeo(0.026, 0.07, 0.06, 0.01, 1), g2, side * 0.038, 0.004, 0);                   // padded back
  for (let k = 0; k < 4; k++) {   // four fingers curling round to the far side
    const y = 0.028 - k * 0.019;
    const f = new THREE.Group(); f.position.set(side * 0.02, y, -0.035); hand.add(f);
    _add(f, mats, rboxGeo(0.03, 0.017, 0.02, 0.007, 1), gl, -side * 0.012, 0, 0);
    _add(f, mats, rboxGeo(0.018, 0.016, 0.026, 0.007, 1), g2, -side * 0.03, 0, 0.012);
  }
  const th = new THREE.Group(); th.position.set(side * 0.006, 0.04, 0.012); hand.add(th);
  _add(th, mats, rboxGeo(0.018, 0.018, 0.05, 0.008, 1), gl, -side * 0.014, 0, -0.016).rotation.y = side * 0.5;
  _add(hand, mats, rboxGeo(0.05, 0.045, 0.06, 0.016, 1), g2, side * 0.018, -0.02, 0.05);               // wrist / cuff
  return hand;
}
// An arm: shoulder (upper arm) and elbow (forearm) groups that the IK places, and a hand. fp = first-person viewmodel arm.
// skin: leave the parts unbaked (buildOperator folds them into its skinned mesh)
function buildArm(parent, mats, side, fp = false, skin = false) {
  const la = fp ? 0.36 : A1, lb = fp ? 0.36 : A2, k = fp ? 1.05 : 1;
  const upper = new THREE.Group(), lower = new THREE.Group(); parent.add(upper); parent.add(lower);
  _add(upper, mats, _limbGeo(0.064 * k, 0.054 * k, la), mats.under, 0, 0, 0, GR.burlap);
  _add(upper, mats, new THREE.SphereGeometry(0.07 * k, 10, 8), mats.under, 0, 0, 0, GR.burlap);
  _add(lower, mats, new THREE.SphereGeometry(0.056 * k, 10, 8), mats.under, 0, 0, 0, GR.burlap);
  _add(lower, mats, _limbGeo(0.056 * k, 0.046 * k, lb), mats.under, 0, 0, 0, GR.burlap);
  const fu = new Fur(mats), fl = new Fur(mats);
  if (fp) {
    // tidy: mostly burlap with sparse tiny strands and no leaf cards, nothing big near the camera; the upper arm
    // starts right by the eye, so only its far half gets any strands
    furLimb(fu, la, 0.064, 0.054, 40, 0.5, 0.95, 0.01, 0.025, 1.2, 0.4, _ARM_DN, false);
    furLimb(fl, lb, 0.056, 0.046, 90, 0.0, 0.9, 0.01, 0.03, 1.2, 0.4, _ARM_DN, false);
  } else {
    furLimb(fu, la, 0.064, 0.054, 120, 0.0, 1.0, 0.06, 0.14, 0.9, 0.6, _ARM_DN);
    furLimb(fl, lb, 0.056, 0.046, 110, 0.0, 0.88, 0.05, 0.11, 0.9, 0.6, _ARM_DN);
    // shoulder cap
    _cDown.set(0, -1, 0);
    for (let i = 0; i < 60; i++) {
      _cN.set(rand(-1, 1), rand(-0.1, 1), rand(-1, 1)).normalize(); _cP.copy(_cN).multiplyScalar(0.066);
      _cDir.copy(_cN).add(_cDown).normalize(); fu.strand(_cP, _cDir, _cN, _cDown, rand(0.08, 0.15), 1);
    }
  }
  fu.mesh(upper); fl.mesh(lower);
  const hand = buildHand(parent, mats, side);
  if (!skin) { _bake(upper, mats); _bake(lower, mats); _bake(hand, mats); }
  return { upper, lower, hand, la, lb, side };
}
function buildBoot(foot, mats) {
  _add(foot, mats, rboxGeo(0.11, 0.032, 0.29, 0.012, 2), mats.sole, 0, -0.068, -0.055);
  _add(foot, mats, rboxGeo(0.1, 0.07, 0.25, 0.03, 2), mats.boot, 0, -0.03, -0.06);
  _add(foot, mats, rboxGeo(0.095, 0.05, 0.08, 0.02, 2), mats.boot, 0, -0.01, -0.16).rotation.x = 0.35;
  _add(foot, mats, new THREE.CylinderGeometry(0.058, 0.06, 0.16, 10), mats.boot, 0, 0.05, 0.0);
  for (let i = 0; i < 4; i++) _add(foot, mats, new THREE.BoxGeometry(0.07, 0.006, 0.01), mats.lace, 0, i * 0.03, -0.06 + i * 0.005);
}
// torso strand emitter over an elliptical lathe (z squashed by zs), drooping straight down in the group's space
function furTorso(fur, prof, zs, n, y0, y1, lenFn, backBias = 0.6) {
  _cDown.set(0, -1, 0);
  for (let i = 0; i < n; i++) {
    const y = rand(y0, y1); let a = rand(0, TAU);
    if (Math.sin(a) < 0 && Math.random() < backBias - 0.5) a = -a;   // more on the back (+z), the front gets lain on
    let r = prof[0][0]; for (let k = 1; k < prof.length; k++) if (prof[k][1] >= y) { const p0 = prof[k - 1], p1 = prof[k]; r = lerp(p0[0], p1[0], (y - p0[1]) / Math.max(1e-4, p1[1] - p0[1])); break; }
    _cN.set(Math.cos(a), 0, Math.sin(a) / zs).normalize();
    _cP.set(Math.cos(a) * r * 0.97, y, Math.sin(a) * r * zs * 0.97);
    const top = clamp((y - y0) / (y1 - y0), 0, 1);
    _cN.y = top > 0.8 ? (top - 0.8) * 3 : 0; _cN.normalize();
    _cDir.copy(_cN).multiplyScalar(rand(0.4, 0.9)).addScaledVector(_cDown, rand(0.6, 1)).normalize();
    fur.strand(_cP, _cDir, _cN, _cDown, lenFn(top), 1.1);
  }
}
function buildOperator(outfitKey = 'woodland', skinIdx = 0) {
  const mats = charMats(outfitKey, skinIdx);
  const root = new THREE.Group(), char = new THREE.Group(); root.add(char);
  const pelvis = new THREE.Group(); char.add(pelvis);
  const spine = new THREE.Group(); spine.position.y = 0.05; pelvis.add(spine);
  const head = new THREE.Group(); head.position.y = 0.6; spine.add(head);
  const U = mats.under, B = GR.burlap;
  // hips: burlap trousers, then a long skirt of strands hanging over the thighs
  { const pp = [[0.02, -0.14], [0.15, -0.12], [0.175, -0.03], [0.172, 0.07]]; const h = _add(pelvis, mats, _lathe(pp, 16), U, 0, 0, 0, B); h.scale.set(1, 1, 0.72);
    const f = new Fur(mats); furTorso(f, pp, 0.72, 280, -0.1, 0.07, t => rand(0.16, 0.3) + t * 0.05, 0.6); f.mesh(pelvis); }
  // torso: a bulky ghillie jacket, strands thickest over the shoulders and the back
  {
    const tp = [[0.21, -0.16], [0.215, -0.05], [0.212, 0.1], [0.225, 0.3], [0.238, 0.42], [0.228, 0.49], [0.18, 0.53], [0.11, 0.56], [0.06, 0.58]];
    _add(spine, mats, _lathe(tp, 20), U, 0, 0, 0, B).scale.set(1, 1, 0.74);
    const f = new Fur(mats);
    furTorso(f, tp, 0.74, 520, -0.12, 0.5, t => rand(0.12, 0.24) + t * 0.12, 0.62);
    // shoulder mantle: long strands from the yoke draping over chest, back and the tops of the arms
    for (let i = 0; i < 200; i++) {
      const a = rand(0, TAU), r = rand(0.1, 0.24);
      _cN.set(Math.cos(a), 0.6, Math.sin(a) / 0.74).normalize();
      _cP.set(Math.cos(a) * r, lerp(0.56, 0.47, (r - 0.1) / 0.14), Math.sin(a) * r * 0.74);
      _cDir.copy(_cN).multiplyScalar(0.8).add(_cDown.set(0, -0.3, 0)).normalize(); _cDown.set(0, -1, 0);
      f.strand(_cP, _cDir, _cN, _cDown, rand(0.16, 0.3), 1.6);
    }
    f.mesh(spine);
  }
  _add(spine, mats, new THREE.CylinderGeometry(0.06, 0.07, 0.12, 10, 1, true), U, 0, 0.58, 0, B);   // neck gaiter
  // head: dark face sunk inside a burlap hood, veil of netting over it, strands everywhere else
  {
    // hood: burlap over the whole head; the face is a dark oval just proud of its front, under a veil of netting
    _add(head, mats, new THREE.SphereGeometry(0.142, 18, 14), U, 0, 0.11, 0.012, B).scale.set(1, 1.06, 1.1);
    _add(head, mats, new THREE.SphereGeometry(0.1, 14, 12), mats.face, 0, 0.1, -0.062).scale.set(0.92, 1.05, 0.9);
    [-1, 1].forEach(s => _add(head, mats, new THREE.SphereGeometry(0.012, 6, 5), mats.eye, s * 0.034, 0.112, -0.143));
    const veil = new THREE.CylinderGeometry(0.168, 0.15, 0.19, 10, 2, true, Math.PI - 0.95, 1.9);
    _add(head, mats, veil, mats.net, 0, 0.075, 0.0, GR.net);
    const f = new Fur(mats), c = _tmp2.set(0, 0.11, 0.012), fd = new V3(0, -0.15, -1).normalize();
    _cDown.set(0, -1, 0);
    for (let i = 0; i < 480; i++) {
      _cN.set(rand(-1, 1), rand(-0.5, 1), rand(-1, 1)); if (_cN.lengthSq() > 1) { i--; continue; } _cN.normalize();
      const fdot = _cN.dot(fd);
      if (fdot > 0.72) { i--; continue; }                         // keep the face opening clear
      _cP.copy(_cN).multiply(_tmp.set(0.14, 0.15, 0.155)).add(c);
      const brow = fdot > 0.45 && _cN.y > 0.15;
      _cDir.copy(_cN).multiplyScalar(brow ? 0.4 : 0.7 + Math.max(0, _cN.y) * 0.8).add(_cDown).normalize();
      // brow strands are short and hang over the eyes; the back of the hood drapes onto the shoulders
      const len = brow ? rand(0.05, 0.11) : rand(0.1, 0.22) + Math.max(0, _cN.z) * 0.1;
      f.strand(_cP, _cDir, _cN, _cDown, len, brow ? 1.4 : 1.0, !brow);
    }
    f.mesh(head);
  }
  // legs: baggy burlap trousers, strands flowing down, boots poking out at the bottom
  const legs = [];
  [-1, 1].forEach(s => {
    const thigh = new THREE.Group(), shin = new THREE.Group(), foot = new THREE.Group(); char.add(thigh, shin, foot);
    _add(thigh, mats, _limbGeo(0.095, 0.08, L1, 12), U, 0, 0, 0, B);
    _add(shin, mats, _limbGeo(0.08, 0.066, L2 - 0.06, 12), U, 0, 0, 0, B);
    _add(shin, mats, new THREE.SphereGeometry(0.082, 10, 8), U, 0, 0, 0, B);
    const ft = new Fur(mats), fs = new Fur(mats);
    furLimb(ft, L1, 0.095, 0.08, 190, 0.0, 1.0, 0.09, 0.2, 0.6, 1);
    furLimb(fs, L2, 0.08, 0.066, 150, 0.0, 0.62, 0.07, 0.15, 0.6, 1);
    ft.mesh(thigh); fs.mesh(shin);
    buildBoot(foot, mats);
    legs.push({ s, thigh, shin, foot });
  });
  const arms = [buildArm(char, mats, 1, false, true), buildArm(char, mats, -1, false, true)];
  const aim = new THREE.Group(); char.add(aim);         // the gun hangs from this, pitched with aim
  const gunHolder = new THREE.Group(); aim.add(gunHolder);
  // the whole body is one skinned mesh driven by the IK groups: one draw call (+1 in the shadow pass)
  const bones = [pelvis, spine, head]; legs.forEach(l => bones.push(l.thigh, l.shin, l.foot)); arms.forEach(a => bones.push(a.upper, a.lower, a.hand));
  const { geo, lod } = _skinMerge(char, bones, _ghPrep, { position: 3, normal: 3, uv: 2, color: 3 });
  // vertices live in bone space, so give culling a sphere that holds every pose (prone legs, a body fallen backwards, the gun)
  geo.boundingSphere = new THREE.Sphere(new V3(0, 0.7, 0.2), 2.4);
  mats.m.skinning = true;
  if (!GH_DEPTH_SK) GH_DEPTH_SK = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: mats.m.map, alphaTest: 0.42, side: THREE.DoubleSide, skinning: true });
  const body = _skinnedMesh(geo, mats.m, bones); body.castShadow = body.receiveShadow = true; body.customDepthMaterial = GH_DEPTH_SK;
  root.add(body);
  return { root, char, pelvis, spine, head, legs, arms, aim, gunHolder, mats, body, lod, lodK: 0, gun: null, gunId: null,
    phase: 0, crouch: 0, cr: 0, pr: 0, speed: 0, dead: 0, lean: 0, yaw: 0, pitch: 0, ads: 0, sc: 0, sprint: 0, reloadT: 0, kick: 0, lastPos: new V3(), lv: new V3(), stepAcc: 0 };
}
// marker in gun-local space, made up when guns.js didn't provide one
function _mk(gun, name, x, y, z) { if (gun[name] && gun[name].isObject3D) return gun[name]; const o = new THREE.Object3D(); o.position.set(x, y, z); gun.group.add(o); gun[name] = o; return o; }
function setOperatorGun(op, id, mods) {
  if (op.gun) { op.gunHolder.remove(op.gun.group); op.gun.group.traverse(m => { if (m.isMesh && !SHARED_GEO.has(m.geometry)) m.geometry.dispose(); if (m.isSkinnedMesh && m.skeleton.dispose) m.skeleton.dispose(); }); }   // geometries are merged per gun, so they're safe to free
  const m = buildGun(id, mods, false); op.gun = m; op.gunId = id;   // no gun shadows on other players
  const W = typeof WEAPONS !== 'undefined' && WEAPONS[id] || {};
  m.def = m.def || W;
  op.hold = m.def.melee || W.melee ? 'knife' : m.def.pistol || W.pistol ? 'pistol' : 'rifle';
  _mk(m, 'grip', 0, -0.05, 0.03);
  if (!m.fore || m.fore === m.grip) m.fore = op.hold === 'rifle' ? _mk(m, 'fore', 0, -0.03, -0.32) : null;
  _mk(m, 'muzzle', 0, 0, op.hold === 'rifle' ? -0.9 : -0.2);
  if (!(m.stockZ > 0)) m.stockZ = op.hold === 'rifle' ? 0.45 : 0.05;
  _skinGun(op, m);   // all its parts in one draw call; bolt / mag / charging handle / slide stay movable as bones
  m.group.updateMatrixWorld(true);
  op.gripL = m.group.worldToLocal(m.grip.getWorldPosition(new V3()));
  op.gunHolder.add(m.group);
}
const _hip = new V3(), _ft = new V3(), _ft2 = new V3(), _hint = new V3(), _hint2 = new V3(), _sh = new V3(), _shL = new V3(), _gp = new V3(), _wq = new THREE.Quaternion(), _iq = new THREE.Quaternion();
const _sq = new THREE.Quaternion(), _e = new THREE.Euler();
// knife keyframes along the swing (0..1): [t, x, y, z, rx, ry] offsets from the idle hold
const KNIFE_K = [[0, 0, 0, 0, 0, 0], [0.22, 0.04, 0.14, 0.14, 0.7, -0.3], [0.5, -0.16, 0.16, -0.42, -0.2, 0.5], [0.68, -0.18, 0.1, -0.36, -0.3, 0.6], [1, 0, 0, 0, 0, 0]];
function _knife(u, out) {
  for (let i = 0; i < KNIFE_K.length - 1; i++) { const a = KNIFE_K[i], b = KNIFE_K[i + 1]; if (u <= b[0]) { const t = smoothT((u - a[0]) / (b[0] - a[0])); for (let k = 1; k < 6; k++) out[k - 1] = lerp(a[k], b[k], t); return out; } }
  return out.fill(0);
}
const _kn = [0, 0, 0, 0, 0];
// Pose the operator for this frame.
// st: {pos, yaw, pitch, stance (0 stand, 1 crouch, 2 prone) | crouch (bool), lean, ads, scoped, sprint, reload, melee (0..1), cycle (0..1), alive}
function animateOperator(op, st, dt) {
  const root = op.root;
  root.position.copy(st.pos);
  op.yaw = st.yaw; root.rotation.y = st.yaw;
  // distance LOD by on-screen size (a scope's narrow fov brings full detail back): fewer strand cards far away
  if (op.lod && typeof CAMERA !== 'undefined' && CAMERA && CAMERA.isPerspectiveCamera) {
    const ref = typeof SETTINGS !== 'undefined' && SETTINGS.fov > 0 ? SETTINGS.fov : 80;   // relative to the player's normal fov
    const d = CAMERA.position.distanceTo(st.pos) * Math.tan(CAMERA.fov * Math.PI / 360) / Math.tan(ref * Math.PI / 360);
    const k = d > 150 ? 2 : d > 60 ? 1 : 0;
    if (k !== op.lodK) { op.lodK = k; op.body.geometry.setDrawRange(0, op.lod[k]); }
    const gs = op.gun && op.gun.skin, gl = gs && gs.geometry.userData.lod;
    if (gl && gs.geometry.drawRange.count !== gl[k]) gs.geometry.setDrawRange(0, gl[k]);
  }
  if (op.gunMat) op.gunMat.color.copy(op.mats.m.color);   // indoor dimming applies to the gun too
  const stance = st.stance !== undefined && st.stance !== null ? st.stance | 0 : st.crouch ? 1 : 0;
  const pitch = st.pitch || 0;
  op.cr = lerp(op.cr, stance === 1 ? 1 : 0, 1 - Math.exp(-dt * 8)); op.crouch = op.cr;
  op.pr = lerp(op.pr, stance === 2 ? 1 : 0, 1 - Math.exp(-dt * 4.5));
  op.ads = lerp(op.ads, st.ads || st.scoped ? 1 : 0, 1 - Math.exp(-dt * 10));
  op.sc = lerp(op.sc, st.scoped ? 1 : 0, 1 - Math.exp(-dt * 8));
  op.sprint = lerp(op.sprint, st.sprint && stance === 0 ? 1 : 0, 1 - Math.exp(-dt * 8));
  op.lean = lerp(op.lean, stance === 2 ? 0 : st.lean || 0, 1 - Math.exp(-dt * 10));
  op.kick = Math.max(0, op.kick - dt * 6);
  // velocity in the operator's frame
  op.lv.subVectors(st.pos, op.lastPos).divideScalar(Math.max(dt, 1e-3)); op.lastPos.copy(st.pos);
  if (op.lv.lengthSq() > 400) op.lv.set(0, 0, 0);   // teleport (respawn)
  const cy = Math.cos(st.yaw), sy = Math.sin(st.yaw);
  const vf = -op.lv.x * sy - op.lv.z * cy, vr = op.lv.x * cy - op.lv.z * sy;   // forward (+) / right (+)
  const sp = Math.hypot(op.lv.x, op.lv.z);
  op.speed = lerp(op.speed, sp, 1 - Math.exp(-dt * 8));
  op.dead = st.alive === false ? Math.min(1, op.dead + dt * 2.2) : 0;
  const p = smoothT(op.pr), c = op.cr * (1 - p), char = op.char, ip = 1 - p;
  const moving = op.speed > 0.2, crawl = moving ? p : 0;
  // walk: phase by distance; crawl is a slower cycle
  op.phase += (op.speed * dt) / lerp(0.55 + c * 0.2, 0.32, p) * Math.PI;
  const cs = Math.sin(op.phase), cc = Math.cos(op.phase);
  // death: standing bodies fall backwards, prone ones just go limp and roll a little
  if (op.dead > 0) {
    const d = smoothT(op.dead);
    char.rotation.set(d * Math.PI / 2 * 0.98 * ip, 0, d * (0.2 * ip + 0.35 * p)); char.position.set(0, d * 0.12 * ip, d * 0.55 * ip);
  } else { char.rotation.set(0, 0, 0); char.position.set(0, 0, 0); }
  // prone on a slope: lie along the ground instead of level (operatorHitboxes tilts the same way)
  op.tilt = lerp(op.tilt || 0, stance === 2 ? proneTilt(st.pos, st.yaw) : 0, 1 - Math.exp(-dt * 6));
  char.rotation.x += op.tilt * p;
  // pelvis: upright → lying face down (rotated forward a quarter turn), hips behind the player position
  const hipY = lerp(0.93, 0.62, c) + (moving ? Math.abs(cs) * 0.035 * ip : 0);
  op.pelvis.position.set(op.lean * 0.12 * ip, lerp(hipY, 0.15, p), lerp(0, 0.34, p));
  op.pelvis.rotation.set(-Math.PI / 2 * 0.97 * p, 0, -op.lean * 0.18 + crawl * cs * 0.07);
  // spine: bends forward crouched/sprinting; prone it arches up so the chest rests on the elbows
  op.spine.rotation.set(lerp(-0.08 - c * 0.18 - op.sprint * 0.12 + pitch * 0.15, 0.18 + clamp(pitch, -0.2, 0.4) * 0.3, p), 0, -op.lean * 0.15 * ip - crawl * cs * 0.05);
  // head: looks along the aim; prone it has to tip right back to see forward. Scoped: cheek down onto the stock
  const sc = op.sc, ads = op.ads;
  op.head.rotation.set(lerp(pitch * 0.6, Math.PI / 2 * 0.97 - 0.12 + pitch * 0.5, p) - sc * 0.22, sc * 0.1, -ads * 0.12 - sc * 0.16);
  op.head.position.set(sc * 0.025, 0.6 - sc * 0.02, -sc * 0.035 * ip);
  op.pelvis.updateMatrix();
  // legs
  const stride = clamp(op.speed / 5, 0, 1.4);
  const mvx = moving ? vr / Math.max(op.speed, 0.01) : 0, mvz = moving ? -vf / Math.max(op.speed, 0.01) : 0;
  op.legs.forEach((leg, i) => {
    const ph = op.phase + (i ? Math.PI : 0), sw = Math.sin(ph), lift = Math.max(0, Math.cos(ph));
    _hip.set(leg.s * 0.095, -0.04, 0).applyMatrix4(op.pelvis.matrix);
    // standing / crouched foot target
    _ft.set(leg.s * (0.12 + c * 0.04) + op.lean * 0.06, 0.085 + lift * 0.12 * stride, c * -0.08);
    _ft.x += mvx * sw * 0.28 * stride; _ft.z += mvz * sw * 0.32 * stride;
    if (c > 0.5 && i === 1) _ft.z += 0.22 * c;   // one knee down-ish
    // prone: legs straight back, toes in the dirt; crawling draws one knee up and out at a time
    const draw = crawl * Math.max(0, sw);
    _ft2.set(leg.s * (0.17 + draw * 0.16), 0.11, _hip.z + L1 + L2 - 0.05 - draw * 0.32);
    _ft.lerp(_ft2, p);
    _hint.set(0, 0, -1).lerp(_hint2.set(leg.s * (0.2 + draw * 2), -1, 0), p).normalize();
    solve2(leg.thigh, leg.shin, _hip, _ft, _hint, L1, L2);
    leg.foot.position.copy(_ft); leg.foot.rotation.set(-2.75 * p, 0, -leg.s * draw * 0.6);
  });
  // gun: rifle stock at the shoulder; pistol pushed out in both hands; knife low in the right hand
  char.updateMatrixWorld(true);
  _sh.set(0.2, 0.5, -0.06); op.spine.localToWorld(_sh); char.worldToLocal(_sh);
  _shL.set(-0.2, 0.5, -0.06); op.spine.localToWorld(_shL); char.worldToLocal(_shL);
  const gun = op.gun; if (!gun) return;
  const hold = op.hold || 'rifle', melee = hold === 'knife' ? clamp(st.melee || 0, 0, 1) : 0;
  const sprintDown = op.sprint * (hold === 'rifle' ? 0.75 : 0.9);
  const crawlBob = crawl * cs * 0.04;
  const prPitch = clamp(pitch, -0.3, 0.45);
  if (hold === 'knife') {
    _knife(melee, _kn);
    const s2 = ip * 1 + p * 0.6;
    op.aim.position.set(lerp(_sh.x + 0.02, _sh.x - 0.02, p) + _kn[0] * s2, lerp(_sh.y - 0.36, _sh.y - 0.16, p) + _kn[1] * s2, lerp(_sh.z - 0.24, _sh.z - 0.3, p) + _kn[2] * s2 + crawlBob);
    op.aim.rotation.set(pitch * 0.3 * ip + _kn[3] - 0.15 * ip - sprintDown * 0.4, -0.15 + _kn[4], 0);
    op.gunHolder.position.copy(op.gripL).multiplyScalar(-1);
    op.gunHolder.rotation.set(0, 0, 0);
  } else {
    const pistol = hold === 'pistol';
    const ax = pistol ? lerp(0.07, 0.02, ads) : lerp(0.12, 0.075, ads);
    op.aim.position.set(lerp(ax + op.lean * 0.1, 0.05, p * (pistol ? 1 : 0.4)), _sh.y - 0.04 + (pistol ? 0.02 + ads * 0.05 : ads * 0.03 + sc * 0.015), _sh.z - 0.02 + crawlBob);
    op.aim.rotation.set(lerp(pitch * (1 - op.sprint) - sprintDown, prPitch - crawl * 0.25, p), op.sprint * 0.6, 0);
    const reach = pistol ? -lerp(0.34, 0.44, ads) : -gun.stockZ + 0.03;
    op.gunHolder.position.set(0, 0, reach + op.kick * 0.05);
    op.gunHolder.rotation.set(op.kick * (pistol ? 0.4 : 0.15) + (st.reload ? 0.5 : 0), 0, st.reload ? 0.4 : 0);
  }
  // dead: the gun sags across the body instead of pointing at the sky
  if (op.dead > 0) { const d = smoothT(op.dead) * ip; op.aim.rotation.x = lerp(op.aim.rotation.x, -1.25, d); op.aim.rotation.z = lerp(op.aim.rotation.z, 1.0, d); }
  // bolt cycling on remote rifles
  const cyc = st.cycle || 0;
  if (gun.bolt) { const r = cyc > 0.1 && cyc < 0.85 ? smoothT(Math.min((cyc - 0.1) / 0.15, (0.85 - cyc) / 0.15)) : 0; gun.bolt.rotation.z = r * 1.35; gun.bolt.position.z = r * 0.09 * smoothT(Math.min((cyc - 0.25) / 0.15, (0.7 - cyc) / 0.15)); }
  char.updateMatrixWorld(true);
  gun.group.updateMatrixWorld(true);
  _wq.setFromRotationMatrix(gun.group.matrixWorld); _iq.setFromRotationMatrix(char.matrixWorld).invert(); _wq.premultiply(_iq);
  op.arms.forEach(arm => {
    const right = arm.side > 0, shoulder = right ? _sh : _shL;
    let free = false;
    if (right) {
      const mk = cyc > 0.1 && cyc < 0.85 && gun.boltKnob ? gun.boltKnob : gun.grip;
      mk.getWorldPosition(_gp); char.worldToLocal(_gp);
      arm.hand.quaternion.copy(_wq);
    } else if (hold === 'knife') {
      // off hand: hangs relaxed at the side; prone it's planted in front
      free = true;
      _gp.set(shoulder.x - 0.04, shoulder.y - 0.5, shoulder.z - 0.06 - melee * 0.1);
      _gp.lerp(_tmp2.set(shoulder.x + 0.06, shoulder.y - 0.2, shoulder.z - 0.22), p);
      _sq.setFromRotationMatrix(op.spine.matrixWorld).premultiply(_iq);
      arm.hand.quaternion.copy(_sq).multiply(_q.setFromEuler(_e.set(lerp(-1.3, -0.2, p), 0, 0.2)));
    } else if (hold === 'pistol' || !gun.fore) {
      // support hand cups the shooting hand
      _gp.set(-0.03, -0.035, 0.0); gun.grip.localToWorld(_gp); char.worldToLocal(_gp);
      arm.hand.quaternion.copy(_wq); arm.hand.rotateZ(-0.6); arm.hand.rotateY(0.3);
    } else {
      gun.fore.getWorldPosition(_gp); char.worldToLocal(_gp);
      if (st.reload && gun.magWell) { _gp.copy(gun.magWell).add(_tmp.set(0, -0.1, 0)); gun.group.localToWorld(_gp); char.worldToLocal(_gp); }
      arm.hand.quaternion.copy(_wq); arm.hand.rotateZ(Math.PI);   // support hand under the handguard
    }
    arm.hand.position.copy(_gp);
    // wrist sits a little behind and below the grip
    if (free) _tmp.set(0, 0.0, 0.07).applyQuaternion(arm.hand.quaternion).add(_gp);
    else _tmp.set(right ? 0.02 : 0, -0.04 * arm.side, 0.06).applyQuaternion(arm.hand.quaternion).add(_gp);
    // elbows: out and down standing, planted in the dirt prone
    _hint.set(arm.side, -1, 0.6).normalize().lerp(_hint2.set(arm.side * 0.9, -0.6, 0.2), p).normalize();
    if (free) _hint.set(-0.3, 0, 1).lerp(_hint2.set(-0.5, -1, 0), p).normalize();
    solve2(arm.upper, arm.lower, shoulder, _tmp, _hint, arm.la, arm.lb, true);
  });
}
// Prone bodies pitch (about the feet origin) to the terrain slope between head and boots; < 0 when the ground rises behind.
// Only on open ground: on a floor or a roof terrainY says nothing about what they lie on.
function proneTilt(pos, yaw) {
  if (typeof terrainY !== 'function') return 0;
  if (Math.abs(terrainY(pos.x, pos.z) - pos.y) > 0.2) return 0;
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  const yf = terrainY(pos.x + fx * 0.5, pos.z + fz * 0.5), yb = terrainY(pos.x - fx * 1.1, pos.z - fz * 1.1);
  return clamp(-Math.atan2(yb - yf, 1.6), -0.35, 0.35);
}
// Hitboxes in world space. stance: 0 stand, 1 crouch, 2 prone (or a boolean crouch).
// Returns [{zone:'head'|'chest'|'legs', type:'s', x,y,z,r} | {zone, type:'c', x, y0, y1, z, r}]
function operatorHitboxes(pos, stance, lean = 0, yaw = 0) {
  const s = stance === true ? 1 : stance | 0;
  if (s === 2) {
    // lying face down along the yaw direction: head in front of pos, chest over pos, legs trailing behind
    // (tilted with the body on slopes; the legs splay out sideways like the model's)
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), a = proneTilt(pos, yaw), ca = Math.cos(a), sa = Math.sin(a);
    const S = (zone, f, sd, y, r) => { const f2 = f * ca - y * sa, y2 = y * ca + f * sa; return { zone, type: 's', x: pos.x + fx * f2 + fz * sd, y: pos.y + y2, z: pos.z + fz * f2 - fx * sd, r }; };
    const out = [S('head', 0.3, 0, 0.38, 0.14), S('chest', 0.05, 0, 0.23, 0.2), S('chest', -0.22, 0, 0.17, 0.19)];
    [-1, 1].forEach(k => out.push(S('legs', -0.58, k * 0.13, 0.08, 0.14), S('legs', -0.8, k * 0.16, 0.03, 0.13), S('legs', -1.02, k * 0.16, 0.06, 0.12), S('legs', -1.22, k * 0.17, 0.1, 0.1)));
    return out;
  }
  const c = s === 1 ? 1 : 0, hy = lerp(1.62, CROUCH_HEAD[1], c), hf = c * CROUCH_HEAD[0];
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  const rx = Math.cos(yaw) * lean * 0.25, rz = -Math.sin(yaw) * lean * 0.25;
  // capsules bulge by their radius past y0/y1, so stack them by their outer edges: the chest must not swallow the head
  const top = hy - 0.13, waist = lerp(0.92, 0.6, c), rc = 0.24, rl = 0.2, cf = c * 0.06;
  const cy0 = waist + rc, cy1 = Math.max(cy0, top - rc), ly0 = 0.08 + rl, ly1 = Math.max(ly0, waist - rl);
  const out = [
    { zone: 'head', type: 's', x: pos.x + rx * 1.4 + fx * hf, y: pos.y + hy, z: pos.z + rz * 1.4 + fz * hf, r: 0.14 },
    { zone: 'chest', type: 'c', x: pos.x + rx + fx * cf, y0: pos.y + cy0, y1: pos.y + cy1, z: pos.z + rz + fz * cf, r: rc },
    { zone: 'legs', type: 'c', x: pos.x, y0: pos.y + ly0, y1: pos.y + ly1, z: pos.z, r: rl },
  ];
  // bent knees jut out in front of the hips (sd > 0 = left). Crouched, the left knee is up and the right one down by the ground
  const S = (f, sd, y, r) => out.push({ zone: 'legs', type: 's', x: pos.x + fx * f + fz * sd, y: pos.y + y, z: pos.z + fz * f - fx * sd, r });
  if (c) { S(0.2, 0.11, 0.49, 0.13); S(0.37, 0.12, 0.39, 0.12); S(0.25, 0.14, 0.25, 0.12); S(0.14, -0.12, 0.41, 0.13); S(0.27, -0.14, 0.24, 0.12); }
  else { S(0.17, 0.11, 0.49, 0.12); S(0.17, -0.11, 0.49, 0.12); }
  return out;
}
// crouched head centre [forward, up] from the body origin, matching the model (bots.js bodyAim aims here)
const CROUCH_HEAD = [0.18, 1.36];
