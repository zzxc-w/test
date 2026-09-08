import WebSocket from 'ws';

const apiBase = String(process.argv[2] || '').replace(/\/$/, '');
const origin = process.argv[3] || 'http://127.0.0.1:8000';
if (!apiBase.startsWith('https://')) throw new Error('Usage: node test/live-staging.mjs https://worker.example.workers.dev [origin]');

async function session(name) {
  const response = await fetch(`${apiBase}/v1/session`, {
    method: 'POST',
    headers: { Origin: origin, 'content-type': 'application/json' },
    body: JSON.stringify({ world: 'verdant-star', protocolVersion: 1, mapVersion: 1, rulesetVersion: 1, name }),
  });
  if (!response.ok) throw new Error(`Session failed: ${response.status} ${await response.text()}`);
  return response.json();
}

function openSocket(url, ticket) {
  const socket = new WebSocket(`${url}?ticket=${encodeURIComponent(ticket)}`, { origin });
  const queued = [];
  const waiters = [];
  socket.on('message', (data) => {
    const packet = JSON.parse(String(data));
    const index = waiters.findIndex((waiter) => waiter.predicate(packet));
    if (index >= 0) waiters.splice(index, 1)[0].resolve(packet);
    else queued.push(packet);
  });
  socket.waitFor = (predicate, label, timeoutMs = 8_000) => {
    const found = queued.findIndex(predicate);
    if (found >= 0) return Promise.resolve(queued.splice(found, 1)[0]);
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve };
      waiters.push(waiter);
      setTimeout(() => {
        const index = waiters.indexOf(waiter);
        if (index >= 0) waiters.splice(index, 1);
        reject(new Error(`Timed out waiting for ${label}`));
      }, timeoutMs).unref();
    });
  };
  return socket;
}

async function ready(socket) {
  if (socket.readyState === WebSocket.OPEN) return;
  await new Promise((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
}

const health = await fetch(`${apiBase}/health`).then((response) => response.json());
if (!health.ok) throw new Error('Health check failed');

const [aSession, bSession] = await Promise.all([session('Azure Crane'), session('Jade Fox')]);
const a = openSocket(aSession.websocketUrl, aSession.ticket);
const b = openSocket(bSession.websocketUrl, bSession.ticket);
await Promise.all([ready(a), ready(b)]);
await Promise.all([
  a.waitFor((packet) => packet.type === 'welcome', 'A welcome'),
  b.waitFor((packet) => packet.type === 'welcome', 'B welcome'),
]);

a.send(JSON.stringify({ type: 'presence', seq: 1, x: 1700, y: 1300, facing: 'east', moving: false }));
b.send(JSON.stringify({ type: 'presence', seq: 1, x: 1740, y: 1300, facing: 'west', moving: false }));
await a.waitFor((packet) => packet.type === 'presence' && packet.player?.id === bSession.playerId, 'shared presence');

const dropRequestId = `live_drop_${Date.now()}`;
a.send(JSON.stringify({ type: 'drop_create', requestId: dropRequestId, itemId: 'sect_iron_sword' }));
const [created, spawned] = await Promise.all([
  a.waitFor((packet) => packet.type === 'drop_created' && packet.requestId === dropRequestId, 'drop creation'),
  b.waitFor((packet) => packet.type === 'drop_spawn', 'shared drop visibility'),
]);
if (created.drop?.id !== spawned.drop?.id) throw new Error('Players received different shared drop IDs');
const claimRequestId = `live_claim_${Date.now()}`;
b.send(JSON.stringify({ type: 'drop_claim', requestId: claimRequestId, dropId: created.drop.id }));
const [award, removal] = await Promise.all([
  b.waitFor((packet) => packet.type === 'drop_award' && packet.requestId === claimRequestId, 'drop award'),
  a.waitFor((packet) => packet.type === 'drop_remove' && packet.dropId === created.drop.id, 'drop removal'),
]);
if (award.drop?.itemId !== 'sect_iron_sword' || removal.reason !== 'claimed') throw new Error('Shared drop claim was inconsistent');

a.send(JSON.stringify({ type: 'challenge_request', targetPlayerId: bSession.playerId }));
const offer = await b.waitFor((packet) => packet.type === 'challenge_offer', 'challenge offer');
b.send(JSON.stringify({ type: 'challenge_response', challengeId: offer.challengeId, accept: true }));
const [aStart, bStart] = await Promise.all([
  a.waitFor((packet) => packet.type === 'arena_start', 'A arena start'),
  b.waitFor((packet) => packet.type === 'arena_start', 'B arena start'),
]);
if (aStart.arenaId !== bStart.arenaId) throw new Error('Players received different arena IDs');

const arenaA = openSocket(aStart.websocketUrl, aStart.ticket);
const arenaB = openSocket(bStart.websocketUrl, bStart.ticket);
await Promise.all([ready(arenaA), ready(arenaB)]);
await Promise.all([
  arenaA.waitFor((packet) => packet.type === 'arena_snapshot', 'A arena snapshot'),
  arenaB.waitFor((packet) => packet.type === 'arena_snapshot', 'B arena snapshot'),
]);
arenaA.send(JSON.stringify({ type: 'arena_input', arenaId: aStart.arenaId, seq: 1, moveX: 1, moveY: 0, aimX: 1, aimY: 0, attack: false, parry: false, dash: true }));
await arenaA.waitFor((packet) => packet.type === 'arena_snapshot' && packet.players?.some((player) => player.id === aSession.playerId && player.x > 150), 'authoritative arena movement');

arenaA.close();
await new Promise((resolve) => setTimeout(resolve, 250));
const reconnectA = openSocket(aStart.websocketUrl, aStart.ticket);
await ready(reconnectA);
await reconnectA.waitFor((packet) => packet.type === 'arena_snapshot', 'arena reconnect snapshot');

for (const socket of [reconnectA, arenaB, a, b]) socket.close();
console.log(JSON.stringify({ health: true, presence: true, sharedDrops: true, challenge: true, arena: true, reconnect: true }));
