'use strict';
// ---------- Menus, settings, loadout, HUD ----------
const store = { get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
const SETTINGS = Object.assign({ vol: 10, sens: 1, adsSens: 0.8, fov: 80, shadows: 2, scale: 1, grass: 1, aimMode: 'hold', invert: 0 }, store.get('outpost-settings', {}));
const PROFILE = Object.assign({ name: '', outfit: 'ranger', skin: 0 }, store.get('outpost-profile', {}));
const LOADOUT = Object.assign({ primary: 'm4', mods: {}, glockMuzzle: 'none' }, store.get('outpost-loadout', {}));
PRIMARIES.forEach(id => { LOADOUT.mods[id] = Object.assign({}, WEAPONS[id].def, LOADOUT.mods[id] || {}); });
const GAME = { running: false, menuIngame: false };

// ---------- Settings panel ----------
function applySettings() {
  SFX.setVolume(SETTINGS.vol / 100);
  if (CAMERA) { CAMERA.fov = SETTINGS.fov; CAMERA.updateProjectionMatrix(); }
  if (typeof applyGraphics === 'function') applyGraphics();
  store.set('outpost-settings', SETTINGS);
}
function settingsUI() {
  const bind = (id, key, out, fmt = v => v, parse = parseFloat) => {
    const el = $(id), o = out ? $(out) : null; el.value = SETTINGS[key];
    const show = () => { if (o) o.textContent = fmt(SETTINGS[key]); };
    el.addEventListener('input', () => { SETTINGS[key] = parse(el.value); show(); applySettings(); }); show();
  };
  bind('sVol', 'vol', 'oVol', v => v + '%', v => parseInt(v, 10));
  bind('sSens', 'sens', 'oSens', v => (+v).toFixed(2));
  bind('sAds', 'adsSens', 'oAds', v => (+v).toFixed(2));
  bind('sFov', 'fov', 'oFov', v => v + '°', v => parseInt(v, 10));
  bind('sShadow', 'shadows', null, v => v, v => parseInt(v, 10));
  bind('sScale', 'scale', null);
  bind('sGrass', 'grass', null, v => v, v => parseInt(v, 10));
  bind('sAimMode', 'aimMode', null, v => v, v => v);
  bind('sInvert', 'invert', null, v => v, v => parseInt(v, 10));
  let back = 'menu';
  const open = from => { back = from; $('settings').hidden = false; };
  $('btnSettings').onclick = () => open('menu');
  $('btnPauseSettings').onclick = () => open('pause');
  $('btnSetBack').onclick = () => { $('settings').hidden = true; };
}

// ---------- Main menu: callsign, outfit, loadout with a turntable preview ----------
let PREV = null;
function menuUI() {
  const nameIn = $('nameIn'); nameIn.value = PROFILE.name;
  nameIn.addEventListener('input', () => { PROFILE.name = nameIn.value.trim().slice(0, 14); store.set('outpost-profile', PROFILE); });
  const op = $('outfitPick');
  Object.keys(OUTFITS).forEach(k => {
    const b = document.createElement('button'); b.title = OUTFITS[k].name; b.dataset.k = k;
    b.style.background = `linear-gradient(135deg, ${OUTFITS[k].base} 0 50%, ${OUTFITS[k].c1} 50% 100%)`;
    b.onclick = () => { PROFILE.outfit = k; PL.outfit = k; store.set('outpost-profile', PROFILE); markOutfit(); };
    op.appendChild(b);
  });
  const markOutfit = () => op.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.k === PROFILE.outfit)));
  markOutfit(); PL.outfit = PROFILE.outfit; PL.skin = PROFILE.skin;
  // gun list
  const gl = $('gunList');
  PRIMARIES.forEach(id => {
    const b = document.createElement('button'); b.dataset.id = id;
    b.innerHTML = `${WEAPONS[id].name}<small>${WEAPONS[id].cal.split(' ')[0]}</small>`;
    b.onclick = () => { LOADOUT.primary = id; saveLoadout(); refreshLoadout(); };
    gl.appendChild(b);
  });
  $('glockMuzzle').value = LOADOUT.glockMuzzle;
  $('glockMuzzle').onchange = e => { LOADOUT.glockMuzzle = e.target.value; saveLoadout(); };
  $('btnHost').onclick = () => { SFX.init(); applySettings(); netStatus('Starting…'); netHost(); };
  $('btnJoin').onclick = () => { SFX.init(); applySettings(); netJoin($('codeIn').value); };
  $('codeIn').addEventListener('keydown', e => { if (e.key === 'Enter') { SFX.init(); netJoin($('codeIn').value); } e.stopPropagation(); });
  nameIn.addEventListener('keydown', e => e.stopPropagation());
  // preview renderer
  const cv = $('gunPreview');
  const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
  r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); r.setSize(640, 300, false);
  r.outputEncoding = THREE.sRGBEncoding; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.1;
  const sc = new THREE.Scene(), cam = new THREE.PerspectiveCamera(26, 640 / 300, 0.01, 20);
  sc.add(new THREE.HemisphereLight(0xe8eeff, 0x40382a, 1.0));
  const k1 = new THREE.DirectionalLight(0xfff2e0, 1.6); k1.position.set(1, 2, 1.5); sc.add(k1);
  const k2 = new THREE.DirectionalLight(0x9ab8ff, 0.6); k2.position.set(-1.5, 0.5, -1); sc.add(k2);
  const pivot = new THREE.Group(); sc.add(pivot);
  PREV = { r, sc, cam, pivot, model: null, t: 0 };
  refreshLoadout();
}
function saveLoadout() { store.set('outpost-loadout', LOADOUT); }
function refreshLoadout() {
  const id = LOADOUT.primary, def = WEAPONS[id], mods = LOADOUT.mods[id];
  $('gunList').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.id === id)));
  $('gunTitle').textContent = def.name; $('gunDesc').textContent = def.cal + ' · ' + def.desc;
  // mod slots
  const ms = $('modSlots'); ms.innerHTML = '';
  [['optic', 'Optic', OPTICS], ['muzzle', 'Muzzle', MUZZLES]].forEach(([slot, label, table]) => {
    const opts = def.slots[slot]; if (!opts || opts.length < 2) return;
    const l = document.createElement('label'); l.textContent = label;
    const s = document.createElement('select');
    opts.forEach(o => { const op = document.createElement('option'); op.value = o; op.textContent = table[o].name; s.appendChild(op); });
    s.value = mods[slot]; s.onchange = () => { mods[slot] = s.value; saveLoadout(); refreshLoadout(); };
    l.appendChild(s); ms.appendChild(l);
  });
  // stats
  const st = $('gunStats'); st.innerHTML = '';
  const dpsMax = 30 * 800 / 60 * 1.05;
  const rows = [
    ['Damage', def.dmg * (def.pellets || 1), 110, def.pellets ? def.pellets + '×' + def.dmg : def.dmg],
    ['Fire rate', def.rpm, 900, def.kind === 'auto' ? def.rpm + ' rpm' : def.kind],
    ['Recoil', def.recoil.v, 6, def.recoil.v.toFixed(1)],
    ['Range', def.range[1], 330, def.range[1] + ' m'],
    ['Capacity', def.mag, 30, def.mag],
    ['Mobility', def.move, 1.05, Math.round(def.move * 100)],
  ];
  rows.forEach(([n, v, max, txt]) => { st.insertAdjacentHTML('beforeend', `<span>${n}</span><div class="bar"><i style="width:${clamp(v / max, 0.04, 1) * 100}%"></i></div><span class="v">${txt}</span>`); });
  // model
  if (PREV) {
    if (PREV.model) PREV.pivot.remove(PREV.model.group);
    PREV.model = buildGun(id, mods, false);
    const g = PREV.model.group; PREV.pivot.add(g);
    const bb = new THREE.Box3().setFromObject(g), c = bb.getCenter(new V3()), size = bb.getSize(new V3());
    g.position.sub(c);
    const len = Math.max(size.z, size.y * 1.6);
    PREV.cam.position.set(len * 2.1, len * 0.35, 0); PREV.cam.lookAt(0, 0, 0);
  }
}
function previewTick(dt) {
  if (!PREV || $('menu').hidden) return;
  PREV.t += dt; PREV.pivot.rotation.y = Math.sin(PREV.t * 0.35) * 0.7; PREV.pivot.rotation.x = Math.sin(PREV.t * 0.5) * 0.05;
  PREV.r.render(PREV.sc, PREV.cam);
}
function showMenu(ingame) {
  GAME.menuIngame = ingame; $('menu').hidden = false;
  document.querySelector('.menuGrid > .panel:first-child').hidden = !!ingame;
  let done = $('btnLoadDone');
  if (ingame) {
    if (!done) { done = document.createElement('button'); done.id = 'btnLoadDone'; done.className = 'primary'; done.textContent = 'DONE — APPLIES ON NEXT RESPAWN'; done.onclick = () => { $('menu').hidden = true; $('pause').hidden = false; }; document.querySelector('.loadout').appendChild(done); }
    done.hidden = false;
  } else if (done) done.hidden = true;
}

// ---------- Pause ----------
function pauseUI() {
  $('btnResume').onclick = () => { $('pause').hidden = true; lockPointer(); };
  $('btnLoadout').onclick = () => { $('pause').hidden = true; showMenu(true); refreshLoadout(); };
  $('btnLeave').onclick = () => leaveToMenu();
  $('btnAddBot').onclick = () => addBots(1);
  $('btnRemoveBot').onclick = () => removeBots(1);
  $('botDiff').onchange = e => setBotDiff(e.target.value);
  // chat / command line
  const ci = $('cmdIn');
  ci.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter') { const v = ci.value.trim(); closeCmd(); if (v) runCmd(v); }
    else if (e.key === 'Escape') closeCmd();
  });
  $('pauseCode').onclick = () => { if (NET.code && navigator.clipboard) navigator.clipboard.writeText(NET.code).then(() => { $('pauseCode').textContent = 'Copied ' + NET.code; }).catch(() => {}); };
}
function openCmd(prefix = '') {
  if (!GAME.running || !$('pause').hidden || !$('menu').hidden) return;
  INPUT.keys = {}; INPUT.mouse.l = INPUT.mouse.r = false;
  $('cmdBox').hidden = false; const ci = $('cmdIn'); ci.value = prefix; ci.focus();
}
function closeCmd() { const ci = $('cmdIn'); ci.value = ''; ci.blur(); $('cmdBox').hidden = true; }
const cmdOpen = () => !$('cmdBox').hidden;
function runCmd(text) {
  if (text[0] !== '/') { netOut({ t: 'chat', text }); if (!NET.online) hudChat(NET.myId, text); return; }
  const [c, arg] = text.slice(1).toLowerCase().split(/\s+/);
  const n = arg === 'all' ? 'all' : clamp(parseInt(arg, 10) || 1, 1, 10);
  if (c === 'addbot' || c === 'addbots' || c === 'bot') addBots(n === 'all' ? BOTCFG.max : n);
  else if (c === 'removebot' || c === 'removebots' || c === 'kickbot') removeBots(n);
  else if (c === 'botdiff' || c === 'difficulty') { setBotDiff(arg); if (BOT_DIFF[arg]) $('botDiff').value = arg; }
  else if (c === 'help') hudFeedText('/addbot [n] · /removebot [n|all] · /botdiff easy|normal|hard', 8);
  else hudFeedText('Unknown command. Try /help');
}
function hudChat(id, text) {
  const el = document.createElement('div'); el.className = 'chat';
  el.innerHTML = `<b>${escapeHtml(nameOf(id))}</b>${escapeHtml(text)}`;
  $('killfeed').prepend(el); HUD.feed.push({ el, t: 8 });
  while ($('killfeed').children.length > 7) $('killfeed').lastChild.remove();
}
function lockPointer() { const c = $('view'); try { const p = c.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) {} }

// ---------- Game start / leave ----------
function startGame() {
  if (GAME.running) return;
  GAME.running = true;
  $('menu').hidden = true; $('hud').hidden = false; $('pause').hidden = true;
  PL.outfit = PROFILE.outfit; PL.skin = PROFILE.skin; PL.kills = 0; PL.deaths = 0;
  $('codeTag').textContent = NET.online ? (NET.host ? 'HOSTING  ' + NET.code + '  · friends join with this code' : 'IN GAME  ' + NET.code) : 'OFFLINE PRACTICE';
  respawn();
  lockPointer();
  hudCenter(NET.online ? 'FREE-FOR-ALL · click to aim' : 'Practice — host a game to play with friends', 3);
}
// offline practice acts as a host with nobody connected, so bots work the same way
function startOffline() {
  NET.online = false; NET.host = true; NET.myId = 'me';
  NET.players = { me: Object.assign(myProfile(), { k: 0, d: 0 }) };
  startGame();
}
function leaveToMenu(msg) {
  netLeave(); GAME.running = false; PL.alive = false; closeCmd();
  try { document.exitPointerLock(); } catch (e) {}
  $('hud').hidden = true; $('pause').hidden = true; $('deathScreen').hidden = true; showMenu(false);
  if (VM.root) VM.root.visible = false;
  netStatus(msg || '');
}

// ---------- HUD ----------
const HUD = { hitT: 0, vigT: 0, centerT: 0, feed: [], dmgArcs: [], deathT: 0 };
function nameOf(id) {
  if (!id) return 'the world';
  if (id === NET.myId || (!NET.online && id === 'me')) return 'You';
  const p = NET.players[id]; return p ? p.name : 'Someone';
}
function hudHit(head, kill) {
  const h = $('hitmarker'); h.classList.toggle('kill', !!kill); HUD.hitT = kill ? 0.35 : 0.16;
  SFX.hit(head, kill);
}
function hudDamage(fromId) {
  HUD.vigT = 0.6;
  const r = REMOTES.get(fromId);
  if (r && r.state) {
    const dx = r.state.pos.x - PL.pos.x, dz = r.state.pos.z - PL.pos.z;
    const ang = Math.atan2(-dx, -dz) - PL.yaw;   // 0 = straight ahead
    const el = document.createElement('div'); el.className = 'arc'; el.style.transform = `rotate(${-ang}rad)`;
    $('dmgDir').appendChild(el); HUD.dmgArcs.push({ el, t: 1.2 });
  }
}
function hudDeath(killerId, w, hs) {
  $('deathScreen').hidden = false;
  $('dsBy').innerHTML = killerId ? `by <b>${escapeHtml(nameOf(killerId))}</b> · ${WEAPONS[w] ? WEAPONS[w].name : ''}${hs ? ' · <span style="color:#d24a3a">HEADSHOT</span>' : ''}` : '';
  HUD.deathT = 4;
}
function hudRespawn() { $('deathScreen').hidden = true; HUD.deathT = 0; }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
function hudKillFeed(k, v, w, hs) {
  const el = document.createElement('div');
  const mine = k === NET.myId || v === NET.myId;
  if (mine) el.className = 'me';
  const wn = WEAPONS[w] ? WEAPONS[w].name : (w === 'fall' ? 'fall' : '');
  el.innerHTML = k ? `${escapeHtml(nameOf(k))}<em>${escapeHtml(wn)}</em>${escapeHtml(nameOf(v))}${hs ? '<span class="hs">HS</span>' : ''}` : `${escapeHtml(nameOf(v))}<em>died</em>`;
  $('killfeed').prepend(el); HUD.feed.push({ el, t: 6 });
  while ($('killfeed').children.length > 6) $('killfeed').lastChild.remove();
}
function hudFeedText(txt, t = 4) { const el = document.createElement('div'); el.textContent = txt; el.style.borderLeftColor = '#8d927f'; $('killfeed').prepend(el); HUD.feed.push({ el, t }); }
function hudCenter(txt, t = 2) { const c = $('centerMsg'); c.textContent = txt; c.style.opacity = 1; HUD.centerT = t; }
let _sbT = 0, _tnT = 0;
function hudTick(dt) {
  const w = curW();
  if (w) {
    $('weaponName').textContent = w.def.name + (w.mods.optic !== 'iron' && OPTICS[w.mods.optic] ? ' · ' + OPTICS[w.mods.optic].name.split(' ')[0] : '');
    $('ammoMag').textContent = PL.reloading && PL.reloadKind === 'mag' ? '--' : w.ammo;
    $('ammoRes').textContent = '/ ' + w.reserve;
    $('ammo').classList.toggle('low', w.ammo <= Math.ceil(w.def.mag * 0.2));
    $('fireMode').textContent = PL.reloading ? 'RELOADING' : w.def.kind === 'bolt' ? 'BOLT' : w.def.kind === 'pump' ? 'PUMP' : w.mode.toUpperCase();
  }
  const hp = Math.max(0, PL.hp);
  $('hpFill').style.width = hp + '%'; $('hpText').textContent = Math.ceil(hp);
  $('hpFill').style.background = hp < 35 ? 'linear-gradient(90deg,#8a2a20,#d24a3a)' : '';
  const me = NET.players[NET.myId]; $('kd').textContent = `K ${me ? me.k : PL.kills} · D ${me ? me.d : PL.deaths}`;
  // crosshair opens with movement and closes while aiming
  const ch = $('crosshair'), moving = Math.hypot(PL.vel.x, PL.vel.z);
  const gap = 4 + (w ? lerp(w.def.spreadHip, w.def.spreadAds, PL.adsT) : 2) * 2.4 * (moving > 1 ? 1.6 : 1) * (PL.onGround ? 1 : 2);
  const ci = ch.children;
  ci[0].style.top = (-gap - 7) + 'px'; ci[1].style.top = gap + 'px'; ci[2].style.left = (-gap - 7) + 'px'; ci[3].style.left = gap + 'px';
  ch.style.opacity = PL.alive ? clamp(1 - PL.adsT * 1.6, 0, 1) * (PL.sprintT > 0.5 ? 0.3 : 1) : 0;
  $('scopeOverlay').style.opacity = PL.scoped ? 1 : 0;
  // hit marker, vignette, damage arcs, feed, centre message
  HUD.hitT -= dt; $('hitmarker').style.opacity = HUD.hitT > 0 ? 1 : 0;
  HUD.vigT = Math.max(0, HUD.vigT - dt); $('vignette').style.opacity = Math.max(HUD.vigT * 1.4, PL.alive && PL.hp < 40 ? (40 - PL.hp) / 60 : 0);
  HUD.dmgArcs = HUD.dmgArcs.filter(a => { a.t -= dt; a.el.style.opacity = clamp(a.t, 0, 1); if (a.t <= 0) { a.el.remove(); return false; } return true; });
  HUD.feed = HUD.feed.filter(f => { f.t -= dt; if (f.t < 1) f.el.style.opacity = clamp(f.t, 0, 1); if (f.t <= 0) { f.el.remove(); return false; } return true; });
  if (HUD.centerT > 0) { HUD.centerT -= dt; if (HUD.centerT <= 0) $('centerMsg').style.opacity = 0; }
  // death countdown → respawn
  if (!PL.alive && GAME.running && HUD.deathT > 0) {
    HUD.deathT -= dt; $('dsTimer').textContent = 'Respawning in ' + Math.max(0, HUD.deathT).toFixed(1) + 's';
    if (HUD.deathT <= 0) respawn();
  }
  // scoreboard (Tab)
  const sb = $('scoreboard'), show = !!INPUT.keys.Tab;
  sb.hidden = !show;
  if (show && (_sbT -= dt) <= 0) {
    _sbT = 0.25;
    const rows = [];
    if (Object.keys(NET.players).length) for (const id in NET.players) { const p = NET.players[id]; rows.push({ id, name: p.name, outfit: p.outfit, k: p.k, d: p.d }); }
    else rows.push({ id: 'me', name: PROFILE.name || 'You', outfit: PL.outfit, k: PL.kills, d: PL.deaths });
    rows.sort((a, b) => b.k - a.k || a.d - b.d);
    $('sbBody').innerHTML = rows.map(r => `<tr class="${r.id === NET.myId || r.id === 'me' ? 'me' : ''}"><td><span class="dot" style="background:${(OUTFITS[r.outfit] || OUTFITS.ranger).base}"></span>${escapeHtml(r.name)}</td><td>${r.k}</td><td>${r.d}</td><td>${(r.k / Math.max(1, r.d)).toFixed(2)}</td></tr>`).join('');
  }
  // name of whoever is under the crosshair (only if you can actually see them)
  if ((_tnT -= dt) <= 0) {
    _tnT = 0.12; let txt = '';
    if (PL.alive && REMOTES.size) {
      const d = new V3(); CAMERA.getWorldDirection(d);
      const h = traceShot(CAMERA.position, d, 60);
      if (h && h.player) { const r = REMOTES.get(h.player); if (r) txt = r.name; }
    }
    $('targetName').textContent = txt;
  }
  $('pauseCode').textContent = NET.online && NET.code ? 'Code: ' + NET.code + '  (click to copy)' : 'Offline practice';
}
