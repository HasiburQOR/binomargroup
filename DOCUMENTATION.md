# BINOMAR GROUP — Project Documentation & AI Context

> **Purpose of this file:** the single source of truth for the binomargroup.com
> project. Written so that **any AI agent (or new developer) can read this one
> file** and understand the vision, the tech, the constraints and the
> improvement backlog without reverse-engineering the codebase.
> Last updated: 2026-09-24.

---

## 1. The Vision

### 1.1 What Binomar Group is
Binomar Group is a **holding company for travel & tourism brands**, currently
four subsidiaries (sample data — to be replaced with real copy via CMS):

| Company | Industry | Role | Founded |
|---|---|---|---|
| **Traveldoor** | Travel & Tours | Flagship full-service travel agency — holidays, honeymoons, corporate trips | 2012 |
| **MAQ Tourism** | Tourism & Experiences | Signature small-group tours with hand-picked local guides | 2016 |
| **Hashtag Georgia** | Destination Management (DMC) | Ground services, MICE and tailor-made routes in the country of Georgia | 2018 |
| **Traveldoor Outbound** | Outbound Travel | Visa processing, worldwide ticketing, study & work travel | 2020 |

### 1.2 The digital vision
> **"The website is a place, not a page."**

binomargroup.com must feel like visiting the group's world headquarters —
not like scrolling a brochure. Two 3D experiences carry this idea:

1. **The Company District** (live) — an interactive **night-lit mountain-top
   village at dusk** where every subsidiary is a building. Featured brands
   ring the summit plaza; the rest step down the slopes. Hover = quick info
   card, click = camera dives into the building and opens its detail page.
   Day/night toggle, wildlife, weather-influenced ambience, a real sky
   (Milky Way, aurora, meteors at night).
2. **The Global HQ Tower** (asset built, integration pending — see §7) — a
   130 m low-poly premium skyscraper with glowing "BINOMAR GROUP" facade
   signage, 442 lit windows and champagne-gold accents, exported from
   Blender as a single GLB, presented in an interactive 3D viewer.

### 1.3 Brand personality
- **Premium but warm.** Glass, gold and dusk light — not sterile corporate.
- **Night-first.** The world opens at night because that is when it is at
  its best; warm light against deep navy is the core mood.
- **Names in the skyline.** The group's name must always be visible and
  luminous — on the tower facade, on floating plates above every building.
- **Quality as a feature.** Perf, accessibility and mobile are design
  requirements, not afterthoughts (see §8).

---

## 2. The Two Experiences (status board)

| Experience | Status | Entry point |
|---|---|---|
| 3D Company District | ✅ Live in this repo | `index.html` |
| Company detail pages | ✅ Live | `company.html?id=...` |
| Global HQ Tower showcase | 🔶 Built (GLB + page ready locally), **not yet committed** | planned `/tower.html` |
| Sanity CMS backend | ⏸ Optional, schema ready, not connected | `sanity/schema.js` + `js/config.js` |


---

## 3. Tech Stack (what we use — do not introduce build tools without reason)

| Layer | Choice | Notes |
|---|---|---|
| 3D engine (district) | **Three.js `0.160.0`** | Loaded via import map from jsDelivr CDN — **no npm, no bundler** |
| 3D viewer (tower page) | **Google `<model-viewer>` v4** | Web component, AR-ready, zero code |
| Language | Vanilla **ES modules** | No TypeScript, no framework, no build step |
| Styling | Hand-written `css/style.css` | Semantic aliases (`--bg`, `--accent`, `--line`) lifted from the 3D scene palette |
| Font | Plus Jakarta Sans (Google Fonts) | Loaded via `<link>` |
| Data | `data/companies.js` (global `LOCAL_COMPANIES`) | Optional **Sanity CMS** override via `js/config.js` (`window.BINOMAR_CONFIG.sanityProjectId`) |
| Dev server | `node server.mjs [port]` | Node built-ins only; correct MIME incl. `.glb` |
| Production server | **nginx:alpine** Docker image | `Dockerfile` + `nginx.conf` in repo root |
| Hosting | **Dokploy** on our own server | Domain: **binomargroup.com** (+ www), Let's Encrypt via Dokploy/Traefik |
| Repo | github.com/HasiburQOR/binomargroup | branch `main` |

### 3.1 Why no build step
The site is deliberately dependency-free so it runs on any static host, any
container, and can be edited by non-engineers (and AI agents) without a
toolchain. Keep it that way unless there is a compelling reason.

---

## 4. Repository Map

```
binomargroup/
├── index.html              ← the 3D district map (entry point)
├── company.html            ← company detail page (?id=traveldoor …)
├── css/style.css           ← all styling (map HUD + detail pages)
├── js/
│   ├── config.js           ← window.BINOMAR_CONFIG (Sanity hookup, site name)
│   ├── data.js             ← loads + normalises data (Sanity OR local), INDUSTRY_META
│   ├── city.js             ← scene, lights, day/night (envMix), hover/click, HUD, dive
│   ├── city-build.js       ← terrain, roads, layout, buildings, compactGroup(), mulberry32
│   ├── detail.js           ← architectural detail: shingles, dormers, porches, smoke, gardens
│   ├── sky.js              ← Milky Way dome, stars, aurora, meteors, moon, day gradient
│   ├── nature.js           ← trees, conifers, instanced grass, wind leaves, windmill
│   ├── monument.js         ← plaza landmark: statue + four-faced group sign
│   ├── banner.js           ← camera-facing floating company name plates
│   ├── clouds.js           ← billboard cumulus + cirrus veil
│   ├── cozy.js             ← fire pit, café string lights, fireflies, warmGlowTexture()
│   ├── life.js             ← birds, deer, rabbits, villagers, astronomer
│   ├── hamlet.js           ← market stalls, inn, chapel, farm, mill, viewpoint
│   ├── water.js            ← waterfall, pool, stream (+ culverts where it crosses roads)
│   ├── road.js             ← lamps & light pools, crash barrier, markings, traffic
│   ├── quality.js          ← device tier detection → scene budget (one dial)
│   └── company.js          ← detail page renderer
├── data/companies.js       ← local company "database" (fallback / demo mode)
├── sanity/schema.js        ← Sanity CMS schema + 10-minute setup instructions
├── server.mjs              ← one-command local dev server (Node built-ins)
├── package.json            ← metadata only (no dependencies)
├── Dockerfile              ← nginx:alpine image — builds the production container
├── nginx.conf              ← gzip, asset caching, correct .glb MIME types
├── docker-compose.yml      ← Dokploy Compose deployments (traefik labels + dokploy-network)
├── .dockerignore           ← keeps .git/.claude/node_modules out of the image
└── DOCUMENTATION.md        ← this file
```

---

## 5. Data Model (a company = a building)

Defined twice, kept in sync: `data/companies.js` (local) and `sanity/schema.js` (CMS).

| Field | Type | Effect |
|---|---|---|
| `id` / slug | string | URL id, building seed (hashes derive architecture from it) |
| `name` | string | Floating banner + detail page title |
| `industry` | enum | Default building style + label colour (`INDUSTRY_META` in `js/data.js`) |
| `style` | enum | Architecture override: `modern-tower`, `modern-office`, `modern-shop`, `georgian`, `chalet`, `barn`, `hall` |
| `floors` | 1–14 | Building height |
| `plot` | number | Sort order; auto-assigned to next free plot |
| `featured` | bool | Gold pin + summit-plateau placement |
| `color` | hex | Brand colour (building + detail page) |
| `tagline`, `description[]`, `address`, `phone`, `email`, `website`, `founded`, `logo`, `gallery[]` | — | Hover card + detail page content |

**Adding a company = adding one object.** The building, banner, detail page
and finder entry all appear automatically. Industry enum (16 options) lives in
`sanity/schema.js`.

---

## 6. Deployment (Dokploy — how binomargroup.com is served)

Two supported paths; both build the same `Dockerfile` (nginx:alpine, port 80):

### 6.1 Application resource (preferred)
Dokploy → Project → **Application** → GitHub repo `HasiburQOR/binomargroup`,
branch `main`, build type **Dockerfile**, **port 80**. Domains added in the UI
(`binomargroup.com`, `www.binomargroup.com`) hot-reload through Dokploy's
Traefik file provider — no redeploy needed — with automatic Let's Encrypt.

### 6.2 Compose resource
Uses `docker-compose.yml` (service `web`, `build: .`, external
`dokploy-network`, traefik labels reading `${DOKPLOY_DOMAIN}`).
Set env var **`DOKPLOY_DOMAIN=binomargroup.com`** in the service settings,
then redeploy. Domain changes always require a redeploy for Compose.

### 6.3 DNS (registrar)
`A @ → server IP` and `A www → server IP`. If behind Cloudflare, keep records
**DNS-only (grey cloud)** until the certificate is issued. Ports 80/443 open.

### 6.4 Local development
```
node server.mjs        # → http://localhost:8080   (or: node server.mjs 3000)
```
⚠️ Opening `index.html` via `file://` does NOT work (browsers block ES
modules) — the site detects it and shows instructions.


---

## 7. The Global HQ Tower (asset ready — integration is P0)

**What it is:** the group's "corporate headquarters skyscraper", modeled in
Blender (5.2) at low-poly/flat-shaded style for web performance.

| Spec | Value |
|---|---|
| Height | ~130 m (podium + 3 tapered glass tiers 19 → 15.5 → 12.5 m + crown + spire) |
| Windows | **442 panels** (216 / 128 / 70 / 28) — mix of dark, warm-lit, cool-lit |
| Branding | Glowing stacked **BINOMAR / GROUP** facade letters, gold entrance sign, "GLOBAL HEADQUARTERS" tagline |
| Details | Champagne-gold tier collars, glowing crown lantern, red beacon, LED edge strips, plaza with water ring, 14 bollards, 6 street lamps, dusk sky |
| File | `binomar_group_tower.glb` (~450 KB, single file, emissive materials baked in, KHR_lights_punctual) |
| Source files | Local build machine only (`D:\blender\` scene + `D:\blender\site\` showcase page) — **not yet in this repo** |

**Reference viewer page** (ready to commit as `/tower.html`): uses
`<model-viewer>` v4 with `camera-orbit="-25deg 76deg 200m"`,
`min/max-camera-orbit="auto auto 40m/500m"`, `exposure="1.25"`,
`auto-rotate` 18°/s — proven settings that frame the tower well.

**How to integrate (for the AI picking this up):**
1. Copy `binomar_group_tower.glb` into the repo root (nginx + server.mjs
   already serve `.glb` with correct MIME + range requests).
2. Add the showcase page as `tower.html` (adapt its CSS to the site's
   `--bg/--accent` aliases) and link it from the district HUD / monument
   ("Visit the Global HQ →").
3. Optional deeper integration: load the GLB inside the district with
   `GLTFLoader` as a new landmark, or as the featured building of the parent
   holding on the summit.

---

## 8. Architecture Principles (how the district is engineered)

These are deliberate design decisions — **respect them when changing code:**

- **One height function.** Terrain `H(x, z)` is sampled by roads, buildings,
  lamps, trees, grass — nothing floats or sinks when layout changes.
- **One day/night number.** `envMix` (0 = noon … 1 = midnight) cross-fades
  sky, lights, emissives, headlights — nothing is toggled.
- **One gust.** A layered sine drives trees, grass (vertex shader), leaves,
  clouds, flags, windmill. Reuse it for any new wind-blown thing.
- **No two buildings alike.** Dimensions/massing/facades derive from hashes
  of the company id (`getBuildingDims()`); layout and geometry share it.
- **Draw-call diet.** `compactGroup()` bakes props to one mesh per material;
  `batchScatter()` bakes undergrowth. Scene runs ~1 700 calls (desktop) /
  ~1 400 (mobile tier) — keep new content batched.
- **One quality dial.** `detectQuality()` (js/quality.js) returns a budget
  (pixel ratio, shadows, AA, counts). Never hard-code instance counts.
- **Adaptive resolution.** Render scale steps down 15 % under ~48 fps
  (floor 60 %); HUD shows live `fps · % res`.
- **Banners beat boards.** Company names ride camera-facing sprites that
  counter-scale with distance (0.92–2.4×) — always readable.
- **Finder is the a11y path.** `/` opens a searchable list of real `<a>`
  links — keyboard + screen-reader route into the canvas.
- **Honest loading.** Loader reports real progress; `main()` yields between
  build phases so the browser can paint.
- **Debug hook.** `window.__binomar` → scene/camera/renderer,
  `setNight(0…1)`, `skipIntro()`.

---

## 9. Design Language / Palette

**District (from `css/style.css`, lifted from the 3D scene):**
- Background/surfaces: night-sky gradient blues (semantic `--bg`, `--line`)
- Primary accent: street-lamp glass **`#ffce7a`** (warm amber)
- Secondary: plaza-flag **cyan** · Body text: snow-cap near-white
- Font: Plus Jakarta Sans 400/600/700/800

**HQ Tower (from the Blender build):**
- Gold: **`#d4a955`**, bright gold: **`#f0c877`** (accents, collars, signage)
- Night navy ink: **`#05070f`**, dusk blue: **`#131a33`**, horizon amber: **`#3a1e0e`**
- Signature look: glowing white/gold emissive letters against a dusk sky

Any new page or asset should reuse these two palettes — warm light, deep
navy, gold accents, luminous branding.


---

## 10. Improvement Roadmap (prioritized backlog for AI agents)

### P0 — do these first
- [ ] **Integrate the HQ Tower** into this repo (`tower.html` + GLB; see §7).
- [ ] **Replace sample company copy** with real content (or connect Sanity:
      paste the project ID into `js/config.js`).
- [ ] **SEO & sharing**: real `<title>`/meta per company page, Open Graph +
      Twitter card images (screenshots of the district and the tower),
      `sitemap.xml`, `robots.txt`, a real favicon (replace the emoji).
- [ ] **Basic analytics** (privacy-friendly, e.g. Plausible/Umami on Dokploy).

### P1 — next iteration
- [ ] Hand-modeled `.glb` buildings from Blender replacing procedural ones
      (drop into `models/`, load with GLTFLoader) — start with the four
      real subsidiaries.
- [ ] Weather modes (snow/rain) reusing the gust system.
- [ ] Search box that flies the camera to the building (extend the finder).
- [ ] "Cinematic tour" button — scripted camera path around the district.
- [ ] Per-company hero images from the CMS gallery on detail pages.
- [ ] Tower page: AR button + poster image for faster first paint.

### P2 — nice to have
- [ ] Sound design (ambient night audio, muted by default).
- [ ] i18n (EN + KA, given the Georgia DMC).
- [ ] Careers / contact / about static pages in the same visual language.
- [ ] CMS-driven district layout (plot/featured fields already supported).

---

## 11. Known Constraints & Gotchas

1. **No `file://`** — ES modules require http; both pages show a guard
   message if opened directly from disk.
2. **Three.js is pinned `0.160.0`** via import map in `index.html` — update
   deliberately, then regression-test day/night + banner sprites.
3. `.glb` MIME is configured in **both** `server.mjs` (dev) and `nginx.conf`
   (prod). Any new binary type must be added to both.
4. **Dokploy Compose deployments** need the `DOKPLOY_DOMAIN` env var and a
   redeploy for domains; **Application** resources manage domains in the UI
   (hot reload, no redeploy).
5. `package.json` has **no dependencies** — the Docker image is pure nginx
   and `node_modules` is dockerignored. Do not add npm deps to the site.
6. Sample data is **placeholder copy** — contact details, emails and
   addresses in `data/companies.js` are fictional.
7. The tower GLB carries emissive materials + `KHR_lights_punctual` — glow
   renders in any glTF viewer, but *bloom* depends on the client renderer
   (model-viewer shows plain emissive; three.js could add UnrealBloomPass).

---

## 12. Quick Reference

```bash
# Local dev
node server.mjs                     # → http://localhost:8080

# Local docker test of the production image
docker build -t binomar-site . && docker run -p 8080:80 binomar-site

# Deploy (Dokploy)
# push to main → Dokploy auto-deploys (Application resource, Dockerfile, port 80)

# Debug the live scene from the browser console
window.__binomar.setNight(1)        # force night
window.__binomar.skipIntro()        # jump straight to the overview
```

*This document is the project's memory — update it whenever the vision,
stack, structure or roadmap changes.*



