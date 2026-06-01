'use strict';

function isLeadCaptureConfigured() {
  return Boolean(process.env.GOOGLE_SHEETS_ID || process.env.GOOGLE_SHEET_ID);
}

async function append37AdventLead() {
  return false;
}

async function appendPropertyLead() {
  return false;
}

module.exports = {
  append37AdventLead,
  appendPropertyLead,
  isLeadCaptureConfigured,
};
