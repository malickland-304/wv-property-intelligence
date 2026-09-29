'use strict';

// Multipart upload -> sharp resize regression test.
// Exercises the real POST /admin/upload/:slug route (real multer + sharp) against a
// server started with a throwaway database and listings folder. No production data
// or credentials are used. Run from the repo (node tests/upload-e2e.test.js) or
// inside a built image (API_DIR=/workspace/api, tests mounted read-only).

const childProcess = require('child_process');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const assert = require('assert');

const API_DIR = process.env.API_DIR || path.resolve(__dirname, '..', 'api');
const sharp = require(path.join(API_DIR, 'node_modules', 'sharp'));
const ADMIN_PASSWORD = 'upload-e2e-admin-password';
const SLUG = 'e2e-slug';

function freePort() {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

function mergeCookies(current, res) {
  const jar = new Map(
    current.split(';').map((x) => x.trim()).filter(Boolean).map((x) => {
      const i = x.indexOf('=');
      return [x.slice(0, i), x.slice(i + 1)];
    })
  );
  for (const header of res.headers.getSetCookie()) {
    const pair = header.split(';')[0].trim();
    const i = pair.indexOf('=');
    if (i > 0) jar.set(pair.slice(0, i), pair.slice(i + 1));
  }
  return [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
}

const listDir = (root, kind) => {
  const dir = path.join(root, SLUG, 'photos', kind);
  return fs.existsSync(dir) ? fs.readdirSync(dir).sort() : [];
};

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wv-upload-e2e-'));
  const root = path.join(tmp, 'listings');
  fs.mkdirSync(root);
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  let log = '';
  const server = childProcess.spawn(process.execPath, ['server.js'], {
    cwd: API_DIR,
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_PATH: path.join(tmp, 'e2e.db'),
      LISTINGS_ROOT: root,
      NODE_ENV: 'test',
      PUBLIC_LISTINGS_ENABLED: 'false',
      PUBLIC_ASSISTANT_ENABLED: 'false',
      CORS_ORIGIN: base,
      API_KEY: 'upload-e2e-api-key',
      SESSION_SECRET: 'upload-e2e-session-secret',
      ADMIN_PASSWORD,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', (d) => { log += d; });
  server.stderr.on('data', (d) => { log += d; });

  try {
    for (let i = 0; ; i++) {
      try { if ((await fetch(`${base}/api/health`)).ok) break; } catch (_) { /* not up yet */ }
      if (i >= 60) throw new Error(`server never became healthy\n${log}`);
      await new Promise((r) => setTimeout(r, 500));
    }

    let res = await fetch(`${base}/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ password: ADMIN_PASSWORD }),
      redirect: 'manual',
    });
    assert.strictEqual(res.status, 302, 'admin login should redirect');
    let cookie = mergeCookies('', res);
    res = await fetch(`${base}/admin`, { headers: { Cookie: cookie } });
    cookie = mergeCookies(cookie, res);
    const csrf = (await res.text()).match(/<meta name="csrf-token" content="([^"]*)">/)[1];

    const png = await sharp({ create: { width: 2400, height: 1600, channels: 3, background: '#336699' } }).png().toBuffer();
    const post = (name, buf, type, headers) => {
      const fd = new FormData();
      fd.append('photo', new Blob([buf], { type }), name);
      return fetch(`${base}/admin/upload/${SLUG}`, { method: 'POST', body: fd, headers });
    };

    // 1) Valid upload is stored raw and resized to 1200px / 1024px JPEGs.
    res = await post('big.png', png, 'image/png', { Cookie: cookie, 'x-csrf-token': csrf });
    assert.strictEqual(res.status, 200, `valid upload status ${res.status}`);
    const body = await res.json();
    assert.strictEqual(body.ok, true);
    const f = body.filename;
    const meta = (kind) => sharp(path.join(root, SLUG, 'photos', kind, f)).metadata();
    const [raw, comp, mls] = await Promise.all([meta('raw'), meta('compressed'), meta('mls')]);
    assert.strictEqual(raw.width, 2400);
    assert.strictEqual(comp.format, 'jpeg');
    assert.strictEqual(comp.width, 1200);
    assert.strictEqual(mls.format, 'jpeg');
    assert.strictEqual(mls.width, 1024);
    assert(!/compression failed/.test(log), `sharp fell back to the original file:\n${log}`);
    console.log(`PASS valid upload: raw ${raw.width} -> compressed ${comp.width} ${comp.format}, mls ${mls.width} ${mls.format}`);

    // 2) Rejections use exact statuses and leave no files behind.
    res = await post('note.txt', Buffer.from('not an image'), 'text/plain', { Cookie: cookie, 'x-csrf-token': csrf });
    assert.strictEqual(res.status, 400, `non-image should be 400, got ${res.status}`);
    console.log('PASS non-image rejected with 400');

    res = await post('nocsrf.png', png, 'image/png', { Cookie: cookie });
    assert.strictEqual(res.status, 403, `missing CSRF should be 403, got ${res.status}`);
    console.log('PASS missing CSRF rejected with 403');

    res = await post('anon.png', png, 'image/png', {});
    assert.strictEqual(res.status, 403, `anonymous should be 403, got ${res.status}`);
    console.log('PASS anonymous request rejected with 403');

    for (const kind of ['raw', 'compressed', 'mls']) {
      assert.deepStrictEqual(listDir(root, kind), [f], `${kind} should contain only the valid upload`);
    }
    console.log('PASS rejected requests left no files behind');
    console.log(`env: arch=${process.arch} node=${process.version} sharp=${sharp.versions.sharp}`);
  } finally {
    server.kill();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(`FAIL ${err.message}`);
  process.exit(1);
});
