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

// Escape user-supplied values rendered into the HTML notification email.
function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
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
          resolve(JSON.parse(data || '{}'));
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
 * (not configured / no recipient) or failure. Never throws.
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
  try {
    await postToResend({ to, subject, html, text, replyTo });
    console.log('[Resend] email sent →', to);
    return true;
  } catch (err) {
    console.error('[Resend] send failed:', err.message);
    return false;
  }
}

// ── Lead notification (HTML, sent to NOTIFICATION_EMAIL) ───
function buildLeadHtml(contact, property) {
  const propLine = property
    ? `<tr><td><b>Property</b></td><td>${esc(property.address)}${property.city ? ', ' + esc(property.city) : ''}${property.county ? ' — ' + esc(property.county) + ' County' : ''}</td></tr>`
    : '';
  const phone = contact.phone ? esc(contact.phone) : '';

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
        <tr><td style="padding:.4rem 0;color:#555;"><b>Email</b></td><td><a href="mailto:${esc(contact.email)}">${esc(contact.email)}</a></td></tr>
        <tr><td style="padding:.4rem 0;color:#555;"><b>Phone</b></td><td>${phone ? `<a href="tel:${phone}">${phone}</a>` : '—'}</td></tr>
        <tr><td style="padding:.4rem 0;color:#555;vertical-align:top;"><b>Message</b></td><td style="white-space:pre-wrap;">${esc(contact.message) || '—'}</td></tr>
        <tr><td style="padding:.4rem 0;color:#555;"><b>Source</b></td><td>${esc(contact.source) || 'web'}</td></tr>
      </table>
      <div style="margin-top:1.5rem;">
        <a href="tel:${phone}" style="background:#1B4332;color:#D4AF37;padding:.65rem 1.25rem;border-radius:6px;text-decoration:none;font-weight:700;margin-right:.5rem;">\u{1F4DE} Call Now</a>
        <a href="mailto:${esc(contact.email)}" style="background:#D4AF37;color:#1B4332;padding:.65rem 1.25rem;border-radius:6px;text-decoration:none;font-weight:700;">✉️ Reply by Email</a>
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
  const propLabel = property ? ` — ${property.address || property.id}` : '';
  const subject = `\u{1F3E1} New Lead: ${contact.name}${propLabel}`;
  const html = buildLeadHtml(contact, property);
  return sendMail({ to, subject, html, replyTo: contact.email || undefined });
}

module.exports = { sendLeadNotification, sendMail, isEmailConfigured };
