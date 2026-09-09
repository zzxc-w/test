const test = require("node:test");
const assert = require("node:assert/strict");
const {
  SANCTUARY,
  createSanctuary,
  isPassable,
  nearestInteractable,
  validateLocation,
  sanitizeLocation,
} = require("../sanctuary.js");

function reachableTiles(sanctuary, start) {
  const origin = { x: Math.floor(start.x), y: Math.floor(start.y) };
  const queue = [origin];
  const visited = new Set([`${origin.x},${origin.y}`]);
  while (queue.length) {
    const current = queue.shift();
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
      const next = { x: current.x + dx, y: current.y + dy };
      const key = `${next.x},${next.y}`;
      if (visited.has(key) || !isPassable(sanctuary, next.x, next.y)) return;
      visited.add(key);
      queue.push(next);
    });
  }
  return visited;
}

test("authored sanctuary content is immutable and has unique stable IDs", () => {
  assert.equal(Object.isFrozen(SANCTUARY), true);
  assert.equal(Object.isFrozen(SANCTUARY.npcs), true);
  assert.equal(SANCTUARY.width, 48);
  assert.equal(SANCTUARY.height, 34);
  const entries = [SANCTUARY.zones, SANCTUARY.blockers, SANCTUARY.doors, SANCTUARY.decorations, SANCTUARY.npcs].flat();
  const ids = entries.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("roster provides every planned placeholder service with distinct skins", () => {
  const required = ["quartermaster", "blacksmith", "movement-tutor", "sword-tutor", "alchemist", "formation-scholar", "healer-caretaker", "storyteller"];
  const services = SANCTUARY.npcs.map((npc) => npc.service);
  required.forEach((service) => assert.ok(services.includes(service), `${service} remains represented`));
  assert.ok(SANCTUARY.npcs.length >= 12, "the large sanctuary has a populated resident roster");
  assert.equal(new Set(SANCTUARY.npcs.map((npc) => npc.skin)).size, SANCTUARY.npcs.length);
  SANCTUARY.npcs.forEach((npc) => {
    assert.ok(npc.name && npc.role && npc.dialogue);
    assert.ok(npc.palette.robe && npc.palette.trim && npc.palette.hair);
    assert.equal(isPassable(SANCTUARY, npc.x, npc.y, { ignoreOccupants: true }), true, `${npc.id} stands on valid floor`);
  });
});

test("walls collide, door openings pass, and runtime copies do not mutate authored data", () => {
  const runtime = createSanctuary({ owner: "test-player" });
  assert.equal(isPassable(runtime, 0, 10), false);
  assert.equal(isPassable(runtime, 16, 6), false);
  assert.equal(isPassable(runtime, 16, 8), true);
  assert.equal(isPassable(runtime, 23, 33), true);
  assert.equal(isPassable(runtime, 48, 10), false);
  assert.equal(isPassable(runtime, 34, 26), false, "solid well blocks movement");
  runtime.npcs[0].name = "Changed";
  assert.equal(SANCTUARY.npcs[0].name, "Quartermaster Lian");
  assert.equal(runtime.personalCorner.owner, "test-player");
});

test("entrance reaches every room and every NPC interaction point", () => {
  const sanctuary = createSanctuary();
  const reachable = reachableTiles(sanctuary, sanctuary.spawn);
  [
    { x: 23, y: 33 },
    { x: 8, y: 8 },
    { x: 38, y: 8 },
    { x: 10, y: 24 },
    { x: 38, y: 24 },
  ].forEach((point) => assert.ok(reachable.has(`${point.x},${point.y}`), `reachable ${point.x},${point.y}`));
  sanctuary.npcs.forEach((npc) => {
    const adjacent = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => reachable.has(`${npc.x + dx},${npc.y + dy}`));
    assert.equal(adjacent, true, `${npc.id} can be approached`);
  });
});

test("every zone is intentionally furnished without blocking its navigable floor", () => {
  SANCTUARY.zones.forEach((zone) => {
    const decorations = SANCTUARY.decorations.filter((item) => {
      const centerX = item.x + (item.width || 1) / 2;
      const centerY = item.y + (item.height || 1) / 2;
      return centerX >= zone.x && centerX < zone.x + zone.width && centerY >= zone.y && centerY < zone.y + zone.height;
    });
    const visualTypes = new Set(decorations.map((item) => item.type));
    const openTiles = [];
    for (let y = zone.y; y < zone.y + zone.height; y += 1) {
      for (let x = zone.x; x < zone.x + zone.width; x += 1) {
        if (isPassable(SANCTUARY, x, y)) openTiles.push(`${x},${y}`);
      }
    }
    assert.ok(decorations.length >= 8, `${zone.name} has enough authored detail`);
    assert.ok(visualTypes.size >= 3, `${zone.name} uses varied decoration types`);
    assert.ok(openTiles.length >= zone.width * zone.height * 0.45, `${zone.name} retains generous walking space`);
  });
});

test("training floor and main aisle retain continuous movement lanes", () => {
  const reachable = reachableTiles(SANCTUARY, SANCTUARY.spawn);
  for (let y = 18; y <= 32; y += 1) {
    assert.ok(reachable.has(`23,${y}`), `west aisle tile 23,${y} remains reachable`);
    assert.ok(reachable.has(`24,${y}`), `east aisle tile 24,${y} remains reachable`);
  }
  [
    { x: 5, y: 21 },
    { x: 10, y: 28 },
    { x: 17, y: 24 },
    { x: 28, y: 25 },
  ].forEach((point) => assert.ok(reachable.has(`${point.x},${point.y}`), `practice lane ${point.x},${point.y} remains reachable`));
});

test("personal corner contains healing, infinite storage, rest, and meditation interactions", () => {
  assert.equal(SANCTUARY.personalCorner.owner, "player");
  const features = SANCTUARY.personalCorner.features.map((id) => SANCTUARY.decorations.find((item) => item.id === id));
  assert.equal(features.every(Boolean), true);
  assert.deepEqual(features.map((item) => item.interaction).sort(), ["heal", "meditate", "rest", "storage"]);
  assert.equal(features.find((item) => item.interaction === "storage").storage, "infinite");
});

test("nearest interaction resolves NPCs, fixtures, and the exit within range", () => {
  const sanctuary = createSanctuary();
  assert.equal(nearestInteractable(sanctuary, 20, 14, 1).id, "quartermaster-lian");
  assert.equal(nearestInteractable(sanctuary, 34, 25, 3).interaction, "heal");
  assert.equal(nearestInteractable(sanctuary, 23.5, 32.5, 2).interaction, "exit");
  assert.equal(nearestInteractable(sanctuary, 10, 18, 1), null);
});

test("invalid or obstructed saved locations sanitize to a safe spawn", () => {
  const sanctuary = createSanctuary();
  assert.equal(validateLocation(sanctuary, { x: 10, y: 10 }), true);
  assert.equal(validateLocation(sanctuary, { x: 0, y: 10 }), false);
  assert.deepEqual(sanitizeLocation(sanctuary, { x: NaN, y: -20 }), sanctuary.spawn);
  assert.deepEqual(sanitizeLocation(sanctuary, { x: 10.5, y: 10.25 }), { x: 10.5, y: 10.25 });
});
