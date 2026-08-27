(() => {
  "use strict";

  const SYMBOLS = [
    { icon: "🍒", weight: 24, mult: 4 },
    { icon: "🍋", weight: 20, mult: 5 },
    { icon: "🍇", weight: 16, mult: 8 },
    { icon: "⭐", weight: 12, mult: 10 },
    { icon: "🍀", weight: 10, mult: 12 },
    { icon: "🔔", weight: 8, mult: 15 },
    { icon: "💎", weight: 6, mult: 25 },
    { icon: "7️⃣", weight: 4, mult: 50 },
  ];

  const TOTAL_WEIGHT = SYMBOLS.reduce((sum, s) => sum + s.weight, 0);
  const SYMBOL_HEIGHT = 220;
  const STRIP_LENGTH = 24; // symbols scrolled through before landing
  const MIN_BET = 5;
  const MAX_BET = 200;
  const BET_STEP = 5;

  const state = {
    balance: 1000,
    bet: 10,
    spinning: false,
    autoSpinsLeft: 0,
    jackpot: 24850,
  };

  const el = {
    balance: document.getElementById("balanceValue"),
    jackpot: document.getElementById("jackpotValue"),
    betValue: document.getElementById("betValue"),
    betUp: document.getElementById("betUp"),
    betDown: document.getElementById("betDown"),
    spinBtn: document.getElementById("spinBtn"),
    autoBtn: document.getElementById("autoBtn"),
    message: document.getElementById("messageBar"),
    reelFrame: document.querySelector(".reel-frame"),
    reels: [
      document.getElementById("reel0"),
      document.getElementById("reel1"),
      document.getElementById("reel2"),
    ],
  };

  function weightedRandomSymbol() {
    let roll = Math.random() * TOTAL_WEIGHT;
    for (const s of SYMBOLS) {
      if (roll < s.weight) return s;
      roll -= s.weight;
    }
    return SYMBOLS[0];
  }

  function formatNumber(n) {
    return Math.round(n).toLocaleString("de-DE");
  }

  function updateBalanceDisplay(prevBalance) {
    el.balance.textContent = formatNumber(state.balance);
    if (state.balance !== prevBalance) {
      el.balance.classList.add("flash");
      setTimeout(() => el.balance.classList.remove("flash"), 400);
    }
  }

  function updateBetDisplay() {
    el.betValue.textContent = state.bet;
  }

  function setMessage(text, isWin) {
    el.message.textContent = text;
    el.message.classList.toggle("win-text", !!isWin);
  }

  function buildReelStrip(reelEl, finalSymbol) {
    reelEl.innerHTML = "";
    reelEl.style.transition = "none";
    reelEl.style.transform = "translateY(0)";

    for (let i = 0; i < STRIP_LENGTH - 1; i++) {
      const sym = weightedRandomSymbol();
      const div = document.createElement("div");
      div.className = "symbol";
      div.textContent = sym.icon;
      reelEl.appendChild(div);
    }
    const finalDiv = document.createElement("div");
    finalDiv.className = "symbol";
    finalDiv.textContent = finalSymbol.icon;
    reelEl.appendChild(finalDiv);
  }

  function spinReel(reelEl, finalSymbol, duration) {
    return new Promise((resolve) => {
      buildReelStrip(reelEl, finalSymbol);
      reelEl.classList.add("spinning");

      // force reflow so the transition below actually animates
      // eslint-disable-next-line no-unused-expressions
      reelEl.offsetHeight;

      const distance = (STRIP_LENGTH - 1) * SYMBOL_HEIGHT;
      reelEl.style.transition = `transform ${duration}ms cubic-bezier(0.15, 0.85, 0.3, 1)`;
      reelEl.style.transform = `translateY(-${distance}px)`;

      const onEnd = () => {
        reelEl.removeEventListener("transitionend", onEnd);
        reelEl.classList.remove("spinning");
        // snap back to a single-symbol strip, no visible jump
        reelEl.style.transition = "none";
        reelEl.innerHTML = "";
        const div = document.createElement("div");
        div.className = "symbol";
        div.textContent = finalSymbol.icon;
        reelEl.appendChild(div);
        reelEl.style.transform = "translateY(0)";
        resolve();
      };
      reelEl.addEventListener("transitionend", onEnd);
    });
  }

  function evaluateWin(results) {
    const [a, b, c] = results;
    if (a.icon === b.icon && b.icon === c.icon) {
      return { kind: "triple", mult: a.mult };
    }
    if (a.icon === b.icon || b.icon === c.icon || a.icon === c.icon) {
      const pairSymbol = a.icon === b.icon ? a : b.icon === c.icon ? b : a;
      return { kind: "pair", mult: pairSymbol.mult * 0.15 };
    }
    return { kind: "none", mult: 0 };
  }

  async function spin() {
    if (state.spinning) return;
    if (state.balance < state.bet) {
      setMessage("Nicht genug Guthaben. Einsatz verringern.", false);
      stopAutoSpin();
      return;
    }

    state.spinning = true;
    el.spinBtn.disabled = true;
    el.spinBtn.classList.add("pressed");
    el.reelFrame.classList.remove("win");
    setMessage("Viel Glück! Dreh das Rad.", false);

    const prevBalance = state.balance;
    state.balance -= state.bet;
    updateBalanceDisplay(prevBalance);

    state.jackpot += Math.round(state.bet * 0.2);
    el.jackpot.textContent = formatNumber(state.jackpot);

    const results = [weightedRandomSymbol(), weightedRandomSymbol(), weightedRandomSymbol()];

    await Promise.all([
      spinReel(el.reels[0], results[0], 1400),
      spinReel(el.reels[1], results[1], 1750),
      spinReel(el.reels[2], results[2], 2100),
    ]);

    const outcome = evaluateWin(results);
    const beforeWinBalance = state.balance;

    if (outcome.kind === "triple") {
      const winAmount = Math.round(state.bet * outcome.mult);
      state.balance += winAmount;
      el.reelFrame.classList.add("win");
      setMessage(`JACKPOT LINE! +${formatNumber(winAmount)} Coins`, true);
    } else if (outcome.kind === "pair") {
      const winAmount = Math.round(state.bet * outcome.mult);
      state.balance += winAmount;
      setMessage(`Kleiner Gewinn: +${formatNumber(winAmount)} Coins`, true);
    } else {
      setMessage("Kein Treffer — nochmal versuchen!", false);
    }

    updateBalanceDisplay(beforeWinBalance);

    state.spinning = false;
    el.spinBtn.disabled = false;
    el.spinBtn.classList.remove("pressed");

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

  el.betUp.addEventListener("click", () => {
    if (state.spinning) return;
    state.bet = Math.min(MAX_BET, state.bet + BET_STEP);
    updateBetDisplay();
  });

  el.betDown.addEventListener("click", () => {
    if (state.spinning) return;
    state.bet = Math.max(MIN_BET, state.bet - BET_STEP);
    updateBetDisplay();
  });

  el.spinBtn.addEventListener("click", spin);
  el.autoBtn.addEventListener("click", toggleAutoSpin);

  document.addEventListener("keydown", (e) => {
    if (e.code === "Space" && !state.spinning) {
      e.preventDefault();
      spin();
    }
  });

  updateBalanceDisplay(state.balance);
  updateBetDisplay();
  el.jackpot.textContent = formatNumber(state.jackpot);
})();
