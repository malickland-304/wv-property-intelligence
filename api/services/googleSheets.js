'use strict';

/**
 * Google Sheets sync service.
 * Auth: GOOGLE_SERVICE_ACCOUNT_KEY env var (full JSON string).
 * Sheet: LISTINGS_SHEET_ID env var.
 * No-ops silently if either var is missing.
 */

const { google } = require('googleapis');

const SHEET_ID = process.env.LISTINGS_SHEET_ID;

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw || !SHEET_ID) return null;
  try {
    const key = JSON.parse(raw);
    return new google.auth.GoogleAuth({
      credentials: key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  } catch (e) {
    console.error('[googleSheets] Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY:', e.message);
    return null;
  }
}

async function getSheets() {
  const auth = getAuth();
  if (!auth) return null;
  const client = await auth.getClient();
  return google.sheets({ version: 'v4', auth: client });
}

const LISTING_HEADERS = [
  'id','address','city','county','price','lot_acres',
  'property_type','status','slug','description','image_url','listed_at',
];

const LEAD_HEADERS = [
  'id','name','email','phone','property_id','message','created_at',
];

async function ensureHeaders(sheets, tab, headers) {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${tab}!A1:1`,
    });
    if (!res.data.values || res.data.values.length === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${tab}!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: [headers] },
      });
    }
  } catch (e) {
    // Tab may not exist yet — ignore
  }
}

/**
 * Find the row index (1-based) of a listing by id, or null.
 */
async function findListingRow(sheets, id) {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'Listings!A:A',
    });
    const rows = res.data.values || [];
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] === String(id)) return i + 1; // 1-based sheet row
    }
  } catch (_) {}
  return null;
}

/**
 * Append a new listing row. Called after INSERT.
 */
async function appendListing(listing) {
  try {
    const sheets = await getSheets();
    if (!sheets) return;
    await ensureHeaders(sheets, 'Listings', LISTING_HEADERS);
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: 'Listings!A:L',
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [[
          listing.id,
          listing.address,
          listing.city,
          listing.county || '',
          listing.price || '',
          listing.acreage || listing.lot_acres || '',
          listing.property_type || '',
          listing.status || '',
          listing.listing_slug || listing.slug || '',
          listing.marketing_description || listing.description || '',
          listing.image_url || '',
          listing.listed_at || new Date().toISOString(),
        ]],
      },
    });
  } catch (e) {
    console.error('[googleSheets] appendListing error:', e.message);
  }
}

/**
 * Update an existing listing row by id. Called after UPDATE.
 * If not found, appends as new row.
 */
async function updateListing(id, listing) {
  try {
    const sheets = await getSheets();
    if (!sheets) return;
    await ensureHeaders(sheets, 'Listings', LISTING_HEADERS);
    const row = await findListingRow(sheets, id);
    const values = [[
      String(id),
      listing.address,
      listing.city,
      listing.county || '',
      listing.price || '',
      listing.acreage || listing.lot_acres || '',
      listing.property_type || '',
      listing.status || '',
      listing.listing_slug || listing.slug || '',
      listing.marketing_description || listing.description || '',
      listing.image_url || '',
      listing.listed_at || '',
    ]];
    if (row) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `Listings!A${row}:L${row}`,
        valueInputOption: 'RAW',
        requestBody: { values },
      });
    } else {
      await appendListing(listing);
    }
  } catch (e) {
    console.error('[googleSheets] updateListing error:', e.message);
  }
}

/**
 * Append a new lead row. Called after contact form submission.
 */
async function appendLead(lead) {
  try {
    const sheets = await getSheets();
    if (!sheets) return;
    await ensureHeaders(sheets, 'Leads', LEAD_HEADERS);
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: 'Leads!A:G',
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [[
          lead.id || '',
          lead.name || '',
          lead.email || '',
          lead.phone || '',
          lead.property_id || '',
          lead.message || '',
          lead.created_at || new Date().toISOString(),
        ]],
      },
    });
  } catch (e) {
    console.error('[googleSheets] appendLead error:', e.message);
  }
}

module.exports = { appendListing, updateListing, appendLead };
