/* ---------------- the fold: 3D district → page ----------------
   As the page rises over the hero, the finished frame of the district is
   drawn onto a sheet of paper that folds up like an accordion towards the
   navbar: PANELS strips, creases alternating valley / mountain, the valleys
   receding into the screen. The sheet's bottom edge sits on z = 0, so under
   the perspective camera it lands exactly on the page's top edge — city.js
   feeds `open` (0..1, the share of the hero still unfolded) straight from
   the page's own position, so the two never drift apart.

   The frame reaches this pass either as the bloom composer's finished,
   display-ready image, or as the plain render in linear HDR (then the fold
   applies the tone mapping and sRGB itself, exactly as the renderer would).
   Outside the sheet it paints the page's night colour. */
import * as THREE from 'three';

const DIST = 2.6;                              // camera distance: how much the valleys recede
const FOV = 2 * Math.atan(1 / DIST) * 180 / Math.PI;   // a flat sheet fills the view exactly

export function createFold(renderer, { panels = 4, samples = 0, bg = 0x071022 } = {}) {
  const N = panels % 2 ? panels + 1 : panels;  // even: the bottom edge must end on z = 0
  const cam = new THREE.PerspectiveCamera(FOV, 1, 0.1, 20);
  cam.position.set(0, 0, DIST);
  const scene = new THREE.Scene();

  /* the page colour behind the sheet, written raw (no colour management) */
  const c = new THREE.Color().setHex(bg, THREE.LinearSRGBColorSpace);
  const bgMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms: { uBg: { value: new THREE.Vector3(c.r, c.g, c.b) } },
    vertexShader: 'void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: 'uniform vec3 uBg; void main(){ gl_FragColor = vec4(uBg, 1.0); }',
    depthTest: false, depthWrite: false, toneMapped: false
  }));
  bgMesh.frustumCulled = false;
  bgMesh.renderOrder = -1;
  scene.add(bgMesh);

  /* the sheet: N separate quads (flat, unshared creases), rebuilt each frame */
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 4 * 3), uv = new Float32Array(N * 4 * 2), shade = new Float32Array(N * 4);
  const idx = [];
  for (let i = 0; i < N; i++) {
    const v0 = 1 - i / N, v1 = 1 - (i + 1) / N, o = i * 4;
    uv.set([0, v0, 1, v0, 0, v1, 1, v1], o * 2);
    idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('shade', new THREE.BufferAttribute(shade, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setIndex(idx);

  const vert = `
    attribute float shade;
    varying vec2 vUv; varying float vShade;
    void main(){
      vUv = uv; vShade = shade;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`;
  const frag = `
    uniform sampler2D tMap;
    varying vec2 vUv; varying float vShade;
    void main(){
      gl_FragColor = vec4(texture2D(tMap, vUv).rgb, 1.0);
      #ifdef LINEAR_SRC
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      #endif
      gl_FragColor.rgb *= vShade;             // the fold's light, after the grade
    }`;
  const mk = (linear) => new THREE.ShaderMaterial({
    uniforms: { tMap: { value: null } },
    vertexShader: vert, fragmentShader: frag,
    defines: linear ? { LINEAR_SRC: '' } : {},
    toneMapped: linear, side: THREE.DoubleSide, depthWrite: false
  });
  const matLinear = mk(true), matReady = mk(false);
  const sheet = new THREE.Mesh(geo, matLinear);
  sheet.frustumCulled = false;
  scene.add(sheet);

  /* the plain render lands here (HDR, multisampled like the canvas would be) */
  const size = new THREE.Vector2();
  renderer.getDrawingBufferSize(size);
  const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples });

  let aspect = 1;
  function setSize(w, h) {
    aspect = w / (h || 1);
    cam.aspect = aspect;
    cam.updateProjectionMatrix();
    renderer.getDrawingBufferSize(size);
    target.setSize(size.x, size.y);
  }

  function layout(open) {
    const h = Math.min(1, Math.max(0, open));
    const cos = h, sin = Math.sqrt(1 - h * h);
    const L = 2 / N, x = aspect;
    let y = 1, z = 0;
    for (let i = 0; i < N; i++) {
      const away = i % 2 === 0;               // down-and-into the screen, then back out
      const y1 = y - L * cos, z1 = z + (away ? -1 : 1) * L * sin;
      pos.set([-x, y, z, x, y, z, -x, y1, z1, x, y1, z1], i * 12);
      /* facing up towards the light on the way in, turned down on the way
         back out; the valley crease is where the shadow pools */
      const top = away ? 1 - 0.06 * sin : 1 - 0.72 * sin;
      const bot = away ? 1 - 0.48 * sin : 1 - 0.28 * sin;
      shade.set([top, top, bot, bot], i * 4);
      y = y1; z = z1;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.shade.needsUpdate = true;
  }

  /* draw `tex` folded onto the canvas; `ready` = already tone-mapped + sRGB */
  function render(tex, open, ready) {
    layout(open);
    sheet.visible = true;
    sheet.material = ready ? matReady : matLinear;
    sheet.material.uniforms.tMap.value = tex;
    renderer.setRenderTarget(null);
    renderer.render(scene, cam);
  }

  /* the sheet fully folded away: just the page colour */
  function renderBlank() {
    sheet.visible = false;
    renderer.setRenderTarget(null);
    renderer.render(scene, cam);
  }

  return { target, setSize, render, renderBlank };
}
