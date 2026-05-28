'use strict';

const { doubleCsrf } = require('csrf-csrf');
const SESSION_SECRET = process.env.SESSION_SECRET;

if (!SESSION_SECRET) {
  throw new Error('[csrf] SESSION_SECRET must be set');
}

const { generateToken, doubleCsrfProtection } = doubleCsrf({
  getSecret: () => SESSION_SECRET,
  cookieName: 'csrf_token',
  cookieOptions: {
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    path: '/admin',
  },
  size: 64,
  getSessionIdentifier: (req) => req.sessionID,
  getTokenFromRequest: (req) => (req.body && req.body._csrf) || req.headers['x-csrf-token'],
});

module.exports = { generateToken, doubleCsrfProtection };
