/* =============================================================
   BINOMAR GROUP — company detail page renderer
   Reads ?id= from the URL, finds the company in the loaded data
   and renders the full profile page into #app.
   ============================================================= */
import { loadCompanies, getIndustryMeta } from './data.js';

const $ = (s) => document.querySelector(s);
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

function avatarHtml(c) {
  if (c.logo) return `<img src="${esc(c.logo)}" alt="${esc(c.name)} logo">`;
  return esc(c.name.charAt(0).toUpperCase());
}

function contactRow(icon, label, value, href) {
  if (!value) return '';
  const val = href ? `<a href="${esc(href)}">${esc(value)}</a>` : esc(value);
  return `<div class="contact-row">
    <div class="ico">${icon}</div>
    <div><div class="lbl">${label}</div><div class="val">${val}</div></div>
  </div>`;
}

function pillsHtml(list, currentId) {
  return list
    .filter((c) => c.id !== currentId)
    .map((c) => `<a class="pill" href="company.html?id=${encodeURIComponent(c.id)}">
      <span class="dot" style="background:${esc(c.color)}"></span>${esc(c.name)}</a>`)
    .join('');
}

function companyHtml(c, all) {
  const meta = getIndustryMeta(c.industry);
  const paragraphs = c.description.map((p) => `<p>${esc(p)}</p>`).join('');
  const gallery = c.gallery.length
    ? `<section class="card"><h2>Gallery</h2><div class="gallery-grid">${
        c.gallery.map((u) => `<img src="${esc(u)}" alt="${esc(c.name)}" loading="lazy">`).join('')
      }</div></section>`
    : '';
  const siteBtn = c.website
    ? `<a class="btn" href="${esc(c.website)}" target="_blank" rel="noopener">🌐 Visit website</a>`
    : '';
  return `
  <section class="hero" style="background:linear-gradient(135deg, ${esc(c.color)}dd, #0b1220 78%)">
    <div class="hero-top">
      <div class="hero-avatar">${avatarHtml(c)}</div>
      <div>
        <span class="badge">🏛️ ${esc(meta.label)} · Binomar Group</span>
        <h1 class="hero-title">${esc(c.name)}</h1>
        <p class="hero-tagline">${esc(c.tagline || 'Part of Binomar Group')}</p>
      </div>
    </div>
  </section>

  <div class="layout">
    <section class="card about">
      <h2>About ${esc(c.name)}</h2>
      ${paragraphs}
      ${siteBtn}
    </section>
    <aside class="card">
      <h2>Contact</h2>
      ${contactRow('📍', 'Head office', c.address)}
      ${contactRow('📞', 'Phone', c.phone, c.phone ? 'tel:' + c.phone.replace(/[^+\d]/g, '') : '')}
      ${contactRow('✉️', 'Email', c.email, c.email ? 'mailto:' + c.email : '')}
      ${contactRow('🌐', 'Website', c.website, c.website || '')}
    </aside>
  </div>

  ${gallery}

  <section class="card">
    <h2>More from the district</h2>
    <div class="pills">${pillsHtml(all, c.id)}</div>
  </section>`;
}

function notFoundHtml(all) {
  return `<div class="notfound">
    <h1>🏛️ Company not found</h1>
    <p>That building isn't on the map (yet). Try one of these:</p>
    <div class="pills" style="justify-content:center;margin-top:18px">${pillsHtml(all, null)}</div>
    <p style="margin-top:26px"><a class="btn" href="index.html">🗺️ Back to the 3D district</a></p>
  </div>`;
}

async function init() {
  const id = new URLSearchParams(location.search).get('id');
  const all = await loadCompanies();
  const c = all.find((x) => x.id === id) || null;
  document.title = c ? `${c.name} — Binomar Group` : 'Not found — Binomar Group';
  $('#app').innerHTML = c ? companyHtml(c, all) : notFoundHtml(all);

  /* links back to the district land on the fixed rotating overview — the map
     opens the same way for everyone */
  if (c) {
    const back = 'index.html';
    for (const sel of ['#backLink', '#mapLink']) {
      const el = $(sel);
      if (el) el.href = back;
    }
  }
}

init().catch((e) => {
  $('#app').innerHTML = `<div class="notfound"><h1>⚠️ Something went wrong</h1><p>${esc(e.message || e)}</p></div>`;
});
