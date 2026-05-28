#!/usr/bin/env node
/**
 * Security and Correctness Verification Test Suite
 *
 * Updated 2026-05-27: refactored from monolithic server.js to route modules.
 * Tests now check api/routes/api.js, api/routes/admin.js, and api/helpers.js
 * in addition to server.js and app/app.js.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

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

const PROJECT_ROOT     = path.join(__dirname, '..');
const serverPath       = path.join(PROJECT_ROOT, 'api/server.js');
const apiRoutesPath    = path.join(PROJECT_ROOT, 'api/routes/api.js');
const adminRoutesPath  = path.join(PROJECT_ROOT, 'api/routes/admin.js');
const publicRoutesPath = path.join(PROJECT_ROOT, 'api/routes/public.js');
const helpersPath      = path.join(PROJECT_ROOT, 'api/helpers.js');
const agentsPath       = path.join(PROJECT_ROOT, 'AGENTS.md');
const appJsPath        = path.join(PROJECT_ROOT, 'app/app.js');
const googleJsPath     = path.join(PROJECT_ROOT, 'api/google.js');
const validatorsPath   = path.join(PROJECT_ROOT, 'api/utils/validators.js');

const serverCode       = fs.readFileSync(serverPath, 'utf8');
const apiRoutesCode    = fs.readFileSync(apiRoutesPath, 'utf8');
const adminRoutesCode  = fs.readFileSync(adminRoutesPath, 'utf8');
const publicRoutesCode = fs.readFileSync(publicRoutesPath, 'utf8');
const helpersCode      = fs.readFileSync(helpersPath, 'utf8');
const agentsCode       = fs.existsSync(agentsPath) ? fs.readFileSync(agentsPath, 'utf8') : '';
const appJsCode        = fs.existsSync(appJsPath) ? fs.readFileSync(appJsPath, 'utf8') : '';
const googleJsCode     = fs.existsSync(googleJsPath) ? fs.readFileSync(googleJsPath, 'utf8') : '';
const {
  buildLeadSchedule,
  buildPropertyLead,
} = require(validatorsPath);

console.log('\n=== Security & Correctness Verification Test Suite ===\n');

// ============================================================
// Test Suite 1: normalizeAcreage Function (api/helpers.js)
// ============================================================
console.log('Test Suite 1: normalizeAcreage Function');
console.log('----------------------------------------');

test('normalizeAcreage function exists in helpers.js', () => {
  assert(helpersCode.includes('function normalizeAcreage(body)'),
    'normalizeAcreage function not found in api/helpers.js');
});

test('normalizeAcreage trims string inputs', () => {
  const fnMatch = helpersCode.match(/function normalizeAcreage\(body\)\s*\{([\s\S]*?)\n\}/);
  assert(fnMatch, 'normalizeAcreage function body not found');
  assert(fnMatch[1].includes('.trim()'),
    'Missing .trim() call for string inputs');
});

test('normalizeAcreage rejects empty strings', () => {
  const fnMatch = helpersCode.match(/function normalizeAcreage\(body\)\s*\{([\s\S]*?)\n\}/);
  assert(fnMatch, 'normalizeAcreage function body not found');
  const hasEmptyCheck = fnMatch[1].includes("=== ''") ||
                        fnMatch[1].includes("=== \"\"");
  assert(hasEmptyCheck, 'Missing empty string check');
});

test('normalizeAcreage rejects NaN values', () => {
  const fnMatch = helpersCode.match(/function normalizeAcreage\(body\)\s*\{([\s\S]*?)\n\}/);
  assert(fnMatch, 'normalizeAcreage function body not found');
  assert(fnMatch[1].includes('isNaN') || fnMatch[1].includes('Number.isNaN'),
    'Missing NaN check');
});

test('normalizeAcreage returns null for invalid values', () => {
  const fnMatch = helpersCode.match(/function normalizeAcreage\(body\)\s*\{([\s\S]*?)\n\}/);
  assert(fnMatch, 'normalizeAcreage function body not found');
  const returnNullCount = (fnMatch[1].match(/return null/g) || []).length;
  assert(returnNullCount >= 2,
    'Should return null in multiple cases (null input, empty string, NaN)');
});

// ============================================================
// Test Suite 2: Property Detail Endpoint Security (api/routes/api.js)
// ============================================================
console.log('\nTest Suite 2: Property Detail Endpoint Security');
console.log('-----------------------------------------------');

test('sendPropertyDetail function exists in routes/api.js', () => {
  assert(apiRoutesCode.includes('function sendPropertyDetail(req, res)'),
    'sendPropertyDetail function not found in api/routes/api.js');
});

test('Property detail route is registered in routes/api.js', () => {
  assert(
    apiRoutesCode.includes("router.get('/properties/:id'") ||
    apiRoutesCode.includes('router.get("/properties/:id"'),
    'GET /properties/:id route not found in routes/api.js');
});

test('Property detail endpoint has status=active guard', () => {
  const fnStart = apiRoutesCode.indexOf('function sendPropertyDetail(');
  assert(fnStart !== -1, 'sendPropertyDetail function not found in routes/api.js');
  const fnEnd = apiRoutesCode.indexOf('\nrouter.get(', fnStart);
  const fnBody = fnEnd !== -1 ? apiRoutesCode.slice(fnStart, fnEnd) : apiRoutesCode.slice(fnStart, fnStart + 600);
  const hasStatusGuard =
    fnBody.includes("p.status='active'") ||
    fnBody.includes('p.status="active"') ||
    fnBody.includes("status='active'") ||
    fnBody.includes('status="active"');
  assert(hasStatusGuard,
    "Missing status='active' filter in sendPropertyDetail in routes/api.js");
});

test('Status guard is in SQL WHERE clause', () => {
  const fnStart = apiRoutesCode.indexOf('function sendPropertyDetail(');
  assert(fnStart !== -1, 'sendPropertyDetail function not found in routes/api.js');
  const fnEnd = apiRoutesCode.indexOf('\nrouter.get(', fnStart);
  const fnBody = fnEnd !== -1 ? apiRoutesCode.slice(fnStart, fnEnd) : apiRoutesCode.slice(fnStart, fnStart + 600);
  assert(
    /WHERE[\s\S]{0,300}status\s*=\s*'active'/i.test(fnBody),
    "status='active' filter should appear in sendPropertyDetail's SQL WHERE clause"
  );
});

// ============================================================
// Test Suite 3: Legacy Route Removal
// ============================================================
console.log('\nTest Suite 3: Legacy Route Removal');
console.log('----------------------------------');

test('server.js has no direct app.post /api/listings route', () => {
  assert(!serverCode.includes("app.post('/api/listings'") &&
         !serverCode.includes('app.post("/api/listings"'),
    'Legacy POST /api/listings route found in server.js (should be in routes/api.js)');
});

test('server.js has no direct app.put /api/listings/:id route', () => {
  assert(!serverCode.includes("app.put('/api/listings/") &&
         !serverCode.includes('app.put("/api/listings/'),
    'Legacy PUT /api/listings/:id route found in server.js');
});

test('server.js has no direct app.delete /api/listings/:id route', () => {
  assert(!serverCode.includes("app.delete('/api/listings/") &&
         !serverCode.includes('app.delete("/api/listings/'),
    'Legacy DELETE /api/listings/:id route found in server.js');
});

test('routes/api.js has no mounted router.post /listings route', () => {
  assert(!apiRoutesCode.includes("router.post('/listings'") &&
         !apiRoutesCode.includes('router.post("/listings"'),
    'Legacy POST /listings route found in routes/api.js (should use /properties)');
});

test('routes/api.js has no mounted router.put /listings/:id route', () => {
  assert(!apiRoutesCode.includes("router.put('/listings/") &&
         !apiRoutesCode.includes('router.put("/listings/'),
    'Legacy PUT /listings/:id route found in routes/api.js');
});

test('routes/api.js has no mounted router.delete /listings/:id route', () => {
  assert(!apiRoutesCode.includes("router.delete('/listings/") &&
         !apiRoutesCode.includes('router.delete("/listings/'),
    'Legacy DELETE /listings/:id route found in routes/api.js');
});

test('routes/api.js registers GET /properties (modern route)', () => {
  assert(
    apiRoutesCode.includes("router.get('/properties'") ||
    apiRoutesCode.includes('router.get("/properties"'),
    'Modern GET /properties route not found in routes/api.js');
});

test('Description generation uses /properties/generate-description route', () => {
  assert(
    apiRoutesCode.includes("router.post('/properties/generate-description'") ||
    apiRoutesCode.includes('router.post("/properties/generate-description"'),
    'Description generator route not found in routes/api.js');
  assert(
    !apiRoutesCode.includes("router.post('/listings/generate-description'") &&
    !apiRoutesCode.includes('router.post("/listings/generate-description"'),
    'Legacy /listings/generate-description route should not exist');
});

// ============================================================
// Test Suite 4: Documentation References
// ============================================================
console.log('\nTest Suite 4: Documentation References');
console.log('--------------------------------------');

test('AGENTS.md exists', () => {
  assert(fs.existsSync(agentsPath), 'AGENTS.md file not found');
});

test('AGENTS.md defines a Repository Authority Rule', () => {
  assert(agentsCode.includes('Repository Authority Rule'),
    'AGENTS.md should define a Repository Authority Rule');
});

test('AGENTS.md references docs/agent-handoff.md', () => {
  assert(agentsCode.includes('docs/agent-handoff.md'),
    'AGENTS.md should reference docs/agent-handoff.md');
});

test('AGENTS.md defines Verification Truthfulness Rule', () => {
  assert(agentsCode.includes('Verification Truthfulness Rule'),
    'AGENTS.md should contain Verification Truthfulness Rule');
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

test('escapeHtml handles ampersands', () => {
  const fnMatch = appJsCode.match(/function escapeHtml[^{]*\{([\s\S]*?)\n\}/);
  assert(fnMatch, 'escapeHtml function body not found');
  assert(fnMatch[1].includes('&amp'),
    'escapeHtml should escape & to &amp;');
});

test('escapeHtml handles angle brackets', () => {
  const fnMatch = appJsCode.match(/function escapeHtml[^{]*\{([\s\S]*?)\n\}/);
  assert(fnMatch, 'escapeHtml function body not found');
  assert(fnMatch[1].includes('&lt') || fnMatch[1].includes('&gt'),
    'escapeHtml should escape < and >');
});

test('escapeHtml handles double quotes', () => {
  const fnMatch = appJsCode.match(/function escapeHtml[^{]*\{([\s\S]*?)\n\}/);
  assert(fnMatch, 'escapeHtml function body not found');
  assert(fnMatch[1].includes('&quot'),
    'escapeHtml should escape " to &quot;');
});

test('escapeHtml handles single quotes and apostrophes', () => {
  const fnMatch = appJsCode.match(/function escapeHtml[^{]*\{([\s\S]*?)\n\}/);
  assert(fnMatch, 'escapeHtml function body not found');
  assert(fnMatch[1].includes('&#39') || fnMatch[1].includes('&apos'),
    "escapeHtml should escape ' to &#39; or &apos;");
});

// ============================================================
// Test Suite 6: Server Security Middleware and Path Safety
// ============================================================
console.log('\nTest Suite 6: Server Security Middleware and Path Safety');
console.log('-------------------------------------------------------');

test('server.js does not use shell exec or execFile directly', () => {
  const dangerousLines = serverCode
    .split('\n')
    .filter(line => /\bexec\s*\(|\bexecFile\s*\(/.test(line) && !line.includes('db.exec'));
  assert.equal(dangerousLines.length, 0,
    `server.js should not execute shell commands: ${dangerousLines.join('; ')}`);
});

test('admin.js uses sharp for image processing (not shell exec)', () => {
  assert(adminRoutesCode.includes('sharp'),
    'admin.js should use sharp for image processing');
  const dangerousExecLines = adminRoutesCode
    .split('\n')
    .filter(line =>
      /\bexec\s*\(|\bexecFile\s*\(|require\(['"]child_process['"]\)/.test(line) &&
      !line.includes('db.exec')
    );
  assert.equal(dangerousExecLines.length, 0,
    `admin.js should not use exec, execFile, or child_process: ${dangerousExecLines.join('; ')}`);
});

test('listing filesystem paths use isSafePathComponent in admin.js', () => {
  assert(adminRoutesCode.includes('isSafePathComponent'),
    'isSafePathComponent helper should be used in admin.js');
});

test('safeListingPath or safePathComponent is used for listing file paths in helpers.js', () => {
  assert(helpersCode.includes('function safeListingPath') ||
         helpersCode.includes('function isSafePathComponent'),
    'Path safety helpers must be defined in api/helpers.js');
});

test('admin mutating routes require CSRF in routes/admin.js', () => {
  const mutatingRoutes = [
    "router.post('/new'",
    "router.post('/edit/:id'",
    "router.post('/upload/:slug'",
    "router.post('/photos/:slug/primary'",
    "router.delete('/photos/:slug/:filename'",
    "router.post('/report/:id/comps'",
    "router.post('/report/:id/dd'",
    "router.post('/ai/:id'",
  ];
  for (const route of mutatingRoutes) {
    const routeLineIdx = adminRoutesCode.split('\n').findIndex(l => l.includes(route));
    assert(routeLineIdx >= 0, `Route ${route} not found in routes/admin.js`);
    const routeLine = adminRoutesCode.split('\n')[routeLineIdx];
    assert(routeLine.includes('requireCsrf'),
      `${route} is missing requireCsrf in routes/admin.js`);
  }
});

test('API routes use publicReadRateLimit in routes/api.js', () => {
  const rateLimitedRoutes = [
    "router.get('/properties'",
    "router.get('/properties/:id'",
    "router.get('/analytics'",
  ];
  for (const route of rateLimitedRoutes) {
    const routeLine = apiRoutesCode.split('\n').find(l => l.includes(route));
    assert(routeLine && routeLine.includes('publicReadRateLimit'),
      `${route} is missing publicReadRateLimit in routes/api.js`);
  }
});

test('contacts route uses contactsRateLimit in routes/api.js', () => {
  const routeLine = apiRoutesCode.split('\n').find(l => l.includes("router.post('/contacts'"));
  assert(routeLine && routeLine.includes('contactsRateLimit'),
    "POST /contacts is missing contactsRateLimit in routes/api.js");
});

test('admin routes use adminActionRateLimit in routes/admin.js', () => {
  assert(adminRoutesCode.includes('adminActionRateLimit'),
    'adminActionRateLimit should be used in routes/admin.js');
});

test('upload route uses uploadRateLimit in routes/admin.js', () => {
  const routeLine = adminRoutesCode.split('\n').find(l =>
    l.includes("router.post('/upload/:slug'"));
  assert(routeLine && routeLine.includes('uploadRateLimit'),
    "POST /upload/:slug is missing uploadRateLimit in routes/admin.js");
});

test('public property-page routes use publicReadRateLimit in routes/public.js', () => {
  // Checks the array-notation route: router.get(['/listing/:id', '/properties/:id'], publicReadRateLimit, ...)
  const routeLine = publicRoutesCode.split('\n').find(l =>
    l.includes("'/listing/:id'") || l.includes('"/listing/:id"'));
  assert(routeLine, "Public property-page route (/listing/:id) not found in routes/public.js");
  assert(routeLine.includes('publicReadRateLimit'),
    "Public property-page routes (/listing/:id, /properties/:id) are missing publicReadRateLimit in routes/public.js");
});

// ============================================================
// Test Suite 7: Gmail Helper Integrity (api/google.js)
// ============================================================
console.log('\nTest Suite 7: Gmail Helper Integrity');
console.log('------------------------------------');

test('api/google.js does not import the googleapis SDK', () => {
  assert(!googleJsCode.includes("require('googleapis')") &&
         !googleJsCode.includes('require("googleapis")'),
    'api/google.js should use raw HTTPS, not the googleapis SDK');
});

test('api/google.js uses raw HTTPS for Gmail API calls', () => {
  assert(
    /hostname:\s*['"]gmail\.googleapis\.com['"]/.test(googleJsCode),
    "api/google.js should use hostname: 'gmail.googleapis.com' in https.request options"
  );
});

test('api/google.js uses raw HTTPS for Google Drive calls', () => {
  assert(
    /hostname:\s*['"]www\.googleapis\.com['"]/.test(googleJsCode),
    "api/google.js should use hostname: 'www.googleapis.com' in https.request options"
  );
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
// Test Suite 9: Governance Files Present
// ============================================================
console.log('\nTest Suite 9: Governance Files Present');
console.log('--------------------------------------');

const govFiles = [
  'AGENTS.md', 'ARCHITECTURE.md', 'DECISIONS.md',
  'TASKS.md', 'PROJECT_STATE.md', 'QA_CHECKLIST.md',
  'SECURITY.md', 'WORK_LOG.md',
];
for (const f of govFiles) {
  test(`${f} exists`, () => {
    assert(fs.existsSync(path.join(PROJECT_ROOT, f)), `${f} is missing from repository root`);
  });
}

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
  process.exit(0);
}
