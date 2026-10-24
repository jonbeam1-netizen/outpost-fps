'use strict';
// ---------- Menus, settings, loadout, HUD ----------
const store = { get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
const SETTINGS = Object.assign({ vol: 10, sens: 1, adsSens: 0.8, fov: 70, shadows: 2, scale: 1, grass: 1, grain: 1, post: 1, aimMode: 'hold', invert: 0, fullscreen: 1 }, store.get('outpost-settings', {}));
if (!SETTINGS.fovV) { if (SETTINGS.fov === 80) SETTINGS.fov = 70; SETTINGS.fovV = 1; }   // FOV is vertical now: the old default 80 was ~115° wide
const PROFILE = Object.assign({ name: '', outfit: 'woodland', skin: 0 }, store.get('holdover-profile', {}));
if (!OUTFITS[PROFILE.outfit]) PROFILE.outfit = Object.keys(OUTFITS)[0];
const LOADOUT = Object.assign({ primary: 'awm', mods: {} }, store.get('holdover-loadout', {}));
if (!WEAPONS[LOADOUT.primary] || !PRIMARIES.includes(LOADOUT.primary)) LOADOUT.primary = PRIMARIES[0];
// drop saved mods that no longer fit the gun
PRIMARIES.forEach(id => { const d = WEAPONS[id], m = Object.assign({}, d.def, LOADOUT.mods[id] || {}); for (const k in d.slots) if (!d.slots[k].includes(m[k])) m[k] = d.def[k]; LOADOUT.mods[id] = m; });
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
  bind('sGrain', 'grain', null, v => v, v => parseInt(v, 10));
  bind('sPost', 'post', null, v => v, v => parseInt(v, 10));
  bind('sAimMode', 'aimMode', null, v => v, v => v);
  bind('sInvert', 'invert', null, v => v, v => parseInt(v, 10));
  bind('sFull', 'fullscreen', null, v => v, v => parseInt(v, 10));
  let back = 'menu';
  const open = from => { back = from; $('settings').hidden = false; };
  $('btnSettings').onclick = () => open('menu');
  $('btnPauseSettings').onclick = () => open('pause');
  $('btnSetBack').onclick = () => { $('settings').hidden = true; };
  // in-game Esc is handled by main.js; on the main menu let Esc close the panel too
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !GAME.running && !$('settings').hidden) { $('settings').hidden = true; $('btnSettings').focus(); } });
}

// ---------- Main menu: callsign, outfit, loadout with a turntable preview ----------
let PREV = null;
function menuUI() {
  const nameIn = $('nameIn'); nameIn.value = PROFILE.name;
  nameIn.addEventListener('input', () => { PROFILE.name = nameIn.value.trim().slice(0, 14); store.set('holdover-profile', PROFILE); });
  const op = $('outfitPick');
  Object.keys(OUTFITS).forEach(k => {
    const o = OUTFITS[k], b = document.createElement('button'); b.type = 'button'; b.title = o.name + ' ghillie suit'; b.dataset.k = k;
    const sw = document.createElement('span'); sw.className = 'sw'; sw.style.background = suitSwatch(o);
    const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = o.name;
    b.append(sw, nm);
    b.onclick = () => { PROFILE.outfit = k; PL.outfit = k; store.set('holdover-profile', PROFILE); markOutfit(); };
    op.appendChild(b);
  });
  const markOutfit = () => { op.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.k === PROFILE.outfit))); $('outfitName').textContent = OUTFITS[PROFILE.outfit].name; };
  markOutfit(); PL.outfit = PROFILE.outfit; PL.skin = PROFILE.skin;
  // gun list
  const gl = $('gunList');
  PRIMARIES.forEach(id => {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.id = id; b.title = WEAPONS[id].name + ' · ' + WEAPONS[id].cal;
    b.innerHTML = `${escapeHtml(shortGun(id))}<small>${escapeHtml(WEAPONS[id].cal.split(' ')[0])}</small>`;
    b.onclick = () => { LOADOUT.primary = id; saveLoadout(); refreshLoadout(); };
    gl.appendChild(b);
  });
  $('btnHost').onclick = () => { SFX.init(); applySettings(); netStatus('Starting…'); netHost(); };
  $('btnJoin').onclick = () => { SFX.init(); applySettings(); netJoin($('codeIn').value); };
  $('btnPractice').onclick = () => { SFX.init(); applySettings(); netStatus(''); startOffline(); };
  $('codeIn').addEventListener('keydown', e => { if (e.key === 'Enter') { SFX.init(); applySettings(); netJoin($('codeIn').value); } e.stopPropagation(); });
  $('codeIn').addEventListener('input', e => { const el = e.target, v = el.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''); if (v !== el.value) el.value = v; });
  // sidearm + melee are fixed: show them as cards
  const side = (slot, id, extra) => { const d = WEAPONS[id]; return d ? `<div><small>${slot}</small><b>${escapeHtml(d.name)}</b><span>${extra(d)}</span></div>` : ''; };
  $('gunSide').innerHTML = side('SIDEARM · 2', 'deagle', d => `${d.mag}-round mag · ${d.cal}`) + side('MELEE · 3 / V', 'knife', () => 'One stab kills, plates or not');
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
// a camo blot made from the suit's palette, so the picker looks like cloth rather than two flat colours
function suitSwatch(o) {
  const p = o.pal || [o.base, o.c1];
  const blots = [];
  for (let i = 0; i < p.length * 2; i++) { const x = (i * 37 + 11) % 100, y = (i * 59 + 23) % 100, r = 7 + (i * 7) % 10; blots.push(`radial-gradient(ellipse ${r * 1.6}% ${r * 2.2}% at ${x}% ${y}%, ${p[(i * 3) % p.length]} 0 55%, transparent 62%)`); }
  return blots.join(',') + `, linear-gradient(135deg, ${o.base}, ${o.c1})`;
}
const shortGun = id => ({ m200: 'CheyTac M200', m82: 'Barrett M82' })[id] || WEAPONS[id].name;
// swap guns right away if you haven't joined the fight yet; otherwise it waits for the next respawn
function applyLoadoutNow() {
  if (!GAME.running || !PL.alive) return;
  const fresh = performance.now() - PL.spawnTime < 15000 && PL.hp >= 100 && PL.weapons.every(w => w.def.melee || w.ammo === w.def.mag);
  if (fresh) { equipLoadout(LOADOUT); hudCenter('LOADOUT APPLIED', 1.5); }
  else hudCenter('LOADOUT APPLIES ON NEXT RESPAWN', 2);
}
function saveLoadout() { store.set('holdover-loadout', LOADOUT); }
function refreshLoadout() {
  const id = LOADOUT.primary, def = WEAPONS[id], mods = LOADOUT.mods[id];
  $('gunList').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.id === id)));
  $('gunTitle').textContent = def.name; $('gunDesc').textContent = def.desc; $('gunCal').textContent = def.cal.toUpperCase();
  // mod slots
  const ms = $('modSlots'); ms.innerHTML = '';
  [['optic', 'Scope', OPTICS], ['muzzle', 'Muzzle', MUZZLES], ['under', 'Underbarrel', UNDER]].forEach(([slot, label, table]) => {
    const opts = def.slots[slot]; if (!opts || opts.length < 2) return;
    const l = document.createElement('label'); l.textContent = label; l.className = 'mod';
    const s = document.createElement('select');
    opts.forEach(o => { const op = document.createElement('option'); op.value = o; op.textContent = table[o].name; s.appendChild(op); });
    s.value = mods[slot]; s.onchange = () => { mods[slot] = s.value; saveLoadout(); refreshLoadout(); };
    l.appendChild(s); ms.appendChild(l);
  });
  // stats
  const st = $('gunStats'); st.innerHTML = '';
  const opt = OPTICS[mods.optic];
  const rows = [
    ['Body damage', def.dmg.chest, 100, def.dmg.chest + ' · head kills'],
    ['Velocity', def.vel, 800, def.vel + ' m/s'],
    ['Drop @300m', dropAngle(def.vel, 300) * 1000, 6, (dropAngle(def.vel, 300) * 1000).toFixed(1) + ' mil'],
    ['Fire rate', def.rpm, 160, def.kind === 'bolt' ? 'bolt' : def.rpm + ' rpm'],
    ['Recoil', def.recoil.v, 8, def.recoil.v.toFixed(1)],
    ['Capacity', def.mag, 10, def.mag],
    ['Zoom', opt ? opt.zoom[1] : 1, 35, opt ? opt.zoom[0] + (opt.zoom[1] > opt.zoom[0] ? '–' + opt.zoom[1] : '') + 'x' : '—'],
    ['Mobility', def.move, 1.05, Math.round(def.move * 100)],
  ];
  rows.forEach(([n, v, max, txt]) => { st.insertAdjacentHTML('beforeend', `<span>${n}</span><div class="bar"><i style="width:${clamp(v / max, 0.04, 1) * 100}%"></i></div><span class="v">${txt}</span>`); });
  // model
  if (PREV) {
    if (PREV.model) { PREV.pivot.remove(PREV.model.group); PREV.model.group.traverse(o => { if (o.isMesh) o.geometry.dispose(); }); }
    PREV.model = buildGun(id, mods, false);
    const g = PREV.model.group; PREV.pivot.add(g);
    const bb = new THREE.Box3().setFromObject(g), c = bb.getCenter(new V3()), size = bb.getSize(new V3());
    g.position.sub(c);
    const len = Math.max(size.z, size.y * 1.6);
    PREV.cam.position.set(len * 1.75, len * 0.3, 0); PREV.cam.lookAt(0, 0, 0);
  }
}
function previewTick(dt) {
  if (!PREV || $('menu').hidden) return;
  PREV.t += dt; PREV.pivot.rotation.y = Math.sin(PREV.t * 0.35) * 0.7; PREV.pivot.rotation.x = Math.sin(PREV.t * 0.5) * 0.05;
  PREV.r.render(PREV.sc, PREV.cam);
}
function showMenu(ingame) {
  GAME.menuIngame = ingame; $('menu').hidden = false;
  $('menu').classList.toggle('ingame', !!ingame); $('menuLeft').hidden = !!ingame;
  $('menu').scrollTop = 0;
  let done = $('btnLoadDone');
  if (ingame) {
    if (!done) { done = document.createElement('button'); done.id = 'btnLoadDone'; done.className = 'primary'; done.textContent = 'DONE'; done.onclick = () => { $('menu').hidden = true; $('pause').hidden = false; $('btnResume').focus(); applyLoadoutNow(); }; document.querySelector('.loadout').appendChild(done); }
    done.hidden = false;
  } else if (done) done.hidden = true;
}

// ---------- Pause ----------
function pauseUI() {
  $('btnResume').onclick = () => { $('pause').hidden = true; lockPointer(); };
  $('btnLoadout').onclick = () => { $('pause').hidden = true; showMenu(true); refreshLoadout(); };
  $('btnLeave').onclick = () => leaveToMenu();
  $('btnAddBot').onclick = () => addBots(1);
  $('gameMode').onchange = e => setGameMode(e.target.value);
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
  if (text[0] !== '/') { netOut({ t: 'chat', text }); return; }   // offline practice is a host, so the host code echoes it back
  const [c, arg] = text.slice(1).toLowerCase().split(/\s+/);
  const n = arg === 'all' ? 'all' : clamp(parseInt(arg, 10) || 1, 1, 10);
  if (c === 'addbot' || c === 'addbots' || c === 'bot') addBots(n === 'all' ? BOTCFG.max : n);
  else if (c === 'removebot' || c === 'removebots' || c === 'kickbot') removeBots(n);
  else if (c === 'botdiff' || c === 'difficulty') { setBotDiff(arg); if (BOT_DIFF[arg]) $('botDiff').value = arg; }
  else if (c === 'mode') { if (arg === 'lms' || arg === 'last' || arg === 'ffa') setGameMode(arg); else hudFeedText('/mode lms (last sniper standing) or /mode ffa'); }
  else if (c === 'help') hudFeedText('/addbot [n] · /removebot [n|all] · /botdiff easy|normal|hard', 8);
  else hudFeedText('Unknown command. Try /help');
}
function hudChat(id, text) {
  const el = document.createElement('div'); el.className = 'chat';
  el.innerHTML = `<b>${escapeHtml(nameOf(id))}</b>${escapeHtml(text)}`;
  $('killfeed').prepend(el); HUD.feed.push({ el, t: 8 });
  while ($('killfeed').children.length > 7) $('killfeed').lastChild.remove();
}
function lockPointer() {
  const c = $('view');
  const grab = () => { try { const p = c.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) {} };
  // Fullscreen + keyboard lock (Chrome/Edge) sends Ctrl+W and friends to the game instead of closing the tab
  grab();   // first, while the click still counts as a user gesture
  if (SETTINGS.fullscreen && !document.fullscreenElement && document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen({ navigationUI: 'hide' })
      .then(() => { if (navigator.keyboard && navigator.keyboard.lock) navigator.keyboard.lock().catch(() => {}); if (!document.pointerLockElement) grab(); })
      .catch(() => {});
  }
}
function releaseFullscreen() {
  try { if (navigator.keyboard && navigator.keyboard.unlock) navigator.keyboard.unlock(); } catch (e) {}
  try { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); } catch (e) {}
}
// With the keyboard locked, Esc reaches the page instead of the browser, so pause ourselves
const keyboardLocked = () => !!(document.fullscreenElement && navigator.keyboard && navigator.keyboard.lock);

// ---------- Game start / leave ----------
function startGame() {
  if (GAME.running) return;
  GAME.running = true;
  $('menu').hidden = true; $('hud').hidden = false; $('pause').hidden = true;
  PL.outfit = PROFILE.outfit; PL.skin = PROFILE.skin; PL.kills = 0; PL.deaths = 0;
  $('codeTag').textContent = NET.online ? (NET.host ? 'HOSTING  ' + NET.code + '  · friends join with this code' : 'IN GAME  ' + NET.code) : 'OFFLINE PRACTICE';
  if (NET.host) pickupsInit();
  respawn();
  lockPointer();
  SFX.ambient(true);
  hudCenter(NET.online ? 'FREE-FOR-ALL · stay low, watch for glint' : 'Practice — /addbot 4 for targets, host a game to play with friends', 4);
}
// offline practice acts as a host with nobody connected, so bots work the same way
function startOffline() {
  NET.online = false; NET.host = true; NET.myId = 'me';
  NET.players = { me: Object.assign(myProfile(), { k: 0, d: 0 }) };
  startGame();
}
function leaveToMenu(msg) {
  ROUND.mode = 'ffa'; ROUND.state = 'idle'; ROUND.spectating = false; $('gameMode').value = 'ffa';
  netLeave(); GAME.running = false; PL.alive = false; closeCmd(); pickupsClear(); PROJ.forEach(pr => { if (pr.fx && pr.fx.end) pr.fx.end(); }); PROJ.length = 0; SFX.ambient(false); SFX.heartbeat(0);
  try { document.exitPointerLock(); } catch (e) {}
  releaseFullscreen();
  $('hud').hidden = true; $('pause').hidden = true; $('deathScreen').hidden = true; showMenu(false);
  if (VM.root) VM.root.visible = false;
  netStatus(msg || '');
}

// ---------- HUD ----------
const HUD = { hitT: 0, vigT: 0, centerT: 0, feed: [], dmgArcs: [], deathT: 0, deathMax: 4, stK: '', pipK: '' };
// stance silhouettes for the HUD: standing, crouched, prone
const STANCE_SVG = [
  '<circle cx="8" cy="3" r="2.2"/><path d="M8 6v6.5M8 12.5l-3 6M8 12.5l3 6M8 7.5l-3.5 3.5M8 7.5l3.5 3.5"/>',
  '<circle cx="9" cy="7" r="2.2"/><path d="M8.5 10l-2 5M6.5 15l5 .5 -1 3.5M6.5 15l-1.5 3.5M8.5 11l3.5 1.5"/>',
  '<circle cx="2.8" cy="14.2" r="2.2"/><path d="M5 15.5h6.5l4 2.5M5 15.5l3 2.5"/>',
].map(p => `<svg viewBox="0 0 16 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p.replace('<circle', '<circle fill="currentColor" stroke="none"')}</svg>`);
function nameOf(id) {
  if (!id) return 'the world';
  if (id === NET.myId || (!NET.online && id === 'me')) return 'You';
  const p = NET.players[id]; return p ? p.name : 'Someone';
}
function hudHit(head, kill) {
  const h = $('hitmarker'); h.classList.toggle('kill', !!kill); h.classList.toggle('head', !!head && !kill); HUD.hitT = kill ? 0.35 : head ? 0.22 : 0.16;
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
  const kd = killerDistance(killerId);
  const wn = WEAPONS[w] ? WEAPONS[w].name : w === 'fall' ? 'Fall' : '';
  const meta = [wn && `<span><small>WEAPON</small>${escapeHtml(wn)}</span>`, kd && `<span><small>RANGE</small>${kd} m</span>`, hs && '<span class="hs">HEADSHOT</span>'].filter(Boolean).join('');
  $('dsBy').innerHTML = (killerId && killerId !== NET.myId
    ? `<div class="who">KILLED BY<b>${escapeHtml(nameOf(killerId))}</b></div>`
    : `<div class="who"><b>${w === 'fall' ? 'You fell' : 'You died'}</b></div>`) + (meta ? `<div class="meta">${meta}</div>` : '');
  HUD.deathT = HUD.deathMax = 4;
  if (typeof kcBegin === 'function') kcBegin(killerId, w, hs);   // kill-cam: decide now whether the fatal round can be replayed
}
function hudRespawn() { if (typeof kcEnd === 'function') kcEnd(); $('deathScreen').hidden = true; HUD.deathT = 0; }
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
function hudFeedText(txt, t = 4) { const el = document.createElement('div'); el.textContent = txt; el.style.borderRightColor = '#8d927f'; $('killfeed').prepend(el); HUD.feed.push({ el, t }); }
function hudCenter(txt, t = 2) { const c = $('centerMsg'); c.textContent = txt; c.style.opacity = 1; HUD.centerT = t; }
function killerDistance(id) { const r = REMOTES.get(id); return r && r.state ? Math.round(r.state.pos.distanceTo(PL.pos)) : 0; }
// hearts and plates: four hearts of 25, two plates of 25, each drawn partly full
function hudVitals() {
  const hearts = $('hearts'), plates = $('plates');
  if (!hearts.children.length) { for (let i = 0; i < 4; i++) hearts.insertAdjacentHTML('beforeend', '<i class="heart"><b></b></i>'); for (let i = 0; i < 2; i++) plates.insertAdjacentHTML('beforeend', '<i class="plate"><b></b></i>'); }
  const hp = Math.max(0, PL.hp), ar = Math.max(0, PL.armor);
  for (let i = 0; i < 4; i++) { const f = clamp((hp - i * 25) / 25, 0, 1); hearts.children[i].firstChild.style.height = (f * 100) + '%'; hearts.children[i].classList.toggle('empty', f <= 0); }
  for (let i = 0; i < 2; i++) { const f = clamp((ar - i * 25) / 25, 0, 1); plates.children[i].firstChild.style.height = (f * 100) + '%'; plates.children[i].classList.toggle('empty', f <= 0); }
  hearts.classList.toggle('low', hp <= 25 && PL.alive);
}
// ---------- Scope: the reticle is drawn in angles, so range marks line up with where rounds really land ----------
let _scW = 0, _scH = 0, _scWas = false, _rngT = 0, _rng = 0;
function drawScope(dt) {
  const cv = $('scope'), g = VM.gun, w = curW();
  const on = PL.alive && PL.scoped && g && g.optic;
  if (!on) { if (_scWas) { cv.getContext('2d').clearRect(0, 0, cv.width, cv.height); $('scopeInfo').style.opacity = 0; _scWas = false; } return; }
  _scWas = true;
  const W = window.innerWidth, H = window.innerHeight;
  if (W !== _scW || H !== _scH) { cv.width = W; cv.height = H; _scW = W; _scH = H; }
  const c = cv.getContext('2d'), cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.47;
  const ppr = (H / 2) / Math.tan(CAMERA.fov * Math.PI / 360), mil = ppr * 0.001;   // pixels per milliradian
  c.clearRect(0, 0, W, H);
  // tube: black outside, a soft dark ring at the edge of the glass (the eyebox shifts a little with sway)
  const ex = cx + PL.sx * ppr * 0.6, ey = cy + PL.sy * ppr * 0.6;
  c.fillStyle = '#000'; c.beginPath(); c.rect(0, 0, W, H); c.arc(ex, ey, R, 0, TAU, true); c.fill();
  const vg = c.createRadialGradient(ex, ey, R * 0.8, ex, ey, R); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.88)');
  c.fillStyle = vg; c.beginPath(); c.arc(ex, ey, R, 0, TAU); c.fill();
  c.save(); c.beginPath(); c.arc(ex, ey, R, 0, TAU); c.clip();
  const vel = muzzleVel(w), kind = g.optic.reticle;
  const ink = 'rgba(8,8,8,0.92)', thin = Math.max(1, H / 900);
  const line = (x0, y0, x1, y1, lw = thin) => { c.lineWidth = lw; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); };
  const dot = (x, y, r) => { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); };
  c.strokeStyle = ink; c.fillStyle = ink; c.font = `${Math.round(clamp(H / 70, 10, 16))}px "Share Tech Mono", monospace`;
  const marks = [200, 300, 400, 500].map(d => ({ d, y: cy + dropAngle(vel, d) * ppr }));
  if (kind === 'mildot') {
    line(cx - R, cy, cx + R, cy); line(cx, cy - R, cx, cy + R);
    const post = Math.max(3, thin * 4); line(cx - R, cy, cx - 10 * mil, cy, post); line(cx + 10 * mil, cy, cx + R, cy, post); line(cx, cy + 10 * mil, cx, cy + R, post); line(cx, cy - R, cx, cy - 10 * mil, post);
    for (let i = 1; i <= 9; i++) { const r = Math.max(1.5, mil * 0.12); dot(cx + i * mil, cy, r); dot(cx - i * mil, cy, r); dot(cx, cy + i * mil, r); dot(cx, cy - i * mil, r); }
    c.textAlign = 'left'; marks.forEach(m => { if (m.y - cy > 6) { line(cx + mil * 0.4, m.y, cx + mil * 1.2, m.y); c.fillText(m.d, cx + mil * 1.2 + 4, m.y + 4); } });
  } else if (kind === 'tree') {
    line(cx - R, cy, cx + R, cy); line(cx, cy - R, cx, cy + R);
    for (let i = 1; i <= 12; i++) {
      const y = cy + i * mil, half = Math.min(6, 1 + i * 0.5) * mil;
      line(cx - half, y, cx + half, y, thin * 0.8);
      for (let k = 1; k * mil <= half; k++) { dot(cx - k * mil, y, Math.max(1, thin)); dot(cx + k * mil, y, Math.max(1, thin)); }
      if (i % 2 === 0) { c.textAlign = 'right'; c.fillText(i, cx - half - 6, y + 4); }
    }
    for (let i = 1; i <= 10; i++) { const t = mil * (i % 5 ? 0.25 : 0.6); line(cx + i * mil, cy - t, cx + i * mil, cy + t); line(cx - i * mil, cy - t, cx - i * mil, cy + t); }
    c.fillStyle = 'rgba(200,30,20,0.95)'; dot(cx, cy, Math.max(1.5, thin * 1.6)); c.fillStyle = ink;
    c.textAlign = 'left'; marks.forEach(m => { if (m.y - cy > 6) { line(cx + mil * 7.5, m.y, cx + mil * 9, m.y); c.fillText(m.d + 'm', cx + mil * 9 + 4, m.y + 4); } });
  } else if (kind === 'pso') {
    // the PSO-1: a chevron to aim with, holdover chevrons below, the rangefinder curve bottom-left
    const ch = (y, s, lw) => { c.lineWidth = lw; c.beginPath(); c.moveTo(cx - s, y + s * 1.3); c.lineTo(cx, y); c.lineTo(cx + s, y + s * 1.3); c.stroke(); };
    ch(cy, mil * 1.2, thin * 2);
    marks.forEach(m => { if (m.y - cy > 6) { ch(m.y, mil * 0.6, thin * 1.2); c.textAlign = 'left'; c.fillText(m.d / 100, cx + mil * 1.2, m.y + mil * 0.8); } });
    for (let i = 1; i <= 10; i++) { line(cx - i * mil, cy, cx - i * mil, cy + mil * (i % 5 ? 0.5 : 1)); line(cx + i * mil, cy, cx + i * mil, cy + mil * (i % 5 ? 0.5 : 1)); }
    line(cx - 10 * mil, cy, cx - 1.5 * mil, cy, thin * 0.7); line(cx + 1.5 * mil, cy, cx + 10 * mil, cy, thin * 0.7);
    c.lineWidth = thin; c.beginPath(); for (let i = 0; i <= 20; i++) { const x = cx - mil * 12 + i * mil * 0.4, y = cy + mil * 6 - Math.pow(i / 20, 1.6) * mil * 2.5; if (i) c.lineTo(x, y); else c.moveTo(x, y); } c.stroke();
    line(cx - mil * 12, cy + mil * 6, cx - mil * 4, cy + mil * 6);
  } else {
    // LPVO: illuminated dot in a circle with stadia hashes
    const rr = Math.min(R * 0.6, 8 * mil);
    c.lineWidth = thin * 1.5; c.beginPath(); c.arc(cx, cy, rr, 0, TAU); c.stroke();
    line(cx - R, cy, cx - rr * 1.15, cy, thin * 3); line(cx + rr * 1.15, cy, cx + R, cy, thin * 3); line(cx, cy + rr * 1.15, cx, cy + R, thin * 3);
    marks.forEach(m => { if (m.y - cy > 4) line(cx - mil * 0.8, m.y, cx + mil * 0.8, m.y); });
    c.fillStyle = 'rgba(255,40,25,0.95)'; c.shadowColor = 'rgba(255,40,25,0.9)'; c.shadowBlur = 6; dot(cx, cy, Math.max(2, thin * 2)); c.shadowBlur = 0;
  }
  c.restore();
  // laser rangefinder readout
  if ((_rngT -= dt) <= 0) { _rngT = 0.15; const d = new V3(); CAMERA.getWorldDirection(d); const h = projTrace({ mode: 'me', owner: NET.myId }, CAMERA.position, d, 900); _rng = h ? Math.round(h.t) : 0; }   // people count, not just the wall behind them
  $('scopeInfo').style.opacity = 1;
  $('scopeZoom').textContent = w.zoom.toFixed(1) + 'x';
  $('scopeRange').textContent = _rng ? _rng + ' m' : '---';
  // holdover at the lasered range, in mils below the crosshair (rifles are zeroed at 100 m)
  const hold = _rng ? dropAngle(vel, _rng) * 1000 : 0;
  $('scopeHold').textContent = !_rng ? '---' : Math.abs(hold) < 0.1 ? '0.0' : (hold > 0 ? '▼ ' : '▲ ') + Math.abs(hold).toFixed(1);
}
let _sbT = 0, _tnT = 0;
function hudTick(dt) {
  const w = curW();
  if (w) {
    const d = w.def, opt = OPTICS[w.mods.optic];
    $('weaponName').textContent = d.name;
    $('ammoMag').textContent = d.melee ? '' : PL.reloading ? '--' : w.ammo;
    $('ammoRes').textContent = d.melee ? '' : '/ ' + w.reserve;
    $('ammo').classList.toggle('low', !d.melee && w.ammo <= Math.ceil(d.mag * 0.2));
    $('fireMode').textContent = d.melee ? 'ONE STAB KILLS' : PL.reloading ? 'RELOADING' : PL.cycleT > 0 ? 'CYCLING' : (opt ? opt.zoom[0] + (opt.zoom[1] > opt.zoom[0] ? '–' + opt.zoom[1] : '') + 'x · ' : '') + (d.kind === 'bolt' ? 'BOLT' : 'SEMI');
  }
  hudVitals();
  const bipod = !!(VM.gun && VM.gun.bipod && PL.stance && PL.still > 0.4 && PL.adsT > 0.5), stK = PL.stance + (bipod ? 'b' : '');
  if (stK !== HUD.stK) {
    HUD.stK = stK;
    $('stance').innerHTML = `<span class="st">${STANCE_SVG.map((s, i) => i === PL.stance ? s.replace('<svg', '<svg class="on"') : s).join('')}</span><span>${['STANDING', 'CROUCHED', 'PRONE'][PL.stance]}${bipod ? ' · <b class="bp">BIPOD</b>' : ''}</span>`;
  }
  // one pip per round in the magazine
  const pipK = w && !w.def.melee ? w.def.mag + ':' + (PL.reloading ? -1 : w.ammo) : '';
  if (pipK !== HUD.pipK) {
    HUD.pipK = pipK; let h = '';
    if (pipK) for (let i = 0; i < w.def.mag; i++) h += i < (PL.reloading ? 0 : w.ammo) ? '<i></i>' : '<i class="x"></i>';
    $('ammoPips').innerHTML = h;
  }
  $('hud').classList.toggle('critical', PL.alive && PL.hp <= 25);
  $('hud').classList.toggle('dead', !PL.alive);
  const me = NET.players[NET.myId]; $('kd').textContent = `K ${me ? me.k : PL.kills} · D ${me ? me.d : PL.deaths}`;
  // crosshair: wide open for a rifle from the hip, so you scope in to make the shot
  const ch = $('crosshair'), moving = Math.hypot(PL.vel.x, PL.vel.z);
  const gap = w && w.def.melee ? 3 : (w && w.def.pistol ? 7 : 22) * (moving > 1 ? 1.5 : 1) * (PL.onGround ? 1 : 2);
  const ci = ch.children;
  ci[0].style.top = (-gap - 7) + 'px'; ci[1].style.top = gap + 'px'; ci[2].style.left = (-gap - 7) + 'px'; ci[3].style.left = gap + 'px';
  ch.style.opacity = PL.alive ? clamp(1 - PL.adsT * 2, 0, 1) * (PL.sprintT > 0.5 ? 0.3 : 1) : 0;
  drawScope(dt);
  SFX.heartbeat(PL.alive && PL.hp <= 25 ? 1 : 0);
  // hit marker, vignette, damage arcs, feed, centre message
  HUD.hitT -= dt; $('hitmarker').style.opacity = HUD.hitT > 0 ? 1 : 0;
  HUD.vigT = Math.max(0, HUD.vigT - dt); $('vignette').style.opacity = Math.max(HUD.vigT * 1.4, PL.alive && PL.hp <= 25 ? 0.25 + 0.15 * Math.sin(performance.now() / 300) : 0);
  HUD.dmgArcs = HUD.dmgArcs.filter(a => { a.t -= dt; a.el.style.opacity = clamp(a.t, 0, 1); if (a.t <= 0) { a.el.remove(); return false; } return true; });
  HUD.feed = HUD.feed.filter(f => { f.t -= dt; if (f.t < 1) f.el.style.opacity = clamp(f.t, 0, 1); if (f.t <= 0) { f.el.remove(); return false; } return true; });
  if (HUD.centerT > 0) { HUD.centerT -= dt; if (HUD.centerT <= 0) $('centerMsg').style.opacity = 0; }
  // death countdown → respawn
  if (!PL.alive && GAME.running && (HUD.deathT > 0 || !roundCanRespawn())) {
    HUD.deathT -= dt;
    if (roundCanRespawn()) {
      $('dsTimer').textContent = 'REDEPLOY IN ' + Math.max(0, HUD.deathT).toFixed(1) + 's';
      $('dsBarFill').style.width = (clamp(1 - HUD.deathT / HUD.deathMax, 0, 1) * 100) + '%';
      if (HUD.deathT <= 0) respawn();
    } else { $('dsTimer').textContent = roundDeadText(); $('dsBarFill').style.width = '100%'; }   // one life: wait out the round
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
    $('sbBody').innerHTML = rows.map(r => `<tr class="${r.id === NET.myId || r.id === 'me' ? 'me' : ''}"><td><span class="dot" style="background:${(OUTFITS[r.outfit] || Object.values(OUTFITS)[0]).base}"></span>${escapeHtml(r.name)}${NET.players[r.id] && NET.players[r.id].w ? ' <span class="wins">★' + NET.players[r.id].w + '</span>' : ''}</td><td>${r.k}</td><td>${r.d}</td><td>${(r.k / Math.max(1, r.d)).toFixed(2)}</td></tr>`).join('');
  }
  // name of whoever is under the crosshair (only if you can actually see them)
  if ((_tnT -= dt) <= 0) {
    _tnT = 0.12; let txt = '';
    if (PL.alive && REMOTES.size) {
      const d = new V3(); CAMERA.getWorldDirection(d);
      const h = projTrace({ mode: 'me', owner: NET.myId }, CAMERA.position, d, 40);
      if (h && h.player && rayFoliage(CAMERA.position, d, h.t) < 0.8) { const r = REMOTES.get(h.player); if (r) txt = r.name; }   // no free name tags through bushes
    }
    $('targetName').textContent = txt;
  }
  $('pauseCode').textContent = NET.online && NET.code ? 'Code: ' + NET.code + '  (click to copy)' : 'Offline practice';
}
