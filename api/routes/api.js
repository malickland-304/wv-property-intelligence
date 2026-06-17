'use strict';

const express = require('express');
const crypto  = require('crypto');

const { db }              = require('../db');
const { requireApiKey }   = require('../middleware/auth');
const { contactsRateLimit, publicReadRateLimit, generateDescRateLimit, apiWriteRateLimit } = require('../middleware/rate-limits');
const { sendLeadNotification } = require('../services/email');
const { isValidEmail, normalizeAcreage, slugify, VALID_PROP_TYPES, VALID_PROP_STATUSES } = require('../helpers');
const { publicListingsEnabled } = require('../featureFlags');

const router = express.Router();

// ── Health ────────────────────────────────────────────────
router.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date() }));

// ── Client config (analytics IDs — safe to expose) ───────
router.get('/config', (_req, res) => {
  res.json({
    gaId:    process.env.GA_MEASUREMENT_ID  || null,
    pixelId: process.env.META_PIXEL_ID      || null,
    listingsEnabled: publicListingsEnabled(),
  });
});

// ── Counties ──────────────────────────────────────────────
router.get('/counties', publicReadRateLimit, (_req, res) => {
  res.json(db.prepare('SELECT id,name FROM counties ORDER BY name').all());
});

// ── Properties ────────────────────────────────────────────
function sendPropertyList(req, res) {
  if (!publicListingsEnabled()) return res.json({ total: 0, page: 1, properties: [] });
  try {
    const { q='', county='', type='', minPrice='', maxPrice='', page=1, limit=12 } = req.query;
    const conditions = ["p.status = 'active'"];
    const values = [];
    if (q)        { conditions.push(`(p.address LIKE ? OR p.zip LIKE ?)`); values.push(`%${q}%`, `%${q}%`); }
    if (county)   { conditions.push(`p.county_id = ?`);     values.push(Number(county)); }
    if (type)     { conditions.push(`p.property_type = ?`); values.push(type); }
    if (minPrice) { conditions.push(`p.price >= ?`);        values.push(Number(minPrice)); }
    if (maxPrice) { conditions.push(`p.price <= ?`);        values.push(Number(maxPrice)); }
    const where  = 'WHERE ' + conditions.join(' AND ');
    const offset = (Number(page)-1) * Number(limit);
    const total  = db.prepare(`SELECT COUNT(*) as c FROM properties p ${where}`).get(...values).c;
    const properties = db.prepare(`
      SELECT p.id, p.listing_slug, p.address, p.city, p.zip, p.price, p.property_type,
             p.bedrooms, p.bathrooms, p.sqft, p.acreage AS lot_acres,
             p.year_built, p.image_url, p.listed_at, p.status, p.price_reduced,
             c.name AS county
      FROM properties p JOIN counties c ON c.id=p.county_id
      ${where} ORDER BY p.listed_at DESC LIMIT ? OFFSET ?
    `).all(...values, Number(limit), offset);
    res.json({ total, page: Number(page), properties });
  } catch(err) { console.error(err); res.status(500).json({ error: 'Failed' }); }
}

function sendPropertyDetail(req, res) {
  if (!publicListingsEnabled()) return res.status(404).json({ error: 'Not found' });
  const row = db.prepare(`
    SELECT p.id, p.listing_slug, p.address, p.city, p.zip, p.price, p.property_type,
           p.bedrooms, p.bathrooms, p.sqft, p.acreage AS lot_acres,
           p.year_built, p.image_url, p.listed_at, p.status, p.price_reduced,
           p.county_id, c.name AS county,
           p.description, p.property_description, p.marketing_description,
           p.mls_number, p.road_access, p.flood_zone,
           p.listing_agent, p.listing_office,
           p.utilities_available, p.septic, p.well, p.electric, p.internet
    FROM properties p JOIN counties c ON c.id=p.county_id
    WHERE (p.id=? OR p.listing_slug=?) AND p.status='active'
  `).get(req.params.id, req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const description = row.marketing_description || row.property_description || row.description || '';
  res.json({ ...row, description });
}

router.get('/properties',     publicReadRateLimit, sendPropertyList);
router.get('/listings',       publicReadRateLimit, sendPropertyList);
router.get('/properties/:id', publicReadRateLimit, sendPropertyDetail);
router.get('/listings/:id',   publicReadRateLimit, sendPropertyDetail);

// ── Analytics ─────────────────────────────────────────────
router.get('/analytics', publicReadRateLimit, (_req, res) => {
  const row = db.prepare(`
    SELECT
      CAST(ROUND(AVG(price)) AS INTEGER) AS avgPrice,
      COUNT(*) AS totalListings,
      CAST(ROUND(AVG(julianday('now')-julianday(listed_at))) AS INTEGER) AS medianDom,
      CAST(ROUND(AVG(CASE WHEN sqft IS NOT NULL AND sqft > 0 THEN CAST(price AS REAL) / sqft END)) AS INTEGER) AS pricePerSqft
    FROM properties WHERE status='active'
  `).get();
  res.json(row);
});

// ── Contacts ──────────────────────────────────────────────
router.post('/contacts', contactsRateLimit, (req, res) => {
  const { property_id, name, email, phone, message, interest } = req.body;
  const source = String(req.body.source || 'web').trim().slice(0, 80).replace(/[^a-zA-Z0-9_-]/g, '') || 'web';
  const interestText = String(interest || '').trim().slice(0, 120);
  const combinedMessage = interestText
    ? `[Interest: ${interestText}] ${message || ''}`.trim()
    : message;
  if (!name || !email) return res.status(400).json({ error: 'Name and email required' });
  if (!isValidEmail(email)) return res.status(400).json({ error: 'Invalid email address' });

  const result = db.prepare(
    'INSERT INTO contacts (property_id,name,email,phone,message,source) VALUES (?,?,?,?,?,?)'
  ).run(property_id||null, name, email, phone, combinedMessage, source);

  const property = property_id
    ? db.prepare(`SELECT p.id, p.address, p.city, c.name AS county
                  FROM properties p LEFT JOIN counties c ON c.id=p.county_id
                  WHERE p.id=?`).get(property_id)
    : null;
  sendLeadNotification({ name, email, phone, message: combinedMessage, source }, property)
    .then((sent) => {
      if (!sent) {
        console.warn(`[Contacts] Lead #${result.lastInsertRowid} CAPTURED but NOT notified — email provider unconfigured or send failed.`);
      }
    })
    .catch((err) => {
      console.error(`[Contacts] Lead #${result.lastInsertRowid} notification error:`, err && err.message ? err.message : err);
    });

  res.status(201).json({ id: result.lastInsertRowid });
});

router.get('/contacts', apiWriteRateLimit, requireApiKey, (_req, res) => {
  const contacts = db.prepare(`
    SELECT c.id, c.name, c.email, c.phone, c.property_id, c.message, c.source, c.created_at,
           p.address AS property_address
    FROM contacts c
    LEFT JOIN properties p ON p.id = c.property_id
    ORDER BY c.created_at DESC
  `).all();
  res.json(contacts);
});

// ── Properties CRUD (API-key protected) ───────────────────
router.post('/properties', apiWriteRateLimit, requireApiKey, (req, res) => {
  try {
    const f = req.body;
    if (!f.address) return res.status(400).json({ error: 'address is required' });
    if (f.property_type && !VALID_PROP_TYPES.includes(f.property_type))
      return res.status(400).json({ error: 'Invalid property_type' });
    if (f.status && !VALID_PROP_STATUSES.includes(f.status))
      return res.status(400).json({ error: 'Invalid status' });
    const id   = crypto.randomBytes(16).toString('hex');
    const slug = slugify((f.address||'listing') + '-' + (f.city||'wv')) + '-' + id.slice(0,6);
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
      id, f.county_id||1, f.address, f.city||null, f.state||'WV', f.zip||null,
      f.parcel_id||null, f.subdivision||null, f.property_type||'land', f.status||'draft',
      normalizeAcreage(f), f.lot_size||null, f.road_access||null, f.utilities_available||null,
      f.septic?1:0, f.well?1:0, f.electric?1:0, f.internet?1:0,
      f.price||null, f.recommended_list_price||null, f.price_per_acre||null,
      f.tax_assessed||null, f.annual_tax||null,
      f.mls_status||'draft', f.mls_number||null, f.listing_agent||'Phil Malick',
      f.listing_office||'WV Real Estate Agency',
      f.latitude||null, f.longitude||null, f.flood_zone||null, f.school_district||null,
      f.bedrooms||null, f.bathrooms||null, f.sqft||null, f.year_built||null,
      f.property_description||null, f.marketing_description||null,
      f.seller_notes||null, f.internal_notes||null, slug
    );
    res.status(201).json({ id, listing_slug: slug });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to create property' }); }
});

router.put('/properties/:id', apiWriteRateLimit, requireApiKey, (req, res) => {
  try {
    const f = req.body;
    const existing = db.prepare('SELECT id FROM properties WHERE id=?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    if (f.property_type && !VALID_PROP_TYPES.includes(f.property_type))
      return res.status(400).json({ error: 'Invalid property_type' });
    if (f.status && !VALID_PROP_STATUSES.includes(f.status))
      return res.status(400).json({ error: 'Invalid status' });
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
      f.county_id||1, f.address, f.city||null, f.state||'WV', f.zip||null,
      f.parcel_id||null, f.subdivision||null, f.property_type||'land', f.status||'draft',
      normalizeAcreage(f), f.lot_size||null, f.road_access||null, f.utilities_available||null,
      f.septic?1:0, f.well?1:0, f.electric?1:0, f.internet?1:0,
      f.price||null, f.recommended_list_price||null, f.price_per_acre||null,
      f.tax_assessed||null, f.annual_tax||null,
      f.mls_status||'draft', f.mls_number||null, f.listing_agent||null, f.listing_office||null,
      f.latitude||null, f.longitude||null, f.flood_zone||null, f.school_district||null,
      f.bedrooms||null, f.bathrooms||null, f.sqft||null, f.year_built||null,
      f.property_description||null, f.marketing_description||null,
      f.seller_notes||null, f.internal_notes||null,
      req.params.id
    );
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to update property' }); }
});

router.delete('/properties/:id', apiWriteRateLimit, requireApiKey, (req, res) => {
  const existing = db.prepare('SELECT id FROM properties WHERE id=?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM properties WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ── AI description generator ──────────────────────────────
router.post('/properties/generate-description', generateDescRateLimit, (req, res) => {
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

module.exports = router;
