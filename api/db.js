'use strict';

const Database = require('better-sqlite3');
const path     = require('path');
const fs       = require('fs');
const crypto   = require('crypto');

const PROJECT_ROOT = path.join(__dirname, '..');
const DB_PATH = process.env.DATABASE_PATH || path.join(PROJECT_ROOT, 'database', 'wv_property.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('cache_size = -32000');
db.pragma('mmap_size = 67108864');

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
  CREATE TABLE IF NOT EXISTS leads (
    id                TEXT PRIMARY KEY,
    property_id       TEXT REFERENCES properties(id) ON DELETE SET NULL,
    property_slug     TEXT,
    property_address  TEXT,
    name              TEXT NOT NULL,
    email             TEXT,
    phone             TEXT,
    lead_type         TEXT NOT NULL,
    buyer_intent      TEXT,
    financing_type    TEXT,
    timeline          TEXT,
    message           TEXT,
    sms_consent       INTEGER NOT NULL DEFAULT 0,
    source            TEXT DEFAULT 'property-lead',
    utm_source        TEXT,
    utm_medium        TEXT,
    utm_campaign      TEXT,
    status            TEXT NOT NULL DEFAULT 'new',
    follow_up_status  TEXT NOT NULL DEFAULT 'scheduled',
    next_follow_up_at TEXT,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS lead_followups (
    id            TEXT PRIMARY KEY,
    lead_id       TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    step_code     TEXT NOT NULL,
    channel       TEXT NOT NULL,
    template_name TEXT NOT NULL,
    subject       TEXT NOT NULL,
    body          TEXT NOT NULL,
    due_at        TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'pending',
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    sent_at       TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_properties_county ON properties(county_id);
  CREATE INDEX IF NOT EXISTS idx_properties_status ON properties(status);
  CREATE INDEX IF NOT EXISTS idx_properties_type   ON properties(property_type);
  CREATE INDEX IF NOT EXISTS idx_properties_price  ON properties(price);
  CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
  CREATE INDEX IF NOT EXISTS idx_lead_followups_lead_due ON lead_followups(lead_id, due_at);
  CREATE INDEX IF NOT EXISTS idx_lead_followups_due ON lead_followups(status, due_at);
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

// Schema migrations
{
  const cols = db.prepare('PRAGMA table_info(properties)').all().map(r => r.name);
  const add  = (col, def) => {
    if (!cols.includes(col)) {
      try { db.exec(`ALTER TABLE properties ADD COLUMN ${col} ${def}`); } catch (_) {}
    }
  };
  add('property_description', 'TEXT');
  add('description',          'TEXT');
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

// ── Listing seed/migration: 37 Advent Dr ─────────────────
{
  const hampshire = db.prepare("SELECT id FROM counties WHERE name='Hampshire'").get();
  if (hampshire) {
    const existing = db.prepare(
      "SELECT id FROM properties WHERE listing_slug='advent-dr-hampshire-wv' OR mls_number='WVHS2007468'"
    ).get();
    const desc = '37 Advent Dr is a 2.52-acre, multi-lot Hampshire County property in the Elk Horn subdivision with existing structures and details buyers should verify. Includes lots 48, 49, 95, and 96 (parcel 14-09-012B-0096-0000) with a 2004 double wide, deck, foundation/additions, sheds, lean-tos, and carport. Potential fit as a fixer, hunting camp, recreational base, or rural retreat project, subject to buyer due diligence. Out of flood zone at ~1,592 ft elevation. MLS# WVHS2007468 | Listed at $219,900 | Contact Phil Malick (540) 246-1421.';
    const mktg = 'Multi-lot rural property in Hampshire County. 37 Advent Dr offers 2.52 acres across four lots with existing structures already on site. Buyers should review condition, access, utilities, and intended use carefully while considering a fixer setup, hunting camp, weekend base, or rural retreat project. Not in a flood zone. Request details and verify all facts independently.';
    if (existing) {
      db.prepare(`
        UPDATE properties SET
          address='37 Advent Dr', city='Augusta', state='WV', zip='26704',
          county_id=?, listing_slug='advent-dr-hampshire-wv',
          property_type='land', status='active', price=219900,
          acreage=2.52, sqft=1568, bedrooms=3, bathrooms=2,
          mls_number='WVHS2007468', listing_agent='Phil Malick',
          listing_office='WV Real Estate Agency LLC',
          flood_zone='Not in flood zone',
          image_url='/assets/advent-1.jpg',
          property_description=?, marketing_description=?,
          updated_at=datetime('now')
        WHERE id=?
      `).run(hampshire.id, desc, mktg, existing.id);
    } else {
      const newId = crypto.randomBytes(16).toString('hex');
      db.prepare(`
        INSERT INTO properties
          (id,county_id,address,city,state,zip,property_type,status,price,
           acreage,sqft,bedrooms,bathrooms,mls_number,listing_agent,listing_office,
           flood_zone,image_url,listing_slug,property_description,marketing_description)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        newId, hampshire.id, '37 Advent Dr', 'Augusta', 'WV', '26704',
        'land', 'active', 219900,
        2.52, 1568, 3, 2, 'WVHS2007468', 'Phil Malick', 'WV Real Estate Agency LLC',
        'Not in flood zone', '/assets/advent-1.jpg',
        'advent-dr-hampshire-wv', desc, mktg
      );
    }
  }
}

// ── Listing seed/migration: Advent Dr Lot ─────────────────
{
  const hampshire = db.prepare("SELECT id FROM counties WHERE name='Hampshire'").get();
  if (hampshire) {
    const existing = db.prepare(
      "SELECT id FROM properties WHERE listing_slug='advent-dr-lot-hampshire-wv' OR mls_number='WVHS2007442'"
    ).get();
    const desc = 'Advent Dr Lot is a raw land parcel in Hampshire County, WV — a potential fit for a buyer looking for a quiet rural build site, hunting land, or recreational property, subject to due diligence. Located near the Advent Dr corridor in Augusta/Delray, WV. Out of flood zone. MLS# WVHS2007442 | Contact Phil Malick (540) 246-1421.';
    const mktg = 'Raw Hampshire County land with rural appeal. The Advent Dr lot is a straightforward property to review — no structures, no complications. Potential fit for a builder, hunter, or rural land buyer after confirming access, utilities, allowed uses, and all property facts.';
    if (existing) {
      db.prepare(`
        UPDATE properties SET
          address='Advent Dr Lot', city='Augusta', state='WV', zip='26704',
          county_id=?, listing_slug='advent-dr-lot-hampshire-wv',
          property_type='land', status='active',
          mls_number='WVHS2007442', listing_agent='Phil Malick',
          listing_office='WV Real Estate Agency LLC',
          flood_zone='Not in flood zone',
          image_url='/assets/advent-1.jpg',
          property_description=?, marketing_description=?,
          updated_at=datetime('now')
        WHERE id=?
      `).run(hampshire.id, desc, mktg, existing.id);
    } else {
      const newId = crypto.randomBytes(16).toString('hex');
      db.prepare(`
        INSERT INTO properties
          (id,county_id,address,city,state,zip,property_type,status,
           mls_number,listing_agent,listing_office,flood_zone,image_url,
           listing_slug,property_description,marketing_description)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        newId, hampshire.id, 'Advent Dr Lot', 'Augusta', 'WV', '26704',
        'land', 'active',
        'WVHS2007442', 'Phil Malick', 'WV Real Estate Agency LLC',
        'Not in flood zone', '/assets/advent-1.jpg',
        'advent-dr-lot-hampshire-wv', desc, mktg
      );
    }
  }
}

// Daily DB backup (keep last 7)
const BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const BACKUP_KEEP = 7;

function runDbBackup() {
  try {
    const backupPath = DB_PATH.replace(/\.db$/, `_backup_${new Date().toISOString().slice(0,10)}.db`);
    const dbLive = new Database(DB_PATH);
    dbLive.backup(backupPath)
      .then(() => { console.log(`✅ DB backup → ${backupPath}`); dbLive.close(); pruneOldBackups(); })
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
      .sort();
    const toDelete = backups.slice(0, Math.max(0, backups.length - BACKUP_KEEP));
    toDelete.forEach(f => {
      try { fs.unlinkSync(path.join(dir, f)); } catch (_) {}
    });
  } catch (err) {
    console.error('Backup pruning error:', err);
  }
}

setTimeout(runDbBackup, 10 * 60 * 1000);
setInterval(runDbBackup, BACKUP_INTERVAL_MS);

module.exports = { db, DB_PATH };
