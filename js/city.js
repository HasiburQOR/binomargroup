/* =============================================================
   BINOMAR GROUP — 3D district (main application)
   -------------------------------------------------------------
   Owns: renderer, camera, lights, day/night cycle, roads & props,
   hover/click interaction and the HUD wiring.
   Geometry builders live in city-build.js, data in data.js.
   ============================================================= */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import {
  computeMountainLayout, makeBuilding, makeTree, makePine,
  makeFlag, mulberry32,
  makeBaseTerrain, withPads, makeMountain, makeOuterPlain, makeDistantForest,
  roadAt, spiralRoadPoints, makeRoadRibbon, roadSurfaceTexture, getBuildingDims,
  batchScatter, withRoadBed, bakeStatic
} from './city-build.js';
import { makeMonument } from './monument.js';
import { createNightSky } from './sky.js';
import { createWeather } from './clouds.js';
import { makeFirePit, addStringLights, createFireflies } from './cozy.js';
import { makeSmoke as makeSmokeStack } from './detail.js';
import { createBirds, createAnimals, createVillagers, createAstronomer } from './life.js';
import { makeWaterfall } from './water.js';
import {
  makeBigTree, makeGiantPine, makeBush, makeRockCluster, makeLogPile,
  makeStump, makeFallenLog, makeFlowerPatch, makeCairn,
  createGrass, createWindParticles, makeWindmill, makeBunting
} from './nature.js';
import {
  makeStreetLamp, makeGuardRail, makeRoadMarkings, makeRoadSign,
  makeChevron, makeStoneBridge, createTraffic
} from './road.js';
import {
  makeStall, makeInn, makeChapel, makeFarm, makeWatermill, makeViewpoint, makeWell
} from './hamlet.js';
import { detectQuality } from './quality.js';
import { createFold } from './fold.js';
import { installHeightFog } from './heightfog.js';
import { createAmbience, createNightBed, createDayBed } from './ambience.js';
import { loadCompanies, getIndustryMeta, fillBadge } from './data.js';
import {
  loadModels, bake, modelGroup, createFlora, hasFlora, updateModelWind
} from './models.js';

/* ---------------- day / night presets (blended at runtime) ---------------- */
const ENV = {
  /* daylight is deliberately late-afternoon rather than noon: a low,
     golden key light throws long shadows across the slopes and warms
     every roof, which is most of what makes the village feel cosy */
  day:   { sky: '#a9d7f5', fog: '#c3d6e8', mountain: '#ecf6dc', plaza: '#d8d1c3', path: '#9a8058',
           hemiSky: '#ffe9cc', hemiGround: '#74713f', hemiI: 0.95,
           sunColor: '#ffc678', sunI: 3.3, window: 0.12, lamp: 0.0 },
  /* night is moonlight, not a dimmer: the fill drops right down so a
     bright silver key from the moon's side carves rims and long shadows,
     and the warm windows, lamps and fire carry the colour against it */
  night: { sky: '#02030a', fog: '#0f1430', mountain: '#5f73a8', plaza: '#4c5470', path: '#4a4436',
           hemiSky: '#6f86c4', hemiGround: '#1a2036', hemiI: 0.5,
           sunColor: '#d2dcff', sunI: 2.3, window: 0.95, lamp: 2.35 }
};
const C = { day: {}, night: {} };
for (const k of ['day', 'night']) {
  for (const f of ['sky', 'fog', 'mountain', 'plaza', 'path', 'hemiSky', 'hemiGround', 'sunColor']) {
    C[k][f] = new THREE.Color(ENV[k][f]);
    C[k][f].offsetHSL(0, 0.15, 0);        // richer world: +15% chroma on every tint
  }
}
const lerp = (a, b, t) => a + (b - a) * t;

/* ---------------- module state ---------------- */
let scene, camera, renderer, controls, sun, hemi;
let composer = null, bloomPass = null;
let mountainMat, plazaMat, pathMat;
const roadMats = [];
/* mountain + outer plain + distant ranges all take the same day/night tint */
const terrainMats = [];
const Q = detectQuality();          // how much scene this device should draw
/* the quality governor: whatever detectQuality() guessed, the real frame
   rate decides. Averaged over PR_WIN frames, a device that cannot hold
   ~45 fps first sheds resolution (down to PR_FLOOR of its tier's pixel
   ratio), then the bloom pass, then the shadows — one step at a time,
   each given time to settle. Resolution comes back when there is headroom;
   bloom and shadows stay off once dropped, so the view never oscillates.
   The names on the map are HTML labels, so a softer canvas costs no text. */
let prScale = 1;
const PR_FLOOR = 0.65, PR_WIN = 40, PR_DROP = 1 / 45, PR_RISE = 1 / 57;
let ftAcc = 0, ftN = 0, prHold = 0, shadowTick = 0;
let bloomOff = false;                // the governor gave up the bloom pass
let hudStats = null, hudCount = 0, hudLast = 0;
let interacting = false;             // a pointer is down on the canvas (see initThree)
let lastGovStep = -9;                // governor clock: no two steps within 3 s

/* ---------------- the black box ----------------
   A black screen that only a manual refresh clears takes its evidence with
   it. The last few notable events — frame errors, a lost WebGL context,
   governor steps, a NaN camera — are kept in localStorage, so the NEXT load
   can show what killed the previous one (?debug=1 shows it unconditionally). */
const BLACKBOX_KEY = 'binomar-blackbox';
let blackbox = [];
try { blackbox = JSON.parse(localStorage.getItem(BLACKBOX_KEY) || '[]'); } catch (e) { blackbox = []; }
const priorBlackbox = Array.isArray(blackbox) ? blackbox : [];
blackbox = [];
function blackboxLog(kind, detail) {
  blackbox.push({ kind, detail: String(detail).slice(0, 300), at: Math.round(performance.now()) });
  if (blackbox.length > 14) blackbox.shift();
  try { localStorage.setItem(BLACKBOX_KEY, JSON.stringify(blackbox)); } catch (e) { /* private mode */ }
  console.warn('[binomar blackbox]', kind, String(detail).slice(0, 300));
}
/* after a crashed session (or with ?debug=1) a small strip lists the last
   recorded events, so the failing machine can report itself */
function showBlackbox() {
  const force = /[?&]debug=1/.test(location.search);
  const crashed = priorBlackbox.some((e) => e && (e.kind === 'frame-error' || e.kind === 'contextlost' || e.kind === 'nan-camera'));
  if (!priorBlackbox.length || (!crashed && !force)) return;
  const strip = document.createElement('div');
  strip.style.cssText = 'position:fixed;bottom:64px;left:18px;z-index:90;max-width:min(560px,80vw);'
    + 'background:rgba(8,10,24,.92);color:#e8e2d2;border:1px solid rgba(227,189,99,.35);border-radius:10px;'
    + 'padding:10px 12px;font:11px/1.5 ui-monospace,Consolas,monospace;white-space:pre-wrap;backdrop-filter:blur(8px)';
  const title = document.createElement('b');
  title.textContent = crashed ? 'last session ended badly — recorded events:' : 'black box (last session):';
  title.style.cssText = 'display:block;margin-bottom:4px;color:#f0c96a';
  strip.appendChild(title);
  for (const e of priorBlackbox.slice(-10)) {
    const line = document.createElement('div');
    line.textContent = ((((e && e.at) || 0) / 1000).toFixed(1) + 's  ' + (e && e.kind) + '  ' + ((e && e.detail) || '')).slice(0, 220);
    strip.appendChild(line);
  }
  const x = document.createElement('button');
  x.type = 'button';
  x.textContent = 'dismiss';
  x.style.cssText = 'margin-top:6px;background:none;border:1px solid rgba(227,189,99,.35);color:#f0c96a;'
    + 'border-radius:6px;padding:2px 10px;cursor:pointer;font:11px ui-monospace,monospace';
  x.addEventListener('click', () => strip.remove());
  strip.appendChild(x);
  document.body.appendChild(strip);
}

/* small, forgiving preference store — private mode throws on access */
function readPref(k) {
  try { return localStorage.getItem('binomar.' + k); } catch (e) { return null; }
}
function writePref(k, v) {
  try { localStorage.setItem('binomar.' + k, v); } catch (e) { /* private mode */ }
}
let ambience = null;
let nightBed = null;
let dayBed = null;
let sky = null, grass = null, traffic = null, leaves = null, windmill = null, weather = null;
let fireflies = null, birds = null, fire = null, plazaMonument = null;
let animals = null, villagers = null, astronomer = null, waterfall = null;
let millWheel = null;
const windowMats = [], lampMats = [], blinkMats = [];
/* materials that only light up after dark: reflectors, signs, lamp
   bloom sprites and light pools. `opacity` picks which channel to drive. */
const roadGlowMats = [];
const smokeStacks = [], weatherVanes = [], marqueeMats = [], banners = [];
let buntingFlags = [];
const buildings = [], hitMeshes = [];
/* placed props that never move, baked across the whole district into one
   mesh per material once it is built (bakeStatic in city-build.js) */
const bakeLater = [];
let companies = [];
let hovered = null, selected = null, needRaycast = false;
/* the site opens at night: the lit windows, the fire, the string lights and
   the Milky Way are the scene at its best, so that is the first impression.
   ☀️ in the HUD takes you to daylight. */
/* every visit opens at night, whatever the last visit preferred: the moon
   over the towers, the Milky Way and the lit windows are the first impression,
   and the overview is already turning slowly (see initThree). The sun button
   in the HUD still switches to daylight. */
let envMix = 1, envTarget = 1;
let camTween = null, flight = null;
const flyFade = document.getElementById('flyFade');
const bannerPos = new THREE.Vector3();

/* the fixed opening angle: the same composing angle the district was built
   around, but close enough that the buildings around the plaza fill the
   first frame and every name plate reads large */
/* the opening view: low over the eastern valley, the HQ spire centred, the
   statue and the falls down the left slope, the chapel and the windmill on
   the right and the moon over the right shoulder */
const HOME = { pos: new THREE.Vector3(143.3, 80, -27.9), target: new THREE.Vector3(0, 63, 0) };

const tooltip = document.getElementById('tooltip');
const ttAvatar = document.getElementById('ttAvatar');

/* the 3D canvas now lives inside the landing-page hero section */
const wrapEl = document.getElementById('scene');
let heroVisible = true;
let flagMesh = null;
let forestWind = null;
const windItems = [];

/* ---------------- three.js core ---------------- */
function initThree() {
  installHeightFog();                  // the valley fills with haze (heightfog.js) — before any shader compiles
  scene = new THREE.Scene();
  scene.background = new THREE.Color(ENV.day.sky);
  /* fog pulled in (150–780): the planted slope stops near r≈150 and the
     first distant-forest belt only starts at r≈198, and at the old 300–1000
     band that gap read as a crisp empty field at the far end of the mountain.
     Nearer haze swallows the bare band into aerial perspective; the sky,
     moon, stars and clouds all set fog:false and stay untouched. */
  scene.fog = new THREE.Fog(ENV.day.fog, 150, 780);

  camera = new THREE.PerspectiveCamera(45, (wrapEl.clientWidth || 1) / (wrapEl.clientHeight || 1), 0.1, 2000);
  camera.position.set(120, 62, 268);   // above the treeline, out past the near belt

  /* with bloom, the scene is drawn into the composer's own (single-sample)
     target and only the finished image reaches the canvas, so a
     multisampled canvas would cost memory and bandwidth for nothing */
  renderer = new THREE.WebGLRenderer({ antialias: Q.antialias && !Q.bloom, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Q.pixelRatio);
  renderer.setSize(wrapEl.clientWidth || 1, wrapEl.clientHeight || 1);
  renderer.shadowMap.enabled = Q.shadows;
  renderer.shadowMap.type = Q.tier === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  /* the shadow pass is the second-heaviest thing we do — every building,
     tree, lamp and car re-renders into the map each frame. Rebuilding it
     every other frame halves that cost and is indistinguishable: the edges
     are soft, and the only fast movers (the cars) read fine at 30 Hz. */
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;       // the first frame must cast
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.3;

  /* image-based lighting: a tiny procedural "studio" pre-filtered into a
     cubemap. Every MeshStandardMaterial — the glass towers, the gold trims,
     the car paint — gets real reflections instead of flat shading. This is
     the single biggest jump in how "expensive" the district looks. */
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
  pmrem.dispose();

  document.getElementById('scene').appendChild(renderer.domElement);
  hudStats = document.getElementById('hudStats');

  controls = new OrbitControls(camera, renderer.domElement);
  /* OrbitControls claims every touch gesture inline; give vertical swipes
     back to the page so phones can scroll past the hero */
  renderer.domElement.style.touchAction = 'pan-y';
  controls.target.copy(HOME.target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.maxPolarAngle = 1.47;
  controls.minDistance = 18;
  controls.maxDistance = 340;
  /* touch: one finger orbits, two fingers pinch-zoom and twist. The stock
     two-finger mode also pans, so every pinch dragged the orbit pivot off
     the district, and a few pinches later the camera was circling an empty
     field. And a finger cannot be as precise as a wheel: on touch screens
     the camera stops short of the rooftops instead of diving into them. */
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE };
  if (matchMedia('(pointer: coarse)').matches) controls.minDistance = 32;
  /* OrbitControls captures the first finger and releases it when the last
     one lifts; on mobile browsers either call can throw for a pointer the
     browser has already cancelled (a swipe it took over as a scroll), and a
     throw in its pointer-up handler leaves it stuck mid-gesture — the map
     then spins or zooms on the next touch. Make both calls forgiving. */
  for (const fn of ['setPointerCapture', 'releasePointerCapture']) {
    const call = renderer.domElement[fn].bind(renderer.domElement);
    renderer.domElement[fn] = (id) => { try { call(id); } catch (e) { /* pointer already gone */ } };
  }
  /* every visit opens on the same fixed overview — the angle the whole
     district was composed around, where every name plate reads — and the
     world is already turning: one gentle lap roughly every two minutes */
  controls.autoRotate = true;              // the district is meant to feel alive
  controls.autoRotateSpeed = AUTO_SPIN;
  controls.enabled = true;

  /* right-drag / two-finger pan can walk the camera clean out of the sky
     domes: past their radius the BackSide domes vanish and, after dark, the
     near-black scene background reads as a black screen. Keep the pivot
     within the district so that can never happen. */
  const panClamp = new THREE.Vector3();
  controls.addEventListener('change', () => {
    const d = controls.target.length();
    if (d > 260) {
      panClamp.copy(controls.target).multiplyScalar(260 / d);
      camera.position.add(panClamp.sub(controls.target));
      controls.target.multiplyScalar(260 / d);
    }
  });

  hemi = new THREE.HemisphereLight(0xffffff, 0x5a7a4a, 0.85);
  sun = new THREE.DirectionalLight(0xfff2dd, 2.4);
  sun.position.set(132, 76, 92);
  sun.castShadow = Q.shadows;
  sun.shadow.mapSize.set(Q.shadowMapSize, Q.shadowMapSize);
  sun.shadow.camera.left = -160; sun.shadow.camera.right = 160;
  sun.shadow.camera.top = 160;   sun.shadow.camera.bottom = -160;
  sun.shadow.camera.near = 10;   sun.shadow.camera.far = 480;
  sun.shadow.bias = -0.0005;
  scene.add(hemi, sun);

  /* bloom: after dark the lit windows, lamps, fire, brand lights and the
     moon's halo spill soft light into the air around them. The threshold
     sits at 1.55 (in linear light, before tone mapping), so only genuinely
     bright emissives glow — sign lettering and moonlit walls stay crisp.
     applyEnv() eases it up at night and almost off by day. */
  if (Q.bloom) {
    const w = wrapEl.clientWidth || 1, h = wrapEl.clientHeight || 1;
    composer = new EffectComposer(renderer);
    composer.setPixelRatio(Q.pixelRatio);
    composer.setSize(w, h);
    composer.addPass(new RenderPass(scene, camera));
    bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.2, 0.55, 1.55);
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass());         // tone mapping + sRGB, as the renderer would
  }

  /* a dropped GPU context paints the canvas black until reload — some
     integrated-GPU PCs lose it under sustained dragging. Ask the driver to
     hand it back (three.js rebuilds its GL state on restore); if it will
     not, try ONE automatic reload per session — never a loop; after that a
     button the user presses. Everything lands in the black box either way. */
  let glBack = false;
  renderer.domElement.addEventListener('webglcontextlost', (ev) => {
    ev.preventDefault();
    blackboxLog('contextlost', 'WebGL context lost');
    const loader = document.getElementById('loader');
    if (loader) {
      loader.classList.remove('hide', 'opening');
      loader.style.setProperty('--p', '1');
      const sub = loader.querySelector('.loader-sub');
      if (sub) sub.textContent = 'Restoring the view…';
    }
    let reloads = 0;
    try { reloads = Number(sessionStorage.getItem('binomar-ctx') || 0); } catch (err) { /* private mode */ }
    if (reloads < 1) {
      try { sessionStorage.setItem('binomar-ctx', '1'); } catch (err) { /* ignore */ }
      setTimeout(() => { try { renderer.forceContextRestore(); } catch (err) { /* already gone */ } }, 900);
      setTimeout(() => { if (!glBack) location.reload(); }, 6000);
      return;
    }
    if (loader) {
      const sub = loader.querySelector('.loader-sub');
      if (sub) sub.textContent = 'The graphics driver dropped the 3D view.';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = 'Reload the view';
      btn.style.cssText = 'margin-top:10px;padding:8px 22px;border-radius:99px;cursor:pointer;'
        + 'border:1px solid rgba(227,189,99,.55);background:rgba(227,189,99,.12);color:#f0c96a;'
        + 'font:600 14px system-ui,sans-serif';
      btn.addEventListener('click', () => location.reload());
      loader.appendChild(btn);
    }
  }, false);
  renderer.domElement.addEventListener('webglcontextrestored', () => {
    glBack = true;
    blackboxLog('contextrestored', 'context handed back');
    renderer.resetState();
    const loader = document.getElementById('loader');
    if (loader) loader.classList.add('hide');
  }, false);

  addEventListener('resize', onResize);
  if (window.ResizeObserver) new ResizeObserver(() => onResize()).observe(wrapEl);

  blackboxLog('boot', Q.tier + ' tier · ' + String(Q.gpu).slice(0, 90));

  /* the governor must never reallocate render buffers while a pointer is on
     the canvas: dragging is exactly when frame time spikes, and a resize
     under load is a black frame (or worse) on some drivers */
  renderer.domElement.addEventListener('pointerdown', () => { interacting = true; }, { passive: true });
  addEventListener('pointerup', () => { interacting = false; }, { passive: true });
  addEventListener('pointercancel', () => { interacting = false; }, { passive: true });
  addEventListener('blur', () => { interacting = false; }, { passive: true });
}

/* ---------------- static environment: sky + weather (terrain is built in buildDistrict) ---------------- */
async function buildEnvironment() {
  /* the whole night sky — milky way, twinkling stars, aurora, meteors,
     moon — lives in sky.js and fades in with the day/night mix */
  sky = createNightSky(scene, Q);
  await step(0.30);
  leaves = createWindParticles(scene, Q.leaves);  // leaves & seed fluff on the gust
  weather = createWeather(scene, Q);             // cumulus, cirrus and valley mist
}

/* ---------------- district: the mountain village ----------------
   Terrain with flattened pads → spiral road + spur paths → summit
   plaza → buildings → slope forest. Everything samples the same
   height function H so it sits flush on the mountainside. */
async function buildDistrict() {
  const sorted = [...companies].sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
  const spots = computeMountainLayout(sorted.length);

  /* heightfield: base terrain + flattened pads for plaza & buildings */
  const baseH = makeBaseTerrain();
  const pads = [{ x: 0, z: 0, r: 21, y: baseH(0, 0) }];
  sorted.forEach((c, i) => {
    const s = spots[i], dims = getBuildingDims(c);
    pads.push({ x: s.x, z: s.z, r: Math.max(dims.w, dims.d) * 0.62 + 3.2, y: baseH(s.x, s.z) });
  });
  const HP = withPads(baseH, pads);
  const H = withRoadBed(HP);                     // graded road: level across, smooth along
  const groundY = baseH(0, 0);

  /* every tree, bush, rock and flower from the model library is collected
     here and drawn as instances once the whole mountain is planted */
  const flora = createFlora(Q.floraTris);

  /* the mountain itself (vertex-coloured; day/night tint via applyEnv) */
  const mountain = makeMountain(H, HP, Q.terrainSeg);
  mountainMat = mountain.material;
  scene.add(mountain);
  terrainMats.push(mountainMat);

  /* and the world it sits in: a rolling plain running out past the fog wall
     so the ground never visibly ends, forested to the horizon */
  const plain = makeOuterPlain(146, 900);
  scene.add(plain);
  terrainMats.push(plain.material);

  const forest = makeDistantForest(Q.forest);
  scene.add(forest);
  for (const m of forest.children) terrainMats.push(m.material);
  forestWind = forest.userData.updateWind || null;   // GPU sway for the merged belts

  await step(0.46);

  /* winding road up from the valley — asphalt crown, gravel shoulders,
     soft verges, all conforming to the slope */
  const surf = roadSurfaceTexture();
  surf.repeat.set(1, 1);
  const offs = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };
  /* each strip carries its own day/night pair — the asphalt must not
     inherit the old dirt-track brown */
  const strip = (opt, dayHex, nightHex) => {
    const m = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, ...offs, ...opt });
    m.userData.dayCol = new THREE.Color(dayHex);
    m.userData.nightCol = new THREE.Color(nightHex);
    roadMats.push(m);
    return m;
  };
  const asphaltMat = strip({ map: surf, roughness: 0.78, metalness: 0.04 }, '#ffffff', '#7e8aa6');
  const shoulderMat = strip({ roughness: 1 }, '#bdb094', '#646979');
  const vergeMat = strip({ roughness: 1 }, '#6f9a4a', '#444f60');
  pathMat = shoulderMat;
  /* the carriageway runs past the prop-line at both ends: inward
     (t0 = -0.125, r ≈ 14) it slides under the summit plaza disc, and
     outward (t1 = 1.15) it narrows to nothing in the valley meadow —
     so neither end of the road is ever seen stopping dead in the grass */
  scene.add(makeRoadRibbon(spiralRoadPoints(-0.125, 1.15), 3.0, null, H, {
    asphalt: asphaltMat, shoulder: shoulderMat, verge: vergeMat, taperEnd: 32
  }));

  /* a small stand of trees around the valley tip, so the dissolving tail
     reads as a track continuing into the woods rather than fading for
     no reason — the same trick the summit end plays with the plaza */
  {
    const rng = mulberry32(31337);
    const tip = roadAt(1.15);
    const tipA = Math.atan2(tip.z, tip.x);
    const tail = spiralRoadPoints(0.9, 1.15, 160);
    for (let i = 0; i < 7; i++) {
      const ta = tipA + (rng() - 0.5) * 0.18;
      const tr = 142 + rng() * 14;
      let tx = Math.cos(ta) * tr, tz = Math.sin(ta) * tr;
      /* flank the track rather than stand on it: the tail runs roughly
         round the mountain here, so step radially (in or out) until clear */
      for (let k = 0; k < 12 && tail.some((p) => Math.hypot(p.x - tx, p.z - tz) < 5.5); k++) {
        const side = i % 2 ? 1 : -1;
        tx += Math.cos(tipA) * side * 1.5; tz += Math.sin(tipA) * side * 1.5;
      }
      if (flora.add('broadleaf', rng, tx, H(tx, tz) - 0.2, tz, 6.5 + rng() * 2.5)) continue;
      const tree = makeTree(rng);
      tree.position.set(tx, H(tx, tz) - 0.1, tz);
      tree.rotation.y = rng() * Math.PI * 2;
      scene.add(tree);
      windItems.push(tree);
    }
  }

  /* spur path from the road (or plaza edge) to every front door */
  const gardenPaths = [];
  sorted.forEach((c, i) => {
    const s = spots[i], dims = getBuildingDims(c);
    const dl = Math.hypot(s.x, s.z) || 1;
    const dx = -s.x / dl, dz = -s.z / dl;                       // toward the plaza
    const door = { x: s.x + dx * (dims.d / 2 + 2.2), z: s.z + dz * (dims.d / 2 + 2.2) };
    const start = s.roadT !== undefined ? roadAt(s.roadT) : { x: -dx * 17.5, z: -dz * 17.5 };
    const mid = { x: (start.x + door.x) / 2 + dz * 1.4, z: (start.z + door.z) / 2 - dx * 1.4 };
    scene.add(makeRoadRibbon([start, mid, door], 1.5, shoulderMat, H, { simple: true }));
    gardenPaths.push([start, mid, door]);
  });

  /* summit plaza: stone disc + monument + flag + tree ring + lamps */
  plazaMat = new THREE.MeshStandardMaterial({ color: ENV.day.plaza, roughness: 0.9 });
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(17.5, 56), plazaMat);
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.y = groundY + 0.05;
  plaza.receiveShadow = true;
  scene.add(plaza);

  const monument = makeMonument();
  monument.group.position.y = groundY;
  /* the HQ model is built at the size it stands; the old procedural
     landmark was scaled up to read as the landmark, not a garden ornament */
  if (!monument.fromModel) monument.group.scale.setScalar(1.38);
  scene.add(monument.group);
  windowMats.push(...monument.signMats);
  lampMats.push(...monument.lampMats);
  if (monument.marquee) marqueeMats.push(monument.marquee);
  if (monument.blink) blinkMats.push(...monument.blink);
  plazaMonument = monument;
  const flag = makeFlag();
  flag.position.set(12.5, groundY, 5.5);
  scene.add(flag);
  flagMesh = flag.userData.flag;
  const rand = mulberry32(20260920);
  /* the fire pit claims one quarter of the square; the tree ring opens up
     around it so there is a clear line of sight to the flames */
  const FIRE_A = 4.19, FIRE_R = 12.6;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.26;
    let da = (a - FIRE_A) % (Math.PI * 2);
    if (da > Math.PI) da -= Math.PI * 2;
    if (da < -Math.PI) da += Math.PI * 2;
    if (Math.abs(da) < 0.62) continue;
    const px = Math.cos(a) * 15.6, pz = Math.sin(a) * 15.6;
    if (flora.add(i % 2 ? 'birch' : 'autumn', rand, px, groundY, pz, 5 + rand() * 1.4)) continue;
    const t = makeTree(rand);
    t.position.set(px, groundY, pz);
    scene.add(t);
    windItems.push(t);
  }
  for (let i = 0; i < 6; i++) {
    /* offset half a step from the plateau plots so no lamp ends up
       standing in a company's doorway */
    const a = (i / 6) * Math.PI * 2 + 0.39 + Math.PI / 6;
    const lx = Math.cos(a) * 16.4, lz = Math.sin(a) * 16.4;
    const lamp = makeStreetLamp(H, lx, lz, rand);
    lamp.position.set(lx, groundY, lz);
    lamp.rotation.y = -a + Math.PI;
    scene.add(lamp);
    lampMats.push(lamp.userData.bulbMat);
    bakeLater.push(lamp);
    lamp.userData.night.forEach((m, k) => roadGlowMats.push({ m, k: lamp.userData.nightK[k], opacity: true }));
  }

  /* bunting strung between the plaza lamps — the village square dressed
     for a festival, and a second read on the wind. Café bulbs hang from
     the same catenary and come on with the street lights. */
  const bunting = makeBunting(16.4, groundY + 5.1, 6,
    ['#38bdf8', '#fbbf24', '#f472b6', '#34d399', '#f97316']);
  bunting.position.y = 0;
  const strings = addStringLights(bunting, 16.4, groundY + 5.1, 6, lampMats);
  for (const f of strings.flares) roadGlowMats.push({ m: f, k: 0.75, opacity: true });
  scene.add(bunting);
  bakeLater.push(bunting);                       // the flags keep swinging (bakeStatic skips them)
  buntingFlags = bunting.userData.flags;

  /* a fire pit in the open quarter of the plaza — clear of the monument,
     the tree ring and every company's front garden */
  const firePit = makeFirePit(rand);
  firePit.position.set(Math.cos(FIRE_A) * FIRE_R, groundY + 0.05, Math.sin(FIRE_A) * FIRE_R);
  scene.add(firePit);
  fire = firePit.userData.fire;

  await step(0.58);

  /* company buildings */
  sorted.forEach((c, i) => {
    const b = makeBuilding(c);
    const s = spots[i];
    b.group.position.set(s.x, H(s.x, s.z) - 0.12, s.z);
    b.baseY = b.group.position.y;                 // mountain seat — animate() lifts from here
    b.group.rotation.y = Math.atan2(-s.x, -s.z);
    b.company = c;
    b.dim = 1;
    scene.add(b.group);
    buildings.push(b);
    hitMeshes.push(b.hit);
    windowMats.push(...b.mats.window);
    blinkMats.push(...b.mats.blink);
    if (b.mats.lamp) lampMats.push(...b.mats.lamp);
    if (b.marquees) marqueeMats.push(...b.marquees);
    if (b.banner) {
      /* the rooftop sign is a live hit target too: hover it for the card,
         click it for the dive — same as the building under it */
      /* the name itself is an HTML label now (see buildLabels): always the
         same legible size. The sprite plate stays as the label's anchor. */
      b.banner.plate.visible = false;
      banners.push(b.banner);
    }
    if (b.halo) {
      /* the clickable cue sits on the pad, not on the building — it has to
         stay on the ground when the building lifts under the cursor */
      b.halo.position.set(s.x, b.baseY + 0.16, s.z);
      b.halo.userData.phase = i * 1.7;
      scene.add(b.halo);
    }
    windItems.push(...b.wind);
    if (b.smoke) smokeStacks.push(...b.smoke);
    if (b.glowMats) for (const gm of b.glowMats) roadGlowMats.push({ ...gm, opacity: true });
    if (b.vane) weatherVanes.push(b.vane);

  });

  await step(0.70);

  /* ---- mountainside forest ------------------------------------------
     Big landmark trees first (they need room), then the conifer belt,
     then bushes and rock clusters to break up the bare slopes. */
  const roadAngleAt = (r) => 0.4 + Math.min(1, Math.max(0, (r - 27) / 104)) * 2.3 * Math.PI * 2;
  const clearOfRoad = (x, z, margin) => {
    const r = Math.hypot(x, z);
    let da = (Math.atan2(z, x) - roadAngleAt(r)) % (Math.PI * 2);
    if (da > Math.PI) da -= Math.PI * 2;
    if (da < -Math.PI) da += Math.PI * 2;
    return Math.abs(da) * Math.max(r, 1) > margin;
  };
  /* clearOfRoad() compares angles at the point's own radius, but the
     spiral's next loop can pass a few metres away radially — that is how
     trees and props ended up standing on the carriageway. roadDist() is the
     real distance to the road's centreline and to every garden path,
     looked up through an 8 m grid so thousands of placements stay cheap. */
  const CELL = 8, roadGrid = new Map();
  const addRoadPt = (x, z) => {
    const key = Math.floor(x / CELL) + ',' + Math.floor(z / CELL);
    if (!roadGrid.has(key)) roadGrid.set(key, []);
    roadGrid.get(key).push(x, z);
  };
  for (const p of spiralRoadPoints(-0.125, 1.15, 1600)) addRoadPt(p.x, p.z);
  for (const path of gardenPaths) {
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i], b = path[i + 1], n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.8);
      for (let k = 0; k <= n; k++) addRoadPt(a.x + (b.x - a.x) * k / n, a.z + (b.z - a.z) * k / n);
    }
  }
  const roadDist = (x, z) => {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    let d2 = Infinity;
    for (let i = -2; i <= 2; i++) {
      for (let j = -2; j <= 2; j++) {
        const pts = roadGrid.get((cx + i) + ',' + (cz + j));
        if (!pts) continue;
        for (let k = 0; k < pts.length; k += 2) {
          const dx = pts[k] - x, dz = pts[k + 1] - z, q = dx * dx + dz * dz;
          if (q < d2) d2 = q;
        }
      }
    }
    return Math.sqrt(d2);                       // Infinity: nothing within ~16 m
  };
  /* margin is clearance from the road's edge; its carriageway and shoulders
     reach about 2.2 m either side of the centreline */
  /* the waterfall comes first: its stream decides where the crane can stand
     (it only needs the terrain), and the bridges below are cut to it */
  waterfall = makeWaterfall(H, { a: 0.79, r: 41, rPool: 55 });
  scene.add(waterfall.group);

  const reserved = [];                    // sites kept for the buildings placed after the forest
  const freeSpot = (x, z, margin) =>
    Math.hypot(x, z) > 18.5 && roadDist(x, z) > margin + 2.2 &&
    !pads.some((p) => Math.hypot(x - p.x, z - p.z) < p.r + margin * 0.4) &&
    !reserved.some((p) => Math.hypot(x - p.x, z - p.z) < p.r + margin * 0.4);
  const reserve = (ang, rad, r) => reserved.push({ x: Math.cos(ang) * rad, z: Math.sin(ang) * rad, r });

  /* the hamlet, the windmill and the plunge pool are placed after the woods
     are planted — keep their ground clear so no tree grows through the inn */
  reserve(2.28, 67.5, 9);                 // market row
  reserve(2.44, 72.5, 8);                 // inn
  reserve(2.15, 69.5, 3);                 // well
  reserve(5.42, 51, 8);                   // chapel
  reserve(3.86, 74, 11);                  // farm
  reserve(0.845, 92, 8);                  // mill
  reserve(1.52, 92.4, 6);                 // viewpoint
  reserve(-0.95, 75, 7);                  // windmill + log pile
  reserve(0.79, 55, 10);                  // plunge pool

  /* the ferris wheel wants the first open meadow behind the market */
  let wheelAt = null;
  for (let r = 70; r < 125 && !wheelAt; r += 2) {
    for (let a = 2.0; a < 2.9 && !wheelAt; a += 0.04) {
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (roadDist(x, z) > 12 && freeSpot(x, z, 8)) wheelAt = { x, z, a };   // half the wheel + a verge
    }
  }
  if (wheelAt) reserved.push({ x: wheelAt.x, z: wheelAt.z, r: 9 });
  /* the crane stands on the next building plot the layout would hand out,
     or the nearest to it that is clear of the road and the stream */
  const plotT = computeMountainLayout(sorted.length + 1)[sorted.length].roadT || 0.46;
  let craneAt = null;
  for (let k = 0; k < 40 && !craneAt; k++) {
    const t = plotT + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.012;
    const p = roadAt(t), x = p.x * (p.r + 12) / p.r, z = p.z * (p.r + 12) / p.r;
    if (roadDist(x, z) > 8 && freeSpot(x, z, 4) &&
        waterfall.streamPts.every((q) => Math.hypot(q.x - x, q.z - z) > 9)) craneAt = { x, z };
  }
  if (craneAt) reserved.push({ x: craneAt.x, z: craneAt.z, r: 6 });

  const staticScatter = [];               // merged in one go once placed
  const plant = (make, n, rMin, rMax, margin, tries, batch) => {
    let placed = 0;
    for (let k = 0; k < tries && placed < n; k++) {
      const a = rand() * Math.PI * 2;
      const r = rMin + Math.pow(rand(), 0.8) * (rMax - rMin);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!freeSpot(x, z, margin)) continue;
      const o = make(x, z, r);
      if (!o) continue;
      if (o !== true) {                     // true: planted into the flora instances
        o.position.set(x, H(x, z) - 0.1, z);
        o.rotation.y = rand() * Math.PI * 2;
        if (batch) staticScatter.push(o);
        else {
          scene.add(o);
          if (o.userData.wind) windItems.push(o);
        }
      }
      placed++;
    }
    return placed;
  };
  /* a model from the library when it loaded, the procedural prop when not.
     Big trees sink a little further so no root shows on the downhill side. */
  const grow = (kind, x, z, height, cast, fallback) =>
    flora.add(kind, rand, x, H(x, z) - Math.min(0.5, height * 0.03), z, height, cast) || fallback();

  /* ---- the woods: small forests, one kind of tree each -----------------
     Trees grow in stands, not as a salt-shake across the slope: birch
     copses and broadleaf stands near the summit, pine woods on the middle
     slopes, maple groves turning on the lower meadows. Each grove is one
     species, tallest in the middle; only its inner trees cast shadows.
     A few specimen trees stand alone in the gaps between the woods. */
  const woods = hasFlora('conifer');
  if (woods) {
    const HEIGHT = { conifer: [8, 13], birch: [6, 9], broadleaf: [7, 11], autumn: [7, 10] };
    /* the slopes the opening camera looks up (HOME sits at ≈ 0.79 rad) get
       the colourful woods — red maple, golden birch — so the first view
       is autumn colour; the far side keeps its pines */
    const VIEW_A = Math.atan2(HOME.pos.z, HOME.pos.x);
    const inView = (a) => Math.abs(Math.atan2(Math.sin(a - VIEW_A), Math.cos(a - VIEW_A))) < 1.35;
    const kindAt = (r, a) => {
      const k = rand();
      if (inView(a)) return k < 0.45 ? 'autumn' : k < 0.8 ? 'birch' : r < 60 ? 'broadleaf' : 'conifer';
      if (r < 60) return k < 0.5 ? 'birch' : 'broadleaf';
      if (r < 100) return k < 0.55 ? 'conifer' : k < 0.8 ? 'broadleaf' : 'birch';
      return k < 0.5 ? 'autumn' : 'conifer';
    };
    const centres = [];
    const want = Q.count(36, Q.scatter);
    for (let g = 0; g < 900 && centres.length < want; g++) {
      /* every third attempt aims into the view sector so it fills first */
      const a = g % 3 === 0 ? VIEW_A + (rand() - 0.5) * 2.4 : rand() * Math.PI * 2;
      const r = 30 + rand() * 112;
      const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
      if (!freeSpot(cx, cz, 8) || centres.some((c) => Math.hypot(c.x - cx, c.z - cz) < 15)) continue;
      const kind = kindAt(r, a), [h0, h1] = HEIGHT[kind];
      const R = 8 + rand() * 7, n = 13 + Math.floor(rand() * 11);
      const trunks = [];
      for (let t = 0; t < n * 6 && trunks.length < n; t++) {
        const ta = rand() * Math.PI * 2, tr = R * Math.sqrt(rand());
        const x = cx + Math.cos(ta) * tr, z = cz + Math.sin(ta) * tr;
        if (!freeSpot(x, z, 2.5) || trunks.some((p) => Math.hypot(p.x - x, p.z - z) < 2.2)) continue;
        const h = (h0 + rand() * (h1 - h0)) * (1 - 0.24 * tr / R);
        flora.add(kind, rand, x, H(x, z) - Math.min(0.5, h * 0.03), z, h, tr < R * 0.55);
        trunks.push({ x, z });
      }
      centres.push({ x: cx, z: cz });
    }
    /* specimens between the woods */
    plant((x, z) => (centres.some((c) => Math.hypot(c.x - x, c.z - z) < 13) ? null
      : grow('landmark', x, z, 11 + rand() * 4, true, () => null)),
    Q.count(16, Q.scatter), 34, 130, 6.5, 400);
    /* infill: young trees scattered through the gaps between the groves, so
       the woods read as one continuous canopy from the overview instead of
       islands of forest on a meadow. Smaller than the grove trees, the same
       mixed kinds, and only a quarter cast shadows — the shadow pass stays
       affordable while the canopy closes */
    plant((x, z, r) => {
      if (centres.some((c) => Math.hypot(c.x - x, c.z - z) < 13)) return null;
      const kind = kindAt(r, Math.atan2(z, x)), [h0, h1] = HEIGHT[kind];
      return grow(kind, x, z, h0 * 0.8 + rand() * (h1 - h0) * 0.55, rand() < 0.25, () => null);
    }, Q.count(140, Q.scatter), 22, 148, 3, 1600);
  } else {
    /* no model library: the procedural mix, as before */
    plant((x, z, r) => makeBigTree(rand, { scale: 0.85 + rand() * 0.6, autumn: r > 95 }),
      Q.count(38, Q.scatter), 30, 132, 6.5, 460);
  }

  /* a grove of three giants guarding the last bend before the summit */
  for (let i = 0; i < 3; i++) {
    const a = 1.15 + i * 0.42;
    const r = 30 + i * 3.5;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!freeSpot(x, z, 3.5)) continue;
    if (flora.add('landmark', rand, x, H(x, z) - 0.5, z, 15 + rand() * 2)) continue;
    const t = makeBigTree(rand, { scale: 1.35 });
    t.position.set(x, H(x, z) - 0.1, z);
    t.rotation.y = rand() * 6.28;
    scene.add(t);
    windItems.push(t);
  }

  if (!woods) {
    /* conifer belt and infill — the procedural fallback. The infill skips
       the shadow pass: at this size and count its shadows cost more than
       they read */
    plant((x, z) => makeGiantPine(rand, { snowy: H(x, z) > 40 && rand() < 0.75 }),
      Q.count(52, Q.scatter), 28, 130, 4.5, 620);
    plant(() => {
      const t = rand() < 0.6 ? makePine(rand) : makeTree(rand);
      t.scale.setScalar(0.85 + rand() * 0.8);
      t.traverse((o) => { if (o.isMesh) o.castShadow = false; });
      return t;
    }, Q.count(118, Q.scatter), 26, 148, 3, 820);
  }

  /* the forest floor: undergrowth, deadfall and meadow flowers. Without
     these the slopes read as a lawn with cones standing on it. */
  plant((x, z) => grow('bush', x, z, 0.7 + rand() * 0.8, false, () => makeBush(rand)),
    Q.count(260, Q.scatter), 20, 152, 2.2, 1400, true);
  plant((x, z) => grow('rock', x, z, 0.8 + rand() * 1.4, true, () => makeRockCluster(rand)),
    Q.count(54, Q.scatter), 24, 156, 2.8, 460, true);
  plant(() => makeStump(rand), Q.count(30, Q.scatter), 26, 148, 2.4, 260, true);
  plant(() => makeFallenLog(rand), Q.count(26, Q.scatter), 26, 146, 3.2, 260, true);
  /* a patch of dandelions is a handful of heads, not one */
  plant((x, z) => {
    if (!hasFlora('flower')) return makeFlowerPatch(rand);
    for (let k = 3 + Math.floor(rand() * 5); k > 0; k--) {
      const fx = x + (rand() - 0.5) * 1.6, fz = z + (rand() - 0.5) * 1.6;
      flora.add('flower', rand, fx, H(fx, fz) - 0.02, fz, 0.35 + rand() * 0.3, false);
    }
    return true;
  }, Q.count(100, Q.scatter), 20, 140, 2.2, 620);
  plant(() => makeCairn(rand), Q.count(9, Q.scatter), 40, 130, 3, 90, true);

  /* meadow grass over the open ground: clumps of the grass models, a metre
     or so tall, so the slopes read as grassland from the overview rather
     than as bare painted terrain. No shadows — it is ground cover. */
  if (hasFlora('meadow')) {
    const steep = (x, z) =>
      Math.hypot(H(x + 1.2, z) - H(x - 1.2, z), H(x, z + 1.2) - H(x, z - 1.2)) / 2.4;
    plant((x, z) => {
      if (steep(x, z) > 0.9) return null;
      for (let k = 3 + Math.floor(rand() * 5); k > 0; k--) {
        const gx = x + (rand() - 0.5) * 5, gz = z + (rand() - 0.5) * 5;
        if (!freeSpot(gx, gz, 1.6)) continue;
        flora.add('meadow', rand, gx, H(gx, gz) - 0.05, gz, 0.5 + rand() * 0.55, false);
      }
      return true;
    }, Q.count(160, Q.scatter), 18, 150, 2, 1500);
  }

  /* the undergrowth never moves, so it can collapse to a handful of meshes */
  for (const m of batchScatter(staticScatter)) scene.add(m);

  /* a grass layer over the meadows, bending with every gust. The tuft model
     is a whole clump where the procedural one was three blades, so it takes
     far fewer of them to cover the same ground. */
  const tuft = bake('grass-tuft', { height: 0.55 });
  grass = createGrass(scene, H, rand, {
    count: tuft ? Math.round(Q.grass * 0.22) : Q.grass,
    geometry: tuft ? tuft.parts[0].geometry : null,
    reject: (x, z) => !freeSpot(x, z, 2.2)
  });

  /* the windmill on the north-east shoulder — the scene's wind vane */
  {
    const a = -0.95, r = 75;                      // clear of the road, which passes r ≈ 62 here
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    windmill = makeWindmill();
    windmill.position.set(x, H(x, z) - 0.2, z);
    windmill.rotation.y = -a + 0.5;
    scene.add(windmill);
    const pile = makeLogPile(rand);
    pile.position.set(x + 4, H(x + 4, z + 3), z + 3);
    pile.rotation.y = rand() * 3;
    scene.add(pile);
  }

  await step(0.82);

  /* ---- the road: lamps, barrier, markings, signage, traffic ---------- */
  const roadPts = spiralRoadPoints();

  const markings = makeRoadMarkings(roadPts, H);
  scene.add(markings.mesh);
  roadGlowMats.push({ m: markings.mat, k: 0.22 });

  /* crash barrier hugging the outside (valley side) of the carriageway */
  const railPts = roadPts.map((p) => {
    const dl = Math.hypot(p.x, p.z) || 1;
    return { x: p.x + (p.x / dl) * 1.85, z: p.z + (p.z / dl) * 1.85 };
  });
  const railMat = new THREE.MeshStandardMaterial({ color: '#b6bfcb', roughness: 0.45, metalness: 0.65 });
  const reflectorMats = [];
  scene.add(makeGuardRail(railPts.filter((_, i) => i % 3 === 0), H, railMat, reflectorMats));
  for (const m of reflectorMats) roadGlowMats.push({ m, k: 1.5 });

  /* street lighting — alternating sides, every other post a little apart */
  const rockMat = new THREE.MeshStandardMaterial({ color: '#8b8a93', roughness: 1, flatShading: true });
  for (let i = 8, n = 0; i < roadPts.length; i += 15, n++) {
    const p = roadPts[i];
    const dl2 = Math.hypot(p.x, p.z) || 1;
    const side = n % 2 === 0 ? 1 : -1;                          // inner / outer kerb
    const ix = (-p.x / dl2) * side, iz = (-p.z / dl2) * side;
    const lx = p.x + ix * 2.5, lz = p.z + iz * 2.5;
    const lamp = makeStreetLamp(H, lx, lz, rand);
    lamp.position.set(lx, H(lx, lz) - 0.05, lz);
    /* the gooseneck leans the lantern (and its light pool) out on local +X,
       so aim that axis back over the road. The old atan2(-ix, -iz) + PI/2
       was exactly PI off, leaving every post lighting the embankment. */
    lamp.rotation.y = Math.atan2(iz, -ix);
    scene.add(lamp);
    lampMats.push(lamp.userData.bulbMat);
    bakeLater.push(lamp);
    lamp.userData.night.forEach((m, k) => roadGlowMats.push({ m, k: lamp.userData.nightK[k], opacity: true }));

    const marker = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28, 0), rockMat);
    const mx = p.x - ix * 2.0, mz = p.z - iz * 2.0;
    marker.position.set(mx, H(mx, mz) + 0.1, mz);
    marker.rotation.set(rand(), rand(), rand());
    scene.add(marker);
  }

  /* chevrons on the hairpins */
  for (let i = 24; i < roadPts.length - 8; i += 9) {
    const p = roadPts[i], q = roadPts[i + 6];
    const turn = Math.abs(Math.atan2(q.z - p.z, q.x - p.x) - Math.atan2(p.z - roadPts[i - 6].z, p.x - roadPts[i - 6].x));
    if (turn < 0.22 || rand() < 0.45) continue;
    const dl = Math.hypot(p.x, p.z) || 1;
    const cx = p.x + (p.x / dl) * 2.4, cz = p.z + (p.z / dl) * 2.4;
    const ch = makeChevron();
    ch.position.set(cx, H(cx, cz), cz);
    ch.rotation.y = Math.atan2(p.x, p.z);
    scene.add(ch);
    roadGlowMats.push({ m: ch.userData.glowMat, k: 0.9 });
  }

  /* signposts: one at the foot of the climb, one before the summit */
  const signs = [
    { t: 0.985, l1: 'BINOMAR SUMMIT', l2: '11 km · elev. 2 140 m', a: '#38bdf8' },
    { t: 0.52, l1: 'COMPANY DISTRICT', l2: 'next 4 bends', a: '#fbbf24' },
    { t: 0.14, l1: 'PLAZA', l2: 'viewpoint ahead', a: '#34d399' }
  ];
  for (const s of signs) {
    const p = roadAt(s.t);
    const dl = Math.hypot(p.x, p.z) || 1;
    const ox = (-p.x / dl) * 4.2, oz = (-p.z / dl) * 4.2;
    const sign = makeRoadSign(s.l1, s.l2, s.a);
    sign.position.set(p.x + ox, H(p.x + ox, p.z + oz), p.z + oz);
    sign.rotation.y = Math.atan2(-ox, -oz) + Math.PI;
    scene.add(sign);
    roadGlowMats.push({ m: sign.userData.signMat, k: 0.55 });
  }

  /* the waterfall (built before the woods, sited on the steepest face the
     terrain offers, well clear of the road and facing the default camera):
     the stream it feeds runs downhill and has to get past the switchback.
     Find every place the two actually meet and put a bridge there — a
     torrent running straight across a carriageway breaks the illusion. */
  {
    const rp = spiralRoadPoints();
    const hits = [];
    for (const sp of waterfall.streamPts) {
      let best = null, bd = Infinity, bi = 0;
      for (let i = 0; i < rp.length; i++) {
        const d = Math.hypot(rp[i].x - sp.x, rp[i].z - sp.z);
        if (d < bd) { bd = d; best = rp[i]; bi = i; }
      }
      if (bd < 3.6) hits.push({ p: best, i: bi });
    }
    /* collapse runs of adjacent samples into one crossing each */
    const crossings = [];
    for (const h of hits) {
      if (!crossings.length || Math.abs(h.i - crossings[crossings.length - 1].i) > 6) crossings.push(h);
    }
    for (const c of crossings) {
      const prev = rp[Math.max(0, c.i - 3)], next = rp[Math.min(rp.length - 1, c.i + 3)];
      const tan = { x: next.x - prev.x, z: next.z - prev.z };
      const len = Math.hypot(tan.x, tan.z) || 1;
      tan.x /= len; tan.z /= len;
      scene.add(makeStoneBridge(H, c.p, tan));
    }
  }

  await step(0.90);

  const marketSpots = [];   // where the stall-keepers stand (handed to life.js)

  /* ---- the places people actually use -----------------------------------
     A market row and an inn at a wide bend, a chapel on the knoll above,
     a farm on the open shoulder, a mill on the stream below the falls and
     a viewpoint where the road turns to face the valley. Placed against
     the road and the stream rather than scattered, so the mountain reads
     as settled rather than decorated. */
  {
    const lit = [];
    const put = (obj, ang, rad, yaw, lift) => {
      const x = Math.cos(ang) * rad, z = Math.sin(ang) * rad;
      obj.position.set(x, H(x, z) + (lift || 0), z);
      obj.rotation.y = yaw === undefined ? Math.atan2(x, z) : yaw;
      scene.add(obj);
      return obj;
    };
    /* the market row sits just off the road, facing it */
    const bendA = 2.28, bendR = 62;
    for (let i = 0; i < 4; i++) {
      const a2 = bendA + (i - 1.5) * 0.058;
      put(makeStall(rand, lit), a2, bendR + 5.5, Math.atan2(Math.cos(a2), Math.sin(a2)) + Math.PI);
      /* a keeper stands a pace behind each awning */
      marketSpots.push(new THREE.Vector2(Math.cos(a2) * (bendR + 7.4), Math.sin(a2) * (bendR + 7.4)));
    }
    const inn = put(makeInn(rand, lit, smokeStacks), bendA + 0.16, bendR + 10.5);
    smokeStacks.push((() => {
      const sm = makeSmokeStack(rand);
      sm.position.copy(inn.userData.smokeAt);
      inn.add(sm);
      return sm;
    })());
    put(makeWell(rand), bendA - 0.13, bendR + 7.5);

    put(makeChapel(rand, lit), 5.42, 51);          // between the loops: the road passes r ≈ 63 here
    put(makeFarm(rand, lit), 3.86, 74);

    /* the mill straddles the stream a little below the road bridge */
    const millA = 0.79 + 0.055, millR = 92;
    const mill = put(makeWatermill(rand, lit), millA, millR,
      Math.atan2(Math.cos(millA), Math.sin(millA)) + Math.PI / 2);
    millWheel = mill.userData.wheel;

    /* the viewpoint looks out over the valley from the outside of a bend */
    const vpA = 1.52, vpR = 88;
    put(makeViewpoint(rand, lit), vpA, vpR + 4.4, Math.atan2(Math.cos(vpA), Math.sin(vpA)));

    windowMats.push(...lit);
  }

  /* ---- the rest of the model library -----------------------------------
     A fairground wheel behind the market, a tower crane on the next free
     plot (the district is still growing — add a company and a building
     rises there), road furniture where the road meets the summit and the
     valley, a palm-fringed pool under the waterfall, bamboo along the
     stream and stepping stones up every garden path. */
  {
    const seat = (obj, x, z, yaw, sink = 0) => {
      obj.position.set(x, H(x, z) - sink, z);
      obj.rotation.y = yaw;
      scene.add(obj);
      return obj;
    };

    /* the wheel and the crane stand on the sites reserved before the woods
       were planted (see reserve() above) */
    const wheel = modelGroup('ferris-wheel', { height: 15 });
    if (wheel && wheelAt) seat(wheel, wheelAt.x, wheelAt.z, -wheelAt.a + Math.PI / 2, 0.3);

    /* the crane's pivot is mid-jib, so measure where its mast meets the
       ground and stand that on the plot, jib reaching out over the valley */
    const crane = modelGroup('crane', { height: 21 });
    const next = craneAt;
    if (crane && next) {
      const foot = new THREE.Box3();
      const v = new THREE.Vector3();
      for (const m of crane.children) {
        const pos = m.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) if (pos.getY(i) < 1.5) foot.expandByPoint(v.fromBufferAttribute(pos, i));
      }
      const mast = foot.getCenter(new THREE.Vector3());
      for (const m of crane.children) m.position.set(-mast.x, 0, -mast.z);
      /* the jib runs along the model's z, away from the mast: turn it outward */
      seat(crane, next.x, next.z, Math.atan2(next.x, next.z) + (mast.z < 0 ? 0 : Math.PI), 0.2);
    }

    /* a zebra crossing and a signal where the road arrives on the summit */
    const cross = roadAt(-0.06), crossNext = roadAt(-0.05);
    const roadYaw = Math.atan2(crossNext.x - cross.x, crossNext.z - cross.z);
    const tile = bake('road-bits', { part: 'road_straight_crossing', length: 3.4 });
    if (tile) {
      const g = new THREE.Group();
      for (const p of tile.parts) {
        const m = p.material;
        m.polygonOffset = true;                   // lie on the asphalt, not in it
        m.polygonOffsetFactor = m.polygonOffsetUnits = -4;
        g.add(new THREE.Mesh(p.geometry, m));
      }
      g.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
      seat(g, cross.x, cross.z, roadYaw, -0.04);
    }
    const signal = modelGroup('traffic-light', { height: 4.6 });
    if (signal) {
      const dl = Math.hypot(cross.x, cross.z) || 1;
      const sx = cross.x + (cross.x / dl) * 2.6, sz = cross.z + (cross.z / dl) * 2.6;
      seat(signal, sx, sz, Math.atan2(cross.x, cross.z) + Math.PI / 2);
    }
    const stop = modelGroup('stop-sign', { height: 2.6 });
    if (stop) {
      const foot = roadAt(0.99), dl = Math.hypot(foot.x, foot.z) || 1;
      const sx = foot.x - (foot.x / dl) * 2.8, sz = foot.z - (foot.z / dl) * 2.8;
      seat(stop, sx, sz, Math.atan2(-foot.x, -foot.z));
    }

    /* palms ring the plunge pool on every side but the fall's */
    const poolA = 0.79, poolX = Math.cos(poolA) * 55, poolZ = Math.sin(poolA) * 55;
    for (let i = 0; i < 6; i++) {
      const a = poolA + (i / 5 - 0.5) * 3.4;            // an arc facing away from the cliff
      const r = 8 + rand() * 3;
      const x = poolX + Math.cos(a) * r, z = poolZ + Math.sin(a) * r;
      if (freeSpot(x, z, 1.5)) flora.add('palm', rand, x, H(x, z) - 0.2, z, 7 + rand() * 4);
    }
    /* bamboo stands along the stream banks, clear of the road and its bridges */
    const sp = waterfall.streamPts;
    const every = Q.tier === 'high' ? 2 : 4;
    for (let i = 2, n = 0; i < sp.length - 1; i += every, n++) {
      const tx = sp[i + 1].x - sp[i - 1].x, tz = sp[i + 1].z - sp[i - 1].z;
      const tl = Math.hypot(tx, tz) || 1;
      const side = n % 2 ? 1 : -1;
      const x = sp[i].x + (-tz / tl) * 2.6 * side, z = sp[i].z + (tx / tl) * 2.6 * side;
      if (freeSpot(x, z, 2.5)) flora.add('bamboo', rand, x, H(x, z) - 0.1, z, 5 + rand() * 3);
    }

    /* stepping stones up the middle of each garden path */
    const stone = bake('path-stones', { length: 1.3 });
    if (stone) {
      const placed = [];
      sorted.forEach((c, i) => {
        const s = spots[i], dims = getBuildingDims(c);
        const dl = Math.hypot(s.x, s.z) || 1;
        const dx = -s.x / dl, dz = -s.z / dl;
        const door = { x: s.x + dx * (dims.d / 2 + 2.2), z: s.z + dz * (dims.d / 2 + 2.2) };
        const start = s.roadT !== undefined ? roadAt(s.roadT) : { x: -dx * 17.5, z: -dz * 17.5 };
        const len = Math.hypot(door.x - start.x, door.z - start.z);
        const yaw = Math.atan2(door.x - start.x, door.z - start.z);
        for (let d = 1.2; d < len - 0.6; d += 1.5) {
          const k = d / len;
          const x = start.x + (door.x - start.x) * k, z = start.z + (door.z - start.z) * k;
          placed.push(new THREE.Matrix4().compose(
            new THREE.Vector3(x, H(x, z) + 0.02, z),
            new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw + (rand() - 0.5) * 0.3),
            new THREE.Vector3(1, 1, 1)));
        }
      });
      for (const p of stone.parts) {
        const mesh = new THREE.InstancedMesh(p.geometry, p.material, placed.length);
        placed.forEach((m, k) => mesh.setMatrixAt(k, m));
        mesh.receiveShadow = true;
        mesh.computeBoundingSphere();
        scene.add(mesh);
      }
    }
  }

  /* lanterns along every garden path, alternating sides — small warm lights
     at walking height are most of what makes a mountain village feel lived
     in after dark. Posts and heads are one instanced mesh each; the heads
     light with the street lamps and bloom does the glow. */
  {
    const posts = [], heads = [];
    const m4 = new THREE.Matrix4(), up = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion();
    for (const path of gardenPaths) {
      for (let i = 0, n = 0; i < path.length - 1; i++) {
        const a = path[i], b = path[i + 1];
        const len = Math.hypot(b.x - a.x, b.z - a.z), nx = -(b.z - a.z) / len, nz = (b.x - a.x) / len;
        for (let d = 1.5; d < len - 0.5; d += 3.6, n++) {
          const side = n % 2 ? 1 : -1;
          const x = a.x + (b.x - a.x) * d / len + nx * side * 1.25;
          const z = a.z + (b.z - a.z) * d / len + nz * side * 1.25;
          const y = H(x, z);
          posts.push(m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, 1, 1)).clone());
          heads.push(m4.compose(new THREE.Vector3(x, y + 1.05, z), q.setFromAxisAngle(up, n), new THREE.Vector3(1, 1, 1)).clone());
        }
      }
    }
    if (posts.length) {
      const postGeo = new THREE.CylinderGeometry(0.045, 0.06, 1.0, 6);
      postGeo.translate(0, 0.5, 0);
      const postMesh = new THREE.InstancedMesh(postGeo,
        new THREE.MeshStandardMaterial({ color: '#2a2f3a', roughness: 0.5, metalness: 0.5 }), posts.length);
      const headMat = new THREE.MeshStandardMaterial({
        color: '#ffe2ae', emissive: new THREE.Color('#ffb85c'), emissiveIntensity: 0, roughness: 0.4
      });
      lampMats.push(headMat);
      const headMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.2, 0.26, 0.2), headMat, heads.length);
      posts.forEach((mm, i) => postMesh.setMatrixAt(i, mm));
      heads.forEach((mm, i) => headMesh.setMatrixAt(i, mm));
      for (const im of [postMesh, headMesh]) { im.computeBoundingSphere(); scene.add(im); }
    }
  }

  /* everything the model library planted goes in as instanced meshes */
  flora.build(scene);

  await step(0.96);
  traffic = createTraffic(scene, H, Q.traffic);
  fireflies = createFireflies(scene, H, Q.fireflies);   // dusk only
  birds = createBirds(scene, H, Q);              // daylight only
  animals = createAnimals(scene, H, { reject: (x, z) => !freeSpot(x, z, 3), deer: Q.deer, rabbits: Q.rabbits });
  /* an astronomer on the tallest roof in the district, out after dark */
  {
    let tallest = buildings[0];
    for (const b of buildings) if (b.height > tallest.height) tallest = b;
    const p = new THREE.Vector3();
    tallest.group.getWorldPosition(p);
    astronomer = createAstronomer(scene,
      new THREE.Vector3(p.x, p.y + tallest.height + 0.5, p.z),
      { facing: Math.atan2(-p.x, -p.z) + Math.PI });
  }

  villagers = createVillagers(scene, H, {
    groundY, plazaR: 17.5, count: Q.villagers,
    fire: new THREE.Vector2(Math.cos(FIRE_A) * FIRE_R, Math.sin(FIRE_A) * FIRE_R),
    market: marketSpots
  });

  /* the IBL environment gives real reflections; keep it shy of showroom
     brightness so the night stays cinematic */
  scene.traverse((o) => {
    const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
    for (const mt of mats) if (mt.isMeshStandardMaterial) mt.envMapIntensity = 0.8;
  });
}

/* ---------------- HUD / UI ---------------- */
function buildUI() {
  const night = document.getElementById('btnNight');
  night.textContent = envTarget > 0.5 ? '☀️' : '🌙';   // label the destination
  night.addEventListener('click', toggleNight);
  document.getElementById('btnHome').addEventListener('click', flyHome);

  /* ambient sound: on from the start, off only when asked (see ambience.js) —
     the engine itself waits for the visitor's first touch. The night bed is
     the same idea with the recording from /audio, softly, from the first
     moment of the district; the day bed is its daytime twin, riding the same
     env mix from the other end so daylight has its own recording */
  nightBed = createNightBed('audio/audio.mp3', { nightMix: () => envMix });
  dayBed = createDayBed('audio/audio-day.mp3', { dayMix: () => envMix });
  const soundBtn = document.getElementById('btnSound');
  if (soundBtn) {
    const show = (on) => {
      soundBtn.textContent = on ? '🔊' : '🔇';
      soundBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      soundBtn.title = on ? 'Mute ambient sound' : 'Play ambient sound';
    };
    ambience = createAmbience({ onChange: show });
    show(ambience.on);
    soundBtn.addEventListener('click', () => {
      ambience.toggle();
      nightBed.enabled = ambience.on;   // one button, one idea of "sound"
      dayBed.enabled = ambience.on;
    });
  }
  document.getElementById('btnFull').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
  });
  buildFinder();
  buildLegend();
  buildLabels();
  buildChips();
  bindKeys();
  const tip = document.getElementById('tooltip');
  /* the pinned card (touch) is itself the way in: tap it to open the company */
  tip.addEventListener('click', () => { if (selected && tip.classList.contains('pinned')) goCompany(selected); });
}

/* ---------------- readable names: HTML labels on the rooftops ----------------
   A sign in the scene shrinks with distance — from the overview a rooftop
   name is a few pixels of texture, whatever it says. These are real text at
   a fixed size: each frame the rooftop is projected to the screen and its
   tag placed there, nearest first; a tag that would overlap one already
   placed is lifted clear, and one the tower would cover steps aside — the
   stem under each tag stretches and swings so it always runs from the tag
   down to the exact rooftop it labels. They are links, so they click and
   tab like the finder. */
const pins = [];
const pinV = new THREE.Vector3();
const towerV = new THREE.Vector3();        // scratch for the tower silhouette (camera-right vector)
let towerBands = null;                     // the HQ tower sliced into height bands (rebuildTowerBands)
let labelTick = 0;

function buildLabels() {
  const layer = document.getElementById('mapLabels');
  if (!layer) return;
  for (const b of buildings) {
    const c = b.company;
    const el = document.createElement('a');
    el.className = 'map-pin';
    /* the pin is a real link to the company's own site, so middle-click and
       Ctrl+click open it natively; a plain click is preventDefault-ed below
       and plays the camera dive first */
    el.href = c.website || 'company.html?id=' + encodeURIComponent(c.id);
    if (c.website) { el.target = '_blank'; el.rel = 'noopener'; }
    el.style.setProperty('--brand', c.color);
    el.innerHTML = '<span class="pin-badge"></span><span class="pin-text"><b></b><small></small></span>' +
      '<span class="pin-go" aria-hidden="true">›</span>';
    fillBadge(el.querySelector('.pin-badge'), c);
    el.querySelector('b').textContent = c.name;
    el.querySelector('small').textContent = getIndustryMeta(c.industry).label;
    el.addEventListener('mouseenter', (ev) => { setHovered(b); moveTooltip(ev.clientX, ev.clientY); });
    el.addEventListener('mouseleave', () => setHovered(null));
    el.addEventListener('click', (ev) => { ev.preventDefault(); goCompany(b); });
    layer.appendChild(el);
    pins.push({ el, b, anchor: (v) => b.banner.plate.getWorldPosition(v) });
  }
  if (plazaMonument) {
    const el = document.createElement('div');
    el.className = 'map-pin hq';
    el.innerHTML = '<span class="pin-badge logo"><img src="assets/brand/logo-128.webp" alt="" /></span>' +
      '<span class="pin-text"><b>BINOMAR GROUP</b><small>Global headquarters</small></span>';
    layer.appendChild(el);
    const top = plazaMonument.height;
    pins.push({ el, b: null, anchor: (v) => plazaMonument.group.localToWorld(v.set(0, top + 1.5, 0)) });
  }
}

/* Slice the HQ tower into height bands, each remembering the widest
   horizontal reach of the real geometry inside it. One big bounding-box
   rectangle would claim far more of the screen than the tapered tower
   actually covers — its podium footprint smeared over the full height —
   and shove banners aside for nothing. The bands follow its true
   profile: wide at the foot, slim at the spire. Rebuilt rarely (the
   tower is static; the odd refresh catches the classic tower's
   late-loading skyscraper GLB). */
function rebuildTowerBands() {
  const box = new THREE.Box3().setFromObject(plazaMonument.group);
  if (box.isEmpty()) { towerBands = null; return; }
  const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
  const N = 7, H = (box.max.y - box.min.y) || 1;
  const bands = [];
  for (let i = 0; i < N; i++) {
    bands.push({ y0: box.min.y + (H * i) / N, y1: box.min.y + (H * (i + 1)) / N, r: 0, cx, cz });
  }
  const mb = new THREE.Box3();
  plazaMonument.group.traverse((o) => {
    if (!o.isMesh) return;
    mb.setFromObject(o);
    if (mb.isEmpty()) return;
    const r = Math.max(
      Math.abs(mb.min.x - cx), Math.abs(mb.max.x - cx),
      Math.abs(mb.min.z - cz), Math.abs(mb.max.z - cz));
    for (const b of bands) if (mb.min.y < b.y1 && mb.max.y > b.y0) b.r = Math.max(b.r, r);
  });
  towerBands = bands;
}

function updateLabels() {
  if (!pins.length) return;
  const w = wrapEl.clientWidth || 1, h = wrapEl.clientHeight || 1;

  /* the tower's screen silhouette this frame, band by band — a banner is
     only ever pushed by the bands its own rectangle truly sits on */
  labelTick++;
  let bands = null;
  if (plazaMonument) {
    if (!towerBands || labelTick % 90 === 0) rebuildTowerBands();
    if (towerBands) {
      const right = towerV.setFromMatrixColumn(camera.matrixWorld, 0);
      right.y = 0;
      if (right.lengthSq() < 1e-6) right.set(1, 0, 0); else right.normalize();
      bands = [];
      for (const bnd of towerBands) {
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, ok = true;
        for (let s = 0; s < 4; s++) {
          pinV.set(bnd.cx + right.x * (s & 1 ? bnd.r : -bnd.r),
                   s & 2 ? bnd.y1 : bnd.y0,
                   bnd.cz + right.z * (s & 1 ? bnd.r : -bnd.r)).project(camera);
          if (pinV.z > 1) { ok = false; break; }     // behind the lens — skip this band
          const sx = (pinV.x + 1) / 2 * w, sy = (1 - pinV.y) / 2 * h;
          if (sx < x0) x0 = sx; if (sx > x1) x1 = sx;
          if (sy < y0) y0 = sy; if (sy > y1) y1 = sy;
        }
        if (ok && x1 > x0) bands.push({ x0: x0 - 4, x1: x1 + 4, y0, y1 });
      }
    }
  }

  for (const p of pins) {
    p.anchor(pinV);
    p.depth = camera.position.distanceTo(pinV);
    pinV.project(camera);
    p.sx = (pinV.x + 1) / 2 * w;
    p.sy = (1 - pinV.y) / 2 * h;
    p.on = !flight && pinV.z > -1 && pinV.z < 1 && p.sx > -60 && p.sx < w + 60 && p.sy > 0 && p.sy < h + 40;
  }
  const placed = [];
  for (const p of [...pins].sort((a, b) => a.depth - b.depth)) {
    p.el.classList.toggle('off', !p.on);
    if (!p.on) continue;
    if (!p.w) { p.w = p.el.offsetWidth; p.h = p.el.offsetHeight; }
    let x0 = p.sx - p.w / 2;
    let lift = 0;
    const y1 = p.sy - 10;

    /* Only move a banner when it truly needs moving. Its resting rectangle
       is tested against the tower bands it actually overlaps — and with
       hysteresis: the side-step engages once the pill bites 6px+ into a
       band, and releases only when it is fully clear again, so a banner
       sitting near the edge never shuffles back and forth. When it does
       step, it goes to the side it already leans toward — a little left
       for left-side buildings, a little right for right-side ones. The
       HQ's own pin (p.b null) stays anchored on the crown by design. */
    let want = x0;
    if (p.b && bands && bands.length) {
      const t = y1 - p.h;                     // the pill's resting rectangle, top edge
      let lx = Infinity, rx = -Infinity, hit = 0;
      for (const g of bands) {
        if (x0 < g.x1 && x0 + p.w > g.x0 && t < g.y1 && y1 > g.y0) {
          lx = Math.min(lx, g.x0); rx = Math.max(rx, g.x1); hit++;
        }
      }
      if (hit) {
        const pen = Math.min(x0 + p.w - lx, rx - x0);      // how deep it bites in
        if (pen > 6) p.blocked = true;
      } else {
        p.blocked = false;                                  // fully clear — come home
      }
      if (p.blocked && hit) {
        const left = x0 + p.w / 2 < (lx + rx) / 2;
        let nx = left ? lx - p.w : rx;
        if (nx < 4 || nx + p.w > w - 4)       // that side runs off-screen: try the other
          nx = left ? rx : lx - p.w;
        want = Math.min(Math.max(nx, 4), Math.max(4, w - 4 - p.w));
      }
    } else if (p.b) {
      p.blocked = false;
    }
    if (p.dx === undefined) p.dx = 0;
    p.dx += (want - (p.sx - p.w / 2) - p.dx) * 0.22;      // glide aside, never snap
    if (Math.abs(want - (p.sx - p.w / 2) - p.dx) < 0.5) p.dx = want - (p.sx - p.w / 2);
    x0 += p.dx;

    for (let k = 0; k < 5; k++) {
      const top = y1 - lift - p.h, bot = y1 - lift;
      if (!placed.some((q) => x0 < q.x1 + 4 && x0 + p.w > q.x0 - 4 && top < q.y1 + 3 && bot > q.y0 - 3)) break;
      lift += p.h + 6;
    }
    const top = y1 - lift - p.h;
    placed.push({ x0, x1: x0 + p.w, y0: top, y1: top + p.h });
    p.el.style.transform = 'translate3d(' + x0.toFixed(1) + 'px,' + top.toFixed(1) + 'px,0)';
    /* the stem is a leader line: from wherever the pill ended up (lifted
       clear, or glided aside by the tower) diagonally down to the rooftop
       anchor. Pill bottom-centre sits at (sx + dx, sy - 10 - lift); the roof
       is at (sx, sy); so the line's length is hypot(dx, 10 + lift) and its
       tilt is atan2(dx, 10 + lift) — CSS rotate() is clockwise-positive. */
    p.el.style.setProperty('--stem', Math.hypot(p.dx, 10 + lift).toFixed(1) + 'px');
    p.el.style.setProperty('--tilt', (Math.atan2(p.dx, 10 + lift) * 57.2958).toFixed(1) + 'deg');
    if (p.b) p.el.classList.toggle('hot', p.b === hovered || p.b === selected);
  }
}

/* ---------------- phones: fly-to chips ----------------
   On a small screen the overview is a lot of district in a little glass.
   A row of chips does the zooming for you: one tap flies the camera in to
   a company and pins its card; tap the card to go inside. */
function buildChips() {
  const bar = document.getElementById('companyChips');
  if (!bar) return;
  const chips = [];
  const add = (label, who, onTap) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.innerHTML = '<span class="pin-badge"></span><span></span>';
    fillBadge(btn.firstChild, who);
    btn.lastChild.textContent = label;
    btn.addEventListener('click', () => {
      for (const c of chips) c.classList.toggle('on', c === btn);
      onTap();
    });
    bar.appendChild(btn);
    chips.push(btn);
  };
  add('District', { name: 'Binomar Group', color: '#e3bd63', logo: 'assets/brand/logo-128.webp' },
    () => { selectBuilding(null); flyHome(); });
  chips[0].firstChild.classList.add('group-mark');          // the gold monogram needs no tile
  for (const b of buildings) {
    const c = b.company;
    add(c.name, c, () => focusCompany(c.id));
  }
}

/* The opening view is composed for a landscape screen. A phone in portrait
   sees a narrow slice of it, so it gets a wider lens and a closer seat:
   the summit ring fills the width and every building reads large. */
const HOME_WIDE = { pos: HOME.pos.clone(), fov: 45 };
function frameForViewport() {
  const w = wrapEl.clientWidth || 1, h = wrapEl.clientHeight || 1;
  const phone = w < 760 || w / h < 0.9;
  camera.fov = phone ? 55 : HOME_WIDE.fov;
  if (phone) {
    const dir = HOME_WIDE.pos.clone().sub(HOME.target).normalize();
    HOME.pos.copy(HOME.target).addScaledVector(dir, w / h < 0.8 ? 100 : 118);
  } else {
    HOME.pos.copy(HOME_WIDE.pos);
  }
}

/* ---------------- the finder ----------------
   A real list of real links. It is how you find a company by name, and it
   is the whole keyboard and screen-reader route into a scene that is
   otherwise one unlabelled canvas. */
let finderQuery = '';

function buildFinder() {
  const panel = document.getElementById('finder');
  const input = document.getElementById('finderInput');
  const close = document.getElementById('finderClose');
  if (!panel) return;

  /* the toolbar 🔍 button is gone: "/" and this event open the finder,
     so the hero CTA can still reach it without a button */
  addEventListener('binomar:finder', () => toggleFinder(true));

  close.addEventListener('click', () => toggleFinder(false));
  input.addEventListener('input', () => {
    finderQuery = input.value.trim().toLowerCase();
    renderFinderList();
  });
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') { toggleFinder(false); return; }
    const first = panel.querySelector('.finder-item');
    if (ev.key === 'Enter' && first) first.click();
    if (ev.key === 'ArrowDown' && first) { ev.preventDefault(); first.focus(); }
  });
  renderFinderList();
}

function toggleFinder(force) {
  const panel = document.getElementById('finder');
  const input = document.getElementById('finderInput');
  if (!panel) return;
  const open = force === undefined ? panel.hidden : force;
  panel.hidden = !open;
  if (open && input) { renderFinderList(); input.focus(); input.select(); }
}

function renderFinderList() {
  const list = document.getElementById('finderList');
  const count = document.getElementById('finderCount');
  if (!list) return;
  list.innerHTML = '';

  const matches = companies.filter((c) => {
    if (!finderQuery) return true;
    const hay = c.name + ' ' + (c.tagline || '') + ' ' + getIndustryMeta(c.industry).label;
    return hay.toLowerCase().includes(finderQuery);
  });

  count.textContent = matches.length + (matches.length === 1 ? ' company' : ' companies');
  if (!matches.length) {
    const li = document.createElement('li');
    li.className = 'finder-empty';
    li.textContent = 'Nothing matches that search.';
    list.appendChild(li);
    return;
  }

  for (const c of matches) {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.className = 'finder-item';
    a.href = 'company.html?id=' + encodeURIComponent(c.id);
    const dot = document.createElement('span');
    dot.className = 'dot';
    fillBadge(dot, c);
    const body = document.createElement('span');
    body.className = 'fi-body';
    const nm = document.createElement('span');
    nm.className = 'fi-name';
    nm.textContent = c.name;
    const ind = document.createElement('span');
    ind.className = 'fi-ind';
    ind.textContent = getIndustryMeta(c.industry).label;
    body.append(nm, ind);
    const go = document.createElement('span');
    go.className = 'fi-go';
    go.textContent = 'Show →';
    a.append(dot, body, go);

    /* a plain click flies the camera there; modifier-click or Enter on the
       link still opens the page, because it is a real link */
    a.addEventListener('click', (ev) => {
      if (ev.metaKey || ev.ctrlKey || ev.shiftKey) return;
      ev.preventDefault();
      focusCompany(c.id);
      if (Q.mobile) toggleFinder(false);
    });
    a.addEventListener('keydown', (ev) => {
      if (ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp') return;
      ev.preventDefault();
      const items = [...list.querySelectorAll('.finder-item')];
      const next = items[items.indexOf(a) + (ev.key === 'ArrowDown' ? 1 : -1)];
      if (next) next.focus();
      else if (ev.key === 'ArrowUp') document.getElementById('finderInput').focus();
    });
    li.appendChild(a);
    list.appendChild(li);
  }
}

/* fly the camera to a company without leaving the map */
function focusCompany(id, opts) {
  const b = buildings.find((x) => x.company.id === id);
  if (!b) return false;
  if (heroOut > 0.02) scrollTo({ top: 0, behavior: 'smooth' });   // bring the map into view first
  selectBuilding(b);
  const centre = new THREE.Vector3();
  b.group.getWorldPosition(centre);
  const focus = centre.clone();
  focus.y += b.height * 0.42;
  const out = new THREE.Vector3(centre.x, 0, centre.z);
  if (out.lengthSq() < 1e-4) out.set(1, 0, 1);
  out.normalize();
  const reach = Math.max(26, b.height * 2.1);
  camTween = {
    t: 0, dur: (opts && opts.instant) ? 0.01 : 1.5,
    fromP: camera.position.clone(), fromT: controls.target.clone(),
    toP: focus.clone().addScaledVector(out, reach)
      .addScaledVector(new THREE.Vector3(0, 1, 0), reach * 0.5),
    toT: focus
  };
  controls.enabled = false;
  controls.autoRotate = false;
  return true;
}

/* ---------------- the legend ----------------
   A persistent note beats a hint that vanishes after nine seconds. It is
   dismissible, and it stays dismissed. */
function buildLegend() {
  const el = document.getElementById('hudLegend');
  if (!el) return;
  if (readPref('legend') === 'hidden') { el.remove(); return; }
  document.getElementById('legendClose').addEventListener('click', () => {
    el.classList.add('fade');
    setTimeout(() => el.remove(), 600);
    writePref('legend', 'hidden');
  });
}

/* ---------------- keyboard ----------------
   The canvas cannot be tabbed into, so these are what make the map operable
   without a mouse: / to search, arrows to walk the district, Enter to open. */
function bindKeys() {
  addEventListener('keydown', (ev) => {
    const typing = ev.target && /^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName);
    if (ev.key === '/' && !typing) { ev.preventDefault(); toggleFinder(true); return; }
    if (typing || flight) return;

    if (ev.key === 'Escape') { selectBuilding(null); setHovered(null); toggleFinder(false); }
    if (ev.key === 'Home' || ev.key === 'h' || ev.key === 'H') flyHome();
    if (ev.key === 'n' || ev.key === 'N') toggleNight();
    if (ev.key === 'Enter' && selected) { goCompany(selected); return; }

    if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') {
      ev.preventDefault();
      const pool = buildings;
      if (!pool.length) return;
      const i = selected ? pool.indexOf(selected) : -1;
      const step = ev.key === 'ArrowRight' ? 1 : pool.length - 1;
      focusCompany(pool[(i + step + pool.length) % pool.length].company.id);
    }
  });
}

function toggleNight() {
  envTarget = envTarget > 0.5 ? 0 : 1;
  document.getElementById('btnNight').textContent = envTarget > 0.5 ? '☀️' : '🌙';
  if (heroEl) heroEl.classList.toggle('is-day', envTarget < 0.5);   // white clouds by day (style.css)
  writePref('time', envTarget > 0.5 ? 'night' : 'day');
}

/* ---------------- tooltip ---------------- */
function populateTooltip(b) {
  const c = b.company;
  fillBadge(ttAvatar, c);
  document.getElementById('ttName').textContent = c.name;
  document.getElementById('ttIndustry').textContent = getIndustryMeta(c.industry).label;
  document.getElementById('ttTagline').textContent = c.tagline || 'Part of Binomar Group';
  document.getElementById('ttCta').textContent =
    (tooltip.classList.contains('pinned') && selected === b) ? 'Tap to open →' : 'Click to explore →';
}

function moveTooltip(x, y) {
  const r = tooltip.getBoundingClientRect();
  let left = x + 16, top = y + 16;
  if (left + r.width > innerWidth - 8) left = x - r.width - 16;
  if (top + r.height > innerHeight - 8) top = y - r.height - 16;
  tooltip.style.left = left + 'px';
  tooltip.style.top = top + 'px';
}

function setHovered(b) {
  if (hovered === b) return;
  hovered = b;
  if (b) {
    populateTooltip(b);
    tooltip.classList.add('show');
    document.body.style.cursor = 'pointer';
  } else {
    tooltip.classList.remove('show');
    document.body.style.cursor = '';
  }
}

function selectBuilding(b) {
  selected = b;
  if (b) {
    tooltip.classList.add('show', 'pinned');
    populateTooltip(b);
  } else {
    tooltip.classList.remove('show', 'pinned');
  }
}

/* ---------------- the dive into a company ----------------
   Click a building and the camera falls toward it: barely moving at
   first, then rushing the last stretch, while the scene dims into the
   detail page. The cubic easing is what makes it feel like a dive
   rather than a pan. */
function goCompany(b) {
  if (flight) return;                       // already on our way
  const centre = new THREE.Vector3();
  b.group.getWorldPosition(centre);
  const focus = centre.clone();
  focus.y += b.height * 0.42;

  /* end up off the building's plaza-facing front, a little above eye line */
  const out = new THREE.Vector3(centre.x, 0, centre.z);
  if (out.lengthSq() < 1e-4) out.set(1, 0, 1);
  out.normalize();
  const reach = Math.max(12, b.height * 0.9);
  const to = focus.clone()
    .addScaledVector(out, reach * 0.78)
    .addScaledVector(new THREE.Vector3(0, 1, 0), reach * 0.34);

  flight = {
    t: 0, dur: 1.5, fov0: camera.fov,
    fromP: camera.position.clone(), fromT: controls.target.clone(),
    toP: to, toT: focus,
    /* a company with its own site (see data/companies.js) gets the dive
       straight into it; without one the internal profile page takes over */
    href: b.company.website || 'company.html?id=' + encodeURIComponent(b.company.id)
  };
  controls.enabled = false;
  controls.autoRotate = false;
  setHovered(null);
  tooltip.classList.remove('show', 'pinned');
  document.body.style.cursor = '';
}

/* ---------------- raycast interaction ---------------- */
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function buildingAtPointer() {
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(hitMeshes, false);
  if (!hits.length) return null;
  const id = hits[0].object.userData.companyId;
  return buildings.find((x) => x.company.id === id) || null;
}

function initInteraction() {
  const el = renderer.domElement;
  let down = null;

  el.addEventListener('pointermove', (ev) => {
    const rect = el.getBoundingClientRect();          // hero may be scrolled
    pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    if (ev.pointerType === 'touch') return;
    needRaycast = true;
    moveTooltip(ev.clientX, ev.clientY);
  });

  el.addEventListener('pointerdown', (ev) => {
    down = { x: ev.clientX, y: ev.clientY, t: performance.now() };
    controls.autoRotate = false;
    endIntro();                              // the map is theirs from the first touch
  });

  /* The 3D map is the hero of a page with content below it, so the wheel
     scrolls the page. Zooming the map is deliberate: Ctrl/⌘ + wheel (a
     trackpad pinch arrives as ctrl + wheel too), or the +/− buttons. This
     runs in the capture phase, before OrbitControls sees the event, and
     only lets OrbitControls zoom — and swallow the scroll — when asked. */
  controls.enableZoom = false;
  const hint = document.getElementById('zoomHint');
  if (hint && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) {
    hint.innerHTML = 'Hold <b>⌘</b> and scroll to zoom the map';
  }
  let hintTimer = 0;
  wrapEl.addEventListener('wheel', (ev) => {
    const zoom = ev.ctrlKey || ev.metaKey;
    controls.enableZoom = zoom;
    if (zoom) { controls.autoRotate = false; endIntro(); return; }
    if (!hint || heroOut > 0.05) return;     // leaving the hero: the wheel is just scrolling
    hint.classList.add('show');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => hint.classList.remove('show'), 1300);
  }, { capture: true, passive: true });

  /* on touch, one finger dragging up or down scrolls the page (the canvas is
     touch-action: pan-y), sideways it orbits; two fingers pinch-zoom */
  const touches = new Set();
  const syncTouchZoom = () => { controls.enableZoom = touches.size >= 2; };
  wrapEl.addEventListener('pointerdown', (ev) => {
    if (ev.pointerType !== 'touch') return;
    touches.add(ev.pointerId);
    syncTouchZoom();
  }, true);
  /* listened for on the whole window: a finger that lifts off over a name
     tag or the page must still be forgotten, or the next single-finger
     touch counts as a second one and pinches instead of turning */
  for (const type of ['pointerup', 'pointercancel']) {
    addEventListener(type, (ev) => {
      if (touches.delete(ev.pointerId)) syncTouchZoom();
    }, true);
  }

  const zoomBtn = (id, f) => {
    const b = document.getElementById(id);
    if (b) b.addEventListener('click', () => zoomBy(f));
  };
  zoomBtn('btnZoomIn', 0.72);
  zoomBtn('btnZoomOut', 1.38);

  /* the "discover the group" cue bows out once the page has been scrolled */
  const cue = document.getElementById('scrollCue');
  if (cue) addEventListener('scroll', () => cue.classList.toggle('gone', scrollY > 40), { passive: true });

  el.addEventListener('pointerup', (ev) => {
    if (!down) return;
    const moved = Math.hypot(ev.clientX - down.x, ev.clientY - down.y);
    const dtms = performance.now() - down.t;
    down = null;
    if (moved > 8 || dtms > 700 || flight) return;
    const rect = el.getBoundingClientRect();
    pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    const b = buildingAtPointer();
    if (!b) {
      if (ev.pointerType === 'touch') selectBuilding(null);
      return;
    }
    if (ev.pointerType === 'touch') {
      if (selected === b) goCompany(b);
      else selectBuilding(b);
    } else {
      goCompany(b);
    }
  });

  el.addEventListener('pointerleave', () => setHovered(null));

  addEventListener('keydown', (ev) => {
    if (flight) return;
    if (ev.key === 'Escape') { selectBuilding(null); setHovered(null); }
    if (ev.key === 'Home' || ev.key === 'h' || ev.key === 'H') flyHome();
  });
}

/* ---------------- day ↔ night blending ---------------- */
function applyEnv(m) {
  scene.background.lerpColors(C.day.sky, C.night.sky, m);
  scene.fog.color.lerpColors(C.day.fog, C.night.fog, m);
  for (const mt of terrainMats) mt.color.lerpColors(C.day.mountain, C.night.mountain, m);
  plazaMat.color.lerpColors(C.day.plaza, C.night.plaza, m);
  for (const mt of roadMats) {
    mt.color.lerpColors(mt.userData.dayCol, mt.userData.nightCol, m);
  }
  hemi.color.lerpColors(C.day.hemiSky, C.night.hemiSky, m);
  hemi.groundColor.lerpColors(C.day.hemiGround, C.night.hemiGround, m);
  hemi.intensity = lerp(ENV.day.hemiI, ENV.night.hemiI, m);
  sun.color.lerpColors(C.day.sunColor, C.night.sunColor, m);
  sun.intensity = lerp(ENV.day.sunI, ENV.night.sunI, m);
  /* the key light swings from the sun to the moon so shadows agree
     with whichever body is actually in the sky */
  sun.position.set(lerp(132, -128, m), lerp(76, 118, m), lerp(92, -86, m));

  const win = lerp(ENV.day.window, ENV.night.window, m);
  for (const mt of windowMats) mt.emissiveIntensity = win;
  const lamp = lerp(ENV.day.lamp, ENV.night.lamp, m);
  for (const mt of lampMats) mt.emissiveIntensity = lamp;
  /* bloom: a whisper by day (only the sun-struck gold catches), a warm
     halo round only the genuinely bright points after dark — lamp heads,
     signage, fire, the beacon. Lit windows sit below the threshold and
     read as calm interior glass, not glowing orbs */
  if (bloomPass) {
    bloomPass.strength = lerp(0.08, 0.3, m);
    bloomPass.threshold = lerp(1.8, 1.55, m);
    bloomPass.radius = lerp(0.3, 0.34, m);
  }
  /* reflectors, sign faces, lamp bloom and the pools of light on the road */
  for (const it of roadGlowMats) {
    if (it.opacity) it.m.opacity = it.k * m;
    else it.m.emissiveIntensity = it.k * m;
  }

}

/* ---------------- camera helpers ---------------- */
/* a short eased dolly toward / away from the orbit target (the +/− buttons) */
let zoomTween = null;
function zoomBy(f) {
  const len = camera.position.distanceTo(controls.target);
  const to = Math.min(controls.maxDistance, Math.max(controls.minDistance, len * f));
  zoomTween = { t: 0, from: len, to };
  controls.autoRotate = false;
}

/* ---------------- the opening shot ----------------
   As the loader lifts, the camera glides down onto the overview — from
   higher, further out and a sixth of a turn back, sweeping round the
   summit rather than sliding in a straight line — and comes to rest
   exactly on HOME. The auto-rotate then eases up from standstill, so the
   landing and the slow lap join without a seam. Only the camera moves (the
   scene is drawn every frame anyway), so it costs nothing extra on a phone.
   Touching the map, a button or a search ends it at once. */
const AUTO_SPIN = 0.5;                       // the overview's lap speed (controls.autoRotateSpeed)
const INTRO = { dur: 3.2, turn: 0.55, out: 0.6, lift: 44 };
let intro = null, spinUp = 1;

function startIntro() {
  if (Q.reducedMotion) return;
  intro = { t: 0 };
  controls.autoRotateSpeed = 0;
  placeIntro(0);
}

function placeIntro(p) {
  /* ease-out: the loader's fade covers the quick start, the eye gets the
     long, slowing glide into place */
  const k = 1 - Math.pow(1 - p, 3), r = 1 - k;
  const dx = HOME.pos.x - HOME.target.x, dz = HOME.pos.z - HOME.target.z;
  /* auto-rotate turns the azimuth downward, so the sweep does too */
  const az = Math.atan2(dx, dz) + INTRO.turn * r;
  const rad = Math.hypot(dx, dz) * (1 + INTRO.out * r);
  camera.position.set(
    HOME.target.x + Math.sin(az) * rad,
    HOME.pos.y + INTRO.lift * r,
    HOME.target.z + Math.cos(az) * rad);
  controls.target.copy(HOME.target);
  camera.lookAt(controls.target);
}

function endIntro() {
  if (!intro) return;
  intro = null;
  spinUp = 0;                                // the lap eases in from here (see animate)
}

/* the headline's half of the opening: each word of the welcome (and the
   buttons) rises into place one after another, in CSS, the moment the
   loader lifts. Prepared early so nothing flashes. Elements may be absent
   (the overlay says just the one line now) — cue skips them quietly. */
function prepareHeadline() {
  const ov = document.getElementById('heroOverlay');
  const head = ov && ov.querySelector('.hero-head');
  if (!ov || !head || Q.reducedMotion) return;
  let d = 0.35;
  const cue = (el, gap) => { if (!el) return; el.classList.add('w'); el.style.setProperty('--d', d.toFixed(2) + 's'); d += gap; };
  for (const node of [...head.childNodes]) {
    if (node.nodeType === Node.TEXT_NODE) {
      const frag = document.createDocumentFragment();
      for (const part of node.textContent.split(/(\s+)/)) {
        if (!part) continue;
        if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); continue; }
        const span = document.createElement('span');
        span.textContent = part;
        cue(span, 0.09);
        frag.appendChild(span);
      }
      head.replaceChild(frag, node);
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      cue(node, 0.12);                         // the brand keeps one gradient
    }
  }
  d += 0.1;
  cue(ov.querySelector('.hero-sub'), 0.14);
  cue(ov.querySelector('.hero-cta'), 0);
  ov.classList.add('intro');
}

function playHeadline() {
  const ov = document.getElementById('heroOverlay');
  if (ov) ov.classList.add('play');
  /* the overlay's own "step aside after a while" countdown starts now,
     not while the loader was still up (see index.html) */
  dispatchEvent(new Event('binomar:intro'));
}

function flyHome() {
  camTween = { t: 0, dur: 1.3, fromP: camera.position.clone(), fromT: controls.target.clone() };
  controls.autoRotate = true;              // the overview is meant to keep turning
  controls.enabled = false;
}

/* ---------------- coming back from another page ----------------
   The dive hands the tab over to a company site with the fade at full
   opacity and the camera inside a building. Browsers often bring the
   district back from the back/forward cache on Back — frozen exactly
   there: a dark screen, dead controls, nowhere to click. A bfcache
   restore is caught here, the dive is undone, and the camera glides
   home to the same fixed overview a fresh visit opens on. (A full
   reload — the other way Back can land — already does this in main().) */
addEventListener('pageshow', (ev) => {
  if (!ev.persisted || !camera || !controls) return;   // ordinary load: main() owns it
  blackboxLog('bfrestore', 'restored from the back/forward cache');
  flight = null; zoomTween = null; intro = null;
  if (flyFade) flyFade.style.opacity = 0;              // lift the dive's dark veil
  camera.fov = 45;                                     // undo the dive's lens punch (the constructor lens)
  camera.updateProjectionMatrix();
  setHovered(null);
  tooltip.classList.remove('show', 'pinned');
  flyHome();                                           // glide to the overview; controls return on landing
  controls.autoRotateSpeed = AUTO_SPIN;
  if (ambience && ambience.resume) ambience.resume();  // the synth's engine can come back suspended
});

let lastW = 0, lastH = 0;
function onResize() {
  const w = wrapEl.clientWidth || 1, h = wrapEl.clientHeight || 1;
  /* a phone fires resize every time its address bar slides in or out while
     scrolling, though the hero (sized in svh) has not changed. Resizing the
     renderer anyway reallocates the canvas and flashes a blank frame. */
  if (w === lastW && h === lastH) return;
  lastW = w; lastH = h;
  camera.aspect = w / h;
  if (!flight) frameForViewport();
  camera.updateProjectionMatrix();
  for (const p of pins) p.w = 0;              // re-measure the labels at the new size
  renderer.setSize(w, h);
  if (composer) composer.setSize(w, h);
  if (fold) fold.setSize(w, h);
}

/* ---------------- the sky pass: 3D district → page ----------------
   The hero pins inside the #heroRun runway while the camera rolls its gaze
   up off the district into the night sky — the moon, the Milky Way, the
   silvered clouds overhead — and then <main> rises from the bottom like a
   sheet and slides over the pinned sky (style.css). The raw scroll share
   (skyTarget) is eased into skySmooth every frame; it drives the camera
   and the --sp variable the CSS reads. Scrolling back up plays it in
   reverse and hands the camera back exactly where the visitor left it. */
let heroOut = 0;                              // how far the visitor has left the map, 0..1
let skyOK = false, skyTarget = 0, skySmooth = 0, skyOn = false, skyFrom = null, lastSpSent = -1;
let sheetUp = false;                          // the page covers the hero: the sky is a backdrop
let fold = null, foldOpen = 1, foldBlank = false;  // the accordion fold (fold.js): share still unfolded
let underTick = 0, underAcc = 0;             // the backdrop's reduced frame rate (animate)
const heroEl = document.getElementById('hero');
const skyPos = new THREE.Vector3(), skyTgt = new THREE.Vector3();
const smoothstep = (x) => x * x * (3 - 2 * x);

function skyPass(sp) {
  /* the tilt is done by the time the page starts rising (~42 %); after
     that the camera only drifts on, so the sky under the sheet is alive */
  const e = smoothstep(Math.min(1, sp / 0.5));
  const drift = Math.max(0, sp - 0.5);
  const dx = HOME.pos.x - HOME.target.x, dz = HOME.pos.z - HOME.target.z;
  const az = Math.atan2(dx, dz) - 0.3 * e - 0.25 * drift;  // a slow bank, the way the lap turns
  const rad = Math.hypot(dx, dz) * (1 + 0.12 * e);
  skyPos.set(
    HOME.target.x + Math.sin(az) * rad,
    HOME.pos.y + 22 * e,                             // a little lift, still under the cloud deck
    HOME.target.z + Math.cos(az) * rad);
  /* the gaze rolls up from the plaza to high over the summit — about 70°
     above the horizon, where the stars and the Milky Way are */
  skyTgt.set(HOME.target.x, HOME.target.y + 480 * Math.pow(e, 1.15), HOME.target.z);
  const w = wrapEl.clientWidth || 1, h = wrapEl.clientHeight || 1;
  const baseFov = (w < 760 || w / h < 0.9) ? 55 : 45; // mirrors frameForViewport
  let fov = baseFov + 12 * e;                        // the sky opens up as the gaze lifts
  if (skyFrom) {
    /* blend from whatever view the visitor had, so taking the camera never
       snaps: the first quarter of the runway morphs their view onto the path */
    const k = smoothstep(Math.min(1, sp / 0.25));
    camera.position.lerpVectors(skyFrom.p, skyPos, k);
    controls.target.lerpVectors(skyFrom.t, skyTgt, k);
    fov = THREE.MathUtils.lerp(skyFrom.f, fov, k);
  } else {
    camera.position.copy(skyPos);
    controls.target.copy(skyTgt);
  }
  camera.fov = fov;
  camera.lookAt(controls.target);
  camera.updateProjectionMatrix();
}

/* called once a frame from animate(): ease the progress, take or return
   the camera, and publish --sp for the CSS half. Returns true while the
   sky pass owns the camera. */
function updateSkyPass(dt) {
  if (!skyOK) return false;
  skySmooth += (skyTarget - skySmooth) * Math.min(1, dt * 7);
  if (Math.abs(skyTarget - skySmooth) < 0.0004) skySmooth = skyTarget;
  const wasOn = skyOn;
  skyOn = skySmooth > 0.0015;
  if (skyOn && !wasOn) {                      // engage: the climb takes the camera
    endIntro();
    camTween = null; zoomTween = null;
    controls.enabled = false;
    skyFrom = { p: camera.position.clone(), t: controls.target.clone(), f: camera.fov };
  }
  if (!skyOn && wasOn) {                      // back at the top: hand it back as it was
    camera.position.copy(skyFrom.p);
    controls.target.copy(skyFrom.t);
    camera.fov = skyFrom.f;
    camera.updateProjectionMatrix();
    skyFrom = null;
    if (camTween) {
      /* a flight asked for from down the page (the finder, a card) waited
         for the climb to unwind: it starts from here, not from the sky */
      camTween.fromP.copy(camera.position);
      camTween.fromT.copy(controls.target);
      camTween.t = 0;
    } else {
      controls.enabled = true;
    }
  }
  if (heroEl && Math.abs(skySmooth - lastSpSent) > 0.0005) {
    lastSpSent = skySmooth;
    heroEl.style.setProperty('--sp', skySmooth.toFixed(4));
  }
  return skyOn;
}

/* the sections below the hero rise in with a soft 3D swing, staggered by
   an index within their own row (see .reveal in style.css) */
function markReveals() {
  const els = document.querySelectorAll(
    '#companyGrid .cl-link, #districtStats .stat, main .band .sec-title, ' +
    'main .band .sec-sub, main .band .sec-text, main .band .cta-row');
  els.forEach((el) => el.classList.add('reveal'));
  for (const g of document.querySelectorAll('#companyGrid, #districtStats'))
    [...g.children].forEach((c, i) => c.style.setProperty('--i', Math.min(i, 10)));
  if (!window.IntersectionObserver) { els.forEach((el) => el.classList.add('in', 'settled')); return; }
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      const el = en.target;
      el.classList.add('in');
      io.unobserve(el);
      /* a card drops its slow, staggered entrance timing once it has landed
         (style.css: .cl-link.settled) */
      if (el.classList.contains('cl-link')) {
        setTimeout(() => el.classList.add('settled'), 950 + 70 * (+el.style.getPropertyValue('--i') || 0));
      }
    }
  }, { threshold: 0.05, rootMargin: '0px 0px -6% 0px' });
  els.forEach((el) => io.observe(el));
}

function initSkyPass() {
  const run = document.getElementById('heroRun');
  const motion = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!run || !heroEl) { markReveals(); return; }

  /* the runway holds the pinned hero, a spacer and the page itself, so the
     sky stays pinned behind the page for the whole read. The pass takes
     `pass` px of scrolling — the tilt, then the page rising a full screen
     over the sky — a little less on phones. The spacer is what makes the
     page arrive at the bottom of the screen part-way through and meet the
     navbar exactly at the end of the pass. Without motion: no spacer, and
     the page simply follows the hero. */
  const page = run.querySelector('main');
  const spacer = run.querySelector('.sky-spacer');
  let pass = 0, runW = 0, runH = 0;
  /* sized once, and again only for a real resize: a phone's address bar
     sliding in and out mid-scroll changes innerHeight by ~60 px, and
     re-sizing the runway then shifted the page under the finger */
  const sizeRunway = () => {
    if (innerWidth === runW && Math.abs(innerHeight - runH) < 160) return;
    runW = innerWidth; runH = innerHeight;
    pass = motion ? Math.round(innerHeight * (innerWidth < 760 ? 1.35 : 1.6)) : 0;
    if (spacer) spacer.style.height = motion ? Math.max(0, pass - heroEl.offsetHeight) + 'px' : '0px';
    if (page) page.style.marginTop = motion && spacer ? '' : '0px';
  };
  sizeRunway();

  const measure = () => {
    const total = pass || heroEl.offsetHeight || 1;
    heroOut = Math.min(1, Math.max(0, scrollY / total));
    if (motion) skyTarget = heroOut;
    if (!page) return;
    const pt = page.getBoundingClientRect().top, hr = heroEl.getBoundingClientRect();
    sheetUp = pt <= hr.top + 2;
    /* the fold follows the page itself, not the eased --sp, so its bottom
       crease always sits on the page's leading edge (a few px under it) */
    foldOpen = Math.min(1, Math.max(0, (pt - hr.top + 10) / (hr.height || 1)));
  };
  addEventListener('scroll', measure, { passive: true });
  addEventListener('resize', () => { sizeRunway(); measure(); });
  measure();
  if (motion) {
    skyOK = true;
    skySmooth = skyTarget;                    // a reload mid-page must not replay it
    const w = wrapEl.clientWidth || 1, h = wrapEl.clientHeight || 1;
    fold = createFold(renderer, { panels: 4, samples: Q.antialias ? 4 : 0 });
    fold.setSize(w, h);
  }
  markReveals();
}

/* ---------------- the quality governor (see PR_* above) ----------------
   A raw delta over 0.25 s means the tab was hidden or the page paused, not
   that the device is slow, so that sample is dropped; the first seconds are
   skipped too, while shaders are still compiling. */
function setResolution(s) {
  prScale = s;
  blackboxLog('gov-res', Math.round(s * 100) + '% resolution');
  renderer.setPixelRatio(Q.pixelRatio * prScale);
  if (composer) composer.setPixelRatio(Q.pixelRatio * prScale);
  if (fold) fold.setSize(wrapEl.clientWidth || 1, wrapEl.clientHeight || 1);
}

function dropShadows() {
  blackboxLog('gov-shadows', 'shadows off');
  sun.castShadow = false;
  renderer.shadowMap.enabled = false;
  /* every lit material bakes the shadow count into its shader: rebuild */
  scene.traverse((o) => {
    if (!o.material) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.needsUpdate = true;
  });
}

function governQuality(rawDt, t) {
  if (t < 3 || rawDt >= 0.25) { ftAcc = ftN = 0; return; }
  ftAcc += rawDt; ftN++;
  if (prHold > 0) { prHold--; return; }
  if (ftN < PR_WIN) return;
  const avg = ftAcc / ftN;
  ftAcc = ftN = 0;
  /* never act mid-interaction or sooner than 3 s after the last step: the
     step itself spikes frame time, which would invite another step */
  if (interacting || camTween || t - lastGovStep < 3) return;
  if (avg > PR_DROP) {
    if (prScale > PR_FLOOR) {
      setResolution(Math.max(PR_FLOOR, prScale - 0.12));
      prHold = 90; lastGovStep = t;               // let the new setting settle
    } else if (composer && !bloomOff) {
      bloomOff = true;
      blackboxLog('gov-bloom', 'bloom off');
      prHold = 120; lastGovStep = t;
    } else if (renderer.shadowMap.enabled) {
      dropShadows();
      prHold = 120; lastGovStep = t;
    }
  } else if (avg < PR_RISE && prScale < 1) {
    setResolution(Math.min(1, prScale + 0.08));
    prHold = 240; lastGovStep = t;
  }
}

/* ---------------- main loop ---------------- */
const clock = new THREE.Clock();
const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);

/* a frame that throws used to leave the loop alive but painting nothing —
   the black screen that stays until a manual refresh. It is caught, logged
   to the black box, and the loop keeps trying. A NaN camera or pivot paints
   nothing either (the clear colour, forever): watched for and reset. */
let lastFrameErr = '', lastFrameErrAt = -9, nanTick = 0;

function animate() {
  requestAnimationFrame(animate);
  const rawDt = clock.getDelta();
  let dt = Math.min(rawDt, 0.05);
  const t = clock.elapsedTime;
  if (++nanTick >= 30) {                           // twice a second is plenty
    nanTick = 0;
    const pn = camera.position, tn = controls.target;
    if (!isFinite(pn.x + pn.y + pn.z) || !isFinite(tn.x + tn.y + tn.z)) {
      blackboxLog('nan-camera',
        'pos(' + pn.x + ',' + pn.y + ',' + pn.z + ') target(' + tn.x + ',' + tn.y + ',' + tn.z + ')');
      pn.copy(HOME.pos);
      tn.copy(HOME.target);
      camTween = null; zoomTween = null;
      controls.update();
    }
  }
  try {
    animateFrame(rawDt, dt, t);
  } catch (err) {
    const msg = (err && err.message) || String(err);
    if (msg !== lastFrameErr || t - lastFrameErrAt > 2) {   // not 60 logs a second
      lastFrameErr = msg; lastFrameErrAt = t;
      blackboxLog('frame-error', msg + ' | ' + String((err && err.stack) || '').slice(0, 160));
    }
  }
}

function animateFrame(rawDt, dt, t) {
  /* the soundscape follows the view: night or day, how close the camera is
     to the plaza, how far into the sky pass — quieter behind the page, and
     silent when the map is out of sight */
  if (ambience) {
    ambience.update(dt, t, {
      night: envMix,
      near: Math.min(1, Math.max(0, (190 - camera.position.distanceTo(HOME.target)) / 150)),
      sky: skyOn ? Math.min(1, skySmooth / 0.6) : 0,
      visible: heroVisible,
      under: sheetUp
    });
  }
  if (!heroVisible) return; // hero scrolled away — pause rendering, save GPU

  if (sheetUp && fold) {
    /* folded all the way: nothing of the district is left to see, so it
       paints the page colour once and then rests until you scroll back */
    updateSkyPass(dt);
    if (!foldBlank) { fold.renderBlank(); foldBlank = true; }
    return;
  }
  foldBlank = false;
  /* without the fold (reduced motion), behind the page the sky is a backdrop seen through translucent
     sections: a third of the frames is plenty for drifting stars and
     clouds, and the time of the skipped ones is carried into the next */
  if (sheetUp) {
    underAcc += rawDt;
    if (++underTick % 3) return;
    dt = Math.min(underAcc, 0.1);
    underAcc = 0;
  } else {
    underAcc = 0;
    governQuality(rawDt, t);
  }

  /* shadow cadence — the map rebuilds every other frame (see initThree);
     looking up at the sky from behind the page, not at all */
  if (Q.shadows) {
    shadowTick = (shadowTick + 1) % 2;
    renderer.shadowMap.needsUpdate = shadowTick === 0 && !sheetUp;
  }

  const skyCam = updateSkyPass(dt);

  /* any other camera move (a dive, a search, the zoom buttons) ends the
     opening shot for good; once it has landed, the lap eases in */
  if (intro && (flight || camTween || zoomTween)) endIntro();
  if (spinUp < 1) {
    spinUp = Math.min(1, spinUp + dt / 1.8);
    controls.autoRotateSpeed = AUTO_SPIN * spinUp * spinUp * (3 - 2 * spinUp);
  }

  /* camera flights (company dive + home reset); controls take over in between */
  if (flight) {
    flight.t += dt;
    const p = Math.min(1, flight.t / flight.dur);
    const e = Math.pow(p, 2.1);               // drift in, then rush
    camera.position.lerpVectors(flight.fromP, flight.toP, e);
    controls.target.lerpVectors(flight.fromT, flight.toT, e);
    /* a late lens punch: the last third of the dive narrows the field of
       view, which reads as speed far more than translation alone does */
    camera.fov = flight.fov0 - 10 * Math.pow(p, 3);
    camera.updateProjectionMatrix();
    camera.lookAt(controls.target);
    if (flyFade) flyFade.style.opacity = Math.max(0, (p - 0.62) / 0.38).toFixed(3);
    if (p >= 1) {
      const href = flight.href;
      flight = null;
      location.href = href;
      return;
    }
  } else if (skyCam) {
    skyPass(skySmooth);                       // the climb owns the camera (see initSkyPass)
  } else if (intro) {
    intro.t += dt;
    const p = Math.min(1, intro.t / INTRO.dur);
    placeIntro(p);
    if (p >= 1) endIntro();
  } else if (camTween) {
    camTween.t += dt;
    const p = easeOutCubic(Math.min(1, camTween.t / camTween.dur));
    /* a tween flies home unless it was given a destination (focusCompany) */
    camera.position.lerpVectors(camTween.fromP, camTween.toP || HOME.pos, p);
    controls.target.lerpVectors(camTween.fromT, camTween.toT || HOME.target, p);
    if (camTween.t >= camTween.dur) { camTween = null; controls.enabled = true; }
  } else {
    if (zoomTween) {
      zoomTween.t = Math.min(1, zoomTween.t + dt / 0.4);
      const len = lerp(zoomTween.from, zoomTween.to, easeOutCubic(zoomTween.t));
      camera.position.sub(controls.target).setLength(len).add(controls.target);
      if (zoomTween.t >= 1) zoomTween = null;
    }
    controls.update();
  }

  envMix += (envTarget - envMix) * Math.min(1, dt * 2.4);
  applyEnv(envMix);
  if (sky) sky.update(envMix, t, dt, camera);

  /* ----- natural wind: layered gusts drive everything that can move ----- */
  const gust = 0.55 + 0.45 * Math.sin(t * 0.21) + 0.28 * Math.sin(t * 0.53 + 2.1);
  for (const o of windItems) {
    const wd = o.userData.wind;
    o.rotation.z = Math.sin(t * wd.speed + wd.phase) * wd.amp * (0.4 + gust);
    o.rotation.x = Math.sin(t * wd.speed * 0.7 + wd.phase * 1.3) * wd.amp * 0.5 * gust;
  }
  if (forestWind) forestWind(t, gust);   // the distant forest sways in its vertex shader
  updateModelWind(t, gust);              // …and so does every tree from the model library
  for (const f of buntingFlags) {
    const wd = f.userData.wind;
    f.rotation.z = Math.sin(t * wd.speed + wd.phase) * wd.amp * (0.3 + gust * 0.8);
    f.rotation.x = Math.sin(t * wd.speed * 0.6 + wd.phase) * wd.amp * 0.6 * gust;
  }
  /* chimney smoke: each puff rises, swells, leans downwind and dissolves */
  for (const stack of smokeStacks) {
    for (const p of stack.userData.puffs) {
      const k = ((t * p.speed + p.phase) % 1);
      const s2 = 0.5 + k * 2.4;
      p.mesh.position.set(k * k * 1.9 * (0.4 + gust), k * 5.0, k * k * 0.7 * gust);
      p.mesh.scale.setScalar(s2);
      p.mesh.rotation.y = k * 2.4;
      p.mat.opacity = Math.min(1, k * 7) * (1 - k) * 0.42;
    }
  }
  /* the armillary sphere turns all day; the star above it counter-turns */
  if (plazaMonument && plazaMonument.rings) {
    plazaMonument.rings.rotation.y = t * 0.11;
    plazaMonument.globe.rotation.y = t * 0.055;
    plazaMonument.armillary.rotation.y = Math.sin(t * 0.07) * 0.22;
  }

  /* weathervanes swing to point downwind */
  for (const v of weatherVanes) v.rotation.y = 0.6 + Math.sin(t * 0.17) * 0.55 + gust * 0.25;

  if (grass) grass.update(t, 0.35 + gust * 0.75);
  if (leaves) leaves.update(t, gust, envMix);
  if (windmill) windmill.userData.hub.rotation.z -= dt * (0.35 + gust * 0.75);
  if (millWheel) millWheel.rotation.z -= dt * 0.55;      // the stream never stops
  if (traffic) traffic.update(dt, envMix);
  if (weather) weather.update(dt, t, gust, envMix, skyOn ? Math.min(1, skySmooth / 0.4) : 0);
  if (fireflies) fireflies.update(t, envMix);
  if (birds) birds.update(dt, t, envMix);
  if (animals) animals.update(dt, t);
  if (villagers) villagers.update(dt, t, envMix);
  if (astronomer) astronomer.update(t, envMix);
  if (waterfall) waterfall.update(t, envMix);

  /* the fire: cones flicker out of phase, embers climb, the glow and the
     pool of light on the flagstones swell with them */
  if (fire) {
    let flicker = 0;
    for (const f of fire.flames) {
      const w = 0.72 + 0.28 * Math.sin(t * f.speed + f.phase)
                     + 0.14 * Math.sin(t * f.speed * 2.3 + f.phase * 1.7);
      f.mesh.scale.set(0.88 + w * 0.2, w, 0.88 + w * 0.2);
      f.mesh.position.y = f.baseY + (w - 1) * f.h * 0.5;
      f.mesh.rotation.y = Math.sin(t * 1.6 + f.phase) * 0.22;
      f.mat.opacity = f.base * (0.55 + 0.45 * w) * (0.35 + 0.65 * envMix);
      flicker = w;
    }
    fire.emberMat.uniforms.uTime.value = t;
    fire.emberMat.uniforms.uOpacity.value = 0.35 + 0.65 * envMix;
    fire.glowMat.opacity = (0.10 + 0.40 * envMix) * (0.8 + flicker * 0.3);
    fire.poolMat.opacity = envMix * 0.34 * (0.8 + flicker * 0.3);
  }
  if (flagMesh) {
    const fp = flagMesh.geometry.attributes.position;
    for (let i = 0; i < fp.count; i++) {
      const x = fp.getX(i), y = fp.getY(i);
      const k = (x + 1.5) / 3; // 0 at pole → 1 at free end
      fp.setZ(i, Math.sin(x * 2.2 - t * 5 + y * 1.2) * 0.17 * k * (0.35 + gust * 0.7));
    }
    fp.needsUpdate = true;
  }

  if (needRaycast && !flight) {
    needRaycast = false;
    setHovered(buildingAtPointer());
  }

  /* building lift on hover */
  const k1 = Math.min(1, dt * 9);
  for (const b of buildings) {
    const liftTarget = (b === hovered || b === selected) ? 0.3 : 0;
    b.group.position.y += (b.baseY + liftTarget - b.group.position.y) * k1;   // lift relative to its mountain seat
  }

  /* every sign's chase lights run off one shared clock */
  for (const mq of marqueeMats) {
    mq.uniforms.uTime.value = t;
    mq.uniforms.uIntensity.value = 0.22 + 0.78 * envMix;
  }

  for (const it of blinkMats) {
    const bl = it.userData.blink;
    /* chase lights: gentle shimmer by day, full sparkle at night */
    if (bl) it.emissiveIntensity =
      bl.base * (0.55 + 0.45 * Math.sin(t * bl.speed + bl.phase)) * (0.25 + 0.75 * envMix);
  }

  /* the ground rings: under the cursor the ring comes up — enough to say
     "clickable", never enough to flash */
  for (const b of buildings) {
    const on = (b === hovered || b === selected);
    b.hi = (b.hi || 0) + ((on ? 1 : 0) - (b.hi || 0)) * Math.min(1, dt * 7);
    if (b.halo) {
      /* a slow breath, a little stronger after dark, lit up under the cursor */
      const breath = 0.5 + 0.5 * Math.sin(t * 1.4 + b.halo.userData.phase);
      b.halo.material.opacity = (0.16 + 0.12 * breath) * (0.8 + 0.4 * envMix) + b.hi * 0.5;
      b.halo.scale.setScalar(1 + b.hi * 0.06);
    }
  }


  updateLabels();

  /* live readout so "does it feel smooth?" can be answered with numbers */
  hudCount++;
  if (hudStats) {
    const span = t - hudLast;
    if (span >= 0.5 && span < 1.5) {
      hudStats.textContent =
        Math.round(hudCount / span) + ' fps · ' + Math.round(prScale * 100) + '% res · ' + Q.tier +
        (bloomOff ? ' · no bloom' : '') + (Q.shadows && !renderer.shadowMap.enabled ? ' · no shadows' : '');
      hudCount = 0; hudLast = t;
    } else if (span >= 1.5) { hudCount = 0; hudLast = t; }   // resumed from a pause
  }

  /* the bloom pass only earns its cost after dark: by day it is a whisper
     (applyEnv), so the frame goes straight to the canvas instead */
  const bloomOn = composer && !bloomOff && envMix > 0.15;
  if (fold && foldOpen < 0.999) {
    /* mid-fold: finish the frame off-screen, then fold it (fold.js) */
    if (bloomOn) {
      composer.renderToScreen = false;
      composer.render();
      composer.renderToScreen = true;
      fold.render(composer.readBuffer.texture, foldOpen, true);
    } else {
      renderer.setRenderTarget(fold.target);
      renderer.render(scene, camera);
      fold.render(fold.target.texture, foldOpen, false);
    }
    return;
  }
  if (bloomOn) composer.render();
  else renderer.render(scene, camera);
}

/* ---------------- loading ----------------
   Building this world blocks the main thread for a second or more, and on a
   phone for several. Yielding between phases lets the browser paint, keeps
   the tab responsive, and — more to the point — lets the progress bar report
   something true instead of sliding back and forth on a CSS animation. */
const LOAD_STEPS = [
  'Raising the mountain…',
  'Laying the road…',
  'Building the district…',
  'Opening the market…',
  'Planting the forest…',
  'Letting the wildlife in…',
  'Lighting the lamps…'
];
let loadStep = 0;

function loadProgress(pct, label) {
  const bar = document.querySelector('.loader-bar i');
  const sub = document.querySelector('.loader-sub');
  const loader = document.getElementById('loader');
  if (loader) loader.style.setProperty('--p', pct.toFixed(3));   // the monogram draws this far round
  if (bar) { bar.style.animation = 'none'; bar.style.width = Math.round(pct * 100) + '%'; }
  if (sub && label) sub.textContent = label;
}

/* Hand the frame back so the browser can paint the progress we just set.
   rAF alone is not safe here: a backgrounded or hidden tab throttles it to
   a crawl or stops it entirely, and the build would sit on the loader for
   ever. So race it against a short timer and take whichever lands first. */
function step(pct) {
  loadProgress(pct, LOAD_STEPS[Math.min(loadStep++, LOAD_STEPS.length - 1)]);
  return new Promise((resolve) => {
    let done = false;
    const go = () => { if (!done) { done = true; resolve(); } };
    requestAnimationFrame(() => setTimeout(go, 0));
    setTimeout(go, 50);
  });
}

/* ---------------- the scroll-down landing sections ----------------
   The cards and stats below the hero are rendered from the same company
   data that raised the buildings and filled the finder — one source,
   three views. */
function renderLanding() {
  const grid = document.getElementById('companyGrid');
  const stats = document.getElementById('districtStats');

  if (grid) {
    /* every company an equal card in the 2×2 grid: a brand-coloured view
       with its initial over the district's ridge, and a sheet with the name
       that slides up on hover to show a few lines of its story (style.css,
       .cl-link). Featured companies read first, the same hierarchy as the
       district itself (they ring the summit). */
    const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
    const ridge = '<svg class="cl-ridge" viewBox="0 0 400 100" preserveAspectRatio="none" aria-hidden="true">' +
      '<path class="r1" d="M0 70L40 52L78 62L120 30L160 50L200 18L236 44L270 34L312 58L352 40L400 56V100H0Z"/>' +
      '<path class="r2" d="M0 88L50 74L96 82L150 62L196 78L244 66L292 84L340 70L400 80V100H0Z"/></svg>';
    grid.innerHTML = [...companies]
      .sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0))
      .map((c, i) => {
        const meta = getIndustryMeta(c.industry);
        const nm = String(c.name || '?');
        const rgb = new THREE.Color(c.color || '#e3bd63');
        const brand = [rgb.r, rgb.g, rgb.b].map((v) => Math.round(v * 255)).join(',');
        const paras = (Array.isArray(c.description) ? c.description : []).map((p) => String(p));
        const id = encodeURIComponent(c.id);
        return '<a class="cl-link" data-id="' + id + '" style="--brand-rgb:' + brand + '" href="company.html?id=' + id + '">' +
          '<span class="cl-media" aria-hidden="true">' +
            '<span class="cl-num">' + String(i + 1).padStart(2, '0') + '</span>' +
            /* the whole logo on a frosted plate when there is one, the
               big ghost initial when there is not */
            (c.logo ? '<span class="cl-logo" data-id="' + id + '"></span>'
                    : '<span class="cl-glyph">' + esc(nm.charAt(0).toUpperCase()) + '</span>') + ridge +
          '</span>' +
          '<span class="cl-sheet">' +
            '<span class="cl-avatar" data-id="' + id + '"></span>' +
            '<span class="cl-go" aria-hidden="true">→</span>' +
            '<h3>' + esc(nm) + '</h3>' +
            '<p class="cl-tag">' + esc(c.tagline || '') + '</p>' +
            '<span class="cl-meta">' +
              '<span class="cl-ind" style="color:' + esc(meta.color) + '">' + esc(meta.label) + '</span>' +
              (c.founded ? '<span class="cl-since">Since <b>' + esc(c.founded) + '</b></span>' : '') +
            '</span>' +
            '<span class="cl-more">' +
              (paras[0] ? '<p class="cl-desc">' + esc(paras[0]) + '</p>' : '') +
              '<span class="cl-cta">Open the full profile <i>→</i></span>' +
            '</span>' +
          '</span></a>';
      }).join('');
  }

  if (stats) {
    const industries = new Set(companies.map((c) => c.industry)).size;
    const years = companies.map((c) => Number(c.founded)).filter(Number.isFinite);
    const founded = years.length ? Math.min(...years) : null;
    /* numbers carry data-to (and a data-from) so they can count up */
    const num = (n, from) => '<b data-to="' + n + '" data-from="' + from + '">' + n + '</b>';
    stats.innerHTML =
      '<div class="stat">' + num(companies.length, 0) + '<span>Companies</span></div>' +
      '<div class="stat">' + num(industries, 0) + '<span>Industries</span></div>' +
      '<div class="stat">' + (founded ? num(founded, founded - 24) : '<b>—</b>') + '<span>Established</span></div>' +
      '<div class="stat"><b>3D</b><span>Living district</span></div>';
  }
  if (grid) {
    for (const el of grid.querySelectorAll('.cl-avatar')) {
      fillBadge(el, companies.find((c) => encodeURIComponent(c.id) === el.dataset.id));
    }
    for (const el of grid.querySelectorAll('.cl-logo')) {
      fillBadge(el, companies.find((c) => encodeURIComponent(c.id) === el.dataset.id), { full: true });
    }
  }
  initCardPolish(grid, stats, companies);
}

/* ---------------- the navbar follows the reader ----------------
   Over the district the bar stays light so the sky shows through; once the
   page has slid over it, it turns to frosted glass. Its links light up for
   the section actually on screen. */
function initNavState() {
  const nav = document.querySelector('.navbar');
  const links = [...document.querySelectorAll('.nav-links a[href^="#"]')];
  const sections = links.map((a) => document.querySelector(a.getAttribute('href'))).filter(Boolean);
  /* every "#hero" link (the brand, "District", "Back to the 3D map") means
     the top of the page. The hero is pinned (sticky) over the whole read,
     so a plain anchor jump would land wherever it happens to be pinned —
     near the bottom — instead of taking you back up to the district. */
  document.addEventListener('click', (ev) => {
    const a = ev.target.closest && ev.target.closest('a[href="#hero"]');
    if (!a) return;
    ev.preventDefault();
    scrollTo({ top: 0, behavior: Q.reducedMotion ? 'auto' : 'smooth' });
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  });
  if (!nav) return;
  nav.classList.add('live');
  let queued = false;
  const update = () => {
    queued = false;
    nav.classList.toggle('past', heroOut > 0.98);
    let on = links[0];
    for (let i = 1; i < sections.length; i++) {
      if (sections[i].getBoundingClientRect().top < innerHeight * 0.45) on = links[i];
    }
    for (const a of links) a.classList.toggle('on', a === on);
  };
  addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(update); } }, { passive: true });
  update();
}

/* ---------------- polish for the sections below the hero ----------------
   The cards' hover is pure CSS (style.css, .cl-link). Stats: the numbers
   count up the first time they come into view. */
function initCardPolish(grid, stats, companies) {
  const motion = !Q.reducedMotion;

  const nums = stats ? [...stats.querySelectorAll('b[data-to]')] : [];
  if (!nums.length || !motion || !window.IntersectionObserver) return;
  for (const b of nums) b.textContent = b.dataset.from;
  const count = () => {
    const t0 = performance.now(), dur = 1500;
    const tick = (now) => {
      const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      for (const b of nums) {
        const from = +b.dataset.from, to = +b.dataset.to;
        b.textContent = String(Math.round(from + (to - from) * e));
      }
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  const io = new IntersectionObserver((en) => {
    if (en.some((e) => e.isIntersecting)) { io.disconnect(); count(); }
  }, { threshold: 0.4 });
  io.observe(stats);
}

/* ---------------- bootstrap ---------------- */
async function main() {
  initThree();
  prepareHeadline();
  /* the model library downloads first: the clouds, the forest, the cars and
     the buildings are all built from it. The bar counts files as they land. */
  await loadModels((p) => loadProgress(0.02 + p * 0.22, 'Unpacking the 3D models…'));
  await step(0.26);
  await buildEnvironment();
  companies = await loadCompanies();
  if (!companies.length) {
    throw new Error('No companies found — add some in data/companies.js or check your Sanity project.');
  }
  await buildDistrict();
  bakeStatic(bakeLater, scene);
  buildUI();
  renderLanding();
  initInteraction();
  initSkyPass();
  initNavState();
  if (window.IntersectionObserver) {
    new IntersectionObserver((en) => { heroVisible = en[0].isIntersecting; },
      { threshold: 0.05 }).observe(wrapEl);
  }
  /* compile every shader now, while the loader is still up — in parallel
     where the browser can — so the opening shot does not stutter through
     its first second. Capped, so a slow driver can never hold the page. */
  loadProgress(0.98, 'Lighting the lamps…');
  if (renderer.compileAsync) {
    try {
      await Promise.race([renderer.compileAsync(scene, camera), new Promise((r) => setTimeout(r, 4000))]);
    } catch (e) { /* the first frame compiles whatever is left */ }
  }
  loadProgress(1, 'Ready');

  /* Every visitor opens on the same fixed overview — the angle the district
     was composed around, where every company's name plate is readable — and
     the world is already slowly turning — nothing is pre-selected, no card
     pops up, and a stale hash in the address bar is ignored. */
  frameForViewport();
  camera.updateProjectionMatrix();
  camera.position.copy(HOME.pos);
  controls.target.copy(HOME.target);
  controls.update();
  controls.enabled = true;
  /* …reached by the opening glide, unless the page was reloaded scrolled
     past the hero, where nobody would see it */
  if (heroOut < 0.5) startIntro();

  window.__binomar = {                                           // handy from the console
    scene, camera, renderer, controls, sky, THREE, quality: Q, ambience, nightBed, dayBed,
    focusCompany,
    setNight: (v) => { envTarget = v; envMix = v; applyEnv(v); },
    skipIntro: () => { endIntro(); camTween = null; flight = null; controls.enabled = true; },
    skyTo: (v) => { skyTarget = Math.min(1, Math.max(0, v)); }   // preview the sky pass without scrolling
  };
  showBlackbox();                                  // evidence from a crashed previous session
  animate();

  requestAnimationFrame(() => {
    const l = document.getElementById('loader');
    playHeadline();
    if (!l) return;
    /* the iris needs the registered --iris property (style.css); anywhere
       without it, or without motion, the loader simply fades */
    const iris = !Q.reducedMotion && !!(window.CSS && CSS.registerProperty);
    if (iris) {
      l.classList.add('opening');
      requestAnimationFrame(() => l.classList.add('hide'));
    } else {
      l.classList.add('hide');
    }
    setTimeout(() => l.remove(), 1200);
  });
}

main().catch((err) => {
  console.error('[binomar]', err);
  const loader = document.getElementById('loader');
  if (loader) {
    loader.classList.remove('hide');
    loader.innerHTML = '<div class="loader-mark">⚠️</div>' +
      '<div class="loader-title">COULD NOT LOAD</div>' +
      '<div class="loader-error">' + String(err.message || err) + '</div>';
  }
});
