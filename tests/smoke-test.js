const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const sourcePath = process.argv[2];
const htmlPath = process.argv[3];
const original = fs.readFileSync(sourcePath, 'utf8');
const html = fs.readFileSync(htmlPath, 'utf8');
const htmlIds = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
assert.strictEqual(new Set(htmlIds).size, htmlIds.length, 'HTML IDs must be unique');
for (const id of ['settingsButton','settingsMenu','closeSettings','clearProgress','clearConfirm','confirmClear','cancelClear','devMenu','closeDev','devStatus','inventoryText']) {
  assert(htmlIds.includes(id), `missing UI element #${id}`);
}
assert(/data-key="f"[^>]*>Parry</.test(html), 'touch controls must include Parry');
const needle = '  updateUI(); requestAnimationFrame(frame);\n})();';
assert(original.includes(needle), 'test hook insertion point changed');
const source = original.replace(needle, `  updateUI();
  globalThis.__test = {
    player, treasures, enemies, map, areas, landmarks, resourceNodes, dash, dashCooldownDuration, reconcileQuestProgress,
    passableAt, runDevAction, safeTeleport, save, bossDefs, bossStates, tutorial, itemDefs,
    currentBreakthroughRequirement, missingRequirements, breakthrough, enemyProfile,
    startEnemyAttack, resolveEnemyAttack, updateEnemyCombat, parry, attack, useTalisman, cultivate, killEnemy, draw, updateUI,
    get quest() { return quest; }, set quest(value) { quest = value; },
    get suppressSave() { return suppressSave; }
  };
  requestAnimationFrame(frame);
})();`);

class FakeElement {
  constructor(id) {
    this.id = id; this.hidden = ['settingsMenu', 'devMenu', 'clearConfirm'].includes(id);
    this.style = {}; this.dataset = {}; this.listeners = {}; this.textContent = ''; this.innerHTML = '';
    const classes = new Set(); this.captured = new Set();
    this.classList = { toggle(name, force) { if (force === false) classes.delete(name); else if (force === true || !classes.has(name)) classes.add(name); else classes.delete(name); }, add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name) };
  }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  dispatch(type, event = {}) { for (const fn of this.listeners[type] || []) fn({ target: this, preventDefault() {}, stopPropagation() {}, ...event }); }
  focus() {}
  setPointerCapture(id) { this.captured.add(id); }
  releasePointerCapture(id) { this.captured.delete(id); }
  hasPointerCapture(id) { return this.captured.has(id); }
  querySelector() { return null; }
  closest() { return null; }
}

{
  const { t } = boot();
  assert.strictEqual(t.map.length, 108); assert.strictEqual(t.map[0].length, 144, 'expanded map dimensions must remain stable');
  assert.strictEqual(t.areas.length, 9); assert.strictEqual(t.treasures.length, 9, 'new regions should append stable caches');
  for (const item of ['cloud_dew','lotus_seed','root_resin','cinder_marrow']) assert(t.resourceNodes.some(node => node.item === item), `missing resource nodes for ${item}`);
  for (const cache of t.treasures) assert(t.passableAt(cache.x, cache.y, 7), `${cache.id} must remain reachable`);
  for (const enemy of t.enemies.filter(enemy => enemy.boss)) assert(t.passableAt(enemy.x, enemy.y, enemy.r), `${enemy.title} must spawn on passable terrain`);
  t.updateUI(); t.draw(1000);
}

function boot(saved) {
  const elements = new Map();
  const get = id => { if (!elements.has(id)) elements.set(id, new FakeElement(id)); return elements.get(id); };
  const canvas = get('game');
  canvas.width = 960; canvas.height = 540; canvas.focus = () => {};
  const gradient = { addColorStop() {} };
  canvas.getContext = () => new Proxy({ createLinearGradient: () => gradient, createRadialGradient: () => gradient }, { get: (o, k) => k in o ? o[k] : () => {} });
  const globalListeners = {};
  const documentListeners = {};
  const touchButtons = [new FakeElement('touch-w'), new FakeElement('touch-d'), new FakeElement('touch-d-2')];
  touchButtons[0].dataset.key = 'w'; touchButtons[1].dataset.key = 'd'; touchButtons[2].dataset.key = 'd';
  const storage = new Map();
  if (saved) storage.set('verdant-star-save', JSON.stringify(saved));
  let reloads = 0;
  const sandbox = {
    console, Math, JSON, Set, Map,
    performance: { now: () => 0 },
    document: { hidden: false, querySelector: selector => selector === '#game' ? canvas : get(selector.replace('#', '')), getElementById: get, querySelectorAll: selector => selector === '[data-key]' ? touchButtons : [], addEventListener(type, fn) { (documentListeners[type] ||= []).push(fn); } },
    addEventListener(type, fn) { (globalListeners[type] ||= []).push(fn); },
    requestAnimationFrame() {},
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    location: { reload: () => { reloads++; } }
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, { filename: sourcePath });
  return { t: sandbox.__test, elements, storage, globalListeners, documentListeners, touchButtons, document: sandbox.document, get reloads() { return reloads; } };
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
  t.player.x = 144 * 24 - t.player.r - 2; t.player.y = 36 * 24; t.player.dashCd = 0; t.dash(1, 0);
  assert(t.player.x <= 144 * 24 - t.player.r, 'dash must stay inside world bounds');
}

{
  const allCaches = [true, true, true, true, true];
  const migrated = boot({ version: 4, quest: 5, bossDefeated: true, treasures: allCaches });
  assert.strictEqual(migrated.t.bossStates.sectbreaker, true, 'legacy boss victory must migrate');
  assert(migrated.t.player.keyItems.has('sectbreaker_core'), 'legacy boss victory must grant its breakthrough key');
  assert(migrated.t.tutorial.attacked && migrated.t.tutorial.cultivated, 'legacy progress should complete the tutorial');
  assert.strictEqual(migrated.elements.get('quest').hidden, true, 'completed tutorial should hide guided objectives');
  assert.strictEqual(JSON.parse(migrated.storage.get('verdant-star-save')).version, 5, 'legacy save should migrate to v5');
  assert.strictEqual(migrated.t.treasures.slice(0, 5).filter(cache => cache.opened).length, 5, 'old cache indices must remain intact');

  const allBosses = Object.fromEntries(migrated.t.bossDefs.map(boss => [boss.id, true]));
  const repaired = boot({ version: 5, bosses: allBosses, keyItems: [] });
  for (const boss of repaired.t.bossDefs) assert(repaired.t.player.keyItems.has(boss.keyItem), `${boss.id} defeat must restore ${boss.keyItem}`);
  repaired.t.runDevAction('clear-materials');
  for (const boss of repaired.t.bossDefs) assert(repaired.t.player.keyItems.has(boss.keyItem), 'clearing consumables must preserve earned boss keys');
}

{
  const first = boot();
  const node = first.t.resourceNodes[0]; node.ready = false; node.respawn = 55; first.t.save();
  const saved = JSON.parse(first.storage.get('verdant-star-save'));
  assert(saved.resourceReadyAt[node.id] > Date.now(), 'harvest cooldown must be persisted');
  const reloaded = boot(saved), sameNode = reloaded.t.resourceNodes.find(candidate => candidate.id === node.id);
  assert(sameNode && !sameNode.ready && sameNode.respawn > 0, 'reloading must not instantly respawn a harvested ingredient');
}

{
  const { t } = boot();
  t.player.qi = t.player.maxQi;
  const qiBefore = t.player.qi;
  assert.strictEqual(t.breakthrough(), false, 'missing materials must block breakthrough');
  assert.strictEqual(t.player.stage, 1); assert.strictEqual(t.player.qi, qiBefore, 'failed breakthrough must retain full qi');
  t.player.herbs = 2;
  assert.strictEqual(t.breakthrough(), true, 'complete requirements should allow breakthrough');
  assert.strictEqual(t.player.stage, 2); assert.strictEqual(t.player.herbs, 0); assert.strictEqual(t.player.qi, 0);

  t.player.realm = 0; t.player.stage = 3; t.player.qi = t.player.maxQi; t.player.stones = 5;
  assert.strictEqual(t.breakthrough(), false, 'realm breakthrough must require its boss key');
  t.player.keyItems.add('verdant_antler');
  assert.strictEqual(t.breakthrough(), true); assert.strictEqual(t.player.realm, 1); assert(t.player.keyItems.has('verdant_antler'), 'boss keys must not be consumed');
}

{
  const { t } = boot();
  t.parry();
  assert.strictEqual(t.player.parryTimer, .2);
  assert.strictEqual(t.player.parryRecovery, .38, 'failed parries need recovery after their active window');
  const enemy = t.enemies.find(e => !e.boss), profile = t.enemyProfile(t.enemies.find(e => !e.boss));
  enemy.x = t.player.x + 10; enemy.y = t.player.y; enemy.attackAngle = Math.PI; enemy.attackLanded = false;
  t.player.parryTimer = .2; const hp = t.player.hp;
  t.resolveEnemyAttack(enemy, profile);
  assert.strictEqual(t.player.hp, hp, 'timed parry should prevent damage');
  assert(enemy.stagger > 0 && enemy.riposteWindow > 0, 'parry should stagger and open a riposte');
  enemy.attackLanded = false; t.player.parryTimer = 0; t.player.invuln = 0;
  t.resolveEnemyAttack(enemy, profile); const damagedHp = t.player.hp;
  t.resolveEnemyAttack(enemy, profile);
  assert.strictEqual(t.player.hp, damagedHp, 'one active attack must not hit twice');

  const boss = t.enemies.find(e => e.bossId === 'sectbreaker'), bossProfile = t.enemyProfile(boss);
  boss.x = t.player.x + 10; boss.y = t.player.y; boss.attackAngle = Math.PI; boss.attackLanded = false;
  t.player.maxHp = 200; t.player.hp = 200; t.player.invuln = 0; t.player.parryTimer = .2;
  t.resolveEnemyAttack(boss, bossProfile);
  assert.strictEqual(t.player.hp, 95, 'unparryable boss slam should punish parry attempts');
}

{
  const { t } = boot();
  const enemy = t.enemies.find(e => !e.boss && ['lunge','thrust'].includes(t.enemyProfile(e).kind));
  const profile = t.enemyProfile(enemy);
  enemy.attackState = 'active'; enemy.attackTimer = .14; enemy.attackAngle = 0; enemy.attackLanded = false;
  enemy.x = t.player.x - profile.range - t.player.r - 12; enemy.y = t.player.y;
  t.player.invuln = 0; const hp = t.player.hp;
  t.updateEnemyCombat(enemy, profile, .04);
  assert.strictEqual(t.player.hp, hp, 'a lunge outside its hitbox must keep checking later frames');
  t.updateEnemyCombat(enemy, profile, .08);
  assert(t.player.hp < hp, 'a moving lunge should connect when a later active frame reaches the player');
}

{
  const { t } = boot();
  const boss = t.enemies.find(e => e.bossId === 'jadehorn');
  t.player.attack = 0; boss.hp = 100000; t.player.facing = 0;
  for (let i = 0; i < 80; i++) {
    t.player.x = boss.x - 18; t.player.y = boss.y; t.player.attackCd = 0; t.attack();
    t.player.qi = 20; t.player.talismanCd = 0; t.useTalisman();
    assert(t.passableAt(boss.x, boss.y, boss.r), 'boss knockback must never move a key-dropping boss into blocked terrain');
  }
}

{
  const { t } = boot();
  const enemy = t.enemies.find(e => !e.boss), profile = t.enemyProfile(enemy);
  enemy.x = t.player.x + 10; enemy.y = t.player.y; t.player.hp = t.player.maxHp;
  t.startEnemyAttack(enemy, profile);
  t.updateEnemyCombat(enemy, profile, profile.windup / 2);
  assert.strictEqual(t.player.hp, t.player.maxHp, 'windup must telegraph without early damage');
  t.updateEnemyCombat(enemy, profile, profile.windup);
  assert.strictEqual(t.player.hp, t.player.maxHp, 'windup transition must not skip directly to damage');
  t.updateEnemyCombat(enemy, profile, .05);
  assert(t.player.hp < t.player.maxHp, 'active attack should deal damage once');

  const boss = t.enemies.find(e => e.bossId === 'jadehorn');
  t.killEnemy(boss);
  assert(t.bossStates.jadehorn && t.player.keyItems.has('verdant_antler'), 'boss victory must persist its unique key');
}

{
  const { t } = boot();
  t.attack(); assert(t.tutorial.attacked, 'first sword swing should complete the combat lesson');
  const vein = t.landmarks.find(landmark => landmark.type === 'vein');
  t.player.x = (vein.x + .5) * 24; t.player.y = (vein.y + .5) * 24; t.cultivate();
  assert(t.tutorial.cultivated, 'drawing qi at a vein should complete the cultivation lesson');
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

{
  const app = boot();
  const [up, right, right2] = app.touchButtons;
  up.dispatch('pointerdown', { pointerId: 10 });
  right.dispatch('pointerdown', { pointerId: 11 });
  assert(up.classList.contains('is-pressed') && right.classList.contains('is-pressed'), 'multitouch buttons should show pressed state');
  up.dispatch('lostpointercapture', { pointerId: 10 });
  assert(!up.classList.contains('is-pressed') && right.classList.contains('is-pressed'), 'lost capture should release only its pointer');
  right2.dispatch('pointerdown', { pointerId: 12 });
  right.dispatch('pointercancel', { pointerId: 11 });
  assert(right2.classList.contains('is-pressed'), 'same-key second pointer should remain held');
  app.document.hidden = true;
  for (const fn of app.documentListeners.visibilitychange) fn({});
  assert(!right2.classList.contains('is-pressed'), 'hiding the page should release all touch state');
}

console.log('Game smoke tests passed.');
