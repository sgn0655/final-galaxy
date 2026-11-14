import java.util.ArrayList;

// GALAXY SHOOT
// Processing Java Mode
// Automatic Fire / Mouse Control / Shift Parry

final int GRID = 0;
final int V_FORM = 1;
final int WAVE = 2;
final int RING = 3;

final float ENEMY_Z = -560;
final float PLAYER_Z = 220;

final int PARRY_WINDOW = 7;
final int PARRY_FAIL_CD = 78;

ArrayList<Enemy> enemies = new ArrayList<Enemy>();
ArrayList<Bullet> bullets = new ArrayList<Bullet>();
ArrayList<Particle> particles = new ArrayList<Particle>();
ArrayList<Star> stars = new ArrayList<Star>();

int state = 0;
int score = 0;
int lives = 3;
int wave = 1;
int tick = 0;

int pattern = GRID;
int lastPattern = -1;

int fireCooldown = 0;
int enemyFireTimer = 70;
int invincible = 0;
int waveWait = -1;

int parryFrames = 0;
int parryCooldown = 0;
int parryOK = 0;
int parryNG = 0;

float px = 0;
float py = 90;
float targetX = 0;
float targetY = 90;

float formationX = 0;
float enemySpeed = 1.5;
int enemyDir = 1;

float aimX;
float aimY;

boolean mouseControl = false;
boolean dragging = false;
boolean parryHeld = false;

float dragStartX;
float dragStartY;
float dragShipX;
float dragShipY;

boolean left = false;
boolean right = false;
boolean up = false;
boolean down = false;


// =====================================
// SETUP - settings() 중복 오류 수정
// =====================================

void setup() {
  size(960, 720, P3D);
  smooth(4);
  frameRate(60);
  sphereDetail(12);

  for (int i = 0; i < 270; i++) {
    stars.add(new Star());
  }

  resetGame();
  state = 0;
}


// =====================================
// DRAW
// =====================================

void draw() {
  background(3, 6, 20);

  if (state == 1) {
    updateGame();
  } else if (state == 0 || state == 2) {
    for (Star s : stars) {
      s.update();
    }
  }

  camera(
    0, -120, 580,
    0, -5, -300,
    0, 1, 0
  );

  ambientLight(75, 90, 125);

  directionalLight(
    160, 190, 255,
    -0.4, 0.6, -1
  );

  directionalLight(
    105, 70, 140,
    0.5, -0.3, 1
  );

  drawStars();
  drawGrid();

  for (Enemy e : enemies) {
    e.display();
  }

  for (Bullet b : bullets) {
    b.display();
  }

  for (Particle p : particles) {
    p.display();
  }

  drawPlayer();

  aimX = screenX(px, py, ENEMY_Z);
  aimY = screenY(px, py, ENEMY_Z);

  drawOverlay();
}


// =====================================
// GAME RESET
// =====================================

void resetGame() {
  score = 0;
  lives = 3;
  wave = 1;
  tick = 0;

  px = 0;
  py = 90;
  targetX = px;
  targetY = py;

  lastPattern = -1;
  fireCooldown = 0;
  invincible = 0;
  waveWait = -1;

  parryFrames = 0;
  parryCooldown = 0;
  parryOK = 0;
  parryNG = 0;

  mouseControl = false;
  dragging = false;
  parryHeld = false;

  left = false;
  right = false;
  up = false;
  down = false;

  bullets.clear();
  particles.clear();

  createWave();
}


// =====================================
// WAVE SYSTEM
// =====================================

float enemyFireRate() {
  return min(3.0, 1.0 + (wave - 1) * 0.1);
}

void createWave() {
  enemies.clear();
  bullets.clear();

  formationX = 0;
  enemyDir = 1;

  enemySpeed = min(
    1.2 + wave * 0.18,
    3.2
  );

  enemyFireTimer = max(
    1,
    round(70 / enemyFireRate())
  );

  waveWait = -1;

  do {
    pattern = int(random(4));
  } while (pattern == lastPattern);

  lastPattern = pattern;

  if (pattern == GRID) {

    for (int r = 0; r < 3; r++) {
      for (int c = 0; c < 7; c++) {
        addEnemy(
          (c - 3) * 70,
          -78 + r * 72,
          r
        );
      }
    }

  } else if (pattern == V_FORM) {

    for (int i = -4; i <= 4; i++) {
      addEnemy(
        i * 55,
        -65 + abs(i) * 24,
        abs(i) % 3
      );
    }

    for (int i = -3; i <= 3; i++) {
      addEnemy(
        i * 53,
        30 + abs(i) * 22,
        (abs(i) + 1) % 3
      );
    }

  } else if (pattern == WAVE) {

    for (int i = 0; i < 17; i++) {
      addEnemy(
        map(i, 0, 16, -230, 230),
        sin(i * 0.7) * 78,
        i % 3
      );
    }

  } else {

    for (int i = 0; i < 18; i++) {
      float a = TWO_PI * i / 18;

      Enemy e = addEnemy(
        cos(a) * 205,
        sin(a) * 86,
        i % 3
      );

      e.orbitAngle = a;
    }
  }
}


// =====================================
// ENEMY SPAWN
// =====================================

Enemy addEnemy(float tx, float ty, int type) {
  int mode = int(random(3));

  float x;
  float y;
  float z;

  if (mode == 0) {
    x = tx * 1.8;
    y = ty + random(-90, 90);
    z = -2300 - random(400);

  } else if (mode == 1) {
    x = random(1) < 0.5 ? -850 : 850;
    y = ty + random(-80, 80);
    z = -1900 - random(400);

  } else {
    x = tx + random(-500, 500);
    y = ty + random(-120, 120);
    z = -2600;
  }

  Enemy e = new Enemy(x, y, z, tx, ty, type);

  enemies.add(e);
  return e;
}


// =====================================
// MAIN GAME UPDATE
// =====================================

void updateGame() {
  tick++;

  float dx = (right ? 1 : 0) - (left ? 1 : 0);
  float dy = (down ? 1 : 0) - (up ? 1 : 0);

  if (dx != 0 || dy != 0) {
    mouseControl = false;

    float norm = (dx != 0 && dy != 0)
      ? 0.7071 : 1.0;

    px += dx * 5.5 * norm;
    py += dy * 5.5 * norm;

  } else if (mouseControl) {
    px = lerp(px, targetX, 0.52);
    py = lerp(py, targetY, 0.52);
  }

  px = constrain(px, -280, 280);
  py = constrain(py, -125, 135);


  // AUTO FIRE
  if (fireCooldown > 0) {
    fireCooldown--;
  }

  if (fireCooldown == 0) {
    bullets.add(
      new Bullet(
        px,
        py,
        PLAYER_Z - 55,
        new PVector(0, 0, -52),
        true
      )
    );

    fireCooldown = 9;
  }


  if (invincible > 0) {
    invincible--;
  }

  updateEnemies();
  updateBullets();
  updateParry();


  for (int i = particles.size() - 1; i >= 0; i--) {
    Particle p = particles.get(i);
    p.update();

    if (p.life <= 0) {
      particles.remove(i);
    }
  }

  for (Star s : stars) {
    s.update();
  }


  if (state == 1 && enemies.isEmpty()) {

    if (waveWait < 0) {
      waveWait = 100;
      score += 250;

    } else if (--waveWait <= 0) {
      wave++;
      createWave();
    }
  }
}


// =====================================
// ENEMY MOVEMENT AND ATTACK
// =====================================

void updateEnemies() {

  if (enemies.isEmpty()) {
    return;
  }

  if (pattern != RING) {

    float lo = 10000;
    float hi = -10000;

    for (Enemy e : enemies) {
      lo = min(lo, e.tx);
      hi = max(hi, e.tx);
    }

    if (
      formationX + hi > 250 ||
      formationX + lo < -250
    ) {
      enemyDir *= -1;
    }

    formationX += enemyDir * enemySpeed *
      (pattern == WAVE ? 0.8 : 1.0);
  }


  for (Enemy e : enemies) {
    e.update();
  }


  enemyFireTimer--;

  if (enemyFireTimer > 0) {
    return;
  }

  ArrayList<Enemy> ready = new ArrayList<Enemy>();

  for (Enemy e : enemies) {
    if (!e.arriving) {
      ready.add(e);
    }
  }

  if (!ready.isEmpty()) {

    Enemy e = ready.get(
      int(random(ready.size()))
    );

    PVector v = new PVector(
      px - e.x,
      py - e.y,
      PLAYER_Z - e.z
    );

    v.normalize();
    v.mult(9);

    bullets.add(
      new Bullet(
        e.x,
        e.y,
        e.z + 20,
        v,
        false
      )
    );
  }

  enemyFireTimer = max(
    1,
    round(random(42, 85) / enemyFireRate())
  );
}


// =====================================
// BULLET SYSTEM
// =====================================

void updateBullets() {

  for (int i = bullets.size() - 1; i >= 0; i--) {

    Bullet b = bullets.get(i);
    PVector previous = b.pos.copy();

    b.pos.add(b.vel);

    boolean hit = false;


    if (b.friendly) {

      for (int j = enemies.size() - 1; j >= 0; j--) {

        Enemy e = enemies.get(j);

        if (
          segmentHit(
            previous,
            b.pos,
            e.x, e.y, e.z,
            33, 24, 25
          )
        ) {

          score += 40 - e.type * 10;

          burst(
            e.x,
            e.y,
            e.z,
            color(255, 130, 75)
          );

          enemies.remove(j);
          hit = true;
          break;
        }
      }

    } else if (
      invincible == 0 &&
      segmentHit(
        previous,
        b.pos,
        px, py, PLAYER_Z,
        34, 28, 35
      )
    ) {

      if (parryFrames > 0) {
        perfectParry();

      } else {
        lives--;
        invincible = 75;

        burst(
          px, py, PLAYER_Z,
          color(255, 65, 100)
        );

        if (lives <= 0) {
          state = 2;
        }
      }

      hit = true;
    }


    if (
      hit ||
      b.pos.z < -3000 ||
      b.pos.z > 680 ||
      abs(b.pos.x) > 1300 ||
      abs(b.pos.y) > 1000
    ) {
      bullets.remove(i);
    }
  }
}


// =====================================
// COLLISION CHECK
// =====================================

boolean segmentHit(
  PVector a,
  PVector b,
  float x,
  float y,
  float z,
  float rx,
  float ry,
  float rz
) {

  if (
    max(a.z, b.z) < z - rz ||
    min(a.z, b.z) > z + rz
  ) {
    return false;
  }

  float t = abs(b.z - a.z) < 0.0001
    ? 0
    : constrain((z - a.z) / (b.z - a.z), 0, 1);

  return
    abs(lerp(a.x, b.x, t) - x) <= rx &&
    abs(lerp(a.y, b.y, t) - y) <= ry;
}


// =====================================
// PARRY SYSTEM
// =====================================

void startParry() {

  if (
    state == 1 &&
    parryCooldown == 0 &&
    parryFrames == 0
  ) {
    parryFrames = PARRY_WINDOW;
  }
}


void perfectParry() {

  parryFrames = 0;
  parryCooldown = 0;

  parryOK = 25;
  parryNG = 0;

  score += 50;

  burst(
    px, py, PLAYER_Z,
    color(0, 255, 255)
  );

  bullets.add(
    new Bullet(
      px,
      py,
      PLAYER_Z - 55,
      new PVector(0, 0, -60),
      true
    )
  );
}


void updateParry() {

  if (parryOK > 0) {
    parryOK--;
  }

  if (parryNG > 0) {
    parryNG--;
  }

  if (parryCooldown > 0) {
    parryCooldown--;
  }

  if (parryFrames > 0) {
    parryFrames--;

    if (parryFrames == 0) {
      parryCooldown = PARRY_FAIL_CD;
      parryNG = 25;
    }
  }
}


// =====================================
// PARTICLES
// =====================================

void burst(float x, float y, float z, int c) {

  for (int i = 0; i < 25; i++) {
    particles.add(
      new Particle(x, y, z, c)
    );
  }
}


// =====================================
// PLAYER 3D MODEL
// =====================================

void drawPlayer() {

  if (parryFrames > 0 || parryOK > 0) {

    pushMatrix();
    translate(px, py, PLAYER_Z);

    noFill();

    stroke(
      30, 245, 255,
      parryFrames > 0 ? 230 : 130
    );

    strokeWeight(2.5);

    sphere(
      48 + (25 - parryOK) * 0.5
    );

    noStroke();
    popMatrix();
  }


  if (invincible > 0 && tick % 8 < 4) {
    return;
  }

  pushMatrix();
  translate(px, py, PLAYER_Z);

  noStroke();

  fill(182, 211, 247);
  box(24, 12, 65);

  fill(226, 239, 255);

  beginShape(TRIANGLES);

  vertex(0, 0, -65);
  vertex(-15, -4, -15);
  vertex(15, -4, -15);

  endShape();


  fill(42, 130, 245);

  beginShape(QUADS);

  vertex(-10, 0, -19);
  vertex(-67, 2, 26);
  vertex(-62, 2, 40);
  vertex(-10, 0, 20);

  vertex(10, 0, -19);
  vertex(67, 2, 26);
  vertex(62, 2, 40);
  vertex(10, 0, 20);

  endShape();


  pushMatrix();

  translate(0, -8, -7);

  fill(0, 220, 255);
  scale(0.8, 0.45, 1.7);
  sphere(12);

  popMatrix();


  for (int s = -1; s <= 1; s += 2) {

    pushMatrix();

    translate(s * 12, 2, 38);

    fill(85, 115, 165);
    box(13, 13, 19);

    translate(0, 0, 16);

    fill(30, 220, 255);
    sphere(7);

    popMatrix();
  }

  popMatrix();
}


// =====================================
// BACKGROUND
// =====================================

void drawStars() {

  for (Star s : stars) {
    s.display();
  }

  noStroke();
}


void drawGrid() {

  stroke(20, 55, 100, 65);
  strokeWeight(1);

  for (int x = -700; x <= 700; x += 100) {
    line(x, 185, -1700, x, 185, 480);
  }

  float shift = (tick * 3) % 100;

  for (int z = -1700; z <= 500; z += 100) {
    line(
      -700, 185, z + shift,
      700, 185, z + shift
    );
  }

  noStroke();
}


// =====================================
// HUD
// =====================================

void drawOverlay() {

  hint(DISABLE_DEPTH_TEST);
  camera();
  noLights();

  if (state == 0 || state == 2) {

    noStroke();

    fill(0, 5, 25, 210);
    rect(0, 0, width, height);

    textAlign(CENTER, CENTER);

    fill(
      state == 0
      ? color(70, 235, 255)
      : color(255, 90, 115)
    );

    textSize(62);

    text(
      state == 0
      ? "GALAXY SHOOT"
      : "GAME OVER",
      width / 2,
      210
    );

    fill(255);
    textSize(25);

    text(
      state == 0
      ? "AUTO FIRE + PERFECT PARRY"
      : "SCORE " + score,
      width / 2,
      300
    );

    fill(255, 224, 100);
    textSize(26);

    text(
      "CLICK / ENTER TO START",
      width / 2,
      410
    );

    fill(195, 218, 245);
    textSize(19);

    text(
      "MOUSE : MOVE | DRAG : MOVE | AUTO FIRE",
      width / 2,
      490
    );

    text(
      "SHIFT : PARRY (0.12s)",
      width / 2,
      530
    );

    text(
      "FAILED PARRY : 1.3s COOLDOWN",
      width / 2,
      570
    );

    text(
      "P : PAUSE | R : RESTART",
      width / 2,
      610
    );

  } else {

    noStroke();

    fill(0, 8, 28, 205);
    rect(0, 0, width, 73);

    fill(65, 238, 255);
    textSize(21);
    textAlign(LEFT, CENTER);

    text("SCORE " + score, 20, 35);

    textAlign(CENTER, CENTER);

    text(
      "WAVE " + wave +
      " [" + patternName() + "]",
      width / 2,
      35
    );

    textAlign(RIGHT, CENTER);

    fill(255, 110, 150);

    text(
      "LIVES " + lives,
      width - 18,
      35
    );

    textAlign(CENTER, CENTER);
    textSize(17);
    fill(255, 220, 90);

    text(
      "ENEMY FIRE x" +
      nf(enemyFireRate(), 1, 1),
      width / 2,
      93
    );


    // AIM
    noFill();

    stroke(40, 240, 255);
    strokeWeight(2);

    ellipse(aimX, aimY, 28, 28);

    line(aimX - 24, aimY, aimX - 10, aimY);
    line(aimX + 10, aimY, aimX + 24, aimY);

    line(aimX, aimY - 24, aimX, aimY - 10);
    line(aimX, aimY + 10, aimX, aimY + 24);

    noStroke();


    if (parryFrames > 0) {
      fill(30, 250, 255);

    } else if (parryCooldown > 0) {
      fill(255, 155, 100);

    } else {
      fill(90, 255, 170);
    }

    textSize(18);

    String parryText;

    if (parryFrames > 0) {
      parryText = "PARRY ACTIVE!";

    } else if (parryCooldown > 0) {
      parryText =
        "PARRY " +
        nf(parryCooldown / 60.0, 1, 1) +
        "s";

    } else {
      parryText = "PARRY READY";
    }

    text(
      parryText,
      width / 2,
      height - 91
    );


    if (parryOK > 0) {

      fill(30, 245, 255);
      textSize(31);

      text(
        "PERFECT PARRY! +50",
        width / 2,
        276
      );
    }


    if (parryNG > 0) {

      fill(255, 120, 100);
      textSize(27);

      text(
        "PARRY FAILED!",
        width / 2,
        276
      );
    }


    if (waveWait > 0 && enemies.isEmpty()) {

      fill(255, 223, 70);
      textSize(36);

      text(
        "WAVE CLEAR! +250",
        width / 2,
        230
      );
    }


    fill(175, 207, 235);
    textSize(14);

    text(
      "MOUSE / DRAG : MOVE   AUTO FIRE   SHIFT : PARRY",
      width / 2,
      height - 23
    );


    // PARRY BUTTON
    if (parryCooldown > 0 || parryFrames > 0) {
      fill(55, 65, 85);
    } else {
      fill(0, 126, 170);
    }

    rect(
      width - 151,
      height - 168,
      132,
      61,
      14
    );

    fill(255);
    textSize(20);

    text(
      "PARRY",
      width - 85,
      height - 138
    );


    // PAUSE BUTTON
    fill(26, 44, 75);

    rect(
      20, 109,
      105, 43,
      10
    );

    fill(255);
    textSize(16);

    text(
      state == 3 ? "RESUME" : "PAUSE",
      72, 130
    );


    if (state == 3) {

      fill(0, 0, 18, 185);
      rect(0, 0, width, height);

      fill(255);
      textSize(52);

      text(
        "PAUSED",
        width / 2,
        height / 2
      );

      textSize(21);

      text(
        "P / PAUSE BUTTON TO RESUME",
        width / 2,
        height / 2 + 55
      );
    }
  }

  hint(ENABLE_DEPTH_TEST);
}


// =====================================
// PATTERN NAME
// =====================================

String patternName() {

  if (pattern == GRID) return "GRID";
  if (pattern == V_FORM) return "V-FORM";
  if (pattern == WAVE) return "WAVE";

  return "RING";
}


// =====================================
// MOUSE CONTROL
// =====================================

void setMouseTarget(float mx, float my) {

  float fY =
    115.0 / sqrt(115 * 115 + 880 * 880);

  float fZ =
    -880.0 / sqrt(115 * 115 + 880 * 880);

  float focal =
    height / (2 * tan(PI / 6));

  float ratio =
    (my - height / 2) / focal;

  float den =
    ratio * fY + fZ;

  if (abs(den) < 0.0001) {
    return;
  }

  float y =
    -120 +
    (PLAYER_Z - 580) *
    (fY - ratio * fZ) / den;

  float depth =
    (y + 120) * fY +
    (PLAYER_Z - 580) * fZ;

  float x =
    (mx - width / 2) * depth / focal;

  targetX = constrain(x, -280, 280);
  targetY = constrain(y, -125, 135);

  mouseControl = true;
}


void mouseMoved() {

  if (!dragging && state == 1) {
    setMouseTarget(mouseX, mouseY);
  }
}


void mousePressed() {

  if (state == 0 || state == 2) {
    resetGame();
    state = 1;
    return;
  }

  // PAUSE BUTTON
  if (
    mouseX >= 20 &&
    mouseX <= 125 &&
    mouseY >= 109 &&
    mouseY <= 152
  ) {

    if (state == 1) {
      state = 3;

    } else if (state == 3) {
      state = 1;
    }

    return;
  }

  if (state != 1) {
    return;
  }

  // PARRY BUTTON
  if (
    mouseX >= width - 151 &&
    mouseX <= width - 19 &&
    mouseY >= height - 168 &&
    mouseY <= height - 107
  ) {
    startParry();
    return;
  }

  dragging = true;

  dragStartX = mouseX;
  dragStartY = mouseY;

  dragShipX = px;
  dragShipY = py;

  mouseControl = true;
}


void mouseDragged() {

  if (!dragging || state != 1) {
    return;
  }

  targetX = constrain(
    dragShipX +
    (mouseX - dragStartX) * 560.0 / width,
    -280,
    280
  );

  targetY = constrain(
    dragShipY +
    (mouseY - dragStartY) * 440.0 / height,
    -125,
    135
  );

  mouseControl = true;
}


void mouseReleased() {
  dragging = false;
}


// =====================================
// KEYBOARD CONTROL
// =====================================

void keyPressed() {

  if (key == CODED) {

    if (keyCode == LEFT) left = true;
    if (keyCode == RIGHT) right = true;
    if (keyCode == UP) up = true;
    if (keyCode == DOWN) down = true;

    if (keyCode == SHIFT && !parryHeld) {
      parryHeld = true;
      startParry();
    }

  } else {

    if (key == 'a' || key == 'A') left = true;
    if (key == 'd' || key == 'D') right = true;
    if (key == 'w' || key == 'W') up = true;
    if (key == 's' || key == 'S') down = true;

    if (
      (key == ENTER || key == RETURN) &&
      state == 0
    ) {
      resetGame();
      state = 1;
    }

    if (key == 'r' || key == 'R') {
      resetGame();
      state = 1;
    }

    if (key == 'p' || key == 'P') {

      if (state == 1) {
        state = 3;

      } else if (state == 3) {
        state = 1;
      }
    }
  }
}


void keyReleased() {

  if (key == CODED) {

    if (keyCode == LEFT) left = false;
    if (keyCode == RIGHT) right = false;
    if (keyCode == UP) up = false;
    if (keyCode == DOWN) down = false;

    if (keyCode == SHIFT) {
      parryHeld = false;
    }

  } else {

    if (key == 'a' || key == 'A') left = false;
    if (key == 'd' || key == 'D') right = false;
    if (key == 'w' || key == 'W') up = false;
    if (key == 's' || key == 'S') down = false;
  }
}


// =====================================
// ENEMY CLASS
// =====================================

class Enemy {

  float x, y, z;
  float tx, ty;
  float phase;
  float orbitAngle;
  float arriveRate;

  int type;
  int age = 0;

  boolean arriving = true;


  Enemy(
    float x0,
    float y0,
    float z0,
    float targetX,
    float targetY,
    int t
  ) {

    x = x0;
    y = y0;
    z = z0;

    tx = targetX;
    ty = targetY;
    type = t;

    phase = random(TWO_PI);
    arriveRate = random(0.07, 0.11);
  }


  void update() {

    if (arriving) {

      float gx =
        tx + (pattern == RING ? 0 : formationX);

      x = lerp(x, gx, arriveRate);
      y = lerp(y, ty, arriveRate);
      z = lerp(z, ENEMY_Z, arriveRate);

      if (
        abs(x - gx) < 4 &&
        abs(y - ty) < 4 &&
        abs(z - ENEMY_Z) < 9
      ) {
        arriving = false;
        z = ENEMY_Z;
      }

      return;
    }

    age++;
    z = ENEMY_Z;


    if (pattern == RING) {

      float a =
        orbitAngle + age * 0.008;

      x = cos(a) * 205;
      y = sin(a) * 86;

    } else {

      x = constrain(
        tx + formationX,
        -260, 260
      );

      y = constrain(
        ty +
        sin(age * 0.04 + phase) *
        (pattern == WAVE ? 15 : 7),
        -105, 105
      );
    }
  }


  void display() {

    pushMatrix();

    translate(x, y, z);

    rotateZ(
      sin(tick * 0.025 + phase) *
      (arriving ? 0.28 : 0.07)
    );

    noStroke();


    if (type == 0) {
      fill(255, 65, 100);

    } else if (type == 1) {
      fill(255, 150, 45);

    } else {
      fill(65, 235, 135);
    }


    pushMatrix();

    scale(1.15, 0.5, 1.3);
    sphere(17);

    popMatrix();


    pushMatrix();

    translate(0, 2, 0);
    box(65, 7, 16);

    popMatrix();


    for (int s = -1; s <= 1; s += 2) {

      pushMatrix();

      translate(s * 30, 0, 7);

      fill(105, 105, 160);
      box(14, 13, 22);

      translate(0, -8, 0);

      fill(255, 55, 65);
      sphere(5);

      popMatrix();
    }


    if (arriving) {

      pushMatrix();

      translate(0, 0, 30);
      scale(0.8, 0.8, 2.5);

      fill(255, 115, 35);
      sphere(8);

      popMatrix();
    }

    popMatrix();
  }
}


// =====================================
// BULLET CLASS
// =====================================

class Bullet {

  PVector pos;
  PVector vel;

  boolean friendly;


  Bullet(
    float x,
    float y,
    float z,
    PVector velocity,
    boolean team
  ) {

    pos = new PVector(x, y, z);
    vel = velocity.copy();

    friendly = team;
  }


  void display() {

    strokeWeight(friendly ? 5 : 8);

    if (friendly) {
      stroke(55, 245, 255);
    } else {
      stroke(255, 80, 110);
    }

    line(
      pos.x,
      pos.y,
      pos.z,
      pos.x - vel.x * 2,
      pos.y - vel.y * 2,
      pos.z - vel.z * 2
    );

    noStroke();
  }
}


// =====================================
// PARTICLE CLASS
// =====================================

class Particle {

  PVector pos;
  PVector vel;

  int life;
  int c;


  Particle(float x, float y, float z, int col) {

    pos = new PVector(x, y, z);

    vel = new PVector(
      random(-6, 6),
      random(-6, 6),
      random(-6, 6)
    );

    life = int(random(18, 35));
    c = col;
  }


  void update() {

    pos.add(vel);
    vel.mult(0.97);
    life--;
  }


  void display() {

    stroke(
      c,
      constrain(life * 9, 0, 255)
    );

    strokeWeight(3);

    point(
      pos.x,
      pos.y,
      pos.z
    );

    noStroke();
  }
}


// =====================================
// STAR CLASS
// =====================================

class Star {

  float x, y, z;
  float speed;
  float sz;


  Star() {
    reset();
    z = random(-2500, 500);
  }


  void reset() {

    x = random(-1300, 1300);
    y = random(-800, 500);
    z = -2500;

    speed = random(4, 12);
    sz = random(1, 3);
  }


  void update() {

    z += speed;

    if (z > 520) {
      reset();
    }
  }


  void display() {

    stroke(185, 215, 255);
    strokeWeight(sz);

    point(x, y, z);
  }
}
