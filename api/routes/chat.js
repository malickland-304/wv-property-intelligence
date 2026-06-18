'use strict';

/**
 * routes/chat.js — public MalickLand assistant backend (POST /api/chat).
 *
 * Powers the "MalickLand Assistant" widget on the homepage. Public (no auth),
 * but defended in depth:
 *   - mounted behind requireLeadJson + requireLeadSameOrigin in server.js
 *     (same guards as the lead endpoints: JSON content-type + same-origin),
 *   - per-IP chatRateLimit here to protect the AI bill,
 *   - sanitizeChatMessages() strips client-supplied system roles and bounds
 *     turn count / length,
 *   - a server-injected brokerage-safe system prompt the client cannot override.
 *
 * Safe-by-default: if no AI provider is configured (AI_GATEWAY_API_KEY /
 * ANTHROPIC_API_KEY / OPENAI_API_KEY), or the upstream call fails, it returns a
 * friendly canned reply instead of crashing or 500-ing — main auto-deploys to
 * Railway, so this must never take the site down when the key is absent.
 *
 * Contract (matches app/index.html sendChatMsg):
 *   Request:  { messages: [{ role: 'user'|'assistant', content: string }, ...] }
 *   Response: { reply: string }
 */

const express = require('express');

const { chatRateLimit } = require('../middleware/rate-limits');
const { generateChatReply, aiConfigured } = require('../ai-generator');
const { publicAssistantEnabled } = require('../featureFlags');
const {
  buildChatSystemPrompt,
  sanitizeChatMessages,
  FALLBACK_REPLY,
} = require('../utils/chatAssistant');

function createChatRouter() {
  const router = express.Router();

  router.post('/', chatRateLimit, async (req, res) => {
    const messages = sanitizeChatMessages(req.body && req.body.messages);

    if (!messages.length || !messages.some((m) => m.role === 'user')) {
      return res.status(400).json({ error: 'A user message is required.' });
    }

    // Public assistant disabled (PUBLIC_ASSISTANT_ENABLED=false) → return the
    // canned reply without calling any AI provider. Zero LLM spend on anonymous
    // visitors; the admin listing generator is unaffected.
    if (!publicAssistantEnabled()) {
      return res.json({ reply: FALLBACK_REPLY });
    }

    // No provider configured → degrade gracefully (steady state until the key
    // is set in Railway), not an error.
    if (!aiConfigured()) {
      return res.json({ reply: FALLBACK_REPLY });
    }

    const payload = [{ role: 'system', content: buildChatSystemPrompt() }, ...messages];

    try {
      const reply = await generateChatReply(payload);
      return res.json({ reply: reply || FALLBACK_REPLY });
    } catch (err) {
      console.error('[Chat] assistant call failed:', err.message);
      // Non-2xx for observability, but include a usable reply so the widget
      // still shows something helpful (its own client fallback also covers this).
      return res.status(502).json({ error: 'assistant_unavailable', reply: FALLBACK_REPLY });
    }
  });

  return router;
}

module.exports = createChatRouter;
