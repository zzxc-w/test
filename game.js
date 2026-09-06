(() => {
  'use strict';

  const canvas = document.querySelector('#game');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const W = canvas.width, H = canvas.height, TILE = 24;
  const WORLD_W = 96, WORLD_H = 72;
  const TAU = Math.PI * 2;
  const SAVE_KEY = 'verdant-star-save';
  const SAVE_VERSION = 4;
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

  const ui = Object.fromEntries(['realm','hpFill','hpText','qiFill','qiText','xpFill','stones','herbs','kills','caches','zone','time','questText','messages','overlay','start','compassArrow','compassText','interactPrompt','settingsButton','settingsMenu','closeSettings','clearProgress','clearConfirm','confirmClear','cancelClear','devMenu','closeDev','devStatus'].map(id => [id, document.getElementById(id)]));
  const keys = new Set(), taps = new Set(), keyboardKeys = new Set(), touchPointers = new Map(), touchKeyCounts = new Map();
  let started = false, paused = false, last = performance.now(), playTime = 0, shake = 0, flash = 0, runtimeErrorShown = false;
  let activeMenu = null, menuWasPaused = false, suppressSave = false, loadedSaveVersion = 0;
  const dev = { invulnerable: false, noCooldowns: false };

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
  for (let x = 5; x < 91; x++) for (let d = -1; d <= 1; d++) map[36 + d][x] = 'path';
  for (let y = 6; y < 67; y++) for (let d = -1; d <= 1; d++) map[y][47 + d] = 'path';
  for (let y = 30; y <= 42; y++) for (let x = 40; x <= 54; x++) if (Math.hypot(x - 47, y - 36) < 7) map[y][x] = 'grass';
  const landmarks = [
    { x: 14, y: 13, type: 'vein' }, { x: 80, y: 13, type: 'vein' }, { x: 14, y: 58, type: 'vein' }, { x: 81, y: 57, type: 'vein' },
    { x: 47, y: 36, type: 'shrine' }, { x: 47, y: 9, type: 'shrine' }, { x: 47, y: 63, type: 'shrine' }
  ];
  for (const l of landmarks) {
    for (let yy = l.y - 2; yy <= l.y + 2; yy++) for (let xx = l.x - 2; xx <= l.x + 2; xx++) map[yy][xx] = 'grass';
    map[l.y][l.x] = l.type;
  }
  const areas = [
    { x: 18, y: 12, r: 6, name: 'Jade Bamboo Grove', icon: 'bamboo' },
    { x: 77, y: 15, r: 7, name: 'Cloudstep Monastery', icon: 'monastery' },
    { x: 17, y: 56, r: 7, name: 'Moon Lotus Mere', icon: 'lotus' },
    { x: 78, y: 56, r: 8, name: 'Ruins of the Fallen Sect', icon: 'ruins' },
    { x: 47, y: 9, r: 5, name: 'Sword Saintâ€™s Grave', icon: 'swords' }
  ];
  for (const a of areas) {
    for (let yy = a.y - a.r; yy <= a.y + a.r; yy++) for (let xx = a.x - a.r; xx <= a.x + a.r; xx++) {
      if (yy > 2 && xx > 2 && yy < WORLD_H - 3 && xx < WORLD_W - 3 && Math.hypot(xx - a.x, yy - a.y) < a.r) map[yy][xx] = (a.icon === 'lotus' && hash(xx, yy, 18) < .22) ? 'water' : 'grass';
    }
  }
  // Area carving happens after landmark clearings, so restore the functional landmark tiles.
  for (const l of landmarks) map[l.y][l.x] = l.type;

  const realms = [
    { name: 'Mortal', stages: 3, qi: 80 }, { name: 'Qi Condensation', stages: 5, qi: 150 },
    { name: 'Foundation', stages: 4, qi: 260 }, { name: 'Golden Core', stages: 3, qi: 420 }, { name: 'Nascent Soul', stages: 1, qi: 9999 }
  ];

  const player = {
    x: 47.5 * TILE, y: 39 * TILE, r: 8, facing: 0, speed: 142, hp: 100, maxHp: 100,
    qi: 0, maxQi: 80, xp: 0, xpNeed: 60, realm: 0, stage: 1, stones: 0, herbs: 0, kills: 0,
    attack: 16, attackCd: 0, attackTimer: 0, dashCd: 0, invuln: 0, talismanCd: 0,
    meditating: false, discoveries: new Set(['Crossroads Shrine'])
  };
  let enemies = [], plants = [], particles = [], slashes = [], pickups = [], messages = [], quest = 0;
  let treasures = areas.map((a, i) => ({ x: (a.x + (i % 2 ? 3 : -3)) * TILE, y: (a.y + 2) * TILE, opened: false, area: a.name }));
  const guaranteedHerbs = [[44,39],[51,39],[43,34],[52,34],[46,43],[49,43],[37,36],[58,36],[21,14],[73,17],[21,57],[74,57]];
  let bossDefeated = false;

  const enemyTypes = {
    hare: { name: 'Ironhorn Hare', hp: 34, speed: 78, damage: 8, color: '#b78b72', xp: 14, r: 8 },
    wolf: { name: 'Ashfang Wolf', hp: 58, speed: 92, damage: 12, color: '#788191', xp: 24, r: 10 },
    wisp: { name: 'Lost Wisp', hp: 46, speed: 62, damage: 10, color: '#69cfb5', xp: 20, r: 8 },
    guardian: { name: 'Stone Guardian', hp: 120, speed: 46, damage: 18, color: '#9b8064', xp: 50, r: 13 }
    ,serpent: { name: 'Mirecoil Serpent', hp: 76, speed: 70, damage: 14, color: '#668f5c', xp: 31, r: 11 }
    ,rogue: { name: 'Demonic Cultivator', hp: 96, speed: 75, damage: 16, color: '#9d536b', xp: 42, r: 11 }
  };

  function passableAt(px, py, radius = 7) {
    const points = [[-radius,-radius],[radius,-radius],[-radius,radius],[radius,radius]];
    return points.every(([ox,oy]) => {
      const x = Math.floor((px + ox) / TILE), y = Math.floor((py + oy) / TILE);
      return x >= 0 && y >= 0 && x < WORLD_W && y < WORLD_H && !['water','stone'].includes(map[y][x]);
    });
  }

  function randomOpen(seed, margin = 5) {
    for (let i = 0; i < 500; i++) {
      const x = margin + Math.floor(hash(i, seed, 21) * (WORLD_W - margin * 2));
      const y = margin + Math.floor(hash(seed, i, 71) * (WORLD_H - margin * 2));
      if (!['water','stone','shrine','vein'].includes(map[y][x]) && Math.hypot(x - 47, y - 36) > 7) return { x: (x + .5) * TILE, y: (y + .5) * TILE };
    }
    return { x: 20 * TILE, y: 20 * TILE };
  }

  function populate() {
    enemies = Array.from({ length: 34 }, (_, i) => {
      const p = randomOpen(100 + i);
      const danger = Math.hypot(p.x / TILE - 47, p.y / TILE - 36);
      const px = p.x / TILE, py = p.y / TILE;
      const type = px < 34 && py > 48 ? 'serpent' : px > 62 && py > 48 ? (i % 2 ? 'rogue' : 'guardian') : danger > 39 ? 'guardian' : danger > 25 ? (i % 3 ? 'wolf' : 'wisp') : (i % 4 ? 'hare' : 'wisp');
      const t = enemyTypes[type];
      return { ...p, type, hp: t.hp, maxHp: t.hp, vx: 0, vy: 0, hit: 0, attackCd: hash(i, 2) * 2, wander: hash(i, 3) * TAU, alive: true };
    });
    plants = guaranteedHerbs.map(([x,y], i) => ({ x: (x + .5) * TILE, y: (y + .5) * TILE, ready: true, respawn: 0, phase: hash(i, 8) * TAU, guaranteed: true }));
    plants.push(...Array.from({ length: 52 }, (_, i) => ({ ...randomOpen(300 + i), ready: true, respawn: 0, phase: hash(i, 8) * TAU })));
    const boss = enemyTypes.guardian;
    enemies.push({ x: 78 * TILE, y: 56 * TILE, type: 'guardian', hp: 320, maxHp: 320, vx: 0, vy: 0, hit: 0, attackCd: 1, wander: 0, alive: !bossDefeated, boss: true, respawn: 99999, title: 'Sectbreaker Golem' });
  }

  function addMessage(text, type = '') {
    messages.unshift({ text, type, life: 4.5 });
    messages = messages.slice(0, 4);
    ui.messages.innerHTML = messages.map(m => `<div class="msg ${m.type}">${m.text}</div>`).join('');
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

  function dashCooldownDuration() {
    const reductions = Math.min(10, cultivationAdvancements());
    return Math.max(DASH_MIN_COOLDOWN, DASH_BASE_COOLDOWN - reductions * DASH_COOLDOWN_STEP);
  }

  function reconcileQuestProgress() {
    const before = quest;
    if (quest === 1 && player.kills > 0) quest = 2;
    if (quest === 2 && player.herbs >= 3) quest = 3;
    if (quest === 3 && player.realm > 0) quest = 4;
    if (quest === 4 && openedCacheCount() >= treasures.length) quest = 5;
    if (quest === 5 && bossDefeated) quest = 6;
    return quest !== before;
  }

  function sanitizeLoadedState() {
    player.realm = clamp(Math.floor(player.realm) || 0, 0, realms.length - 1);
    player.stage = clamp(Math.floor(player.stage) || 1, 1, realms[player.realm].stages);
    player.maxHp = clamp(Math.floor(player.maxHp) || 100, 1, 1000000);
    player.maxQi = clamp(Math.floor(player.maxQi) || realms[player.realm].qi, 1, 1000000);
    player.hp = clamp(player.hp, 0, player.maxHp);
    player.qi = clamp(player.qi, 0, player.maxQi);
    player.attack = clamp(Math.floor(player.attack) || 16, 1, 1000000);
    player.stones = clamp(Math.floor(player.stones) || 0, 0, 100000000);
    player.herbs = clamp(Math.floor(player.herbs) || 0, 0, 100000000);
    player.kills = clamp(Math.floor(player.kills) || 0, 0, 100000000);
    quest = clamp(Math.floor(quest) || 0, 0, 6);
    if (!passableAt(player.x, player.y, player.r)) { player.x = 47.5 * TILE; player.y = 39 * TILE; }
  }

  function save() {
    if (suppressSave) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        version: SAVE_VERSION,
        x: player.x, y: player.y, hp: player.hp, qi: player.qi, maxQi: player.maxQi, maxHp: player.maxHp,
        xp: player.xp, xpNeed: player.xpNeed, realm: player.realm, stage: player.stage, stones: player.stones,
        herbs: player.herbs, kills: player.kills, attack: player.attack, quest, playTime,
        discoveries: [...player.discoveries], treasures: treasures.map(t => t.opened), bossDefeated
      }));
    } catch (_) {}
  }

  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (!d) return false;
      loadedSaveVersion = Number.isFinite(d.version) ? Math.floor(d.version) : 0;
      for (const k of ['x','y','hp','qi','maxQi','maxHp','xp','xpNeed','realm','stage','stones','herbs','kills','attack']) if (Number.isFinite(d[k])) player[k] = d[k];
      quest = Number.isFinite(d.quest) ? d.quest : 0;
      playTime = Number.isFinite(d.playTime) ? d.playTime : 0;
      if (Array.isArray(d.discoveries)) player.discoveries = new Set(d.discoveries);
      // Version 2 could autosave a chest as opened before its reward threw an error.
      if (d.version >= 3 && Array.isArray(d.treasures)) d.treasures.forEach((opened, i) => { if (treasures[i]) treasures[i].opened = !!opened; });
      bossDefeated = !!d.bossDefeated;
      // Old or partially-written saves must never create an unbounded level-up loop.
      player.xpNeed = clamp(Math.floor(player.xpNeed) || 60, 20, 1000000);
      player.xp = clamp(Math.floor(player.xp) || 0, 0, player.xpNeed * 10);
      sanitizeLoadedState();
      return true;
    } catch (_) { return false; }
  }

  function tileUnder(o = player) { return map[clamp(Math.floor(o.y / TILE), 0, WORLD_H - 1)][clamp(Math.floor(o.x / TILE), 0, WORLD_W - 1)]; }
  function zoneName() {
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
    if (passableAt(o.x + dx, o.y, radius)) o.x += dx;
    if (passableAt(o.x, o.y + dy, radius)) o.y += dy;
  }

  function cultivate() {
    const vein = landmarks.find(l => l.type === 'vein' && Math.hypot(player.x / TILE - (l.x + .5), player.y / TILE - (l.y + .5)) < 2.25);
    if (!vein) { addMessage('Cultivation only works inside a green spirit-vein beacon.', 'bad'); return; }
    player.meditating = true;
    if (player.qi < player.maxQi) {
      player.qi = Math.min(player.maxQi, player.qi + 18);
      player.hp = Math.min(player.maxHp, player.hp + 8);
      burst(player.x, player.y, '#77e6ba', 14, 38);
      addMessage('You draw rich vein qi into your meridians.', 'good');
      if (quest === 0) { quest = 1; addMessage('Insight: qi can strengthen body and blade.', 'good'); }
    }
    if (player.qi >= player.maxQi) breakthrough();
  }

  function breakthrough() {
    const r = realms[player.realm];
    player.qi = 0;
    player.stage++;
    if (player.stage > r.stages) { player.realm = Math.min(player.realm + 1, realms.length - 1); player.stage = 1; }
    const nr = realms[player.realm];
    player.maxQi = nr.qi + (player.stage - 1) * Math.floor(nr.qi * .3);
    player.maxHp += 18;
    player.hp = player.maxHp;
    player.attack += 5;
    flash = 1; shake = 10;
    burst(player.x, player.y, '#f1d47a', 38, 135);
    addMessage(`Breakthrough! ${nr.name}, stage ${player.stage}.`, 'good');
    if (quest < 3) quest = 3;
    reconcileQuestProgress();
    save();
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
      player.attack += 2; player.maxHp += 5; player.hp = Math.min(player.maxHp, player.hp + 15);
      addMessage('Martial insight deepens your technique.', 'good');
    }
    if (levels >= 20) { player.xp = 0; player.xpNeed = Math.max(60, player.xpNeed); }
  }

  function attack() {
    if (player.attackCd > 0 || player.meditating) return;
    player.attackCd = .34; player.attackTimer = .15;
    const reach = 38, ax = player.x + Math.cos(player.facing) * 20, ay = player.y + Math.sin(player.facing) * 20;
    slashes.push({ x: player.x, y: player.y, a: player.facing, life: .18 });
    for (const e of enemies) {
      if (!e.alive || Math.hypot(e.x - ax, e.y - ay) > reach) continue;
      const angle = Math.atan2(e.y - player.y, e.x - player.x);
      let delta = Math.atan2(Math.sin(angle - player.facing), Math.cos(angle - player.facing));
      if (Math.abs(delta) < 1.25) {
        e.hp -= player.attack + Math.floor(player.qi * .035);
        e.hit = .18; e.x += Math.cos(angle) * 14; e.y += Math.sin(angle) * 14;
        burst(e.x, e.y, '#f4c477', 7, 80);
        if (e.hp <= 0) killEnemy(e);
      }
    }
  }

  function useTalisman() {
    if (player.talismanCd > 0) return;
    if (player.qi < 20) { addMessage('You need 20 qi to cast a sword seal.', 'bad'); return; }
    player.qi -= 20; player.talismanCd = 2.2; shake = 5;
    for (const e of enemies) if (e.alive && dist(player, e) < 112) {
      e.hp -= player.attack * .85 + 12; e.hit = .25;
      const a = Math.atan2(e.y - player.y, e.x - player.x); e.x += Math.cos(a) * 24; e.y += Math.sin(a) * 24;
      burst(e.x, e.y, '#74e8bd', 10, 90); if (e.hp <= 0) killEnemy(e);
    }
    for (let i = 0; i < 28; i++) {
      const a = i / 28 * TAU;
      particles.push({ x: player.x + Math.cos(a) * 18, y: player.y + Math.sin(a) * 18, vx: Math.cos(a) * 170, vy: Math.sin(a) * 170, life: .5, max: .5, color: '#7af0c2', size: 3 });
    }
  }

  function killEnemy(e) {
    e.alive = false; e.respawn = e.boss ? 999999 : 18 + hash(player.kills, 9) * 18; player.kills++;
    const t = enemyTypes[e.type]; gainXp(t.xp);
    if (hash(player.kills, Math.floor(playTime), 12) > .43) pickups.push({ x: e.x, y: e.y, type: 'stone', life: 24, bob: hash(e.x|0,e.y|0)*TAU });
    burst(e.x, e.y, t.color, 18, 105);
    addMessage(`${t.name} was defeated.`, 'good');
    if (e.boss) {
      bossDefeated = true; player.stones += 12; player.qi = player.maxQi;
      addMessage('Sectbreaker falls. The ruined inheritance is yours.', 'good'); flash = 1;
      reconcileQuestProgress(); save();
    }
    reconcileQuestProgress();
  }

  function gather() {
    const chest = treasures.find(t => !t.opened && dist(player, t) < 58);
    if (chest) {
      chest.opened = true; const reward = 3 + Math.floor(hash(chest.x, chest.y, 55) * 4);
      player.stones += reward; player.qi = Math.min(player.maxQi, player.qi + 20); gainXp(25);
      burst(chest.x, chest.y, '#f0cd72', 22, 95); addMessage(`Opened an ancient cache: ${reward} spirit stones.`, 'good'); reconcileQuestProgress(); save(); return;
    }
    const plant = plants.find(p => p.ready && dist(player, p) < 42);
    if (plant) {
      plant.ready = false; plant.respawn = 35; player.herbs++;
      burst(plant.x, plant.y, '#82c86b', 9, 45); addMessage('Gathered moonleaf herb.', 'good');
      if (player.herbs % 3 === 0) { player.hp = Math.min(player.maxHp, player.hp + 25); addMessage('Three herbs mend your wounds.', 'good'); }
      reconcileQuestProgress();
      return;
    }
    addMessage('No ripe spirit herb is within reach.');
  }

  function dash(dx, dy) {
    if (player.dashCd > 0 || player.meditating) return;
    if (!dx && !dy) { dx = Math.cos(player.facing); dy = Math.sin(player.facing); }
    const n = Math.hypot(dx, dy) || 1; dx /= n; dy /= n;
    const fromX = player.x, fromY = player.y;
    // Only the landing must be clear: cloud-step can cross terrain but never end inside it.
    for (let distance = DASH_DISTANCE; distance >= 0; distance -= 7) {
      const nx = clamp(fromX + dx * distance, player.r, WORLD_W * TILE - player.r);
      const ny = clamp(fromY + dy * distance, player.r, WORLD_H * TILE - player.r);
      if (!passableAt(nx, ny, player.r)) continue;
      player.x = nx; player.y = ny; break;
    }
    player.dashCd = dashCooldownDuration(); player.invuln = .48;
    for (let i = 0; i < 10; i++) particles.push({ x: lerp(fromX, player.x, i / 9), y: lerp(fromY, player.y, i / 9), vx: 0, vy: 0, life: .25 + i * .015, max: .4, color: '#baf5dc', size: 5 });
  }

  function handleActions() {
    if (taps.has(' ') || taps.has('j')) attack();
    if (taps.has('q')) useTalisman();
    if (taps.has('e')) gather();
    if (taps.has('c')) cultivate();
    taps.clear();
  }

  function update(dt) {
    if (!started || paused) return;
    playTime += dt;
    player.attackCd = Math.max(0, player.attackCd - dt); player.attackTimer = Math.max(0, player.attackTimer - dt);
    player.dashCd = Math.max(0, player.dashCd - dt); player.invuln = Math.max(0, player.invuln - dt); player.talismanCd = Math.max(0, player.talismanCd - dt);
    if (dev.noCooldowns) player.attackCd = player.dashCd = player.talismanCd = 0;
    player.meditating = false;

    let dx = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
    let dy = (keys.has('s') || keys.has('arrowdown') ? 1 : 0) - (keys.has('w') || keys.has('arrowup') ? 1 : 0);
    const dashPressed = taps.has('shift') || taps.has('k');
    if (dx || dy) {
      const n = Math.hypot(dx, dy); dx /= n; dy /= n; player.facing = Math.atan2(dy, dx);
      if (!dashPressed) moveEntity(player, dx * player.speed * dt, dy * player.speed * dt, player.r);
    }
    if (dashPressed) dash(dx, dy);
    handleActions();

    for (const e of enemies) {
      const t = enemyTypes[e.type];
      if (!e.alive) {
        if (e.boss && bossDefeated) continue;
        e.respawn -= dt;
        if (e.respawn <= 0) { const p = randomOpen((player.kills + Math.floor(playTime)) * 7 + enemies.indexOf(e)); Object.assign(e, p, { hp: t.hp, alive: true }); }
        continue;
      }
      e.hit = Math.max(0, e.hit - dt); e.attackCd -= dt;
      const d = dist(player, e);
      let a;
      if (d < 190) a = Math.atan2(player.y - e.y, player.x - e.x);
      else { e.wander += (hash(Math.floor(playTime / 2), enemies.indexOf(e), 3) - .5) * .12; a = e.wander; }
      const speed = t.speed * (d < 190 ? 1 : .28);
      moveEntity(e, Math.cos(a) * speed * dt, Math.sin(a) * speed * dt, t.r);
      if (d < player.r + t.r + 5 && e.attackCd <= 0 && player.invuln <= 0 && !dev.invulnerable) {
        e.attackCd = 1.05; player.hp -= t.damage; player.invuln = .55; shake = 7;
        burst(player.x, player.y, '#e96961', 10, 90); addMessage(`${t.name} strikes for ${t.damage}.`, 'bad');
        if (player.hp <= 0) {
          player.hp = player.maxHp; player.qi = Math.floor(player.qi * .75); player.x = 47.5 * TILE; player.y = 39 * TILE;
          addMessage('Your spirit returns to the Crossroads Shrine.', 'bad'); save();
        }
      }
    }

    for (const p of plants) if (!p.ready) { p.respawn -= dt; if (p.respawn <= 0) p.ready = true; }
    for (const p of pickups) { p.life -= dt; if (dist(player, p) < 21) { p.life = 0; player.stones++; player.qi = Math.min(player.maxQi, player.qi + 4); addMessage('Absorbed a spirit stone.', 'good'); } }
    pickups = pickups.filter(p => p.life > 0);
    for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .94; p.vy *= .94; p.life -= dt; }
    particles = particles.filter(p => p.life > 0); slashes.forEach(s => s.life -= dt); slashes = slashes.filter(s => s.life > 0);
    messages.forEach(m => m.life -= dt); const ml = messages.length; messages = messages.filter(m => m.life > 0); if (ml !== messages.length) ui.messages.innerHTML = messages.map(m => `<div class="msg ${m.type}">${m.text}</div>`).join('');
    shake *= .86; flash = Math.max(0, flash - dt * 1.2);

    const zn = zoneName();
    if (!player.discoveries.has(zn)) { player.discoveries.add(zn); addMessage(`Discovered: ${zn}`, 'good'); save(); }
    if (reconcileQuestProgress()) save();
    if (Math.floor(playTime) % 12 === 0 && Math.floor((playTime - dt)) % 12 !== 0) save();
    updateUI();
  }

  function updateUI() {
    ui.hpFill.style.width = `${100 * player.hp / player.maxHp}%`; ui.hpText.textContent = `${Math.ceil(player.hp)} / ${player.maxHp}`;
    ui.qiFill.style.width = `${100 * player.qi / player.maxQi}%`; ui.qiText.textContent = `${Math.floor(player.qi)} / ${player.maxQi} qi`;
    ui.xpFill.style.width = `${100 * player.xp / player.xpNeed}%`;
    ui.realm.textContent = `${realms[player.realm].name} Â· ${roman(player.stage)}`;
    const openedCaches = openedCacheCount();
    ui.stones.textContent = player.stones; ui.herbs.textContent = player.herbs; ui.kills.textContent = player.kills; ui.caches.textContent = `${openedCaches} / ${treasures.length}`; ui.zone.textContent = zoneName();
    const totalMins = (playTime * .42 + 330) % 1440, hour = Math.floor(totalMins / 60), day = 1 + Math.floor((playTime * .42 + 330) / 1440);
    const period = hour < 7 ? 'Dawn' : hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : hour < 20 ? 'Dusk' : 'Night';
    ui.time.textContent = `${period} Â· Day ${day}`;
    const veins = landmarks.filter(l => l.type === 'vein');
    const nearest = veins.reduce((best, v) => Math.hypot(player.x / TILE - v.x, player.y / TILE - v.y) < Math.hypot(player.x / TILE - best.x, player.y / TILE - best.y) ? v : best, veins[0]);
    const veinAngle = Math.atan2(nearest.y * TILE - player.y, nearest.x * TILE - player.x);
    const veinDistance = Math.round(Math.hypot(nearest.x * TILE - player.x, nearest.y * TILE - player.y) / TILE);
    ui.compassArrow.style.transform = `rotate(${veinAngle + Math.PI / 2}rad)`;
    const nearVein = Math.hypot(player.x / TILE - (nearest.x + .5), player.y / TILE - (nearest.y + .5)) < 2.25;
    ui.compassText.textContent = nearVein ? 'Inside a spirit vein â€” press C to cultivate' : `Nearest spirit vein Â· ${veinDistance} steps`;
    const q = [
      'Follow the <em>spirit compass</em> to a green beacon, then press <em>C</em>.',
      'Hunt a spirit beast. Strike with <em>Space</em>.',
      'Gather <em>3 moonleaf herbs</em> and survive the wilds.',
      `Fill your qi to break through. <em>${Math.floor(player.qi)} / ${player.maxQi}</em>`,
      `Ancient caches are gold-lidded chests in each named region. Approach and press <em>E</em>. <em>${openedCaches} / ${treasures.length}</em> opened.`,
      'Travel southeast to the <em>Ruins of the Fallen Sect</em> and defeat the Sectbreaker Golem.',
      'The fallen sect is reclaimed. Seek every secret and cultivate further.'
    ];
    ui.questText.innerHTML = q[quest] || q[6];
    const nearbyChest = treasures.find(t => !t.opened && dist(player, t) < 58);
    const nearbyHerb = plants.find(p => p.ready && dist(player, p) < 42);
    let prompt = '';
    if (nearbyChest) prompt = 'E Â· Open ancient cache';
    else if (nearbyHerb) prompt = 'E Â· Gather glowing moonleaf';
    else if (nearVein) prompt = 'C Â· Cultivate in the spirit vein';
    ui.interactPrompt.textContent = prompt;
    ui.interactPrompt.classList.toggle('show', !!prompt);
  }

  function roman(n) { return ['I','II','III','IV','V'][n - 1] || String(n); }

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

  function drawLandmarks(cam, time) {
    for (const l of landmarks) {
      if (l.type !== 'vein') continue;
      const s = screenPos((l.x + .5) * TILE, (l.y + .5) * TILE, cam);
      const glow = .15 + Math.sin(time * 3 + l.x) * .05;
      const g = ctx.createLinearGradient(0, s.y - 150, 0, s.y + 14);
      g.addColorStop(0, 'rgba(105,255,196,0)'); g.addColorStop(1, `rgba(105,255,196,${glow})`);
      ctx.fillStyle = g; ctx.fillRect(s.x - 18, s.y - 150, 36, 164);
      ctx.strokeStyle = '#83f0c1aa'; ctx.strokeRect(s.x - 12, s.y - 12, 24, 24);
    }
    for (const a of areas) {
      const s = screenPos(a.x * TILE, a.y * TILE, cam);
      if (s.x < -100 || s.y < -100 || s.x > W + 100 || s.y > H + 100) continue;
      ctx.fillStyle = '#080b10aa'; ctx.fillRect(s.x - 70, s.y - a.r * TILE + 8, 140, 17);
      ctx.fillStyle = '#ead696'; ctx.font = '12px Georgia'; ctx.textAlign = 'center'; ctx.fillText(a.name, s.x, s.y - a.r * TILE + 21);
      if (a.icon === 'monastery' || a.icon === 'ruins') {
        ctx.fillStyle = a.icon === 'ruins' ? '#544a46' : '#704843';
        ctx.fillRect(s.x - 30, s.y - 20, 60, 36); ctx.fillStyle = '#302a2b'; ctx.fillRect(s.x - 36, s.y - 25, 72, 7);
        ctx.fillStyle = '#d2aa63'; ctx.fillRect(s.x - 4, s.y - 6, 8, 22);
        if (a.icon === 'ruins') { ctx.clearRect(s.x + 12, s.y - 20, 9, 12); ctx.fillStyle = '#827263'; ctx.fillRect(s.x - 24, s.y - 32, 5, 12); }
      } else if (a.icon === 'swords') {
        ctx.strokeStyle = '#c4c9c5'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(s.x - 12,s.y - 24);ctx.lineTo(s.x + 10,s.y + 20);ctx.moveTo(s.x + 12,s.y - 24);ctx.lineTo(s.x - 10,s.y + 20);ctx.stroke();
      } else if (a.icon === 'lotus') {
        ctx.fillStyle = '#eaa9c2'; ctx.fillRect(s.x - 8, s.y - 5, 16, 10); ctx.fillStyle = '#f5d3df'; ctx.fillRect(s.x - 3, s.y - 9, 6, 15);
      } else {
        ctx.fillStyle = '#6ca75a'; for (let i=0;i<5;i++) ctx.fillRect(s.x - 28 + i * 13, s.y - 32 - (i%2)*8, 4, 52);
      }
    }
    for (const t of treasures) {
      if (t.opened) continue; const s = screenPos(t.x,t.y,cam);
      ctx.globalAlpha = .2 + Math.sin(time * 4 + t.x) * .06; ctx.fillStyle = '#ffd66d'; ctx.fillRect(s.x - 16,s.y - 14,32,27); ctx.globalAlpha = 1;
      ctx.fillStyle = '#1b1610'; ctx.fillRect(s.x - 13,s.y - 6,26,16); ctx.fillStyle = '#bd8738'; ctx.fillRect(s.x - 12,s.y - 11,24,8); ctx.fillStyle = '#ffe18a'; ctx.fillRect(s.x - 3,s.y - 5,6,8);
    }
  }

  function drawEnemy(e, cam, time) {
    if (!e.alive) return; const t = enemyTypes[e.type], s = screenPos(e.x, e.y, cam); if (s.x < -30 || s.y < -30 || s.x > W + 30 || s.y > H + 30) return;
    ctx.fillStyle = '#0006'; ctx.fillRect(s.x - t.r, s.y + t.r - 3, t.r * 2, 5);
    ctx.fillStyle = e.hit ? '#fff2bf' : t.color;
    if (e.type === 'wisp') {
      const bob = Math.sin(time * 5 + e.x) * 3; ctx.fillRect(s.x - 6, s.y - 7 + bob, 12, 12); ctx.fillStyle = '#b6ffe9'; ctx.fillRect(s.x - 3, s.y - 4 + bob, 6, 6);
    } else if (e.type === 'guardian') {
      ctx.fillRect(s.x - 11, s.y - 12, 22, 24); ctx.fillStyle = '#55483d'; ctx.fillRect(s.x - 8, s.y - 4, 5, 4); ctx.fillRect(s.x + 3, s.y - 4, 5, 4);
    } else {
      ctx.fillRect(s.x - t.r, s.y - t.r + 3, t.r * 2, t.r * 2 - 3); ctx.fillRect(s.x - 5, s.y - t.r - 4, 4, 7); ctx.fillRect(s.x + 3, s.y - t.r - 4, 4, 7);
      ctx.fillStyle = '#f1c35d'; ctx.fillRect(s.x - 4, s.y - 3, 2, 2); ctx.fillRect(s.x + 3, s.y - 3, 2, 2);
    }
    if (e.hp < e.maxHp) { ctx.fillStyle = '#1a1719'; ctx.fillRect(s.x - 14, s.y - t.r - 10, 28, 3); ctx.fillStyle = '#d55c55'; ctx.fillRect(s.x - 14, s.y - t.r - 10, 28 * e.hp / e.maxHp, 3); }
    if (e.boss) { ctx.fillStyle = '#f0c96f'; ctx.font = '12px Georgia'; ctx.textAlign = 'center'; ctx.fillText(e.title, s.x, s.y - t.r - 17); }
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
    ctx.fillStyle = '#d9e2de'; ctx.fillRect(Math.round(s.x + fx * 9 - 1), Math.round(s.y + fy * 9 - 1), 3 + Math.abs(fx) * 8, 3 + Math.abs(fy) * 8);
    ctx.globalAlpha = 1;
  }

  function drawMinimap(cam) {
    const mw = 126, mh = 88, x0 = W - mw - 14, y0 = H - mh - 15;
    ctx.fillStyle = '#080c12d9'; ctx.fillRect(x0 - 5, y0 - 5, mw + 10, mh + 10); ctx.strokeStyle = '#cbb87866'; ctx.strokeRect(x0 - 5.5, y0 - 5.5, mw + 11, mh + 11);
    for (let y = 0; y < WORLD_H; y += 3) for (let x = 0; x < WORLD_W; x += 3) {
      const type = map[y][x]; ctx.fillStyle = colors[type]?.[0] || '#334'; ctx.fillRect(x0 + x / WORLD_W * mw, y0 + y / WORLD_H * mh, 4, 4);
    }
    for (const l of landmarks) { ctx.fillStyle = l.type === 'vein' ? '#73f0bd' : '#e8c76d'; ctx.fillRect(x0 + l.x / WORLD_W * mw - 2, y0 + l.y / WORLD_H * mh - 2, 5, 5); }
    for (const a of areas) { ctx.strokeStyle = '#f0d18b'; ctx.strokeRect(x0 + a.x / WORLD_W * mw - 2.5, y0 + a.y / WORLD_H * mh - 2.5, 5, 5); }
    ctx.fillStyle = '#ffe18a'; ctx.fillRect(x0 + player.x / (WORLD_W * TILE) * mw - 2, y0 + player.y / (WORLD_H * TILE) * mh - 2, 5, 5);
    ctx.strokeStyle = '#ffffff38'; ctx.strokeRect(x0 + cam.x / (WORLD_W * TILE) * mw, y0 + cam.y / (WORLD_H * TILE) * mh, W / (WORLD_W * TILE) * mw, H / (WORLD_H * TILE) * mh);
  }

  function draw(timeMs) {
    const time = timeMs / 1000;
    const targetX = clamp(player.x - W / 2, 0, WORLD_W * TILE - W), targetY = clamp(player.y - H / 2, 0, WORLD_H * TILE - H);
    const cam = { x: Math.round(targetX + (Math.random() - .5) * shake), y: Math.round(targetY + (Math.random() - .5) * shake) };
    ctx.fillStyle = '#17231f'; ctx.fillRect(0, 0, W, H);
    const x0 = Math.floor(cam.x / TILE), y0 = Math.floor(cam.y / TILE), x1 = Math.ceil((cam.x + W) / TILE), y1 = Math.ceil((cam.y + H) / TILE);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (x >= 0 && y >= 0 && x < WORLD_W && y < WORLD_H) drawTile(map[y][x], x * TILE - cam.x, y * TILE - cam.y, x, y, time);
    drawLandmarks(cam, time);
    plants.forEach(p => drawPlant(p, cam, time));
    pickups.forEach(p => { const s = screenPos(p.x, p.y, cam), b = Math.sin(time * 5 + p.bob) * 3; ctx.fillStyle = '#07110eaa'; ctx.fillRect(s.x - 6, s.y + 6, 12, 3); ctx.fillStyle = '#79e1b7'; ctx.fillRect(s.x - 4, s.y - 5 + b, 8, 9); ctx.fillStyle = '#c8ffe9'; ctx.fillRect(s.x - 1, s.y - 3 + b, 3, 4); });
    enemies.slice().sort((a,b)=>a.y-b.y).forEach(e => drawEnemy(e, cam, time));
    drawPlayer(cam);
    slashes.forEach(slash => { const p = screenPos(slash.x, slash.y, cam); ctx.strokeStyle = `rgba(255,230,167,${slash.life / .18})`; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(p.x, p.y, 31, slash.a - .8, slash.a + .8); ctx.stroke(); });
    particles.forEach(p => { const s = screenPos(p.x,p.y,cam); ctx.globalAlpha = clamp(p.life / p.max, 0, 1); ctx.fillStyle = p.color; ctx.fillRect(s.x, s.y, p.size, p.size); }); ctx.globalAlpha = 1;

    // Time-of-day tint and a soft vignette.
    const cycle = ((playTime * .42 + 330) % 1440) / 1440, sun = Math.max(0, Math.sin((cycle - .22) * TAU));
    ctx.fillStyle = `rgba(7,12,30,${.34 * (1 - sun)})`; ctx.fillRect(0,0,W,H);
    const vg = ctx.createRadialGradient(W/2,H/2,H*.25,W/2,H/2,H*.82); vg.addColorStop(0,'transparent'); vg.addColorStop(1,'rgba(0,0,0,.4)'); ctx.fillStyle = vg; ctx.fillRect(0,0,W,H);
    drawMinimap(cam);
    if (flash > 0) { ctx.fillStyle = `rgba(240,220,144,${flash * .38})`; ctx.fillRect(0,0,W,H); }
  }

  function updateDevStatus() {
    if (!ui.devStatus) return;
    ui.devStatus.textContent = [
      `Tile: ${(player.x / TILE).toFixed(1)}, ${(player.y / TILE).toFixed(1)} | ${zoneName()}`,
      `Realm: ${realms[player.realm].name} ${roman(player.stage)} | Quest: ${quest} / 6`,
      `HP: ${Math.ceil(player.hp)} / ${player.maxHp} | Qi: ${Math.floor(player.qi)} / ${player.maxQi}`,
      `Caches: ${openedCacheCount()} / ${treasures.length} | Boss defeated: ${bossDefeated}`,
      `Dash cooldown: ${dashCooldownDuration().toFixed(3)}s | Invulnerable: ${dev.invulnerable} | No cooldowns: ${dev.noCooldowns}`
    ].join('\n');
  }

  function openMenu(name) {
    if (activeMenu === name) return;
    if (activeMenu) closeMenu();
    menuWasPaused = paused; paused = true; activeMenu = name;
    releaseAllInputs();
    const menu = name === 'settings' ? ui.settingsMenu : ui.devMenu;
    menu.hidden = false;
    if (name === 'dev') updateDevStatus();
    const focusTarget = menu.querySelector('button');
    if (focusTarget) focusTarget.focus();
  }

  function closeMenu() {
    if (!activeMenu) return;
    const menu = activeMenu === 'settings' ? ui.settingsMenu : ui.devMenu;
    menu.hidden = true; activeMenu = null; paused = menuWasPaused;
    ui.clearConfirm.hidden = true;
    releaseAllInputs(); canvas.focus();
  }

  function safeTeleport(tx, ty) {
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

  const travelTargets = {
    crossroads: [47, 39], 'vein-nw': [14, 13], 'vein-ne': [80, 13], 'vein-sw': [14, 58], 'vein-se': [81, 57],
    grove: [18, 12], monastery: [77, 15], mere: [17, 56], grave: [47, 9], ruins: [78, 56]
  };

  function runDevAction(action) {
    let persist = true, reconcile = true;
    const boss = enemies.find(e => e.boss);
    switch (action) {
      case 'heal': player.hp = player.maxHp; break;
      case 'refill-qi': player.qi = player.maxQi; break;
      case 'add-herbs': player.herbs += 10; break;
      case 'add-stones': player.stones += 25; break;
      case 'add-xp': gainXp(player.xpNeed); break;
      case 'advance-cultivation':
        if (player.realm === realms.length - 1 && player.stage === realms[player.realm].stages) addMessage('Already at the current cultivation limit.');
        else { player.qi = player.maxQi; breakthrough(); }
        break;
      case 'toggle-invulnerable': dev.invulnerable = !dev.invulnerable; persist = false; break;
      case 'toggle-cooldowns': dev.noCooldowns = !dev.noCooldowns; persist = false; break;
      case 'quest-prev': quest = Math.max(0, quest - 1); reconcile = false; break;
      case 'quest-next': quest = Math.min(6, quest + 1); reconcile = false; break;
      case 'reconcile': break;
      case 'open-caches': treasures.forEach(t => { t.opened = true; }); break;
      case 'reset-caches': treasures.forEach(t => { t.opened = false; }); reconcile = false; break;
      case 'defeat-boss':
        if (boss && boss.alive) killEnemy(boss);
        else { bossDefeated = true; if (boss) boss.alive = false; }
        break;
      case 'respawn-boss':
        bossDefeated = false;
        if (boss) Object.assign(boss, { x: 78 * TILE, y: 56 * TILE, hp: boss.maxHp, alive: true, respawn: 99999 });
        reconcile = false; break;
      case 'dawn': setWorldMinute(360); break;
      case 'noon': setWorldMinute(720); break;
      case 'night': setWorldMinute(1260); break;
      case 'save-now': save(); persist = false; break;
      case 'reload-save': location.reload(); return;
      default: persist = false;
    }
    if (reconcile) reconcileQuestProgress();
    updateUI(); updateDevStatus();
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
    if (activeMenu) {
      if (e.key === 'Escape') { e.preventDefault(); closeMenu(); }
      return;
    }
    const k = e.key.toLowerCase();
    if ([' ','arrowup','arrowdown','arrowleft','arrowright'].includes(k)) e.preventDefault();
    if (!keys.has(k)) taps.add(k); keyboardKeys.add(k); keys.add(k);
    if (k === 'escape' && started) { paused = !paused; addMessage(paused ? 'The world waits.' : 'The journey continues.'); }
  });
  addEventListener('keyup', e => {
    const k = e.key.toLowerCase(); keyboardKeys.delete(k);
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
  document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAllInputs(); });
  document.querySelectorAll('[data-key]').forEach(btn => {
    const k = btn.dataset.key;
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
  ui.settingsButton.addEventListener('click', () => openMenu('settings'));
  ui.closeSettings.addEventListener('click', closeMenu);
  ui.closeDev.addEventListener('click', closeMenu);
  ui.clearProgress.addEventListener('click', () => { ui.clearConfirm.hidden = false; ui.confirmClear.focus(); });
  ui.cancelClear.addEventListener('click', () => { ui.clearConfirm.hidden = true; ui.clearProgress.focus(); });
  ui.confirmClear.addEventListener('click', () => {
    try {
      suppressSave = true; localStorage.removeItem(SAVE_KEY); location.reload();
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
    if (target && safeTeleport(target[0], target[1])) { updateUI(); updateDevStatus(); save(); }
  });
  ui.start.addEventListener('click', () => { started = true; ui.overlay.hidden = true; canvas.focus(); addMessage('The Verdant Star stirs above the silent sect.', 'good'); updateUI(); });
  addEventListener('beforeunload', () => { if (!suppressSave) save(); });

  const hadSave = load();
  populate();
  const questRepaired = reconcileQuestProgress();
  if (hadSave && (loadedSaveVersion < SAVE_VERSION || questRepaired)) save();
  updateUI(); requestAnimationFrame(frame);
})();
