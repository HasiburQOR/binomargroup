/* =============================================================
   BINOMAR GROUP — the mountain road
   -------------------------------------------------------------
   Everything that makes the switchback read as a real road:
   lamp posts that pool light on the tarmac, crash barriers with
   reflectors, centre-line markings, signage, and traffic that
   actually drives up and down it after dark.

   All builders take the shared terrain height function H so
   nothing floats or sinks.
   ============================================================= */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { compactGroup, mulberry32, roadAt } from './city-build.js';

/* ---------- shared textures -------------------------------------------- */
let _glowTex = null;
function glowTexture() {
  if (_glowTex) return _glowTex;
  const px = 128;
  const c = document.createElement('canvas'); c.width = c.height = px;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(px / 2, px / 2, 0, px / 2, px / 2, px / 2);
  grad.addColorStop(0, 'rgba(255,240,205,1)');
  grad.addColorStop(0.18, 'rgba(255,220,150,0.55)');
  grad.addColorStop(0.5, 'rgba(255,196,110,0.16)');
  grad.addColorStop(1, 'rgba(255,190,100,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, px, px);
  _glowTex = new THREE.CanvasTexture(c);
  _glowTex.colorSpace = THREE.SRGBColorSpace;
  return _glowTex;
}

let _poolTex = null;
function poolTexture() {
  if (_poolTex) return _poolTex;
  const px = 256;
  const c = document.createElement('canvas'); c.width = c.height = px;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(px / 2, px / 2, 0, px / 2, px / 2, px / 2);
  grad.addColorStop(0, 'rgba(255,226,166,0.85)');
  grad.addColorStop(0.32, 'rgba(255,206,132,0.34)');
  grad.addColorStop(0.68, 'rgba(240,180,110,0.09)');
  grad.addColorStop(1, 'rgba(240,180,110,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, px, px);
  _poolTex = new THREE.CanvasTexture(c);
  _poolTex.colorSpace = THREE.SRGBColorSpace;
  return _poolTex;
}


/* headlight cone falloff: bright at the lamp, gone by the far end */
let _beamTex = null;
function beamTexture() {
  if (_beamTex) return _beamTex;
  const c = document.createElement('canvas');
  c.width = 8; c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0.00, 'rgba(255,255,255,0.85)');   // apex, at the lamp
  grad.addColorStop(0.28, 'rgba(255,255,255,0.34)');
  grad.addColorStop(0.70, 'rgba(255,255,255,0.09)');
  grad.addColorStop(1.00, 'rgba(255,255,255,0)');      // the far end
  g.fillStyle = grad;
  g.fillRect(0, 0, 8, 128);
  _beamTex = new THREE.CanvasTexture(c);
  _beamTex.colorSpace = THREE.SRGBColorSpace;
  return _beamTex;
}

/* a flat pool of lamplight that hugs the slope instead of hovering over it */
function makeLightPool(radius, H, cx, cz) {
  const geo = new THREE.CircleGeometry(radius, 24);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, H(cx + pos.getX(i), cz + pos.getZ(i)) - H(cx, cz) + 0.16);
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshBasicMaterial({
    map: poolTexture(), transparent: true, opacity: 0,
    depthWrite: false, blending: THREE.AdditiveBlending, fog: false
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 2;
  return mesh;
}

/* ---------- the street lamp --------------------------------------------
   Cast-iron post, gooseneck arm and a lantern head. At night the
   glass glows, a bloom sprite flares and a pool of light lands on
   the road below. */
const LAMP_METAL = new THREE.MeshStandardMaterial({ color: '#2b3444', roughness: 0.55, metalness: 0.55 });

export function makeStreetLamp(H, x, z, rand) {
  const g = new THREE.Group();
  const bulbMats = [];

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.44, 0.5, 8), LAMP_METAL);
  base.position.y = 0.25;
  base.castShadow = true;
  g.add(base);

  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.13, 4.6, 8), LAMP_METAL);
  pole.position.y = 2.6;
  pole.castShadow = true;
  g.add(pole);

  /* gooseneck: a quarter torus leaning the lantern out over the road */
  const arm = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.07, 6, 12, Math.PI / 2), LAMP_METAL);
  arm.position.set(0, 4.85, 0);
  arm.rotation.set(Math.PI / 2, 0, Math.PI);
  arm.rotation.y = Math.PI / 2;
  g.add(arm);

  const headX = 0.85;
  const glassMat = new THREE.MeshStandardMaterial({
    color: '#ffe9bd', emissive: new THREE.Color('#ffce7a'), emissiveIntensity: 0,
    roughness: 0.35, transparent: true, opacity: 0.94
  });
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.46, 0.4, 8), LAMP_METAL);
  shade.position.set(headX, 5.06, 0);
  g.add(shade);
  const glass = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.62, 8), glassMat);
  glass.position.set(headX, 4.6, 0);
  glass.rotation.x = Math.PI;
  g.add(glass);
  bulbMats.push(glassMat);

  const flare = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(), transparent: true, opacity: 0, fog: false,
    blending: THREE.AdditiveBlending, depthWrite: false
  }));
  flare.scale.setScalar(4.6);
  flare.position.set(headX, 4.55, 0);
  g.add(flare);

  const pool = makeLightPool(4.6 + (rand ? rand() : 0.5) * 1.2, H, x, z);
  pool.position.set(headX * 0.7, 0, 0);
  g.add(pool);

  /* the flare sprite, the light pool and the glass all animate, so only
     the ironmongery gets baked together */
  flare.userData.keep = pool.userData.keep = glass.userData.keep = true;
  g.userData.bulbMat = glassMat;         // kept for the existing lamp wiring
  g.userData.night = [flare.material, pool.material];
  g.userData.nightK = [0.85, 0.7];
  return compactGroup(g);
}

/* ---------- crash barrier on the outside of every bend ------------------
   Posts + rail + orange reflectors that catch the light at night. */
export function makeGuardRail(points, H, mat, reflectorMats) {
  const group = new THREE.Group();
  const postMat = new THREE.MeshStandardMaterial({ color: '#8b95a5', roughness: 0.5, metalness: 0.6 });
  const reflMat = new THREE.MeshStandardMaterial({
    color: '#ff9d3c', emissive: new THREE.Color('#ff8a1e'), emissiveIntensity: 0
  });
  reflectorMats.push(reflMat);

  /* hundreds of posts would be hundreds of draw calls, so each material
     gets one merged geometry for the whole barrier */
  const rails = [], posts = [], refls = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const place = (bank, geo, x, y, z, ang, scaleX) => {
    const g2 = geo.clone();
    e.set(0, -ang, 0);
    q.setFromEuler(e);
    v.set(x, y, z);
    m.compose(v, q, scaleX ? new THREE.Vector3(scaleX, 1, 1) : one);
    g2.applyMatrix4(m);
    bank.push(g2);
  };

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const ang = Math.atan2(b.z - a.z, b.x - a.x);
    place(rails, new THREE.BoxGeometry(1, 0.22, 0.08), mx, H(mx, mz) + 0.78, mz, ang, len * 1.04);
    place(posts, new THREE.BoxGeometry(0.12, 0.95, 0.12), a.x, H(a.x, a.z) + 0.42, a.z, ang);
    if (i % 2 === 0) {
      place(refls, new THREE.BoxGeometry(0.07, 0.16, 0.05), a.x, H(a.x, a.z) + 0.86, a.z, ang);
    }
  }

  for (const [bank, material] of [[rails, mat], [posts, postMat], [refls, reflMat]]) {
    if (!bank.length) continue;
    const mesh = new THREE.Mesh(mergeGeometries(bank), material);
    mesh.castShadow = bank === rails;          // only the rail is worth a shadow
    group.add(mesh);
    for (const g2 of bank) g2.dispose();
  }
  return group;
}

/* ---------- centre line: short dashes that conform to the slope --------- */
export function makeRoadMarkings(points, H) {
  const pos = [], idx = [];
  let v = 0;
  const DASH = 3, GAP = 4;
  for (let i = 0; i < points.length - 1; i += DASH + GAP) {
    for (let j = i; j < Math.min(i + DASH, points.length - 1); j++) {
      const a = points[j], b = points[j + 1];
      let tx = b.x - a.x, tz = b.z - a.z;
      const len = Math.hypot(tx, tz) || 1;
      tx /= len; tz /= len;
      const nx = -tz * 0.11, nz = tx * 0.11;
      const quad = [
        [a.x + nx, a.z + nz], [a.x - nx, a.z - nz],
        [b.x + nx, b.z + nz], [b.x - nx, b.z - nz]
      ];
      for (const [qx, qz] of quad) pos.push(qx, H(qx, qz) + 0.14, qz);
      idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
      v += 4;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({
    color: '#e8e2cf', roughness: 0.8, side: THREE.DoubleSide,
    emissive: new THREE.Color('#fff4d2'), emissiveIntensity: 0
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 1;
  return { mesh, mat };
}

/* ---------- roadside signage -------------------------------------------- */
function signTexture(line1, line2, accent) {
  const W = 512, H = 200;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#12603f';
  g.fillRect(0, 0, W, H);
  g.strokeStyle = '#f2f6f4';
  g.lineWidth = 8;
  g.strokeRect(12, 12, W - 24, H - 24);
  g.fillStyle = accent;
  g.fillRect(12, 12, 14, H - 24);
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  g.font = '700 58px "Plus Jakarta Sans", system-ui, sans-serif';
  g.fillText(line1, W / 2, line2 ? 88 : 122);
  if (line2) {
    g.font = '600 38px "Plus Jakarta Sans", system-ui, sans-serif';
    g.fillStyle = '#b9e6d2';
    g.fillText(line2, W / 2, 146);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeRoadSign(line1, line2, accent) {
  const g = new THREE.Group();
  const postMat = new THREE.MeshStandardMaterial({ color: '#6b7684', roughness: 0.6, metalness: 0.4 });
  for (const px of [-1.05, 1.05]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 3.2, 6), postMat);
    post.position.set(px, 1.6, 0);
    post.castShadow = true;
    g.add(post);
  }
  const mat = new THREE.MeshStandardMaterial({
    map: signTexture(line1, line2, accent), roughness: 0.62,
    emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0,
    emissiveMap: signTexture(line1, line2, accent), side: THREE.DoubleSide
  });
  const board = new THREE.Mesh(new THREE.BoxGeometry(2.9, 1.15, 0.09), [
    postMat, postMat, postMat, postMat, mat, mat
  ]);
  board.position.y = 3.0;
  board.castShadow = true;
  g.add(board);
  g.userData.signMat = mat;
  return g;
}

/* small chevron marker for the tight bends */
export function makeChevron() {
  const g = new THREE.Group();
  const postMat = new THREE.MeshStandardMaterial({ color: '#58606d', roughness: 0.7 });
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 1.5, 5), postMat);
  post.position.y = 0.75;
  g.add(post);
  const mat = new THREE.MeshStandardMaterial({
    color: '#ffd23f', roughness: 0.5, side: THREE.DoubleSide,
    emissive: new THREE.Color('#ffc21a'), emissiveIntensity: 0
  });
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, 0.05), mat);
  plate.position.y = 1.5;
  plate.rotation.z = Math.PI / 4;
  g.add(plate);
  g.userData.glowMat = mat;
  return g;
}


/* ---------- a stone bridge ------------------------------------------------
   Where the stream off the waterfall meets the switchback, the road has to
   cross it — a torrent running straight over a carriageway is the kind of
   detail that breaks the whole illusion. A low arched culvert, scaled to
   the road rather than to a river: deck flush with the carriageway,
   parapets with coping, and an open arch you can see daylight through.
   `at` is the road point, `tangent` the road direction there. */
export function makeStoneBridge(H, at, tangent, opts = {}) {
  const g = new THREE.Group();
  const span = opts.span || 6.4;          // along the road
  const width = opts.width || 4.4;        // across it — the carriageway
  const rise = opts.rise || 1.15;

  const ashlar = new THREE.MeshStandardMaterial({ color: '#98928a', roughness: 0.95, flatShading: true });
  const coping = new THREE.MeshStandardMaterial({ color: '#b6afa4', roughness: 0.9, flatShading: true });
  const dark = new THREE.MeshStandardMaterial({ color: '#4a463f', roughness: 1 });

  const ground = H(at.x, at.z);
  const deckY = ground + 0.16;
  const springY = ground - rise - 0.35;   // the arch springs from below grade

  /* the two faces of the bridge, each pierced by an arch */
  const arcR = span * 0.3;
  for (const side of [1, -1]) {
    const fz = side * (width / 2 + 0.28);
    /* the wall, built from blocks so the arch reads as an opening in it */
    const wall = new THREE.Mesh(new THREE.BoxGeometry(span, rise + 1.5, 0.45), ashlar);
    wall.position.set(0, springY + (rise + 1.5) / 2, fz);
    wall.castShadow = wall.receiveShadow = true;
    g.add(wall);
    /* the arch ring, standing proud of the wall */
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(arcR, 0.28, 8, 18, Math.PI), coping);
    ring.position.set(0, springY + rise + 0.2, fz + side * 0.16);
    g.add(ring);
    /* a keystone */
    const key = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.62, 0.62), coping);
    key.position.set(0, springY + rise + arcR + 0.24, fz + side * 0.1);
    g.add(key);
  }

  /* the opening itself: a dark tunnel you can see through */
  const bore = new THREE.Mesh(
    new THREE.CylinderGeometry(arcR - 0.1, arcR - 0.1, width + 0.9, 16, 1, true, 0, Math.PI),
    dark);
  bore.rotation.set(Math.PI / 2, 0, 0);
  bore.position.set(0, springY + rise + 0.2, 0);
  g.add(bore);

  /* the deck carrying the road across, flush with the carriageway */
  const deck = new THREE.Mesh(new THREE.BoxGeometry(span + 0.5, 0.36, width + 1.5), ashlar);
  deck.position.set(0, deckY - 0.18, 0);
  deck.receiveShadow = true;
  g.add(deck);
  const running = new THREE.Mesh(new THREE.BoxGeometry(span + 0.3, 0.08, width), dark);
  running.position.set(0, deckY + 0.02, 0);
  running.receiveShadow = true;
  g.add(running);

  /* parapets */
  for (const side of [1, -1]) {
    const pz = side * (width / 2 + 0.42);
    const para = new THREE.Mesh(new THREE.BoxGeometry(span + 0.5, 0.62, 0.32), ashlar);
    para.position.set(0, deckY + 0.31, pz);
    para.castShadow = true;
    g.add(para);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(span + 0.8, 0.14, 0.48), coping);
    cap.position.set(0, deckY + 0.69, pz);
    g.add(cap);
    for (const ex of [1, -1]) {
      const pier = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.0, 0.5), coping);
      pier.position.set(ex * (span / 2 + 0.22), deckY + 0.5, pz);
      pier.castShadow = true;
      g.add(pier);
    }
  }

  /* a few boulders tucked against the abutments */
  const rnd = mulberry32(Math.floor(Math.abs(at.x) * 97 + Math.abs(at.z) * 31) + 1);
  for (let i = 0; i < 6; i++) {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.34 + rnd() * 0.44, 0), ashlar);
    rock.position.set(
      (rnd() - 0.5) * span * 0.8,
      ground - 0.4 - rnd() * 0.5,
      (i % 2 ? 1 : -1) * (width / 2 + 0.9 + rnd() * 0.6));
    rock.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
    g.add(rock);
  }

  g.position.set(at.x, 0, at.z);
  g.rotation.y = Math.atan2(-tangent.z, tangent.x);
  return compactGroup(g);
}

/* ---------- traffic -----------------------------------------------------
   A handful of vehicles crawling the switchbacks. Each one carries
   headlight cones and tail lamps that only light up after dark. */
const CAR_COLORS = ['#e2e8f0', '#dc2626', '#2563eb', '#f59e0b', '#10b981', '#7c3aed', '#f1f5f9'];

function makeVehicle(rand, kind) {
  const g = new THREE.Group();
  const col = CAR_COLORS[Math.floor(rand() * CAR_COLORS.length)];
  const base = new THREE.Color(col);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: base, roughness: 0.28, metalness: 0.55
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: base.clone().multiplyScalar(0.55), roughness: 0.5, metalness: 0.4
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: '#16243a', roughness: 0.08, metalness: 0.85
  });
  const tyreMat = new THREE.MeshStandardMaterial({ color: '#12151b', roughness: 0.95 });
  const rimMat = new THREE.MeshStandardMaterial({ color: '#c9d2dd', roughness: 0.3, metalness: 0.9 });
  const chrome = new THREE.MeshStandardMaterial({ color: '#aab4c2', roughness: 0.22, metalness: 0.95 });

  const isVan = kind === 1, isBus = kind === 2;
  const L = isBus ? 4.6 : isVan ? 3.2 : 2.6;
  const W = isBus ? 1.4 : 1.22;
  const Hb = isBus ? 0.95 : isVan ? 0.66 : 0.5;
  const ride = 0.34;

  /* lower body — chamfered rather than a bare box */
  const hull = new THREE.Mesh(new THREE.BoxGeometry(L, Hb, W), bodyMat);
  hull.position.y = ride + Hb / 2;
  hull.castShadow = true;
  g.add(hull);
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(L * 0.98, Hb * 0.34, W * 1.04), trimMat);
  skirt.position.y = ride + Hb * 0.17;
  g.add(skirt);

  /* cabin */
  if (isBus) {
    const roof = new THREE.Mesh(new THREE.BoxGeometry(L * 0.96, 0.14, W * 0.94), trimMat);
    roof.position.y = ride + Hb + 0.07;
    g.add(roof);
    for (let i = 0; i < 5; i++) {                       // window band
      const win = new THREE.Mesh(new THREE.BoxGeometry(L * 0.15, Hb * 0.4, W * 1.02), glassMat);
      win.position.set(-L * 0.36 + i * L * 0.18, ride + Hb * 0.72, 0);
      g.add(win);
    }
  } else {
    const cabL = isVan ? 1.5 : 1.35;
    const cabH = isVan ? 0.62 : 0.52;
    const cabX = isVan ? -L * 0.16 : -0.1;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(cabL, cabH, W * 0.9), glassMat);
    cab.position.set(cabX, ride + Hb + cabH / 2, 0);
    cab.castShadow = true;
    g.add(cab);
    /* a thin roof panel in body colour so it is not all glass */
    const roof = new THREE.Mesh(new THREE.BoxGeometry(cabL * 0.9, 0.1, W * 0.86), bodyMat);
    roof.position.set(cabX, ride + Hb + cabH + 0.05, 0);
    g.add(roof);
    /* A and C pillars */
    for (const px of [cabX - cabL / 2 + 0.06, cabX + cabL / 2 - 0.06]) {
      for (const pz of [W * 0.44, -W * 0.44]) {
        const pil = new THREE.Mesh(new THREE.BoxGeometry(0.08, cabH, 0.07), bodyMat);
        pil.position.set(px, ride + Hb + cabH / 2, pz);
        g.add(pil);
      }
    }
    /* wing mirrors */
    for (const mz of [W / 2 + 0.07, -W / 2 - 0.07]) {
      const mir = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.07), trimMat);
      mir.position.set(cabX + cabL / 2 - 0.02, ride + Hb + cabH * 0.55, mz);
      g.add(mir);
    }
  }

  /* bumpers and a grille */
  for (const [bx, mat] of [[L / 2 + 0.05, chrome], [-L / 2 - 0.05, chrome]]) {
    const bump = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, W * 0.94), mat);
    bump.position.set(bx, ride + Hb * 0.34, 0);
    g.add(bump);
  }
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, W * 0.5), trimMat);
  grille.position.set(L / 2 + 0.03, ride + Hb * 0.62, 0);
  g.add(grille);

  /* wheels: tyre, rim and a hub, set into arches */
  const tyreGeo = new THREE.CylinderGeometry(ride, ride, 0.22, 14);
  tyreGeo.rotateX(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(ride * 0.6, ride * 0.6, 0.24, 10);
  rimGeo.rotateX(Math.PI / 2);
  const wheels = [];
  const axles = isBus ? [L / 2 - 0.7, -L / 2 + 0.75, 0.1] : [L / 2 - 0.62, -L / 2 + 0.6];
  for (const wx of axles) {
    for (const wz of [W / 2 + 0.02, -W / 2 - 0.02]) {
      const hub = new THREE.Group();
      const tyre = new THREE.Mesh(tyreGeo, tyreMat);
      tyre.castShadow = true;
      hub.add(tyre);
      const rim = new THREE.Mesh(rimGeo, rimMat);
      hub.add(rim);
      for (let sp = 0; sp < 4; sp++) {                  // spokes
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(ride * 0.9, 0.06, 0.26), rimMat);
        spoke.rotation.z = (sp / 4) * Math.PI;
        hub.add(spoke);
      }
      hub.position.set(wx, ride, wz);
      g.add(hub);
      wheels.push(hub);
      const arch = new THREE.Mesh(new THREE.TorusGeometry(ride * 1.12, 0.06, 6, 12, Math.PI), trimMat);
      arch.position.set(wx, ride, wz * 0.92);
      arch.rotation.y = Math.PI / 2;
      g.add(arch);
    }
  }

  /* lamps — dark by day, blazing at night */
  const headMat = new THREE.MeshStandardMaterial({
    color: '#fff6dd', emissive: new THREE.Color('#fff1cf'), emissiveIntensity: 0
  });
  const tailMat = new THREE.MeshStandardMaterial({
    color: '#b91c1c', emissive: new THREE.Color('#ff2b2b'), emissiveIntensity: 0
  });
  const lampGeo = new THREE.BoxGeometry(0.07, 0.13, 0.3);
  for (const lz of [W / 2 - 0.22, -W / 2 + 0.22]) {
    const hl = new THREE.Mesh(lampGeo, headMat);
    hl.position.set(L / 2 + 0.06, ride + Hb * 0.78, lz);
    g.add(hl);
    const tl = new THREE.Mesh(lampGeo, tailMat);
    tl.position.set(-L / 2 - 0.06, ride + Hb * 0.78, lz);
    g.add(tl);
  }

  /* headlight beams: two additive cones that thin out as they reach */
  const beamMat = new THREE.MeshBasicMaterial({
    map: beamTexture(), color: '#ffe6ad', transparent: true, opacity: 0, fog: false,
    depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
  });
  const beamGeo = new THREE.ConeGeometry(0.95, 7, 14, 1, true);
  beamGeo.translate(0, -3.5, 0);
  beamGeo.rotateZ(Math.PI / 2);
  for (const lz of [W / 2 - 0.26, -W / 2 + 0.26]) {
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.set(L / 2 + 0.08, ride + Hb * 0.74, lz);
    beam.rotation.z = -0.055;
    beam.renderOrder = 3;
    g.add(beam);
  }

  const glowMat = new THREE.SpriteMaterial({
    map: glowTexture(), transparent: true, opacity: 0, fog: false,
    blending: THREE.AdditiveBlending, depthWrite: false
  });
  const glow = new THREE.Sprite(glowMat);
  glow.scale.setScalar(2.6);
  glow.position.set(L / 2 + 0.12, ride + Hb * 0.78, 0);
  g.add(glow);

  g.userData.night = [
    { m: headMat, k: 2.6, prop: 'emissiveIntensity' },
    { m: tailMat, k: 1.9, prop: 'emissiveIntensity' },
    { m: beamMat, k: 0.5, prop: 'opacity' },
    { m: glowMat, k: 0.85, prop: 'opacity' }
  ];
  g.userData.wheels = wheels;
  return g;
}

export function createTraffic(scene, H, count = 4) {
  const rand = mulberry32(77123);
  const cars = [];
  for (let i = 0; i < count; i++) {
    const car = makeVehicle(rand, rand() < 0.18 ? 2 : rand() < 0.4 ? 1 : 0);
    /* yaw first, then pitch about the car's own long axis — the default XYZ
       order would roll it onto its side on the steep sections */
    car.rotation.order = 'YZX';
    cars.push({
      mesh: car,
      t: 0.08 + rand() * 0.86,
      dir: i % 2 === 0 ? 1 : -1,
      speed: 0.010 + rand() * 0.010,
      wheels: car.userData.wheels
    });
    scene.add(car);
  }

  /* a point on the correct side of the carriageway, seated on the slope */
  const lane = (t, dir, out) => {
    const p = roadAt(Math.min(1, Math.max(0, t)));
    const dl = Math.hypot(p.x, p.z) || 1;
    const off = dir > 0 ? 0.62 : -0.62;
    const x = p.x + (-p.x / dl) * off;
    const z = p.z + (-p.z / dl) * off;
    return out.set(x, H(x, z) + 0.04, z);
  };

  const here = new THREE.Vector3(), ahead = new THREE.Vector3();

  return {
    cars,
    update(dt, mix) {
      for (const c of cars) {
        c.t += c.dir * c.speed * dt;
        /* the summit is a dead end and so is the valley — turn around
           rather than teleporting from one end of the road to the other */
        if (c.t >= 1) { c.t = 1; c.dir = -1; }
        if (c.t <= 0) { c.t = 0; c.dir = 1; }

        lane(c.t, c.dir, here);
        lane(c.t + c.dir * 0.006, c.dir, ahead);
        const dx = ahead.x - here.x, dz = ahead.z - here.z;
        const flat = Math.hypot(dx, dz) || 1e-4;

        c.mesh.position.copy(here);
        c.mesh.rotation.y = Math.atan2(-dz, dx);
        c.mesh.rotation.z = Math.atan2(ahead.y - here.y, flat);
        for (const w of c.wheels) w.rotation.z -= dt * 11;

        for (const n of c.mesh.userData.night) n.m[n.prop] = n.k * mix;
      }
    }
  };
}
