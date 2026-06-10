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
      ⚠️ <strong>AI is not configured.</strong> Set <code>AI_GATEWAY_API_KEY</code> (preferred) or <code>OPENAI_API_KEY</code> to enable AI generation.
    </div>` : ''}
    <div style="display:flex;gap:1rem;align-items:center;margin-bottom:1.5rem;flex-wrap:wrap">
      <form method="POST" action="/admin/ai/${esc(p.id)}" style="margin:0">
        <input type="hidden" name="_csrf" value="${esc(csrfToken(req))}" />
        <button type="submit" class="btn" ${!aiOk ? 'disabled title="Set AI_GATEWAY_API_KEY or OPENAI_API_KEY first"' : ''}>
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
    return res.status(400).send('AI not configured (set AI_GATEWAY_API_KEY or OPENAI_API_KEY)');

  try {
    await generateListingContent(p, db);
  } catch (err) {
    console.error('[AI route] generation failed:', err.message);
    return res.status(500).send('AI generation failed: ' + esc(err.message));
  }
  res.redirect(`/admin/ai/${p.id}`);
});

// ── Integrations ──────────────────────────────────────────
router.get('/integrations', requireAuth, adminActionRateLimit, (req, res) => {
  const gmailOk  = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_REFRESH_TOKEN);
  const driveOk  = !!(process.env.GOOGLE_DRIVE_FOLDER_ID);
  const driveFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID || '';

  res.send(adminShell('Integrations', `
    <div class="dash-header">
      <h1>Integrations</h1>
      <a href="/admin" class="btn-outline">← Back</a>
    </div>
    <div class="report-grid">
      <div class="report-card">
        <h3>Gmail Notifications ${gmailOk ? '✅' : '⚠️'}</h3>
        <p style="margin-bottom:1rem;color:${gmailOk?'#155724':'#856404'};font-size:.9rem">
          ${gmailOk ? 'Connected — inquiry emails will be sent automatically.' : 'Not configured — set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, GOOGLE_GMAIL_USER, NOTIFICATION_EMAIL in environment.'}
        </p>
      </div>
      <div class="report-card">
        <h3>Google Drive Backup ${driveOk ? '✅' : '⚠️'}</h3>
        <p style="margin-bottom:1rem;color:${driveOk?'#155724':'#856404'};font-size:.9rem">
          ${driveOk ? `Connected — photos backup to folder ${esc(driveFolderId)}.` : 'Not configured — set GOOGLE_DRIVE_FOLDER_ID to enable photo backups.'}
        </p>
      </div>
      <div class="report-card full">
        <h3>Setup Instructions</h3>
        <ol style="padding-left:1.5rem;line-height:2">
          <li>Go to <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer">Google Cloud Console</a> and create a project.</li>
          <li>Enable the <strong>Gmail API</strong> and <strong>Google Drive API</strong>.</li>
          <li>Create an <strong>OAuth 2.0 Client ID</strong> (Desktop application type).</li>
          <li>Visit the <a href="https://developers.google.com/oauthplayground" target="_blank" rel="noopener noreferrer">OAuth Playground</a>, authorise with scopes<br>
            <code>https://www.googleapis.com/auth/gmail.send</code> and
            <code>https://www.googleapis.com/auth/drive.file</code>.<br>
            Exchange the authorisation code for a <strong>refresh token</strong>.</li>
          <li>Copy the values into <code>api/.env</code> (see <code>api/.env.example</code> for all keys).</li>
          <li>Restart the server — the integrations activate automatically.</li>
        </ol>
      </div>
    </div>
  `, csrfToken(req)));
});

module.exports = router;
