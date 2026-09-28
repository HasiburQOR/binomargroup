# Binomar Group — 3D Company District 🏔️

> 📖 **New to this project?** Read **[`DOCUMENTATION.md`](DOCUMENTATION.md)** first —
> it contains the full vision, tech stack, repo map, deployment guide, design
> language and the prioritized improvement roadmap.

An interactive 3D mountain-top village of every company in the Binomar Group — featured brands ring the summit plaza, the rest step down the slopes along a winding road.
Each company is a **building**: hover for a quick info card,
click to open its full detail page. Add a company in the
backend → a new building automatically appears on the map.

The site opens **at night**, because that is the scene at its best.
Hit the ☀️ button and the mountain turns: the Milky Way arcs
overhead, stars twinkle, aurora curtains drift above the far
ridge, meteors streak, every window and lamp burns, the café
bulbs over the plaza glow around the fire pit, fireflies come
out over the meadows, and the headlights of the traffic on the
switchbacks sweep the tarmac — and back into daylight, with the
village sitting in a valley ringed by forest to the horizon.

Click any building and the camera dives into it before the
detail page opens.

Built with **Three.js** (no build tools, no npm install), with an
optional **Sanity CMS** backend and free hosting on
**Cloudflare Pages / Netlify / Vercel / GitHub Pages**.

---

## 🚀 Run it locally (pick one)

> ⚠️ **Don't double-click `index.html`** — browsers block ES modules on the
> `file://` protocol, so the page must be served over `http://localhost`.
> (The site detects this and shows a helpful message if you forget.)

| Method                       | How                                                                                                |
| ---------------------------- | -------------------------------------------------------------------------------------------------- |
| One command (Node installed) | `node server.mjs` in this folder → open http://localhost:8080 (add a port: `node server.mjs 3000`) |
| VS Code                      | Install the **Live Server** extension → right-click `index.html` → *Open with Live Server*         |
| Any other static server      | `npx -y http-server`, `python -m http.server`, … all work too                                      |

## 📁 Project structure

```
binomar-3d-website/
├── index.html            ← the 3D map
├── company.html          ← company detail page (?id=...)
├── css/style.css         ← all styling (map HUD + detail pages)
├── js/
│   ├── config.js         ← backend hookup (paste Sanity project ID here)
│   ├── data.js           ← loads + normalises data (Sanity OR local)
│   ├── city.js           ← scene, lights, day/night, hover/click, HUD
│   ├── city-build.js     ← terrain, roads, layout, the buildings themselves
│   ├── detail.js         ← architectural detail: shingles, dormers, porches,
│   │                       chimney smoke, gardens, tower crowns, roof plant
│   ├── sky.js            ← night sky: Milky Way dome, stars, aurora,
│   │                       shooting stars, moon (+ the daytime gradient)
│   ├── nature.js         ← big trees, conifers, undergrowth, instanced
│   │                       grass, wind-blown leaves, the ridge windmill
│   ├── monument.js       ← the plaza landmark: statue + four-faced sign
│   ├── banner.js         ← the camera-facing rooftop name signs
│   ├── buildings.js      ← the four company building designs (models + paint + roofs)
│   ├── clouds.js         ← billboard cumulus, cirrus veil
│   ├── cozy.js           ← the fire pit, café string lights, fireflies
│   ├── life.js           ← birds, deer & rabbits, villagers, astronomer
│   ├── hamlet.js         ← market stalls, inn, chapel, farm, mill, viewpoint
│   ├── water.js          ← the waterfall, its pool and the stream
│   ├── quality.js        ← one place that decides how much scene to draw
│   ├── models.js         ← the 3D model library: loads, normalises, instances
│   ├── road.js           ← street lamps & light pools, crash barrier,
│   │                       markings, signage and the moving traffic
│   └── company.js        ← detail page renderer
├── assets/models/        ← the .glb models: downloaded + the four hq-*.glb (+ CREDITS.md)
├── blender/              ← binomar-buildings.blend: source of the hq-*.glb headquarters
├── data/companies.js     ← local company data (your mini-database)
├── sanity/schema.js      ← Sanity CMS schema + setup instructions
└── package.json
```

## ➕ Add / edit a company (no backend needed yet)

Open `data/companies.js`, copy an existing company block, change
the values and save. Refresh the site — the new building appears
automatically on the next free plot, styled by its `industry`.

Key fields:

- `industry` → default building style + label colour (see `INDUSTRY_META` in `js/data.js`)
- `style` → architecture: `modern-tower`, `modern-office`, `modern-shop`, `georgian`, `chalet`, `barn`, `hall` (empty = industry default)
- `floors` (1–14) → building height
- `featured: true` → gold floating pin + summit-plateau placement
- `color` → brand color (hex), used for the building and the detail page

## 🔌 Connect the real backend (Sanity CMS, free)

1. `npm create sanity@latest` (free account)
2. Paste `sanity/schema.js` into the studio (instructions in that file)
3. `npm run dev` → add companies in the studio at `localhost:3333`
4. Copy the **project ID** from sanity.io/manage into `js/config.js`
5. Redeploy — the site now reads live from Sanity and falls back to
   the local file automatically if the API is unreachable.

## 🌍 Deploy for free + use binomargroup.com

1. Push this folder to a GitHub repository
2. Cloudflare Pages (recommended): *Create project → Connect to Git →*
   framework preset **None**, build command empty, output dir `/`
3. Add a **custom domain** → `binomargroup.com`
4. At your domain registrar, point DNS to Cloudflare Pages:
   - `A` record: `@` → `192.0.2.1` placeholder is auto-replaced; simply
     follow the exact records Cloudflare shows you (one `CNAME` for
     `www`, one `A`/`CNAME` for the root). Takes ~5 minutes to go live.

(Netlify / Vercel / GitHub Pages work identically — any static host.)

## 🔧 How the scene is put together

- **One height function.** `makeBaseTerrain()` + `withPads()` produce the
  heightfield `H(x, z)`; roads, buildings, lamps, trees and grass all sample
  it, so nothing floats or sinks when the layout changes.
- **One day/night number.** `envMix` (0 = noon, 1 = midnight) drives the sky,
  the lights, every emissive material, the headlights and the light pools.
  Nothing is toggled — it all cross-fades.
- **One gust.** A layered sine in `animate()` produces `gust`, which sways the
  trees, bends the grass (in the vertex shader), ripples the flag and bunting,
  drifts the leaves and clouds, and turns the windmill.
- **Clouds are puffs, not spheres.** Each cloud in `clouds.js` is a single
  InstancedMesh of quads billboarded in the vertex shader. The sprite itself is
  deliberately soft and featureless — the lumpiness comes from stacking dozens
  of them, and the volume comes from `aShade`, a per-instance ramp built from
  how high the puff sits in its own cloud and which side of it faces the sun.
- **One palette, two files.** Every colour in `css/style.css` is lifted out of
  the 3D scene — the night sky gradient becomes the page background and
  surfaces, the street-lamp glass (`#ffce7a`) is the primary accent, the plaza
  flag's cyan is the secondary, the snow caps are the body text. The rest of
  the sheet speaks in semantic aliases (`--bg`, `--accent`, `--line`), so the
  scene and the page stay in step from one `:root` block.
- **The ground never ends.** The detailed terrain is a 430-unit plane, and a
  plane has a rim. `makeOuterPlain()` runs a rolling plain out past the fog
  wall and `makeDistantForest()` stands five belts of trees on it, each belt
  washed further toward the haze so fog and colour do the aerial perspective
  together. Both sample `outerHeight()`, so the treeline follows the land. The
  day sky gradient lands on the exact fog colour at the horizon, so ground and
  sky meet without a seam.
- **Every name reads from every angle.** A board on a roof is invisible
  edge-on and mirrored from behind, so company names ride on sprites instead:
  `makeRoofSign()` stands a card on a low pedestal on each roof, and because
  the card is a sprite it turns to face the camera every frame. Whichever way
  the visitor orbits, the name is square-on. The card is quiet: dark glass, the
  brand colour in one badge with the company initial, the name, the industry,
  and a small round "›" that says it opens. It brightens a touch under the
  cursor, and a soft ring in the brand colour breathes on the ground around
  every building — the "this is clickable" cue, deliberately not flashy. The plaza monument keeps a built
  four-sided sign block — it is architecture, not a label.
- **Headquarters modelled for the site.** The four companies' buildings are
  original Blender models (`blender/binomar-buildings.blend`, one collection
  per building, exported to `assets/models/hq-*.glb`): Traveldoor's stepped
  glass tower with a lit blue fin, MAQ Tourism's planted terraces, Hashtag
  Georgia's twin towers with a sky-bridge, and Traveldoor Outbound's
  control-tower crown. Materials are named (`Glass_Lit`, `Brand`,
  `Brand_Light`, `Gold`…) so the site can light the offices after dark and
  repaint `Brand*` in any company's colour. To edit one: change it in
  Blender, join a copy of its collection and export it as GLB (+Y up) over
  the same file.
- **The Binomar Group HQ is the landmark.** `hq-binomar.glb` (same Blender
  file): a reflecting-pool plinth, a gold-columned lobby, three stepped
  chamfered glass tiers with gold collars and warm LED corner strips, the
  sign band (lettered at runtime from `signTexture()` onto its `Sign`
  faces), a lantern crown ringed by gold blades and a spire with a blinking
  beacon. Every company building's front faces it.
- **Nothing on the road.** `roadDist()` measures the true distance to the
  spiral and every garden path through an 8 m grid; trees, props and plots
  use it, and the hamlet, windmill, wheel and crane sites are reserved before
  the woods are planted. The summit plots sit in the arc the road never
  crosses.
- **Names you can read.** A sign in the scene shrinks with distance — from the
  overview a rooftop name is a few pixels of texture. The names are HTML
  labels (`buildLabels()` / `updateLabels()` in `city.js`): each frame the
  rooftop is projected to the screen and a fixed-size tag placed on it;
  overlapping tags lift clear and their stems grow. They are real links. The
  HQ's sign band carries one bold line of lettering for close views.
- **Phones zoom in for you.** A portrait screen gets a wider lens and a closer
  seat (`frameForViewport()`), and a row of chips flies the camera to each
  company; the pinned card then opens it.
- **A graded road.** `withRoadBed()` cuts a road bed into the height
  function: level across the carriageway, a steady descent along it (9 %
  at most, never climbing back), eased into the slope as an embankment.
  Terrain colour reads the ungraded hillside, so the banks stay grassy.
- **Night is moonlight.** A bright silver key from the moon's side over a
  low blue fill, a violet-indigo sky, a brighter Milky Way and aurora, and
  bloom (desktop tiers) so windows, lamps, lanterns and the HQ's LEDs glow.
- **Fallback: four designs, four colours.** Without the hq models,
  `js/buildings.js` turns the two building models into four designs — a
  stacked brick spire tower, an L-shaped brick court, a brutalist with a roof
  garden and one with a glass penthouse — picked by `plot` so the group's
  companies never share one, and repainted from each brand colour (the
  brick is re-hued pixel by pixel, the concrete by part). Roof pieces are
  placed by casting rays onto the model, so they sit on its real roofs.
- **No two procedural buildings alike** (the fallback). `getBuildingDims()` derives width, depth, storey
  height, curtain-wall language, massing, roofline and wing from hashes of the
  company id. Layout and geometry both call it, so the terrain pads always
  match. Six ways to stack a modern block (slab, round tower, stepped
  ziggurat, twin wings with a sky-bridge, tapered shaft, L-plan), four facade
  patterns, three pitched-roof silhouettes and three house footprints (plain,
  side wing, corner turret). Roof and wing are drawn from their own hashes —
  off the shared stream they kept landing on the same value for half the
  village.
- **The monument is the landmark.** Every company building is scaled to 0.76
  and the plateau ring pushed out to r=23, while the plaza monument stands at
  1.38× on a widened square. The hierarchy is deliberate: the group's mark
  reads first, its companies second.
- **Banners that fight perspective.** A sprite shrinks as the camera pulls
  back, which is exactly wrong for a label you want readable from the
  overview. Each frame the sign measures its distance to the camera and
  scales up to cancel most of that out, clamped to 0.85–1.9×. It is anchored
  at its bottom edge, so it grows upward from its pedestal and never leaves
  the roof.
- **A hero, not a trap.** The map is the hero of a page with content below,
  so the wheel scrolls the page; Ctrl/⌘ + wheel (or a trackpad pinch) and the
  +/− buttons zoom the map. On touch, vertical swipes scroll the page,
  sideways drags orbit and two fingers pinch-zoom. The hero stops just short
  of the fold so the next band peeks in.
- **Woods, not a salt-shake.** Trees grow in small single-species forests —
  birch and broadleaf near the summit, pine on the middle slopes, maple on
  the lower meadows — with a few specimen trees between them. A tiled
  grass-blade texture on the terrain and clumps of meadow grass keep the
  open slopes from reading as bare lawn.
- **Nothing on rails.** Birds soar rather than flap to a metronome: wings
  hinge at the wrist so the tip trails the shoulder, the downstroke is fast
  and the recovery slow, and soaring birds flap only in bursts. They follow
  a drifting path rather than a circle and bank into their turns. Deer and
  rabbits run a small state machine — graze, look up, walk somewhere — and
  sample the terrain height so they walk on it. Villagers keep hours: each
  owns a day station on the plaza and a night station at the fire or under
  a lamp, and simply walks to whichever the clock calls for, so toggling
  ☀️/🌙 sends the whole village somewhere else.
- **Batching the undergrowth.** Hundreds of bushes, boulders, stumps and
  cairns would be hundreds of draw calls, so the scatter builders share a
  fixed material palette and `batchScatter()` bakes the lot down to one mesh
  per material once they are placed. Only things that move on their own —
  trees in the wind, flowers, animals — stay separate.
- **One quality dial.** `detectQuality()` reads pointer type, screen size,
  core count and pixel ratio and returns a budget — pixel ratio, shadows,
  antialiasing, and counts for grass, trees, scatter, clouds, stars, traffic,
  animals and villagers. Nothing hard-codes a count. A phone gets a smaller
  village, not a slideshow of the big one: **~165 draw calls and ~520 k
  triangles on the `tiny` tier against ~205 and ~1.4 M (shadow pass
  included) on desktop**, with shadows and AA off and the pixel ratio
  pinned to 1. The instanced model library traded triangles for draw calls:
  the procedural village drew ~1 400 / ~2 450 calls.
- **Fluency is defended at runtime, too.** The shadow map rebuilds every other
  frame (`shadowMap.autoUpdate = false` + a cadence tick — soft edges make the
  halved cost invisible), and an adaptive-resolution governor in `animate()`
  averages real frame times and quietly steps the render resolution down in
  15 % steps (floor 60 %) whenever the average slips under ~48 fps, climbing
  back when there is headroom. The bottom-left HUD shows live `fps · % res`
  so regressions are numbers, not vibes.
- **The stream has to get past the road.** The waterfall is sited by sampling
  the terrain — the east-north-east flank is the steepest face the mountain
  offers and sits 95 units clear of the switchback. Its stream then runs
  downhill and crosses the road twice, so `city.js` finds every crossing by
  walking the stream against the road samples and drops an arched culvert at
  each one. Water running over a carriageway is the kind of detail that
  breaks everything else.
- **Finding, not just browsing.** A 3D map is a lovely way to browse and a
  poor way to find. The finder (`/` to open) searches the same company data
  the district is built from — and because
  the finder is a list of real `<a>` links, it is also the entire keyboard
  and screen-reader route into what is otherwise one unlabelled canvas.
  Arrow keys walk the district, Enter opens, Esc backs out.
- **Loading that tells the truth.** Building this world blocks the main
  thread for a second on a desktop and several on a phone. `main()` yields
  between phases so the browser can paint, and the loader bar reports real
  progress instead of sliding on a CSS animation. `step()` races
  `requestAnimationFrame` against a timer, because a backgrounded tab
  throttles rAF and the build would otherwise never finish.
- **Every visit opens the same way.** Links back from a company page land on
  the fixed overview — the same angle for everyone, close enough that the
  buildings around the plaza fill the first frame. The world is already
  turning in a slow orbit (one lap ≈ two minutes) so every name plate stays
  in view, and time of day is remembered between visits.
- **The dive.** Clicking a building hands off to a camera flight that eases on
  `p²·¹` — barely moving at first, then rushing — with a late narrowing of the
  field of view that reads as speed far more than translation alone, and a fade
  that takes over before the detail page loads.
- **Warmth is a light, not a filter.** The daylight preset is late-afternoon
  rather than noon (low golden key, long shadows), and every warm source at
  night — fire, café bulbs, porch lanterns, lamp posts — pairs an emissive
  material with an additive pool of light on the ground beneath it.
- **Draw-call diet.** `compactGroup()` in `city-build.js` bakes a prop's
  child meshes down to one mesh per material. Trees, lamps, fences and the
  crash barrier all go through it — the procedural scene drew roughly 1 700
  calls instead of 2 900; with the model library instanced it is ~205.
- **Hand-made models, procedural fallbacks.** The trees, grass, rocks,
  flowers, animals, cars, clouds, company buildings, crane, ferris wheel and
  road furniture are downloaded models (`assets/models/`, credits in
  `CREDITS.md`). `js/models.js` loads them all before the world is built and
  `bake()` flattens each one to one geometry per material, stood on y = 0,
  turned to face +X and scaled to the size the caller asks for — the files
  arrive at scales from 0.8 to 490 units. Plants are baked to unit height and
  drawn as instances, so the whole forest is a few dozen draw calls, and they
  sway in the vertex shader off the same gust. If a file fails to load,
  `hasModel()` says so and the old procedural builder stands in.
  `Q.floraTris` keeps phones to the lighter tree variants.
- **Debug hook.** `window.__binomar` exposes the scene, camera, renderer and
  `setNight(0…1)` / `skipIntro()` for poking at things from the console.

## 🎨 Ideas for the next iteration

- Snow and rain weather modes reusing the existing gust system
- Search box that flies the camera to a building
- Auto "cinematic tour" button
- Per-company hero images loaded from the CMS gallery

---

*Sample company data is placeholder copy — replace with real
information via the CMS or `data/companies.js`.*
