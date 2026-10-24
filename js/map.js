'use strict';
// ---------- The map: "Ashford" — a ruined, half-abandoned hill town at dusk, ~320 m across ----------
// Every peer builds the identical world: all map randomness goes through the seeded rng.
// The ground is a heightmap (terrainY: a cheap lookup on a precomputed grid). Roads are graded along their length,
// buildings stand on flattened lots, and paving is drawn as ribbons a few cm above the ground (never coplanar).
const MAP = {
  half: 160, spawns: [], ammoSpots: [], plateSpots: [], nests: [], buildings: [], lights: [], stairs: [], doors: [],
  atmo: {
    // late afternoon sliding into dusk: low amber sun from the west-south-west, long shadows across the streets
    fog: 0x7a7068, fogNear: 14, fogFar: 360,
    skyTop: 0x3a4558, skyHorizon: 0xb48a70, skyGround: 0x332e29, sunGlow: 0xe8925a, cloud: 0.5,
    sunColor: 0xffb47c, sunInt: 1.45, sunDir: [-0.86, 0.19, 0.47],
    hemiSky: 0x8793a8, hemiGround: 0x3d352c, hemiInt: 0.78, exposure: 0.92,
  },
};
const M = {}, TX = {};
let rng = makeRng(7151), GRASS = null, TALLGRASS = null;
const rr = (a, b) => a + rng() * (b - a), pick = a => a[Math.floor(rng() * a.length)], chance = p => rng() < p;
const yawTo = (dx, dz) => Math.atan2(-dx, -dz);   // yaw that faces along (dx,dz): forward is (-sin yaw, -cos yaw)

// ---------- Textures (dirty, desaturated) ----------
function mapTextures() {
  const R = rand;
  const streaks = (g, w, h, n, rgb, a, w0 = 2, w1 = 9) => { for (let i = 0; i < n; i++) { const x = Math.random() * w, L = h * R(0.25, 1), y0 = Math.random() * h * 0.3, gr = g.createLinearGradient(0, y0, 0, y0 + L); gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(1, `rgba(${rgb},0)`); g.fillStyle = gr; g.fillRect(x, y0, R(w0, w1), L); } };
  const cracks = (g, w, h, n, col, lw = 1, seg = 9, st = 16) => { g.strokeStyle = col; g.lineWidth = lw; for (let i = 0; i < n; i++) { let x = Math.random() * w, y = Math.random() * h; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < seg; k++) { x += R(-st, st); y += R(-st, st); g.lineTo(x, y); } g.stroke(); } };
  const dots = (g, w, h, n, fn, s0, s1) => { for (let i = 0; i < n; i++) { g.fillStyle = fn(); g.fillRect(Math.random() * w, Math.random() * h, R(s0, s1), R(s0, s1)); } };
  const soot = (a = 0.25) => `rgba(${R(18, 34) | 0},${R(16, 28) | 0},${R(12, 22) | 0},${R(0.08, a)})`;
  TX.brick = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#4b443e'; g.fillRect(0, 0, w, h);
    const bw = 64, rows = 24, bh = h / rows;
    for (let r = 0; r < rows; r++) for (let c = -1; c < 9; c++) {
      if (Math.random() < 0.025) continue;
      const x = c * bw + (r % 2 ? bw / 2 : 0), y = r * bh, k = R(0.62, 1.05), dk = Math.random() < 0.18;
      g.fillStyle = dk ? `rgb(${78 * k | 0},${56 * k | 0},${48 * k | 0})` : `rgb(${122 * k | 0},${68 * k | 0},${52 * k | 0})`;
      g.fillRect(x + 2, y + 2, bw - 4, bh - 3);
      g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x + 2, y + bh - 4, bw - 4, 2);
      if (Math.random() < 0.2) { g.fillStyle = 'rgba(40,34,30,0.5)'; g.fillRect(x + R(4, 40), y + 3, R(6, 18), bh - 6); }
    }
    blotches(g, w, h, 46, 20, 90, () => soot(0.32));
    blotches(g, w, h, 12, 10, 40, () => `rgba(205,200,186,${R(0.05, 0.13)})`);
    streaks(g, w, h, 22, '28,24,18', 0.32);
    grain(g, w, h, 26);
  });
  TX.plaster = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#c2baa9'; g.fillRect(0, 0, w, h);
    blotches(g, w, h, 80, 10, 80, () => `rgba(${R(140, 175) | 0},${R(132, 165) | 0},${R(115, 140) | 0},0.14)`);
    for (let i = 0; i < 2; i++) {   // plaster fallen away, brick showing through
      const cx = R(70, w - 70), cy = R(70, h - 70), r = R(20, 56);
      g.save(); g.beginPath(); for (let a = 0; a < TAU; a += 0.35) { const q = r * R(0.55, 1.3); g.lineTo(cx + Math.cos(a) * q, cy + Math.sin(a) * q * 0.7); } g.closePath();
      g.fillStyle = '#8a6a58'; g.fill(); g.clip(); g.strokeStyle = 'rgba(52,44,38,0.9)'; g.lineWidth = 2;
      for (let y = cy - r, row = 0; y < cy + r; y += 9, row++) { g.beginPath(); g.moveTo(cx - r - 20, y); g.lineTo(cx + r + 20, y); g.stroke(); for (let x = cx - r - 20 + (row % 2) * 12; x < cx + r + 20; x += 24) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 9); g.stroke(); } }
      g.restore(); g.strokeStyle = 'rgba(70,60,50,0.7)'; g.lineWidth = 2; g.stroke();
    }
    cracks(g, w, h, 10, 'rgba(50,45,40,0.45)', 1.2);
    blotches(g, w, h, 22, 20, 80, () => soot(0.14));
    blotches(g, w, h, 14, 6, 26, () => `rgba(${R(55, 75) | 0},${R(70, 85) | 0},${R(40, 50) | 0},0.2)`);   // mould
    streaks(g, w, h, 16, '60,52,38', 0.16, 3, 14);
    grain(g, w, h, 20);
  });
  TX.conc = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#86847d'; g.fillRect(0, 0, w, h);
    blotches(g, w, h, 70, 10, 70, () => `rgba(${R(80, 125) | 0},${R(78, 120) | 0},${R(72, 110) | 0},0.16)`);
    blotches(g, w, h, 24, 14, 60, () => soot(0.15));
    blotches(g, w, h, 18, 4, 18, () => `rgba(${R(50, 70) | 0},${R(66, 82) | 0},${R(36, 46) | 0},0.3)`);
    dots(g, w, h, 900, () => `rgba(40,38,34,${R(0.2, 0.6)})`, 1, 3);
    cracks(g, w, h, 8, 'rgba(36,34,30,0.5)', 1.3);
    g.fillStyle = 'rgba(50,48,44,0.35)'; g.fillRect(0, 0, w, 2); g.fillRect(0, h / 2, w, 2);
    streaks(g, w, h, 24, '45,40,32', 0.3);
    grain(g, w, h, 24);
  });
  TX.stone = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#3c3a36'; g.fillRect(0, 0, w, h);
    let y = 0; const hs = [56, 48, 64, 40, 56, 48, 64, 40, 48, 48];
    for (let r = 0; y < h; r++) {
      const rh = Math.min(hs[r % hs.length], h - y); let x = -R(0, 60);
      while (x < w) { const bw = R(60, 130), k = R(0.75, 1.08); g.fillStyle = `rgb(${132 * k | 0},${126 * k | 0},${112 * k | 0})`;
        [0, w].forEach(o => g.fillRect(x + 3 - o, y + 3, bw - 6, rh - 6)); x += bw; }
      y += rh;
    }
    blotches(g, w, h, 50, 10, 60, () => `rgba(${R(70, 110) | 0},${R(70, 100) | 0},${R(55, 80) | 0},0.2)`);
    blotches(g, w, h, 22, 6, 30, () => `rgba(${R(60, 80) | 0},${R(78, 95) | 0},${R(40, 50) | 0},0.32)`);
    dots(g, w, h, 500, () => `rgba(${R(150, 190) | 0},${R(150, 180) | 0},${R(120, 140) | 0},0.35)`, 1, 3);
    streaks(g, w, h, 18, '30,28,22', 0.3);
    grain(g, w, h, 22);
  });
  TX.wood = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#4a4239'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 32) {
      const k = R(0.7, 1.1); g.fillStyle = `rgb(${118 * k | 0},${106 * k | 0},${92 * k | 0})`; g.fillRect(x + 1, 0, 30, h);
      g.strokeStyle = 'rgba(50,42,34,0.35)'; for (let i = 0; i < 7; i++) { g.beginPath(); const xx = x + R(3, 29); g.moveTo(xx, 0); for (let y = 0; y <= h; y += 16) g.lineTo(xx + Math.sin(y / 27 + i) * 2, y); g.stroke(); }
      g.fillStyle = 'rgba(20,16,12,0.7)'; g.fillRect(x, 0, 1.5, h);
      if (Math.random() < 0.5) { g.fillStyle = 'rgba(30,26,20,0.5)'; g.fillRect(x + 2, R(0, h), 28, R(10, 40)); }
      g.fillStyle = 'rgba(60,30,15,0.9)'; g.fillRect(x + 15, 22, 2, 2); g.fillRect(x + 15, 150, 2, 2);
    }
    blotches(g, w, h, 14, 8, 30, () => soot(0.3));
    grain(g, w, h, 20);
  });
  TX.roof = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#26241f'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) for (let x = ((y / 16) % 2) * 12 - 12; x < w; x += 24) { if (Math.random() < 0.04) continue; const k = R(0.7, 1.1); g.fillStyle = `rgb(${66 * k | 0},${62 * k | 0},${58 * k | 0})`; g.fillRect(x, y, 22, 14); g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x, y + 11, 22, 3); }
    blotches(g, w, h, 24, 6, 26, () => `rgba(${R(60, 85) | 0},${R(75, 95) | 0},${R(38, 50) | 0},0.4)`);
    grain(g, w, h, 18);
  });
  TX.corr = canvasTex(256, 256, (g, w, h) => {
    for (let x = 0; x < w; x++) { const v = 110 + Math.sin(x / w * TAU * 8) * 45; g.fillStyle = `rgb(${v * 0.92 | 0},${v * 0.95 | 0},${v * 0.9 | 0})`; g.fillRect(x, 0, 1, h); }
    blotches(g, w, h, 26, 6, 34, () => `rgba(${R(100, 130) | 0},${R(48, 62) | 0},${R(22, 30) | 0},${R(0.3, 0.6)})`);
    streaks(g, w, h, 40, '110,52,22', 0.55, 2, 6);
    grain(g, w, h, 22);
  });
  TX.rust = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#6b4a36'; g.fillRect(0, 0, w, h);
    blotches(g, w, h, 60, 4, 30, () => `rgba(${R(70, 150) | 0},${R(40, 75) | 0},${R(20, 40) | 0},0.4)`);
    blotches(g, w, h, 20, 6, 30, () => `rgba(${R(60, 80) | 0},${R(62, 76) | 0},${R(60, 70) | 0},0.4)`);
    grain(g, w, h, 30);
  });
  TX.burnt = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#26211d'; g.fillRect(0, 0, w, h);
    blotches(g, w, h, 70, 3, 14, () => `rgba(${R(80, 110) | 0},${R(46, 60) | 0},${R(26, 36) | 0},${R(0.25, 0.5)})`);
    blotches(g, w, h, 20, 4, 18, () => `rgba(${R(60, 80) | 0},${R(56, 66) | 0},${R(50, 58) | 0},0.4)`);
    dots(g, w, h, 600, () => `rgba(10,8,6,${R(0.3, 0.8)})`, 1, 4);
    grain(g, w, h, 26);
  });
  TX.rubble = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#3a3631'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) { const x = Math.random() * w, y = Math.random() * h, r = R(3, 14), br = Math.random() < 0.3, k = R(0.6, 1.1);
      g.fillStyle = br ? `rgb(${118 * k | 0},${66 * k | 0},${50 * k | 0})` : `rgb(${120 * k | 0},${116 * k | 0},${106 * k | 0})`;
      g.beginPath(); for (let a = 0; a < TAU; a += R(0.7, 1.4)) g.lineTo(x + Math.cos(a) * r * R(0.6, 1.2), y + Math.sin(a) * r * R(0.6, 1.2)); g.fill(); }
    grain(g, w, h, 26);
  });
  TX.asphalt = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#383733'; g.fillRect(0, 0, w, h);
    dots(g, w, h, 5000, () => `rgba(${R(70, 120) | 0},${R(68, 112) | 0},${R(60, 100) | 0},${R(0.2, 0.5)})`, 1, 2);
    blotches(g, w, h, 18, 30, 90, () => `rgba(${R(26, 40) | 0},${R(26, 38) | 0},${R(24, 34) | 0},0.4)`);
    for (let i = 0; i < 4; i++) { g.fillStyle = `rgba(${R(30, 50) | 0},${R(30, 48) | 0},${R(28, 44) | 0},0.7)`; g.fillRect(R(0, w), R(0, h), R(40, 120), R(30, 90)); }
    cracks(g, w, h, 26, 'rgba(18,17,15,0.75)', 1.6, 12, 14);
    cracks(g, w, h, 30, 'rgba(18,17,15,0.5)', 0.8, 5, 8);
    blotches(g, w, h, 8, 6, 20, () => 'rgba(60,70,40,0.35)');
    grain(g, w, h, 26);
  });
  TX.paving = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#3a3a30'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 128) for (let y = 0; y < h; y += 128) { const k = R(0.7, 1.0); g.fillStyle = `rgb(${128 * k | 0},${125 * k | 0},${116 * k | 0})`; g.fillRect(x + 3, y + 3, 122, 122); if (Math.random() < 0.3) cracksIn(g, x, y); }
    function cracksIn(g, x, y) { g.strokeStyle = 'rgba(30,30,26,0.7)'; g.lineWidth = 1.3; g.beginPath(); let a = x + R(10, 118), b = y + 3; g.moveTo(a, b); for (let k = 0; k < 6; k++) { a += R(-14, 14); b += R(10, 22); g.lineTo(a, b); } g.stroke(); }
    for (let x = 0; x < w; x += 128) { g.fillStyle = 'rgba(64,78,38,0.6)'; g.fillRect(x, 0, 3, h); g.fillRect(0, x, w, 3); }
    blotches(g, w, h, 30, 14, 60, () => soot(0.25));
    grain(g, w, h, 20);
  });
  TX.cobble = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#4c473f'; g.fillRect(0, 0, w, h);   // gaps close to the stone colour, so the setts don't read as polka dots
    for (let y = 0; y < h; y += 32) { let x = (y / 32 % 2) * 16 - 32; while (x < w) { const bw = R(26, 38), k = R(0.8, 1.1); g.fillStyle = `rgb(${96 * k | 0},${90 * k | 0},${80 * k | 0})`; g.beginPath(); for (let a = 0; a < TAU; a += 0.9) g.lineTo(x + bw / 2 + Math.cos(a) * (bw / 2 - 1) * R(0.9, 1.05), y + 16 + Math.sin(a) * 15 * R(0.9, 1.05)); g.fill(); x += bw; } }
    dots(g, w, h, 1500, () => `rgba(${R(30, 60) | 0},${R(28, 55) | 0},${R(24, 48) | 0},0.5)`, 1, 3);
    blotches(g, w, h, 30, 14, 60, () => soot(0.3));
    blotches(g, w, h, 16, 6, 20, () => 'rgba(60,72,36,0.35)');
    grain(g, w, h, 18);
  });
  TX.dirtRoad = canvasTex(256, 512, (g, w, h) => {
    g.fillStyle = '#5e5240'; g.fillRect(0, 0, w, h);
    blotches(g, w, h, 60, 6, 30, () => `rgba(${R(70, 110) | 0},${R(60, 92) | 0},${R(42, 64) | 0},0.4)`);
    [0.28, 0.72].forEach(u => { const gr = g.createLinearGradient(u * w - 26, 0, u * w + 26, 0); gr.addColorStop(0, 'rgba(40,34,26,0)'); gr.addColorStop(0.5, 'rgba(40,34,26,0.5)'); gr.addColorStop(1, 'rgba(40,34,26,0)'); g.fillStyle = gr; g.fillRect(u * w - 26, 0, 52, h); });
    dots(g, w, h, 1400, () => `rgba(${R(120, 160) | 0},${R(110, 145) | 0},${R(90, 120) | 0},0.7)`, 1, 3);
    [0, 1].forEach(e => { const gr = g.createLinearGradient(e ? w - 30 : 30, 0, e ? w : 0, 0); gr.addColorStop(0, 'rgba(70,74,44,0)'); gr.addColorStop(1, 'rgba(70,74,44,0.9)'); g.fillStyle = gr; g.fillRect(e ? w - 30 : 0, 0, 30, h); });
    grain(g, w, h, 22);
  });
  TX.ground = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#5c5a3e'; g.fillRect(0, 0, w, h);
    blotches(g, w, h, 90, 10, 60, () => { const r = Math.random(); return r < 0.35 ? `rgba(${R(96, 120) | 0},${R(84, 100) | 0},${R(58, 70) | 0},0.35)` : r < 0.7 ? `rgba(${R(66, 82) | 0},${R(76, 92) | 0},${R(40, 52) | 0},0.3)` : `rgba(${R(110, 130) | 0},${R(100, 115) | 0},${R(66, 78) | 0},0.3)`; });
    for (let i = 0; i < 16000; i++) { const x = Math.random() * w, y = Math.random() * h, l = R(2, 7), dry = Math.random() < 0.55; g.strokeStyle = dry ? `rgba(${R(120, 160) | 0},${R(108, 138) | 0},${R(70, 90) | 0},0.55)` : `rgba(${R(66, 96) | 0},${R(80, 108) | 0},${R(40, 58) | 0},0.55)`; g.beginPath(); g.moveTo(x, y); g.lineTo(x + R(-2, 2), y - l); g.stroke(); }
    dots(g, w, h, 500, () => `rgba(${R(110, 140) | 0},${R(100, 125) | 0},${R(84, 100) | 0},0.7)`, 1, 3);
    grain(g, w, h, 18);
  });
  TX.mud = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#4b4033'; g.fillRect(0, 0, w, h);
    blotches(g, w, h, 70, 8, 50, () => `rgba(${R(50, 90) | 0},${R(42, 74) | 0},${R(30, 52) | 0},0.45)`);
    blotches(g, w, h, 14, 10, 40, () => 'rgba(24,22,18,0.45)');
    dots(g, w, h, 1600, () => `rgba(${R(110, 150) | 0},${R(100, 135) | 0},${R(84, 110) | 0},0.6)`, 1, 3);
    for (let i = 0; i < 1500; i++) { const x = Math.random() * w, y = Math.random() * h; g.strokeStyle = `rgba(${R(80, 120) | 0},${R(84, 110) | 0},${R(50, 64) | 0},0.4)`; g.beginPath(); g.moveTo(x, y); g.lineTo(x + R(-2, 2), y - R(2, 5)); g.stroke(); }
    grain(g, w, h, 22);
  });
  TX.bark = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#3d362f'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) { const x = Math.random() * w; g.strokeStyle = `rgba(${R(15, 30) | 0},${R(13, 26) | 0},${R(10, 20) | 0},${R(0.4, 0.8)})`; g.lineWidth = R(1.5, 5); g.beginPath(); g.moveTo(x, 0); for (let y = 0; y <= h; y += 20) g.lineTo(x + R(-4, 4), y); g.stroke(); }
    blotches(g, w, h, 20, 6, 22, () => `rgba(${R(90, 120) | 0},${R(90, 110) | 0},${R(70, 85) | 0},0.3)`);
    grain(g, w, h, 24);
  });
  // alpha cards
  const leafClump = (n, rad, pal, sz) => (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = 'rgba(48,40,30,1)'; g.lineWidth = 2;
    for (let i = 0; i < 7; i++) { const a = Math.random() * TAU, L = R(50, 100); g.beginPath(); g.moveTo(w / 2, h / 2); g.quadraticCurveTo(w / 2 + Math.cos(a + 0.4) * L * 0.5, h / 2 + Math.sin(a + 0.4) * L * 0.5, w / 2 + Math.cos(a) * L, h / 2 + Math.sin(a) * L); g.stroke(); }
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, r = Math.pow(Math.random(), 0.55) * rad, x = w / 2 + Math.cos(a) * r, y = h / 2 + Math.sin(a) * r * 0.9;
      const p = pal[Math.floor(Math.random() * pal.length)], s = 0.6 + 0.4 * (r / rad) + (y < h / 2 ? 0.08 : -0.1);
      g.fillStyle = `rgb(${p[0] * s | 0},${p[1] * s | 0},${p[2] * s | 0})`;
      g.beginPath(); g.ellipse(x, y, R(sz, sz * 2), R(sz * 0.45, sz * 0.9), Math.random() * TAU, 0, TAU); g.fill();
    }
  };
  TX.leaf = canvasTex(256, 256, leafClump(560, 112, [[96, 102, 56], [110, 106, 60], [80, 90, 48], [126, 110, 62], [100, 82, 48], [88, 96, 60]], 4));
  TX.bush = canvasTex(256, 256, leafClump(700, 116, [[70, 80, 44], [84, 90, 50], [62, 70, 42], [96, 92, 54], [76, 70, 44]], 3.4));
  TX.pine = canvasTex(256, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const tw = (x0, y0, x1, y1, L0, wd) => { g.strokeStyle = 'rgb(52,42,32)'; g.lineWidth = wd; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      const n = Math.hypot(x1 - x0, y1 - y0) / 2.2, dx = (x1 - x0) / n, dy = (y1 - y0) / n, ang = Math.atan2(dy, dx);
      for (let i = 0; i < n; i++) { const t = i / n, x = x0 + dx * i, y = y0 + dy * i, L = L0 * (1 - t * 0.55);
        for (const sd of [-1, 1]) { const a = ang + sd * R(0.8, 1.2), k = R(0.7, 1.1); g.strokeStyle = `rgb(${40 * k | 0},${56 * k | 0},${44 * k | 0})`; g.lineWidth = 1.4; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L); g.stroke(); } } };
    tw(0, 64, 250, 64 + R(-5, 5), 30, 3);
    for (let i = 0; i < 7; i++) { const x = 25 + i * 30, sd = i % 2 ? 1 : -1; tw(x, 64, x + 40, 64 + sd * R(26, 40), 16, 1.6); }
  });
  TX.tall = canvasTex(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 110; i++) {
      const x = R(8, w - 8), lean = R(-46, 46), top = R(4, 120), k = R(0.7, 1.15), dry = Math.random() < 0.7;
      g.strokeStyle = dry ? `rgb(${150 * k | 0},${134 * k | 0},${88 * k | 0})` : `rgb(${92 * k | 0},${104 * k | 0},${60 * k | 0})`; g.lineWidth = R(1.4, 3);
      g.beginPath(); g.moveTo(x, h); g.quadraticCurveTo(x + lean * 0.2, (h + top) / 2, x + lean, top); g.stroke();
      if (Math.random() < 0.25) { g.fillStyle = `rgb(${130 * k | 0},${112 * k | 0},${74 * k | 0})`; g.beginPath(); g.ellipse(x + lean, top + 6, 2.5, 9, lean / 200, 0, TAU); g.fill(); }
    }
  });
  TX.grass = canvasTex(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 50; i++) { const x = R(6, w - 6), lean = R(-16, 16), top = R(10, 64), k = R(0.7, 1.15), dry = Math.random() < 0.55;
      g.strokeStyle = dry ? `rgb(${140 * k | 0},${126 * k | 0},${84 * k | 0})` : `rgb(${84 * k | 0},${100 * k | 0},${54 * k | 0})`; g.lineWidth = R(1.4, 2.6);
      g.beginPath(); g.moveTo(x, h); g.quadraticCurveTo(x + lean * 0.3, (h + top) / 2, x + lean, top); g.stroke(); }
  });
  TX.picket = canvasTex(256, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const paint = () => { const k = R(0.6, 0.95); return Math.random() < 0.5 ? `rgb(${170 * k | 0},${166 * k | 0},${152 * k | 0})` : `rgb(${110 * k | 0},${96 * k | 0},${80 * k | 0})`; };
    g.fillStyle = 'rgb(92,82,70)'; g.fillRect(0, 44, w, 8); g.fillRect(0, 98, w, 8);
    for (let x = 4; x < w; x += 21) { if (Math.random() < 0.14) continue; const top = R(6, 22) + (Math.random() < 0.12 ? 40 : 0); g.fillStyle = paint(); g.beginPath(); g.moveTo(x, h); g.lineTo(x, top + 6); g.lineTo(x + 6, top); g.lineTo(x + 12, top + 6); g.lineTo(x + 12, h); g.fill(); }
  });
  TX.flame = canvasTex(64, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 3; i++) { const gr = g.createRadialGradient(w / 2, h * 0.75, 2, w / 2, h * 0.62, h * 0.5); gr.addColorStop(0, 'rgba(255,240,180,0.9)'); gr.addColorStop(0.3, 'rgba(255,150,50,0.7)'); gr.addColorStop(1, 'rgba(120,30,0,0)'); g.fillStyle = gr; g.beginPath(); g.ellipse(w / 2 + R(-6, 6), h * 0.62, w * 0.36, h * 0.38, 0, 0, TAU); g.fill(); }
  });
  TX.hay = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#7a6a44'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) { const x = Math.random() * w, y = Math.random() * h, l = R(6, 22), a = R(-0.5, 0.5), k = R(0.6, 1.15); g.strokeStyle = `rgba(${150 * k | 0},${128 * k | 0},${78 * k | 0},0.8)`; g.lineWidth = R(0.8, 1.8); g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
    blotches(g, w, h, 30, 8, 40, () => `rgba(${R(50, 70) | 0},${R(46, 60) | 0},${R(30, 40) | 0},0.35)`);   // rot and damp
    grain(g, w, h, 20);
  });
  // a soft strip of mist: transparent at both long edges, patchy along its length
  TX.fogb = canvasTex(128, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) { const x = w / 2 + R(-w * 0.22, w * 0.22), y = Math.random() * h, r = R(18, 46);
      [0, h, -h].forEach(o => { const gr = g.createRadialGradient(x, y + o, 1, x, y + o, r); gr.addColorStop(0, 'rgba(255,255,255,0.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(x - r, y + o - r, 2 * r, 2 * r); }); }
    const e = g.getImageData(0, 0, w, h), d = e.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const u = x / (w - 1), k = Math.pow(Math.sin(u * Math.PI), 1.6), i = (y * w + x) * 4; d[i + 3] = Math.min(255, d[i + 3] * k * 1.3); }
    g.putImageData(e, 0, 0);
  }, { wrap: true });
  TX.glow = canvasTex(64, 64, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h * 0.6, 2, w / 2, h / 2, w * 0.7); gr.addColorStop(0, '#ffcf88'); gr.addColorStop(0.6, '#a85a26'); gr.addColorStop(1, '#2a1408'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(60,24,10,0.75)'; g.fillRect(0, 0, w * 0.3, h); g.fillRect(w * 0.78, 0, w * 0.22, h);   // drawn curtains
  });
  // decal atlas (4x2 cells): spray-painted tags, bullet pocks, a scorch mark. Cut out with alphaTest.
  TX.decal = canvasTex(1024, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const cell = (i, fn) => { g.save(); g.translate((i % 4) * 256, Math.floor(i / 4) * 256); g.beginPath(); g.rect(2, 2, 252, 252); g.clip(); fn(); g.restore(); };
    const spray = (txt, x, y, size, col, rot = 0) => { g.save(); g.translate(x, y); g.rotate(rot); g.font = `bold ${size}px Impact, "Arial Black", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.shadowColor = col; g.shadowBlur = 5; g.fillStyle = col; g.fillText(txt, 0, 0); g.shadowBlur = 0; const m = Math.min(230, g.measureText(txt).width);
      g.strokeStyle = col; g.lineWidth = 2.2; for (let i = 0; i < 7; i++) { const dx = R(-m / 2, m / 2); g.beginPath(); g.moveTo(dx, size * 0.3); g.lineTo(dx, size * 0.3 + R(10, 46)); g.stroke(); } g.restore(); };
    const pock = (x, y, r) => { g.fillStyle = `rgba(${R(150, 185) | 0},${R(142, 170) | 0},${R(120, 145) | 0},0.9)`; g.beginPath(); for (let a = 0; a < TAU; a += 0.7) g.lineTo(x + Math.cos(a) * r * R(1.6, 2.6), y + Math.sin(a) * r * R(1.6, 2.6)); g.fill();
      g.fillStyle = 'rgba(16,14,12,1)'; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.fillStyle = 'rgba(40,36,32,0.95)'; g.beginPath(); g.arc(x + r * 0.3, y + r * 0.3, r * 1.25, 0, TAU); g.fill(); g.fillStyle = 'rgba(12,10,9,1)'; g.beginPath(); g.arc(x, y, r * 0.7, 0, TAU); g.fill(); };
    cell(0, () => { spray('NO WAY', 128, 92, 62, 'rgba(146,32,24,0.95)', -0.06); spray('OUT', 128, 168, 72, 'rgba(146,32,24,0.95)', -0.03); });
    cell(1, () => { spray('THEY', 128, 88, 58, 'rgba(214,208,192,0.92)', 0.05); spray('SEE YOU', 128, 158, 50, 'rgba(214,208,192,0.92)', 0.03); });
    cell(2, () => { g.strokeStyle = 'rgba(20,18,16,0.95)'; g.fillStyle = 'rgba(20,18,16,0.95)'; g.lineWidth = 9; g.lineCap = 'round';   // crude skull
      g.beginPath(); g.arc(128, 104, 62, Math.PI * 0.85, Math.PI * 2.15); g.lineTo(168, 170); g.lineTo(88, 170); g.closePath(); g.stroke();
      [[104, 112], [152, 112]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 15, 0, TAU); g.fill(); }); g.beginPath(); g.moveTo(128, 128); g.lineTo(120, 146); g.lineTo(136, 146); g.fill();
      for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(100 + i * 18, 170); g.lineTo(100 + i * 18, 186); g.stroke(); }
      g.beginPath(); g.moveTo(54, 200); g.lineTo(202, 236); g.moveTo(202, 200); g.lineTo(54, 236); g.stroke(); });
    cell(3, () => { g.strokeStyle = 'rgba(28,25,22,0.92)'; g.lineWidth = 6; g.lineCap = 'round';   // tally marks
      for (let gi = 0; gi < 6; gi++) { const ox = 22 + (gi % 3) * 76, oy = 30 + Math.floor(gi / 3) * 84; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(ox + i * 13, oy + R(-3, 3)); g.lineTo(ox + i * 13 + R(-3, 3), oy + 58); g.stroke(); }
        if (gi < 5) { g.beginPath(); g.moveTo(ox - 8, oy + 44); g.lineTo(ox + 52, oy + 12); g.stroke(); } }
      spray('DAY 29', 128, 220, 40, 'rgba(28,25,22,0.92)', -0.02); });
    cell(4, () => { for (let i = 0; i < 26; i++) { const a = R(0, TAU), d = Math.pow(Math.random(), 0.7) * 100; pock(128 + Math.cos(a) * d, 128 + Math.sin(a) * d * 0.8, R(2.5, 5.5)); } });
    cell(5, () => { for (let i = 0; i < 18; i++) pock(20 + i * 12 + R(-6, 6), 128 + Math.sin(i * 0.6) * 30 + R(-14, 14), R(2.5, 5)); for (let i = 0; i < 6; i++) pock(R(30, 226), R(40, 216), R(3, 6)); });
    cell(6, () => { for (let i = 0; i < 2600; i++) { const a = R(0, TAU), d = Math.pow(Math.random(), 0.6) * 120, k = 1 - d / 120; if (Math.random() > k * 1.4) continue;   // scorch
      g.fillStyle = `rgba(${R(8, 26) | 0},${R(7, 22) | 0},${R(6, 18) | 0},${0.5 + k * 0.5})`; g.fillRect(128 + Math.cos(a) * d, 128 + Math.sin(a) * d * 1.15, R(2, 7), R(2, 9)); } });
    cell(7, () => { spray('SNIPER', 128, 96, 58, 'rgba(24,22,20,0.95)', -0.04); g.strokeStyle = 'rgba(24,22,20,0.95)'; g.lineWidth = 10; g.lineCap = 'round';
      g.beginPath(); g.moveTo(40, 176); g.lineTo(200, 176); g.moveTo(170, 150); g.lineTo(206, 176); g.lineTo(170, 202); g.stroke(); });
  });
  TX.signs = canvasTex(512, 256, (g, w, h) => {
    const words = ['HOTEL', 'PHARMACY', 'BAKERY', 'GARAGE'], bg = ['#5c3a2a', '#2f4a44', '#6b5a3a', '#3a3e44'];
    words.forEach((s, i) => { const x = (i % 2) * 256, y = (i >> 1) * 128; g.fillStyle = bg[i]; g.fillRect(x, y, 256, 128); g.fillStyle = 'rgba(210,196,160,0.85)'; g.font = 'bold 50px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(s, x + 128, y + 66);
      g.strokeStyle = 'rgba(210,196,160,0.6)'; g.lineWidth = 4; g.strokeRect(x + 8, y + 8, 240, 112); });
    blotches(g, w, h, 40, 6, 30, () => soot(0.5));
    streaks(g, w, h, 30, '90,50,20', 0.5);
    grain(g, w, h, 30);
  });
}

// Alpha cards: canvas stores premultiplied colour, so fully transparent texels come back black and the mipmaps
// darken every leaf and blade at range. Rebuild as a DataTexture whose clear texels carry the average card colour.
function cardTex(t) {
  const c = t.image, w = c.width, h = c.height, d = c.getContext('2d').getImageData(0, 0, w, h).data, out = new Uint8Array(w * h * 4);
  let r = 0, g = 0, b = 0, n = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
  r /= n || 1; g /= n || 1; b /= n || 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = (y * w + x) * 4, o = ((h - 1 - y) * w + x) * 4, a = d[s + 3];   // flip rows: DataTexture has v=0 at the first row
    out[o] = a ? d[s] : r; out[o + 1] = a ? d[s + 1] : g; out[o + 2] = a ? d[s + 2] : b; out[o + 3] = a;
  }
  const dt = new THREE.DataTexture(out, w, h, THREE.RGBAFormat); dt.encoding = THREE.sRGBEncoding; dt.generateMipmaps = true; dt.minFilter = THREE.LinearMipmapLinearFilter; dt.magFilter = THREE.LinearFilter;
  dt.wrapS = dt.wrapT = THREE.ClampToEdgeWrapping; dt.anisotropy = 4; dt.needsUpdate = true; t.dispose(); return dt;
}

// The dusk sky as a 6 x 32 px cube map for still water: zenith -> horizon band -> dark ground, warm where the sun sets
function skyCube() {
  const A = MAP.atmo, c3 = h => new THREE.Color(h), top = c3(A.skyTop), hor = c3(A.skyHorizon), gnd = c3(A.skyGround), glow = c3(A.sunGlow), sd = new V3(...A.sunDir).normalize();
  // three.js cube face order +x -x +y -y +z -z; dir(face, u, v) for u,v in [-1,1] (v up)
  const dir = [(u, v) => [1, v, -u], (u, v) => [-1, v, u], (u, v) => [u, 1, -v], (u, v) => [u, -1, v], (u, v) => [u, v, 1], (u, v) => [-u, v, -1]];
  const imgs = dir.map(fn => { const n = 32, cv = document.createElement('canvas'); cv.width = cv.height = n; const g = cv.getContext('2d'), im = g.createImageData(n, n), c = new THREE.Color();
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const d = new V3(...fn((i + 0.5) / n * 2 - 1, 1 - (j + 0.5) / n * 2)).normalize(), s = Math.max(0, d.dot(sd));
      if (d.y > 0) c.copy(hor).lerp(top, Math.pow(d.y, 0.45)); else c.copy(hor).lerp(gnd, Math.min(1, -d.y * 6));
      c.lerp(glow, Math.pow(s, 4) * 0.7); const k = (j * n + i) * 4; im.data[k] = c.r * 255; im.data[k + 1] = c.g * 255; im.data[k + 2] = c.b * 255; im.data[k + 3] = 255; }
    g.putImageData(im, 0, 0); return cv; });
  const t = new THREE.CubeTexture(imgs); t.encoding = THREE.sRGBEncoding; t.needsUpdate = true; return t;
}
// ---------- Materials ----------
// Shared uniforms for the "dirtify" shader patch: it darkens surfaces near the ground (wet grime), adds low-frequency
// colour variation so tiling never shows, and darkens building interiors (a baked mask: covered floor area + ceiling height).
const DU = { tTer: { value: null }, tOcc: { value: null }, uTer: { value: new THREE.Vector4() }, uH: { value: new THREE.Vector2() } };
function dirtify(m, grime = 1) {
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, DU); sh.uniforms.uGrime = { value: m.userData.grime };
    sh.vertexShader = 'varying vec3 vWP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = 'varying vec3 vWP;\nuniform sampler2D tTer, tOcc;\nuniform vec4 uTer;\nuniform vec2 uH;\nuniform float uGrime;\n' +
      sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      {
        vec4 th = texture2D(tTer, (vWP.xz - uTer.xy) * uTer.z + uTer.w);
        float gh = (th.r * 65280.0 + th.g * 255.0) / 65535.0 * uH.y + uH.x;
        float gr = uGrime * exp(-max(vWP.y - gh, 0.0) * 1.4);
        diffuseColor.rgb *= mix(vec3(1.0), vec3(0.5, 0.48, 0.42), gr);
        float mn = sin(vWP.x * 0.31 + vWP.z * 0.17) * sin(vWP.z * 0.23 - vWP.y * 0.41 + 1.3) + 0.5 * sin(vWP.x * 1.3 + vWP.y * 0.9 + vWP.z * 1.1);
        diffuseColor.rgb *= 1.0 + mn * 0.08;
        vec4 oc = texture2D(tOcc, (vWP.xz + 160.0) / 320.0);
        float occ = oc.r * step(vWP.y, oc.g * 63.75 - 20.0);
        diffuseColor.rgb *= 1.0 - occ * 0.6;
      }`);
  };
  m.userData.grime = grime;
  return m;
}
function mapMaterials() {
  ['leaf', 'bush', 'pine', 'tall', 'grass', 'picket', 'decal'].forEach(k => { if (TX[k].isCanvasTexture) TX[k] = cardTex(TX[k]); });
  if (TX.picket.wrapS !== THREE.RepeatWrapping) { TX.picket.wrapS = THREE.RepeatWrapping; }
  const std = (o, s = 2, grime = 1) => { const m = new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.95, metalness: 0 }, o)); m.color.convertSRGBToLinear(); m.userData.s = s; return dirtify(m, grime); };
  M.brick = std({ map: TX.brick }, 3.2); M.brickD = std({ map: TX.brick, color: 0x8f8780 }, 3.2);
  M.plasterA = std({ map: TX.plaster, color: 0xd6cab4 }, 3.6); M.plasterB = std({ map: TX.plaster, color: 0xa6ab98 }, 3.6); M.plasterC = std({ map: TX.plaster, color: 0xb9a68c }, 3.6);
  M.conc = std({ map: TX.conc }, 3.5); M.concD = std({ map: TX.conc, color: 0x7d7a72 }, 3);
  M.stone = std({ map: TX.stone, color: 0xa8a297 }, 3.4);
  M.wood = std({ map: TX.wood }, 2); M.woodD = std({ map: TX.wood, color: 0x6e645a }, 2);
  M.roof = std({ map: TX.roof }, 2.4);
  M.corr = std({ map: TX.corr, roughness: 0.75, metalness: 0.3 }, 3); M.corrG = std({ map: TX.corr, color: 0x8d9a8c, roughness: 0.75, metalness: 0.3 }, 3);
  M.rust = std({ map: TX.rust, roughness: 0.8, metalness: 0.35 }, 1.4); M.metal = std({ map: TX.rust, color: 0x6d6e6c, roughness: 0.6, metalness: 0.5 }, 1.4);
  M.burnt = std({ map: TX.burnt, roughness: 0.9, metalness: 0.25 }, 2.2);
  M.rubble = std({ map: TX.rubble, color: 0xb8b0a6 }, 1.6);
  M.asphalt = std({ map: TX.asphalt }, 1, 0); M.paving = std({ map: TX.paving, color: 0x9a948a }, 1, 0); M.cobble = std({ map: TX.cobble }, 1, 0); M.dirtRoad = std({ map: TX.dirtRoad }, 1, 0);
  M.bark = std({ map: TX.bark }, 1.3, 0.6);
  M.dark = std({ color: 0x151412, roughness: 1 }, 1, 0);
  // interior floors: no ground grime (the interior mask already darkens them), or a ground floor reads as a black void
  M.floor = std({ map: TX.conc, color: 0xd2cec6 }, 3, 0.15); M.floorW = std({ map: TX.wood, color: 0xe0d4c0 }, 2, 0.15);
  M.pipe = std({ map: TX.conc, color: 0x77746c, side: THREE.DoubleSide }, 2);
  M.sign = std({ map: TX.signs, roughness: 0.8 }, 1, 0); M.sign.userData.keepUV = true;
  // still water mirrors the dusk sky (a tiny canvas cube, no live reflections): puddles read as bright patches in dark streets
  M.water = new THREE.MeshStandardMaterial({ color: 0x3a3d37, roughness: 0.1, metalness: 0.7, envMap: skyCube(), envMapIntensity: 0.6 }); M.water.color.convertSRGBToLinear(); M.water.userData.noCast = true;
  M.glow = new THREE.MeshStandardMaterial({ map: TX.glow, color: 0x000000, emissive: 0xffffff, emissiveMap: TX.glow, emissiveIntensity: 0.9, roughness: 1 }); M.glow.userData.keepUV = true; M.glow.userData.noCast = true;
  M.glowF = M.glow.clone(); M.glowF.userData = { keepUV: true, noCast: true };   // candle-lit rooms: MAP.tick flickers this one
  M.lamp = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff6c1e, emissiveIntensity: 1.1, roughness: 1 }); M.lamp.userData = { s: 1, noCast: true };
  M.hay = std({ map: TX.hay, color: 0xb3a582 }, 1.6, 0.3);
  M.fogBank = new THREE.MeshBasicMaterial({ map: TX.fogb, color: 0xa39a90, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
  M.fogBank.userData = { keepUV: true, noCast: true }; M.fogBank.color.convertSRGBToLinear();
  M.flame = new THREE.MeshBasicMaterial({ map: TX.flame, color: 0xffb070, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  M.flame.userData.keepUV = true; M.flame.userData.noCast = true;
  const cut = (map, color, o = {}) => { const m = new THREE.MeshStandardMaterial(Object.assign({ map, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.92, color }, o)); m.color.convertSRGBToLinear(); m.userData.keepUV = true; return m; };
  M.decal = cut(TX.decal, 0xd8d2c8, { side: THREE.FrontSide, alphaTest: 0.45, roughness: 0.95 }); M.decal.userData.noCast = true;
  M.picket = cut(TX.picket, 0xffffff); M.chain = cut(TEX.chain, 0x8a7a68, { metalness: 0.3, roughness: 0.6 }); M.chain.userData.noCast = true;
  // foliage: vertex colours tint each card, normals point out of the crown; don't flip them on back faces
  const fol = (map, vc = true) => { const m = new THREE.MeshStandardMaterial({ map, alphaTest: 0.42, side: THREE.DoubleSide, vertexColors: vc, roughness: 0.95 });
    m.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', 'float faceDirection = 1.0;\nvec3 normal = normalize( vNormal );\nvec3 geometryNormal = normal;'); };
    return m; };
  M.fLeaf = fol(TX.leaf); M.fBush = fol(TX.bush); M.fPine = fol(TX.pine); M.iGrass = fol(TX.grass, false); M.iTall = fol(TX.tall, false);
}

// ---------- Primitive builders ----------
function B(x0, y0, z0, x1, y1, z1, mat, cm = 'concrete', bullets = true, solid = true) {
  if (x0 > x1) [x0, x1] = [x1, x0]; if (y0 > y1) [y0, y1] = [y1, y0]; if (z0 > z1) [z0, z1] = [z1, z0];
  const w = x1 - x0, h = y1 - y0, d = z1 - z0; if (w < 0.003 || h < 0.003 || d < 0.003) return;
  if (mat) { const g = new THREE.BoxGeometry(w, h, d); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); staticAdd(g, mat, mat.userData.s || 2); }
  if (cm) addCollider(x0, y0, z0, x1, y1, z1, cm, bullets, solid);
}
function G(geo, mat, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  if (rz) g.rotateZ(rz); if (rx) g.rotateX(rx); if (ry) g.rotateY(ry);
  g.translate(x, y, z); staticAdd(g, mat, mat.userData.s || 2, !!mat.userData.keepUV);
}
// apply a matrix that may mirror: then the triangle winding has to be flipped back
function applyM(g, m) {
  g.applyMatrix4(m);
  if (m.determinant() < 0) for (const k in g.attributes) { const a = g.attributes[k], s = a.itemSize, arr = a.array;
    for (let i = 0; i < a.count; i += 3) for (let j = 0; j < s; j++) { const p = (i + 1) * s + j, q = (i + 2) * s + j, t = arr[p]; arr[p] = arr[q]; arr[q] = t; } }
  return g;
}
// cylinder between two points (branches, legs, poles)
function limb(ax, ay, az, bx, by, bz, r0, r1, mat, seg = 6) {
  const d = new V3(bx - ax, by - ay, bz - az), L = d.length(); if (L < 0.01) return;
  const g = new THREE.CylinderGeometry(r1, r0, L, seg, 1, true).toNonIndexed(); g.translate(0, L / 2, 0);   // open: the ends are buried or too thin to see
  g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()))); g.translate(ax, ay, az);
  staticAdd(g, mat, mat.userData.s || 1.3);
}
// colliders along a leaning pole/trunk: short boxes that follow the axis instead of one fat AABB
function limbColl(ax, ay, az, bx, by, bz, r0, cm = 'wood', r1 = r0) {   // r0/r1: radius at the bottom/top (tapering trunks)
  const n = Math.max(1, Math.min(10, Math.max(Math.ceil(Math.hypot(bx - ax, bz - az) / (Math.min(r0, r1) * 0.4 + 0.02)), Math.ceil(Math.abs(r0 - r1) / 0.08))));
  for (let i = 0; i < n; i++) { const t0 = i / n, t1 = (i + 1) / n, r = lerp(r0, r1, (i + 0.5) / n) * 0.8;   // a box around a round section: corners poke out, faces sit inside
    addCollider(Math.min(lerp(ax, bx, t0), lerp(ax, bx, t1)) - r, lerp(ay, by, t0), Math.min(lerp(az, bz, t0), lerp(az, bz, t1)) - r, Math.max(lerp(ax, bx, t0), lerp(ax, bx, t1)) + r, lerp(ay, by, t1), Math.max(lerp(az, bz, t0), lerp(az, bz, t1)) + r, cm); }
}
// collider boxes for a rotated rectangle (yawed props): split into sections so the AABBs stay tight
function rotBoxes(cx, cz, yaw, u0, u1, hw, y0, y1, cm = 'metal') {
  const c = Math.cos(yaw), s = Math.sin(yaw), n = Math.max(1, Math.min(6, Math.ceil(Math.abs(u1 - u0) * Math.abs(Math.sin(2 * yaw)) / 0.7)));
  for (let i = 0; i < n; i++) {
    const a = lerp(u0, u1, i / n), b = lerp(u0, u1, (i + 1) / n); let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const u of [a, b]) for (const v of [-hw, hw]) { const x = cx + c * u + s * v, z = cz - s * u + c * v; x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const sh = n > 1 ? Math.min(x1 - x0, z1 - z0) * 0.08 : 0;   // shave the corners that stick out
    addCollider(x0 + sh, y0, z0 + sh, x1 - sh, y1, z1 - sh, cm);
  }
}

// ---------- Terrain heightmap ----------
const TER = { ext: 256, cell: 2, n: 257, h: null, max: 0, min: 0, mud: null };
function terrainY(x, z) {
  const T = TER, n = T.n, h = T.h; if (!h) return 0;
  let fx = (x + T.ext) * 0.5, fz = (z + T.ext) * 0.5;
  if (fx < 0) fx = 0; else if (fx > n - 1.0001) fx = n - 1.0001;
  if (fz < 0) fz = 0; else if (fz > n - 1.0001) fz = n - 1.0001;
  const ix = fx | 0, iz = fz | 0, i = iz * n + ix; fx -= ix; fz -= iz;
  // same triangle split as the ground mesh, so feet sit exactly on what is drawn
  if (fx + fz < 1) return h[i] + (h[i + 1] - h[i]) * fx + (h[i + n] - h[i]) * fz;
  const h11 = h[i + n + 1]; return h11 + (h[i + n] - h11) * (1 - fx) + (h[i + 1] - h11) * (1 - fz);
}
// ray vs heightfield: march (step grows with height above ground), then bisect
function rayTerrain(o, d, maxT = 1000) {
  if (!TER.h) return -1;
  let t = 0;
  if (o.y > TER.max) { if (d.y >= 0) return -1; t = (o.y - TER.max) / -d.y; if (t > maxT) return -1; }
  let f = o.y + d.y * t - terrainY(o.x + d.x * t, o.z + d.z * t);
  if (f <= 0) return t;
  while (t < maxT) {
    const nt = Math.min(maxT, t + Math.max(0.9, f * 0.45));
    const nf = o.y + d.y * nt - terrainY(o.x + d.x * nt, o.z + d.z * nt);
    if (nf <= 0) {
      let a = t, b = nt;
      for (let k = 0; k < 10; k++) { const m = (a + b) * 0.5; if (o.y + d.y * m - terrainY(o.x + d.x * m, o.z + d.z * m) <= 0) b = m; else a = m; }
      return b;
    }
    if (d.y >= 0 && o.y + d.y * nt > TER.max) return -1;
    t = nt; f = nf;
  }
  return -1;
}
function baseH(x, z) {
  let h = 1.5 * Math.sin(x * 0.019 + 0.7) * Math.cos(z * 0.016 - 0.4) + 0.9 * Math.sin(x * 0.043 + z * 0.029 + 1.7) + 0.45 * Math.sin(-x * 0.071 + z * 0.083 + 0.3) + 0.22 * Math.sin(x * 0.13 + z * 0.11);
  h += 10 * Math.exp(-(((x - 80) / 44) ** 2 + ((z + 104) / 34) ** 2));          // church hill, north-east
  h += 13 * smoothT((-x - 92) / 48) * (0.85 + 0.15 * Math.sin(z * 0.035 + 1));   // ridge along the west
  h += 3 * smoothT((-z - 95) / 60);                                              // woods rise to the north
  h -= 2.2 * smoothT((z - 40) / 50);                                             // the flats to the south
  const m = Math.max(Math.abs(x), Math.abs(z));
  h += smoothT((m - 132) / 75) * (17 + 6 * Math.sin(x * 0.05 + z * 0.04) + 3 * Math.sin(x * 0.13 - z * 0.09));   // hills close the bowl
  return h;
}
// dense path from control points; .s = arc length per point
function path(pts, step = 2) {
  const c = new THREE.CatmullRomCurve3(pts.map(p => new V3(p[0], 0, p[1])), false, 'centripetal');
  const n = Math.max(2, Math.ceil(c.getLength() / step)), P = c.getSpacedPoints(n).map(v => [v.x, v.z]);
  P.len = c.getLength(); P.ds = P.len / n; return P;
}
// nearest distance (and arc length) from the terrain grid points to a polyline, within R
function pathDist(P, R) {
  const T = TER, n = T.n, e = T.ext, D = new Map(); let s0 = 0;
  for (let i = 0; i < P.length - 1; i++) {
    const [ax, az] = P[i], [bx, bz] = P[i + 1], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-6, L = Math.sqrt(L2);
    const ix0 = Math.max(0, Math.floor((Math.min(ax, bx) - R + e) / 2)), ix1 = Math.min(n - 1, Math.ceil((Math.max(ax, bx) + R + e) / 2));
    const iz0 = Math.max(0, Math.floor((Math.min(az, bz) - R + e) / 2)), iz1 = Math.min(n - 1, Math.ceil((Math.max(az, bz) + R + e) / 2));
    for (let iz = iz0; iz <= iz1; iz++) for (let ix = ix0; ix <= ix1; ix++) {
      const x = -e + ix * 2, z = -e + iz * 2, t = clamp(((x - ax) * dx + (z - az) * dz) / L2, 0, 1), d = Math.hypot(x - ax - dx * t, z - az - dz * t);
      if (d < R) { const k = iz * n + ix, o = D.get(k); if (!o || d < o[0]) D.set(k, [d, s0 + t * L]); }
    }
    s0 += L;
  }
  return D;
}
const profAtS = (r, s) => { const f = clamp(s / r.P.ds, 0, r.prof.length - 1.001), i = f | 0; return lerp(r.prof[i], r.prof[i + 1], f - i); };
function genTerrain() {
  const T = TER, n = T.n, N = n * n, h = new Float32Array(N), mud = new Float32Array(N); T.h = h; T.mud = mud;
  for (let iz = 0; iz < n; iz++) for (let ix = 0; ix < n; ix++) h[iz * n + ix] = baseH(-T.ext + ix * 2, -T.ext + iz * 2);
  // the creek: a shallow ditch with soft banks
  pathDist(CREEK.P, 11).forEach(([d], k) => { h[k] -= 1.9 * (d < 2.2 ? 1 : smoothT(1 - (d - 2.2) / 8)); mud[k] = Math.max(mud[k], smoothT(1 - d / 8)); });
  CREEK.bed = CREEK.P.map(([x, z]) => terrainY(x, z));
  // dug-in ditches across the fields: about a metre deep with soft banks (roads and lots, eased in after, win)
  DITCHES.forEach(D => pathDist(D.P, 4.6).forEach(([d], k) => { h[k] -= 1.2 * (d < 0.9 ? 1 : smoothT(1 - (d - 0.9) / 3.6)); mud[k] = Math.max(mud[k], 0.8 * smoothT(1 - d / 3.4)); }));   // banks stay under ~27°: walkable for bots
  // roads: smooth height profile along each one, terrain eased onto it (embankments carry them over the creek)
  ROADS.forEach(r => {
    const prof = r.P.map(([x, z]) => terrainY(x, z));
    for (let p = 0; p < 40; p++) for (let i = 1; i < prof.length - 1; i++) prof[i] = (prof[i - 1] + 2 * prof[i] + prof[i + 1]) / 4;
    r.prof = prof;
    const fl = r.hw + (r.walk || 1.6);
    pathDist(r.P, fl + 8).forEach(([d, s], k) => { h[k] = lerp(h[k], profAtS(r, s), d < fl ? 1 : smoothT(1 - (d - fl) / 8)); mud[k] = Math.max(mud[k], 0.75 * smoothT(1 - Math.abs(d - fl - 0.5) / 3)); });
  });
  // lots: flat pads, the nearest lot wins so neighbouring pads never disturb each other
  LOTS.forEach(L => { if (L.g === undefined) { const sx = L.fx !== undefined ? L.fx : (L.x0 + L.x1) / 2, sz = L.fz !== undefined ? L.fz : (L.z0 + L.z1) / 2; L.g = terrainY(sx, sz); } });
  for (let iz = 0; iz < n; iz++) for (let ix = 0; ix < n; ix++) {
    const x = -T.ext + ix * 2, z = -T.ext + iz * 2; let best = 99, bl = null;
    for (const L of LOTS) { const dd = Math.hypot(Math.max(L.x0 - x, 0, x - L.x1), Math.max(L.z0 - z, 0, z - L.z1)) - (L.pad ?? 2.5); if (dd < best) { best = dd; bl = L; } }
    if (best < 8) { const k = iz * n + ix; h[k] = best <= 0 ? bl.g : lerp(bl.g, h[k], smoothT(best / 8)); if (bl.yard) mud[k] = Math.max(mud[k], 0.55 * smoothT(1 - Math.abs(best) / 5)); }
  }
  let mx = -1e9, mn = 1e9; for (let i = 0; i < N; i++) { mx = Math.max(mx, h[i]); mn = Math.min(mn, h[i]); } T.max = mx + 0.01; T.min = mn;
}
function terrainMesh(scene) {
  const T = TER, n = T.n, N = n * n, h = T.h;
  const pos = new Float32Array(N * 3), uv = new Float32Array(N * 2), col = new Float32Array(N * 3), mix = new Float32Array(N);
  for (let iz = 0; iz < n; iz++) for (let ix = 0; ix < n; ix++) {
    const k = iz * n + ix, x = -T.ext + ix * 2, z = -T.ext + iz * 2;
    pos[k * 3] = x; pos[k * 3 + 1] = h[k]; pos[k * 3 + 2] = z; uv[k * 2] = x / 6; uv[k * 2 + 1] = z / 6;
    const dry = smoothT(0.5 + 0.35 * Math.sin(x * 0.045 + Math.cos(z * 0.03) * 2) + 0.25 * Math.sin(z * 0.07 - x * 0.02)), out = smoothT((Math.max(Math.abs(x), Math.abs(z)) - 150) / 40);
    const lowWet = smoothT(-(h[k] - 1.5) / 3);
    col[k * 3] = lerp(0.8, 1.02, dry) * (1 - out * 0.22); col[k * 3 + 1] = lerp(0.86, 0.94, dry) * (1 - out * 0.12); col[k * 3 + 2] = lerp(0.72, 0.74, dry) * (1 - out * 0.2);
    const pn = 0.5 + 0.5 * Math.sin(x * 0.21 + Math.sin(z * 0.17) * 2.3) * Math.sin(z * 0.19 - x * 0.05);
    mix[k] = clamp(T.mud[k] + (pn > 0.82 ? (pn - 0.82) * 3 : 0) + lowWet * 0.25, 0, 1);
  }
  const idx = new Uint32Array((n - 1) * (n - 1) * 6); let q = 0;
  for (let iz = 0; iz < n - 1; iz++) for (let ix = 0; ix < n - 1; ix++) { const a = iz * n + ix, b = a + 1, c = a + n, d = c + 1; idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = b; idx[q++] = c; idx[q++] = d; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('aMix', new THREE.BufferAttribute(mix, 1));
  g.setIndex(new THREE.BufferAttribute(idx, 1)); g.computeVertexNormals(); g.computeBoundingSphere();
  const m = new THREE.MeshStandardMaterial({ map: TX.ground, vertexColors: true, roughness: 1 });
  m.onBeforeCompile = sh => {
    sh.uniforms.tMud = { value: TX.mud };
    sh.vertexShader = 'attribute float aMix;\nvarying float vMix;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\nvMix = aMix;');
    sh.fragmentShader = 'uniform sampler2D tMud;\nvarying float vMix;\n' + sh.fragmentShader.replace('#include <map_fragment>', `
      vec4 tA = texture2D(map, vUv), tB = texture2D(map, vUv * 0.23 + 0.31), tM = texture2D(tMud, vUv * 0.7);
      vec4 texelColor = mix(tA, tB, 0.42);
      texelColor = mix(texelColor, tM, smoothstep(0.35, 0.65, vMix + (tB.g - 0.3) * 0.5));
      texelColor = mapTexelToLinear(texelColor);
      diffuseColor *= texelColor;`);
  };
  const me = new THREE.Mesh(g, m); me.receiveShadow = true; me.castShadow = false; me.matrixAutoUpdate = false; scene.add(me);
  // data textures for the dirtify patch: ground height (16 bit) and the interior-darkness mask
  const td = new Uint8Array(N * 4), hr = T.max - T.min;
  for (let i = 0; i < N; i++) { const v = Math.round((h[i] - T.min) / hr * 65535); td[i * 4] = v >> 8; td[i * 4 + 1] = v & 255; td[i * 4 + 3] = 255; }
  const tt = new THREE.DataTexture(td, n, n, THREE.RGBAFormat); tt.magFilter = tt.minFilter = THREE.NearestFilter; tt.needsUpdate = true;
  DU.tTer.value = tt; DU.uTer.value.set(-T.ext, -T.ext, 1 / (n * 2), 0.5 / n); DU.uH.value.set(T.min, hr);
  const ot = new THREE.DataTexture(OCC.d, OCC.n, OCC.n, THREE.RGBAFormat); ot.magFilter = ot.minFilter = THREE.LinearFilter; ot.needsUpdate = true; DU.tOcc.value = ot;
}

// ---------- Surface + interior masks (1 m / 0.5 m grids over the play area) ----------
const SURF = { n: 340, o: -170, d: null, blk: null };   // 0 grass 1 dirt 2 gravel 3 concrete 4 water; blk: no vegetation
const OCC = { n: 640, d: new Uint8Array(640 * 640 * 4) };
const sIdx = (x, z) => { const i = Math.floor(x - SURF.o), j = Math.floor(z - SURF.o); return i < 0 || j < 0 || i >= SURF.n || j >= SURF.n ? -1 : j * SURF.n + i; };
function markRect(x0, z0, x1, z1, code, blk = 1) { for (let z = Math.floor(z0); z < z1; z++) for (let x = Math.floor(x0); x < x1; x++) { const k = sIdx(x + 0.5, z + 0.5); if (k < 0) continue; if (code !== null) SURF.d[k] = code; if (blk) SURF.blk[k] = 1; } }
function markPath(P, hw, code, blk = 1) {
  for (let i = 0; i < P.length - 1; i++) {
    const [ax, az] = P[i], [bx, bz] = P[i + 1], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-6;
    for (let z = Math.floor(Math.min(az, bz) - hw); z <= Math.max(az, bz) + hw; z++) for (let x = Math.floor(Math.min(ax, bx) - hw); x <= Math.max(ax, bx) + hw; x++) {
      const px = x + 0.5, pz = z + 0.5, t = clamp(((px - ax) * dx + (pz - az) * dz) / L2, 0, 1);
      if (Math.hypot(px - ax - dx * t, pz - az - dz * t) < hw) { const k = sIdx(px, pz); if (k >= 0) { if (code !== null) SURF.d[k] = code; if (blk) SURF.blk[k] = 1; } }
    }
  }
}
// interior darkness: r = amount, ceiling height under which it applies
function occRect(x0, z0, x1, z1, amt, ceil) {
  const n = OCC.n, d = OCC.d, c = clamp(Math.round((ceil + 20) * 4), 0, 255);
  for (let j = Math.max(0, Math.ceil((z0 + 160) * 2)); j < Math.min(n, (z1 + 160) * 2); j++) for (let i = Math.max(0, Math.ceil((x0 + 160) * 2)); i < Math.min(n, (x1 + 160) * 2); i++) { const k = (j * n + i) * 4; if (amt >= d[k]) { d[k] = amt; d[k + 1] = c; } }
}
function occAt(x, z, y) {   // 0..1 how dark it is here (character.js can dim players standing in dark rooms)
  const i = Math.floor((x + 160) * 2), j = Math.floor((z + 160) * 2); if (i < 0 || j < 0 || i >= OCC.n || j >= OCC.n) return 0;
  const k = (j * OCC.n + i) * 4; return y < OCC.d[k + 1] / 4 - 20 ? OCC.d[k] / 255 * 0.6 : 0;
}

// ---------- Ribbons: roads, pavements, paths, water ----------
function ribbon(P, o0, o1, yoff, mat, o = {}) {
  const nA = o.nA || Math.max(2, Math.ceil((o1 - o0) / 1.6) + 1), pos = [], uv = [], idx = [];
  let s = 0;
  for (let i = 0; i < P.length; i++) {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)], tl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / tl, nz = (b[0] - a[0]) / tl;
    if (i) s += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
    for (let j = 0; j < nA; j++) {
      const off = lerp(o0, o1, j / (nA - 1)), x = P[i][0] + nx * off, z = P[i][1] + nz * off;
      pos.push(x, o.flatY ? o.flatY[i] : terrainY(x, z) + yoff, z);
      uv.push(o.across ? j / (nA - 1) : off / (o.us || 4), s / (o.vs || o.us || 4));
    }
  }
  for (let i = 0; i < P.length - 1; i++) for (let j = 0; j < nA - 1; j++) { const a = i * nA + j, b = a + 1, c = a + nA, d = c + 1; idx.push(a, b, c, b, d, c); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  staticAdd(g, mat, 1, true);
}
// a terrain-following patch (plazas, yards, forecourts)
function patch(x0, z0, x1, z1, mat, yoff = 0.05, us = 4) {
  const nx = Math.max(1, Math.ceil((x1 - x0) / 2)), nz = Math.max(1, Math.ceil((z1 - z0) / 2)), pos = [], uv = [], idx = [];
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) { const x = lerp(x0, x1, i / nx), z = lerp(z0, z1, j / nz); pos.push(x, terrainY(x, z) + yoff, z); uv.push(x / us, z / us); }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  staticAdd(g, mat, 1, true);
  markRect(x0, z0, x1, z1, 3);
}
// the part of a path outside a set of keep-out discs (side streets stop at the main road's edge, pavements break at junctions)
function runsOutside(P, test) { const runs = []; let cur = []; P.forEach(p => { if (test(p)) { if (cur.length > 1) runs.push(cur); cur = []; } else cur.push(p); }); if (cur.length > 1) runs.push(cur); return runs; }
function roadDist(r, x, z) {
  let best = 1e9;
  for (let i = 0; i < r.P.length - 1; i++) { const p = r.P[i], q = r.P[i + 1]; if (Math.abs(p[0] - x) > best + 3 && Math.abs(q[0] - x) > best + 3) continue; const dx = q[0] - p[0], dz = q[1] - p[1], t = clamp(((x - p[0]) * dx + (z - p[1]) * dz) / (dx * dx + dz * dz || 1), 0, 1); best = Math.min(best, Math.hypot(x - p[0] - dx * t, z - p[1] - dz * t)); }
  return best;
}
function nearRoad(x, z, pad = 0, skip = null) {
  for (const r of ROADS) { if (r === skip) continue; const lim = r.hw + pad; for (let i = 0; i < r.P.length - 1; i += 1) { const p = r.P[i]; if (Math.abs(p[0] - x) < lim + 3 && Math.abs(p[1] - z) < lim + 3) { const q = r.P[i + 1], dx = q[0] - p[0], dz = q[1] - p[1], t = clamp(((x - p[0]) * dx + (z - p[1]) * dz) / (dx * dx + dz * dz || 1), 0, 1); if (Math.hypot(x - p[0] - dx * t, z - p[1] - dz * t) < lim) return r; } } }
  return null;
}

// ---------- Walls: one extruded shape per side (openings are holes / notches, the top can be jagged) ----------
// sd = {ax:'x'|'z', a0, L, c (centre of thickness), t, out (+1/-1 = which way is outside), yb (wall foot)}; u along, v up from yb
const profAt = (top, u) => { for (let i = 0; i < top.length - 1; i++) if (u <= top[i + 1][0]) { const a = top[i], b = top[i + 1]; return lerp(a[1], b[1], (u - a[0]) / (b[0] - a[0] || 1)); } return top[top.length - 1][1]; };
const profMin = (top, u0, u1) => { let m = Math.min(profAt(top, u0), profAt(top, u1)); top.forEach(p => { if (p[0] > u0 && p[0] < u1) m = Math.min(m, p[1]); }); return m; };
function wallMesh(sd, top, ops, mat, cm = 'concrete') {
  const { L, t } = sd, sh = new THREE.Shape(); sh.moveTo(0, 0);
  ops.filter(o => o.door).sort((a, b) => a.u0 - b.u0).forEach(d => {
    sh.lineTo(d.u0, 0);
    if (d.arch) { const r = (d.u1 - d.u0) / 2, sv = d.v1 - r; sh.lineTo(d.u0, sv); sh.absarc(d.u0 + r, sv, r, Math.PI, 0, true); }
    else { sh.lineTo(d.u0, d.v1); sh.lineTo(d.u1, d.v1); }
    sh.lineTo(d.u1, 0);
  });
  sh.lineTo(L, 0);
  for (let i = top.length - 1; i >= 0; i--) sh.lineTo(top[i][0], top[i][1]);
  ops.forEach(o => {
    if (o.door) return; const p = new THREE.Path();
    if (o.poly) { p.moveTo(o.poly[0][0], o.poly[0][1]); o.poly.slice(1).forEach(q => p.lineTo(q[0], q[1])); }
    else if (o.arch) { const r = (o.u1 - o.u0) / 2, sv = o.v1 - r; p.moveTo(o.u0, o.v0); p.lineTo(o.u1, o.v0); p.lineTo(o.u1, sv); p.absarc(o.u0 + r, sv, r, 0, Math.PI, false); p.lineTo(o.u0, o.v0); }
    else if (o.round) { p.absarc((o.u0 + o.u1) / 2, (o.v0 + o.v1) / 2, (o.u1 - o.u0) / 2, 0, TAU, false); }
    else { p.moveTo(o.u0, o.v0); p.lineTo(o.u1, o.v0); p.lineTo(o.u1, o.v1); p.lineTo(o.u0, o.v1); }
    sh.holes.push(p);
  });
  const g = new THREE.ExtrudeGeometry(sh, { depth: t, bevelEnabled: false, curveSegments: 7 });
  if (sd.ax === 'x') g.translate(sd.a0, sd.yb, sd.c - t / 2); else { g.rotateY(-Math.PI / 2); g.translate(sd.c + t / 2, sd.yb, sd.a0); }
  staticAdd(g, mat, mat.userData.s || 3);
  if (cm) wallColl(sd, top, ops, cm);
}
// colliders: slice at every opening edge and profile vertex, solid ranges per slice, then merge equal neighbours.
// Tops round DOWN so a collider never pokes above the broken edge you can see.
// Arches, round windows and blast holes are cut as a stack of bands that follow the outline (chord at mid-band),
// so there is no invisible lip at an arch crown and no hidden ring around a shell hole.
function opOutline(o) {
  if (o.poly) return o.poly;
  const r = (o.u1 - o.u0) / 2, uc = (o.u0 + o.u1) / 2, p = [];
  if (o.round) { const vc = (o.v0 + o.v1) / 2; for (let i = 0; i < 20; i++) { const a = i / 20 * TAU; p.push([uc + Math.cos(a) * r, vc + Math.sin(a) * r]); } return p; }
  const sv = o.v1 - r, vb = o.door ? o.cv0 : o.v0; p.push([o.u0, vb], [o.u1, vb]); for (let i = 0; i <= 12; i++) { const a = i / 12 * Math.PI; p.push([uc + Math.cos(a) * r, sv + Math.sin(a) * r]); } return p;
}
function opBands(o) {
  if (!o.poly && !o.arch && !o.round) return [o];
  const P = opOutline(o), vs = P.map(q => q[1]), vmin = Math.min(...vs), vmax = Math.max(...vs), out = [];
  const chord = v => { let a = 1e9, b = -1e9; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; if ((p[1] - v) * (q[1] - v) > 0 || p[1] === q[1]) continue; const u = p[0] + (q[0] - p[0]) * (v - p[1]) / (q[1] - p[1]); a = Math.min(a, u); b = Math.max(b, u); } return [a, b]; };
  let edges;
  if (o.arch) { const r = (o.u1 - o.u0) / 2, sv = o.v1 - r; out.push({ cu0: o.u0, cu1: o.u1, cv0: vmin, cv1: sv }); edges = [0, 0.3, 0.55, 0.75, 0.9, 1].map(k => sv + r * k); }
  else { const nb = Math.max(3, Math.min(7, Math.round((vmax - vmin) / 0.3))); edges = []; for (let i = 0; i <= nb; i++) edges.push(lerp(vmin, vmax, i / nb)); }
  for (let i = 0; i < edges.length - 1; i++) { const [a, b] = chord((edges[i] + edges[i + 1]) / 2); if (b - a > 0.08) out.push({ cu0: a, cu1: b, cv0: edges[i], cv1: edges[i + 1] }); }
  return out;
}
function wallColl(sd, top, ops0, cm) {
  const ops = ops0.flatMap(opBands);
  const cuts = [0, sd.L]; ops.forEach(o => cuts.push(o.cu0, o.cu1)); top.forEach(p => cuts.push(p[0]));
  const us = [...new Set(cuts.map(u => Math.round(clamp(u, 0, sd.L) * 1000) / 1000))].sort((a, b) => a - b), rects = [];
  for (let i = 0; i < us.length - 1; i++) {
    const a = us[i], b = us[i + 1]; if (b - a < 0.02) continue;
    const tv = Math.floor(Math.min(profAt(top, a), profAt(top, b)) / 0.3) * 0.3; let segs = [[0, tv]];
    ops.forEach(o => { if (o.cu0 <= a + 1e-3 && o.cu1 >= b - 1e-3) segs = segs.flatMap(([v0, v1]) => o.cv1 <= v0 || o.cv0 >= v1 ? [[v0, v1]] : [[v0, Math.max(v0, o.cv0)], [Math.min(v1, o.cv1), v1]].filter(s => s[1] - s[0] > 0.04)); });
    segs.forEach(s => rects.push([a, b, s[0], s[1]]));
  }
  rects.sort((p, q) => p[2] - q[2] || p[3] - q[3] || p[0] - q[0]);
  const out = []; rects.forEach(r => { const l = out[out.length - 1]; if (l && Math.abs(l[2] - r[2]) < 1e-4 && Math.abs(l[3] - r[3]) < 1e-4 && Math.abs(l[1] - r[0]) < 1e-3) l[1] = r[1]; else out.push(r.slice()); });
  const { a0, c, t, yb } = sd;
  out.forEach(([u0, u1, v0, v1]) => { if (sd.ax === 'x') addCollider(a0 + u0, yb + v0, c - t / 2, a0 + u1, yb + v1, c + t / 2, cm); else addCollider(c - t / 2, yb + v0, a0 + u0, c + t / 2, yb + v1, a0 + u1, cm); });
}
// boxes and points in a wall's frame (w = distance outward from the wall centre)
function lbox(sd, u0, u1, v0, v1, w0, w1, mat, cm = null) {
  const W0 = sd.c + sd.out * w0, W1 = sd.c + sd.out * w1;
  if (sd.ax === 'x') B(sd.a0 + u0, sd.yb + v0, W0, sd.a0 + u1, sd.yb + v1, W1, mat, cm); else B(W0, sd.yb + v0, sd.a0 + u0, W1, sd.yb + v1, sd.a0 + u1, mat, cm);
}
const lpt = (sd, u, v, w) => sd.ax === 'x' ? [sd.a0 + u, sd.yb + v, sd.c + sd.out * w] : [sd.c + sd.out * w, sd.yb + v, sd.a0 + u];
// a plank / panel lying flat on the wall, rotated in the wall plane
function lplank(sd, uc, vc, w, len, ht, th, ang, mat) {
  const [x, y, z] = lpt(sd, uc, vc, w);
  if (sd.ax === 'x') G(new THREE.BoxGeometry(len, ht, th), mat, x, y, z, 0, 0, ang); else G(new THREE.BoxGeometry(th, ht, len), mat, x, y, z, 0, ang, 0);
}
// window dressing: sills, lintels, frames, boards, shutters, the odd lit window
function dressOp(sd, o, bi) {
  const ow = sd.t / 2, { u0, u1, v0, v1 } = o, wd = u1 - u0;
  if (o.poly || (o.door && !o.shop)) return;
  if (o.door) { lbox(sd, u0 - 0.06, u1 + 0.06, v1, v1 + 0.22, ow + 0.002, ow + 0.06, bi.trim); return; }   // shopfront fascia
  if (!o.round) lbox(sd, u0 - 0.08, u1 + 0.08, v0 - 0.08, v0, ow + 0.002, ow + 0.08, bi.trim);
  const k = o.kind;
  if (k === 'frame' || k === 'glow') {
    if (!o.arch && !o.round) lbox(sd, u0 - 0.1, u1 + 0.1, v1, v1 + 0.16, ow + 0.002, ow + 0.05, bi.trim);
    if (!o.arch && !o.round) { const f = 0.06, a = 0.004, w0 = ow - 0.16, w1 = ow - 0.08;
      lbox(sd, u0 + a, u0 + f, v0 + a, v1 - a, w0, w1, M.woodD); lbox(sd, u1 - f, u1 - a, v0 + a, v1 - a, w0, w1, M.woodD);
      lbox(sd, u0 + f, u1 - f, v1 - f, v1 - a, w0, w1, M.woodD); lbox(sd, u0 + f, u1 - f, v0 + a, v0 + f, w0, w1, M.woodD);
      const mh = chance(0.5) ? v1 - f : lerp(v0, v1, rr(0.35, 0.7)); lbox(sd, (u0 + u1) / 2 - 0.025, (u0 + u1) / 2 + 0.025, v0 + f, mh, w0 + 0.01, w1 - 0.01, M.woodD);
      if (chance(0.6)) lbox(sd, u0 + f, u1 - f, (v0 + v1) / 2 - 0.02, (v0 + v1) / 2 + 0.02, w0 + 0.01, w1 - 0.01, M.woodD); }
    if (k === 'glow') { const [x, y, z] = lpt(sd, (u0 + u1) / 2, (v0 + v1) / 2, -ow - 0.25), g = new THREE.PlaneGeometry(wd * 1.3, (v1 - v0) * 1.2); if (sd.ax === 'z') g.rotateY(Math.PI / 2); G(g, lrng() < 0.45 ? M.glowF : M.glow, x, y, z); }
  } else if (k === 'board') {
    const nb = Math.max(2, Math.round((v1 - v0) / 0.36));
    for (let i = 0; i < nb; i++) if (chance(0.82)) lplank(sd, (u0 + u1) / 2 + rr(-0.06, 0.06), lerp(v0 + 0.15, v1 - 0.15, i / (nb - 1)), ow + 0.02, wd + rr(0.15, 0.35), rr(0.16, 0.24), 0.025, rr(-0.14, 0.14), chance(0.5) ? M.wood : M.woodD);
  } else if (k === 'shut' && !o.arch) {
    const sw = wd / 2, side = chance(0.5) ? -1 : 1, uc = side < 0 ? u0 - sw / 2 - 0.05 : u1 + sw / 2 + 0.05;
    if (uc - sw / 2 > 0.1 && uc + sw / 2 < sd.L - 0.1) lplank(sd, uc, (v0 + v1) / 2 - 0.05, ow + 0.03, sw, v1 - v0, 0.035, rr(-0.06, 0.06), M.woodD);
  }
}
// jagged top profile for a wall: corners survive, dips where it has collapsed
function ruinTop(L, baseV, ruin, maxDip, minV) {
  const m = Math.max(2, 2 * Math.ceil(L / 2.2)), pts = [], dips = [];
  if (ruin > 0.12 && maxDip > 0.05) for (let i = 0, nd = ruin > 0.55 ? 2 : 1; i < nd; i++) dips.push({ c: rr(0.15, 0.85) * L, w: rr(1.4, 3.6) * (0.6 + ruin), d: rr(0.45, 1) * maxDip });
  for (let i = 0; i <= m; i++) {
    const u = L * i / m, end = i === 0 || i === m; let dip = 0;
    dips.forEach(d => { dip = Math.max(dip, d.d * smoothT(1 - Math.abs(u - d.c) / d.w)); });
    const jag = ruin > 0.05 && !end ? -rr(0, 0.4) * Math.min(1, ruin * 2) : 0;
    pts.push([u, Math.max(minV, baseV(u) - dip * (end ? 0.25 : 1) + jag)]);
  }
  return pts;
}
// loopholes: ragged holes knocked through solid stretches of wall, crouch height on the ground floor (a firing slit
// from inside a dark room) and on upper floors. Own random stream: the town layout stays as it was.
function loopholes(o, sd, ops, nb, bw, v0, FH, n, lo, hi) {
  if (o.noLoop) return;
  const R = (a, b) => a + lrng() * (b - a), clear = (u0, u1, va, vb) => u0 > lo && u1 < hi && !ops.some(p => u1 > p.u0 - 0.35 && u0 < p.u1 + 0.35 && vb > p.v0 - 0.3 && va < p.v1 + 0.3);
  for (let f = 0; f < n; f++) {
    if (lrng() > (f ? 0.18 : 0.28)) continue;
    const rx = f ? R(0.28, 0.38) : R(0.36, 0.5), ry = f ? R(0.2, 0.28) : R(0.27, 0.33), vc = v0 + f * FH + (f ? 1.1 : 0.86);
    for (let k = 0; k < 4; k++) {
      const uc = R(lo + rx + 0.3, hi - rx - 0.3), e = 1.15; if (!clear(uc - rx * e, uc + rx * e, vc - ry * e, vc + ry * e)) continue;
      const poly = []; for (let a = 0; a < TAU - 0.01; a += TAU / 9) { const q = R(0.78, 1.12); poly.push([uc + Math.cos(a) * rx * q, vc + Math.sin(a) * ry * q]); }
      ops.push({ poly, loop: true, u0: uc - rx * e, u1: uc + rx * e, v0: vc - ry * e, v1: vc + ry * e, cu0: uc - rx * 0.6, cu1: uc + rx * 0.6, cv0: vc - ry * 0.6, cv1: vc + ry * 0.6, f });
      break;
    }
  }
}
function blastPoly(uc, vc, rx, ry) { const p = []; for (let a = 0; a < TAU - 0.01; a += TAU / 11) { const k = rr(0.7, 1.1); p.push([uc + Math.cos(a) * rx * k, vc + Math.sin(a) * ry * k]); } return p; }

// ---------- Floors, stairs, rails ----------
// slab with rectangular holes, split into a few boxes
function slab(x0, z0, x1, z1, y0, y1, mat, holes = [], cm = 'concrete') {
  const xs = [x0, x1]; holes.forEach(h => [h.x0, h.x1].forEach(v => { if (v > x0 && v < x1) xs.push(v); }));
  const X = [...new Set(xs)].sort((a, b) => a - b), strips = [];
  for (let i = 0; i < X.length - 1; i++) {
    const a = X[i], b = X[i + 1]; let segs = [[z0, z1]];
    holes.forEach(h => { if (h.x0 <= a + 1e-3 && h.x1 >= b - 1e-3) segs = segs.flatMap(([s, e]) => h.z1 <= s || h.z0 >= e ? [[s, e]] : [[s, Math.max(s, h.z0)], [Math.min(e, h.z1), e]].filter(q => q[1] - q[0] > 0.05)); });
    const l = strips[strips.length - 1], key = JSON.stringify(segs);
    if (l && l.key === key) l.b = b; else strips.push({ a, b, segs, key });
  }
  strips.forEach(s => s.segs.forEach(([za, zb]) => B(s.a, y0, za, s.b, y1, zb, mat, cm)));
}
function railLine(xa, za, xb, zb, y, mat = M.metal) {
  const L = Math.hypot(xb - xa, zb - za), n = Math.max(1, Math.round(L / 1.1));
  for (let i = 0; i <= n; i++) { const x = lerp(xa, xb, i / n), z = lerp(za, zb, i / n); B(x - 0.025, y, z - 0.025, x + 0.025, y + 1.0, z + 0.025, mat, null); }
  B(Math.min(xa, xb) - 0.03, y + 0.97, Math.min(za, zb) - 0.03, Math.max(xa, xb) + 0.03, y + 1.03, Math.max(za, zb) + 0.03, mat, null);
  B(Math.min(xa, xb) - 0.015, y + 0.5, Math.min(za, zb) - 0.015, Math.max(xa, xb) + 0.015, y + 0.53, Math.max(za, zb) + 0.015, mat, null);
  addCollider(Math.min(xa, xb) - 0.04, y, Math.min(za, zb) - 0.04, Math.max(xa, xb) + 0.04, y + 1.03, Math.max(za, zb) + 0.04, 'metal', false);
}
// U-shaped (switchback) stair: flight A along lane A up to a landing at half height, flight B back along lane B.
// sp = {ax, sa, sl, a0, l0, w, run}: along axis + sign, lateral sign, start coords. Ground flights are solid blocks
// (nothing for bots to crawl under), upper flights have a sloped underside. Colliders are one box per step.
function stairPlan(x0, z0, x1, z1, t, corner, ax, rise, w = 1.15) {
  const run = 0.28, n = Math.max(2, Math.round(rise / 2 / 0.2)), Ls = n * run + w;
  const cx = corner[1] === 'E' ? x1 - t - 0.02 : x0 + t + 0.02, cz = corner[0] === 'N' ? z0 + t + 0.02 : z1 - t - 0.02;
  let sa, sl, a0, l0;
  if (ax === 'x') { sa = corner[1] === 'E' ? 1 : -1; a0 = cx - sa * Ls; sl = corner[0] === 'N' ? 1 : -1; l0 = cz; }
  else { sa = corner[0] === 'S' ? 1 : -1; a0 = cz - sa * Ls; sl = corner[1] === 'W' ? 1 : -1; l0 = cx; }
  const sp = { ax, sa, sl, a0, l0, w, run, n, Ls };
  const [p, q] = stW(sp, 0, 0), [r, s] = stW(sp, Ls, 2 * w); sp.rect = { x0: Math.min(p, r), z0: Math.min(q, s), x1: Math.max(p, r), z1: Math.max(q, s) };
  return sp;
}
const stW = (sp, al, la) => sp.ax === 'x' ? [sp.a0 + sp.sa * al, sp.l0 + sp.sl * la] : [sp.l0 + sp.sl * la, sp.a0 + sp.sa * al];
function stBox(sp, a1, a2, l1, l2, y0, y1, mat, cm) { const [p, q] = stW(sp, a1, l1), [r, s] = stW(sp, a2, l2); B(p, y0, q, r, y1, s, mat, cm); }
function uStair(sp, y0, rise, filled, mat, cm = 'concrete') {
  const { w, run, n, Ls } = sp, sr = rise / 2 / n, hr = rise / 2;
  const A = [[0, filled ? 0 : -0.2]];
  for (let k = 0; k < n; k++) A.push([k * run, (k + 1) * sr], [(k + 1) * run, (k + 1) * sr]);
  A.push([Ls, hr]); if (filled) A.push([Ls, 0]); else A.push([Ls, hr - 0.2], [n * run, hr - 0.2]);
  const Bp = [[0, filled ? 0 : rise - 0.2], [0, rise]];
  for (let k = 0; k < n; k++) Bp.push([k * run, rise - k * sr], [(k + 1) * run, rise - k * sr]);
  Bp.push([n * run, hr], [Ls, hr]); if (filled) Bp.push([Ls, 0]); else Bp.push([Ls, hr - 0.2], [n * run, hr - 0.2]);
  const mk = (pts, la, lb) => {
    const sh = new THREE.Shape(); const clean = pts.filter((p, i) => i === 0 || Math.abs(p[0] - pts[i - 1][0]) + Math.abs(p[1] - pts[i - 1][1]) > 1e-4);
    sh.moveTo(clean[0][0], clean[0][1]); clean.slice(1).forEach(p => sh.lineTo(p[0], p[1]));
    const g = new THREE.ExtrudeGeometry(sh, { depth: lb - la, bevelEnabled: false }); g.translate(0, 0, la);
    const m = new THREE.Matrix4(); if (sp.ax === 'x') m.set(sp.sa, 0, 0, sp.a0, 0, 1, 0, y0, 0, 0, sp.sl, sp.l0, 0, 0, 0, 1); else m.set(0, 0, sp.sl, sp.l0, 0, 1, 0, y0, sp.sa, 0, 0, sp.a0, 0, 0, 0, 1);
    staticAdd(applyM(g, m), mat, mat.userData.s || 2);
  };
  mk(A, 0, w); mk(Bp, w, 2 * w);
  for (let k = 0; k < n; k++) {
    stBox(sp, k * run, (k + 1) * run, 0, w, filled ? y0 : y0 + (k + 1) * sr - 0.3, y0 + (k + 1) * sr, null, cm);
    stBox(sp, k * run, (k + 1) * run, w, 2 * w, filled ? y0 : y0 + rise - k * sr - 0.3, y0 + rise - k * sr, null, cm);
  }
  stBox(sp, n * run, Ls, 0, 2 * w, filled ? y0 : y0 + hr - 0.2, y0 + hr, null, cm);
}
function stairRails(sp, y, top) {
  const [ax, az] = stW(sp, 0, 2 * sp.w), [bx, bz] = stW(sp, sp.Ls, 2 * sp.w); railLine(ax, az, bx, bz, y);
  if (top) { const [cx, cz] = stW(sp, 0, 0), [dx, dz] = stW(sp, 0, sp.w); railLine(cx, cz, dx, dz, y); }
}
// straight solid stair (mezzanines): from (x,z) along dir, n steps
function straightStair(x, z, dir, width, y0, rise, mat, cm = 'concrete') {
  const n = Math.max(2, Math.round(rise / 0.2)), sr = rise / n, run = 0.28, L = n * run, hw = width / 2;
  const pts = [[0, 0]]; for (let k = 0; k < n; k++) pts.push([k * run, (k + 1) * sr], [(k + 1) * run, (k + 1) * sr]); pts.push([L, 0]);
  const sh = new THREE.Shape(); sh.moveTo(0, 0); pts.slice(1).forEach(p => sh.lineTo(p[0], p[1]));
  const g = new THREE.ExtrudeGeometry(sh, { depth: width, bevelEnabled: false }); g.translate(0, 0, -hw);
  const m = new THREE.Matrix4(), sg = dir[0] === '-' ? -1 : 1;
  if (dir[1] === 'x') m.set(sg, 0, 0, x, 0, 1, 0, y0, 0, 0, 1, z, 0, 0, 0, 1); else m.set(0, 0, 1, x, 0, 1, 0, y0, sg, 0, 0, z, 0, 0, 0, 1);
  staticAdd(applyM(g, m), mat, mat.userData.s || 2);
  for (let k = 0; k < n; k++) { const a = k * run * sg, b = (k + 1) * run * sg, top = y0 + (k + 1) * sr;
    if (dir[1] === 'x') addCollider(x + a, y0, z - hw, x + b, top, z + hw, cm); else addCollider(x - hw, y0, z + a, x + hw, top, z + b, cm); }
}

// ---------- Rubble, debris and props ----------
function rubble(x, z, r, h, y = null, mat = M.rubble, coll = true) {
  const gy = y === null ? terrainY(x, z) : y;
  const g = new THREE.IcosahedronGeometry(1, 1), p = g.attributes.position, key = new Map();
  for (let i = 0; i < p.count; i++) { const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`; if (!key.has(k)) key.set(k, rr(0.85, 1.15)); const f = key.get(k); p.setXYZ(i, p.getX(i) * f, p.getY(i) * f, p.getZ(i) * f); }
  g.scale(r, h, r * rr(0.75, 1)); g.computeVertexNormals(); G(g, mat, x, gy - h * 0.18, z, rr(0, TAU));
  for (let i = 0, nc = Math.round(r * 5); i < nc; i++) { const a = rng() * TAU, d = r * rr(0.3, 1.15), s = rr(0.12, 0.4);
    G(new THREE.BoxGeometry(s * rr(1, 2.5), s * rr(0.3, 0.7), s), chance(0.3) ? M.brick : M.concD, x + Math.cos(a) * d, gy + s * 0.15 + Math.max(0, h * (1 - d / r)) * 0.5, z + Math.sin(a) * d, rr(0, TAU), rr(-0.4, 0.4), rr(-0.4, 0.4)); }
  if (coll) { addCollider(x - r * 0.55, gy, z - r * 0.55, x + r * 0.55, gy + h * 0.45, z + r * 0.55, 'concrete'); if (h > 0.7) addCollider(x - r * 0.3, gy, z - r * 0.3, x + r * 0.3, gy + h * 0.6, z + r * 0.3, 'concrete'); }
}
function debris(x, z, r, n = 8, y = null) {   // planks, bricks, a tyre: small enough to ignore for collision
  for (let i = 0; i < n; i++) { const a = rng() * TAU, d = r * Math.sqrt(rng()), px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d, gy = y === null ? terrainY(px, pz) : y, k = rng();
    if (k < 0.45) G(new THREE.BoxGeometry(rr(0.8, 2.2), 0.03, rr(0.1, 0.2)), chance(0.5) ? M.wood : M.woodD, px, gy + 0.03, pz, rr(0, TAU), 0, rr(-0.08, 0.08));
    else if (k < 0.86) G(new THREE.BoxGeometry(0.22, 0.07, 0.11), M.brick, px, gy + 0.035, pz, rr(0, TAU));
    else if (k < 0.93) G(new THREE.TorusGeometry(0.3, 0.1, 6, 12), M.burnt, px, gy + 0.1, pz, rr(0, TAU), Math.PI / 2 + rr(-0.15, 0.15));   // a tyre lying flat
    else G(new THREE.TorusGeometry(0.3, 0.1, 6, 12), M.burnt, px, gy + 0.36, pz, rr(0, TAU), rr(0.25, 0.45)); }   // ...or propped up, leaning
}
function barrel(x, z, mat = M.rust, y = null, tipped = false) {
  const gy = y === null ? terrainY(x, z) : y;
  if (tipped) { const a = rr(0, TAU); G(new THREE.CylinderGeometry(0.29, 0.29, 0.88, 12, 1), mat, x, gy + 0.29, z, a, 0, Math.PI / 2); addCollider(x - 0.38, gy, z - 0.38, x + 0.38, gy + 0.56, z + 0.38, 'metal'); return; }
  G(new THREE.CylinderGeometry(0.29, 0.29, 0.88, 12, 1), mat, x, gy + 0.44, z);
  [0.22, 0.64].forEach(hh => G(new THREE.TorusGeometry(0.292, 0.014, 4, 12), mat, x, gy + hh, z, 0, Math.PI / 2));
  addCollider(x - 0.27, gy, z - 0.27, x + 0.27, gy + 0.88, z + 0.27, 'metal');
}
function fireBarrel(x, z, light) {
  barrel(x, z, M.burnt); const gy = terrainY(x, z);
  for (let i = 0; i < 3; i++) { const g = new THREE.PlaneGeometry(0.7, 1.1); G(g, M.flame, x, gy + 1.3, z, i * Math.PI / 3); }
  if (light) MAP.lights.push({ x, y: gy + 1.5, z, color: 0xff8a3a, int: 1.6, dist: 16 });
}
function crate(x, z, s = 1, y = null, yaw = 0) {
  const gy = y === null ? terrainY(x, z) : y;
  G(new THREE.BoxGeometry(s, s, s), M.woodD, x, gy + s / 2, z, yaw);
  const e = Math.abs(Math.cos(yaw)) * s / 2 + Math.abs(Math.sin(yaw)) * s / 2, sh = (e - s / 2) * 0.6;
  addCollider(x - e + sh, gy, z - e + sh, x + e - sh, gy + s, z + e - sh, 'wood');
}
// burnt-out car: side silhouette extruded across the width, the window holes go right through
let _carGeo = null;
function carGeo() {
  if (_carGeo) return _carGeo;
  const sh = new THREE.Shape(), W = 1.68;
  sh.moveTo(-2.1, 0.25); sh.lineTo(-2.12, 0.72); sh.lineTo(-1.95, 0.86); sh.lineTo(-1.0, 0.93); sh.lineTo(-0.55, 1.32); sh.lineTo(0.72, 1.36); sh.lineTo(1.22, 0.96); sh.lineTo(2.02, 0.86); sh.lineTo(2.12, 0.62); sh.lineTo(2.1, 0.25);
  sh.lineTo(1.72, 0.25); sh.absarc(1.3, 0.25, 0.42, 0, Math.PI, false); sh.lineTo(-0.88, 0.25); sh.absarc(-1.3, 0.25, 0.42, 0, Math.PI, false); sh.lineTo(-2.1, 0.25);
  [[[-0.93, 0.99], [-0.56, 1.26], [0.06, 1.28], [0.06, 0.99]], [[0.16, 0.99], [0.16, 1.28], [0.68, 1.29], [1.08, 0.99]]].forEach(hp => { const p = new THREE.Path(); p.moveTo(hp[0][0], hp[0][1]); hp.slice(1).forEach(q => p.lineTo(q[0], q[1])); sh.holes.push(p); });
  const g = new THREE.ExtrudeGeometry(sh, { depth: W - 0.1, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.04, bevelSegments: 1, curveSegments: 5 });
  g.translate(0, 0, -(W - 0.1) / 2); _carGeo = g; return g;
}
function wreck(x, z, yaw, wheels = true) {
  const gy = terrainY(x, z), sink = wheels ? 0 : 0.14, roll = rr(-0.04, 0.04);
  G(carGeo(), M.burnt, x, gy - sink, z, yaw, roll, rr(-0.03, 0.03));
  const c = Math.cos(yaw), s = Math.sin(yaw), at = (u, v) => [x + c * u + s * v, z - s * u + c * v];
  [[1.3, 0.72], [1.3, -0.72], [-1.3, 0.72], [-1.3, -0.72]].forEach(([u, v]) => { if (!wheels && chance(0.6)) return; const [px, pz] = at(u, v); G(new THREE.CylinderGeometry(0.27, 0.27, 0.16, 10), M.rust, px, gy + 0.27 - sink, pz, yaw, Math.PI / 2); });
  rotBoxes(x, z, yaw, -2.0, 2.0, 0.78, gy + 0.2 - sink, gy + 0.84 - sink, 'metal');
  rotBoxes(x, z, yaw, -0.5, 0.7, 0.78, gy + 1.24 - sink, gy + 1.34 - sink, 'metal');
  return [x, z];
}
function container(cx, cz, alongX, mat, y = null, open = false) {
  const L = 6.06, W = 2.44, H = 2.59, hx = alongX ? L / 2 : W / 2, hz = alongX ? W / 2 : L / 2, y0 = y === null ? terrainY(cx, cz) : y;
  const x0 = cx - hx, x1 = cx + hx, z0 = cz - hz, z1 = cz + hz, y1 = y0 + H, t = 0.06;
  if (!open) B(x0, y0, z0, x1, y1, z1, mat, 'metal');
  else { B(x0, y0, z0, x1, y0 + 0.1, z1, M.woodD, 'wood'); B(x0, y1 - t, z0, x1, y1, z1, mat, 'metal');
    if (alongX) { B(x0, y0 + 0.1, z0, x1, y1 - t, z0 + t, mat, 'metal'); B(x0, y0 + 0.1, z1 - t, x1, y1 - t, z1, mat, 'metal'); B(x1 - t, y0 + 0.1, z0 + t, x1, y1 - t, z1 - t, mat, 'metal'); }
    else { B(x0, y0 + 0.1, z0, x0 + t, y1 - t, z1, mat, 'metal'); B(x1 - t, y0 + 0.1, z0, x1, y1 - t, z1, mat, 'metal'); B(x0 + t, y0 + 0.1, z1 - t, x1 - t, y1 - t, z1, mat, 'metal'); } }
  // corner posts stand slightly proud of the panels so nothing is coplanar
  [[x0, z0], [x1, z0], [x0, z1], [x1, z1]].forEach(([px, pz]) => B(px - 0.09, y0, pz - 0.09, px + 0.09, y1 + 0.01, pz + 0.09, M.rust, null));
}
function jersey(x, z, alongX = true) {
  const gy = terrainY(x, z), g = profileGeo([[-0.3, 0], [0.3, 0], [0.3, 0.08], [0.13, 0.3], [0.08, 0.81], [-0.08, 0.81], [-0.13, 0.3], [-0.3, 0.08]], 3.0, 0.01);
  if (!alongX) g.rotateY(Math.PI / 2); g.translate(x, gy - 0.03, z); staticAdd(g, M.concD, 3);
  for (const [y0, y1, hw] of [[0, 0.3, 0.25], [0.3, 0.78, 0.11]]) { if (alongX) addCollider(x - 1.5, gy + y0, z - hw, x + 1.5, gy + y1, z + hw); else addCollider(x - hw, gy + y0, z - 1.5, x + hw, gy + y1, z + 1.5); }   // the tapered profile in two tiers
}
function sandbags(x0, z0, x1, z1, layers = 3, gy = null) {
  const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0), len = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
  const n = Math.max(1, Math.round(len / 0.56)), bag = rboxGeo(0.56, 0.17, 0.32, 0.07, 1); if (gy === null) gy = terrainY((x0 + x1) / 2, (z0 + z1) / 2);
  for (let l = 0; l < layers; l++) for (let i = 0; i < n - (l % 2); i++) { const t = (i + 0.5 + (l % 2) * 0.5) / n; G(bag, M.rubble, lerp(x0, x1, t), gy + 0.085 + l * 0.165, lerp(z0, z1, t), (alongX ? 0 : Math.PI / 2) + rr(-0.08, 0.08)); }
  const h = layers * 0.165;
  addCollider(Math.min(x0, x1) - (alongX ? 0 : 0.15), gy, Math.min(z0, z1) - (alongX ? 0.15 : 0), Math.max(x0, x1) + (alongX ? 0 : 0.15), gy + h, Math.max(z0, z1) + (alongX ? 0.15 : 0), 'dirt');
}
// fences follow the ground span by span; bullets pass through (pickets / mesh), players and bots don't
function fence(pts, kind = 'picket', gaps = 0.15) {
  const h = kind === 'chain' ? 2.2 : 1.05, mat = kind === 'chain' ? M.chain : M.picket;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / 2.2));
    for (let k = 0; k < n; k++) {
      const x0 = lerp(ax, bx, k / n), z0 = lerp(az, bz, k / n), x1 = lerp(ax, bx, (k + 1) / n), z1 = lerp(az, bz, (k + 1) / n), y0 = terrainY(x0, z0), y1 = terrainY(x1, z1);
      if (kind === 'picket' && chance(gaps)) continue;
      const lean = kind === 'picket' && chance(0.2) ? rr(-0.25, 0.25) : 0, nx = -(z1 - z0) / (L / n), nz = (x1 - x0) / (L / n);
      const g = new THREE.BufferGeometry(), ly = h * Math.cos(lean), lo = h * Math.sin(lean), sl = L / n;
      g.setAttribute('position', new THREE.Float32BufferAttribute([x0, y0, z0, x1, y1, z1, x1 + nx * lo, y1 + ly, z1 + nz * lo, x0, y0, z0, x1 + nx * lo, y1 + ly, z1 + nz * lo, x0 + nx * lo, y0 + ly, z0 + nz * lo], 3));
      const u1 = kind === 'chain' ? sl / 0.7 : 1, v1 = kind === 'chain' ? h / 0.7 : 1;
      g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, u1, 0, u1, v1, 0, 0, u1, v1, 0, v1], 2)); g.computeVertexNormals();
      staticAdd(g, mat, 1, true);
      const post = kind === 'chain' ? M.metal : M.woodD, pr = kind === 'chain' ? 0.035 : 0.05;
      if (k === 0 || chance(0.9)) limb(x0, y0 - 0.1, z0, x0 + nx * lo * 1.05, y0 + h * 1.05, z0 + nz * lo * 1.05, pr, pr, post, 5);
      if (kind === 'chain') limb(x0, y0 + h, z0, x1, y1 + h, z1, 0.02, 0.02, post, 4);
      if (!lean) addCollider(Math.min(x0, x1) - 0.04, Math.min(y0, y1), Math.min(z0, z1) - 0.04, Math.max(x0, x1) + 0.04, Math.min(y0, y1) + h, Math.max(z0, z1) + 0.04, 'wood', false);
    }
  }
}
// telephone poles with sagging wires (wires are line segments: one draw call for the whole town)
const WIRES = [];
function poleAt(x, z, h = 8.6, yaw = 0) {
  const gy = terrainY(x, z), lx = rr(-0.25, 0.25), lz = rr(-0.25, 0.25), tx = x + lx, tz = z + lz, ty = gy + h;
  limb(x, gy - 0.3, z, tx, ty, tz, 0.15, 0.11, M.woodD, 6);
  const c = Math.cos(yaw), s = Math.sin(yaw);
  G(new THREE.BoxGeometry(2.0, 0.11, 0.11), M.woodD, tx, ty - 0.45, tz, yaw, 0, rr(-0.12, 0.12));
  const pts = [-0.85, 0, 0.85].map(o => [tx + c * o, ty - 0.34 + (o ? 0 : 0.5), tz - s * o]);
  pts.forEach(p => G(new THREE.CylinderGeometry(0.035, 0.045, 0.14, 5), M.dark, p[0], p[1] - 0.02, p[2]));
  addCollider(x - 0.13, gy, z - 0.13, x + 0.13, gy + 3.2, z + 0.13, 'wood');
  return pts;
}
function wireSpan(a, b, sag) {
  const n = 10, broken = chance(0.06);
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n, p = t => [lerp(a[0], b[0], t), lerp(a[1], b[1], t) - sag * 4 * t * (1 - t), lerp(a[2], b[2], t)];
    if (broken && t0 > 0.5) { const q = p(0.5), gy = terrainY(q[0], q[2]); WIRES.push(...q, q[0] + 0.3, gy + 0.05, q[2] + 0.4); break; }
    WIRES.push(...p(t0), ...p(t1));
  }
}
function poleLine(P, off, spacing, s0 = 0, s1 = 1e9) {
  let prev = null, acc = spacing * 0.5, s = 0;
  for (let i = 1; i < P.length; i++) {
    const d = Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); s += d; acc += d;
    if (acc < spacing || s < s0 || s > s1) continue; acc = 0;
    const a = P[i - 1], b = P[i], tl = d || 1, nx = -(b[1] - a[1]) / tl, nz = (b[0] - a[0]) / tl, x = b[0] + nx * off, z = b[1] + nz * off;
    if (Math.abs(x) > 158 || Math.abs(z) > 158 || inLot(x, z, 0.6) || nearRoad(x, z, 0.8)) { prev = null; continue; }
    const pts = poleAt(x, z, rr(8.2, 9.2), Math.atan2(-nz, nx));
    if (prev) pts.forEach((p, k) => wireSpan(prev[k], p, rr(0.45, 0.9)));
    prev = pts;
  }
}

// ---------- Buildings ----------
// o: {x0,z0,x1,z1, g, n floors, FH, mat, roof:'flat'|'gable'|'none', ruin 0..1, doors:[[side, frac, width]], shop:'S',
//     stair:'NE'.., access (stairs to the roof), win:{w,h,b,arch}, par, trim}
function bldg(o) {
  const t = o.t ?? 0.32, FH = o.FH ?? 3.2, n = o.n ?? 1, ruin = o.ruin ?? 0, mat = o.mat, c0 = COLL.length;
  const { x0, z0, x1, z1 } = o, W = x1 - x0, D = z1 - z0, g = o.g, fy = g + 0.08, yb = g - 0.6;
  const roof = o.roof || 'flat', gable = roof === 'gable', flat = roof === 'flat';
  const ridgeX = o.ridge ? o.ridge === 'x' : W >= D, span = ridgeX ? D : W, rise = gable ? (o.rise ?? span * 0.36) : 0, slope = rise / (span / 2);
  const eave = fy + n * FH, par = flat ? (o.par ?? 1.05) : 0, access = !!o.access && flat;
  const bi = { trim: o.trim || M.concD, doors: [], wins: [] };
  const S = {
    N: { ax: 'x', a0: x0, L: W, c: z0 + t / 2, out: -1, t, yb }, S: { ax: 'x', a0: x0, L: W, c: z1 - t / 2, out: 1, t, yb },
    W: { ax: 'z', a0: z0 + t, L: D - 2 * t, c: x0 + t / 2, out: -1, t, yb }, E: { ax: 'z', a0: z0 + t, L: D - 2 * t, c: x1 - t / 2, out: 1, t, yb },
  };
  const sp = o.stair ? stairPlan(x0, z0, x1, z1, t, o.stair, o.stairAx || (W >= D ? 'x' : 'z'), FH) : null;
  const Htop = eave + par - yb, minV = o.minV ?? (fy - yb + Math.min(FH * 0.9, 2.9)), winD = o.win || {};
  for (const k of ['N', 'S', 'W', 'E']) {
    const sd = S[k], L = sd.L, end = gable && (ridgeX ? k === 'W' || k === 'E' : k === 'N' || k === 'S');
    const nb = Math.max(1, Math.round(L / (o.bay ?? 3.2))), bw = L / nb, ops = [];
    const dirs = (o.doors || []).filter(d => d[0] === k), doorBay = new Map(dirs.map(d => [Math.min(nb - 1, Math.floor(d[1] * nb)), d[2]]));
    const isCorner = sd.ax === 'x', lo = isCorner ? t + 0.3 : 0.3, hi = L - lo;
    const winKind = f => { const r = rng(); return f === 0 ? (r < 0.4 ? 'board' : r < 0.75 ? 'frame' : 'none') : (r < 0.45 ? 'frame' : r < 0.7 ? 'board' : r < 0.85 ? 'none' : 'shut'); };
    for (let b = 0; b < nb; b++) {
      const uc = (b + 0.5) * bw;
      if (doorBay.has(b)) {
        const w = Math.max(1.5, Math.min(doorBay.get(b) || o.doorW || 1.9, bw - 0.5)), u = clamp(uc, lo + w / 2, hi - w / 2), dh = fy - yb + (o.doorH || 2.4);
        ops.push({ door: true, u0: u - w / 2, u1: u + w / 2, v0: 0, v1: dh, arch: o.archDoor, cu0: u - w / 2, cu1: u + w / 2, cv0: -1, cv1: dh - (o.archDoor ? w * 0.25 : 0) });
        bi.doors.push(lpt(sd, u, fy - yb, 0)); MAP.doors.push({ p: lpt(sd, u, fy - yb, 0), ax: sd.ax, w, h: dh - (fy - yb) });
      } else if (o.shop && o.shop.includes(k) && chance(0.8)) {
        const w = Math.max(1.5, bw - 0.8), u = clamp(uc, lo + w / 2, hi - w / 2), dh = fy - yb + 2.75;
        ops.push({ door: true, shop: true, u0: u - w / 2, u1: u + w / 2, v0: 0, v1: dh, cu0: u - w / 2, cu1: u + w / 2, cv0: -1, cv1: dh });
        bi.doors.push(lpt(sd, u, fy - yb, 0)); MAP.doors.push({ p: lpt(sd, u, fy - yb, 0), ax: sd.ax, w, h: dh - (fy - yb) });
      } else if (!chance(o.blank ?? 0.1)) {
        const wd = Math.min(winD.w ?? 1.25, bw - 0.7), u = clamp(uc, lo + wd / 2, hi - wd / 2), v0 = fy - yb + (winD.b0 ?? winD.b ?? 0.95), v1 = v0 + (winD.h0 ?? winD.h ?? 1.45);
        ops.push({ u0: u - wd / 2, u1: u + wd / 2, v0, v1, arch: winD.arch, kind: winKind(0), cu0: u - wd / 2, cu1: u + wd / 2, cv0: v0, cv1: winD.arch ? v1 - wd * 0.2 : v1, f: 0 });
      }
      for (let f = 1; f < n; f++) {
        if (chance(o.blank ?? 0.1)) continue;
        const wd = Math.min(winD.w ?? 1.25, bw - 0.7), u = clamp(uc, lo + wd / 2, hi - wd / 2), v0 = fy - yb + f * FH + (winD.b ?? 0.9), v1 = v0 + (winD.h ?? 1.5);
        if (chance(ruin * 0.3)) { const vc = (v0 + v1) / 2, rx = Math.min(bw / 2 - 0.3, rr(0.8, 1.2)), ry = Math.min(FH / 2 - 0.35, rr(0.8, 1.1)), ub = clamp(uc, lo + rx * 1.1 + 0.1, hi - rx * 1.1 - 0.1); ops.push({ poly: blastPoly(ub, vc, rx, ry), u0: ub - rx * 1.1, u1: ub + rx * 1.1, v0: vc - ry * 1.1, v1: vc + ry * 1.1, cu0: ub - rx * 0.55, cu1: ub + rx * 0.55, cv0: vc - ry * 0.55, cv1: vc + ry * 0.55, f }); }
        else { let kind = o.glow && chance(o.glow) ? 'glow' : winKind(f); if (kind === 'frame' && !o.dark && lrng() < 0.06) kind = 'glow';
          ops.push({ u0: u - wd / 2, u1: u + wd / 2, v0, v1, arch: winD.arch, kind, cu0: u - wd / 2, cu1: u + wd / 2, cv0: v0, cv1: winD.arch ? v1 - wd * 0.2 : v1, f }); }
      }
    }
    if (o.extraOps) o.extraOps(k, sd, ops);
    loopholes(o, sd, ops, nb, bw, fy - yb, FH, n, lo, hi);
    // top edge
    let top;
    if (end) {
      const dist = u => sd.ax === 'z' ? Math.min(u + t, D - t - u) : Math.min(u, W - u);
      top = ruinTop(L, u => eave - yb + slope * dist(u) - 0.04, ruin, ruin * (rise * 0.9 + (n > 1 ? FH * 0.4 : 0)), minV);
      if (!top.some(p => Math.abs(p[0] - L / 2) < 1e-3)) { top.push([L / 2, eave - yb + slope * dist(L / 2) - 0.04]); top.sort((a, b) => a[0] - b[0]); }
    } else {
      const maxDip = access ? Math.max(0, par - 0.55) : gable ? ruin * (n > 1 ? FH * 0.8 : 0.7) : ruin * (Htop - minV);
      top = ruin ? ruinTop(L, () => Htop, ruin, maxDip, access ? eave - yb + 0.5 : minV) : [[0, Htop], [L, Htop]];
    }
    // openings must stay inside the wall: drop windows the collapse ate, keep the wall standing over doors
    ops.forEach(op => { if (op.door) top.forEach(p => { if (p[0] > op.u0 - 0.5 && p[0] < op.u1 + 0.5) p[1] = Math.max(p[1], op.v1 + 0.5); }); });
    const keep = ops.filter(op => op.door || profMin(top, op.u0 - 0.2, op.u1 + 0.2) > op.v1 + 0.3);
    wallMesh(sd, top, keep, mat, o.cm || 'concrete');
    wallDecals(sd, top, keep, fy - yb, n, FH);
    keep.forEach(op => { if (op.loop && op.f === 0) LOOPS.push({ p: lpt(sd, (op.u0 + op.u1) / 2, fy - yb, -t / 2 - 0.75), yaw: yawTo(sd.ax === 'x' ? 0 : sd.out, sd.ax === 'x' ? sd.out : 0) }); dressOp(sd, op, bi); if (op.f === 0 && !op.door && !op.poly && op.v0 - (fy - yb) < 1.3) bi.wins.push({ p: lpt(sd, (op.u0 + op.u1) / 2, fy - yb, -t / 2 - 0.8), yaw: yawTo(sd.ax === 'x' ? 0 : sd.out, sd.ax === 'x' ? sd.out : 0) }); });
    // plinth, string courses at floor lines, coping on the parapet (only where the wall still stands)
    if (o.trims !== false) {
      const run = (v, fn) => { let s = null; for (let u = 0; u <= L + 1e-6; u += 0.25) { const ok = profAt(top, u) >= v - 0.01 && u < L; if (ok && s === null) s = u; if ((!ok || u + 0.25 > L) && s !== null) { const e = ok ? L : u; if (e - s > 0.4) fn(s, e); s = null; } } };
      const ext = (s, e) => [s < 0.01 ? (isCorner ? -0.11 : -t) : s, e > L - 0.01 ? (isCorner ? L + 0.11 : L + t) : e];   // trims wrap the corners without overlapping
      if (!o.noPlinth) { let s = 0; keep.filter(p => p.door).sort((a, b) => a.u0 - b.u0).concat([{ u0: L, u1: L }]).forEach(dp => { if (dp.u0 - s > 0.3) { const [a, b] = ext(s, dp.u0); lbox(sd, a, b, 0, fy - yb + 0.4, t / 2 + 0.002, t / 2 + 0.06, bi.trim); } s = dp.u1; }); }
      if (flat) for (let f = 1; f <= n; f++) { const v = fy - yb + f * FH - (f === n ? 0.05 : 0.1); run(v + 0.3, (s, e) => { const [a, b] = ext(s, e); lbox(sd, a, b, v - 0.16, v + 0.04, t / 2 + 0.002, t / 2 + 0.11, bi.trim); }); }
      if (flat) run(Htop, (s, e) => { const a = s < 0.01 ? (isCorner ? -0.05 : 0.06) : s, b = e > L - 0.01 ? (isCorner ? L + 0.05 : L - 0.06) : e; lbox(sd, a, b, Htop, Htop + 0.09, -t / 2 - 0.05, t / 2 + 0.05, bi.trim); });
    }
  }
  // ground slab, upper floors, roof
  const ix0 = x0 + t - 0.02, iz0 = z0 + t - 0.02, ix1 = x1 - t + 0.02, iz1 = z1 - t + 0.02;
  slab(ix0, iz0, ix1, iz1, g - 0.3, fy, o.floorMat || M.floor, [], o.house ? 'wood' : 'concrete');
  const hole = sp ? [sp.rect] : [], topF = access ? n : n - 1, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const far = sp ? { x0: (sp.rect.x0 + sp.rect.x1) / 2 < cx ? cx : ix0 + 0.5, x1: (sp.rect.x0 + sp.rect.x1) / 2 < cx ? ix1 - 0.5 : cx, z0: iz0 + 0.6, z1: iz1 - 0.6 } : { x0: ix0 + 0.6, x1: ix1 - 0.6, z0: iz0 + 0.6, z1: iz1 - 0.6 };
  const collapse = (r, k) => { const w = (r.x1 - r.x0) * k, d = (r.z1 - r.z0) * k, hx = rr(r.x0, r.x1 - w), hz = rr(r.z0, r.z1 - d); return { x0: hx, z0: hz, x1: hx + w, z1: hz + d }; };
  let ceil = eave - 0.3, dark = o.dark ?? 175;
  for (let f = 1; f < n; f++) {
    const y = fy + f * FH, hs = hole.slice();
    if (ruin > 0.55 && f === n - 1 && chance(0.7)) { const c = collapse(far, rr(0.55, 0.85)); hs.push(c); rubble((c.x0 + c.x1) / 2, (c.z0 + c.z1) / 2, Math.min(c.x1 - c.x0, c.z1 - c.z0) * 0.4, 0.7, y - FH); }
    slab(ix0, iz0, ix1, iz1, y - 0.25, y, o.slabMat || M.conc, hs, o.house ? 'wood' : 'concrete');
  }
  if (flat) {
    const hs = access ? hole.slice() : [];
    if (!access && ruin >= 0.5) { const c = collapse(far, rr(0.6, 0.9)); hs.push(c); ceil = fy + (n - 1) * FH - 0.25; dark = n > 1 ? dark : 0;
      rubble((c.x0 + c.x1) / 2, (c.z0 + c.z1) / 2, Math.min(c.x1 - c.x0, c.z1 - c.z0) * 0.35, 0.8, fy + (n - 1) * FH);
      const hx = c.x0 + 0.3, g2 = new THREE.BoxGeometry(c.x1 - c.x0 - 0.6, 0.22, Math.min(2.4, c.z1 - c.z0)); G(g2, M.conc, (c.x0 + c.x1) / 2, eave - 1.1, c.z0 + 1.0, 0, 0.75, 0); }
    slab(ix0, iz0, ix1, iz1, eave - 0.3, eave, M.conc, hs);
    if (access) { const sx = sp && (sp.rect.x0 + sp.rect.x1) / 2 < cx ? 1.4 : sp ? -1.4 : 0, ox = sx ? Math.sign(sx) * rr(0, 1.5) : rr(-2, 2);   // roof vent box, kept off the stair exit
      const bx = clamp(cx + sx + ox, ix0 + 0.9, ix1 - 0.9); B(bx - 0.8, eave, cz - 0.6, bx + 0.8, eave + 0.9, cz + 0.4, M.metal, 'metal'); }
  } else if (roof === 'none') { ceil = n > 1 ? fy + (n - 1) * FH - 0.25 : -99; dark = n > 1 ? 120 : 0; }
  if (gable) { gableRoof(o, x0, z0, x1, z1, eave, rise, ridgeX, ruin, t); ceil = eave + rise * 0.5; dark = ruin > 0.5 ? 110 : dark; }
  if (sp) for (let f = 0; f < topF; f++) { uStair(sp, fy + f * FH, FH, f === 0, o.stairMat || M.concD, o.house ? 'wood' : 'concrete'); stairRails(sp, fy + (f + 1) * FH, f + 1 === topF); }
  if (sp && topF > 0) MAP.stairs.push({ sp, y0: fy, FH, flights: topF, roof: access });
  if (dark && ceil > fy) occRect(x0 + t + 0.3, z0 + t + 0.3, x1 - t - 0.3, z1 - t - 0.3, dark, ceil);
  // bookkeeping: floors for pickups, ground windows for nests, interior for spawns
  const levels = []; for (let f = 0; f <= topF && f <= n; f++) if (f < n || access) levels.push(fy + f * FH);
  const spots = [];
  levels.forEach((y, f) => { for (let i = 0; i < 3; i++) { const px = rr(ix0 + 1, ix1 - 1), pz = rr(iz0 + 1, iz1 - 1); if (sp && px > sp.rect.x0 - 0.8 && px < sp.rect.x1 + 0.8 && pz > sp.rect.z0 - 0.8 && pz < sp.rect.z1 + 0.8) continue; spots.push({ x: px, y, z: pz, f }); } });
  const info = { o, g, fy, n, levels, spots, wins: bi.wins, doors: bi.doors, sp, ix0, iz0, ix1, iz1, c0 };
  furnish(info);
  MAP.buildings.push({ x0, z0, x1, z1, g, n, top: gable ? eave + rise : eave + par });
  markRect(x0, z0, x1, z1, 3);
  return info;
}
function gableRoof(o, x0, z0, x1, z1, eave, rise, ridgeX, ruin, t) {
  const oh = 0.42, th = 0.14, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, hl = (ridgeX ? x1 - x0 : z1 - z0) / 2 + 0.3, hs = (ridgeX ? z1 - z0 : x1 - x0) / 2;
  const slope = rise / hs, mat = o.roofMat || M.roof, nseg = Math.max(1, Math.round(2 * hl / 2.4)), sl = 2 * hl / nseg;
  const len = Math.hypot(hs + oh, rise + oh * slope), cs = (hs + oh) / len, sn = (rise + oh * slope) / len;
  const place = (geo, lx, ly, lz) => { if (!ridgeX) geo.rotateY(Math.PI / 2); const wx = ridgeX ? cx + lx : cx + lz, wz = ridgeX ? cz + lz : cz - lx; G(geo, geo.userData.m || mat, wx, ly, wz); };
  const coll = (lx0, lx1, lz0, lz1, y0, y1) => { if (ridgeX) addCollider(cx + lx0, y0, cz + lz0, cx + lx1, y1, cz + lz1, 'wood'); else addCollider(cx + lz0, y0, cz - lx1, cx + lz1, y1, cz - lx0, 'wood'); };
  for (const k of [-1, 1]) {
    let runS = null;
    // roof colliders: 0.35 m strips with flat tops a little under the slope's high edge and a little over its low edge
    const flush = j => { if (runS === null) return; const a = -hl + runS * sl, b = -hl + j * sl;
      for (let zz = 0; zz < hs - 0.01; zz += 0.35) { const zb = Math.min(hs, zz + 0.35), zm = lerp(zz, zb, 0.65), yu = eave + (hs - zm) * slope; coll(a, b, k > 0 ? zz : -zb, k > 0 ? zb : -zz, yu - 0.02, yu + th / cs + 0.02); }
      runS = null; };
    for (let j = 0; j < nseg; j++) {
      const lx = -hl + (j + 0.5) * sl, gone = ruin > 0.15 && chance(ruin * 0.6) && !(j === 0 && k < 0);
      if (!gone) {
        if (runS === null) runS = j;
        const gg = new THREE.BoxGeometry(sl + 0.004, th, len); gg.rotateX(k < 0 ? Math.atan2(-sn, cs) : Math.atan2(sn, cs));
        // centre of the panel: midway between eave overhang and ridge, lifted half a thickness off the underside line
        const mz = k * (hs + oh) / 2, my = eave - oh * slope + (rise + oh * slope) / 2;
        place(gg, lx, my + cs * th / 2, mz + k * sn * th / 2);
      } else {
        flush(j);
        for (const rx of [-sl / 4, sl / 4]) { const part = chance(0.35) ? rr(0.3, 0.7) : 1, rl = len * part, gg = new THREE.BoxGeometry(0.08, 0.14, rl); gg.rotateX(k < 0 ? Math.atan2(-sn, cs) : Math.atan2(sn, cs)); gg.userData.m = M.woodD;
          const f0 = 1 - part / 2, mz = k * (hs + oh) * (1 - f0), my = eave + rise - (rise + oh * slope) * (1 - f0); place(gg, lx + rx, my - 0.07, mz); }
      }
    }
    flush(nseg);
  }
  const rg = new THREE.BoxGeometry(2 * hl + 0.1, 0.16, 0.22); rg.userData.m = M.woodD; place(rg, 0, eave + rise + 0.06, 0);
  if (o.chimney !== false && chance(0.7)) { const lx = rr(-hl * 0.6, hl * 0.6), lz = rr(-hs * 0.4, hs * 0.4), wx = ridgeX ? cx + lx : cx + lz, wz = ridgeX ? cz + lz : cz - lx; B(wx - 0.35, eave, wz - 0.35, wx + 0.35, eave + rise + 0.9, wz + 0.35, M.brickD, null); }
}
// a little furniture and junk along the walls, never in front of doors or on the stairs
function furnish(info) {
  const { ix0, iz0, ix1, iz1, sp, doors, levels } = info;
  const bad = (x, z, r) => (sp && x > sp.rect.x0 - r - 1.4 && x < sp.rect.x1 + r + 1.4 && z > sp.rect.z0 - r - 1.4 && z < sp.rect.z1 + r + 1.4) || doors.some(d => Math.hypot(d[0] - x, d[2] - z) < 2.2 + r);
  levels.forEach((y, f) => {
    const cnt = f === 0 ? 3 : 2;
    for (let i = 0; i < cnt; i++) {
      const side = Math.floor(rng() * 4), r = 0.6;
      const x = side === 0 ? ix0 + 0.5 : side === 1 ? ix1 - 0.5 : rr(ix0 + 1, ix1 - 1), z = side === 2 ? iz0 + 0.5 : side === 3 ? iz1 - 0.5 : rr(iz0 + 1, iz1 - 1);
      if (bad(x, z, r)) continue;
      const k = rng();
      if (k < 0.35) { crate(x, z, rr(0.7, 1.0), y + 0.0); }
      else if (k < 0.55) { rubble(x, z, rr(0.6, 1.0), rr(0.35, 0.6), y); }
      else if (k < 0.75) { B(x - 0.5, y, z - 0.35, x + 0.5, y + 0.45, z + 0.35, M.woodD, 'wood'); B(x - 0.5, y + 0.45, z - 0.35, x + 0.5, y + 0.85, z - 0.2, M.woodD, 'wood'); }   // old sofa / bench
      else { B(x - 0.4, y, z - 0.4, x + 0.4, y + 0.72, z + 0.4, M.metal, 'metal'); }   // cabinet
      debris(x, z, 1.2, 4, y);
    }
    if (f < info.n) brokenFurniture(info, y, info.c0);
  });
}
function signBoard(x, y, z, alongX, out, idx, w = 3.2) {
  const h = w * 0.36, g = new THREE.PlaneGeometry(w, h), uv = g.attributes.uv, cu = (idx % 2) * 0.5, cv = idx < 2 ? 0.5 : 0;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, cu + uv.getX(i) * 0.5, cv + uv.getY(i) * 0.5);
  if (!alongX) g.rotateY(out > 0 ? Math.PI / 2 : -Math.PI / 2); else if (out < 0) g.rotateY(Math.PI);
  const ox = alongX ? 0 : out * 0.19, oz = alongX ? out * 0.19 : 0;
  G(g, M.sign, x + ox, y, z + oz);
  if (alongX) B(x - w / 2 - 0.05, y - h / 2 - 0.05, z + out * 0.13, x + w / 2 + 0.05, y + h / 2 + 0.05, z + out * 0.18, M.woodD, null);
  else B(x + out * 0.13, y - h / 2 - 0.05, z - w / 2 - 0.05, x + out * 0.18, y + h / 2 + 0.05, z + w / 2 + 0.05, M.woodD, null);
}

// ---------- Grim detail: decals, broken furniture, laundry, puddles ----------
// Its own random stream, so adding or tuning decoration never reshuffles the layout (spawns, trees, nests) above.
let drng = makeRng(4242), lrng = makeRng(6262), hrng = makeRng(5150);   // lrng: loopholes / lit windows, hrng: round-3 hides and cover
const dr = (a, b) => a + drng() * (b - a), dch = p => drng() < p;
// a decal on a wall face (atlas cell idx), 1.2 cm proud of it: log depth has no polygon offset
function decal(sd, u, v, w, h, idx, inside = false) {
  const g = new THREE.PlaneGeometry(w, h), uv = g.attributes.uv, cu = (idx % 4) * 0.25, cv = 1 - (Math.floor(idx / 4) + 1) * 0.5;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, cu + uv.getX(i) * 0.25, cv + uv.getY(i) * 0.5);
  const o = inside ? -sd.out : sd.out;
  if (sd.ax === 'x') { if (o < 0) g.rotateY(Math.PI); } else g.rotateY(o > 0 ? Math.PI / 2 : -Math.PI / 2);
  const [x, y, z] = lpt(sd, u, v, (inside ? -1 : 1) * (sd.t / 2 + 0.012)); G(g, M.decal, x, y, z);
}
// tags low on the street side, bullet pocks around windows, inside and out; never over an opening or a trim
function wallDecals(sd, top, ops, v0, n, FH) {
  const clear = (u, v, w, h) => u - w / 2 > 0.3 && u + w / 2 < sd.L - 0.3 && profMin(top, u - w / 2, u + w / 2) > v + h / 2 + 0.25 &&
    !ops.some(o => u + w / 2 > o.u0 - 0.18 && u - w / 2 < o.u1 + 0.18 && v + h / 2 > o.v0 - 0.32 && v - h / 2 < o.v1 + 0.3) && Math.abs(((v - v0) % FH + FH) % FH - FH / 2) < FH / 2 - h / 2 - 0.4;
  if (dch(0.45)) for (let k = 0; k < 4; k++) { const w = dr(1.2, 1.9), h = w * 0.62, u = dr(w / 2, sd.L - w / 2), v = v0 + dr(0.55 + h / 2, 2.3 - h / 2); if (clear(u, v, w, h)) { decal(sd, u, v, w, h, pick4(), false); break; } }
  ops.forEach(o => { if (o.door || !dch(0.3)) return; const s = dr(0.7, 1.3), side = dch(0.5) ? -1 : 1, u = side < 0 ? o.u0 - s / 2 - 0.2 : o.u1 + s / 2 + 0.2, v = (o.v0 + o.v1) / 2 + dr(-0.3, 0.3);
    if (clear(u, v, s, s)) decal(sd, u, v, s, s, dch(0.6) ? 4 : 5, dch(0.3)); });
  if (dch(0.15)) { const s = dr(1.4, 2.2), u = dr(s / 2, sd.L - s / 2), v = v0 + FH * Math.floor(dr(0, n)) + dr(0.9, 1.6); if (clear(u, v, s, s)) decal(sd, u, v, s, s, 6, dch(0.5)); }
}
const pick4 = () => [0, 1, 2, 3, 7][Math.floor(drng() * 5)];
// broken furniture against the walls of a room; pieces are axis-aligned so their colliders hug them
function brokenFurniture(info, y, c0) {
  const { ix0, iz0, ix1, iz1, sp, doors } = info;
  const busy = (x0, z0, x1, z1) => (sp && x1 > sp.rect.x0 - 1.4 && x0 < sp.rect.x1 + 1.4 && z1 > sp.rect.z0 - 1.4 && z0 < sp.rect.z1 + 1.4) || doors.some(d => Math.abs(d[1] - y) < 1 && x1 > d[0] - 1.6 && x0 < d[0] + 1.6 && z1 > d[2] - 1.6 && z0 < d[2] + 1.6) ||
    (() => { for (let i = c0; i < COLL.length; i++) { const c = COLL[i]; if (c.solid && c.y1 > y + 0.1 && c.y0 < y + 1.8 && x1 > c.x0 && x0 < c.x1 && z1 > c.z0 && z0 < c.z1) return true; } return false; })();
  const n = (ix1 - ix0) * (iz1 - iz0) > 60 ? 3 : 2;
  for (let i = 0; i < n * 3 && i < 12; i++) {
    const kind = Math.floor(drng() * 5), side = Math.floor(drng() * 4), alongX = side < 2;
    const [L, D] = kind === 0 ? [1.3, 0.75] : kind === 1 ? [2.0, 0.95] : kind === 2 ? [0.95, 0.38] : kind === 3 ? [1.9, 0.9] : [0.95, 0.4];
    const hx = alongX ? L / 2 : D / 2, hz = alongX ? D / 2 : L / 2;
    const x = side === 2 ? ix0 + 0.03 + hx : side === 3 ? ix1 - 0.03 - hx : dr(ix0 + hx + 0.2, ix1 - hx - 0.2), z = side === 0 ? iz0 + 0.03 + hz : side === 1 ? iz1 - 0.03 - hz : dr(iz0 + hz + 0.2, iz1 - hz - 0.2);
    if (ix1 - ix0 < 2 * hx + 0.5 || iz1 - iz0 < 2 * hz + 0.5 || busy(x - hx, z - hz, x + hx, z + hz)) continue;
    const X0 = x - hx, X1 = x + hx, Z0 = z - hz, Z1 = z + hz, wood = dch(0.5) ? M.woodD : M.wood;
    if (kind === 0) {   // table: upright with a leg snapped, or knocked onto its side
      if (dch(0.5)) { B(X0, y + 0.7, Z0, X1, y + 0.76, Z1, wood, 'wood'); [[X0 + 0.06, Z0 + 0.06], [X1 - 0.06, Z0 + 0.06], [X0 + 0.06, Z1 - 0.06], [X1 - 0.06, Z1 - 0.06]].forEach(([lx, lz], k) => B(lx - 0.03, y, lz - 0.03, lx + 0.03, y + (k === 3 && dch(0.5) ? 0.35 : 0.7), lz + 0.03, M.woodD, null)); }
      else {   // on its side: the top stands against the wall, the legs point into the room
        const s = side === 0 || side === 2 ? 1 : -1, w0 = side === 0 ? Z0 : side === 1 ? Z1 : side === 2 ? X0 : X1, w1 = w0 + s * 0.06, l1 = w1 + s * 0.66;
        if (alongX) B(X0, y, w0, X1, y + 0.75, w1, wood, 'wood'); else B(w0, y, Z0, w1, y + 0.75, Z1, wood, 'wood');
        for (const f of [0.06, 0.94]) for (const g of [0.08, 0.92]) { const a = lerp(alongX ? X0 : Z0, alongX ? X1 : Z1, f), yy = y + g * 0.75;
          if (alongX) B(a - 0.03, yy - 0.03, w1, a + 0.03, yy + 0.03, l1, M.woodD, null); else B(w1, yy - 0.03, a - 0.03, l1, yy + 0.03, a + 0.03, M.woodD, null); } }
    } else if (kind === 1) {   // bed: frame, a stained mattress half off it, the headboard
      B(X0, y, Z0, X1, y + 0.3, Z1, M.woodD, 'wood'); const ox = dr(-0.25, 0.25);
      B(X0 + 0.05 + (alongX ? ox : 0), y + 0.3, Z0 + 0.05 + (alongX ? 0 : ox), X1 - 0.05 + (alongX ? ox : 0), y + 0.46, Z1 - 0.05 + (alongX ? 0 : ox), M.plasterC, 'wood');
      if (alongX) B(X0, y, Z0, X0 + 0.06, y + 0.95, Z1, M.woodD, 'wood'); else B(X0, y, Z0, X1, y + 0.95, Z0 + 0.06, M.woodD, 'wood');
    } else if (kind === 2 || kind === 4) {   // shelf / wardrobe: standing, or face down on the floor
      const hgt = kind === 2 ? 1.8 : 1.9;
      if (dch(0.55)) { B(X0, y, Z0, X1, y + hgt, Z1, wood, 'wood'); for (let s = 1; s < 4; s++) { const sy = y + s * hgt / 4; if (alongX) B(X0 + 0.04, sy - 0.12, side === 0 ? Z1 : Z0 - 0.004, X1 - 0.04, sy + 0.12, side === 0 ? Z1 + 0.004 : Z0, M.dark, null); else B(side === 2 ? X1 : X0 - 0.004, sy - 0.12, Z0 + 0.04, side === 2 ? X1 + 0.004 : X0, sy + 0.12, Z1 - 0.04, M.dark, null); } }
      else {   // toppled away from its wall, face down
        const s = side === 0 || side === 2 ? 1 : -1, w0 = side === 0 ? Z0 : side === 1 ? Z1 : side === 2 ? X0 : X1, w1 = w0 + s * hgt;
        const r = alongX ? [X0, Math.min(w0, w1), X1, Math.max(w0, w1)] : [Math.min(w0, w1), Z0, Math.max(w0, w1), Z1];
        if (r[0] > ix0 && r[2] < ix1 && r[1] > iz0 && r[3] < iz1 && !busy(r[0], r[1], r[2], r[3])) B(r[0], y, r[1], r[2], y + D, r[3], wood, 'wood'); }
    } else {   // a mattress dragged off somewhere, papers everywhere
      G(new THREE.BoxGeometry(1.9, 0.12, 0.85), M.plasterC, x, y + 0.06, z, dr(0, TAU));
    }
    for (let k = 0; k < 5; k++) G(new THREE.BoxGeometry(dr(0.2, 0.32), 0.004, dr(0.22, 0.3)), dch(0.6) ? M.plasterA : M.plasterB, dr(ix0 + 0.3, ix1 - 0.3), y + 0.006 + k * 0.001, dr(iz0 + 0.3, iz1 - 0.3), dr(0, TAU));
  }
}
// washing line strung across a back yard; the sheets block sight like a bush does
function laundry(xa, za, xb, zb) {
  const L = Math.hypot(xb - xa, zb - za), ux = (xb - xa) / L, uz = (zb - za) / L, ya = terrainY(xa, za), yb = terrainY(xb, zb), top = 1.95;
  [[xa, za, ya], [xb, zb, yb]].forEach(([x, z, y]) => { limb(x, y - 0.2, z, x, y + top + 0.1, z, 0.05, 0.04, M.woodD, 5); addCollider(x - 0.05, y, z - 0.05, x + 0.05, y + top, z + 0.05, 'wood'); });
  const sag = 0.18, at = t => [lerp(xa, xb, t), lerp(ya, yb, t) + top - sag * 4 * t * (1 - t), lerp(za, zb, t)];
  for (let i = 0; i < 8; i++) { const p = at(i / 8), q = at((i + 1) / 8); WIRES.push(...p, ...q); }
  const mats = [M.plasterA, M.plasterB, M.plasterC, M.plasterA, M.concD];
  for (let t = 0.12; t < 0.9; t += dr(0.12, 0.22)) { if (dch(0.25)) continue;
    const w = dr(0.35, 0.8), h = dr(0.45, 0.95), [x, y, z] = at(t + w / L / 2), yaw = Math.atan2(-uz, ux);
    G(new THREE.BoxGeometry(w, h, 0.012), mats[Math.floor(drng() * mats.length)], x, y - h / 2 - 0.02, z, yaw, 0, dr(-0.04, 0.04));
    if (h > 0.7) addCollider(Math.min(x - ux * w / 2, x + ux * w / 2) - 0.05, y - h, Math.min(z - uz * w / 2, z + uz * w / 2) - 0.05, Math.max(x - ux * w / 2, x + ux * w / 2) + 0.05, y, Math.max(z - uz * w / 2, z + uz * w / 2) + 0.05, 'foliage', false, false);
    t += w / L; }
}
// a puddle: an irregular disc of still water, each vertex a few cm over the ground it sits on
function puddle(x, z, r) {
  const n = 12, pos = [], a0 = dr(0, TAU), ks = Array.from({ length: n }, () => dr(0.6, 1.15)), sx = dr(0.7, 1.3);
  const P = i => { const a = a0 + i / n * TAU, k = ks[i % n], px = x + Math.cos(a) * r * k * sx, pz = z + Math.sin(a) * r * k / sx; return [px, terrainY(px, pz) + 0.075, pz]; };
  const c = [x, terrainY(x, z) + 0.075, z];
  for (let i = 0; i < n; i++) pos.push(...c, ...P(i + 1), ...P(i));
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(n * 6).fill(0), 2)); g.computeVertexNormals();
  staticAdd(g, M.water, 1, true);
}
function overturned(x, z, yaw) {   // a car on its roof
  const gy = terrainY(x, z); G(carGeo(), M.burnt, x, gy + 1.38, z, yaw, Math.PI, dr(-0.03, 0.03));
  rotBoxes(x, z, yaw, -2.0, 2.0, 0.78, gy + 0.46, gy + 1.12, 'metal'); rotBoxes(x, z, yaw, -0.45, 0.65, 0.7, gy, gy + 0.44, 'metal');
}

// ---------- Foliage: alpha cards with vertex colours, batched per material ----------
const FB = {};
function fq(mat, a, b, c, d, nrm, col) {   // quad a-b-c-d (uv 00,10,11,01); nrm: one normal or four
  const e = FB[mat.uuid] || (FB[mat.uuid] = { mat, p: [], n: [], uv: [], c: [] }), N = nrm.length === 4 ? nrm : [nrm, nrm, nrm, nrm];
  [[a, 0, 0, 0], [b, 1, 0, 1], [c, 1, 1, 2], [a, 0, 0, 0], [c, 1, 1, 2], [d, 0, 1, 3]].forEach(([p, u, v, i]) => { e.p.push(p[0], p[1], p[2]); e.n.push(...N[i]); e.uv.push(u, v); e.c.push(col[0], col[1], col[2]); });
}
const nrmz = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
function cluster(mat, cx, cy, cz, s, ox, oy, oz, col) {   // 3 crossing cards; normals point away from the crown centre
  const yaw = rng() * TAU;
  for (let i = 0; i < 3; i++) {
    const a = yaw + i * Math.PI / 3, tl = rr(-0.5, 0.5), rx = Math.cos(a) * s / 2, rz = Math.sin(a) * s / 2, ux = -Math.sin(a) * Math.sin(tl) * s / 2, uy = Math.cos(tl) * s / 2, uz = Math.cos(a) * Math.sin(tl) * s / 2;
    const P = (sx, sy) => [cx + rx * sx + ux * sy, cy + uy * sy, cz + rz * sx + uz * sy], nr = (sx, sy) => { const p = P(sx, sy); return nrmz([p[0] - ox, (p[1] - oy) + 0.4 * s, p[2] - oz]); };
    const k = rr(0.85, 1.12); fq(mat, P(-1, -1), P(1, -1), P(1, 1), P(-1, 1), [nr(-1, -1), nr(1, -1), nr(1, 1), nr(-1, 1)], [col[0] * k, col[1] * k, col[2] * k]);
  }
}
const TREE_TINTS = [[0.95, 0.92, 0.78], [1.05, 0.9, 0.62], [0.82, 0.88, 0.72], [1.1, 0.85, 0.55], [0.9, 0.84, 0.7]];
function broadleaf(x, z, h, coll = true) {
  const gy = terrainY(x, z) - 0.1, lean = [rr(-0.4, 0.4), rr(-0.4, 0.4)], r0 = h * 0.03, tint = pick(TREE_TINTS);
  const tx = x + lean[0], tz = z + lean[1], ty = gy + h * 0.5;
  limb(x, gy - 0.2, z, tx, ty, tz, r0, r0 * 0.7, M.bark, 7);
  const C = [tx, gy + h * 0.68, tz], rx = h * 0.3, ry = h * 0.23;
  for (let i = 0, nb = 3 + Math.floor(rng() * 3); i < nb; i++) { const a = rng() * TAU; limb(tx, ty - 0.3, tz, tx + Math.cos(a) * rx * 0.75, ty + h * rr(0.12, 0.3), tz + Math.sin(a) * rx * 0.75, r0 * 0.55, r0 * 0.2, M.bark, 5); }
  for (let i = 0, nc = 16 + Math.floor(rng() * 8); i < nc; i++) {
    const a = rng() * TAU, e = Math.acos(rr(-0.5, 1)), rad = Math.pow(rng(), 0.4);
    const px = C[0] + Math.cos(a) * Math.sin(e) * rx * rad, py = C[1] + Math.cos(e) * ry * rad, pz = C[2] + Math.sin(a) * Math.sin(e) * rx * rad;
    cluster(M.fLeaf, px, py, pz, h * rr(0.22, 0.3), C[0], C[1], C[2], tint);
  }
  if (coll) { limbColl(x, gy, z, tx, ty, tz, r0, 'wood', r0 * 0.7);
    addCollider(C[0] - rx * 0.7, C[1] - ry * 0.7, C[2] - rx * 0.7, C[0] + rx * 0.7, C[1] + ry * 0.75, C[2] + rx * 0.7, 'foliage', false, false); }
}
function pine(x, z, h, coll = true) {
  const gy = terrainY(x, z) - 0.1, r0 = h * 0.022, tint = [rr(0.8, 0.95), rr(0.85, 1.0), rr(0.8, 0.92)];
  limb(x, gy - 0.2, z, x, gy + h * 0.97, z, r0, r0 * 0.25, M.bark, 6);
  const m = 7 + Math.floor(h / 3);
  for (let i = 0; i < m; i++) {
    const t = i / (m - 1), y = gy + h * (0.25 + 0.7 * t), len = h * 0.3 * Math.pow(1 - t * 0.85, 1.1) + 0.35, k = 5 + (t < 0.6 ? 1 : 0), a0 = rng() * TAU;
    for (let j = 0; j < k; j++) {
      const a = a0 + j * TAU / k + rr(-0.2, 0.2), ox = Math.cos(a), oz = Math.sin(a), tx = -oz, tz = ox, hw = len * 0.42, droop = -len * rr(0.28, 0.5);
      const P = [x - tx * hw * 0.3, y, z - tz * hw * 0.3], Q = [x + ox * len - tx * hw, y + droop, z + oz * len - tz * hw], R = [x + ox * len + tx * hw, y + droop, z + oz * len + tz * hw], S2 = [x + tx * hw * 0.3, y, z + tz * hw * 0.3];
      const sh = rr(0.85, 1.1) * (0.75 + 0.25 * t); fq(M.fPine, P, Q, R, S2, nrmz([ox * 0.6, 1, oz * 0.6]), [tint[0] * sh, tint[1] * sh, tint[2] * sh]);
    }
  }
  for (let i = 0; i < 2; i++) { const a = i * Math.PI / 2 + rng(), c = Math.cos(a) * h * 0.06, s = Math.sin(a) * h * 0.06, y0 = gy + h * 0.82, y1 = gy + h * 1.02; fq(M.fPine, [x - c, y0, z - s], [x + c, y0, z + s], [x + c, y1, z + s], [x - c, y1, z - s], [0, 0.6, 0.8], tint); }
  if (coll) { limbColl(x, gy, z, x, gy + h * 0.75, z, r0, 'wood', r0 * 0.44); const rad = h * 0.2; addCollider(x - rad, gy + h * 0.3, z - rad, x + rad, gy + h * 0.95, z + rad, 'foliage', false, false); }
}
function deadTree(x, z, h, coll = true) {
  const gy = terrainY(x, z) - 0.1, r0 = h * 0.035, tx = x + rr(-0.3, 0.3), tz = z + rr(-0.3, 0.3), ty = gy + h * 0.55;
  limb(x, gy - 0.2, z, tx, ty, tz, r0, r0 * 0.6, M.bark, 6);
  const grow = (ax, ay, az, dx, dy, dz, L, r, d) => {
    const bx = ax + dx * L, by = ay + dy * L, bz = az + dz * L; limb(ax, ay, az, bx, by, bz, r, r * 0.55, M.bark, d > 1 ? 5 : 4);
    if (d <= 0) return;
    for (let i = 0; i < (d > 1 ? 2 : 1 + (rng() < 0.5 ? 1 : 0)); i++) { const v = nrmz([dx + rr(-0.8, 0.8), dy + rr(-0.1, 0.6), dz + rr(-0.8, 0.8)]); grow(bx, by, bz, v[0], v[1], v[2], L * rr(0.5, 0.75), r * 0.55, d - 1); }
  };
  for (let i = 0, nb = 3 + Math.floor(rng() * 2); i < nb; i++) { const a = rng() * TAU, v = nrmz([Math.cos(a), rr(0.5, 1.4), Math.sin(a)]); grow(tx, ty - rr(0, h * 0.15), tz, v[0], v[1], v[2], h * rr(0.25, 0.35), r0 * 0.55, 2); }
  limb(tx, ty, tz, tx + rr(-0.3, 0.3), gy + h, tz + rr(-0.3, 0.3), r0 * 0.6, r0 * 0.1, M.bark, 5);
  if (coll) limbColl(x, gy, z, tx, ty, tz, r0, 'wood', r0 * 0.6);
}
function bush(x, z, s = 1, coll = true) {
  const gy = terrainY(x, z), tint = [rr(0.85, 1.05), rr(0.88, 1.02), rr(0.8, 0.92)];
  for (let i = 0, k = 6 + Math.floor(rng() * 4); i < k; i++) { const a = rng() * TAU, d = s * Math.sqrt(rng()) * 0.65, cy = gy + s * rr(0.3, 0.75); cluster(M.fBush, x + Math.cos(a) * d, cy, z + Math.sin(a) * d, s * rr(0.8, 1.05), x, gy, z, tint); }
  if (coll) addCollider(x - s * 0.75, gy, z - s * 0.75, x + s * 0.75, gy + s * 1.15, z + s * 0.75, 'foliage', false, false);
}
function hedge(xa, za, xb, zb, h = 1.6) {
  const L = Math.hypot(xb - xa, zb - za), n = Math.max(1, Math.round(L / 0.8)), tint = [rr(0.8, 0.95), rr(0.88, 1.0), rr(0.75, 0.85)];
  for (let i = 0; i <= n; i++) { if (chance(0.08)) continue; const x = lerp(xa, xb, i / n), z = lerp(za, zb, i / n), gy = terrainY(x, z);
    for (let j = 0; j < 2; j++) cluster(M.fBush, x + rr(-0.2, 0.2), gy + h * (0.35 + j * 0.4), z + rr(-0.2, 0.2), h * rr(0.7, 0.9), x, gy, z, tint); }
  const gy = Math.min(terrainY(xa, za), terrainY(xb, zb));
  addCollider(Math.min(xa, xb) - 0.55, gy, Math.min(za, zb) - 0.55, Math.max(xa, xb) + 0.55, gy + h * 1.05, Math.max(za, zb) + 0.55, 'foliage', false, false);
  markPath([[xa, za], [xb, zb]], 0.8, null);
}
// tall dry grass you can crawl into: instanced tufts plus a foliage volume for bot line of sight
const TALL = [];
function grassPatch(x, z, r, dens = 1) {
  const n = Math.round(r * r * 3.2 * dens);
  for (let i = 0; i < n; i++) { const a = rng() * TAU, d = r * Math.sqrt(rng()), px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d, k = sIdx(px, pz); if (k >= 0 && SURF.blk[k]) continue; TALL.push(px, pz, rr(0.8, 1.25) * (1 - 0.35 * d / r)); }
  const gy = terrainY(x, z), q = r * 0.72; addCollider(x - q, gy - 0.3, z - q, x + q, gy + 0.95, z + q, 'foliage', false, false);
}
function foliageBuild(scene) {
  Object.values(FB).forEach(e => {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(e.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(e.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(e.uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(e.c, 3)); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, e.mat); m.castShadow = true; m.receiveShadow = true; m.matrixAutoUpdate = false; scene.add(m);
  });
  // instanced grass: crossed quads
  const tuft = (w, h) => { const pos = [], uv = [], nor = []; for (let k = 0; k < 3; k++) { const a = k * Math.PI / 3, c = Math.cos(a) * w, s = Math.sin(a) * w;
      [[-c, 0, -s, 0, 0], [c, 0, s, 1, 0], [c, h, s, 1, 1], [-c, 0, -s, 0, 0], [c, h, s, 1, 1], [-c, h, -s, 0, 1]].forEach(([x, y, z, u, v]) => { pos.push(x, y, z); uv.push(u, v); nor.push(0, 1, 0); }); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); return g; };
  const inst = (geo, mat, list, scaleFn) => {
    const N = list.length / 3, im = new THREE.InstancedMesh(geo, mat, N), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new V3(), p = new V3(), col = new THREE.Color();
    for (let i = 0; i < N; i++) { const x = list[i * 3], z = list[i * 3 + 1], k = list[i * 3 + 2]; q.setFromAxisAngle(UP, rng() * TAU); sc.set(k, k * rr(0.75, 1.1), k); p.set(x, terrainY(x, z) - 0.04, z); m4.compose(p, q, sc); im.setMatrixAt(i, m4);
      const dry = rng(); col.setRGB(lerp(0.75, 1.05, dry), lerp(0.82, 0.92, dry), lerp(0.7, 0.68, dry)); im.setColorAt(i, col); }
    im.receiveShadow = true; im.castShadow = false; im.frustumCulled = false; scene.add(im); return im;
  };
  const gm = M.iGrass, tm = M.iTall;   // standard + unflipped normals: back faces of blades must not go black
  const short = [];
  for (let i = 0; i < 90000 && short.length < 11000 * 3; i++) {
    const x = rr(-168, 168), z = rr(-168, 168), k = sIdx(x, z); if (k >= 0 && (SURF.blk[k] || SURF.d[k] !== 0)) continue;
    const pn = Math.sin(x * 0.13 + Math.sin(z * 0.11) * 2) * Math.sin(z * 0.15 - x * 0.04); if (pn < -0.15 && rng() < 0.85) continue;
    short.push(x, z, rr(0.7, 1.35));
  }
  GRASS = inst(tuft(0.36, 0.46), gm, short); TALLGRASS = inst(tuft(0.42, 1.15), tm, TALL);
  if (WIRES.length) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(WIRES, 3)); const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x14120f })); l.matrixAutoUpdate = false; scene.add(l); }
}

// ---------- Round 3: sniper hides and approach cover out in the fields ----------
// Hedgerows with gaps, ditches with sandbag lips, collapsed walls, hay, hunting stands, truck wrecks, lanterns, a burning
// car, creek mist. Runs on its own random stream (hrng) before the vegetation, so the trees grow around it.
const lookYaw = (x, z, t) => yawTo(t[0] - x, t[1] - z);
function coverFree(x, z, r, y0 = 0.1, y1 = 2.2) {   // no road, lot or solid thing in the way
  if (Math.abs(x) > 155 || Math.abs(z) > 155 || nearRoad(x, z, r + 0.6) || inLot(x, z, r)) return false;
  const gy = terrainY(x, z); return !COLL.some(c => c.solid && c.mat !== 'foliage' && c.x1 > x - r && c.x0 < x + r && c.z1 > z - r && c.z0 < z + r && c.y1 > gy + y0 && c.y0 < gy + y1);
}
const nearDitch = (x, z, r) => DITCHES.some(D => { for (let i = 0; i < D.P.length - 1; i++) { const [ax, az] = D.P[i], [bx, bz] = D.P[i + 1]; if (x > Math.min(ax, bx) - r && x < Math.max(ax, bx) + r && z > Math.min(az, bz) - r && z < Math.max(az, bz) + r) return true; } return false; });
// an overgrown field boundary: bushes and saplings along old fence posts, broken where cattle pushed through
function hedgeRow(pts, h, look, gapP = 0.14) {
  const tint = [rr(0.8, 0.95), rr(0.86, 1.0), rr(0.72, 0.84)];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / 2.4)), ux = (bx - ax) / L, uz = (bz - az) / L;
    let prevPost = null;
    for (let k = 0; k < n; k++) {
      const x0 = lerp(ax, bx, k / n), z0 = lerp(az, bz, k / n), x1 = lerp(ax, bx, (k + 1) / n), z1 = lerp(az, bz, (k + 1) / n), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      if (!coverFree(cx, cz, 1.0, 0.1, 1.8) || nearDitch(cx, cz, 5)) { prevPost = null; continue; }
      if (chance(gapP)) { HIDES.push({ x: cx, z: cz, yaw: lookYaw(cx, cz, look), kind: 'gap' }); prevPost = null; continue; }
      const g0 = terrainY(x0, z0), g1 = terrainY(x1, z1), hh = h * rr(0.85, 1.15);
      for (let j = 0; j < 3; j++) { const t = (j + rr(0.2, 0.8)) / 3, x = lerp(x0, x1, t) + rr(-0.25, 0.25), z = lerp(z0, z1, t) + rr(-0.25, 0.25), gy = terrainY(x, z);
        cluster(M.fBush, x, gy + hh * rr(0.3, 0.45), z, hh * rr(0.75, 0.95), x, gy, z, tint); cluster(M.fBush, x, gy + hh * rr(0.65, 0.8), z, hh * rr(0.6, 0.8), x, gy, z, tint); }
      if (chance(0.22)) { const gy = terrainY(cx, cz); limb(cx, gy - 0.1, cz, cx + rr(-0.2, 0.2), gy + hh * 1.3, cz + rr(-0.2, 0.2), 0.05, 0.025, M.bark, 4); cluster(M.fLeaf, cx, gy + hh * 1.15, cz, hh * 1.1, cx, gy + hh * 0.5, cz, pick(TREE_TINTS)); }   // a sapling poking out
      for (let j = 0; j < 4; j++) { const t = rng(); TALL.push(lerp(x0, x1, t) + rr(-0.7, 0.7), lerp(z0, z1, t) + rr(-0.7, 0.7), rr(0.8, 1.1)); }
      const gy = Math.min(g0, g1); addCollider(Math.min(x0, x1) - 0.6, gy - 0.1, Math.min(z0, z1) - 0.6, Math.max(x0, x1) + 0.6, gy + hh * 1.02, Math.max(z0, z1) + 0.6, 'foliage', false, false);
      // the old fence it grew along: a leaning post per span and a sagging strand of wire
      if (chance(0.7)) { const lx = rr(-0.08, 0.08), lz = rr(-0.08, 0.08), top = [x0 + lx, g0 + 1.15, z0 + lz]; limb(x0, g0 - 0.2, z0, top[0], top[1], top[2], 0.055, 0.045, M.woodD, 5);
        addCollider(x0 - 0.06, g0, z0 - 0.06, x0 + 0.06, g0 + 1.1, z0 + 0.06, 'wood'); if (prevPost) wireSpan(prevPost, top, rr(0.1, 0.25)); prevPost = top; } else prevPost = null;
      markPath([[x0, z0], [x1, z1]], 0.7, null);
    }
  }
}
// ditch furniture: sandbag lips along the runs that face the look point (the front lip almost unbroken, the back one gappy)
function ditchWorks(D) {
  const P = D.P; let ammo = false;
  markPath(P, 2.4, 1);
  for (let i = 0; i < P.length - 1; i++) {
    const [ax, az] = P[i], [bx, bz] = P[i + 1], alongX = Math.abs(bx - ax) > Math.abs(bz - az), L = Math.abs(alongX ? bx - ax : bz - az);
    if (L < 6) continue;   // the short zig connectors stay open: they are the way in and out
    const mx = (ax + bx) / 2, mz = (az + bz) / 2, fs = alongX ? Math.sign(D.look[1] - mz) : Math.sign(D.look[0] - mx), n = Math.round(L / 2.2);
    for (const side of [fs, -fs]) for (let k = 0; k < n; k++) {
      const t0 = (k + 0.08) / n, t1 = (k + 0.92) / n, off = side * 4.4, x0 = lerp(ax, bx, t0) + (alongX ? 0 : off), x1 = lerp(ax, bx, t1) + (alongX ? 0 : off), z0 = lerp(az, bz, t0) + (alongX ? off : 0), z1 = lerp(az, bz, t1) + (alongX ? off : 0);
      const px = (x0 + x1) / 2, pz = (z0 + z1) / 2, onOther = [[x0, z0], [px, pz], [x1, z1]].some(([qx, qz]) => P.some((q, j) => { if (j === i || j >= P.length - 1) return false; const r = P[j + 1], dx = r[0] - q[0], dz = r[1] - q[1], tt = clamp(((qx - q[0]) * dx + (qz - q[1]) * dz) / (dx * dx + dz * dz), 0, 1); return Math.hypot(qx - q[0] - dx * tt, qz - q[1] - dz * tt) < 4.4; }));
      if (onOther || !coverFree(px, pz, 0.6, 0.05, 1.8)) continue;   // only on the level rim: never on the bank of the next run, where it would be a wall from below
      if (chance(side === fs ? 0.08 : 0.4)) { if (side !== fs) HIDES.push({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, yaw: lookYaw(mx, mz, D.look), kind: 'ditch' }); continue; }
      // bed the bags on the lowest ground either side, so the lip is always a step (never a wall) climbing out of the ditch
      const ix = alongX ? 0 : -side * 0.55, iz = alongX ? -side * 0.55 : 0, lo = Math.min(...[[x0, z0], [px, pz], [x1, z1]].flatMap(([qx, qz]) => [terrainY(qx, qz), terrainY(qx + ix, qz + iz), terrainY(qx - ix, qz - iz)]));
      sandbags(x0, z0, x1, z1, 2, lo + 0.06);
    }
    if (!ammo) { ammo = true; HIDES.push({ x: mx, z: mz, ammo: true }); }
    for (let k = 0; k < 3; k++) { const t = rr(0.1, 0.9); G(new THREE.BoxGeometry(rr(1.2, 2.0), 0.035, 0.3), chance(0.5) ? M.wood : M.woodD, lerp(ax, bx, t), terrainY(lerp(ax, bx, t), lerp(az, bz, t)) + 0.03, lerp(az, bz, t), alongX ? rr(-0.1, 0.1) : Math.PI / 2 + rr(-0.1, 0.1)); }   // duckboards
  }
}
// a collapsed wall: stubs of masonry at knee to chest height, gaps, the odd loophole, rubble spilled both sides
function ruinWall(xa, za, xb, zb, look, mat = M.brick) {
  const alongX = Math.abs(xb - xa) > Math.abs(zb - za), L = Math.abs(alongX ? xb - xa : zb - za), s0 = alongX ? Math.min(xa, xb) : Math.min(za, zb), c = alongX ? za : xa, t = 0.42;
  const behind = alongX ? -Math.sign(look[1] - c) : -Math.sign(look[0] - c);
  const box = (u0, u1, y0, y1, gy) => { if (alongX) B(s0 + u0, gy + y0, c - t / 2, s0 + u1, gy + y1, c + t / 2, mat); else B(c - t / 2, gy + y0, s0 + u0, c + t / 2, gy + y1, s0 + u1, mat); };
  for (let u = 0; u < L - 0.5;) {
    const len = Math.min(L - u, rr(1.0, 2.2)), um = u + len / 2, wx = alongX ? s0 + um : c, wz = alongX ? c : s0 + um;
    if (!coverFree(wx, wz, 0.5, 0.05, 1.8) || chance(0.15)) { u += len + rr(0.6, 1.0); continue; }
    const gy = Math.min(terrainY(alongX ? s0 + u : c, alongX ? c : s0 + u), terrainY(alongX ? s0 + u + len : c, alongX ? c : s0 + u + len)) - 0.15, h = rr(0.55, 1.55);
    if (h > 1.25 && len > 1.2 && chance(0.45)) {   // loophole: a slot at crouch height
      const a = um - 0.17, b = um + 0.17; box(u, u + len, 0, 1.0, gy); box(u, a, 1.0, h, gy); box(b, u + len, 1.0, h, gy); box(a, b, 1.3, h, gy);
      HIDES.push({ x: wx + (alongX ? 0 : behind * 0.85), z: wz + (alongX ? behind * 0.85 : 0), yaw: lookYaw(wx, wz, look), kind: 'loop' });
    } else { box(u, u + len, 0, h, gy); if (h < 0.85) HIDES.push({ x: wx + (alongX ? 0 : behind * 0.95), z: wz + (alongX ? behind * 0.95 : 0), yaw: lookYaw(wx, wz, look), kind: 'low' }); }
    if (chance(0.6)) { const sd = chance(0.5) ? 1 : -1, d = t / 2 + rr(0.6, 0.9); rubble(wx + (alongX ? rr(-0.4, 0.4) : sd * d), wz + (alongX ? sd * d : rr(-0.4, 0.4)), rr(0.6, 1.0), rr(0.35, 0.6)); }
    u += len + (chance(0.3) ? rr(0.5, 0.9) : 0);
  }
  debris((xa + xb) / 2, (za + zb) / 2, L * 0.5, Math.round(L), null);
}
function roundBale(x, z, alongX) {
  const r = 0.75, L = 1.3, gy = terrainY(x, z) - 0.04;
  G(new THREE.CylinderGeometry(r, r, L, 14, 1), M.hay, x, gy + r, z, alongX ? 0 : Math.PI / 2, 0, Math.PI / 2);
  for (const [hw, y0, y1] of [[0.66, 0.4, 1.1], [0.5, 0.19, 1.31], [0.25, 0.04, 1.46]]) { if (alongX) addCollider(x - L / 2, gy + y0, z - hw, x + L / 2, gy + y1, z + hw, 'dirt'); else addCollider(x - hw, gy + y0, z - L / 2, x + hw, gy + y1, z + L / 2, 'dirt'); }
}
function haystack(x, z, r, h) {
  const gy = terrainY(x, z) - 0.15, prof = [[0.01, h], [0.32 * r, 0.95 * h], [0.7 * r, 0.75 * h], [0.95 * r, 0.42 * h], [r, 0.12 * h], [0.92 * r, 0]].map(p => new THREE.Vector2(p[0], p[1]));
  const g = new THREE.LatheGeometry(prof.reverse(), 11); g.computeVertexNormals(); G(g, M.hay, x, gy, z, rr(0, TAU));
  for (const [hr, y0, y1] of [[0.66, 0, 0.42], [0.5, 0.42, 0.75], [0.22, 0.75, 0.95]]) addCollider(x - hr * r, gy + y0 * h, z - hr * r, x + hr * r, gy + y1 * h, z + hr * r, 'dirt');
}
// two or three courses of square bales; the top course has gaps to shoot through
function baleWall(x, z, alongX, n, look) {
  const bl = 1.1, bh = 0.45, bd = 0.55, gy = Math.min(terrainY(x - (alongX ? n * bl / 2 : 0), z - (alongX ? 0 : n * bl / 2)), terrainY(x + (alongX ? n * bl / 2 : 0), z + (alongX ? 0 : n * bl / 2))) - 0.03;
  const bs = alongX ? -Math.sign(look[1] - z) : -Math.sign(look[0] - x);
  const put = (u, l) => { const y0 = gy + l * bh; if (alongX) B(x + u + 0.02, y0, z - bd / 2, x + u + bl - 0.02, y0 + bh, z + bd / 2, M.hay, 'dirt'); else B(x - bd / 2, y0, z + u + 0.02, x + bd / 2, y0 + bh, z + u + bl - 0.02, M.hay, 'dirt'); };
  const u0 = -n * bl / 2, L0 = [], L1 = [];
  for (let i = 0; i < n; i++) { L0.push(true); put(u0 + i * bl, 0); }
  for (let i = 0; i < n - 1; i++) { const k = !chance(0.22); L1.push(k); const u = u0 + i * bl + bl / 2;
    if (k) put(u, 1); else { const cu = u + bl / 2; HIDES.push({ x: alongX ? x + cu : x + bs * 1.0, z: alongX ? z + bs * 1.0 : z + cu, yaw: lookYaw(alongX ? x + cu : x, alongX ? z : z + cu, look), kind: 'bale' }); } }
  for (let i = 1; i < n - 1; i++) if (L1[i - 1] && L1[i] && !chance(0.5)) put(u0 + i * bl, 2);
}
// a hunting stand: platform on four legs, a steep wooden stair, a waist-high screen dressed with cut brush, a tin roof
function huntStand(x, z, face) {
  const H = 3.2, e = 1.0, fx = face === '+x' ? 1 : face === '-x' ? -1 : 0, fz = face === '+z' ? 1 : face === '-z' ? -1 : 0;
  const gy = Math.min(...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => terrainY(x + a * e, z + b * e))) - 0.05, P = gy + H;
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => { const bx = x + a * (e + 0.12), bz = z + b * (e + 0.12), ty = terrainY(bx, bz); limb(bx, ty - 0.2, bz, x + a * (e - 0.08), P + 2.15, z + b * (e - 0.08), 0.07, 0.06, M.woodD, 5); limbColl(bx, ty, bz, x + a * (e - 0.08), P + 2.15, z + b * (e - 0.08), 0.07, 'wood', 0.06); });
  B(x - e, P - 0.14, z - e, x + e, P, z + e, M.wood, 'wood');
  // screens on the three sides that aren't the stair side; the stair comes up the back
  const scr = (sx, sz) => { const lat = sx ? 'z' : 'x', y0 = P, y1 = P + 0.95;
    if (sx) B(x + sx * (e - 0.05), y0, z - e, x + sx * e, y1, z + e, M.woodD, 'wood'); else B(x - e, y0, z + sz * (e - 0.05), x + e, y1, z + sz * e, M.woodD, 'wood'); void lat; };
  scr(fx, fz); if (fx) { scr(0, 1); scr(0, -1); } else { scr(1, 0); scr(-1, 0); }
  const bx = -fx, bz = -fz;   // back side: two short screen pieces either side of the opening
  if (bx) { B(x + bx * (e - 0.05), P, z - e, x + bx * e, P + 0.95, z - 0.47, M.woodD, 'wood'); B(x + bx * (e - 0.05), P, z + 0.47, x + bx * e, P + 0.95, z + e, M.woodD, 'wood'); }
  else { B(x - e, P, z + bz * (e - 0.05), x - 0.47, P + 0.95, z + bz * e, M.woodD, 'wood'); B(x + 0.47, P, z + bz * (e - 0.05), x + e, P + 0.95, z + bz * e, M.woodD, 'wood'); }
  B(x - e - 0.2, P + 2.15, z - e - 0.2, x + e + 0.2, P + 2.21, z + e + 0.2, M.corr, 'metal');
  const L = Math.round(H / 0.2) * 0.28, dir = (bx > 0 ? '-x' : bx < 0 ? '+x' : bz > 0 ? '-z' : '+z');
  straightStair(x + bx * (e + L), z + bz * (e + L), dir, 0.9, gy, H, M.woodD, 'wood');
  // brush tied to the screen: you can see out over it, nobody sees in
  const tint = [rr(0.8, 0.92), rr(0.85, 0.98), rr(0.72, 0.82)];
  for (let i = 0; i < 9; i++) { const s = rr(-0.85, 0.85), side = i % 3, ox = side === 0 ? fx * (e + 0.12) : fx ? s : (side === 1 ? 1 : -1) * (e + 0.12), oz = side === 0 ? fz * (e + 0.12) : fz ? s : (side === 1 ? 1 : -1) * (e + 0.12);
    const px = x + (side === 0 && fz ? s : ox), pz = z + (side === 0 && fx ? s : oz); cluster(M.fBush, px, P + rr(0.3, 0.75), pz, rr(0.7, 0.95), x, P, z, tint); }
  addCollider(x - e - 0.35, P - 0.3, z - e - 0.35, x + e + 0.35, P + 1.1, z + e + 0.35, 'foliage', false, false);
  markRect(x - e - 1, z - e - 1, x + e + 1, z + e + 1, null);
  HIDES.push({ x, y: P, z, plate: true, f: 1 });
}
// a burnt-out flatbed truck: open cab you can shoot through, a high bed with daylight under it
function truck(x, z, alongX, flip = 1) {
  const gy = terrainY(x, z) - 0.03, bx = (a0, a1, l0, l1, y0, y1, mat, cm = 'metal') => { a0 *= flip; a1 *= flip; if (alongX) B(x + a0, gy + y0, z + l0, x + a1, gy + y1, z + l1, mat, cm); else B(x + l0, gy + y0, z + a0, x + l1, gy + y1, z + a1, mat, cm); };
  bx(1.6, 3.6, -1.1, 1.1, 0.55, 1.55, M.burnt);                                    // engine and lower cab
  bx(1.6, 1.74, -1.1, 1.1, 1.55, 2.45, M.rust); bx(1.6, 3.35, -1.1, 1.1, 2.45, 2.55, M.rust);   // back wall, roof
  for (const l of [-1, 1]) bx(3.22, 3.35, l > 0 ? 0.98 : -1.1, l > 0 ? 1.1 : -0.98, 1.55, 2.45, M.rust);   // windscreen pillars (the glass is long gone)
  for (const l of [-1, 1]) bx(-3.6, 1.6, l * 0.6 - 0.08, l * 0.6 + 0.08, 0.62, 0.85, M.burnt);              // chassis rails
  bx(-3.6, 1.55, -1.15, 1.15, 0.85, 1.0, M.woodD, 'wood');
  for (const l of [-1, 1]) { let a = -3.6; while (a < 1.5) { const len = Math.min(1.5 - a, rr(0.8, 1.8)); if (!chance(0.3)) bx(a, a + len, l > 0 ? 1.08 : -1.15, l > 0 ? 1.15 : -1.08, 1.0, rr(1.25, 1.55), M.woodD, 'wood'); a += len + rr(0.1, 0.5); } }
  for (const a of [-2.7, -1.75, 2.6]) for (const l of [-1, 1]) { if (a < 0 && chance(0.15)) continue;
    const ax = x + (alongX ? a * flip : l * 0.98), az = z + (alongX ? l * 0.98 : a * flip); G(new THREE.CylinderGeometry(0.48, 0.48, 0.3, 10), M.burnt, ax, gy + 0.48, az, alongX ? 0 : Math.PI / 2, Math.PI / 2);
    if (alongX) addCollider(ax - 0.36, gy, az - 0.15, ax + 0.36, gy + 0.9, az + 0.15, 'metal'); else addCollider(ax - 0.15, gy, az - 0.36, ax + 0.15, gy + 0.9, az + 0.36, 'metal'); }
}
// a car still burning: flames in the cabin and engine bay, the one real light it brings
function burningCar(x, z, yaw) {
  wreck(x, z, yaw, false); const gy = terrainY(x, z), c = Math.cos(yaw), s = Math.sin(yaw);
  [[1.5, 0.95, 0.75], [0.1, 1.1, 0.85], [-1.3, 0.9, 0.55]].forEach(([u, hy, sz]) => { const px = x + c * u, pz = z - s * u; for (let i = 0; i < 2; i++) G(new THREE.PlaneGeometry(sz, sz * 1.5), M.flame, px + rr(-0.15, 0.15), gy + hy + sz * 0.45, pz + rr(-0.15, 0.15), i * Math.PI / 2 + rr(0, 0.5)); });   // small: additive + bloom adds up fast
  MAP.lights.push({ x: x + c * 0.4, y: gy + 2.0, z: z - s * 0.4, color: 0xff7a2e, int: 2.0, dist: 18 });
  const g = new THREE.PlaneGeometry(6.5, 4.2), uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.5 + uv.getX(i) * 0.25, uv.getY(i) * 0.5);   // scorched ground (atlas cell 6)
  g.rotateX(-Math.PI / 2); g.rotateY(yaw); G(g, M.decal, x, gy + 0.09, z);
}
// a storm lantern on a bracket, glowing warm (emissive only: no light of its own)
function lantern(x, y, z, nx, nz) {
  const ax = x - nx * 0.32, az = z - nz * 0.32;
  B(Math.min(ax, x) - 0.02, y + 0.33, Math.min(az, z) - 0.02, Math.max(ax, x) + 0.02, y + 0.37, Math.max(az, z) + 0.02, M.metal, null);
  WIRES.push(x, y + 0.33, z, x, y + 0.28, z);
  G(new THREE.CylinderGeometry(0.1, 0.12, 0.28, 6, 1), M.lamp, x, y + 0.02, z); G(new THREE.ConeGeometry(0.15, 0.13, 6, 1), M.metal, x, y + 0.22, z); G(new THREE.CylinderGeometry(0.13, 0.13, 0.03, 6, 1), M.metal, x, y - 0.13, z);
}
function hides(infos) {
  const keep = rng; rng = hrng;
  DITCHES.forEach(ditchWorks);
  // hedgerows along the field boundaries; every run has gaps, so no field is one long open lane
  [[[[98, -30], [150, -30]], [70, -30]], [[[138, -68], [138, -36]], [100, -50]], [[[138, -24], [138, -10]], [100, -20]], [[[92, 24], [150, 24]], [110, -6]], [[[120, 6], [120, 36]], [80, 20]],
   [[[120, 54], [120, 68]], [80, 60]], [[[32, 40], [92, 40]], [60, 5]], [[[60, 61], [100, 63]], [70, 30]], [[[-150, -14], [-104, -14]], [-110, 0]], [[[48, -40], [100, -40]], [40, -20]],
   [[[-150, 36], [-126, 38]], [-110, 25]], [[[-64, -112], [-46, -114]], [-60, -70]], [[[10, -112], [36, -114]], [20, -84]]].forEach(([pts, look]) => hedgeRow(pts, rr(1.5, 1.9), look));
  // collapsed walls: a farmstead in the east field, field barns, an old boundary wall
  [[126, 28, 136, 28, [110, -6]], [136, 28, 136, 36, [160, 30]], [126, 36, 131, 36, [126, 70]], [126, 28, 126, 33, [100, 30]], [70, -50, 82, -50, [60, -10]], [82, -50, 82, -44, [110, -40]],
   [44, 50, 56, 50, [40, 10]], [56, 50, 56, 54, [90, 52]], [-150, -30, -142, -30, [-110, -20]], [-150, -30, -150, -22, [-170, -26]], [-6, -100, 6, -100, [0, -66]], [-36, 84, -24, 84, [-30, 60]], [-24, 84, -24, 90, [0, 88]],
   [-128, 50, -118, 50, [-110, 20]], [100, 70, 110, 70, [100, 30]]].forEach(([xa, za, xb, zb, look], i) => ruinWall(xa, za, xb, zb, look, i % 3 === 2 ? M.stone : M.brick));
  // hay: round bales by the barn and out in the fields, ricks, square-bale walls
  [[112, -62, 1], [114, -61, 1], [126, -60, 0], [134, -58, 1], [105, 30, 0], [110, 12, 1], [142, 14, 0], [143.6, 14.2, 0], [102, -18, 1], [146, 56, 0], [80, 50, 1], [36, 52, 0], [-140, -50, 1], [-138.4, -50.2, 1], [-120, 8, 0], [70, 54, 0]]
    .forEach(([x, z, ax]) => { if (coverFree(x, z, 0.9)) roundBale(x, z, !!ax); });
  [[130, -52, 2.2, 3.0, [90, -40]], [146, -44, 2.0, 2.8, [110, -30]], [106, 60, 2.3, 3.1, [70, 40]], [-142, -4, 2.0, 2.7, [-100, -10]], [92, -60, 2.0, 2.6, [50, -50]]].forEach(([x, z, r, h, look]) => {
    if (!coverFree(x, z, r)) return; haystack(x, z, r, h);   // the nest is at the rick's shoulder, peeking past it
    const L = Math.hypot(look[0] - x, look[1] - z), px = -(look[1] - z) / L, pz = (look[0] - x) / L, sd = chance(0.5) ? 1 : -1, nx = x + px * sd * (r + 0.9), nz = z + pz * sd * (r + 0.9);
    HIDES.push({ x: nx, z: nz, yaw: lookYaw(nx, nz, look), kind: 'rick' }); });
  [[112, -48, false, 5, [60, -40]], [60, 47, true, 6, [60, 5]], [-112, 44, true, 5, [-110, 10]], [128, 4, false, 4, [80, 5]]].forEach(([x, z, ax, n, look]) => { if (coverFree(x, z, n * 0.6)) baleWall(x, z, ax, n, look); });
  // hunting stands at the wood edges, looking back over the fields into town
  [[148, -22, '-x'], [150, 58, '-x'], [-148, 32, '+x'], [-20, -121, '+z'], [40, -126, '+z']].forEach(([x, z, f]) => { if (coverFree(x, z, 3.2)) huntStand(x, z, f); });
  // truck wrecks on the back roads
  [[115.6, -44, false, 1], [95, 101.4, true, -1], [-91.5, 19.6, true, 1], [-75, 118, false, 1]].forEach(([x, z, ax, fl]) => truck(x, z, ax, fl));
  // a car burning on the south road, the creek mist, lanterns by some doors
  burningCar(18.6, 30, Math.PI / 2 + 0.15);
  [[0.9, 40, 0], [1.7, 55, 0.37]].forEach(([dy, vs, vo]) => { const flat = CREEK.bed.map(b => b + 0.35 + dy), g0 = STATIC.has(M.fogBank) ? STATIC.get(M.fogBank).geos.length : 0;
    ribbon(CREEK.P, -10, 10, 0, M.fogBank, { flatY: flat, nA: 3, across: true, vs }); const ge = STATIC.get(M.fogBank).geos[g0], uv = ge.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) + vo); });
  MAP.doors.forEach(d => { if (hrng() > 0.1) return; const [px, py, pz] = d.p, nx = d.ax === 'x' ? 0 : 1, nz = d.ax === 'x' ? 1 : 0;
    const inB = (x, z) => MAP.buildings.some(b => x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1), sgn = inB(px + nx * 0.6, pz + nz * 0.6) ? -1 : 1, off = d.w / 2 + 0.45;
    const lx = px + sgn * nx * 0.5 + (d.ax === 'x' ? off : 0), lz = pz + sgn * nz * 0.5 + (d.ax === 'x' ? 0 : off); lantern(lx, py + 2.1, lz, sgn * nx, sgn * nz); });
  { const gy = terrainY(68, 14); [[65, 12.5], [71, 17]].forEach(([x, z]) => { WIRES.push(x, gy + 4.4, z, x, gy + 3.8, z); G(new THREE.CylinderGeometry(0.1, 0.12, 0.28, 6, 1), M.lamp, x, gy + 3.6, z); G(new THREE.ConeGeometry(0.15, 0.13, 6, 1), M.metal, x, gy + 3.8, z); }); }
  rng = keep;
}

// ---------- Layout ----------
let ROADS = [], CREEK = null, LOTS = [], DITCHES = [];
const HIDES = [], LOOPS = [];   // nest candidates from the round-3 cover and from ground-floor loopholes
const inLot = (x, z, pad = 0) => LOTS.some(L => !L.open && x > L.x0 - pad && x < L.x1 + pad && z > L.z0 - pad && z < L.z1 + pad);
function layout() {
  const road = (pts, hw, mat, o = {}) => { const r = Object.assign({ P: path(pts), hw, mat }, o); ROADS.push(r); return r; };
  ROADS = []; LOTS = [];
  const main = road([[-185, 11], [-140, 5], [-100, 1], [-60, 0], [0, 0], [60, 0], [100, -2], [140, -8], [185, -15]], 4.2, 'asphalt', { walk: 3.4, name: 'main' });
  road([[40, -2], [41, -30], [48, -55], [60, -75], [70, -87]], 3.0, 'asphalt', { name: 'church' });
  road([[-60, -2], [-61, -35], [-66, -70], [-72, -105], [-80, -150], [-86, -185]], 3.2, 'asphalt', { name: 'elm' });
  road([[-185, -56], [-140, -58], [-100, -62], [-66, -64], [-30, -68], [0, -66], [28, -60], [42, -42]], 3.0, 'asphalt', { name: 'ash' });
  road([[-45, 2], [-46, 30], [-52, 55], [-60, 80], [-75, 110], [-95, 150], [-112, 185]], 3.0, 'asphalt', { name: 'mill' });
  road([[20, 2], [21, 35], [26, 62], [32, 90], [36, 125], [40, 185]], 3.6, 'asphalt', { name: 'south' });
  road([[36, 101], [70, 104], [105, 102], [140, 98], [185, 95]], 3.2, 'asphalt', { name: 'factory' });
  road([[-118, 3], [-125, -10], [-131, -21]], 2.0, 'dirt', { name: 'tower' });
  road([[108, -3], [113, -30], [118, -55], [123, -71]], 2.0, 'dirt', { name: 'farm' });
  road([[-45, 34], [-62, 28], [-100, 21], [-122, 22]], 2.2, 'dirt', { name: 'lane' });
  // zig-zag ditches (axis-aligned runs); look: the point the dug-in shooter watches
  DITCHES = [
    { P: [[96, 44], [106, 44], [106, 48], [118, 48], [118, 44], [130, 44], [130, 48], [140, 48]], look: [110, -8] },       // east field, facing the main road
    { P: [[92, -54], [92, -43], [96, -43], [96, -31], [92, -31], [92, -20]], look: [45, -40] },                         // church field, facing the church road
    { P: [[-44, -106], [-34, -106], [-34, -110], [-22, -110], [-22, -106], [-10, -106]], look: [-25, -70] },            // north woods edge, over the back gardens
    { P: [[46, 86], [56, 86], [56, 90], [66, 90], [66, 86], [76, 86]], look: [55, 30] },                               // south of the creek, facing town
    { P: [[-32, 46], [-22, 46], [-22, 50], [-10, 50], [-10, 46], [0, 46]], look: [-15, 8] },                           // the flats, facing the main street
  ];
  CREEK = { P: path([[-185, 40], [-140, 48], [-100, 60], [-70, 56], [-40, 62], [-5, 70], [30, 64], [65, 74], [100, 80], [140, 76], [185, 84]], 2) };
  return main;
}

// ---------- Assemble ----------
function buildMap(scene) {
  rng = makeRng(7151); drng = makeRng(4242); lrng = makeRng(6262); hrng = makeRng(5150); HIDES.length = LOOPS.length = 0;
  MAP.spawns.length = MAP.ammoSpots.length = MAP.plateSpots.length = MAP.nests.length = MAP.buildings.length = MAP.lights.length = MAP.stairs.length = MAP.doors.length = 0;
  WIRES.length = 0; TALL.length = 0; for (const k in FB) delete FB[k];
  SURF.d = new Uint8Array(SURF.n * SURF.n); SURF.blk = new Uint8Array(SURF.n * SURF.n); OCC.d.fill(0);
  mapTextures(); mapMaterials();
  const main = layout();
  // ---- buildings (lots first: the terrain flattens under them) ----
  const B_ = [];   // building specs
  const nb = (o) => { B_.push(o); LOTS.push(o); return o; };
  const N_ = (x0, x1, d, o) => nb(Object.assign({ x0, x1, z0: -7.6 - d, z1: -7.6, fz: -8.5, doors: [['S', 0.5], ['N', 0.5]] }, o));
  const S_ = (x0, x1, d, o) => nb(Object.assign({ x0, x1, z0: 7.6, z1: 7.6 + d, fz: 8.5, doors: [['N', 0.5], ['S', 0.5]] }, o));
  // main street, north side
  N_(-100, -89, 10, { n: 2, mat: M.brick, ruin: 0.65, shop: 'S' });
  N_(-86, -75, 12, { n: 1, mat: M.plasterA, roof: 'gable', ridge: 'z', ruin: 0.7, shop: 'S' });
  N_(-73, -65.5, 10, { n: 2, mat: M.brickD, ruin: 0.2, stair: 'NW', access: true, doors: [['S', 0.6], ['N', 0.7], ['E', 0.5]] });
  const hotel = N_(-54, -42, 12, { n: 3, mat: M.plasterC, ruin: 0.25, stair: 'NE', access: true, sign: 0, glow: 0.12 });
  N_(-40, -30, 10, { n: 2, mat: M.plasterB, roof: 'gable', ridge: 'x', ruin: 0.5 });
  N_(-28, -21.5, 8, { n: 1, mat: M.brick, ruin: 0.8, shop: 'S', doors: [['S', 0.5], ['E', 0.5]] });
  nb({ x0: -36, x1: -24, z0: -40, z1: -24, n: 2, mat: M.plasterA, ruin: 0.45, stair: 'NW', doors: [['E', 0.5], ['W', 0.5], ['S', 0.5]] });
  nb({ x0: 24, x1: 35, z0: -40, z1: -24, n: 2, mat: M.brick, ruin: 0.7, doors: [['W', 0.5], ['E', 0.5]] });
  const hall = nb({ x0: -14, x1: 14, z0: -58, z1: -44, n: 3, FH: 3.4, mat: M.stone, ruin: 0.15, stair: 'NE', access: true, doors: [['S', 0.5, 2.4], ['N', 0.5], ['W', 0.5]], win: { w: 1.3, h: 2.0, b: 0.8, arch: true }, archDoor: true, bay: 3.5, fz: -43 });
  N_(22, 35, 10, { n: 2, mat: M.plasterC, ruin: 0.3, stair: 'NE', access: true, shop: 'S', sign: 2 });
  N_(46, 58, 12, { n: 3, mat: M.brick, ruin: 0.35, stair: 'NW', access: true, sign: 1, glow: 0.1 });
  N_(61, 72, 10, { n: 1, mat: M.corr, roof: 'gable', ridge: 'z', ruin: 0.35, doors: [['S', 0.5, 4.2], ['N', 0.5]], sign: 3, t: 0.2, trims: false, cm: 'metal' });
  N_(76, 88, 10, { n: 2, mat: M.plasterB, roof: 'gable', ridge: 'x', ruin: 0.6 });
  // main street, south side
  S_(-98, -86, 10, { n: 2, mat: M.brick, roof: 'gable', ridge: 'x', ruin: 0.4, stair: 'SE' });
  S_(-82, -70, 12, { n: 2, mat: M.plasterA, ruin: 0.75, roof: 'none' });
  S_(-66, -52, 12, { n: 3, mat: M.brickD, ruin: 0.2, stair: 'SW', access: true, glow: 0.1 });
  S_(-39, -28, 10, { n: 1, mat: M.plasterB, ruin: 0.5, shop: 'N' });
  S_(-25, -13, 12, { n: 2, mat: M.plasterC, ruin: 0.25, stair: 'SE', access: true, shop: 'N' });
  S_(-10, 2, 11, { n: 2, mat: M.brick, ruin: 0.9, roof: 'none' });
  S_(5, 15, 10, { n: 1, mat: M.plasterA, roof: 'gable', ridge: 'z', ruin: 0.3, shop: 'N' });
  S_(27, 40, 12, { n: 3, mat: M.conc, ruin: 0.4, stair: 'SW', access: true, trim: M.concD });
  S_(44, 56, 10, { n: 2, mat: M.plasterB, roof: 'gable', ridge: 'x', ruin: 0.55 });
  nb({ x0: 78, x1: 88, z0: 10, z1: 19, n: 1, mat: M.plasterA, ruin: 0.5, doors: [['W', 0.5], ['N', 0.5], ['S', 0.5]], fx: 70, fz: 9 });
  // houses with yards (gable roofs)
  const houses = [[-80, -71, -34, -26, 'E'], [-82, -73, -52, -44, 'E'], [-86, -77, -86, -78, 'E'], [-90, -81, -104, -96, 'E'], [-54, -45, -36, -28, 'W'], [-56, -47, -54, -46, 'W'], [-58, -49, -86, -77, 'W'], [-62, -53, -104, -95, 'W'],
    [-118, -109, -80, -72, 'S'], [-104, -95, -50, -42, 'N'], [-122, -113, -48, -40, 'N'], [-30, -21, -88, -80, 'S'], [-12, -3, -90, -82, 'S'], [8, 17, -86, -78, 'S'],
    [-76, -67, 33, 41, 'N'], [-92, -83, 28, 36, 'N'], [-110, -101, 25.5, 33.5, 'N'], [-36, -27, 26, 34, 'W'], [-8, 1, 28, 36, 'N'], [100, 109, -62, -54, 'W']];
  const opp = { N: 'S', S: 'N', E: 'W', W: 'E' };
  const HS = houses.map(([x0, x1, z0, z1, f], i) => nb({ x0, x1, z0, z1, n: i % 3 === 0 ? 2 : 1, mat: pick([M.brick, M.plasterA, M.plasterB, M.brickD, M.plasterC]), roof: 'gable', ruin: pick([0.15, 0.3, 0.5, 0.7]), stair: i % 3 === 0 ? (f === 'N' ? 'SE' : f === 'S' ? 'NW' : f === 'E' ? 'NW' : 'SE') : null,
    slabMat: M.wood, floorMat: M.floorW, stairMat: M.woodD, doors: [[f, 0.5], [opp[f], i % 3 === 0 && (f === 'E' || f === 'S') ? 0.75 : 0.3], [f === 'N' || f === 'S' ? 'E' : 'S', 0.5]], bay: 2.9, win: { w: 1.1, h: 1.35 }, yard: true, house: true, glow: i % 5 === 1 ? 0.25 : 0 }));
  // church on the hill: tower with stairs to the belfry, nave with a fallen roof
  const nave = nb({ fx: 70, fz: -102.5, x0: 70, x1: 92, z0: -108, z1: -97, n: 1, FH: 6.6, t: 0.6, mat: M.stone, roof: 'gable', ridge: 'x', ruin: 0.75, rise: 4.2, doors: [['S', 0.25, 2.0], ['N', 0.6]], archDoor: true, win: { w: 1.3, h: 3.0, b0: 2.2, arch: true }, bay: 4.4, trim: M.concD, chimney: false,
    extraOps: (k, sd, ops) => { if (k === 'W') ops.push({ door: true, u0: sd.L / 2 - 1.0, u1: sd.L / 2 + 1.0, v0: 0, v1: 0.68 + 3.2, arch: true, cu0: sd.L / 2 - 1.0, cu1: sd.L / 2 + 1.0, cv0: -1, cv1: 3.4 }); if (k === 'E') ops.push({ round: true, u0: sd.L / 2 - 1.2, u1: sd.L / 2 + 1.2, v0: 7.6, v1: 10.0, cu0: sd.L / 2 - 0.8, cu1: sd.L / 2 + 0.8, cv0: 8.0, cv1: 9.6 }); } });
  const tower = nb({ fx: 70, fz: -102.5, x0: 63.4, x1: 70.0, z0: -105.8, z1: -99.2, n: 4, FH: 3.2, t: 0.5, mat: M.stone, ruin: 0.06, par: 1.1, stair: 'NW', stairAx: 'z', doors: [['S', 0.5, 1.6]], archDoor: true, win: { w: 0.7, h: 1.4, b: 1.0, arch: true }, trim: M.concD, bay: 6,
    extraOps: (k, sd, ops) => { if (k === 'E') ops.push({ door: true, u0: sd.L / 2 - 0.85, u1: sd.L / 2 + 0.85, v0: 0, v1: 0.68 + 2.6, arch: true, cu0: sd.L / 2 - 0.85, cu1: sd.L / 2 + 0.85, cv0: -1, cv1: 2.9 });
      for (let i = ops.length - 1; i >= 0; i--) if (ops[i].f === 3) ops.splice(i, 1);
      const v0 = 0.68 + 9.6 + 0.95; ops.push({ u0: sd.L / 2 - 0.9, u1: sd.L / 2 + 0.9, v0, v1: v0 + 1.8, arch: true, kind: 'none', cu0: sd.L / 2 - 0.9, cu1: sd.L / 2 + 0.9, cv0: v0, cv1: v0 + 1.45, f: 3 }); } });
  // industry south of the creek
  const fac = nb({ fx: 75, fz: 124, x0: 50, x1: 92, z0: 112, z1: 136, n: 1, FH: 8.5, t: 0.45, mat: M.brickD, roof: 'gable', ridge: 'x', ruin: 0.6, rise: 4, bay: 4.2, doors: [['N', 0.3, 4.2], ['N', 0.75, 4.2], ['S', 0.5, 4.2], ['E', 0.5], ['W', 0.5]], doorH: 4.4, win: { w: 2.0, h: 3.0, b0: 4.9, arch: true }, roofMat: M.corr, chimney: false, dark: 75 });
  nb({ fx: 75, fz: 124, x0: 94, x1: 104, z0: 112, z1: 124, n: 2, mat: M.brick, ruin: 0.3, stair: 'SE', access: true, doors: [['N', 0.5], ['W', 0.5], ['S', 0.3]] });
  const wh = nb({ x0: 110, x1: 140, z0: 110, z1: 128, n: 1, FH: 6.5, t: 0.2, mat: M.corr, roof: 'gable', ridge: 'x', ruin: 0.45, rise: 2.2, bay: 5, doors: [['N', 0.5, 5], ['S', 0.4, 5], ['E', 0.5], ['W', 0.5]], doorH: 4.6, win: { w: 2.2, h: 1.0, b0: 4.6 }, trims: false, cm: 'metal', roofMat: M.corrG, chimney: false, dark: 85, blank: 0.3 });
  nb({ fx: -3, fz: 112, x0: -20, x1: -6, z0: 95, z1: 107, n: 1, FH: 4.5, t: 0.2, mat: M.corrG, roof: 'gable', ridge: 'x', ruin: 0.4, doors: [['N', 0.5, 3.6], ['S', 0.5], ['E', 0.5]], trims: false, cm: 'metal', roofMat: M.corr, chimney: false, win: { w: 1.6, h: 0.9, b0: 2.6 } });
  nb({ fx: -3, fz: 112, x0: 0, x1: 14, z0: 118, z1: 130, n: 2, mat: M.brick, ruin: 0.5, stair: 'NE', access: true, doors: [['N', 0.5], ['W', 0.5], ['S', 0.5]] });
  const barn = nb({ x0: 116, x1: 132, z0: -84, z1: -72, n: 1, FH: 5, t: 0.2, mat: M.woodD, roof: 'gable', ridge: 'x', rise: 4.5, ruin: 0.5, doors: [['S', 0.5, 3.8], ['N', 0.5, 3.0], ['W', 0.5]], doorH: 3.6, trims: false, cm: 'wood', win: { w: 1.0, h: 1.0, b0: 2.2 }, blank: 0.4, chimney: false, roofMat: M.corr, yard: true });
  // open lots: town square, gas station forecourt, yards
  const lot = (x0, z0, x1, z1, o = {}) => { const L = Object.assign({ x0, z0, x1, z1, open: true }, o); LOTS.push(L); return L; };
  const sq = lot(-20, -42, 20, -9, { fz: -9 });
  lot(60, 7.6, 77, 22, { fx: 70, fz: 9 }); const fy_ = lot(44, 109, 106, 140, { pad: 1, fx: 75, fz: 124 }); const cy_ = lot(108, 131, 150, 152); lot(-24, 92, 18, 133, { pad: 1, fx: -3, fz: 112 });
  lot(-138, -37, -125, -25, { pad: 1.5, fx: -133, fz: -31 });   // water tower pad: the stair foot has to meet the ground on the ridge slope
  // ---- terrain ----
  genTerrain(); terrainMesh(scene);
  // ---- roads & paving ----
  ROADS.forEach(r => {
    const ri = ROADS.indexOf(r), sub = runsOutside(r.P, ([x, z]) => ROADS.some((q, qi) => (qi < ri || (r.mat === 'dirt' && q.mat === 'asphalt')) && q !== r && roadDist(q, x, z) < q.hw + 0.25));
    sub.forEach(P => {
      if (r.mat === 'asphalt') { ribbon(P, -r.hw, r.hw, r.name === 'main' ? 0.05 : 0.045, M.asphalt, { us: 6, nA: 5 }); markPath(P, r.hw + 0.3, 3); }
      else { ribbon(P, -r.hw, r.hw, 0.04, M.dirtRoad, { across: true, vs: 5, nA: 4 }); markPath(P, r.hw, 1); }
    });
    if (r.mat === 'asphalt') markPath(r.P, r.hw + 1.5, null);
  });
  // pavements along the main street through town, broken at the side streets
  [-1, 1].forEach(sd => { const inner = sd * 4.25, outer = sd * 7.5;
    runsOutside(main.P.filter(p => p[0] > -105 && p[0] < 95), ([x, z]) => ROADS.some(q => q !== main && roadDist(q, x, z + sd * 5.9) < q.hw + 1.9)).forEach(P => { ribbon(P, Math.min(inner, outer), Math.max(inner, outer), 0.06, M.paving, { us: 2.5, nA: 3 }); markPath(P.map(([x, z]) => [x, z + sd * 5.9]), 1.7, 3); }); });
  // faded centre line
  for (let i = 0; i < main.P.length - 3; i += 3) { if (chance(0.35)) continue; const P = main.P.slice(i, i + 2); if (P[0][0] < -150 || P[0][0] > 150) continue; ribbon(P, -0.07, 0.07, 0.058, M.conc, { nA: 2, us: 1 }); }
  // water in the creek (sits at a level, only shows where the bed is low: road embankments hide it)
  { const flat = CREEK.bed.map(b => b + 0.35), P = CREEK.P; ribbon(P, -5.5, 5.5, 0, M.water, { flatY: flat, nA: 3, us: 4 }); markPath(P, 3.6, 4); }
  ROADS.forEach(r => { if (r.mat !== 'asphalt') return; for (let i = 0; i < CREEK.P.length - 1; i++) { const [x, z] = CREEK.P[i]; if (nearRoad(x, z, 0, null) === r) { const a = CREEK.P[Math.max(0, i - 2)], b = CREEK.P[Math.min(CREEK.P.length - 1, i + 2)], yaw = Math.atan2(b[0] - a[0], b[1] - a[1]);
      G(new THREE.CylinderGeometry(0.85, 0.85, 2 * r.hw + 9, 12, 1, true), M.pipe, x, CREEK.bed[i] + 0.55, z, yaw, Math.PI / 2); i += 6; } } });
  patch(sq.x0, sq.z0, sq.x1, sq.z1 + 1.2, M.cobble, 0.05, 3);
  patch(60, 8.2, 77, 21.5, M.conc, 0.05, 4);
  patch(fy_.x0, fy_.z0, fy_.x1, fy_.z1, M.conc, 0.05, 4);
  patch(cy_.x0, cy_.z0, cy_.x1, cy_.z1, M.conc, 0.05, 4);
  // ---- build the buildings ----
  const infos = B_.map(o => bldg(o));
  // shop signs
  B_.forEach(o => { if (o.sign === undefined) return; const front = o.z1 <= 0 ? 'S' : 'N', zf = front === 'S' ? o.z1 : o.z0, y = o.g + 0.08 + (o.n > 1 ? 3.2 - 0.45 : 3.05); signBoard((o.x0 + o.x1) / 2, y, zf, true, front === 'S' ? 1 : -1, o.sign, Math.min(4, o.x1 - o.x0 - 2)); });
  // gas station canopy and pumps
  { const gy = terrainY(68, 14); B(62, gy + 4.4, 9, 75, gy + 4.8, 19.5, M.concD, 'concrete'); B(62, gy + 4.55, 8.95, 75, gy + 4.75, 9, M.rust, null);
    [[63.5, 10.5], [73.5, 10.5], [63.5, 18], [73.5, 18]].forEach(([x, z], i) => { if (i === 3) { G(new THREE.BoxGeometry(0.4, 4.2, 0.4), M.concD, x + 1.2, gy + 0.3, z - 0.5, 0.3, 0, 1.45); addCollider(x - 1, gy, z - 0.8, x + 3.2, gy + 0.6, z - 0.2, 'concrete'); return; } B(x - 0.2, gy, z - 0.2, x + 0.2, gy + 4.4, z + 0.2, M.concD); });
    [12, 16].forEach(z => { B(64.5, gy, z - 0.45, 72.5, gy + 0.2, z + 0.45, M.concD); [66.5, 70.5].forEach(x => { B(x - 0.4, gy + 0.2, z - 0.3, x + 0.4, gy + 1.8, z + 0.3, M.rust, 'metal'); B(x - 0.42, gy + 1.8, z - 0.32, x + 0.42, gy + 1.95, z + 0.32, M.burnt, null); }); }); }
  // town square: dry fountain, broken statue, a dead tree or two, an abandoned checkpoint
  { const fx = 0, fz = -26, gy = terrainY(fx, fz) + 0.05, prof = [[2.6, 0], [3.4, 0], [3.45, 0.55], [3.2, 0.62], [3.0, 0.3], [2.6, 0.3]].map(p => new THREE.Vector2(p[0], p[1]));
    G(new THREE.LatheGeometry(prof, 16), M.stone, fx, gy, fz); G(new THREE.CylinderGeometry(3.0, 3.0, 0.3, 16), M.dark, fx, gy + 0.14, fz);
    for (let i = 0; i < 32; i++) { const a = (i + 0.5) / 32 * TAU, yaw = -(a + Math.PI / 2);   // ring of short tangent boxes hugging the round rim
      rotBoxes(fx + Math.cos(a) * 3.22, fz + Math.sin(a) * 3.22, yaw, -0.32, 0.32, 0.2, gy, gy + 0.56, 'concrete');
      if (i % 2) rotBoxes(fx + Math.cos(a) * 2.8, fz + Math.sin(a) * 2.8, yaw, -0.55, 0.55, 0.18, gy, gy + 0.3, 'concrete'); }
    B(fx - 0.9, gy, fz - 0.9, fx + 0.9, gy + 1.6, fz + 0.9, M.stone); B(fx - 1.05, gy + 1.6, fz - 1.05, fx + 1.05, gy + 1.8, fz + 1.05, M.concD);
    G(new THREE.CylinderGeometry(0.28, 0.36, 1.3, 7), M.metal, fx + 0.1, gy + 2.45, fz, 0, 0.08, 0.12); G(new THREE.BoxGeometry(0.9, 0.5, 0.5), M.metal, fx - 0.6, gy + 0.25, fz + 1.5, 0.5, 0.3, 0.9);
    deadTree(-14, -36, 8); deadTree(14, -15, 7); broadleaf(-15, -14, 9); deadTree(15, -37, 8.5);
    sandbags(-6, -12.5, -1.5, -12.5, 3); sandbags(-6, -12.5, -6, -15.5, 3); jersey(5, -12, true); jersey(9.5, -16, false);
    fireBarrel(-3.5, -14.5, true); crate(-8, -18, 1); crate(-7.2, -18.4, 0.8, terrainY(-8, -18) + 1.0);
    rubble(12, -30, 1.8, 0.9); debris(0, -26, 12, 18); }
  // church yard: low stone wall, headstones, dead trees
  { const wall = (xa, za, xb, zb) => { const L = Math.hypot(xb - xa, zb - za), n = Math.ceil(L / 2); for (let i = 0; i < n; i++) { if (chance(0.12)) continue; const a = lerp(xa, xb, i / n), b = lerp(xa, xb, (i + 1) / n), c = lerp(za, zb, i / n), d = lerp(za, zb, (i + 1) / n), gy = Math.min(terrainY(a, c), terrainY(b, d)) - 0.2, h = rr(0.85, 1.1);
        B(Math.min(a, b) - 0.25 * (xa === xb), gy, Math.min(c, d) - 0.25 * (za === zb), Math.max(a, b) + 0.25 * (xa === xb), gy + h, Math.max(c, d) + 0.25 * (za === zb), M.stone); } };
    wall(58, -116, 104, -116); wall(104, -116, 104, -80); wall(58, -80, 66, -80); wall(74, -80, 104, -80); wall(58, -116, 58, -80);
    for (let i = 0; i < 40; i++) { const x = rr(74, 101), z = rr(-94, -83); if (chance(0.15)) continue; const gy = terrainY(x, z), h = rr(0.6, 1.1), w = rr(0.5, 0.8), tl = rr(-0.18, 0.18);
      G(rboxGeo(w, h, 0.14, 0.05, 1), M.stone, x, gy + h / 2 - 0.1, z, rr(-0.1, 0.1), tl); if (h > 0.8 && Math.abs(tl) < 0.1) addCollider(x - w / 2, gy, z - 0.1, x + w / 2, gy + h - 0.15, z + 0.1, 'concrete'); }
    deadTree(98, -112, 9); deadTree(62, -84, 7.5); pine(100, -86, 12); pine(61, -112, 11); broadleaf(88, -84, 10); }
  // water tower on the west ridge, with steel stairs up to the deck
  { const x = -133, z = -31, gy = terrainY(x, z) - 0.05, s = 3.0, dk = gy + 7.0;
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => { limb(x + a * (s + 0.4), gy - 0.3, z + b * (s + 0.4), x + a * s, dk, z + b * s, 0.17, 0.14, M.metal, 7);
      limbColl(x + a * (s + 0.4), gy, z + b * (s + 0.4), x + a * s, dk - 0.2, z + b * s, 0.17, 'metal', 0.14); });
    [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(([a, b]) => { if (a) { limb(x + a * (s + 0.35), gy + 0.5, z - s, x + a * s, dk - 0.5, z + s, 0.04, 0.04, M.metal, 4); } else { limb(x - s, gy + 0.5, z + b * (s + 0.35), x + s, dk - 0.5, z + b * s, 0.04, 0.04, M.metal, 4); } });
    B(x - s - 0.6, dk - 0.18, z - s - 0.6, x + s + 0.6, dk, z + s + 0.6, M.metal, 'metal');
    railLine(x - s - 0.6, z - s - 0.6, x + s + 0.6, z - s - 0.6, dk); railLine(x - s - 0.6, z + s + 0.6, x + s + 0.6, z + s + 0.6, dk); railLine(x - s - 0.6, z - s - 0.6, x - s - 0.6, z + s + 0.6, dk); railLine(x + s + 0.6, z - s - 0.6, x + s + 0.6, z - 2.25, dk);   // stops at the stair landing: that gap is the way onto the deck
    const r = 2.5; G(new THREE.CylinderGeometry(r, r, 4.6, 18, 1), M.rust, x, dk + 0.6 + 2.3, z); G(new THREE.ConeGeometry(r + 0.15, 1.4, 18, 1), M.rust, x, dk + 0.6 + 4.6 + 0.7, z);
    [[0.92, 0.4], [0.4, 0.92], [0.68, 0.68]].forEach(([a, b]) => addCollider(x - r * a, dk + 0.6, z - r * b, x + r * a, dk + 5.2, z + r * b, 'metal'));
    B(x - r * 0.7, dk, z - 0.15, x + r * 0.7, dk + 0.6, z + 0.15, M.metal, null); B(x - 0.15, dk, z - r * 0.7, x + 0.15, dk + 0.6, z + r * 0.7, M.metal, null);
    const sp = { ax: 'z', sa: 1, sl: 1, a0: z - 0.95, l0: x + s + 0.6, w: 1.05, run: 0.28 }; sp.n = Math.round(3.5 / 2 / 0.2); sp.Ls = sp.n * sp.run + sp.w;
    // the stair tower runs south along the deck's east side: lower flight from the ground, platform, upper flight onto the deck
    uStair(sp, gy, 3.5, false, M.metal, 'metal'); B(x + s + 0.6, gy + 3.5 - 0.15, z - 2.25, x + s + 0.6 + 2.1, gy + 3.5, z - 0.95, M.metal, 'metal');
    uStair(sp, gy + 3.5, 3.5, false, M.metal, 'metal'); MAP.stairs.push({ sp, y0: gy, FH: 3.5, flights: 2, tower: true }); B(x + s + 0.6, dk - 0.15, z - 2.25, x + s + 0.6 + 2.1, dk, z - 0.95, M.metal, 'metal');
    railLine(x + s + 2.7, z - 2.25, x + s + 2.7, z - 0.95, dk); railLine(x + s + 0.6, z - 2.25, x + s + 2.7, z - 2.25, dk); railLine(x + s + 0.6, z - 0.95, x + s + 0.6, z + s + 0.6, dk);
    [[0, 0], [2.1, 0], [0, sp.Ls], [2.1, sp.Ls]].forEach(([dx, dz]) => limb(x + s + 0.6 + dx, gy - 0.2, z - 0.95 + dz, x + s + 0.6 + dx, dk, z - 0.95 + dz, 0.05, 0.05, M.metal, 5));
    markRect(x - 5, z - 5, x + 7, z + 6, null); MAP.towerDeck = { x, y: dk, z }; }
  // factory: chimney stack, mezzanine catwalk inside, machinery
  { const gy = fac.g + 0.08, cx = 97, cz = 131; const gch = terrainY(cx, cz);
    G(new THREE.CylinderGeometry(1.0, 1.55, 30, 14, 1, true), M.brickD, cx, gch + 15, cz); G(new THREE.CylinderGeometry(1.1, 1.1, 0.6, 14, 1), M.concD, cx, gch + 29.8, cz); G(new THREE.CylinderGeometry(0.9, 0.9, 0.62, 14, 1, true), M.dark, cx, gch + 29.8, cz);
    limbColl(cx, gch, cz, cx, gch + 30, cz, 1.5, 'concrete', 1.0);
    const my = gy + 4.0; B(54, my - 0.2, 131.5, 82, my, 135.5, M.metal, 'metal'); railLine(54, 131.5, 82, 131.5, my); railLine(54, 131.5, 54, 135.5, my);
    for (let x = 55; x <= 81; x += 4) B(x - 0.12, gy, 131.6, x + 0.12, my - 0.2, 131.84, M.metal, 'metal');
    straightStair(87.6, 133.5, '-x', 1.3, gy, 4.0, M.metal, 'metal');
    [[58, 120, 3, 2.2, 2], [66, 124, 4, 1.6, 2.5], [76, 120, 2.6, 2.4, 2.2], [84, 125, 3.2, 1.8, 1.6]].forEach(([x, z, w, d, h]) => { B(x - w / 2, gy, z - d / 2, x + w / 2, gy + h, z + d / 2, M.rust, 'metal'); B(x - w / 2 + 0.3, gy + h, z - d / 2 + 0.3, x - w / 2 + 1.0, gy + h + 0.8, z - d / 2 + 1.0, M.metal, 'metal'); });
    rubble(70, 128, 2.5, 1.2, gy); rubble(62, 116, 1.6, 0.8, gy); debris(72, 122, 10, 24, gy); }
  // the warehouse yard and containers
  { const cm = () => pick([M.rust, M.corr, M.corrG, M.burnt]);
    [[114, 136, true], [121, 136, true], [121, 136, true, 1], [130, 137, false], [136, 137, false], [143, 136, true], [116, 146, true], [126, 147, true], [126, 147, true, 1], [140, 147, true], [147, 145, false]].forEach(([x, z, ax, lv]) => container(x, z, ax, cm(), terrainY(x, z) + (lv ? 2.59 : 0)));
    container(133, 146, true, cm(), null, true);
    const gy = wh.g + 0.08; [[116, 116], [118.5, 116.3], [124, 122], [132, 116], [136, 122]].forEach(([x, z]) => crate(x, z, rr(1, 1.3), gy, rr(-0.3, 0.3)));
    barrel(128, 113, M.rust, gy); barrel(128.7, 113.4, M.rust, gy, true); fireBarrel(104, 109.5, true);
    fence([[44, 141], [106, 141]], 'chain'); fence([[106, 141], [106, 155], [152, 155], [152, 108]], 'chain'); }
  // workshop yard
  { const gy = terrainY(-12, 112); wreck(-2, 112, 0.3, false); container(10, 108, true, M.corrG); barrel(-18, 110, M.rust); barrel(-17.4, 110.6, M.burnt, null, true); rubble(4, 98, 1.8, 0.9); debris(-6, 112, 8, 12); crate(-14, 92.5, 1.1); void gy; }
  // barn: hay loft floor inside, junk around
  { const gy = barn.g + 0.08; B(116.3, gy + 2.6, -83.8, 121, gy + 2.8, -72.2, M.wood, 'wood'); for (const z of [-82.5, -78, -73.5]) B(120.8, gy, z - 0.12, 121.05, gy + 2.6, z + 0.12, M.woodD, 'wood');
    wreck(112, -66, 1.2, false); rubble(130, -66, 1.4, 0.7); barrel(114, -86, M.rust); deadTree(136, -70, 9); }

  // ---- wrecks, rubble, junk across town ----
  [[-80, -2.5, 0.08], [-35, 2.2, Math.PI + 0.1], [8, -2.6, -0.15], [33, 3, 0.25], [70, -3.2, Math.PI - 0.08], [118, -4, 2.9], [-126, 3, 0.2], [-60.5, -48, Math.PI / 2 + 0.1], [-46, 44, 1.4], [23, 46, Math.PI / 2 - 0.2], [42.5, -28, Math.PI / 2 + 0.3], [-68, -92, 1.75],
   [-2, -63, 0.1], [25, 85, 1.6], [80, 103.8, 0.2], [-110, -61, 0.05], [52, 3.5, 0.06], [-14, 3.2, Math.PI - 0.3]].forEach(([x, z, yaw], i) => { wreck(x, z, yaw, i % 3 !== 0); });
  [[-71, -15, 2.2, 1.1], [-5, 22, 2.6, 1.3], [-76, 22, 2.4, 1.2], [-25, 0, 1.2, 0.5], [57, -5, 1.4, 0.6], [-50, -3.6, 1.2, 0.5], [84, -20, 2, 0.9], [-92, 4.3, 1.1, 0.5], [31, -42, 2.2, 1.0], [41.5, 22.5, 1.6, 0.8], [-17, 21.5, 1.4, 0.7],
   [-83, 23, 1.2, 0.5], [9, 21, 1.5, 0.7], [-58, 22, 1.4, 0.6]].forEach(([x, z, r, h]) => { if (!inLot(x, z, 0.3)) rubble(x, z, r, h); debris(x, z, r * 2.5, 6); });
  for (let i = 0; i < 40; i++) { const x = rr(-110, 100), z = rr(-25, 25); if (!inLot(x, z, 0.5)) debris(x, z, 2, 3); }
  [[-62, -12], [-30.5, -20], [18.5, 21], [59, -21], [-87, 22.5], [43, 21], [-44, -60]].forEach(([x, z]) => { if (!inLot(x, z, 0.5)) barrel(x, z, pick([M.rust, M.burnt]), null, chance(0.4)); });
  // more wrecks along the side streets and puddles in the potholes (decor stream: the layout rng stays untouched)
  { const keep = rng; rng = drng;
    const canPlace = (x, z, r) => { const gy = terrainY(x, z); return !inLot(x, z, r) && !COLL.some(c => c.solid && c.mat !== 'foliage' && c.x1 > x - r && c.x0 < x + r && c.z1 > z - r && c.z0 < z + r && c.y1 > gy + 0.2 && c.y0 < gy + 2.2); };
    [[-64, -80, 1.62], [-75, -125, 1.45], [-118, -59.5, 0.05], [-56, 70, 1.2], [-84, 128, 1.05], [29, 74, 1.5], [34, 113, 1.62], [121, 100.5, 3.1], [60, -73, 0.95], [115, -40, 1.4], [-122, 21.5, 0.15], [-30, -67, 3.2]].forEach(([x, z, yaw], i) => { if (canPlace(x, z, 2.6)) { if (i % 4 === 1) overturned(x, z, yaw); else wreck(x, z, yaw, dch(0.5)); } });
    ROADS.forEach(r => { if (r.mat !== 'asphalt') return; for (let i = 3; i < r.P.length - 3; i += 6) { if (!dch(0.4)) continue; const [x, z] = r.P[i]; if (Math.abs(x) > 150 || Math.abs(z) > 150) continue;
      const a = r.P[i - 1], b = r.P[i + 1], tl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / tl, nz = (b[0] - a[0]) / tl, off = dr(-r.hw + 1.0, r.hw - 1.0); puddle(x + nx * off, z + nz * off, dr(0.5, 1.2)); } });
    [[-12, -20], [7, -33], [16, -24], [66, 19], [72, 12], [100, 108.5], [46, 106], [124, 132.5], [140, 150], [-12, 120], [5, 100], [120, -64]].forEach(([x, z]) => puddle(x + dr(-1.5, 1.5), z + dr(-1.5, 1.5), dr(0.6, 1.5)));
    rng = keep; }
  fireBarrel(60.5, 20.5, true); fireBarrel(-20.5, 21.5, false); fireBarrel(-63, -40, false);
  [[-44, -21], [36, -22], [-11.5, 22], [58.6, 22], [-87.5, -22]].forEach(([x, z]) => { if (!inLot(x, z, 0.3)) crate(x, z, rr(0.9, 1.2), null, rr(-0.4, 0.4)); });
  // the town is sealed off: barricades where the roads leave the map
  [[-150, 6], [150, -10], [-80, -148], [-147, -57], [-104, 150], [38, 150], [150, 96]].forEach(([x, z], i) => { const ax = i === 2 || i === 4 || i === 5; jersey(x, z, ax); jersey(x + (ax ? 3.2 : 0), z + (ax ? 0 : 3.2), ax); sandbags(x - (ax ? 2 : 1.2), z + (ax ? 1.3 : -2), x + (ax ? 1 : 1.2), z + (ax ? 1.3 : -2)); });
  // ---- poles and wires ----
  poleLine(main.P, -6.9, 33); ROADS.forEach(r => { if (r.name === 'church' || r.name === 'south' || r.name === 'factory' || r.name === 'elm' || r.name === 'ash') poleLine(r.P, r.hw + 2.6, 34, 10); });
  // ---- yards: picket fences, hedges, garden junk ----
  infos.forEach(inf => { const o = inf.o; if (!o.house) return; const m = 3.2, X0 = o.x0 - m, X1 = o.x1 + m, Z0 = o.z0 - m, Z1 = o.z1 + m, f = o.doors[0][0];
    const segs = { N: [[X0, Z0], [X1, Z0]], S: [[X0, Z1], [X1, Z1]], W: [[X0, Z0], [X0, Z1]], E: [[X1, Z0], [X1, Z1]] };
    Object.entries(segs).forEach(([k, [a, b]]) => {
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], gap = 1.0, L = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L;
      const p1 = [mid[0] - ux * gap, mid[1] - uz * gap], p2 = [mid[0] + ux * gap, mid[1] + uz * gap], clear = (x, z) => !nearRoad(x, z, 0.8) && !inLot(x, z, 0.2) && Math.abs(x) < 156 && Math.abs(z) < 156;
      if (!clear(a[0], a[1]) || !clear(b[0], b[1]) || !clear(mid[0], mid[1])) return;
      if (k === f || chance(0.35)) { fence([a, p1], 'picket', 0.2); fence([p2, b], 'picket', 0.2); }
      else if (chance(0.5)) hedge(a[0], a[1], p1[0], p1[1], rr(1.3, 1.8)), hedge(p2[0], p2[1], b[0], b[1], rr(1.3, 1.8));
      else if (chance(0.5)) fence([a, b], 'picket', 0.35);
    });
    if (dch(0.45)) { const bk = opp[f], off = 1.9; let a, b;   // washing line in the back yard
      if (bk === 'N' || bk === 'S') { const zz = bk === 'N' ? o.z0 - off : o.z1 + off; a = [o.x0 + 1, zz]; b = [o.x1 - 1, zz]; } else { const xx = bk === 'W' ? o.x0 - off : o.x1 + off; a = [xx, o.z0 + 1]; b = [xx, o.z1 - 1]; }
      if (!nearRoad(a[0], a[1], 1) && !nearRoad(b[0], b[1], 1)) laundry(a[0], a[1], b[0], b[1]); }
    const yx = chance(0.5) ? o.x0 - 1.8 : o.x1 + 1.8, yz = rr(o.z0, o.z1); if (!nearRoad(yx, yz, 1) && !inLot(yx, yz, 0.3)) { if (chance(0.5)) bush(yx, yz, rr(0.9, 1.4)); else grassPatch(yx, yz, rr(1.6, 2.4), 1.2); }
    if (chance(0.6)) { const tx = o.x1 + 2.2, tz = o.z1 + 2.2; if (!nearRoad(tx, tz, 1.5) && !inLot(tx, tz, 0.8)) (chance(0.5) ? broadleaf : deadTree)(tx, tz, rr(7, 10)); }
  });

  // ---- round 3: hides and cover in the fields (before the trees, so they grow around it) ----
  hides(infos);
  // ---- vegetation ----
  const free = (x, z, pad = 1.5) => { if (Math.abs(x) > 157 || Math.abs(z) > 157) return false; const k = sIdx(x, z); if (k >= 0 && (SURF.blk[k] || SURF.d[k] === 4)) return false; if (inLot(x, z, pad) || nearRoad(x, z, pad + 1)) return false;
    for (const c of COLL) if (c.solid && x > c.x0 - pad && x < c.x1 + pad && z > c.z0 - pad && z < c.z1 + pad && c.mat !== 'foliage') return false; return true; };
  const tree = (x, z, kind) => { if (!free(x, z, 2)) return false; const h = rr(8, 13); kind = kind || (rng() < 0.45 ? 'p' : rng() < 0.7 ? 'b' : 'd'); if (kind === 'p') pine(x, z, h * 1.15); else if (kind === 'b') broadleaf(x, z, h * 0.85); else deadTree(x, z, h * 0.8); markRect(x - 1, z - 1, x + 1, z + 1, null); return true; };
  const area = (n, x0, x1, z0, z1, kind) => { for (let i = 0; i < n; i++) tree(rr(x0, x1), rr(z0, z1), typeof kind === 'function' ? kind() : kind); };
  area(70, -156, 30, -156, -118, () => rng() < 0.6 ? 'p' : rng() < 0.6 ? 'b' : 'd');     // north woods
  area(26, -157, -138, -110, 110, () => rng() < 0.7 ? 'p' : 'd');                       // ridge
  area(46, -156, -92, 62, 156, () => rng() < 0.5 ? 'p' : rng() < 0.6 ? 'b' : 'd');      // south-west woods
  area(18, 140, 157, -150, 60, () => rng() < 0.6 ? 'p' : 'b');                          // east tree line
  area(14, 92, 150, -45, 70, 'd');                                                      // dead trees in the fields
  area(12, 40, 100, -150, -118, 'p');
  for (let i = 0; i < CREEK.P.length; i += 4) { const [x, z] = CREEK.P[i]; if (Math.abs(x) > 155) continue; const sd = chance(0.5) ? 1 : -1; if (chance(0.55)) tree(x + rr(-2, 2), z + sd * rr(5.5, 8), chance(0.65) ? 'b' : 'd'); if (chance(0.5)) { const bx = x + rr(-2, 2), bz = z + sd * rr(4, 6); if (free(bx, bz, 0.6)) bush(bx, bz, rr(0.9, 1.4)); } }
  // bushes, tall grass patches, scattered across fields, yards and wood edges
  for (let i = 0, c = 0; i < 2000 && c < 140; i++) { const x = rr(-155, 155), z = rr(-155, 155); if (free(x, z, 0.8)) { bush(x, z, rr(0.8, 1.5)); c++; } }
  for (let i = 0, c = 0; i < 2000 && c < 60; i++) { const x = rr(-155, 155), z = rr(-155, 155); if (free(x, z, 1.5)) { grassPatch(x, z, rr(2.5, 6), rr(0.8, 1.2)); c++; } }
  [[110, 20, 8], [125, 35, 7], [100, 45, 6], [135, 0, 7], [95, -25, 6], [-125, 40, 6], [-140, -90, 6], [-35, -105, 6], [60, 50, 7], [-10, 50, 5], [-95, 90, 6], [75, -135, 6], [-130, -5, 5]].forEach(([x, z, r]) => { if (free(x, z, 1)) grassPatch(x, z, r, 1.3); });
  // outside the fence: forest on the hills (no colliders, nobody goes there)
  for (let i = 0; i < 520; i++) { const a = rng() * TAU, r = rr(165, 225), x = Math.cos(a) * r, z = Math.sin(a) * r; if (Math.max(Math.abs(x), Math.abs(z)) < 163) continue; const h = rr(10, 17); rng() < 0.78 ? pine(x, z, h, false) : (rng() < 0.5 ? broadleaf(x, z, h * 0.8, false) : deadTree(x, z, h * 0.75, false)); }
  // boundary: an old barbed-wire fence, then invisible walls
  { const H = 157.5, posts = []; for (let s = -H; s < H; s += 4) posts.push([s, -H], [H, s], [-s, H], [-H, -s]);
    posts.forEach(([x, z]) => { const gy = terrainY(x, z); if (!nearRoad(x, z, 1)) limb(x, gy - 0.2, z, x + rr(-0.06, 0.06), gy + 1.3, z + rr(-0.06, 0.06), 0.06, 0.05, M.woodD, 5); });
    for (const [ax, az, bx, bz] of [[-H, -H, H, -H], [H, -H, H, H], [H, H, -H, H], [-H, H, -H, -H]]) for (let s = 0; s < 2 * H; s += 4) for (const hh of [0.45, 0.85, 1.2]) {
      const x0 = lerp(ax, bx, s / (2 * H)), z0 = lerp(az, bz, s / (2 * H)), x1 = lerp(ax, bx, Math.min(1, (s + 4) / (2 * H))), z1 = lerp(az, bz, Math.min(1, (s + 4) / (2 * H)));
      if (chance(0.05)) continue; WIRES.push(x0, terrainY(x0, z0) + hh, z0, (x0 + x1) / 2, terrainY((x0 + x1) / 2, (z0 + z1) / 2) + hh - 0.08, (z0 + z1) / 2, (x0 + x1) / 2, terrainY((x0 + x1) / 2, (z0 + z1) / 2) + hh - 0.08, (z0 + z1) / 2, x1, terrainY(x1, z1) + hh, z1); }
    const E = MAP.half, T = 100; addCollider(-E - 2, -50, -E - 2, E + 2, T, -E, 'dirt', false); addCollider(-E - 2, -50, E, E + 2, T, E + 2, 'dirt', false); addCollider(-E - 2, -50, -E, -E, T, E, 'dirt', false); addCollider(E, -50, -E, E + 2, T, E, 'dirt', false); }

  staticBuild(scene); foliageBuild(scene); if (DU.tOcc.value) DU.tOcc.value.needsUpdate = true;
  MAP.lights.forEach(L => { const pl = new THREE.PointLight(L.color, L.int, L.dist, 2); pl.position.set(L.x, L.y, L.z); scene.add(pl); L.obj = pl; });
  buildSpots(infos);
}
// optional: flicker the fire lights (main loop may call MAP.tick(time))
MAP.tick = t => { MAP.lights.forEach((L, i) => { if (L.obj) L.obj.intensity = L.int * (0.8 + 0.2 * Math.sin(t * 13 + i * 3) * Math.sin(t * 7.3 + i)); });
  if (M.glowF) M.glowF.emissiveIntensity = 0.9 * (0.78 + 0.14 * Math.sin(t * 9.1) * Math.sin(t * 3.7 + 1) + 0.08 * Math.sin(t * 23));   // candles guttering
  if (M.lamp) M.lamp.emissiveIntensity = 1.1 * (0.9 + 0.1 * Math.sin(t * 11.3) * Math.sin(t * 4.1));
  if (TX.fogb) TX.fogb.offset.y = (t * 0.0035) % 1;   // the mist creeps down the creek
};

// ---------- Spawns, nests, pickups ----------
function groundAt(x, z) { let y = terrainY(x, z); for (const c of COLL) if (c.solid && c.mat !== 'foliage' && x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1 && c.y1 > y && c.y1 < y + 0.5) y = c.y1; return y; }
function spotFree(x, z, y) {
  if (Math.abs(x) > MAP.half - 2 || Math.abs(z) > MAP.half - 2) return false;
  if (y === undefined) y = groundAt(x, z);
  if (y < terrainY(x, z) + 0.3) { for (const [dx, dz] of [[0.5, 0], [0, 0.5], [-0.5, 0], [0, -0.5]]) if (Math.abs(terrainY(x + dx, z + dz) - terrainY(x, z)) > 0.25) return false; }   // too steep for bots to stand
  else for (const [dx, dz] of [[0, 0], [0.4, 0.4], [-0.4, 0.4], [0.4, -0.4], [-0.4, -0.4]]) { const px = x + dx, pz = z + dz;   // up on a floor: there must be floor under all of the body (collapsed slabs leave holes)
    if (!COLL.some(c => c.solid && c.mat !== 'foliage' && Math.abs(c.y1 - y) < 0.12 && px > c.x0 && px < c.x1 && pz > c.z0 && pz < c.z1)) return false; }
  for (const c of COLL) if (c.solid && c.mat !== 'foliage' && x > c.x0 - 0.5 && x < c.x1 + 0.5 && z > c.z0 - 0.5 && z < c.z1 + 0.5 && c.y0 < y + 1.8 && c.y1 > y + 0.3) return false;
  return true;
}
function spread(cands, k, minD = 0) {   // greedy farthest-point pick
  const out = []; if (!cands.length) return out; out.push(cands[0]);
  while (out.length < k) { let best = null, bd = -1; for (const c of cands) { let d = 1e9; for (const o of out) d = Math.min(d, Math.hypot(c.x - o.x, c.z - o.z) + Math.abs(c.y - o.y) * 3); if (d > bd) { bd = d; best = c; } } if (!best || bd < minD) break; out.push(best); }
  return out;
}
function buildSpots(infos) {
  const near = (x, z, y, r = 4) => { for (let a = 0; a < 16; a++) { const rr2 = (a / 16) * r, ang = a * 2.4, px = x + Math.cos(ang) * rr2, pz = z + Math.sin(ang) * rr2, py = y === undefined ? groundAt(px, pz) : y; if (spotFree(px, pz, py)) return { x: px, y: py, z: pz }; } return null; };
  // spawns: edges, woods, back yards and quiet ground floors — never the open middle of a street
  const sc = [[-150, -140], [-100, -142], [-40, -135], [20, -140], [95, -140], [145, -110], [150, -40], [148, 25], [140, 70], [148, 140], [90, 150], [20, 150], [-45, 145], [-105, 128], [-148, 95], [-150, 35], [-145, -70],
    [-95, -30], [-35, -48], [10, -95], [70, -40], [110, 30], [70, 60], [-20, 80], [-120, 55], [125, -95], [-128, -95], [45, 145]];
  sc.forEach(([x, z]) => { const p = near(x, z, undefined, 6); if (p && !nearRoad(p.x, p.z, 1)) MAP.spawns.push({ x: p.x, y: p.y, z: p.z, yaw: yawTo(-p.x, -p.z) }); });
  infos.forEach(inf => { if (inf.n === 1 && chance(0.5)) return; const s = inf.spots.find(q => q.f === 0); if (s && spotFree(s.x, s.z, s.y) && MAP.spawns.length < 40) MAP.spawns.push({ x: s.x, y: s.y, z: s.z, yaw: rr(0, TAU) }); });
  // nests: ground-floor windows, bushes and hedges near sightlines, behind wrecks and walls
  const nc = [];
  infos.flatMap(inf => inf.wins).concat(LOOPS).forEach((w => { if (spotFree(w.p[0], w.p[2], w.p[1])) nc.push({ x: w.p[0], y: w.p[1], z: w.p[2], yaw: w.yaw }); }));
  COLL.forEach(c => { if (c.mat !== 'foliage' || c.y1 - c.y0 > 3) return; const x = (c.x0 + c.x1) / 2, z = (c.z0 + c.z1) / 2; if (Math.abs(x) > 132 || Math.abs(z) > 132) return; const y = groundAt(x, z); if (!spotFree(x, z, y)) return;
    let best = null, bd = 1e9; ROADS.forEach(r => r.P.forEach(p => { const d = Math.hypot(p[0] - x, p[1] - z); if (d > 12 && d < bd) { bd = d; best = p; } })); if (best && bd < 70) nc.push({ x, y, z, yaw: yawTo(best[0] - x, best[1] - z) }); });
  for (let i = 0; i < nc.length; i++) { const j = Math.floor(rng() * nc.length); [nc[i], nc[j]] = [nc[j], nc[i]]; }
  spread(nc, 32).forEach(s => MAP.nests.push(s));
  // plus the field hides (ditches, hedge gaps, bale walls, ruined walls, ricks): a spread-out pick of the ones a body fits
  // (a crouching shooter must actually see 25 m down the watch line: no bank, wall or thick brush in the way)
  const sees = h => { const o = new V3(h.x, h.y + 1.05, h.z), d = new V3(-Math.sin(h.yaw), -0.012, -Math.cos(h.yaw)).normalize(), hit = rayWorld(o, d, 25, true); return !hit && rayFoliage(o, d, 25) < 1.6; };
  const hc = HIDES.filter(h => h.yaw !== undefined).map(h => ({ x: h.x, y: groundAt(h.x, h.z), z: h.z, yaw: h.yaw })).filter(h => spotFree(h.x, h.z, h.y) && sees(h) && !MAP.nests.some(n => Math.hypot(n.x - h.x, n.z - h.z) < 12));
  spread(hc, 10, 15).forEach(s => MAP.nests.push(s));
  // pickups: floors of buildings (upper ones too) and some sheltered outdoor corners
  // f: floor index (0 = ground level, the only floor bots' ground nav grid can reach)
  const pc = []; infos.forEach(inf => inf.spots.forEach(s => { if (spotFree(s.x, s.z, s.y)) pc.push({ x: s.x, y: s.y, z: s.z, f: s.f }); }));
  const oc = []; COLL.forEach(c => { if (c.mat === 'metal' && c.y1 - c.y0 > 0.5 && c.y1 - c.y0 < 1.2 && c.x1 - c.x0 > 1 && Math.abs(c.x0) < 150 && Math.abs(c.z0) < 150) { const p = near(c.x0 - 0.8, (c.z0 + c.z1) / 2, undefined, 2); if (p) oc.push(p); } });
  for (let i = 0; i < pc.length; i++) { const j = Math.floor(rng() * pc.length); [pc[i], pc[j]] = [pc[j], pc[i]]; }
  oc.forEach(p => { p.f = 0; });
  spread(pc.filter(p => !p.f), 12).concat(spread(pc.filter(p => p.f), 6)).forEach(s => MAP.ammoSpots.push(s));   // mostly where bots can walk
  spread(pc.filter(p => !MAP.ammoSpots.includes(p)).concat(oc), 30).forEach(s => MAP.plateSpots.push(s));
  // field cover: ammo down in the ditches, plates by the hedge gaps and up on the hunting stands
  HIDES.filter(h => h.ammo).forEach(h => { const y = groundAt(h.x, h.z); if (spotFree(h.x, h.z, y)) MAP.ammoSpots.push({ x: h.x, y, z: h.z, f: 0 }); });
  HIDES.filter(h => h.plate).forEach(h => MAP.plateSpots.push({ x: h.x, y: h.y, z: h.z, f: h.f }));
  spread(hc.filter(h => !MAP.nests.includes(h)), 4, 20).forEach(h => MAP.plateSpots.push({ x: h.x, y: h.y, z: h.z, f: 0 }));
}
// Surface under a point, for footstep sounds
function surfaceAt(x, z, y) {
  const ty = terrainY(x, z);
  if (y > ty + 0.04) for (const c of COLL) if (c.solid && c.mat !== 'foliage' && x >= c.x0 && x <= c.x1 && z >= c.z0 && z <= c.z1 && Math.abs(c.y1 - y) < 0.15) return c.mat === 'glass' ? 'concrete' : c.mat;
  const k = sIdx(x, z); if (k < 0 || !SURF.d) return 'grass';
  const s = SURF.d[k]; return s === 4 ? (y < ty + 0.6 ? 'water' : 'grass') : ['grass', 'dirt', 'gravel', 'concrete'][s];
}
