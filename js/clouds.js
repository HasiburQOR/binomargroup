/* =============================================================
   BINOMAR GROUP — weather
   -------------------------------------------------------------
   Soft, lit cumulus built from camera-facing puffs and a thin cirrus
   veil far above them. (The valley mist that used to pool at the mountain's
   feet is gone - in daylight it read as clutter at the bottom of the slopes.)

   Each cloud is one InstancedMesh of billboarded quads, so a sky
   full of them costs a dozen draw calls. Shading is baked into
   the puff texture (bright crown, cool shadowed underside) and
   modulated per instance by how high the puff sits in its own
   cloud — which is what actually makes a blob read as volume.
   ============================================================= */
import * as THREE from 'three';
import { mulberry32 } from './city-build.js';

/* ---------- the puff ------------------------------------------------------
   A lumpy silhouette carved out of overlapping radial blobs, then lit
   from above. One texture, randomly rotated per instance, is enough
   variety once a dozen of them overlap. */
function puffTexture(seed) {
  const px = 256;
  const c = document.createElement('canvas'); c.width = c.height = px;
  const g = c.getContext('2d');
  const rand = mulberry32(seed);

  /* A puff is deliberately soft and nearly featureless. All the lumpiness
     of a cumulus comes from stacking dozens of these at different sizes —
     bake detail into the sprite and you see the sprite, not the cloud. */
  const blob = (cx, cy, r, a) => {
    const grad = g.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0.00, 'rgba(255,255,255,' + a.toFixed(3) + ')');
    grad.addColorStop(0.30, 'rgba(255,255,255,' + (a * 0.80).toFixed(3) + ')');
    grad.addColorStop(0.58, 'rgba(255,255,255,' + (a * 0.40).toFixed(3) + ')');
    grad.addColorStop(0.80, 'rgba(255,255,255,' + (a * 0.12).toFixed(3) + ')');
    grad.addColorStop(1.00, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
  };

  blob(px / 2, px / 2, px * 0.48, 0.52);
  for (let i = 0; i < 7; i++) {            // just enough wobble to break the circle
    const a = rand() * Math.PI * 2;
    const d = px * (0.05 + rand() * 0.10);
    blob(px / 2 + Math.cos(a) * d, px / 2 + Math.sin(a) * d,
      px * (0.22 + rand() * 0.16), 0.16 + rand() * 0.14);
  }

  /* barely-there top light — the real shading is per-instance in the
     shader, where it can follow the puff's height inside its own cloud */
  g.globalCompositeOperation = 'source-atop';
  const lit = g.createLinearGradient(0, 0, 0, px);
  lit.addColorStop(0.00, '#ffffff');
  lit.addColorStop(0.55, '#fbfdff');
  lit.addColorStop(1.00, '#eaf0fa');
  g.fillStyle = lit;
  g.fillRect(0, 0, px, px);
  g.globalCompositeOperation = 'source-over';

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const CLOUD_VERT = `
  attribute vec3 aOffset;
  attribute vec2 aScale;
  attribute float aRot;
  attribute float aShade;
  attribute float aPhase;
  uniform float uTime;
  uniform float uPuff;
  varying vec2 vUv;
  varying float vShade;
  void main() {
    vUv = uv;
    vShade = aShade;
    /* billboard: place the puff centre in view space, then lay the quad
       out on the screen plane so it always faces us */
    vec4 mv = modelViewMatrix * vec4(aOffset, 1.0);
    float breathe = 1.0 + 0.055 * sin(uTime * 0.23 + aPhase);
    vec2 corner = position.xy * aScale * breathe * uPuff;
    float s = sin(aRot), c = cos(aRot);
    mv.xy += vec2(corner.x * c - corner.y * s, corner.x * s + corner.y * c);
    gl_Position = projectionMatrix * mv;
  }`;

const CLOUD_FRAG = `
  uniform sampler2D uMap;
  uniform float uOpacity;
  uniform vec3 uTop;
  uniform vec3 uBottom;
  varying vec2 vUv;
  varying float vShade;
  void main() {
    vec4 t = texture2D(uMap, vUv);
    if (t.a < 0.004) discard;
    /* puffs high in the cloud catch the light; the ones underneath
       stay in its shadow — that vertical ramp is the whole illusion */
    vec3 tint = mix(uBottom, uTop, vShade);
    gl_FragColor = vec4(t.rgb * tint, t.a * uOpacity);
  }`;

function makeCloudMaterial(map) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: map },
      uTime: { value: 0 },
      uOpacity: { value: 1 },
      uPuff: { value: 1 },
      uTop: { value: new THREE.Color('#ffffff') },
      uBottom: { value: new THREE.Color('#ccd8ea') }
    },
    vertexShader: CLOUD_VERT,
    fragmentShader: CLOUD_FRAG,
    transparent: true,
    depthWrite: false,
    fog: false
  });
}

/* ---------- one cumulus ---------------------------------------------------
   Puffs are packed into a squashed ellipsoid with a flat-ish base, the
   way a fair-weather cumulus actually sits on its condensation level. */
function makeCloud(rand, map, opts = {}) {
  const n = opts.puffs || (34 + Math.floor(rand() * 20));
  const rx = opts.rx || (8 + rand() * 7);
  const ry = opts.ry || (3.0 + rand() * 2.2);
  const rz = opts.rz || rx * (0.5 + rand() * 0.3);
  const puffScale = opts.puffScale || 1;
  /* the sun sits off to the +x/+z side, so puffs on that flank of the
     cloud catch the light and the far side falls into its own shadow */
  const sx = 0.82, sz = 0.57;

  const geo = new THREE.InstancedBufferGeometry();
  const quad = new THREE.PlaneGeometry(1, 1);
  geo.index = quad.index;
  geo.attributes.position = quad.attributes.position;
  geo.attributes.uv = quad.attributes.uv;
  geo.instanceCount = n;

  const off = new Float32Array(n * 3);
  const scl = new Float32Array(n * 2);
  const rot = new Float32Array(n);
  const shd = new Float32Array(n);
  const pha = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    /* bias toward the centre so the silhouette stays a cloud, not a ring */
    const a = rand() * Math.PI * 2;
    const r = Math.pow(rand(), 0.62);
    const lift = Math.pow(rand(), 1.5);            // more puffs low, a few piled high
    const x = Math.cos(a) * r * rx;
    const z = Math.sin(a) * r * rz;
    const y = lift * ry - ry * 0.25 - r * ry * 0.35;
    off[i * 3] = x; off[i * 3 + 1] = y; off[i * 3 + 2] = z;

    const s = (6.0 + rand() * 5.5) * (1 - r * 0.25) * puffScale;
    scl[i * 2] = s;
    scl[i * 2 + 1] = s * (0.78 + rand() * 0.24);
    rot[i] = rand() * Math.PI * 2;
    const up = Math.min(1, Math.max(0, (y + ry * 0.45) / (ry * 1.25)));
    const dl = Math.hypot(x, z) || 1;
    const sun = ((x / dl) * sx + (z / dl) * sz) * 0.5 + 0.5;
    shd[i] = Math.min(1, up * 0.55 + sun * 0.45);
    pha[i] = rand() * Math.PI * 2;
  }

  geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(off, 3));
  geo.setAttribute('aScale', new THREE.InstancedBufferAttribute(scl, 2));
  geo.setAttribute('aRot', new THREE.InstancedBufferAttribute(rot, 1));
  geo.setAttribute('aShade', new THREE.InstancedBufferAttribute(shd, 1));
  geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(pha, 1));

  const mesh = new THREE.Mesh(geo, makeCloudMaterial(map));
  mesh.frustumCulled = false;                      // billboards outrun their bounds
  mesh.renderOrder = 6;
  return mesh;
}

/* ---------- cirrus: a thin veil, very high, barely there ----------------- */
function cirrusTexture() {
  const W = 1024, H = 512;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const rand = mulberry32(5150);
  g.clearRect(0, 0, W, H);
  for (let i = 0; i < 70; i++) {
    const y = rand() * H;
    const x = rand() * W;
    const len = 90 + rand() * 340;
    const thick = 4 + rand() * 16;
    const tilt = (rand() - 0.5) * 0.22;
    g.save();
    g.translate(x, y);
    g.rotate(tilt);
    const grad = g.createLinearGradient(-len / 2, 0, len / 2, 0);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.5, 'rgba(255,255,255,' + (0.10 + rand() * 0.16).toFixed(3) + ')');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    /* streak it with a few offset passes so the band looks fibrous */
    for (let k = 0; k < 4; k++) {
      const oy = (rand() - 0.5) * thick;
      g.fillRect(-len / 2, oy, len, 1 + rand() * 2.2);
    }
    g.restore();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function makeCirrus(radius, repeat, opacity) {
  const tex = cirrusTexture();
  tex.repeat.set(repeat, 1);
  /* a cap of the sky rather than a flat sheet — a plane overhead shows
     its own edge as a hard ring the moment the camera tilts up */
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 40, 20, 0, Math.PI * 2, 0, Math.PI * 0.46),
    new THREE.MeshBasicMaterial({
      map: tex, transparent: true, opacity, fog: false,
      depthWrite: false, side: THREE.BackSide
    })
  );
  mesh.renderOrder = 5;
  return mesh;
}

/* ---------- the whole sky -------------------------------------------------
   createWeather() owns every cloud in the scene and exposes one
   update(dt, t, gust, mix) — same contract as the rest of the world. */
export function createWeather(scene, q = {}) {
  const budget = q.clouds === undefined ? 1 : q.clouds;
  const many = (n) => Math.max(2, Math.round(n * budget));
  const rand = mulberry32(13579);
  const map = puffTexture(24680);

  const clouds = [];
  const add = (mesh, entry) => { scene.add(mesh); clouds.push(entry); };

  /* fair-weather cumulus riding above the summit */
  for (let i = 0; i < many(9); i++) {
    const mesh = makeCloud(rand, map);
    const e = {
      mesh, kind: 'cumulus',
      a: rand() * Math.PI * 2,
      r: 62 + rand() * 110,
      y: 186 + rand() * 62,
      speed: 0.010 + rand() * 0.016,
      bob: rand() * Math.PI * 2
    };
    mesh.position.set(Math.cos(e.a) * e.r, e.y, Math.sin(e.a) * e.r);
    add(mesh, e);
  }

  /* a lower deck the peak pokes through */
  for (let i = 0; i < many(5); i++) {
    const mesh = makeCloud(rand, map, { rx: 12 + rand() * 9, ry: 2.6, puffs: 44, puffScale: 1.15 });
    const e = {
      mesh, kind: 'deck',
      a: rand() * Math.PI * 2,
      r: 112 + rand() * 58,
      y: 134 + rand() * 30,
      speed: 0.005 + rand() * 0.008,
      bob: rand() * Math.PI * 2
    };
    mesh.position.set(Math.cos(e.a) * e.r, e.y, Math.sin(e.a) * e.r);
    add(mesh, e);
  }

  const cirrus = [
    makeCirrus(700, 3, 0.55),
    makeCirrus(760, 2, 0.34)
  ];
  cirrus[1].rotation.y = 1.2;
  for (const c of cirrus) scene.add(c);

  /* day → night tints. Clouds never vanish at night any more: a thin
     moonlit deck is far cosier than an empty sky. */
  const DAY = { top: new THREE.Color('#ffffff'), bottom: new THREE.Color('#c3d0e6') };
  const DUSK = { top: new THREE.Color('#8f9fc8'), bottom: new THREE.Color('#3b4668') };
  const tmpTop = new THREE.Color(), tmpBot = new THREE.Color();

  return {
    clouds,
    update(dt, t, gust, mix) {
      const drift = 0.55 + gust * 0.7;
      tmpTop.lerpColors(DAY.top, DUSK.top, mix);
      tmpBot.lerpColors(DAY.bottom, DUSK.bottom, mix);

      for (const c of clouds) {
        c.a += c.speed * dt * drift;
        c.mesh.position.set(
          Math.cos(c.a) * c.r,
          c.y + Math.sin(t * 0.22 + c.bob) * 1.1,
          Math.sin(c.a) * c.r
        );
        const u = c.mesh.material.uniforms;
        u.uTime.value = t;
        u.uTop.value.copy(tmpTop);
        u.uBottom.value.copy(tmpBot);
        u.uOpacity.value = 0.95 - mix * 0.42;
      }

      for (let i = 0; i < cirrus.length; i++) {
        const m = cirrus[i].material;
        m.map.offset.x = t * 0.0016 * (i + 1) * drift;
        m.opacity = (i === 0 ? 0.55 : 0.38) * (1 - mix * 0.75);
        m.color.lerpColors(DAY.top, DUSK.top, mix * 0.8);
      }
    }
  };
}
