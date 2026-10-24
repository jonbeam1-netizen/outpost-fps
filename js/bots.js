'use strict';
// ---------- Bots: snipers simulated on the host, seen by everyone as ordinary players ----------
// The host moves them, picks targets, shoots, and feeds their state/shots/deaths through the same
// messages real players use, so clients need no bot code at all.
const BOTS = new Map();
let botSeq = 0;
const BOT_NAMES = ['Ivan', 'Sasha', 'Dima', 'Kolya', 'Misha', 'Yuri', 'Oleg', 'Pasha', 'Vova', 'Grisha', 'Tolik', 'Zhenya', 'Lyokha', 'Stas', 'Fedya', 'Borya'];
const BOT_DIFF = {
  // react: seconds before the first shot · err: aim error when they first see you (deg) · floor: best they settle to (deg)
  // settle: how fast the error shrinks · spot: how quickly they notice you · head: chance to go for the head
  // lag: how slowly they read your movement (s) · hear: how far an unsuppressed shot alerts them (m)
  easy: { react: 2.2, err: 1.2, floor: 0.25, settle: 0.5, spot: 0.6, head: 0.05, turn: 3, lag: 0.5, hear: 150 },
  normal: { react: 1.4, err: 0.8, floor: 0.15, settle: 0.8, spot: 1, head: 0.2, turn: 5, lag: 0.3, hear: 250 },
  hard: { react: 0.8, err: 0.5, floor: 0.09, settle: 1.2, spot: 1.4, head: 0.4, turn: 8, lag: 0.18, hear: 380 },
};
const BOTCFG = { diff: 'normal', max: 10 };
const botsAllowed = () => NET.host;   // the host (or offline practice) runs the bots

function addBots(n = 1) {
  if (!botsAllowed()) { netOut({ t: 'cmd', c: 'addbot', n }); return; }
  if (!NAV.ready) navBuild();
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
    const b = { id, name, wid, def, mods: Object.assign({}, def.def), slot: 'rifle', pos: new V3(), vel: new V3(), yaw: 0, pitch: 0, hp: 100, armor: 50, alive: false, onGround: true, stance: 0,
      ammo: def.mag, reserve: def.reserve, fireCD: 0, cycleT: 0, reloadT: 0, target: null, seenT: 0, lastSeen: null, spot: {}, thinkT: 0, state: 'move',
      goal: null, goalKind: '', path: null, pathI: 0, repathT: 0, nest: null, watchT: 0, scanT: 0, stuckT: 0, lastPos: new V3(), deadAt: 0, spawnAt: 0, sendT: 0, seq: 0,
      aimErr: new THREE.Vector2(), aimHead: false, scoped: false, meleeT: 0, alertPos: null, alertT: 0, tPrev: new V3(), tVel: new V3(), calmT: 0 };
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
  if (GAME.running && PL.alive && NET.myId !== excludeId) out.push({ id: NET.myId, pos: PL.pos, vel: PL.vel, stance: PL.stance, lean: PL.leanEff || 0, yaw: PL.yaw, me: true });
  REMOTES.forEach((r, id) => { if (id !== excludeId && !BOTS.has(id) && r.alive && r.state) out.push({ id, pos: r.state.pos, vel: r.op && r.op.lv, stance: r.state.stance || 0, lean: r.state.lean || 0, yaw: r.state.yaw || 0, ads: r.state.ads }); });
  BOTS.forEach(b => { if (b.id !== excludeId && b.alive) out.push({ id: b.id, pos: b.pos, vel: b.vel, stance: b.stance, lean: 0, yaw: b.yaw, bot: b }); });
  return out;
}
function botRespawn(b) {
  const s = safeSpawn(b.id);
  b.pos.set(s.x, 0, s.z); b.pos.y = supportY(s.x, s.z, (s.y || groundY(s.x, s.z)) + 0.5); b.vel.set(0, 0, 0); b.yaw = s.yaw || 0; b.pitch = 0;
  b.hp = 100; b.armor = 50; b.alive = true; b.ammo = b.def.mag; b.reserve = b.def.reserve; b.reloadT = 0; b.cycleT = 0; b.target = null; b.lastSeen = null; b.spot = {};
  b.stance = 0; b.slot = 'rifle'; b.scoped = false; b.alertPos = null; b.path = null; b.state = 'move'; b.nest = null; botPickNest(b);
  b.spawnAt = performance.now();
  hostReceive(b.id, { t: 'respawn' });
}

const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 1.15;   // roughly normal, unit spread
// a spawn far from everyone and out of their sight lines (nobody wants to be shot 4 s after spawning)
function safeSpawn(selfId) {
  const others = matchBodies(selfId);
  const scored = MAP.spawns.map(s => { let md = 999; others.forEach(o => { md = Math.min(md, Math.hypot(o.pos.x - s.x, o.pos.z - s.z)); }); return { s, sc: md + Math.random() * 15 }; }).sort((a, c) => c.sc - a.sc);
  const top = scored.slice(0, 10), eye = new V3(), at = new V3();
  for (const c of top) {
    const s = c.s, sy = (s.y !== undefined ? s.y : groundY(s.x, s.z)) + 1.5;
    const seen = others.some(o => { const d = Math.hypot(o.pos.x - s.x, o.pos.z - s.z); return d < 250 && canSee(eye.set(o.pos.x, o.pos.y + 1.5, o.pos.z), at.set(s.x, sy, s.z), true); });
    if (seen) c.sc -= 400;
  }
  top.sort((a, c) => c.sc - a.sc);
  return top[Math.floor(Math.random() * Math.min(3, top.length))].s;
}
// ---------- Navigation: a 0.5 m walkability grid over the ground, A* with corner smoothing ----------
const NAV = { ready: false, cs: 0.5, n: 0, x0: 0, blk: null, near: null, g: null, from: null, seen: null, heap: null, hf: null, stamp: 1 };
function navBuild() {
  const cs = NAV.cs, n = Math.ceil(MAP.half * 2 / cs), x0 = -MAP.half, N = n * n;
  const blk = new Uint8Array(N), hgt = new Float32Array(N);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) hgt[j * n + i] = groundY(x0 + (i + 0.5) * cs, x0 + (j + 0.5) * cs);
  // anything solid between knee and head height over the ground blocks the cell (body radius included)
  const r = 0.36;
  for (const c of COLL) {
    if (!c.solid) continue;
    const i0 = Math.max(0, Math.floor((c.x0 - r - x0) / cs)), i1 = Math.min(n - 1, Math.floor((c.x1 + r - x0) / cs));
    const j0 = Math.max(0, Math.floor((c.z0 - r - x0) / cs)), j1 = Math.min(n - 1, Math.floor((c.z1 + r - x0) / cs));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const k = j * n + i, gy = hgt[k]; if (c.y1 > gy + 0.45 && c.y0 < gy + 1.75) blk[k] = 1; }
  }
  // too steep, or the edge of the world
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i;
    if (i < 2 || j < 2 || i > n - 3 || j > n - 3) { blk[k] = 1; continue; }
    const h = hgt[k]; if (Math.abs(hgt[k + 1] - h) > 0.3 || Math.abs(hgt[k + n] - h) > 0.3) blk[k] = 1;
  }
  // cells hugging a wall cost a little more, so paths keep off corners
  const near = new Uint8Array(N);
  for (let j = 1; j < n - 1; j++) for (let i = 1; i < n - 1; i++) { const k = j * n + i; if (!blk[k] && (blk[k - 1] || blk[k + 1] || blk[k - n] || blk[k + n])) near[k] = 1; }
  Object.assign(NAV, { ready: true, n, x0, blk, near, g: new Float32Array(N), from: new Int32Array(N), seen: new Uint32Array(N), heap: new Int32Array(N), hf: new Float32Array(N) });
}
const navCell = (x, z) => { const n = NAV.n, i = clamp(Math.floor((x - NAV.x0) / NAV.cs), 0, n - 1), j = clamp(Math.floor((z - NAV.x0) / NAV.cs), 0, n - 1); return j * n + i; };
const navX = k => NAV.x0 + (k % NAV.n + 0.5) * NAV.cs, navZ = k => NAV.x0 + (Math.floor(k / NAV.n) + 0.5) * NAV.cs;
function navFree(k, maxR = 12) {
  if (!NAV.blk[k]) return k;
  const n = NAV.n, ci = k % n, cj = Math.floor(k / n);
  for (let r = 1; r <= maxR; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
    if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
    const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= n || j >= n) continue;
    const kk = j * n + i; if (!NAV.blk[kk]) return kk;
  }
  return -1;
}
function navPath(sx, sz, gx, gz) {
  if (!NAV.ready) return null;
  const s = navFree(navCell(sx, sz)), g = navFree(navCell(gx, gz)); if (s < 0 || g < 0) return null;
  const n = NAV.n, blk = NAV.blk, G = NAV.g, from = NAV.from, seen = NAV.seen, heap = NAV.heap, hf = NAV.hf;
  const st = ++NAV.stamp * 2;   // seen[k] === st: open, st+1: closed
  const gi = g % n, gj = Math.floor(g / n);
  const hEst = k => { const dx = Math.abs(k % n - gi), dz = Math.abs(Math.floor(k / n) - gj); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
  let hn = 0;
  const push = (k, f) => { let i = hn++; heap[i] = k; hf[i] = f; while (i > 0) { const p = (i - 1) >> 1; if (hf[p] <= hf[i]) break; const tk = heap[p], tf = hf[p]; heap[p] = heap[i]; hf[p] = hf[i]; heap[i] = tk; hf[i] = tf; i = p; } };
  const pop = () => { const top = heap[0]; hn--; if (hn > 0) { heap[0] = heap[hn]; hf[0] = hf[hn]; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < hn && hf[l] < hf[m]) m = l; if (r < hn && hf[r] < hf[m]) m = r; if (m === i) break; const tk = heap[m], tf = hf[m]; heap[m] = heap[i]; hf[m] = hf[i]; heap[i] = tk; hf[i] = tf; i = m; } } return top; };
  G[s] = 0; from[s] = -1; seen[s] = st; push(s, hEst(s));
  let found = false, iter = 0;
  const DI = [1, -1, 0, 0, 1, 1, -1, -1], DJ = [0, 0, 1, -1, 1, -1, 1, -1];
  while (hn > 0 && iter++ < 250000) {
    const k = pop(); if (seen[k] === st + 1) continue; seen[k] = st + 1;
    if (k === g) { found = true; break; }
    const ci = k % n, cj = (k - ci) / n;
    for (let d = 0; d < 8; d++) {
      const i = ci + DI[d], j = cj + DJ[d]; if (i < 0 || j < 0 || i >= n || j >= n) continue;
      const kk = j * n + i; if (blk[kk] || seen[kk] === st + 1) continue;
      if (d >= 4 && (blk[cj * n + i] || blk[j * n + ci])) continue;   // no cutting corners
      const ng = G[k] + (d >= 4 ? 1.414 : 1) + (NAV.near[kk] ? 0.8 : 0);
      if (seen[kk] !== st || ng < G[kk]) { G[kk] = ng; from[kk] = k; seen[kk] = st; push(kk, ng + hEst(kk)); }
    }
  }
  if (!found) return null;
  const cells = []; for (let k = g; k !== -1; k = from[k]) cells.push(k); cells.reverse();
  // string-pull: skip every waypoint we can walk straight past
  const pts = []; let i = 0;
  while (i < cells.length - 1) {
    let j = Math.min(cells.length - 1, i + 60);
    while (j > i + 1 && !navLine(cells[i], cells[j])) j--;
    pts.push(new V3(navX(cells[j]), 0, navZ(cells[j]))); i = j;
  }
  return pts;
}
function navLine(a, b) {
  const ax = navX(a), az = navZ(a), bx = navX(b), bz = navZ(b), L = Math.hypot(bx - ax, bz - az), steps = Math.ceil(L / 0.25);
  for (let s = 1; s < steps; s++) { const t = s / steps, k = navCell(lerp(ax, bx, t), lerp(az, bz, t)); if (NAV.blk[k] || NAV.near[k]) return false; }
  return true;
}
function botGo(b, x, z, kind) {
  b.goal = new V3(x, 0, z); b.goalKind = kind; b.path = navPath(b.pos.x, b.pos.z, x, z); b.pathI = 0; b.repathT = 6; b.state = 'move';
  if (!b.path) b.path = [b.goal.clone()];
}
// pick a sniper nest: far from where we are and from other bots, preferring ones nobody holds
function botPickNest(b) {
  const nests = MAP.nests && MAP.nests.length ? MAP.nests : MAP.spawns;
  let best = null, bs = -1e9;
  for (let i = 0; i < 12; i++) {
    const n = nests[Math.floor(Math.random() * nests.length)];
    const d = Math.hypot(n.x - b.pos.x, n.z - b.pos.z);
    let crowd = 0; BOTS.forEach(o => { if (o !== b && o.nest === n) crowd += 100; if (o !== b) crowd += Math.max(0, 25 - Math.hypot(o.pos.x - n.x, o.pos.z - n.z)); });
    const sc = -Math.abs(d - 70) * 0.5 - crowd + Math.random() * 20;
    if (sc > bs) { bs = sc; best = n; }
  }
  b.nest = best; botGo(b, best.x, best.z, 'nest');
}

// ---------- Senses ----------
const _bo = new V3(), _bd = new V3();
const _be = new V3(), _bf = new V3();
function botEye(b, out) {
  let f = b.stance === 2 ? 0.35 : 0;
  const y = b.pos.y + [1.58, 1.08, 0.4][b.stance];
  if (f) { const h = rayWorld(_be.set(b.pos.x, y, b.pos.z), _bf.set(-Math.sin(b.yaw), 0, -Math.cos(b.yaw)), f + 0.2, false); if (h) f = Math.max(0, h.t - 0.2); }   // head never inside a wall
  return out.set(b.pos.x - Math.sin(b.yaw) * f, y, b.pos.z - Math.cos(b.yaw) * f);
}
function bodyAim(o, head) {
  if (o.stance === 2) { const f = head ? 0.3 : 0.0; return new V3(o.pos.x - Math.sin(o.yaw) * f, o.pos.y + (head ? 0.38 : 0.21), o.pos.z - Math.cos(o.yaw) * f); }   // matches the prone hitboxes
  if (o.stance === 1 && head) return new V3(o.pos.x - Math.sin(o.yaw) * 0.18, o.pos.y + 1.36, o.pos.z - Math.cos(o.yaw) * 0.18);   // hunched forward (character.js CROUCH_HEAD)
  return new V3(o.pos.x, o.pos.y + (head ? 1.62 : (o.stance ? 0.98 : 1.22)), o.pos.z);
}
// clear shot from an eye to a point: no walls or ground, and not hidden behind a bush
function canSee(from, to, foliageOk = false) {
  _bd.subVectors(to, from); const dist = _bd.length(); _bd.normalize();
  const h = rayWorld(from, _bd, dist, true);
  if (h && h.t < dist - 0.3) return false;
  if (!foliageOk && dist > 6 && rayFoliage(from, _bd, dist) > 0.6) return false;   // count the leaves right around the target too
  return true;
}
// how visible someone is: stance, movement, hiding in leaves, shooting
function visibility(o) {
  let v = [1, 0.62, 0.32][o.stance || 0];
  const sp = o.vel ? Math.hypot(o.vel.x, o.vel.z) : (o.bot ? 0 : 1);
  if (sp > 0.5) v *= sp > 5 ? 1.9 : 1.4;
  if (inFoliage(o.pos.x, o.pos.y + 0.4, o.pos.z)) v *= 0.35;
  if (o.ads) v *= 1.3;   // the glint
  return v;
}
function botThink(b, dt) {
  const diff = BOT_DIFF[BOTCFG.diff], eye = botEye(b, new V3()), fx = -Math.sin(b.yaw), fz = -Math.cos(b.yaw);
  let best = null, bestS = 0;
  for (const o of matchBodies(b.id)) {
    const dx = o.pos.x - b.pos.x, dz = o.pos.z - b.pos.z, d = Math.hypot(dx, dz);
    if (d > 320) continue;
    if (b.ammo <= 0 && b.reserve <= 0 && d > 9) continue;   // dry: only the knife is left, so go find ammo instead of staring
    const facing = (dx * fx + dz * fz) / Math.max(d, 0.01);
    // through a scope they see far but narrow; otherwise a wide, shorter view
    const look = b.scoped ? (facing > 0.95 ? 2.6 : facing > 0.7 ? 0.8 : 0.02) : (facing > 0.5 ? 1 : facing > 0 ? 0.45 : 0.02);
    const range = 240 * visibility(o) * look;
    let m = b.spot[o.id] || 0;
    const tracking = b.target && b.target.id === o.id;
    const outed = d < 8 || (b.revealed && b.revealed[o.id] > performance.now());   // a muzzle flash in a bush is still a muzzle flash
    const seen = (d < range || tracking || d < 5 || outed) && (canSee(eye, bodyAim(o, false), outed) || canSee(eye, bodyAim(o, true), outed));
    if (seen) m = Math.min(1.5, m + dt * diff.spot * (tracking ? 4 : clamp(1.6 - d / Math.max(range, 1), 0.2, 3)) * (o.id === b.hurtBy ? 4 : 1));
    else m = Math.max(0, m - dt * 0.4);
    // footsteps: they hear you coming before they see you (sprint 25 m, walk 12, crouch 6, crawl 3)
    if (!seen && !b.target) {
      const sp = o.vel ? Math.hypot(o.vel.x, o.vel.z) : 0;
      const ear = sp < 0.4 ? 0 : sp > 5 ? 25 : [12, 6, 3][o.stance || 0];
      if (d < ear) { b.alertPos = o.pos.clone(); b.alertT = 6; b.alertWait = 0.2; m = Math.min(0.95, m + dt * 0.5); b.spot[o.id] = m; }
    }
    b.spot[o.id] = m;
    if (seen && m >= 1) { const s = m * 100 - d; if (!best || s > bestS) { best = o; bestS = s; } }
  }
  if (best) {
    if (!b.target || b.target.id !== best.id) {
      b.seenT = 0; b.reactT = diff.react * rand(0.7, 1.3) * (1 + Math.hypot(best.pos.x - b.pos.x, best.pos.z - b.pos.z) / 300);
      const e = diff.err * Math.PI / 180; b.aimErr.set(rand(-1, 1) * e, rand(-1, 1) * e); b.aimHead = Math.random() < diff.head; b.tPrev.copy(best.pos); b.tVel.set(0, 0, 0);
      b.wErr = b.wErr || new THREE.Vector2(); b.wGoal = b.wGoal || new THREE.Vector2(); b.wT = 0;
    }
    b.target = best; b.lastSeen = best.pos.clone(); b.calmT = 0;
  } else if (b.target) { b.target = null; b.alertPos = b.lastSeen; b.alertT = 8; }
  // birds bursting off a roof nearby: someone careless is over there
  if (!b.target && typeof WL !== 'undefined' && WL.log && WL.log.length) {
    let newest = b.wlSeen || -99;
    for (const e of WL.log) {   // a ring buffer: look at every entry newer than the last one we reacted to
      if (e.t <= (b.wlSeen || -99) || WL.time - e.t > 1.5) continue;
      newest = Math.max(newest, e.t);
      const d = Math.hypot(e.x - b.pos.x, e.z - b.pos.z);
      if (d < 150 && d > 15) { b.alertPos = new V3(e.x, e.y, e.z); b.alertT = 8; b.alertWait = rand(0.4, 1.2); }
    }
    b.wlSeen = newest;
  }
  b.hurtBy = null;
}
// the host hears a gunshot: bots nearby turn toward it (suppressed rifles are only heard close by)
function botsHearShot(shooterId, o, supp) {
  BOTS.forEach(b => {
    if (!b.alive || b.id === shooterId) return;
    const d = Math.hypot(o.x - b.pos.x, o.z - b.pos.z);
    if (b.target) { if (!supp && d < 150) { b.revealed = b.revealed || {}; b.revealed[shooterId] = performance.now() + 2500; } return; }
    if (d > (supp ? 45 : BOT_DIFF[BOTCFG.diff].hear)) return;
    const err = d * 0.06;
    b.alertPos = new V3(o.x + rand(-err, err), o.y, o.z + rand(-err, err)); b.alertT = 10;
    b.alertWait = d / 343 + rand(0.3, 0.9);   // the sound has to arrive, then they have to place it
    if (!supp && d < 150) { b.revealed = b.revealed || {}; b.revealed[shooterId] = performance.now() + 2500; }
    b.spot[shooterId] = Math.max(b.spot[shooterId] || 0, supp ? 0.3 : 0.6);
  });
}

// ---------- Shooting ----------
function botFire(b) {
  const d = b.def;
  b.ammo--; b.fireCD = 60 / d.rpm + rand(0.1, 0.5);
  if (d.kind === 'bolt') b.cycleT = d.cycle;
  const eye = botEye(b, new V3());
  const dir = new V3(-Math.sin(b.yaw) * Math.cos(b.pitch), Math.sin(b.pitch), -Math.cos(b.yaw) * Math.cos(b.pitch));
  const mz = MUZZLES[b.mods.muzzle], vel = d.vel * (mz && mz.vel ? mz.vel : 1), supp = !!(mz && mz.supp);
  const v = dir.multiplyScalar(vel);
  spawnProjectile(eye, v, b.id, b.wid, 'bot', supp);
  hostReceive(b.id, { t: 'shot', o: [+eye.x.toFixed(2), +eye.y.toFixed(2), +eye.z.toFixed(2)], v: [+v.x.toFixed(1), +v.y.toFixed(1), +v.z.toFixed(1)], w: b.wid, s: supp ? 1 : 0 });
  botsHearShot(b.id, eye, supp);
  // recoil throws the aim off; they have to settle again
  b.aimErr.x += rand(-1, 1) * 0.0015; b.aimErr.y += rand(0.0005, 0.0015);
}
// A hit landed on a bot (from anyone): plates first, then health
function botDamage(b, dmg, from, zone, w) {
  if (!b.alive || performance.now() - b.spawnAt < 2500) return;
  if (w === 'knife' || dmg >= 999) { b.armor = 0; b.hp = 0; }
  else { const soak = Math.min(b.armor, dmg); b.armor -= soak; b.hp -= dmg - soak; }
  b.hurtBy = from; b.spot[from] = Math.max(b.spot[from] || 0, 0.7);
  const att = matchBodies(b.id).find(o => o.id === from);
  if (att && !b.target) { b.alertPos = att.pos.clone(); b.alertT = 10; b.yaw = angLerp(b.yaw, Math.atan2(-(att.pos.x - b.pos.x), -(att.pos.z - b.pos.z)), 0.4); }
  b.relocate = true;   // hurt: get out of here after this exchange
  if (b.hp <= 0) { b.alive = false; b.deadAt = performance.now(); b.target = null; hostReceive(b.id, { t: 'died', k: from, w, hs: zone === 'head' }); }
}

// ---------- The brain, every frame ----------
function botsTick(dt) {
  if (!botsAllowed() || !BOTS.size) return;
  const now = performance.now(), diff = BOT_DIFF[BOTCFG.diff];
  BOTS.forEach(b => {
    if (!b.alive) { if (now - b.deadAt > 5000 && roundCanRespawn()) botRespawn(b); botSend(b, dt); return; }
    b.thinkT -= dt; if (b.thinkT <= 0) { const step = 0.2 + Math.random() * 0.1; b.thinkT = step; botThink(b, step); }
    if (b.stabT > 0 && (b.stabT -= dt) <= 0) {
      const eye = botEye(b, new V3()), v = knifeTarget(eye, b.yaw, 0, matchBodies(b.id));
      if (v) { hostDeliverHit(b.id, v.id, 999, 'chest', 'knife'); hostReceive(b.id, { t: 'fx', k: 'blood', p: [v.pos.x, v.pos.y + 1.1, v.pos.z], d: [-Math.sin(b.yaw), 0, -Math.cos(b.yaw)], h: 0 }); }
    }
    b.fireCD -= dt; b.cycleT = Math.max(0, b.cycleT - dt); b.alertT -= dt; b.repathT -= dt; b.meleeT = Math.max(0, b.meleeT - dt);
    // reload when empty, or topping up with nobody around
    if (b.reloadT > 0) { b.reloadT -= dt; if (b.reloadT <= 0) { const take = Math.min(b.def.mag - b.ammo, b.reserve); b.ammo += take; b.reserve -= take; } }
    else if (b.reserve > 0 && (b.ammo <= 0 || (!b.target && b.ammo < b.def.mag * 0.5))) b.reloadT = b.def.reload;
    let wx = 0, wz = 0, speed = 4.1; b.sprint = false; b.scoped = false;
    const t = b.target;
    if (t) {
      const dist = Math.hypot(t.pos.x - b.pos.x, t.pos.z - b.pos.z);
      // close enough to smell them: knife
      if (dist < 9 && Math.abs(t.pos.y - b.pos.y) < 1.5) {
        b.slot = 'knife'; if (b.stance) b.stance = 0;
        const dx = t.pos.x - b.pos.x, dz = t.pos.z - b.pos.z;
        b.yaw = angLerp(b.yaw, Math.atan2(-dx, -dz), 1 - Math.exp(-dt * 10)); b.pitch = lerp(b.pitch, 0, 0.2);
        if (dist > 1.4) { wx = dx / dist; wz = dz / dist; speed = 6; b.sprint = true; }
        if (dist < 2.0 && b.meleeT <= 0) {
          b.meleeT = 0.55; SFX.knifeSwing(b.pos);
          b.stabT = 0.17;   // the blade lands a moment into the swing (game time, not a timer: hidden tabs throttle timers)
        }
      } else {
        b.slot = 'rifle';
        b.seenT += dt;
        // settle into a firing position: down on the belly if far, crouched if closer
        if (b.seenT > 0.3 && b.stance === 0) b.stance = dist > 60 ? 2 : 1;
        // where they'll be when the round arrives, and how far it drops on the way
        // the target's velocity: exact for us and bots, a quick-smoothed estimate for remote players
        // they read your movement with a delay, so changing direction throws off their lead
        if (t.vel) _bo.set(t.vel.x, 0, t.vel.z); else _bo.subVectors(t.pos, b.tPrev).divideScalar(Math.max(dt, 1e-3));
        b.tVel.lerp(_bo, 1 - Math.exp(-dt / diff.lag));
        b.tPrev.copy(t.pos);
        const aim = bodyAim(t, b.aimHead), eye = botEye(b, new V3());
        const fl = Math.hypot(aim.x - eye.x, aim.z - eye.z) / b.def.vel;
        aim.x += b.tVel.x * fl; aim.z += b.tVel.z * fl;
        const dx = aim.x - eye.x, dy = aim.y - eye.y, dz = aim.z - eye.z, hd = Math.hypot(dx, dz);
        const drop = dropAngle(b.def.vel, hd, false);
        // aim error: the first-sight error decays, plus a slow wander that never fully goes away (frame-rate independent)
        const floorE = diff.floor * Math.PI / 180 * (1 + hd / 250);
        if (!b.wErr) { b.wErr = new THREE.Vector2(); b.wGoal = new THREE.Vector2(); b.wT = 0; }
        const cross = Math.abs(b.tVel.x * dz - b.tVel.z * dx) / Math.max(hd, 1);   // sideways speed of the target (m/s)
        if ((b.wT -= dt) <= 0) { b.wT = rand(0.5, 1.1); const e2 = floorE * (1 + cross * 0.35); b.wGoal.set(gauss() * e2, gauss() * floorE); }
        b.wErr.lerp(b.wGoal, 1 - Math.exp(-dt * 2.5));
        const wantYaw = Math.atan2(-dx, -dz) + b.aimErr.x + b.wErr.x, wantPitch = Math.atan2(dy, hd) + drop + b.aimErr.y + b.wErr.y;
        // swing with the target (feed-forward) so a strafing player isn't always half a metre behind the crosshair
        const wRate = b.prevWant !== undefined ? (((wantYaw - b.prevWant) % TAU + TAU * 1.5) % TAU - Math.PI) : 0; b.prevWant = wantYaw;
        b.yaw = angLerp(b.yaw + clamp(wRate, -0.05, 0.05), wantYaw, 1 - Math.exp(-dt * diff.turn)); b.pitch = lerp(b.pitch, wantPitch, 1 - Math.exp(-dt * diff.turn));
        // aim settles the longer they track you, down to a floor that grows with distance
        const k = Math.exp(-dt * diff.settle);
        b.aimErr.multiplyScalar(k);
        b.scoped = b.seenT > 0.4 && b.reloadT <= 0 && b.cycleT <= 0;
        const yawErr = Math.abs(((wantYaw - b.yaw) % TAU + TAU * 1.5) % TAU - Math.PI);
        const onTarget = yawErr * hd < 0.15 && Math.abs(wantPitch - b.pitch) * hd < 0.15;   // within ~15 cm where the round arrives
        if (b.scoped && b.seenT > b.reactT && onTarget && b.ammo > 0 && b.fireCD <= 0) { botFire(b); b.shots = (b.shots || 0) + 1; }
      }
    } else {
      b.slot = 'rifle'; b.seenT = 0;
      if (b.relocate || (b.shots || 0) >= 2) { b.relocate = false; b.shots = 0; b.stance = 0; botPickNest(b); }
      // heard something: face it and wait a moment
      if (b.alertWait > 0) b.alertWait -= dt;
      if (b.alertPos && b.alertT > 0 && b.state === 'watch' && !(b.alertWait > 0)) {
        const dx = b.alertPos.x - b.pos.x, dz = b.alertPos.z - b.pos.z;
        b.yaw = angLerp(b.yaw, Math.atan2(-dx, -dz), 1 - Math.exp(-dt * 3)); b.scoped = true;
      }
      // low on ammo or missing plates: go shopping
      if (b.state !== 'move' || b.goalKind === 'nest') {
        const need = b.reserve === 0 && b.ammo < 3 ? 'ammo' : b.armor < 50 ? 'plate' : null;
        if (need && b.goalKind !== need) { const pk = nearestPickup(need, b.pos, need === 'plate' ? 70 : 400); if (pk) { b.stance = 0; botGo(b, pk.x, pk.z, need); } }
      }
      // the pickup we were heading for got taken or rotted away
      if (b.state === 'move' && (b.goalKind === 'plate' || b.goalKind === 'ammo') && b.goal && !nearestPickup(b.goalKind, b.goal, 2.5)) { b.goalKind = ''; botPickNest(b); }
      if (b.state === 'move' && b.path) {
        // walk the path; repath now and then (or when stuck)
        let wp = b.path[b.pathI];
        while (wp && Math.hypot(wp.x - b.pos.x, wp.z - b.pos.z) < 0.6) wp = b.path[++b.pathI];
        if (!wp) {
          if (b.goalKind === 'nest') { b.state = 'watch'; b.watchT = rand(25, 55); b.stance = Math.random() < 0.55 ? 2 : 1; b.scanT = 0; }
          else { b.goalKind = ''; botPickNest(b); }
        } else {
          const dx = wp.x - b.pos.x, dz = wp.z - b.pos.z, d = Math.hypot(dx, dz);
          wx = dx / d; wz = dz / d; b.stance = 0;
          const far = b.path.length - b.pathI > 3 || d > 20;
          b.sprint = far && !b.alertPos; speed = b.sprint ? 5.8 : 3.4;
          b.yaw = angLerp(b.yaw, Math.atan2(-wx, -wz), 1 - Math.exp(-dt * 6)); b.pitch = lerp(b.pitch, 0, 1 - Math.exp(-dt * 4));
        }
      } else if (b.state === 'watch') {
        // hold the nest, glass the area through the scope, slowly sweeping
        b.watchT -= dt; b.scanT += dt;
        if (!(b.alertPos && b.alertT > 0)) {
          const base = b.nest && b.nest.yaw !== undefined ? b.nest.yaw : b.yaw;
          b.yaw = angLerp(b.yaw, base + Math.sin(b.scanT * 0.18) * 0.75, 1 - Math.exp(-dt * 1.5)); b.pitch = lerp(b.pitch, -0.02, 1 - Math.exp(-dt * 2));
          b.scoped = Math.sin(b.scanT * 0.4) > -0.3;
        }
        if (b.watchT <= 0) { b.stance = 0; botPickNest(b); }
      }
      if (b.alertT <= 0) b.alertPos = null;
    }
    const wl = Math.hypot(wx, wz); if (wl > 0) { wx /= wl; wz /= wl; }
    speed *= b.slot === 'knife' ? 1.1 : b.def.move;
    if (b.stance === 2) speed = Math.min(speed, 0.9); else if (b.stance === 1) speed = Math.min(speed, 2.1);
    const blocked = bodyPhysics(b, wx, wz, speed, dt, [1.8, 1.25, 0.6][b.stance], R_PLAYER);
    // stuck on something: hop, then find another way
    if (wl > 0 && b.pos.distanceTo(b.lastPos) < speed * dt * 0.3) b.stuckT += dt; else b.stuckT = Math.max(0, b.stuckT - dt);
    b.lastPos.copy(b.pos);
    if (b.stuckT > 0.7 && b.onGround && blocked) { b.vel.y = 5; b.onGround = false; }
    if (b.stuckT > 1.8 && b.goal) { b.stuckT = 0; b.repathT = 0; if (b.target) b.target = null; botGo(b, b.goal.x, b.goal.z, b.goalKind); }
    else if (b.state === 'move' && b.repathT <= 0 && b.goal) botGo(b, b.goal.x, b.goal.z, b.goalKind);
    botPickups(b);
    botSend(b, dt);
  });
}
function botSend(b, dt) {
  b.sendT -= dt; if (b.sendT > 0) return; b.sendT = 1 / 20;
  const wid = b.slot === 'knife' ? 'knife' : b.wid, mods = b.slot === 'knife' ? {} : b.mods;
  hostReceive(b.id, { t: 's', s: ++b.seq, p: [+b.pos.x.toFixed(2), +b.pos.y.toFixed(2), +b.pos.z.toFixed(2)], y: +b.yaw.toFixed(3), x: +b.pitch.toFixed(3), c: b.stance, l: 0, a: b.scoped ? 1 : 0, sc: b.scoped ? 1 : 0, m: b.meleeT > 0 ? +(1 - b.meleeT / 0.55).toFixed(2) : 0, cy: b.cycleT > 0 && b.def.cycle ? +(1 - b.cycleT / b.def.cycle).toFixed(2) : 0, sp: b.sprint ? 1 : 0, r: b.reloadT > 0 ? 1 : 0, al: b.alive ? 1 : 0, g: gunKey(wid, mods) });
}
