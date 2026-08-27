(function (global) {
  "use strict";

  // v2: ways-based paytable, 12 symbols + wild (see js/engine.js). Bumped so
  // stale v1 settings (old symbol keys, single-mult paytable) never get
  // merged into the new shape.
  const STORAGE_KEY = "luckyspin_config_v2";

  // Pay values are the win as a multiple of the TOTAL bet, per matching way,
  // for a run of 3/4/5/6 reels. Steep curve on purpose (report B4) — real
  // slots run ~50-200x between cheapest and priciest symbol; this is ~157x.
  const DEFAULT_CONFIG = {
    cols: 6,
    rows: 4,

    symbols: [
      { key: "ten", img: "img/symbols/ten.svg", weight: 13, pay: { 3: 0.022, 4: 0.111, 5: 0.556, 6: 2.89 } },
      { key: "jack", img: "img/symbols/jack.svg", weight: 13, pay: { 3: 0.022, 4: 0.111, 5: 0.556, 6: 2.89 } },
      { key: "queen", img: "img/symbols/queen.svg", weight: 12, pay: { 3: 0.027, 4: 0.134, 5: 0.668, 6: 3.47 } },
      { key: "king", img: "img/symbols/king.svg", weight: 12, pay: { 3: 0.027, 4: 0.134, 5: 0.668, 6: 3.47 } },
      { key: "ace", img: "img/symbols/ace.svg", weight: 11, pay: { 3: 0.033, 4: 0.167, 5: 0.834, 6: 4.34 } },
      { key: "cherry", img: "img/symbols/cherry.svg", weight: 10, pay: { 3: 0.056, 4: 0.278, 5: 1.39, 6: 7.23 } },
      { key: "lemon", img: "img/symbols/lemon.svg", weight: 9, pay: { 3: 0.078, 4: 0.389, 5: 1.95, 6: 10.1 } },
      { key: "grapes", img: "img/symbols/grapes.svg", weight: 8, pay: { 3: 0.111, 4: 0.556, 5: 2.78, 6: 14.5 } },
      { key: "bell", img: "img/symbols/bell.svg", weight: 6, pay: { 3: 0.2, 4: 1.0, 5: 5.01, 6: 26.0 } },
      { key: "gem", img: "img/symbols/gem.svg", weight: 4, pay: { 3: 0.401, 4: 2.0, 5: 10.0, 6: 52.1 } },
      { key: "seven", img: "img/symbols/seven.svg", weight: 2.2, pay: { 3: 1.0, 4: 5.01, 5: 25.0, 6: 130 } },
      { key: "kzu", img: "img/symbols/kzu.svg", weight: 1, pay: { 3: 2.67, 4: 13.4, 5: 66.8, 6: 347 }, top: true },
    ],

    // substitutes for any paying symbol (not the scatter); middle reels only,
    // like almost every real slot (report B2)
    wild: { key: "wild", img: "img/symbols/wild.svg", weight: 2.0, reels: "middle" },

    scatter: { key: "scatter", img: "img/symbols/scatter.svg", weight: 1.5 },
    scatterTrigger: 3,

    coinMinSpins: 3,
    coinLandChancePct: 4,
    bonusWinMult: 2.15,

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
          if (match.pay && typeof match.pay === "object") {
            [3, 4, 5, 6].forEach((k) => {
              const v = match.pay[k];
              if (typeof v === "number" && v >= 0) s.pay[k] = v;
            });
          }
        });
      }

      if (saved.wild && typeof saved.wild.weight === "number" && saved.wild.weight >= 0) {
        cfg.wild.weight = saved.wild.weight;
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

  // True once any value differs from the shipped defaults — used to show
  // the "Testeinstellungen aktiv" banner (F7) so nobody accidentally plays
  // (or judges the balance of) a detuned build without noticing.
  function isCustomized() {
    let raw;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      return false;
    }
    return !!raw;
  }

  function saveConfig(cfg) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  }

  function resetConfig() {
    localStorage.removeItem(STORAGE_KEY);
  }

  const api = {
    DEFAULT_CONFIG,
    cloneDefaults,
    loadConfig,
    saveConfig,
    resetConfig,
    isCustomized,
    STORAGE_KEY,
  };

  global.LuckySpinConfig = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : global);
