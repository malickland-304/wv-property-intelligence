'use strict';

/**
 * Minimal SQLite-backed express-session store using the project's existing
 * better-sqlite3 connection.  Replaces the GPL-licensed better-sqlite3-session-store
 * with a dependency-free, MIT-compatible implementation.
 *
 * Implements the express-session Store interface:
 *   get(sid, cb), set(sid, session, cb), destroy(sid, cb),
 *   touch(sid, session, cb), length(cb)
 */

const { Store } = require('express-session');

const DEFAULT_TTL_SECONDS = 86400;      // 24 h
const DEFAULT_CLEAR_INTERVAL_MS = 15 * 60 * 1000;  // 15 min

class SqliteSessionStore extends Store {
  /**
   * @param {object} options
   * @param {import('better-sqlite3').Database} options.client   better-sqlite3 db instance
   * @param {number}  [options.ttl=86400]                        Session TTL in seconds
   * @param {{ clear?: boolean, intervalMs?: number }} [options.expired]  Expired-session pruning config
   */
  constructor({ client, ttl = DEFAULT_TTL_SECONDS, expired = {} } = {}) {
    super();
    this.db  = client;
    this.ttl = ttl;

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        sid     TEXT PRIMARY KEY,
        sess    TEXT NOT NULL,
        expired INTEGER NOT NULL
      )
    `);

    if (expired.clear !== false) {
      const intervalMs = expired.intervalMs || DEFAULT_CLEAR_INTERVAL_MS;
      this._pruneTimer = setInterval(() => this._pruneExpired(), intervalMs);
      this._pruneTimer.unref();
    }
  }

  _pruneExpired() {
    try {
      this.db.prepare('DELETE FROM sessions WHERE expired < ?').run(Date.now());
    } catch (err) {
      console.error('[SqliteSessionStore] Failed to prune expired sessions:', err.message);
    }
  }

  /** Compute expiry epoch (ms) from a session object. */
  _expiry(sess) {
    const ttlMs = sess && sess.cookie && sess.cookie.maxAge
      ? sess.cookie.maxAge
      : this.ttl * 1000;
    return Date.now() + ttlMs;
  }

  get(sid, cb) {
    try {
      const row = this.db.prepare(
        'SELECT sess FROM sessions WHERE sid = ? AND expired > ?'
      ).get(sid, Date.now());
      cb(null, row ? JSON.parse(row.sess) : null);
    } catch (err) {
      cb(err);
    }
  }

  set(sid, sess, cb) {
    try {
      this.db.prepare(`
        INSERT INTO sessions (sid, sess, expired) VALUES (?, ?, ?)
        ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expired = excluded.expired
      `).run(sid, JSON.stringify(sess), this._expiry(sess));
      cb(null);
    } catch (err) {
      cb(err);
    }
  }

  destroy(sid, cb) {
    try {
      this.db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
      cb(null);
    } catch (err) {
      cb(err);
    }
  }

  touch(sid, sess, cb) {
    try {
      this.db.prepare(
        'UPDATE sessions SET expired = ? WHERE sid = ?'
      ).run(this._expiry(sess), sid);
      cb(null);
    } catch (err) {
      cb(err);
    }
  }

  length(cb) {
    try {
      const row = this.db.prepare(
        'SELECT COUNT(*) AS count FROM sessions WHERE expired > ?'
      ).get(Date.now());
      cb(null, row.count);
    } catch (err) {
      cb(err);
    }
  }
}

module.exports = SqliteSessionStore;
