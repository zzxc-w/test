# Browser multiplayer client

These dependency-free files are deliberately isolated from the solo game. Loading them does nothing until integration code creates a client with `enabled: true` and a Worker URL.

## Script order and public API

Load `config.js`, `presence.js`, `challenges.js`, `arena.js`, then `client.js`. They extend one global, `window.VerdantMultiplayer`:

- `createClient(options)` / `MultiplayerClient`
- `PresenceStore` and `drawRemotePlayers(ctx, players, options)`
- `ChallengeController` and `mountChallengePanel(controller, options)`
- `ArenaClient`, `createArenaInputState()`, and `mountArenaOverlay(arena, options)`
- `createConfig(overrides)` and `DEFAULT_CONFIG`

Minimal integration:

```js
const multiplayer = VerdantMultiplayer.createClient({
  config: { enabled: true, apiBase: "https://staging.example.workers.dev" }
});
multiplayer.connect({ name: "Cultivator" });

// At no more than 5 Hz (the client also rate limits this):
multiplayer.updatePresence({ x: player.x, y: player.y, facing: player.facing, moving: player.moving });

// During world drawing:
VerdantMultiplayer.drawRemotePlayers(ctx, multiplayer.presence.getRenderable(Date.now()), { camera });
```

`multiplayer.status` is `offline`, `connecting`, `online`, or `reconnecting`. Connection and parse failures never interfere with the solo game or save. Call `disconnect()` when leaving the page.

## HTTP and WebSocket contract

`POST /v1/session` accepts:

```json
{"world":"verdant-star","protocolVersion":1,"mapVersion":1,"rulesetVersion":1,"name":"Cultivator"}
```

It returns `{ "playerId", "ticket", "websocketUrl" }`. The ticket is URL-encoded into the WebSocket query. The client sends:

- `presence`: `seq`, finite `x`/`y`, `facing`, `moving`, optional `emote`
- `challenge_request`: `targetPlayerId`
- `challenge_response`: `challengeId`, `accept`
- `arena_input`: `arenaId`, `seq`, normalized `moveX`/`moveY` and `aimX`/`aimY`, plus boolean `attack`/`dash`/`parry`

The server sends:

- `welcome`
- `world_snapshot` with `players`, or `presence` with one `player`
- `player_leave`
- `challenge_offer` with `challengeId`, `fromPlayerId`, `fromName`, `expiresAt`
- `challenge_update`
- `arena_start` with `arenaId`, `playerId`, `ticket`, `websocketUrl`, `rulesetVersion`, and optional first `snapshot`
- On the dedicated arena WebSocket: `arena_snapshot` with increasing `tick`, authoritative `players`, and `timeLeft`
- On the dedicated arena WebSocket: `arena_end` with the authoritative outcome

The world and arena use separate WebSockets. If the arena socket drops, the client retains its transient arena and reconnects directly with the arena ticket during the configured 20-second grace. The server treats the nonce as single-use except when the same disconnected session resumes that arena within the grace window. Clients never send damage, HP, cooldowns, winners, rewards, world loot, or cultivation state. The server must reject unknown fields/types, invalid versions, ticket use by another session and excessive message rates. Arena state is exposed only through `client.arena` and must not be included in the solo save.

The challenge sheet uses 48px controls, safe-area insets, `touch-action: manipulation`, disables Safari tap highlighting, includes countdowns, and offers an Ignore Challenges toggle. The arena overlay prevents page scrolling, is independent of the world canvas, and provides arena-local multitouch movement plus Attack, Parry and Dash controls. Controls release on pointer cancellation, focus loss and page hiding to prevent stuck iPad input. Pass `onInput(state)` to `mountArenaOverlay` to bridge input yourself, or omit it to send through `ArenaClient` directly.
