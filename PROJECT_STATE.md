# Project State

_Last updated: 2026-09-08. Treat this as a continuity summary, not a substitute for checking the current branch, code, `git status`, and `git diff`._

## Purpose and architecture

**Path of the Verdant Star** is a pixel-styled, top-down cultivation action-adventure that runs directly in a browser and is deployed at <https://zzxc-w.github.io/test/>.

The project is a dependency-free static site:

- `index.html` contains the page structure, CSS, HUD, name setup, settings/dev/inventory/dialogue/shop dialogs, responsive touch controls, multiplayer shell, and a fixed 960x540 canvas. It loads dependency-free system and multiplayer modules before `game.js?v=11`.
- `game.js` is a single IIFE containing game data, deterministic world generation, input, update/render loops, combat, exploration, progression, quests, and save/load logic.
- `systems/` contains dependency-free browser/CommonJS domain modules for spatial equipment, keybindings, branching dialogue, transactional shops, and cultivation recipes.
- `multiplayer/` is an optional dependency-free browser client for presence, transient shared equipment drops, challenges, and isolated arena play.
- `server/` is a Cloudflare Worker using SQLite Durable Objects for the shared world and server-authoritative duel rooms.
- Graphics are drawn procedurally with Canvas 2D; smoothing is disabled for a pixel-art look.
- There is no framework, package manager, build step, backend, account system, or asset pipeline.
- Saves are device-local in `localStorage` under `verdant-star-save`; the current schema is version 8.

## Implemented

- Keyboard and touch movement, sword attack, 20-qi sword-seal AOE, gathering, cultivation, and cloud-step dash.
- An 84 px terrain-phasing dash with a cultivation-scaled 0.72-to-0.36-second cooldown, safe landing checks, a visible trail, and 0.48 seconds of invulnerability.
- Deterministic 144x108-tile world that preserves old coordinates and adds connected roads, landmarks, minimap discovery, and four new regions: Mistglass Ravine, Myriad Root Hollow, Emberglass Kiln, and Starfall Crater.
- Eight green spirit veins, five shrines, nine ancient caches, herbs, four regional ingredient types, enemy drops, and resource respawning whose cooldown survives reloads.
- Telegraph-based enemy attacks with windup/active/recovery animation states, timed parry, stagger and riposte windows, harder fixed enemy damage, and unparryable crimson boss slams.
- Five persistent bosses with unique key-item drops: Jadehorn Stag, Tempest Crane, Mirecoil Matriarch, Sectbreaker Golem, and Starfallen Warden.
- Cultivation progression from Mortal through Nascent Soul. Full qi now requires a second cultivation action plus consumable regional ingredients/stones or durable boss keys; missing requirements provide lore clues rather than waypoints.
- Guidance contains only the attack/parry and cultivation tutorial, then hides itself and the compass for discovery-led play.
- The minimap shows muted unknown area markers; names and bright markers unlock through stable area/landmark discovery IDs.
- The compact minimap shows distinct area, shrine, vein, and player markers; `M`/Map opens a larger labelled world map.
- Defeat removes exactly one minor cultivation stage, returns the player to Crossroads, and restores every still-living enemy and boss to full health without reviving defeated foes.
- Autosave and frame-level error recovery.
- A settings dialog with a two-step, game-save-only progress reset, plus a non-persistent hidden developer test chamber opened with `Ctrl+Shift+Alt+D`.
- GitHub Pages deployment from `main`. The workflow syntax-checks `game.js`, runs dependency-free smoke tests, uploads the static repository, and deploys it.
- A 6×5 single-cell backpack with weapon/armor/pendant slots, starter gear, safe full-bag equip swaps, explicit dropping, four weapon identities (sword, spear, dual swords, greatsword), matching build sets, and two-piece bonuses.
- Equipment modifies solo combat reach, cadence, damage, defence, movement, parry timing, dash timing, health, qi gain, and procedural weapon visuals. Enemies can drop gear; bosses have guaranteed themed drops.
- Online equipment drops are visible shard-wide for five minutes and use server-assigned positions/IDs, an item allowlist, distance-checked atomic claims, and rate/quantity limits. Offline drops remain local and interactable.
- Quartermaster Lian at Crossroads provides branching dialogue and sells every current gear piece for spirit stones. Dialogue, shop, and cultivation recipe logic is reusable for later NPCs, story conditions, and areas.
- Remappable keyboard actions in Settings, persisted with the save; touch controls remain semantic and fixed-position.
- Collaboration documentation in `README.md`, `CONTRIBUTING.md`, and `AGENTS.md`.

## Important decisions and constraints

- Keep the game browser-native and dependency-free unless a deliberate migration is agreed on; this keeps local development and GitHub Pages deployment simple.
- Preserve `verdant-star-save`, schema-version migration behavior, and existing player progress when changing saved state.
- The version-3 migration intentionally restores caches affected by an older cache-reward crash. Do not remove that compatibility behavior casually.
- Version 4 reconciles durable quest facts (kills, herbs, realm, caches, and boss state) in order. Boss defeat never bypasses unfinished cache requirements, and old saves with an already-defeated boss can complete once prerequisites are met.
- Version 5 migrates the old quest into two tutorial flags, adds stable boss state, regional ingredients, and key items, and grants the Sectbreaker Core to any save that had already defeated the old boss.
- Version 6 stores discoveries by stable area/landmark IDs and preserves name-based discoveries through migration.
- Version 7 stores one validated 1–20 character cultivator name in the main save. Unnamed legacy saves receive one choice on the title screen; the name is locked until progress is cleared.
- Version 8 adds sanitized equipment and keybinding state. Older or malformed saves receive starter sword/robes without losing existing progression.
- Equipment affects only the solo world. Arena builds stay normalized until multiplayer progression has server-side identity and storage.
- Shared drop ownership is cooperative, not cheat-proof: equipment saves are local and editable, while the Worker only validates allowed item IDs and owns drop placement/lifetime/claiming. Do not build a valuable economy on it before server-side accounts/inventory exist.
- Arena rendering is frame-rate-driven rather than packet-driven: local movement/actions are predicted, opponents interpolate through a 75 ms buffer, and authoritative snapshots reconcile drift. The server still owns positions, hits, damage, and cooldown validity.
- Cultivation belongs near the green spirit veins, not at shrines or the sword-grave/cross landmark.
- Preserve all legacy world coordinates when expanding the map. Append areas/caches instead of reordering them so old positions and cache-save indices remain valid.
- Boss strength is fixed rather than player-scaled. Unique boss keys are durable proof of victory and are checked, not consumed, during realm breakthroughs.
- Defeated-boss flags are authoritative: load repair and developer material clearing must preserve/rederive their durable keys to prevent softlocks.
- Area generation is followed by landmark restoration so region painting cannot erase functional vein and shrine tiles.
- Keep keyboard and touch controls functionally equivalent, including dash access.
- Preserve the authored road network, navigable clearings, and distinct visual language for green veins, gold caches, and glowing herbs.
- Keep `node --check game.js` in deployment validation. Bump the `game.js?v=...` query after important script fixes when stale browser caches are a concern.
- The repository is public to support the current GitHub Pages setup. Do not change repository visibility, deployment strategy, save storage, or collaborator permissions without the owner's agreement.
- Do not commit secrets, `node_modules`, editor files, logs, or generated local artifacts.

## Recent fixes

- Restamped landmarks after area carving so spirit-vein tiles remain functional.
- Restricted cultivation to proximity to veins.
- Fixed the cache interaction crash caused by referencing an undefined variable in reward generation.
- Hardened XP processing against malformed legacy values and unbounded level-up loops.
- Added save migration behavior that restores caches broken by the old crash.
- Made herbs brighter, added guaranteed clusters and interaction prompts, and improved gathering range.
- Changed dash from a small speed burst into a short collision-aware teleport with clear invulnerability.
- Made dash cooldown improve per cultivation stage to a nonzero 0.36-second floor and allowed it to cross obstacles while requiring a passable, in-bounds destination.
- Added save-state sanitization and forward-only quest reconciliation, including repair for saves where the boss was defeated before the cache objective completed.
- Added settings, safe clear-progress handling, and a hidden testing menu for stats, progression, travel, time, boss/cache state, cooldowns, and saving.
- Hardened iPad Safari controls with selection/callout suppression, explicit pressed-state styling, multitouch reference counting, and cleanup after cancelled/lost pointers, app switching, page hiding, and menu changes.
- Expanded the world without shifting legacy locations; restored roads, boss arenas, cache clearings, and landmark tiles after biome painting.
- Added enemy attack telegraphs/animation phases, parry and riposte combat, five boss key drops, and material-gated breakthroughs.
- Replaced post-tutorial objectives with self-directed exploration; the settings inventory shows materials, keys, and next breakthrough requirements.
- Fixed canvas-state and transparent-hole artifacts, added stable minimap discovery markers and safe developer travel entrances, and added a touch-friendly Menu hold shortcut for the developer chamber.
- Multiplayer requires a separate real-time authority. `MULTIPLAYER.md` records the agreed safe boundary: shared social presence first, normalized server-authoritative arena duels, local PvE/progression retained until server-side accounts exist.
- Rebuilt arena presentation around pixel cultivators, HP/cooldown HUD, combat telegraphs, touch-safe edge-buffered actions, hit/parry/dash feedback, knockback, body separation, reliable final-state delivery, an explicit leave control, and a stalled-snapshot watchdog.
- Replaced generated multiplayer aliases with a permanent per-save name chosen once on the title screen; resetting progress removes the legacy alias and returns to name creation.
- Shared-world players now render as colored pixel cultivators with swords and transient attack, parry, and dash animations instead of cyan rectangles.
- Replaced multi-cell item footprints with uniform one-item/one-slot inventory cells, added stat-only item descriptions, made full-bag equipment swaps atomic, and redrew local weapon sprites in facing-relative coordinates.

## Current state and known issues

- Multiplayer v1 is live on GitHub Pages: cosmetic shared-world presence, proximity challenges, a separate normalized server-authoritative arena, reconnect handling, and iPad arena controls. Staging and production Workers are deployed, and `index.html` uses the production endpoint.
- Equipment builds, Quartermaster Lian, remappable controls, reusable interaction systems, and arena prediction are live from commit `3c28088`; Pages run `34211870430` completed successfully and the live site serves `game.js?v=11` / `arena.js?v=3`.
- Shared-drop protocol support is deployed to staging (Worker version `55cbc2f7-9a4a-46a1-9396-7067b45d03b1`) and production (`96bb0bf3-ce73-43b2-8499-fc6a0316155d`); both passed live presence, shared-drop, arena, and reconnect tests before the browser client was published.
- Multiplayer and arena state is deliberately excluded from `verdant-star-save`; the solo simulation pauses during a duel and remains the fail-open fallback.
- Browser-client tests, 27 Worker protocol/simulation/security/lifecycle tests, 23 focused system tests, the gameplay smoke suite, and browser integration checks pass. Automated live tests passed against staging and production for health, two-client presence, challenge acceptance, isolated arena admission/input, and reconnect. A local narrow-viewport browser pass covered inventory, remapping, dialogue, and shop rendering.
- CI performs JavaScript syntax validation and dependency-free migration, progression, combat, dash, reset, and touch-state smoke tests, but still lacks full real-browser interaction coverage. Test desktop and touch behavior manually after major UI or input changes.
- `game.js` and the inline CSS are monolithic. Concurrent broad edits are likely to conflict; use small branches/PRs and avoid assigning two people overlapping sections of `game.js`.
- Equipment is click-to-select/equip/drop rather than drag-and-drop. Every definition is now one cell, while saved x/y positions remain compatible with version 8 saves.
- `main` was unprotected at the last check. `hydrogendesigns` currently resolves to read access, which likely means the collaborator invitation has not yet been accepted.
- This task's local working folder was not a Git checkout, so uncommitted work on another person's machine cannot be represented here.

## Relevant files

- `game.js` — all game systems, world content, state, saving, update loop, and rendering.
- `index.html` — layout, styling, canvas, HUD, overlays, touch controls, and script loading.
- `.github/workflows/pages.yml` — syntax validation and GitHub Pages deployment.
- `tests/smoke-test.js` — dependency-free VM tests for map/content invariants, dash, save migration, gated breakthroughs, parry/attacks, hidden-menu activation, touch cleanup, and safe progress clearing.
- `README.md` — player overview, controls, live link, and local-running notes.
- `CONTRIBUTING.md` — shared branch, testing, commit, and pull-request workflow.
- `AGENTS.md` — instructions for agents and project-continuity maintenance.
- `MULTIPLAYER.md` — multiplayer authority, security, hosting and staged implementation plan.
- `multiplayer/` — optional browser connection, presence, challenge, arena UI/input, and tests.
- `systems/` — equipment, keybinding, dialogue, shop, cultivation domain modules and focused Node tests.
- `server/` — Worker routes, Durable Objects, authoritative arena simulation, security checks, tests, and Wrangler configuration.
- `.gitignore` and `.gitattributes` — repository hygiene and consistent line endings.

## Next steps

1. Confirm `hydrogendesigns` has accepted the invitation and now has write access.
2. Work from the latest `main` using one feature branch per change; use pull requests and avoid simultaneous edits to the same monolithic file.
3. Smoke-test production on desktop and touch, especially inventory layout, remapped keys, merchant interaction, equipment-derived health, boss drops, breakthroughs, old v7 saves, and iPad multitouch.
4. Test multiplayer with two separate physical devices/networks, especially prediction under high RTT, iPad Safari background/reconnect behavior, and long arena sessions.
5. Add GitHub Actions Worker deployment only after scoped Cloudflare CI credentials are deliberately configured as repository secrets.
6. Add broader real-browser interaction coverage when the UI grows further.
7. Build story NPCs, quests, area-specific vendors, and cultivation teachers through the reusable `systems/` APIs; keep authored content/data out of the domain modules.
8. Before major parallel feature work, modularize `game.js` incrementally with behavior and save-compatibility checks.
