'use strict';

require('dotenv').config();

const express  = require('express');
const cors     = require('cors');
const helmet   = require('helmet');
const morgan   = require('morgan');
const compression  = require('compression');
const session      = require('express-session');
const cookieParser = require('cookie-parser');
const path         = require('path');
const { generateToken, doubleCsrfProtection } = require('./middleware/csrf');

const BetterSqlite3Store = require('better-sqlite3-session-store')(session);
const { db }             = require('./db');
const adminRoutes  = require('./routes/admin');
const apiRoutes    = require('./routes/api');
const createLeadsRouter = require('./routes/leads');
const createChatRouter = require('./routes/chat');
const publicRoutes = require('./routes/public');
const { LISTINGS_ROOT } = require('./helpers');

const app  = express();
const PORT = process.env.PORT || 3000;
const PROJECT_ROOT = path.join(__dirname, '..');
const SESSION_SECRET = process.env.SESSION_SECRET;
const corsAllowlist = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.set('trust proxy', 1);

if (!SESSION_SECRET) {
  throw new Error('SESSION_SECRET must be set');
}
if (!process.env.ADMIN_PASSWORD) {
  throw new Error('ADMIN_PASSWORD must be set');
}

function expectedLeadOrigins(req) {
  const origins = new Set([`${req.protocol}://${req.get('host')}`]);

  for (const origin of [process.env.SITE_URL, ...corsAllowlist]) {
    if (!origin) continue;
    try {
      origins.add(new URL(origin).origin);
    } catch (_) {}
  }

  return origins;
}

function requireLeadSameOrigin(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next();
  }

  const header = req.get('origin') || req.get('referer');
  if (!header) {
    return res.status(403).json({ error: 'Lead request origin is required.' });
  }

  let origin;
  try {
    origin = new URL(header).origin;
  } catch (_) {
    return res.status(403).json({ error: 'Invalid lead request origin.' });
  }

  if (!expectedLeadOrigins(req).has(origin)) {
    return res.status(403).json({ error: 'Lead request origin is not allowed.' });
  }

  return next();
}

function requireLeadJson(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next();
  }
  if (!req.is('application/json')) {
    return res.status(415).json({ error: 'Lead requests must use application/json.' });
  }
  return next();
}

const gmailConfigured =
  Boolean(process.env.GOOGLE_GMAIL_USER) &&
  Boolean(process.env.GOOGLE_CLIENT_ID) &&
  Boolean(process.env.GOOGLE_CLIENT_SECRET) &&
  Boolean(process.env.GOOGLE_REFRESH_TOKEN);
const resendConfigured = Boolean(process.env.RESEND_API_KEY);
console.log(`[Startup] Gmail configured: ${gmailConfigured}`);
console.log(`[Startup] Resend configured: ${resendConfigured}`);
if (!gmailConfigured && !resendConfigured) {
  console.warn("[WARN] No outbound notification provider configured");
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

// Compress all responses (gzip) — shrinks the ~71KB homepage to ~12-15KB on the wire.
app.use(compression());

app.use(cors((req, cb) => {
  const origin = req.headers.origin;
  if (!origin) {
    return cb(null, { origin: true });
  }
  const allowlisted = corsAllowlist.includes(origin);
  return cb(null, { origin: allowlisted });
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
// Static assets cache for a week; HTML stays no-cache so content edits land immediately.
const staticAssetCache = {
  maxAge: '7d',
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
  },
};
app.use('/images', express.static(LISTINGS_ROOT, staticAssetCache));

// CSRF: doubleCsrfProtection (csrf-csrf) guards all non-login admin routes.
// cookieParser scoped here only — not applied globally.
app.use('/admin', cookieParser(), adminSession, (req, res, next) => {
  req.csrfToken = () => generateToken(req, res);
  next();
}, (req, res, next) => {
  if (req.path === '/login') return next();
  return doubleCsrfProtection(req, res, next);
}, adminRoutes);
app.use('/api/contacts', requireLeadJson, requireLeadSameOrigin);
app.use('/api/leads', requireLeadJson, requireLeadSameOrigin, createLeadsRouter({ db }));
app.use('/api/chat', requireLeadJson, requireLeadSameOrigin, createChatRouter());
app.use('/api',   apiRoutes);
app.use('/',      publicRoutes);

app.use(express.static(path.join(PROJECT_ROOT, 'app'), { extensions: ['html'], ...staticAssetCache }));

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
