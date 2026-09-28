/* =============================================================
   BINOMAR GROUP — model optimiser
   -------------------------------------------------------------
   The site loads every model in assets/models/ before the world
   is built, so their size is load time, and their triangle count
   is frame time on every device, for every second of the visit.

   The untouched downloads live in assets/models-src/ (kept out of
   the Docker image). This script writes the shipped copies:

     1. simplify   fewer triangles, within an error bound, so a
                   tree or car keeps its silhouette at the distance
                   the district is seen from
     2. textures   foliage, animals and cars down to 512 px (they
                   are never seen close enough to need 1024)
     3. meshopt    quantised + EXT_meshopt_compression — the files
                   shrink several times over; three.js decodes them
                   with MeshoptDecoder (see js/models.js)

   Node and mesh names are never touched: js/models.js picks trees
   out of the packs by name.

   Usage (once):  npm install
   then:          npm run optimize-models
   ============================================================= */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, simplify, meshopt, textureCompress } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { readdirSync, statSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'assets/models-src');
const OUT = join(root, 'assets/models');

/* ratio: target share of triangles kept; error: how far (as a fraction of
   the model's size) the simplifier may move the surface to get there. The
   error bound wins — a model that cannot lose triangles without changing
   shape simply keeps them. tex: longest texture side, or 0 to leave as is.
   permissive: these low-poly models are flat shaded — every face owns its
   own vertices — so a plain simplifier finds almost no shared edge it may
   collapse. Permissive lets it collapse across those seams: fine for
   foliage and cars seen from a distance, never used on the buildings. */
const PROFILES = {
  /* the leaves are clumps of small separate pieces, which only give way
     past ~8 % — at the distance the slopes are seen from that reads the same */
  tree:     { ratio: 0.45, error: 0.08,  tex: 512, permissive: true },
  /* hundreds of copies each, seen from tens of metres: the clump's outline
     is all that reads */
  grass:    { ratio: 0.45, error: 0.06,  tex: 256, permissive: true },
  animal:   { ratio: 0.55, error: 0.01,  tex: 512, permissive: true },
  car:      { ratio: 0.3,  error: 0.01,  tex: 512, permissive: true },
  /* full detail: the sky pass looks straight up at their undersides */
  cloud:    { ratio: 1,    error: 0,     tex: 0 },
  building: { ratio: 0.6,  error: 0.003, tex: 0 },
  prop:     { ratio: 0.6,  error: 0.006, tex: 512 }
};
const KIND = {
  'tree-a': 'tree', 'tree-b': 'tree', 'trees-pack': 'tree', 'maple-pack': 'tree',
  'birch-pack': 'tree', 'pine': 'tree', 'twisted-tree': 'tree', 'big-tree': 'tree',
  'tree-zsky': 'tree', 'vine-tree': 'tree', 'trees-rocks': 'tree', 'palm': 'tree',
  'coconut-palm': 'tree', 'bamboo': 'tree', 'bamboo-small': 'tree',
  'grass-tuft': 'grass', 'grass-wispy': 'grass', 'grass-patch': 'grass',
  'grass-yellow': 'grass', 'grass': 'grass', 'dandelions': 'grass',
  'elk': 'animal', 'fox': 'animal', 'wolf': 'animal', 'pig': 'animal',
  'car-hatch': 'car', 'car-camaro': 'car', 'car-charger': 'car', 'car-rx7': 'car',
  'car-aventador': 'car',
  'clouds-a': 'cloud', 'clouds-b': 'cloud',
  'apartment': 'building', 'brutalist': 'building', 'crane': 'building',
  'ferris-wheel-poly': 'building',
  'hq-traveldoor': 'building', 'hq-maq': 'building', 'hq-georgia': 'building',
  'hq-outbound': 'building', 'hq-binomar': 'building',
  'stop-sign': 'prop', 'traffic-light': 'prop', 'road-bits': 'prop', 'path-stones': 'prop'
};

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

/* the stock simplifier with meshoptimizer's Permissive flag added */
const PERMISSIVE = Object.create(MeshoptSimplifier, {
  simplify: { value: (idx, pos, stride, target, err, flags = []) =>
    MeshoptSimplifier.simplify(idx, pos, stride, target, err, [...flags, 'Permissive']) }
});

const tris = (doc) => doc.getRoot().listMeshes().reduce((n, m) => n + m.listPrimitives()
  .reduce((k, p) => k + (p.getIndices() || p.getAttribute('POSITION')).getCount() / 3, 0), 0);

await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
mkdirSync(OUT, { recursive: true });

let before = 0, after = 0;
for (const file of readdirSync(SRC).filter((f) => f.endsWith('.glb')).sort()) {
  const name = file.replace(/\.glb$/, '');
  const p = PROFILES[KIND[name] || 'prop'];
  const doc = await io.read(join(SRC, file));
  const t0 = tris(doc);

  const steps = [dedup(), weld()];
  if (p.ratio < 1) steps.push(simplify({
    simplifier: p.permissive ? PERMISSIVE : MeshoptSimplifier, ratio: p.ratio, error: p.error
  }));
  if (p.tex) steps.push(textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [p.tex, p.tex] }));
  steps.push(prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await doc.transform(...steps);

  await io.write(join(OUT, file), doc);
  const s0 = statSync(join(SRC, file)).size, s1 = statSync(join(OUT, file)).size;
  before += s0; after += s1;
  console.log(file.padEnd(24), (s0 / 1024 | 0) + 'k →', (s1 / 1024 | 0) + 'k',
    ' tris', t0 | 0, '→', tris(doc) | 0);
}
console.log('total', (before / 1048576).toFixed(2) + ' MB →', (after / 1048576).toFixed(2) + ' MB');
