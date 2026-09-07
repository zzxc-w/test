# Multiplayer architecture

Multiplayer is feasible, but GitHub Pages can only host the browser client. A separate real-time service must coordinate connected players and authoritatively simulate duels.

## Current status

Multiplayer v1 is implemented. The Cloudflare Worker is deployed at `https://verdant-star-multiplayer.zxuchen.workers.dev`; a separate staging Worker is used for pre-release checks. Live automated tests cover two-client presence, challenge acceptance, arena admission, authoritative movement, and reconnect. The GitHub Pages client connects automatically but always falls back to solo play when the service is unavailable.

## Intended first release

- Keep the existing deterministic map and local PvE/progression available offline.
- Connected players occupy one shared presence shard: they can see names, positions, facing, movement and emotes while exploring the same map.
- Nearby-player UI uses large touch-friendly rows with Challenge buttons; canvas avatar tapping is only a shortcut.
- A challenge has an explicit 15-second Accept/Decline prompt. Acceptance transfers both players into a separate transient arena layer, never into coordinates in the normal world.
- Arena combat uses normalized stats and server-owned HP, positions, cooldowns, dash, parry, riposte, timer and winner. Clients send inputs, not damage or outcomes.
- Arena state must never be written into `verdant-star-save`; the exact local-world state resumes after the duel.
- Network failure always falls back to ordinary solo play without blocking saves or the GitHub Pages deployment.

Shared PvE, loot and progression are intentionally out of scope for the first release. Browser saves are editable, so those systems cannot become fair shared authority until accounts and server-side progression exist.

## Recommended backend

Use a Cloudflare Worker with SQLite-backed Durable Objects and hibernating WebSockets:

- one `WorldRoom` Durable Object for the initial shared shard, capped around 40-50 players;
- one short-lived `ArenaRoom` Durable Object per accepted duel;
- exact production Origin allowlist, protocol/build/map version checks, message-size and rate limits;
- anonymous server-issued session identity initially, with short-lived single-use WebSocket/arena tickets;
- world presence updates at 4-5 Hz and authoritative arena simulation at 30 Hz with snapshots at 10-15 Hz;
- a 20-second reconnect grace period for iPad app switching, followed by forfeit.

Cloudflare documents Durable Objects as WebSocket coordinators and supports SQLite-backed objects on the Workers Free plan. Hibernating sockets should be used for idle world rooms to avoid holding an object active unnecessarily.

## Repository layout

Keep multiplayer isolated from the monolithic solo game:

- `multiplayer/config.js` — public endpoint and independent protocol/map/ruleset versions;
- `multiplayer/client.js` — session, reconnect and world-presence state machine;
- `multiplayer/presence.js` — interpolation and remote-avatar rendering;
- `multiplayer/challenges.js` — nearby-player and offer sheets;
- `multiplayer/arena.js` — isolated arena presentation/prediction;
- `shared/arena-sim.js` — deterministic DOM-free arena rules shared by tests, Worker and browser;
- `server/` — Worker, Durable Objects, protocol validation and server tests.

Worker deployment should use a separate workflow scoped to `server/**`. Cloudflare credentials belong in GitHub environment secrets, never in the repository or Pages JavaScript. A disabled public client flag remains the default until staging passes load, reconnect and manipulated-client tests.

## Implementation order

1. Connect a Cloudflare account and create staging/production Worker environments.
2. Add protocol schemas, pure arena simulation and tests.
3. Add optional world presence with an Offline/Online indicator and fail-open reconnect.
4. Add challenge request/accept/decline/timeout behavior and iPad bottom sheets.
5. Add the authoritative isolated arena with no progression rewards.
6. Roll out to invited testers, then consider accounts, ratings or server-side progression later.
