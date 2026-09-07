# Multiplayer Worker

This directory contains the optional real-time authority for Path of the Verdant Star. The solo game and local saves remain independent when this Worker is unavailable.

## Responsibilities

- `WorldRoom` provides one 50-player social-presence shard, 20-second disconnect grace, emotes, and 15-second challenge offers. It independently enforces the 360-pixel challenge range.
- An accepted challenge configures a unique `ArenaRoom` and sends each player a short-lived ticket for a separate WebSocket.
- `ArenaRoom` owns normalized HP, positions, movement, attack timing, dash, parry, riposte, the 90-second clock, disconnect forfeits, and outcomes. Clients can only submit inputs.
- Exact Origin, protocol/map/ruleset versions, HMAC tickets, message-size limits, strict schemas, sequence numbers, movement sanity checks, and token-bucket rate limits protect the public endpoints.
- Nothing in this service reads or writes the browser's `verdant-star-save` progression.

## Browser contract

`POST /v1/session` accepts the contract documented in `../multiplayer/README.md` and returns `{playerId,ticket,websocketUrl,expiresAt}`. World messages use the `type` discriminator:

- client: `presence`, `challenge_request`, `challenge_response`;
- server: `welcome`, `world_snapshot`, `presence`, `player_leave`, `challenge_offer`, `challenge_update`, `arena_start`.

`arena_start` contains `{arenaId,playerId,ticket,websocketUrl,rulesetVersion}`. The client opens that second WebSocket and sends `arena_input`; it receives `arena_snapshot` and `arena_end`. Arena tickets are single-use for admission, except that the same player and nonce can reconnect during the 20-second grace period.

Coordinates in the shared world use game pixels (`144 * 24` by `108 * 24`). Arena coordinates use a separate normalized `720 * 420` space.

## Local checks

Requires Node.js 20 or later.

```sh
cd server
npm install
npm test
npm run check
npx wrangler dev --env staging
```

After deployment, run the opt-in live two-client check with the Worker URL and an allowed Origin:

```sh
node test/live-staging.mjs https://your-worker.workers.dev https://zzxc-w.github.io
```

Copy `.dev.vars.example` to `.dev.vars` only for local development. Both files containing real secrets are ignored.

## Cloudflare setup and deployment

Log in, create a strong HMAC secret in each environment, then deploy staging:

```sh
npx wrangler login
npx wrangler secret put SESSION_SIGNING_KEY --env staging
npx wrangler deploy --env staging
```

After testing staging, configure production separately:

```sh
npx wrangler secret put SESSION_SIGNING_KEY --env production
npx wrangler deploy --env production
```

Use different random values of at least 32 characters for staging and production. Do not put them in `wrangler.toml`, source control, Pages JavaScript, logs, or chat. The production Origin allowlist is exactly `https://zzxc-w.github.io`; staging additionally permits the listed local origins. Update the public browser endpoint only after health, two-browser presence, challenge decline/timeout, duel, manipulated-input, and reconnect tests pass.

The SQLite Durable Object migration is named `v1`; do not rename or reuse that tag after deployment. Later schema/class changes require a new migration tag.
