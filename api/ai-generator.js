'use strict';

/**
 * ai-generator.js — MalickLand Listing Content Engine
 *
 * One function call turns raw property data into a complete marketing package:
 *   - MLS description
 *   - Buyer research summary
 *   - Headline + 5 highlights
 *   - Facebook ad (short + long)
 *   - Instagram caption
 *   - Video script (30–45 sec)
 *   - Email blast
 *   - Landing page content
 *   - SMS blast
 *
 * Requires one of (in precedence order):
 *   AI_GATEWAY_API_KEY  (Vercel AI Gateway — needs paid gateway credits for Claude)
 *   ANTHROPIC_API_KEY   (direct Anthropic — Claude without the gateway)
 *   OPENAI_API_KEY      (direct OpenAI)
 *
 * Usage:
 *   const { generateListingContent } = require('./ai-generator');
 *   const content = await generateListingContent(propertyRow);
 *   // returns structured object + writes to listing.json
 */

const https  = require('https');
const fs     = require('fs');
const { safeListingPath } = require('./helpers');

// ── AI provider calls — Vercel AI Gateway, direct Anthropic, or direct OpenAI, no SDK ─────

const ENDPOINTS = {
  gateway:   { hostname: 'ai-gateway.vercel.sh', path: '/v1/chat/completions' },
  anthropic: { hostname: 'api.anthropic.com',    path: '/v1/messages' },
  openai:    { hostname: 'api.openai.com',       path: '/v1/chat/completions' }
};

const DEFAULT_GATEWAY_MODEL            = 'openai/gpt-5.4';
const DEFAULT_GATEWAY_FALLBACK_MODEL   = 'anthropic/claude-haiku-4.5';
const DEFAULT_ANTHROPIC_MODEL          = 'claude-haiku-4-5';
const DEFAULT_ANTHROPIC_FALLBACK_MODEL = 'claude-sonnet-4-6';
const DEFAULT_OPENAI_MODEL             = 'gpt-4o';
const ANTHROPIC_VERSION                = '2023-06-01';

/**
 * Pick provider, endpoint, key, and models from the environment.
 * Pure (no I/O) so it is unit-testable. Returns null when nothing is configured.
 * Precedence: gateway → direct Anthropic → direct OpenAI.
 */
function resolveAiProvider(env = process.env) {
  const gatewayKey = env.AI_GATEWAY_API_KEY?.trim();
  if (gatewayKey) {
    const primaryModel  = env.AI_GATEWAY_MODEL?.trim()          || DEFAULT_GATEWAY_MODEL;
    const fallbackModel = env.AI_GATEWAY_FALLBACK_MODEL?.trim() || DEFAULT_GATEWAY_FALLBACK_MODEL;
    return {
      mode: 'gateway',
      ...ENDPOINTS.gateway,
      apiKey: gatewayKey,
      primaryModel,
      fallbackModel: fallbackModel === primaryModel ? null : fallbackModel
    };
  }

  const anthropicKey = env.ANTHROPIC_API_KEY?.trim();
  if (anthropicKey) {
    const primaryModel  = env.ANTHROPIC_MODEL?.trim()          || DEFAULT_ANTHROPIC_MODEL;
    const fallbackModel = env.ANTHROPIC_FALLBACK_MODEL?.trim() || DEFAULT_ANTHROPIC_FALLBACK_MODEL;
    return {
      mode: 'anthropic',
      ...ENDPOINTS.anthropic,
      apiKey: anthropicKey,
      primaryModel,
      fallbackModel: fallbackModel === primaryModel ? null : fallbackModel
    };
  }

  const openaiKey = env.OPENAI_API_KEY?.trim();
  if (openaiKey) {
    const primaryModel = env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL;
    return {
      mode: 'openai',
      ...ENDPOINTS.openai,
      apiKey: openaiKey,
      primaryModel,
      // Preserve the original auto-fallback to gpt-4o-mini for the default model.
      fallbackModel: primaryModel === DEFAULT_OPENAI_MODEL ? 'gpt-4o-mini' : null
    };
  }

  return null;
}

/** True when any AI provider is configured (gateway, direct Anthropic, or direct OpenAI). */
function aiConfigured(env = process.env) {
  return Boolean(
    env.AI_GATEWAY_API_KEY?.trim() ||
    env.ANTHROPIC_API_KEY?.trim() ||
    env.OPENAI_API_KEY?.trim()
  );
}

// response_format:{type:'json_object'} is an OpenAI-family feature. Send it for
// OpenAI models (direct gpt-*, or gateway openai/*); for Anthropic models
// (direct claude-* or gateway anthropic/*) rely on the prompt's "return ONLY
// valid JSON" instruction + parseJsonLoose(). Bare ids without a "/" are direct
// OpenAI EXCEPT bare Claude ids, which the direct-Anthropic path now produces.
function supportsJsonObjectFormat(model) {
  if (!model || typeof model !== 'string') return false;
  if (/claude|anthropic/i.test(model)) return false;
  return !model.includes('/') || model.startsWith('openai/');
}

// Build the provider-specific HTTP headers + JSON body for one chat request.
// OpenAI-family (direct OpenAI, or any gateway model) uses /v1/chat/completions
// with Bearer auth and an inline system role. Anthropic uses /v1/messages with
// x-api-key, the anthropic-version header, and a top-level `system` field
// (role:'system' is NOT allowed inside the messages array there).
function buildProviderRequest(mode, messages, model, apiKey, options) {
  const { json, temperature, maxTokens } = options;

  if (mode === 'anthropic') {
    const systemText = messages
      .filter((m) => m && m.role === 'system')
      .map((m) => String(m.content || ''))
      .join('\n\n')
      .trim();
    const turns = messages
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant'))
      .map((m) => ({ role: m.role, content: String(m.content || '') }));
    const payload = { model, max_tokens: maxTokens, temperature, messages: turns };
    if (systemText) payload.system = systemText;
    return {
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': ANTHROPIC_VERSION
      },
      body: JSON.stringify(payload)
    };
  }

  const payload = { model, messages, temperature, max_tokens: maxTokens };
  if (json && supportsJsonObjectFormat(model)) payload.response_format = { type: 'json_object' };
  return {
    headers: {
      'Content-Type':  'application/json',
      'Authorization': 'Bearer ' + apiKey
    },
    body: JSON.stringify(payload)
  };
}

// Pull the assistant's text out of a provider response. Anthropic returns a
// `content` array of typed blocks; OpenAI returns choices[].message.content.
function extractResponseText(mode, parsed) {
  if (mode === 'anthropic') {
    if (!Array.isArray(parsed?.content)) return null;
    const text = parsed.content
      .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text)
      .join('');
    return text || null;
  }
  return parsed?.choices?.[0]?.message?.content || null;
}

// Tolerant JSON extraction for the structured listing generator. response_format
// guarantees clean JSON on OpenAI, but Anthropic returns plain text that may be
// wrapped in ```json fences or carry minor preamble — strip to the outermost
// object before parsing.
function parseJsonLoose(content) {
  try { return JSON.parse(content); } catch { /* fall through to fence/braces strip */ }
  let s = String(content).trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const first = s.indexOf('{');
  const last  = s.lastIndexOf('}');
  if (first !== -1 && last > first) s = s.slice(first, last + 1);
  return JSON.parse(s);
}

// options.json (default true) keeps the structured-JSON behavior the listing
// generator relies on. Pass { json: false } for free-text chat completions
// (the public assistant): no response_format, raw string content returned.
function requestChat(messages, model, endpoint, options = {}) {
  const { json = true, temperature = 0.7, maxTokens = 2500, timeoutMs = 45000 } = options;
  const { headers, body } = buildProviderRequest(
    endpoint.mode, messages, model, endpoint.apiKey,
    { json, temperature, maxTokens }
  );

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: endpoint.hostname,
        path: endpoint.path,
        method: 'POST',
        headers: { ...headers, 'Content-Length': Buffer.byteLength(body) }
      },
      (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          const status = res.statusCode;
          let parsed = null;
          try { parsed = data ? JSON.parse(data) : {}; } catch { /* non-JSON body (e.g. a 5xx HTML proxy page) */ }

          // Attach statusCode even when the body is not JSON, so isRetryableError()
          // can fail over on a 5xx/429 error page.
          if (status >= 400 || parsed?.error) {
            const message = parsed?.error?.message || (data ? data.slice(0, 200) : `HTTP ${status}`);
            const err = new Error(`AI API error (${status}): ${message}`);
            err.statusCode = status;
            // Provider error discriminators: OpenAI uses error.code/error.type;
            // Anthropic uses only error.type (authentication_error, rate_limit_error,
            // overloaded_error, not_found_error, invalid_request_error).
            err.openaiCode = parsed?.error?.code || null;
            err.openaiType = parsed?.error?.type || null;
            return reject(err);
          }
          if (!parsed) {
            const err = new Error(`AI API error (${status}): non-JSON response`);
            err.statusCode = status;
            return reject(err);
          }
          const content = extractResponseText(endpoint.mode, parsed);
          if (!content) return reject(new Error('Empty response from AI provider'));
          if (!json) return resolve(content);
          try {
            resolve(parseJsonLoose(content));
          } catch (e) {
            reject(new Error('Failed to parse AI response content: ' + e.message));
          }
        });
      }
    );
    req.setTimeout(timeoutMs, () => req.destroy(new Error('AI request timed out')));
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function isModelAccessError(err) {
  return err?.openaiCode === 'model_not_found' ||
    ((err?.statusCode === 403 || err?.statusCode === 404) && err?.openaiType === 'invalid_request_error');
}

// Through the gateway, also fail over on transient provider errors (5xx / 429 /
// timeout) so an outage at the primary provider falls back to the secondary.
function isRetryableError(err) {
  const sc = err?.statusCode;
  return isModelAccessError(err) || sc === 429 ||
    (typeof sc === 'number' && sc >= 500 && sc <= 599) ||
    /timed out/i.test(err?.message || '');
}

// Shared gateway-aware caller: resolve provider, try the primary model, fail
// over to the secondary on retryable/access errors. Used by both the structured
// listing generator (json:true) and the free-text chat assistant (json:false),
// so provider routing + failover live in exactly one place.
async function callProvider(messages, options = {}) {
  const provider = resolveAiProvider(options.env);
  if (!provider) {
    throw new Error('No AI provider configured — set AI_GATEWAY_API_KEY (preferred), ANTHROPIC_API_KEY, or OPENAI_API_KEY');
  }

  const endpoint = { hostname: provider.hostname, path: provider.path, apiKey: provider.apiKey, mode: provider.mode };

  try {
    return await requestChat(messages, provider.primaryModel, endpoint, options);
  } catch (err) {
    // Direct OpenAI keeps its legacy access-error-only failover; gateway and
    // direct Anthropic also fail over on transient errors (429/5xx/overloaded/
    // timeout) so the cheap primary (haiku) escalates to the secondary (sonnet).
    const shouldFallback = provider.fallbackModel &&
      (provider.mode === 'openai' ? isModelAccessError(err) : isRetryableError(err));
    if (shouldFallback) {
      console.warn(`[AI] Primary model ${provider.primaryModel} failed (${err.message}); falling back to ${provider.fallbackModel}`);
      return requestChat(messages, provider.fallbackModel, endpoint, options);
    }
    throw err;
  }
}

// Listing content path — structured JSON output (admin generator).
async function callAI(messages) {
  return callProvider(messages, { json: true });
}

/**
 * Free-text chat completion for the public MalickLand assistant widget.
 *
 * Reuses the same gateway-aware provider resolution + model failover as the
 * listing generator (resolveAiProvider / requestChat), but returns the raw
 * assistant text instead of parsed JSON. Throws when no provider is configured
 * or the upstream call fails — callers must catch and degrade gracefully.
 *
 * @param {Array<{role:string, content:string}>} messages - system prompt + chat turns
 * @param {{temperature?:number, maxTokens?:number, env?:object}} [opts]
 * @returns {Promise<string>} assistant reply text (trimmed)
 */
async function generateChatReply(messages, opts = {}) {
  const { temperature = 0.4, maxTokens = 500, env } = opts;
  const text = await callProvider(messages, { json: false, temperature, maxTokens, env });
  return typeof text === 'string' ? text.trim() : '';
}

// ── Build structured prompt from property data ────────────────────────────────

function buildPrompt(p) {
  // Utilities string
  const utilities = [
    p.well       ? 'Well'     : null,
    p.septic     ? 'Septic'   : null,
    p.electric   ? 'Electric' : null,
    p.internet   ? 'Internet' : null
  ].filter(Boolean).join(', ') || 'Check with county';

  const infra = p.utilities_available || utilities;
  const access = p.road_access || 'Road access — see listing';
  const county = p.county_name || p.county || 'WV';

  // Price context
  const priceStr   = p.price        ? `$${Number(p.price).toLocaleString()}`        : 'Call for price';
  const ppaStr     = p.price_per_acre ? `$${Number(p.price_per_acre).toLocaleString()}/acre` : '';
  const taxStr     = p.annual_tax   ? `$${Number(p.annual_tax).toLocaleString()}/yr` : 'Contact for tax info';
  const floodStr   = p.flood_zone   || 'Not in flood zone / verify with WV Flood Tool';
  const schoolStr  = p.school_district || county + ' County Schools';

  // Property type context
  const typeLabel = {
    land:          'vacant land / acreage',
    residential:   'residential home',
    commercial:    'commercial property',
    'multi-family':'multi-family property',
    industrial:    'industrial property'
  }[p.property_type] || 'property';

  const bedroomsBaths = (p.bedrooms || p.bathrooms)
    ? `${p.bedrooms || '?'} bed / ${p.bathrooms || '?'} bath`
    : null;

  const systemPrompt = `You are a professional real estate marketing engine specializing in West Virginia land and residential properties. You write compelling, accurate, brokerage-safe copy for rural property buyers and sellers across WV, VA, MD, PA, and OH. Write in a direct, confident voice. No fluff. No emojis. No exaggeration. Avoid guaranteed pricing, ROI, appreciation, legal, tax, or investment-advice claims. Brokerage transactions handled by Phil may include a separate $299 transaction administration fee disclosed in writing before signing; this fee does not apply to standalone consulting or advisory services.`;

  const userPrompt = `Generate a complete marketing package for this property. Return ONLY a valid JSON object with the exact keys listed.

PROPERTY DATA:
- Address: ${p.address}${p.city ? ', ' + p.city : ''}, ${p.state || 'WV'} ${p.zip || ''}
- County: ${county} County, WV
- Type: ${typeLabel}
- Acreage: ${p.acreage ? p.acreage + ' acres' : 'TBD'}
- List Price: ${priceStr}${ppaStr ? ' (' + ppaStr + ')' : ''}
- Property Description: ${p.property_description || p.seller_notes || '(none provided)'}
- Road Access: ${access}
- Utilities: ${infra}
- Flood Zone: ${floodStr}
- School District: ${schoolStr}
- Annual Taxes: ${taxStr}
${bedroomsBaths ? '- Bedrooms/Baths: ' + bedroomsBaths : ''}
${p.sqft ? '- Square Footage: ' + p.sqft + ' sqft' : ''}
${p.year_built ? '- Year Built: ' + p.year_built : ''}
${p.mls_number ? '- MLS #: ' + p.mls_number : ''}
${p.parcel_id ? '- Parcel ID: ' + p.parcel_id : ''}

OUTPUT FORMAT — Return this exact JSON structure:
{
  "headline": "max 12 words, punchy, specific to this property",
  "highlights": ["5 bullet points, 1 sentence each, most important features first"],
  "mls_description": "150-250 words. Professional, MLS-compliant. Lead with location and key feature. Include acreage, utilities, access, taxes, flood note. End with agent name Phil Malick and brokerage MalickLand WV Real Estate.",
  "investor_description": "100-150 words. Buyer research focused. Mention price per acre if applicable. Highlight property context: hunting, timber, buildable potential, recreation, utilities, access, and buyer verification. No ROI, appreciation, rental, legal, tax, or guaranteed-value claims.",
  "facebook_short": "40-60 words. Hook + key details + call to action. Direct.",
  "facebook_long": "100-150 words. Tell the story of the land. Why WV. Why now. End with CTA.",
  "instagram_caption": "60-80 words. Visual storytelling. 5-8 relevant hashtags at end.",
  "video_script": "30-45 second walkthrough script. Start with the best visual hook. 3-4 scenes. End with contact CTA for Phil Malick at MalickLand.",
  "email_subject": "Email subject line, max 50 chars",
  "email_blast": "150-200 words. Open with the best feature. Cover price, acreage, utilities, access. CTA to call or visit malickland.net. Sign off from Phil Malick.",
  "sms_blast": "max 160 chars. Include price and a short URL placeholder.",
  "landing_page_hero": "1-2 sentences for the hero section of a landing page",
  "landing_page_sections": ["3-4 short sections: Why This Property / Location / Terms / Contact - each as a paragraph of 2-3 sentences"],
  "comps_note": "1-2 sentence note on how to think about pricing this property relative to the market, based on type and county",
  "tags": ["5-8 search tags / keywords for this listing"]
}`;

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user',   content: userPrompt }
  ];
}

// ── Write outputs to listing.json ─────────────────────────────────────────────

function saveToListingJson(slug, aiContent, propertyData) {
  const baseDir = safeListingPath(slug);
  fs.mkdirSync(baseDir, { recursive: true });
  const jsonPath = safeListingPath(slug, 'listing.json');

  let existing = {};
  try { existing = JSON.parse(fs.readFileSync(jsonPath, 'utf8')); } catch {}

  const updated = {
    ...existing,
    ...propertyData,
    ai_content:        aiContent,
    ai_generated_at:   new Date().toISOString()
  };

  fs.writeFileSync(jsonPath, JSON.stringify(updated, null, 2));
  console.log(`[AI] Saved to listing.json: ${slug}`);
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Generate all marketing content for a property.
 *
 * @param {Object} property  - Row from properties table (with county_name joined)
 * @param {Object} [db]      - Optional: SQLite db instance to write ai_content back
 * @returns {Promise<Object>} Generated content object
 */
async function generateListingContent(property, db = null) {
  console.log(`[AI] Generating content for: ${property.address} (${property.listing_slug})`);

  const messages = buildPrompt(property);
  let content;

  try {
    content = await callAI(messages);
  } catch (err) {
    console.error('[AI] generation call failed:', err.message);
    throw err;
  }

  // Save to listing.json
  if (property.listing_slug) {
    try {
      saveToListingJson(property.listing_slug, content, property);
    } catch (err) {
      console.warn('[AI] Could not write listing.json:', err.message);
    }
  }

  // Save to DB if instance provided
  if (db) {
    try {
      db.prepare(`
        UPDATE properties SET
          marketing_description = ?,
          ai_content = ?,
          ai_generated_at = datetime('now'),
          updated_at = datetime('now')
        WHERE id = ?
      `).run(
        content.mls_description,
        JSON.stringify(content),
        property.id
      );
      console.log(`[AI] Saved to DB: ${property.id}`);
    } catch (err) {
      console.warn('[AI] Could not write to DB:', err.message);
    }
  }

  return content;
}

/**
 * Get AI content for a property (from DB cache or regenerate).
 *
 * @param {Object} property - Property row
 * @param {Object} db       - SQLite db instance
 * @param {boolean} [force] - Force regeneration even if cached
 */
async function getOrGenerateContent(property, db, force = false) {
  if (!force && property.ai_content) {
    try {
      return JSON.parse(property.ai_content);
    } catch {}
  }
  return generateListingContent(property, db);
}

module.exports = {
  generateListingContent,
  getOrGenerateContent,
  generateChatReply,
  buildPrompt,
  resolveAiProvider,
  supportsJsonObjectFormat,
  aiConfigured
};
