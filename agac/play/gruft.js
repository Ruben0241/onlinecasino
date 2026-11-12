/* GRUFT – an ASCII first-person shooter. Raycast walls, floor/ceiling casting and
   billboard sprites are rendered into a grid of coloured letters (same renderer idea as the tree). */
(() => {
  'use strict';
  const TAU = Math.PI * 2;
  const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
  const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };

  // ---------- levels ----------
  // 1 brick · 2 metal · 3 tech · . floor · P start · d drone · c crawler · h health · a ammo · X exit
  const LEVELS = [
    { name: 'E1 · ZISTERNE', map: [
      '1111111111111111111111',
      '1P...1.........1.....1',
      '1....1....d....1..a..1',
      '1....1.........1.....1',
      '1....111..111..1..c..1',
      '1..h.............1...1',
      '1....111..111....1...1',
      '1111.1......1..111...1',
      '1....1..c...1........1',
      '1.a..1......1..222.2.1',
      '1....11....11..2.d.2.1',
      '1..d.........c.2...2.1',
      '1....11111111..22X22.1',
      '1........h...........1',
      '1111111111111111111111'] },
    { name: 'E2 · MASCHINENRAUM', map: [
      '222222222222222222222222',
      '2P.....2.....c....2....2',
      '2......2..........2..a.2',
      '2..22..2...2222...2....2',
      '2..22......2..2........2',
      '2......2...2d.2...222..2',
      '22.2222.......2...2h...2',
      '2...........c.....2..d.2',
      '2.a.2.33333...2.......c2',
      '2...2.3...3...222222.222',
      '2.d.2.3.h.3............2',
      '2...2.3...3..c..33.33..2',
      '2...2.33.33.....3...3..2',
      '2......d........3.X.3.a2',
      '2...c.......h...3...3..2',
      '222222222222222222222222'] },
    { name: 'E3 · KERN', map: [
      '33333333333333333333333333',
      '3P..3.......d.....3......3',
      '3...3.............3..c...3',
      '3...3...33333.....3......3',
      '3.......3.a.3...d....33..3',
      '33.33...3...3.....3..3h..3',
      '3...3...33.33..c..3..3...3',
      '3.h.3.............3......3',
      '3...3333.....333333.3333.3',
      '3......3..d..3...........3',
      '3.c....3.....3.a..c...d..3',
      '3......3.....3..........c3',
      '33333..333.333..1111.11113',
      '3...........d...1.......13',
      '3.a....c........1..d.X..13',
      '3..........h....1.......13',
      '33333333333333333333333333'] },
  ];

  // ---------- sprites (pixel art; each pixel becomes one shaded letter) ----------
  const PAL = {
    a: [0.30, 0.34, 0.42], b: [0.55, 0.60, 0.70], c: [0.12, 0.13, 0.17], r: [1.0, 0.16, 0.12, 1], w: [1.0, 0.95, 0.85, 1],
    d: [0.35, 0.38, 0.45], e: [1.0, 0.45, 0.15, 1],
    g: [0.16, 0.42, 0.14], G: [0.30, 0.68, 0.22], y: [1.0, 0.9, 0.2, 1], k: [0.05, 0.03, 0.03], t: [0.95, 0.92, 0.80],
    o: [1.0, 0.55, 0.10, 1], O: [1.0, 0.92, 0.45, 1], H: [0.92, 0.92, 0.95], R: [0.90, 0.12, 0.12], B: [0.80, 0.62, 0.22], Y: [0.98, 0.82, 0.35],
    m: [0.22, 0.24, 0.30], M: [0.40, 0.44, 0.52], L: [0.62, 0.68, 0.78], s: [0.78, 0.52, 0.40], x: [0.04, 0.04, 0.05],
    f: [1.0, 0.85, 0.35, 1], F: [1.0, 1.0, 0.85, 1], q: [0.45, 0.08, 0.06],
  };
  const art = (rows) => { const w = Math.max(...rows.map((r) => r.length)); return { w, h: rows.length, px: rows.map((r) => r.padEnd(w, '.')) }; };
  const mirror = (rows) => art(rows.map((r) => r + [...r].reverse().join('')));
  const SPR = {
    drone: art([
      '......aaaa......',
      '....aabbbbaa....',
      '...abbbbbbbba...',
      '..abbbcccbbbba..',
      '..abbcrrrcbbba..',
      '.abbcrwwrrcbbba.',
      '.abbcrrrrrcbbba.',
      '..abbcrrrcbbba..',
      '..abbbcccbbbba..',
      '...abbbbbbbba...',
      '....aabbbbaa....',
      '.....d....d.....',
      '....d......d....',
      '...e........e...']),
    crawler: art([
      '....gggggggg....',
      '..gggGGGGGGggg..',
      '.ggGGyGGGGyGGgg.',
      'gggGGGGGGGGGGggg',
      'ggGktktktktkGGgg',
      'ggGkkkkkkkkkGGgg',
      'gggGtktktktGGggg',
      '.gggGGGGGGGGggg.',
      '..g.g.g..g.g.g..',
      '.g..g..g..g..g..']),
    fire: art(['.oooo.', 'oOOOOo', 'oOFFOo', 'oOFFOo', 'oOOOOo', '.oooo.']),
    health: art(['HHHHHHHH', 'HHHRRHHH', 'HHHRRHHH', 'HRRRRRRH', 'HHHRRHHH', 'HHHRRHHH', 'HHHHHHHH']),
    ammo: art(['.Y.Y.Y.Y', '.B.B.B.B', 'BBBBBBBB', 'BYYYYYYB', 'BBBBBBBB']),
    corpse: art(['....qq.q..', '.qqRqqqqq.', 'qqqqRqqqqq']),
    gun: mirror([
      '........mM',
      '........mM',
      '.......mMx',
      '.......mxx',
      '......mMMM',
      '.....mMMML',
      '....mMMMML',
      '...mMMMMMM',
      '..sMMMMMMM',
      '.ssmMMMMMM',
      'sssmMMMMMM',
      'sssmMMMMMM']),
    flash: art([
      '...f..f...',
      '.f.fFFf.f.',
      '..fFFFFf..',
      'ffFFFFFFff',
      '..fFFFFf..',
      '.f.fFFf.f.']),
  };

  // ---------- canvas / grid ----------
  const canvas = document.getElementById('screen');
  const ctx = canvas.getContext('2d');
  const mask = document.createElement('canvas'), mctx = mask.getContext('2d');
  const colc = document.createElement('canvas'), colctx = colc.getContext('2d');
  const glowc = document.createElement('canvas'), gctx = glowc.getContext('2d');
  const halfc = document.createElement('canvas'), hctx = halfc.getContext('2d');
  const RAMP = [...' .,-:;=+*#%@'];
  const FONT_FAMILY = '"JetBrains Mono", ui-monospace, Menlo, Consolas, monospace';
  let W = 0, H = 0, DPR = 1, COLS = 0, ROWS = 0, CW = 0, CH = 0, FONT = '';
  let gch, cr, cg, cb, gl, zcol, colImg, glowImg;

  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    mask.width = canvas.width; mask.height = canvas.height;
    COLS = Math.max(90, Math.min(200, Math.round(W / 7.2)));
    CW = W / COLS; CH = CW * 1.6; ROWS = Math.ceil(H / CH);
    const n = COLS * ROWS;
    gch = new Uint8Array(n); cr = new Float32Array(n); cg = new Float32Array(n); cb = new Float32Array(n); gl = new Float32Array(n);
    zcol = new Float32Array(COLS);
    colc.width = COLS; colc.height = ROWS; colImg = colctx.createImageData(COLS, ROWS);
    glowc.width = COLS; glowc.height = ROWS; glowImg = gctx.createImageData(COLS, ROWS);
    halfc.width = Math.max(1, COLS >> 2); halfc.height = Math.max(1, ROWS >> 2);
    mctx.font = `700 100px ${FONT_FAMILY}`;
    const adv = mctx.measureText('%%%%%%%%%%').width / 10;
    FONT = `700 ${(100 * CW * DPR / adv).toFixed(3)}px ${FONT_FAMILY}`;
  }
  window.addEventListener('resize', resize);

  // ---------- game state ----------
  const P = { x: 0, y: 0, a: 0, hp: 100, ammo: 40, cd: 0, bob: 0, hurt: 0, flash: 0, heal: 0 };
  let map = [], MW = 0, MH = 0, ents = [], shots = [], kills = 0, total = 0, level = 0;
  let state = 'title', msgT = 0;
  const FOV = 66 * Math.PI / 180, TANH = Math.tan(FOV / 2);

  function loadLevel(i) {
    level = i;
    const L = LEVELS[i];
    const w = Math.max(...L.map.map((r) => r.length));
    map = L.map.map((r) => [...r.padEnd(w, '1')]);
    MH = map.length; MW = w;
    ents = []; shots = []; kills = 0; total = 0;
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      const ch = map[y][x];
      const cx = x + 0.5, cy = y + 0.5;
      if (ch === 'P') { P.x = cx; P.y = cy; P.a = 0; }
      else if (ch === 'd') { ents.push({ k: 'drone', x: cx, y: cy, hp: 3, cd: 1 + Math.random(), alert: false, hit: 0, ph: Math.random() * TAU }); total++; }
      else if (ch === 'c') { ents.push({ k: 'crawler', x: cx, y: cy, hp: 2, cd: 0, alert: false, hit: 0, ph: Math.random() * TAU }); total++; }
      else if (ch === 'h') ents.push({ k: 'health', x: cx, y: cy });
      else if (ch === 'a') ents.push({ k: 'ammo', x: cx, y: cy });
      if ('Pdcha'.includes(ch)) map[y][x] = '.';
    }
    P.hp = Math.max(P.hp, 60); P.cd = 0; P.hurt = 0;
    say(L.name, 2.2);
  }
  const wallAt = (x, y) => { const c = map[y | 0]?.[x | 0]; return c === undefined || (c >= '1' && c <= '3'); };
  function tryMove(o, dx, dy, r) {
    if (!wallAt(o.x + dx + Math.sign(dx) * r, o.y) && !wallAt(o.x + dx + Math.sign(dx) * r, o.y + r * 0.7) && !wallAt(o.x + dx + Math.sign(dx) * r, o.y - r * 0.7)) o.x += dx;
    if (!wallAt(o.x, o.y + dy + Math.sign(dy) * r) && !wallAt(o.x + r * 0.7, o.y + dy + Math.sign(dy) * r) && !wallAt(o.x - r * 0.7, o.y + dy + Math.sign(dy) * r)) o.y += dy;
  }
  function los(ax, ay, bx, by) {
    const d = Math.hypot(bx - ax, by - ay), n = Math.ceil(d * 4);
    for (let i = 1; i < n; i++) if (wallAt(ax + (bx - ax) * i / n, ay + (by - ay) * i / n)) return false;
    return true;
  }

  // ---------- messages & sound ----------
  const elMsg = document.getElementById('msg');
  function say(text, dur = 1.4) { elMsg.textContent = text; elMsg.style.opacity = 1; msgT = dur; }
  let ac = null;
  function sfx(kind) {
    if (!ac) return;
    const t = ac.currentTime, g = ac.createGain();
    g.connect(ac.destination);
    if (kind === 'shot' || kind === 'boom') {
      const len = kind === 'shot' ? 0.14 : 0.35, buf = ac.createBuffer(1, ac.sampleRate * len, ac.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, kind === 'shot' ? 3 : 2);
      const s = ac.createBufferSource(), f = ac.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = kind === 'shot' ? 2400 : 700;
      s.buffer = buf; s.connect(f); f.connect(g); g.gain.value = kind === 'shot' ? 0.35 : 0.5; s.start(t);
      return;
    }
    const o = ac.createOscillator(); o.connect(g);
    const spec = { hurt: ['square', 160, 60, 0.25, 0.12], pick: ['sine', 660, 990, 0.18, 0.15], spit: ['sawtooth', 420, 120, 0.2, 0.06], exit: ['triangle', 330, 880, 0.6, 0.15] }[kind];
    o.type = spec[0]; o.frequency.setValueAtTime(spec[1], t); o.frequency.exponentialRampToValueAtTime(spec[2], t + spec[3]);
    g.gain.setValueAtTime(spec[4], t); g.gain.exponentialRampToValueAtTime(0.001, t + spec[3]);
    o.start(t); o.stop(t + spec[3]);
  }

  // ---------- input ----------
  const keys = new Set();
  let firing = false, lookDX = 0, moveX = 0, moveY = 0;
  window.addEventListener('keydown', (e) => {
    keys.add(e.code);
    if (e.code === 'Space') { firing = true; e.preventDefault(); }
  });
  window.addEventListener('keyup', (e) => { keys.delete(e.code); if (e.code === 'Space') firing = false; });
  const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  const touchUI = document.getElementById('touch'), stick = document.getElementById('stick'), knob = document.getElementById('knob'), fireBtn = document.getElementById('fire');
  if (isTouch) touchUI.hidden = false;
  let stickId = null, lookId = null, sx0 = 0, sy0 = 0, lastLX = 0;
  canvas.addEventListener('pointerdown', (e) => {
    if (state !== 'play') return;
    if (e.pointerType === 'mouse') {
      if (document.pointerLockElement !== canvas && canvas.requestPointerLock) { try { canvas.requestPointerLock(); } catch (_) {} }
      if (e.button === 0) firing = true;
      return;
    }
    if (e.clientX < W * 0.45 && stickId === null) {
      stickId = e.pointerId; sx0 = e.clientX; sy0 = e.clientY;
      stick.style.left = knob.style.left = sx0 + 'px'; stick.style.top = knob.style.top = sy0 + 'px';
      stick.style.opacity = knob.style.opacity = 1;
    } else if (lookId === null) { lookId = e.pointerId; lastLX = e.clientX; }
  });
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') { if (document.pointerLockElement === canvas) lookDX += e.movementX * 0.0032; return; }
    if (e.pointerId === stickId) {
      let dx = e.clientX - sx0, dy = e.clientY - sy0; const d = Math.hypot(dx, dy), m = 55;
      if (d > m) { dx *= m / d; dy *= m / d; }
      knob.style.left = sx0 + dx + 'px'; knob.style.top = sy0 + dy + 'px';
      moveX = dx / m; moveY = -dy / m;
    } else if (e.pointerId === lookId) { lookDX += (e.clientX - lastLX) * 0.008; lastLX = e.clientX; }
  });
  const endPointer = (e) => {
    if (e.pointerType === 'mouse') { if (e.button === 0) firing = false; return; }
    if (e.pointerId === stickId) { stickId = null; moveX = moveY = 0; stick.style.opacity = knob.style.opacity = 0; }
    if (e.pointerId === lookId) lookId = null;
  };
  window.addEventListener('pointerup', endPointer); window.addEventListener('pointercancel', endPointer);
  fireBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); firing = true; fireBtn.classList.add('on'); });
  const fireUp = () => { firing = false; fireBtn.classList.remove('on'); };
  fireBtn.addEventListener('pointerup', fireUp); fireBtn.addEventListener('pointercancel', fireUp); fireBtn.addEventListener('pointerleave', fireUp);

  // ---------- overlay ----------
  const overlay = document.getElementById('overlay'), goBtn = document.getElementById('go');
  const oTitle = document.getElementById('otitle'), oText = document.getElementById('otext');
  function showOverlay(title, text, btn) { oTitle.textContent = title; if (text !== null) oText.innerHTML = text; goBtn.textContent = btn; overlay.hidden = false; state = state === 'play' ? 'paused' : state; }
  goBtn.addEventListener('click', () => {
    if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) { ac = null; } }
    if (ac && ac.state === 'suspended') ac.resume();
    if (state === 'title' || state === 'win') { P.hp = 100; P.ammo = 40; loadLevel(0); }
    else if (state === 'dead') { P.hp = 100; P.ammo = Math.max(P.ammo, 25); loadLevel(level); }
    else if (state === 'clear') loadLevel(level + 1);
    overlay.hidden = true; state = 'play';
    if (!isTouch && canvas.requestPointerLock) { try { canvas.requestPointerLock(); } catch (_) {} }
  });
  document.addEventListener('pointerlockchange', () => {
    if (!document.pointerLockElement && state === 'play' && !isTouch) { firing = false; showOverlay('Pause', null, 'WEITER'); }
  });

  // ---------- update ----------
  function update(dt) {
    if (msgT > 0) { msgT -= dt; if (msgT <= 0) elMsg.style.opacity = 0; }
    P.hurt = Math.max(0, P.hurt - dt * 2); P.flash = Math.max(0, P.flash - dt * 9); P.heal = Math.max(0, P.heal - dt * 2);
    for (const e of ents) if (e.hit) e.hit = Math.max(0, e.hit - dt);
    if (state !== 'play') return;

    // turn & move
    let turn = lookDX; lookDX = 0;
    if (keys.has('ArrowLeft')) turn -= 2.6 * dt;
    if (keys.has('ArrowRight')) turn += 2.6 * dt;
    P.a = (P.a + turn + TAU) % TAU;
    let fwd = moveY, str = moveX;
    if (keys.has('KeyW') || keys.has('ArrowUp')) fwd += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) fwd -= 1;
    if (keys.has('KeyD')) str += 1;
    if (keys.has('KeyA')) str -= 1;
    const len = Math.hypot(fwd, str);
    if (len > 1) { fwd /= len; str /= len; }
    const sp = 3.2 * dt, ca = Math.cos(P.a), sa = Math.sin(P.a);
    tryMove(P, (ca * fwd - sa * str) * sp, (sa * fwd + ca * str) * sp, 0.24);
    P.bob += Math.min(1, Math.hypot(fwd, str)) * dt * 9;

    // shooting
    P.cd -= dt;
    if (firing && P.cd <= 0) {
      if (P.ammo <= 0) { if (P.cd < -0.5) { say('Keine Munition', 1); P.cd = 0.4; } }
      else {
        P.ammo--; P.cd = 0.24; P.flash = 1; sfx('shot');
        let best = null, bd = 1e9;
        const rx = -sa, ry = ca;
        for (const e of ents) {
          if (!(e.k === 'drone' || e.k === 'crawler') || e.hp <= 0) continue;
          const dx = e.x - P.x, dy = e.y - P.y, depth = dx * ca + dy * sa, lat = dx * rx + dy * ry;
          if (depth < 0.2 || depth > 24) continue;
          if (Math.abs(lat) > 0.42 + 0.035 * depth) continue;      // a little aim assist
          if (depth < bd && los(P.x, P.y, e.x, e.y)) { bd = depth; best = e; }
        }
        if (best) {
          best.hp--; best.hit = 0.12; best.alert = true;
          if (best.hp <= 0) { best.dieT = 0; kills++; sfx('boom'); if (kills === total) say('Ebene gesäubert – zum Ausgang', 2); }
        }
      }
    }

    // enemies
    for (const e of ents) {
      if (e.k !== 'drone' && e.k !== 'crawler') continue;
      if (e.hp <= 0) { e.dieT += dt; continue; }
      const dx = P.x - e.x, dy = P.y - e.y, d = Math.hypot(dx, dy);
      const sees = d < 11 && los(e.x, e.y, P.x, P.y);
      if (sees) e.alert = true;
      if (!e.alert) continue;
      const ux = dx / (d || 1), uy = dy / (d || 1);
      e.cd -= dt;
      if (e.k === 'crawler') {
        if (d > 0.65) tryMove(e, ux * 2.5 * dt, uy * 2.5 * dt, 0.22);
        else if (e.cd <= 0) { damage(11); e.cd = 0.9; }
      } else {
        const want = d > 4.5 ? 1 : d < 2.6 ? -1 : 0;
        const side = Math.sin(performance.now() / 900 + e.ph) * 0.6;
        tryMove(e, (ux * want - uy * side) * 1.4 * dt, (uy * want + ux * side) * 1.4 * dt, 0.28);
        if (sees && e.cd <= 0) {
          e.cd = 1.3 + Math.random() * 1.2;
          shots.push({ x: e.x + ux * 0.4, y: e.y + uy * 0.4, vx: ux * 5, vy: uy * 5, t: 0 });
          sfx('spit');
        }
      }
    }
    // fireballs
    for (const s of shots) {
      s.t += dt; s.x += s.vx * dt; s.y += s.vy * dt;
      if (wallAt(s.x, s.y) || s.t > 5) s.dead = true;
      else if (Math.hypot(s.x - P.x, s.y - P.y) < 0.35) { s.dead = true; damage(10); }
    }
    shots = shots.filter((s) => !s.dead);
    // pickups
    for (const e of ents) {
      if ((e.k === 'health' || e.k === 'ammo') && !e.gone && Math.hypot(e.x - P.x, e.y - P.y) < 0.5) {
        if (e.k === 'health') { if (P.hp >= 100) continue; P.hp = Math.min(100, P.hp + 25); say('+25 HP'); }
        else { P.ammo += 15; say('+15 Munition'); }
        e.gone = true; P.heal = 1; sfx('pick');
      }
    }
    // exit
    if (map[P.y | 0][P.x | 0] === 'X') {
      sfx('exit');
      if (level + 1 < LEVELS.length) { state = 'clear'; showOverlay(`${LEVELS[level].name} geschafft`, `Kills ${kills}/${total} · HP ${P.hp} · Munition ${P.ammo}`, 'NÄCHSTE EBENE'); }
      else { state = 'win'; showOverlay('Du bist draussen.', `Alle drei Ebenen geschafft. Kills auf der letzten Ebene: ${kills}/${total}.`, 'NOCHMAL'); }
      if (document.exitPointerLock) document.exitPointerLock();
    }
  }
  function damage(n) {
    P.hp -= n; P.hurt = 1; sfx('hurt');
    if (P.hp <= 0) {
      P.hp = 0; state = 'dead';
      if (document.exitPointerLock) document.exitPointerLock();
      showOverlay('Erwischt.', `${LEVELS[level].name} – nochmal von vorne.`, 'NOCHMAL');
    }
  }

  // ---------- render ----------
  const WALLC = { 1: [0.66, 0.32, 0.22], 2: [0.46, 0.53, 0.64], 3: [0.24, 0.50, 0.38] };
  function wallTex(t, u, v, mx, my) {        // returns [brightness, emissive]
    if (t === '1') {
      const row = Math.floor(v * 5), off = (row & 1) * 0.5;
      if ((v * 5) % 1 < 0.12 || (u * 2 + off) % 1 < 0.06) return [0.32, 0];
      return [0.78 + 0.22 * hash(row + mx * 7, Math.floor(u * 2 + off) + my * 3), 0];
    }
    if (t === '2') {
      if (u % 0.5 < 0.03 || v % 0.5 < 0.03) return [0.4, 0];
      const ru = u % 0.5, rv = v % 0.5;
      if ((ru < 0.09 || ru > 0.41) && (rv < 0.09 || rv > 0.41)) return [1.15, 0];
      return [0.72 + 0.25 * (1 - v), 0];
    }
    if (v > 0.44 && v < 0.5) return [1.0, 1];            // glowing tech strip
    if (u % 0.25 < 0.025) return [0.35, 0];
    return [0.6 + 0.2 * hash(Math.floor(v * 8) + mx, my), 0];
  }

  function put(i, b, r, g, bl, glow) {
    const gi = Math.max(1, Math.min(RAMP.length - 1, (b * (RAMP.length - 1) + 0.5) | 0));
    gch[i] = gi; cr[i] = r; cg[i] = g; cb[i] = bl; gl[i] = glow;
  }

  function drawSprite(sp, wx, wy, z0, hgt, wid, tint, glowAmt, dirx, diry, rx, ry, f, horizon) {
    const dx = wx - P.x, dy = wy - P.y;
    const depth = dx * dirx + dy * diry;
    if (depth < 0.15) return;
    const lat = dx * rx + dy * ry;
    const sxc = W / 2 + f * lat / depth;
    const hw = f * wid / 2 / depth;
    const yTop = horizon + f * (0.5 - (z0 + hgt)) / depth, yBot = horizon + f * (0.5 - z0) / depth;
    const c0 = Math.max(0, Math.floor((sxc - hw) / CW)), c1 = Math.min(COLS - 1, Math.floor((sxc + hw) / CW));
    const r0 = Math.max(0, Math.floor(yTop / CH)), r1 = Math.min(ROWS - 1, Math.floor(yBot / CH));
    const fog = Math.exp(-depth * 0.11);
    for (let c = c0; c <= c1; c++) {
      if (depth >= zcol[c]) continue;
      const u = ((c + 0.5) * CW - (sxc - hw)) / (2 * hw);
      if (u < 0 || u >= 1) continue;
      const px = Math.floor(u * sp.w);
      for (let r = r0; r <= r1; r++) {
        const v = ((r + 0.5) * CH - yTop) / (yBot - yTop);
        if (v < 0 || v >= 1) continue;
        const key = sp.px[Math.floor(v * sp.h)][px];
        if (key === '.') continue;
        const pc = PAL[key], em = pc[3] === 1;
        let b = (em ? 1 : 0.78 + 0.22 * (1 - v)) * Math.max(fog, em ? 0.7 : 0.35);
        let R = pc[0] * b, G = pc[1] * b, B = pc[2] * b;
        if (tint) { R += (tint[0] - R) * tint[3]; G += (tint[1] - G) * tint[3]; B += (tint[2] - B) * tint[3]; b = Math.max(b, tint[3]); }
        put(r * COLS + c, Math.min(1, b * 1.15 + (em ? 0.2 : 0.1)), R * 1.5, G * 1.5, B * 1.5, em ? glowAmt : 0);
      }
    }
  }

  function render(time) {
    gch.fill(0); gl.fill(0);
    const ca = Math.cos(P.a), sa = Math.sin(P.a), rx = -sa, ry = ca;
    const f = (W / 2) / TANH;
    const bobY = Math.sin(P.bob) * 4;
    const horizon = H / 2 + bobY;
    const flashL = P.flash * 0.35;
    // walls + floor + ceiling, column by column
    for (let c = 0; c < COLS; c++) {
      const camX = ((c + 0.5) * CW - W / 2) / (W / 2);
      const dx = ca + rx * TANH * camX, dy = sa + ry * TANH * camX;
      let mx = P.x | 0, my = P.y | 0;
      const ddx = Math.abs(1 / dx), ddy = Math.abs(1 / dy);
      const stx = dx < 0 ? -1 : 1, sty = dy < 0 ? -1 : 1;
      let sdx = dx < 0 ? (P.x - mx) * ddx : (mx + 1 - P.x) * ddx;
      let sdy = dy < 0 ? (P.y - my) * ddy : (my + 1 - P.y) * ddy;
      let side = 0, hit = '1', steps = 0;
      while (steps++ < 64) {
        if (sdx < sdy) { sdx += ddx; mx += stx; side = 0; } else { sdy += ddy; my += sty; side = 1; }
        const ch = map[my]?.[mx];
        if (ch === undefined || (ch >= '1' && ch <= '3')) { hit = ch || '1'; break; }
      }
      const perp = side === 0 ? sdx - ddx : sdy - ddy;
      zcol[c] = perp;
      let wx = side === 0 ? P.y + perp * dy : P.x + perp * dx;
      wx -= Math.floor(wx);
      if ((side === 0 && dx > 0) || (side === 1 && dy < 0)) wx = 1 - wx;
      const top = horizon - f * 0.5 / perp, bot = horizon + f * 0.5 / perp;
      const fog = Math.exp(-perp * 0.11);
      const base = WALLC[hit];
      const sideK = side ? 0.72 : 1;
      for (let r = 0; r < ROWS; r++) {
        const y = (r + 0.5) * CH, i = r * COLS + c;
        if (y >= top && y < bot) {
          const v = (y - top) / (bot - top);
          const [tb, em] = wallTex(hit, wx, v, mx, my);
          if (em) {
            const pulse = 0.8 + 0.2 * Math.sin(time * 3 + mx);
            put(i, 0.95, 0.35 * pulse, 1.0 * pulse, 0.6 * pulse, 0.8);
          } else {
            const b = tb * sideK * fog + flashL * fog;
            put(i, b, base[0] * b * 1.3, base[1] * b * 1.3, base[2] * b * 1.3, 0);
          }
        } else if (y >= bot) {                       // floor
          const rd = f * 0.5 / (y - horizon);
          const fx = P.x + dx * rd, fy = P.y + dy * rd;
          const fog2 = Math.exp(-rd * 0.13);
          const cell = map[fy | 0]?.[fx | 0];
          const gx = fx % 1, gy = fy % 1;
          const line = gx < 0.04 || gy < 0.04;
          if (cell === 'X') {
            const pulse = 0.6 + 0.4 * Math.sin(time * 4);
            put(i, 0.5 + 0.4 * pulse, 0.2, 0.9 * pulse + 0.1, 0.4, 0.6);
          } else {
            const b = (line ? 0.3 : 0.6 + 0.12 * hash(fx | 0, fy | 0)) * fog2 + flashL * fog2;
            put(i, b, 0.62 * b, 0.56 * b, 0.52 * b, 0);
          }
        } else {                                     // ceiling with lamps
          const rd = f * 0.5 / (horizon - y);
          const fx = P.x + dx * rd, fy = P.y + dy * rd;
          const fog2 = Math.exp(-rd * 0.15);
          const lamp = (Math.floor(fx) % 4 === 1) && (Math.floor(fy) % 4 === 1) && Math.hypot(fx % 1 - 0.5, fy % 1 - 0.5) < 0.22;
          if (lamp) put(i, 0.85 * Math.max(fog2, 0.4), 0.95, 0.85, 0.6, 0.5);
          else { const b = 0.26 * fog2; if (b > 0.03) put(i, b, 0.45 * b, 0.52 * b, 0.72 * b, 0); }
        }
      }
    }
    // sprites, far to near
    const list = [];
    for (const e of ents) if (!e.gone) list.push(e);
    for (const s of shots) list.push({ k: 'fire', x: s.x, y: s.y });
    list.sort((a, b) => ((b.x - P.x) ** 2 + (b.y - P.y) ** 2) - ((a.x - P.x) ** 2 + (a.y - P.y) ** 2));
    for (const e of list) {
      const hitT = e.hit > 0 ? [1, 1, 1, 0.85] : null;
      if (e.k === 'drone') {
        if (e.hp <= 0) { if (e.dieT < 0.35) drawSprite(SPR.drone, e.x, e.y, 0.35 * (1 - e.dieT / 0.35), 0.6 * (1 - e.dieT / 0.35) + 0.05, 0.6, [1, 0.5, 0.2, e.dieT / 0.35], 1, ca, sa, rx, ry, f, horizon); else drawSprite(SPR.corpse, e.x, e.y, 0, 0.12, 0.5, null, 0, ca, sa, rx, ry, f, horizon); }
        else drawSprite(SPR.drone, e.x, e.y, 0.38 + 0.06 * Math.sin(time * 2 + e.ph), 0.6, 0.6, hitT, 0.9, ca, sa, rx, ry, f, horizon);
      } else if (e.k === 'crawler') {
        if (e.hp <= 0) { if (e.dieT < 0.3) drawSprite(SPR.crawler, e.x, e.y, 0, 0.42 * (1 - e.dieT / 0.3) + 0.05, 0.7, [0.9, 0.2, 0.1, e.dieT / 0.3], 0.5, ca, sa, rx, ry, f, horizon); else drawSprite(SPR.corpse, e.x, e.y, 0, 0.12, 0.55, null, 0, ca, sa, rx, ry, f, horizon); }
        else { const sq = 1 + 0.08 * Math.sin(time * 14 + e.ph); drawSprite(SPR.crawler, e.x, e.y, 0, 0.42 * sq, 0.7 / sq, hitT, 0.6, ca, sa, rx, ry, f, horizon); }
      } else if (e.k === 'fire') drawSprite(SPR.fire, e.x, e.y, 0.38, 0.22, 0.22, null, 1.4, ca, sa, rx, ry, f, horizon);
      else if (e.k === 'health') drawSprite(SPR.health, e.x, e.y, 0, 0.28, 0.32, null, 0, ca, sa, rx, ry, f, horizon);
      else if (e.k === 'ammo') drawSprite(SPR.ammo, e.x, e.y, 0, 0.2, 0.32, null, 0, ca, sa, rx, ry, f, horizon);
    }
    // weapon
    const gw = Math.min(W * 0.3, H * 0.5), gh = gw * SPR.gun.h / SPR.gun.w * 1.25;
    const gx = W / 2 - gw / 2 + Math.cos(P.bob * 0.5) * 8, gy = H - gh + 10 + Math.abs(Math.sin(P.bob * 0.5)) * 8 + P.flash * 10;
    overlaySprite(SPR.gun, gx, gy, gw, gh, 0.15 + flashL);
    if (P.flash > 0.3) overlaySprite(SPR.flash, W / 2 - gw * 0.22, gy - gw * 0.2, gw * 0.44, gw * 0.24, 0.6);
    // crosshair
    const cc = Math.floor(W / 2 / CW), crr = Math.floor(H / 2 / CH);
    gch[crr * COLS + cc] = RAMP.indexOf('+'); cr[crr * COLS + cc] = 0.95; cg[crr * COLS + cc] = 0.43; cb[crr * COLS + cc] = 0.5;
    // screen tints
    if (P.hurt > 0 || P.heal > 0) {
      const k = P.hurt * 0.55, h = P.heal * 0.25;
      for (let i = 0; i < gch.length; i++) { cr[i] += (1 - cr[i]) * k; cg[i] = cg[i] * (1 - k) + h * 0.6; cb[i] *= 1 - k; }
    }
  }

  function overlaySprite(sp, x0, y0, w, h, light) {
    const c0 = Math.max(0, Math.floor(x0 / CW)), c1 = Math.min(COLS - 1, Math.floor((x0 + w) / CW));
    const r0 = Math.max(0, Math.floor(y0 / CH)), r1 = Math.min(ROWS - 1, Math.floor((y0 + h) / CH));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const u = ((c + 0.5) * CW - x0) / w, v = ((r + 0.5) * CH - y0) / h;
      if (u < 0 || u >= 1 || v < 0 || v >= 1) continue;
      const key = sp.px[Math.floor(v * sp.h)][Math.floor(u * sp.w)];
      if (key === '.') continue;
      const pc = PAL[key], em = pc[3] === 1;
      const b = em ? 1 : Math.min(1, 0.45 + 0.4 * (1 - v) + light);
      put(r * COLS + c, b, pc[0] * (em ? 1 : b * 1.3), pc[1] * (em ? 1 : b * 1.3), pc[2] * (em ? 1 : b * 1.3), em ? 1.2 : 0);
    }
  }

  function present() {
    const cd = colImg.data, gd = glowImg.data;
    for (let i = 0; i < gch.length; i++) {
      const o = i * 4;
      if (!gch[i]) { cd[o + 3] = 0; gd[o] = gd[o + 1] = gd[o + 2] = 0; gd[o + 3] = 255; continue; }
      cd[o] = Math.min(255, cr[i] * 255); cd[o + 1] = Math.min(255, cg[i] * 255); cd[o + 2] = Math.min(255, cb[i] * 255); cd[o + 3] = 255;
      const g = gl[i] * 255;
      gd[o] = Math.min(255, cr[i] * g); gd[o + 1] = Math.min(255, cg[i] * g); gd[o + 2] = Math.min(255, cb[i] * g); gd[o + 3] = 255;
    }
    // glyph mask, one fillText per row
    mctx.setTransform(1, 0, 0, 1, 0, 0);
    mctx.globalCompositeOperation = 'source-over';
    mctx.clearRect(0, 0, mask.width, mask.height);
    mctx.font = FONT; mctx.fillStyle = '#fff'; mctx.textBaseline = 'middle';
    const row = new Array(COLS);
    for (let r = 0, i = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++, i++) row[c] = RAMP[gch[i]];
      mctx.fillText(row.join(''), 0, (r + 0.5) * CH * DPR + 0.5);
    }
    colctx.putImageData(colImg, 0, 0);
    mctx.globalCompositeOperation = 'source-in';
    mctx.imageSmoothingEnabled = false;
    mctx.drawImage(colc, 0, 0, COLS * CW * DPR, ROWS * CH * DPR);
    // compose: background, glow, letters
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.fillStyle = '#05070d'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    gctx.putImageData(glowImg, 0, 0);
    hctx.clearRect(0, 0, halfc.width, halfc.height); hctx.imageSmoothingEnabled = true; hctx.drawImage(glowc, 0, 0, halfc.width, halfc.height);
    ctx.imageSmoothingEnabled = true; ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.45; ctx.drawImage(glowc, 0, 0, COLS * CW * DPR, ROWS * CH * DPR);
    ctx.globalAlpha = 0.6; ctx.drawImage(halfc, 0, 0, COLS * CW * DPR, ROWS * CH * DPR);
    ctx.globalAlpha = 1; ctx.drawImage(mask, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
  }

  // ---------- hud ----------
  const elHp = document.getElementById('hp'), elAmmo = document.getElementById('ammo'), elK = document.getElementById('kills'), elL = document.getElementById('lvl');
  function hud() {
    elHp.textContent = Math.max(0, Math.ceil(P.hp));
    elHp.parentElement.classList.toggle('low', P.hp <= 30);
    elAmmo.textContent = P.ammo; elK.textContent = `${kills}/${total}`; elL.textContent = LEVELS[level].name;
  }

  // ---------- loop ----------
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    update(dt);
    render(now / 1000);
    present();
    hud();
  }
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => {
    resize();
    loadLevel(0); msgT = 0; elMsg.style.opacity = 0;
    P.a = 0.35;
    requestAnimationFrame(frame);
  });
  window.__gruft = { P, get ents() { return ents; }, render, present, timing: () => {
    const t0 = performance.now(); render(t0 / 1000); const t1 = performance.now(); present(); const t2 = performance.now();
    return { render: t1 - t0, present: t2 - t1, cols: COLS, rows: ROWS };
  } };
  // attract mode behind the title: slowly look around
  setInterval(() => { if (state === 'title') P.a += 0.01; }, 30);
})();
