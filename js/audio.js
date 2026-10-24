'use strict';
// ---------- Synthesised sound: sniper shots rolling round the town, footsteps, gore, mechanics, ambience ----------
// Everything is procedural Web Audio. Graph: sources -> per-sound gain (+HRTF panner) -> master (volume) -> compressor -> limiter.
// Gunshots also feed a multi-tap "street echo" bus and a long convolver tail (the town throwing the shot back).
const SFX = {
  ctx: null, master: null, noiseBuf: null, volume: 0.1,
  shotLvl: 0.23,   // calibrated so the biggest shot (.50) is no louder than the old generic gunshot at the same volume
  hbRate: 0, hbNext: 0, brI: 0, brNext: 0, ambOn: false, ambWant: false,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const ctx = this.ctx = new AC(), sr = ctx.sampleRate;
    this.master = ctx.createGain(); this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -10; comp.ratio.value = 6; comp.attack.value = 0.002; comp.release.value = 0.15;
    const lim = ctx.createDynamicsCompressor(); lim.threshold.value = -1.5; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.08;
    this.master.connect(comp); comp.connect(lim); lim.connect(ctx.destination);
    // noise colours: white for transients, pink for wind/thunder, brown for deep rumble
    const len = sr * 2, mk = () => ctx.createBuffer(1, len, sr);
    const wb = mk(), pb = mk(), bb = mk(), w = wb.getChannelData(0), p = pb.getChannelData(0), b = bb.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, br = 0, pk = 0, bk = 0;
    for (let i = 0; i < len; i++) {
      const x = Math.random() * 2 - 1; w[i] = x;
      b0 = 0.99886 * b0 + x * 0.0555179; b1 = 0.99332 * b1 + x * 0.0750759; b2 = 0.969 * b2 + x * 0.153852;
      b3 = 0.8665 * b3 + x * 0.3104856; b4 = 0.55 * b4 + x * 0.5329522; b5 = -0.7616 * b5 - x * 0.016898;
      p[i] = b0 + b1 + b2 + b3 + b4 + b5 + x * 0.5362; br = (br + 0.02 * x) / 1.02; b[i] = br;
      pk = Math.max(pk, Math.abs(p[i])); bk = Math.max(bk, Math.abs(br));
    }
    for (let i = 0; i < len; i++) { p[i] *= 0.9 / pk; b[i] *= 0.9 / bk; }
    this.noiseBuf = wb; this.pinkBuf = pb; this.brownBuf = bb;
    // soft-clip curve for the muzzle blast: a real shot overloads everything, tanh keeps the peak bounded
    const N = 1024; this.satCurve = new Float32Array(N);
    for (let i = 0; i < N; i++) { const x = i / (N - 1) * 2 - 1; this.satCurve[i] = Math.tanh(2 * x) / Math.tanh(2); }
    // outdoor town reverb: early slaps off walls, then a diffuse tail that darkens as it decays
    const rl = Math.floor(sr * 2.8), rb = ctx.createBuffer(2, rl, sr);
    for (let ch = 0; ch < 2; ch++) {
      const rd = rb.getChannelData(ch); let lp = 0;
      for (let i = 0; i < rl; i++) {
        const t = i / sr, a = 0.2 + 0.75 * Math.min(1, t / 1.6);
        lp += ((Math.random() * 2 - 1) - lp) * (1 - a);
        rd[i] = lp * Math.exp(-t * 2.4) * Math.min(1, t / 0.015);
      }
      for (let k = 0; k < 16; k++) {   // discrete reflections
        const t0 = rand(0.025, 0.5), i0 = Math.floor(t0 * sr), amp = 0.6 * (1 - t0 / 0.6);
        for (let j = 0; j < sr * 0.004 && i0 + j < rl; j++) rd[i0 + j] += (Math.random() * 2 - 1) * amp * (1 - j / (sr * 0.004));
      }
    }
    this.verb = ctx.createConvolver(); this.verb.buffer = rb;
    this.verbGain = ctx.createGain(); this.verbGain.gain.value = 0.45;
    this.verb.connect(this.verbGain); this.verbGain.connect(this.master);
    // street echo: discrete slapbacks from buildings at different ranges, each duller and further round the stereo field
    this.echoIn = ctx.createGain();
    const pre = ctx.createBiquadFilter(); pre.type = 'lowpass'; pre.frequency.value = 3400; this.echoIn.connect(pre);
    const taps = [[0.11, 0.42, -0.6], [0.19, 0.34, 0.7], [0.31, 0.3, -0.25], [0.47, 0.24, 0.5], [0.69, 0.19, -0.8], [0.96, 0.14, 0.3], [1.32, 0.1, -0.45], [1.8, 0.07, 0.65]];
    taps.forEach(([dt, g, pan], i) => {
      const d = ctx.createDelay(3); d.delayTime.value = dt * rand(0.92, 1.08);
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 3000 * (1 - i * 0.09);
      const gn = ctx.createGain(); gn.gain.value = g;
      pre.connect(d); d.connect(f); f.connect(gn);
      if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; gn.connect(p); p.connect(this.master); } else gn.connect(this.master);
      if (i > 2) { const v = ctx.createGain(); v.gain.value = 0.25; gn.connect(v); v.connect(this.verb); }
    });
    this.timer = setInterval(() => this.tick(), 50);
    if (this.ambWant) this.ambient(true);
  },
  setVolume(v) { this.volume = v; if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02); },
  // where a sound is relative to the listener (camera): gain falls off with distance (roll = metres to half volume),
  // pan by angle, plus listener-local coordinates for the HRTF panner (x right, y up, z behind)
  spatial(pos, roll = 12) {
    const cam = typeof CAMERA !== 'undefined' ? CAMERA : null;
    if (!pos || !cam) return { gain: 1, pan: 0, dist: 0, lx: 0, ly: 0, lz: 0 };
    const e = cam.matrixWorld.elements, dx = pos.x - e[12], dy = pos.y - e[13], dz = pos.z - e[14];
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const lx = dx * e[0] + dy * e[1] + dz * e[2], ly = dx * e[4] + dy * e[5] + dz * e[6], lz = dx * e[8] + dy * e[9] + dz * e[10];
    const pan = dist > 0.5 ? clamp(lx / dist, -1, 1) * 0.85 : 0;
    return { gain: 1 / (1 + dist / roll), pan, dist, lx, ly, lz };
  },
  // per-sound output. sp: a number (stereo pan) or a spatial() result (HRTF placed)
  out(gain, sp = 0, wet = 0) {
    const ctx = this.ctx, g = ctx.createGain(); g.gain.value = gain;
    let node = g;
    if (typeof sp === 'number') { if (sp && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = sp; g.connect(p); node = p; } }
    else if (sp.dist > 0.6) node = this.place(g, sp);
    node.connect(this.master);
    if (wet > 0) { const wg = ctx.createGain(); wg.gain.value = wet; g.connect(wg); wg.connect(this.verb); }
    return g;
  },
  place(src, sp) {
    const ctx = this.ctx;
    if (this.hrtf !== false && ctx.createPanner) {
      try {
        const p = ctx.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = 1; p.rolloffFactor = 0;   // we do distance ourselves
        const L = sp.dist || 1, x = sp.lx / L, y = sp.ly / L, z = sp.lz / L;
        if (p.positionX) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; } else p.setPosition(x, y, z);
        src.connect(p); return p;
      } catch (e) { this.hrtf = false; }
    }
    if (!ctx.createStereoPanner) return src;
    const p = ctx.createStereoPanner(); p.pan.value = sp.pan; src.connect(p); return p;
  },
  env(param, t, g0, attack, decay) {
    if (attack > 0) { param.setValueAtTime(0.0001, t); param.linearRampToValueAtTime(g0, t + attack); } else param.setValueAtTime(g0, t);
    param.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  },
  noise(t, dur, dest, type, f, q, g0, decay, attack = 0, buf = null) {
    const ctx = this.ctx, s = ctx.createBufferSource(); s.buffer = buf || this.noiseBuf; s.loop = true;
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const g = ctx.createGain(); this.env(g.gain, t, Math.max(0.0002, g0), attack, decay);
    s.connect(fl); fl.connect(g); g.connect(dest); s.start(t, Math.random() * 1.5); s.stop(t + Math.max(dur, attack + decay) + 0.03);
    return fl;
  },
  tone(t, dest, type, f0, f1, g0, decay, attack = 0) {
    const ctx = this.ctx, o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + attack + decay);
    const g = ctx.createGain(); this.env(g.gain, t, Math.max(0.0002, g0), attack, decay);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + attack + decay + 0.03);
    return o;
  },
  sweep(fl, t, f0, f1, d) { fl.frequency.setValueAtTime(f0, t); fl.frequency.exponentialRampToValueAtTime(f1, t + d); return fl; },
  // n tiny bandpassed ticks spread over `spread` seconds: gravel crunch, shards, debris patter
  grains(t, dest, n, spread, f0, f1, q, g, d) { for (let i = 0; i < n; i++) this.noise(t + Math.random() * spread, 0, dest, 'bandpass', rand(f0, f1), q, g * rand(0.4, 1), d * rand(0.7, 1.3)); },
  // inharmonic partials: metal ringing
  ring(t, dest, freqs, g, decay) { freqs.forEach((f, i) => this.tone(t, dest, i ? 'sine' : 'triangle', f, f * 0.993, g / Math.sqrt(i + 1), decay * (1 - i * 0.12))); },
  // delay a sound by the time it takes to get here
  arrive(sp) { return this.now() + Math.min(1.2, sp.dist / 343); },
  // a few ms of lookahead: events scheduled at exactly currentTime can land mid-quantum and lose their attack
  now() { return this.ctx.currentTime + 0.01; },

  // ---------- Gunshots ----------
  // boom: blast fundamental (Hz), punch: its decay, crack: supersonic snap highpass, body: blast band, rum: thunder tail
  // length (s), rumF: its lowpass, echo/verb: environment sends, drive: saturation, post: output level after the clipper
  SHOT: {
    awm:    { boom: 50, boomG: 1.0,  punch: 0.17, crack: 4200, crackG: 0.9,  body: 850,  bodyG: 1.0, bodyD: 0.3,  rum: 2.4, rumG: 0.3,  rumF: 520, echo: 0.6,  verb: 0.45, drive: 1.25, post: 0.92 },
    m82:    { boom: 38, boomG: 1.15, punch: 0.24, crack: 3400, crackG: 1.0,  body: 620,  bodyG: 1.1, bodyD: 0.42, rum: 3.4, rumG: 0.4,  rumF: 420, echo: 0.75, verb: 0.55, drive: 1.45, post: 1.0, brake: true },
    svd:    { boom: 62, boomG: 0.9,  punch: 0.13, crack: 4800, crackG: 0.85, body: 1100, bodyG: 0.9, bodyD: 0.22, rum: 1.9, rumG: 0.24, rumF: 650, echo: 0.5,  verb: 0.4,  drive: 1.15, post: 0.85 },
    m200:   { boom: 44, boomG: 1.05, punch: 0.2,  crack: 5200, crackG: 1.0,  body: 760,  bodyG: 1.0, bodyD: 0.34, rum: 2.8, rumG: 0.34, rumF: 480, echo: 0.65, verb: 0.5,  drive: 1.35, post: 0.96 },
    deagle: { boom: 90, boomG: 0.8,  punch: 0.09, crack: 3000, crackG: 0.95, body: 1500, bodyG: 0.9, bodyD: 0.15, rum: 1.3, rumG: 0.17, rumF: 750, echo: 0.4,  verb: 0.35, drive: 1.25, post: 0.95 },
  },
  shotProfile(snd) {
    snd = snd || {};
    const tail = snd.tail || 0.4;
    return { boom: snd.low || 60, boomG: 0.95, punch: 0.13, crack: snd.crack || 3500, crackG: 0.85, body: snd.body || 900, bodyG: 0.9, bodyD: tail * 0.6,
      rum: 1 + tail * 2.5, rumG: 0.25, rumF: 600, echo: 0.5, verb: 0.4, drive: 1.15, post: 0.85 };
  },
  // A gunshot. pos null = our own gun. Distant shots arrive late (343 m/s), duller, and with relatively more echo.
  shot(snd, pos, suppressed, weaponId) {
    if (!this.ctx) return;
    const ctx = this.ctx, P = this.SHOT[weaponId] || this.shotProfile(snd), S = !!suppressed;
    // suppressed: never silent, ~30% as loud, falls off faster and fades out between 70 and 120 m
    // unsuppressed: the direct sound carries (roll 60 m) so a sniper at 300 m can still be placed by ear
    const sp = this.spatial(pos, S ? 18 : 60), far = pos ? clamp((sp.dist - 20) / 230, 0, 1) : 0;
    if (S && pos && sp.dist > 120) return;
    const fade = S && pos ? clamp(1 - (sp.dist - 70) / 50, 0, 1) : 1;
    const t = this.now() + (pos ? Math.min(1.5, sp.dist / 343) : 0);
    const L = this.shotLvl, g = (pos ? sp.gain * 1.1 : 1) * P.post * L * (S ? 0.6 * fade : 1);
    // HRTF alone barely separates the ears for a shot that's mostly low boom (~2 dB at 90 degrees), so a share of the
    // direct sound also goes through a plain stereo pan: you can tell which side a sniper is on, HRTF still gives front/back
    const placed = pos && sp.dist > 0.6, out = this.out(g * (placed ? 0.62 : 1), sp);
    const air = ctx.createBiquadFilter(); air.type = 'lowpass'; air.Q.value = 0.5;
    air.frequency.value = pos ? lerp(16000, 2400, Math.pow(far, 0.6)) : 18000; air.connect(out);   // keep some top end: HRTF needs it to tell front from back
    if (placed) air.connect(this.out(g * 0.5, clamp(sp.lx / sp.dist, -1, 1)));
    const sh = ctx.createWaveShaper(); sh.curve = this.satCurve; sh.oversample = '2x'; sh.connect(air);
    const src = ctx.createGain(); src.gain.value = P.drive * (S ? 0.7 : 1); src.connect(sh);
    // environment sends fall off slower than the direct sound (the town echoes a far shot), but never drown it:
    // the echo bus isn't placed, and if it dominates you can't tell where the shot came from
    const env = pos ? 0.8 / (1 + sp.dist / 100) : 1;
    const sl = ctx.createBiquadFilter(); sl.type = 'lowpass'; sl.frequency.value = lerp(9000, 1500, far); sh.connect(sl);
    const eg = ctx.createGain(); eg.gain.value = P.post * L * env * P.echo * (S ? 0.2 : 1); sl.connect(eg); eg.connect(this.echoIn);
    const vg = ctx.createGain(); vg.gain.value = P.post * L * env * P.verb * (S ? 0.3 : 1); sl.connect(vg); vg.connect(this.verb);
    // supersonic crack: the bullet is supersonic suppressed or not, so it stays (thinned by distance)
    const cg = P.crackG * (S ? 0.55 : 1) * (1 - far * 0.5);
    this.noise(t, 0, src, 'highpass', P.crack, 0.7, cg, 0.014);
    this.noise(t, 0, src, 'bandpass', 6500, 1.2, cg * 0.6, 0.005);
    // muzzle blast: pressure punch sweeping down + the broadband body
    this.tone(t, src, 'sine', P.boom * 3.2, P.boom, P.boomG * (S ? 0.5 : 1), P.punch);
    this.tone(t, src, 'triangle', P.boom * 1.6, P.boom * 0.6, P.boomG * (S ? 0.18 : 0.45), P.punch * 1.8);
    if (!S) {
      this.noise(t, 0, src, 'bandpass', P.body, 0.6, P.bodyG, P.bodyD);
      this.noise(t, 0, src, 'lowpass', 2000, 0.5, P.bodyG * 0.7, P.bodyD * 0.5);
      if (P.brake) { this.noise(t + 0.004, 0, src, 'bandpass', 2600, 0.9, 0.55, 0.05); this.noise(t + 0.011, 0, src, 'bandpass', 1500, 0.8, 0.45, 0.07); }
      if (!pos) this.tone(t, air, 'sine', 48, 30, 0.45 * P.boomG, 0.22);   // felt in the chest
    } else {
      this.noise(t, 0, src, 'lowpass', 700, 0.8, 0.7, 0.07);   // the can's thump
      this.noise(t, 0, src, 'bandpass', 1800, 1.5, 0.25, 0.03);
      if (sp.dist < 40) this.noise(t + 0.012, 0, air, 'bandpass', 2600, 2.5, 0.3, 0.04);   // the action cycling
    }
    this.rumble(t + 0.04, air, P.rum * (S ? 0.5 : 1) * (1 + far * 0.4), P.rumG * (S ? 0.25 : 1) * (1 + far * 1.2), P.rumF * (1 - far * 0.4));
  },
  // rolling thunder after a big shot: lowpassed pink noise with a lumpy, decaying envelope
  rumble(t, dest, len, g, f) {
    const ctx = this.ctx, s = ctx.createBufferSource(); s.buffer = this.pinkBuf; s.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.6; this.sweep(lp, t, f, f * 0.4, len);
    const gg = ctx.createGain(), gp = gg.gain; gp.setValueAtTime(0.0001, t); gp.linearRampToValueAtTime(g * 0.8, t + 0.08);
    const steps = Math.max(3, Math.ceil(len / 0.17)); let tt = t + 0.08;
    for (let i = 1; i <= steps; i++) { tt += len / steps * rand(0.7, 1.3); gp.linearRampToValueAtTime(g * Math.pow(1 - i / steps, 1.7) * rand(0.4, 1.15) + 0.0001, tt); }
    s.connect(lp); lp.connect(gg); gg.connect(dest); s.start(t, Math.random()); s.stop(tt + 0.1);
  },
  // supersonic crack of a bullet passing close: a sharp N-wave snap and a slap off the nearest wall
  crack(pos) {
    if (!this.ctx) return;
    const sp = this.spatial(pos, 30), out = this.out(0.75, sp), t = this.now();
    this.noise(t, 0, out, 'highpass', 2500, 0.8, 0.9, 0.007);
    this.noise(t, 0, out, 'bandpass', 5200, 1.5, 0.5, 0.003);
    this.tone(t, out, 'square', 1700, 700, 0.12, 0.012);
    const e = this.ctx.createGain(); e.gain.value = 0.35; out.connect(e); e.connect(this.echoIn);
  },
  whiz(pos) {   // a bullet zipping past
    if (!this.ctx) return;
    const sp = this.spatial(pos, 30), out = this.out(0.55, sp), t = this.now();
    this.sweep(this.noise(t, 0, out, 'bandpass', 4500, 5, 0.7, 0.14, 0.025), t, 5200, 1200, 0.17);
    this.tone(t, out, 'sine', 2300, 900, 0.05, 0.14, 0.02);
  },

  // ---------- Mechanics ----------
  click(pos, f = 2600, g = 0.35, q = 4) {   // a mechanical tick: mag catch, bolt, empty trigger
    if (!this.ctx) return;
    const sp = this.spatial(pos, 8), out = this.out(sp.gain, sp);
    this.noise(this.now(), 0, out, 'bandpass', f, q, g, 0.035);
  },
  mech(kind, pos) {
    if (!this.ctx) return;
    const t = this.now(), sp = this.spatial(pos, 8); if (pos && sp.gain < 0.05) return;
    const out = this.out(sp.gain * 0.9, sp);
    const c = (dt, f, q, g, d, a = 0) => this.noise(t + dt, 0, out, 'bandpass', f, q, g, d, a);
    const r = (dt, fs, g, d) => this.ring(t + dt, out, fs, g, d);
    const slide = (dt, f0, f1, g, d) => this.sweep(c(dt, f0, 1.5, g, d, 0.01), t + dt, f0, f1, d);
    if (kind === 'magOut') { c(0, 3200, 5, 0.35, 0.012); slide(0.02, 1500, 2200, 0.18, 0.08); c(0.1, 900, 2, 0.3, 0.05); r(0.1, [1100, 2500], 0.03, 0.1); }
    else if (kind === 'magIn') { slide(0, 1300, 1700, 0.15, 0.06); this.tone(t + 0.07, out, 'sine', 160, 90, 0.3, 0.05); c(0.07, 1200, 2, 0.45, 0.04); c(0.09, 4200, 6, 0.35, 0.01); r(0.09, [1700, 3900], 0.03, 0.08); }
    else if (kind === 'bolt') { this.mech('boltUp', pos); setTimeout(() => this.mech('boltBack', pos), 110); setTimeout(() => this.mech('boltFwd', pos), 330); }
    else if (kind === 'boltUp') { c(0, 2800, 6, 0.3, 0.015); r(0, [1900, 3700], 0.03, 0.07); c(0.02, 1200, 2, 0.15, 0.03); }
    else if (kind === 'boltBack') { slide(0, 1200, 2200, 0.3, 0.09); c(0.09, 2400, 3, 0.4, 0.02); r(0.09, [1500, 3100], 0.04, 0.12); }
    else if (kind === 'boltFwd') { slide(0, 1900, 1300, 0.28, 0.06); c(0.06, 1300, 2, 0.45, 0.03); c(0.13, 3400, 6, 0.35, 0.012); r(0.13, [2100, 4300], 0.03, 0.1); }
    else if (kind === 'chamber') { c(0, 1500, 2, 0.3, 0.03); this.tone(t + 0.08, out, 'sine', 220, 110, 0.25, 0.04); c(0.08, 1800, 2, 0.5, 0.03); r(0.08, [1400, 2900, 4800], 0.05, 0.15); }
    else if (kind === 'equip') { c(0, 900, 0.7, 0.2, 0.15, 0.05); c(0.1, 2600, 4, 0.22, 0.02); c(0.14, 1400, 2, 0.2, 0.03); }
    else if (kind === 'empty') { c(0, 3800, 7, 0.35, 0.008); c(0.004, 1800, 3, 0.15, 0.01); }
    else if (kind === 'select') { c(0, 3000, 6, 0.3, 0.015); }
    else if (kind === 'knifeDraw') { this.sweep(c(0, 2500, 3, 0.2, 0.18, 0.03), t, 2500, 6000, 0.2); r(0.15, [4200, 6800, 9100], 0.04, 0.4); }
    else if (kind === 'pumpBack') { c(0, 1200, 2, 0.6, 0.07); }
    else if (kind === 'pumpFwd') { c(0, 1500, 2, 0.6, 0.06); c(0.03, 3000, 4, 0.3, 0.03); }
    else if (kind === 'shell') { c(0, 1700, 3, 0.4, 0.05); c(0.06, 900, 2, 0.3, 0.06); }
  },

  // ---------- Movement ----------
  // footstep: heel strike then toe roll, voiced per surface. loud: ~0.3 crouch/prone, 0.7 walk, 1+ sprint.
  // pos null = ours (quieter, it's under us); remote steps are HRTF-placed so you can hear someone creeping up
  step(pos, surface, loud = 1) {
    if (!this.ctx) return;
    const L = clamp(loud, 0.1, 1.6), sp = this.spatial(pos, 7);
    if (pos && sp.dist > 25 + 30 * L) return;   // far steps are inaudible anyway; 8 bots walking would cost ~250 sources a second
    const t = this.now();
    const out = this.out(sp.gain * (pos ? 0.9 : 0.5) * (0.3 + 0.7 * L), sp);
    const soft = L < 0.5, toe = lerp(0.095, 0.05, clamp(L - 0.3, 0, 1)) * rand(0.85, 1.15), a = soft ? 0.01 : 0;
    this.foot(t, out, surface, 1, a, L);
    this.foot(t + toe, out, surface, soft ? 0.35 : 0.55, a, L);
    // cloth and kit moving with the stride
    this.noise(t, 0, out, 'bandpass', rand(1400, 2200), 0.6, 0.07 * L, 0.16, 0.04);
    if (L > 0.95 && Math.random() < 0.5) this.grains(t + 0.03, out, 2, 0.08, 3000, 6000, 8, 0.05, 0.02);
  },
  foot(t, out, s, g, a, L) {
    const n = (dt, type, f, q, gg, d, at = a) => this.noise(t + dt, 0, out, type, f * rand(0.88, 1.12), q, gg * g, d, at);
    const th = (f0, f1, gg, d) => this.tone(t, out, 'sine', f0, f1, gg * g, d, a);
    if (s === 'gravel') { th(110, 60, 0.2, 0.06); n(0, 'bandpass', 900, 0.8, 0.25, 0.07); this.grains(t, out, Math.round((8 + L * 6) * g), 0.09, 1800, 5500, 3, 0.25 * g, 0.012); }
    else if (s === 'dirt') { n(0, 'lowpass', 600, 0.7, 0.5, 0.06); th(100, 55, 0.3, 0.06); this.grains(t, out, 2, 0.05, 1500, 3000, 2, 0.1 * g, 0.01); }
    else if (s === 'grass') { n(0, 'lowpass', 500, 0.7, 0.3, 0.05); th(90, 50, 0.22, 0.05); n(0.01, 'bandpass', 3800, 0.5, 0.22, 0.16, 0.03); this.grains(t, out, 3, 0.1, 2500, 6000, 3, 0.08 * g, 0.008); }
    else if (s === 'wood') {
      th(95, 70, 0.4, 0.09); n(0, 'bandpass', 450, 2.5, 0.45, 0.06); n(0, 'bandpass', 1600, 1, 0.15, 0.03);
      if (g > 0.9 && Math.random() < 0.22) this.creak(t + 0.04, out, 0.06 * L);
    }
    else if (s === 'metal') { n(0, 'bandpass', 2500, 1, 0.35, 0.02); th(120, 60, 0.25, 0.05); const r = rand(0.9, 1.1); this.ring(t, out, [380 * r, 920 * r, 1730 * r, 2650 * r], 0.11 * g * Math.min(1, L + 0.2), 0.35); }
    else if (s === 'water') {
      this.sweep(n(0, 'bandpass', 1100, 0.8, 0.5, 0.18, 0.01), t, 700, 2000, 0.18); n(0.02, 'highpass', 5000, 0.5, 0.1, 0.25);
      for (let i = 0; i < 3; i++) this.tone(t + rand(0.03, 0.15), out, 'sine', rand(450, 700), rand(1100, 1500), 0.06 * g, 0.05);
    }
    else { n(0, 'bandpass', 1500, 1.1, 0.55, 0.035); th(140, 70, 0.25, 0.05); n(0.01, 'highpass', 4500, 0.5, 0.08, 0.06); }   // concrete / asphalt
  },
  creak(t, dest, g) {   // old floorboard: a buzzy, wandering tone through a narrow band
    const ctx = this.ctx, o = ctx.createOscillator(); o.type = 'sawtooth';
    let f = rand(180, 320); o.frequency.setValueAtTime(f, t);
    for (let i = 1; i <= 6; i++) { f *= rand(0.9, 1.12); o.frequency.linearRampToValueAtTime(f, t + i * 0.045); }
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = rand(800, 1200); bp.Q.value = 6;
    const gn = ctx.createGain(); this.env(gn.gain, t, g, 0.04, 0.25);
    o.connect(bp); bp.connect(gn); gn.connect(dest); o.start(t); o.stop(t + 0.32);
  },
  land(pos) {
    if (!this.ctx) return;
    const sp = this.spatial(pos, 8), out = this.out(sp.gain * 0.7, sp), t = this.now();
    this.noise(t, 0, out, 'lowpass', 600, 1, 0.7, 0.12); this.tone(t, out, 'sine', 90, 45, 0.45, 0.12);
    this.noise(t, 0, out, 'bandpass', 1600, 0.6, 0.15, 0.2, 0.02); this.grains(t + 0.02, out, 4, 0.12, 2500, 5000, 6, 0.08, 0.02);   // kit rattles
  },

  // ---------- Hits and damage ----------
  hit(head, kill) {   // feedback when our bullet lands (you rarely hear the real impact at 200 m)
    if (!this.ctx) return;
    const out = this.out(0.5, 0), t = this.now();
    if (head) { this.tone(t, out, 'triangle', 2400, 2200, 0.4, 0.12); this.ring(t, out, [3600, 5300], 0.12, 0.16); this.grains(t, out, 3, 0.02, 1500, 3500, 3, 0.2, 0.01); }
    else { this.noise(t, 0, out, 'bandpass', 1700, 3, 0.55, 0.03); this.tone(t, out, 'sine', 900, 600, 0.1, 0.04); }
    if (kill) { this.tone(t + 0.06, out, 'sine', 220, 214, 0.22, 0.4); this.tone(t + 0.06, out, 'sine', 330, 326, 0.12, 0.45); this.tone(t + 0.06, out, 'sine', 55, 40, 0.35, 0.25); }
  },
  hurt(plate) {
    if (!this.ctx) return;
    const out = this.out(0.38, 0), t = this.now();   // a gut punch, but not louder than our own rifle
    if (plate) { this.tone(t, out, 'sine', 180, 90, 0.4, 0.1); this.ring(t, out, [850, 2100, 3900], 0.12, 0.2); this.noise(t, 0, out, 'bandpass', 2500, 1, 0.35, 0.03); return; }
    this.tone(t, out, 'sine', 140, 50, 0.85, 0.18); this.noise(t, 0, out, 'lowpass', 500, 1, 0.55, 0.1);
    // a muffled grunt: buzzy source through two vowel formants, kept low so it reads as breath forced out
    const ctx = this.ctx, o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(rand(115, 135), t + 0.01); o.frequency.exponentialRampToValueAtTime(80, t + 0.2);
    const g = ctx.createGain(); this.env(g.gain, t + 0.01, 0.12, 0.02, 0.17);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400; g.connect(lp);
    [[650, 4], [1150, 5]].forEach(([f, q]) => { const b = ctx.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = f; b.Q.value = q; o.connect(b); b.connect(g); });
    lp.connect(out); o.start(t); o.stop(t + 0.25);
  },
  fleshHit(pos, head) {   // wet thud; a headshot is a horrible pop with bone in it
    if (!this.ctx) return;
    const sp = this.spatial(pos, 15); if (pos && sp.gain < 0.03) return;
    const t = pos ? this.arrive(sp) : this.now(), out = this.out(sp.gain * 0.6, sp, 0.1);
    if (head) {
      this.noise(t, 0, out, 'bandpass', 2200, 1.2, 0.5, 0.012); this.tone(t, out, 'sine', 380, 90, 0.4, 0.05);
      this.grains(t, out, 7, 0.04, 1500, 4000, 2, 0.3, 0.01);
      this.sweep(this.noise(t, 0, out, 'bandpass', 1400, 1.5, 0.55, 0.18), t, 1400, 350, 0.18);
      this.noise(t + 0.02, 0, out, 'highpass', 2500, 0.5, 0.14, 0.3, 0.03); this.tone(t, out, 'sine', 60, 35, 0.4, 0.15);
    } else {
      this.tone(t, out, 'sine', 75, 38, 0.55, 0.11); this.noise(t, 0, out, 'lowpass', 380, 0.8, 0.6, 0.09);
      this.sweep(this.noise(t, 0, out, 'bandpass', 900, 2.5, 0.35, 0.1), t, 900, 400, 0.1);
      this.noise(t + 0.02, 0, out, 'highpass', 3000, 0.5, 0.08, 0.15, 0.02);
    }
  },
  knifeSwing(pos) {
    if (!this.ctx) return;
    const sp = this.spatial(pos, 8), out = this.out(sp.gain * 0.8, sp), t = this.now();
    const fl = this.noise(t, 0, out, 'bandpass', 500, 1.2, 0.45, 0.14, 0.06);
    fl.frequency.setValueAtTime(500, t); fl.frequency.exponentialRampToValueAtTime(2600, t + 0.08); fl.frequency.exponentialRampToValueAtTime(700, t + 0.22);
  },
  knifeHit(pos) {   // meaty stab: thud, wet squelch, gristle, then the pull
    if (!this.ctx) return;
    const sp = this.spatial(pos, 10), out = this.out(sp.gain * 0.85, sp), t = this.now();
    this.tone(t, out, 'sine', 90, 45, 0.6, 0.12); this.noise(t, 0, out, 'lowpass', 300, 0.8, 0.5, 0.1);
    this.sweep(this.noise(t, 0, out, 'bandpass', 400, 3, 0.5, 0.12), t, 400, 1100, 0.12);
    this.grains(t, out, 4, 0.03, 1200, 2600, 2, 0.2, 0.01);
    this.sweep(this.noise(t + 0.13, 0, out, 'bandpass', 800, 2, 0.25, 0.1, 0.02), t + 0.13, 800, 500, 0.12);
  },
  plateBreak(pos) {   // ceramic plate cracking: a sharp snap and a scatter of shards
    if (!this.ctx) return;
    const sp = this.spatial(pos, 12), out = this.out(sp.gain * 0.8, sp), t = this.now();
    this.noise(t, 0, out, 'highpass', 2000, 0.7, 0.45, 0.02); this.noise(t, 0, out, 'bandpass', 1200, 1, 0.35, 0.08);
    this.grains(t + 0.01, out, 14, 0.25, 3000, 8000, 6, 0.18, 0.02);
    this.ring(t, out, [2900, 4700], 0.05, 0.06); this.tone(t, out, 'sine', 120, 60, 0.35, 0.1);
  },
  plateInsert() {   // velcro rip, then the plate clunking home and the strap snapping down
    if (!this.ctx) return;
    const out = this.out(0.7, 0), t = this.now();
    this.velcro(t, out, 0.35, 1);
    this.tone(t + 0.45, out, 'sine', 130, 70, 0.4, 0.08); this.noise(t + 0.45, 0, out, 'bandpass', 1000, 2, 0.35, 0.05);
    this.noise(t + 0.56, 0, out, 'bandpass', 3000, 4, 0.25, 0.015);
  },
  velcro(t, out, len, g) {
    const n = Math.round(len * 65);
    for (let i = 0; i < n; i++) this.noise(t + i / n * len + rand(0, 0.004), 0, out, 'bandpass', rand(2200, 3400), 1, g * rand(0.15, 0.3), 0.006);
    this.noise(t, 0, out, 'bandpass', 2000, 0.8, 0.12 * g, len * 0.8, 0.05);
  },
  pickup(kind) {
    if (!this.ctx) return;
    const out = this.out(0.6, 0), t = this.now();
    if (kind === 'ammo') { this.grains(t, out, 6, 0.12, 1800, 4000, 4, 0.2, 0.015); this.noise(t + 0.05, 0, out, 'bandpass', 900, 2, 0.3, 0.05); this.ring(t + 0.05, out, [2300, 3700], 0.03, 0.12); }
    else if (kind === 'plate') { this.tone(t, out, 'sine', 140, 75, 0.35, 0.08); this.noise(t, 0, out, 'bandpass', 1100, 2, 0.3, 0.05); this.velcro(t + 0.1, out, 0.15, 0.7); }
    else { this.noise(t, 0, out, 'bandpass', 1300, 0.7, 0.15, 0.12, 0.03); this.noise(t + 0.08, 0, out, 'bandpass', 2800, 4, 0.25, 0.02); }
    this.tone(t + 0.02, out, 'sine', 330, 330, 0.04, 0.2, 0.01);   // a barely-there confirm
  },
  scopeIn() {
    if (!this.ctx) return;
    const out = this.out(0.6, 0), t = this.now();
    this.noise(t, 0, out, 'bandpass', 1200, 0.7, 0.1, 0.12, 0.05);   // sleeve
    this.noise(t + 0.08, 0, out, 'lowpass', 400, 0.8, 0.18, 0.04);   // cheek on the stock
    this.sweep(this.noise(t, 0, out, 'lowpass', 200, 1, 0.06, 0.2, 0.06), t, 200, 700, 0.25);
  },
  scopeOut() {
    if (!this.ctx) return;
    const out = this.out(0.5, 0), t = this.now();
    this.noise(t, 0, out, 'bandpass', 1000, 0.7, 0.09, 0.1, 0.03); this.noise(t + 0.03, 0, out, 'lowpass', 350, 0.8, 0.1, 0.04);
  },
  zoomTick() {
    if (!this.ctx) return;
    const out = this.out(0.6, 0), t = this.now();
    this.noise(t, 0, out, 'bandpass', 4200, 8, 0.12, 0.006); this.noise(t + 0.003, 0, out, 'bandpass', 2200, 4, 0.06, 0.008);
  },
  impact(pos, mat) {
    if (!this.ctx) return;
    const sp = this.spatial(pos, 14); if (sp.gain < 0.04) return;
    if (mat === 'flesh') return this.fleshHit(pos, false);
    const t = this.arrive(sp), out = this.out(sp.gain * 0.5, sp, 0.15);
    const rico = p => { if (Math.random() < p) this.tone(t + 0.01, out, 'triangle', rand(2400, 3200), rand(1300, 1900), 0.06, 0.35); };
    if (mat === 'metal') { this.ring(t, out, [rand(700, 1100), rand(1700, 2300), rand(2900, 3600), rand(4400, 5200)], 0.2, 0.4); this.noise(t, 0, out, 'highpass', 4000, 1, 0.35, 0.02); rico(0.35); }
    else if (mat === 'wood') { this.noise(t, 0, out, 'bandpass', 700, 2, 0.55, 0.05); this.tone(t, out, 'sine', 260, 140, 0.2, 0.04); this.grains(t, out, 3, 0.05, 2000, 4000, 4, 0.12, 0.01); }
    else if (mat === 'dirt' || mat === 'grass' || mat === 'gravel') { this.noise(t, 0, out, 'lowpass', 700, 0.8, 0.5, 0.07); this.tone(t, out, 'sine', 80, 40, 0.3, 0.07); this.grains(t + 0.1, out, 6, 0.35, 1500, 3500, 3, 0.06, 0.01); }
    else if (mat === 'glass') { this.noise(t, 0, out, 'highpass', 3000, 0.7, 0.5, 0.04); this.grains(t + 0.01, out, 16, 0.4, 3500, 9000, 10, 0.15, 0.03); this.ring(t, out, [5200, 7400], 0.04, 0.2); }
    else if (mat === 'foliage') { this.noise(t, 0, out, 'bandpass', 3000, 0.6, 0.25, 0.2, 0.01); this.grains(t, out, 4, 0.08, 1500, 3500, 3, 0.1, 0.01); }
    else if (mat === 'water') { this.sweep(this.noise(t, 0, out, 'bandpass', 900, 0.8, 0.5, 0.2), t, 600, 2200, 0.2); this.noise(t + 0.03, 0, out, 'highpass', 5000, 0.5, 0.12, 0.3); }
    else { this.noise(t, 0, out, 'bandpass', 1800, 1, 0.5, 0.04); this.grains(t + 0.01, out, 4, 0.12, 3000, 6000, 4, 0.12, 0.012); rico(0.15); }   // concrete, brick
  },

  // ---------- Body: heartbeat and breathing (scheduled by tick) ----------
  // heartbeat(x): 0 off; 0..1 = intensity (70..135 bpm); >3 = bpm
  heartbeat(rate) {
    if (!rate || rate <= 0) { this.hbRate = 0; return; }
    this.hbRate = rate; this.hbBpm = rate > 3 ? rate : lerp(70, 135, clamp(rate, 0, 1));
    this.hbI = rate > 3 ? clamp((rate - 60) / 80, 0.3, 1) : clamp(rate, 0.2, 1);
  },
  beat(t, I) {
    const out = this.out(0.9 * (0.4 + 0.6 * I), 0), lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260; lp.connect(out);
    this.tone(t, lp, 'triangle', 64, 42, 0.6, 0.14); this.noise(t, 0, lp, 'lowpass', 140, 0.7, 0.3, 0.08);
    this.tone(t + 0.17, lp, 'triangle', 56, 38, 0.4, 0.12);
  },
  // breath(on): false/0 off, true = calm, 0..1 = how hard (sprinting, hurt)
  breath(on) { this.brI = typeof on === 'number' ? clamp(on, 0, 1) : on ? 0.3 : 0; if (this.brI === 0 && on === true) this.brI = 0.3; },
  breathCycle(t, I) {
    const out = this.out(0.7, 0), k = 1.3 - I;
    this.noise(t, 0, out, 'bandpass', 1600, 0.8, 0.035 + 0.05 * I, 0.25, 0.5 * k);   // in
    this.noise(t + 0.75 * k, 0, out, 'bandpass', 850, 0.7, 0.05 + 0.06 * I, 0.8 * k, 0.12);   // out
  },
  breathHold() { if (!this.ctx) return; const out = this.out(0.7, 0), t = this.now(); this.noise(t, 0, out, 'bandpass', 1500, 0.8, 0.07, 0.12, 0.35); },
  breathOut() { if (!this.ctx) return; const out = this.out(0.7, 0), t = this.now(); this.noise(t, 0, out, 'bandpass', 800, 0.7, 0.09, 0.9, 0.08); },

  // ---------- Ambience: wind with gusts, and now and then a crow, a dog, far thunder, loose sheet metal ----------
  ambient(on) {
    this.ambWant = !!on; if (!this.ctx) return;
    const ctx = this.ctx, now = ctx.currentTime;
    if (!this.ambBus) this.ambBuild();
    this.ambOn = !!on;
    this.ambBus.gain.setTargetAtTime(on ? 0.7 : 0, now, on ? 1.5 : 0.4);
    if (on) { this.gustT = now; this.evT = now + rand(10, 25); }
  },
  ambBuild() {
    const ctx = this.ctx; this.ambBus = ctx.createGain(); this.ambBus.gain.value = 0; this.ambBus.connect(this.master);
    const layer = (buf, type, f, q, g, pan) => {
      const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true;
      const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
      const gn = ctx.createGain(); gn.gain.value = g; s.connect(fl); fl.connect(gn);
      if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; gn.connect(p); p.connect(this.ambBus); } else gn.connect(this.ambBus);
      s.start(0, Math.random() * 1.5); return { fl, gn, base: g };
    };
    this.wind = [layer(this.pinkBuf, 'bandpass', 380, 0.55, 0.022, -0.5), layer(this.pinkBuf, 'bandpass', 420, 0.55, 0.022, 0.5)];
    this.windLow = layer(this.brownBuf, 'lowpass', 140, 0.5, 0.025, 0);
    this.whistle = layer(this.noiseBuf, 'bandpass', 1150, 10, 0, 0.2);
  },
  ambTick(now) {
    if (now > this.gustT) {   // each side gusts on its own, so the wind moves around you
      const d = rand(2.5, 7), lv = rand(0.25, 1); this.gustT = now + d;
      this.wind.forEach(w => { const l = clamp(lv * rand(0.7, 1.3), 0.15, 1.1); w.gn.gain.setTargetAtTime(w.base * l, now, d / 3); w.fl.frequency.setTargetAtTime(lerp(260, 620, l) * rand(0.9, 1.1), now, d / 3); });
      this.windLow.gn.gain.setTargetAtTime(this.windLow.base * (0.5 + lv * 0.6), now, d / 2);
      this.whistle.gn.gain.setTargetAtTime(lv > 0.75 ? (lv - 0.75) * 0.004 : 0, now, d / 4);
      this.whistle.fl.frequency.setTargetAtTime(rand(900, 1500), now, d / 3);
    }
    if (now > this.evT) {
      this.evT = now + rand(18, 45);
      const r = Math.random(), t = now + 0.1;
      if (r < 0.38) this.crow(t); else if (r < 0.62) this.dog(t); else if (r < 0.82) this.thunder(t); else this.tin(t);
    }
  },
  evOut(lpF, wet) {   // somewhere off in the town: random direction, dulled by distance, mostly reverb
    if (!this.ambBus) this.ambBuild();
    const ctx = this.ctx, g = ctx.createGain(), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = lpF; g.connect(lp);
    let node = lp; if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = rand(-0.9, 0.9); lp.connect(p); node = p; }
    node.connect(this.ambBus);
    const w = ctx.createGain(); w.gain.value = wet; lp.connect(w); w.connect(this.verb);
    return g;
  },
  crow(t) {
    const ctx = this.ctx, dest = this.evOut(2600, 0.35), n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const tc = t + i * rand(0.38, 0.55), f = rand(480, 620);
      const o = ctx.createOscillator(), o2 = ctx.createOscillator(); o.type = 'sawtooth'; o2.type = 'square';
      [o, o2].forEach((x, k) => { const m = k ? 0.5 : 1; x.frequency.setValueAtTime(f * 1.08 * m, tc); x.frequency.linearRampToValueAtTime(f * m, tc + 0.05); x.frequency.exponentialRampToValueAtTime(f * 0.82 * m, tc + 0.28); });
      const m2 = ctx.createGain(); m2.gain.value = 0.4;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 1.8;
      const g = ctx.createGain(), gp = g.gain; gp.setValueAtTime(0.0001, tc); gp.linearRampToValueAtTime(0.05, tc + 0.03); gp.linearRampToValueAtTime(0.035, tc + 0.18); gp.exponentialRampToValueAtTime(0.0001, tc + 0.3);
      o.connect(bp); o2.connect(m2); m2.connect(bp); bp.connect(g); g.connect(dest);
      o.start(tc); o2.start(tc); o.stop(tc + 0.32); o2.stop(tc + 0.32);
    }
  },
  dog(t) {
    const ctx = this.ctx, dest = this.evOut(1500, 0.55), n = 2 + Math.floor(Math.random() * 3); let tb = t;
    for (let i = 0; i < n; i++) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; const f = rand(330, 420);
      o.frequency.setValueAtTime(f, tb); o.frequency.linearRampToValueAtTime(f * 1.4, tb + 0.02); o.frequency.exponentialRampToValueAtTime(f * 0.8, tb + 0.14);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 800; bp.Q.value = 1.2;
      const g = ctx.createGain(); this.env(g.gain, tb, 0.05, 0.01, 0.13);
      o.connect(bp); bp.connect(g); g.connect(dest); o.start(tb); o.stop(tb + 0.18);
      this.noise(tb, 0, dest, 'bandpass', 1200, 1, 0.02, 0.08, 0.005);
      tb += Math.random() < 0.2 ? rand(0.8, 1.4) : rand(0.25, 0.45);
    }
  },
  thunder(t) {
    const dest = this.evOut(400, 0.3), len = rand(5, 8);
    this.noise(t + 0.3, 0, dest, 'lowpass', 600, 0.7, 0.04, 0.6, 0.05);
    const ctx = this.ctx, s = ctx.createBufferSource(); s.buffer = this.brownBuf; s.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = rand(130, 180);
    const g = ctx.createGain(), gp = g.gain; gp.setValueAtTime(0.0001, t); let tt = t + rand(0.6, 1.2); gp.linearRampToValueAtTime(0.12, tt);
    while (tt < t + len) { tt = Math.min(tt + rand(0.3, 0.9), t + len); gp.linearRampToValueAtTime(0.12 * Math.pow(Math.max(0, 1 - (tt - t) / len), 1.3) * rand(0.4, 1) + 0.0001, tt); }
    gp.linearRampToValueAtTime(0.0001, t + len + 0.3);
    s.connect(lp); lp.connect(g); g.connect(dest); s.start(t, Math.random()); s.stop(t + len + 0.4);
  },
  tin(t) {   // a loose sheet of roofing banging somewhere
    const dest = this.evOut(1800, 0.5), n = 1 + Math.floor(Math.random() * 3), f = rand(180, 240);
    for (let i = 0; i < n; i++) { const tt = t + i * rand(0.25, 0.6); this.ring(tt, dest, [f, f * 2.37, f * 3.9, f * 5.6], 0.03, 0.9); this.noise(tt, 0, dest, 'bandpass', 900, 1, 0.03, 0.05); }
  },
  tick() {
    const ctx = this.ctx; if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime, ahead = now + 0.2;
    if (this.hbRate > 0) { if (this.hbNext < now) this.hbNext = now + 0.05; while (this.hbNext < ahead) { this.beat(this.hbNext, this.hbI); this.hbNext += 60 / this.hbBpm; } }
    if (this.brI > 0) { if (this.brNext < now) this.brNext = now + 0.05; while (this.brNext < ahead) { this.breathCycle(this.brNext, this.brI); this.brNext += lerp(3.6, 1.5, this.brI); } }
    if (this.ambOn) this.ambTick(now);
  },
};
