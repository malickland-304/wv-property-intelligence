'use strict';

const { doubleCsrf } = require('csrf-csrf');

const { generateToken, doubleCsrfProtection } = doubleCsrf({
  getSecret: () => process.env.SESSION_SECRET,
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
