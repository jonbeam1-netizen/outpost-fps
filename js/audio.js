'use strict';
// ---------- Synthesised sound: gunshots, mechanics, footsteps, hit cues ----------
const SFX = {
  ctx: null, master: null, noiseBuf: null, volume: 0.1,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -10; comp.ratio.value = 6; comp.attack.value = 0.002; comp.release.value = 0.15;
    this.master.connect(comp); comp.connect(ctx.destination);
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    // a short room/outdoor reverb for gun tails
    const rl = ctx.sampleRate * 1.6, rb = ctx.createBuffer(2, rl, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const rd = rb.getChannelData(ch); for (let i = 0; i < rl; i++) rd[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / rl, 3.2); }
    this.verb = ctx.createConvolver(); this.verb.buffer = rb;
    this.verbGain = ctx.createGain(); this.verbGain.gain.value = 0.35;
    this.verb.connect(this.verbGain); this.verbGain.connect(this.master);
  },
  setVolume(v) { this.volume = v; if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02); },
  // where a sound is relative to the listener: gain falls off with distance, pan by angle
  spatial(pos) {
    if (!pos) return { gain: 1, pan: 0, dist: 0 };
    const cam = CAMERA, dx = pos.x - cam.position.x, dy = pos.y - cam.position.y, dz = pos.z - cam.position.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const yaw = PLAYER ? PLAYER.yaw : 0;
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);   // listener's right vector
    const pan = dist > 0.5 ? clamp((dx * rx + dz * rz) / dist, -1, 1) * 0.8 : 0;
    return { gain: 1 / (1 + dist / 12), pan, dist };
  },
  out(gain, pan, wet = 0) {
    const g = this.ctx.createGain(); g.gain.value = gain;
    let node = g;
    if (this.ctx.createStereoPanner) { const p = this.ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); node = p; }
    node.connect(this.master);
    if (wet > 0) { const wg = this.ctx.createGain(); wg.gain.value = wet; g.connect(wg); wg.connect(this.verb); }
    return g;
  },
  noise(t, dur, dest, type, f, q, g0, decay) {
    const ctx = this.ctx, s = ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(g0, t); g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    s.connect(fl); fl.connect(g); g.connect(dest); s.start(t, Math.random()); s.stop(t + dur);
    return fl;
  },
  tone(t, dest, type, f0, f1, g0, decay) {
    const ctx = this.ctx, o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + decay);
    const g = ctx.createGain(); g.gain.setValueAtTime(g0, t); g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + decay + 0.02);
  },
  // A gunshot. snd: {crack, body, low, tail} from the weapon; pos null = our own gun
  shot(snd, pos, suppressed) {
    if (!this.ctx) return;
    const sp = this.spatial(pos), far = clamp((sp.dist - 15) / 120, 0, 1);
    const t = this.ctx.currentTime + (pos ? Math.min(0.35, sp.dist / 343) : 0);   // sound travels
    const loud = suppressed ? 0.28 : 1;
    const out = this.out(sp.gain * loud * (pos ? 1.25 : 1), sp.pan, suppressed ? 0.15 : 0.55);
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = lerp(suppressed ? 3500 : 14000, 1800, far); lp.connect(out);
    // crack (supersonic snap), body (muzzle blast) and a low thump
    if (!suppressed) this.noise(t, 0.06, lp, 'highpass', snd.crack, 0.7, 1.1, 0.045);
    this.noise(t, 0.4, lp, 'bandpass', snd.body * (suppressed ? 0.6 : 1), 0.8, suppressed ? 0.9 : 1.4, snd.tail * (suppressed ? 0.5 : 1));
    this.tone(t, lp, 'sine', snd.low * 2.2, snd.low * 0.6, suppressed ? 0.5 : 1.2, 0.12);
    if (suppressed) this.noise(t, 0.08, lp, 'bandpass', 2400, 2, 0.5, 0.05);   // the action cycling is what you mostly hear
    else this.noise(t + 0.02, 0.9, lp, 'lowpass', 900, 0.5, 0.35 * (0.5 + far), 0.6 + far * 0.6);   // rolling echo
  },
  click(pos, f = 2600, g = 0.35, q = 4) {   // a mechanical tick: mag catch, bolt, empty trigger
    if (!this.ctx) return;
    const sp = this.spatial(pos), out = this.out(sp.gain, sp.pan);
    const t = this.ctx.currentTime; this.noise(t, 0.05, out, 'bandpass', f, q, g, 0.035);
  },
  mech(kind, pos) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, sp = this.spatial(pos), out = this.out(sp.gain * 0.9, sp.pan);
    const n = (dt, f, q, g, d) => this.noise(t + dt, d + 0.05, out, 'bandpass', f, q, g, d);
    if (kind === 'magOut') { n(0, 1800, 3, 0.4, 0.04); n(0.05, 900, 2, 0.25, 0.08); }
    else if (kind === 'magIn') { n(0, 1400, 3, 0.5, 0.05); n(0.03, 3200, 5, 0.35, 0.03); }
    else if (kind === 'bolt') { n(0, 2200, 4, 0.45, 0.04); n(0.12, 1600, 3, 0.5, 0.05); }
    else if (kind === 'pumpBack') { n(0, 1200, 2, 0.6, 0.07); }
    else if (kind === 'pumpFwd') { n(0, 1500, 2, 0.6, 0.06); n(0.03, 3000, 4, 0.3, 0.03); }
    else if (kind === 'shell') { n(0, 1700, 3, 0.4, 0.05); n(0.06, 900, 2, 0.3, 0.06); }
    else if (kind === 'boltUp') { n(0, 2600, 5, 0.35, 0.03); }
    else if (kind === 'boltBack') { n(0, 1300, 2, 0.5, 0.08); }
    else if (kind === 'boltFwd') { n(0, 1500, 2, 0.5, 0.06); n(0.07, 2800, 5, 0.35, 0.03); }
    else if (kind === 'equip') { n(0, 900, 1.5, 0.3, 0.1); n(0.08, 2400, 4, 0.25, 0.03); }
    else if (kind === 'empty') { n(0, 3400, 6, 0.4, 0.02); }
    else if (kind === 'select') { n(0, 3000, 6, 0.3, 0.02); }
  },
  step(pos, surface, loud = 1) {
    if (!this.ctx) return;
    const sp = this.spatial(pos); if (sp.gain < 0.03) return;
    const out = this.out(sp.gain * 0.55 * loud, sp.pan), t = this.ctx.currentTime;
    const f = surface === 'metal' ? 1400 : surface === 'wood' ? 700 : surface === 'concrete' ? 1100 : 500;
    this.noise(t, 0.12, out, 'bandpass', f * rand(0.85, 1.15), 1.2, 0.5, 0.07);
    this.tone(t, out, 'sine', 120, 60, 0.25, 0.06);
    if (surface === 'grass') this.noise(t + 0.02, 0.12, out, 'highpass', 3500, 0.5, 0.12, 0.08);
  },
  land(pos) { if (!this.ctx) return; const sp = this.spatial(pos), out = this.out(sp.gain * 0.7, sp.pan), t = this.ctx.currentTime; this.noise(t, 0.2, out, 'lowpass', 600, 1, 0.7, 0.12); this.tone(t, out, 'sine', 90, 45, 0.4, 0.1); },
  hit(head, kill) {   // feedback when our bullet lands
    if (!this.ctx) return;
    const out = this.out(0.5, 0), t = this.ctx.currentTime;
    if (head) { this.tone(t, out, 'triangle', 2400, 2200, 0.45, 0.12); this.tone(t, out, 'sine', 3600, 3400, 0.2, 0.18); }
    else this.noise(t, 0.05, out, 'bandpass', 2600, 3, 0.6, 0.03);
    if (kill) { this.tone(t + 0.05, out, 'sine', 880, 870, 0.3, 0.25); this.tone(t + 0.05, out, 'sine', 1320, 1310, 0.15, 0.3); }
  },
  hurt() { if (!this.ctx) return; const out = this.out(0.8, 0), t = this.ctx.currentTime; this.tone(t, out, 'sine', 140, 50, 0.9, 0.18); this.noise(t, 0.15, out, 'lowpass', 500, 1, 0.6, 0.1); },
  impact(pos, mat) {
    if (!this.ctx) return;
    const sp = this.spatial(pos); if (sp.gain < 0.05) return;
    const out = this.out(sp.gain * 0.45, sp.pan), t = this.ctx.currentTime;
    if (mat === 'metal') { this.tone(t, out, 'triangle', rand(1800, 2600), 1400, 0.25, 0.15); this.noise(t, 0.05, out, 'highpass', 4000, 1, 0.3, 0.03); }
    else if (mat === 'wood') this.noise(t, 0.08, out, 'bandpass', 900, 2, 0.5, 0.05);
    else this.noise(t, 0.08, out, 'bandpass', 1600, 1, 0.45, 0.05);
  },
  whiz(pos) {   // a bullet passing close by
    if (!this.ctx) return;
    const sp = this.spatial(pos), out = this.out(0.5, sp.pan), t = this.ctx.currentTime;
    const fl = this.noise(t, 0.2, out, 'bandpass', 3000, 6, 0.6, 0.12);
    fl.frequency.setValueAtTime(5000, t); fl.frequency.exponentialRampToValueAtTime(1500, t + 0.12);
  },
};
