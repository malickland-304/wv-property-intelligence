'use strict';

// ─────────────────────────────────────────────────────────────
// TEMPORARY: public property listings are hidden from the site
// until the inventory is cleaned up.
//
// To RESTORE listings later, either:
//   • set env  PUBLIC_LISTINGS_ENABLED=true   (no code change), or
//   • change the default below back to `return true`.
//
// When off: the homepage Featured/County sections + nav/footer
// links are hidden, /listings + /wv/* + /listing/* redirect home,
// and /api/listings returns empty. No listing data is deleted.
// ─────────────────────────────────────────────────────────────
function publicListingsEnabled() {
  const v = process.env.PUBLIC_LISTINGS_ENABLED;
  if (v === undefined || v === '') return false; // default: OFF for now
  return v !== 'false';
}

module.exports = { publicListingsEnabled };
