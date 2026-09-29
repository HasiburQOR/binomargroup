# Company logos

Each company can set three fields in `data/companies.js` (or in Sanity):

- **`logo`** — the whole logo, wordmark and all. Shown on the company's
  card and at the top of its company page.
- **`logoMark`** — a square icon cut from the logo, for the small round
  badges: the map tag over its building, the card avatar, the finder, the
  phone chips and the hover tooltip. Leave it empty to use `logo` there too
  (fine for a square-ish logo; a wide wordmark gets tiny).
- **`logoBg`** — the tile colour behind both, as hex. Leave it empty for the
  light tile; a white logo needs a dark one (Travel Door uses `#0f2340`).

Files here:

| Company | `logo` | `logoMark` | `logoBg` |
|---|---|---|---|
| Traveldoor | `traveldoor.webp` | `traveldoor-mark.webp` (the "td" monogram) | `#0f2340` |
| Traveldoor Outbound | same as Traveldoor | same as Traveldoor | `#0f2340` |
| MAQ Tourism | `maq-tourism.webp` | `maq-tourism-mark.webp` (the "MAQ" script) | — |
| Hashtag Georgia | `hashtag-georgia.webp` | `hashtag-georgia-mark.webp` (the "G" pin) | — |

They were made from the originals in `/logo`: trimmed to the ink, the MAQ
logo's white background made transparent, and each mark cut out and centred
on a 160 × 160 transparent square.

- **Format:** SVG is best; otherwise PNG or WebP with a transparent background.
- **Size:** 256 × 256 px is plenty for a mark.

Until a company has a logo, its badge shows its initial on its brand colour.
