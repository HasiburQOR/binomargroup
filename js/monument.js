/* =============================================================
   BINOMAR GROUP — the plaza monument
   -------------------------------------------------------------
   The landmark at dead centre, read from the ground up: a stepped
   stone plinth, a shaft, a four-faced illuminated BINOMAR GROUP
   sign so the name is legible from every approach, and an
   armillary sphere crowning it that turns slowly all day.
   Uplights wash the stone once the sun is off it.
   ============================================================= */
import * as THREE from 'three';
import { makeMarquee } from './city-build.js';

function signTexture(label, sub, accentHex) {
  const W = 1024, H = 320;
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
  /* shrink until the name actually fits — at 112px "BINOMAR GROUP" runs
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


/* a clock dial — brass numerals, hands fixed at a pleasant hour */
function clockFace(accentHex) {
  const px = 512;
  const c = document.createElement('canvas'); c.width = c.height = px;
  const x = c.getContext('2d');
  const accent = new THREE.Color(accentHex);
  const g = x.createRadialGradient(px / 2, px * 0.42, px * 0.1, px / 2, px / 2, px / 2);
  g.addColorStop(0, '#f7f3e6');
  g.addColorStop(1, '#ddd6c2');
  x.fillStyle = g;
  x.beginPath(); x.arc(px / 2, px / 2, px / 2, 0, Math.PI * 2); x.fill();

  x.translate(px / 2, px / 2);
  x.strokeStyle = '#2b3242';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const long = i % 3 === 0;
    x.lineWidth = long ? 16 : 8;
    x.beginPath();
    x.moveTo(Math.cos(a) * px * 0.40, Math.sin(a) * px * 0.40);
    x.lineTo(Math.cos(a) * (long ? px * 0.31 : px * 0.35), Math.sin(a) * (long ? px * 0.31 : px * 0.35));
    x.stroke();
  }
  x.strokeStyle = '#1d2330';
  x.lineCap = 'round';
  x.lineWidth = 22;                                   // hour hand, at ten past ten
  x.beginPath(); x.moveTo(0, 0);
  x.lineTo(Math.cos(-2.62) * px * 0.2, Math.sin(-2.62) * px * 0.2); x.stroke();
  x.lineWidth = 14;                                   // minute hand
  x.beginPath(); x.moveTo(0, 0);
  x.lineTo(Math.cos(-0.52) * px * 0.31, Math.sin(-0.52) * px * 0.31); x.stroke();
  x.fillStyle = '#' + accent.getHexString();
  x.beginPath(); x.arc(0, 0, 18, 0, Math.PI * 2); x.fill();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function makeMonument(opts = {}) {
  const group = new THREE.Group();
  const signMats = [], lampMats = [];

  const stone = new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.62, metalness: 0.06 });
  const stoneDark = new THREE.MeshStandardMaterial({ color: '#94a2b6', roughness: 0.75 });
  const metal = new THREE.MeshStandardMaterial({ color: '#8d9cb4', roughness: 0.32, metalness: 0.82 });
  const brass = new THREE.MeshStandardMaterial({ color: '#c9a44e', roughness: 0.34, metalness: 0.85 });

  /* ---- stepped plinth ---- */
  let y = 0;
  for (const [rt, rb, h] of [[6.4, 6.8, 0.55], [5.4, 5.8, 0.5], [4.5, 4.8, 0.45]]) {
    const step = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 32), stone);
    step.position.y = y + h / 2;
    step.receiveShadow = step.castShadow = true;
    group.add(step);
    y += h;
  }
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(2.9, 3.3, 2.1, 24), stoneDark);
  drum.position.y = y + 1.05;
  drum.castShadow = true;
  group.add(drum);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.0, 0.4, 24), stone);
  cap.position.y = y + 2.3;
  group.add(cap);
  y += 2.5;

  /* ---- uplights ringing the drum ---- */
  const upMat = new THREE.MeshStandardMaterial({
    color: '#ffe6b4', emissive: new THREE.Color('#ffca7a'), emissiveIntensity: 0
  });
  lampMats.push(upMat);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    const hx = Math.cos(a) * 3.9, hz = Math.sin(a) * 3.9;
    const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.3, 8), stoneDark);
    housing.position.set(hx, 1.72, hz);
    group.add(housing);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.06, 8), upMat);
    lens.position.set(hx, 1.89, hz);
    group.add(lens);
  }

  /* ---- buttresses spurring off the plinth ---- */
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const spur = new THREE.Mesh(new THREE.BoxGeometry(1.0, 3.4, 2.4), stone);
    spur.position.set(Math.cos(a) * 2.5, y + 1.3, Math.sin(a) * 2.5);
    spur.rotation.y = -a;
    spur.castShadow = true;
    group.add(spur);
    const ramp = new THREE.Mesh(new THREE.ConeGeometry(1.1, 1.7, 4), stoneDark);
    ramp.rotation.y = Math.PI / 4;
    ramp.position.set(Math.cos(a) * 2.5, y + 3.85, Math.sin(a) * 2.5);
    ramp.scale.set(0.64, 1, 1.5);
    ramp.rotation.z = 0;
    group.add(ramp);
    const boss = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), brass);
    boss.position.set(Math.cos(a) * 3.3, y + 2.6, Math.sin(a) * 3.3);
    group.add(boss);
  }

  /* ---- the shaft: a fluted octagonal column with a gallery ---- */
  const shaftH = 16.4;
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(1.42, 1.92, shaftH, 8, 1), stone);
  shaft.position.y = y + shaftH / 2;
  shaft.castShadow = shaft.receiveShadow = true;
  group.add(shaft);

  /* flutes: a slim rib on each of the eight faces, tapering with the column */
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const flute = new THREE.Mesh(
      new THREE.CylinderGeometry(0.17, 0.22, shaftH * 0.96, 6), stoneDark);
    flute.position.set(Math.cos(a) * 1.58, y + shaftH / 2, Math.sin(a) * 1.58);
    flute.rotation.z = -0.03;
    group.add(flute);
  }

  /* arched niches around the lower shaft, each with a lit lamp inside */
  const nicheMat = new THREE.MeshStandardMaterial({
    color: '#3a4252', roughness: 0.9
  });
  const nicheLamp = new THREE.MeshStandardMaterial({
    color: '#ffe3ae', emissive: new THREE.Color('#ffc776'), emissiveIntensity: 0
  });
  lampMats.push(nicheLamp);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const nx = Math.cos(a) * 1.68, nz = Math.sin(a) * 1.68;
    const niche = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.9, 4, 10), nicheMat);
    niche.position.set(nx, y + shaftH * 0.24, nz);
    group.add(niche);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 8), nicheLamp);
    glow.position.set(Math.cos(a) * 1.78, y + shaftH * 0.21, Math.sin(a) * 1.78);
    group.add(glow);
  }

  /* three brass belts and the moulded base of the column */
  for (const k of [0.3, 0.55, 0.78]) {
    const belt = new THREE.Mesh(
      new THREE.CylinderGeometry(1.9 - k * 0.42, 1.92 - k * 0.42, k === 0.55 ? 0.34 : 0.2, 16), brass);
    belt.position.y = y + shaftH * k;
    group.add(belt);
  }
  const torus = new THREE.Mesh(new THREE.TorusGeometry(1.94, 0.22, 8, 24), stone);
  torus.rotation.x = Math.PI / 2;
  torus.position.y = y + 0.24;
  group.add(torus);

  /* a clock on the upper shaft, facing four ways — every civic tower has one */
  const clockTex = clockFace(opts.accent || '#38bdf8');
  const clockMat = new THREE.MeshStandardMaterial({
    map: clockTex, emissiveMap: clockTex, emissive: new THREE.Color('#ffffff'),
    emissiveIntensity: 0.05, roughness: 0.4
  });
  signMats.push(clockMat);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const surround = new THREE.Mesh(new THREE.CylinderGeometry(0.92, 0.92, 0.24, 20), brass);
    surround.rotation.x = Math.PI / 2;
    surround.rotation.z = -a;
    surround.position.set(Math.cos(a) * 1.52, y + shaftH * 0.87, Math.sin(a) * 1.52);
    surround.rotation.set(Math.PI / 2, 0, 0);
    surround.lookAt(Math.cos(a) * 9, y + shaftH * 0.87, Math.sin(a) * 9);
    group.add(surround);
    const dial = new THREE.Mesh(new THREE.CircleGeometry(0.78, 24), clockMat);
    dial.position.set(Math.cos(a) * 1.66, y + shaftH * 0.87, Math.sin(a) * 1.66);
    dial.lookAt(Math.cos(a) * 9, y + shaftH * 0.87, Math.sin(a) * 9);
    group.add(dial);
  }

  /* the gallery: a balcony ring under the sign, on eight corbels */
  const galleryY = y + shaftH;
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.0, 0.34, 24), stone);
  deck.position.y = galleryY;
  deck.castShadow = true;
  group.add(deck);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const brack = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.9, 1.1), stoneDark);
    brack.position.set(Math.cos(a) * 2.35, galleryY - 0.5, Math.sin(a) * 2.35);
    brack.rotation.y = -a;
    brack.rotation.x = 0.42;
    group.add(brack);
  }
  const rail = new THREE.Mesh(new THREE.TorusGeometry(3.24, 0.07, 6, 32), brass);
  rail.rotation.x = Math.PI / 2;
  rail.position.y = galleryY + 0.82;
  group.add(rail);
  const midRail = new THREE.Mesh(new THREE.TorusGeometry(3.24, 0.045, 6, 32), brass);
  midRail.rotation.x = Math.PI / 2;
  midRail.position.y = galleryY + 0.44;
  group.add(midRail);
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const baluster = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.8, 6), brass);
    baluster.position.set(Math.cos(a) * 3.24, galleryY + 0.42, Math.sin(a) * 3.24);
    group.add(baluster);
  }
  /* four lamps on the gallery rail */
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.9, 6), brass);
    post.position.set(Math.cos(a) * 3.24, galleryY + 1.25, Math.sin(a) * 3.24);
    group.add(post);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), nicheLamp);
    orb.position.set(Math.cos(a) * 3.24, galleryY + 1.78, Math.sin(a) * 3.24);
    group.add(orb);
  }
  y = galleryY + 0.5;

  /* ---- the four-faced sign: the name reads from every approach ---- */
  const signW = 8.6, signH = 2.9;
  const tex = signTexture(opts.label || 'BINOMAR GROUP', opts.sub || 'COMPANY DISTRICT', opts.accent || '#38bdf8');
  const signMat = new THREE.MeshStandardMaterial({
    map: tex, emissiveMap: tex, emissive: new THREE.Color('#ffffff'),
    emissiveIntensity: 0.06, roughness: 0.55
  });
  signMats.push(signMat);
  const edgeMat = new THREE.MeshStandardMaterial({ color: '#0e1524', roughness: 0.7 });
  const signBox = new THREE.Mesh(
    new THREE.BoxGeometry(signW, signH, signW),
    [signMat, signMat, edgeMat, edgeMat, signMat, signMat]);
  signBox.position.y = y + signH / 2 + 0.45;
  signBox.castShadow = true;
  group.add(signBox);

  for (const oy of [y + 0.2, y + signH + 0.7]) {         // cornices
    const band = new THREE.Mesh(new THREE.BoxGeometry(signW + 0.8, 0.36, signW + 0.8), stoneDark);
    band.position.y = oy;
    band.castShadow = true;
    group.add(band);
  }

  /* marquee bulbs chasing around both rims — one instanced mesh, one call */
  const bulbs = [];
  const perSide = 9;
  for (const oy of [y + 0.05, y + signH + 0.9]) {
    for (let side = 0; side < 4; side++) {
      for (let i = 0; i < perSide; i++) {
        const t = (i + 0.5) / perSide - 0.5;
        const e = signW / 2 + 0.42;
        const p = t * (signW + 0.8);
        bulbs.push(side === 0 ? [p, oy, e]
                 : side === 1 ? [e, oy, -p]
                 : side === 2 ? [-p, oy, -e]
                 : [-e, oy, p]);
      }
    }
  }
  const marquee = makeMarquee(bulbs, 0.15, '#ffe3ae', '#9fdcff');
  group.add(marquee.mesh);

  y += signH + 1.1;

  /* ---- the armillary sphere crowning it ---- */
  const armillary = new THREE.Group();
  armillary.position.y = y + 3.3;

  const gtex = globeTexture();
  const globeMat = new THREE.MeshStandardMaterial({
    map: gtex, emissiveMap: gtex, emissive: new THREE.Color('#5d8fb8'),
    emissiveIntensity: 0.28, roughness: 0.34, metalness: 0.25
  });
  signMats.push(globeMat);
  const globe = new THREE.Mesh(new THREE.SphereGeometry(1.75, 32, 24), globeMat);
  globe.rotation.z = 0.36;                        // tipped to match the axis
  globe.castShadow = true;
  armillary.add(globe);

  const rings = new THREE.Group();
  const tilts = [[0, 0, 0], [Math.PI / 2, 0, 0.34], [Math.PI / 2, Math.PI / 2, -0.28]];
  for (let i = 0; i < tilts.length; i++) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.55 + i * 0.16, 0.1, 10, 56),
      i === 1 ? brass : metal);
    ring.rotation.set(tilts[i][0], tilts[i][1], tilts[i][2]);
    ring.castShadow = true;
    rings.add(ring);
  }
  const axis = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 6.4, 8), brass);
  axis.rotation.z = 0.36;
  rings.add(axis);
  armillary.add(rings);
  group.add(armillary);

  /* ---- a glass lantern crowning the whole thing ---- */
  const lanternGlass = new THREE.MeshStandardMaterial({
    color: '#cfeaff', emissive: new THREE.Color('#bfe4ff'), emissiveIntensity: 0.4,
    roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.55
  });
  lanternGlass.userData.noDim = true;
  signMats.push(lanternGlass);
  const beaconY = y + 7.6;
  const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.72, 1.5, 10), lanternGlass);
  cage.position.y = beaconY;
  group.add(cage);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.6, 4), brass);
    bar.position.set(Math.cos(a) * 0.68, beaconY, Math.sin(a) * 0.68);
    group.add(bar);
  }
  const roofCone = new THREE.Mesh(new THREE.ConeGeometry(0.92, 0.85, 10), brass);
  roofCone.position.y = beaconY + 1.1;
  group.add(roofCone);
  const spike = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 1.5, 6), brass);
  spike.position.y = beaconY + 2.1;
  group.add(spike);

  const beaconMat = new THREE.MeshStandardMaterial({
    color: '#fff4d8', emissive: new THREE.Color('#ffe0a0'), emissiveIntensity: 0.9, roughness: 0.3
  });
  lampMats.push(beaconMat);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.4, 14, 10), beaconMat);
  beacon.position.y = beaconY;
  group.add(beacon);

  /* ---- four lanterns on the plinth corners ---- */
  const lanternMat = new THREE.MeshStandardMaterial({
    color: '#ffe0aa', emissive: new THREE.Color('#ffc46a'), emissiveIntensity: 0
  });
  lampMats.push(lanternMat);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const px = Math.cos(a) * 6.0, pz = Math.sin(a) * 6.0;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 2.4, 8), stoneDark);
    post.position.set(px, 2.75, pz);
    post.castShadow = true;
    group.add(post);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.38, 12, 10), lanternMat);
    orb.position.set(px, 4.2, pz);
    group.add(orb);
    const finial = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.3, 8), metal);
    finial.position.set(px, 4.62, pz);
    group.add(finial);
  }

  return { group, signMats, lampMats, marquee: marquee.material, armillary, rings, globe, beacon, height: y + 9.8 };
}
