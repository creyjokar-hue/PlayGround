(() => {
  "use strict";

  const TAU = Math.PI * 2;
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d", { alpha: false });
  const menu = document.getElementById("menu");
  const pause = document.getElementById("pause");
  const over = document.getElementById("over");
  const playBtn = document.getElementById("playBtn");
  const resumeBtn = document.getElementById("resumeBtn");
  const quitBtn = document.getElementById("quitBtn");
  const againBtn = document.getElementById("againBtn");
  const homeBtn = document.getElementById("homeBtn");
  const soundBtn = document.getElementById("soundBtn");
  const bestMenu = document.getElementById("bestMenu");
  const finalScore = document.getElementById("finalScore");
  const finalWave = document.getElementById("finalWave");
  const finalKills = document.getElementById("finalKills");
  const finalBest = document.getElementById("finalBest");
  const newBest = document.getElementById("newBest");

  const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const pick = list => list[(Math.random() * list.length) | 0];
  const fmt = n => Math.round(n).toLocaleString("en-US");

  let W = 0;
  let H = 0;
  let DPR = 1;
  let ZOOM = 1;

  const G = {
    mode: "menu",
    time: 0,
    score: 0,
    best: 0,
    wave: 0,
    kills: 0,
    chain: 0,
    comboTimer: 0,
    surge: 0,
    surgeTime: 0,
    shake: 0,
    flash: 0,
    player: null,
    bullets: [],
    ebullets: [],
    enemies: [],
    particles: [],
    pickups: [],
    texts: [],
    rings: [],
    stars: [],
    dust: [],
    keys: {},
    mouse: { x: 0, y: 0, down: false },
    spawnLeft: 0,
    spawned: 0,
    spawnTimer: 0,
    waveActive: false,
    intermission: 0,
    banner: { t: 0, dur: 1, title: "", sub: "" },
    lastMove: { x: 0, y: -1 }
  };

  try {
    G.best = Number(localStorage.getItem("hii.best")) || 0;
  } catch (_) {
    G.best = 0;
  }

  let menuNeedsRender = true;

  const Sound = {
    ctx: null,
    master: null,
    sfx: null,
    music: null,
    muted: false,
    timer: null,
    step: 0,
    init() {
      if (this.ctx) {
        if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.7;
      this.master.connect(this.ctx.destination);
      this.sfx = this.ctx.createGain();
      this.sfx.gain.value = 0.55;
      this.sfx.connect(this.master);
      this.music = this.ctx.createGain();
      this.music.gain.value = 0.3;
      this.music.connect(this.master);
    },
    blip(freq, dur = 0.09, type = "square", vol = 0.12, slide = 0, delay = 0, dest = null) {
      if (!this.ctx || this.muted) return;
      const t = this.ctx.currentTime + delay;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(Math.max(20, freq), t);
      if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain).connect(dest || this.sfx);
      osc.start(t);
      osc.stop(t + dur + 0.03);
    },
    noise(dur = 0.3, vol = 0.2, cutoff = 1200, delay = 0, dest = null) {
      if (!this.ctx || this.muted) return;
      const t = this.ctx.currentTime + delay;
      const length = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
      const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2);
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = cutoff;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(filter).connect(gain).connect(dest || this.sfx);
      src.start(t);
    },
    shoot() {
      this.blip(820 + rand(-60, 60), 0.055, "square", 0.045, -430);
    },
    hit() {
      this.blip(1300 + rand(-140, 140), 0.045, "triangle", 0.06, -500);
    },
    explode() {
      this.noise(0.32, 0.18, 900);
      this.blip(150, 0.3, "sine", 0.14, -95);
    },
    bigExplode() {
      this.noise(0.7, 0.3, 700);
      this.blip(110, 0.6, "sine", 0.24, -70);
      this.blip(220, 0.5, "triangle", 0.1, -170);
    },
    pickup() {
      this.blip(880, 0.08, "sine", 0.1, 200);
      this.blip(1320, 0.12, "sine", 0.08, 260, 0.06);
    },
    hurt() {
      this.blip(210, 0.4, "sawtooth", 0.2, -150);
      this.noise(0.28, 0.18, 500);
    },
    dash() {
      this.noise(0.18, 0.1, 2200);
      this.blip(320, 0.16, "sine", 0.08, 520);
    },
    surge() {
      [0, 4, 7, 12, 16, 19].forEach((semi, i) => {
        this.blip(220 * Math.pow(2, semi / 12), 0.24, "sawtooth", 0.07, 40, i * 0.055);
      });
      this.noise(0.5, 0.14, 1800);
    },
    wave() {
      this.blip(330, 0.2, "triangle", 0.1, 90);
      this.blip(495, 0.28, "triangle", 0.08, 120, 0.09);
    },
    waveClear() {
      this.blip(440, 0.16, "sine", 0.1, 120);
      this.blip(660, 0.2, "sine", 0.09, 160, 0.08);
      this.blip(880, 0.3, "sine", 0.08, 200, 0.16);
    },
    gameover() {
      [0, -3, -7, -12].forEach((semi, i) => {
        this.blip(330 * Math.pow(2, semi / 12), 0.45, "sawtooth", 0.09, -40, i * 0.16);
      });
      this.noise(0.8, 0.12, 500, 0.1);
    },
    startMusic() {
      this.init();
      if (!this.ctx || this.timer) return;
      this.step = 0;
      const tick = () => {
        if (!this.ctx) return;
        const pattern = [0, 7, 3, 10, 12, 7, 15, 10];
        if (!this.muted) {
          const note = 110 * Math.pow(2, pattern[this.step % pattern.length] / 12);
          this.blip(note, 0.34, "sine", 0.1, 0, 0, this.music);
          this.blip(note / 2, 0.4, "triangle", 0.055, 0, 0, this.music);
          if (this.step % 4 === 0) {
            this.blip(105, 0.2, "sine", 0.16, -60, 0, this.music);
            this.noise(0.05, 0.03, 5000, 0, this.music);
          }
          if (this.step % 2 === 1) this.noise(0.04, 0.02, 7000, 0, this.music);
        }
        this.step++;
        this.timer = setTimeout(tick, 250);
      };
      tick();
    },
    stopMusic() {
      if (this.timer) clearTimeout(this.timer);
      this.timer = null;
    },
    toggle() {
      this.init();
      this.muted = !this.muted;
      if (this.master) this.master.gain.value = this.muted ? 0 : 0.7;
      soundBtn.classList.toggle("muted", this.muted);
      soundBtn.setAttribute("aria-label", this.muted ? "Unmute sound" : "Mute sound");
      if (!this.muted && G.mode === "playing") this.startMusic();
    }
  };

  function resize() {
    const oldW = W;
    const oldH = H;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    ZOOM = clamp(Math.min(vw / 1100, vh / 700), 0.7, 1.6);
    W = vw / ZOOM;
    H = vh / ZOOM;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(vw * DPR);
    canvas.height = Math.round(vh * DPR);
    canvas.style.width = vw + "px";
    canvas.style.height = vh + "px";
    if (!G.mouse.x) {
      G.mouse.x = W * 0.72;
      G.mouse.y = H * 0.42;
    } else if (oldW && oldH) {
      G.mouse.x *= W / oldW;
      G.mouse.y *= H / oldH;
    }
    G.mouse.x = clamp(G.mouse.x, 0, W);
    G.mouse.y = clamp(G.mouse.y, 0, H);
    if (G.player) {
      G.player.x = clamp(G.player.x, 40, W - 40);
      G.player.y = clamp(G.player.y, 40, H - 40);
    }
    if (!G.stars.length) seedStars();
    menuNeedsRender = true;
  }

  function seedStars() {
    G.stars = Array.from({ length: 190 }, () => ({
      x: Math.random(),
      y: Math.random(),
      z: rand(0.25, 1),
      s: rand(0.4, 1.9),
      tw: rand(0, TAU),
      sp: rand(0.15, 0.6)
    }));
    G.dust = Array.from({ length: 46 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: rand(0.6, 2.2),
      sp: rand(4, 18),
      ph: rand(0, TAU),
      hue: Math.random() < 0.5 ? "94,242,255" : "255,63,180"
    }));
  }

  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function poly(sides, radius, rotation = 0) {
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const a = rotation + (i / sides) * TAU;
      const x = Math.cos(a) * radius;
      const y = Math.sin(a) * radius;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  function segDist(px, py, x, y, cx, cy) {
    const dx = x - px;
    const dy = y - py;
    const len = dx * dx + dy * dy;
    let t = len ? ((cx - px) * dx + (cy - py) * dy) / len : 0;
    t = clamp(t, 0, 1);
    const sx = px + dx * t;
    const sy = py + dy * t;
    return Math.hypot(cx - sx, cy - sy);
  }

  function addText(x, y, text, color, size = 14, life = 0.9) {
    G.texts.push({ x, y, text, color, size, life, max: life });
  }

  function ring(x, y, color, maxR = 90, life = 0.5, width = 2) {
    G.rings.push({ x, y, r: 4, maxR, life, max: life, color, width });
  }

  function burst(x, y, color, count = 14, power = 220, size = 2.4) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, TAU);
      const sp = rand(power * 0.18, power);
      const life = rand(0.24, 0.75);
      G.particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life,
        max: life,
        size: rand(0.8, size),
        color,
        type: Math.random() < 0.32 ? "spark" : "dot",
        drag: rand(1.6, 4.2)
      });
    }
  }

  function muzzle(x, y, angle, color) {
    for (let i = 0; i < 3; i++) {
      const a = angle + rand(-0.32, 0.32);
      const sp = rand(120, 340);
      G.particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: rand(0.08, 0.2),
        max: 0.2,
        size: rand(1, 2.4),
        color,
        type: "dot",
        drag: 6
      });
    }
  }

  const glowCache = new Map();

  function glowSprite(color) {
    let sprite = glowCache.get(color);
    if (sprite) return sprite;
    sprite = document.createElement("canvas");
    sprite.width = 128;
    sprite.height = 128;
    const g = sprite.getContext("2d");
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, color);
    grad.addColorStop(0.16, color);
    grad.addColorStop(0.44, color);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    glowCache.set(color, sprite);
    return sprite;
  }

  function glow(x, y, size, color, alpha = 1) {
    const sprite = glowSprite(color);
    ctx.globalAlpha = alpha;
    ctx.drawImage(sprite, x - size / 2, y - size / 2, size, size);
    ctx.globalAlpha = 1;
  }

  function makePlayer() {
    return {
      x: W / 2,
      y: H / 2,
      vx: 0,
      vy: 0,
      angle: -Math.PI / 2,
      r: 15,
      hp: 5,
      maxHp: 5,
      fire: 0,
      invuln: 1.2,
      dash: 0,
      dashCd: 0,
      dashDir: { x: 1, y: 0 },
      trail: [],
      engine: 0
    };
  }

  function resetGame() {
    G.score = 0;
    G.wave = 0;
    G.kills = 0;
    G.chain = 0;
    G.comboTimer = 0;
    G.surge = 0;
    G.surgeTime = 0;
    G.shake = 0;
    G.flash = 0;
    G.bullets.length = 0;
    G.ebullets.length = 0;
    G.enemies.length = 0;
    G.particles.length = 0;
    G.pickups.length = 0;
    G.texts.length = 0;
    G.rings.length = 0;
    G.spawnLeft = 0;
    G.spawned = 0;
    G.spawnTimer = 0;
    G.waveActive = false;
    G.intermission = 0;
    G.player = makePlayer();
    G.mouse.down = false;
    G.lastMove = { x: 0, y: -1 };
    G.banner = { t: 0, dur: 1, title: "", sub: "" };
  }

  function startGame() {
    Sound.init();
    G.mode = "playing";
    menu.classList.add("hidden");
    pause.classList.add("hidden");
    over.classList.add("hidden");
    resetGame();
    beginWave(1, true);
    Sound.startMusic();
  }

  function goMenu() {
    G.mode = "menu";
    menuNeedsRender = true;
    Sound.stopMusic();
    resetGame();
    G.player = null;
    menu.classList.remove("hidden");
    pause.classList.add("hidden");
    over.classList.add("hidden");
    updateBest();
  }

  function beginWave(n, instant = false) {
    G.wave = n;
    G.waveActive = true;
    G.intermission = 0;
    G.spawned = 0;
    G.spawnLeft = n % 5 === 0 ? 1 : Math.min(7 + n * 2, 36);
    G.spawnTimer = instant ? 0 : 0.45;
    G.banner = {
      t: 2.35,
      dur: 2.35,
      title: n % 5 === 0 ? "WARDEN SIGNAL" : "WAVE " + String(n).padStart(2, "0"),
      sub: n % 5 === 0 ? "MASSIVE HOSTILE DETECTED" : "INCOMING SWARM"
    };
    if (n % 5 === 0) {
      spawnEnemy("boss");
      G.spawned = 1;
    } else {
      if (instant) {
        for (let i = 0; i < 5; i++) {
          spawnEnemy(pickEnemyType(n), true);
          G.spawned++;
        }
      }
      Sound.wave();
    }
  }

  function pickEnemyType(n) {
    const r = Math.random();
    if (n >= 4 && r < 0.15) return "tank";
    if (n >= 3 && r < 0.3) return "splitter";
    if (n >= 2 && r < 0.5) return "weaver";
    return "drifter";
  }

  function spawnEnemy(type, near = false) {
    const margin = 72;
    let x;
    let y;
    if (type === "boss") {
      x = W / 2;
      y = H * 0.16;
    } else if (near && G.player) {
      const a = rand(0, TAU);
      const d = rand(250, Math.min(460, Math.max(260, Math.min(W, H) * 0.42)));
      x = clamp(G.player.x + Math.cos(a) * d, margin, W - margin);
      y = clamp(G.player.y + Math.sin(a) * d, margin, H - margin);
    } else {
      const side = (Math.random() * 4) | 0;
      if (side === 0) {
        x = rand(margin, W - margin);
        y = -margin;
      } else if (side === 1) {
        x = W + margin;
        y = rand(margin, H - margin);
      } else if (side === 2) {
        x = rand(margin, W - margin);
        y = H + margin;
      } else {
        x = -margin;
        y = rand(margin, H - margin);
      }
    }

    const wave = Math.max(1, G.wave);
    const scale = 1 + (wave - 1) * 0.13;
    const base = {
      drifter: { r: 15, hp: 2, spd: 62, score: 100, color: "#ff3fb4", spin: 1.1 },
      shard: { r: 9, hp: 1, spd: 178, score: 50, color: "#ff8fd8", spin: 2.4 },
      weaver: { r: 17, hp: 4, spd: 92, score: 150, color: "#ffb347", spin: -1.5 },
      splitter: { r: 21, hp: 6, spd: 58, score: 180, color: "#54ffb0", spin: 0.7 },
      tank: { r: 28, hp: 12, spd: 39, score: 300, color: "#a86bff", spin: 0.35 },
      boss: { r: 54, hp: 110 + wave * 18, spd: 64, score: 2500, color: "#ff4d6d", spin: 0.22 }
    }[type];
    const e = {
      type,
      x,
      y,
      vx: 0,
      vy: 0,
      r: base.r,
      hp: Math.ceil(base.hp * (type === "boss" ? 1 : scale)),
      maxHp: Math.ceil(base.hp * (type === "boss" ? 1 : scale)),
      spd: base.spd * (type === "boss" ? 1 : 1 + (wave - 1) * 0.025),
      score: base.score,
      color: base.color,
      rot: rand(0, TAU),
      spin: base.spin * rand(0.8, 1.2),
      age: 0,
      seed: rand(0, TAU),
      hit: 0,
      spawn: type === "boss" ? 1.3 : near ? 0.5 : 0.32,
      shoot: rand(1.2, 2.2),
      aim: rand(0.8, 1.6),
      summon: rand(4, 6),
      enraged: false
    };
    G.enemies.push(e);
    ring(x, y, base.color, type === "boss" ? 180 : 56, type === "boss" ? 0.8 : 0.38, type === "boss" ? 3 : 1.5);
    burst(x, y, base.color, type === "boss" ? 30 : 8, type === "boss" ? 320 : 150, type === "boss" ? 3.2 : 2);
  }

  function shootPlayerBullet(p, angle, speed, dmg, color, size) {
    const sx = p.x + Math.cos(angle) * 20;
    const sy = p.y + Math.sin(angle) * 20;
    G.bullets.push({
      x: sx,
      y: sy,
      px: sx,
      py: sy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r: size,
      dmg,
      life: 1.15,
      color
    });
  }

  function firePlayer() {
    const p = G.player;
    if (!p) return;
    const surged = G.surgeTime > 0;
    const spread = surged ? 0.055 : 0.028;
    const color = surged ? "#ffcf70" : "#7df7ff";
    const speed = surged ? 1180 : 980;
    if (surged) {
      shootPlayerBullet(p, p.angle - 0.1, speed, 2, color, 3.4);
      shootPlayerBullet(p, p.angle, speed, 2, "#ffffff", 3.8);
      shootPlayerBullet(p, p.angle + 0.1, speed, 2, color, 3.4);
    } else {
      shootPlayerBullet(p, p.angle + rand(-spread, spread), speed, 2, color, 3.4);
    }
    muzzle(p.x + Math.cos(p.angle) * 22, p.y + Math.sin(p.angle) * 22, p.angle, color);
    G.shake = Math.max(G.shake, surged ? 1.1 : 0.7);
    Sound.shoot();
  }

  function shootEnemy(x, y, angle, speed, r, color) {
    G.ebullets.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r,
      life: 5,
      color
    });
  }

  function activateSurge() {
    if (G.mode !== "playing" || G.surge < 100 || G.surgeTime > 0) return;
    G.surgeTime = 6;
    G.surge = 100;
    const p = G.player;
    p.invuln = Math.max(p.invuln, 0.6);
    ring(p.x, p.y, "#ffc665", 240, 0.7, 4);
    burst(p.x, p.y, "#ffc665", 34, 360, 3.4);
    addText(p.x, p.y - 44, "SURGE ONLINE", "#ffc665", 18, 1.2);
    G.shake = 14;
    Sound.surge();
  }

  function startDash() {
    const p = G.player;
    if (!p || p.dashCd > 0 || G.mode !== "playing") return;
    const ix = (G.keys.d || G.keys.arrowright ? 1 : 0) - (G.keys.a || G.keys.arrowleft ? 1 : 0);
    const iy = (G.keys.s || G.keys.arrowdown ? 1 : 0) - (G.keys.w || G.keys.arrowup ? 1 : 0);
    let dx = ix;
    let dy = iy;
    if (!dx && !dy) {
      dx = G.lastMove.x;
      dy = G.lastMove.y;
    }
    const len = Math.hypot(dx, dy) || 1;
    p.dashDir.x = dx / len;
    p.dashDir.y = dy / len;
    p.dash = 0.16;
    p.dashCd = 1.35;
    p.invuln = Math.max(p.invuln, 0.34);
    G.shake = 5;
    ring(p.x, p.y, "#5ef2ff", 70, 0.3, 2);
    burst(p.x, p.y, "#5ef2ff", 12, 220, 2.4);
    Sound.dash();
  }

  function hurtPlayer() {
    const p = G.player;
    if (!p || G.mode !== "playing" || p.invuln > 0 || G.surgeTime > 0) return;
    p.hp--;
    p.invuln = 1.7;
    G.chain = 0;
    G.comboTimer = 0;
    G.shake = 20;
    G.flash = 0.9;
    burst(p.x, p.y, "#ff4d6d", 26, 320, 3);
    ring(p.x, p.y, "#ff4d6d", 120, 0.5, 3);
    Sound.hurt();
    if (p.hp <= 0) endGame();
  }

  function endGame() {
    const p = G.player;
    if (!p) return;
    G.mode = "gameover";
    G.mouse.down = false;
    const previous = G.best;
    if (G.score > G.best) G.best = G.score;
    try {
      localStorage.setItem("hii.best", String(G.best));
    } catch (_) {}
    Sound.stopMusic();
    Sound.gameover();
    G.shake = 28;
    G.flash = 1;
    burst(p.x, p.y, "#ff4d6d", 60, 420, 4);
    burst(p.x, p.y, "#ffc665", 30, 300, 3);
    ring(p.x, p.y, "#ff4d6d", 300, 0.9, 4);
    finalScore.textContent = fmt(G.score);
    finalWave.textContent = String(G.wave);
    finalKills.textContent = fmt(G.kills);
    finalBest.textContent = fmt(G.best);
    newBest.classList.toggle("hidden", G.score <= previous || G.score === 0);
    updateBest();
    setTimeout(() => {
      if (G.mode === "gameover") over.classList.remove("hidden");
    }, 650);
  }

  function updateBest() {
    bestMenu.textContent = fmt(G.best);
  }

  function togglePause() {
    if (G.mode === "playing") {
      G.mode = "paused";
      G.mouse.down = false;
      pause.classList.remove("hidden");
      Sound.stopMusic();
    } else if (G.mode === "paused") {
      G.mode = "playing";
      pause.classList.add("hidden");
      Sound.startMusic();
    }
  }

  function killEnemy(e, index) {
    G.enemies.splice(index, 1);
    G.kills++;
    G.chain++;
    G.comboTimer = 3.3;
    const mult = Math.min(6, 1 + G.chain * 0.15);
    const points = Math.round(e.score * mult);
    G.score += points;
    G.surge = Math.min(100, G.surge + (e.type === "boss" ? 40 : e.type === "tank" ? 11 : 4));
    const big = e.type === "boss" || e.type === "tank";
    burst(e.x, e.y, e.color, big ? 34 : 15, big ? 340 : 210, big ? 3.6 : 2.4);
    ring(e.x, e.y, e.color, big ? 150 : 62, big ? 0.55 : 0.34, big ? 3 : 1.5);
    addText(e.x, e.y, "+" + fmt(points), e.color, big ? 19 : 13, 0.95);
    if (e.type === "splitter") {
      for (let i = 0; i < 2; i++) {
        const angle = rand(0, TAU);
        spawnShard(e.x + Math.cos(angle) * 14, e.y + Math.sin(angle) * 14);
      }
    }
    if (e.type === "boss") {
      G.shake = 32;
      G.flash = 0.95;
      G.banner = { t: 2.2, dur: 2.2, title: "WARDEN DOWN", sub: "SECTOR SECURED" };
      burst(e.x, e.y, "#ffc665", 60, 460, 4);
      ring(e.x, e.y, "#ffc665", 340, 1, 4);
      for (let i = 0; i < 3; i++) dropPickup(e.x + rand(-50, 50), e.y + rand(-40, 40), "energy");
      dropPickup(e.x, e.y, "heal");
      Sound.bigExplode();
    } else {
      Sound.explode();
      const roll = Math.random();
      if (roll < 0.19) dropPickup(e.x, e.y, "energy");
      else if (roll < 0.245) dropPickup(e.x, e.y, "heal");
    }
  }

  function spawnShard(x, y) {
    const e = {
      type: "shard",
      x,
      y,
      vx: rand(-90, 90),
      vy: rand(-90, 90),
      r: 9,
      hp: 1,
      maxHp: 1,
      spd: 190,
      score: 50,
      color: "#ff8fd8",
      rot: rand(0, TAU),
      spin: rand(1.8, 3),
      age: 0,
      seed: rand(0, TAU),
      hit: 0,
      spawn: 0.32
    };
    G.enemies.push(e);
  }

  function dropPickup(x, y, type) {
    const angle = rand(0, TAU);
    G.pickups.push({
      x,
      y,
      vx: Math.cos(angle) * rand(20, 75),
      vy: Math.sin(angle) * rand(20, 75),
      r: 10,
      type,
      age: 0,
      life: 13,
      ph: rand(0, TAU)
    });
  }

  function damageEnemy(e, dmg) {
    if (e.spawn > 0) return;
    e.hp -= dmg;
    e.hit = 0.1;
    burst(e.x, e.y, e.color, 4, 130, 1.8);
    if (e.hp <= 0) {
      const idx = G.enemies.indexOf(e);
      if (idx >= 0) killEnemy(e, idx);
    } else {
      Sound.hit();
    }
  }

  function updatePlayer(dt) {
    const p = G.player;
    if (!p) return;
    p.fire = Math.max(0, p.fire - dt);
    p.invuln = Math.max(0, p.invuln - dt);
    p.dashCd = Math.max(0, p.dashCd - dt);
    p.engine = lerp(p.engine, clamp(Math.hypot(p.vx, p.vy) / 420, 0, 1), Math.min(1, dt * 8));

    if (p.dash > 0) {
      p.dash -= dt;
      p.vx = p.dashDir.x * 1180;
      p.vy = p.dashDir.y * 1180;
      p.trail.push({ x: p.x, y: p.y, a: 1 });
      if (p.trail.length > 14) p.trail.shift();
    } else {
      const ix = (G.keys.d || G.keys.arrowright ? 1 : 0) - (G.keys.a || G.keys.arrowleft ? 1 : 0);
      const iy = (G.keys.s || G.keys.arrowdown ? 1 : 0) - (G.keys.w || G.keys.arrowup ? 1 : 0);
      let nx = ix;
      let ny = iy;
      if (nx || ny) {
        const len = Math.hypot(nx, ny);
        nx /= len;
        ny /= len;
        G.lastMove.x = nx;
        G.lastMove.y = ny;
      }
      const accel = 2450;
      p.vx += nx * accel * dt;
      p.vy += ny * accel * dt;
      const drag = Math.exp(-dt * 7.5);
      p.vx *= drag;
      p.vy *= drag;
      const speed = Math.hypot(p.vx, p.vy);
      const maxSpeed = 430;
      if (speed > maxSpeed) {
        p.vx = (p.vx / speed) * maxSpeed;
        p.vy = (p.vy / speed) * maxSpeed;
      }
      if (speed > 160) p.trail.push({ x: p.x, y: p.y, a: clamp(speed / 900, 0.08, 0.4) });
      else p.trail.push({ x: p.x, y: p.y, a: 0.05 });
      if (p.trail.length > 12) p.trail.shift();
    }

    p.trail.forEach(t => {
      t.a *= Math.exp(-dt * 7);
    });

    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.x = clamp(p.x, 42, W - 42);
    p.y = clamp(p.y, 42, H - 42);
    p.angle = Math.atan2(G.mouse.y - p.y, G.mouse.x - p.x);

    if (G.surgeTime > 0) {
      G.surgeTime = Math.max(0, G.surgeTime - dt);
      G.surge = (G.surgeTime / 6) * 100;
      p.invuln = Math.max(p.invuln, 0.12);
      if (G.surgeTime <= 0) {
        G.surge = 0;
        addText(p.x, p.y - 34, "SURGE OFFLINE", "#ff8f5e", 13, 0.9);
      }
    }

    const rate = G.surgeTime > 0 ? 0.052 : 0.125;
    if (G.mouse.down && p.fire <= 0) {
      firePlayer();
      p.fire = rate;
    }
  }

  function updateEnemies(dt) {
    const p = G.player;
    if (!p) return;
    for (let i = G.enemies.length - 1; i >= 0; i--) {
      const e = G.enemies[i];
      e.age += dt;
      e.rot += dt * e.spin;
      e.hit = Math.max(0, e.hit - dt);
      if (e.spawn > 0) {
        e.spawn -= dt;
        continue;
      }
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      const nx = dx / d;
      const ny = dy / d;

      if (e.type === "drifter" || e.type === "shard" || e.type === "splitter") {
        const wobble = Math.sin(e.age * 2.7 + e.seed) * 0.5;
        const tx = nx * e.spd - ny * wobble * e.spd * 0.6;
        const ty = ny * e.spd + nx * wobble * e.spd * 0.6;
        e.vx += (tx - e.vx) * Math.min(1, dt * 2.8);
        e.vy += (ty - e.vy) * Math.min(1, dt * 2.8);
      } else if (e.type === "weaver") {
        let tx;
        let ty;
        if (d > 350) {
          tx = nx * e.spd;
          ty = ny * e.spd;
        } else {
          tx = -ny * e.spd * 0.95 + nx * 16;
          ty = nx * e.spd * 0.95 + ny * 16;
        }
        e.vx += (tx - e.vx) * Math.min(1, dt * 2.2);
        e.vy += (ty - e.vy) * Math.min(1, dt * 2.2);
        e.shoot -= dt;
        if (e.shoot <= 0 && d < 720) {
          const lead = 0.18;
          const aim = Math.atan2(p.y + p.vy * lead - e.y, p.x + p.vx * lead - e.x);
          shootEnemy(e.x, e.y, aim, 265 + G.wave * 6, 5.5, "#ffb347");
          e.shoot = rand(1.8, 2.7);
        }
      } else if (e.type === "tank") {
        e.vx += (nx * e.spd - e.vx) * Math.min(1, dt * 1.4);
        e.vy += (ny * e.spd - e.vy) * Math.min(1, dt * 1.4);
        e.shoot -= dt;
        if (e.shoot <= 0 && d < 620) {
          for (let k = 0; k < 5; k++) {
            shootEnemy(e.x, e.y, e.rot + (k / 5) * TAU, 200 + G.wave * 4, 6.5, "#a86bff");
          }
          e.shoot = rand(2.8, 3.8);
        }
      } else if (e.type === "boss") {
        updateBoss(e, dt, nx, ny, d, p);
      }

      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.x = clamp(e.x, -110, W + 110);
      e.y = clamp(e.y, -110, H + 110);
    }
  }

  function updateBoss(e, dt, nx, ny, d, p) {
    const enraged = e.hp < e.maxHp * 0.5;
    if (enraged && !e.enraged) {
      e.enraged = true;
      G.shake = 18;
      ring(e.x, e.y, "#ff4d6d", 260, 0.8, 4);
      addText(e.x, e.y - 70, "WARDEN ENRAGED", "#ff4d6d", 16, 1.4);
      Sound.bigExplode();
    }
    const targetX = W / 2 + Math.sin(e.age * 0.55) * Math.min(W * 0.27, 370);
    const targetY = H * 0.24 + Math.cos(e.age * 0.82) * Math.min(H * 0.07, 50);
    const speed = e.spd * (enraged ? 1.7 : 1);
    e.vx += (clamp(targetX - e.x, -1, 1) * speed - e.vx) * Math.min(1, dt * 1.4);
    e.vy += (clamp(targetY - e.y, -1, 1) * speed - e.vy) * Math.min(1, dt * 1.4);

    e.shoot -= dt;
    if (e.shoot <= 0) {
      const count = enraged ? 18 : 12;
      for (let k = 0; k < count; k++) {
        shootEnemy(e.x, e.y, e.rot + (k / count) * TAU, 205 + G.wave * 5, 6, "#ff4d6d");
      }
      ring(e.x, e.y, "#ff4d6d", 100, 0.35, 2);
      e.shoot = enraged ? 1.75 : 2.35;
    }

    e.aim -= dt;
    if (e.aim <= 0) {
      const aim = Math.atan2(p.y - e.y, p.x - e.x);
      for (let k = -1; k <= 1; k++) {
        shootEnemy(e.x, e.y, aim + k * 0.18, 320 + G.wave * 5, 6.5, "#ffc665");
      }
      e.aim = enraged ? 1.05 : 1.5;
    }

    e.summon -= dt;
    if (e.summon <= 0 && G.enemies.length < 24) {
      for (let k = 0; k < 2; k++) {
        spawnShard(e.x + rand(-70, 70), e.y + rand(-40, 40));
      }
      e.summon = enraged ? 4.8 : 6.5;
    }
  }

  function updateBullets(dt) {
    for (let i = G.bullets.length - 1; i >= 0; i--) {
      const b = G.bullets[i];
      b.px = b.x;
      b.py = b.y;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || b.x < -30 || b.x > W + 30 || b.y < -30 || b.y > H + 30) {
        G.bullets.splice(i, 1);
        continue;
      }
      for (let j = G.enemies.length - 1; j >= 0; j--) {
        const e = G.enemies[j];
        if (e.spawn > 0) continue;
        if (segDist(b.px, b.py, b.x, b.y, e.x, e.y) < e.r + b.r) {
          G.bullets.splice(i, 1);
          damageEnemy(e, b.dmg);
          break;
        }
      }
    }

    for (let i = G.ebullets.length - 1; i >= 0; i--) {
      const b = G.ebullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || b.x < -60 || b.x > W + 60 || b.y < -60 || b.y > H + 60) {
        G.ebullets.splice(i, 1);
      }
    }
  }

  function updatePickups(dt) {
    const p = G.player;
    if (!p) return;
    for (let i = G.pickups.length - 1; i >= 0; i--) {
      const k = G.pickups[i];
      k.age += dt;
      k.life -= dt;
      const dx = p.x - k.x;
      const dy = p.y - k.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d < 190) {
        const pull = (1 - d / 190) * 720;
        k.vx += (dx / d) * pull * dt;
        k.vy += (dy / d) * pull * dt;
      }
      k.vx *= Math.exp(-dt * 1.6);
      k.vy *= Math.exp(-dt * 1.6);
      k.x += k.vx * dt;
      k.y += k.vy * dt;
      if (d < p.r + k.r + 8) {
        if (k.type === "heal") {
          if (p.hp < p.maxHp) {
            p.hp++;
            addText(p.x, p.y - 30, "+1 HULL", "#54ffb0", 14, 0.9);
          } else {
            G.score += 250;
            addText(p.x, p.y - 30, "+250", "#54ffb0", 14, 0.9);
          }
          ring(p.x, p.y, "#54ffb0", 80, 0.4, 2);
        } else {
          G.score += 50;
          if (G.surgeTime <= 0) G.surge = Math.min(100, G.surge + 15);
          addText(p.x, p.y - 30, "+SURGE", "#ffc665", 12, 0.8);
          ring(p.x, p.y, "#ffc665", 70, 0.35, 2);
        }
        burst(k.x, k.y, k.type === "heal" ? "#54ffb0" : "#ffc665", 10, 180, 2.2);
        Sound.pickup();
        G.pickups.splice(i, 1);
        continue;
      }
      if (k.life <= 0) G.pickups.splice(i, 1);
    }
  }

  function updateCollisions() {
    const p = G.player;
    if (!p) return;
    for (let i = G.ebullets.length - 1; i >= 0; i--) {
      const b = G.ebullets[i];
      if (Math.hypot(b.x - p.x, b.y - p.y) < b.r + p.r * 0.62) {
        G.ebullets.splice(i, 1);
        hurtPlayer();
      }
    }
    for (let i = G.enemies.length - 1; i >= 0; i--) {
      const e = G.enemies[i];
      if (e.spawn > 0) continue;
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d < e.r + p.r * 0.8) {
        hurtPlayer();
        const push = 150;
        e.vx -= (dx / d) * push;
        e.vy -= (dy / d) * push;
      }
    }
  }

  function updateEffects(dt) {
    for (let i = G.particles.length - 1; i >= 0; i--) {
      const q = G.particles[i];
      q.life -= dt;
      if (q.life <= 0) {
        G.particles.splice(i, 1);
        continue;
      }
      const drag = Math.exp(-dt * q.drag);
      q.vx *= drag;
      q.vy *= drag;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
    }
    for (let i = G.rings.length - 1; i >= 0; i--) {
      const r = G.rings[i];
      r.life -= dt;
      r.r = lerp(r.r, r.maxR, Math.min(1, dt * 7));
      if (r.life <= 0) G.rings.splice(i, 1);
    }
    for (let i = G.texts.length - 1; i >= 0; i--) {
      const t = G.texts[i];
      t.life -= dt;
      t.y -= 42 * dt;
      if (t.life <= 0) G.texts.splice(i, 1);
    }
    G.shake *= Math.exp(-dt * 5.5);
    G.flash *= Math.exp(-dt * 3.6);
    if (G.banner.t > 0) G.banner.t = Math.max(0, G.banner.t - dt);
  }

  function updateWaves(dt) {
    if (G.waveActive) {
      if (G.spawned < G.spawnLeft) {
        G.spawnTimer -= dt;
        if (G.spawnTimer <= 0) {
          spawnEnemy(pickEnemyType(G.wave));
          G.spawned++;
          G.spawnTimer = Math.max(0.18, 0.62 - G.wave * 0.022) * rand(0.72, 1.22);
        }
      } else if (G.enemies.length === 0) {
        G.waveActive = false;
        G.intermission = 2.5;
        const bonus = 200 * G.wave;
        G.score += bonus;
        G.banner = { t: 2.1, dur: 2.1, title: "SECTOR CLEAR", sub: "+" + fmt(bonus) + " BONUS" };
        if (G.wave % 2 === 0) {
          G.player.hp = Math.min(G.player.maxHp, G.player.hp + 1);
          addText(G.player.x, G.player.y - 36, "+1 HULL", "#54ffb0", 15, 1.2);
        }
        Sound.waveClear();
      }
    } else if (G.intermission > 0) {
      G.intermission -= dt;
      if (G.intermission <= 0) beginWave(G.wave + 1);
    }
  }

  function update(dt) {
    G.time += dt;
    if (G.comboTimer > 0) {
      G.comboTimer -= dt;
      if (G.comboTimer <= 0) G.chain = 0;
    }
    updatePlayer(dt);
    updateEnemies(dt);
    updateBullets(dt);
    updatePickups(dt);
    updateCollisions();
    updateWaves(dt);
    updateEffects(dt);
  }

  function updateMenu(dt) {
    G.time += dt;
    G.shake *= Math.exp(-dt * 5);
    G.flash *= Math.exp(-dt * 4);
    if (G.particles.length) updateEffects(dt);
  }

  function drawBackground() {
    const t = G.time;
    const p = G.player;
    const base = ctx.createRadialGradient(W * 0.5, H * 0.44, 0, W * 0.5, H * 0.5, Math.max(W, H) * 0.78);
    base.addColorStop(0, "#100a2a");
    base.addColorStop(0.42, "#080518");
    base.addColorStop(1, "#03020a");
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const blobs = [
      [W * 0.2 + Math.sin(t * 0.11) * W * 0.05, H * 0.28 + Math.cos(t * 0.16) * H * 0.06, Math.max(W, H) * 0.72, "#6034ff", 0.2],
      [W * 0.84 + Math.cos(t * 0.09) * W * 0.04, H * 0.68 + Math.sin(t * 0.13) * H * 0.05, Math.max(W, H) * 0.68, "#ff2da0", 0.12],
      [W * 0.55 + Math.sin(t * 0.07 + 2) * W * 0.08, H * 0.12 + Math.cos(t * 0.1) * H * 0.05, Math.max(W, H) * 0.56, "#00c6ff", 0.14]
    ];
    for (const [x, y, r, color, alpha] of blobs) {
      glow(x, y, r, color, alpha);
    }
    ctx.restore();

    for (const s of G.stars) {
      const px = p ? p.x : W * 0.5;
      const py = p ? p.y : H * 0.5;
      const x = ((s.x * W - px * 0.02 * s.z) % W + W) % W;
      const y = ((s.y * H - py * 0.02 * s.z) % H + H) % H;
      const tw = 0.55 + Math.sin(t * s.sp + s.tw) * 0.35;
      ctx.globalAlpha = clamp(tw * s.z, 0.08, 0.9);
      ctx.fillStyle = s.z > 0.68 ? "#b6f7ff" : "#7b86d8";
      ctx.beginPath();
      ctx.arc(x, y, s.s, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    const spacing = 88;
    const px = p ? p.x : W * 0.5;
    const py = p ? p.y : H * 0.5;
    const ox = ((-px * 0.05) % spacing + spacing) % spacing;
    const oy = ((-py * 0.05) % spacing + spacing) % spacing;
    ctx.strokeStyle = "rgba(94,242,255,0.045)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = ox - spacing; x < W + spacing; x += spacing) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
    }
    for (let y = oy - spacing; y < H + spacing; y += spacing) {
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
    }
    ctx.stroke();

    const cx = W / 2;
    const cy = H / 2;
    ctx.strokeStyle = "rgba(94,242,255,0.045)";
    for (let i = 1; i <= 4; i++) {
      ctx.beginPath();
      ctx.arc(cx, cy, i * Math.min(W, H) * 0.16, 0, TAU);
      ctx.stroke();
    }

    if (G.mode === "menu") {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(t * 0.1);
      ctx.strokeStyle = "rgba(94,242,255,0.09)";
      ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.ellipse(0, 0, 150 + i * 80, 60 + i * 34, i * 0.6, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
    }

    for (const d of G.dust) {
      const x = ((d.x * W + Math.sin(t * 0.3 + d.ph) * 22) % W + W) % W;
      const y = ((d.y * H - t * d.sp) % H + H) % H;
      ctx.globalAlpha = 0.18 + Math.sin(t * 0.8 + d.ph) * 0.09;
      ctx.fillStyle = `rgba(${d.hue},0.9)`;
      ctx.beginPath();
      ctx.arc(x, y, d.r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    const m = 20;
    ctx.strokeStyle = "rgba(94,242,255,0.08)";
    ctx.lineWidth = 1;
    ctx.strokeRect(m, m, W - m * 2, H - m * 2);
    ctx.strokeStyle = "rgba(94,242,255,0.4)";
    ctx.lineWidth = 2;
    const len = 26;
    const corners = [
      [m, m, 1, 1],
      [W - m, m, -1, 1],
      [m, H - m, 1, -1],
      [W - m, H - m, -1, -1]
    ];
    for (const [x, y, sx, sy] of corners) {
      ctx.beginPath();
      ctx.moveTo(x + sx * len, y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y + sy * len);
      ctx.stroke();
    }
  }

  function drawRings() {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const r of G.rings) {
      const a = clamp(r.life / r.max, 0, 1);
      ctx.strokeStyle = r.color;
      ctx.globalAlpha = a * 0.22;
      ctx.lineWidth = r.width * 4;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = a * 0.8;
      ctx.lineWidth = r.width;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawParticles() {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const q of G.particles) {
      const a = clamp(q.life / q.max, 0, 1);
      ctx.fillStyle = q.color;
      ctx.strokeStyle = q.color;
      if (q.type === "spark") {
        const len = clamp(Math.hypot(q.vx, q.vy) * 0.025, 2, 14);
        const ang = Math.atan2(q.vy, q.vx);
        ctx.globalAlpha = a * 0.35;
        glow(q.x, q.y, q.size * 8, q.color, a * 0.3);
        ctx.globalAlpha = a * 0.9;
        ctx.lineWidth = Math.max(1, q.size * 0.8);
        ctx.beginPath();
        ctx.moveTo(q.x, q.y);
        ctx.lineTo(q.x - Math.cos(ang) * len, q.y - Math.sin(ang) * len);
        ctx.stroke();
      } else {
        glow(q.x, q.y, q.size * 7, q.color, a * 0.32);
        ctx.globalAlpha = a * 0.9;
        ctx.beginPath();
        ctx.arc(q.x, q.y, q.size * (0.4 + a * 0.7), 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawPickups() {
    for (const k of G.pickups) {
      const fade = k.life < 2 ? (Math.sin(G.time * 18) > 0 ? 0.25 : 1) : 1;
      const pulse = 1 + Math.sin(G.time * 5 + k.ph) * 0.12;
      const color = k.type === "heal" ? "#54ffb0" : "#ffc665";
      ctx.save();
      ctx.translate(k.x, k.y);
      ctx.scale(pulse, pulse);
      ctx.globalAlpha = fade;
      ctx.globalCompositeOperation = "lighter";
      glow(0, 0, 54, color, 0.5 * fade);
      ctx.globalAlpha = fade;
      ctx.fillStyle = color;
      poly(k.type === "heal" ? 4 : 6, 11, G.time * (k.type === "heal" ? 0.8 : 1.4));
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#05030e";
      ctx.font = "700 11px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(k.type === "heal" ? "+" : "S", 0, 1);
      ctx.restore();
    }
  }

  function drawEnemyBullets() {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const b of G.ebullets) {
      glow(b.x, b.y, b.r * 7, b.color, 0.4);
      ctx.fillStyle = b.color;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#fff4fa";
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * 0.38, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPlayerBullets() {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const b of G.bullets) {
      const ang = Math.atan2(b.vy, b.vx);
      glow(b.x, b.y, b.r * 10, b.color, 0.32);
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(ang);
      ctx.strokeStyle = b.color;
      ctx.lineWidth = b.r;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-17, 0);
      ctx.lineTo(5, 0);
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(4, 0, b.r * 0.55, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  function drawEnemy(e) {
    const scale = e.spawn > 0 ? clamp(1 - e.spawn / 1.3, 0.1, 1) : 1;
    const flash = e.hit > 0;
    const color = flash ? "#ffffff" : e.color;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.scale(scale, scale);
    ctx.rotate(e.rot);
    ctx.globalCompositeOperation = "lighter";
    glow(0, 0, e.r * (e.type === "boss" ? 4.8 : 3.3), e.color, e.type === "boss" ? 0.44 : 0.3);
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = color;
    ctx.strokeStyle = color;

    if (e.type === "drifter") {
      ctx.lineWidth = 2;
      poly(4, e.r, Math.PI / 4);
      ctx.globalAlpha = 0.22;
      ctx.fill();
      ctx.globalAlpha = 1;
      poly(4, e.r, Math.PI / 4);
      ctx.stroke();
      ctx.fillStyle = flash ? "#fff" : "#ffe4f7";
      ctx.beginPath();
      ctx.arc(0, 0, 3.5, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 0.6;
      for (let i = 0; i < 2; i++) {
        const a = e.age * 1.7 + i * Math.PI;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * (e.r + 9), Math.sin(a) * (e.r + 9), 2, 0, TAU);
        ctx.fill();
      }
    } else if (e.type === "shard") {
      ctx.lineWidth = 1.5;
      poly(3, e.r, e.age * 2);
      ctx.globalAlpha = 0.28;
      ctx.fill();
      ctx.globalAlpha = 1;
      poly(3, e.r, e.age * 2);
      ctx.stroke();
    } else if (e.type === "weaver") {
      ctx.lineWidth = 2;
      poly(3, e.r, 0);
      ctx.globalAlpha = 0.2;
      ctx.fill();
      ctx.globalAlpha = 1;
      poly(3, e.r, 0);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, e.r * 0.38, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = "#fff2d8";
      ctx.beginPath();
      ctx.arc(0, 0, 2.6, 0, TAU);
      ctx.fill();
    } else if (e.type === "splitter") {
      ctx.lineWidth = 2;
      poly(4, e.r, e.rot * 0.2);
      ctx.globalAlpha = 0.18;
      ctx.fill();
      ctx.globalAlpha = 1;
      poly(4, e.r, e.rot * 0.2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-e.r * 0.55, 0);
      ctx.lineTo(e.r * 0.55, 0);
      ctx.moveTo(0, -e.r * 0.55);
      ctx.lineTo(0, e.r * 0.55);
      ctx.stroke();
      ctx.fillStyle = "#d9ffe9";
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, TAU);
      ctx.fill();
    } else if (e.type === "tank") {
      ctx.lineWidth = 3;
      poly(6, e.r, Math.PI / 6);
      ctx.globalAlpha = 0.16;
      ctx.fill();
      ctx.globalAlpha = 1;
      poly(6, e.r, Math.PI / 6);
      ctx.stroke();
      ctx.lineWidth = 1.5;
      poly(6, e.r * 0.62, -Math.PI / 6 + e.age * 0.4);
      ctx.stroke();
      ctx.fillStyle = "#efe6ff";
      ctx.beginPath();
      ctx.arc(0, 0, 5, 0, TAU);
      ctx.fill();
    } else if (e.type === "boss") {
      ctx.lineWidth = 3;
      poly(12, e.r, e.rot * 0.15);
      ctx.globalAlpha = 0.12;
      ctx.fill();
      ctx.globalAlpha = 1;
      poly(12, e.r, e.rot * 0.15);
      ctx.stroke();
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.6;
      poly(12, e.r * 0.72, -e.rot * 0.5);
      ctx.stroke();
      poly(6, e.r * 1.18, e.rot * 0.7);
      ctx.stroke();
      ctx.globalAlpha = 1;
      const core = ctx.createRadialGradient(0, 0, 2, 0, 0, e.r * 0.46);
      core.addColorStop(0, "#fff1f4");
      core.addColorStop(0.45, e.color);
      core.addColorStop(1, "rgba(255,77,109,0)");
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(0, 0, e.r * 0.46, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = flash ? "#fff" : "#ffc665";
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(0, 0, e.r * (0.52 + i * 0.17), e.rot + i * 1.8, e.rot + i * 1.8 + 1.3);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawPlayer() {
    const p = G.player;
    if (!p) return;
    for (let i = 0; i < p.trail.length; i++) {
      const t = p.trail[i];
      const a = t.a * (i / p.trail.length);
      if (a < 0.01) continue;
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.rotate(p.angle);
      ctx.globalAlpha = a;
      ctx.fillStyle = G.surgeTime > 0 ? "#ffc665" : "#5ef2ff";
      ctx.beginPath();
      ctx.moveTo(15, 0);
      ctx.lineTo(-9, -9);
      ctx.lineTo(-4, 0);
      ctx.lineTo(-9, 9);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    const surged = G.surgeTime > 0;
    const aura = surged ? "#ffc665" : "#5ef2ff";

    if (surged) {
      ctx.save();
      ctx.rotate(-p.angle + G.time * 1.4);
      ctx.strokeStyle = "rgba(255,198,101,0.55)";
      ctx.lineWidth = 4;
      ctx.globalAlpha = 0.18;
      ctx.beginPath();
      ctx.arc(0, 0, 28 + Math.sin(G.time * 6) * 2.5, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, 28 + Math.sin(G.time * 6) * 2.5, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    if (p.invuln > 0 && p.dash <= 0) {
      ctx.save();
      ctx.rotate(-p.angle);
      ctx.globalAlpha = 0.3 + Math.sin(G.time * 20) * 0.12;
      ctx.strokeStyle = "#bff9ff";
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(0, 0, 26, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(0, 0, 26, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    ctx.globalCompositeOperation = "lighter";
    glow(0, 0, 86, aura, surged ? 0.55 : 0.42);
    ctx.globalCompositeOperation = "source-over";
    const body = ctx.createLinearGradient(-14, 0, 20, 0);
    body.addColorStop(0, surged ? "#ff9d2e" : "#1560c7");
    body.addColorStop(0.5, surged ? "#ffd88a" : "#5ef2ff");
    body.addColorStop(1, "#ffffff");
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(20, 0);
    ctx.lineTo(-10, -12);
    ctx.lineTo(-5, 0);
    ctx.lineTo(-10, 12);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = "#04121c";
    ctx.beginPath();
    ctx.arc(3, 0, 3.4, 0, TAU);
    ctx.fill();

    const flame = 9 + Math.sin(G.time * 30) * 3 + p.engine * 10;
    ctx.globalCompositeOperation = "lighter";
    glow(-9 - flame * 0.5, 0, flame * 3.2, aura, 0.42);
    ctx.fillStyle = surged ? "rgba(255,198,101,0.9)" : "rgba(94,242,255,0.85)";
    ctx.beginPath();
    ctx.moveTo(-9, -4);
    ctx.lineTo(-9 - flame, 0);
    ctx.lineTo(-9, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawReticle() {
    if (G.mode !== "playing") return;
    const m = G.mouse;
    const surged = G.surgeTime > 0;
    const color = surged ? "#ffc665" : "#5ef2ff";
    const r = m.down ? 10 : 15;
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.rotate(G.time * 0.9);
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.16;
    ctx.lineWidth = 4.5;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(0, 0, r, i * (Math.PI / 2) + 0.28, i * (Math.PI / 2) + 1.16);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(0, 0, r, i * (Math.PI / 2) + 0.28, i * (Math.PI / 2) + 1.16);
      ctx.stroke();
    }
    ctx.rotate(-G.time * 0.9);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, 2, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.arc(0, 0, r + 6, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  function heartPath(x, y, r) {
    ctx.beginPath();
    ctx.moveTo(x, y + r * 0.35);
    ctx.bezierCurveTo(x, y - r * 0.25, x - r * 1.02, y - r * 0.25, x - r * 1.02, y + r * 0.18);
    ctx.bezierCurveTo(x - r * 1.02, y + r * 0.8, x - r * 0.25, y + r * 1.02, x, y + r * 1.32);
    ctx.bezierCurveTo(x + r * 0.25, y + r * 1.02, x + r * 1.02, y + r * 0.8, x + r * 1.02, y + r * 0.18);
    ctx.bezierCurveTo(x + r * 1.02, y - r * 0.25, x, y - r * 0.25, x, y + r * 0.35);
    ctx.closePath();
  }

  function uiScale() {
    return clamp(Math.min(W / 1300, H / 820), 0.76, 1.12);
  }

  function drawHUD() {
    const p = G.player;
    if (!p || G.mode === "menu") return;
    const s = uiScale();
    const pad = 30 * s;
    ctx.save();
    ctx.textBaseline = "middle";

    ctx.font = `700 ${9 * s}px ui-monospace, "SFMono-Regular", monospace`;
    ctx.fillStyle = "rgba(147,164,200,0.75)";
    ctx.textAlign = "left";
    ctx.fillText("HULL", pad, pad);

    for (let i = 0; i < p.maxHp; i++) {
      const x = pad + 9 * s + i * 22 * s;
      const y = pad + 22 * s;
      if (i < p.hp) {
        ctx.globalCompositeOperation = "lighter";
        glow(x, y + 3 * s, 28 * s, "#ff4d6d", 0.34);
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = "#ff5f7e";
      } else {
        ctx.fillStyle = "rgba(255,77,109,0.12)";
      }
      heartPath(x, y, 7 * s);
      ctx.fill();
      if (i < p.hp) {
        ctx.fillStyle = "rgba(255,255,255,0.55)";
        ctx.beginPath();
        ctx.arc(x - 2.6 * s, y + 2.4 * s, 1.25 * s, 0, TAU);
        ctx.fill();
      }
    }

    const mult = Math.min(6, 1 + G.chain * 0.15);
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(147,164,200,0.7)";
    ctx.font = `700 ${8.5 * s}px ui-monospace, "SFMono-Regular", monospace`;
    ctx.fillText("SCORE", W / 2, pad);
    ctx.font = `800 ${27 * s}px ui-monospace, "SFMono-Regular", monospace`;
    ctx.lineWidth = 5 * s;
    ctx.strokeStyle = "rgba(94,242,255,0.2)";
    ctx.strokeText(fmt(G.score), W / 2, pad + 20 * s);
    ctx.fillStyle = "#effdff";
    ctx.fillText(fmt(G.score), W / 2, pad + 20 * s);
    if (G.chain > 0) {
      ctx.font = `700 ${10 * s}px ui-monospace, "SFMono-Regular", monospace`;
      ctx.fillStyle = "#ffc665";
      ctx.fillText("CHAIN ×" + mult.toFixed(1) + "  ·  " + Math.ceil(G.comboTimer * 10) / 10 + "s", W / 2, pad + 42 * s);
    }

    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(147,164,200,0.75)";
    ctx.font = `700 ${9 * s}px ui-monospace, "SFMono-Regular", monospace`;
    ctx.fillText("WAVE", W - pad, pad);
    ctx.font = `800 ${24 * s}px ui-monospace, "SFMono-Regular", monospace`;
    ctx.lineWidth = 4.5 * s;
    ctx.strokeStyle = "rgba(94,242,255,0.18)";
    ctx.strokeText(String(G.wave).padStart(2, "0"), W - pad, pad + 19 * s);
    ctx.fillStyle = "#effdff";
    ctx.fillText(String(G.wave).padStart(2, "0"), W - pad, pad + 19 * s);
    const hostiles = G.enemies.length + Math.max(0, G.spawnLeft - G.spawned);
    ctx.font = `600 ${8.5 * s}px ui-monospace, "SFMono-Regular", monospace`;
    ctx.fillStyle = "rgba(147,164,200,0.68)";
    ctx.fillText(hostiles + " HOSTILES", W - pad, pad + 40 * s);

    const bw = 148 * s;
    const bx = W - pad - bw;
    const by = pad + 58 * s;
    const active = G.surgeTime > 0;
    const charge = active ? G.surgeTime / 6 : G.surge / 100;
    ctx.fillStyle = "rgba(255,255,255,0.055)";
    rr(bx, by, bw, 5 * s, 2.5 * s);
    ctx.fill();
    const full = G.surge >= 100 && !active;
    ctx.fillStyle = active || full ? "#ffc665" : "#5ef2ff";
    if (charge > 0) {
      rr(bx, by, Math.max(2, bw * charge), 5 * s, 2.5 * s);
      ctx.fill();
    }
    ctx.textAlign = "left";
    ctx.font = `700 ${8 * s}px ui-monospace, "SFMono-Regular", monospace`;
    ctx.fillStyle = active ? "#ffc665" : full ? "#ffe3a6" : "rgba(147,164,200,0.68)";
    ctx.fillText(active ? "SURGE ACTIVE" : full ? "SURGE READY  ·  E" : "SURGE", bx, by - 8 * s);
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(147,164,200,0.5)";
    ctx.fillText(Math.round(charge * 100) + "%", bx + bw, by - 8 * s);

    const boss = G.enemies.find(e => e.type === "boss");
    if (boss) {
      const w = Math.min(W * 0.58, 540);
      const x = (W - w) / 2;
      const y = H - 46;
      ctx.textAlign = "center";
      ctx.font = `700 ${9 * s}px ui-monospace, "SFMono-Regular", monospace`;
      ctx.fillStyle = boss.enraged ? "#ff4d6d" : "#ffc2cc";
      ctx.fillText(boss.enraged ? "WARDEN // ENRAGED" : "WARDEN", W / 2, y - 12);
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      rr(x, y, w, 6, 3);
      ctx.fill();
      ctx.fillStyle = boss.enraged ? "#ff4d6d" : "#ff7d94";
      rr(x, y, Math.max(2, w * clamp(boss.hp / boss.maxHp, 0, 1)), 6, 3);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawBanner() {
    if (G.banner.t <= 0) return;
    const b = G.banner;
    const inA = clamp((b.dur - b.t) / 0.25, 0, 1);
    const outA = clamp(b.t / 0.5, 0, 1);
    const a = Math.min(inA, outA);
    const s = uiScale();
    ctx.save();
    ctx.globalAlpha = a;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `800 ${38 * s}px "Arial Black", "Segoe UI Black", Impact, sans-serif`;
    const ty = H * 0.35;
    ctx.lineWidth = 9 * s;
    ctx.strokeStyle = "rgba(94,242,255,0.16)";
    ctx.strokeText(b.title, W / 2, ty);
    ctx.fillStyle = "#f2feff";
    ctx.fillText(b.title, W / 2, ty);
    const tw = Math.min(W * 0.6, 360 * s);
    ctx.strokeStyle = "rgba(94,242,255,0.55)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(W / 2 - tw / 2 - 20, ty + 2);
    ctx.lineTo(W / 2 - tw / 2, ty + 2);
    ctx.moveTo(W / 2 + tw / 2, ty + 2);
    ctx.lineTo(W / 2 + tw / 2 + 20, ty + 2);
    ctx.stroke();
    ctx.font = `700 ${10 * s}px ui-monospace, "SFMono-Regular", monospace`;
    ctx.fillStyle = "rgba(180,240,255,0.8)";
    ctx.fillText(b.sub, W / 2, ty + 30 * s);
    ctx.restore();
  }

  function drawTexts() {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const t of G.texts) {
      const a = clamp(t.life / t.max, 0, 1);
      ctx.globalAlpha = a;
      ctx.font = `800 ${t.size}px ui-monospace, "SFMono-Regular", monospace`;
      ctx.lineWidth = 5;
      ctx.strokeStyle = "rgba(5,3,14,0.55)";
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.restore();
  }

  function drawWorld() {
    drawRings();
    drawPickups();
    drawEnemyBullets();
    for (const e of G.enemies) drawEnemy(e);
    drawPlayerBullets();
    drawPlayer();
    drawParticles();
    drawTexts();
  }

  function render() {
    ctx.setTransform(DPR * ZOOM, 0, 0, DPR * ZOOM, 0, 0);
    ctx.clearRect(0, 0, W, H);
    drawBackground();

    ctx.save();
    const sh = G.shake;
    if (sh > 0.1) ctx.translate(rand(-sh, sh), rand(-sh, sh));
    drawWorld();
    ctx.restore();

    if (G.flash > 0.01) {
      ctx.fillStyle = `rgba(255,55,86,${clamp(G.flash * 0.28, 0, 0.35)})`;
      ctx.fillRect(0, 0, W, H);
    }

    drawHUD();
    drawBanner();
    drawReticle();
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.033, Math.max(0, (now - last) / 1000));
    last = now;
    if (G.mode === "playing") update(dt);
    else if (G.mode === "gameover") updateEffects(dt);
    else if (G.mode === "menu") {
      updateMenu(dt);
      if (!menuNeedsRender) {
        requestAnimationFrame(frame);
        return;
      }
      menuNeedsRender = false;
    }
    render();
    requestAnimationFrame(frame);
  }

  window.addEventListener("keydown", event => {
    const key = event.key.toLowerCase();
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) event.preventDefault();
    G.keys[key] = true;
    if (key === "shift" && G.mode === "playing") startDash();
    if (key === "e" && G.mode === "playing") activateSurge();
    if (key === "p" || key === "escape") {
      if (G.mode === "playing" || G.mode === "paused") {
        event.preventDefault();
        togglePause();
      }
    }
    if (key === "m") Sound.toggle();
    if (key === "r" && (G.mode === "gameover" || G.mode === "paused")) startGame();
    if (key === "enter" && (G.mode === "menu" || G.mode === "gameover")) startGame();
  });

  window.addEventListener("keyup", event => {
    G.keys[event.key.toLowerCase()] = false;
  });

  window.addEventListener("blur", () => {
    G.keys = {};
    G.mouse.down = false;
  });

  window.addEventListener("mousemove", event => {
    G.mouse.x = clamp(event.clientX / ZOOM, 0, W);
    G.mouse.y = clamp(event.clientY / ZOOM, 0, H);
  });

  canvas.addEventListener("mousedown", event => {
    if (event.button === 0) G.mouse.down = true;
  });

  window.addEventListener("mouseup", event => {
    if (event.button === 0) G.mouse.down = false;
  });

  canvas.addEventListener("contextmenu", event => {
    event.preventDefault();
    activateSurge();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && G.mode === "playing") togglePause();
  });

  window.addEventListener("resize", resize);

  playBtn.addEventListener("click", startGame);
  resumeBtn.addEventListener("click", togglePause);
  quitBtn.addEventListener("click", goMenu);
  againBtn.addEventListener("click", startGame);
  homeBtn.addEventListener("click", goMenu);
  soundBtn.addEventListener("click", () => Sound.toggle());

  window.__HII__ = {
    get state() {
      return {
        mode: G.mode,
        score: G.score,
        best: G.best,
        wave: G.wave,
        kills: G.kills,
        hp: G.player ? G.player.hp : 0,
        enemies: G.enemies.length,
        bullets: G.bullets.length,
        surge: Math.round(G.surge),
        surgeActive: G.surgeTime > 0
      };
    },
    get player() {
      return G.player ? { x: G.player.x * ZOOM, y: G.player.y * ZOOM, hp: G.player.hp } : null;
    },
    get threats() {
      return G.enemies.map(e => ({ type: e.type, x: e.x * ZOOM, y: e.y * ZOOM, hp: e.hp }));
    },
    start: startGame,
    menu: goMenu
  };

  resize();
  updateBest();
  seedStars();
  requestAnimationFrame(frame);
})();
