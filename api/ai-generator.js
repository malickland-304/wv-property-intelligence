'use strict';

/**
 * ai-generator.js — MalickLand Listing Content Engine
 *
 * One function call turns raw property data into a complete marketing package:
 *   - MLS description
 *   - Investor pitch
 *   - Headline + 5 highlights
 *   - Facebook ad (short + long)
 *   - Instagram caption
 *   - Video script (30–45 sec)
 *   - Email blast
 *   - Landing page content
 *   - SMS blast
 *
 * Requires: OPENAI_API_KEY in environment
 *
 * Usage:
 *   const { generateListingContent } = require('./ai-generator');
 *   const content = await generateListingContent(propertyRow);
 *   // returns structured object + writes to listing.json
 */

const https  = require('https');
const fs     = require('fs');
const path   = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');

// ── OpenAI call (no SDK — keeps dependencies minimal) ────────────────────────

async function callOpenAI(messages, model = 'gpt-4o') {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');

  const body = JSON.stringify({
    model,
    messages,
    temperature: 0.7,
    max_tokens: 2500,
    response_format: { type: 'json_object' }
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.openai.com',
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'Content-Length': Buffer.byteLength(body)
        }
      },
      (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) return reject(new Error(parsed.error.message));
            const content = parsed.choices?.[0]?.message?.content;
            if (!content) return reject(new Error('Empty response from OpenAI'));
            resolve(JSON.parse(content));
          } catch (e) {
            reject(new Error('Failed to parse OpenAI response: ' + e.message));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
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

  const systemPrompt = `You are a professional real estate marketing engine specializing in West Virginia land and residential properties. You write compelling, accurate, compliant copy for buyers and investors across WV, VA, MD, PA, and OH. Write in a direct, confident voice. No fluff. No emojis. No exaggeration. Focus on what matters to rural land buyers and investors.`;

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
  "investor_description": "100-150 words. ROI-focused. Mention price per acre if applicable. Highlight upside: hunting, timber, buildable, rental potential, etc. No fluff.",
  "facebook_short": "40-60 words. Hook + key details + call to action. Direct.",
  "facebook_long": "100-150 words. Tell the story of the land. Why WV. Why now. End with CTA.",
  "instagram_caption": "60-80 words. Visual storytelling. 5-8 relevant hashtags at end.",
  "video_script": "30-45 second walkthrough script. Start with the best visual hook. 3-4 scenes. End with contact CTA for Phil Malick at MalickLand.",
  "email_subject": "Email subject line, max 50 chars",
  "email_blast": "150-200 words. Open with the best feature. Cover price, acreage, utilities, access. CTA to call or visit malickland.sale. Sign off from Phil Malick.",
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
  const jsonPath = path.join(PROJECT_ROOT, 'listings', slug, 'listing.json');

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
    content = await callOpenAI(messages);
  } catch (err) {
    console.error('[AI] OpenAI call failed:', err.message);
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

module.exports = { generateListingContent, getOrGenerateContent, buildPrompt };
