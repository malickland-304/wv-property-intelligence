'use strict';

/**
 * google.js — Shared helper for Gmail and Google Drive integrations.
 *
 * Required environment variables (see .env.example):
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN
 *   GOOGLE_GMAIL_USER       – Gmail address used to send notifications
 *   NOTIFICATION_EMAIL      – Destination address for inquiry emails
 *   GOOGLE_DRIVE_FOLDER_ID  – Root Drive folder for property photo folders
 *
 * All functions are no-ops when credentials are missing so that the server
 * starts correctly even before Google credentials are configured.
 */

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

// ── OAuth2 client ─────────────────────────────────────────────────────────────
function createOAuthClient() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) return null;

  const client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
  client.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });
  return client;
}

function hasGmailConfig() {
  const { GOOGLE_GMAIL_USER } = process.env;
  return Boolean(GOOGLE_GMAIL_USER && createOAuthClient());
}

/** Strip CR/LF and other control characters from email header values to prevent header injection. */
function sanitizeHeaderValue(value) {
  return String(value ?? '').replace(/[\r\n\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
}

async function sendTextEmail({ to, subject, bodyText, replyTo }) {
  const { GOOGLE_GMAIL_USER } = process.env;
  if (!GOOGLE_GMAIL_USER || !to || !subject || !bodyText) return false;

  const auth = createOAuthClient();
  if (!auth) return false;

  try {
    const gmail = google.gmail({ version: 'v1', auth });

    const safeFrom    = sanitizeHeaderValue(GOOGLE_GMAIL_USER);
    const safeTo      = sanitizeHeaderValue(to);
    const safeSubject = sanitizeHeaderValue(subject);

    const headers = [
      `From: WV Property Intelligence <${safeFrom}>`,
      `To: ${safeTo}`,
      `Subject: ${safeSubject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
    ];

    if (replyTo) headers.push(`Reply-To: ${sanitizeHeaderValue(replyTo)}`);

    // base64url produces URL-safe base64 without padding — no manual replace needed.
    const raw = Buffer.from(
      [...headers, '', bodyText].join('\r\n')
    ).toString('base64url');

    await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
    return true;
  } catch (err) {
    console.error('[Gmail] Failed to send email:', err.message);
    return false;
  }
}

// ── Gmail – send inquiry notification ────────────────────────────────────────
/**
 * Sends a Gmail notification email when a new contact inquiry is received.
 *
 * @param {{ name:string, email:string, phone?:string, message?:string }} contact
 * @param {{ address?:string, city?:string, county?:string, id:string }} property  May be null if no property linked.
 * @returns {Promise<void>}
 */
async function sendContactEmail(contact, property) {
  const { GOOGLE_GMAIL_USER, NOTIFICATION_EMAIL } = process.env;
  if (!GOOGLE_GMAIL_USER || !NOTIFICATION_EMAIL) return;

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
    const sent = await sendTextEmail({
      to: NOTIFICATION_EMAIL,
      subject,
      bodyText,
      replyTo: contact.email || undefined,
    });
    if (sent) {
      console.log(`[Gmail] Inquiry notification sent to ${NOTIFICATION_EMAIL}`);
    }
  } catch (err) {
    console.error('[Gmail] Failed to send inquiry email:', err.message);
  }
}

// ── Drive – ensure property folder exists ─────────────────────────────────────
/** Cache of slug → Drive folder ID to avoid redundant API calls. */
const folderCache = {};

/**
 * Finds or creates a Google Drive subfolder for the given property slug
 * inside the configured root folder.
 *
 * @param {object} drive  Authenticated googleapis Drive client.
 * @param {string} slug   Property listing slug.
 * @returns {Promise<string>} Drive folder ID for the property.
 */
async function getOrCreatePropertyFolder(drive, slug) {
  if (folderCache[slug]) return folderCache[slug];

  const rootFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

  // Check if folder already exists
  // Escape backslashes first, then single quotes, for use in Drive API query string
  const safeName = slug.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const list = await drive.files.list({
    q: `name='${safeName}' and mimeType='application/vnd.google-apps.folder' and '${rootFolderId}' in parents and trashed=false`,
    fields: 'files(id)',
    spaces: 'drive',
  });

  if (list.data.files && list.data.files.length > 0) {
    folderCache[slug] = list.data.files[0].id;
    return folderCache[slug];
  }

  // Create folder
  const folder = await drive.files.create({
    requestBody: {
      name: slug,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [rootFolderId],
    },
    fields: 'id',
  });

  folderCache[slug] = folder.data.id;
  return folderCache[slug];
}

// ── Drive – upload photo ──────────────────────────────────────────────────────
/**
 * Uploads a photo file to Google Drive inside a per-property subfolder.
 *
 * @param {string} filePath  Absolute local path to the file to upload.
 * @param {string} fileName  Desired filename in Drive.
 * @param {string} slug      Property listing slug (used as subfolder name).
 * @returns {Promise<string|null>} Drive file ID, or null on failure/skip.
 */
async function uploadPhotoToDrive(filePath, fileName, slug) {
  const { GOOGLE_DRIVE_FOLDER_ID } = process.env;
  if (!GOOGLE_DRIVE_FOLDER_ID) return null;

  const auth = createOAuthClient();
  if (!auth) return null;

  // Reject empty/missing filenames immediately
  const safeFileName = path.basename(fileName || '');
  if (!safeFileName) {
    console.error('[Drive] Rejected upload: empty filename');
    return null;
  }

  // Enforce that filePath must resolve inside the allowed listings directory
  const LISTINGS_ROOT = path.resolve(path.join(__dirname, '..', 'listings'));
  const safeFilePath  = path.resolve(filePath);
  if (!safeFilePath.startsWith(LISTINGS_ROOT + path.sep) && safeFilePath !== LISTINGS_ROOT) {
    console.error(`[Drive] Rejected upload: path '${safeFilePath}' is outside allowed directory`);
    return null;
  }

  try {
    const drive = google.drive({ version: 'v3', auth });
    const folderId = await getOrCreatePropertyFolder(drive, slug);

    const ext = path.extname(safeFileName).toLowerCase();
    const mimeMap = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
    const mimeType = mimeMap[ext] || 'image/jpeg';

    const response = await drive.files.create({
      requestBody: { name: safeFileName, parents: [folderId] },
      media: { mimeType, body: fs.createReadStream(safeFilePath) },
      fields: 'id,webViewLink',
    });

    console.log(`[Drive] Uploaded ${safeFileName} → ${response.data.webViewLink}`);
    return response.data.id;
  } catch (err) {
    console.error('[Drive] Failed to upload photo:', err.message);
    return null;
  }
}

module.exports = { hasGmailConfig, sendTextEmail, sendContactEmail, uploadPhotoToDrive };
