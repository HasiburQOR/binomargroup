/* =============================================================
   BINOMAR GROUP — quality tiers
   -------------------------------------------------------------
   One place that decides how much scene this device should be
   asked to draw. Everything expensive reads its budget from
   here rather than hard-coding a count, so a phone gets a
   smaller village rather than a slideshow of the big one.

   The tiers are deliberately coarse. Screen size, pointer type
   and core count are crude but honest; on top of them the GPU's
   own name (where the browser shares it) catches the laptop
   with eight cores and an integrated chip, which is the usual
   "low-end PC" that stutters. Whatever this guesses, city.js
   still watches the real frame rate and sheds resolution, then
   bloom, then shadows if the device cannot keep up.
   ============================================================= */

/* the renderer string, e.g. "ANGLE (Intel, Intel(R) UHD Graphics 620 …)".
   A throwaway context, released at once; '' when the browser hides it. */
function gpuName() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return '';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || '');
    const lose = gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
    return name;
  } catch (e) {
    return '';
  }
}

/* software rasterisers: every pixel is CPU work */
const SOFTWARE_GPU = /swiftshader|llvmpipe|softpipe|basic render|microsoft basic|software/i;
/* integrated and mobile GPUs: fine for the village, not for the full one.
   Intel Arc is a discrete card, and Apple M-series Macs keep the full tier. */
const WEAK_GPU = /intel(?!.*\barc\b)|\bmali|adreno|powervr|apple gpu|vivante|videocore|radeon\(tm\) graphics|radeon graphics|radeon vega|vega \d+ graphics|geforce (mx|9\d0m|8\d0m)|nvidia tegra/i;

let cached = null;

export function detectQuality() {
  if (cached) return cached;
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const narrow = Math.min(window.innerWidth, window.innerHeight) < 700;
  const cores = navigator.hardwareConcurrency || 4;
  const memory = navigator.deviceMemory || 8;          // GB, Chromium only
  const dpr = window.devicePixelRatio || 1;
  const reducedMotion = typeof matchMedia === 'function' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches;
  const gpu = gpuName();
  const software = SOFTWARE_GPU.test(gpu);
  const weakGpu = WEAK_GPU.test(gpu);

  /* a touch device, a small screen, a weak or integrated GPU, little memory
     or a very weak CPU mean "go easy" */
  const mobile = coarse || window.innerWidth < 820;
  const low = mobile || weakGpu || software || cores <= 2 || memory <= 4;
  /* phones with huge pixel ratios are the usual reason a scene like this
     crawls: rendering 3× is nine times the fragment work */
  const tiny = software || (low && (narrow || dpr >= 2.5 || memory <= 2));

  const q = {
    tier: tiny ? 'tiny' : low ? 'low' : 'high',
    mobile, reducedMotion, gpu,

    /* 1.5 device pixels per CSS pixel is already sharp on a retina screen
       and 44 % fewer pixels to shade than 2×; the names are HTML labels, so
       nothing in the canvas needs more */
    pixelRatio: tiny ? 1 : low ? Math.min(dpr, 1.25) : Math.min(dpr, 1.5),
    /* only asked for where there is no bloom composer: with one, the scene
       is drawn into the composer's own target and a multisampled canvas
       would be pure cost (see initThree in city.js) */
    antialias: !low,
    shadows: !low,
    shadowMapSize: low ? 1024 : 2048,

    /* scene budgets */
    grass: tiny ? 1600 : low ? 3600 : 11000,
    leaves: tiny ? 90 : low ? 170 : 320,
    fireflies: tiny ? 60 : low ? 110 : 200,
    traffic: low ? 2 : 5,
    deer: tiny ? 3 : low ? 5 : 9,
    rabbits: tiny ? 4 : low ? 7 : 14,
    villagers: tiny ? 6 : low ? 10 : 18,
    birdFlocks: low ? 2 : 4,

    /* the soft glow of lit windows, lamps and the moon after dark — one full
       post-processing pass over the whole frame. Some integrated GPUs lose
       the GL context outright under it (night + full dome), so only the
       high tier runs it; the governor can drop it later but never add it */
    bloom: !low,

    /* the heaviest tree model a device plants (see createFlora in models.js) */
    floraTris: tiny ? 1800 : low ? 3600 : Infinity,

    /* the mountain mesh: grid cells per side across its 430 m. 160 keeps the
       road bed and the building pads crisp; phones get ~3.6 m cells */
    terrainSeg: tiny ? 120 : low ? 140 : 160,

    /* multipliers on the scatter counts */
    forest: tiny ? 0.26 : low ? 0.4 : 0.7,
    scatter: tiny ? 0.3 : low ? 0.5 : 1,
    clouds: tiny ? 0.45 : low ? 0.65 : 1,

    /* sky — the Milky Way is a shader (sky.js), so it has no texture budget */
    stars: tiny ? 320 : low ? 520 : 850,
    aurora: tiny ? 0 : low ? 1 : 3,    // curtains: each is a full fbm shader (see sky.js)
    meteors: tiny ? 1 : low ? 2 : 3
  };

  /* how many of something to build, never fewer than one */
  q.count = (n, mult) => Math.max(1, Math.round(n * (mult === undefined ? 1 : mult)));
  cached = q;
  return q;
}
