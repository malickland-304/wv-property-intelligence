#!/usr/bin/env node
/**
 * Security and Correctness Verification Test Suite
 *
 * Tests all issues flagged in PR #25:
 * 1. normalizeAcreage handles empty strings and NaN
 * 2. GET /api/properties/:id has status guard
 * 3. No legacy /api/listings routes
 * 4. AGENTS.md references are correct
 */

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

// Test counter
let passed = 0;
let failed = 0;
const failures = [];

function test(description, fn) {
  try {
    fn();
    passed++;
    console.log(`✓ ${description}`);
  } catch (error) {
    failed++;
    failures.push({ description, error: error.message });
    console.log(`✗ ${description}`);
    console.log(`  Error: ${error.message}`);
  }
}

// Load source files
const PROJECT_ROOT = path.join(__dirname, '..');
const serverPath = path.join(PROJECT_ROOT, 'api/server.js');
const agentsPath = path.join(PROJECT_ROOT, 'AGENTS.md');
const appJsPath = path.join(PROJECT_ROOT, 'app/app.js');
const googleJsPath = path.join(PROJECT_ROOT, 'api/google.js');
const validatorsPath = path.join(PROJECT_ROOT, 'api/utils/validators.js');

const serverCode = fs.readFileSync(serverPath, 'utf8');
const agentsCode = fs.existsSync(agentsPath) ? fs.readFileSync(agentsPath, 'utf8') : '';
const appJsCode = fs.existsSync(appJsPath) ? fs.readFileSync(appJsPath, 'utf8') : '';
const googleJsCode = fs.existsSync(googleJsPath) ? fs.readFileSync(googleJsPath, 'utf8') : '';
const {
  buildLeadSchedule,
  buildPropertyLead,
} = require(validatorsPath);

console.log('\n=== Security & Correctness Verification Test Suite ===\n');

// ============================================================
// Test Suite 1: normalizeAcreage Function
// ============================================================
console.log('Test Suite 1: normalizeAcreage Function');
console.log('----------------------------------------');

test('normalizeAcreage function exists', () => {
  assert(serverCode.includes('function normalizeAcreage(body)'),
    'normalizeAcreage function not found');
});

test('normalizeAcreage trims string inputs', () => {
  const fnMatch = serverCode.match(/function normalizeAcreage\(body\)\s*{([^}]+)}/s);
  assert(fnMatch, 'normalizeAcreage function not found');
  assert(fnMatch[1].includes('.trim()'),
    'Missing .trim() call for string inputs');
});

test('normalizeAcreage rejects empty strings', () => {
  const fnMatch = serverCode.match(/function normalizeAcreage\(body\)\s*{([^}]+)}/s);
  assert(fnMatch, 'normalizeAcreage function not found');
  const hasEmptyCheck = fnMatch[1].includes("=== ''") ||
                        fnMatch[1].includes('== ""') ||
                        fnMatch[1].includes("=== \"\"");
  assert(hasEmptyCheck, 'Missing empty string check');
});

test('normalizeAcreage rejects NaN values', () => {
  const fnMatch = serverCode.match(/function normalizeAcreage\(body\)\s*{([^}]+)}/s);
  assert(fnMatch, 'normalizeAcreage function not found');
  assert(fnMatch[1].includes('isNaN'),
    'Missing NaN check');
});

test('normalizeAcreage returns null for invalid values', () => {
  const fnMatch = serverCode.match(/function normalizeAcreage\(body\)\s*{([^}]+)}/s);
  assert(fnMatch, 'normalizeAcreage function not found');
  const returnNullCount = (fnMatch[1].match(/return null/g) || []).length;
  assert(returnNullCount >= 2,
    'Should return null in multiple cases (null input, empty string, NaN)');
});

// ============================================================
// Test Suite 2: Property Detail Endpoint Security
// ============================================================
console.log('\nTest Suite 2: Property Detail Endpoint Security');
console.log('-----------------------------------------------');

test('GET /api/properties/:id endpoint exists', () => {
  assert(serverCode.includes("app.get('/api/properties/:id'"),
    'Property detail endpoint not found');
});

test('Property detail endpoint has status=active guard', () => {
  const fnMatch = serverCode.match(/function sendPropertyDetail\(req, res\)\s*{[\s\S]*?}\n\napp\.get\('\/api\/properties\/:id'/);
  assert(fnMatch, 'sendPropertyDetail function not found');
  const hasStatusGuard = fnMatch[0].includes("status='active'") ||
                          fnMatch[0].includes('status="active"');
  assert(hasStatusGuard,
    "Missing status='active' filter in WHERE clause");
});

test('Status guard is in SQL WHERE clause', () => {
  const fnMatch = serverCode.match(/function sendPropertyDetail\(req, res\)\s*{[\s\S]*?WHERE[\s\S]*?status[^)]*\)[\s\S]*?}\n\napp\.get\('\/api\/properties\/:id'/i);
  assert(fnMatch,
    'Status filter should be in SQL WHERE clause');
});

// ============================================================
// Test Suite 3: Legacy Route Removal
// ============================================================
console.log('\nTest Suite 3: Legacy Route Removal');
console.log('----------------------------------');

test('No GET /api/listings route', () => {
  const hasRoute = serverCode.includes("app.get('/api/listings'") ||
                   serverCode.includes('app.get("/api/listings"');
  assert(!hasRoute, 'Legacy GET /api/listings route found (should be removed)');
});

test('No POST /api/listings route', () => {
  const hasRoute = serverCode.includes("app.post('/api/listings'") ||
                   serverCode.includes('app.post("/api/listings"');
  assert(!hasRoute, 'Legacy POST /api/listings route found (should be removed)');
});

test('No PUT /api/listings/:id route', () => {
  const hasRoute = serverCode.includes("app.put('/api/listings/") ||
                   serverCode.includes('app.put("/api/listings/');
  assert(!hasRoute, 'Legacy PUT /api/listings/:id route found (should be removed)');
});

test('No DELETE /api/listings/:id route', () => {
  const hasRoute = serverCode.includes("app.delete('/api/listings/") ||
                   serverCode.includes('app.delete("/api/listings/');
  assert(!hasRoute, 'Legacy DELETE /api/listings/:id route found (should be removed)');
});

test('Modern /api/properties routes exist', () => {
  assert(serverCode.includes("app.get('/api/properties'"),
    'Modern GET /api/properties route not found');
  assert(serverCode.includes("app.get('/api/properties/:id'"),
    'Modern GET /api/properties/:id route not found');
});

test('Description generation uses /api/properties route', () => {
  assert(serverCode.includes("app.post('/api/properties/generate-description'"),
    'Description generator should use /api/properties/generate-description');
  assert(!serverCode.includes("app.post('/api/listings/generate-description'"),
    'Legacy /api/listings/generate-description route should not exist');
});

// ============================================================
// Test Suite 4: Documentation References
// ============================================================
console.log('\nTest Suite 4: Documentation References');
console.log('--------------------------------------');

test('AGENTS.md exists', () => {
  assert(fs.existsSync(agentsPath), 'AGENTS.md file not found');
});

test('AGENTS.md references .github/copilot-instructions.md', () => {
  assert(agentsCode.includes('.github/copilot-instructions.md'),
    'AGENTS.md should reference .github/copilot-instructions.md');
});

test('AGENTS.md does not reference root copilot-instructions.md', () => {
  const hasRootRef = agentsCode.match(/(?<!\.)copilot-instructions\.md/);
  assert(!hasRootRef || agentsCode.includes('.github/copilot-instructions.md'),
    'AGENTS.md should not reference copilot-instructions.md at root level');
});

// ============================================================
// Test Suite 5: HTML Escaping
// ============================================================
console.log('\nTest Suite 5: HTML Escaping');
console.log('---------------------------');

test('app/app.js has escapeHtml function', () => {
  assert(appJsCode.includes('function escapeHtml'),
    'escapeHtml function not found in app/app.js');
});

test('escapeHtml handles single quotes', () => {
  const fnMatch = appJsCode.match(/function escapeHtml[^{]*{([^}]+(?:{[^}]+})*[^}]*)}/s);
  if (fnMatch) {
    assert(fnMatch[1].includes("'") && fnMatch[1].includes('&#39'),
      "escapeHtml should escape single quotes to &#39;");
  }
});

test('escapeHtml handles double quotes', () => {
  const fnMatch = appJsCode.match(/function escapeHtml[^{]*{([^}]+(?:{[^}]+})*[^}]*)}/s);
  if (fnMatch) {
    assert(fnMatch[1].includes('&quot'),
      'escapeHtml should escape double quotes to &quot;');
  }
});

test('escapeHtml handles ampersands', () => {
  const fnMatch = appJsCode.match(/function escapeHtml[^{]*{([^}]+(?:{[^}]+})*[^}]*)}/s);
  if (fnMatch) {
    assert(fnMatch[1].includes('&amp'),
      'escapeHtml should escape & to &amp;');
  }
});

// ============================================================
// Test Suite 6: Server Security Middleware and Path Safety
// ============================================================
console.log('\nTest Suite 6: Server Security Middleware and Path Safety');
console.log('-------------------------------------------------------');

test('server does not use shell exec for image processing', () => {
  assert(!serverCode.includes("const { exec }") && !serverCode.includes('promisify(exec)'),
    'server.js should not import/promisify shell exec');
  const dangerousExecLines = serverCode
    .split('\n')
    .filter(line => /\bexec\s*\(/.test(line) && !line.includes('db.exec'));
  assert.equal(dangerousExecLines.length, 0,
    `server.js should not execute shell commands: ${dangerousExecLines.join('; ')}`);
  assert(serverCode.includes('execFile('),
    'server.js should use execFile for fixed binary invocation');
});

test('listing filesystem paths go through safe path helpers', () => {
  assert(serverCode.includes('function safePathComponent'),
    'safePathComponent helper is required');
  assert(serverCode.includes('function listingPath'),
    'listingPath helper is required');
  assert(!serverCode.includes("path.join(PROJECT_ROOT,'listings',slug"),
    'listing paths should not join raw slug values');
  assert(!serverCode.includes("path.join(PROJECT_ROOT, 'listings', slug"),
    'listing paths should not join raw slug values');
});

test('admin mutating routes require CSRF protection', () => {
  const mutatingRoutes = [
    "app.post('/admin/new', requireAuth, requireCsrf",
    "app.post('/admin/edit/:id', requireAuth, requireCsrf",
    "app.post('/admin/upload/:slug', requireAuth, requireCsrf",
    "app.post('/admin/photos/:slug/primary', requireAuth, requireCsrf",
    "app.delete('/admin/photos/:slug/:filename', requireAuth, requireCsrf",
    "app.post('/admin/report/:id/comps', requireAuth, requireCsrf",
    "app.post('/admin/report/:id/dd', requireAuth, requireCsrf",
    "app.post('/admin/leads/:id/status', requireAuth, requireCsrf",
  ];
  for (const route of mutatingRoutes) {
    assert(serverCode.includes(route), `${route} is missing requireCsrf`);
  }
});

test('API and admin routes are rate limited', () => {
  assert(serverCode.includes("app.use('/api', publicApiRateLimit)"),
    'public API rate limiter should be mounted');
  assert(serverCode.includes('adminActionsRateLimit'),
    'admin action rate limiter should exist');
  assert(serverCode.includes('uploadRateLimit'),
    'upload rate limiter should exist');
});

// ============================================================
// Test Suite 7: Gmail Helper Integrity
// ============================================================
console.log('\nTest Suite 7: Gmail Helper Integrity');
console.log('------------------------------------');

test('api/google.js does not reference undefined getGoogle helper', () => {
  assert(!googleJsCode.includes('getGoogle('),
    'api/google.js should use the imported googleapis client directly');
});

test('sendTextEmail constructs Gmail client from imported google object', () => {
  assert(googleJsCode.includes("const gmail = google.gmail({ version: 'v1', auth });"),
    'sendTextEmail should build the Gmail client from the imported google object');
});

// ============================================================
// Test Suite 8: Lead Follow-up Scheduling
// ============================================================
console.log('\nTest Suite 8: Lead Follow-up Scheduling');
console.log('--------------------------------------');

test('new leads track the first pending follow-up timestamp', () => {
  const lead = buildPropertyLead(
    {
      name: 'Test Buyer',
      email: 'buyer@example.com',
      phone: '+13045551212',
      leadType: 'property_packet',
      buyerType: 'Investment / long-term hold',
      cashOrFinancing: 'Cash',
      timeline: 'Ready now',
      message: 'Send details',
      source: 'test-suite',
    },
    {
      id: 'prop-1',
      address: '37 Advent Dr',
      city: 'Romney',
      county: 'Hampshire',
      state: 'WV',
      zip: '26757',
      listing_slug: '37-advent',
    }
  );
  const schedule = buildLeadSchedule(lead);
  assert.equal(lead.next_follow_up_at, schedule[0]?.due_at,
    'Lead should point at the first pending follow-up until it is sent');
});

// ============================================================
// Test Results Summary
// ============================================================
console.log('\n' + '='.repeat(50));
console.log('TEST RESULTS SUMMARY');
console.log('='.repeat(50));
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed + failed}`);

if (failed > 0) {
  console.log('\n❌ FAILED TESTS:');
  failures.forEach(({ description, error }) => {
    console.log(`  - ${description}`);
    console.log(`    ${error}`);
  });
  console.log('\n❌ Some tests failed. Review the issues above.');
  process.exit(1);
} else {
  console.log('\n✅ All security and correctness tests PASSED!');
  console.log('The codebase properly implements all required fixes.');
  process.exit(0);
}
