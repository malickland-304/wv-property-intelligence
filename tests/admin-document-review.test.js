#!/usr/bin/env node
'use strict';

const assert = require('assert');
const childProcess = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const API_DIR = path.join(ROOT, 'api');
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'wv-admin-doc-review-'));
const DB_PATH = path.join(TMP_DIR, 'admin-review.db');
const ADMIN_PASSWORD = 'admin-document-review-password';
const PROPERTY_ID = 'admin-review-property';
const Database = require(path.join(API_DIR, 'node_modules', 'better-sqlite3'));

let server = null;
let testDb = null;
let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed++;
      console.log(`✓ ${name}`);
    })
    .catch((err) => {
      failed++;
      failures.push(`${name}: ${err.message}`);
      console.log(`✗ ${name}`);
      console.log(`  Error: ${err.message}`);
    });
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const probe = http.createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth(baseUrl, getLog) {
  const deadline = Date.now() + 15000;
  let lastError = null;
  while (Date.now() < deadline) {
    if (server.exitCode != null) {
      throw new Error(`server exited early with code ${server.exitCode}\n${getLog()}`);
    }
    try {
      const res = await fetch(`${baseUrl}/api/health`);
      if (res.ok) return;
      lastError = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastError = err;
    }
    await delay(250);
  }
  throw new Error(`server did not become healthy: ${lastError && lastError.message}\n${getLog()}`);
}

function cookieFrom(res) {
  const raw = res.headers.get('set-cookie');
  assert(raw, 'expected set-cookie header');
  return raw.split(';')[0];
}

async function login(baseUrl) {
  const res = await fetch(`${baseUrl}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ password: ADMIN_PASSWORD }),
    redirect: 'manual',
  });
  assert.strictEqual(res.status, 302);
  assert.strictEqual(res.headers.get('location'), '/admin');
  return cookieFrom(res);
}

function seedReviewData() {
  const county = testDb.prepare("SELECT id FROM counties WHERE name='Hampshire'").get();
  testDb.prepare(`
    INSERT INTO properties (id, county_id, address, city, property_type, status, listing_slug)
    VALUES (?, ?, ?, ?, 'land', 'draft', ?)
  `).run(PROPERTY_ID, county.id, 'Admin Review Road', 'Romney', 'admin-review-road');

  testDb.prepare(`
    INSERT INTO documents (
      id, property_id, title, document_type, source_provider, source_uri, status, created_by
    ) VALUES (?, ?, ?, ?, 'manual', ?, 'draft', 'test-suite')
  `).run('doc_admin_review', PROPERTY_ID, 'Admin Review Tax Card', 'tax_card', 'manual://hidden-tax-card.pdf');

  testDb.prepare(`
    INSERT INTO document_versions (
      id, document_id, version_number, file_name, sha256, storage_uri, approval_status
    ) VALUES (?, ?, 1, ?, ?, ?, 'pending_review')
  `).run(
    'ver_admin_review',
    'doc_admin_review',
    'hidden-tax-card.pdf',
    'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    'manual://hidden-storage-tax-card.pdf'
  );

  testDb.prepare(`
    INSERT INTO extracted_claims (
      id, document_id, document_version_id, property_id, claim_type, claim_value_json,
      source_quote, source_location_json, confidence, status
    ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, 0.93, 'pending_review')
  `).run(
    'claim_admin_parcel',
    'doc_admin_review',
    'ver_admin_review',
    'parcel_id',
    JSON.stringify('14-09-012B-0096-0000'),
    'Parcel 14-09-012B-0096-0000',
    JSON.stringify({ page: 2, section: 'Tax parcel' })
  );

  testDb.prepare(`
    INSERT INTO extracted_claims (
      id, document_id, document_version_id, property_id, claim_type, claim_value_json,
      source_quote, source_location_json, confidence, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0.72, 'pending_review')
  `).run(
    'claim_admin_xss',
    'doc_admin_review',
    'ver_admin_review',
    PROPERTY_ID,
    '<script>alert("type")</script>&',
    JSON.stringify({ foo: '<script>alert("value")</script>&"&' }),
    '<script>alert("quote")</script>&',
    JSON.stringify({ page: '<script>1</script>&' })
  );

  testDb.prepare(`
    INSERT INTO extracted_claims (
      id, document_id, document_version_id, property_id, claim_type, claim_value_json,
      source_quote, source_location_json, confidence, status, reviewed_by, reviewed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 'approved', 'test-suite', datetime('now'))
  `).run(
    'claim_admin_approved',
    'doc_admin_review',
    'ver_admin_review',
    PROPERTY_ID,
    'acreage',
    JSON.stringify('12.5 acres approved'),
    'Approved acreage source',
    JSON.stringify({ page: 4 })
  );

  testDb.prepare(`
    INSERT INTO document_versions (
      id, document_id, version_number, file_name, sha256, storage_uri, approval_status
    ) VALUES (?, ?, 2, ?, ?, ?, 'rejected')
  `).run(
    'ver_admin_rejected',
    'doc_admin_review',
    'rejected-tax-card.pdf',
    'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    'manual://rejected-storage-tax-card.pdf'
  );

  testDb.prepare(`
    INSERT INTO extracted_claims (
      id, document_id, document_version_id, property_id, claim_type, claim_value_json,
      confidence, status
    ) VALUES (?, ?, ?, ?, ?, ?, 0.4, 'pending_review')
  `).run(
    'claim_admin_rejected_version',
    'doc_admin_review',
    'ver_admin_rejected',
    PROPERTY_ID,
    'road_access',
    JSON.stringify('Rejected source claim')
  );
}

async function main() {
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  let log = '';

  server = childProcess.spawn(process.execPath, ['server.js'], {
    cwd: API_DIR,
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_PATH: DB_PATH,
      NODE_ENV: 'test',
      PUBLIC_LISTINGS_ENABLED: 'false',
      PUBLIC_ASSISTANT_ENABLED: 'false',
      API_KEY: 'admin-document-review-api-key',
      SESSION_SECRET: 'admin-document-review-session-secret',
      ADMIN_PASSWORD,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const appendLog = (chunk) => {
    log += chunk.toString();
    if (log.length > 12000) log = log.slice(-12000);
  };
  server.stdout.on('data', appendLog);
  server.stderr.on('data', appendLog);

  try {
    await waitForHealth(baseUrl, () => log);
    testDb = new Database(DB_PATH);
    seedReviewData();

    await test('GET /admin/document-claims redirects anonymous users to login', async () => {
      const res = await fetch(`${baseUrl}/admin/document-claims`, { redirect: 'manual' });
      assert.strictEqual(res.status, 302);
      assert.strictEqual(res.headers.get('location'), '/admin/login');
    });

    const cookie = await login(baseUrl);

    await test('GET /admin/document-claims renders pending claim review rows safely', async () => {
      const res = await fetch(`${baseUrl}/admin/document-claims`, {
        headers: { Cookie: cookie },
      });
      assert.strictEqual(res.status, 200);
      const html = await res.text();
      assert(html.includes('Document Claims'));
      assert(html.includes('Admin Review Road, Romney'));
      assert(html.includes('Admin Review Tax Card'));
      assert(html.includes('claim_admin_parcel') === false, 'internal claim ids should not be the main UI surface');
      assert(html.includes('parcel_id'));
      assert(html.includes('14-09-012B-0096-0000'));
      assert(html.includes('Parcel 14-09-012B-0096-0000'));
      assert(html.includes('&quot;page&quot;:2') || html.includes('{&quot;page&quot;:2'));
      assert(html.includes('data-status="pending_review"'));
      assert(!html.includes('<script>alert("type")</script>&'));
      assert(!html.includes('<script>alert("value")</script>&"&'));
      assert(!html.includes('<script>alert("quote")</script>&'));
      assert(!html.includes('<script>1</script>&'));
      assert(html.includes('&lt;script&gt;alert(&quot;type&quot;)&lt;/script&gt;&amp;'));
      assert(html.includes('&lt;script&gt;alert(\\&quot;value\\&quot;)&lt;/script&gt;&amp;\\&quot;&amp;'));
      assert(html.includes('&lt;script&gt;alert(&quot;quote&quot;)&lt;/script&gt;&amp;'));
      assert(html.includes('&lt;script&gt;1&lt;/script&gt;&amp;'));
      assert(!html.includes('Rejected source claim'), 'claims from rejected versions must be excluded');
      assert(!html.includes('manual://hidden-tax-card.pdf'), 'source_uri must not render');
      assert(!html.includes('manual://hidden-storage-tax-card.pdf'), 'storage_uri must not render');
    });

    await test('GET /admin/document-claims with status=approved renders only approved claims', async () => {
      const res = await fetch(`${baseUrl}/admin/document-claims?status=approved`, {
        headers: { Cookie: cookie },
      });
      assert.strictEqual(res.status, 200);
      const html = await res.text();
      assert(html.includes('Document Claims'));
      assert(html.includes('12.5 acres approved'));
      assert(html.includes('Approved acreage source'));
      assert(html.includes('data-status="approved"'));
      assert(!html.includes('14-09-012B-0096-0000'));
      assert(!html.includes('data-status="pending_review"'));
      assert(!html.includes('<td>0%</td>'), 'null confidence should render blank, not 0%');
    });

    await test('GET /admin/document-claims supports effective property and document type filters', async () => {
      const res = await fetch(
        `${baseUrl}/admin/document-claims?property_id=${encodeURIComponent(PROPERTY_ID)}&document_type=tax_card&claim_type=parcel_id`,
        { headers: { Cookie: cookie } }
      );
      assert.strictEqual(res.status, 200);
      const html = await res.text();
      assert(html.includes('Admin Review Road, Romney'));
      assert(html.includes('14-09-012B-0096-0000'));
      assert(!html.includes('Rejected source claim'));
    });

    await test('GET /admin/document-claims rejects invalid filters', async () => {
      const res = await fetch(`${baseUrl}/admin/document-claims?status=needs_human`, {
        headers: { Cookie: cookie },
      });
      assert.strictEqual(res.status, 400);
      const html = await res.text();
      assert(html.includes('Invalid status filter.'));
    });

    await test('GET /admin/document-claims rejects invalid document type filters', async () => {
      const res = await fetch(`${baseUrl}/admin/document-claims?document_type=not_a_real_type`, {
        headers: { Cookie: cookie },
      });
      assert.strictEqual(res.status, 400);
      const html = await res.text();
      assert(html.includes('Invalid document type filter.'));
    });
  } finally {
    if (testDb) testDb.close();
    if (server && server.exitCode == null) {
      server.kill();
      await new Promise((resolve) => server.once('exit', resolve));
    }
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  }

  console.log(`\nAdmin document review tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    for (const failure of failures) console.log(`- ${failure}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  if (server && server.exitCode == null) server.kill();
  if (testDb) testDb.close();
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
  process.exit(1);
});
