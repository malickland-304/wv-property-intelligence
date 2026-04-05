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
const { exec }    = require('child_process');
const { promisify } = require('util');
const execAsync     = promisify(exec);

const { uploadPhotoToDrive } = require('./google');
const { sendLeadNotification } = require('./services/email');

const app  = express();
const PORT = process.env.PORT || 3000;

// Trust one proxy hop (Cloudflare → Railway). Required for correct req.ip,
// X-Forwarded-For in logs, and rate-limiter keying.
app.set('trust proxy', 1);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'wvrea2026';
const PROJECT_ROOT   = path.join(__dirname, '..');

// ── DB ────────────────────────────────────────────────────
// DATABASE_PATH env var must point to the Railway persistent volume (/data/wv_property.db).
// Without it, Railway redeploys wipe the database silently.
const DB_PATH = process.env.DATABASE_PATH || path.join(PROJECT_ROOT, 'database', 'wv_property.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('cache_size = -32000');   // 32MB SQLite cache cap
db.pragma('mmap_size = 67108864');  // 64MB mmap cap

// Periodic WAL checkpoint every 5 minutes
setInterval(() => {
  try { db.pragma('wal_checkpoint(PASSIVE)'); } catch (_) {}
}, 5 * 60 * 1000);

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

// Schema migrations (safe to run repeatedly)
try { db.exec(`ALTER TABLE contacts ADD COLUMN lead_status TEXT DEFAULT 'new'`); } catch(_) {}
try { db.exec(`ALTER TABLE contacts ADD COLUMN last_contacted_at TEXT`); } catch(_) {}

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

// ── Schema migrations (add missing columns to pre-existing DBs) ──────────────
{
  const cols = db.prepare("PRAGMA table_info(properties)").all().map(r => r.name);
  const add  = (col, def) => {
    if (!cols.includes(col)) {
      try { db.exec(`ALTER TABLE properties ADD COLUMN ${col} ${def}`); } catch (_) {}
    }
  };
  add('property_description', 'TEXT');
  add('marketing_description','TEXT');
  add('seller_notes',         'TEXT');
  add('internal_notes',       'TEXT');
  add('listing_slug',         'TEXT');
  add('mls_number',           'TEXT');
  add('mls_status',           'TEXT DEFAULT "draft"');
  add('listing_agent',        'TEXT');
  add('listing_office',       'TEXT');
  add('acreage',              'REAL');
  add('lot_size',             'TEXT');
  add('road_access',          'TEXT');
  add('utilities_available',  'TEXT');
  add('septic',               'INTEGER DEFAULT 0');
  add('well',                 'INTEGER DEFAULT 0');
  add('electric',             'INTEGER DEFAULT 0');
  add('internet',             'INTEGER DEFAULT 0');
  add('price_reduced',        'INTEGER DEFAULT 0');
  add('recommended_list_price','REAL');
  add('price_per_acre',       'REAL');
  add('tax_assessed',         'REAL');
  add('annual_tax',           'REAL');
  add('latitude',             'REAL');
  add('longitude',            'REAL');
  add('flood_zone',           'TEXT');
  add('school_district',      'TEXT');
  add('bedrooms',             'INTEGER');
  add('bathrooms',            'REAL');
  add('sqft',                 'INTEGER');
  add('year_built',           'INTEGER');
  add('subdivision',          'TEXT');
  add('parcel_id',            'TEXT');
  add('image_url',            'TEXT');
  add('due_diligence_complete','INTEGER DEFAULT 0');
  add('photos_uploaded',      'INTEGER DEFAULT 0');
  add('comps_complete',       'INTEGER DEFAULT 0');
  add('sold_at',              'TEXT');
  add('ai_content',           'TEXT');
  add('ai_generated_at',      'TEXT');
  add('state',                "TEXT DEFAULT 'WV'");
  add('zip',                  'TEXT');
  add('city',                 'TEXT');
  add('price',                'REAL');
}

// ── Advent Dr listing migration ───────────────────────────
{
  const hampshire = db.prepare("SELECT id FROM counties WHERE name='Hampshire'").get();
  if (hampshire) {
    const existing = db.prepare(
      "SELECT id, property_description FROM properties WHERE mls_number='WVHS2007442' OR (address LIKE '%Advent%' AND county_id=?)"
    ).get(hampshire.id);
    const descSuffix = 'MLS# WVHS2007442 | 37 Advent Dr, Romney, WV 26757 | Hampshire County | Listed at $219,900 | Contact Phil Malick for details.';
    if (existing) {
      const cur = existing.property_description || '';
      const newDesc = cur.includes('WVHS2007442') ? cur : (cur ? cur + '\n\n' + descSuffix : descSuffix);
      db.prepare(`
        UPDATE properties SET
          listing_slug='advent-dr-hampshire-wv',
          property_type='land',
          status='active',
          mls_number='WVHS2007442',
          price=219900,
          property_description=?,
          image_url=COALESCE(NULLIF(image_url,''),'/assets/advent-1.jpg'),
          updated_at=datetime('now')
        WHERE id=?
      `).run(newDesc, existing.id);
      console.log('Updated Advent Dr listing →', existing.id);
    } else {
      const newId = crypto.randomBytes(16).toString('hex');
      db.prepare(`
        INSERT INTO properties
          (id,county_id,address,city,state,zip,property_type,status,price,
           mls_number,listing_agent,listing_slug,property_description,image_url)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        newId, hampshire.id, '37 Advent Dr', 'Romney', 'WV', '26757',
        'land', 'active', 219900,
        'WVHS2007442', 'Phil Malick', 'advent-dr-hampshire-wv', descSuffix, '/assets/advent-1.jpg'
      );
      console.log('Inserted Advent Dr listing →', newId);
    }
  }
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
  limits: { fileSize: 15 * 1024 * 1024, files: 20, fieldSize: 1 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, /\.(jpg|jpeg|png|webp|heic)$/i.test(file.originalname));
  }
});

// ── Middleware ────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());

// ── www → apex canonical redirect ───────────────────────
app.use((req, res, next) => {
  const host = req.hostname || '';
  // www.malickland.net → malickland.net
  if (host.startsWith('www.')) {
    return res.redirect(301, 'https://malickland.net' + req.originalUrl);
  }
  // malickland.com (any variant) → malickland.net
  if (host === 'malickland.com' || host === 'www.malickland.com') {
    return res.redirect(301, 'https://malickland.net' + req.originalUrl);
  }
  next();
});
app.use(morgan(process.env.NODE_ENV === 'production' ? 'tiny' : 'dev'));
app.use(express.json());
app.use(express.urlencoded({ extended:true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'wvrea-secret-2026',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 8 * 60 * 60 * 1000,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  },
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

// ── Rate limiters ─────────────────────────────────────────
const contactsRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many inquiries. Please wait a moment.' },
});

// 10 login attempts per 15 minutes per IP — brute-force guard
const adminLoginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
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

app.post('/admin/login', adminLoginRateLimit, (req, res) => {
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

  const rawPath = req.file.path;
  const compDir = path.join(PROJECT_ROOT,'listings',slug,'photos','compressed');
  const mlsDir  = path.join(PROJECT_ROOT,'listings',slug,'photos','mls');
  fs.mkdirSync(compDir, { recursive:true });
  fs.mkdirSync(mlsDir,  { recursive:true });

  const filename = req.file.filename;
  const compPath = path.join(compDir, filename);
  const mlsPath  = path.join(mlsDir,  filename);

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
    res.json({ ok:true, filename });
  }

  if (process.platform === 'darwin') {
    // sips is macOS-only — use it when available for lossless resize
    exec(`sips -Z 1200 "${rawPath}" --out "${compPath}"`, () => {
      exec(`sips -Z 1024 "${rawPath}" --out "${mlsPath}"`, afterCompress);
    });
  } else {
    // Linux/Railway: copy raw file as-is; compression can be added via sharp later
    fs.copyFileSync(rawPath, compPath);
    fs.copyFileSync(rawPath, mlsPath);
    afterCompress();
  }
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

// ── Leads view ───────────────────────────────────────────
app.get('/admin/leads', requireAuth, (req, res) => {
  const leads = db.prepare(`
    SELECT ct.id, ct.name, ct.email, ct.phone, ct.message, ct.source,
           ct.created_at, ct.lead_status,
           p.address, p.city, c.name AS county
    FROM contacts ct
    LEFT JOIN properties p ON p.id = ct.property_id
    LEFT JOIN counties c ON c.id = p.county_id
    ORDER BY ct.created_at DESC
    LIMIT 200
  `).all();

  const statusColors = { new:'active', contacted:'pending', qualified:'pending', closed:'sold', lost:'draft' };
  const rows = leads.map(l => {
    const status = l.lead_status || 'new';
    return `
    <tr id="lead-${l.id}">
      <td>${new Date(l.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'2-digit'})}</td>
      <td><strong>${l.name||'—'}</strong></td>
      <td><a href="mailto:${l.email}" style="color:#1a3a2a">${l.email||'—'}</a></td>
      <td>${l.phone ? `<a href="tel:${l.phone}" style="color:#1a3a2a">${l.phone}</a>` : '—'}</td>
      <td style="font-size:.82rem">${l.address ? `${l.address}${l.city?', '+l.city:''}, ${l.county||''}` : '—'}</td>
      <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.82rem" title="${(l.message||'').replace(/"/g,'')}">${l.message||'—'}</td>
      <td>
        <select onchange="updateLeadStatus(${l.id},this.value)" style="padding:.25rem .5rem;border:1px solid #ddd;border-radius:4px;font-size:.8rem;background:#fff">
          ${['new','contacted','qualified','closed','lost'].map(s=>`<option value="${s}"${s===status?' selected':''}>${s}</option>`).join('')}
        </select>
      </td>
    </tr>`;
  }).join('');

  res.send(adminShell('Leads', `
    <div class="dash-header">
      <h1>Leads &amp; Inquiries</h1>
      <span style="color:#666;font-size:.9rem">${leads.length} total &middot; ${leads.filter(l=>!l.lead_status||l.lead_status==='new').length} new</span>
    </div>
    ${leads.length ? `
    <table class="listings-table">
      <thead><tr>
        <th>Date</th><th>Name</th><th>Email</th><th>Phone</th><th>Property</th><th>Message</th><th>Status</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <script>
    async function updateLeadStatus(id, status) {
      await fetch('/admin/leads/'+id+'/status', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status})});
    }
    </script>` : `<p style="color:#666;padding:2rem">No leads yet. Share your listings!</p>`}
  `));
});

app.post('/admin/leads/:id/status', requireAuth, (req, res) => {
  const valid = ['new','contacted','qualified','closed','lost'];
  const status = req.body.status;
  if (!valid.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  db.prepare(`UPDATE contacts SET lead_status=?, last_contacted_at=datetime('now') WHERE id=?`).run(status, req.params.id);
  res.json({ ok: true });
});

// ── Public API ────────────────────────────────────────────
app.get('/api/health', (_req, res) => res.json({ status:'ok', ts:new Date() }));

// Public config (GA ID, Meta Pixel, etc.) — safe to expose
app.get('/api/config', (_req, res) => {
  res.json({
    gaId:    process.env.GA_MEASUREMENT_ID || '',
    pixelId: process.env.META_PIXEL_ID     || '',
  });
});

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
           p.county_id, c.name AS county, p.property_description AS description
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
  sendLeadNotification({ name, email, phone, message, source: req.body.source }, property).catch(() => {});

  res.status(201).json({ id:result.lastInsertRowid });
});

app.post('/api/listings/generate-description', (req, res) => {
  const { acreage, county, property_type, features } = req.body;
  if (!county) return res.status(400).json({ error: 'county is required' });
  const type = (property_type || 'land').toLowerCase();
  const featureList = Array.isArray(features) ? features.filter(Boolean) : [];
  const featStr = featureList.length
    ? featureList.join('. ') + '.'
    : 'Excellent opportunity in a sought-after area.';
  const description = [
    acreage ? `${acreage} acres of ${type} land in ${county} County, West Virginia.` : `${type.charAt(0).toUpperCase() + type.slice(1)} land in ${county} County, West Virginia.`,
    featStr,
    'Contact MalickLand for details.',
  ].join(' ');
  res.json({ description });
});

// ── Sitemap & Robots ─────────────────────────────────────
app.get('/robots.txt', (_req, res) => {
  res.type('text/plain');
  res.send(
`User-agent: *
Allow: /
Disallow: /admin
Disallow: /api/
Sitemap: https://malickland.net/sitemap.xml`
  );
});

app.get('/sitemap.xml', (_req, res) => {
  const SITE = 'https://malickland.net';
  const now  = new Date().toISOString().split('T')[0];

  // Static pages
  const staticPages = [
    { loc: SITE + '/',        changefreq: 'weekly',  priority: '1.0' },
    { loc: SITE + '/admin',   changefreq: 'never',   priority: '0.1' },
  ];

  // Dynamic property pages
  let propertyPages = [];
  try {
    const props = db.prepare(`
      SELECT listing_slug, id, updated_at
      FROM properties
      WHERE status = 'active'
    `).all();
    propertyPages = props.map(p => ({
      loc: `${SITE}/properties/${p.listing_slug || p.id}`,
      lastmod: (p.updated_at || now).split(' ')[0],
      changefreq: 'weekly',
      priority: '0.8',
    }));
  } catch (_) {}

  // County SEO pages (Phil's primary coverage + any county with active listings)
  const PRIMARY_COUNTIES = ['Hampshire','Hardy','Morgan','Grant','Pendleton','Mineral','Berkeley','Jefferson','Tucker'];
  let countyPages = [];
  try {
    const activeCnty = db.prepare(`
      SELECT DISTINCT c.name FROM counties c
      JOIN properties p ON p.county_id = c.id
      WHERE p.status = 'active'
    `).all().map(r => r.name);
    const allCnty = [...new Set([...PRIMARY_COUNTIES, ...activeCnty])];
    countyPages = allCnty.map(name => ({
      loc: `${SITE}/wv/${name.toLowerCase().replace(/\s+/g,'-')}-county`,
      lastmod: now,
      changefreq: 'weekly',
      priority: '0.7',
    }));
  } catch (_) {}

  const allPages = [...staticPages, ...propertyPages, ...countyPages];

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...allPages.map(p => [
      '  <url>',
      `    <loc>${p.loc}</loc>`,
      p.lastmod ? `    <lastmod>${p.lastmod}</lastmod>` : `    <lastmod>${now}</lastmod>`,
      `    <changefreq>${p.changefreq}</changefreq>`,
      `    <priority>${p.priority}</priority>`,
      '  </url>',
    ].join('\n')),
    '</urlset>',
  ].join('\n');

  res.type('application/xml');
  res.send(xml);
});

// ── Shared helpers ────────────────────────────────────────
function gaSnippet() {
  const gaId    = process.env.GA_MEASUREMENT_ID;
  const pixelId = process.env.META_PIXEL_ID;
  let html = '';
  if (gaId) {
    html += `<script async src="https://www.googletagmanager.com/gtag/js?id=${gaId}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${gaId}');</script>`;
  }
  if (pixelId) {
    html += `<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${pixelId}');fbq('track','PageView');</script>`;
  }
  return html;
}

// ── County SEO pages  /wv/:county-county ──────────────────
app.get('/wv/:slug', (req, res) => {
  const slug = req.params.slug; // e.g. "hampshire-county"
  const countyName = slug
    .replace(/-county$/i, '')
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  const county = db.prepare(`SELECT id, name FROM counties WHERE name = ?`).get(countyName);
  if (!county) return res.status(404).json({ error: 'County not found' });

  const listings = db.prepare(`
    SELECT id, listing_slug, address, city, price, property_type, lot_acres, bedrooms, image_url, description
    FROM properties
    WHERE county_id = ? AND status = 'active'
    ORDER BY price ASC
  `).all(county.id);

  const SITE = 'https://malickland.net';
  const title = `Land & Property for Sale in ${county.name} County, WV | MalickLand`;
  const desc  = `Browse ${listings.length || ''} active listings in ${county.name} County, West Virginia. Hunting land, rural homes, and investment property listed by Phil Malick — local WV land specialist.`;

  const cardHtml = listings.length ? listings.map(p => {
    const url = `${SITE}/properties/${p.listing_slug || p.id}`;
    const price = p.price ? `$${Number(p.price).toLocaleString()}` : 'Price TBD';
    return `
    <div class="lcard">
      ${p.image_url ? `<img src="${p.image_url}" alt="${p.address}" loading="lazy">` : `<div class="lcard-img-ph"></div>`}
      <div class="lcard-body">
        <div class="lcard-price">${price}</div>
        <div class="lcard-addr">${p.address}${p.city ? ', ' + p.city : ''}</div>
        <div class="lcard-type">${p.property_type}${p.lot_acres ? ' · ' + p.lot_acres + ' ac' : ''}${p.bedrooms ? ' · ' + p.bedrooms + ' bd' : ''}</div>
        ${p.description ? `<p class="lcard-desc">${p.description.slice(0,160)}…</p>` : ''}
        <a href="${url}" class="lcard-btn">View Listing →</a>
      </div>
    </div>`;
  }).join('') : `
  <div style="grid-column:1/-1;background:#fff;border-radius:12px;padding:2rem;text-align:center;border:1px solid #e0e0e0">
    <div style="font-size:2.5rem;margin-bottom:.75rem">🌲</div>
    <h3 style="color:#1B4332;margin-bottom:.5rem">No Active Listings Right Now</h3>
    <p style="color:#666;margin-bottom:1.25rem">Be the first to know when ${county.name} County listings come available.</p>
    <form id="notifyForm" style="display:flex;gap:.5rem;justify-content:center;flex-wrap:wrap" onsubmit="return notifySubmit(event,'${county.name}')">
      <input type="email" placeholder="Your email" required style="padding:.65rem 1rem;border:1px solid #ddd;border-radius:8px;font-size:.9rem;min-width:220px">
      <button type="submit" style="background:#D4AF37;color:#0a0a0a;border:none;border-radius:8px;padding:.65rem 1.25rem;font-weight:700;cursor:pointer">Notify Me</button>
    </form>
    <script>
    function notifySubmit(e, county) {
      e.preventDefault();
      var email = e.target.querySelector('input[type=email]').value;
      fetch('/api/contacts',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({name:'County Alert',email:email,message:'Notify me for '+county+' County listings',source:'county_notify'})
      }).then(r=>{if(r.ok)e.target.innerHTML='<p style="color:#1B4332;font-weight:600">✅ You\'re on the list!</p>';}).catch(()=>{});
      return false;
    }
    </script>
  </div>`;

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Properties for Sale in ${county.name} County WV`,
    url: `${SITE}/wv/${slug}`,
    numberOfItems: listings.length,
    itemListElement: listings.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${SITE}/properties/${p.listing_slug || p.id}`,
      name: `${p.address} — ${county.name} County WV`,
    })),
  });

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title>
  <meta name="description" content="${desc}">
  <link rel="canonical" href="${SITE}/wv/${slug}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${desc}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${SITE}/wv/${slug}">
  <meta property="og:image" content="${SITE}/public/brand/og-image.jpg">
  <script type="application/ld+json">${jsonLd}</script>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',sans-serif;background:#f9f6f0;color:#1a1a1a}
    .nav{background:#0a0a0a;border-bottom:2px solid #D4AF37;padding:.75rem 2rem;display:flex;justify-content:space-between;align-items:center}
    .nav a{color:#D4AF37;text-decoration:none;font-weight:700;font-size:1.1rem}
    .nav-links a{color:#fff;font-size:.9rem;margin-left:1.5rem;font-weight:400}
    .hero{background:linear-gradient(135deg,#0a0a0a 0%,#1B4332 100%);color:#fff;padding:3rem 2rem;text-align:center}
    .hero h1{font-size:2rem;color:#D4AF37;margin-bottom:.5rem}
    .hero p{opacity:.85;max-width:600px;margin:0 auto}
    .main{max-width:1100px;margin:2.5rem auto;padding:0 1.5rem}
    .section-title{font-size:1.4rem;color:#1B4332;margin-bottom:1.5rem;font-weight:800}
    .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1.25rem;margin-bottom:3rem}
    .lcard{background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)}
    .lcard img{width:100%;height:190px;object-fit:cover}
    .lcard-img-ph{width:100%;height:190px;background:#c8d4cc}
    .lcard-body{padding:1rem}
    .lcard-price{font-size:1.3rem;font-weight:800;color:#1B4332;margin-bottom:.25rem}
    .lcard-addr{font-size:.95rem;margin-bottom:.2rem}
    .lcard-type{font-size:.82rem;color:#666;margin-bottom:.6rem}
    .lcard-desc{font-size:.82rem;color:#555;line-height:1.5;margin-bottom:.75rem}
    .lcard-btn{display:inline-block;background:#D4AF37;color:#0a0a0a;padding:.5rem 1.1rem;border-radius:6px;text-decoration:none;font-weight:700;font-size:.85rem}
    .contact-box{background:#1B4332;color:#fff;border-radius:12px;padding:2rem;margin-bottom:3rem;text-align:center}
    .contact-box h2{color:#D4AF37;margin-bottom:.75rem}
    .contact-box p{opacity:.9;margin-bottom:1rem}
    .contact-box a{color:#D4AF37;font-weight:700}
    .nearby{margin-bottom:3rem}
    .nearby h2{font-size:1.1rem;color:#1B4332;margin-bottom:.75rem;font-weight:700}
    .nearby-links{display:flex;flex-wrap:wrap;gap:.5rem}
    .nearby-links a{background:#fff;border:1px solid #ddd;border-radius:6px;padding:.4rem .8rem;font-size:.85rem;color:#1B4332;text-decoration:none;font-weight:600}
    .nearby-links a:hover{background:#1B4332;color:#D4AF37}
    footer{background:#0a0a0a;color:#aaa;text-align:center;padding:1.5rem;font-size:.82rem}
    @media(max-width:600px){.hero h1{font-size:1.4rem}.nav-links{display:none}}
  </style>
  ${gaSnippet()}
</head>
<body>
<nav class="nav">
  <a href="/">MalickLand</a>
  <div>
    <a href="/#listings" class="nav-links">All Listings</a>
    <a href="/#contact" class="nav-links">Contact</a>
  </div>
</nav>
<div class="hero">
  <h1>Land &amp; Property for Sale in ${county.name} County, WV</h1>
  <p>${listings.length ? `${listings.length} active listing${listings.length > 1 ? 's' : ''} · Updated daily · Local agent Phil Malick` : `Be notified when listings come available in ${county.name} County`}</p>
</div>
<div class="main">
  <h2 class="section-title">Active Listings in ${county.name} County</h2>
  <div class="grid">${cardHtml}</div>

  <div class="contact-box">
    <h2>Work With a Local ${county.name} County Specialist</h2>
    <p>Phil Malick knows WV land — from timber and hunting tracts to rural homesites. Call or email for a free property consultation.</p>
    <p>
      <a href="tel:+15402461421">(540) 246-1421</a>
      &nbsp;·&nbsp;
      <a href="mailto:phil@malickland.net">phil@malickland.net</a>
    </p>
  </div>

  <div class="nearby">
    <h2>Explore Nearby Counties</h2>
    <div class="nearby-links">
      ${['Hampshire','Hardy','Morgan','Grant','Pendleton','Mineral','Tucker','Berkeley'].filter(n=>n!==county.name).map(n=>`<a href="/wv/${n.toLowerCase()}-county">${n} County</a>`).join('')}
    </div>
  </div>
</div>
<footer>
  &copy; ${new Date().getFullYear()} MalickLand Real Estate &middot; Phil Malick, WV Licensed REALTOR&reg;
  &middot; Broker: Sheila Judy &middot; <a href="/" style="color:#D4AF37">malickland.net</a>
</footer>
</body>
</html>`);
});

// ── Individual property SEO page  /properties/:slug ──────
app.get('/properties/:slug', (req, res) => {
  const { slug } = req.params;
  const p = db.prepare(`
    SELECT p.*, c.name AS county
    FROM properties p
    JOIN counties c ON c.id = p.county_id
    WHERE p.listing_slug = ? OR p.id = ?
  `).get(slug, slug);

  if (!p) return res.status(404).sendFile(path.join(PROJECT_ROOT, 'app', 'index.html'));

  const SITE = 'https://malickland.net';
  const pageUrl = `${SITE}/properties/${p.listing_slug || p.id}`;
  const price = p.price ? `$${Number(p.price).toLocaleString()}` : 'Price Upon Request';
  const title = `${p.address}${p.city ? ', ' + p.city : ''} – ${p.county} County WV | MalickLand`;
  const desc  = p.description
    ? p.description.slice(0, 155)
    : `${p.property_type} for sale in ${p.county} County, WV. ${price}. Contact Phil Malick, local WV land specialist.`;

  const addr = encodeURIComponent(`${p.address}${p.city?', '+p.city:''}, WV${p.zip?' '+p.zip:''}`);
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${addr}`;
  const satUrl  = `https://www.google.com/maps/@?api=1&map_action=map&basemap=satellite&q=${addr}`;

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'RealEstateListing',
    name: `${p.address} – ${p.county} County WV`,
    description: p.description || desc,
    url: pageUrl,
    image: p.image_url || `${SITE}/public/brand/og-image.jpg`,
    offers: p.price ? {
      '@type': 'Offer',
      price: p.price,
      priceCurrency: 'USD',
    } : undefined,
    address: {
      '@type': 'PostalAddress',
      streetAddress: p.address,
      addressLocality: p.city || '',
      addressRegion: 'WV',
      postalCode: p.zip || '',
      addressCountry: 'US',
    },
  });

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title>
  <meta name="description" content="${desc}">
  <link rel="canonical" href="${pageUrl}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${desc}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${pageUrl}">
  <meta property="og:image" content="${p.image_url || SITE + '/public/brand/og-image.jpg'}">
  <script type="application/ld+json">${jsonLd}</script>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',sans-serif;background:#f9f6f0;color:#1a1a1a}
    .nav{background:#0a0a0a;border-bottom:2px solid #D4AF37;padding:.75rem 2rem;display:flex;justify-content:space-between;align-items:center}
    .nav a{color:#D4AF37;text-decoration:none;font-weight:700;font-size:1.1rem}
    .back-link{color:#fff!important;font-size:.9rem;font-weight:400!important;margin-left:1.5rem}
    .hero{background:linear-gradient(135deg,#0a0a0a 0%,#1B4332 100%);color:#fff;padding:2.5rem 2rem}
    .hero-inner{max-width:900px;margin:0 auto}
    .hero-price{font-size:2.2rem;font-weight:900;color:#D4AF37;margin-bottom:.25rem}
    .hero-addr{font-size:1.1rem;opacity:.85}
    .main{max-width:900px;margin:2rem auto;padding:0 1.5rem;display:grid;grid-template-columns:1fr;gap:1.5rem}
    .prop-img{width:100%;max-height:420px;object-fit:cover;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,.12)}
    .chips{display:flex;flex-wrap:wrap;gap:.6rem;margin-bottom:.25rem}
    .chip{background:#fff;border:1px solid #e0e0e0;padding:.4rem .8rem;border-radius:6px;font-size:.85rem}
    .chip.type{background:#1B4332;color:#D4AF37;font-weight:700;border-color:#1B4332}
    .desc{line-height:1.7;color:#444;font-size:.95rem}
    .map-row{display:flex;gap:.75rem;flex-wrap:wrap}
    .map-btn{display:inline-flex;align-items:center;gap:.4rem;padding:.6rem 1.1rem;border-radius:8px;font-size:.85rem;font-weight:600;background:#fff;color:#1a1a1a;border:1px solid #e0e0e0;text-decoration:none}
    .map-btn:hover{background:#f3f4f6}
    .contact-box{background:#1B4332;color:#fff;border-radius:12px;padding:1.75rem}
    .contact-box h2{color:#D4AF37;margin-bottom:.5rem;font-size:1.1rem}
    .contact-box p{font-size:.9rem;opacity:.9;margin-bottom:.75rem}
    .contact-box a{color:#D4AF37;font-weight:700}
    footer{background:#0a0a0a;color:#aaa;text-align:center;padding:1.5rem;font-size:.82rem;margin-top:3rem}
    @media(max-width:600px){.hero-price{font-size:1.6rem}}
  </style>
  ${gaSnippet()}
</head>
<body>
<nav class="nav">
  <a href="/">MalickLand</a>
  <a href="/#listings" class="back-link">← All Listings</a>
</nav>
<div class="hero">
  <div class="hero-inner">
    <div class="hero-price">${price}</div>
    <div class="hero-addr">${p.address}${p.city?', '+p.city:''} &middot; ${p.county} County, WV${p.zip?' '+p.zip:''}</div>
  </div>
</div>
<div class="main">
  ${p.image_url ? `<img src="${p.image_url}" alt="${p.address}" class="prop-img">` : ''}
  <div>
    <div class="chips">
      <span class="chip type">${p.property_type}</span>
      ${p.bedrooms  ? `<span class="chip">🛏 ${p.bedrooms} bd</span>` : ''}
      ${p.bathrooms ? `<span class="chip">🚿 ${p.bathrooms} ba</span>` : ''}
      ${p.sqft      ? `<span class="chip">📐 ${Number(p.sqft).toLocaleString()} sqft</span>` : ''}
      ${p.lot_acres ? `<span class="chip">🌿 ${p.lot_acres} acres</span>` : ''}
      ${p.year_built? `<span class="chip">🏗 Built ${p.year_built}</span>` : ''}
      <span class="chip">📍 ${p.county} County, WV</span>
    </div>
  </div>
  ${p.description ? `<p class="desc">${p.description}</p>` : ''}
  <div class="map-row">
    <a href="${mapsUrl}" target="_blank" rel="noopener" class="map-btn">🗺 View on Map</a>
    <a href="${satUrl}"  target="_blank" rel="noopener" class="map-btn">🛰 Satellite View</a>
    <a href="/wv/${p.county.toLowerCase()}-county" class="map-btn">📍 More ${p.county} County listings</a>
  </div>
  <div class="contact-box">
    <h2>Interested in This Property?</h2>
    <p>Contact Phil Malick directly — local WV land specialist, no runaround.</p>
    <p>
      <a href="tel:+15402461421">(540) 246-1421</a>
      &nbsp;·&nbsp;
      <a href="mailto:phil@malickland.net?subject=Inquiry: ${encodeURIComponent(p.address)}">phil@malickland.net</a>
    </p>
  </div>
</div>
<footer>
  &copy; ${new Date().getFullYear()} MalickLand Real Estate &middot; Phil Malick, WV Licensed REALTOR&reg;
  &middot; Broker: Sheila Judy &middot; <a href="/" style="color:#D4AF37">malickland.net</a>
</footer>
</body>
</html>`);
});

app.use(express.static(path.join(PROJECT_ROOT, 'app')));
app.use((_req,res) => res.status(404).json({ error:'Not found' }));
app.use((err,_req,res,_next) => { console.error(err); res.status(500).json({ error:'Server error' }); });

app.listen(PORT, () => console.log(`✅ WV Property API → http://localhost:${PORT}\n   Admin Panel  → http://localhost:${PORT}/admin`));
module.exports = app;

// ── DB Backup (daily, keep last 7) ───────────────────────
const BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const BACKUP_KEEP = 7; // days of backups to retain

function runDbBackup() {
  try {
    const backupPath = DB_PATH.replace(/\.db$/, `_backup_${new Date().toISOString().slice(0,10)}.db`);
    const dbLive = new Database(DB_PATH);
    dbLive.backup(backupPath)
      .then(() => {
        console.log(`✅ DB backup → ${backupPath}`);
        dbLive.close();
        pruneOldBackups();
      })
      .catch(err => { console.error('DB backup failed:', err); dbLive.close(); });
  } catch (err) {
    console.error('DB backup error:', err);
  }
}

function pruneOldBackups() {
  try {
    const dir = path.dirname(DB_PATH);
    const backups = fs.readdirSync(dir)
      .filter(f => /wv_property_backup_\d{4}-\d{2}-\d{2}\.db$/.test(f))
      .sort(); // lexicographic = chronological for ISO dates
    const toDelete = backups.slice(0, Math.max(0, backups.length - BACKUP_KEEP));
    toDelete.forEach(f => {
      try { fs.unlinkSync(path.join(dir, f)); console.log(`🗑 Pruned old backup: ${f}`); }
      catch (_) {}
    });
  } catch (err) {
    console.error('Backup pruning error:', err);
  }
}

// Run once 10 min after startup, then every 24h
setTimeout(runDbBackup, 10 * 60 * 1000);
setInterval(runDbBackup, BACKUP_INTERVAL_MS);

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
    <a href="/admin/leads">📬 Leads</a>
    <a href="/admin/integrations">🔗 Integrations</a>
    <a href="/" target="_blank">🌐 Public Site</a>
    <a href="/admin/logout" class="logout" style="color:#ffaaaa">🚪 Logout</a>
  </div>
  <div class="main">${body}</div>
  <script>
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
      const res = await fetch('/api/listings/generate-description', {
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

app.get('/advent-drive-land-hampshire-county-wv', (req, res) => {
  res.send(`
  <!DOCTYPE html>
  <html>
  <head>
    <title>Land for Sale Hampshire County WV | Advent Dr</title>
    <meta name="description" content="Land for sale in Hampshire County WV on Advent Drive. Hunting, recreation, or build opportunity near VA/DC.">

    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "RealEstateListing",
      "name": "Land for Sale – Advent Drive, Hampshire County WV",
      "description": "Land for sale in Hampshire County West Virginia on Advent Drive.",
      "url": "https://malickland.net/advent-drive-land-hampshire-county-wv"
    }
    </script>
  </head>
  <body>
    <h1>Land for Sale – Advent Drive, Hampshire County WV</h1>
    <p>This property offers privacy, usable acreage, and strong long-term value.</p>
    <p><strong>Contact now to walk the property.</strong></p>
    <a href="https://malickland.net">Back to MalickLand</a>
  </body>
  </html>
  `);
});

