/* =============================================================
   BINOMAR GROUP — Data layer
   Loads company data from Sanity (if configured in js/config.js)
   or from the local file data/companies.js, then normalises
   every record so the rest of the app can trust its shape.
   ============================================================= */

export const INDUSTRY_META = {
  logistics:   { label: "Logistics & Shipping",  color: "#3b82f6" },
  foods:       { label: "Food & Beverage",       color: "#f59e0b" },
  textiles:    { label: "Textiles & Fashion",    color: "#ec4899" },
  realestate:  { label: "Real Estate",           color: "#8b5cf6" },
  tech:        { label: "Technology & IT",       color: "#06b6d4" },
  hotel:       { label: "Hospitality & Hotels",  color: "#ef4444" },
  retail:      { label: "Retail & Shopping",     color: "#22c55e" },
  pharma:      { label: "Pharmaceuticals",       color: "#14b8a6" },
  media:       { label: "Media & Creative",      color: "#a855f7" },
  travel:      { label: "Travel & Tours",          color: "#0ea5e9" },
  tourism:     { label: "Tourism & Experiences",   color: "#14b8a6" },
  dmc:         { label: "Destination Management",  color: "#e11d48" },
  outbound:    { label: "Outbound Travel",         color: "#f97316" },
  energy:      { label: "Energy & Power",        color: "#eab308" },
  finance:     { label: "Finance & Investment",  color: "#64748b" },
  construction:{ label: "Construction",          color: "#d97706" }
};

export function getIndustryMeta(key) {
  return INDUSTRY_META[key] ||
    { label: key ? key.charAt(0).toUpperCase() + key.slice(1) : "Group", color: "#64748b" };
}

function clampInt(n, min, max, dflt) {
  n = Number(n);
  if (!isFinite(n)) n = dflt;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function normalize(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.id || raw.slug || "").trim();
  const name = String(raw.name || "").trim();
  if (!id || !name) return null;

  /* description may be: a string, an array of strings,
     or Sanity portable-text blocks — handle all three. */
  let paragraphs = [];
  const d = raw.description;
  if (typeof d === "string") {
    paragraphs = d.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
  } else if (Array.isArray(d)) {
    if (d.length && typeof d[0] === "string") {
      paragraphs = d.map((s) => String(s).trim()).filter(Boolean);
    } else {
      paragraphs = d
        .map((b) => (b && b.children ? b.children.map((c) => c.text || "").join("") : ""))
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  if (!paragraphs.length) paragraphs = ["More information coming soon."];

  const meta = getIndustryMeta(raw.industry);
  return {
    id,
    name,
    industry: raw.industry || "other",
    style: String(raw.style || "").trim(),
    tagline: String(raw.tagline || "").trim(),
    description: paragraphs,
    logo: String(raw.logo || "").trim(),
    gallery: Array.isArray(raw.gallery) ? raw.gallery.filter(Boolean) : [],
    website: String(raw.website || "").trim(),
    phone: String(raw.phone || "").trim(),
    email: String(raw.email || "").trim(),
    address: String(raw.address || "").trim(),
    plot: clampInt(raw.plot, 0, 999, 0),
    floors: clampInt(raw.floors, 1, 14, 3),
    color: /^#[0-9a-fA-F]{6}$/.test(String(raw.color || "")) ? raw.color : meta.color,
    featured: !!raw.featured
  };
}

async function fetchFromSanity() {
  const cfg = window.BINOMAR_CONFIG || {};
  if (!cfg.sanityProjectId) return null;
  const q = encodeURIComponent(
    '*[_type == "company"] | order(plot asc){' +
    ' name, "id": slug.current, industry, style, tagline, description,' +
    ' "logo": logo.asset->url, "gallery": gallery[].asset->url,' +
    ' website, phone, email, address, plot, floors, color, featured }'
  );
  const url = "https://" + cfg.sanityProjectId + ".api.sanity.io/v" +
    cfg.sanityApiVersion + "/data/query/" + cfg.sanityDataset + "?query=" + q;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Sanity HTTP " + res.status);
  const json = await res.json();
  return (json.result || []).map(normalize).filter(Boolean);
}

export async function loadCompanies() {
  try {
    const remote = await fetchFromSanity();
    if (remote && remote.length) return remote;
  } catch (e) {
    console.warn("[binomar] Sanity unavailable — using local data:", e.message);
  }
  return (window.LOCAL_COMPANIES || []).map(normalize).filter(Boolean);
}
