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
  let on = false, awake = false;              // wanted by the visitor / actually running
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

  /* a remembered "on" can only start once the visitor touches the page */
  if (readPref() === 'on' && AC) {
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
