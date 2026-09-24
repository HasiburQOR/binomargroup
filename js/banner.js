/* =============================================================
   BINOMAR GROUP — floating name banners
   -------------------------------------------------------------
   A flat board on a roof is unreadable edge-on and mirrored from
   behind. These are sprites, so they turn to face the camera on
   every frame: whichever way the visitor orbits, the company name
   is square-on and legible.

   Each banner is an illuminated destination marker: a dark translucent
   navy board with a thin luminous brand keyline and a soft halo, an
   extruded lower edge for depth, a drop shadow to lift it off the sky,
   and a pointer tail that meets the slim mast it hangs from. One
   layout for every company — only the brand accent changes.
   ============================================================= */
import * as THREE from 'three';

/* ---------- the plate ---------------------------------------------------- */
function roundRect(x, rx, ry, w, h, r) {
  x.beginPath();
  x.moveTo(rx + r, ry);
  x.arcTo(rx + w, ry, rx + w, ry + h, r);
  x.arcTo(rx + w, ry + h, rx, ry + h, r);
  x.arcTo(rx, ry + h, rx, ry, r);
  x.arcTo(rx, ry, rx + w, ry, r);
  x.closePath();
}

function plateTexture(name, kicker, accentHex) {
  const W = 1024, H = 320;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const accent = new THREE.Color(accentHex);
  const hex = '#' + accent.getHexString();
  const pale = '#' + accent.clone().lerp(new THREE.Color('#ffffff'), 0.55).getHexString();
  const rim = '#' + accent.clone().lerp(new THREE.Color('#ffffff'), 0.45).getHexString();
  const rgb = Math.round(accent.r * 255) + ',' + Math.round(accent.g * 255) + ',' + Math.round(accent.b * 255);

  /* geometry: the board, plus room around it for halo, shadow and tail */
  const M = 34;                        // margin — the halo and shadow live here
  const BW = W - M * 2, BH = 212;      // the board itself
  const R = 42;                        // corner radius
  const EXT = 9;                       // extrusion offset — a hint of thickness
  const body = () => roundRect(x, M, M, BW, BH, R);
  const edge = () => roundRect(x, M, M + EXT, BW, BH, R);

  /* 1 · drop shadow — what separates the sign from the sky behind it */
  x.save();
  x.shadowColor = 'rgba(2,5,14,0.55)';
  x.shadowBlur = 28; x.shadowOffsetX = 7; x.shadowOffsetY = 22;
  edge(); x.fillStyle = 'rgba(7,12,26,0.95)'; x.fill();
  x.restore();

  /* 2 · the extruded lower edge — 3D depth without geometry */
  edge(); x.fillStyle = 'rgba(7,12,26,0.97)'; x.fill();

  /* 3 · the pointer tail — the destination-marker note; the mast meets its tip */
  const py = M + BH, pw = 84;
  x.save();
  x.shadowColor = 'rgba(2,5,14,0.5)'; x.shadowBlur = 16; x.shadowOffsetY = 12;
  x.beginPath();
  x.moveTo(W / 2 - pw / 2, py - 4);
  x.lineTo(W / 2 + pw / 2, py - 4);
  x.lineTo(W / 2 + 15, py + 24);
  x.lineTo(W / 2, py + 40);
  x.lineTo(W / 2 - 15, py + 24);
  x.closePath();
  x.fillStyle = 'rgba(11,17,34,0.95)'; x.fill();
  x.restore();
  /* stroke only the hanging sides and the tip — the body's own border
     finishes the seam where the tail meets the board */
  x.beginPath();
  x.moveTo(W / 2 - pw / 2, py);
  x.lineTo(W / 2 - 15, py + 24);
  x.lineTo(W / 2, py + 40);
  x.lineTo(W / 2 + 15, py + 24);
  x.lineTo(W / 2 + pw / 2, py);
  x.strokeStyle = rim; x.lineWidth = 3.5; x.stroke();

  /* 4 · the face — dark translucent navy */
  const face = x.createLinearGradient(0, M, 0, M + BH);
  face.addColorStop(0, 'rgba(27,39,68,0.82)');
  face.addColorStop(0.55, 'rgba(15,23,44,0.86)');
  face.addColorStop(1, 'rgba(9,14,29,0.90)');
  body(); x.fillStyle = face; x.fill();

  x.save();
  body(); x.clip();
  /* brand wash — the accent colours the sign without changing its layout */
  const wash = x.createLinearGradient(M, 0, W * 0.52, 0);
  wash.addColorStop(0, 'rgba(' + rgb + ',0.20)');
  wash.addColorStop(1, 'rgba(' + rgb + ',0)');
  x.fillStyle = wash; x.fillRect(0, 0, W, H);
  /* bevel — light along the top, shade along the bottom */
  const bevel = x.createLinearGradient(0, M, 0, M + BH);
  bevel.addColorStop(0, 'rgba(255,255,255,0.14)');
  bevel.addColorStop(0.2, 'rgba(255,255,255,0)');
  bevel.addColorStop(0.8, 'rgba(0,0,0,0)');
  bevel.addColorStop(1, 'rgba(0,0,0,0.28)');
  x.fillStyle = bevel; x.fillRect(M, M, BW, BH);
  /* the luminous brand strip down the left edge */
  x.shadowColor = hex; x.shadowBlur = 16;
  x.fillStyle = hex; x.fillRect(M, M, 12, BH);
  x.restore();

  /* 5 · the thin luminous border, haloed — two passes make the glow denser */
  body();
  x.shadowColor = hex; x.shadowBlur = 22;
  x.strokeStyle = rim; x.lineWidth = 4; x.stroke(); x.stroke();
  x.shadowBlur = 0;
  /* a pale inner hairline finishes the keyline */
  roundRect(x, M + 11, M + 11, BW - 22, BH - 22, R - 11);
  x.strokeStyle = 'rgba(255,255,255,0.22)'; x.lineWidth = 2; x.stroke();

  /* 6 · the name — heavy signage weight, sized to fill the board, with a
        thin dark keyline so every glyph stays crisp against its own glow */
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  try { x.letterSpacing = '4px'; } catch (e) { /* older browsers */ }
  const label = (name || '').toUpperCase();
  const FONT = '"Plus Jakarta Sans", "Segoe UI Black", "Arial Black", "Segoe UI", Arial, sans-serif';
  let fs = 118;
  do {
    x.font = '900 ' + fs + 'px ' + FONT;
    fs -= 3;
  } while (fs > 40 && x.measureText(label).width > BW - 190);
  const cx = W / 2 + 6;               // +6: the left strip weighs the box slightly
  const cy = M + BH / 2 - (kicker ? 20 : 0);
  /* keyline first — it fattens the strokes and keeps the edges sharp */
  x.lineJoin = 'round';
  x.lineWidth = Math.max(3, fs * 0.05);
  x.strokeStyle = 'rgba(6,11,26,0.85)';
  x.strokeText(label, cx, cy);
  /* one tight glow pass (a wide halo only smears fine letterforms), then a
     solid core on top so the letterforms read heavy from a distance */
  x.shadowColor = hex; x.shadowBlur = 12;
  x.fillStyle = '#ffffff';
  x.fillText(label, cx, cy);
  x.shadowBlur = 0;
  x.fillText(label, cx, cy);

  if (kicker) {
    const kick = kicker.toUpperCase();
    try { x.letterSpacing = '7px'; } catch (e) { /* older browsers */ }
    x.font = '800 30px ' + FONT;
    x.fillStyle = pale;
    const ky = M + BH / 2 + 56;
    x.fillText(kick, cx, ky);
    /* two small accent lozenges flanking the kicker — the destination cue */
    const kw = x.measureText(kick).width;
    for (const s of [-1, 1]) {
      x.save();
      x.translate(cx + s * (kw / 2 + 46), ky);
      x.rotate(Math.PI / 4);
      x.shadowColor = hex; x.shadowBlur = 10;
      x.fillStyle = rim;
      x.fillRect(-5.5, -5.5, 11, 11);
      x.restore();
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/* ---------- the bloom behind it ------------------------------------------ */
function bloomTexture(accentHex) {
  const W = 512, H = 192;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const col = new THREE.Color(accentHex);
  const rgb = Math.round(col.r * 255) + ',' + Math.round(col.g * 255) + ',' + Math.round(col.b * 255);
  const g = x.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W / 2);
  g.addColorStop(0, 'rgba(' + rgb + ',0.75)');
  g.addColorStop(0.28, 'rgba(' + rgb + ',0.32)');
  g.addColorStop(0.62, 'rgba(' + rgb + ',0.09)');
  g.addColorStop(1, 'rgba(' + rgb + ',0)');
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ---------- assemble ------------------------------------------------------
   `topY` is the roofline; the banner floats above it on a slim mast.
   Returns the handles city.js needs to bob, pulse and highlight it. */
export function makeFloatingBanner(company, opts = {}) {
  const group = new THREE.Group();
  const accent = company.color || '#38bdf8';
  const width = opts.width || 11;
  const height = width * 0.3125;                    // matches the 1024×320 plate
  const lift = opts.lift === undefined ? 4.2 : opts.lift;
  const topY = opts.topY || 0;

  /* mast + collar, so it hangs off the building rather than hovering loose */
  const mastMat = new THREE.MeshStandardMaterial({ color: '#39445a', roughness: 0.45, metalness: 0.6 });
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.11, lift, 8), mastMat);
  mast.position.y = topY + lift / 2;
  mast.castShadow = true;
  group.add(mast);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.52, 0.28, 10), mastMat);
  collar.position.y = topY + 0.14;
  group.add(collar);

  const y = topY + lift + height / 2;

  /* 1. bloom — the light the sign throws into the air around it */
  const glowMat = new THREE.SpriteMaterial({
    map: bloomTexture(accent), transparent: true, opacity: 0.5, fog: false,
    blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true
  });
  const glow = new THREE.Sprite(glowMat);
  glow.scale.set(width * 1.55, height * 2.5, 1);
  glow.position.y = y;
  glow.renderOrder = 8;
  group.add(glow);

  /* 2. the plate */
  const plateMat = new THREE.SpriteMaterial({
    map: plateTexture(company.name, opts.kicker, accent),
    transparent: true, fog: false, depthWrite: false
  });
  const plate = new THREE.Sprite(plateMat);
  plate.scale.set(width, height, 1);
  plate.position.y = y;
  plate.renderOrder = 9;
  group.add(plate);

  const banner = {
    group, plate, glow, mast, plateMat, glowMat,
    topY, lift, baseY: y, width, height,
    phase: Math.random() * Math.PI * 2,

    /* raise the whole assembly — mast included, so the plate never ends up
       floating detached above a stub. city.js uses this to stagger
       neighbouring banners and to clear the monument's own sign band. */
    setLift(newLift) {
      this.lift = newLift;
      mast.geometry.dispose();
      mast.geometry = new THREE.CylinderGeometry(0.085, 0.11, newLift, 8);
      mast.position.y = this.topY + newLift / 2;
      this.baseY = this.topY + newLift + this.height / 2;
      plate.position.y = glow.position.y = this.baseY;
    }
  };
  return banner;
}
