(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.VerdantSanctuary = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const TILE_SIZE = 32;

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.getOwnPropertyNames(value).forEach((key) => deepFreeze(value[key]));
    return Object.freeze(value);
  }

  const SANCTUARY = deepFreeze({
    id: "crossroads-sanctuary",
    name: "Verdant Star Sanctuary",
    width: 48,
    height: 34,
    tileSize: TILE_SIZE,
    entrance: { id: "south-entrance", x: 23, y: 33, width: 2, height: 1, facing: "south" },
    spawn: { x: 23.5, y: 31 },
    zones: [
      { id: "great-hall", name: "Great Hall", x: 17, y: 2, width: 14, height: 17 },
      { id: "forge-wing", name: "Forge Wing", x: 2, y: 2, width: 14, height: 14 },
      { id: "archive-wing", name: "Archive Wing", x: 32, y: 2, width: 14, height: 14 },
      { id: "training-floor", name: "Training Floor", x: 2, y: 18, width: 29, height: 14 },
      { id: "personal-corner", name: "Cultivator's Corner", x: 32, y: 20, width: 14, height: 12, personal: true },
    ],
    // Rectangles are solid walls. Door rectangles below cut passable openings through them.
    blockers: [
      { id: "north-wall", x: 0, y: 0, width: 48, height: 1 },
      { id: "south-wall", x: 0, y: 33, width: 48, height: 1 },
      { id: "west-wall", x: 0, y: 0, width: 1, height: 34 },
      { id: "east-wall", x: 47, y: 0, width: 1, height: 34 },
      { id: "forge-partition", x: 16, y: 1, width: 1, height: 15 },
      { id: "archive-partition", x: 31, y: 1, width: 1, height: 15 },
      { id: "personal-partition", x: 31, y: 19, width: 16, height: 1 },
    ],
    doors: [
      { id: "south-entrance", x: 23, y: 33, width: 2, height: 1, connects: ["great-hall", "crossroads"], interaction: "exit" },
      { id: "forge-door", x: 16, y: 8, width: 1, height: 2, connects: ["forge-wing", "great-hall"] },
      { id: "archive-door", x: 31, y: 8, width: 1, height: 2, connects: ["archive-wing", "great-hall"] },
      { id: "personal-door", x: 37, y: 19, width: 2, height: 1, connects: ["training-floor", "personal-corner"] },
    ],
    decorations: [
      { id: "hearth", type: "fireplace", x: 22, y: 1, width: 4, height: 2, solid: true },
      { id: "hall-table", type: "table", x: 21, y: 10, width: 6, height: 2, solid: true },
      { id: "hall-rug", type: "rug", x: 20, y: 7, width: 8, height: 8, solid: false },
      { id: "forge-anvil", type: "station", variant: "forge", x: 6, y: 5, width: 2, height: 2, solid: true, interaction: "blacksmith" },
      { id: "forge-rack", type: "weapon-rack", x: 2, y: 11, width: 1, height: 4, solid: true },
      { id: "alchemy-station", type: "station", variant: "alchemy", x: 41, y: 5, width: 2, height: 2, solid: true, interaction: "alchemy" },
      { id: "formation-table", type: "station", variant: "formation", x: 35, y: 12, width: 3, height: 2, solid: true, interaction: "formation" },
      { id: "archive-shelf-west", type: "bookshelf", x: 33, y: 2, width: 5, height: 1, solid: true },
      { id: "archive-shelf-east", type: "bookshelf", x: 40, y: 2, width: 5, height: 1, solid: true },
      { id: "training-dummy-sword", type: "training-dummy", x: 18, y: 23, width: 1, height: 1, solid: true, interaction: "training" },
      { id: "training-dummy-step", type: "training-dummy", x: 25, y: 25, width: 1, height: 1, solid: true, interaction: "training" },
      { id: "personal-rug", type: "rug", x: 34, y: 22, width: 9, height: 7, solid: false },
      { id: "personal-bed", type: "bed", x: 43, y: 27, width: 2, height: 3, solid: true, interaction: "rest" },
      { id: "healing-well", type: "well", x: 34, y: 26, width: 2, height: 2, solid: true, interaction: "heal", label: "Moonwater Well" },
      { id: "personal-chest", type: "chest", x: 39, y: 29, width: 2, height: 1, solid: true, interaction: "storage", storage: "infinite", label: "Boundless Cedar Chest" },
      { id: "meditation-seat", type: "station", variant: "meditation", x: 39, y: 23, width: 1, height: 1, solid: true, interaction: "meditate" },
      { id: "torch-nw", type: "torch", x: 2, y: 2, width: 1, height: 1, solid: false },
      { id: "torch-ne", type: "torch", x: 45, y: 2, width: 1, height: 1, solid: false },
      { id: "torch-hall-w", type: "torch", x: 18, y: 5, width: 1, height: 1, solid: false },
      { id: "torch-hall-e", type: "torch", x: 29, y: 5, width: 1, height: 1, solid: false },
      { id: "torch-training-w", type: "torch", x: 3, y: 20, width: 1, height: 1, solid: false },
      { id: "torch-training-e", type: "torch", x: 29, y: 20, width: 1, height: 1, solid: false },
      { id: "torch-personal-w", type: "torch", x: 33, y: 21, width: 1, height: 1, solid: false },
      { id: "torch-personal-e", type: "torch", x: 45, y: 21, width: 1, height: 1, solid: false },

      // Great Hall: low furniture around the central rug leaves a broad ceremonial
      // aisle between the hearth, training floor, and south entrance.
      { id: "hall-shelf-west", type: "bookshelf", x: 18, y: 3, width: 3, height: 1, solid: true },
      { id: "hall-shelf-east", type: "bookshelf", x: 27, y: 3, width: 3, height: 1, solid: true },
      { id: "hall-tea-west", type: "table", x: 18, y: 16, width: 3, height: 1, solid: true },
      { id: "hall-tea-east", type: "table", x: 27, y: 16, width: 3, height: 1, solid: true },
      { id: "hall-shrine-west", type: "station", variant: "shrine", x: 18, y: 10, width: 1, height: 2, solid: true },
      { id: "hall-shrine-east", type: "station", variant: "shrine", x: 29, y: 10, width: 1, height: 2, solid: true },
      { id: "torch-hall-south-west", type: "torch", x: 18, y: 17, width: 1, height: 1, solid: false },
      { id: "torch-hall-south-east", type: "torch", x: 29, y: 17, width: 1, height: 1, solid: false },

      // Forge Wing: work surfaces and storage hug the perimeter so Ren and every
      // station remain approachable from the east door.
      { id: "forge-rug", type: "rug", x: 4, y: 7, width: 9, height: 6, solid: false },
      { id: "forge-workbench-north", type: "table", x: 3, y: 3, width: 3, height: 1, solid: true },
      { id: "forge-supply-table", type: "table", x: 12, y: 3, width: 2, height: 2, solid: true },
      { id: "forge-tempering-station", type: "station", variant: "tempering", x: 4, y: 13, width: 2, height: 2, solid: true },
      { id: "forge-rack-east", type: "weapon-rack", x: 14, y: 11, width: 1, height: 4, solid: true },
      { id: "forge-tool-shelf", type: "bookshelf", x: 8, y: 14, width: 4, height: 1, solid: true },
      { id: "torch-forge-door", type: "torch", x: 15, y: 7, width: 1, height: 1, solid: false },
      { id: "torch-forge-south", type: "torch", x: 7, y: 15, width: 1, height: 1, solid: false },

      // Archive Wing: reading, alchemy, and formation work share one carpeted
      // study, with the center kept open for the two resident scholars.
      { id: "archive-rug", type: "rug", x: 34, y: 5, width: 10, height: 9, solid: false },
      { id: "archive-shelf-west-wall", type: "bookshelf", x: 33, y: 4, width: 1, height: 5, solid: true },
      { id: "archive-shelf-east-wall", type: "bookshelf", x: 45, y: 4, width: 1, height: 5, solid: true },
      { id: "archive-reading-table", type: "table", x: 35, y: 5, width: 3, height: 1, solid: true },
      { id: "archive-herb-table", type: "table", x: 42, y: 11, width: 3, height: 1, solid: true },
      { id: "archive-scroll-shelf", type: "bookshelf", x: 33, y: 15, width: 5, height: 1, solid: true },
      { id: "archive-formula-shelf", type: "bookshelf", x: 41, y: 15, width: 4, height: 1, solid: true },
      { id: "torch-archive-door", type: "torch", x: 32, y: 7, width: 1, height: 1, solid: false },
      { id: "torch-archive-south", type: "torch", x: 45, y: 14, width: 1, height: 1, solid: false },

      // Training Floor: several distinct practice lanes break up the large room.
      // The x=23/24 route remains clear from the entrance into the Great Hall.
      { id: "training-rug-west", type: "rug", x: 4, y: 20, width: 11, height: 5, solid: false },
      { id: "training-rug-south", type: "rug", x: 4, y: 27, width: 11, height: 4, solid: false },
      { id: "training-rug-east", type: "rug", x: 16, y: 20, width: 13, height: 3, solid: false },
      { id: "training-rack-west", type: "weapon-rack", x: 3, y: 22, width: 1, height: 5, solid: true },
      { id: "training-rack-east", type: "weapon-rack", x: 29, y: 23, width: 1, height: 5, solid: true },
      { id: "training-dummy-west", type: "training-dummy", x: 7, y: 23, width: 1, height: 1, solid: true, interaction: "training" },
      { id: "training-dummy-center", type: "training-dummy", x: 12, y: 24, width: 1, height: 1, solid: true, interaction: "training" },
      { id: "training-dummy-north", type: "training-dummy", x: 14, y: 20, width: 1, height: 1, solid: true, interaction: "training" },
      { id: "training-equipment-table", type: "table", x: 5, y: 30, width: 4, height: 1, solid: true },
      { id: "training-scroll-table", type: "table", x: 10, y: 30, width: 4, height: 1, solid: true },
      { id: "training-breathing-seat", type: "station", variant: "meditation", x: 20, y: 20, width: 1, height: 1, solid: true },
      { id: "torch-training-south-west", type: "torch", x: 3, y: 30, width: 1, height: 1, solid: false },
      { id: "torch-training-south-east", type: "torch", x: 29, y: 30, width: 1, height: 1, solid: false },

      // Cultivator's Corner: private study and refreshment details frame the
      // existing chest, well, bed, and meditation seat without crowding them.
      { id: "personal-writing-table", type: "table", x: 33, y: 22, width: 3, height: 1, solid: true },
      { id: "personal-bookshelf", type: "bookshelf", x: 41, y: 21, width: 4, height: 1, solid: true },
      { id: "personal-tea-station", type: "station", variant: "tea", x: 43, y: 23, width: 2, height: 1, solid: true },
      { id: "personal-wardrobe", type: "weapon-rack", x: 45, y: 25, width: 1, height: 4, solid: true },
      { id: "personal-foot-rug", type: "rug", x: 38, y: 30, width: 5, height: 1, solid: false },
      { id: "torch-personal-south-west", type: "torch", x: 33, y: 30, width: 1, height: 1, solid: false },
      { id: "torch-personal-south-east", type: "torch", x: 44, y: 30, width: 1, height: 1, solid: false },
    ],
    npcs: [
      { id: "quartermaster-lian", name: "Quartermaster Lian", role: "Quartermaster", service: "quartermaster", x: 20, y: 14, skin: "warm", palette: { robe: "#4d8361", trim: "#d6bd73", hair: "#272624" }, dialogue: "Our doors stay open to every cultivator who protects the crossroads." },
      { id: "blacksmith-ren", name: "Ren Ashhand", role: "Blacksmith", service: "blacksmith", x: 9, y: 8, skin: "umber", palette: { robe: "#713b31", trim: "#e28a43", hair: "#1e1715" }, dialogue: "A weapon has a temper. Bring me one worth listening to." },
      { id: "tutor-mei", name: "Mei Cloudstep", role: "Movement Tutor", service: "movement-tutor", x: 26, y: 27, skin: "golden", palette: { robe: "#456f87", trim: "#b7e5ed", hair: "#293947" }, dialogue: "Speed begins before the foot moves. Empty your thoughts and try again." },
      { id: "tutor-jian", name: "Jian of Seven Cuts", role: "Sword Tutor", service: "sword-tutor", x: 18, y: 27, skin: "light", palette: { robe: "#66558c", trim: "#e2d7ff", hair: "#303039" }, dialogue: "Power is wasted without timing. Show me the instant you choose to strike." },
      { id: "alchemist-suyin", name: "Suyin Reed", role: "Alchemist", service: "alchemist", x: 39, y: 8, skin: "olive", palette: { robe: "#486f52", trim: "#c7db75", hair: "#34291e" }, dialogue: "Every weed is a medicine when gathered beneath the proper star." },
      { id: "scholar-bo", name: "Scholar Bo", role: "Formation Scholar", service: "formation-scholar", action: "heavenly_ascension", x: 39, y: 14, skin: "deep", palette: { robe: "#394c78", trim: "#8fd1d9", hair: "#181b29" }, dialogue: "The world is already a formation. We merely persuade its lines to bend." },
      { id: "caretaker-yao", name: "Caretaker Yao", role: "Healer and Caretaker", service: "healer-caretaker", x: 36, y: 30, skin: "bronze", palette: { robe: "#7b4d67", trim: "#f1b7ce", hair: "#eee3d1" }, dialogue: "The Moonwater remembers you whole. Drink, breathe, and begin once more." },
      { id: "storyteller-wu", name: "Old Wu Lantern", role: "Storyteller", service: "storyteller", x: 28, y: 13, skin: "weathered", palette: { robe: "#765d3e", trim: "#deb86a", hair: "#c7c2b5" }, dialogue: "Sit by the hearth. The roads remember stories that maps refuse to hold." },
      { id: "steward-shan", name: "Shan Willowmark", role: "Sanctuary Steward", service: "sanctuary-steward", x: 24, y: 5, skin: "willow", palette: { robe: "#526c45", trim: "#e4ce84", hair: "#202b24" }, dialogue: "Every hall has a rhythm. In time, you will learn which footsteps belong here." },
      { id: "apprentice-huo", name: "Huo Lin", role: "Forge Apprentice", service: "forge-apprentice", x: 12, y: 9, skin: "copper", palette: { robe: "#884b34", trim: "#f2ad57", hair: "#3a211a" }, dialogue: "Master Ren says I am not ready for spirit steel. Ordinary steel already keeps me busy." },
      { id: "novice-nari", name: "Nari Inkstone", role: "Archive Novice", service: "archive-novice", x: 35, y: 10, skin: "rose", palette: { robe: "#59628f", trim: "#d7b5dc", hair: "#442d3d" }, dialogue: "I catalogue the harmless scrolls. The dangerous ones have a habit of cataloguing themselves." },
      { id: "disciple-toma", name: "Toma Reed", role: "Junior Disciple", service: "junior-disciple", x: 9, y: 27, skin: "sunlit", palette: { robe: "#477277", trim: "#f0cf75", hair: "#513928" }, dialogue: "I keep losing count after the hundredth stance. Perhaps that is when practice truly begins." },
    ],
    personalCorner: {
      zoneId: "personal-corner",
      owner: "player",
      features: ["personal-chest", "healing-well", "personal-bed", "meditation-seat"],
    },
  });

  function copyEntry(entry) {
    const copy = Object.assign({}, entry);
    if (entry.palette) copy.palette = Object.assign({}, entry.palette);
    if (entry.connects) copy.connects = entry.connects.slice();
    return copy;
  }

  function createSanctuary(options) {
    options = options || {};
    return {
      id: SANCTUARY.id,
      name: SANCTUARY.name,
      width: SANCTUARY.width,
      height: SANCTUARY.height,
      tileSize: SANCTUARY.tileSize,
      entrance: copyEntry(SANCTUARY.entrance),
      spawn: copyEntry(options.spawn || SANCTUARY.spawn),
      zones: SANCTUARY.zones.map(copyEntry),
      blockers: SANCTUARY.blockers.map(copyEntry),
      doors: SANCTUARY.doors.map(copyEntry),
      decorations: SANCTUARY.decorations.map(copyEntry),
      npcs: SANCTUARY.npcs.map((npc) => Object.assign(copyEntry(npc), { enabled: true })),
      personalCorner: { zoneId: SANCTUARY.personalCorner.zoneId, owner: options.owner || "player", features: SANCTUARY.personalCorner.features.slice() },
    };
  }

  function contains(rect, x, y) {
    return x >= rect.x && y >= rect.y && x < rect.x + (rect.width || 1) && y < rect.y + (rect.height || 1);
  }

  function isPassable(sanctuary, x, y, options) {
    sanctuary = sanctuary || SANCTUARY;
    options = options || {};
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x >= sanctuary.width || y >= sanctuary.height) return false;
    const inDoor = (sanctuary.doors || []).some((door) => contains(door, x, y));
    if (!inDoor && (sanctuary.blockers || []).some((blocker) => contains(blocker, x, y))) return false;
    if (!options.ignoreDecorations && (sanctuary.decorations || []).some((item) => item.solid && contains(item, x, y))) return false;
    if (!options.ignoreOccupants && (sanctuary.npcs || []).some((npc) => npc.enabled !== false && contains(npc, x, y))) return false;
    return true;
  }

  function interactionPoint(entry) {
    return { x: entry.x + ((entry.width || 1) - 1) / 2, y: entry.y + ((entry.height || 1) - 1) / 2 };
  }

  function nearestInteractable(sanctuary, x, y, maxDistance) {
    sanctuary = sanctuary || SANCTUARY;
    maxDistance = Number.isFinite(maxDistance) ? Math.max(0, maxDistance) : 2.25;
    const candidates = [];
    (sanctuary.npcs || []).forEach((npc) => {
      if (npc.enabled === false) return;
      candidates.push(Object.assign({ kind: "npc", interaction: "dialogue" }, npc));
    });
    (sanctuary.decorations || []).forEach((item) => {
      if (item.interaction) candidates.push(Object.assign({ kind: "decoration" }, item));
    });
    (sanctuary.doors || []).forEach((door) => {
      if (door.interaction) candidates.push(Object.assign({ kind: "door" }, door));
    });
    let nearest = null;
    let nearestDistanceSq = maxDistance * maxDistance;
    candidates.forEach((candidate) => {
      const point = interactionPoint(candidate);
      const distanceSq = (point.x - x) ** 2 + (point.y - y) ** 2;
      if (distanceSq <= nearestDistanceSq) {
        nearestDistanceSq = distanceSq;
        nearest = Object.assign({}, candidate, { distance: Math.sqrt(distanceSq) });
      }
    });
    return nearest;
  }

  function validateLocation(sanctuary, location, options) {
    return !!location && isPassable(sanctuary, Number(location.x), Number(location.y), options);
  }

  function sanitizeLocation(sanctuary, location, fallback, options) {
    sanctuary = sanctuary || SANCTUARY;
    fallback = fallback || sanctuary.spawn || SANCTUARY.spawn;
    if (validateLocation(sanctuary, location, options)) return { x: Number(location.x), y: Number(location.y) };
    if (validateLocation(sanctuary, fallback, options)) return { x: Number(fallback.x), y: Number(fallback.y) };
    for (let y = 1; y < sanctuary.height - 1; y += 1) {
      for (let x = 1; x < sanctuary.width - 1; x += 1) {
        if (isPassable(sanctuary, x, y, options)) return { x, y };
      }
    }
    return { x: 0, y: 0 };
  }

  return {
    TILE_SIZE,
    SANCTUARY,
    createSanctuary,
    isPassable,
    nearestInteractable,
    validateLocation,
    sanitizeLocation,
  };
});
