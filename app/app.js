// app.js - WV Property Intelligence Frontend Logic

const API_BASE = '/api';
let currentPage = 1;
const PAGE_SIZE = 12;
let allListings = [];

// ── DOM References ──────────────────────────────────────────
const searchInput    = document.getElementById('searchInput');
const searchBtn      = document.getElementById('searchBtn');
const countyFilter   = document.getElementById('countyFilter');
const typeFilter     = document.getElementById('typeFilter');
const minPriceInput  = document.getElementById('minPrice');
const maxPriceInput  = document.getElementById('maxPrice');
const applyFilters   = document.getElementById('applyFilters');
const listingsGrid   = document.getElementById('listingsGrid');
const pagination     = document.getElementById('pagination');

// ── Init ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadCounties();
  fetchListings();
  fetchAnalytics();
});

searchBtn.addEventListener('click', () => fetchListings({ q: searchInput.value }));
applyFilters.addEventListener('click', applyFilterHandler);

// ── API Calls ───────────────────────────────────────────────
async function fetchListings(params = {}) {
  try {
    const query = buildQuery({ ...params, page: currentPage, limit: PAGE_SIZE });
    const res   = await fetch(`${API_BASE}/properties?${query}`);
    const data  = await res.json();
    allListings = data.properties || [];
    renderListings(allListings);
    renderPagination(data.total || 0);
  } catch (err) {
    listingsGrid.innerHTML = '<p class="error">Failed to load listings. Please try again.</p>';
    console.error('fetchListings error:', err);
  }
}

async function fetchAnalytics() {
  try {
    const res  = await fetch(`${API_BASE}/analytics`);
    const data = await res.json();
    document.querySelector('#avgPrice p').textContent        = formatCurrency(data.avgPrice);
    document.querySelector('#totalListings p').textContent   = data.totalListings ?? '--';
    document.querySelector('#medianDom p').textContent       = data.medianDom ? `${data.medianDom} days` : '--';
    document.querySelector('#pricePerSqft p').textContent    = data.pricePerSqft ? `$${data.pricePerSqft}/sqft` : '--';
  } catch (err) {
    console.error('fetchAnalytics error:', err);
  }
}

async function loadCounties() {
  try {
    const res     = await fetch(`${API_BASE}/counties`);
    const counties = await res.json();
    counties.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name;
      countyFilter.appendChild(opt);
    });
  } catch (err) {
    console.error('loadCounties error:', err);
  }
}

// ── Render ───────────────────────────────────────────────────
function renderListings(listings) {
  if (!listings.length) {
    listingsGrid.innerHTML = '<p class="no-results">No properties found.</p>';
    return;
  }
  listingsGrid.innerHTML = listings.map(p => `
    <div class="property-card" data-id="${p.id}">
      <img src="${p.image_url || 'assets/placeholder.jpg'}" alt="${p.address}" loading="lazy" />
      <div class="card-body">
        <h3 class="card-address">${p.address}</h3>
        <p class="card-county">${p.county}, WV ${p.zip}</p>
        <p class="card-type">${capitalize(p.property_type)}</p>
        <p class="card-price">${formatCurrency(p.price)}</p>
        <p class="card-details">${p.bedrooms ?? '--'} bd &bull; ${p.bathrooms ?? '--'} ba &bull; ${p.sqft ? p.sqft.toLocaleString() + ' sqft' : '--'}</p>
        <a href="property.html?id=${p.id}" class="btn-detail">View Details</a>
      </div>
    </div>
  `).join('');
}

function renderPagination(total) {
  const pages = Math.ceil(total / PAGE_SIZE);
  if (pages <= 1) { pagination.innerHTML = ''; return; }
  let html = '';
  for (let i = 1; i <= pages; i++) {
    html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
  }
  pagination.innerHTML = html;
  pagination.querySelectorAll('.page-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentPage = parseInt(btn.dataset.page);
      fetchListings();
    });
  });
}

// ── Handlers ─────────────────────────────────────────────────
function applyFilterHandler() {
  currentPage = 1;
  fetchListings({
    q:        searchInput.value,
    county:   countyFilter.value,
    type:     typeFilter.value,
    minPrice: minPriceInput.value,
    maxPrice: maxPriceInput.value,
  });
}

// ── Utilities ────────────────────────────────────────────────
function buildQuery(params) {
  return Object.entries(params)
    .filter(([, v]) => v !== '' && v !== null && v !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

function formatCurrency(val) {
  if (val == null) return '--';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}
