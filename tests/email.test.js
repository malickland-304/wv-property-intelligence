#!/usr/bin/env node
'use strict';

/**
 * Unit tests for api/services/email.js (Resend transactional email).
 *
 * Pure logic — NO network. Verifies config gating and honest return values:
 * every send is a no-op returning `false` when RESEND_API_KEY is absent, and
 * nothing throws. Run: node tests/email.test.js
 */

const assert = require('assert');

// Guarantee an unconfigured environment for the gating tests.
delete process.env.RESEND_API_KEY;
delete process.env.NOTIFICATION_EMAIL;

const { sendLeadNotification, sendMail, isEmailConfigured } = require('../api/services/email');

(async () => {
  let passed = 0;
  let failed = 0;
  const failures = [];
  const check = async (name, fn) => {
    try { await fn(); passed++; }
    catch (e) { failed++; failures.push(`${name}: ${e.message}`); }
  };

  await check('isEmailConfigured() is false without RESEND_API_KEY', () => {
    assert.strictEqual(isEmailConfigured(), false);
  });

  await check('sendMail() returns false when unconfigured (no network)', async () => {
    assert.strictEqual(await sendMail({ to: 'x@example.com', subject: 's', text: 't' }), false);
  });

  await check('sendMail() returns false when configured but no recipient (no network)', async () => {
    process.env.RESEND_API_KEY = 'test-key-not-used';
    const r = await sendMail({ to: '', subject: 's', text: 't' });
    delete process.env.RESEND_API_KEY;
    assert.strictEqual(r, false);
  });

  await check('sendLeadNotification() returns false without NOTIFICATION_EMAIL', async () => {
    assert.strictEqual(await sendLeadNotification({ name: 'A', email: 'a@b.com' }, null), false);
  });

  await check('sendLeadNotification() does not throw on sparse input', async () => {
    assert.strictEqual(await sendLeadNotification({}, null), false);
  });

  await check('sendLeadNotification() does not throw on NULL contact', async () => {
    process.env.NOTIFICATION_EMAIL = 'phil@example.com'; // passes the recipient gate
    const r = await sendLeadNotification(null, null);     // RESEND_API_KEY unset → sendMail false
    delete process.env.NOTIFICATION_EMAIL;
    assert.strictEqual(r, false);
  });

  if (failed) {
    console.error(`✗ email.test.js: ${failed} failed, ${passed} passed`);
    failures.forEach((f) => console.error('  - ' + f));
    process.exit(1);
  }
  console.log(`✓ email.test.js: ${passed} passed`);
})();
