/* =============================================================
   BINOMAR GROUP — the waterfall
   -------------------------------------------------------------
   Sited by sampling the terrain rather than by eye: the east-
   north-east flank is the steepest face on the mountain, it sits
   95 units clear of the switchback (so no bridge is needed), and
   it happens to face the default camera, so visitors meet it
   without having to orbit for it.

   The terrain has no true cliff, so a rock crag provides the lip.
   Below it: layered falling sheets, a plunge pool on the natural
   shelf, drifting spray, and a stream that carries on downhill.
   ============================================================= */
import * as THREE from 'three';
import { compactGroup, mulberry32 } from './city-build.js';

/* ---------- the falling sheet ------------------------------------------- */
const FALL_FRAG = `
  uniform float uTime;
  uniform float uOpacity;
  uniform vec3  uTint;
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }

  void main() {
    /* the sheet is divided into lanes, each falling at its own rate —
       real falling water never comes down as one flat curtain */
    float lanes = 11.0;
    float lane = floor(vUv.x * lanes);
    float speed = 1.15 + hash(vec2(lane, 3.0)) * 1.05;
    float streak = fract(vUv.y * 2.2 + uTime * speed + hash(vec2(lane, 7.0)));
    float bright = smoothstep(0.48, 1.0, streak);

    /* a bright lip at the top, breaking up into threads at the bottom */
    float lip = smoothstep(0.86, 1.0, vUv.y);
    float breakup = mix(0.45, 1.0, smoothstep(0.0, 0.34, vUv.y));
    float sideFade = smoothstep(0.0, 0.10, vUv.x) * smoothstep(1.0, 0.90, vUv.x);
    /* thin gaps between the lanes */
    float gap = smoothstep(0.06, 0.24, abs(fract(vUv.x * lanes) - 0.5) * 2.0);

    float a = (0.52 + bright * 0.48) * breakup * sideFade * mix(0.72, 1.0, gap);
    a = max(a, lip * 0.9 * sideFade);
    vec3 col = mix(uTint, vec3(1.0), bright * 0.85 + lip * 0.5);
    gl_FragColor = vec4(col, a * uOpacity);
  }`;

const BASIC_VERT = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

/* ---------- the plunge pool --------------------------------------------- */
const POOL_FRAG = `
  uniform float uTime;
  uniform float uOpacity;
  uniform vec3  uDeep;
  uniform vec3  uFoam;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv - 0.5;
    float d = length(p) * 2.0;
    /* rings spreading from where the water lands */
    float ring = sin(d * 22.0 - uTime * 2.6) * 0.5 + 0.5;
    float churn = smoothstep(0.55, 0.0, d);          // white water at the centre
    float edge = smoothstep(1.0, 0.72, d);
    vec3 col = mix(uDeep, uFoam, churn * (0.45 + ring * 0.55));
    float a = (0.72 + ring * 0.12) * edge * uOpacity;
    gl_FragColor = vec4(col, a);
  }`;

function waterMaterial(frag, uniforms) {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: BASIC_VERT,
    fragmentShader: frag,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    /* a ShaderMaterial that opts into fog must also carry the fog
       uniforms, and these shaders do not need them — the falls sit well
       inside the fog near plane anyway */
    fog: false
  });
}

/* ---------- spray at the base -------------------------------------------- */
function sprayTexture() {
  const px = 128;
  const c = document.createElement('canvas'); c.width = c.height = px;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(px / 2, px / 2, 0, px / 2, px / 2, px / 2);
  grad.addColorStop(0, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.4, 'rgba(226,240,250,0.2)');
  grad.addColorStop(1, 'rgba(210,232,248,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, px, px);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* =============================================================
   makeWaterfall(H, opts)
   `H` is the shared terrain height function. opts.a / opts.r put
   the lip on the slope; everything else is measured off the
   terrain so it sits on the real ground.
   ============================================================= */
export function makeWaterfall(H, opts = {}) {
  const group = new THREE.Group();
  const rand = mulberry32(19937);
  const a = opts.a === undefined ? 0.79 : opts.a;
  const rTop = opts.r === undefined ? 41 : opts.r;
  const rPool = opts.rPool === undefined ? 55 : opts.rPool;

  const cos = Math.cos(a), sin = Math.sin(a);
  const at = (r) => H(cos * r, sin * r);

  /* The slope here falls at roughly 45° — steep, but not a cliff, and water
     needs a lip to leave from. So the crag is a wedge of rock standing proud
     of the hillside: its top is a level shelf just under the uphill ground,
     and its downhill face is vertical. All three radii are measured against
     the real terrain, so it sits on the mountain rather than in it. */
  const rLip = rTop;                    // where the stream reaches the rock
  const rFace = rTop + 7;               // the vertical face it drops down
  const yLip = at(rLip) - 0.3;
  const yFaceFoot = at(rFace);
  const poolX = cos * rPool, poolZ = sin * rPool;
  const poolY = at(rPool);

  const rockDark = new THREE.MeshStandardMaterial({ color: '#5d6068', roughness: 1, flatShading: true });
  const rockLight = new THREE.MeshStandardMaterial({ color: '#868a93', roughness: 1, flatShading: true });
  const wet = new THREE.MeshStandardMaterial({ color: '#414c55', roughness: 0.4, flatShading: true });

  const crag = new THREE.Group();
  const rMid = (rLip + rFace) / 2;
  crag.position.set(cos * rMid, 0, sin * rMid);
  crag.rotation.y = Math.PI / 2 - a;    // local +x points downhill
  group.add(crag);

  const cragLen = rFace - rLip;
  const cragBottom = yFaceFoot - 2.5;
  const cragH = yLip - cragBottom;
  /* the mass is a stack of slabs rather than one block — a single box
     reads as a shipping container dropped on the hillside */
  const slabs = 5;
  for (let i = 0; i < slabs; i++) {
    const k = i / (slabs - 1);
    const sh = cragH / slabs * 1.22;
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(cragLen * (1.02 - k * 0.22), sh, 9.4 - k * 1.5),
      i % 2 ? rockDark : rockLight);
    slab.position.set(-k * 0.9, cragBottom + sh * 0.5 + i * (cragH / slabs), (rand() - 0.5) * 0.8);
    slab.rotation.y = (rand() - 0.5) * 0.09;
    slab.rotation.z = (rand() - 0.5) * 0.05;
    slab.castShadow = slab.receiveShadow = true;
    crag.add(slab);
  }

  /* two shoulders on the shelf leaving a notch for the water to run through */
  for (const side of [1, -1]) {
    const sh = new THREE.Mesh(new THREE.BoxGeometry(cragLen * 0.9, 3.0, 3.2), rockLight);
    sh.position.set(-0.2, yLip + 1.2, side * 3.4);
    sh.rotation.z = side * 0.04;
    sh.castShadow = sh.receiveShadow = true;
    crag.add(sh);
    /* a buttress running down the face either side of the fall */
    const butt = new THREE.Mesh(new THREE.BoxGeometry(1.4, cragH * 0.86, 1.5), rockLight);
    butt.position.set(cragLen / 2 - 0.3, cragBottom + cragH * 0.45, side * 2.9);
    crag.add(butt);
  }

  /* dark wet stone in the notch, behind where the sheet falls */
  const backing = new THREE.Mesh(new THREE.BoxGeometry(0.6, cragH * 0.94, 4.4), wet);
  backing.position.set(cragLen / 2 - 0.25, cragBottom + cragH * 0.5, 0);
  crag.add(backing);

  /* broken rock piled at the foot */
  for (let i = 0; i < 18; i++) {
    const side = i % 2 ? 1 : -1;
    const r = 0.6 + rand() * 1.7;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0),
      rand() < 0.5 ? rockDark : rockLight);
    rock.position.set(
      cragLen / 2 - rand() * 1.5,
      yFaceFoot - 1 + rand() * 4,
      side * (2.8 + rand() * 3.4));
    rock.rotation.set(rand() * 3, rand() * 3, rand() * 3);
    rock.scale.y = 0.6 + rand() * 0.5;
    rock.castShadow = rock.receiveShadow = true;
    crag.add(rock);
  }
  compactGroup(crag);

  /* ---- the falling sheets, hung off the face ---- */
  const fallTop = yLip + 0.35;
  const fallBottom = poolY + 0.2;
  const fallH = fallTop - fallBottom;
  const sheets = [];
  const mkSheet = (w, out, tint, op, speedScale) => {
    const u = {
      uTime: { value: 0 },
      uOpacity: { value: op },
      uTint: { value: new THREE.Color(tint) }
    };
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, fallH, 1, 1),
      waterMaterial(FALL_FRAG, u));
    const rr = rFace + out;
    mesh.position.set(cos * rr, (fallTop + fallBottom) / 2, sin * rr);
    mesh.rotation.y = Math.PI / 2 - a;   // the sheet faces down the slope
    mesh.renderOrder = 5;
    group.add(mesh);
    sheets.push({ u, speedScale, base: op });
    return mesh;
  };
  mkSheet(4.4, 0.45, '#9dc4dd', 0.9, 0.85);
  mkSheet(3.4, 0.95, '#d3e9f6', 1.0, 1.15);
  mkSheet(2.0, 1.35, '#ffffff', 0.85, 1.5);

  /* the chute on the shelf above, feeding the lip */
  {
    const u = { uTime: { value: 0 }, uOpacity: { value: 0.8 }, uTint: { value: new THREE.Color('#a8ccdf') } };
    const chute = new THREE.Mesh(new THREE.PlaneGeometry(3.4, cragLen * 0.9),
      waterMaterial(FALL_FRAG, u));
    chute.rotation.x = -Math.PI / 2;
    chute.rotation.z = Math.PI / 2 - a;
    chute.position.set(cos * rMid, yLip + 0.18, sin * rMid);
    chute.renderOrder = 4;
    group.add(chute);
    sheets.push({ u, speedScale: 0.5, base: 0.8 });
  }

  /* ---- the plunge pool, conforming to the shelf ---- */
  const poolU = {
    uTime: { value: 0 },
    uOpacity: { value: 0.9 },
    uDeep: { value: new THREE.Color('#1d4356') },
    uFoam: { value: new THREE.Color('#eaf6ff') }
  };
  const poolGeo = new THREE.CircleGeometry(6.8, 36);
  poolGeo.rotateX(-Math.PI / 2);
  const pp = poolGeo.attributes.position;
  for (let i = 0; i < pp.count; i++) {
    pp.setY(i, H(poolX + pp.getX(i), poolZ + pp.getZ(i)) - poolY + 0.22);
  }
  poolGeo.computeVertexNormals();
  const pool = new THREE.Mesh(poolGeo, waterMaterial(POOL_FRAG, poolU));
  pool.position.set(poolX, poolY, poolZ);
  pool.renderOrder = 4;
  group.add(pool);

  /* a rim of wet boulders around the pool */
  const rim = new THREE.Group();
  for (let i = 0; i < 20; i++) {
    const ra = (i / 20) * Math.PI * 2 + rand() * 0.25;
    const rr = 6.6 + rand() * 2.2;
    const r = 0.5 + rand() * 1.2;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0),
      rand() < 0.4 ? wet : rockLight);
    const rx = poolX + Math.cos(ra) * rr, rz = poolZ + Math.sin(ra) * rr;
    rock.position.set(rx, H(rx, rz) + r * 0.2, rz);
    rock.rotation.set(rand() * 3, rand() * 3, rand() * 3);
    rock.scale.y = 0.6 + rand() * 0.4;
    rock.castShadow = rock.receiveShadow = true;
    rim.add(rock);
  }
  compactGroup(rim);
  group.add(rim);

  /* ---- spray drifting off the impact ---- */
  const sprayMat = new THREE.SpriteMaterial({
    map: sprayTexture(), transparent: true, opacity: 0.5, fog: false,
    depthWrite: false
  });
  const spray = [];
  for (let i = 0; i < 12; i++) {
    const s = new THREE.Sprite(sprayMat.clone());
    s.scale.setScalar(3.4 + rand() * 3.4);
    s.renderOrder = 6;
    group.add(s);
    spray.push({
      sprite: s,
      phase: rand() * Math.PI * 2,
      speed: 0.28 + rand() * 0.3,
      spread: 1.6 + rand() * 4.2,
      lift: rand() * 3
    });
  }

  /* ---- the stream carrying on downhill ---- */
  const streamPts = [];
  for (let i = 0; i <= 26; i++) {
    const rr = rPool + 3 + i * 3.2;
    const wobble = Math.sin(i * 0.55) * 0.05 + Math.sin(i * 0.23) * 0.04;
    const sa = a + wobble;
    streamPts.push({ x: Math.cos(sa) * rr, z: Math.sin(sa) * rr });
  }
  const spos = [], suv = [], sidx = [];
  let run = 0;
  for (let i = 0; i < streamPts.length; i++) {
    const p = streamPts[i];
    const prev = streamPts[Math.max(0, i - 1)];
    const next = streamPts[Math.min(streamPts.length - 1, i + 1)];
    let tx = next.x - prev.x, tz = next.z - prev.z;
    const len = Math.hypot(tx, tz) || 1;
    tx /= len; tz /= len;
    const nx = -tz, nz = tx;
    const half = 1.5 + Math.sin(i * 0.4) * 0.45;
    if (i > 0) run += Math.hypot(p.x - streamPts[i - 1].x, p.z - streamPts[i - 1].z);
    const lx = p.x + nx * half, lz = p.z + nz * half;
    const rx = p.x - nx * half, rz = p.z - nz * half;
    spos.push(lx, H(lx, lz) + 0.16, lz, rx, H(rx, rz) + 0.16, rz);
    suv.push(0, run * 0.1, 1, run * 0.1);
    if (i < streamPts.length - 1) { const b = i * 2; sidx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
  }
  const sgeo = new THREE.BufferGeometry();
  sgeo.setAttribute('position', new THREE.Float32BufferAttribute(spos, 3));
  sgeo.setAttribute('uv', new THREE.Float32BufferAttribute(suv, 2));
  sgeo.setIndex(sidx);
  sgeo.computeVertexNormals();
  const streamU = {
    uTime: { value: 0 },
    uOpacity: { value: 0.82 },
    uTint: { value: new THREE.Color('#9dc6de') }
  };
  const stream = new THREE.Mesh(sgeo, waterMaterial(FALL_FRAG, streamU));
  stream.renderOrder = 4;
  group.add(stream);

  /* day → night: moonlit water is cooler, darker and calmer */
  const DAY_DEEP = new THREE.Color('#1d4356'), NIGHT_DEEP = new THREE.Color('#122438');
  const DAY_FOAM = new THREE.Color('#eaf6ff'), NIGHT_FOAM = new THREE.Color('#9fb6d4');

  return {
    group,
    streamPts,                      // so the road can be bridged where they meet
    lip: new THREE.Vector3(cos * rLip, yLip, sin * rLip),
    pool: new THREE.Vector3(poolX, poolY, poolZ),
    update(t, mix) {
      for (const s of sheets) {
        s.u.uTime.value = t * s.speedScale;
        s.u.uOpacity.value = s.base * (1 - mix * 0.22);
      }
      streamU.uTime.value = t * 0.45;
      streamU.uOpacity.value = 0.8 - mix * 0.2;
      poolU.uTime.value = t;
      poolU.uOpacity.value = 0.9 - mix * 0.18;
      poolU.uDeep.value.lerpColors(DAY_DEEP, NIGHT_DEEP, mix);
      poolU.uFoam.value.lerpColors(DAY_FOAM, NIGHT_FOAM, mix);

      for (const s of spray) {
        const k = (t * s.speed + s.phase / 6.283) % 1;
        s.sprite.position.set(
          poolX - cos * (1.2 + k * s.spread),
          poolY + 0.6 + k * (5 + s.lift),
          poolZ - sin * (1.2 + k * s.spread) + Math.sin(t * 0.6 + s.phase) * 1.6
        );
        s.sprite.material.opacity = (1 - k) * (0.42 - mix * 0.14);
        s.sprite.scale.setScalar((3.4 + k * 5) * (1 + s.lift * 0.1));
      }
    }
  };
}
