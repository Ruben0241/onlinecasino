(() => {
  "use strict";

  const Engine = window.LuckySpinEngine;
  const CFG = window.LuckySpinConfig.loadConfig();
  const Audio = window.LuckySpinAudio || null;

  // Every Audio.* call below is guarded so a missing/broken audio module
  // never breaks the game — spins and wins work identically without sound.
  function safeAudio(fn) {
    if (!Audio) return;
    try {
      fn(Audio);
    } catch (e) {
      /* audio must never break gameplay */
    }
  }

  const COLS = CFG.cols;
  const ROWS = CFG.rows;
  const STRIP_LEAD = 16; // random symbols scrolled through before the result lands

  const SYMBOLS = CFG.symbols;
  const WILD = Engine.enrichedWild(CFG);
  const SCATTER = Engine.enrichedScatter(CFG);
  const POOL = [...SYMBOLS, WILD, SCATTER];
  const REEL_POOLS = Engine.buildReelPools(CFG);

  const MIN_BET = 20;
  const MAX_BET = 400;
  const BET_STEP = 20;

  const SCATTER_TRIGGER = CFG.scatterTrigger;

  const BIG_WIN_MULT = CFG.bigWinMult;
  const MEGA_WIN_MULT = CFG.megaWinMult;

  // ---------- coin mode (Hold & Win style bonus) ----------

  const COIN_MIN_SPINS = CFG.coinMinSpins;

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
    fastMode: false,
  };

  // scales a millisecond duration down when fast mode is active
  function ms(v) {
    return state.fastMode ? Math.round(v * 0.35) : v;
  }

  function sleep(v) {
    return new Promise((resolve) => setTimeout(resolve, v));
  }

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
    fastBtn: document.getElementById("fastBtn"),
    machineWrap: document.querySelector(".machine-wrap"),
    lever: document.getElementById("leverBtn"),
    leverRod: document.getElementById("leverRod"),
    paytableList: document.getElementById("paytableList"),
    popup: document.getElementById("popup"),
    popupTitle: document.getElementById("popupTitle"),
    popupAmount: document.getElementById("popupAmount"),
    popupSub: document.getElementById("popupSub"),
    confettiCanvas: document.getElementById("confettiCanvas"),
    testBanner: document.getElementById("testBanner"),
    muteBtn: document.getElementById("muteBtn"),
  };

  // ---------- helpers ----------

  function randomSymbolForReel(c) {
    return Engine.drawFromPool(REEL_POOLS[c], Math.random);
  }

  function formatNumber(n) {
    return Math.round(n).toLocaleString("de-DE");
  }

  function formatMult(n) {
    return n.toLocaleString("de-DE", { minimumFractionDigits: n < 1 ? 3 : 0, maximumFractionDigits: 3 });
  }

  function flash(elm, big) {
    elm.classList.remove("flash", "flash-big");
    elm.style.animationDuration = "";
    // eslint-disable-next-line no-unused-expressions
    elm.offsetWidth;
    const duration = ms(big ? 750 : 500);
    elm.style.setProperty("--pop-scale", big ? "2" : "1.5");
    elm.style.animationDuration = `${duration}ms`;
    elm.classList.add("flash");
    if (big) elm.classList.add("flash-big");
    setTimeout(() => elm.classList.remove("flash", "flash-big"), duration);
  }

  // animates an element's number counting from `from` up to `to`
  const countAnimGen = new WeakMap();
  function animateCount(elm, from, to, duration) {
    const gen = (countAnimGen.get(elm) || 0) + 1;
    countAnimGen.set(elm, gen);
    if (duration <= 0 || from === to) {
      elm.textContent = formatNumber(to);
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const start = performance.now();
      function tick(now) {
        if (countAnimGen.get(elm) !== gen) return; // superseded by a newer count
        const p = Math.max(0, Math.min(1, (now - start) / duration));
        const eased = 1 - Math.pow(1 - p, 3);
        elm.textContent = formatNumber(from + (to - from) * eased);
        safeAudio((A) => A.playCountTick(p));
        if (p < 1) {
          requestAnimationFrame(tick);
        } else {
          resolve();
        }
      }
      requestAnimationFrame(tick);
    });
  }

  // pops the element and animates its number counting up to `to`; bigger/slower for big wins
  function popAndCount(elm, from, to, big) {
    flash(elm, big);
    animateCount(elm, from, to, ms(big ? 900 : 280));
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
    if (symbol.wild) cell.classList.add("cell-wild");
    if (symbol.top) cell.classList.add("cell-top");
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

    function payRow(symbol, labelText) {
      const li = document.createElement("li");
      const img = document.createElement("img");
      img.src = symbol.img;
      img.alt = symbol.key;
      li.appendChild(img);
      if (labelText) {
        const label = document.createElement("span");
        label.className = "pt-mult";
        label.textContent = labelText;
        li.appendChild(label);
      } else {
        const pays = document.createElement("div");
        pays.className = "pt-pays";
        [3, 4, 5, 6].forEach((k) => {
          const cell = document.createElement("span");
          cell.className = "pt-pay-cell";
          cell.innerHTML = `<b>${k}×</b>${formatMult(symbol.pay[k])}`;
          pays.appendChild(cell);
        });
        li.appendChild(pays);
      }
      el.paytableList.appendChild(li);
    }

    [...SYMBOLS].reverse().forEach((s) => payRow(s));
    payRow(WILD, "Ersetzt jedes Zahlsymbol (Walze 2–5)");
    payRow(SCATTER, `${SCATTER_TRIGGER}+ irgendwo = Münzjagd`);
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

      const colIndex = [...el.reelWindow.children].indexOf(colEl);
      for (let i = 0; i < STRIP_LEAD; i++) {
        strip.appendChild(makeCell(randomSymbolForReel(colIndex)));
      }
      finalSymbols.forEach((sym) => strip.appendChild(makeCell(sym)));

      // force reflow before starting the transition
      // eslint-disable-next-line no-unused-expressions
      strip.offsetHeight;

      strip.style.filter = "blur(4px)";
      strip.style.transition = `transform ${duration}ms cubic-bezier(0.12, 0.85, 0.25, 1), filter ${duration}ms ease-out`;
      strip.style.transform = `translateY(-${STRIP_LEAD * cellHeight}px)`;
      strip.style.filter = "blur(0px)";

      // F2 fix: transitionend can be swallowed (tab switch, background app,
      // device rotation, a second spin firing mid-animation) which used to
      // leave this promise open forever and freeze every control. A timeout
      // fallback guarantees it always resolves.
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(fallbackTimer);
        strip.removeEventListener("transitionend", onEnd);
        colEl.classList.remove("landing");
        // eslint-disable-next-line no-unused-expressions
        colEl.offsetWidth;
        colEl.classList.add("landing");
        setTimeout(() => colEl.classList.remove("landing"), ms(450));
        safeAudio((A) => A.playReelStop(colIndex));
        resolve(strip);
      };
      const onEnd = (e) => {
        if (e.propertyName !== "transform") return;
        finish();
      };
      strip.addEventListener("transitionend", onEnd);
      const fallbackTimer = setTimeout(finish, duration + 300);
    });
  }

  async function playSpinAnimation(resultGrid) {
    el.reelFrame.classList.add("spinning");
    const cols = [...el.reelWindow.children];
    const durations = [900, 1150, 1400, 1650, 1900, 2150].map(ms);
    safeAudio((A) => A.startSpinLoop(durations[durations.length - 1]));
    const promises = cols.map((colEl, c) => spinColumn(colEl, resultGrid[c], durations[c]));
    await Promise.all(promises);
    safeAudio((A) => A.stopSpinLoop());
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
    setTimeout(() => document.querySelector(".machine").classList.remove(cls), ms(mega ? 1500 : 550));
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

  function buildCoinFaceEl(coin) {
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
    return face;
  }

  function applyCoinFace(cell, coin) {
    cell.classList.add("locked");
    cell.innerHTML = "";
    cell.appendChild(buildCoinFaceEl(coin));
  }

  function makeGhostSlot() {
    const slot = document.createElement("div");
    slot.className = "coin-slot";
    const face = document.createElement("div");
    face.className = "coin-face coin-ghost";
    slot.appendChild(face);
    return slot;
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

  // spins a single coin cell like a tiny reel: blurred ghost coins fall past from above,
  // then it settles on the final result (a locked coin, or empty if it didn't land).
  const GHOST_COUNT = 5;
  function spinCoinCell(cellEl, finalCoin, duration) {
    return new Promise((resolve) => {
      const strip = document.createElement("div");
      strip.className = "coin-strip";

      const finalSlot = document.createElement("div");
      finalSlot.className = "coin-slot";
      if (finalCoin) finalSlot.appendChild(buildCoinFaceEl(finalCoin));
      strip.appendChild(finalSlot);
      for (let i = 0; i < GHOST_COUNT; i++) strip.appendChild(makeGhostSlot());

      cellEl.classList.remove("locked");
      cellEl.innerHTML = "";
      cellEl.appendChild(strip);

      strip.style.transition = "none";
      strip.style.filter = "blur(0px)";
      strip.style.transform = `translateY(-${GHOST_COUNT * 100}%)`;

      // force reflow before starting the transition
      // eslint-disable-next-line no-unused-expressions
      strip.offsetHeight;

      strip.style.filter = "blur(3px)";
      strip.style.transition = `transform ${duration}ms cubic-bezier(0.22, 0.85, 0.3, 1), filter ${duration}ms ease-out`;
      strip.style.transform = "translateY(0)";
      strip.style.filter = "blur(0px)";

      // F2 fix: same timeout fallback as spinColumn — never leave a coin
      // cell (and thus the whole bonus round) stuck on a swallowed event.
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(fallbackTimer);
        strip.removeEventListener("transitionend", onEnd);
        cellEl.innerHTML = "";
        if (finalCoin) applyCoinFace(cellEl, finalCoin);
        resolve();
      };
      const onEnd = (e) => {
        if (e.propertyName !== "transform") return;
        finish();
      };
      strip.addEventListener("transitionend", onEnd);
      const fallbackTimer = setTimeout(finish, duration + 300);
    });
  }

  function playCoinReveal(newlyLanded) {
    const cols = [...el.reelWindow.children];
    const landedMap = new Map(newlyLanded.map(([c, r, coin]) => [`${c},${r}`, coin]));
    const jobs = [];

    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        const key = `${c},${r}`;
        const wasLocked = state.coinGrid[c][r] && !landedMap.has(key);
        if (wasLocked) continue; // already-locked coin, leave it
        const cell = cols[c].children[r];
        const finalCoin = landedMap.get(key) || null;
        const duration = ms(520 + (c + r) * 20 + Math.random() * 100);
        jobs.push(
          spinCoinCell(cell, finalCoin, duration).then(() => {
            if (finalCoin) {
              cell.classList.add("just-landed");
              setTimeout(() => cell.classList.remove("just-landed"), ms(700));
              safeAudio((A) => A.playCoinLand());
            }
          })
        );
      }
    }

    return Promise.all(jobs);
  }

  // Runs one coin-hunt respin. Returns true once the round has finished
  // (grid full or spins exhausted) and the payout has been settled.
  async function coinModeSpinStep() {
    setMessage(`Münzjagd läuft… Spins übrig: ${state.coinSpinsLeft}`, "bonus");

    const newlyLanded = Engine.coinStep(CFG, state.coinGrid, state.bet, Math.random);

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
      return true;
    }

    setMessage(`Münzjagd läuft… Spins übrig: ${state.coinSpinsLeft}`, "bonus");
    return false;
  }

  async function finishCoinMode(gridFull) {
    safeAudio((A) => A.stopBonusLoop());
    let total = 0;
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        const coin = state.coinGrid[c][r];
        if (coin) total += coin.value;
      }
    }

    const big = total >= state.bet * BIG_WIN_MULT;
    const balanceBefore = state.balance;
    state.balance += total;
    popAndCount(el.balance, balanceBefore, state.balance, big);
    popAndCount(el.lastWin, 0, total, big);
    state.lastWin = total;

    if (gridFull) {
      shakeMachine(true);
      await showPopup("GITTER VOLL!", total, "Alle Felder gefüllt — Jackpot!", 260, true);
    } else {
      await showPopup("MÜNZJAGD BEENDET", total, "Gesamtgewinn der Münzjagd", 180, big);
    }

    state.inBonus = false;
    state.inCoinMode = false;
    state.coinGrid = [];
    el.freeSpinsStat.hidden = true;
    el.machineWrap.classList.remove("bonus-active");
    buildInitialGrid();
    setMessage("Zurück im Hauptspiel. Viel Glück!", null);
  }

  // runs the coin-hunt bonus to completion, one paced respin at a time
  async function runBonusRound() {
    while (true) {
      await sleep(ms(850));
      const finished = await coinModeSpinStep();
      if (finished) return;
    }
  }

  // ---------- confetti ----------

  const ctx = el.confettiCanvas.getContext("2d");
  let confettiParticles = [];
  let confettiRAF = null;
  let canvasW = 0;
  let canvasH = 0;
  const CONFETTI_COLORS = ["#dcaa4e", "#4ade80", "#5eb1ff", "#ff6b81", "#f2f1ee"];

  // F4 fix: canvas backing store must scale with devicePixelRatio, or the
  // whole confetti layer renders soft/blurry on any high-density screen
  // (i.e. basically every phone).
  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    canvasW = window.innerWidth;
    canvasH = window.innerHeight;
    el.confettiCanvas.width = Math.round(canvasW * dpr);
    el.confettiCanvas.height = Math.round(canvasH * dpr);
    el.confettiCanvas.style.width = `${canvasW}px`;
    el.confettiCanvas.style.height = `${canvasH}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();

  function burstConfetti(amount) {
    for (let i = 0; i < amount; i++) {
      confettiParticles.push({
        shape: "rect",
        x: Math.random() * canvasW,
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
    for (let i = 0; i < amount; i++) {
      confettiParticles.push({
        shape: "coin",
        x: Math.random() * canvasW,
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
    ctx.clearRect(0, 0, canvasW, canvasH);
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
    confettiParticles = confettiParticles.filter((p) => p.y < canvasH + 40);
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

    const duration = ms(900);
    const start = performance.now();
    function tick(now) {
      const p = Math.min(1, (now - start) / duration);
      el.popupAmount.textContent = formatNumber(amount * p);
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);

    return new Promise((resolve) => {
      // F5 fix: the auto-dismiss timer used to keep running even after a
      // manual click already closed the popup, calling dismiss() twice.
      // Harmless today, but the second call fires the moment sound/extra
      // animation hooks it (Welle 2), so clear it properly on close.
      let dismissTimer;
      const dismiss = () => {
        clearTimeout(dismissTimer);
        el.popup.classList.remove("show");
        el.popup.removeEventListener("click", dismiss);
        resolve();
      };
      el.popup.addEventListener("click", dismiss);
      dismissTimer = setTimeout(dismiss, ms(2600));
    });
  }

  // ---------- spin flow ----------

  function setControlsEnabled(enabled) {
    const disabled = !enabled || state.inBonus;
    el.spinBtn.disabled = disabled;
    el.betUp.disabled = disabled;
    el.betDown.disabled = disabled;
    el.autoBtn.disabled = disabled;
    el.lever.disabled = disabled;
  }

  function pullLever() {
    safeAudio((A) => {
      A.init();
      A.playLeverClick();
    });
    el.lever.classList.remove("pulled");
    el.leverRod.style.animationDuration = "";
    // eslint-disable-next-line no-unused-expressions
    el.leverRod.offsetWidth;
    const duration = ms(900);
    el.leverRod.style.animationDuration = `${duration}ms`;
    el.lever.classList.add("pulled");
    setTimeout(() => el.lever.classList.remove("pulled"), duration);
  }

  // Runs exactly one base-game spin (deduct bet, animate, evaluate, react).
  // Returns true if it triggered the coin-hunt bonus.
  async function doBaseSpin() {
    const prev = state.balance;
    state.balance -= state.bet;
    el.balance.textContent = formatNumber(state.balance);
    flash(el.balance);
    setMessage("Viel Glück!", null);

    const resultGrid = Engine.spinGrid(CFG, Math.random);

    await playSpinAnimation(resultGrid);
    state.grid = resultGrid;

    const { totalWin, wins, winningCells, scatterCount } = Engine.evaluateWays(CFG, resultGrid, state.bet);
    const appliedWin = totalWin;

    if (appliedWin > 0) {
      markWinCells(winningCells);
      safeAudio((A) => A.playWinArpeggio(Math.max(0, wins.length - 1)));
      const big = appliedWin >= state.bet * BIG_WIN_MULT;
      const balanceBefore = state.balance;
      state.balance += appliedWin;
      popAndCount(el.balance, balanceBefore, state.balance, big);
      popAndCount(el.lastWin, 0, appliedWin, big);
    } else {
      animateCount(el.lastWin, 0, 0, 0);
    }

    state.lastWin = appliedWin;

    const triggered = scatterCount >= SCATTER_TRIGGER;

    if (appliedWin >= state.bet * MEGA_WIN_MULT) {
      setMessage("MEGA GEWINN!", "win");
      await showPopup("MEGA GEWINN!", appliedWin, "Unglaublich!", 220, true);
    } else if (appliedWin >= state.bet * BIG_WIN_MULT) {
      setMessage("Großer Gewinn!", "win");
      shakeMachine(false);
      await showPopup("GROSSER GEWINN!", appliedWin, "", 130);
    } else if (appliedWin > 0) {
      if (wins.length > 1) {
        setMessage(`${wins.length}x KOMBI-GEWINN! +${formatNumber(appliedWin)} Coins`, "win");
        if (wins.length >= 3) shakeMachine(false);
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
      el.machineWrap.classList.add("bonus-active");
      renderCoinGrid();
      safeAudio((A) => A.playBonusFanfare());
      await showPopup("MÜNZJAGD!", COIN_MIN_SPINS, "Sammle Münzen — jede neue Münze verlängert die Runde!", 180, true);
      safeAudio((A) => A.startBonusLoop());
      setMessage(`Münzjagd gestartet! Spins übrig: ${state.coinSpinsLeft}`, "bonus");
    }

    return triggered;
  }

  // One full user-initiated spin: the base spin, plus the entire coin-hunt
  // bonus round if it triggers. This is the unit auto-spin repeats — F1 fix:
  // auto-spin used to die silently whenever a bonus fired, because the old
  // spin() returned early out of the very block that scheduled the next
  // auto-spin. Now that continuation lives outside the spin logic entirely.
  async function runSpinCycle() {
    state.spinning = true;
    setControlsEnabled(false);
    el.reelWindow.querySelectorAll(".cell-win").forEach((c) => c.classList.remove("cell-win"));

    const triggered = await doBaseSpin();
    if (triggered) {
      await runBonusRound();
    }

    state.spinning = false;
    setControlsEnabled(true);
  }

  async function spin() {
    if (state.spinning) return;
    if (!state.inBonus && state.balance < state.bet) {
      setMessage("Nicht genug Guthaben. Einsatz verringern.", null);
      stopAutoSpin();
      return;
    }
    await runSpinCycle();
  }

  async function autoSpinLoop() {
    while (state.autoSpinsLeft > 0) {
      if (state.balance < state.bet) {
        stopAutoSpin();
        return;
      }
      await runSpinCycle();
      state.autoSpinsLeft -= 1;
      if (state.autoSpinsLeft <= 0) {
        stopAutoSpin();
        return;
      }
      await sleep(ms(500));
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
    if (!state.spinning) autoSpinLoop();
  }

  // ---------- test-mode banner (F7) ----------
  // settings.html is open to anyone; make it obvious when the running
  // config is not the shipped default so nobody mistakes a detuned build
  // for the real balance.
  function updateTestBanner() {
    if (!el.testBanner) return;
    el.testBanner.hidden = !window.LuckySpinConfig.isCustomized();
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

  el.spinBtn.addEventListener("click", () => {
    safeAudio((A) => A.init());
    spin();
  });
  el.autoBtn.addEventListener("click", () => {
    safeAudio((A) => A.init());
    toggleAutoSpin();
  });

  el.lever.addEventListener("click", () => {
    if (el.lever.disabled) return;
    pullLever();
    spin();
  });

  function updateMuteBtn() {
    if (!el.muteBtn) return;
    const muted = !!(Audio && Audio.isMuted());
    el.muteBtn.textContent = muted ? "🔇" : "🔊";
    el.muteBtn.classList.toggle("muted", muted);
    el.muteBtn.setAttribute("aria-pressed", muted ? "true" : "false");
  }

  if (el.muteBtn) {
    el.muteBtn.addEventListener("click", () => {
      safeAudio((A) => {
        A.init();
        A.setMuted(!A.isMuted());
      });
      updateMuteBtn();
    });
  }
  updateMuteBtn();

  el.fastBtn.addEventListener("click", () => {
    state.fastMode = !state.fastMode;
    el.fastBtn.classList.toggle("active", state.fastMode);
    el.fastBtn.textContent = state.fastMode ? "⚡ Fast AN" : "⚡ Fast";
  });

  document.addEventListener("keydown", (e) => {
    if (e.code === "Space" && !state.spinning && !state.inBonus) {
      e.preventDefault();
      safeAudio((A) => A.init());
      spin();
    }
  });

  // ---------- init ----------

  buildInitialGrid();
  buildPaytable();
  updateTestBanner();
  el.balance.textContent = formatNumber(state.balance);
  el.bet.textContent = state.bet;
  el.lastWin.textContent = "0";

  preloadImages().then(() => {
    el.spinBtnLabel.textContent = "SPIN";
    setControlsEnabled(true);
  });
})();
