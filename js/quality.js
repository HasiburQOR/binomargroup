/* =============================================================
   BINOMAR GROUP — quality tiers
   -------------------------------------------------------------
   One place that decides how much scene this device should be
   asked to draw. Everything expensive reads its budget from
   here rather than hard-coding a count, so a phone gets a
   smaller village rather than a slideshow of the big one.

   The tiers are deliberately coarse. Guessing a GPU from a user
   agent is a losing game; screen size, pointer type and core
   count are crude but they are honest.
   ============================================================= */

export function detectQuality() {
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const narrow = Math.min(window.innerWidth, window.innerHeight) < 700;
  const cores = navigator.hardwareConcurrency || 4;
  const dpr = window.devicePixelRatio || 1;
  const reducedMotion = typeof matchMedia === 'function' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* a touch device, a small screen, or a modest CPU all mean "go easy" */
  const mobile = coarse || window.innerWidth < 820;
  const low = mobile || cores <= 4;
  /* phones with huge pixel ratios are the usual reason a scene like this
     crawls: rendering 3× is nine times the fragment work */
  const tiny = low && (narrow || dpr >= 2.5);

  const q = {
    tier: tiny ? 'tiny' : low ? 'low' : 'high',
    mobile, reducedMotion,

    pixelRatio: tiny ? 1 : low ? Math.min(dpr, 1.5) : Math.min(dpr, 2),
    antialias: !low,
    shadows: !low,
    shadowMapSize: low ? 1024 : 2048,

    /* scene budgets */
    grass: tiny ? 900 : low ? 2000 : 7000,
    leaves: tiny ? 90 : low ? 170 : 420,
    fireflies: tiny ? 60 : low ? 110 : 240,
    traffic: low ? 2 : 5,
    deer: tiny ? 3 : low ? 5 : 9,
    rabbits: tiny ? 4 : low ? 7 : 14,
    villagers: tiny ? 4 : low ? 6 : 11,
    birdFlocks: low ? 2 : 4,

    /* multipliers on the scatter counts */
    forest: tiny ? 0.30 : low ? 0.48 : 1,
    scatter: tiny ? 0.34 : low ? 0.52 : 1,
    clouds: tiny ? 0.45 : low ? 0.65 : 1,

    /* sky */
    stars: tiny ? 320 : low ? 520 : 850,
    milkyWayWidth: low ? 2048 : 4096,
    aurora: !tiny,
    meteors: tiny ? 1 : low ? 2 : 3
  };

  /* how many of something to build, never fewer than one */
  q.count = (n, mult) => Math.max(1, Math.round(n * (mult === undefined ? 1 : mult)));
  return q;
}
