'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Equipment = require('../equipment.js');
const Storage = require('../storage.js');

test('personal storage starts empty and has no slot limit', () => {
  const chest = Storage.createStorage();
  const raw = { items: [] };
  for (let index = 0; index < 75; index += 1) {
    raw.items.push({ uid: 'unlimited_' + index, itemId: 'sect_iron_sword' });
  }
  const restored = Storage.deserialize(raw);
  assert.equal(Storage.listItems(chest).length, 0);
  assert.equal(Storage.listItems(restored).length, 75);
});

test('serialization keeps only valid one-cell item identity data', () => {
  const serialized = Storage.serialize({
    version: 999,
    items: [
      { uid: 'valid_uid', itemId: 'cloudpiercer_spear', x: 8, y: 9, script: '<bad>' },
      { uid: 'bad uid', itemId: 'steady_heart_pendant' },
      { uid: 'unknown', itemId: 'not_an_item' },
      null
    ],
    arbitrary: true
  });
  assert.equal(serialized.version, Storage.VERSION);
  assert.equal(serialized.items.length, 2);
  assert.deepEqual(serialized.items[0], { uid: 'valid_uid', itemId: 'cloudpiercer_spear' });
  assert.match(serialized.items[1].uid, /^[A-Za-z0-9_-]{1,80}$/);
  assert.equal(serialized.items[1].itemId, 'steady_heart_pendant');
});

test('deserialize repairs duplicate UIDs without discarding valid items', () => {
  const chest = Storage.deserialize({
    items: [
      { uid: 'same', itemId: 'sect_iron_sword' },
      { uid: 'same', itemId: 'mountain_cleaver' },
      { uid: 'same', itemId: 'moonstep_charm' }
    ]
  });
  assert.equal(chest.items.length, 3);
  assert.equal(new Set(chest.items.map((item) => item.uid)).size, 3);
  assert.equal(chest.items[0].uid, 'same');
});

test('missing and malformed legacy chest state safely becomes empty', () => {
  [undefined, null, '{broken', {}, { version: 8 }, { items: 'wrong' }].forEach((raw) => {
    assert.deepEqual(Storage.deserialize(raw), { version: Storage.VERSION, items: [] });
  });
});

test('deposit transfers a bag item atomically and preserves its UID', () => {
  const inventory = Equipment.createInventory({ starterItems: [], autoEquip: false });
  const added = Equipment.addItem(inventory, 'twin_moon_blades');
  const chest = Storage.createStorage();
  const result = Storage.deposit(chest, inventory, added.item.uid);
  assert.equal(result.ok, true);
  assert.deepEqual(result.item, { uid: added.item.uid, itemId: 'twin_moon_blades' });
  assert.equal(Equipment.itemByUid(inventory, added.item.uid), null);
  assert.equal(Storage.itemByUid(chest, added.item.uid).itemId, 'twin_moon_blades');
});

test('deposit refuses equipped items unless caller explicitly opts in', () => {
  const inventory = Equipment.createInventory();
  const chest = Storage.createStorage();
  const sword = Equipment.getEquipped(inventory, 'weapon');

  const refused = Storage.deposit(chest, inventory, sword.uid);
  assert.equal(refused.reason, 'item-equipped');
  assert.equal(chest.items.length, 0);
  assert.equal(Equipment.getEquipped(inventory, 'weapon').uid, sword.uid);

  const deposited = Storage.deposit(chest, inventory, sword.uid, { allowEquipped: true });
  assert.equal(deposited.ok, true);
  assert.equal(deposited.equippedSlot, 'weapon');
  assert.equal(Equipment.getEquipped(inventory, 'weapon'), null);
  assert.equal(chest.items[0].uid, sword.uid);
});

test('deposit repairs a UID collision with an existing chest item', () => {
  const inventory = Equipment.createInventory({ starterItems: [], autoEquip: false });
  const added = Equipment.addItem(inventory, { uid: 'collision', itemId: 'sect_iron_sword' });
  const chest = Storage.deserialize({ items: [{ uid: 'collision', itemId: 'mountain_cleaver' }] });
  const result = Storage.deposit(chest, inventory, added.item.uid);
  assert.equal(result.ok, true);
  assert.notEqual(result.item.uid, 'collision');
  assert.equal(new Set(chest.items.map((item) => item.uid)).size, 2);
});

test('withdraw adds to the backpack before removing the chest item', () => {
  const chest = Storage.deserialize({ items: [{ uid: 'stored_spear', itemId: 'cloudpiercer_spear' }] });
  const inventory = Equipment.createInventory({ starterItems: [], autoEquip: false });
  const result = Storage.withdraw(chest, inventory, 'stored_spear');
  assert.equal(result.ok, true);
  assert.equal(chest.items.length, 0);
  assert.equal(Equipment.itemByUid(inventory, result.item.uid).itemId, 'cloudpiercer_spear');
});

test('withdraw leaves the chest untouched when the backpack is full', () => {
  const chest = Storage.deserialize({ items: [{ uid: 'stored_spear', itemId: 'cloudpiercer_spear' }] });
  const inventory = Equipment.createInventory({ starterItems: [], autoEquip: false, cols: 2, rows: 2 });
  ['sect_iron_sword', 'steady_heart_pendant', 'moonstep_charm', 'mountain_cleaver'].forEach((itemId) => {
    assert.equal(Equipment.addItem(inventory, itemId).ok, true);
  });
  const before = Storage.serialize(chest);
  const result = Storage.withdraw(chest, inventory, 'stored_spear');
  assert.equal(result.reason, 'inventory-full');
  assert.deepEqual(Storage.serialize(chest), before);
  assert.equal(inventory.items.length, 4);
});

test('clear reports and removes every stored item', () => {
  const chest = Storage.deserialize({
    items: [
      { uid: 'one', itemId: 'sect_iron_sword' },
      { uid: 'two', itemId: 'mountain_cleaver' }
    ]
  });
  assert.deepEqual(Storage.clear(chest), { ok: true, removed: 2 });
  assert.equal(chest.items.length, 0);
});
