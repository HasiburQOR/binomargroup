/* =============================================================
   BINOMAR GROUP — the downloaded 3D models
   -------------------------------------------------------------
   Every hand-made model in the district comes through here: the
   trees, grass and rocks, the animals, the cars on the road, the
   clouds, the company buildings and the fairground props. The
   files live in assets/models/ (credits in CREDITS.md there).

   The files arrive at wildly different scales and pivots — one
   car is 0.8 units long, another 490 — so nothing uses a raw
   glTF scene. bake() flattens a model (or one named piece of a
   pack) into one geometry per material, stands it on y = 0,
   centres it, turns it to face +X (the way the traffic and the
   animals steer) and scales it to the size the caller asks for.
   Baked models are cached, so a forest of one tree costs one
   bake and a handful of instanced draw calls.

   All files load once, up front, before the world is built. A
   file that fails to load simply is not there: hasModel() says
   so and every caller falls back to its procedural builder.
   ============================================================= */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const DIR = 'assets/models/';

/* file + the credit it must carry (CC-BY needs attribution) */
export const MODELS = {
  'tree-a':        { file: 'tree-a.glb',        credit: 'Tree by Quaternius (CC0)' },
  'tree-b':        { file: 'tree-b.glb',        credit: 'Tree by Quaternius (CC0)' },
  'trees-pack':    { file: 'trees-pack.glb',    credit: 'Trees by Quaternius (CC0)' },
  'maple-pack':    { file: 'maple-pack.glb',    credit: 'Maple Trees by Quaternius (CC0)' },
  'birch-pack':    { file: 'birch-pack.glb',    credit: 'Birch Trees by Quaternius (CC0)' },
  'pine':          { file: 'pine.glb',          credit: 'Pine by Quaternius (CC0)' },
  'twisted-tree':  { file: 'twisted-tree.glb',  credit: 'Twisted Tree by Quaternius (CC0)' },
  'big-tree':      { file: 'big-tree.glb',      credit: 'Big Tree by 3Donimus (CC-BY)' },
  'tree-zsky':     { file: 'tree-zsky.glb',     credit: 'Tree by Zsky (CC-BY)' },
  'vine-tree':     { file: 'vine-tree.glb',     credit: 'Vine Covered Tree by Zacharylll (CC-BY)' },
  'trees-rocks':   { file: 'trees-rocks.glb',   credit: 'Trees & Rocks by Sham Al Bdour (CC-BY)' },
  'palm':          { file: 'palm.glb',          credit: 'Palm Tree by Quaternius (CC0)' },
  'coconut-palm':  { file: 'coconut-palm.glb',  credit: 'Coconut palm tree by Poly by Google (CC-BY)' },
  'bamboo':        { file: 'bamboo.glb',        credit: 'Bamboo by Poly by Google (CC-BY)' },
  'bamboo-small':  { file: 'bamboo-small.glb',  credit: 'Bamboo by Poly by Google (CC-BY)' },
  'grass-tuft':    { file: 'grass-tuft.glb',    credit: 'Tuft of grass by Poly by Google (CC-BY)' },
  'grass-wispy':   { file: 'grass-wispy.glb',   credit: 'Grass Wispy by Quaternius (CC0)' },
  'grass-patch':   { file: 'grass-patch.glb',   credit: 'Grass Patch by Danni Bittman (CC-BY)' },
  'grass-yellow':  { file: 'grass-yellow.glb',  credit: 'grass yellowing by Steve B (CC-BY)' },
  'dandelions':    { file: 'dandelions.glb',    credit: 'Dandelions by Jarlan Perez (CC-BY)' },
  'elk':           { file: 'elk.glb',           credit: 'Elk by Poly by Google (CC-BY)' },
  'fox':           { file: 'fox.glb',           credit: 'Gray fox by Poly by Google (CC-BY)' },
  'wolf':          { file: 'wolf.glb',          credit: 'Wolf by Poly by Google (CC-BY)' },
  'car-hatch':     { file: 'car-hatch.glb',     credit: 'Car by Quaternius (CC0)' },
  'car-camaro':    { file: 'car-camaro.glb',    credit: 'Camaro ZL1 2017 by Kris Tong (CC-BY)' },
  'car-charger':   { file: 'car-charger.glb',   credit: 'Dodge Charger by David Sirera (CC-BY)' },
  'car-rx7':       { file: 'car-rx7.glb',       credit: 'Mazda RX-7 by IvOfficial (CC-BY)' },
  'car-aventador': { file: 'car-aventador.glb', credit: 'CAR Model by Ignition Labs (CC-BY)' },
  'clouds-a':      { file: 'clouds-a.glb',      credit: 'Cumulus Clouds 2 by S. Paul Michael (CC-BY)' },
  'clouds-b':      { file: 'clouds-b.glb',      credit: 'Cumulus Clouds 3 by S. Paul Michael (CC-BY)' },
  'apartment':     { file: 'apartment.glb',     credit: 'Apartment building by Poly by Google (CC-BY)' },
  'brutalist':     { file: 'brutalist.glb',     credit: 'Brutalist Building by GuyKroizman (CC-BY)' },
  'crane':         { file: 'crane.glb',         credit: 'Crane by J-Toastie (CC-BY)' },
  'ferris-wheel':  { file: 'ferris-wheel-poly.glb', credit: 'Ferris wheel by Poly by Google (CC-BY)' },
  'stop-sign':     { file: 'stop-sign.glb',     credit: 'Stop sign by Poly by Google (CC-BY)' },
  'traffic-light': { file: 'traffic-light.glb', credit: 'Traffic Light by Quaternius (CC0)' },
  'road-bits':     { file: 'road-bits.glb',     credit: 'Road Bits by Kay Lousberg (CC0)' },
  'path-stones':   { file: 'path-stones.glb',   credit: 'Path Straight by Quaternius (CC0)' },
  /* the company headquarters — modelled for this site in Blender
     (source: blender/binomar-buildings.blend) */
  'hq-traveldoor': { file: 'hq-traveldoor.glb', credit: 'Traveldoor HQ — Binomar Group original' },
  'hq-maq':        { file: 'hq-maq.glb',        credit: 'MAQ Tourism HQ — Binomar Group original' },
  'hq-georgia':    { file: 'hq-georgia.glb',    credit: 'Hashtag Georgia HQ — Binomar Group original' },
  'hq-outbound':   { file: 'hq-outbound.glb',   credit: 'Traveldoor Outbound HQ — Binomar Group original' },
  'hq-binomar':    { file: 'hq-binomar.glb',    credit: 'Binomar Group HQ — Binomar Group original' }
};

/* models authored facing +Z; everything in the district steers along +X */
const FACING_Z = Math.PI / 2;

const scenes = new Map();

export async function loadModels(onProgress) {
  const loader = new GLTFLoader();
  const keys = Object.keys(MODELS);
  let done = 0;
  await Promise.all(keys.map((k) => loader.loadAsync(DIR + MODELS[k].file)
    .then((gltf) => { scenes.set(k, gltf.scene); })
    .catch(() => console.warn('[binomar] ' + MODELS[k].file + ' unavailable - using the procedural stand-in'))
    .finally(() => { if (onProgress) onProgress(++done / keys.length); })));
  console.info('[binomar] 3D models: ' + [...new Set([...scenes.keys()].map((k) => MODELS[k].credit))].join(' · '));
}

export const hasModel = (key) => scenes.has(key);


/* ---------- shared wind -------------------------------------------------
   Instanced trees cannot be rotated one by one the way the procedural
   ones were, so they sway in the vertex shader instead — the same
   gust number, pushed in from city.js once a frame. */
export const modelWind = { uTime: { value: 0 }, uGust: { value: 1 } };

export function updateModelWind(t, gust) {
  modelWind.uTime.value = t;
  modelWind.uGust.value = gust;
}

/* bend a material's vertices with height². `amp` is in the geometry's own
   (unit-height) space, so the sway scales with the tree. */
function addSway(mat, amp, speed) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = modelWind.uTime;
    shader.uniforms.uGust = modelWind.uGust;
    shader.uniforms.uSway = { value: new THREE.Vector2(amp, speed) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>',
        '#include <common>\nuniform float uTime;\nuniform float uGust;\nuniform vec2 uSway;')
      .replace('#include <begin_vertex>', `
        #include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 swayAt = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        #else
          vec3 swayAt = vec3(modelMatrix[3][0], modelMatrix[3][1], modelMatrix[3][2]);
        #endif
        float swayK = max(transformed.y, 0.0);
        swayK *= swayK * uSway.x * (0.4 + uGust);
        float swayPh = uTime * uSway.y + swayAt.x * 0.13 + swayAt.z * 0.11;
        transformed.x += sin(swayPh) * swayK;
        transformed.z += sin(swayPh * 0.7 + 1.3) * swayK * 0.5;
      `);
  };
  mat.customProgramCacheKey = () => 'sway';
}


/* ---------- baking ------------------------------------------------------ */
const KEEP_ATTRS = ['position', 'normal', 'uv', 'color'];

/* some files share one interleaved buffer between attributes, which the
   merge utilities refuse — copy each attribute out into its own array */
function plain(attr) {
  if (!attr.isInterleavedBufferAttribute) return attr;
  const n = attr.itemSize, src = attr.data.array, stride = attr.data.stride;
  const arr = new src.constructor(attr.count * n);
  for (let i = 0; i < attr.count; i++) {
    for (let j = 0; j < n; j++) arr[i * n + j] = src[i * stride + attr.offset + j];
  }
  return new THREE.BufferAttribute(arr, n, attr.normalized);
}

/* merge a bank of geometries whose attribute sets may not agree */
function mergeBank(geos) {
  const shared = KEEP_ATTRS.filter((a) => geos.every((g) => g.attributes[a]));
  const mixedIndex = geos.some((g) => g.index) && geos.some((g) => !g.index);
  const clean = geos.map((g) => {
    let src = mixedIndex && g.index ? g.toNonIndexed() : g;
    const out = new THREE.BufferGeometry();
    for (const a of shared) out.setAttribute(a, plain(src.attributes[a]));
    if (src.index) out.setIndex(src.index);
    return out;
  });
  return clean.length === 1 ? clean[0] : mergeGeometries(clean);
}

/* drop every triangle lying wholly under `yCut` (a model's display plinth) */
function cropBelow(geo, yCut) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const pos = g.attributes.position;
  const keep = [];
  for (let i = 0; i < pos.count; i += 3) {
    if (Math.max(pos.getY(i), pos.getY(i + 1), pos.getY(i + 2)) > yCut) keep.push(i);
  }
  const out = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(g.attributes)) {
    const n = attr.itemSize, arr = new attr.array.constructor(keep.length * 3 * n);
    keep.forEach((v, k) => {
      for (let j = 0; j < 3 * n; j++) arr[k * 3 * n + j] = attr.array[v * n + j];
    });
    out.setAttribute(name, new THREE.BufferAttribute(arr, n, attr.normalized));
  }
  return out;
}

const bakes = new Map();

/* opts:
     part     only meshes whose name (or an ancestor's) starts with this
     facing   'z' when the model's nose points down +Z (turned to face +X)
     height   scale so the model stands this tall            ─┐ pick one;
     length   scale so its longest side is this long           │ none keeps
     fit      {w, d}: the largest size that fits the footprint ─┘ file units
     crop     drop a plinth: triangles under this fraction of the height
     flat     faceted shading (models whose normals were stripped to shrink them)
     metal    keep the file's PBR (car paint); otherwise lamberts are calmed
     sway     [amp, speed]: wind in the vertex shader
     tint     [colour, amount]: lean every material toward a colour
   Returns { parts: [{geometry, material}], w, h, d } or null. */
export function bake(key, opts = {}) {
  const id = key + '|' + JSON.stringify(opts);
  if (bakes.has(id)) return bakes.get(id);
  const root = scenes.get(key);
  if (!root) return null;

  root.updateMatrixWorld(true);
  const turn = new THREE.Matrix4().makeRotationY(opts.facing === 'z' ? FACING_Z : 0);
  const banks = new Map();
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (opts.part) {
      let n = o, ok = false;
      while (n && !ok) { ok = (n.name || '').startsWith(opts.part); n = n.parent; }
      if (!ok) return;
    }
    const m = o.material;
    if (!banks.has(m.uuid)) banks.set(m.uuid, { mat: m, geos: [] });
    const g = o.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(turn, o.matrixWorld));
    banks.get(m.uuid).geos.push(g);
  });
  if (!banks.size) { bakes.set(id, null); return null; }

  let parts = [];
  for (const { mat, geos } of banks.values()) {
    const geometry = mergeBank(geos);
    if (geometry) parts.push({ geometry, material: mat });
  }

  const box = new THREE.Box3();
  for (const p of parts) { p.geometry.computeBoundingBox(); box.union(p.geometry.boundingBox); }

  if (opts.crop) {
    const cut = box.min.y + (box.max.y - box.min.y) * opts.crop;
    parts = parts.map((p) => ({ ...p, geometry: cropBelow(p.geometry, cut) }))
      .filter((p) => p.geometry.attributes.position.count > 0);
    box.makeEmpty();
    for (const p of parts) { p.geometry.computeBoundingBox(); box.union(p.geometry.boundingBox); }
  }

  const size = box.getSize(new THREE.Vector3());
  let s = 1;
  if (opts.height) s = opts.height / size.y;
  else if (opts.length) s = opts.length / Math.max(size.x, size.z);
  else if (opts.fit) s = Math.min(opts.fit.w / size.x, opts.fit.d / size.z);
  const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
  const norm = new THREE.Matrix4().makeScale(s, s, s)
    .multiply(new THREE.Matrix4().makeTranslation(-cx, -box.min.y, -cz));

  const tint = opts.tint ? new THREE.Color(opts.tint[0]) : null;
  for (const p of parts) {
    p.geometry.applyMatrix4(norm);
    if (!p.geometry.attributes.normal) p.geometry.computeVertexNormals();
    p.geometry.computeBoundingBox();
    p.geometry.computeBoundingSphere();

    const m = p.material.clone();
    if (!opts.metal) {
      /* the Poly / obj2gltf exports come out as shiny plastic under the
         district's image-based light; calm them to the painted look */
      m.metalness = Math.min(m.metalness, 0.1);
      m.roughness = Math.max(m.roughness, 0.7);
    }
    if (opts.flat) m.flatShading = true;
    if (tint) m.color.lerp(tint, opts.tint[1]);
    if (opts.sway) addSway(m, opts.sway[0], opts.sway[1]);
    p.material = m;
  }

  const tris = parts.reduce((n, p) =>
    n + (p.geometry.index ? p.geometry.index.count : p.geometry.attributes.position.count) / 3, 0);
  const out = { parts, tris, w: size.x * s, h: size.y * s, d: size.z * s };
  bakes.set(id, out);
  return out;
}

/* a baked model as an ordinary group — one mesh per material */
export function modelGroup(key, opts = {}) {
  const b = bake(key, opts);
  if (!b) return null;
  const g = new THREE.Group();
  for (const p of b.parts) {
    const mesh = new THREE.Mesh(p.geometry, p.material);
    mesh.castShadow = opts.shadow !== false;
    mesh.receiveShadow = true;
    g.add(mesh);
  }
  g.userData.size = { w: b.w, h: b.h, d: b.d };
  return g;
}


/* ---------- flora --------------------------------------------------------
   Every plant is baked to unit height, so an instance's scale IS its
   height in metres, whichever file it came from. */
const TREE_SWAY = [0.030, 0.9];
const FLORA = {
  broadleaf: [
    ['tree-a'], ['tree-b'],
    ['trees-pack', 'NormalTree_1'], ['trees-pack', 'NormalTree_2'], ['trees-pack', 'NormalTree_3'],
    ['trees-pack', 'NormalTree_4'], ['trees-pack', 'NormalTree_5']
  ],
  birch: [1, 2, 3, 4, 5].map((i) => ['birch-pack', 'BirchTree_' + i]),
  autumn: [1, 2, 3, 4, 5].map((i) => ['maple-pack', 'MapleTree_' + i]).concat([['twisted-tree']]),
  landmark: [['big-tree', null, { flat: true }], ['vine-tree', null, { flat: true, crop: 0.06 }],
             ['tree-zsky']],
  conifer: [['pine']],
  palm: [['palm'], ['coconut-palm']],
  bamboo: [['bamboo']],
  bush: [['grass-patch'], ['bamboo-small'], ['grass-wispy'], ['grass-yellow']],
  meadow: [['grass-patch'], ['grass-wispy'], ['grass-yellow']],
  rock: ['pSolid1', 'pSolid2', 'pSolid3', 'pSolid4', 'pSphere1', 'pSphere2'].map((p) => ['trees-rocks', p]),
  flower: [['dandelions']]
};
const STILL = new Set(['rock']);                 // things the wind leaves alone

/* every variant of a kind that actually loaded, baked to unit height */
const floraCache = new Map();
export function floraVariants(kind) {
  if (floraCache.has(kind)) return floraCache.get(kind);
  const list = [];
  for (const [key, part, extra] of FLORA[kind] || []) {
    const b = bake(key, {
      part: part || undefined, height: 1, ...(extra || {}),
      sway: STILL.has(kind) ? undefined
        : kind === 'bush' || kind === 'flower' || kind === 'meadow' ? [0.12, 1.7] : TREE_SWAY
    });
    if (b) list.push(b);
  }
  floraCache.set(kind, list);
  return list;
}
export const hasFlora = (kind) => floraVariants(kind).length > 0;

/* Collects placements, then builds one InstancedMesh per variant material.
   add() returns false when nothing of that kind loaded, so callers can
   fall back to the procedural prop. `maxTris` (from the quality dial) keeps
   a phone to the lighter variants of each kind — the heaviest trees are
   only planted where there is GPU to spare. */
export function createFlora(maxTris = Infinity) {
  const beds = new Map();
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const affordable = (kind) => {
    const all = floraVariants(kind);
    const light = all.filter((v) => v.tris <= maxTris);
    if (light.length) return light;
    return all.length ? [all.reduce((a, b) => (b.tris < a.tris ? b : a))] : all;
  };

  return {
    add(kind, rand, x, y, z, height, cast = true) {
      const vars = affordable(kind);
      if (!vars.length) return false;
      const v = vars[Math.floor(rand() * vars.length)];
      const key = kind + ':' + vars.indexOf(v) + ':' + (cast ? 1 : 0);
      if (!beds.has(key)) beds.set(key, { v, cast, mats: [] });
      q.setFromAxisAngle(up, rand() * Math.PI * 2);
      /* a touch of spread in the crown so a stand of one variant is not a row of clones */
      const k = 0.9 + rand() * 0.2;
      s.set(height * k, height, height * k);
      beds.get(key).mats.push(m.compose(p.set(x, y, z), q, s).clone());
      return true;
    },
    build(scene) {
      for (const { v, cast, mats } of beds.values()) {
        for (const part of v.parts) {
          const mesh = new THREE.InstancedMesh(part.geometry, part.material, mats.length);
          mats.forEach((mm, i) => mesh.setMatrixAt(i, mm));
          mesh.instanceMatrix.needsUpdate = true;
          mesh.computeBoundingSphere();
          mesh.castShadow = cast;
          mesh.receiveShadow = true;
          scene.add(mesh);
        }
      }
      beds.clear();
    }
  };
}
