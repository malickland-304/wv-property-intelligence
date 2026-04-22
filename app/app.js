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
    <div class="property-card" onclick="openDetail(${JSON.stringify(p.id)})">
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
        <button class="request-info-btn" onclick="event.stopPropagation();openRequestInfo(${JSON.stringify(p.id)},${JSON.stringify(p.address||'')})">Request Info</button>
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
  if (!res.ok) return alert('Property not found');
  const p    = await res.json();

  const modal = document.getElementById('modal') || createModal();
  modal.innerHTML = `
    <div class="modal-content">
      <button class="modal-close" onclick="closeModal()">✕</button>
      <img src="${escapeHtml(p.image_url || 'https://placehold.co/800x400/1a3a2a/gold?text=No+Photo')}" alt="Property" />
      <div class="modal-body">
        <h2>$${Number(p.price).toLocaleString()}</h2>
        <p class="modal-address">${escapeHtml(p.address)}${p.city ? ', ' + escapeHtml(p.city) : ''}, ${escapeHtml(p.county)} County${p.zip ? ' ' + escapeHtml(p.zip) : ''}</p>
        <div class="modal-details">
          ${p.bedrooms   ? `<span>🛏 ${escapeHtml(p.bedrooms)} Bedrooms</span>` : ''}
          ${p.bathrooms  ? `<span>🚿 ${escapeHtml(p.bathrooms)} Bathrooms</span>` : ''}
          ${p.sqft       ? `<span>📐 ${Number(p.sqft).toLocaleString()} sqft</span>` : ''}
          ${p.lot_acres ? `<span>🌿 ${escapeHtml(p.lot_acres)} Acres</span>` : ''}
          ${p.year_built ? `<span>🏗 Built ${escapeHtml(p.year_built)}</span>` : ''}
          <span>📋 ${escapeHtml(p.property_type)}</span>
          <span>🏷 ${escapeHtml(p.status)}</span>
        </div>
        ${p.description ? `<p class="modal-desc">${escapeHtml(p.description)}</p>` : ''}
        <div class="modal-contact">
          <h3>Contact Phil Malick</h3>
          <p style="margin-bottom:.75rem;font-size:.9rem;color:#555;">
            📞 <a href="tel:+13045550100" style="color:inherit;font-weight:600;">(304) 555-0100</a>
            &nbsp;·&nbsp;
            ✉️ <a href="mailto:phil@malickland.net" style="color:inherit;font-weight:600;">phil@malickland.net</a>
          </p>
          <input id="cName"  type="text"  placeholder="Your Name" />
          <input id="cEmail" type="email" placeholder="Email" />
          <input id="cPhone" type="tel"   placeholder="Phone (optional)" />
          <textarea id="cMsg" placeholder="Message"></textarea>
          <button onclick="submitContact(${JSON.stringify(p.id)})">Send Inquiry</button>
          <button onclick="requestPacket(${JSON.stringify(p.id)},${JSON.stringify(p.address||'')},this)" style="margin-top:.5rem;background:#1B4332;color:#D4AF37;">Request Full Property Packet</button>
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

function openRequestInfo(id, address) {
  openDetail(id);
  // Pre-fill message after modal renders
  setTimeout(() => {
    const msg = document.getElementById('cMsg');
    if (msg && !msg.value) msg.value = `I'd like more information about: ${address}`;
    const nameEl = document.getElementById('cName');
    if (nameEl) nameEl.focus();
  }, 150);
}

async function requestPacket(propertyId, address, btn) {
  const name  = document.getElementById('cName')?.value;
  const email = document.getElementById('cEmail')?.value;
  const phone = document.getElementById('cPhone')?.value;
  if (!name || !email) { alert('Please enter your name and email above first.'); return; }
  btn.disabled = true; btn.textContent = 'Sending...';
  const res = await fetch(`${API}/contacts`, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ property_id: propertyId, name, email, phone, message: `PACKET REQUEST: ${address}`, source: 'packet_request' })
  });
  if (res.ok) {
    btn.textContent = '✅ Packet Requested!';
  } else {
    btn.disabled = false; btn.textContent = 'Request Full Property Packet';
    alert('Failed to send. Please try again.');
  }
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
