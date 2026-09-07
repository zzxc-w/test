(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.VerdantMultiplayer = Object.assign(root.VerdantMultiplayer || {}, api);
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  class ChallengeController {
    constructor(options) {
      options = options || {};
      this.send = options.send || function () { return false; };
      this.timeoutMs = options.timeoutMs || 15000;
      this.now = options.now || Date.now;
      this.offers = new Map();
      this.outgoing = null;
      this.ignoreIncoming = false;
      this.listeners = new Set();
    }

    subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
    emit(event, detail) { this.listeners.forEach((listener) => listener(event, detail)); }

    request(targetPlayerId) {
      if (!targetPlayerId || this.outgoing) return false;
      const request = { targetPlayerId: String(targetPlayerId), expiresAt: this.now() + this.timeoutMs };
      if (!this.send({ type: "challenge_request", targetPlayerId: request.targetPlayerId })) return false;
      this.outgoing = request;
      this.emit("change", this.snapshot());
      return true;
    }

    receiveOffer(offer) {
      if (!offer || !offer.challengeId || !offer.fromPlayerId) return false;
      const clean = {
        challengeId: String(offer.challengeId),
        fromPlayerId: String(offer.fromPlayerId),
        fromName: String(offer.fromName || "Wandering Cultivator").slice(0, 32),
        expiresAt: Number(offer.expiresAt) || this.now() + this.timeoutMs
      };
      if (this.ignoreIncoming) {
        this.send({ type: "challenge_response", challengeId: clean.challengeId, accept: false });
        return false;
      }
      this.offers.set(clean.challengeId, clean);
      this.emit("offer", clean);
      this.emit("change", this.snapshot());
      return true;
    }

    respond(challengeId, accept) {
      const id = String(challengeId);
      if (!this.offers.has(id)) return false;
      if (!this.send({ type: "challenge_response", challengeId: id, accept: Boolean(accept) })) return false;
      this.offers.delete(id);
      this.emit("change", this.snapshot());
      return true;
    }

    receiveUpdate(update) {
      if (!update) return;
      if (update.challengeId) this.offers.delete(String(update.challengeId));
      this.outgoing = null;
      this.emit("status", update);
      this.emit("change", this.snapshot());
    }

    tick() {
      const now = this.now();
      for (const [id, offer] of this.offers) {
        if (offer.expiresAt <= now) this.offers.delete(id);
      }
      if (this.outgoing && this.outgoing.expiresAt <= now) this.outgoing = null;
    }

    reset() { this.offers.clear(); this.outgoing = null; this.emit("change", this.snapshot()); }
    setIgnoreIncoming(value) {
      this.ignoreIncoming = Boolean(value);
      if (this.ignoreIncoming) this.offers.clear();
      this.emit("change", this.snapshot());
    }
    snapshot() { this.tick(); return { offers: Array.from(this.offers.values()), outgoing: this.outgoing, ignoreIncoming: this.ignoreIncoming }; }
  }

  function mountChallengePanel(controller, options) {
    options = options || {};
    const doc = options.document || (typeof document !== "undefined" ? document : null);
    if (!doc) return { render() {}, destroy() {} };
    const root = doc.createElement("section");
    root.className = "verdant-mp-sheet";
    root.setAttribute("aria-label", "Nearby cultivators");
    root.style.cssText = "position:fixed;z-index:60;left:max(12px,env(safe-area-inset-left));right:max(12px,env(safe-area-inset-right));bottom:max(12px,env(safe-area-inset-bottom));max-height:55vh;overflow:auto;padding:14px;border:1px solid #b99b55;border-radius:14px;background:rgba(12,24,20,.96);color:#f6edcc;font:14px system-ui;touch-action:manipulation";
    const title = doc.createElement("strong"); title.textContent = "Nearby cultivators"; root.appendChild(title);
    const ignoreLabel = doc.createElement("label"); ignoreLabel.style.cssText = "float:right;min-height:44px;display:flex;align-items:center;gap:6px";
    const ignore = doc.createElement("input"); ignore.type = "checkbox"; ignore.checked = controller.ignoreIncoming;
    ignore.addEventListener("change", () => controller.setIgnoreIncoming(ignore.checked));
    ignoreLabel.append(ignore, doc.createTextNode("Ignore challenges")); root.appendChild(ignoreLabel);
    const list = doc.createElement("div"); list.style.marginTop = "10px"; root.appendChild(list);
    const button = (label, action) => {
      const el = doc.createElement("button"); el.type = "button"; el.textContent = label;
      el.style.cssText = "min-height:48px;min-width:96px;margin:4px;padding:8px 14px;border:1px solid #d5bd78;border-radius:10px;background:#294b3b;color:#fff;touch-action:manipulation;-webkit-tap-highlight-color:transparent";
      el.addEventListener("click", action); return el;
    };
    const render = (nearby) => {
      list.replaceChildren();
      const state = controller.snapshot();
      state.offers.forEach((offer) => {
        const row = doc.createElement("div");
        const seconds = Math.max(0, Math.ceil((offer.expiresAt - controller.now()) / 1000));
        row.textContent = `${offer.fromName} challenges you (${seconds}s) `;
        row.append(button("Accept", () => controller.respond(offer.challengeId, true)));
        row.append(button("Decline", () => controller.respond(offer.challengeId, false)));
        list.appendChild(row);
      });
      (nearby || []).forEach((player) => {
        const row = doc.createElement("div"); row.textContent = `${player.name} `;
        const challenge = button("Challenge", () => controller.request(player.id));
        challenge.disabled = Boolean(state.outgoing);
        row.appendChild(challenge); list.appendChild(row);
      });
      if (!state.offers.length && !(nearby || []).length) list.textContent = "No cultivators nearby.";
    };
    const unsubscribe = controller.subscribe((event) => { if (event === "change") render(options.getNearby ? options.getNearby() : []); });
    (options.parent || doc.body).appendChild(root);
    render(options.getNearby ? options.getNearby() : []);
    const interval = setInterval(() => render(options.getNearby ? options.getNearby() : []), 250);
    return { element: root, render, destroy() { clearInterval(interval); unsubscribe(); root.remove(); } };
  }

  return { ChallengeController, mountChallengePanel };
});
