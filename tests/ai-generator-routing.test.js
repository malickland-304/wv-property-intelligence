#!/usr/bin/env node
'use strict';

/**
 * Unit tests for AI provider routing in api/ai-generator.js.
 *
 * Pure environment-resolution logic — no network calls. Verifies that the
 * Vercel AI Gateway path activates only when AI_GATEWAY_API_KEY is set, and
 * that direct-OpenAI behavior is unchanged otherwise.
 *
 * Run: node tests/ai-generator-routing.test.js
 */

const assert = require('assert');
const {
  resolveAiProvider,
  supportsJsonObjectFormat,
  aiConfigured
} = require('../api/ai-generator');

let passed = 0;
let failed = 0;
const failures = [];

function test(description, fn) {
  try {
    fn();
    passed++;
    console.log(`✓ ${description}`);
  } catch (error) {
    failed++;
    failures.push({ description, error: error.message });
    console.log(`✗ ${description}`);
    console.log(`  Error: ${error.message}`);
  }
}

// ── Nothing configured ────────────────────────────────────────────────────────
test('resolveAiProvider returns null when no key is set', () => {
  assert.strictEqual(resolveAiProvider({}), null);
});
test('aiConfigured is false when no key is set', () => {
  assert.strictEqual(aiConfigured({}), false);
});

// ── Direct OpenAI (legacy default) — behavior must be unchanged ────────────────
test('OPENAI_API_KEY only → direct OpenAI, gpt-4o, gpt-4o-mini fallback', () => {
  const p = resolveAiProvider({ OPENAI_API_KEY: 'sk-test' });
  assert.strictEqual(p.mode, 'openai');
  assert.strictEqual(p.hostname, 'api.openai.com');
  assert.strictEqual(p.path, '/v1/chat/completions');
  assert.strictEqual(p.apiKey, 'sk-test');
  assert.strictEqual(p.primaryModel, 'gpt-4o');
  assert.strictEqual(p.fallbackModel, 'gpt-4o-mini');
});
test('OPENAI_MODEL override drops the gpt-4o-mini auto-fallback', () => {
  const p = resolveAiProvider({ OPENAI_API_KEY: 'sk-test', OPENAI_MODEL: 'gpt-4o-mini' });
  assert.strictEqual(p.primaryModel, 'gpt-4o-mini');
  assert.strictEqual(p.fallbackModel, null);
});

// ── Vercel AI Gateway (preferred) ─────────────────────────────────────────────
test('AI_GATEWAY_API_KEY → gateway host, gpt-5.4 primary, haiku fallback', () => {
  const p = resolveAiProvider({ AI_GATEWAY_API_KEY: 'vck-test' });
  assert.strictEqual(p.mode, 'gateway');
  assert.strictEqual(p.hostname, 'ai-gateway.vercel.sh');
  assert.strictEqual(p.path, '/v1/chat/completions');
  assert.strictEqual(p.apiKey, 'vck-test');
  assert.strictEqual(p.primaryModel, 'openai/gpt-5.4');
  assert.strictEqual(p.fallbackModel, 'anthropic/claude-haiku-4.5');
});
test('gateway takes precedence over a direct OpenAI key', () => {
  const p = resolveAiProvider({ AI_GATEWAY_API_KEY: 'vck', OPENAI_API_KEY: 'sk' });
  assert.strictEqual(p.mode, 'gateway');
  assert.strictEqual(p.apiKey, 'vck');
});
test('AI_GATEWAY_MODEL / AI_GATEWAY_FALLBACK_MODEL overrides are honored', () => {
  const p = resolveAiProvider({
    AI_GATEWAY_API_KEY: 'vck',
    AI_GATEWAY_MODEL: 'openai/gpt-5.5',
    AI_GATEWAY_FALLBACK_MODEL: 'anthropic/claude-sonnet-4.6'
  });
  assert.strictEqual(p.primaryModel, 'openai/gpt-5.5');
  assert.strictEqual(p.fallbackModel, 'anthropic/claude-sonnet-4.6');
});
test('identical primary and fallback collapses fallback to null', () => {
  const p = resolveAiProvider({
    AI_GATEWAY_API_KEY: 'vck',
    AI_GATEWAY_FALLBACK_MODEL: 'openai/gpt-5.4'
  });
  assert.strictEqual(p.fallbackModel, null);
});
test('aiConfigured is true for either key', () => {
  assert.strictEqual(aiConfigured({ OPENAI_API_KEY: 'sk' }), true);
  assert.strictEqual(aiConfigured({ AI_GATEWAY_API_KEY: 'vck' }), true);
});

// ── response_format gating ────────────────────────────────────────────────────
test('json_object response_format only for OpenAI-family models', () => {
  assert.strictEqual(supportsJsonObjectFormat('gpt-4o'), true);
  assert.strictEqual(supportsJsonObjectFormat('openai/gpt-5.4'), true);
  assert.strictEqual(supportsJsonObjectFormat('anthropic/claude-haiku-4.5'), false);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log('\nFailures:');
  failures.forEach(f => console.log(`  ✗ ${f.description}: ${f.error}`));
}
process.exit(failed ? 1 : 0);
