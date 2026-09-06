# Project State

_Last updated: 2026-09-06. Treat this as a continuity summary, not a substitute for checking the current branch, code, `git status`, and `git diff`._

## Purpose and architecture

**Path of the Verdant Star** is a pixel-styled, top-down cultivation action-adventure that runs directly in a browser and is deployed at <https://zzxc-w.github.io/test/>.

The project is a dependency-free static site:

- `index.html` contains the page structure, CSS, HUD, start overlay, responsive touch controls, and a fixed 960x540 canvas. It loads `game.js?v=4`.
- `game.js` is a single IIFE containing game data, deterministic world generation, input, update/render loops, combat, exploration, progression, quests, and save/load logic.
- Graphics are drawn procedurally with Canvas 2D; smoothing is disabled for a pixel-art look.
- There is no framework, package manager, build step, backend, account system, or asset pipeline.
- Saves are device-local in `localStorage` under `verdant-star-save`; the current schema is version 3.

## Implemented

- Keyboard and touch movement, sword attack, 20-qi sword-seal AOE, gathering, cultivation, and cloud-step dash.
- A collision-stepped dash of about 84 px with a cooldown, visible trail, and 0.48 seconds of invulnerability.
- Deterministic 96x72-tile world with grass, forest, water, stone, pilgrim roads, landmark clearings, minimap, zone discovery, spirit-vein compass, and day/night tint.
- Five named regions: Jade Bamboo Grove, Cloudstep Monastery, Moon Lotus Mere, Ruins of Fallen Sect, and Sword Saint's Grave.
- Four green spirit veins, three shrines, five ancient caches, guaranteed and procedural herbs, enemy drops, and resource respawning.
- Enemy AI, melee combat, health/damage, respawns, multiple enemy types, and the Sectbreaker Golem regional boss.
- Cultivation progression from Mortal through Qi Condensation, Foundation, Golden Core, and Nascent Soul, including stages, qi, XP, stats, herbs, spirit stones, and quests.
- Autosave and frame-level error recovery.
- GitHub Pages deployment from `main`. The workflow syntax-checks `game.js`, uploads the static repository, and deploys it.
- Collaboration documentation in `README.md`, `CONTRIBUTING.md`, and `AGENTS.md`.

## Important decisions and constraints

- Keep the game browser-native and dependency-free unless a deliberate migration is agreed on; this keeps local development and GitHub Pages deployment simple.
- Preserve `verdant-star-save`, schema-version migration behavior, and existing player progress when changing saved state.
- The version-3 migration intentionally restores caches affected by an older cache-reward crash. Do not remove that compatibility behavior casually.
- Cultivation belongs near the green spirit veins, not at shrines or the sword-grave/cross landmark.
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

## Current state and known issues

- No active feature work, open pull requests, or extra branches were found when this file was created; the recent milestone was the cache/herb/vein/dash and save-migration repair series.
- CI performs JavaScript syntax validation but has no automated browser or gameplay tests. Current fixes still need smoke testing on desktop, touch devices, and legacy saves.
- `game.js` and the inline CSS are monolithic. Concurrent broad edits are likely to conflict; use small branches/PRs and avoid assigning two people overlapping sections of `game.js`.
- Some punctuation/icon strings may be mojibake (for example broken apostrophes or symbols). Verify in the deployed game before changing source encoding.
- One cache appears to overlap the southwest spirit-vein location and may confuse interaction or visuals.
- There is no reset-save/debug UI, so stale localStorage can complicate testing.
- `main` was unprotected at the last check. `hydrogendesigns` currently resolves to read access, which likely means the collaborator invitation has not yet been accepted.
- This task's local working folder was not a Git checkout, so uncommitted work on another person's machine cannot be represented here.

## Relevant files

- `game.js` — all game systems, world content, state, saving, update loop, and rendering.
- `index.html` — layout, styling, canvas, HUD, overlays, touch controls, and script loading.
- `.github/workflows/pages.yml` — syntax validation and GitHub Pages deployment.
- `README.md` — player overview, controls, live link, and local-running notes.
- `CONTRIBUTING.md` — shared branch, testing, commit, and pull-request workflow.
- `AGENTS.md` — instructions for agents and project-continuity maintenance.
- `.gitignore` and `.gitattributes` — repository hygiene and consistent line endings.

## Next steps

1. Confirm `hydrogendesigns` has accepted the invitation and now has write access.
2. Work from the latest `main` using one feature branch per change; use pull requests and avoid simultaneous edits to the same monolithic file.
3. Smoke-test production on desktop and touch, including old saves, cache opening, herb gathering, cultivation proximity, dash collision, and invulnerability.
4. Fix verified encoding artifacts and separate the southwest cache from its spirit vein.
5. Add a reset-save/debug option and lightweight browser/gameplay regression tests.
6. Before major parallel feature work, modularize `game.js` incrementally with behavior and save-compatibility checks.
