/* =============================================================
   BINOMAR GROUP — Sanity CMS schema (the "backend")
   -------------------------------------------------------------
   HOW TO SET UP (≈10 minutes, free):
   1.  npm create sanity@latest  →  choose "Clean project",
       give it a display name, choose the default dataset
       ("production") and "Publishing studio" template.
   2.  In the generated studio project, create the file
       sanity/schemas/company.js and paste this whole file in.
   3.  Register it in sanity/schemas/index.js:
         import company from './company'
         export const schemaTypes = [company]
   4.  npm run dev  →  your studio opens (localhost:3333).
       Add companies — each published company automatically
       becomes a building on the 3D map.
   5.  Copy the project ID (sanity.io/manage) into js/config.js
       of the website, redeploy, done.
   ============================================================= */

export default {
  name: 'company',
  title: 'Company',
  type: 'document',
  fields: [
    {
      name: 'name',
      title: 'Company name',
      type: 'string',
      validation: (Rule) => Rule.required()
    },
    {
      name: 'slug',
      title: 'Slug (the id used in URLs, e.g. binomar-tech)',
      type: 'slug',
      options: { source: 'name', maxLength: 64 },
      validation: (Rule) => Rule.required()
    },
    {
      name: 'industry',
      title: 'Industry (drives the filter chips + default building style)',
      type: 'string',
      options: {
        list: [
          { title: 'Logistics & Shipping', value: 'logistics' },
          { title: 'Food & Beverage', value: 'foods' },
          { title: 'Textiles & Fashion', value: 'textiles' },
          { title: 'Real Estate', value: 'realestate' },
          { title: 'Technology & IT', value: 'tech' },
          { title: 'Hospitality & Hotels', value: 'hotel' },
          { title: 'Retail & Shopping', value: 'retail' },
          { title: 'Pharmaceuticals', value: 'pharma' },
          { title: 'Media & Creative', value: 'media' },
          { title: 'Travel & Tours', value: 'travel' },
          { title: 'Tourism & Experiences', value: 'tourism' },
          { title: 'Destination Management', value: 'dmc' },
          { title: 'Outbound Travel', value: 'outbound' },
          { title: 'Energy & Power', value: 'energy' },
          { title: 'Finance & Investment', value: 'finance' },
          { title: 'Construction', value: 'construction' }
        ],
        layout: 'radio'
      },
      validation: (Rule) => Rule.required()
    },
    {
      name: 'style',
      title: 'Building style (architecture on the mountain)',
      type: 'string',
      options: {
        list: [
          { title: 'Modern glass tower', value: 'modern-tower' },
          { title: 'Modern office', value: 'modern-office' },
          { title: 'Modern shop block', value: 'modern-shop' },
          { title: 'Georgian house (carved balconies, tile roof)', value: 'georgian' },
          { title: 'Alpine chalet (timber walls, flower boxes)', value: 'chalet' },
          { title: 'Stone barn (hay loft)', value: 'barn' },
          { title: 'Market hall (columns + awning)', value: 'hall' }
        ],
        layout: 'radio'
      },
      description: 'Leave empty to use the default style for the chosen industry.'
    },
    {
      name: 'tagline',
      title: 'Tagline (shown on hover)',
      type: 'text',
      rows: 2
    },
    {
      name: 'description',
      title: 'Description (detail page — one block per paragraph)',
      type: 'array',
      of: [{ type: 'block' }]
    },
    {
      name: 'logo',
      title: 'Logo (empty = letter avatar)',
      type: 'image',
      options: { hotspot: true }
    },
    {
      name: 'gallery',
      title: 'Gallery images',
      type: 'array',
      of: [{ type: 'image' }],
      options: { layout: 'grid' }
    },
    { name: 'website', title: 'Website URL', type: 'url' },
    { name: 'phone',   title: 'Phone',       type: 'string' },
    { name: 'email',   title: 'Email',       type: 'string' },
    { name: 'address', title: 'Head office address', type: 'text', rows: 2 },
    {
      name: 'plot',
      title: 'Sort order / plot number (lower = first in list)',
      type: 'number',
      initialValue: 100
    },
    {
      name: 'floors',
      title: 'Floors (1–14, drives the building height on the map)',
      type: 'number',
      initialValue: 3,
      validation: (Rule) => Rule.min(1).max(14)
    },
    {
      name: 'color',
      title: 'Brand color (hex, e.g. #3b82f6 — leave empty for the industry color)',
      type: 'string'
    },
    {
      name: 'featured',
      title: 'Featured (gold pin on the map + inner-ring placement)',
      type: 'boolean',
      initialValue: false
    }
  ],
  preview: {
    select: { title: 'name', subtitle: 'industry', media: 'logo' }
  }
};
