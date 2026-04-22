'use strict';

const API = '/api';

// ── Gallery state ─────────────────────────────────────────
let _imgs = [];
let _idx  = 0;
let _keyFn = null;

function galleryNav(dir) {
  setImg(Math.max(0, Math.min(_imgs.length - 1, _idx + dir)));
}

function setImg(idx) {
  _idx = idx;
  const hero    = document.getElementById('galleryHero');
  const counter = document.getElementById('galleryCounter');
  if (hero)    hero.src = _imgs[idx];
  if (counter) counter.textContent = `${idx + 1} / ${_imgs.length}`;
  document.querySelectorAll('.gallery-thumb').forEach((el, i) => {
    el.classList.toggle('active', i === idx);
    if (i === idx) el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  });
}

function buildGallery(images) {
  const wrap = document.getElementById('listingGallery');
  if (!images || images.length === 0) { wrap.innerHTML = ''; return; }

  const multi = images.length > 1;

  const thumbsHtml = multi
    ? `<div class="gallery-thumbs">${
        images.map((url, i) => `
          <img class="gallery-thumb${i === 0 ? ' active' : ''}"
               src="${esc(url)}" alt="Photo ${i + 1}"
               onclick="setImg(${i})" />`).join('')
      }</div>`
    : '';

  wrap.innerHTML = `
    <div class="gallery">
      <div class="gallery-hero-wrap">
        ${multi ? `<button class="gallery-arrow gallery-prev" onclick="galleryNav(-1)" aria-label="Previous photo">&#8249;</button>` : ''}
        <img id="galleryHero" class="gallery-hero"
             src="${esc(images[0])}" alt="Property photo" />
        ${multi ? `<button class="gallery-arrow gallery-next" onclick="galleryNav(1)" aria-label="Next photo">&#8250;</button>` : ''}
        ${multi ? `<span class="gallery-counter" id="galleryCounter">1 / ${images.length}</span>` : ''}
      </div>
      ${thumbsHtml}
    </div>`;

  // Keyboard nav
  if (_keyFn) document.removeEventListener('keydown', _keyFn);
  _keyFn = (e) => {
    if (e.key === 'ArrowLeft')  galleryNav(-1);
    else if (e.key === 'ArrowRight') galleryNav(1);
  };
  document.addEventListener('keydown', _keyFn);
}

// ── Utilities ─────────────────────────────────────────────
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmt(n) {
  const x = Number(n);
  return Number.isNaN(x) ? null : '$' + x.toLocaleString();
}

function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 86400000);
  if (diff === 0) return 'today';
  if (diff === 1) return 'yesterday';
  return `${diff} days ago`;
}

function isNew(dateStr) {
  return Math.floor((Date.now() - new Date(dateStr)) / 86400000) <= 14;
}

function slugFromPath() {
  const parts = window.location.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
  const idx = parts.indexOf('listing');
  if (idx >= 0 && parts[idx + 1]) return decodeURIComponent(parts[idx + 1]);
  return parts[parts.length - 1] || '';
}

// ── SEO ───────────────────────────────────────────────────
function injectSeo(p, firstImage) {
  const title = `${p.address}${p.city ? ', ' + p.city : ''} — ${p.county} County WV | MalickLand`;
  const desc  = `${p.lot_acres ? p.lot_acres + ' acres · ' : ''}${p.county} County, WV · ${fmt(p.price) || 'Contact for Price'} · MalickLand`;
  document.title = title;
  document.querySelector('meta[name="description"]')?.setAttribute('content', desc);
  document.querySelector('meta[property="og:title"]')?.setAttribute('content', title);
  document.querySelector('meta[property="og:description"]')?.setAttribute('content', desc);
  if (firstImage) document.querySelector('meta[property="og:image"]')?.setAttribute('content', firstImage);
  document.querySelector('meta[property="og:url"]')?.setAttribute('content', window.location.href);

  // JSON-LD
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'RealEstateListing',
    'name': title,
    'description': desc,
    'url': window.location.href,
    'image': firstImage || '',
    'offers': p.price ? { '@type': 'Offer', 'price': p.price, 'priceCurrency': 'USD' } : undefined,
    'address': {
      '@type': 'PostalAddress',
      'streetAddress': p.address,
      'addressLocality': p.city || 'Romney',
      'addressRegion': 'WV',
      'postalCode': p.zip || '',
      'addressCountry': 'US'
    }
  };
  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.textContent = JSON.stringify(ld);
  document.head.appendChild(script);
}

// ── Render ────────────────────────────────────────────────
function render(p) {
  const price   = fmt(p.price);
  const desc    = p.description || p.marketing_description || p.property_description || '';
  const newListing = isNew(p.listed_at);

  // Feature badges
  const badgesHtml = [
    newListing            ? `<span class="badge badge-new">New</span>`         : '',
    p.price_reduced       ? `<span class="badge badge-reduced">Price Reduced</span>` : '',
    p.property_type       ? `<span class="badge badge-type">${esc(p.property_type)}</span>` : '',
    p.status && p.status !== 'active' ? `<span class="badge badge-status">${esc(p.status)}</span>` : '',
  ].filter(Boolean).join('');

  // Info chips
  const chips = [
    p.lot_acres  ? `<span class="chip">🌿 ${esc(String(p.lot_acres))} acres</span>` : '',
    p.bedrooms   ? `<span class="chip">🛏 ${p.bedrooms} bed</span>` : '',
    p.bathrooms  ? `<span class="chip">🚿 ${p.bathrooms} bath</span>` : '',
    p.sqft       ? `<span class="chip">📐 ${Number(p.sqft).toLocaleString()} sqft</span>` : '',
    p.year_built ? `<span class="chip">🏗 Built ${p.year_built}</span>` : '',
  ].filter(Boolean).join('');

  // Facts grid
  const facts = [
    p.mls_number       ? ['MLS #', p.mls_number] : null,
    p.road_access      ? ['Road Access', p.road_access] : null,
    p.flood_zone       ? ['Flood Zone', p.flood_zone] : null,
    p.listing_agent    ? ['Agent', p.listing_agent] : null,
    p.listing_office   ? ['Office', p.listing_office] : null,
    p.listed_at        ? ['Listed', timeAgo(p.listed_at)] : null,
  ].filter(Boolean).map(([label, val]) =>
    `<div class="fact-item"><span class="fact-label">${esc(label)}</span><span class="fact-value">${esc(val)}</span></div>`
  ).join('');

  // Utilities
  const utils = [
    p.septic   ? 'Septic'    : '',
    p.well     ? 'Well'      : '',
    p.electric ? 'Electric'  : '',
    p.internet ? 'Internet'  : '',
  ].filter(Boolean);

  const content = document.getElementById('listingContent');
  content.innerHTML = `
    <div class="listing-header">
      <div class="listing-price">${price || 'Contact for Price'}</div>
      <div class="listing-address">${esc(p.address)}${p.city ? ', ' + esc(p.city) : ''}${p.zip ? ' ' + esc(p.zip) : ''}</div>
      <div class="listing-county">${esc(p.county)} County, West Virginia</div>
      ${badgesHtml ? `<div class="badges">${badgesHtml}</div>` : ''}
      ${chips ? `<div class="chips">${chips}</div>` : ''}
    </div>

    <div class="listing-grid">
      <div class="listing-left">
        ${desc ? `
          <div class="listing-section">
            <h2>About This Property</h2>
            <div class="listing-desc">${esc(desc)}</div>
          </div>` : ''}

        ${facts ? `
          <div class="listing-section">
            <h2>Property Details</h2>
            <div class="facts">${facts}</div>
          </div>` : ''}

        ${utils.length ? `
          <div class="listing-section">
            <h2>Utilities</h2>
            <div class="chips">${utils.map(u => `<span class="chip">✓ ${esc(u)}</span>`).join('')}</div>
          </div>` : ''}
      </div>

      <div class="listing-right">
        <div class="listing-section contact-panel">
          <h2>Contact Phil Malick</h2>
          <p class="phil-note">
            📞 <a href="tel:+15402461421">(540) 246-1421</a>
            &nbsp;·&nbsp; ✉️ <a href="mailto:phil@malickland.net">phil@malickland.net</a>
          </p>
          <input id="cName"  type="text"  placeholder="Your Name" />
          <input id="cEmail" type="email" placeholder="Email" />
          <input id="cPhone" type="tel"   placeholder="Phone (optional)" />
          <textarea id="cMsg" placeholder="I'm interested in this property…"></textarea>
          <button class="btn-contact" id="cSubmit">Send Inquiry</button>
          <button class="btn-packet" id="cPacket">Request Full Property Packet</button>
          <p class="contact-status" id="cStatus"></p>
        </div>
      </div>
    </div>
  `;

  document.getElementById('cSubmit').addEventListener('click', () => submitContact(p.id, false));
  document.getElementById('cPacket').addEventListener('click', () => submitContact(p.id, true));
}

// ── Contact ───────────────────────────────────────────────
async function submitContact(propertyId, isPacket) {
  const name    = document.getElementById('cName').value.trim();
  const email   = document.getElementById('cEmail').value.trim();
  const phone   = document.getElementById('cPhone').value.trim();
  const message = document.getElementById('cMsg').value.trim();
  const status  = document.getElementById('cStatus');

  if (!name || !email) { status.textContent = 'Name and email are required.'; return; }

  const btn = document.getElementById(isPacket ? 'cPacket' : 'cSubmit');
  btn.disabled = true;
  status.textContent = 'Sending…';

  const res = await fetch(`${API}/contacts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      property_id: propertyId, name, email, phone,
      message: isPacket ? `PACKET REQUEST: ${message || ''}` : message,
      source: isPacket ? 'packet_request' : 'listing_page',
    }),
  });

  if (!res.ok) {
    status.textContent = 'Could not send. Please try again.';
    btn.disabled = false;
    return;
  }
  status.textContent = isPacket ? '✅ Packet requested! Phil will reach out within 2 hours.' : '✅ Inquiry sent! We\'ll be in touch soon.';
  document.getElementById('cMsg').value = '';
  btn.disabled = false;
}

// ── Load ──────────────────────────────────────────────────
function showError(msg) {
  document.getElementById('listingLoading').hidden = true;
  document.getElementById('listingContent').hidden = true;
  const el = document.getElementById('listingError');
  el.hidden = false;
  el.innerHTML = `<p>${esc(msg)}</p><p style="margin-top:1rem"><a href="/" style="color:#1B4332;font-weight:600;">← Back to Listings</a></p>`;
}

async function loadProperty() {
  const id = slugFromPath();
  if (!id) { showError('Missing property identifier.'); return; }

  const res = await fetch(`${API}/properties/${encodeURIComponent(id)}`);
  if (!res.ok) {
    if (res.status === 404) showError('This listing was not found or is no longer active.');
    else showError('Could not load this listing. Please try again later.');
    return;
  }

  const p = await res.json();

  // Build image list — prefer image_urls array from API
  _imgs = (p.image_urls && p.image_urls.length > 0)
    ? p.image_urls
    : (p.image_url ? [p.image_url] : []);

  buildGallery(_imgs);
  injectSeo(p, _imgs[0] || '');

  document.getElementById('listingLoading').hidden = true;
  document.getElementById('listingContent').hidden = false;
  render(p);
}

document.addEventListener('DOMContentLoaded', () => {
  loadProperty().catch(() => showError('Something went wrong loading this page.'));
});
