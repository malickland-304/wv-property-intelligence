'use strict';

/**
 * services/googleSheets.js — Google Sheets integration for listings and leads.
 *
 * Auth (in priority order):
 *   1. GOOGLE_SERVICE_ACCOUNT_KEY env var — JSON string of service account credentials
 *   2. GOOGLE_APPLICATION_CREDENTIALS env var — path to service account JSON file
 *
 * Required env vars:
 *   LISTINGS_SHEET_ID  – Spreadsheet ID for property listings
 *   LEADS_SHEET_ID     – Spreadsheet ID for leads/contacts
 *
 * Sheet column order:
 *   Listings: id, address, city, county, price, lot_acres, property_type, status, description, image_url, listed_at
 *   Leads:    id, name, email, phone, property_id, message, created_at
 */

const { google } = require('googleapis');
const fs         = require('fs');

const LISTINGS_COLS = ['id','address','city','county','price','lot_acres','property_type','status','description','image_url','listed_at'];
const LEADS_COLS    = ['id','name','email','phone','property_id','message','created_at'];
const CONTACT_COLS  = ['id','name','email','phone','message','listingId','listingTitle','createdDate'];
const CAPTURE_COLS  = [
  'timestamp',
  'lead_id',
  'listing_slug',
  'property_address',
  'lead_type',
  'name',
  'phone',
  'email',
  'buyer_intent',
  'financing_type',
  'timeline',
  'message',
  'sms_consent',
  'source',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'status',
  'next_follow_up_at',
];

// ── Auth ──────────────────────────────────────────────────
function getAuth() {
  const keyStr = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (keyStr) {
    const credentials = JSON.parse(keyStr);
    return new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  }

  const { GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY } = process.env;
  if (GOOGLE_SERVICE_ACCOUNT_EMAIL && GOOGLE_PRIVATE_KEY) {
    return new google.auth.GoogleAuth({
      credentials: {
        type: 'service_account',
        client_email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  }

  const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (keyFile && fs.existsSync(keyFile)) {
    return new google.auth.GoogleAuth({
      keyFile,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  }

  return null;
}

function getSheetsClient() {
  const auth = getAuth();
  if (!auth) return null;
  return google.sheets({ version: 'v4', auth });
}

// ── Helpers ───────────────────────────────────────────────
function listingToRow(listing) {
  return LISTINGS_COLS.map(k => {
    const val = listing[k] ?? (k === 'image_url' ? listing.imageUrls : undefined) ?? listing[k.replace('lot_acres','acreage')] ?? '';
    return val === null || val === undefined ? '' : String(val);
  });
}

function leadToRow(lead) {
  return LEADS_COLS.map(k => {
    const val = lead[k] ?? '';
    return val === null || val === undefined ? '' : String(val);
  });
}

function captureLeadToRow(lead) {
  return CAPTURE_COLS.map(k => {
    const val = lead[k] ?? '';
    return val === null || val === undefined ? '' : String(val);
  });
}

function contactToRow(contact) {
  return CONTACT_COLS.map(k => {
    const val = contact[k] ?? '';
    return val === null || val === undefined ? '' : String(val);
  });
}

async function getAllRows(sheets, spreadsheetId, range) {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  return res.data.values || [];
}

async function appendValues({ spreadsheetId, range, values }) {
  const sheets = getSheetsClient();
  if (!sheets || !spreadsheetId || !range) return null;

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values },
  });
  return true;
}

// ── Listings ──────────────────────────────────────────────
async function appendListing(listing) {
  const sid = process.env.LISTINGS_SHEET_ID;
  return appendValues({ spreadsheetId: sid, range: 'Sheet1!A:K', values: [listingToRow(listing)] });
}

async function getAllListings() {
  const sheets = getSheetsClient();
  if (!sheets) return [];
  const sid = process.env.LISTINGS_SHEET_ID;
  if (!sid) return [];

  const rows = await getAllRows(sheets, sid, 'Sheet1!A:K');
  return rows.map(row => {
    const listing = Object.fromEntries(LISTINGS_COLS.map((k, i) => [k, row[i] ?? '']));
    listing.imageUrls = listing.image_url || '';
    return listing;
  });
}

async function updateListing(id, listing) {
  const sheets = getSheetsClient();
  if (!sheets) return null;
  const sid = process.env.LISTINGS_SHEET_ID;
  if (!sid) return null;

  const rows = await getAllRows(sheets, sid, 'Sheet1!A:K');
  const rowIdx = rows.findIndex(r => r[0] === String(id));
  if (rowIdx === -1) return null;

  const sheetRow = rowIdx + 1; // 1-indexed
  await sheets.spreadsheets.values.update({
    spreadsheetId: sid,
    range: `Sheet1!A${sheetRow}:K${sheetRow}`,
    valueInputOption: 'RAW',
    requestBody: { values: [listingToRow({ ...Object.fromEntries(LISTINGS_COLS.map((k,i) => [k, rows[rowIdx][i]])), ...listing })] },
  });
  return true;
}

async function getListing(id) {
  const sheets = getSheetsClient();
  if (!sheets) return null;
  const sid = process.env.LISTINGS_SHEET_ID;
  if (!sid) return null;

  const rows = await getAllRows(sheets, sid, 'Sheet1!A:K');
  const row  = rows.find(r => r[0] === String(id));
  if (!row) return null;
  const listing = Object.fromEntries(LISTINGS_COLS.map((k, i) => [k, row[i] ?? '']));
  listing.imageUrls = listing.image_url || '';
  return listing;
}

// ── Leads ─────────────────────────────────────────────────
async function getLeads() {
  const sheets = getSheetsClient();
  if (!sheets) return [];
  const sid = process.env.LEADS_SHEET_ID;
  if (!sid) return [];

  const rows = await getAllRows(sheets, sid, 'Sheet1!A:G');
  return rows.map(row => Object.fromEntries(LEADS_COLS.map((k, i) => [k, row[i] ?? ''])));
}

async function appendLead(lead) {
  const sid = process.env.LEADS_SHEET_ID;
  return appendValues({ spreadsheetId: sid, range: 'Sheet1!A:G', values: [leadToRow(lead)] });
}

function isLeadCaptureConfigured() {
  return Boolean(
    getAuth() &&
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID &&
    process.env.GOOGLE_SHEETS_LEADS_TAB
  );
}

async function append37AdventLead(lead) {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  const tabName = process.env.GOOGLE_SHEETS_LEADS_TAB;
  if (!spreadsheetId || !tabName) return null;

  return appendValues({
    spreadsheetId,
    range: `${tabName}!A:S`,
    values: [captureLeadToRow(lead)],
  });
}

async function appendPropertyLead(lead) {
  return append37AdventLead(lead);
}

async function saveContact(contact) {
  const spreadsheetId = process.env.CONTACTS_SHEET_ID || process.env.LEADS_SHEET_ID || process.env.LISTINGS_SHEET_ID;
  return appendValues({ spreadsheetId, range: 'Contacts!A:H', values: [contactToRow(contact)] });
}

module.exports = {
  appendListing,
  getAllListings,
  updateListing,
  getListing,
  getLeads,
  appendLead,
  append37AdventLead,
  appendPropertyLead,
  saveContact,
  appendValues,
  isLeadCaptureConfigured,
};
