'use strict';

require('dotenv').config();

const express  = require('express');
const cors     = require('cors');
const helmet   = require('helmet');
const morgan   = require('morgan');
const session      = require('express-session');
const cookieParser = require('cookie-parser');
const path         = require('path');

const BetterSqlite3Store = require('better-sqlite3-session-store')(session);
const { db }             = require('./db');

const app  = express();
const PORT = process.env.PORT || 3000;
const PROJECT_ROOT = path.join(__dirname, '..');
const SESSION_SECRET = process.env.SESSION_SECRET;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

if (!SESSION_SECRET) throw new Error('SESSION_SECRET is required');
if (!ADMIN_PASSWORD) throw new Error('ADMIN_PASSWORD is required');
if (allowedOrigins.length === 0) console.warn('[WARN] CORS_ORIGIN is empty; only same-origin and no-origin requests are allowed');

const { generateToken, doubleCsrfProtection } = require('./middleware/csrf');
const adminRoutes  = require('./routes/admin');
const apiRoutes    = require('./routes/api');
const publicRoutes = require('./routes/public');

app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'", "'unsafe-inline'"],
      styleSrc:   ["'self'", "'unsafe-inline'"],
      imgSrc:     ["'self'", "data:", "https://placehold.co"],
      connectSrc: ["'self'"],
      fontSrc:    ["'self'"],
      objectSrc:  ["'none'"],
      frameSrc:   ["'none'"],
    },
  },
}));
app.use(cors((req, callback) => {
  const origin = req.get('origin');
  if (!origin) return callback(null, { origin: false, credentials: true });

  const sameOrigin = `${req.protocol}://${req.get('host')}` === origin;
  if (sameOrigin || allowedOrigins.includes(origin)) {
    return callback(null, { origin: true, credentials: true });
  }
  return callback(new Error('CORS origin not allowed'));
}));

app.use((req, res, next) => {
  if ((req.hostname || '').startsWith('www.'))
    return res.redirect(301, 'https://malickland.net/');
  next();
});

app.use(morgan(process.env.NODE_ENV === 'production' ? 'tiny' : 'dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const adminSession = session({
  store: new BetterSqlite3Store({ client: db }),
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge:   8 * 60 * 60 * 1000,
    sameSite: 'lax',
    secure:   process.env.NODE_ENV === 'production',
  },
});
app.use('/images', express.static(path.join(PROJECT_ROOT, 'listings')));

// CSRF: doubleCsrfProtection (csrf-csrf) guards all non-login admin routes.
// cookieParser scoped here only — not applied globally.
app.use('/admin', cookieParser(), adminSession, (req, res, next) => {
  req.csrfToken = () => generateToken(req, res);
  next();
}, (req, res, next) => {
  if (req.path === '/login') return next();
  return doubleCsrfProtection(req, res, next);
}, adminRoutes);
app.use('/api',   apiRoutes);
app.use('/',      publicRoutes);

app.use(express.static(path.join(PROJECT_ROOT, 'app')));

app.use((req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not found' });
  return res.status(404).type('html').send(
    `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Not found</title></head>
    <body style="font-family:system-ui;background:#0f1411;color:#e8e4dc;text-align:center;padding:3rem">
    <h1>Page not found</h1><p><a href="/" style="color:#c9a84c">Return home</a></p></body></html>`
  );
});

app.use((err, _req, res, _next) => {
  if (err && err.code === 'EBADCSRFTOKEN') {
    return res.status(403).type('text').send('Invalid CSRF token');
  }
  if (err && err.message === 'CORS origin not allowed') {
    return res.status(403).json({ error: 'CORS origin denied' });
  }
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

app.listen(PORT, () =>
  console.log(`✅ WV Property API → http://localhost:${PORT}\n   Admin Panel  → http://localhost:${PORT}/admin`)
);

module.exports = app;
