#!/usr/bin/env node
'use strict';

/**
 * Unit tests for api/services/leadNotifications.js (the /api/leads path).
 *
 * Regression guard: this module previously imported `hasGmailConfig` and
 * `sendTextEmail` from ../google, which were never exported — so every call
 * threw `TypeError: hasGmailConfig is not a function` and was swallowed. These
 * tests confirm it now routes through services/email.js, never throws, and
 * returns false when unconfigured. Pure logic — NO network.
 * Run: node tests/lead-notifications.test.js
 */

const assert = require('assert');

delete process.env.RESEND_API_KEY;
delete process.env.NOTIFICATION_EMAIL;
delete process.env.LEADS_NOTIFICATION_EMAIL;

const {
  isLeadEmailConfigured,
  sendLeadNotificationEmail,
  sendLeadAutoReplyEmail,
} = require('../api/services/leadNotifications');

(async () => {
  let passed = 0;
  let failed = 0;
  const failures = [];
  const check = async (name, fn) => {
    try { await fn(); passed++; }
    catch (e) { failed++; failures.push(`${name}: ${e.message}`); }
  };

  await check('isLeadEmailConfigured() is false when unconfigured', () => {
    assert.strictEqual(isLeadEmailConfigured(), false);
  });

  await check('sendLeadNotificationEmail() does not throw, returns false unconfigured', async () => {
    const r = await sendLeadNotificationEmail({
      lead_type: 'property_packet', name: 'Test', email: 'a@b.com',
      phone: '304', property_address: '37 Advent Dr',
    });
    assert.strictEqual(r, false);
  });

  await check('sendLeadAutoReplyEmail() does not throw, returns false unconfigured', async () => {
    const r = await sendLeadAutoReplyEmail({ email: 'a@b.com' }, [{ subject: 's', body: 'b' }]);
    assert.strictEqual(r, false);
  });

  await check('sendLeadAutoReplyEmail() returns false with no follow-ups', async () => {
    const r = await sendLeadAutoReplyEmail({ email: 'a@b.com' }, []);
    assert.strictEqual(r, false);
  });

  await check('sendLeadNotificationEmail() handles NULL lead without throwing', async () => {
    process.env.RESEND_API_KEY = 'test-key-not-used';
    process.env.NOTIFICATION_EMAIL = 'phil@example.com';
    const r = await sendLeadNotificationEmail(null); // !lead guard → false, no network
    delete process.env.RESEND_API_KEY; delete process.env.NOTIFICATION_EMAIL;
    assert.strictEqual(r, false);
  });

  await check('sendLeadAutoReplyEmail() handles NULL lead without throwing', async () => {
    process.env.RESEND_API_KEY = 'test-key-not-used';
    const r = await sendLeadAutoReplyEmail(null, [{ subject: 's', body: 'b' }]);
    delete process.env.RESEND_API_KEY;
    assert.strictEqual(r, false);
  });

  await check('customer auto-reply is OFF by default even when email is configured', async () => {
    const mod = require('../api/services/leadNotifications');
    delete process.env.LEAD_AUTO_REPLY_ENABLED;
    process.env.RESEND_API_KEY = 'test-key-not-used';
    assert.strictEqual(mod.isLeadAutoReplyEnabled(), false);
    // Returns before any transport call: a real lead + follow-up would otherwise hit the network.
    const r = await sendLeadAutoReplyEmail({ email: 'a@b.com', name: 'T' }, [{ subject: 's', body: 'b' }]);
    delete process.env.RESEND_API_KEY;
    assert.strictEqual(r, false);
  });

  await check('auto-reply flag only accepts the literal true', () => {
    const mod = require('../api/services/leadNotifications');
    for (const v of ['1', 'yes', 'on', 'false', '']) {
      process.env.LEAD_AUTO_REPLY_ENABLED = v;
      assert.strictEqual(mod.isLeadAutoReplyEnabled(), false, v);
    }
    process.env.LEAD_AUTO_REPLY_ENABLED = ' TRUE ';
    assert.strictEqual(mod.isLeadAutoReplyEnabled(), true);
    delete process.env.LEAD_AUTO_REPLY_ENABLED;
  });

  if (failed) {
    console.error(`✗ lead-notifications.test.js: ${failed} failed, ${passed} passed`);
    failures.forEach((f) => console.error('  - ' + f));
    process.exit(1);
  }
  console.log(`✓ lead-notifications.test.js: ${passed} passed`);
})();
