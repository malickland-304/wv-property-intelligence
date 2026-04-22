'use strict';

const path = require('path');
const fs   = require('fs');

const PROJECT_ROOT = path.join(__dirname, '..');

const VALID_PROP_TYPES   = ['residential','commercial','land','multi-family','industrial'];
const VALID_PROP_STATUSES = ['active','pending','sold','withdrawn','draft'];

const SAFE_PATH_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]*(\.[a-zA-Z0-9]+)?$/;
function isSafePathComponent(str) {
  return typeof str === 'string' && SAFE_PATH_RE.test(str) && !str.includes('..');
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function initListingFolder(slug) {
  const base = path.join(PROJECT_ROOT, 'listings', slug);
  ['photos/raw','photos/compressed','photos/mls'].forEach(p =>
    fs.mkdirSync(path.join(base, p), { recursive: true })
  );
  const jsonPath = path.join(base, 'listing.json');
  if (!fs.existsSync(jsonPath)) fs.writeFileSync(jsonPath, '{}');
  const compsPath = path.join(base, 'comps.csv');
  if (!fs.existsSync(compsPath))
    fs.writeFileSync(compsPath, 'address,price,acreage,price_per_acre,days_on_market,notes\n');
  const ddPath = path.join(base, 'due_diligence.md');
  if (!fs.existsSync(ddPath))
    fs.writeFileSync(ddPath, `# Due Diligence - ${slug}\n\n## Flood Zone\n\n## Utilities\n\n## Access\n\n## Zoning\n\n## Restrictions\n\n## Environmental Notes\n`);
  return base;
}

function normalizeAcreage(body) {
  const raw = body.acreage ?? body.lot_acres ?? null;
  if (raw == null) return null;
  const trimmed = typeof raw === 'string' ? raw.trim() : raw;
  if (trimmed === '') return null;
  const n = Number(trimmed);
  return Number.isNaN(n) ? null : n;
}

function isValidEmail(s) {
  const at = s.indexOf('@');
  if (at < 1 || s.indexOf('@', at + 1) !== -1) return false;
  const domain = s.slice(at + 1);
  const dot = domain.lastIndexOf('.');
  return dot > 0 && dot < domain.length - 1;
}

module.exports = {
  PROJECT_ROOT,
  VALID_PROP_TYPES,
  VALID_PROP_STATUSES,
  isSafePathComponent,
  esc,
  slugify,
  initListingFolder,
  normalizeAcreage,
  isValidEmail,
};
