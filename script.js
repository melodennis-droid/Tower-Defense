// ─────────────────────────────────────────────
//  CONSTANTS & CONFIG
// ─────────────────────────────────────────────
const canvas = document.getElementById('c');
const ctx    = canvas.getContext('2d');
const tip    = document.getElementById('tooltip');

const COLS = 20;
const ROWS = 13;
let   CELL = 40;

const PATH_WP = [
  {x:0,y:3},{x:3,y:3},{x:3,y:1},{x:7,y:1},{x:7,y:5},{x:5,y:5},{x:5,y:9},{x:10,y:9},
  {x:10,y:6},{x:14,y:6},{x:14,y:11},{x:17,y:11},{x:17,y:3},{x:19,y:3},{x:20,y:3}
];

const FORT_CX = 18;
const FORT_CY = 3;

const TOWER_DEFS = {
  basic:  { name:'Básica', cost:100,  dmg:20, range:3,   speed:2.0, color:'#60a5fa', proj:'#bae6fd', upgrade:40 },
  sniper: { name:'Sniper', cost:200, dmg:60, range:5.5, speed:1.0, color:'#a78bfa', proj:'#ddd6fe', upgrade:60 },
  slow:   { name:'Lenta',  cost:150, dmg:8,  range:2.5, speed:3.0, color:'#34d399', proj:'#6ee7b7', upgrade:50, slow:0.4 },
  aoe:    { name:'AoE',    cost:250, dmg:30, range:2.0, speed:1.5, color:'#fb923c', proj:'#fed7aa', upgrade:75, aoe:true  }
};

const TARGET_MODES  = ['first', 'last', 'strongest'];
const TARGET_LABELS = { first:'▶ Primeiro', last:'◀ Último', strongest:'★ Mais forte' };

const ENEMY_DEFS = {
  basic: { hp:150,  spd:1.0, reward:15,  color:'#ef4444', size:9  },
  fast:  { hp:300,  spd:4.0, reward:20,  color:'#f97316', size:8  },
  tank:  { hp:1000, spd:2.5, reward:40,  color:'#8b5cf6', size:13 },
  boss:  { hp:1500, spd:1.0, reward:50, color:'#dc2626', size:16 }
};

// ─────────────────────────────────────────────
//  ROLETA PRIZES
// ─────────────────────────────────────────────
const ROLETA_PRIZES = [
  { emoji:'💰', label:'+50 ouro',      weight:30, apply: () => { state.gold  += 50;  updateUI(); } },
  { emoji:'💰', label:'+100 ouro',     weight:20, apply: () => { state.gold  += 100; updateUI(); } },
  { emoji:'💰', label:'+500 ouro',     weight:10, apply: () => { state.gold  += 500; updateUI(); } },
  { emoji:'🏆', label:'+150 score',    weight:15, apply: () => { state.score += 150; updateUI(); } },
  { emoji:'🪙', label:'+5 fichas',     weight:8,  apply: () => { state.fichas += 5;  updateUI(); } },
  { emoji:'💀', label:'-30 ouro',      weight:10, apply: () => { state.gold  = Math.max(0, state.gold - 30); updateUI(); } },
  { emoji:'🎁', label:'Torre grátis!', weight:5,  apply: () => { state.gold  += 999; updateUI(); } },
];

const FICHAS_REQUIRED = 10;

function pickRoletaPrize() {
  const total = ROLETA_PRIZES.reduce((s, p) => s + p.weight, 0);
  let r = Math.random() * total;
  for (const prize of ROLETA_PRIZES) {
    r -= prize.weight;
    if (r <= 0) return prize;
  }
  return ROLETA_PRIZES[0];
}

// ─────────────────────────────────────────────
//  STATE
// ─────────────────────────────────────────────
let state = {};
let selectedTowerType = 'basic';
let selectedTowerObj  = null;
let animId, lastTime = 0, mousePos = null;

function buildPathSet() {
  const s = new Set();
  for (let i = 0; i < PATH_WP.length - 1; i++) {
    const a = PATH_WP[i], b = PATH_WP[i + 1];
    if (a.x === b.x) {
      for (let y = Math.min(a.y,b.y); y <= Math.max(a.y,b.y); y++) s.add(`${a.x},${y}`);
    } else {
      for (let x = Math.min(a.x,b.x); x <= Math.max(a.x,b.x); x++) s.add(`${x},${a.y}`);
    }
  }
  return s;
}

function initState() {
  state = {
    lives: 3, gold: 250, score: 0, waveNum: 0, fichas: 0,
    waveActive: false, pendingEnemies: [], spawnTimer: 0, spawnInterval: 1.1,
    enemies: [], towers: [], projectiles: [], particles: [],
    pathCells: buildPathSet(),
    gameOver: false,
    fort: { hp:5, maxHp:5, alive:true, shake:0 },
    towerCounts: { basic:0, sniper:0, slow:0, aoe:0 }
  };
  selectedTowerObj = null;
  hideTip();
  closeRoleta();
}

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────
const isOnPath = (cx, cy) => state.pathCells.has(`${cx},${cy}`);
const isFort   = (cx, cy) => cx === FORT_CX && cy === FORT_CY;
const gpx = gx => gx * CELL + CELL / 2;
const gpy = gy => gy * CELL + CELL / 2;

function resize() {
  const uiH    = document.getElementById('ui').offsetHeight;
  const availW = window.innerWidth;
  const availH = window.innerHeight - uiH;
  CELL = Math.floor(Math.min(availW / COLS, availH / ROWS));
  canvas.width  = COLS * CELL;
  canvas.height = ROWS * CELL;
  // keep wrap height in sync so overlays position correctly
  document.getElementById('wrap').style.height = canvas.height + 'px';
}

// ─────────────────────────────────────────────
//  UI
// ─────────────────────────────────────────────
function updateUI() {
  document.getElementById('lives').textContent   = state.lives;
  document.getElementById('gold').textContent    = state.gold;
  document.getElementById('waveNum').textContent = state.waveNum;
  document.getElementById('score').textContent   = state.score;
  document.getElementById('fichas').textContent  = state.fichas;

  ['basic','sniper','slow','aoe'].forEach(t => {
    const c = state.towerCounts[t];
    document.getElementById('cnt-' + t).textContent = `(${c}/3)`;
    document.getElementById('btn-' + t).classList.toggle('maxed', c >= 3);
  });

  const roletaBtn = document.getElementById('roleta-btn');
  const roletaReady = state.fichas >= FICHAS_REQUIRED;
  if (roletaBtn) {
    roletaBtn.style.opacity       = roletaReady ? '1' : '0.4';
    roletaBtn.style.cursor        = roletaReady ? 'pointer' : 'not-allowed';
    roletaBtn.style.pointerEvents = roletaReady ? 'auto' : 'none';
  }
  const cntFichas = document.getElementById('cnt-fichas');
  if (cntFichas) cntFichas.textContent = `(${state.fichas}/${FICHAS_REQUIRED})`;
}

function selectTower(type) {
  selectedTowerType = type;
  selectedTowerObj  = null;
  document.querySelectorAll('.tower-btn').forEach(b => b.style.opacity = '0.5');
  document.getElementById('btn-' + type).style.opacity = '1';
  hideTip();
}

// ─────────────────────────────────────────────
//  ROLETA
// ─────────────────────────────────────────────
let roletaSpinning = false;

function openRoleta() {
  if (state.gameOver || state.fichas < FICHAS_REQUIRED) return;
  document.getElementById('roleta-spin').textContent   = '🎰';
  document.getElementById('roleta-result').textContent =
    'Você tem ' + state.fichas + ' fichas. Gire para ganhar prêmios!';
  document.getElementById('roleta-overlay').style.display = 'block';
  hideTip();
}

function closeRoleta() {
  const overlay = document.getElementById('roleta-overlay');
  if (overlay) overlay.style.display = 'none';
  roletaSpinning = false;
}

function spinRoleta() {
  if (roletaSpinning) return;
  if (state.fichas < FICHAS_REQUIRED) {
    document.getElementById('roleta-result').textContent =
      `❌ Você precisa de ${FICHAS_REQUIRED} fichas! (tem ${state.fichas}/${FICHAS_REQUIRED})`;
    return;
  }
  state.fichas -= FICHAS_REQUIRED;
  updateUI();
  roletaSpinning = true;

  const spinEl   = document.getElementById('roleta-spin');
  const resultEl = document.getElementById('roleta-result');
  const spinBtn  = document.getElementById('roleta-spin-btn');
  spinBtn.disabled = true;
  resultEl.textContent = 'Girando...';

  const frames = 20;
  let frame = 0;
  const interval = setInterval(() => {
    spinEl.textContent = ROLETA_PRIZES[Math.floor(Math.random() * ROLETA_PRIZES.length)].emoji;
    frame++;
    if (frame >= frames) {
      clearInterval(interval);
      const prize = pickRoletaPrize();
      spinEl.textContent   = prize.emoji;
      resultEl.textContent = '🎉 ' + prize.label + '!';
      prize.apply();
      roletaSpinning   = false;
      spinBtn.disabled = false;
    }
  }, 80);
}

// ─────────────────────────────────────────────
//  TOOLTIP
// ─────────────────────────────────────────────
function hideTip() { tip.style.display = 'none'; }

function showTip(t) {
  const def     = TOWER_DEFS[t.type];
  const upgCost = t.level < 3 ? def.upgrade * t.level : null;
  const refund  = Math.floor(def.cost * 0.6 + (t.level - 1) * def.upgrade * 0.6);
  const canUpg  = upgCost && state.gold >= upgCost;

  tip.innerHTML = '';

  const info = document.createElement('div');
  info.style.marginBottom = '4px';
  info.innerHTML = `<b style="color:${t.color}">${def.name}</b> Nv.${t.level}<br>DMG: ${t.dmg} | Raio: ${t.range.toFixed(1)}<br>Alvo: <b>${TARGET_LABELS[t.targetMode]}</b>`;
  tip.appendChild(info);

  const btnTarget = document.createElement('button');
  btnTarget.className   = 'tip-btn';
  btnTarget.textContent = '🔄 Mudar alvo';
  btnTarget.onclick = e => { e.stopPropagation(); cycleTarget(t); };
  tip.appendChild(btnTarget);

  if (upgCost) {
    const btnUpg = document.createElement('button');
    btnUpg.className   = 'tip-btn';
    btnUpg.textContent = `⬆ Upgrade $${upgCost}`;
    btnUpg.disabled    = !canUpg;
    btnUpg.onclick = e => { e.stopPropagation(); doUpgrade(t); };
    tip.appendChild(btnUpg);
  } else {
    const span = document.createElement('span');
    span.style.cssText = 'font-size:10px;color:#94a3b8;display:block;margin-top:4px';
    span.textContent   = 'Nível máximo';
    tip.appendChild(span);
  }

  const btnSell = document.createElement('button');
  btnSell.className   = 'tip-btn red';
  btnSell.textContent = `💲 Vender ($${refund})`;
  btnSell.onclick = e => { e.stopPropagation(); doSell(t); };
  tip.appendChild(btnSell);

  tip.style.display = 'block';
  const tx = Math.min(t.cx * CELL + CELL + 4, canvas.width - 170);
  const ty = Math.max(t.cy * CELL - 10, 0);
  tip.style.left = tx + 'px';
  tip.style.top  = ty + 'px';
}

// ─────────────────────────────────────────────
//  TOWER ACTIONS
// ─────────────────────────────────────────────
function cycleTarget(t) {
  const idx    = TARGET_MODES.indexOf(t.targetMode);
  t.targetMode = TARGET_MODES[(idx + 1) % TARGET_MODES.length];
  showTip(t);
}

function doUpgrade(t) {
  const def  = TOWER_DEFS[t.type];
  const cost = def.upgrade * t.level;
  if (state.gold < cost || t.level >= 3) return;
  state.gold -= cost;
  t.level++;
  t.dmg   = Math.floor(def.dmg   * (1 + 0.5  * (t.level - 1)));
  t.range = def.range * (1 + 0.15 * (t.level - 1));
  updateUI();
  showTip(t);
}

function doSell(t) {
  const def   = TOWER_DEFS[t.type];
  state.gold += Math.floor(def.cost * 0.6 + (t.level - 1) * def.upgrade * 0.6);
  state.towerCounts[t.type]--;
  state.towers     = state.towers.filter(x => x !== t);
  selectedTowerObj = null;
  hideTip();
  updateUI();
}

function placeTower(cx, cy) {
  if (isOnPath(cx, cy) || isFort(cx, cy)) return;
  if (state.towers.find(t => t.cx === cx && t.cy === cy)) return;
  const def = TOWER_DEFS[selectedTowerType];
  if (state.gold < def.cost || state.towerCounts[selectedTowerType] >= 3) return;

  state.gold -= def.cost;
  state.towerCounts[selectedTowerType]++;
  state.towers.push({
    type: selectedTowerType, cx, cy,
    x: cx * CELL + CELL / 2,
    y: cy * CELL + CELL / 2,
    cooldown: 0, level: 1,
    dmg: def.dmg, range: def.range, speed: def.speed,
    color: def.color, proj: def.proj,
    targetMode: 'first', facing: 1
  });
  updateUI();
}

// ─────────────────────────────────────────────
//  WAVES & ENEMIES
// ─────────────────────────────────────────────
function getWaveEnemies(w) {
  const base  = 8 + w * 4;
  const types = [];
  for (let i = 0; i < base; i++) {
    const r = Math.random();
    if      (w < 3) types.push('basic');
    else if (w < 6) types.push(r < 0.6 ? 'basic' : 'fast');
    else if (w < 9) types.push(r < 0.4 ? 'basic' : r < 0.7 ? 'fast' : 'tank');
    else            types.push(r < 0.3 ? 'fast'  : r < 0.6 ? 'tank' : r < 0.8 ? 'basic' : 'boss');
  }
  return types;
}

function startWave() {
  if (state.waveActive || state.gameOver) return;
  state.waveNum++;
  state.waveActive     = true;
  state.pendingEnemies = getWaveEnemies(state.waveNum);
  state.spawnTimer     = 0;
  updateUI();
}

function spawnEnemy(type) {
  const def = ENEMY_DEFS[type];
  state.enemies.push({
    type, hp: def.hp, maxHp: def.hp, spd: def.spd,
    color: def.color, size: def.size, reward: def.reward,
    wpIdx: 0, prog: 0,
    x: gpx(PATH_WP[0].x), y: gpy(PATH_WP[0].y),
    slow: 0, slowTimer: 0, dead: false
  });
}

function killEnemy(en) {
  en.dead     = true;
  state.gold  += en.reward;
  state.score += en.reward;
  spawnParticles(en.x, en.y, en.color, 10);
  updateUI();
}

// ─────────────────────────────────────────────
//  TARGETING
// ─────────────────────────────────────────────
function getTarget(tower) {
  const rp      = tower.range * CELL;
  const inRange = state.enemies.filter(en => !en.dead && Math.hypot(tower.x - en.x, tower.y - en.y) <= rp);
  if (!inRange.length) return null;
  if (tower.targetMode === 'first')    return inRange.reduce((a,b) => b.prog > a.prog ? b : a);
  if (tower.targetMode === 'last')     return inRange.reduce((a,b) => b.prog < a.prog ? b : a);
  /* strongest */                      return inRange.reduce((a,b) => b.hp  > a.hp   ? b : a);
}

// ─────────────────────────────────────────────
//  PARTICLES
// ─────────────────────────────────────────────
function spawnParticles(x, y, color, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 40 + Math.random() * 80;
    state.particles.push({
      x, y, vx: Math.cos(a)*s, vy: Math.sin(a)*s,
      life: 0.5, maxLife: 0.5, alpha: 1, color,
      size: 2 + Math.random() * 3
    });
  }
}

// ─────────────────────────────────────────────
//  UPDATE
// ─────────────────────────────────────────────
function update(dt) {
  if (state.gameOver) return;

  // Spawn enemies
  if (state.waveActive && state.pendingEnemies.length > 0) {
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      spawnEnemy(state.pendingEnemies.shift());
      state.spawnTimer = state.spawnInterval;
    }
  }

  // Move enemies
  state.enemies.forEach(en => {
    if (en.slowTimer > 0) { en.slowTimer -= dt; if (en.slowTimer <= 0) en.slow = 0; }
    const spd = en.spd * CELL * (1 - en.slow);
    const wp  = PATH_WP[en.wpIdx + 1];

    if (!wp) {
      en.dead = true;
      if (state.fort.alive) {
        state.fort.hp--;
        state.fort.shake = 0.25;
        spawnParticles(gpx(FORT_CX), gpy(FORT_CY), '#ef4444', 12);
        if (state.fort.hp <= 0) {
          state.fort.alive = false;
          state.lives -= 3;
          spawnParticles(gpx(FORT_CX), gpy(FORT_CY), '#ef4444', 30);
        }
      } else {
        state.lives--;
      }
      updateUI();
      if (state.lives <= 0) showMsg(false);
      return;
    }

    const tx = gpx(wp.x), ty = gpy(wp.y);
    const dx = tx - en.x, dy = ty - en.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 4) { en.wpIdx++; en.prog = en.wpIdx * 10000; return; }
    en.prog = en.wpIdx * 10000 + (10000 - dist);
    en.x += (dx / dist) * spd * dt;
    en.y += (dy / dist) * spd * dt;
  });

  if (state.fort.shake > 0) state.fort.shake -= dt;

  // Towers shoot
  state.towers.forEach(t => {
    t.x = t.cx * CELL + CELL / 2;
    t.y = t.cy * CELL + CELL / 2;
    if (t.cooldown > 0) { t.cooldown -= dt; return; }
    const target = getTarget(t);
    if (!target) return;
    t.cooldown = 1 / t.speed;
    const def = TOWER_DEFS[t.type];
    if (def.aoe) {
      state.projectiles.push({ x:t.x, y:t.y, tx:target.x, ty:target.y, aoe:true, aoeR:t.range*CELL*0.6, speed:280, color:t.proj, dmg:t.dmg, dead:false });
    } else {
      state.projectiles.push({ x:t.x, y:t.y, target, speed:320, color:t.proj, dmg:t.dmg, dead:false, slow:def.slow||0 });
    }
  });

  // Move projectiles
  state.projectiles.forEach(p => {
    const tx = p.aoe ? p.tx : (p.target && !p.target.dead ? p.target.x : null);
    const ty = p.aoe ? p.ty : (p.target && !p.target.dead ? p.target.y : null);
    if (tx === null) { p.dead = true; return; }
    const dx = tx - p.x, dy = ty - p.y, dist = Math.hypot(dx, dy);
    if (dist < 8) {
      p.dead = true;
      if (p.aoe) {
        state.enemies.forEach(en => {
          if (!en.dead && Math.hypot(tx - en.x, ty - en.y) <= p.aoeR) {
            en.hp -= p.dmg;
            spawnParticles(en.x, en.y, '#fb923c', 5);
            if (en.hp <= 0) killEnemy(en);
          }
        });
        spawnParticles(tx, ty, '#fed7aa', 14);
      } else if (!p.target.dead) {
        p.target.hp -= p.dmg;
        if (p.slow > 0) { p.target.slow = p.slow; p.target.slowTimer = 1.5; }
        spawnParticles(p.target.x, p.target.y, p.color, 3);
        if (p.target.hp <= 0) killEnemy(p.target);
      }
      return;
    }
    p.x += (dx / dist) * p.speed * dt;
    p.y += (dy / dist) * p.speed * dt;
  });

  // Particles
  state.particles.forEach(p => {
    p.x    += p.vx * dt;
    p.y    += p.vy * dt;
    p.life -= dt;
    p.alpha = p.life / p.maxLife;
  });

  // Cleanup
  state.enemies     = state.enemies.filter(e => !e.dead);
  state.projectiles = state.projectiles.filter(p => !p.dead);
  state.particles   = state.particles.filter(p => p.life > 0);

  // Wave end
  if (state.waveActive && state.pendingEnemies.length === 0 && state.enemies.length === 0) {
    state.waveActive = false;
    state.gold      += 20 + state.waveNum * 5;
    if (state.waveNum % 10 === 0) state.fichas++;
    updateUI();
    if (state.waveNum >= 15) showMsg(true);
  }
}

// ─────────────────────────────────────────────
//  DRAW
// ─────────────────────────────────────────────
function draw() {
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawGrid();
  drawPath();
  drawFort();
  drawHoverPreview();
  drawTowers();
  drawEnemies();
  drawProjectiles();
  drawParticles();
}

function drawGrid() {
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth   = 0.5;
  for (let x = 0; x <= COLS; x++) { ctx.beginPath(); ctx.moveTo(x*CELL,0); ctx.lineTo(x*CELL,canvas.height); ctx.stroke(); }
  for (let y = 0; y <= ROWS; y++) { ctx.beginPath(); ctx.moveTo(0,y*CELL); ctx.lineTo(canvas.width,y*CELL); ctx.stroke(); }
}

function drawPath() {
  ctx.lineCap  = 'round';
  ctx.lineJoin = 'round';

  ctx.strokeStyle = '#d97706';
  ctx.lineWidth   = CELL - 6;
  ctx.globalAlpha = 0.2;
  ctx.beginPath();
  PATH_WP.forEach((wp,i) => i===0 ? ctx.moveTo(gpx(wp.x),gpy(wp.y)) : ctx.lineTo(gpx(wp.x),gpy(wp.y)));
  ctx.stroke();

  ctx.strokeStyle = '#fbbf24';
  ctx.lineWidth   = 2;
  ctx.globalAlpha = 0.3;
  ctx.beginPath();
  PATH_WP.forEach((wp,i) => i===0 ? ctx.moveTo(gpx(wp.x),gpy(wp.y)) : ctx.lineTo(gpx(wp.x),gpy(wp.y)));
  ctx.stroke();

  ctx.globalAlpha = 1;
  ctx.fillStyle  = '#22c55e';
  ctx.font       = `bold ${Math.max(9, CELL*0.25)}px monospace`;
  ctx.textAlign  = 'center';
  ctx.fillText('START', gpx(PATH_WP[0].x), gpy(PATH_WP[0].y) + 4);
}

function drawFort() {
  if (!state.fort.alive) return;
  const shk = state.fort.shake > 0 ? (Math.random() - 0.5) * 5 : 0;
  const fx = gpx(FORT_CX) + shk;
  const fy = gpy(FORT_CY);
  const s  = CELL * 0.35;

  ctx.fillStyle = '#1e3a5f';
  ctx.fillRect(FORT_CX*CELL+2, FORT_CY*CELL+2, CELL-4, CELL-4);

  ctx.fillStyle = '#dc2626';
  ctx.beginPath();
  ctx.moveTo(fx-s, fy+s); ctx.lineTo(fx+s, fy+s); ctx.lineTo(fx+s, fy-s*0.3);
  ctx.lineTo(fx+s*0.65, fy-s*0.7); ctx.lineTo(fx+s*0.35, fy-s*0.3);
  ctx.lineTo(fx, fy-s*0.7); ctx.lineTo(fx-s*0.35, fy-s*0.3);
  ctx.lineTo(fx-s*0.65, fy-s*0.7); ctx.lineTo(fx-s, fy-s*0.3);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#fbbf24';
  ctx.beginPath(); ctx.arc(fx, fy, CELL*0.1, 0, Math.PI*2); ctx.fill();

  const bw = CELL-8, bh = 4, bx = FORT_CX*CELL+4, by = FORT_CY*CELL-6;
  ctx.fillStyle = '#1f2937'; ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = state.fort.hp > state.fort.maxHp*0.5 ? '#22c55e' : '#ef4444';
  ctx.fillRect(bx, by, bw*(state.fort.hp/state.fort.maxHp), bh);

  ctx.fillStyle = '#94a3b8';
  ctx.font      = `${Math.max(8, CELL*0.22)}px monospace`;
  ctx.textAlign = 'center';
  ctx.fillText('FORTE', gpx(FORT_CX), FORT_CY*CELL + CELL - 4);
}

function drawHoverPreview() {
  if (!mousePos || selectedTowerObj) return;
  const r  = canvas.getBoundingClientRect();
  const cx = Math.floor((mousePos.clientX - r.left) / CELL);
  const cy = Math.floor((mousePos.clientY - r.top)  / CELL);
  if (cx < 0 || cx >= COLS || cy < 0 || cy >= ROWS) return;

  const def      = TOWER_DEFS[selectedTowerType];
  const canPlace = !isOnPath(cx,cy) && !state.towers.find(t=>t.cx===cx&&t.cy===cy)
                && !isFort(cx,cy) && state.gold >= def.cost
                && state.towerCounts[selectedTowerType] < 3;

  ctx.globalAlpha = 0.35;
  ctx.fillStyle   = canPlace ? def.color : '#ef4444';
  ctx.fillRect(cx*CELL+1, cy*CELL+1, CELL-2, CELL-2);
  ctx.globalAlpha = 1;

  if (canPlace) {
    ctx.strokeStyle = def.color + '55';
    ctx.lineWidth   = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.arc(cx*CELL+CELL/2, cy*CELL+CELL/2, def.range*CELL, 0, Math.PI*2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function drawBasicCharacter(t, r) {
  const x = t.x, y = t.y;
  const skin   = '#fcd9b8';
  const shirt  = t.color; // azul da torre básica
  const hairColors = { 1:'#1a1a1a', 2:'#facc15', 3:'#dc2626' };
  const hairColor  = hairColors[t.level] || hairColors[1];
  const facing = t.facing || 1;

  ctx.save();
  ctx.translate(x, 0);
  ctx.scale(facing, 1);
  ctx.translate(-x, 0);

  const legW  = Math.max(3, r*0.4);
  const armW  = Math.max(3, r*0.32);

  // perna de trás (esticada, base larga) e perna da frente (flexionada)
  ctx.strokeStyle = shirt;
  ctx.lineWidth   = legW;
  ctx.lineCap     = 'round';
  ctx.beginPath();
  ctx.moveTo(x - r*0.12, y + r*0.5); ctx.lineTo(x - r*1.05, y + r*1.4);
  ctx.moveTo(x - r*0.12, y + r*0.5); ctx.lineTo(x + r*0.55, y + r*0.95); ctx.lineTo(x + r*0.75, y + r*1.4);
  ctx.stroke();

  // tronco levemente inclinado pra frente
  ctx.fillStyle = shirt;
  ctx.beginPath();
  ctx.moveTo(x - r*0.55, y + r*0.6);
  ctx.lineTo(x - r*0.3,  y - r*0.05);
  ctx.lineTo(x + r*0.5,  y - r*0.1);
  ctx.lineTo(x + r*0.35, y + r*0.55);
  ctx.closePath();
  ctx.fill();

  // braço de trás flexionado, guardando perto do corpo
  ctx.strokeStyle = shirt;
  ctx.lineWidth   = armW;
  ctx.lineCap     = 'round';
  ctx.beginPath();
  ctx.moveTo(x - r*0.35, y + r*0.05); ctx.lineTo(x - r*0.75, y + r*0.25); ctx.lineTo(x - r*0.55, y - r*0.05);
  ctx.stroke();

  // braço da frente esticado dando um soco
  ctx.beginPath();
  ctx.moveTo(x + r*0.4, y - r*0.0); ctx.lineTo(x + r*1.15, y - r*0.25);
  ctx.stroke();

  // punhos
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.arc(x - r*0.55, y - r*0.05, Math.max(2.5, r*0.2), 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + r*1.15, y - r*0.25, Math.max(2.5, r*0.2), 0, Math.PI*2); ctx.fill();

  // cabeça (levemente à frente, acompanhando a inclinação)
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(x + r*0.08, y - r*0.4, r*0.5, 0, Math.PI*2);
  ctx.fill();

  // cabelo - varia conforme o nível
  ctx.fillStyle = hairColor;
  const hx = x + r*0.08;
  if (t.level >= 2) {
    // cabelo espetado (level 2 e 3)
    const hy = y - r*0.4;
    const hr = r*0.55;
    ctx.beginPath();
    for (let i = -3; i <= 3; i++) {
      const ang = (i / 3) * (Math.PI*0.55) - Math.PI/2;
      const baseX = hx + Math.cos(ang)*hr*0.8;
      const baseY = hy + Math.sin(ang)*hr*0.8;
      const tipX  = hx + Math.cos(ang)*hr*1.9;
      const tipY  = hy + Math.sin(ang)*hr*1.9;
      ctx.moveTo(baseX - 2, baseY);
      ctx.lineTo(tipX, tipY);
      ctx.lineTo(baseX + 2, baseY);
    }
    ctx.closePath();
    ctx.fill();
    // base do cabelo cobrindo o topo da cabeça
    ctx.beginPath();
    ctx.arc(hx, hy, hr*0.95, Math.PI, 0);
    ctx.fill();
  } else {
    // cabelo liso (level 1)
    ctx.beginPath();
    ctx.arc(hx, y - r*0.4, r*0.55, Math.PI*1.05, Math.PI*1.95);
    ctx.fill();
  }
  ctx.restore();
}

function drawPirateCharacter(t, r) {
  const x = t.x, y = t.y;
  const skin    = '#e0ad7f';
  const shirt   = t.color; // verde da torre lenta
  const bandana = '#1f2937';
  const beard   = '#262626';
  const facing  = t.facing || 1;

  ctx.save();
  ctx.translate(x, 0);
  ctx.scale(facing, 1);
  ctx.translate(-x, 0);

  const legW  = Math.max(3, r*0.4);
  const armW  = Math.max(3, r*0.32);

  // perna de trás (esticada, base larga) e perna da frente (flexionada)
  ctx.strokeStyle = shirt;
  ctx.lineWidth   = legW;
  ctx.lineCap     = 'round';
  ctx.beginPath();
  ctx.moveTo(x - r*0.12, y + r*0.5); ctx.lineTo(x - r*1.05, y + r*1.4);
  ctx.moveTo(x - r*0.12, y + r*0.5); ctx.lineTo(x + r*0.55, y + r*0.95); ctx.lineTo(x + r*0.75, y + r*1.4);
  ctx.stroke();

  // tronco levemente inclinado pra frente
  ctx.fillStyle = shirt;
  ctx.beginPath();
  ctx.moveTo(x - r*0.55, y + r*0.6);
  ctx.lineTo(x - r*0.3,  y - r*0.05);
  ctx.lineTo(x + r*0.5,  y - r*0.1);
  ctx.lineTo(x + r*0.35, y + r*0.55);
  ctx.closePath();
  ctx.fill();

  // cinto cruzado no peito (detalhe de pirata)
  ctx.strokeStyle = '#8b5e34';
  ctx.lineWidth   = Math.max(1.5, r*0.1);
  ctx.beginPath();
  ctx.moveTo(x - r*0.4, y - r*0.05); ctx.lineTo(x + r*0.35, y + r*0.5);
  ctx.stroke();

  // braço de trás flexionado, guardando perto do corpo
  ctx.strokeStyle = shirt;
  ctx.lineWidth   = armW;
  ctx.lineCap     = 'round';
  ctx.beginPath();
  ctx.moveTo(x - r*0.35, y + r*0.05); ctx.lineTo(x - r*0.75, y + r*0.25); ctx.lineTo(x - r*0.55, y - r*0.05);
  ctx.stroke();

  // braço da frente esticado dando um soco
  ctx.beginPath();
  ctx.moveTo(x + r*0.4, y - r*0.0); ctx.lineTo(x + r*1.15, y - r*0.25);
  ctx.stroke();

  // punhos
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.arc(x - r*0.55, y - r*0.05, Math.max(2.5, r*0.2), 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + r*1.15, y - r*0.25, Math.max(2.5, r*0.2), 0, Math.PI*2); ctx.fill();

  // cabeça
  const hx = x + r*0.08, hy = y - r*0.4;
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(hx, hy, r*0.5, 0, Math.PI*2);
  ctx.fill();

  // barba escura cobrindo a parte inferior do rosto
  ctx.fillStyle = beard;
  ctx.beginPath();
  ctx.arc(hx, hy + r*0.12, r*0.48, 0.05*Math.PI, 0.95*Math.PI);
  ctx.closePath();
  ctx.fill();
  // pontinha da barba
  ctx.beginPath();
  ctx.moveTo(hx - r*0.16, hy + r*0.5);
  ctx.lineTo(hx,          hy + r*0.78);
  ctx.lineTo(hx + r*0.16, hy + r*0.5);
  ctx.closePath();
  ctx.fill();

  // bandana na cabeça
  ctx.fillStyle = bandana;
  ctx.beginPath();
  ctx.arc(hx, hy - r*0.05, r*0.55, Math.PI*1.0, Math.PI*2.0);
  ctx.fill();
  // nó da bandana atrás
  ctx.beginPath();
  ctx.moveTo(hx - r*0.55, hy - r*0.05);
  ctx.lineTo(hx - r*0.85, hy + r*0.1);
  ctx.lineTo(hx - r*0.6,  hy + r*0.25);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function drawSniperCharacter(t, r) {
  const x = t.x, y = t.y;
  const skin   = '#d9a574';
  const shirt  = t.color; // roxo da torre sniper
  const cap    = '#3f2d1d';
  const goggle = '#1f2937';
  const facing = t.facing || 1;

  ctx.save();
  ctx.translate(x, 0);
  ctx.scale(facing, 1);
  ctx.translate(-x, 0);

  const legW = Math.max(3, r*0.4);
  const armW = Math.max(3, r*0.32);

  // pernas em pose de mira (uma à frente flexionada, base estável)
  ctx.strokeStyle = shirt;
  ctx.lineWidth   = legW;
  ctx.lineCap     = 'round';
  ctx.beginPath();
  ctx.moveTo(x - r*0.1, y + r*0.5); ctx.lineTo(x - r*0.95, y + r*1.4);
  ctx.moveTo(x - r*0.1, y + r*0.5); ctx.lineTo(x + r*0.5, y + r*0.9); ctx.lineTo(x + r*0.7, y + r*1.4);
  ctx.stroke();

  // tronco
  ctx.fillStyle = shirt;
  ctx.beginPath();
  ctx.moveTo(x - r*0.5, y + r*0.6);
  ctx.lineTo(x - r*0.32, y - r*0.05);
  ctx.lineTo(x + r*0.45, y - r*0.1);
  ctx.lineTo(x + r*0.32, y + r*0.55);
  ctx.closePath();
  ctx.fill();

  // mochila/coldre nas costas
  ctx.fillStyle = '#5b4636';
  ctx.fillRect(x - r*0.65, y - r*0.05, r*0.22, r*0.4);

  // braço de trás segurando a parte de trás do rifle, perto do corpo
  ctx.strokeStyle = shirt;
  ctx.lineWidth   = armW;
  ctx.lineCap     = 'round';
  ctx.beginPath();
  ctx.moveTo(x - r*0.32, y + r*0.05); ctx.lineTo(x - r*0.6, y - r*0.1); ctx.lineTo(x - r*0.35, y - r*0.3);
  ctx.stroke();

  // braço da frente esticado segurando a mira do rifle
  ctx.beginPath();
  ctx.moveTo(x + r*0.35, y - r*0.0); ctx.lineTo(x + r*1.05, y - r*0.2);
  ctx.stroke();

  // rifle (cano longo saindo da mão da frente)
  ctx.strokeStyle = '#2d2d2d';
  ctx.lineWidth   = Math.max(2.5, r*0.16);
  ctx.lineCap     = 'round';
  ctx.beginPath();
  ctx.moveTo(x - r*0.35, y - r*0.3); ctx.lineTo(x + r*1.45, y - r*0.35);
  ctx.stroke();
  // mira no topo do rifle
  ctx.fillStyle = '#2d2d2d';
  ctx.fillRect(x + r*0.55, y - r*0.55, r*0.18, r*0.2);

  // mãos
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.arc(x - r*0.35, y - r*0.3, Math.max(2.5, r*0.18), 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + r*1.05, y - r*0.2, Math.max(2.5, r*0.18), 0, Math.PI*2); ctx.fill();

  // cabeça
  const hx = x + r*0.05, hy = y - r*0.4;
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(hx, hy, r*0.48, 0, Math.PI*2);
  ctx.fill();

  // nariz comprido (traço característico de atirador atento)
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.moveTo(hx + r*0.4, hy - r*0.05);
  ctx.lineTo(hx + r*0.95, hy + r*0.08);
  ctx.lineTo(hx + r*0.4,  hy + r*0.2);
  ctx.closePath();
  ctx.fill();

  // óculos de mira
  ctx.fillStyle = goggle;
  ctx.beginPath(); ctx.arc(hx - r*0.05, hy - r*0.08, r*0.18, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#7dd3fc';
  ctx.beginPath(); ctx.arc(hx - r*0.05, hy - r*0.08, r*0.1, 0, Math.PI*2); ctx.fill();

  // boné virado pra trás
  ctx.fillStyle = cap;
  ctx.beginPath();
  ctx.arc(hx, hy - r*0.1, r*0.52, Math.PI*1.0, Math.PI*1.95);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(hx - r*0.5, hy - r*0.1, r*0.16, 0, Math.PI*2);
  ctx.fill();

  ctx.restore();
}

function drawAoeCharacter(t, r) {
  const x = t.x, y = t.y;
  const skin    = '#f1d4b8';
  const shirt   = t.color; // laranja da torre AoE
  const hair    = '#f1f5f9';
  const blind   = '#0f172a';
  const facing  = t.facing || 1;

  ctx.save();
  ctx.translate(x, 0);
  ctx.scale(facing, 1);
  ctx.translate(-x, 0);

  const legW = Math.max(3, r*0.4);
  const armW = Math.max(3, r*0.3);

  // pernas firmes, base estável
  ctx.strokeStyle = '#1f2937';
  ctx.lineWidth   = legW;
  ctx.lineCap     = 'round';
  ctx.beginPath();
  ctx.moveTo(x - r*0.05, y + r*0.5); ctx.lineTo(x - r*0.85, y + r*1.4);
  ctx.moveTo(x - r*0.05, y + r*0.5); ctx.lineTo(x + r*0.85, y + r*1.4);
  ctx.stroke();

  // casaco esvoaçante (atrás do corpo)
  ctx.fillStyle = shirt;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.moveTo(x - r*0.5, y - r*0.1);
  ctx.lineTo(x - r*1.3, y + r*1.3);
  ctx.lineTo(x - r*0.7, y + r*1.1);
  ctx.lineTo(x - r*0.45, y + r*0.55);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x + r*0.5, y - r*0.1);
  ctx.lineTo(x + r*1.3, y + r*1.3);
  ctx.lineTo(x + r*0.7, y + r*1.1);
  ctx.lineTo(x + r*0.45, y + r*0.55);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;

  // tronco / camisa por baixo
  ctx.fillStyle = '#1f2937';
  ctx.beginPath();
  ctx.moveTo(x - r*0.42, y + r*0.55);
  ctx.lineTo(x - r*0.35, y - r*0.05);
  ctx.lineTo(x + r*0.35, y - r*0.05);
  ctx.lineTo(x + r*0.42, y + r*0.55);
  ctx.closePath();
  ctx.fill();

  // gola alta do casaco
  ctx.fillStyle = shirt;
  ctx.beginPath();
  ctx.moveTo(x - r*0.4, y - r*0.05);
  ctx.lineTo(x - r*0.3, y - r*0.5);
  ctx.lineTo(x, y - r*0.3);
  ctx.lineTo(x + r*0.3, y - r*0.5);
  ctx.lineTo(x + r*0.4, y - r*0.05);
  ctx.closePath();
  ctx.fill();

  // braços abertos (postura de área de efeito)
  ctx.strokeStyle = shirt;
  ctx.lineWidth   = armW;
  ctx.lineCap     = 'round';
  ctx.beginPath();
  ctx.moveTo(x - r*0.32, y + r*0.05); ctx.lineTo(x - r*1.1, y - r*0.35);
  ctx.moveTo(x + r*0.32, y + r*0.05); ctx.lineTo(x + r*1.1, y - r*0.35);
  ctx.stroke();

  // mãos
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.arc(x - r*1.1, y - r*0.35, Math.max(2.5, r*0.18), 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + r*1.1, y - r*0.35, Math.max(2.5, r*0.18), 0, Math.PI*2); ctx.fill();

  // brilho de energia nas mãos (combina com a torre AoE)
  ctx.fillStyle = shirt;
  ctx.globalAlpha = 0.5;
  ctx.beginPath(); ctx.arc(x - r*1.1, y - r*0.35, r*0.32, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + r*1.1, y - r*0.35, r*0.32, 0, Math.PI*2); ctx.fill();
  ctx.globalAlpha = 1;

  // cabeça
  const hx = x, hy = y - r*0.4;
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(hx, hy, r*0.48, 0, Math.PI*2);
  ctx.fill();

  // venda cobrindo os olhos
  ctx.fillStyle = blind;
  ctx.fillRect(hx - r*0.46, hy - r*0.12, r*0.92, r*0.2);
  // nó da venda na lateral
  ctx.beginPath();
  ctx.moveTo(hx - r*0.46, hy - r*0.02);
  ctx.lineTo(hx - r*0.7,  hy + r*0.05);
  ctx.lineTo(hx - r*0.46, hy + r*0.08);
  ctx.closePath();
  ctx.fill();

  // cabelo branco espetado
  ctx.fillStyle = hair;
  const hr = r*0.55;
  ctx.beginPath();
  for (let i = -3; i <= 3; i++) {
    const ang = (i / 3) * (Math.PI*0.55) - Math.PI/2;
    const baseX = hx + Math.cos(ang)*hr*0.8;
    const baseY = hy + Math.sin(ang)*hr*0.8;
    const tipX  = hx + Math.cos(ang)*hr*2.0;
    const tipY  = hy + Math.sin(ang)*hr*2.0;
    ctx.moveTo(baseX - 2, baseY);
    ctx.lineTo(tipX, tipY);
    ctx.lineTo(baseX + 2, baseY);
  }
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(hx, hy, hr*0.95, Math.PI, 0);
  ctx.fill();

  ctx.restore();
}

function drawTowers() {
  state.towers.forEach(t => {
    ctx.fillStyle = t === selectedTowerObj ? '#ffffff15' : '#00000033';
    ctx.fillRect(t.cx*CELL+2, t.cy*CELL+2, CELL-4, CELL-4);

    const r = CELL * 0.27;
    if (t.type === 'basic') {
      drawBasicCharacter(t, r);
    } else if (t.type === 'slow') {
      drawPirateCharacter(t, r);
    } else if (t.type === 'sniper') {
      drawSniperCharacter(t, r);
    } else if (t.type === 'aoe') {
      drawAoeCharacter(t, r);
    }

    const mi = t.targetMode === 'first' ? '▶' : t.targetMode === 'last' ? '◀' : '★';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font      = `${Math.max(8, CELL*0.2)}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(mi, t.x, t.cy*CELL + CELL - 4);

    if (t.level > 1) {
      ctx.fillStyle = '#fbbf24';
      for (let s = 0; s < t.level - 1; s++) {
        ctx.beginPath(); ctx.arc(t.x - 4 + s*8, t.y + CELL*0.35, 3, 0, Math.PI*2); ctx.fill();
      }
    }

    if (t === selectedTowerObj) {
      ctx.strokeStyle = t.color + '55';
      ctx.lineWidth   = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.arc(t.x, t.y, t.range*CELL, 0, Math.PI*2); ctx.stroke();
      ctx.setLineDash([]);
    }
  });
}

function drawEnemies() {
  state.enemies.forEach(en => {
    if (en.slowTimer > 0) {
      ctx.strokeStyle = '#34d399'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(en.x, en.y, en.size+3, 0, Math.PI*2); ctx.stroke();
    }
    ctx.fillStyle = en.color;
    ctx.beginPath(); ctx.arc(en.x, en.y, en.size, 0, Math.PI*2); ctx.fill();

    const bw = en.size*2+4, bh = 4, bx = en.x-bw/2, by = en.y-en.size-8;
    ctx.fillStyle = '#1f2937'; ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = en.hp > en.maxHp*0.5 ? '#22c55e' : en.hp > en.maxHp*0.25 ? '#eab308' : '#ef4444';
    ctx.fillRect(bx, by, bw*(en.hp/en.maxHp), bh);
  });
}

function drawProjectiles() {
  state.projectiles.forEach(p => {
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI*2); ctx.fill();
  });
}

function drawParticles() {
  state.particles.forEach(p => {
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle   = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI*2); ctx.fill();
  });
  ctx.globalAlpha = 1;
}

// ─────────────────────────────────────────────
//  GAME LOOP
// ─────────────────────────────────────────────
function showMsg(win) {
  state.gameOver = true;
  cancelAnimationFrame(animId);
  document.getElementById('msg-title').textContent = win ? '🏆 Vitória!' : '💀 Game Over';
  document.getElementById('msg-sub').textContent   = `Onda ${state.waveNum} | Score: ${state.score}`;
  document.getElementById('msg').style.display     = 'block';
}

function restartGame() {
  document.getElementById('msg').style.display = 'none';
  if (animId) cancelAnimationFrame(animId);
  initState();
  updateUI();
  lastTime = 0;
  animId = requestAnimationFrame(loop);
}

function loop(ts) {
  const dt = Math.min((ts - (lastTime || ts)) / 1000, 0.05);
  lastTime = ts;
  update(dt);
  draw();
  if (!state.gameOver) animId = requestAnimationFrame(loop);
}

// ─────────────────────────────────────────────
//  EVENTS
// ─────────────────────────────────────────────
canvas.addEventListener('click', e => {
  const r  = canvas.getBoundingClientRect();
  const cx = Math.floor((e.clientX - r.left) / CELL);
  const cy = Math.floor((e.clientY - r.top)  / CELL);
  const clicked = state.towers.find(t => t.cx === cx && t.cy === cy);
  if (clicked) { selectedTowerObj = clicked; showTip(clicked); return; }
  selectedTowerObj = null;
  hideTip();
  placeTower(cx, cy);
});

canvas.addEventListener('mousemove', e => { mousePos = e; });
canvas.addEventListener('mouseleave', () => { mousePos = null; });
window.addEventListener('resize', () => { resize(); });

window.addEventListener('keydown', e => {
  if ((e.key === 'r' || e.key === 'R') && selectedTowerObj) {
    selectedTowerObj.facing *= -1;
  }
});

function startGame() {
  document.getElementById('start-menu').style.display = 'none';
  lastTime = 0;
  animId = requestAnimationFrame(loop);
}

// ─────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────
resize();
initState();
updateUI();
// O loop do jogo só começa depois que o jogador clicar em "Começar Jogo"