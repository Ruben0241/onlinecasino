// LuckySpin sound design — everything below is synthesized at runtime with
// the Web Audio API (oscillators, filters, and generated noise buffers).
// No audio files are loaded or fetched. Every public function is wrapped so
// that a failure (unsupported browser, blocked AudioContext, anything) can
// never throw out into the game logic — spins/wins must work identically
// with audio disabled.
(function (root) {
  "use strict";

  const MUTE_KEY = "luckyspin_muted";

  let ctx = null;
  let masterGain = null;
  let noiseBufferCache = null;
  let muted = loadMutedPref();

  function loadMutedPref() {
    try {
      return localStorage.getItem(MUTE_KEY) === "1";
    } catch (e) {
      return false;
    }
  }

  function saveMutedPref(v) {
    try {
      localStorage.setItem(MUTE_KEY, v ? "1" : "0");
    } catch (e) {
      /* ignore (private browsing, storage disabled, etc.) */
    }
  }

  // ---------- setup ----------

  // Must be called from inside a user-gesture handler (click/keydown) —
  // mobile Safari/Chrome refuse to start an AudioContext otherwise. Safe to
  // call repeatedly; a no-op once it has already succeeded.
  function init() {
    if (ctx) {
      // Some browsers create the context in "suspended" state even from a
      // gesture; nudge it awake on every subsequent gesture too.
      try {
        if (ctx.state === "suspended") ctx.resume();
      } catch (e) {
        /* ignore */
      }
      return;
    }
    try {
      const AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      masterGain = ctx.createGain();
      masterGain.gain.value = muted ? 0 : 1;
      masterGain.connect(ctx.destination);
    } catch (e) {
      ctx = null;
      masterGain = null;
    }
  }

  function ready() {
    return !!(ctx && masterGain);
  }

  function setMuted(v) {
    muted = !!v;
    saveMutedPref(muted);
    if (ready()) {
      try {
        const t = ctx.currentTime;
        masterGain.gain.cancelScheduledValues(t);
        masterGain.gain.setValueAtTime(masterGain.gain.value, t);
        masterGain.gain.linearRampToValueAtTime(muted ? 0 : 1, t + 0.08);
      } catch (e) {
        /* ignore */
      }
    }
  }

  function isMuted() {
    return muted;
  }

  // ---------- low-level helpers ----------

  function getNoiseBuffer() {
    if (noiseBufferCache) return noiseBufferCache;
    const len = Math.max(1, Math.floor(ctx.sampleRate * 1.5));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    noiseBufferCache = buf;
    return buf;
  }

  function noteFreq(semitonesFromA4) {
    return 440 * Math.pow(2, semitonesFromA4 / 12);
  }

  function gainNode(value) {
    const g = ctx.createGain();
    g.gain.value = value;
    g.connect(masterGain);
    return g;
  }

  // A short plucked tone: oscillator with a quick attack + exponential decay.
  function pluck(freq, opts) {
    opts = opts || {};
    const t0 = ctx.currentTime + (opts.delay || 0);
    const dur = opts.duration || 0.25;
    const peak = opts.gain != null ? opts.gain : 0.18;
    const osc = ctx.createOscillator();
    osc.type = opts.type || "triangle";
    osc.frequency.setValueAtTime(freq, t0);
    if (opts.detune) osc.detune.setValueAtTime(opts.detune, t0);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + Math.min(0.012, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(Math.max(0.0008, peak * 0.01), t0 + dur);
    osc.connect(g);
    g.connect(masterGain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
    return osc;
  }

  // A short filtered burst of noise, for clicks/clacks/thuds.
  function noiseBurst(opts) {
    opts = opts || {};
    const t0 = ctx.currentTime + (opts.delay || 0);
    const dur = opts.duration || 0.08;
    const peak = opts.gain != null ? opts.gain : 0.2;
    const src = ctx.createBufferSource();
    src.buffer = getNoiseBuffer();
    const filter = ctx.createBiquadFilter();
    filter.type = opts.filterType || "bandpass";
    filter.frequency.setValueAtTime(opts.freq || 1200, t0);
    if (opts.q != null) filter.Q.setValueAtTime(opts.q, t0);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + Math.min(0.005, dur * 0.15));
    g.gain.exponentialRampToValueAtTime(Math.max(0.0008, peak * 0.01), t0 + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(masterGain);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
    return src;
  }

  function safe(fn) {
    try {
      fn();
    } catch (e) {
      /* audio must never break the game */
    }
  }

  // ---------- sound events ----------

  // Mechanical lever/spin click: a tight noise click plus a springy
  // downward-pitched twang, like a real coin-op lever release.
  function playLeverClick() {
    safe(() => {
      if (!ready() || muted) return;
      noiseBurst({ freq: 2600, q: 1.2, duration: 0.045, gain: 0.22, filterType: "highpass" });
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(220, t0);
      osc.frequency.exponentialRampToValueAtTime(85, t0 + 0.16);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.001, t0);
      g.gain.linearRampToValueAtTime(0.16, t0 + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0008, t0 + 0.18);
      osc.connect(g);
      g.connect(masterGain);
      osc.start(t0);
      osc.stop(t0 + 0.2);
    });
  }

  // Reel spin whoosh loop: filtered looping noise that fades in, then decays
  // toward near-silence over `durationMs` as an approximation of the reels
  // slowing down (not a literal rotation-speed simulation).
  let spinLoop = null;
  function startSpinLoop(durationMs) {
    safe(() => {
      if (!ready()) return;
      stopSpinLoopInternal(0.02);
      const dur = Math.max(0.3, (durationMs || 1800) / 1000);
      const t0 = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = getNoiseBuffer();
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(700, t0);
      filter.Q.value = 0.9;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.1, t0 + 0.12);
      g.gain.linearRampToValueAtTime(0.02, t0 + dur);
      src.connect(filter);
      filter.connect(g);
      g.connect(masterGain);
      src.start(t0);
      spinLoop = { src, g, filter };
    });
  }

  function stopSpinLoopInternal(fadeSec) {
    if (!spinLoop) return;
    try {
      const t0 = ctx.currentTime;
      const fade = fadeSec != null ? fadeSec : 0.12;
      spinLoop.g.gain.cancelScheduledValues(t0);
      spinLoop.g.gain.setValueAtTime(spinLoop.g.gain.value, t0);
      spinLoop.g.gain.linearRampToValueAtTime(0, t0 + fade);
      spinLoop.src.stop(t0 + fade + 0.02);
    } catch (e) {
      /* ignore */
    }
    spinLoop = null;
  }

  function stopSpinLoop() {
    safe(() => stopSpinLoopInternal(0.12));
  }

  // Distinct per-reel "clack" as a column lands. `colIndex` gives each reel
  // a slightly different pitch so six stops don't sound identical.
  function playReelStop(colIndex) {
    safe(() => {
      if (!ready() || muted) return;
      const idx = colIndex || 0;
      noiseBurst({
        freq: 900 + idx * 70,
        q: 3,
        duration: 0.07,
        gain: 0.2,
        filterType: "bandpass",
      });
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(140 - idx * 6, t0);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.001, t0);
      g.gain.linearRampToValueAtTime(0.16, t0 + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0008, t0 + 0.09);
      osc.connect(g);
      g.connect(masterGain);
      osc.start(t0);
      osc.stop(t0 + 0.1);
    });
  }

  // Short ascending arpeggio for a win. `step` (0-based) shifts the whole
  // run up so successive win lines/ways in the same spin sound "stacked".
  function playWinArpeggio(step) {
    safe(() => {
      if (!ready() || muted) return;
      const s = Math.max(0, Math.min(step || 0, 8));
      const root = -9 + s * 2; // whole step higher per level
      const intervals = [0, 4, 7, 12];
      intervals.forEach((iv, i) => {
        pluck(noteFreq(root + iv), {
          delay: i * 0.07,
          duration: 0.32,
          gain: 0.16,
          type: "triangle",
        });
      });
    });
  }

  // Short tick while a number counts up; `progress` (0-1) raises the pitch
  // as the count approaches its target. Internally throttled since callers
  // may feed this from a requestAnimationFrame loop.
  let lastTickAt = 0;
  function playCountTick(progress) {
    safe(() => {
      if (!ready() || muted) return;
      const t = performance.now();
      if (t - lastTickAt < 45) return;
      lastTickAt = t;
      const p = Math.max(0, Math.min(1, progress || 0));
      const freq = 500 + p * 1400;
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = "square";
      osc.frequency.setValueAtTime(freq, t0);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.001, t0);
      g.gain.linearRampToValueAtTime(0.05, t0 + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0006, t0 + 0.045);
      osc.connect(g);
      g.connect(masterGain);
      osc.start(t0);
      osc.stop(t0 + 0.05);
    });
  }

  // Bonus coin landing "ding" — a small bell, randomly detuned per call so a
  // string of landings doesn't sound mechanically identical.
  function playCoinLand() {
    safe(() => {
      if (!ready() || muted) return;
      const detune = (Math.random() - 0.5) * 60; // cents
      const t0 = ctx.currentTime;
      [1, 2.41].forEach((mult, i) => {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(880 * mult, t0);
        osc.detune.setValueAtTime(detune, t0);
        const g = ctx.createGain();
        const peak = i === 0 ? 0.2 : 0.09;
        g.gain.setValueAtTime(0.0008, t0);
        g.gain.linearRampToValueAtTime(peak, t0 + 0.006);
        g.gain.exponentialRampToValueAtTime(0.0006, t0 + 0.55);
        osc.connect(g);
        g.connect(masterGain);
        osc.start(t0);
        osc.stop(t0 + 0.6);
      });
    });
  }

  // Rising anticipation tone for a reel held in suspense (e.g. an extended
  // spin waiting on scatters). start/stop pair; safe to call stop without a
  // matching start.
  let anticipation = null;
  function startAnticipation() {
    safe(() => {
      if (!ready()) return;
      stopAnticipationInternal(0.05);
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(160, t0);
      osc.frequency.exponentialRampToValueAtTime(520, t0 + 4.5);
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(900, t0);
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 5.5;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.03;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.06, t0 + 0.3);
      lfo.connect(lfoGain);
      lfoGain.connect(g.gain);
      osc.connect(filter);
      filter.connect(g);
      g.connect(masterGain);
      osc.start(t0);
      lfo.start(t0);
      anticipation = { osc, lfo, g };
    });
  }

  function stopAnticipationInternal(fadeSec) {
    if (!anticipation) return;
    try {
      const t0 = ctx.currentTime;
      const fade = fadeSec != null ? fadeSec : 0.15;
      anticipation.g.gain.cancelScheduledValues(t0);
      anticipation.g.gain.setValueAtTime(anticipation.g.gain.value, t0);
      anticipation.g.gain.linearRampToValueAtTime(0, t0 + fade);
      anticipation.osc.stop(t0 + fade + 0.02);
      anticipation.lfo.stop(t0 + fade + 0.02);
    } catch (e) {
      /* ignore */
    }
    anticipation = null;
  }

  function stopAnticipation() {
    safe(() => stopAnticipationInternal(0.15));
  }

  // Triumphant short fanfare for the coin-hunt bonus trigger.
  function playBonusFanfare() {
    safe(() => {
      if (!ready() || muted) return;
      const notes = [0, 7, 12, 16, 19]; // root, 5th, octave, 3rd, 5th (major fanfare shape)
      notes.forEach((iv, i) => {
        const delay = i * 0.1;
        pluck(noteFreq(iv), { delay, duration: 0.4, gain: 0.17, type: "sawtooth" });
        pluck(noteFreq(iv + 12), { delay, duration: 0.35, gain: 0.08, type: "triangle" });
      });
    });
  }

  // Ambient loop for while the coin-hunt bonus is running: a soft sustained
  // pad plus occasional sparkle blips, scheduled a little ahead of real time.
  let bonusLoop = null;
  function startBonusLoop() {
    safe(() => {
      if (!ready()) return;
      stopBonusLoopInternal();
      const t0 = ctx.currentTime;
      const padGain = gainNode(0);
      padGain.gain.linearRampToValueAtTime(0.045, t0 + 0.6);
      bonusLoop = { pad: padGain, oscs: [], timers: [], stopped: false };
      [0, 7, 12].forEach((iv) => {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = noteFreq(iv - 24);
        osc.connect(padGain);
        osc.start(t0);
        bonusLoop.oscs.push(osc);
      });

      const scheduleSparkle = () => {
        if (!bonusLoop || bonusLoop.stopped) return;
        safe(() => {
          const freq = 1200 + Math.random() * 900;
          pluck(freq, { duration: 0.3, gain: 0.05, type: "sine" });
        });
        const next = 900 + Math.random() * 1300;
        bonusLoop.timers.push(setTimeout(scheduleSparkle, next));
      };
      bonusLoop.timers.push(setTimeout(scheduleSparkle, 700));
    });
  }

  function stopBonusLoopInternal() {
    if (!bonusLoop) return;
    bonusLoop.stopped = true;
    bonusLoop.timers.forEach((id) => clearTimeout(id));
    try {
      const t0 = ctx.currentTime;
      bonusLoop.pad.gain.cancelScheduledValues(t0);
      bonusLoop.pad.gain.setValueAtTime(bonusLoop.pad.gain.value, t0);
      bonusLoop.pad.gain.linearRampToValueAtTime(0, t0 + 0.3);
      bonusLoop.oscs.forEach((osc) => osc.stop(t0 + 0.32));
    } catch (e) {
      /* ignore */
    }
    bonusLoop = null;
  }

  function stopBonusLoop() {
    safe(() => stopBonusLoopInternal());
  }

  root.LuckySpinAudio = {
    init,
    setMuted,
    isMuted,
    playLeverClick,
    startSpinLoop,
    stopSpinLoop,
    playReelStop,
    playWinArpeggio,
    playCountTick,
    playCoinLand,
    startAnticipation,
    stopAnticipation,
    playBonusFanfare,
    startBonusLoop,
    stopBonusLoop,
  };
})(typeof window !== "undefined" ? window : this);
