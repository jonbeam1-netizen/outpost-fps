'use strict';
// ---------- Bots: simulated on the host, seen by everyone as ordinary players ----------
// The host moves them, picks targets, shoots, and feeds their state/shots/deaths through the same
// messages real players use, so clients need no bot code at all.
const BOTS = new Map();
let botSeq = 0;
const BOT_NAMES = ['Ivan', 'Sasha', 'Dima', 'Kolya', 'Misha', 'Yuri', 'Oleg', 'Pasha', 'Vova', 'Grisha', 'Tolik', 'Zhenya', 'Lyokha', 'Stas'];
const BOT_DIFF = {
  // react: seconds before the first shot · err: starting aim error (deg) · settle: how fast that error shrinks · spread: extra cone (deg)
  easy: { react: 1.0, err: 6, settle: 0.6, spread: 2.2, turn: 3.5, burst: [2, 4] },
  normal: { react: 0.6, err: 3.5, settle: 1.1, spread: 1.0, turn: 6, burst: [3, 5] },
  hard: { react: 0.3, err: 1.5, settle: 1.6, spread: 0.4, turn: 10, burst: [4, 8] },
};
const BOTCFG = { diff: 'normal', max: 10 };
const botsAllowed = () => NET.host;   // the host (or offline practice) runs the bots

function addBots(n = 1) {
  if (!botsAllowed()) { netOut({ t: 'cmd', c: 'addbot', n }); return; }
  let added = 0;
  for (let i = 0; i < n && BOTS.size < BOTCFG.max; i++) {
    const id = 'bot-' + (++botSeq) + '-' + Math.random().toString(36).slice(2, 6);
    const used = new Set([...BOTS.values()].map(b => b.name));
    const free = BOT_NAMES.filter(nm => !used.has('Bot ' + nm));
    const name = 'Bot ' + (free.length ? free[Math.floor(Math.random() * free.length)] : botSeq);
    const outfits = Object.keys(OUTFITS), wid = PRIMARIES[Math.floor(Math.random() * PRIMARIES.length)];
    const p = { name, outfit: outfits[Math.floor(Math.random() * outfits.length)], skin: Math.floor(Math.random() * SKINS.length), k: 0, d: 0, bot: true };
    NET.players[id] = p;
    netBroadcast({ t: 'join', id, p }); clientReceive({ t: 'join', id, p });
    const def = WEAPONS[wid];
    const b = { id, name, wid, def, mods: Object.assign({}, def.def), pos: new V3(), vel: new V3(), yaw: 0, pitch: 0, hp: 100, alive: false, onGround: true, crouch: false,
      ammo: def.mag, fireCD: 0, cycleT: 0, reloadT: 0, burstLeft: 0, pauseT: 0, target: null, seenT: 0, lastSeen: null, lostT: 0, thinkT: 0,
      goal: null, stuckT: 0, lastPos: new V3(), strafe: 1, strafeT: 0, deadAt: 0, spawnAt: 0, sendT: 0, seq: 0, aimErr: new THREE.Vector2(), crouchT: 0 };
    BOTS.set(id, b); botRespawn(b); added++;
  }
  if (added) hudFeedText(added === 1 ? 'Added a bot' : 'Added ' + added + ' bots');
  else hudFeedText('Bot limit reached (' + BOTCFG.max + ')');
}
function removeBots(n = 1) {
  if (!botsAllowed()) { netOut({ t: 'cmd', c: 'removebot', n }); return; }
  const ids = [...BOTS.keys()].reverse().slice(0, n === 'all' ? BOTS.size : n);
  ids.forEach(id => { BOTS.delete(id); delete NET.players[id]; netBroadcast({ t: 'bye', id }); clientReceive({ t: 'bye', id }); });
  hudFeedText(ids.length ? 'Removed ' + ids.length + (ids.length === 1 ? ' bot' : ' bots') : 'No bots to remove');
}
function setBotDiff(d) {
  if (!BOT_DIFF[d]) { hudFeedText('Difficulty is easy, normal or hard'); return; }
  if (!botsAllowed()) { netOut({ t: 'cmd', c: 'botdiff', d }); return; }
  BOTCFG.diff = d; hudFeedText('Bot difficulty: ' + d);
}
function botsReset() { BOTS.clear(); }

// ---------- Who's in the match (for targeting, hit tests, spawning) ----------
function matchBodies(excludeId) {
  const out = [];
  if (GAME.running && PL.alive && NET.myId !== excludeId) out.push({ id: NET.myId, pos: PL.pos, crouch: PL.crouch, lean: PL.leanEff || 0, yaw: PL.yaw });
  REMOTES.forEach((r, id) => { if (id !== excludeId && !BOTS.has(id) && r.alive && r.state) out.push({ id, pos: r.state.pos, crouch: r.state.crouch, lean: r.state.lean, yaw: r.state.yaw }); });
  BOTS.forEach(b => { if (b.id !== excludeId && b.alive) out.push({ id: b.id, pos: b.pos, crouch: b.crouch, lean: 0, yaw: b.yaw, bot: b }); });
  return out;
}
function botRespawn(b) {
  const others = matchBodies(b.id).map(o => o.pos);
  const scored = MAP.spawns.map(s => { let md = 999; others.forEach(o => { md = Math.min(md, Math.hypot(o.x - s.x, o.z - s.z)); }); return { s, md: md + Math.random() * 10 }; }).sort((a, c) => c.md - a.md);
  const s = scored[Math.floor(Math.random() * Math.min(4, scored.length))].s;
  b.pos.set(s.x, botSupport(s.x, s.z, 0.5), s.z); b.vel.set(0, 0, 0); b.yaw = Math.atan2(s.x, s.z); b.pitch = 0;
  b.hp = 100; b.alive = true; b.ammo = b.def.mag; b.reloadT = 0; b.cycleT = 0; b.target = null; b.lastSeen = null; b.goal = null; b.crouch = false;
  b.spawnAt = performance.now();
  hostReceive(b.id, { t: 'respawn' });
}

// ---------- Movement with the same box collision as the player ----------
const BR = 0.3;
function botHeight(b) { return b.crouch ? 1.25 : 1.8; }
function botMoveAxis(b, axis, amt) {
  if (amt === 0) return false;
  const p = b.pos; p[axis] += amt; let hit = false;
  const feet = p.y, head = p.y + botHeight(b);
  for (let i = 0; i < COLL.length; i++) {
    const c = COLL[i]; if (!c.solid) continue;
    if (c.y1 <= feet + (b.onGround ? STEP : 0.05) || c.y0 >= head) continue;
    if (p.x + BR > c.x0 && p.x - BR < c.x1 && p.z + BR > c.z0 && p.z - BR < c.z1) {
      if (axis === 'x') p.x = amt > 0 ? c.x0 - BR - 1e-4 : c.x1 + BR + 1e-4; else p.z = amt > 0 ? c.z0 - BR - 1e-4 : c.z1 + BR + 1e-4;
      b.vel[axis] = 0; hit = true;
    }
  }
  return hit;
}
function botSupport(x, z, maxTop) {
  let best = 0;
  for (let i = 0; i < COLL.length; i++) { const c = COLL[i]; if (!c.solid || c.y1 > maxTop || c.y1 <= best) continue; if (x + BR - 0.04 > c.x0 && x - BR + 0.04 < c.x1 && z + BR - 0.04 > c.z0 && z - BR + 0.04 < c.z1) best = c.y1; }
  return best;
}
function botPhysics(b, wx, wz, speed, dt) {
  const v = b.vel, k = b.onGround ? 1 - Math.exp(-dt * 10) : 1 - Math.exp(-dt * 1.5);
  v.x = lerp(v.x, wx * speed, k); v.z = lerp(v.z, wz * speed, k);
  const steps = Math.ceil(Math.max(Math.abs(v.x), Math.abs(v.z)) * dt / 0.2) || 1;
  let blocked = false;
  for (let s = 0; s < steps; s++) { blocked = botMoveAxis(b, 'x', v.x * dt / steps) || blocked; blocked = botMoveAxis(b, 'z', v.z * dt / steps) || blocked; }
  const oldY = b.pos.y; v.y -= GRAV * dt; let ny = oldY + v.y * dt;
  if (v.y > 0) { const h = botHeight(b); for (const c of COLL) if (c.solid && c.y0 >= oldY + h - 0.05 && c.y0 < ny + h && b.pos.x + BR > c.x0 && b.pos.x - BR < c.x1 && b.pos.z + BR > c.z0 && b.pos.z - BR < c.z1) { ny = c.y0 - h; v.y = 0; } }
  const sup = botSupport(b.pos.x, b.pos.z, oldY + (b.onGround ? STEP : 0.06));
  if (ny <= sup) { ny = sup; v.y = 0; b.onGround = true; }
  else if (b.onGround && v.y <= 0 && oldY - sup <= STEP + 0.02) { ny = sup; v.y = 0; }
  else b.onGround = false;
  b.pos.y = ny;
  b.pos.x = clamp(b.pos.x, -MAP.half + 0.4, MAP.half - 0.4); b.pos.z = clamp(b.pos.z, -MAP.half + 0.4, MAP.half - 0.4);
  return blocked;
}
function botNewGoal(b) {
  for (let i = 0; i < 20; i++) {
    const x = rand(-MAP.half + 4, MAP.half - 4), z = rand(-MAP.half + 4, MAP.half - 4);
    if (Math.hypot(x - b.pos.x, z - b.pos.z) > 15 && spotFree(x, z)) { b.goal = new V3(x, 0, z); return; }
  }
  const s = MAP.spawns[Math.floor(Math.random() * MAP.spawns.length)]; b.goal = new V3(s.x, 0, s.z);
}

// ---------- Senses ----------
const _bo = new V3(), _bd = new V3();
function botEye(b, out) { return out.set(b.pos.x, b.pos.y + (b.crouch ? 1.1 : 1.58), b.pos.z); }
function canSee(from, to) {
  _bd.subVectors(to, from); const dist = _bd.length(); _bd.normalize();
  const h = rayWorld(from, _bd, dist, true);
  return !h || h.t > dist - 0.3;
}
function bodyAim(o, head) { return new V3(o.pos.x, o.pos.y + (head ? (o.crouch ? 1.18 : 1.62) : (o.crouch ? 0.95 : 1.25)), o.pos.z); }
function botThink(b) {
  const eye = botEye(b, new V3()), fx = -Math.sin(b.yaw), fz = -Math.cos(b.yaw);
  let best = null, bestD = 1e9;
  for (const o of matchBodies(b.id)) {
    const dx = o.pos.x - b.pos.x, dz = o.pos.z - b.pos.z, d = Math.hypot(dx, dz);
    if (d > 90) continue;
    const facing = (dx * fx + dz * fz) / Math.max(d, 0.01);
    const aware = d < 14 || facing > 0.3 || (b.target && b.target.id === o.id) || b.hurtBy === o.id;
    if (!aware) continue;
    if (!canSee(eye, bodyAim(o, false)) && !canSee(eye, bodyAim(o, true))) continue;
    if (d < bestD) { bestD = d; best = o; }
  }
  if (best) {
    if (!b.target || b.target.id !== best.id) { b.seenT = 0; b.reactT = BOT_DIFF[BOTCFG.diff].react * rand(0.8, 1.3); b.aimErr.set(rand(-1, 1), rand(-1, 1)).multiplyScalar(BOT_DIFF[BOTCFG.diff].err * 2.2); }
    b.target = best; b.lastSeen = best.pos.clone(); b.lostT = 0;
  } else if (b.target) { b.target = null; }
  b.hurtBy = null;
}

// ---------- Shooting ----------
function botTrace(b, o, d, maxT) {
  const wh = rayWorld(o, d, maxT, true);
  let best = wh ? wh.t : maxT, res = wh;
  for (const t of matchBodies(b.id)) {
    for (const hb of operatorHitboxes(t.pos, t.crouch, t.lean, t.yaw)) {
      const tt = hb.type === 's' ? raySphere(o, d, hb.x, hb.y, hb.z, hb.r) : rayCapsule(o, d, hb.x, hb.y0, hb.y1, hb.z, hb.r);
      if (tt >= 0 && tt < best) { best = tt; res = { t: tt, player: t.id, zone: hb.zone }; }
    }
  }
  return res;
}
function botFire(b) {
  const d = b.def, diff = BOT_DIFF[BOTCFG.diff];
  b.ammo--; b.fireCD = Math.max(b.fireCD, -1 / 60) + 60 / d.rpm;
  if (d.kind === 'pump' || d.kind === 'bolt') b.cycleT = d.cycle;
  const eye = botEye(b, new V3());
  const dir = new V3(-Math.sin(b.yaw) * Math.cos(b.pitch), Math.sin(b.pitch), -Math.cos(b.yaw) * Math.cos(b.pitch));
  const right = new V3(Math.cos(b.yaw), 0, -Math.sin(b.yaw)), up = new V3().crossVectors(right, dir).normalize();
  const moving = Math.hypot(b.vel.x, b.vel.z) > 1;
  const spread = (d.pellets ? d.spreadHip : d.spreadAds * 4 + diff.spread) * (moving ? 1.5 : 1);
  let firstEnd = null;
  for (let i = 0; i < (d.pellets || 1); i++) {
    const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * spread * Math.PI / 180;
    const dd = dir.clone().addScaledVector(right, Math.cos(a) * Math.tan(r)).addScaledVector(up, Math.sin(a) * Math.tan(r)).normalize();
    const h = botTrace(b, eye, dd, 600), end = eye.clone().addScaledVector(dd, h ? h.t : 600);
    if (!firstEnd) firstEnd = end;
    if (h && h.player) {
      const dist = h.t, fall = dist <= d.range[0] ? 1 : dist >= d.range[1] ? d.range[2] : lerp(1, d.range[2], (dist - d.range[0]) / (d.range[1] - d.range[0]));
      const mul = h.zone === 'head' ? (d.kind === 'bolt' ? 3 : 2.4) : h.zone === 'legs' ? 0.75 : 1;
      hostDeliverHit(b.id, h.player, Math.round(d.dmg * fall * mul), h.zone, b.wid);
    }
  }
  hostReceive(b.id, { t: 'shot', o: [+eye.x.toFixed(2), +eye.y.toFixed(2), +eye.z.toFixed(2)], e: [+firstEnd.x.toFixed(2), +firstEnd.y.toFixed(2), +firstEnd.z.toFixed(2)], w: b.wid, s: 0 });
  // each shot nudges the aim off a little (recoil), which the bot then corrects
  b.aimErr.x += rand(-0.3, 0.3) * d.recoil.h; b.aimErr.y += d.recoil.v * 0.5;
}
// A hit landed on a bot (from anyone)
function botDamage(b, dmg, from, zone, w) {
  if (!b.alive || performance.now() - b.spawnAt < 1500) return;
  b.hp -= dmg; b.hurtBy = from;
  const att = matchBodies(b.id).find(o => o.id === from);
  if (att && !b.target) { b.lastSeen = att.pos.clone(); b.yaw = angLerp(b.yaw, Math.atan2(-(att.pos.x - b.pos.x), -(att.pos.z - b.pos.z)), 0.5); }
  if (b.hp <= 0) { b.alive = false; b.deadAt = performance.now(); b.target = null; hostReceive(b.id, { t: 'died', k: from, w, hs: zone === 'head' }); }
}

// ---------- The brain, every frame ----------
function botsTick(dt) {
  if (!botsAllowed() || !BOTS.size) return;
  const now = performance.now(), diff = BOT_DIFF[BOTCFG.diff];
  BOTS.forEach(b => {
    if (!b.alive) { if (now - b.deadAt > 4000) botRespawn(b); botSend(b, dt); return; }
    b.thinkT -= dt; if (b.thinkT <= 0) { b.thinkT = 0.2 + Math.random() * 0.1; botThink(b); }
    b.fireCD -= dt; b.cycleT = Math.max(0, b.cycleT - dt); b.pauseT -= dt; b.strafeT -= dt;
    // reload when empty (or topping up with nobody around)
    if (b.reloadT > 0) { b.reloadT -= dt; if (b.reloadT <= 0) b.ammo = b.def.mag; }
    else if (b.ammo <= 0 || (!b.target && b.ammo < b.def.mag * 0.4)) b.reloadT = b.def.perRound ? b.def.reload * (b.def.mag - b.ammo) : b.def.reload;
    let wx = 0, wz = 0, speed = 4.1; b.sprint = false;
    const t = b.target;
    if (t) {
      // fight: face them, strafe, keep a sensible distance for the weapon
      b.seenT += dt;
      if (b.aimHead === undefined || Math.random() < dt) b.aimHead = BOTCFG.diff === 'hard' && Math.random() < 0.3;   // hard bots sometimes go for the head
      const aim = bodyAim(t, b.aimHead), eye = botEye(b, new V3());
      const dx = aim.x - eye.x, dy = aim.y - eye.y, dz = aim.z - eye.z, dist = Math.hypot(dx, dz);
      const wantYaw = Math.atan2(-dx, -dz) + b.aimErr.x * Math.PI / 180, wantPitch = Math.atan2(dy, dist) + b.aimErr.y * Math.PI / 180;
      b.yaw = angLerp(b.yaw, wantYaw, 1 - Math.exp(-dt * diff.turn)); b.pitch = lerp(b.pitch, wantPitch, 1 - Math.exp(-dt * diff.turn));
      b.aimErr.multiplyScalar(Math.exp(-dt * diff.settle));   // aim settles the longer they track you
      if (b.strafeT <= 0) { b.strafe = Math.random() < 0.5 ? -1 : 1; b.strafeT = rand(0.6, 1.8); b.crouch = Math.random() < 0.25 && dist > 15; }
      const ux = dx / Math.max(dist, 0.01), uz = dz / Math.max(dist, 0.01);
      const ideal = b.def.pellets ? 6 : b.def.kind === 'bolt' ? 40 : b.wid === 'mp5' ? 12 : 22;
      const fwd = dist > ideal * 1.4 ? 1 : dist < ideal * 0.5 ? -1 : 0;
      wx = -uz * b.strafe + ux * fwd; wz = ux * b.strafe + uz * fwd; speed = b.crouch ? 2 : 2.8;
      // pull the trigger once reacted and roughly on target
      const yawErr = Math.abs(((wantYaw - b.yaw) % TAU + TAU * 1.5) % TAU - Math.PI);
      if (b.seenT > b.reactT && yawErr < 0.12 && b.reloadT <= 0 && b.ammo > 0 && b.fireCD <= 0 && b.cycleT <= 0 && b.pauseT <= 0) {
        botFire(b);
        if (b.def.kind === 'auto') { if (--b.burstLeft <= 0) { b.burstLeft = Math.round(rand(diff.burst[0], diff.burst[1])); b.pauseT = rand(0.25, 0.6); } }
        else b.fireCD += rand(0.05, 0.25);
      }
    } else {
      b.crouch = false; b.seenT = 0;
      // go where we last saw someone, otherwise roam
      const dest = b.lastSeen || b.goal;
      if (!dest) botNewGoal(b);
      else {
        const dx = dest.x - b.pos.x, dz = dest.z - b.pos.z, d = Math.hypot(dx, dz);
        if (d < 1.5) { if (dest === b.lastSeen) b.lastSeen = null; else botNewGoal(b); }
        else { wx = dx / d; wz = dz / d; b.sprint = d > 25 && !b.lastSeen; speed = b.sprint ? 6 : 4.1; b.yaw = angLerp(b.yaw, Math.atan2(-wx, -wz), 1 - Math.exp(-dt * 5)); b.pitch = lerp(b.pitch, 0, 1 - Math.exp(-dt * 4)); }
      }
    }
    const wl = Math.hypot(wx, wz); if (wl > 0) { wx /= wl; wz /= wl; }
    speed *= b.def.move;
    const blocked = botPhysics(b, wx, wz, speed, dt);
    // stuck on something: hop, then pick somewhere else to go
    if (wl > 0 && b.pos.distanceTo(b.lastPos) < speed * dt * 0.3) b.stuckT += dt; else b.stuckT = Math.max(0, b.stuckT - dt);
    b.lastPos.copy(b.pos);
    if (b.stuckT > 0.6 && b.onGround && blocked) { b.vel.y = 5; b.onGround = false; }
    if (b.stuckT > 1.6) { b.stuckT = 0; b.lastSeen = null; botNewGoal(b); b.strafe *= -1; }
    botSend(b, dt);
  });
}
function botSend(b, dt) {
  b.sendT -= dt; if (b.sendT > 0) return; b.sendT = 1 / 20;
  hostReceive(b.id, { t: 's', s: ++b.seq, p: [+b.pos.x.toFixed(2), +b.pos.y.toFixed(2), +b.pos.z.toFixed(2)], y: +b.yaw.toFixed(3), x: +b.pitch.toFixed(3), c: b.crouch ? 1 : 0, l: 0, a: b.target ? 1 : 0, sp: b.sprint ? 1 : 0, r: b.reloadT > 0 ? 1 : 0, al: b.alive ? 1 : 0, g: b.wid + '|' + b.mods.optic + '|' + b.mods.muzzle });
}
