'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Equipment = require('../equipment.js');

test('catalog contains a weapon and matching armor/pendant for every build', () => {
  ['sword', 'spear', 'dual_swords', 'greatsword'].forEach((build) => {
    const entries = Object.values(Equipment.CATALOG).filter((item) => item.build === build);
    assert.deepEqual(new Set(entries.map((item) => item.slot)), new Set(['weapon', 'armor', 'pendant']));
    entries.forEach((item) => assert.ok(item.price > 0));
  });
});

test('new inventories equip starter gear and expose remaining grid space', () => {
  const inventory = Equipment.createInventory();
  assert.equal(Equipment.getEquipped(inventory, 'weapon').itemId, 'sect_iron_sword');
  assert.equal(Equipment.getEquipped(inventory, 'armor').itemId, 'wanderer_robes');
  assert.equal(Equipment.listBagItems(inventory).length, 0);
  assert.deepEqual(Equipment.firstOpenPosition(inventory, 'mountain_cleaver'), { x: 0, y: 0 });
});

test('grid placement rejects overlap and out-of-bounds moves', () => {
  const inventory = Equipment.createInventory({ starterItems: [], autoEquip: false, cols: 4, rows: 4 });
  const sword = Equipment.addItem(inventory, 'sect_iron_sword', { x: 0, y: 0 });
  const charm = Equipment.addItem(inventory, 'steady_heart_pendant', { x: 1, y: 0 });
  assert.equal(sword.ok, true);
  assert.equal(charm.ok, true);
  assert.equal(Equipment.moveItem(inventory, charm.item.uid, 0, 1).reason, 'space-blocked');
  assert.equal(Equipment.moveItem(inventory, sword.item.uid, 3, 2).reason, 'space-blocked');
  assert.equal(Equipment.moveItem(inventory, charm.item.uid, 3, 3).ok, true);
});

test('equipping swaps the previous item back into the bag', () => {
  const inventory = Equipment.createInventory();
  const added = Equipment.addItem(inventory, 'twin_moon_blades');
  const originalSword = Equipment.getEquipped(inventory, 'weapon');
  const result = Equipment.equipItem(inventory, added.item.uid);
  assert.equal(result.ok, true);
  assert.equal(result.unequipped.uid, originalSword.uid);
  assert.equal(Equipment.getEquipped(inventory, 'weapon').itemId, 'twin_moon_blades');
  assert.ok(Equipment.listBagItems(inventory).some((item) => item.uid === originalSword.uid));
});

test('an equipped item cannot be unequipped when the grid is full', () => {
  const inventory = Equipment.createInventory({ starterItems: ['mountain_cleaver'], cols: 2, rows: 4 });
  assert.equal(Equipment.listBagItems(inventory).length, 0);
  assert.equal(Equipment.addItem(inventory, 'sect_iron_sword').ok, true);
  assert.equal(Equipment.addItem(inventory, 'steady_heart_pendant').ok, true);
  assert.equal(Equipment.unequipItem(inventory, 'weapon').reason, 'inventory-full');
  assert.equal(Equipment.getEquipped(inventory, 'weapon').itemId, 'mountain_cleaver');
});

test('purchase only deducts funds after an item fits', () => {
  const inventory = Equipment.createInventory({ starterItems: [], cols: 2, rows: 2 });
  const poor = Equipment.purchase(inventory, 'twin_moon_blades', 4);
  assert.equal(poor.reason, 'insufficient-funds');
  const bought = Equipment.purchase(inventory, 'twin_moon_blades', 25);
  assert.equal(bought.ok, true);
  assert.equal(bought.balance, 7);
  const full = Equipment.purchase(inventory, 'steady_heart_pendant', 25);
  assert.equal(full.reason, 'inventory-full');
  assert.equal(full.balance, 25);
});

test('matching equipment grants coherent derived stats and a two-piece set bonus', () => {
  const inventory = Equipment.createInventory({ starterItems: [], autoEquip: false });
  ['twin_moon_blades', 'moonshadow_garb', 'moonstep_charm'].forEach((id) => {
    const added = Equipment.addItem(inventory, id);
    assert.equal(added.ok, true);
    assert.equal(Equipment.equipItem(inventory, added.item.uid).ok, true);
  });
  const stats = Equipment.deriveStats(inventory, { damageMultiplier: 1.1, maxHpBonus: 10 });
  assert.equal(stats.weaponStyle, 'dual_swords');
  assert.equal(stats.activeSet, 'dual_swords');
  assert.ok(stats.attackCooldownMultiplier < 0.66);
  assert.ok(stats.dashCooldownMultiplier < 0.72);
  assert.equal(stats.maxHpBonus, 16);
});

test('serialization round trips stable item identity and equipment', () => {
  const inventory = Equipment.createInventory();
  const spear = Equipment.addItem(inventory, 'cloudpiercer_spear');
  Equipment.equipItem(inventory, spear.item.uid);
  const encoded = JSON.stringify(Equipment.serialize(inventory));
  const restored = Equipment.deserialize(encoded);
  assert.deepEqual(Equipment.serialize(restored), Equipment.serialize(inventory));
});

test('deserialize repairs duplicate ids, bad placements and invalid equipment safely', () => {
  const restored = Equipment.deserialize({
    cols: 4,
    rows: 4,
    items: [
      { uid: 'same', itemId: 'sect_iron_sword', x: -100, y: 50 },
      { uid: 'same', itemId: 'steady_heart_pendant', x: 0, y: 0 },
      { uid: 'unknown', itemId: 'not_real', x: 0, y: 0 },
      null
    ],
    equipped: { weapon: 'unknown', armor: 'same', pendant: 42 }
  });
  assert.equal(restored.items.length, 2);
  assert.equal(new Set(restored.items.map((item) => item.uid)).size, 2);
  assert.equal(restored.equipped.weapon, null);
  assert.equal(restored.equipped.armor, null);
  restored.items.forEach((item) => {
    assert.equal(Number.isInteger(item.x), true);
    assert.equal(Number.isInteger(item.y), true);
  });
});

test('missing and malformed old saves receive safe starter equipment', () => {
  [null, '{broken json', { oldSaveVersion: 7 }].forEach((oldSave) => {
    const inventory = Equipment.deserialize(oldSave);
    assert.equal(Equipment.getEquipped(inventory, 'weapon').itemId, 'sect_iron_sword');
    assert.equal(Equipment.getEquipped(inventory, 'armor').itemId, 'wanderer_robes');
  });
});
