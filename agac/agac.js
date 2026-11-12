/* agac.js – browser port of agac.py: a spinning 3D christmas tree drawn in letters,
   with the source being typed underneath. Timeline mirrors the original reel (20 s). */
(() => {
  'use strict';

  // ---------- grid & camera ----------
  const COLS = 154, ROWS = 107, CW = 7.0, CH = 10.75;
  const GX = (1080 - COLS * CW) / 2, GY = 0;
  const CX = 540, CY = 630, FOC = 1853;           // projection centre / focal length (stage px)
  const CAM = [0, 2.16, 5.7], LOOK = [0, 1.41, 0];
  const SPIN = 18 * Math.PI / 180;                 // rad per second
  const TAU = Math.PI * 2;
  const Y0 = 0.42, Y1 = 2.55;
 const XS = 1.0;
  const DENS = 0.5;                                // particle density vs. the python version
  const NEEDLE = 0, TRUNK = 1, BALL = 2, LIGHT = 3, GARLAND = 4, GIFT = 5, RIBBON = 6, SNOWCAP = 7;

  const norm3 = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const F = norm3([LOOK[0] - CAM[0], LOOK[1] - CAM[1], LOOK[2] - CAM[2]]);
  const U = [0, -F[2], F[1]];                      // up (right = +x)
  const LGT = norm3([-0.5, 0.6, 0.65]);
  const HV = norm3([LGT[0] - F[0], LGT[1] - F[1], LGT[2] - F[2]]); // blinn half vector

  // ---------- seeded rng ----------
  function RNG(seed) {
    let s = seed >>> 0, spare = null;
    const random = () => {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const normal = () => {
      if (spare !== null) { const v = spare; spare = null; return v; }
      let u = 0, v = 0; while (u === 0) u = random(); v = random();
      const m = Math.sqrt(-2 * Math.log(u));
      spare = m * Math.sin(TAU * v);
      return m * Math.cos(TAU * v);
    };
    return { random, normal, uniform: (a, b) => a + (b - a) * random() };
  }

  const envelope = (y) => {
    const f = Math.min(1, Math.max(0, (y - Y0) / (Y1 - Y0)));
    return 0.03 + 0.84 * Math.pow(1 - f, 1.08);
  };

  // ---------- particles ----------
  const P = { x: [], y: [], z: [], nx: [], ny: [], nz: [], r: [], g: [], b: [], k: [], t0: [], ph: [], sh: [] };
  function add(x, y, z, n, c, k, t0, ph = 0, sh = 0) {
    const nn = norm3(n);
    P.x.push(x); P.y.push(y); P.z.push(z);
    P.nx.push(nn[0]); P.ny.push(nn[1]); P.nz.push(nn[2]);
    P.r.push(c[0]); P.g.push(c[1]); P.b.push(c[2]);
    P.k.push(k); P.t0.push(t0); P.ph.push(ph); P.sh.push(sh);
  }

  function fib(n) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const y = 1 - 2 * (i + 0.5) / n, r = Math.sqrt(1 - y * y), th = Math.PI * (3 - Math.sqrt(5)) * (i + 0.5);
      out.push([r * Math.cos(th), y, r * Math.sin(th)]);
    }
    return out;
  }

  const tips = [];
  function build() {
    const rng = RNG(7);
    // needles
    for (let i = 0; i < 24; i++) {
      const y = (Y0 + 0.02) + (Y1 - 0.04 - Y0 - 0.02) * i / 23;
      const R = envelope(y), f = (y - Y0) / (Y1 - Y0);
      const nb = Math.floor(7 + 11 * (1 - f));
      for (let b = 0; b < nb; b++) {
        const a = TAU * b / nb + i * 0.618 * TAU + rng.normal() * 0.12;
        const L = R * rng.uniform(0.82, 1.06);
        const n = Math.floor((250 + 1400 * L) * DENS);
        const dx = Math.cos(a), dz = Math.sin(a), sx = -dz, sz = dx;
        for (let j = 0; j < n; j++) {
          const s = Math.pow(rng.random(), 0.65);
          const spread = (0.035 + 0.11 * s) * rng.normal();
          const yy = y + 0.07 * s * L - 0.22 * (s * L) ** 2 + 0.03 * rng.normal();
          const px = dx * s * L + sx * spread, pz = dz * s * L + sz * spread;
          const nrm = norm3([dx * 0.75 + rng.normal() * 0.35, 0.55 + rng.normal() * 0.35, dz * 0.75 + rng.normal() * 0.35]);
          const ao = 0.35 + 0.65 * Math.pow(s, 1.3);
          const tone = ao * rng.uniform(0.75, 1.1);
          const s3 = s * s * s * tone;
          const t0 = 1.1 + 3.7 * f + 0.45 * s;           // reel timing (grows a bit faster than agac.py)
          if (s > 0.45 && rng.random() < 0.09 * s / DENS && nrm[1] > 0.5) {
            add(px, yy, pz, [0, 1, 0], [0.92, 0.95, 1.0], SNOWCAP, t0);
          } else {
            add(px, yy, pz, nrm, [(0.07 + 0.30 * s3) * ao, (0.30 + 0.42 * s3) * ao, (0.13 + 0.10 * s3) * ao], NEEDLE, t0);
          }
        }
        tips.push([dx * L * 0.93, y + 0.07 * L - 0.22 * L * L, dz * L * 0.93]);
      }
    }
    // trunk
    for (let hi = 0; hi < 50; hi++) for (let ai = 0; ai < 90; ai++) {
      if ((hi * 90 + ai) % 2) continue;
      const h = -0.05 + 0.65 * hi / 49, a = TAU * ai / 89;
      const bark = 0.75 + 0.25 * Math.sin(h * 90 + a * 3);
      add(0.085 * Math.cos(a), h, 0.085 * Math.sin(a), [Math.cos(a), 0, Math.sin(a)],
        [0.42 * bark, 0.26 * bark, 0.14 * bark], TRUNK, 0.6 + 0.6 * h);
    }
    // garland
    const NU = 2600;
    for (let k = 0; k < 5; k++) for (let i = 0; i < NU; i++) {
      if (i % 4) continue;
      const u = i / (NU - 1);
      const yg = Y0 + 0.15 + (Y1 - Y0 - 0.45) * u;
      const ag = TAU * 3.6 * u + 0.9;
      const swag = -0.06 * Math.abs(Math.sin(ag * 2.5));
      const rg = envelope(yg) + 0.02;
      const ox = rng.normal() * 0.018, oy = rng.normal() * 0.018, oz = rng.normal() * 0.018;
      const bx = rg * Math.cos(ag), bz = rg * Math.sin(ag);
      const gm = rng.uniform(0.7, 1.15);
      add(bx + ox, yg + swag + oy, bz + oz, [bx + ox, 0, bz + oz], [1.0 * gm, 0.74 * gm, 0.26 * gm], GARLAND, 5.0 + 2.2 * u, rng.random() * TAU, 0.8);
    }
    // baubles
    const idx = tips.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rng.random() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    for (let q = 0; q < 46; q++) {
      const tp = tips[idx[q]];
      const c = [tp[0], tp[1] - 0.06, tp[2]];
      const r = rng.uniform(0.065, 0.09);
      const col = rng.random() < 0.6 ? [0.95, 0.10, 0.08] : [1.0, 0.72, 0.22];
      const f = (c[1] - Y0) / (Y1 - Y0);
      const t0 = 6.3 + 2.2 * f + rng.random() * 0.3;
      for (const s of fib(Math.floor(900 * r / 0.07 * DENS))) add(c[0] + s[0] * r, c[1] + s[1] * r, c[2] + s[2] * r, s, col, BALL, t0, 0, 1);
    }
    // lights
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rng.random() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    for (let q = 0; q < Math.min(170, idx.length); q++) {
      const tp = tips[idx[q]];
      const c = [tp[0] * 0.97, tp[1] * 0.97 + 0.02, tp[2] * 0.97];
      const f = (c[1] - Y0) / (Y1 - Y0);
      add(c[0], c[1], c[2], [c[0], 0.2, c[2]], [1.0, 0.82, 0.45], LIGHT, 7.55 + 1.5 * f, rng.random() * TAU, 1);
    }
    // gifts
    const boxes = [
      [-0.84, 0.40, 0.20, 0.15, 0.18, [0.85, 0.08, 0.07], [1.0, 0.78, 0.25], 6.6],
      [0.86, 0.36, 0.18, 0.13, 0.17, [0.12, 0.22, 0.80], [0.92, 0.95, 1.0], 7.4],
      [0.22, 0.90, 0.24, 0.14, 0.20, [0.82, 0.10, 0.08], [1.0, 0.80, 0.30], 9.4],
      [-0.40, -0.86, 0.19, 0.17, 0.19, [0.95, 0.68, 0.18], [0.85, 0.08, 0.07], 10.4],
      [0.76, -0.58, 0.15, 0.11, 0.15, [0.92, 0.92, 0.95], [0.90, 0.10, 0.10], 11.2],
      [-0.92, -0.20, 0.12, 0.20, 0.12, [0.10, 0.45, 0.20], [1.0, 0.78, 0.25], 12.6],
    ];
    const FN = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]];
    for (const [x, z, w, h, d, bc, rc, t0] of boxes) {
      for (let i = 0; i < 2600 * DENS * 1.4; i++) {
        const face = Math.floor(rng.random() * 5), u = rng.random() - 0.5, v = rng.random() - 0.5;
        const N = FN[face];
        let p;
        if (face < 2) p = [0.5 * N[0] * w, v * h, u * d];
        else if (face < 4) p = [u * w, v * h, 0.5 * N[2] * d];
        else p = [u * w, 0.5 * h, v * d];
        const rib = Math.abs(p[0]) < w * 0.09 || Math.abs(p[2]) < d * 0.09;
        const py = p[1] + h / 2;
        if (rib) add(p[0] + x, py, p[2] + z, N, rc, RIBBON, t0 + 0.3, 0, 0.6);
        else add(p[0] + x, py, p[2] + z, N, bc, GIFT, t0 + 0.4 * py);
      }
    }
    // snow piled at the foot of the trunk
    for (let i = 0; i < 9000 * DENS * 0.6; i++) {
      const r = Math.sqrt(rng.random()) * 0.62, a = rng.random() * TAU;
      const y = 0.06 * Math.exp(-((r / 0.7) ** 2)) * rng.random();
      add(r * Math.cos(a), y, r * Math.sin(a), [0, 1, 0], [0.88, 0.88, 0.84], SNOWCAP, 6.0 + 0.3 * r);
    }
    // pack
    for (const key of Object.keys(P)) P[key] = (key === 'k') ? Uint8Array.from(P[key]) : Float32Array.from(P[key]);
  }
  build();
  const NP = P.x.length;
  let NLIGHTS = 0; for (let i = 0; i < NP; i++) if (P.k[i] === LIGHT) NLIGHTS++;

  // ---------- sky & snow ----------
  const srng = RNG(99);
  const STARS = [];
  for (let i = 0; i < 450; i++) {
    const r = srng.random();
    STARS.push({ c: Math.floor(srng.random() * COLS), r: Math.floor(srng.random() * ROWS), b: 0.4 + 0.6 * srng.random(), ch: r < 0.86 ? '.' : r < 0.95 ? '+' : '*', ph: srng.random() * TAU, sp: 0.5 + 2 * srng.random() });
  }
  const FLAKES = [];
  for (let i = 0; i < 240; i++) FLAKES.push({ x: srng.uniform(-3.5, 3.5), y: srng.uniform(-0.2, 4.4), z: srng.uniform(-2.6, 2.9), v: srng.uniform(0.18, 0.42), ph: srng.random() * TAU });

  // ---------- glyphs ----------
  const GLYPHS = " .:-=+*#%@o|~/\\'`,_O0";
  const GLYPH = [...GLYPHS];
  const GI = {}; GLYPH.forEach((g, i) => { GI[g] = i; });
  const FONT_FAMILY = '"JetBrains Mono", ui-monospace, Menlo, Consolas, monospace';
  let FONT = `700 11.667px ${FONT_FAMILY}`;
  function fitFont(c) {                         // whole rows are drawn with one fillText: advance must equal CW
    c.font = `700 100px ${FONT_FAMILY}`;
    const adv = c.measureText('%%%%%%%%%%').width / 10;
    FONT = `700 ${(100 * CW / adv).toFixed(3)}px ${FONT_FAMILY}`;
  }

  const RAMP = {
    [NEEDLE]: " .:-=+*%%", [TRUNK]: " .:|#%%", [BALL]: " .:o*%#@@", [LIGHT]: " .o*@@",
    [GARLAND]: " .-~*o@", [GIFT]: " .-=+#%%", [RIBBON]: " .-=+#%%", [SNOWCAP]: " .:*%%%",
  };
  const RAMPI = {}; for (const k in RAMP) RAMPI[k] = [...RAMP[k]].map((g) => GI[g]);
  const GLOW = { [NEEDLE]: 0.16, [TRUNK]: 0.02, [BALL]: 0.45, [LIGHT]: 0.55, [GARLAND]: 0.3, [GIFT]: 0.1, [RIBBON]: 0.12, [SNOWCAP]: 0.04 };

  // ---------- buffers ----------
  const NC = COLS * ROWS;
  const zbuf = new Float32Array(NC), gidx = new Uint8Array(NC);
  const cr = new Float32Array(NC), cg = new Float32Array(NC), cb = new Float32Array(NC), glow = new Float32Array(NC);
  const canvas = document.getElementById('ascii');
  const ctx = canvas.getContext('2d');
  const mask = document.createElement('canvas'); mask.width = canvas.width; mask.height = canvas.height;
  const mctx = mask.getContext('2d');
  const colc = document.createElement('canvas'); colc.width = COLS; colc.height = ROWS;
  const colctx = colc.getContext('2d');
  const colImg = colctx.createImageData(COLS, ROWS);
  const bloomc = document.createElement('canvas'); bloomc.width = COLS; bloomc.height = ROWS;
  const bctx = bloomc.getContext('2d');
  const bImg = bctx.createImageData(COLS, ROWS);
  const half = document.createElement('canvas'); half.width = COLS >> 1; half.height = ROWS >> 1;
  const hctx = half.getContext('2d');
  const quarter = document.createElement('canvas'); quarter.width = COLS >> 2; quarter.height = ROWS >> 2;
  const qctx = quarter.getContext('2d');

  function put(i, z, g, r, gg, b, gl) {
    zbuf[i] = z; gidx[i] = g; cr[i] = r; cg[i] = gg; cb[i] = b; glow[i] = gl;
  }
  const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
  const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };

  // ---------- frame ----------
  function renderScene(t) {
    zbuf.fill(1e9); gidx.fill(0); glow.fill(0);
    const th = SPIN * t, cs = Math.cos(th), sn = Math.sin(th);

    // stars
    for (const s of STARS) {
      const b = s.b * (0.65 + 0.35 * Math.sin(t * s.sp + s.ph));
      const i = s.r * COLS + s.c;
      put(i, 1e8, GI[s.ch], 0.78 * b, 0.82 * b, 0.95 * b, 0.0);
    }

    // ground plane (ray cast per cell), rotates with the tree like a turntable
    const lightsOn = clamp01((t - 7.6) / 1.5);
    for (let row = 0; row < ROWS; row++) {
      const sy = GY + (row + 0.5) * CH;
      const vy = -(sy - CY) / FOC;                 // camera-space dir (x, vy, 1)
      const dyw = vy * U[1] + F[1];                // world y component of the ray
      if (dyw >= -1e-4) continue;
      const tt = -CAM[1] / dyw;                    // ray parameter == camera depth
      const dzw = vy * U[2] + F[2];
      const wz = CAM[2] + dzw * tt;
      const fade = clamp01((ROWS - 1 - row) / 8);
      for (let c = 0; c < COLS; c++) {
        const sx = GX + (c + 0.5) * CW;
        const wx = ((sx - CX) / FOC) * tt;
        const r = Math.hypot(wx, wz);
        if (r > 3.75) continue;
        // disc (r < 3.6) sweeps out in 0.5 s with a white rim, the far plane follows
        const born = 0.05 + r / 8;
        if (t < born) continue;
        const age = clamp01((t - born) / 0.35);
        const lx = wx * cs - wz * sn, lz = wx * sn + wz * cs;      // turntable coords
        const n = hash(Math.floor(lx * 9), Math.floor(lz * 9));
        const n2 = hash(Math.floor(lx * 2.2) + 17, Math.floor(lz * 2.2) + 3);
        let I = (0.32 + 0.5 * clamp01((3.3 - r) / 1.2)) * clamp01((3.75 - r) / 0.35) * (row & 1 ? 0.62 : 1);
        I *= 0.8 + 0.25 * n + 0.2 * (n2 - 0.5);
        const warm = lightsOn * 0.35 * Math.exp(-(r * r) / 1.2);
        let rr = 0.6 * I + warm * 0.9, gg = 0.63 * I + warm * 0.7, bb = 0.72 * I + warm * 0.35;
        const fl = 1 - age;
        rr += (1 - rr) * fl; gg += (1 - gg) * fl; bb += (1 - bb) * fl;
        const v = clamp01(I + warm + fl);
        const g = v < 0.22 ? (n < 0.5 ? GI['.'] : GI['-']) : v < 0.42 ? GI['-'] : v < 0.6 ? (n < 0.6 ? GI['='] : GI['-']) : (n < 0.5 ? GI['+'] : GI['=']);
        put(row * COLS + c, tt, g, rr * fade, gg * fade, bb * fade, fl * 0.25);
      }
    }

    // particles
    let letters = 0, lightsLit = 0;
    const PX = P.x, PY = P.y, PZ = P.z, NX = P.nx, NY = P.ny, NZ = P.nz, K = P.k, T0 = P.t0;
    for (let i = 0; i < NP; i++) {
      const age = t - T0[i];
      if (age < 0) continue;
      const k = K[i];
      if (k === LIGHT) lightsLit++;
      const x = (PX[i] * cs + PZ[i] * sn) * XS, z = (-PX[i] * sn + PZ[i] * cs) * XS, y = PY[i];
      const rx = x - CAM[0], ry = y - CAM[1], rz = z - CAM[2];
      const zc = ry * F[1] + rz * F[2];
      if (zc < 0.2) continue;
      const yc = ry * U[1] + rz * U[2];
      const sx = CX + FOC * rx / zc, sy = CY - FOC * yc / zc;
      const col = ((sx - GX) / CW) | 0, row = ((sy - GY) / CH) | 0;
      if (col < 0 || col >= COLS || row < 0 || row >= ROWS || sx < GX || sy < GY) continue;
      const ci = row * COLS + col;
      const zb = k === LIGHT ? zc - 0.06 : zc;
      if (zb >= zbuf[ci]) continue;
      // shading
      const nx = NX[i] * cs + NZ[i] * sn, nz = -NX[i] * sn + NZ[i] * cs, ny = NY[i];
      const ndl = nx * LGT[0] + ny * LGT[1] + nz * LGT[2];
      const wrap = clamp01(ndl * 0.5 + 0.5);
      let r = P.r[i], g = P.g[i], b = P.b[i], v, gl = GLOW[k];
      if (k === NEEDLE) {
        const sh = 0.12 + 1.0 * Math.pow(wrap, 1.8);
        r *= 0.75 * sh; g *= 1.05 * sh; b *= 1.45 * sh;
        v = sh * (0.2 + 1.45 * P.g[i]);
        const tw = lightsOn * 0.18 * Math.max(0, Math.sin(t * 2.3 + i * 0.37)) ** 8;
        r += tw; g += tw * 0.8;
      } else if (k === LIGHT) {
        const tw = 0.6 + 0.4 * Math.sin(t * 3 + P.ph[i]);
        r *= 0.75 + 0.45 * tw; g *= 0.75 + 0.45 * tw; b *= 0.75 + 0.45 * tw;
        v = 0.55 + 0.45 * tw; gl *= tw;
      } else if (k === BALL || k === RIBBON || k === GARLAND) {
        const nh = Math.max(0, nx * HV[0] + ny * HV[1] + nz * HV[2]);
        let spec = Math.pow(nh, k === BALL ? 28 : 16) * P.sh[i] * (k === BALL ? 1 : 0.35);
        if (k === GARLAND) spec += 0.45 * Math.max(0, Math.sin(t * 5 + P.ph[i])) ** 12;
        const d = k === GARLAND ? 0.22 + 0.6 * wrap : 0.25 + 0.95 * wrap;
        r = r * d + spec; g = g * d + spec * 0.95; b = b * d + spec * 0.85;
        v = Math.min(1, d * 0.75 + spec);
        gl *= 0.5 + spec;
      } else if (k === SNOWCAP) {
        const d = PY[i] < 0.1 ? 0.3 + 0.3 * wrap : 0.5 + 0.6 * wrap;
        r *= d; g *= d; b *= d; v = d * 0.95;
        if (PY[i] < 0.1) { r += 0.16 * lightsOn; g += 0.08 * lightsOn; b -= 0.04 * lightsOn; }
      } else {
        const d = 0.3 + 0.9 * wrap;
        r *= d * 1.1; g *= d * 1.1; b *= d * 1.1; v = d * 0.85;
      }
      // birth flash
      if (age < 0.45 && !(k === SNOWCAP && PY[i] < 0.1)) {   // the snow pile just fades in
        const f = 1 - age / 0.45, f2 = f * f;
        r += (1 - r) * f2; g += (1 - g) * f2; b += (1 - b) * f2; v += (1 - v) * f2; gl += f2 * 0.3;
      }
      const ramp = RAMPI[k];
      const gi = ramp[Math.max(1, Math.min(ramp.length - 1, (v * (ramp.length - 1) + 0.5) | 0))];
      if (k === SNOWCAP && PY[i] < 0.1 && age < 1) { const f = age; r *= f; g *= f; b *= f; }
      put(ci, zb, gi, r, g, b, gl);
      if (k === LIGHT) {                         // a bulb spills onto its neighbours: "o.o"
        if (col > 0 && zb - 0.02 < zbuf[ci - 1]) put(ci - 1, zb - 0.02, v > 0.7 ? GI['o'] : GI['.'], r * 0.8, g * 0.75, b * 0.6, gl * 0.4);
        if (col < COLS - 1 && zb - 0.02 < zbuf[ci + 1]) put(ci + 1, zb - 0.02, GI['.'], r * 0.7, g * 0.65, b * 0.5, gl * 0.3);
      }
    }

    // star on top + rays
    const STAR_T = 9.4;
    if (t >= STAR_T) {
      const age = t - STAR_T;
      const ry = Y1 + 0.12 - CAM[1], rz = -CAM[2];
      const zc = ry * F[1] + rz * F[2], yc = ry * U[1] + rz * U[2];
      const scx = CX, scy = CY - FOC * yc / zc;
      const grow = clamp01(age / 0.5);
      const fl = (1 - grow) ** 2;
      const pulse = 0.85 + 0.15 * Math.sin(t * 2.2);
      const rays = [
        [-90, 118, '|'], [-66, 100, '/'], [-114, 100, '\\'], [0, 92, '-'], [180, 92, '-'],
        [-45, 42, '/'], [-135, 42, '\\'], [60, 30, '\\'], [120, 30, '/'], [90, 26, '|'],
      ];
      for (const [deg, len, ch] of rays) {
        const a = deg * Math.PI / 180, L = len * grow * pulse;
        const step = ch === '-' ? CW * 1.6 : 4;
        for (let d = 20; d < L; d += step) {
          const px = scx + Math.cos(a) * d, py = scy + Math.sin(a) * d;
          const c = ((px - GX) / CW) | 0, rw = ((py - GY) / CH) | 0;
          if (c < 0 || c >= COLS || rw < 0 || rw >= ROWS) continue;
          const ci = rw * COLS + c;
          const w = 1 - d / (L + 1);
          put(ci, zc - 0.5, GI[ch], 0.9 * w + 0.25, 0.75 * w + 0.2, 0.42 * w + 0.08, 0.15 * w);
        }
      }
      // filled five-point star, billboarded
      const R = 0.085 * FOC / zc * (0.6 + 0.4 * grow), Ri = R * 0.48;
      const c0 = Math.max(0, ((scx - R - GX) / CW) | 0), c1 = Math.min(COLS - 1, ((scx + R - GX) / CW) | 0);
      const r0 = Math.max(0, ((scy - R - GY) / CH) | 0), r1 = Math.min(ROWS - 1, ((scy + R - GY) / CH) | 0);
      for (let rw = r0; rw <= r1; rw++) for (let c = c0; c <= c1; c++) {
        const dx = GX + (c + 0.5) * CW - scx, dy = GY + (rw + 0.5) * CH - scy;
        const rr = Math.hypot(dx, dy);
        let a = Math.atan2(dx, -dy); if (a < 0) a += TAU;
        const seg = TAU / 10, m = (a % (2 * seg)) / seg;          // 0..2 between tips
        const lim = m < 1 ? R + (Ri - R) * m : Ri + (R - Ri) * (m - 1);
        if (rr > lim * 1.05) continue;
        const core = 1 - rr / (R + 1);
        const g = core > 0.55 ? GI['@'] : core > 0.3 ? GI['#'] : GI['%'];
        let r = 1.0, gg = 0.86 + 0.1 * core, b = 0.35 + 0.35 * core;
        r += (1 - r) * fl; gg += (1 - gg) * fl; b += (1 - b) * fl;
        put(rw * COLS + c, zc - 0.6, g, r, gg, b, 0.45);
      }
    }

    // falling snow (world space, does not spin)
    for (const f of FLAKES) {
      let y = f.y - f.v * t; y = ((y + 0.2) % 4.6 + 4.6) % 4.6 - 0.2;
      const x = f.x + 0.12 * Math.sin(t * 0.9 + f.ph), z = f.z;
      const rx = x - CAM[0], ry = y - CAM[1], rz = z - CAM[2];
      const zc = ry * F[1] + rz * F[2];
      if (zc < 0.4) continue;
      const yc = ry * U[1] + rz * U[2];
      const sx = CX + FOC * rx / zc, sy = CY - FOC * yc / zc;
      const c = ((sx - GX) / CW) | 0, rw = ((sy - GY) / CH) | 0;
      if (c < 0 || c >= COLS || rw < 0 || rw >= ROWS) continue;
      const ci = rw * COLS + c;
      if (zc >= zbuf[ci]) continue;
      const near = zc < 2.6;
      const b = near ? 0.95 : 0.7;
      put(ci, zc, near ? GI['*'] : GI['.'], 0.9 * b, 0.93 * b, 1.0 * b, 0.05);
    }

    // count letters & pack colours
    const cd = colImg.data, bd = bImg.data;
    for (let i = 0; i < NC; i++) {
      const o = i * 4;
      if (gidx[i] === 0) { cd[o + 3] = 0; bd[o] = bd[o + 1] = bd[o + 2] = 0; bd[o + 3] = 255; continue; }
      letters++;
      cd[o] = Math.min(255, cr[i] * 255); cd[o + 1] = Math.min(255, cg[i] * 255); cd[o + 2] = Math.min(255, cb[i] * 255); cd[o + 3] = 255;
      const gl = glow[i] * 255;
      bd[o] = Math.min(255, cr[i] * gl); bd[o + 1] = Math.min(255, cg[i] * gl); bd[o + 2] = Math.min(255, cb[i] * gl); bd[o + 3] = 255;
    }
    return { letters, lightsLit };
  }

  const SKY = ctx.createLinearGradient(0, 0, 0, canvas.height);
  SKY.addColorStop(0, '#070c19'); SKY.addColorStop(0.86, '#060a12'); SKY.addColorStop(1, '#06070e');
  function draw() {
    // glyph mask: one fillText per row
    mctx.globalCompositeOperation = 'source-over';
    mctx.clearRect(0, 0, mask.width, mask.height);
    mctx.font = FONT; mctx.fillStyle = '#fff'; mctx.textBaseline = 'middle'; mctx.textAlign = 'left';
    const rowChars = new Array(COLS);
    for (let row = 0, i = 0; row < ROWS; row++) {
      let any = false;
      for (let c = 0; c < COLS; c++, i++) { const g = gidx[i]; rowChars[c] = GLYPH[g]; if (g) any = true; }
      if (any) mctx.fillText(rowChars.join(''), GX, GY + row * CH + CH / 2 + 0.5);
    }
    // tint by per-cell colour
    colctx.putImageData(colImg, 0, 0);
    mctx.globalCompositeOperation = 'source-in';
    mctx.imageSmoothingEnabled = false;
    mctx.drawImage(colc, GX, GY, COLS * CW, ROWS * CH);
    // compose
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = SKY; ctx.fillRect(0, 0, canvas.width, canvas.height);
    // bloom (cheap blur by down/up sampling)
    bctx.putImageData(bImg, 0, 0);
    hctx.imageSmoothingEnabled = true; qctx.imageSmoothingEnabled = true;
    hctx.clearRect(0, 0, half.width, half.height); hctx.drawImage(bloomc, 0, 0, half.width, half.height);
    qctx.clearRect(0, 0, quarter.width, quarter.height); qctx.drawImage(half, 0, 0, quarter.width, quarter.height);
    ctx.imageSmoothingEnabled = true;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.35; ctx.drawImage(bloomc, GX, GY, COLS * CW, ROWS * CH);
    ctx.globalAlpha = 0.45; ctx.drawImage(half, GX, GY, COLS * CW, ROWS * CH);
    ctx.globalAlpha = 0.5; ctx.drawImage(quarter, GX - 8, GY - 8, COLS * CW + 16, ROWS * CH + 16);
    ctx.globalAlpha = 1;
    ctx.drawImage(mask, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
  }

  // ---------- code editor ----------
  const SRC = window.AGAC_SRC.replace(/\r/g, '').split('\n');
  if (SRC[SRC.length - 1] === '') SRC.pop();
  const LH = 44, CURSOR_Y = 430;
  const lineStart = []; let acc = 0;
  for (const l of SRC) { lineStart.push(acc); acc += l.length + 1; }
  const TOTAL = acc;
  // typing keyframes [time, line + fraction of that line] taken from the reel
  const KEYS = [[0, 75], [1.0, 76.9], [1.67, 77.8], [2.33, 82.95], [3.0, 87.9], [3.67, 91.45], [4.33, 92.95],
    [5.0, 95.5], [5.67, 98.6], [6.33, 105.05], [7.0, 106.7], [7.67, 109.95], [8.33, 112.5], [9.0, 116.05],
    [9.67, 118.4], [10.33, 119.5], [11.0, 120.9], [11.67, 123.4], [12.33, 124.05], [13.0, 125.95],
    [13.67, 126.95], [14.33, 128.5], [15.0, 130.4], [15.67, 131.4], [16.33, 132.95], [17.0, 134.8],
    [17.67, 135.9], [18.0, 137.95], [18.67, 139.4], [19.33, 142.3], [20.0, 144.5]];
  const keyPos = KEYS.map(([tk, lf]) => {
    const L = Math.floor(lf) - 1, fr = lf - Math.floor(lf);
    return [tk, lineStart[L] + Math.round(fr * SRC[L].length)];
  });
  const TAIL_RATE = 150;                         // chars/s after the reel's last keyframe
  const T_DONE = 20 + (TOTAL - keyPos[keyPos.length - 1][1]) / TAIL_RATE;
  const T_LOOP = T_DONE + 4;
  function typedChars(t) {
    if (t <= keyPos[0][0]) return keyPos[0][1];
    for (let i = 1; i < keyPos.length; i++) {
      if (t <= keyPos[i][0]) {
        const [ta, pa] = keyPos[i - 1], [tb, pb] = keyPos[i];
        return Math.round(pa + (pb - pa) * (t - ta) / (tb - ta));
      }
    }
    const [tl, pl] = keyPos[keyPos.length - 1];
    return Math.min(TOTAL, Math.round(pl + (t - tl) * TAIL_RATE));
  }

  const KW = new Set('def class return for in if else elif import from as while and or not is lambda with pass break continue try except yield global'.split(' '));
  const KC = new Set(['None', 'True', 'False']);
  const BUILTIN = new Set('range int float len enumerate print abs min max zip list tuple str np'.split(' '));
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const TOK = /(#.*$)|([fr]?"(?:[^"\\]|\\.)*"?|[fr]?'(?:[^'\\]|\\.)*'?)|(\b\d+\.?\d*(?:e-?\d+)?\b|\.\d+\b)|([A-Za-z_]\w*)|(\s+)|(.)/g;
  function highlight(line) {
    let out = '', m, prevWord = '';
    TOK.lastIndex = 0;
    while ((m = TOK.exec(line)) !== null) {
      if (m[0] === '') { TOK.lastIndex++; continue; }
      if (m[1]) out += `<span class="cm">${esc(m[1])}</span>`;
      else if (m[2]) out += `<span class="str">${esc(m[2])}</span>`;
      else if (m[3]) out += `<span class="num">${m[3]}</span>`;
      else if (m[4]) {
        const w = m[4], next = line[TOK.lastIndex];
        let cls = '';
        if (KW.has(w)) cls = 'kw';
        else if (KC.has(w)) cls = 'kc';
        else if (prevWord === 'def' || prevWord === 'class') cls = '';
        else if (BUILTIN.has(w) || next === '(') cls = 'fn';
        out += cls ? `<span class="${cls}">${w}</span>` : w;
        prevWord = w;
        continue;
      } else if (m[5]) out += m[5];
      else out += `<span class="op">${esc(m[6])}</span>`;
      if (!m[5]) prevWord = '';
    }
    return out;
  }
  const HL = SRC.map(highlight);

  const linesEl = document.getElementById('lines');
  let scroll = null, lastCodeKey = '';
  function updateCode(t, dt) {
    const pos = typedChars(t);
    let cur = 0;
    while (cur + 1 < SRC.length && lineStart[cur + 1] <= pos) cur++;
    const col = Math.min(SRC[cur].length, pos - lineStart[cur]);
    const target = cur * LH - CURSOR_Y;
    if (scroll === null) scroll = target;
    scroll += (target - scroll) * (1 - Math.exp(-dt * 9));
    const first = Math.max(0, Math.floor(scroll / LH)), last = first + 16;
    const blink = t >= T_DONE ? (Math.floor(t * 2) % 2 === 0) : true;
    const key = `${first}|${cur}|${col}|${blink}`;
    if (key !== lastCodeKey) {
      lastCodeKey = key;
      let html = '';
      for (let i = first; i < last; i++) {
        let tx = '';
        if (i < cur) tx = HL[i];
        else if (i === cur) tx = highlight(SRC[i].slice(0, col)) + (blink ? '<span class="cursor"></span>' : '');
        html += `<div class="ln${i === cur ? ' cur' : ''}" style="top:${i * LH}px;position:absolute;left:0;right:0"><span class="no">${i + 1}</span><span class="tx">${tx}</span></div>`;
      }
      linesEl.innerHTML = html;
    }
    linesEl.style.transform = `translateY(${-scroll}px)`;
  }

  // ---------- hud ----------
  const $ = (id) => document.getElementById(id);
  const elT = $('tlabel'), elRot = $('rot'), elL = $('lights'), elLet = $('letters'), elStatus = $('status');
  const pad = (n, w) => String(n).padStart(w, '0');
  function updateHud(t, stats) {
    const tt = t.toFixed(2).split('.');
    elT.textContent = `t ${pad(tt[0], 2)}.${tt[1]}s`;
    const rot = ((t * 18) % 360).toFixed(2).split('.');
    elRot.textContent = `${pad(rot[0], 3)}.${rot[1]}°`;
    elL.textContent = String(stats.lightsLit).padStart(3, ' ');
    elLet.textContent = stats.letters.toLocaleString('en-US');
    elStatus.textContent = t >= T_DONE ? 'done · 30 fps' : 'running · 30 fps';
  }

  // ---------- layout ----------
  const stage = $('stage');
  function fit() {
    const s = Math.min(window.innerWidth / 1080, window.innerHeight / 1920);
    stage.style.transform = `translate(-50%, -50%) scale(${s})`;
    stage.style.transformOrigin = 'center center';
  }
  window.addEventListener('resize', fit); fit();

  // ---------- loop ----------
  const params = new URLSearchParams(location.search);
  const FIXED = params.has('t') ? parseFloat(params.get('t')) : null;
  let start = null, lastFrame = -1, lastT = 0;
  function tick(now) {
    requestAnimationFrame(tick);
    if (start === null) start = now;
    let t = FIXED !== null ? FIXED : (now - start) / 1000;
    if (FIXED === null && t >= T_LOOP) { start = now; t = 0; scroll = null; }
    const frame = Math.floor(t * 30);
    if (frame === lastFrame && FIXED === null) return;  // 30 fps like the original
    lastFrame = frame;
    const ft = frame / 30;
    const stats = renderScene(ft);
    draw();
    updateCode(ft, Math.max(1 / 30, ft - lastT));
    updateHud(ft, stats);
    lastT = ft;
    if (FIXED !== null) { scroll = null; updateCode(ft, 1); }
  }
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => {
    fitFont(mctx);
    requestAnimationFrame(tick);
  });
})();
