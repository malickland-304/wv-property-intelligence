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
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'wv-doc-registry-'));
const DB_PATH = path.join(TMP_DIR, 'registry.db');
const API_KEY = 'document-registry-test-key';

let server = null;
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

function api(baseUrl, pathName, options = {}) {
  const headers = {
    ...(options.auth === false ? {} : { Authorization: `Bearer ${API_KEY}` }),
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {}),
  };
  return fetch(`${baseUrl}${pathName}`, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
}

async function json(res) {
  return res.json();
}

function assertHasAction(events, action) {
  assert(events.some((event) => event.action === action), `expected audit action ${action}`);
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
      API_KEY,
      SESSION_SECRET: 'document-registry-session-secret',
      ADMIN_PASSWORD: 'document-registry-admin-password',
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

    let document = null;
    let version = null;
    let approvedClaim = null;
    let rejectedClaim = null;

    await test('GET /api/documents requires API key auth', async () => {
      const res = await api(baseUrl, '/api/documents', { auth: false });
      assert.strictEqual(res.status, 401);
      assert.strictEqual((await json(res)).error, 'Unauthorized');
    });

    await test('POST /api/documents rejects non-draft creation', async () => {
      const res = await api(baseUrl, '/api/documents', {
        method: 'POST',
        body: {
          title: 'Premature Active Survey',
          document_type: 'survey',
          status: 'active',
        },
      });
      assert.strictEqual(res.status, 400);
      assert.strictEqual((await json(res)).error, 'New documents must start in draft status.');
    });

    await test('POST /api/documents creates a draft document', async () => {
      const res = await api(baseUrl, '/api/documents', {
        method: 'POST',
        body: {
          title: 'Advent Tax Card',
          document_type: 'tax_card',
          source_provider: 'manual',
          source_uri: 'manual://advent-tax-card.pdf',
          actor: 'test-suite',
        },
      });
      assert.strictEqual(res.status, 201);
      document = await json(res);
      assert(document.id.startsWith('doc_'));
      assert.strictEqual(document.status, 'draft');
      assert.strictEqual(document.document_type, 'tax_card');
    });

    await test('GET /api/documents lists documents with filters', async () => {
      const res = await api(baseUrl, '/api/documents?status=draft&document_type=tax_card');
      assert.strictEqual(res.status, 200);
      const body = await json(res);
      assert(Array.isArray(body.documents));
      assert(body.documents.some((row) => row.id === document.id));
    });

    await test('PATCH /api/documents/:id rejects invalid draft to active transition without a version', async () => {
      const res = await api(baseUrl, `/api/documents/${document.id}`, {
        method: 'PATCH',
        body: { status: 'active', actor: 'test-suite' },
      });
      assert.strictEqual(res.status, 400);
      assert.strictEqual((await json(res)).error, 'Document needs at least one version before it can become active.');
    });

    await test('PATCH /api/documents/:id reports invalid property references as 400', async () => {
      const res = await api(baseUrl, `/api/documents/${document.id}`, {
        method: 'PATCH',
        body: { property_id: 'missing-property-id', actor: 'test-suite' },
      });
      assert.strictEqual(res.status, 400);
      assert.strictEqual((await json(res)).error, 'property_id does not exist.');
    });

    await test('POST /api/documents/:id/versions creates version metadata', async () => {
      const res = await api(baseUrl, `/api/documents/${document.id}/versions`, {
        method: 'POST',
        body: {
          file_name: 'advent-tax-card.pdf',
          mime_type: 'application/pdf',
          file_size_bytes: 12345,
          sha256: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
          storage_uri: 'manual://advent-tax-card.pdf',
          actor: 'test-suite',
        },
      });
      assert.strictEqual(res.status, 201);
      version = await json(res);
      assert(version.id.startsWith('ver_'));
      assert.strictEqual(version.version_number, 1);
      assert.strictEqual(version.approval_status, 'pending_review');
    });

    await test('POST /api/documents/:id/versions returns 409 for duplicate file hashes', async () => {
      const res = await api(baseUrl, `/api/documents/${document.id}/versions`, {
        method: 'POST',
        body: {
          file_name: 'duplicate-tax-card.pdf',
          sha256: version.sha256,
          storage_uri: 'manual://duplicate-tax-card.pdf',
          actor: 'test-suite',
        },
      });
      assert.strictEqual(res.status, 409);
      assert.strictEqual((await json(res)).error, 'Document version file hash already exists.');
    });

    await test('POST /api/documents/:id/claims rejects invalid AI extraction payloads', async () => {
      const res = await api(baseUrl, `/api/documents/${document.id}/claims`, {
        method: 'POST',
        body: {
          document_version_id: version.id,
          claims: [{
            claim_type: 'parcel_id',
            value: '14-09-012B-0096-0000',
            value_type: 'string',
            confidence: 1.5,
          }],
        },
      });
      assert.strictEqual(res.status, 400);
      assert.strictEqual((await json(res)).error, 'confidence must be between 0 and 1');
    });

    await test('POST /api/documents/:id/claims stores validated extracted claims', async () => {
      const res = await api(baseUrl, `/api/documents/${document.id}/claims`, {
        method: 'POST',
        body: {
          document_version_id: version.id,
          actor: 'test-suite',
          claims: [
            {
              claim_type: 'parcel_id',
              value: '14-09-012B-0096-0000',
              value_type: 'string',
              source_quote: 'Parcel 14-09-012B-0096-0000',
              source_location: { page: 1, section: 'Tax parcel' },
              confidence: 0.92,
            },
            {
              claim_type: 'other:registry_test',
              value: 'Review required',
              value_type: 'string',
              confidence: 0.5,
            },
          ],
        },
      });
      assert.strictEqual(res.status, 201);
      const body = await json(res);
      assert.strictEqual(body.claims.length, 2);
      approvedClaim = body.claims[0];
      rejectedClaim = body.claims[1];
      assert.strictEqual(approvedClaim.status, 'pending_review');
    });

    await test('POST /api/documents/:id/claims/:claimId/approve approves a pending claim', async () => {
      const res = await api(baseUrl, `/api/documents/${document.id}/claims/${approvedClaim.id}/approve`, {
        method: 'POST',
        body: { actor: 'test-suite', review_note: 'Parcel value matches source.' },
      });
      assert.strictEqual(res.status, 200);
      const body = await json(res);
      assert.strictEqual(body.status, 'approved');
      assert.strictEqual(body.reviewed_by, 'test-suite');
      assert(body.reviewed_at && !body.reviewed_at.includes('T'), 'reviewed_at should use SQLite datetime format');
    });

    await test('POST /api/documents/:id/claims/:claimId/reject rejects a pending claim', async () => {
      const res = await api(baseUrl, `/api/documents/${document.id}/claims/${rejectedClaim.id}/reject`, {
        method: 'POST',
        body: { actor: 'test-suite', review_note: 'Not a supported registry field.' },
      });
      assert.strictEqual(res.status, 200);
      const body = await json(res);
      assert.strictEqual(body.status, 'rejected');
      assert.strictEqual(body.reviewed_by, 'test-suite');
      assert(body.reviewed_at && !body.reviewed_at.includes('T'), 'reviewed_at should use SQLite datetime format');
    });

    await test('POST /api/documents/:id/versions/:versionId/approve activates the document', async () => {
      const res = await api(baseUrl, `/api/documents/${document.id}/versions/${version.id}/approve`, {
        method: 'POST',
        body: { actor: 'test-suite', reason: 'Initial accepted source.' },
      });
      assert.strictEqual(res.status, 200);
      const body = await json(res);
      assert.strictEqual(body.version.approval_status, 'approved');
      assert(body.version.approved_at && !body.version.approved_at.includes('T'), 'approved_at should use SQLite datetime format');
      assert.strictEqual(body.document.status, 'active');
      assert.strictEqual(body.document.current_version_id, version.id);
    });

    await test('POST /api/documents/:id/versions/:versionId/reject rejects invalid version transitions', async () => {
      const res = await api(baseUrl, `/api/documents/${document.id}/versions/${version.id}/reject`, {
        method: 'POST',
        body: { actor: 'test-suite' },
      });
      assert.strictEqual(res.status, 400);
      assert.strictEqual((await json(res)).error, 'Invalid version approval transition: approved -> rejected');
    });

    await test('GET /api/documents/:id returns registry detail and audit rows', async () => {
      const detailRes = await api(baseUrl, `/api/documents/${document.id}`);
      assert.strictEqual(detailRes.status, 200);
      const detail = await json(detailRes);
      assert.strictEqual(detail.document.status, 'active');
      assert.strictEqual(detail.current_version.id, version.id);
      assert.strictEqual(detail.versions.length, 1);
      assert.strictEqual(detail.claims.length, 2);

      const auditRes = await api(baseUrl, `/api/documents/${document.id}/audit`);
      assert.strictEqual(auditRes.status, 200);
      const audit = await json(auditRes);
      assertHasAction(audit.events, 'document.created');
      assertHasAction(audit.events, 'document_version.created');
      assertHasAction(audit.events, 'extracted_claim.created');
      assertHasAction(audit.events, 'extracted_claim.approved');
      assertHasAction(audit.events, 'extracted_claim.rejected');
      assertHasAction(audit.events, 'document_version.approved');
      assert(audit.events.every((event) => !String(event.after_json || '').includes('manual://')));
    });
  } finally {
    if (server && server.exitCode == null) {
      server.kill();
      await new Promise((resolve) => server.once('exit', resolve));
    }
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  }

  if (failed) {
    console.error(`\ndocument-registry.test.js: ${failed} failed, ${passed} passed`);
    failures.forEach((failure) => console.error(`  - ${failure}`));
    process.exit(1);
  }

  console.log(`\ndocument-registry.test.js: ${passed} passed, 0 failed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
