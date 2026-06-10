'use strict';

const rateLimit = require('express-rate-limit');

const contactsRateLimit = rateLimit({
  windowMs: 60 * 1000, max: 10,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many inquiries. Please wait a moment.' },
});

const publicReadRateLimit = rateLimit({
  windowMs: 60 * 1000, max: 120,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many requests. Please wait a moment.' },
});

const adminLoginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10,
  standardHeaders: true, legacyHeaders: false,
  skipSuccessfulRequests: true,
});

const generateDescRateLimit = rateLimit({
  windowMs: 60 * 1000, max: 20,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many generate requests. Please wait a moment.' },
});

// Public assistant chat (POST /api/chat). Each request can hit a paid AI
// provider, so this is deliberately tight — enough for a back-and-forth
// conversation, low enough to protect the bill from a single IP.
const chatRateLimit = rateLimit({
  windowMs: 60 * 1000, max: 15,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many messages. Please wait a moment.' },
});

const apiWriteRateLimit = rateLimit({
  windowMs: 60 * 1000, max: 60,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many API requests. Please wait a moment.' },
});

const uploadRateLimit = rateLimit({
  windowMs: 60 * 1000, max: 30,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many upload requests. Please wait a moment.' },
});

const adminActionRateLimit = rateLimit({
  windowMs: 60 * 1000, max: 60,
  standardHeaders: true, legacyHeaders: false,
  message: 'Too many admin actions. Please slow down.',
});

module.exports = {
  contactsRateLimit,
  publicReadRateLimit,
  adminLoginRateLimit,
  generateDescRateLimit,
  chatRateLimit,
  apiWriteRateLimit,
  uploadRateLimit,
  adminActionRateLimit,
};
