import { ARENA } from './constants.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const length = (x, y) => Math.hypot(x, y);

function normalized(x, y, fallbackX = 1, fallbackY = 0) {
  const magnitude = length(x, y);
  return magnitude > 0.0001 ? [x / magnitude, y / magnitude] : [fallbackX, fallbackY];
}

export function createArenaState(playerIds, now = Date.now()) {
  if (!Array.isArray(playerIds) || playerIds.length !== 2 || playerIds[0] === playerIds[1]) {
    throw new Error('An arena requires two distinct players');
  }
  const makePlayer = (id, x, facing) => ({
    id, x, y: ARENA.height / 2, facing, hp: ARENA.maxHp,
    input: { seq: -1, moveX: 0, moveY: 0, aimX: Math.cos(facing), aimY: Math.sin(facing), attack: false, parry: false, dash: false },
    attackAt: 0, attackResolved: true, attackReadyAt: now,
    parryUntil: 0, parryReadyAt: now, dashReadyAt: now,
    invulnerableUntil: 0, staggeredUntil: 0, connected: false,
    disconnectedAt: null,
  });
  return {
    startedAt: now,
    updatedAt: now,
    endsAt: now + ARENA.roundDurationMs,
    winnerId: null,
    reason: null,
    players: {
      [playerIds[0]]: makePlayer(playerIds[0], 150, 0),
      [playerIds[1]]: makePlayer(playerIds[1], ARENA.width - 150, Math.PI),
    },
  };
}

export function applyArenaInput(state, playerId, input) {
  const player = state.players[playerId];
  if (!player || state.winnerId || input.seq <= player.input.seq) return false;
  player.input = { ...input };
  return true;
}

export function stepArena(state, now) {
  if (state.winnerId) return state;
  const dt = clamp((now - state.updatedAt) / 1000, 0, 0.1);
  state.updatedAt = now;
  const players = Object.values(state.players);

  for (const player of players) {
    if (player.hp <= 0 || now < player.staggeredUntil) continue;
    const [aimX, aimY] = normalized(player.input.aimX, player.input.aimY, Math.cos(player.facing), Math.sin(player.facing));
    player.facing = Math.atan2(aimY, aimX);

    if (player.input.parry && now >= player.parryReadyAt && now >= player.attackReadyAt) {
      player.parryUntil = now + ARENA.parryWindowMs;
      player.parryReadyAt = now + ARENA.parryCooldownMs;
    }

    let [moveX, moveY] = normalized(player.input.moveX, player.input.moveY, 0, 0);
    if (length(player.input.moveX, player.input.moveY) < 0.01) moveX = moveY = 0;
    if (player.input.dash && now >= player.dashReadyAt && (moveX || moveY)) {
      player.x += moveX * ARENA.dashDistance;
      player.y += moveY * ARENA.dashDistance;
      player.dashReadyAt = now + ARENA.dashCooldownMs;
      player.invulnerableUntil = now + ARENA.dashInvulnerabilityMs;
    } else {
      player.x += moveX * ARENA.moveSpeed * dt;
      player.y += moveY * ARENA.moveSpeed * dt;
    }
    player.x = clamp(player.x, ARENA.playerRadius, ARENA.width - ARENA.playerRadius);
    player.y = clamp(player.y, ARENA.playerRadius, ARENA.height - ARENA.playerRadius);

    if (player.input.attack && now >= player.attackReadyAt && now >= player.parryUntil) {
      player.attackAt = now;
      player.attackResolved = false;
      player.attackReadyAt = now + ARENA.attackCooldownMs;
    }
  }

  for (const attacker of players) {
    if (attacker.attackResolved || now < attacker.attackAt + ARENA.attackWindupMs) continue;
    if (now > attacker.attackAt + ARENA.attackWindupMs + ARENA.attackActiveMs) {
      attacker.attackResolved = true;
      continue;
    }
    attacker.attackResolved = true;
    const defender = players.find((player) => player.id !== attacker.id);
    if (!defender || now < defender.invulnerableUntil) continue;
    const dx = defender.x - attacker.x;
    const dy = defender.y - attacker.y;
    const distance = length(dx, dy);
    const [nx, ny] = normalized(dx, dy);
    const facingDot = nx * Math.cos(attacker.facing) + ny * Math.sin(attacker.facing);
    if (distance > ARENA.attackRange || facingDot < ARENA.attackArcCos) continue;

    if (now <= defender.parryUntil) {
      attacker.staggeredUntil = now + ARENA.staggerMs;
      defender.attackReadyAt = Math.min(defender.attackReadyAt, now);
      defender.nextRiposte = true;
      continue;
    }
    const damage = attacker.nextRiposte ? ARENA.riposteDamage : ARENA.attackDamage;
    attacker.nextRiposte = false;
    defender.hp = Math.max(0, defender.hp - damage);
    if (defender.hp === 0) finishArena(state, attacker.id, 'defeat');
  }

  if (!state.winnerId && now >= state.endsAt) {
    const [a, b] = players;
    finishArena(state, a.hp === b.hp ? 'draw' : (a.hp > b.hp ? a.id : b.id), 'time');
  }
  return state;
}

export function finishArena(state, winnerId, reason) {
  if (state.winnerId) return;
  state.winnerId = winnerId;
  state.reason = reason;
}

export function publicArenaSnapshot(state, now = Date.now()) {
  return {
    type: 'arena_snapshot',
    tick: Math.floor((now - state.startedAt) / ARENA.tickMs),
    timeLeft: Math.max(0, (state.endsAt - now) / 1000),
    serverTime: now,
    endsAt: state.endsAt,
    winnerId: state.winnerId,
    reason: state.reason,
    players: Object.values(state.players).map((player) => ({
      id: player.id, x: round(player.x), y: round(player.y), facing: round(player.facing), hp: player.hp,
      attackAt: player.attackAt, parryUntil: player.parryUntil,
      staggeredUntil: player.staggeredUntil, invulnerableUntil: player.invulnerableUntil,
      connected: player.connected,
    })),
  };
}

function round(value) {
  return Math.round(value * 100) / 100;
}
