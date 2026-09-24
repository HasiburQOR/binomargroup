/* =============================================================
   BINOMAR GROUP — architectural detail
   -------------------------------------------------------------
   The things that turn a box with a roof on it into a building
   somebody lives or works in: shingles, dormers, porches,
   smoking chimneys, cottage gardens, lit tower crowns and
   rooftop plant.

   Every helper takes a `ctx` from city-build.js carrying the
   building's dimensions plus the arrays that the day/night
   system reads (`window`, `blink`, `smoke`).
   ============================================================= */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { warmGlowTexture } from './cozy.js';

/* materials flagged this way keep their own opacity — the industry
   dimmer in city.js skips them instead of forcing them opaque */
function noDim(mat) { mat.userData.noDim = true; return mat; }

/* ---------- roof shingles ------------------------------------------------ */
export function shingleTexture(colorHex, seed, rand) {
  const px = 256;
  const c = document.createElement('canvas'); c.width = c.height = px;
  const g = c.getContext('2d');
  const base = new THREE.Color(colorHex);
  g.fillStyle = '#' + base.clone().multiplyScalar(0.75).getHexString();
  g.fillRect(0, 0, px, px);

  const rowH = 15, tileW = 19;
  for (let y = -rowH, row = 0; y < px + rowH; y += rowH, row++) {
    const off = (row % 2) * (tileW / 2);
    for (let x = -tileW; x < px + tileW; x += tileW) {
      const k = 0.78 + rand() * 0.40;
      g.fillStyle = '#' + base.clone().multiplyScalar(k).getHexString();
      g.beginPath();
      const bx = x + off, by = y;
      g.moveTo(bx + 1, by);
      g.lineTo(bx + tileW - 1, by);
      g.lineTo(bx + tileW - 1, by + rowH - 5);
      g.quadraticCurveTo(bx + tileW / 2, by + rowH + 2.5, bx + 1, by + rowH - 5);
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.22)';
      g.lineWidth = 1.2;
      g.stroke();
    }
    g.fillStyle = 'rgba(0,0,0,0.14)';           // shadow under each course
    g.fillRect(0, y + rowH - 5, px, 2.5);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ---------- chimney smoke ------------------------------------------------
   Puffs that rise, swell, lean downwind and dissolve. city.js drives
   them from the same gust value as the trees. */
export function makeSmoke(rand, count = 6) {
  const group = new THREE.Group();
  const puffs = [];
  for (let i = 0; i < count; i++) {
    const mat = noDim(new THREE.MeshStandardMaterial({
      color: '#d8d4cc', roughness: 1, transparent: true, opacity: 0, depthWrite: false
    }));
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 0), mat);
    mesh.renderOrder = 4;
    group.add(mesh);
    puffs.push({ mesh, mat, phase: i / count + rand() * 0.06, speed: 0.13 + rand() * 0.05 });
  }
  group.userData.puffs = puffs;
  return group;
}

/* ---------- pitched-roof extras: dormers, finial, weathervane ------------ */
export function addRoofDetails(group, ctx) {
  const { w, d, totalH, roofH, rand, stoneMat, woodMat, windowMats, smoke } = ctx;

  /* dormer windows poking out of the front slope */
  const dormers = w > 11 ? 3 : 2;
  const paneMat = new THREE.MeshStandardMaterial({
    color: '#3a3f4d', roughness: 0.4,
    emissive: new THREE.Color('#ffca7a'), emissiveIntensity: 0.05
  });
  windowMats.push(paneMat);
  for (let i = 0; i < dormers; i++) {
    const t = dormers === 1 ? 0.5 : i / (dormers - 1);
    const dx = (t - 0.5) * w * 0.58;
    const dy = totalH + roofH * 0.30;
    const dz = d * 0.5 - roofH * 0.30 * (d / 2) / roofH;   // ride the slope
    const dor = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.25, 1.15, 1.35), ctx.wallMat || woodMat);
    body.castShadow = true;
    dor.add(body);
    const pane = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.70, 0.1), paneMat);
    pane.position.set(0, 0.06, 0.70);
    dor.add(pane);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.9, 0.07), woodMat);
    frame.position.set(0, 0.06, 0.66);
    dor.add(frame);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1.05, 0.72, 4), ctx.roofMat);
    cap.rotation.y = Math.PI / 4;
    cap.position.y = 0.88;
    cap.castShadow = true;
    dor.add(cap);
    dor.position.set(dx, dy, dz + 0.18);
    group.add(dor);
  }

  /* finial + weathervane on the apex */
  const apex = totalH + roofH;
  const metal = new THREE.MeshStandardMaterial({ color: '#4b5565', roughness: 0.45, metalness: 0.7 });
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.5, 6), metal);
  rod.position.y = apex + 0.72;
  group.add(rod);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), metal);
  ball.position.y = apex + 0.2;
  group.add(ball);

  const vane = new THREE.Group();
  vane.position.y = apex + 1.42;
  const arrowBody = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.05, 0.05), metal);
  vane.add(arrowBody);
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.32, 4), metal);
  head.rotation.z = -Math.PI / 2;
  head.position.x = 0.72;
  vane.add(head);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.03, 0.30), metal);
  tail.position.x = -0.6;
  vane.add(tail);
  for (const [ax, az] of [[0.5, 0], [0, 0.5]]) {               // N–S / E–W cross
    const bar = new THREE.Mesh(new THREE.BoxGeometry(ax ? 0.62 : 0.04, 0.04, az ? 0.62 : 0.04), metal);
    bar.position.y = -0.34;
    vane.add(bar);
  }
  group.add(vane);
  group.userData.vane = vane;

  /* a proper stone chimney, smoking */
  const chX = w * 0.30, chZ = -d * 0.18;
  const chH = roofH * 0.75 + 1.5;
  const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.85, chH, 0.85), stoneMat);
  chimney.position.set(chX, totalH + chH / 2 - 0.2, chZ);
  chimney.castShadow = true;
  group.add(chimney);
  const cap2 = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.2, 1.15), stoneMat);
  cap2.position.set(chX, totalH + chH - 0.2, chZ);
  group.add(cap2);
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.22, 0.45, 8),
    new THREE.MeshStandardMaterial({ color: '#8a5a44', roughness: 1 }));
  pot.position.set(chX, totalH + chH + 0.12, chZ);
  group.add(pot);

  const sm = makeSmoke(rand);
  sm.position.set(chX, totalH + chH + 0.4, chZ);
  group.add(sm);
  smoke.push(sm);
}

/* ---------- porch, shutters, window boxes, hanging sign ------------------ */
export function addPorchAndTrim(group, ctx) {
  const { w, d, plinth, wallH, col, rand, woodMat, windowMats, company } = ctx;
  const front = d / 2;

  /* porch roof on two posts, sheltering the front door */
  const porchMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(ctx.roofColor).multiplyScalar(0.9), roughness: 0.95, flatShading: true
  });
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.16, 1.9), porchMat);
  canopy.position.set(0, plinth + 2.65, front + 0.85);
  canopy.rotation.x = -0.20;
  canopy.castShadow = true;
  group.add(canopy);
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.16, 0.2), woodMat);
  ridge.position.set(0, plinth + 2.78, front + 0.06);
  group.add(ridge);
  for (const px of [-1.4, 1.4]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 2.5, 7), woodMat);
    post.position.set(px, plinth + 1.25, front + 1.6);
    post.castShadow = true;
    group.add(post);
    const brace = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.08, 0.08), woodMat);
    brace.position.set(px - Math.sign(px) * 0.3, plinth + 2.3, front + 1.6);
    brace.rotation.z = -Math.sign(px) * 0.7;
    group.add(brace);
  }

  /* lantern hanging under the porch */
  const lanternMat = new THREE.MeshStandardMaterial({
    color: '#ffdca0', emissive: new THREE.Color('#ffc46a'), emissiveIntensity: 0.05
  });
  windowMats.push(lanternMat);
  const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.34, 0.26), lanternMat);
  lantern.position.set(0, plinth + 2.25, front + 0.85);
  group.add(lantern);
  const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.3, 4), woodMat);
  wire.position.set(0, plinth + 2.52, front + 0.85);
  group.add(wire);

  /* the light the porch lantern actually throws — a small warm pool on
     the path, and a bloom around the lantern itself */
  if (ctx.glowMats) {
    const poolMat = noDim(new THREE.MeshBasicMaterial({
      map: warmGlowTexture(), color: new THREE.Color('#ffb15e'),
      transparent: true, opacity: 0, fog: false,
      depthWrite: false, blending: THREE.AdditiveBlending
    }));
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 6.5), poolMat);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(0, 0.12, front + 1.6);
    pool.renderOrder = 2;
    group.add(pool);
    ctx.glowMats.push({ m: poolMat, k: 0.46 });

    const bloomMat = noDim(new THREE.SpriteMaterial({
      map: warmGlowTexture(), transparent: true, opacity: 0, fog: false,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    const bloom = new THREE.Sprite(bloomMat);
    bloom.scale.setScalar(2.2);
    bloom.position.set(0, plinth + 2.25, front + 0.85);
    group.add(bloom);
    ctx.glowMats.push({ m: bloomMat, k: 0.7 });
  }

  /* shutters either side of the door */
  const shutterMat = new THREE.MeshStandardMaterial({
    color: col.clone().lerp(new THREE.Color('#1d2a3a'), 0.42), roughness: 0.85
  });
  for (const sx of [-1.05, 1.05]) {
    const sh = new THREE.Mesh(new THREE.BoxGeometry(0.42, 2.0, 0.08), shutterMat);
    sh.position.set(sx, plinth + 1.1, front + 0.07);
    group.add(sh);
    for (let i = 0; i < 4; i++) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.06, 0.03), woodMat);
      slat.position.set(sx, plinth + 0.45 + i * 0.42, front + 0.12);
      group.add(slat);
    }
  }

  /* flower boxes under the upper windows */
  const petals = ['#e2658e', '#f0a35e', '#ffffff', '#c084fc'];
  const boxY = plinth + wallH * 0.62;
  for (const fx of [-w * 0.26, w * 0.26]) {
    const fb = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.3, 0.4), woodMat);
    fb.position.set(fx, boxY, front + 0.2);
    group.add(fb);
    for (let i = 0; i < 5; i++) {
      const fl = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 0),
        new THREE.MeshStandardMaterial({
          color: petals[Math.floor(rand() * petals.length)], roughness: 0.8, flatShading: true
        }));
      fl.position.set(fx - 0.5 + i * 0.25, boxY + 0.22, front + 0.2 + (rand() - 0.5) * 0.12);
      group.add(fl);
    }
  }

  /* wrought-iron bracket carrying a hanging sign with the initial */
  const iron = new THREE.MeshStandardMaterial({ color: '#2f3846', roughness: 0.5, metalness: 0.6 });
  const armX = -w / 2 - 0.05;
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 1.25), iron);
  arm.position.set(armX, plinth + 2.5, front - 0.6);
  arm.rotation.y = Math.PI / 2;
  arm.position.set(armX - 0.6, plinth + 2.5, front - 0.6);
  group.add(arm);
  const stay = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.75), iron);
  stay.position.set(armX - 0.32, plinth + 2.25, front - 0.6);
  stay.rotation.z = 0;
  stay.rotation.y = Math.PI / 2;
  stay.rotation.x = 0.7;
  group.add(stay);

  const initial = (company.name || '?').trim().charAt(0).toUpperCase();
  const sc = document.createElement('canvas'); sc.width = sc.height = 128;
  const sg = sc.getContext('2d');
  sg.fillStyle = '#' + col.clone().multiplyScalar(0.55).getHexString();
  sg.fillRect(0, 0, 128, 128);
  sg.strokeStyle = '#f5e8cf'; sg.lineWidth = 7; sg.strokeRect(8, 8, 112, 112);
  sg.fillStyle = '#f7ecd8';
  sg.font = '700 78px "Plus Jakarta Sans", system-ui, sans-serif';
  sg.textAlign = 'center'; sg.textBaseline = 'middle';
  sg.fillText(initial, 64, 70);
  const stex = new THREE.CanvasTexture(sc);
  stex.colorSpace = THREE.SRGBColorSpace;
  const signMat = new THREE.MeshStandardMaterial({
    map: stex, roughness: 0.7, side: THREE.DoubleSide,
    emissiveMap: stex, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.05
  });
  windowMats.push(signMat);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.06), signMat);
  plate.position.set(armX - 1.05, plinth + 2.0, front - 0.6);
  plate.rotation.y = Math.PI / 2;
  group.add(plate);
}

/* ---------- the cottage garden ------------------------------------------- */
export function addGarden(group, ctx) {
  const { w, d, rand, woodMat } = ctx;
  const front = d / 2;

  const hedgeMat = new THREE.MeshStandardMaterial({ color: '#3f7a43', roughness: 1, flatShading: true });
  const stoneMat2 = new THREE.MeshStandardMaterial({ color: '#9b978d', roughness: 1, flatShading: true });
  const picketMat = new THREE.MeshStandardMaterial({ color: '#e7e0d2', roughness: 0.9 });

  /* picket fence across the frontage, with a gap for the path — merged
     into one geometry so forty pickets cost one draw call */
  const fenceZ = front + 3.4;
  const halfW = w * 0.62;
  const parts = [];
  const push = (geo, x, y, z) => { geo.translate(x, y, z); parts.push(geo); };
  for (let x = -halfW; x <= halfW + 0.01; x += 0.42) {
    if (Math.abs(x) < 1.1) continue;                       // gateway
    push(new THREE.BoxGeometry(0.12, 0.85, 0.07), x, 0.42, fenceZ);
    push(new THREE.ConeGeometry(0.09, 0.16, 4), x, 0.92, fenceZ);
  }
  for (const side of [-1, 1]) {
    push(new THREE.BoxGeometry(halfW - 1.1, 0.09, 0.05),
      side * (halfW + 1.1) / 2, 0.62, fenceZ - 0.05);
  }
  const fence = new THREE.Mesh(mergeGeometries(parts), picketMat);
  group.add(fence);
  for (const g of parts) g.dispose();

  /* stepping stones from the gate to the door */
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.44, 0.1, 7), stoneMat2);
    s.position.set((rand() - 0.5) * 0.4, 0.05, front + 0.7 + i * 0.66);
    s.rotation.y = rand() * 3;
    s.receiveShadow = true;
    group.add(s);
  }

  /* hedges tucked against the walls */
  for (const hx of [-w * 0.38, w * 0.38]) {
    const hedge = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.72, 1.0), hedgeMat);
    hedge.position.set(hx, 0.36, front + 1.5);
    hedge.castShadow = true;
    group.add(hedge);
    for (let i = 0; i < 3; i++) {
      const tuft = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 0), hedgeMat);
      tuft.position.set(hx + (rand() - 0.5) * 1.2, 0.76, front + 1.5 + (rand() - 0.5) * 0.7);
      group.add(tuft);
    }
  }

  /* rain barrel at the corner of the house */
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.38, 0.95, 12), woodMat);
  barrel.position.set(-w / 2 - 0.55, 0.48, front - 1.4);
  barrel.castShadow = true;
  group.add(barrel);
  for (const by of [0.24, 0.72]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.035, 5, 14),
      new THREE.MeshStandardMaterial({ color: '#57606e', roughness: 0.5, metalness: 0.6 }));
    band.rotation.x = Math.PI / 2;
    band.position.set(-w / 2 - 0.55, by, front - 1.4);
    group.add(band);
  }
  const water = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.06, 12),
    new THREE.MeshStandardMaterial({ color: '#2f4a5c', roughness: 0.15, metalness: 0.3 }));
  water.position.set(-w / 2 - 0.55, 0.95, front - 1.4);
  group.add(water);

  /* a bench by the path */
  const bench = new THREE.Group();
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 0.5), woodMat);
  seat.position.y = 0.45;
  bench.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.42, 0.08), woodMat);
  back.position.set(0, 0.7, -0.21);
  bench.add(back);
  for (const lx of [-0.65, 0.65]) {
    for (const lz of [-0.18, 0.18]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.45, 0.09), woodMat);
      leg.position.set(lx, 0.22, lz);
      bench.add(leg);
    }
  }
  bench.position.set(w * 0.42, 0, front + 2.3);
  bench.rotation.y = -0.5;
  bench.castShadow = true;
  group.add(bench);

  /* firewood stacked under the eaves */
  const logEnd = new THREE.MeshStandardMaterial({ color: '#c39a67', roughness: 1 });
  const logGeo = new THREE.CylinderGeometry(0.13, 0.13, 1.3, 7);
  logGeo.rotateZ(Math.PI / 2);
  for (let row = 0; row < 3; row++) {
    const n = 4 - row;
    for (let i = 0; i < n; i++) {
      const log = new THREE.Mesh(logGeo, [woodMat, logEnd, logEnd]);
      log.position.set(w / 2 + 0.85, 0.13 + row * 0.25, -0.6 + (i - (n - 1) / 2) * 0.28);
      group.add(log);
    }
  }

  /* mailbox at the gate */
  const postM = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 1.1, 6), woodMat);
  postM.position.set(1.5, 0.55, fenceZ);
  group.add(postM);
  const boxM = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.28, 0.32),
    new THREE.MeshStandardMaterial({ color: '#b4553a', roughness: 0.7 }));
  boxM.position.set(1.5, 1.2, fenceZ);
  boxM.castShadow = true;
  group.add(boxM);
}

/* ---------- modern tower crown + lit lobby ------------------------------- */
export function addModernCrown(group, ctx) {
  const { w, d, height, floors, col, windowMats, blink } = ctx;

  /* a glowing band wrapping the top two metres of the shaft */
  const bandMat = new THREE.MeshStandardMaterial({
    color: col.clone().multiplyScalar(0.5), roughness: 0.4, metalness: 0.3,
    emissive: col.clone(), emissiveIntensity: 0.05
  });
  windowMats.push(bandMat);
  const band = new THREE.Mesh(new THREE.BoxGeometry(w + 0.28, 0.55, d + 0.28), bandMat);
  band.position.y = height - 1.0;
  group.add(band);

  /* cornice slab so the roofline reads as deliberate */
  const corniceMat = new THREE.MeshStandardMaterial({
    color: col.clone().multiplyScalar(0.38), roughness: 0.75
  });
  const cornice = new THREE.Mesh(new THREE.BoxGeometry(w + 0.7, 0.35, d + 0.7), corniceMat);
  cornice.position.y = height + 0.12;
  cornice.castShadow = true;
  group.add(cornice);

  /* vertical mullion fins — cheap, but they give the facade rhythm */
  const finMat = new THREE.MeshStandardMaterial({
    color: col.clone().lerp(new THREE.Color('#e8eef7'), 0.55), roughness: 0.45, metalness: 0.4
  });
  const finN = Math.max(2, Math.round(w / 3.4));
  const finGeo = new THREE.BoxGeometry(0.11, height - 1.4, 0.16);
  for (let i = 1; i < finN; i++) {
    const fx = -w / 2 + (i / finN) * w;
    for (const fz of [d / 2 + 0.05, -d / 2 - 0.05]) {
      const fin = new THREE.Mesh(finGeo, finMat);
      fin.position.set(fx, (height - 1.4) / 2 + 0.4, fz);
      group.add(fin);
    }
  }
  /* matching fins on the short elevations */
  const finGeoZ = new THREE.BoxGeometry(0.16, height - 1.4, 0.11);
  const finNz = Math.max(2, Math.round(d / 3.4));
  for (let i = 1; i < finNz; i++) {
    const fz = -d / 2 + (i / finNz) * d;
    for (const fx of [w / 2 + 0.05, -w / 2 - 0.05]) {
      const fin = new THREE.Mesh(finGeoZ, finMat);
      fin.position.set(fx, (height - 1.4) / 2 + 0.4, fz);
      group.add(fin);
    }
  }
  /* corner pilasters tie the elevations together */
  const pilGeo = new THREE.BoxGeometry(0.3, height - 0.6, 0.3);
  for (const cx of [-w / 2, w / 2]) {
    for (const cz of [-d / 2, d / 2]) {
      const pil = new THREE.Mesh(pilGeo, finMat);
      pil.position.set(cx, (height - 0.6) / 2, cz);
      group.add(pil);
    }
  }

  /* stepped setback for the genuinely tall ones */
  if (floors >= 7) {
    const capMat = new THREE.MeshStandardMaterial({
      color: col.clone().multiplyScalar(0.72), roughness: 0.5, metalness: 0.3
    });
    const s1 = new THREE.Mesh(new THREE.BoxGeometry(w * 0.66, 2.1, d * 0.66), capMat);
    s1.position.y = height + 1.3;
    s1.castShadow = true;
    group.add(s1);
    const s2 = new THREE.Mesh(new THREE.BoxGeometry(w * 0.38, 1.5, d * 0.38), capMat);
    s2.position.y = height + 3.1;
    s2.castShadow = true;
    group.add(s2);
    const mastMat = new THREE.MeshStandardMaterial({ color: '#94a3b8', roughness: 0.4, metalness: 0.7 });
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, 4.6, 6), mastMat);
    mast.position.y = height + 6.1;
    group.add(mast);
    const beaconMat = new THREE.MeshStandardMaterial({
      color: '#f87171', emissive: new THREE.Color('#ff4d4d'), emissiveIntensity: 1.4
    });
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), beaconMat);
    beacon.position.y = height + 8.5;
    group.add(beacon);
    beaconMat.userData.blink = { speed: 2.4, phase: Math.random() * 6.28, base: 2.2 };
    blink.push(beaconMat);
  }
}

/* ---------- modern entrance: steps, lobby glow, planters, bollards ------- */
export function addModernEntrance(group, ctx) {
  const { w, d, col, rand, windowMats, lampMats } = ctx;
  const front = d / 2;

  const stoneMat = new THREE.MeshStandardMaterial({ color: '#9aa2ad', roughness: 0.85 });
  for (let i = 0; i < 3; i++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(w * 0.5 + i * 0.5, 0.16, 0.5 + i * 0.35), stoneMat);
    step.position.set(0, 0.08 + (2 - i) * 0.16, front + 0.6 + i * 0.4);
    step.receiveShadow = true;
    group.add(step);
  }

  /* the lobby: a bright glass band that stays lit long after dark */
  const lobbyMat = new THREE.MeshStandardMaterial({
    color: '#dff0ff', roughness: 0.12, metalness: 0.5,
    emissive: new THREE.Color('#ffeec8'), emissiveIntensity: 0.05
  });
  windowMats.push(lobbyMat);
  const lobby = new THREE.Mesh(new THREE.BoxGeometry(w * 0.66, 2.3, 0.14), lobbyMat);
  lobby.position.set(0, 1.35, front + 0.06);
  group.add(lobby);
  const mull = new THREE.MeshStandardMaterial({ color: '#2b3442', roughness: 0.5, metalness: 0.5 });
  for (let i = -2; i <= 2; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.09, 2.3, 0.2), mull);
    m.position.set(i * (w * 0.66 / 5), 1.35, front + 0.1);
    group.add(m);
  }

  /* planters flanking the doors */
  const plantMat = new THREE.MeshStandardMaterial({ color: '#3f7a43', roughness: 1, flatShading: true });
  for (const px of [-w * 0.34, w * 0.34]) {
    const pot = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.6, 0.85), stoneMat);
    pot.position.set(px, 0.3, front + 1.5);
    pot.castShadow = true;
    group.add(pot);
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28 + rand() * 0.14, 0), plantMat);
      b.position.set(px + (rand() - 0.5) * 0.5, 0.72 + rand() * 0.2, front + 1.5 + (rand() - 0.5) * 0.5);
      group.add(b);
    }
  }

  /* low bollard lights along the approach */
  const bodyMat = new THREE.MeshStandardMaterial({ color: '#3d4655', roughness: 0.6, metalness: 0.4 });
  const capMat = new THREE.MeshStandardMaterial({
    color: '#ffe3ab', emissive: new THREE.Color('#ffcb7a'), emissiveIntensity: 0
  });
  lampMats.push(capMat);
  for (const bx of [-w * 0.24, w * 0.24]) {
    for (let i = 0; i < 2; i++) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.8, 8), bodyMat);
      b.position.set(bx, 0.4, front + 2.4 + i * 1.1);
      group.add(b);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.12, 8), capMat);
      cap.position.set(bx, 0.85, front + 2.4 + i * 1.1);
      group.add(cap);
    }
  }
}

/* ---------- rooftop plant: the machinery every real building carries ----- */
export function addRooftopPlant(group, ctx) {
  const { w, d, height, floors, rand } = ctx;
  const metal = new THREE.MeshStandardMaterial({ color: '#8f98a6', roughness: 0.6, metalness: 0.45 });
  const dark = new THREE.MeshStandardMaterial({ color: '#4a5462', roughness: 0.8 });

  /* air-handling units */
  for (let i = 0; i < 2; i++) {
    const u = new THREE.Mesh(new THREE.BoxGeometry(1.5 + rand(), 0.7, 1.1 + rand() * 0.6), metal);
    u.position.set((i ? 1 : -1) * w * 0.22, height + 0.7, -d * 0.24 + rand() * 0.6);
    u.castShadow = true;
    group.add(u);
    for (let f = 0; f < 2; f++) {
      const fan = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.1, 10), dark);
      fan.position.set(u.position.x + (f - 0.5) * 0.7, height + 1.1, u.position.z);
      group.add(fan);
    }
  }

  /* water tank on a little steel frame */
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 1.15, 12), metal);
  tank.position.set(-w * 0.28, height + 1.55, d * 0.24);
  tank.castShadow = true;
  group.add(tank);
  const lid = new THREE.Mesh(new THREE.ConeGeometry(0.66, 0.3, 12), dark);
  lid.position.set(-w * 0.28, height + 2.25, d * 0.24);
  group.add(lid);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.95, 0.08), dark);
    leg.position.set(-w * 0.28 + Math.cos(a) * 0.45, height + 0.48, d * 0.24 + Math.sin(a) * 0.45);
    group.add(leg);
  }

  /* parapet so the roof has an edge */
  const para = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.42, d + 0.1), dark);
  para.position.y = height + 0.21;
  group.add(para);
  const inner = new THREE.Mesh(new THREE.BoxGeometry(w - 0.5, 0.5, d - 0.5),
    new THREE.MeshStandardMaterial({ color: '#39424f', roughness: 0.95 }));
  inner.position.y = height + 0.2;
  group.add(inner);

  /* helipad on the genuinely tall ones */
  if (floors >= 9) {
    const padC = document.createElement('canvas'); padC.width = padC.height = 128;
    const pg = padC.getContext('2d');
    pg.fillStyle = '#39424f'; pg.fillRect(0, 0, 128, 128);
    pg.strokeStyle = '#f8fafc'; pg.lineWidth = 6;
    pg.beginPath(); pg.arc(64, 64, 48, 0, Math.PI * 2); pg.stroke();
    pg.fillStyle = '#f8fafc';
    pg.font = '700 64px system-ui, sans-serif';
    pg.textAlign = 'center'; pg.textBaseline = 'middle';
    pg.fillText('H', 64, 68);
    const ptex = new THREE.CanvasTexture(padC);
    ptex.colorSpace = THREE.SRGBColorSpace;
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.30, w * 0.30, 0.12, 20),
      [new THREE.MeshStandardMaterial({ color: '#39424f' }),
       new THREE.MeshStandardMaterial({ map: ptex, roughness: 0.9 }),
       new THREE.MeshStandardMaterial({ color: '#39424f' })]);
    pad.position.set(w * 0.16, height + 0.52, d * 0.16);
    group.add(pad);
  }
}
