const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const sourcePath = process.argv[2];
const htmlPath = process.argv[3];
const original = fs.readFileSync(sourcePath, 'utf8');
const html = fs.readFileSync(htmlPath, 'utf8');
const htmlIds = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
assert.strictEqual(new Set(htmlIds).size, htmlIds.length, 'HTML IDs must be unique');
for (const id of ['settingsButton','settingsMenu','closeSettings','clearProgress','clearConfirm','confirmClear','cancelClear','devMenu','closeDev','devStatus']) {
  assert(htmlIds.includes(id), `missing UI element #${id}`);
}
const needle = '  updateUI(); requestAnimationFrame(frame);\n})();';
assert(original.includes(needle), 'test hook insertion point changed');
const source = original.replace(needle, `  updateUI();
  globalThis.__test = {
    player, treasures, enemies, map, dash, dashCooldownDuration, reconcileQuestProgress,
    passableAt, runDevAction, safeTeleport, save,
    get quest() { return quest; }, set quest(value) { quest = value; },
    get bossDefeated() { return bossDefeated; }, set bossDefeated(value) { bossDefeated = value; },
    get suppressSave() { return suppressSave; }
  };
  requestAnimationFrame(frame);
})();`);

class FakeElement {
  constructor(id) {
    this.id = id; this.hidden = ['settingsMenu', 'devMenu', 'clearConfirm'].includes(id);
    this.style = {}; this.dataset = {}; this.listeners = {}; this.textContent = ''; this.innerHTML = '';
    this.classList = { toggle() {} };
  }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  dispatch(type, event = {}) { for (const fn of this.listeners[type] || []) fn({ target: this, preventDefault() {}, stopPropagation() {}, ...event }); }
  focus() {}
  setPointerCapture() {}
  releasePointerCapture() {}
  querySelector() { return null; }
  closest() { return null; }
}

function boot(saved) {
  const elements = new Map();
  const get = id => { if (!elements.has(id)) elements.set(id, new FakeElement(id)); return elements.get(id); };
  const canvas = get('game');
  canvas.width = 960; canvas.height = 540; canvas.focus = () => {};
  const gradient = { addColorStop() {} };
  canvas.getContext = () => new Proxy({ createLinearGradient: () => gradient, createRadialGradient: () => gradient }, { get: (o, k) => k in o ? o[k] : () => {} });
  const globalListeners = {};
  const storage = new Map();
  if (saved) storage.set('verdant-star-save', JSON.stringify(saved));
  let reloads = 0;
  const sandbox = {
    console, Math, JSON, Set, Map,
    performance: { now: () => 0 },
    document: { querySelector: selector => selector === '#game' ? canvas : get(selector.replace('#', '')), getElementById: get, querySelectorAll: () => [] },
    addEventListener(type, fn) { (globalListeners[type] ||= []).push(fn); },
    requestAnimationFrame() {},
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    location: { reload: () => { reloads++; } }
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, { filename: sourcePath });
  return { t: sandbox.__test, elements, storage, globalListeners, get reloads() { return reloads; } };
}

{
  const { t } = boot();
  let previous = Infinity;
  let minimum = Infinity;
  for (let realm = 0; realm < 5; realm++) for (let stage = 1; stage <= [3, 5, 4, 3, 1][realm]; stage++) {
    t.player.realm = realm; t.player.stage = stage;
    const cooldown = t.dashCooldownDuration();
    assert(cooldown <= previous + 1e-9, 'dash cooldown must not increase');
    assert(cooldown >= .36 - 1e-9, 'dash cooldown must remain nonzero');
    previous = cooldown; minimum = Math.min(minimum, cooldown);
  }
  assert(Math.abs(minimum - .36) < 1e-9, 'dash cooldown should reach its .36s floor');
}

{
  const { t } = boot();
  let found = false;
  for (let y = 3; y < 69 && !found; y++) for (let x = 3; x < 90 && !found; x++) {
    const startX = (x + .5) * 24, startY = (y + .5) * 24;
    const endX = startX + 84;
    if (!t.passableAt(startX, startY, 8) || !t.passableAt(endX, startY, 8)) continue;
    let blocked = false;
    for (let d = 7; d < 84; d += 7) if (!t.passableAt(startX + d, startY, 8)) blocked = true;
    if (!blocked) continue;
    t.player.x = startX; t.player.y = startY; t.player.dashCd = 0; t.dash(1, 0);
    assert(t.player.x > startX + 60, 'dash should cross intervening terrain');
    assert(t.passableAt(t.player.x, t.player.y, t.player.r), 'dash must land on passable terrain');
    assert.strictEqual(t.player.invuln, .48);
    found = true;
  }
  assert(found, 'procedural map should provide a terrain-phasing test case');
  t.player.x = 96 * 24 - t.player.r - 2; t.player.y = 36 * 24; t.player.dashCd = 0; t.dash(1, 0);
  assert(t.player.x <= 96 * 24 - t.player.r, 'dash must stay inside world bounds');
}

{
  const allCaches = [true, true, true, true, true];
  const repaired = boot({ version: 3, quest: 5, bossDefeated: true, treasures: allCaches });
  assert.strictEqual(repaired.t.quest, 6, 'already-defeated boss save should repair the final objective');
  assert.strictEqual(JSON.parse(repaired.storage.get('verdant-star-save')).version, 4, 'legacy save should migrate to v4');

  const gated = boot({ version: 3, quest: 4, bossDefeated: true, treasures: [true, false, false, false, false] });
  assert.strictEqual(gated.t.quest, 4, 'boss defeat must not skip cache requirements');
  gated.t.treasures.forEach(cache => { cache.opened = true; });
  assert(gated.t.reconcileQuestProgress());
  assert.strictEqual(gated.t.quest, 6, 'finishing caches should recognize an earlier boss defeat');
}

{
  const app = boot({ version: 4, quest: 2, stones: 5 });
  const keydown = app.globalListeners.keydown[0];
  keydown({ ctrlKey: true, shiftKey: true, altKey: true, code: 'KeyD', key: 'd', preventDefault() {}, stopPropagation() {} });
  assert.strictEqual(app.elements.get('devMenu').hidden, false, 'hidden dev chord should open the test chamber');
  app.elements.get('confirmClear').dispatch('click');
  assert.strictEqual(app.storage.has('verdant-star-save'), false, 'clear progress should remove only the game save');
  assert.strictEqual(app.t.suppressSave, true, 'clear progress should suppress unload autosave');
  for (const fn of app.globalListeners.beforeunload || []) fn({});
  assert.strictEqual(app.storage.has('verdant-star-save'), false, 'unload must not recreate a cleared save');
  assert.strictEqual(app.reloads, 1);
}

console.log('Game smoke tests passed.');
