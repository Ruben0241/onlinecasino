#!/usr/bin/env python3
# agac.py - a christmas tree made of letters
#
# every needle, ball and light is a 3d point. each frame the tree spins,
# points are projected onto a terminal grid and the nearest one per
# cell wins. brightness picks the glyph, the point picks the colour.
#
# run:  python3 agac.py        (truecolor terminal, ~154x107 chars)

import os
import sys
import time
import shutil
import numpy as np

TAU = 2 * np.pi
FPS = 30
SPIN = 18.0                      # degrees per second
CAM = np.array([0.0, 2.16, 5.7]) # camera position
LOOK = np.array([0.0, 1.41, 0.0])
FOCAL = 1.72                     # in units of grid width
ASPECT = 0.651                   # glyph width / height
LIGHT = np.array([-0.5, 0.6, 0.65])

RAMPS = {
    "needle":  " .:-=+*%%",
    "trunk":   " .:|#%",
    "ball":    " .:o*%#@@",
    "light":   " .oO@",
    "garland": " .-~=*#",
    "gift":    " .-=+#%",
    "snow":    " .:*%@",
    "ground":  " .-=+",
}

BG = (6, 10, 18)
SKY_TOP = (7, 12, 25)


def unit(v):
    v = np.asarray(v, float)
    return v / (np.linalg.norm(v, axis=-1, keepdims=True) + 1e-9)


def rot_y(p, a):
    c, s = np.cos(a), np.sin(a)
    x, y, z = p[..., 0], p[..., 1], p[..., 2]
    return np.stack([c * x + s * z, y, -s * x + c * z], -1)


def smooth(x):
    x = np.clip(x, 0, 1)
    return x * x * (3 - 2 * x)


def mix(a, b, t):
    return a + (b - a) * t


def ansi(r, g, b, ch):
    return f"\x1b[38;2;{r};{g};{b}m{ch}"


def clear():
    sys.stdout.write("\x1b[H\x1b[2J")

def fib(n):
    i = np.arange(n) + 0.5
    y = 1 - 2 * i / n
    r = np.sqrt(1 - y * y)
    th = np.pi * (3 - np.sqrt(5)) * i
    return np.stack([r * np.cos(th), y, r * np.sin(th)], 1)


# ==========================================================================
NEEDLE, TRUNK, BALL, LIGHT, GARLAND, GIFT, RIBBON, SNOWCAP, GROUND = range(9)
Y0, Y1 = 0.42, 2.55                         # foliage from .. to, in world units


def envelope(y):
    f = np.clip((y - Y0) / (Y1 - Y0), 0, 1)
    return 0.03 + 0.84 * (1 - f) ** 1.08


class Parts:
    def __init__(s):
        s.P, s.N, s.C, s.K, s.T, s.PH, s.SH = [], [], [], [], [], [], []

    def add(s, p, n, col, kind, t0, ph=0.0, shine=0.0):
        m = len(p)
        s.P.append(np.asarray(p, float)), s.N.append(unit(np.broadcast_to(n, (m, 3))))
        s.C.append(np.broadcast_to(np.asarray(col, float), (m, 3)))
        s.K.append(np.full(m, kind))
        for lst, v in ((s.T, t0), (s.PH, ph), (s.SH, shine)):
            lst.append(np.broadcast_to(np.asarray(v, float), (m,)))

    def done(s):
        return [np.concatenate(v) for v in (s.P, s.N, s.C, s.K, s.T, s.PH, s.SH)]


def build():
    rng = np.random.default_rng(7)
    q = Parts()
    tips = []
    # --- needles: whorls of drooping branches, dense at the tips
    tiers = np.linspace(Y0 + 0.02, Y1 - 0.04, 24)
    for i, y in enumerate(tiers):
        R = envelope(y)
        nb = int(7 + 11 * (1 - (y - Y0) / (Y1 - Y0)))
        for b in range(nb):
            a = TAU * b / nb + i * 0.618 * TAU + rng.normal(0, 0.12)
            L = R * rng.uniform(0.82, 1.06)
            n = int(250 + 1400 * L)
            s = rng.random(n) ** 0.65
            d = np.array([np.cos(a), 0, np.sin(a)])
            side = np.array([-np.sin(a), 0, np.cos(a)])
            spread = (0.035 + 0.11 * s) * rng.normal(0, 1, n)
            yy = y + 0.07 * s * L - 0.22 * (s * L) ** 2 + 0.03 * rng.normal(0, 1, n)
            p = d[None] * (s * L)[:, None] + side[None] * spread[:, None] + np.array([0, 1, 0]) * yy[:, None]
            nrm = d[None] * 0.75 + np.array([0, 0.55, 0]) + rng.normal(0, 0.35, (n, 3))
            ao = 0.35 + 0.65 * s ** 1.3
            tone = ao * rng.uniform(0.75, 1.1, n)
            col = np.array([0.07, 0.30, 0.13]) + (np.array([0.30, 0.42, 0.10]) * s[:, None] ** 3) * tone[:, None]
            t0 = 1.3 + 5.0 * (y - Y0) / (Y1 - Y0) + 0.45 * s
            snow = (s > 0.45) & (rng.random(n) < 0.05 * s) & (nrm[:, 1] > 0.5)
            q.add(p[~snow], nrm[~snow], col[~snow] * ao[~snow, None], NEEDLE, t0[~snow])
            q.add(p[snow], np.array([0, 1.0, 0]), (0.92, 0.95, 1.0), SNOWCAP, t0[snow])
            tips.append(d * L * 0.93 + np.array([0, y + 0.07 * L - 0.22 * L * L, 0]))
    # --- trunk
    h, a = np.meshgrid(np.linspace(-0.05, 0.6, 50), np.linspace(0, TAU, 90))
    p = np.stack([0.085 * np.cos(a), h, 0.085 * np.sin(a)], -1).reshape(-1, 3)
    nn = np.stack([np.cos(a), 0 * a, np.sin(a)], -1).reshape(-1, 3)
    bark = 0.75 + 0.25 * np.sin(h * 90 + a * 3).ravel()
    q.add(p, nn, np.array([0.42, 0.26, 0.14])[None] * bark[:, None], TRUNK, 0.6 + 0.6 * h.ravel())
    # --- the tinsel garland: a drooping gold spiral, in swags between branches
    u = np.linspace(0, 1, 2600)
    turns = 3.6
    yg = Y0 + 0.15 + (Y1 - Y0 - 0.45) * u
    ag = TAU * turns * u + 0.9
    swag = -0.06 * np.abs(np.sin(ag * 2.5))
    rg_ = envelope(yg) * 1.0 + 0.02
    base = np.stack([rg_ * np.cos(ag), yg + swag, rg_ * np.sin(ag)], -1)
    for k in range(5):
        off = rng.normal(0, 0.018, base.shape)
        nrm = unit(base * np.array([1.0, 0.0, 1.0]) + off)
        gold = np.array([1.0, 0.74, 0.26]) * rng.uniform(0.7, 1.15, (len(u), 1))
        q.add(base + off, nrm, gold, GARLAND, 5.0 + 2.2 * u, shine=0.8)
    # --- baubles: red and gold glass, hung from the branch tips
    tips = np.array(tips)
    pick = rng.choice(len(tips), 46, replace=False)
    for k in pick:
        c = tips[k] - np.array([0, 0.06, 0])
        r = rng.uniform(0.065, 0.09)
        red = rng.random() < 0.6
        col = np.array([0.95, 0.10, 0.08]) if red else np.array([1.0, 0.72, 0.22])
        sp = fib(int(900 * r / 0.07))
        f = (c[1] - Y0) / (Y1 - Y0)
        q.add(c + sp * r, sp, col, BALL, 6.3 + 2.2 * f + rng.random() * 0.3, shine=1.0)
    # --- lights: 170 warm bulbs that twinkle out of phase
    lp = tips[rng.choice(len(tips), 170, replace=False)] * 0.97
    for c in lp:
        f = (c[1] - Y0) / (Y1 - Y0)
        q.add(c[None], unit(c * [1, 0, 1])[None], (1.0, 0.82, 0.45), LIGHT,
              7.55 + 1.5 * f, ph=rng.random() * TAU, shine=1.0)
    # --- gifts under the tree
    boxes = [  # x, z, w, h, d, box colour, ribbon colour, t0
        (-0.84, 0.40, 0.20, 0.15, 0.18, (0.85, 0.08, 0.07), (1.0, 0.78, 0.25), 6.6),
        (0.86, 0.36, 0.18, 0.13, 0.17, (0.12, 0.22, 0.80), (0.92, 0.95, 1.0), 7.4),
        (0.22, 0.90, 0.24, 0.14, 0.20, (0.82, 0.10, 0.08), (1.0, 0.80, 0.30), 9.4),
        (-0.40, -0.86, 0.19, 0.17, 0.19, (0.95, 0.68, 0.18), (0.85, 0.08, 0.07), 10.4),
        (0.76, -0.58, 0.15, 0.11, 0.15, (0.92, 0.92, 0.95), (0.90, 0.10, 0.10), 11.2),
        (-0.92, -0.20, 0.12, 0.20, 0.12, (0.10, 0.45, 0.20), (1.0, 0.78, 0.25), 12.6),
    ]
    for x, z, w, h, d, bc, rc, t0 in boxes:
        p, nn = box(rng, w, h, d)
        rib = (np.abs(p[:, 0]) < w * 0.09) | (np.abs(p[:, 2]) < d * 0.09)
        p = p + np.array([x, h / 2, z])
        q.add(p[~rib], nn[~rib], bc, GIFT, t0 + 0.4 * p[~rib, 1])
        q.add(p[rib], nn[rib], rc, RIBBON, t0 + 0.3, shine=0.6)
    # --- snow piled around the foot of the trunk
    r = np.sqrt(rng.random(9000)) * 0.62
    a = rng.random(9000) * TAU
    y = 0.06 * np.exp(-(r / 0.7) ** 2) * rng.random(9000)
    p = np.stack([r * np.cos(a), y, r * np.sin(a)], -1)
    q.add(p, np.array([0, 1.0, 0]), (0.88, 0.88, 0.84), SNOWCAP, 6.0 + 0.3 * r)
    return q.done()


def box(rng, w, h, d, n=2600):
    face = rng.integers(0, 5, n)                # five faces, no bottom
    u, v = rng.random(n) - 0.5, rng.random(n) - 0.5
    N = np.array([[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]], float)[face]
    p = np.zeros((n, 3))
    side = face < 2
    p[side] = np.stack([0.5 * N[side, 0] * w, v[side] * h, u[side] * d], -1)
    fb = (face == 2) | (face == 3)
    p[fb] = np.stack([u[fb] * w, v[fb] * h, 0.5 * N[fb, 2] * d], -1)
    top = face == 4
    p[top] = np.stack([u[top] * w, np.full(top.sum(), 0.5 * h), v[top] * d], -1)
    return p, N


def camera(cols, rows):
    f = unit(LOOK - CAM)
    r = unit(np.cross(f, [0, 1, 0]))
    up = np.cross(r, f)
    return f, r, up, FOCAL * cols


def render(P, N, C, K, T, PH, SH, t, cols, rows):
    on = T <= t
    p, n = rot_y(P[on], np.radians(SPIN * t)), rot_y(N[on], np.radians(SPIN * t))
    f, r, up, foc = camera(cols, rows)
    rel = p - CAM
    z = rel @ f
    x = cols / 2 + foc * (rel @ r) / z
    y = rows * 0.55 - foc * ASPECT * (rel @ up) / z
    ok = (x >= 0) & (x < cols) & (y >= 0) & (y < rows) & (z > 0.1)
    ix, iy, z = x[ok].astype(int), y[ok].astype(int), z[ok]
    lam = np.clip(n[ok] @ unit(LIGHT) * 0.5 + 0.5, 0, 1)
    age = np.clip((t - T[on][ok]) / 0.45, 0, 1)[:, None]
    col = mix(np.ones(3), C[on][ok] * (0.3 + 1.1 * lam[:, None]), age)
    tw = 0.6 + 0.4 * np.sin(t * 3 + PH[on][ok])
    col = col * (1 + SH[on][ok, None] * tw[:, None] * 0.5)
    order = np.argsort(-z)                   # far first, near overwrites
    cell = iy[order] * cols + ix[order]
    rgb = np.zeros((rows * cols, 3))
    lum = np.zeros(rows * cols)
    kind = np.full(rows * cols, -1)
    rgb[cell] = col[order]
    lum[cell] = lam[order] * age[order, 0]
    kind[cell] = K[on][ok][order]
    return rgb, lum, kind


def glyph(k, v):
    ramp = RAMPS[("needle", "trunk", "ball", "light", "garland", "gift", "gift",
                  "snow", "ground")[k]]
    return ramp[min(len(ramp) - 1, int(v * len(ramp)))]


def frame(parts, t, cols, rows):
    rgb, lum, kind = render(*parts, t, cols, rows)
    rgb = (np.clip(rgb, 0, 1) * 255).astype(int)
    out = ["\x1b[H"]
    for j in range(rows):
        line = []
        for i in range(cols):
            c = j * cols + i
            if kind[c] < 0:
                line.append(" ")
                continue
            line.append(ansi(*rgb[c], glyph(kind[c], lum[c])))
        out.append("".join(line) + "\x1b[0m\n")
    lights = int(((parts[3] == LIGHT) & (parts[4] <= t)).sum())
    out.append(f"rotation {SPIN * t % 360:06.2f}°    lights {lights:4d}\n")
    return "".join(out)


def main():
    parts = build()
    cols, rows = shutil.get_terminal_size((154, 110))
    rows -= 3
    clear()
    t0 = time.time()
    try:
        while True:
            t = time.time() - t0
            sys.stdout.write(frame(parts, t, cols, rows))
            sys.stdout.flush()
            time.sleep(max(0, 1 / FPS - (time.time() - t0 - t)))
    except KeyboardInterrupt:
        sys.stdout.write("\x1b[0m\n")


if __name__ == "__main__":
    main()
