'use strict';
// ---------- Weapons: stats + procedural models built part by part ----------
// Gun-local space: origin at the trigger, barrel points to -z, y up, metres.
const GM = {};
function gunMats() {
  const s = o => new THREE.MeshStandardMaterial(o);
  // no reflection map in this build, so metals stay mostly diffuse with a soft sheen
  GM.blk = s({ map: TEX.metalNoise, color: 0x4a4c50, roughness: 0.45, metalness: 0.35 });
  GM.park = s({ map: TEX.metalNoise, color: 0x55574f, roughness: 0.6, metalness: 0.3 });
  GM.blued = s({ map: TEX.metalNoise, color: 0x3c4450, roughness: 0.4, metalness: 0.4 });
  GM.steel = s({ map: TEX.metalNoise, color: 0xb0b4b8, roughness: 0.35, metalness: 0.5 });
  GM.poly = s({ color: 0x2c2d2f, roughness: 0.7, metalness: 0.05 });
  GM.polyTan = s({ color: 0x9b8a68, roughness: 0.75, metalness: 0.05 });
  GM.wood = s({ map: TEX.gunWood, color: 0xc08a5a, roughness: 0.55 });
  GM.woodDark = s({ map: TEX.gunWood, color: 0x8a5a38, roughness: 0.6 });
  GM.plum = s({ color: 0x6b2e22, roughness: 0.6 });
  GM.rubber = s({ color: 0x141414, roughness: 0.95 });
  GM.dark = s({ color: 0x050505, roughness: 0.9 });
  GM.white = s({ color: 0xf0f0e8, emissive: 0x404040, roughness: 0.5 });
  GM.glass = s({ color: 0x5577aa, roughness: 0.05, metalness: 0.9, transparent: true, opacity: 0.22, depthWrite: false });
  GM.lens = s({ color: 0x1a3060, roughness: 0.1, metalness: 0.3 });
  GM.red = new THREE.MeshBasicMaterial({ color: 0xff2a1a });
  GM.brass = s({ color: 0xd8b050, roughness: 0.3, metalness: 0.4 });
  GM.shell = s({ color: 0xa0201a, roughness: 0.5 });
  // the hex colours above are sRGB; three r128 treats material colours as linear, so convert them once
  Object.values(GM).forEach(m => { m.color.convertSRGBToLinear(); if (m.emissive) m.emissive.convertSRGBToLinear(); });
}
const P = (geo, mat, x, y, z, parent, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); parent.add(m); return m; };
const rb = (w, h, d, r = 0.003) => rboxGeo(w, h, d, r, 2);
const zc = (r, len, seg = 16) => zcylGeo(r, r, len, seg);
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
function marker(parent, x, y, z, name) { const o = new THREE.Object3D(); o.position.set(x, y, z); o.name = name; parent.add(o); return o; }
// Picatinny rail: a base strip with cross slots
function rail(parent, len, y, z, x = 0, mat = GM.blk) {
  P(rb(0.021, 0.006, len, 0.001), mat, x, y + 0.003, z, parent);
  const n = Math.floor(len / 0.01);
  for (let i = 0; i < n; i++) P(box(0.0215, 0.0035, 0.0052), mat, x, y + 0.0075, z - len / 2 + 0.005 + i * 0.01, parent);
}

// ---------- Attachments ----------
const OPTICS = {
  iron: { name: 'Iron sights', fov: 0.85, adsMul: 1 },
  reddot: { name: 'T-1 red dot', fov: 0.8, adsMul: 1.05 },
  holo: { name: 'EXPS3 holographic', fov: 0.8, adsMul: 1.08 },
  scope: { name: '4x prism scope', fov: 0.25, adsMul: 1.35, scope: true },
  pu: { name: 'PU 3.5x scope', fov: 0.28, adsMul: 1.4, scope: true },
};
const MUZZLES = {
  std: { name: 'Factory muzzle', supp: false },
  supp: { name: 'Suppressor', supp: true },
  none: { name: 'None', supp: false },
};
// Build an optic on a rail; returns its sight height above the rail
function buildOptic(kind, parent, y, z) {
  const g = new THREE.Group(); g.position.set(0, y, z); parent.add(g);
  if (kind === 'reddot') {
    P(rb(0.026, 0.01, 0.042, 0.002), GM.blk, 0, 0.005, 0, g);
    P(rb(0.02, 0.012, 0.026, 0.003), GM.blk, 0, 0.015, 0, g);
    const body = new THREE.CylinderGeometry(0.0158, 0.0158, 0.044, 24, 1, true); body.rotateX(Math.PI / 2);
    P(body, GM.blk, 0, 0.034, 0, g); P(new THREE.TorusGeometry(0.0158, 0.0022, 6, 24), GM.blk, 0, 0.034, -0.022, g); P(new THREE.TorusGeometry(0.0158, 0.0022, 6, 24), GM.blk, 0, 0.034, 0.022, g);
    P(xcylGeo(0.006, 0.012), GM.blk, 0.02, 0.034, 0, g); P(new THREE.CylinderGeometry(0.006, 0.006, 0.012, 12), GM.blk, 0, 0.054, 0, g);
    P(new THREE.CircleGeometry(0.0152, 24), GM.glass, 0, 0.034, -0.012, g);
    P(new THREE.SphereGeometry(0.0011, 8, 6), GM.red, 0, 0.034, -0.012, g);
    return { group: g, h: 0.034, relief: 0.2, z };
  }
  if (kind === 'holo') {
    P(rb(0.036, 0.012, 0.085, 0.003), GM.blk, 0, 0.006, 0, g);
    P(rb(0.036, 0.03, 0.03, 0.004), GM.blk, 0, 0.022, 0.03, g);       // rear housing with the battery
    [-1, 1].forEach(s => P(rb(0.004, 0.042, 0.038, 0.0015), GM.blk, s * 0.0175, 0.033, -0.015, g));   // hood sides
    P(rb(0.039, 0.005, 0.042, 0.002), GM.blk, 0, 0.055, -0.015, g);
    P(box(0.034, 0.038, 0.002), GM.glass, 0, 0.034, -0.02, g);
    P(new THREE.TorusGeometry(0.0042, 0.00028, 4, 32), GM.red, 0, 0.034, -0.02, g); P(new THREE.SphereGeometry(0.0004, 6, 4), GM.red, 0, 0.034, -0.02, g);
    [-1, 1].forEach(s => P(box(0.004, 0.004, 0.006), GM.dark, s * 0.008, 0.038, 0.046, g));   // buttons
    return { group: g, h: 0.034, relief: 0.17, z };
  }
  if (kind === 'scope' || kind === 'pu') {
    const long = kind === 'pu';
    [-0.045, 0.045].forEach(zz => { P(rb(0.022, 0.016, 0.018, 0.002), GM.blk, 0, 0.008, zz, g); P(new THREE.TorusGeometry(0.0155, 0.004, 6, 20), GM.blk, 0, 0.042, zz, g); });
    P(zc(0.0135, long ? 0.2 : 0.15, 20), GM.blk, 0, 0.042, 0, g);
    P(zcylGeo(0.022, 0.0135, 0.045, 20), GM.blk, 0, 0.042, long ? -0.12 : -0.095, g);
    P(zcylGeo(0.0135, 0.019, 0.05, 20), GM.blk, 0, 0.042, long ? 0.12 : 0.1, g);
    P(new THREE.CylinderGeometry(0.008, 0.008, 0.016, 12), GM.blk, 0, 0.062, 0, g); P(xcylGeo(0.008, 0.016), GM.blk, 0.02, 0.042, 0, g);
    P(new THREE.CircleGeometry(0.02, 20), GM.lens, 0, 0.042, long ? -0.143 : -0.118, g, 0, Math.PI);
    P(new THREE.CircleGeometry(0.017, 20), GM.lens, 0, 0.042, long ? 0.146 : 0.126, g);
    return { group: g, h: 0.042, relief: 0.2, scope: true, z };
  }
  return null;
}
function buildSuppressor(parent, y, z, r = 0.019, len = 0.17) {
  P(zc(r, len, 20), GM.park, 0, y, z - len / 2, parent);
  P(zc(r + 0.0015, 0.012, 20), GM.blk, 0, y, z - 0.006, parent); P(zc(r + 0.0015, 0.012, 20), GM.blk, 0, y, z - len + 0.006, parent);
  P(zc(0.006, 0.004, 12), GM.dark, 0, y, z - len - 0.001, parent);
  return z - len;
}

// ---------- Weapon definitions ----------
// recoil in degrees per shot; spread in degrees; range: [full damage until, min damage from, min fraction]
const WEAPONS = {
  m4: { name: 'M4A1', cal: '5.56x45 NATO', desc: 'Carbine with a free-float M-LOK handguard. Fast, controllable, all-round.', kind: 'auto', modes: ['auto', 'semi'], rpm: 800, dmg: 30, mag: 30, reserve: 150, reload: 2.2, reloadEmpty: 2.8,
    spreadHip: 2.4, spreadAds: 0.12, recoil: { v: 0.85, h: 0.32 }, range: [35, 110, 0.65], move: 0.95, adsTime: 0.22, hip: [0.14, -0.14, -0.5], snd: { crack: 3600, body: 950, low: 70, tail: 0.35 },
    slots: { optic: ['iron', 'reddot', 'holo', 'scope'], muzzle: ['std', 'supp'] }, def: { optic: 'reddot', muzzle: 'std' } },
  ak74: { name: 'AK-74', cal: '5.45x39', desc: 'Wood furniture and a plum bakelite mag. Hits harder, kicks harder.', kind: 'auto', modes: ['auto', 'semi'], rpm: 650, dmg: 34, mag: 30, reserve: 150, reload: 2.4, reloadEmpty: 3.0,
    spreadHip: 2.6, spreadAds: 0.15, recoil: { v: 1.1, h: 0.5 }, range: [35, 120, 0.6], move: 0.93, adsTime: 0.24, hip: [0.14, -0.135, -0.49], snd: { crack: 3100, body: 780, low: 60, tail: 0.42 },
    slots: { optic: ['iron', 'reddot', 'holo', 'scope'], muzzle: ['std', 'supp'] }, def: { optic: 'iron', muzzle: 'std' } },
  mp5: { name: 'MP5A3', cal: '9x19 Parabellum', desc: 'Roller-delayed SMG with a collapsing stock. Soft recoil, falls off at range.', kind: 'auto', modes: ['auto', 'semi'], rpm: 800, dmg: 23, mag: 30, reserve: 150, reload: 2.0, reloadEmpty: 2.6,
    spreadHip: 1.9, spreadAds: 0.2, recoil: { v: 0.5, h: 0.24 }, range: [15, 50, 0.55], move: 1.02, adsTime: 0.18, hip: [0.14, -0.14, -0.46], snd: { crack: 2500, body: 1150, low: 85, tail: 0.25 },
    slots: { optic: ['iron', 'reddot', 'holo'], muzzle: ['std', 'supp'] }, def: { optic: 'iron', muzzle: 'std' } },
  m870: { name: 'M870', cal: '12 gauge buckshot', desc: 'Pump-action shotgun. Eight pellets that end any argument up close.', kind: 'pump', modes: ['pump'], rpm: 75, dmg: 13, pellets: 8, mag: 6, reserve: 30, reload: 0.55, perRound: true, cycle: 0.6,
    spreadHip: 4.2, spreadAds: 2.8, recoil: { v: 4.5, h: 1.2 }, range: [8, 30, 0.3], move: 0.95, adsTime: 0.22, hip: [0.14, -0.14, -0.5], snd: { crack: 1800, body: 500, low: 45, tail: 0.6 },
    slots: { optic: ['iron', 'reddot'], muzzle: ['none'] }, def: { optic: 'iron', muzzle: 'none' } },
  mosin: { name: 'Mosin M91/30', cal: '7.62x54R', desc: 'A century-old bolt-action. One clean hit to the chest is enough.', kind: 'bolt', modes: ['bolt'], rpm: 50, dmg: 105, mag: 5, reserve: 30, reload: 0.6, perRound: true, cycle: 1.05,
    spreadHip: 3.8, spreadAds: 0.02, recoil: { v: 5.5, h: 1.0 }, range: [120, 320, 0.85], move: 0.9, adsTime: 0.3, hip: [0.14, -0.135, -0.5], snd: { crack: 3300, body: 600, low: 50, tail: 0.75 },
    slots: { optic: ['iron', 'pu'], muzzle: ['none', 'supp'] }, def: { optic: 'pu', muzzle: 'none' } },
  glock: { name: 'Glock 17', cal: '9x19 Parabellum', desc: 'Sidearm.', kind: 'semi', modes: ['semi'], rpm: 450, dmg: 24, mag: 17, reserve: 68, reload: 1.5, reloadEmpty: 1.9,
    spreadHip: 1.6, spreadAds: 0.25, recoil: { v: 1.5, h: 0.5 }, range: [12, 40, 0.5], move: 1.05, adsTime: 0.15, hip: [0.12, -0.12, -0.42], snd: { crack: 2700, body: 1300, low: 90, tail: 0.25 },
    slots: { optic: ['iron'], muzzle: ['none', 'supp'] }, def: { optic: 'iron', muzzle: 'none' }, pistol: true },
};
const PRIMARIES = ['m4', 'ak74', 'mp5', 'm870', 'mosin'];

// ---------- Models ----------
// Each builder returns { group, mag, anim:{...}, markers } with markers: grip, fore, muzzle, eject, sightY
function buildM4(mods) {
  const g = new THREE.Group(), out = { group: g };
  // lower receiver with its magwell
  P(profileGeo([[0.07, 0.035], [0.07, -0.004], [0.03, -0.012], [-0.055, -0.012], [-0.058, -0.032], [-0.137, -0.032], [-0.14, -0.012], [-0.172, -0.002], [-0.172, 0.035]], 0.05, 0.003), GM.blk, 0, 0, 0, g);
  P(rb(0.054, 0.004, 0.084, 0.001), GM.blk, 0, -0.03, -0.097, g);               // flared magwell lip
  P(box(0.006, 0.008, 0.012), GM.blk, 0.026, -0.0, -0.05, g);                   // mag release
  P(box(0.004, 0.022, 0.014), GM.blk, -0.026, 0.01, -0.06, g);                  // bolt catch
  P(box(0.003, 0.006, 0.014), GM.steel, 0.026, 0.018, 0.01, g, 0, 0, 0);        // selector
  // trigger and guard
  P(box(0.01, 0.004, 0.064), GM.blk, 0, -0.045, -0.025, g); P(box(0.01, 0.034, 0.005), GM.blk, 0, -0.03, -0.056, g);
  P(box(0.005, 0.024, 0.006), GM.steel, 0, -0.022, -0.022, g, 0.3);
  // pistol grip
  P(profileGeo([[0.012, -0.006], [0.05, -0.006], [0.088, -0.112], [0.08, -0.126], [0.044, -0.128], [0.035, -0.105], [0.028, -0.085], [0.02, -0.065], [0.003, -0.026]], 0.032, 0.006), GM.poly, 0, 0, 0, g);
  // upper receiver, rail, ejection port, forward assist, charging handle
  P(rb(0.05, 0.05, 0.25, 0.005), GM.blk, 0, 0.06, -0.05, g);
  rail(g, 0.24, 0.085, -0.05);
  P(box(0.002, 0.016, 0.052), GM.dark, 0.0252, 0.058, -0.04, g);
  P(box(0.0015, 0.014, 0.05), GM.blk, 0.0262, 0.058, -0.04, g, 0, 0, 0);
  P(zc(0.0075, 0.04, 12), GM.blk, 0.026, 0.07, 0.04, g, 0, -0.35);
  P(new THREE.SphereGeometry(0.0085, 10, 8), GM.blk, 0.031, 0.07, 0.058, g);
  const ch = new THREE.Group(); g.add(ch);
  P(box(0.045, 0.008, 0.012), GM.blk, 0, 0.082, 0.083, ch); P(box(0.012, 0.007, 0.03), GM.blk, 0, 0.08, 0.07, ch);
  // buffer tube and collapsible stock
  P(zc(0.0155, 0.22), GM.blk, 0, 0.046, 0.18, g);
  P(zc(0.02, 0.012), GM.blk, 0, 0.046, 0.075, g);   // castle nut
  P(profileGeo([[0.17, 0.068], [0.305, 0.072], [0.31, -0.078], [0.295, -0.084], [0.255, -0.036], [0.215, -0.006], [0.175, 0.02]], 0.044, 0.006), GM.poly, 0, 0, 0, g);
  P(rb(0.046, 0.158, 0.014, 0.005), GM.rubber, 0, -0.003, 0.312, g);
  P(box(0.008, 0.006, 0.07), GM.blk, 0, 0.026, 0.215, g);   // adjustment lever
  // free-float octagonal M-LOK handguard with a full-length top rail
  const hgL = 0.25, hgZ = -0.175 - hgL / 2;
  P(new THREE.CylinderGeometry(0.031, 0.031, hgL, 8).rotateX(Math.PI / 2), GM.blk, 0, 0.058, hgZ, g, 0, 0, Math.PI / 8);
  [-1, 1].forEach(s => { for (let i = 0; i < 4; i++) P(rb(0.003, 0.008, 0.03, 0.001), GM.dark, s * 0.0285, 0.058, hgZ + 0.09 - i * 0.06, g); });
  for (let i = 0; i < 4; i++) P(rb(0.008, 0.003, 0.03, 0.001), GM.dark, 0, 0.0295, hgZ + 0.09 - i * 0.06, g);
  rail(g, hgL - 0.01, 0.0855, hgZ);
  P(rb(0.03, 0.012, 0.016, 0.003), GM.blk, 0, 0.032, -0.29, g);   // QD sling point
  // barrel and muzzle
  P(zc(0.0095, 0.4), GM.park, 0, 0.058, -0.375, g);
  let tip = -0.575;
  if (mods.muzzle === 'supp') tip = buildSuppressor(g, 0.058, -0.56, 0.02, 0.17);
  else { P(zc(0.011, 0.052), GM.blk, 0, 0.058, -0.6, g); for (let i = 0; i < 3; i++) P(box(0.003, 0.024, 0.03), GM.dark, 0, 0.058, -0.6, g, 0, 0, i * Math.PI / 3); tip = -0.626; }
  // sights
  let sightY = 0.13, relief = 0.07;
  if (mods.optic === 'iron') {
    P(rb(0.024, 0.012, 0.03, 0.002), GM.blk, 0, 0.097, 0.055, g);
    [-1, 1].forEach(s => P(box(0.004, 0.03, 0.02), GM.blk, s * 0.01, 0.115, 0.055, g));
    P(new THREE.TorusGeometry(0.0055, 0.002, 6, 16), GM.blk, 0, 0.13, 0.055, g);
    P(rb(0.022, 0.012, 0.028, 0.002), GM.blk, 0, 0.097, -0.39, g);
    [-1, 1].forEach(s => P(box(0.004, 0.034, 0.012), GM.blk, s * 0.011, 0.118, -0.39, g));
    P(box(0.0024, 0.03, 0.0024), GM.blk, 0, 0.115, -0.39, g);
  } else {
    const o = buildOptic(mods.optic, g, 0.0915, -0.03); sightY = 0.0915 + o.h; relief = o.relief; out.opticZ = o.z;
    P(rb(0.022, 0.01, 0.028, 0.002), GM.blk, 0, 0.096, -0.39, g); P(box(0.016, 0.006, 0.026), GM.blk, 0, 0.104, -0.39, g);   // folded BUIS
    P(rb(0.022, 0.01, 0.028, 0.002), GM.blk, 0, 0.096, 0.06, g); P(box(0.016, 0.006, 0.026), GM.blk, 0, 0.104, 0.06, g);
  }
  // magazine
  const mag = new THREE.Group(); g.add(mag);
  P(profileGeo(smoothPts([[-0.066, 0.0], [-0.135, 0.0], [-0.142, -0.06], [-0.152, -0.13], [-0.168, -0.2], [-0.108, -0.214], [-0.094, -0.14], [-0.08, -0.07], [-0.068, -0.03]], 3), 0.024, 0.003), GM.blk, 0, 0, 0, mag);
  P(rb(0.028, 0.012, 0.072, 0.003), GM.poly, 0, -0.212, -0.14, mag, -0.22);
  out.mag = mag; out.ch = ch;
  out.grip = marker(g, 0, -0.06, 0.045, 'grip'); out.fore = marker(g, 0, 0.02, -0.3, 'fore');
  out.muzzle = marker(g, 0, 0.058, tip - 0.005, 'muzzle'); out.eject = marker(g, 0.03, 0.06, -0.04, 'eject');
  out.sightY = sightY; out.relief = relief; out.stockZ = 0.31; out.magWell = new V3(0, -0.01, -0.1);
  return out;
}
function buildAK(mods) {
  const g = new THREE.Group(), out = { group: g };
  // stamped receiver and dust cover
  P(rb(0.046, 0.068, 0.29, 0.004), GM.blued, 0, 0.03, -0.06, g);
  const dc = new THREE.CylinderGeometry(0.0232, 0.0232, 0.235, 18, 1, false, Math.PI / 2, Math.PI); dc.rotateX(Math.PI / 2);
  P(dc, GM.blued, 0, 0.062, -0.045, g);
  P(box(0.012, 0.01, 0.012), GM.blued, 0, 0.08, 0.074, g);    // dust cover latch
  for (let i = 0; i < 4; i++) P(box(0.047, 0.002, 0.004), GM.dark, 0, 0.0645 - 0.0, 0.03 - i * 0.012, g);   // stamped ribs
  P(box(0.003, 0.022, 0.12), GM.blued, 0.024, 0.042, 0.0, g, 0.12);   // safety lever
  P(box(0.003, 0.012, 0.05), GM.dark, 0.0235, 0.05, -0.08, g);        // ejection port
  // rear sight block and leaf
  P(rb(0.03, 0.022, 0.05, 0.003), GM.blued, 0, 0.07, -0.19, g);
  P(box(0.024, 0.005, 0.07), GM.blued, 0, 0.084, -0.175, g, -0.03);
  P(box(0.006, 0.006, 0.004), GM.blued, -0.008, 0.088, -0.14, g); P(box(0.006, 0.006, 0.004), GM.blued, 0.008, 0.088, -0.14, g);
  // handguards: wood lower, wood upper over the gas tube
  P(profileGeo([[-0.208, 0.062], [-0.375, 0.058], [-0.38, 0.03], [-0.368, -0.008], [-0.215, -0.014], [-0.208, 0.004]], 0.05, 0.007), GM.wood, 0, 0, 0, g);
  P(rb(0.044, 0.006, 0.008, 0.002), GM.blued, 0, 0.026, -0.212, g);   // retainer
  P(rb(0.032, 0.03, 0.16, 0.009), GM.wood, 0, 0.083, -0.3, g);
  P(zc(0.01, 0.06), GM.blued, 0, 0.083, -0.405, g);                    // gas tube
  P(rb(0.028, 0.05, 0.032, 0.004), GM.blued, 0, 0.065, -0.44, g);      // gas block
  // barrel, front sight block, muzzle
  P(zc(0.0095, 0.37), GM.blued, 0, 0.045, -0.385, g);
  P(rb(0.02, 0.03, 0.035, 0.003), GM.blued, 0, 0.055, -0.53, g);
  [-1, 1].forEach(s => P(box(0.004, 0.026, 0.014), GM.blued, s * 0.009, 0.075, -0.53, g));
  P(box(0.0025, 0.019, 0.0025), GM.blued, 0, 0.078, -0.53, g);
  P(box(0.008, 0.012, 0.03), GM.blued, 0, 0.026, -0.54, g);           // bayonet lug
  let tip;
  if (mods.muzzle === 'supp') tip = buildSuppressor(g, 0.045, -0.57, 0.021, 0.19);
  else { P(zc(0.0125, 0.075, 16), GM.blued, 0, 0.045, -0.607, g); P(box(0.026, 0.006, 0.02), GM.dark, 0, 0.045, -0.625, g); P(box(0.006, 0.026, 0.012), GM.dark, 0, 0.045, -0.61, g); tip = -0.645; }
  // charging handle on the bolt carrier (right side)
  const ch = new THREE.Group(); g.add(ch);
  P(box(0.03, 0.009, 0.014), GM.steel, 0.034, 0.048, -0.03, ch); P(new THREE.SphereGeometry(0.008, 10, 8), GM.steel, 0.05, 0.048, -0.03, ch);
  // trigger, guard, grip, stock
  P(box(0.01, 0.004, 0.07), GM.blued, 0, -0.035, -0.02, g); P(box(0.005, 0.022, 0.006), GM.blued, 0, -0.018, -0.02, g, 0.3);
  P(profileGeo([[0.032, -0.003], [0.068, -0.003], [0.096, -0.11], [0.088, -0.122], [0.058, -0.122], [0.03, -0.02]], 0.03, 0.006), GM.plum, 0, 0, 0, g);
  P(profileGeo([[0.084, 0.062], [0.37, 0.042], [0.375, -0.112], [0.345, -0.118], [0.2, -0.05], [0.11, -0.012], [0.084, -0.004]], 0.04, 0.006), GM.wood, 0, 0, 0, g);
  P(rb(0.042, 0.158, 0.008, 0.002), GM.blued, 0, -0.036, 0.374, g);
  // optic on a side-mount bridge over the dust cover
  let sightY = 0.088, relief = 0.06;
  if (mods.optic !== 'iron') {
    P(rb(0.008, 0.04, 0.09, 0.002), GM.blk, -0.026, 0.056, -0.04, g); P(rb(0.04, 0.008, 0.09, 0.002), GM.blk, -0.006, 0.092, -0.04, g);
    rail(g, 0.09, 0.096, -0.04);
    const o = buildOptic(mods.optic, g, 0.1025, -0.04); sightY = 0.1025 + o.h; relief = o.relief; out.opticZ = o.z;
  }
  const mag = new THREE.Group(); g.add(mag);
  P(profileGeo(smoothPts([[-0.086, -0.002], [-0.152, -0.002], [-0.16, -0.05], [-0.176, -0.11], [-0.2, -0.17], [-0.226, -0.215], [-0.172, -0.242], [-0.15, -0.19], [-0.126, -0.13], [-0.106, -0.07], [-0.09, -0.025]], 3), 0.028, 0.004), GM.plum, 0, 0, 0, mag);
  P(rb(0.03, 0.02, 0.012, 0.002), GM.plum, 0, -0.22, -0.155, mag, 0.95);   // rib at the bottom
  out.mag = mag; out.ch = ch;
  out.grip = marker(g, 0, -0.06, 0.065, 'grip'); out.fore = marker(g, 0, 0.008, -0.3, 'fore');
  out.muzzle = marker(g, 0, 0.045, tip - 0.005, 'muzzle'); out.eject = marker(g, 0.03, 0.05, -0.08, 'eject');
  out.sightY = sightY; out.relief = relief; out.stockZ = 0.37; out.magWell = new V3(0, -0.01, -0.12);
  return out;
}
function buildMP5(mods) {
  const g = new THREE.Group(), out = { group: g };
  P(rb(0.05, 0.06, 0.33, 0.014), GM.blk, 0, 0.04, -0.02, g);             // receiver tube
  P(zc(0.0125, 0.17), GM.blk, 0, 0.072, -0.27, g);                      // cocking tube over the barrel
  P(rb(0.016, 0.012, 0.06, 0.003), GM.blk, 0, 0.072, -0.17, g);
  const ch = new THREE.Group(); g.add(ch);
  P(box(0.03, 0.007, 0.007), GM.blk, -0.02, 0.078, -0.32, ch, 0, 0.5); P(new THREE.SphereGeometry(0.006, 8, 6), GM.blk, -0.034, 0.078, -0.312, ch);
  P(box(0.002, 0.014, 0.045), GM.dark, 0.0252, 0.05, -0.06, g);         // ejection port
  // tapered polymer handguard
  P(profileGeo([[-0.188, 0.055], [-0.34, 0.052], [-0.346, 0.03], [-0.335, -0.004], [-0.2, -0.008], [-0.188, 0.004]], 0.052, 0.012), GM.poly, 0, 0, 0, g);
  for (let i = 0; i < 5; i++) P(box(0.053, 0.002, 0.004), GM.dark, 0, 0.012, -0.22 - i * 0.025, g);
  // barrel with tri-lugs
  P(zc(0.0085, 0.08), GM.park, 0, 0.038, -0.38, g);
  let tip;
  if (mods.muzzle === 'supp') tip = buildSuppressor(g, 0.038, -0.39, 0.022, 0.2);
  else { P(zc(0.012, 0.026, 12), GM.blk, 0, 0.038, -0.405, g); [0, 2.1, 4.2].forEach(a => P(box(0.004, 0.004, 0.012), GM.blk, Math.cos(a) * 0.012, 0.038 + Math.sin(a) * 0.012, -0.405, g)); tip = -0.418; }
  // hooded front sight and drum rear sight
  P(rb(0.016, 0.026, 0.022, 0.003), GM.blk, 0, 0.087, -0.34, g);
  P(new THREE.TorusGeometry(0.012, 0.0028, 6, 18), GM.blk, 0, 0.1, -0.34, g);
  P(box(0.0022, 0.012, 0.0022), GM.blk, 0, 0.094, -0.34, g);
  P(rb(0.02, 0.016, 0.03, 0.003), GM.blk, 0, 0.078, 0.12, g);
  P(xcylGeo(0.012, 0.03, 16), GM.blk, 0, 0.1, 0.12, g);
  P(new THREE.TorusGeometry(0.004, 0.0016, 6, 12), GM.dark, 0, 0.1, 0.105, g);
  // magwell, trigger group with an integral guard, grip
  P(rb(0.032, 0.035, 0.05, 0.004), GM.blk, 0, -0.002, -0.093, g);
  P(profileGeo([[-0.02, 0.012], [0.13, 0.012], [0.13, -0.002], [0.085, -0.01], [0.11, -0.112], [0.097, -0.122], [0.07, -0.122], [0.045, -0.03], [0.0, -0.03], [0.0, -0.048], [-0.035, -0.048], [-0.035, -0.02]], 0.035, 0.005, [[[-0.026, -0.036], [-0.004, -0.036], [-0.004, -0.004], [-0.026, -0.004]]]), GM.poly, 0, 0, 0, g);
  P(box(0.005, 0.02, 0.006), GM.steel, 0, -0.015, -0.015, g, 0.3);
  P(box(0.004, 0.008, 0.02), GM.blk, 0.019, 0.005, 0.07, g);   // selector
  // A3 collapsing stock
  [-1, 1].forEach(s => P(zc(0.0055, 0.22, 8), GM.blk, s * 0.021, 0.05, 0.255, g));
  P(rb(0.05, 0.03, 0.02, 0.006), GM.blk, 0, 0.05, 0.155, g);
  P(profileGeo([[0.355, 0.075], [0.375, 0.075], [0.378, -0.06], [0.36, -0.065], [0.352, -0.02], [0.355, 0.04]], 0.05, 0.006), GM.blk, 0, 0, 0, g);
  P(rb(0.052, 0.14, 0.012, 0.005), GM.rubber, 0, 0.005, 0.38, g);
  // claw-mount rail for optics
  let sightY = 0.1, relief = 0.07;
  if (mods.optic !== 'iron') {
    P(rb(0.034, 0.012, 0.09, 0.003), GM.blk, 0, 0.076, -0.0, g); [-1, 1].forEach(s => P(box(0.005, 0.018, 0.012), GM.blk, s * 0.024, 0.07, -0.03 + 0 * s, g));
    rail(g, 0.09, 0.082, 0.0);
    const o = buildOptic(mods.optic, g, 0.0885, -0.0); sightY = 0.0885 + o.h; relief = o.relief; out.opticZ = o.z;
  }
  const mag = new THREE.Group(); g.add(mag);
  P(profileGeo(smoothPts([[-0.074, -0.012], [-0.112, -0.012], [-0.118, -0.07], [-0.135, -0.15], [-0.162, -0.212], [-0.134, -0.226], [-0.11, -0.165], [-0.092, -0.09], [-0.077, -0.04]], 3), 0.022, 0.003), GM.blk, 0, 0, 0, mag);
  P(rb(0.025, 0.01, 0.036, 0.002), GM.blk, 0, -0.222, -0.148, mag, -0.45);
  out.mag = mag; out.ch = ch;
  out.grip = marker(g, 0, -0.06, 0.09, 'grip'); out.fore = marker(g, 0, 0.01, -0.27, 'fore');
  out.muzzle = marker(g, 0, 0.038, tip - 0.005, 'muzzle'); out.eject = marker(g, 0.03, 0.05, -0.06, 'eject');
  out.sightY = sightY; out.relief = relief; out.stockZ = 0.38; out.magWell = new V3(0, -0.02, -0.093);
  return out;
}
function buildGlock(mods) {
  const g = new THREE.Group(), out = { group: g };
  const slide = new THREE.Group(); g.add(slide);
  P(rb(0.0255, 0.029, 0.186, 0.004), GM.blk, 0, 0.035, -0.063, slide);
  for (let i = 0; i < 7; i++) P(box(0.0262, 0.02, 0.0018), GM.dark, 0, 0.033, 0.026 - i * 0.004, slide);
  P(box(0.012, 0.002, 0.034), GM.dark, 0, 0.0496, -0.03, slide);
  P(rb(0.0115, 0.006, 0.03, 0.002), GM.park, 0, 0.047, -0.03, slide);
  [-1, 1].forEach(s => { P(box(0.0055, 0.007, 0.006), GM.blk, s * 0.0055, 0.0525, 0.02, slide); P(box(0.002, 0.002, 0.001), GM.white, s * 0.0055, 0.0535, 0.0232, slide); });
  P(box(0.003, 0.008, 0.005), GM.blk, 0, 0.053, -0.148, slide); P(box(0.0018, 0.0018, 0.001), GM.white, 0, 0.0545, -0.1452, slide);
  P(zc(0.0045, 0.003, 10), GM.dark, 0, 0.033, -0.1565, slide);
  // frame: dust cover with an accessory rail, trigger guard (with its hole), grip
  P(rb(0.022, 0.018, 0.14, 0.003), GM.poly, 0, 0.012, -0.08, g);
  for (let i = 0; i < 3; i++) P(box(0.023, 0.003, 0.004), GM.dark, 0, 0.003, -0.13 + i * 0.01, g);
  P(profileGeo([[-0.072, 0.004], [-0.072, -0.024], [-0.062, -0.032], [0.0, -0.032], [0.012, -0.002], [0.012, 0.004]], 0.02, 0.003, [[[-0.062, -0.004], [-0.004, -0.004], [-0.006, -0.024], [-0.058, -0.024]]]), GM.poly, 0, 0, 0, g);
  P(box(0.005, 0.02, 0.005), GM.poly, 0, -0.013, -0.03, g, 0.25);
  P(profileGeo([[0.0, 0.004], [0.036, 0.004], [0.062, -0.1], [0.057, -0.108], [0.022, -0.108], [0.0, -0.03]], 0.03, 0.006), GM.poly, 0, 0, 0, g);
  for (let i = 0; i < 5; i++) P(box(0.031, 0.012, 0.002), GM.dark, 0, -0.04 - i * 0.012, 0.042 + i * 0.003, g, 0, 0, 0);
  let tip = -0.158;
  if (mods.muzzle === 'supp') { P(zc(0.0055, 0.02, 10), GM.park, 0, 0.033, -0.165, g); tip = buildSuppressor(g, 0.033, -0.172, 0.016, 0.15); }
  const mag = new THREE.Group(); g.add(mag);
  P(rb(0.02, 0.1, 0.028, 0.003), GM.blk, 0, -0.058, 0.026, mag, -0.38);
  P(rb(0.026, 0.01, 0.036, 0.003), GM.poly, 0, -0.112, 0.042, mag, -0.38);
  out.mag = mag; out.slide = slide;
  out.grip = marker(g, 0, -0.05, 0.035, 'grip'); out.fore = marker(g, -0.004, -0.06, 0.03, 'fore');
  out.muzzle = marker(g, 0, 0.033, tip - 0.005, 'muzzle'); out.eject = marker(g, 0.02, 0.048, -0.03, 'eject');
  out.sightY = 0.0555; out.relief = 0.18; out.stockZ = 0.05; out.magWell = new V3(0, -0.02, 0.02);
  return out;
}
function buildM870(mods) {
  const g = new THREE.Group(), out = { group: g };
  P(rb(0.045, 0.07, 0.2, 0.006), GM.blk, 0, 0.035, -0.02, g);
  P(box(0.002, 0.026, 0.07), GM.dark, 0.0228, 0.045, -0.04, g);   // ejection port
  P(box(0.002, 0.012, 0.004), GM.steel, 0.023, 0.025, 0.04, g);
  P(profileGeo([[-0.03, 0.002], [0.075, 0.002], [0.075, -0.012], [0.035, -0.045], [-0.012, -0.045], [-0.03, -0.012]], 0.03, 0.004, [[[-0.004, -0.036], [0.03, -0.036], [0.05, -0.012], [-0.004, -0.012]]]), GM.blk, 0, 0, 0, g);
  P(box(0.005, 0.022, 0.006), GM.steel, 0, -0.018, 0.01, g, 0.3);
  // barrel with vent rib and beads, magazine tube
  P(zc(0.0115, 0.5), GM.blued, 0, 0.052, -0.37, g);
  P(box(0.008, 0.004, 0.48), GM.blued, 0, 0.066, -0.37, g);
  for (let i = 0; i < 12; i++) P(box(0.006, 0.006, 0.004), GM.blued, 0, 0.063, -0.15 - i * 0.04, g);
  P(new THREE.SphereGeometry(0.0026, 8, 6), GM.white, 0, 0.0705, -0.61, g); P(new THREE.SphereGeometry(0.0018, 6, 4), GM.steel, 0, 0.0695, -0.35, g);
  P(zc(0.006, 0.004, 10), GM.dark, 0, 0.052, -0.621, g);
  P(zc(0.0115, 0.4), GM.blued, 0, 0.018, -0.32, g);
  P(zc(0.0135, 0.025, 14), GM.blued, 0, 0.018, -0.53, g);
  P(rb(0.028, 0.058, 0.016, 0.006), GM.blued, 0, 0.035, -0.5, g);
  // wooden stock and recoil pad
  P(profileGeo(smoothPts([[0.075, 0.062], [0.25, 0.052], [0.43, 0.046], [0.436, -0.112], [0.41, -0.118], [0.26, -0.07], [0.15, -0.03], [0.08, -0.012]], 3), 0.042, 0.007), GM.wood, 0, 0, 0, g);
  P(rb(0.046, 0.165, 0.022, 0.006), GM.rubber, 0, -0.034, 0.445, g);
  // pump forend, which slides back and forth
  const pump = new THREE.Group(); g.add(pump);
  P(profileGeo(smoothPts([[0.0, 0.034], [-0.175, 0.034], [-0.18, 0.004], [-0.17, -0.014], [-0.005, -0.014], [0.002, 0.004]], 2), 0.052, 0.01), GM.wood, 0, 0, -0.16, pump);
  for (let i = 0; i < 7; i++) P(box(0.0535, 0.004, 0.005), GM.woodDark, 0, -0.004, -0.185 - i * 0.022, pump);
  [-1, 1].forEach(s => P(zc(0.003, 0.17, 6), GM.steel, s * 0.013, 0.012, -0.08, pump));
  // optic on a short receiver rail
  let sightY = 0.0705, relief = 0.09;
  if (mods.optic !== 'iron') { rail(g, 0.1, 0.07, -0.02); const o = buildOptic(mods.optic, g, 0.0815, -0.02); sightY = 0.0815 + o.h; relief = o.relief; out.opticZ = o.z; }
  out.pump = pump; out.mag = null;
  out.grip = marker(g, 0, -0.02, 0.105, 'grip'); out.fore = marker(pump, 0, -0.006, -0.25, 'fore');
  out.muzzle = marker(g, 0, 0.052, -0.625, 'muzzle'); out.eject = marker(g, 0.03, 0.045, -0.04, 'eject');
  out.sightY = sightY; out.relief = relief; out.stockZ = 0.445; out.magWell = new V3(0, -0.02, -0.08);
  return out;
}
function buildMosin(mods) {
  const g = new THREE.Group(), out = { group: g };
  P(profileGeo(smoothPts([[0.43, 0.036], [0.25, 0.022], [0.12, 0.018], [0.085, 0.03], [-0.12, 0.031], [-0.4, 0.032], [-0.63, 0.033], [-0.64, 0.012], [-0.62, -0.002], [-0.3, -0.004], [-0.06, -0.008], [0.02, -0.03], [0.13, -0.052], [0.3, -0.1], [0.43, -0.136]], 2), 0.044, 0.007), GM.wood, 0, 0, 0, g);
  P(rb(0.046, 0.175, 0.008, 0.003), GM.blued, 0, -0.05, 0.432, g, 0.03);
  P(rb(0.03, 0.018, 0.33, 0.007), GM.woodDark, 0, 0.06, -0.3, g);
  P(zc(0.0172, 0.2, 18), GM.blued, 0, 0.052, -0.02, g);
  P(zc(0.0105, 0.70, 14), GM.blued, 0, 0.052, -0.47, g);
  [-0.26, -0.56].forEach(z => { P(rb(0.05, 0.068, 0.016, 0.006), GM.blued, 0, 0.03, z, g); P(box(0.004, 0.02, 0.006), GM.blued, 0.026, 0.02, z, g); });
  P(rb(0.012, 0.012, 0.02, 0.002), GM.blued, 0, 0.066, -0.795, g);
  P(new THREE.TorusGeometry(0.011, 0.0025, 6, 16), GM.blued, 0, 0.072, -0.795, g);
  P(box(0.002, 0.012, 0.002), GM.blued, 0, 0.072, -0.795, g);
  P(zc(0.0115, 0.025, 14), GM.blued, 0, 0.052, -0.81, g);
  P(rb(0.024, 0.012, 0.08, 0.002), GM.blued, 0, 0.072, -0.17, g);
  P(box(0.02, 0.004, 0.07), GM.blued, 0, 0.0785, -0.16, g, -0.02);
  P(rb(0.034, 0.055, 0.09, 0.004), GM.blued, 0, -0.005, -0.03, g);        // magazine box
  P(box(0.008, 0.004, 0.06), GM.blued, 0, -0.035, 0.05, g); P(box(0.004, 0.022, 0.006), GM.steel, 0, -0.018, 0.045, g, 0.3);
  let tip = -0.822;
  if (mods.muzzle === 'supp') tip = buildSuppressor(g, 0.052, -0.82, 0.021, 0.2);
  // the bolt: rotates up then slides back
  const bolt = new THREE.Group(); bolt.position.set(0, 0.052, 0.0); g.add(bolt);
  P(zc(0.0095, 0.13, 12), GM.steel, 0, 0, 0.05, bolt); P(zc(0.013, 0.02, 12), GM.blued, 0, 0, 0.12, bolt);
  P(box(0.06, 0.007, 0.007), GM.steel, 0.032, 0, 0.075, bolt, 0, 0, 0); P(new THREE.SphereGeometry(0.0095, 10, 8), GM.steel, 0.064, 0, 0.075, bolt);
  let sightY = 0.0785, relief = 0.06;
  if (mods.optic !== 'iron') {
    P(rb(0.028, 0.02, 0.12, 0.003), GM.blued, 0, 0.078, -0.06, g); [-1, 1].forEach(s => P(box(0.006, 0.03, 0.02), GM.blued, s * 0.014, 0.062, -0.06 + s * 0.04, g));
    const o = buildOptic(mods.optic, g, 0.088, -0.07); sightY = 0.088 + o.h; relief = o.relief; out.opticZ = o.z;
  }
  out.bolt = bolt; out.mag = null;
  out.grip = marker(g, 0, -0.03, 0.115, 'grip'); out.fore = marker(g, 0, 0.004, -0.33, 'fore');
  out.muzzle = marker(g, 0, 0.052, tip - 0.005, 'muzzle'); out.eject = marker(g, 0.03, 0.07, 0.0, 'eject');
  out.boltKnob = marker(bolt, 0.064, 0, 0.075, 'knob');
  out.sightY = sightY; out.relief = relief; out.stockZ = 0.43; out.magWell = new V3(0, 0.06, -0.02);
  return out;
}
const IRON_EYE = { m4: 0.15, ak74: 0.2, mp5: 0.22, glock: 0.42, m870: 0.22, mosin: 0.17 };
const BUILDERS = { m4: buildM4, ak74: buildAK, mp5: buildMP5, glock: buildGlock, m870: buildM870, mosin: buildMosin };
// Build a gun and merge its static parts per material (animated parts stay separate)
function buildGun(id, mods, shadows = false) {
  const def = WEAPONS[id];
  mods = Object.assign({}, def.def, mods || {});
  const m = BUILDERS[id](mods);
  const keep = [m.mag, m.ch, m.pump, m.bolt, m.slide].filter(Boolean);
  bakeGroup(m.group, keep, shadows);
  keep.forEach(k => bakeGroup(k, [], shadows));
  m.group.traverse(o => { if (o.isMesh) { o.castShadow = shadows; o.receiveShadow = shadows; } });
  // where the eye sits along the gun when aiming: behind the optic, or at the cheek weld for irons
  m.eyeZ = m.opticZ !== undefined ? m.opticZ + m.relief : IRON_EYE[id];
  m.id = id; m.def = def; m.mods = mods; m.optic = OPTICS[mods.optic] || OPTICS.iron; m.supp = !!(MUZZLES[mods.muzzle] && MUZZLES[mods.muzzle].supp);
  return m;
}
