/* =============================================================
   BINOMAR GROUP — the warm bits
   -------------------------------------------------------------
   A fire pit on the plaza, café bulbs strung between the lamps,
   fireflies that come out at dusk and birds wheeling over the
   valley by day. None of it is load-bearing; all of it is why
   the place feels lived in.
   ============================================================= */
import * as THREE from 'three';
import { compactGroup } from './city-build.js';

/* ---------- shared warm glow sprite ------------------------------------- */
let _warmTex = null;
export function warmGlowTexture() {
  if (_warmTex) return _warmTex;
  const px = 128;
  const c = document.createElement('canvas'); c.width = c.height = px;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(px / 2, px / 2, 0, px / 2, px / 2, px / 2);
  grad.addColorStop(0.00, 'rgba(255,238,198,1)');
  grad.addColorStop(0.16, 'rgba(255,196,110,0.62)');
  grad.addColorStop(0.46, 'rgba(255,146,60,0.18)');
  grad.addColorStop(1.00, 'rgba(255,120,40,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, px, px);
  _warmTex = new THREE.CanvasTexture(c);
  _warmTex.colorSpace = THREE.SRGBColorSpace;
  return _warmTex;
}

/* ---------- the fire pit -------------------------------------------------
   Stone ring, spent logs, a flame built from nested cones that flicker
   out of phase, rising embers, and a pool of firelight on the flagstones.
   Returns the handles city.js needs to animate and to fade with the
   day/night mix — the fire burns all day but only *reads* after dark. */
export function makeFirePit(rand) {
  const g = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: '#8d8579', roughness: 1, flatShading: true });
  const charred = new THREE.MeshStandardMaterial({ color: '#3a2f28', roughness: 1 });

  /* ring of kerb stones */
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2;
    const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.32 + rand() * 0.14, 0), stone);
    s.position.set(Math.cos(a) * 1.35, 0.2, Math.sin(a) * 1.35);
    s.rotation.set(rand() * 3, rand() * 3, rand() * 3);
    s.castShadow = s.receiveShadow = true;
    g.add(s);
  }
  /* ash bed */
  const bed = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.25, 0.14, 16),
    new THREE.MeshStandardMaterial({ color: '#4a423b', roughness: 1 }));
  bed.position.y = 0.07;
  bed.receiveShadow = true;
  g.add(bed);

  /* logs leaning into a tepee */
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 1.3, 6), charred);
    log.position.set(Math.cos(a) * 0.32, 0.6, Math.sin(a) * 0.32);
    log.rotation.set(Math.cos(a) * 0.42, 0, -Math.sin(a) * 0.42);
    log.castShadow = true;
    g.add(log);
  }
  compactGroup(g);                       // the static half bakes to two meshes

  /* flame: three nested cones, each flickering on its own beat */
  const flames = [];
  const spec = [
    { r: 0.68, h: 2.6, col: '#ff6a10', op: 0.55 },
    { r: 0.46, h: 1.95, col: '#ffa432', op: 0.68 },
    { r: 0.26, h: 1.25, col: '#ffe08c', op: 0.85 }
  ];
  for (let i = 0; i < spec.length; i++) {
    const sp = spec[i];
    const mat = new THREE.MeshBasicMaterial({
      color: sp.col, transparent: true, opacity: 0, fog: false,
      depthWrite: false, blending: THREE.AdditiveBlending
    });
    mat.userData.noDim = true;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(sp.r, sp.h, 9), mat);
    cone.position.y = 0.2 + sp.h / 2;
    cone.renderOrder = 7;
    g.add(cone);
    flames.push({ mesh: cone, mat, base: sp.op, baseY: 0.2 + sp.h / 2, h: sp.h,
                  speed: 7 + i * 3.5, phase: rand() * 6.28 });
  }

  /* embers drifting up out of the flame */
  const emberN = 26;
  const pos = new Float32Array(emberN * 3);
  const dat = new Float32Array(emberN * 3);        // phase, radius, speed
  for (let i = 0; i < emberN; i++) {
    dat[i * 3] = rand();
    dat[i * 3 + 1] = 0.12 + rand() * 0.5;
    dat[i * 3 + 2] = 0.30 + rand() * 0.45;
  }
  const emberGeo = new THREE.BufferGeometry();
  emberGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  emberGeo.setAttribute('aData', new THREE.BufferAttribute(dat, 3));
  const emberMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 }, uScale: { value: Math.min(devicePixelRatio || 1, 2) } },
    vertexShader: `
      attribute vec3 aData;
      uniform float uTime, uScale;
      varying float vLife;
      void main() {
        float life = fract(uTime * aData.z + aData.x);
        vLife = life;
        float a = aData.x * 62.83 + life * 3.0;
        vec3 p = vec3(
          cos(a) * aData.y * (0.4 + life * 1.7),
          0.5 + life * 3.6,
          sin(a) * aData.y * (0.4 + life * 1.7));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (1.0 - life * 0.65) * 5.0 * uScale * (26.0 / -mv.z);
      }`,
    fragmentShader: `
      uniform float uOpacity;
      varying float vLife;
      void main() {
        float d = length(gl_PointCoord - vec2(0.5));
        if (d > 0.5) discard;
        vec3 col = mix(vec3(1.0, 0.86, 0.5), vec3(1.0, 0.36, 0.08), vLife);
        float a = smoothstep(0.5, 0.05, d) * (1.0 - vLife) * uOpacity;
        gl_FragColor = vec4(col, a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false
  });
  const embers = new THREE.Points(emberGeo, emberMat);
  embers.frustumCulled = false;
  embers.renderOrder = 7;
  g.add(embers);

  /* the glow, and the light it throws on the ground */
  const glowMat = new THREE.SpriteMaterial({
    map: warmGlowTexture(), color: new THREE.Color('#ff9438'),
    transparent: true, opacity: 0, fog: false,
    blending: THREE.AdditiveBlending, depthWrite: false
  });
  const glow = new THREE.Sprite(glowMat);
  glow.scale.setScalar(5);
  glow.position.y = 1.2;
  g.add(glow);

  const poolMat = new THREE.MeshBasicMaterial({
    map: warmGlowTexture(), color: new THREE.Color('#ff8c30'),
    transparent: true, opacity: 0, fog: false,
    depthWrite: false, blending: THREE.AdditiveBlending
  });
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(8.5, 8.5), poolMat);
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 0.08;
  pool.renderOrder = 2;
  g.add(pool);

  /* three log benches to sit on */
  const seat = new THREE.Group();
  const bark = new THREE.MeshStandardMaterial({ color: '#6b4a2f', roughness: 1 });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.8;
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 1.8, 9), bark);
    l.position.set(Math.cos(a) * 2.2, 0.28, Math.sin(a) * 2.2);
    l.rotation.set(Math.PI / 2, 0, 0);
    l.rotation.y = 0;
    l.rotation.z = -a;
    l.castShadow = true;
    seat.add(l);
  }
  compactGroup(seat);
  g.add(seat);

  g.userData.fire = { flames, emberMat, glowMat, poolMat };
  return g;
}

/* ---------- café bulbs on the bunting ------------------------------------
   Hung from the same catenary the pennants use, so they sag together. */
export function addStringLights(buntingGroup, radius, y, segments, lampMats) {
  const bulbMat = new THREE.MeshStandardMaterial({
    color: '#ffe6b4', emissive: new THREE.Color('#ffc368'), emissiveIntensity: 0
  });
  lampMats.push(bulbMat);
  const capMat = new THREE.MeshStandardMaterial({ color: '#40372c', roughness: 0.7 });
  const bulbGeo = new THREE.SphereGeometry(0.11, 8, 6);
  const capGeo = new THREE.CylinderGeometry(0.05, 0.06, 0.09, 6);
  const flares = [];

  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const x0 = Math.cos(a0) * radius, z0 = Math.sin(a0) * radius;
    const x1 = Math.cos(a1) * radius, z1 = Math.sin(a1) * radius;
    const n = 5;
    for (let j = 0; j < n; j++) {
      const k = (j + 0.5) / n;
      const px = x0 + (x1 - x0) * k, pz = z0 + (z1 - z0) * k;
      const py = y - 0.35 - Math.sin(k * Math.PI) * 0.9;
      const bulb = new THREE.Mesh(bulbGeo, bulbMat);
      bulb.position.set(px, py - 0.17, pz);
      buntingGroup.add(bulb);
      const cap = new THREE.Mesh(capGeo, capMat);
      cap.position.set(px, py - 0.05, pz);
      buntingGroup.add(cap);

      const fl = new THREE.Sprite(new THREE.SpriteMaterial({
        map: warmGlowTexture(), transparent: true, opacity: 0, fog: false,
        blending: THREE.AdditiveBlending, depthWrite: false
      }));
      fl.scale.setScalar(1.5);
      fl.position.set(px, py - 0.17, pz);
      buntingGroup.add(fl);
      flares.push(fl.material);
    }
  }
  return { bulbMat, flares };
}

/* ---------- fireflies ----------------------------------------------------
   They wander inside a loose torus around the village and blink on their
   own clocks, so the meadow twinkles once the sun is off it. */
export function createFireflies(scene, H, count = 220) {
  const pos = new Float32Array(count * 3);
  const dat = new Float32Array(count * 4);    // phase, radius, speed, blink
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 16 + Math.pow(Math.random(), 0.6) * 74;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    pos[i * 3] = x;
    pos[i * 3 + 1] = H(x, z) + 0.8 + Math.random() * 4.5;
    pos[i * 3 + 2] = z;
    dat[i * 4] = Math.random() * 6.283;
    dat[i * 4 + 1] = 0.7 + Math.random() * 2.4;
    dat[i * 4 + 2] = 0.25 + Math.random() * 0.5;
    dat[i * 4 + 3] = 0.4 + Math.random() * 1.5;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aData', new THREE.BufferAttribute(dat, 4));

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uOpacity: { value: 0 },
      uScale: { value: Math.min(devicePixelRatio || 1, 2) }
    },
    vertexShader: `
      attribute vec4 aData;
      uniform float uTime, uScale;
      varying float vGlow;
      void main() {
        /* a slow lissajous wander, plus a blink that is mostly off */
        vec3 p = position;
        p.x += sin(uTime * aData.z + aData.x) * aData.y;
        p.y += sin(uTime * aData.z * 1.7 + aData.x * 2.1) * aData.y * 0.55;
        p.z += cos(uTime * aData.z * 0.8 + aData.x * 1.4) * aData.y;
        float b = sin(uTime * aData.w + aData.x);
        vGlow = pow(max(b, 0.0), 3.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (2.0 + vGlow * 4.5) * uScale * (34.0 / -mv.z);
      }`,
    fragmentShader: `
      uniform float uOpacity;
      varying float vGlow;
      void main() {
        float d = length(gl_PointCoord - vec2(0.5));
        if (d > 0.5) discard;
        float core = smoothstep(0.5, 0.0, d);
        vec3 col = mix(vec3(0.72, 1.0, 0.48), vec3(1.0, 0.95, 0.62), vGlow);
        gl_FragColor = vec4(col, (pow(core, 2.0) + pow(core, 8.0)) * vGlow * uOpacity);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false
  });

  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 8;
  scene.add(pts);
  return {
    points: pts,
    update(t, mix) {
      mat.uniforms.uTime.value = t;
      mat.uniforms.uOpacity.value = mix;      // strictly an after-dark pleasure
      pts.visible = mix > 0.02;
    }
  };
}
