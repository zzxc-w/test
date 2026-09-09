# Project State

_Last updated: 2026-09-09. Verify this summary against the current branch, `git status`, `git diff`, and code before relying on it._

## Purpose and architecture

**Path of the Verdant Star** is a dependency-free, browser-native, pixel-styled top-down cultivation action-adventure deployed at <https://zzxc-w.github.io/test/>.

- `index.html` owns CSS, HUD, dialogs, touch controls, and script order; `game.js` is the main Canvas 2D game IIFE.
- UMD/CommonJS modules in `systems/` hold equipment, keybinding, dialogue, shop, cultivation, sanctuary, storage, learned-skill, and endgame domain logic.
- `multiplayer/` is the browser client for presence, shared drops, challenges, and arena play. `server/` is the Cloudflare Worker/SQLite Durable Object authority.
- The static game has no build step. GitHub Pages deploys `main` after validation.
- Device-local progress uses `localStorage` key `verdant-star-save`; schema version 10 adds Heavenly Tribulation state while retaining v9 sanctuary/storage/skill data.

## Implemented

- A deterministic 144×108 world with nine regions, roads, minimap discovery, spirit veins, shrines, caches, herbs, regional ingredients, five fixed-strength bosses, and durable boss keys.
- Weapon combat, enemy telegraphs, parry/riposte, sword-seal AOE, learned Ember Palm, terrain-phasing dash, defeat stage loss, and living-enemy health reset.
- Mortal through Nascent Soul cultivation with material/key-gated breakthroughs and a short tutorial followed by self-directed exploration.
- Single-cell 6×5 backpack, weapon/armor/pendant slots, four weapon builds, bonuses, local/shared drops, atomic full-bag operations, infinite personal storage, and Quartermaster shop.
- Remappable keyboard controls, equivalent touch actions, iPad Safari cleanup, settings/progress reset, permanent per-save name, and a hidden developer chamber (`Ctrl+Shift+Alt+D`, or hold Menu on touch).
- Online presence, proximity challenges, shared equipment drops, and a predicted but server-authoritative normalized arena.
- A 48×34-tile enterable **Verdant Star Sanctuary** beside the Crossroads with five connected zones, twelve named/skinned residents, 49 authored furnishings, collision, camera scrolling, and wide tested movement lanes.
- Sanctuary tutors and reusable skill costs/prerequisites; personal chest, Moonwater Well, dawn-rest bed, meditation seat, forge/training/crafting placeholders, and caretaker guidance.
- A repeatable post-boss **Heavenly Scar** loop: sequential/replayable tiers, escalating waves/elites/echo bosses, transactional entry costs, persistent marks/insight/failures, capped stat growth, a minimap marker, and Scholar Bo entry.
- Tribulation milestone tiers 3/6/10/15/etc. advance Nascent Soul from stage I through IX. Refresh reforms an active trial from wave one; death or leaving Starfall Crater fails it.

## Important decisions and constraints

- Keep the game dependency-free and directly browser-runnable unless a migration is explicitly agreed on.
- Preserve save migrations and existing progress. V7-v9 saves must receive safe defaults; defeated-boss flags remain authoritative and repair durable keys.
- Cultivation works at green spirit veins, not shrines or the sword-grave cross. Boss keys are checked but not consumed.
- Preserve legacy world coordinates and append stable content instead of reordering cache/landmark identities.
- Boss strength is fixed, not player-scaled. Solo equipment, learned arts, and Tribulation progress do not affect normalized arena balance.
- The sanctuary is a separate local scene; interior coordinates must never be broadcast as world presence. Leaving returns to a validated exterior position.
- Personal storage is intentionally unlimited. Equipment transfer/equip/unequip/drop operations must remain atomic and exact-UID based, especially with full or corrupted inventories.
- World drops are forbidden indoors so items cannot be stranded at interior coordinates; use the personal chest instead.
- NPC IDs/services/story flags are stable future-story hooks. Most crafting/services remain placeholders; extend the reusable modules rather than hard-coding one-off state.
- Tribulations are local PvE. Cleared tiers are replayable; only the next tier unlocks. Marks and stones pay later entries, while Insight has capped solo-world benefits.
- `iron_root` deliberately references unavailable `iron_ore` as a future-content gate. Do not silently grant/remove it.
- Preserve keyboard/touch parity. `R` is the remappable learned-art action; touch exposes **Art**.
- Do not commit secrets, local helpers, generated artifacts, or unrelated collaborator changes. Avoid overlapping broad edits to monolithic `game.js`.

## Current state / known issues

- Sanctuary-density, inventory-reliability, and Heavenly Tribulation work shipped to `main` in `0772cb0` and is live on GitHub Pages. Syntax, 68 focused system tests, gameplay smoke tests, multiplayer client tests, Pages deployment, and a live desktop browser pass all succeeded.
- Inventory save recovery now preserves valid gear behind malformed entries, repairs duplicate UID equipment assignment, and keeps failed full-bag moves byte-for-byte atomic. The responsive cards show compact type/rarity labels and highlight equipped selection.
- Tribulation affixes are authored future hooks; playable trials currently apply wave, elite, health, damage, speed, parryability, and echo-boss scaling.
- Ember Palm is the only active learned art. Gale Step, Flowing Guard, and Iron Root are passive; iron ore has no source.
- NPC storylines, alchemy, forging, formation crafting, and most tutor inventories remain placeholders.
- Saves/storage are local and editable. Shared drops are cooperative, not cheat-proof; do not build a valuable economy before server-side identity/inventory.
- Real-browser automation is not part of CI. Major UI/input changes require desktop and touch checks.

## Relevant files

- `game.js` — save v10, world/gameplay, sanctuary integration/rendering, inventory UI, learned arts, and playable Tribulation waves.
- `index.html` — HUD/dialogs, responsive inventory/storage UI, developer shortcuts, touch controls, and module loading (`game.js?v=14`).
- `systems/sanctuary.js` — immutable interior layout, resident roster, fixtures, collision, interactions, and location validation.
- `systems/equipment.js`, `storage.js` — sanitized atomic equipment and unlimited personal storage.
- `systems/skills.js`, `endgame.js` — tutor skills and deterministic Tribulation tiers/progression/persistence.
- `systems/keybinds.js`, `dialogue.js`, `shop.js`, `cultivation.js` — reusable supporting systems.
- `tests/smoke-test.js`, `systems/test/`, `multiplayer/test/` — integration and focused regression tests.
- `multiplayer/`, `server/`, `.github/workflows/pages.yml` — realtime client, Cloudflare authority, and Pages deployment.
- `README.md`, `CONTRIBUTING.md`, `AGENTS.md`, `MULTIPLAYER.md` — player, collaboration, continuity, and multiplayer documentation.

## Next steps

1. Touch-test the dense sanctuary, responsive inventory, trial entry, full trial phases, failure/resume behavior, and tier-three advancement on the live site.
2. Implement the authored Tribulation affixes as distinct hazards and add tier-specific equipment rewards.
3. Design NPC story arcs and stable quest flags before replacing placeholder dialogue/services.
4. Add iron ore, blacksmith upgrades, alchemy, formation crafting, and more active cultivation moves.
5. Incrementally split `game.js` and add real-browser interaction coverage before collaborators add overlapping systems.
