-- =============================================================
-- schema.sql — WV Property Intelligence (SQLite)
-- Runtime: better-sqlite3  |  Managed by: api/db.js
--
-- This file is the canonical reference. The live schema is
-- created and migrated automatically when the server starts.
-- Do not run this file directly against the database.
-- =============================================================

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
  property_description  TEXT,
  marketing_description TEXT,
  seller_notes          TEXT,
  internal_notes        TEXT,
  image_url             TEXT,
  due_diligence_complete INTEGER DEFAULT 0,
  photos_uploaded        INTEGER DEFAULT 0,
  comps_complete         INTEGER DEFAULT 0,
  listing_slug  TEXT UNIQUE,
  ai_content    TEXT,
  ai_generated_at TEXT,
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

CREATE TABLE IF NOT EXISTS documents (
  id                 TEXT PRIMARY KEY,
  property_id        TEXT REFERENCES properties(id) ON DELETE SET NULL,
  title              TEXT NOT NULL,
  document_type      TEXT NOT NULL,
  source_provider    TEXT NOT NULL DEFAULT 'manual',
  source_uri         TEXT,
  source_external_id TEXT,
  status             TEXT NOT NULL DEFAULT 'draft',
  current_version_id TEXT REFERENCES document_versions(id) ON DELETE SET NULL,
  created_by         TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS document_versions (
  id                  TEXT PRIMARY KEY,
  document_id         TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version_number      INTEGER NOT NULL,
  file_name           TEXT NOT NULL,
  mime_type           TEXT,
  file_size_bytes     INTEGER,
  sha256              TEXT,
  storage_uri         TEXT NOT NULL,
  storage_external_id TEXT,
  ocr_text            TEXT,
  ocr_status          TEXT NOT NULL DEFAULT 'not_started',
  approval_status     TEXT NOT NULL DEFAULT 'pending_review',
  approved_by         TEXT,
  approved_at         TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(document_id, version_number)
);

CREATE TABLE IF NOT EXISTS extracted_claims (
  id                   TEXT PRIMARY KEY,
  document_id          TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  document_version_id  TEXT NOT NULL REFERENCES document_versions(id) ON DELETE CASCADE,
  property_id          TEXT REFERENCES properties(id) ON DELETE SET NULL,
  claim_type           TEXT NOT NULL,
  claim_value_json     TEXT NOT NULL,
  source_quote         TEXT,
  source_location_json TEXT,
  confidence           REAL,
  status               TEXT NOT NULL DEFAULT 'pending_review',
  reviewed_by          TEXT,
  reviewed_at          TEXT,
  review_note          TEXT,
  created_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS integration_events (
  id                  TEXT PRIMARY KEY,
  provider            TEXT NOT NULL,
  event_type          TEXT NOT NULL,
  document_id         TEXT REFERENCES documents(id) ON DELETE SET NULL,
  document_version_id TEXT REFERENCES document_versions(id) ON DELETE SET NULL,
  external_id         TEXT,
  status              TEXT NOT NULL DEFAULT 'recorded',
  payload_json        TEXT,
  error_message       TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_events (
  id          TEXT PRIMARY KEY,
  actor       TEXT NOT NULL,
  action      TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  before_json TEXT,
  after_json  TEXT,
  reason      TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  sid    TEXT NOT NULL PRIMARY KEY,
  sess   JSON NOT NULL,
  expire TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_properties_county ON properties(county_id);
CREATE INDEX IF NOT EXISTS idx_properties_status ON properties(status);
CREATE INDEX IF NOT EXISTS idx_properties_type   ON properties(property_type);
CREATE INDEX IF NOT EXISTS idx_properties_price  ON properties(price);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_lead_followups_lead_due ON lead_followups(lead_id, due_at);
CREATE INDEX IF NOT EXISTS idx_lead_followups_due ON lead_followups(status, due_at);
CREATE INDEX IF NOT EXISTS idx_documents_property_id ON documents(property_id);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(document_type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_source_external_id
  ON documents(source_provider, source_external_id)
  WHERE source_external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_document_versions_document_id ON document_versions(document_id);
CREATE INDEX IF NOT EXISTS idx_document_versions_approval_status ON document_versions(approval_status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_document_versions_sha256
  ON document_versions(sha256)
  WHERE sha256 IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_extracted_claims_document_id ON extracted_claims(document_id);
CREATE INDEX IF NOT EXISTS idx_extracted_claims_property_id ON extracted_claims(property_id);
CREATE INDEX IF NOT EXISTS idx_extracted_claims_status ON extracted_claims(status);
CREATE INDEX IF NOT EXISTS idx_extracted_claims_type ON extracted_claims(claim_type);
CREATE INDEX IF NOT EXISTS idx_integration_events_provider_type ON integration_events(provider, event_type);
CREATE INDEX IF NOT EXISTS idx_integration_events_document_id ON integration_events(document_id);
CREATE INDEX IF NOT EXISTS idx_integration_events_external_id ON integration_events(external_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_entity ON audit_events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_actor ON audit_events(actor);
CREATE INDEX IF NOT EXISTS idx_audit_events_created_at ON audit_events(created_at);
