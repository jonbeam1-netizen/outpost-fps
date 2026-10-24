'use strict';
// ---------- Effects: muzzle flash, tracers, impacts, bullet holes, ejected brass ----------
const FX = { list: [], scene: null, vmScene: null };
let flashTex, puffTex, holeTex, sparkTex;
function fxInit(scene, vmScene) {
  FX.scene = scene; FX.vmScene = vmScene;
  flashTex = canvasTex(128, 128, (g, w, h) => {
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,250,220,1)'); gr.addColorStop(0.25, 'rgba(255,200,90,0.9)'); gr.addColorStop(0.6, 'rgba(255,120,30,0.3)'); gr.addColorStop(1, 'rgba(255,80,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'lighter'; g.strokeStyle = 'rgba(255,220,150,0.8)'; g.lineWidth = 6;
    for (let i = 0; i < 5; i++) { const a = i / 5 * TAU + 0.3; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + Math.cos(a) * 60, 64 + Math.sin(a) * 60); g.stroke(); }
  });
  puffTex = canvasTex(64, 64, (g, w, h) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  sparkTex = canvasTex(32, 32, (g, w, h) => { const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,240,180,1)'); gr.addColorStop(1, 'rgba(255,160,40,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  holeTex = canvasTex(64, 64, (g, w, h) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 30); gr.addColorStop(0, 'rgba(10,10,10,1)'); gr.addColorStop(0.25, 'rgba(25,22,20,0.95)'); gr.addColorStop(0.5, 'rgba(60,55,50,0.5)'); gr.addColorStop(1, 'rgba(60,55,50,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  // bullet holes: one instanced mesh, recycled
  const hg = new THREE.PlaneGeometry(1, 1);
  FX.holes = new THREE.InstancedMesh(hg, new THREE.MeshBasicMaterial({ map: holeTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), 300);
  FX.holes.count = 0; FX.holes.frustumCulled = false; FX.holeIdx = 0; scene.add(FX.holes);
  FX.flashLight = new THREE.PointLight(0xffb060, 0, 9, 2); scene.add(FX.flashLight);
  FX.brassGeo = zcylGeo(0.0045, 0.0045, 0.022, 6); FX.shellGeo = zcylGeo(0.0095, 0.0095, 0.065, 8);
}
const _hq = new THREE.Quaternion(), _hm = new THREE.Matrix4(), _hp = new V3(), _hs = new V3(), _hn = new V3();
function fxHole(p, n) {
  _hn.set(n[0], n[1], n[2]); _hq.setFromUnitVectors(new V3(0, 0, 1), _hn);
  _hq.multiply(new THREE.Quaternion().setFromAxisAngle(new V3(0, 0, 1), Math.random() * TAU));
  _hp.copy(p).addScaledVector(_hn, 0.005); const s = rand(0.06, 0.09); _hs.set(s, s, s);
  _hm.compose(_hp, _hq, _hs); FX.holes.setMatrixAt(FX.holeIdx % 300, _hm);
  FX.holeIdx++; FX.holes.count = Math.min(FX.holeIdx, 300); FX.holes.instanceMatrix.needsUpdate = true;
}
function sprite(tex, color, size, additive, scene = FX.scene) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
  s.scale.set(size, size, 1); scene.add(s); return s;
}
// impact puff + sparks + hole, coloured by surface
function fxImpact(p, n, mat) {
  if (mat !== 'flesh') fxHole(p, n);
  const col = mat === 'flesh' ? 0x8a1010 : mat === 'wood' ? 0x9a7a55 : mat === 'dirt' ? 0x8a7a5a : mat === 'metal' ? 0x9a9a9a : 0xb0aca0;
  const nv = new V3(n[0], n[1], n[2]);
  for (let i = 0; i < (mat === 'flesh' ? 3 : 2); i++) {
    const s = sprite(puffTex, col, 0.15, false); s.position.copy(p).addScaledVector(nv, 0.05);
    s.material.opacity = mat === 'flesh' ? 0.9 : 0.7;
    FX.list.push({ obj: s, t: 0, life: rand(0.35, 0.6), vel: nv.clone().multiplyScalar(rand(0.6, 1.4)).add(new V3(rand(-0.4, 0.4), rand(0.1, 0.6), rand(-0.4, 0.4))), grow: rand(0.6, 1.0), fade: true });
  }
  if (mat === 'metal' || mat === 'concrete') for (let i = 0; i < 4; i++) {
    const s = sprite(sparkTex, 0xffc070, 0.04, true); s.position.copy(p);
    FX.list.push({ obj: s, t: 0, life: rand(0.12, 0.25), vel: nv.clone().multiplyScalar(rand(2, 4)).add(new V3(rand(-2, 2), rand(0, 3), rand(-2, 2))), grav: 9, fade: true });
  }
}
// A remote muzzle flash in the world (and the light it throws)
function fxMuzzle(p, dir, big = 1) {
  const s = sprite(flashTex, 0xffffff, 0.35 * big, true); s.position.copy(p); s.material.rotation = Math.random() * TAU;
  FX.list.push({ obj: s, t: 0, life: 0.05 });
  FX.flashLight.position.copy(p); FX.flashLight.intensity = 3 * big; FX.flashT = 0.05;
}
// Tracer: a bright streak running from o to e
const _trGeo = new THREE.CylinderGeometry(0.006, 0.006, 1, 4, 1, true); _trGeo.rotateX(Math.PI / 2); _trGeo.translate(0, 0, 0.5);   // runs along +z, which lookAt points at the target
let _trMat = null;
function fxTracer(o, e) {
  if (!_trMat) _trMat = new THREE.MeshBasicMaterial({ color: 0xffd890, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const m = new THREE.Mesh(_trGeo, _trMat); m.position.copy(o); m.lookAt(e); FX.scene.add(m);
  const dist = o.distanceTo(e);
  FX.list.push({ obj: m, t: 0, life: dist / 600 + 0.02, tracer: { o: o.clone(), e: e.clone(), dist } });
}
// Ejected brass in the viewmodel scene (falls out of view)
function fxBrass(scene, p, right, up, shotgun) {
  const m = new THREE.Mesh(shotgun ? FX.shellGeo : FX.brassGeo, shotgun ? GM.shell : GM.brass); m.position.copy(p); scene.add(m);
  m.rotation.set(Math.random() * 3, Math.random() * 3, 0);
  const v = right.clone().multiplyScalar(rand(1.2, 2)).addScaledVector(up, rand(0.8, 1.6));
  FX.list.push({ obj: m, t: 0, life: 0.6, vel: v, grav: 6, spin: new V3(rand(-20, 20), rand(-20, 20), rand(-20, 20)) });
}
function fxTick(dt) {
  if (FX.flashT > 0) { FX.flashT -= dt; if (FX.flashT <= 0) FX.flashLight.intensity = 0; }
  for (let i = FX.list.length - 1; i >= 0; i--) {
    const f = FX.list[i]; f.t += dt; const k = f.t / f.life;
    if (k >= 1) { f.obj.parent && f.obj.parent.remove(f.obj); if (f.obj.material && f.obj.material !== _trMat && !f.obj.isMesh) f.obj.material.dispose(); FX.list.splice(i, 1); continue; }
    if (f.vel) { if (f.grav) f.vel.y -= f.grav * dt; f.obj.position.addScaledVector(f.vel, dt); f.vel.multiplyScalar(1 - dt * 2); }
    if (f.spin) { f.obj.rotation.x += f.spin.x * dt; f.obj.rotation.y += f.spin.y * dt; }
    if (f.grow) { const s = f.obj.scale.x * (1 + f.grow * dt * 3); f.obj.scale.set(s, s, 1); }
    if (f.fade && f.obj.material) { if (f.op0 === undefined) f.op0 = f.obj.material.opacity; f.obj.material.opacity = f.op0 * (1 - k); }
    if (f.tracer) {
      const tr = f.tracer, head = Math.min(tr.dist, f.t * 600), tail = Math.max(0, head - 6);
      f.obj.position.copy(tr.o).lerp(tr.e, tail / tr.dist); f.obj.scale.set(1, 1, Math.max(0.01, head - tail));
    }
  }
}
