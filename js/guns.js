'use strict';
// ---------- Weapons: stats + procedural models built part by part ----------
// Gun-local space: origin at the trigger, barrel points to -z, y up, metres.

// ---------- Weapon definitions ----------
// hip: viewmodel offset from the camera at hip; hipRot (optional): extra [rx, ry, rz] at hip, faded out when aiming
const WEAPONS = {
  awm: { name: 'AWM .338', cal: '.338 Lapua Magnum', desc: 'Accuracy International bolt-action in a folding green chassis. Two to the chest, or one to the head.',
    kind: 'bolt', mag: 5, reserve: 20, rpm: 40, cycle: 1.15, reload: 3.0, reloadEmpty: 3.6, vel: 720, dmg: { head: 300, chest: 85, legs: 60 },
    recoil: { v: 6.0, h: 1.2 }, move: 0.9, adsTime: 0.38, sway: 1.0, hip: [0.13, -0.17, -0.48], snd: { crack: 3200, body: 520, low: 48, tail: 0.9 },
    slots: { optic: ['pm2', 'mk4', 'atacr', 'lpvo'], muzzle: ['brake', 'supp', 'none'], under: ['bipod', 'none'] }, def: { optic: 'pm2', muzzle: 'brake', under: 'bipod' } },
  m82: { name: 'Barrett M82A1', cal: '.50 BMG', desc: 'Recoil-operated semi-auto anti-materiel rifle. Ten rounds of .50 BMG: the hardest-hitting body shot in town.',
    kind: 'semi', mag: 10, reserve: 20, rpm: 90, reload: 3.6, reloadEmpty: 4.3, vel: 680, dmg: { head: 300, chest: 95, legs: 70 },
    recoil: { v: 7.5, h: 1.6 }, move: 0.8, adsTime: 0.48, sway: 1.25, hip: [0.13, -0.19, -0.5], snd: { crack: 2600, body: 380, low: 36, tail: 1.2 },
    slots: { optic: ['atacr', 'pm2', 'mk4', 'lpvo'], muzzle: ['brake', 'supp'], under: ['bipod', 'none'] }, def: { optic: 'atacr', muzzle: 'brake', under: 'bipod' } },
  svd: { name: 'Dragunov SVD', cal: '7.62x54R', desc: 'Soviet designated marksman rifle with a skeleton stock and a PSO-1. Fast follow-ups.',
    kind: 'semi', mag: 10, reserve: 30, rpm: 150, reload: 2.6, reloadEmpty: 3.2, vel: 620, dmg: { head: 300, chest: 62, legs: 45 },
    recoil: { v: 3.2, h: 0.9 }, move: 0.95, adsTime: 0.32, sway: 0.9, hip: [0.13, -0.155, -0.47], snd: { crack: 3300, body: 640, low: 55, tail: 0.75 },
    slots: { optic: ['pso', 'lpvo', 'mk4'], muzzle: ['none', 'supp'], under: ['none'] }, def: { optic: 'pso', muzzle: 'none', under: 'none' } },
  m200: { name: 'CheyTac M200 Intervention', cal: '.408 CheyTac', desc: 'Long-range bolt gun with a retractable stock. The flattest-shooting round in the game.',
    kind: 'bolt', mag: 7, reserve: 21, rpm: 35, cycle: 1.3, reload: 3.4, reloadEmpty: 4.0, vel: 780, dmg: { head: 300, chest: 90, legs: 65 },
    recoil: { v: 7.0, h: 1.4 }, move: 0.85, adsTime: 0.42, sway: 1.1, hip: [0.13, -0.175, -0.48], snd: { crack: 3000, body: 450, low: 42, tail: 1.05 },
    slots: { optic: ['atacr', 'pm2', 'mk4', 'lpvo'], muzzle: ['brake', 'supp', 'none'], under: ['bipod', 'none'] }, def: { optic: 'atacr', muzzle: 'brake', under: 'bipod' } },
  deagle: { name: 'Desert Eagle .50 AE', cal: '.50 Action Express', desc: 'Gas-operated hand cannon. Sidearm.',
    kind: 'semi', mag: 7, reserve: 35, rpm: 240, reload: 1.8, reloadEmpty: 2.2, vel: 420, dmg: { head: 95, chest: 45, legs: 32 },
    recoil: { v: 4.5, h: 1.2 }, move: 1.05, adsTime: 0.18, sway: 0.6, hip: [0.1, -0.115, -0.36], snd: { crack: 2400, body: 900, low: 60, tail: 0.5 },
    slots: { optic: [], muzzle: ['none'], under: ['none'] }, def: { optic: null, muzzle: 'none', under: 'none' }, pistol: true },
  knife: { name: 'M9 Bayonet', cal: 'Damascus steel', desc: 'Clip-point bayonet with a sawback spine. Kills in one hit, armour or not.',
    kind: 'melee', mag: 0, reserve: 0, rpm: 75, reload: 0, reloadEmpty: 0, vel: 0, dmg: { head: 999, chest: 999, legs: 999 },
    recoil: { v: 0, h: 0 }, move: 1.1, adsTime: 0, sway: 0, hip: [0.16, -0.15, -0.34], hipRot: [0.6, 0.2, -0.6], snd: {},
    slots: { optic: [], muzzle: [], under: [] }, def: { optic: null, muzzle: null, under: null }, melee: true },
};
const PRIMARIES = ['awm', 'm82', 'svd', 'm200'];
const OPTICS = {
  lpvo: { name: 'Vortex Razor 1-6x', zoom: [1, 6], reticle: 'lpvo', scope: true },
  pso: { name: 'PSO-1 4x', zoom: [4, 4], reticle: 'pso', scope: true },
  mk4: { name: 'Leupold Mk4 4.5-14x', zoom: [4.5, 14], reticle: 'mildot', scope: true },
  pm2: { name: 'Schmidt & Bender PM II 5-25x', zoom: [5, 25], reticle: 'mildot', scope: true },
  atacr: { name: 'Nightforce ATACR 7-35x', zoom: [7, 35], reticle: 'tree', scope: true },
};
const MUZZLES = {
  brake: { name: 'Muzzle brake', supp: false, recoil: 0.75, vel: 1 },
  supp: { name: 'Suppressor', supp: true, recoil: 0.85, vel: 0.95 },
  none: { name: 'None', supp: false, recoil: 1, vel: 1 },
};
const UNDER = {
  none: { name: 'None', bipod: false },
  bipod: { name: 'Bipod', bipod: true },
};

// ---------- Reflections ----------
// r128 has no default environment, so metal reads flat. A small canvas cube map of an overcast sky over dark ground gives
// every gun material something to reflect. A plain CubeTexture (unlike a PMREM render target) works in every renderer,
// the game view and the menu turntable alike, and three's standard shader picks blurrier mips for rougher materials.
let GENV = null, KENV = null;   // KENV: studio cube for the polished knife
// Kept for callers that want to hand over the renderer; the cube map needs none, so this only makes sure it exists.
function gunEnv(renderer) { if (!GENV) GENV = GUNLIB.buildEnvCube(); return GENV; }
// Scale every gun reflection (e.g. dim them indoors or at night); 1 = as authored
function gunEnvIntensity(k) { Object.values(GM).forEach(m => { if (m.userData && m.userData.ei !== undefined) m.envMapIntensity = m.userData.ei * k; }); }

const GM = {};
function gunMats() {
  if (!GENV) GENV = GUNLIB.buildEnvCube();
  GUNLIB.gunTextures();
  const s = (o, ei = 1) => { const m = new THREE.MeshStandardMaterial(o); m.envMap = GENV; m.envMapIntensity = ei; m.userData.ei = ei; return m; };
  GM.blk = s({ map: TEX.gunGrain, color: 0x2f3134, roughness: 0.46, metalness: 0.25 }, 1);         // black anodised / nitride
  GM.park = s({ map: TEX.gunGrain, color: 0x50534c, roughness: 0.6, metalness: 0.3 }, 0.9);        // grey parkerised
  GM.barrel = s({ map: TEX.gunGrain, color: 0x575b60, roughness: 0.34, metalness: 0.85 }, 1);
  GM.blued = s({ map: TEX.gunGrain, color: 0x3e424a, roughness: 0.3, metalness: 0.85 }, 1);
  GM.steel = s({ map: TEX.gunGrain, color: 0xd2d6da, roughness: 0.18, metalness: 1 }, 1.1);           // polished bolt
  GM.odg = s({ map: TEX.gunGrain, color: 0x4e5638, roughness: 0.66, metalness: 0.12 }, 0.7);        // AI green stock
  GM.odgD = s({ map: TEX.gunGrain, color: 0x343a26, roughness: 0.75, metalness: 0.05 }, 0.5);
  GM.tan = s({ map: TEX.gunGrain, color: 0xa08c66, roughness: 0.62, metalness: 0.12 }, 0.7);
  GM.pso = s({ map: TEX.gunGrain, color: 0x353a33, roughness: 0.5, metalness: 0.2 }, 0.9);
  GM.de = s({ map: TEX.gunGrain, color: 0x868a90, roughness: 0.24, metalness: 1 }, 1.1);          // Deagle satin finish
  GM.poly = s({ color: 0x2a2b2d, roughness: 0.68, metalness: 0.0 }, 0.6);
  GM.polyTan = s({ color: 0x9b8a68, roughness: 0.75, metalness: 0.0 }, 0.6);
  GM.carbon = s({ map: TEX.carbon, color: 0x8a8a8a, roughness: 0.28, metalness: 0.35 }, 1);
  GM.wood = s({ map: TEX.gunWood, color: 0xc08a5a, roughness: 0.55 }, 0.5);
  GM.woodDark = s({ map: TEX.gunWood, color: 0x8a5a38, roughness: 0.6 }, 0.5);
  GM.svdWood = s({ map: TEX.svdWood, color: 0xd8d0c8, roughness: 0.4, metalness: 0.0 }, 0.7);       // varnished
  GM.grip = s({ map: TEX.checker, color: 0xffffff, roughness: 0.8, metalness: 0.0 }, 0.5);
  GM.rubber = s({ color: 0x161616, roughness: 0.92 }, 0.4);
  GM.dark = s({ color: 0x050505, roughness: 0.9 }, 0.2);
  GM.white = s({ color: 0xf0f0e8, emissive: 0x404040, roughness: 0.5 }, 0.5);
  GM.glass = s({ color: 0x5577aa, roughness: 0.05, metalness: 0.9, transparent: true, opacity: 0.22, depthWrite: false }, 1);
  GM.lens = s({ color: 0x1c2c55, emissive: 0x05060c, roughness: 0.04, metalness: 0.9 }, 1.6);
  GM.red = new THREE.MeshBasicMaterial({ color: 0xff2a1a });
  GM.brass = s({ color: 0xd8b050, roughness: 0.3, metalness: 0.9 }, 1);
  GM.shell = s({ color: 0xa0201a, roughness: 0.5 }, 0.5);
  // knife
  if (!KENV) KENV = GUNLIB.buildEnvCube(128, GUNLIB.envStudio);
  GM.damas = s({ map: TEX.damascus, color: 0xffffff, roughness: 0.13, metalness: 1 }, 1.35); GM.damas.envMap = KENV;
  GM.kblk = s({ map: TEX.gunGrain, color: 0x2c2d30, roughness: 0.3, metalness: 0.6 }, 1); GM.kblk.envMap = KENV;
  GM.kgrip = s({ color: 0x121315, roughness: 0.55, metalness: 0.05 }, 0.6);
  GM.decal = s({ map: TEX.gunDecal, transparent: true, depthWrite: false, roughness: 0.55, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }, 0.4);
  GM.illum = new THREE.MeshBasicMaterial({ color: 0xc8261a });   // illumination dial pip / battery cap
  // the hex colours above are sRGB; three r128 treats material colours as linear, so convert them once
  Object.values(GM).forEach(m => { m.color.convertSRGBToLinear(); if (m.emissive) m.emissive.convertSRGBToLinear(); });
}

// Build a gun and merge its static parts per material (animated parts stay separate)
function buildGun(id, mods, shadows = false) {
  const BUILDERS = GUNLIB.BUILDERS;
  if (!BUILDERS[id]) id = 'awm';
  const def = WEAPONS[id];
  mods = Object.assign({}, def.def, mods || {});
  // drop mods this weapon can't take (e.g. a loadout saved for another gun)
  ['optic', 'muzzle', 'under'].forEach(k => { const s = def.slots[k]; if (!s || !s.includes(mods[k])) mods[k] = def.def[k]; });
  const m = BUILDERS[id](mods);
  const keep = [m.mag, m.ch, m.bolt, m.slide].filter(Boolean);
  bakeGroup(m.group, keep, shadows);
  keep.forEach(k => bakeGroup(k, [], shadows));
  m.group.traverse(o => { if (o.isMesh) { o.castShadow = shadows; o.receiveShadow = shadows; } });
  // aiming: the eye sits on the optic axis, eye relief behind the eyepiece
  if (m.opt) { m.sightY = m.opt.h; m.eyeZ = m.opt.eye + m.opt.relief; m.opticZ = m.opt.z; m.relief = m.opt.relief; }
  m.id = id; m.def = def; m.mods = mods;
  m.optic = OPTICS[mods.optic] || null;
  m.supp = !!(MUZZLES[mods.muzzle] && MUZZLES[mods.muzzle].supp);
  m.bipod = !!(UNDER[mods.under] && UNDER[mods.under].bipod);
  ['mag', 'bolt', 'boltKnob', 'ch', 'slide', 'blade', 'tip'].forEach(k => { if (m[k] === undefined) m[k] = null; });
  return m;
}

// Everything below is private to this file (helpers, part builders, models), kept out of the global scope so the
// short helper names can't collide with other scripts.
const GUNLIB = (() => {
function envSample(x, y, z) {
  let r, g, b;
  const sl = (dx, dy, dz, w, k) => { const l = Math.hypot(dx, dy, dz), d = (x * dx + y * dy + z * dz) / l; return d > 1 - w ? k * smoothT((d - (1 - w)) / w) : 0; };
  if (y >= 0) {
    const t = Math.pow(y, 0.55);
    r = lerp(214, 132, t); g = lerp(216, 142, t); b = lerp(218, 158, t);
    // ragged skyline of rooftops and trees just above the horizon: gives polished steel a crisp horizon line
    const az = Math.atan2(z, x), sky = 0.035 + 0.04 * Math.max(0, Math.sin(az * 5 + 1) * Math.sin(az * 13 + 2)) + 0.015 * Math.sin(az * 31);
    if (y < sky) { r = 96; g = 98; b = 94; }
  } else {
    const t = Math.pow(-y, 0.5);
    r = lerp(128, 72, t); g = lerp(122, 68, t); b = lerp(108, 60, t);
  }
  // bright cloud breaks and two low light sources, so flat and curved metal both pick up highlights
  const s = sl(0.42, 0.62, 0.66, 0.1, 150) + sl(-0.7, 0.45, -0.55, 0.07, 90) + sl(1, 0.18, 0.35, 0.05, 140) + sl(-0.45, 0.2, 1, 0.06, 110) + sl(0.2, 0.25, -1, 0.05, 90);
  r += s; g += s; b += s * 0.96;
  return [clamp(r, 0, 255), clamp(g, 0, 255), clamp(b, 0, 255)];
}
// Studio-like surroundings for the polished knife: soft strip lights all round the horizon, so a mirror-polished blade
// shows bright and dark bands from any angle (in the dusk game view, the menu turntable and the inspector alike)
function envStudio(x, y, z) {
  let v = y >= 0 ? lerp(178, 120, Math.pow(y, 0.6)) : lerp(132, 58, Math.pow(-y, 0.6));
  const az = Math.atan2(z, x);
  for (let i = 0; i < 7; i++) { const d = Math.abs(((az - i * 0.9 - 0.3) % TAU + TAU + Math.PI) % TAU - Math.PI); if (d < 0.16 && Math.abs(y) < 0.55) v += 110 * smoothT(1 - d / 0.16) * smoothT(1 - Math.abs(y) / 0.55); }
  v += 70 * Math.exp(-Math.pow((y + 0.12) / 0.06, 2));   // bright floor reflection line just under the horizon
  if (y > 0.75) v += 60;                                 // overhead softbox
  v = clamp(v, 0, 255); return [v * 0.97, v * 0.985, v];
}
function buildEnvCube(S = 128, sample = envSample) {
  const faces = [];
  for (let f = 0; f < 6; f++) {
    const c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d'), img = g.createImageData(S, S), d = img.data;
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const u = (i + 0.5) / S * 2 - 1, v = (j + 0.5) / S * 2 - 1;
      let x, y, z;
      if (f === 0) { x = 1; y = -v; z = -u; } else if (f === 1) { x = -1; y = -v; z = u; } else if (f === 2) { x = u; y = 1; z = v; }
      else if (f === 3) { x = u; y = -1; z = -v; } else if (f === 4) { x = u; y = -v; z = 1; } else { x = -u; y = -v; z = -1; }
      const l = Math.hypot(x, y, z), col = sample(x / l, y / l, z / l), k = (j * S + i) * 4;
      d[k] = col[0]; d[k + 1] = col[1]; d[k + 2] = col[2]; d[k + 3] = 255;
    }
    g.putImageData(img, 0, 0); faces.push(c);
  }
  const t = new THREE.CubeTexture(faces); t.encoding = THREE.sRGBEncoding; t.needsUpdate = true;
  return t;
}

// ---------- Gun textures ----------
function valueNoise(seed, N = 64) {
  const r = makeRng(seed), v = new Float32Array(N * N).map(() => r());
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = ((xi % N) + N) % N, b = ((yi % N) + N) % N, a1 = (a + 1) % N, b1 = (b + 1) % N;
    return lerp(lerp(v[b * N + a], v[b * N + a1], sx), lerp(v[b1 * N + a], v[b1 * N + a1], sx), sy);
  };
}
function gunTextures() {
  // Damascus: folded steel layers, pushed around by smooth noise into ripples and the odd swirl
  const n1 = valueNoise(7), n2 = valueNoise(19), n3 = valueNoise(31);
  const fbm = (n, x, y) => n(x, y) * 0.55 + n(x * 2.1 + 3.7, y * 2.1 + 1.3) * 0.28 + n(x * 4.3 + 7.1, y * 4.3 + 5.9) * 0.17;
  TEX.damascus = canvasTex(1024, 256, (g, w, h) => {
    const img = g.createImageData(w, h), d = img.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const nx = x / w * 9, ny = y / h * 2.2;
      const warp = fbm(n1, nx * 0.8, ny * 1.6) * 3.4 + fbm(n2, nx * 2.6 + 5, ny * 3.4) * 1.1;
      // swirl: twist the layers around noise-placed eyes, like a twisted / raindrop pattern
      const sw = Math.sin(nx * 2.3 + fbm(n3, nx * 0.6, ny * 1.2) * 7) * 0.7 + Math.sin(nx * 5.1 - ny * 3 + warp) * 0.25;
      const layer = ny * 13 + warp * 2.1 + sw;
      const s = Math.sin(layer * TAU), s2 = Math.sin(layer * TAU * 2 + 1.3), t = 0.5 + 0.5 * Math.tanh(s * 1.4 + s2 * 0.35);
      const c = lerp(100, 226, t) + (Math.random() - 0.5) * 10;
      const k = (y * w + x) * 4; d[k] = c * 0.96; d[k + 1] = c * 0.985; d[k + 2] = c; d[k + 3] = 255;   // slightly cool, reads as steel
    }
    g.putImageData(img, 0, 0);
  });
  TEX.damascus.wrapS = TEX.damascus.wrapT = THREE.ClampToEdgeWrapping;
  // fine finish grain for anodised/painted parts (UVs are in metres, so this tiles every ~8 cm)
  // plus faint handling scuffs: short bright scratches that catch the light at a glancing angle
  TEX.gunGrain = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#e2e2e2'; g.fillRect(0, 0, w, h); blotches(g, w, h, 30, 3, 14, () => `rgba(${rand(170, 255)|0},${rand(170, 255)|0},${rand(170, 255)|0},0.2)`);
    for (let i = 0; i < 70; i++) { const x = Math.random() * w, y = Math.random() * h, a = rand(-0.5, 0.5) + (Math.random() < 0.5 ? 0 : Math.PI / 2), l = rand(3, 16);
      g.strokeStyle = `rgba(255,255,255,${rand(0.15, 0.4)})`; g.lineWidth = rand(0.4, 1); g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
    grain(g, w, h, 18);
  });
  TEX.gunGrain.repeat.set(6, 6);
  // Carbon fibre 2x2 twill
  TEX.carbon = canvasTex(64, 64, (g, w, h) => {
    const c = 8;
    for (let j = 0; j < h / c; j++) for (let i = 0; i < w / c; i++) {
      const hor = ((i + j) >> 1) % 2 === 0, gr = hor ? g.createLinearGradient(i * c, j * c, i * c, j * c + c) : g.createLinearGradient(i * c, j * c, i * c + c, j * c);
      gr.addColorStop(0, '#3a3d42'); gr.addColorStop(0.5, '#9aa0a8'); gr.addColorStop(1, '#3a3d42');
      g.fillStyle = gr; g.fillRect(i * c, j * c, c, c);
      g.fillStyle = 'rgba(0,0,0,0.35)'; if (hor) g.fillRect(i * c, j * c, c, 1); else g.fillRect(i * c, j * c, 1, c);
    }
  });
  TEX.carbon.repeat.set(5, 10);
  // Soviet laminated birch: reddish brown with the glue lines showing as dark stripes
  TEX.svdWood = canvasTex(512, 128, (g, w, h) => {
    g.fillStyle = '#5e3420'; g.fillRect(0, 0, w, h);
    let y = 0;
    while (y < h) { const t = rand(2, 4); g.fillStyle = `rgb(${rand(96, 116)|0},${rand(54, 64)|0},${rand(32, 40)|0})`; g.fillRect(0, y, w, t); g.fillStyle = 'rgba(40,18,8,0.35)'; g.fillRect(0, y + t - 0.6, w, 0.6); y += t; }
    for (let i = 0; i < 50; i++) { g.strokeStyle = `rgba(50,22,8,${rand(0.1, 0.3)})`; g.lineWidth = rand(0.5, 1.5); g.beginPath(); const y0 = Math.random() * h; g.moveTo(0, y0); for (let x = 0; x <= w; x += 16) g.lineTo(x, y0 + Math.sin(x / rand(30, 70)) * rand(1, 5)); g.stroke(); }
    grain(g, w, h, 10);
  });
  TEX.svdWood.repeat.set(2, 9);
  // Checkered rubber grip panels
  TEX.checker = canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = '#1b1b1c'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#050505'; g.lineWidth = 2.5;
    for (let k = -w; k <= w * 2; k += 8) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + h, h); g.stroke(); g.beginPath(); g.moveTo(k, h); g.lineTo(k + h, 0); g.stroke(); }
    g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 1;
    for (let k = -w; k <= w * 2; k += 8) { g.beginPath(); g.moveTo(k + 1.5, 0); g.lineTo(k + 1.5 + h, h); g.stroke(); }
  });
  TEX.checker.repeat.set(30, 30);
  // one atlas for every marking (roll marks, scope names, power ring numbers), so they all merge into one draw call
  TEX.gunDecal = canvasTex(1024, 1024, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    let x = 4, y = 4;
    Object.entries(DECAL_TXT).forEach(([k, [txt, col, px, font]]) => {
      px = px || 34; g.font = `${font || 'bold'} ${px}px Arial, Helvetica, sans-serif`;
      const tw = Math.ceil(g.measureText(txt).width) + 8, th = Math.ceil(px * 1.25);
      if (x + tw > w - 4) { x = 4; y += 58; }
      g.fillStyle = col; g.textBaseline = 'middle'; g.fillText(txt, x + 4, y + th / 2 + 1);
      DEC[k] = { u0: x / w, u1: (x + tw) / w, v0: 1 - (y + th) / h, v1: 1 - y / h, asp: tw / th };
      x += tw + 6;
    });
  });
  TEX.gunDecal.wrapS = TEX.gunDecal.wrapT = THREE.ClampToEdgeWrapping; TEX.gunDecal.anisotropy = 16;
}
// Markings: [text, colour, px, font weight]. Laser engraving on anodised parts shows light grey, stamped steel dark.
const DECAL_TXT = {
  atacr: ['NIGHTFORCE  ATACR  7-35×56  F1', '#d8d8d4'], atacrN: ['7     10     15     20     25     35', '#f0f0ea', 30],
  pm2: ['SCHMIDT & BENDER   PM II   5-25×56', '#d8d8d4'], pm2N: ['5    8    12    16    20    25', '#f0f0ea', 30],
  mk4: ['LEUPOLD   MARK 4   4.5-14×50', '#e0d8a8'], mk4N: ['4.5   6   8   10   12   14', '#f0f0ea', 30],
  lpvo: ['VORTEX  RAZOR HD  1-6×24', '#d8d8d4'], lpvoN: ['1    2    3    4    5    6', '#f0f0ea', 30],
  pso: ['ПСО-1   №  KA 0417', '#c8c8b8'], psoN: ['0   1   2   3   4   5   6   7   8   9   10', '#e8e8d8', 28],
  awm: ['ACCURACY INTERNATIONAL  AWM  .338 LAPUA MAG', '#cfd2c8'], awmS: ['No. 0731   ENGLAND', '#cfd2c8', 28],
  m82: ['BARRETT FIREARMS MFG.  M82A1  CAL .50 BMG', '#d0d0c8'], m82S: ['MURFREESBORO, TN  USA   SN 08852', '#d0d0c8', 28],
  m200: ['CHEYTAC  M200 INTERVENTION  .408 CT', '#c8ccd0'], m200S: ['SN CT-1194   USA', '#c8ccd0', 28],
  svd: ['СВД  1978  № ЛА 4521', '#1a1a1a'], svdS: ['★  ИЖ', '#1a1a1a', 34],
  de: ['DESERT EAGLE  .50 A.E.', '#2a2a2c', 38], deS: ['MAGNUM RESEARCH INC.  MPLS. MN', '#2a2a2c', 28],
  m9: ['M9  ·  DAMASCUS', '#303034', 30],
};
const DEC = {};
// flat marking of height h at (x, y, z) facing face ('+x' | '-x' | '+y' | '+z' | '-z'); rot turns it in its plane
function decal(parent, key, x, y, z, h, face = '-x', rot = 0) {
  const d = DEC[key]; if (!d) return;
  const geo = new THREE.PlaneGeometry(h * d.asp, h), uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, lerp(d.u0, d.u1, uv.getX(i)), lerp(d.v0, d.v1, uv.getY(i)));
  if (rot) geo.rotateZ(rot);
  const r = { '-x': [0, -Math.PI / 2], '+x': [0, Math.PI / 2], '+y': [-Math.PI / 2, 0], '+z': [0, 0], '-z': [0, Math.PI] }[face];
  const o = 0.00025, n = { '-x': [-o, 0, 0], '+x': [o, 0, 0], '+y': [0, o, 0], '+z': [0, 0, o], '-z': [0, 0, -o] }[face];
  return P(geo, GM.decal, x + n[0], y + n[1], z + n[2], parent, r[0], r[1], 0);
}
// marking wrapped over the top of a cylinder along z (radius r, centre y/z, h = band width along z, arc = angle covered)
function decalRing(parent, key, y, z, r, h, arc = 1.6) {
  const d = DEC[key]; if (!d) return;
  const geo = new THREE.CylinderGeometry(r, r, h, 24, 1, true, Math.PI - arc / 2, arc), uv = geo.attributes.uv;
  // flip both axes so the numbers read left to right with their tops pointing forward when seen from behind the scope
  for (let i = 0; i < uv.count; i++) uv.setXY(i, lerp(d.u0, d.u1, 1 - uv.getX(i)), lerp(d.v0, d.v1, 1 - uv.getY(i)));
  geo.rotateX(Math.PI / 2);
  return P(geo, GM.decal, 0, y, z, parent);
}


// ---------- Geometry helpers ----------
const P = (geo, mat, x, y, z, parent, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); parent.add(m); return m; };
const rb = (w, h, d, r = 0.003) => rboxGeo(w, h, d, r, 2);
const zc = (r, len, seg = 16) => zcylGeo(r, r, len, seg);
const yc = (r, h, seg = 16) => new THREE.CylinderGeometry(r, r, h, seg);
const xc = (r, len, seg = 12) => xcylGeo(r, len, seg);
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const sph = (r, a = 12, b = 8) => new THREE.SphereGeometry(r, a, b);
function marker(parent, x, y, z, name) { const o = new THREE.Object3D(); o.position.set(x, y, z); o.name = name; parent.add(o); return o; }
// surface of revolution around z; prof = [[r, z], ...] walked in increasing z (start at the axis / front, end at the rear)
function lathe(prof, seg = 32) { const g = new THREE.LatheGeometry(prof.map(p => new THREE.Vector2(Math.max(p[0], 1e-5), p[1])), seg); g.rotateX(Math.PI / 2); return g; }
// cylinder along y with n rounded grooves (barrel flutes, knurling); grooves fade out over endLen at both ends
function grooveCyl(R, len, n, depth, frac = 0.5, endLen = 0, seg = 0) {
  seg = seg || Math.min(240, Math.max(48, n * 6));
  const g = new THREE.CylinderGeometry(R, R, len, seg, endLen > 0 ? 3 : 1, false), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const r = Math.hypot(x, z); if (r < 1e-7) continue;
    let k = 1;
    if (endLen > 0) { if (Math.abs(y) > len / 2 - 1e-6) k = 0; else y = Math.sign(y) * (len / 2 - endLen); }
    const a = Math.atan2(z, x), t = ((a / (TAU / n)) % 1 + 1) % 1, c = (t - 0.5) / (frac / 2);
    const gr = Math.abs(c) < 1 ? depth * Math.cos(c * Math.PI / 2) : 0, rr = R - k * gr;
    p.setXYZ(i, x / r * rr, y, z / r * rr);
  }
  g.computeVertexNormals(); return g;
}
const grooveZ = (...a) => grooveCyl(...a).rotateX(Math.PI / 2);
const grooveX = (...a) => grooveCyl(...a).rotateZ(Math.PI / 2);
// cross-section in the front view (x, y) extruded along z, centred
function xsec(pts, len, bevel = 0.001) {
  const sh = new THREE.Shape(); sh.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]);
  const b = Math.min(bevel, len / 2 - 1e-4);
  const g = new THREE.ExtrudeGeometry(sh, { depth: len - 2 * b, bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 6 });
  g.translate(0, 0, -(len - 2 * b) / 2); g.computeVertexNormals(); return g;
}
// outline in the top view (x, z) extruded along y, centred
function topG(pts, thick, bevel = 0.001) {
  const sh = new THREE.Shape(); sh.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]);
  const b = Math.min(bevel, thick / 2 - 1e-4);
  const g = new THREE.ExtrudeGeometry(sh, { depth: thick - 2 * b, bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 6 });
  g.rotateX(Math.PI / 2); g.translate(0, (thick - 2 * b) / 2, 0); g.computeVertexNormals(); return g;
}
const ellipse = (cz, cy, rz, ry, n = 14) => Array.from({ length: n }, (_, i) => [cz + Math.cos(i / n * TAU) * rz, cy + Math.sin(i / n * TAU) * ry]);
// rod between two points
function rod(parent, a, b, r, mat, seg = 10) {
  const A = new V3(...a), B = new V3(...b), d = B.clone().sub(A), m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), seg), mat);
  m.position.copy(A).add(B).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(UP, d.normalize()); parent.add(m); return m;
}
// hex socket cap screw; axis = direction the head faces
function screw(parent, x, y, z, axis = 'x', r = 0.0022, mat = GM.steel) {
  const sg = axis[0] === '-' ? -1 : 1, ax = axis.slice(-1), rot = ax === 'x' ? [0, 0, Math.PI / 2] : ax === 'z' ? [Math.PI / 2, 0, 0] : [0, 0, 0];
  const at = d => ax === 'x' ? [x + sg * d, y, z] : ax === 'y' ? [x, y + sg * d, z] : [x, y, z + sg * d];
  P(yc(r, 0.0016, 14), mat, ...at(0), parent, ...rot);
  P(yc(r * 0.45, 0.0018, 6), GM.dark, ...at(0.0002), parent, ...rot);
}
function helixZ(R, len, turns, tube) {
  const pts = []; for (let i = 0; i <= turns * 12; i++) { const a = i / 12 * TAU; pts.push(new V3(Math.cos(a) * R, Math.sin(a) * R, -i / (turns * 12) * len)); }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), turns * 12, tube, 5, false);
}
// Picatinny rail: base strip with cross slots; returns the top height
function rail(parent, len, y, z, x = 0, mat = GM.blk, w = 0.021) {
  P(rb(w, 0.0056, len, 0.0012), mat, x, y + 0.0028, z, parent);
  const n = Math.floor((len - 0.004) / 0.01), z0 = z - (n - 1) * 0.005;
  for (let i = 0; i < n; i++) P(rb(w + 0.0006, 0.0042, 0.0052, 0.0008), mat, x, y + 0.0074, z0 + i * 0.01, parent);
  return y + 0.0095;
}

// ---------- Muzzle devices ----------
// Ported brake: rear collar, n side ports (open sideways, bridged top and bottom), solid front cap. Returns the tip z.
function brakePorted(g, y, z0, R, len, n, mat = GM.blk) {
  const col = len * 0.24, cap = len * 0.14, pitch = (len - col - cap) / n, gap = pitch * 0.6;
  P(zc(R * 0.94, col, 24), mat, 0, y, z0 - col / 2, g);
  [-1, 1].forEach(s => P(box(0.001, R * 0.9, col * 0.6), GM.blk, s * R * 0.9, y, z0 - col / 2, g));   // wrench flats
  P(zc(R * 0.5, len - col, 14), GM.dark, 0, y, z0 - col - (len - col) / 2, g);                        // bore seen through the ports
  let z = z0 - col;
  for (let i = 0; i < n; i++) {
    [-1, 1].forEach(s => P(rb(R * 1.3, R * 0.6, gap + 0.002, R * 0.25), mat, 0, y + s * R * 0.7, z - gap / 2, g));
    z -= gap;
    P(zc(R, pitch - gap, 28), mat, 0, y, z - (pitch - gap) / 2, g);
    z -= pitch - gap;
  }
  P(lathe([[R * 0.4, z - cap + 0.001], [R * 0.4, z - cap], [R * 0.85, z - cap], [R, z - cap + cap * 0.35], [R, z + 0.0005]], 28), mat, 0, y, 0, g);
  P(new THREE.CircleGeometry(R * 0.4, 14), GM.dark, 0, y, z - cap + 0.0012, g, 0, Math.PI, 0);
  return z - cap;
}
// Suppressor: knurled mount collar, tube with engraved rings, chamfered cap
function suppressor(g, y, z0, R, len, mat = GM.park) {
  const mc = 0.034, zf = z0 - len;
  P(lathe([[R * 0.3, zf + 0.004], [R * 0.3, zf], [R * 0.8, zf], [R, zf + 0.007], [R, z0 - mc - 0.003], [R * 0.93, z0 - mc], [R * 0.93, z0 - 0.004], [R * 0.72, z0]], 36), mat, 0, y, 0, g);
  P(grooveZ(R * 0.935, mc * 0.62, 36, 0.0009, 0.5), mat, 0, y, z0 - mc * 0.5, g);
  [0.05, 0.056, zf - z0 + 0.03].forEach(d => P(zc(R + 0.0002, 0.0012, 36), GM.dark, 0, y, d > 0 ? z0 - mc - d : z0 + d, g));
  P(new THREE.CircleGeometry(R * 0.3, 14), GM.dark, 0, y, zf + 0.004, g, 0, Math.PI, 0);
  return zf;
}
// Plain crown with a thread protector
function crown(g, y, z0, R) {
  P(zc(R * 1.08, 0.014, 24), GM.blk, 0, y, z0 - 0.007, g);
  P(grooveZ(R * 1.09, 0.008, 24, 0.0006, 0.5), GM.blk, 0, y, z0 - 0.007, g);
  P(new THREE.CircleGeometry(R * 0.4, 12), GM.dark, 0, y, z0 - 0.0141, g, 0, Math.PI, 0);
  return z0 - 0.014;
}

// Folded Harris-style bipod hanging under a sling stud at (y, z); legs fold forward along the barrel
function bipodFold(g, y, z, w = 0.03, legL = 0.2) {
  P(rb(0.026, 0.01, 0.034, 0.002), GM.blk, 0, y - 0.005, z, g);
  P(xc(0.0062, 2 * w + 0.014, 16), GM.blk, 0, y - 0.014, z, g);
  P(rb(0.022, 0.014, 0.022, 0.003), GM.blk, 0, y - 0.016, z + 0.012, g);
  P(xc(0.0045, 0.012, 12), GM.blk, 0.016, y - 0.016, z + 0.02, g);   // tension knob
  P(grooveX(0.0065, 0.008, 18, 0.0007), GM.blk, 0.024, y - 0.016, z + 0.02, g);
  [-1, 1].forEach(s => {
    const x = s * w, ly = y - 0.015;
    P(rb(0.013, 0.016, 0.026, 0.003), GM.blk, x, ly, z - 0.004, g);
    P(zc(0.0062, legL * 0.6, 14), GM.blk, x, ly, z - 0.016 - legL * 0.3, g);
    P(zc(0.0047, legL * 0.42, 12), GM.steel, x, ly, z - 0.016 - legL * 0.6 - legL * 0.2, g);
    for (let i = 0; i < 5; i++) P(zc(0.005, 0.0015, 12), GM.blk, x, ly, z - 0.016 - legL * 0.62 - i * 0.012, g);   // leg notches
    P(lathe([[0, -legL - 0.03], [0.006, -legL - 0.028], [0.0075, -legL - 0.016], [0.0055, -legL - 0.008]], 14), GM.rubber, x, ly, z, g);
    P(rb(0.009, 0.01, 0.012, 0.002), GM.blk, x + s * 0.007, ly, z - 0.016 - legL * 0.56, g);   // leg lock
    P(helixZ(0.0035, legL * 0.32, 8, 0.0007), GM.steel, x - s * 0.0105, ly + 0.002, z - 0.012, g);   // spring
  });
}
function slingStud(g, y, z, down = true) {
  P(yc(0.0042, 0.008, 10), GM.blk, 0, y - 0.004, z, g);
  P(new THREE.TorusGeometry(0.0055, 0.0012, 6, 16), GM.steel, 0, y - 0.011, z, g, 0, Math.PI / 2, 0);
}

// ---------- Optics ----------
/// Scope tube as one lathe: recessed objective lens, bell, tube, power ring, eyepiece. Each scope gets its own silhouette:
// the Razor is short and almost bell-less, the Mk4 slim with tall M1 turrets and an AO ring, the PM II long with a
// 56 mm bell and side parallax, the ATACR huge up front with an illumination dial and flip caps.
const SCOPES = {
  lpvo: { len: 0.262, objR: 0.019, objL: 0.04, objT: 0.012, tubeR: 0.015, prZ: [0.04, 0.072], prR: 0.0198, eyeR: 0.0222, eyeL: 0.052, axis: 0.04, tR: 0.0115, tH: 0.011, relief: 0.09 },
  mk4: { len: 0.35, objR: 0.0265, objL: 0.056, objT: 0.045, tubeR: 0.0138, prZ: [0.068, 0.098], prR: 0.0178, eyeR: 0.0198, eyeL: 0.062, axis: 0.035, tR: 0.0138, tH: 0.032, relief: 0.09 },
  pm2: { len: 0.425, objR: 0.0355, objL: 0.068, objT: 0.052, tubeR: 0.017, prZ: [0.092, 0.124], prR: 0.021, eyeR: 0.0226, eyeL: 0.072, axis: 0.045, tR: 0.0172, tH: 0.027, relief: 0.09 },
  atacr: { len: 0.405, objR: 0.0395, objL: 0.074, objT: 0.056, tubeR: 0.017, prZ: [0.088, 0.116], prR: 0.0218, eyeR: 0.0232, eyeL: 0.066, axis: 0.047, tR: 0.0182, tH: 0.024, relief: 0.09 },
};
// Turret on a scope: base, knurled cap, white index marks. dir: 'up' | 'right' | 'left'; local axis is +y
function turret(g, x, y, z, dir, R, H, o = {}) {
  const t = new THREE.Group(); t.position.set(x, y, z); t.rotation.z = dir === 'right' ? -Math.PI / 2 : dir === 'left' ? Math.PI / 2 : 0; g.add(t);
  const mat = o.mat || GM.blk;
  P(yc(R * 0.78, H * 0.4, 28), mat, 0, H * 0.2, 0, t);
  P(grooveCyl(R, H * 0.5, o.n || 40, R * 0.06, 0.5), mat, 0, H * 0.4 + H * 0.25, 0, t);
  P(yc(R * 0.92, 0.002, 28), mat, 0, H * 0.9 + 0.001, 0, t);
  P(yc(R * 0.55, 0.0015, 20), o.capMat || GM.dark, 0, H * 0.9 + 0.0024, 0, t);   // screw cap recess
  if (o.ring) P(yc(R * 1.02, H * 0.08, 28), o.ring, 0, H * 0.43, 0, t);         // zero-stop lock ring
  // index marks around the cap's lower skirt + the fixed index line on the base
  if (!o.noMarks) for (let i = 0; i < 20; i++) { const a = i / 20 * TAU; P(box(0.0006, H * (i % 5 ? 0.08 : 0.16), 0.0006), GM.white, Math.sin(a) * (R + 0.0002), H * 0.4 + H * 0.06, Math.cos(a) * (R + 0.0002), t, 0, a, 0); }
  P(box(0.0007, H * 0.3, 0.0008), GM.white, 0, H * 0.2, R * 0.78 + 0.0002, t);
  return t;
}
// Scope ring clamping the tube at local z, with a base on the rail (ring base sits on y = 0)
function scopeRing(g, z, tubeR, axis, mat = GM.blk) {
  const ro = tubeR + 0.0035;
  P(zc(ro, 0.016, 32), mat, 0, axis, z, g);
  [-1, 1].forEach(s => {
    P(rb(0.0075, 0.007, 0.016, 0.0015), mat, s * (ro + 0.002), axis, z, g);
    P(box(0.0078, 0.0006, 0.0162), GM.dark, s * (ro + 0.002), axis, z, g);          // cap split
    screw(g, s * (ro + 0.002), axis + 0.0035, z - 0.004, 'y', 0.0017); screw(g, s * (ro + 0.002), axis + 0.0035, z + 0.004, 'y', 0.0017);
  });
  const bh = axis - ro + 0.003;
  P(rb(0.026, bh, 0.016, 0.002), mat, 0, bh / 2, z, g);
  P(rb(0.03, 0.006, 0.018, 0.0015), mat, 0, 0.004, z, g);
  P(xc(0.0026, 0.036, 10), GM.steel, 0, 0.004, z, g);                                       // cross bolt
  P(yc(0.0042, 0.004, 6), GM.blk, 0.019, 0.004, z, g, 0, 0, Math.PI / 2);                 // nut
}
// flip-up lens cap body clamped round a tube end (lid left off, it would only flap in the shooter's view); s = +1 rear, -1 front
function flipCap(g, A, z, R, s) {
  P(zc(R + 0.0022, 0.012, 32), GM.poly, 0, A, z, g);
  P(rb(0.006, 0.008, 0.01, 0.002), GM.poly, -R - 0.004, A + 0.004, z + s * 0.002, g);
  P(zc(0.0016, 0.012, 8), GM.steel, -R - 0.004, A + 0.004, z + s * 0.002, g);   // hinge pin
}
// Build an optic on a rail whose top is at y = railY, centred at gun z = cz. Returns axis height, eyepiece z and eye relief.
function buildOptic(kind, parent, railY, cz) {
  const p = SCOPES[kind]; if (!p) return null;
  const g = new THREE.Group(); g.position.set(0, railY, cz); parent.add(g);
  const A = p.axis, zF = -p.len / 2, zB = p.len / 2, M = GM.blk;
  const zT = zF + p.objL + p.objT;   // where the bell meets the tube
  P(lathe([[p.objR - 0.0025, zF + 0.008], [p.objR - 0.0025, zF], [p.objR, zF], [p.objR, zF + p.objL], [p.objR - 0.002, zF + p.objL + 0.006], [p.tubeR, zT],
    [p.tubeR, p.prZ[0]], [p.prR, p.prZ[0] + 0.004], [p.prR, p.prZ[1]], [p.eyeR * 0.9, p.prZ[1] + 0.008], [p.eyeR, zB - p.eyeL], [p.eyeR, zB], [p.eyeR - 0.003, zB], [p.eyeR - 0.003, zB - 0.007]], 48), M, 0, A, 0, g);
  // glass: objective and ocular
  P(new THREE.CircleGeometry(p.objR - 0.0025, 32), GM.lens, 0, A, zF + 0.008, g, 0, Math.PI, 0);
  P(new THREE.CircleGeometry(p.eyeR - 0.003, 32), GM.lens, 0, A, zB - 0.007, g);
  // knurled power ring and diopter ring
  P(grooveZ(p.prR + 0.0004, (p.prZ[1] - p.prZ[0]) * 0.6, 48, 0.0007, 0.5), M, 0, A, (p.prZ[0] + p.prZ[1]) / 2 + 0.002, g);
  P(grooveZ(p.eyeR + 0.0004, p.eyeL * 0.32, 48, 0.0007, 0.5), M, 0, A, zB - p.eyeL * 0.24, g);
  P(zc(p.objR + 0.0003, 0.002, 40), GM.dark, 0, A, zF + p.objL * 0.5, g);
  // markings: magnification numbers on the plain band in front of the knurling, index dot on the eyepiece, name on the
  // left of the tube (the side the shooter sees in the hip view)
  decalRing(g, kind + 'N', A, p.prZ[0] + 0.0045, p.prR + 0.0005, 0.0042, 1.5);
  P(sph(0.0011, 8, 6), GM.white, 0, A + p.eyeR * 0.9 + 0.0004, p.prZ[1] + 0.0095, g);
  if (kind === 'lpvo') decal(g, kind, -p.eyeR, A, zB - p.eyeL * 0.62, Math.min(0.0034, 0.026 / DEC[kind].asp), '-x');
  else { const av = p.objL - (kind === 'mk4' ? 0.026 : 0.022); decal(g, kind, -p.objR, A, zF + (kind === 'mk4' ? 0.004 : 0.016) + av / 2, Math.min(0.0042, av / DEC[kind].asp), '-x'); }
  // saddle with elevation (top) and windage (right) turrets
  const sw = p.tubeR * 2 + 0.009;
  const ringF = (zT - 0.031) / 2, ringR = (0.031 + p.prZ[0]) / 2;
  if (kind === 'lpvo') {
    // low capped turrets on a short scope, illumination dial on the left, throw lever on the power ring, cantilever mount
    P(rb(sw, sw, 0.05, 0.006), M, 0, A, 0, g);
    turret(g, 0, A + sw / 2 - 0.001, 0, 'up', p.tR, p.tH, { n: 24, noMarks: true });
    turret(g, sw / 2 - 0.001, A, 0, 'right', p.tR * 0.92, p.tH, { n: 24, noMarks: true });
    turret(g, -sw / 2 + 0.001, A, 0, 'left', p.tR * 1.05, 0.012, { n: 18 });
    P(sph(0.0016, 8, 6), GM.illum, -sw / 2 - 0.0125, A, 0, g);
    // throw lever: a fin standing up and to the right of the power ring, with a grooved thumb pad
    const th = new THREE.Group(); th.position.set(0, A, (p.prZ[0] + p.prZ[1]) / 2 + 0.002); th.rotation.z = -0.55; g.add(th);
    P(profileGeo([[-0.007, p.prR - 0.001], [0.007, p.prR - 0.001], [0.004, p.prR + 0.016], [-0.005, p.prR + 0.017]], 0.0042, 0.0012), M, 0, 0, 0, th);
    for (let i = 0; i < 3; i++) P(box(0.0046, 0.0008, 0.009), GM.dark, 0, p.prR + 0.009 + i * 0.0026, 0, th);
    // one-piece cantilever mount: both rings on a single base
    [ringF, ringR].forEach(z => scopeRing(g, z, p.tubeR, A));
    P(rb(0.024, 0.009, ringR - ringF + 0.016, 0.002), M, 0, 0.0045, (ringF + ringR) / 2, g);
    [-1, 1].forEach(s => P(box(0.0008, 0.005, ringR - ringF - 0.02), GM.dark, s * 0.0121, 0.0052, (ringF + ringR) / 2, g));
  } else if (kind === 'mk4') {
    // Mk4: plain saddle, tall knurled M1 turrets, adjustable objective ring on the bell instead of a side focus knob
    P(rb(sw, sw * 0.92, 0.056, 0.007), M, 0, A, 0, g);
    turret(g, 0, A + sw / 2 - 0.002, 0, 'up', p.tR, p.tH, { n: 44 });
    turret(g, sw / 2 - 0.002, A, 0, 'right', p.tR * 0.95, p.tH * 0.85, { n: 44 });
    P(grooveZ(p.objR + 0.0006, 0.016, 60, 0.0006, 0.5), M, 0, A, zF + p.objL - 0.012, g);
    P(zc(p.objR + 0.0008, 0.0012, 40), GM.white, 0, A, zF + p.objL - 0.0215, g);   // AO range scale line
    [ringF, ringR].forEach(z => scopeRing(g, z, p.tubeR, A));
  } else {
    P(rb(sw, sw, 0.062, 0.006), M, 0, A, 0, g);
    turret(g, 0, A + sw / 2 - 0.001, 0, 'up', p.tR, p.tH, { ring: kind === 'atacr' ? GM.steel : null });
    turret(g, sw / 2 - 0.001, A, 0, 'right', p.tR * 0.92, p.tH * 0.8);
    // side focus / parallax knob on the left
    const pR = 0.0165;
    turret(g, -sw / 2 + 0.001, A, 0, 'left', pR, 0.02, { n: 32 });
    if (kind === 'pm2') {
      // PM II: big parallax wheel with a white yardage band, separate illumination drum behind it
      P(xc(pR + 0.0005, 0.0015, 32), GM.white, -sw / 2 - 0.0095, A, 0, g);
      P(rb(sw, sw * 0.8, 0.026, 0.004), M, 0, A - 0.001, 0.04, g);
      P(xc(0.009, 0.012, 20), M, -sw / 2 - 0.003, A, 0.04, g); P(grooveX(0.0092, 0.008, 24, 0.0006), M, -sw / 2 - 0.005, A, 0.04, g);
      P(xc(0.0035, 0.002, 12), GM.illum, -sw / 2 - 0.0095, A, 0.04, g);
    } else {
      // ATACR: illumination dial on its own boss at the left rear of the saddle, red index, flip-up caps both ends
      P(xc(pR * 0.45, 0.004, 20), GM.steel, -sw / 2 - 0.02, A, 0, g);
      P(rb(0.012, sw * 0.7, 0.024, 0.004), M, -sw / 2 + 0.002, A + 0.004, 0.044, g);
      P(xc(0.0095, 0.01, 22), M, -sw / 2 - 0.008, A + 0.004, 0.044, g); P(grooveX(0.0098, 0.007, 22, 0.0007), M, -sw / 2 - 0.011, A + 0.004, 0.044, g);
      P(sph(0.0018, 8, 6), GM.illum, -sw / 2 - 0.0152, A + 0.0105, 0.044, g);
      for (let i = 0; i < 4; i++) P(box(0.0008, 0.0008, 0.002), GM.white, -sw / 2 - 0.0152, A + 0.004 + Math.cos(i * 0.8) * 0.0082, 0.044 + Math.sin(i * 0.8) * 0.0082, g);
      flipCap(g, A, zF + 0.005, p.objR, -1);
      flipCap(g, A, zB - 0.004, p.eyeR, 1);
    }
    [ringF, ringR].forEach(z => scopeRing(g, z, p.tubeR, A));
  }
  return { h: railY + A, eye: cz + zB, relief: p.relief, z: cz };
}
// PSO-1: 4x with a long sunshade, rubber eyecup, square turret housing and the integral side mount that clamps to the
// SVD's left-side dovetail. Scope axis at x = 0, y = A, gun coords.
function buildPSO(g, A, sideX, sideY) {
  const M = GM.pso;
  P(lathe([[0.0172, -0.205], [0.0172, -0.256], [0.0196, -0.256], [0.0196, -0.17], [0.0176, -0.162], [0.0176, -0.122], [0.0136, -0.112], [0.0136, 0.0],
    [0.0166, 0.008], [0.0166, 0.05], [0.0178, 0.053], [0.0178, 0.07], [0.015, 0.072], [0.0, 0.072]], 40), M, 0, A, 0, g);
  P(new THREE.CircleGeometry(0.0172, 28), GM.lens, 0, A, -0.205, g, 0, Math.PI, 0);
  P(grooveZ(0.0181, 0.012, 40, 0.0008, 0.5), M, 0, A, 0.061, g);   // diopter ring
  // rubber eyecup, flared
  P(lathe([[0.0168, 0.068], [0.0172, 0.074], [0.0215, 0.098], [0.0236, 0.11], [0.02, 0.112], [0.0185, 0.104], [0.013, 0.1]], 32), GM.rubber, 0, A, 0, g);
  P(new THREE.CircleGeometry(0.0132, 24), GM.lens, 0, A, 0.1, g);
  // turret housing with the elevation drum on top and windage on the left
  P(rb(0.036, 0.038, 0.064, 0.005), M, 0, A - 0.002, -0.058, g);
  turret(g, 0, A + 0.016, -0.058, 'up', 0.0155, 0.02, { n: 30, mat: M });
  turret(g, -0.017, A, -0.058, 'left', 0.0125, 0.016, { n: 26, mat: M });
  // reticle illumination battery housing at the front left
  P(rb(0.016, 0.016, 0.026, 0.004), M, -0.014, A - 0.004, -0.108, g);
  P(xc(0.0075, 0.012, 18), M, -0.026, A - 0.004, -0.108, g); P(grooveX(0.0078, 0.006, 20, 0.0006), M, -0.03, A - 0.004, -0.108, g);
  // integral mount: arm down the left side to the dovetail clamp
  P(rb(0.03, 0.012, 0.096, 0.003), M, -0.012, A - 0.022, -0.075, g);
  P(rb(0.009, A - sideY - 0.01, 0.1, 0.003), M, sideX - 0.006, (A - 0.022 + sideY) / 2, -0.075, g);
  P(rb(0.012, 0.02, 0.11, 0.003), M, sideX - 0.004, sideY, -0.075, g);
  // clamp lever and tension screw
  rod(g, [sideX - 0.011, sideY + 0.002, -0.03], [sideX - 0.015, sideY + 0.034, 0.012], 0.0028, M, 8);
  P(sph(0.005, 12, 8), M, sideX - 0.015, sideY + 0.034, 0.012, g);
  P(xc(0.0045, 0.008, 12), GM.steel, sideX - 0.012, sideY, -0.12, g);
  screw(g, sideX - 0.0105, A - 0.04, -0.05, '-x', 0.002); screw(g, sideX - 0.0105, A - 0.04, -0.1, '-x', 0.002);
  // the mount's offset bracket: a stepped plate that kicks the scope out over the receiver, with its recoil stop
  P(rb(0.004, 0.03, 0.05, 0.0015), M, sideX - 0.0115, A - 0.034, -0.075, g);
  P(rb(0.016, 0.006, 0.02, 0.002), M, sideX + 0.001, sideY + 0.012, -0.03, g);
  // illumination window on the left of the turret housing (frosted, in a raised frame) with its lamp switch
  P(rb(0.003, 0.014, 0.018, 0.001), M, -0.0185, A + 0.006, -0.04, g);
  P(box(0.0008, 0.0095, 0.013), GM.glass, -0.0202, A + 0.006, -0.04, g);
  P(box(0.0006, 0.0095, 0.013), GM.white, -0.0199, A + 0.006, -0.04, g);
  P(xc(0.0032, 0.004, 10), GM.steel, -0.0195, A - 0.008, -0.075, g);
  decal(g, 'pso', -0.0167, A, 0.03, 0.0034, '-x');
  return { h: A, eye: 0.112, relief: 0.068, z: -0.07 };
}

// ---------- AWM ----------
function buildAWM(mods) {
  const g = new THREE.Group(), out = { group: g }, B = 0.062, C = GM.odg;
  // receiver: round action with the ejection port and bolt slot on the right, scope rail on top
  P(lathe([[0, -0.177], [0.0195, -0.177], [0.0201, -0.171], [0.0201, 0.07], [0.0186, 0.077], [0, 0.077]], 40), GM.blk, 0, B, 0, g);
  P(zc(0.0212, 0.012, 40), GM.blk, 0, B, -0.165, g);   // recoil lug ring
  P(rb(0.005, 0.014, 0.078, 0.0016), GM.dark, 0.0178, B + 0.006, -0.035, g);
  P(rb(0.005, 0.011, 0.024, 0.0016), GM.dark, 0.0182, B - 0.002, 0.058, g);
  P(rb(0.025, 0.008, 0.246, 0.002), GM.blk, 0, B + 0.0175, -0.05, g);
  const rT = rail(g, 0.24, B + 0.021, -0.05);
  [-0.15, -0.05, 0.04].forEach(z => [-1, 1].forEach(s => screw(g, s * 0.0127, B + 0.0175, z, s > 0 ? 'x' : '-x', 0.0017)));
  // bolt (animated): body, shroud, handle angled down and back with a big black knob
  const bolt = new THREE.Group(); bolt.position.set(0, B, 0); g.add(bolt);
  P(zc(0.0098, 0.21, 20), GM.steel, 0, 0, -0.035, bolt);
  for (let i = 0; i < 3; i++) P(zc(0.0099, 0.0015, 20), GM.dark, 0, 0, -0.08 + i * 0.03, bolt);
  P(lathe([[0, 0.074], [0.0168, 0.074], [0.0172, 0.08], [0.0172, 0.108], [0.0145, 0.12], [0.006, 0.124], [0, 0.124]], 32), GM.blk, 0, 0, 0, bolt);
  P(zc(0.0035, 0.008, 10), GM.steel, 0, 0, 0.127, bolt);   // cocking indicator
  P(zc(0.0125, 0.022, 20), GM.steel, 0, 0, 0.064, bolt);
  rod(bolt, [0.012, 0, 0.064], [0.056, -0.02, 0.085], 0.0048, GM.steel, 12);
  P(sph(0.0118, 18, 14), GM.poly, 0.061, -0.0225, 0.088, bolt);
  out.boltKnob = marker(bolt, 0.061, -0.0225, 0.088, 'knob');
  // safety lever behind the bolt
  P(rb(0.004, 0.008, 0.02, 0.0015), GM.blk, 0.019, B - 0.014, 0.1, g, 0.4);
  // stock: forend and action section (wide), grip/thumbhole frame (narrow), folding hinge, butt
  P(profileGeo([[-0.428, 0.042], [-0.17, 0.05], [-0.16, 0.06], [0.03, 0.06], [0.045, 0.047], [0.045, -0.012], [-0.05, -0.012], [-0.14, -0.014], [-0.25, -0.008], [-0.4, 0.0], [-0.428, 0.016]], 0.066, 0.008), C, 0, 0, 0, g);
  P(box(0.03, 0.002, 0.255), GM.dark, 0, 0.0505, -0.3, g);   // free-float barrel channel
  for (let i = 0; i < 3; i++) [-1, 1].forEach(s => P(rb(0.003, 0.022, 0.05, 0.002), GM.odgD, s * 0.0322, 0.02, -0.235 - i * 0.065, g));   // forend recesses
  decal(g, 'awm', -0.0332, 0.031, -0.07, 0.0048, '-x'); decal(g, 'awmS', -0.0332, 0.041, -0.1, 0.0034, '-x');
  [[-0.11, 0.022], [-0.02, 0.022], [-0.36, 0.022]].forEach(([z, y]) => [-1, 1].forEach(s => screw(g, s * 0.033, y, z, s > 0 ? 'x' : '-x', 0.0028)));
  P(profileGeo([[0.035, 0.047], [0.185, 0.045], [0.19, -0.088], [0.14, -0.12], [0.114, -0.143], [0.07, -0.143], [0.061, -0.128], [0.046, -0.07], [0.041, -0.03], [0.035, -0.012]], 0.036, 0.008,
    [[[0.09, 0.024], [0.084, -0.03], [0.098, -0.105], [0.118, -0.112], [0.166, -0.078], [0.171, 0.0], [0.161, 0.026]]]), C, 0, 0, 0, g);
  for (let i = 0; i < 5; i++) [-1, 1].forEach(s => P(box(0.001, 0.003, 0.03), GM.dark, s * 0.0182, -0.07 - i * 0.012, 0.075 + i * 0.006, g, 0.45));   // grip texture ribs
  P(rb(0.04, 0.136, 0.016, 0.004), GM.blk, 0, -0.021, 0.197, g);
  P(yc(0.0065, 0.13, 16), GM.blk, -0.021, -0.021, 0.197, g);
  for (let i = 0; i < 4; i++) P(yc(0.0068, 0.002, 16), GM.dark, -0.021, -0.07 + i * 0.033, 0.197, g);
  P(xc(0.005, 0.006, 14), GM.steel, 0.022, 0.02, 0.197, g);   // fold latch button
  P(profileGeo([[0.205, 0.045], [0.43, 0.054], [0.433, -0.108], [0.405, -0.118], [0.3, -0.104], [0.205, -0.088]], 0.046, 0.008,
    [[[0.24, -0.058], [0.36, -0.078], [0.375, -0.07], [0.378, -0.026], [0.362, -0.014], [0.25, -0.012], [0.238, -0.025]]]), C, 0, 0, 0, g);
  // adjustable cheek piece on two posts, with its clamp knob
  P(rb(0.044, 0.016, 0.15, 0.006), C, 0, 0.065, 0.32, g);
  [0.27, 0.37].forEach(z => P(yc(0.004, 0.014, 12), GM.steel, 0, 0.053, z, g));
  P(xc(0.004, 0.012, 12), GM.steel, -0.026, 0.03, 0.32, g); P(grooveX(0.0085, 0.01, 20, 0.0008), GM.blk, -0.034, 0.03, 0.32, g);
  // spacers + recoil pad
  P(rb(0.047, 0.164, 0.008, 0.002), GM.blk, 0, -0.027, 0.437, g);
  P(rb(0.05, 0.172, 0.022, 0.008), GM.rubber, 0, -0.028, 0.452, g);
  for (let i = 0; i < 6; i++) P(box(0.051, 0.002, 0.012), GM.dark, 0, 0.03 - i * 0.022, 0.454, g);
  // retracted monopod spike under the butt, sling cup
  P(rb(0.022, 0.012, 0.03, 0.003), GM.blk, 0, -0.113, 0.39, g);
  P(yc(0.0055, 0.04, 12), GM.steel, 0, -0.13, 0.39, g);
  P(grooveCyl(0.0095, 0.014, 20, 0.0009), GM.blk, 0, -0.145, 0.39, g);
  P(yc(0.0055, 0.004, 14), GM.dark, 0, -0.1025, 0.335, g); P(new THREE.TorusGeometry(0.0055, 0.0012, 6, 16), GM.blk, 0, -0.103, 0.335, g, Math.PI / 2);
  // trigger guard and trigger
  P(profileGeo([[-0.048, -0.011], [0.042, -0.011], [0.042, -0.022], [0.034, -0.054], [-0.03, -0.054], [-0.048, -0.032]], 0.012, 0.0025,
    [[[-0.038, -0.018], [0.034, -0.018], [0.027, -0.046], [-0.026, -0.046], [-0.038, -0.03]]]), GM.blk, 0, 0, 0, g);
  P(profileGeo([[-0.003, -0.011], [0.004, -0.011], [0.006, -0.026], [0.003, -0.036], [-0.002, -0.037], [-0.001, -0.026]], 0.006, 0.0015), GM.steel, 0, 0, 0, g);
  // magazine (animated) and release paddle
  const mag = new THREE.Group(); g.add(mag);
  P(rb(0.03, 0.058, 0.086, 0.003), GM.blk, 0, -0.025, -0.095, mag);
  [-1, 1].forEach(s => P(rb(0.002, 0.036, 0.06, 0.001), GM.park, s * 0.0152, -0.03, -0.095, mag));
  P(rb(0.036, 0.007, 0.092, 0.002), GM.blk, 0, -0.056, -0.095, mag);
  P(new THREE.CylinderGeometry(0.0055, 0.0055, 0.06, 12).rotateX(Math.PI / 2), GM.brass, 0, 0.006, -0.095, mag);   // top round
  P(rb(0.016, 0.014, 0.006, 0.002), GM.blk, 0, -0.018, -0.142, g, -0.3);
  // barrel: chamber taper, fluted section, plain muzzle end
  P(lathe([[0.0125, -0.27], [0.0146, -0.245], [0.0146, -0.17]], 32), GM.barrel, 0, B, 0, g);
  P(grooveZ(0.0125, 0.53, 6, 0.0028, 0.55, 0.03), GM.barrel, 0, B, -0.535, g);
  P(zc(0.0112, 0.032, 24), GM.barrel, 0, B, -0.816, g);
  let tip = -0.832;
  if (mods.muzzle === 'brake') tip = brakePorted(g, B, tip, 0.0158, 0.078, 3);
  else if (mods.muzzle === 'supp') tip = suppressor(g, B, tip, 0.0215, 0.2);
  else tip = crown(g, B, tip, 0.0112);
  // sling stud / bipod under the forend
  if (mods.under === 'bipod') bipodFold(g, -0.002, -0.375, 0.03, 0.2); else slingStud(g, -0.002, -0.385);
  const o = buildOptic(mods.optic, g, rT, -0.06);
  out.mag = mag; out.bolt = bolt;
  out.grip = marker(g, 0, -0.065, 0.078, 'grip'); out.fore = marker(g, 0, -0.008, -0.3, 'fore');
  out.muzzle = marker(g, 0, B, tip - 0.003, 'muzzle'); out.eject = marker(g, 0.022, B + 0.006, -0.03, 'eject');
  out.stockZ = 0.463; out.magWell = new V3(0, -0.012, -0.095); out.boreY = B;
  out.opt = o; return out;
}

// ---------- Barrett M82A1 ----------
function brakeArrow(g, y, z0) {
  // the iconic double-chamber arrowhead: top and bottom plates, chevron baffles between them, big side windows
  const M = GM.park;
  P(zc(0.0215, 0.026, 28), M, 0, y, z0 - 0.013, g);
  P(grooveZ(0.0232, 0.012, 24, 0.0016, 0.45), M, 0, y, z0 - 0.007, g);   // lock nut
  const zr = z0 - 0.026, L = 0.12;
  const outl = [[0.024, zr], [0.046, zr - 0.012], [0.047, zr - 0.036], [0.03, zr - L + 0.006], [0.022, zr - L], [-0.022, zr - L], [-0.03, zr - L + 0.006], [-0.047, zr - 0.036], [-0.046, zr - 0.012], [-0.024, zr]];
  [-1, 1].forEach(s => P(topG(outl, 0.008, 0.0016), M, 0, y + s * 0.0225, 0, g));
  const H = 0.038;
  P(rb(0.05, H, 0.009, 0.002), M, 0, y, zr - 0.006, g);   // rear wall
  const vWall = (za, Lh, a) => [-1, 1].forEach(s => P(rb(Lh, H, 0.0085, 0.002), M, s * Lh / 2 * Math.cos(a), y, za + Lh / 2 * Math.sin(a), g, 0, -s * a, 0));
  vWall(zr - 0.068, 0.05, 0.5);
  vWall(zr - L + 0.004, 0.032, 0.42);
  P(zc(0.016, 0.02, 20), GM.dark, 0, y, zr - 0.066, g);   // bore through the middle baffle
  P(new THREE.CircleGeometry(0.0105, 20), GM.dark, 0, y, zr - L - 0.0005, g, 0, Math.PI, 0);
  [-1, 1].forEach(s => screw(g, 0, y + s * 0.0265, zr - 0.02, s > 0 ? 'y' : '-y', 0.0025));
  return zr - L;
}
function buildM82(mods) {
  const g = new THREE.Group(), out = { group: g }, B = 0.082, M = GM.park;
  // upper receiver: pressed-steel box with chamfered top edges, two stamped stiffening ribs down each side of the rear
  // half, a perforated front shroud the barrel recoils inside, and a seam where it sits on the lower receiver
  const upX = [[-0.032, 0.035], [0.032, 0.035], [0.032, 0.106], [0.0255, 0.1175], [-0.0255, 0.1175], [-0.032, 0.106]];
  P(xsec(upX, 0.6, 0.002), M, 0, 0, 0.1, g);
  P(rb(0.0605, 0.004, 0.62, 0.001), GM.dark, 0, 0.0352, 0.1, g);   // upper / lower split line
  [-1, 1].forEach(s => {
    [0.058, 0.088].forEach(y => P(rb(0.004, 0.0055, 0.37, 0.002), M, s * 0.032, y, 0.035, g));   // stamped ribs
    P(rb(0.003, 0.0035, 0.07, 0.0012), M, s * 0.032, 0.073, 0.29, g);                              // short rib at the butt
    for (let i = 0; i < 9; i++) P(xc(0.0026, 0.002, 10), GM.steel, s * 0.0322, 0.044, -0.16 + i * 0.065, g);   // rivets
    for (let i = 0; i < 4; i++) P(xc(0.0024, 0.002, 10), GM.steel, s * 0.0322, 0.0995, -0.52 + i * 0.1, g);
    // front shroud side plates with the big cooling holes, a row of small ones above
    const holes = [-0.235, -0.315, -0.395, -0.475].map(z => ellipse(z, 0.072, 0.03, 0.018, 18)).concat([-0.255, -0.335, -0.415, -0.495].map(z => ellipse(z, 0.099, 0.0045, 0.0045, 10)));
    P(profileGeo([[-0.545, 0.1065], [-0.2, 0.1065], [-0.2, 0.035], [-0.545, 0.035]], 0.005, 0.0012, holes), M, s * 0.0298, 0, 0, g);
    P(xsec([[s * 0.0215, 0.1175], [s * 0.0255, 0.1175], [s * 0.032, 0.106], [s * 0.0272, 0.106]], 0.345, 0.0008), M, 0, 0, -0.3725, g);   // chamfer strips
  });
  // shroud top plate pierced with a line of holes, bottom plate plain
  P(topG([[-0.0225, -0.545], [0.0225, -0.545], [0.0225, -0.2], [-0.0225, -0.2]], 0.005, 0.001, [-0.25, -0.31, -0.37, -0.43, -0.49].map(z => ellipse(0, z, 0.011, 0.018, 14))), M, 0, 0.1155, 0, g);
  P(rb(0.064, 0.007, 0.345, 0.002), M, 0, 0.0385, -0.372, g);
  P(rb(0.066, 0.082, 0.014, 0.004), M, 0, 0.0765, -0.54, g);   // barrel bushing / front plate
  P(zc(0.0185, 0.012, 28), GM.blk, 0, B, -0.552, g);
  P(grooveZ(0.019, 0.006, 24, 0.0012, 0.5), GM.blk, 0, B, -0.552, g);
  // barrel spring housing: the recoil buffer collar at the front of the closed receiver, twin springs on guide rods
  // either side of the barrel, seen through the shroud holes
  P(lathe([[0.0195, -0.245], [0.025, -0.24], [0.025, -0.205], [0.028, -0.2], [0.028, -0.19]], 32), GM.blk, 0, B, 0, g);
  for (let i = 0; i < 3; i++) P(zc(0.0253, 0.0015, 32), GM.dark, 0, B, -0.236 + i * 0.012, g);
  [-1, 1].forEach(s => {
    P(zc(0.0028, 0.3, 10), GM.steel, s * 0.017, B - 0.022, -0.39, g);
    P(helixZ(0.0052, 0.28, 22, 0.001), GM.steel, s * 0.017, B - 0.022, -0.25, g);
    P(rb(0.012, 0.012, 0.01, 0.002), GM.blk, s * 0.017, B - 0.022, -0.53, g);
  });
  [-0.12, 0.33].forEach(z => { P(xc(0.0048, 0.069, 14), GM.steel, 0, 0.042, z, g); P(xc(0.0068, 0.067, 16), GM.blk, 0, 0.042, z, g); });   // takedown pins with heads
  decal(g, 'm82', -0.0322, 0.074, 0.1, 0.0062, '-x'); decal(g, 'm82S', -0.0322, 0.0665, 0.065, 0.0042, '-x');
  // barrel: thick section seen through the shroud, fluted forward of the receiver
  P(zc(0.0195, 0.36, 28), GM.barrel, 0, B, -0.37, g);
  P(grooveZ(0.0182, 0.4, 6, 0.0026, 0.5, 0.035), GM.barrel, 0, B, -0.756, g);
  P(zc(0.0165, 0.02, 28), GM.barrel, 0, B, -0.965, g);
  let tip = -0.975;
  if (mods.muzzle === 'supp') tip = suppressor(g, B, tip, 0.028, 0.26, GM.park);
  else tip = brakeArrow(g, B, tip);
  // top rail and the folding carry handle
  const rT = rail(g, 0.48, 0.118, -0.04);
  [-0.43, -0.335].forEach(z => P(rb(0.016, 0.01, 0.016, 0.003), GM.blk, 0, 0.123, z, g));
  rod(g, [0, 0.124, -0.43], [0, 0.166, -0.415], 0.0055, GM.blk); rod(g, [0, 0.124, -0.335], [0, 0.166, -0.35], 0.0055, GM.blk);
  P(zc(0.0085, 0.072, 18), GM.rubber, 0, 0.169, -0.3825, g);
  for (let i = 0; i < 6; i++) P(zc(0.0088, 0.002, 18), GM.dark, 0, 0.169, -0.408 + i * 0.01, g);
  // ejection port, charging handle (animated) and its slot on the right
  P(rb(0.004, 0.026, 0.08, 0.002), GM.dark, 0.0315, 0.078, -0.09, g);
  P(box(0.002, 0.008, 0.16), GM.dark, 0.0322, 0.096, 0.03, g);
  const ch = new THREE.Group(); g.add(ch);
  P(rb(0.008, 0.016, 0.03, 0.002), GM.blk, 0.035, 0.096, -0.02, ch);
  P(rb(0.03, 0.01, 0.012, 0.003), GM.blk, 0.052, 0.096, -0.02, ch);
  P(yc(0.0085, 0.022, 16), GM.poly, 0.066, 0.096, -0.02, ch);
  // cheek pad, buttpad, rear monopod
  // cheek rest: a domed polymer pad, ribbed across, on a raised step, held by two cap screws
  P(xsec(smoothPts([[-0.028, 0], [0.028, 0], [0.027, 0.008], [0.017, 0.0145], [0, 0.0165], [-0.017, 0.0145], [-0.027, 0.008]], 3), 0.15, 0.004), GM.poly, 0, 0.1175, 0.315, g);
  for (let i = 0; i < 6; i++) P(box(0.024, 0.0014, 0.003), GM.dark, 0, 0.1336, 0.27 + i * 0.016, g);
  P(rb(0.062, 0.006, 0.012, 0.002), M, 0, 0.12, 0.234, g);
  [-1, 1].forEach(s => screw(g, s * 0.021, 0.1235, 0.234, 'y', 0.0024));
  P(rb(0.068, 0.192, 0.04, 0.014), GM.rubber, 0, 0.022, 0.42, g);
  for (let i = 0; i < 7; i++) P(box(0.069, 0.003, 0.03), GM.dark, 0, 0.1 - i * 0.026, 0.424, g);
  // lower receiver: magwell, trigger housing, sloping into the butt
  P(profileGeo([[-0.175, 0.036], [0.4, 0.036], [0.4, -0.066], [0.34, -0.07], [0.24, -0.032], [0.11, -0.014], [-0.04, -0.014], [-0.04, -0.006], [-0.175, -0.006]], 0.058, 0.005), GM.blk, 0, 0, 0, g);
  P(rb(0.062, 0.006, 0.142, 0.002), GM.blk, 0, -0.006, -0.105, g);
  P(rb(0.024, 0.02, 0.03, 0.003), GM.blk, 0, -0.078, 0.36, g);
  P(yc(0.0075, 0.04, 14), GM.steel, 0, -0.098, 0.36, g);
  P(grooveCyl(0.0125, 0.014, 22, 0.001), GM.blk, 0, -0.112, 0.36, g);
  P(rb(0.03, 0.006, 0.03, 0.002), GM.rubber, 0, -0.122, 0.36, g);
  P(profileGeo([[-0.04, -0.012], [0.045, -0.012], [0.045, -0.024], [0.035, -0.056], [-0.03, -0.056], [-0.04, -0.034]], 0.014, 0.0025,
    [[[-0.031, -0.019], [0.036, -0.019], [0.029, -0.048], [-0.024, -0.048], [-0.031, -0.032]]]), GM.blk, 0, 0, 0, g);
  P(profileGeo([[-0.003, -0.012], [0.004, -0.012], [0.006, -0.027], [0.003, -0.038], [-0.002, -0.039], [-0.001, -0.027]], 0.006, 0.0015), GM.steel, 0, 0, 0, g);
  P(profileGeo([[0.037, -0.012], [0.075, -0.012], [0.113, -0.118], [0.105, -0.132], [0.069, -0.134], [0.06, -0.111], [0.053, -0.091], [0.045, -0.071], [0.028, -0.032]], 0.032, 0.006), GM.poly, 0, 0, 0, g);
  for (let i = 0; i < 6; i++) [-1, 1].forEach(s => P(box(0.001, 0.003, 0.028), GM.dark, s * 0.0162, -0.05 - i * 0.012, 0.075 + i * 0.0045, g, 0.35));
  P(xc(0.0065, 0.004, 16), GM.blk, -0.03, 0.012, 0.055, g); P(rb(0.003, 0.006, 0.02, 0.001), GM.blk, -0.0325, 0.012, 0.062, g, 0.5);   // selector
  P(xc(0.005, 0.004, 14), GM.steel, 0.03, 0.006, -0.025, g);   // mag release
  // magazine (animated): 10 rounds of .50 BMG
  const mag = new THREE.Group(); g.add(mag);
  P(rb(0.044, 0.096, 0.13, 0.004), GM.blk, 0, -0.042, -0.105, mag);
  [-1, 1].forEach(s => [-0.03, -0.06].forEach(y => P(rb(0.002, 0.005, 0.11, 0.001), GM.blk, s * 0.0222, y, -0.105, mag)));
  P(rb(0.048, 0.008, 0.136, 0.003), GM.blk, 0, -0.092, -0.105, mag);
  P(new THREE.CylinderGeometry(0.0065, 0.0065, 0.1, 12).rotateX(Math.PI / 2), GM.brass, 0, 0.012, -0.105, mag);
  // bipod on the front of the receiver, legs folded forward under the barrel
  if (mods.under === 'bipod') {
    P(rb(0.072, 0.016, 0.034, 0.004), GM.blk, 0, 0.032, -0.51, g);
    P(xc(0.0065, 0.086, 16), GM.steel, 0, 0.024, -0.51, g);
    [-1, 1].forEach(s => {
      rod(g, [s * 0.036, 0.024, -0.51], [s * 0.03, 0.04, -0.84], 0.0068, GM.blk, 12);
      rod(g, [s * 0.031, 0.037, -0.79], [s * 0.029, 0.041, -0.86], 0.0052, GM.steel, 10);
      P(rb(0.032, 0.006, 0.05, 0.002), GM.blk, s * 0.034, 0.044, -0.88, g, 0, 0, s * 0.3);
      P(rb(0.012, 0.012, 0.016, 0.002), GM.blk, s * 0.038, 0.026, -0.535, g);
      P(xc(0.003, 0.012, 10), GM.steel, s * 0.036, 0.034, -0.7, g);   // leg lock pin
    });
  }
  const o = buildOptic(mods.optic, g, rT, -0.04);
  out.mag = mag; out.ch = ch;
  out.grip = marker(g, 0, -0.07, 0.085, 'grip'); out.fore = marker(g, 0, 0.03, -0.3, 'fore');
  out.muzzle = marker(g, 0, B, tip - 0.003, 'muzzle'); out.eject = marker(g, 0.034, 0.078, -0.09, 'eject');
  out.stockZ = 0.44; out.magWell = new V3(0, -0.006, -0.105); out.boreY = B;
  out.opt = o; return out;
}

// ---------- Dragunov SVD ----------
function flashSVD(g, y, z0) {
  // long slotted flash hider: five prongs around a dark core, slanted front ring
  const L = 0.078, R = 0.0125, M = GM.blued;
  P(zc(R, 0.016, 24), M, 0, y, z0 - 0.008, g);
  P(zc(R * 0.55, L, 14), GM.dark, 0, y, z0 - L / 2, g);
  for (let i = 0; i < 5; i++) { const a = i / 5 * TAU + Math.PI / 2; P(rb(0.0058, 0.0042, L - 0.024, 0.0012), M, Math.cos(a) * R * 0.82, y + Math.sin(a) * R * 0.82, z0 - 0.016 - (L - 0.024) / 2, g, 0, 0, a); }
  P(zc(R, 0.009, 24), M, 0, y, z0 - L + 0.0045, g, 0.1);
  return z0 - L;
}
function buildSVD(mods) {
  const g = new THREE.Group(), out = { group: g }, B = 0.045, M = GM.blued, W = GM.svdWood;
  // stamped receiver, dust cover, rear tang
  P(rb(0.044, 0.056, 0.245, 0.004), M, 0, 0.028, -0.065, g);
  const dc = new THREE.CylinderGeometry(0.0222, 0.0222, 0.2, 24, 1, false, Math.PI / 2, Math.PI); dc.rotateX(Math.PI / 2);
  P(dc, M, 0, 0.056, -0.06, g);
  P(rb(0.012, 0.012, 0.014, 0.003), M, 0, 0.072, 0.045, g);   // dust cover latch
  for (let i = 0; i < 3; i++) P(box(0.045, 0.002, 0.004), GM.dark, 0, 0.06, 0.02 - i * 0.012, g);
  P(rb(0.036, 0.042, 0.02, 0.004), M, 0, 0.032, 0.062, g);
  decal(g, 'svd', -0.0221, 0.012, -0.075, 0.0048, '-x'); decal(g, 'svdS', -0.0221, 0.016, 0.03, 0.0062, '-x');
  // left side dovetail for the optic mount
  P(rb(0.006, 0.014, 0.125, 0.0015), M, -0.024, 0.032, -0.09, g);
  [-1, 1].forEach(s => P(box(0.0062, 0.0012, 0.125), GM.dark, -0.024, 0.032 + s * 0.004, -0.09, g));
  // right side: safety lever, ejection port, charging handle (animated)
  P(profileGeo([[-0.16, 0.046], [-0.005, 0.046], [-0.005, 0.032], [-0.13, 0.032], [-0.158, 0.02], [-0.17, 0.026]], 0.003, 0.001), M, 0.0235, 0, 0, g);
  P(rb(0.004, 0.012, 0.055, 0.0015), GM.dark, 0.021, 0.051, -0.085, g);
  P(box(0.002, 0.007, 0.12), GM.dark, 0.0222, 0.05, -0.1, g);
  const ch = new THREE.Group(); g.add(ch);
  P(rb(0.022, 0.008, 0.013, 0.002), M, 0.032, 0.05, -0.05, ch);
  P(sph(0.0072, 12, 10), M, 0.045, 0.05, -0.05, ch);
  for (let i = 0; i < 3; i++) P(box(0.002, 0.0145, 0.0035), GM.dark, 0.046 + i * 0.0025 - 0.0025, 0.05, -0.05, ch);
  // trigger guard, trigger, mag release
  P(profileGeo([[-0.05, 0.0], [0.03, 0.0], [0.03, -0.012], [0.022, -0.042], [-0.034, -0.042], [-0.05, -0.016]], 0.012, 0.0025,
    [[[-0.04, -0.006], [0.022, -0.006], [0.016, -0.034], [-0.03, -0.034], [-0.04, -0.016]]]), M, 0, 0, 0, g);
  P(profileGeo([[-0.003, 0.0], [0.004, 0.0], [0.006, -0.017], [0.003, -0.027], [-0.002, -0.028], [-0.001, -0.017]], 0.006, 0.0015), GM.steel, 0, 0, 0, g);
  P(rb(0.018, 0.005, 0.012, 0.0015), M, 0, -0.006, -0.031, g, 0.4);
  // skeleton thumbhole stock in laminated birch, cheek rest, slotted butt plate, sling swivel
  P(profileGeo([[0.058, 0.05], [0.13, 0.051], [0.415, 0.048], [0.426, 0.04], [0.43, -0.118], [0.42, -0.132], [0.405, -0.136], [0.36, -0.124], [0.2, -0.094], [0.152, -0.088], [0.138, -0.1], [0.124, -0.132], [0.114, -0.14], [0.086, -0.14], [0.076, -0.132], [0.056, -0.06], [0.046, -0.022], [0.044, -0.006], [0.05, 0.0], [0.058, 0.0]], 0.04, 0.008,
    [smoothPts([[0.112, 0.014], [0.106, -0.022], [0.118, -0.058], [0.14, -0.068], [0.2, -0.072], [0.34, -0.1], [0.362, -0.094], [0.37, -0.06], [0.368, 0.004], [0.356, 0.018], [0.2, 0.02]], 3)]), W, 0, 0, 0, g);
  P(rb(0.007, 0.03, 0.13, 0.003), GM.rubber, -0.022, 0.032, 0.25, g);
  P(rb(0.016, 0.008, 0.13, 0.004), GM.rubber, -0.013, 0.053, 0.25, g);
  [-1, 1].forEach(s => P(rb(0.004, 0.008, 0.008, 0.001), M, -0.0255, 0.032 + s * 0.01, 0.25 + s * 0.05, g));   // cheek rest clips
  P(rb(0.042, 0.165, 0.008, 0.002), M, 0, -0.042, 0.432, g);
  for (let i = 0; i < 6; i++) P(box(0.03, 0.003, 0.009), GM.dark, 0, 0.02 - i * 0.022, 0.433, g);
  P(new THREE.TorusGeometry(0.008, 0.0016, 6, 16), GM.steel, 0, -0.134, 0.38, g, 0, Math.PI / 2, 0);
  P(rb(0.008, 0.006, 0.02, 0.002), M, 0, -0.125, 0.38, g);
  // handguard with slanted vent slots, metal retainers
  P(rboxGeo(0.05, 0.05, 0.25, 0.02, 5), W, 0, 0.042, -0.335, g);
  for (let i = 0; i < 6; i++) [-1, 1].forEach(s => P(rb(0.004, 0.028, 0.008, 0.002), GM.dark, s * 0.0236, 0.044, -0.245 - i * 0.034, g, -0.4));
  P(box(0.0505, 0.0012, 0.25), GM.dark, 0, 0.044, -0.335, g);   // split line between the halves
  [-0.208, -0.462].forEach(z => P(rb(0.054, 0.054, 0.012, 0.012), M, 0, 0.042, z, g));
  // gas block with regulator, barrel, front sight, bayonet lug
  P(rb(0.028, 0.044, 0.04, 0.004), M, 0, 0.058, -0.488, g);
  P(zc(0.0095, 0.03, 16), M, 0, 0.072, -0.52, g);
  P(xc(0.004, 0.032, 10), GM.steel, 0, 0.074, -0.528, g);
  P(new THREE.TorusGeometry(0.0075, 0.0016, 6, 16), GM.steel, 0, 0.03, -0.49, g, 0, Math.PI / 2, 0);   // front sling swivel
  P(zc(0.0098, 0.56, 20), M, 0, B, -0.47, g);
  P(rb(0.022, 0.026, 0.03, 0.003), M, 0, 0.058, -0.712, g);
  [-1, 1].forEach(s => P(box(0.004, 0.026, 0.018), M, s * 0.0095, 0.078, -0.712, g));
  P(box(0.0025, 0.018, 0.0025), M, 0, 0.076, -0.712, g);
  P(rb(0.012, 0.012, 0.032, 0.002), M, 0, 0.027, -0.705, g);
  let tip = -0.75;
  if (mods.muzzle === 'supp') tip = suppressor(g, B, tip, 0.022, 0.21, GM.blk);
  else tip = flashSVD(g, B, tip);
  // magazine (animated): slightly curved 10-rounder with stamped ribs
  const mag = new THREE.Group(); g.add(mag);
  P(profileGeo(smoothPts([[-0.032, 0.001], [-0.118, 0.001], [-0.124, -0.05], [-0.134, -0.104], [-0.13, -0.114], [-0.054, -0.114], [-0.046, -0.06], [-0.034, -0.02]], 3), 0.026, 0.003), GM.blk, 0, 0, 0, mag);
  for (let i = 0; i < 3; i++) [-1, 1].forEach(s => P(rb(0.002, 0.005, 0.07, 0.001), GM.blk, s * 0.013, -0.03 - i * 0.026, -0.082 - i * 0.004, mag, -0.08));
  P(rb(0.03, 0.007, 0.084, 0.002), GM.blk, 0, -0.114, -0.092, mag, -0.08);
  // optic: PSO-1 on its own mount, anything else on a side mount with a Picatinny top
  let o;
  if (mods.optic === 'pso') o = buildPSO(g, 0.112, -0.024, 0.032);
  else {
    P(rb(0.009, 0.064, 0.11, 0.003), M, -0.03, 0.062, -0.08, g);
    P(rb(0.012, 0.02, 0.11, 0.003), M, -0.028, 0.032, -0.08, g);
    P(rb(0.042, 0.008, 0.12, 0.002), M, -0.008, 0.094, -0.08, g);
    rod(g, [-0.035, 0.034, -0.035], [-0.039, 0.064, 0.0], 0.0028, M, 8);
    o = buildOptic(mods.optic, g, rail(g, 0.11, 0.098, -0.08), -0.08);
  }
  out.mag = mag; out.ch = ch;
  out.grip = marker(g, 0, -0.06, 0.082, 'grip'); out.fore = marker(g, 0, 0.014, -0.33, 'fore');
  out.muzzle = marker(g, 0, B, tip - 0.003, 'muzzle'); out.eject = marker(g, 0.024, 0.05, -0.085, 'eject');
  out.stockZ = 0.436; out.magWell = new V3(0, -0.004, -0.076); out.boreY = B;
  out.opt = o; return out;
}

// ---------- CheyTac M200 Intervention ----------
function buildM200(mods) {
  const g = new THREE.Group(), out = { group: g }, B = 0.066, M = GM.blk;
  // chassis with milled side panels, round action on top
  P(profileGeo([[-0.222, 0.078], [0.098, 0.078], [0.104, 0.06], [0.104, 0.0], [0.045, -0.008], [-0.04, -0.008], [-0.04, -0.006], [-0.185, -0.006], [-0.222, 0.02]], 0.058, 0.004), M, 0, 0, 0, g);
  [-1, 1].forEach(s => { P(rb(0.002, 0.032, 0.13, 0.0008), GM.barrel, s * 0.0291, 0.04, -0.09, g); P(rb(0.002, 0.024, 0.05, 0.0008), GM.barrel, s * 0.0291, 0.044, 0.05, g); });
  [[-0.18, 0.06], [-0.18, 0.015], [0.08, 0.06], [-0.01, 0.06]].forEach(([z, y]) => [-1, 1].forEach(s => screw(g, s * 0.0292, y, z, s > 0 ? 'x' : '-x', 0.0022)));
  P(lathe([[0, -0.215], [0.0205, -0.215], [0.0205, 0.094], [0.016, 0.1], [0, 0.1]], 40), GM.blk, 0, B, 0, g);
  P(rb(0.005, 0.014, 0.075, 0.0015), GM.dark, 0.0186, B + 0.006, -0.05, g);
  P(rb(0.005, 0.011, 0.026, 0.0015), GM.dark, 0.0188, B - 0.002, 0.07, g);
  P(xc(0.004, 0.006, 12), GM.steel, -0.03, 0.07, 0.07, g);   // bolt release
  decal(g, 'm200', -0.0302, 0.041, -0.09, 0.0045, '-x'); decal(g, 'm200S', -0.0292, 0.012, -0.09, 0.0034, '-x');
  // full-length top rail on a riser
  P(rb(0.026, 0.012, 0.31, 0.002), M, 0, 0.09, -0.06, g);
  const rT = rail(g, 0.69, 0.096, -0.255);
  // carbon handguard tube with vent ovals, end rings
  P(zc(0.032, 0.39, 40), GM.carbon, 0, B, -0.41, g);
  [-0.222, -0.6].forEach(z => P(zc(0.0338, 0.016, 40), M, 0, B, z, g));
  for (let i = 0; i < 5; i++) [-1, 1].forEach(s => P(rb(0.004, 0.012, 0.032, 0.004), GM.dark, s * 0.0315, B - 0.004, -0.275 - i * 0.065, g));
  P(new THREE.RingGeometry(0.0145, 0.033, 32), M, 0, B, -0.6085, g, 0, Math.PI, 0);
  // barrel, brake
  P(zc(0.0145, 0.03, 24), GM.barrel, 0, B, -0.62, g);
  P(grooveZ(0.0135, 0.31, 6, 0.003, 0.55, 0.025), GM.barrel, 0, B, -0.785, g);
  P(zc(0.012, 0.02, 24), GM.barrel, 0, B, -0.95, g);
  let tip = -0.96;
  if (mods.muzzle === 'brake') tip = brakePorted(g, B, tip, 0.0215, 0.105, 3);
  else if (mods.muzzle === 'supp') tip = suppressor(g, B, tip, 0.024, 0.22);
  else tip = crown(g, B, tip, 0.012);
  // bolt (animated)
  const bolt = new THREE.Group(); bolt.position.set(0, B, 0); g.add(bolt);
  P(zc(0.0105, 0.21, 20), GM.steel, 0, 0, -0.03, bolt);
  for (let i = 0; i < 4; i++) P(zc(0.0106, 0.0016, 20), GM.dark, 0, 0, -0.09 + i * 0.025, bolt);
  P(lathe([[0, 0.096], [0.0178, 0.096], [0.0182, 0.102], [0.0182, 0.122], [0.012, 0.13], [0, 0.131]], 32), M, 0, 0, 0, bolt);
  P(zc(0.0135, 0.024, 20), GM.steel, 0, 0, 0.074, bolt);
  rod(bolt, [0.012, 0, 0.074], [0.058, -0.026, 0.078], 0.005, GM.steel, 12);
  P(lathe([[0, -0.014], [0.009, -0.013], [0.0125, -0.006], [0.0125, 0.008], [0.009, 0.014], [0, 0.015]], 20), GM.poly, 0.064, -0.029, 0.078, bolt, 0, 0, 0);
  for (let i = 0; i < 4; i++) P(zc(0.0127, 0.0012, 20), GM.dark, 0.064, -0.029, 0.073 + i * 0.0035, bolt);
  out.boltKnob = marker(bolt, 0.064, -0.029, 0.078, 'knob');
  // trigger guard, trigger, vertical grip with finger grooves
  P(profileGeo([[-0.045, -0.008], [0.045, -0.008], [0.045, -0.02], [0.035, -0.056], [-0.03, -0.056], [-0.045, -0.03]], 0.014, 0.0025,
    [[[-0.036, -0.015], [0.036, -0.015], [0.028, -0.048], [-0.025, -0.048], [-0.036, -0.03]]]), M, 0, 0, 0, g);
  P(profileGeo([[-0.003, -0.008], [0.004, -0.008], [0.006, -0.024], [0.003, -0.035], [-0.002, -0.036], [-0.001, -0.024]], 0.006, 0.0015), GM.steel, 0, 0, 0, g);
  P(profileGeo(smoothPts([[0.036, -0.006], [0.086, -0.006], [0.096, -0.03], [0.1, -0.07], [0.104, -0.115], [0.098, -0.128], [0.058, -0.13], [0.052, -0.118], [0.05, -0.1], [0.044, -0.09], [0.047, -0.078], [0.04, -0.066], [0.043, -0.054], [0.037, -0.04], [0.035, -0.02]], 3), 0.034, 0.007), GM.poly, 0, 0, 0, g);
  for (let i = 0; i < 6; i++) [-1, 1].forEach(s => P(box(0.001, 0.003, 0.034), GM.dark, s * 0.0172, -0.04 - i * 0.013, 0.074 + i * 0.0015, g, 0.12));
  // retractable stock: two tubes, rear butt with pad and monopod, adjustable cheek piece
  P(rb(0.05, 0.1, 0.022, 0.004), M, 0, 0.028, 0.112, g);
  P(zc(0.011, 0.3, 24), M, 0, 0.05, 0.27, g);
  P(zc(0.009, 0.28, 20), M, 0, -0.008, 0.28, g);
  for (let i = 0; i < 8; i++) P(zc(0.0112, 0.0015, 24), GM.dark, 0, 0.05, 0.14 + i * 0.012, g);   // length detents
  P(profileGeo([[0.38, 0.078], [0.414, 0.078], [0.418, -0.104], [0.405, -0.112], [0.386, -0.104], [0.38, -0.03], [0.37, -0.02], [0.37, 0.068]], 0.044, 0.004), M, 0, 0, 0, g);
  [0.05, -0.008].forEach(y => P(rb(0.03, 0.028, 0.026, 0.004), M, 0, y, 0.365, g));
  P(rb(0.048, 0.188, 0.02, 0.007), GM.rubber, 0, -0.016, 0.428, g);
  for (let i = 0; i < 6; i++) P(box(0.049, 0.002, 0.012), GM.dark, 0, 0.05 - i * 0.025, 0.431, g);
  P(rb(0.022, 0.016, 0.026, 0.003), M, 0, -0.118, 0.395, g);
  P(yc(0.0065, 0.04, 14), GM.steel, 0, -0.14, 0.395, g);
  P(grooveCyl(0.011, 0.012, 22, 0.001), M, 0, -0.156, 0.395, g);
  P(profileGeo(smoothPts([[0.205, 0.072], [0.22, 0.088], [0.3, 0.094], [0.352, 0.09], [0.356, 0.072]], 4), 0.044, 0.008), GM.poly, 0, 0, 0, g);
  [0.225, 0.335].forEach(z => P(yc(0.0045, 0.012, 12), GM.steel, 0, 0.065, z, g));
  P(rb(0.004, 0.012, 0.03, 0.0015), M, -0.024, 0.07, 0.28, g, 0.3); P(sph(0.0045, 10, 8), M, -0.026, 0.078, 0.268, g);
  P(xc(0.0055, 0.006, 14), GM.steel, -0.026, 0.05, 0.118, g);   // stock release
  // magazine (animated): 7 rounds of .408
  const mag = new THREE.Group(); g.add(mag);
  P(rb(0.034, 0.072, 0.13, 0.004), M, 0, -0.033, -0.11, mag);
  [-1, 1].forEach(s => P(rb(0.002, 0.04, 0.1, 0.001), GM.barrel, s * 0.0172, -0.035, -0.11, mag));
  P(rb(0.038, 0.008, 0.136, 0.003), M, 0, -0.07, -0.11, mag);
  P(new THREE.CylinderGeometry(0.006, 0.006, 0.1, 12).rotateX(Math.PI / 2), GM.brass, 0, 0.009, -0.11, mag);
  // bipod under the front of the handguard
  P(rb(0.026, 0.01, 0.04, 0.002), M, 0, B - 0.036, -0.565, g);
  if (mods.under === 'bipod') bipodFold(g, B - 0.041, -0.565, 0.03, 0.19); else slingStud(g, B - 0.041, -0.565);
  const o = buildOptic(mods.optic, g, rT, -0.06);
  out.bolt = bolt; out.mag = mag;
  out.grip = marker(g, 0, -0.065, 0.075, 'grip'); out.fore = marker(g, 0, B - 0.034, -0.34, 'fore');
  out.muzzle = marker(g, 0, B, tip - 0.003, 'muzzle'); out.eject = marker(g, 0.022, B + 0.006, -0.05, 'eject');
  out.stockZ = 0.438; out.magWell = new V3(0, -0.006, -0.11); out.boreY = B;
  out.opt = o; return out;
}

// ---------- Desert Eagle ----------
function buildDeagle(mods) {
  const g = new THREE.Group(), out = { group: g }, B = 0.04, M = GM.de;
  // fixed barrel: round bore under the triangular top with its rail, polygonal muzzle face
  P(zc(0.0122, 0.156, 24), M, 0, B, -0.112, g);
  P(xsec([[-0.0172, 0.0], [0.0172, 0.0], [0.0172, 0.004], [0.0075, 0.0235], [-0.0075, 0.0235], [-0.0172, 0.004]], 0.156, 0.0012), M, 0, 0.041, -0.112, g);
  rail(g, 0.13, 0.064, -0.112, 0, M, 0.0125);
  P(new THREE.CircleGeometry(0.0062, 18), GM.dark, 0, B, -0.1905, g, 0, Math.PI, 0);
  P(rb(0.004, 0.0085, 0.008, 0.0012), GM.blk, 0, 0.0763, -0.182, g);   // front sight, top on the sight line
  P(box(0.0017, 0.0017, 0.001), GM.white, 0, 0.0782, -0.1778, g);
  // slide (animated): rear block with serrations, side walls running under the barrel, safety, rear sight
  const slide = new THREE.Group(); g.add(slide);
  P(rb(0.0345, 0.052, 0.1, 0.0035), M, 0, 0.038, 0.016, slide);
  P(rb(0.0345, 0.03, 0.156, 0.0025), M, 0, 0.027, -0.11, slide);
  [-1, 1].forEach(s => {
    for (let i = 0; i < 9; i++) P(box(0.0012, 0.034, 0.0022), GM.dark, s * 0.0172, 0.04, 0.03 + i * 0.0038, slide, 0, 0, 0);
    P(rb(0.004, 0.009, 0.016, 0.002), GM.blk, s * 0.019, 0.05, 0.058, slide);   // ambi safety
    P(box(0.0012, 0.006, 0.12), GM.dark, s * 0.0172, 0.019, -0.11, slide);       // lower groove
  });
  P(rb(0.004, 0.012, 0.05, 0.0015), GM.dark, 0.016, 0.054, -0.012, slide);       // ejection port
  decal(slide, 'de', -0.01725, 0.0305, -0.11, 0.0062, '-x'); decal(slide, 'deS', -0.01725, 0.0245, -0.112, 0.0032, '-x');
  decal(slide, 'de', 0.01725, 0.0305, -0.11, 0.0062, '+x');
  P(rb(0.02, 0.006, 0.016, 0.0015), GM.blk, 0, 0.067, 0.056, slide);           // rear sight base + blade with the notch
  P(rb(0.022, 0.012, 0.008, 0.0012), GM.blk, 0, 0.0745, 0.058, slide);
  P(box(0.0042, 0.0062, 0.0086), GM.dark, 0, 0.0778, 0.058, slide);
  [-1, 1].forEach(s => P(box(0.0016, 0.0016, 0.001), GM.white, s * 0.0058, 0.0768, 0.0621, slide));
  [-1, 1].forEach(s => P(zc(0.0025, 0.002, 10), GM.dark, s * 0.009, 0.02, -0.1885, slide));
  // frame: dust cover, receiver, trigger guard with the hooked front, trigger, grip, panels, hammer, controls
  P(rb(0.031, 0.016, 0.16, 0.003), M, 0, 0.004, -0.093, g);
  P(rb(0.031, 0.028, 0.095, 0.003), M, 0, 0.0, 0.03, g);
  P(profileGeo([[-0.062, 0.0], [-0.062, -0.026], [-0.066, -0.03], [-0.062, -0.036], [0.004, -0.036], [0.016, -0.012], [0.016, 0.0]], 0.012, 0.002,
    [[[-0.053, -0.005], [-0.003, -0.005], [-0.005, -0.028], [-0.05, -0.028]]]), M, 0, 0, 0, g);
  P(profileGeo([[-0.004, -0.003], [0.003, -0.003], [0.005, -0.016], [0.002, -0.025], [-0.003, -0.026], [-0.002, -0.016]], 0.006, 0.0015), GM.blk, 0, 0, 0, g);
  P(profileGeo([[0.004, 0.0], [0.074, 0.0], [0.09, 0.012], [0.097, 0.006], [0.091, -0.006], [0.115, -0.116], [0.111, -0.125], [0.063, -0.127], [0.057, -0.12], [0.022, -0.03], [0.016, -0.012]], 0.03, 0.004), M, 0, 0, 0, g);
  [-1, 1].forEach(s => {
    P(profileGeo([[0.026, -0.016], [0.082, -0.01], [0.106, -0.112], [0.063, -0.117]], 0.004, 0.0015), GM.grip, s * 0.0158, 0, 0, g);
    screw(g, s * 0.0178, -0.066, 0.077, s > 0 ? 'x' : '-x', 0.0024);
  });
  P(profileGeo([[0.064, 0.028], [0.074, 0.028], [0.09, 0.052], [0.086, 0.062], [0.076, 0.06], [0.07, 0.044]], 0.008, 0.0015, [ellipse(0.081, 0.052, 0.0035, 0.0035, 10)]), GM.blk, 0, 0, 0, g);   // ring hammer
  P(rb(0.004, 0.008, 0.03, 0.0015), GM.blk, -0.0175, 0.014, -0.025, g);     // slide stop
  P(xc(0.0045, 0.006, 14), GM.blk, -0.0175, 0.012, -0.01, g);
  P(rb(0.004, 0.009, 0.009, 0.002), GM.blk, -0.0165, -0.012, 0.022, g);    // mag release
  P(rb(0.004, 0.006, 0.014, 0.0015), GM.blk, -0.0175, 0.01, -0.058, g);    // barrel lock lever
  // magazine (animated): body inside the grip, baseplate below
  const mag = new THREE.Group(); g.add(mag);
  const ga = -0.3;
  P(rb(0.022, 0.11, 0.05, 0.002), GM.blk, 0, -0.064, 0.068, mag, ga);
  P(rb(0.03, 0.009, 0.06, 0.003), GM.blk, 0, -0.127, 0.088, mag, ga);
  out.mag = mag; out.slide = slide;
  out.grip = marker(g, 0, -0.055, 0.068, 'grip'); out.fore = marker(g, -0.012, -0.068, 0.064, 'fore');
  out.muzzle = marker(g, 0, B, -0.194, 'muzzle'); out.eject = marker(g, 0.02, 0.056, -0.012, 'eject');
  out.sightY = 0.0806; out.eyeZ = 0.4; out.stockZ = 0.06; out.magWell = new V3(0, -0.02, 0.07); out.boreY = B;
  return out;
}

// ---------- M9 Bayonet ----------
// Blade from per-vertex thickness outlines: a flat spine zone and a bevel zone that thins to the edge, so the grind line
// catches its own reflection. pts = [[z, y, thickness], ...] in the side view.
function bladeZone(pts, holes, uvf) {
  const sh = new THREE.Shape(); sh.moveTo(pts[0][0], pts[0][1]); pts.slice(1).forEach(p => sh.lineTo(p[0], p[1]));
  const thickAt = new Map(); const key = (a, b) => a.toFixed(5) + ',' + b.toFixed(5);
  pts.forEach(p => thickAt.set(key(p[0], p[1]), p[2]));
  (holes || []).forEach(h => { const ph = new THREE.Path(); ph.moveTo(h[0][0], h[0][1]); h.slice(1).forEach(p => ph.lineTo(p[0], p[1])); sh.holes.push(ph); h.forEach(p => thickAt.set(key(p[0], p[1]), p[2])); });
  const faces = [];
  [1, -1].forEach(side => {
    const g = new THREE.ShapeGeometry(sh, 1), p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) { const zz = p.getX(i), yy = p.getY(i), t = thickAt.get(key(zz, yy)) ?? pts[0][2]; p.setXYZ(i, zz, yy, side * t / 2); uv.setXY(i, uvf(zz, yy)[0], uvf(zz, yy)[1]); }
    if (side < 0) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i]; ix[i] = ix[i + 2]; ix[i + 2] = t; } }
    g.computeVertexNormals(); faces.push(g.toNonIndexed());
  });
  // walls along every outline edge where there is thickness (spine, teeth, hole, ricasso)
  const pos = [], nor = [], uvs = [];
  const wall = loop => { for (let i = 0; i < loop.length; i++) {
    const a = loop[i], b = loop[(i + 1) % loop.length]; if (a[2] < 0.0008 && b[2] < 0.0008) continue;
    const q = [[a[0], a[1], a[2] / 2], [b[0], b[1], b[2] / 2], [b[0], b[1], -b[2] / 2], [a[0], a[1], -a[2] / 2]];
    const e = new V3(b[0] - a[0], b[1] - a[1], 0), n = new V3(e.y, -e.x, 0).normalize();
    [0, 2, 1, 0, 3, 2].forEach(k => { pos.push(...q[k]); nor.push(n.x, n.y, n.z); uvs.push(...uvf(q[k][0], q[k][1])); });
  } };
  const cw = THREE.ShapeUtils.isClockWise(pts.map(p => new THREE.Vector2(p[0], p[1])));
  wall(cw ? pts.slice().reverse() : pts);
  (holes || []).forEach(h => { const hcw = THREE.ShapeUtils.isClockWise(h.map(p => new THREE.Vector2(p[0], p[1]))); wall(hcw ? h : h.slice().reverse()); });
  const w = new THREE.BufferGeometry();
  w.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); w.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); w.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  const m = mergeGeos([...faces, w]);
  m.rotateY(-Math.PI / 2);   // shape x -> world z, thickness -> world x
  return m;
}
function buildKnife(mods) {
  const g = new THREE.Group(), out = { group: g };
  const T = 0.0052, t = 0.0004, ys = 0.0185;   // spine thickness, edge thickness, spine height
  const uvf = (z, y) => [(-z) / 0.19, (y + 0.021) / 0.046];
  // spine with sawback teeth from the clip back to the ricasso
  const spine = [];
  for (let z = -0.106; z < -0.036; z += 0.0076) spine.push([z, ys, T], [z + 0.0026, ys + 0.0052, T], [z + 0.0062, ys + 0.0012, T]);
  const flat = [[-0.004, -0.013, T], [-0.016, -0.013, T], [-0.017, -0.0062, T], [-0.06, -0.0052, T], [-0.1, -0.0034, T], [-0.111, 0.002, T], [-0.117, 0.0095, T], [-0.121, ys, T],
    [-0.112, ys, T], ...spine, [-0.03, ys, T], [-0.012, ys, T], [-0.004, ys + 0.002, T]];
  const slot = ellipse(-0.04, 0.0065, 0.011, 0.0042, 18).map(p => [p[0], p[1], T]);
  P(bladeZone(flat, [slot], uvf), GM.damas, 0, 0, 0, g);
  const bevel = [[-0.016, -0.013, T], [-0.019, -0.0168, t], [-0.025, -0.0186, t], [-0.06, -0.0192, t], [-0.1, -0.019, t], [-0.128, -0.0172, t], [-0.15, -0.0125, t], [-0.166, -0.0068, t],
    [-0.178, -0.0012, t], [-0.186, 0.0035, t], [-0.18, 0.0062, 0.0009], [-0.166, 0.0098, 0.0016], [-0.15, 0.0136, 0.0024], [-0.135, 0.0166, 0.0036], [-0.121, ys, T],
    [-0.117, 0.0095, T], [-0.111, 0.002, T], [-0.1, -0.0034, T], [-0.06, -0.0052, T], [-0.017, -0.0062, T]];
  P(bladeZone(bevel, null, uvf), GM.damas, 0, 0, 0, g);
  decal(g, 'm9', -0.0027, 0.003, -0.0165, 0.0028, '-x');
  // crossguard with the muzzle ring above the spine and a short quillon below
  P(rb(0.017, 0.052, 0.0065, 0.002), GM.kblk, 0, -0.001, 0.0, g);
  P(new THREE.TorusGeometry(0.0118, 0.0031, 10, 28), GM.kblk, 0, 0.0365, 0.0, g);
  P(rb(0.014, 0.012, 0.0062, 0.002), GM.kblk, 0, 0.026, 0.0, g);
  P(rb(0.012, 0.014, 0.008, 0.003), GM.kblk, 0, -0.03, -0.003, g, 0.35);
  P(rb(0.023, 0.032, 0.006, 0.003), GM.kblk, 0, 0.002, 0.006, g);   // ferrule
  // ribbed oval grip
  const gp = []; const N = 13, gl = 0.112;
  gp.push([0, 0.009]); for (let i = 0; i <= N * 4; i++) { const zz = 0.009 + i / (N * 4) * gl, sw = 0.0118 + 0.0012 * Math.sin((zz - 0.009) / gl * Math.PI); gp.push([sw + 0.0011 * Math.abs(Math.sin(i / 4 * Math.PI)), zz]); } gp.push([0, 0.009 + gl]);
  const grip = lathe(gp, 28); grip.scale(0.92, 1.3, 1);
  P(grip, GM.kgrip, 0, 0.002, 0, g);
  // pommel with the bayonet lug slot, release button, lanyard hole
  P(rb(0.023, 0.034, 0.024, 0.007), GM.kblk, 0, 0.002, 0.131, g);
  P(box(0.008, 0.004, 0.02), GM.dark, 0, 0.0185, 0.132, g);
  P(xc(0.0042, 0.026, 16), GM.steel, 0, -0.004, 0.128, g);
  P(xc(0.0035, 0.0235, 12), GM.dark, 0, -0.008, 0.138, g);
  out.mag = null;
  out.grip = marker(g, 0, 0.002, 0.065, 'grip'); out.fore = marker(g, 0, 0.002, 0.065, 'fore');
  out.blade = marker(g, 0, 0.0, -0.095, 'blade'); out.tip = marker(g, 0, 0.0035, -0.186, 'tip');
  out.muzzle = out.tip; out.eject = out.grip;
  out.sightY = 0.0; out.eyeZ = 0.32; out.stockZ = 0.14; out.magWell = new V3(0, 0, 0.065); out.boreY = 0;
  return out;
}

const BUILDERS = { awm: buildAWM, m82: buildM82, svd: buildSVD, m200: buildM200, deagle: buildDeagle, knife: buildKnife };

return { buildEnvCube, envStudio, gunTextures, BUILDERS };
})();
