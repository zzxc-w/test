const test = require("node:test");
const assert = require("node:assert/strict");
const { createShop } = require("../shop.js");

function fixture(overrides) {
  let coins = 20;
  const bag = [];
  const shop = createShop(Object.assign({
    catalog: { spear: { buyPrice: 8 }, secret: {} },
    stock: { spear: 2 },
    wallet: { get: () => coins, spend: (n) => coins >= n && ((coins -= n) >= 0), credit: (n) => { coins += n; } },
    inventory: { canAdd: () => true, add: (id, n) => { bag.push([id, n]); return true; } },
  }, overrides));
  return { shop, bag, coins: () => coins };
}

test("quotes and purchases finite stock atomically", () => {
  const { shop, bag, coins } = fixture();
  assert.deepEqual(shop.quote("spear", 2), { ok: true, itemId: "spear", quantity: 2, unitPrice: 8, total: 16, available: 2 });
  assert.equal(shop.buy("spear", 2).code, "purchased");
  assert.deepEqual(bag, [["spear", 2]]);
  assert.equal(coins(), 4);
  assert.equal(shop.buy("spear", 1).code, "out_of_stock");
});

test("does not spend when funds or capacity are insufficient", () => {
  const poor = fixture({ wallet: { get: () => 1, spend: () => { throw new Error("should not spend"); } } });
  assert.equal(poor.shop.buy("spear", 1).code, "insufficient_funds");
  const full = fixture({ inventory: { canAdd: () => false } });
  assert.equal(full.shop.buy("spear", 1).code, "inventory_full");
  assert.equal(full.coins(), 20);
});

test("refunds payment if insertion unexpectedly fails", () => {
  const value = fixture({ inventory: { canAdd: () => true, add: () => false } });
  assert.equal(value.shop.buy("spear", 1).code, "inventory_add_failed");
  assert.equal(value.coins(), 20);
  assert.equal(value.shop.stock().spear, 2);
});
