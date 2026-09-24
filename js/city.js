/* =============================================================
   BINOMAR GROUP — 3D district (main application)
   -------------------------------------------------------------
   Owns: renderer, camera, lights, day/night cycle, roads & props,
   hover/click interaction and the HUD wiring.
   Geometry builders live in city-build.js, data in data.js.
   ============================================================= */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  computeMountainLayout, makeBuilding, makeTree, makePine,
  makeFlag, mulberry32,
  makeBaseTerrain, withPads, makeMountain, makeOuterPlain, makeDistantForest,
  roadAt, spiralRoadPoints, makeRoadRibbon, roadSurfaceTexture, getBuildingDims,
  batchScatter
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
import { loadCompanies, getIndustryMeta } from './data.js';

/* ---------------- day / night presets (blended at runtime) ---------------- */
const ENV = {
  /* daylight is deliberately late-afternoon rather than noon: a low,
     golden key light throws long shadows across the slopes and warms
     every roof, which is most of what makes the village feel cosy */
  day:   { sky: '#c4dced', fog: '#cfdae4', mountain: '#fff2dc', plaza: '#d8d1c3', path: '#9a8058',
           hemiSky: '#ffe9cc', hemiGround: '#74713f', hemiI: 0.76,
           sunColor: '#ffcd8c', sunI: 2.7, window: 0.12, lamp: 0.0 },
  night: { sky: '#04070f', fog: '#1e2a49', mountain: '#8096c9', plaza: '#5a6378', path: '#57503f',
           hemiSky: '#93a9dd', hemiGround: '#2e3a55', hemiI: 0.74,
           sunColor: '#a8bcff', sunI: 0.95, window: 1.5, lamp: 2.6 }
};
const C = { day: {}, night: {} };
for (const k of ['day', 'night']) {
  for (const f of ['sky', 'fog', 'mountain', 'plaza', 'path', 'hemiSky', 'hemiGround', 'sunColor']) {
    C[k][f] = new THREE.Color(ENV[k][f]);
  }
}
const lerp = (a, b, t) => a + (b - a) * t;

/* ---------------- module state ---------------- */
let scene, camera, renderer, controls, sun, hemi;
let mountainMat, plazaMat, pathMat;
const roadMats = [];
/* mountain + outer plain + distant ranges all take the same day/night tint */
const terrainMats = [];
const Q = detectQuality();          // how much scene this device should draw
/* adaptive resolution: prScale quietly steps the render resolution down
   when frames run long and climbs back when there's headroom (see animate).
   Thresholds are seconds-per-frame: drop below ~48 fps, rise above ~58. */
let prScale = 1;
const PR_FLOOR = 0.6, PR_WIN = 40, PR_DROP = 1 / 48, PR_RISE = 1 / 58;
let ftAcc = 0, ftN = 0, prHold = 0, shadowTick = 0;
let hudStats = null, hudCount = 0, hudLast = 0;

/* small, forgiving preference store — private mode throws on access */
function readPref(k) {
  try { return localStorage.getItem('binomar.' + k); } catch (e) { return null; }
}
function writePref(k, v) {
  try { localStorage.setItem('binomar.' + k, v); } catch (e) { /* private mode */ }
}
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
let companies = [];
let hovered = null, selected = null, needRaycast = false;
/* the site opens at night: the lit windows, the fire, the string lights and
   the Milky Way are the scene at its best, so that is the first impression.
   ☀️ in the HUD takes you to daylight. */
/* the site opens at night unless this visitor last chose otherwise */
let envMix = readPref('time') === 'day' ? 0 : 1, envTarget = envMix;
let camTween = null, flight = null;
const flyFade = document.getElementById('flyFade');
const bannerPos = new THREE.Vector3();

/* the fixed opening angle: the same composing angle the district was built
   around, but close enough that the buildings around the plaza fill the
   first frame and every name plate reads large */
const HOME = { pos: new THREE.Vector3(85, 85, 85), target: new THREE.Vector3(0, 52, 0) };

const tooltip = document.getElementById('tooltip');
const ttAvatar = document.getElementById('ttAvatar');

/* the 3D canvas now lives inside the landing-page hero section */
const wrapEl = document.getElementById('scene');
let heroVisible = true;
let flagMesh = null;
const windItems = [];

/* ---------------- three.js core ---------------- */
function initThree() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(ENV.day.sky);
  scene.fog = new THREE.Fog(ENV.day.fog, 300, 1000);

  camera = new THREE.PerspectiveCamera(45, (wrapEl.clientWidth || 1) / (wrapEl.clientHeight || 1), 0.1, 2000);
  camera.position.set(120, 62, 268);   // above the treeline, out past the near belt

  renderer = new THREE.WebGLRenderer({ antialias: Q.antialias, powerPreference: 'high-performance' });
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
  renderer.toneMappingExposure = 1.16;
  document.getElementById('scene').appendChild(renderer.domElement);
  hudStats = document.getElementById('hudStats');

  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(HOME.target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.maxPolarAngle = 1.47;
  controls.minDistance = 18;
  controls.maxDistance = 340;
  /* every visit opens on the same fixed overview — the angle the whole
     district was composed around, where every name plate reads — and the
     world is already turning: one gentle lap roughly every two minutes */
  controls.autoRotate = true;              // the district is meant to feel alive
  controls.autoRotateSpeed = 0.5;
  controls.enabled = true;

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

  addEventListener('resize', onResize);
  if (window.ResizeObserver) new ResizeObserver(() => onResize()).observe(wrapEl);
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
  const H = withPads(baseH, pads);
  const groundY = baseH(0, 0);

  /* the mountain itself (vertex-coloured; day/night tint via applyEnv) */
  const mountain = makeMountain(H);
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
  const vergeMat = strip({ roughness: 1 }, '#7f8b59', '#444f60');
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
    for (let i = 0; i < 7; i++) {
      const tree = makeTree(rng);
      const ta = tipA + (rng() - 0.5) * 0.18;
      const tr = 142 + rng() * 14;
      const tx = Math.cos(ta) * tr, tz = Math.sin(ta) * tr;
      tree.position.set(tx, H(tx, tz) - 0.1, tz);
      tree.rotation.y = rng() * Math.PI * 2;
      scene.add(tree);
      windItems.push(tree);
    }
  }

  /* spur path from the road (or plaza edge) to every front door */
  sorted.forEach((c, i) => {
    const s = spots[i], dims = getBuildingDims(c);
    const dl = Math.hypot(s.x, s.z) || 1;
    const dx = -s.x / dl, dz = -s.z / dl;                       // toward the plaza
    const door = { x: s.x + dx * (dims.d / 2 + 2.2), z: s.z + dz * (dims.d / 2 + 2.2) };
    const start = s.roadT !== undefined ? roadAt(s.roadT) : { x: -dx * 17.5, z: -dz * 17.5 };
    const mid = { x: (start.x + door.x) / 2 + dz * 1.4, z: (start.z + door.z) / 2 - dx * 1.4 };
    scene.add(makeRoadRibbon([start, mid, door], 1.5, shoulderMat, H, { simple: true }));
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
  monument.group.scale.setScalar(1.38);       // the landmark, not a garden ornament
  scene.add(monument.group);
  windowMats.push(...monument.signMats);
  lampMats.push(...monument.lampMats);
  marqueeMats.push(monument.marquee);
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
    const t = makeTree(rand);
    t.position.set(Math.cos(a) * 15.6, groundY, Math.sin(a) * 15.6);
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
      /* a modest stagger so neighbouring plates do not hide each other —
         they stay under the monument's own sign band, which has to read
         as the tallest thing on the summit. setLift() grows the mast. */
      b.banner.setLift(b.banner.lift + (i % 3) * 2.7);
      banners.push(b.banner);
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
  const freeSpot = (x, z, margin) =>
    clearOfRoad(x, z, margin) && !pads.some((p) => Math.hypot(x - p.x, z - p.z) < p.r + margin * 0.4);

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
      o.position.set(x, H(x, z) - 0.1, z);
      o.rotation.y = rand() * Math.PI * 2;
      if (batch) staticScatter.push(o);
      else {
        scene.add(o);
        if (o.userData.wind) windItems.push(o);
      }
      placed++;
    }
    return placed;
  };

  /* landmark broadleaf trees — the ones that give the slopes scale */
  plant((x, z, r) => {
    const t = makeBigTree(rand, { scale: 0.85 + rand() * 0.6, autumn: r > 95 });
    return t;
  }, Q.count(38, Q.scatter), 30, 132, 6.5, 460);

  /* a grove of three giants guarding the last bend before the summit */
  for (let i = 0; i < 3; i++) {
    const a = 1.15 + i * 0.42;
    const r = 30 + i * 3.5;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const t = makeBigTree(rand, { scale: 1.35 });
    t.position.set(x, H(x, z) - 0.1, z);
    t.rotation.y = rand() * 6.28;
    scene.add(t);
    windItems.push(t);
  }

  /* conifer belt: snow-laden up high, plain green lower down */
  plant((x, z, r) => makeGiantPine(rand, { snowy: H(x, z) > 40 && rand() < 0.75 }),
    Q.count(52, Q.scatter), 28, 130, 4.5, 620);
  plant(() => {
    const t = rand() < 0.6 ? makePine(rand) : makeTree(rand);
    t.scale.setScalar(0.85 + rand() * 0.8);
    /* the infill trees skip the shadow pass — at this size and count
       their shadows cost more than they read */
    t.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    return t;
  }, Q.count(118, Q.scatter), 26, 148, 3, 820);

  /* the forest floor: undergrowth, deadfall and meadow flowers. Without
     these the slopes read as a lawn with cones standing on it. */
  plant(() => makeBush(rand), Q.count(150, Q.scatter), 20, 152, 2.2, 900, true);
  plant(() => makeRockCluster(rand), Q.count(54, Q.scatter), 24, 156, 2.8, 460, true);
  plant(() => makeStump(rand), Q.count(30, Q.scatter), 26, 148, 2.4, 260, true);
  plant(() => makeFallenLog(rand), Q.count(26, Q.scatter), 26, 146, 3.2, 260, true);
  plant(() => makeFlowerPatch(rand), Q.count(70, Q.scatter), 20, 140, 2.2, 480);
  plant(() => makeCairn(rand), Q.count(9, Q.scatter), 40, 130, 3, 90, true);

  /* the undergrowth never moves, so it can collapse to a handful of meshes */
  for (const m of batchScatter(staticScatter)) scene.add(m);

  /* a grass layer over the meadows, bending with every gust */
  grass = createGrass(scene, H, rand, {
    count: Q.grass,
    reject: (x, z) => !freeSpot(x, z, 2.2)
  });

  /* the windmill on the north-east shoulder — the scene's wind vane */
  {
    const a = -0.95, r = 66;
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
    lamp.rotation.y = Math.atan2(-ix, -iz) + Math.PI / 2;
    scene.add(lamp);
    lampMats.push(lamp.userData.bulbMat);
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

  /* the waterfall: sited on the steepest face the terrain offers, well
     clear of the road, and facing the default camera */
  waterfall = makeWaterfall(H, { a: 0.79, r: 41, rPool: 55 });
  scene.add(waterfall.group);

  /* the stream it feeds runs downhill and has to get past the switchback.
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
    }
    const inn = put(makeInn(rand, lit, smokeStacks), bendA + 0.16, bendR + 10.5);
    smokeStacks.push((() => {
      const sm = makeSmokeStack(rand);
      sm.position.copy(inn.userData.smokeAt);
      inn.add(sm);
      return sm;
    })());
    put(makeWell(rand), bendA - 0.13, bendR + 7.5);

    put(makeChapel(rand, lit), 5.42, 58);
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
    fire: new THREE.Vector2(Math.cos(FIRE_A) * FIRE_R, Math.sin(FIRE_A) * FIRE_R)
  });
}

/* ---------------- HUD / UI ---------------- */
function buildUI() {
  const night = document.getElementById('btnNight');
  night.textContent = envTarget > 0.5 ? '☀️' : '🌙';   // label the destination
  night.addEventListener('click', toggleNight);
  document.getElementById('btnHome').addEventListener('click', flyHome);
  document.getElementById('btnFull').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
  });
  buildFinder();
  buildLegend();
  bindKeys();
}

/* ---------------- the finder ----------------
   A real list of real links. It is how you find a company by name, and it
   is the whole keyboard and screen-reader route into a scene that is
   otherwise one unlabelled canvas. */
let finderQuery = '';

function buildFinder() {
  const btn = document.getElementById('btnFind');
  const panel = document.getElementById('finder');
  const input = document.getElementById('finderInput');
  const close = document.getElementById('finderClose');
  if (!btn || !panel) return;

  btn.addEventListener('click', () => toggleFinder());
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
  const btn = document.getElementById('btnFind');
  const panel = document.getElementById('finder');
  const input = document.getElementById('finderInput');
  const open = force === undefined ? panel.hidden : force;
  panel.hidden = !open;
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (open) { renderFinderList(); input.focus(); input.select(); } else { btn.focus(); }
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
    dot.style.background = c.color;
    dot.textContent = (c.name || '?').charAt(0).toUpperCase();
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
  writePref('time', envTarget > 0.5 ? 'night' : 'day');
}

/* ---------------- tooltip ---------------- */
function populateTooltip(b) {
  const c = b.company;
  ttAvatar.textContent = c.logo ? '' : c.name.charAt(0).toUpperCase();
  ttAvatar.style.background = c.color;
  document.getElementById('ttName').textContent = c.name;
  document.getElementById('ttIndustry').textContent = getIndustryMeta(c.industry).label;
  document.getElementById('ttTagline').textContent = c.tagline || 'Part of Binomar Group';
  document.getElementById('ttCta').textContent =
    (tooltip.classList.contains('pinned') && selected === b) ? 'Tap again to open →' : 'Click to explore →';
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
    href: 'company.html?id=' + encodeURIComponent(b.company.id)
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
  });

  el.addEventListener('wheel', () => { controls.autoRotate = false; }, { passive: true });

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
  /* reflectors, sign faces, lamp bloom and the pools of light on the road */
  for (const it of roadGlowMats) {
    if (it.opacity) it.m.opacity = it.k * m;
    else it.m.emissiveIntensity = it.k * m;
  }

}

/* ---------------- camera helpers ---------------- */
function flyHome() {
  camTween = { t: 0, dur: 1.3, fromP: camera.position.clone(), fromT: controls.target.clone() };
  controls.autoRotate = true;              // the overview is meant to keep turning
  controls.enabled = false;
}

function onResize() {
  const w = wrapEl.clientWidth || 1, h = wrapEl.clientHeight || 1;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

/* ---------------- main loop ---------------- */
const clock = new THREE.Clock();
const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);

function animate() {
  requestAnimationFrame(animate);
  const rawDt = clock.getDelta();
  const dt = Math.min(rawDt, 0.05);
  const t = clock.elapsedTime;
  if (!heroVisible) return; // hero scrolled away — pause rendering, save GPU

  /* adaptive resolution: average the real frame times, then step the pixel
     ratio down when we can't hold ~48 fps and back up when we can. A raw
     delta over 0.25 s just means we resumed from a paused/hidden tab —
     drop the sample instead of letting the spike trigger a downgrade. */
  if (rawDt < 0.25) { ftAcc += rawDt; ftN++; } else { ftAcc = ftN = 0; }
  if (prHold > 0) prHold--;
  else if (ftN >= PR_WIN) {
    const avg = ftAcc / ftN;
    if (avg > PR_DROP && prScale > PR_FLOOR) {
      prScale = Math.max(PR_FLOOR, prScale - 0.15);
      renderer.setPixelRatio(Q.pixelRatio * prScale);
      prHold = 120;                            // let the new setting settle
    } else if (avg < PR_RISE && prScale < 1) {
      prScale = Math.min(1, prScale + 0.1);
      renderer.setPixelRatio(Q.pixelRatio * prScale);
      prHold = 240;
    }
    ftAcc = ftN = 0;
  }

  /* shadow cadence — the map rebuilds every other frame (see initThree) */
  if (Q.shadows) {
    shadowTick = (shadowTick + 1) % 2;
    renderer.shadowMap.needsUpdate = shadowTick === 0;
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
  } else if (camTween) {
    camTween.t += dt;
    const p = easeOutCubic(Math.min(1, camTween.t / camTween.dur));
    camera.position.lerpVectors(camTween.fromP, HOME.pos, p);
    controls.target.lerpVectors(camTween.fromT, HOME.target, p);
    if (camTween.t >= camTween.dur) { camTween = null; controls.enabled = true; }
  } else {
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
  if (plazaMonument) {
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
  if (weather) weather.update(dt, t, gust, envMix);
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
    const liftTarget = (b === hovered || b === selected) ? 0.55 : 0;
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

  /* the banners: a slow drift, a breathing bloom, a lift when hovered —
     and a scale that grows with distance. A sprite shrinks as the camera
     pulls back, which is exactly wrong for a label you want readable from
     the overview, so we cancel most of that out and clamp the result. */
  for (const b of buildings) {
    const bn = b.banner;
    if (!bn) continue;
    const on = (b === hovered || b === selected);
    bn.hi = (bn.hi || 0) + ((on ? 1 : 0) - (bn.hi || 0)) * Math.min(1, dt * 7);

    bn.plate.getWorldPosition(bannerPos);
    const dist = camera.position.distanceTo(bannerPos);
    /* a plate sized for a 1400px desktop swamps a 375px phone, so the
       distance compensation is scaled by how much screen there is */
    const fit = Math.min(1, Math.max(0.46, (wrapEl.clientWidth || 1200) / 1250));
    const grow = Math.min(2.4 * fit, Math.max(0.92 * fit, dist / 78 * fit));
    const pop = grow * (1 + bn.hi * 0.14);

    const bob = Math.sin(t * 0.7 + bn.phase) * 0.22;
    const y = bn.baseY + bob + bn.hi * 0.7 + (pop - 1) * bn.height * 0.5;
    bn.plate.position.y = y;
    bn.glow.position.y = y;
    bn.plate.scale.set(bn.width * pop, bn.height * pop, 1);
    bn.glow.scale.set(bn.width * 1.5 * pop, bn.height * 2.4 * pop, 1);

    /* the bloom is mostly a night effect, and flares under the cursor */
    bn.glowMat.opacity = (0.16 + 0.42 * envMix) * (0.85 + 0.35 * Math.sin(t * 1.3 + bn.phase))
      + bn.hi * 0.45;
    bn.plateMat.opacity = 0.9 + 0.1 * envMix + bn.hi * 0.1;
  }


  /* live readout so "does it feel smooth?" can be answered with numbers */
  hudCount++;
  if (hudStats) {
    const span = t - hudLast;
    if (span >= 0.5 && span < 1.5) {
      hudStats.textContent =
        Math.round(hudCount / span) + ' fps · ' + Math.round(prScale * 100) + '% res';
      hudCount = 0; hudLast = t;
    } else if (span >= 1.5) { hudCount = 0; hudLast = t; }   // resumed from a pause
  }

  renderer.render(scene, camera);
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

/* ---------------- bootstrap ---------------- */
async function main() {
  initThree();
  await step(0.10);
  await buildEnvironment();
  companies = await loadCompanies();
  if (!companies.length) {
    throw new Error('No companies found — add some in data/companies.js or check your Sanity project.');
  }
  await buildDistrict();
  buildUI();
  initInteraction();
  if (window.IntersectionObserver) {
    new IntersectionObserver((en) => { heroVisible = en[0].isIntersecting; },
      { threshold: 0.05 }).observe(wrapEl);
  }
  loadProgress(1, 'Ready');

  /* Every visitor opens on the same fixed overview — the angle the district
     was composed around, where every company's name plate is readable — and
     the world is already slowly turning — nothing is pre-selected, no card
     pops up, and a stale hash in the address bar is ignored. */
  camera.position.copy(HOME.pos);
  controls.target.copy(HOME.target);
  controls.update();
  controls.enabled = true;

  window.__binomar = {                                           // handy from the console
    scene, camera, renderer, controls, sky, THREE, quality: Q,
    focusCompany,
    setNight: (v) => { envTarget = v; envMix = v; applyEnv(v); },
    skipIntro: () => { camTween = null; flight = null; controls.enabled = true; }
  };
  animate();

  requestAnimationFrame(() => {
    const l = document.getElementById('loader');
    if (!l) return;
    l.classList.add('hide');
    setTimeout(() => l.remove(), 800);
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
