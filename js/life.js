/* =============================================================
   BINOMAR GROUP — everything that moves on its own
   -------------------------------------------------------------
   Birds that soar rather than flap on rails, deer and rabbits
   working through a small state machine on the slopes, and
   villagers who keep different hours: out on the paths by day,
   gathered round the fire once the lamps come on.

   Everything here takes the shared terrain height function so it
   walks on the ground rather than through it.
   ============================================================= */
import * as THREE from 'three';
import { compactGroup, mulberry32 } from './city-build.js';

/* =============================================================
   BIRDS
   -------------------------------------------------------------
   The old ones were two flat triangles on a perfect circle,
   flapping like a metronome — which is exactly what made them
   read as paper. These have a body, swept wings with a wrist
   joint, and they mostly soar: wings held in a shallow dihedral,
   with occasional bursts of flapping. They wander instead of
   orbiting, and they bank into their turns.
   ============================================================= */
function makeBird(rand, big) {
  const g = new THREE.Group();
  const dark = new THREE.Color().setHSL(0.07 + rand() * 0.06, 0.18 + rand() * 0.2, 0.13 + rand() * 0.12);
  const bodyMat = new THREE.MeshStandardMaterial({ color: dark, roughness: 0.85, flatShading: true });
  const wingMat = new THREE.MeshStandardMaterial({
    color: dark.clone().multiplyScalar(1.25), roughness: 0.9,
    side: THREE.DoubleSide, flatShading: true
  });

  const s = big ? 1 : 0.55;

  const body = new THREE.Mesh(new THREE.OctahedronGeometry(0.34 * s, 0), bodyMat);
  body.scale.set(2.5, 0.72, 0.8);
  g.add(body);
  const head = new THREE.Mesh(new THREE.OctahedronGeometry(0.17 * s, 0), bodyMat);
  head.position.set(0.72 * s, 0.06 * s, 0);
  g.add(head);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.06 * s, 0.24 * s, 4), bodyMat);
  beak.rotation.z = -Math.PI / 2;
  beak.position.set(0.94 * s, 0.03 * s, 0);
  g.add(beak);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.2 * s, 0.7 * s, 3), wingMat);
  tail.rotation.z = Math.PI / 2;
  tail.scale.set(1, 1, 0.35);
  tail.position.set(-0.86 * s, 0, 0);
  g.add(tail);
  compactGroup(g);

  /* each wing is an inner panel with an outer panel hinged at the wrist,
     so the tip trails the shoulder through the stroke */
  const wings = [];
  for (const side of [1, -1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(0, 0.04 * s, 0.18 * s * side);

    const inner = new THREE.Mesh(new THREE.PlaneGeometry(0.86 * s, 0.82 * s), wingMat);
    inner.rotation.x = -Math.PI / 2;
    inner.position.set(-0.06 * s, 0, 0.41 * s * side);
    shoulder.add(inner);

    const wrist = new THREE.Group();
    wrist.position.set(0, 0, 0.82 * s * side);
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(0.66 * s, 0.92 * s), wingMat);
    outer.rotation.x = -Math.PI / 2;
    outer.position.set(-0.2 * s, 0, 0.46 * s * side);
    /* taper the tip into primaries */
    const op = outer.geometry.attributes.position;
    for (let i = 0; i < op.count; i++) {
      if (Math.abs(op.getY(i) - 0.5 * s) < 1e-4 || op.getY(i) > 0) {
        op.setX(i, op.getX(i) * 0.45);
      }
    }
    op.needsUpdate = true;
    wrist.add(outer);
    shoulder.add(wrist);

    g.add(shoulder);
    wings.push({ shoulder, wrist, side });
  }

  g.userData.wings = wings;
  return g;
}

export function createBirds(scene, H, q = {}) {
  const rand = mulberry32(48271);
  const flocks = [];
  const birds = [];

  /* two soaring raptors working their own thermals, plus a couple of
     loose flocks of smaller birds */
  const flockCount = q.birdFlocks || 4;
  for (let f = 0; f < flockCount; f++) {
    const big = f < Math.max(1, Math.floor(flockCount / 2));
    const n = big ? 1 : 4 + Math.floor(rand() * 4);
    const flock = {
      big,
      a: rand() * Math.PI * 2,
      r: big ? 62 + rand() * 60 : 78 + rand() * 80,
      y: big ? 96 + rand() * 40 : 78 + rand() * 30,
      speed: big ? 0.075 + rand() * 0.05 : 0.15 + rand() * 0.09,
      /* the circle itself drifts, so nothing traces the same loop twice */
      driftA: rand() * 6.28, driftB: rand() * 6.28,
      members: []
    };
    for (let i = 0; i < n; i++) {
      const b = makeBird(rand, big);
      b.scale.setScalar(big ? 1.15 + rand() * 0.35 : 0.8 + rand() * 0.3);
      scene.add(b);
      const m = {
        mesh: b,
        wings: b.userData.wings,
        /* position in the flock: behind and out to one side, like a skein */
        lag: big ? 0 : 0.035 + i * 0.026,
        side: big ? 0 : ((i % 2) ? 1 : -1) * (3 + i * 2.4),
        rise: big ? 0 : (rand() - 0.5) * 5,
        phase: rand() * 6.28,
        /* soaring birds flap in bursts; small ones nearly all the time */
        burst: big ? 0 : 1,
        burstT: rand() * 4,
        flap: 0
      };
      flock.members.push(m);
      birds.push(m);
    }
    flocks.push(flock);
  }

  const prev = new THREE.Vector3();
  const now = new THREE.Vector3();
  const look = new THREE.Vector3();

  /* where the flock's leader is at a given time */
  const pathAt = (fl, a) => {
    const rr = fl.r * (1 + 0.22 * Math.sin(a * 0.7 + fl.driftA));
    return new THREE.Vector3(
      Math.cos(a) * rr + Math.sin(a * 0.43 + fl.driftB) * 26,
      fl.y + Math.sin(a * 1.3 + fl.driftA) * 9 + Math.sin(a * 0.31) * 14,
      Math.sin(a) * rr + Math.cos(a * 0.37 + fl.driftB) * 26
    );
  };

  return {
    update(dt, t, mix) {
      const day = 1 - mix;
      const vis = day > 0.06;
      for (const fl of flocks) {
        fl.a += fl.speed * dt;
        for (const m of fl.members) {
          m.mesh.visible = vis;
          if (!vis) continue;

          const a = fl.a - m.lag;
          now.copy(pathAt(fl, a));
          prev.copy(pathAt(fl, a - 0.02));

          /* offset sideways from the leader's track, in its own frame */
          look.subVectors(now, prev).normalize();
          const sx = -look.z, sz = look.x;
          m.mesh.position.set(
            now.x + sx * m.side,
            now.y + m.rise + Math.sin(t * 0.9 + m.phase) * 1.2,
            now.z + sz * m.side
          );

          /* face the direction of travel, and bank into the turn */
          const yaw = Math.atan2(-look.z, look.x);
          m.mesh.rotation.order = 'YZX';
          m.mesh.rotation.y = yaw;
          m.mesh.rotation.z = Math.asin(Math.max(-1, Math.min(1, look.y))) * 0.6;
          m.mesh.rotation.x = -fl.speed * 2.1;    // a gentle bank into the circle

          /* flapping: bursts for the soarers, near-continuous for the rest */
          m.burstT -= dt;
          if (m.burstT <= 0) {
            m.burst = fl.big ? (m.burst > 0.5 ? 0 : 1) : 1;
            m.burstT = fl.big ? (m.burst > 0.5 ? 1.1 + Math.random() * 1.4
                                               : 3.5 + Math.random() * 5)
                              : 1.5;
          }
          const want = m.burst;
          m.flap += (want - m.flap) * Math.min(1, dt * 3.5);
          const beat = fl.big ? 4.2 : 9.5;
          /* a fast downstroke and a slower recovery reads as effort */
          const raw = Math.sin(t * beat + m.phase);
          const stroke = raw > 0 ? Math.pow(raw, 0.6) : -Math.pow(-raw, 1.7);
          for (const w of m.wings) {
            const drive = stroke * m.flap;
            w.shoulder.rotation.x = (0.13 + drive * 0.62) * w.side;
            w.wrist.rotation.x = (-0.1 + drive * 0.5) * w.side;  // the tip trails
          }
        }
      }
    }
  };
}

/* =============================================================
   ANIMALS
   -------------------------------------------------------------
   Deer that graze, look up, and wander a few metres; rabbits
   that sit and hop. Both walk the real terrain.
   ============================================================= */
function makeDeer(rand) {
  const g = new THREE.Group();
  const coat = new THREE.Color().setHSL(0.07, 0.42, 0.34 + rand() * 0.12);
  const hide = new THREE.MeshStandardMaterial({ color: coat, roughness: 0.95, flatShading: true });
  const pale = new THREE.MeshStandardMaterial({
    color: coat.clone().lerp(new THREE.Color('#f0e3d0'), 0.6), roughness: 0.95, flatShading: true
  });
  const dark = new THREE.MeshStandardMaterial({ color: '#3a2a1e', roughness: 1 });

  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.46, 0), hide);
  body.scale.set(1.75, 0.92, 0.82);
  body.position.y = 1.0;
  body.castShadow = true;
  g.add(body);
  const rump = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 0), pale);
  rump.position.set(-0.7, 1.02, 0);
  g.add(rump);

  /* neck and head on their own pivot so the animal can lift its head */
  const neck = new THREE.Group();
  neck.position.set(0.62, 1.16, 0);
  const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.19, 0.62, 7), hide);
  neckMesh.position.set(0.1, 0.24, 0);
  neckMesh.rotation.z = -0.5;
  neck.add(neckMesh);
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.19, 0), hide);
  head.scale.set(1.5, 0.85, 0.8);
  head.position.set(0.36, 0.5, 0);
  neck.add(head);
  const muzzle = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 0), dark);
  muzzle.position.set(0.58, 0.45, 0);
  neck.add(muzzle);
  for (const ez of [0.12, -0.12]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 5), hide);
    ear.position.set(0.26, 0.66, ez);
    ear.rotation.z = -0.3;
    neck.add(ear);
  }
  if (rand() < 0.4) {                                  // a stag
    for (const az of [0.1, -0.1]) {
      for (let i = 0; i < 3; i++) {
        const tine = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, 0.3 + i * 0.1, 4), pale);
        tine.position.set(0.24 + i * 0.07, 0.8 + i * 0.12, az * (1 + i * 0.4));
        tine.rotation.z = -0.3 - i * 0.2;
        neck.add(tine);
      }
    }
  }
  compactGroup(neck);
  g.add(neck);

  const legs = [];
  for (const lx of [0.46, -0.46]) {
    for (const lz of [0.26, -0.26]) {
      const leg = new THREE.Group();
      const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.055, 1.0, 5), hide);
      upper.position.y = -0.5;
      leg.add(upper);
      const hoof = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.14, 5), dark);
      hoof.position.y = -1.03;
      leg.add(hoof);
      leg.position.set(lx, 1.0, lz);
      g.add(leg);
      legs.push({ g: leg, phase: lx * lz > 0 ? 0 : Math.PI });
    }
  }
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.3, 5), pale);
  tail.position.set(-0.95, 1.1, 0);
  tail.rotation.z = 1.9;
  g.add(tail);

  g.userData.neck = neck;
  g.userData.legs = legs;
  g.scale.setScalar(0.78 + rand() * 0.22);
  return g;
}

function makeRabbit(rand) {
  const g = new THREE.Group();
  const coat = new THREE.MeshStandardMaterial({
    color: new THREE.Color().setHSL(0.08, 0.16, 0.36 + rand() * 0.24),
    roughness: 1, flatShading: true
  });
  const pale = new THREE.MeshStandardMaterial({ color: '#efe6d8', roughness: 1, flatShading: true });
  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 0), coat);
  body.scale.set(1.5, 1, 0.95);
  body.position.y = 0.2;
  body.castShadow = true;
  g.add(body);
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 0), coat);
  head.position.set(0.24, 0.32, 0);
  g.add(head);
  const ears = new THREE.Group();
  for (const ez of [0.06, -0.06]) {
    const ear = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.22, 3, 6), coat);
    ear.position.set(0.2, 0.52, ez);
    ear.rotation.z = -0.18;
    ears.add(ear);
  }
  compactGroup(ears);
  g.add(ears);
  const scut = new THREE.Mesh(new THREE.IcosahedronGeometry(0.075, 0), pale);
  scut.position.set(-0.28, 0.24, 0);
  g.add(scut);
  compactGroup(g);
  g.userData.ears = ears;
  g.scale.setScalar(0.85 + rand() * 0.3);
  return g;
}

export function createAnimals(scene, H, opts = {}) {
  const rand = mulberry32(6553);
  const ok = opts.reject || (() => false);
  const herd = [];

  const spawn = (make, kind, n, rMin, rMax) => {
    let placed = 0, tries = 0;
    while (placed < n && tries < n * 30) {
      tries++;
      const a = rand() * Math.PI * 2;
      const r = rMin + rand() * (rMax - rMin);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (ok(x, z)) continue;
      const m = make(rand);
      m.position.set(x, H(x, z), z);
      m.rotation.y = rand() * Math.PI * 2;
      scene.add(m);
      herd.push({
        mesh: m, kind,
        home: new THREE.Vector2(x, z),
        state: 'graze', timer: 1 + rand() * 4,
        target: new THREE.Vector2(x, z),
        speed: kind === 'deer' ? 1.5 + rand() : 2.4 + rand(),
        phase: rand() * 6.28,
        hop: 0
      });
      placed++;
    }
  };

  spawn(makeDeer, 'deer', opts.deer || 9, 30, 128);
  spawn(makeRabbit, 'rabbit', opts.rabbits || 14, 24, 120);

  const pick = (a, radius) => {
    const ang = Math.random() * Math.PI * 2;
    const d = Math.sqrt(Math.random()) * radius;
    return new THREE.Vector2(a.x + Math.cos(ang) * d, a.y + Math.sin(ang) * d);
  };

  return {
    herd,
    update(dt, t) {
      for (const an of herd) {
        an.timer -= dt;
        const m = an.mesh;

        if (an.timer <= 0) {
          /* a small loop: graze → look up → move somewhere → graze */
          if (an.state === 'graze') {
            an.state = 'alert';
            an.timer = 0.8 + Math.random() * 1.6;
          } else if (an.state === 'alert') {
            an.state = 'walk';
            an.target = pick(an.home, an.kind === 'deer' ? 13 : 7);
            an.timer = 2 + Math.random() * 3.5;
          } else {
            an.state = 'graze';
            an.timer = 3 + Math.random() * 6;
          }
        }

        if (an.state === 'walk') {
          const dx = an.target.x - m.position.x, dz = an.target.y - m.position.z;
          const d = Math.hypot(dx, dz);
          if (d > 0.35) {
            const step = Math.min(d, an.speed * dt);
            m.position.x += (dx / d) * step;
            m.position.z += (dz / d) * step;
            const yaw = Math.atan2(-dz, dx);
            /* turn smoothly rather than snapping */
            let turn = yaw - m.rotation.y;
            while (turn > Math.PI) turn -= Math.PI * 2;
            while (turn < -Math.PI) turn += Math.PI * 2;
            m.rotation.y += turn * Math.min(1, dt * 5);
          }
        }

        const ground = H(m.position.x, m.position.z);

        if (an.kind === 'deer') {
          m.position.y = ground;
          const walking = an.state === 'walk';
          /* head down to graze, up when alert or moving */
          const wantNeck = an.state === 'graze' ? 1.15 : walking ? 0.28 : 0;
          const neck = m.userData.neck;
          neck.rotation.z = (neck.rotation.z || 0) + (wantNeck - neck.rotation.z) * Math.min(1, dt * 3);
          for (const leg of m.userData.legs) {
            const swing = walking ? Math.sin(t * 7 + leg.phase) * 0.5 : 0;
            leg.g.rotation.z = (leg.g.rotation.z || 0) + (swing - leg.g.rotation.z) * Math.min(1, dt * 9);
          }
        } else {
          /* rabbits hop rather than walk: an arc each time they move */
          if (an.state === 'walk') {
            an.hop += dt * 4.2;
            m.position.y = ground + Math.abs(Math.sin(an.hop)) * 0.42;
            m.rotation.z = -Math.cos(an.hop) * 0.18;
          } else {
            an.hop = 0;
            m.position.y = ground;
            m.rotation.z = 0;
            /* ears twitch while sitting */
            m.userData.ears.rotation.x = Math.sin(t * 2.2 + an.phase) * 0.12;
          }
        }
      }
    }
  };
}

/* =============================================================
   VILLAGERS
   -------------------------------------------------------------
   A handful of people who keep hours. By day they walk the plaza
   and the paths; as the lamps come on they drift to the fire and
   the lit doorways. Each one owns a day station and a night
   station and simply walks to whichever the clock calls for.
   ============================================================= */
const COAT = ['#c2453f', '#2f6fb0', '#d9a441', '#3f8f63', '#8b5cb8', '#d9734a', '#4a5568', '#c9689a'];

function makePerson(rand) {
  const g = new THREE.Group();
  const coat = COAT[Math.floor(rand() * COAT.length)];
  const cloth = new THREE.MeshStandardMaterial({ color: coat, roughness: 0.9, flatShading: true });
  const trouser = new THREE.MeshStandardMaterial({
    color: new THREE.Color(coat).multiplyScalar(0.4).lerp(new THREE.Color('#2a2f3a'), 0.6),
    roughness: 0.95, flatShading: true
  });
  const skin = new THREE.MeshStandardMaterial({
    color: new THREE.Color().setHSL(0.07, 0.34, 0.42 + rand() * 0.28), roughness: 0.85
  });

  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.24, 0.62, 7), cloth);
  torso.position.y = 1.02;
  torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.15, 0), skin);
  head.position.y = 1.47;
  head.castShadow = true;
  g.add(head);
  if (rand() < 0.45) {                                 // a hat on some
    const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.1, 8), trouser);
    hat.position.y = 1.6;
    g.add(hat);
  }
  compactGroup(g);

  const limbs = [];
  for (const side of [1, -1]) {
    const arm = new THREE.Group();
    arm.position.set(0, 1.28, 0.2 * side);
    const a = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.56, 5), cloth);
    a.position.y = -0.28;
    arm.add(a);
    g.add(arm);

    const leg = new THREE.Group();
    leg.position.set(0, 0.72, 0.09 * side);
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.72, 5), trouser);
    l.position.y = -0.36;
    leg.add(l);
    g.add(leg);

    limbs.push({ arm, leg, side });
  }

  g.userData.limbs = limbs;
  g.scale.setScalar(0.92 + rand() * 0.18);
  return g;
}

export function createVillagers(scene, H, opts = {}) {
  const rand = mulberry32(112358);
  const people = [];
  const groundY = opts.groundY || 0;
  const fire = opts.fire || new THREE.Vector2(0, 0);
  const plaza = opts.plazaR || 17.5;
  const n = opts.count || 11;

  for (let i = 0; i < n; i++) {
    const p = makePerson(rand);

    /* day: spread around the plaza and the top of the road */
    const da = rand() * Math.PI * 2;
    const dr = 7 + rand() * (plaza - 4);
    const day = new THREE.Vector2(Math.cos(da) * dr, Math.sin(da) * dr);

    /* night: most of them ring the fire, the rest stay under a lamp */
    let night;
    if (i < Math.round(n * 0.55)) {
      const fa = (i / Math.max(1, Math.round(n * 0.55))) * Math.PI * 2 + 0.3;
      night = new THREE.Vector2(fire.x + Math.cos(fa) * 3.4, fire.y + Math.sin(fa) * 3.4);
    } else {
      const la = rand() * Math.PI * 2;
      night = new THREE.Vector2(Math.cos(la) * 15.2, Math.sin(la) * 15.2);
    }

    p.position.set(day.x, H(day.x, day.y), day.y);
    scene.add(p);
    people.push({
      mesh: p, limbs: p.userData.limbs,
      day, night,
      wander: day.clone(),
      target: day.clone(),
      speed: 1.5 + rand() * 0.9,
      pause: rand() * 6,
      phase: rand() * 6.28,
      walking: 0
    });
  }

  return {
    people,
    update(dt, t, mix) {
      const night = mix > 0.5;
      for (const v of people) {
        const m = v.mesh;

        /* pick where this person wants to be right now */
        if (night) {
          v.target.copy(v.night);
        } else {
          v.pause -= dt;
          if (v.pause <= 0) {
            /* stroll to a new spot near their day station */
            const a = Math.random() * Math.PI * 2;
            const d = Math.sqrt(Math.random()) * 6;
            v.wander.set(v.day.x + Math.cos(a) * d, v.day.y + Math.sin(a) * d);
            v.pause = 4 + Math.random() * 9;
          }
          v.target.copy(v.wander);
        }

        const dx = v.target.x - m.position.x, dz = v.target.y - m.position.z;
        const d = Math.hypot(dx, dz);
        const moving = d > 0.4;
        if (moving) {
          const step = Math.min(d, v.speed * dt);
          m.position.x += (dx / d) * step;
          m.position.z += (dz / d) * step;
          let turn = Math.atan2(-dz, dx) - m.rotation.y;
          while (turn > Math.PI) turn -= Math.PI * 2;
          while (turn < -Math.PI) turn += Math.PI * 2;
          m.rotation.y += turn * Math.min(1, dt * 6);
        } else if (night) {
          /* face the fire once you get there */
          let turn = Math.atan2(-(fire.y - m.position.z), fire.x - m.position.x) - m.rotation.y;
          while (turn > Math.PI) turn -= Math.PI * 2;
          while (turn < -Math.PI) turn += Math.PI * 2;
          m.rotation.y += turn * Math.min(1, dt * 2.5);
        }
        m.position.y = H(m.position.x, m.position.z);

        v.walking += ((moving ? 1 : 0) - v.walking) * Math.min(1, dt * 6);
        const gait = Math.sin(t * 6.4 + v.phase) * 0.55 * v.walking;
        for (const lb of v.limbs) {
          lb.leg.rotation.z = gait * lb.side;
          lb.arm.rotation.z = -gait * 0.7 * lb.side;
          /* a little sway when standing still, so nobody is a statue */
          lb.arm.rotation.x = Math.sin(t * 1.1 + v.phase) * 0.05 * (1 - v.walking);
        }
      }
    }
  };
}

/* =============================================================
   THE ASTRONOMER
   -------------------------------------------------------------
   Someone has to be looking up. A figure with a tripod telescope
   on the tallest roof in the district, who only appears once the
   sky is worth looking at, and slowly sweeps it across the stars.
   ============================================================= */
export function makeAstronomer(rand) {
  const group = new THREE.Group();
  const brass = new THREE.MeshStandardMaterial({ color: '#c9a44e', roughness: 0.32, metalness: 0.85 });
  const dark = new THREE.MeshStandardMaterial({ color: '#2f3644', roughness: 0.6, metalness: 0.3 });
  const coat = new THREE.MeshStandardMaterial({ color: '#2f4f7a', roughness: 0.9, flatShading: true });
  const skin = new THREE.MeshStandardMaterial({ color: '#c99a76', roughness: 0.85 });

  /* tripod */
  const legs = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.25, 5), dark);
    leg.position.set(Math.cos(a) * 0.26, 0.6, Math.sin(a) * 0.26);
    leg.rotation.set(Math.sin(a) * 0.36, 0, -Math.cos(a) * 0.36);
    legs.add(leg);
  }
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.16, 8), dark);
  head.position.y = 1.22;
  legs.add(head);
  compactGroup(legs);
  group.add(legs);

  /* the telescope itself, on a pivot so it can be aimed */
  const scope = new THREE.Group();
  scope.position.y = 1.28;
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.135, 1.35, 12), brass);
  tube.rotation.z = Math.PI / 2;
  scope.add(tube);
  const objective = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.15, 0.14, 12), dark);
  objective.rotation.z = Math.PI / 2;
  objective.position.x = 0.72;
  scope.add(objective);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.13, 12),
    new THREE.MeshStandardMaterial({
      color: '#bfe4ff', emissive: new THREE.Color('#8fd0ff'), emissiveIntensity: 0.5,
      roughness: 0.1, metalness: 0.4
    }));
  lens.rotation.y = Math.PI / 2;
  lens.position.x = 0.795;
  scope.add(lens);
  const eyepiece = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.26, 8), dark);
  eyepiece.rotation.z = Math.PI / 2;
  eyepiece.position.x = -0.78;
  scope.add(eyepiece);
  const finder = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.44, 7), brass);
  finder.rotation.z = Math.PI / 2;
  finder.position.set(0.1, 0.17, 0.05);
  scope.add(finder);
  compactGroup(scope);
  group.add(scope);

  /* the astronomer, stooped to the eyepiece */
  const person = new THREE.Group();
  person.position.set(-0.85, 0, 0.18);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.22, 0.6, 8), coat);
  body.position.y = 1.0;
  body.rotation.z = -0.18;
  person.add(body);
  const hd = new THREE.Mesh(new THREE.IcosahedronGeometry(0.14, 0), skin);
  hd.position.set(0.1, 1.4, 0);
  person.add(hd);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.17, 0.09, 8), coat);
  cap.position.set(0.1, 1.52, 0);
  person.add(cap);
  for (const side of [1, -1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.055, 0.72, 5), dark);
    leg.position.set(0, 0.36, 0.09 * side);
    person.add(leg);
  }
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.5, 5), coat);
  arm.position.set(0.24, 1.14, -0.1);
  arm.rotation.z = -0.9;
  person.add(arm);
  compactGroup(person);
  group.add(person);

  /* a hooded lantern on the deck, so the scene has a reason to be lit */
  const lampMat = new THREE.MeshStandardMaterial({
    color: '#ffd9a0', emissive: new THREE.Color('#ff9d3c'), emissiveIntensity: 0
  });
  const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.22, 8), lampMat);
  lantern.position.set(0.5, 0.12, -0.75);
  group.add(lantern);

  group.userData.scope = scope;
  group.userData.person = person;
  group.userData.lampMat = lampMat;
  group.userData.lens = lens.material;
  return group;
}

export function createAstronomer(scene, pos, opts = {}) {
  const rand = mulberry32(2718);
  const g = makeAstronomer(rand);
  g.position.copy(pos);
  g.rotation.y = opts.facing === undefined ? -0.7 : opts.facing;
  g.visible = false;
  scene.add(g);

  const scope = g.userData.scope;
  const lampMat = g.userData.lampMat;
  const lens = g.userData.lens;

  return {
    group: g,
    update(t, mix) {
      /* only out when there is something to look at */
      g.visible = mix > 0.12;
      if (!g.visible) return;
      /* a slow sweep across the sky, pausing at the top of each arc */
      const sweep = Math.sin(t * 0.09);
      const tilt = 0.62 + Math.sin(t * 0.13 + 1.1) * 0.22;
      g.rotation.y = (opts.facing === undefined ? -0.7 : opts.facing) + sweep * 0.85;
      scope.rotation.z = tilt;
      lampMat.emissiveIntensity = 1.6 * mix;
      lens.emissiveIntensity = 0.3 + 0.5 * mix;
    }
  };
}
