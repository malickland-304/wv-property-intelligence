'use strict';

const { hasGmailConfig, sendTextEmail } = require('../google');

let warnedMissingConfig = false;

function refreshLeadFollowUpState(db, leadId) {
  if (!db || !leadId) return;

  const nextPending = db.prepare(`
    SELECT due_at
    FROM lead_followups
    WHERE lead_id = ? AND status = 'pending'
    ORDER BY due_at ASC
    LIMIT 1
  `).get(leadId);

  db.prepare(`
    UPDATE leads
    SET next_follow_up_at = ?,
        follow_up_status = ?,
        updated_at = ?
    WHERE id = ?
  `).run(
    nextPending?.due_at || null,
    nextPending ? 'scheduled' : 'completed',
    new Date().toISOString(),
    leadId
  );
}

function markFollowUpSent(db, leadId, stepCode, sentAt = new Date().toISOString()) {
  if (!db || !leadId || !stepCode) return false;

  const result = db.prepare(`
    UPDATE lead_followups
    SET status = 'sent',
        sent_at = ?
    WHERE lead_id = ? AND step_code = ? AND status = 'pending'
  `).run(sentAt, leadId, stepCode);

  if (result.changes) {
    refreshLeadFollowUpState(db, leadId);
    return true;
  }

  return false;
}

async function processDueLeadFollowUps({ db, limit = 25 } = {}) {
  if (!db) return { processed: 0, sent: 0, failed: 0, skipped: 'missing-db' };

  if (!hasGmailConfig()) {
    if (!warnedMissingConfig) {
      warnedMissingConfig = true;
      console.warn('[LeadFollowups] Gmail is not configured. Scheduled follow-up emails will stay pending.');
    }
    return { processed: 0, sent: 0, failed: 0, skipped: 'missing-gmail-config' };
  }

  warnedMissingConfig = false;

  const now = new Date().toISOString();
  const dueSteps = db.prepare(`
    SELECT
      lf.id,
      lf.lead_id,
      lf.step_code,
      lf.subject,
      lf.body,
      lf.due_at,
      l.email
    FROM lead_followups lf
    JOIN leads l ON l.id = lf.lead_id
    WHERE lf.status = 'pending'
      AND lf.channel = 'email'
      AND l.email IS NOT NULL
      AND l.email <> ''
      AND lf.due_at <= ?
    ORDER BY lf.due_at ASC
    LIMIT ?
  `).all(now, limit);

  let sent = 0;
  let failed = 0;

  for (const step of dueSteps) {
    const ok = await sendTextEmail({
      to: step.email,
      subject: step.subject,
      bodyText: step.body,
    });

    if (!ok) {
      failed += 1;
      continue;
    }

    const sentAt = new Date().toISOString();
    db.transaction(() => {
      db.prepare(`
        UPDATE lead_followups
        SET status = 'sent',
            sent_at = ?
        WHERE id = ?
      `).run(sentAt, step.id);

      refreshLeadFollowUpState(db, step.lead_id);
    })();

    sent += 1;
  }

  return { processed: dueSteps.length, sent, failed };
}

function startLeadFollowupWorker({
  db,
  pollMs = Number(process.env.LEAD_FOLLOWUP_POLL_MS || 5 * 60 * 1000),
  startupDelayMs = Number(process.env.LEAD_FOLLOWUP_STARTUP_DELAY_MS || 60 * 1000),
} = {}) {
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;

    try {
      const result = await processDueLeadFollowUps({ db });
      if (result.sent || result.failed) {
        console.log(`[LeadFollowups] processed=${result.processed} sent=${result.sent} failed=${result.failed}`);
      }
    } catch (error) {
      console.error('[LeadFollowups] worker failed:', error.message);
    } finally {
      running = false;
    }
  };

  const startupTimer = setTimeout(() => {
    tick().catch(() => {});
  }, startupDelayMs);

  const interval = setInterval(() => {
    tick().catch(() => {});
  }, pollMs);

  if (typeof startupTimer.unref === 'function') startupTimer.unref();
  if (typeof interval.unref === 'function') interval.unref();

  return {
    tick,
    stop() {
      clearTimeout(startupTimer);
      clearInterval(interval);
    },
  };
}

module.exports = {
  markFollowUpSent,
  processDueLeadFollowUps,
  refreshLeadFollowUpState,
  startLeadFollowupWorker,
};
