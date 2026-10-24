'use strict';
// ---------- Boot: renderer, dusk sky, light, input, main loop ----------
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
  if (typeof GRASS !== 'undefined' && GRASS) GRASS.visible = !!SETTINGS.grass;
  $('grain').hidden = !SETTINGS.grain;
  if (typeof postApply === 'function') postApply(RENDERER);
}
function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  CAMERA.aspect = w / h; CAMERA.updateProjectionMatrix(); VMCAM.aspect = w / h; VMCAM.updateProjectionMatrix();
  applyGraphics();
}
const killcamOn = () => typeof KC !== 'undefined' && !!(KC.on || KC.armed);
let _kcWas = false;
let SUN_DIR = new V3(-0.6, 0.18, 0.4).normalize();
// Dusk sky: gradient from the map's colours, a warm glow around the low sun, a layer of drifting cloud
function buildSky() {
  const A = MAP.atmo || {}, col = (h, d) => new THREE.Color(h !== undefined ? h : d).convertSRGBToLinear();
  const g = new THREE.SphereGeometry(900, 32, 16);
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
    uniforms: { sunDir: { value: SUN_DIR.clone() }, top: { value: col(A.skyTop, 0x3a4458) }, hor: { value: col(A.skyHorizon, 0xc98a5a) }, gnd: { value: col(A.skyGround, 0x3a352e) },
      glow: { value: col(A.sunGlow, 0xffa060) }, cloud: { value: A.cloud !== undefined ? A.cloud : 0.55 }, time: { value: 0 } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 sunDir, top, hor, gnd, glow; uniform float cloud, time; varying vec3 vDir;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
      float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
      void main(){
        vec3 d = normalize(vDir); float h = d.y;
        float s = max(0.0, dot(d, normalize(sunDir)));
        vec3 horizon = mix(hor, glow, pow(s, 3.0) * 0.6);
        vec3 col = h > 0.0 ? mix(horizon, top, pow(clamp(h, 0.0, 1.0), 0.45)) : mix(horizon, gnd, min(1.0, -h * 6.0));
        col += glow * pow(s, 12.0) * 0.5 + vec3(1.0, 0.85, 0.6) * pow(s, 400.0) * 2.5;
        // clouds: lit from the sun side, darker overhead
        if (h > 0.0) {
          vec2 uv = d.xz / (h + 0.12) * 1.6 + vec2(time * 0.004, time * 0.0015);
          float c = smoothstep(1.0 - cloud, 1.0, fbm(uv) * 1.25);
          vec3 cc = mix(top * 0.55, glow * 0.9 + hor * 0.3, pow(s, 2.0) * 0.8 + 0.15);
          col = mix(col, cc, c * smoothstep(0.0, 0.15, h) * 0.85);
        }
        gl_FragColor = linearToOutputTexel(vec4(col, 1.0));
      }`,
  });
  SKY = new THREE.Mesh(g, m); SKY.frustumCulled = false; SKY.renderOrder = -1; SCENE.add(SKY);
}
function boot() {
  // log depth: the town is big and floors sit right on top of ceilings, so plain depth flickers at range
  RENDERER = new THREE.WebGLRenderer({ canvas: $('view'), antialias: true, powerPreference: 'high-performance', logarithmicDepthBuffer: true });
  RENDERER.outputEncoding = THREE.sRGBEncoding;
  RENDERER.toneMapping = THREE.ACESFilmicToneMapping;
  RENDERER.shadowMap.type = THREE.PCFSoftShadowMap; RENDERER.autoClear = false;
  SCENE = new THREE.Scene();
  CAMERA = new THREE.PerspectiveCamera(SETTINGS.fov, 1, 0.05, 1500); SCENE.add(CAMERA);
  buildTextures(); gunMats();
  if (typeof gunEnv === 'function') { try { gunEnv(RENDERER); } catch (e) { console.warn(e); } }
  buildMap(SCENE);
  collGridBuild(MAP.half);
  // light the scene from the map's mood
  const A = MAP.atmo || {};
  RENDERER.toneMappingExposure = A.exposure || 0.9;
  SCENE.fog = new THREE.Fog(A.fog !== undefined ? A.fog : 0x8a7f72, A.fogNear || 40, A.fogFar || 420);
  HEMI = new THREE.HemisphereLight(A.hemiSky !== undefined ? A.hemiSky : 0x8a95a8, A.hemiGround !== undefined ? A.hemiGround : 0x3e3628, A.hemiInt || 0.55); SCENE.add(HEMI);
  if (A.sunDir) SUN_DIR = new V3(A.sunDir[0], A.sunDir[1], A.sunDir[2]).normalize();
  SUN = new THREE.DirectionalLight(A.sunColor !== undefined ? A.sunColor : 0xffb070, A.sunInt || 1.8);
  SUN.shadow.camera.left = -70; SUN.shadow.camera.right = 70; SUN.shadow.camera.top = 70; SUN.shadow.camera.bottom = -70;
  SUN.shadow.camera.near = 10; SUN.shadow.camera.far = 600; SUN.shadow.bias = -0.0005; SUN.shadow.normalBias = 0.04;
  SUN.shadow.mapSize.set(SETTINGS.shadows === 2 ? 2048 : 1024, SETTINGS.shadows === 2 ? 2048 : 1024);
  RENDERER.shadowMap.enabled = SETTINGS.shadows > 0; SUN.castShadow = SETTINGS.shadows > 0;
  SCENE.add(SUN); SCENE.add(SUN.target);
  buildSky();
  fxInit(SCENE, null); vmInit(); FX.vmScene = VMSCENE;   // fx first: the viewmodel flash uses its texture
  navBuild();
  wildlifeInit(SCENE);
  settingsUI(); menuUI(); pauseUI(); applySettings();
  window.addEventListener('resize', onResize); onResize();
  $('view').addEventListener('webglcontextlost', e => { e.preventDefault(); hudFeedText('Graphics driver reset — reload the page (try lower shadows / render scale)', 30); });
  inputInit();
  $('loading').hidden = true;
  requestAnimationFrame(frame);
}
function inputInit() {
  const canvas = $('view');
  window.addEventListener('keydown', e => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
    if (e.code === 'Tab' || (GAME.running && e.code === 'Space')) e.preventDefault();
    if (GAME.running && (e.ctrlKey || e.metaKey)) e.preventDefault();   // keep Ctrl+W/R/T away from the browser where it lets us
    // under keyboard lock the browser no longer handles Esc: pause / resume ourselves
    if (GAME.running && e.code === 'Escape' && keyboardLocked()) {
      e.preventDefault();
      if (INPUT.locked) document.exitPointerLock();
      else if (!$('settings').hidden) $('settings').hidden = true;
      else if (!$('pause').hidden) { $('pause').hidden = true; lockPointer(); }
      return;
    }
    if (GAME.running && !cmdOpen() && (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Slash' || e.code === 'KeyT')) {
      e.preventDefault(); openCmd(e.code === 'Slash' ? '/' : ''); return;
    }
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
  // leaving fullscreen (holding Esc) also releases the keyboard: show the pause menu
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && GAME.running && !INPUT.locked && $('menu').hidden && !killcamOn()) $('pause').hidden = false; });
  // if the pointer came loose during the kill cam, bring the pause menu up once it ends
  setInterval(() => { if (GAME.running && !INPUT.locked && _kcWas && !killcamOn() && $('menu').hidden && $('settings').hidden && $('pause').hidden) $('pause').hidden = false; _kcWas = killcamOn(); }, 250);
  document.addEventListener('pointerlockchange', () => {
    INPUT.locked = document.pointerLockElement === canvas;
    if (!INPUT.locked) { INPUT.mouse.l = INPUT.mouse.r = false; closeCmd(); if (GAME.running && $('menu').hidden && $('settings').hidden && !killcamOn()) $('pause').hidden = false; }
    else { $('pause').hidden = true; $('hint').textContent = ''; }
  });
}
// Menu backdrop: a slow drone shot over the town
let menuT = 0;
function menuCam(dt) {
  menuT += dt * 0.03;
  const r = 110, x = Math.cos(menuT) * r, z = Math.sin(menuT) * r;
  CAMERA.position.set(x, groundY(x, z) + 38, z); CAMERA.lookAt(Math.cos(menuT + 1.2) * 20, groundY(0, 0) + 4, Math.sin(menuT + 1.2) * 20);
  if (CAMERA.fov !== SETTINGS.fov) { CAMERA.fov = SETTINGS.fov; CAMERA.updateProjectionMatrix(); }
}
// Show errors on screen (once each) so a player can tell us what broke
const _seenErr = new Set();
function reportError(where, e) {
  const msg = where + ': ' + (e && e.message || e);
  if (_seenErr.has(msg)) return; _seenErr.add(msg);
  console.error(e);
  try { hudFeedText('Error — ' + msg, 15); } catch (_) {}
}
window.addEventListener('error', e => reportError('script', e.error || e.message));
// Ask before the tab closes mid-match (catches Ctrl+W and stray clicks on X)
window.addEventListener('beforeunload', e => { if (GAME.running) { e.preventDefault(); e.returnValue = ''; } });
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
  // each system on its own, so one error can't freeze the rest of the game
  const run = (name, fn) => { try { fn(dt); } catch (e) { reportError(name, e); } };
  if (GAME.running) {
    run('player', playerTick); run('bots', botsTick); run('remotes', remotesTick); run('pickups', pickupsTick); run('round', roundTick); run('wildlife', wildlifeTick); run('net', netTick); run('hud', hudTick);
    if (!INPUT.locked && PL.alive && $('pause').hidden && $('menu').hidden) $('hint').textContent = 'Click to play';
  } else { run('menu', menuCam); run('remotes', remotesTick); run('wildlife', wildlifeTick); }
  run('fx', fxTick);
  if (MAP.tick) run('map', () => MAP.tick(now / 1000));
  run('preview', previewTick);
  // shadows follow the camera (snapped to texels so they don't shimmer)
  const f = CAMERA.position, snap = 140 / SUN.shadow.mapSize.x, sx = Math.round(f.x / snap) * snap, sz = Math.round(f.z / snap) * snap, sy = groundY(sx, sz);
  SUN.position.set(sx + SUN_DIR.x * 250, sy + SUN_DIR.y * 250, sz + SUN_DIR.z * 250); SUN.target.position.set(sx, sy, sz); SUN.target.updateMatrixWorld();
  SKY.position.copy(f); SKY.material.uniforms.time.value = now / 1000;
  // scene + viewmodel go into the post target when it's on, so the grade covers both
  const post = typeof postBegin === 'function' && postBegin(RENDERER);
  RENDERER.clear();
  RENDERER.render(SCENE, CAMERA);
  if (GAME.running && PL.alive && VM.root.visible) {
    RENDERER.state.buffers.depth.setMask(true);   // a depthWrite:false material may have left the mask off, which makes clearDepth a no-op
    RENDERER.clearDepth(); RENDERER.render(VMSCENE, VMCAM);
  }
  if (post) run('post', () => postEnd(RENDERER, GAME.running && PL.scoped));
  // clear one-frame input
  INPUT.pressed = {}; INPUT.mouse.lPressed = INPUT.mouse.rPressed = false; INPUT.dx = INPUT.dy = 0; INPUT.wheel = 0;
}
window.addEventListener('load', () => { setTimeout(() => { try { boot(); } catch (e) { console.error(e); $('loading').querySelector('.loadTxt').textContent = 'Failed to start: ' + e.message; } }, 30); });
