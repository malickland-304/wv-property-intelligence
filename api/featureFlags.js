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

// ─────────────────────────────────────────────────────────────
// Public homepage AI assistant ("MalickLand Assistant" chat widget).
// Default ON to preserve current behavior. Turn OFF to stop the
// public bot from making any paid AI calls — the widget then returns
// its built-in canned reply (no LLM spend on anonymous visitors).
// The admin AI listing generator is unaffected either way.
//
//   • set env  PUBLIC_ASSISTANT_ENABLED=false   to disable (no code change)
// ─────────────────────────────────────────────────────────────
function publicAssistantEnabled() {
  const v = process.env.PUBLIC_ASSISTANT_ENABLED;
  if (v === undefined || v === '') return true; // default: ON
  return v !== 'false';
}

module.exports = { publicListingsEnabled, publicAssistantEnabled };
