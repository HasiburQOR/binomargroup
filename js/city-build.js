/* =============================================================
   BINOMAR GROUP — 3D city builders
   -------------------------------------------------------------
   Pure geometry helpers: plot layout, procedural buildings,
   trees, lamps, monument and clouds. No app logic here —
   js/city.js owns the scene, lights and interaction.
   ============================================================= */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeFloatingBanner } from './banner.js';
import { getIndustryMeta } from './data.js';
import {
  shingleTexture, addRoofDetails, addPorchAndTrim, addGarden,
  addModernCrown, addModernEntrance, addRooftopPlant
} from './detail.js';

/* ---------- tiny deterministic RNG (the city looks identical on every visit) ---------- */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFromString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}


/* ---------- draw-call diet -------------------------------------------------
   Props like trees and lamps are built from a dozen little meshes, which
   is pleasant to author and expensive to draw. compactGroup() bakes each
   group's direct mesh children down to one mesh per material, so a forest
   costs tens of draw calls instead of hundreds. Meshes flagged
   `userData.keep` (anything animated on its own) are left alone. */
export function compactGroup(group) {
  const banks = new Map();
  for (const child of [...group.children]) {
    if (!child.isMesh || Array.isArray(child.material) || child.userData.keep) continue;
    const indexed = child.geometry.index !== null;
    const key = child.material.uuid + (indexed ? ':i' : ':n');
    if (!banks.has(key)) banks.set(key, { mat: child.material, geos: [], src: [], cast: false, recv: false });
    const bank = banks.get(key);
    child.updateMatrix();
    bank.geos.push(child.geometry.clone().applyMatrix4(child.matrix));
    bank.src.push(child);
    bank.cast = bank.cast || child.castShadow;
    bank.recv = bank.recv || child.receiveShadow;
  }
  for (const bank of banks.values()) {
    if (bank.geos.length < 2) { for (const g of bank.geos) g.dispose(); continue; }
    let merged = null;
    try { merged = mergeGeometries(bank.geos); } catch (e) { merged = null; }
    for (const g of bank.geos) g.dispose();
    if (!merged) continue;
    for (const m of bank.src) group.remove(m);
    const mesh = new THREE.Mesh(merged, bank.mat);
    mesh.castShadow = bank.cast;
    mesh.receiveShadow = bank.recv;
    group.add(mesh);
  }
  return group;
}


/* Bake a pile of already-placed props down to one mesh per material.
   compactGroup() only flattens a single prop; this flattens a whole
   scatter — hundreds of bushes and boulders become a handful of calls.
   Only use it on things that never move on their own. */
export function batchScatter(props) {
  const banks = new Map();
  for (const root of props) {
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      if (!o.isMesh || Array.isArray(o.material)) return;
      const key = o.material.uuid + (o.geometry.index !== null ? ':i' : ':n');
      if (!banks.has(key)) banks.set(key, { mat: o.material, geos: [], cast: false, recv: false });
      const bank = banks.get(key);
      bank.geos.push(o.geometry.clone().applyMatrix4(o.matrixWorld));
      bank.cast = bank.cast || o.castShadow;
      bank.recv = bank.recv || o.receiveShadow;
    });
  }
  const out = [];
  for (const bank of banks.values()) {
    let merged = null;
    try { merged = mergeGeometries(bank.geos); } catch (e) { merged = null; }
    for (const g of bank.geos) g.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, bank.mat);
    mesh.castShadow = bank.cast;
    mesh.receiveShadow = bank.recv;
    out.push(mesh);
  }
  return out;
}

/* ---------- MOUNTAIN TERRAIN ------------------------------------------------
   Deterministic heightfield: a summit plateau (r≈26, h≈58), ridged slopes
   and a green valley plain beyond r≈138. The same height function places
   buildings, roads and trees, so everything sits exactly on the ground. */
export function makeBaseTerrain() {
  const rnd = mulberry32(1337);
  const G = 32, grid = [];
  for (let i = 0; i <= G; i++) { grid[i] = []; for (let j = 0; j <= G; j++) grid[i][j] = rnd(); }
  const noise2 = (x, z) => {
    const fx = Math.floor(x), fz = Math.floor(z);
    const gx = x - fx, gz = z - fz;
    const ix = ((fx % G) + G) % G, iz = ((fz % G) + G) % G;
    const ix1 = (ix + 1) % G, iz1 = (iz + 1) % G;
    const sx = gx * gx * (3 - 2 * gx), sz = gz * gz * (3 - 2 * gz);
    const a = grid[ix][iz], b = grid[ix1][iz], c = grid[ix][iz1], dd = grid[ix1][iz1];
    return a + (b - a) * sx + (c - a) * sz + (a - b - c + dd) * sx * sz;
  };
  const PLATEAU = 26, VALLEY = 138, PEAK = 58;
  return function base(x, z) {
    const r = Math.hypot(x, z);
    if (r >= VALLEY) return 0;
    let h;
    if (r <= PLATEAU) h = PEAK + 0.9 * (1 - Math.min(1, r / PLATEAU));   // gentle summit dome
    else h = PEAK * Math.pow(1 - (r - PLATEAU) / (VALLEY - PLATEAU), 1.35);
    const w = Math.min(1, Math.max(0, (r - PLATEAU) / 22)) *          // ridge weight
              Math.min(1, Math.max(0, (VALLEY - 12 - r) / 26));
    h += (noise2(x * 0.028 + 7, z * 0.028 + 7) - 0.5) * 17 * w;       // broad ridges
    h += (noise2(x * 0.11 + 51, z * 0.11 + 51) - 0.5) * 3.2 * w;      // small detail
    return Math.max(0, h);
  };
}

/* flatten circular pads (summit plaza + building plots) into the heightfield */
export function withPads(base, pads) {
  return function (x, z) {
    let h = base(x, z);
    for (const p of pads) {
      const dd = Math.hypot(x - p.x, z - p.z);
      if (dd < p.r) {
        const k = dd / p.r, blend = k * k * (3 - 2 * k);               // smoothstep
        h = p.y + (h - p.y) * blend;
      }
    }
    return h;
  };
}

/* mountain mesh: displaced plane + baked vertex colours
   (meadow → rock on steep faces → snow dusting on ridge crests). */
export function makeMountain(H) {
  const SIZE = 430, SEG = 190;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  /* a mountainside is not one green. Meadow warms to a drier gold on the
     sunny south flank, cools toward moss in the hollows, breaks to heather
     and scree as it climbs, turns to bare rock on the steep faces and takes
     snow only on the crests. */
  const meadow = new THREE.Color('#6fae58'), meadowDry = new THREE.Color('#93ad52');
  const moss = new THREE.Color('#4a7f4e'), heather = new THREE.Color('#7c7a92');
  const rock = new THREE.Color('#8b8a93'), rock2 = new THREE.Color('#6a6873');
  const scree = new THREE.Color('#a39d94');
  const snow = new THREE.Color('#eef3f7'), dirt = new THREE.Color('#9a8a6a');
  const tmp = new THREE.Color(), tmp2 = new THREE.Color();
  const smooth = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const y = H(x, z);
    pos.setY(i, y);
    const steep = Math.hypot(H(x + 1.4, z) - H(x - 1.4, z), H(x, z + 1.4) - H(x, z - 1.4)) / 2.8;

    /* two noise fields: one broad for patchiness, one fine for mottling */
    const broad = (Math.sin(x * 0.041 + z * 0.028) + Math.sin(x * 0.019 - z * 0.033)) * 0.25 + 0.5;
    const fine = (Math.sin(x * 0.21 + z * 0.17) + Math.sin(x * 0.07 - z * 0.11)) * 0.25 + 0.5;

    /* which way the ground faces: the sun sits off to +x/+z */
    const nx = (H(x - 1.4, z) - H(x + 1.4, z)) / 2.8;
    const nz = (H(x, z - 1.4) - H(x, z + 1.4)) / 2.8;
    const sunny = Math.max(0, Math.min(1, (nx * 0.72 + nz * 0.5) * 1.6 + 0.5));

    tmp.copy(meadow).lerp(moss, broad * 0.55);                 // hollows go mossy
    tmp.lerp(meadowDry, sunny * 0.5 + fine * 0.14);            // sun-facing dries out
    if (y < 2.5) tmp.lerp(dirt, 0.26 * (1 - y / 2.5));         // warm valley floor
    /* heather and scree take over as it climbs */
    tmp.lerp(heather, smooth(30, 52, y) * (0.28 + broad * 0.34));
    tmp.lerp(scree, smooth(0.42, 0.72, steep) * smooth(24, 46, y) * 0.55);

    tmp2.copy(rock).lerp(rock2, fine);
    tmp.lerp(tmp2, smooth(0.52, 0.95, steep));                 // rock on steep faces
    tmp.lerp(snow, smooth(56.5, 60, y) * smooth(0.18, 0.5, steep) * 0.9);
    colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  mesh.receiveShadow = true;
  return mesh;
}


/* ---------- the world beyond the map ---------------------------------------
   The detailed terrain is a 430-unit plane, and a plane has a rim. Left
   alone you see that rim end in mid-air and the whole village reads as a
   slab floating in the sky. So the world keeps going: a rolling plain that
   runs out past the fog wall, and a forest standing on it all the way to
   the horizon. Both sample outerHeight(), so the treeline follows the
   land instead of hovering over it. */
export function outerHeight(x, z) {
  const r = Math.hypot(x, z);
  /* flat where it meets the mountain's valley floor, swelling further out */
  const t = Math.min(1, Math.max(0, (r - 148) / 120));
  const k = t * t * (3 - 2 * t);
  return (Math.sin(x * 0.0134) * Math.cos(z * 0.0112) * 8.5 +
          Math.sin(x * 0.0061 + 1.7) * Math.cos(z * 0.0083 - 0.6) * 15 +
          Math.sin(x * 0.028 - 0.4) * Math.cos(z * 0.031) * 2.2) * k - 0.15;
}

export function makeOuterPlain(innerR, outerR) {
  const geo = new THREE.RingGeometry(innerR, outerR, 190, 46);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const meadow = new THREE.Color('#6aa858');    // same grass as the valley floor
  const wooded = new THREE.Color('#4a7c52');    // the land under the forest
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const r = Math.hypot(x, z);
    pos.setY(i, outerHeight(x, z));
    const k = Math.min(1, Math.max(0, (r - innerR) / (outerR - innerR)));
    tmp.copy(meadow).lerp(wooded, Math.pow(k, 0.5));
    colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 1
  }));
  mesh.renderOrder = -1;
  return mesh;
}

/* Five belts of trees marching to the horizon. Each belt is merged into a
   single mesh and washed further toward the haze, so linear fog and a
   colour ramp between them do the aerial perspective together. */
export function makeDistantForest(scale) {
  const k = scale === undefined ? 1 : scale;
  const group = new THREE.Group();
  const rnd = mulberry32(60217);
  const belts = [
    { r0: 198, r1: 300, n: 700, h: [9, 19], tint: 0.04 },
    { r0: 250, r1: 392, n: 800, h: [10, 24], tint: 0.13 },
    { r0: 360, r1: 530, n: 860, h: [11, 27], tint: 0.26 },
    { r0: 495, r1: 700, n: 820, h: [12, 30], tint: 0.42 },
    { r0: 650, r1: 880, n: 680, h: [13, 32], tint: 0.58 }
  ];
  const haze = new THREE.Color('#a8bed6');
  /* a mixed wood rather than one shade of green: cool spruce, warm birch,
     olive scrub and the odd turning tree keep the canopy from reading flat */
  const SPECIES = [
    { lo: '#20452f', hi: '#3d7048', w: 0.30 },   // dark spruce
    { lo: '#2f5a3c', hi: '#589a56', w: 0.26 },   // mid pine
    { lo: '#3c5f34', hi: '#79a755', w: 0.18 },   // birch / beech
    { lo: '#44562c', hi: '#8a9a4a', w: 0.14 },   // olive scrub
    { lo: '#5c4a22', hi: '#c08a35', w: 0.08 },   // turning
    { lo: '#2a4a52', hi: '#4c8080', w: 0.04 }    // blue-green fir
  ];
  const pickSpecies = (v) => {
    let acc = 0;
    for (const sp of SPECIES) { acc += sp.w; if (v <= acc) return sp; }
    return SPECIES[0];
  };

  for (const b of belts) {
    const parts = [];
    /* clump them: pick a stand, then scatter a handful of trees inside it,
       so the treeline has thickets and clearings instead of even spacing */
    const target = Math.max(40, Math.round(b.n * k));
    let placed = 0;
    while (placed < target) {
      const sa = rnd() * Math.PI * 2;
      const sr = b.r0 + Math.pow(rnd(), 0.8) * (b.r1 - b.r0);
      const spread = 9 + rnd() * 18;
      const stand = 4 + Math.floor(rnd() * 8);
      for (let j = 0; j < stand && placed < target; j++, placed++) {
      const ta = rnd() * Math.PI * 2;
      const tr = Math.sqrt(rnd()) * spread;
      const x = Math.cos(sa) * sr + Math.cos(ta) * tr;
      const z = Math.sin(sa) * sr + Math.sin(ta) * tr;
      const y = outerHeight(x, z);
      let h = b.h[0] + Math.pow(rnd(), 1.4) * (b.h[1] - b.h[0]);
      if (rnd() < 0.09) h *= 1.55;                 // emergents breaking the canopy
      const rr = h * (0.20 + rnd() * 0.15);
      const conifer = rnd() < 0.58;
      const sp = pickSpecies(rnd());
      const deep = new THREE.Color(sp.lo);
      const leaf = new THREE.Color(sp.hi);
      const tone = 0.7 + rnd() * 0.55;

      const bits = [];
      if (conifer) {
        /* three tiers instead of two, with a leaning spire on some */
        const tiers = 2 + (rnd() < 0.45 ? 1 : 0);
        for (let ti = 0; ti < tiers; ti++) {
          const k = ti / tiers;
          const cone = new THREE.ConeGeometry(rr * (1 - k * 0.42), h * (0.62 - k * 0.14), 5);
          cone.translate(0, h * (0.32 + k * 0.26), 0);
          bits.push(cone);
        }
        if (rnd() < 0.3) {
          const spire = new THREE.ConeGeometry(rr * 0.3, h * 0.3, 4);
          spire.rotateZ((rnd() - 0.5) * 0.3);
          spire.translate(0, h * 0.95, 0);
          bits.push(spire);
        }
      } else {
        const trunk = new THREE.ConeGeometry(rr * 0.2, h * 0.58, 4);
        trunk.translate(0, h * 0.29, 0);
        bits.push(trunk);
        /* a crown built from two or three offset lobes reads far less
           like a lollipop than one sphere does */
        const lobes = 2 + Math.floor(rnd() * 2);
        for (let li = 0; li < lobes; li++) {
          const lr = rr * (0.72 + rnd() * 0.5);
          const la = rnd() * Math.PI * 2;
          const ld = li === 0 ? 0 : rr * (0.35 + rnd() * 0.45);
          const crown = new THREE.SphereGeometry(lr, 6, 4);
          crown.scale(1, 0.72 + rnd() * 0.3, 1);
          crown.translate(Math.cos(la) * ld, h * (0.68 + rnd() * 0.22), Math.sin(la) * ld);
          bits.push(crown);
        }
      }

      const tmp = new THREE.Color();
      for (const geo of bits) {
        geo.rotateY(rnd() * Math.PI * 2);
        geo.translate(x, y, z);
        const pp = geo.attributes.position;
        const cols = new Float32Array(pp.count * 3);
        for (let v = 0; v < pp.count; v++) {
          /* darker in the understory, lighter at the crown */
          const k = Math.min(1, Math.max(0, (pp.getY(v) - y) / Math.max(1, h)));
          tmp.copy(deep).lerp(leaf, k * tone).lerp(haze, b.tint);
          cols[v * 3] = tmp.r; cols[v * 3 + 1] = tmp.g; cols[v * 3 + 2] = tmp.b;
        }
        geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
        parts.push(geo);
      }
      }
    }
    const merged = mergeGeometries(parts);
    for (const g of parts) g.dispose();
    const mesh = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 1, flatShading: true
    }));
    mesh.renderOrder = -1;
    group.add(mesh);
  }
  return group;
}

/* ---------- the spiral road: valley → summit plaza (shared with the layout) */
export function roadAt(t) {
  const a = 0.4 + t * 2.3 * Math.PI * 2;
  const r = 27 + t * 104;
  return { x: Math.cos(a) * r, z: Math.sin(a) * r, r, a };
}
/* t0/t1 extend the run past the prop-line at both ends: the carriageway
   slides in under the summit plaza (t < 0) and out into the valley meadow
   (t > 1), so the road never shows a raw cut-off edge where it "starts". */
export function spiralRoadPoints(t0 = 0, t1 = 1, n = 250) {
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push(roadAt(t0 + (t1 - t0) * (i / n)));
  return pts;
}

/* ---------- the carriageway ------------------------------------------------
   A terrain-hugging ribbon, but built with a proper cross-section: a worn
   asphalt crown, a paler gravel shoulder either side and a soft verge that
   blends into the grass. Three strips instead of one flat quad is the
   difference between "a brown line" and "a road". */
export function roadSurfaceTexture() {
  const W = 256, H = 256;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const rnd = mulberry32(90210);
  g.fillStyle = '#7d776e';
  g.fillRect(0, 0, W, H);
  /* aggregate speckle */
  for (let i = 0; i < 5200; i++) {
    const v = 96 + Math.floor(rnd() * 62);
    g.fillStyle = 'rgba(' + v + ',' + (v - 2) + ',' + (v - 6) + ',' + (0.25 + rnd() * 0.5).toFixed(2) + ')';
    g.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 2.4, 1 + rnd() * 2.4);
  }
  /* wheel polish down the two tracks, and patches of repair */
  for (const tx of [W * 0.3, W * 0.7]) {
    const grad = g.createLinearGradient(tx - 26, 0, tx + 26, 0);
    grad.addColorStop(0, 'rgba(120,116,108,0)');
    grad.addColorStop(0.5, 'rgba(176,170,160,0.26)');
    grad.addColorStop(1, 'rgba(120,116,108,0)');
    g.fillStyle = grad;
    g.fillRect(tx - 26, 0, 52, H);
  }
  for (let i = 0; i < 14; i++) {
    g.fillStyle = 'rgba(60,56,50,' + (0.05 + rnd() * 0.09).toFixed(2) + ')';
    g.fillRect(rnd() * W, rnd() * H, 18 + rnd() * 46, 12 + rnd() * 30);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/* one strip of the cross-section, offset sideways from the centreline */
function roadStrip(points, from, to, lift, H, mat, repeatV, taper) {
  const pos = [], uv = [], idx = [];
  const n = points.length;
  let run = 0;
  for (let i = 0; i < n; i++) {
    const p = points[i];
    const prev = points[Math.max(0, i - 1)], next = points[Math.min(n - 1, i + 1)];
    let tx = next.x - prev.x, tz = next.z - prev.z;
    const len = Math.hypot(tx, tz) || 1;
    tx /= len; tz /= len;
    const nx = -tz, nz = tx;                                    // left normal
    if (i > 0) run += Math.hypot(p.x - points[i - 1].x, p.z - points[i - 1].z);
    const k = taper ? taper[i] : 1;                             // width scale (taper)
    const lx = p.x + nx * from * k, lz = p.z + nz * from * k;
    const rx = p.x + nx * to * k, rz = p.z + nz * to * k;
    pos.push(lx, H(lx, lz) + lift, lz, rx, H(rx, rz) + lift, rz);
    uv.push(0, run * (repeatV || 0.12), 1, run * (repeatV || 0.12));
    if (i < n - 1) { const b = i * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

export function makeRoadRibbon(points, width, mat, H, opts = {}) {
  const group = new THREE.Group();
  const half = width / 2;
  /* optional taper: the last `taperEnd` points scale down toward zero
     width, so the road dissolves into the ground instead of stopping
     on a raw edge */
  let taper = null;
  if (opts.taperEnd) {
    taper = points.map((_, i) => {
      const left = points.length - 1 - i;
      return left < opts.taperEnd ? Math.max(0.04, left / opts.taperEnd) : 1;
    });
  }
  if (opts.simple) {
    group.add(roadStrip(points, half, -half, 0.09, H, mat, null, taper));
    return group;
  }
  /* verge → shoulder → carriageway → shoulder → verge */
  const { asphalt, shoulder, verge } = opts;
  group.add(roadStrip(points, half + 0.62, half + 0.06, 0.055, H, verge, 0.05, taper));
  group.add(roadStrip(points, -half - 0.06, -half - 0.62, 0.055, H, verge, 0.05, taper));
  group.add(roadStrip(points, half + 0.22, half * 0.9, 0.075, H, shoulder, 0.08, taper));
  group.add(roadStrip(points, -half * 0.9, -half - 0.22, 0.075, H, shoulder, 0.08, taper));
  group.add(roadStrip(points, half * 0.9, -half * 0.9, 0.09, H, asphalt, 0.14, taper));
  return group;
}

/* ---------- mountain-top layout ----------------------------------------------
   Featured companies ring the summit plaza; the rest step down the
   mountainside beside the spiral road. Scales with company count. */
export function computeMountainLayout(count) {
  const spots = [];
  const plateauN = Math.min(count, 4);
  for (let i = 0; i < plateauN; i++) {
    const a = (i / plateauN) * Math.PI * 2 + 0.4;
    spots.push({ x: Math.cos(a) * 23, z: Math.sin(a) * 23, plateau: true });
  }
  const rem = count - plateauN;
  const rnd = mulberry32(20260921);
  for (let i = 0; i < rem; i++) {
    const t = 0.16 + (i + 0.5) / Math.max(1, rem) * 0.6;
    const rp = roadAt(t);
    const a = rp.a + (rnd() - 0.5) * 0.14;
    const r = rp.r + 11.5;                                            // plot beside the road
    spots.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, roadT: t });
  }
  return spots;
}

/* ---------- facade texture: colour + windows, with a matching emissive map ---------- */
function makeFacade(colorHex, seed, variant) {
  const px = 512;
  const base = document.createElement('canvas'); base.width = base.height = px;
  const b = base.getContext('2d');
  const emi = document.createElement('canvas'); emi.width = emi.height = px;
  const e = emi.getContext('2d');

  const col = new THREE.Color(colorHex);
  const grad = b.createLinearGradient(0, 0, 0, px);
  grad.addColorStop(0, '#' + col.clone().lerp(new THREE.Color('#ffffff'), 0.22).getHexString());
  grad.addColorStop(1, '#' + col.clone().multiplyScalar(0.72).getHexString());
  b.fillStyle = grad;
  b.fillRect(0, 0, px, px);
  e.fillStyle = '#000000';
  e.fillRect(0, 0, px, px);

  const rand = mulberry32(seed);
  const glass = 'rgba(18, 24, 36, 0.92)';
  const lit = () => (rand() < 0.5 ? '#ffd27a' : '#ffb84d');
  /* one pane: dark glass, a highlight down the left, a lit core at night */
  const pane = (x, y, w, h, litChance) => {
    b.fillStyle = glass;
    b.fillRect(x, y, w, h);
    b.fillStyle = 'rgba(255,255,255,0.10)';
    b.fillRect(x, y, Math.max(2, w * 0.28), h);
    b.strokeStyle = 'rgba(0,0,0,0.35)';
    b.lineWidth = 2;
    b.strokeRect(x, y, w, h);
    if (rand() < litChance) { e.fillStyle = lit(); e.fillRect(x, y, w, h); }
  };

  /* four curtain-wall languages, so no two towers wear the same facade */
  if (variant === 1) {
    /* ribbon windows: continuous horizontal bands, spandrels between */
    const rows = 5, rh = px / rows;
    for (let r = 0; r < rows; r++) {
      const y = r * rh + rh * 0.26, h = rh * 0.46;
      b.fillStyle = 'rgba(255,255,255,0.07)';
      b.fillRect(0, r * rh + rh * 0.78, px, rh * 0.1);       // spandrel line
      const segs = 6;
      for (let c = 0; c < segs; c++) {
        const w = px / segs;
        pane(c * w + 3, y, w - 6, h, 0.52);
      }
    }
  } else if (variant === 2) {
    /* vertical strip glazing between full-height piers */
    const bays = 7, bw = px / bays;
    for (let c = 0; c < bays; c++) {
      if (c % 2) {
        b.fillStyle = 'rgba(255,255,255,0.06)';              // pier
        b.fillRect(c * bw, 0, bw, px);
        continue;
      }
      const rows = 6, rh = px / rows;
      for (let r = 0; r < rows; r++) {
        pane(c * bw + bw * 0.18, r * rh + rh * 0.12, bw * 0.64, rh * 0.76, 0.5);
      }
    }
  } else if (variant === 3) {
    /* a tight chequer of small square punched windows */
    const cells = 6, cs = px / cells;
    for (let r = 0; r < cells; r++) {
      for (let c = 0; c < cells; c++) {
        if ((r + c) % 2 === 0 && rand() < 0.35) continue;    // blank masonry
        pane(c * cs + cs * 0.26, r * cs + cs * 0.24, cs * 0.48, cs * 0.52, 0.48);
      }
    }
  } else {
    /* the classic four-by-four grid */
    const cells = 4, cs = px / cells;
    const padX = cs * 0.24, padY = cs * 0.22;
    for (let r = 0; r < cells; r++) {
      for (let c = 0; c < cells; c++) {
        pane(c * cs + padX, r * cs + padY, cs - padX * 2, cs - padY * 2, 0.55);
      }
    }
  }

  const map = new THREE.CanvasTexture(base);
  const emissiveMap = new THREE.CanvasTexture(emi);
  for (const t of [map, emissiveMap]) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;
  return { map, emissiveMap };
}

/* ---------- traditional facades: timber planks / stone / plaster ------------ */
function finishFacade(base, emi) {
  const map = new THREE.CanvasTexture(base);
  const emissiveMap = new THREE.CanvasTexture(emi);
  for (const t of [map, emissiveMap]) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;
  return { map, emissiveMap };
}

/* chalet walls: wood planks + shuttered windows (brand-tinted trim).
   The grid is drawn to the building's real floor count, so the texture
   maps 1:1 onto the wall instead of tiling into a spreadsheet. */
function makeTimberFacade(colorHex, seed, cols, rows) {
  const px = 512;
  const base = document.createElement('canvas'); base.width = base.height = px;
  const b = base.getContext('2d');
  const emi = document.createElement('canvas'); emi.width = emi.height = px;
  const e = emi.getContext('2d');
  const col = new THREE.Color(colorHex);
  const wood = col.clone().lerp(new THREE.Color('#9a6a3c'), 0.72);
  b.fillStyle = '#' + wood.getHexString();
  b.fillRect(0, 0, px, px);
  for (let y = 0; y < px; y += 26) {                       // plank shading
    b.fillStyle = 'rgba(43,26,12,0.35)'; b.fillRect(0, y, px, 3);
    b.fillStyle = 'rgba(255,225,180,0.10)'; b.fillRect(0, y + 3, px, 2);
  }
  e.fillStyle = '#000000'; e.fillRect(0, 0, px, px);

  const rand = mulberry32(seed);
  const cw = px / cols, ch = px / rows;
  const ww = Math.min(cw * 0.34, 78), wh = Math.min(ch * 0.42, 92);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = (c + 0.5) * cw, y = (r + 0.5) * ch;
      b.fillStyle = 'rgba(20,16,26,0.92)'; b.fillRect(x - ww / 2, y - wh / 2, ww, wh);
      b.strokeStyle = 'rgba(247,240,229,0.9)'; b.lineWidth = 6;
      b.strokeRect(x - ww / 2, y - wh / 2, ww, wh);
      b.fillStyle = '#' + col.clone().lerp(new THREE.Color('#ffffff'), 0.22).getHexString();
      b.fillRect(x - ww / 2 - 16, y - wh / 2 - 5, 13, wh + 10);       // shutters
      b.fillRect(x + ww / 2 + 3, y - wh / 2 - 5, 13, wh + 10);
      b.strokeStyle = 'rgba(255,236,200,0.5)'; b.lineWidth = 3;
      b.beginPath(); b.moveTo(x - ww / 2, y); b.lineTo(x + ww / 2, y); b.stroke();
      b.beginPath(); b.moveTo(x, y - wh / 2); b.lineTo(x, y + wh / 2); b.stroke();
      if (rand() < 0.62) {
        e.fillStyle = rand() < 0.5 ? '#ffca7a' : '#ffb84d';
        e.fillRect(x - ww / 2 + 3, y - wh / 2 + 3, ww - 6, wh - 6);
      }
    }
  }
  return finishFacade(base, emi);
}

/* georgian plaster / barn stone — `mode` = 'plaster' | 'stone'.
   Same 1:1 grid treatment as the timber walls. */
function makeStoneFacade(colorHex, seed, mode, cols, rows) {
  const px = 512;
  const base = document.createElement('canvas'); base.width = base.height = px;
  const b = base.getContext('2d');
  const emi = document.createElement('canvas'); emi.width = emi.height = px;
  const e = emi.getContext('2d');
  const col = new THREE.Color(colorHex);
  e.fillStyle = '#000000'; e.fillRect(0, 0, px, px);
  const rand = mulberry32(seed);
  if (mode === 'stone') {
    b.fillStyle = '#7e786f'; b.fillRect(0, 0, px, px);
    for (let y = 0, row = 0; y < px; y += 46, row++) {     // offset stone blocks
      for (let x = (row % 2) * 30; x < px; x += 60) {
        const g = 118 + Math.floor(rand() * 34);
        b.fillStyle = 'rgb(' + g + ',' + (g - 5) + ',' + (g - 14) + ')';
        b.fillRect(x + 2, y + 2, 55, 41);
      }
    }
  } else {
    b.fillStyle = '#' + col.clone().lerp(new THREE.Color('#e8dcc8'), 0.62).getHexString();
    b.fillRect(0, 0, px, px);
    for (let i = 0; i < 260; i++) {                        // aged plaster speckle
      b.fillStyle = 'rgba(120,104,80,' + (0.04 + rand() * 0.05) + ')';
      b.fillRect(rand() * px, rand() * px, 3 + rand() * 8, 2 + rand() * 4);
    }
    for (let y = 0; y < px; y += 34) { b.fillStyle = 'rgba(60,50,38,0.06)'; b.fillRect(0, y, px, 2); }
  }

  const cw = px / cols, ch = px / rows;
  const ww = Math.min(cw * 0.40, 86), wh = Math.min(ch * 0.46, 100);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = (c + 0.5) * cw, y = (r + 0.5) * ch;
      b.fillStyle = '#1d1a22'; b.fillRect(x - ww / 2, y - wh / 2, ww, wh);
      b.strokeStyle = mode === 'stone' ? '#5f594e' : '#f4ead6';
      b.lineWidth = 8; b.strokeRect(x - ww / 2, y - wh / 2, ww, wh);
      b.fillStyle = mode === 'stone' ? '#6b655a' : '#d9c9a8';
      b.fillRect(x - ww / 2 - 11, y - wh / 2 - 13, ww + 22, 13);      // lintel
      b.fillRect(x - ww / 2 - 11, y + wh / 2, ww + 22, 13);           // sill
      b.strokeStyle = 'rgba(210,200,180,0.55)'; b.lineWidth = 3;
      b.beginPath(); b.moveTo(x, y - wh / 2); b.lineTo(x, y + wh / 2); b.stroke();
      if (rand() < 0.55) { e.fillStyle = '#ffc76a'; e.fillRect(x - ww / 2 + 4, y - wh / 2 + 4, ww - 8, wh - 8); }
    }
  }
  return finishFacade(base, emi);
}


/* ---------- marquee bulbs -----------------------------------------------
   A sign's chase lights used to be one mesh and one material per bulb,
   which is a few hundred draw calls once every building has a sign. This
   packs a whole sign's bulbs into one InstancedMesh and runs the chase in
   the shader, so the wave still travels but the sign costs one call. */
const MARQUEE_VERT = `
  attribute vec3 aOffset;
  attribute float aPhase;
  attribute float aTint;
  uniform float uTime;
  varying float vPulse;
  varying float vTint;
  void main() {
    vTint = aTint;
    vPulse = 0.42 + 0.58 * pow(max(0.0, sin(uTime * 2.4 - aPhase)), 1.6);
    vec3 p = position + aOffset;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }`;

const MARQUEE_FRAG = `
  uniform float uIntensity;
  uniform vec3 uWarm;
  uniform vec3 uCool;
  varying float vPulse;
  varying float vTint;
  void main() {
    vec3 col = mix(uWarm, uCool, vTint);
    gl_FragColor = vec4(col * (0.30 + 0.85 * vPulse * uIntensity), 1.0);
  }`;

export function makeMarquee(positions, radius, warmHex, coolHex) {
  const n = positions.length;
  const src = new THREE.SphereGeometry(radius || 0.15, 6, 5);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = src.index;
  geo.attributes.position = src.attributes.position;
  geo.attributes.normal = src.attributes.normal;
  geo.instanceCount = n;

  const off = new Float32Array(n * 3);
  const pha = new Float32Array(n);
  const tnt = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    off[i * 3] = positions[i][0];
    off[i * 3 + 1] = positions[i][1];
    off[i * 3 + 2] = positions[i][2];
    pha[i] = i * 0.42;                       // the chase travels in order
    tnt[i] = i % 2;
  }
  geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(off, 3));
  geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(pha, 1));
  geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(tnt, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: 0.25 },
      uWarm: { value: new THREE.Color(warmHex || '#ffe3ae') },
      uCool: { value: new THREE.Color(coolHex || '#9fdcff') }
    },
    vertexShader: MARQUEE_VERT,
    fragmentShader: MARQUEE_FRAG,
    fog: false
  });

  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  return { mesh, material };
}

/* ---------- floating name label (shown on hover) ---------- */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function makeLabelSprite(text, colorHex) {
  const fs = 34, padX = 26, padY = 18, maxW = 430;
  const c = document.createElement('canvas');
  let ctx = c.getContext('2d');
  const font = '700 ' + fs + 'px "Plus Jakarta Sans", "Segoe UI", Arial, sans-serif';
  ctx.font = font;
  let label = text;
  while (label.length > 1 && ctx.measureText(label + '…').width > maxW) label = label.slice(0, -1);
  if (label !== text) label += '…';
  const tw = Math.ceil(ctx.measureText(label).width);
  c.width = tw + padX * 2;
  c.height = fs + padY * 2;
  ctx = c.getContext('2d');
  ctx.font = font;
  roundRect(ctx, 1.5, 1.5, c.width - 3, c.height - 3, 14);
  ctx.fillStyle = 'rgba(10, 16, 28, 0.92)';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = colorHex;
  ctx.stroke();
  ctx.fillStyle = '#f1f6ff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, c.width / 2, c.height / 2 + 2);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, fog: false });
  const sprite = new THREE.Sprite(mat);
  sprite.renderOrder = 999;
  sprite.center.set(0.5, 0);
  sprite.scale.set(c.width / 46, c.height / 46, 1);
  return sprite;
}

/* ---------- building archetypes: dimensions per "kind" ---------- */
const KINDS = {
  tower:     { w: 8,  d: 8,  floorH: 1.9, plinth: 0.6 },
  office:    { w: 11, d: 9,  floorH: 1.6, plinth: 0.5 },
  shop:      { w: 13, d: 10, floorH: 2.6, plinth: 0.4 },
  warehouse: { w: 15, d: 11, floorH: 3.4, plinth: 0.3 },
  house:     { w: 10, d: 8,  floorH: 2.3, plinth: 0.5 },
  barn:      { w: 14, d: 9,  floorH: 2.9, plinth: 0.4 },
  hall:      { w: 13, d: 11, floorH: 3.4, plinth: 0.3 }
};

/* ---------- architecture styles ---------------------------------------------
   A company's `style` field picks the look; DEFAULT_STYLE maps industries
   to a sensible style when the field is missing. `traditional` buildings
   are built by makeTraditionalBuilding (pitched roofs, timber/stone),
   modern ones by makeModernBuilding (glass + roof decor). */
const STYLES = {
  'modern-tower':  { kind: 'tower',      traditional: false },
  'modern-office': { kind: 'office',     traditional: false },
  'modern-shop':   { kind: 'shop',       traditional: false },
  georgian:        { kind: 'house',      traditional: true, facade: 'plaster', roof: '#b4552f', trim: '#7a5230' },
  chalet:          { kind: 'house',      traditional: true, facade: 'timber',  roof: '#5b6570', trim: '#6e4a2a' },
  barn:            { kind: 'barn',       traditional: true, facade: 'stone',   roof: '#4f5a66', trim: '#3f4854' },
  hall:            { kind: 'hall',       traditional: true, facade: 'plaster', roof: '#b4552f', trim: '#7a5230' }
};
const DEFAULT_STYLE = {
  travel: 'modern-tower', tech: 'modern-office', outbound: 'modern-office',
  dmc: 'georgian', tourism: 'chalet', textiles: 'barn', retail: 'hall',
  realestate: 'modern-tower', hotel: 'modern-tower', finance: 'modern-tower',
  logistics: 'modern-shop', foods: 'modern-office', pharma: 'modern-office',
  media: 'modern-office', energy: 'modern-office', construction: 'modern-office'
};

/* plot/pad footprint of a company's building (used for terrain flattening) */
/* Every company's plot is nudged off the archetype by a deterministic
   amount, so two firms that share a style never share a silhouette.
   Layout and geometry both call this, so the pads always match. */
export function getBuildingDims(company) {
  const st = company.style && STYLES[company.style]
    ? STYLES[company.style]
    : STYLES[DEFAULT_STYLE[company.industry] || 'modern-office'];
  const k = KINDS[st.kind];
  const r = mulberry32(seedFromString(company.id) ^ 0x5bf03635);
  /* the whole district is pulled down a notch so the plaza monument
     towers over it the way a civic landmark should */
  const S = 0.76;
  return {
    kind: st.kind,
    w: k.w * S * (0.86 + r() * 0.32),
    d: k.d * S * (0.86 + r() * 0.32),
    floorH: k.floorH * S * (0.92 + r() * 0.2),
    plinth: k.plinth,
    facade: Math.floor(r() * 4),          // which curtain-wall language
    massing: Math.floor(r() * 6),         // how the volume is stacked
    /* roof and wing come off their own hashes — drawn from the same
       stream they kept landing on the same value for half the village */
    roof: Math.floor(mulberry32(seedFromString(company.id) ^ 0x1b873593)() * 3),
    wing: Math.floor(mulberry32(seedFromString(company.id) ^ 0x27d4eb2f)() * 3)
  };
}

/* ---------- entrance canopy on the plaza-facing side ---------- */
function addCanopy(group, w, d, col) {
  const mat = new THREE.MeshStandardMaterial({ color: col.clone().multiplyScalar(0.75), roughness: 0.6 });
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(w * 0.55, 0.18, 2.0), mat);
  canopy.position.set(0, 3.1, d / 2 + 1.0);
  canopy.castShadow = true;
  group.add(canopy);
  const postGeo = new THREE.CylinderGeometry(0.07, 0.07, 3.1, 6);
  const postMat = new THREE.MeshStandardMaterial({ color: '#475569', roughness: 0.5, metalness: 0.4 });
  for (const px of [-w * 0.275 + 0.3, w * 0.275 - 0.3]) {
    const post = new THREE.Mesh(postGeo, postMat);
    post.position.set(px, 1.55, d / 2 + 1.75);
    group.add(post);
  }
}



/* ---------- traditional massing --------------------------------------------
   Houses get a footprint of their own: a plain block, a lower side wing,
   or a corner turret under a conical cap. */
function addTraditionalMassing(group, ctx) {
  const { variant, w, d, plinth, wallH, wallMat, roofMat, stoneMat, roofColor } = ctx;
  if (variant === 1) {
    /* a lower wing off one flank, with its own little hipped roof */
    const ww = w * 0.46, wh = wallH * 0.66, wd = d * 0.72;
    const wx = -(w / 2 + ww / 2 - 0.2);
    const body = new THREE.Mesh(new THREE.BoxGeometry(ww, wh, wd), wallMat);
    body.position.set(wx, plinth + wh / 2, 0);
    body.castShadow = body.receiveShadow = true;
    group.add(body);
    const base = new THREE.Mesh(new THREE.BoxGeometry(ww + 0.4, plinth + 0.4, wd + 0.4), stoneMat);
    base.position.set(wx, (plinth + 0.4) / 2 - 0.25, 0);
    group.add(base);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 4), roofMat);
    cap.scale.set((ww / 2 + 0.45) * Math.SQRT2, wh * 0.42, (wd / 2 + 0.45) * Math.SQRT2);
    cap.rotation.y = Math.PI / 4;
    cap.position.set(wx, plinth + wh + wh * 0.21, 0);
    cap.castShadow = true;
    group.add(cap);

  } else if (variant === 2) {
    /* a round corner turret rising past the eaves */
    const r = Math.min(w, d) * 0.20;
    const th = plinth + wallH * 1.14;
    const tx = w / 2 - r * 0.5, tz = d / 2 - r * 0.5;
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.08, th, 14), wallMat);
    tower.position.set(tx, th / 2, tz);
    tower.castShadow = tower.receiveShadow = true;
    group.add(tower);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.14, r * 1.14, 0.26, 14), stoneMat);
    band.position.set(tx, th, tz);
    group.add(band);
    const spire = new THREE.Mesh(new THREE.ConeGeometry(r * 1.2, r * 3.1, 14),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(roofColor).multiplyScalar(0.92), roughness: 0.95, flatShading: true
      }));
    spire.position.set(tx, th + r * 1.55, tz);
    spire.castShadow = true;
    group.add(spire);
  }
}

/* ---------- pitched roof shapes ---------------------------------------------
   A village where every house wears the same pyramid looks printed. Three
   silhouettes, picked per company: a hip (four slopes to a point), a gable
   (a ridge with triangular ends) and a mansard (steep skirt, shallow cap). */
function gableRoofGeometry(w, d, h) {
  const hw = w / 2, hd = d / 2;
  const v = [
    -hw, 0, -hd,   hw, 0, -hd,   hw, 0, hd,   -hw, 0, hd,   // eaves
    -hw, h, 0,     hw, h, 0                                  // ridge
  ];
  /* wound anticlockwise seen from outside — the first cut of this had
     every face inverted, which rendered the whole roof inside out */
  const f = [
    0, 5, 1, 0, 4, 5,      // back slope
    3, 5, 4, 3, 2, 5,      // front slope
    0, 3, 4,               // left gable
    1, 5, 2                // right gable
  ];
  /* u runs along the ridge, v from eave to ridge, so the shingle map
     courses correctly up both slopes */
  const uv = [0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 1, 1];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(f);
  geo.computeVertexNormals();
  return geo.toNonIndexed();          // flat shading needs split vertices
}

function makePitchedRoof(shape, w, d, h, ov, mat) {
  const g = new THREE.Group();
  if (shape === 1) {
    const roof = new THREE.Mesh(gableRoofGeometry(w + ov * 2, d + ov * 2, h), mat);
    roof.castShadow = true;
    g.add(roof);
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(w + ov * 2 + 0.2, 0.22, 0.34), mat);
    ridge.position.y = h;
    ridge.castShadow = true;
    g.add(ridge);
  } else if (shape === 2) {
    /* mansard: a steep skirt carrying a shallow hipped cap */
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 4), mat);
    skirt.scale.set((w / 2 + ov) * 0.72 * Math.SQRT2, h * 0.62, (d / 2 + ov) * 0.72 * Math.SQRT2);
    skirt.rotation.y = Math.PI / 4;
    skirt.position.y = h * 0.31;
    skirt.castShadow = true;
    /* widen the bottom rim so it flares over the walls */
    const sp = skirt.geometry.attributes.position;
    for (let i = 0; i < sp.count; i++) {
      if (sp.getY(i) < 0) sp.setX(i, sp.getX(i) * 1.42), sp.setZ(i, sp.getZ(i) * 1.42);
    }
    skirt.geometry.computeVertexNormals();
    g.add(skirt);
    const capMesh = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 4), mat);
    capMesh.scale.set((w / 2 + ov) * 0.74 * Math.SQRT2, h * 0.46, (d / 2 + ov) * 0.74 * Math.SQRT2);
    capMesh.rotation.y = Math.PI / 4;
    capMesh.position.y = h * 0.62 + h * 0.23;
    capMesh.castShadow = true;
    g.add(capMesh);
  } else {
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 4), mat);
    roof.scale.set((w / 2 + ov) * Math.SQRT2, h, (d / 2 + ov) * Math.SQRT2);
    roof.rotation.y = Math.PI / 4;
    roof.position.y = h / 2;
    roof.castShadow = true;
    g.add(roof);
  }
  return g;
}


/* ---------- modern massing -------------------------------------------------
   A district of identical extruded rectangles looks printed. Six ways to
   stack the same floor area, chosen per company: a plain slab, a round
   tower, a stepped ziggurat, twin wings joined by a sky-bridge, a tapered
   shaft and an L-shaped block with a taller corner. Each returns the volume
   to raycast against, plus the footprint the crown and rooftop plant sit on. */
function buildMassing(variant, w, d, height, mats) {
  const { winMat, roofMat, trimMat } = mats;
  const parts = [];
  const faces = [winMat, winMat, roofMat, roofMat, winMat, winMat];
  const boxAt = (bw, bh, bd, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), faces);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    parts.push(m);
    return m;
  };

  let hit, topW = w, topD = d, topY = height;

  if (variant === 1) {
    /* round tower with a banded collar every few floors */
    const r = Math.min(w, d) * 0.56;
    hit = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.04, height, 28, 1),
      [winMat, roofMat, roofMat]);
    hit.position.y = height / 2;
    hit.castShadow = hit.receiveShadow = true;
    parts.push(hit);
    const bands = Math.max(1, Math.round(height / 6));
    for (let i = 1; i <= bands; i++) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.06, r * 1.06, 0.3, 28), trimMat);
      band.position.y = (i / (bands + 1)) * height;
      parts.push(band);
    }
    topW = topD = r * 1.72;

  } else if (variant === 2) {
    /* ziggurat: three volumes stepping back as they rise */
    const h1 = height * 0.48, h2 = height * 0.32, h3 = height * 0.2;
    hit = boxAt(w, h1, d, 0, h1 / 2, 0);
    boxAt(w * 0.78, h2, d * 0.78, 0, h1 + h2 / 2, 0);
    boxAt(w * 0.54, h3, d * 0.54, 0, h1 + h2 + h3 / 2, 0);
    for (const [bw, bd, by] of [[w + 0.4, d + 0.4, h1], [w * 0.78 + 0.4, d * 0.78 + 0.4, h1 + h2]]) {
      const led = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.26, bd), trimMat);
      led.position.y = by;
      parts.push(led);
    }
    topW = w * 0.54; topD = d * 0.54;

  } else if (variant === 3) {
    /* twin wings with a sky-bridge across the gap */
    const ww = w * 0.40, gap = w * 0.20;
    const h2 = height * 0.84;
    hit = boxAt(ww, height, d, -(ww + gap) / 2, height / 2, 0);
    boxAt(ww, h2, d, (ww + gap) / 2, h2 / 2, 0);
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(gap + 0.6, 1.5, d * 0.5),
      [winMat, winMat, trimMat, trimMat, winMat, winMat]);
    bridge.position.y = height * 0.62;
    bridge.castShadow = true;
    parts.push(bridge);
    topW = ww; topD = d;

  } else if (variant === 4) {
    /* tapered shaft — wider at the base, drawn in toward the crown */
    hit = new THREE.Mesh(
      new THREE.CylinderGeometry(w * 0.40, w * 0.62, height, 4, 1),
      [winMat, roofMat, roofMat]);
    hit.rotation.y = Math.PI / 4;
    hit.position.y = height / 2;
    hit.scale.z = d / w;
    hit.castShadow = hit.receiveShadow = true;
    parts.push(hit);
    topW = w * 0.80; topD = d * 0.80;

  } else if (variant === 5) {
    /* L-shaped block with a taller corner */
    const armW = w * 0.56, armD = d * 0.54;
    hit = boxAt(w, height * 0.7, armD, 0, height * 0.35, -(d - armD) / 2);
    boxAt(armW, height, d, -(w - armW) / 2, height / 2, 0);
    const cornice = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.3, armD + 0.4), trimMat);
    cornice.position.set(0, height * 0.7, -(d - armD) / 2);
    parts.push(cornice);
    topW = armW; topD = d;

  } else {
    hit = boxAt(w, height, d, 0, height / 2, 0);
  }

  return { parts, hit, topW, topD, topY };
}

/* ---------- the company building ----------
   Returns { group, hit, label, height, mats, wind } so city.js can
   raycast, dim and animate it. The building always "faces" the
   central plaza (city.js rotates the group). Style comes from the
   company's `style` field, with a sensible industry default. */
export function makeBuilding(company) {
  const st = company.style && STYLES[company.style]
    ? STYLES[company.style]
    : STYLES[DEFAULT_STYLE[company.industry] || 'modern-office'];
  return st.traditional ? makeTraditionalBuilding(company, st)
                        : makeModernBuilding(company, st.kind);
}

function makeModernBuilding(company, kindName) {
  const group = new THREE.Group();
  const dims = getBuildingDims(company);
  const col = new THREE.Color(company.color);
  const floors = kindName === 'warehouse' ? Math.min(company.floors, 3) : company.floors;
  const { w, d, floorH, plinth } = dims;
  const height = plinth + floors * floorH;

  const { map, emissiveMap } = makeFacade(company.color, seedFromString(company.id), dims.facade);
  const quant = (v) => Math.max(0.25, Math.round(v * 4) / 4);
  map.repeat.set(quant(w / 4.6), quant(floors / 4));
  emissiveMap.repeat.copy(map.repeat);

  const winMat = new THREE.MeshStandardMaterial({
    map, emissiveMap,
    emissive: new THREE.Color('#ffffff'),
    emissiveIntensity: 0.05,
    roughness: 0.65, metalness: 0.15
  });
  const roofMat = new THREE.MeshStandardMaterial({ color: col.clone().multiplyScalar(0.45), roughness: 0.9 });

  const trimMat = new THREE.MeshStandardMaterial({
    color: col.clone().lerp(new THREE.Color('#e8eef7'), 0.5), roughness: 0.42, metalness: 0.45
  });
  const massing = buildMassing(dims.massing, w, d, height, { winMat, roofMat, trimMat });
  for (const m of massing.parts) group.add(m);
  const box = massing.hit;
  box.userData.companyId = company.id;

  addCanopy(group, w, d, col);

  const blink = [];
  const wind = [];
  const extraWindows = [], bollardMats = [];
  const rand = mulberry32(seedFromString(company.id) ^ 0x2545f491);
  const detailCtx = {
    company, w: massing.topW, d: massing.topD, height, floors, col, rand,
    round: dims.massing === 1,
    windowMats: extraWindows, lampMats: bollardMats, blink
  };
  addRooftopPlant(group, detailCtx);       // parapet + plant, before the decor sits on it
  addModernCrown(group, detailCtx);
  addModernEntrance(group, { ...detailCtx, w, d });
  addRoofDecor(group, company, { w: massing.topW, d: massing.topD, height: height + 0.45, blink, wind });

  /* the name rides above the roof on a camera-facing banner */
  const banner = makeFloatingBanner(company, {
    topY: height + (floors >= 7 ? 4.2 : 1.0),
    width: Math.max(13, Math.min(19, w * 1.7)),
    kicker: getIndustryMeta(company.industry).label
  });
  group.add(banner.group);

  const label = makeLabelSprite(company.name, company.color);
  label.position.set(0, banner.baseY + 4.0, 0);
  label.visible = false;
  group.add(label);

  const all = new Set();
  group.traverse((o) => {
    if (o.userData.wind) wind.push(o);
    if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => all.add(m));
  });

  return {
    group, hit: box, label, height, smoke: [],
    mats: {
      all: [...all],
      window: [winMat, ...extraWindows],
      lamp: bollardMats,
      blink
    },
    banner,
    marquees: [],
    wind
  };
}

/* ---------- traditional mountain building -----------------------------------
   Stone plinth, timber/plaster walls, pitched roof — same return contract
   as the modern towers so hover / click / night-glow keep working. */
function makeTraditionalBuilding(company, st) {
  const group = new THREE.Group();
  const dims = getBuildingDims(company);
  const col = new THREE.Color(company.color);
  const floors = Math.max(1, Math.min(company.floors || 1, 3));
  const { w, d, floorH, plinth } = dims;
  const wallH = floors * floorH;
  const totalH = plinth + wallH;
  const seed = seedFromString(company.id);

  /* one texture cell per real window: the wall gets exactly the grid
     the building's size and floor count call for */
  const cols = Math.min(5, Math.max(2, Math.round(w / 3.0)));
  const { map, emissiveMap } = st.facade === 'timber'
    ? makeTimberFacade(company.color, seed, cols, floors)
    : makeStoneFacade(company.color, seed, st.facade, cols, floors);
  map.repeat.set(1, 1);
  emissiveMap.repeat.set(1, 1);
  const wallMat = new THREE.MeshStandardMaterial({
    map, emissiveMap, emissive: new THREE.Color('#ffffff'),
    emissiveIntensity: 0.05, roughness: 0.9
  });
  const stoneMat = new THREE.MeshStandardMaterial({ color: '#8d8478', roughness: 1 });
  const woodMat = new THREE.MeshStandardMaterial({ color: st.trim, roughness: 0.9 });

  const plinthBox = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, plinth + 0.5, d + 0.5), stoneMat);
  plinthBox.position.y = (plinth + 0.5) / 2 - 0.3;
  plinthBox.castShadow = plinthBox.receiveShadow = true;
  group.add(plinthBox);

  const box = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), wallMat);
  box.position.y = plinth + wallH / 2;
  box.castShadow = box.receiveShadow = true;
  box.userData.companyId = company.id;
  group.add(box);

  /* pitched hip roof: shingled, with a deep overhang and eave brackets.
     Every company gets its own weathered tint of the style's roof colour. */
  const rand = mulberry32(seed ^ 0x9e3779b9);
  const roofH = 1.9 + Math.min(w, d) * 0.19;
  const ov = st.facade === 'timber' ? 0.75 : 0.5;
  const roofColor = '#' + new THREE.Color(st.roof)
    .offsetHSL((rand() - 0.5) * 0.06, (rand() - 0.5) * 0.18, (rand() - 0.5) * 0.10)
    .getHexString();
  const shingles = shingleTexture(roofColor, seed, rand);
  shingles.repeat.set(Math.max(3, Math.round(w / 2.4)), 3);
  const roofMat = new THREE.MeshStandardMaterial({
    map: shingles, color: '#ffffff', roughness: 0.96, flatShading: true
  });
  const roof = makePitchedRoof(dims.roof, w, d, roofH, ov, roofMat);
  roof.position.y = totalH;
  group.add(roof);

  /* carved brackets under the overhanging eaves */
  for (const bxp of [-w * 0.40, -w * 0.14, w * 0.14, w * 0.40]) {
    for (const bz of [d / 2, -d / 2]) {
      const br = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.5, 0.55), woodMat);
      br.position.set(bxp, totalH - 0.22, bz * 0.92);
      br.rotation.x = Math.sign(bz) * 0.5;
      group.add(br);
    }
  }

  /* the name rides above the ridge on a camera-facing banner */
  const banner = makeFloatingBanner(company, {
    topY: totalH + roofH,
    width: Math.max(12.5, Math.min(18, w * 1.6)),
    lift: 3.4,
    kicker: getIndustryMeta(company.industry).label
  });
  group.add(banner.group);

  /* door + step + lantern (glows at night like the windows) */
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.1, 0.18),
    new THREE.MeshStandardMaterial({ color: '#4a3524', roughness: 0.9 }));
  door.position.set(0, plinth + 1.05, d / 2 + 0.05);
  group.add(door);
  const step = new THREE.Mesh(new THREE.BoxGeometry(2, 0.25, 1.1), stoneMat);
  step.position.set(0, 0.08, d / 2 + 0.6);
  step.receiveShadow = true;
  group.add(step);
  const lanternMat = new THREE.MeshStandardMaterial({
    color: '#ffd27a', emissive: new THREE.Color('#ffd27a'), emissiveIntensity: 0.05
  });
  const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), lanternMat);
  lantern.position.set(1.15, plinth + 2.5, d / 2 + 0.3);
  group.add(lantern);
  const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.52), woodMat);
  bracket.position.set(1.15, plinth + 2.68, d / 2 + 0.1);
  group.add(bracket);

  addTraditionalMassing(group, {
    variant: dims.wing, w, d, plinth, wallH, wallMat, roofMat, stoneMat, roofColor
  });
  addTraditionalTrim(group, { company, st, w, d, floors, floorH, plinth, wallH, col, woodMat });

  /* the personality pass: dormers, weathervane, smoking chimney,
     porch, shutters, flower boxes, hanging sign and a garden */
  const extraWindows = [], smoke = [], glowMats = [];
  const detailCtx = {
    company, st, w, d, floors, floorH, plinth, wallH, totalH, roofH,
    col, rand, woodMat, stoneMat, wallMat, roofMat, roofColor,
    windowMats: extraWindows, smoke, glowMats
  };
  addRoofDetails(group, detailCtx);
  addPorchAndTrim(group, detailCtx);
  addGarden(group, detailCtx);

  const label = makeLabelSprite(company.name, company.color);
  label.position.set(0, banner.baseY + 3.6, 0);
  label.visible = false;
  group.add(label);

  const all = new Set();
  group.traverse((o) => {
    if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => all.add(m));
  });
  return {
    group, hit: box, label, height: totalH + roofH + 1.6, smoke, glowMats,
    vane: group.userData.vane,
    mats: {
      all: [...all],
      window: [wallMat, lanternMat, ...extraWindows],
      blink: []
    },
    banner,
    marquees: [],
    wind: []
  };
}

/* ---------- traditional trim per building kind --------------------------------
   balconies (georgian / chalet), market-hall porch, barn yard, garden decor */
function addTraditionalTrim(group, t) {
  const { company, st, w, d, floors, floorH, plinth, wallH, col, woodMat } = t;

  if (st.kind === 'house') {                      // carved balcony on the top floor
    for (let f = floors - 1; f < floors; f++) {
      const by = plinth + f * floorH + floorH * 0.3;
      const slab = new THREE.Mesh(new THREE.BoxGeometry(w * 0.72, 0.12, 1.2), woodMat);
      slab.position.set(0, by, d / 2 + 0.6);
      slab.castShadow = true;
      group.add(slab);
      for (const ry of [0.55, 1.02]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(w * 0.72, 0.08, 0.08), woodMat);
        rail.position.set(0, by + ry, d / 2 + 1.1);
        group.add(rail);
      }
      for (let px2 = -w * 0.36 + 0.4; px2 <= w * 0.36 + 0.01; px2 += 0.8) {
        if (Math.abs(px2) < 0.6) continue;                 // keep the doorway clear
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.95, 0.07), woodMat);
        post.position.set(px2, by + 0.5, d / 2 + 1.1);
        group.add(post);
      }
    }
    if (st.facade === 'timber') {                 // chalet flower boxes on the top balcony
      const fy = plinth + (floors - 1) * floorH + floorH * 0.3 + 0.12;
      const petalCols = ['#e2658e', '#f0a35e', '#ffffff'];
      for (const fx of [-w * 0.2, 0, w * 0.2]) {
        const flowerBox = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.3, 0.42), woodMat);
        flowerBox.position.set(fx, fy + 0.15, d / 2 + 0.85);
        group.add(flowerBox);
        for (let i2 = 0; i2 < 4; i2++) {
          const flower = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09, 0),
            new THREE.MeshStandardMaterial({ color: petalCols[i2 % 3], roughness: 0.8, flatShading: true }));
          flower.position.set(fx - 0.45 + i2 * 0.3, fy + 0.36, d / 2 + 0.85);
          group.add(flower);
        }
      }
    }
  } else if (st.kind === 'hall') {                // market hall: columns + awning + crates
    for (const cx of [-w * 0.32, -w * 0.11, w * 0.11, w * 0.32]) {
      const column = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 2.9, 8), woodMat);
      column.position.set(cx, plinth + 1.45, d / 2 + 1.35);
      column.castShadow = true;
      group.add(column);
    }
    const awning = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 0.1, 2.4),
      new THREE.MeshStandardMaterial({ color: col.clone().lerp(new THREE.Color('#ffffff'), 0.55), roughness: 0.8 }));
    awning.position.set(0, plinth + 2.95, d / 2 + 1.2);
    awning.rotation.x = 0.16;
    awning.castShadow = true;
    group.add(awning);
    for (const cx of [-w * 0.28, w * 0.24]) {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.8), woodMat);
      crate.position.set(cx, plinth + 0.3, d / 2 + 0.9);
      crate.castShadow = true;
      group.add(crate);
    }
  } else {                                        // barn: loft door + hay bales
    const loft = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 0.16),
      new THREE.MeshStandardMaterial({ color: '#5d452e', roughness: 1 }));
    loft.position.set(0, plinth + wallH - 0.9, d / 2 + 0.05);
    group.add(loft);
    for (const bx of [-1.7, 1.7]) {
      const bale = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.9, 9),
        new THREE.MeshStandardMaterial({ color: '#c9a44c', roughness: 1 }));
      bale.rotation.z = Math.PI / 2;
      bale.position.set(bx, plinth + 0.45, d / 2 + 0.95);
      bale.castShadow = true;
      group.add(bale);
    }
  }

  if (company.industry === 'dmc') {               // mini snow-capped twin peaks in the garden
    const rockMat = new THREE.MeshStandardMaterial({ color: '#8b8a93', roughness: 1, flatShading: true });
    const snowMat = new THREE.MeshStandardMaterial({ color: '#f4f8fb', roughness: 0.6, flatShading: true });
    for (const [ox, s] of [[w / 2 + 2.3, 1], [w / 2 + 3.6, 0.62]]) {
      const peak = new THREE.Mesh(new THREE.ConeGeometry(1.1 * s, 2.6 * s, 6), rockMat);
      peak.position.set(ox, 1.3 * s, 1.6);
      peak.castShadow = true;
      group.add(peak);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.48 * s, 1.0 * s, 6), snowMat);
      cap.position.set(ox, 1.3 * s + 1.05 * s, 1.6);
      group.add(cap);
    }
  }
}

/* ---------- roof decorations: each industry gets a signature look ----------
   To add a new style: add a `case 'yourindustry'` block below. */
function addRoofDecor(group, company, ctx) {
  const { w, d, height, blink } = ctx;
  const col = new THREE.Color(company.color);
  const grayMat = new THREE.MeshStandardMaterial({ color: '#94a3b8', roughness: 0.7, metalness: 0.3 });
  const brandMat = new THREE.MeshStandardMaterial({ color: col.clone().multiplyScalar(0.85), roughness: 0.6 });
  const darkMat = new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.8 });

  const place = (m, x, y, z) => { m.position.set(x, height + y, z); m.castShadow = true; group.add(m); return m; };
  const bx = (bw, bh, bd, mat, x, y, z) => place(new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), mat), x, y, z);
  const blinky = (mat, base) => {
    mat.userData.blink = { speed: 2 + Math.random() * 2, phase: Math.random() * 6.28, base };
    blink.push(mat);
  };

  switch (company.industry) {
    case 'logistics': {                       // stacked containers + chimney
      const cc = ['#ef4444', '#3b82f6', '#f59e0b'];
      for (let i = 0; i < 3; i++) {
        bx(2.2, 1.05, 1.2, new THREE.MeshStandardMaterial({ color: cc[i], roughness: 0.85 }), (i - 1) * 2.7, 0.53, -d * 0.25);
      }
      const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.42, 3, 10), grayMat);
      place(chimney, -w * 0.3, 1.5, d * 0.2);
      break;
    }
    case 'realestate': {                      // spire with blinking beacon
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.14, 5, 8), grayMat);
      place(pole, 0, 2.5, 0);
      const tipMat = new THREE.MeshStandardMaterial({ color: '#f87171', emissive: new THREE.Color('#f87171'), emissiveIntensity: 1.6 });
      place(new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), tipMat), 0, 5.15, 0);
      blinky(tipMat, 1.8);
      break;
    }
    case 'tech': {                            // glass dome + antenna
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(1.4, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: '#7dd3fc', roughness: 0.15, metalness: 0.6, transparent: true, opacity: 0.75 }));
      place(dome, w * 0.2, 0, -d * 0.15);
      const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 4.2, 6), grayMat);
      place(antenna, -w * 0.22, 2.1, d * 0.15);
      break;
    }
    case 'hotel': {                           // rooftop pool + umbrella
      const poolMat = new THREE.MeshStandardMaterial({ color: '#38bdf8', roughness: 0.2, metalness: 0.1 });
      bx(w * 0.55, 0.35, d * 0.5, poolMat, 0, 0.18, 0);
      place(new THREE.Mesh(new THREE.ConeGeometry(0.9, 0.55, 8), brandMat), w * 0.28, 1.2, d * 0.22);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 6), grayMat);
      place(pole, w * 0.28, 0.45, d * 0.22);
      break;
    }
    case 'retail': {                          // rooftop billboard
      const boardMat = new THREE.MeshStandardMaterial({ color: col, emissive: col.clone().multiplyScalar(0.55), emissiveIntensity: 0.9 });
      place(new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 1.7, 0.25), boardMat), 0, 2.4, -d * 0.2);
      bx(0.15, 1.6, 0.15, grayMat, -w * 0.28, 0.8, -d * 0.2);
      bx(0.15, 1.6, 0.15, grayMat, w * 0.28, 0.8, -d * 0.2);
      break;
    }
    case 'foods': {                           // glass greenhouse dome
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(1.6, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: '#bbf7d0', roughness: 0.2, transparent: true, opacity: 0.7 }));
      place(dome, 0, 0, 0);
      break;
    }
    case 'pharma': {                          // glowing red cross
      const crossMat = new THREE.MeshStandardMaterial({ color: '#ef4444', emissive: new THREE.Color('#ef4444'), emissiveIntensity: 0.9 });
      bx(2.6, 0.6, 0.6, crossMat, 0, 1.1, 0);
      bx(0.6, 2.0, 0.6, crossMat, 0, 1.1, 0);
      bx(1.6, 0.5, 1.6, grayMat, 0, 0.25, 0);
      break;
    }
    case 'media': {                           // twin antennas + beacon
      const a1 = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.12, 6, 6), grayMat);
      a1.rotation.z = 0.12; place(a1, -0.8, 3.0, 0);
      const a2 = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.12, 6, 6), grayMat);
      a2.rotation.z = -0.12; place(a2, 0.8, 3.0, 0);
      const tipMat = new THREE.MeshStandardMaterial({ color: '#f87171', emissive: new THREE.Color('#f87171'), emissiveIntensity: 1.6 });
      place(new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), tipMat), 0, 6.1, 0);
      blinky(tipMat, 1.8);
      break;
    }
    case 'textiles': {                        // ventilation stacks
      for (let i = 0; i < 3; i++) {
        const vent = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.8, 8), darkMat);
        place(vent, (i - 1) * w * 0.3, 0.4, d * 0.2);
      }
      break;
    }
    case 'energy': {                          // tilted solar panels
      const panelMat = new THREE.MeshStandardMaterial({ color: '#1e3a5f', roughness: 0.3, metalness: 0.5 });
      for (let i = 0; i < 4; i++) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 1.4), panelMat);
        p.rotation.x = -0.35;
        place(p, (i % 2 ? 1 : -1) * w * 0.22, 0.5, (i < 2 ? -1 : 1) * d * 0.18);
      }
      break;
    }
    case 'travel': {                          // tethered hot-air balloon (sways in the wind)
      const bg = new THREE.Group();
      const env = new THREE.Mesh(
        new THREE.SphereGeometry(1.15, 14, 12),
        new THREE.MeshStandardMaterial({ color: col.clone().lerp(new THREE.Color('#ffffff'), 0.2), roughness: 0.5 }));
      env.scale.y = 1.2; env.position.y = 3.1; env.castShadow = true;
      bg.add(env);
      const band = new THREE.Mesh(new THREE.TorusGeometry(1.13, 0.09, 8, 20),
        new THREE.MeshStandardMaterial({ color: col, roughness: 0.5 }));
      band.rotation.x = Math.PI / 2; band.position.y = 3.1;
      bg.add(band);
      const basket = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.5),
        new THREE.MeshStandardMaterial({ color: '#8a5a2b', roughness: 0.9 }));
      basket.position.y = 1.5;
      bg.add(basket);
      const tether = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 4), grayMat);
      tether.position.y = 2.25;
      bg.add(tether);
      place(bg, w * 0.28, 0, -d * 0.1);
      bg.userData.wind = { phase: Math.random() * 6.28, amp: 0.07, speed: 0.55 };
      break;
    }
    case 'tourism': {                         // rooftop palm garden
      for (const [px, pz, s] of [[-w * 0.2, d * 0.1, 1], [w * 0.22, -d * 0.05, 0.8]]) {
        const palm = new THREE.Group();
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 1.8, 6),
          new THREE.MeshStandardMaterial({ color: '#8a5a2b', roughness: 1 }));
        trunk.position.y = 0.9; trunk.castShadow = true;
        palm.add(trunk);
        const frondMat = new THREE.MeshStandardMaterial({ color: '#15803d', roughness: 0.8, flatShading: true });
        for (let i = 0; i < 6; i++) {
          const f = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.15, 4), frondMat);
          const a2 = (i / 6) * Math.PI * 2;
          f.position.set(Math.cos(a2) * 0.45, 1.85, Math.sin(a2) * 0.45);
          f.rotation.set(Math.sin(a2) * 1.25, 0, -Math.cos(a2) * 1.25);
          f.castShadow = true;
          palm.add(f);
        }
        palm.scale.setScalar(s);
        place(palm, px, 0, pz);
        palm.userData.wind = { phase: Math.random() * 6.28, amp: 0.1, speed: 0.75 };
      }
      break;
    }
    case 'dmc': {                             // twin peaks with snow caps (the Caucasus)
      const rockMat = new THREE.MeshStandardMaterial({ color: '#8895a8', roughness: 0.95, flatShading: true });
      const snowMat = new THREE.MeshStandardMaterial({ color: '#f1f5f9', roughness: 0.6 });
      const m1 = new THREE.Mesh(new THREE.ConeGeometry(2.0, 2.8, 5), rockMat);
      place(m1, -w * 0.16, 1.4, -d * 0.08);
      const s1 = new THREE.Mesh(new THREE.ConeGeometry(0.75, 1.0, 5), snowMat);
      place(s1, -w * 0.16, 3.1, -d * 0.08);
      const m2 = new THREE.Mesh(new THREE.ConeGeometry(1.3, 1.9, 5), rockMat);
      place(m2, w * 0.24, 0.95, d * 0.1);
      const s2 = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.7, 5), snowMat);
      place(s2, w * 0.24, 2.25, d * 0.1);
      break;
    }
    case 'outbound': {                        // paper-plane sculpture
      const planeMat = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.4, metalness: 0.1, flatShading: true });
      const pl = new THREE.Group();
      const body = new THREE.Mesh(new THREE.ConeGeometry(0.42, 3.2, 4), planeMat);
      body.rotation.z = -Math.PI / 2;
      body.position.x = 0.4;
      body.castShadow = true;
      pl.add(body);
      const wing = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.07, 1.5), planeMat);
      wing.position.set(-0.4, 0.15, 0);
      wing.rotation.y = 0.5;
      wing.castShadow = true;
      pl.add(wing);
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.06, 0.8), planeMat);
      tail.position.set(-1.2, 0.3, 0);
      pl.add(tail);
      pl.rotation.set(0.12, -0.6, 0.16);
      place(pl, 0, 2.2, 0);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 2.2, 6), grayMat);
      place(post, 0, 1.1, 0);
      break;
    }
    default: {                                // AC units
      bx(1.4, 0.8, 1.2, grayMat, -w * 0.22, 0.4, -d * 0.15);
      bx(1.2, 0.7, 1.0, grayMat, w * 0.2, 0.35, d * 0.18);
    }
  }
}

/* ---------- park & street props ---------- */
/* conifer for the high slopes (sways less than the broadleaf trees) */
export function makePine(rand) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.14, 1.1, 6),
    new THREE.MeshStandardMaterial({ color: '#5a4030', roughness: 1 }));
  trunk.position.y = 0.55;
  trunk.castShadow = true;
  g.add(trunk);
  const tone = 0.85 + rand() * 0.3;
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0.16 * tone, 0.38 * tone, 0.22 * tone),
    roughness: 1, flatShading: true
  });
  for (let i = 0; i < 3; i++) {
    const tier = new THREE.Mesh(new THREE.ConeGeometry(1.15 - i * 0.28, 1.15, 7), mat);
    tier.position.y = 1.15 + i * 0.72;
    tier.rotation.y = rand() * 3;
    tier.castShadow = true;
    g.add(tier);
  }
  g.userData.wind = { phase: rand() * Math.PI * 2, amp: 0.012 + rand() * 0.012, speed: 1.1 + rand() * 0.5 };
  return g;
}

export function makeTree(rand) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.2, 1, 6),
    new THREE.MeshStandardMaterial({ color: '#6b4a2f', roughness: 1 }));
  trunk.position.y = 0.5;
  trunk.castShadow = true;
  g.add(trunk);
  const green = new THREE.Color().setHSL(0.3 + rand() * 0.05, 0.5, 0.32 + rand() * 0.08);
  const foliage = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.9 + rand() * 0.5, 0),
    new THREE.MeshStandardMaterial({ color: green, roughness: 0.9, flatShading: true }));
  foliage.position.y = 1.5;
  foliage.castShadow = true;
  g.add(foliage);
  const top = foliage.clone();
  top.position.y = 2.2;
  top.scale.setScalar(0.7);
  g.add(top);
  /* wind data — city.js sways every tree with layered gusts */
  g.userData.wind = { phase: rand() * 6.28, amp: 0.035 + rand() * 0.04, speed: 0.8 + rand() * 0.9 };
  return g;
}

/* ---------- plaza flag — the wind indicator ----------
   The plane's vertices are animated every frame in city.js:
   ripples grow from the pole outward and strengthen with gusts. */
export function makeFlag() {
  const g = new THREE.Group();
  const poleMat = new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.4, metalness: 0.5 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 7.5, 8), poleMat);
  pole.position.y = 3.75;
  pole.castShadow = true;
  g.add(pole);
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), poleMat);
  finial.position.y = 7.55;
  g.add(finial);
  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(3, 1.8, 16, 6),
    new THREE.MeshStandardMaterial({
      color: '#38bdf8', roughness: 0.7, side: THREE.DoubleSide,
      emissive: new THREE.Color('#38bdf8'), emissiveIntensity: 0.18
    }));
  flag.position.set(1.55, 6.4, 0);
  flag.castShadow = true;
  g.add(flag);
  g.userData.flag = flag;
  return g;
}
