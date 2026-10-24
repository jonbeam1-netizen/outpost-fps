'use strict';
// ---------- Wildlife & atmosphere: crows and pigeons that flush when someone moves carelessly, smoke columns, dust, ash, flies ----------
// The birds are a sneaky mechanic: a flock bursting off a roof tells everyone in earshot that somebody just walked past it.
// Perches come from the map geometry (roof ridges, parapets, power lines, the factory chimney, the water tower, the gas
// station canopy) and flocks are placed with a seeded rng, so every client has the same birds in the same spots.
// Nothing goes over the network: every client sees the same bodies and the same shots and simulates the same reactions,
// and where a flock resettles comes from a hash of (flock, times flushed), so the clients stay in step.
// Draw calls: 1 instanced mesh for every bird, 1 instanced billboard set for the smoke, 1 point cloud for dust/ash/flies.
// Flapping, smoke and dust animate in the vertex shaders; the CPU only writes bird matrices. Nothing in the tick allocates.
// The renderer uses a logarithmic depth buffer, so every shader here carries the logdepthbuf chunks.
const WL = { time: 0, dt: 0, perches: [], flocks: [], nb: 0, mesh: null, smoke: null, motes: null, rs: new Map(), log: [], logI: 0,
  dist: { on: false, next: 25, t0: 0, x: 0, y: 0, z: 0, dx: 0, dz: 0, b0: 0 } };
const WL_MAXB = 232, WL_SLOTS = 8, WL_DISTN = 16;
const WL_FLUSH_R = 12, WL_FLUSH_SPD = 3.3, WL_SHOT_R = 40, WL_SUPP_R = 9;   // a crouch-walk is 2.1 m/s, a walk 4.1
const _wo = new V3(), _wv = new V3();
// deterministic 0..1 from two ints: the same flock flushed the same number of times goes to the same place on every client
function wlHash(a, b) { let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b + 0x632be5ab) | 0, 0xc2b2ae35); h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15; return (h >>> 0) / 4294967296; }
const wlSmooth = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
// height of the first solid surface under (x,z) from y downwards, or -1e9
function wlDown(x, y, z, len) { _wo.set(x, y, z); const h = rayWorld(_wo, DOWN, len); return h ? y - h.t : -1e9; }

// ---------- Perches ----------
// a perch is 8 bird slots (x, y, z, yaw) along a line or ring, plus its centre
function wlPerch(kind, slots) {
  let x = 0, y = 0, z = 0; for (let k = 0; k < WL_SLOTS; k++) { x += slots[k * 4]; y += slots[k * 4 + 1]; z += slots[k * 4 + 2]; }
  WL.perches.push({ kind, slots, x: x / WL_SLOTS, y: y / WL_SLOTS, z: z / WL_SLOTS, busy: -1 });
}
// birds in a loose row along a sampled run: pts = [[x,y,z], ...] spaced `step` apart, run of at least 8 slots
function wlRowPerch(kind, pts, step, rng, lineYaw) {
  const L = (pts.length - 1) * step, sp = 0.38 + rng() * 0.12, need = sp * (WL_SLOTS - 1) + 0.3; if (L < need) return false;
  const c = need / 2 + rng() * (L - need), slots = new Float32Array(WL_SLOTS * 4), face = lineYaw + Math.PI / 2;
  for (let k = 0; k < WL_SLOTS; k++) {
    const s = clamp(c + (k - (WL_SLOTS - 1) / 2) * sp + (rng() - 0.5) * 0.1, 0, L) / step, i = Math.min(pts.length - 2, Math.floor(s)), f = s - i, a = pts[i], b = pts[i + 1];
    slots[k * 4] = lerp(a[0], b[0], f); slots[k * 4 + 1] = lerp(a[1], b[1], f); slots[k * 4 + 2] = lerp(a[2], b[2], f);
    slots[k * 4 + 3] = (rng() < 0.6 ? lineYaw : face) + (rng() < 0.5 ? Math.PI : 0) + (rng() - 0.5) * 0.8;   // mostly side-on along the row, some facing out
  }
  wlPerch(kind, slots); return true;
}
function wlBuildPerches(rng) {
  const step = 0.4;
  // roofs: try the two centre lines (a gable ridge) and the four parapet edges, keep the longest unbroken run at the top
  for (const b of MAP.buildings) {
    const { x0, z0, x1, z1, top } = b; if (top - b.g < 3.5) continue;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, I = 0.16;
    const lines = [[x0 + 0.4, cz, x1 - 0.4, cz, 1], [cx, z0 + 0.4, cx, z1 - 0.4, 1], [x0 + 0.3, z0 + I, x1 - 0.3, z0 + I, 0], [x0 + 0.3, z1 - I, x1 - 0.3, z1 - I, 0], [x0 + I, z0 + 0.3, x0 + I, z1 - 0.3, 0], [x1 - I, z0 + 0.3, x1 - I, z1 - 0.3, 0]];
    for (const [ax, az, bx, bz, ridge] of lines) {
      const L = Math.hypot(bx - ax, bz - az), n = Math.floor(L / step); if (n < 9) continue;
      // a ridge only counts if the roof falls away on both sides of it (otherwise it is the middle of a flat roof)
      let gable = false;
      if (ridge) { const px = (bz - az) / L * 2, pz = -(bx - ax) / L * 2; gable = wlDown(cx + px, top + 1.5, cz + pz, 4) < top - 0.6 && wlDown(cx - px, top + 1.5, cz - pz, 4) < top - 0.6; if (!gable) continue; }
      let run = [], best = [];
      for (let i = 0; i <= n; i++) {
        const x = lerp(ax, bx, i / n), z = lerp(az, bz, i / n), hy = wlDown(x, top + 1.5, z, 4);
        const ok = ridge ? hy > top - 0.5 && hy < top + 0.4 : Math.abs(hy - top) < 0.3;
        if (ok) { run.push([x, ridge ? top + 0.14 : hy, z]); if (run.length > best.length) best = run; } else run = [];   // gable: sit on the ridge beam (no collider of its own)
      }
      if (best.length >= 10) wlRowPerch(ridge ? 'ridge' : 'parapet', best, L / n, rng, Math.atan2(bx - ax, bz - az));
    }
  }
  // power lines: one perch on some of the spans that hang high over the streets (the fence wire is too low to count)
  const W = typeof WIRES !== 'undefined' ? WIRES : [], ns = W.length / 6;
  for (let i = 0; i < ns;) {
    let j = i; while (j + 1 < ns && Math.abs(W[j * 6 + 3] - W[(j + 1) * 6]) < 1e-4 && Math.abs(W[j * 6 + 5] - W[(j + 1) * 6 + 2]) < 1e-4 && j - i < 11) j++;
    const cnt = j - i + 1, mx = W[i * 6], mz = W[i * 6 + 2];
    if (cnt >= 8 && W[i * 6 + 1] - groundY(mx, mz) > 5 && rng() < 0.45) {
      const pts = []; let len = 0;
      for (let k = i; k <= j; k++) { if (k === i) pts.push([W[k * 6], W[k * 6 + 1], W[k * 6 + 2]]); pts.push([W[k * 6 + 3], W[k * 6 + 4], W[k * 6 + 5]]); len += Math.hypot(W[k * 6 + 3] - W[k * 6], W[k * 6 + 5] - W[k * 6 + 2]); }
      const a = pts[0], b = pts[pts.length - 1];   // the segments of a span are all the same length
      wlRowPerch('wire', pts, len / (pts.length - 1), rng, Math.atan2(b[0] - a[0], b[2] - a[2]));
    }
    i = j + 1;
  }
  // landmarks, each checked against what is actually there so a map change can't leave birds sitting on air
  const chk = (x, y, z) => Math.abs(wlDown(x, y + 0.6, z, 1.4) - y) < 0.35;
  { const x = 97, z = 131, y = groundY(x, z) + 30.1;   // factory chimney rim
    if (chk(x, y, z)) { const s = new Float32Array(WL_SLOTS * 4); for (let k = 0; k < WL_SLOTS; k++) { const a = (k + rng() * 0.5) / WL_SLOTS * TAU; s[k * 4] = x + Math.sin(a) * 1.0; s[k * 4 + 1] = y; s[k * 4 + 2] = z + Math.cos(a) * 1.0; s[k * 4 + 3] = a + (rng() < 0.5 ? 0 : Math.PI); } wlPerch('chimney', s); } }
  if (MAP.towerDeck) { const T = MAP.towerDeck, e = 3.6, y = T.y + 1.03, pts = []; for (let i = 0; i <= 18; i++) pts.push([T.x - e + i * 0.4, y, T.z - e]); wlRowPerch('tower', pts, 0.4, rng, Math.PI / 2); }   // water tower deck rail
  { const gy = groundY(68, 14), y = gy + 4.8; if (chk(68, y, 9.3)) { const pts = []; for (let i = 0; i <= 30; i++) pts.push([62.4 + i * 0.4, y, 9.3]); wlRowPerch('canopy', pts, 0.4, rng, Math.PI / 2); } }
}

// ---------- Bird mesh: one instanced, flat-shaded silhouette; wings flap and fold in the vertex shader ----------
function wlBirdGeo() {
  const P = [], S = [];
  const tri = (a, b, c, wing) => { for (const v of [a, b, c]) { P.push(v[0], v[1], v[2]); S.push(wing ? v[0] : 0); } };
  // body: a loft of 6-sided rings from beak to tail base (z, centre y, half-height), plus a tail fan; feet at the origin, facing +z
  const st = [[0.3, 0.214, 0], [0.235, 0.218, 0.014], [0.205, 0.226, 0.036], [0.16, 0.218, 0.04], [0.09, 0.19, 0.062], [0.01, 0.175, 0.06], [-0.07, 0.172, 0.042], [-0.12, 0.172, 0.022]];
  const ring = j => { const [z, cy, r] = st[j], out = []; for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; out.push([Math.cos(a) * r * 0.82, cy + Math.sin(a) * r, z]); } return out; };
  for (let j = 0; j < st.length - 1; j++) { const A = ring(j), C = ring(j + 1); for (let k = 0; k < 6; k++) { const k1 = (k + 1) % 6; tri(A[k], C[k], C[k1]); if (st[j][2] > 0) tri(A[k], C[k1], A[k1]); } }
  const E = ring(st.length - 1); for (let k = 1; k < 5; k++) tri(E[0], E[k], E[k + 1]);
  tri([0, 0.178, -0.1], [-0.045, 0.165, -0.28], [0.045, 0.165, -0.28]); tri([0, 0.178, -0.1], [-0.045, 0.165, -0.28], [0, 0.168, -0.3]); tri([0, 0.178, -0.1], [0, 0.168, -0.3], [0.045, 0.165, -0.28]);
  for (const sg of [-1, 1]) tri([sg * 0.018, 0, 0.01], [sg * 0.018, 0.13, 0.0], [sg * 0.018, 0.13, 0.04]);   // legs down to the perch
  for (const sg of [-1, 1]) {
    const v = (x, z) => [sg * x, 0.178, z], S1 = v(0.04, 0.07), S2 = v(0.04, -0.05), E1 = v(0.22, 0.065), E2 = v(0.22, -0.09), W1 = v(0.38, 0.02), W2 = v(0.34, -0.12), Wt = v(0.47, -0.06);
    tri(S1, E1, S2, 1); tri(S2, E1, E2, 1); tri(E1, W1, E2, 1); tri(E2, W1, W2, 1); tri(W1, Wt, W2, 1);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('span', new THREE.Float32BufferAttribute(S, 1));
  return g;
}
const WL_BIRD_VS = `#include <common>
attribute float span; attribute vec4 aW; attribute float aTint; uniform float uT; varying float vTint;
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
void main(){
  vec3 p = position; float r = abs(span); vTint = aTint;
  if (r > 0.001) {   // aW: flap phase, rate (rad/s), amplitude, fold (1 = wings tucked along the body)
    float sg = sign(span), ph = uT * aW.y + aW.x, a = aW.z * sin(ph) + 0.14 * (1.0 - aW.w), a2 = a * 1.3 + 0.25 * aW.z * sin(ph - 0.9);
    float ri = clamp(r, 0.04, 0.22) - 0.04, ro = max(r - 0.22, 0.0);
    vec3 open = vec3(sg * (0.04 + ri * cos(a) + ro * cos(a2)), p.y + ri * sin(a) + ro * sin(a2), p.z);
    vec3 fold = vec3(sg * (0.056 - r * 0.02), 0.205 - r * 0.07, p.z * 0.5 - r * 0.5 + 0.04);   // tucked along the back, tips over the tail
    p = mix(open, fold, aW.w);
  }
  vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <logdepthbuf_vertex>
  #include <fog_vertex>
}`;
const WL_BIRD_FS = `uniform vec3 uCol, uCol2; varying float vTint;
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
void main(){
  #include <logdepthbuf_fragment>
  gl_FragColor = vec4(mix(uCol, uCol2, vTint), 1.0);
  #ifdef USE_FOG
    gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, smoothstep(fogNear, fogFar, fogDepth) * 0.72);   // stay dark against the sky
  #endif
  #include <encodings_fragment>
}`;
const wlLin = hex => new THREE.Color(hex).convertSRGBToLinear();

// ---------- Smoke columns: instanced camera-facing quads, every puff's life worked out in the shader ----------
const WL_SMOKE_VS = `#include <common>
attribute vec3 aO; attribute vec4 aS; uniform float uT; uniform vec3 uWind; varying vec2 vUv; varying float vA; varying vec3 vCol;
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
void main(){
  float life = aS.y, age = fract(uT / life + aS.x), t = age * life, size; vec3 c = aO;
  if (aS.w < 0.5) {   // smoke: rises, slows, spreads, leans downwind
    c.y += 2.5 * t - 0.013 * t * t;
    c.xz += uWind.xz * pow(t, 1.35) * 0.3;
    float wob = 1.0 + t * 0.12; c.x += sin(t * 0.21 + aS.x * 40.0) * wob; c.z += cos(t * 0.17 + aS.x * 23.0) * wob;
    size = aS.z * (4.0 + t * 0.95);
    vA = smoothstep(0.0, 0.04, age) * pow(1.0 - age, 1.3) * 0.85;
    vCol = mix(vec3(0.008, 0.007, 0.006), vec3(0.05, 0.042, 0.036), smoothstep(0.0, 0.5, age)) * (0.75 + 0.5 * fract(aS.x * 91.7));
  } else {             // fire glow licking the base
    c.y += t * 1.6; c.x += sin(t * 3.0 + aS.x * 50.0) * 0.6;
    size = aS.z * (1.0 - age * 0.6); vA = sin(age * 3.14159) * 0.9; vCol = mix(vec3(1.6, 0.5, 0.12), vec3(0.5, 0.08, 0.02), age);
  }
  vec4 mvPosition = modelViewMatrix * vec4(c, 1.0);
  float ro = aS.x * 6.2832 + t * 0.06 * (fract(aS.x * 7.3) - 0.5), cr = cos(ro), sr = sin(ro);
  mvPosition.xy += vec2(cr * position.x - sr * position.y, sr * position.x + cr * position.y) * size;
  vUv = position.xy + 0.5;
  gl_Position = projectionMatrix * mvPosition;
  #include <logdepthbuf_vertex>
  #include <fog_vertex>
}`;
const WL_SMOKE_FS = `uniform sampler2D map; varying vec2 vUv; varying float vA; varying vec3 vCol;
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
void main(){
  #include <logdepthbuf_fragment>
  float a = texture2D(map, vUv).a * vA; if (a < 0.004) discard;
  gl_FragColor = vec4(vCol, a);
  #ifdef USE_FOG
    gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, smoothstep(fogNear, fogFar, fogDepth) * 0.3);   // far off, but it has to read against the sky
  #endif
  #include <encodings_fragment>
}`;
function wlPuffTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  for (let k = 0; k < 12; k++) { const x = 32 + rand(-11, 11), y = 32 + rand(-11, 11), r = rand(9, 20), gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(255,255,255,${rand(0.3, 0.55)})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }
  return new THREE.CanvasTexture(c);
}

// ---------- Dust motes, ash flakes and flies: one point cloud ----------
// dust and ash live in a 20 m box that wraps around the camera; flies buzz over the blood pools fx.js leaves
const WL_MOTE_B = 20, WL_POOLS = 12, WL_FLIES = 6;
const WL_MOTE_VS = `#include <common>
attribute vec4 aM; uniform float uT, uScale, uFade, uB; uniform vec3 uCam; uniform vec4 uPools[${WL_POOLS}]; varying float vA; varying vec3 vCol;
#include <logdepthbuf_pars_vertex>
void main(){
  vec3 p; float t = uT, ph = aM.x * 6.2832, sz = aM.z; vA = 0.0;
  if (aM.y < 1.5) {
    vec3 d = aM.y < 0.5 ? vec3(0.05, 0.02, 0.035) * t + 0.18 * vec3(sin(t * 0.31 + ph), sin(t * 0.23 + ph * 2.0), cos(t * 0.27 + ph))
                        : vec3(0.22, -0.32, 0.1) * t + 0.35 * vec3(sin(t * 1.1 + ph), 0.3 * sin(t * 2.3 + ph), cos(t * 0.9 + ph));
    p = mod(position + d - uCam + uB * 0.5, uB) - uB * 0.5 + uCam;
    float dc = distance(p, uCam);
    vA = smoothstep(9.5, 3.5, dc) * smoothstep(0.25, 0.8, dc) * uFade;
    if (aM.y < 0.5) { vA *= 0.45 * (0.5 + 0.5 * sin(t * 1.3 + ph * 9.0)); vCol = vec3(1.0, 0.78, 0.52); }   // dust glinting in the low sun
    else { vA *= 0.6; vCol = vec3(0.16, 0.15, 0.14); }                                                      // ash
  } else {   // a fly: erratic loops a hand's breadth over the pool
    vec4 pl = uPools[int(aM.w)];
    p = pl.xyz + vec3(sin(t * 7.1 + ph) * 0.35 + sin(t * 17.0 + ph * 3.0) * 0.08, 0.12 + 0.22 * abs(sin(t * 3.3 + ph * 2.0)), cos(t * 6.3 + ph * 1.7) * 0.35 + cos(t * 15.0 + ph) * 0.08);
    vA = pl.w * 0.9; vCol = vec3(0.004);
  }
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  float px = sz * uScale / max(0.05, -mvPosition.z);
  vA *= clamp(px, 0.0, 1.0); gl_PointSize = clamp(px, 1.0, 24.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <logdepthbuf_vertex>
}`;
const WL_MOTE_FS = `varying float vA; varying vec3 vCol;
#include <logdepthbuf_pars_fragment>
void main(){
  #include <logdepthbuf_fragment>
  float a = smoothstep(0.5, 0.15, length(gl_PointCoord - 0.5)) * vA; if (a < 0.004) discard;
  gl_FragColor = vec4(vCol, a);
  #include <encodings_fragment>
}`;

// ---------- Build ----------
function wildlifeInit(scene) {
  const rng = makeRng(5150);
  WL.perches.length = 0; WL.flocks.length = 0;
  wlBuildPerches(rng);
  // ~25 flocks spread round the town, no two on top of each other
  const P = WL.perches, order = P.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = order[i]; order[i] = order[j]; order[j] = t; }
  let nb = 0;
  for (const pi of order) {
    if (WL.flocks.length >= 25) break;
    const p = P[pi]; if (WL.flocks.some(F => { const q = P[F.at]; return Math.hypot(q.x - p.x, q.z - p.z) < 16; })) continue;
    const n = 3 + Math.floor(rng() * 6), crow = p.kind === 'chimney' || p.kind === 'tower' || rng() < 0.6;
    if (nb + n > WL_MAXB - WL_DISTN) break;
    WL.flocks.push({ at: pi, from: pi, to: pi, n, b0: nb, sp: crow ? 0 : 1, st: 0, t0: 0, dur: 40, R: 15, om: 0.7, H: 15, flushes: 0, pend: 0, calm: 0, cawed: false,
      cx: p.x, cy: p.y, cz: p.z });
    p.busy = WL.flocks.length - 1; nb += n;
  }
  WL.nb = nb; WL.dist.b0 = nb;
  // per-bird state (flat arrays: nothing allocated per frame)
  const N = nb + WL_DISTN;
  WL.B = { px: new Float32Array(N), py: new Float32Array(N), pz: new Float32Array(N), qx: new Float32Array(N), qy: new Float32Array(N), qz: new Float32Array(N),
    hd: new Float32Array(N), pit: new Float32Array(N), bank: new Float32Array(N), sc: new Float32Array(N), seed: new Float32Array(N), del: new Float32Array(N), fl: new Int16Array(N), k: new Uint8Array(N) };
  const B = WL.B, aW = new Float32Array(N * 4), aT = new Float32Array(N);
  WL.flocks.forEach((F, fi) => { for (let k = 0; k < F.n; k++) { const i = F.b0 + k, s = P[F.at].slots; B.fl[i] = fi; B.k[i] = k; B.seed[i] = rng(); B.sc[i] = (F.sp ? 0.74 : 1.0) * (0.9 + rng() * 0.2);
    B.px[i] = B.qx[i] = s[k * 4]; B.py[i] = B.qy[i] = s[k * 4 + 1]; B.pz[i] = B.qz[i] = s[k * 4 + 2]; B.hd[i] = s[k * 4 + 3]; aT[i] = F.sp ? 0.7 + rng() * 0.3 : rng() * 0.15; aW[i * 4 + 3] = 1; } });
  for (let i = nb; i < N; i++) { B.fl[i] = -1; B.k[i] = i - nb; B.seed[i] = rng(); B.sc[i] = 1.05; aT[i] = 0.05; }
  const geo = wlBirdGeo();
  WL.aW = new THREE.InstancedBufferAttribute(aW, 4); WL.aW.setUsage(THREE.DynamicDrawUsage); geo.setAttribute('aW', WL.aW);
  geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(aT, 1));
  const bu = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uT: { value: 0 }, uCol: { value: wlLin(0x0f0d0c) }, uCol2: { value: wlLin(0x3a393d) } }]);
  const bm = new THREE.ShaderMaterial({ uniforms: bu, vertexShader: WL_BIRD_VS, fragmentShader: WL_BIRD_FS, side: THREE.DoubleSide, fog: true });
  WL.mesh = new THREE.InstancedMesh(geo, bm, N); WL.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); WL.mesh.frustumCulled = false; WL.mesh.count = nb;
  scene.add(WL.mesh);
  for (let i = 0; i < N; i++) wlWrite(i, 0);
  // smoke: 3 columns from burning farms just past the fence, with the wind they lean in (the same for everyone)
  const cols = 3, perCol = 90, fire = 10, M = cols * (perCol + fire), aO = new Float32Array(M * 3), aS = new Float32Array(M * 4), a0 = rng() * TAU;
  WL.wind = new V3(0.85, 0, 0.45).normalize();
  for (let c = 0, m = 0; c < cols; c++) {
    const a = a0 + c * TAU / cols + (rng() - 0.5) * 0.8, r = 168 + rng() * 22, x = Math.cos(a) * r, z = Math.sin(a) * r, y = groundY(x, z) - 1, life = 46 + rng() * 10;
    for (let j = 0; j < perCol + fire; j++, m++) {
      const f = j >= perCol; aO[m * 3] = x + (rng() - 0.5) * (f ? 5 : 3); aO[m * 3 + 1] = y; aO[m * 3 + 2] = z + (rng() - 0.5) * (f ? 5 : 3);
      aS[m * 4] = f ? rng() : (j + rng() * 0.6) / perCol; aS[m * 4 + 1] = f ? 2.2 + rng() * 1.6 : life; aS[m * 4 + 2] = f ? 2.5 + rng() * 2 : 0.8 + rng() * 0.5; aS[m * 4 + 3] = f ? 1 : 0;
    }
  }
  const sg = new THREE.InstancedBufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3)); sg.setIndex([0, 1, 2, 0, 2, 3]);
  sg.setAttribute('aO', new THREE.InstancedBufferAttribute(aO, 3)); sg.setAttribute('aS', new THREE.InstancedBufferAttribute(aS, 4)); sg.instanceCount = M;
  const su = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uT: { value: 0 }, uWind: { value: WL.wind } }]); su.map = { value: wlPuffTex() };
  WL.smoke = new THREE.Mesh(sg, new THREE.ShaderMaterial({ uniforms: su, vertexShader: WL_SMOKE_VS, fragmentShader: WL_SMOKE_FS, transparent: true, depthWrite: false, fog: true }));
  WL.smoke.frustumCulled = false; WL.smoke.renderOrder = 1; scene.add(WL.smoke);
  // dust, ash, flies
  const nd = 170, na = 70, nf = WL_POOLS * WL_FLIES, Q = nd + na + nf, mp = new Float32Array(Q * 3), mm = new Float32Array(Q * 4);
  for (let i = 0; i < Q; i++) {
    const kind = i < nd ? 0 : i < nd + na ? 1 : 2; mp[i * 3] = rng() * WL_MOTE_B; mp[i * 3 + 1] = rng() * WL_MOTE_B; mp[i * 3 + 2] = rng() * WL_MOTE_B;
    mm[i * 4] = rng(); mm[i * 4 + 1] = kind; mm[i * 4 + 2] = kind === 0 ? 0.01 + rng() * 0.012 : kind === 1 ? 0.022 + rng() * 0.024 : 0.01; mm[i * 4 + 3] = kind === 2 ? Math.floor((i - nd - na) / WL_FLIES) : 0;
  }
  const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.BufferAttribute(mp, 3)); mg.setAttribute('aM', new THREE.BufferAttribute(mm, 4));
  WL.pools = []; for (let i = 0; i < WL_POOLS; i++) WL.pools.push(new THREE.Vector4(0, -999, 0, 0));
  WL.camV = new V3();
  WL.motes = new THREE.Points(mg, new THREE.ShaderMaterial({ uniforms: { uT: { value: 0 }, uScale: { value: 500 }, uFade: { value: 1 }, uB: { value: WL_MOTE_B }, uCam: { value: WL.camV }, uPools: { value: WL.pools } },
    vertexShader: WL_MOTE_VS, fragmentShader: WL_MOTE_FS, transparent: true, depthWrite: false }));
  WL.motes.frustumCulled = false; WL.motes.renderOrder = 2; scene.add(WL.motes);
  for (let i = 0; i < 8; i++) WL.log.push({ x: 0, y: 0, z: 0, t: -99 });
}

// ---------- Simulation ----------
// write bird i's instance matrix and wing attributes. flap: [phase via seed] rate, amp, fold
function wlWrite(i, mode, rate = 0, amp = 0, fold = 1) {
  const B = WL.B, e = WL.mesh.instanceMatrix.array, o = i * 16, s = B.sc[i], h = B.hd[i], p = B.pit[i], b = B.bank[i];
  const sh = Math.sin(h), ch = Math.cos(h), sp = Math.sin(p), cp = Math.cos(p), sb = Math.sin(b), cb = Math.cos(b);
  const zx = sh * cp, zy = sp, zz = ch * cp, xx = ch, xz = -sh, yx = -sp * sh, yy = cp, yz = -sp * ch;   // forward, right, up before the bank
  e[o] = (xx * cb + yx * sb) * s; e[o + 1] = (yy * sb) * s; e[o + 2] = (xz * cb + yz * sb) * s; e[o + 3] = 0;
  e[o + 4] = (yx * cb - xx * sb) * s; e[o + 5] = (yy * cb) * s; e[o + 6] = (yz * cb - xz * sb) * s; e[o + 7] = 0;
  e[o + 8] = zx * s; e[o + 9] = zy * s; e[o + 10] = zz * s; e[o + 11] = 0;
  e[o + 12] = B.px[i]; e[o + 13] = B.py[i]; e[o + 14] = B.pz[i]; e[o + 15] = 1;
  const w = WL.aW.array; w[i * 4] = B.seed[i] * 40; w[i * 4 + 1] = rate; w[i * 4 + 2] = amp; w[i * 4 + 3] = fold;
}
// heading, pitch and bank from how the bird actually moved this frame
function wlSteer(i, dt) {
  const B = WL.B, vx = B.px[i] - B.qx[i], vy = B.py[i] - B.qy[i], vz = B.pz[i] - B.qz[i], hz = Math.sqrt(vx * vx + vz * vz);
  if (hz > 1e-4 && dt > 1e-4) {
    const want = Math.atan2(vx, vz), k = 1 - Math.exp(-dt * 7), h0 = B.hd[i]; B.hd[i] = angLerp(h0, want, k);
    let dh = ((B.hd[i] - h0) % TAU + TAU * 1.5) % TAU - Math.PI;
    B.bank[i] = lerp(B.bank[i], clamp(dh / dt * 0.35, -0.9, 0.9), 1 - Math.exp(-dt * 4));
    B.pit[i] = lerp(B.pit[i], clamp(Math.atan2(vy, hz) * 0.7, -0.6, 0.6), 1 - Math.exp(-dt * 5));
  }
}
function wlLog(x, y, z) { const L = WL.log[WL.logI++ % WL.log.length]; L.x = x; L.y = y; L.z = z; L.t = WL.time; }
// the flock takes off, circles, and settles somewhere else 30-60 s later
function wlFlush(fi) {
  const F = WL.flocks[fi]; if (F.st || WL.time < F.calm) return;
  F.flushes++; F.pend = 0; F.st = 1; F.t0 = WL.time; F.cawed = false;
  const P = WL.perches, from = P[F.at], N = P.length, h = wlHash(fi, F.flushes);
  let to = F.at;
  for (let k = 0, s = Math.floor(h * N); k < N; k++) {
    const j = (s + k) % N, q = P[j]; if (j === F.at || q.busy >= 0) continue;
    const d = Math.hypot(q.x - from.x, q.z - from.z); if (d > 25 && d < 150) { to = j; break; }
  }
  from.busy = -1; P[to].busy = fi; F.from = F.at; F.to = to;
  F.dur = 30 + 30 * wlHash(fi + 101, F.flushes); F.R = 12 + 10 * wlHash(fi + 202, F.flushes);
  F.om = (wlHash(fi + 303, F.flushes) < 0.5 ? -1 : 1) * (F.sp ? 12 : 10.5) / F.R; F.H = 12 + 10 * wlHash(fi + 404, F.flushes);
  for (let k = 0; k < F.n; k++) WL.B.del[F.b0 + k] = 0.04 + 0.4 * wlHash(F.b0 + k, F.flushes);
  wlLog(from.x, from.y, from.z);
  wlFlushSound(from.x, from.y, from.z, F.sp, F.n);
  // alarm spreads: perched flocks nearby go up a moment later
  WL.flocks.forEach((G, gi) => { if (gi === fi || G.st || G.pend) return; const q = P[G.at]; if (Math.hypot(q.x - from.x, q.y - from.y, q.z - from.z) < 24) G.pend = WL.time + 0.4 + 0.9 * wlHash(gi, F.flushes + 7); });
}
// a gunshot at pos: loud ones flush flocks within 40 m (after the sound gets there), suppressed ones only very close
function wildlifeShot(pos, suppressed) {
  if (!pos) return; const r = suppressed ? WL_SUPP_R : WL_SHOT_R, P = WL.perches;
  for (let fi = 0; fi < WL.flocks.length; fi++) {
    const F = WL.flocks[fi]; if (F.st) continue; const q = P[F.at], dx = q.x - pos.x, dy = q.y - pos.y, dz = q.z - pos.z, d2 = dx * dx + dy * dy + dz * dz;
    if (d2 < r * r) { const t = WL.time + Math.sqrt(d2) / 343 + 0.08 + 0.15 * wlHash(fi, F.flushes + 3); if (!F.pend || t < F.pend) F.pend = t; }
  }
}
// bodies this frame (local player, remote players, bots), reused arrays
const WL_BX = new Float32Array(64), WL_BY = new Float32Array(64), WL_BZ = new Float32Array(64), WL_BS = new Float32Array(64);
let wlNB = 0;
function wlPush(x, y, z, s) { if (wlNB >= 64) return; WL_BX[wlNB] = x; WL_BY[wlNB] = y; WL_BZ[wlNB] = z; WL_BS[wlNB] = s; wlNB++; }
function wlBotCb(b) { if (b.alive && b.pos) wlPush(b.pos.x, b.pos.y, b.pos.z, b.vel ? Math.hypot(b.vel.x, b.vel.z) + (b.onGround === false ? 3 : 0) : 0); }
function wlRemCb(r, id) {
  if (typeof BOTS !== 'undefined' && BOTS.has(id)) return; if (!r.alive || !r.state || !r.state.pos) return;
  const p = r.state.pos; let m = WL.rs.get(id);
  if (!m) { m = { x: p.x, y: p.y, z: p.z, s: 0 }; WL.rs.set(id, m); }
  if (WL.dt > 1e-4) { const d = Math.hypot(p.x - m.x, p.z - m.z) / WL.dt; if (d < 15) m.s = lerp(m.s, d, 1 - Math.exp(-WL.dt * 5)); }   // speed from the interpolated position (respawn jumps ignored)
  m.x = p.x; m.y = p.y; m.z = p.z; wlPush(p.x, p.y, p.z, m.s);
}
function wildlifeTick(dt) {
  if (!WL.mesh) return;
  const T = WL.time += dt; WL.dt = dt;
  const P = WL.perches, B = WL.B, FL = WL.flocks;
  // who is moving near the birds
  wlNB = 0;
  if (typeof GAME !== 'undefined' && GAME.running && PL.alive) wlPush(PL.pos.x, PL.pos.y, PL.pos.z, Math.hypot(PL.vel.x, PL.vel.z) + (PL.onGround ? 0 : 3));
  if (typeof BOTS !== 'undefined') BOTS.forEach(wlBotCb);
  if (typeof REMOTES !== 'undefined') REMOTES.forEach(wlRemCb);
  // gunshots (every client spawns every round: its own, remote players' and bots'), and rounds cracking past a flock
  if (typeof PROJ !== 'undefined') for (let j = 0; j < PROJ.length; j++) {
    const pr = PROJ[j]; if (!pr._wl) { pr._wl = 1; wildlifeShot(pr.start || pr.pos, pr.supp); }
    const ex = pr.pos.x, ey = pr.pos.y, ez = pr.pos.z, vx = pr.vel.x * dt, vy = pr.vel.y * dt, vz = pr.vel.z * dt, vv = vx * vx + vy * vy + vz * vz;
    for (let fi = 0; fi < FL.length; fi++) {
      const F = FL[fi]; if (F.st) continue; const q = P[F.at];
      let wx = q.x - (ex - vx), wy = q.y - (ey - vy), wz = q.z - (ez - vz); const u = vv > 0 ? clamp((wx * vx + wy * vy + wz * vz) / vv, 0, 1) : 1;
      wx -= vx * u; wy -= vy * u; wz -= vz * u; if (wx * wx + wy * wy + wz * wz < 16) { wlFlush(fi); }
    }
  }
  // perched flocks: anyone faster than a crouch-walk within 12 m, or anyone at all right on top of them
  for (let fi = 0; fi < FL.length; fi++) {
    const F = FL[fi];
    if (!F.st) {
      if (F.pend && T >= F.pend) { F.pend = 0; wlFlush(fi); continue; }
      if (T < F.calm) continue;
      const q = P[F.at];
      for (let j = 0; j < wlNB; j++) {
        const dx = WL_BX[j] - q.x, dy = WL_BY[j] + 0.9 - q.y, dz = WL_BZ[j] - q.z, d2 = dx * dx + dy * dy + dz * dz;
        if ((d2 < WL_FLUSH_R * WL_FLUSH_R && WL_BS[j] > WL_FLUSH_SPD) || (d2 < 6.25 && WL_BS[j] > 0.4)) { wlFlush(fi); break; }
      }
    } else {
      // centre of the circling: drifts from the old perch to the new one, well clear of the ground
      const u = T - F.t0, a = P[F.from], b = P[F.to], m = wlSmooth((u - 0.1 * F.dur) / (0.7 * F.dur));
      F.cx = lerp(a.x, b.x, m); F.cz = lerp(a.z, b.z, m); F.cy = Math.max(lerp(a.y, b.y, m), groundY(F.cx, F.cz) + 6) + F.H;
      if (!F.sp && !F.cawed && u > 7) { F.cawed = true; wlCawsAt(F.cx, F.cy, F.cz, 2 + (F.flushes % 3)); }
    }
  }
  // birds
  let landed = 0;
  for (let i = 0; i < WL.nb; i++) {
    const F = FL[B.fl[i]], k = B.k[i]; B.qx[i] = B.px[i]; B.qy[i] = B.py[i]; B.qz[i] = B.pz[i];
    const u = F.st ? T - F.t0 - B.del[i] : -1;
    if (!F.st || u < 0) {   // perched: a slow look round, now and then a wing stretch
      const s = P[F.st ? F.from : F.at].slots, sd = B.seed[i];
      B.px[i] = s[k * 4]; B.py[i] = s[k * 4 + 1]; B.pz[i] = s[k * 4 + 2]; B.hd[i] = s[k * 4 + 3] + 0.35 * Math.sin(T * 0.23 + sd * 20); B.pit[i] = 0.18; B.bank[i] = 0;
      const st = ((T + sd * 97) % 11) < 0.5; wlWrite(i, 0, 22, st ? 0.6 : 0, st ? 0.2 : 1); continue;
    }
    const s0 = P[F.from].slots, s1 = P[F.to].slots, sd = B.seed[i];
    const ang = F.om * u + k * 0.4 + 0.3 * Math.sin(u * 0.7 + k), r = F.R + 3 * Math.sin(u * 0.5 + k * 1.7);
    let x = F.cx + Math.cos(ang) * r, y = F.cy + 2 * Math.sin(u * 0.9 + k * 2.1), z = F.cz + Math.sin(ang) * r;
    let rate = F.sp ? 30 : 22, amp = 0.15 + 0.55 * wlSmooth((Math.sin(u * 0.8 + sd * 9) + 0.2) * 1.6), fold = 0;
    if (u < 3.5) {   // burst: straight up off the perch, then swing out into the circle
      const ox = s0[k * 4], oy = s0[k * 4 + 1], oz = s0[k * 4 + 2], ux = Math.min(u, 2.2), bx = ox + (x - ox) * 0.12 * u, by = oy + ux * 3.8 - (ux * ux) * 0.35, bz = oz + (z - oz) * 0.12 * u, w = wlSmooth(u / 3.5);
      x = lerp(bx, x, w); y = lerp(by, y, w); z = lerp(bz, z, w); amp = 1.0; rate = F.sp ? 32 : 26;
    }
    const lu = (u - (F.dur - 7)) / 7;
    if (lu > 0) {    // glide in and drop onto the new perch, flaring at the end
      const tx = s1[k * 4], ty = s1[k * 4 + 1], tz = s1[k * 4 + 2], w = wlSmooth(lu);
      x = lerp(x, tx, w); y = lerp(y, ty + (1 - lu) * 2.5, w); z = lerp(z, tz, w);
      if (lu > 0.82) { amp = 1.0; rate = 24; }
      if (lu >= 1) { x = tx; y = ty; z = tz; B.hd[i] = s1[k * 4 + 3]; B.pit[i] = 0.18; B.bank[i] = 0; B.px[i] = x; B.py[i] = y; B.pz[i] = z; wlWrite(i, 0, 22, 0, 1); landed++; continue; }
    }
    B.px[i] = x; B.py[i] = y; B.pz[i] = z; wlSteer(i, dt); wlWrite(i, 1, rate, amp, fold);
  }
  // a flock is down once its last bird is (its birds are contiguous, so check each airborne flock's members)
  if (landed) for (let fi = 0; fi < FL.length; fi++) {
    const F = FL[fi]; if (!F.st || T - F.t0 < F.dur) continue;
    let all = true; for (let k = 0; k < F.n; k++) if (T - F.t0 - B.del[F.b0 + k] < F.dur) { all = false; break; }
    if (all) { F.st = 0; F.at = F.to; F.calm = T + 2.5; }
  }
  // now and then a big flock crosses the sky far overhead (just scenery: local timing)
  const D = WL.dist;
  if (!D.on && T > D.next) {
    const a = Math.random() * TAU, off = (Math.random() - 0.5) * 200; D.dx = Math.cos(a); D.dz = Math.sin(a);
    D.x = -D.dx * 420 - D.dz * off; D.z = -D.dz * 420 + D.dx * off; D.y = 70 + Math.random() * 40; D.t0 = T; D.on = true;
  }
  if (D.on) {
    const u = T - D.t0, sp = 12, ex = D.x + D.dx * sp * u, ez = D.z + D.dz * sp * u;
    if (u * sp > 840) { D.on = false; D.next = T + 45 + Math.random() * 65; WL.mesh.count = WL.nb; }
    else {
      WL.mesh.count = WL.nb + WL_DISTN;
      for (let k = 0; k < WL_DISTN; k++) {
        const i = D.b0 + k, sd = B.seed[i], row = Math.ceil(k / 2), side = k % 2 ? 1 : -1, back = row * 2.6 + sd * 1.5, lat = side * row * 2.1 + Math.sin(u * 0.4 + sd * 9) * 1.2;
        B.qx[i] = B.px[i]; B.qy[i] = B.py[i]; B.qz[i] = B.pz[i];
        B.px[i] = ex - D.dx * back - D.dz * lat; B.pz[i] = ez - D.dz * back + D.dx * lat; B.py[i] = D.y + Math.sin(u * 0.6 + sd * 7) * 1.5 + sd * 3;
        if (u < 0.05) { B.hd[i] = Math.atan2(D.dx, D.dz); B.qx[i] = B.px[i] - D.dx; B.qz[i] = B.pz[i] - D.dz; B.qy[i] = B.py[i]; }
        wlSteer(i, dt); wlWrite(i, 1, 20, 0.12 + 0.5 * wlSmooth(Math.sin(u * 0.9 + sd * 11) * 2), 0);
      }
    }
  }
  WL.mesh.instanceMatrix.needsUpdate = true; WL.aW.needsUpdate = true;
  WL.mesh.material.uniforms.uT.value = T % (TAU * 100);   // integer flap rates: the phase stays continuous across the wrap
  WL.smoke.material.uniforms.uT.value = T % 7200;
  // dust & flies
  const cam = typeof CAMERA !== 'undefined' && CAMERA, mu = WL.motes.material.uniforms;
  if (cam) {
    const e = cam.matrixWorld.elements; WL.camV.set(e[12], e[13], e[14]);
    const H = RENDERER && RENDERER.domElement ? RENDERER.domElement.height : innerHeight;
    mu.uScale.value = H / 2 * cam.projectionMatrix.elements[5];
    const zoom = typeof SETTINGS !== 'undefined' && cam.fov ? SETTINGS.fov / cam.fov : 1;   // a scope focused at range blurs the near motes away
    const dim = typeof occAt === 'function' ? 1 - Math.min(0.8, occAt(e[12], e[14], e[13]) * 1.6) : 1;
    mu.uFade.value = clamp(2.2 - zoom, 0, 1) * dim;
  }
  mu.uT.value = T % 3600;
  const pools = typeof FX !== 'undefined' && FX.pools;
  for (let j = 0; j < WL_POOLS; j++) {
    const m = pools && pools[j], v = WL.pools[j];
    if (m && m.visible && m.userData && m.userData.t > 3) v.set(m.position.x, m.position.y, m.position.z, Math.min(1, (m.userData.t - 3) / 4)); else v.w = 0;
  }
}

// ---------- Sound: wings clattering off a roof, crows complaining ----------
function wlCaw(ctx, tc, dest, f, g0) {
  const o = ctx.createOscillator(), o2 = ctx.createOscillator(); o.type = 'sawtooth'; o2.type = 'square';
  [o, o2].forEach((x, k) => { const m = k ? 0.5 : 1; x.frequency.setValueAtTime(f * 1.1 * m, tc); x.frequency.linearRampToValueAtTime(f * m, tc + 0.05); x.frequency.exponentialRampToValueAtTime(f * 0.8 * m, tc + 0.3); });
  const m2 = ctx.createGain(), bp = ctx.createBiquadFilter(); m2.gain.value = 0.4; bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 1.6;
  const g = ctx.createGain(), gp = g.gain; gp.setValueAtTime(0.0001, tc); gp.linearRampToValueAtTime(g0, tc + 0.03); gp.linearRampToValueAtTime(g0 * 0.7, tc + 0.2); gp.exponentialRampToValueAtTime(0.0001, tc + 0.33);
  o.connect(bp); o2.connect(m2); m2.connect(bp); bp.connect(g); g.connect(dest); o.start(tc); o2.start(tc); o.stop(tc + 0.35); o2.stop(tc + 0.35);
}
// output for a sound at (x,y,z): placed, dulled with distance; null when out of earshot or audio isn't running
function wlOut(x, y, z, gain, roll, maxD) {
  const ctx = SFX.ctx; if (!ctx || ctx.state !== 'running') return null;
  const s = SFX.spatial(_wv.set(x, y, z), roll); if (s.dist > maxD) return null;
  const far = Math.min(1, s.dist / 130), out = SFX.out(s.gain * gain, s, 0.15 + far * 0.35), lp = ctx.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = lerp(9000, 1300, far); lp.connect(out);
  return { ctx, lp, t: SFX.arrive(s) };
}
function wlFlushSound(x, y, z, pigeon, n) {
  const o = wlOut(x, y, z, 1.5, 26, 175); if (!o) return;
  const { ctx, lp, t } = o;
  // every bird thrashing at once, thinning out as they climb away
  for (let i = 0, beats = n * 7; i < beats; i++) {
    const tt = t + Math.pow(Math.random(), 1.7) * 2.2, g = (pigeon ? 0.17 : 0.12) * rand(0.4, 1) * Math.max(0.1, 1 - (tt - t) / 2.6);
    SFX.noise(tt, 0, lp, 'bandpass', rand(pigeon ? 700 : 420, pigeon ? 2000 : 1300), 1.3, g, rand(0.035, 0.075), 0.006);
    if (pigeon && Math.random() < 0.35) SFX.noise(tt + 0.012, 0, lp, 'highpass', 2600, 0.8, g * 0.7, 0.02);   // wing claps
  }
  SFX.noise(t, 0, lp, 'lowpass', 850, 0.7, 0.08, 1.5, 0.08);   // the rush of air
  if (!pigeon) for (let i = 0, nc = 3 + Math.floor(Math.random() * 4); i < nc; i++) wlCaw(ctx, t + 0.15 + i * rand(0.22, 0.5), lp, rand(470, 640), 0.09);
}
function wlCawsAt(x, y, z, nc) {
  const o = wlOut(x, y, z, 1.2, 26, 175); if (!o) return;
  for (let i = 0; i < nc; i++) wlCaw(o.ctx, o.t + i * rand(0.35, 0.55), o.lp, rand(470, 620), 0.07);
}
