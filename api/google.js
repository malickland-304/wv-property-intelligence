'use strict';

/**
 * google.js — Gmail + Drive integration using Node built-ins only (no googleapis).
 *
 * Required env vars:
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN
 *   GOOGLE_GMAIL_USER       — Gmail address that sends notifications
 *   NOTIFICATION_EMAIL      — Destination for inquiry emails
 *   GOOGLE_DRIVE_FOLDER_ID  — Root Drive folder for photo backups (optional)
 *
 * All functions are no-ops when credentials are missing.
 */

const https = require('https');
const fs    = require('fs');
const path  = require('path');
const { isSafePathComponent, safeListingPath } = require('./helpers');

const folderCache = {};

// ── HTTP helpers ──────────────────────────────────────────

function httpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// ── OAuth2 token refresh ──────────────────────────────────

async function getAccessToken() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) return null;

  const body = new URLSearchParams({
    client_id:     GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    refresh_token: GOOGLE_REFRESH_TOKEN,
    grant_type:    'refresh_token',
  }).toString();

  const res = await httpsRequest({
    hostname: 'oauth2.googleapis.com',
    path:     '/token',
    method:   'POST',
    headers:  {
      'Content-Type':   'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body),
    },
  }, body);

  if (res.status !== 200 || !res.body.access_token) {
    throw new Error('Token refresh failed: ' + JSON.stringify(res.body));
  }
  return res.body.access_token;
}

// ── Gmail ─────────────────────────────────────────────────

async function sendContactEmail(contact, property) {
  const { GOOGLE_GMAIL_USER, NOTIFICATION_EMAIL } = process.env;
  if (!GOOGLE_GMAIL_USER || !NOTIFICATION_EMAIL) {
    console.warn('[Gmail] sendContactEmail skipped: GOOGLE_GMAIL_USER or NOTIFICATION_EMAIL not configured');
    return;
  }

  const token = await getAccessToken().catch(() => null);
  if (!token) {
    console.warn('[Gmail] sendContactEmail skipped: OAuth token unavailable — check GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN');
    return;
  }

  try {
    const propertyLine = property
      ? `Property: ${property.address || ''}${property.city ? ', ' + property.city : ''}${property.county ? ' – ' + property.county + ' County' : ''} (ID: ${property.id})`
      : 'Property: (none specified)';

    const bodyText = [
      '🏡 New Inquiry – WV Property Intelligence',
      '',
      propertyLine,
      '',
      `Name:    ${contact.name}`,
      `Email:   ${contact.email}`,
      `Phone:   ${contact.phone || '(not provided)'}`,
      '',
      'Message:',
      contact.message || '(no message)',
      '',
      '---',
      'Sent automatically by WV Property Intelligence',
    ].join('\n');

    const subject = `New Inquiry: ${contact.name}${property ? ' – ' + (property.address || property.id) : ''}`;

    const raw = Buffer.from(
      [
        `From: WV Property Intelligence <${GOOGLE_GMAIL_USER}>`,
        `To: ${NOTIFICATION_EMAIL}`,
        `Subject: ${subject}`,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        '',
        bodyText,
      ].join('\r\n')
    ).toString('base64url');

    const payload = JSON.stringify({ raw });
    const res = await httpsRequest({
      hostname: 'gmail.googleapis.com',
      path:     '/gmail/v1/users/me/messages/send',
      method:   'POST',
      headers:  {
        'Authorization': `Bearer ${token}`,
        'Content-Type':  'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, payload);

    if (res.status === 200) {
      console.log(`[Gmail] Inquiry notification sent to ${NOTIFICATION_EMAIL}`);
    } else {
      throw new Error('Gmail send failed: ' + JSON.stringify(res.body));
    }
  } catch (err) {
    console.error('[Gmail] Failed to send inquiry email:', err.message);
  }
}

// ── Drive ─────────────────────────────────────────────────

async function getOrCreatePropertyFolder(token, slug) {
  if (folderCache[slug]) return folderCache[slug];

  const rootId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!rootId) return null;

  const safeName = slug.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const q = encodeURIComponent(
    `name='${safeName}' and mimeType='application/vnd.google-apps.folder' and '${rootId}' in parents and trashed=false`
  );

  const listRes = await httpsRequest({
    hostname: 'www.googleapis.com',
    path:     `/drive/v3/files?q=${q}&fields=files(id)&spaces=drive`,
    method:   'GET',
    headers:  { 'Authorization': `Bearer ${token}` },
  });

  if (listRes.body.files && listRes.body.files.length > 0) {
    folderCache[slug] = listRes.body.files[0].id;
    return folderCache[slug];
  }

  const createBody = JSON.stringify({
    name: slug,
    mimeType: 'application/vnd.google-apps.folder',
    parents: [rootId],
  });
  const createRes = await httpsRequest({
    hostname: 'www.googleapis.com',
    path:     '/drive/v3/files?fields=id',
    method:   'POST',
    headers:  {
      'Authorization': `Bearer ${token}`,
      'Content-Type':  'application/json',
      'Content-Length': Buffer.byteLength(createBody),
    },
  }, createBody);

  folderCache[slug] = createRes.body.id;
  return folderCache[slug];
}

async function uploadPhotoToDrive(_filePath, fileName, slug) {
  if (!process.env.GOOGLE_DRIVE_FOLDER_ID) return null;

  const safeFileName = path.basename(fileName || '');
  if (!safeFileName || !isSafePathComponent(safeFileName) || !isSafePathComponent(slug || '')) {
    console.error('[Drive] Rejected upload: empty filename');
    return null;
  }

  const compressedPath = safeListingPath(slug, 'photos', 'compressed', safeFileName);
  const rawPath = safeListingPath(slug, 'photos', 'raw', safeFileName);
  const safeFilePath = fs.existsSync(compressedPath) ? compressedPath : rawPath;

  const token = await getAccessToken().catch(() => null);
  if (!token) return null;

  try {
    const folderId = await getOrCreatePropertyFolder(token, slug);
    if (!folderId) return null;

    const ext = path.extname(safeFileName).toLowerCase();
    const mimeMap = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
    const mimeType = mimeMap[ext] || 'image/jpeg';

    const boundary = 'ml_bound_' + Date.now().toString(16);
    const metadata = JSON.stringify({ name: safeFileName, parents: [folderId] });
    const fileData = fs.readFileSync(safeFilePath);

    const multipart = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
      fileData,
      Buffer.from(`\r\n--${boundary}--`),
    ]);

    return new Promise((resolve) => {
      const req = https.request({
        hostname: 'www.googleapis.com',
        path:     '/upload/drive/v3/files?uploadType=multipart&fields=id',
        method:   'POST',
        headers:  {
          'Authorization': `Bearer ${token}`,
          'Content-Type':  `multipart/related; boundary=${boundary}`,
          'Content-Length': multipart.length,
        },
      }, (res) => {
        let raw = '';
        res.on('data', c => raw += c);
        res.on('end', () => {
          try {
            const data = JSON.parse(raw);
            if (data.id) {
              console.log(`[Drive] Uploaded ${safeFileName} (id: ${data.id})`);
              resolve(data.id);
            } else {
              console.error('[Drive] Upload failed:', raw);
              resolve(null);
            }
          } catch { resolve(null); }
        });
      });
      req.on('error', err => { console.error('[Drive] Upload error:', err.message); resolve(null); });
      req.write(multipart);
      req.end();
    });
  } catch (err) {
    console.error('[Drive] Failed to upload photo:', err.message);
    return null;
  }
}

module.exports = { sendContactEmail, uploadPhotoToDrive };
