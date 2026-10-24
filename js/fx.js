'use strict';
// ---------- Effects: blood & gore, impacts per material, muzzle blast, projectile streaks, scope glint, decals, screen blood ----------
// The game renders with a logarithmic depth buffer: every custom shader here carries the logdepthbuf chunks or it is
// depth-tested against garbage and vanishes. Particles are two pooled THREE.Points systems (normal + additive) sharing one texture atlas, so a burst is just array writes.
// Decals (blood, holes) are instanced quads in ring buffers. Nothing in fxTick allocates.
const FX = { list: [], scene: null, vmScene: null, cam: null, time: 0, pending: [] };
let flashTex, puffTex, holeTex, sparkTex, glowTex, glintTex, mistTex;
const _v1 = new V3(), _v2 = new V3(), _v3 = new V3(), _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _fm4 = new THREE.Matrix4(), _Z = new V3(0, 0, 1), _X = new V3(1, 0, 0);
// colours are given in sRGB and stored linear (the custom shaders write linear and encode on output)
const lin = hex => { const c = new THREE.Color(hex).convertSRGBToLinear(); return [c.r, c.g, c.b]; };
const COL = {
  blood: [lin(0x6e0807), lin(0x8a0c0a), lin(0x5a0605), lin(0xa0140f)], bloodMist: lin(0x74110f), pinkMist: lin(0x8c3c3a), meat: lin(0x3a0806), bone: lin(0xd8cbb8),
  dust: lin(0xb4ab98), dirt: lin(0x7a6548), dirtDark: lin(0x4e3f2c), conc: lin(0x9a968c), wood: lin(0x9a7448), woodDark: lin(0x5e4428), leaf: lin(0x5a7a32),
  glass: lin(0xd8eef4), water: lin(0xdfe8ea), smoke: lin(0x8c8880), vapour: lin(0xc8ccd0), spark: lin(0xffb050), sparkHot: lin(0xffe8b0), ember: lin(0xffa040),
};

// ---------- Texture atlas (4x4 cells of 128 px) ----------
// 0 soft puff, 1 cloudy smoke, 2 glow, 3 droplet, 4 blood clump, 5 chip, 6 splinter, 7 leaf, 8 shard, 9 flash star
function atlasTex() {
  return canvasTex(512, 512, (g) => {
    const cell = (i, f) => { g.save(); g.translate((i % 4) * 128, Math.floor(i / 4) * 128); f(); g.restore(); };
    const rad = (r0, stops) => { const gr = g.createRadialGradient(64, 64, 0, 64, 64, r0); stops.forEach(s => gr.addColorStop(s[0], s[1])); return gr; };
    cell(0, () => { g.fillStyle = rad(62, [[0, 'rgba(255,255,255,1)'], [0.4, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']]); g.fillRect(0, 0, 128, 128); });
    cell(1, () => { for (let k = 0; k < 14; k++) { const x = 64 + rand(-26, 26), y = 64 + rand(-26, 26), r = rand(16, 34), gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(255,255,255,${rand(0.25, 0.5)})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); } });
    cell(2, () => { g.fillStyle = rad(62, [[0, 'rgba(255,255,255,1)'], [0.15, 'rgba(255,255,255,0.8)'], [0.45, 'rgba(255,255,255,0.18)'], [1, 'rgba(255,255,255,0)']]); g.fillRect(0, 0, 128, 128); });
    cell(3, () => { g.fillStyle = rad(56, [[0, 'rgba(255,255,255,1)'], [0.7, 'rgba(225,225,225,1)'], [1, 'rgba(200,200,200,0)']]); g.beginPath(); g.arc(64, 64, 56, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.arc(50, 48, 10, 0, TAU); g.fill(); });
    cell(4, () => { for (let k = 0; k < 18; k++) { const a = Math.random() * TAU, d = Math.pow(Math.random(), 1.5) * 44, r = rand(5, 18) * (1 - d / 70); g.fillStyle = `rgba(${rand(200, 255) | 0},${rand(200, 255) | 0},${rand(200, 255) | 0},1)`; g.beginPath(); g.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, r, 0, TAU); g.fill(); } });
    cell(5, () => { g.fillStyle = '#e0e0e0'; g.beginPath(); for (let a = 0; a < TAU; a += TAU / 7) { const r = rand(26, 50); g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); } g.fill(); g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.moveTo(40, 40); g.lineTo(70, 34); g.lineTo(60, 62); g.fill(); g.fillStyle = 'rgba(120,120,120,0.6)'; g.beginPath(); g.moveTo(64, 90); g.lineTo(90, 70); g.lineTo(84, 96); g.fill(); });
    cell(6, () => { g.fillStyle = '#e8e8e8'; g.beginPath(); g.moveTo(8, 60); g.lineTo(120, 56); g.lineTo(122, 64); g.lineTo(10, 70); g.fill(); g.fillStyle = 'rgba(150,150,150,0.8)'; g.fillRect(20, 64, 90, 3); });
    cell(7, () => { g.fillStyle = '#f0f0f0'; g.beginPath(); g.ellipse(64, 64, 50, 20, 0.5, 0, TAU); g.fill(); g.strokeStyle = 'rgba(160,160,160,0.9)'; g.lineWidth = 3; g.beginPath(); g.moveTo(22, 40); g.lineTo(106, 88); g.stroke(); });
    cell(8, () => { g.fillStyle = 'rgba(255,255,255,0.75)'; g.beginPath(); g.moveTo(30, 20); g.lineTo(104, 50); g.lineTo(50, 110); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 4; g.beginPath(); g.moveTo(30, 20); g.lineTo(104, 50); g.stroke(); });
    cell(9, () => { g.fillStyle = rad(60, [[0, 'rgba(255,255,255,1)'], [0.3, 'rgba(255,255,255,0.6)'], [1, 'rgba(255,255,255,0)']]); g.fillRect(0, 0, 128, 128);
      g.globalCompositeOperation = 'lighter'; for (let k = 0; k < 7; k++) { const a = k / 7 * TAU + rand(-0.2, 0.2), l = rand(40, 62); g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = rand(4, 9); g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + Math.cos(a) * l, 64 + Math.sin(a) * l); g.stroke(); } });
  }, { linear: true });
}

// ---------- Particle systems ----------
const PS_VS = `#include <common>
attribute vec4 pcol; attribute float psize; attribute vec2 prot; uniform float uScale;
varying vec4 vCol; varying vec2 vRot;
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
void main(){ vCol = pcol; vRot = prot; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = psize * uScale / max(0.05, -mvPosition.z); gl_Position = projectionMatrix * mvPosition;
  #include <logdepthbuf_vertex>
  #include <fog_vertex>
}`;
const PS_FS = `uniform sampler2D map; varying vec4 vCol; varying vec2 vRot;
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
void main(){
  #include <logdepthbuf_fragment>
  vec2 uv = gl_PointCoord - 0.5; float c = cos(vRot.x), s = sin(vRot.x);
  uv = vec2(c * uv.x - s * uv.y, s * uv.x + c * uv.y) * 1.25 + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) discard;
  vec2 cc = vec2(mod(vRot.y, 4.0), floor(vRot.y / 4.0));
  vec4 tx = texture2D(map, vec2((cc.x + uv.x) * 0.25, 1.0 - (cc.y + uv.y) * 0.25));
  gl_FragColor = vec4(vCol.rgb * tx.rgb, vCol.a * tx.a); if (gl_FragColor.a < 0.004) discard;
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      float ff = 1.0 - exp(-fogDensity * fogDensity * fogDepth * fogDepth);
    #else
      float ff = smoothstep(fogNear, fogFar, fogDepth);
    #endif
    #ifdef ADDITIVE
      gl_FragColor.a *= 1.0 - ff;
    #else
      gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, ff);
    #endif
  #endif
  #include <encodings_fragment>
}`;
const PF = { FLOOR: 2, DIE: 4, HOLD: 8 };   // flags: collide with a floor height, die on it (droplets), hold alpha until late
function makePS(cap, additive, atlas) {
  const S = { cap, add: additive, n: 0, p: new Float32Array(cap * 3), v: new Float32Array(cap * 3), c: new Float32Array(cap * 3), a: new Float32Array(cap),
    age: new Float32Array(cap), life: new Float32Array(cap), s0: new Float32Array(cap), s1: new Float32Array(cap), grav: new Float32Array(cap), drag: new Float32Array(cap),
    rot: new Float32Array(cap), rotV: new Float32Array(cap), cell: new Float32Array(cap), fin: new Float32Array(cap), floor: new Float32Array(cap), fl: new Uint8Array(cap) };
  const geo = new THREE.BufferGeometry(), at = (name, n) => { const b = new THREE.BufferAttribute(new Float32Array(cap * n), n); b.setUsage(THREE.DynamicDrawUsage); geo.setAttribute(name, b); return b; };
  S.aPos = at('position', 3); S.aCol = at('pcol', 4); S.aSize = at('psize', 1); S.aRot = at('prot', 2); geo.setDrawRange(0, 0);
  const uni = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uScale: { value: 500 } }]); uni.map = { value: atlas };
  S.mat = new THREE.ShaderMaterial({ uniforms: uni, vertexShader: PS_VS, fragmentShader: PS_FS, transparent: true, depthWrite: false, fog: true,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, defines: additive ? { ADDITIVE: 1 } : {} });
  S.pts = new THREE.Points(geo, S.mat); S.pts.frustumCulled = false; S.pts.renderOrder = additive ? 3 : 2; S.geo = geo;
  return S;
}
// one particle. c: linear [r,g,b]. Returns false when the pool is full.
function emit(S, x, y, z, vx, vy, vz, life, s0, s1, c, a, grav = 0, drag = 0, cell = 0, fl = 0, fin = 0.02, floor = -1e9) {
  if (S.n >= S.cap) return false;
  const i = S.n++, i3 = i * 3;
  S.p[i3] = x; S.p[i3 + 1] = y; S.p[i3 + 2] = z; S.v[i3] = vx; S.v[i3 + 1] = vy; S.v[i3 + 2] = vz;
  const k = S.add ? 1 : FX.dimK; S.c[i3] = c[0] * k; S.c[i3 + 1] = c[1] * k; S.c[i3 + 2] = c[2] * k; S.a[i] = a; S.age[i] = 0; S.life[i] = life; S.s0[i] = s0; S.s1[i] = s1;
  S.grav[i] = grav; S.drag[i] = drag; S.rot[i] = Math.random() * TAU; S.rotV[i] = rand(-3, 3); S.cell[i] = cell; S.fl[i] = fl; S.fin[i] = fin; S.floor[i] = floor;
  return true;
}
function psMove(S, i, j) {   // copy particle j into slot i
  const i3 = i * 3, j3 = j * 3;
  for (let k = 0; k < 3; k++) { S.p[i3 + k] = S.p[j3 + k]; S.v[i3 + k] = S.v[j3 + k]; S.c[i3 + k] = S.c[j3 + k]; }
  S.a[i] = S.a[j]; S.age[i] = S.age[j]; S.life[i] = S.life[j]; S.s0[i] = S.s0[j]; S.s1[i] = S.s1[j]; S.grav[i] = S.grav[j]; S.drag[i] = S.drag[j];
  S.rot[i] = S.rot[j]; S.rotV[i] = S.rotV[j]; S.cell[i] = S.cell[j]; S.fl[i] = S.fl[j]; S.fin[i] = S.fin[j]; S.floor[i] = S.floor[j];
}
function psUpdate(S, dt, scale) {
  S.mat.uniforms.uScale.value = scale;
  const P = S.aPos.array, C = S.aCol.array, Z = S.aSize.array, R = S.aRot.array;
  for (let i = 0; i < S.n; i++) {
    S.age[i] += dt;
    if (S.age[i] >= S.life[i]) { S.n--; if (i < S.n) psMove(S, i, S.n); i--; continue; }
    const i3 = i * 3, fl = S.fl[i];
    S.v[i3 + 1] -= S.grav[i] * dt;
    const dr = 1 / (1 + S.drag[i] * dt); S.v[i3] *= dr; S.v[i3 + 1] *= dr; S.v[i3 + 2] *= dr;
    S.p[i3] += S.v[i3] * dt; S.p[i3 + 1] += S.v[i3 + 1] * dt; S.p[i3 + 2] += S.v[i3 + 2] * dt;
    if ((fl & PF.FLOOR) && S.p[i3 + 1] < S.floor[i]) {
      S.p[i3 + 1] = S.floor[i];
      if (fl & PF.DIE) { S.life[i] = S.age[i] + 0.001; } else { S.v[i3 + 1] = -S.v[i3 + 1] * 0.3; S.v[i3] *= 0.5; S.v[i3 + 2] *= 0.5; S.rotV[i] *= 0.4; }
    }
    S.rot[i] += S.rotV[i] * dt;
    const k = S.age[i] / S.life[i], fade = (fl & PF.HOLD) ? (k < 0.75 ? 1 : (1 - k) * 4) : 1 - k;
    P[i3] = S.p[i3]; P[i3 + 1] = S.p[i3 + 1]; P[i3 + 2] = S.p[i3 + 2];
    const i4 = i * 4; C[i4] = S.c[i3]; C[i4 + 1] = S.c[i3 + 1]; C[i4 + 2] = S.c[i3 + 2]; C[i4 + 3] = S.a[i] * Math.min(1, S.age[i] / S.fin[i]) * fade;
    Z[i] = S.s0[i] + (S.s1[i] - S.s0[i]) * (1 - (1 - k) * (1 - k));
    R[i * 2] = S.rot[i]; R[i * 2 + 1] = S.cell[i];
  }
  S.geo.setDrawRange(0, S.n);
  if (S.n) { S.aPos.needsUpdate = S.aCol.needsUpdate = S.aSize.needsUpdate = S.aRot.needsUpdate = true; }
}
// particles are unlit: in the dark rooms the map bakes in they would glow, so each burst is dimmed to match (lights stay hot)
FX.dimK = 1;
const fxShade = p => { FX.dimK = typeof occAt === 'function' ? 1 - Math.min(0.85, occAt(p.x, p.z, p.y) * 2) : 1; };
const room = (S, n) => Math.max(0, Math.min(n, Math.floor((S.cap - S.n) * 0.9)));

// ---------- Decal textures ----------
function splatTex(kind) {
  return canvasTex(256, 256, (g) => {
    const blob = (x, y, r, a = 1, jag = 0.35) => {   // an irregular round blob, lighter in the middle (wet), darker rim
      g.fillStyle = `rgba(255,255,255,${a})`; g.beginPath(); const n = 18;
      for (let i = 0; i <= n; i++) { const an = i / n * TAU, rr = r * (1 - jag / 2 + Math.random() * jag); g.lineTo(x + Math.cos(an) * rr, y + Math.sin(an) * rr); }
      g.fill();
    };
    const drop = (x, y, r) => { g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); };
    if (kind === 0) { blob(128, 128, 70); for (let i = 0; i < 9; i++) { const a = Math.random() * TAU, d = rand(78, 110); drop(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, rand(3, 10)); } for (let i = 0; i < 6; i++) { const a = Math.random() * TAU; blob(128 + Math.cos(a) * 55, 128 + Math.sin(a) * 55, rand(14, 26)); } }
    else if (kind === 1) {   // big burst: core, radiating streaks, satellites
      blob(128, 128, 46, 1, 0.5);
      for (let i = 0; i < 26; i++) { const a = Math.random() * TAU, l = rand(50, 120), w = rand(3, 11); g.save(); g.translate(128, 128); g.rotate(a); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(20, -w / 2); g.lineTo(l, -w * 0.15); g.lineTo(l + w * 0.6, 0); g.lineTo(l, w * 0.15); g.lineTo(20, w / 2); g.fill(); drop(l + rand(4, 12), 0, w * rand(0.3, 0.7)); g.restore(); }
      for (let i = 0; i < 40; i++) { const a = Math.random() * TAU, d = rand(40, 122); drop(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, rand(1.5, 5)); }
    }
    else if (kind === 2) {   // directional spatter travelling toward +x: elongated drops with tails
      blob(70, 128, 28, 1, 0.5);
      for (let i = 0; i < 46; i++) { const a = rand(-0.45, 0.45), d = rand(30, 175), w = rand(2, 8) * (1 - d / 220), x = 70 + Math.cos(a) * d, y = 128 + Math.sin(a) * d; g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = '#fff'; g.beginPath(); g.ellipse(0, 0, w * rand(1.5, 3), w, 0, 0, TAU); g.fill(); g.fillRect(-w * rand(3, 7), -w * 0.18, w * 4, w * 0.36); g.restore(); }
    }
    else if (kind === 3) { for (let i = 0; i < 34; i++) { const a = Math.random() * TAU, d = Math.pow(Math.random(), 0.7) * 110; drop(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, rand(2, 11) * (1 - d / 150)); } }
    else {   // pool: one thick smooth blob with lobes
      blob(128, 128, 84, 1, 0.12); for (let i = 0; i < 5; i++) { const a = Math.random() * TAU; blob(128 + Math.cos(a) * 62, 128 + Math.sin(a) * 62, rand(30, 46), 1, 0.15); }
    }
    // shade: wet centre a touch brighter, clotted dark rim (multiply alpha-preserving)
    g.globalCompositeOperation = 'source-atop';
    const gr = g.createRadialGradient(128, 128, 10, 128, 128, 128); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.7, 'rgba(120,120,120,0.35)'); gr.addColorStop(1, 'rgba(60,60,60,0.6)');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(${rand(150, 255) | 0},${rand(150, 255) | 0},${rand(150, 255) | 0},0.25)`; g.beginPath(); g.arc(rand(30, 226), rand(30, 226), rand(6, 22), 0, TAU); g.fill(); }
  });
}

// ---------- Init ----------
function fxInit(scene, vmScene, camera = null) {
  FX.scene = scene; FX.vmScene = vmScene; FX.cam = camera;
  flashTex = canvasTex(128, 128, (g, w, h) => {
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,250,220,1)'); gr.addColorStop(0.25, 'rgba(255,200,90,0.9)'); gr.addColorStop(0.6, 'rgba(255,120,30,0.3)'); gr.addColorStop(1, 'rgba(255,80,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'lighter'; g.strokeStyle = 'rgba(255,220,150,0.8)'; g.lineWidth = 6;
    for (let i = 0; i < 5; i++) { const a = i / 5 * TAU + 0.3; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + Math.cos(a) * 60, 64 + Math.sin(a) * 60); g.stroke(); }
  });
  puffTex = canvasTex(64, 64, (g, w, h) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  sparkTex = canvasTex(32, 32, (g, w, h) => { const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,240,180,1)'); gr.addColorStop(1, 'rgba(255,160,40,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  glowTex = canvasTex(64, 64, (g, w, h) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.12, 'rgba(255,240,200,0.9)'); gr.addColorStop(0.4, 'rgba(255,170,70,0.25)'); gr.addColorStop(1, 'rgba(255,120,30,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  holeTex = canvasTex(64, 64, (g, w, h) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 30); gr.addColorStop(0, 'rgba(10,10,10,1)'); gr.addColorStop(0.25, 'rgba(25,22,20,0.95)'); gr.addColorStop(0.5, 'rgba(60,55,50,0.5)'); gr.addColorStop(1, 'rgba(60,55,50,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(20,18,16,0.6)'; g.lineWidth = 1.2; for (let i = 0; i < 6; i++) { const a = Math.random() * TAU; g.beginPath(); g.moveTo(32 + Math.cos(a) * 6, 32 + Math.sin(a) * 6); g.lineTo(32 + Math.cos(a + rand(-0.3, 0.3)) * rand(14, 26), 32 + Math.sin(a) * rand(14, 26)); g.stroke(); }
  });
  // scope glint: hot core, long horizontal anamorphic streak, short vertical spike, faint ring
  glintTex = canvasTex(256, 256, (g, w, h) => {
    g.globalCompositeOperation = 'lighter';
    let gr = g.createRadialGradient(128, 128, 0, 128, 128, 128); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.1, 'rgba(255,252,240,0.95)'); gr.addColorStop(0.22, 'rgba(255,230,180,0.5)'); gr.addColorStop(0.5, 'rgba(255,210,150,0.12)'); gr.addColorStop(1, 'rgba(255,200,140,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const spike = (ang, len, wid, a) => { g.save(); g.translate(128, 128); g.rotate(ang); const lg = g.createLinearGradient(-len, 0, len, 0); lg.addColorStop(0, 'rgba(255,230,190,0)'); lg.addColorStop(0.5, `rgba(255,250,240,${a})`); lg.addColorStop(1, 'rgba(255,230,190,0)'); g.fillStyle = lg; g.beginPath(); g.moveTo(-len, 0); g.lineTo(0, -wid); g.lineTo(len, 0); g.lineTo(0, wid); g.fill(); g.restore(); };
    spike(0, 127, 7, 1); spike(Math.PI / 2, 80, 5, 0.8); spike(Math.PI / 4, 45, 2.5, 0.5); spike(-Math.PI / 4, 45, 2.5, 0.5);
    g.strokeStyle = 'rgba(255,220,180,0.12)'; g.lineWidth = 2; g.beginPath(); g.arc(128, 128, 60, 0, TAU); g.stroke();
  });
  const atlas = atlasTex(); atlas.wrapS = atlas.wrapT = THREE.ClampToEdgeWrapping;
  FX.ps = makePS(4000, false, atlas); FX.pa = makePS(1200, true, atlas); scene.add(FX.ps.pts); scene.add(FX.pa.pts);
  // bullet holes: one instanced mesh, recycled
  FX.holes = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: holeTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), 300);
  FX.holes.count = 0; FX.holes.frustumCulled = false; FX.holeIdx = 0; scene.add(FX.holes);
  // blood decals: 4 splat shapes x 150 = 600, lit (wet sheen in the sun), aged by instance colour
  FX.dec = [0, 1, 2, 3].map(k => {
    const m = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ map: splatTex(k), transparent: true, depthWrite: false, roughness: 0.75, metalness: 0, emissive: 0x0b0101,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -6 - k }), 150);
    const c = new THREE.Color(0, 0, 0); for (let i = 0; i < 150; i++) m.setColorAt(i, c);   // (setColorAt sizes the buffer from .count, so before zeroing it)
    m.count = 0; m.frustumCulled = false; m.renderOrder = 1; m.userData = { idx: 0, born: new Float32Array(150), k: new Float32Array(150) };
    scene.add(m); return m;
  });
  FX.poolMat = new THREE.MeshStandardMaterial({ map: splatTex(4), transparent: true, depthWrite: false, roughness: 0.45, metalness: 0, emissive: 0x0b0101, color: new THREE.Color().setRGB(0.028, 0.0014, 0.0012), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -12 });
  FX.pools = []; FX.poolIdx = 0;
  FX.flashLight = new THREE.PointLight(0xffb060, 0, 12, 2); scene.add(FX.flashLight);
  FX.brassGeo = zcylGeo(0.0065, 0.0065, 0.033, 8); FX.rifleGeo = zcylGeo(0.0078, 0.0078, 0.07, 8);
  FX.brassMat = new THREE.MeshStandardMaterial({ color: 0xd8b050, roughness: 0.3, metalness: 0.6 });
  // projectile streaks and scope glints: pooled
  FX.bullets = []; FX.tracers = [];
  FX.glints = []; FX.glintN = 0;
  // hit confirmation: a bright blood-mist puff with a faint red glow under it, pooled
  mistTex = canvasTex(128, 128, (g) => { for (let k = 0; k < 16; k++) { const a = Math.random() * TAU, d = Math.random() * 26, x = 64 + Math.cos(a) * d, y = 64 + Math.sin(a) * d, r = rand(18, 34), gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); } });
  FX.bursts = []; FX.burstN = 0;
  for (let i = 0; i < 10; i++) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: mistTex, color: 0xffffff, transparent: true, depthWrite: false })), gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.visible = gl.visible = false; m.renderOrder = 3; gl.renderOrder = 3; scene.add(m); scene.add(gl); FX.bursts.push({ m, gl, t: 1, life: 1, s: 1, p: new V3() });
  }
  for (let i = 0; i < 16; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glintTex, color: 0xfff2dc, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending })); s.visible = false; s.renderOrder = 4; scene.add(s); FX.glints.push(s); }
  screenInit();
}
const fxCamera = () => FX.cam || (typeof CAMERA !== 'undefined' ? CAMERA : null);

// ---------- Ray helpers: world boxes + terrain ----------
function terrN(x, z) {
  if (typeof terrainY !== 'function') return [0, 1, 0];
  const e = 0.4, dx = terrainY(x + e, z) - terrainY(x - e, z), dz = terrainY(x, z + e) - terrainY(x, z - e), l = Math.hypot(dx, 2 * e, dz);
  return [-dx / l, 2 * e / l, -dz / l];
}
function fxCast(o, d, maxT) {
  const h = rayWorld(o, d, maxT, true); let t = h ? h.t : maxT, n = h ? h.n : null, mat = h ? h.c.mat : null;
  if (typeof rayTerrain === 'function') { const tt = rayTerrain(o, d, t); if (tt >= 0 && tt < t) { t = tt; mat = 'dirt'; n = terrN(o.x + d.x * tt, o.z + d.z * tt); } }
  return n ? { t, n, mat } : null;
}
// surface under a point: {y, n} (or a guess 1.2 m below when there is nothing)
function fxGround(x, y, z) {
  _v1.set(x, y + 0.3, z); const h = fxCast(_v1, DOWN, 40);
  return h ? { y: y + 0.3 - h.t, n: h.n } : { y: y - 1.2, n: [0, 1, 0] };
}

// ---------- Decals ----------
// pos V3, n [x,y,z], size m, kind 0..3, along: optional V3 (streak direction on the surface), aspect stretches along it
const _d1 = new V3(), _d2 = new V3(), _d3 = new V3(), _d4 = new V3();
function fxDecal(pos, n, size, kind, along = null, aspect = 1) {
  const m = FX.dec[kind], u = m.userData, i = u.idx % 150;
  _d2.set(n[0], n[1], n[2]); _q1.setFromUnitVectors(_Z, _d2);
  let ang = Math.random() * TAU;
  if (along) {   // turn the texture's +x onto the travel direction projected on the surface
    _d3.copy(along).addScaledVector(_d2, -_d2.dot(along));
    if (_d3.lengthSq() > 1e-6) { _d3.normalize(); _d1.copy(_X).applyQuaternion(_q1); ang = Math.atan2(_d4.copy(_d1).cross(_d3).dot(_d2), _d1.dot(_d3)); }
  }
  _q1.multiply(_q2.setFromAxisAngle(_Z, ang));
  _d1.copy(pos).addScaledVector(_d2, 0.004 + (u.idx % 7) * 0.0006);
  _d3.set(size * aspect, size, 1); _fm4.compose(_d1, _q1, _d3); m.setMatrixAt(i, _fm4);
  u.born[i] = FX.time; u.k[i] = rand(0.75, 1.25) * (n[1] > 0.7 ? 0.6 : 1);   // sunlit ground reads brighter than walls: darken floors
  u.idx++; m.count = Math.min(u.idx, 150); m.instanceMatrix.needsUpdate = true; FX.decAge = 0;
}
const _hq = new THREE.Quaternion(), _hm = new THREE.Matrix4(), _hp = new V3(), _hs = new V3(), _hn = new V3();
function fxHole(p, n, s = rand(0.06, 0.09)) {
  _hn.set(n[0], n[1], n[2]); _hq.setFromUnitVectors(_Z, _hn); _hq.multiply(_q2.setFromAxisAngle(_Z, Math.random() * TAU));
  _hp.copy(p).addScaledVector(_hn, 0.005); _hs.set(s, s, s);
  _hm.compose(_hp, _hq, _hs); FX.holes.setMatrixAt(FX.holeIdx % 300, _hm);
  FX.holeIdx++; FX.holes.count = Math.min(FX.holeIdx, 300); FX.holes.instanceMatrix.needsUpdate = true;
}
function decalAge() {   // fresh dark red -> brown-black over ~90 s (albedo kept low: the dusk sun is strong and blood reads darker than dirt;
  // a faint emissive keeps it red rather than black on walls in shade)
  for (const m of FX.dec) {
    const u = m.userData, a = m.instanceColor.array;
    for (let i = 0; i < m.count; i++) {
      const f = Math.min(1, (FX.time - u.born[i]) / 90), k = u.k[i], i3 = i * 3;
      a[i3] = lerp(0.055, 0.018, Math.sqrt(f)) * k; a[i3 + 1] = lerp(0.0022, 0.0034, f) * k; a[i3 + 2] = lerp(0.0018, 0.0024, f) * k;
    }
    m.instanceColor.needsUpdate = true;
  }
}
function sprite(tex, color, size, additive, scene = FX.scene) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
  s.scale.set(size, size, 1); scene.add(s); return s;
}

// ---------- Blood ----------
// p: hit point, dir: bullet travel direction, amount ~1 per hit (0.3 graze .. 3 for a .50 to the chest), head: headshot
function fxBlood(p, dir, amount = 1, head = false) {
  if (!FX.ps) return;
  fxShade(p); fxBurst(p, amount, head);
  const S = FX.ps, d = new V3(); if (dir && dir.lengthSq() > 1e-6) d.copy(dir).normalize(); else d.set(rand(-1, 1), 0.3, rand(-1, 1)).normalize();
  const amt = clamp(amount, 0.2, 3) * (head ? 1.6 : 1), G = 9.8, gr = fxGround(p.x, p.y, p.z), gy = gr.y;
  // the shot goes through: exit spray leaves from the far side of the body, the shooter sees entry back-spray and mist
  const e = new V3().copy(p).addScaledVector(d, head ? 0.2 : 0.32);
  const bc = () => COL.blood[(Math.random() * 4) | 0];
  // exit spray: fast droplets along the shot; a share of them stain where they land
  let stains = 0;
  const N = room(S, Math.round((30 + 36 * amt))), maxStain = Math.round(10 + 8 * amt);
  for (let i = 0; i < N; i++) {
    const sp = rand(1.5, 8) * (head ? 1.3 : 1), cone = rand(0.15, 0.7);
    const vx = d.x * sp + rand(-1, 1) * sp * cone, vy = d.y * sp + rand(-0.4, 1) * sp * cone + rand(0, 1.2), vz = d.z * sp + rand(-1, 1) * sp * cone;
    const size = rand(0.016, 0.05) * (Math.random() < 0.15 ? 1.8 : 1);
    if (i % 3 === 0 && stains < maxStain) {   // ballistic, no drag, so the landing point is exact
      const h = e.y - gy, tl = (vy + Math.sqrt(Math.max(0, vy * vy + 2 * G * h))) / G;
      if (tl > 0 && tl < 2.5) {
        stains++;
        emit(S, e.x, e.y, e.z, vx, vy, vz, tl, size, size, bc(), 1, G, 0, 3);
        FX.pending.push({ t: FX.time + tl, x: e.x + vx * tl, y: gy, z: e.z + vz * tl, top: Math.max(e.y, gy + 0.6), s: rand(0.08, 0.28) * (head ? 1.3 : 1), k: Math.random() < 0.6 ? 3 : 0, vx, vz });
        continue;
      }
    }
    emit(S, e.x, e.y, e.z, vx, vy, vz, 2, size, size * 0.8, bc(), 1, G, 0.5, 3, PF.FLOOR | PF.DIE, 0.02, gy);
  }
  // entry back-spray toward the shooter
  for (let i = room(S, Math.round(16 * amt)); i > 0; i--) { const sp = rand(0.8, 3.5); emit(S, p.x, p.y, p.z, -d.x * sp + rand(-1.2, 1.2), -d.y * sp + rand(0, 1.6), -d.z * sp + rand(-1.2, 1.2), 1.5, rand(0.012, 0.03), 0.012, bc(), 1, G, 0.6, 3, PF.FLOOR | PF.DIE, 0.02, gy); }
  // thick clumps
  for (let i = room(S, Math.round(6 * amt)); i > 0; i--) { const sp = rand(1, 4); emit(S, e.x, e.y, e.z, d.x * sp + rand(-0.6, 0.6), d.y * sp + rand(0, 1.5), d.z * sp + rand(-0.6, 0.6), 2, rand(0.04, 0.1), rand(0.03, 0.06), COL.blood[2], 1, G, 0.4, 4, PF.FLOOR | PF.DIE, 0.02, gy); }
  // the hit itself: a dense dark-red burst that reads through a scope at 200 m+
  for (let i = room(S, head ? 6 : 4); i > 0; i--) { const sp = rand(0.3, 1.5); emit(S, p.x, p.y, p.z, d.x * sp * (i % 2 ? 1 : -0.5) + rand(-0.4, 0.4), rand(-0.1, 0.4), d.z * sp * (i % 2 ? 1 : -0.5) + rand(-0.4, 0.4), rand(0.3, 0.5), head ? 0.22 : 0.14, (head ? 0.9 : 0.6) * rand(0.8, 1.2), COL.blood[1], 0.9, 0.5, 5, 1, 0, 0.012); }
  // mist: lingering red cloud (pink and much bigger for a headshot)
  for (let i = room(S, head ? 22 : Math.round(10 + 6 * amt)); i > 0; i--) {   // alternate: exit side blowing on, entry side puffing back at the shooter
    const ex = i % 3 !== 0, o = ex ? e : p, sp = ex ? rand(0.6, head ? 5 : 2.8) : -rand(0.2, head ? 1.6 : 1), s0 = head ? rand(0.2, 0.38) : rand(0.16, 0.28), w = head ? 1 : 0.5;
    emit(S, o.x, o.y, o.z, d.x * sp + rand(-w, w), d.y * sp + rand(-0.2, 0.6), d.z * sp + rand(-w, w), rand(1, head ? 2.8 : 2), s0, s0 * rand(3, head ? 6 : 5),
      head ? (Math.random() < 0.35 ? COL.pinkMist : COL.bloodMist) : COL.bloodMist, head ? rand(0.3, 0.5) : rand(0.5, 0.7), 0.2, 3.2, Math.random() < 0.3 ? 0 : 1, PF.HOLD * (i % 4 === 0), 0.03);
  }
  if (head) for (let i = room(S, 12); i > 0; i--) {   // bits
    const sp = rand(2, 7); emit(S, e.x, e.y, e.z, d.x * sp + rand(-1.5, 1.5), d.y * sp + rand(0, 2.5), d.z * sp + rand(-1.5, 1.5), rand(1.5, 2.5), rand(0.015, 0.04), rand(0.015, 0.04), Math.random() < 0.25 ? COL.bone : COL.meat, 1, G, 0.3, 5, PF.FLOOR, 0.02, gy + 0.01);
  }
  // spatter on whatever is behind them: a cone of rays along the shot
  const maxT = head ? 7 : 6, K = Math.round(6 + 5 * amt);
  for (let k = 0; k < K; k++) {
    const j = k === 0 ? 0.03 : 0.32; _v1.set(d.x + rand(-j, j), d.y + rand(-j, j * 0.7), d.z + rand(-j, j)).normalize();
    const h = fxCast(e, _v1, maxT); if (!h) continue;
    const graze = 1 - Math.abs(h.n[0] * _v1.x + h.n[1] * _v1.y + h.n[2] * _v1.z), f = h.t / maxT;
    FX.pending.push({ t: FX.time + h.t / 9, x: e.x + _v1.x * h.t, y: e.y + _v1.y * h.t, z: e.z + _v1.z * h.t, n: h.n, s: lerp(0.95, 0.3, f) * rand(0.7, 1.3) * (head ? 1.3 : 1) * (k === 0 ? 1.4 : 1),
      k: k === 0 ? 1 : Math.random() < 0.65 ? 2 : 3, ax: _v1.x, ay: _v1.y, az: _v1.z, asp: 1 + graze * 1.5 });
  }
  // drips straight down under the wound
  for (let i = 0; i < 2 + Math.round(amt); i++) FX.pending.push({ t: FX.time + rand(0.25, 0.9), x: p.x + rand(-0.25, 0.25), y: gy, z: p.z + rand(-0.25, 0.25), n: gr.n, s: rand(0.12, 0.3), k: 3 });
  if (amt > 1.2) FX.pending.push({ t: FX.time + 0.5, x: p.x + d.x * 0.4, y: gy, z: p.z + d.z * 0.4, n: gr.n, s: rand(0.45, 0.7), k: 1 });
}
// A brighter, short-lived mist puff at the hit so a hit reads at 100-250 m through a scope: the spray itself is dark, tiny and
// mostly behind a back-lit body. Pulled a little toward the camera so the body can't hide it, and never under a few pixels.
function fxBurst(p, amount = 1, head = false) {
  const cam = fxCamera(); if (!FX.bursts) return;
  const u = FX.bursts[FX.burstN++ % FX.bursts.length], dc = cam ? cam.position.distanceTo(p) : 20, pr = cam ? cam.projectionMatrix.elements[5] : 1.3;
  if (cam) _v1.subVectors(cam.position, p).divideScalar(Math.max(dc, 1e-3)); else _v1.set(0, 0, 0);
  u.p.copy(p).addScaledVector(_v1, Math.min(0.45, dc * 0.3));
  u.s = Math.max((head ? 1.3 : 0.95) * Math.sqrt(clamp(amount, 0.5, 2)), dc * 0.028 / Math.pow(pr, 0.75));
  u.t = 0; u.life = head ? 0.55 : 0.42;
  const k = 0.55 + 0.45 * FX.dimK;   // dimmer in dark rooms, but it is meant to pop
  u.m.material.color.setRGB(0.55 * k, 0.06 * k, 0.05 * k); u.gl.material.color.setRGB(0.16 * k, 0.012 * k, 0.008 * k);
  u.m.material.rotation = Math.random() * TAU;
  u.m.position.copy(u.p); u.gl.position.copy(u.p); u.m.visible = u.gl.visible = true;
}
function pendingTick() {
  for (let i = FX.pending.length - 1; i >= 0; i--) {
    const e = FX.pending[i]; if (FX.time < e.t) continue;
    FX.pending[i] = FX.pending[FX.pending.length - 1]; FX.pending.pop();
    if (e.n) { _v3.set(e.x, e.y, e.z); const al = e.ax !== undefined ? _v2.set(e.ax, e.ay, e.az).clone() : null; fxDecal(_v3, e.n, e.s, e.k, al, e.asp || 1); continue; }
    // a droplet landing: find what it actually landed on (a ledge, a roof, the street)
    const g = fxGround(e.x, e.top, e.z); _v3.set(e.x, g.y, e.z);
    fxDecal(_v3, g.n, e.s, e.k, _v2.set(e.vx, 0, e.vz).clone(), 1 + Math.min(0.8, Math.hypot(e.vx, e.vz) * 0.12));
  }
}
// a pool spreading out under a body over a few seconds
function fxBloodPool(p) {
  if (!FX.scene) return;
  const g = fxGround(p.x, p.y + 0.4, p.z);
  let m = FX.pools[FX.poolIdx % 12];
  if (!m) { m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), FX.poolMat); m.renderOrder = 1; FX.scene.add(m); FX.pools.push(m); }
  FX.poolIdx++;
  _v2.set(g.n[0], g.n[1], g.n[2]); m.quaternion.setFromUnitVectors(_Z, _v2).multiply(_q2.setFromAxisAngle(_Z, Math.random() * TAU));
  m.position.set(p.x, g.y, p.z).addScaledVector(_v2, 0.006); m.scale.setScalar(0.05); m.visible = true;
  m.userData = { t: 0, size: rand(1.4, 2.1), dur: rand(6, 9) };
}

// ---------- Screen blood (DOM canvas over the 3D view, under the menus) ----------
const SB = { cv: null, g: null, list: [], spr: [], slash: -1, vig: 0, w: 0, h: 0 };
function screenInit() {
  if (SB.cv || typeof document === 'undefined') return;
  const cv = SB.cv = document.createElement('canvas');
  cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:6;';
  document.body.appendChild(cv); SB.g = cv.getContext('2d');
  for (let k = 0; k < 6; k++) {   // splat sprites: glossy dark red with a bright wet highlight
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
    const blob = (x, y, r) => { g.beginPath(); for (let i = 0; i <= 20; i++) { const a = i / 20 * TAU, rr = r * rand(0.75, 1.15); g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.fill(); };
    const gr = g.createRadialGradient(128, 128, 5, 128, 128, 120); gr.addColorStop(0, 'rgba(92,4,3,0.88)'); gr.addColorStop(0.6, 'rgba(70,2,2,0.85)'); gr.addColorStop(1, 'rgba(38,0,0,0.8)');
    g.fillStyle = gr; blob(128, 128, rand(40, 60));
    for (let i = 0; i < 16; i++) { const a = Math.random() * TAU, d = rand(45, 110); g.beginPath(); g.arc(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, rand(3, 12) * (1 - d / 160), 0, TAU); g.fill(); }
    for (let i = 0; i < 5; i++) { const a = Math.random() * TAU; blob(128 + Math.cos(a) * 45, 128 + Math.sin(a) * 45, rand(12, 25)); }
    g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(255,190,180,0.14)'; g.beginPath(); g.ellipse(112, 108, 22, 9, -0.6, 0, TAU); g.fill(); g.fillStyle = 'rgba(20,0,0,0.25)'; g.beginPath(); g.arc(140, 145, 30, 0, TAU); g.fill();
    SB.spr.push(c);
  }
}
// amount: fraction of health lost (0..1), or raw damage if > 1.5 (e.g. 25)
function fxScreenBlood(amount) {
  if (!SB.cv) return;
  const a = clamp(amount > 1.5 ? amount / 100 : amount, 0.05, 1.5), W = SB.w || innerWidth * 0.75, H = SB.h || innerHeight * 0.75, M = Math.min(W, H);
  SB.vig = Math.min(1, SB.vig + a * 1.3);
  const n = Math.round(2 + a * 14);
  for (let i = 0; i < n; i++) {
    const side = (Math.random() * 4) | 0, depth = Math.pow(Math.random(), 2) * M * (0.12 + a * 0.2);   // hug the edges
    let x, y; if (side === 0) { x = depth; y = Math.random() * H; } else if (side === 1) { x = W - depth; y = Math.random() * H; } else if (side === 2) { x = Math.random() * W; y = depth; } else { x = Math.random() * W; y = H - depth * 0.6; }
    const s = M * rand(0.12, 0.35) * (0.6 + a * 0.6), life = rand(2.5, 3.5) + a * 3;
    const drips = []; if (Math.random() < 0.6) for (let k = 0, nd = 1 + ((Math.random() * 3) | 0); k < nd; k++) drips.push({ dx: rand(-0.25, 0.25) * s, w: rand(1.5, 4) * M / 400, v: rand(8, 30) * M / 400, max: rand(0.3, 1.2) * s + M * 0.05 });
    if (SB.list.length > 60) SB.list.shift();
    SB.list.push({ x, y, s, r: Math.random() * TAU, img: SB.spr[(Math.random() * SB.spr.length) | 0], t: 0, life, drips });
  }
}
function fxKnifeSlash() { SB.slash = 0; SB.slashDir = Math.random() < 0.5 ? 1 : -1; }
function screenTick(dt) {
  if (!SB.cv) return;
  if (!SB.list.length && SB.vig <= 0 && SB.slash < 0) { if (SB.dirty) { SB.g.clearRect(0, 0, SB.w, SB.h); SB.dirty = false; } return; }
  const W = Math.max(1, Math.round(innerWidth * 0.75)), H = Math.max(1, Math.round(innerHeight * 0.75));   // a bit under full res: cheap and still smooth
  if (SB.cv.width !== W || SB.cv.height !== H) { SB.cv.width = W; SB.cv.height = H; }
  SB.w = W; SB.h = H; SB.dirty = true;
  const g = SB.g; g.clearRect(0, 0, W, H);
  if (SB.vig > 0) {   // red, darkening vignette that pulses away
    const gr = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    gr.addColorStop(0, 'rgba(80,0,0,0)'); gr.addColorStop(1, `rgba(60,0,0,${0.45 * SB.vig})`); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    SB.vig = Math.max(0, SB.vig - dt * 0.35);
  }
  for (let i = SB.list.length - 1; i >= 0; i--) {
    const b = SB.list[i]; b.t += dt; const k = b.t / b.life;
    if (k >= 1) { SB.list.splice(i, 1); continue; }
    g.globalAlpha = k < 0.55 ? Math.min(1, b.t * 12) : (1 - k) / 0.45;
    g.save(); g.translate(b.x, b.y); g.rotate(b.r); g.drawImage(b.img, -b.s / 2, -b.s / 2, b.s, b.s); g.restore();
    g.fillStyle = g.strokeStyle = 'rgba(66,2,1,0.88)'; g.lineCap = 'round';
    for (const d of b.drips) {   // runs down the screen, slowing
      const len = Math.min(d.max, d.v * b.t * (1 - b.t / (b.life * 2))); if (len <= 0) continue;
      const x = b.x + d.dx; g.lineWidth = d.w; g.beginPath(); g.moveTo(x, b.y); g.lineTo(x, b.y + len); g.stroke();
      g.beginPath(); g.arc(x, b.y + len, d.w * 0.9, 0, TAU); g.fill();
    }
  }
  g.globalAlpha = 1;
  if (SB.slash >= 0) {   // knife: a quick bright arc sweeping across the view
    SB.slash += dt; const k = SB.slash / 0.22;
    if (k >= 1) SB.slash = -1;
    else {
      const cx = W / 2, cy = H * 0.62, R = Math.min(W, H) * 0.55, s = SB.slashDir, a0 = -2.5, sweep = 1.9, head = a0 + sweep * Math.min(1, k * 1.6), tail = a0 + sweep * Math.max(0, k * 1.6 - 0.55);
      for (let j = 0; j < 3; j++) {
        g.strokeStyle = `rgba(235,235,225,${(1 - k) * [0.12, 0.25, 0.6][j]})`; g.lineWidth = [14, 7, 2.5][j] * Math.min(W, H) / 400;
        g.beginPath(); g.ellipse(cx, cy, R, R * 0.45, s * 0.35, s > 0 ? tail : -head - Math.PI, s > 0 ? head : -tail - Math.PI); g.stroke();
      }
    }
  }
}

// ---------- Impacts per material ----------
function fxImpact(p, n, mat) {
  if (!FX.ps) return;
  fxShade(p);
  if (mat === 'flesh') { fxBlood(p, _v1.set(-n[0], -n[1], -n[2]).clone(), 0.6, false); return; }
  const S = FX.ps, A = FX.pa, nx = n[0], ny = n[1], nz = n[2], x = p.x + nx * 0.03, y = p.y + ny * 0.03, z = p.z + nz * 0.03;
  const soft = mat === 'dirt' || mat === 'grass' || mat === 'gravel' || mat === 'terrain';
  if (mat !== 'foliage' && mat !== 'water') fxHole(p, n, soft ? rand(0.08, 0.12) : undefined);
  const floor = fxGround(p.x, p.y + 0.05, p.z).y + 0.01;
  const spray = (cnt, sp, up, life, s, c, a, grav, drag, cell, fl = PF.FLOOR) => { for (let i = room(S, cnt); i > 0; i--) { const v = rand(sp * 0.4, sp); emit(S, x, y, z, nx * v + rand(-1, 1) * sp * 0.5, ny * v + rand(0, up), nz * v + rand(-1, 1) * sp * 0.5, life * rand(0.7, 1.3), s * rand(0.6, 1.4), s, c, a, grav, drag, cell, fl, 0.02, floor); } };
  const puff = (cnt, c, a, s0, s1, life, sp = 1) => { for (let i = room(S, cnt); i > 0; i--) { const v = rand(0.3, 1.2) * sp; emit(S, x, y, z, nx * v + rand(-0.3, 0.3), ny * v + rand(0.05, 0.4), nz * v + rand(-0.3, 0.3), life * rand(0.7, 1.3), s0, s1 * rand(0.7, 1.3), c, a, -0.1, 2.5, 1, 0, 0.05); } };
  const sparks = (cnt, sp) => { for (let i = room(A, cnt); i > 0; i--) { const v = rand(2, sp); emit(A, x, y, z, nx * v + rand(-1, 1) * v * 0.6, ny * v + rand(0, 2.5), nz * v + rand(-1, 1) * v * 0.6, rand(0.15, 0.4), rand(0.015, 0.03), 0.008, Math.random() < 0.4 ? COL.sparkHot : COL.spark, 1, 9, 0.5, 2, PF.FLOOR, 0.01, floor); } };
  if (mat === 'metal') { sparks(18, 8); emit(A, x, y, z, 0, 0, 0, 0.06, 0.12, 0.2, COL.sparkHot, 1, 0, 0, 9); puff(2, COL.smoke, 0.35, 0.06, 0.3, 0.6); }
  else if (mat === 'wood') { spray(9, 3.5, 2, 1.2, 0.04, Math.random() < 0.5 ? COL.wood : COL.woodDark, 1, 9, 0.6, 6); puff(4, COL.wood, 0.5, 0.1, 0.6, 1.1); }
  else if (soft) { spray(18, 3.5, 5, 1.1, 0.035, COL.dirtDark, 1, 9, 0.8, 5); spray(8, 1.5, 3, 1.3, 0.02, COL.dirt, 1, 9, 0.8, 4); puff(7, COL.dirt, 0.6, 0.15, 1.1, 1.8, 1.8); if (mat === 'grass') spray(5, 1.5, 2, 1.6, 0.03, COL.leaf, 1, 2, 3, 7); }
  else if (mat === 'glass') { spray(14, 3, 2, 1.2, 0.03, COL.glass, 0.9, 9, 0.3, 8); for (let i = room(A, 6); i > 0; i--) emit(A, x, y, z, rand(-1, 1), rand(-1, 1), rand(-1, 1), rand(0.2, 0.5), 0.03, 0.01, COL.sparkHot, 0.5, 4, 1, 2); }
  else if (mat === 'foliage') { spray(10, 1.5, 1.5, 2, 0.04, COL.leaf, 1, 1.5, 3, 7, 0); puff(2, COL.dust, 0.2, 0.08, 0.3, 0.6); }
  else if (mat === 'water') { spray(16, 1.5, 5, 0.8, 0.03, COL.water, 0.8, 9, 0.5, 3); puff(4, COL.water, 0.35, 0.1, 0.5, 0.7); }
  else { spray(12, 4, 2.5, 1, 0.03, COL.conc, 1, 9, 0.5, 5); puff(6, COL.dust, 0.6, 0.1, 0.9, 1.5, 1.4); if (Math.random() < 0.4) sparks(3, 5); }   // concrete, brick, plaster
}
function fxDust(p) {   // a miss kicking up the ground
  if (!FX.ps) return;
  fxShade(p);
  const S = FX.ps, floor = fxGround(p.x, p.y + 0.3, p.z).y + 0.01;
  for (let i = room(S, 5); i > 0; i--) emit(S, p.x, p.y + 0.05, p.z, rand(-0.4, 0.4), rand(0.5, 1.5), rand(-0.4, 0.4), rand(0.9, 1.6), 0.1, rand(0.5, 0.9), COL.dirt, 0.5, -0.05, 2.5, 1, 0, 0.05);
  for (let i = room(S, 8); i > 0; i--) emit(S, p.x, p.y + 0.05, p.z, rand(-1, 1), rand(1.5, 4), rand(-1, 1), 1.2, rand(0.015, 0.03), 0.02, COL.dirtDark, 1, 9, 0.5, 5, PF.FLOOR, 0.02, floor);
}

// ---------- Muzzle: flash, forward blast cone, brake side jets, lingering smoke, ground dust ----------
function fxMuzzle(p, dir, big = 1) {
  if (!FX.ps) return;
  fxShade(p);
  // never smaller than a few pixels: a flash in a dark window is how you find a sniper at 200 m
  const cam = fxCamera(), dc = cam ? cam.position.distanceTo(p) : 10, pr = cam ? cam.projectionMatrix.elements[5] : 1.3;
  const s = sprite(flashTex, 0xffffff, Math.max(0.5 * big, dc * 0.011 * big / Math.pow(pr, 0.6)), true); s.position.copy(p); s.material.rotation = Math.random() * TAU;
  FX.list.push({ obj: s, t: 0, life: 0.05 });
  FX.flashLight.position.copy(p); FX.flashLight.intensity = 3 * big; FX.flashT = 0.05;
  const S = FX.ps, A = FX.pa;
  if (dir) {
    for (let i = 0; i < 4; i++) { const k = (i + 1) * 0.12 * big; emit(A, p.x + dir.x * k, p.y + dir.y * k, p.z + dir.z * k, 0, 0, 0, 0.05, 0.25 * big * (1 - i * 0.2), 0.3 * big, COL.sparkHot, 0.9, 0, 0, 9); }
    if (big >= 1.4) { _v1.crossVectors(dir, UP); if (_v1.lengthSq() < 1e-4) _v1.set(1, 0, 0); _v1.normalize(); for (const sd of [-1, 1]) emit(A, p.x + _v1.x * sd * 0.1, p.y + 0.02, p.z + _v1.z * sd * 0.1, 0, 0, 0, 0.05, 0.15 * big, 0.25 * big, COL.spark, 0.8, 0, 0, 9); }
  }
  for (let i = room(S, Math.round(4 + 3 * big)); i > 0; i--) {   // smoke hangs around and gives a sniper away
    const v = rand(0.5, 3.5), dx = dir ? dir.x : 0, dy = dir ? dir.y : 0.3, dz = dir ? dir.z : 0;
    emit(S, p.x, p.y, p.z, dx * v + rand(-0.3, 0.3), dy * v + rand(0.05, 0.4), dz * v + rand(-0.3, 0.3), rand(1.4, 3) * Math.min(1.5, big), 0.15 * big, rand(0.7, 1.3) * big, COL.smoke, rand(0.25, 0.38), -0.15, 2.2, 1, 0, 0.06);
  }
  if (dir && big >= 1.2) {   // prone / low: the blast lifts dust off the ground
    const g = fxGround(p.x, p.y, p.z);
    if (p.y - g.y < 0.7) for (let i = room(S, 10); i > 0; i--) { const a = Math.random() * TAU, v = rand(1, 3); emit(S, p.x + dir.x * 0.3, g.y + 0.05, p.z + dir.z * 0.3, Math.cos(a) * v + dir.x * 2, rand(0.2, 0.8), Math.sin(a) * v + dir.z * 2, rand(1.2, 2.2), 0.15, rand(0.6, 1.2), COL.dirt, 0.4, -0.05, 2, 1, 0, 0.05); }
  }
}

// ---------- Projectile streaks ----------
// Three layers so a round reads from any angle: a hot core streak (about one frame of travel: motion blur) for side views,
// a head flare that stays several pixels wide end-on (the shooter's and the target's view), and a vapour trace that hangs
// along the whole path, drifting and spreading, so through a scope you can follow the shot down range.
const BUL_VS = `#include <common>
uniform vec3 uA, uB; uniform float uW; varying vec2 vUv;
#include <logdepthbuf_pars_vertex>
void main(){ vec3 p = mix(uA, uB, position.x), ax = uB - uA, toC = cameraPosition - p; float d = length(toC);
  vec3 side = cross(ax, toC); float sl = length(side); side = sl > 1e-6 ? side / sl : vec3(0.0, 1.0, 0.0);
  float w = max(0.01, d * uW / pow(projectionMatrix[1][1], 0.7));   // ~constant on screen, a bit bigger through a scope
  p += side * w * position.y; vUv = position.xy; gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  #include <logdepthbuf_vertex>
}`;
const BUL_FS = `uniform vec3 uCol; uniform float uI; varying vec2 vUv;
#include <logdepthbuf_pars_fragment>
void main(){
  #include <logdepthbuf_fragment>
  float y = abs(vUv.y), core = exp(-y * y * 28.0), halo = exp(-y * y * 3.2) * 0.4, along = pow(vUv.x, 1.5);
  float a = (core * 1.4 + halo) * along * uI; vec3 c = mix(uCol, vec3(1.0, 0.93, 0.8), core * 0.75);
  // premultiplied: glows over dark backgrounds, and the halo still tints bright haze orange instead of washing out
  gl_FragColor = vec4(c * a, clamp(halo * along * uI * 1.6 + core * along * uI * 0.5, 0.0, 0.9));
  #include <encodings_fragment>
}`;
// vapour trace: a camera-facing ribbon through the points the round passed, each point aging on its own
const TRAIL_N = 96;
const TRL_VS = `#include <common>
attribute float aSide, aT, aSeed; attribute vec3 aDir;
uniform float uTime, uLife, uW0, uW1, uPx, uA, uOwn; uniform vec3 uWind;
varying float vA, vS, vHot;
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
void main(){
  float age = max(0.0, uTime - aT), k = clamp(age / uLife, 0.0, 1.0);
  // drifts with the wind, rises a little and curls
  vec3 p = position + uWind * age + vec3(sin(aSeed * 6.3 + age * 2.1), cos(aSeed * 4.1 + age * 1.7) + 0.5, sin(aSeed * 3.7 - age * 1.9)) * (0.07 * age);
  vec3 toC = cameraPosition - p; float d = length(toC);
  vec3 side = cross(aDir, toC); float sl = length(side); side = sl > 1e-6 ? side / sl : vec3(0.0, 1.0, 0.0);
  float px = d * uPx / projectionMatrix[1][1];   // world size of one pixel here
  float ww = mix(uW0, uW1, sqrt(k)), w = clamp(ww, px * 1.3, px * 36.0);
  float al = abs(dot(aDir, toC / max(d, 1e-3)));
  // thinner than a pixel: widen but fade (stays a hairline far off); end-on and close: fade so it is never a blob in your face
  // lumpy along its length (each point has its own density), brightest while fresh, then a thin haze that spreads and goes
  float lump = 0.45 + 0.55 * fract(aSeed * 7.13 + 0.3);
  vA = uA * lump * (0.4 + 0.6 * exp(-age * 4.0)) * pow(1.0 - k, 1.2) * clamp(ww / w, 0.25, 1.0) * mix(1.0, smoothstep(3.0, 28.0, d), al * al) * smoothstep(0.0, 0.025, age);
  // our own round flies straight away from us: end-on the whole trace stacks into one glow over the target, so it goes
  vA *= 1.0 - uOwn * smoothstep(0.93, 0.995, al);
  vHot = exp(-age * 10.0); vS = aSide;
  vec4 mvPosition = viewMatrix * vec4(p + side * w * aSide, 1.0); gl_Position = projectionMatrix * mvPosition;
  #include <logdepthbuf_vertex>
  #include <fog_vertex>
}`;
const TRL_FS = `uniform vec3 uCol, uHot; varying float vA, vS, vHot;
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
void main(){
  #include <logdepthbuf_fragment>
  float y = vS * vS, a = vA * exp(-y * 3.0) * (1.0 - y); vec3 c = mix(uCol, uHot, vHot);
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      float ff = 1.0 - exp(-fogDensity * fogDensity * fogDepth * fogDepth);
    #else
      float ff = smoothstep(fogNear, fogFar, fogDepth);
    #endif
    c = mix(c, fogColor, ff * 0.7); a *= 1.0 - ff * 0.6;
  #endif
  gl_FragColor = vec4(c * a, a * 0.75); if (a < 0.002) discard;
  #include <encodings_fragment>
}`;
let _bulGeo = null, _trlIdx = null;
function trailMake() {
  const g = new THREE.BufferGeometry(), n = TRAIL_N * 2;
  const at = (name, k) => { const b = new THREE.BufferAttribute(new Float32Array(n * k), k); b.setUsage(THREE.DynamicDrawUsage); g.setAttribute(name, b); return b; };
  at('position', 3); at('aDir', 3); at('aT', 1); at('aSeed', 1);
  const side = new Float32Array(n); for (let i = 0; i < n; i++) side[i] = i & 1 ? 1 : -1; g.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
  if (!_trlIdx) { const ix = []; for (let i = 0; i < TRAIL_N - 1; i++) { const a = i * 2; ix.push(a, a + 1, a + 3, a, a + 3, a + 2); } _trlIdx = new THREE.BufferAttribute(new Uint16Array(ix), 1); }
  g.setIndex(_trlIdx); g.setDrawRange(0, 0);
  const uni = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uLife: { value: 1.3 }, uW0: { value: 0.012 }, uW1: { value: 0.34 }, uPx: { value: 0.002 }, uA: { value: 0.4 }, uOwn: { value: 0 },
    uWind: { value: new V3(0.35, 0.08, 0.15) }, uCol: { value: new V3(...lin(0xd8d6d2)) }, uHot: { value: new V3(...lin(0xffa860)).multiplyScalar(1.8) } }]);
  const mat = new THREE.ShaderMaterial({ uniforms: uni, vertexShader: TRL_VS, fragmentShader: TRL_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true, toneMapped: false,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendEquation: THREE.AddEquation });
  const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; mesh.renderOrder = 4; mesh.visible = false; FX.scene.add(mesh);
  return { mesh, geo: g, mat, n: 0, until: 0, lastT: -1 };
}
function trailPush(tr, p, d) {
  const A = tr.geo.attributes, P = A.position.array, D = A.aDir.array, T = A.aT.array, R = A.aSeed.array;
  if (tr.n >= TRAIL_N) { P.copyWithin(0, 6); D.copyWithin(0, 6); T.copyWithin(0, 2); R.copyWithin(0, 2); tr.n--; }   // full: drop the oldest
  const i = tr.n++, seed = Math.random();
  for (let s = 0; s < 2; s++) { const v = i * 2 + s, v3 = v * 3; P[v3] = p.x; P[v3 + 1] = p.y; P[v3 + 2] = p.z; D[v3] = d.x; D[v3 + 1] = d.y; D[v3 + 2] = d.z; T[v] = FX.time; R[v] = seed; }
  A.position.needsUpdate = A.aDir.needsUpdate = A.aT.needsUpdate = A.aSeed.needsUpdate = true;
  tr.geo.setDrawRange(0, Math.max(0, tr.n - 1) * 6); tr.mesh.visible = tr.n > 1; tr.lastT = FX.time;
}
function bulletSlot() {
  // a free slot whose vapour has gone, else any free slot, else steal the oldest
  let b = FX.bullets.find(b => !b.active && FX.time > b.tr.until);
  if (!b && FX.bullets.length >= 32) b = FX.bullets.find(b => !b.active) || FX.bullets.reduce((o, x) => x.born < o.born ? x : o);
  if (!b) {
    if (!_bulGeo) { _bulGeo = new THREE.BufferGeometry(); _bulGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, 1, 0]), 3)); _bulGeo.setIndex([0, 1, 2, 0, 2, 3]); }
    const mat = new THREE.ShaderMaterial({ uniforms: { uA: { value: new V3() }, uB: { value: new V3() }, uW: { value: 0.0095 }, uCol: { value: new THREE.Vector3(...lin(0xff8a26)) }, uI: { value: 1 } },
      vertexShader: BUL_VS, fragmentShader: BUL_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendEquation: THREE.AddEquation });
    const mesh = new THREE.Mesh(_bulGeo, mat); mesh.frustumCulled = false; mesh.renderOrder = 5; mesh.visible = false; FX.scene.add(mesh);
    const head = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffb060, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending })); head.visible = false; head.renderOrder = 5; FX.scene.add(head);
    b = { mesh, mat, head, tr: trailMake(), last: new V3(), dir: new V3(), active: false, gen: 0, born: 0, trav: 0, vac: 0, supp: false };
    FX.bullets.push(b);
  }
  return b;
}
function bulletUpdate(b, pos) {
  const cam = fxCamera(); _v1.subVectors(pos, b.last); const seg = _v1.length();
  if (seg > 1e-4) b.dir.copy(_v1).divideScalar(seg);
  b.trav += seg;
  const len = Math.min(b.trav, Math.max(4, Math.min(30, seg * 1.3)));   // about one frame of travel: motion blur
  const u = b.mat.uniforms; u.uB.value.copy(pos); u.uA.value.copy(pos).addScaledVector(b.dir, -len);
  u.uI.value = (b.supp ? 0.35 : 1.25) * rand(0.82, 1.08);   // flicker
  b.mesh.visible = true;
  const pr = cam ? cam.projectionMatrix.elements[5] : 1.3, dc = cam ? cam.position.distanceTo(pos) : 10;
  // end-on (shooter behind it, target in front) the streak collapses to a point, so the flare carries it: bigger head-on
  const al = cam && dc > 1e-3 ? Math.abs(_v2.subVectors(cam.position, pos).dot(b.dir)) / dc : 0, al4 = al * al * al * al;
  b.head.visible = true; b.head.position.copy(pos); b.head.scale.setScalar(Math.max(0.05, dc * 0.034 / Math.pow(pr, 0.75)) * (b.own ? 1 : 1 + 0.9 * al4) * (b.supp ? 0.6 : 1) * rand(0.85, 1.1));
  b.head.material.opacity = b.supp ? 0.4 : 1;
  // the trace starts a few metres out so it never fogs the shooter's own scope
  if (b.trav > 3 && FX.time - b.tr.lastT >= 1 / 80) trailPush(b.tr, pos, b.dir);
  // a few loose puffs of vapour give the trace some body, warm embers just behind the head
  const S = FX.ps, A = FX.pa; FX.dimK = 1;
  if (b.trav > 5) {
    b.vac += seg; const step = 3, cnt = Math.min(6, Math.floor(b.vac / step)); b.vac -= cnt * step;
    for (let i = 0; i < cnt && S.n < S.cap * 0.7; i++) {
      const f = (i + Math.random()) / Math.max(1, cnt), x = b.last.x + _v1.x * f, y = b.last.y + _v1.y * f, z = b.last.z + _v1.z * f;
      emit(S, x, y, z, rand(-0.12, 0.12), rand(0.02, 0.18), rand(-0.12, 0.12), rand(0.7, 1.1), 0.06, rand(0.3, 0.45), COL.vapour, b.supp ? 0.03 : 0.06, -0.05, 1, 0, 0, 0.08);
    }
  }
  for (let i = 0; i < 2 && A.n < A.cap * 0.7; i++) { const f = Math.random(); emit(A, pos.x - _v1.x * f, pos.y - _v1.y * f, pos.z - _v1.z * f, 0, 0, 0, rand(0.08, 0.2), Math.max(0.03, dc * 0.004), 0.01, COL.ember, b.supp ? 0.15 : 0.45, 0, 0, 2); }
  b.last.copy(pos);
}
// fxBullet(o, v, supp) -> {update(pos), end()}: call update each frame with the projectile's position, end() when it stops
function fxBullet(o, v, supp = false) {
  if (!FX.scene) return { update() {}, end() {} };
  if (supp && typeof supp === 'object') supp = !!supp.supp;
  const b = bulletSlot(), gen = ++b.gen, tr = b.tr;
  b.active = true; b.born = FX.time; b.trav = 0; b.vac = 0; b.supp = !!supp; b.last.copy(o);
  if (v && v.lengthSq() > 0) b.dir.copy(v).normalize(); else b.dir.set(0, 0, -1);
  b.mesh.visible = false; b.head.visible = false;
  // suppressed rounds are subsonic-ish and cooler: a fainter, shorter-lived trace
  tr.n = 0; tr.lastT = -1; tr.mesh.visible = false; tr.geo.setDrawRange(0, 0);
  const tu = tr.mat.uniforms; tu.uLife.value = b.supp ? 0.7 : 1.3; tu.uA.value = b.supp ? 0.16 : 0.4;
  const cam = fxCamera(); b.own = !!(cam && cam.position.distanceTo(o) < 1.2); tu.uOwn.value = b.own ? 1 : 0;   // fired from our eye: our round
  return {
    update(pos) { if (b.gen === gen) bulletUpdate(b, pos); },
    end() { if (b.gen !== gen) return; b.gen++; b.active = false; b.mesh.visible = false; b.head.visible = false; tr.until = FX.time + tu.uLife.value; },
  };
}
// Tracer from o to e (compat): the same streak, flown by us at opts.speed (default 700 m/s)
function fxTracer(o, e, opts = {}) {
  if (!FX.scene) return;
  const dist = o.distanceTo(e); if (dist < 0.5) return;
  const h = fxBullet(o, _v1.subVectors(e, o), !!opts.supp);
  FX.tracers.push({ h, o: o.clone(), e: e.clone(), dist, t: 0, speed: opts.speed || 700, p: new V3() });
}

// ---------- Scope glint ----------
// fxGlint(p, strength 0..1): call every frame for each enemy whose scope faces you; sprites are pooled per frame
// (works whether called before or after fxTick). Sized against distance so it reads at 200 m+.
function fxGlint(p, strength = 1) {
  if (!FX.glints || FX.glintN >= FX.glints.length || strength <= 0.01) return;
  const s = FX.glints[FX.glintN++], cam = fxCamera();
  let dc = 20, pr = 1.3;
  if (cam) { _v1.subVectors(cam.position, p); dc = _v1.length(); pr = cam.projectionMatrix.elements[5]; s.position.copy(p).addScaledVector(_v1.divideScalar(Math.max(dc, 1e-3)), Math.min(0.15, dc * 0.5)); } else s.position.copy(p);
  // twinkles (a lens catching the light as it sways) so the eye picks it out of a dark window
  const st = clamp(strength, 0, 1), tw = 0.75 + 0.25 * Math.sin(FX.time * 9 + p.x) * Math.sin(FX.time * 5.3 + p.z), size = Math.max(0.3, dc * 0.075 * (0.35 + 0.65 * st) * tw / Math.pow(pr, 0.6));
  s.scale.set(size * 1.6, size, 1); s.material.rotation = rand(-0.03, 0.03);
  s.material.opacity = st * (0.7 + 0.3 * tw); s.visible = true; s.userData.f = FX.frame;
}

// Ejected brass in the viewmodel scene (falls out of view). big: rifle case
function fxBrass(scene, p, right, up, big) {
  const m = new THREE.Mesh(big ? FX.rifleGeo : FX.brassGeo, (typeof GM !== 'undefined' && GM.brass) || FX.brassMat); m.position.copy(p); scene.add(m);
  m.rotation.set(Math.random() * 3, Math.random() * 3, 0);
  const v = right.clone().multiplyScalar(rand(1.2, 2) * (big ? 0.8 : 1)).addScaledVector(up, rand(0.8, 1.6));
  FX.list.push({ obj: m, t: 0, life: big ? 0.9 : 0.6, vel: v, grav: 6, spin: new V3(rand(-20, 20), rand(-20, 20), rand(-20, 20)) });
}

// ---------- Tick ----------
function fxTick(dt) {
  if (!FX.ps) return;
  FX.time += dt; FX.frame = (FX.frame || 0) + 1;
  if (FX.flashT > 0) { FX.flashT -= dt; if (FX.flashT <= 0) FX.flashLight.intensity = 0; }
  for (let i = FX.list.length - 1; i >= 0; i--) {
    const f = FX.list[i]; f.t += dt; const k = f.t / f.life;
    if (k >= 1) { f.obj.parent && f.obj.parent.remove(f.obj); if (f.obj.isSprite) f.obj.material.dispose(); FX.list.splice(i, 1); continue; }
    if (f.vel) { if (f.grav) f.vel.y -= f.grav * dt; f.obj.position.addScaledVector(f.vel, dt); f.vel.multiplyScalar(1 - dt * 2); }
    if (f.spin) { f.obj.rotation.x += f.spin.x * dt; f.obj.rotation.y += f.spin.y * dt; }
  }
  for (let i = FX.tracers.length - 1; i >= 0; i--) {
    const r = FX.tracers[i]; r.t += dt; const d = r.t * r.speed;
    if (d >= r.dist) { r.h.end(); FX.tracers.splice(i, 1); continue; }
    r.h.update(r.p.copy(r.o).lerp(r.e, d / r.dist));
  }
  // point sprite scale: pixels per metre at 1 m (tracks scope zoom through the projection)
  const cam = fxCamera(), cv = typeof RENDERER !== 'undefined' && RENDERER ? RENDERER.domElement : null;
  const H = cv ? cv.height : innerHeight * (devicePixelRatio || 1), scale = H / 2 * (cam ? cam.projectionMatrix.elements[5] : 1.3);
  psUpdate(FX.ps, dt, scale); psUpdate(FX.pa, dt, scale);
  for (const b of FX.bullets) {   // vapour traces keep aging after the round has landed
    const tr = b.tr; if (!tr.mesh.visible) continue;
    if (!b.active && FX.time > tr.until) { tr.mesh.visible = false; tr.n = 0; continue; }
    const tu = tr.mat.uniforms; tu.uTime.value = FX.time; tu.uPx.value = 2 / H;
  }
  pendingTick();
  FX.decAge = (FX.decAge || 0) - dt; if (FX.decAge <= 0) { FX.decAge = 0.5; decalAge(); }
  for (const m of FX.pools) {
    if (!m.visible) continue; const u = m.userData; u.t += dt;
    const k = Math.min(1, u.t / u.dur); m.scale.setScalar(Math.max(0.05, u.size * (1 - Math.pow(1 - k, 3))));
  }
  // glints not refreshed since the last frame go dark
  for (let i = 0; i < FX.glints.length; i++) { const s = FX.glints[i]; if (s.visible && s.userData.f < FX.frame - 1) s.visible = false; }
  FX.glintN = 0;
  for (const u of FX.bursts) {
    if (u.t >= u.life) continue; u.t += dt; const k = Math.min(1, u.t / u.life);
    if (k >= 1) { u.m.visible = u.gl.visible = false; continue; }
    const g = 1 - (1 - k) * (1 - k), a = (1 - k) * (1 - k);
    u.m.scale.setScalar(u.s * (0.55 + 0.8 * g)); u.m.material.opacity = Math.min(1, a * 1.3); u.gl.scale.setScalar(u.s * (0.7 + 0.5 * g)); u.gl.material.opacity = a;
  }
  screenTick(dt);
}
