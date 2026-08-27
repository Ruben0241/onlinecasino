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
  const FREE_SPINS_AWARD = CFG.freeSpinsAward;
  const FREE_SPINS_RETRIGGER = CFG.freeSpinsRetrigger;
  const BONUS_WIN_MULT = CFG.bonusWinMult;

  const BIG_WIN_MULT = CFG.bigWinMult;
  const MEGA_WIN_MULT = CFG.megaWinMult;

  const state = {
    balance: 1000,
    bet: 40,
    spinning: false,
    grid: [],
    lastWin: 0,
    inBonus: false,
    freeSpinsLeft: 0,
    freeSpinsTotal: 0,
    bonusTotalWin: 0,
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
    label.textContent = `${SCATTER_TRIGGER}+ = Freispiele`;
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
        resolve(strip);
      };
      strip.addEventListener("transitionend", onEnd);
    });
  }

  async function playSpinAnimation(resultGrid) {
    const cols = [...el.reelWindow.children];
    const durations = [900, 1150, 1400, 1650, 1900, 2150];
    const promises = cols.map((colEl, c) => spinColumn(colEl, resultGrid[c], durations[c]));
    return Promise.all(promises);
  }

  function markWinCells(winningCells) {
    const cols = [...el.reelWindow.children];
    winningCells.forEach(([c, r]) => {
      const strip = cols[c].querySelector(".reel-strip");
      const visible = [...strip.children].slice(-ROWS);
      visible[r].classList.add("cell-win");
    });
  }

  // ---------- win evaluation ----------

  function evaluateGrid(resultGrid) {
    let totalWin = 0;
    const winningCells = [];

    for (let r = 0; r < ROWS; r++) {
      const first = resultGrid[0][r];
      if (first.scatter) continue;
      let run = 1;
      while (run < COLS && resultGrid[run][r].key === first.key) run++;
      if (run >= 3) {
        const lineBet = state.bet / ROWS;
        const win = lineBet * first.mult * RUN_MULT[run];
        totalWin += win;
        for (let c = 0; c < run; c++) winningCells.push([c, r]);
      }
    }

    let scatterCount = 0;
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        if (resultGrid[c][r].scatter) scatterCount++;
      }
    }

    return { totalWin, winningCells, scatterCount };
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
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
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

  function showPopup(title, amount, sub, confettiAmount) {
    el.popupTitle.textContent = title;
    el.popupSub.textContent = sub || "";
    el.popupAmount.textContent = "0";
    el.popup.classList.add("show");
    burstConfetti(confettiAmount);

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
    if (!state.inBonus && state.balance < state.bet) {
      setMessage("Nicht genug Guthaben. Einsatz verringern.", null);
      stopAutoSpin();
      return;
    }

    state.spinning = true;
    setControlsEnabled(false);
    el.reelWindow.querySelectorAll(".cell-win").forEach((c) => c.classList.remove("cell-win"));

    if (state.inBonus) {
      setMessage(`Freispiel läuft… (${state.freeSpinsTotal - state.freeSpinsLeft + 1}/${state.freeSpinsTotal})`, "bonus");
    } else {
      const prev = state.balance;
      state.balance -= state.bet;
      el.balance.textContent = formatNumber(state.balance);
      flash(el.balance);
      setMessage("Viel Glück!", null);
    }

    const resultGrid = [];
    for (let c = 0; c < COLS; c++) {
      const colSymbols = [];
      for (let r = 0; r < ROWS; r++) colSymbols.push(weightedRandomSymbol());
      resultGrid.push(colSymbols);
    }

    await playSpinAnimation(resultGrid);
    state.grid = resultGrid;

    const { totalWin, winningCells, scatterCount } = evaluateGrid(resultGrid);
    const appliedWin = state.inBonus ? totalWin * BONUS_WIN_MULT : totalWin;

    if (appliedWin > 0) {
      markWinCells(winningCells);
      state.balance += appliedWin;
      el.balance.textContent = formatNumber(state.balance);
      flash(el.balance);
    }

    state.lastWin = appliedWin;
    el.lastWin.textContent = formatNumber(appliedWin);
    if (appliedWin > 0) flash(el.lastWin);

    if (state.inBonus) state.bonusTotalWin += appliedWin;

    const triggered = scatterCount >= SCATTER_TRIGGER;

    if (appliedWin >= state.bet * MEGA_WIN_MULT) {
      setMessage("MEGA GEWINN!", "win");
      await showPopup("MEGA GEWINN!", appliedWin, "Unglaublich!", 220);
    } else if (appliedWin >= state.bet * BIG_WIN_MULT) {
      setMessage("Großer Gewinn!", "win");
      await showPopup("GROSSER GEWINN!", appliedWin, "", 130);
    } else if (appliedWin > 0) {
      setMessage(`Gewinn: +${formatNumber(appliedWin)} Coins`, "win");
    } else if (!state.inBonus && !triggered) {
      setMessage("Kein Treffer — nochmal versuchen!", null);
    }

    if (triggered) {
      if (!state.inBonus) {
        state.inBonus = true;
        state.freeSpinsLeft = FREE_SPINS_AWARD;
        state.freeSpinsTotal = FREE_SPINS_AWARD;
        state.bonusTotalWin = appliedWin;
        el.freeSpinsStat.hidden = false;
        el.freeSpinsValue.textContent = state.freeSpinsLeft;
        await showPopup("FREISPIELE!", FREE_SPINS_AWARD, "Gewinne zählen doppelt", 180);
        setMessage(`Freispiele gestartet: ${FREE_SPINS_AWARD}`, "bonus");
      } else {
        state.freeSpinsLeft += FREE_SPINS_RETRIGGER;
        state.freeSpinsTotal += FREE_SPINS_RETRIGGER;
        await showPopup("+FREISPIELE!", FREE_SPINS_RETRIGGER, "Erneut ausgelöst", 130);
      }
    }

    if (state.inBonus) {
      state.freeSpinsLeft -= 1;
      el.freeSpinsValue.textContent = Math.max(0, state.freeSpinsLeft);

      if (state.freeSpinsLeft <= 0) {
        const finishedWin = state.bonusTotalWin;
        state.spinning = false;
        await showPopup("BONUS BEENDET", finishedWin, "Gesamtgewinn der Freispiele", 200);
        state.inBonus = false;
        el.freeSpinsStat.hidden = true;
        setMessage("Zurück im Hauptspiel. Viel Glück!", null);
        setControlsEnabled(true);
        return;
      }

      state.spinning = false;
      setTimeout(spin, 750);
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
