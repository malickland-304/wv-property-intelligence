#!/usr/bin/env node
/**
 * setup-drive-folders.js
 *
 * Creates the canonical MalickLand Google Drive folder hierarchy under the
 * root folder specified by GOOGLE_DRIVE_FOLDER_ID.
 *
 * Prerequisites:
 *   - GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN must be
 *     set (same vars the main server uses via api/google.js)
 *   - GOOGLE_DRIVE_FOLDER_ID must point to the root "MalickLand" folder
 *
 * Usage:
 *   node scripts/setup-drive-folders.js
 *
 * The script is idempotent — re-running it will not create duplicate folders.
 */

'use strict';
const path = require('path');
const { createRequire } = require('module');

require('dotenv').config({ path: path.join(__dirname, '../api/.env') });

const apiRequire = createRequire(path.join(__dirname, '../api/package.json'));
const { google } = apiRequire('googleapis');

const {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REFRESH_TOKEN,
  GOOGLE_DRIVE_FOLDER_ID,
} = process.env;

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN || !GOOGLE_DRIVE_FOLDER_ID) {
  console.error('Missing required env vars. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, GOOGLE_DRIVE_FOLDER_ID.');
  process.exit(1);
}

const auth = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
auth.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });
const drive = google.drive({ version: 'v3', auth });

/**
 * Return the ID of an existing subfolder with `name` inside `parentId`,
 * or create it if it doesn't exist.
 */
async function ensureFolder(name, parentId) {
  const res = await drive.files.list({
    q: `name='${name}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`,
    fields: 'files(id, name)',
    spaces: 'drive',
  });
  if (res.data.files.length > 0) {
    console.log(`  ✓ exists: ${name} (${res.data.files[0].id})`);
    return res.data.files[0].id;
  }
  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
  });
  console.log(`  ✚ created: ${name} (${created.data.id})`);
  return created.data.id;
}

async function main() {
  console.log(`\nSetting up MalickLand Drive folders under root: ${GOOGLE_DRIVE_FOLDER_ID}\n`);

  // Top-level sections
  const listingsId    = await ensureFolder('Listings',           GOOGLE_DRIVE_FOLDER_ID);
  const marketingId   = await ensureFolder('Marketing',          GOOGLE_DRIVE_FOLDER_ID);
  const operationsId  = await ensureFolder('Operations',         GOOGLE_DRIVE_FOLDER_ID);
  const archiveId     = await ensureFolder('Archive',            GOOGLE_DRIVE_FOLDER_ID);

  // Listings sub-folders (one per property — add more as needed)
  console.log('\nListings sub-folders:');
  const adventDrId = await ensureFolder('37-Advent-Dr-Hampshire-WV', listingsId);
  await ensureFolder('Photos',       adventDrId);
  await ensureFolder('Documents',    adventDrId);
  await ensureFolder('Marketing',    adventDrId);

  // Marketing sub-folders
  console.log('\nMarketing sub-folders:');
  await ensureFolder('Social Media',    marketingId);
  await ensureFolder('Ad Copy',         marketingId);
  await ensureFolder('Email Templates', marketingId);

  // Operations sub-folders
  console.log('\nOperations sub-folders:');
  await ensureFolder('Contacts',    operationsId);
  await ensureFolder('Contracts',   operationsId);
  await ensureFolder('Financials',  operationsId);

  console.log('\nDone. Copy the folder IDs above into Railway env vars as needed.\n');
}

main().catch(err => { console.error(err); process.exit(1); });
