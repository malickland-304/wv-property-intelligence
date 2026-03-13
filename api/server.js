// server.js - WV Property Intelligence API
// Node.js + Express + PostgreSQL

'use strict';

const express    = require('express');
const { Pool }   = require('pg');
const cors       = require('cors');
const helmet     = require('helmet');
const morgan     = require('morgan');
require('dotenv').config();

const app  = express();
const PORT = process.env.PORT || 3000;

// ── DB Pool ──────────────────────────────────────────────
const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     process.env.DB_PORT     || 5432,
  database: process.env.DB_NAME     || 'wv_property',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || '',
  max:      10,
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => console.error('DB pool error:', err));

// ── Middleware ────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(morgan('combined'));
app.use(express.json());
app.use(express.static('../app'));

// ── Helper ─────────────────────────────────────────────────
const db = (text, params) => pool.query(text, params);

// ── Routes ─────────────────────────────────────────────────

// GET /api/health
app.get('/api/health', (_req, res) => res.json({ status: 'ok', ts: new Date() }));

// GET /api/counties
app.get('/api/counties', async (_req, res) => {
  try {
    const { rows } = await db('SELECT id, name FROM counties ORDER BY name');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load counties' });
  }
});

// GET /api/properties
// Query params: q, county, type, minPrice, maxPrice, page, limit
app.get('/api/properties', async (req, res) => {
  try {
    const {
      q        = '',
      county   = '',
      type     = '',
      minPrice = null,
      maxPrice = null,
      page     = 1,
      limit    = 12,
    } = req.query;

    const values = [];
    const conditions = ['p.status = $' + (values.push('active'))];

    if (q) {
      conditions.push(
        `(p.address ILIKE $${values.push('%' + q + '%')} OR p.zip ILIKE $${values.push('%' + q + '%')})`
      );
    }
    if (county)   conditions.push(`p.county_id = $${values.push(county)}`);
    if (type)     conditions.push(`p.property_type = $${values.push(type)}`);
    if (minPrice) conditions.push(`p.price >= $${values.push(Number(minPrice))}`);
    if (maxPrice) conditions.push(`p.price <= $${values.push(Number(maxPrice))}`);

    const where  = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const offset = (Number(page) - 1) * Number(limit);

    const countQ = `SELECT COUNT(*) FROM properties p ${where}`;
    const dataQ  = `
      SELECT p.id, p.address, p.zip, p.price, p.property_type,
             p.bedrooms, p.bathrooms, p.sqft, p.image_url,
             c.name AS county
      FROM   properties p
      JOIN   counties   c ON c.id = p.county_id
      ${where}
      ORDER BY p.listed_at DESC
      LIMIT  $${values.push(Number(limit))}
      OFFSET $${values.push(offset)}
    `;

    const [countRes, dataRes] = await Promise.all([
      db(countQ, values.slice(0, values.length - 2)),
      db(dataQ, values),
    ]);

    res.json({
      total:      parseInt(countRes.rows[0].count, 10),
      page:       Number(page),
      properties: dataRes.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load properties' });
  }
});

// GET /api/properties/:id
app.get('/api/properties/:id', async (req, res) => {
  try {
    const { rows } = await db(
      `SELECT p.*, c.name AS county
       FROM   properties p
       JOIN   counties   c ON c.id = p.county_id
       WHERE  p.id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load property' });
  }
});

// GET /api/analytics
app.get('/api/analytics', async (_req, res) => {
  try {
    const { rows } = await db(`
      SELECT
        ROUND(AVG(price))::int                          AS "avgPrice",
        COUNT(*)::int                                   AS "totalListings",
        PERCENTILE_CONT(0.5) WITHIN GROUP
          (ORDER BY EXTRACT(DAY FROM NOW() - listed_at))::int AS "medianDom",
        ROUND(AVG(price / NULLIF(sqft, 0)))::int        AS "pricePerSqft"
      FROM properties
      WHERE status = 'active'
    `);
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load analytics' });
  }
});

// POST /api/properties  (admin / internal use)
app.post('/api/properties', async (req, res) => {
  const { address, zip, county_id, price, property_type,
          bedrooms, bathrooms, sqft, description, image_url } = req.body;
  try {
    const { rows } = await db(
      `INSERT INTO properties
         (address, zip, county_id, price, property_type,
          bedrooms, bathrooms, sqft, description, image_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [address, zip, county_id, price, property_type,
       bedrooms, bathrooms, sqft, description, image_url]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create property' });
  }
});

// PUT /api/properties/:id
app.put('/api/properties/:id', async (req, res) => {
  const { price, status, description, image_url } = req.body;
  try {
    const { rows } = await db(
      `UPDATE properties
       SET price=$1, status=$2, description=$3, image_url=$4, updated_at=NOW()
       WHERE id=$5 RETURNING *`,
      [price, status, description, image_url, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update property' });
  }
});

// ── 404 ──────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Route not found' }));

// ── Error handler ─────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start ─────────────────────────────────────────────────
app.listen(PORT, () => console.log(`WV Property API running on port ${PORT}`));

module.exports = app;
