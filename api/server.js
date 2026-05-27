'use strict';

require('dotenv').config();

const express  = require('express');
const cors     = require('cors');
const helmet   = require('helmet');
const morgan   = require('morgan');
const session      = require('express-session');
const cookieParser = require('cookie-parser');
const path         = require('path');
const { generateToken, doubleCsrfProtection } = require('./middleware/csrf');

const BetterSqlite3Store = require('better-sqlite3-session-store')(session);
const { db }             = require('./db');
const adminRoutes  = require('./routes/admin');
const apiRoutes    = require('./routes/api');
const publicRoutes = require('./routes/public');

const app  = express();
const PORT = process.env.PORT || 3000;
const PROJECT_ROOT = path.join(__dirname, '..');

app.set('trust proxy', 1);

if (process.env.NODE_ENV === 'production') {
  if (!process.env.ADMIN_PASSWORD) console.warn('[WARN] ADMIN_PASSWORD not set — using insecure default');
  if (!process.env.SESSION_SECRET)  console.warn('[WARN] SESSION_SECRET not set — using insecure default');
}

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
app.use(cors());

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
  secret: process.env.SESSION_SECRET || 'wvrea-secret-2026',
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
  // lgtm [js/missing-token-validation]
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
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

app.listen(PORT, () =>
  console.log(`✅ WV Property API → http://localhost:${PORT}\n   Admin Panel  → http://localhost:${PORT}/admin`)
);

module.exports = app;
