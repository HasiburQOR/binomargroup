/* =============================================================
   BINOMAR GROUP — trees, undergrowth and wind
   -------------------------------------------------------------
   The big landscape props: landmark broadleaf trees, giant
   snow-dusted conifers, rocks and bushes, an instanced grass
   layer that bends in the gust, drifting leaves, and the
   ridge-top windmill that shows which way the wind blows.
   ============================================================= */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { compactGroup } from './city-build.js';

const BARK = [
  new THREE.MeshStandardMaterial({ color: '#6b4a2f', roughness: 1, flatShading: true }),
  new THREE.MeshStandardMaterial({ color: '#5c3f28', roughness: 1, flatShading: true }),
  new THREE.MeshStandardMaterial({ color: '#7a5738', roughness: 1, flatShading: true })
];

/* ---------- landmark broadleaf ------------------------------------------
   Real trunk, real branches, a canopy built from overlapping crowns —
   these are the trees you notice from the summit. */
export function makeBigTree(rand, opts = {}) {
  const g = new THREE.Group();
  const scale = opts.scale || 1;
  const bark = BARK[Math.floor(rand() * BARK.length)];

  const trunkH = 4.6 + rand() * 1.8;
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.36, 0.82, trunkH, 9), bark);
  trunk.position.y = trunkH / 2;
  trunk.castShadow = true;
  g.add(trunk);

  /* buttress roots flaring into the ground */
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + rand();
    const root = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.1, 5), bark);
    root.position.set(Math.cos(a) * 0.56, 0.42, Math.sin(a) * 0.56);
    root.rotation.set(Math.cos(a) * 0.4, 0, -Math.sin(a) * 0.4);
    g.add(root);
  }

  /* limbs reaching out before the canopy sits on top of them */
  const limbs = 3 + Math.floor(rand() * 3);
  for (let i = 0; i < limbs; i++) {
    const a = (i / limbs) * Math.PI * 2 + rand() * 0.8;
    const len = 1.9 + rand() * 1.5;
    const limb = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.27, len, 6), bark);
    const tilt = 0.6 + rand() * 0.45;
    limb.position.set(
      Math.cos(a) * len * 0.36,
      trunkH * (0.62 + rand() * 0.3) + len * 0.3,
      Math.sin(a) * len * 0.36);
    limb.rotation.set(Math.sin(a) * tilt, 0, -Math.cos(a) * tilt);
    g.add(limb);
  }

  /* canopy: a cluster of crowns in two green tones */
  const hue = 0.27 + rand() * 0.07;
  const autumn = opts.autumn && rand() < 0.8;
  const leafA = new THREE.MeshStandardMaterial({
    color: autumn ? new THREE.Color().setHSL(0.08 + rand() * 0.04, 0.62, 0.42)
                  : new THREE.Color().setHSL(hue, 0.46, 0.30 + rand() * 0.07),
    roughness: 0.95, flatShading: true
  });
  const leafB = new THREE.MeshStandardMaterial({
    color: autumn ? new THREE.Color().setHSL(0.05 + rand() * 0.04, 0.68, 0.36)
                  : new THREE.Color().setHSL(hue + 0.03, 0.42, 0.37 + rand() * 0.07),
    roughness: 0.95, flatShading: true
  });

  const crowns = 6 + Math.floor(rand() * 4);
  const baseY = trunkH + 1.0;
  for (let i = 0; i < crowns; i++) {
    const a = rand() * Math.PI * 2;
    const rr = i === 0 ? 0 : 0.7 + rand() * 2.2;
    const r = 1.5 + rand() * 1.5;
    const blob = new THREE.Mesh(
      new THREE.IcosahedronGeometry(r, 0), rand() < 0.5 ? leafA : leafB);
    blob.position.set(Math.cos(a) * rr, baseY + rand() * 2.6 - r * 0.25, Math.sin(a) * rr);
    blob.rotation.set(rand() * 3, rand() * 3, rand() * 3);
    blob.scale.y = 0.78 + rand() * 0.28;
    blob.castShadow = true;
    g.add(blob);
  }

  g.scale.setScalar(scale);
  /* big trees are heavy — they sway slowly and not very far */
  g.userData.wind = { phase: rand() * 6.28, amp: 0.016 + rand() * 0.012, speed: 0.45 + rand() * 0.35 };
  return compactGroup(g);
}

/* ---------- giant conifer, optionally snow-laden -------------------------- */
export function makeGiantPine(rand, opts = {}) {
  const g = new THREE.Group();
  const snowy = !!opts.snowy;
  const bark = BARK[1];
  const trunkH = 3.2 + rand() * 1.4;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.5, trunkH, 8), bark);
  trunk.position.y = trunkH / 2;
  trunk.castShadow = true;
  g.add(trunk);

  const tone = 0.8 + rand() * 0.35;
  const needle = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0.11 * tone, 0.30 * tone, 0.19 * tone),
    roughness: 1, flatShading: true
  });
  const snow = new THREE.MeshStandardMaterial({ color: '#eef4fa', roughness: 0.75, flatShading: true });

  const tiers = 6 + Math.floor(rand() * 3);
  let y = trunkH * 0.55;
  for (let i = 0; i < tiers; i++) {
    const k = 1 - i / tiers;
    const r = 0.75 + k * 2.15;
    const h = 1.5 + k * 1.0;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h, 8), needle);
    cone.position.y = y + h / 2;
    cone.rotation.y = rand() * 3;
    cone.castShadow = true;
    g.add(cone);
    if (snowy) {
      const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.92, h * 0.42, 8), snow);
      cap.position.y = y + h * 0.80;
      cap.rotation.y = cone.rotation.y;
      g.add(cap);
    }
    y += h * 0.62;
  }
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.5, 7), snowy ? snow : needle);
  tip.position.y = y + 0.6;
  g.add(tip);

  g.userData.wind = { phase: rand() * 6.28, amp: 0.010 + rand() * 0.010, speed: 0.7 + rand() * 0.4 };
  return compactGroup(g);
}

/* ---------- undergrowth ----------------------------------------------------
   These share a fixed palette rather than minting a material each: props
   that share a material can be merged into one mesh, and a slope carrying
   hundreds of bushes needs them to be. */
const BUSH_MATS = [0, 1, 2, 3, 4].map((i) => new THREE.MeshStandardMaterial({
  color: new THREE.Color().setHSL(0.27 + i * 0.016, 0.38 + i * 0.03, 0.24 + i * 0.026),
  roughness: 1, flatShading: true
}));
export function makeBush(rand) {
  const g = new THREE.Group();
  const mat = BUSH_MATS[Math.floor(rand() * BUSH_MATS.length)];
  const n = 2 + Math.floor(rand() * 3);
  for (let i = 0; i < n; i++) {
    const r = 0.42 + rand() * 0.42;
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), mat);
    b.position.set((rand() - 0.5) * 1.1, r * 0.75, (rand() - 0.5) * 1.1);
    b.rotation.set(rand() * 3, rand() * 3, rand() * 3);
    g.add(b);
  }
  return compactGroup(g);
}

const ROCK_MAT = new THREE.MeshStandardMaterial({ color: '#8b8a93', roughness: 1, flatShading: true });
export function makeRockCluster(rand) {
  const g = new THREE.Group();
  const n = 1 + Math.floor(rand() * 3);
  for (let i = 0; i < n; i++) {
    const r = 0.4 + rand() * 1.1;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), ROCK_MAT);
    rock.position.set((rand() - 0.5) * 1.8, r * 0.55, (rand() - 0.5) * 1.8);
    rock.rotation.set(rand() * 3, rand() * 3, rand() * 3);
    rock.scale.y = 0.6 + rand() * 0.4;
    rock.castShadow = rock.receiveShadow = true;
    g.add(rock);
  }
  return compactGroup(g);
}

/* a stack of split logs — the kind that leans against every mountain barn */
export function makeLogPile(rand) {
  const g = new THREE.Group();
  const mat = BARK[0];
  const end = new THREE.MeshStandardMaterial({ color: '#c39a67', roughness: 1 });
  const geo = new THREE.CylinderGeometry(0.16, 0.16, 1.6, 7);
  geo.rotateZ(Math.PI / 2);
  for (let row = 0; row < 3; row++) {
    const n = 4 - row;
    for (let i = 0; i < n; i++) {
      const log = new THREE.Mesh(geo, [mat, end, end]);
      log.position.set(0, 0.16 + row * 0.3, (i - (n - 1) / 2) * 0.34);
      log.rotation.x = rand() * 0.3;
      g.add(log);
    }
  }
  return g;
}

/* ---------- instanced grass that bends in the gust ------------------------ */
function tuftGeometry() {
  const blades = [];
  for (let i = 0; i < 3; i++) {
    const b = new THREE.PlaneGeometry(0.16, 0.34, 1, 3);
    /* taper each blade to a point so it reads as grass, not a flag */
    const bp = b.attributes.position;
    for (let v = 0; v < bp.count; v++) {
      const k = (bp.getY(v) + 0.17) / 0.34;                 // 0 at root, 1 at tip
      bp.setX(v, bp.getX(v) * (1 - k * 0.85));
      bp.setZ(v, bp.getZ(v) + k * k * 0.05);                // a slight arch
    }
    bp.needsUpdate = true;
    b.translate(0, 0.17, 0);
    b.rotateY((i / 3) * Math.PI);
    b.translate((i - 1) * 0.08, 0, (i % 2) * 0.06);
    blades.push(b);
  }
  const geo = mergeGeometries(blades);
  /* point every normal at the sky: upright blades lit by their own
     normals go almost black under a hemisphere light, and grass that
     shades like the ground it grows out of reads far better */
  const n = geo.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  n.needsUpdate = true;
  return geo;
}

export function createGrass(scene, H, rand, opts = {}) {
  const count = opts.count || 2600;
  const geo = tuftGeometry();
  const mat = new THREE.MeshStandardMaterial({
    color: '#8fc978', roughness: 1, side: THREE.DoubleSide
  });
  const uniforms = { uTime: { value: 0 }, uGust: { value: 1 } };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uGust = uniforms.uGust;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>',
        '#include <common>\nuniform float uTime;\nuniform float uGust;')
      .replace('#include <begin_vertex>', `
        #include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 wpos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        #else
          vec3 wpos = vec3(0.0);
        #endif
        float h = max(transformed.y, 0.0);
        float bend = h * h * 0.9;
        float w1 = sin(uTime * 1.9 + wpos.x * 0.21 + wpos.z * 0.17);
        float w2 = sin(uTime * 3.1 + wpos.x * 0.53 - wpos.z * 0.31);
        transformed.x += (w1 * 0.26 + w2 * 0.09) * bend * uGust;
        transformed.z += (w1 * 0.12 - w2 * 0.07) * bend * uGust;
        transformed.y -= abs(w1) * bend * 0.06 * uGust;
      `);
  };

  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const col = new THREE.Color();

  /* grass grows in patches, not as evenly-spaced spikes: seed a clump
     on soft ground, then fill it with tufts. Bare rock stays bare. */
  const steepAt = (x, z) =>
    Math.hypot(H(x + 1.2, z) - H(x - 1.2, z), H(x, z + 1.2) - H(x, z - 1.2)) / 2.4;

  let placed = 0, seeds = 0;
  while (placed < count && seeds < count) {
    seeds++;
    const a = rand() * Math.PI * 2;
    const r = 16 + Math.pow(rand(), 0.7) * 150;
    const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
    if (steepAt(cx, cz) > 0.55) continue;                   // bare rock face
    if (opts.reject && opts.reject(cx, cz)) continue;

    const clump = 6 + Math.floor(rand() * 12);
    const spread = 1.1 + rand() * 2.3;
    const hue = 0.24 + rand() * 0.07;                       // one tone per patch
    for (let i = 0; i < clump && placed < count; i++) {
      const ta = rand() * Math.PI * 2;
      const tr = Math.sqrt(rand()) * spread;
      const x = cx + Math.cos(ta) * tr, z = cz + Math.sin(ta) * tr;
      if (steepAt(x, z) > 0.8) continue;
      p.set(x, H(x, z), z);
      s.setScalar(0.7 + rand() * 0.8);
      s.y *= 0.7 + rand() * 0.75;
      q.setFromEuler(new THREE.Euler(0, rand() * Math.PI, 0));
      m.compose(p, q, s);
      mesh.setMatrixAt(placed, m);
      col.setHSL(hue + (rand() - 0.5) * 0.03, 0.34 + rand() * 0.18, 0.38 + rand() * 0.14);
      mesh.setColorAt(placed, col);
      placed++;
    }
  }
  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  scene.add(mesh);

  return {
    mesh,
    update(t, gust) {
      uniforms.uTime.value = t;
      uniforms.uGust.value = gust;
    }
  };
}

/* ---------- drifting leaves & seed fluff ---------------------------------
   A GPU-advected point cloud: everything loops inside a big box, so
   there is nothing to simulate on the CPU. */
export function createWindParticles(scene, count = 420) {
  const BOX_X = 360, BOX_Z = 360, BOX_Y = 88;
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const dat = new Float32Array(count * 3);        // speed, bob phase, size
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * BOX_X;
    pos[i * 3 + 1] = 4 + Math.random() * BOX_Y;
    pos[i * 3 + 2] = (Math.random() - 0.5) * BOX_Z;
    const kind = Math.random();
    if (kind < 0.45) c.setHSL(0.09 + Math.random() * 0.06, 0.62, 0.48);      // dry leaf
    else if (kind < 0.7) c.setHSL(0.26 + Math.random() * 0.06, 0.45, 0.44);  // green leaf
    else c.setHSL(0.13, 0.20, 0.86);                                         // seed fluff
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    dat[i * 3] = 7 + Math.random() * 16;
    dat[i * 3 + 1] = Math.random() * 6.283;
    dat[i * 3 + 2] = 1.6 + Math.random() * 3.4;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aData', new THREE.BufferAttribute(dat, 3));

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uGust: { value: 1 }, uOpacity: { value: 0.8 },
      uScale: { value: Math.min(devicePixelRatio || 1, 2) }
    },
    vertexShader: `
      attribute vec3 aColor;
      attribute vec3 aData;
      uniform float uTime, uGust, uScale;
      varying vec3 vColor;
      void main() {
        vColor = aColor;
        vec3 p = position;
        float drift = uTime * aData.x * (0.45 + 0.75 * uGust);
        p.x = mod(p.x + drift + ${BOX_X / 2}.0, ${BOX_X}.0) - ${BOX_X / 2}.0;
        p.z = mod(p.z + drift * 0.42 + ${BOX_Z / 2}.0, ${BOX_Z}.0) - ${BOX_Z / 2}.0;
        p.y += sin(uTime * 1.4 + aData.y) * 3.2 + sin(uTime * 0.6 + aData.y * 2.0) * 1.8;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aData.z * uScale * (260.0 / -mv.z);
      }`,
    fragmentShader: `
      uniform float uOpacity;
      varying vec3 vColor;
      void main() {
        vec2 d = gl_PointCoord - vec2(0.5);
        float a = smoothstep(0.5, 0.12, length(d));
        gl_FragColor = vec4(vColor, a * uOpacity);
      }`,
    transparent: true, depthWrite: false
  });

  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  scene.add(pts);
  return {
    points: pts,
    update(t, gust, mix) {
      mat.uniforms.uTime.value = t;
      mat.uniforms.uGust.value = gust;
      mat.uniforms.uOpacity.value = 0.78 * (1 - mix * 0.72);   // leaves fade into the dark
    }
  };
}

/* ---------- the ridge windmill — the scene's wind vane -------------------- */
export function makeWindmill() {
  const g = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: '#9a9184', roughness: 1, flatShading: true });
  const wood = new THREE.MeshStandardMaterial({ color: '#6b4a2f', roughness: 0.95 });
  const canvasMat = new THREE.MeshStandardMaterial({
    color: '#efe6d2', roughness: 0.9, side: THREE.DoubleSide
  });

  const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2.4, 7.4, 10), stone);
  tower.position.y = 3.7;
  tower.castShadow = tower.receiveShadow = true;
  g.add(tower);

  for (let i = 0; i < 3; i++) {                     // little windows up the tower
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.16),
      new THREE.MeshStandardMaterial({ color: '#2a2320', roughness: 0.9 }));
    const a = i * 2.2;
    w.position.set(Math.sin(a) * 1.75, 2.0 + i * 1.9, Math.cos(a) * 1.75);
    w.rotation.y = a;
    g.add(w);
  }

  const cap = new THREE.Mesh(new THREE.ConeGeometry(2.0, 2.0, 10), wood);
  cap.position.y = 8.3;
  cap.castShadow = true;
  g.add(cap);

  const hub = new THREE.Group();
  hub.position.set(0, 8.0, 1.9);
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.9, 8), wood);
  axle.rotation.x = Math.PI / 2;
  hub.add(axle);
  for (let i = 0; i < 4; i++) {
    const sail = new THREE.Group();
    const spar = new THREE.Mesh(new THREE.BoxGeometry(0.18, 5.6, 0.18), wood);
    spar.position.y = 2.8;
    sail.add(spar);
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 4.6), canvasMat);
    cloth.position.set(0.68, 2.9, 0.05);
    sail.add(cloth);
    for (let r = 0; r < 5; r++) {                    // lattice ribs
      const rib = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.07, 0.07), wood);
      rib.position.set(0.68, 1.0 + r * 0.95, 0);
      sail.add(rib);
    }
    sail.rotation.z = (i / 4) * Math.PI * 2;
    hub.add(sail);
  }
  g.userData.hub = hub;

  const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.6, 0.2), wood);
  door.position.set(0, 0.8, 2.25);
  g.add(door);
  compactGroup(g);            // bake the tower; the sails keep turning
  g.add(hub);
  return g;
}

/* ---------- plaza bunting — a ring of pennants that snap in the wind ------ */
export function makeBunting(radius, y, segments, colors) {
  const g = new THREE.Group();
  const flags = [];
  const mats = colors.map((c) => new THREE.MeshStandardMaterial({
    color: c, roughness: 0.85, side: THREE.DoubleSide
  }));
  const ropeMat = new THREE.MeshStandardMaterial({ color: '#d7cfc2', roughness: 1 });

  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const x0 = Math.cos(a0) * radius, z0 = Math.sin(a0) * radius;
    const x1 = Math.cos(a1) * radius, z1 = Math.sin(a1) * radius;
    const len = Math.hypot(x1 - x0, z1 - z0);

    /* the rope sags: build each span from short links following a curve */
    const LINKS = 6;
    const sagAt = (k) => Math.sin(k * Math.PI) * 0.9;
    for (let l = 0; l < LINKS; l++) {
      const k0 = l / LINKS, k1 = (l + 1) / LINKS;
      const ax = x0 + (x1 - x0) * k0, az = z0 + (z1 - z0) * k0;
      const bx = x0 + (x1 - x0) * k1, bz = z0 + (z1 - z0) * k1;
      const ay = y - 0.35 - sagAt(k0), by = y - 0.35 - sagAt(k1);
      const seg = Math.hypot(bx - ax, by - ay, bz - az);
      const link = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, seg, 4), ropeMat);
      link.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
      link.lookAt(bx, by, bz);
      link.rotateX(Math.PI / 2);
      g.add(link);
    }

    const n = 4;
    for (let j = 0; j < n; j++) {
      const k = (j + 0.5) / n;
      const px = x0 + (x1 - x0) * k, pz = z0 + (z1 - z0) * k;
      const sag = Math.sin(k * Math.PI) * 0.9;
      const tri = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.55, 3), mats[(i * n + j) % mats.length]);
      tri.rotation.x = Math.PI;
      const pivot = new THREE.Group();
      pivot.position.set(px, y - 0.35 - sag, pz);
      tri.position.y = -0.3;
      pivot.add(tri);
      pivot.userData.wind = { phase: (i * n + j) * 0.7, amp: 0.30, speed: 3.4 };
      g.add(pivot);
      flags.push(pivot);
    }
  }
  g.userData.flags = flags;
  return g;
}

/* ---------- forest floor ---------------------------------------------------
   Stumps, deadfall and flower patches. Cheap, and they are what stop a
   slope full of trees from reading as a lawn with cones on it. */
export function makeStump(rand) {
  const g = new THREE.Group();
  const r = 0.34 + rand() * 0.3;
  const h = 0.4 + rand() * 0.5;
  const bark = BARK[Math.floor(rand() * BARK.length)];
  const stump = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.88, r, h, 9), bark);
  stump.position.y = h / 2;
  stump.castShadow = stump.receiveShadow = true;
  stump.rotation.z = (rand() - 0.5) * 0.12;
  g.add(stump);
  for (let i = 0; i < 3; i++) {                       // roots breaking the soil
    const a = rand() * Math.PI * 2;
    const root = new THREE.Mesh(new THREE.ConeGeometry(r * 0.3, r * 1.5, 5), bark);
    root.position.set(Math.cos(a) * r * 0.85, 0.12, Math.sin(a) * r * 0.85);
    root.rotation.set(Math.cos(a) * 1.25, 0, -Math.sin(a) * 1.25);
    g.add(root);
  }
  return compactGroup(g);
}

export function makeFallenLog(rand) {
  const g = new THREE.Group();
  const bark = BARK[Math.floor(rand() * BARK.length)];
  const len = 2.6 + rand() * 3.4;
  const r = 0.24 + rand() * 0.18;
  const geo = new THREE.CylinderGeometry(r * 0.82, r, len, 9);
  geo.rotateZ(Math.PI / 2);
  const log = new THREE.Mesh(geo, bark);
  log.position.y = r;
  log.rotation.y = rand() * Math.PI;
  log.castShadow = log.receiveShadow = true;
  g.add(log);
  /* moss on the upper side */
  const moss = new THREE.Mesh(new THREE.SphereGeometry(r * 0.75, 7, 4), MOSS_MAT);
  moss.scale.set(1.8 + rand(), 0.42, 0.9);
  moss.position.set((rand() - 0.5) * len * 0.4, r * 1.25, 0);
  moss.rotation.y = log.rotation.y;
  g.add(moss);
  if (rand() < 0.5) {
    const snap = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.5, r * 0.7, 0.9, 7), bark);
    snap.position.set(len * 0.52, r * 1.2, 0.2);
    snap.rotation.z = 0.5;
    g.add(snap);
  }
  return g;
}

const MOSS_MAT = new THREE.MeshStandardMaterial({ color: '#4e7a45', roughness: 1, flatShading: true });
const CAIRN_MAT = new THREE.MeshStandardMaterial({ color: '#9a978f', roughness: 1, flatShading: true });
const STEM_MAT = new THREE.MeshStandardMaterial({ color: '#4f7a3f', roughness: 1 });
const PETAL_MATS = ['#f2d24b', '#e8718d', '#ffffff', '#b98ce0', '#f59e5b'].map((c) =>
  new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, flatShading: true }));
export function makeFlowerPatch(rand) {
  const g = new THREE.Group();
  const stemMat = STEM_MAT;
  const headMat = PETAL_MATS[Math.floor(rand() * PETAL_MATS.length)];
  const n = 7 + Math.floor(rand() * 10);
  for (let i = 0; i < n; i++) {
    const a = rand() * Math.PI * 2;
    const d = Math.sqrt(rand()) * (0.7 + rand() * 0.9);
    const h = 0.3 + rand() * 0.28;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, h, 4), stemMat);
    stem.position.set(x, h / 2, z);
    g.add(stem);
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.085 + rand() * 0.05, 0), headMat);
    head.position.set(x, h + 0.04, z);
    g.add(head);
  }
  g.userData.wind = { phase: rand() * 6.28, amp: 0.07 + rand() * 0.06, speed: 1.6 + rand() * 0.9 };
  return compactGroup(g);
}

/* a cairn — the kind walkers stack at a viewpoint */
export function makeCairn(rand) {
  const g = new THREE.Group();
  const mat = CAIRN_MAT;
  let y = 0;
  const n = 4 + Math.floor(rand() * 4);
  for (let i = 0; i < n; i++) {
    const k = 1 - i / n;
    const r = 0.18 + k * 0.42;
    const h = 0.16 + rand() * 0.18;
    const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), mat);
    stone.position.set((rand() - 0.5) * 0.12, y + h, (rand() - 0.5) * 0.12);
    stone.scale.y = 0.55 + rand() * 0.3;
    stone.rotation.set(rand() * 3, rand() * 3, rand() * 3);
    stone.castShadow = stone.receiveShadow = true;
    g.add(stone);
    y += h * 1.5;
  }
  return compactGroup(g);
}
