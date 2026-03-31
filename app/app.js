// app.js - WV Property Intelligence Frontend

const API = '/api';
let currentPage = 1;
let currentFilters = {};

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
  if (!properties.length) {
    grid.innerHTML = '<p class="empty">No listings found.</p>';
    document.getElementById('pagination').innerHTML = '';
    return;
  }

  grid.innerHTML = properties.map(p => `
    <div class="property-card" onclick="openDetail('${p.id}')">
      <div class="card-img" style="background-image:url('${p.image_url || 'https://placehold.co/400x240/1a3a2a/gold?text=No+Photo'}')">
        ${p.price_reduced ? '<span class="badge reduced">Price Reduced</span>' : ''}
        <span class="badge type">${p.property_type}</span>
      </div>
      <div class="card-body">
        <div class="card-price">$${Number(p.price).toLocaleString()}</div>
        <div class="card-address">${p.address}${p.city ? ', ' + p.city : ''}</div>
        <div class="card-county">${p.county} County${p.zip ? ' · ' + p.zip : ''}</div>
        <div class="card-details">
          ${p.bedrooms ? `<span>🛏 ${p.bedrooms} bd</span>` : ''}
          ${p.bathrooms ? `<span>🚿 ${p.bathrooms} ba</span>` : ''}
          ${p.sqft ? `<span>📐 ${Number(p.sqft).toLocaleString()} sqft</span>` : ''}
          ${p.lot_acres ? `<span>🌿 ${p.lot_acres} ac</span>` : ''}
        </div>
        <div class="card-listed">Listed ${timeAgo(p.listed_at)}</div>
      </div>
    </div>
  `).join('');

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

// ── Detail modal ─────────────────────────────────────────
async function openDetail(id) {
  const res  = await fetch(`${API}/properties/${id}`);
  const p    = await res.json();

  const modal = document.getElementById('modal') || createModal();
  modal.innerHTML = `
    <div class="modal-content">
      <button class="modal-close" onclick="closeModal()">✕</button>
      <img src="${p.image_url || 'https://placehold.co/800x400/1a3a2a/gold?text=No+Photo'}" alt="Property" />
      <div class="modal-body">
        <h2>$${Number(p.price).toLocaleString()}</h2>
        <p class="modal-address">${p.address}${p.city ? ', ' + p.city : ''}, ${p.county} County${p.zip ? ' ' + p.zip : ''}</p>
        <div class="modal-details">
          ${p.bedrooms   ? `<span>🛏 ${p.bedrooms} Bedrooms</span>` : ''}
          ${p.bathrooms  ? `<span>🚿 ${p.bathrooms} Bathrooms</span>` : ''}
          ${p.sqft       ? `<span>📐 ${Number(p.sqft).toLocaleString()} sqft</span>` : ''}
          ${p.lot_acres ? `<span>🌿 ${p.lot_acres} Acres</span>` : ''}
          ${p.year_built ? `<span>🏗 Built ${p.year_built}</span>` : ''}
          <span>📋 ${p.property_type}</span>
          <span>🏷 ${p.status}</span>
        </div>
        ${(p.marketing_description || p.property_description) ? `<p class="modal-desc">${p.marketing_description || p.property_description}</p>` : ''}
        <div class="modal-contact">
          <h3>Inquire About This Property</h3>
          <input id="cName"  type="text"  placeholder="Your Name" />
          <input id="cEmail" type="email" placeholder="Email" />
          <input id="cPhone" type="tel"   placeholder="Phone (optional)" />
          <textarea id="cMsg" placeholder="Message"></textarea>
          <button onclick="submitContact('${p.id}')">Send Inquiry</button>
        </div>
      </div>
    </div>
  `;
  modal.style.display = 'flex';
}

function createModal() {
  const m = document.createElement('div');
  m.id = 'modal';
  m.className = 'modal';
  m.addEventListener('click', e => { if (e.target === m) closeModal(); });
  document.body.appendChild(m);
  return m;
}

function closeModal() {
  const m = document.getElementById('modal');
  if (m) m.style.display = 'none';
}

async function submitContact(propertyId) {
  const body = {
    property_id: propertyId,
    name:    document.getElementById('cName').value,
    email:   document.getElementById('cEmail').value,
    phone:   document.getElementById('cPhone').value,
    message: document.getElementById('cMsg').value,
  };
  if (!body.name || !body.email) { alert('Name and email are required.'); return; }
  const res = await fetch(`${API}/contacts`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
  if (!res.ok) { alert('Failed to send inquiry. Please try again.'); return; }
  alert('Inquiry sent! We\'ll be in touch.');
  closeModal();
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
