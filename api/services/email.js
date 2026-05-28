'use strict';

/**
 * services/email.js — Transactional email for lead notifications.
 *
 * Priority order:
 *   1. Resend (RESEND_API_KEY) — recommended, zero OAuth setup
 *   2. Gmail OAuth (GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + GOOGLE_REFRESH_TOKEN) — existing flow
 *   3. No-op if neither configured
 *
 * Required env vars (Resend path):
 *   RESEND_API_KEY        – from resend.com
 *   NOTIFICATION_EMAIL    – where alerts go (e.g. phil@malickland.net)
 *   FROM_EMAIL            – verified sender (e.g. alerts@malickland.net), defaults to onboarding@resend.dev for testing
 */

const https = require('https');

// ── Resend ────────────────────────────────────────────────
function sendViaResend(to, subject, html) {
  return new Promise((resolve, reject) => {
    const from = process.env.FROM_EMAIL || 'MalickLand <onboarding@resend.dev>';
    const body = JSON.stringify({ from, to, subject, html });

    const req = https.request({
      hostname: 'api.resend.com',
      path:     '/emails',
      method:   'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type':  'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(data));
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

// ── HTML template ─────────────────────────────────────────
function buildLeadHtml(contact, property) {
  const propLine = property
    ? `<tr><td><b>Property</b></td><td>${property.address || ''}${property.city ? ', ' + property.city : ''}${property.county ? ' — ' + property.county + ' County' : ''}</td></tr>`
    : '';

  return `<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;background:#F9F6F0;padding:2rem;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08);">
    <div style="background:#1B4332;padding:1.25rem 1.75rem;">
      <h2 style="color:#D4AF37;margin:0;font-size:1.2rem;">🏡 New Lead — MalickLand</h2>
    </div>
    <div style="padding:1.5rem;">
      <table style="width:100%;border-collapse:collapse;font-size:.95rem;">
        ${propLine}
        <tr><td style="padding:.4rem 0;color:#555;width:90px;"><b>Name</b></td><td>${contact.name}</td></tr>
        <tr><td style="padding:.4rem 0;color:#555;"><b>Email</b></td><td><a href="mailto:${contact.email}">${contact.email}</a></td></tr>
        <tr><td style="padding:.4rem 0;color:#555;"><b>Phone</b></td><td>${contact.phone ? `<a href="tel:${contact.phone}">${contact.phone}</a>` : '—'}</td></tr>
        <tr><td style="padding:.4rem 0;color:#555;vertical-align:top;"><b>Message</b></td><td style="white-space:pre-wrap;">${contact.message || '—'}</td></tr>
        <tr><td style="padding:.4rem 0;color:#555;"><b>Source</b></td><td>${contact.source || 'web'}</td></tr>
      </table>
      <div style="margin-top:1.5rem;">
        <a href="tel:${contact.phone || ''}" style="background:#1B4332;color:#D4AF37;padding:.65rem 1.25rem;border-radius:6px;text-decoration:none;font-weight:700;margin-right:.5rem;">📞 Call Now</a>
        <a href="mailto:${contact.email}" style="background:#D4AF37;color:#1B4332;padding:.65rem 1.25rem;border-radius:6px;text-decoration:none;font-weight:700;">✉️ Reply by Email</a>
      </div>
    </div>
    <div style="background:#F9F6F0;padding:.75rem 1.75rem;font-size:.78rem;color:#999;">
      Sent by MalickLand · malickland.net
    </div>
  </div>
</body>
</html>`;
}

// ── Main export ───────────────────────────────────────────
async function sendLeadNotification(contact, property) {
  const to = process.env.NOTIFICATION_EMAIL;
  if (!to) {
    console.warn('[email] sendLeadNotification skipped: NOTIFICATION_EMAIL not configured');
    return;
  }

  const propLabel = property ? ` — ${property.address || property.id}` : '';
  const subject   = `🏡 New Lead: ${contact.name}${propLabel}`;
  const html      = buildLeadHtml(contact, property);

  // Path 1: Resend
  if (process.env.RESEND_API_KEY) {
    try {
      await sendViaResend(to, subject, html);
      console.log(`[Resend] Lead notification → ${to}`);
      return;
    } catch (err) {
      console.error('[Resend] Failed:', err.message);
      // fall through to Gmail
    }
  }

  // Path 2: Gmail OAuth fallback
  if (!process.env.RESEND_API_KEY) {
    console.warn('[email] RESEND_API_KEY not configured — attempting Gmail OAuth fallback');
  }
  try {
    const { sendContactEmail } = require('../google');
    await sendContactEmail(contact, property);
  } catch (err) {
    console.error('[Gmail] Failed:', err.message);
  }
}

module.exports = { sendLeadNotification };
