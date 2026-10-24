'use strict';
// ---------- Peer-to-peer multiplayer (PeerJS), same pattern as Concrete Lines ----------
// The host gets a short code; friends join with it. The host relays everyone's state and events (a star),
// and keeps the scoreboard. Each player is the authority on their own health.
const NET = { peer: null, host: false, hostConn: null, conns: new Map(), myId: null, code: '', seq: 0, sendT: 0, players: {}, online: false };
const REMOTES = new Map();
const netStatus = t => { const el = $('netStatus'); if (el) el.textContent = t; };
const netSendTo = (c, m) => { try { if (c && c.open) c.send(m); } catch (e) {} };
const netBroadcast = (m, except) => NET.conns.forEach((c, id) => { if (id !== except) netSendTo(c, m); });
const netCode = () => { const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let c = ''; for (let i = 0; i < 4; i++) c += A[Math.floor(Math.random() * A.length)]; return 'DM-' + c; };
const netPeerId = code => 'outpost-fps-' + code.toLowerCase().replace(/[^a-z0-9-]/g, '');
const myProfile = () => ({ name: PROFILE.name || 'Operator', outfit: PL.outfit, skin: PL.skin });

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
      P[from] = { name: String(m.name || 'Operator').slice(0, 14), outfit: OUTFITS[m.outfit] ? m.outfit : 'ranger', skin: (m.skin | 0) % SKINS.length, k: 0, d: 0 };
      const c = NET.conns.get(from);
      netSendTo(c, { t: 'welcome', you: from, players: P });
      netBroadcast({ t: 'join', id: from, p: P[from] }, from);
      clientReceive({ t: 'join', id: from, p: P[from] });
      hudFeedText(P[from].name + ' joined');
      break;
    }
    case 's': case 'shot': case 'respawn': {
      const out = Object.assign({}, m, { id: from });
      netBroadcast(out, from);
      if (from !== NET.myId) clientReceive(out);
      break;
    }
    case 'hit': hostDeliverHit(from, m.to, clamp(+m.dmg || 0, 0, 400), m.zone, m.w); break;
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
    conn.on('open', () => { NET.conns.set(conn.peer, conn); });
    conn.on('data', m => hostReceive(conn.peer, m));
    conn.on('close', () => {
      NET.conns.delete(conn.peer);
      const p = NET.players[conn.peer]; delete NET.players[conn.peer];
      netBroadcast({ t: 'bye', id: conn.peer }); clientReceive({ t: 'bye', id: conn.peer });
      if (p) hudFeedText(p.name + ' left');
    });
  });
  peer.on('error', err => {
    if (err && err.type === 'unavailable-id') { netHost(); return; }
    if (!NET.online) { netStatus('Could not reach the matchmaking server (' + (err && err.type || 'error') + '). Starting offline.'); startOffline(); }
    else netStatus('Network: ' + (err && err.type || 'error'));
  });
  peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) {} });
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
    conn.on('open', () => { clearTimeout(timeout); NET.online = true; NET.code = code; netSendTo(conn, Object.assign({ t: 'hello' }, myProfile())); netStatus('Joined ' + code); });
    conn.on('data', m => clientReceive(m));
    conn.on('close', () => { if (NET.online) { NET.online = false; leaveToMenu('The host ended the game.'); } });
  });
  peer.on('error', err => { clearTimeout(timeout); netStatus(err && err.type === 'peer-unavailable' ? 'No game found for ' + code : 'Network error: ' + (err && err.type || 'unknown')); });
}
function netLeave() {
  try { if (NET.peer) NET.peer.destroy(); } catch (e) {}
  NET.peer = null; NET.host = false; NET.hostConn = null; NET.conns.clear(); NET.code = ''; NET.online = false; NET.players = {};
  botsReset();
  REMOTES.forEach(r => { if (r.op) SCENE.remove(r.op.root); }); REMOTES.clear();
}
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
      NET.myId = m.you; NET.players = m.players || {};
      for (const id in NET.players) addRemote(id, NET.players[id]);
      startGame(); break;
    }
    case 'join': NET.players[m.id] = m.p; addRemote(m.id, m.p); if (!NET.host) hudFeedText(m.p.name + ' joined'); break;
    case 'bye': { const r = REMOTES.get(m.id); if (r) { SCENE.remove(r.op.root); REMOTES.delete(m.id); if (!NET.host) hudFeedText(r.name + ' left'); } delete NET.players[m.id]; break; }
    case 's': {
      const r = REMOTES.get(m.id); if (!r || !Array.isArray(m.p)) return;
      if (m.s <= r.lastSeq) return; r.lastSeq = m.s;
      r.buf.push({ t: performance.now(), pos: new V3(m.p[0], m.p[1], m.p[2]), yaw: m.y, pitch: m.x, crouch: !!m.c, lean: m.l || 0, ads: !!m.a, sprint: !!m.sp, reload: !!m.r, alive: !!m.al, g: m.g });
      if (r.buf.length > 30) r.buf.shift();
      // someone already alive when we joined (we never saw their respawn message)
      if (m.al && !r.alive && (!r.deadAt || performance.now() - r.deadAt > 1500)) r.alive = true;
      break;
    }
    case 'shot': remoteShot(m); break;
    case 'hit': takeDamage(m.dmg, m.by, m.zone, m.w); break;
    case 'kill': {
      if (m.sc) for (const id in m.sc) { if (NET.players[id]) { NET.players[id].k = m.sc[id][0]; NET.players[id].d = m.sc[id][1]; } }
      const r = REMOTES.get(m.v); if (r) { r.alive = false; r.deadAt = performance.now(); }
      if (m.k === NET.myId) { PL.kills++; hudHit(m.hs, true); }
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
  NET.sendT -= dt;
  if (NET.sendT <= 0) {
    NET.sendT = 1 / 20;
    const w = curW();
    netOut({ t: 's', s: ++NET.seq, p: [+PL.pos.x.toFixed(2), +PL.pos.y.toFixed(2), +PL.pos.z.toFixed(2)], y: +PL.yaw.toFixed(3), x: +PL.pitch.toFixed(3), c: PL.crouch ? 1 : 0, l: +(PL.leanEff || 0).toFixed(2), a: PL.adsT > 0.5 ? 1 : 0, sp: PL.sprint ? 1 : 0, r: PL.reloading ? 1 : 0, al: PL.alive ? 1 : 0, g: w ? w.id + '|' + w.mods.optic + '|' + w.mods.muzzle : '' });
  }
}
function netShot(o, e, w, supp) { netOut({ t: 'shot', o: [+o.x.toFixed(2), +o.y.toFixed(2), +o.z.toFixed(2)], e: [+e.x.toFixed(2), +e.y.toFixed(2), +e.z.toFixed(2)], w, s: supp ? 1 : 0 }); }
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
    st.crouch = c.crouch; st.lean = lerp(a.lean, c.lean, u); st.ads = c.ads; st.sprint = c.sprint; st.reload = c.reload; st.alive = c.alive && r.alive !== false;
    if (c.alive && !r.alive && (!r.deadAt || now - r.deadAt > 1500)) r.alive = true;
    st.alive = r.alive;
    // swap the model's gun when they change weapon or attachments
    if (c.g && c.g !== r.gunKey) {
      const [id, optic, muzzle] = c.g.split('|');
      if (WEAPONS[id]) { setOperatorGun(r.op, id, { optic, muzzle }); r.gunKey = c.g; }
    }
    const visible = c.alive || (r.deadAt && now - r.deadAt < 3200);
    r.op.root.visible = !!visible;
    if (visible) {
      const ph0 = r.op.phase;
      animateOperator(r.op, st, dt);
      // footsteps when a foot comes down
      if (st.alive && Math.floor(r.op.phase / Math.PI) !== Math.floor(ph0 / Math.PI) && r.op.speed > 1.2) SFX.step(st.pos, surfaceAt(st.pos.x, st.pos.z, st.pos.y), st.crouch ? 0.3 : st.sprint ? 1.2 : 0.8);
    }
  });
}
const _seg = new V3(), _toCam = new V3();
function remoteShot(m) {
  const r = REMOTES.get(m.id); if (!Array.isArray(m.o) || !Array.isArray(m.e)) return;
  const o = new V3(m.o[0], m.o[1], m.o[2]), e = new V3(m.e[0], m.e[1], m.e[2]);
  let muzzle = o.clone();
  if (r && r.op.gun && r.op.root.visible) { r.op.gun.muzzle.getWorldPosition(muzzle); r.op.kick = 1; }
  const def = WEAPONS[m.w] || WEAPONS.m4;
  if (!m.s) fxMuzzle(muzzle, null, def.pellets ? 1.4 : 1);
  if (!m.s || Math.random() < 0.3) fxTracer(muzzle, e);
  SFX.shot(def.snd, muzzle, !!m.s);
  // impact where it landed
  const d = e.clone().sub(o), len = d.length(); d.normalize();
  const h = rayWorld(o, d, len + 0.2, true);
  if (h && Math.abs(h.t - len) < 0.5) { fxImpact(e, h.n, h.c.mat); SFX.impact(e, h.c.mat); }
  // a crack/whizz if it passed close to us
  if (PL.alive) {
    _seg.copy(e).sub(o); const L = _seg.length(); _seg.normalize();
    _toCam.copy(CAMERA.position).sub(o); const t = clamp(_toCam.dot(_seg), 0, L);
    const closest = o.clone().addScaledVector(_seg, t), dist = closest.distanceTo(CAMERA.position);
    if (dist < 2.5 && t > 3 && t < L - 0.5) SFX.whiz(closest);
  }
}
