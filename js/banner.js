/* =============================================================
   BINOMAR GROUP — rooftop name signs
   -------------------------------------------------------------
   A flat board on a roof is unreadable edge-on and mirrored from
   behind, so the name itself is a sprite: it turns to face the
   camera on every frame and reads square-on from any angle. What
   keeps it from looking pasted onto the sky is that it stands on
   the roof — its bottom edge sits on a low pedestal, and when it
   grows with distance it grows upward from there, never lifting
   off the building.

   The card is quiet on purpose: a dark glass face, the brand
   colour in one badge carrying the company initial, the name in
   white, the industry underneath, and a small round "›" on the
   right that says "this opens". No halos, no tails.
   ============================================================= */
import * as THREE from 'three';
import { detectQuality } from './quality.js';

/* supersampling: signs are drawn at 2× on capable devices so the name
   stays sharp when the camera closes in */
let SS = 1;
try { SS = detectQuality().tier === 'high' ? 2 : 1; } catch (e) { /* stay at 1× */ }

function roundRect(x, rx, ry, w, h, r) {
  x.beginPath();
  x.moveTo(rx + r, ry);
  x.arcTo(rx + w, ry, rx + w, ry + h, r);
  x.arcTo(rx + w, ry + h, rx, ry + h, r);
  x.arcTo(rx, ry + h, rx, ry, r);
  x.arcTo(rx, ry, rx + w, ry, r);
  x.closePath();
}

const FONT = '"Plus Jakarta Sans", "Segoe UI", Arial, sans-serif';
export const SIGN_ASPECT = 256 / 1024;

function signTexture(name, kicker, accentHex) {
  const W = 1024, H = 256;
  const c = document.createElement('canvas');
  c.width = W * SS; c.height = H * SS;
  const x = c.getContext('2d');
  x.scale(SS, SS);
  const accent = new THREE.Color(accentHex);
  const hex = '#' + accent.getHexString();
  const deep = '#' + accent.clone().multiplyScalar(0.62).getHexString();
  const pale = '#' + accent.clone().lerp(new THREE.Color('#ffffff'), 0.62).getHexString();

  const M = 16, BW = W - M * 2, BH = H - M * 2, R = 34;

  /* the card: dark glass, a hairline edge, a faint top sheen */
  x.save();
  x.shadowColor = 'rgba(2,6,16,0.45)';
  x.shadowBlur = 14 * SS; x.shadowOffsetY = 5 * SS;
  roundRect(x, M, M, BW, BH, R);
  const face = x.createLinearGradient(0, M, 0, M + BH);
  face.addColorStop(0, 'rgba(24,33,54,0.96)');
  face.addColorStop(1, 'rgba(11,17,31,0.96)');
  x.fillStyle = face; x.fill();
  x.restore();
  roundRect(x, M + 1, M + 1, BW - 2, BH - 2, R - 1);
  x.strokeStyle = 'rgba(255,255,255,0.14)'; x.lineWidth = 2; x.stroke();

  /* the brand badge with the initial */
  const bs = BH - 44, bx = M + 22, by = M + 22;
  roundRect(x, bx, by, bs, bs, 26);
  const badge = x.createLinearGradient(bx, by, bx + bs, by + bs);
  badge.addColorStop(0, hex); badge.addColorStop(1, deep);
  x.fillStyle = badge; x.fill();
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = '#ffffff';
  x.font = '800 ' + Math.round(bs * 0.56) + 'px ' + FONT;
  x.fillText((name || '?').trim().charAt(0).toUpperCase(), bx + bs / 2, by + bs / 2 + 4);

  /* the "opens" affordance: a small round chevron in the brand colour */
  const cr = 30, ccx = M + BW - 26 - cr, ccy = M + BH / 2;
  x.beginPath(); x.arc(ccx, ccy, cr, 0, Math.PI * 2);
  x.fillStyle = 'rgba(' + [accent.r, accent.g, accent.b].map((v) => Math.round(v * 255)).join(',') + ',0.22)';
  x.fill();
  x.beginPath();
  x.moveTo(ccx - 6, ccy - 12); x.lineTo(ccx + 7, ccy); x.lineTo(ccx - 6, ccy + 12);
  x.strokeStyle = pale; x.lineWidth = 6; x.lineCap = 'round'; x.lineJoin = 'round'; x.stroke();

  /* the name and the industry, left-aligned after the badge */
  const tx = bx + bs + 30, maxW = ccx - cr - 26 - tx;
  const label = name || '';
  x.textAlign = 'left';
  let fs = 84;
  do { x.font = '800 ' + fs + 'px ' + FONT; fs -= 2; } while (fs > 34 && x.measureText(label).width > maxW);
  x.fillStyle = '#ffffff';
  x.fillText(label, tx, M + BH / 2 - (kicker ? 22 : 0));
  if (kicker) {
    try { x.letterSpacing = '4px'; } catch (e) { /* older browsers */ }
    x.font = '700 28px ' + FONT;
    x.fillStyle = pale;
    x.fillText(kicker.toUpperCase(), tx, M + BH / 2 + 44);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;   // no shimmer at overview distance
  return tex;
}

/* ---------- assemble ------------------------------------------------------
   `topY` is the roof the sign stands on. Returns the handles city.js needs
   to scale it with distance and brighten it under the cursor. */
export function makeRoofSign(company, opts = {}) {
  const group = new THREE.Group();
  const accent = new THREE.Color(company.color || '#38bdf8');
  const width = opts.width || 8;
  const height = width * SIGN_ASPECT;
  const topY = opts.topY || 0;

  /* the pedestal: a low dark block with a lit brand edge — what the sign
     visibly stands on */
  const baseMat = new THREE.MeshStandardMaterial({ color: '#1c2436', roughness: 0.55, metalness: 0.4 });
  const edgeMat = new THREE.MeshStandardMaterial({
    color: accent.clone().multiplyScalar(0.7), emissive: accent.clone(), emissiveIntensity: 0.6, roughness: 0.4
  });
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.34, 1.3), baseMat);
  base.position.y = topY + 0.17;
  base.castShadow = true;
  group.add(base);
  const edge = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.07, 1.36), edgeMat);
  edge.position.y = topY + 0.35;
  group.add(edge);

  const plateMat = new THREE.SpriteMaterial({
    map: signTexture(company.name, opts.kicker, company.color || '#38bdf8'),
    transparent: true, fog: false, depthWrite: false
  });
  const plate = new THREE.Sprite(plateMat);
  plate.center.set(0.5, 0);                 // anchored at its bottom edge: it grows upward
  plate.scale.set(width, height, 1);
  const baseY = topY + 0.4;
  plate.position.y = baseY;
  plate.renderOrder = 9;
  group.add(plate);

  return { group, plate, plateMat, edgeMat, baseY, width, height };
}
