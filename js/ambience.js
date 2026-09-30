/* =============================================================
   BINOMAR GROUP — ambient sound
   -------------------------------------------------------------
   An optional soundscape for the district, synthesised live with
   the Web Audio API: no audio files to download, nothing borrowed.
     · wind      filtered noise that rises and falls with the same
                 gusts that bend the trees
     · crickets  after dark: two voices left and right, each a pair
                 of sine tones 46 Hz apart — the beat between them
                 is the trill — gated into short chirps
     · birds     by day: now and then a few quick rising whistles
     · the fire  a low hearth rumble and crackles, swelling as the
                 camera comes down toward the plaza
   During the sky pass the ground falls away: the crickets, birds
   and fire fade, and the wind opens up.

   Off by default. The HUD button turns it on (a click is the
   gesture browsers insist on before any sound); the choice is
   remembered, and on a later visit the first click or key anywhere
   wakes it. It fades out whenever the map is scrolled away or the
   tab is hidden, and the audio graph is suspended while silent.
   ============================================================= */

const PREF = 'binomar.sound';

function readPref() {
  try { return localStorage.getItem(PREF); } catch (e) { return null; }
}
function writePref(v) {
  try { localStorage.setItem(PREF, v); } catch (e) { /* private mode */ }
}

export function createAmbience({ onChange } = {}) {
  const AC = window.AudioContext || window.webkitAudioContext;
  let ctx = null, n = null;
  let on = readPref() !== 'off', awake = false;   // wanted (on unless muted before) / actually running
  let levelClock = 0, suspendTimer = 0;
  const voiceTimers = [0.3, 0.9];
  let birdTimer = 2.5, crackleTimer = 0.2;
  const want = { master: 0, wind: 0, crickets: 0, birds: 0, fire: 0 };

  function build() {
    ctx = new AC();
    const master = ctx.createGain();
    master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);

    /* two seconds of white noise, shared by the wind, the hearth and the crackles */
    const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    const bus = () => { const g = ctx.createGain(); g.gain.value = 0; g.connect(master); return g; };
    const wind = bus(), crickets = bus(), birds = bus(), fire = bus();
    const pan = (v, into) => {
      if (!ctx.createStereoPanner) return into;
      const p = ctx.createStereoPanner();
      p.pan.value = v;
      p.connect(into);
      return p;
    };

    /* wind: noise through a low-pass whose cut-off a slow LFO sweeps */
    const wn = ctx.createBufferSource();
    wn.buffer = noise; wn.loop = true;
    const wlp = ctx.createBiquadFilter();
    wlp.type = 'lowpass'; wlp.frequency.value = 420; wlp.Q.value = 0.8;
    const wlfo = ctx.createOscillator();
    wlfo.frequency.value = 0.07;
    const wlfoAmt = ctx.createGain();
    wlfoAmt.gain.value = 200;
    wlfo.connect(wlfoAmt).connect(wlp.frequency);
    wn.connect(wlp).connect(wind);
    wn.start(); wlfo.start();

    /* crickets: each voice runs continuously behind a closed gate */
    const voices = [[4380, -0.65], [4640, 0.6]].map(([f, side]) => {
      const gate = ctx.createGain();
      gate.gain.value = 0;
      const mix = ctx.createGain();
      mix.gain.value = 0.5;
      for (const hz of [f, f + 46]) {
        const o = ctx.createOscillator();
        o.frequency.value = hz;
        o.connect(mix);
        o.start();
      }
      mix.connect(gate).connect(pan(side, crickets));
      return gate;
    });

    /* the hearth: slowed noise under a low-pass, and a band-pass the
       crackles are fired through */
    const fn = ctx.createBufferSource();
    fn.buffer = noise; fn.loop = true; fn.playbackRate.value = 0.55;
    const flp = ctx.createBiquadFilter();
    flp.type = 'lowpass'; flp.frequency.value = 230;
    const bed = ctx.createGain();
    bed.gain.value = 0.6;
    fn.connect(flp).connect(bed).connect(fire);
    fn.start();
    const crackle = ctx.createBiquadFilter();
    crackle.type = 'bandpass'; crackle.frequency.value = 2300; crackle.Q.value = 0.8;
    crackle.connect(fire);

    n = { master, wind, crickets, birds, fire, voices, noise, crackle, pan };
  }

  function wake() {
    if (!AC) return;
    if (!ctx) build();
    clearTimeout(suspendTimer);
    if (ctx.state !== 'running') ctx.resume();
    awake = true;
  }

  function set(v) {
    on = !!v;
    writePref(on ? 'on' : 'off');
    if (on) wake();
    if (onChange) onChange(on);
  }

  /* sound is on from the start — only an explicit past mute turns it away —
     but the engine still cannot start before the visitor touches the page */
  if (on && AC) {
    on = true;
    const first = () => {
      removeEventListener('pointerdown', first, true);
      removeEventListener('keydown', first, true);
      if (on) wake();
    };
    addEventListener('pointerdown', first, true);
    addEventListener('keydown', first, true);
  }
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend();
    else if (on && awake) ctx.resume();
  });

  /* ---- the scheduled sounds ---- */
  function chirp(gate, t0) {
    for (let k = 0; k < 3; k++) {
      const a = t0 + k * 0.085;
      gate.gain.setValueAtTime(0, a);
      gate.gain.linearRampToValueAtTime(1, a + 0.012);
      gate.gain.linearRampToValueAtTime(0, a + 0.055);
    }
  }

  function crackleOnce(t0) {
    const src = ctx.createBufferSource();
    src.buffer = n.noise;
    const g = ctx.createGain();
    const len = 0.004 + Math.random() * 0.018;
    const amp = 0.25 + Math.pow(Math.random(), 2) * 1.1;
    g.gain.setValueAtTime(amp, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + len);
    src.connect(g).connect(n.crackle);
    src.start(t0, Math.random() * 1.9, len + 0.01);
  }

  function birdOnce(t0) {
    const notes = 2 + Math.floor(Math.random() * 3);
    const base = 2600 + Math.random() * 1400;
    const out = n.pan(Math.random() * 1.6 - 0.8, n.birds);
    for (let k = 0; k < notes; k++) {
      const a = t0 + k * (0.11 + Math.random() * 0.05);
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(base * (0.9 + Math.random() * 0.1), a);
      o.frequency.exponentialRampToValueAtTime(base * (1.35 + Math.random() * 0.3), a + 0.08);
      g.gain.setValueAtTime(0.0001, a);
      g.gain.exponentialRampToValueAtTime(0.6, a + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, a + 0.1);
      o.connect(g).connect(out);
      o.start(a);
      o.stop(a + 0.12);
    }
  }

  return {
    get on() { return on; },
    /* for the console: the audio engine and where each layer is heading */
    get state() { return { engine: ctx ? ctx.state : 'not started', ...want }; },
    toggle() { set(!on); },

    /* after a back/forward-cache restore the engine can come back
       suspended, and no visibilitychange ever fires to wake it */
    resume() {
      if (ctx && on && awake && ctx.state === 'suspended') ctx.resume().catch(() => {});
    },

    /* once a frame from the render loop. s: { night 0..1, near 0..1 (how
       close the camera is to the plaza), sky 0..1 (sky pass), visible,
       under (the page is over the map) } */
    update(dt, t, s) {
      if (!ctx || !awake) return;
      const gust = 0.55 + 0.45 * Math.sin(t * 0.21) + 0.28 * Math.sin(t * 0.53 + 2.1);
      const ground = 1 - s.sky;
      /* full while the world is in front, a murmur while it sits behind the
         page, silent once it has scrolled away */
      want.master = on && s.visible && !document.hidden ? (s.under ? 0.3 : 0.8) : 0;
      want.wind = 0.04 + 0.045 * gust + 0.12 * s.sky;
      want.crickets = 0.03 * s.night * ground;
      want.birds = 0.045 * (1 - s.night) * ground;
      want.fire = 0.22 * (0.3 + 0.7 * s.night) * (0.12 + 0.88 * s.near) * ground;

      /* levels glide (a tenth of a second between updates is plenty) */
      levelClock -= dt;
      if (levelClock <= 0) {
        levelClock = 0.1;
        const now = ctx.currentTime;
        n.master.gain.setTargetAtTime(want.master, now, 0.45);
        n.wind.gain.setTargetAtTime(want.wind, now, 0.5);
        n.crickets.gain.setTargetAtTime(want.crickets, now, 0.6);
        n.birds.gain.setTargetAtTime(want.birds, now, 0.6);
        n.fire.gain.setTargetAtTime(want.fire, now, 0.4);
        /* silent and switched off: let the audio thread sleep */
        if (!on && n.master.gain.value < 0.002) {
          awake = false;
          suspendTimer = setTimeout(() => { if (!on && ctx) ctx.suspend(); }, 300);
        }
      }
      if (!want.master) return;

      const at = ctx.currentTime + 0.05;
      if (want.crickets > 0.002) {
        for (let i = 0; i < n.voices.length; i++) {
          voiceTimers[i] -= dt;
          if (voiceTimers[i] <= 0) {
            chirp(n.voices[i], at);
            voiceTimers[i] = 0.55 + Math.random() * 0.9;
          }
        }
      }
      if (want.fire > 0.004) {
        crackleTimer -= dt;
        if (crackleTimer <= 0) {
          crackleOnce(at);
          crackleTimer = 0.03 + Math.pow(Math.random(), 2) * 0.4;   // they come in clusters
        }
      }
      if (want.birds > 0.004) {
        birdTimer -= dt;
        if (birdTimer <= 0) {
          birdOnce(at);
          birdTimer = 1.8 + Math.random() * 4.5;
        }
      }
    }
  };
}

/* ---- the ambience beds: the real recordings from /audio, not synths ----
   One carries the night, one the day. Both are meant to be there from the
   moment the district appears, but a browser will not let a page make a
   sound before the visitor has touched anything — so each starts muted at
   once (that much autoplay is always allowed) and the first touch or key
   anywhere lifts the mute and lets it fade in under everything. Each rides
   its own band of the env mix (the same band the sky crossfades through),
   thins to nothing when the tab goes to the back, and honours the 🔇 button
   and a remembered mute. `level()` returns 0…1: how present this bed is. */
function createBed(src, { volume = 0.32, level = () => 1 } = {}) {
  const el = document.createElement('audio');
  el.src = src;
  el.loop = true;
  el.preload = 'auto';
  el.muted = true;                    // the silent start autoplay permits
  el.volume = 0;
  let on = readPref() !== 'off';      // a remembered mute silences it too
  let gestured = false, lvl = 0;

  el.play().catch(() => {});          // begin silent; a touch only lifts the mute

  const wake = () => {
    if (gestured) return;
    gestured = true;
    removeEventListener('pointerdown', wake, true);
    removeEventListener('keydown', wake, true);
    el.muted = false;
    if (el.paused) el.play().catch(() => {});
  };
  addEventListener('pointerdown', wake, true);
  addEventListener('keydown', wake, true);

  const clock = setInterval(() => {
    const target = on && gestured && !document.hidden ? volume * level() : 0;
    if (target > 0 && el.paused) el.play().catch(() => {});
    lvl += (target - lvl) * 0.12;                       // ≈ a 3 s glide
    const v = Math.max(0, Math.min(1, lvl));
    if (Math.abs(v - el.volume) > 0.004) el.volume = v;
    if (target === 0 && lvl < 0.01) {
      lvl = 0;
      if (!el.paused) el.pause();     // silent and idle: no decode work
    }
  }, 150);

  return {
    get on() { return on; },
    set enabled(v) { on = !!v; },
    get playing() { return on && gestured && !el.paused; },
    stop() { on = false; clearInterval(clock); el.pause(); }
  };
}

/* The night bed: full once the sky is properly dark (mix .75), gone by
   the last of the light (.25). */
export function createNightBed(src, { volume = 0.32, nightMix = () => 1 } = {}) {
  return createBed(src, {
    volume,
    level: () => Math.max(0, Math.min(1, (nightMix() - 0.25) / 0.5))
  });
}

/* The day bed: the mirror image — full in daylight (mix ≤ .25), fading out
   as the sky darkens, so the two recordings hand over to each other
   through the same band the sky itself crossfades through. */
export function createDayBed(src, { volume = 0.32, dayMix = () => 0 } = {}) {
  return createBed(src, {
    volume,
    level: () => Math.max(0, Math.min(1, (0.75 - dayMix()) / 0.5))
  });
}
