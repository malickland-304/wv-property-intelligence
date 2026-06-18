#!/usr/bin/env node
'use strict';

/**
 * Regression tests for the PUBLIC_ASSISTANT_ENABLED cost-control flag.
 *
 * Proves the trust/cost boundary the unit helpers don't: when the public
 * assistant is disabled, POST /api/chat returns the canned reply WITHOUT
 * ever calling the paid AI provider. Also proves the enabled (default) path
 * still calls the provider, so the flag isn't silently dead.
 *
 * No network, no real AI: ai-generator is stubbed before chat.js binds it.
 *
 * Run: node tests/public-assistant-flag.test.js
 */

const assert = require('assert');
const path = require('path');

let passed = 0;
let failed = 0;
const failures = [];

function test(description, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed++;
      console.log(`✓ ${description}`);
    })
    .catch((error) => {
      failed++;
      failures.push({ description, error: error.message });
      console.log(`✗ ${description}`);
      console.log(`  Error: ${error.message}`);
    });
}

const AIGEN_PATH = path.join(__dirname, '..', 'api', 'ai-generator.js');
const CHAT_PATH = path.join(__dirname, '..', 'api', 'routes', 'chat.js');

// Load a fresh copy of the chat router with generateChatReply / aiConfigured
// stubbed. chat.js destructures these at require-time, so the stubs must be
// installed on the cached ai-generator module BEFORE chat.js is required.
function loadChatRouterWithSpy() {
  delete require.cache[require.resolve(AIGEN_PATH)];
  delete require.cache[require.resolve(CHAT_PATH)];

  const aigen = require(AIGEN_PATH);
  const spy = { calls: 0 };
  aigen.generateChatReply = async () => {
    spy.calls++;
    return 'STUBBED_AI_REPLY';
  };
  aigen.aiConfigured = () => true; // isolate the flag from the no-provider branch

  const createChatRouter = require(CHAT_PATH);
  const router = createChatRouter();

  // Pull the final POST '/' handler out of the express route stack (the layer
  // after chatRateLimit). Call it directly with mock req/res.
  const layer = router.stack.find((l) => l.route && l.route.path === '/');
  const stack = layer.route.stack;
  const handler = stack[stack.length - 1].handle;

  return { handler, spy };
}

function mockRes() {
  return {
    _status: 200,
    _json: null,
    status(code) { this._status = code; return this; },
    json(obj) { this._json = obj; return this; },
  };
}

const userMessages = { body: { messages: [{ role: 'user', content: 'Got land in Hampshire County?' }] } };

(async () => {
  const { buildFallbackReply } = require(path.join(__dirname, '..', 'api', 'utils', 'chatAssistant'));
  const { publicListingsEnabled } = require(path.join(__dirname, '..', 'api', 'featureFlags'));

  await test('disabled (PUBLIC_ASSISTANT_ENABLED=false): canned reply, ZERO provider calls', async () => {
    process.env.PUBLIC_ASSISTANT_ENABLED = 'false';
    const { handler, spy } = loadChatRouterWithSpy();
    const res = mockRes();
    await handler(userMessages, res);

    assert.strictEqual(spy.calls, 0, 'generateChatReply must NOT be called when disabled');
    assert.strictEqual(res._status, 200, 'disabled bot should answer 200, not error');
    assert.strictEqual(res._json && res._json.reply, buildFallbackReply(publicListingsEnabled()), 'should return the canned reply');
  });

  await test('enabled (default): provider IS called and its reply is returned', async () => {
    delete process.env.PUBLIC_ASSISTANT_ENABLED; // default ON
    const { handler, spy } = loadChatRouterWithSpy();
    const res = mockRes();
    await handler(userMessages, res);

    assert.strictEqual(spy.calls, 1, 'generateChatReply must be called when enabled');
    assert.strictEqual(res._json && res._json.reply, 'STUBBED_AI_REPLY', 'should return the provider reply');
  });

  await test('explicit enabled (PUBLIC_ASSISTANT_ENABLED=true): provider is called', async () => {
    process.env.PUBLIC_ASSISTANT_ENABLED = 'true';
    const { handler, spy } = loadChatRouterWithSpy();
    const res = mockRes();
    await handler(userMessages, res);

    assert.strictEqual(spy.calls, 1, 'true should behave like enabled');
  });

  for (const raw of ['FALSE', ' false ', 'False']) {
    await test(`normalized disable (PUBLIC_ASSISTANT_ENABLED=${JSON.stringify(raw)}): canned reply, ZERO provider calls`, async () => {
      process.env.PUBLIC_ASSISTANT_ENABLED = raw;
      const { handler, spy } = loadChatRouterWithSpy();
      const res = mockRes();
      await handler(userMessages, res);

      assert.strictEqual(spy.calls, 0, 'an intended "off" must disable regardless of case/whitespace');
      assert.strictEqual(res._json && res._json.reply, buildFallbackReply(publicListingsEnabled()), 'should return the canned reply');
    });
  }

  await test('disabled + listings OFF: fallback omits the listings pointer (no dead end), ZERO calls', async () => {
    process.env.PUBLIC_ASSISTANT_ENABLED = 'false';
    process.env.PUBLIC_LISTINGS_ENABLED = 'false';
    const { handler, spy } = loadChatRouterWithSpy();
    const res = mockRes();
    await handler(userMessages, res);

    assert.strictEqual(spy.calls, 0, 'still zero provider calls when disabled');
    assert.ok(
      res._json && !/browse current WV listings/i.test(res._json.reply),
      'must NOT point users to listings when PUBLIC_LISTINGS_ENABLED=false',
    );
    assert.ok(/246-1421/.test(res._json.reply), 'should still give the direct contact path');
    delete process.env.PUBLIC_LISTINGS_ENABLED;
  });

  delete process.env.PUBLIC_ASSISTANT_ENABLED;

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failures.length) {
    console.log('\nFailures:');
    failures.forEach((f) => console.log(`  ✗ ${f.description}: ${f.error}`));
  }
  process.exit(failed ? 1 : 0);
})();
