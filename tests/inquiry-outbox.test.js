#!/usr/bin/env node
'use strict';

/**
 * Tests for the durable lead-forward outbox (api/services/inquiryOutbox.js,
 * the inquiry_outbox migration in api/db.js, and the enqueue calls in
 * routes/api.js POST /contacts and routes/leads.js insertLead).
 *
 * Uses a throwaway SQLite file and an injected fetch — NO external network.
 * The contacts-route check talks to an Express app on 127.0.0.1 only.
 * Run: node tests/inquiry-outbox.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const API_DIR = path.join(__dirname, '..', 'api');
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'inquiry-outbox-test-'));
process.env.DATABASE_PATH = path.join(TMP_DIR, 'outbox.db');
process.env.NODE_ENV = 'test';

const ENV_KEYS = ['INQUIRY_WEBHOOK_URL', 'INQUIRY_WEBHOOK_SECRET', 'INQUIRY_BRAND'];
const URL_OK = 'https://n8n.example.test/webhook/inquiry-intake';
const SECRET = 'unit-test-secret-not-real';
const clearEnv = () => ENV_KEYS.forEach((k) => delete process.env[k]);
const configure = () => {
  process.env.INQUIRY_WEBHOOK_URL = URL_OK;
  process.env.INQUIRY_WEBHOOK_SECRET = SECRET;
};

const { db, migrateInquiryOutbox } = require(path.join(API_DIR, 'db'));
const {
  enqueueInquiry,
  retryDelayMs,
  processInquiryOutbox,
  startInquiryOutboxWorker,
  stopInquiryOutboxWorker,
  MAX_ATTEMPTS,
  BASE_DELAY_MS,
  MAX_DELAY_MS,
  LEASE_MS,
} = require(path.join(API_DIR, 'services', 'inquiryOutbox'));
const { buildInquiryPayload, SECRET_HEADER, TIMEOUT_MS } = require(path.join(API_DIR, 'services', 'inquiryForward'));
const leadsRouter = require(path.join(API_DIR, 'routes', 'leads'));

const T0 = Date.parse('2026-11-15T12:00:00.000Z');
const silent = { log() {}, warn() {}, error() {} };

/** fetch stub: each call consumes the next scripted response (object or Error). */
function scriptedFetch(...responses) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url: String(url), init });
    const next = responses.length > 1 ? responses.shift() : responses[0];
    if (next instanceof Error) throw next;
    return next;
  };
  return { impl, calls };
}

let seq = 0;
function queue(overrides = {}) {
  seq += 1;
  const payload = buildInquiryPayload(
    { id: 1000 + seq, name: 'Test Person', email: 'test@example.com', phone: '304-555-0100', message: 'Is it available?', source: 'hero', ...overrides },
    null
  );
  assert.strictEqual(enqueueInquiry(db, payload, { now: T0 }), true, 'enqueue should insert a new row');
  return payload.submission_id;
}
const row = (submissionId) => db.prepare('SELECT * FROM inquiry_outbox WHERE submission_id = ?').get(submissionId);
const pass = (fetchImpl, now = T0, extra = {}) =>
  processInquiryOutbox({ db, fetchImpl, now: () => now, random: () => 0, logger: silent, ...extra });

(async () => {
  let passed = 0;
  let failed = 0;
  const failures = [];
  const check = async (name, fn) => {
    clearEnv();
    db.prepare('DELETE FROM inquiry_outbox').run();
    try { await fn(); passed++; }
    catch (e) { failed++; failures.push(`${name}: ${e.stack || e.message}`); }
    clearEnv();
  };

  // ── Migration ────────────────────────────────────────────
  await check('fetch timeout fits a respond-after-write intake and stays inside the claim lease', () => {
    // n8n answers only after the Leads row is written, which can exceed a few seconds.
    assert(TIMEOUT_MS >= 30 * 1000, `timeout ${TIMEOUT_MS} ms is too short for respond-after-write`);
    // A send that is still in flight must not be re-claimed by another pass.
    assert(LEASE_MS >= 2 * TIMEOUT_MS, `lease ${LEASE_MS} ms must be at least 2x the ${TIMEOUT_MS} ms timeout`);
  });

  await check('migration creates inquiry_outbox with the expected columns', () => {
    const cols = db.prepare('PRAGMA table_info(inquiry_outbox)').all().map((c) => c.name);
    for (const c of ['id', 'submission_id', 'payload', 'status', 'attempts', 'next_attempt_at', 'last_error_class', 'created_at', 'delivered_at']) {
      assert(cols.includes(c), `missing column ${c}`);
    }
    assert(!cols.some((c) => /secret/i.test(c)), 'no secret column');
  });

  await check('migration is idempotent (re-running keeps existing rows)', () => {
    configure();
    const id = queue();
    migrateInquiryOutbox(db);
    migrateInquiryOutbox(db);
    assert(row(id), 'row survives re-running the migration');
  });

  await check('status CHECK rejects unknown values', () => {
    const id = queue();
    assert.throws(() => db.prepare("UPDATE inquiry_outbox SET status='sent' WHERE submission_id=?").run(id));
  });

  // ── Enqueue ──────────────────────────────────────────────
  await check('same submission_id is never queued twice', () => {
    configure();
    const payload = buildInquiryPayload({ id: 77, name: 'A', email: 'a@example.com' }, null);
    assert.strictEqual(enqueueInquiry(db, payload, { now: T0 }), true);
    assert.strictEqual(enqueueInquiry(db, payload, { now: T0 }), false);
    assert.strictEqual(enqueueInquiry(db, { ...payload, message: 'changed' }, { now: T0 }), false);
    const n = db.prepare('SELECT COUNT(*) AS n FROM inquiry_outbox WHERE submission_id = ?').get('malickland-contact-77').n;
    assert.strictEqual(n, 1);
  });

  await check('queued row is pending, due now, and never stores the secret', () => {
    configure();
    const id = queue();
    const r = row(id);
    assert.strictEqual(r.status, 'pending');
    assert.strictEqual(r.attempts, 0);
    assert.strictEqual(r.next_attempt_at, new Date(T0).toISOString());
    assert(!r.payload.includes(SECRET), 'payload must not contain the webhook secret');
    assert.strictEqual(JSON.parse(r.payload).submission_id, id);
  });

  await check('enqueue without a submission_id inserts nothing', () => {
    assert.strictEqual(enqueueInquiry(db, { name: 'x' }), false);
    assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM inquiry_outbox').get().n, 0);
  });

  // ── Delivery ─────────────────────────────────────────────
  await check('success: delivered on first attempt with secret header, https, redirect:error', async () => {
    configure();
    const id = queue();
    const f = scriptedFetch({ ok: true, status: 200 });
    const summary = await pass(f.impl);
    assert.deepStrictEqual(summary, { attempted: 1, delivered: 1, retrying: 0, failed: 0 });
    assert.strictEqual(f.calls.length, 1);
    const { url, init } = f.calls[0];
    assert.strictEqual(url, URL_OK);
    assert.strictEqual(init.method, 'POST');
    assert.strictEqual(init.redirect, 'error');
    assert.strictEqual(init.headers[SECRET_HEADER], SECRET);
    assert.strictEqual(JSON.parse(init.body).submission_id, id);
    const r = row(id);
    assert.strictEqual(r.status, 'delivered');
    assert.strictEqual(r.attempts, 1);
    assert.strictEqual(r.delivered_at, new Date(T0).toISOString());
    assert.strictEqual((await pass(f.impl)).attempted, 0, 'delivered rows are not re-sent');
  });

  await check('retry then success: 503 is retried after backoff, then delivered', async () => {
    configure();
    const id = queue();
    const f = scriptedFetch({ ok: false, status: 503 }, { ok: true, status: 200 });

    assert.strictEqual((await pass(f.impl)).retrying, 1);
    let r = row(id);
    assert.strictEqual(r.status, 'pending');
    assert.strictEqual(r.attempts, 1);
    assert.strictEqual(r.last_error_class, 'http_503');
    // random() = 0 → lower jitter bound: half of the first 30 s step.
    assert.strictEqual(r.next_attempt_at, new Date(T0 + BASE_DELAY_MS / 2).toISOString());

    assert.strictEqual((await pass(f.impl, T0 + 1000)).attempted, 0, 'not retried before next_attempt_at');
    assert.strictEqual(f.calls.length, 1);

    assert.strictEqual((await pass(f.impl, T0 + BASE_DELAY_MS)).delivered, 1);
    r = row(id);
    assert.strictEqual(r.status, 'delivered');
    assert.strictEqual(r.attempts, 2);
    assert.strictEqual(f.calls.length, 2);
    assert.strictEqual(JSON.parse(f.calls[1].init.body).submission_id, id, 'retry re-sends the same submission_id');
  });

  await check('network error, timeout, 429 and 404 are retried, not failed', async () => {
    configure();
    const timeout = new Error('timed out');
    timeout.name = 'TimeoutError';
    const cases = [
      [new TypeError('fetch failed'), 'network'],
      [timeout, 'timeout'],
      [{ ok: false, status: 429 }, 'http_429'],
      [{ ok: false, status: 500 }, 'http_500'],
      [{ ok: false, status: 404 }, 'http_404'],
    ];
    for (const [response, errorClass] of cases) {
      db.prepare('DELETE FROM inquiry_outbox').run();
      const id = queue();
      await pass(scriptedFetch(response).impl);
      const r = row(id);
      assert.strictEqual(r.status, 'pending', `${errorClass} should stay pending`);
      assert.strictEqual(r.last_error_class, errorClass);
      assert.strictEqual(r.attempts, 1);
    }
  });

  await check('permanent failure: 401/403/400 are marked failed and never retried', async () => {
    configure();
    for (const status of [401, 403, 400]) {
      db.prepare('DELETE FROM inquiry_outbox').run();
      const id = queue();
      const f = scriptedFetch({ ok: false, status });
      assert.strictEqual((await pass(f.impl)).failed, 1);
      const r = row(id);
      assert.strictEqual(r.status, 'failed');
      assert.strictEqual(r.attempts, 1);
      assert.strictEqual(r.last_error_class, `http_${status}`);
      assert.strictEqual((await pass(f.impl, T0 + MAX_DELAY_MS * 2)).attempted, 0, 'failed rows are not retried');
      assert.strictEqual(f.calls.length, 1);
    }
  });

  await check('retryable errors stop at MAX_ATTEMPTS and park the row as failed', async () => {
    configure();
    const id = queue();
    db.prepare('UPDATE inquiry_outbox SET attempts = ? WHERE submission_id = ?').run(MAX_ATTEMPTS - 1, id);
    await pass(scriptedFetch({ ok: false, status: 502 }).impl);
    const r = row(id);
    assert.strictEqual(r.status, 'failed');
    assert.strictEqual(r.attempts, MAX_ATTEMPTS);
    assert.strictEqual(r.last_error_class, 'http_502');
  });

  await check('not configured: nothing is sent and rows stay pending', async () => {
    configure();
    const id = queue();
    clearEnv();
    const f = scriptedFetch({ ok: true });
    assert.strictEqual((await pass(f.impl)).skipped, 'not_configured');
    assert.strictEqual(f.calls.length, 0);
    assert.strictEqual(row(id).status, 'pending');
    assert.strictEqual(row(id).attempts, 0);
  });

  await check('non-https URL: secret is never sent in clear', async () => {
    configure();
    const id = queue();
    process.env.INQUIRY_WEBHOOK_URL = 'http://n8n.example.test/webhook/inquiry-intake';
    const f = scriptedFetch({ ok: true });
    await pass(f.impl);
    assert.strictEqual(f.calls.length, 0);
    assert.strictEqual(row(id).status, 'pending');
  });

  await check('a row claimed by another worker is skipped (no double send)', async () => {
    configure();
    const id = queue();
    // Simulate another worker's claim landing between our SELECT and UPDATE.
    const f = scriptedFetch({ ok: true });
    const realPrepare = db.prepare.bind(db);
    let stolen = false;
    db.prepare = (sql) => {
      const stmt = realPrepare(sql);
      if (!stolen && /SET next_attempt_at = \?\s*WHERE id = \? AND status = 'pending'/.test(sql)) {
        stolen = true;
        realPrepare('UPDATE inquiry_outbox SET next_attempt_at = ? WHERE submission_id = ?')
          .run(new Date(T0 + 1).toISOString(), id);
      }
      return stmt;
    };
    try { await pass(f.impl); } finally { db.prepare = realPrepare; }
    assert.strictEqual(f.calls.length, 0);
    assert.strictEqual(row(id).attempts, 0);
  });

  await check('backoff grows exponentially, is jittered, and is capped', () => {
    assert.strictEqual(retryDelayMs(1, () => 0), BASE_DELAY_MS / 2);
    assert.strictEqual(retryDelayMs(1, () => 1), BASE_DELAY_MS);
    assert.strictEqual(retryDelayMs(3, () => 1), BASE_DELAY_MS * 4);
    assert.strictEqual(retryDelayMs(50, () => 1), MAX_DELAY_MS);
    for (let a = 1; a <= MAX_ATTEMPTS; a++) {
      const d = retryDelayMs(a);
      assert(d >= BASE_DELAY_MS / 2 && d <= MAX_DELAY_MS, `attempt ${a} delay ${d} out of range`);
    }
  });

  // ── Route integration ────────────────────────────────────
  const lead = (id, overrides = {}) => ({
    lead_id: id, property_id: null, property_slug: 'advent-dr-hampshire-wv', property_address: '37 Advent Dr, Augusta, WV',
    name: 'Lead Person', email: 'lead@example.com', phone: '304-555-0101', lead_type: 'packet_request',
    buyer_intent: '', financing_type: '', timeline: '', message: 'Send the packet', sms_consent: 0,
    source: 'property-page-test', utm_source: '', utm_medium: '', utm_campaign: '', status: 'new',
    follow_up_status: 'disabled', next_follow_up_at: '', created_at: new Date(T0).toISOString(), updated_at: new Date(T0).toISOString(),
    ...overrides,
  });

  await check('insertLead queues the outbox row in the same transaction (malickland-lead-<id>)', () => {
    configure();
    const l = lead('outboxtestlead01');
    leadsRouter.insertLead(db, l, [], leadsRouter.buildLeadInquiryPayload(l));
    assert(db.prepare('SELECT id FROM leads WHERE id = ?').get(l.lead_id), 'lead stored');
    const r = row('malickland-lead-outboxtestlead01');
    assert(r, 'outbox row stored');
    assert.strictEqual(r.status, 'pending');
    assert.strictEqual(JSON.parse(r.payload).consent_sms, false);
  });

  await check('insertLead failure rolls back: no orphan outbox row', () => {
    configure();
    const bad = lead('outboxtestlead02', { name: null }); // violates leads.name NOT NULL
    assert.throws(() => leadsRouter.insertLead(db, bad, [], leadsRouter.buildLeadInquiryPayload(lead('outboxtestlead02'))));
    assert.strictEqual(db.prepare('SELECT id FROM leads WHERE id = ?').get('outboxtestlead02'), undefined);
    assert.strictEqual(row('malickland-lead-outboxtestlead02'), undefined);
  });

  // Make the outbox INSERT itself fail (after the lead/contact INSERT has run in
  // the same transaction). A TEMP trigger lives on this connection only.
  const withOutboxInsertFailing = async (fn) => {
    db.exec("CREATE TEMP TRIGGER outbox_test_fail BEFORE INSERT ON inquiry_outbox BEGIN SELECT RAISE(ABORT, 'forced outbox failure'); END;");
    try { return await fn(); } finally { db.exec('DROP TRIGGER IF EXISTS outbox_test_fail'); }
  };
  const waitFor = async (predicate, timeoutMs = 3000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (predicate()) return true;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return Boolean(predicate());
  };

  await check('outbox insert failure rolls the lead back too (no lead without its queued copy)', async () => {
    configure();
    const l = lead('outboxtestlead03');
    const contactCount = () => db.prepare('SELECT COUNT(*) AS n FROM contacts').get().n;
    const contactsBefore = contactCount();
    await withOutboxInsertFailing(() => {
      assert.throws(
        () => leadsRouter.insertLead(db, l, [], leadsRouter.buildLeadInquiryPayload(l)),
        /forced outbox failure/
      );
    });
    assert.strictEqual(db.prepare('SELECT id FROM leads WHERE id = ?').get(l.lead_id), undefined, 'lead rolled back');
    assert.strictEqual(contactCount(), contactsBefore, 'mirrored contacts row rolled back');
    assert.strictEqual(row('malickland-lead-outboxtestlead03'), undefined);
    // Same lead goes through once the outbox insert works again.
    leadsRouter.insertLead(db, l, [], leadsRouter.buildLeadInquiryPayload(l));
    assert(db.prepare('SELECT id FROM leads WHERE id = ?').get(l.lead_id), 'lead stored after the failure clears');
    assert(row('malickland-lead-outboxtestlead03'), 'outbox row stored after the failure clears');
  });

  await check('POST /api/contacts stores the contact, queues it, and the worker delivers it', async () => {
    configure();
    const express = require(path.join(API_DIR, 'node_modules', 'express'));
    const apiRoutes = require(path.join(API_DIR, 'routes', 'api'));
    const app = express();
    app.use(express.json());
    app.use('/api', apiRoutes);
    app.use((_err, _req, res, _next) => res.status(500).json({ error: 'Server error' }));
    const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    const f = scriptedFetch({ ok: true, status: 200 });
    // One-hour interval: the only thing that can trigger a delivery inside this
    // test is the route's own kick after the insert.
    startInquiryOutboxWorker({ db, fetchImpl: f.impl, intervalMs: 60 * 60 * 1000, logger: silent });
    try {
      const res = await fetch(`http://127.0.0.1:${server.address().port}/api/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Route Person', email: 'route@example.com', message: 'Hello', source: 'hero' }),
      });
      assert.strictEqual(res.status, 201);
      const { id } = await res.json();
      // No test-side kick: the route must have triggered the delivery itself.
      const deliveredByRoute = await waitFor(() => (row(`malickland-contact-${id}`) || {}).status === 'delivered');
      const r = row(`malickland-contact-${id}`);
      assert(r, 'outbox row queued for the new contact');
      assert(deliveredByRoute, `route kick should deliver without waiting for the poll (status: ${r.status})`);
      assert.strictEqual(f.calls.length, 1);
      assert.strictEqual(JSON.parse(f.calls[0].init.body).submission_id, `malickland-contact-${id}`);

      // Outbox insert fails: the request fails and the contact is NOT stored on its own.
      await withOutboxInsertFailing(async () => {
        const resFail = await fetch(`http://127.0.0.1:${server.address().port}/api/contacts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Rollback Person', email: 'rollback@example.com', message: 'Hello' }),
        });
        assert.strictEqual(resFail.status, 500);
      });
      assert.strictEqual(
        db.prepare('SELECT COUNT(*) AS n FROM contacts WHERE email = ?').get('rollback@example.com').n,
        0,
        'contact rolled back with the failed outbox insert'
      );
      assert.strictEqual(f.calls.length, 1, 'nothing sent for the rolled-back contact');

      // Forward off: contact is still stored, nothing is queued.
      clearEnv();
      const res2 = await fetch(`http://127.0.0.1:${server.address().port}/api/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Quiet Person', email: 'quiet@example.com' }),
      });
      assert.strictEqual(res2.status, 201);
      const id2 = (await res2.json()).id;
      assert(db.prepare('SELECT id FROM contacts WHERE id = ?').get(id2), 'contact stored');
      assert.strictEqual(row(`malickland-contact-${id2}`), undefined);
    } finally {
      stopInquiryOutboxWorker();
      await new Promise((resolve) => server.close(resolve));
    }
  });

  console.log(`\ninquiry-outbox: ${passed} passed, ${failed} failed`);
  if (failures.length) failures.forEach((f) => console.error(`  ✗ ${f}`));
  try { db.close(); } catch (_) {}
  try { fs.rmSync(TMP_DIR, { recursive: true, force: true }); } catch (_) {}
  process.exit(failed ? 1 : 0);
})();
