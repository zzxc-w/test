const TILE = 32;
const VIEW_W = 640;
const VIEW_H = 480;

// '#' rock (solid), '.' open ground, 'V' spirit vein
const MAP = [
  '##############################',
  '#............................#',
  '#....####..............####..#',
  '#....#.................#.....#',
  '#....#....V............#.....#',
  '#....#.................#.....#',
  '#....###########.......#######',
  '#......................#.....#',
  '#......................#.....#',
  '#####........####............#',
  '#............#..#............#',
  '#............#..#.....V......#',
  '#............#..#............#',
  '#......V.....####............#',
  '#............................#',
  '#########........#############',
  '#................#...........#',
  '#................#...........#',
  '#......####......#.....V.....#',
  '#......#..#..............#...#',
  '#......#..#..................#',
  '##############################',
];

const MAP_W = MAP[0].length * TILE;
const MAP_H = MAP.length * TILE;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const player = { x: 2 * TILE + 7, y: 2 * TILE + 7, w: 18, h: 18, speed: 130 };

const keys = new Set();
const MOVE_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
addEventListener('keydown', (e) => {
  if (MOVE_KEYS.includes(e.key)) e.preventDefault();
  keys.add(e.key.toLowerCase());
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

function tileAt(px, py) {
  const c = Math.floor(px / TILE);
  const r = Math.floor(py / TILE);
  if (r < 0 || r >= MAP.length || c < 0 || c >= MAP[0].length) return '#';
  return MAP[r][c];
}

function blocked(x, y) {
  return (
    tileAt(x, y) === '#' ||
    tileAt(x + player.w - 1, y) === '#' ||
    tileAt(x, y + player.h - 1) === '#' ||
    tileAt(x + player.w - 1, y + player.h - 1) === '#'
  );
}

function held(...names) {
  return names.some((n) => keys.has(n));
}

function update(dt) {
  let dx = 0;
  let dy = 0;
  if (held('a', 'arrowleft')) dx -= 1;
  if (held('d', 'arrowright')) dx += 1;
  if (held('w', 'arrowup')) dy -= 1;
  if (held('s', 'arrowdown')) dy += 1;

  if (dx && dy) {
    const inv = Math.SQRT1_2;
    dx *= inv;
    dy *= inv;
  }

  const nx = player.x + dx * player.speed * dt;
  if (!blocked(nx, player.y)) player.x = nx;

  const ny = player.y + dy * player.speed * dt;
  if (!blocked(player.x, ny)) player.y = ny;
}

function onVein() {
  return tileAt(player.x + player.w / 2, player.y + player.h / 2) === 'V';
}

function draw(time) {
  const camX = Math.max(0, Math.min(player.x + player.w / 2 - VIEW_W / 2, MAP_W - VIEW_W));
  const camY = Math.max(0, Math.min(player.y + player.h / 2 - VIEW_H / 2, MAP_H - VIEW_H));

  ctx.fillStyle = '#0d1119';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.save();
  ctx.translate(-Math.round(camX), -Math.round(camY));

  const c0 = Math.floor(camX / TILE);
  const c1 = Math.min(MAP[0].length - 1, Math.floor((camX + VIEW_W) / TILE));
  const r0 = Math.floor(camY / TILE);
  const r1 = Math.min(MAP.length - 1, Math.floor((camY + VIEW_H) / TILE));

  const pulse = 0.55 + 0.45 * Math.sin(time / 620);

  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const t = MAP[r][c];
      const x = c * TILE;
      const y = r * TILE;

      if (t === '#') {
        ctx.fillStyle = '#2c3446';
        ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = '#3d4860';
        ctx.fillRect(x, y, TILE, 5);
      } else {
        ctx.fillStyle = (r + c) % 2 ? '#151b26' : '#181f2c';
        ctx.fillRect(x, y, TILE, TILE);

        if (t === 'V') {
          ctx.fillStyle = '#1b3f39';
          ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
          ctx.globalAlpha = pulse;
          ctx.fillStyle = '#4ade9f';
          ctx.fillRect(x + 11, y + 8, 10, 16);
          ctx.globalAlpha = 1;
        }
      }
    }
  }

  ctx.fillStyle = '#d6564a';
  ctx.fillRect(Math.round(player.x), Math.round(player.y), player.w, player.h);

  ctx.restore();

  if (onVein()) {
    ctx.fillStyle = 'rgba(13,17,25,0.85)';
    ctx.fillRect(0, VIEW_H - 44, VIEW_W, 44);
    ctx.fillStyle = '#8fd9bd';
    ctx.font = '16px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('Spirit qi gathers here.', VIEW_W / 2, VIEW_H - 17);
  }
}

let last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  update(dt);
  draw(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
