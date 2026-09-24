/* =============================================================
   BINOMAR GROUP — the places people actually use
   -------------------------------------------------------------
   The summit had a company district and a wilderness, and nothing
   in between. These are the everyday buildings that make a
   mountain read as inhabited: a market row at a bend in the road,
   an inn, a chapel on a knoll, a farm with a paddock, a watermill
   turning on the stream below the falls, and a viewpoint where
   the road opens out.

   Everything takes the shared terrain height function, and the
   lit parts hand their materials back so the day/night system
   can switch them on.
   ============================================================= */
import * as THREE from 'three';
import { compactGroup, mulberry32 } from './city-build.js';

const TIMBER = new THREE.MeshStandardMaterial({ color: '#7a5738', roughness: 0.95, flatShading: true });
const TIMBER_DARK = new THREE.MeshStandardMaterial({ color: '#53381f', roughness: 1, flatShading: true });
const PLASTER = new THREE.MeshStandardMaterial({ color: '#e4d8c0', roughness: 0.95, flatShading: true });
const STONE = new THREE.MeshStandardMaterial({ color: '#948d82', roughness: 1, flatShading: true });
const STONE_PALE = new THREE.MeshStandardMaterial({ color: '#b3ab9e', roughness: 0.95, flatShading: true });
const SLATE = new THREE.MeshStandardMaterial({ color: '#4e5560', roughness: 0.95, flatShading: true });
const TILE = new THREE.MeshStandardMaterial({ color: '#a8492f', roughness: 0.95, flatShading: true });
const METAL = new THREE.MeshStandardMaterial({ color: '#7c8592', roughness: 0.45, metalness: 0.7 });

const AWNING = ['#c0453f', '#2f7fae', '#e0a12f', '#3f8f63', '#9a5bb5', '#d96a3c'];

/* a warm interior glow for a window — handed back so night can light it */
function litWindow(w, h, lamps) {
  const mat = new THREE.MeshStandardMaterial({
    color: '#3a3a42', roughness: 0.4,
    emissive: new THREE.Color('#ffc978'), emissiveIntensity: 0.05
  });
  lamps.push(mat);
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.1), mat);
}

/* ---------- market stall ------------------------------------------------- */
export function makeStall(rand, lamps) {
  const g = new THREE.Group();
  const cloth = new THREE.MeshStandardMaterial({
    color: AWNING[Math.floor(rand() * AWNING.length)], roughness: 0.9, flatShading: true
  });

  const counter = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.9, 1.2), TIMBER);
  counter.position.y = 0.45;
  counter.castShadow = counter.receiveShadow = true;
  g.add(counter);
  const top = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.12, 1.45), TIMBER_DARK);
  top.position.y = 0.95;
  g.add(top);

  for (const px of [-1.2, 1.2]) {
    for (const pz of [-0.55, 0.55]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 2.3, 5), TIMBER_DARK);
      post.position.set(px, 1.15, pz);
      g.add(post);
    }
  }
  /* a pitched awning, sagging slightly between the posts */
  for (const side of [1, -1]) {
    const flap = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.07, 1.15), cloth);
    flap.position.set(0, 2.42, side * 0.5);
    flap.rotation.x = side * 0.38;
    flap.castShadow = true;
    g.add(flap);
  }
  /* scalloped valance along the front */
  for (let i = 0; i < 7; i++) {
    const tag = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.28, 3), cloth);
    tag.rotation.x = Math.PI;
    tag.position.set(-1.3 + i * 0.43, 2.14, 1.05);
    g.add(tag);
  }

  /* produce in crates */
  const produce = ['#d8482f', '#e8a93c', '#5fa347', '#b2543f', '#d9c05a'];
  for (let i = 0; i < 4; i++) {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.3, 0.5), TIMBER_DARK);
    crate.position.set(-1.0 + i * 0.68, 1.16, 0.1);
    g.add(crate);
    const heap = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 0),
      new THREE.MeshStandardMaterial({
        color: produce[Math.floor(rand() * produce.length)], roughness: 0.85, flatShading: true
      }));
    heap.position.set(-1.0 + i * 0.68, 1.4, 0.1);
    heap.scale.y = 0.7;
    g.add(heap);
  }
  /* a lantern hung from the frame */
  const lamp = litWindow(0.22, 0.26, lamps);
  lamp.position.set(1.1, 1.95, 0.55);
  g.add(lamp);

  return compactGroup(g);
}

/* ---------- the inn ------------------------------------------------------- */
export function makeInn(rand, lamps, smoke) {
  const g = new THREE.Group();
  const W = 7.6, D = 5.6, H1 = 3.0, H2 = 2.4;

  const base = new THREE.Mesh(new THREE.BoxGeometry(W + 0.5, 0.7, D + 0.5), STONE);
  base.position.y = 0.25;
  base.receiveShadow = true;
  g.add(base);
  const lower = new THREE.Mesh(new THREE.BoxGeometry(W, H1, D), PLASTER);
  lower.position.y = 0.6 + H1 / 2;
  lower.castShadow = lower.receiveShadow = true;
  g.add(lower);
  const upper = new THREE.Mesh(new THREE.BoxGeometry(W + 0.7, H2, D + 0.7), TIMBER);
  upper.position.y = 0.6 + H1 + H2 / 2;
  upper.castShadow = true;
  g.add(upper);

  /* half-timbering on the jettied upper floor */
  for (let i = 0; i < 5; i++) {
    const stud = new THREE.Mesh(new THREE.BoxGeometry(0.16, H2 * 0.9, 0.1), TIMBER_DARK);
    stud.position.set(-W * 0.4 + i * (W * 0.2), 0.6 + H1 + H2 / 2, (D + 0.7) / 2 + 0.03);
    g.add(stud);
  }
  const brace = new THREE.Mesh(new THREE.BoxGeometry(0.14, H2 * 1.1, 0.1), TIMBER_DARK);
  brace.position.set(0, 0.6 + H1 + H2 / 2, (D + 0.7) / 2 + 0.03);
  brace.rotation.z = 0.7;
  g.add(brace);

  /* gabled slate roof */
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 4), SLATE);
  roof.scale.set((W + 1.4) / 2 * Math.SQRT2, 2.6, (D + 1.4) / 2 * Math.SQRT2);
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 0.6 + H1 + H2 + 1.3;
  roof.castShadow = true;
  g.add(roof);

  const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.9, 3.2, 0.9), STONE);
  chimney.position.set(W * 0.3, 0.6 + H1 + H2 + 1.4, -D * 0.2);
  chimney.castShadow = true;
  g.add(chimney);

  /* windows, lit at night */
  for (const px of [-2.2, 0, 2.2]) {
    const w1 = litWindow(1.0, 1.1, lamps);
    w1.position.set(px, 2.0, D / 2 + 0.05);
    g.add(w1);
    const w2 = litWindow(0.8, 0.9, lamps);
    w2.position.set(px, 0.6 + H1 + H2 * 0.55, (D + 0.7) / 2 + 0.05);
    g.add(w2);
  }
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.0, 0.14), TIMBER_DARK);
  door.position.set(0, 1.55, D / 2 + 0.08);
  g.add(door);

  compactGroup(g);

  /* a hanging sign on a wrought bracket */
  const arm = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 0.08), METAL);
  arm.position.set(W / 2 + 0.55, 3.2, D / 2 - 0.4);
  g.add(arm);
  const board = litWindow(1.05, 0.7, lamps);
  board.position.set(W / 2 + 1.15, 2.75, D / 2 - 0.4);
  board.rotation.y = Math.PI / 2;
  g.add(board);

  g.userData.smokeAt = new THREE.Vector3(W * 0.3, 0.6 + H1 + H2 + 3.1, -D * 0.2);
  return g;
}

/* ---------- chapel -------------------------------------------------------- */
export function makeChapel(rand, lamps) {
  const g = new THREE.Group();
  const W = 4.2, D = 7.0, H = 3.4;

  const nave = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), STONE_PALE);
  nave.position.y = H / 2;
  nave.castShadow = nave.receiveShadow = true;
  g.add(nave);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 4), SLATE);
  roof.scale.set((W + 0.8) / 2 * Math.SQRT2, 1.9, (D + 0.8) / 2 * Math.SQRT2);
  roof.rotation.y = Math.PI / 4;
  roof.position.y = H + 0.95;
  roof.castShadow = true;
  g.add(roof);

  /* bell tower over the west end */
  const tower = new THREE.Mesh(new THREE.BoxGeometry(2.1, H + 3.4, 2.1), STONE_PALE);
  tower.position.set(0, (H + 3.4) / 2, -D / 2 - 0.5);
  tower.castShadow = true;
  g.add(tower);
  const belfry = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.5, 2.3), STONE);
  belfry.position.set(0, H + 3.4 + 0.2, -D / 2 - 0.5);
  g.add(belfry);
  const spire = new THREE.Mesh(new THREE.ConeGeometry(1.7, 3.2, 4), SLATE);
  spire.rotation.y = Math.PI / 4;
  spire.position.set(0, H + 3.4 + 2.5, -D / 2 - 0.5);
  spire.castShadow = true;
  g.add(spire);
  const cross = new THREE.Group();
  const up = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.9, 0.09), METAL);
  up.position.y = 0.45;
  cross.add(up);
  const across = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.09, 0.09), METAL);
  across.position.y = 0.62;
  cross.add(across);
  cross.position.set(0, H + 3.4 + 4.1, -D / 2 - 0.5);
  g.add(cross);

  compactGroup(g);

  /* the arched window at the east end, and the belfry opening */
  const rose = litWindow(1.1, 1.1, lamps);
  rose.position.set(0, 2.3, D / 2 + 0.06);
  g.add(rose);
  for (const side of [1, -1]) {
    const lancet = litWindow(0.5, 1.4, lamps);
    lancet.position.set(side * (W / 2 + 0.05), 2.0, 0.6);
    lancet.rotation.y = Math.PI / 2;
    g.add(lancet);
  }
  const bell = litWindow(1.0, 0.9, lamps);
  bell.position.set(0, H + 3.5, -D / 2 - 0.5 + 1.2);
  g.add(bell);

  return g;
}

/* ---------- farm: barn, paddock, hay --------------------------------------- */
export function makeFarm(rand, lamps) {
  const g = new THREE.Group();
  const W = 6.4, D = 4.6, H = 3.0;

  const barn = new THREE.Mesh(new THREE.BoxGeometry(W, H, D),
    new THREE.MeshStandardMaterial({ color: '#8e4433', roughness: 0.95, flatShading: true }));
  barn.position.y = H / 2;
  barn.castShadow = barn.receiveShadow = true;
  g.add(barn);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 4), SLATE);
  roof.scale.set((W + 1) / 2 * Math.SQRT2, 2.1, (D + 1) / 2 * Math.SQRT2);
  roof.rotation.y = Math.PI / 4;
  roof.position.y = H + 1.05;
  roof.castShadow = true;
  g.add(roof);
  for (const [bx, bw] of [[0, 0.2], [-W * 0.3, 0.16], [W * 0.3, 0.16]]) {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(bw, H, 0.1), PLASTER);
    strap.position.set(bx, H / 2, D / 2 + 0.05);
    g.add(strap);
  }
  const loft = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.4, 0.12), TIMBER_DARK);
  loft.position.set(0, H - 0.5, D / 2 + 0.07);
  g.add(loft);

  /* hay bales and a cart */
  for (let i = 0; i < 5; i++) {
    const bale = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.0, 10),
      new THREE.MeshStandardMaterial({ color: '#cfa94f', roughness: 1, flatShading: true }));
    bale.rotation.z = Math.PI / 2;
    bale.position.set(W / 2 + 1.3 + (i % 3) * 1.1, 0.5 + Math.floor(i / 3) * 0.95, -1 + (i % 2) * 1.1);
    bale.castShadow = true;
    g.add(bale);
  }

  /* a post-and-rail paddock */
  const rr = 8.5;
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 1.35 + 0.5;
    const px = Math.cos(a) * rr, pz = Math.sin(a) * rr + 3;
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.1, 0.14), TIMBER_DARK);
    post.position.set(px, 0.55, pz);
    g.add(post);
    if (i < 21) {
      const a2 = ((i + 1) / 22) * Math.PI * 1.35 + 0.5;
      const qx = Math.cos(a2) * rr, qz = Math.sin(a2) * rr + 3;
      const len = Math.hypot(qx - px, qz - pz);
      for (const ry of [0.45, 0.85]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.1, 0.07), TIMBER);
        rail.position.set((px + qx) / 2, ry, (pz + qz) / 2);
        rail.rotation.y = -Math.atan2(qz - pz, qx - px);
        g.add(rail);
      }
    }
  }

  compactGroup(g);
  const lamp = litWindow(0.9, 0.8, lamps);
  lamp.position.set(-W * 0.28, 1.5, D / 2 + 0.06);
  g.add(lamp);
  return g;
}

/* ---------- watermill on the stream ---------------------------------------- */
export function makeWatermill(rand, lamps) {
  const g = new THREE.Group();
  const W = 4.6, D = 4.0, H = 3.4;

  const base = new THREE.Mesh(new THREE.BoxGeometry(W + 0.6, 1.1, D + 0.6), STONE);
  base.position.y = 0.4;
  base.receiveShadow = true;
  g.add(base);
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), TIMBER);
  body.position.y = 0.95 + H / 2;
  body.castShadow = body.receiveShadow = true;
  g.add(body);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 4), SLATE);
  roof.scale.set((W + 1) / 2 * Math.SQRT2, 1.9, (D + 1) / 2 * Math.SQRT2);
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 0.95 + H + 0.95;
  roof.castShadow = true;
  g.add(roof);
  /* the launder carrying water to the wheel */
  const flume = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.4, 0.8), TIMBER_DARK);
  flume.position.set(-W / 2 - 1.4, 3.5, 0);
  flume.rotation.z = 0.12;
  g.add(flume);
  compactGroup(g);

  const win = litWindow(0.9, 1.0, lamps);
  win.position.set(0.8, 2.4, D / 2 + 0.06);
  g.add(win);

  /* the wheel — the one part that must keep turning */
  const wheel = new THREE.Group();
  const R = 2.1;
  for (const side of [1, -1]) {
    const rimA = new THREE.Mesh(new THREE.TorusGeometry(R, 0.09, 6, 22), TIMBER_DARK);
    rimA.position.z = side * 0.42;
    wheel.add(rimA);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.1, 8), TIMBER_DARK);
  hub.rotation.x = Math.PI / 2;
  wheel.add(hub);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(R * 2, 0.08, 0.1), TIMBER_DARK);
    spoke.rotation.z = a;
    wheel.add(spoke);
    const paddle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.62, 1.0), TIMBER);
    paddle.position.set(Math.cos(a) * (R - 0.25), Math.sin(a) * (R - 0.25), 0);
    paddle.rotation.z = a;
    paddle.castShadow = true;
    wheel.add(paddle);
  }
  wheel.position.set(-W / 2 - 0.7, 2.3, 0);
  g.add(wheel);

  g.userData.wheel = wheel;
  return g;
}

/* ---------- a viewpoint where the road opens out --------------------------- */
export function makeViewpoint(rand, lamps) {
  const g = new THREE.Group();

  /* a low wall along the drop */
  for (let i = 0; i < 9; i++) {
    const x = -4 + i;
    const block = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.7 + rand() * 0.12, 0.6), STONE_PALE);
    block.position.set(x, 0.36, 0);
    block.rotation.y = (rand() - 0.5) * 0.05;
    block.castShadow = block.receiveShadow = true;
    g.add(block);
  }
  /* a bench facing out */
  const bench = new THREE.Group();
  const seat = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.55), TIMBER);
  seat.position.y = 0.5;
  bench.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 0.1), TIMBER);
  back.position.set(0, 0.78, 0.24);
  bench.add(back);
  for (const lx of [-0.9, 0.9]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.5), TIMBER_DARK);
    leg.position.set(lx, 0.25, 0);
    bench.add(leg);
  }
  bench.position.set(-1.6, 0, 1.9);
  bench.rotation.y = Math.PI;
  g.add(bench);

  /* a coin-operated telescope */
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.14, 1.25, 8), METAL);
  stand.position.set(2.2, 0.62, 1.1);
  g.add(stand);
  const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.95, 10), METAL);
  scope.rotation.z = Math.PI / 2;
  scope.rotation.y = 0.3;
  scope.position.set(2.2, 1.34, 1.1);
  g.add(scope);

  compactGroup(g);

  const board = litWindow(1.5, 0.9, lamps);
  board.position.set(4.4, 1.1, 1.3);
  board.rotation.set(-0.5, -0.5, 0);
  g.add(board);
  const postA = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 1.2, 6), TIMBER_DARK);
  postA.position.set(4.4, 0.6, 1.3);
  g.add(postA);

  return g;
}

/* ---------- a stone well ---------------------------------------------------- */
export function makeWell(rand) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.05, 0.9, 14), STONE);
  ring.position.y = 0.45;
  ring.castShadow = ring.receiveShadow = true;
  g.add(ring);
  const water = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.05, 14),
    new THREE.MeshStandardMaterial({ color: '#2b4c5e', roughness: 0.15, metalness: 0.3 }));
  water.position.y = 0.72;
  g.add(water);
  for (const px of [-0.85, 0.85]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.9, 0.14), TIMBER_DARK);
    post.position.set(px, 1.35, 0);
    g.add(post);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.14, 0.14), TIMBER_DARK);
  beam.position.y = 2.25;
  g.add(beam);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.8, 4), TILE);
  cap.rotation.y = Math.PI / 4;
  cap.position.y = 2.6;
  cap.castShadow = true;
  g.add(cap);
  const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.17, 0.28, 8), TIMBER);
  bucket.position.set(0, 1.5, 0);
  g.add(bucket);
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.72, 4), STONE_PALE);
  rope.position.set(0, 1.9, 0);
  g.add(rope);
  return compactGroup(g);
}
