/**
 * LuckySpin game engine — pure game logic, zero DOM access.
 *
 * This module knows nothing about rendering. It only knows how to build a
 * reel result, evaluate wins ("ways" model), and step the coin-hunt bonus.
 * That separation is what lets sim/simulate.js run the exact same math
 * headless in Node to measure RTP, hit rate and bonus frequency.
 *
 * UMD export: `window.LuckySpinEngine` in the browser, `module.exports` in
 * Node (used by the Monte Carlo simulator).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.LuckySpinEngine = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ---------- seeded RNG (B9) ----------
  // mulberry32: tiny, fast, good-enough-for-a-slot PRNG. Same seed -> same
  // sequence, so a broken spin can be reproduced exactly ("Spin mit Seed X").

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function rng() {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hashStringToInt(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return h >>> 0;
  }

  // Returns Math.random when no seed is given (normal play), or a
  // reproducible mulberry32 generator when a seed (number or string) is
  // given (debugging / simulation).
  function createRng(seed) {
    if (seed === undefined || seed === null) return Math.random;
    return mulberry32(typeof seed === "number" ? seed >>> 0 : hashStringToInt(String(seed)));
  }

  // ---------- reel pools ----------

  function wildAllowedOnReel(cfg, reelIndex) {
    const restriction = cfg.wild && cfg.wild.reels;
    if (!restriction || restriction === "all") return true;
    if (restriction === "middle") return reelIndex > 0 && reelIndex < cfg.cols - 1;
    if (Array.isArray(restriction)) return restriction.indexOf(reelIndex) !== -1;
    return true;
  }

  // Wild and scatter get a `wild`/`scatter` flag baked in so grid cells can
  // be checked the same way the old flat symbol pool worked (symbol.scatter,
  // symbol.top, ...).
  function enrichedWild(cfg) {
    return Object.assign({}, cfg.wild, { wild: true });
  }

  function enrichedScatter(cfg) {
    return Object.assign({}, cfg.scatter, { scatter: true });
  }

  // Builds one weighted draw pool per reel — reel 0 and the last reel omit
  // the wild if it's restricted to the middle reels.
  function buildReelPools(cfg) {
    const wild = enrichedWild(cfg);
    const scatter = enrichedScatter(cfg);
    const pools = [];
    for (let c = 0; c < cfg.cols; c++) {
      const entries = cfg.symbols.map((s) => ({ sym: s, weight: s.weight }));
      entries.push({ sym: scatter, weight: scatter.weight });
      if (wildAllowedOnReel(cfg, c)) entries.push({ sym: wild, weight: wild.weight });
      const total = entries.reduce((sum, e) => sum + e.weight, 0);
      pools.push({ entries, total });
    }
    return pools;
  }

  function drawFromPool(pool, rng) {
    let roll = rng() * pool.total;
    for (const e of pool.entries) {
      if (roll < e.weight) return e.sym;
      roll -= e.weight;
    }
    return pool.entries[pool.entries.length - 1].sym;
  }

  // Draws one full grid (cfg.cols x cfg.rows), independently per reel pool.
  function spinGrid(cfg, rng) {
    rng = rng || Math.random;
    const pools = buildReelPools(cfg);
    const grid = [];
    for (let c = 0; c < cfg.cols; c++) {
      const col = [];
      for (let r = 0; r < cfg.rows; r++) col.push(drawFromPool(pools[c], rng));
      grid.push(col);
    }
    return grid;
  }

  // ---------- ways evaluation (B1) ----------
  //
  // A symbol counts if it (or a wild) appears on reel 1, 2, 3 ... unbroken
  // from the left, in any row. The number of "ways" for a given run length
  // is the product of how many matching cells sit on each of those reels.
  // Only the longest qualifying run per symbol pays (no double counting of
  // 3-of-a-kind inside a 5-of-a-kind).
  function evaluateWays(cfg, grid, betAmount) {
    const cols = cfg.cols;
    const rows = cfg.rows;
    let totalWin = 0;
    const wins = [];
    const winCellMap = new Map();

    cfg.symbols.forEach((sym) => {
      const perReelCells = [];
      for (let c = 0; c < cols; c++) {
        const cells = [];
        for (let r = 0; r < rows; r++) {
          const s = grid[c][r];
          if (s.key === sym.key || s.wild) cells.push(r);
        }
        if (cells.length === 0) break;
        perReelCells.push(cells);
      }

      const run = perReelCells.length;
      if (run < 3) return;

      // pay at the longest defined table length <= run (table has gaps at 1/2)
      let payLen = 0;
      for (let k = Math.min(run, 6); k >= 3; k--) {
        if (sym.pay[k] !== undefined) {
          payLen = k;
          break;
        }
      }
      if (payLen < 3) return;

      let ways = 1;
      for (let c = 0; c < payLen; c++) ways *= perReelCells[c].length;
      const amount = ways * sym.pay[payLen] * betAmount;
      if (amount <= 0) return;

      totalWin += amount;
      const cells = [];
      for (let c = 0; c < payLen; c++) {
        perReelCells[c].forEach((r) => {
          cells.push([c, r]);
          winCellMap.set(`${c},${r}`, [c, r]);
        });
      }
      wins.push({ symbolKey: sym.key, count: payLen, ways, amount, cells });
    });

    let scatterCount = 0;
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        if (grid[c][r].scatter) scatterCount++;
      }
    }

    return { totalWin, wins, winningCells: [...winCellMap.values()], scatterCount };
  }

  // ---------- coin-hunt bonus (Hold & Win style) ----------

  const COIN_RARE_CHANCE = 0.07;
  const COIN_RARE_MULTS = [2, 3, 5, 10];
  const COIN_VALUE_TABLE = [
    { mult: 1, weight: 40 },
    { mult: 1.5, weight: 24 },
    { mult: 2, weight: 16 },
    { mult: 3, weight: 10 },
    { mult: 5, weight: 6 },
    { mult: 10, weight: 3 },
    { mult: 25, weight: 1 },
  ];
  const COIN_VALUE_TOTAL_WEIGHT = COIN_VALUE_TABLE.reduce((sum, v) => sum + v.weight, 0);

  function weightedCoinValueMult(rng) {
    let roll = rng() * COIN_VALUE_TOTAL_WEIGHT;
    for (const v of COIN_VALUE_TABLE) {
      if (roll < v.weight) return v.mult;
      roll -= v.weight;
    }
    return COIN_VALUE_TABLE[0].mult;
  }

  // Runs one coin-hunt spin over a mutable coinGrid (cols x rows array,
  // null = empty). Mutates coinGrid in place and returns the cells that
  // newly landed a coin this spin: [[c, r, coin], ...].
  function coinStep(cfg, coinGrid, betAmount, rng) {
    rng = rng || Math.random;
    const landChance = cfg.coinLandChancePct / 100;
    const landed = [];
    for (let c = 0; c < cfg.cols; c++) {
      for (let r = 0; r < cfg.rows; r++) {
        if (coinGrid[c][r]) continue;
        if (rng() < landChance) {
          const mult = weightedCoinValueMult(rng);
          const rare = rng() < COIN_RARE_CHANCE ? COIN_RARE_MULTS[Math.floor(rng() * COIN_RARE_MULTS.length)] : null;
          const value = betAmount * mult * (rare || 1) * cfg.bonusWinMult;
          const coin = { mult, rare, value };
          coinGrid[c][r] = coin;
          landed.push([c, r, coin]);
        }
      }
    }
    return landed;
  }

  return {
    createRng,
    mulberry32,
    buildReelPools,
    drawFromPool,
    wildAllowedOnReel,
    enrichedWild,
    enrichedScatter,
    spinGrid,
    evaluateWays,
    coinStep,
  };
});
