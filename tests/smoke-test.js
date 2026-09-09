const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const sourcePath = process.argv[2];
const htmlPath = process.argv[3];
const original = fs.readFileSync(sourcePath, 'utf8');
const html = fs.readFileSync(htmlPath, 'utf8');
const htmlIds = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
assert.strictEqual(new Set(htmlIds).size, htmlIds.length, 'HTML IDs must be unique');
for (const id of ['settingsButton','multiplayerButton','settingsMenu','closeSettings','keybindList','inventoryMenu','closeInventory','dialogueMenu','closeDialogue','storageMenu','closeStorage','storageBagList','storageChestList','depositItem','withdrawItem','equipmentSlots','bagGrid','dropItem','clearProgress','clearConfirm','confirmClear','cancelClear','devMenu','closeDev','devStatus','inventoryText','playerNameLabel','nameSetup','playerNameInput','nameError','returningName']) {
  assert(htmlIds.includes(id), `missing UI element #${id}`);
}
for (const file of ['multiplayer/config.js?v=1','multiplayer/presence.js?v=2','multiplayer/drops.js?v=1','multiplayer/challenges.js?v=1','multiplayer/arena.js?v=3','multiplayer/client.js?v=3']) assert(html.includes(`src="${file}"`), `missing multiplayer script ${file}`);
assert(html.indexOf('multiplayer/config.js') < html.indexOf('multiplayer/drops.js') && html.indexOf('multiplayer/drops.js') < html.indexOf('multiplayer/client.js') && html.indexOf('multiplayer/client.js') < html.indexOf('game.js?v=14'), 'multiplayer scripts must load before the game bridge');
for (const file of ['systems/equipment.js?v=1','systems/keybinds.js?v=1','systems/dialogue.js?v=1','systems/shop.js?v=1','systems/cultivation.js?v=1','systems/storage.js?v=1','systems/sanctuary.js?v=1','systems/skills.js?v=1','systems/endgame.js?v=1']) assert(html.includes(`src="${file}"`), `missing gameplay system ${file}`);
assert(html.includes("apiBase: 'https://verdant-star-multiplayer.zxuchen.workers.dev'"), 'production multiplayer endpoint must be configured');
assert(!html.includes('SESSION_SIGNING_KEY'), 'multiplayer signing secret must never be shipped to the browser');
assert(/data-action="parry"[^>]*>Parry</.test(html), 'touch controls must include Parry');
assert(/data-action="map"[^>]*>Map</.test(html), 'touch controls must include Map');
assert(/data-action="skill"[^>]*>Art</.test(html), 'touch controls must include learned arts');
assert(!original.includes('ctx.clearRect'), 'landmark art must not punch transparent holes through the world canvas');
const needle = '  configureNameSetup(); updateUI(); requestAnimationFrame(frame);\n})();';
assert(original.includes(needle), 'test hook insertion point changed');
const source = original.replace(needle, `  configureNameSetup(); updateUI();
  globalThis.__test = {
    ctx, player, treasures, map, areas, landmarks, resourceNodes, taps, travelTargets, dash, dashCooldownDuration, cultivationAdvancements, qiCapacity, reconcileQuestProgress,
    passableAt, runDevAction, safeTeleport, save, bossDefs, bossStates, tutorial, itemDefs, merchant, derivedCombatStats,
    currentBreakthroughRequirement, missingRequirements, breakthrough, enemyProfile,
    startEnemyAttack, resolveEnemyAttack, updateEnemyCombat, parry, attack, useTalisman, useLearnedArt, cultivate, killEnemy, loseCultivationStage, handlePlayerDeath, handleActions, draw, updateUI, cleanPlayerName, configureNameSetup, dropSelectedItem, collectGroundGear,
    interact, enterSanctuary, leaveSanctuary, interactSanctuary, sanctuary, sanctuaryPassableAt, nearestSanctuaryInteraction,
    startTribulation, completeTribulation, failTribulation, resumeTribulation, allBossesDefeated, tribulationGate,
    get quest() { return quest; }, set quest(value) { quest = value; },
    get mapOpen() { return mapOpen; },
    get playerName() { return playerName; }, set playerName(value) { playerName = value; },
    get equipment() { return equipment; }, get keybinds() { return keybinds; }, equipmentApi, keybindApi,
    get personalStorage() { return personalStorage; }, get skillSystem() { return skillSystem; }, get endgameSystem() { return endgameSystem; }, storageApi, sanctuaryApi, skillsApi, endgameApi,
    get currentScene() { return currentScene; }, set currentScene(value) { currentScene = value; },
    get enemies() { return enemies; },
    get pickups() { return pickups; }, set selectedItemUid(value) { selectedItemUid = value; },
    get suppressSave() { return suppressSave; }
  };
  requestAnimationFrame(frame);
})();`);

class FakeElement {
  constructor(id) {
    this.id = id; this.hidden = ['settingsMenu', 'inventoryMenu', 'dialogueMenu', 'storageMenu', 'devMenu', 'clearConfirm', 'settingsProgress', 'shopPanel'].includes(id);
    this.style = {}; this.dataset = {}; this.listeners = {}; this.textContent = ''; this.innerHTML = ''; this.value = '';
    const classes = new Set(); this.captured = new Set();
    this.classList = { toggle(name, force) { if (force === false) classes.delete(name); else if (force === true || !classes.has(name)) classes.add(name); else classes.delete(name); }, add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name) };
  }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  append(...children) { this.children = [...(this.children || []), ...children]; }
  replaceChildren(...children) { this.children = children; }
  dispatch(type, event = {}) { for (const fn of this.listeners[type] || []) fn({ target: this, preventDefault() {}, stopPropagation() {}, ...event }); }
  focus() {}
  setAttribute(name, value) { this[name] = value; }
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
  assert(t.passableAt(t.merchant.x, t.merchant.y, t.merchant.r), 'Crossroads merchant must stand on passable terrain');
  t.updateUI(); t.draw(1000);
  assert.strictEqual(t.ctx.lineWidth, 1, 'rendering must reset canvas line width before minimap and the next frame');
  for (const [name, [x, y]] of Object.entries(t.travelTargets)) {
    assert(t.passableAt((x + .5) * 24, (y + .5) * 24, t.player.r), `${name} dev travel target must be passable`);
    if (!name.startsWith('vein')) for (const boss of t.bossDefs) assert(Math.hypot(x - boss.x, y - boss.y) * 24 > boss.range + 48, `${name} dev travel must not drop onto ${boss.title}`);
  }
  for (const area of t.areas.slice(5)) for (const landmark of t.landmarks) assert(!(area.x === landmark.x && area.y === landmark.y), `${area.name} icon must not stack with a landmark`);
}

{
  const { t, storage } = boot({ version: 7, name: 'Gear Tester', stones: 40 });
  assert(t.equipmentApi.getEquipped(t.equipment, 'weapon'), 'version 7 saves must receive starter equipment');
  assert(t.equipmentApi.getEquipped(t.equipment, 'armor'), 'version 7 saves must receive starter armor');
  const spear = t.equipmentApi.addItem(t.equipment, 'cloudpiercer_spear');
  assert(spear.ok && t.equipmentApi.equipItem(t.equipment, spear.item.uid).ok, 'alternate weapons must equip');
  assert.strictEqual(t.derivedCombatStats().weaponStyle, 'spear', 'equipped weapon must drive combat style');
  t.keybinds.setBinding('attack', 'x', 0); t.save();
  const saved = JSON.parse(storage.get('verdant-star-save'));
  assert.strictEqual(saved.version, 10); assert(saved.equipment && saved.keybinds.attack.includes('x'), 'equipment and remapped controls must persist in v10');
}

{
  const { t } = boot();
  const weapon = t.equipmentApi.getEquipped(t.equipment, 'weapon');
  t.currentScene = 'sanctuary'; t.selectedItemUid = weapon.uid; t.dropSelectedItem();
  assert(t.equipmentApi.itemByUid(t.equipment, weapon.uid), 'dropping indoors must not strand equipment in the world scene');
  t.currentScene = 'world';
  t.selectedItemUid = weapon.uid; t.dropSelectedItem();
  assert.equal(t.equipmentApi.getEquipped(t.equipment, 'weapon'), null, 'dropping equipped gear must safely clear its slot');
  const ground = t.pickups.find(pickup => pickup.type === 'gear' && pickup.itemId === weapon.itemId);
  assert(ground, 'offline drops must appear in the world');
  assert.equal(t.collectGroundGear(ground), true, 'a dropped item must be collectible again');
}

{
  const { t, storage } = boot();
  t.enterSanctuary();
  assert.equal(t.currentScene, 'sanctuary');
  assert.equal(t.sanctuary.width, 48); assert(t.sanctuary.npcs.length >= 12, 'sanctuary should contain the expanded resident roster');
  assert(t.sanctuary.decorations.some(item => item.type === 'fireplace'));
  assert(t.sanctuary.decorations.some(item => item.interaction === 'storage' && item.storage === 'infinite'));
  assert(t.sanctuaryPassableAt(t.player.x, t.player.y, t.player.r), 'interior spawn must be safe');
  t.player.hp = 1; t.player.qi = 0; t.player.x = 34.5 * 32; t.player.y = 24.5 * 32; t.interactSanctuary();
  assert.equal(t.player.hp, 108); assert.equal(t.player.qi, t.player.maxQi, 'healing well should restore body and qi');
  const sword = t.equipmentApi.getEquipped(t.equipment, 'weapon');
  assert(t.storageApi.deposit(t.personalStorage, t.equipment, sword.uid, { allowEquipped: true }).ok);
  t.player.stones = 10; assert(t.skillSystem.learn('ember_palm').ok, 'starter tutor art should be learnable');
  t.save();
  const saved = JSON.parse(storage.get('verdant-star-save'));
  assert.equal(saved.version, 10); assert.equal(saved.location, 'sanctuary');
  assert.equal(saved.personalStorage.items.length, 1); assert(saved.skills.learned.includes('ember_palm'));
  const reloaded = boot(saved);
  assert.equal(reloaded.t.currentScene, 'sanctuary', 'interior location should survive reload');
  assert.equal(reloaded.t.personalStorage.items.length, 1, 'personal chest should survive reload');
  assert(reloaded.t.skillSystem.hasLearned('ember_palm'), 'learned arts should survive reload');
  reloaded.t.leaveSanctuary(); assert.equal(reloaded.t.currentScene, 'world');
  reloaded.t.enterSanctuary();
  assert(reloaded.t.safeTeleport(47, 39), 'world travel should remain available from the interior');
  assert.equal(reloaded.t.currentScene, 'world', 'world travel must leave the sanctuary scene');
  reloaded.t.player.x = 58.5 * 24; reloaded.t.player.y = 35.5 * 24; reloaded.t.interact();
  assert.equal(reloaded.t.currentScene, 'sanctuary', 'the exterior doorway should enter the sanctuary through normal interaction');
}

{
  const bosses = { jadehorn: true, tempest_crane: true, mirecoil_matriarch: true, sectbreaker: true, starfallen_warden: true };
  const { t, storage } = boot({ version: 9, name: 'Tribulation Tester', realm: 4, stage: 1, maxQi: 9999, qi: 9999, stones: 1000, bosses });
  assert.equal(t.player.maxQi, 640, 'v9 Nascent Soul saves must migrate away from the old unreachable qi cap');
  assert(t.allBossesDefeated());
  assert(t.startTribulation(1));
  let phasesCleared = 0;
  while (t.endgameSystem.active()) {
    const phase = t.enemies.filter(enemy => enemy.tribulation && enemy.alive);
    assert(phase.length, 'each active trial phase must contain enemies');
    phase.forEach(enemy => t.killEnemy(enemy)); phasesCleared++;
    assert(phasesCleared < 10, 'tier one should finish in a bounded number of phases');
  }
  assert.equal(phasesCleared, t.endgameApi.trialConfig(1).waves.length + 1, 'waves should culminate in one echo boss phase');
  for (let tier = 2; tier <= 3; tier++) { assert(t.startTribulation(tier)); t.completeTribulation(); }
  assert.equal(t.endgameSystem.serialize().bestTier, 3);
  assert.equal(t.player.stage, 2, 'the first tribulation milestone should advance Nascent Soul cultivation');
  t.save();
  const saved = JSON.parse(storage.get('verdant-star-save'));
  assert.equal(saved.version, 10); assert.equal(saved.endgame.bestTier, 3); assert.equal(saved.stage, 2);

  assert(t.startTribulation(4));
  const failures = t.endgameSystem.serialize().failedAttempts;
  t.handlePlayerDeath();
  assert.equal(t.endgameSystem.active(), null, 'defeat must end an active tribulation');
  assert.equal(t.endgameSystem.serialize().failedAttempts, failures + 1);
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
  let reloads = 0, now = 0;
  const sandbox = {
    console, Math, JSON, Set, Map,
    performance: { now: () => now },
    document: { hidden: false, querySelector: selector => selector === '#game' ? canvas : get(selector.replace('#', '')), getElementById: get, createElement: tag => new FakeElement(tag), querySelectorAll: selector => selector.includes('[data-key]') ? touchButtons : [], addEventListener(type, fn) { (documentListeners[type] ||= []).push(fn); } },
    addEventListener(type, fn) { (globalListeners[type] ||= []).push(fn); },
    requestAnimationFrame() {},
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    location: { reload: () => { reloads++; } },
    EquipmentSystem: require('../systems/equipment.js'), VerdantKeybinds: require('../systems/keybinds.js'), VerdantDialogue: require('../systems/dialogue.js'), VerdantShop: require('../systems/shop.js'), VerdantCultivation: require('../systems/cultivation.js'),
    StorageSystem: require('../systems/storage.js'), VerdantSanctuary: require('../systems/sanctuary.js'), VerdantSkills: require('../systems/skills.js'), VerdantEndgame: require('../systems/endgame.js')
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, { filename: sourcePath });
  return { t: sandbox.__test, elements, storage, globalListeners, documentListeners, touchButtons, document: sandbox.document, advanceTime(ms) { now += ms; }, get reloads() { return reloads; } };
}

{
  const { t } = boot();
  let previous = Infinity;
  let minimum = Infinity;
  for (let realm = 0; realm < 5; realm++) for (let stage = 1; stage <= [3, 5, 4, 3, 9][realm]; stage++) {
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
  const stages = [3, 5, 4, 3, 9];
  for (let realm = 0; realm < stages.length; realm++) for (let stage = 1; stage <= stages[realm]; stage++) {
    t.player.realm = realm; t.player.stage = stage; t.player.maxHp = 1000; t.player.attack = 500;
    const before = t.cultivationAdvancements(), lost = t.loseCultivationStage(), after = t.cultivationAdvancements();
    if (realm === 0 && stage === 1) { assert.strictEqual(lost, false); assert.strictEqual(after, 0); }
    else { assert.strictEqual(lost, true); assert.strictEqual(after, before - 1, `${realm}:${stage} must lose exactly one minor stage`); }
  }
  t.player.realm = 2; t.player.stage = 1; t.player.maxHp = 200; t.player.attack = 50;
  t.loseCultivationStage();
  assert.strictEqual(t.player.realm, 1); assert.strictEqual(t.player.stage, 5); assert.strictEqual(t.player.maxQi, t.qiCapacity(1, 5));
}

{
  const { t, storage } = boot();
  t.player.realm = 1; t.player.stage = 1; t.player.maxHp = 118; t.player.hp = 1; t.player.attack = 21; t.player.maxQi = 150; t.player.qi = 100;
  const attacker = t.enemies.find(e => !e.boss), deadEnemy = t.enemies.find(e => !e.boss && e !== attacker), livingBoss = t.enemies.find(e => e.bossId === 'sectbreaker');
  attacker.x = t.player.x + 5; attacker.y = t.player.y; attacker.attackAngle = Math.PI; attacker.attackLanded = false;
  attacker.hp = 1; attacker.attackState = 'active'; livingBoss.hp = 1; livingBoss.attackState = 'windup'; livingBoss.stagger = 1;
  deadEnemy.alive = false; deadEnemy.hp = 0;
  t.updateEnemyCombat(attacker, { ...t.enemyProfile(attacker), damage: 999, range: 80, kind: 'slam' }, .02);
  assert.strictEqual(t.player.realm, 0); assert.strictEqual(t.player.stage, 3, 'realm boundary death must fall to the previous final stage');
  assert.strictEqual(t.player.maxHp, 100); assert.strictEqual(t.player.attack, 16); assert.strictEqual(t.player.hp, 108, 'equipped robe health must be restored after defeat');
  assert.strictEqual(t.player.qi, 75); assert.strictEqual(t.player.x, 47.5 * 24); assert.strictEqual(t.player.y, 39 * 24);
  assert.strictEqual(attacker.hp, attacker.maxHp); assert.strictEqual(livingBoss.hp, livingBoss.maxHp);
  assert.strictEqual(attacker.attackState, 'idle'); assert.strictEqual(livingBoss.attackState, 'idle');
  assert.strictEqual(deadEnemy.alive, false, 'death reset must not revive defeated enemies');
  const saved = JSON.parse(storage.get('verdant-star-save'));
  assert.strictEqual(saved.realm, 0); assert.strictEqual(saved.stage, 3, 'death demotion must save immediately');
  for (const transient of ['arena','opponent','ticket','network','multiplayer']) assert(!(transient in saved), `${transient} state must never enter the solo save`);
}

{
  const { t } = boot();
  t.player.qi = 40; t.taps.add('f'); t.taps.add('q'); t.handleActions();
  assert(t.player.parryTimer > 0, 'parry should win simultaneous action input');
  assert.strictEqual(t.player.qi, 40, 'simultaneous parry and seal must not cast both');
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
  assert.strictEqual(JSON.parse(migrated.storage.get('verdant-star-save')).version, 10, 'legacy save should migrate to v10');
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
  const { t } = boot({ version: 5, discoveries: ['Crossroads Shrine', 'Mistglass Ravine'] });
  assert(t.player.discoveredAreas.has('mistglass'), 'display-name discoveries must migrate to stable area IDs');
  assert(t.player.discoveredLandmarks.has('crossroads'), 'Crossroads must remain a known minimap landmark at any distance');
  t.taps.add('m'); t.handleActions(); assert.strictEqual(t.mapOpen, true, 'M / Map should expand the world map');
}

{
  const { t } = boot();
  t.parry();
  assert(t.player.parryTimer >= .2, 'equipment may improve the base parry window');
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
  assert(t.player.hp < 200, 'unparryable boss slam should punish parry attempts even through armor');
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
  const fresh = boot();
  assert.strictEqual(fresh.elements.get('nameSetup').hidden, false, 'a new journey must ask for a permanent name');
  fresh.elements.get('start').dispatch('click');
  assert.strictEqual(fresh.elements.get('overlay').hidden, false, 'an empty name must not start the game');
  fresh.elements.get('playerNameInput').value = '  Jade   Fox  ';
  fresh.elements.get('start').dispatch('click');
  assert.strictEqual(fresh.elements.get('overlay').hidden, true, 'a valid name should start the game');
  assert.strictEqual(JSON.parse(fresh.storage.get('verdant-star-save')).name, 'Jade Fox', 'the chosen name must be stored in the main save');
  assert.strictEqual(fresh.elements.get('playerNameLabel').textContent, 'Jade Fox');
  assert.strictEqual(fresh.t.cleanPlayerName('<script>'), '');
  assert.strictEqual(fresh.t.cleanPlayerName('a'.repeat(21)), '');
  assert.strictEqual(fresh.t.cleanPlayerName('青云-7'), '青云-7');

  const legacy = boot({ version: 6, stones: 9 });
  assert.strictEqual(legacy.elements.get('nameSetup').hidden, false, 'an unnamed legacy save gets one name choice');
  const named = boot({ version: 7, name: 'River Sage', stones: 9 });
  assert.strictEqual(named.elements.get('nameSetup').hidden, true, 'a named save must not expose renaming');
  assert.strictEqual(named.elements.get('returningName').textContent, 'Returning as River Sage');
}

{
  const app = boot({ version: 4, quest: 2, stones: 5 });
  app.storage.set('verdant-star-multiplayer-name', 'Cultivator 1234');
  const keydown = app.globalListeners.keydown[0];
  keydown({ ctrlKey: true, shiftKey: true, altKey: true, code: 'KeyD', key: 'd', preventDefault() {}, stopPropagation() {} });
  assert.strictEqual(app.elements.get('devMenu').hidden, false, 'hidden dev chord should open the test chamber');
  app.elements.get('confirmClear').dispatch('click');
  assert.strictEqual(app.storage.has('verdant-star-save'), false, 'clear progress should remove the game save');
  assert.strictEqual(app.storage.has('verdant-star-multiplayer-name'), false, 'clear progress should remove the legacy random name');
  assert.strictEqual(app.t.suppressSave, true, 'clear progress should suppress unload autosave');
  for (const fn of app.globalListeners.beforeunload || []) fn({});
  assert.strictEqual(app.storage.has('verdant-star-save'), false, 'unload must not recreate a cleared save');
  assert.strictEqual(app.reloads, 1);
}

{
  const app = boot();
  const menu = app.elements.get('settingsButton');
  menu.dispatch('pointerdown', { pointerId: 20 }); app.advanceTime(1900); menu.dispatch('pointerup', { pointerId: 20 }); menu.dispatch('click');
  assert.strictEqual(app.elements.get('devMenu').hidden, false, 'holding Menu should open the developer chamber on touch devices');
  assert.strictEqual(app.elements.get('settingsMenu').hidden, true, 'the long-press click must not also open Settings');
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
