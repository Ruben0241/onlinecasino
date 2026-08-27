(() => {
  "use strict";

  const GRID_CELLS = 24; // 6 columns x 4 rows, mirrors script.js
  const PAY_COUNTS = [3, 4, 5, 6];

  const { loadConfig, saveConfig, resetConfig } = window.LuckySpinConfig;
  let cfg = loadConfig();

  const el = {
    symbolRows: document.getElementById("symbolRows"),
    scatterRow: document.getElementById("scatterRow"),
    scatterTrigger: document.getElementById("scatterTrigger"),
    coinMinSpins: document.getElementById("coinMinSpins"),
    coinLandChancePct: document.getElementById("coinLandChancePct"),
    bonusWinMult: document.getElementById("bonusWinMult"),
    bigWinMult: document.getElementById("bigWinMult"),
    megaWinMult: document.getElementById("megaWinMult"),
    bonusProb: document.getElementById("bonusProb"),
    saveBtn: document.getElementById("saveBtn"),
    resetBtn: document.getElementById("resetBtn"),
    saveStatus: document.getElementById("saveStatus"),
  };

  // ---------- probability math ----------

  function combinations(n, k) {
    if (k < 0 || k > n) return 0;
    k = Math.min(k, n - k);
    let res = 1;
    for (let i = 0; i < k; i++) res = (res * (n - i)) / (i + 1);
    return res;
  }

  function probAtLeast(n, k, p) {
    const kk = Math.max(0, Math.min(n, Math.round(k)));
    if (p <= 0) return kk <= 0 ? 1 : 0;
    if (p >= 1) return 1;
    let sum = 0;
    for (let i = kk; i <= n; i++) {
      sum += combinations(n, i) * Math.pow(p, i) * Math.pow(1 - p, n - i);
    }
    return sum;
  }

  // Wild only lands on the middle reels (2-5), so the pool total — and every
  // other symbol's true per-field chance — differs slightly between edge and
  // middle reels. We show the 6-reel *average* so this stays a single number
  // per symbol; it's a test page hint, not the exact per-reel math (the
  // simulator in sim/simulate.js is the source of truth for real RTP).
  function reelTotals() {
    const base = cfg.symbols.reduce((sum, s) => sum + s.weight, 0) + cfg.scatter.weight;
    const edgeTotal = base;
    const middleTotal = base + cfg.wild.weight;
    const cols = cfg.cols || 6;
    const middleCols = Math.max(0, cols - 2);
    const avgTotal = (2 * edgeTotal + middleCols * middleTotal) / cols;
    return { edgeTotal, middleTotal, avgTotal };
  }

  // ---------- row builders ----------

  function buildRow(symbol, opts) {
    const { onWeightChange, payFields, note } = opts;
    const row = document.createElement("div");
    row.className = "symbol-row";

    const img = document.createElement("img");
    img.src = symbol.img;
    img.alt = symbol.key;
    row.appendChild(img);

    const name = document.createElement("span");
    name.className = "symbol-name";
    name.textContent = symbol.key;
    row.appendChild(name);

    const weightField = document.createElement("label");
    weightField.className = "inline-field";
    weightField.innerHTML = `<span>Gewicht</span>`;
    const weightInput = document.createElement("input");
    weightInput.type = "range";
    weightInput.min = "0";
    weightInput.max = "20";
    weightInput.step = "0.1";
    weightInput.value = symbol.weight;
    const weightNum = document.createElement("span");
    weightNum.className = "range-value";
    weightNum.textContent = symbol.weight;
    weightInput.addEventListener("input", () => {
      const v = Number(weightInput.value);
      weightNum.textContent = v;
      onWeightChange(v);
      updateProbabilities();
    });
    weightField.appendChild(weightInput);
    weightField.appendChild(weightNum);
    row.appendChild(weightField);

    if (payFields) {
      const payWrap = document.createElement("div");
      payWrap.className = "inline-field pay-fields";
      payWrap.innerHTML = `<span>Auszahlung (× Einsatz je Weg)</span>`;
      PAY_COUNTS.forEach((k) => {
        const payLabel = document.createElement("label");
        payLabel.className = "pay-field";
        payLabel.innerHTML = `<span>${k}×</span>`;
        const payInput = document.createElement("input");
        payInput.type = "number";
        payInput.min = "0";
        payInput.step = "0.001";
        payInput.value = symbol.pay[k];
        payInput.className = "mult-input";
        payInput.addEventListener("input", () => {
          const v = Math.max(0, Number(payInput.value) || 0);
          symbol.pay[k] = v;
        });
        payLabel.appendChild(payInput);
        payWrap.appendChild(payLabel);
      });
      row.appendChild(payWrap);
    }

    if (note) {
      const noteEl = document.createElement("span");
      noteEl.className = "inline-field symbol-note";
      noteEl.textContent = note;
      row.appendChild(noteEl);
    }

    const prob = document.createElement("span");
    prob.className = "prob-pill";
    prob.dataset.key = symbol.key;
    row.appendChild(prob);

    return row;
  }

  function render() {
    el.symbolRows.innerHTML = "";
    cfg.symbols.forEach((s) => {
      const row = buildRow(s, {
        onWeightChange: (v) => (s.weight = v),
        payFields: true,
      });
      el.symbolRows.appendChild(row);
    });
    const wildRow = buildRow(cfg.wild, {
      onWeightChange: (v) => (cfg.wild.weight = v),
      payFields: false,
      note: "Wild — ersetzt jedes Zahlsymbol, nur Walze 2–5",
    });
    el.symbolRows.appendChild(wildRow);

    el.scatterRow.innerHTML = "";
    const scatterRow = buildRow(cfg.scatter, {
      onWeightChange: (v) => (cfg.scatter.weight = v),
      payFields: false,
    });
    el.scatterRow.appendChild(scatterRow);

    el.scatterTrigger.value = cfg.scatterTrigger;
    el.coinMinSpins.value = cfg.coinMinSpins;
    el.coinLandChancePct.value = cfg.coinLandChancePct;
    el.bonusWinMult.value = cfg.bonusWinMult;
    el.bigWinMult.value = cfg.bigWinMult;
    el.megaWinMult.value = cfg.megaWinMult;

    updateProbabilities();
  }

  function updateProbabilities() {
    const { middleTotal, avgTotal } = reelTotals();

    cfg.symbols.forEach((s) => {
      const pill = el.symbolRows.querySelector(`.prob-pill[data-key="${s.key}"]`);
      if (pill) pill.textContent = avgTotal > 0 ? `${((s.weight / avgTotal) * 100).toFixed(1)}% Ø pro Feld` : "0%";
    });

    const wildPill = el.symbolRows.querySelector(`.prob-pill[data-key="${cfg.wild.key}"]`);
    if (wildPill) {
      wildPill.textContent = middleTotal > 0 ? `${((cfg.wild.weight / middleTotal) * 100).toFixed(1)}% pro Feld (Walze 2–5)` : "0%";
    }

    const scatterPill = el.scatterRow.querySelector(`.prob-pill[data-key="${cfg.scatter.key}"]`);
    const p = avgTotal > 0 ? cfg.scatter.weight / avgTotal : 0;
    if (scatterPill) scatterPill.textContent = `${(p * 100).toFixed(1)}% Ø pro Feld`;

    const bonusChance = probAtLeast(GRID_CELLS, Number(el.scatterTrigger.value), p);
    el.bonusProb.textContent = `Geschätzte Münzjagd-Chance pro Spin: ${(bonusChance * 100).toFixed(2)}% (≈ 1 von ${(1 / Math.max(bonusChance, 1e-9)).toFixed(0)} Spins) — exakte Werte liefert der Simulator (sim/simulate.js).`;
  }

  // ---------- wiring ----------

  [el.scatterTrigger, el.coinMinSpins, el.coinLandChancePct, el.bonusWinMult, el.bigWinMult, el.megaWinMult].forEach(
    (input) => {
      input.addEventListener("input", updateProbabilities);
    }
  );

  function readFormIntoConfig() {
    cfg.scatterTrigger = Math.max(2, Math.min(GRID_CELLS, Number(el.scatterTrigger.value) || 3));
    cfg.coinMinSpins = Math.max(2, Number(el.coinMinSpins.value) || 2);
    cfg.coinLandChancePct = Math.max(1, Math.min(100, Number(el.coinLandChancePct.value) || 1));
    cfg.bonusWinMult = Math.max(1, Number(el.bonusWinMult.value) || 1);
    cfg.bigWinMult = Math.max(1, Number(el.bigWinMult.value) || 1);
    cfg.megaWinMult = Math.max(cfg.bigWinMult, Number(el.megaWinMult.value) || cfg.bigWinMult);
  }

  function showStatus(text) {
    el.saveStatus.textContent = text;
    el.saveStatus.classList.remove("show");
    // eslint-disable-next-line no-unused-expressions
    el.saveStatus.offsetWidth;
    el.saveStatus.classList.add("show");
    setTimeout(() => el.saveStatus.classList.remove("show"), 1800);
  }

  el.saveBtn.addEventListener("click", () => {
    readFormIntoConfig();
    saveConfig(cfg);
    showStatus("Gespeichert ✓ — im Hauptspiel neu laden");
  });

  el.resetBtn.addEventListener("click", () => {
    resetConfig();
    cfg = window.LuckySpinConfig.cloneDefaults();
    render();
    showStatus("Auf Standard zurückgesetzt");
  });

  render();
})();
