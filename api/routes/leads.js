'use strict';

const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');

const { append37AdventLead, appendPropertyLead, isLeadCaptureConfigured } = require('../services/googleSheets');
const { isTwilioConfigured, sendLeadAlertSms } = require('../services/twilioService');
const {
  isLeadEmailConfigured,
  sendLeadNotificationEmail,
  sendLeadAutoReplyEmail,
} = require('../services/leadNotifications');
const { markFollowUpSent } = require('../services/leadFollowupWorker');
const {
  ADVENT_LISTING_SLUG,
  buildLeadSchedule,
  buildPropertyLead,
  build37AdventLead,
  buildAdminLeadMessage,
  formatPropertyAddress,
  sanitizeLeadPayload,
  validateLeadPayload,
} = require('../utils/validators');

const leadRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please wait a moment.' },
});

function getPropertyBySlug(db, slug) {
  if (!db) return null;

  return db.prepare(`
    SELECT p.id, p.address, p.city, p.state, p.zip, p.listing_slug, c.name AS county
    FROM properties p
    JOIN counties c ON c.id = p.county_id
    WHERE (p.listing_slug = ? OR p.id = ?) AND p.status = 'active'
  `).get(slug, slug);
}

function insertLead(db, lead, followUps) {
  if (!db) return;

  const insertLeadStmt = db.prepare(`
    INSERT INTO leads (
      id, property_id, property_slug, property_address, name, email, phone,
      lead_type, buyer_intent, financing_type, timeline, message, sms_consent,
      source, utm_source, utm_medium, utm_campaign, status, follow_up_status,
      next_follow_up_at, created_at, updated_at
    ) VALUES (
      @lead_id, @property_id, @property_slug, @property_address, @name, @email, @phone,
      @lead_type, @buyer_intent, @financing_type, @timeline, @message, @sms_consent,
      @source, @utm_source, @utm_medium, @utm_campaign, @status, @follow_up_status,
      @next_follow_up_at, @created_at, @updated_at
    )
  `);

  const insertFollowUpStmt = db.prepare(`
    INSERT INTO lead_followups (
      id, lead_id, step_code, channel, template_name, subject, body, due_at, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
  `);

  const insertContactStmt = db.prepare(`
    INSERT INTO contacts (property_id, name, email, phone, message, source)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  db.transaction(() => {
    insertLeadStmt.run(lead);

    for (const step of followUps) {
      insertFollowUpStmt.run(
        crypto.randomBytes(12).toString('hex'),
        lead.lead_id,
        step.step_code,
        step.channel,
        step.template_name,
        step.subject,
        step.body,
        step.due_at,
        lead.created_at
      );
    }

    insertContactStmt.run(
      lead.property_id || null,
      lead.name,
      lead.email || '',
      lead.phone || '',
      buildAdminLeadMessage(lead),
      lead.source || 'property-lead'
    );
  })();
}

async function handleLeadCapture({ payload, property, db, appendFn }) {
  const errors = validateLeadPayload(payload, { requireEmail: true, requirePhone: true });
  if (errors.length) {
    return { status: 400, body: { error: errors[0], errors } };
  }

  const lead = property
    ? buildPropertyLead(payload, property)
    : build37AdventLead(payload);
  const followUps = buildLeadSchedule(lead, process.env.SITE_URL);

  let appendedToSheet = false;
  try {
    appendedToSheet = Boolean(await appendFn(lead));
    if (!appendedToSheet) {
      console.warn('[Leads] Google Sheets lead capture is not configured. Continuing with local capture.');
    }
  } catch (error) {
    console.error('[Leads] Failed to append lead:', error.message);
  }

  try {
    insertLead(db, lead, followUps);
  } catch (error) {
    console.error('[Leads] Failed to persist lead locally:', error.message);
    return { status: 500, body: { error: 'Lead capture failed. Please try again.' } };
  }

  sendLeadAlertSms(lead).catch(() => {});
  sendLeadNotificationEmail(lead).catch(() => {});
  sendLeadAutoReplyEmail(lead, followUps)
    .then((sent) => {
      if (sent) markFollowUpSent(db, lead.lead_id, 'day_0');
    })
    .catch(() => {});

  return {
    status: 201,
    body: {
      ok: true,
      leadId: lead.lead_id,
      message: lead.lead_type === 'similar_land_alert'
        ? 'Got it. Phil will follow up with similar property options shortly.'
        : 'Got it. Phil will follow up with the packet and next steps shortly.',
      syncedToSheets: appendedToSheet,
      nextFollowUpAt: followUps[1]?.due_at || null,
    },
  };
}

function createLeadsRouter({ db } = {}) {
  const router = express.Router();

  router.get('/37-advent/health', (_req, res) => {
    res.json({ ok: true });
  });

  router.post('/37-advent', leadRateLimit, async (req, res) => {
    const payload = sanitizeLeadPayload(req.body);
    const property = getPropertyBySlug(db, 'advent-dr-hampshire-wv') || {
      id: null,
      address: '37 Advent Dr',
      city: 'Augusta',
      state: 'WV',
      zip: '26704',
      county: 'Hampshire',
      listing_slug: ADVENT_LISTING_SLUG,
    };

    const response = await handleLeadCapture({
      payload,
      property,
      db,
      appendFn: append37AdventLead,
    });

    return res.status(response.status).json(response.body);
  });

  router.post('/property/:slug', leadRateLimit, async (req, res) => {
    const property = getPropertyBySlug(db, req.params.slug);
    if (!property) {
      return res.status(404).json({ error: 'Property not found.' });
    }

    const payload = sanitizeLeadPayload(req.body);
    if (!payload.source) {
      payload.source = `property-page-${property.listing_slug || req.params.slug}`;
    }

    const response = await handleLeadCapture({
      payload,
      property,
      db,
      appendFn: appendPropertyLead,
    });

    return res.status(response.status).json(response.body);
  });

  return router;
}

module.exports = createLeadsRouter;
