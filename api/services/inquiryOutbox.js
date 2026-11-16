'use strict';

/**
 * services/inquiryOutbox.js — Durable delivery of captured leads to the n8n
 * "Inquiry intake (all brands)" webhook.
 *
 * Routes write an `inquiry_outbox` row (schema in db.js) in the SAME
 * transaction as the lead/contact, so a lead can never be stored without its
 * forward being queued. This worker then delivers pending rows and retries
 * failures with exponential backoff + jitter until they are delivered.
 *
 * "Delivered" means n8n ACCEPTED the request (2xx). The intake webhook answers
 * on receipt, before it reads or writes the sheet, so this covers n8n being
 * down, slow, inactive or rejecting the secret — not a failure inside the
 * workflow (Sheets error, pause_switch ON, brand not allowed). Those are
 * reported by n8n's own activity log and phone alert, and are not retried here.
 *
 *   2xx                                   → delivered (accepted by n8n)
 *   network error, timeout, 429, 5xx,     → retried (attempts++, backoff)
 *   other 4xx (e.g. 404 workflow inactive)
 *   400 / 401 / 403                       → failed, no retry (operator review)
 *   MAX_ATTEMPTS retryable failures       → failed (operator review)
 *
 * Retries are safe because every row keeps the route's stable submission_id
 * (malickland-contact-<id> / malickland-lead-<lead_id>) and n8n skips a
 * submission_id it has already filed ("replay").
 *
 * Logs carry the outbox id / submission_id and an error class only — never
 * the payload (customer PII) or the webhook secret.
 *
 * Operator: a `failed` row can be re-queued after fixing the cause with
 *   UPDATE inquiry_outbox SET status='pending', attempts=0,
 *     next_attempt_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=<id>;
 */

const { isInquiryForwardConfigured, deliverInquiryPayload } = require('./inquiryForward');

const BASE_DELAY_MS = 30 * 1000;            // first retry ~15–30 s after a failure
const MAX_DELAY_MS = 6 * 60 * 60 * 1000;    // backoff ceiling: 6 h
const MAX_ATTEMPTS = 20;                    // ≈3 days of retries before parking as failed
const LEASE_MS = 2 * 60 * 1000;             // claim window; 4× the 30 s fetch timeout
const DEFAULT_INTERVAL_MS = 30 * 1000;
const DEFAULT_BATCH_SIZE = 10;

const iso = (ms) => new Date(ms).toISOString();

/**
 * Queue a payload for delivery. Call inside the route's db.transaction so the
 * row commits (or rolls back) together with the lead. A submission_id that is
 * already queued is ignored, so the same lead is never queued twice.
 * Returns true when a new row was inserted.
 */
function enqueueInquiry(db, payload, { now = Date.now() } = {}) {
  if (!db || !payload || !payload.submission_id) return false;
  const stamp = iso(now);
  const result = db.prepare(`
    INSERT OR IGNORE INTO inquiry_outbox
      (submission_id, payload, status, attempts, next_attempt_at, created_at)
    VALUES (?, ?, 'pending', 0, ?, ?)
  `).run(String(payload.submission_id), JSON.stringify(payload), stamp, stamp);
  return result.changes === 1;
}

/** Backoff for the retry after `attempts` failed tries ("equal jitter": 50–100 % of the step). */
function retryDelayMs(attempts, random = Math.random) {
  const step = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** Math.max(0, attempts - 1));
  return Math.round(step / 2 + random() * (step / 2));
}

/** One delivery pass over due pending rows. Never throws on delivery errors. */
async function processInquiryOutbox({
  db,
  fetchImpl,
  now = () => Date.now(),
  random = Math.random,
  batchSize = DEFAULT_BATCH_SIZE,
  logger = console,
} = {}) {
  const summary = { attempted: 0, delivered: 0, retrying: 0, failed: 0 };
  if (!db) return { ...summary, skipped: 'missing_db' };
  // Unconfigured (or non-https URL): leave rows pending; nothing is sent.
  if (!isInquiryForwardConfigured()) return { ...summary, skipped: 'not_configured' };

  const due = db.prepare(`
    SELECT id, submission_id, payload, attempts, next_attempt_at
    FROM inquiry_outbox
    WHERE status = 'pending' AND next_attempt_at <= ?
    ORDER BY next_attempt_at, id
    LIMIT ?
  `).all(iso(now()), batchSize);

  // Compare-and-set claim: only the caller that moves next_attempt_at first sends.
  const claim = db.prepare(`
    UPDATE inquiry_outbox SET next_attempt_at = ?
    WHERE id = ? AND status = 'pending' AND next_attempt_at = ?
  `);
  const release = db.prepare('UPDATE inquiry_outbox SET next_attempt_at = ? WHERE id = ?');
  const markDelivered = db.prepare(`
    UPDATE inquiry_outbox SET status = 'delivered', attempts = ?, delivered_at = ? WHERE id = ?
  `);
  const markRetry = db.prepare(`
    UPDATE inquiry_outbox SET attempts = ?, next_attempt_at = ?, last_error_class = ? WHERE id = ?
  `);
  const markFailed = db.prepare(`
    UPDATE inquiry_outbox SET status = 'failed', attempts = ?, last_error_class = ? WHERE id = ?
  `);

  for (const row of due) {
    if (claim.run(iso(now() + LEASE_MS), row.id, row.next_attempt_at).changes !== 1) continue;

    let payload;
    try {
      payload = JSON.parse(row.payload);
    } catch (_err) {
      markFailed.run(row.attempts, 'bad_payload', row.id);
      summary.failed++;
      logger.warn(`[InquiryOutbox] #${row.id} ${row.submission_id} FAILED (bad_payload); needs operator review.`);
      continue;
    }

    const result = await deliverInquiryPayload(payload, { fetchImpl });
    if (result.errorClass === 'not_configured') {
      // Config vanished mid-pass: put the row back untouched and stop.
      release.run(row.next_attempt_at, row.id);
      return { ...summary, skipped: 'not_configured' };
    }

    summary.attempted++;
    const attempts = row.attempts + 1;

    if (result.ok) {
      markDelivered.run(attempts, iso(now()), row.id);
      summary.delivered++;
      if (attempts > 1) {
        logger.log(`[InquiryOutbox] #${row.id} ${row.submission_id} delivered on attempt ${attempts}.`);
      }
      continue;
    }

    if (!result.retryable || attempts >= MAX_ATTEMPTS) {
      markFailed.run(attempts, result.errorClass, row.id);
      summary.failed++;
      logger.warn(`[InquiryOutbox] #${row.id} ${row.submission_id} FAILED after ${attempts} attempt(s) (${result.errorClass}); lead is stored but NOT in the intake sheet — needs operator review.`);
      continue;
    }

    const delay = retryDelayMs(attempts, random);
    markRetry.run(attempts, iso(now() + delay), result.errorClass, row.id);
    summary.retrying++;
    logger.warn(`[InquiryOutbox] #${row.id} ${row.submission_id} attempt ${attempts} failed (${result.errorClass}); retrying in ~${Math.round(delay / 1000)}s.`);
  }

  return summary;
}

function getInquiryOutboxCounts(db) {
  const counts = { pending: 0, delivered: 0, failed: 0 };
  if (!db) return counts;
  for (const row of db.prepare('SELECT status, COUNT(*) AS n FROM inquiry_outbox GROUP BY status').all()) {
    counts[row.status] = row.n;
  }
  return counts;
}

/**
 * In-process worker: a pass every `intervalMs`, plus kick() right after a lead
 * is queued so the normal case is delivered within the request's lifetime.
 * Passes never overlap; a kick during a pass triggers one more pass after it.
 */
function createInquiryOutboxWorker({
  db,
  fetchImpl,
  intervalMs = DEFAULT_INTERVAL_MS,
  now,
  random,
  batchSize,
  logger = console,
} = {}) {
  let timer = null;
  let running = null;
  let again = false;

  function runOnce() {
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      let last = null;
      do {
        again = false;
        try {
          last = await processInquiryOutbox({ db, fetchImpl, now, random, batchSize, logger });
        } catch (err) {
          logger.error('[InquiryOutbox] delivery pass error:', err && err.message ? err.message : err);
        }
      } while (again);
      running = null;
      return last;
    })();
    return running;
  }

  return {
    start() {
      if (timer) return;
      timer = setInterval(runOnce, intervalMs);
      if (typeof timer.unref === 'function') timer.unref();
      runOnce(); // deliver anything left pending by a previous run/restart
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
    runOnce,
    kick: runOnce,
  };
}

let activeWorker = null;

function startInquiryOutboxWorker(options) {
  if (activeWorker) return activeWorker;
  activeWorker = createInquiryOutboxWorker(options);
  activeWorker.start();
  return activeWorker;
}

function stopInquiryOutboxWorker() {
  if (activeWorker) activeWorker.stop();
  activeWorker = null;
}

/** Ask the running worker to deliver now. A no-op when no worker is started. */
function kickInquiryOutbox() {
  return activeWorker ? activeWorker.kick() : Promise.resolve(null);
}

module.exports = {
  LEASE_MS,
  enqueueInquiry,
  retryDelayMs,
  processInquiryOutbox,
  getInquiryOutboxCounts,
  createInquiryOutboxWorker,
  startInquiryOutboxWorker,
  stopInquiryOutboxWorker,
  kickInquiryOutbox,
  MAX_ATTEMPTS,
  BASE_DELAY_MS,
  MAX_DELAY_MS,
};
