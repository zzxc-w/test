(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.VerdantMultiplayer = Object.assign(root.VerdantMultiplayer || {}, api);
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DEFAULT_CONFIG = Object.freeze({
    enabled: false,
    apiBase: "",
    world: "verdant-star",
    protocolVersion: 1,
    mapVersion: 1,
    rulesetVersion: 1,
    presenceHz: 5,
    reconnectMinMs: 750,
    reconnectMaxMs: 12000,
    reconnectGraceMs: 20000,
    challengeTimeoutMs: 15000,
    maxMessageBytes: 16384,
    maxBufferedBytes: 65536
  });

  function createConfig(overrides) {
    const config = Object.assign({}, DEFAULT_CONFIG, overrides || {});
    config.apiBase = String(config.apiBase || "").replace(/\/$/, "");
    return Object.freeze(config);
  }

  return { DEFAULT_CONFIG, createConfig };
});
