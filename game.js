(() => {
  'use strict';

  const canvas = document.querySelector('#game');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const W = canvas.width, H = canvas.height, TILE = 24;
  const WORLD_W = 144, WORLD_H = 108;
  const TAU = Math.PI * 2;
  const SAVE_KEY = 'verdant-star-save';
  const SAVE_VERSION = 12;
  const ASCENDED_W = 96, ASCENDED_H = 72;
  const DASH_DISTANCE = 84;
  const DASH_BASE_COOLDOWN = .72;
  const DASH_MIN_COOLDOWN = .36;
  const DASH_COOLDOWN_STEP = .036;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const lerp = (a, b, t) => a + (b - a) * t;
  const hash = (x, y, seed = 91) => {
    let n = (x * 374761393 + y * 668265263 + seed * 69069) | 0;
    n = (n ^ (n >>> 13)) * 1274126177;
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  };

  const ui = Object.fromEntries(['realm','hpFill','hpText','qiFill','qiText','xpFill','stones','herbs','kills','caches','zone','time','quest','questText','messages','overlay','start','compass','compassArrow','compassText','interactPrompt','settingsButton','multiplayerButton','settingsMenu','closeSettings','settingsControls','settingsProgress','keybindList','resetKeybinds','clearProgress','clearConfirm','confirmClear','cancelClear','devMenu','closeDev','devStatus','inventoryText','inventoryMenu','closeInventory','equipmentSlots','equipmentStats','bagGrid','bagCount','itemDetail','equipItem','unequipItem','dropItem','dialogueMenu','closeDialogue','dialogueSpeaker','dialogueText','dialogueChoices','shopPanel','shopBalance','shopGrid','storageMenu','closeStorage','storageBagList','storageChestList','storageCount','storageDetail','depositItem','withdrawItem','legacyMenu','closeLegacy','legacySummary','daoGrid','playerNameLabel','nameSetup','playerNameInput','nameError','returningName'].map(id => [id, document.getElementById(id)]));
  const keys = new Set(), taps = new Set(), keyboardKeys = new Set(), touchPointers = new Map(), touchKeyCounts = new Map();
  let started = false, paused = false, last = performance.now(), playTime = 0, shake = 0, flash = 0, runtimeErrorShown = false, mapOpen = false;
  let activeMenu = null, menuWasPaused = false, suppressSave = false, loadedSaveVersion = 0, playerName = '', remappingAction = null, selectedItemUid = null, dialogueSession = null;
  let currentScene = 'world', worldReturnPosition = { x: 58.5 * TILE, y: 36.5 * TILE }, ascendedReturnPosition = { x: 12.5 * TILE, y: 36.5 * TILE }, activeNpc = null, selectedStorageSide = null, selectedStorageUid = null;
  const pendingSharedDrops = new Map(), pendingDropClaims = new Map(), claimingDropIds = new Set();
  const dev = { invulnerable: false, noCooldowns: false };
  const multiplayerApi = globalThis.VerdantMultiplayer || null;
  const equipmentApi = globalThis.EquipmentSystem;
  const keybindApi = globalThis.VerdantKeybinds;
  const dialogueApi = globalThis.VerdantDialogue;
  const shopApi = globalThis.VerdantShop;
  const cultivationApi = globalThis.VerdantCultivation;
  const storageApi = globalThis.StorageSystem;
  const sanctuaryApi = globalThis.VerdantSanctuary;
  const skillsApi = globalThis.VerdantSkills;
  const endgameApi = globalThis.VerdantEndgame;
  const immortalRealmApi = globalThis.VerdantImmortalRealm;
  const daoApi = globalThis.VerdantDaoPaths;
  const celestialEventsApi = globalThis.VerdantCelestialEvents;
  const sanctuary = sanctuaryApi.createSanctuary();
  const SANCT_TILE = sanctuary.tileSize;
  const sanctuaryExterior = { x: 52, y: 25, width: 13, height: 10, doorX: 58, doorY: 35 };
  let equipment = equipmentApi.createInventory();
  let keybinds = keybindApi.createKeybinds();
  let personalStorage = storageApi.createStorage(), skillSystem = null, pendingSkillState = null, endgameSystem = null, pendingEndgameState = null, immortalRealmSystem = null, pendingImmortalRealmState = null, daoSystem = null, pendingDaoState = null, celestialEventSystem = null, pendingCelestialEventState = null;
  let tribulationPhase = 0;
  const tribulationGate = { x: 116.5 * TILE, y: 88.5 * TILE };
  const ascensionGate = { x: 12.5 * TILE, y: 36.5 * TILE };
  let worldEnemies = null, ascendedEnemies = [], activeRiftId = null, realmHazard = { timer: 3, warning: 0, x: 0, y: 0 };
  const storyFlags = new Set();
  let multiplayer = null, multiplayerPanel = null, arenaOverlay = null, multiplayerPanelOpen = false;

  const colors = {
    grass: ['#314f38', '#35563d'], forest: ['#223d31', '#274636'], water: ['#183b49', '#1c4653'],
    stone: ['#343943', '#3a4149'], path: ['#695e46', '#71654b'], vein: ['#264d4b', '#2c5752'], shrine: ['#544a42', '#5d5148']
  };

  const map = Array.from({ length: WORLD_H }, (_, y) => Array.from({ length: WORLD_W }, (_, x) => {
    const edge = Math.min(x, y, WORLD_W - 1 - x, WORLD_H - 1 - y);
    const n = (hash(Math.floor(x / 3), Math.floor(y / 3), 4) + hash(x, y, 9) * .55) / 1.55;
    if (edge < 2) return 'stone';
    if (n < .13) return 'water';
    if (n > .79) return 'stone';
    if (n > .61) return 'forest';
    return 'grass';
  }));

  // A deliberate network of old pilgrim roads keeps the procedural wilderness readable.
  for (let x = 5; x < 139; x++) for (let d = -1; d <= 1; d++) map[36 + d][x] = 'path';
  for (let y = 6; y < 103; y++) for (let d = -1; d <= 1; d++) map[y][47 + d] = 'path';
  for (let y = 18; y <= 89; y++) for (let d = -1; d <= 1; d++) map[y][116 + d] = 'path';
  for (let x = 47; x <= 117; x++) for (let d = -1; d <= 1; d++) map[88 + d][x] = 'path';
  for (const [x, y0, y1] of [[18,12,36],[77,15,36],[17,36,56],[78,36,56]]) for (let y = y0; y <= y1; y++) for (let d = -1; d <= 1; d++) map[y][x + d] = 'path';
  for (let x = 116; x <= 119; x++) for (let d = -1; d <= 1; d++) map[48 + d][x] = 'path';
  for (let y = 30; y <= 42; y++) for (let x = 40; x <= 54; x++) if (Math.hypot(x - 47, y - 36) < 7) map[y][x] = 'grass';
  const landmarks = [
    { id: 'vein_nw', x: 14, y: 13, type: 'vein' }, { id: 'vein_ne', x: 80, y: 13, type: 'vein' },
    { id: 'vein_sw', x: 14, y: 58, type: 'vein' }, { id: 'vein_se', x: 81, y: 57, type: 'vein' },
    { id: 'vein_mistglass', x: 111, y: 18, type: 'vein' }, { id: 'vein_roots', x: 124, y: 48, type: 'vein' },
    { id: 'vein_ember', x: 42, y: 84, type: 'vein' }, { id: 'vein_starfall', x: 110, y: 88, type: 'vein' },
    { id: 'crossroads', x: 47, y: 36, type: 'shrine' }, { id: 'sword_grave_shrine', x: 47, y: 9, type: 'shrine' },
    { id: 'south_shrine', x: 47, y: 63, type: 'shrine' }, { id: 'east_shrine', x: 116, y: 36, type: 'shrine' },
    { id: 'kiln_shrine', x: 47, y: 88, type: 'shrine' }
  ];
  for (const l of landmarks) {
    for (let yy = l.y - 2; yy <= l.y + 2; yy++) for (let xx = l.x - 2; xx <= l.x + 2; xx++) map[yy][xx] = 'grass';
    map[l.y][l.x] = l.type;
  }
  const areas = [
    { id: 'jade_grove', x: 18, y: 12, r: 6, name: 'Jade Bamboo Grove', icon: 'bamboo', danger: 1 },
    { id: 'cloudstep', x: 77, y: 15, r: 7, name: 'Cloudstep Monastery', icon: 'monastery', danger: 2 },
    { id: 'moon_lotus', x: 17, y: 56, r: 7, name: 'Moon Lotus Mere', icon: 'lotus', danger: 3 },
    { id: 'fallen_sect', x: 78, y: 56, r: 8, name: 'Ruins of the Fallen Sect', icon: 'ruins', danger: 4 },
    { id: 'sword_grave', x: 47, y: 9, r: 5, name: "Sword Saint's Grave", icon: 'swords', danger: 2 },
    { id: 'mistglass', x: 116, y: 18, r: 9, name: 'Mistglass Ravine', icon: 'ravine', danger: 3 },
    { id: 'root_hollow', x: 119, y: 48, r: 10, name: 'Myriad Root Hollow', icon: 'roots', danger: 4 },
    { id: 'ember_kiln', x: 44, y: 88, r: 9, name: 'Emberglass Kiln', icon: 'kiln', danger: 5 },
    { id: 'starfall', x: 116, y: 88, r: 11, name: 'Starfall Crater', icon: 'crater', danger: 6 }
  ];
  for (const a of areas) {
    for (let yy = a.y - a.r; yy <= a.y + a.r; yy++) for (let xx = a.x - a.r; xx <= a.x + a.r; xx++) {
      if (yy <= 2 || xx <= 2 || yy >= WORLD_H - 3 || xx >= WORLD_W - 3 || Math.hypot(xx - a.x, yy - a.y) >= a.r) continue;
      const detail = hash(xx, yy, 18);
      if ((a.icon === 'lotus' || a.icon === 'ravine') && detail < .18) map[yy][xx] = 'water';
      else if (a.icon === 'roots' && detail < .26) map[yy][xx] = 'forest';
      else if ((a.icon === 'kiln' || a.icon === 'crater') && detail < .18) map[yy][xx] = 'stone';
      else map[yy][xx] = 'grass';
    }
  }
  // Restore the authored road network and boss clearings after biome painting.
  for (let x = 5; x < 139; x++) for (let d = -1; d <= 1; d++) map[36 + d][x] = 'path';
  for (let y = 6; y < 103; y++) for (let d = -1; d <= 1; d++) map[y][47 + d] = 'path';
  for (let y = 18; y <= 89; y++) for (let d = -1; d <= 1; d++) map[y][116 + d] = 'path';
  for (let x = 47; x <= 117; x++) for (let d = -1; d <= 1; d++) map[88 + d][x] = 'path';
  for (const [cx, cy] of [[18,12],[116,18],[17,56],[78,56],[116,88]]) {
    for (let y = cy - 2; y <= cy + 2; y++) for (let x = cx - 2; x <= cx + 2; x++) map[y][x] = 'grass';
  }
  for (const [cx, cy] of [[15,14],[80,17],[20,58],[81,58],[44,11],[112,21],[123,50],[40,90],[120,91]]) {
    for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 1; x++) map[y][x] = 'grass';
  }
  // Area carving happens after landmark clearings, so restore the functional landmark tiles.
  for (const l of landmarks) map[l.y][l.x] = l.type;
  // The sanctuary occupies a real footprint beside the Crossroads. Its south
  // doorway opens directly onto the old pilgrim road.
  for (let y = sanctuaryExterior.y; y < sanctuaryExterior.y + sanctuaryExterior.height; y++) {
    for (let x = sanctuaryExterior.x; x < sanctuaryExterior.x + sanctuaryExterior.width; x++) map[y][x] = 'stone';
  }
  map[sanctuaryExterior.doorY - 1][sanctuaryExterior.doorX] = 'path';
  map[sanctuaryExterior.doorY][sanctuaryExterior.doorX] = 'path';

  const ascendedAreas = [
    { id: 'celestial_ruins', name: 'Celestial Ruins', x: 16, y: 36, rx: 14, ry: 17, color: '#496f7b' },
    { id: 'ember_wastes', name: 'Ember Wastes', x: 50, y: 19, rx: 15, ry: 14, color: '#704f68' },
    { id: 'mirror_mire', name: 'Mirror Mire', x: 78, y: 48, rx: 16, ry: 17, color: '#655477' }
  ];
  const ascendedMap = Array.from({ length: ASCENDED_H }, () => Array(ASCENDED_W).fill('aether'));
  for (const area of ascendedAreas) {
    for (let y = Math.max(2, area.y - area.ry); y <= Math.min(ASCENDED_H - 3, area.y + area.ry); y++) for (let x = Math.max(2, area.x - area.rx); x <= Math.min(ASCENDED_W - 3, area.x + area.rx); x++) {
      if (((x - area.x) / area.rx) ** 2 + ((y - area.y) / area.ry) ** 2 > 1) continue;
      const detail = hash(x, y, area.x + 207);
      ascendedMap[y][x] = detail > .9 ? 'starstone' : detail < .14 ? 'cloudgrass' : 'cloudstone';
    }
  }
  function carveSkyBridge(from, to) {
    const steps = Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) * 2);
    for (let i = 0; i <= steps; i++) {
      const cx = Math.round(lerp(from.x, to.x, i / steps)), cy = Math.round(lerp(from.y, to.y, i / steps));
      for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) if (cx + ox > 1 && cy + oy > 1 && cx + ox < ASCENDED_W - 2 && cy + oy < ASCENDED_H - 2) ascendedMap[cy + oy][cx + ox] = 'skybridge';
    }
  }
  carveSkyBridge(ascendedAreas[0], ascendedAreas[1]); carveSkyBridge(ascendedAreas[1], ascendedAreas[2]);
  const riftNodes = [
    { id: 'star_crown_rift', areaId: 'celestial_ruins', name: 'Star-Crown Rift', x: 20.5 * TILE, y: 27.5 * TILE },
    { id: 'phoenix_ash_rift', areaId: 'ember_wastes', name: 'Phoenix-Ash Rift', x: 52.5 * TILE, y: 17.5 * TILE },
    { id: 'drowned_moon_rift', areaId: 'mirror_mire', name: 'Drowned-Moon Rift', x: 79.5 * TILE, y: 49.5 * TILE }
  ];
  const skyCurrents = [
    { x: 32.5 * TILE, y: 28.5 * TILE, cooldown: 0 }, { x: 64.5 * TILE, y: 33.5 * TILE, cooldown: 0 }
  ];
  const incursionBeacon = { x: 50.5 * TILE, y: 35.5 * TILE, name: 'Celestial War Bell' };
  for (const point of [ascensionGate, incursionBeacon, ...riftNodes, ...skyCurrents]) {
    const cx = Math.floor(point.x / TILE), cy = Math.floor(point.y / TILE);
    for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) if (ascendedMap[cy + oy]?.[cx + ox] !== undefined) ascendedMap[cy + oy][cx + ox] = 'cloudstone';
  }

  const realms = [
    { name: 'Mortal', stages: 3, qi: 80 }, { name: 'Qi Condensation', stages: 5, qi: 150 },
    { name: 'Foundation', stages: 4, qi: 260 }, { name: 'Golden Core', stages: 3, qi: 420 }, { name: 'Nascent Soul', stages: 9, qi: 640 },
    { name: 'Soul Transformation', stages: 3, qi: 980 }
  ];

  const player = {
    x: 47.5 * TILE, y: 39 * TILE, r: 8, facing: 0, speed: 142, hp: 100, maxHp: 100,
    qi: 0, maxQi: 80, xp: 0, xpNeed: 60, realm: 0, stage: 1, stones: 0, herbs: 0, kills: 0,
    attack: 16, attackCd: 0, attackTimer: 0, dashCd: 0, invuln: 0, talismanCd: 0, skillCd: 0,
    parryTimer: 0, parryCd: 0, parryRecovery: 0,
    meditating: false, discoveries: new Set(['Crossroads Shrine']), discoveredAreas: new Set(), discoveredLandmarks: new Set(['crossroads']),
    ingredients: { cloud_dew: 0, lotus_seed: 0, root_resin: 0, cinder_marrow: 0 },
    keyItems: new Set()
  };
  const merchant = { id: 'merchant_lian', name: 'Quartermaster Lian', x: 51.5 * TILE, y: 38.5 * TILE, r: 9 };
  let enemies = [], plants = [], particles = [], slashes = [], pickups = [], messages = [], quest = 0;
  const cacheOffsets = [[-3,2],[3,2],[3,2],[3,2],[-3,2],[-4,3],[4,2],[-4,2],[4,3]];
  let treasures = areas.map((a, i) => ({ id: `cache_${a.id}`, x: (a.x + cacheOffsets[i][0]) * TILE, y: (a.y + cacheOffsets[i][1]) * TILE, opened: false, area: a.name }));
  const guaranteedHerbs = [[44,39],[51,39],[43,34],[52,34],[46,43],[49,43],[37,36],[58,36],[21,14],[73,17],[21,57],[74,57]];
  const itemDefs = {
    cloud_dew: { name: 'Mistglass Dew', color: '#8be9f1', hint: 'Condenses on crystal grass in Mistglass Ravine.' },
    lotus_seed: { name: 'Moon Lotus Seed', color: '#f0a9cf', hint: 'Grows beside the waters of Moon Lotus Mere.' },
    root_resin: { name: 'Myriad Root Resin', color: '#b4d176', hint: 'Bleeds from ancient roots in Myriad Root Hollow.' },
    cinder_marrow: { name: 'Cinder Marrow', color: '#ef8b55', hint: 'Cools in the furnaces of Emberglass Kiln.' },
    verdant_antler: { name: 'Verdant Antler', color: '#99e581', hint: 'Claimed from the Jadehorn Stag in the bamboo grove.' },
    cloudstep_sigil: { name: 'Cloudstep Sigil', color: '#a5e9ff', hint: 'Carried by the Tempest Crane of Mistglass Ravine.' },
    mire_pearl: { name: 'Mire Sovereign Pearl', color: '#d8a5ea', hint: 'Guarded by the Mirecoil Matriarch at Moon Lotus Mere.' },
    sectbreaker_core: { name: 'Sectbreaker Core', color: '#f0c96f', hint: 'Torn from the golem in the Ruins of the Fallen Sect.' },
    starfallen_shard: { name: 'Starfallen Shard', color: '#c4b4ff', hint: 'Held by the Warden in Starfall Crater.' }
  };
  const tutorial = { attacked: false, cultivated: false };
  const bossStates = { jadehorn: false, tempest_crane: false, mirecoil_matriarch: false, sectbreaker: false, starfallen_warden: false };
  let resourceNodes = [], loadedResourceReadyAt = {};
  const merchantDialogue = dialogueApi.createDialogueEngine({
    quartermaster: {
      start: 'welcome', nodes: {
        welcome: { speaker: 'Quartermaster Lian', text: 'Every path needs the right vessel. I recover spirit arms from the roads and fit them to cultivators who can pay.', choices: [
          { id: 'browse', text: 'Show me your wares.', next: 'shop' },
          { id: 'ask', text: 'What are these fighting paths?', next: 'lore' },
          { id: 'leave', text: 'Leave.', next: null }
        ] },
        lore: { speaker: 'Quartermaster Lian', text: 'Spears rule distance, twin blades chase openings, greatswords trade speed for crushing force, and the sect sword stays balanced. Match two pieces from a path to awaken a set bonus.', choices: [
          { id: 'back', text: 'Back.', next: 'welcome' }, { id: 'browse', text: 'Browse wares.', next: 'shop' }
        ] },
        shop: { speaker: 'Quartermaster Lian', text: 'Spirit stones carry memory. Choose carefully—your pack has thirty single-item slots, no matter the shape of the arm or armor.', choices: [
          { id: 'back', text: 'Ask something else.', next: 'welcome' }, { id: 'leave', text: 'Leave.', next: null }
        ] }
      }
    }
  });
  const merchantCatalog = Object.fromEntries(Object.entries(equipmentApi.CATALOG).map(([id, item]) => [id, { ...item, buyPrice: item.price }]));
  const merchantShop = shopApi.createShop({
    catalog: merchantCatalog,
    inventory: {
      canAdd: itemId => !!equipmentApi.firstOpenPosition(equipment, itemId),
      add: itemId => equipmentApi.addItem(equipment, itemId).ok
    },
    wallet: {
      get: () => player.stones,
      spend: amount => player.stones >= amount && ((player.stones -= amount) >= 0),
      credit: amount => { player.stones += amount; }
    },
    onPurchase: offer => { addMessage(`Purchased ${equipmentApi.getDefinition(offer.itemId).name}.`, 'good'); save(); }
  });

  const enemyTypes = {
    hare: { name: 'Ironhorn Hare', hp: 34, speed: 78, damage: 10, color: '#b78b72', xp: 14, r: 8, windup: .34, range: 32, recovery: .75, kind: 'lunge' },
    wolf: { name: 'Ashfang Wolf', hp: 58, speed: 92, damage: 15, color: '#788191', xp: 24, r: 10, windup: .28, range: 48, recovery: .85, kind: 'lunge' },
    wisp: { name: 'Lost Wisp', hp: 46, speed: 62, damage: 13, color: '#69cfb5', xp: 20, r: 8, windup: .48, range: 38, recovery: 1.05, kind: 'pulse' },
    guardian: { name: 'Stone Guardian', hp: 120, speed: 46, damage: 24, color: '#9b8064', xp: 50, r: 13, windup: .68, range: 42, recovery: 1.2, kind: 'slam' },
    serpent: { name: 'Mirecoil Serpent', hp: 76, speed: 70, damage: 18, color: '#668f5c', xp: 31, r: 11, windup: .42, range: 54, recovery: .9, kind: 'thrust' },
    rogue: { name: 'Demonic Cultivator', hp: 96, speed: 75, damage: 22, color: '#9d536b', xp: 42, r: 11, windup: .32, range: 46, recovery: .8, kind: 'arc' },
    rift_stalker: { ...immortalRealmApi.ENEMIES.rift_stalker, color: '#7fd8f0', xp: 88, r: 10, windup: .3, range: 56, recovery: .72, kind: 'lunge' },
    astral_sentinel: { ...immortalRealmApi.ENEMIES.astral_sentinel, color: '#b9a1e4', xp: 132, r: 14, windup: .7, range: 66, recovery: 1.05, kind: 'slam' },
    ashbound_guardian: { ...immortalRealmApi.ENEMIES.ashbound_guardian, color: '#d07855', xp: 148, r: 14, windup: .72, range: 68, recovery: 1.08, kind: 'slam' },
    mirror_wraith: { ...immortalRealmApi.ENEMIES.mirror_wraith, color: '#bd86e4', xp: 122, r: 11, windup: .34, range: 62, recovery: .78, kind: 'arc' },
    void_harbinger: { ...immortalRealmApi.ENEMIES.void_harbinger, color: '#7d4a9e', xp: 420, r: 16, windup: .78, range: 78, recovery: 1.15, kind: 'pulse' }
  };
  const bossDefs = [
    { id: 'jadehorn', type: 'guardian', title: 'Jadehorn Stag', x: 18, y: 12, hp: 180, damage: 34, windup: .48, range: 50, recovery: 1, kind: 'lunge', keyItem: 'verdant_antler', parryable: true },
    { id: 'tempest_crane', type: 'wisp', title: 'Tempest Crane', x: 116, y: 18, hp: 300, damage: 48, windup: .55, range: 58, recovery: 1.05, kind: 'pulse', keyItem: 'cloudstep_sigil', parryable: true },
    { id: 'mirecoil_matriarch', type: 'serpent', title: 'Mirecoil Matriarch', x: 17, y: 56, hp: 460, damage: 68, windup: .52, range: 64, recovery: 1.1, kind: 'thrust', keyItem: 'mire_pearl', parryable: true },
    { id: 'sectbreaker', type: 'guardian', title: 'Sectbreaker Golem', x: 78, y: 56, hp: 560, damage: 105, windup: .9, range: 62, recovery: 1.35, kind: 'slam', keyItem: 'sectbreaker_core', parryable: false },
    { id: 'starfallen_warden', type: 'rogue', title: 'Starfallen Warden', x: 116, y: 88, hp: 920, damage: 125, windup: .78, range: 70, recovery: 1.25, kind: 'slam', keyItem: 'starfallen_shard', parryable: false }
  ];

  function passableAt(px, py, radius = 7) {
    const points = [[-radius,-radius],[radius,-radius],[-radius,radius],[radius,radius]];
    return points.every(([ox,oy]) => {
      const x = Math.floor((px + ox) / TILE), y = Math.floor((py + oy) / TILE);
      return x >= 0 && y >= 0 && x < WORLD_W && y < WORLD_H && !['water','stone'].includes(map[y][x]);
    });
  }

  function sanctuaryPassableAt(px, py, radius = 7) {
    const points = [[-radius,-radius],[radius,-radius],[-radius,radius],[radius,radius]];
    return points.every(([ox, oy]) => sanctuaryApi.isPassable(sanctuary, (px + ox) / SANCT_TILE, (py + oy) / SANCT_TILE));
  }

  function ascendedPassableAt(px, py, radius = 7) {
    const points = [[-radius,-radius],[radius,-radius],[-radius,radius],[radius,radius]];
    return points.every(([ox, oy]) => {
      const x = Math.floor((px + ox) / TILE), y = Math.floor((py + oy) / TILE);
      return x >= 0 && y >= 0 && x < ASCENDED_W && y < ASCENDED_H && ascendedMap[y][x] !== 'aether';
    });
  }

  function playerPassableAt(px, py, radius = player.r) {
    return currentScene === 'sanctuary' ? sanctuaryPassableAt(px, py, radius) : currentScene === 'ascended' ? ascendedPassableAt(px, py, radius) : passableAt(px, py, radius);
  }

  function randomOpen(seed, margin = 5) {
    for (let i = 0; i < 500; i++) {
      const x = margin + Math.floor(hash(i, seed, 21) * (WORLD_W - margin * 2));
      const y = margin + Math.floor(hash(seed, i, 71) * (WORLD_H - margin * 2));
      if (!['water','stone','shrine','vein'].includes(map[y][x]) && Math.hypot(x - 47, y - 36) > 7) return { x: (x + .5) * TILE, y: (y + .5) * TILE };
    }
    return { x: 20 * TILE, y: 20 * TILE };
  }

  function makeResourceNodes(areaId, item, count) {
    const area = areas.find(a => a.id === areaId), nodes = [];
    if (!area) return nodes;
    for (let i = 0; i < 120 && nodes.length < count; i++) {
      const angle = hash(i, count, area.x) * TAU;
      const radius = 2 + hash(i, area.y, count) * Math.max(2, area.r - 2);
      const x = Math.round(area.x + Math.cos(angle) * radius), y = Math.round(area.y + Math.sin(angle) * radius);
      const px = (x + .5) * TILE, py = (y + .5) * TILE;
      if (passableAt(px, py, 5) && !nodes.some(n => Math.hypot(n.x - px, n.y - py) < TILE * 1.5)) nodes.push({ id: `${item}_${nodes.length}`, x: px, y: py, item, ready: true, respawn: 0, phase: hash(i, x, y) * TAU });
    }
    return nodes;
  }

  function populate() {
    enemies = Array.from({ length: 58 }, (_, i) => {
      const p = randomOpen(100 + i);
      const danger = Math.hypot(p.x / TILE - 47, p.y / TILE - 36);
      const px = p.x / TILE, py = p.y / TILE;
      const type = px > 100 && py > 70 ? (i % 3 ? 'rogue' : 'guardian')
        : px > 100 && py < 32 ? (i % 2 ? 'wisp' : 'wolf')
        : px > 100 ? (i % 2 ? 'guardian' : 'serpent')
        : px < 34 && py > 48 ? 'serpent'
        : px > 62 && py > 48 ? (i % 2 ? 'rogue' : 'guardian')
        : danger > 39 ? 'guardian' : danger > 25 ? (i % 3 ? 'wolf' : 'wisp') : (i % 4 ? 'hare' : 'wisp');
      const t = enemyTypes[type];
      return { ...p, type, hp: t.hp, maxHp: t.hp, vx: 0, vy: 0, hit: 0, attackCd: hash(i, 2) * 2, wander: hash(i, 3) * TAU, alive: true, attackState: 'idle', attackTimer: 0, attackAngle: 0, attackLanded: false, stagger: 0, riposteWindow: 0 };
    });
    plants = guaranteedHerbs.map(([x,y], i) => ({ x: (x + .5) * TILE, y: (y + .5) * TILE, ready: true, respawn: 0, phase: hash(i, 8) * TAU, guaranteed: true }));
    plants.push(...Array.from({ length: 52 }, (_, i) => ({ ...randomOpen(300 + i), ready: true, respawn: 0, phase: hash(i, 8) * TAU })));
    resourceNodes = [
      ...makeResourceNodes('mistglass', 'cloud_dew', 14), ...makeResourceNodes('moon_lotus', 'lotus_seed', 12),
      ...makeResourceNodes('root_hollow', 'root_resin', 12), ...makeResourceNodes('ember_kiln', 'cinder_marrow', 14)
    ];
    const now = Date.now();
    for (const node of resourceNodes) {
      const readyAt = loadedResourceReadyAt[node.id];
      if (Number.isFinite(readyAt) && readyAt > now) { node.ready = false; node.respawn = Math.min(55, (readyAt - now) / 1000); }
    }
    loadedResourceReadyAt = {};
    for (const b of bossDefs) enemies.push({
      x: b.x * TILE, y: b.y * TILE, type: b.type, hp: b.hp, maxHp: b.hp, vx: 0, vy: 0, hit: 0, attackCd: 1,
      wander: 0, alive: !bossStates[b.id], boss: true, bossId: b.id, respawn: 99999, title: b.title, keyItem: b.keyItem,
      attackState: 'idle', attackTimer: 0, attackAngle: 0, attackLanded: false, stagger: 0, riposteWindow: 0,
      profile: { damage: b.damage, windup: b.windup, range: b.range, recovery: b.recovery, kind: b.kind, parryable: b.parryable }
    });
  }

  function randomAscendedOpen(seed, area) {
    for (let i = 0; i < 300; i++) {
      const angle = hash(seed, i, 411) * TAU, radius = Math.sqrt(hash(i, seed, 419)) * .78;
      const x = (area.x + Math.cos(angle) * area.rx * radius + .5) * TILE;
      const y = (area.y + Math.sin(angle) * area.ry * radius + .5) * TILE;
      if (ascendedPassableAt(x, y, 16) && Math.hypot(x - ascensionGate.x, y - ascensionGate.y) > 150 && Math.hypot(x - incursionBeacon.x, y - incursionBeacon.y) > 95 && !riftNodes.some(rift => Math.hypot(x - rift.x, y - rift.y) < 95)) return { x, y };
    }
    return { x: area.x * TILE, y: area.y * TILE };
  }

  function makeAscendedEnemy(enemyId, regionId, seed, overrides = {}) {
    const area = ascendedAreas.find(entry => entry.id === regionId) || ascendedAreas[0];
    const point = randomAscendedOpen(seed, area), type = enemyId, base = enemyTypes[type];
    return {
      ...point, type, realmEnemyId: enemyId, regionId, higherRealm: true,
      hp: base.hp, maxHp: base.hp, vx: 0, vy: 0, hit: 0, attackCd: hash(seed, 2) * 1.5, wander: hash(seed, 3) * TAU,
      alive: true, attackState: 'idle', attackTimer: 0, attackAngle: 0, attackLanded: false, stagger: 0, riposteWindow: 0,
      ...overrides
    };
  }

  function populateAscended() {
    if (ascendedEnemies.length) return;
    let seed = 700;
    for (const area of ascendedAreas) {
      const region = immortalRealmApi.REGIONS[area.id], ambientPool = region.enemies.filter(id => immortalRealmApi.ENEMIES[id].style !== 'boss');
      for (let i = 0; i < 9; i++) ascendedEnemies.push(makeAscendedEnemy(ambientPool[i % ambientPool.length], area.id, seed++));
    }
    syncVoidHarbinger();
  }

  function syncVoidHarbinger() {
    if (!immortalRealmSystem || immortalRealmSystem.stats.riftsStabilized < 3 || immortalRealmSystem.objectives.includes('harbinger_defeated')) return;
    if (ascendedEnemies.some(enemy => enemy.realmEnemyId === 'void_harbinger' && enemy.boss)) return;
    const boss = makeAscendedEnemy('void_harbinger', 'mirror_mire', 991, {
      x: 84.5 * TILE, y: 55.5 * TILE, boss: true, title: 'Void Harbinger', respawn: 999999,
      profile: { damage: 95, windup: .78, range: 78, recovery: 1.15, kind: 'pulse', parryable: false }
    });
    ascendedEnemies.push(boss);
    addMessage('Three sealed rifts awaken the Void Harbinger in the Mirror Mire.', 'bad');
  }

  function currentAscendedArea() {
    const tx = player.x / TILE, ty = player.y / TILE;
    return ascendedAreas.reduce((best, area) => {
      const score = ((tx - area.x) / area.rx) ** 2 + ((ty - area.y) / area.ry) ** 2;
      return !best || score < best.score ? { area, score } : best;
    }, null)?.area || ascendedAreas[0];
  }

  function spawnRiftWave(riftId) {
    const rift = immortalRealmApi.RIFTS[riftId], node = riftNodes.find(entry => entry.id === riftId), report = immortalRealmApi.inspectRift(immortalRealmSystem, riftId);
    if (!rift || !node || !report.ok || report.stabilized) return false;
    const remaining = Math.max(0, report.required - report.progress), count = Math.min(2, remaining);
    for (let i = 0; i < count; i++) {
      const type = rift.enemyPool[(report.progress + i) % rift.enemyPool.length], base = enemyTypes[type], angle = (i / Math.max(1, count)) * TAU + report.progress;
      const enemy = makeAscendedEnemy(type, rift.regionId, 1200 + report.progress * 7 + i, {
        x: node.x + Math.cos(angle) * 92, y: node.y + Math.sin(angle) * 92,
        hp: Math.round(base.hp * 1.25), maxHp: Math.round(base.hp * 1.25), elite: true,
        title: `${rift.name} · Echo ${report.progress + i + 1}`, riftId, riftEvent: true, respawn: 999999
      });
      if (!ascendedPassableAt(enemy.x, enemy.y, base.r)) { enemy.x = node.x; enemy.y = node.y + (i ? 58 : -58); }
      enemies.push(enemy);
    }
    activeRiftId = riftId; addMessage(`${rift.name} tears open · ${report.progress}/${report.required} echoes sealed.`, 'bad'); return true;
  }

  function startNearbyRift() {
    if (currentScene !== 'ascended') { addMessage('Sky rifts exist only beyond the Grand Formation.', 'bad'); return false; }
    if (celestialEventsApi.inspect(celestialEventSystem).active) { addMessage('Resolve the roaming Celestial Incursion before opening a sky rift.', 'bad'); return false; }
    const node = riftNodes.filter(entry => dist(player, entry) < 76).sort((a, b) => dist(player, a) - dist(player, b))[0];
    if (!node) { addMessage('No unstable sky rift is within reach.'); return false; }
    const area = ascendedAreas.find(entry => entry.id === node.areaId);
    const discovered = immortalRealmApi.discoverRegion(immortalRealmSystem, area.id);
    if (!discovered.alreadyDiscovered) addMessage(`Discovered: ${area.name}`, 'good');
    const report = immortalRealmApi.inspectRift(immortalRealmSystem, node.id);
    if (report.stabilized) { addMessage(`${node.name} is already stable. Its calm light restores 40 qi.`, 'good'); player.qi = Math.min(effectiveMaxQi(), player.qi + 40); return true; }
    if (activeRiftId) { addMessage('Finish the open rift before disturbing another.', 'bad'); return false; }
    return spawnRiftWave(node.id);
  }

  function advanceRiftIfCleared() {
    if (!activeRiftId || enemies.some(enemy => enemy.riftEvent && enemy.alive)) return;
    const report = immortalRealmApi.inspectRift(immortalRealmSystem, activeRiftId);
    if (!report.ready) { spawnRiftWave(activeRiftId); return; }
    const result = immortalRealmApi.stabilizeRift(immortalRealmSystem, activeRiftId), name = result.rift.name;
    activeRiftId = null; burst(player.x, player.y, '#9fe9ff', 36, 145);
    addMessage(`${name} stabilized · +${result.reward.shards} soul shards, +${result.reward.sigils} ascendant sigil.`, 'good');
    if (player.realm === 5 && player.stage === 1 && immortalRealmSystem.stats.riftsStabilized >= 2) {
      player.stage = 2; player.maxHp += 22; player.attack += 6; player.maxQi = qiCapacity(); player.qi = effectiveMaxQi(); player.hp = effectiveMaxHp();
      addMessage('Two harmonized rifts awaken Soul Transformation stage II.', 'good'); flash = 1;
    }
    syncVoidHarbinger(); save();
    if (celestialEventsApi.inspect(celestialEventSystem).active) spawnCelestialIncursion();
  }

  function claimReadyBounty() {
    const bounty = immortalRealmApi.inspectBounty(immortalRealmSystem);
    if (!bounty.ready) return false;
    const result = immortalRealmApi.claimBounty(immortalRealmSystem);
    addMessage(`Celestial Decree fulfilled · +${result.reward.shards} shards, +${result.reward.sigils} sigil. New hunt: ${result.next.target.name}.`, 'good');
    if (player.realm === 5 && player.stage < 2 && immortalRealmSystem.stats.riftsStabilized >= 2) {
      player.stage = 2; player.maxHp += 18; player.attack += 5; player.maxQi = qiCapacity(); player.qi = effectiveMaxQi(); player.hp = Math.min(player.hp + 18, effectiveMaxHp()); addMessage('The completed decree restores Soul Transformation stage II.', 'good');
    } else if (player.realm === 5 && player.stage < 3 && immortalRealmSystem.objectives.includes('soul_transformation')) {
      player.stage++; player.maxHp += 18; player.attack += 5; player.maxQi = qiCapacity(); player.qi = effectiveMaxQi(); player.hp = Math.min(player.hp + 18, effectiveMaxHp()); addMessage(`The completed decree restores Soul Transformation stage ${roman(player.stage)}.`, 'good');
    }
    return true;
  }

  function attemptSoulTransformation() {
    const result = immortalRealmApi.completeTransformation(immortalRealmSystem);
    if (!result.ok) {
      const missing = result.missing.map(entry => entry.type === 'regions' ? `${entry.required - entry.current} regions` : entry.type === 'rifts' ? `${entry.required - entry.current} rifts` : entry.type === 'shards' ? `${entry.required - entry.current} shards` : entry.type === 'sigils' ? `${entry.required - entry.current} sigils` : 'the Void Harbinger').join(', ');
      addMessage(`Your transformed soul is incomplete: ${missing}.`, 'bad'); return false;
    }
    if (player.realm === 5 && player.stage < 3) { player.stage = 3; player.maxHp += 28; player.attack += 8; player.maxQi = qiCapacity(); player.qi = effectiveMaxQi(); player.hp = effectiveMaxHp(); }
    burst(player.x, player.y, '#fff0b5', 54, 175); flash = 1; addMessage('Soul Transformation reaches stage III. The higher realm recognizes you.', 'good'); save(); return true;
  }

  function clearIncursionEnemies() {
    const withoutEvents = list => list.filter(enemy => !enemy.incursionEvent);
    if (currentScene === 'ascended') { enemies = withoutEvents(enemies); ascendedEnemies = enemies; }
    else ascendedEnemies = withoutEvents(ascendedEnemies);
  }

  function completeCelestialIncursion() {
    const result = celestialEventsApi.complete(celestialEventSystem);
    if (!result.ok) return false;
    immortalRealmSystem.resources.shards = Math.min(1000000000, immortalRealmSystem.resources.shards + result.reward.shards);
    immortalRealmSystem.resources.sigils = Math.min(1000000000, immortalRealmSystem.resources.sigils + result.reward.sigils);
    clearIncursionEnemies();
    burst(player.x, player.y, '#ffe49a', 42, 155); flash = 1;
    addMessage(`${result.completed.name} resolved · +${result.reward.shards} shards, +${result.reward.sigils} sigil${result.reward.sigils === 1 ? '' : 's'}.`, 'good');
    save(); return true;
  }

  function spawnCelestialIncursion() {
    if (currentScene !== 'ascended' || activeRiftId) return false;
    const report = celestialEventsApi.inspect(celestialEventSystem);
    if (!report.ok || !report.active) return false;
    clearIncursionEnemies();
    if (report.ready) return completeCelestialIncursion();
    const definition = report.definition;
    if (report.eliteUnlocked && definition.elite && !report.eliteDefeated) {
      const base = enemyTypes[definition.elite.enemyId];
      enemies.push(makeAscendedEnemy(definition.elite.enemyId, definition.regionId, 4200 + report.cycle, {
        hp: Math.round(base.hp * 2.2), maxHp: Math.round(base.hp * 2.2), boss: true, elite: true,
        title: definition.elite.name, incursionEvent: true, incursionElite: true, respawn: 999999,
        profile: { damage: Math.round(base.damage * 1.45), windup: Math.max(.26, base.windup * .9), range: base.range + 10, recovery: base.recovery, kind: base.kind, parryable: false }
      }));
      addMessage(`${definition.elite.name} manifests as the incursion's final omen.`, 'bad');
      return true;
    }
    const remaining = Math.max(0, report.required - report.progress), count = Math.min(3, remaining);
    for (let i = 0; i < count; i++) enemies.push(makeAscendedEnemy(definition.targetId, definition.regionId, 4000 + report.cycle * 31 + report.progress + i, {
      incursionEvent: true, title: `${definition.name} · Invader`, respawn: 999999,
      hp: Math.round(enemyTypes[definition.targetId].hp * 1.35), maxHp: Math.round(enemyTypes[definition.targetId].hp * 1.35), speedMultiplier: 1.08
    }));
    addMessage(`${definition.name} · drive back ${remaining} remaining invader${remaining === 1 ? '' : 's'} in ${immortalRealmApi.REGIONS[definition.regionId].name}.`, 'bad');
    return true;
  }

  function startCelestialIncursion() {
    if (currentScene !== 'ascended') { addMessage('The Celestial War Bell can only be heard in the Immortal Realm.', 'bad'); return false; }
    if (!immortalRealmSystem.objectives.includes('soul_transformation')) { addMessage('Complete Soul Transformation before calling a roaming incursion.', 'bad'); return false; }
    if (activeRiftId) { addMessage('Seal the open sky rift before sounding the War Bell.', 'bad'); return false; }
    const existing = celestialEventsApi.inspect(celestialEventSystem);
    if (existing.active) { addMessage(`${existing.definition.name} is already underway in ${immortalRealmApi.REGIONS[existing.definition.regionId].name}.`); return false; }
    const result = celestialEventsApi.start(celestialEventSystem);
    if (!result.ok) return false;
    addMessage(`Celestial Incursion ${result.cycle}: ${result.definition.name}.`, 'bad');
    spawnCelestialIncursion(); save(); updateUI(); return true;
  }

  function advanceCelestialIncursionIfCleared() {
    if (enemies.some(enemy => enemy.incursionEvent && enemy.alive)) return;
    const report = celestialEventsApi.inspect(celestialEventSystem);
    if (!report.active) return;
    if (report.ready) completeCelestialIncursion(); else spawnCelestialIncursion();
  }

  function addMessage(text, type = '') {
    messages.unshift({ text, type, life: 4.5 });
    messages = messages.slice(0, 4);
    renderMessages();
  }

  function renderMessages() {
    const escaped = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
    ui.messages.innerHTML = messages.map(m => `<div class="msg ${m.type === 'good' || m.type === 'bad' ? m.type : ''}">${escaped(m.text)}</div>`).join('');
  }

  function cleanPlayerName(value) {
    const name = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
    return /^[\p{L}\p{N} _.-]{1,20}$/u.test(name) ? name : '';
  }

  function configureNameSetup() {
    const named = Boolean(playerName);
    ui.nameSetup.hidden = named;
    ui.returningName.hidden = !named;
    ui.returningName.textContent = named ? `Returning as ${playerName}` : '';
    ui.playerNameLabel.textContent = named ? playerName : 'Wandering Disciple';
    if (named) ui.playerNameInput.value = playerName;
  }

  function nearbyCultivators() {
    return multiplayer && currentScene === 'world' ? multiplayer.presence.nearby(player.x, player.y, 360, Date.now()) : [];
  }

  function sendWorldPresence(action = 'none', force = false) {
    if (!multiplayer || multiplayer.arena.active || currentScene !== 'world') return false;
    const moving = actionHeld('moveUp') || actionHeld('moveDown') || actionHeld('moveLeft') || actionHeld('moveRight');
    return multiplayer.updatePresence({ x: player.x, y: player.y, facing: player.facing.toFixed(3), moving, action }, force);
  }

  function updateMultiplayerStatus() {
    if (!ui.multiplayerButton || !multiplayer) return;
    const status = multiplayer.status;
    ui.multiplayerButton.dataset.status = status;
    const count = nearbyCultivators().length;
    ui.multiplayerButton.textContent = status === 'online' ? `Online · ${count} nearby` : `${status[0].toUpperCase()}${status.slice(1)} · Nearby`;
    if (multiplayerPanel && multiplayerPanelOpen) multiplayerPanel.render(nearbyCultivators());
  }

  function setMultiplayerPanel(open) {
    multiplayerPanelOpen = Boolean(open && multiplayerPanel && !multiplayer?.arena.active);
    if (multiplayerPanel) {
      multiplayerPanel.element.hidden = !multiplayerPanelOpen;
      if (multiplayerPanelOpen) multiplayerPanel.render(nearbyCultivators());
    }
    if (ui.multiplayerButton) ui.multiplayerButton.setAttribute('aria-expanded', String(multiplayerPanelOpen));
    releaseAllInputs();
  }

  function initMultiplayer() {
    if (multiplayer || !multiplayerApi || !ui.multiplayerButton) return;
    const config = globalThis.VERDANT_MULTIPLAYER_CONFIG || { enabled: false };
    multiplayer = multiplayerApi.createClient({ config });
    multiplayerPanel = multiplayerApi.mountChallengePanel(multiplayer.challenges, {
      parent: document.getElementById('shell'), getNearby: nearbyCultivators
    });
    multiplayerPanel.element.hidden = true;
    const close = document.createElement('button');
    close.type = 'button'; close.textContent = 'Close'; close.setAttribute('aria-label', 'Close nearby cultivators');
    close.style.cssText = 'float:right;min-height:48px;margin:-8px 0 8px 8px;padding:8px 14px;border:1px solid #d5bd78;border-radius:10px;background:#17212b;color:#fff';
    close.addEventListener('click', () => setMultiplayerPanel(false));
    multiplayerPanel.element.prepend(close);
    arenaOverlay = multiplayerApi.mountArenaOverlay(multiplayer.arena, {
      parent: document.getElementById('shell'),
      onInput: input => multiplayer.arena.setInput(input, true)
    });
    multiplayer.subscribe((event, detail) => {
      if (event === 'status') {
        updateMultiplayerStatus();
        if (detail?.status !== 'online') {
          pendingSharedDrops.clear(); pendingDropClaims.clear(); claimingDropIds.clear();
          if (activeMenu === 'inventory') renderInventory();
        }
      }
      if (event === 'online') {
        if (currentScene === 'world') addMessage('Joined the shared cultivation world.', 'good');
        else multiplayer.disconnect();
      }
      if (event === 'drop_created') finishSharedDrop(detail);
      if (event === 'drop_award') receiveSharedDrop(detail);
      if (event === 'drop_rejected') rejectSharedDrop(detail);
      if (event === 'drop_spawn') addMessage('Another cultivator left equipment nearby.');
      if (event === 'arena_online') arenaOverlay?.setConnectionState?.('online');
      if (event === 'arena_reconnecting') arenaOverlay?.setConnectionState?.('reconnecting');
    });
    multiplayer.challenges.subscribe((event, detail) => {
      if (event === 'offer') { setMultiplayerPanel(true); addMessage(`${detail.fromName} requests an arena duel.`, 'good'); }
      if (event === 'status' && detail?.status === 'declined') addMessage('The arena challenge was declined.');
      if (event === 'status' && detail?.status === 'unavailable') addMessage('That cultivator is no longer available.', 'bad');
    });
    multiplayer.arena.subscribe((event, detail) => {
      if (event === 'start') { save(); setMultiplayerPanel(false); releaseAllInputs(); addMessage('Entering the Arena Realm. Local progression is paused.', 'good'); }
      if (event === 'end') {
        releaseAllInputs();
        const won = detail?.winnerId && detail.winnerId === multiplayer.session?.playerId;
        addMessage(detail?.winnerId === 'draw' ? 'The arena ends in a draw.' : won ? 'Arena victory. No cultivation rewards were changed.' : 'The arena closes. Your cultivation is unchanged.', won ? 'good' : '');
      }
    });
    updateMultiplayerStatus();
    syncMultiplayerForScene();
  }

  function syncMultiplayerForScene() {
    if (!multiplayer) return;
    if (started && currentScene === 'world') {
      if (multiplayer.status === 'offline') multiplayer.connect({ name: playerName || 'Wandering Cultivator' });
    } else if (multiplayer.status !== 'offline') multiplayer.disconnect();
    updateMultiplayerStatus();
  }

  function submitArenaInput() {
    if (!multiplayer?.arena.active) return;
    const touch = arenaOverlay?.input?.snapshot?.() || { moveX: 0, moveY: 0, aimX: 1, aimY: 0 };
    let moveX = touch.moveX + (actionHeld('moveRight') ? 1 : 0) - (actionHeld('moveLeft') ? 1 : 0);
    let moveY = touch.moveY + (actionHeld('moveDown') ? 1 : 0) - (actionHeld('moveUp') ? 1 : 0);
    moveX = clamp(moveX, -1, 1); moveY = clamp(moveY, -1, 1);
    const moving = Math.hypot(moveX, moveY);
    const aimX = moving ? moveX / moving : touch.aimX;
    const aimY = moving ? moveY / moving : touch.aimY;
    multiplayer.arena.setInput({
      moveX, moveY, aimX, aimY,
      attack: touch.attack || actionPressed('attack'), parry: touch.parry || actionPressed('parry'),
      dash: touch.dash || actionPressed('dash')
    });
    taps.clear();
  }

  function burst(x, y, color, count = 8, speed = 60) {
    for (let i = 0; i < count; i++) {
      const a = hash(i, Math.floor(playTime * 1000), particles.length + 3) * TAU;
      const s = speed * (.3 + hash(i, particles.length, 5));
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: .35 + hash(i, 1) * .45, max: .8, color, size: 2 + hash(i, 4) * 3 });
    }
  }

  function openedCacheCount() { return treasures.reduce((total, t) => total + (t.opened ? 1 : 0), 0); }

  function cultivationAdvancements() {
    let total = Math.max(0, player.stage - 1);
    for (let i = 0; i < player.realm; i++) total += realms[i].stages;
    return total;
  }

  function qiCapacity(realm = player.realm, stage = player.stage) {
    const path = realms[clamp(realm, 0, realms.length - 1)];
    return path.qi + (clamp(stage, 1, path.stages) - 1) * Math.floor(path.qi * .3);
  }

  function dashCooldownDuration() {
    const reductions = Math.min(10, cultivationAdvancements());
    return Math.max(DASH_MIN_COOLDOWN, DASH_BASE_COOLDOWN - reductions * DASH_COOLDOWN_STEP) * derivedCombatStats().dashCooldownMultiplier;
  }

  function configureSkillSystem(savedState) {
    skillSystem = skillsApi.createSkillSystem({
      state: savedState,
      resources: {
        get: id => id === 'spiritStones' ? player.stones : 0,
        spend: (id, amount) => { if (id !== 'spiritStones' || player.stones < amount) return false; player.stones -= amount; return true; },
        credit: (id, amount) => { if (id === 'spiritStones') player.stones += amount; }
      },
      inventory: { count: () => 0, remove: () => false, add: () => false },
      progression: { getStage: () => cultivationAdvancements() + 1, hasFlag: id => storyFlags.has(id) }
    });
  }

  function configureEndgameSystem(savedState) {
    endgameSystem = endgameApi.createEndgameSystem({
      state: savedState,
      resources: {
        get: id => id === 'spiritStones' ? player.stones : 0,
        spend: (id, amount) => { if (id !== 'spiritStones' || player.stones < amount) return false; player.stones -= amount; return true; },
        credit: (id, amount) => { if (id === 'spiritStones') player.stones += amount; }
      },
      progression: {
        getRealm: () => realms[player.realm].name,
        getStage: () => player.stage,
        hasDefeatedBoss: id => !!bossStates[id]
      }
    });
  }

  function configureImmortalRealm(savedState) {
    immortalRealmSystem = immortalRealmApi.createState(savedState);
  }

  function configureDaoSystem(savedState) {
    daoSystem = daoApi.createDaoPathSystem({
      state: savedState,
      resources: {
        get: id => immortalRealmSystem?.resources?.[id] || 0,
        transact: costs => {
          if (!immortalRealmSystem?.resources || costs.some(cost => !['shards', 'sigils'].includes(cost.resourceId) || immortalRealmSystem.resources[cost.resourceId] < cost.amount)) return false;
          for (const cost of costs) immortalRealmSystem.resources[cost.resourceId] -= cost.amount;
          return true;
        }
      }
    });
  }

  function configureCelestialEvents(savedState) {
    celestialEventSystem = celestialEventsApi.createState(savedState);
  }

  function derivedCombatStats() {
    const stats = equipmentApi.deriveStats(equipment);
    for (const effect of skillSystem?.passiveEffects() || []) {
      for (const key of ['damageMultiplier','attackCooldownMultiplier','dashCooldownMultiplier','moveSpeedMultiplier','parryWindowMultiplier','qiGainMultiplier']) if (Number.isFinite(effect[key])) stats[key] *= effect[key];
      for (const key of ['reachBonus','maxHpBonus','defense','lootChanceBonus','attackArcBonus']) if (Number.isFinite(effect[key])) stats[key] += effect[key];
    }
    const heavenlyInsight = endgameSystem?.serialize().heavenlyInsight || 0;
    stats.damageMultiplier *= 1 + Math.min(.3, heavenlyInsight * .0025);
    stats.maxHpBonus += Math.min(60, Math.floor(heavenlyInsight / 4));
    const dao = daoSystem?.aggregateBonuses() || {};
    stats.damageMultiplier *= 1 + (dao.attackPowerPct || 0);
    stats.attackCooldownMultiplier *= 1 - (dao.attackSpeedPct || 0);
    stats.moveSpeedMultiplier *= 1 + (dao.moveSpeedPct || 0);
    stats.dashCooldownMultiplier *= 1 - (dao.dashCooldownReductionPct || 0);
    stats.parryWindowMultiplier *= 1 + (dao.parryWindowMs || 0) / 200;
    stats.maxHpBonus += dao.maxHealth || 0;
    stats.defense += dao.damageReductionPct || 0;
    stats.critChance = clamp(dao.critChance || 0, 0, .5);
    stats.bossDamageMultiplier = 1 + (dao.bossDamagePct || 0);
    stats.riposteDamageMultiplier = 1 + (dao.riposteDamagePct || 0);
    stats.parryQiRefund = Math.max(0, dao.parryQiRefund || 0);
    stats.maxQiBonus = Math.max(0, dao.maxQi || 0);
    stats.qiRegenPerSecond = Math.max(0, dao.qiRegenPerSecond || 0);
    stats.dashQiCostReduction = Math.max(0, dao.dashQiCostReduction || 0);
    stats.dashDistanceMultiplier = 1 + (dao.dashDistancePct || 0);
    stats.defense = clamp(stats.defense, 0, .65); stats.dashCooldownMultiplier = Math.max(.45, stats.dashCooldownMultiplier);
    return stats;
  }
  function effectiveMaxHp() { return player.maxHp + derivedCombatStats().maxHpBonus; }
  function effectiveMaxQi() { return player.maxQi + derivedCombatStats().maxQiBonus; }
  function actionHeld(action) {
    if (keys.has(`@${action}`)) return true;
    return keybinds.get(action).some(key => keys.has(key));
  }
  function actionPressed(action) {
    if (taps.has(`@${action}`)) return true;
    return keybinds.get(action).some(key => taps.has(key));
  }
  function bindingLabel(action) {
    const key = keybinds.get(action)[0] || '?';
    return key === 'space' ? 'Space' : key === 'shift' ? 'Shift' : key.length === 1 ? key.toUpperCase() : key.replace('arrow', 'Arrow ');
  }

  function reconcileQuestProgress() {
    const before = quest;
    if (quest === 1 && player.kills > 0) quest = 2;
    if (quest === 2 && player.herbs >= 3) quest = 3;
    if (quest === 3 && player.realm > 0) quest = 4;
    if (quest === 4 && openedCacheCount() >= treasures.length) quest = 5;
    if (quest === 5 && bossStates.sectbreaker) quest = 6;
    return quest !== before;
  }

  function sanitizeLoadedState() {
    player.realm = clamp(Math.floor(player.realm) || 0, 0, realms.length - 1);
    player.stage = clamp(Math.floor(player.stage) || 1, 1, realms[player.realm].stages);
    player.maxHp = clamp(Math.floor(player.maxHp) || 100, 1, 1000000);
    player.maxQi = clamp(Math.floor(player.maxQi) || realms[player.realm].qi, 1, 1000000);
    player.hp = clamp(player.hp, 0, effectiveMaxHp());
    player.qi = clamp(player.qi, 0, effectiveMaxQi());
    player.attack = clamp(Math.floor(player.attack) || 16, 1, 1000000);
    player.stones = clamp(Math.floor(player.stones) || 0, 0, 100000000);
    player.herbs = clamp(Math.floor(player.herbs) || 0, 0, 100000000);
    player.kills = clamp(Math.floor(player.kills) || 0, 0, 100000000);
    quest = clamp(Math.floor(quest) || 0, 0, 6);
    if (currentScene === 'sanctuary') {
      const safe = sanctuaryApi.sanitizeLocation(sanctuary, { x: player.x / SANCT_TILE, y: player.y / SANCT_TILE });
      player.x = safe.x * SANCT_TILE; player.y = safe.y * SANCT_TILE;
    } else if (currentScene === 'ascended') {
      if (!ascendedPassableAt(player.x, player.y, player.r)) { player.x = ascensionGate.x; player.y = ascensionGate.y; }
    } else if (!passableAt(player.x, player.y, player.r)) { player.x = 47.5 * TILE; player.y = 39 * TILE; }
    worldReturnPosition.x = clamp(worldReturnPosition.x, player.r, WORLD_W * TILE - player.r);
    worldReturnPosition.y = clamp(worldReturnPosition.y, player.r, WORLD_H * TILE - player.r);
    if (!passableAt(worldReturnPosition.x, worldReturnPosition.y, player.r)) worldReturnPosition = { x: 58.5 * TILE, y: 36.5 * TILE };
  }

  function save() {
    if (suppressSave) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        version: SAVE_VERSION,
        name: playerName,
        x: player.x, y: player.y, hp: player.hp, qi: player.qi, maxQi: player.maxQi, maxHp: player.maxHp,
        xp: player.xp, xpNeed: player.xpNeed, realm: player.realm, stage: player.stage, stones: player.stones,
        herbs: player.herbs, kills: player.kills, attack: player.attack, quest, playTime,
        discoveries: [...player.discoveries], discoveredAreas: [...player.discoveredAreas], discoveredLandmarks: [...player.discoveredLandmarks], treasures: treasures.map(t => t.opened),
        ingredients: { ...player.ingredients }, keyItems: [...player.keyItems], tutorial: { ...tutorial }, bosses: { ...bossStates },
        equipment: equipmentApi.serialize(equipment), keybinds: keybinds.snapshot(),
        personalStorage: storageApi.serialize(personalStorage), skills: skillSystem?.serialize() || { version: 1, learned: [] },
        endgame: endgameSystem?.serialize() || endgameApi.deserialize(),
        immortalRealm: immortalRealmApi.serialize(immortalRealmSystem || immortalRealmApi.createState()),
        daoPaths: daoSystem?.serialize() || daoApi.deserialize(),
        celestialEvents: celestialEventsApi.serialize(celestialEventSystem || celestialEventsApi.createState()),
        activeRiftId,
        storyFlags: [...storyFlags], location: currentScene, worldReturnPosition: { ...worldReturnPosition }, ascendedReturnPosition: { ...ascendedReturnPosition },
        resourceReadyAt: Object.fromEntries(resourceNodes.filter(n => !n.ready).map(n => [n.id, Date.now() + Math.max(0, n.respawn) * 1000])),
        bossDefeated: bossStates.sectbreaker
      }));
    } catch (_) {}
  }

  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (!d) return false;
      loadedSaveVersion = Number.isFinite(d.version) ? Math.floor(d.version) : 0;
      playerName = cleanPlayerName(d.name);
      for (const k of ['x','y','hp','qi','maxQi','maxHp','xp','xpNeed','realm','stage','stones','herbs','kills','attack']) if (Number.isFinite(d[k])) player[k] = d[k];
      quest = Number.isFinite(d.quest) ? d.quest : 0;
      playTime = Number.isFinite(d.playTime) ? d.playTime : 0;
      if (Array.isArray(d.discoveries)) player.discoveries = new Set(d.discoveries);
      if (Array.isArray(d.discoveredAreas)) player.discoveredAreas = new Set(d.discoveredAreas.filter(id => areas.some(a => a.id === id)));
      else for (const area of areas) if (player.discoveries.has(area.name)) player.discoveredAreas.add(area.id);
      if (Array.isArray(d.discoveredLandmarks)) player.discoveredLandmarks = new Set(d.discoveredLandmarks.filter(id => landmarks.some(l => l.id === id)));
      player.discoveredLandmarks.add('crossroads');
      for (const landmark of landmarks) if (areas.some(a => player.discoveredAreas.has(a.id) && Math.hypot(landmark.x - a.x, landmark.y - a.y) < a.r + 2)) player.discoveredLandmarks.add(landmark.id);
      // Version 2 could autosave a chest as opened before its reward threw an error.
      if (d.version >= 3 && Array.isArray(d.treasures)) d.treasures.forEach((opened, i) => { if (treasures[i]) treasures[i].opened = !!opened; });
      if (d.ingredients && typeof d.ingredients === 'object') for (const key of Object.keys(player.ingredients)) {
        if (Number.isFinite(d.ingredients[key])) player.ingredients[key] = clamp(Math.floor(d.ingredients[key]), 0, 9999);
      }
      if (Array.isArray(d.keyItems)) player.keyItems = new Set(d.keyItems.filter(key => itemDefs[key] && !(key in player.ingredients)));
      if (d.resourceReadyAt && typeof d.resourceReadyAt === 'object') loadedResourceReadyAt = Object.fromEntries(
        Object.entries(d.resourceReadyAt).filter(([id, readyAt]) => typeof id === 'string' && Number.isFinite(readyAt))
      );
      if (d.tutorial && typeof d.tutorial === 'object') {
        tutorial.attacked = !!d.tutorial.attacked; tutorial.cultivated = !!d.tutorial.cultivated;
      } else {
        tutorial.attacked = (Number.isFinite(d.quest) && d.quest >= 2) || player.kills > 0;
        tutorial.cultivated = (Number.isFinite(d.quest) && d.quest >= 1) || player.realm > 0 || player.qi > 0;
      }
      if (d.bosses && typeof d.bosses === 'object') for (const id of Object.keys(bossStates)) bossStates[id] = !!d.bosses[id];
      if (d.bossDefeated) bossStates.sectbreaker = true;
      equipment = equipmentApi.deserialize(d.equipment);
      keybinds = keybindApi.createKeybinds(d.keybinds);
      personalStorage = storageApi.deserialize(d.personalStorage);
      pendingSkillState = skillsApi.deserialize(d.skills);
      pendingEndgameState = endgameApi.deserialize(d.endgame);
      pendingImmortalRealmState = immortalRealmApi.deserialize(d.immortalRealm);
      pendingDaoState = daoApi.deserialize(d.daoPaths);
      pendingCelestialEventState = celestialEventsApi.deserialize(d.celestialEvents);
      if (Array.isArray(d.storyFlags)) d.storyFlags.filter(flag => typeof flag === 'string' && /^[a-z0-9_]{1,48}$/.test(flag)).forEach(flag => storyFlags.add(flag));
      configureSkillSystem(pendingSkillState);
      configureEndgameSystem(pendingEndgameState);
      configureImmortalRealm(pendingImmortalRealmState);
      configureDaoSystem(pendingDaoState);
      configureCelestialEvents(pendingCelestialEventState);
      currentScene = ['sanctuary', 'ascended'].includes(d.location) ? d.location : 'world';
      activeRiftId = null;
      if (currentScene === 'ascended' && typeof d.activeRiftId === 'string' && immortalRealmApi.RIFTS[d.activeRiftId]) {
        const savedRift = immortalRealmApi.inspectRift(immortalRealmSystem, d.activeRiftId);
        if (savedRift.ok && savedRift.discovered && !savedRift.stabilized) activeRiftId = d.activeRiftId;
      }
      if (d.worldReturnPosition && Number.isFinite(d.worldReturnPosition.x) && Number.isFinite(d.worldReturnPosition.y)) worldReturnPosition = { x: d.worldReturnPosition.x, y: d.worldReturnPosition.y };
      if (d.ascendedReturnPosition && Number.isFinite(d.ascendedReturnPosition.x) && Number.isFinite(d.ascendedReturnPosition.y)) ascendedReturnPosition = { x: d.ascendedReturnPosition.x, y: d.ascendedReturnPosition.y };
      // Defeat flags are authoritative. Repair missing durable keys in legacy or
      // partially-written saves so a completed boss can never softlock progress.
      for (const boss of bossDefs) if (bossStates[boss.id]) player.keyItems.add(boss.keyItem);
      if (loadedSaveVersion < 10 && player.realm === 4) {
        player.stage = 1;
        player.maxQi = qiCapacity(4, 1);
        player.qi = Math.min(player.qi, player.maxQi);
      }
      if (player.realm === 4 && loadedSaveVersion < 11) {
        const oldStage = player.stage; player.stage = Math.max(player.stage, endgameSystem.serialize().nascentStage);
        if (player.stage > oldStage) { player.maxHp += (player.stage - oldStage) * 18; player.attack += (player.stage - oldStage) * 5; }
        player.maxQi = qiCapacity(); player.qi = Math.min(player.qi, player.maxQi);
      }
      // Old or partially-written saves must never create an unbounded level-up loop.
      player.xpNeed = clamp(Math.floor(player.xpNeed) || 60, 20, 1000000);
      player.xp = clamp(Math.floor(player.xp) || 0, 0, player.xpNeed * 10);
      sanitizeLoadedState();
      return true;
    } catch (_) { return false; }
  }

  function tileUnder(o = player) { return map[clamp(Math.floor(o.y / TILE), 0, WORLD_H - 1)][clamp(Math.floor(o.x / TILE), 0, WORLD_W - 1)]; }
  function zoneName() {
    if (currentScene === 'sanctuary') {
      const tx = player.x / SANCT_TILE, ty = player.y / SANCT_TILE;
      return sanctuary.zones.find(zone => tx >= zone.x && ty >= zone.y && tx < zone.x + zone.width && ty < zone.y + zone.height)?.name || sanctuary.name;
    }
    if (currentScene === 'ascended') {
      const tx = player.x / TILE, ty = player.y / TILE;
      return ascendedAreas.reduce((best, area) => {
        const score = ((tx - area.x) / area.rx) ** 2 + ((ty - area.y) / area.ry) ** 2;
        return !best || score < best.score ? { area, score } : best;
      }, null)?.area.name || 'Between the Heavens';
    }
    const tx = player.x / TILE, ty = player.y / TILE;
    const found = areas.find(a => Math.hypot(tx - a.x, ty - a.y) < a.r + 1);
    if (found) return found.name;
    if (Math.hypot(tx - 47, ty - 36) < 9) return 'Crossroads Shrine';
    if (ty < 24 && tx < 34) return 'Whispering Bamboo';
    if (ty < 24 && tx > 62) return 'Cloudstep Bluffs';
    if (ty > 48 && tx < 34) return 'Moonpetal Marsh';
    if (ty > 48 && tx > 62) return 'Cinderstone Expanse';
    if (ty < 28) return 'Northern Wilds';
    if (ty > 45) return 'Southern Reaches';
    return 'Old Pilgrim Road';
  }

  function moveEntity(o, dx, dy, radius) {
    const pass = o === player ? playerPassableAt : currentScene === 'ascended' ? ascendedPassableAt : passableAt;
    if (pass(o.x + dx, o.y, radius)) o.x += dx;
    if (pass(o.x, o.y + dy, radius)) o.y += dy;
  }

  const breakthroughRequirements = {
    '0:1': { herbs: 2 }, '0:2': { herbs: 3 }, '0:3': { stones: 5, keys: ['verdant_antler'] },
    '1:1': { ingredients: { cloud_dew: 2 } }, '1:2': { ingredients: { cloud_dew: 3 } },
    '1:3': { ingredients: { cloud_dew: 4 } }, '1:4': { ingredients: { cloud_dew: 5 } },
    '1:5': { stones: 12, keys: ['cloudstep_sigil'] },
    '2:1': { ingredients: { lotus_seed: 2 } }, '2:2': { ingredients: { root_resin: 2 } },
    '2:3': { ingredients: { lotus_seed: 3, root_resin: 3 } }, '2:4': { stones: 20, keys: ['mire_pearl'] },
    '3:1': { ingredients: { cinder_marrow: 3 } }, '3:2': { ingredients: { cinder_marrow: 5 } },
    '3:3': { stones: 30, keys: ['sectbreaker_core', 'starfallen_shard'] }
  };
  const cultivationRecipes = Object.fromEntries(Object.entries(breakthroughRequirements).map(([id, requirement]) => {
    const costs = [];
    if (requirement.herbs) costs.push({ type: 'resource', id: 'herbs', amount: requirement.herbs });
    if (requirement.stones) costs.push({ type: 'resource', id: 'stones', amount: requirement.stones });
    for (const [item, amount] of Object.entries(requirement.ingredients || {})) costs.push({ type: 'resource', id: item, amount });
    const requirements = (requirement.keys || []).map(item => ({ type: 'flag', id: item }));
    return [id, { requirements, costs, result: { advance: true } }];
  }));
  const cultivationService = cultivationApi.createCultivationSystem({
    recipes: cultivationRecipes,
    resources: {
      get: id => id === 'herbs' ? player.herbs : id === 'stones' ? player.stones : player.ingredients[id] || 0,
      spend: (id, amount) => {
        if (id === 'herbs') { if (player.herbs < amount) return false; player.herbs -= amount; return true; }
        if (id === 'stones') { if (player.stones < amount) return false; player.stones -= amount; return true; }
        if ((player.ingredients[id] || 0) < amount) return false; player.ingredients[id] -= amount; return true;
      },
      credit: (id, amount) => { if (id === 'herbs') player.herbs += amount; else if (id === 'stones') player.stones += amount; else player.ingredients[id] = (player.ingredients[id] || 0) + amount; }
    },
    state: { hasFlag: id => player.keyItems.has(id) },
    applyResult: () => {}
  });

  function currentBreakthroughRequirement() { return breakthroughRequirements[`${player.realm}:${player.stage}`] || null; }

  function missingRequirements(requirement) {
    const recipeEntry = Object.entries(breakthroughRequirements).find(([, value]) => value === requirement);
    if (recipeEntry) cultivationService.inspect(recipeEntry[0], { player });
    const missing = [];
    if (!requirement) return missing;
    if (requirement.herbs && player.herbs < requirement.herbs) missing.push(`${requirement.herbs} moonleaf herbs (${player.herbs})`);
    if (requirement.stones && player.stones < requirement.stones) missing.push(`${requirement.stones} spirit stones (${player.stones})`);
    for (const [item, count] of Object.entries(requirement.ingredients || {})) if ((player.ingredients[item] || 0) < count) missing.push(`${count} ${itemDefs[item].name} (${player.ingredients[item] || 0})`);
    for (const item of requirement.keys || []) if (!player.keyItems.has(item)) missing.push(itemDefs[item].name);
    return missing;
  }

  function consumeRequirements(requirement) {
    if (!requirement) return;
    player.herbs -= requirement.herbs || 0; player.stones -= requirement.stones || 0;
    for (const [item, count] of Object.entries(requirement.ingredients || {})) player.ingredients[item] -= count;
  }

  function cultivate() {
    if (currentScene === 'ascended') { addMessage('Mortal spirit veins cannot reach this sky. Stabilize rifts to transform your soul.', 'bad'); return; }
    const vein = landmarks.find(l => l.type === 'vein' && Math.hypot(player.x / TILE - (l.x + .5), player.y / TILE - (l.y + .5)) < 2.25);
    if (!vein) { addMessage('Cultivation only works inside a green spirit-vein beacon.', 'bad'); return; }
    player.meditating = true;
    if (player.qi < effectiveMaxQi()) {
      const stats = derivedCombatStats();
      player.qi = Math.min(effectiveMaxQi(), player.qi + Math.round(18 * stats.qiGainMultiplier));
      player.hp = Math.min(effectiveMaxHp(), player.hp + 8);
      burst(player.x, player.y, '#77e6ba', 14, 38);
      addMessage('You draw rich vein qi into your meridians.', 'good');
      if (!tutorial.cultivated) { tutorial.cultivated = true; save(); }
      if (quest === 0) { quest = 1; addMessage('Insight: qi can strengthen body and blade.', 'good'); }
      if (player.qi >= effectiveMaxQi()) addMessage('Your qi is full. Cultivate again to attempt a breakthrough.', 'good');
    } else {
      breakthrough();
    }
  }

  function breakthrough(force = false) {
    if (player.realm === realms.length - 1 && player.stage === realms[player.realm].stages) { addMessage('Your path reaches beyond the current heavens.'); return false; }
    if (!force && realms[player.realm].name === 'Nascent Soul') {
      const progress = endgameSystem.progress();
      addMessage(progress.ascensionReady ? 'Your Nascent Soul is complete. Scholar Bo can open the Grand Ascension Formation.' : `Nascent Souls advance through the Heavenly Scar. Clear tribulation tier ${progress.nextStageAtTier}.`, progress.ascensionReady ? 'good' : 'bad');
      addMessage('Seek Scholar Bo in the sanctuary archive.');
      return false;
    }
    if (!force && realms[player.realm].name === 'Soul Transformation') {
      addMessage('Higher-realm stages awaken by stabilizing sky rifts and completing the transformed-soul rite.', 'bad');
      return false;
    }
    const requirement = currentBreakthroughRequirement(), missing = force ? [] : missingRequirements(requirement);
    if (!force && player.qi < effectiveMaxQi()) { addMessage('Your qi must be full before a breakthrough.', 'bad'); return false; }
    if (missing.length) {
      addMessage(`Breakthrough requires: ${missing.join(', ')}.`, 'bad');
      const missingKey = (requirement.keys || []).find(item => !player.keyItems.has(item));
      const missingIngredient = Object.keys(requirement.ingredients || {}).find(item => (player.ingredients[item] || 0) < requirement.ingredients[item]);
      const clue = missingKey || missingIngredient;
      if (clue) addMessage(itemDefs[clue].hint);
      return false;
    }
    if (!force && requirement) {
      const recipeId = `${player.realm}:${player.stage}`, result = cultivationService.attempt(recipeId, { player });
      if (!result.ok) { addMessage('Your gathered materials resist the breakthrough.', 'bad'); return false; }
    }
    const r = realms[player.realm];
    player.qi = 0;
    player.stage++;
    if (player.stage > r.stages) { player.realm = Math.min(player.realm + 1, realms.length - 1); player.stage = 1; }
    const nr = realms[player.realm];
    player.maxQi = qiCapacity();
    player.maxHp += 18;
    player.hp = effectiveMaxHp();
    player.attack += 5;
    flash = 1; shake = 10;
    burst(player.x, player.y, '#f1d47a', 38, 135);
    addMessage(`Breakthrough! ${nr.name}, stage ${player.stage}.`, 'good');
    if (quest < 3) quest = 3;
    reconcileQuestProgress();
    save();
    return true;
  }

  function gainXp(n) {
    if (!Number.isFinite(player.xpNeed) || player.xpNeed < 1) player.xpNeed = 60;
    if (!Number.isFinite(player.xp) || player.xp < 0) player.xp = 0;
    player.xp += Number.isFinite(n) ? Math.max(0, n) : 0;
    // The cap is a final safeguard against malformed legacy saves freezing a frame.
    let levels = 0;
    while (player.xp >= player.xpNeed && levels++ < 20) {
      player.xp -= player.xpNeed;
      player.xpNeed = Math.max(20, Math.floor(player.xpNeed * 1.35));
      player.attack += 2; player.maxHp += 5; player.hp = Math.min(effectiveMaxHp(), player.hp + 15);
      addMessage('Martial insight deepens your technique.', 'good');
    }
    if (levels >= 20) { player.xp = 0; player.xpNeed = Math.max(60, player.xpNeed); }
  }

  function parry() {
    if (player.parryCd > 0 || player.meditating || player.parryRecovery > 0 || player.attackTimer > 0) return;
    player.parryTimer = .2 * derivedCombatStats().parryWindowMultiplier; player.parryCd = .55; player.parryRecovery = .38;
    burst(player.x + Math.cos(player.facing) * 16, player.y + Math.sin(player.facing) * 16, '#fff1aa', 9, 70);
    sendWorldPresence('parry', true);
  }

  function attack() {
    if (player.attackCd > 0 || player.meditating || player.parryRecovery > 0 || player.parryTimer > 0) return;
    const stats = derivedCombatStats(), style = stats.weaponStyle;
    player.attackCd = .34 * stats.attackCooldownMultiplier; player.attackTimer = Math.min(.28, .15 * stats.attackCooldownMultiplier);
    sendWorldPresence('attack', true);
    if (!tutorial.attacked) { tutorial.attacked = true; save(); }
    const reach = 38 + stats.reachBonus, ax = player.x + Math.cos(player.facing) * (20 + stats.reachBonus * .35), ay = player.y + Math.sin(player.facing) * (20 + stats.reachBonus * .35);
    slashes.push({ x: player.x, y: player.y, a: player.facing, life: .18, style, reach, arc: .8 + stats.attackArcBonus });
    let criticalHit = false;
    for (const e of enemies) {
      if (!e.alive || Math.hypot(e.x - ax, e.y - ay) > reach) continue;
      const angle = Math.atan2(e.y - player.y, e.x - player.x);
      let delta = Math.atan2(Math.sin(angle - player.facing), Math.cos(angle - player.facing));
      if (Math.abs(delta) < 1.25 + stats.attackArcBonus) {
        const riposte = e.riposteWindow > 0, critical = stats.critChance > 0 && hash(player.kills, Math.floor(playTime * 1000), enemies.indexOf(e) + 941) < stats.critChance;
        const specialMultiplier = (riposte ? 2.2 * stats.riposteDamageMultiplier : 1) * (critical ? 1.65 : 1) * (e.boss ? stats.bossDamageMultiplier : 1);
        e.hp -= (player.attack + Math.floor(player.qi * .035)) * stats.damageMultiplier * specialMultiplier;
        criticalHit ||= critical;
        if (riposte) { e.riposteWindow = 0; addMessage('Riposte! The opening collapses.', 'good'); }
        e.hit = .18; moveEntity(e, Math.cos(angle) * 14, Math.sin(angle) * 14, enemyTypes[e.type].r);
        burst(e.x, e.y, '#f4c477', 7, 80);
        if (e.hp <= 0) killEnemy(e);
      }
    }
    if (criticalHit) addMessage('Starblade critical strike!', 'good');
  }

  function useTalisman() {
    if (player.talismanCd > 0 || player.parryTimer > 0 || player.parryRecovery > 0 || player.attackTimer > 0) return;
    if (player.qi < 20) { addMessage('You need 20 qi to cast a sword seal.', 'bad'); return; }
    player.qi -= 20; player.talismanCd = 2.2; shake = 5;
    for (const e of enemies) if (e.alive && dist(player, e) < 112) {
      e.hp -= player.attack * .85 * derivedCombatStats().damageMultiplier + 12; e.hit = .25;
      const a = Math.atan2(e.y - player.y, e.x - player.x); moveEntity(e, Math.cos(a) * 24, Math.sin(a) * 24, enemyTypes[e.type].r);
      burst(e.x, e.y, '#74e8bd', 10, 90); if (e.hp <= 0) killEnemy(e);
    }
    for (let i = 0; i < 28; i++) {
      const a = i / 28 * TAU;
      particles.push({ x: player.x + Math.cos(a) * 18, y: player.y + Math.sin(a) * 18, vx: Math.cos(a) * 170, vy: Math.sin(a) * 170, life: .5, max: .5, color: '#7af0c2', size: 3 });
    }
  }

  function useLearnedArt() {
    if (!skillSystem?.hasLearned('ember_palm')) { addMessage('A tutor must first teach you an active cultivation art.', 'bad'); return; }
    if (!['world', 'ascended'].includes(currentScene) || player.skillCd > 0 || player.parryTimer > 0 || player.attackTimer > 0) return;
    if (player.qi < 15) { addMessage('Ember Palm requires 15 qi.', 'bad'); return; }
    const art = skillsApi.CATALOG.ember_palm; player.qi -= 15; player.skillCd = art.effect.cooldown; shake = 7;
    const cx = player.x + Math.cos(player.facing) * 42, cy = player.y + Math.sin(player.facing) * 42;
    for (const e of enemies) {
      if (!e.alive || Math.hypot(e.x - cx, e.y - cy) > 72) continue;
      const angle = Math.atan2(e.y - player.y, e.x - player.x), delta = Math.atan2(Math.sin(angle - player.facing), Math.cos(angle - player.facing));
      if (Math.abs(delta) > .85) continue;
      e.hp -= (player.attack + 10) * art.effect.damageMultiplier * derivedCombatStats().damageMultiplier; e.hit = .3;
      burst(e.x, e.y, '#ff934f', 16, 105); if (e.hp <= 0) killEnemy(e);
    }
    for (let i = -4; i <= 4; i++) {
      const angle = player.facing + i * .13;
      particles.push({ x: player.x + Math.cos(angle) * 18, y: player.y + Math.sin(angle) * 18, vx: Math.cos(angle) * (150 + Math.abs(i) * 6), vy: Math.sin(angle) * (150 + Math.abs(i) * 6), life: .5, max: .5, color: i % 2 ? '#ff7a3d' : '#ffd06d', size: 5 });
    }
    addMessage('Ember Palm!', 'good');
  }

  function killEnemy(e) {
    e.alive = false; e.respawn = e.boss ? 999999 : 18 + hash(player.kills, 9) * 18; player.kills++;
    const t = enemyTypes[e.type]; gainXp(t.xp);
    if (e.tribulation) {
      burst(e.x, e.y, e.elite ? '#d6b5ff' : '#91c9ff', e.elite ? 26 : 14, 120);
      addMessage(`${e.title || t.name} dissolves into heavenly qi.`, 'good');
      advanceTribulationIfCleared();
      return;
    }
    if (e.higherRealm) {
      const result = immortalRealmApi.defeatEnemy(immortalRealmSystem, e.realmEnemyId, { riftId: e.riftId });
      if (e.incursionEvent) celestialEventsApi.recordKill(celestialEventSystem, e.realmEnemyId, { elite: !!e.incursionElite });
      burst(e.x, e.y, e.boss ? '#f2c6ff' : '#8fdff1', e.boss ? 40 : 18, e.boss ? 155 : 110);
      addMessage(`${e.title || t.name} falls · +${result.reward.shards} soul shards${result.reward.sigils ? `, +${result.reward.sigils} sigil` : ''}.`, 'good');
      if (e.realmEnemyId === 'void_harbinger') { flash = 1; addMessage('The Void Harbinger breaks. Celestial Decrees now sustain your final transformation.', 'good'); }
      claimReadyBounty(); advanceRiftIfCleared(); advanceCelestialIncursionIfCleared(); save(); return;
    }
    if (hash(player.kills, Math.floor(playTime), 12) > .43) pickups.push({ x: e.x, y: e.y, type: 'stone', life: 24, bob: hash(e.x|0,e.y|0)*TAU });
    const bossGear = { jadehorn: 'steady_heart_pendant', tempest_crane: 'cloudpiercer_spear', mirecoil_matriarch: 'moonshadow_garb', sectbreaker: 'mountain_cleaver', starfallen_warden: 'earthpulse_medallion' };
    const dropPools = {
      hare: ['steady_heart_pendant', 'wanderer_robes'], wolf: ['twin_moon_blades', 'moonstep_charm'],
      wisp: ['cloudpiercer_spear', 'far_horizon_jade'], serpent: ['moonshadow_garb', 'cloudpiercer_mail'],
      guardian: ['mountain_guard_plate', 'earthpulse_medallion'], rogue: ['twin_moon_blades', 'mountain_cleaver']
    };
    const lootRoll = hash(player.kills, Math.floor(e.x + e.y), 84);
    const gearId = e.boss ? bossGear[e.bossId] : lootRoll < .08 + derivedCombatStats().lootChanceBonus ? dropPools[e.type][Math.floor(hash(e.x | 0, e.y | 0, player.kills) * dropPools[e.type].length)] : null;
    if (gearId) {
      const drop = equipmentApi.addItem(equipment, gearId), definition = equipmentApi.getDefinition(gearId);
      if (drop.ok) addMessage(`${definition.name} was added to your inventory.`, 'good');
      else { player.stones += Math.max(2, Math.floor(definition.price / 3)); addMessage('Your pack is full; the gear dissolved into spirit stones.'); }
    }
    burst(e.x, e.y, t.color, 18, 105);
    addMessage(`${t.name} was defeated.`, 'good');
    if (e.boss) {
      bossStates[e.bossId] = true; player.keyItems.add(e.keyItem); player.stones += e.bossId === 'sectbreaker' ? 12 : 6; player.qi = effectiveMaxQi();
      addMessage(`${e.title} falls. Obtained ${itemDefs[e.keyItem].name}.`, 'good'); flash = 1;
      reconcileQuestProgress(); save();
    }
    reconcileQuestProgress();
  }

  function allBossesDefeated() { return Object.values(bossStates).every(Boolean); }

  function clearTribulationEnemies() {
    enemies = enemies.filter(enemy => !enemy.tribulation);
  }

  function openPointNear(cx, cy, angle, radius) {
    const targetX = cx + Math.cos(angle) * radius, targetY = cy + Math.sin(angle) * radius;
    for (let ring = 0; ring <= 5; ring++) for (let step = 0; step < 8; step++) {
      const a = angle + step / 8 * TAU, x = targetX + Math.cos(a) * ring * TILE, y = targetY + Math.sin(a) * ring * TILE;
      if (passableAt(x, y, 14)) return { x, y };
    }
    return { x: tribulationGate.x, y: tribulationGate.y };
  }

  function makeTribulationEnemy(type, index, count, wave, elite, modifiers) {
    const base = enemyTypes[type], angle = index / Math.max(1, count) * TAU + wave * .71;
    const point = openPointNear(tribulationGate.x, tribulationGate.y, angle, (4.5 + (index % 3)) * TILE);
    const eliteScale = elite ? 1.65 : 1;
    return {
      ...point, type, hp: Math.round(base.hp * modifiers.hpMultiplier * eliteScale), maxHp: Math.round(base.hp * modifiers.hpMultiplier * eliteScale),
      vx: 0, vy: 0, hit: 0, attackCd: .7 + index * .08, wander: angle, alive: true,
      attackState: 'idle', attackTimer: 0, attackAngle: 0, attackLanded: false, stagger: 0, riposteWindow: 0,
      tribulation: true, elite, speedMultiplier: modifiers.speedMultiplier,
      title: elite ? `Heavenly Elite · Wave ${wave + 1}` : '', respawn: 999999,
      profile: { damage: Math.round(base.damage * modifiers.damageMultiplier * (elite ? 1.3 : 1)), windup: Math.max(.2, base.windup / modifiers.speedMultiplier), range: base.range, recovery: Math.max(.45, base.recovery / modifiers.speedMultiplier), kind: base.kind, parryable: !elite }
    };
  }

  function spawnTribulationPhase() {
    const active = endgameSystem.active();
    if (!active) return;
    clearTribulationEnemies();
    const trial = active.trial;
    if (tribulationPhase < trial.waves.length) {
      const wave = trial.waves[tribulationPhase], types = ['wolf','wisp','serpent','guardian','rogue'];
      for (let i = 0; i < wave.enemyCount; i++) {
        const elite = i < wave.eliteCount;
        enemies.push(makeTribulationEnemy(types[(i + tribulationPhase + active.tier) % types.length], i, wave.enemyCount, tribulationPhase, elite, wave));
      }
      addMessage(`Tribulation tier ${active.tier} · wave ${tribulationPhase + 1}/${trial.waves.length}.`, 'bad');
      return;
    }
    const type = active.tier % 2 ? 'rogue' : 'guardian', base = enemyTypes[type], boss = trial.boss;
    const point = openPointNear(tribulationGate.x, tribulationGate.y, -Math.PI / 2, 5 * TILE);
    const hp = Math.round((420 + active.tier * 85) * boss.hpMultiplier);
    enemies.push({
      ...point, type, hp, maxHp: hp, vx: 0, vy: 0, hit: 0, attackCd: 1, wander: 0, alive: true,
      attackState: 'idle', attackTimer: 0, attackAngle: 0, attackLanded: false, stagger: 0, riposteWindow: 0,
      tribulation: true, elite: true, speedMultiplier: boss.speedMultiplier, title: `Echo of the Heavens · Tier ${active.tier}`, respawn: 999999,
      profile: { damage: Math.round(base.damage * boss.damageMultiplier * 2.2), windup: Math.max(.3, base.windup / boss.speedMultiplier), range: base.range + 14, recovery: Math.max(.55, base.recovery / boss.speedMultiplier), kind: active.tier % 3 === 0 ? 'slam' : base.kind, parryable: active.tier % 3 !== 0 }
    });
    addMessage(`The Echo of the Heavens descends.`, 'bad');
  }

  function startTribulation(tier = Math.min(endgameApi.MAX_TIER, (endgameSystem?.serialize().bestTier || 0) + 1)) {
    const report = endgameSystem.begin(tier, { player });
    if (!report.ok) {
      const missingStones = report.missing?.find(check => check.id === 'spiritStones');
      const reason = report.code === 'trial_active' ? 'A heavenly tribulation is already unfolding.'
        : !allBossesDefeated() ? 'Five fallen sovereigns must open the Heavenly Scar.'
        : realms[player.realm].name !== 'Nascent Soul' ? 'Only a Nascent Soul can survive the Heavenly Scar.'
        : missingStones ? `Tier ${tier} requires ${missingStones.amount} spirit stones.`
        : endgameSystem.progress().ascensionReady ? 'All three tribulations are complete. Return to Scholar Bo to ascend.'
        : 'That tribulation tier remains sealed.';
      addMessage(reason, 'bad'); return false;
    }
    if (activeMenu) closeMenu();
    mapOpen = false; safeTeleport(116, 92); tribulationPhase = 0;
    player.hp = effectiveMaxHp(); player.qi = effectiveMaxQi(); player.invuln = 2;
    spawnTribulationPhase(); save(); updateUI(); return true;
  }

  function completeTribulation() {
    const active = endgameSystem.active(); if (!active) return;
    const result = endgameSystem.complete(active.attemptId); clearTribulationEnemies();
    if (!result.ok) return;
    if (player.realm === 4 && result.nascentStage > player.stage) {
      const advances = result.nascentStage - player.stage; player.stage = result.nascentStage;
      player.maxHp += advances * 18; player.attack += advances * 5; player.maxQi = qiCapacity();
      addMessage(`Your Nascent Soul awakens to stage ${roman(player.stage)}.`, 'good'); flash = 1;
    }
    player.stones += 10 + result.tier * 3; player.hp = effectiveMaxHp(); player.qi = effectiveMaxQi();
    burst(player.x, player.y, '#d9b8ff', 42, 155);
    addMessage(`Tribulation tier ${result.tier} cleared · +${result.rewards.heavenlyMarks} marks, +${result.rewards.heavenlyInsight} insight.`, 'good');
    save(); updateUI();
  }

  function failTribulation(message) {
    const active = endgameSystem?.active(); if (!active) return false;
    endgameSystem.fail(active.attemptId); clearTribulationEnemies(); tribulationPhase = 0;
    if (message) addMessage(message, 'bad'); save(); return true;
  }

  function advanceTribulationIfCleared() {
    const active = endgameSystem?.active(); if (!active || enemies.some(enemy => enemy.tribulation && enemy.alive)) return;
    if (tribulationPhase < active.trial.waves.length) { tribulationPhase++; spawnTribulationPhase(); }
    else completeTribulation();
  }

  function resumeTribulation() {
    const active = endgameSystem?.active(); if (!active) return;
    if (!allBossesDefeated() || realms[player.realm].name !== 'Nascent Soul') { failTribulation(); return; }
    safeTeleport(116, 92); tribulationPhase = 0; spawnTribulationPhase();
    addMessage(`The unfinished tier ${active.tier} tribulation reforms.`, 'bad');
  }

  function gather() {
    const chest = treasures.find(t => !t.opened && dist(player, t) < 58);
    if (chest) {
      chest.opened = true; const reward = 3 + Math.floor(hash(chest.x, chest.y, 55) * 4);
      player.stones += reward; player.qi = Math.min(effectiveMaxQi(), player.qi + 20); gainXp(25);
      burst(chest.x, chest.y, '#f0cd72', 22, 95); addMessage(`Opened an ancient cache: ${reward} spirit stones.`, 'good'); reconcileQuestProgress(); save(); return;
    }
    const node = resourceNodes.find(n => n.ready && dist(player, n) < 42);
    if (node) {
      node.ready = false; node.respawn = 55; player.ingredients[node.item]++;
      burst(node.x, node.y, itemDefs[node.item].color, 12, 55); addMessage(`Gathered ${itemDefs[node.item].name}.`, 'good'); save(); return;
    }
    const plant = plants.find(p => p.ready && dist(player, p) < 42);
    if (plant) {
      plant.ready = false; plant.respawn = 35; player.herbs++;
      burst(plant.x, plant.y, '#82c86b', 9, 45); addMessage('Gathered moonleaf herb.', 'good');
      if (player.herbs % 3 === 0) { player.hp = Math.min(effectiveMaxHp(), player.hp + 25); addMessage('Three herbs mend your wounds.', 'good'); }
      reconcileQuestProgress();
      return;
    }
    addMessage('No ripe spirit herb is within reach.');
  }

  function enterSanctuary() {
    if (currentScene === 'world') worldReturnPosition = { x: player.x, y: player.y };
    if (currentScene === 'ascended') {
      ascendedReturnPosition = { x: player.x, y: player.y }; ascendedEnemies = enemies.filter(enemy => !enemy.riftEvent && !enemy.incursionEvent); activeRiftId = null; enemies = worldEnemies || []; worldEnemies = null;
    }
    sendWorldPresence('none', true);
    currentScene = 'sanctuary'; mapOpen = false;
    syncMultiplayerForScene();
    player.x = sanctuary.spawn.x * SANCT_TILE; player.y = sanctuary.spawn.y * SANCT_TILE; player.facing = -Math.PI / 2;
    releaseAllInputs(); addMessage(`Entered ${sanctuary.name}.`, 'good'); save(); updateUI();
  }

  function leaveSanctuary() {
    currentScene = 'world'; mapOpen = false; player.x = worldReturnPosition.x; player.y = worldReturnPosition.y + TILE; player.facing = Math.PI / 2;
    syncMultiplayerForScene();
    releaseAllInputs(); addMessage('Returned to the Crossroads.', 'good'); save(); updateUI();
  }

  function enterAscendedRealm() {
    if (player.realm < 5) { addMessage('Your soul cannot yet cross the heavenly boundary.', 'bad'); return false; }
    if (activeMenu) closeMenu();
    if (currentScene !== 'ascended') {
      if (!worldEnemies) worldEnemies = enemies;
      populateAscended(); enemies = ascendedEnemies; currentScene = 'ascended';
    }
    syncMultiplayerForScene();
    player.x = ascendedReturnPosition.x; player.y = ascendedReturnPosition.y;
    if (!ascendedPassableAt(player.x, player.y, player.r)) { player.x = ascensionGate.x; player.y = ascensionGate.y; }
    player.facing = 0; player.invuln = 2; realmHazard = { timer: 3, warning: 0, x: 0, y: 0 };
    immortalRealmApi.discoverRegion(immortalRealmSystem, 'celestial_ruins');
    if (!activeRiftId && celestialEventsApi.inspect(celestialEventSystem).active) spawnCelestialIncursion();
    releaseAllInputs(); addMessage('You cross into the Immortal Realm.', 'good'); save(); updateUI(); return true;
  }

  function leaveAscendedRealm() {
    if (currentScene !== 'ascended') return false;
    if (activeRiftId) { addMessage('The open sky rift binds you here until its echoes are defeated.', 'bad'); return false; }
    ascendedReturnPosition = { x: player.x, y: player.y };
    ascendedEnemies = enemies.filter(enemy => !enemy.incursionEvent); enemies = worldEnemies || []; worldEnemies = null;
    currentScene = 'sanctuary'; mapOpen = false; player.x = 39 * SANCT_TILE; player.y = 15.5 * SANCT_TILE; player.facing = Math.PI;
    syncMultiplayerForScene();
    releaseAllInputs(); addMessage('Scholar Bo draws your soul safely back to the sanctuary.', 'good'); save(); updateUI(); return true;
  }

  function ascendWithScholarBo() {
    const ready = endgameSystem?.progress().ascensionReady && player.realm === 4 && player.stage >= 9;
    if (player.realm >= 5) return enterAscendedRealm();
    if (!ready) { addMessage('Bo says three Heavenly Tribulations must temper a complete Nascent Soul.', 'bad'); return false; }
    const firstAscension = !storyFlags.has('ascended_soul_transformation');
    player.realm = 5; player.stage = 1;
    if (firstAscension) { player.maxHp += 30; player.attack += 8; storyFlags.add('ascended_soul_transformation'); }
    else { player.maxHp += 18; player.attack += 5; }
    player.maxQi = qiCapacity(); player.qi = effectiveMaxQi(); player.hp = effectiveMaxHp(); flash = 1;
    addMessage('Scholar Bo opens the Grand Ascension Formation. Your soul transforms.', 'good');
    return enterAscendedRealm();
  }

  function nearestSanctuaryInteraction() {
    return sanctuaryApi.nearestInteractable(sanctuary, player.x / SANCT_TILE, player.y / SANCT_TILE, 2.15);
  }

  function openSanctuaryNpc(npc) {
    if (npc.service === 'quartermaster') { openMerchant(); return; }
    activeNpc = npc;
    if (npc.service === 'sword-tutor') storyFlags.add('met_suye');
    openMenu('dialogue'); renderNpcDialogue(); save();
  }

  function skillRequirementLabel(check) {
    if (check.type === 'stage') return `cultivation step ${check.atLeast}`;
    if (check.type === 'skill') return skillsApi.CATALOG[check.id]?.name || check.id;
    if (check.type === 'resource') return `${check.amount} spirit stones`;
    if (check.type === 'item') return `${check.amount} iron ore (not yet obtainable)`;
    return check.id || 'story progress';
  }

  function renderNpcDialogue() {
    if (!activeNpc) return;
    ui.dialogueSpeaker.textContent = `${activeNpc.name} · ${activeNpc.role}`;
    ui.dialogueText.textContent = activeNpc.dialogue;
    ui.dialogueChoices.replaceChildren(); ui.shopPanel.hidden = true;
    const tutorByService = { 'movement-tutor': 'tutor_meilin', 'sword-tutor': 'tutor_suye', blacksmith: 'tutor_bao' };
    const tutorId = tutorByService[activeNpc.service];
    if (tutorId) for (const offer of skillSystem.listByTutor(tutorId)) {
      const button = document.createElement('button'), missing = offer.status.missing.map(skillRequirementLabel);
      button.type = 'button'; button.disabled = !offer.status.ok;
      button.textContent = skillSystem.hasLearned(offer.skill.id) ? `${offer.skill.name} · learned` : `${offer.skill.name} · ${offer.status.ok ? offer.skill.costs.map(skillRequirementLabel).join(', ') : `requires ${missing.join(', ')}`}`;
      button.addEventListener('click', () => {
        const result = skillSystem.learn(offer.skill.id);
        if (result.ok) { addMessage(`Learned ${offer.skill.name}.`, 'good'); player.hp = Math.min(player.hp, effectiveMaxHp()); save(); updateUI(); }
        else addMessage('That teaching remains beyond your current reach.', 'bad');
        renderNpcDialogue();
      });
      ui.dialogueChoices.append(button);
    }
    if (activeNpc.service === 'healer-caretaker') {
      const heal = document.createElement('button'); heal.type = 'button'; heal.textContent = 'Ask about the Moonwater Well';
      heal.addEventListener('click', () => { addMessage('Yao gestures toward the well in your private corner. Its water restores body and qi.'); closeMenu(); }); ui.dialogueChoices.append(heal);
    }
    if (activeNpc.service === 'formation-scholar') {
      const state = endgameSystem.serialize(), progress = endgameSystem.progress(), nextTier = state.bestTier + 1;
      if (!progress.ascensionReady && player.realm < 5) {
        const trial = endgameApi.trialConfig(nextTier), challenge = document.createElement('button'); challenge.type = 'button';
        challenge.textContent = allBossesDefeated() && realms[player.realm].name === 'Nascent Soul'
          ? `Enter Heavenly Tribulation · tier ${nextTier} · ${trial.entryCosts.map(cost => `${cost.amount} ${cost.type === 'heavenlyMarks' ? 'marks' : 'stones'}`).join(' + ')}`
          : 'Ask about the sealed Heavenly Scar';
        challenge.addEventListener('click', () => {
          if (!allBossesDefeated()) { addMessage('Bo names five sovereign foes. Their deaths will unseal the scar above Starfall Crater.'); closeMenu(); return; }
          if (realms[player.realm].name !== 'Nascent Soul') { addMessage('Bo warns that only a Nascent Soul can enter the completed formation.'); closeMenu(); return; }
          startTribulation(nextTier);
        });
        ui.dialogueChoices.append(challenge);
      } else if (player.realm >= 5 || player.stage >= 9) {
        const ascend = document.createElement('button'); ascend.type = 'button';
        ascend.textContent = player.realm >= 5 ? 'Cross again into the Immortal Realm' : 'Ascend through the Grand Formation';
        ascend.addEventListener('click', ascendWithScholarBo); ui.dialogueChoices.append(ascend);
      } else {
        const recover = document.createElement('button'); recover.type = 'button'; recover.disabled = true;
        recover.textContent = `Ascension requires Nascent Soul IX · currently ${roman(player.stage)}`; ui.dialogueChoices.append(recover);
      }
      if (state.bestTier > 0 && player.realm === 4) {
        for (let tier = 1; tier <= state.bestTier; tier++) {
          const replay = document.createElement('button'); replay.type = 'button'; replay.textContent = `Replay cleared tribulation · tier ${tier}`;
          replay.addEventListener('click', () => startTribulation(tier)); ui.dialogueChoices.append(replay);
        }
      }
      if (storyFlags.has('ascended_soul_transformation')) {
        const legacy = document.createElement('button'); legacy.type = 'button'; legacy.textContent = 'Study Dao Constellations';
        legacy.addEventListener('click', openDaoPaths); ui.dialogueChoices.append(legacy);
      }
    }
    const leave = document.createElement('button'); leave.type = 'button'; leave.textContent = 'Leave'; leave.addEventListener('click', closeMenu); ui.dialogueChoices.append(leave);
  }

  function interactSanctuary() {
    const target = nearestSanctuaryInteraction();
    if (!target) { addMessage('Nothing here answers your touch.'); return; }
    if (target.kind === 'npc') { openSanctuaryNpc(target); return; }
    if (target.interaction === 'exit') { leaveSanctuary(); return; }
    if (target.interaction === 'storage') { selectedStorageSide = selectedStorageUid = null; openMenu('storage'); return; }
    if (target.interaction === 'heal') {
      player.hp = effectiveMaxHp(); player.qi = effectiveMaxQi(); burst(player.x, player.y, '#82e6d5', 22, 65); addMessage('Moonwater restores your body and fills your meridians.', 'good'); save(); return;
    }
    if (target.interaction === 'rest') { player.hp = effectiveMaxHp(); setWorldMinute(390); addMessage('You rest until dawn in your private corner.', 'good'); save(); return; }
    if (target.interaction === 'meditate') { player.qi = Math.min(effectiveMaxQi(), player.qi + 30); addMessage('The quiet seat settles 30 qi into your core.', 'good'); save(); return; }
    if (target.interaction === 'training') { addMessage('The practice dummy bears old scars. Tutors will expand its lessons later.'); return; }
    addMessage('This station is prepared for a future craft and storyline.');
  }

  function interactAscendedRealm() {
    const rift = riftNodes.filter(node => dist(player, node) < 76).sort((a, b) => dist(player, a) - dist(player, b))[0];
    if (rift) { startNearbyRift(); return; }
    if (dist(player, incursionBeacon) < 68) { startCelestialIncursion(); return; }
    if (dist(player, ascensionGate) < 64) {
      const transformation = immortalRealmApi.inspectTransformation(immortalRealmSystem);
      if (!transformation.transformed && transformation.ok) attemptSoulTransformation(); else leaveAscendedRealm();
      return;
    }
    addMessage('The rifts, War Bell, and return formation answer here.');
  }

  function interact() {
    if (currentScene === 'sanctuary') { interactSanctuary(); return; }
    if (currentScene === 'ascended') { interactAscendedRealm(); return; }
    const localGear = pickups.filter(p => p.type === 'gear' && dist(player, p) < 52).sort((a, b) => dist(player, a) - dist(player, b))[0];
    if (localGear) { collectGroundGear(localGear); return; }
    const shared = multiplayer?.status === 'online' ? multiplayer.drops.nearby(player.x, player.y, 52, Date.now()).find(drop => !claimingDropIds.has(drop.id)) : null;
    if (shared) { claimSharedDrop(shared); return; }
    const door = { x: (sanctuaryExterior.doorX + .5) * TILE, y: (sanctuaryExterior.doorY + .5) * TILE };
    if (dist(player, door) < 52) { enterSanctuary(); return; }
    if (allBossesDefeated() && dist(player, tribulationGate) < 62) { startTribulation(); return; }
    gather();
  }

  function spawnLocalGear(itemId, x = player.x, y = player.y) {
    if (!equipmentApi.getDefinition(itemId)) return false;
    pickups.push({ x, y, type: 'gear', itemId, life: 300, bob: hash(Math.floor(x), Math.floor(y), pickups.length + 73) * TAU });
    return true;
  }

  function collectGroundGear(drop) {
    const added = equipmentApi.addItem(equipment, drop.itemId);
    if (!added.ok) { addMessage('Your backpack is full. Free a slot first.', 'bad'); return false; }
    drop.life = 0; selectedItemUid = added.item.uid; addMessage(`Picked up ${equipmentApi.getDefinition(drop.itemId).name}.`, 'good');
    save(); updateUI(); return true;
  }

  function claimSharedDrop(drop) {
    if (!equipmentApi.firstOpenPosition(equipment, drop.itemId)) { addMessage('Your backpack is full. Free a slot first.', 'bad'); return; }
    const requestId = multiplayer.claimDrop(drop.id);
    if (!requestId) { addMessage('That item could not be claimed while offline.', 'bad'); return; }
    pendingDropClaims.set(requestId, drop.id); claimingDropIds.add(drop.id);
  }

  function finishSharedDrop(message) {
    const uid = pendingSharedDrops.get(message?.requestId);
    if (!uid) return;
    pendingSharedDrops.delete(message.requestId);
    const removed = equipmentApi.removeItem(equipment, uid, { allowEquipped: true });
    if (removed.ok) {
      selectedItemUid = null; player.hp = Math.min(player.hp, effectiveMaxHp());
      addMessage(`Dropped ${equipmentApi.getDefinition(removed.item.itemId).name} into the shared world.`, 'good'); save();
    }
    renderInventory(); updateUI();
  }

  function receiveSharedDrop(message) {
    const dropId = pendingDropClaims.get(message?.requestId), drop = message?.drop;
    if (dropId) { pendingDropClaims.delete(message.requestId); claimingDropIds.delete(dropId); }
    if (!drop || !equipmentApi.getDefinition(drop.itemId)) return;
    const added = equipmentApi.addItem(equipment, drop.itemId);
    if (!added.ok) {
      spawnLocalGear(drop.itemId, player.x, player.y);
      addMessage('Your backpack changed while claiming; the item was placed at your feet.', 'bad');
    } else {
      selectedItemUid = added.item.uid; addMessage(`Claimed ${equipmentApi.getDefinition(drop.itemId).name}.`, 'good');
    }
    save(); updateUI();
  }

  function rejectSharedDrop(message) {
    const uid = pendingSharedDrops.get(message?.requestId);
    if (uid) { pendingSharedDrops.delete(message.requestId); addMessage('The shared world rejected that drop. Your item was kept.', 'bad'); renderInventory(); }
    const dropId = pendingDropClaims.get(message?.requestId);
    if (dropId) { pendingDropClaims.delete(message.requestId); claimingDropIds.delete(dropId); if (message.reason !== 'not_found') addMessage('That item could not be claimed.', 'bad'); }
  }

  function dropSelectedItem() {
    const item = equipmentApi.itemByUid(equipment, selectedItemUid);
    if (!item || [...pendingSharedDrops.values()].includes(item.uid)) return;
    if (currentScene !== 'world') {
      addMessage('Equipment can only be dropped in the outside world. Use your spirit chest here.', 'bad');
      return;
    }
    const definition = equipmentApi.getDefinition(item.itemId);
    if (multiplayer?.status === 'online') {
      const requestId = multiplayer.createDrop(item.itemId);
      if (!requestId) { addMessage('The item could not be dropped while reconnecting.', 'bad'); return; }
      pendingSharedDrops.set(requestId, item.uid); renderInventory(); return;
    }
    const removed = equipmentApi.removeItem(equipment, item.uid, { allowEquipped: true });
    if (!removed.ok) return;
    let x = clamp(player.x + Math.cos(player.facing) * 28, player.r, WORLD_W * TILE - player.r);
    let y = clamp(player.y + Math.sin(player.facing) * 28, player.r, WORLD_H * TILE - player.r);
    if (!passableAt(x, y, 5)) { x = player.x; y = player.y; }
    spawnLocalGear(removed.item.itemId, x, y); selectedItemUid = null; player.hp = Math.min(player.hp, effectiveMaxHp());
    addMessage(`Dropped ${definition.name}.`, 'good'); save(); renderInventory(); updateUI();
  }

  function openMerchant() {
    dialogueSession = merchantDialogue.start('quartermaster', { player, equipment });
    openMenu('dialogue');
    renderDialogue();
  }

  function renderDialogue() {
    if (!dialogueSession) return;
    const view = merchantDialogue.view(dialogueSession, { player, equipment });
    if (view.ended) { closeMenu(); return; }
    ui.dialogueSpeaker.textContent = view.speaker;
    ui.dialogueText.textContent = view.text;
    ui.dialogueChoices.replaceChildren();
    for (const choice of view.choices) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = choice.text; button.disabled = choice.disabled;
      button.addEventListener('click', () => { merchantDialogue.choose(dialogueSession, choice.id, { player, equipment }); renderDialogue(); });
      ui.dialogueChoices.append(button);
    }
    ui.shopPanel.hidden = view.nodeId !== 'shop';
    if (!ui.shopPanel.hidden) renderShop();
  }

  function renderShop() {
    ui.shopBalance.textContent = `Spirit stones: ${player.stones}  ·  Backpack: ${equipmentApi.listBagItems(equipment).length} items`;
    ui.shopGrid.replaceChildren();
    for (const offer of merchantShop.list()) {
      const definition = equipmentApi.getDefinition(offer.itemId), button = document.createElement('button');
      button.type = 'button'; button.className = 'shop-item';
      button.innerHTML = `<strong>${definition.name} · ${offer.total} stones</strong><small>${definition.slot} · ${itemSummary(definition)}</small>`;
      button.addEventListener('click', () => {
        const result = merchantShop.buy(offer.itemId, 1);
        if (!result.ok) addMessage(result.code === 'insufficient_funds' ? 'You do not have enough spirit stones.' : result.code === 'inventory_full' ? 'Your backpack has no room for that item.' : 'The trade could not be completed.', 'bad');
        renderShop(); updateUI();
      });
      ui.shopGrid.append(button);
    }
  }

  function dash(dx, dy) {
    if (player.dashCd > 0 || player.meditating || player.parryTimer > 0 || player.parryRecovery > 0 || player.attackTimer > 0) return;
    const stats = derivedCombatStats(), qiCost = currentScene === 'ascended' ? Math.max(0, 4 - stats.dashQiCostReduction) : 0;
    if (player.qi < qiCost) { addMessage(`Cloud-Step needs ${qiCost} qi in the higher realm.`, 'bad'); return; }
    if (!dx && !dy) { dx = Math.cos(player.facing); dy = Math.sin(player.facing); }
    const n = Math.hypot(dx, dy) || 1; dx /= n; dy /= n;
    const fromX = player.x, fromY = player.y;
    // Only the landing must be clear: cloud-step can cross terrain but never end inside it.
    const maxX = (currentScene === 'sanctuary' ? sanctuary.width * SANCT_TILE : currentScene === 'ascended' ? ASCENDED_W * TILE : WORLD_W * TILE) - player.r;
    const maxY = (currentScene === 'sanctuary' ? sanctuary.height * SANCT_TILE : currentScene === 'ascended' ? ASCENDED_H * TILE : WORLD_H * TILE) - player.r;
    const dashDistance = DASH_DISTANCE * stats.dashDistanceMultiplier;
    for (let distance = dashDistance; distance >= 0; distance -= 7) {
      const nx = clamp(fromX + dx * distance, player.r, maxX);
      const ny = clamp(fromY + dy * distance, player.r, maxY);
      if (!playerPassableAt(nx, ny, player.r)) continue;
      player.x = nx; player.y = ny; break;
    }
    player.qi -= qiCost; player.dashCd = dashCooldownDuration(); player.invuln = .48;
    sendWorldPresence('dash', true);
    for (let i = 0; i < 10; i++) particles.push({ x: lerp(fromX, player.x, i / 9), y: lerp(fromY, player.y, i / 9), vx: 0, vy: 0, life: .25 + i * .015, max: .4, color: '#baf5dc', size: 5 });
  }

  function handleActions() {
    const parryPressed = actionPressed('parry');
    if (parryPressed) parry();
    else if (actionPressed('attack')) attack();
    else if (actionPressed('talisman')) useTalisman();
    else if (actionPressed('skill')) useLearnedArt();
    else if (actionPressed('interact')) interact();
    else if (actionPressed('cultivate')) cultivate();
    else if (actionPressed('inventory')) openMenu('inventory');
    else if (actionPressed('map')) {
      if (currentScene === 'sanctuary') addMessage('The sanctuary map is carved into the entry hall.');
      else mapOpen = !mapOpen;
    }
    taps.clear();
  }

  function enemyProfile(e) {
    const base = enemyTypes[e.type];
    return { damage: base.damage, windup: base.windup, range: base.range, recovery: base.recovery, kind: base.kind, parryable: true, ...(e.profile || {}) };
  }

  function startEnemyAttack(e, profile) {
    e.attackState = 'windup'; e.attackTimer = profile.windup; e.attackAngle = Math.atan2(player.y - e.y, player.x - e.x); e.attackLanded = false;
  }

  function enemyAttackHits(e, profile) {
    const distance = dist(player, e);
    if (profile.kind === 'slam' || profile.kind === 'pulse') return distance <= profile.range + player.r;
    if (distance > profile.range + player.r) return false;
    const angle = Math.atan2(player.y - e.y, player.x - e.x);
    const delta = Math.abs(Math.atan2(Math.sin(angle - e.attackAngle), Math.cos(angle - e.attackAngle)));
    return delta < (profile.kind === 'thrust' ? .38 : .75);
  }

  function resolveEnemyAttack(e, profile) {
    if (e.attackLanded || !enemyAttackHits(e, profile)) return false;
    e.attackLanded = true;
    if (player.invuln > 0 || dev.invulnerable) return;
    const parryAngle = Math.atan2(e.y - player.y, e.x - player.x);
    const facingDelta = Math.abs(Math.atan2(Math.sin(parryAngle - player.facing), Math.cos(parryAngle - player.facing)));
    if (profile.parryable && player.parryTimer > 0 && facingDelta < 1.25) {
      const stats = derivedCombatStats();
      e.attackState = 'recovery'; e.attackTimer = profile.recovery; e.stagger = e.boss ? .42 : .85; e.riposteWindow = .9;
      player.parryTimer = 0; player.invuln = .12; shake = 5;
      player.qi = Math.min(effectiveMaxQi(), player.qi + stats.parryQiRefund);
      burst(e.x, e.y, '#fff0a6', 16, 100); addMessage(`Parried ${e.title || enemyTypes[e.type].name}. Riposte now!`, 'good');
      return false;
    }
    const damage = Math.max(1, Math.round(profile.damage * (1 - derivedCombatStats().defense)));
    player.hp -= damage; player.invuln = .55; shake = e.boss ? 12 : 7;
    burst(player.x, player.y, '#e96961', 12, 95); addMessage(`${e.title || enemyTypes[e.type].name} strikes for ${damage}.`, 'bad');
    if (player.hp <= 0) { handlePlayerDeath(); return true; }
    return false;
  }

  function loseCultivationStage() {
    if (player.realm === 0 && player.stage === 1) return false;
    if (player.stage > 1) player.stage--;
    else { player.realm--; player.stage = realms[player.realm].stages; }
    player.maxHp = Math.max(100, player.maxHp - 18);
    player.attack = Math.max(16, player.attack - 5);
    player.maxQi = qiCapacity();
    return true;
  }

  function resetLivingEnemiesAfterDeath() {
    for (const e of enemies) if (e.alive) Object.assign(e, {
      hp: e.maxHp, hit: 0, vx: 0, vy: 0, attackState: 'idle', attackTimer: 0,
      attackLanded: false, stagger: 0, riposteWindow: 0, attackCd: .9
    });
  }

  function handlePlayerDeath() {
    failTribulation('The Heavenly Scar rejects your wounded soul. The trial is lost.');
    const diedAscended = currentScene === 'ascended';
    const oldQi = player.qi, lostStage = loseCultivationStage();
    player.qi = Math.min(effectiveMaxQi(), Math.floor(oldQi * .75));
    resetLivingEnemiesAfterDeath();
    if (diedAscended) {
      activeRiftId = null; ascendedEnemies = enemies.filter(enemy => !enemy.riftEvent && !enemy.incursionEvent); enemies = worldEnemies || []; worldEnemies = null;
      currentScene = 'sanctuary'; player.x = sanctuary.spawn.x * SANCT_TILE; player.y = sanctuary.spawn.y * SANCT_TILE;
    } else { currentScene = 'world'; player.x = 47.5 * TILE; player.y = 39 * TILE; }
    syncMultiplayerForScene();
    player.hp = effectiveMaxHp();
    Object.assign(player, {
      attackCd: 0, attackTimer: 0, dashCd: 0, invuln: 2, talismanCd: 0, skillCd: 0,
      parryTimer: 0, parryCd: 0, parryRecovery: 0, meditating: false
    });
    resetLivingEnemiesAfterDeath();
    addMessage(lostStage ? `Defeat scatters your foundation. You fall to ${realms[player.realm].name}, stage ${player.stage}.` : 'Your cultivation cannot fall below Mortal, stage 1.', 'bad');
    addMessage(diedAscended ? 'Scholar Bo catches your falling soul in the sanctuary. Living foes recover.' : 'Your spirit returns to the Crossroads Shrine. Living foes recover.', 'bad');
    save();
  }

  function updateEnemyCombat(e, profile, dt) {
    if (e.stagger > 0) { e.stagger = Math.max(0, e.stagger - dt); return true; }
    e.riposteWindow = Math.max(0, (e.riposteWindow || 0) - dt);
    if (e.attackState === 'windup') {
      e.attackTimer -= dt;
      if (e.attackTimer <= 0) { e.attackState = 'active'; e.attackTimer = .14; e.attackLanded = false; burst(e.x, e.y, profile.parryable ? '#f6dc8c' : '#ef655f', 8, 55); }
      return true;
    }
    if (e.attackState === 'active') {
      if (['lunge','thrust','arc'].includes(profile.kind)) moveEntity(e, Math.cos(e.attackAngle) * 145 * dt, Math.sin(e.attackAngle) * 145 * dt, enemyTypes[e.type].r);
      if (resolveEnemyAttack(e, profile)) return true;
      e.attackTimer -= dt;
      if (e.attackTimer <= 0) { e.attackState = 'recovery'; e.attackTimer = profile.recovery; }
      return true;
    }
    if (e.attackState === 'recovery') {
      e.attackTimer -= dt;
      if (e.attackTimer <= 0) { e.attackState = 'idle'; e.attackCd = .15; }
      return true;
    }
    return false;
  }

  function updateSanctuaryScene(dt) {
    let dx = (actionHeld('moveRight') ? 1 : 0) - (actionHeld('moveLeft') ? 1 : 0);
    let dy = (actionHeld('moveDown') ? 1 : 0) - (actionHeld('moveUp') ? 1 : 0);
    const parryPressed = actionPressed('parry'), dashPressed = !parryPressed && actionPressed('dash');
    if (dx || dy) {
      const n = Math.hypot(dx, dy); dx /= n; dy /= n; player.facing = Math.atan2(dy, dx);
      if (!dashPressed) moveEntity(player, dx * player.speed * derivedCombatStats().moveSpeedMultiplier * dt, dy * player.speed * derivedCombatStats().moveSpeedMultiplier * dt, player.r);
    }
    if (dashPressed) dash(dx, dy);
    handleActions();
    for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .94; p.vy *= .94; p.life -= dt; }
    particles = particles.filter(p => p.life > 0); slashes.forEach(s => s.life -= dt); slashes = slashes.filter(s => s.life > 0);
    messages.forEach(m => m.life -= dt); const before = messages.length; messages = messages.filter(m => m.life > 0); if (before !== messages.length) renderMessages();
    shake *= .86; flash = Math.max(0, flash - dt * 1.2);
    if (Math.floor(playTime) % 12 === 0 && Math.floor(playTime - dt) % 12 !== 0) save();
    updateUI();
  }

  function updateAscendedFeatures(dt) {
    const area = currentAscendedArea(), discovery = immortalRealmApi.discoverRegion(immortalRealmSystem, area.id);
    if (!discovery.alreadyDiscovered) { addMessage(`Discovered: ${area.name} · ${immortalRealmApi.REGIONS[area.id].description}`, 'good'); save(); }
    for (const current of skyCurrents) {
      current.cooldown = Math.max(0, current.cooldown - dt);
      if (current.cooldown <= 0 && dist(player, current) < 34) {
        current.cooldown = 7; player.dashCd = 0; player.qi = Math.min(effectiveMaxQi(), player.qi + 18); player.invuln = Math.max(player.invuln, .25);
        burst(current.x, current.y, '#a9f4ff', 20, 115); addMessage('An aether current refreshes Cloud-Step and restores 18 qi.', 'good');
      }
    }
    const hazard = activeRiftId ? immortalRealmApi.RIFTS[activeRiftId].hazard : immortalRealmApi.REGIONS[area.id].hazard;
    if (realmHazard.warning > 0) {
      realmHazard.warning -= dt;
      if (realmHazard.warning <= 0) {
        if (Math.hypot(player.x - realmHazard.x, player.y - realmHazard.y) < 68 && player.invuln <= 0 && !dev.invulnerable) {
          player.hp -= hazard.damage; shake = 9; burst(player.x, player.y, '#eeb4ff', 18, 120); addMessage(`${hazard.name} strikes for ${hazard.damage}. Dash clear of the violet omen.`, 'bad');
          if (player.hp <= 0) { handlePlayerDeath(); return; }
        }
        realmHazard.timer = hazard.interval || 2.6;
      }
    } else {
      realmHazard.timer -= dt;
      if (realmHazard.timer <= 0) {
        const angle = hash(Math.floor(playTime * 10), player.kills, 733) * TAU, radius = 18 + hash(player.kills, Math.floor(playTime), 739) * 52;
        realmHazard.x = player.x + Math.cos(angle) * radius; realmHazard.y = player.y + Math.sin(angle) * radius;
        if (!ascendedPassableAt(realmHazard.x, realmHazard.y, 5)) { realmHazard.x = player.x; realmHazard.y = player.y; }
        realmHazard.warning = .9; addMessage(`${hazard.name} gathers nearby!`, 'bad');
      }
    }
  }

  function update(dt) {
    if (!started) return;
    if (multiplayer?.arena.active) { submitArenaInput(); return; }
    if (paused) return;
    playTime += dt;
    player.attackCd = Math.max(0, player.attackCd - dt); player.attackTimer = Math.max(0, player.attackTimer - dt);
    player.dashCd = Math.max(0, player.dashCd - dt); player.invuln = Math.max(0, player.invuln - dt); player.talismanCd = Math.max(0, player.talismanCd - dt); player.skillCd = Math.max(0, player.skillCd - dt);
    player.parryTimer = Math.max(0, player.parryTimer - dt); player.parryCd = Math.max(0, player.parryCd - dt); player.parryRecovery = Math.max(0, player.parryRecovery - dt);
    if (dev.noCooldowns) player.attackCd = player.dashCd = player.talismanCd = player.skillCd = player.parryCd = 0;
    if (currentScene === 'ascended') player.qi = Math.min(effectiveMaxQi(), player.qi + derivedCombatStats().qiRegenPerSecond * dt);
    player.meditating = false;
    if (currentScene === 'sanctuary') { updateSanctuaryScene(dt); return; }

    let dx = (actionHeld('moveRight') ? 1 : 0) - (actionHeld('moveLeft') ? 1 : 0);
    let dy = (actionHeld('moveDown') ? 1 : 0) - (actionHeld('moveUp') ? 1 : 0);
    const parryPressed = actionPressed('parry');
    const dashPressed = !parryPressed && actionPressed('dash');
    if (dx || dy) {
      const n = Math.hypot(dx, dy); dx /= n; dy /= n; player.facing = Math.atan2(dy, dx);
      if (!dashPressed) moveEntity(player, dx * player.speed * derivedCombatStats().moveSpeedMultiplier * dt, dy * player.speed * derivedCombatStats().moveSpeedMultiplier * dt, player.r);
    }
    if (dashPressed) dash(dx, dy);
    handleActions();

    for (const e of enemies) {
      const t = enemyTypes[e.type];
      if (!e.alive) {
        if (e.tribulation || e.riftEvent || e.incursionEvent || (e.higherRealm && e.boss)) continue;
        if (e.boss && bossStates[e.bossId]) continue;
        e.respawn -= dt;
        if (e.respawn <= 0) {
          const area = ascendedAreas.find(entry => entry.id === e.regionId), p = e.higherRealm ? randomAscendedOpen((player.kills + Math.floor(playTime)) * 7 + enemies.indexOf(e), area || ascendedAreas[0]) : randomOpen((player.kills + Math.floor(playTime)) * 7 + enemies.indexOf(e));
          Object.assign(e, p, { hp: e.maxHp || t.hp, alive: true, attackState: 'idle', attackTimer: 0, attackLanded: false, stagger: 0, riposteWindow: 0 });
        }
        continue;
      }
      e.hit = Math.max(0, e.hit - dt); e.attackCd -= dt;
      const profile = enemyProfile(e);
      if (updateEnemyCombat(e, profile, dt)) continue;
      const d = dist(player, e);
      let a;
      if (d < 190) a = Math.atan2(player.y - e.y, player.x - e.x);
      else { e.wander += (hash(Math.floor(playTime / 2), enemies.indexOf(e), 3) - .5) * .12; a = e.wander; }
      const speed = t.speed * (e.speedMultiplier || 1) * (d < 190 ? 1 : .28);
      moveEntity(e, Math.cos(a) * speed * dt, Math.sin(a) * speed * dt, t.r);
      if (dist(player, e) < profile.range + player.r && e.attackCd <= 0) startEnemyAttack(e, profile);
    }

    if (currentScene === 'ascended') updateAscendedFeatures(dt);
    else {
      for (const p of plants) if (!p.ready) { p.respawn -= dt; if (p.respawn <= 0) p.ready = true; }
      for (const node of resourceNodes) if (!node.ready) { node.respawn -= dt; if (node.respawn <= 0) node.ready = true; }
      for (const p of pickups) { p.life -= dt; if (p.type === 'stone' && dist(player, p) < 21) { p.life = 0; player.stones++; player.qi = Math.min(effectiveMaxQi(), player.qi + 4); addMessage('Absorbed a spirit stone.', 'good'); } }
      pickups = pickups.filter(p => p.life > 0);
    }
    if (endgameSystem?.active() && dist(player, tribulationGate) > 720) failTribulation('You leave the Heavenly Scar. The unfinished trial collapses.');
    for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .94; p.vy *= .94; p.life -= dt; }
    particles = particles.filter(p => p.life > 0); slashes.forEach(s => s.life -= dt); slashes = slashes.filter(s => s.life > 0);
    messages.forEach(m => m.life -= dt); const ml = messages.length; messages = messages.filter(m => m.life > 0); if (ml !== messages.length) renderMessages();
    shake *= .86; flash = Math.max(0, flash - dt * 1.2);

    if (currentScene === 'world') {
      const zn = zoneName(); let discoveredSomething = false;
      if (!player.discoveries.has(zn)) { player.discoveries.add(zn); addMessage(`Discovered: ${zn}`, 'good'); discoveredSomething = true; }
      const area = areas.find(a => Math.hypot(player.x / TILE - a.x, player.y / TILE - a.y) < a.r + 1);
      if (area && !player.discoveredAreas.has(area.id)) { player.discoveredAreas.add(area.id); discoveredSomething = true; }
      for (const landmark of landmarks) if (Math.hypot(player.x / TILE - landmark.x, player.y / TILE - landmark.y) < 6 && !player.discoveredLandmarks.has(landmark.id)) { player.discoveredLandmarks.add(landmark.id); discoveredSomething = true; }
      if (discoveredSomething) save();
    }
    if (reconcileQuestProgress()) save();
    if (Math.floor(playTime) % 12 === 0 && Math.floor((playTime - dt)) % 12 !== 0) save();
    if (multiplayer) {
      if (sendWorldPresence()) updateMultiplayerStatus();
    }
    updateUI();
  }

  function updateUI() {
    const maxHp = effectiveMaxHp();
    ui.hpFill.style.width = `${100 * player.hp / maxHp}%`; ui.hpText.textContent = `${Math.ceil(player.hp)} / ${maxHp}`;
    const maxQi = effectiveMaxQi();
    ui.qiFill.style.width = `${100 * player.qi / maxQi}%`; ui.qiText.textContent = `${Math.floor(player.qi)} / ${maxQi} qi`;
    ui.xpFill.style.width = `${100 * player.xp / player.xpNeed}%`;
    ui.realm.textContent = `${realms[player.realm].name} \u00b7 ${roman(player.stage)}`;
    const openedCaches = openedCacheCount();
    ui.stones.textContent = player.stones; ui.herbs.textContent = player.herbs; ui.kills.textContent = player.kills; ui.caches.textContent = `${openedCaches} / ${treasures.length}`; ui.zone.textContent = zoneName();
    const totalMins = (playTime * .42 + 330) % 1440, hour = Math.floor(totalMins / 60), day = 1 + Math.floor((playTime * .42 + 330) / 1440);
    const period = hour < 7 ? 'Dawn' : hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : hour < 20 ? 'Dusk' : 'Night';
    ui.time.textContent = `${period} \u00b7 Day ${day}`;
    if (currentScene === 'sanctuary') {
      ui.quest.hidden = true; ui.compass.hidden = true;
      const target = nearestSanctuaryInteraction();
      const label = target?.kind === 'npc' ? `Speak with ${target.name}`
        : target?.interaction === 'exit' ? 'Leave the sanctuary'
        : target?.interaction === 'storage' ? `Open ${target.label || 'personal chest'}`
        : target?.interaction === 'heal' ? `Drink from ${target.label || 'healing well'}`
        : target?.interaction === 'rest' ? 'Rest until dawn'
        : target?.interaction === 'meditate' ? 'Meditate in your corner'
        : target ? 'Inspect station' : '';
      const prompt = label ? `${bindingLabel('interact')} \u00b7 ${label}` : '';
      ui.interactPrompt.textContent = prompt; ui.interactPrompt.classList.toggle('show', !!prompt); return;
    }
    if (currentScene === 'ascended') {
      const bounty = immortalRealmApi.inspectBounty(immortalRealmSystem), objectives = immortalRealmApi.listObjectives(immortalRealmSystem), incursion = celestialEventsApi.inspect(celestialEventSystem);
      ui.quest.hidden = false; ui.compass.hidden = true;
      ui.questText.innerHTML = [
        `<strong>Celestial Decree ${bounty.cycle}</strong>: defeat ${bounty.required} ${bounty.target.name}${bounty.required === 1 ? '' : 's'} (${bounty.progress}/${bounty.required}).`,
        ...(incursion.active ? [`<strong>Incursion ${incursion.cycle}</strong>: ${incursion.definition.name} (${incursion.progress}/${incursion.required}${incursion.eliteUnlocked && !incursion.eliteDefeated ? ' · elite manifested' : ''}).`] : []),
        ...objectives.filter(objective => !objective.complete).slice(0, 2).map(objective => `${objective.label} (${objective.current}/${objective.required})`)
      ].join('<br>');
      const rift = riftNodes.filter(node => dist(player, node) < 76).sort((a, b) => dist(player, a) - dist(player, b))[0];
      const nearGate = dist(player, ascensionGate) < 64, nearBell = dist(player, incursionBeacon) < 68, transformation = immortalRealmApi.inspectTransformation(immortalRealmSystem);
      let prompt = rift ? `${bindingLabel('interact')} · ${immortalRealmApi.inspectRift(immortalRealmSystem, rift.id).stabilized ? 'Draw qi from' : 'Challenge'} ${rift.name}` : '';
      if (!prompt && nearBell) prompt = `${bindingLabel('interact')} · ${incursion.active ? `${incursion.definition.name} underway` : 'Sound the Celestial War Bell'}`;
      if (!prompt && nearGate) prompt = `${bindingLabel('interact')} · ${!transformation.transformed && transformation.ok ? 'Complete Soul Transformation' : 'Return to the sanctuary'}`;
      ui.interactPrompt.textContent = prompt; ui.interactPrompt.classList.toggle('show', !!prompt); return;
    }
    const veins = landmarks.filter(l => l.type === 'vein');
    const nearest = veins.reduce((best, v) => Math.hypot(player.x / TILE - v.x, player.y / TILE - v.y) < Math.hypot(player.x / TILE - best.x, player.y / TILE - best.y) ? v : best, veins[0]);
    const veinAngle = Math.atan2(nearest.y * TILE - player.y, nearest.x * TILE - player.x);
    const veinDistance = Math.round(Math.hypot(nearest.x * TILE - player.x, nearest.y * TILE - player.y) / TILE);
    ui.compassArrow.style.transform = `rotate(${veinAngle + Math.PI / 2}rad)`;
    const nearVein = Math.hypot(player.x / TILE - (nearest.x + .5), player.y / TILE - (nearest.y + .5)) < 2.25;
    ui.compassText.textContent = nearVein ? `Inside a spirit vein \u2014 press ${bindingLabel('cultivate')} to cultivate` : `Nearest spirit vein \u00b7 ${veinDistance} steps`;
    const tutorialDone = tutorial.attacked && tutorial.cultivated;
    ui.quest.hidden = tutorialDone; ui.compass.hidden = tutorialDone;
    if (!tutorialDone) {
      const lessons = [];
      if (!tutorial.attacked) lessons.push(`Press <em>${bindingLabel('attack')}</em> to strike. Time <em>${bindingLabel('parry')}</em> against a gold flash to parry.`);
      if (!tutorial.cultivated) lessons.push(`Follow the spirit compass to a green vein and press <em>${bindingLabel('cultivate')}</em> to cultivate.`);
      ui.questText.innerHTML = lessons.join('<br>');
    }
    const nearLocalGear = pickups.find(p => p.type === 'gear' && dist(player, p) < 52);
    const nearSharedGear = multiplayer?.status === 'online' && multiplayer.drops.nearby(player.x, player.y, 52, Date.now()).find(drop => !claimingDropIds.has(drop.id));
    const nearTribulationGate = allBossesDefeated() && dist(player, tribulationGate) < 62;
    const sanctuaryDoor = { x: (sanctuaryExterior.doorX + .5) * TILE, y: (sanctuaryExterior.doorY + .5) * TILE };
    const nearSanctuaryDoor = dist(player, sanctuaryDoor) < 52;
    const nearbyChest = treasures.find(t => !t.opened && dist(player, t) < 58);
    const nearbyNode = resourceNodes.find(n => n.ready && dist(player, n) < 42);
    const nearbyHerb = plants.find(p => p.ready && dist(player, p) < 42);
    let prompt = '';
    if (nearLocalGear || nearSharedGear) prompt = `${bindingLabel('interact')} \u00b7 Pick up ${equipmentApi.getDefinition((nearLocalGear || nearSharedGear).itemId)?.name || 'equipment'}`;
    else if (nearSanctuaryDoor) prompt = `${bindingLabel('interact')} \u00b7 Enter ${sanctuary.name}`;
    else if (nearTribulationGate) {
      const active = endgameSystem.active(), progress = endgameSystem.progress(), tier = active?.tier || Math.min(endgameApi.MAX_TIER, endgameSystem.serialize().bestTier + 1);
      prompt = active ? `Heavenly Tribulation \u00b7 tier ${tier} \u00b7 phase ${tribulationPhase + 1}` : progress.ascensionReady ? `${bindingLabel('interact')} \u00b7 Replay Heavenly Tribulation tier ${tier}` : `${bindingLabel('interact')} \u00b7 Begin Heavenly Tribulation tier ${tier}`;
    }
    else if (nearbyChest) prompt = `${bindingLabel('interact')} \u00b7 Open ancient cache`;
    else if (nearbyNode) prompt = `${bindingLabel('interact')} \u00b7 Gather ${itemDefs[nearbyNode.item].name}`;
    else if (nearbyHerb) prompt = `${bindingLabel('interact')} \u00b7 Gather glowing moonleaf`;
    else if (nearVein) prompt = `${bindingLabel('cultivate')} \u00b7 Cultivate in the spirit vein`;
    ui.interactPrompt.textContent = prompt;
    ui.interactPrompt.classList.toggle('show', !!prompt);
  }

  function roman(n) { return ['I','II','III','IV','V','VI','VII','VIII','IX'][n - 1] || String(n); }

  function screenPos(x, y, cam) { return { x: Math.round(x - cam.x), y: Math.round(y - cam.y) }; }
  function drawTile(type, sx, sy, tx, ty, time) {
    const pal = colors[type] || colors.grass;
    ctx.fillStyle = pal[(tx + ty) & 1]; ctx.fillRect(sx, sy, TILE + 1, TILE + 1);
    const n = hash(tx, ty);
    if (type === 'grass') {
      ctx.fillStyle = n > .5 ? '#496347' : '#405c40';
      ctx.fillRect(sx + 4 + (n * 11 | 0), sy + 6, 2, 5); ctx.fillRect(sx + 12, sy + 17, 3, 2);
    } else if (type === 'forest') {
      ctx.fillStyle = '#172c25'; ctx.fillRect(sx + 5, sy + 14, 15, 7);
      ctx.fillStyle = '#365f3e'; ctx.fillRect(sx + 4, sy + 5, 16, 11); ctx.fillStyle = '#4c7548'; ctx.fillRect(sx + 8, sy + 3, 9, 8);
      ctx.fillStyle = '#1b2a24'; ctx.fillRect(sx + 11, sy + 15, 3, 8);
    } else if (type === 'water') {
      ctx.fillStyle = '#347082'; ctx.fillRect(sx + ((time * 18 + tx * 7) % 16 | 0), sy + 7, 7, 2); ctx.fillRect(sx + ((time * 11 + ty * 5) % 15 | 0), sy + 17, 6, 1);
    } else if (type === 'stone') {
      ctx.fillStyle = '#4c555d'; ctx.fillRect(sx + 2, sy + 2, 20, 4); ctx.fillStyle = '#292e36'; ctx.fillRect(sx + 3, sy + 17, 18, 5);
      ctx.fillStyle = '#232832'; ctx.fillRect(sx + 13, sy + 7, 2, 8);
    } else if (type === 'path') {
      ctx.fillStyle = '#827451'; if (n > .5) ctx.fillRect(sx + 5, sy + 7, 4, 3); else ctx.fillRect(sx + 15, sy + 15, 3, 2);
    } else if (type === 'vein') {
      const pulse = .55 + Math.sin(time * 3 + tx) * .25; ctx.fillStyle = '#3d8070'; ctx.fillRect(sx + 3, sy + 3, 18, 18);
      ctx.globalAlpha = pulse; ctx.fillStyle = '#86f4ca'; ctx.fillRect(sx + 10, sy + 4, 4, 15); ctx.fillRect(sx + 6, sy + 10, 12, 4); ctx.globalAlpha = 1;
    } else if (type === 'shrine') {
      ctx.fillStyle = '#2b2022'; ctx.fillRect(sx + 3, sy + 5, 18, 17); ctx.fillStyle = '#a64e45'; ctx.fillRect(sx + 1, sy + 3, 22, 5);
      ctx.fillStyle = '#e0c071'; ctx.fillRect(sx + 10, sy + 10, 4, 7);
    }
  }

  function drawPlant(p, cam, time) {
    if (!p.ready) return; const s = screenPos(p.x, p.y, cam), bob = Math.sin(time * 2 + p.phase);
    ctx.globalAlpha = .22 + Math.sin(time * 3 + p.phase) * .06; ctx.fillStyle = '#a9ff8b'; ctx.fillRect(s.x - 10, s.y - 11 + bob, 20, 20); ctx.globalAlpha = 1;
    ctx.fillStyle = '#173326'; ctx.fillRect(s.x - 5, s.y + 3, 11, 4);
    ctx.fillStyle = '#80d66c'; ctx.fillRect(s.x - 2, s.y - 9 + bob, 4, 13); ctx.fillRect(s.x - 8, s.y - 6 + bob, 8, 4); ctx.fillRect(s.x + 1, s.y - 2 + bob, 8, 4);
    ctx.fillStyle = '#efffb4'; ctx.fillRect(s.x - 1, s.y - 11 + bob, 4, 4);
  }

  function drawResourceNode(node, cam, time) {
    if (!node.ready) return;
    const s = screenPos(node.x, node.y, cam), bob = Math.sin(time * 2.5 + node.phase) * 2, color = itemDefs[node.item].color;
    ctx.globalAlpha = .16 + Math.sin(time * 3 + node.phase) * .04; ctx.fillStyle = color; ctx.fillRect(s.x - 11, s.y - 12 + bob, 22, 22); ctx.globalAlpha = 1;
    ctx.fillStyle = '#15201e'; ctx.fillRect(s.x - 6, s.y + 5, 12, 4);
    ctx.fillStyle = color; ctx.fillRect(s.x - 5, s.y - 7 + bob, 10, 12); ctx.fillStyle = '#f4f5dc'; ctx.fillRect(s.x - 2, s.y - 5 + bob, 4, 4);
  }

  function drawMerchant(cam, time) {
    const s = screenPos(merchant.x, merchant.y, cam), bob = Math.sin(time * 2.4) > .8 ? 1 : 0;
    ctx.fillStyle = '#0007'; ctx.fillRect(s.x - 11, s.y + 9, 22, 5);
    ctx.fillStyle = '#263b45'; ctx.fillRect(s.x - 8, s.y - 6 + bob, 16, 18);
    ctx.fillStyle = '#cfb38d'; ctx.fillRect(s.x - 5, s.y - 13 + bob, 10, 8);
    ctx.fillStyle = '#49344f'; ctx.fillRect(s.x - 9, s.y - 3 + bob, 18, 7);
    ctx.fillStyle = '#e4c069'; ctx.fillRect(s.x - 1, s.y - 3 + bob, 3, 9);
    ctx.fillStyle = '#a77944'; ctx.fillRect(s.x + 10, s.y - 3, 8, 15); ctx.fillStyle = '#f0d27b'; ctx.fillRect(s.x + 12, s.y, 4, 4);
    if (dist(player, merchant) < 120) { ctx.fillStyle = '#fff0bd'; ctx.font = '12px Georgia'; ctx.textAlign = 'center'; ctx.fillText(merchant.name, s.x, s.y - 22); }
  }

  function drawSanctuaryExterior(cam, time) {
    const x = sanctuaryExterior.x * TILE - cam.x, y = sanctuaryExterior.y * TILE - cam.y;
    const w = sanctuaryExterior.width * TILE, h = sanctuaryExterior.height * TILE;
    ctx.fillStyle = '#21191b'; ctx.fillRect(x - 10, y + 30, w + 20, h - 18);
    ctx.fillStyle = '#70443e'; ctx.fillRect(x, y + 44, w, h - 44);
    ctx.fillStyle = '#8c5548'; for (let yy = y + 52; yy < y + h; yy += 24) ctx.fillRect(x + 8, yy, w - 16, 3);
    ctx.fillStyle = '#25222a'; ctx.beginPath(); ctx.moveTo(x - 26, y + 52); ctx.lineTo(x + w / 2, y - 18); ctx.lineTo(x + w + 26, y + 52); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#51404a'; for (let i = 0; i < 8; i++) ctx.fillRect(x - 14 + i * 43, y + 39 - Math.abs(i - 3.5) * 8, 46, 7);
    for (const wx of [x + 52, x + w - 70]) {
      ctx.fillStyle = '#172a2d'; ctx.fillRect(wx, y + 90, 22, 28); ctx.fillStyle = '#e3ba68'; ctx.fillRect(wx + 4, y + 94, 6, 20); ctx.fillRect(wx + 13, y + 94, 5, 20);
    }
    const doorX = (sanctuaryExterior.doorX - sanctuaryExterior.x) * TILE + x;
    ctx.fillStyle = '#241c1b'; ctx.fillRect(doorX, y + h - 47, TILE, 47); ctx.fillStyle = '#d4b66f'; ctx.fillRect(doorX + 5, y + h - 39, 3, 3);
    for (const tx of [doorX - 13, doorX + TILE + 10]) {
      const flicker = Math.sin(time * 13 + tx) * 2; ctx.fillStyle = '#6b3d2b'; ctx.fillRect(tx, y + h - 37, 4, 21);
      ctx.fillStyle = '#ff9a45'; ctx.fillRect(tx - 3, y + h - 45 + flicker, 10, 11); ctx.fillStyle = '#ffe17d'; ctx.fillRect(tx, y + h - 43 + flicker, 4, 7);
    }
    ctx.fillStyle = '#090b0ddd'; ctx.fillRect(x + w / 2 - 92, y + 54, 184, 24); ctx.strokeStyle = '#d6bd73'; ctx.strokeRect(x + w / 2 - 92.5, y + 53.5, 185, 25);
    ctx.fillStyle = '#f2dda0'; ctx.font = 'bold 13px Georgia'; ctx.textAlign = 'center'; ctx.fillText('VERDANT STAR SANCTUARY', x + w / 2, y + 70);
  }

  function drawTribulationGate(cam, time) {
    if (!allBossesDefeated()) return;
    const s = screenPos(tribulationGate.x, tribulationGate.y, cam), active = endgameSystem?.active();
    if (s.x < -80 || s.y < -80 || s.x > W + 80 || s.y > H + 80) return;
    const pulse = .5 + Math.sin(time * 3.5) * .18;
    ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(time * .18);
    ctx.globalAlpha = .16 + pulse * .12; ctx.fillStyle = '#b77cff'; ctx.beginPath(); ctx.arc(0, 0, 48 + pulse * 8, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1; ctx.strokeStyle = active ? '#f0c5ff' : '#ad83e6'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, 31, 0, TAU); ctx.stroke();
    for (let i = 0; i < 8; i++) { ctx.rotate(TAU / 8); ctx.fillStyle = i % 2 ? '#84c9ff' : '#d8aaff'; ctx.fillRect(25, -3, 13, 6); }
    ctx.restore();
    ctx.fillStyle = '#e8d1ff'; ctx.font = 'bold 12px Georgia'; ctx.textAlign = 'center'; ctx.fillText(active ? `TRIBULATION · TIER ${active.tier}` : 'HEAVENLY SCAR', s.x, s.y - 48);
  }

  function drawSanctuaryDecoration(item, cam, time) {
    const x = item.x * SANCT_TILE - cam.x, y = item.y * SANCT_TILE - cam.y, w = (item.width || 1) * SANCT_TILE, h = (item.height || 1) * SANCT_TILE;
    if (item.type === 'rug') { ctx.fillStyle = item.id === 'personal-rug' ? '#334c53' : '#643c47'; ctx.fillRect(x + 3, y + 3, w - 6, h - 6); ctx.strokeStyle = '#d1a95e'; ctx.strokeRect(x + 7, y + 7, w - 14, h - 14); }
    else if (item.type === 'torch') { const f = Math.sin(time * 15 + item.x) * 2; ctx.globalAlpha = .12; ctx.fillStyle = '#ffb253'; ctx.fillRect(x - 22, y - 22, 76, 76); ctx.globalAlpha = 1; ctx.fillStyle = '#6a4730'; ctx.fillRect(x + 14, y + 12, 4, 16); ctx.fillStyle = '#ff8844'; ctx.fillRect(x + 10, y + 3 + f, 12, 13); ctx.fillStyle = '#ffe386'; ctx.fillRect(x + 14, y + 6 + f, 5, 8); }
    else if (item.type === 'fireplace') { ctx.fillStyle = '#3c3230'; ctx.fillRect(x, y, w, h); ctx.fillStyle = '#181617'; ctx.fillRect(x + 18, y + 18, w - 36, h - 18); ctx.fillStyle = '#ff793d'; ctx.fillRect(x + 28, y + 30, w - 56, h - 30); ctx.fillStyle = '#ffd16b'; ctx.fillRect(x + 43, y + 23 + Math.sin(time * 12) * 3, w - 86, h - 23); }
    else if (item.type === 'table') { ctx.fillStyle = '#503724'; ctx.fillRect(x, y + 6, w, h - 12); ctx.fillStyle = '#896044'; ctx.fillRect(x + 5, y, w - 10, 12); ctx.fillStyle = '#d6c080'; ctx.fillRect(x + 34, y + 14, 24, 15); ctx.fillStyle = '#7696a0'; ctx.fillRect(x + w - 54, y + 12, 18, 18); }
    else if (item.type === 'bookshelf') { ctx.fillStyle = '#493322'; ctx.fillRect(x, y, w, h); for (let xx = x + 7; xx < x + w - 5; xx += 12) { ctx.fillStyle = ['#7f4c42','#4c6a6b','#887342'][(xx / 12 | 0) % 3]; ctx.fillRect(xx, y + 5, 8, h - 10); } }
    else if (item.type === 'weapon-rack') { ctx.fillStyle = '#6a4930'; ctx.fillRect(x + 8, y, 5, h); ctx.fillRect(x + 23, y, 5, h); for (let yy = y + 13; yy < y + h; yy += 28) { ctx.fillStyle = '#bec8c5'; ctx.fillRect(x + 3, yy, 27, 3); } }
    else if (item.type === 'training-dummy') { ctx.fillStyle = '#85613d'; ctx.fillRect(x + 13, y + 4, 7, 27); ctx.fillRect(x + 4, y + 11, 25, 6); ctx.fillStyle = '#b65648'; ctx.fillRect(x + 7, y + 17, 19, 4); }
    else if (item.type === 'bed') { ctx.fillStyle = '#49362c'; ctx.fillRect(x, y, w, h); ctx.fillStyle = '#cfb69a'; ctx.fillRect(x + 6, y + 7, w - 12, 25); ctx.fillStyle = '#5d7182'; ctx.fillRect(x + 6, y + 34, w - 12, h - 41); }
    else if (item.type === 'well') { ctx.fillStyle = '#55605f'; ctx.fillRect(x, y + 7, w, h - 7); ctx.fillStyle = '#182c33'; ctx.fillRect(x + 8, y + 12, w - 16, h - 20); ctx.fillStyle = '#6fe0d3'; ctx.fillRect(x + 13, y + 18, w - 26, h - 30); }
    else if (item.type === 'chest') { ctx.fillStyle = '#322319'; ctx.fillRect(x, y + 9, w, h - 9); ctx.fillStyle = '#9a6a32'; ctx.fillRect(x + 3, y + 3, w - 6, 15); ctx.fillStyle = '#f0cf73'; ctx.fillRect(x + w / 2 - 4, y + 12, 8, 12); }
    else if (item.variant === 'meditation') { ctx.fillStyle = '#876247'; ctx.beginPath(); ctx.arc(x + 16, y + 20, 13, 0, TAU); ctx.fill(); ctx.fillStyle = '#d5b568'; ctx.fillRect(x + 8, y + 18, 16, 3); }
    else if (item.variant === 'forge') { ctx.fillStyle = '#33383e'; ctx.fillRect(x + 6, y + 20, w - 12, h - 25); ctx.fillStyle = '#aeb6b5'; ctx.fillRect(x, y + 12, w, 16); ctx.fillStyle = '#e47a3d'; ctx.fillRect(x + 43, y + 2, 15, 15); }
    else { ctx.fillStyle = '#53645c'; ctx.fillRect(x + 4, y + 4, w - 8, h - 8); ctx.fillStyle = '#c59f59'; ctx.fillRect(x + 10, y + 10, Math.max(5, w - 20), 5); }
  }

  function drawSanctuaryNpc(npc, cam, time) {
    const x = npc.x * SANCT_TILE - cam.x + SANCT_TILE / 2, y = npc.y * SANCT_TILE - cam.y + SANCT_TILE / 2, bob = Math.sin(time * 2 + npc.x) > .82 ? 1 : 0;
    const skinColors = { warm: '#d2ad83', umber: '#8e6047', golden: '#d7b06e', light: '#e0c09f', olive: '#aa9468', deep: '#714b3d', bronze: '#ad7452', weathered: '#b28c6d', willow: '#c79a72', copper: '#a96f4e', rose: '#d5a08f', sunlit: '#deb477' };
    ctx.fillStyle = '#0007'; ctx.fillRect(x - 10, y + 10, 20, 5); ctx.fillStyle = npc.palette.robe; ctx.fillRect(x - 8, y - 5 + bob, 16, 18);
    ctx.fillStyle = skinColors[npc.skin] || '#caa47d'; ctx.fillRect(x - 5, y - 13 + bob, 10, 9); ctx.fillStyle = npc.palette.hair; ctx.fillRect(x - 7, y - 16 + bob, 14, 5);
    ctx.fillStyle = npc.palette.trim; ctx.fillRect(x - 1, y - 4 + bob, 3, 12);
    if (Math.hypot(player.x - npc.x * SANCT_TILE, player.y - npc.y * SANCT_TILE) < 125) { ctx.fillStyle = '#0a0c0edc'; ctx.fillRect(x - 70, y - 39, 140, 19); ctx.fillStyle = '#f5dfaa'; ctx.font = '12px Georgia'; ctx.textAlign = 'center'; ctx.fillText(npc.name, x, y - 25); }
  }

  function drawLandmarks(cam, time) {
    ctx.lineWidth = 1;
    for (const l of landmarks) {
      if (l.type !== 'vein') continue;
      const s = screenPos((l.x + .5) * TILE, (l.y + .5) * TILE, cam);
      const glow = .15 + Math.sin(time * 3 + l.x) * .05;
      const g = ctx.createLinearGradient(0, s.y - 150, 0, s.y + 14);
      g.addColorStop(0, 'rgba(105,255,196,0)'); g.addColorStop(1, `rgba(105,255,196,${glow})`);
      ctx.fillStyle = g; ctx.fillRect(s.x - 18, s.y - 150, 36, 164);
      ctx.strokeStyle = '#83f0c1aa'; ctx.lineWidth = 1; ctx.strokeRect(s.x - 12, s.y - 12, 24, 24);
    }
    for (const a of areas) {
      const s = screenPos(a.x * TILE, a.y * TILE, cam);
      if (s.x < -100 || s.y < -100 || s.x > W + 100 || s.y > H + 100) continue;
      if (a.icon === 'monastery' || a.icon === 'ruins') {
        ctx.fillStyle = a.icon === 'ruins' ? '#544a46' : '#704843';
        ctx.fillRect(s.x - 30, s.y - 20, 60, 36); ctx.fillStyle = '#302a2b'; ctx.fillRect(s.x - 36, s.y - 25, 72, 7);
        ctx.fillStyle = '#d2aa63'; ctx.fillRect(s.x - 4, s.y - 6, 8, 22);
        if (a.icon === 'ruins') { ctx.fillStyle = '#242328'; ctx.fillRect(s.x + 12, s.y - 20, 9, 12); ctx.fillStyle = '#827263'; ctx.fillRect(s.x - 24, s.y - 32, 5, 12); }
      } else if (a.icon === 'swords') {
        ctx.strokeStyle = '#c4c9c5'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(s.x - 12,s.y - 24);ctx.lineTo(s.x + 10,s.y + 20);ctx.moveTo(s.x + 12,s.y - 24);ctx.lineTo(s.x - 10,s.y + 20);ctx.stroke();
      } else if (a.icon === 'lotus') {
        ctx.fillStyle = '#eaa9c2'; ctx.fillRect(s.x - 8, s.y - 5, 16, 10); ctx.fillStyle = '#f5d3df'; ctx.fillRect(s.x - 3, s.y - 9, 6, 15);
      } else if (a.icon === 'ravine') {
        ctx.fillStyle = '#77d6df'; for (let i = 0; i < 4; i++) ctx.fillRect(s.x - 25 + i * 15, s.y - 12 - (i % 2) * 10, 7, 26 + (i % 2) * 10);
      } else if (a.icon === 'roots') {
        ctx.strokeStyle = '#8ea85f'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(s.x, s.y + 12, 28, Math.PI, TAU); ctx.stroke(); ctx.fillStyle = '#4c3926'; ctx.fillRect(s.x - 7, s.y - 22, 14, 38);
      } else if (a.icon === 'kiln') {
        ctx.fillStyle = '#5d3c32'; ctx.fillRect(s.x - 24, s.y - 22, 48, 40); ctx.fillStyle = '#f18447'; ctx.fillRect(s.x - 9, s.y - 4, 18, 18); ctx.fillStyle = '#2c2325'; ctx.fillRect(s.x - 30, s.y - 27, 60, 7);
      } else if (a.icon === 'crater') {
        ctx.strokeStyle = '#9b89d4'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(s.x, s.y + 4, 30, 0, TAU); ctx.stroke(); ctx.fillStyle = '#e6ddff'; ctx.fillRect(s.x - 4, s.y - 22, 8, 34); ctx.fillRect(s.x - 13, s.y - 8, 26, 7);
      } else {
        ctx.fillStyle = '#6ca75a'; for (let i=0;i<5;i++) ctx.fillRect(s.x - 28 + i * 13, s.y - 32 - (i%2)*8, 4, 52);
      }
      const nearby = Math.hypot(player.x / TILE - a.x, player.y / TILE - a.y) < a.r + 5;
      if (nearby || player.discoveredAreas.has(a.id)) {
        const labelY = s.y - 52;
        ctx.fillStyle = '#080b10e8'; ctx.fillRect(s.x - 92, labelY - 15, 184, 22);
        ctx.strokeStyle = '#c9b77488'; ctx.lineWidth = 1; ctx.strokeRect(s.x - 92.5, labelY - 15.5, 185, 23);
        ctx.fillStyle = '#f3dc9b'; ctx.font = 'bold 13px Georgia'; ctx.textAlign = 'center'; ctx.fillText(a.name, s.x, labelY);
      }
    }
    for (const t of treasures) {
      if (t.opened) continue; const s = screenPos(t.x,t.y,cam);
      ctx.globalAlpha = .2 + Math.sin(time * 4 + t.x) * .06; ctx.fillStyle = '#ffd66d'; ctx.fillRect(s.x - 16,s.y - 14,32,27); ctx.globalAlpha = 1;
      ctx.fillStyle = '#1b1610'; ctx.fillRect(s.x - 13,s.y - 6,26,16); ctx.fillStyle = '#bd8738'; ctx.fillRect(s.x - 12,s.y - 11,24,8); ctx.fillStyle = '#ffe18a'; ctx.fillRect(s.x - 3,s.y - 5,6,8);
    }
  }

  function drawEnemyTelegraph(e, profile, s) {
    if (e.attackState !== 'windup') return;
    const progress = clamp(1 - e.attackTimer / profile.windup, 0, 1), color = profile.parryable ? '#f4d879' : '#ef625d';
    ctx.globalAlpha = .24 + progress * .48; ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2 + progress * 2;
    if (profile.kind === 'slam' || profile.kind === 'pulse') {
      ctx.beginPath(); ctx.arc(s.x, s.y, profile.range * (.45 + progress * .55), 0, TAU); ctx.stroke();
    } else {
      const width = profile.kind === 'thrust' ? 7 : 16;
      const ex = s.x + Math.cos(e.attackAngle) * profile.range, ey = s.y + Math.sin(e.attackAngle) * profile.range;
      ctx.beginPath(); ctx.moveTo(s.x + Math.cos(e.attackAngle + Math.PI / 2) * width, s.y + Math.sin(e.attackAngle + Math.PI / 2) * width);
      ctx.lineTo(ex, ey); ctx.lineTo(s.x + Math.cos(e.attackAngle - Math.PI / 2) * width, s.y + Math.sin(e.attackAngle - Math.PI / 2) * width); ctx.closePath(); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawEnemy(e, cam, time) {
    if (!e.alive) return;
    const t = enemyTypes[e.type], profile = enemyProfile(e), base = screenPos(e.x, e.y, cam);
    if (base.x < -90 || base.y < -90 || base.x > W + 90 || base.y > H + 90) return;
    drawEnemyTelegraph(e, profile, base);
    const attackLean = e.attackState === 'active' ? 7 : e.attackState === 'windup' ? -3 : 0;
    const staggerJitter = e.stagger > 0 ? Math.sin(time * 45) * 3 : 0;
    const s = { x: base.x + Math.cos(e.attackAngle || 0) * attackLean + staggerJitter, y: base.y + Math.sin(e.attackAngle || 0) * attackLean };
    ctx.fillStyle = '#0006'; ctx.fillRect(s.x - t.r, s.y + t.r - 3, t.r * 2, 5);
    ctx.fillStyle = e.hit ? '#fff2bf' : t.color;
    if (e.type === 'wisp' || e.type === 'mirror_wraith') {
      const bob = Math.sin(time * 5 + e.x) * 3; ctx.fillRect(s.x - 6, s.y - 7 + bob, 12, 12); ctx.fillStyle = '#b6ffe9'; ctx.fillRect(s.x - 3, s.y - 4 + bob, 6, 6);
      if (e.type === 'mirror_wraith') { ctx.strokeStyle = '#e5c1ff'; ctx.beginPath(); ctx.moveTo(s.x - 12, s.y + 9 + bob); ctx.lineTo(s.x, s.y - 16 + bob); ctx.lineTo(s.x + 12, s.y + 9 + bob); ctx.stroke(); }
    } else if (['guardian', 'astral_sentinel', 'ashbound_guardian'].includes(e.type)) {
      ctx.fillRect(s.x - 11, s.y - 12, 22, 24); ctx.fillStyle = '#55483d'; ctx.fillRect(s.x - 8, s.y - 4, 5, 4); ctx.fillRect(s.x + 3, s.y - 4, 5, 4);
      if (e.higherRealm) { ctx.fillStyle = '#d8d0ff'; ctx.fillRect(s.x - 2, s.y - 17, 4, 8); ctx.fillRect(s.x - 6, s.y - 14, 12, 3); }
    } else {
      ctx.fillRect(s.x - t.r, s.y - t.r + 3, t.r * 2, t.r * 2 - 3); ctx.fillRect(s.x - 5, s.y - t.r - 4, 4, 7); ctx.fillRect(s.x + 3, s.y - t.r - 4, 4, 7);
      ctx.fillStyle = '#f1c35d'; ctx.fillRect(s.x - 4, s.y - 3, 2, 2); ctx.fillRect(s.x + 3, s.y - 3, 2, 2);
    }
    if (e.attackState === 'active') {
      ctx.strokeStyle = profile.parryable ? '#ffe59b' : '#f15f59'; ctx.lineWidth = 3; ctx.beginPath();
      if (profile.kind === 'slam' || profile.kind === 'pulse') ctx.arc(s.x, s.y, profile.range, 0, TAU);
      else ctx.arc(s.x, s.y, Math.min(profile.range, 34), e.attackAngle - .8, e.attackAngle + .8);
      ctx.stroke();
    }
    if (e.hp < e.maxHp) { ctx.fillStyle = '#1a1719'; ctx.fillRect(s.x - 14, s.y - t.r - 10, 28, 3); ctx.fillStyle = '#d55c55'; ctx.fillRect(s.x - 14, s.y - t.r - 10, 28 * e.hp / e.maxHp, 3); }
    if ((e.boss || e.elite) && (dist(player, e) < 260 || e.hp < e.maxHp)) { ctx.fillStyle = e.tribulation ? '#dabaff' : '#f0c96f'; ctx.font = '12px Georgia'; ctx.textAlign = 'center'; ctx.fillText(e.title, s.x, s.y - t.r - 17); }
  }

  function drawEquippedWeapon(s, style) {
    const attacking = player.attackTimer > 0;
    const swing = attacking && style !== 'spear' ? -0.72 + (1 - clamp(player.attackTimer / .28, 0, 1)) * 1.45 : 0;
    const thrust = attacking && style === 'spear' ? 6 : 0;
    ctx.save(); ctx.translate(Math.round(s.x), Math.round(s.y)); ctx.rotate(player.facing + swing);
    if (style === 'unarmed') {
      ctx.fillStyle = '#e7bf69'; ctx.fillRect(7, -5, 5, 4); ctx.fillRect(7, 2, 5, 4);
    } else if (style === 'spear') {
      ctx.fillStyle = '#815b38'; ctx.fillRect(4 + thrust, -1, 25, 3);
      ctx.fillStyle = '#e2e8e4'; ctx.beginPath(); ctx.moveTo(29 + thrust, -4); ctx.lineTo(38 + thrust, 0); ctx.lineTo(29 + thrust, 4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#b8c9c1'; ctx.fillRect(28 + thrust, -2, 5, 4);
    } else if (style === 'dual_swords') {
      for (const side of [-1, 1]) {
        ctx.fillStyle = '#7b5435'; ctx.fillRect(4, side * 5 - 1, 7, 3);
        ctx.fillStyle = '#e3e9e6'; ctx.fillRect(10, side * 5 - 2, 15, 4);
        ctx.fillStyle = '#a8b8b2'; ctx.fillRect(23, side * 5 - 1, 4, 2);
      }
    } else if (style === 'greatsword') {
      ctx.fillStyle = '#765139'; ctx.fillRect(3, -2, 9, 5); ctx.fillStyle = '#d9b961'; ctx.fillRect(10, -6, 3, 12);
      ctx.fillStyle = '#aeb9bd'; ctx.beginPath(); ctx.moveTo(12, -5); ctx.lineTo(30, -5); ctx.lineTo(37, 0); ctx.lineTo(30, 5); ctx.lineTo(12, 5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#dce3e3'; ctx.fillRect(15, -3, 16, 2);
    } else {
      ctx.fillStyle = '#765139'; ctx.fillRect(4, -2, 8, 4); ctx.fillStyle = '#d9b961'; ctx.fillRect(10, -5, 3, 10);
      ctx.fillStyle = '#dce4e1'; ctx.beginPath(); ctx.moveTo(12, -3); ctx.lineTo(29, -3); ctx.lineTo(34, 0); ctx.lineTo(29, 3); ctx.lineTo(12, 3); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#a9bbb5'; ctx.fillRect(15, 1, 14, 2);
    }
    ctx.restore();
  }

  function drawPlayer(cam) {
    const s = screenPos(player.x, player.y, cam), blink = player.invuln > 0 && Math.floor(playTime * 18) % 2;
    if (blink) ctx.globalAlpha = .45;
    ctx.fillStyle = '#0007'; ctx.fillRect(s.x - 9, s.y + 8, 18, 5);
    ctx.fillStyle = '#28313d'; ctx.fillRect(s.x - 7, s.y - 6, 14, 16);
    ctx.fillStyle = '#d9c6a4'; ctx.fillRect(s.x - 5, s.y - 12, 10, 8);
    ctx.fillStyle = '#151d27'; ctx.fillRect(s.x - 7, s.y - 14, 14, 4); ctx.fillRect(s.x - 4, s.y - 17, 8, 4);
    ctx.fillStyle = '#bd574e'; ctx.fillRect(s.x - 8, s.y, 16, 6); ctx.fillStyle = '#e7bf69'; ctx.fillRect(s.x - 1, s.y, 2, 7);
    const fx = Math.cos(player.facing), fy = Math.sin(player.facing);
    drawEquippedWeapon(s, derivedCombatStats().weaponStyle);
    if (player.parryTimer > 0) {
      ctx.strokeStyle = '#fff0a6'; ctx.lineWidth = 4; ctx.beginPath();
      ctx.arc(s.x + fx * 7, s.y + fy * 7, 20, player.facing - 1.05, player.facing + 1.05); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawMinimap(cam) {
    const mw = mapOpen ? 520 : 176, mh = mapOpen ? 390 : 132;
    const x0 = mapOpen ? (W - mw) / 2 : W - mw - 14, y0 = mapOpen ? (H - mh) / 2 : H - mh - 15;
    // Keep the large map heading below the fixed HUD/compass overlays.
    const mapY = mapOpen ? y0 + 56 : y0;
    const mapH = mapOpen ? mh - 56 : mh;
    ctx.lineWidth = 1; ctx.fillStyle = mapOpen ? '#05080cf2' : '#080c12e6'; ctx.fillRect(x0 - 7, mapOpen ? y0 - 7 : y0 - 25, mw + 14, mapOpen ? mh + 14 : mh + 32);
    ctx.strokeStyle = '#d6c17c99'; ctx.lineWidth = 1; ctx.strokeRect(x0 - 7.5, mapOpen ? y0 - 7.5 : y0 - 25.5, mw + 15, mapOpen ? mh + 15 : mh + 33);
    ctx.fillStyle = '#ead696'; ctx.font = 'bold 12px Georgia'; ctx.textAlign = mapOpen ? 'center' : 'left'; ctx.fillText(mapOpen ? 'KNOWN WORLD  \u00b7  M / Map to close' : 'WORLD  \u00b7  M / Map', mapOpen ? x0 + mw / 2 : x0, mapOpen ? y0 + 43 : y0 - 9);
    const step = mapOpen ? 2 : 3;
    for (let y = 0; y < WORLD_H; y += step) for (let x = 0; x < WORLD_W; x += step) {
      const type = map[y][x]; ctx.fillStyle = colors[type]?.[0] || '#334';
      ctx.fillRect(x0 + x / WORLD_W * mw, mapY + y / WORLD_H * mapH, Math.ceil(step / WORLD_W * mw), Math.ceil(step / WORLD_H * mapH));
    }
    for (const l of landmarks) {
      if (!player.discoveredLandmarks.has(l.id)) continue;
      const lx = x0 + l.x / WORLD_W * mw, ly = mapY + l.y / WORLD_H * mapH;
      ctx.fillStyle = l.type === 'vein' ? '#73f0bd' : '#e8c76d';
      if (l.type === 'vein') { ctx.fillRect(lx - 1, ly - 4, 3, 9); ctx.fillRect(lx - 4, ly - 1, 9, 3); }
      else { ctx.beginPath(); ctx.moveTo(lx, ly - 5); ctx.lineTo(lx + 5, ly); ctx.lineTo(lx, ly + 5); ctx.lineTo(lx - 5, ly); ctx.closePath(); ctx.fill(); }
    }
    for (const a of areas) {
      const known = player.discoveredAreas.has(a.id), ax = x0 + a.x / WORLD_W * mw, ay = mapY + a.y / WORLD_H * mapH;
      ctx.strokeStyle = known ? '#f4d47f' : '#939aa4'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(ax, ay, 5, 0, TAU); ctx.stroke();
      if (mapOpen && known) { ctx.fillStyle = '#fff0bc'; ctx.font = '11px Georgia'; ctx.textAlign = 'left'; ctx.fillText(a.name, ax + 7, ay + 4); }
    }
    if (allBossesDefeated()) {
      const gx = x0 + tribulationGate.x / (WORLD_W * TILE) * mw, gy = mapY + tribulationGate.y / (WORLD_H * TILE) * mapH;
      ctx.fillStyle = '#d6a6ff'; ctx.beginPath(); ctx.moveTo(gx, gy - 6); ctx.lineTo(gx + 5, gy); ctx.lineTo(gx, gy + 6); ctx.lineTo(gx - 5, gy); ctx.closePath(); ctx.fill();
      if (mapOpen) { ctx.fillStyle = '#ead7ff'; ctx.font = '11px Georgia'; ctx.textAlign = 'right'; ctx.fillText('Heavenly Scar', gx - 8, gy + 4); }
    }
    ctx.fillStyle = '#fff3b0'; ctx.beginPath(); ctx.arc(x0 + player.x / (WORLD_W * TILE) * mw, mapY + player.y / (WORLD_H * TILE) * mapH, 3.5, 0, TAU); ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = '#ffffff55'; ctx.strokeRect(x0 + cam.x / (WORLD_W * TILE) * mw, mapY + cam.y / (WORLD_H * TILE) * mapH, W / (WORLD_W * TILE) * mw, H / (WORLD_H * TILE) * mapH);
  }

  function drawSanctuaryScene(time) {
    const worldWidth = sanctuary.width * SANCT_TILE, worldHeight = sanctuary.height * SANCT_TILE;
    const targetX = clamp(player.x - W / 2, 0, worldWidth - W), targetY = clamp(player.y - H / 2, 0, worldHeight - H);
    const cam = { x: Math.round(targetX + (Math.random() - .5) * shake), y: Math.round(targetY + (Math.random() - .5) * shake) };
    ctx.fillStyle = '#171416'; ctx.fillRect(0, 0, W, H);
    const x0 = Math.floor(cam.x / SANCT_TILE), y0 = Math.floor(cam.y / SANCT_TILE), x1 = Math.ceil((cam.x + W) / SANCT_TILE), y1 = Math.ceil((cam.y + H) / SANCT_TILE);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (x < 0 || y < 0 || x >= sanctuary.width || y >= sanctuary.height) continue;
      const zone = sanctuary.zones.find(area => x >= area.x && y >= area.y && x < area.x + area.width && y < area.y + area.height);
      const base = zone?.id === 'forge-wing' ? ['#453a34','#4b4038'] : zone?.id === 'archive-wing' ? ['#313942','#353e47'] : zone?.personal ? ['#293b3b','#2e4240'] : ['#3d3435','#44393a'];
      ctx.fillStyle = base[(x + y) & 1]; ctx.fillRect(x * SANCT_TILE - cam.x, y * SANCT_TILE - cam.y, SANCT_TILE + 1, SANCT_TILE + 1);
      ctx.fillStyle = '#ffffff08'; ctx.fillRect(x * SANCT_TILE - cam.x + 3, y * SANCT_TILE - cam.y + 3, SANCT_TILE - 6, 2);
    }
    sanctuary.decorations.filter(item => item.type === 'rug').forEach(item => drawSanctuaryDecoration(item, cam, time));
    for (const wall of sanctuary.blockers) { ctx.fillStyle = '#1e2025'; ctx.fillRect(wall.x * SANCT_TILE - cam.x, wall.y * SANCT_TILE - cam.y, wall.width * SANCT_TILE, wall.height * SANCT_TILE); ctx.fillStyle = '#5a4641'; ctx.fillRect(wall.x * SANCT_TILE - cam.x, wall.y * SANCT_TILE - cam.y, wall.width * SANCT_TILE, 7); }
    for (const door of sanctuary.doors) { ctx.fillStyle = '#76553a'; ctx.fillRect(door.x * SANCT_TILE - cam.x, door.y * SANCT_TILE - cam.y, door.width * SANCT_TILE, door.height * SANCT_TILE); }
    sanctuary.decorations.filter(item => item.type !== 'rug').forEach(item => drawSanctuaryDecoration(item, cam, time));
    sanctuary.npcs.slice().sort((a, b) => a.y - b.y).forEach(npc => drawSanctuaryNpc(npc, cam, time));
    drawPlayer(cam);
    slashes.forEach(slash => { const p = screenPos(slash.x, slash.y, cam); ctx.strokeStyle = '#ffe6a7'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(p.x, p.y, 31, slash.a - slash.arc, slash.a + slash.arc); ctx.stroke(); });
    particles.forEach(p => { const s = screenPos(p.x, p.y, cam); ctx.globalAlpha = clamp(p.life / p.max, 0, 1); ctx.fillStyle = p.color; ctx.fillRect(s.x, s.y, p.size, p.size); }); ctx.globalAlpha = 1;
    const vg = ctx.createRadialGradient(W / 2, H / 2, H * .2, W / 2, H / 2, H * .9); vg.addColorStop(0, 'rgba(255,190,100,.04)'); vg.addColorStop(1, 'rgba(0,0,0,.38)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#0a0c0dcc'; ctx.fillRect(W / 2 - 116, 12, 232, 25); ctx.strokeStyle = '#d1b86f88'; ctx.strokeRect(W / 2 - 116.5, 11.5, 233, 26);
    ctx.fillStyle = '#efd99c'; ctx.font = 'bold 13px Georgia'; ctx.textAlign = 'center'; ctx.fillText(zoneName().toUpperCase(), W / 2, 29);
    if (flash > 0) { ctx.fillStyle = `rgba(240,220,144,${flash * .38})`; ctx.fillRect(0, 0, W, H); }
  }

  function drawAscendedMinimap(cam) {
    const mw = mapOpen ? 520 : 176, mh = mapOpen ? 390 : 132, x0 = mapOpen ? (W - mw) / 2 : W - mw - 14, y0 = mapOpen ? (H - mh) / 2 : H - mh - 15;
    ctx.fillStyle = mapOpen ? '#08061af2' : '#090819e8'; ctx.fillRect(x0 - 7, mapOpen ? y0 - 32 : y0 - 25, mw + 14, mh + (mapOpen ? 39 : 32));
    ctx.strokeStyle = '#b9a3f2aa'; ctx.strokeRect(x0 - 7.5, mapOpen ? y0 - 32.5 : y0 - 25.5, mw + 15, mh + (mapOpen ? 40 : 33));
    ctx.fillStyle = '#e8d9ff'; ctx.font = 'bold 12px Georgia'; ctx.textAlign = mapOpen ? 'center' : 'left'; ctx.fillText(mapOpen ? 'IMMORTAL REALM · M / Map to close' : 'IMMORTAL REALM · M', mapOpen ? x0 + mw / 2 : x0, y0 - 9);
    for (const area of ascendedAreas) {
      ctx.fillStyle = area.color; ctx.beginPath(); ctx.ellipse(x0 + area.x / ASCENDED_W * mw, y0 + area.y / ASCENDED_H * mh, area.rx / ASCENDED_W * mw, area.ry / ASCENDED_H * mh, 0, 0, TAU); ctx.fill();
      if (mapOpen && immortalRealmSystem.discovered.includes(area.id)) { ctx.fillStyle = '#fff0c8'; ctx.font = '12px Georgia'; ctx.textAlign = 'center'; ctx.fillText(area.name, x0 + area.x / ASCENDED_W * mw, y0 + area.y / ASCENDED_H * mh); }
    }
    for (const node of riftNodes) {
      const report = immortalRealmApi.inspectRift(immortalRealmSystem, node.id), x = x0 + node.x / (ASCENDED_W * TILE) * mw, y = y0 + node.y / (ASCENDED_H * TILE) * mh;
      ctx.strokeStyle = report.stabilized ? '#8ff5dc' : '#e49cff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 5, 0, TAU); ctx.stroke();
    }
    const bellX = x0 + incursionBeacon.x / (ASCENDED_W * TILE) * mw, bellY = y0 + incursionBeacon.y / (ASCENDED_H * TILE) * mh;
    ctx.fillStyle = '#f1cf72'; ctx.beginPath(); ctx.moveTo(bellX, bellY - 5); ctx.lineTo(bellX + 5, bellY); ctx.lineTo(bellX, bellY + 5); ctx.lineTo(bellX - 5, bellY); ctx.closePath(); ctx.fill();
    const incursion = celestialEventsApi.inspect(celestialEventSystem);
    if (incursion.active) {
      const area = ascendedAreas.find(entry => entry.id === incursion.definition.regionId);
      ctx.strokeStyle = '#ff9277'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(x0 + area.x / ASCENDED_W * mw, y0 + area.y / ASCENDED_H * mh, area.rx / ASCENDED_W * mw + 5, area.ry / ASCENDED_H * mh + 5, 0, 0, TAU); ctx.stroke();
    }
    ctx.fillStyle = '#fff2a8'; ctx.beginPath(); ctx.arc(x0 + player.x / (ASCENDED_W * TILE) * mw, y0 + player.y / (ASCENDED_H * TILE) * mh, 3.5, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#ffffff55'; ctx.lineWidth = 1; ctx.strokeRect(x0 + cam.x / (ASCENDED_W * TILE) * mw, y0 + cam.y / (ASCENDED_H * TILE) * mh, W / (ASCENDED_W * TILE) * mw, H / (ASCENDED_H * TILE) * mh);
  }

  function drawAscendedScene(time) {
    const worldWidth = ASCENDED_W * TILE, worldHeight = ASCENDED_H * TILE;
    const cam = { x: Math.round(clamp(player.x - W / 2, 0, worldWidth - W) + (Math.random() - .5) * shake), y: Math.round(clamp(player.y - H / 2, 0, worldHeight - H) + (Math.random() - .5) * shake) };
    const sky = ctx.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#110d2d'); sky.addColorStop(1, '#1c1638'); ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 90; i++) { const x = (hash(i, 2, 809) * worldWidth - cam.x * .18) % W, y = (hash(i, 7, 811) * worldHeight - cam.y * .18) % H; ctx.fillStyle = i % 7 ? '#b7c8ff88' : '#fff0bdcc'; ctx.fillRect((x + W) % W, (y + H) % H, i % 7 ? 1 : 2, i % 7 ? 1 : 2); }
    const x0 = Math.floor(cam.x / TILE), y0 = Math.floor(cam.y / TILE), x1 = Math.ceil((cam.x + W) / TILE), y1 = Math.ceil((cam.y + H) / TILE);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (x < 0 || y < 0 || x >= ASCENDED_W || y >= ASCENDED_H || ascendedMap[y][x] === 'aether') continue;
      const type = ascendedMap[y][x], sx = x * TILE - cam.x, sy = y * TILE - cam.y;
      const palette = type === 'skybridge' ? ['#807497', '#897ca0'] : type === 'starstone' ? ['#524969', '#594f72'] : type === 'cloudgrass' ? ['#456f70', '#4b7777'] : ['#66728b', '#6d7993'];
      ctx.fillStyle = palette[(x + y) & 1]; ctx.fillRect(sx, sy, TILE + 1, TILE + 1);
      ctx.fillStyle = '#d8e6ff16'; ctx.fillRect(sx + 3, sy + 3, TILE - 6, 2);
      if (type === 'starstone' && hash(x, y, 823) > .55) { ctx.fillStyle = '#d6b7ff'; ctx.fillRect(sx + 10, sy + 4, 3, 12); ctx.fillStyle = '#83e2ee'; ctx.fillRect(sx + 7, sy + 9, 9, 3); }
    }
    for (const node of riftNodes) {
      const s = screenPos(node.x, node.y, cam), report = immortalRealmApi.inspectRift(immortalRealmSystem, node.id), pulse = 20 + Math.sin(time * 4 + node.x) * 4;
      ctx.strokeStyle = report.stabilized ? '#83f1d0' : '#d98af2'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(s.x, s.y, pulse, 0, TAU); ctx.stroke();
      ctx.fillStyle = report.stabilized ? '#b8ffe9' : '#f1bcff'; ctx.fillRect(s.x - 4, s.y - 15, 8, 30); ctx.fillRect(s.x - 15, s.y - 4, 30, 8);
    }
    { const s = screenPos(incursionBeacon.x, incursionBeacon.y, cam), pulse = 22 + Math.sin(time * 3) * 3;
      ctx.strokeStyle = '#eac96f'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(s.x, s.y, pulse, 0, TAU); ctx.stroke();
      ctx.fillStyle = '#6e5330'; ctx.fillRect(s.x - 11, s.y - 13, 22, 25); ctx.fillStyle = '#f4dc8c'; ctx.fillRect(s.x - 7, s.y - 9, 14, 15); ctx.fillRect(s.x - 2, s.y + 6, 4, 9);
    }
    for (const current of skyCurrents) { const s = screenPos(current.x, current.y, cam); ctx.strokeStyle = '#a7f2ffbb'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(s.x, s.y, 15 + Math.sin(time * 5) * 4, time, time + 4.8); ctx.stroke(); }
    { const s = screenPos(ascensionGate.x, ascensionGate.y, cam); ctx.strokeStyle = '#f6dfa0'; ctx.lineWidth = 4; ctx.strokeRect(s.x - 20, s.y - 28, 40, 56); ctx.fillStyle = '#fff1b9'; ctx.fillRect(s.x - 3, s.y - 20, 6, 40); }
    enemies.slice().sort((a, b) => a.y - b.y).forEach(enemy => drawEnemy(enemy, cam, time)); drawPlayer(cam);
    slashes.forEach(slash => { const p = screenPos(slash.x, slash.y, cam), alpha = slash.life / .18; ctx.strokeStyle = `rgba(255,230,167,${alpha})`; ctx.lineWidth = slash.style === 'greatsword' ? 7 : 4; ctx.beginPath(); if (slash.style === 'spear') { ctx.moveTo(p.x + Math.cos(slash.a) * 12, p.y + Math.sin(slash.a) * 12); ctx.lineTo(p.x + Math.cos(slash.a) * slash.reach, p.y + Math.sin(slash.a) * slash.reach); } else ctx.arc(p.x, p.y, 34, slash.a - slash.arc, slash.a + slash.arc); ctx.stroke(); });
    particles.forEach(p => { const s = screenPos(p.x, p.y, cam); ctx.globalAlpha = clamp(p.life / p.max, 0, 1); ctx.fillStyle = p.color; ctx.fillRect(s.x, s.y, p.size, p.size); }); ctx.globalAlpha = 1;
    if (realmHazard.warning > 0) { const s = screenPos(realmHazard.x, realmHazard.y, cam); ctx.strokeStyle = '#f2a7ff'; ctx.lineWidth = 4; ctx.globalAlpha = .45 + realmHazard.warning * .45; ctx.beginPath(); ctx.arc(s.x, s.y, 68, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1; }
    drawAscendedMinimap(cam);
    if (flash > 0) { ctx.fillStyle = `rgba(220,195,255,${flash * .4})`; ctx.fillRect(0, 0, W, H); }
  }

  function draw(timeMs) {
    const time = timeMs / 1000;
    if (currentScene === 'sanctuary') { drawSanctuaryScene(time); return; }
    if (currentScene === 'ascended') { drawAscendedScene(time); return; }
    const targetX = clamp(player.x - W / 2, 0, WORLD_W * TILE - W), targetY = clamp(player.y - H / 2, 0, WORLD_H * TILE - H);
    const cam = { x: Math.round(targetX + (Math.random() - .5) * shake), y: Math.round(targetY + (Math.random() - .5) * shake) };
    ctx.fillStyle = '#17231f'; ctx.fillRect(0, 0, W, H);
    const x0 = Math.floor(cam.x / TILE), y0 = Math.floor(cam.y / TILE), x1 = Math.ceil((cam.x + W) / TILE), y1 = Math.ceil((cam.y + H) / TILE);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (x >= 0 && y >= 0 && x < WORLD_W && y < WORLD_H) drawTile(map[y][x], x * TILE - cam.x, y * TILE - cam.y, x, y, time);
    drawLandmarks(cam, time);
    drawSanctuaryExterior(cam, time);
    drawTribulationGate(cam, time);
    plants.forEach(p => drawPlant(p, cam, time));
    resourceNodes.forEach(node => drawResourceNode(node, cam, time));
    pickups.forEach(p => { const s = screenPos(p.x, p.y, cam), b = Math.sin(time * 5 + p.bob) * 3; ctx.fillStyle = '#07110eaa'; ctx.fillRect(s.x - 6, s.y + 6, 12, 3); if (p.type === 'gear') { ctx.fillStyle = '#d2ab58'; ctx.fillRect(s.x - 5, s.y - 6 + b, 10, 11); ctx.fillStyle = '#fff0aa'; ctx.fillRect(s.x - 2, s.y - 8 + b, 4, 4); } else { ctx.fillStyle = '#79e1b7'; ctx.fillRect(s.x - 4, s.y - 5 + b, 8, 9); ctx.fillStyle = '#c8ffe9'; ctx.fillRect(s.x - 1, s.y - 3 + b, 3, 4); } });
    if (multiplayer && !multiplayer.arena.active) multiplayerApi.drawWorldDrops(ctx, multiplayer.listDrops(Date.now()), { camera: cam, now: Date.now() });
    if (multiplayer && !multiplayer.arena.active) multiplayerApi.drawRemotePlayers(ctx, multiplayer.presence.getRenderable(Date.now()), { camera: cam, now: Date.now() });
    enemies.slice().sort((a,b)=>a.y-b.y).forEach(e => drawEnemy(e, cam, time));
    drawPlayer(cam);
    slashes.forEach(slash => { const p = screenPos(slash.x, slash.y, cam), alpha = slash.life / .18; ctx.strokeStyle = `rgba(255,230,167,${alpha})`; ctx.lineWidth = slash.style === 'greatsword' ? 7 : 4; ctx.beginPath();
      if (slash.style === 'spear') { ctx.moveTo(p.x + Math.cos(slash.a) * 12, p.y + Math.sin(slash.a) * 12); ctx.lineTo(p.x + Math.cos(slash.a) * slash.reach, p.y + Math.sin(slash.a) * slash.reach); }
      else { ctx.arc(p.x, p.y, slash.style === 'dual_swords' ? 28 : 31 + Math.max(0, slash.reach - 38) * .3, slash.a - slash.arc, slash.a + slash.arc); if (slash.style === 'dual_swords') ctx.arc(p.x, p.y, 36, slash.a - slash.arc * .65, slash.a + slash.arc * .65); }
      ctx.stroke(); });
    particles.forEach(p => { const s = screenPos(p.x,p.y,cam); ctx.globalAlpha = clamp(p.life / p.max, 0, 1); ctx.fillStyle = p.color; ctx.fillRect(s.x, s.y, p.size, p.size); }); ctx.globalAlpha = 1;

    // Time-of-day tint and a soft vignette.
    const cycle = ((playTime * .42 + 330) % 1440) / 1440, sun = Math.max(0, Math.sin((cycle - .22) * TAU));
    ctx.fillStyle = `rgba(7,12,30,${.34 * (1 - sun)})`; ctx.fillRect(0,0,W,H);
    const vg = ctx.createRadialGradient(W/2,H/2,H*.25,W/2,H/2,H*.82); vg.addColorStop(0,'transparent'); vg.addColorStop(1,'rgba(0,0,0,.4)'); ctx.fillStyle = vg; ctx.fillRect(0,0,W,H);
    drawMinimap(cam);
    if (flash > 0) { ctx.fillStyle = `rgba(240,220,144,${flash * .38})`; ctx.fillRect(0,0,W,H); }
  }

  function updateInventoryText() {
    if (!ui.inventoryText) return;
    const materials = Object.entries(player.ingredients).map(([id, count]) => `${itemDefs[id].name}: ${count}`);
    const keysOwned = [...player.keyItems].map(id => itemDefs[id]?.name).filter(Boolean);
    const requirement = currentBreakthroughRequirement(), missing = missingRequirements(requirement);
    const heavenly = endgameSystem?.serialize(), heavenlyProgress = endgameSystem?.progress();
    const immortal = immortalRealmSystem && immortalRealmApi.serialize(immortalRealmSystem), bounty = immortalRealmSystem && immortalRealmApi.inspectBounty(immortalRealmSystem), dao = daoSystem?.serialize(), incursion = celestialEventsApi.inspect(celestialEventSystem);
    ui.inventoryText.textContent = [
      `Moonleaf herbs: ${player.herbs} | Spirit stones: ${player.stones}`,
      ...materials,
      `Key items: ${keysOwned.length ? keysOwned.join(', ') : 'None'}`,
      `Learned arts: ${skillSystem?.learnedSkills().map(skill => skill.name).join(', ') || 'None'}`,
      `Heavenly path: tier ${heavenly?.bestTier || 0} · ${heavenly?.heavenlyMarks || 0} marks · ${heavenly?.heavenlyInsight || 0} insight`,
      `Immortal realm: ${immortal?.resources.shards || 0} soul shards · ${immortal?.resources.sigils || 0} ascendant sigils${bounty ? ` · decree ${bounty.progress}/${bounty.required}` : ''}`,
      `Dao constellation: ${dao?.attunedPath ? daoApi.PATHS[dao.attunedPath].name : 'None'} · Celestial incursions resolved: ${celestialEventSystem?.completionCount || 0}${incursion.active ? ` · ${incursion.definition.name} ${incursion.progress}/${incursion.required}` : ''}`,
      realms[player.realm].name === 'Nascent Soul'
        ? (heavenlyProgress?.nextStage ? `Nascent Soul ${roman(heavenlyProgress.nextStage)} awakens at tribulation tier ${heavenlyProgress.nextStageAtTier}.` : 'Nascent Soul IX is complete. Return to Scholar Bo to ascend.')
        : realms[player.realm].name === 'Soul Transformation'
          ? `Higher-realm progress: ${immortal?.stats.riftsStabilized || 0}/3 rifts · ${immortal?.objectives.includes('harbinger_defeated') ? 'Void Harbinger defeated' : 'Void Harbinger awaits'}.`
        : `Next breakthrough: ${missing.length ? missing.join(', ') : 'Requirements met; fill qi and cultivate.'}`
    ].join('\n');
  }

  function itemSummary(definition) {
    const stats = definition.stats || {}, parts = [];
    if (definition.slot === 'weapon') parts.push(`${Math.round((stats.damageMultiplier || 1) * 100)}% damage`, `${Math.round(100 / (stats.attackCooldownMultiplier || 1))}% attack speed`);
    if (stats.reachBonus) parts.push(`${stats.reachBonus > 0 ? '+' : ''}${stats.reachBonus} reach`);
    if (stats.defense) parts.push(`${Math.round(stats.defense * 100)}% defence`);
    if (stats.maxHpBonus) parts.push(`+${stats.maxHpBonus} health`);
    if (stats.moveSpeedMultiplier && stats.moveSpeedMultiplier !== 1) parts.push(`${stats.moveSpeedMultiplier > 1 ? '+' : ''}${Math.round((stats.moveSpeedMultiplier - 1) * 100)}% movement`);
    if (stats.dashCooldownMultiplier && stats.dashCooldownMultiplier !== 1) parts.push(`${Math.round((1 / stats.dashCooldownMultiplier - 1) * 100)}% dash recovery`);
    if (stats.parryWindowMultiplier && stats.parryWindowMultiplier !== 1) parts.push(`+${Math.round((stats.parryWindowMultiplier - 1) * 100)}% parry window`);
    if (stats.qiGainMultiplier && stats.qiGainMultiplier !== 1) parts.push(`+${Math.round((stats.qiGainMultiplier - 1) * 100)}% qi gain`);
    if (stats.lootChanceBonus) parts.push(`+${Math.round(stats.lootChanceBonus * 100)}% gear find`);
    return parts.join(' · ') || 'No additional stat modifiers';
  }

  function renderInventory() {
    const bag = equipmentApi.listBagItems(equipment), equipped = equipmentApi.getEquipped(equipment), stats = derivedCombatStats();
    ui.equipmentSlots.replaceChildren();
    for (const slot of equipmentApi.SLOTS) {
      const item = equipped[slot], definition = item && equipmentApi.getDefinition(item.itemId), button = document.createElement('button');
      button.type = 'button'; button.className = `equipment-slot${item && selectedItemUid === item.uid ? ' selected' : ''}`; button.dataset.slot = slot;
      const strong = document.createElement('strong'), small = document.createElement('small'); strong.textContent = `${slot[0].toUpperCase()}${slot.slice(1)} · ${definition ? definition.name : 'Empty'}`; small.textContent = definition ? itemSummary(definition) : 'Select a matching item from your backpack.';
      button.append(strong, small); button.addEventListener('click', () => { selectedItemUid = item?.uid || null; renderInventory(); }); ui.equipmentSlots.append(button);
    }
    ui.bagGrid.replaceChildren();
    const bagAt = new Map(bag.map(item => [`${item.x}:${item.y}`, item]));
    for (let y = 0; y < equipment.rows; y++) for (let x = 0; x < equipment.cols; x++) {
      const item = bagAt.get(`${x}:${y}`);
      if (!item) { const empty = document.createElement('div'); empty.className = 'bag-slot empty'; empty.setAttribute('aria-hidden', 'true'); ui.bagGrid.append(empty); continue; }
      const definition = equipmentApi.getDefinition(item.itemId), button = document.createElement('button');
      button.type = 'button'; button.className = `bag-slot${selectedItemUid === item.uid ? ' selected' : ''}`; button.dataset.rarity = definition.rarity;
      button.dataset.slot = definition.slot;
      const strong = document.createElement('strong'), small = document.createElement('small'); strong.textContent = definition.name; small.textContent = `${definition.slot} · ${definition.rarity}`; button.append(strong, small);
      button.addEventListener('click', () => { selectedItemUid = item.uid; renderInventory(); }); ui.bagGrid.append(button);
    }
    const selected = equipmentApi.itemByUid(equipment, selectedItemUid), definition = selected && equipmentApi.getDefinition(selected.itemId);
    ui.bagCount.textContent = `(${bag.length} / ${equipment.cols * equipment.rows} slots)`;
    ui.itemDetail.textContent = definition ? `${definition.name} · ${definition.rarity}\n${itemSummary(definition)}` : 'Select an item to inspect it.';
    const pending = selected && [...pendingSharedDrops.values()].includes(selected.uid);
    ui.equipItem.disabled = !selected || pending || Object.values(equipment.equipped).includes(selected.uid);
    ui.unequipItem.disabled = !selected || pending || !Object.values(equipment.equipped).includes(selected.uid);
    ui.dropItem.disabled = !selected || pending || currentScene !== 'world';
    ui.dropItem.textContent = currentScene === 'world' ? 'Drop' : 'Drop · outside only';
    ui.equipmentStats.textContent = `Damage: ${Math.round(stats.damageMultiplier * 100)}% · Defence: ${Math.round(stats.defense * 100)}%\nHealth bonus: +${stats.maxHpBonus} · Reach: ${38 + stats.reachBonus}\nMove speed: ${Math.round(stats.moveSpeedMultiplier * 100)}% · Attack speed: ${Math.round(100 / stats.attackCooldownMultiplier)}%\nParry window: ${Math.round(stats.parryWindowMultiplier * 100)}% · Dash recovery: ${Math.round(100 / stats.dashCooldownMultiplier)}%`;
  }

  function renderStorage() {
    ui.storageBagList.replaceChildren(); ui.storageChestList.replaceChildren();
    const makeButton = (item, side) => {
      const definition = equipmentApi.getDefinition(item.itemId), button = document.createElement('button');
      button.type = 'button'; button.className = `storage-item${selectedStorageSide === side && selectedStorageUid === item.uid ? ' selected' : ''}`;
      const equippedSlot = side === 'bag' ? equipmentApi.SLOTS.find(slot => equipment.equipped[slot] === item.uid) : null;
      button.innerHTML = `<strong>${definition.name}${equippedSlot ? ` · equipped ${equippedSlot}` : ''}</strong><small>${itemSummary(definition)}</small>`;
      button.addEventListener('click', () => { selectedStorageSide = side; selectedStorageUid = item.uid; renderStorage(); });
      return button;
    };
    for (const item of equipment.items) ui.storageBagList.append(makeButton(item, 'bag'));
    for (const item of storageApi.listItems(personalStorage)) ui.storageChestList.append(makeButton(item, 'chest'));
    if (!equipment.items.length) { const empty = document.createElement('p'); empty.textContent = 'Your backpack and equipment are empty.'; ui.storageBagList.append(empty); }
    if (!personalStorage.items.length) { const empty = document.createElement('p'); empty.textContent = 'The chest waits in stillness.'; ui.storageChestList.append(empty); }
    const selected = selectedStorageSide === 'bag' ? equipmentApi.itemByUid(equipment, selectedStorageUid) : storageApi.itemByUid(personalStorage, selectedStorageUid);
    const definition = selected && equipmentApi.getDefinition(selected.itemId);
    ui.storageCount.textContent = `(${personalStorage.items.length} stored · unlimited)`;
    ui.storageDetail.textContent = definition ? `${definition.name} · ${definition.rarity}\n${itemSummary(definition)}` : 'Select an item to move it.';
    ui.depositItem.disabled = !selected || selectedStorageSide !== 'bag';
    ui.withdrawItem.disabled = !selected || selectedStorageSide !== 'chest';
  }

  function depositSelectedItem() {
    const result = storageApi.deposit(personalStorage, equipment, selectedStorageUid, { allowEquipped: true });
    if (!result.ok) { addMessage('That item could not be stored.', 'bad'); return; }
    selectedStorageUid = null; selectedStorageSide = null; player.hp = Math.min(player.hp, effectiveMaxHp()); save(); renderStorage(); updateUI();
  }

  function withdrawSelectedItem() {
    const result = storageApi.withdraw(personalStorage, equipment, selectedStorageUid);
    if (!result.ok) { addMessage(result.reason === 'inventory-full' ? 'Your backpack is full.' : 'That item could not be withdrawn.', 'bad'); return; }
    selectedStorageUid = null; selectedStorageSide = null; save(); renderStorage(); updateUI();
  }

  const daoBonusLabels = {
    attackPowerPct: value => `+${Math.round(value * 100)}% attack power`, critChance: value => `+${Math.round(value * 100)}% critical chance`,
    attackSpeedPct: value => `+${Math.round(value * 100)}% attack speed`, bossDamagePct: value => `+${Math.round(value * 100)}% boss damage`,
    maxHealth: value => `+${value} maximum health`, parryWindowMs: value => `+${value}ms parry window`, parryQiRefund: value => `+${value} qi on parry`,
    damageReductionPct: value => `${Math.round(value * 100)}% damage reduction`, riposteDamagePct: value => `+${Math.round(value * 100)}% riposte damage`,
    moveSpeedPct: value => `+${Math.round(value * 100)}% movement speed`, maxQi: value => `+${value} maximum qi`,
    dashCooldownReductionPct: value => `${Math.round(value * 100)}% faster dash recovery`, dashQiCostReduction: value => `-${value} higher-realm dash qi`,
    qiRegenPerSecond: value => `+${value} qi per second`, dashDistancePct: value => `+${Math.round(value * 100)}% dash distance`
  };

  function daoBonusText(bonuses) {
    return Object.entries(bonuses).map(([id, value]) => daoBonusLabels[id]?.(value) || `${id}: ${value}`).join(' · ');
  }

  function renderDaoPaths() {
    if (!daoSystem || !ui.daoGrid) return;
    const state = daoSystem.serialize(), event = celestialEventsApi.inspect(celestialEventSystem);
    ui.legacySummary.textContent = [
      `Soul Shards: ${immortalRealmSystem.resources.shards}   Ascendant Sigils: ${immortalRealmSystem.resources.sigils}`,
      `Attuned: ${state.attunedPath ? daoApi.PATHS[state.attunedPath].name : 'none'}`,
      `Celestial Incursions resolved: ${celestialEventSystem.completionCount}   Next: ${event.definition.name}`
    ].join('\n');
    ui.daoGrid.replaceChildren();
    for (const path of Object.values(daoApi.PATHS)) {
      const report = daoSystem.inspect(path.id), card = document.createElement('section'), heading = document.createElement('h3'), description = document.createElement('p');
      card.className = `dao-card${report.attuned ? ' attuned' : ''}`; heading.textContent = path.name; description.textContent = path.description; card.append(heading, description);
      for (const node of path.nodes) {
        const nodeReport = daoSystem.inspect(path.id, node.id), button = document.createElement('button');
        button.type = 'button'; button.className = `dao-node${nodeReport.alreadyUnlocked ? ' unlocked' : ''}`;
        button.disabled = !nodeReport.alreadyUnlocked && nodeReport.code !== 'ready';
        const status = nodeReport.alreadyUnlocked ? 'Unlocked' : nodeReport.code === 'ready' ? `${node.cost.shards} shards + ${node.cost.sigils} sigil${node.cost.sigils === 1 ? '' : 's'}` : nodeReport.code === 'prerequisite_locked' ? 'Previous star required' : 'Insufficient celestial resources';
        button.innerHTML = `<strong>${node.name} · ${status}</strong><small>${node.description} ${daoBonusText(node.bonuses)}</small>`;
        if (!nodeReport.alreadyUnlocked) button.addEventListener('click', () => {
          const result = daoSystem.unlock(path.id, node.id, { scene: currentScene });
          if (result.ok) { addMessage(`${node.name} joins your constellation.`, 'good'); save(); updateUI(); }
          else addMessage('The constellation requires more celestial resources or an earlier star.', 'bad');
          renderDaoPaths();
        });
        card.append(button);
      }
      const attune = document.createElement('button'); attune.type = 'button'; attune.className = 'dao-attune'; attune.disabled = report.unlocked.length === 0 || report.attuned;
      attune.textContent = report.attuned ? 'Currently attuned' : report.unlocked.length ? `Attune ${path.name}` : 'Unlock a star to attune';
      attune.addEventListener('click', () => {
        if (currentScene !== 'sanctuary') return;
        const result = daoSystem.attune(path.id);
        if (result.ok) { player.hp = Math.min(player.hp, effectiveMaxHp()); player.qi = Math.min(player.qi, effectiveMaxQi()); addMessage(`Attuned ${path.name}.`, 'good'); save(); updateUI(); }
        renderDaoPaths();
      });
      card.append(attune); ui.daoGrid.append(card);
    }
  }

  function openDaoPaths() {
    if (currentScene !== 'sanctuary') { addMessage('Dao attunement is stable only inside the sanctuary formation.', 'bad'); return false; }
    if (!storyFlags.has('ascended_soul_transformation')) { addMessage('Scholar Bo has not yet opened the higher heavens.', 'bad'); return false; }
    openMenu('legacy'); renderDaoPaths(); return true;
  }

  function renderKeybinds() {
    ui.keybindList.replaceChildren();
    for (const action of keybindApi.ACTIONS) {
      const label = document.createElement('span'), button = document.createElement('button'); label.textContent = action.label; button.type = 'button'; button.dataset.bindAction = action.id; button.textContent = remappingAction === action.id ? 'Press a key…' : keybinds.get(action.id).map(key => key === 'space' ? 'Space' : key.length === 1 ? key.toUpperCase() : key).join(' / ');
      button.classList.toggle('is-listening', remappingAction === action.id); button.addEventListener('click', () => { remappingAction = action.id; renderKeybinds(); }); ui.keybindList.append(label, button);
    }
  }

  function updateDevStatus() {
    if (!ui.devStatus) return;
    const debugTile = currentScene === 'sanctuary' ? SANCT_TILE : TILE;
    ui.devStatus.textContent = [
      `Scene: ${currentScene} | Tile: ${(player.x / debugTile).toFixed(1)}, ${(player.y / debugTile).toFixed(1)} | ${zoneName()}`,
      `Realm: ${realms[player.realm].name} ${roman(player.stage)} | Tutorial: attack ${tutorial.attacked}, cultivate ${tutorial.cultivated}`,
      `HP: ${Math.ceil(player.hp)} / ${effectiveMaxHp()} | Qi: ${Math.floor(player.qi)} / ${effectiveMaxQi()}`,
      `Caches: ${openedCacheCount()} / ${treasures.length} | Bosses: ${Object.values(bossStates).filter(Boolean).length} / ${Object.keys(bossStates).length} | Keys: ${player.keyItems.size}`,
      `Heavenly tier: ${endgameSystem?.serialize().bestTier || 0} | Marks: ${endgameSystem?.serialize().heavenlyMarks || 0} | Active: ${endgameSystem?.active()?.tier || 'none'}`,
      `Immortal: ${immortalRealmSystem?.resources.shards || 0} shards | ${immortalRealmSystem?.resources.sigils || 0} sigils | ${immortalRealmSystem?.stats.riftsStabilized || 0}/3 rifts`,
      `Dao: ${daoSystem?.serialize().attunedPath || 'none'} | Incursions: ${celestialEventSystem?.completionCount || 0} | Active: ${celestialEventsApi.inspect(celestialEventSystem).active ? celestialEventsApi.inspect(celestialEventSystem).definition.id : 'none'}`,
      `Dash cooldown: ${dashCooldownDuration().toFixed(3)}s | Invulnerable: ${dev.invulnerable} | No cooldowns: ${dev.noCooldowns}`
    ].join('\n');
  }

  function menuElement(name) { return { settings: ui.settingsMenu, dev: ui.devMenu, inventory: ui.inventoryMenu, dialogue: ui.dialogueMenu, storage: ui.storageMenu, legacy: ui.legacyMenu }[name] || null; }

  function openMenu(name) {
    if (activeMenu === name) return;
    if (activeMenu) closeMenu();
    menuWasPaused = paused; paused = true; activeMenu = name;
    releaseAllInputs();
    const menu = menuElement(name);
    if (!menu) { activeMenu = null; paused = menuWasPaused; return; }
    menu.hidden = false;
    if (name === 'dev') updateDevStatus();
    else if (name === 'inventory') renderInventory();
    else if (name === 'storage') renderStorage();
    else if (name === 'legacy') renderDaoPaths();
    else if (name === 'settings') { updateInventoryText(); renderKeybinds(); }
    const focusTarget = menu.querySelector('button');
    if (focusTarget) focusTarget.focus();
  }

  function closeMenu() {
    if (!activeMenu) return;
    const closing = activeMenu, menu = menuElement(activeMenu);
    menu.hidden = true; activeMenu = null; paused = menuWasPaused;
    ui.clearConfirm.hidden = true;
    remappingAction = null; if (closing === 'dialogue') { dialogueSession = null; activeNpc = null; }
    releaseAllInputs(); canvas.focus();
  }

  function safeTeleport(tx, ty) {
    if (currentScene === 'ascended') {
      ascendedReturnPosition = { x: player.x, y: player.y }; ascendedEnemies = enemies.filter(enemy => !enemy.riftEvent && !enemy.incursionEvent); enemies = worldEnemies || []; worldEnemies = null; activeRiftId = null;
    }
    currentScene = 'world'; mapOpen = false;
    syncMultiplayerForScene();
    const baseX = clamp((tx + .5) * TILE, player.r, WORLD_W * TILE - player.r);
    const baseY = clamp((ty + .5) * TILE, player.r, WORLD_H * TILE - player.r);
    for (let radius = 0; radius <= 6; radius++) {
      for (let oy = -radius; oy <= radius; oy++) for (let ox = -radius; ox <= radius; ox++) {
        if (radius && Math.max(Math.abs(ox), Math.abs(oy)) !== radius) continue;
        const x = clamp(baseX + ox * TILE, player.r, WORLD_W * TILE - player.r);
        const y = clamp(baseY + oy * TILE, player.r, WORLD_H * TILE - player.r);
        if (passableAt(x, y, player.r)) { player.x = x; player.y = y; player.meditating = false; return true; }
      }
    }
    addMessage('No safe landing was found near that destination.', 'bad'); return false;
  }

  function setWorldMinute(minute) {
    const elapsedMinutes = playTime * .42 + 330;
    const dayStart = Math.floor(elapsedMinutes / 1440) * 1440;
    let target = dayStart + minute;
    if (target < 330) target += 1440;
    playTime = Math.max(0, (target - 330) / .42);
  }

  function grantGearSet(build) {
    let granted = 0;
    for (const definition of Object.values(equipmentApi.CATALOG).filter(item => item.build === build)) {
      const added = equipmentApi.addItem(equipment, definition.id);
      if (!added.ok) continue;
      equipmentApi.equipItem(equipment, added.item.uid); granted++;
    }
    player.hp = effectiveMaxHp();
    addMessage(granted ? `Equipped the ${build.replace('_', ' ')} testing set.` : 'The backpack is too full for that set.', granted ? 'good' : 'bad');
  }

  const travelTargets = {
    crossroads: [47, 39], merchant: [50, 38], 'vein-nw': [14, 13], 'vein-ne': [80, 13], 'vein-sw': [14, 58], 'vein-se': [81, 57],
    grove: [18, 29], monastery: [77, 30], mere: [17, 41], grave: [47, 15], ruins: [78, 41],
    mistglass: [116, 31], roots: [116, 42], kiln: [47, 78], starfall: [116, 77]
  };

  function completeAllTribulationsDev() {
    for (const boss of bossDefs) { bossStates[boss.id] = true; player.keyItems.add(boss.keyItem); const enemy = (worldEnemies || enemies).find(entry => entry.bossId === boss.id); if (enemy) enemy.alive = false; }
    if (endgameSystem.active()) completeTribulation();
    if (endgameSystem.serialize().bestTier < endgameApi.MAX_TIER) { player.realm = 4; player.stage = endgameSystem.serialize().nascentStage; }
    player.stones += 500;
    while (endgameSystem.serialize().bestTier < endgameApi.MAX_TIER) {
      const tier = endgameSystem.serialize().bestTier + 1, begun = endgameSystem.begin(tier, { player });
      if (!begun.ok) break;
      const result = endgameSystem.complete(begun.active.attemptId), advances = Math.max(0, result.nascentStage - player.stage);
      player.stage = result.nascentStage; player.maxHp += advances * 18; player.attack += advances * 5;
    }
    player.maxQi = qiCapacity(); player.qi = effectiveMaxQi(); player.hp = effectiveMaxHp(); tribulationPhase = 0;
    addMessage(endgameSystem.serialize().bestTier === endgameApi.MAX_TIER ? 'All three Heavenly Tribulations have been marked complete.' : 'The developer shortcut could not complete every tribulation.', endgameSystem.serialize().bestTier === endgameApi.MAX_TIER ? 'good' : 'bad');
  }

  function runDevAction(action) {
    let persist = true, reconcile = true;
    const boss = enemies.filter(e => e.boss).sort((a, b) => dist(player, a) - dist(player, b))[0];
    switch (action) {
      case 'heal': player.hp = effectiveMaxHp(); break;
      case 'refill-qi': player.qi = effectiveMaxQi(); break;
      case 'add-herbs': player.herbs += 10; break;
      case 'add-stones': player.stones += 25; break;
      case 'add-xp': gainXp(player.xpNeed); break;
      case 'advance-cultivation':
        if (player.realm === realms.length - 1 && player.stage === realms[player.realm].stages) addMessage('Already at the current cultivation limit.');
        else { player.qi = effectiveMaxQi(); breakthrough(true); }
        break;
      case 'toggle-invulnerable': dev.invulnerable = !dev.invulnerable; persist = false; break;
      case 'toggle-cooldowns': dev.noCooldowns = !dev.noCooldowns; persist = false; break;
      case 'reset-tutorial': tutorial.attacked = tutorial.cultivated = false; reconcile = false; break;
      case 'complete-tutorial': tutorial.attacked = tutorial.cultivated = true; reconcile = false; break;
      case 'grant-materials':
        player.herbs += 25; player.stones += 100;
        for (const item of Object.keys(player.ingredients)) player.ingredients[item] += 25;
        for (const item of Object.keys(itemDefs)) if (!(item in player.ingredients)) player.keyItems.add(item);
        break;
      case 'grant-spear-set': grantGearSet('spear'); break;
      case 'grant-dual-set': grantGearSet('dual_swords'); break;
      case 'grant-greatsword-set': grantGearSet('greatsword'); break;
      case 'grant-sword-set': grantGearSet('sword'); break;
      case 'learn-all-skills': configureSkillSystem({ learned: Object.keys(skillsApi.CATALOG) }); player.hp = Math.min(player.hp, effectiveMaxHp()); break;
      case 'enter-sanctuary': enterSanctuary(); break;
      case 'sanctuary-corner':
        if (currentScene === 'ascended') enterSanctuary(); else if (currentScene === 'world') worldReturnPosition = { x: player.x, y: player.y };
        currentScene = 'sanctuary'; mapOpen = false; player.x = 39.5 * SANCT_TILE; player.y = 27 * SANCT_TILE; player.facing = Math.PI / 2; break;
      case 'sanctuary-well':
        if (currentScene === 'ascended') enterSanctuary(); else if (currentScene === 'world') worldReturnPosition = { x: player.x, y: player.y };
        currentScene = 'sanctuary'; mapOpen = false; player.x = 34.5 * SANCT_TILE; player.y = 24.5 * SANCT_TILE; player.facing = Math.PI / 2; break;
      case 'sanctuary-tutors':
        if (currentScene === 'ascended') enterSanctuary(); else if (currentScene === 'world') worldReturnPosition = { x: player.x, y: player.y };
        currentScene = 'sanctuary'; mapOpen = false; player.x = 24.5 * SANCT_TILE; player.y = 27 * SANCT_TILE; player.facing = 0; break;
      case 'unlock-endgame':
        for (const boss of bossDefs) { bossStates[boss.id] = true; player.keyItems.add(boss.keyItem); const enemy = enemies.find(e => e.bossId === boss.id); if (enemy) enemy.alive = false; }
        player.realm = 4; player.stage = endgameSystem.serialize().nascentStage; player.maxQi = qiCapacity(); player.qi = effectiveMaxQi(); player.hp = effectiveMaxHp(); break;
      case 'start-tribulation': startTribulation(); persist = false; break;
      case 'complete-tribulation': completeTribulation(); persist = false; break;
      case 'complete-all-tribulations': completeAllTribulationsDev(); break;
      case 'ascend-higher-realm': completeAllTribulationsDev(); currentScene = 'sanctuary'; ascendWithScholarBo(); persist = false; break;
      case 'enter-higher-realm':
        if (player.realm < 5) { completeAllTribulationsDev(); currentScene = 'sanctuary'; ascendWithScholarBo(); }
        else enterAscendedRealm();
        persist = false; break;
      case 'start-rift': {
        if (player.realm < 5) { completeAllTribulationsDev(); currentScene = 'sanctuary'; ascendWithScholarBo(); }
        else enterAscendedRealm();
        const node = riftNodes.find(entry => !immortalRealmApi.inspectRift(immortalRealmSystem, entry.id).stabilized) || riftNodes[0];
        player.x = node.x; player.y = node.y + 54; startNearbyRift(); persist = false; break;
      }
      case 'grant-immortal-resources':
        immortalRealmSystem.resources.shards += 150; immortalRealmSystem.resources.sigils += 12; break;
      case 'open-dao-paths':
        if (currentScene !== 'sanctuary') enterSanctuary(); storyFlags.add('ascended_soul_transformation'); openDaoPaths(); persist = false; break;
      case 'start-incursion': {
        if (player.realm < 5) { completeAllTribulationsDev(); currentScene = 'sanctuary'; ascendWithScholarBo(); }
        else enterAscendedRealm();
        if (!immortalRealmSystem.objectives.includes('soul_transformation')) immortalRealmSystem.objectives.push('soul_transformation');
        player.x = incursionBeacon.x; player.y = incursionBeacon.y + 52; startCelestialIncursion(); persist = false; break;
      }
      case 'clear-materials':
        player.herbs = player.stones = 0; for (const item of Object.keys(player.ingredients)) player.ingredients[item] = 0;
        player.keyItems = new Set(bossDefs.filter(b => bossStates[b.id]).map(b => b.keyItem)); reconcile = false; break;
      case 'open-caches': treasures.forEach(t => { t.opened = true; }); break;
      case 'reset-caches': treasures.forEach(t => { t.opened = false; }); reconcile = false; break;
      case 'defeat-boss':
        if (boss && boss.alive) killEnemy(boss);
        else if (boss) { bossStates[boss.bossId] = true; player.keyItems.add(boss.keyItem); boss.alive = false; }
        break;
      case 'respawn-boss':
        if (boss) {
          const definition = bossDefs.find(b => b.id === boss.bossId); bossStates[boss.bossId] = false;
          Object.assign(boss, { x: definition.x * TILE, y: definition.y * TILE, hp: boss.maxHp, alive: true, respawn: 99999, attackState: 'idle', attackTimer: 0, stagger: 0, riposteWindow: 0 });
        }
        reconcile = false; break;
      case 'trigger-attack': {
        const target = enemies.filter(e => e.alive).sort((a, b) => dist(player, a) - dist(player, b))[0];
        if (target) {
          const angle = player.facing + Math.PI, x = player.x + Math.cos(angle) * 42, y = player.y + Math.sin(angle) * 42;
          if (passableAt(x, y, enemyTypes[target.type].r)) { target.x = x; target.y = y; }
          startEnemyAttack(target, enemyProfile(target));
        }
        persist = false; break;
      }
      case 'dawn': setWorldMinute(360); break;
      case 'noon': setWorldMinute(720); break;
      case 'night': setWorldMinute(1260); break;
      case 'save-now': save(); persist = false; break;
      case 'reload-save': location.reload(); return;
      default: persist = false;
    }
    if (reconcile) reconcileQuestProgress();
    updateUI(); updateDevStatus(); updateInventoryText();
    if (persist) save();
  }

  function frame(now) {
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    try {
      update(dt); draw(now); runtimeErrorShown = false;
    } catch (error) {
      console.error('Recovered game-loop error:', error);
      releaseAllInputs(); player.meditating = false;
      if (!runtimeErrorShown) { runtimeErrorShown = true; addMessage('A wandering qi deviation was corrected. You can keep playing.', 'bad'); }
    }
    requestAnimationFrame(frame);
  }

  addEventListener('keydown', e => {
    if (e.ctrlKey && e.shiftKey && e.altKey && e.code === 'KeyD') {
      e.preventDefault(); e.stopPropagation();
      if (activeMenu === 'dev') closeMenu(); else openMenu('dev');
      return;
    }
    if (remappingAction && activeMenu === 'settings') {
      e.preventDefault(); e.stopPropagation();
      if (e.key === 'Escape') { remappingAction = null; renderKeybinds(); return; }
      const key = keybindApi.normalizeKey(e);
      if (key && !['ctrl','alt','meta'].includes(key)) { keybinds.setBinding(remappingAction, key, 0); remappingAction = null; renderKeybinds(); save(); }
      return;
    }
    if (activeMenu) {
      if (e.key === 'Escape') { e.preventDefault(); closeMenu(); }
      return;
    }
    const k = keybindApi.normalizeKey(e);
    if (['space','arrowup','arrowdown','arrowleft','arrowright'].includes(k)) e.preventDefault();
    if (!keys.has(k)) taps.add(k); keyboardKeys.add(k); keys.add(k);
    if (k === 'escape' && started) { paused = !paused; addMessage(paused ? 'The world waits.' : 'The journey continues.'); }
  });
  addEventListener('keyup', e => {
    const k = keybindApi.normalizeKey(e); keyboardKeys.delete(k);
    if (!touchKeyCounts.has(k)) keys.delete(k);
  });
  function releaseTouchPointer(pointerId) {
    const entry = touchPointers.get(pointerId);
    if (!entry) return;
    touchPointers.delete(pointerId);
    const nextCount = (touchKeyCounts.get(entry.key) || 1) - 1;
    if (nextCount > 0) touchKeyCounts.set(entry.key, nextCount); else touchKeyCounts.delete(entry.key);
    if (![...touchPointers.values()].some(active => active.button === entry.button)) entry.button.classList.remove('is-pressed');
    if (!touchKeyCounts.has(entry.key) && !keyboardKeys.has(entry.key)) keys.delete(entry.key);
    try { entry.button.releasePointerCapture(pointerId); } catch (_) {}
  }
  function releaseAllInputs() {
    for (const [pointerId, entry] of touchPointers) {
      entry.button.classList.remove('is-pressed');
      try { entry.button.releasePointerCapture(pointerId); } catch (_) {}
    }
    touchPointers.clear(); touchKeyCounts.clear(); keyboardKeys.clear(); keys.clear(); taps.clear();
  }

  addEventListener('blur', releaseAllInputs);
  addEventListener('pointerup', e => releaseTouchPointer(e.pointerId), true);
  addEventListener('pointercancel', e => releaseTouchPointer(e.pointerId), true);
  addEventListener('pagehide', releaseAllInputs);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    releaseAllInputs();
    if (multiplayer?.arena.active) multiplayer.arena.setInput({ moveX: 0, moveY: 0, aimX: 1, aimY: 0, attack: false, parry: false, dash: false }, true);
    else if (currentScene === 'world') multiplayer?.updatePresence({ x: player.x, y: player.y, facing: player.facing.toFixed(3), moving: false, action: 'none' }, true);
  });
  document.querySelectorAll('[data-key], [data-action]').forEach(btn => {
    const k = btn.dataset.action ? `@${btn.dataset.action}` : btn.dataset.key;
    btn.addEventListener('pointerdown', e => {
      e.preventDefault(); releaseTouchPointer(e.pointerId);
      if (!keys.has(k)) taps.add(k);
      touchPointers.set(e.pointerId, { key: k, button: btn });
      touchKeyCounts.set(k, (touchKeyCounts.get(k) || 0) + 1);
      keys.add(k); btn.classList.add('is-pressed');
      try { btn.setPointerCapture(e.pointerId); } catch (_) {}
    });
    const release = e => { e.preventDefault(); releaseTouchPointer(e.pointerId); };
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
    btn.addEventListener('lostpointercapture', release);
    btn.addEventListener('pointerleave', e => { if (!btn.hasPointerCapture?.(e.pointerId)) release(e); });
  });
  ui.settingsMenu.addEventListener('contextmenu', e => e.preventDefault());
  ui.devMenu.addEventListener('contextmenu', e => e.preventDefault());
  document.getElementById('touch').addEventListener('contextmenu', e => e.preventDefault());
  document.getElementById('touch').addEventListener('selectstart', e => e.preventDefault());
  document.getElementById('touch').addEventListener('dragstart', e => e.preventDefault());
  let menuHoldStarted = null, suppressMenuClick = false;
  ui.settingsButton.addEventListener('pointerdown', () => { menuHoldStarted = performance.now(); suppressMenuClick = false; });
  ui.settingsButton.addEventListener('pointerup', e => {
    if (menuHoldStarted !== null && performance.now() - menuHoldStarted >= 1800) {
      e.preventDefault(); suppressMenuClick = true; openMenu('dev');
    }
    menuHoldStarted = null;
  });
  ui.settingsButton.addEventListener('pointercancel', () => { menuHoldStarted = null; });
  ui.settingsButton.addEventListener('click', e => {
    if (suppressMenuClick) { e.preventDefault(); suppressMenuClick = false; return; }
    openMenu('settings');
  });
  ui.multiplayerButton.addEventListener('click', () => setMultiplayerPanel(!multiplayerPanelOpen));
  ui.closeSettings.addEventListener('click', closeMenu);
  ui.closeInventory.addEventListener('click', closeMenu);
  ui.closeDialogue.addEventListener('click', closeMenu);
  ui.closeStorage.addEventListener('click', closeMenu);
  ui.closeLegacy.addEventListener('click', closeMenu);
  ui.closeDev.addEventListener('click', closeMenu);
  ui.equipItem.addEventListener('click', () => {
    const result = equipmentApi.equipItem(equipment, selectedItemUid);
    if (!result.ok) addMessage('Your pack needs enough room for the replaced item.', 'bad'); else { player.hp = Math.min(player.hp, effectiveMaxHp()); save(); }
    renderInventory(); updateUI();
  });
  ui.unequipItem.addEventListener('click', () => {
    const selected = equipmentApi.itemByUid(equipment, selectedItemUid), definition = selected && equipmentApi.getDefinition(selected.itemId);
    if (!definition) return;
    const result = equipmentApi.unequipItem(equipment, definition.slot);
    if (!result.ok) addMessage('Your pack needs more room before unequipping that item.', 'bad'); else { player.hp = Math.min(player.hp, effectiveMaxHp()); save(); }
    renderInventory(); updateUI();
  });
  ui.dropItem.addEventListener('click', dropSelectedItem);
  ui.depositItem.addEventListener('click', depositSelectedItem);
  ui.withdrawItem.addEventListener('click', withdrawSelectedItem);
  ui.resetKeybinds.addEventListener('click', () => { keybinds.reset(); remappingAction = null; renderKeybinds(); save(); });
  document.querySelectorAll('[data-settings-tab]').forEach(button => button.addEventListener('click', () => {
    const controls = button.dataset.settingsTab === 'controls'; ui.settingsControls.hidden = !controls; ui.settingsProgress.hidden = controls;
    document.querySelectorAll('[data-settings-tab]').forEach(tab => tab.setAttribute('aria-selected', String(tab === button)));
  }));
  ui.clearProgress.addEventListener('click', () => { ui.clearConfirm.hidden = false; ui.confirmClear.focus(); });
  ui.cancelClear.addEventListener('click', () => { ui.clearConfirm.hidden = true; ui.clearProgress.focus(); });
  ui.playerNameInput.addEventListener('input', () => { ui.nameError.textContent = ''; });
  ui.playerNameInput.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); ui.start.click(); }
  });
  ui.confirmClear.addEventListener('click', () => {
    try {
      suppressSave = true; localStorage.removeItem(SAVE_KEY); localStorage.removeItem('verdant-star-multiplayer-name'); location.reload();
    } catch (_) {
      suppressSave = false; closeMenu(); addMessage('The save could not be deleted on this device.', 'bad');
    }
  });
  ui.devMenu.addEventListener('click', e => {
    const actionButton = e.target.closest('[data-dev-action]');
    if (actionButton) { runDevAction(actionButton.dataset.devAction); return; }
    const travelButton = e.target.closest('[data-dev-travel]');
    if (!travelButton) return;
    const target = travelTargets[travelButton.dataset.devTravel];
    if (target && safeTeleport(target[0], target[1])) { player.invuln = Math.max(player.invuln, 2); updateUI(); updateDevStatus(); save(); }
  });
  ui.start.addEventListener('click', () => {
    if (!playerName) {
      const chosen = cleanPlayerName(ui.playerNameInput.value);
      if (!chosen) { ui.nameError.textContent = 'Use 1–20 letters, numbers, spaces, dots, dashes, or underscores.'; ui.playerNameInput.focus(); return; }
      playerName = chosen; ui.nameError.textContent = ''; configureNameSetup(); save();
    }
    started = true; ui.overlay.hidden = true; canvas.focus(); addMessage('The Verdant Star stirs above the silent sect.', 'good'); updateUI(); initMultiplayer();
  });
  addEventListener('beforeunload', () => { if (!suppressSave) save(); });

  configureSkillSystem();
  configureEndgameSystem();
  configureImmortalRealm();
  configureDaoSystem();
  configureCelestialEvents();
  const hadSave = load();
  if (!hadSave) player.hp = effectiveMaxHp();
  populate();
  if (currentScene === 'ascended') {
    if (player.realm < 5) { currentScene = 'sanctuary'; player.x = sanctuary.spawn.x * SANCT_TILE; player.y = sanctuary.spawn.y * SANCT_TILE; }
    else { worldEnemies = enemies; ascendedEnemies = []; populateAscended(); enemies = ascendedEnemies; if (activeRiftId) spawnRiftWave(activeRiftId); else spawnCelestialIncursion(); }
  }
  resumeTribulation();
  const questRepaired = reconcileQuestProgress();
  if (hadSave && (loadedSaveVersion < SAVE_VERSION || questRepaired)) save();
  configureNameSetup(); updateUI(); requestAnimationFrame(frame);
})();
