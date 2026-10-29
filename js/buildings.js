/* =============================================================
   BINOMAR GROUP — company buildings from the model library
   -------------------------------------------------------------
   First choice: the four headquarters modelled for this site in
   Blender (assets/models/hq-*.glb) — Traveldoor's stepped glass
   tower, MAQ Tourism's terraces, Hashtag Georgia's twin towers and
   Traveldoor Outbound's control tower. Their Brand* materials take
   the company colour and their lit glass glows after dark.
   Two trades have a building of their own built in code instead:
   Surfing Online's fibre tower and mast (isp) and Buying House's
   sawtooth garment mill with its gold-finned tower (sourcing).

   Fallback, if those files are missing: two downloaded models (a
   brick apartment block and a concrete brutalist office) become four
   distinct buildings. Each company
   gets its own design — its own massing and rooftop — and its own
   paint, derived from its brand colour:

     spire   stacked brick tower crowned by a glass lantern and beacon
     court   L-shaped pair of brick blocks, rooftop water tanks
     garden  warm-painted brutalist with a roof garden and pergola
     glass   cool-painted brutalist, glass penthouse, lit brand fin

   Slim archetypes (tower / house) draw from the brick designs, broad
   ones from the brutalist. `plot` picks the design, so the four
   companies of the group never share one; later companies alternate
   and still differ in colour. Rooftop pieces are placed by casting
   rays down onto the model, so they sit on its actual roofs.

   Every building also carries a quiet "you can click me" cue: a
   soft ring on the ground in the brand colour that breathes slowly
   and brightens under the cursor (animated in city.js).
   ============================================================= */
import * as THREE from 'three';
import { bake, hasModel, modelGroup } from './models.js';
import { makeRoofSign } from './banner.js';
import { getIndustryMeta } from './data.js';
import { getBuildingDims, mulberry32, seedFromString, compactGroup } from './city-build.js';

const TOWER_KINDS = new Set(['tower', 'house']);

/* ---------- colour ------------------------------------------------------ */
function palette(hex) {
  const brand = new THREE.Color(hex);
  const { h } = brand.getHSL({});
  return {
    brand, h,
    /* mid-tones: the late-afternoon sun bleaches anything paler to white */
    wall: new THREE.Color().setHSL(h, 0.42, 0.6),
    wallDeep: new THREE.Color().setHSL(h, 0.34, 0.42),
    trim: new THREE.Color().setHSL(h, 0.10, 0.90),
    joint: new THREE.Color().setHSL(h, 0.16, 0.38),
    glass: new THREE.Color().setHSL(h, 0.38, 0.24),
    metal: new THREE.Color().setHSL(h, 0.10, 0.30)
  };
}

/* the apartment's brick repainted in the brand hue. Only the saturated
   red pixels change; glass, frames, iron and roof keep their greys. */
const painted = new Map();
function paintedBrick(map, h) {
  const key = map.uuid + ':' + h.toFixed(3);
  if (painted.has(key)) return painted.get(key);
  const img = map.image;
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0);
  const px = x.getImageData(0, 0, c.width, c.height), d = px.data;
  const hue2 = (p, q, t) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
    const hi = Math.max(r, g, b), lo = Math.min(r, g, b), l = (hi + lo) / 2;
    const s = hi === lo ? 0 : (l > 0.5 ? (hi - lo) / (2 - hi - lo) : (hi - lo) / (hi + lo));
    if (s < 0.14 || hi !== r) continue;                 // not brick
    const ns = Math.min(0.62, s * 1.35), nl = Math.min(0.82, l * 1.12);
    const q = nl < 0.5 ? nl * (1 + ns) : nl + ns - nl * ns, p = 2 * nl - q;
    d[i] = hue2(p, q, h + 1 / 3) * 255;
    d[i + 1] = hue2(p, q, h) * 255;
    d[i + 2] = hue2(p, q, h - 1 / 3) * 255;
  }
  x.putImageData(px, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = map.flipY;
  tex.wrapS = map.wrapS; tex.wrapT = map.wrapT;
  tex.anisotropy = 8;
  painted.set(key, tex);
  return tex;
}

/* A lit-window map painted from the apartment's own texture. The glass is a
   mid, unsaturated grey — darker than the pale frames and sills, lighter
   than the navy roof and iron fire escape, and nothing like the brick. */
const glowMaps = new Map();
function windowGlowMap(map) {
  if (glowMaps.has(map.uuid)) return glowMaps.get(map.uuid);
  const img = map.image;
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0);
  const px = x.getImageData(0, 0, c.width, c.height), d = px.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
    const hi = Math.max(r, g, b), lo = Math.min(r, g, b);
    const glass = hi > 0.4 && hi < 0.64 && hi - lo < 0.08;
    d[i] = glass ? 255 : 0; d[i + 1] = glass ? 214 : 0; d[i + 2] = glass ? 150 : 0;
  }
  x.putImageData(px, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = map.flipY;
  glowMaps.set(map.uuid, tex);
  return tex;
}

/* each building repaints its own copy of a model's materials */
function paintMaterial(ctx, src) {
  if (ctx.paintCache.has(src.uuid)) return ctx.paintCache.get(src.uuid);
  const m = src.clone();
  const { pal } = ctx;
  if (HQ_MATERIAL.test(m.name)) {                     // the Blender headquarters, by name
    const own = HQ_STYLE[ctx.hq] && HQ_STYLE[ctx.hq][m.name];
    if (own) m.color.set(own);
    if (m.name.startsWith('Brand_Light')) {
      m.color.copy(pal.brand).multiplyScalar(0.6);
      m.emissive = pal.brand.clone();
      m.emissiveIntensity = 0.05;
      ctx.windows.push(m);                            // soft by day, lit after dark
    } else if (m.name.startsWith('Brand')) {
      m.color.copy(pal.brand);
    } else if (m.name === 'Glass_Lit') {
      m.emissive = new THREE.Color('#ffd48a');        // the offices whose lights are on
      m.emissiveIntensity = 0.05;
      ctx.windows.push(m);
    }
  } else if (m.map) {                                 // the brick apartment
    const orig = m.map;
    m.map = paintedBrick(orig, pal.h);
    m.emissiveMap = windowGlowMap(orig);
    m.emissive = new THREE.Color('#ffffff');
    m.emissiveIntensity = 0.05;
    ctx.windows.push(m);
  } else {                                            // the brutalist, by part
    const n = m.name.toLowerCase(), warm = ctx.warm;
    const shade = (c) => (warm ? c.clone().lerp(new THREE.Color('#e9c9a0'), 0.35) : c.clone());
    if (n.includes('window')) {
      m.color.copy(pal.glass);
      m.emissive = new THREE.Color('#ffcf87');
      m.emissiveIntensity = 0.05;
      m.roughness = 0.25; m.metalness = 0.3;
      ctx.windows.push(m);
    } else if (n.includes('raw')) m.color.copy(shade(pal.wall));
    else if (n.includes('recessed')) m.color.copy(shade(pal.wallDeep));
    else if (n.includes('slab')) m.color.copy(pal.trim);
    else m.color.copy(shade(pal.joint));
  }
  ctx.paintCache.set(src.uuid, m);
  return m;
}

/* one baked model, painted, with its front (+Z) facing the plaza and the
   Binomar tower — the building group's +Z points at the summit */
function addBody(ctx, key, opts, place = {}) {
  const b = bake(key, opts);
  const g = new THREE.Group();
  for (const p of b.parts) {
    const mesh = new THREE.Mesh(p.geometry, paintMaterial(ctx, p.material));
    mesh.castShadow = mesh.receiveShadow = true;
    g.add(mesh);
  }
  g.rotation.y = place.yaw || 0;
  g.scale.set(place.mirror ? -1 : 1, place.stretch || 1, 1);
  g.position.set(place.x || 0, place.y || 0, place.z || 0);
  ctx.group.add(g);
  return { g, b, h: b.h * (place.stretch || 1) };
}

/* ---------- reading the roofs ------------------------------------------- */
function roofCells(obj, n = 16) {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const meshes = [];
  obj.traverse((o) => { if (o.isMesh) meshes.push(o); });
  const rc = new THREE.Raycaster(), o = new THREE.Vector3(), down = new THREE.Vector3(0, -1, 0);
  const cells = [], cw = (box.max.x - box.min.x) / n, cd = (box.max.z - box.min.z) / n;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const x = box.min.x + (i + 0.5) * cw, z = box.min.z + (j + 0.5) * cd;
      rc.set(o.set(x, box.max.y + 10, z), down);
      const hit = rc.intersectObjects(meshes, false)[0];
      if (hit) cells.push({ x, z, y: hit.point.y });
    }
  }
  return { cells, cw, cd, box };
}

/* the rectangle covered by the cells that pass `test`, at their common height */
function region(roof, test) {
  const sel = roof.cells.filter(test);
  if (!sel.length) return null;
  const ys = sel.map((c) => c.y).sort((a, b) => a - b);
  const r = {
    x0: Math.min(...sel.map((c) => c.x)) - roof.cw / 2, x1: Math.max(...sel.map((c) => c.x)) + roof.cw / 2,
    z0: Math.min(...sel.map((c) => c.z)) - roof.cd / 2, z1: Math.max(...sel.map((c) => c.z)) + roof.cd / 2,
    y: ys[Math.floor(ys.length / 2)]
  };
  r.w = r.x1 - r.x0; r.d = r.z1 - r.z0; r.cx = (r.x0 + r.x1) / 2; r.cz = (r.z0 + r.z1) / 2;
  return r;
}

/* ---------- rooftop pieces ---------------------------------------------- */
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...o });

function box(ctx, w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y + h / 2, z);
  m.castShadow = m.receiveShadow = true;
  ctx.detail.add(m);
  return m;
}

function litGlass(ctx) {
  const m = std(ctx.pal.glass.clone().lerp(new THREE.Color('#bfe3ff'), 0.35), {
    roughness: 0.15, metalness: 0.45, emissive: new THREE.Color('#ffe2b0'), emissiveIntensity: 0.05
  });
  ctx.windows.push(m);
  return m;
}

function brandLight(ctx) {
  const m = std(ctx.pal.brand.clone().multiplyScalar(0.6), {
    emissive: ctx.pal.brand.clone(), emissiveIntensity: 0.05
  });
  ctx.windows.push(m);                       // soft by day, lit after dark
  return m;
}

/* a glass lantern on the roof, capped with a lit brand band */
function lantern(ctx, x, z, y, w, d, h) {
  box(ctx, w, h, d, litGlass(ctx), x, y, z);
  const trim = std(ctx.pal.trim, { metalness: 0.3 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(ctx, 0.16, h, 0.16, trim, x + sx * w / 2, y, z + sz * d / 2);
  box(ctx, w + 0.4, 0.36, d + 0.4, brandLight(ctx), x, y + h, z);
  box(ctx, w + 0.6, 0.16, d + 0.6, trim, x, y + h + 0.36, z);
  return y + h + 0.52;
}

function spire(ctx, x, z, y, h) {
  const steel = std('#aeb8c6', { metalness: 0.8, roughness: 0.3 });
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.16, h, 8), steel);
  mast.position.set(x, y + h / 2, z);
  ctx.detail.add(mast);
  const beaconMat = std('#f87171', { emissive: new THREE.Color('#ff4d4d'), emissiveIntensity: 1.4 });
  beaconMat.userData.blink = { speed: 2.2, phase: ctx.rand() * 6.28, base: 2.0 };
  ctx.blink.push(beaconMat);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), beaconMat);
  beacon.position.set(x, y + h + 0.1, z);
  ctx.group.add(beacon);                     // blinks on its own — kept out of the merge
}

/* the timber water tank every brick walk-up carries */
function waterTank(ctx, x, z, y, r) {
  const wood = std('#8a6143', { roughness: 0.9 });
  const iron = std('#3a3f48', { metalness: 0.5 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(ctx, 0.09, 1.0, 0.09, iron, x + sx * r * 0.7, y, z + sz * r * 0.7);
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1.5, 14), wood);
  tank.position.set(x, y + 1.75, z);
  tank.castShadow = true;
  ctx.detail.add(tank);
  const lid = new THREE.Mesh(new THREE.ConeGeometry(r * 1.06, 0.6, 14), iron);
  lid.position.set(x, y + 2.8, z);
  ctx.detail.add(lid);
}

/* planters, two small trees and a brand-coloured pergola */
function roofGarden(ctx, r) {
  const soil = std('#5a4632', { roughness: 1 });
  const planter = std(ctx.pal.trim.clone().multiplyScalar(0.8));
  const deck = std('#a07a55', { roughness: 0.9 });
  box(ctx, r.w * 0.86, 0.08, r.d * 0.86, deck, r.cx, r.y, r.cz);
  for (const sz of [-1, 1]) {
    box(ctx, r.w * 0.8, 0.5, 0.6, planter, r.cx, r.y, r.cz + sz * r.d * 0.36);
    box(ctx, r.w * 0.76, 0.06, 0.5, soil, r.cx, r.y + 0.46, r.cz + sz * r.d * 0.36);
  }
  for (let i = 0; i < 2; i++) {
    const t = modelGroup(i ? 'tree-a' : 'tree-b', { height: 1 });
    if (!t) continue;
    t.scale.setScalar(2.0 + ctx.rand() * 0.6);
    t.position.set(r.cx + (i ? 1 : -1) * r.w * 0.3, r.y + 0.5, r.cz - r.d * 0.36);
    ctx.group.add(t);
  }
  for (let i = 0; i < 3; i++) {
    const bush = modelGroup('grass-wispy', { height: 1 });
    if (!bush) continue;
    bush.scale.setScalar(0.7);
    bush.position.set(r.cx + (i - 1) * r.w * 0.26, r.y + 0.5, r.cz + r.d * 0.36);
    ctx.group.add(bush);
  }
  const beam = std(ctx.pal.brand.clone().multiplyScalar(0.85), { roughness: 0.5 });
  const pw = r.w * 0.44, pd = r.d * 0.4, px = r.cx + r.w * 0.12, pz = r.cz;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(ctx, 0.14, 2.1, 0.14, beam, px + sx * pw / 2, r.y, pz + sz * pd / 2);
  for (let i = 0; i <= 5; i++) box(ctx, pw + 0.3, 0.1, 0.12, beam, px, r.y + 2.1, pz - pd / 2 + (i / 5) * pd);
}

/* a glass pavilion with an overhanging roof slab */
function penthouse(ctx, r) {
  const w = r.w * 0.62, d = r.d * 0.6;
  box(ctx, w, 2.3, d, litGlass(ctx), r.cx, r.y, r.cz);
  box(ctx, w + 1.2, 0.2, d + 1.0, std(ctx.pal.trim), r.cx, r.y + 2.3, r.cz);
  box(ctx, w + 1.3, 0.08, d + 1.1, brandLight(ctx), r.cx, r.y + 2.22, r.cz);
}

/* an upright cylinder standing on y */
function drum(ctx, rTop, rBot, h, mat, x, y, z, seg = 24) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), mat);
  m.position.set(x, y + h / 2, z);
  m.castShadow = m.receiveShadow = true;
  ctx.detail.add(m);
  return m;
}

/* a thin rod from a to b — the members of a lattice mast */
function strut(ctx, a, b, r, mat) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, dir.length(), 5), mat);
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  m.castShadow = true;
  ctx.detail.add(m);
}

/* a microwave dish on a short arm, looking out along `yaw` */
function dish(ctx, x, z, y, yaw, r, mat) {
  const d = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.25, r * 0.45, 18, 1, true), mat);   // mat is double-sided
  d.rotation.set(Math.PI / 2, 0, 0);
  const g = new THREE.Group();
  g.add(d);
  g.rotation.y = yaw;
  g.position.set(x, y, z);
  g.updateMatrixWorld(true);
  d.applyMatrix4(g.matrix);
  d.castShadow = true;
  ctx.detail.add(d);
}

/* a garment-mill sawtooth bay: a sloped roof rising to a glazed north light,
   running the full depth of the hall */
function sawtooth(ctx, x0, bw, h, depth, y, roofMat) {
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.lineTo(bw, 0); s.lineTo(bw, h); s.lineTo(0, 0);
  const geo = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false });
  const m = new THREE.Mesh(geo, roofMat);
  m.position.set(x0, y, -depth / 2);
  m.castShadow = m.receiveShadow = true;
  ctx.detail.add(m);
  box(ctx, 0.06, h * 0.8, depth - 0.5, litGlass(ctx), x0 + bw + 0.03, y + h * 0.05, 0);
}

/* ---------- the four designs --------------------------------------------
   Each returns { roof: {x, z, y} } — where the name sign stands. */
const DESIGNS = {
  /* a brick tower with a second tier stacked on it and a glass lantern */
  spire(ctx) {
    const { dims } = ctx;
    const fit = { w: dims.w, d: dims.d };
    const lower = addBody(ctx, 'apartment', { fit });
    const upper = addBody(ctx, 'apartment', { fit, crop: 0.42 }, { y: lower.h * 0.97 });
    const top = lower.h * 0.97 + upper.h;
    const w = lower.b.w, d = lower.b.d;
    const lt = lantern(ctx, 0, -d * 0.08, top, w * 0.58, d * 0.62, 2.3);
    spire(ctx, w * 0.24, -d * 0.2, lt, 0.9);          // a stub beacon: a tall mast would cut through the sign
    return { roof: { x: -w * 0.08, z: d * 0.05, y: lt } };
  },

  /* an L-shaped court: the main block facing the valley and a lower wing
     reaching toward the plaza, with water tanks on both roofs */
  court(ctx) {
    const { dims } = ctx;
    const main = addBody(ctx, 'apartment', { fit: { w: dims.w * 1.05, d: dims.d } });
    const w = main.b.w, d = main.b.d;
    const wingS = 0.8;
    const wing = addBody(ctx, 'apartment', { fit: { w: dims.w * 1.05 * wingS, d: dims.d * wingS } },
      { yaw: Math.PI / 2, stretch: 0.74, x: w / 2 - d * wingS / 2, z: d / 2 + w * wingS / 2 - 0.2 });
    waterTank(ctx, -w * 0.22, -d * 0.1, main.h, 0.7);
    waterTank(ctx, w / 2 - d * wingS / 2, d / 2 + w * wingS * 0.62, wing.h, 0.55);
    /* a glass link in the inside corner of the L */
    box(ctx, w * 0.3, wing.h * 0.55, w * 0.3, litGlass(ctx), w / 2 - d * wingS - w * 0.15, 0, d / 2 + w * 0.15);
    return { roof: { x: w * 0.1, z: -d * 0.05, y: main.h } };
  },

  /* warm paint, roof garden on the low block, the sign on the tall one */
  garden(ctx) {
    ctx.warm = true;
    const body = addBody(ctx, 'brutalist', { fit: { w: ctx.dims.w * 1.1, d: ctx.dims.d * 1.1 } });
    const roof = roofCells(ctx.group);
    const maxY = Math.max(...roof.cells.map((c) => c.y));
    const low = region(roof, (c) => c.y > maxY * 0.35 && c.y < maxY * 0.8);
    if (low) roofGarden(ctx, low);
    const high = region(roof, (c) => c.y > maxY - 0.4);
    return { roof: high ? { x: high.cx, z: high.cz, y: high.y } : { x: 0, z: 0, y: body.h } };
  },

  /* cool paint, glass penthouse, a lit brand fin up the tower, a beacon */
  glass(ctx) {
    const body = addBody(ctx, 'brutalist', { fit: { w: ctx.dims.w * 1.1, d: ctx.dims.d * 1.1 } }, { mirror: true });
    const roof = roofCells(ctx.group);
    const maxY = Math.max(...roof.cells.map((c) => c.y));
    const low = region(roof, (c) => c.y > maxY * 0.35 && c.y < maxY * 0.8);
    if (low) penthouse(ctx, low);
    const high = region(roof, (c) => c.y > maxY - 0.4);
    if (high) {
      /* the fin runs down the tower's outer corner */
      const fx = high.cx + Math.sign(high.cx || 1) * high.w / 2, fz = high.z1;
      box(ctx, 0.28, maxY * 0.9, 0.28, brandLight(ctx), fx, maxY * 0.06, fz);
      spire(ctx, high.cx - high.w * 0.3, high.z0 + high.d * 0.2, high.y, 0.9);
    }
    return { roof: high ? { x: high.cx, z: high.cz + high.d * 0.1, y: high.y } : { x: 0, z: 0, y: body.h } };
  },

  /* the internet provider: a faceted navy-glass fibre tower banded with lit
     cyan rings on a white podium, dishes round its crown, a red-and-white
     lattice mast on the podium beside it and the wifi waves on its front */
  fiber(ctx) {
    const S = ctx.side;
    const navy = std('#182538', { roughness: 0.4, metalness: 0.5 });
    const white = std('#eef3f6', { roughness: 0.55 });
    const red = std('#d6453d', { roughness: 0.5 });
    const dishMat = std('#f4f6f8', { roughness: 0.4, side: THREE.DoubleSide });
    const glass = std('#1f3b57', {
      roughness: 0.12, metalness: 0.6, emissive: new THREE.Color('#9fe6ff'), emissiveIntensity: 0.05
    });
    ctx.windows.push(glass);
    const ring = brandLight(ctx);

    /* the podium: a glass ground floor under a white slab with a lit band */
    const PW = S, PD = S * 0.8, PH = 3.0;
    box(ctx, PW - 0.5, PH - 0.8, PD - 0.5, glass, 0, 0, 0);
    box(ctx, PW, 0.8, PD, white, 0, PH - 0.8, 0);
    box(ctx, PW + 0.04, 0.16, PD + 0.04, ring, 0, PH - 0.5, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(ctx, 0.3, PH - 0.8, 0.3, white, sx * (PW / 2 - 0.4), 0, sz * (PD / 2 - 0.4));

    /* the tower, one glass drum per floor, a cyan ring every third */
    const R = S * 0.29, tx = -S * 0.13, tz = -S * 0.04;
    const n = Math.max(6, ctx.company.floors), fh = 1.45;
    for (let i = 0; i < n; i++) {
      const y = PH + i * fh;
      drum(ctx, R, R, fh - 0.14, glass, tx, y, tz, 12);
      drum(ctx, R + 0.14, R + 0.14, 0.14, i % 3 === 2 ? ring : navy, tx, y + fh - 0.14, tz, 12);
    }
    const top = PH + n * fh;
    drum(ctx, R + 0.2, R + 0.2, 0.3, white, tx, top, tz, 12);
    drum(ctx, R * 0.72, R * 0.72, 1.1, navy, tx, top + 0.3, tz, 12);
    const roofY = top + 1.4;
    drum(ctx, R * 0.78, R * 0.78, 0.18, ring, tx, roofY - 0.18, tz, 12);
    /* three dishes on the crown's rim, looking out over the valley */
    for (const a of [-2.4, -1.4, 2.6]) {
      dish(ctx, tx + Math.sin(a) * (R - 0.1), tz + Math.cos(a) * (R - 0.1), top + 0.95, a, 0.55, dishMat);
    }

    /* the mast, tapering from the podium roof, red at the top */
    const mx = S * 0.32, mz = S * 0.18, mh = top + 1.6 - PH;
    const leg = (sx, sz, t) => new THREE.Vector3(mx + sx * (0.7 - 0.5 * t), PH + t * mh, mz + sz * (0.7 - 0.5 * t));
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (const [sx, sz] of corners) {
      strut(ctx, leg(sx, sz, 0), leg(sx, sz, 0.8), 0.07, white);
      strut(ctx, leg(sx, sz, 0.8), leg(sx, sz, 1), 0.07, red);
    }
    const bays = 7;
    for (let k = 0; k < bays; k++) {
      const t0 = k / bays, t1 = (k + 1) / bays, mat = t1 > 0.8 ? red : white;
      for (let c = 0; c < 4; c++) {
        const [ax, az] = corners[c], [bx, bz] = corners[(c + 1) % 4];
        strut(ctx, leg(ax, az, t0), leg(bx, bz, t1), 0.04, mat);
        strut(ctx, leg(ax, az, t1), leg(bx, bz, t1), 0.04, mat);
      }
    }
    /* sector antennas and a link dish near the top */
    for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1]]) {
      box(ctx, sz ? 0.5 : 0.12, 1.3, sz ? 0.12 : 0.5, white, mx + sx * 0.42, PH + mh * 0.82, mz + sz * 0.42);
    }
    dish(ctx, mx, mz + 0.45, PH + mh * 0.62, 0, 0.45, dishMat);
    spire(ctx, mx, mz, PH + mh, 0.5);

    /* the wifi waves, lit on the podium's front */
    const wx = S * 0.18, wz = PD / 2 + 0.08;
    for (const r of [0.55, 1.0, 1.45]) {
      const arc = new THREE.Mesh(new THREE.TorusGeometry(r, 0.11, 6, 20, Math.PI / 2), ring);
      arc.rotation.z = Math.PI / 4;
      arc.position.set(wx, 0.35, wz);
      ctx.detail.add(arc);
    }
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), ring);
    dot.position.set(wx, 0.35, wz);
    ctx.detail.add(dot);

    return { roof: { x: tx, z: tz, y: roofY } };
  },

  /* the apparel buying house: an ivory garment-mill hall under a sawtooth
     roof, bolts of cloth hung down its front, and a navy office tower with
     gold fins — the threads — at one end */
  atelier(ctx) {
    const W = ctx.side, D = ctx.side * 0.74;
    const ivory = std('#ece3d0', { roughness: 0.8 });
    const navy = std('#0c1a33', { roughness: 0.45, metalness: 0.4 });
    const roofMat = std('#28364f', { roughness: 0.6, metalness: 0.3, side: THREE.DoubleSide });
    const gold = std('#d4a62a', { roughness: 0.3, metalness: 0.75 });
    const glass = std('#0d2452', {
      roughness: 0.45, metalness: 0, envMapIntensity: 0.4, emissive: new THREE.Color('#9fbcf0'), emissiveIntensity: 0.05
    });
    ctx.windows.push(glass);

    /* the hall */
    const hx0 = -W / 2, hx1 = W * 0.17, hw = hx1 - hx0, hcx = (hx0 + hx1) / 2, HH = 3.4;
    box(ctx, hw, 0.45, D, navy, hcx, 0, 0);
    box(ctx, hw - 0.1, HH - 0.45, D - 0.1, ivory, hcx, 0.45, 0);
    box(ctx, hw - 1.2, 1.1, 0.06, glass, hcx, 1.5, -D / 2 + 0.01);       // the back: a long window band
    box(ctx, 0.06, 1.1, D - 1.2, glass, hx0 - 0.01, 1.5, 0);
    box(ctx, hw + 0.2, 0.22, D + 0.2, gold, hcx, HH, 0);                  // gold cornice
    const bays = 4, bw = hw / bays;
    for (let i = 0; i < bays; i++) sawtooth(ctx, hx0 + i * bw, bw, 1.7, D, HH + 0.22, roofMat);

    /* cloth hung down the front — denim, cream, madder, gold, olive */
    const cloth = ['#2f4b7c', '#f3e9d2', '#b5523b', '#d4a62a', '#6b7a3a'].map((c) => std(c, { roughness: 0.95 }));
    const bn = 5, gap = (hw - 1.6) / bn;
    box(ctx, hw - 1.0, 0.1, 0.1, gold, hcx, HH - 0.55, D / 2 + 0.12);   // the hanging rail
    for (let i = 0; i < bn; i++) {
      box(ctx, gap * 0.62, 2.2 + (i % 2) * 0.35, 0.05, cloth[i], hx0 + 0.8 + (i + 0.5) * gap, HH - 0.6 - 2.2 - (i % 2) * 0.35, D / 2 + 0.1);
    }

    /* the tower, its fins on the front and the open side */
    const tw = W / 2 - hx1 + 0.4, td = D * 0.82, tcx = (hx1 - 0.4 + W / 2) / 2, tz = -D * 0.06;
    const n = Math.max(5, ctx.company.floors), TH = 1.0 + n * 1.7;
    box(ctx, tw, TH, td, glass, tcx, 0, tz);
    for (let i = 0; i <= n; i++) box(ctx, tw + 0.12, 0.14, td + 0.12, navy, tcx, 0.9 + i * 1.7 - 0.07, tz);
    const fins = Math.max(3, Math.round(tw / 1.1));
    for (let i = 0; i <= fins; i++) {
      box(ctx, 0.12, TH - 0.4, 0.26, gold, tcx - tw / 2 + (i / fins) * tw, 0.4, tz + td / 2 + 0.13);
    }
    const sideFins = Math.max(3, Math.round(td / 1.1));
    for (let i = 0; i <= sideFins; i++) {
      box(ctx, 0.26, TH - 0.4, 0.12, gold, tcx + tw / 2 + 0.13, 0.4, tz - td / 2 + (i / sideFins) * td);
    }
    box(ctx, tw + 0.9, 0.5, td + 0.9, navy, tcx, TH, tz);
    box(ctx, tw + 0.94, 0.14, td + 0.94, brandLight(ctx), tcx, TH + 0.2, tz);

    /* a gold canopy over the hall's front door */
    box(ctx, 2.6, 0.16, 1.4, gold, hcx + hw * 0.32, 2.4, D / 2 + 0.7);
    for (const sx of [-1, 1]) box(ctx, 0.1, 2.4, 0.1, navy, hcx + hw * 0.32 + sx * 1.2, 0, D / 2 + 1.3);

    return { roof: { x: tcx, z: tz, y: TH + 0.5 } };
  },

  /* a headquarters modelled for the site in Blender, fitted to the plot's
     terrain pad; the name sign stands on its highest roof */
  hq(ctx) {
    const padR = Math.max(ctx.dims.w, ctx.dims.d) * 0.62 + 3.2;
    const side = (padR - 0.6) * 1.35;
    const body = addBody(ctx, ctx.hq, { fit: { w: side, d: side }, metal: true });
    const roof = roofCells(ctx.group);
    const maxY = Math.max(...roof.cells.map((c) => c.y));
    const high = region(roof, (c) => c.y > maxY - 0.4);
    return { roof: high ? { x: high.cx, z: high.cz, y: high.y } : { x: 0, z: 0, y: body.h } };
  }
};

const FAMILY = {
  apartment: ['spire', 'court'],
  brutalist: ['garden', 'glass']
};

/* The four headquarters modelled in Blender. The group's own companies get
   the design made for them; any other company takes one by plot, and its
   brand colour still repaints the Brand* materials. */
const HQ_MATERIAL = /^(Brand|Glass_Lit|Glass_Dark|Stone|Gold|Frame|Planting)/;
const HQ_BY_ID = {
  traveldoor: 'hq-traveldoor', 'maq-tourism': 'hq-maq',
  'hashtag-georgia': 'hq-georgia', 'traveldoor-outbound': 'hq-outbound'
};
const HQ_KEYS = ['hq-traveldoor', 'hq-maq', 'hq-georgia', 'hq-outbound'];
/* trades with a building of their own, built here rather than modelled:
   the internet provider's fibre tower and the buying house's mill */
const DESIGN_BY_INDUSTRY = { isp: 'fiber', sourcing: 'atelier' };
/* each headquarters' own body colours, so no two read alike at a distance:
   Traveldoor keeps the deep-blue glass of the file; Outbound's control
   tower becomes bronze glass in white aluminium, so the two travel brands
   are told apart by more than a stripe */
const HQ_STYLE = {
  'hq-outbound': {
    Glass_Dark: '#5b3f2a', Glass_Lit: '#8a6444', Frame: '#e9e4da', Stone: '#f1ede6', Stone_Dark: '#9a948a'
  }
};

/* ---------- the ground ring: "this is clickable", quietly ---------------- */
let ringTex = null;
function ringTexture() {
  if (ringTex) return ringTex;
  const S = 256, c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.72, 'rgba(255,255,255,0)');
  g.addColorStop(0.86, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.9, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, S, S);
  ringTex = new THREE.CanvasTexture(c);
  return ringTex;
}

function makeHalo(radius, color) {
  const mat = new THREE.MeshBasicMaterial({
    map: ringTexture(), color, transparent: true, opacity: 0.3, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 2;
  return mesh;
}

/* ---------- assemble ------------------------------------------------------
   Same contract as the procedural builders, plus `halo`. Returns null when
   the model this archetype needs did not load. */
export function makeModelBuilding(company, kind) {
  const hash = seedFromString(company.id);
  const plot = Number(company.plot);
  const pick = Number.isFinite(plot) && plot > 0 ? plot - 1 : hash;

  /* a design built for the company's trade first, then a Blender
     headquarters, then the repainted downloaded models */
  const hq = HQ_BY_ID[company.id] || HQ_KEYS[pick % HQ_KEYS.length];
  let design;
  if (DESIGN_BY_INDUSTRY[company.industry]) {
    design = DESIGN_BY_INDUSTRY[company.industry];
  } else if (hasModel(hq)) {
    design = 'hq';
  } else {
    const family = TOWER_KINDS.has(kind) ? 'apartment' : 'brutalist';
    if (!hasModel(family)) return null;
    design = FAMILY[family][pick % FAMILY[family].length];
  }

  const ctx = {
    company, dims: getBuildingDims(company), pal: palette(company.color),
    rand: mulberry32(hash ^ 0x9e3779b9), group: new THREE.Group(), detail: new THREE.Group(),
    windows: [], blink: [], paintCache: new Map(), warm: false, hq
  };
  /* the square the headquarters are fitted to, inside the terrain pad */
  ctx.side = (Math.max(ctx.dims.w, ctx.dims.d) * 0.62 + 3.2 - 0.6) * 1.35;
  const { roof } = DESIGNS[design](ctx);
  compactGroup(ctx.detail);
  ctx.group.add(ctx.detail);

  /* centre the finished design on its plot — the court's wing would
     otherwise hang off the edge of its terrain pad */
  const bb = new THREE.Box3().setFromObject(ctx.group);
  const mid = bb.getCenter(new THREE.Vector3());
  for (const child of ctx.group.children) { child.position.x -= mid.x; child.position.z -= mid.z; }
  roof.x -= mid.x; roof.z -= mid.z;
  bb.translate(new THREE.Vector3(-mid.x, 0, -mid.z));
  mid.x = mid.z = 0;
  const size = bb.getSize(new THREE.Vector3());

  /* one invisible box over the whole thing is the hover / click target */
  const hit = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z),
    new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.copy(mid);
  hit.userData.companyId = company.id;
  ctx.group.add(hit);

  const sign = makeRoofSign(company, {
    topY: roof.y,
    width: Math.max(7, Math.min(10, Math.max(size.x, size.z) * 1.05)),
    kicker: getIndustryMeta(company.industry).label
  });
  sign.group.position.set(roof.x, 0, roof.z);
  ctx.group.add(sign.group);
  ctx.windows.push(sign.edgeMat);

  /* the ring stays on the ground when the building lifts under the cursor,
     so city.js seats it on its own; it has to stay inside the terrain pad */
  const padR = Math.max(ctx.dims.w, ctx.dims.d) * 0.62 + 3.2;
  const halo = makeHalo(Math.min(padR - 0.4, Math.hypot(size.x, size.z) / 2 + 1.2), ctx.pal.brand);

  const all = new Set();
  ctx.group.traverse((o) => { if (o.isMesh) all.add(o.material); });
  return {
    group: ctx.group, hit, height: roof.y, smoke: [], halo,
    mats: { all: [...all], window: ctx.windows, lamp: [], blink: ctx.blink },
    banner: sign, marquees: [], wind: [], design
  };
}
