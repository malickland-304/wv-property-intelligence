'use strict';

const { doubleCsrf } = require('csrf-csrf');

const { generateToken, doubleCsrfProtection } = doubleCsrf({
  getSecret: () => process.env.SESSION_SECRET || 'wvrea-secret-2026',
  cookieName: 'csrf_token',
  cookieOptions: {
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    path: '/admin',
  },
  size: 64,
  getTokenFromRequest: (req) => req.body._csrf || req.headers['x-csrf-token'],
});

module.exports = { generateToken, doubleCsrfProtection };
