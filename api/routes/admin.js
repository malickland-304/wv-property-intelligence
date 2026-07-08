'use strict';

const express  = require('express');
const path     = require('path');
const fs       = require('fs');
const crypto   = require('crypto');
const multer   = require('multer');

const { db }                   = require('../db');
const { requireAuth, requireCsrf, csrfToken } = require('../middleware/auth');
const { adminLoginRateLimit, uploadRateLimit, adminActionRateLimit } = require('../middleware/rate-limits');
const { adminShell, listingForm, loginPageHtml, loginErrorHtml } = require('../views/admin');
const { esc, slugify, initListingFolder, isSafePathComponent, normalizeAcreage, safeListingPath } = require('../helpers');
const { uploadPhotoToDrive } = require('../google');
const { generateListingContent, aiConfigured } = require('../ai-generator');
const { CLAIM_STATUSES, DOCUMENT_TYPES } = require('./documents');

let sharp;
try { sharp = require('sharp'); } catch (_) { sharp = null; }

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_PASSWORD) {
  throw new Error('ADMIN_PASSWORD must be set');
}

// ── Multer ────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const rawSlug = req.params.slug || req.body.slug || '';
    const slug = isSafePathComponent(rawSlug) ? rawSlug : 'uploads';
    const dir  = safeListingPath(slug, 'photos', 'raw');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase();
    const name = Date.now() + '-' + crypto.randomBytes(4).toString('hex') + ext;
    cb(null, name);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024, files: 20, fieldSize: 1 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, /\.(jpg|jpeg|png|webp|heic)$/i.test(file.originalname));
  },
});

const router = express.Router();
const CLAIM_APPLY_FIELDS = new Map([
  ['address', { column: 'address', type: 'text', label: 'Address' }],
  ['parcel_id', { column: 'parcel_id', type: 'text', label: 'Parcel ID' }],
  ['acreage', { column: 'acreage', type: 'number', label: 'Acreage' }],
  ['annual_tax', { column: 'annual_tax', type: 'number', label: 'Annual Tax' }],
  ['tax_assessed', { column: 'tax_assessed', type: 'number', label: 'Tax Assessed Value' }],
  ['road_access', { column: 'road_access', type: 'text', label: 'Road Access' }],
  ['flood_zone', { column: 'flood_zone', type: 'text', label: 'Flood Zone' }],
  ['school_district', { column: 'school_district', type: 'text', label: 'School District' }],
  ['listing_price', { column: 'price', type: 'number', label: 'List Price' }],
  ['septic', { column: 'septic', type: 'boolean', label: 'Septic' }],
]);
const PROPERTY_UPDATE_COLUMNS = new Set(Array.from(CLAIM_APPLY_FIELDS.values()).map((field) => field.column));

const insertAuditEvent = db.prepare(`
  INSERT INTO audit_events (id,actor,action,entity_type,entity_id,before_json,after_json,reason)
  VALUES (?,?,?,?,?,?,?,?)
`);
const selectClaimForApply = db.prepare(`
  SELECT
    c.*,
    d.property_id AS document_property_id,
    COALESCE(c.property_id, d.property_id) AS effective_property_id,
    d.title AS document_title,
    v.approval_status AS version_approval_status
  FROM extracted_claims c
  JOIN documents d ON d.id = c.document_id
  JOIN document_versions v ON v.id = c.document_version_id
  WHERE c.id=?
`);
const selectPropertyById = db.prepare('SELECT * FROM properties WHERE id=?');
const selectExtractedClaimById = db.prepare('SELECT * FROM extracted_claims WHERE id=?');
const updateClaimApplied = db.prepare(`
  UPDATE extracted_claims
  SET status='applied', reviewed_by=?, reviewed_at=datetime('now'), review_note=?
  WHERE id=? AND status='approved'
`);
const updatePropertyStatements = new Map(
  Array.from(PROPERTY_UPDATE_COLUMNS).map((column) => [
    column,
    db.prepare(`UPDATE properties SET ${column}=?, updated_at=datetime('now') WHERE id=?`),
  ])
);

function cleanQuery(value, max = 120) {
  if (value == null) return '';
  return String(value).trim().slice(0, max);
}

function makeAuditId() {
  return `audit_${crypto.randomBytes(12).toString('hex')}`;
}

function auditSafe(row) {
  if (!row) return null;
  const copy = { ...row };
  for (const key of [
    'source_uri',
    'source_external_id',
    'storage_uri',
    'storage_external_id',
    'ocr_text',
    'claim_value_json',
    'source_quote',
    'source_location_json',
    'review_note',
  ]) {
    if (copy[key] != null) copy[key] = '[redacted]';
  }
  return copy;
}

function writeAudit({ actor, action, entityType, entityId, before, after, reason }) {
  insertAuditEvent.run(
    makeAuditId(),
    actor,
    action,
    entityType,
    entityId,
    before ? JSON.stringify(auditSafe(before)) : null,
    after ? JSON.stringify(auditSafe(after)) : null,
    cleanQuery(reason, 500) || null
  );
}

function parseJsonField(raw) {
  if (raw == null || raw === '') return null;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return raw;
  }
}

function displayJsonValue(raw) {
  const value = parseJsonField(raw);
  if (value == null) return '';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function claimValue(raw) {
  return parseJsonField(raw);
}

function normalizeClaimValue(value, type) {
  if (type === 'number') {
    if (value == null || Array.isArray(value) || typeof value === 'boolean' || typeof value === 'object') {
      return { error: 'Claim value is not a valid number.' };
    }
    const raw = typeof value === 'string' ? value.replace(/[$,]/g, '').trim() : value;
    if (raw === '') return { error: 'Claim value is not a valid number.' };
    const n = Number(raw);
    if (!Number.isFinite(n)) return { error: 'Claim value is not a valid number.' };
    return { value: n };
  }
  if (type === 'boolean') {
    if (typeof value === 'boolean') return { value: value ? 1 : 0 };
    if (typeof value === 'number' && (value === 0 || value === 1)) return { value };
    const normalized = String(value ?? '').trim().toLowerCase();
    if (['true', 'yes', 'y', '1'].includes(normalized)) return { value: 1 };
    if (['false', 'no', 'n', '0'].includes(normalized)) return { value: 0 };
    return { error: 'Claim value is not a valid boolean.' };
  }
  if (Array.isArray(value) || (value != null && typeof value === 'object')) {
    return { error: 'Claim value is not valid text.' };
  }
  return { value: String(value ?? '').trim() };
}

function renderSelectOptions(values, selected) {
  return values.map((value) =>
    `<option value="${esc(value)}" ${selected === value ? 'selected' : ''}>${esc(value)}</option>`
  ).join('');
}

function renderReviewFilters(filters) {
  const statuses = Array.from(CLAIM_STATUSES);
  const documentTypes = ['', ...Array.from(DOCUMENT_TYPES).sort()];

  return `
    <div class="filter-panel">
      <form method="GET" action="/admin/document-claims">
        <div>
          <label>Status</label>
          <select name="status">
            ${renderSelectOptions(statuses, filters.status)}
          </select>
        </div>
        <div>
          <label>Property ID</label>
          <input type="text" name="property_id" value="${esc(filters.property_id)}" placeholder="Optional" />
        </div>
        <div>
          <label>Claim Type</label>
          <input type="text" name="claim_type" value="${esc(filters.claim_type)}" placeholder="parcel_id, acreage..." />
        </div>
        <div>
          <label>Document Type</label>
          <select name="document_type">
            ${documentTypes.map((value) => {
              const label = value || 'Any';
              return `<option value="${esc(value)}" ${filters.document_type === value ? 'selected' : ''}>${esc(label)}</option>`;
            }).join('')}
          </select>
        </div>
        <button type="submit" class="btn">Filter</button>
      </form>
    </div>`;
}

function formatConfidence(value) {
  if (value == null || value === '') return '';
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  return `${Math.round(n * 100)}%`;
}

function statusBadgeClass(status) {
  if (status === 'approved' || status === 'applied') return 'active';
  if (status === 'rejected') return 'sold';
  if (status === 'superseded') return 'draft';
  return 'pending';
}

// ── Login ─────────────────────────────────────────────────
router.get('/login', (_req, res) => res.send(loginPageHtml));

router.post('/login', adminLoginRateLimit, (req, res) => {
  if (req.body.password === ADMIN_PASSWORD) {
    req.session.admin = true;
    res.redirect('/admin');
  } else {
    res.send(loginErrorHtml);
  }
});

router.get('/logout', adminActionRateLimit, (req, res) => {
  req.session.destroy();
  res.redirect('/admin/login');
});

// ── Dashboard ─────────────────────────────────────────────
router.get('/', requireAuth, adminActionRateLimit, (req, res) => {
  const listings = db.prepare(`
    SELECT p.id, p.address, p.city, p.price, p.property_type, p.status,
           p.listing_slug, p.acreage, p.photos_uploaded, p.mls_status,
           c.name AS county
    FROM properties p
    LEFT JOIN counties c ON c.id = p.county_id
    ORDER BY p.listed_at DESC
  `).all();

  const rows = listings.map(p => `
    <tr>
      <td>${esc(p.address)}${p.city ? ', '+esc(p.city) : ''}</td>
      <td>${esc(p.county||'')}</td>
      <td>${esc(p.property_type)}</td>
      <td>${p.price ? '$'+Number(p.price).toLocaleString() : '--'}</td>
      <td>${p.acreage ? p.acreage+' ac' : '--'}</td>
      <td><span class="badge ${esc(p.status)}">${esc(p.status)}</span></td>
      <td>${esc(p.mls_status||'draft')}</td>
      <td>
        <a href="/admin/edit/${esc(p.id)}" class="btn-sm">Edit</a>
        <a href="/admin/photos/${esc(p.listing_slug||p.id)}" class="btn-sm">Photos</a>
        <a href="/admin/report/${esc(p.id)}" class="btn-sm">Report</a>
        <a href="/admin/ai/${esc(p.id)}" class="btn-sm" style="background:#7c3aed">🤖 AI</a>
      </td>
    </tr>`).join('');

  res.send(adminShell('Dashboard', `
    <div class="dash-header">
      <h1>Listings</h1>
      <a href="/admin/new" class="btn">+ New Listing</a>
    </div>
    <table class="listings-table">
      <thead><tr>
        <th>Address</th><th>County</th><th>Type</th><th>Price</th>
        <th>Acres</th><th>Status</th><th>MLS</th><th>Actions</th>
      </tr></thead>
      <tbody>${rows || '<tr><td colspan="8" style="text-align:center;padding:2rem;color:#999">No listings yet. <a href="/admin/new">Add your first listing →</a></td></tr>'}</tbody>
    </table>
  `, csrfToken(req)));
});

// ── New listing ───────────────────────────────────────────
router.get('/new', requireAuth, adminActionRateLimit, (req, res) => {
  const counties = db.prepare('SELECT id,name FROM counties ORDER BY name').all();
  res.send(adminShell('New Listing', listingForm(null, counties), csrfToken(req)));
});

router.post('/new', requireAuth, requireCsrf, adminActionRateLimit, (req, res) => {
  const f = req.body;
  const id = crypto.randomBytes(16).toString('hex');
  const slug = slugify((f.address||'listing') + '-' + (f.city||'wv'));
  const uniqueSlug = slug + '-' + id.slice(0,6);
  if (!isSafePathComponent(uniqueSlug)) return res.status(500).send('Could not generate a safe listing slug');

  db.prepare(`
    INSERT INTO properties (
      id, county_id, address, city, state, zip, parcel_id, subdivision,
      property_type, status, acreage, lot_size, road_access, utilities_available,
      septic, well, electric, internet,
      price, recommended_list_price, price_per_acre, tax_assessed, annual_tax,
      mls_status, mls_number, listing_agent, listing_office,
      latitude, longitude, flood_zone, school_district,
      bedrooms, bathrooms, sqft, year_built,
      property_description, marketing_description, seller_notes, internal_notes,
      listing_slug
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    id, f.county_id||1, f.address, f.city, f.state||'WV', f.zip,
    f.parcel_id, f.subdivision, f.property_type||'land', f.status||'draft',
    normalizeAcreage(f), f.lot_size, f.road_access, f.utilities_available,
    f.septic?1:0, f.well?1:0, f.electric?1:0, f.internet?1:0,
    f.price||null, f.recommended_list_price||null, f.price_per_acre||null,
    f.tax_assessed||null, f.annual_tax||null,
    f.mls_status||'draft', f.mls_number, f.listing_agent||'Phil Malick',
    f.listing_office||'WV Real Estate Agency',
    f.latitude||null, f.longitude||null, f.flood_zone, f.school_district,
    f.bedrooms||null, f.bathrooms||null, f.sqft||null, f.year_built||null,
    f.property_description, f.marketing_description, f.seller_notes, f.internal_notes,
    uniqueSlug
  );

  initListingFolder(uniqueSlug);
  fs.writeFileSync(
    safeListingPath(uniqueSlug, 'listing.json'),
    JSON.stringify({ id, ...f, listing_slug: uniqueSlug }, null, 2)
  );
  res.redirect(`/admin/photos/${uniqueSlug}`);
});

// ── Edit listing ──────────────────────────────────────────
router.get('/edit/:id', requireAuth, adminActionRateLimit, (req, res) => {
  const p = db.prepare('SELECT * FROM properties WHERE id=?').get(req.params.id);
  if (!p) return res.redirect('/admin');
  const counties = db.prepare('SELECT id,name FROM counties ORDER BY name').all();
  res.send(adminShell('Edit Listing', listingForm(p, counties), csrfToken(req)));
});

router.post('/edit/:id', requireAuth, requireCsrf, adminActionRateLimit, (req, res) => {
  const f = req.body;
  db.prepare(`
    UPDATE properties SET
      county_id=?, address=?, city=?, state=?, zip=?, parcel_id=?, subdivision=?,
      property_type=?, status=?, acreage=?, lot_size=?, road_access=?, utilities_available=?,
      septic=?, well=?, electric=?, internet=?,
      price=?, recommended_list_price=?, price_per_acre=?, tax_assessed=?, annual_tax=?,
      mls_status=?, mls_number=?, listing_agent=?, listing_office=?,
      latitude=?, longitude=?, flood_zone=?, school_district=?,
      bedrooms=?, bathrooms=?, sqft=?, year_built=?,
      property_description=?, marketing_description=?, seller_notes=?, internal_notes=?,
      updated_at=datetime('now')
    WHERE id=?
  `).run(
    f.county_id||1, f.address, f.city, f.state||'WV', f.zip,
    f.parcel_id, f.subdivision, f.property_type||'land', f.status||'draft',
    normalizeAcreage(f), f.lot_size, f.road_access, f.utilities_available,
    f.septic?1:0, f.well?1:0, f.electric?1:0, f.internet?1:0,
    f.price||null, f.recommended_list_price||null, f.price_per_acre||null,
    f.tax_assessed||null, f.annual_tax||null,
    f.mls_status||'draft', f.mls_number, f.listing_agent, f.listing_office,
    f.latitude||null, f.longitude||null, f.flood_zone, f.school_district,
    f.bedrooms||null, f.bathrooms||null, f.sqft||null, f.year_built||null,
    f.property_description, f.marketing_description, f.seller_notes, f.internal_notes,
    req.params.id
  );
  res.redirect('/admin');
});

// ── Photos ────────────────────────────────────────────────
router.get('/photos/:slug', requireAuth, adminActionRateLimit, (req, res) => {
  const { slug } = req.params;
  if (!isSafePathComponent(slug)) return res.status(400).send('Invalid slug');

  res.send(adminShell('Upload Photos', `
    <div class="dash-header">
      <h1>Photos — ${esc(slug)}</h1>
      <a href="/admin" class="btn-outline">← Back</a>
    </div>
    <div class="upload-zone" id="dropZone">
      <div class="upload-inner">
        <div style="font-size:3rem">📸</div>
        <p>Drag & drop photos here or click to select</p>
        <input type="file" id="fileInput" multiple accept="image/*" style="display:none" />
        <button onclick="document.getElementById('fileInput').click()" class="btn">Select Photos</button>
      </div>
    </div>
    <div id="uploadProgress" style="display:none;margin:1rem 0">
      <div class="progress-bar"><div class="progress-fill" id="progressFill"></div></div>
      <p id="progressText">Uploading...</p>
    </div>
    <h3 id="photoCount" style="margin:1.5rem 0 1rem">Uploaded Photos</h3>
    <div class="photo-grid" id="photoGrid"></div>
    <script>
      const slug = ${JSON.stringify(slug)};
      const _csrf = document.querySelector('meta[name="csrf-token"]')?.content || '';
      const dropZone = document.getElementById('dropZone');
      const fileInput = document.getElementById('fileInput');
      const photoGrid = document.getElementById('photoGrid');
      const photoCount = document.getElementById('photoCount');
      dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
      dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
      dropZone.addEventListener('drop', e => { e.preventDefault(); dropZone.classList.remove('drag-over'); uploadFiles(e.dataTransfer.files); });
      fileInput.addEventListener('change', () => uploadFiles(fileInput.files));
      async function uploadFiles(files) {
        const prog = document.getElementById('uploadProgress');
        const fill = document.getElementById('progressFill');
        const text = document.getElementById('progressText');
        prog.style.display = 'block';
        let done = 0;
        for (const file of files) {
          const fd = new FormData();
          fd.append('photo', file);
          await fetch('/admin/upload/' + slug, { method:'POST', body:fd, headers:{'x-csrf-token':_csrf} });
          done++;
          const pct = Math.round(done/files.length*100);
          fill.style.width = pct+'%';
          text.textContent = done + ' of ' + files.length + ' uploaded';
        }
        text.textContent = 'Done! Refreshing...';
        setTimeout(() => location.reload(), 800);
      }
      const safePathSegment = /^[a-zA-Z0-9][a-zA-Z0-9_-]*(\\.[a-zA-Z0-9]+)?$/;
      function safeFileName(value) {
        return safePathSegment.test(value || '') ? value : null;
      }
      async function loadPhotos() {
        const res = await fetch('/admin/photos/' + encodeURIComponent(slug) + '/list');
        const data = await res.json();
        const photos = Array.isArray(data.photos) ? data.photos.filter(safeFileName) : [];
        photoCount.textContent = 'Uploaded Photos (' + photos.length + ')';
        photoGrid.replaceChildren(...photos.map(renderPhoto));
      }
      function renderPhoto(filename, index) {
        const item = document.createElement('div');
        item.className = 'photo-item';
        const img = document.createElement('img');
        img.src = '/images/' + encodeURIComponent(slug) + '/photos/compressed/' + encodeURIComponent(filename);
        img.alt = 'Photo ' + (index + 1);
        const actions = document.createElement('div');
        actions.className = 'photo-actions';
        if (index === 0) {
          const badge = document.createElement('span');
          badge.className = 'primary-badge';
          badge.textContent = 'Primary';
          actions.appendChild(badge);
        } else {
          const primary = document.createElement('button');
          primary.type = 'button';
          primary.textContent = 'Set Primary';
          primary.addEventListener('click', () => setPrimary(filename));
          actions.appendChild(primary);
        }
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'del';
        del.textContent = 'Delete';
        del.addEventListener('click', () => deletePhoto(filename));
        actions.appendChild(del);
        item.append(img, actions);
        return item;
      }
      async function setPrimary(filename) {
        filename = safeFileName(filename);
        if (!filename) return;
        await fetch('/admin/photos/' + encodeURIComponent(slug) + '/primary', { method:'POST', headers:{'Content-Type':'application/json','x-csrf-token':_csrf}, body: JSON.stringify({ filename }) });
        location.reload();
      }
      async function deletePhoto(filename) {
        filename = safeFileName(filename);
        if (!filename) return;
        if (!confirm('Delete this photo?')) return;
        await fetch('/admin/photos/' + encodeURIComponent(slug) + '/' + encodeURIComponent(filename), { method:'DELETE', headers:{'x-csrf-token':_csrf} });
        location.reload();
      }
      loadPhotos().catch(() => { photoCount.textContent = 'Uploaded Photos unavailable'; });
    </script>
  `, csrfToken(req)));
});

router.get('/photos/:slug/list', requireAuth, adminActionRateLimit, (req, res) => {
  const { slug } = req.params;
  if (!isSafePathComponent(slug)) return res.status(400).json({ error: 'Invalid slug' });
  const photoDir = safeListingPath(slug, 'photos', 'compressed');
  const photos = fs.existsSync(photoDir)
    ? fs.readdirSync(photoDir).filter(f => isSafePathComponent(f) && /\.(jpg|jpeg|png|webp)$/i.test(f))
    : [];
  res.json({ photos });
});

// ── Upload handler ────────────────────────────────────────
router.post('/upload/:slug', requireAuth, requireCsrf, uploadRateLimit, upload.single('photo'), async (req, res) => {
  const { slug } = req.params;
  if (!isSafePathComponent(slug)) return res.status(400).json({ error: 'Invalid slug' });
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const filename = req.file.filename;
  if (!isSafePathComponent(filename))
    return res.status(400).json({ error: 'Invalid filename' });

  const rawPath = safeListingPath(slug, 'photos', 'raw', filename);
  const compDir = safeListingPath(slug, 'photos', 'compressed');
  const mlsDir  = safeListingPath(slug, 'photos', 'mls');
  fs.mkdirSync(compDir, { recursive: true });
  fs.mkdirSync(mlsDir,  { recursive: true });

  const compPath = safeListingPath(slug, 'photos', 'compressed', filename);
  const mlsPath  = safeListingPath(slug, 'photos', 'mls', filename);

  function afterCompress() {
    const p = db.prepare('SELECT image_url, listing_slug FROM properties WHERE listing_slug=?').get(slug);
    if (p && !p.image_url) {
      db.prepare('UPDATE properties SET image_url=?, photos_uploaded=1 WHERE listing_slug=?')
        .run(`/images/${slug}/photos/compressed/${filename}`, slug);
    } else {
      db.prepare('UPDATE properties SET photos_uploaded=1 WHERE listing_slug=?').run(slug);
    }
    const driveSource = fs.existsSync(compPath) ? compPath : rawPath;
    uploadPhotoToDrive(driveSource, filename, slug).catch(() => {});
    res.json({ ok: true, filename });
  }

  if (sharp) {
    Promise.all([
      sharp(rawPath).resize({ width: 1200, withoutEnlargement: true }).jpeg({ quality: 85 }).toFile(compPath),
      sharp(rawPath).resize({ width: 1024, withoutEnlargement: true }).jpeg({ quality: 80 }).toFile(mlsPath),
    ])
      .then(afterCompress)
      .catch(err => {
        console.error('[sharp] compression failed, using original:', err.message);
        fs.copyFileSync(rawPath, compPath);
        fs.copyFileSync(rawPath, mlsPath);
        afterCompress();
      });
  } else {
    fs.copyFileSync(rawPath, compPath);
    fs.copyFileSync(rawPath, mlsPath);
    afterCompress();
  }
});

router.post('/photos/:slug/primary', requireAuth, requireCsrf, adminActionRateLimit, (req, res) => {
  const { slug } = req.params;
  const { filename } = req.body;
  if (!isSafePathComponent(slug) || !isSafePathComponent(filename||''))
    return res.status(400).json({ error: 'Invalid slug or filename' });
  db.prepare('UPDATE properties SET image_url=? WHERE listing_slug=?')
    .run(`/images/${slug}/photos/compressed/${filename}`, slug);
  res.json({ ok: true });
});

router.delete('/photos/:slug/:filename', requireAuth, requireCsrf, adminActionRateLimit, (req, res) => {
  const { slug, filename } = req.params;
  if (!isSafePathComponent(slug) || !isSafePathComponent(filename))
    return res.status(400).json({ error: 'Invalid slug or filename' });
  ['raw','compressed','mls'].forEach(dir => {
    const fp = safeListingPath(slug, 'photos', dir, filename);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  });
  res.json({ ok: true });
});

// ── Report ────────────────────────────────────────────────
router.get('/report/:id', requireAuth, adminActionRateLimit, (req, res) => {
  const p = db.prepare(`
    SELECT p.*, c.name AS county FROM properties p
    LEFT JOIN counties c ON c.id=p.county_id
    WHERE p.id=?
  `).get(req.params.id);
  if (!p) return res.redirect('/admin');

  const slug = p.listing_slug || p.id;
  if (!isSafePathComponent(slug)) return res.status(500).send('Invalid property data');
  const compsPath = safeListingPath(slug, 'comps.csv');
  const ddPath    = safeListingPath(slug, 'due_diligence.md');
  const comps     = fs.existsSync(compsPath) ? fs.readFileSync(compsPath, 'utf8') : '';
  const dd        = fs.existsSync(ddPath)    ? fs.readFileSync(ddPath, 'utf8')    : '';

  res.send(adminShell('Report', `
    <div class="dash-header">
      <h1>Report — ${esc(p.address)}</h1>
      <a href="/admin" class="btn-outline">← Back</a>
    </div>
    <div class="report-grid">
      <div class="report-card">
        <h3>Property Details</h3>
        <table class="detail-table">
          <tr><td>Address</td><td>${esc(p.address)}${p.city?', '+esc(p.city):''}</td></tr>
          <tr><td>County</td><td>${esc(p.county||'')}</td></tr>
          <tr><td>Type</td><td>${esc(p.property_type)}</td></tr>
          <tr><td>Status</td><td>${esc(p.status)}</td></tr>
          <tr><td>Acreage</td><td>${p.acreage||'--'}</td></tr>
          <tr><td>Price</td><td>${p.price?'$'+Number(p.price).toLocaleString():'--'}</td></tr>
          <tr><td>MLS #</td><td>${esc(p.mls_number||'--')}</td></tr>
          <tr><td>Parcel ID</td><td>${esc(p.parcel_id||'--')}</td></tr>
          <tr><td>Road Access</td><td>${esc(p.road_access||'--')}</td></tr>
          <tr><td>Flood Zone</td><td>${esc(p.flood_zone||'--')}</td></tr>
        </table>
      </div>
      <div class="report-card">
        <h3>Financial</h3>
        <table class="detail-table">
          <tr><td>List Price</td><td>${p.price?'$'+Number(p.price).toLocaleString():'--'}</td></tr>
          <tr><td>Rec. List Price</td><td>${p.recommended_list_price?'$'+Number(p.recommended_list_price).toLocaleString():'--'}</td></tr>
          <tr><td>Price/Acre</td><td>${p.price_per_acre?'$'+Number(p.price_per_acre).toLocaleString():'--'}</td></tr>
          <tr><td>Tax Assessed</td><td>${p.tax_assessed?'$'+Number(p.tax_assessed).toLocaleString():'--'}</td></tr>
          <tr><td>Annual Tax</td><td>${p.annual_tax?'$'+Number(p.annual_tax).toLocaleString():'--'}</td></tr>
        </table>
      </div>
      <div class="report-card full">
        <h3>Comps (CSV)</h3>
        <form method="POST" action="/admin/report/${esc(p.id)}/comps">
          <textarea name="comps" rows="8">${esc(comps)}</textarea>
          <button type="submit" class="btn">Save Comps</button>
        </form>
      </div>
      <div class="report-card full">
        <h3>Due Diligence Notes</h3>
        <form method="POST" action="/admin/report/${esc(p.id)}/dd">
          <textarea name="dd" rows="10">${esc(dd)}</textarea>
          <button type="submit" class="btn">Save Notes</button>
        </form>
      </div>
    </div>
  `, csrfToken(req)));
});

router.post('/report/:id/comps', requireAuth, requireCsrf, adminActionRateLimit, (req, res) => {
  const p = db.prepare('SELECT listing_slug,id FROM properties WHERE id=?').get(req.params.id);
  if (!p) return res.redirect('/admin');
  const slug = p.listing_slug || p.id;
  if (!isSafePathComponent(slug)) return res.status(400).json({ error: 'Invalid slug' });
  fs.writeFileSync(safeListingPath(slug, 'comps.csv'), req.body.comps || '');
  db.prepare('UPDATE properties SET comps_complete=1 WHERE id=?').run(req.params.id);
  res.redirect(`/admin/report/${req.params.id}`);
});

router.post('/report/:id/dd', requireAuth, requireCsrf, adminActionRateLimit, (req, res) => {
  const p = db.prepare('SELECT listing_slug,id FROM properties WHERE id=?').get(req.params.id);
  if (!p) return res.redirect('/admin');
  const slug = p.listing_slug || p.id;
  if (!isSafePathComponent(slug)) return res.status(400).json({ error: 'Invalid slug' });
  fs.writeFileSync(safeListingPath(slug, 'due_diligence.md'), req.body.dd || '');
  db.prepare('UPDATE properties SET due_diligence_complete=1 WHERE id=?').run(req.params.id);
  res.redirect(`/admin/report/${req.params.id}`);
});

// ── AI Content ────────────────────────────────────────────
router.get('/ai/:id', requireAuth, adminActionRateLimit, (req, res) => {
  const p = db.prepare(`
    SELECT p.*, c.name AS county_name FROM properties p
    LEFT JOIN counties c ON c.id=p.county_id
    WHERE p.id=?
  `).get(req.params.id);
  if (!p) return res.redirect('/admin');

  const aiOk = aiConfigured();
  let content = null;
  if (p.ai_content) {
    try { content = JSON.parse(p.ai_content); } catch {}
  }

  const generatedAt = p.ai_generated_at
    ? new Date(p.ai_generated_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
    : null;

  function section(label, value) {
    if (!value) return '';
    const text = Array.isArray(value) ? value.join('\n') : value;
    const id = 'ai-' + label.replace(/\s+/g, '-').toLowerCase();
    return `
      <div class="ai-section">
        <div class="ai-section-head">
          <h3>${esc(label)}</h3>
          <button class="btn-sm" onclick="copyAi('${id}')">Copy</button>
        </div>
        <pre id="${id}" class="ai-pre">${esc(text)}</pre>
      </div>`;
  }

  const sections = content ? [
    section('Headline',              content.headline),
    section('Highlights',            content.highlights),
    section('MLS Description',       content.mls_description),
    section('Buyer Research Description',  content.investor_description),
    section('Facebook — Short',      content.facebook_short),
    section('Facebook — Long',       content.facebook_long),
    section('Instagram Caption',     content.instagram_caption),
    section('Video Script',          content.video_script),
    section('Email Subject',         content.email_subject),
    section('Email Blast',           content.email_blast),
    section('SMS Blast',             content.sms_blast),
    section('Landing Page Hero',     content.landing_page_hero),
    section('Landing Page Sections', content.landing_page_sections),
    section('Comps Note',            content.comps_note),
    section('Search Tags',           content.tags),
  ].join('') : '';

  res.send(adminShell('AI Content', `
    <div class="dash-header">
      <h1>AI Content — ${esc(p.address)}</h1>
      <a href="/admin" class="btn-outline">← Back</a>
    </div>
    ${!aiOk ? `<div style="background:#fff3cd;color:#856404;padding:1rem;border-radius:8px;margin-bottom:1.5rem">
      ⚠️ <strong>AI is not configured.</strong> Set <code>ANTHROPIC_API_KEY</code> (recommended) — or <code>AI_GATEWAY_API_KEY</code> / <code>OPENAI_API_KEY</code> — to enable AI generation.
    </div>` : ''}
    <div style="display:flex;gap:1rem;align-items:center;margin-bottom:1.5rem;flex-wrap:wrap">
      <form method="POST" action="/admin/ai/${esc(p.id)}" style="margin:0">
        <input type="hidden" name="_csrf" value="${esc(csrfToken(req))}" />
        <button type="submit" class="btn" ${!aiOk ? 'disabled title="Set ANTHROPIC_API_KEY, AI_GATEWAY_API_KEY, or OPENAI_API_KEY first"' : ''}>
          ${content ? '🔄 Regenerate' : '✨ Generate Now'}
        </button>
      </form>
      ${generatedAt ? `<span style="color:#777;font-size:.875rem">Last generated: ${esc(generatedAt)}</span>` : ''}
    </div>
    ${content ? `<div class="ai-grid">${sections}</div>` : `
      <div style="text-align:center;padding:3rem;color:#999;background:#fff;border-radius:10px">
        <div style="font-size:3rem;margin-bottom:1rem">🤖</div>
        <p>No AI content yet. Click <strong>Generate Now</strong> above.</p>
      </div>`}
    <style>
      .ai-grid { display:grid; gap:1.25rem; }
      .ai-section { background:#fff; border-radius:10px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,.06); }
      .ai-section-head { display:flex; justify-content:space-between; align-items:center; padding:.75rem 1rem; background:#f5f2eb; border-bottom:1px solid #e5e1d8; }
      .ai-section-head h3 { font-size:.9rem; color:#1a3a2a; margin:0; }
      .ai-pre { white-space:pre-wrap; font-family:inherit; font-size:.875rem; padding:1rem; margin:0; line-height:1.6; color:#333; }
    </style>
    <script>
      function copyAi(id) {
        const el = document.getElementById(id);
        navigator.clipboard.writeText(el.textContent).then(() => {
          const btn = el.previousElementSibling?.querySelector('button') || el.parentElement?.querySelector('button');
          if (btn) { const orig = btn.textContent; btn.textContent = '✅ Copied'; setTimeout(() => btn.textContent = orig, 1500); }
        });
      }
    </script>
  `, csrfToken(req)));
});

router.post('/ai/:id', requireAuth, requireCsrf, adminActionRateLimit, async (req, res) => {
  const p = db.prepare(`
    SELECT p.*, c.name AS county_name FROM properties p
    LEFT JOIN counties c ON c.id=p.county_id
    WHERE p.id=?
  `).get(req.params.id);
  if (!p) return res.redirect('/admin');
  if (!aiConfigured())
    return res.status(400).send('AI not configured (set ANTHROPIC_API_KEY, AI_GATEWAY_API_KEY, or OPENAI_API_KEY)');

  try {
    await generateListingContent(p, db);
  } catch (err) {
    console.error('[AI route] generation failed:', err.message);
    return res.status(500).send('AI generation failed: ' + esc(err.message));
  }
  res.redirect(`/admin/ai/${p.id}`);
});

// ── Document Claim Review Queue ───────────────────────────
router.get('/document-claims', requireAuth, adminActionRateLimit, (req, res) => {
  const token = csrfToken(req);
  const filters = {
    status: cleanQuery(req.query.status) || 'pending_review',
    property_id: cleanQuery(req.query.property_id, 80),
    claim_type: cleanQuery(req.query.claim_type, 120),
    document_type: cleanQuery(req.query.document_type, 80),
  };

  if (!CLAIM_STATUSES.has(filters.status)) {
    return res.status(400).send(adminShell('Document Claims', `
      <div class="dash-header">
        <h1>Document Claims</h1>
        <a href="/admin" class="btn-outline">Back</a>
      </div>
      <div class="empty-state">Invalid status filter.</div>
    `, csrfToken(req)));
  }

  if (filters.document_type && !DOCUMENT_TYPES.has(filters.document_type)) {
    return res.status(400).send(adminShell('Document Claims', `
      <div class="dash-header">
        <h1>Document Claims</h1>
        <a href="/admin" class="btn-outline">Back</a>
      </div>
      <div class="empty-state">Invalid document type filter.</div>
    `, csrfToken(req)));
  }

  const conditions = ['c.status=?'];
  const values = [filters.status];

  if (filters.property_id) {
    conditions.push('COALESCE(c.property_id, d.property_id)=?');
    values.push(filters.property_id);
  }
  if (filters.claim_type) {
    conditions.push('c.claim_type=?');
    values.push(filters.claim_type);
  }
  if (filters.document_type) {
    conditions.push('d.document_type=?');
    values.push(filters.document_type);
  }

  const claims = db.prepare(`
    SELECT
      c.id, c.document_id, c.document_version_id,
      c.property_id AS claim_property_id,
      d.property_id AS document_property_id,
      COALESCE(c.property_id, d.property_id) AS effective_property_id,
      c.claim_type, c.claim_value_json, c.source_quote, c.source_location_json,
      c.confidence, c.status, c.reviewed_by, c.reviewed_at, c.review_note, c.created_at,
      d.title AS document_title, d.document_type, d.status AS document_status,
      v.version_number, v.file_name, v.approval_status AS version_approval_status,
      p.address AS property_address, p.city AS property_city
    FROM extracted_claims c
    JOIN documents d ON d.id = c.document_id
    JOIN document_versions v ON v.id = c.document_version_id
    LEFT JOIN properties p ON p.id = COALESCE(c.property_id, d.property_id)
    WHERE ${conditions.join(' AND ')}
      AND v.approval_status NOT IN ('rejected', 'superseded')
    ORDER BY c.created_at ASC, c.id ASC
    LIMIT 100
  `).all(...values);

  const rows = claims.map((claim) => {
    const propertyLabel = [claim.property_address, claim.property_city].filter(Boolean).join(', ')
      || claim.effective_property_id
      || 'Unlinked';
    const sourceLocation = displayJsonValue(claim.source_location_json);
    const applyField = CLAIM_APPLY_FIELDS.get(claim.claim_type);
    const applyCell = claim.status === 'approved' && claim.effective_property_id && applyField
      ? `<form method="POST" action="/admin/document-claims/${esc(claim.id)}/apply">
          <input type="hidden" name="_csrf" value="${esc(token)}" />
          <button type="submit" class="btn-sm">Apply to ${esc(applyField.label)}</button>
        </form>`
      : `<span class="muted">${claim.status === 'approved' ? 'No mapped field' : 'Review first'}</span>`;

    return `
      <tr>
        <td>
          <strong>${esc(propertyLabel)}</strong>
          ${claim.effective_property_id ? `<div class="muted">${esc(claim.effective_property_id)}</div>` : ''}
        </td>
        <td>
          <strong>${esc(claim.document_title)}</strong>
          <div class="muted">${esc(claim.document_type)} · v${esc(claim.version_number)} · ${esc(claim.file_name || '')}</div>
          <div class="muted">Document: ${esc(claim.document_status)} · Version: ${esc(claim.version_approval_status)}</div>
        </td>
        <td><span class="code-chip">${esc(claim.claim_type)}</span></td>
        <td class="claim-value">${esc(displayJsonValue(claim.claim_value_json))}</td>
        <td>${esc(formatConfidence(claim.confidence))}</td>
        <td class="quote-cell">
          ${claim.source_quote ? esc(claim.source_quote) : '<span class="muted">No quote</span>'}
          ${sourceLocation ? `<div class="muted">${esc(sourceLocation)}</div>` : ''}
        </td>
        <td><span class="badge ${esc(statusBadgeClass(claim.status))}" data-status="${esc(claim.status)}">${esc(claim.status)}</span></td>
        <td>${applyCell}</td>
      </tr>`;
  }).join('');

  res.send(adminShell('Document Claims', `
    <div class="dash-header">
      <h1>Document Claims</h1>
      <a href="/admin" class="btn-outline">Back</a>
    </div>
    ${renderReviewFilters(filters)}
    <p class="queue-meta">
      Showing ${claims.length} claim${claims.length === 1 ? '' : 's'} for review. Storage and source URIs are intentionally hidden.
    </p>
    ${claims.length ? `
      <table class="listings-table">
        <thead>
          <tr>
            <th>Property</th>
            <th>Document</th>
            <th>Claim</th>
            <th>Value</th>
            <th>Confidence</th>
            <th>Source Evidence</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    ` : '<div class="empty-state">No document claims match these filters.</div>'}
  `, token));
});

router.post('/document-claims/:claimId/apply', requireAuth, requireCsrf, adminActionRateLimit, (req, res) => {
  const claim = selectClaimForApply.get(req.params.claimId);

  function applyError(message, status = 400) {
    return res.status(status).send(adminShell('Apply Document Claim', `
      <div class="dash-header">
        <h1>Apply Document Claim</h1>
        <a href="/admin/document-claims?status=approved" class="btn-outline">Back</a>
      </div>
      <div class="empty-state">${esc(message)}</div>
    `, csrfToken(req)));
  }

  if (!claim) return applyError('Claim not found.', 404);
  if (claim.status !== 'approved') return applyError('Only approved claims can be applied.');
  if (['rejected', 'superseded'].includes(claim.version_approval_status)) {
    return applyError('Claims from rejected or superseded versions cannot be applied.');
  }
  if (!claim.effective_property_id) return applyError('Claim is not linked to a property.');

  const applyField = CLAIM_APPLY_FIELDS.get(claim.claim_type);
  if (!applyField || !PROPERTY_UPDATE_COLUMNS.has(applyField.column)) {
    return applyError('Claim type is not mapped to a listing field.');
  }

  const normalized = normalizeClaimValue(claimValue(claim.claim_value_json), applyField.type);
  if (normalized.error) return applyError(normalized.error);
  if (applyField.type === 'text' && !normalized.value) return applyError('Claim value is empty.');

  const property = selectPropertyById.get(claim.effective_property_id);
  if (!property) return applyError('Linked property not found.', 404);

  const actor = cleanQuery(req.body.actor || req.body.applied_by, 80) || 'admin';
  const reason = cleanQuery(req.body.review_note || req.body.reason, 500)
    || `Applied ${claim.claim_type} from ${claim.document_title || 'document claim'}.`;

  const applyClaim = db.transaction(() => {
    const currentClaim = selectClaimForApply.get(claim.id);
    if (!currentClaim || currentClaim.status !== 'approved') {
      throw new Error('Only approved claims can be applied.');
    }
    if (['rejected', 'superseded'].includes(currentClaim.version_approval_status)) {
      throw new Error('Claims from rejected or superseded versions cannot be applied.');
    }

    const beforeProperty = selectPropertyById.get(property.id);
    const beforeClaim = selectExtractedClaimById.get(claim.id);
    const claimUpdate = updateClaimApplied.run(actor, reason, claim.id);
    if (claimUpdate.changes !== 1) throw new Error('Only approved claims can be applied.');

    updatePropertyStatements.get(applyField.column).run(normalized.value, property.id);

    const afterProperty = selectPropertyById.get(property.id);
    const afterClaim = selectExtractedClaimById.get(claim.id);

    writeAudit({
      actor,
      action: 'property.claim_applied',
      entityType: 'property',
      entityId: property.id,
      before: beforeProperty,
      after: afterProperty,
      reason,
    });
    writeAudit({
      actor,
      action: 'extracted_claim.applied',
      entityType: 'extracted_claim',
      entityId: claim.id,
      before: beforeClaim,
      after: afterClaim,
      reason,
    });
  });

  try {
    applyClaim();
  } catch (err) {
    return applyError(err.message || 'Could not apply claim.');
  }
  return res.redirect(`/admin/document-claims?status=applied&property_id=${encodeURIComponent(property.id)}`);
});

// ── Integrations ──────────────────────────────────────────
router.get('/integrations', requireAuth, adminActionRateLimit, (req, res) => {
  // Lead notifications are sent via Resend (api/services/email.js). Google OAuth
  // is now used only for optional Drive photo backup (uploadPhotoToDrive).
  const resendOk = !!(process.env.RESEND_API_KEY && process.env.NOTIFICATION_EMAIL);
  const googleAuthOk = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN);
  const driveFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID || '';
  const driveOk  = !!(googleAuthOk && driveFolderId);

  res.send(adminShell('Integrations', `
    <div class="dash-header">
      <h1>Integrations</h1>
      <a href="/admin" class="btn-outline">← Back</a>
    </div>
    <div class="report-grid">
      <div class="report-card">
        <h3>Lead Notifications (Resend) ${resendOk ? '✅' : '⚠️'}</h3>
        <p style="margin-bottom:1rem;color:${resendOk?'#155724':'#856404'};font-size:.9rem">
          ${resendOk ? 'Connected — new inquiry alerts are emailed automatically via Resend.' : 'Not configured — set RESEND_API_KEY and NOTIFICATION_EMAIL in environment to email inquiry alerts.'}
        </p>
      </div>
      <div class="report-card">
        <h3>Google Drive Backup ${driveOk ? '✅' : '⚠️'}</h3>
        <p style="margin-bottom:1rem;color:${driveOk?'#155724':'#856404'};font-size:.9rem">
          ${driveOk ? `Connected — listing photos back up to Drive folder ${esc(driveFolderId)}.` : 'Not configured — set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN and GOOGLE_DRIVE_FOLDER_ID to back up listing photos to Google Drive.'}
        </p>
      </div>
      <div class="report-card full">
        <h3>Setup Instructions</h3>
        <ol style="padding-left:1.5rem;line-height:2">
          <li><strong>Lead notifications (Resend):</strong> create an API key at <a href="https://resend.com/" target="_blank" rel="noopener noreferrer">resend.com</a>, then set <code>RESEND_API_KEY</code>, <code>NOTIFICATION_EMAIL</code> (address that receives alerts) and optionally <code>FROM_EMAIL</code> (a verified sender) in <code>api/.env</code>.</li>
          <li><strong>Google Drive photo backup (optional):</strong>
            <ol style="padding-left:1.5rem;list-style-type:lower-alpha;line-height:1.8">
              <li>In the <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer">Google Cloud Console</a>, create a project and enable the <strong>Google Drive API</strong>.</li>
              <li>Create an <strong>OAuth 2.0 Client ID</strong> (Desktop application type).</li>
              <li>Visit the <a href="https://developers.google.com/oauthplayground" target="_blank" rel="noopener noreferrer">OAuth Playground</a>, authorize scope
                <code>https://www.googleapis.com/auth/drive.file</code>, and exchange the authorization code for a <strong>refresh token</strong>.</li>
              <li>Set <code>GOOGLE_CLIENT_ID</code>, <code>GOOGLE_CLIENT_SECRET</code>, <code>GOOGLE_REFRESH_TOKEN</code> and <code>GOOGLE_DRIVE_FOLDER_ID</code> in <code>api/.env</code> (see <code>api/.env.example</code> for all keys).</li>
            </ol>
          </li>
          <li>Restart the server — the integrations activate automatically.</li>
        </ol>
      </div>
    </div>
  `, csrfToken(req)));
});

module.exports = router;
