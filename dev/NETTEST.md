# Two-peer netcode test — 2026-10-24

Setup: browser-pane tabs tab-12 = host "Alpha", tab-13 = client "Bravo" (plus a short-lived tab-18 "Charlie"),
http://localhost:8781/, scripts force-reloaded, rAF disabled and `frame()` driven by `setInterval(33)` in each tab
(timers are NOT throttled in these background tabs, so both peers ran in parallel at ~30 fps).
Real WebRTC via the public PeerJS broker worked. No BroadcastChannel fallback was needed.
No console errors or warnings in any tab for the whole session (console.error/warn and window 'error' were hooked).

## What passed
- Join: welcome, players list, REMOTES, names, outfit + skin (rejoined as desert/skin 2 -> host saw exactly that), gunKey, 18-can pickup snapshot (20 when 2 plates were up). Lowercase 4-char code ('b2hu') works.
- Remote state: stance 0/1/2, lean ±1, ads, scoped all arrive. Weapon swap awm -> deagle -> knife followed on the remote model (`knife|||`).
- Glint: Bravo prone + scoped at 40 m aiming at Alpha -> host `fxGlint` called each frame at strength 1.
- B -> A chest (AWM 85): A plates 50->0, hp 100->65. Blood on shooter (local) and victim (via 'fx'). A saw muzzle flash + projectile.
- B -> A headshot: kill, HEADSHOT · Alpha · 30 m on B, kill feed, k/d synced on both, A auto-respawned after 4 s.
- Knife (startMelee(true) at 1.2 m): KNIFED, A died, B back on the AWM.
- A (host) -> B chest: B plate 25->0, hp 100->40.
- Bots (host addBots(3)): B sees join, names, outfits, guns, movement, shots. B's hits land on host bots (100/50 -> 65/0). B headshot killed a bot, which respawned ~5 s later on B. Bots killed B and the host.
- Client `/addbot 2`, `/removebot 1` through the host work (host shows "Bravo used /addbot").
- Chat both ways. Scoreboard (Tab) on the client lists everyone including bots.
- Pickups: B walked into can a0 -> host granted it (reserve 0->20), hidden on both, back on both at 30 s. B took plate p4 (armor 0->25). Host `PK.plateT=0` -> p6 appeared on B.
- Graceful leave (leaveToMenu) on the client: host got "Bravo left" at once. Rejoin OK. Graceful host leave: client got "The host ended the game." at once.

## Bugs, prioritized

### 1. HIGH — a closed tab leaves a ghost peer forever (both directions)
Repro A: host + client; a 3rd tab joins, then that tab is closed. 60+ s later the host still has it in NET.players, NET.conns and REMOTES:
`conn.open=true`, `dataChannel.readyState='open'`, but `peerConnection.connectionState='failed'`, last state packet 70 s old.
PeerJS never fires `close`, so no 'bye' goes out. The frozen model stays visible and hittable for everyone and stays on the scoreboard,
and **a host bot had the ghost as its target**.
Repro B: close the HOST tab. 70 s later the client is still "in game" (`GAME.running`, `NET.online`, status "Joined DM-…"), with a frozen host and bot. It never sees "The host ended the game."
Where: js/net.js `netHost` (conn handlers) and `netJoin` (hostConn handlers). Only `conn.on('close')` is used.
Fix: add a liveness timeout. Every peer sends 's' at 20 Hz even while dead, so: stamp `lastHeard` in `conn.on('data')`; in `netTick`
the host drops any conn silent for over 5 s (factor the close handler into `hostDropConn(id)`, which also calls `conn.close()`), and the client
calls `leaveToMenu('Lost connection to the host.')` after 5 s with no host traffic. You can also listen for
`conn.peerConnection` 'connectionstatechange' -> 'failed'/'closed'. Add `window.addEventListener('pagehide', () => { try { NET.peer && NET.peer.destroy(); } catch (e) {} })` too, so a normal close is seen at once.

### 2. MEDIUM — 'vis' projectiles fly through bodies: false impact behind every hit target
Repro: B shoots A in the chest. On A's own screen (and every other non-shooter), the round passes through A and makes a concrete impact and impact sound
behind them: hit at (-47,0.6,-14.4), impact drawn at (-51.9,0.1,-19.3). The same happened on B when the host and bots shot B.
Where: js/player.js `projTick`. For `mode==='vis'` it only calls `rayWorld`.
Fix: trace 'vis' rounds against bodies too (`projTrace` with `matchBodies(pr.owner)`, which includes the local player and remotes), and in `projImpact`
just end the round with no fx on a `hit.player` when `pr.mode==='vis'` (the blood already comes through 'fx').

### 3. LOW-MEDIUM — remote muzzle flash appears in the wrong place after a quick turn
Repro: the host flicks aim (sets yaw/pitch) 60 ms before `fireWeapon()`. On B the flash spawned at (-26,2.9,8.2), 1.5 m to the side/behind the
shot origin (-26,3,6.7), while the shot direction was (-0.7,-0.1,-0.7). The remote model's yaw runs about 150 ms behind (110 ms interpolation + 50 ms send interval),
so its muzzle points the old way. Flicking before a shot is normal play.
Where: js/net.js `remoteShot`.
Fix: when the shot arrives, snap the remote's `state.yaw/pitch` to the shot direction (and hold it about 0.2 s), or only use the model muzzle when it lies
within about 2 m ahead of `o` along `v`. Otherwise use `o + v̂*1.0`.

### 4. LOW — the client never deletes taken or expired plates
The host deletes them, but `pickupApply` re-adds them as hidden entries on the client (B had p1..p3 inactive). This only leaks a little memory.
Where: js/pickups.js `pickupApply`.
Fix: if `m.k==='plate' && !m.a`, `SCENE.remove(p.mesh); PICKUPS.delete(m.id)`.

### 5. LOW — the DataChannel is unordered
`reliable:false` in `netJoin` gives `ordered:false` (reliable, maxRetransmits null). 's' has seq numbers, but the event messages don't.
A 'join' racing ahead of 'welcome' gets wiped from NET.players by welcome's overwrite (name shows as "Someone"). I didn't see this happen on localhost.
Fix: use `reliable:true` for events, or merge in welcome instead of replacing.

### Cosmetic / minor
- Knife blood: the shooter draws amount 2, everyone else gets 1, because the 'fx' relay has no amount field (player.js `knifeTick`). Add `a:2`.
- A client's `/addbot` gives the client no "Added N bots" line, only the "X joined" lines.
- Hitting a target in spawn protection (1.5 s) still shows the shooter a hitmarker and blood, with no damage done.
- The 'hello' profile uses PL.outfit/PL.skin (set by the menu UI), not PROFILE. It works through the UI, but it's fragile (net.js `myProfile`).
- `remoteGlint` has no occlusion test (it's up to fxGlint whether the sprite depth-tests through walls).

## Re-test after fixes (fresh scripts; host tab-20, Bravo tab-21, Charlie tab-22; code DM-D8AV)
- Bug 2 'vis' rounds: B shot A in the chest from 30 m (A 100/50 -> 65/0). On the victim A and on bystander C: muzzle flash + blood, **no fxImpact**. FIXED
- Bug 3 quick-turn muzzle: B faced away for 1.2 s, then snapped aim and fired 40 ms later. On A and C the flash was at (-26.7,2.9,6.0) = origin (-26,3,6.7) + 1 m along the shot dir, not on the lagging model. FIXED
- Bug 4 plates: host forced p1/p2, B took p2 -> p2 is gone from PICKUPS on both B and C (19 left = 18 cans + p1). FIXED
- Bug 1 ghost, client tab closed: host dropped Charlie **6.06 s** later. Charlie was gone from NET.players, REMOTES and matchBodies on the host, B got "Charlie left", and no bot target pointed at it. FIXED
- Bug 1 ghost, host tab closed: B went to the menu with "Lost connection to the host." **6.1 s** later, with REMOTES and pickups cleared. FIXED
- `pagehide` -> `peer.destroy()` didn't make either close faster (both took the full 6 s timeout), so it seems not to get a close out before the tab dies. Harmless.
- No console errors in any tab.

### NEW REGRESSION (HIGH): a tab that stops rendering for 6 s gets kicked
Repro: client B's frame loop stopped for 8 s (this is what happens when a tab is hidden or minimized: Chrome pauses rAF, and `netTick` only runs from `frame()`).
The host dropped B ("Bravo left"). B was thrown to the menu with **"The host ended the game."** (misleading: the host's `conn.close()` fires B's close handler).
The same thing in reverse: if the HOST alt-tabs for more than 6 s, every client leaves with "Lost connection to the host."
Where: js/net.js `netTick` is the only sender, and it's driven by rAF.
Fix: send a tiny keepalive from a timer that keeps running while hidden, e.g. `setInterval(() => { if (NET.online) netOut({ t: 'ka' }); }, 1000)`
(any message refreshes `heard`/`hostHeard`; `hostReceive`/`clientReceive` can ignore 't:"ka"', or the host can relay nothing). Chrome keeps 1 Hz timers in hidden tabs,
and pages with an open RTCPeerConnection are exempt from intensive throttling. Optionally use a different message for the kick ("You were disconnected (timed out).").
