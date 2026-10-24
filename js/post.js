'use strict';
// ---------- Post: dusk grade, soft bloom, vignette over the scene + viewmodel ----------
// Hand-rolled (no examples/ downloads): scene + viewmodel render into one (MSAA) half-float target,
// bloom runs at half/quarter res, one full-screen triangle composites + grades straight to the canvas.
// SETTINGS.post: 0 off (render to screen as before), 1 high, 2 low.
const POST = { q: -1, w: 0, h: 0, rt: null, b: [], hdr: false, msaa: 0, bad: false, active: false,
  thr: 0.8, knee: 0.15, bloom: 0.9, vig: 0.24, ca: 0.002 };
const POST_VS = 'varying vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }';
// bright pass: 4 bilinear taps = a 4x4 box, so a 1 px tracer doesn't flicker in and out at half res
const POST_BRIGHT = `uniform sampler2D tS; uniform vec2 px; uniform float thr, knee, srgb; varying vec2 vUv;
vec3 dec(vec3 c){ c = max(c, 0.0); return srgb > 0.5 ? mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)) : c; }
void main(){
  vec3 c = dec(texture2D(tS, vUv + px * vec2(-1.0, -1.0)).rgb) + dec(texture2D(tS, vUv + px * vec2(1.0, -1.0)).rgb)
         + dec(texture2D(tS, vUv + px * vec2(-1.0, 1.0)).rgb) + dec(texture2D(tS, vUv + px * vec2(1.0, 1.0)).rgb);
  c *= 0.25;
  float m = max(c.r, max(c.g, c.b)), s = clamp(m - thr + knee, 0.0, 2.0 * knee);
  s = s * s / (4.0 * knee + 1e-4);
  gl_FragColor = vec4(c * max(s, m - thr) / max(m, 1e-4), 1.0);
}`;
// separable 9-tap gaussian in 5 linear fetches
const POST_BLUR = `uniform sampler2D tS; uniform vec2 dir; varying vec2 vUv;
void main(){
  vec3 c = texture2D(tS, vUv).rgb * 0.227027;
  c += (texture2D(tS, vUv + dir * 1.384615).rgb + texture2D(tS, vUv - dir * 1.384615).rgb) * 0.316216;
  c += (texture2D(tS, vUv + dir * 3.230769).rgb + texture2D(tS, vUv - dir * 3.230769).rgb) * 0.070270;
  gl_FragColor = vec4(c, 1.0);
}`;
const POST_COPY = 'uniform sampler2D tS; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(tS, vUv).rgb, 1.0); }';
const POST_FINAL = `uniform sampler2D tS, tB1, tB2; uniform float bloom, vig, ca, srgb, aspect, seed; varying vec2 vUv;
vec3 dec(vec3 c){ c = max(c, 0.0); return srgb > 0.5 ? mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)) : c; }
vec3 toSRGB(vec3 c){ c = clamp(c, 0.0, 1.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main(){
  vec2 d = vUv - 0.5; float r2 = dot(d, d);
  vec3 c;
  if (ca > 0.0) { vec2 o = d * r2 * ca * 4.0; c = vec3(texture2D(tS, vUv - o).r, texture2D(tS, vUv).g, texture2D(tS, vUv + o).b); }
  else c = texture2D(tS, vUv).rgb;
  c = dec(c);
  if (bloom > 0.0) c += (texture2D(tB1, vUv).rgb * 0.4 + texture2D(tB2, vUv).rgb * 0.6) * bloom;
  // grade in display space: soft roll-off of HDR spill, lifted blacks, mild S-curve, desaturate, split-tone
  c = c / (1.0 + max(vec3(0.0), c - 0.85) * 1.2);
  vec3 g = toSRGB(c);
  float l = dot(g, vec3(0.2126, 0.7152, 0.0722));
  g = mix(g, g * g * (3.0 - 2.0 * g), 0.12 * smoothstep(0.08, 0.35, l));   // contrast in the mids, not the toe: dark windows stay readable
  g = mix(vec3(l), g, 0.9);
  g += vec3(-0.014, 0.004, 0.018) * l * (1.0 - l) * (1.0 - l) * 6.0 + vec3(0.026, 0.009, -0.02) * l * l;
  g = g * 0.97 + 0.022;
  // vignette: a gentle darkening at the corners, lighter than the scope's
  vec2 v = d * vec2(aspect, 1.0) / max(aspect, 1.0);
  g *= 1.0 - vig * smoothstep(0.18, 0.62, dot(v, v) * 1.6);
  // dither so the dark dusk gradients don't band
  g += (fract(sin(dot(gl_FragCoord.xy + seed, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
  gl_FragColor = vec4(g, 1.0);
}`;
function postMat(fs, u) { return new THREE.ShaderMaterial({ uniforms: u, vertexShader: POST_VS, fragmentShader: fs, depthTest: false, depthWrite: false, toneMapped: false }); }
function postSetup() {
  // one oversized triangle covers the screen
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  POST.mesh = new THREE.Mesh(g, null); POST.mesh.frustumCulled = false;
  POST.scene = new THREE.Scene(); POST.scene.add(POST.mesh); POST.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  POST.mBright = postMat(POST_BRIGHT, { tS: { value: null }, px: { value: new THREE.Vector2() }, thr: { value: POST.thr }, knee: { value: POST.knee }, srgb: { value: 0 } });
  POST.mBlur = postMat(POST_BLUR, { tS: { value: null }, dir: { value: new THREE.Vector2() } });
  POST.mCopy = postMat(POST_COPY, { tS: { value: null } });
  POST.mFinal = postMat(POST_FINAL, { tS: { value: null }, tB1: { value: null }, tB2: { value: null }, bloom: { value: POST.bloom }, vig: { value: POST.vig }, ca: { value: POST.ca }, srgb: { value: 0 }, aspect: { value: 1 }, seed: { value: 0 } });
}
function postFree() { if (POST.rt) POST.rt.dispose(); POST.b.forEach(t => t.dispose()); POST.rt = null; POST.b = []; }
function postBuild(r, w, h, q) {
  postFree();
  const gl2 = r.capabilities.isWebGL2;
  // half float keeps tracers / fire / the sun above 1.0 for the bloom (8-bit fallback clips them)
  POST.hdr = gl2 || r.extensions.has('EXT_color_buffer_half_float');
  const type = POST.hdr ? THREE.HalfFloatType : THREE.UnsignedByteType;
  const opt = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, type, depthBuffer: true, stencilBuffer: true };   // stencil → 24-bit depth (depth alone is 16-bit in r128)
  POST.msaa = gl2 && THREE.WebGLMultisampleRenderTarget ? Math.min(q === 2 ? 2 : 4, r.capabilities.maxSamples || 0) : 0;
  POST.rt = POST.msaa ? new THREE.WebGLMultisampleRenderTarget(w, h, opt) : new THREE.WebGLRenderTarget(w, h, opt);
  if (POST.msaa) POST.rt.samples = POST.msaa;
  // store sRGB-encoded like the canvas, so transparent haze / smoke / blood blend exactly as they do without post
  // (linear blending made the distance look fogged); the shaders decode
  POST.rt.texture.encoding = THREE.sRGBEncoding;
  POST.rt.texture.generateMipmaps = false;
  const bo = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, type, depthBuffer: false, stencilBuffer: false };
  const hw = Math.max(1, w >> 1), hh = Math.max(1, h >> 1), qw = Math.max(1, w >> 2), qh = Math.max(1, h >> 2);
  POST.b = [new THREE.WebGLRenderTarget(hw, hh, bo), new THREE.WebGLRenderTarget(hw, hh, bo), new THREE.WebGLRenderTarget(qw, qh, bo), new THREE.WebGLRenderTarget(qw, qh, bo)];
  POST.b.forEach(t => { t.texture.generateMipmaps = false; });
  POST.mBright.uniforms.srgb.value = POST.mFinal.uniforms.srgb.value = 1;
  POST.w = w; POST.h = h; POST.q = q;
  // make sure the driver actually accepts the target before we rely on it
  r.setRenderTarget(POST.rt); const ctx = r.getContext(), ok = ctx.checkFramebufferStatus(ctx.FRAMEBUFFER) === ctx.FRAMEBUFFER_COMPLETE; r.setRenderTarget(null);
  // r128 resolves MSAA after every render() and blits depth+stencil too when these flags are set; ANGLE does that
  // multisampled depth resolve with a slow shader (~4 ms at 1080p). The buffers were allocated above, so drop the
  // flags: only colour gets resolved, and we never read the resolved depth.
  if (POST.msaa) { POST.rt.depthBuffer = false; POST.rt.stencilBuffer = false; }
  return ok;
}
// called from applyGraphics (resize, render scale, the 'post' setting)
function postApply(r) {
  const q = SETTINGS.post | 0;
  if (!q || POST.bad) { postFree(); POST.q = 0; return; }
  if (!POST.scene) postSetup();
  const s = r.getDrawingBufferSize(new THREE.Vector2()), w = Math.max(1, s.x | 0), h = Math.max(1, s.y | 0);
  if (POST.rt && POST.w === w && POST.h === h && POST.q === q) return;
  try { if (!postBuild(r, w, h, q)) throw new Error('render target incomplete'); }
  catch (e) { console.warn('post-processing off:', e); POST.bad = true; postFree(); POST.q = 0; }
}
// before the scene: point rendering at our target (or the screen when off)
function postBegin(r) {
  POST.active = !!POST.rt;
  r.setRenderTarget(POST.active ? POST.rt : null);
  return POST.active;
}
function postPass(r, mat, target) { POST.mesh.material = mat; r.setRenderTarget(target); r.render(POST.scene, POST.cam); }
// after scene + viewmodel: bloom chain, then grade to the canvas
function postEnd(r, scoped) {
  const F = POST.mFinal.uniforms, b = POST.b, low = POST.q === 2;
  // a scope view stays crisp: no bloom smear or fringing over the reticle, and the scope draws its own vignette
  const doBloom = !scoped;
  if (doBloom) {
    const B = POST.mBright.uniforms; B.tS.value = POST.rt.texture; B.px.value.set(1 / POST.w, 1 / POST.h); B.thr.value = POST.thr; B.knee.value = POST.knee;
    postPass(r, POST.mBright, b[0]);
    const U = POST.mBlur.uniforms;
    U.tS.value = b[0].texture; U.dir.value.set(1 / b[0].width, 0); postPass(r, POST.mBlur, b[1]);
    U.tS.value = b[1].texture; U.dir.value.set(0, 1 / b[0].height); postPass(r, POST.mBlur, b[0]);
    if (!low) {   // a wider, softer halo from quarter res: two blur rounds, the second with spread-out taps
      POST.mCopy.uniforms.tS.value = b[0].texture; postPass(r, POST.mCopy, b[2]);
      for (const k of [1, 2.2]) {
        U.tS.value = b[2].texture; U.dir.value.set(k / b[2].width, 0); postPass(r, POST.mBlur, b[3]);
        U.tS.value = b[3].texture; U.dir.value.set(0, k / b[2].height); postPass(r, POST.mBlur, b[2]);
      }
    }
  }
  F.tS.value = POST.rt.texture; F.tB1.value = b[0].texture; F.tB2.value = low ? b[0].texture : b[2].texture;
  F.bloom.value = doBloom ? POST.bloom : 0; F.ca.value = doBloom && !low ? POST.ca : 0; F.vig.value = scoped ? 0 : POST.vig;
  F.aspect.value = POST.w / POST.h; F.seed.value = (F.seed.value + 17.13) % 1000;
  postPass(r, POST.mFinal, null);
}
