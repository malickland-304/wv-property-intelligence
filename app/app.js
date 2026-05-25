// app.js - WV Property Intelligence Frontend

const API = '/api';
let currentPage = 1;
let currentFilters = {};

// ── HTML escaping ─────────────────────────────────────────
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Init ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadCounties();
  loadListings();
  loadAnalytics();

  document.getElementById('searchBtn').addEventListener('click', doSearch);
  document.getElementById('searchInput').addEventListener('keydown', e => e.key === 'Enter' && doSearch());
  document.getElementById('applyFilters').addEventListener('click', applyFilters);
});

// ── Counties dropdown ────────────────────────────────────
async function loadCounties() {
  const res = await fetch(`${API}/counties`);
  const counties = await res.json();
  const sel = document.getElementById('countyFilter');
  counties.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.name;
    sel.appendChild(opt);
  });
}

// ── Search ───────────────────────────────────────────────
function doSearch() {
  currentFilters.q = document.getElementById('searchInput').value.trim();
  currentPage = 1;
  loadListings();
}

function applyFilters() {
  currentFilters = {
    q:        document.getElementById('searchInput').value.trim(),
    county:   document.getElementById('countyFilter').value,
    type:     document.getElementById('typeFilter').value,
    minPrice: document.getElementById('minPrice').value,
    maxPrice: document.getElementById('maxPrice').value,
    minAcres: document.getElementById('minAcres')?.value || '',
  };
  currentPage = 1;
  loadListings();
}

// ── Listings ─────────────────────────────────────────────
async function loadListings() {
  const grid = document.getElementById('listingsGrid');
  grid.innerHTML = '<p class="loading">Loading listings...</p>';

  const params = new URLSearchParams({
    ...currentFilters,
    page:  currentPage,
    limit: 12,
  });
  // Remove empty params
  for (const [k, v] of [...params]) { if (!v) params.delete(k); }

  try {
    const res  = await fetch(`${API}/properties?${params}`);
    const data = await res.json();
    renderListings(data);
  } catch (err) {
    grid.innerHTML = '<p class="error">Failed to load listings. Is the server running?</p>';
  }
}

function renderListings({ properties, total, page }) {
  const grid = document.getElementById('listingsGrid');
  const resultsCount = document.getElementById('resultsCount');
  if (resultsCount) {
    const count = Number(total || 0);
    resultsCount.textContent = `${count.toLocaleString()} ${count === 1 ? 'property' : 'properties'} found`;
  }
  if (!properties.length) {
    grid.innerHTML = '<p class="empty">No listings found.</p>';
    document.getElementById('pagination').innerHTML = '';
    return;
  }

  grid.innerHTML = properties.map(p => `
    <div class="property-card" data-slug="${escapeHtml(p.listing_slug || p.id)}">
      <div class="card-img" style="background-image:url('${escapeHtml(p.image_url || 'https://placehold.co/400x240/1a3a2a/gold?text=No+Photo')}')">
        ${p.price_reduced ? '<span class="badge reduced">Price Reduced</span>' : ''}
        <span class="badge type">${escapeHtml(p.property_type)}</span>
      </div>
      <div class="card-body">
        <div class="card-price">${p.price != null ? '$' + Number(p.price).toLocaleString() : 'Contact for price'}</div>
        <div class="card-address">${escapeHtml(p.address)}${p.city ? ', ' + escapeHtml(p.city) : ''}</div>
        <div class="card-county">${escapeHtml(p.county)} County${p.zip ? ' · ' + escapeHtml(p.zip) : ''}</div>
        <div class="card-details">
          ${p.bedrooms ? `<span>🛏 ${escapeHtml(p.bedrooms)} bd</span>` : ''}
          ${p.bathrooms ? `<span>🚿 ${escapeHtml(p.bathrooms)} ba</span>` : ''}
          ${p.sqft ? `<span>📐 ${Number(p.sqft).toLocaleString()} sqft</span>` : ''}
          ${p.lot_acres ? `<span>🌿 ${escapeHtml(p.lot_acres)} ac</span>` : ''}
        </div>
        <div class="card-listed">Listed ${timeAgo(p.listed_at)}</div>
        <button class="request-info-btn" type="button" data-slug="${escapeHtml(p.listing_slug || p.id)}">View Details</button>
      </div>
    </div>
  `).join('');

  grid.querySelectorAll('.property-card[data-slug]').forEach(card => {
    card.addEventListener('click', () => openPropertyPage(card.dataset.slug));
  });
  grid.querySelectorAll('.request-info-btn[data-slug]').forEach(button => {
    button.addEventListener('click', event => {
      event.stopPropagation();
      openPropertyPage(button.dataset.slug);
    });
  });

  renderPagination(total, page);
}

// ── Pagination ───────────────────────────────────────────
function renderPagination(total, page) {
  const pages = Math.ceil(total / 12);
  const el = document.getElementById('pagination');
  if (pages <= 1) { el.innerHTML = ''; return; }

  let html = `<span class="page-info">Page ${page} of ${pages} (${total} listings)</span>`;
  if (page > 1)     html += `<button onclick="goPage(${page-1})">← Prev</button>`;
  if (page < pages) html += `<button onclick="goPage(${page+1})">Next →</button>`;
  el.innerHTML = html;
}

function goPage(p) { currentPage = p; loadListings(); window.scrollTo(0,0); }

function openPropertyPage(slug) {
  window.location.href = `/listing/${encodeURIComponent(slug)}`;
}

// ── Analytics ────────────────────────────────────────────
async function loadAnalytics() {
  try {
    const res  = await fetch(`${API}/analytics`);
    const data = await res.json();
    document.querySelector('#avgPrice p').textContent       = data.avgPrice       ? '$' + Number(data.avgPrice).toLocaleString() : '--';
    document.querySelector('#totalListings p').textContent  = data.totalListings  ?? '--';
    document.querySelector('#medianDom p').textContent      = data.medianDom      ? data.medianDom + ' days' : '--';
    document.querySelector('#pricePerSqft p').textContent   = data.pricePerSqft   ? '$' + Number(data.pricePerSqft).toLocaleString() + '/sqft' : '--';
  } catch {}
}

// ── Util ─────────────────────────────────────────────────
function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 86400000);
  if (diff === 0) return 'today';
  if (diff === 1) return 'yesterday';
  return `${diff} days ago`;
}
