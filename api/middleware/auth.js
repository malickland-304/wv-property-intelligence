'use strict';

const crypto = require('crypto');

// Constant-time string comparison. Hashing both sides first gives equal-length
// buffers, so timingSafeEqual never throws and the length of the secret is not
// leaked through timing either.
function safeEqual(provided, expected) {
  if (typeof provided !== 'string' || typeof expected !== 'string') return false;
  const a = crypto.createHash('sha256').update(provided).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

// ── API key auth (REST endpoints) ─────────────────────────
const API_KEY = process.env.API_KEY;

function requireApiKey(req, res, next) {
  if (req.path === '/health') return next();
  if (!API_KEY) {
    if (process.env.NODE_ENV === 'production')
      return res.status(500).json({ error: 'API_KEY not configured' });
    return next();
  }
  const header = req.headers['authorization'] || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token || !safeEqual(token, API_KEY))
    return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// ── Session auth (admin panel) ────────────────────────────
function requireAuth(req, res, next) {
  if (req.session && req.session.admin) return next();
  res.redirect('/admin/login');
}

function csrfToken(req) {
  if (typeof req.csrfToken === 'function') return req.csrfToken();
  if (!req.session.csrfToken)
    req.session.csrfToken = crypto.randomBytes(16).toString('hex');
  return req.session.csrfToken;
}

function requireCsrf(req, res, next) {
  if (typeof req.csrfToken === 'function') return next();
  const token = req.body._csrf || req.headers['x-csrf-token'];
  if (!token || token !== req.session.csrfToken)
    return res.status(403).send('Invalid CSRF token');
  next();
}

module.exports = { safeEqual, requireApiKey, requireAuth, csrfToken, requireCsrf };
