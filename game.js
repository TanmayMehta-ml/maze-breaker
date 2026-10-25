(() => {
'use strict';

// ---------- constants ----------
const W = 36;            // arena width in cells
const H = 36;            // arena height in cells
const VH = 52;           // total view height (arena + paddle zone)
const EMPTY = 0, BRICK = 1, STONE = 2;
const R = 0.42;          // ball radius
const PY = VH - 5;       // paddle top
const PH = 0.9;          // paddle height
const BASE_SPEED = 16;   // cells / second
const MAX_BALLS = 40;
const DROP_CHANCE = 0.18;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const overlay = document.getElementById('overlay');
const ovTitle = document.getElementById('ov-title');
const ovText = document.getElementById('ov-text');
const ovBtn = document.getElementById('ov-btn');

let scale = 1;
function resize() {
  const s = Math.min(innerWidth / W, innerHeight / VH);
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = W * s + 'px';
  canvas.style.height = VH * s + 'px';
  canvas.width = Math.round(W * s * dpr);
  canvas.height = Math.round(VH * s * dpr);
  scale = canvas.width / W;
}
addEventListener('resize', resize);
resize();

// ---------- levels ----------
function blank() {
  const g = [];
  for (let y = 0; y < H; y++) {
    g.push(new Uint8Array(W));
    for (let x = 0; x < W; x++) {
      const edge = x === 0 || y === 0 || x === W - 1 || y === H - 1;
      g[y][x] = edge ? STONE : BRICK;
    }
  }
  return g;
}
function rect(g, x0, y0, x1, y1, v) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) g[y][x] = v;
}
function outline(g, a, b, v) {
  rect(g, a, a, b, a, v); rect(g, a, b, b, b, v);
  rect(g, a, a, a, b, v); rect(g, b, a, b, b, v);
}

const LEVELS = [
  {
    name: 'The Funnel',
    build(g) {
      rect(g, 17, H - 1, 18, H - 1, EMPTY);                 // entrance
      rect(g, 16, H - 12, 16, H - 2, STONE);                // corridor walls
      rect(g, 19, H - 12, 19, H - 2, STONE);
      rect(g, 17, H - 11, 18, H - 2, EMPTY);                // corridor
      rect(g, 6, 10, 10, 10, STONE);
      rect(g, 25, 14, 29, 14, STONE);
      rect(g, 8, 20, 8, 25, STONE);
      rect(g, 27, 22, 27, 27, STONE);
      rect(g, 14, 6, 21, 6, STONE);
    },
  },
  {
    name: 'Rings',
    build(g) {
      rect(g, 17, H - 1, 18, H - 1, EMPTY);
      rect(g, 5, H - 1, 6, H - 1, EMPTY);
      outline(g, 5, 30, STONE);
      rect(g, 17, 30, 18, 30, EMPTY);                       // ring 1 gap (bottom)
      outline(g, 11, 24, STONE);
      rect(g, 17, 11, 18, 11, EMPTY);                       // ring 2 gap (top)
      rect(g, 16, 16, 19, 19, STONE);                       // core
    },
  },
  {
    name: 'Serpentine',
    build(g) {
      rect(g, 17, H - 1, 18, H - 1, EMPTY);
      [25, 19, 13, 7].forEach((y, i) => {
        rect(g, 1, y, W - 2, y, STONE);
        if (i % 2 === 0) rect(g, 1, y, 5, y, EMPTY);        // gap on the left
        else rect(g, W - 6, y, W - 2, y, EMPTY);            // gap on the right
      });
    },
  },
  {
    name: 'Fortress',
    build(g) {
      rect(g, 8, H - 1, 9, H - 1, EMPTY);
      rect(g, 26, H - 1, 27, H - 1, EMPTY);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
        if ((i + j) % 2 === 0) rect(g, 4 + 8 * i, 4 + 8 * j, 7 + 8 * i, 7 + 8 * j, STONE);
      }
    },
  },
];

// Remove bricks the ball could never reach (walled off by concrete).
function pruneUnreachable(g) {
  const seen = new Set();
  const q = [];
  for (let x = 0; x < W; x++) if (g[H - 1][x] === EMPTY) { q.push([x, H - 1]); seen.add((H - 1) * W + x); }
  while (q.length) {
    const [x, y] = q.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const k = ny * W + nx;
      if (seen.has(k) || g[ny][nx] === STONE) continue;
      seen.add(k); q.push([nx, ny]);
    }
  }
  let count = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (g[y][x] === BRICK) { if (seen.has(y * W + x)) count++; else g[y][x] = EMPTY; }
  }
  return count;
}

// ---------- power-ups ----------
const POWERS = [
  { id: 'plus1', label: '+1', color: '#4fc3f7', weight: 30 },
  { id: 'plus3', label: '+3', color: '#29b6f6', weight: 18 },
  { id: 'wide',  label: '↔',  color: '#81c784', weight: 18 },
  { id: 'power', label: '⚡', color: '#ffb74d', weight: 12 },
  { id: 'slow',  label: '🐢', color: '#ba68c8', weight: 10 },
  { id: 'boom',  label: '💥', color: '#ef5350', weight: 12 },
];
const TOTAL_WEIGHT = POWERS.reduce((s, p) => s + p.weight, 0);
function randomPower() {
  let r = Math.random() * TOTAL_WEIGHT;
  for (const p of POWERS) { if ((r -= p.weight) < 0) return p; }
  return POWERS[0];
}

// ---------- state ----------
let state = 'menu';      // menu | playing | paused | clear | over
let level = 0, score = 0, lives = 3;
let best = 0;
try { best = +localStorage.getItem('mazebreaker-best') || 0; } catch (e) {}
let grid, bricksLeft = 0, totalBricks = 0;
let balls = [], drops = [], particles = [];
const paddle = { x: W / 2, w: 7, target: W / 2 };
const fx = { wide: 0, power: 0, slow: 0, boom: 0 };
let sinceBrick = 0;
let muted = false;

function levelSpeed() { return BASE_SPEED * Math.min(1.6, 1 + 0.06 * level); }
function ballSpeed() { return levelSpeed() * (fx.slow > 0 ? 0.65 : 1); }

function loadLevel(n) {
  level = n;
  grid = blank();
  LEVELS[n % LEVELS.length].build(grid);
  totalBricks = bricksLeft = pruneUnreachable(grid);
  drops = []; particles = [];
  fx.wide = fx.power = fx.slow = fx.boom = 0;
  paddle.w = 7;
  resetBalls();
}
function resetBalls() {
  balls = [{ x: paddle.x, y: PY - R, vx: 0, vy: 0, held: true }];
  sinceBrick = 0;
}

// ---------- audio ----------
let actx = null, lastBeep = 0;
function beep(freq, dur = 0.06, type = 'square', vol = 0.04) {
  if (muted) return;
  const now = performance.now();
  if (now - lastBeep < 25) return;
  lastBeep = now;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
    o.connect(g); g.connect(actx.destination);
    o.start(); o.stop(actx.currentTime + dur);
  } catch (e) {}
}

// ---------- overlay ----------
let overlayAction = null;
function showOverlay(title, text, btn, action) {
  ovTitle.textContent = title; ovText.textContent = text; ovBtn.textContent = btn;
  overlayAction = action;
  overlay.classList.remove('hidden');
}
function hideOverlay() { overlay.classList.add('hidden'); overlayAction = null; }
ovBtn.addEventListener('click', () => overlayAction && overlayAction());

function startGame() {
  score = 0; lives = 3;
  loadLevel(0);
  state = 'playing';
  hideOverlay();
}
function nextLevel() {
  loadLevel(level + 1);
  state = 'playing';
  hideOverlay();
}
function endGame() {
  state = 'over';
  if (score > best) { best = score; try { localStorage.setItem('mazebreaker-best', best); } catch (e) {} }
  showOverlay('GAME OVER', `Score: ${score}\nBest: ${best}`, 'Play again', startGame);
}
function winLevel() {
  state = 'clear';
  score += 200 + lives * 100;
  beep(660, 0.15, 'triangle', 0.08);
  showOverlay('LEVEL CLEAR!', `Maze cleared!\nScore: ${score}`, 'Next level', nextLevel);
}
function togglePause() {
  if (state === 'playing') { state = 'paused'; showOverlay('PAUSED', 'Take a breather.', 'Resume', togglePause); }
  else if (state === 'paused') { state = 'playing'; hideOverlay(); }
}

// ---------- bricks / drops ----------
function destroyBrick(cx, cy, canDrop = true) {
  if (grid[cy][cx] !== BRICK) return;
  grid[cy][cx] = EMPTY;
  bricksLeft--; score += 10; sinceBrick = 0;
  beep(300 + Math.random() * 300, 0.04);
  for (let i = 0; i < 4; i++) {
    particles.push({ x: cx + 0.5, y: cy + 0.5, vx: (Math.random() - 0.5) * 8, vy: (Math.random() - 0.5) * 8, life: 0.5, c: '#8a4b27' });
  }
  if (canDrop && Math.random() < DROP_CHANCE) {
    drops.push({ x: cx + 0.5, y: cy + 0.5, p: randomPower() });
  }
}
function explode(cx, cy) {
  for (let y = cy - 2; y <= cy + 2; y++) for (let x = cx - 2; x <= cx + 2; x++) {
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    if ((x - cx) ** 2 + (y - cy) ** 2 <= 5) destroyBrick(x, y, false);
  }
  for (let i = 0; i < 14; i++) {
    particles.push({ x: cx + 0.5, y: cy + 0.5, vx: (Math.random() - 0.5) * 20, vy: (Math.random() - 0.5) * 20, life: 0.4, c: '#ff7043' });
  }
  beep(110, 0.15, 'sawtooth', 0.06);
}
function hitBrick(cx, cy) {
  destroyBrick(cx, cy);
  if (fx.boom > 0) explode(cx, cy);
}

function spawnBalls(n) {
  const src = balls.find(b => !b.held);
  for (let i = 0; i < n && balls.length < MAX_BALLS; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.2;
    const sp = ballSpeed();
    balls.push({
      x: src ? src.x : paddle.x,
      y: src ? src.y : PY - 1,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, held: false,
    });
  }
  const held = balls.find(b => b.held);
  if (held && src === undefined) launch();
}
function applyPower(p) {
  beep(880, 0.1, 'triangle', 0.07);
  score += 25;
  switch (p.id) {
    case 'plus1': spawnBalls(1); break;
    case 'plus3': spawnBalls(3); break;
    case 'wide': fx.wide = 14; break;
    case 'power': fx.power = 8; break;
    case 'slow': fx.slow = 10; break;
    case 'boom': fx.boom = 10; break;
  }
}

// ---------- ball physics ----------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function resolveCells(b, axis, px, py) {
  const x0 = Math.floor(b.x - R), x1 = Math.floor(b.x + R);
  const y0 = Math.floor(b.y - R), y1 = Math.floor(b.y + R);
  let bounce = false;
  const hits = [];
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
    if (cx < 0 || cx >= W || cy < 0 || cy >= H) continue;
    const t = grid[cy][cx];
    if (!t) continue;
    const dx = b.x - clamp(b.x, cx, cx + 1), dy = b.y - clamp(b.y, cy, cy + 1);
    if (dx * dx + dy * dy >= R * R) continue;
    if (t === STONE) bounce = true;
    else { hits.push([cx, cy]); if (fx.power <= 0) bounce = true; }
  }
  for (const [cx, cy] of hits) hitBrick(cx, cy);
  if (bounce) {
    if (axis === 'x') { b.x = px; b.vx = -b.vx; } else { b.y = py; b.vy = -b.vy; }
    beep(200, 0.03, 'square', 0.02);
  }
}

function stepBall(b, dt) {
  const sp = ballSpeed();
  let m = Math.hypot(b.vx, b.vy) || 1;
  b.vx *= sp / m; b.vy *= sp / m;
  // never let a ball travel (almost) horizontally forever
  const minV = sp * 0.22;
  if (Math.abs(b.vy) < minV) {
    b.vy = (b.vy < 0 ? -1 : 1) * minV;
    m = Math.hypot(b.vx, b.vy); b.vx *= sp / m; b.vy *= sp / m;
  }
  const n = Math.max(1, Math.ceil(sp * dt / 0.2));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    let px = b.x, py = b.y;
    b.x += b.vx * h;
    if (b.x < R) { b.x = R; b.vx = Math.abs(b.vx); }
    else if (b.x > W - R) { b.x = W - R; b.vx = -Math.abs(b.vx); }
    resolveCells(b, 'x', px, py);
    px = b.x; py = b.y;
    b.y += b.vy * h;
    if (b.y < R) { b.y = R; b.vy = Math.abs(b.vy); }
    resolveCells(b, 'y', px, py);

    // paddle
    if (b.vy > 0 && b.y + R >= PY && b.y - R <= PY + PH && Math.abs(b.x - paddle.x) <= paddle.w / 2 + R) {
      const rel = clamp((b.x - paddle.x) / (paddle.w / 2), -1, 1);
      const ang = rel * 1.1;
      b.vx = Math.sin(ang) * sp; b.vy = -Math.cos(ang) * sp;
      b.y = PY - R;
      beep(520, 0.05, 'triangle', 0.05);
    }
  }
}

function launch() {
  const b = balls.find(x => x.held);
  if (!b) return;
  b.held = false;
  const a = -Math.PI / 2 + (Math.random() - 0.5) * 0.5;
  const sp = ballSpeed();
  b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp;
  beep(440, 0.08, 'triangle', 0.05);
}

// ---------- update ----------
const keys = { left: false, right: false };

function update(dt) {
  // timers
  for (const k in fx) if (fx[k] > 0) fx[k] = Math.max(0, fx[k] - dt);

  // paddle
  if (keys.left) paddle.target -= 32 * dt;
  if (keys.right) paddle.target += 32 * dt;
  const wantW = fx.wide > 0 ? 11 : 7;
  paddle.w += (wantW - paddle.w) * Math.min(1, dt * 10);
  paddle.target = clamp(paddle.target, paddle.w / 2, W - paddle.w / 2);
  paddle.x += (paddle.target - paddle.x) * Math.min(1, dt * 30);
  paddle.x = clamp(paddle.x, paddle.w / 2, W - paddle.w / 2);

  // balls
  for (const b of balls) {
    if (b.held) { b.x = paddle.x; b.y = PY - R; }
    else stepBall(b, dt);
  }
  balls = balls.filter(b => b.held || b.y < VH - 1.2);

  // anti-stall: if nothing breaks for a while, nudge the balls
  if (balls.some(b => !b.held)) {
    sinceBrick += dt;
    if (sinceBrick > 10) {
      sinceBrick = 6;
      for (const b of balls) {
        if (b.held) continue;
        const a = Math.atan2(b.vy, b.vx) + (Math.random() - 0.5) * 0.8;
        const s = Math.hypot(b.vx, b.vy);
        b.vx = Math.cos(a) * s; b.vy = Math.sin(a) * s;
      }
    }
  }

  // drops
  for (const d of drops) d.y += 9 * dt;
  drops = drops.filter(d => {
    if (d.y >= PY - 0.4 && d.y <= PY + PH + 0.8 && Math.abs(d.x - paddle.x) <= paddle.w / 2 + 0.8) {
      applyPower(d.p); return false;
    }
    return d.y < VH + 1;
  });

  // particles
  for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
  particles = particles.filter(p => p.life > 0);

  // outcomes
  if (balls.length === 0) {
    lives--;
    beep(120, 0.3, 'sawtooth', 0.07);
    if (lives <= 0) { endGame(); return; }
    fx.wide = fx.power = fx.slow = fx.boom = 0;
    drops = [];
    resetBalls();
  } else if (bricksLeft <= 0) {
    winLevel();
  }
}

// ---------- render ----------
const COL = {
  bg: '#141414',
  stoneBase: '#5b5b5b', stoneFace: '#8f8f8f',
  brickBase: '#3e1f10',
  line: '#d9534f',
  paddle: '#ff6f61',
};

function draw() {
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.fillStyle = COL.bg;
  ctx.fillRect(0, 0, W, VH);

  // grid
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = grid[y][x];
    if (!t) continue;
    if (t === STONE) {
      ctx.fillStyle = COL.stoneBase; ctx.fillRect(x, y, 1, 1);
      ctx.fillStyle = COL.stoneFace; ctx.fillRect(x + 0.08, y + 0.08, 0.84, 0.84);
    } else {
      ctx.fillStyle = COL.brickBase; ctx.fillRect(x, y, 1, 1);
      const v = (x * 7 + y * 13) % 3;
      ctx.fillStyle = v === 0 ? '#8c4a28' : v === 1 ? '#834523' : '#7a4020';
      ctx.fillRect(x + 0.08, y + 0.08, 0.84, 0.84);
    }
  }

  // death line
  ctx.fillStyle = COL.line;
  ctx.fillRect(0, VH - 1.2, W, 1.2);

  // particles
  for (const p of particles) {
    ctx.globalAlpha = clamp(p.life * 2, 0, 1);
    ctx.fillStyle = p.c;
    ctx.fillRect(p.x - 0.12, p.y - 0.12, 0.24, 0.24);
  }
  ctx.globalAlpha = 1;

  // drops
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const d of drops) {
    ctx.fillStyle = d.p.color;
    ctx.beginPath(); ctx.arc(d.x, d.y, 0.85, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.08; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 0.9px sans-serif';
    ctx.fillText(d.p.label, d.x, d.y + 0.05);
  }

  // paddle
  ctx.fillStyle = fx.wide > 0 ? '#81c784' : COL.paddle;
  ctx.fillRect(paddle.x - paddle.w / 2, PY, paddle.w, PH);

  // balls
  for (const b of balls) {
    ctx.fillStyle = fx.boom > 0 ? '#ff7043' : fx.power > 0 ? '#ffb74d' : '#fff';
    if (fx.power > 0 || fx.boom > 0) { ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 8; }
    ctx.beginPath(); ctx.arc(b.x, b.y, R, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
  }

  // HUD
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#ddd'; ctx.font = 'bold 1.1px sans-serif';
  ctx.fillText(`LEVEL ${level + 1}: ${LEVELS[level % LEVELS.length].name}`, 1, H + 2);
  ctx.font = '1px sans-serif'; ctx.fillStyle = '#aaa';
  ctx.fillText(`Score ${score}   Best ${Math.max(best, score)}`, 1, H + 3.6);
  ctx.fillText(`Bricks ${bricksLeft}/${totalBricks}   Balls ${balls.length}`, 1, H + 5.1);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#ff6f61'; ctx.font = '1.3px sans-serif';
  ctx.fillText('♥'.repeat(Math.max(0, lives)), W - 1, H + 2);

  // power timers
  const bars = [['wide', 14, '#81c784', 'WIDE'], ['power', 8, '#ffb74d', 'POWER'], ['slow', 10, '#ba68c8', 'SLOW'], ['boom', 10, '#ef5350', 'BOOM']];
  let by = H + 7;
  ctx.textAlign = 'left'; ctx.font = '0.8px sans-serif';
  for (const [k, max, c, label] of bars) {
    if (fx[k] <= 0) continue;
    ctx.fillStyle = '#aaa'; ctx.fillText(label, 1, by + 0.65);
    ctx.fillStyle = '#2a2a2a'; ctx.fillRect(5, by, 10, 0.8);
    ctx.fillStyle = c; ctx.fillRect(5, by, 10 * fx[k] / max, 0.8);
    by += 1.3;
  }

  if (state === 'playing' && balls.some(b => b.held)) {
    ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = 'bold 1.1px sans-serif';
    ctx.fillText('Tap / click / SPACE to launch', W / 2, PY - 3);
  }
}

// ---------- input ----------
function pointerToX(e) {
  const r = canvas.getBoundingClientRect();
  return (e.clientX - r.left) / r.width * W;
}
canvas.addEventListener('pointermove', e => { paddle.target = pointerToX(e); });
canvas.addEventListener('pointerdown', e => {
  paddle.target = pointerToX(e);
  if (state === 'playing') launch();
});
addEventListener('keydown', e => {
  switch (e.code) {
    case 'ArrowLeft': case 'KeyA': keys.left = true; break;
    case 'ArrowRight': case 'KeyD': keys.right = true; break;
    case 'Space': case 'ArrowUp':
      e.preventDefault();
      if (state === 'playing') launch();
      else if (overlayAction) overlayAction();
      break;
    case 'Enter': if (overlayAction) overlayAction(); break;
    case 'KeyP': case 'Escape': if (state === 'playing' || state === 'paused') togglePause(); break;
    case 'KeyM': muted = !muted; break;
  }
});
addEventListener('keyup', e => {
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = false;
  if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = false;
});
addEventListener('blur', () => { if (state === 'playing') togglePause(); });

// ---------- main loop ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  if (state === 'playing') update(dt);
  else if (state === 'clear' || state === 'over') {
    for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
    particles = particles.filter(p => p.life > 0);
  }
  draw();
  requestAnimationFrame(frame);
}

// ---------- boot ----------
loadLevel(0);
// expose for testing / debugging
window.__game = { get state() { return state; }, get bricksLeft() { return bricksLeft; }, get balls() { return balls; }, get grid() { return grid; }, fx, paddle, loadLevel, LEVELS, applyPower, POWERS, update, launch, startGame, get lives() { return lives; } };
showOverlay('MAZE BREAKER',
  'Clear every brown brick.\nConcrete (grey) is unbreakable.\nCatch falling power-ups with your paddle:\n+1 / +3 balls · wide paddle · power ball · slow · boom\n\nMouse / touch / ← → to move · Space or click to launch · P to pause',
  'Start', startGame);
requestAnimationFrame(frame);
})();
