(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.VerdantShop = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function positiveInteger(value) {
    return Number.isSafeInteger(value) && value > 0;
  }

  function createShop(config) {
    config = config || {};
    const catalog = config.catalog || {};
    const inventory = config.inventory || {};
    const wallet = config.wallet || {};
    const priceModifier = config.priceModifier || ((price) => price);
    const stock = Object.assign({}, config.stock || {});

    function entry(itemId) {
      const item = catalog[itemId];
      if (!item || item.buyPrice == null) return null;
      return item;
    }

    function unitPrice(itemId, context) {
      const item = entry(itemId);
      if (!item) return null;
      const adjusted = Number(priceModifier(Number(item.buyPrice), item, context));
      return Number.isFinite(adjusted) && adjusted >= 0 ? Math.ceil(adjusted) : null;
    }

    function quote(itemId, quantity, context) {
      quantity = quantity == null ? 1 : quantity;
      const price = unitPrice(itemId, context);
      if (price == null) return { ok: false, code: "not_sold", itemId };
      if (!positiveInteger(quantity)) return { ok: false, code: "invalid_quantity", itemId };
      const available = stock[itemId] == null ? Infinity : Math.max(0, Number(stock[itemId]) || 0);
      if (available < quantity) return { ok: false, code: "out_of_stock", itemId, available };
      const total = price * quantity;
      if (!Number.isSafeInteger(total)) return { ok: false, code: "invalid_price", itemId };
      return { ok: true, itemId, quantity, unitPrice: price, total, available };
    }

    function buy(itemId, quantity, context) {
      const offer = quote(itemId, quantity, context);
      if (!offer.ok) return offer;
      const balance = Number(wallet.get ? wallet.get(context) : 0);
      if (!Number.isFinite(balance) || balance < offer.total) return Object.assign({}, offer, { ok: false, code: "insufficient_funds", balance });
      if (inventory.canAdd && !inventory.canAdd(itemId, offer.quantity, context)) {
        return Object.assign({}, offer, { ok: false, code: "inventory_full" });
      }
      if (!wallet.spend || !wallet.spend(offer.total, context)) {
        return Object.assign({}, offer, { ok: false, code: "payment_failed" });
      }
      let added = false;
      try { added = !!inventory.add && inventory.add(itemId, offer.quantity, context) !== false; } catch (_) { added = false; }
      if (!added) {
        if (wallet.credit) wallet.credit(offer.total, context);
        return Object.assign({}, offer, { ok: false, code: "inventory_add_failed" });
      }
      if (stock[itemId] != null) stock[itemId] = Math.max(0, stock[itemId] - offer.quantity);
      if (config.onPurchase) config.onPurchase(offer, context);
      return Object.assign({}, offer, { ok: true, code: "purchased", remaining: stock[itemId] == null ? Infinity : stock[itemId] });
    }

    function list(context) {
      return Object.keys(catalog).map((itemId) => quote(itemId, 1, context)).filter((offer) => offer.code !== "not_sold");
    }

    return { list, quote, buy, stock: () => Object.assign({}, stock) };
  }

  return { createShop };
});
