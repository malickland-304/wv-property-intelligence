'use strict';

const API = '/api';

function listingIdentifierFromPath() {
  const parts = window.location.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
  const idx = parts.indexOf('listing');
  if (idx >= 0 && parts[idx + 1]) return decodeURIComponent(parts[idx + 1]);
  return parts[parts.length - 1] || '';
}

function formatMoney(n) {
  if (n == null || n === '') return null;
  const x = Number(n);
  if (Number.isNaN(x)) return null;
  return '$' + x.toLocaleString();
}

function showError(msg) {
  const el = document.getElementById('listingError');
  const load = document.getElementById('listingLoading');
  const art = document.getElementById('listingContent');
  load.hidden = true;
  art.hidden = true;
  el.hidden = false;
  el.textContent = msg;
}

async function loadProperty() {
  const id = listingIdentifierFromPath();
  if (!id) {
    showError('Missing property id.');
    return;
  }

  const res = await fetch(`${API}/properties/${encodeURIComponent(id)}`);
  if (!res.ok) {
    if (res.status === 404) showError('This listing was not found.');
    else showError('Could not load this listing. Please try again later.');
    return;
  }

  const p = await res.json();
  document.getElementById('listingLoading').hidden = true;
  document.getElementById('listingError').hidden = true;

  const content = document.getElementById('listingContent');
  content.hidden = false;

  const price = formatMoney(p.price);
  const img =
    p.image_url ||
    'https://placehold.co/960x480/0f1712/c9a84c?text=WV+Land+%26+Property';
  const desc =
    p.description ||
    p.marketing_description ||
    p.property_description ||
    '';
  document.title = `${p.address || 'Property'} | Malickland`;

  content.innerHTML = `
    <a href="/#listings" class="back-link">← All listings</a>
    <div class="detail-hero">
      <div class="detail-image-wrap">
        <img src="${escapeHtml(img)}" alt="" class="detail-image" />
        ${p.price_reduced ? '<span class="detail-badge reduced">Price reduced</span>' : ''}
        <span class="detail-badge type">${escapeHtml(p.property_type || '')}</span>
      </div>
      <div class="detail-header">
        <h1 class="detail-price">${price != null ? price : 'Contact for price'}</h1>
        <p class="detail-address">${escapeHtml(p.address || '')}${p.city ? ', ' + escapeHtml(p.city) : ''}${p.zip ? ' ' + escapeHtml(p.zip) : ''}</p>
        <p class="detail-county">${escapeHtml(p.county || '')} County · ${escapeHtml(p.status || '')}</p>
        <div class="detail-chips">
          ${p.lot_acres != null ? `<span class="chip">${escapeHtml(String(p.lot_acres))} acres</span>` : ''}
          ${p.bedrooms ? `<span class="chip">${p.bedrooms} bed</span>` : ''}
          ${p.bathrooms ? `<span class="chip">${p.bathrooms} bath</span>` : ''}
          ${p.sqft ? `<span class="chip">${Number(p.sqft).toLocaleString()} sq ft</span>` : ''}
          ${p.year_built ? `<span class="chip">Built ${p.year_built}</span>` : ''}
        </div>
      </div>
    </div>

    <div class="detail-grid">
      <section class="detail-panel">
        <h2>Overview</h2>
        <dl class="detail-facts">
          ${p.road_access ? `<dt>Road access</dt><dd>${escapeHtml(p.road_access)}</dd>` : ''}
          ${p.flood_zone ? `<dt>Flood zone</dt><dd>${escapeHtml(p.flood_zone)}</dd>` : ''}
          ${p.mls_number ? `<dt>MLS #</dt><dd>${escapeHtml(p.mls_number)}</dd>` : ''}
          ${p.listing_agent ? `<dt>Listing agent</dt><dd>${escapeHtml(p.listing_agent)}</dd>` : ''}
          ${p.listing_office ? `<dt>Office</dt><dd>${escapeHtml(p.listing_office)}</dd>` : ''}
        </dl>
        ${desc ? `<div class="detail-prose">${escapeHtml(desc).replace(/\n/g, '<br />')}</div>` : ''}
      </section>
      <section class="detail-panel detail-inquiry">
        <h2>Inquire</h2>
        <p class="inquiry-note">Questions about this property? Send a message.</p>
        <label class="sr-only" for="cName">Name</label>
        <input id="cName" type="text" placeholder="Your name" autocomplete="name" />
        <label class="sr-only" for="cEmail">Email</label>
        <input id="cEmail" type="email" placeholder="Email" autocomplete="email" />
        <label class="sr-only" for="cPhone">Phone</label>
        <input id="cPhone" type="tel" placeholder="Phone (optional)" autocomplete="tel" />
        <label class="sr-only" for="cMsg">Message</label>
        <textarea id="cMsg" placeholder="Message" rows="4"></textarea>
        <button type="button" class="btn-inquiry" id="cSubmit">Send inquiry</button>
        <p id="cStatus" class="inquiry-status" aria-live="polite"></p>
      </section>
    </div>
  `;

  document.getElementById('cSubmit').addEventListener('click', () => submitContact(p.id));
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function submitContact(propertyId) {
  const name = document.getElementById('cName').value.trim();
  const email = document.getElementById('cEmail').value.trim();
  const phone = document.getElementById('cPhone').value.trim();
  const message = document.getElementById('cMsg').value.trim();
  const status = document.getElementById('cStatus');

  if (!name || !email) {
    status.textContent = 'Name and email are required.';
    return;
  }

  status.textContent = 'Sending…';
  const res = await fetch(`${API}/contacts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ property_id: propertyId, name, email, phone, message }),
  });

  if (!res.ok) {
    status.textContent = 'Could not send. Please try again.';
    return;
  }
  status.textContent = 'Thank you — we will be in touch.';
  document.getElementById('cMsg').value = '';
}

document.addEventListener('DOMContentLoaded', () => {
  loadProperty().catch(() => showError('Something went wrong loading this page.'));
});
