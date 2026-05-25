'use strict';

const { doubleCsrf } = require('csrf-csrf');

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
  if (!token || token !== API_KEY)
    return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// ── CSRF (double-submit cookie, admin panel only) ─────────
const {
  invalidCsrfTokenError,
  generateToken,
  doubleCsrfProtection,
} = doubleCsrf({
  getSecret:           () => process.env.SESSION_SECRET || 'wvrea-secret-2026',
  cookieName:          'csrf',
  cookieOptions: {
    sameSite: 'lax',
    secure:   process.env.NODE_ENV === 'production',
    httpOnly: true,
    path:     '/admin',
  },
  getTokenFromRequest: (req) => req.headers['x-csrf-token'] || req.body?._csrf,
  size: 64,
});

// ── Session auth (admin panel) ────────────────────────────
function requireAuth(req, res, next) {
  if (req.session && req.session.admin) return next();
  res.redirect('/admin/login');
}

function csrfToken(req, res) {
  return generateToken(req, res);
}

// doubleCsrfProtection at the router level validates all mutating requests;
// this is kept so route definitions don't need to change.
function requireCsrf(_req, _res, next) {
  next();
}

module.exports = { requireApiKey, requireAuth, csrfToken, requireCsrf, doubleCsrfProtection, invalidCsrfTokenError };
