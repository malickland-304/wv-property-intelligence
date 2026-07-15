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
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'wv-http-smoke-'));
const DB_PATH = path.join(TMP_DIR, 'smoke.db');
const TRUSTED_ORIGIN = 'https://trusted.example';
const UNTRUSTED_ORIGIN = 'https://untrusted.example';

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

async function json(res) {
  return res.json();
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
      CORS_ORIGIN: TRUSTED_ORIGIN,
      API_KEY: 'http-smoke-api-key',
      SESSION_SECRET: 'http-smoke-session-secret',
      ADMIN_PASSWORD: 'http-smoke-admin-password',
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

    await test('GET /api/health returns status ok', async () => {
      const res = await fetch(`${baseUrl}/api/health`);
      assert.strictEqual(res.status, 200);
      const body = await json(res);
      assert.strictEqual(body.status, 'ok');
      assert(body.ts, 'health response should include timestamp');
    });

    await test('GET /api/config reflects safe test defaults', async () => {
      const res = await fetch(`${baseUrl}/api/config`);
      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(await json(res), {
        gaId: null,
        pixelId: null,
        listingsEnabled: false,
      });
    });

    await test('GET /api/properties is empty when public listings are disabled', async () => {
      const res = await fetch(`${baseUrl}/api/properties`);
      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(await json(res), { total: 0, page: 1, properties: [] });
    });

    await test('CORS allows only configured cross-origin browser access', async () => {
      const trusted = await fetch(`${baseUrl}/api/health`, {
        headers: { Origin: TRUSTED_ORIGIN },
      });
      assert.strictEqual(trusted.status, 200);
      assert.strictEqual(trusted.headers.get('access-control-allow-origin'), TRUSTED_ORIGIN);

      const untrusted = await fetch(`${baseUrl}/api/health`, {
        headers: { Origin: UNTRUSTED_ORIGIN },
      });
      assert.strictEqual(untrusted.status, 200);
      assert.strictEqual(untrusted.headers.get('access-control-allow-origin'), null);
    });

    await test('GET /listings redirects home when public listings are disabled', async () => {
      const res = await fetch(`${baseUrl}/listings`, { redirect: 'manual' });
      assert.strictEqual(res.status, 302);
      assert.strictEqual(res.headers.get('location'), '/');
    });

    await test('GET /search serves the empty-state page (not a bounce home) when public listings are disabled', async () => {
      const res = await fetch(`${baseUrl}/search`, { redirect: 'manual' });
      assert.strictEqual(res.status, 200);
      const body = await res.text();
      assert.ok(body.includes('temporarily offline'),
        '/search should render the listings-unavailable page, not redirect home');
      assert.ok(body.includes('WV Real Estate Agency, LLC'),
        '/search empty-state page should carry the brokerage disclosure');
    });

    await test('GET /search.html canonicalizes to /search', async () => {
      const res = await fetch(`${baseUrl}/search.html`, { redirect: 'manual' });
      assert.strictEqual(res.status, 301);
      assert.strictEqual(res.headers.get('location'), '/search');
    });

    await test('POST /api/contacts rejects non-JSON lead submissions', async () => {
      const res = await fetch(`${baseUrl}/api/contacts`, {
        method: 'POST',
        headers: {
          Origin: baseUrl,
          'Content-Type': 'text/plain',
        },
        body: 'name=Test',
      });
      assert.strictEqual(res.status, 415);
      assert.strictEqual((await json(res)).error, 'Lead requests must use application/json.');
    });

    await test('POST /api/contacts rejects missing origin', async () => {
      const res = await fetch(`${baseUrl}/api/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test Lead', email: 'lead@example.com' }),
      });
      assert.strictEqual(res.status, 403);
      assert.strictEqual((await json(res)).error, 'Lead request origin is required.');
    });

    await test('POST /api/contacts rejects untrusted cross-origin leads', async () => {
      const res = await fetch(`${baseUrl}/api/contacts`, {
        method: 'POST',
        headers: {
          Origin: UNTRUSTED_ORIGIN,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: 'Bad Origin', email: 'bad@example.com' }),
      });
      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.headers.get('access-control-allow-origin'), null);
      assert.strictEqual((await json(res)).error, 'Lead request origin is not allowed.');
    });

    await test('POST /api/contacts stores a CORS-allowlisted lead', async () => {
      const res = await fetch(`${baseUrl}/api/contacts`, {
        method: 'POST',
        headers: {
          Origin: TRUSTED_ORIGIN,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Trusted Lead',
          email: 'trusted@example.com',
          message: 'Allowlisted origin contact',
          source: 'http_smoke_cors',
        }),
      });
      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.headers.get('access-control-allow-origin'), TRUSTED_ORIGIN);
      const body = await json(res);
      assert(Number.isInteger(body.id), 'response should include integer lead id');
    });

    await test('POST /api/contacts stores a same-origin lead', async () => {
      const attribution = {
        utm_source: 'google',
        utm_medium: 'cpc',
        referrer: 'https://referrer.example/path',
        landing_page: '/?utm_source=google&utm_medium=cpc',
      };
      const res = await fetch(`${baseUrl}/api/contacts`, {
        method: 'POST',
        headers: {
          Origin: baseUrl,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Test Lead',
          email: 'lead@example.com',
          phone: '304-555-0101',
          message: 'HTTP smoke contact',
          source: 'http_smoke',
          attribution,
        }),
      });
      assert.strictEqual(res.status, 201);
      const body = await json(res);
      assert(Number.isInteger(body.id), 'response should include integer lead id');

      const list = await fetch(`${baseUrl}/api/contacts`, {
        headers: { Authorization: 'Bearer http-smoke-api-key' },
      });
      assert.strictEqual(list.status, 200);
      const contacts = await json(list);
      const stored = contacts.find((contact) => contact.id === body.id);
      assert(stored, 'stored lead should be present in API-key contacts list');
      assert.strictEqual(stored.source, 'http_smoke');
      assert.deepStrictEqual(JSON.parse(stored.attribution), attribution);
    });

    await test('POST /api/chat returns disabled-assistant fallback over HTTP', async () => {
      const res = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          Origin: baseUrl,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Do you have Hampshire County land?' }],
        }),
      });
      assert.strictEqual(res.status, 200);
      const body = await json(res);
      assert.strictEqual(typeof body.reply, 'string');
      assert(body.reply.includes('(540) 246-1421'), 'fallback should route users to Phil');
    });
  } finally {
    if (server && server.exitCode == null) {
      server.kill();
      await new Promise((resolve) => server.once('exit', resolve));
    }
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  }

  if (failed) {
    console.error(`\nhttp-smoke.test.js: ${failed} failed, ${passed} passed`);
    failures.forEach((failure) => console.error(`  - ${failure}`));
    process.exit(1);
  }

  console.log(`\nhttp-smoke.test.js: ${passed} passed, 0 failed`);
}

main().catch((err) => {
  if (server && server.exitCode == null) server.kill();
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
  console.error(err);
  process.exit(1);
});
