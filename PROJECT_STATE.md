# Project State

_Last updated: 2026-09-09. Verify this summary against the current branch, `git status`, `git diff`, and code before relying on it._

## Purpose and architecture

**Path of the Verdant Star** is a browser-native, pixel-styled top-down cultivation action-adventure deployed at <https://zzxc-w.github.io/test/>.

- `index.html` owns the page/CSS, HUD, dialogs, touch controls, and script order; `game.js` is the main Canvas 2D game IIFE.
- Dependency-free UMD/CommonJS modules in `systems/` hold equipment, keybinding, dialogue, shop, cultivation, sanctuary, storage, and learned-skill domain logic.
- `multiplayer/` is the browser client for presence, shared equipment drops, challenges, and arena play.
- `server/` is the Cloudflare Worker and SQLite Durable Object authority for the shared shard and normalized duels.
- The static game has no build step. GitHub Pages deploys `main` after syntax and smoke validation.
- Device-local progress uses `localStorage` key `verdant-star-save`; schema version 9 adds sanctuary location, personal storage, learned arts, story flags, and the safe world return position.

## Implemented

- A deterministic 144×108 world with nine regions, roads, minimap discovery, green spirit veins, shrines, caches, herbs, regional ingredients, five fixed-strength bosses, and durable boss keys.
- Weapon combat, enemy telegraphs, timed parry/riposte, sword-seal AOE, collision-phasing cloud-step dash, defeat stage loss, and full-health enemy reset after player death.
- Mortal through Nascent Soul cultivation with material/key-gated breakthroughs and only a short attack/cultivation tutorial before self-directed exploration.
- Single-cell backpack, weapon/armor/pendant slots, four weapon styles/build sets, stat bonuses, local/shared drops, safe full-bag operations, and Quartermaster shop/dialogue.
- Remappable keyboard controls, equivalent touch actions, iPad Safari input cleanup, settings/progress reset, permanent per-save name, and hidden developer chamber (`Ctrl+Shift+Alt+D`, or hold Menu on touch).
- Online presence, proximity challenges, shared equipment drops, and a separately rendered, predicted but server-authoritative normalized arena.
- An enterable 48×34-tile **Verdant Star Sanctuary** beside the spawning Crossroads. It has five connected zones, collision, camera scrolling, a large exterior, eight named/skinned placeholder NPCs, torches, fireplace, rugs, shelves, stations, forge, and training props.
- Sanctuary services: Quartermaster Lian's existing shop, blacksmith/sword/movement tutor hooks, a persistent learned-art system, active Ember Palm on `R`, passive arts, and reusable requirement/cost handling.
- A personal corner with an infinite persistent equipment chest, full-heal/full-qi Moonwater Well, dawn-rest bed, meditation seat, and caretaker guidance.

## Important decisions and constraints

- Keep the game dependency-free and directly browser-runnable unless a migration is explicitly agreed on.
- Preserve save migrations and existing progress. Older v7/v8 saves must safely receive new defaults; defeated-boss flags remain authoritative and repair missing durable keys.
- Cultivation works at green spirit veins, not shrines or the sword-grave cross. Breakthrough keys are checked but not consumed.
- Preserve legacy world coordinates and append stable content rather than reordering cache/landmark identities.
- Boss strength is fixed, not player-scaled. Solo equipment/skills do not change normalized arena balance.
- The sanctuary is a separate local scene. Interior coordinates must never be broadcast as world presence; leaving returns to a validated exterior position.
- The personal chest intentionally stores equipment without a capacity limit. Deposit/withdraw must remain atomic, including equipped items and a full backpack.
- NPC identities, services, and story flags are stable hooks for later narrative work. Most dialogue/services are placeholders; add story content through the reusable systems rather than hard-coding one-off state.
- `iron_root` deliberately references unavailable `iron_ore` as a future-content gate; the UI says it is not yet obtainable. Do not silently grant or remove that requirement.
- Preserve keyboard/touch parity. `R` is the learned-art action and is remappable; touch exposes the same action as **Art**.
- Do not commit secrets, local-server helpers, `node_modules`, editor files, or generated artifacts. Avoid overlapping broad edits to monolithic `game.js`.

## Current state / known issues

- Sanctuary, storage, and skill features are implemented on `feature/crossroads-sanctuary`; syntax, 50 focused system tests, gameplay smoke tests, and multiplayer client tests pass. Browser QA covered interior rendering, chest deposit/count updates, tutor costs/prerequisites, and the narrow layout.
- Sanctuary NPC storylines, alchemy, formation work, forging, training-dummy lessons, item crafting, and most tutor inventories remain intentional placeholders.
- Ember Palm is the only active learned art currently wired to combat. Gale Step, Flowing Guard, and Iron Root are passive; iron ore has no source yet.
- Saves and personal storage remain local and editable. Shared drops are cooperative rather than cheat-proof; do not build a valuable economy before server-side identity/inventory exists.
- Real-browser automation is not part of CI. Major UI/input changes still need desktop and touch-device checks.
- `main` was last known to be unprotected. Collaborators should use feature branches/PRs and avoid simultaneous work in the same `game.js` sections.

## Relevant files

- `game.js` — world/gameplay state, save v9 integration, sanctuary scene/render/update, NPC interactions, learned-art combat, and UI wiring.
- `index.html` — HUD/dialogs, storage UI, developer shortcuts, touch controls, and module loading (`game.js?v=13`).
- `systems/sanctuary.js` — immutable interior layout, zones, NPC roster, fixtures, collision, interactions, and location validation.
- `systems/storage.js` — sanitized unlimited personal storage with atomic transfer operations.
- `systems/skills.js` — skill catalog, tutor index, prerequisites/cost transactions, persistence, and passive effects.
- `systems/equipment.js`, `keybinds.js`, `dialogue.js`, `shop.js`, `cultivation.js` — reusable existing domain systems.
- `tests/smoke-test.js` and `systems/test/` — save migration, world/content, sanctuary integration, and focused domain tests.
- `multiplayer/`, `server/`, `.github/workflows/pages.yml` — client, Cloudflare authority, and Pages deployment.
- `README.md`, `CONTRIBUTING.md`, `AGENTS.md`, `MULTIPLAYER.md` — player, collaboration, continuity, and multiplayer documentation.

## Next steps

1. Publish and touch-test the sanctuary entrance, room navigation, chest withdrawal with a full backpack, well/rest actions, and each tutor on the live site.
2. Design NPC story arcs and stable quest flags before replacing placeholder dialogue/services.
3. Add real iron ore acquisition, blacksmith crafting/upgrades, alchemy/formation services, and more active cultivation moves with distinct animations.
4. Incrementally split `game.js` before several collaborators add overlapping story/area systems.
5. Add real-browser interaction coverage and continue two-device latency/reconnect testing for multiplayer.
