'use strict';

const { esc } = require('../helpers');

function adminShell(title, body, csrf) {
  return `<!DOCTYPE html><html lang="en"><head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="csrf-token" content="${esc(csrf||'')}">
  <title>${esc(title)} — WVREA Admin</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',sans-serif;background:#f5f2eb;color:#222}
    .sidebar{position:fixed;left:0;top:0;bottom:0;width:220px;background:#1a3a2a;padding:1.5rem 1rem;z-index:10}
    .sidebar .logo{color:#c9a84c;font-weight:700;font-size:1.1rem;margin-bottom:2rem;display:block}
    .sidebar a{display:block;color:#fff;text-decoration:none;padding:.6rem .75rem;border-radius:6px;margin-bottom:.25rem;font-size:.9rem}
    .sidebar a:hover{background:rgba(255,255,255,.1)}
    .sidebar .logout{position:absolute;bottom:1.5rem;left:1rem;right:1rem}
    .main{margin-left:220px;padding:2rem;min-height:100vh}
    .dash-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem}
    .dash-header h1{font-size:1.5rem;color:#1a3a2a}
    .btn{background:#c9a84c;color:#1a3a2a;border:none;padding:.65rem 1.25rem;border-radius:6px;font-weight:700;cursor:pointer;text-decoration:none;font-size:.9rem;display:inline-block}
    .btn-outline{background:transparent;border:2px solid #1a3a2a;color:#1a3a2a;padding:.6rem 1.2rem;border-radius:6px;font-weight:600;cursor:pointer;text-decoration:none;font-size:.9rem;display:inline-block}
    .btn-sm{background:#1a3a2a;color:#c9a84c;border:none;padding:.3rem .7rem;border-radius:4px;cursor:pointer;text-decoration:none;font-size:.8rem;margin-right:.25rem;display:inline-block}
    .btn-sm:hover{opacity:.85}
    .listings-table{width:100%;border-collapse:collapse;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.06)}
    .listings-table th{background:#1a3a2a;color:#c9a84c;padding:.85rem 1rem;text-align:left;font-size:.85rem}
    .listings-table td{padding:.85rem 1rem;border-bottom:1px solid #eee;font-size:.875rem}
    .listings-table tr:last-child td{border:none}
    .listings-table tr:hover td{background:#fafaf8}
    .badge{padding:.25rem .6rem;border-radius:4px;font-size:.75rem;font-weight:700}
    .badge.active{background:#d4edda;color:#155724}
    .badge.draft{background:#fff3cd;color:#856404}
    .badge.pending{background:#cce5ff;color:#004085}
    .badge.sold{background:#f8d7da;color:#721c24}
    .form-grid{display:grid;grid-template-columns:1fr 1fr;gap:1rem;background:#fff;padding:1.5rem;border-radius:10px;box-shadow:0 2px 8px rgba(0,0,0,.06)}
    .form-grid .full{grid-column:1/-1}
    .form-section{grid-column:1/-1;border-top:2px solid #eee;padding-top:1rem;margin-top:.5rem}
    .form-section h3{color:#1a3a2a;margin-bottom:1rem;font-size:1rem}
    label{display:block;font-size:.82rem;font-weight:600;color:#555;margin-bottom:.3rem}
    input[type=text],input[type=number],input[type=email],select,textarea{
      width:100%;padding:.65rem .9rem;border:1px solid #ddd;border-radius:6px;font-size:.9rem;font-family:inherit}
    textarea{resize:vertical}
    .checkbox-row{display:flex;align-items:center;gap:.5rem;font-size:.9rem}
    .checkbox-row input{width:auto}
    .form-actions{grid-column:1/-1;display:flex;gap:1rem;margin-top:1rem}
    .upload-zone{border:2px dashed #c9a84c;border-radius:12px;padding:3rem;text-align:center;
      background:#fffdf5;cursor:pointer;transition:background .2s}
    .upload-zone.drag-over{background:#fef9e7;border-color:#1a3a2a}
    .upload-inner p{margin:.75rem 0 1rem;color:#666}
    .progress-bar{background:#eee;border-radius:4px;height:8px;overflow:hidden;margin-bottom:.5rem}
    .progress-fill{background:#c9a84c;height:100%;transition:width .3s;width:0}
    .photo-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:1rem;margin-top:1rem}
    .photo-item{background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 6px rgba(0,0,0,.08)}
    .photo-item img{width:100%;height:150px;object-fit:cover}
    .photo-actions{padding:.5rem;display:flex;gap:.5rem;flex-wrap:wrap}
    .photo-actions button{font-size:.75rem;padding:.3rem .6rem;border-radius:4px;border:none;cursor:pointer;background:#1a3a2a;color:#fff}
    .photo-actions button.del{background:#c0392b}
    .primary-badge{font-size:.75rem;padding:.3rem .6rem;background:#c9a84c;color:#1a3a2a;border-radius:4px;font-weight:700}
    .report-grid{display:grid;grid-template-columns:1fr 1fr;gap:1.5rem}
    .report-card{background:#fff;padding:1.5rem;border-radius:10px;box-shadow:0 2px 8px rgba(0,0,0,.06)}
    .report-card.full{grid-column:1/-1}
    .report-card h3{color:#1a3a2a;margin-bottom:1rem}
    .report-card textarea{width:100%;font-family:monospace;font-size:.82rem;border:1px solid #ddd;border-radius:6px;padding:.75rem}
    .report-card button{margin-top:.75rem}
    .detail-table{width:100%;font-size:.875rem;border-collapse:collapse}
    .detail-table td{padding:.5rem;border-bottom:1px solid #f0f0f0}
    .detail-table td:first-child{font-weight:600;color:#555;width:40%}
    @media(max-width:768px){
      .sidebar{display:none}.main{margin-left:0}
      .form-grid,.report-grid{grid-template-columns:1fr}
    }
  </style></head><body>
  <div class="sidebar">
    <span class="logo">🏡 WVREA Admin</span>
    <a href="/admin">📋 Listings</a>
    <a href="/admin/new">➕ New Listing</a>
    <a href="/admin/integrations">🔗 Integrations</a>
    <a href="/" target="_blank">🌐 Public Site</a>
    <a href="/admin/logout" class="logout" style="color:#ffaaaa">🚪 Logout</a>
  </div>
  <div class="main">${body}</div>
  <script>
  const _csrf = document.querySelector('meta[name="csrf-token"]')?.content || '';
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('form[method="POST"], form[method="post"]').forEach(form => {
      if (!form.querySelector('[name=_csrf]')) {
        const field = document.createElement('input');
        field.type = 'hidden'; field.name = '_csrf'; field.value = _csrf;
        form.appendChild(field);
      }
    });
  });
  async function generateDescription() {
    const acreage = document.querySelector('[name=acreage]')?.value || '';
    const county = document.querySelector('[name=county_id] option:checked')?.textContent?.trim() || '';
    const property_type = document.querySelector('[name=property_type]')?.value || 'land';
    const features = [
      document.querySelector('[name=road_access]')?.value ? 'Road access: ' + document.querySelector('[name=road_access]').value : '',
      document.querySelector('[name=utilities_available]')?.value ? 'Utilities: ' + document.querySelector('[name=utilities_available]').value : '',
      document.querySelector('[name=flood_zone]')?.value ? 'Flood zone: ' + document.querySelector('[name=flood_zone]').value : '',
    ].filter(Boolean);
    const btn = event.target;
    btn.disabled = true; btn.textContent = '...';
    try {
      const res = await fetch('/api/properties/generate-description', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ acreage: acreage ? Number(acreage) : undefined, county, property_type, features })
      });
      const data = await res.json();
      if (data.description) document.getElementById('propertyDescField').value = data.description;
    } catch(e) { alert('Generate failed: ' + e.message); }
    btn.disabled = false; btn.textContent = '✨ Generate Description';
  }
  </script>
  </body></html>`;
}

function listingForm(p, counties) {
  const v   = (f) => esc(p ? (p[f]||'') : '');
  const chk = (f) => p && p[f] ? 'checked' : '';
  const sel = (f,val) => p && p[f]===val ? 'selected' : '';
  const countyOpts = counties.map(c =>
    `<option value="${esc(c.id)}" ${p && p.county_id==c.id?'selected':''}>${esc(c.name)}</option>`
  ).join('');

  return `
  <div class="dash-header">
    <h1>${p ? 'Edit Listing' : 'New Listing'}</h1>
    <a href="/admin" class="btn-outline">← Cancel</a>
  </div>
  <form method="POST" action="${p ? '/admin/edit/'+p.id : '/admin/new'}">
    <div class="form-grid">
      <div class="form-section"><h3>📍 Property Details</h3></div>
      <div><label>Address *</label><input type="text" name="address" value="${v('address')}" required /></div>
      <div><label>City</label><input type="text" name="city" value="${v('city')}" /></div>
      <div><label>State</label><input type="text" name="state" value="${v('state')||'WV'}" /></div>
      <div><label>ZIP</label><input type="text" name="zip" value="${v('zip')}" /></div>
      <div><label>County *</label><select name="county_id">${countyOpts}</select></div>
      <div><label>Parcel ID</label><input type="text" name="parcel_id" value="${v('parcel_id')}" /></div>
      <div><label>Subdivision</label><input type="text" name="subdivision" value="${v('subdivision')}" /></div>
      <div><label>Property Type</label>
        <select name="property_type">
          <option value="land" ${sel('property_type','land')}>Land</option>
          <option value="residential" ${sel('property_type','residential')}>Residential</option>
          <option value="commercial" ${sel('property_type','commercial')}>Commercial</option>
          <option value="multi-family" ${sel('property_type','multi-family')}>Multi-Family</option>
          <option value="industrial" ${sel('property_type','industrial')}>Industrial</option>
        </select>
      </div>
      <div><label>Status</label>
        <select name="status">
          <option value="draft" ${sel('status','draft')}>Draft</option>
          <option value="active" ${sel('status','active')}>Active</option>
          <option value="pending" ${sel('status','pending')}>Pending</option>
          <option value="sold" ${sel('status','sold')}>Sold</option>
          <option value="withdrawn" ${sel('status','withdrawn')}>Withdrawn</option>
        </select>
      </div>
      <div class="form-section"><h3>📐 Land & Structure</h3></div>
      <div><label>Acreage</label><input type="number" step="0.001" name="acreage" value="${v('acreage')}" /></div>
      <div><label>Lot Size (description)</label><input type="text" name="lot_size" value="${v('lot_size')}" /></div>
      <div><label>Bedrooms</label><input type="number" name="bedrooms" value="${v('bedrooms')}" /></div>
      <div><label>Bathrooms</label><input type="number" step="0.5" name="bathrooms" value="${v('bathrooms')}" /></div>
      <div><label>Sq Ft</label><input type="number" name="sqft" value="${v('sqft')}" /></div>
      <div><label>Year Built</label><input type="number" name="year_built" value="${v('year_built')}" /></div>
      <div><label>Road Access</label><input type="text" name="road_access" value="${v('road_access')}" placeholder="Paved, gravel, deeded easement..." /></div>
      <div><label>Utilities Available</label><input type="text" name="utilities_available" value="${v('utilities_available')}" /></div>
      <div class="full">
        <label>Utilities On-Site</label>
        <div style="display:flex;gap:1.5rem;flex-wrap:wrap;margin-top:.5rem">
          <label class="checkbox-row"><input type="checkbox" name="septic" ${chk('septic')} /> Septic</label>
          <label class="checkbox-row"><input type="checkbox" name="well" ${chk('well')} /> Well</label>
          <label class="checkbox-row"><input type="checkbox" name="electric" ${chk('electric')} /> Electric</label>
          <label class="checkbox-row"><input type="checkbox" name="internet" ${chk('internet')} /> Internet</label>
        </div>
      </div>
      <div class="form-section"><h3>💰 Financial</h3></div>
      <div><label>List Price ($)</label><input type="number" name="price" value="${v('price')}" /></div>
      <div><label>Recommended List Price ($)</label><input type="number" name="recommended_list_price" value="${v('recommended_list_price')}" /></div>
      <div><label>Price Per Acre ($)</label><input type="number" name="price_per_acre" value="${v('price_per_acre')}" /></div>
      <div><label>Tax Assessed Value ($)</label><input type="number" name="tax_assessed" value="${v('tax_assessed')}" /></div>
      <div><label>Annual Property Tax ($)</label><input type="number" name="annual_tax" value="${v('annual_tax')}" /></div>
      <div class="form-section"><h3>🏷 MLS</h3></div>
      <div><label>MLS Status</label>
        <select name="mls_status">
          <option value="draft" ${sel('mls_status','draft')}>Draft</option>
          <option value="active" ${sel('mls_status','active')}>Active</option>
          <option value="pending" ${sel('mls_status','pending')}>Pending</option>
          <option value="sold" ${sel('mls_status','sold')}>Sold</option>
        </select>
      </div>
      <div><label>MLS Number</label><input type="text" name="mls_number" value="${v('mls_number')}" /></div>
      <div><label>Listing Agent</label><input type="text" name="listing_agent" value="${v('listing_agent')||'Phil Malick'}" /></div>
      <div><label>Listing Office</label><input type="text" name="listing_office" value="${v('listing_office')||'WV Real Estate Agency'}" /></div>
      <div class="form-section"><h3>📍 Location & Environment</h3></div>
      <div><label>Latitude</label><input type="number" step="0.000001" name="latitude" value="${v('latitude')}" /></div>
      <div><label>Longitude</label><input type="number" step="0.000001" name="longitude" value="${v('longitude')}" /></div>
      <div><label>Flood Zone</label><input type="text" name="flood_zone" value="${v('flood_zone')}" placeholder="Zone X, AE, etc." /></div>
      <div><label>School District</label><input type="text" name="school_district" value="${v('school_district')}" /></div>
      <div class="form-section"><h3>📝 Descriptions</h3></div>
      <div class="full"><label>Property Description
        <button type="button" class="btn-sm" style="margin-left:.75rem;vertical-align:middle;" onclick="generateDescription()">✨ Generate Description</button>
      </label>
        <textarea id="propertyDescField" name="property_description" rows="4">${v('property_description')}</textarea></div>
      <div class="full"><label>Marketing Description (public-facing)</label>
        <textarea name="marketing_description" rows="4">${v('marketing_description')}</textarea></div>
      <div class="full"><label>Seller Notes (internal)</label>
        <textarea name="seller_notes" rows="3">${v('seller_notes')}</textarea></div>
      <div class="full"><label>Internal Notes</label>
        <textarea name="internal_notes" rows="3">${v('internal_notes')}</textarea></div>
      <div class="form-actions">
        <button type="submit" class="btn">💾 Save Listing</button>
        <a href="/admin" class="btn-outline">Cancel</a>
      </div>
    </div>
  </form>`;
}

const loginPageHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Admin Login</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',sans-serif;background:#1a3a2a;display:flex;align-items:center;justify-content:center;min-height:100vh}
  .box{background:#fff;padding:2.5rem;border-radius:12px;width:100%;max-width:380px;text-align:center}
  h2{color:#1a3a2a;margin-bottom:1.5rem}
  input{width:100%;padding:.75rem;border:1px solid #ddd;border-radius:6px;margin-bottom:1rem;font-size:1rem}
  button{width:100%;padding:.85rem;background:#c9a84c;color:#1a3a2a;border:none;border-radius:6px;font-weight:700;font-size:1rem;cursor:pointer}
  .err{color:#c0392b;margin-bottom:1rem;font-size:.9rem}
</style></head><body>
<div class="box">
  <h2>🏡 WVREA Admin</h2>
  <form method="POST" action="/admin/login">
    <input type="password" name="password" placeholder="Admin Password" autofocus />
    <button type="submit">Sign In</button>
  </form>
</div></body></html>`;

const loginErrorHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Admin Login</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',sans-serif;background:#1a3a2a;display:flex;align-items:center;justify-content:center;min-height:100vh}
  .box{background:#fff;padding:2.5rem;border-radius:12px;width:100%;max-width:380px;text-align:center}
  h2{color:#1a3a2a;margin-bottom:1.5rem}
  input{width:100%;padding:.75rem;border:1px solid #ddd;border-radius:6px;margin-bottom:1rem;font-size:1rem}
  button{width:100%;padding:.85rem;background:#c9a84c;color:#1a3a2a;border:none;border-radius:6px;font-weight:700;font-size:1rem;cursor:pointer}
  .err{color:#c0392b;margin-bottom:1rem;font-size:.9rem}
</style></head><body>
<div class="box">
  <h2>🏡 WVREA Admin</h2>
  <p class="err">Incorrect password</p>
  <form method="POST" action="/admin/login">
    <input type="password" name="password" placeholder="Admin Password" autofocus />
    <button type="submit">Sign In</button>
  </form>
</div></body></html>`;

module.exports = { adminShell, listingForm, loginPageHtml, loginErrorHtml };
