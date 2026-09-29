/* =============================================================
   BINOMAR GROUP — the night sky
   -------------------------------------------------------------
   Everything above the ridge line lives here: the graded sky
   dome, a full-sky Milky Way arc, twinkling star field, aurora
   curtains, shooting stars and the moon.

   createNightSky(scene) returns { update(mix, t, camera) } —
   `mix` is the day→night blend (0 = noon, 1 = midnight) so the
   whole sky fades in and out with one number.
   ============================================================= */
import * as THREE from 'three';
import { mulberry32 } from './city-build.js';

const R_SKY = 900;          // gradient dome
const R_MW = 880;           // milky-way dome (just inside it)
const R_STARS = 820;        // star points
const R_AURORA = 640;       // aurora curtains
const MW_SPIN = 1.85;       // puts the galactic core over the default view

/* ---------------------------------------------------------------
   1. graded sky dome — deep zenith → lighter horizon, with a warm
   haze where the village glows from below.
   --------------------------------------------------------------- */
function makeSkyGradient() {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 512;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 512);
  /* a dark sky is what lets the lights read: near-black overhead, deep
     navy through the middle, and only the last band above the ridge
     lifting into indigo — the colour belongs to the windows and lamps */
  grad.addColorStop(0.00, '#010208');   // zenith
  grad.addColorStop(0.35, '#03061a');
  grad.addColorStop(0.62, '#070d2a');
  grad.addColorStop(0.82, '#0e1438');
  grad.addColorStop(0.94, '#1a1a44');   // indigo
  grad.addColorStop(1.00, '#241d48');   // horizon
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 512);
  /* warm sodium haze lifting off the valley */
  const haze = g.createLinearGradient(0, 400, 0, 512);
  haze.addColorStop(0, 'rgba(150,96,70,0)');
  haze.addColorStop(1, 'rgba(200,120,70,0.32)');
  g.fillStyle = haze;
  g.fillRect(0, 400, 4, 112);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(R_SKY, 32, 24),
    new THREE.MeshBasicMaterial({
      map: tex, side: THREE.BackSide, fog: false,
      transparent: true, opacity: 0, depthWrite: false
    })
  );
  mesh.renderOrder = -30;
  return mesh;
}


/* ---------------------------------------------------------------
   1b. daytime sky — the same trick, warmer: a graded dome plus a
   soft sun so the blue above the ridge is not a flat fill.
   --------------------------------------------------------------- */
function makeDaySky() {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 512;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0.00, '#2f7fd4');   // zenith
  grad.addColorStop(0.30, '#5fa8e6');
  grad.addColorStop(0.50, '#9ed2f0');
  grad.addColorStop(0.62, '#f0dcae');   // the warm band a low sun leaves,
  grad.addColorStop(0.70, '#e8e2d4');   // sitting just above the ridge line
  grad.addColorStop(0.86, '#c3d6e8');   // …and settling onto the fog colour,
  grad.addColorStop(1.00, '#c3d6e8');   // so ground and sky meet without a seam
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 512);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(R_SKY + 20, 32, 24),
    new THREE.MeshBasicMaterial({
      map: tex, side: THREE.BackSide, fog: false,
      transparent: true, opacity: 1, depthWrite: false
    })
  );
  mesh.renderOrder = -31;
  return mesh;
}

function makeSunGlow() {
  const group = new THREE.Group();
  const mats = [];
  for (const [colour, scale, k, stop] of [
    ['#fff4d0', 420, 0.30, 0.10],
    ['#fff8e4', 190, 0.55, 0.14],
    ['#ffffff', 74, 1.00, 0.34]
  ]) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: radialGlowTexture(colour, stop), transparent: true, opacity: 0, fog: false,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    s.scale.setScalar(scale);
    s.material.userData.k = k;
    group.add(s);
    mats.push(s.material);
  }
  /* sits along the daytime sun direction from city.js */
  group.position.set(132, 76, 92).normalize().multiplyScalar(R_SKY - 60);
  return { group, mats };
}

/* ---------------------------------------------------------------
   2. the Milky Way — drawn by a shader straight from the view
   direction: a great-circle band with a mottled glow, a dark dust
   lane, a warm bulge at the galactic core and star clouds packed
   into it. (It used to be a painted equirectangular canvas; where
   that map pinched together at the dome's pole — right overhead
   once the sky pass tilts the camera up — it smeared into a grey
   cone of streaks. Computed per pixel there is no pole to pinch.)
   The band sits exactly where the canvas put it, so MW_SPIN still
   brings the core over the default view.
   --------------------------------------------------------------- */
const MW_INC = 1.04;                   // band tilt off the dome's equator
const MW_LAM0 = 0.55;                  // where it crosses the equator
const MW_CORE = MW_LAM0 + 2.15;        // galactic centre longitude

/* a direction on the dome from the map's longitude / latitude, matching
   SphereGeometry's own layout */
function domeDir(lam, lat) {
  return new THREE.Vector3(-Math.cos(lam) * Math.cos(lat), Math.sin(lat), Math.sin(lam) * Math.cos(lat));
}

function makeMilkyWayDome() {
  /* the band's great circle: b1 where it crosses the equator, b2 at its
     highest point, n the pole of its plane */
  const b1 = domeDir(MW_LAM0, 0);
  const b2 = domeDir(MW_LAM0 + Math.PI / 2, MW_INC);
  const n = new THREE.Vector3().crossVectors(b1, b2).normalize();
  const coreLat = Math.asin(Math.sin(MW_INC) * Math.sin(MW_CORE - MW_LAM0));
  const core = domeDir(MW_CORE, coreLat);
  const sCore = Math.atan2(core.dot(b2), core.dot(b1));

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uOpacity: { value: 0 },
      uB1: { value: b1 }, uB2: { value: b2 }, uN: { value: n },
      uCore: { value: sCore }
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform float uOpacity;
      uniform vec3 uB1, uB2, uN;
      uniform float uCore;
      varying vec3 vDir;

      float hash3(vec3 p) {
        p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }
      float vnoise(vec3 p) {
        vec3 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(hash3(i), hash3(i + vec3(1,0,0)), f.x),
                       mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x),
                       mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z);
      }
      float fbm(vec3 p) {
        float a = 0.5, s = 0.0;
        for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 11.7; a *= 0.5; }
        return s;
      }
      /* one star per grid cell (some cells empty), kept off the cell walls
         so no neighbour ever needs checking */
      float starLayer(vec3 d, float k, float keep, float rad) {
        vec3 c = floor(d * k);
        float h = hash3(c);
        if (h > keep) return 0.0;
        vec3 o = vec3(hash3(c + 17.3), hash3(c + 41.9), hash3(c + 73.1)) * 0.6 + 0.2;
        float dist = length(d * k - (c + o)) / k;
        float b = 0.35 + 0.65 * fract(h * 57.0);
        return b * exp(-dist * dist / (rad * rad));
      }

      void main() {
        vec3 d = normalize(vDir);
        float x = asin(clamp(dot(d, uN), -1.0, 1.0));           // off the band's spine
        float s = atan(dot(d, uB2), dot(d, uB1));               // along it
        float dc = abs(mod(s - uCore + 3.14159265, 6.2831853) - 3.14159265);
        float dens = 0.22 + 0.78 * exp(-dc * dc / (2.0 * 1.15 * 1.15));
        float hw = 0.135 + 0.16 * dens;                         // half width, radians
        float lane = sin(s * 2.3 + 1.1) * 0.028 + sin(s * 5.1) * 0.012;

        /* the broad glow, mottled into star clouds */
        float sig = hw * 0.55;
        float band = exp(-x * x / (2.0 * sig * sig));
        float m = fbm(d * 4.2);
        float m2 = fbm(d * 11.0 + 5.0);
        float glow = band * dens * (0.12 + 1.9 * pow(m, 2.6)) * (0.7 + 0.6 * m2);
        /* the dark rift along the spine, ragged at the edges */
        float rift = exp(-pow(x - lane, 2.0) / (2.0 * pow(hw * 0.13, 2.0)));
        glow *= 1.0 - 0.78 * rift * smoothstep(0.25, 0.65, fbm(d * 9.0 + 2.0));

        /* the warm bulge round the core */
        float bulge = exp(-dc * dc / (2.0 * 0.42 * 0.42) - x * x / (2.0 * 0.11 * 0.11));

        vec3 cool = mix(vec3(0.46, 0.55, 1.0), vec3(0.62, 0.52, 1.0), m2);
        vec3 col = cool * glow * 0.072 + vec3(1.0, 0.86, 0.7) * (bulge * 0.035 + glow * bulge * 0.05);

        /* stars, crowded into the band and thin outside it */
        float crowd = clamp(band * dens * (0.4 + m), 0.0, 1.0);
        float st = starLayer(d, 220.0, 0.015 + 0.3 * crowd, 0.0010)
                 + 0.6 * starLayer(d, 480.0, 0.25 * crowd * crowd, 0.0006);
        col += vec3(0.86, 0.9, 1.0) * st * 0.5;

        gl_FragColor = vec4(col, uOpacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide, transparent: true, depthWrite: false, fog: false,
    blending: THREE.AdditiveBlending
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(R_MW, 48, 32), mat);
  mesh.renderOrder = -29;
  /* a pivot lets us tilt the whole galactic plane while the dome
     itself keeps spinning on its own axis */
  const pivot = new THREE.Group();
  pivot.rotation.set(0, 0, 0.62);
  pivot.add(mesh);
  return { pivot, mesh };
}

/* ---------------------------------------------------------------
   3. foreground star points — these twinkle, the dome ones don't,
   and the mix of the two is what sells a real sky.
   --------------------------------------------------------------- */
function makeStarPoints(n) {
  const N = n || 850;
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  const size = new Float32Array(N);
  const phase = new Float32Array(N);
  const rand = mulberry32(987654321);
  const c = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const th = rand() * Math.PI * 2;
    const el = 0.05 + Math.pow(rand(), 0.75) * 1.4;     // favour higher sky
    pos[i * 3] = Math.cos(th) * Math.cos(el) * R_STARS;
    pos[i * 3 + 1] = Math.sin(el) * R_STARS;
    pos[i * 3 + 2] = Math.sin(th) * Math.cos(el) * R_STARS;
    const t = rand();
    if (t < 0.18) c.setHSL(0.09, 0.55, 0.78);            // warm giants
    else if (t < 0.34) c.setHSL(0.60, 0.45, 0.82);       // blue-white
    else c.setHSL(0.58, 0.12, 0.92);                     // plain white
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    const r = rand();
    size[i] = r < 0.015 ? 3.4 : r < 0.10 ? 2.4 : r < 0.4 ? 1.7 : 1.2;
    phase[i] = rand();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uScale: { value: Math.min(devicePixelRatio || 1, 2) }
    },
    vertexShader: `
      attribute vec3 aColor;
      attribute float aSize;
      attribute float aPhase;
      uniform float uTime;
      uniform float uScale;
      varying vec3 vColor;
      varying float vTwinkle;
      void main() {
        vColor = aColor;
        float p = aPhase * 6.2831853;
        float tw = 0.58 + 0.42 * sin(uTime * 1.9 + p)
                        * (0.6 + 0.4 * sin(uTime * 0.77 + p * 2.3));
        vTwinkle = clamp(tw, 0.12, 1.0);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * uScale * (0.65 + 0.55 * vTwinkle);
      }`,
    fragmentShader: `
      uniform float uOpacity;
      varying vec3 vColor;
      varying float vTwinkle;
      void main() {
        float d = length(gl_PointCoord - vec2(0.5));
        if (d > 0.5) discard;
        float core = smoothstep(0.5, 0.0, d);
        float a = pow(core, 2.4) + pow(core, 8.0) * 0.8;
        gl_FragColor = vec4(vColor, a * uOpacity * vTwinkle);
      }`,
    transparent: true, depthWrite: false, fog: false,
    blending: THREE.AdditiveBlending
  });

  const pts = new THREE.Points(geo, mat);
  pts.renderOrder = -28;
  return pts;
}

/* ---------------------------------------------------------------
   4. aurora — slow curtains of light standing above the far ridge.
   --------------------------------------------------------------- */
const AURORA_FRAG = `
  uniform float uTime;
  uniform float uOpacity;
  uniform vec3  uColA;
  uniform vec3  uColB;
  uniform float uSeed;
  varying vec2 vUv;

  float hash(float n) { return fract(sin(n) * 43758.5453123); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i.x + i.y * 57.0 + uSeed);
    float b = hash(i.x + 1.0 + i.y * 57.0 + uSeed);
    float c = hash(i.x + (i.y + 1.0) * 57.0 + uSeed);
    float d = hash(i.x + 1.0 + (i.y + 1.0) * 57.0 + uSeed);
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, amp = 0.5;
    for (int i = 0; i < 4; i++) { v += amp * noise(p); p *= 2.02; amp *= 0.5; }
    return v;
  }

  void main() {
    float y = vUv.y;
    /* curtains hang from the top and dissolve upward */
    float vert = smoothstep(0.0, 0.30, y) * smoothstep(1.0, 0.42, y);
    /* vertical ray structure, drifting sideways */
    float rays = 0.5 + 0.5 * sin(vUv.x * 46.0 + uTime * 0.35 + fbm(vec2(vUv.x * 4.0, uTime * 0.05)) * 7.0);
    rays *= 0.45 + 0.55 * fbm(vec2(vUv.x * 7.0 - uTime * 0.045, y * 1.4));
    rays = pow(rays, 2.1);
    /* big slow blobs so the whole sheet breathes */
    float body = fbm(vec2(vUv.x * 2.6 - uTime * 0.03, y * 1.1 + uTime * 0.012));
    body = smoothstep(0.32, 0.85, body);
    float edge = smoothstep(0.0, 0.10, vUv.x) * smoothstep(1.0, 0.90, vUv.x);
    vec3 col = mix(uColA, uColB, pow(y, 0.8));
    float a = vert * rays * body * edge * uOpacity;
    gl_FragColor = vec4(col * (0.6 + rays * 0.8), a);
  }`;

const AURORA_VERT = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

function makeAuroraCurtain(radius, height, arc, colA, colB, seed) {
  /* a cylindrical sheet: open-ended cylinder gives us the arc for free */
  const geo = new THREE.CylinderGeometry(radius, radius * 1.06, height, 96, 1, true,
    -arc / 2, arc);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uOpacity: { value: 0 },
      uColA: { value: new THREE.Color(colA) },
      uColB: { value: new THREE.Color(colB) },
      uSeed: { value: seed }
    },
    vertexShader: AURORA_VERT,
    fragmentShader: AURORA_FRAG,
    transparent: true, depthWrite: false, fog: false,
    side: THREE.DoubleSide, blending: THREE.AdditiveBlending
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = -25;
  return mesh;
}

/* ---------------------------------------------------------------
   5. shooting stars — a small pool of streaks, re-aimed each time.
   --------------------------------------------------------------- */
function streakTexture() {
  const W = 256, H = 32;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0.00, 'rgba(255,255,255,0)');
  grad.addColorStop(0.55, 'rgba(180,205,255,0.30)');
  grad.addColorStop(0.88, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.97, 'rgba(255,245,225,1)');
  grad.addColorStop(1.00, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  for (let y = 0; y < H; y++) {
    /* taper the tail into a needle */
    const k = 1 - Math.abs(y - H / 2) / (H / 2);
    g.globalAlpha = Math.pow(Math.max(0, k), 2.2);
    g.fillRect(0, y, W, 1);
  }
  g.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeMeteors(count) {
  const tex = streakTexture();
  const items = [];
  const group = new THREE.Group();
  for (let i = 0; i < count; i++) {
    const mat = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, opacity: 0, fog: false,
      depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    mesh.matrixAutoUpdate = false;
    mesh.visible = false;
    mesh.renderOrder = -20;
    group.add(mesh);
    items.push({ mesh, mat, t: 0, dur: 0, wait: 6 + i * 11 + Math.random() * 18, len: 0, from: new THREE.Vector3(), dir: new THREE.Vector3() });
  }
  return { group, items };
}

function aimMeteor(it) {
  /* start high and wide, fall toward the horizon at a shallow angle */
  const th = Math.random() * Math.PI * 2;
  const el = 0.55 + Math.random() * 0.75;
  const r = R_STARS * 0.94;
  it.from.set(Math.cos(th) * Math.cos(el) * r, Math.sin(el) * r, Math.sin(th) * Math.cos(el) * r);
  const side = new THREE.Vector3(-Math.sin(th), 0, Math.cos(th));
  const down = it.from.clone().normalize().multiplyScalar(-1);
  it.dir.copy(side.multiplyScalar(Math.random() < 0.5 ? 1 : -1))
    .addScaledVector(down, 0.35 + Math.random() * 0.5)
    .addScaledVector(new THREE.Vector3(0, -1, 0), 0.4 + Math.random() * 0.6)
    .normalize();
  it.len = 60 + Math.random() * 130;
  it.travel = 260 + Math.random() * 380;
  it.dur = 0.55 + Math.random() * 0.75;
  it.t = 0;
}

/* ---------------------------------------------------------------
   6. the moon — clean disc, layered halo, and a tight glint.
   --------------------------------------------------------------- */

function radialGlowTexture(colorHex, innerStop) {
  const px = 256;
  const c = document.createElement('canvas'); c.width = c.height = px;
  const g = c.getContext('2d');
  const col = new THREE.Color(colorHex);
  const rgb = Math.round(col.r * 255) + ',' + Math.round(col.g * 255) + ',' + Math.round(col.b * 255);
  const grad = g.createRadialGradient(px / 2, px / 2, 0, px / 2, px / 2, px / 2);
  grad.addColorStop(0, 'rgba(' + rgb + ',1)');
  grad.addColorStop(innerStop, 'rgba(' + rgb + ',0.34)');
  grad.addColorStop(1, 'rgba(' + rgb + ',0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, px, px);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeMoon() {
  const group = new THREE.Group();
  /* clean, untextured disc: the old canvas texture painted the moon as a
     circle inside a square canvas, and wrapping that square onto the sphere
     folded its transparent corners over the poles and laid the gradient's
     dark edge ring along the limb — which read as a small boxy patch in the
     sky. A plain warm-white ball under the halo sprites is what a night
     moon should look like. depthWrite stays off so the disc never punches
     an invisible hole in the stars while it fades in */
  const disc = new THREE.Mesh(
    new THREE.SphereGeometry(24, 40, 28),
    new THREE.MeshBasicMaterial({ color: '#f6f2e4', fog: false, transparent: true, opacity: 0, depthWrite: false })
  );
  group.add(disc);

  const mats = [disc.material];
  disc.material.userData.k = 1;

  const halos = [
    { tex: '#b9ccff', scale: 380, k: 0.12, stop: 0.12 },   // the wide cold halo
    { tex: '#cfe0ff', scale: 240, k: 0.2, stop: 0.16 },
    { tex: '#fff2d6', scale: 130, k: 0.38, stop: 0.2 },
    { tex: '#fffaf0', scale: 84, k: 0.75, stop: 0.3 }
  ];
  for (const h of halos) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: radialGlowTexture(h.tex, h.stop), transparent: true, opacity: 0, fog: false,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    s.scale.setScalar(h.scale);
    s.material.userData.k = h.k;
    group.add(s);
    mats.push(s.material);
  }
  return { group, mats };
}

/* ---------------------------------------------------------------
   assemble
   --------------------------------------------------------------- */
export function createNightSky(scene, q = {}) {
  const root = new THREE.Group();
  root.name = 'nightSky';

  const daySky = makeDaySky();
  const sun = makeSunGlow();
  root.add(daySky, sun.group);

  const gradient = makeSkyGradient();
  const milky = makeMilkyWayDome();
  const stars = makeStarPoints(q.stars);
  root.add(gradient, milky.pivot, stars);

  /* q.aurora is a curtain count (0–3): each curtain is a full fbm shader
     stretched across much of the dome, so weak GPUs get one, not three */
  const auroraDefs = [
    [R_AURORA, 300, 1.55, '#2fe0a8', '#1b7fd6', 0.0, 130, 0.35],
    [R_AURORA * 0.86, 250, 1.15, '#7ef0c0', '#6f5cf0', 11.0, 150, 0.95],
    [R_AURORA * 1.12, 340, 0.9, '#49d6ff', '#c06ef5', 23.0, 115, -0.45]
  ];                                               // …args, then [height, spin]
  const auroraCount = typeof q.aurora === 'number' ? q.aurora : (q.aurora === false ? 0 : 3);
  const auroras = [];
  for (let i = 0; i < Math.min(3, Math.max(0, auroraCount)); i++) {
    const d = auroraDefs[i];
    const a = makeAuroraCurtain(d[0], d[1], d[2], d[3], d[4], d[5]);
    a.position.y = d[6];
    a.rotation.y = d[7];
    auroras.push(a);
    root.add(a);
  }

  const meteors = makeMeteors(q.meteors || 3);
  root.add(meteors.group);

  const moon = makeMoon();
  /* low over the northwest shoulder: from the HOME camera the top of the
     frame sits at only ≈ +7° elevation, so y ≈ 110 keeps the whole disc
     (and its tight glint) inside the viewport at the default zoom */
  moon.group.position.set(-340, 110, -230);
  root.add(moon.group);

  scene.add(root);

  const basis = new THREE.Matrix4();
  const vx = new THREE.Vector3(), vy = new THREE.Vector3(), vz = new THREE.Vector3();
  const vLen = new THREE.Vector3();
  const pos = new THREE.Vector3(), toCam = new THREE.Vector3();

  return {
    root,
    moon,
    update(mix, t, dt, camera) {
      /* daylight half of the sky */
      const day = 1 - mix;
      daySky.material.opacity = day;
      daySky.visible = day > 0.02;
      sun.group.visible = day > 0.02;
      for (const m of sun.mats) m.opacity = day * m.userData.k;

      const nightOn = mix > 0.02;
      gradient.visible = milky.pivot.visible = stars.visible = nightOn;
      moon.group.visible = nightOn;
      for (const a of auroras) a.visible = nightOn;
      if (!nightOn) {
        for (const it of meteors.items) { it.mesh.visible = false; it.dur = 0; }
        return;
      }

      gradient.material.opacity = mix;
      milky.mesh.material.uniforms.uOpacity.value = 0.62 * mix;
      stars.material.uniforms.uTime.value = t;
      stars.material.uniforms.uOpacity.value = 0.9 * mix;

      /* the whole sky turns, very slowly — one revolution ≈ 35 min */
      milky.mesh.rotation.y = MW_SPIN + t * 0.003;
      stars.rotation.y = t * 0.003;

      for (const a of auroras) {
        a.material.uniforms.uTime.value = t;
        a.material.uniforms.uOpacity.value = 0.34 * mix;
      }

      for (const m of moon.mats) m.opacity = mix * m.userData.k;

      /* meteors */
      for (const it of meteors.items) {
        if (it.dur === 0) {
          it.wait -= dt;
          if (it.wait <= 0) aimMeteor(it);    // shown once its matrix is set
          continue;
        }
        it.t += dt;
        const p = it.t / it.dur;
        if (p >= 1) {
          it.dur = 0;
          it.mesh.visible = false;
          it.wait = 9 + Math.random() * 34;
          continue;
        }
        pos.copy(it.from).addScaledVector(it.dir, it.travel * p);
        /* a streak can pass straight through the camera: a zero-length
           toCam, or a cross product of parallel vectors, normalizes into
           NaN — and a NaN matrix makes some GPU drivers rasterize the
           quad as a full-screen black smear (the intermittent black
           screen while dragging the camera on certain PCs). Fall back to
           a safe axis instead of ever letting NaN reach the GPU. */
        toCam.copy(camera.position).sub(pos);
        if (toCam.lengthSq() < 1e-8) toCam.set(0, 1, 0); else toCam.normalize();
        vx.copy(it.dir);
        vy.crossVectors(toCam, vx);
        if (vy.lengthSq() < 1e-8) {
          vy.set(-vx.z, 0, vx.x);
          if (vy.lengthSq() < 1e-8) vy.set(0, 1, 0);
        }
        vy.normalize();
        vz.crossVectors(vx, vy).normalize();
        const w = it.len * 0.055;
        basis.makeBasis(vLen.copy(vx).multiplyScalar(it.len), vy.multiplyScalar(w), vz);
        basis.setPosition(pos);
        it.mesh.matrix.copy(basis);
        /* fade in fast, out slow — and never hand the GPU a fully
           transparent quad: it is rasterized all the same */
        it.mat.opacity = mix * Math.min(1, p * 9) * (1 - Math.pow(p, 2.2));
        it.mesh.visible = it.mat.opacity > 0.004;
      }
    }
  };
}
