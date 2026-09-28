/* =============================================================
   BINOMAR GROUP — brand assets from the logo artwork
   -------------------------------------------------------------
   The gold "BG" monogram arrives as a JPG on a pale studio
   background (assets/brand-src/logo-source.jpg). The site is dark,
   so this keys the background out into real transparency, crops
   to the mark and writes the sizes the pages use:

     assets/brand/logo.webp          320 px — the loader (shown ≤ 160 css px)
     assets/brand/logo-128.webp      128 px — navbar, map tag, cards
     assets/brand/favicon-64.png      64 px — browser tab
     assets/brand/apple-touch-icon.png 180 px on the night navy

   Usage:  npm run brand-assets
   ============================================================= */
import sharp from 'sharp';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'assets/brand-src/logo-source.jpg');
const OUT = join(root, 'assets/brand');

const { data, info } = await sharp(SRC).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H } = info;

/* the background: the average of the four corners */
const bg = [0, 0, 0];
for (const [x, y] of [[4, 4], [W - 5, 4], [4, H - 5], [W - 5, H - 5]]) {
  for (let c = 0; c < 3; c++) bg[c] += data[(y * W + x) * 3 + c] / 4;
}

/* alpha from how far a pixel departs from the background in its most
   changed channel (gold loses most of its blue); then the colour is
   un-mixed from the background so the anti-aliased rim does not carry a
   pale fringe onto the dark page */
const out = Buffer.alloc(W * H * 4);
let x0 = W, y0 = H, x1 = 0, y1 = 0;
for (let i = 0; i < W * H; i++) {
  let d = 0;
  for (let c = 0; c < 3; c++) d = Math.max(d, (bg[c] - data[i * 3 + c]) / bg[c]);
  const a = Math.min(1, Math.max(0, (d - 0.03) / 0.32));
  for (let c = 0; c < 3; c++) {
    const v = a > 0.01 ? (data[i * 3 + c] - (1 - a) * bg[c]) / a : 0;
    out[i * 4 + c] = Math.min(255, Math.max(0, Math.round(v)));
  }
  out[i * 4 + 3] = Math.round(a * 255);
  if (a > 0.08) {
    const x = i % W, y = (i / W) | 0;
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
}

/* a square crop around the mark with a little breathing room */
const side = Math.round(Math.max(x1 - x0, y1 - y0) * 1.06);
const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
const left = Math.max(0, Math.round(cx - side / 2)), top = Math.max(0, Math.round(cy - side / 2));
const size = Math.min(side, W - left, H - top);
const mark = () => sharp(out, { raw: { width: W, height: H, channels: 4 } })
  .extract({ left, top, width: size, height: size });

const cut = await mark().png().toBuffer();
await sharp(cut).resize(320, 320).webp({ quality: 88, alphaQuality: 100 }).toFile(join(OUT, 'logo.webp'));
await sharp(cut).resize(128, 128).webp({ quality: 92, alphaQuality: 100 }).toFile(join(OUT, 'logo-128.webp'));
await sharp(cut).resize(64, 64).png().toFile(join(OUT, 'favicon-64.png'));
await sharp({ create: { width: 180, height: 180, channels: 4, background: '#071022' } })
  .composite([{ input: await sharp(cut).resize(150, 150).png().toBuffer(), left: 15, top: 15 }])
  .png().toFile(join(OUT, 'apple-touch-icon.png'));
console.log('background', bg.map(Math.round).join(','), '· mark', size + 'px square at', left + ',' + top);
