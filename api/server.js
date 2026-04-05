'use strict';

const express    = require('express');
const Database   = require('better-sqlite3');
const cors       = require('cors');
const helmet     = require('helmet');
const morgan     = require('morgan');
const path       = require('path');
const fs         = require('fs');
const crypto     = require('crypto');
const multer     = require('multer');
const session    = require('express-session');
const rateLimit  = require('express-rate-limit');
require('dotenv').config();

const { sendContactEmail, uploadPhotoToDrive } = require('./google');

const app  = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'wvrea2026';
const PROJECT_ROOT   = path.join(__dirname, '..');

// ── DB ────────────────────────────────────────────────────
const DB_PATH = path.join(PROJECT_ROOT, 'database', 'wv_property.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS counties (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    name      TEXT NOT NULL UNIQUE,
    fips_code TEXT
  );
  CREATE TABLE IF NOT EXISTS properties (
    id            TEXT PRIMARY KEY,
    county_id     INTEGER NOT NULL REFERENCES counties(id),
    address       TEXT NOT NULL,
    city          TEXT,
    state         TEXT DEFAULT 'WV',
    zip           TEXT,
    parcel_id     TEXT,
    subdivision   TEXT,
    property_type TEXT NOT NULL DEFAULT 'land'
                  CHECK (property_type IN ('residential','commercial','land','multi-family','industrial')),
    status        TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','pending','sold','withdrawn','draft')),
    acreage       REAL,
    lot_size      TEXT,
    road_access   TEXT,
    utilities_available TEXT,
    septic        INTEGER DEFAULT 0,
    well          INTEGER DEFAULT 0,
    electric      INTEGER DEFAULT 0,
    internet      INTEGER DEFAULT 0,
    price         REAL,
    price_reduced INTEGER DEFAULT 0,
    recommended_list_price REAL,
    price_per_acre REAL,
    tax_assessed  REAL,
    annual_tax    REAL,
    mls_status    TEXT DEFAULT 'draft',
    mls_number    TEXT,
    listing_agent TEXT,
    listing_office TEXT,
    latitude      REAL,
    longitude     REAL,
    flood_zone    TEXT,
    school_district TEXT,
    bedrooms      INTEGER,
    bathrooms     REAL,
    sqft          INTEGER,
    year_built    INTEGER,
    property_description TEXT,
    marketing_description TEXT,
    seller_notes  TEXT,
    internal_notes TEXT,
    image_url     TEXT,
    due_diligence_complete INTEGER DEFAULT 0,
    photos_uploaded INTEGER DEFAULT 0,
    comps_complete INTEGER DEFAULT 0,
    listing_slug  TEXT UNIQUE,
    listed_at     TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
    sold_at       TEXT
  );
  CREATE TABLE IF NOT EXISTS contacts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    property_id TEXT REFERENCES properties(id) ON DELETE SET NULL,
    name        TEXT NOT NULL,
    email       TEXT NOT NULL,
    phone       TEXT,
    message     TEXT,
    source      TEXT DEFAULT 'web',
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_properties_county ON properties(county_id);
  CREATE INDEX IF NOT EXISTS idx_properties_status ON properties(status);
  CREATE INDEX IF NOT EXISTS idx_properties_type   ON properties(property_type);
  CREATE INDEX IF NOT EXISTS idx_properties_price  ON properties(price);
`);

// Seed counties
if (db.prepare('SELECT COUNT(*) as c FROM counties').get().c === 0) {
  const ins = db.prepare('INSERT OR IGNORE INTO counties (name,fips_code) VALUES (?,?)');
  const counties = [
    ['Barbour','54001'],['Berkeley','54003'],['Boone','54005'],['Braxton','54007'],
    ['Brooke','54009'],['Cabell','54011'],['Calhoun','54013'],['Clay','54015'],
    ['Doddridge','54017'],['Fayette','54019'],['Gilmer','54021'],['Grant','54023'],
    ['Greenbrier','54025'],['Hampshire','54027'],['Hancock','54029'],['Hardy','54031'],
    ['Harrison','54033'],['Jackson','54035'],['Jefferson','54037'],['Kanawha','54039'],
    ['Lewis','54041'],['Lincoln','54043'],['Logan','54045'],['McDowell','54047'],
    ['Marion','54049'],['Marshall','54051'],['Mason','54053'],['Mercer','54055'],
    ['Mineral','54057'],['Mingo','54059'],['Monongalia','54061'],['Monroe','54063'],
    ['Morgan','54065'],['Nicholas','54067'],['Ohio','54069'],['Pendleton','54071'],
    ['Pleasants','54073'],['Pocahontas','54075'],['Preston','54077'],['Putnam','54079'],
    ['Raleigh','54081'],['Randolph','54083'],['Ritchie','54085'],['Roane','54087'],
    ['Summers','54089'],['Taylor','54091'],['Tucker','54093'],['Tyler','54095'],
    ['Upshur','54097'],['Wayne','54099'],['Webster','54101'],['Wetzel','54103'],
    ['Wirt','54105'],['Wood','54107'],['Wyoming','54109']
  ];
  db.transaction(() => counties.forEach(([n,f]) => ins.run(n,f)))();
  console.log('Seeded 55 WV counties');
}

// ── Helpers ───────────────────────────────────────────────
function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
}

function initListingFolder(slug) {
  const base = path.join(PROJECT_ROOT, 'listings', slug);
  ['photos/raw','photos/compressed','photos/mls'].forEach(p =>
    fs.mkdirSync(path.join(base,p), { recursive:true })
  );
  // listing.json
  const jsonPath = path.join(base,'listing.json');
  if (!fs.existsSync(jsonPath)) fs.writeFileSync(jsonPath,'{}');
  // comps.csv
  const compsPath = path.join(base,'comps.csv');
  if (!fs.existsSync(compsPath))
    fs.writeFileSync(compsPath,'address,price,acreage,price_per_acre,days_on_market,notes\n');
  // due_diligence.md
  const ddPath = path.join(base,'due_diligence.md');
  if (!fs.existsSync(ddPath))
    fs.writeFileSync(ddPath,`# Due Diligence - ${slug}\n\n## Flood Zone\n\n## Utilities\n\n## Access\n\n## Zoning\n\n## Restrictions\n\n## Environmental Notes\n`);
  return base;
}

// ── Multer (photo upload) ─────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const slug = req.params.slug || req.body.slug || 'uploads';
    const dir  = path.join(PROJECT_ROOT, 'listings', slug, 'photos', 'raw');
    fs.mkdirSync(dir, { recursive:true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase();
    const name = Date.now() + '-' + crypto.randomBytes(4).toString('hex') + ext;
    cb(null, name);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, /\.(jpg|jpeg|png|webp|heic)$/i.test(file.originalname));
  }
});

// ── Middleware ────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended:true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'wvrea-secret-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 8 * 60 * 60 * 1000 }
}));

// Static files
// static served after routes
app.use('/images', express.static(path.join(PROJECT_ROOT, 'listings')));
app.use('/admin-assets', express.static(path.join(PROJECT_ROOT, 'admin')));

// ── Auth middleware ───────────────────────────────────────
function requireAuth(req, res, next) {
  if (req.session && req.session.admin) return next();
  res.redirect('/admin/login');
}

// ── Rate limiter – public contact form ───────────────────
const contactsRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many inquiries. Please wait a moment.' },
});

// ── Admin login ───────────────────────────────────────────
app.get('/admin/login', (_req, res) => {
  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8">
  <title>Admin Login</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',sans-serif;background:#1a3a2a;display:flex;
      align-items:center;justify-content:center;min-height:100vh}
    .box{background:#fff;padding:2.5rem;border-radius:12px;width:100%;max-width:380px;text-align:center}
    h2{color:#1a3a2a;margin-bottom:1.5rem}
    input{width:100%;padding:.75rem;border:1px solid #ddd;border-radius:6px;
      margin-bottom:1rem;font-size:1rem}
    button{width:100%;padding:.85rem;background:#c9a84c;color:#1a3a2a;
      border:none;border-radius:6px;font-weight:700;font-size:1rem;cursor:pointer}
    .err{color:#c0392b;margin-bottom:1rem;font-size:.9rem}
  </style></head><body>
  <div class="box">
    <h2>🏡 WVREA Admin</h2>
    <form method="POST" action="/admin/login">
      <input type="password" name="password" placeholder="Admin Password" autofocus />
      <button type="submit">Sign In</button>
    </form>
  </div></body></html>`);
});

app.post('/admin/login', (req, res) => {
  if (req.body.password === ADMIN_PASSWORD) {
    req.session.admin = true;
    res.redirect('/admin');
  } else {
    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>Admin Login</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:'Segoe UI',sans-serif;background:#1a3a2a;display:flex;
        align-items:center;justify-content:center;min-height:100vh}
      .box{background:#fff;padding:2.5rem;border-radius:12px;width:100%;max-width:380px;text-align:center}
      h2{color:#1a3a2a;margin-bottom:1.5rem}
      input{width:100%;padding:.75rem;border:1px solid #ddd;border-radius:6px;
        margin-bottom:1rem;font-size:1rem}
      button{width:100%;padding:.85rem;background:#c9a84c;color:#1a3a2a;
        border:none;border-radius:6px;font-weight:700;font-size:1rem;cursor:pointer}
      .err{color:#c0392b;margin-bottom:1rem;font-size:.9rem}
    </style></head><body>
    <div class="box">
      <h2>🏡 WVREA Admin</h2>
      <p class="err">Incorrect password</p>
      <form method="POST" action="/admin/login">
        <input type="password" name="password" placeholder="Admin Password" autofocus />
        <button type="submit">Sign In</button>
      </form>
    </div></body></html>`);
  }
});

app.get('/admin/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/admin/login');
});

// ── Admin dashboard ───────────────────────────────────────
app.get('/admin', requireAuth, (_req, res) => {
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
      <td>${p.address}${p.city ? ', '+p.city : ''}</td>
      <td>${p.county||''}</td>
      <td>${p.property_type}</td>
      <td>${p.price ? '$'+Number(p.price).toLocaleString() : '--'}</td>
      <td>${p.acreage ? p.acreage+' ac' : '--'}</td>
      <td><span class="badge ${p.status}">${p.status}</span></td>
      <td>${p.mls_status||'draft'}</td>
      <td>
        <a href="/admin/edit/${p.id}" class="btn-sm">Edit</a>
        <a href="/admin/photos/${p.listing_slug||p.id}" class="btn-sm">Photos</a>
        <a href="/admin/report/${p.id}" class="btn-sm">Report</a>
        <button class="btn-sm btn-del" data-id="${p.id}" data-address="${(p.address||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;')}">Delete</button>
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
    <script>
      document.addEventListener('click', async function(e) {
        if (!e.target.classList.contains('btn-del')) return;
        const id = e.target.dataset.id;
        const address = e.target.dataset.address;
        if (!confirm('Permanently delete listing "' + address + '"? This cannot be undone.')) return;
        const r = await fetch('/admin/properties/' + encodeURIComponent(id), { method: 'DELETE' });
        if (r.ok) { location.reload(); }
        else { alert('Delete failed. Please try again.'); }
      });
    </script>
  `));
});

// ── New listing form ──────────────────────────────────────
app.get('/admin/new', requireAuth, (req, res) => {
  const counties = db.prepare('SELECT id,name FROM counties ORDER BY name').all();
  res.send(adminShell('New Listing', listingForm(null, counties)));
});

function normalizeAcreage(body) {
  return body.acreage ?? body.lot_acres ?? null;
}

app.post('/admin/new', requireAuth, (req, res) => {
  const f = req.body;
  const id   = crypto.randomBytes(16).toString('hex');
  const slug = slugify((f.address||'listing') + '-' + (f.city||'wv'));
  const uniqueSlug = slug + '-' + id.slice(0,6);

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
    ) VALUES (
      ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?
    )
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

  // Write listing.json
  initListingFolder(uniqueSlug);
  fs.writeFileSync(
    path.join(PROJECT_ROOT,'listings',uniqueSlug,'listing.json'),
    JSON.stringify({ id, ...f, listing_slug: uniqueSlug }, null, 2)
  );

  res.redirect(`/admin/photos/${uniqueSlug}`);
});

// ── Edit listing ──────────────────────────────────────────
app.get('/admin/edit/:id', requireAuth, (req, res) => {
  const p = db.prepare('SELECT * FROM properties WHERE id=?').get(req.params.id);
  if (!p) return res.redirect('/admin');
  const counties = db.prepare('SELECT id,name FROM counties ORDER BY name').all();
  res.send(adminShell('Edit Listing', listingForm(p, counties)));
});

app.post('/admin/edit/:id', requireAuth, (req, res) => {
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

// ── Delete listing ────────────────────────────────────────
app.delete('/admin/properties/:id', requireAuth, (req, res) => {
  if (!/^[0-9a-f]{32}$/.test(req.params.id)) return res.status(400).json({ error:'Invalid id' });
  const p = db.prepare('SELECT listing_slug FROM properties WHERE id=?').get(req.params.id);
  if (!p) return res.status(404).json({ error:'Not found' });
  db.prepare('DELETE FROM properties WHERE id=?').run(req.params.id);
  const slug = p.listing_slug;
  if (slug && /^[a-z0-9-]+$/.test(slug)) {
    const listingDir = path.join(PROJECT_ROOT, 'listings', slug);
    if (fs.existsSync(listingDir)) fs.rmSync(listingDir, { recursive:true, force:true });
  }
  res.json({ ok:true });
});

// ── Photo upload page ─────────────────────────────────────
app.get('/admin/photos/:slug', requireAuth, (req, res) => {
  const slug = req.params.slug;
  const p = db.prepare('SELECT * FROM properties WHERE listing_slug=?').get(slug);
  const photoDir = path.join(PROJECT_ROOT,'listings',slug,'photos','compressed');
  let photos = [];
  if (fs.existsSync(photoDir)) {
    photos = fs.readdirSync(photoDir).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));
  }

  const photoGrid = photos.map((f,i) => `
    <div class="photo-item">
      <img src="/images/${slug}/photos/compressed/${f}" alt="Photo ${i+1}" />
      <div class="photo-actions">
        ${i===0 ? '<span class="primary-badge">Primary</span>' : `<button onclick="setPrimary('${slug}','${f}')">Set Primary</button>`}
        <button onclick="deletePhoto('${slug}','${f}')" class="del">Delete</button>
      </div>
    </div>`).join('');

  res.send(adminShell('Upload Photos', `
    <div class="dash-header">
      <h1>Photos — ${p ? p.address : slug}</h1>
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
    <h3 style="margin:1.5rem 0 1rem">Uploaded Photos (${photos.length})</h3>
    <div class="photo-grid" id="photoGrid">${photoGrid}</div>
    <script>
      const slug = '${slug}';
      const dropZone = document.getElementById('dropZone');
      const fileInput = document.getElementById('fileInput');

      dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
      dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
      dropZone.addEventListener('drop', e => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        uploadFiles(e.dataTransfer.files);
      });
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
          await fetch('/admin/upload/' + slug, { method:'POST', body:fd });
          done++;
          const pct = Math.round(done/files.length*100);
          fill.style.width = pct+'%';
          text.textContent = done + ' of ' + files.length + ' uploaded';
        }
        text.textContent = 'Done! Refreshing...';
        setTimeout(() => location.reload(), 800);
      }

      async function setPrimary(slug, filename) {
        await fetch('/admin/photos/' + slug + '/primary', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ filename })
        });
        location.reload();
      }

      async function deletePhoto(slug, filename) {
        if (!confirm('Delete this photo?')) return;
        await fetch('/admin/photos/' + slug + '/' + filename, { method:'DELETE' });
        location.reload();
      }
    </script>
  `));
});

// Upload handler
app.post('/admin/upload/:slug', requireAuth, upload.single('photo'), async (req, res) => {
  const slug = req.params.slug;
  if (!req.file) return res.status(400).json({ error: 'No file' });

  // Compress using sips (macOS built-in)
  const rawPath  = req.file.path;
  const compDir  = path.join(PROJECT_ROOT,'listings',slug,'photos','compressed');
  const mlsDir   = path.join(PROJECT_ROOT,'listings',slug,'photos','mls');
  fs.mkdirSync(compDir, { recursive:true });
  fs.mkdirSync(mlsDir,  { recursive:true });

  const filename    = req.file.filename;
  const compPath    = path.join(compDir, filename);
  const mlsPath     = path.join(mlsDir,  filename);

  const { exec } = require('child_process');
  // Compressed: max 1200px wide
  exec(`sips -Z 1200 "${rawPath}" --out "${compPath}"`, () => {
    // MLS: max 1024px wide
    exec(`sips -Z 1024 "${rawPath}" --out "${mlsPath}"`, () => {
      // Set as primary if first photo
      const p = db.prepare('SELECT image_url, listing_slug FROM properties WHERE listing_slug=?').get(slug);
      if (p && !p.image_url) {
        db.prepare('UPDATE properties SET image_url=?, photos_uploaded=1 WHERE listing_slug=?')
          .run(`/images/${slug}/photos/compressed/${filename}`, slug);
      } else {
        db.prepare('UPDATE properties SET photos_uploaded=1 WHERE listing_slug=?').run(slug);
      }

      // Upload compressed photo to Google Drive (fire-and-forget)
      const driveSource = fs.existsSync(compPath) ? compPath : rawPath;
      uploadPhotoToDrive(driveSource, filename, slug).catch(() => {});

      res.json({ ok:true, filename });
    });
  });
});

// Set primary photo
app.post('/admin/photos/:slug/primary', requireAuth, (req, res) => {
  const { filename } = req.body;
  db.prepare('UPDATE properties SET image_url=? WHERE listing_slug=?')
    .run(`/images/${req.params.slug}/photos/compressed/${filename}`, req.params.slug);
  res.json({ ok:true });
});

// Delete photo
app.delete('/admin/photos/:slug/:filename', requireAuth, (req, res) => {
  const { slug, filename } = req.params;
  ['raw','compressed','mls'].forEach(dir => {
    const fp = path.join(PROJECT_ROOT,'listings',slug,'photos',dir,filename);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  });
  res.json({ ok:true });
});

// ── Report page ───────────────────────────────────────────
app.get('/admin/report/:id', requireAuth, (req, res) => {
  const p = db.prepare(`
    SELECT p.*, c.name AS county FROM properties p
    LEFT JOIN counties c ON c.id=p.county_id
    WHERE p.id=?
  `).get(req.params.id);
  if (!p) return res.redirect('/admin');

  const slug = p.listing_slug || p.id;
  const compsPath = path.join(PROJECT_ROOT,'listings',slug,'comps.csv');
  const ddPath    = path.join(PROJECT_ROOT,'listings',slug,'due_diligence.md');
  const comps     = fs.existsSync(compsPath) ? fs.readFileSync(compsPath,'utf8') : '';
  const dd        = fs.existsSync(ddPath)    ? fs.readFileSync(ddPath,'utf8')    : '';

  res.send(adminShell('Report', `
    <div class="dash-header">
      <h1>Report — ${p.address}</h1>
      <a href="/admin" class="btn-outline">← Back</a>
    </div>
    <div class="report-grid">
      <div class="report-card">
        <h3>Property Details</h3>
        <table class="detail-table">
          <tr><td>Address</td><td>${p.address}, ${p.city} ${p.zip}</td></tr>
          <tr><td>County</td><td>${p.county}</td></tr>
          <tr><td>Type</td><td>${p.property_type}</td></tr>
          <tr><td>Acreage</td><td>${p.acreage||'--'}</td></tr>
          <tr><td>Price</td><td>${p.price ? '$'+Number(p.price).toLocaleString() : '--'}</td></tr>
          <tr><td>Price/Acre</td><td>${p.price_per_acre ? '$'+Number(p.price_per_acre).toLocaleString() : '--'}</td></tr>
          <tr><td>Flood Zone</td><td>${p.flood_zone||'--'}</td></tr>
          <tr><td>Road Access</td><td>${p.road_access||'--'}</td></tr>
          <tr><td>MLS #</td><td>${p.mls_number||'--'}</td></tr>
        </table>
      </div>
      <div class="report-card">
        <h3>Comparable Sales</h3>
        <textarea id="compsArea" rows="10">${comps}</textarea>
        <button onclick="saveComps('${p.id}')">Save Comps</button>
      </div>
      <div class="report-card full">
        <h3>Due Diligence Notes</h3>
        <textarea id="ddArea" rows="15">${dd}</textarea>
        <button onclick="saveDD('${p.id}')">Save Notes</button>
      </div>
    </div>
    <script>
      async function saveComps(id) {
        const content = document.getElementById('compsArea').value;
        await fetch('/admin/report/'+id+'/comps', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ content })
        });
        alert('Comps saved');
      }
      async function saveDD(id) {
        const content = document.getElementById('ddArea').value;
        await fetch('/admin/report/'+id+'/dd', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ content })
        });
        alert('Due diligence saved');
      }
    </script>
  `));
});

app.post('/admin/report/:id/comps', requireAuth, (req, res) => {
  const p = db.prepare('SELECT listing_slug FROM properties WHERE id=?').get(req.params.id);
  if (!p) return res.status(404).json({ error:'Not found' });
  const slug = p.listing_slug || req.params.id;
  fs.mkdirSync(path.join(PROJECT_ROOT,'listings',slug), { recursive:true });
  fs.writeFileSync(path.join(PROJECT_ROOT,'listings',slug,'comps.csv'), req.body.content);
  res.json({ ok:true });
});

app.post('/admin/report/:id/dd', requireAuth, (req, res) => {
  const p = db.prepare('SELECT listing_slug FROM properties WHERE id=?').get(req.params.id);
  if (!p) return res.status(404).json({ error:'Not found' });
  const slug = p.listing_slug || req.params.id;
  fs.mkdirSync(path.join(PROJECT_ROOT,'listings',slug), { recursive:true });
  fs.writeFileSync(path.join(PROJECT_ROOT,'listings',slug,'due_diligence.md'), req.body.content);
  res.json({ ok:true });
});

// ── Integrations status page ──────────────────────────────
app.get('/admin/integrations', requireAuth, (_req, res) => {
  const gmailUser    = process.env.GOOGLE_GMAIL_USER    || '';
  const notifyEmail  = process.env.NOTIFICATION_EMAIL   || '';
  const driveFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID || '';
  const clientId     = process.env.GOOGLE_CLIENT_ID     || '';

  const configured = clientId && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN;
  const statusBadge = (ok) => ok
    ? '<span style="background:#d4edda;color:#155724;padding:.2rem .6rem;border-radius:4px;font-size:.8rem;font-weight:700">✓ Configured</span>'
    : '<span style="background:#fff3cd;color:#856404;padding:.2rem .6rem;border-radius:4px;font-size:.8rem;font-weight:700">⚠ Not Set</span>';

  res.send(adminShell('Integrations', `
    <div class="dash-header">
      <h1>🔗 Google Integrations</h1>
    </div>
    <div style="max-width:680px">
      <div style="background:#fff;border-radius:10px;padding:1.5rem;box-shadow:0 2px 8px rgba(0,0,0,.06);margin-bottom:1.5rem">
        <h3 style="color:#1a3a2a;margin-bottom:1rem">OAuth2 Credentials</h3>
        <table class="detail-table">
          <tr><td>Client ID</td><td>${clientId ? clientId.slice(0,20)+'…' : '—'} ${statusBadge(clientId)}</td></tr>
          <tr><td>Client Secret</td><td>${process.env.GOOGLE_CLIENT_SECRET ? '••••••••' : '—'} ${statusBadge(process.env.GOOGLE_CLIENT_SECRET)}</td></tr>
          <tr><td>Refresh Token</td><td>${process.env.GOOGLE_REFRESH_TOKEN ? '••••••••' : '—'} ${statusBadge(process.env.GOOGLE_REFRESH_TOKEN)}</td></tr>
        </table>
      </div>

      <div style="background:#fff;border-radius:10px;padding:1.5rem;box-shadow:0 2px 8px rgba(0,0,0,.06);margin-bottom:1.5rem">
        <h3 style="color:#1a3a2a;margin-bottom:1rem">📧 Gmail – Inquiry Notifications</h3>
        <table class="detail-table">
          <tr><td>Send From</td><td>${gmailUser || '—'} ${statusBadge(gmailUser)}</td></tr>
          <tr><td>Send To</td><td>${notifyEmail || '—'} ${statusBadge(notifyEmail)}</td></tr>
        </table>
        <p style="margin-top:.75rem;font-size:.85rem;color:#666">
          When a visitor submits a contact inquiry on the public site, a notification email will
          be sent from your Gmail account to the address above.
        </p>
      </div>

      <div style="background:#fff;border-radius:10px;padding:1.5rem;box-shadow:0 2px 8px rgba(0,0,0,.06);margin-bottom:1.5rem">
        <h3 style="color:#1a3a2a;margin-bottom:1rem">📁 Google Drive – Photo Backup</h3>
        <table class="detail-table">
          <tr><td>Root Folder ID</td><td>${driveFolderId || '—'} ${statusBadge(driveFolderId)}</td></tr>
        </table>
        <p style="margin-top:.75rem;font-size:.85rem;color:#666">
          Every photo uploaded through the admin panel is automatically backed up to Google Drive
          inside a subfolder named after the property slug.
          ${driveFolderId ? `<br><a href="https://drive.google.com/drive/folders/${driveFolderId}" target="_blank" rel="noopener noreferrer">Open root folder in Drive →</a>` : ''}
        </p>
      </div>

      <div style="background:#fffdf5;border:1px solid #c9a84c;border-radius:10px;padding:1.5rem">
        <h3 style="color:#1a3a2a;margin-bottom:.75rem">🛠 Setup Instructions</h3>
        <ol style="padding-left:1.25rem;font-size:.9rem;line-height:1.8">
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
  `));
});

// ── Public API ────────────────────────────────────────────
app.get('/api/health', (_req, res) => res.json({ status:'ok', ts:new Date() }));

app.get('/api/counties', (_req, res) => {
  res.json(db.prepare('SELECT id,name FROM counties ORDER BY name').all());
});

app.get('/api/properties', (req, res) => {
  try {
    const { q='',county='',type='',minPrice='',maxPrice='',page=1,limit=12 } = req.query;
    const conditions = ["p.status = 'active'"];
    const values = [];
    if (q)        { conditions.push(`(p.address LIKE ? OR p.zip LIKE ?)`); values.push(`%${q}%`,`%${q}%`); }
    if (county)   { conditions.push(`p.county_id = ?`);       values.push(Number(county)); }
    if (type)     { conditions.push(`p.property_type = ?`);   values.push(type); }
    if (minPrice) { conditions.push(`p.price >= ?`);          values.push(Number(minPrice)); }
    if (maxPrice) { conditions.push(`p.price <= ?`);          values.push(Number(maxPrice)); }
    const where  = 'WHERE ' + conditions.join(' AND ');
    const offset = (Number(page)-1) * Number(limit);
    const total  = db.prepare(`SELECT COUNT(*) as c FROM properties p ${where}`).get(...values).c;
    // DB stores `acreage`; the public API exposes `lot_acres` (aliased) for the UI
    const properties = db.prepare(`
      SELECT p.id, p.address, p.city, p.zip, p.price, p.property_type,
             p.bedrooms, p.bathrooms, p.sqft, p.acreage AS lot_acres,
             p.year_built, p.image_url, p.listed_at, p.status, p.price_reduced,
             c.name AS county
      FROM properties p JOIN counties c ON c.id=p.county_id
      ${where} ORDER BY p.listed_at DESC LIMIT ? OFFSET ?
    `).all(...values, Number(limit), offset);
    res.json({ total, page:Number(page), properties });
  } catch(err) { console.error(err); res.status(500).json({ error:'Failed' }); }
});

app.get('/api/properties/:id', (req, res) => {
  const row = db.prepare(`
    SELECT p.id, p.address, p.city, p.zip, p.price, p.property_type,
           p.bedrooms, p.bathrooms, p.sqft, p.acreage AS lot_acres,
           p.year_built, p.image_url, p.listed_at, p.status, p.price_reduced,
           p.county_id, c.name AS county,
           p.marketing_description, p.property_description
    FROM properties p JOIN counties c ON c.id=p.county_id WHERE p.id=?
  `).get(req.params.id);
  if (!row) return res.status(404).json({ error:'Not found' });
  res.json(row);
});

app.get('/api/analytics', (_req, res) => {
  const row = db.prepare(`
    SELECT
      CAST(ROUND(AVG(price)) AS INTEGER) AS avgPrice,
      COUNT(*) AS totalListings,
      CAST(ROUND(AVG(julianday('now')-julianday(listed_at))) AS INTEGER) AS medianDom,
      CAST(ROUND(AVG(price/MAX(sqft,1))) AS INTEGER) AS pricePerSqft
    FROM properties WHERE status='active'
  `).get();
  res.json(row);
});

app.post('/api/contacts', contactsRateLimit, (req, res) => {
  const { property_id,name,email,phone,message } = req.body;
  if (!name||!email) return res.status(400).json({ error:'Name and email required' });
  const result = db.prepare(
    `INSERT INTO contacts (property_id,name,email,phone,message) VALUES (?,?,?,?,?)`
  ).run(property_id||null,name,email,phone,message);

  // Send Gmail notification (fire-and-forget; never blocks the API response)
  const property = property_id
    ? db.prepare(`SELECT p.id, p.address, p.city, c.name AS county
                  FROM properties p LEFT JOIN counties c ON c.id=p.county_id
                  WHERE p.id=?`).get(property_id)
    : null;
  sendContactEmail({ name, email, phone, message }, property).catch(() => {});

  res.status(201).json({ id:result.lastInsertRowid });
});

app.use(express.static(path.join(PROJECT_ROOT, 'app')));
app.use((_req,res) => res.status(404).json({ error:'Not found' }));
app.use((err,_req,res,_next) => { console.error(err); res.status(500).json({ error:'Server error' }); });

app.listen(PORT, () => console.log(`✅ WV Property API → http://localhost:${PORT}\n   Admin Panel  → http://localhost:${PORT}/admin`));
module.exports = app;

// ── Admin HTML shell ──────────────────────────────────────
function adminShell(title, body) {
  return `<!DOCTYPE html><html lang="en"><head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title} — WVREA Admin</title>
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
    .btn-del{background:#c0392b;color:#fff}
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
  </body></html>`;
}

// ── Listing form HTML ─────────────────────────────────────
function listingForm(p, counties) {
  const v = (f) => p ? (p[f]||'') : '';
  const chk = (f) => p && p[f] ? 'checked' : '';
  const sel = (f,val) => p && p[f]===val ? 'selected' : '';
  const countyOpts = counties.map(c =>
    `<option value="${c.id}" ${p && p.county_id==c.id?'selected':''}>${c.name}</option>`
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

      <div class="full"><label>Property Description</label>
        <textarea name="property_description" rows="4">${v('property_description')}</textarea></div>
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
