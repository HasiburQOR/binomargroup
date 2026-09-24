/* =============================================================
   BINOMAR GROUP — Site configuration
   -------------------------------------------------------------
   Leave sanityProjectId EMPTY to use the local sample data in
   data/companies.js  (great for development / demo mode).

   To connect a real Sanity CMS backend later:
     1. Create a free project at https://www.sanity.io
     2. Paste the schema from sanity/schema.js into the studio
     3. Copy your project ID into sanityProjectId below
   The site then loads companies live from Sanity and
   automatically falls back to local data if anything fails.
   ============================================================= */
window.BINOMAR_CONFIG = {
  sanityProjectId: "",            // e.g. "ab12cd34"  (empty = local data)
  sanityDataset: "production",
  sanityApiVersion: "2024-01-01",
  siteName: "Binomar Group",
  mapTitle: "Binomar District"
};
