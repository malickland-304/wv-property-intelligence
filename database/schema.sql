-- =============================================================
-- schema.sql  -  WV Property Intelligence
-- PostgreSQL 15+
-- =============================================================

-- Enable useful extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";   -- fast ILIKE searches

-- =============================================================
-- COUNTIES
-- =============================================================
CREATE TABLE IF NOT EXISTS counties (
  id         SERIAL        PRIMARY KEY,
  name       VARCHAR(100)  NOT NULL UNIQUE,
  fips_code  CHAR(5),
  created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Seed all 55 WV counties
INSERT INTO counties (name, fips_code) VALUES
  ('Barbour',    '54001'), ('Berkeley',   '54003'), ('Boone',      '54005'),
  ('Braxton',    '54007'), ('Brooke',     '54009'), ('Cabell',     '54011'),
  ('Calhoun',    '54013'), ('Clay',       '54015'), ('Doddridge',  '54017'),
  ('Fayette',    '54019'), ('Gilmer',     '54021'), ('Grant',      '54023'),
  ('Greenbrier', '54025'), ('Hampshire',  '54027'), ('Hancock',    '54029'),
  ('Hardy',      '54031'), ('Harrison',   '54033'), ('Jackson',    '54035'),
  ('Jefferson',  '54037'), ('Kanawha',    '54039'), ('Lewis',      '54041'),
  ('Lincoln',    '54043'), ('Logan',      '54045'), ('McDowell',   '54047'),
  ('Marion',     '54049'), ('Marshall',   '54051'), ('Mason',      '54053'),
  ('Mercer',     '54055'), ('Mineral',    '54057'), ('Mingo',      '54059'),
  ('Monongalia', '54061'), ('Monroe',     '54063'), ('Morgan',     '54065'),
  ('Nicholas',   '54067'), ('Ohio',       '54069'), ('Pendleton',  '54071'),
  ('Pleasants',  '54073'), ('Pocahontas', '54075'), ('Preston',    '54077'),
  ('Putnam',     '54079'), ('Raleigh',    '54081'), ('Randolph',   '54083'),
  ('Ritchie',    '54085'), ('Roane',      '54087'), ('Summers',    '54089'),
  ('Taylor',     '54091'), ('Tucker',     '54093'), ('Tyler',      '54095'),
  ('Upshur',     '54097'), ('Wayne',      '54099'), ('Webster',    '54101'),
  ('Wetzel',     '54103'), ('Wirt',       '54105'), ('Wood',       '54107'),
  ('Wyoming',    '54109')
ON CONFLICT (name) DO NOTHING;

-- =============================================================
-- USERS  (agents / admins)
-- =============================================================
CREATE TABLE IF NOT EXISTS users (
  id            UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         VARCHAR(255)  NOT NULL UNIQUE,
  password_hash TEXT          NOT NULL,
  full_name     VARCHAR(150),
  role          VARCHAR(20)   NOT NULL DEFAULT 'agent'
                              CHECK (role IN ('admin','agent','viewer')),
  is_active     BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- =============================================================
-- PROPERTIES
-- =============================================================
CREATE TABLE IF NOT EXISTS properties (
  id             UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  county_id      INT           NOT NULL REFERENCES counties(id) ON DELETE RESTRICT,
  listed_by      UUID          REFERENCES users(id) ON DELETE SET NULL,

  -- Address
  address        VARCHAR(255)  NOT NULL,
  city           VARCHAR(100),
  zip            VARCHAR(10),
  latitude       NUMERIC(9,6),
  longitude      NUMERIC(9,6),

  -- Classification
  property_type  VARCHAR(30)   NOT NULL DEFAULT 'residential'
                               CHECK (property_type IN
                                 ('residential','commercial','land','multi-family','industrial')),
  status         VARCHAR(20)   NOT NULL DEFAULT 'active'
                               CHECK (status IN ('active','pending','sold','withdrawn')),

  -- Financials
  price          NUMERIC(14,2) NOT NULL CHECK (price >= 0),
  price_reduced  BOOLEAN       NOT NULL DEFAULT FALSE,
  tax_assessed   NUMERIC(14,2),
  hoa_fee        NUMERIC(10,2),

  -- Details
  bedrooms       SMALLINT      CHECK (bedrooms >= 0),
  bathrooms      NUMERIC(3,1)  CHECK (bathrooms >= 0),
  sqft           INT           CHECK (sqft >= 0),
  lot_acres      NUMERIC(10,4),
  year_built     SMALLINT,
  garage_spaces  SMALLINT,

  -- Content
  description    TEXT,
  image_url      TEXT,

  -- Timestamps
  listed_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  sold_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_properties_county   ON properties(county_id);
CREATE INDEX IF NOT EXISTS idx_properties_status   ON properties(status);
CREATE INDEX IF NOT EXISTS idx_properties_type     ON properties(property_type);
CREATE INDEX IF NOT EXISTS idx_properties_price    ON properties(price);
CREATE INDEX IF NOT EXISTS idx_properties_listed   ON properties(listed_at DESC);
CREATE INDEX IF NOT EXISTS idx_properties_address  ON properties USING gin(address gin_trgm_ops);

-- =============================================================
-- PROPERTY IMAGES  (multiple images per listing)
-- =============================================================
CREATE TABLE IF NOT EXISTS property_images (
  id            SERIAL        PRIMARY KEY,
  property_id   UUID          NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  url           TEXT          NOT NULL,
  caption       VARCHAR(255),
  sort_order    SMALLINT      NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_images_property ON property_images(property_id);

-- =============================================================
-- MARKET SNAPSHOTS  (daily aggregates for analytics)
-- =============================================================
CREATE TABLE IF NOT EXISTS market_snapshots (
  id               SERIAL        PRIMARY KEY,
  snapshot_date    DATE          NOT NULL UNIQUE,
  county_id        INT           REFERENCES counties(id),
  property_type    VARCHAR(30),
  active_count     INT,
  avg_price        NUMERIC(14,2),
  median_price     NUMERIC(14,2),
  avg_price_sqft   NUMERIC(10,2),
  avg_days_market  NUMERIC(6,1),
  sold_count       INT,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- =============================================================
-- SAVED SEARCHES  (user-defined alerts)
-- =============================================================
CREATE TABLE IF NOT EXISTS saved_searches (
  id            SERIAL        PRIMARY KEY,
  user_id       UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label         VARCHAR(150),
  county_id     INT           REFERENCES counties(id),
  property_type VARCHAR(30),
  min_price     NUMERIC(14,2),
  max_price     NUMERIC(14,2),
  min_beds      SMALLINT,
  max_sqft      INT,
  alert_email   BOOLEAN       NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- =============================================================
-- CONTACTS / LEADS
-- =============================================================
CREATE TABLE IF NOT EXISTS contacts (
  id            SERIAL        PRIMARY KEY,
  property_id   UUID          REFERENCES properties(id) ON DELETE SET NULL,
  name          VARCHAR(150)  NOT NULL,
  email         VARCHAR(255)  NOT NULL,
  phone         VARCHAR(30),
  message       TEXT,
  source        VARCHAR(50)   DEFAULT 'web',
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contacts_property ON contacts(property_id);

-- =============================================================
-- FUNCTION: auto-update updated_at
-- =============================================================
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER set_timestamp_properties
  BEFORE UPDATE ON properties
  FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

CREATE OR REPLACE TRIGGER set_timestamp_users
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

-- =============================================================
-- VIEWS
-- =============================================================

-- Active listings with county name (used by API)
CREATE OR REPLACE VIEW v_active_listings AS
SELECT
  p.id, p.address, p.city, p.zip,
  c.name AS county,
  p.property_type, p.price,
  p.bedrooms, p.bathrooms, p.sqft, p.lot_acres,
  p.year_built, p.image_url, p.listed_at
FROM properties p
JOIN counties   c ON c.id = p.county_id
WHERE p.status = 'active';

-- Market summary by county
CREATE OR REPLACE VIEW v_market_summary AS
SELECT
  c.name                              AS county,
  p.property_type,
  COUNT(*)                            AS listings,
  ROUND(AVG(p.price))::BIGINT         AS avg_price,
  ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY p.price))::BIGINT AS median_price,
  ROUND(AVG(p.price / NULLIF(p.sqft,0)))::INT AS avg_price_sqft,
  ROUND(AVG(EXTRACT(DAY FROM NOW() - p.listed_at)))::INT AS avg_days_on_market
FROM properties p
JOIN counties   c ON c.id = p.county_id
WHERE p.status = 'active'
GROUP BY c.name, p.property_type
ORDER BY c.name, p.property_type;
