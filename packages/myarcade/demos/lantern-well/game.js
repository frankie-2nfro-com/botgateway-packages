// Lantern Well: an original one-button climb. Art is drawn in code, sound is Web Audio.
const VW = 300, VH = 600, CX = 150, WL = 24, WR = 276, TAU = Math.PI * 2, R = 9, HALF = 8;
const START_ALT = 150, MAX_FLAME = 3, LIGHT = [70, 150, 190, 230];
const NOTES = [523, 587, 659, 784, 880, 1047];
const EMBERS = ['#ffb347', '#ff8a2a', '#ffe08a'];
const SHADES = [];
for (let i = 0; i < 8; i++) SHADES.push('rgb(' + (25 + i * 2) + ',' + (29 + i * 2) + ',' + (46 + i * 3) + ')');
const BRICKS = [];
for (let i = 0; i < 8; i++) BRICKS.push('rgb(' + (44 + i * 3) + ',' + (45 + i * 3) + ',' + (62 + i * 3) + ')');

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const hash = (n) => { const s = Math.sin(n * 127.1 + 11.7) * 43758.5453; return s - Math.floor(s); };
const levelAt = (a) => 1 + Math.floor(Math.max(0, a - START_ALT) / 2400);

const KEY_NAMES = { ' ': 'Space', Enter: 'Enter', Escape: 'Escape', ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight', p: 'KeyP', P: 'KeyP', w: 'KeyW', W: 'KeyW' };
const keyCode = (e) => e.code || KEY_NAMES[e.key] || '';

export function mount(canvas, host) {
  const ctx = canvas.getContext('2d');
  const prevTouchAction = canvas.style.touchAction;
  canvas.style.touchAction = 'none';

  let destroyed = false, raf = 0, last = performance.now();
  let scale = 1, ox = 0, oy = 0;
  let status = 'ready', time = 0, runT = 0, overAt = -1e9, lastEmit = '';
  let alt = 0, camAlt = 0, v = 0, maxAlt = 0, bonus = 0, flame = MAX_FLAME, sparkCount = 0, sinceRestore = 0;
  let chain = 0, invuln = 0, level = 1, hitFlash = 0, everHeld = false, light = LIGHT[MAX_FLAME], emberAcc = 0;
  let shutters = [], motes = [], particles = [], floats = [], nextAlt = 0, spawned = 0;
  const keys = new Set();
  let padHeld = false, pointerHeld = false;

  // ---------- audio ----------
  let ac = null, master = null, humG = null, noiseBuf = null, humT = -1, lastMute = null;
  const humNodes = [];

  function ensureAudio() {
    if (destroyed) return;
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { ac = new AC(); } catch (e) { ac = null; return; }
      lastMute = host.isMuted();
      master = ac.createGain();
      master.gain.value = lastMute ? 0 : 0.6;
      master.connect(ac.destination);
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      humG = ac.createGain();
      humG.gain.value = 0;
      humG.connect(master);
      const src = ac.createBufferSource();
      src.buffer = noiseBuf;
      src.loop = true;
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 420;
      src.connect(lp);
      lp.connect(humG);
      src.start();
      const osc = ac.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 62;
      osc.connect(humG);
      osc.start();
      humNodes.push(src, osc);
    }
    if (ac.state === 'suspended') {
      const p = ac.resume();
      if (p && p.catch) p.catch(() => {});
    }
  }

  function syncAudio() {
    if (!ac) return;
    const m = host.isMuted();
    if (m !== lastMute) {
      lastMute = m;
      master.gain.cancelScheduledValues(ac.currentTime);
      master.gain.setValueAtTime(m ? 0 : 0.6, ac.currentTime);
    }
    const target = status === 'playing' ? (isHeld() ? 0.16 : 0.05) : 0;
    if (target !== humT) {
      humT = target;
      humG.gain.setTargetAtTime(target, ac.currentTime, 0.06);
    }
  }

  function tone(f, d, type, vol, delay, f2) {
    if (!ac || host.isMuted()) return;
    const t = ac.currentTime + (delay || 0);
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + d + 0.02);
  }

  function noise(d, vol, cutoff) {
    if (!ac || host.isMuted()) return;
    const t = ac.currentTime;
    const s = ac.createBufferSource(), g = ac.createGain(), lp = ac.createBiquadFilter();
    s.buffer = noiseBuf;
    lp.type = 'lowpass';
    lp.frequency.value = cutoff;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    s.connect(lp);
    lp.connect(g);
    g.connect(master);
    s.start(t);
    s.stop(t + d + 0.02);
  }

  // ---------- world ----------
  function makeDoors(a, d, ph) {
    return { kind: 'doors', alt: a, w: TAU / lerp(3.4, 2.0, d), ph: ph, size: lerp(72, 54, d), passed: false };
  }

  function spawnOne() {
    const lv = levelAt(nextAlt), d = Math.min(lv - 1, 10) / 10;
    let kind = 'doors';
    if (spawned >= 2) {
      const r = Math.random();
      if (lv >= 3 && r < 0.22) kind = 'twin';
      else if (lv >= 2 && r < 0.5) kind = 'sweep';
      else if (r < 0.72) kind = 'slider';
    }
    let top = nextAlt;
    if (kind === 'twin') {
      const ph = rand(0, TAU);
      shutters.push(makeDoors(nextAlt, d, ph));
      top = nextAlt + 72;
      shutters.push(makeDoors(top, d, ph + 2.2));
    } else if (kind === 'slider') {
      shutters.push({ kind: 'slider', alt: nextAlt, w: lerp(1.2, 1.9, d), ph: rand(0, TAU), size: lerp(100, 74, d), amp: lerp(70, 95, d), passed: false });
    } else if (kind === 'sweep') {
      shutters.push({ kind: 'sweep', alt: nextAlt, w: lerp(1.0, 1.7, d), ph: rand(0, TAU), amp: lerp(75, 100, d), side: Math.random() < 0.5 ? -1 : 1, passed: false });
    } else {
      shutters.push(makeDoors(nextAlt, d, rand(0, TAU)));
    }
    spawned++;
    const spacing = lerp(270, 175, d) + rand(0, 30);
    const count = 1 + Math.floor(Math.random() * 3);
    const swaying = Math.random() < Math.min(0.9, 0.3 + (lv - 1) * 0.15);
    const amp = swaying ? rand(40, 95) : 0;
    const w = rand(1.2, 2.0), ph = rand(0, TAU);
    const mid = top + spacing / 2;
    for (let i = 0; i < count; i++) {
      motes.push({ alt: mid + (i - (count - 1) / 2) * 30, amp: amp, w: w, ph: ph + i * 0.5 });
    }
    nextAlt = top + spacing;
  }

  function spawnAhead() {
    while (nextAlt < camAlt + VH + 120) spawnOne();
  }

  function spans(s) {
    const o = Math.sin(s.w * time + s.ph);
    if (s.kind === 'doors') {
      const h = s.size * clamp(o * 1.6 + 0.5, 0, 1);
      return [[WL, CX - h], [CX + h, WR]];
    }
    if (s.kind === 'slider') {
      const c = CX + s.amp * o, h = s.size / 2;
      return [[WL, Math.max(WL, c - h)], [Math.min(WR, c + h), WR]];
    }
    const e = s.amp * o;
    return s.side < 0 ? [[WL, CX + e]] : [[CX - e, WR]];
  }

  const moteX = (m) => CX + m.amp * Math.sin(m.w * time + m.ph);

  function reset() {
    alt = START_ALT; camAlt = 0; v = 30; maxAlt = START_ALT; bonus = 0;
    flame = MAX_FLAME; sparkCount = 0; sinceRestore = 0; chain = 0; invuln = 0;
    level = 1; hitFlash = 0; everHeld = false; runT = 0; emberAcc = 0;
    shutters = []; motes = []; particles = []; floats = [];
    nextAlt = 470; spawned = 0;
    spawnAhead();
  }

  function isHeld() {
    return keys.size > 0 || padHeld || pointerHeld;
  }

  function clearHeld() {
    keys.clear();
    padHeld = false;
    pointerHeld = false;
  }

  function emit() {
    const score = Math.min(1000000, Math.floor((maxAlt - START_ALT) / 10) + bonus);
    const f = Math.max(0, flame);
    const key = status + '|' + score + '|' + level + '|' + sparkCount + '|' + f;
    if (key === lastEmit) return;
    lastEmit = key;
    const state = { status: status, score: score, level: level, stats: { sparks: sparkCount, flame: f } };
    if (status === 'over') state.won = false;
    host.update(state);
  }

  function burst(n, a, x) {
    for (let i = 0; i < n && particles.length < 160; i++) {
      const ang = rand(0, TAU), sp = rand(30, 130), life = rand(0.35, 0.9);
      particles.push({ x: x, a: a, vx: Math.cos(ang) * sp, va: Math.sin(ang) * sp, life: life, max: life, c: EMBERS[i % 3] });
    }
  }

  function die() {
    status = 'over';
    overAt = performance.now();
    tone(330, 0.5, 'triangle', 0.16, 0, 90);
    tone(165, 0.8, 'sine', 0.16, 0.12, 50);
    emit();
  }

  function hurt() {
    flame--;
    chain = 0;
    invuln = 1.6;
    hitFlash = 1;
    burst(22, alt, CX);
    noise(0.28, 0.3, 1400);
    tone(180, 0.25, 'sawtooth', 0.12, 0, 60);
    if (flame <= 0) die();
  }

  function collect(m, x) {
    chain++;
    sparkCount++;
    sinceRestore++;
    const pts = 25 * Math.min(chain, 4);
    bonus += pts;
    floats.push({ x: x, a: m.alt, txt: '+' + pts, life: 0.9 });
    burst(6, m.alt, x);
    const n = NOTES[(chain - 1) % NOTES.length];
    tone(n, 0.16, 'sine', 0.16);
    tone(n * 2, 0.1, 'sine', 0.06, 0.04);
    if (sinceRestore >= 12) {
      sinceRestore = 0;
      if (flame < MAX_FLAME) {
        flame++;
        burst(18, alt, CX);
        tone(523, 0.14, 'triangle', 0.14, 0.08);
        tone(784, 0.14, 'triangle', 0.14, 0.18);
        tone(1047, 0.24, 'triangle', 0.14, 0.28);
      }
    }
  }

  function step(dt) {
    runT += dt;
    const held = isHeld();
    if (held) everHeld = true;
    const target = held ? 175 : -75, k = held ? 3.5 : 2.4;
    v += (target - v) * (1 - Math.exp(-k * dt));
    alt += v * dt;
    if (runT > 1.5) camAlt += Math.min(10 + 3 * (level - 1), 36) * dt;
    if (alt - camAlt > 320) camAlt = alt - 320;
    if (alt > maxAlt) maxAlt = alt;
    const lv = levelAt(maxAlt);
    if (lv > level) {
      level = lv;
      tone(440, 0.12, 'triangle', 0.12);
      tone(660, 0.2, 'triangle', 0.12, 0.1);
    }
    invuln = Math.max(0, invuln - dt);

    if (held) {
      emberAcc += dt * 30;
      while (emberAcc >= 1 && particles.length < 160) {
        emberAcc -= 1;
        const life = rand(0.4, 0.9);
        particles.push({ x: CX + rand(-4, 4), a: alt - 12, vx: rand(-12, 12), va: rand(-90, -40), life: life, max: life, c: EMBERS[Math.floor(Math.random() * 3)] });
      }
      if (emberAcc >= 1) emberAcc = 0;
    }

    for (const s of shutters) {
      if (!s.passed && alt > s.alt + HALF + R) {
        s.passed = true;
        bonus += 5;
        tone(150, 0.07, 'square', 0.05);
      }
      if (invuln > 0 || Math.abs(alt - s.alt) > HALF + R) continue;
      for (const sp of spans(s)) {
        if (sp[1] <= sp[0]) continue;
        const nx = clamp(CX, sp[0], sp[1]), ny = clamp(alt, s.alt - HALF, s.alt + HALF);
        const dx = CX - nx, dy = alt - ny;
        if (dx * dx + dy * dy < R * R) {
          if (alt < s.alt) { alt = s.alt - HALF - R - 1; v = -110; } else { alt = s.alt + HALF + R + 1; v = 90; }
          hurt();
          break;
        }
      }
      if (status !== 'playing') return;
    }

    for (const m of motes) {
      if (m.done) continue;
      const x = moteX(m), dx = x - CX, dy = m.alt - alt;
      if (dx * dx + dy * dy < 22 * 22) {
        m.done = true;
        collect(m, x);
      } else if (alt > m.alt + 40) {
        m.done = true;
        m.missed = true;
        chain = 0;
      }
    }
    motes = motes.filter((m) => m.alt > camAlt - 40 && (!m.done || m.missed));
    shutters = shutters.filter((s) => s.alt > camAlt - 40);

    if (alt < camAlt + 6) {
      if (invuln <= 0) hurt();
      alt = camAlt + 6;
      v = Math.max(v, 190);
      if (status !== 'playing') return;
    }
    spawnAhead();
    emit();
  }

  function tick(dt) {
    if (status === 'paused') return;
    time += dt;
    if (status === 'playing') step(dt);
    else if (status === 'over') {
      v -= 260 * dt;
      alt = Math.max(camAlt - 60, alt + v * dt);
    }
    hitFlash = Math.max(0, hitFlash - dt * 2.5);
    const wantLight = LIGHT[clamp(flame, 0, MAX_FLAME)] + (status === 'playing' && isHeld() ? 15 : 0);
    light += (wantLight - light) * (1 - Math.exp(-4 * dt));
    for (const p of particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.a += p.va * dt;
    }
    particles = particles.filter((p) => p.life > 0);
    for (const f of floats) {
      f.life -= dt;
      f.a += 34 * dt;
    }
    floats = floats.filter((f) => f.life > 0);
  }

  // ---------- drawing ----------
  const screenY = (a) => VH - (a - camAlt);

  function drawWalls() {
    ctx.fillStyle = '#12151f';
    ctx.fillRect(WL, 0, WR - WL, VH);
    const bh = 36, off = camAlt * 0.6, r0 = Math.floor(off / bh);
    const rows = Math.ceil(VH / bh) + 1;
    for (let r = r0; r <= r0 + rows; r++) {
      const y = VH - (r * bh - off) - bh;
      const shift = r % 2 === 0 ? 0 : 30;
      for (let i = -1; i < 5; i++) {
        ctx.fillStyle = SHADES[Math.floor(hash(r * 7 + i) * 8)];
        ctx.fillRect(WL + i * 60 + shift + 1, y + 1, 58, bh - 2);
      }
    }
    ctx.fillStyle = '#0a0b12';
    ctx.fillRect(0, 0, WL, VH);
    ctx.fillRect(WR, 0, VW - WR, VH);
    const sh = 22, s0 = Math.floor(camAlt / sh), srows = Math.ceil(VH / sh) + 1;
    for (let r = s0; r <= s0 + srows; r++) {
      const y = VH - (r * sh - camAlt) - sh;
      const seam = r % 2 === 0 ? 8 : 16;
      ctx.fillStyle = BRICKS[Math.floor(hash(r * 3 + 1) * 8)];
      ctx.fillRect(0, y + 1, seam - 1, sh - 2);
      ctx.fillStyle = BRICKS[Math.floor(hash(r * 5 + 2) * 8)];
      ctx.fillRect(seam, y + 1, WL - seam - 1, sh - 2);
      ctx.fillStyle = BRICKS[Math.floor(hash(r * 11 + 3) * 8)];
      ctx.fillRect(WR + 1, y + 1, seam - 1, sh - 2);
      ctx.fillStyle = BRICKS[Math.floor(hash(r * 13 + 4) * 8)];
      ctx.fillRect(WR + seam + 1, y + 1, VW - WR - seam - 1, sh - 2);
    }
  }

  function drawPlate(x0, x1, y) {
    const w = x1 - x0;
    if (w <= 0.5) return;
    ctx.fillStyle = '#4a5068';
    ctx.fillRect(x0, y - HALF, w, HALF * 2);
    ctx.fillStyle = '#6b7290';
    ctx.fillRect(x0, y - HALF, w, 2);
    ctx.fillStyle = '#2b2f42';
    ctx.fillRect(x0, y + HALF - 2, w, 2);
    ctx.fillStyle = '#343950';
    if (x0 <= WL + 0.01) {
      for (let x = x1 - 14; x > x0; x -= 14) ctx.fillRect(x, y - HALF + 2, 2, HALF * 2 - 4);
    } else {
      for (let x = x0 + 14; x < x1; x += 14) ctx.fillRect(x, y - HALF + 2, 2, HALF * 2 - 4);
    }
  }

  function drawPlateEdges(x0, x1, y) {
    if (x1 - x0 <= 0.5) return;
    ctx.fillStyle = 'rgba(127,184,216,0.42)';
    ctx.fillRect(x0, y - HALF, x1 - x0, 1);
    ctx.fillRect(x0, y + HALF - 1, x1 - x0, 1);
    ctx.fillStyle = '#ffb347';
    if (x0 <= WL + 0.01) ctx.fillRect(x1 - 3, y - HALF, 3, HALF * 2);
    if (x1 >= WR - 0.01) ctx.fillRect(x0, y - HALF, 3, HALF * 2);
  }

  function drawMote(m) {
    const x = moteX(m), y = screenY(m.alt);
    if (y < -20 || y > VH + 20) return;
    const tw = 0.75 + 0.25 * Math.sin(time * 7 + m.alt);
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(255,170,60,' + 0.22 * tw + ')';
    ctx.beginPath();
    ctx.arc(x, y, 13, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,205,110,' + 0.55 * tw + ')';
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,235,170,' + 0.8 * tw + ')';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - 8, y);
    ctx.lineTo(x + 8, y);
    ctx.moveTo(x, y - 8);
    ctx.lineTo(x, y + 8);
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#fff6d0';
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, TAU);
    ctx.fill();
  }

  function drawLantern(y, lit, held) {
    ctx.save();
    ctx.translate(CX, y);
    ctx.rotate(Math.sin(time * 2.2) * 0.05);
    if (invuln > 0 && Math.floor(time * 12) % 2 === 0) ctx.globalAlpha = 0.45;
    ctx.strokeStyle = '#a58a5e';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, -16, 3.5, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = lit ? '#ffcf70' : '#2a2a33';
    ctx.fillRect(-7, -10, 14, 19);
    if (lit) {
      const fl = (held ? 10 : 7) + Math.sin(time * 19) * 1.2 + Math.sin(time * 31) * 0.7;
      ctx.fillStyle = '#ff8f26';
      ctx.beginPath();
      ctx.moveTo(0, 6 - fl * 1.2);
      ctx.quadraticCurveTo(6, 3, 0, 7);
      ctx.quadraticCurveTo(-6, 3, 0, 6 - fl * 1.2);
      ctx.fill();
      ctx.fillStyle = '#fff4bd';
      ctx.beginPath();
      ctx.moveTo(0, 6 - fl * 0.7);
      ctx.quadraticCurveTo(3, 4, 0, 6.5);
      ctx.quadraticCurveTo(-3, 4, 0, 6 - fl * 0.7);
      ctx.fill();
    }
    ctx.fillStyle = '#5a4630';
    ctx.beginPath();
    ctx.moveTo(-9, -10);
    ctx.lineTo(-5, -14);
    ctx.lineTo(5, -14);
    ctx.lineTo(9, -10);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(-9, 9, 18, 3);
    ctx.fillRect(-8, -10, 2, 19);
    ctx.fillRect(6, -10, 2, 19);
    ctx.restore();
  }

  function draw() {
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#04050b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.setTransform(scale, 0, 0, scale, ox, oy);
    ctx.beginPath();
    ctx.rect(0, 0, VW, VH);
    ctx.clip();

    drawWalls();
    const visible = [];
    for (const s of shutters) {
      const y = screenY(s.alt);
      if (y < -20 || y > VH + 20) continue;
      const list = spans(s);
      visible.push({ y: y, list: list });
      for (const sp of list) drawPlate(sp[0], sp[1], y);
    }

    const ly = screenY(alt);
    const dark = ctx.createRadialGradient(CX, ly, light * 0.12, CX, ly, light * 1.35);
    dark.addColorStop(0, 'rgba(4,5,12,0)');
    dark.addColorStop(0.55, 'rgba(4,5,12,0.45)');
    dark.addColorStop(1, 'rgba(4,5,12,0.9)');
    ctx.fillStyle = dark;
    ctx.fillRect(0, 0, VW, VH);

    const lit = status !== 'over';
    if (lit) {
      const warm = ctx.createRadialGradient(CX, ly, 4, CX, ly, light * 0.8);
      warm.addColorStop(0, 'rgba(255,170,70,0.3)');
      warm.addColorStop(1, 'rgba(255,170,70,0)');
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = warm;
      ctx.fillRect(0, 0, VW, VH);
      ctx.globalCompositeOperation = 'source-over';
    }

    for (const row of visible) {
      for (const sp of row.list) drawPlateEdges(sp[0], sp[1], row.y);
    }
    for (const m of motes) if (!m.done) drawMote(m);

    ctx.globalCompositeOperation = 'lighter';
    for (const p of particles) {
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.c;
      ctx.fillRect(p.x - 1.2, screenY(p.a) - 1.2, 2.4, 2.4);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    const held = status === 'playing' && isHeld();
    drawLantern(ly, lit, held);

    if ((status === 'playing' || status === 'ready') && !everHeld) {
      ctx.lineWidth = 2.5;
      for (let i = 0; i < 3; i++) {
        const a = 0.25 + 0.75 * (Math.sin(time * 5 - i) + 1) / 2;
        const y = ly - 32 - i * 12;
        ctx.strokeStyle = 'rgba(255,220,150,' + a + ')';
        ctx.beginPath();
        ctx.moveTo(CX - 8, y + 4);
        ctx.lineTo(CX, y - 4);
        ctx.lineTo(CX + 8, y + 4);
        ctx.stroke();
      }
    }

    const gloom = ctx.createLinearGradient(0, VH - 70, 0, VH);
    gloom.addColorStop(0, 'rgba(2,2,6,0)');
    gloom.addColorStop(1, 'rgba(2,2,6,0.95)');
    ctx.fillStyle = gloom;
    ctx.fillRect(0, VH - 70, VW, 70);
    if (status === 'playing') {
      const near = clamp(1 - (alt - camAlt) / 110, 0, 1);
      if (near > 0) {
        const warn = ctx.createLinearGradient(0, VH - 110, 0, VH);
        warn.addColorStop(0, 'rgba(150,30,40,0)');
        warn.addColorStop(1, 'rgba(150,30,40,' + 0.6 * near + ')');
        ctx.fillStyle = warn;
        ctx.fillRect(0, VH - 110, VW, 110);
      }
    }
    if (hitFlash > 0) {
      ctx.fillStyle = 'rgba(190,40,40,' + 0.28 * hitFlash + ')';
      ctx.fillRect(0, 0, VW, VH);
    }

    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const f of floats) {
      ctx.globalAlpha = clamp(f.life / 0.5, 0, 1);
      ctx.fillStyle = '#ffe9a8';
      ctx.fillText(f.txt, f.x, screenY(f.a) - 12);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function frame(ts) {
    if (destroyed) return;
    raf = requestAnimationFrame(frame);
    const dt = clamp((ts - last) / 1000, 0, 0.05) || 0;
    last = ts;
    tick(dt);
    syncAudio();
    draw();
  }

  function resize() {
    if (destroyed) return;
    const cw = canvas.clientWidth, ch = canvas.clientHeight;
    if (cw > 0 && ch > 0) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round(cw * dpr), h = Math.round(ch * dpr);
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
    }
    scale = Math.min(canvas.width / VW, canvas.height / VH);
    ox = (canvas.width - VW * scale) / 2;
    oy = (canvas.height - VH * scale) / 2;
    draw();
  }

  // ---------- controls ----------
  function start() {
    if (destroyed) return;
    if (status === 'playing' && runT < 0.6) return;
    ensureAudio();
    reset();
    status = 'playing';
    tone(330, 0.14, 'triangle', 0.12);
    tone(495, 0.2, 'triangle', 0.12, 0.1);
    emit();
  }

  function pause() {
    if (destroyed || status !== 'playing') return;
    status = 'paused';
    if (ac && ac.state === 'running') {
      const p = ac.suspend();
      if (p && p.catch) p.catch(() => {});
    }
    emit();
  }

  function resume() {
    if (destroyed || status !== 'paused') return;
    status = 'playing';
    ensureAudio();
    emit();
  }

  function tryStart() {
    if ((status === 'ready' || status === 'over') && performance.now() - overAt > 500) start();
  }

  function onKeyDown(e) {
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    const c = keyCode(e);
    if (c === 'Space' || c.indexOf('Arrow') === 0) e.preventDefault();
    if (c === 'KeyP' || c === 'Escape') {
      if (e.repeat) return;
      if (status === 'playing') pause();
      else if (status === 'paused') resume();
      return;
    }
    const rise = c === 'Space' || c === 'ArrowUp' || c === 'KeyW';
    if (rise) keys.add(c);
    if (e.repeat) return;
    if ((c === 'Space' || c === 'Enter') && (status === 'ready' || status === 'over')) {
      e.preventDefault();
      tryStart();
    } else if (rise && status === 'playing') {
      ensureAudio();
    }
  }

  function onKeyUp(e) {
    keys.delete(keyCode(e));
  }

  function onPointerDown(e) {
    e.preventDefault();
    pointerHeld = true;
    if (status === 'playing') ensureAudio();
    else tryStart();
  }

  function onPointerUp() {
    pointerHeld = false;
  }

  function onContextMenu(e) {
    e.preventDefault();
  }

  function onBlur() {
    clearHeld();
  }

  function onVisibility() {
    if (document.hidden) {
      clearHeld();
      pause();
    }
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  document.addEventListener('visibilitychange', onVisibility);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('contextmenu', onContextMenu);
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  reset();
  resize();
  emit();
  raf = requestAnimationFrame(frame);

  return {
    start: start,
    pause: pause,
    resume: resume,
    input(action, down) {
      if (destroyed || action !== 'rise') return;
      padHeld = !!down;
      if (!down) return;
      if (status === 'playing') ensureAudio();
      else tryStart();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('contextmenu', onContextMenu);
      canvas.style.touchAction = prevTouchAction;
      clearHeld();
      for (const n of humNodes) {
        try { n.stop(); } catch (e) { /* already stopped */ }
      }
      humNodes.length = 0;
      if (ac) {
        const p = ac.close();
        if (p && p.catch) p.catch(() => {});
        ac = null;
      }
    },
  };
}
