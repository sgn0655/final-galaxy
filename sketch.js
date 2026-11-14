/*
 * GALAXY SHOOT - web edition of sketch_261114a.pde
 * Original source: https://github.com/sgn0655/final-galaxy
 * Native Canvas 2D with projected 3D coordinates. No libraries or network needed.
 * Rules preserved: automatic fire, mouse/touch movement, four enemy formations,
 * 7-frame Shift parry, 78-frame failed-parry cooldown, enemy firing up to x3.
 */
'use strict';

(() => {
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  const el = {
    score: document.getElementById('score'), lives: document.getElementById('lives'),
    wave: document.getElementById('wave'), pattern: document.getElementById('pattern'),
    fireRate: document.getElementById('fireRate'), notice: document.getElementById('notice'),
    parryState: document.getElementById('parryState'), parryBtn: document.getElementById('parryBtn'),
    pauseBtn: document.getElementById('pauseBtn'), overlay: document.getElementById('overlay'),
    overlayTitle: document.getElementById('overlayTitle'), overlayInfo: document.getElementById('overlayInfo'),
    startBtn: document.getElementById('startBtn')
  };
  if (!ctx) {
    document.getElementById('overlayInfo').textContent = '브라우저가 Canvas를 지원하지 않습니다.';
    return;
  }

  const W = 960, H = 720;
  const GRID = 0, V_FORM = 1, WAVE = 2, RING = 3;
  const PATTERN_NAMES = ['GRID', 'V-FORM', 'WAVE', 'RING'];
  const ENEMY_Z = -560, PLAYER_Z = 220;
  const PARRY_WINDOW = 7, PARRY_FAIL_CD = 78;
  const CAMERA_Y = -120, CAMERA_Z = 580;
  const pitchLength = Math.hypot(115, 880);
  const fY = 115 / pitchLength, fZ = -880 / pitchLength;
  const focal = H / (2 * Math.tan(Math.PI / 6));
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const choice = array => array[Math.floor(Math.random() * array.length)];
  const rgba = (r, g, b, a = 1) => `rgba(${r},${g},${b},${clamp(a, 0, 1)})`;

  const game = {
    mode: 'menu', score: 0, lives: 3, wave: 1, tick: 0,
    pattern: GRID, lastPattern: -1, fireCooldown: 0,
    enemyFireTimer: 70, invincible: 0, waveWait: -1,
    parryFrames: 0, parryCooldown: 0, parryOK: 0, parryNG: 0,
    px: 0, py: 90, tx: 0, ty: 90, mouseControl: false,
    formationX: 0, enemySpeed: 1.5, enemyDir: 1,
    enemies: [], bullets: [], particles: [], stars: [],
    noticeText: '', noticeFrames: 0
  };
  const pressed = { left: false, right: false, up: false, down: false, shift: false };
  const dragging = { id: null, x: 0, y: 0, px: 0, py: 0 };
  let cssWidth = 960, cssHeight = 720, dpr = 1;

  // Original Processing camera perspective converted to Canvas coordinates.
  function project(x, y, z) {
    const yy = y - CAMERA_Y, zz = z - CAMERA_Z;
    const depth = yy * fY + zz * fZ;
    if (depth <= 8) return null;
    return {
      x: W / 2 + x * focal / depth,
      y: H / 2 + (zz * fY - yy * fZ) * focal / depth,
      scale: focal / depth,
      depth
    };
  }

  function drawLine3D(a, b, color, width = 1) {
    const p = project(...a), q = project(...b);
    if (!p || !q) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
  }

  function poly3D(points, fill, stroke = null, lineWidth = 1) {
    const screen = points.map(p => project(...p));
    if (screen.some(p => !p)) return;
    ctx.beginPath(); ctx.moveTo(screen[0].x, screen[0].y);
    for (let i = 1; i < screen.length; i++) ctx.lineTo(screen[i].x, screen[i].y);
    ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
    if (stroke) { ctx.lineWidth = lineWidth; ctx.strokeStyle = stroke; ctx.stroke(); }
  }

  function glowBall(x, y, z, radius, color, glow = 12) {
    const p = project(x, y, z);
    if (!p) return;
    const r = Math.max(.2, radius * p.scale);
    if (r < .15) return;
    ctx.save();
    ctx.shadowColor = color; ctx.shadowBlur = glow;
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function createStar() {
    return { x: rand(-1300, 1300), y: rand(-800, 500), z: -2500,
      speed: rand(4, 12), size: rand(1, 3) };
  }
  function resetStar(star) { Object.assign(star, createStar()); }

  function enemyFireRate() { return Math.min(3, 1 + (game.wave - 1) * .1); }
  function setNotice(text, frames = 50) { game.noticeText = text; game.noticeFrames = frames; }

  function resetGame() {
    Object.assign(game, {
      score: 0, lives: 3, wave: 1, tick: 0,
      pattern: GRID, lastPattern: -1, fireCooldown: 0,
      invincible: 0, waveWait: -1, parryFrames: 0,
      parryCooldown: 0, parryOK: 0, parryNG: 0,
      px: 0, py: 90, tx: 0, ty: 90, mouseControl: false,
      noticeText: '', noticeFrames: 0
    });
    game.bullets.length = 0;
    game.particles.length = 0;
    dragging.id = null;
    pressed.left = pressed.right = pressed.up = pressed.down = false;
    createWave();
  }

  function addEnemy(tx, ty, type) {
    const mode = Math.floor(rand(0, 3));
    let x, y, z;
    if (mode === 0) {
      x = tx * 1.8; y = ty + rand(-90, 90); z = -2300 - rand(0, 400);
    } else if (mode === 1) {
      x = Math.random() < .5 ? -850 : 850;
      y = ty + rand(-80, 80); z = -1900 - rand(0, 400);
    } else {
      x = tx + rand(-500, 500); y = ty + rand(-120, 120); z = -2600;
    }
    const e = { x, y, z, tx, ty, type, age: 0, arriving: true,
      phase: rand(0, Math.PI * 2), orbitAngle: 0, arriveRate: rand(.07, .11) };
    game.enemies.push(e);
    return e;
  }

  function createWave() {
    game.enemies.length = 0;
    game.bullets.length = 0;
    game.formationX = 0;
    game.enemyDir = 1;
    game.enemySpeed = Math.min(1.2 + game.wave * .18, 3.2);
    game.enemyFireTimer = Math.max(1, Math.round(70 / enemyFireRate()));
    game.waveWait = -1;
    do { game.pattern = Math.floor(rand(0, 4)); }
    while (game.pattern === game.lastPattern);
    game.lastPattern = game.pattern;
    if (game.pattern === GRID) {
      for (let row = 0; row < 3; row++)
        for (let col = 0; col < 7; col++) addEnemy((col - 3) * 70, -78 + row * 72, row);
    } else if (game.pattern === V_FORM) {
      for (let i = -4; i <= 4; i++) addEnemy(i * 55, -65 + Math.abs(i) * 24, Math.abs(i) % 3);
      for (let i = -3; i <= 3; i++) addEnemy(i * 53, 30 + Math.abs(i) * 22, (Math.abs(i) + 1) % 3);
    } else if (game.pattern === WAVE) {
      for (let i = 0; i < 17; i++) addEnemy(lerp(-230, 230, i / 16), Math.sin(i * .7) * 78, i % 3);
    } else {
      for (let i = 0; i < 18; i++) {
        const a = Math.PI * 2 * i / 18;
        addEnemy(Math.cos(a) * 205, Math.sin(a) * 86, i % 3).orbitAngle = a;
      }
    }
  }

  function startGame() {
    resetGame();
    game.mode = 'playing';
    refreshOverlay();
  }

  function refreshOverlay() {
    if (game.mode === 'playing') { el.overlay.hidden = true; return; }
    el.overlay.hidden = false;
    if (game.mode === 'paused') {
      el.overlayTitle.innerHTML = 'PAUSED';
      el.overlayInfo.textContent = `SCORE ${game.score}  ·  WAVE ${game.wave}`;
      el.startBtn.textContent = '계속하기';
    } else if (game.mode === 'gameover') {
      el.overlayTitle.innerHTML = 'GAME<br>OVER';
      el.overlayInfo.textContent = `SCORE ${game.score}  ·  WAVE ${game.wave}`;
      el.startBtn.textContent = '다시 시작';
    } else {
      el.overlayTitle.innerHTML = 'GALAXY<br>SHOOT';
      el.overlayInfo.textContent = 'AUTO FIRE · PERFECT PARRY';
      el.startBtn.textContent = '게임 시작';
    }
  }

  function togglePause() {
    if (game.mode === 'playing') game.mode = 'paused';
    else if (game.mode === 'paused') game.mode = 'playing';
    else return;
    refreshOverlay();
  }

  function fireBullet(x, y, z, vx, vy, vz, friendly) {
    game.bullets.push({ x, y, z, vx, vy, vz, friendly });
  }

  function startParry() {
    if (game.mode !== 'playing' || game.parryCooldown || game.parryFrames) return;
    game.parryFrames = PARRY_WINDOW;
  }

  function burst(x, y, z, color) {
    for (let i = 0; i < 25; i++) {
      game.particles.push({ x, y, z,
        vx: rand(-6, 6), vy: rand(-6, 6), vz: rand(-6, 6),
        life: Math.floor(rand(18, 35)), color });
    }
    if (game.particles.length > 750) game.particles.splice(0, game.particles.length - 750);
  }

  function perfectParry() {
    game.parryFrames = 0;
    game.parryCooldown = 0;
    game.parryOK = 25;
    game.parryNG = 0;
    game.score += 50;
    burst(game.px, game.py, PLAYER_Z, '#20f7ff');
    fireBullet(game.px, game.py, PLAYER_Z - 55, 0, 0, -60, true);
    setNotice('PERFECT PARRY! +50', 25);
  }

  function moveEnemies() {
    if (!game.enemies.length) return;
    if (game.pattern !== RING) {
      let lo = Infinity, hi = -Infinity;
      for (const e of game.enemies) { lo = Math.min(lo, e.tx); hi = Math.max(hi, e.tx); }
      if (game.formationX + hi > 250 || game.formationX + lo < -250) game.enemyDir *= -1;
      game.formationX += game.enemyDir * game.enemySpeed * (game.pattern === WAVE ? .8 : 1);
    }
    for (const e of game.enemies) {
      if (e.arriving) {
        const gx = e.tx + (game.pattern === RING ? 0 : game.formationX);
        e.x = lerp(e.x, gx, e.arriveRate);
        e.y = lerp(e.y, e.ty, e.arriveRate);
        e.z = lerp(e.z, ENEMY_Z, e.arriveRate);
        if (Math.abs(e.x - gx) < 4 && Math.abs(e.y - e.ty) < 4 && Math.abs(e.z - ENEMY_Z) < 9) {
          e.arriving = false; e.z = ENEMY_Z;
        }
      } else {
        e.age++;
        e.z = ENEMY_Z;
        if (game.pattern === RING) {
          const a = e.orbitAngle + e.age * .008;
          e.x = Math.cos(a) * 205;
          e.y = Math.sin(a) * 86;
        } else {
          e.x = clamp(e.tx + game.formationX, -260, 260);
          e.y = clamp(e.ty + Math.sin(e.age * .04 + e.phase) * (game.pattern === WAVE ? 15 : 7), -105, 105);
        }
      }
    }
    game.enemyFireTimer--;
    if (game.enemyFireTimer > 0) return;
    const ready = game.enemies.filter(e => !e.arriving);
    if (ready.length) {
      const e = choice(ready);
      let vx = game.px - e.x, vy = game.py - e.y, vz = PLAYER_Z - e.z;
      const len = Math.hypot(vx, vy, vz) || 1;
      vx *= 9 / len; vy *= 9 / len; vz *= 9 / len;
      fireBullet(e.x, e.y, e.z + 20, vx, vy, vz, false);
    }
    game.enemyFireTimer = Math.max(1, Math.round(rand(42, 85) / enemyFireRate()));
  }

  // Checks the full bullet movement segment, avoiding missed collisions at high speed.
  function segmentHit(a, b, x, y, z, rx, ry, rz) {
    if (Math.max(a.z, b.z) < z - rz || Math.min(a.z, b.z) > z + rz) return false;
    const t = Math.abs(b.z - a.z) < .0001 ? 0 : clamp((z - a.z) / (b.z - a.z), 0, 1);
    return Math.abs(lerp(a.x, b.x, t) - x) <= rx && Math.abs(lerp(a.y, b.y, t) - y) <= ry;
  }

  function moveBullets() {
    for (let i = game.bullets.length - 1; i >= 0; i--) {
      const b = game.bullets[i];
      const old = { x: b.x, y: b.y, z: b.z };
      b.x += b.vx; b.y += b.vy; b.z += b.vz;
      let hit = false;
      if (b.friendly) {
        for (let j = game.enemies.length - 1; j >= 0; j--) {
          const e = game.enemies[j];
          if (segmentHit(old, b, e.x, e.y, e.z, 33, 24, 25)) {
            game.score += 40 - e.type * 10;
            burst(e.x, e.y, e.z, '#ff9954');
            game.enemies.splice(j, 1);
            hit = true; break;
          }
        }
      } else if (game.invincible === 0 && segmentHit(old, b, game.px, game.py, PLAYER_Z, 34, 28, 35)) {
        if (game.parryFrames > 0) perfectParry();
        else {
          game.lives--;
          game.invincible = 75;
          burst(game.px, game.py, PLAYER_Z, '#ff4270');
          setNotice('HIT!  -1 LIFE', 35);
          if (game.lives <= 0) { game.mode = 'gameover'; refreshOverlay(); }
        }
        hit = true;
      }
      if (hit || b.z < -3000 || b.z > 680 || Math.abs(b.x) > 1300 || Math.abs(b.y) > 1000) {
        game.bullets.splice(i, 1);
      }
    }
  }

  function updateGame() {
    game.tick++;
    const dx = Number(pressed.right) - Number(pressed.left);
    const dy = Number(pressed.down) - Number(pressed.up);
    if (dx || dy) {
      game.mouseControl = false;
      const norm = dx && dy ? Math.SQRT1_2 : 1;
      game.px += dx * 5.5 * norm;
      game.py += dy * 5.5 * norm;
    } else if (game.mouseControl) {
      game.px = lerp(game.px, game.tx, .52);
      game.py = lerp(game.py, game.ty, .52);
    }
    game.px = clamp(game.px, -280, 280);
    game.py = clamp(game.py, -125, 135);

    // Original game: fires automatically every 9 frames.
    if (game.fireCooldown > 0) game.fireCooldown--;
    if (game.fireCooldown === 0) {
      fireBullet(game.px, game.py, PLAYER_Z - 55, 0, 0, -52, true);
      game.fireCooldown = 9;
    }
    if (game.invincible > 0) game.invincible--;
    moveEnemies();
    moveBullets();

    if (game.parryOK > 0) game.parryOK--;
    if (game.parryNG > 0) game.parryNG--;
    if (game.parryCooldown > 0) game.parryCooldown--;
    if (game.parryFrames > 0) {
      game.parryFrames--;
      if (game.parryFrames === 0) {
        game.parryCooldown = PARRY_FAIL_CD;
        game.parryNG = 25;
        setNotice('PARRY FAILED', 24);
      }
    }
    if (game.noticeFrames > 0) game.noticeFrames--;
    for (let i = game.particles.length - 1; i >= 0; i--) {
      const p = game.particles[i];
      p.x += p.vx; p.y += p.vy; p.z += p.vz;
      p.vx *= .97; p.vy *= .97; p.vz *= .97;
      if (--p.life <= 0) game.particles.splice(i, 1);
    }
    moveStars();
    if (game.mode === 'playing' && game.enemies.length === 0) {
      if (game.waveWait < 0) {
        game.waveWait = 100;
        game.score += 250;
        setNotice('WAVE CLEAR! +250', 90);
      } else if (--game.waveWait <= 0) {
        game.wave++;
        createWave();
      }
    }
  }

  function moveStars() {
    for (const s of game.stars) {
      s.z += s.speed;
      if (s.z > 520) resetStar(s);
    }
  }

  function renderBackground() {
    ctx.fillStyle = '#030714'; ctx.fillRect(0, 0, W, H);
    const nebula = ctx.createRadialGradient(480, 320, 0, 480, 320, 650);
    nebula.addColorStop(0, '#14254e'); nebula.addColorStop(.56, '#060f29'); nebula.addColorStop(1, '#02040e');
    ctx.fillStyle = nebula; ctx.fillRect(0, 0, W, H);
    for (const s of game.stars) {
      const p = project(s.x, s.y, s.z);
      if (!p || p.x < -12 || p.x > W + 12 || p.y < -12 || p.y > H + 12) continue;
      const size = clamp(s.size * p.scale * 2.2, .5, 3.5);
      ctx.fillStyle = rgba(190, 216, 255, clamp(.35 + 0.00035 * (s.z + 2500), .32, 1));
      ctx.fillRect(p.x, p.y, size, size);
    }
    // The moving 3-D perspective floor grid from the Processing sketch.
    ctx.save();
    for (let x = -700; x <= 700; x += 100)
      drawLine3D([x, 185, -1700], [x, 185, 480], 'rgba(43,100,165,.28)', .9);
    const shift = (game.tick * 3) % 100;
    for (let z = -1700; z <= 400; z += 100)
      drawLine3D([-700, 185, z + shift], [700, 185, z + shift], 'rgba(43,100,165,.28)', .9);
    ctx.restore();
  }

  function drawEnemy(e) {
    // Rotate model vertices around Z, as in the original 3-D rendering.
    const angle = Math.sin(game.tick * .025 + e.phase) * (e.arriving ? .28 : .07);
    const co = Math.cos(angle), si = Math.sin(angle);
    const p = (x, y, z) => [e.x + x * co - y * si, e.y + x * si + y * co, e.z + z];
    const base = ['#ff557a', '#ff9a39', '#4ce79a'][e.type];
    const pale = ['#ffa1b4', '#ffd08a', '#acf9cc'][e.type];
    const body = ['#c5315b', '#ce6b25', '#238a68'][e.type];
    // Far-to-near surfaces, each in true projected 3-D coordinates.
    poly3D([p(-38, 5, -13), p(-8, -2, -23), p(-5, 4, 19), p(-38, 5, 17)], body);
    poly3D([p(8, -2, -23), p(38, 5, -13), p(38, 5, 17), p(5, 4, 19)], body);
    poly3D([p(-33, 3, -9), p(-10, -4, -18), p(-10, 1, 9), p(-33, 5, 8)], base);
    poly3D([p(10, -4, -18), p(33, 3, -9), p(33, 5, 8), p(10, 1, 9)], base);
    poly3D([p(0, -14, -32), p(-17, 0, -7), p(-11, 3, 23), p(11, 3, 23), p(17, 0, -7)], base);
    poly3D([p(0, -17, -20), p(-9, -8, 3), p(0, -7, 10), p(9, -8, 3)], pale);
    for (const side of [-1, 1]) {
      poly3D([p(side * 25, -3, -3), p(side * 38, -3, -3), p(side * 38, -4, 18), p(side * 25, -4, 18)], '#767b9b');
      glowBall(...p(side * 30, -10, 3), 4, '#ff4d55', 6);
    }
    if (e.arriving) {
      glowBall(...p(0, 0, 40), 6, '#ff9e32', 10);
    }
  }

  function drawPlayer() {
    if (game.invincible > 0 && game.tick % 8 < 4) return;
    const x = game.px, y = game.py, z = PLAYER_Z;
    const p = (dx, dy, dz) => [x + dx, y + dy, z + dz];
    // The same fuselage, triangular nose, wings, cockpit and twin blue thrusters.
    poly3D([p(-12, -6, -30), p(12, -6, -30), p(13, 7, 44), p(-13, 7, 44)], '#637da5');
    poly3D([p(0, -4, -65), p(-15, -4, -15), p(15, -4, -15)], '#d4eaff');
    poly3D([p(-11, -4, -19), p(-67, 2, 26), p(-62, 2, 40), p(-10, 0, 20)], '#2883eb', '#81cbff', .7);
    poly3D([p(11, -4, -19), p(67, 2, 26), p(62, 2, 40), p(10, 0, 20)], '#2883eb', '#81cbff', .7);
    poly3D([p(-12, -7, -17), p(0, -12, -36), p(12, -7, -17), p(13, 1, 45), p(-13, 1, 45)], '#bfd4ef');
    poly3D([p(-8, -10, -20), p(8, -10, -20), p(10, -13, 17), p(-10, -13, 17)], '#13c7f7', '#b3f8ff', .9);
    for (const side of [-1, 1]) {
      poly3D([p(side * 6, 0, 30), p(side * 19, 0, 30), p(side * 19, 11, 47), p(side * 6, 11, 47)], '#60789d');
      glowBall(...p(side * 12, 2, 54), 6, '#33edff', 15);
    }
    if (game.parryFrames > 0 || game.parryOK > 0) {
      const a = project(x, y, z);
      if (a) {
        const size = (48 + (25 - game.parryOK) * .5) * a.scale;
        ctx.save(); ctx.strokeStyle = game.parryFrames > 0 ? '#27efff' : 'rgba(45,246,255,.65)';
        ctx.lineWidth = 2.8; ctx.shadowColor = '#00deff'; ctx.shadowBlur = 25;
        ctx.beginPath(); ctx.ellipse(a.x, a.y, size, size * .85, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
    }
  }

  function renderBullets() {
    for (const b of game.bullets) {
      const a = project(b.x, b.y, b.z);
      const tail = project(b.x - b.vx * 2, b.y - b.vy * 2, b.z - b.vz * 2);
      if (!a || !tail) continue;
      ctx.save();
      const c = b.friendly ? '#42f3ff' : '#ff4d78';
      ctx.lineCap = 'round'; ctx.strokeStyle = c; ctx.shadowColor = c; ctx.shadowBlur = 13;
      ctx.lineWidth = b.friendly ? 4 : 6;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(tail.x, tail.y); ctx.stroke();
      ctx.lineWidth = 1.4; ctx.strokeStyle = '#f5ffff';
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(tail.x, tail.y); ctx.stroke();
      ctx.restore();
    }
  }

  function renderParticles() {
    ctx.save();
    for (const p of game.particles) {
      const s = project(p.x, p.y, p.z);
      if (!s) continue;
      ctx.globalAlpha = Math.min(1, p.life * .06);
      ctx.fillStyle = p.color;
      ctx.fillRect(s.x, s.y, 3, 3);
    }
    ctx.restore();
  }

  function renderAim() {
    if (game.mode === 'menu' || game.mode === 'gameover') return;
    const a = project(game.px, game.py, ENEMY_Z);
    if (!a) return;
    ctx.save();
    ctx.strokeStyle = '#48f1ff'; ctx.shadowColor = '#00bfff'; ctx.shadowBlur = 12;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(a.x, a.y, 14, 0, Math.PI * 2); ctx.stroke();
    const d = [[-25,0,-10,0],[10,0,25,0],[0,-25,0,-10],[0,10,0,25]];
    for (const [x1, y1, x2, y2] of d) {
      ctx.beginPath(); ctx.moveTo(a.x + x1, a.y + y1); ctx.lineTo(a.x + x2, a.y + y2); ctx.stroke();
    }
    ctx.restore();
  }

  function draw() {
    ctx.setTransform(dpr * cssWidth / W, 0, 0, dpr * cssHeight / H, 0, 0);
    renderBackground();
    // Sorting by depth: farther ships behind approaching ones.
    const enemySort = game.enemies.slice().sort((a, b) => a.z - b.z);
    for (const e of enemySort) drawEnemy(e);
    renderBullets();
    renderParticles();
    drawPlayer();
    renderAim();
  }

  function refreshHud() {
    el.score.textContent = game.score.toLocaleString('en-US');
    el.lives.textContent = game.lives > 0 ? '♥ '.repeat(game.lives).trim() : '0';
    el.wave.textContent = `WAVE ${game.wave}`;
    el.pattern.textContent = PATTERN_NAMES[game.pattern];
    el.fireRate.textContent = `ENEMY FIRE ×${enemyFireRate().toFixed(1)}`;
    if (game.parryFrames > 0) {
      el.parryState.textContent = 'PARRY ACTIVE!';
      el.parryState.style.color = '#45f1ff';
    } else if (game.parryCooldown > 0) {
      el.parryState.textContent = `PARRY ${ (game.parryCooldown / 60).toFixed(1) }s`;
      el.parryState.style.color = '#ff9c82';
    } else {
      el.parryState.textContent = 'PARRY READY';
      el.parryState.style.color = '#8fffd1';
    }
    el.parryBtn.classList.toggle('cooldown', game.parryCooldown > 0);
    el.parryBtn.classList.toggle('active', game.parryFrames > 0);
    el.parryBtn.setAttribute('aria-disabled', String(game.parryCooldown > 0));
    el.pauseBtn.textContent = game.mode === 'paused' ? '▶ 계속' : 'Ⅱ 일시정지';
    el.notice.textContent = game.noticeText;
    el.notice.style.opacity = game.noticeFrames > 0 ? '1' : '0';
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    cssWidth = Math.max(1, rect.width);
    cssHeight = Math.max(1, rect.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(cssWidth * dpr));
    canvas.height = Math.max(1, Math.round(cssHeight * dpr));
  }

  function pointerPos(evt) {
    const rect = canvas.getBoundingClientRect();
    return { x: (evt.clientX - rect.left) / rect.width * W,
      y: (evt.clientY - rect.top) / rect.height * H };
  }

  // Matches the Processing sketch's setMouseTarget inverse projection.
  function setMouseTarget(mx, my) {
    const ratio = (my - H / 2) / focal;
    const den = ratio * fY + fZ;
    if (Math.abs(den) < .0001) return;
    const y = CAMERA_Y + (PLAYER_Z - CAMERA_Z) * (fY - ratio * fZ) / den;
    const depth = (y - CAMERA_Y) * fY + (PLAYER_Z - CAMERA_Z) * fZ;
    const x = (mx - W / 2) * depth / focal;
    game.tx = clamp(x, -280, 280);
    game.ty = clamp(y, -125, 135);
    game.mouseControl = true;
  }

  function onPointerDown(evt) {
    if (game.mode !== 'playing') return;
    evt.preventDefault();
    dragging.id = evt.pointerId;
    const p = pointerPos(evt);
    dragging.x = p.x; dragging.y = p.y;
    dragging.px = game.px; dragging.py = game.py;
    canvas.setPointerCapture?.(evt.pointerId);
  }
  function onPointerMove(evt) {
    if (game.mode !== 'playing') return;
    const p = pointerPos(evt);
    if (dragging.id === evt.pointerId) {
      game.tx = clamp(dragging.px + (p.x - dragging.x) * 560 / W, -280, 280);
      game.ty = clamp(dragging.py + (p.y - dragging.y) * 440 / H, -125, 135);
      game.mouseControl = true;
    } else if (evt.pointerType === 'mouse' && dragging.id === null) {
      setMouseTarget(p.x, p.y);
    }
  }
  function onPointerUp(evt) {
    if (dragging.id === evt.pointerId) dragging.id = null;
  }

  function keySet(key, active) {
    switch (key.toLowerCase()) {
      case 'arrowleft': case 'a': pressed.left = active; return true;
      case 'arrowright': case 'd': pressed.right = active; return true;
      case 'arrowup': case 'w': pressed.up = active; return true;
      case 'arrowdown': case 's': pressed.down = active; return true;
      default: return false;
    }
  }

  document.addEventListener('keydown', evt => {
    if (keySet(evt.key, true)) evt.preventDefault();
    if (evt.key === 'Shift') {
      if (!pressed.shift) startParry();
      pressed.shift = true; evt.preventDefault();
    }
    if (evt.repeat) return;
    if (evt.key === 'Enter' || evt.key === ' ') {
      if (game.mode === 'menu' || game.mode === 'gameover') startGame();
      else if (game.mode === 'paused') togglePause();
      evt.preventDefault();
    }
    if (evt.key.toLowerCase() === 'p') togglePause();
    if (evt.key.toLowerCase() === 'r') startGame();
  });
  document.addEventListener('keyup', evt => {
    keySet(evt.key, false);
    if (evt.key === 'Shift') pressed.shift = false;
  });
  window.addEventListener('blur', () => {
    pressed.left = pressed.right = pressed.up = pressed.down = pressed.shift = false;
    dragging.id = null;
    if (game.mode === 'playing') togglePause();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.mode === 'playing') togglePause();
  });
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('lostpointercapture', onPointerUp);
  el.parryBtn.addEventListener('pointerdown', evt => { evt.preventDefault(); startParry(); });
  el.pauseBtn.addEventListener('click', togglePause);
  el.startBtn.addEventListener('click', () => {
    if (game.mode === 'paused') togglePause(); else startGame();
  });
  window.addEventListener('resize', resize);
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(resize).observe(canvas);

  for (let i = 0; i < 270; i++) {
    const s = createStar(); s.z = rand(-2500, 500); game.stars.push(s);
  }
  resetGame();
  game.mode = 'menu';
  refreshOverlay();
  resize();
  refreshHud();

  const FRAME = 1000 / 60;
  let then = performance.now(), accumulator = 0;
  function animate(now) {
    const dt = Math.min(100, now - then);
    then = now;
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FRAME && steps < 5) {
      if (game.mode === 'playing') updateGame();
      else if (game.mode === 'menu' || game.mode === 'gameover') moveStars();
      accumulator -= FRAME;
      steps++;
    }
    draw(); refreshHud();
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);
})();
