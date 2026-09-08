export const LIMITS = Object.freeze({
  maxMessageBytes: 4096,
  maxPlayers: 50,
  presencePerSecond: 8,
  actionsPerSecond: 4,
  challengeDistance: 360,
  challengeTimeoutMs: 15_000,
  reconnectGraceMs: 20_000,
  sessionLifetimeMs: 60 * 60_000,
  arenaTicketLifetimeMs: 60_000,
  worldWidth: 144 * 24,
  worldHeight: 108 * 24,
  worldDropLifetimeMs: 5 * 60_000,
  worldDropClaimDistance: 72,
  maxWorldDrops: 100,
  maxWorldDropsPerPlayer: 5,
});

// The server deliberately owns this allowlist. Clients may only name an item ID;
// position, lifetime, creator and drop identity are all assigned by the WorldRoom.
export const WORLD_DROP_ITEM_IDS = Object.freeze(new Set([
  'sect_iron_sword', 'cloudpiercer_spear', 'twin_moon_blades', 'mountain_cleaver',
  'wanderer_robes', 'cloudpiercer_mail', 'moonshadow_garb', 'mountain_guard_plate',
  'steady_heart_pendant', 'far_horizon_jade', 'moonstep_charm', 'earthpulse_medallion',
]));

export const ARENA = Object.freeze({
  width: 720,
  height: 420,
  playerRadius: 14,
  moveSpeed: 190,
  maxHp: 100,
  attackDamage: 24,
  riposteDamage: 34,
  attackRange: 74,
  attackArcCos: Math.cos(Math.PI * 0.42),
  attackWindupMs: 170,
  attackActiveMs: 90,
  attackRecoveryMs: 260,
  attackCooldownMs: 680,
  parryWindowMs: 155,
  parryCooldownMs: 780,
  staggerMs: 650,
  dashDistance: 78,
  dashCooldownMs: 950,
  dashInvulnerabilityMs: 190,
  dashVisualMs: 150,
  hurtVisualMs: 240,
  hitKnockback: 24,
  parryKnockback: 34,
  roundDurationMs: 90_000,
  tickMs: 1000 / 30,
  snapshotMs: 1000 / 12,
});
