'use strict';

/**
 * middleware/auth.js — API key authentication middleware.
 *
 * Required env var:
 *   API_KEY  – Secret key clients must send as: Authorization: Bearer <API_KEY>
 *
 * Skips auth for:
 *   - GET requests (public read)
 *   - /api/health (health checks)
 */

const API_KEY = process.env.API_KEY;

function requireApiKey(req, res, next) {
  // Public: all GETs and health endpoint
  if (req.method === 'GET' || req.path === '/api/health') return next();

  if (!API_KEY) {
    // No key configured — open in dev, warn in prod
    if (process.env.NODE_ENV === 'production') {
      return res.status(500).json({ error: 'API_KEY not configured' });
    }
    return next();
  }

  const header = req.headers['authorization'] || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token || token !== API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
}

module.exports = { requireApiKey };
