(() => {
  "use strict";

  const GRID_CELLS = 24; // 6 columns x 4 rows, mirrors script.js

  const { loadConfig, saveConfig, resetConfig, DEFAULT_CONFIG } = window.LuckySpinConfig;
  let cfg = loadConfig();

  const el = {
    symbolRows: document.getElementById("symbolRows"),
    scatterRow: document.getElementById("scatterRow"),
    scatterTrigger: document.getElementById("scatterTrigger"),
    freeSpinsAward: document.getElementById("freeSpinsAward"),
    freeSpinsRetrigger: document.getElementById("freeSpinsRetrigger"),
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

  function totalWeight() {
    return cfg.symbols.reduce((sum, s) => sum + s.weight, 0) + cfg.scatter.weight;
  }

  // ---------- row builders ----------

  function buildRow(symbol, onWeightChange, onMultChange) {
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
    weightInput.max = "50";
    weightInput.step = "1";
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

    if (onMultChange) {
      const multField = document.createElement("label");
      multField.className = "inline-field";
      multField.innerHTML = `<span>Auszahlung ×</span>`;
      const multInput = document.createElement("input");
      multInput.type = "number";
      multInput.min = "1";
      multInput.max = "200";
      multInput.step = "1";
      multInput.value = symbol.mult;
      multInput.className = "mult-input";
      multInput.addEventListener("input", () => {
        const v = Math.max(1, Number(multInput.value) || 1);
        onMultChange(v);
      });
      multField.appendChild(multInput);
      row.appendChild(multField);
    }

    const prob = document.createElement("span");
    prob.className = "prob-pill";
    prob.dataset.key = symbol.key;
    row.appendChild(prob);

    return row;
  }

  function render() {
    el.symbolRows.innerHTML = "";
    cfg.symbols.forEach((s, idx) => {
      const row = buildRow(
        s,
        (v) => (cfg.symbols[idx].weight = v),
        (v) => (cfg.symbols[idx].mult = v)
      );
      el.symbolRows.appendChild(row);
    });

    el.scatterRow.innerHTML = "";
    const scatterRow = buildRow(cfg.scatter, (v) => (cfg.scatter.weight = v), null);
    el.scatterRow.appendChild(scatterRow);

    el.scatterTrigger.value = cfg.scatterTrigger;
    el.freeSpinsAward.value = cfg.freeSpinsAward;
    el.freeSpinsRetrigger.value = cfg.freeSpinsRetrigger;
    el.bonusWinMult.value = cfg.bonusWinMult;
    el.bigWinMult.value = cfg.bigWinMult;
    el.megaWinMult.value = cfg.megaWinMult;

    updateProbabilities();
  }

  function updateProbabilities() {
    const total = totalWeight();
    cfg.symbols.forEach((s) => {
      const pill = el.symbolRows.querySelector(`.prob-pill[data-key="${s.key}"]`);
      if (pill) pill.textContent = total > 0 ? `${((s.weight / total) * 100).toFixed(1)}% pro Feld` : "0%";
    });
    const scatterPill = el.scatterRow.querySelector(`.prob-pill[data-key="${cfg.scatter.key}"]`);
    const p = total > 0 ? cfg.scatter.weight / total : 0;
    if (scatterPill) scatterPill.textContent = `${(p * 100).toFixed(1)}% pro Feld`;

    const bonusChance = probAtLeast(GRID_CELLS, Number(el.scatterTrigger.value), p);
    el.bonusProb.textContent = `Geschätzte Freispiel-Chance pro Spin: ${(bonusChance * 100).toFixed(2)}%`;
  }

  // ---------- wiring ----------

  [el.scatterTrigger, el.freeSpinsAward, el.freeSpinsRetrigger, el.bonusWinMult, el.bigWinMult, el.megaWinMult].forEach(
    (input) => {
      input.addEventListener("input", updateProbabilities);
    }
  );

  function readFormIntoConfig() {
    cfg.scatterTrigger = Math.max(2, Math.min(GRID_CELLS, Number(el.scatterTrigger.value) || 3));
    cfg.freeSpinsAward = Math.max(1, Number(el.freeSpinsAward.value) || 1);
    cfg.freeSpinsRetrigger = Math.max(0, Number(el.freeSpinsRetrigger.value) || 0);
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
    showStatus("Gespeichert ✓");
  });

  el.resetBtn.addEventListener("click", () => {
    resetConfig();
    cfg = window.LuckySpinConfig.cloneDefaults();
    render();
    showStatus("Auf Standard zurückgesetzt");
  });

  render();
})();
