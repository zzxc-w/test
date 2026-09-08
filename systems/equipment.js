(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.EquipmentSystem = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = 1;
  const DEFAULT_COLS = 6;
  const DEFAULT_ROWS = 5;
  const SLOTS = Object.freeze(['weapon', 'armor', 'pendant']);
  const MULTIPLIERS = Object.freeze([
    'damageMultiplier',
    'attackCooldownMultiplier',
    'dashCooldownMultiplier',
    'moveSpeedMultiplier',
    'parryWindowMultiplier',
    'qiGainMultiplier'
  ]);
  const ADDITIVE = Object.freeze([
    'reachBonus',
    'maxHpBonus',
    'defense',
    'lootChanceBonus',
    'attackArcBonus'
  ]);

  const definitions = [
    {
      id: 'sect_iron_sword', name: 'Sect Iron Sword', type: 'weapon', slot: 'weapon',
      build: 'sword', rarity: 'common', price: 6, size: [1, 3], description: 'A balanced blade issued to wandering disciples.',
      stats: { damageMultiplier: 1, attackCooldownMultiplier: 1, weaponStyle: 'sword' }
    },
    {
      id: 'cloudpiercer_spear', name: 'Cloudpiercer Spear', type: 'weapon', slot: 'weapon',
      build: 'spear', rarity: 'uncommon', price: 16, size: [1, 4], description: 'Long reach and deliberate thrusts keep danger at a distance.',
      stats: { damageMultiplier: 0.94, attackCooldownMultiplier: 1.08, reachBonus: 24, attackArcBonus: -0.18, weaponStyle: 'spear' }
    },
    {
      id: 'twin_moon_blades', name: 'Twin Moon Blades', type: 'weapon', slot: 'weapon',
      build: 'dual_swords', rarity: 'uncommon', price: 18, size: [2, 2], description: 'Paired blades for relentless close-range pressure.',
      stats: { damageMultiplier: 0.72, attackCooldownMultiplier: 0.66, dashCooldownMultiplier: 0.9, reachBonus: -5, weaponStyle: 'dual_swords' }
    },
    {
      id: 'mountain_cleaver', name: 'Mountain Cleaver', type: 'weapon', slot: 'weapon',
      build: 'greatsword', rarity: 'rare', price: 28, size: [2, 4], description: 'A vast spirit-steel sword whose weight rewards commitment.',
      stats: { damageMultiplier: 1.68, attackCooldownMultiplier: 1.55, reachBonus: 11, attackArcBonus: 0.28, weaponStyle: 'greatsword' }
    },
    {
      id: 'wanderer_robes', name: 'Wanderer Robes', type: 'armor', slot: 'armor',
      build: 'sword', rarity: 'common', price: 5, size: [2, 3], description: 'Light robes suited to a balanced sword path.',
      stats: { defense: 0.04, maxHpBonus: 8, moveSpeedMultiplier: 1.02 }
    },
    {
      id: 'cloudpiercer_mail', name: 'Cloudpiercer Mail', type: 'armor', slot: 'armor',
      build: 'spear', rarity: 'uncommon', price: 20, size: [2, 3], description: 'Lamellar armor that stays flexible in a spear stance.',
      stats: { defense: 0.1, maxHpBonus: 15, moveSpeedMultiplier: 0.98 }
    },
    {
      id: 'moonshadow_garb', name: 'Moonshadow Garb', type: 'armor', slot: 'armor',
      build: 'dual_swords', rarity: 'uncommon', price: 21, size: [2, 3], description: 'Silent battle garb woven for evasive cultivators.',
      stats: { defense: 0.05, maxHpBonus: 6, moveSpeedMultiplier: 1.08, dashCooldownMultiplier: 0.92 }
    },
    {
      id: 'mountain_guard_plate', name: 'Mountain Guard Plate', type: 'armor', slot: 'armor',
      build: 'greatsword', rarity: 'rare', price: 30, size: [2, 3], description: 'Heavy plate that lets its wearer trade blows without yielding.',
      stats: { defense: 0.2, maxHpBonus: 30, moveSpeedMultiplier: 0.9 }
    },
    {
      id: 'steady_heart_pendant', name: 'Steady Heart Pendant', type: 'pendant', slot: 'pendant',
      build: 'sword', rarity: 'common', price: 9, size: [1, 1], description: 'A simple focus for measured attacks and clean deflections.',
      stats: { parryWindowMultiplier: 1.12, qiGainMultiplier: 1.05 }
    },
    {
      id: 'far_horizon_jade', name: 'Far Horizon Jade', type: 'pendant', slot: 'pendant',
      build: 'spear', rarity: 'uncommon', price: 18, size: [1, 1], description: 'Sharpens awareness at the outer edge of a spear form.',
      stats: { reachBonus: 4, parryWindowMultiplier: 1.08, lootChanceBonus: 0.03 }
    },
    {
      id: 'moonstep_charm', name: 'Moonstep Charm', type: 'pendant', slot: 'pendant',
      build: 'dual_swords', rarity: 'uncommon', price: 20, size: [1, 1], description: 'Stores momentum between a flurry and the next evasive step.',
      stats: { dashCooldownMultiplier: 0.86, moveSpeedMultiplier: 1.04 }
    },
    {
      id: 'earthpulse_medallion', name: 'Earthpulse Medallion', type: 'pendant', slot: 'pendant',
      build: 'greatsword', rarity: 'rare', price: 27, size: [1, 1], description: 'Turns rooted resolve into strength and resilience.',
      stats: { damageMultiplier: 1.08, defense: 0.05, maxHpBonus: 12 }
    }
  ];

  const CATALOG = Object.freeze(Object.fromEntries(definitions.map((item) => [item.id, deepFreeze(item)])));
  const SET_BONUSES = Object.freeze({
    sword: deepFreeze({ parryWindowMultiplier: 1.08, damageMultiplier: 1.04 }),
    spear: deepFreeze({ reachBonus: 8, damageMultiplier: 1.06 }),
    dual_swords: deepFreeze({ dashCooldownMultiplier: 0.85, attackCooldownMultiplier: 0.94 }),
    greatsword: deepFreeze({ defense: 0.08, maxHpBonus: 15 })
  });
  let uidSequence = 0;

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.freeze(value);
    Object.keys(value).forEach((key) => deepFreeze(value[key]));
    return value;
  }

  function finiteInt(value, fallback, min, max) {
    if (value === null || value === undefined || value === '') return fallback;
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, Math.floor(number)));
  }

  function cleanUid(uid) {
    return typeof uid === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(uid) ? uid : null;
  }

  function nextUid(existing) {
    const used = existing || new Set();
    let uid;
    do {
      uidSequence += 1;
      uid = 'gear_' + Date.now().toString(36) + '_' + uidSequence.toString(36);
    } while (used.has(uid));
    return uid;
  }

  function getDefinition(itemId) {
    return typeof itemId === 'string' ? CATALOG[itemId] || null : null;
  }

  function createInstance(itemId, uid) {
    if (!getDefinition(itemId)) return null;
    return { uid: cleanUid(uid) || nextUid(), itemId: itemId, x: null, y: null };
  }

  function blankInventory(cols, rows) {
    return {
      version: VERSION,
      cols: finiteInt(cols, DEFAULT_COLS, 2, 12),
      rows: finiteInt(rows, DEFAULT_ROWS, 2, 12),
      items: [],
      equipped: { weapon: null, armor: null, pendant: null }
    };
  }

  function createInventory(options) {
    const opts = options || {};
    const state = blankInventory(opts.cols, opts.rows);
    const starterIds = Array.isArray(opts.starterItems)
      ? opts.starterItems
      : ['sect_iron_sword', 'wanderer_robes'];
    starterIds.forEach((itemId) => addItem(state, itemId));
    if (opts.autoEquip !== false) {
      state.items.slice().forEach((item) => equipItem(state, item.uid));
    }
    return state;
  }

  function itemByUid(state, uid) {
    return state && Array.isArray(state.items) ? state.items.find((item) => item.uid === uid) || null : null;
  }

  function isEquipped(state, uid) {
    return SLOTS.some((slot) => state.equipped[slot] === uid);
  }

  function occupiedCells(state, ignoredUid) {
    const occupied = new Set();
    state.items.forEach((item) => {
      if (item.uid === ignoredUid || isEquipped(state, item.uid)) return;
      const definition = getDefinition(item.itemId);
      if (!definition || !Number.isInteger(item.x) || !Number.isInteger(item.y)) return;
      for (let y = item.y; y < item.y + definition.size[1]; y += 1) {
        for (let x = item.x; x < item.x + definition.size[0]; x += 1) occupied.add(x + ':' + y);
      }
    });
    return occupied;
  }

  function canPlace(state, itemOrId, x, y, ignoredUid) {
    const definition = getDefinition(typeof itemOrId === 'string' ? itemOrId : itemOrId && itemOrId.itemId);
    if (!definition || !Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0) return false;
    if (x + definition.size[0] > state.cols || y + definition.size[1] > state.rows) return false;
    const occupied = occupiedCells(state, ignoredUid);
    for (let row = y; row < y + definition.size[1]; row += 1) {
      for (let col = x; col < x + definition.size[0]; col += 1) {
        if (occupied.has(col + ':' + row)) return false;
      }
    }
    return true;
  }

  function firstOpenPosition(state, itemOrId, ignoredUid) {
    for (let y = 0; y < state.rows; y += 1) {
      for (let x = 0; x < state.cols; x += 1) {
        if (canPlace(state, itemOrId, x, y, ignoredUid)) return { x: x, y: y };
      }
    }
    return null;
  }

  function addItem(state, itemOrId, preferredPosition) {
    const itemId = typeof itemOrId === 'string' ? itemOrId : itemOrId && itemOrId.itemId;
    if (!getDefinition(itemId)) return { ok: false, reason: 'unknown-item' };
    const used = new Set(state.items.map((item) => item.uid));
    let uid = cleanUid(itemOrId && itemOrId.uid);
    if (!uid || used.has(uid)) uid = nextUid(used);
    const item = createInstance(itemId, uid);
    let position = null;
    if (preferredPosition && canPlace(state, item, preferredPosition.x, preferredPosition.y)) {
      position = { x: preferredPosition.x, y: preferredPosition.y };
    } else {
      position = firstOpenPosition(state, item);
    }
    if (!position) return { ok: false, reason: 'inventory-full' };
    item.x = position.x;
    item.y = position.y;
    state.items.push(item);
    return { ok: true, item: item };
  }

  function moveItem(state, uid, x, y) {
    const item = itemByUid(state, uid);
    if (!item) return { ok: false, reason: 'item-not-found' };
    if (isEquipped(state, uid)) return { ok: false, reason: 'item-equipped' };
    if (!canPlace(state, item, x, y, uid)) return { ok: false, reason: 'space-blocked' };
    item.x = x;
    item.y = y;
    return { ok: true, item: item };
  }

  function removeItem(state, uid) {
    const index = state.items.findIndex((item) => item.uid === uid);
    if (index < 0) return { ok: false, reason: 'item-not-found' };
    SLOTS.forEach((slot) => { if (state.equipped[slot] === uid) state.equipped[slot] = null; });
    const item = state.items.splice(index, 1)[0];
    return { ok: true, item: item };
  }

  function equipItem(state, uid) {
    const item = itemByUid(state, uid);
    const definition = item && getDefinition(item.itemId);
    if (!definition) return { ok: false, reason: 'item-not-found' };
    const slot = definition.slot;
    if (state.equipped[slot] === uid) return { ok: true, item: item, alreadyEquipped: true };
    const previousUid = state.equipped[slot];
    const previous = previousUid && itemByUid(state, previousUid);
    const original = { x: item.x, y: item.y };
    item.x = null;
    item.y = null;
    if (previous) {
      const position = firstOpenPosition(state, previous);
      if (!position) {
        item.x = original.x;
        item.y = original.y;
        return { ok: false, reason: 'inventory-full' };
      }
      previous.x = position.x;
      previous.y = position.y;
    }
    state.equipped[slot] = uid;
    return { ok: true, item: item, unequipped: previous || null };
  }

  function unequipItem(state, slot) {
    if (!SLOTS.includes(slot)) return { ok: false, reason: 'unknown-slot' };
    const uid = state.equipped[slot];
    if (!uid) return { ok: true, item: null };
    const item = itemByUid(state, uid);
    if (!item) {
      state.equipped[slot] = null;
      return { ok: false, reason: 'item-not-found' };
    }
    const position = firstOpenPosition(state, item);
    if (!position) return { ok: false, reason: 'inventory-full' };
    item.x = position.x;
    item.y = position.y;
    state.equipped[slot] = null;
    return { ok: true, item: item };
  }

  function getEquipped(state, slot) {
    if (slot) return SLOTS.includes(slot) ? itemByUid(state, state.equipped[slot]) : null;
    return Object.fromEntries(SLOTS.map((name) => [name, itemByUid(state, state.equipped[name])]));
  }

  function listBagItems(state) {
    return state.items.filter((item) => !isEquipped(state, item.uid));
  }

  function quotePurchase(itemId, balance) {
    const item = getDefinition(itemId);
    if (!item) return { ok: false, reason: 'unknown-item', price: 0 };
    const funds = Math.max(0, Number(balance) || 0);
    return { ok: funds >= item.price, reason: funds >= item.price ? null : 'insufficient-funds', price: item.price };
  }

  function purchase(state, itemId, balance) {
    const quote = quotePurchase(itemId, balance);
    if (!quote.ok) return quote;
    const added = addItem(state, itemId);
    if (!added.ok) return { ok: false, reason: added.reason, price: quote.price, balance: Number(balance) || 0 };
    return { ok: true, item: added.item, price: quote.price, balance: (Number(balance) || 0) - quote.price };
  }

  function modifierDefaults() {
    return {
      damageMultiplier: 1,
      attackCooldownMultiplier: 1,
      dashCooldownMultiplier: 1,
      moveSpeedMultiplier: 1,
      parryWindowMultiplier: 1,
      qiGainMultiplier: 1,
      reachBonus: 0,
      maxHpBonus: 0,
      defense: 0,
      lootChanceBonus: 0,
      attackArcBonus: 0,
      weaponStyle: 'unarmed',
      activeSet: null
    };
  }

  function applyModifier(target, modifier) {
    if (!modifier) return;
    MULTIPLIERS.forEach((key) => {
      if (Number.isFinite(modifier[key])) target[key] *= modifier[key];
    });
    ADDITIVE.forEach((key) => {
      if (Number.isFinite(modifier[key])) target[key] += modifier[key];
    });
    if (typeof modifier.weaponStyle === 'string') target.weaponStyle = modifier.weaponStyle;
  }

  function deriveStats(state, base) {
    const result = Object.assign(modifierDefaults(), base || {});
    const equipped = SLOTS.map((slot) => getEquipped(state, slot)).filter(Boolean);
    const builds = [];
    equipped.forEach((item) => {
      const definition = getDefinition(item.itemId);
      applyModifier(result, definition.stats);
      if (definition.build) builds.push(definition.build);
    });
    const matchingSet = Object.keys(SET_BONUSES).find((build) => builds.filter((value) => value === build).length >= 2);
    if (matchingSet) {
      applyModifier(result, SET_BONUSES[matchingSet]);
      result.activeSet = matchingSet;
    }
    result.defense = Math.max(0, Math.min(0.65, result.defense));
    result.attackCooldownMultiplier = Math.max(0.35, result.attackCooldownMultiplier);
    result.dashCooldownMultiplier = Math.max(0.45, result.dashCooldownMultiplier);
    result.moveSpeedMultiplier = Math.max(0.5, result.moveSpeedMultiplier);
    return result;
  }

  function serialize(state) {
    const safe = deserialize(state, { addStartersWhenMissing: false });
    return {
      version: VERSION,
      cols: safe.cols,
      rows: safe.rows,
      items: safe.items.map((item) => ({ uid: item.uid, itemId: item.itemId, x: item.x, y: item.y })),
      equipped: Object.assign({}, safe.equipped)
    };
  }

  function deserialize(raw, options) {
    const opts = options || {};
    let source = raw;
    if (typeof source === 'string') {
      try { source = JSON.parse(source); } catch (_) { source = null; }
    }
    const isInventory = source && typeof source === 'object' && Array.isArray(source.items);
    if (!isInventory) {
      return opts.addStartersWhenMissing === false
        ? blankInventory(source && source.cols, source && source.rows)
        : createInventory({ cols: source && source.cols, rows: source && source.rows, starterItems: opts.starterItems, autoEquip: opts.autoEquip });
    }
    const state = blankInventory(source.cols, source.rows);
    const used = new Set();
    const requestedEquipment = source.equipped && typeof source.equipped === 'object' ? source.equipped : {};
    const candidates = source.items.slice(0, state.cols * state.rows * 3).map((candidate) => {
      if (!candidate || !getDefinition(candidate.itemId)) return null;
      let uid = cleanUid(candidate.uid);
      if (!uid || used.has(uid)) uid = nextUid(used);
      used.add(uid);
      return { uid: uid, itemId: candidate.itemId, x: candidate.x, y: candidate.y };
    }).filter(Boolean);

    SLOTS.forEach((slot) => {
      const requestedUid = cleanUid(requestedEquipment[slot]);
      const item = requestedUid && candidates.find((candidate) => candidate.uid === requestedUid);
      if (item && getDefinition(item.itemId).slot === slot && !SLOTS.some((other) => state.equipped[other] === item.uid)) {
        item.x = null;
        item.y = null;
        state.items.push(item);
        state.equipped[slot] = item.uid;
      }
    });

    candidates.forEach((candidate) => {
      if (state.items.includes(candidate)) return;
      let position = null;
      if (Number.isInteger(candidate.x) && Number.isInteger(candidate.y) && canPlace(state, candidate, candidate.x, candidate.y)) {
        position = { x: candidate.x, y: candidate.y };
      } else {
        position = firstOpenPosition(state, candidate);
      }
      if (!position) return;
      candidate.x = position.x;
      candidate.y = position.y;
      state.items.push(candidate);
    });
    return state;
  }

  return Object.freeze({
    VERSION: VERSION,
    DEFAULT_COLS: DEFAULT_COLS,
    DEFAULT_ROWS: DEFAULT_ROWS,
    SLOTS: SLOTS,
    CATALOG: CATALOG,
    SET_BONUSES: SET_BONUSES,
    getDefinition: getDefinition,
    createInstance: createInstance,
    createInventory: createInventory,
    deserialize: deserialize,
    serialize: serialize,
    itemByUid: itemByUid,
    listBagItems: listBagItems,
    getEquipped: getEquipped,
    canPlace: canPlace,
    firstOpenPosition: firstOpenPosition,
    addItem: addItem,
    moveItem: moveItem,
    removeItem: removeItem,
    equipItem: equipItem,
    unequipItem: unequipItem,
    quotePurchase: quotePurchase,
    purchase: purchase,
    deriveStats: deriveStats
  });
});
