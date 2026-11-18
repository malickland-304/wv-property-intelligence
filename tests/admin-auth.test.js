#!/usr/bin/env node
'use strict';

// Admin login and API-key checks over real HTTP against a temp SQLite DB:
// - the password and API key are compared in constant time (safeEqual)
// - a successful login issues a NEW session id (no session fixation)

const assert = require('assert');
const childProcess = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const API_DIR = path.join(ROOT, 'api');
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'wv-admin-auth-'));
const DB_PATH = path.join(TMP_DIR, 'admin-auth.db');
const ADMIN_PASSWORD = 'admin-auth-test-password';
const API_KEY = 'admin-auth-test-api-key';

const { safeEqual } = require(path.join(API_DIR, 'middleware', 'auth'));

let server = null;
let passed = 0;
let failed = 0;

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`✓ ${name}`); })
    .catch((err) => { failed++; console.log(`✗ ${name}\n  Error: ${err.message}`); });
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

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForHealth(baseUrl, getLog) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (server.exitCode != null) throw new Error(`server exited early\n${getLog()}`);
    try {
      const res = await fetch(`${baseUrl}/api/health`);
      if (res.ok) return;
    } catch (_) {}
    await delay(250);
  }
  throw new Error(`server did not become healthy\n${getLog()}`);
}

function sessionCookie(res) {
  const raw = res.headers.get('set-cookie') || '';
  const match = raw.match(/connect\.sid=[^;]+/);
  return match ? match[0] : null;
}

async function login(baseUrl, password, cookie) {
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (cookie) headers.Cookie = cookie;
  return fetch(`${baseUrl}/admin/login`, {
    method: 'POST',
    headers,
    body: new URLSearchParams({ password }),
    redirect: 'manual',
  });
}

async function isAdmin(baseUrl, cookie) {
  const res = await fetch(`${baseUrl}/admin`, { headers: { Cookie: cookie }, redirect: 'manual' });
  return res.status === 200;
}

async function main() {
  await test('safeEqual matches equal strings and rejects others', () => {
    assert.strictEqual(safeEqual('secret', 'secret'), true);
    assert.strictEqual(safeEqual('secret', 'Secret'), false);
    assert.strictEqual(safeEqual('short', 'a-much-longer-secret'), false);
    assert.strictEqual(safeEqual(undefined, 'secret'), false);
    assert.strictEqual(safeEqual('secret', undefined), false);
    assert.strictEqual(safeEqual(['secret'], 'secret'), false);
  });

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
      SESSION_SECRET: 'admin-auth-test-session-secret',
      ADMIN_PASSWORD,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const appendLog = (chunk) => { log = (log + chunk.toString()).slice(-12000); };
  server.stdout.on('data', appendLog);
  server.stderr.on('data', appendLog);

  try {
    await waitForHealth(baseUrl, () => log);

    await test('wrong password shows the login error and grants no session', async () => {
      const res = await login(baseUrl, 'wrong-password');
      assert.strictEqual(res.status, 200);
      const cookie = sessionCookie(res);
      if (cookie) assert.strictEqual(await isAdmin(baseUrl, cookie), false);
    });

    let first = null;
    await test('correct password redirects to /admin with a working session', async () => {
      const res = await login(baseUrl, ADMIN_PASSWORD);
      assert.strictEqual(res.status, 302);
      assert.strictEqual(res.headers.get('location'), '/admin');
      first = sessionCookie(res);
      assert(first, 'expected a session cookie');
      assert.strictEqual(await isAdmin(baseUrl, first), true);
    });

    await test('login issues a new session id and retires the one it was sent', async () => {
      assert(first, 'needs the first login cookie');
      const res = await login(baseUrl, ADMIN_PASSWORD, first);
      assert.strictEqual(res.status, 302);
      const second = sessionCookie(res);
      assert(second, 'expected a new session cookie');
      assert.notStrictEqual(second, first, 'session id must change on login');
      assert.strictEqual(await isAdmin(baseUrl, second), true);
      assert.strictEqual(await isAdmin(baseUrl, first), false, 'old session id must no longer be admin');
    });

    await test('API key: right key 200, wrong or different-length key 401', async () => {
      const call = (key) => fetch(`${baseUrl}/api/contacts`, { headers: { Authorization: `Bearer ${key}` } });
      assert.strictEqual((await call(API_KEY)).status, 200);
      assert.strictEqual((await call('admin-auth-test-api-kez')).status, 401);
      assert.strictEqual((await call('x')).status, 401);
      assert.strictEqual((await fetch(`${baseUrl}/api/contacts`)).status, 401);
    });
  } finally {
    if (server && server.exitCode == null) server.kill();
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  }

  console.log(`\nadmin-auth: ${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  if (server && server.exitCode == null) server.kill();
  process.exit(1);
});
