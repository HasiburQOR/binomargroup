/* =============================================================
   BINOMAR GROUP - the plaza monument: the landmark tower
   -------------------------------------------------------------
   The landmark at dead centre, read from the ground up: a granite
   podium, a low crystal lobby, then the tower itself - a real
   skyscraper model ("Skyscraper" by Poly by Google, CC-BY, kept at
   assets/skyscraper.glb), measured from the file and scaled so its
   roof meets the sign band, and turned so its entrance greets the
   opening camera. One four-faced BINOMAR GROUP sign band caps the
   tower, and above it a slim mast lifts the armillary globe and its
   glass beacon. The model's dark window strips are swapped for warm
   glass that joins the district's day/night window glow; if the file
   ever fails to load, a plain procedural tower stands in so the
   summit is never empty. Uplights wash the stone once the sun is
   off it. Deliberately modest in height: the opening overview still
   frames the entire district on a first visit.
   ============================================================= */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { makeMarquee } from './city-build.js';
import { bake } from './models.js';

function signTexture(label, sub, accentHex, W = 1024) {
  const H = 320;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const accent = new THREE.Color(accentHex);

  const bg = x.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#141d30');
  bg.addColorStop(1, '#080d18');
  x.fillStyle = bg;
  x.fillRect(0, 0, W, H);

  x.strokeStyle = '#' + accent.getHexString();
  x.lineWidth = 12;
  x.strokeRect(16, 16, W - 32, H - 32);
  x.strokeStyle = 'rgba(255,255,255,0.22)';
  x.lineWidth = 3;
  x.strokeRect(38, 38, W - 76, H - 76);

  x.textAlign = 'center';
  x.textBaseline = 'middle';
  try { x.letterSpacing = '10px'; } catch (e) { /* older browsers */ }
  /* shrink until the name actually fits - at 112px "BINOMAR GROUP" runs
     off both ends of the board */
  let fs = 118;
  do {
    x.font = '800 ' + fs + 'px "Plus Jakarta Sans", "Segoe UI", Arial, sans-serif';
    fs -= 4;
  } while (fs > 40 && x.measureText(label).width > W - 150);
  x.shadowColor = '#' + accent.getHexString();
  x.shadowBlur = 34;
  x.fillStyle = '#f6faff';
  x.fillText(label, W / 2, H / 2 - 18);
  x.shadowBlur = 0;

  try { x.letterSpacing = '8px'; } catch (e) { /* older browsers */ }
  x.font = '700 32px "Plus Jakarta Sans", "Segoe UI", Arial, sans-serif';
  x.fillStyle = '#' + accent.clone().lerp(new THREE.Color('#ffffff'), 0.4).getHexString();
  x.fillText(sub, W / 2, H / 2 + 66);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}


/* The HQ's own sign face: one heavy line of lettering filling most of the
   panel, warm white on deep navy inside a gold keyline, at 2x resolution.
   The old two-line board shrank the name to fit a subtitle nobody could
   read from the overview; here the name gets the room. */
function hqSignTexture(label) {
  const W = 2048, H = 660;                          // the panel's own 3:1 proportion
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const bg = x.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0c1630'); bg.addColorStop(1, '#050a18');
  x.fillStyle = bg; x.fillRect(0, 0, W, H);
  x.strokeStyle = '#d9b25e'; x.lineWidth = 18; x.strokeRect(22, 22, W - 44, H - 44);
  x.textAlign = 'center'; x.textBaseline = 'middle';
  try { x.letterSpacing = '14px'; } catch (e) { /* older browsers */ }
  let fs = 360;
  do { x.font = '800 ' + fs + 'px "Plus Jakarta Sans", "Segoe UI", Arial, sans-serif'; fs -= 6; }
  while (fs > 80 && x.measureText(label).width > W * 0.86);
  x.shadowColor = '#ffcf7a'; x.shadowBlur = 40;
  x.fillStyle = '#fff6e2';
  x.fillText(label, W / 2, H * 0.47);
  x.shadowBlur = 0;
  x.fillText(label, W / 2, H * 0.47);
  x.fillStyle = '#d9b25e';                          // a thin gold rule under the name
  x.fillRect(W * 0.3, H * 0.79, W * 0.4, 8);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 16;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

/* A stylised world: a soft ocean gradient, glowing meridians and
   parallels, and loose landmasses. Read at twenty metres it says
   "globe" without pretending to be a map. */
function globeTexture() {
  const W = 1024, H = 512;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');

  const sea = x.createLinearGradient(0, 0, 0, H);
  sea.addColorStop(0, '#0d3f63');
  sea.addColorStop(0.5, '#1b6fa4');
  sea.addColorStop(1, '#0d3f63');
  x.fillStyle = sea;
  x.fillRect(0, 0, W, H);

  /* landmasses: overlapping blobs in a few loose clusters */
  const land = [
    [0.13, 0.32, 0.10], [0.19, 0.46, 0.07], [0.16, 0.60, 0.06],
    [0.31, 0.30, 0.06], [0.46, 0.28, 0.11], [0.52, 0.44, 0.08],
    [0.58, 0.62, 0.07], [0.72, 0.36, 0.09], [0.80, 0.55, 0.06],
    [0.88, 0.30, 0.07], [0.40, 0.72, 0.05], [0.66, 0.20, 0.05]
  ];
  x.fillStyle = '#2f7d4e';
  for (const [u, v, r] of land) {
    const cx = u * W, cy = v * H, rr = r * W;
    x.beginPath();
    for (let i = 0; i <= 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const wob = 0.62 + 0.38 * Math.abs(Math.sin(a * 2.3 + u * 9) * Math.cos(a * 1.7 + v * 7));
      const px = cx + Math.cos(a) * rr * wob;
      const py = cy + Math.sin(a) * rr * wob * 0.8;
      if (i === 0) x.moveTo(px, py); else x.lineTo(px, py);
    }
    x.closePath();
    x.fill();
  }
  /* a paler coastal rim */
  x.globalCompositeOperation = 'source-atop';
  const coast = x.createLinearGradient(0, 0, 0, H);
  coast.addColorStop(0, 'rgba(180,220,190,0.28)');
  coast.addColorStop(0.5, 'rgba(255,255,255,0)');
  coast.addColorStop(1, 'rgba(180,220,190,0.28)');
  x.fillStyle = coast;
  x.fillRect(0, 0, W, H);
  x.globalCompositeOperation = 'source-over';

  /* graticule */
  x.strokeStyle = 'rgba(190,232,255,0.34)';
  x.lineWidth = 2;
  for (let i = 1; i < 12; i++) {
    x.beginPath(); x.moveTo((i / 12) * W, 0); x.lineTo((i / 12) * W, H); x.stroke();
  }
  for (let i = 1; i < 6; i++) {
    x.beginPath(); x.moveTo(0, (i / 6) * H); x.lineTo(W, (i / 6) * H); x.stroke();
  }
  x.strokeStyle = 'rgba(255,229,170,0.6)';        // the equator, picked out
  x.lineWidth = 4;
  x.beginPath(); x.moveTo(0, H / 2); x.lineTo(W, H / 2); x.stroke();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}


/* ---------- the Binomar Group HQ — modelled for the site in Blender -------
   assets/models/hq-binomar.glb (source: blender/binomar-buildings.blend):
   a stone plinth in a reflecting pool, a glass lobby behind gold columns,
   three stepped chamfered glass tiers with champagne-gold collars and warm
   LED strips up every corner, the BINOMAR GROUP sign band above the first
   tier, a glowing lantern crown ringed by gold blades, and a gold spire
   with a red aviation beacon. It is modelled at the size it stands in the
   scene. The sign faces are blank in the file and lettered here, so the
   name stays sharp and follows the site's type. */
export function makeMonument(opts = {}) {
  const b = bake('hq-binomar', { metal: true });
  if (!b) return makeClassicMonument(opts);

  const group = new THREE.Group();
  const signMats = [], lampMats = [], blink = [];
  const tex = hqSignTexture(opts.label || 'BINOMAR GROUP');
  tex.flipY = false;                            // glTF UVs: v runs top-down
  let beacon = null;
  for (const p of b.parts) {
    const m = p.material.clone();
    if (m.name === 'Sign') {
      m.map = tex; m.emissiveMap = tex;
      m.color.set('#ffffff'); m.emissive = new THREE.Color('#ffffff'); m.emissiveIntensity = 0.06;
      m.roughness = 0.55; m.metalness = 0;
      signMats.push(m);
    } else if (m.name === 'Glass_Lit') {
      m.emissive = new THREE.Color('#ffd48a'); m.emissiveIntensity = 0.05;
      signMats.push(m);                         // joins the district's night window glow
    } else if (m.name === 'Edge_Light') {
      m.emissive = new THREE.Color('#ffcf7a'); m.emissiveIntensity = 0;
      lampMats.push(m);                         // the corner LEDs come on with the lamps
    } else if (m.name === 'Beacon') {
      m.emissive = new THREE.Color('#ff3030');
      m.userData.blink = { speed: 1.6, phase: 0, base: 2.4 };
      blink.push(m);
    } else if (m.name === 'Water') {
      m.roughness = 0.04; m.metalness = 0.2; m.envMapIntensity = 1.2;
    }
    const mesh = new THREE.Mesh(p.geometry, m);
    mesh.castShadow = m.name !== 'Water';
    mesh.receiveShadow = true;
    if (m.name === 'Beacon') beacon = mesh;
    group.add(mesh);
  }
  console.info('Binomar tower: Binomar Group HQ (original model)');
  return { group, signMats, lampMats, blink, marquee: null, beacon, height: b.h, fromModel: true };
}

/* ---------- the previous landmark: the stand-in if the HQ model is missing */
function makeClassicMonument(opts = {}) {
  const group = new THREE.Group();
  const signMats = [], lampMats = [];

  const granite = new THREE.MeshStandardMaterial({ color: '#59626f', roughness: 0.34, metalness: 0.15 });
  const graniteDark = new THREE.MeshStandardMaterial({ color: '#3b4350', roughness: 0.5, metalness: 0.1 });
  const brass = new THREE.MeshStandardMaterial({ color: '#c9a44e', roughness: 0.3, metalness: 0.88 });
  const steel = new THREE.MeshStandardMaterial({ color: '#9aa8bc', roughness: 0.3, metalness: 0.85 });

  /* ---- podium: two generous granite steps with a brass reveal ---- */
  let y = 0;
  for (const [rt, rb, h] of [[5.9, 6.3, 0.5], [5.0, 5.3, 0.45]]) {
    const step = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 36), granite);
    step.position.y = y + h / 2;
    step.receiveShadow = step.castShadow = true;
    group.add(step);
    y += h;
  }
  const reveal = new THREE.Mesh(new THREE.TorusGeometry(5.02, 0.06, 6, 48), brass);
  reveal.rotation.x = Math.PI / 2;
  reveal.position.y = y + 0.02;
  group.add(reveal);

  /* ---- the crystal lobby: one low glass hall at the tower's foot ---- */
  const lobbyW = 6.4, lobbyD = 5.6, lobbyH = 2.3;
  const atriumGlass = new THREE.MeshStandardMaterial({
    color: '#c2e2f4', emissive: new THREE.Color('#ffe9c2'), emissiveIntensity: 0.05,
    roughness: 0.14, metalness: 0.35
  });
  signMats.push(atriumGlass);
  const lobby = new THREE.Mesh(new THREE.BoxGeometry(lobbyW, lobbyH, lobbyD), atriumGlass);
  lobby.position.y = y + lobbyH / 2;
  lobby.castShadow = true;
  group.add(lobby);
  /* bronze mullions on the long walls, plus a post at each corner */
  for (const sz of [-lobbyD / 2, lobbyD / 2]) {
    for (let i = 0; i <= 6; i++) {
      const px = (i / 6 - 0.5) * lobbyW;
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, lobbyH, 0.16), brass);
      post.position.set(px, y + lobbyH / 2, sz);
      post.castShadow = true;
      group.add(post);
    }
  }
  for (const sx of [-lobbyW / 2, lobbyW / 2]) {
    for (const sz of [-lobbyD / 2, lobbyD / 2]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, lobbyH, 0.16), brass);
      post.position.set(sx, y + lobbyH / 2, sz);
      post.castShadow = true;
      group.add(post);
    }
  }
  /* brass head and sill around the hall */
  for (const oy of [y + 0.1, y + lobbyH - 0.1]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(lobbyW + 0.2, 0.2, lobbyD + 0.2), brass);
    band.position.y = oy;
    group.add(band);
  }
  y += lobbyH;
  /* transfer slab: the plate the tower rises from */
  const transfer = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.55, 6.4), graniteDark);
  transfer.position.y = y + 0.275;
  transfer.castShadow = true;
  group.add(transfer);
  y += 0.55;

  /* ---- uplights ringing the podium step below the slab ---- */
  const upMat = new THREE.MeshStandardMaterial({
    color: '#ffe6b4', emissive: new THREE.Color('#ffca7a'), emissiveIntensity: 0
  });
  lampMats.push(upMat);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    const hx = Math.cos(a) * 4.35, hz = Math.sin(a) * 4.35;
    const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.28, 8), graniteDark);
    housing.position.set(hx, 1.09, hz);
    group.add(housing);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.06, 8), upMat);
    lens.position.set(hx, 1.26, hz);
    group.add(lens);
  }
  /* ANCHOR: tower */
  /* ---- the tower: the Poly-by-Google skyscraper, scaled to crown height ---- */
  const TOWER_H = 8.2;                        // slab top to sign band - kept modest so the
                                              // opening overview still frames the whole district
  const shaftTop = y + TOWER_H;
  const winMat = new THREE.MeshStandardMaterial({
    color: '#1b2a40', emissive: new THREE.Color('#ffd27a'), emissiveIntensity: 0.05,
    roughness: 0.3, metalness: 0.35
  });
  signMats.push(winMat);                      // joins the district's night window glow

  const towerMount = new THREE.Group();
  towerMount.name = 'BinomarTower';
  {
    const GLB_H = 339.6, GLB_MIN_Y = -1.49;   // measured from the file's accessors
    const S = TOWER_H / GLB_H;
    towerMount.scale.setScalar(S);
    towerMount.position.y = y - GLB_MIN_Y * S;    // the model's own plinth sits on the slab
    towerMount.rotation.y = -Math.PI / 4;         // its entrance corner faces the opening camera
  }
  group.add(towerMount);

  new GLTFLoader().loadAsync('assets/skyscraper.glb').then(gltf => {
    const model = gltf.scene;
    const seen = new Set();
    model.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = o.receiveShadow = true;
      const mats = Array.isArray(o.material) ? o.material.slice() : [o.material];
      for (let i = 0; i < mats.length; i++) {
        const m = mats[i];
        if (seen.has(m)) continue;
        seen.add(m);
        const c = m.color;
        const lum = c ? c.r * 0.3 + c.g * 0.59 + c.b * 0.11 : 1;
        if (lum < 0.09) {
          mats[i] = winMat;                   // the dark strips: window glass, lit after dark
        } else {
          m.metalness = 0.02;                 // obj2gltf lamberts: calm the PBR defaults
          m.roughness = 0.9;
        }
      }
      o.material = mats.length === 1 ? mats[0] : mats;
    });
    towerMount.add(model);
    console.info('Binomar tower: "Skyscraper" by Poly by Google (CC-BY)');
  }).catch(() => {
    /* the model must never leave a hole on the summit - a plain tower stands in */
    console.warn('assets/skyscraper.glb unavailable - standing in a procedural tower');
    const half = 1.78;
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(half * 2, TOWER_H, half * 2),
      [winMat, winMat, graniteDark, graniteDark, winMat, winMat]);
    shaft.position.y = y + TOWER_H / 2;
    shaft.castShadow = shaft.receiveShadow = true;
    group.add(shaft);
    for (const sx of [-half, half]) {
      for (const sz of [-half, half]) {
        const pil = new THREE.Mesh(new THREE.BoxGeometry(0.26, TOWER_H, 0.26), brass);
        pil.position.set(sx, y + TOWER_H / 2, sz);
        pil.castShadow = true;
        group.add(pil);
      }
    }
    const belt = new THREE.Mesh(new THREE.BoxGeometry(half * 2 + 0.32, 0.22, half * 2 + 0.32), brass);
    belt.position.y = y + TOWER_H * 0.45;
    group.add(belt);
  });

  /* ---- the crown: one four-faced sign band on the tower's roof ---- */
  const signW = 5.8, signH = 2.4, signD = 4.6;
  const tex = signTexture(opts.label || 'BINOMAR GROUP', opts.sub || 'COMPANY DISTRICT',
    opts.accent || '#38bdf8', 768);
  const signMat = new THREE.MeshStandardMaterial({
    map: tex, emissiveMap: tex, emissive: new THREE.Color('#ffffff'),
    emissiveIntensity: 0.06, roughness: 0.55
  });
  signMats.push(signMat);
  const edgeMat = new THREE.MeshStandardMaterial({ color: '#0e1524', roughness: 0.7 });
  const signBox = new THREE.Mesh(
    new THREE.BoxGeometry(signW, signH, signD),
    [signMat, signMat, edgeMat, edgeMat, signMat, signMat]);
  signBox.position.y = shaftTop + signH / 2 + 0.45;
  signBox.castShadow = true;
  group.add(signBox);

  for (const oy of [shaftTop + 0.2, shaftTop + signH + 0.7]) {   // cornices
    const band = new THREE.Mesh(new THREE.BoxGeometry(signW + 0.7, 0.34, signD + 0.7), graniteDark);
    band.position.y = oy;
    band.castShadow = true;
    group.add(band);
  }

  /* marquee bulbs chasing around both rims - one instanced mesh, one call */
  const bulbs = [];
  const eX = signW / 2 + 0.42, eZ = signD / 2 + 0.42;
  for (const oy of [shaftTop + 0.05, shaftTop + signH + 0.9]) {
    for (let i = 0; i < 7; i++) {           // the long faces
      const px = ((i + 0.5) / 7 - 0.5) * (signW + 0.8);
      bulbs.push([px, oy, eZ], [px, oy, -eZ]);
    }
    for (let i = 0; i < 5; i++) {           // the short faces
      const pz = ((i + 0.5) / 5 - 0.5) * (signD + 0.8);
      bulbs.push([eX, oy, pz], [-eX, oy, pz]);
    }
  }
  const marquee = makeMarquee(bulbs, 0.15, '#ffe3ae', '#9fdcff');
  group.add(marquee.mesh);

  const bandTop = shaftTop + signH + 1.1;

  /* ---- between the sign band and the beacon: the mast ---- */
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 3.2, 8), steel);
  mast.position.y = bandTop + 1.6;
  group.add(mast);

  /* ---- the armillary sphere, sized to clear the band cornice ---- */
  const armillary = new THREE.Group();
  armillary.position.y = bandTop + 1.7;

  const gtex = globeTexture();
  const globeMat = new THREE.MeshStandardMaterial({
    map: gtex, emissiveMap: gtex, emissive: new THREE.Color('#5d8fb8'),
    emissiveIntensity: 0.28, roughness: 0.34, metalness: 0.25
  });
  signMats.push(globeMat);
  const globe = new THREE.Mesh(new THREE.SphereGeometry(1.2, 32, 24), globeMat);
  globe.rotation.z = 0.36;                        // tipped to match the axis
  globe.castShadow = true;
  armillary.add(globe);

  const rings = new THREE.Group();
  const tilts = [[0, 0, 0], [Math.PI / 2, 0, 0.34], [Math.PI / 2, Math.PI / 2, -0.28]];
  for (let i = 0; i < tilts.length; i++) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.7 + i * 0.13, 0.08, 10, 56),
      i === 1 ? brass : steel);
    ring.rotation.set(tilts[i][0], tilts[i][1], tilts[i][2]);
    ring.castShadow = true;
    rings.add(ring);
  }
  const axis = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 4.4, 8), brass);
  axis.rotation.z = 0.36;
  rings.add(axis);
  armillary.add(rings);
  group.add(armillary);

  /* ---- a glass lantern crowning the mast ---- */
  const lanternGlass = new THREE.MeshStandardMaterial({
    color: '#cfeaff', emissive: new THREE.Color('#bfe4ff'), emissiveIntensity: 0.4,
    roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.55
  });
  lanternGlass.userData.noDim = true;
  signMats.push(lanternGlass);
  const beaconY = bandTop + 4.0;                  // just above the outermost ring
  const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.64, 1.0, 10), lanternGlass);
  cage.position.y = beaconY;
  group.add(cage);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.1, 4), brass);
    bar.position.set(Math.cos(a) * 0.6, beaconY, Math.sin(a) * 0.6);
    group.add(bar);
  }
  const roofCone = new THREE.Mesh(new THREE.ConeGeometry(0.8, 0.6, 10), brass);
  roofCone.position.y = beaconY + 0.75;
  group.add(roofCone);
  const spike = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.8, 6), brass);
  spike.position.y = beaconY + 1.35;
  group.add(spike);

  const beaconMat = new THREE.MeshStandardMaterial({
    color: '#fff4d8', emissive: new THREE.Color('#ffe0a0'), emissiveIntensity: 0.9, roughness: 0.3
  });
  lampMats.push(beaconMat);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.36, 14, 10), beaconMat);
  beacon.position.y = beaconY;
  group.add(beacon);

  /* ---- four slim uplight posts on the podium corners ---- */
  const lanternMat = new THREE.MeshStandardMaterial({
    color: '#ffe0aa', emissive: new THREE.Color('#ffc46a'), emissiveIntensity: 0
  });
  lampMats.push(lanternMat);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const px = Math.cos(a) * 5.5, pz = Math.sin(a) * 5.5;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 1.5, 8), graniteDark);
    post.position.set(px, 1.25, pz);
    post.castShadow = true;
    group.add(post);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.1, 8), brass);
    cap.position.set(px, 2.05, pz);
    group.add(cap);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 10), lanternMat);
    orb.position.set(px, 2.22, pz);
    group.add(orb);
  }

  return { group, signMats, lampMats, marquee: marquee.material, armillary, rings, globe, beacon, height: beaconY + 1.75 };
}


