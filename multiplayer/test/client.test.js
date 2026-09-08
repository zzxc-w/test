"use strict";

const assert = require("assert");
const { createConfig } = require("../config.js");
const { PresenceStore } = require("../presence.js");
const { WorldDropStore } = require("../drops.js");
const { ChallengeController } = require("../challenges.js");
const { ArenaClient, createArenaInputState } = require("../arena.js");
const { MultiplayerClient } = require("../client.js");

function testConfig() {
  const config = createConfig({ apiBase: "https://worker.example/", enabled: true });
  assert.equal(config.apiBase, "https://worker.example");
  assert.equal(config.presenceHz, 5);
  assert(Object.isFrozen(config));
}

function testPresence() {
  const store = new PresenceStore({ localPlayerId: "self", interpolationDelayMs: 100, staleAfterMs: 5000 });
  assert.equal(store.ingest({ id: "self", x: 0, y: 0 }, 1000), false);
  store.ingest({ id: "other", name: "Friend", x: 0, y: 0, serverTime: 900 }, 900);
  store.ingest({ id: "other", name: "Friend", x: 10, y: 20, serverTime: 1100, emote: "none", action: "attack" }, 1100);
  const player = store.getRenderable(1100)[0];
  assert.equal(player.x, 5);
  assert.equal(player.y, 10);
  assert.equal(player.emote, null);
  assert.equal(player.action, "attack");
  assert.equal(store.getRenderable(1600)[0].action, "none", 'cosmetic actions must expire');
  assert.equal(store.nearby(0, 0, 12, 1100).length, 1);
  assert.equal(store.ingest({ id: "sequenced", x: 1, y: 1, seq: 2 }, 1100), true);
  assert.equal(store.ingest({ id: "sequenced", x: 9, y: 9, seq: 1 }, 1101), false);
  store.prune(7000);
  assert.equal(store.players.size, 0);
}

function testWorldDrops() {
  const store = new WorldDropStore();
  const drop = { id: '12345678-1234-1234-1234-123456789abc', itemId: 'cloudpiercer_spear', x: 10, y: 20, createdAt: 900, expiresAt: 2000 };
  assert(store.ingest(drop));
  assert.equal(store.nearby(10, 10, 11, 1000).length, 1);
  assert.equal(store.nearby(100, 100, 10, 1000).length, 0);
  assert.equal(store.list(2001).length, 0, 'expired shared drops should disappear locally');
  assert.equal(store.ingest({ ...drop, id: '../bad' }), false);
}

function testChallenges() {
  let now = 1000;
  const sent = [];
  const challenges = new ChallengeController({ now: () => now, timeoutMs: 15000, send(message) { sent.push(message); return true; } });
  assert(challenges.request("p2"));
  assert.equal(sent[0].type, "challenge_request");
  assert.equal(challenges.request("p3"), false);
  challenges.receiveUpdate({ status: "declined" });
  assert(challenges.receiveOffer({ challengeId: "c1", fromPlayerId: "p2", fromName: "Lotus" }));
  assert(challenges.respond("c1", true));
  assert.deepEqual(sent[1], { type: "challenge_response", challengeId: "c1", accept: true });
  challenges.receiveOffer({ challengeId: "c2", fromPlayerId: "p3" });
  now += 16000;
  assert.equal(challenges.snapshot().offers.length, 0);
  challenges.setIgnoreIncoming(true);
  assert.equal(challenges.receiveOffer({ challengeId: "c3", fromPlayerId: "p4" }), false);
  assert.equal(sent[sent.length - 1].accept, false);
}

function testArena() {
  let now = 0;
  const sent = [];
  const arena = new ArenaClient({ now: () => now, send(message) { sent.push(message); return true; } });
  assert(arena.start({ arenaId: "a1", playerId: "p1" }));
  assert(arena.setInput({ moveX: 99, moveY: -99, aimX: -9, aimY: 0.25, attack: true }, true));
  assert.equal(sent[0].moveX, 1);
  assert.equal(sent[0].moveY, -1);
  assert.equal(sent[0].aimX, -1);
  assert.equal(sent[0].aimY, 0.25);
  assert(!("damage" in sent[0]));
  now = 1;
  assert.equal(arena.setInput({ attack: false }, true), false);
  assert.equal(arena.setInput({ attack: true }, true), false);
  now = 35;
  assert(arena.setInput({ attack: false }, true));
  assert.equal(sent[1].attack, true, 'a fast action press must remain queued through input throttling');
  assert(arena.receiveSnapshot({ arenaId: "a1", tick: 2, players: [] }));
  assert(!arena.receiveSnapshot({ arenaId: "a1", tick: 1, players: [] }));
  arena.end({ winnerId: "p1" });
  assert.equal(arena.active, false);
  const touch = createArenaInputState();
  touch.press("up"); touch.press("right"); touch.press("parry");
  let touchState = touch.snapshot();
  assert.equal(touchState.moveX, 1); assert.equal(touchState.moveY, -1); assert.equal(touchState.parry, true);
  assert(Math.abs(touchState.aimX - Math.SQRT1_2) < 1e-9);
  assert(Math.abs(touchState.aimY + Math.SQRT1_2) < 1e-9);
  touch.release("up");
  assert.equal(touch.snapshot().moveY, 0);
  touchState = touch.releaseAll();
  assert.equal(touchState.moveX, 0); assert.equal(touchState.moveY, 0); assert.equal(touchState.aimX, 1); assert.equal(touchState.aimY, 0);
}

function testArenaPredictionAndInterpolation() {
  let now = 1000;
  const arena = new ArenaClient({ now: () => now, send: () => true });
  arena.start({ arenaId: "fast", playerId: "self" });
  arena.receiveSnapshot({
    arenaId: "fast", tick: 1, serverTime: 1000, timeLeft: 90,
    players: [
      { id: "self", x: 100, y: 100, facing: 0, hp: 100, lastInputSeq: -1 },
      { id: "other", x: 500, y: 100, facing: Math.PI, hp: 100, lastInputSeq: -1 }
    ]
  });
  arena.setInput({ moveX: 1, moveY: 0, aimX: 1, aimY: 0, dash: false }, true);
  now = 1050;
  let players = arena.getRenderablePlayers(now);
  assert(players.find((player) => player.id === "self").x > 108, "local movement should render before another server packet arrives");

  now = 1085;
  arena.receiveSnapshot({
    arenaId: "fast", tick: 2, serverTime: 1083, timeLeft: 89.9,
    players: [
      { id: "self", x: 115, y: 100, facing: 0, hp: 100, lastInputSeq: 1 },
      { id: "other", x: 480, y: 100, facing: Math.PI, hp: 100, lastInputSeq: -1 }
    ]
  });
  players = arena.getRenderablePlayers(1085);
  const remoteX = players.find((player) => player.id === "other").x;
  assert(remoteX < 500 && remoteX > 480, "remote movement should interpolate between buffered snapshots");
  assert(arena.latencyMs > 0, "input acknowledgement should produce a round-trip latency estimate");

  arena.setInput({ moveX: 1, moveY: 0, aimX: 1, aimY: 0, dash: true }, true);
  const beforeDash = arena.localRender.x;
  now = 1120;
  players = arena.getRenderablePlayers(now);
  assert(players.find((player) => player.id === "self").x >= beforeDash, "predicted dash must never move backwards while awaiting authority");

  arena.setInput({ moveX: 1, moveY: 0, aimX: 1, aimY: 0, dash: false, attack: true }, true);
  const mine = arena.getRenderablePlayers(now).find((player) => player.id === "self");
  assert(Number(mine.attackAt) > 0, "local attack animation should begin before its server acknowledgement");
}

class FakeSocket {
  static instances = [];
  constructor(url) { this.url = url; this.readyState = 0; this.sent = []; FakeSocket.instances.push(this); }
  send(value) { this.sent.push(JSON.parse(value)); }
  close() { this.readyState = 3; }
  open() { this.readyState = 1; this.onopen(); }
  message(value) { this.onmessage({ data: JSON.stringify(value) }); }
}

async function testClient() {
  let now = 1000;
  const client = new MultiplayerClient({
    config: { enabled: true, apiBase: "https://worker.example" },
    WebSocket: FakeSocket,
    now: () => now,
    random: () => 0,
    fetch: async () => ({ ok: true, json: async () => ({ playerId: "p1", ticket: "a+b", websocketUrl: "wss://worker.example/world" }) })
  });
  assert(await client.connect({ name: "Tea Sage" }));
  const socket = FakeSocket.instances.pop();
  assert(socket.url.endsWith("ticket=a%2Bb"));
  socket.open();
  assert.equal(client.status, "online");
  assert(client.updatePresence({ x: 2, y: 3, facing: "left", action: "parry" }));
  assert.equal(socket.sent[0].type, "presence");
  assert.equal(socket.sent[0].action, "parry");
  assert.equal(client.updatePresence({ x: 3, y: 4 }), false);
  now += 201;
  assert(client.updatePresence({ x: 3, y: 4 }));
  socket.message({ type: "presence", player: { id: "p2", name: "Friend", x: 4, y: 5 } });
  assert.equal(client.snapshot(now).players.length, 1);
  const dropId = '12345678-1234-1234-1234-123456789abc';
  socket.message({ type: 'drop_spawn', drop: { id: dropId, itemId: 'moonstep_charm', x: 4, y: 5, createdAt: now, expiresAt: now + 5000 } });
  assert.equal(client.listDrops(now).length, 1);
  const createRequest = client.createDrop('sect_iron_sword');
  assert(createRequest && socket.sent.at(-1).type === 'drop_create');
  const claimRequest = client.claimDrop(dropId);
  assert(claimRequest && socket.sent.at(-1).type === 'drop_claim');
  socket.message({ type: 'drop_award', requestId: claimRequest, drop: { id: dropId, itemId: 'moonstep_charm', x: 4, y: 5, createdAt: now, expiresAt: now + 5000 } });
  assert.equal(client.listDrops(now).length, 0);
  socket.message({ type: "challenge_offer", challengeId: "c1", fromPlayerId: "p2" });
  assert.equal(client.challenges.snapshot().offers.length, 1);
  socket.message({ type: "arena_start", arenaId: "a1", playerId: "p1", ticket: "arena ticket", websocketUrl: "wss://worker.example/arena" });
  assert.equal(client.arena.active, true);
  const arenaSocket = FakeSocket.instances.pop();
  assert(arenaSocket.url.endsWith("ticket=arena%20ticket"));
  arenaSocket.open();
  assert(client.arena.setInput({ attack: true }, true));
  assert.equal(arenaSocket.sent[0].type, "arena_input");
  assert.equal(socket.sent.some((message) => message.type === "arena_input"), false);
  arenaSocket.message({ type: "arena_snapshot", arenaId: "a1", tick: 3, players: [] });
  assert.equal(client.arena.snapshot.tick, 3);
  arenaSocket.message({ type: "arena_snapshot", arenaId: "a1", tick: 4, status: "finished", winnerId: "p1", players: [] });
  assert.equal(client.arena.active, false, 'a final snapshot must resume the world even without arena_end');
  assert.equal(client.handleMessage("not json"), false);
  assert.equal(client.handleMessage(JSON.stringify({ type: "client_invented_damage", damage: 9999 })), false);
  client.disconnect();
  assert.equal(client.status, "offline");

  const disabled = new MultiplayerClient({ config: { enabled: false } });
  assert.equal(await disabled.connect(), false);
  assert.equal(disabled.status, "offline");
}

async function testArenaWatchdog() {
  let now = 1000, scheduled = null;
  const timer = { setTimeout(fn) { scheduled = fn; return 1; }, clearTimeout() { scheduled = null; } };
  const client = new MultiplayerClient({
    config: { enabled: true, apiBase: "https://worker.example" }, WebSocket: FakeSocket, now: () => now, timer,
    fetch: async () => ({ ok: true, json: async () => ({ playerId: "p1", ticket: "world", websocketUrl: "wss://worker.example/world" }) })
  });
  await client.connect({ name: "Watchful Sage" });
  const world = FakeSocket.instances.pop(); world.open();
  world.message({ type: "arena_start", arenaId: "stalled", playerId: "p1", ticket: "arena", websocketUrl: "wss://worker.example/arena" });
  const arenaSocket = FakeSocket.instances.pop(); arenaSocket.open();
  assert.equal(client.arena.active, true);
  now = 8000; const watchdog = scheduled; scheduled = null; watchdog();
  assert.equal(client.arena.active, false, 'a stalled open socket must not trap the solo game');
  client.disconnect();
}

async function main() {
  testConfig(); testPresence(); testWorldDrops(); testChallenges(); testArena(); testArenaPredictionAndInterpolation(); await testClient(); await testArenaWatchdog();
  console.log("multiplayer browser client tests passed");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
