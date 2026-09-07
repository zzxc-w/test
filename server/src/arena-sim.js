import { ARENA } from './constants.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const length = (x, y) => Math.hypot(x, y);

function normalized(x, y, fallbackX = 1, fallbackY = 0) {
  const magnitude = length(x, y);
  return magnitude > 0.0001 ? [x / magnitude, y / magnitude] : [fallbackX, fallbackY];
}

export function createArenaState(playerIds, now = Date.now(), playerNames = {}) {
  if (!Array.isArray(playerIds) || playerIds.length !== 2 || playerIds[0] === playerIds[1]) {
    throw new Error('An arena requires two distinct players');
  }
  const makePlayer = (id, x, facing) => ({
    id, name: playerNames[id] || 'Wandering Cultivator', x, y: ARENA.height / 2, facing, hp: ARENA.maxHp,
    input: { seq: -1, moveX: 0, moveY: 0, aimX: Math.cos(facing), aimY: Math.sin(facing), attack: false, parry: false, dash: false },
    attackAt: 0, attackResolved: true, attackReadyAt: now,
    parryUntil: 0, parryReadyAt: now, dashReadyAt: now,
    invulnerableUntil: 0, staggeredUntil: 0, connected: false,
    dashUntil: 0, hurtUntil: 0, actionSeq: 0,
    pendingActions: { attack: false, parry: false, dash: false },
    disconnectedAt: null,
  });
  return {
    startedAt: now,
    updatedAt: now,
    endsAt: now + ARENA.roundDurationMs,
    winnerId: null,
    reason: null,
    endedAt: null,
    players: {
      [playerIds[0]]: makePlayer(playerIds[0], 150, 0),
      [playerIds[1]]: makePlayer(playerIds[1], ARENA.width - 150, Math.PI),
    },
  };
}

export function applyArenaInput(state, playerId, input) {
  const player = state.players[playerId];
  if (!player || state.winnerId || input.seq <= player.input.seq) return false;
  player.pendingActions ||= { attack: false, parry: false, dash: false };
  for (const action of ['attack', 'parry', 'dash']) {
    if (input[action] && !player.input[action]) player.pendingActions[action] = true;
  }
  player.input = { ...input };
  return true;
}

export function stepArena(state, now) {
  if (state.endedAt != null || state.winnerId) return state;
  const dt = clamp((now - state.updatedAt) / 1000, 0, 0.1);
  state.updatedAt = now;
  const players = Object.values(state.players);

  for (const player of players) {
    player.pendingActions ||= { attack: false, parry: false, dash: false };
    const pressed = {
      attack: player.pendingActions.attack,
      parry: player.pendingActions.parry,
      dash: player.pendingActions.dash,
    };
    player.pendingActions.attack = player.pendingActions.parry = player.pendingActions.dash = false;
    if (player.hp <= 0 || now < player.staggeredUntil) continue;
    const [aimX, aimY] = normalized(player.input.aimX, player.input.aimY, Math.cos(player.facing), Math.sin(player.facing));
    player.facing = Math.atan2(aimY, aimX);

    if (pressed.parry && now >= player.parryReadyAt && now >= player.attackReadyAt) {
      player.parryUntil = now + ARENA.parryWindowMs;
      player.parryReadyAt = now + ARENA.parryCooldownMs;
      player.actionSeq += 1;
    }

    let [moveX, moveY] = normalized(player.input.moveX, player.input.moveY, 0, 0);
    if (length(player.input.moveX, player.input.moveY) < 0.01) moveX = moveY = 0;
    if (pressed.dash && now >= player.dashReadyAt && (moveX || moveY)) {
      player.x += moveX * ARENA.dashDistance;
      player.y += moveY * ARENA.dashDistance;
      player.dashReadyAt = now + ARENA.dashCooldownMs;
      player.invulnerableUntil = now + ARENA.dashInvulnerabilityMs;
      player.dashUntil = now + ARENA.dashVisualMs;
      player.actionSeq += 1;
    } else {
      player.x += moveX * ARENA.moveSpeed * dt;
      player.y += moveY * ARENA.moveSpeed * dt;
    }
    player.x = clamp(player.x, ARENA.playerRadius, ARENA.width - ARENA.playerRadius);
    player.y = clamp(player.y, ARENA.playerRadius, ARENA.height - ARENA.playerRadius);

    if (pressed.attack && now >= player.attackReadyAt && now >= player.parryUntil) {
      player.attackAt = now;
      player.attackResolved = false;
      player.attackReadyAt = now + ARENA.attackCooldownMs;
      player.actionSeq += 1;
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
      pushPlayer(attacker, -nx * ARENA.parryKnockback, -ny * ARENA.parryKnockback);
      defender.attackReadyAt = Math.min(defender.attackReadyAt, now);
      defender.nextRiposte = true;
      attacker.actionSeq += 1;
      continue;
    }
    const damage = attacker.nextRiposte ? ARENA.riposteDamage : ARENA.attackDamage;
    attacker.nextRiposte = false;
    defender.hp = Math.max(0, defender.hp - damage);
    defender.hurtUntil = now + ARENA.hurtVisualMs;
    defender.actionSeq += 1;
    pushPlayer(defender, nx * ARENA.hitKnockback, ny * ARENA.hitKnockback);
    if (defender.hp === 0) finishArena(state, attacker.id, 'defeat');
  }

  separatePlayers(players);

  if (state.endedAt == null && !state.winnerId && now >= state.endsAt) {
    const [a, b] = players;
    finishArena(state, a.hp === b.hp ? 'draw' : (a.hp > b.hp ? a.id : b.id), 'time');
  }
  return state;
}

export function finishArena(state, winnerId, reason) {
  if (state.endedAt != null || state.winnerId) return;
  state.winnerId = winnerId;
  state.reason = reason;
  state.endedAt = state.updatedAt || Date.now();
}

export function publicArenaSnapshot(state, now = Date.now()) {
  return {
    type: 'arena_snapshot',
    tick: Math.floor((now - state.startedAt) / ARENA.tickMs),
    timeLeft: Math.max(0, (state.endsAt - now) / 1000),
    serverTime: now,
    endsAt: state.endsAt,
    status: state.endedAt != null || state.winnerId ? 'finished' : 'active',
    bounds: { width: ARENA.width, height: ARENA.height, playerRadius: ARENA.playerRadius, maxHp: ARENA.maxHp },
    winnerId: state.winnerId,
    reason: state.reason,
    players: Object.values(state.players).map((player) => ({
      id: player.id, name: player.name || 'Wandering Cultivator',
      x: round(player.x), y: round(player.y), facing: round(player.facing), hp: player.hp,
      attackAt: player.attackAt, parryUntil: player.parryUntil,
      staggeredUntil: player.staggeredUntil, invulnerableUntil: player.invulnerableUntil,
      action: actionFor(player, now), actionSeq: player.actionSeq || 0,
      attackPhase: attackPhase(player, now),
      actionStartedAt: actionStartedAt(player, now), actionEndsAt: actionEndsAt(player, now),
      attackReadyAt: player.attackReadyAt, parryReadyAt: player.parryReadyAt, dashReadyAt: player.dashReadyAt,
      connected: player.connected,
    })),
  };
}

function attackPhase(player, now) {
  if (!player.attackAt) return 'idle';
  const elapsed = now - player.attackAt;
  if (elapsed < 0 || elapsed >= ARENA.attackWindupMs + ARENA.attackActiveMs + ARENA.attackRecoveryMs) return 'idle';
  if (elapsed < ARENA.attackWindupMs) return 'windup';
  if (elapsed < ARENA.attackWindupMs + ARENA.attackActiveMs) return 'active';
  return 'recovery';
}

function actionFor(player, now) {
  if (player.hp <= 0) return 'defeated';
  if (now < player.staggeredUntil) return 'staggered';
  if (now < player.hurtUntil) return 'hurt';
  if (now < player.dashUntil) return 'dash';
  if (now < player.parryUntil) return 'parry';
  return attackPhase(player, now) === 'idle' ? 'idle' : 'attack';
}

function actionStartedAt(player, now) {
  const action = actionFor(player, now);
  if (action === 'attack') return player.attackAt;
  if (action === 'parry') return player.parryUntil - ARENA.parryWindowMs;
  if (action === 'dash') return player.dashUntil - ARENA.dashVisualMs;
  if (action === 'hurt') return player.hurtUntil - ARENA.hurtVisualMs;
  if (action === 'staggered') return player.staggeredUntil - ARENA.staggerMs;
  return 0;
}

function actionEndsAt(player, now) {
  const action = actionFor(player, now);
  if (action === 'attack') return player.attackAt + ARENA.attackWindupMs + ARENA.attackActiveMs + ARENA.attackRecoveryMs;
  if (action === 'parry') return player.parryUntil;
  if (action === 'dash') return player.dashUntil;
  if (action === 'hurt') return player.hurtUntil;
  if (action === 'staggered') return player.staggeredUntil;
  return 0;
}

function pushPlayer(player, dx, dy) {
  player.x = clamp(player.x + dx, ARENA.playerRadius, ARENA.width - ARENA.playerRadius);
  player.y = clamp(player.y + dy, ARENA.playerRadius, ARENA.height - ARENA.playerRadius);
}

function separatePlayers(players) {
  if (players.length !== 2) return;
  const [a, b] = players;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const distance = length(dx, dy);
  const minimum = ARENA.playerRadius * 2;
  if (distance >= minimum) return;
  const [nx, ny] = normalized(dx, dy);
  const correction = (minimum - distance) / 2;
  pushPlayer(a, -nx * correction, -ny * correction);
  pushPlayer(b, nx * correction, ny * correction);
}

function round(value) {
  return Math.round(value * 100) / 100;
}
