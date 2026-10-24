'use strict';
// ---------- Peer-to-peer multiplayer (PeerJS), same pattern as Concrete Lines ----------
// The host gets a short code; friends join with it. The host relays everyone's state and events (a star),
// and keeps the scoreboard. Each player is the authority on their own health.
const NET = { peer: null, host: false, hostConn: null, conns: new Map(), myId: null, code: '', seq: 0, sendT: 0, players: {}, online: false, heard: new Map(), hostHeard: 0 };
const REMOTES = new Map();
const netStatus = t => { const el = $('netStatus'); if (el) el.textContent = t; };
const netSendTo = (c, m) => { try { if (c && c.open) c.send(m); } catch (e) {} };
const netBroadcast = (m, except) => NET.conns.forEach((c, id) => { if (id !== except) netSendTo(c, m); });
const netCode = () => { const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let c = ''; for (let i = 0; i < 4; i++) c += A[Math.floor(Math.random() * A.length)]; return 'DM-' + c; };
const netPeerId = code => 'holdover-fps-' + code.toLowerCase().replace(/[^a-z0-9-]/g, '');
const myProfile = () => ({ name: PROFILE.name || 'Operator', outfit: PROFILE.outfit, skin: PROFILE.skin });

// a message from us: the host handles it directly, a client sends it to the host
function netOut(m) {
  if (!NET.online && !NET.host) return;   // offline practice runs as a host with nobody connected
  if (NET.host) hostReceive(NET.myId, m); else netSendTo(NET.hostConn, m);
}
// ---------- Host side ----------
function hostReceive(from, m) {
  if (!m || typeof m !== 'object') return;
  const P = NET.players;
  switch (m.t) {
    case 'hello': {
      P[from] = { name: String(m.name || 'Operator').slice(0, 14), outfit: OUTFITS[m.outfit] ? m.outfit : 'woodland', skin: (m.skin | 0) % SKINS.length, k: 0, d: 0 };
      const c = NET.conns.get(from);
      netSendTo(c, { t: 'welcome', you: from, players: P, pk: pickupSnapshot() });
      netBroadcast({ t: 'join', id: from, p: P[from] }, from);
      clientReceive({ t: 'join', id: from, p: P[from] });
      hudFeedText(P[from].name + ' joined');
      break;
    }
    case 's': case 'shot': case 'respawn': case 'fx': {
      const out = Object.assign({}, m, { id: from });
      netBroadcast(out, from);
      if (from !== NET.myId) clientReceive(out);
      break;
    }
    case 'hit': hostDeliverHit(from, m.to, clamp(+m.dmg || 0, 0, 999), m.zone, m.w); break;
    case 'take': pickupTake(from, m.id); break;
    case 'chat': {
      const out = { t: 'chat', id: from, text: String(m.text || '').slice(0, 120) };
      netBroadcast(out); clientReceive(out);
      break;
    }
    case 'cmd': {   // a client asked the host to manage bots
      if (m.c === 'addbot') addBots(clamp(m.n | 0 || 1, 1, 10));
      else if (m.c === 'removebot') removeBots(m.n === 'all' ? 'all' : clamp(m.n | 0 || 1, 1, 10));
      else if (m.c === 'botdiff') setBotDiff(String(m.d));
      if (P[from] && from !== NET.myId) hudFeedText(P[from].name + ' used /' + m.c);
      break;
    }
    case 'died': {
      if (P[from]) P[from].d++;
      const k = typeof m.k === 'string' && P[m.k] && m.k !== from ? m.k : null;
      if (k) P[k].k++;
      const sc = {}; for (const id in P) sc[id] = [P[id].k, P[id].d];
      const out = { t: 'kill', v: from, k, w: m.w, hs: !!m.hs, sc };
      netBroadcast(out); clientReceive(out);
      break;
    }
  }
}
// The host hands a hit to whoever owns the victim's health: a bot (here), the host itself, or a client
function hostDeliverHit(from, to, dmg, zone, w) {
  const out = { t: 'hit', by: from, dmg, zone, w };
  if (BOTS.has(to)) botDamage(BOTS.get(to), dmg, from, zone, w);
  else if (to === NET.myId) clientReceive(out);
  else netSendTo(NET.conns.get(to), out);
}
function netHost() {
  if (typeof Peer === 'undefined') { netStatus('Online play could not load — playing offline'); startOffline(); return; }
  netLeave();
  const code = netCode(), peer = new Peer(netPeerId(code));
  NET.peer = peer; NET.host = true; NET.code = code; netStatus('Starting server…');
  peer.on('open', id => {
    NET.myId = id; NET.online = true;
    NET.players = { [id]: Object.assign(myProfile(), { k: 0, d: 0 }) };
    netStatus('Hosting ' + code); startGame();
  });
  peer.on('connection', conn => {
    conn.on('open', () => { NET.conns.set(conn.peer, conn); NET.heard.set(conn.peer, performance.now()); });
    conn.on('data', m => { NET.heard.set(conn.peer, performance.now()); hostReceive(conn.peer, m); });
    conn.on('close', () => hostDropConn(conn.peer));
  });
  peer.on('error', err => {
    if (err && err.type === 'unavailable-id') { netHost(); return; }
    if (!NET.online) { netStatus('Could not reach the matchmaking server (' + (err && err.type || 'error') + '). Starting offline.'); startOffline(); }
    else netStatus('Network: ' + (err && err.type || 'error'));
  });
  peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) {} });
}
// someone left (or went silent: a closed tab often never fires 'close')
function hostDropConn(id) {
  const c = NET.conns.get(id); NET.conns.delete(id); NET.heard.delete(id);
  try { if (c) c.close(); } catch (e) {}
  const p = NET.players[id]; if (!p) return;
  delete NET.players[id];
  netBroadcast({ t: 'bye', id }); clientReceive({ t: 'bye', id });
  hudFeedText(p.name + ' left');
}
// ---------- Client side ----------
function netJoin(raw) {
  if (typeof Peer === 'undefined') { netStatus('Online play could not load'); return; }
  let code = String(raw || '').trim().toUpperCase().replace(/\s+/g, '');
  if (/^[A-Z0-9]{4}$/.test(code)) code = 'DM-' + code;
  if (!/^DM-[A-Z0-9]{4}$/.test(code)) { netStatus('Codes look like DM-7K2F'); return; }
  netLeave();
  const peer = new Peer();
  NET.peer = peer; netStatus('Connecting to ' + code + '…');
  const timeout = setTimeout(() => { if (!NET.online) netStatus('No answer from ' + code + '. Check the code, or the host\'s network may block peer-to-peer.'); }, 12000);
  peer.on('open', id => {
    NET.myId = id;
    const conn = peer.connect(netPeerId(code), { reliable: false, serialization: 'json' });
    NET.hostConn = conn;
    conn.on('open', () => { clearTimeout(timeout); NET.online = true; NET.code = code; NET.hostHeard = performance.now(); netSendTo(conn, Object.assign({ t: 'hello' }, myProfile())); netStatus('Joined ' + code); });
    conn.on('data', m => { NET.hostHeard = performance.now(); clientReceive(m); });
    conn.on('close', () => { if (NET.online) { NET.online = false; leaveToMenu('Disconnected from the host (the host left, or the connection dropped).'); } });
  });
  peer.on('error', err => { clearTimeout(timeout); netStatus(err && err.type === 'peer-unavailable' ? 'No game found for ' + code : 'Network error: ' + (err && err.type || 'unknown')); });
}
// keepalive on a timer: rendering (and so netTick) stops in a hidden tab, but timers still tick about once a second
setInterval(() => { if (!NET.online) return; if (NET.host) netBroadcast({ t: 'ka' }); else netSendTo(NET.hostConn, { t: 'ka' }); }, 1000);
window.addEventListener('pagehide', () => { try { if (NET.peer) NET.peer.destroy(); } catch (e) {} });
function netLeave() {
  try { if (NET.peer) NET.peer.destroy(); } catch (e) {}
  NET.peer = null; NET.host = false; NET.hostConn = null; NET.conns.clear(); NET.code = ''; NET.online = false; NET.players = {};
  botsReset();
  REMOTES.forEach(r => { if (r.op) { SCENE.remove(r.op.root); freeOperator(r.op); } }); REMOTES.clear();
}
const isUnder = (o, root) => { for (let p = o; p; p = p.parent) if (p === root) return true; return false; };
// free a character's GPU buffers (each one owns its geometry and material)
function freeOperator(op) { const gun = op.gun && op.gun.group; op.root.traverse(o => { if (o.isMesh && !(gun && isUnder(o, gun))) {   // gun geometry is cached and shared between players
 o.geometry.dispose(); (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (m && !Object.values(GM).includes(m)) m.dispose(); }); } }); }
// ---------- Messages arriving at every player ----------
function addRemote(id, p) {
  if (id === NET.myId || REMOTES.has(id)) return;
  const op = buildOperator(p.outfit, p.skin); op.root.visible = false; SCENE.add(op.root);
  REMOTES.set(id, { id, name: p.name, outfit: p.outfit, op, buf: [], state: null, alive: false, gunKey: '', lastSeq: -1, k: p.k || 0, d: p.d || 0 });
}
function clientReceive(m) {
  if (!m || typeof m !== 'object') return;
  switch (m.t) {
    case 'welcome': {
      NET.myId = m.you; NET.players = Object.assign(NET.players || {}, m.players || {});   // merge: a 'join' may have beaten the welcome here
      for (const id in NET.players) addRemote(id, NET.players[id]);
      if (m.pk) pickupApplySnapshot(m.pk);
      startGame(); break;
    }
    case 'join': NET.players[m.id] = m.p; addRemote(m.id, m.p); if (!NET.host) hudFeedText(m.p.name + ' joined'); break;
    case 'bye': { const r = REMOTES.get(m.id); if (r) { SCENE.remove(r.op.root); freeOperator(r.op); REMOTES.delete(m.id); if (!NET.host) hudFeedText(r.name + ' left'); } delete NET.players[m.id]; break; }
    case 's': {
      const r = REMOTES.get(m.id); if (!r || !Array.isArray(m.p)) return;
      if (m.s <= r.lastSeq) return; r.lastSeq = m.s;
      r.buf.push({ t: performance.now(), pos: new V3(m.p[0], m.p[1], m.p[2]), yaw: m.y, pitch: m.x, stance: m.c | 0, lean: m.l || 0, ads: !!m.a, scoped: !!m.sc, melee: +m.m || 0, cycle: +m.cy || 0, sprint: !!m.sp, reload: !!m.r, alive: !!m.al, g: m.g });
      if (r.buf.length > 30) r.buf.shift();
      // someone already alive when we joined (we never saw their respawn message)
      if (m.al && !r.alive && (!r.deadAt || performance.now() - r.deadAt > 1500)) r.alive = true;
      break;
    }
    case 'shot': remoteShot(m); break;
    case 'fx': if (m.k === 'blood' && Array.isArray(m.p) && Array.isArray(m.d)) { const p = new V3(m.p[0], m.p[1], m.p[2]); fxBlood(p, new V3(m.d[0], m.d[1], m.d[2]), m.h ? 1.6 : 1, !!m.h); SFX.fleshHit(p, !!m.h); } break;
    case 'pk': pickupApply(m); break;
    case 'hit': takeDamage(m.dmg, m.by, m.zone, m.w); break;
    case 'kill': {
      if (m.sc) for (const id in m.sc) { if (NET.players[id]) { NET.players[id].k = m.sc[id][0]; NET.players[id].d = m.sc[id][1]; } }
      const r = REMOTES.get(m.v); if (r) { r.alive = false; r.deadAt = performance.now(); if (r.state) fxBloodPool(r.state.pos.clone().add(new V3(Math.sin(r.state.yaw || 0), 0, Math.cos(r.state.yaw || 0)).multiplyScalar(r.state.stance === 2 ? 0 : 0.7))); }   // they fall backwards
      if (m.k === NET.myId) {
        PL.kills++; hudHit(m.hs, true);
        const d = r && r.state ? Math.round(r.state.pos.distanceTo(PL.pos)) : 0;
        hudCenter((m.hs ? 'HEADSHOT' : m.w === 'knife' ? 'KNIFED' : 'KILL') + ' · ' + nameOf(m.v) + (d && m.w !== 'knife' ? ' · ' + d + ' m' : ''), 2.5);
      }
      hudKillFeed(m.k, m.v, m.w, m.hs);
      break;
    }
    case 'respawn': { const r = REMOTES.get(m.id); if (r) { r.alive = true; r.buf.length = 0; } break; }
    case 'chat': hudChat(m.id, m.text); break;
  }
}
// ---------- Outgoing ----------
function netTick(dt) {
  if (!NET.online) return;
  // drop peers that went silent (everyone sends state 20 times a second, even while dead)
  const now = performance.now();
  if (NET.host) NET.heard.forEach((t, id) => { if (now - t > 10000) hostDropConn(id); });
  else if (NET.hostHeard && now - NET.hostHeard > 10000) { NET.online = false; leaveToMenu('Lost connection to the host.'); return; }
  NET.sendT -= dt;
  if (NET.sendT <= 0) {
    NET.sendT = 1 / 20;
    const w = curW();
    netOut({ t: 's', s: ++NET.seq, p: [+PL.pos.x.toFixed(2), +PL.pos.y.toFixed(2), +PL.pos.z.toFixed(2)], y: +PL.yaw.toFixed(3), x: +PL.pitch.toFixed(3), c: PL.stance, l: +(PL.leanEff || 0).toFixed(2), a: PL.adsT > 0.5 ? 1 : 0, sc: PL.scoped ? 1 : 0, m: PL.meleeT > 0 ? +(1 - PL.meleeT / 0.55).toFixed(2) : 0, cy: PL.cycleT > 0 ? +(1 - PL.cycleT / PL.cycleDur).toFixed(2) : 0, sp: PL.sprint ? 1 : 0, r: PL.reloading ? 1 : 0, al: PL.alive ? 1 : 0, g: w ? gunKey(w.id, w.mods) : '' });
  }
}
const gunKey = (id, m) => [id, m.optic || '', m.muzzle || '', m.under || ''].join('|');
function netShot(o, v, w, supp) { netOut({ t: 'shot', o: [+o.x.toFixed(2), +o.y.toFixed(2), +o.z.toFixed(2)], v: [+v.x.toFixed(1), +v.y.toFixed(1), +v.z.toFixed(1)], w, s: supp ? 1 : 0 }); }
function netHit(to, dmg, zone, w) { netOut({ t: 'hit', to, dmg, zone, w }); }
function netDied(killer, w, hs) { netOut({ t: 'died', k: killer, w, hs }); }
function netRespawn() { netOut({ t: 'respawn' }); }

// ---------- Remote players: interpolate, animate, play their shots ----------
const _rp = new V3();
function remotesTick(dt) {
  const now = performance.now(), rt = now - 110;
  REMOTES.forEach(r => {
    const b = r.buf; if (!b.length) { r.op.root.visible = false; return; }
    let a = b[0], c = b[b.length - 1];
    for (let i = 0; i < b.length - 1; i++) if (b[i].t <= rt && b[i + 1].t >= rt) { a = b[i]; c = b[i + 1]; break; }
    const u = c.t === a.t ? 1 : clamp((rt - a.t) / (c.t - a.t), 0, 1);
    if (rt > c.t) { a = c; }
    const pos = _rp.copy(a.pos).lerp(c.pos, u);
    if (a.pos.distanceTo(c.pos) > 6) pos.copy(c.pos);   // teleported (respawn)
    const st = r.state || (r.state = { pos: new V3() });
    st.pos.copy(pos); st.yaw = angLerp(a.yaw, c.yaw, u); st.pitch = lerp(a.pitch, c.pitch, u);
    st.stance = c.stance; st.crouch = c.stance === 1; st.lean = lerp(a.lean, c.lean, u); st.ads = c.ads; st.scoped = c.scoped; st.melee = c.melee; st.cycle = c.cycle; st.sprint = c.sprint; st.reload = c.reload; st.alive = c.alive && r.alive !== false;
    if (c.alive && !r.alive && (!r.deadAt || now - r.deadAt > 1500)) r.alive = true;
    st.alive = r.alive;
    // swap the model's gun when they change weapon or attachments
    if (c.g && c.g !== r.gunKey) {
      const [id, optic, muzzle, under] = c.g.split('|');
      if (WEAPONS[id]) { setOperatorGun(r.op, id, { optic, muzzle, under }); r.gunKey = c.g; r.wid = id; }
    }
    const visible = c.alive || (r.deadAt && now - r.deadAt < 3200);
    r.op.root.visible = !!visible;
    if (visible) {
      const ph0 = r.op.phase;
      animateOperator(r.op, st, dt);
      // far away, nobody can make out their shadow: skip the shadow pass for them
      const far = st.pos.distanceTo(CAMERA.position) > 55;
      if (far !== r.far) { r.far = far; r.op.root.traverse(o => { if (o.isMesh && !(r.op.gun && o.parent && o.parent === r.op.gun.group)) o.castShadow = !far; }); }
      // the map bakes darkness into interiors; dim people standing in there to match
      if (typeof occAt === 'function' && r.op.mats && r.op.mats.m) { const k = 1 - occAt(st.pos.x, st.pos.z, st.pos.y + 1); r.op.mats.m.color.setScalar(lerp(r.op.mats.m.color.r, k, 1 - Math.exp(-dt * 4))); }
      // footsteps when a foot comes down
      if (st.alive && Math.floor(r.op.phase / Math.PI) !== Math.floor(ph0 / Math.PI) && r.op.speed > 0.8) SFX.step(st.pos, surfaceAt(st.pos.x, st.pos.z, st.pos.y), [0.8, 0.4, 0.25][st.stance || 0] * (st.sprint ? 1.5 : 1));
      // a scope pointed at you catches the light
      if (st.alive && st.ads && r.wid && WEAPONS[r.wid] && !WEAPONS[r.wid].pistol && !WEAPONS[r.wid].melee) remoteGlint(st);
    }
  });
}
const _glp = new V3();
function remoteGlint(st) {
  const fx = -Math.sin(st.yaw) * Math.cos(st.pitch), fy = Math.sin(st.pitch), fz = -Math.cos(st.yaw) * Math.cos(st.pitch);
  const eh = [1.6, 1.1, 0.38][st.stance || 0];
  _glp.set(st.pos.x + fx * 0.35, st.pos.y + eh, st.pos.z + fz * 0.35);
  const tx = CAMERA.position.x - _glp.x, ty = CAMERA.position.y - _glp.y, tz = CAMERA.position.z - _glp.z, L = Math.hypot(tx, ty, tz);
  if (L < 8) return;
  const dot = (tx * fx + ty * fy + tz * fz) / L;
  const s = smoothT((dot - 0.94) / 0.055);
  if (s > 0.02) fxGlint(_glp, s * (st.scoped ? 1 : 0.5));
}
function remoteShot(m) {
  const r = REMOTES.get(m.id); if (!Array.isArray(m.o) || !Array.isArray(m.v)) return;
  const o = new V3(m.o[0], m.o[1], m.o[2]), v = new V3(m.v[0], m.v[1], m.v[2]);
  if (typeof kcRecordShot === 'function') kcRecordShot(m.id, o, v, m.w, !!m.s);   // kill-cam (killcam.js) replays the round that killed you
  // flash at the model's muzzle, unless the model's aim lags behind the real shot (a quick turn): then just ahead of the origin
  const vd = v.clone().normalize(); let muzzle = o.clone().addScaledVector(vd, 1);
  if (r && r.op.gun && r.op.root.visible && r.op.gun.muzzle) {
    const mp = new V3(); r.op.gun.muzzle.getWorldPosition(mp); r.op.kick = 1;
    const ahead = mp.clone().sub(o), along = ahead.dot(vd);
    if (along > -0.3 && along < 2.5 && ahead.addScaledVector(vd, -along).length() < 0.6) muzzle = mp;
  }
  const def = WEAPONS[m.w] || WEAPONS.awm;
  if (!m.s) fxMuzzle(muzzle, v.clone().normalize(), def.pistol ? 1 : 1.6);
  SFX.shot(def.snd, muzzle, !!m.s, m.w);
  // the round itself flies for real (looks only — the shooter decides hits); a host's bots already simulate their own
  if (!BOTS.has(m.id)) spawnProjectile(o, v, m.id, m.w, 'vis', !!m.s);
  // gunshots give your position away to the bots
  if (NET.host) botsHearShot(m.id, o, !!m.s);
}
