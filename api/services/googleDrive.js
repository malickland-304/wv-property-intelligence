'use strict';

/**
 * services/googleDrive.js — Google Drive photo management.
 *
 * Auth (same as googleSheets.js):
 *   1. GOOGLE_SERVICE_ACCOUNT_KEY env var — JSON string of service account credentials
 *   2. GOOGLE_APPLICATION_CREDENTIALS env var — path to service account JSON file
 *
 * Required env var:
 *   GOOGLE_DRIVE_FOLDER_ID  – Parent folder ID where photos are uploaded
 *
 * Uploaded files are made public (anyone/reader) so the returned URL works without auth.
 */

const { google } = require('googleapis');
const fs         = require('fs');
const path       = require('path');

// ── Auth ──────────────────────────────────────────────────
function getAuth() {
  const keyStr = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (keyStr) {
    const credentials = JSON.parse(keyStr);
    return new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive'],
    });
  }

  const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (keyFile && fs.existsSync(keyFile)) {
    return new google.auth.GoogleAuth({
      keyFile,
      scopes: ['https://www.googleapis.com/auth/drive'],
    });
  }

  return null;
}

function getDriveClient() {
  const auth = getAuth();
  if (!auth) return null;
  return google.drive({ version: 'v3', auth });
}

// ── Upload ────────────────────────────────────────────────
async function uploadPhoto(filePath, fileName, mimeType = 'image/jpeg') {
  const drive    = getDriveClient();
  if (!drive) return null;
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!folderId) return null;

  const fileStream = fs.createReadStream(filePath);

  const res = await drive.files.create({
    requestBody: {
      name:    fileName,
      parents: [folderId],
    },
    media: {
      mimeType,
      body: fileStream,
    },
    fields: 'id',
  });

  const fileId = res.data.id;

  // Make public
  await drive.permissions.create({
    fileId,
    requestBody: { role: 'reader', type: 'anyone' },
  });

  return getPhotoUrl(fileId);
}

async function uploadListingPhotos(files) {
  const uploaded = [];
  for (const file of files || []) {
    const filePath = file.path || file.filePath;
    const fileName = file.originalname || file.filename || path.basename(filePath || '');
    const mimeType = file.mimetype || 'image/jpeg';
    if (!filePath) continue;
    const url = await uploadPhoto(filePath, fileName, mimeType);
    if (url) uploaded.push(url);
  }
  return uploaded;
}

// ── Delete ────────────────────────────────────────────────
async function deletePhoto(fileId) {
  const drive = getDriveClient();
  if (!drive || !fileId) return false;
  await drive.files.delete({ fileId });
  return true;
}

// ── URL ───────────────────────────────────────────────────
function getPhotoUrl(fileId) {
  if (!fileId) return null;
  return `https://drive.google.com/uc?export=view&id=${fileId}`;
}

module.exports = { uploadPhoto, uploadListingPhotos, deletePhoto, getPhotoUrl };
