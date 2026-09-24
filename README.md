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
│   ├── banner.js         ← the floating, camera-facing company name plates
│   ├── clouds.js         ← billboard cumulus, cirrus veil
│   ├── cozy.js           ← the fire pit, café string lights, fireflies
│   ├── life.js           ← birds, deer & rabbits, villagers, astronomer
│   ├── hamlet.js         ← market stalls, inn, chapel, farm, mill, viewpoint
│   ├── water.js          ← the waterfall, its pool and the stream
│   ├── quality.js        ← one place that decides how much scene to draw
│   ├── road.js           ← street lamps & light pools, crash barrier,
│   │                       markings, signage and the moving traffic
│   └── company.js        ← detail page renderer
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
  `makeFloatingBanner()` hangs a lit plate above each roof on a slim mast, and
  because it is a sprite it turns to face the camera every frame. Whichever way
  the visitor orbits, the name is square-on. Each plate is an illuminated destination marker: dark translucent navy, a thin
  luminous brand keyline with a soft halo, an extruded lower edge for depth, a
  drop shadow to lift it off the sky, and a pointer tail that meets the mast. It
  blooms brighter under the cursor. The plaza monument keeps a built
  four-sided sign block — it is architecture, not a label.
- **No two buildings alike.** `getBuildingDims()` derives width, depth, storey
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
  overview. Each frame the banner measures its distance to the camera and
  scales up to cancel most of that out, clamped to 0.92–2.4×, so the plate
  holds a roughly constant size on screen whether you are at the plinth or
  out past the treeline. Heights are staggered in threes and `setLift()`
  grows the mast with them, so no plate ends up floating off a stub.
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
  village, not a slideshow of the big one: **~1 400 draw calls and 256 k
  triangles on the `tiny` tier against ~2 450 and 620 k on desktop**, with
  shadows and AA off and the pixel ratio pinned to 1.
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
  crash barrier all go through it — the scene draws in roughly 1 700 calls
  instead of 2 900.
- **Debug hook.** `window.__binomar` exposes the scene, camera, renderer and
  `setNight(0…1)` / `skipIntro()` for poking at things from the console.

## 🎨 Ideas for the next iteration

- Replace the procedural buildings with hand-modeled `.glb`
  buildings from Blender (drop into `models/`, load with GLTFLoader)
- Snow and rain weather modes reusing the existing gust system
- Search box that flies the camera to a building
- Auto "cinematic tour" button
- Per-company hero images loaded from the CMS gallery

---

*Sample company data is placeholder copy — replace with real
information via the CMS or `data/companies.js`.*
