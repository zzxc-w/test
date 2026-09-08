(function (root, factory) {
  const equipment = typeof module === 'object' && module.exports
    ? require('./equipment.js')
    : root && root.EquipmentSystem;
  const api = factory(equipment);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.StorageSystem = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Equipment) {
  'use strict';

  const VERSION = 1;

  function cleanUid(uid) {
    return typeof uid === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(uid) ? uid : null;
  }

  function knownItem(itemId) {
    return !!(Equipment && Equipment.getDefinition && Equipment.getDefinition(itemId));
  }

  function nextUid(used) {
    let uid;
    do {
      const instance = Equipment && Equipment.createInstance
        ? Equipment.createInstance('sect_iron_sword')
        : null;
      uid = instance && cleanUid(instance.uid);
      if (!uid) uid = 'stored_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
    } while (used.has(uid));
    return uid;
  }

  function createStorage() {
    return { version: VERSION, items: [] };
  }

  function itemByUid(state, uid) {
    return state && Array.isArray(state.items)
      ? state.items.find((item) => item.uid === uid) || null
      : null;
  }

  function listItems(state) {
    return state && Array.isArray(state.items) ? state.items.slice() : [];
  }

  function deserialize(raw) {
    let source = raw;
    if (typeof source === 'string') {
      try { source = JSON.parse(source); } catch (_) { source = null; }
    }
    const state = createStorage();
    if (!source || typeof source !== 'object' || !Array.isArray(source.items)) return state;

    const used = new Set();
    source.items.forEach((candidate) => {
      if (!candidate || typeof candidate !== 'object' || !knownItem(candidate.itemId)) return;
      let uid = cleanUid(candidate.uid);
      if (!uid || used.has(uid)) uid = nextUid(used);
      used.add(uid);
      state.items.push({ uid: uid, itemId: candidate.itemId });
    });
    return state;
  }

  function serialize(state) {
    const safe = deserialize(state);
    return {
      version: VERSION,
      items: safe.items.map((item) => ({ uid: item.uid, itemId: item.itemId }))
    };
  }

  function deposit(state, inventory, uid, options) {
    if (!state || !Array.isArray(state.items)) return { ok: false, reason: 'invalid-storage' };
    if (!inventory || !Array.isArray(inventory.items)) return { ok: false, reason: 'invalid-inventory' };
    const item = Equipment.itemByUid(inventory, uid);
    if (!item || !knownItem(item.itemId)) return { ok: false, reason: 'item-not-found' };

    const equippedSlot = Equipment.SLOTS.find((slot) => inventory.equipped && inventory.equipped[slot] === uid) || null;
    if (equippedSlot && !(options && options.allowEquipped === true)) {
      return { ok: false, reason: 'item-equipped' };
    }

    const used = new Set(state.items.map((stored) => stored && cleanUid(stored.uid)).filter(Boolean));
    const storedUid = cleanUid(item.uid) && !used.has(item.uid) ? item.uid : nextUid(used);
    const removed = Equipment.removeItem(inventory, uid, { allowEquipped: equippedSlot !== null });
    if (!removed.ok) return removed;

    const stored = { uid: storedUid, itemId: removed.item.itemId };
    state.items.push(stored);
    return { ok: true, item: stored, equippedSlot: equippedSlot };
  }

  function withdraw(state, inventory, uid) {
    if (!state || !Array.isArray(state.items)) return { ok: false, reason: 'invalid-storage' };
    if (!inventory || !Array.isArray(inventory.items)) return { ok: false, reason: 'invalid-inventory' };
    const index = state.items.findIndex((item) => item && item.uid === uid);
    if (index < 0) return { ok: false, reason: 'item-not-found' };
    const stored = state.items[index];
    if (!knownItem(stored.itemId)) return { ok: false, reason: 'unknown-item' };
    if (!Equipment.firstOpenPosition(inventory, stored.itemId)) {
      return { ok: false, reason: 'inventory-full' };
    }

    const added = Equipment.addItem(inventory, { uid: stored.uid, itemId: stored.itemId });
    if (!added.ok) return added;
    state.items.splice(index, 1);
    return { ok: true, item: added.item };
  }

  function clear(state) {
    if (!state || !Array.isArray(state.items)) return { ok: false, reason: 'invalid-storage', removed: 0 };
    const removed = state.items.length;
    state.items.length = 0;
    return { ok: true, removed: removed };
  }

  return Object.freeze({
    VERSION: VERSION,
    createStorage: createStorage,
    deserialize: deserialize,
    serialize: serialize,
    itemByUid: itemByUid,
    listItems: listItems,
    deposit: deposit,
    withdraw: withdraw,
    clear: clear
  });
});
