'use strict';

const { doubleCsrf } = require('csrf-csrf');

const { generateToken, doubleCsrfProtection } = doubleCsrf({
  getSecret: () => {
    if (!process.env.SESSION_SECRET) {
      if (process.env.NODE_ENV === 'production')
        throw new Error('[csrf] SESSION_SECRET must be set in production');
      return 'wvrea-secret-2026';
    }
    return process.env.SESSION_SECRET;
  },
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
