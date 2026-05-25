#!/usr/bin/env node
/**
 * setup-listings-sheet.js
 *
 * Creates (or verifies) a Google Sheets "control center" spreadsheet for
 * the MalickLand property portfolio.  The sheet is created in the root
 * Drive folder (GOOGLE_DRIVE_FOLDER_ID) and its ID is printed so you can
 * save it as GOOGLE_LISTINGS_SHEET_ID in Railway.
 *
 * Sheets created:
 *   1. Listings        — master property table (slug, address, price, status, MLS, photos_count)
 *   2. Contacts        — leads / buyer enquiries
 *   3. Photo Log       — record of every uploaded photo (date, slug, filename)
 *   4. Price History   — every price change with date
 *
 * Prerequisites:
 *   - Same Google OAuth env vars as setup-drive-folders.js
 *   - googleapis package (already in api/package.json)
 *
 * Usage:
 *   node scripts/setup-listings-sheet.js
 *
 * The script is idempotent — if a sheet with the same name already exists
 * in the root folder it will print its ID rather than creating a duplicate.
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
const drive  = google.drive({ version: 'v3', auth });
const sheets = google.sheets({ version: 'v4', auth });

const SPREADSHEET_NAME = 'MalickLand — Listings Control Center';

/** Find an existing spreadsheet by name in the root Drive folder, or null. */
async function findSheet() {
  const res = await drive.files.list({
    q: `name='${SPREADSHEET_NAME}' and mimeType='application/vnd.google-apps.spreadsheet' and '${GOOGLE_DRIVE_FOLDER_ID}' in parents and trashed=false`,
    fields: 'files(id, name)',
    spaces: 'drive',
  });
  return res.data.files[0] || null;
}

/** Write header rows to each named sheet tab. */
async function writeHeaders(spreadsheetId) {
  const headerMap = {
    'Listings': [
      ['slug', 'address', 'city', 'state', 'zip', 'property_type', 'status', 'price', 'mls_number', 'listing_agent', 'photos_count', 'image_url', 'updated_at'],
    ],
    'Contacts': [
      ['name', 'email', 'phone', 'property_slug', 'message', 'source', 'received_at'],
    ],
    'Photo Log': [
      ['uploaded_at', 'property_slug', 'filename', 'size_kb', 'is_primary'],
    ],
    'Price History': [
      ['changed_at', 'property_slug', 'address', 'old_price', 'new_price', 'changed_by'],
    ],
  };

  const data = Object.entries(headerMap).map(([sheetTitle, values]) => ({
    range: `${sheetTitle}!A1`,
    values,
  }));

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: { valueInputOption: 'RAW', data },
  });
}

async function main() {
  console.log(`\nLooking for "${SPREADSHEET_NAME}" in Drive folder ${GOOGLE_DRIVE_FOLDER_ID}...\n`);

  const existing = await findSheet();
  if (existing) {
    console.log(`  ✓ Found existing spreadsheet: ${existing.id}`);
    console.log(`\nSet this in Railway:\n  GOOGLE_LISTINGS_SHEET_ID=${existing.id}\n`);
    return;
  }

  console.log('  ✚ Creating new spreadsheet...');
  const created = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title: SPREADSHEET_NAME },
      sheets: [
        { properties: { title: 'Listings' } },
        { properties: { title: 'Contacts' } },
        { properties: { title: 'Photo Log' } },
        { properties: { title: 'Price History' } },
      ],
    },
    fields: 'spreadsheetId',
  });

  const spreadsheetId = created.data.spreadsheetId;
  console.log(`  ✓ Created: ${spreadsheetId}`);

  // Move to the MalickLand root Drive folder
  await drive.files.update({
    fileId: spreadsheetId,
    addParents: GOOGLE_DRIVE_FOLDER_ID,
    removeParents: 'root',
    fields: 'id, parents',
  });
  console.log('  ✓ Moved to MalickLand Drive folder');

  // Write column headers
  await writeHeaders(spreadsheetId);
  console.log('  ✓ Header rows written to all tabs');

  console.log(`\nDone! Set this env var in Railway:\n  GOOGLE_LISTINGS_SHEET_ID=${spreadsheetId}\n`);
  console.log(`Open the sheet: https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit\n`);
}

main().catch(err => { console.error(err); process.exit(1); });
