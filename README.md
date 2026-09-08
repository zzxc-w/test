# Path of the Verdant Star

A pixel-styled top-down cultivation adventure that runs directly in a browser.

**Play:** https://zzxc-w.github.io/test/

## Controls

- **WASD / arrow keys:** move
- **Space:** equipped-weapon strike
- **F / L:** parry a gold-flashing enemy attack; strike the staggered enemy for a riposte
- **Shift / K:** cloud-step dash
- **C:** cultivate inside a green spirit-vein beacon; when qi is full, attempt a material-gated breakthrough
- **E:** interact with people, gather materials, or open a gold ancient cache
- **Q:** cast sword seal (costs 20 qi)
- **R:** use the active cultivation art learned from a sanctuary tutor
- **I:** open the equipment inventory
- **M:** expand or close the world map

Keyboard controls can be remapped from **Menu → Keybinds**. Touch controls stay in fixed positions.

Developer test chamber: press **Ctrl + Shift + Alt + D** on a hardware keyboard, or press and hold **Menu** for about two seconds on touch devices.

After the short combat/cultivation tutorial, exploration is self-directed. Regional materials and unique boss drops unlock later cultivation stages. The large Verdant Star Sanctuary beside the Crossroads is an enterable home base with eight named residents, tutors, a blacksmith, crafting placeholders, a training floor, and a decorated great hall. Its private cultivator corner contains a full-heal Moonwater Well, a rest bed, meditation seat, and an infinite personal equipment chest. Quartermaster Lian now works inside the sanctuary and sells weapons, armor, and pendants for sword, spear, dual-blade, and greatsword builds.

Every item occupies one backpack slot; select one to equip, unequip, drop, or store it. Matching two pieces awakens a build bonus. Tutors teach persistent active and passive arts in exchange for resources when their requirements are met. Solo-world equipment and arts do not alter normalized arena balance.

Progress, equipment, personal-chest contents, learned arts, and keybindings are saved in the browser automatically. A cultivator name is chosen once when beginning an unnamed save and remains bound to that journey; clearing progress returns to name creation.

## Multiplayer

Multiplayer connects automatically after beginning the journey. The **Online · Nearby** button lists cultivators within challenge range. Equipment dropped while online appears to everyone in the shard for five minutes and can be claimed once with the normal interact control. Accepted challenges move both players into a separate normalized Arena Realm with pixel fighters, visible attack/parry/dash states, health and cooldown displays, and server-authoritative combat. Local prediction makes movement and action feedback immediate, opponent interpolation removes snapshot judder, and the arena HUD shows measured round-trip latency; the server remains authoritative for positions, hits, and damage. **Leave Realm** and automatic stalled-connection recovery always return the player to the unchanged normal world. Arena outcomes never alter local cultivation progress or the normal-world save, and the solo game remains playable if the service is unavailable.

The browser client lives in `multiplayer/`; the Cloudflare Worker and deployment notes live in `server/`.

## Local development

This game has no build dependencies. Serve the repository with any static web server, then open `index.html` through that server. Changes to `main` deploy automatically through GitHub Pages after the validation step passes.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the shared editing workflow.
