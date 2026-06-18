'use strict';

/**
 * chatAssistant.js — pure helpers for the public MalickLand assistant.
 *
 * No I/O, no network — safe to unit test. The route module (routes/chat.js)
 * wires these to the gateway-aware AI caller (ai-generator.generateChatReply)
 * and the per-IP rate limiter.
 *
 * Two jobs:
 *   1. buildChatSystemPrompt() — the strict, brokerage-safe system prompt.
 *   2. sanitizeChatMessages()  — trust boundary for the client-supplied history:
 *      - drops any role other than user/assistant (a client must NOT be able to
 *        inject or override the system prompt),
 *      - coerces content to a trimmed string and drops empties,
 *      - caps per-message length, total length, and turn count to bound spend.
 */

// Tightened defaults — the assistant answers in 2–4 short sentences, so we never
// need a long client history. Keeping these small protects the AI bill on a
// public, unauthenticated endpoint.
const MAX_MESSAGES        = 10;
const MAX_CHARS_PER_MSG   = 1500;
const MAX_TOTAL_CHARS     = 6000;
const ALLOWED_ROLES       = new Set(['user', 'assistant']);

// Brokerage-safe canned reply used whenever the live assistant can't answer
// (assistant disabled, no AI key configured, or the upstream call fails). No
// claims, just a useful next step. The "browse listings" pointer is only added
// when public listings are actually live — with listings off, /listings,
// /search, /listing/*, /wv/* redirect or return empty, so pointing visitors
// there would be a dead end.
function buildFallbackReply(listingsEnabled = true) {
  const base =
    "Thanks for reaching out! I can't chat live right now, but Phil Malick can help directly — " +
    'call (540) 246-1421 or email phil@malickland.net.';
  return listingsEnabled
    ? `${base} You can also browse current WV listings here on the site.`
    : base;
}

// Default (listings-on) form — preserves the original copy and parity with the
// client-side fallback in app/index.html.
const FALLBACK_REPLY = buildFallbackReply(true);

/**
 * The system prompt. Mirrors the brokerage-safe guardrails of the listing
 * generator (no ROI / appreciation / legal / tax / financing claims) and adds
 * conversational rules: stay on WV real estate, never invent specific
 * inventory, route anything human to Phil.
 *
 * @returns {string}
 */
function buildChatSystemPrompt() {
  return [
    'You are the MalickLand property assistant for WV Real Estate Agency, LLC, a licensed West Virginia',
    'real estate brokerage. You help visitors on malickland.net with questions about West Virginia land,',
    'homes, farms, and rural property. Phil Malick is the agent; Sheila Judy is the broker.',
    '',
    'VOICE: Friendly, concise, and direct. Plain text only — no markdown, no bullet characters, no emojis.',
    'Keep answers to 2–4 short sentences. If you do not know something, say so and point the visitor to Phil.',
    '',
    'YOU CAN HELP WITH: general WV land-buying topics (counties and regions, what acreage, road access,',
    'utilities, septic, well, and flood zones mean, the general buying process, and due-diligence steps to',
    'verify with the county), how MalickLand works, and encouraging visitors to browse listings on the site',
    'or reach out to Phil.',
    '',
    'STRICT BROKERAGE-SAFE RULES — never violate:',
    '- No guarantees, estimates, or predictions about price, market value, appreciation, ROI, investment',
    '  returns, or rental income.',
    '- No legal advice, no tax advice, and no financing, lending, or mortgage advice. Refer these to a',
    '  licensed attorney, tax professional, or lender.',
    '- Never invent specific listings, prices, parcel IDs, addresses, acreage, availability, or terms. If',
    '  asked about specific inventory or current prices, tell the visitor to browse the listings on',
    '  malickland.net or contact Phil — do not make up details.',
    "- Do not state a property's worth or give a valuation; offer to have Phil prepare a",
    '  comparative market analysis (CMA) instead.',
    '- Do not request sensitive personal or financial information. For showings, offers, or to speak with a',
    '  person, direct the visitor to Phil.',
    '- Real estate brokerage transactions handled by Phil may include a separate $299 transaction',
    '  administration fee disclosed in writing before signing. This fee does not apply to standalone',
    '  consulting or advisory services.',
    '- If a request is outside WV real estate or MalickLand, politely steer back or suggest contacting Phil.',
    '',
    'CONTACT: Phil Malick — (540) 246-1421 — phil@malickland.net. Brokerage: WV Real Estate Agency, LLC,',
    'Sheila Judy, Broker, 501 East Main Street, Romney, WV 26757. When unsure, recommend the visitor verify',
    'with the county or contact Phil.',
  ].join('\n');
}

/**
 * Normalize and bound a client-supplied messages array.
 *
 * @param {unknown} raw - req.body.messages (untrusted)
 * @param {object} [opts]
 * @param {number} [opts.maxMessages]
 * @param {number} [opts.maxCharsPerMessage]
 * @param {number} [opts.maxTotalChars]
 * @returns {Array<{role:'user'|'assistant', content:string}>} cleaned, most-recent-last
 */
function sanitizeChatMessages(raw, opts = {}) {
  const maxMessages      = opts.maxMessages      ?? MAX_MESSAGES;
  const maxCharsPerMsg   = opts.maxCharsPerMessage ?? MAX_CHARS_PER_MSG;
  const maxTotalChars    = opts.maxTotalChars    ?? MAX_TOTAL_CHARS;

  if (!Array.isArray(raw)) return [];

  // 1. Keep only well-formed user/assistant turns; coerce + trim + cap length.
  const cleaned = [];
  for (const msg of raw) {
    if (!msg || typeof msg !== 'object') continue;
    const role = msg.role;
    if (!ALLOWED_ROLES.has(role)) continue;            // drops 'system' and anything else
    if (typeof msg.content !== 'string') continue;
    const content = msg.content.trim().slice(0, maxCharsPerMsg);
    if (!content) continue;
    cleaned.push({ role, content });
  }

  // 2. Keep only the most recent turns (bounds token usage per request).
  let bounded = cleaned.slice(-maxMessages);

  // 3. Enforce a total-character budget, dropping the oldest turns first.
  let total = bounded.reduce((sum, m) => sum + m.content.length, 0);
  while (bounded.length > 1 && total > maxTotalChars) {
    total -= bounded[0].content.length;
    bounded = bounded.slice(1);
  }

  return bounded;
}

module.exports = {
  buildChatSystemPrompt,
  sanitizeChatMessages,
  FALLBACK_REPLY,
  buildFallbackReply,
  MAX_MESSAGES,
  MAX_CHARS_PER_MSG,
  MAX_TOTAL_CHARS,
};
