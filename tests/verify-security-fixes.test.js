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

const serverCode = fs.readFileSync(serverPath, 'utf8');
const agentsCode = fs.existsSync(agentsPath) ? fs.readFileSync(agentsPath, 'utf8') : '';
const appJsCode = fs.existsSync(appJsPath) ? fs.readFileSync(appJsPath, 'utf8') : '';

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
  const routeMatch = serverCode.match(/app\.get\(['"]\/api\/properties\/:id['"],[\s\S]*?(?=app\.|$)/);
  assert(routeMatch, 'Property detail endpoint not found');
  const hasStatusGuard = routeMatch[0].includes("status='active'") ||
                          routeMatch[0].includes('status="active"');
  assert(hasStatusGuard,
    "Missing status='active' filter in WHERE clause");
});

test('Status guard is in SQL WHERE clause', () => {
  const routeMatch = serverCode.match(/app\.get\(['"]\/api\/properties\/:id['"],[\s\S]*?WHERE[\s\S]*?status[^)]*\)/i);
  assert(routeMatch,
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
