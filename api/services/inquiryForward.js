'use strict';

/**
 * services/inquiryForward.js — Forward a captured web lead to the n8n
 * "Inquiry intake (all brands)" workflow.
 *
 * Routes queue the payload in `inquiry_outbox` together with the lead, and
 * services/inquiryOutbox.js delivers it with deliverInquiryPayload(), retrying
 * failures. Nothing here throws, so a slow or unreachable n8n cannot fail the
 * visitor's request or lose the lead. forwardInquiry() is a one-shot send kept
 * for callers that do not need retries.
 *
 * Env vars (set in the VPS .env — never in code):
 *   INQUIRY_WEBHOOK_URL     – n8n production webhook URL (must be https)
 *   INQUIRY_WEBHOOK_SECRET  – shared secret, sent as the X-Inquiry-Secret header
 *   INQUIRY_BRAND           – brand label n8n files the lead under
 *                             (default "MalickLand"; must be in the Ops Hub
 *                             Config brands_allowed list or n8n rejects it)
 */

const SECRET_HEADER = 'X-Inquiry-Secret';
const TIMEOUT_MS = 5000;
const DEFAULT_BRAND = 'MalickLand';

function getWebhookUrl() {
  const raw = String(process.env.INQUIRY_WEBHOOK_URL || '').trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    // https only: the secret travels in a header.
    return url.protocol === 'https:' ? url : null;
  } catch (_err) {
    return null;
  }
}

function isInquiryForwardConfigured() {
  return Boolean(getWebhookUrl() && String(process.env.INQUIRY_WEBHOOK_SECRET || '').trim());
}

function clip(value, max) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

// Shape expected by the n8n "Web Form Inquiry" webhook. submission_id is derived
// from the contacts row id so a retried forward is recognised as a replay.
function buildInquiryPayload(contact, property) {
  const location = property
    ? [property.address, property.city, property.county].filter(Boolean).join(', ')
    : '';
  const payload = {
    brand: clip(process.env.INQUIRY_BRAND, 80) || DEFAULT_BRAND,
    name: clip(contact.name, 200),
    email: clip(contact.email, 200),
    phone: clip(contact.phone, 40),
    message: clip(contact.message, 5000),
    // Callers outside the contacts table (property-lead forms) pass their own stable id.
    submission_id: clip(contact.submission_id, 100) || `malickland-contact-${contact.id}`,
    source: 'web_form',
    source_detail: clip(`malickland.net ${contact.source || 'web'}`, 300),
    location_or_item: clip(contact.location || location, 300),
  };
  if (contact.need_type) payload.need_type = clip(contact.need_type, 80);
  // Send the recorded choice either way: an unchecked box is an explicit "no".
  if (contact.consent_sms !== undefined && contact.consent_sms !== null) payload.consent_sms = Boolean(contact.consent_sms);
  return payload;
}

// HTTP statuses that mean "this exact request will never succeed as-is":
// bad payload (400) or a wrong/missing secret (401/403). Retrying them would
// only hammer n8n, so the outbox parks them as `failed` for operator review.
const PERMANENT_STATUSES = new Set([400, 401, 403]);

/**
 * POST an already-built payload to the intake webhook once and classify the
 * result. Never throws. The returned errorClass is a short, PII-free label
 * ("timeout", "network", "http_503", ...) that is safe to store and log.
 *
 *   { ok: true }                                  delivered (2xx)
 *   { ok: false, retryable: true,  errorClass }   network error, timeout, 429, 5xx, other 4xx
 *   { ok: false, retryable: false, errorClass }   400 / 401 / 403
 *   { ok: false, retryable: true,  errorClass: 'not_configured' }  env missing or not https
 */
async function deliverInquiryPayload(payload, { fetchImpl = globalThis.fetch } = {}) {
  const url = getWebhookUrl();
  const secret = String(process.env.INQUIRY_WEBHOOK_SECRET || '').trim();
  if (!url || !secret || typeof fetchImpl !== 'function') {
    return { ok: false, retryable: true, errorClass: 'not_configured' };
  }

  let res;
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [SECRET_HEADER]: secret },
      body: JSON.stringify(payload),
      redirect: 'error', // never re-send the secret to a redirect target
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const name = err && err.name;
    const timedOut = name === 'TimeoutError' || name === 'AbortError';
    return { ok: false, retryable: true, errorClass: timedOut ? 'timeout' : 'network' };
  }

  if (res && res.ok) return { ok: true };
  const status = Number(res && res.status) || 0;
  return {
    ok: false,
    retryable: !PERMANENT_STATUSES.has(status),
    errorClass: status ? `http_${status}` : 'network',
  };
}

async function forwardInquiry(contact, property, { fetchImpl = globalThis.fetch } = {}) {
  if (!contact || (contact.id == null && !contact.submission_id)) return false;
  if (!isInquiryForwardConfigured()) return false;
  const result = await deliverInquiryPayload(buildInquiryPayload(contact, property), { fetchImpl });
  return result.ok;
}

module.exports = {
  isInquiryForwardConfigured,
  buildInquiryPayload,
  deliverInquiryPayload,
  forwardInquiry,
  SECRET_HEADER,
};
