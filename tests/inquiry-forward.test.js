#!/usr/bin/env node
'use strict';

/**
 * Unit tests for api/services/inquiryForward.js (the POST /api/contacts → n8n
 * inquiry-intake forward). Pure logic with an injected fetch — NO network.
 * Run: node tests/inquiry-forward.test.js
 */

const assert = require('assert');

const ENV_KEYS = ['INQUIRY_WEBHOOK_URL', 'INQUIRY_WEBHOOK_SECRET', 'INQUIRY_BRAND'];
const clearEnv = () => ENV_KEYS.forEach((k) => delete process.env[k]);
clearEnv();

const {
  isInquiryForwardConfigured,
  buildInquiryPayload,
  forwardInquiry,
  SECRET_HEADER,
} = require('../api/services/inquiryForward');

const URL_OK = 'https://n8n.example.test/webhook/inquiry-intake';
const SECRET = 'unit-test-secret-not-real';
const contact = { id: 42, name: 'Test Person', email: 'test@example.com', phone: '304-555-0100', message: 'Is the lot available?', source: 'hero' };
const property = { id: 7, address: '37 Advent Dr', city: 'Romney', county: 'Hampshire' };

function fakeFetch(response) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url: String(url), init });
    if (response instanceof Error) throw response;
    return response;
  };
  return { impl, calls };
}

(async () => {
  let passed = 0;
  let failed = 0;
  const failures = [];
  const check = async (name, fn) => {
    clearEnv();
    try { await fn(); passed++; }
    catch (e) { failed++; failures.push(`${name}: ${e.message}`); }
    clearEnv();
  };

  await check('not configured when env is empty', () => {
    assert.strictEqual(isInquiryForwardConfigured(), false);
  });

  await check('not configured with URL but no secret', () => {
    process.env.INQUIRY_WEBHOOK_URL = URL_OK;
    assert.strictEqual(isInquiryForwardConfigured(), false);
  });

  await check('not configured with a non-https URL', () => {
    process.env.INQUIRY_WEBHOOK_URL = 'http://n8n.example.test/webhook/inquiry-intake';
    process.env.INQUIRY_WEBHOOK_SECRET = SECRET;
    assert.strictEqual(isInquiryForwardConfigured(), false);
  });

  await check('not configured with a malformed URL', () => {
    process.env.INQUIRY_WEBHOOK_URL = 'not a url';
    process.env.INQUIRY_WEBHOOK_SECRET = SECRET;
    assert.strictEqual(isInquiryForwardConfigured(), false);
  });

  await check('unconfigured forward returns false and makes no request', async () => {
    const f = fakeFetch({ ok: true });
    assert.strictEqual(await forwardInquiry(contact, property, { fetchImpl: f.impl }), false);
    assert.strictEqual(f.calls.length, 0);
  });

  await check('non-https URL makes no request (secret never sent in clear)', async () => {
    process.env.INQUIRY_WEBHOOK_URL = 'http://n8n.example.test/webhook/inquiry-intake';
    process.env.INQUIRY_WEBHOOK_SECRET = SECRET;
    const f = fakeFetch({ ok: true });
    assert.strictEqual(await forwardInquiry(contact, property, { fetchImpl: f.impl }), false);
    assert.strictEqual(f.calls.length, 0);
  });

  await check('configured forward POSTs JSON with the secret header', async () => {
    process.env.INQUIRY_WEBHOOK_URL = URL_OK;
    process.env.INQUIRY_WEBHOOK_SECRET = SECRET;
    const f = fakeFetch({ ok: true });
    assert.strictEqual(await forwardInquiry(contact, property, { fetchImpl: f.impl }), true);
    assert.strictEqual(f.calls.length, 1);
    const { url, init } = f.calls[0];
    assert.strictEqual(url, URL_OK);
    assert.strictEqual(init.method, 'POST');
    assert.strictEqual(init.headers[SECRET_HEADER], SECRET);
    assert.strictEqual(init.headers['Content-Type'], 'application/json');
    assert.strictEqual(init.redirect, 'error');
    assert.ok(init.signal, 'request must carry a timeout signal');
    const body = JSON.parse(init.body);
    assert.strictEqual(body.brand, 'MalickLand');
    assert.strictEqual(body.submission_id, 'malickland-contact-42');
    assert.strictEqual(body.source, 'web_form');
    assert.strictEqual(body.email, 'test@example.com');
    assert.strictEqual(body.location_or_item, '37 Advent Dr, Romney, Hampshire');
    assert.ok(!init.body.includes(SECRET), 'secret must not appear in the body');
  });

  await check('payload: brand override, no property, clipped message', () => {
    process.env.INQUIRY_BRAND = 'WV Real Estate Agency';
    const p = buildInquiryPayload({ ...contact, message: 'x'.repeat(9000) }, null);
    assert.strictEqual(p.brand, 'WV Real Estate Agency');
    assert.strictEqual(p.location_or_item, '');
    assert.strictEqual(p.message.length, 5000);
    assert.strictEqual(p.source_detail, 'malickland.net hero');
  });

  await check('payload: same contact id always yields the same submission_id', () => {
    const a = buildInquiryPayload(contact, property).submission_id;
    const b = buildInquiryPayload({ ...contact, message: 'changed' }, null).submission_id;
    assert.strictEqual(a, b);
  });

  await check('property-lead payload: own submission_id, location, need_type, sms consent', () => {
    const p = buildInquiryPayload({ submission_id: 'malickland-lead-abc123', name: 'T', email: 't@example.com', phone: '304', message: 'm', source: 'property-packet', location: '37 Advent Dr, Augusta, WV', need_type: 'Land', consent_sms: true }, null);
    assert.strictEqual(p.submission_id, 'malickland-lead-abc123');
    assert.strictEqual(p.location_or_item, '37 Advent Dr, Augusta, WV');
    assert.strictEqual(p.need_type, 'Land');
    assert.strictEqual(p.consent_sms, true);
    assert.strictEqual(buildInquiryPayload(contact, property).need_type, undefined);
  });

  await check('forward works with a submission_id and no contacts row id', async () => {
    process.env.INQUIRY_WEBHOOK_URL = URL_OK;
    process.env.INQUIRY_WEBHOOK_SECRET = SECRET;
    const f = fakeFetch({ ok: true });
    assert.strictEqual(await forwardInquiry({ submission_id: 'malickland-lead-abc123', name: 'T', email: 't@example.com' }, null, { fetchImpl: f.impl }), true);
    assert.strictEqual(JSON.parse(f.calls[0].init.body).submission_id, 'malickland-lead-abc123');
  });

  await check('non-2xx response returns false', async () => {
    process.env.INQUIRY_WEBHOOK_URL = URL_OK;
    process.env.INQUIRY_WEBHOOK_SECRET = SECRET;
    const f = fakeFetch({ ok: false, status: 403 });
    assert.strictEqual(await forwardInquiry(contact, property, { fetchImpl: f.impl }), false);
  });

  await check('network error / timeout returns false without throwing', async () => {
    process.env.INQUIRY_WEBHOOK_URL = URL_OK;
    process.env.INQUIRY_WEBHOOK_SECRET = SECRET;
    const f = fakeFetch(new Error('connect ETIMEDOUT'));
    assert.strictEqual(await forwardInquiry(contact, property, { fetchImpl: f.impl }), false);
  });

  await check('null contact or missing id returns false, no request', async () => {
    process.env.INQUIRY_WEBHOOK_URL = URL_OK;
    process.env.INQUIRY_WEBHOOK_SECRET = SECRET;
    const f = fakeFetch({ ok: true });
    assert.strictEqual(await forwardInquiry(null, null, { fetchImpl: f.impl }), false);
    assert.strictEqual(await forwardInquiry({ name: 'No Id' }, null, { fetchImpl: f.impl }), false);
    assert.strictEqual(f.calls.length, 0);
  });

  if (failed) {
    console.error(`✗ inquiry-forward.test.js: ${failed} failed, ${passed} passed`);
    failures.forEach((f) => console.error('  - ' + f));
    process.exit(1);
  }
  console.log(`✓ inquiry-forward.test.js: ${passed} passed`);
})();
