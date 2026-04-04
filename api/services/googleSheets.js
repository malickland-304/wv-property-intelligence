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
    const val = listing[k] ?? listing[k.replace('lot_acres','acreage')] ?? '';
    return val === null || val === undefined ? '' : String(val);
  });
}

function leadToRow(lead) {
  return LEADS_COLS.map(k => {
    const val = lead[k] ?? '';
    return val === null || val === undefined ? '' : String(val);
  });
}

async function getAllRows(sheets, spreadsheetId, range) {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  return res.data.values || [];
}

// ── Listings ──────────────────────────────────────────────
async function appendListing(listing) {
  const sheets = getSheetsClient();
  if (!sheets) return null;
  const sid = process.env.LISTINGS_SHEET_ID;
  if (!sid) return null;

  await sheets.spreadsheets.values.append({
    spreadsheetId: sid,
    range: 'Sheet1!A:K',
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [listingToRow(listing)] },
  });
  return true;
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
  return Object.fromEntries(LISTINGS_COLS.map((k, i) => [k, row[i] ?? '']));
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
  const sheets = getSheetsClient();
  if (!sheets) return null;
  const sid = process.env.LEADS_SHEET_ID;
  if (!sid) return null;

  await sheets.spreadsheets.values.append({
    spreadsheetId: sid,
    range: 'Sheet1!A:G',
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [leadToRow(lead)] },
  });
  return true;
}

module.exports = { appendListing, updateListing, getListing, getLeads, appendLead };
