(function (global) {
  "use strict";

  const STORAGE_KEY = "luckyspin_config_v1";

  const DEFAULT_CONFIG = {
    symbols: [
      { key: "cherry", img: "img/symbols/cherry.svg", weight: 24, mult: 3 },
      { key: "lemon", img: "img/symbols/lemon.svg", weight: 20, mult: 4 },
      { key: "grapes", img: "img/symbols/grapes.svg", weight: 16, mult: 6 },
      { key: "clover", img: "img/symbols/clover.svg", weight: 12, mult: 8 },
      { key: "bell", img: "img/symbols/bell.svg", weight: 9, mult: 12 },
      { key: "gem", img: "img/symbols/gem.svg", weight: 6, mult: 20 },
      { key: "seven", img: "img/symbols/seven.svg", weight: 3, mult: 40 },
      { key: "kzu", img: "img/symbols/kzu.svg", weight: 1, mult: 75, top: true },
    ],
    scatter: { key: "scatter", img: "img/symbols/scatter.svg", weight: 2 },
    scatterTrigger: 3,
    coinMinSpins: 3,
    coinLandChancePct: 11,
    bonusWinMult: 2,
    bigWinMult: 8,
    megaWinMult: 20,
  };

  function cloneDefaults() {
    return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  }

  function loadConfig() {
    const cfg = cloneDefaults();
    let raw;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      return cfg;
    }
    if (!raw) return cfg;

    try {
      const saved = JSON.parse(raw);
      if (Array.isArray(saved.symbols)) {
        cfg.symbols.forEach((s) => {
          const match = saved.symbols.find((x) => x.key === s.key);
          if (!match) return;
          if (typeof match.weight === "number" && match.weight >= 0) s.weight = match.weight;
          if (typeof match.mult === "number" && match.mult > 0) s.mult = match.mult;
        });
      }
      if (saved.scatter && typeof saved.scatter.weight === "number" && saved.scatter.weight >= 0) {
        cfg.scatter.weight = saved.scatter.weight;
      }
      ["scatterTrigger", "coinMinSpins", "coinLandChancePct", "bonusWinMult", "bigWinMult", "megaWinMult"].forEach(
        (key) => {
          if (typeof saved[key] === "number" && saved[key] >= 0) cfg[key] = saved[key];
        }
      );
    } catch (e) {
      // ignore malformed storage, fall back to defaults
    }
    return cfg;
  }

  function saveConfig(cfg) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  }

  function resetConfig() {
    localStorage.removeItem(STORAGE_KEY);
  }

  global.LuckySpinConfig = {
    DEFAULT_CONFIG,
    cloneDefaults,
    loadConfig,
    saveConfig,
    resetConfig,
    STORAGE_KEY,
  };
})(window);
