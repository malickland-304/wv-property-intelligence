'use strict';

const crypto = require('crypto');

// Constant-time string comparison for secrets (admin password, API key).
// timingSafeEqual needs equal-length buffers; on a length mismatch we still run
// one comparison so the reject path costs about the same. Only the length of the
// secret can be inferred from timing, which is the standard trade-off.
function safeEqual(provided, expected) {
  if (typeof provided !== 'string' || typeof expected !== 'string') return false;
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) {
    crypto.timingSafeEqual(b, b);
    return false;
  }
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
  // (overwrite=false, validateOnReuse=false): a csrf_token cookie left from an
  // earlier session (re-login, or logout then login) is replaced with a fresh
  // token for the current session instead of throwing 403. POST validation in
  // doubleCsrfProtection is unchanged. Note doubleCsrfProtection re-defines
  // req.csrfToken on every admin request, so the arguments must be passed here.
  if (typeof req.csrfToken === 'function') return req.csrfToken(false, false);
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
