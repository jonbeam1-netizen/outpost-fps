'use strict';
// ---------- Game modes: free-for-all, or Last Sniper Standing (one life each, last alive wins the round) ----------
// The host runs the rounds and tells everyone; each player still owns their own health and death.
const ROUND = { mode: 'ffa', state: 'idle', n: 0, t: 0, winner: null, tagT: 0, spectating: false };
const LMS_BREAK = 6, LMS_COUNT = 3;
const roundCanRespawn = () => ROUND.mode !== 'lms';
const modeName = m => m === 'lms' ? 'LAST SNIPER STANDING' : 'FREE-FOR-ALL';

// anyone (the host acts, clients ask the host)
function setGameMode(mode) {
  mode = mode === 'lms' || mode === 'last' ? 'lms' : 'ffa';
  if (!NET.host) { netOut({ t: 'cmd', c: 'mode', m: mode }); return; }
  if (mode === ROUND.mode) { hudFeedText('Mode is already ' + modeName(mode)); return; }
  ROUND.mode = mode; ROUND.n = 0;
  if (mode === 'lms') { ROUND.state = 'over'; ROUND.t = LMS_COUNT; ROUND.winner = null; }
  else ROUND.state = 'idle';
  roundSend({ t: 'round', mode, state: ROUND.state, n: 0, cd: ROUND.t });
}
// who's in the fight right now (players + bots), alive or not
const roundAliveList = () => matchBodies(null).map(b => b.id);
function roundSend(m) { m.wins = roundWins(); netBroadcast(m); clientReceive(m); }
function roundWins() { const w = {}; for (const id in NET.players) w[id] = NET.players[id].w || 0; return w; }
// host: start a round — everyone drops in fresh, pickups reset
function roundStart() {
  ROUND.state = 'live'; ROUND.n++; ROUND.winner = null;
  pickupsInit();
  BOTS.forEach(b => botRespawn(b));
  roundSend({ t: 'round', mode: 'lms', state: 'live', n: ROUND.n, pk: pickupSnapshot() });
}
// host, every frame
function roundTick(dt) {
  // the little mode line under the game code (everyone)
  if ((ROUND.tagT -= dt) <= 0) {
    ROUND.tagT = 0.4;
    const base = NET.online ? (NET.host ? 'HOSTING  ' + NET.code + ' (share this code)' : 'IN GAME  ' + NET.code) : 'OFFLINE PRACTICE';
    let extra = '';
    if (ROUND.mode === 'lms') extra = ROUND.state === 'live' ? `  ·  ROUND ${ROUND.n} · ${roundAliveList().length} ALIVE` : ROUND.state === 'wait' ? '  ·  WAITING FOR PLAYERS' : '  ·  NEXT ROUND SOON';
    $('codeTag').textContent = base + '  ·  ' + modeName(ROUND.mode) + extra;
  }
  if (!NET.host || ROUND.mode !== 'lms') return;
  const players = Object.keys(NET.players).length;
  if (ROUND.state === 'live') {
    const alive = roundAliveList();
    if (players < 2) { ROUND.state = 'wait'; roundSend({ t: 'round', mode: 'lms', state: 'wait', n: ROUND.n }); return; }
    if (alive.length <= 1) {
      const w = alive[0] || null;
      if (w && NET.players[w]) NET.players[w].w = (NET.players[w].w || 0) + 1;
      ROUND.state = 'over'; ROUND.t = LMS_BREAK;
      roundSend({ t: 'round', mode: 'lms', state: 'over', n: ROUND.n, w, cd: LMS_BREAK });
    }
  } else if (ROUND.state === 'over') {
    if ((ROUND.t -= dt) <= 0) { if (players >= 2) roundStart(); else { ROUND.state = 'wait'; roundSend({ t: 'round', mode: 'lms', state: 'wait', n: ROUND.n }); } }
  } else if (ROUND.state === 'wait' && players >= 2) { ROUND.state = 'over'; ROUND.t = LMS_COUNT; roundSend({ t: 'round', mode: 'lms', state: 'over', n: ROUND.n, cd: LMS_COUNT }); }
}
// everyone: the host announced a change
function roundApply(m, joining) {
  const prevMode = ROUND.mode;
  ROUND.mode = m.mode === 'lms' ? 'lms' : 'ffa'; ROUND.state = m.state; ROUND.n = m.n | 0; ROUND.tagT = 0;
  if (m.wins) for (const id in m.wins) if (NET.players[id]) NET.players[id].w = m.wins[id];
  if (ROUND.mode === 'ffa') {
    ROUND.spectating = false;
    if (prevMode === 'lms' && !joining) hudCenter('FREE-FOR-ALL', 2.5);
    if (GAME.running && !PL.alive) { HUD.deathT = HUD.deathT > 0 ? Math.min(HUD.deathT, 1.5) : 1.5; HUD.deathMax = HUD.deathMax || 4; $('deathScreen').hidden = false; }   // back in the fight shortly
    return;
  }
  if (m.state === 'live') {
    ROUND.spectating = false;
    if (m.pk && !NET.host) pickupApplySnapshot(m.pk);
    if (GAME.running) { if (typeof kcEnd === 'function') kcEnd(); respawn(); }
    hudCenter('ROUND ' + ROUND.n + ' · ONE LIFE · LAST SNIPER STANDING', 3);
  } else if (m.state === 'over') {
    const w = m.w;
    if (w) hudCenter((w === NET.myId ? 'YOU ARE' : nameOf(w) + ' IS') + ' THE LAST SNIPER STANDING', 4);
    else if (m.n > 0) hudCenter('NOBODY SURVIVED', 3);
    else hudCenter('LAST SNIPER STANDING · FIRST ROUND IN ' + (m.cd | 0) + 's', 3);
  } else if (m.state === 'wait') hudCenter('LAST SNIPER STANDING · WAITING FOR A SECOND PLAYER (or /addbot)', 4);
  // joined while a round is on: watch until the next one
  if (joining && m.state === 'live') { ROUND.spectating = true; spectateNow(); }
}
function spectateNow() {
  PL.alive = false; PL.deathTime = performance.now(); PL.killerId = null; HUD.deathT = 0;
  if (VM.root) VM.root.visible = false;
  hudCenter('ROUND IN PROGRESS · YOU DROP IN NEXT ROUND', 4);
}
// death screen line while waiting out a round
function roundDeadText() {
  if (ROUND.mode !== 'lms') return '';
  return ROUND.state === 'live' ? 'ELIMINATED · ' + roundAliveList().length + ' LEFT · NEXT ROUND WHEN ONE REMAINS' : 'NEXT ROUND STARTING…';
}
