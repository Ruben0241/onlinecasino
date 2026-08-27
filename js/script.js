(() => {
  "use strict";

  const COLS = 6;
  const ROWS = 4;
  const STRIP_LEAD = 16; // random symbols scrolled through before the result lands

  const CFG = window.LuckySpinConfig.loadConfig();

  const SYMBOLS = CFG.symbols;
  const SCATTER = { ...CFG.scatter, scatter: true };
  const POOL = [...SYMBOLS, SCATTER];
  const TOTAL_WEIGHT = POOL.reduce((sum, s) => sum + s.weight, 0);

  const RUN_MULT = { 3: 1, 4: 2.5, 5: 5, 6: 10 };

  const MIN_BET = 20;
  const MAX_BET = 400;
  const BET_STEP = 20;

  const SCATTER_TRIGGER = CFG.scatterTrigger;
  const BONUS_WIN_MULT = CFG.bonusWinMult;

  const BIG_WIN_MULT = CFG.bigWinMult;
  const MEGA_WIN_MULT = CFG.megaWinMult;

  // ---------- coin mode (Hold & Win style bonus) ----------

  const COIN_MIN_SPINS = CFG.coinMinSpins;
  const COIN_LAND_CHANCE = CFG.coinLandChancePct / 100;
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

  function weightedCoinValueMult() {
    let roll = Math.random() * COIN_VALUE_TOTAL_WEIGHT;
    for (const v of COIN_VALUE_TABLE) {
      if (roll < v.weight) return v.mult;
      roll -= v.weight;
    }
    return COIN_VALUE_TABLE[0].mult;
  }

  const state = {
    balance: 1000,
    bet: 40,
    spinning: false,
    grid: [],
    lastWin: 0,
    inBonus: false,
    inCoinMode: false,
    coinGrid: [],
    coinSpinsLeft: 0,
    coinFilled: 0,
    autoSpinsLeft: 0,
  };

  const el = {
    balance: document.getElementById("balanceValue"),
    bet: document.getElementById("betValue"),
    betUp: document.getElementById("betUp"),
    betDown: document.getElementById("betDown"),
    lastWin: document.getElementById("lastWinValue"),
    freeSpinsStat: document.getElementById("freeSpinsStat"),
    freeSpinsValue: document.getElementById("freeSpinsValue"),
    reelWindow: document.getElementById("reelWindow"),
    reelFrame: document.getElementById("reelFrame"),
    message: document.getElementById("messageBar"),
    spinBtn: document.getElementById("spinBtn"),
    spinBtnLabel: document.getElementById("spinBtnLabel"),
    autoBtn: document.getElementById("autoBtn"),
    paytableList: document.getElementById("paytableList"),
    popup: document.getElementById("popup"),
    popupTitle: document.getElementById("popupTitle"),
    popupAmount: document.getElementById("popupAmount"),
    popupSub: document.getElementById("popupSub"),
    confettiCanvas: document.getElementById("confettiCanvas"),
  };

  // ---------- helpers ----------

  function weightedRandomSymbol() {
    let roll = Math.random() * TOTAL_WEIGHT;
    for (const s of POOL) {
      if (roll < s.weight) return s;
      roll -= s.weight;
    }
    return POOL[0];
  }

  function formatNumber(n) {
    return Math.round(n).toLocaleString("de-DE");
  }

  function flash(elm) {
    elm.classList.remove("flash");
    // eslint-disable-next-line no-unused-expressions
    elm.offsetWidth;
    elm.classList.add("flash");
    setTimeout(() => elm.classList.remove("flash"), 400);
  }

  function setMessage(text, kind) {
    el.message.textContent = text;
    el.message.classList.toggle("win-text", kind === "win");
    el.message.classList.toggle("bonus-text", kind === "bonus");
  }

  // ---------- preload ----------

  function preloadImages() {
    return Promise.all(
      POOL.map(
        (s) =>
          new Promise((resolve) => {
            const img = new Image();
            img.onload = resolve;
            img.onerror = resolve;
            img.src = s.img;
          })
      )
    );
  }

  // ---------- build grid DOM ----------

  function makeCell(symbol) {
    const cell = document.createElement("div");
    cell.className = "cell";
    if (symbol.scatter) cell.classList.add("cell-scatter");
    const img = document.createElement("img");
    img.src = symbol.img;
    img.alt = symbol.key;
    img.draggable = false;
    cell.appendChild(img);
    return cell;
  }

  function buildInitialGrid() {
    el.reelWindow.innerHTML = "";
    state.grid = [];
    for (let c = 0; c < COLS; c++) {
      const col = document.createElement("div");
      col.className = "reel-col";
      const strip = document.createElement("div");
      strip.className = "reel-strip";
      const colSymbols = [];
      for (let r = 0; r < ROWS; r++) {
        const sym = SYMBOLS[(c + r) % SYMBOLS.length];
        colSymbols.push(sym);
        strip.appendChild(makeCell(sym));
      }
      col.appendChild(strip);
      el.reelWindow.appendChild(col);
      state.grid.push(colSymbols);
    }
  }

  function buildPaytable() {
    el.paytableList.innerHTML = "";
    [...SYMBOLS].reverse().forEach((s) => {
      const li = document.createElement("li");
      const img = document.createElement("img");
      img.src = s.img;
      img.alt = s.key;
      const mult = document.createElement("span");
      mult.className = "pt-mult";
      mult.textContent = `×${s.mult}`;
      li.appendChild(img);
      li.appendChild(mult);
      el.paytableList.appendChild(li);
    });
    const li = document.createElement("li");
    const img = document.createElement("img");
    img.src = SCATTER.img;
    img.alt = "scatter";
    const label = document.createElement("span");
    label.className = "pt-mult";
    label.textContent = `${SCATTER_TRIGGER}+ = Münzjagd`;
    li.appendChild(img);
    li.appendChild(label);
    el.paytableList.appendChild(li);
  }

  // ---------- spin animation ----------

  function spinColumn(colEl, finalSymbols, duration) {
    return new Promise((resolve) => {
      const strip = colEl.querySelector(".reel-strip");
      const cellHeight = colEl.getBoundingClientRect().height / ROWS;

      strip.style.transition = "none";
      strip.style.filter = "blur(0px)";
      strip.style.transform = "translateY(0)";
      strip.innerHTML = "";

      for (let i = 0; i < STRIP_LEAD; i++) {
        strip.appendChild(makeCell(weightedRandomSymbol()));
      }
      finalSymbols.forEach((sym) => strip.appendChild(makeCell(sym)));

      // force reflow before starting the transition
      // eslint-disable-next-line no-unused-expressions
      strip.offsetHeight;

      strip.style.filter = "blur(4px)";
      strip.style.transition = `transform ${duration}ms cubic-bezier(0.12, 0.85, 0.25, 1), filter ${duration}ms ease-out`;
      strip.style.transform = `translateY(-${STRIP_LEAD * cellHeight}px)`;
      strip.style.filter = "blur(0px)";

      const onEnd = (e) => {
        if (e.propertyName !== "transform") return;
        strip.removeEventListener("transitionend", onEnd);
        colEl.classList.remove("landing");
        // eslint-disable-next-line no-unused-expressions
        colEl.offsetWidth;
        colEl.classList.add("landing");
        setTimeout(() => colEl.classList.remove("landing"), 450);
        resolve(strip);
      };
      strip.addEventListener("transitionend", onEnd);
    });
  }

  async function playSpinAnimation(resultGrid) {
    el.reelFrame.classList.add("spinning");
    const cols = [...el.reelWindow.children];
    const durations = [900, 1150, 1400, 1650, 1900, 2150];
    const promises = cols.map((colEl, c) => spinColumn(colEl, resultGrid[c], durations[c]));
    await Promise.all(promises);
    el.reelFrame.classList.remove("spinning");
  }

  function markWinCells(winningCells) {
    const cols = [...el.reelWindow.children];
    winningCells.forEach(([c, r], i) => {
      const strip = cols[c].querySelector(".reel-strip");
      const visible = [...strip.children].slice(-ROWS);
      const cell = visible[r];
      cell.style.animationDelay = `${(i % 6) * 0.08}s`;
      cell.classList.add("cell-win");
    });
  }

  function shakeMachine(mega) {
    const cls = mega ? "shake-mega" : "shake";
    document.querySelector(".machine").classList.remove("shake", "shake-mega");
    // eslint-disable-next-line no-unused-expressions
    document.querySelector(".machine").offsetWidth;
    document.querySelector(".machine").classList.add(cls);
    setTimeout(() => document.querySelector(".machine").classList.remove(cls), mega ? 1500 : 550);
  }

  // ---------- paylines (horizontal, vertical, diagonal, zigzag) ----------

  function buildPaylines() {
    const lines = [];

    // horizontal — one per row
    for (let r = 0; r < ROWS; r++) {
      const cells = [];
      for (let c = 0; c < COLS; c++) cells.push([c, r]);
      lines.push(cells);
    }

    // vertical — one per column
    for (let c = 0; c < COLS; c++) {
      const cells = [];
      for (let r = 0; r < ROWS; r++) cells.push([c, r]);
      lines.push(cells);
    }

    // diagonals (down-right and down-left), length = ROWS
    for (let startCol = 0; startCol <= COLS - ROWS; startCol++) {
      const down = [];
      const up = [];
      for (let r = 0; r < ROWS; r++) {
        down.push([startCol + r, r]);
        up.push([startCol + r, ROWS - 1 - r]);
      }
      lines.push(down);
      lines.push(up);
    }

    // zigzag paylines across all reels (classic V / W patterns)
    const zigzagPatterns = [
      [0, 1, 2, 3, 2, 1],
      [3, 2, 1, 0, 1, 2],
      [1, 0, 1, 0, 1, 0],
      [2, 3, 2, 3, 2, 3],
      [0, 0, 1, 2, 3, 3],
      [3, 3, 2, 1, 0, 0],
    ];
    zigzagPatterns.forEach((pattern) => {
      lines.push(pattern.map((r, c) => [c, r]));
    });

    return lines;
  }

  const PAYLINES = buildPaylines();

  // ---------- win evaluation ----------

  function evaluateGrid(resultGrid) {
    let totalWin = 0;
    let winLineCount = 0;
    const winCellMap = new Map();
    const lineBet = state.bet / PAYLINES.length;

    PAYLINES.forEach((cells) => {
      const [c0, r0] = cells[0];
      const first = resultGrid[c0][r0];
      if (first.scatter) return;
      let run = 1;
      while (run < cells.length) {
        const [c, r] = cells[run];
        if (resultGrid[c][r].key !== first.key) break;
        run++;
      }
      if (run >= 3) {
        const win = lineBet * first.mult * RUN_MULT[run];
        totalWin += win;
        winLineCount++;
        for (let i = 0; i < run; i++) {
          const [c, r] = cells[i];
          winCellMap.set(`${c},${r}`, [c, r]);
        }
      }
    });

    let scatterCount = 0;
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        if (resultGrid[c][r].scatter) scatterCount++;
      }
    }

    return { totalWin, winLineCount, winningCells: [...winCellMap.values()], scatterCount };
  }

  // ---------- coin mode grid ----------

  function makeCoinCell(c, r) {
    const cell = document.createElement("div");
    cell.className = "coin-cell";
    cell.dataset.c = c;
    cell.dataset.r = r;
    const coin = state.coinGrid[c][r];
    if (coin) applyCoinFace(cell, coin);
    return cell;
  }

  function applyCoinFace(cell, coin) {
    cell.classList.add("locked");
    cell.innerHTML = "";
    const face = document.createElement("div");
    face.className = "coin-face" + (coin.rare ? " coin-rare" : "");
    const amount = document.createElement("span");
    amount.className = "coin-amount";
    amount.textContent = formatNumber(coin.value);
    face.appendChild(amount);
    if (coin.rare) {
      const badge = document.createElement("span");
      badge.className = "coin-badge";
      badge.textContent = `×${coin.rare}`;
      face.appendChild(badge);
    }
    cell.appendChild(face);
  }

  function renderCoinGrid() {
    el.reelWindow.innerHTML = "";
    for (let c = 0; c < COLS; c++) {
      const col = document.createElement("div");
      col.className = "coin-col";
      for (let r = 0; r < ROWS; r++) {
        col.appendChild(makeCoinCell(c, r));
      }
      el.reelWindow.appendChild(col);
    }
  }

  function playCoinReveal(newlyLanded) {
    return new Promise((resolve) => {
      const cols = [...el.reelWindow.children];
      const landedSet = new Set(newlyLanded.map(([c, r]) => `${c},${r}`));

      for (let c = 0; c < COLS; c++) {
        for (let r = 0; r < ROWS; r++) {
          const key = `${c},${r}`;
          if (state.coinGrid[c][r] && !landedSet.has(key)) continue; // already-locked coin, leave it
          cols[c].children[r].classList.add("spin-flicker");
        }
      }

      setTimeout(() => {
        for (let c = 0; c < COLS; c++) {
          for (let r = 0; r < ROWS; r++) {
            const key = `${c},${r}`;
            const cell = cols[c].children[r];
            cell.classList.remove("spin-flicker");
            if (landedSet.has(key)) {
              applyCoinFace(cell, state.coinGrid[c][r]);
              cell.classList.add("just-landed");
              setTimeout(() => cell.classList.remove("just-landed"), 700);
            }
          }
        }
        resolve();
      }, 550);
    });
  }

  async function coinModeSpin() {
    state.spinning = true;
    setControlsEnabled(false);
    setMessage(`Münzjagd läuft… Spins übrig: ${state.coinSpinsLeft}`, "bonus");

    const newlyLanded = [];
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        if (state.coinGrid[c][r]) continue;
        if (Math.random() < COIN_LAND_CHANCE) {
          const mult = weightedCoinValueMult();
          const rare = Math.random() < COIN_RARE_CHANCE
            ? COIN_RARE_MULTS[Math.floor(Math.random() * COIN_RARE_MULTS.length)]
            : null;
          const value = state.bet * mult * (rare || 1) * BONUS_WIN_MULT;
          state.coinGrid[c][r] = { mult, rare, value };
          newlyLanded.push([c, r]);
        }
      }
    }

    await playCoinReveal(newlyLanded);
    state.coinFilled += newlyLanded.length;

    if (newlyLanded.length > 0) {
      state.coinSpinsLeft = COIN_MIN_SPINS;
      shakeMachine(newlyLanded.length >= 3);
    } else {
      state.coinSpinsLeft -= 1;
    }
    el.freeSpinsValue.textContent = Math.max(0, state.coinSpinsLeft);

    const gridFull = state.coinFilled >= COLS * ROWS;

    if (gridFull || state.coinSpinsLeft <= 0) {
      await finishCoinMode(gridFull);
      return;
    }

    setMessage(`Münzjagd läuft… Spins übrig: ${state.coinSpinsLeft}`, "bonus");
    state.spinning = false;
    setTimeout(spin, 850);
  }

  async function finishCoinMode(gridFull) {
    let total = 0;
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        const coin = state.coinGrid[c][r];
        if (coin) total += coin.value;
      }
    }

    state.balance += total;
    el.balance.textContent = formatNumber(state.balance);
    flash(el.balance);
    state.lastWin = total;
    el.lastWin.textContent = formatNumber(total);
    flash(el.lastWin);

    state.spinning = false;

    if (gridFull) {
      shakeMachine(true);
      await showPopup("GITTER VOLL!", total, "Alle Felder gefüllt — Jackpot!", 260, true);
    } else {
      await showPopup("MÜNZJAGD BEENDET", total, "Gesamtgewinn der Münzjagd", 180, total >= state.bet * BIG_WIN_MULT);
    }

    state.inBonus = false;
    state.inCoinMode = false;
    state.coinGrid = [];
    el.freeSpinsStat.hidden = true;
    buildInitialGrid();
    setMessage("Zurück im Hauptspiel. Viel Glück!", null);
    setControlsEnabled(true);
  }

  // ---------- confetti ----------

  const ctx = el.confettiCanvas.getContext("2d");
  let confettiParticles = [];
  let confettiRAF = null;
  const CONFETTI_COLORS = ["#dcaa4e", "#4ade80", "#5eb1ff", "#ff6b81", "#f2f1ee"];

  function resizeCanvas() {
    el.confettiCanvas.width = window.innerWidth;
    el.confettiCanvas.height = window.innerHeight;
  }
  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();

  function burstConfetti(amount) {
    const w = el.confettiCanvas.width;
    for (let i = 0; i < amount; i++) {
      confettiParticles.push({
        shape: "rect",
        x: Math.random() * w,
        y: -20 - Math.random() * 200,
        vx: (Math.random() - 0.5) * 6,
        vy: 2 + Math.random() * 4,
        size: 5 + Math.random() * 6,
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        rotation: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.3,
        life: 0,
      });
    }
    if (!confettiRAF) confettiLoop();
  }

  function burstCoins(amount) {
    const w = el.confettiCanvas.width;
    for (let i = 0; i < amount; i++) {
      confettiParticles.push({
        shape: "coin",
        x: Math.random() * w,
        y: -30 - Math.random() * 400,
        vx: (Math.random() - 0.5) * 3,
        vy: 3 + Math.random() * 5,
        size: 10 + Math.random() * 8,
        rotation: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.5,
        life: 0,
      });
    }
    if (!confettiRAF) confettiLoop();
  }

  function confettiLoop() {
    ctx.clearRect(0, 0, el.confettiCanvas.width, el.confettiCanvas.height);
    const h = el.confettiCanvas.height;
    confettiParticles.forEach((p) => {
      p.vy += 0.05;
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.vr;
      p.life++;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      if (p.shape === "coin") {
        const squash = Math.max(0.15, Math.abs(Math.cos(p.rotation)));
        const grad = ctx.createRadialGradient(0, 0, 1, 0, 0, p.size);
        grad.addColorStop(0, "#fff3cf");
        grad.addColorStop(0.5, "#dcaa4e");
        grad.addColorStop(1, "#8a6420");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(0, 0, p.size * squash, p.size, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#fff3cf";
        ctx.lineWidth = 1;
        ctx.stroke();
      } else {
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      }
      ctx.restore();
    });
    confettiParticles = confettiParticles.filter((p) => p.y < h + 40);
    if (confettiParticles.length > 0) {
      confettiRAF = requestAnimationFrame(confettiLoop);
    } else {
      confettiRAF = null;
    }
  }

  // ---------- popup ----------

  function showPopup(title, amount, sub, confettiAmount, mega) {
    el.popupTitle.textContent = title;
    el.popupSub.textContent = sub || "";
    el.popupAmount.textContent = "0";
    el.popup.classList.toggle("mega", !!mega);
    el.popup.classList.add("show");
    burstConfetti(confettiAmount);
    if (mega) {
      burstCoins(70);
      shakeMachine(true);
    }

    const duration = 900;
    const start = performance.now();
    function tick(now) {
      const p = Math.min(1, (now - start) / duration);
      el.popupAmount.textContent = formatNumber(amount * p);
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);

    return new Promise((resolve) => {
      const dismiss = () => {
        el.popup.classList.remove("show");
        el.popup.removeEventListener("click", dismiss);
        resolve();
      };
      el.popup.addEventListener("click", dismiss);
      setTimeout(dismiss, 2600);
    });
  }

  // ---------- spin flow ----------

  function setControlsEnabled(enabled) {
    el.spinBtn.disabled = !enabled || state.inBonus;
    el.betUp.disabled = !enabled || state.inBonus;
    el.betDown.disabled = !enabled || state.inBonus;
    el.autoBtn.disabled = !enabled || state.inBonus;
  }

  async function spin() {
    if (state.spinning) return;

    if (state.inCoinMode) {
      await coinModeSpin();
      return;
    }

    if (!state.inBonus && state.balance < state.bet) {
      setMessage("Nicht genug Guthaben. Einsatz verringern.", null);
      stopAutoSpin();
      return;
    }

    state.spinning = true;
    setControlsEnabled(false);
    el.reelWindow.querySelectorAll(".cell-win").forEach((c) => c.classList.remove("cell-win"));

    const prev = state.balance;
    state.balance -= state.bet;
    el.balance.textContent = formatNumber(state.balance);
    flash(el.balance);
    setMessage("Viel Glück!", null);

    const resultGrid = [];
    for (let c = 0; c < COLS; c++) {
      const colSymbols = [];
      for (let r = 0; r < ROWS; r++) colSymbols.push(weightedRandomSymbol());
      resultGrid.push(colSymbols);
    }

    await playSpinAnimation(resultGrid);
    state.grid = resultGrid;

    const { totalWin, winLineCount, winningCells, scatterCount } = evaluateGrid(resultGrid);
    const appliedWin = totalWin;

    if (appliedWin > 0) {
      markWinCells(winningCells);
      state.balance += appliedWin;
      el.balance.textContent = formatNumber(state.balance);
      flash(el.balance);
    }

    state.lastWin = appliedWin;
    el.lastWin.textContent = formatNumber(appliedWin);
    if (appliedWin > 0) flash(el.lastWin);

    const triggered = scatterCount >= SCATTER_TRIGGER;

    if (appliedWin >= state.bet * MEGA_WIN_MULT) {
      setMessage("MEGA GEWINN!", "win");
      await showPopup("MEGA GEWINN!", appliedWin, "Unglaublich!", 220, true);
    } else if (appliedWin >= state.bet * BIG_WIN_MULT) {
      setMessage("Großer Gewinn!", "win");
      shakeMachine(false);
      await showPopup("GROSSER GEWINN!", appliedWin, "", 130);
    } else if (appliedWin > 0) {
      if (winLineCount > 1) {
        setMessage(`${winLineCount}x KOMBI-GEWINN! +${formatNumber(appliedWin)} Coins`, "win");
        if (winLineCount >= 3) shakeMachine(false);
      } else {
        setMessage(`Gewinn: +${formatNumber(appliedWin)} Coins`, "win");
      }
    } else if (!triggered) {
      setMessage("Kein Treffer — nochmal versuchen!", null);
    }

    if (triggered) {
      state.inBonus = true;
      state.inCoinMode = true;
      state.coinGrid = Array.from({ length: COLS }, () => Array(ROWS).fill(null));
      state.coinSpinsLeft = COIN_MIN_SPINS;
      state.coinFilled = 0;
      el.freeSpinsStat.hidden = false;
      el.freeSpinsValue.textContent = state.coinSpinsLeft;
      renderCoinGrid();
      await showPopup("MÜNZJAGD!", COIN_MIN_SPINS, "Sammle Münzen — jede neue Münze verlängert die Runde!", 180, true);
      setMessage(`Münzjagd gestartet! Spins übrig: ${state.coinSpinsLeft}`, "bonus");
      state.spinning = false;
      setTimeout(spin, 850);
      return;
    }

    state.spinning = false;
    setControlsEnabled(true);

    if (state.autoSpinsLeft > 0) {
      state.autoSpinsLeft -= 1;
      if (state.autoSpinsLeft > 0 && state.balance >= state.bet) {
        setTimeout(spin, 500);
      } else {
        stopAutoSpin();
      }
    }
  }

  function stopAutoSpin() {
    state.autoSpinsLeft = 0;
    el.autoBtn.classList.remove("active");
    el.autoBtn.textContent = "Auto x10";
  }

  function toggleAutoSpin() {
    if (state.autoSpinsLeft > 0) {
      stopAutoSpin();
      return;
    }
    state.autoSpinsLeft = 10;
    el.autoBtn.classList.add("active");
    el.autoBtn.textContent = "Stop";
    if (!state.spinning) spin();
  }

  // ---------- wiring ----------

  el.betUp.addEventListener("click", () => {
    if (state.spinning || state.inBonus) return;
    state.bet = Math.min(MAX_BET, state.bet + BET_STEP);
    el.bet.textContent = state.bet;
  });

  el.betDown.addEventListener("click", () => {
    if (state.spinning || state.inBonus) return;
    state.bet = Math.max(MIN_BET, state.bet - BET_STEP);
    el.bet.textContent = state.bet;
  });

  el.spinBtn.addEventListener("click", spin);
  el.autoBtn.addEventListener("click", toggleAutoSpin);

  document.addEventListener("keydown", (e) => {
    if (e.code === "Space" && !state.spinning && !state.inBonus) {
      e.preventDefault();
      spin();
    }
  });

  // ---------- init ----------

  buildInitialGrid();
  buildPaytable();
  el.balance.textContent = formatNumber(state.balance);
  el.bet.textContent = state.bet;
  el.lastWin.textContent = "0";

  preloadImages().then(() => {
    el.spinBtnLabel.textContent = "SPIN";
    setControlsEnabled(true);
  });
})();
