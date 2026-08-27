#!/usr/bin/env node
/**
 * LuckySpin Monte Carlo simulator (B8).
 *
 * Runs the game math headless — no browser, no DOM — using the exact same
 * js/engine.js the live game uses, so this number is never a guess: it's
 * what the game actually pays. Run after any change to js/config.js.
 *
 * Usage:
 *   node sim/simulate.js [--spins=300000] [--bet=40] [--seed=1234]
 */

"use strict";

const path = require("path");
const Engine = require(path.join(__dirname, "..", "js", "engine.js"));
require(path.join(__dirname, "..", "js", "config.js"));
const Config = global.LuckySpinConfig;

function parseArgs() {
  const args = { spins: 300000, bet: 40, seed: null };
  process.argv.slice(2).forEach((arg) => {
    const m = arg.match(/^--(\w+)=(.+)$/);
    if (!m) return;
    if (m[1] === "seed") args.seed = m[2];
    else args[m[1]] = Number(m[2]);
  });
  return args;
}

function percentile(sortedAsc, p) {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.min(sortedAsc.length - 1, Math.floor(p * sortedAsc.length));
  return sortedAsc[idx];
}

function fmt(n, digits) {
  return n.toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function runSimulation(cfg, spins, bet, seed) {
  const rng = Engine.createRng(seed);
  const cols = cfg.cols;
  const rows = cfg.rows;

  let baseWon = 0;
  let bonusWon = 0;
  let baseHits = 0;
  let bonusTriggers = 0;
  let maxBaseWin = 0;
  let maxBonusWin = 0;
  let totalRespins = 0;
  let totalCoinsCollected = 0;
  let fullGridCount = 0;

  const baseWinsXBet = new Float64Array(spins); // for percentile/volatility

  for (let i = 0; i < spins; i++) {
    const grid = Engine.spinGrid(cfg, rng);
    const result = Engine.evaluateWays(cfg, grid, bet);

    baseWon += result.totalWin;
    if (result.totalWin > 0) baseHits++;
    if (result.totalWin > maxBaseWin) maxBaseWin = result.totalWin;
    baseWinsXBet[i] = result.totalWin / bet;

    if (result.scatterCount >= cfg.scatterTrigger) {
      bonusTriggers++;
      const coinGrid = Array.from({ length: cols }, () => new Array(rows).fill(null));
      let coinSpinsLeft = cfg.coinMinSpins;
      let coinFilled = 0;
      let respins = 0;

      while (coinSpinsLeft > 0 && coinFilled < cols * rows) {
        const landed = Engine.coinStep(cfg, coinGrid, bet, rng);
        respins++;
        coinFilled += landed.length;
        if (landed.length > 0) coinSpinsLeft = cfg.coinMinSpins;
        else coinSpinsLeft -= 1;
      }

      let bonusTotal = 0;
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          if (coinGrid[c][r]) bonusTotal += coinGrid[c][r].value;
        }
      }
      if (coinFilled >= cols * rows) fullGridCount++;

      bonusWon += bonusTotal;
      totalRespins += respins;
      totalCoinsCollected += coinFilled;
      if (bonusTotal > maxBonusWin) maxBonusWin = bonusTotal;
    }
  }

  const wagered = spins * bet;
  const sorted = Float64Array.from(baseWinsXBet).sort();

  return {
    spins,
    bet,
    wagered,
    baseWon,
    bonusWon,
    totalWon: baseWon + bonusWon,
    baseHits,
    bonusTriggers,
    maxBaseWin,
    maxBonusWin,
    totalRespins,
    totalCoinsCollected,
    fullGridCount,
    p999BaseXBet: percentile(sorted, 0.999),
    p9999BaseXBet: percentile(sorted, 0.9999),
  };
}

function report(stats) {
  const rtpBase = (stats.baseWon / stats.wagered) * 100;
  const rtpBonus = (stats.bonusWon / stats.wagered) * 100;
  const rtpTotal = (stats.totalWon / stats.wagered) * 100;
  const hitRate = (stats.baseHits / stats.spins) * 100;
  const bonusFreq = stats.bonusTriggers > 0 ? stats.spins / stats.bonusTriggers : Infinity;
  const avgBonusXBet = stats.bonusTriggers > 0 ? stats.bonusWon / stats.bonusTriggers / stats.bet : 0;
  const avgRespins = stats.bonusTriggers > 0 ? stats.totalRespins / stats.bonusTriggers : 0;
  const avgCoins = stats.bonusTriggers > 0 ? stats.totalCoinsCollected / stats.bonusTriggers : 0;

  console.log("=".repeat(64));
  console.log(`LuckySpin Simulator — ${stats.spins.toLocaleString("de-DE")} Spins, Einsatz ${stats.bet}`);
  console.log("=".repeat(64));
  console.log(`RTP gesamt ................ ${fmt(rtpTotal, 2)} %`);
  console.log(`  Basisspiel ............... ${fmt(rtpBase, 2)} %`);
  console.log(`  Münzjagd ................. ${fmt(rtpBonus, 2)} %`);
  console.log(`Trefferquote Basisspiel .... ${fmt(hitRate, 2)} %`);
  console.log(`Münzjagd-Häufigkeit ........ 1 von ${fmt(bonusFreq, 1)} Spins`);
  console.log(`  Ø Auszahlung ............. ${fmt(avgBonusXBet, 1)}x Einsatz`);
  console.log(`  Ø Respins ................ ${fmt(avgRespins, 1)}`);
  console.log(`  Ø Münzen .................. ${fmt(avgCoins, 1)} / 24`);
  console.log(`  Volle Gitter ............. ${stats.fullGridCount} (${fmt((stats.fullGridCount / Math.max(1, stats.bonusTriggers)) * 100, 2)} %)`);
  console.log(`Größter Basisgewinn ........ ${fmt(stats.maxBaseWin / stats.bet, 1)}x Einsatz`);
  console.log(`Größter Bonusgewinn ........ ${fmt(stats.maxBonusWin / stats.bet, 1)}x Einsatz`);
  console.log(`99,9%-Quantil (Basisspiel) . ${fmt(stats.p999BaseXBet, 1)}x Einsatz`);
  console.log(`99,99%-Quantil (Basisspiel)  ${fmt(stats.p9999BaseXBet, 1)}x Einsatz`);
  console.log("=".repeat(64));
}

function main() {
  const args = parseArgs();
  const cfg = Config.cloneDefaults();
  const stats = runSimulation(cfg, args.spins, args.bet, args.seed);
  report(stats);
}

if (require.main === module) {
  main();
}

module.exports = { runSimulation, parseArgs };
