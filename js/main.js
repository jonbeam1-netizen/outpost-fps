'use strict';
// ---------- Boot: renderer, sky, light, input, main loop ----------
let RENDERER, SCENE, SUN, HEMI, SKY;
function applyGraphics() {
  if (!RENDERER) return;
  RENDERER.setPixelRatio(Math.min(2, window.devicePixelRatio || 1) * SETTINGS.scale);
  RENDERER.setSize(window.innerWidth, window.innerHeight, false);
  const on = SETTINGS.shadows > 0, size = SETTINGS.shadows === 2 ? 2048 : 1024;
  let changed = RENDERER.shadowMap.enabled !== on;
  RENDERER.shadowMap.enabled = on; SUN.castShadow = on;
  if (SUN.shadow.mapSize.x !== size) { SUN.shadow.mapSize.set(size, size); if (SUN.shadow.map) { SUN.shadow.map.dispose(); SUN.shadow.map = null; } changed = true; }
  // shaders bake in the shadow setup, so recompile after any change
  if (changed) SCENE.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.needsUpdate = true); });
  if (GRASS) GRASS.visible = !!SETTINGS.grass;
}
function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  CAMERA.aspect = w / h; CAMERA.updateProjectionMatrix(); VMCAM.aspect = w / h; VMCAM.updateProjectionMatrix();
  applyGraphics();
}
function buildSky() {
  const g = new THREE.SphereGeometry(900, 32, 16);
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { sunDir: { value: SUN.position.clone().normalize() } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 sunDir; varying vec3 vDir;
      void main(){
        float h = clamp(vDir.y, -0.2, 1.0);
        vec3 horizon = vec3(0.86, 0.80, 0.68), zenith = vec3(0.36, 0.52, 0.72), ground = vec3(0.45, 0.44, 0.38);
        vec3 col = h > 0.0 ? mix(horizon, zenith, pow(h, 0.55)) : mix(horizon, ground, min(1.0, -h * 5.0));
        float s = max(0.0, dot(normalize(vDir), normalize(sunDir)));
        col += vec3(1.0, 0.85, 0.6) * pow(s, 8.0) * 0.35 + vec3(1.0, 0.95, 0.85) * pow(s, 900.0) * 3.0;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  SKY = new THREE.Mesh(g, m); SKY.frustumCulled = false; SCENE.add(SKY);
}
function boot() {
  RENDERER = new THREE.WebGLRenderer({ canvas: $('view'), antialias: true, powerPreference: 'high-performance' });
  RENDERER.outputEncoding = THREE.sRGBEncoding;
  RENDERER.toneMapping = THREE.ACESFilmicToneMapping; RENDERER.toneMappingExposure = 1.05;
  RENDERER.shadowMap.type = THREE.PCFSoftShadowMap; RENDERER.autoClear = false;
  SCENE = new THREE.Scene();
  SCENE.fog = new THREE.Fog(0xcfc6b0, 60, 330);
  CAMERA = new THREE.PerspectiveCamera(SETTINGS.fov, 1, 0.05, 1200); SCENE.add(CAMERA);
  HEMI = new THREE.HemisphereLight(0xcfe0ff, 0x5a5440, 0.62); SCENE.add(HEMI);
  SUN = new THREE.DirectionalLight(0xffe6c0, 2.1); SUN.position.set(-120, 140, 90);
  SUN.shadow.camera.left = -55; SUN.shadow.camera.right = 55; SUN.shadow.camera.top = 55; SUN.shadow.camera.bottom = -55;
  SUN.shadow.camera.near = 10; SUN.shadow.camera.far = 420; SUN.shadow.bias = -0.0004; SUN.shadow.normalBias = 0.03;
  SUN.shadow.mapSize.set(SETTINGS.shadows === 2 ? 2048 : 1024, SETTINGS.shadows === 2 ? 2048 : 1024);
  RENDERER.shadowMap.enabled = SETTINGS.shadows > 0; SUN.castShadow = SETTINGS.shadows > 0;
  SCENE.add(SUN); SCENE.add(SUN.target);
  buildSky();
  buildTextures(); gunMats();
  buildMap(SCENE);
  fxInit(SCENE, null); vmInit(); FX.vmScene = VMSCENE;   // fx first: the viewmodel flash uses its texture
  settingsUI(); menuUI(); pauseUI(); applySettings();
  window.addEventListener('resize', onResize); onResize();
  inputInit();
  $('loading').hidden = true;
  requestAnimationFrame(frame);
}
function inputInit() {
  const canvas = $('view');
  window.addEventListener('keydown', e => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
    if (e.code === 'Tab' || (GAME.running && e.code === 'Space')) e.preventDefault();
    if (!INPUT.keys[e.code]) INPUT.pressed[e.code] = true;
    INPUT.keys[e.code] = true;
  });
  window.addEventListener('keyup', e => { INPUT.keys[e.code] = false; });
  window.addEventListener('blur', () => { INPUT.keys = {}; INPUT.mouse.l = INPUT.mouse.r = false; });
  canvas.addEventListener('mousedown', e => {
    if (!GAME.running) return;
    SFX.init();
    if (!INPUT.locked) { lockPointer(); return; }
    if (e.button === 0) { INPUT.mouse.l = true; INPUT.mouse.lPressed = true; }
    if (e.button === 2) { INPUT.mouse.r = true; INPUT.mouse.rPressed = true; }
  });
  window.addEventListener('mouseup', e => { if (e.button === 0) INPUT.mouse.l = false; if (e.button === 2) INPUT.mouse.r = false; });
  window.addEventListener('contextmenu', e => { if (GAME.running) e.preventDefault(); });
  window.addEventListener('mousemove', e => { if (INPUT.locked) { INPUT.dx += e.movementX; INPUT.dy += e.movementY; } });
  window.addEventListener('wheel', e => { if (INPUT.locked) INPUT.wheel += Math.sign(e.deltaY); }, { passive: true });
  document.addEventListener('pointerlockchange', () => {
    INPUT.locked = document.pointerLockElement === canvas;
    if (!INPUT.locked) { INPUT.mouse.l = INPUT.mouse.r = false; if (GAME.running && $('menu').hidden && $('settings').hidden) $('pause').hidden = false; }
    else { $('pause').hidden = true; $('hint').textContent = ''; }
  });
}
// Menu backdrop: a slow drone shot over the compound
let menuT = 0;
function menuCam(dt) {
  menuT += dt * 0.04;
  const r = 70, x = Math.cos(menuT) * r, z = Math.sin(menuT) * r;
  CAMERA.position.set(x, 28, z); CAMERA.lookAt(Math.cos(menuT + 0.9) * 10, 4, Math.sin(menuT + 0.9) * 10);
}
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
  if (GAME.running) {
    playerTick(dt);
    remotesTick(dt);
    netTick(dt);
    hudTick(dt);
    if (!INPUT.locked && PL.alive && $('pause').hidden && $('menu').hidden) $('hint').textContent = 'Click to play';
  } else { menuCam(dt); remotesTick(dt); }
  fxTick(dt);
  previewTick(dt);
  // shadows follow the camera
  const f = CAMERA.position;
  SUN.position.set(f.x - 120 * 0.4, 140 * 0.4, f.z + 90 * 0.4); SUN.target.position.set(f.x, 0, f.z); SUN.target.updateMatrixWorld();
  SKY.position.copy(f);
  RENDERER.clear();
  RENDERER.render(SCENE, CAMERA);
  if (GAME.running && PL.alive && VM.root.visible) {
    RENDERER.state.buffers.depth.setMask(true);   // a depthWrite:false material may have left the mask off, which makes clearDepth a no-op
    RENDERER.clearDepth(); RENDERER.render(VMSCENE, VMCAM);
  }
  // clear one-frame input
  INPUT.pressed = {}; INPUT.mouse.lPressed = INPUT.mouse.rPressed = false; INPUT.dx = INPUT.dy = 0; INPUT.wheel = 0;
}
window.addEventListener('load', () => { setTimeout(() => { try { boot(); } catch (e) { console.error(e); $('loading').querySelector('.loadTxt').textContent = 'Failed to start: ' + e.message; } }, 30); });
