# Project State

_Last updated: 2026-09-12. Verify this summary against the current branch, `git status`, `git diff`, and code before relying on it._

## Purpose and architecture

**Path of the Verdant Star** is a dependency-free, browser-native, pixel-styled top-down cultivation action-adventure deployed at <https://zzxc-w.github.io/test/>.

- `index.html` owns CSS, HUD, dialogs, touch controls, and script order; `game.js` is the main Canvas 2D game IIFE.
- UMD/CommonJS modules in `systems/` hold equipment, keybinding, dialogue, shop, cultivation, sanctuary, storage, learned-skill, and endgame domain logic.
- `multiplayer/` is the browser client for presence, shared drops, challenges, and arena play. `server/` is the Cloudflare Worker/SQLite Durable Object authority.
- The static game has no build step. GitHub Pages deploys `main` after validation.
- Device-local progress uses `localStorage` key `verdant-star-save`; schema version 12 adds Dao Constellation and Celestial Incursion state while retaining v9 sanctuary/storage/skill, v10 Tribulation, and v11 Immortal Realm data.

## Implemented

- A deterministic 144×108 world with nine regions, roads, minimap discovery, spirit veins, shrines, caches, herbs, regional ingredients, five fixed-strength bosses, and durable boss keys.
- Weapon combat, enemy telegraphs, parry/riposte, sword-seal AOE, learned Ember Palm, terrain-phasing dash, defeat stage loss, and living-enemy health reset.
- Mortal through Soul Transformation cultivation with material/key-gated breakthroughs, three Tribulation gates, a sanctuary ascension rite, and a short tutorial followed by self-directed exploration.
- Single-cell 6×5 backpack, weapon/armor/pendant slots, four weapon builds, bonuses, local/shared drops, atomic full-bag operations, infinite personal storage, and Quartermaster shop.
- Remappable keyboard controls, equivalent touch actions, iPad Safari cleanup, settings/progress reset, permanent per-save name, and a hidden developer chamber (`Ctrl+Shift+Alt+D`, or hold Menu on touch).
- Online presence, proximity challenges, shared equipment drops, and a predicted but server-authoritative normalized arena.
- A 48×34-tile enterable **Verdant Star Sanctuary** beside the Crossroads with five connected zones, twelve named/skinned residents, 49 authored furnishings, collision, camera scrolling, and wide tested movement lanes.
- Sanctuary tutors and reusable skill costs/prerequisites; personal chest, Moonwater Well, dawn-rest bed, meditation seat, forge/training/crafting placeholders, and caretaker guidance.
- A three-tier post-boss **Heavenly Scar** loop: escalating waves/elites/echo bosses, transactional entry costs, persistent marks/insight/failures, capped stat growth, a minimap marker, and Scholar Bo entry. Tiers 1/2/3 move Nascent Soul I → IV → VII → IX; cleared tiers remain replayable.
- Scholar Bo's post-tier-three ascension opens a separate 96×72 **Immortal Realm** scene with three floating regions, four regular enemy families, regional telegraphed hazards, qi/dash-refreshing aether currents, three multi-wave rifts, the Void Harbinger boss, Soul Shards/Sigils, and rotating repeatable Celestial Decrees.
- Soul Transformation I begins on ascension, two stabilized rifts awaken stage II, and the three-rift/boss/decree/resource rite awakens stage III. Higher-realm discovery, resources, bounty, and rift state persist.
- Three sequential **Dao Constellations** turn surplus higher-realm resources into distinct offense, parry/defense, or mobility/qi builds. One unlocked path is attuned at a time through Scholar Bo in the sanctuary.
- The central **Celestial War Bell** starts six deterministic rotating Incursions across all higher-realm regions. Hunts persist, use bounded waves and optional elite finales, and provide repeatable shard/sigil rewards after the main progression ends.

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
- Tribulations and the Immortal Realm are local PvE. Exactly three tiers unlock sequentially and remain replayable; Marks and stones pay later entries, while Insight has capped solo-world benefits.
- Higher-realm enemies are deliberately kept out of normal-world multiplayer presence. Scene switches must preserve the lower-world enemy array and never broadcast ascended coordinates.
- Multiplayer connects only in the normal world and disconnects in local scenes; sanctuary, rift, Incursion, and Dao state remain solo-only.
- Incursions are deterministic by completion count rather than wall-clock time. They cannot overlap an active rift, and leaving/death removes only their transient enemies while preserving domain progress.
- `iron_root` deliberately references unavailable `iron_ore` as a future-content gate. Do not silently grant/remove it.
- Preserve keyboard/touch parity. `R` is the remappable learned-art action; touch exposes **Art**.
- Do not commit secrets, local helpers, generated artifacts, or unrelated collaborator changes. Avoid overlapping broad edits to monolithic `game.js`.

## Current state / known issues

- Sanctuary-density, inventory-reliability, and the first Heavenly Tribulation implementation shipped in `0772cb0`. The three-tier redesign and Immortal Realm expansion shipped in `76dbeee`.
- The Dao/Incursion milestone is validated on `feature/celestial-legacy`: 103 focused system tests, game smoke tests, multiplayer client tests, and 29 server tests pass. GitHub Pages publication and live-browser verification remain.
- Fixed higher-realm stage recovery failing to restore death-lost stats, undiscovered corrupt rifts creating exit locks, sanctuary map input leaking into the world, stale multi-cell merchant wording, and local-scene players appearing as phantom multiplayer targets.
- Inventory save recovery now preserves valid gear behind malformed entries, repairs duplicate UID equipment assignment, and keeps failed full-bag moves byte-for-byte atomic. The responsive cards show compact type/rarity labels and highlight equipped selection.
- Tribulation affixes are authored future hooks; playable trials currently apply wave, elite, health, damage, speed, parryability, and echo-boss scaling.
- Ember Palm is the only active learned art. Gale Step, Flowing Guard, and Iron Root are passive; iron ore has no source.
- NPC storylines, alchemy, forging, formation crafting, and most tutor inventories remain placeholders.
- Saves/storage are local and editable. Shared drops are cooperative, not cheat-proof; do not build a valuable economy before server-side identity/inventory.
- Real-browser automation is not part of CI. Major UI/input changes require desktop and touch checks.

## Relevant files

- `game.js` — save v12, both explorable worlds, sanctuary integration/rendering, combat, rift/bounty/Incursion/Dao integration, inventory UI, learned arts, and Tribulation waves.
- `index.html` — HUD/dialogs, responsive inventory/storage/Dao UI, developer shortcuts, touch controls, and module loading (`game.js?v=16`).
- `systems/sanctuary.js` — immutable interior layout, resident roster, fixtures, collision, interactions, and location validation.
- `systems/equipment.js`, `storage.js` — sanitized atomic equipment and unlimited personal storage.
- `systems/skills.js`, `endgame.js`, `immortal-realm.js` — tutor skills, three deterministic Tribulation tiers, and persistent higher-realm expedition/rift/bounty progression.
- `systems/dao-paths.js`, `celestial-events.js` — transactional constellation unlocks/attunement and deterministic persistent postgame Incursions.
- `systems/keybinds.js`, `dialogue.js`, `shop.js`, `cultivation.js` — reusable supporting systems.
- `tests/smoke-test.js`, `systems/test/`, `multiplayer/test/` — integration and focused regression tests.
- `multiplayer/`, `server/`, `.github/workflows/pages.yml` — realtime client, Cloudflare authority, and Pages deployment.
- `README.md`, `CONTRIBUTING.md`, `AGENTS.md`, `MULTIPLAYER.md` — player, collaboration, continuity, and multiplayer documentation.

## Next steps

1. Touch-test Dao menus, the War Bell, Incursion waves/elite finales, rifts, death/re-entry, and multiplayer scene disconnects on iPad Safari.
2. Add a lightweight discoveries/rumors journal for boss and NPC lore without restoring objective arrows.
3. Implement the authored Tribulation affixes as distinct hazards and add tier-specific equipment rewards.
4. Design NPC story arcs and stable quest flags before replacing placeholder dialogue/services.
5. Incrementally split `game.js` and add real-browser interaction coverage before collaborators add overlapping systems.
