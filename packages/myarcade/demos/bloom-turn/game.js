// Bloom Turn: turn 2x2 blocks on a 7x7 board; matching squares bloom and new tiles slide in from the left.
const N = 7;
const LAST = N - 2;
const TURNS = 30;
const KINDS = 4;
const MAX_SCORE = 9999999;
const ROT_T = 0.14;
const BLOOM_T = 0.34;
const SLIDE_T = 0.22;
const COLORS = [
  { fill: '#e4574c', deep: '#a5322b', mark: '#ffe6df' },
  { fill: '#eeb02f', deep: '#ab7410', mark: '#fff6d8' },
  { fill: '#1fa98f', deep: '#0f6f5e', mark: '#dcfff6' },
  { fill: '#8a5fd6', deep: '#5a3a9c', mark: '#efe6ff' },
];
const STR = {
  en: { level: 'Level', turns: 'Turns', goal: 'Target', banner: (l) => 'Level ' + l + ' · ' + TURNS + ' turns' },
  'zh-TW': { level: '關卡', turns: '回合', goal: '目標', banner: (l) => '第 ' + l + ' 關 · ' + TURNS + ' 回合' },
};
const goalFor = (l) => (l <= 0 ? 0 : 400 * l + 50 * l * (l + 1));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const easeOut = (p) => 1 - Math.pow(1 - p, 3);

export function mount(canvas, host) {
  const ctx = canvas.getContext('2d');
  const txt = STR[host.lang] || STR.en;
  let w = 1, h = 1, dpr = 1;
  let bx = 0, by = 0, S = 1, cell = 1, gut = 14, hud = { x: 0, y: 0, w: 1, h: 1, side: true };
  let status = 'ready', score = 0, level = 1, turns = TURNS;
  let grid = [], cur = { r: 2, c: 2 }, phase = 'idle', phaseT = 0, rot = null, chain = 0, queued = 0;
  let parts = [], floats = [], bannerT = 0, bannerLevel = 1, clock = 0, overAt = -1000;
  let raf = 0, last = 0, alive = true, audio = null, master = null;

  function randKind() { return Math.floor(Math.random() * KINDS); }
  function newTile(k) { return { k, ox: 0, mark: false }; }
  function newBoard() {
    grid = [];
    for (let r = 0; r < N; r++) {
      const row = [];
      grid.push(row);
      for (let c = 0; c < N; c++) {
        let k = randKind();
        while (r > 0 && c > 0 && grid[r - 1][c - 1].k === k && grid[r - 1][c].k === k && row[c - 1].k === k) k = randKind();
        row.push(newTile(k));
      }
    }
  }
  function push() {
    if (!alive) return;
    host.update({ status, score, level, won: false, stats: { turns, goal: goalFor(level) } });
  }

  // Sound
  function ensureAudio() {
    if (!audio) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        audio = new AC();
        master = audio.createGain();
        master.connect(audio.destination);
      } catch (err) { audio = null; master = null; return; }
    }
    if (audio.state === 'suspended') {
      const p = audio.resume();
      if (p && p.catch) p.catch(() => {});
    }
  }
  function syncGain() {
    if (master) master.gain.value = host.isMuted() || status === 'paused' ? 0 : 1;
  }
  function tone(freq, at, dur, type, vol) {
    if (!audio || host.isMuted()) return;
    const t = audio.currentTime + at;
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  function sfxTurn() { tone(300, 0, 0.09, 'triangle', 0.14); tone(450, 0.04, 0.07, 'triangle', 0.08); }
  function sfxBloom() {
    const base = 392 * Math.pow(1.122, Math.min(chain - 1, 8));
    [1, 1.25, 1.5, 2].forEach((m, i) => tone(base * m, i * 0.05, 0.32, 'sine', 0.13));
  }
  function sfxLevel() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.08, 0.3, 'triangle', 0.13)); }
  function sfxOver() { [392, 330, 262, 196].forEach((f, i) => tone(f, i * 0.14, 0.34, 'sine', 0.14)); }

  // Rules
  function rotate(dir) {
    if (status !== 'playing') return;
    if (phase !== 'idle') { queued = dir; return; }
    if (turns <= 0) return;
    const r = cur.r, c = cur.c;
    const a = grid[r][c], b = grid[r][c + 1], d = grid[r + 1][c + 1], e = grid[r + 1][c];
    if (dir > 0) {
      grid[r][c + 1] = a; grid[r + 1][c + 1] = b; grid[r + 1][c] = d; grid[r][c] = e;
    } else {
      grid[r][c] = b; grid[r][c + 1] = d; grid[r + 1][c + 1] = e; grid[r + 1][c] = a;
    }
    rot = { r, c, dir };
    phase = 'rotate';
    phaseT = 0;
    chain = 0;
    turns--;
    sfxTurn();
    push();
  }
  function resolve() {
    for (let r = 0; r <= LAST; r++) {
      for (let c = 0; c <= LAST; c++) {
        const k = grid[r][c].k;
        if (grid[r][c + 1].k === k && grid[r + 1][c].k === k && grid[r + 1][c + 1].k === k) {
          grid[r][c].mark = grid[r][c + 1].mark = grid[r + 1][c].mark = grid[r + 1][c + 1].mark = true;
        }
      }
    }
    let count = 0, sx = 0, sy = 0;
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (!grid[r][c].mark) continue;
        count++;
        sx += c + 0.5;
        sy += r + 0.5;
        spawnPetals(c + 0.5, r + 0.5, grid[r][c].k);
      }
    }
    if (!count) { phase = 'idle'; settle(); return; }
    chain++;
    const pts = 25 * count * chain;
    score = Math.min(MAX_SCORE, score + pts);
    floats.push({ x: sx / count, y: sy / count, life: 1, text: '+' + pts + (chain > 1 ? ' ×' + chain : '') });
    phase = 'bloom';
    phaseT = 0;
    sfxBloom();
    push();
  }
  function collapse() {
    for (let r = 0; r < N; r++) {
      const row = grid[r];
      let write = N - 1;
      for (let read = N - 1; read >= 0; read--) {
        const t = row[read];
        if (t.mark) continue;
        t.ox = read - write;
        row[write--] = t;
      }
      const fresh = write + 1;
      for (let c = write; c >= 0; c--) {
        row[c] = newTile(randKind());
        row[c].ox = -fresh;
      }
    }
    phase = 'slide';
    phaseT = 0;
  }
  function settle() {
    chain = 0;
    let up = false;
    while (score >= goalFor(level)) { level++; up = true; }
    if (up) {
      turns = TURNS;
      bannerT = 1.8;
      bannerLevel = level;
      sfxLevel();
      push();
    } else if (turns <= 0) {
      status = 'over';
      queued = 0;
      overAt = performance.now();
      sfxOver();
      push();
      return;
    }
    if (queued) {
      const d = queued;
      queued = 0;
      rotate(d);
    }
  }
  function step(dt) {
    if (status === 'playing' && phase !== 'idle') {
      phaseT += dt;
      if (phase === 'rotate' && phaseT >= ROT_T) { rot = null; resolve(); }
      else if (phase === 'bloom' && phaseT >= BLOOM_T) collapse();
      else if (phase === 'slide' && phaseT >= SLIDE_T) {
        for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) grid[r][c].ox = 0;
        resolve();
      }
    }
    if (status === 'paused') return;
    clock += dt;
    bannerT = Math.max(0, bannerT - dt);
    for (const p of parts) {
      p.life -= dt / p.max;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 1.6 * dt;
      p.spin += p.vs * dt;
    }
    parts = parts.filter((p) => p.life > 0);
    for (const f of floats) { f.life -= dt / 1.1; f.y -= 0.8 * dt; }
    floats = floats.filter((f) => f.life > 0);
  }
  function spawnPetals(x, y, k) {
    for (let i = 0; i < 6 && parts.length < 240; i++) {
      const a = Math.random() * Math.PI * 2, v = 0.8 + Math.random() * 1.8;
      parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.4, k, life: 1, max: 0.5 + Math.random() * 0.4, spin: a, vs: 4 - Math.random() * 8 });
    }
  }
  function moveCursor(dr, dc) {
    if (status !== 'playing') return;
    cur.r = clamp(cur.r + dr, 0, LAST);
    cur.c = clamp(cur.c + dc, 0, LAST);
  }

  // Drawing
  function rr(x, y, wd, ht, rad) {
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + wd, y, x + wd, y + ht, rad);
    ctx.arcTo(x + wd, y + ht, x, y + ht, rad);
    ctx.arcTo(x, y + ht, x, y, rad);
    ctx.arcTo(x, y, x + wd, y, rad);
    ctx.closePath();
  }
  function emblem(k, s) {
    const col = COLORS[k];
    ctx.fillStyle = col.mark;
    ctx.strokeStyle = col.mark;
    if (k === 0) {
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * s * 0.2, Math.sin(a) * s * 0.2, s * 0.125, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = col.deep;
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.08, 0, Math.PI * 2);
      ctx.fill();
    } else if (k === 1) {
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 4, q = i % 2 ? 0.1 : 0.36;
        ctx.lineTo(Math.cos(a) * s * q, Math.sin(a) * s * q);
      }
      ctx.closePath();
      ctx.fill();
    } else if (k === 2) {
      ctx.lineWidth = s * 0.09;
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.24, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.075, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(-s * 0.26, -s * 0.25);
      ctx.lineTo(-s * 0.1, -s * 0.09);
      ctx.lineTo(0, -s * 0.29);
      ctx.lineTo(s * 0.1, -s * 0.09);
      ctx.lineTo(s * 0.26, -s * 0.25);
      ctx.quadraticCurveTo(s * 0.31, s * 0.26, 0, s * 0.28);
      ctx.quadraticCurveTo(-s * 0.31, s * 0.26, -s * 0.26, -s * 0.25);
      ctx.closePath();
      ctx.fill();
    }
  }
  function drawTile(t, x, y) {
    let s = cell * 0.9, a = 1;
    if (t.mark && phase === 'bloom') {
      const p = clamp(phaseT / BLOOM_T, 0, 1);
      s *= 1 + 0.35 * easeOut(p);
      a = 1 - p * p;
    }
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(x, y);
    const col = COLORS[t.k];
    ctx.fillStyle = col.deep;
    rr(-s / 2, -s / 2 + s * 0.04, s, s, s * 0.18);
    ctx.fill();
    ctx.fillStyle = col.fill;
    rr(-s / 2, -s / 2, s, s * 0.96, s * 0.18);
    ctx.fill();
    emblem(t.k, s);
    ctx.restore();
  }
  function drawHud() {
    const bar = (x, y, wd, ht) => {
      const lo = goalFor(level - 1), hi = goalFor(level), p = clamp((score - lo) / (hi - lo), 0, 1);
      ctx.fillStyle = '#2b3350';
      rr(x, y, wd, ht, ht / 2);
      ctx.fill();
      if (p > 0) {
        ctx.fillStyle = '#7fe0a8';
        rr(x, y, Math.max(ht, wd * p), ht, ht / 2);
        ctx.fill();
      }
    };
    const font = (px, bold) => { ctx.font = (bold ? '700 ' : '') + px + 'px system-ui, sans-serif'; };
    const low = turns <= 5 && status === 'playing';
    ctx.textBaseline = 'alphabetic';
    if (hud.side) {
      const x = hud.x, wd = hud.w;
      let y = hud.y + 22;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#9fb0d8';
      font(14, false);
      ctx.fillText(txt.level + ' ' + level, x, y);
      y += 40;
      ctx.fillText(txt.turns, x, y);
      y += 46;
      font(44, true);
      ctx.fillStyle = low ? '#ff8f7f' : '#f4f6ff';
      ctx.fillText(String(turns), x, y);
      y += 40;
      font(14, false);
      ctx.fillStyle = '#9fb0d8';
      ctx.fillText(txt.goal, x, y);
      y += 12;
      bar(x, y, wd, 10);
      y += 30;
      font(15, true);
      ctx.fillStyle = '#f4f6ff';
      ctx.fillText(score + ' / ' + goalFor(level), x, y, wd);
    } else {
      const x = hud.x, wd = hud.w, y = hud.y;
      font(15, true);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#f4f6ff';
      ctx.fillText(txt.level + ' ' + level, x, y + 18);
      ctx.textAlign = 'right';
      ctx.fillStyle = low ? '#ff8f7f' : '#f4f6ff';
      ctx.fillText(txt.turns + ' ' + turns, x + wd, y + 18);
      bar(x, y + 28, wd, 8);
      font(12, false);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#9fb0d8';
      ctx.fillText(txt.goal + ' ' + score + ' / ' + goalFor(level), x + wd, y + 52);
    }
  }
  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#171c33');
    bg.addColorStop(1, '#0e1a22');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    drawHud();
    ctx.fillStyle = '#20263f';
    rr(bx - 4, by - 4, S + 8, S + 8, 12);
    ctx.fill();
    ctx.fillStyle = '#7fe0a8';
    const inflow = phase === 'slide' ? 1 : 0.4;
    ctx.globalAlpha = inflow;
    for (let r = 0; r < N; r++) {
      const y = by + (r + 0.5) * cell, tip = bx - 6, sz = Math.min(5, cell * 0.12);
      ctx.beginPath();
      ctx.moveTo(tip, y);
      ctx.lineTo(tip - sz * 1.3, y - sz);
      ctx.lineTo(tip - sz * 1.3, y + sz);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.beginPath();
    ctx.rect(bx - 2, by - 2, S + 4, S + 4);
    ctx.clip();
    const slideE = phase === 'slide' ? easeOut(clamp(phaseT / SLIDE_T, 0, 1)) : 1;
    const inRot = (r, c) => rot && r >= rot.r && r <= rot.r + 1 && c >= rot.c && c <= rot.c + 1;
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (inRot(r, c)) continue;
        const t = grid[r][c];
        drawTile(t, bx + (c + 0.5 + t.ox * (1 - slideE)) * cell, by + (r + 0.5) * cell);
      }
    }
    if (rot) {
      const ang = -rot.dir * (Math.PI / 2) * (1 - easeOut(clamp(phaseT / ROT_T, 0, 1)));
      const cs = Math.cos(ang), sn = Math.sin(ang);
      const mx = rot.c + 1, my = rot.r + 1;
      for (let r = rot.r; r <= rot.r + 1; r++) {
        for (let c = rot.c; c <= rot.c + 1; c++) {
          const dx = c + 0.5 - mx, dy = r + 0.5 - my;
          drawTile(grid[r][c], bx + (mx + dx * cs - dy * sn) * cell, by + (my + dx * sn + dy * cs) * cell);
        }
      }
    }
    if (status === 'playing' || status === 'paused') {
      const pulse = 0.72 + 0.28 * Math.sin(clock * 5);
      ctx.strokeStyle = 'rgba(255,255,255,' + pulse.toFixed(3) + ')';
      ctx.lineWidth = Math.max(2, cell * 0.06);
      rr(bx + cur.c * cell + 1, by + cur.r * cell + 1, cell * 2 - 2, cell * 2 - 2, cell * 0.2);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(bx + (cur.c + 1) * cell, by + (cur.r + 1) * cell, Math.max(2.5, cell * 0.06), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    for (const p of parts) {
      ctx.save();
      ctx.globalAlpha = clamp(p.life, 0, 1);
      ctx.translate(bx + p.x * cell, by + p.y * cell);
      ctx.rotate(p.spin);
      ctx.fillStyle = COLORS[p.k].fill;
      ctx.beginPath();
      ctx.ellipse(0, 0, cell * 0.13, cell * 0.06, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 ' + Math.round(clamp(cell * 0.42, 14, 28)) + 'px system-ui, sans-serif';
    for (const f of floats) {
      ctx.globalAlpha = clamp(f.life * 2, 0, 1);
      ctx.fillStyle = '#10131f';
      ctx.fillText(f.text, bx + f.x * cell + 1, by + f.y * cell + 2);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(f.text, bx + f.x * cell, by + f.y * cell);
    }
    ctx.globalAlpha = 1;
    if (bannerT > 0) {
      const a = clamp(bannerT * 2, 0, 1), bh = Math.max(44, cell * 0.95), my = by + S / 2;
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(12,16,30,0.86)';
      ctx.fillRect(bx, my - bh / 2, S, bh);
      ctx.fillStyle = '#7fe0a8';
      ctx.font = '700 ' + Math.round(clamp(cell * 0.42, 15, 28)) + 'px system-ui, sans-serif';
      ctx.fillText(txt.banner(bannerLevel), bx + S / 2, my, S - 12);
      ctx.globalAlpha = 1;
    }
  }
  function layout() {
    const pad = 10;
    if (w / h >= 1.25) {
      const hudW = clamp(w * 0.22, 110, 180);
      S = Math.max(50, Math.min(h - pad * 2, w - hudW - pad * 3 - gut));
      const x0 = (w - (hudW + pad + gut + S)) / 2;
      by = (h - S) / 2;
      bx = x0 + hudW + pad + gut;
      hud = { x: x0, y: by, w: hudW, h: S, side: true };
    } else {
      const hudH = 56;
      S = Math.max(50, Math.min(w - pad * 2 - gut, h - hudH - pad * 3));
      bx = (w - S - gut) / 2 + gut;
      by = (h - hudH - pad - S) / 2 + hudH + pad;
      hud = { x: bx - gut, y: by - hudH - pad, w: S + gut, h: hudH, side: false };
    }
    cell = S / N;
  }
  function resize() {
    const cw = canvas.clientWidth || 1, ch = canvas.clientHeight || 1;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = cw;
    h = ch;
    const pw = Math.round(cw * dpr), ph = Math.round(ch * dpr);
    if (canvas.width !== pw) canvas.width = pw;
    if (canvas.height !== ph) canvas.height = ph;
    layout();
    draw();
  }
  function frame(now) {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    syncGain();
    step(dt);
    draw();
  }

  // Input
  function blockAt(e) {
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) * w) / (rect.width || w);
    const y = ((e.clientY - rect.top) * h) / (rect.height || h);
    if (x < bx || y < by || x > bx + S || y > by + S) return null;
    return {
      r: clamp(Math.round((y - by) / cell) - 1, 0, LAST),
      c: clamp(Math.round((x - bx) / cell) - 1, 0, LAST),
    };
  }
  function onPointerMove(e) {
    if (status !== 'playing' || e.pointerType !== 'mouse') return;
    const b = blockAt(e);
    if (b) cur = b;
  }
  function onPointerDown(e) {
    ensureAudio();
    if (status !== 'playing') return;
    const b = blockAt(e);
    if (!b) return;
    e.preventDefault();
    if (e.pointerType === 'mouse') {
      cur = b;
      rotate(e.button === 2 ? -1 : 1);
    } else if (b.r === cur.r && b.c === cur.c) {
      rotate(1);
    } else {
      cur = b;
    }
  }
  function onContextMenu(e) { e.preventDefault(); }
  function onKeyDown(e) {
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = (e.key || '').length === 1 ? e.key.toLowerCase() : e.key;
    if (k === 'p' || k === 'Escape') {
      if (!e.repeat) {
        if (status === 'playing') api.pause();
        else if (status === 'paused') api.resume();
      }
      return;
    }
    if (k === ' ' || k === 'Enter') {
      e.preventDefault();
      if (e.repeat) return;
      if (status === 'ready' || status === 'over') {
        if (performance.now() - overAt > 600) api.start();
      } else {
        ensureAudio();
        rotate(1);
      }
      return;
    }
    if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown') e.preventDefault();
    if (k === 'ArrowLeft' || k === 'a') moveCursor(0, -1);
    else if (k === 'ArrowRight' || k === 'd') moveCursor(0, 1);
    else if (k === 'ArrowUp' || k === 'w') moveCursor(-1, 0);
    else if (k === 'ArrowDown' || k === 's') moveCursor(1, 0);
    else if ((k === 'x' || k === 'e') && !e.repeat) rotate(1);
    else if ((k === 'z' || k === 'q') && !e.repeat) rotate(-1);
  }
  function onKeyUp(e) {
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.key === ' ') e.preventDefault();
  }
  function onVisibility() {
    if (document.hidden && status === 'playing') api.pause();
  }

  const api = {
    start() {
      ensureAudio();
      if (status === 'playing' && score === 0 && level === 1 && turns === TURNS) return;
      newBoard();
      score = 0;
      level = 1;
      turns = TURNS;
      cur = { r: 2, c: 2 };
      phase = 'idle';
      phaseT = 0;
      rot = null;
      chain = 0;
      queued = 0;
      parts = [];
      floats = [];
      bannerT = 0;
      status = 'playing';
      syncGain();
      push();
    },
    pause() {
      if (status !== 'playing') return;
      status = 'paused';
      syncGain();
      push();
    },
    resume() {
      if (status !== 'paused') return;
      ensureAudio();
      status = 'playing';
      syncGain();
      push();
    },
    input(action, down) {
      if (!down) return;
      ensureAudio();
      if (action === 'left') moveCursor(0, -1);
      else if (action === 'right') moveCursor(0, 1);
      else if (action === 'up') moveCursor(-1, 0);
      else if (action === 'down') moveCursor(1, 0);
      else if (action === 'cw') rotate(1);
      else if (action === 'ccw') rotate(-1);
    },
    destroy() {
      if (!alive) return;
      alive = false;
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('contextmenu', onContextMenu);
      if (audio) {
        const p = audio.close();
        if (p && p.catch) p.catch(() => {});
        audio = null;
        master = null;
      }
    },
  };

  newBoard();
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  document.addEventListener('visibilitychange', onVisibility);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('contextmenu', onContextMenu);
  resize();
  push();
  last = performance.now();
  raf = requestAnimationFrame(frame);
  return api;
}
