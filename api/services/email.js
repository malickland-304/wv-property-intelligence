'use strict';

/**
 * services/email.js — Transactional email for lead notifications, via Resend.
 *
 * Resend is the provider (RESEND_API_KEY). Every send is a no-op that returns
 * `false` when RESEND_API_KEY is not configured, so callers can log
 * "captured but not notified" rather than failing the request. Never throws.
 *
 * Env vars:
 *   RESEND_API_KEY      – from resend.com (required to actually send)
 *   NOTIFICATION_EMAIL  – where lead alerts go (e.g. phil@malickland.net)
 *   FROM_EMAIL          – verified sender; defaults to onboarding@resend.dev (Resend's
 *                         test sender) until the malickland.net domain is verified
 */

const https = require('https');

function isEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

// Strict address check: no spaces, quotes, or URI delimiters (?, &, etc.), so the
// value is safe both as a Resend `reply_to` and inside a `mailto:` href.
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
function isValidEmail(email) {
  return typeof email === 'string' && EMAIL_RE.test(email.trim());
}

// Escape user-supplied values rendered into the HTML notification email.
function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// Sanitizers for values placed into mailto:/tel: hrefs. Return '' on anything
// that isn't clean (defense-in-depth on top of esc()).
function sanitizeEmailForHref(email) {
  return isValidEmail(email) ? email.trim() : '';
}

function sanitizePhoneForHref(phone) {
  if (typeof phone !== 'string') return '';
  return phone.replace(/[^0-9+]/g, '');
}

// ── Resend transport ──────────────────────────────────────
function postToResend({ to, subject, html, text, replyTo }) {
  return new Promise((resolve, reject) => {
    const from = process.env.FROM_EMAIL || 'MalickLand <onboarding@resend.dev>';
    const payload = { from, to, subject };
    if (html) payload.html = html;
    if (text) payload.text = text;
    if (replyTo) payload.reply_to = replyTo;
    const body = JSON.stringify(payload);

    const req = https.request({
      hostname: 'api.resend.com',
      path: '/emails',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          // A malformed 2xx body must not throw inside this callback (uncaught).
          let parsed = {};
          try { parsed = data ? JSON.parse(data) : {}; } catch (_) { parsed = {}; }
          resolve(parsed);
        } else {
          reject(new Error(`Resend ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * Generic transactional send. Returns true on success, false on skip
 * (not configured / no recipient) or failure. Never throws. An invalid
 * `replyTo` is dropped (never passed to Resend) so it can't sink the send.
 */
async function sendMail({ to, subject, html, text, replyTo } = {}) {
  if (!isEmailConfigured()) {
    console.warn('[email] send skipped: RESEND_API_KEY not configured');
    return false;
  }
  if (!to) {
    console.warn('[email] send skipped: no recipient');
    return false;
  }
  const safeReplyTo = isValidEmail(replyTo) ? replyTo.trim() : undefined;
  try {
    await postToResend({ to, subject, html, text, replyTo: safeReplyTo });
    console.log('[Resend] email sent →', to);
    return true;
  } catch (err) {
    console.error('[Resend] send failed:', err && err.message ? err.message : err);
    return false;
  }
}

// ── Lead notification (HTML, sent to NOTIFICATION_EMAIL) ───
function buildLeadHtml(contact = {}, property) {
  const propLine = property
    ? `<tr><td><b>Property</b></td><td>${esc(property.address)}${property.city ? ', ' + esc(property.city) : ''}${property.county ? ' — ' + esc(property.county) + ' County' : ''}</td></tr>`
    : '';
  const phone = contact.phone ? esc(contact.phone) : '';                 // display value
  const telHref = esc(sanitizePhoneForHref(contact.phone));              // safe tel: href
  const mailHref = esc(sanitizeEmailForHref(contact.email));             // safe mailto: href

  // First-touch attribution row (all values escaped). Omitted when absent.
  const att = contact.attribution && typeof contact.attribution === 'object' ? contact.attribution : null;
  const attribLines = att
    ? ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','referrer','landing_page','landing_at']
        .filter((k) => att[k]).map((k) => `${esc(k)}: ${esc(att[k])}`).join('<br>')
    : '';
  const attribRow = attribLines
    ? `<tr><td style="padding:.4rem 0;color:#555;vertical-align:top;"><b>Attribution</b></td><td style="font-size:.82rem;color:#555;white-space:normal;">${attribLines}</td></tr>`
    : '';

  return `<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;background:#F9F6F0;padding:2rem;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08);">
    <div style="background:#1B4332;padding:1.25rem 1.75rem;">
      <h2 style="color:#D4AF37;margin:0;font-size:1.2rem;">\u{1F3E1} New Lead — MalickLand</h2>
    </div>
    <div style="padding:1.5rem;">
      <table style="width:100%;border-collapse:collapse;font-size:.95rem;">
        ${propLine}
        <tr><td style="padding:.4rem 0;color:#555;width:90px;"><b>Name</b></td><td>${esc(contact.name)}</td></tr>
        <tr><td style="padding:.4rem 0;color:#555;"><b>Email</b></td><td>${mailHref ? `<a href="mailto:${mailHref}">${esc(contact.email)}</a>` : esc(contact.email) || '—'}</td></tr>
        <tr><td style="padding:.4rem 0;color:#555;"><b>Phone</b></td><td>${phone ? `<a href="tel:${telHref}">${phone}</a>` : '—'}</td></tr>
        <tr><td style="padding:.4rem 0;color:#555;vertical-align:top;"><b>Message</b></td><td style="white-space:pre-wrap;">${esc(contact.message) || '—'}</td></tr>
        <tr><td style="padding:.4rem 0;color:#555;"><b>Source</b></td><td>${esc(contact.source) || 'web'}</td></tr>
        ${attribRow}
      </table>
      <div style="margin-top:1.5rem;">
        <a href="tel:${telHref}" style="background:#1B4332;color:#D4AF37;padding:.65rem 1.25rem;border-radius:6px;text-decoration:none;font-weight:700;margin-right:.5rem;">\u{1F4DE} Call Now</a>
        <a href="mailto:${mailHref}" style="background:#D4AF37;color:#1B4332;padding:.65rem 1.25rem;border-radius:6px;text-decoration:none;font-weight:700;">✉️ Reply by Email</a>
      </div>
    </div>
    <div style="background:#F9F6F0;padding:.75rem 1.75rem;font-size:.78rem;color:#999;">
      Sent by MalickLand · malickland.net
    </div>
  </div>
</body>
</html>`;
}

/**
 * Notify Phil of a new lead. Returns true if sent, false if skipped/failed.
 */
async function sendLeadNotification(contact, property) {
  const to = process.env.NOTIFICATION_EMAIL;
  if (!to) {
    console.warn('[email] sendLeadNotification skipped: NOTIFICATION_EMAIL not configured');
    return false;
  }
  const safeContact = contact || {};
  const propLabel = property ? ` — ${property.address || property.id}` : '';
  const subject = `\u{1F3E1} New Lead: ${safeContact.name || 'Unknown'}${propLabel}`;
  const html = buildLeadHtml(safeContact, property);
  return sendMail({ to, subject, html, replyTo: safeContact.email });
}

module.exports = { sendLeadNotification, sendMail, isEmailConfigured, isValidEmail };
