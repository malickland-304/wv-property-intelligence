'use strict';

/**
 * services/inquiryForward.js — Forward a captured web lead to the n8n
 * "Inquiry intake (all brands)" workflow.
 *
 * The lead is already stored in `contacts` before this runs; forwarding is a
 * best-effort copy. It is a no-op that returns `false` when not configured,
 * and it never throws, so a slow or unreachable n8n cannot fail the visitor's
 * request or lose the lead.
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

async function forwardInquiry(contact, property, { fetchImpl = globalThis.fetch } = {}) {
  if (!contact || (contact.id == null && !contact.submission_id)) return false;
  const url = getWebhookUrl();
  const secret = String(process.env.INQUIRY_WEBHOOK_SECRET || '').trim();
  if (!url || !secret || typeof fetchImpl !== 'function') return false;

  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [SECRET_HEADER]: secret },
      body: JSON.stringify(buildInquiryPayload(contact, property)),
      redirect: 'error', // never re-send the secret to a redirect target
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return Boolean(res && res.ok);
  } catch (_err) {
    return false;
  }
}

module.exports = { isInquiryForwardConfigured, buildInquiryPayload, forwardInquiry, SECRET_HEADER };
