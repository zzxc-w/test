# Path of the Verdant Star

A pixel-styled top-down cultivation adventure that runs directly in a browser.

**Play:** https://zzxc-w.github.io/test/

## Controls

- **WASD / arrow keys:** move
- **Space:** sword strike
- **F / L:** parry a gold-flashing enemy attack; strike the staggered enemy for a riposte
- **Shift / K:** cloud-step dash
- **C:** cultivate inside a green spirit-vein beacon; when qi is full, attempt a material-gated breakthrough
- **E:** gather herbs, regional ingredients, or open a gold ancient cache
- **Q:** cast sword seal (costs 20 qi)
- **M:** expand or close the world map

Developer test chamber: press **Ctrl + Shift + Alt + D** on a hardware keyboard, or press and hold **Menu** for about two seconds on touch devices.

After the short combat/cultivation tutorial, exploration is self-directed. Regional materials and unique boss drops unlock later cultivation stages. Progress is saved in the browser automatically.

## Multiplayer

Multiplayer connects automatically after beginning the journey. The **Online · Nearby** button lists cultivators within challenge range. Accepted challenges move both players into a separate normalized Arena Realm with server-authoritative movement, attacks, parries, dashes, health, and results. Arena outcomes never alter local cultivation progress or the normal-world save, and the solo game remains playable if the service is unavailable.

The browser client lives in `multiplayer/`; the Cloudflare Worker and deployment notes live in `server/`.

## Local development

This game has no build dependencies. Serve the repository with any static web server, then open `index.html` through that server. Changes to `main` deploy automatically through GitHub Pages after the validation step passes.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the shared editing workflow.

