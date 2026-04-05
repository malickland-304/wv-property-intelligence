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
    q:         document.getElementById('searchInput').value.trim(),
    county:    document.getElementById('countyFilter').value,
    type:      document.getElementById('typeFilter').value,
    minPrice:  document.getElementById('minPrice').value,
    maxPrice:  document.getElementById('maxPrice').value,
    minAcres:  document.getElementById('minAcres')?.value || '',
  };
  currentPage = 1;
  loadListings();
}

const FEAT_ICONS = {
  'Timber':'🌲','Hunting':'🦌','Water':'💧','Creek':'💧','Pond':'💧','Stream':'💧',
  'Road Access':'🛣️','Paved Road':'🛣️','Gravel Road':'🛣️',
  'Electric':'⚡','Power':'⚡','Utilities':'⚡',
  'Broadband':'📶','Internet':'📶','Starlink':'📶',
  'Mountain View':'🏔️','Views':'🏔️','Pasture':'🌾','Fields':'🌾',
  'Well':'💦','Spring':'💦','Cabin':'🏠','Barn':'🏚️',
};
function appFeatureBadges(featStr) {
  if (!featStr) return '';
  return featStr.split(',').map(f => f.trim()).filter(Boolean).slice(0,4).map(f => {
    const icon = Object.entries(FEAT_ICONS).find(([k]) => f.toLowerCase().includes(k.toLowerCase()));
    return `<span class="feat-badge">${icon ? icon[1]+' ' : ''}${f}</span>`;
  }).join('');
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
  // Update results count if element exists (listings page)
  const countEl = document.getElementById('resultsCount');
  if (countEl) countEl.textContent = total ? `${total} listing${total === 1 ? '' : 's'} found` : '';

  if (!properties.length) {
    grid.innerHTML = '<p class="empty">No listings found matching your filters.</p>';
    document.getElementById('pagination').innerHTML = '';
    return;
  }

  grid.innerHTML = properties.map(p => {
    const isLand = p.property_type === 'land';
    const price = p.price ? `$${Number(p.price).toLocaleString()}` : 'Contact for Price';
    const ppa = isLand && p.price && p.lot_acres ? `<span style="font-size:.78rem;color:#666"> · $${Math.round(p.price/p.lot_acres).toLocaleString()}/ac</span>` : '';
    const primaryStat = isLand
      ? (p.lot_acres ? `🌿 ${p.lot_acres} acres` : '')
      : [p.bedrooms?`🛏 ${p.bedrooms}bd`:'', p.bathrooms?`🚿 ${p.bathrooms}ba`:'', p.sqft?`📐 ${Number(p.sqft).toLocaleString()} sqft`:''].filter(Boolean).join(' · ');
    const driveTag = p.driveTimes ? `<div class="drive-tag">🚗 ${p.driveTimes.dc} to DC</div>` : '';
    const daysOld = Math.floor((Date.now() - new Date(p.listed_at)) / 86400000);
    const isNew = daysOld <= 14;
    return `
    <div class="property-card" onclick="openDetail('${p.id}')">
      <div class="card-img" style="background-image:url('${p.image_url || 'https://placehold.co/400x240/1a3a2a/gold?text=No+Photo'}')">
        ${p.price_reduced ? '<span class="badge reduced">Price Reduced</span>' : isNew ? '<span class="badge new-listing">New</span>' : ''}
        <span class="badge type">${isLand ? '🌲 Land' : '🏡 '+p.property_type}</span>
      </div>
      <div class="card-body">
        <div class="card-price">${price}${ppa}</div>
        <div class="card-address">${p.address}${p.city ? ', ' + p.city : ''}</div>
        <div class="card-county">${p.county} County${p.zip ? ' · ' + p.zip : ''}</div>
        ${primaryStat ? `<div class="card-details"><span>${primaryStat}</span></div>` : ''}
        <div class="feat-badges">${appFeatureBadges(p.features)}</div>
        ${driveTag}
        <div class="card-listed">Listed ${timeAgo(p.listed_at)}</div>
        <button class="request-info-btn" onclick="event.stopPropagation();openDetail('${p.id}')">View Details →</button>
      </div>
    </div>`;
  }).join('');

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
  const isLand = p.property_type === 'land';
  const addr = encodeURIComponent(`${p.address}${p.city?', '+p.city:''}, WV${p.zip?' '+p.zip:''}`);
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${addr}`;
  const satUrl  = `https://www.google.com/maps/@?api=1&map_action=map&basemap=satellite&q=${addr}`;
  const ppa = isLand && p.price && p.lot_acres ? ` · $${Math.round(p.price/p.lot_acres).toLocaleString()}/acre` : '';

  modal.innerHTML = `
    <div class="modal-content">
      <button class="modal-close" onclick="closeModal()">✕</button>
      <img src="${p.image_url || 'https://placehold.co/800x400/1a3a2a/gold?text=No+Photo'}" alt="Property" />
      <div class="modal-body">
        <h2>$${Number(p.price).toLocaleString()}<span style="font-size:1rem;font-weight:400;color:#666">${ppa}</span></h2>
        <p class="modal-address">${p.address}${p.city ? ', ' + p.city : ''}, ${p.county} County${p.zip ? ' ' + p.zip : ''}</p>

        <div class="modal-details">
          <span>${isLand ? '🌲 Land' : '🏡 '+p.property_type}</span>
          ${p.lot_acres  ? `<span>🌿 ${p.lot_acres} acres</span>` : ''}
          ${p.bedrooms   ? `<span>🛏 ${p.bedrooms} bd</span>` : ''}
          ${p.bathrooms  ? `<span>🚿 ${p.bathrooms} ba</span>` : ''}
          ${p.sqft       ? `<span>📐 ${Number(p.sqft).toLocaleString()} sqft</span>` : ''}
          ${p.year_built ? `<span>🏗 ${p.year_built}</span>` : ''}
        </div>

        ${p.features ? `<div class="feat-badges" style="margin:.5rem 0">${appFeatureBadges(p.features)}</div>` : ''}

        ${p.driveTimes ? `<div class="drive-row">🚗 <strong>${p.driveTimes.dc}</strong> to DC · <strong>${p.driveTimes.balt}</strong> to Baltimore · <strong>${p.driveTimes.pit}</strong> to Pittsburgh</div>` : ''}

        ${isLand ? `<div class="land-grid">
          ${p.road_access    ? `<div><span class="lg-label">🛣 Road</span>${p.road_access}</div>` : ''}
          ${p.broadband_type ? `<div><span class="lg-label">📶 Broadband</span>${p.broadband_type}</div>` : ''}
          ${p.water_features ? `<div style="grid-column:1/-1"><span class="lg-label">💧 Water</span>${p.water_features}</div>` : ''}
          ${p.mineral_rights && p.mineral_rights!=='unknown' ? `<div><span class="lg-label">⛏ Minerals</span>${p.mineral_rights}</div>` : ''}
          ${p.nearest_town   ? `<div><span class="lg-label">📍 Town</span>${p.nearest_town}${p.miles_to_town?' ('+p.miles_to_town+' mi)':''}</div>` : ''}
          ${p.annual_tax     ? `<div><span class="lg-label">💰 Taxes</span>$${Number(p.annual_tax).toLocaleString()}/yr</div>` : ''}
        </div>` : ''}

        ${p.description ? `<p class="modal-desc">${p.description}</p>` : ''}

        <div class="modal-map-row">
          <a href="${mapsUrl}" target="_blank" rel="noopener" class="modal-map-btn">🗺 Map</a>
          <a href="${satUrl}"  target="_blank" rel="noopener" class="modal-map-btn">🛰 Satellite</a>
          ${p.listing_slug ? `<a href="/properties/${p.listing_slug}" target="_blank" class="modal-map-btn">🔗 Full Page</a>` : ''}
        </div>

        <div class="modal-contact">
          <h3>Contact Phil Malick</h3>
          <p style="margin-bottom:.75rem;font-size:.9rem;color:#555;">
            📞 <a href="tel:+15402461421" style="color:inherit;font-weight:600;">(540) 246-1421</a>
            &nbsp;·&nbsp;
            💬 <a href="sms:+15402461421&body=Hi Phil, interested in ${encodeURIComponent(p.address||'your listing')}." style="color:inherit;font-weight:600;">Text Phil</a>
            &nbsp;·&nbsp;
            ✉️ <a href="mailto:phil@malickland.net" style="color:inherit;font-weight:600;">Email</a>
          </p>
          <input id="cName"  type="text"  placeholder="Your Name" />
          <input id="cEmail" type="email" placeholder="Email" />
          <input id="cPhone" type="tel"   placeholder="Phone (optional)" />
          <textarea id="cMsg" placeholder="Message">I'm interested in ${p.address}.</textarea>
          <button onclick="submitContact('${p.id}')">Send Inquiry</button>
          <p style="font-size:.72rem;color:#999;margin-top:.5rem;line-height:1.4">By submitting, you consent to receive communications from MalickLand. Reply STOP to opt out.</p>
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
