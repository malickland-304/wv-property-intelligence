'use strict';

/**
 * db-migrate-ai.js
 *
 * Adds AI content columns to the properties table.
 * Run once: node api/db-migrate-ai.js
 * Safe to re-run — uses ALTER TABLE IF NOT EXISTS pattern.
 */

const Database = require('better-sqlite3');
const path     = require('path');

const DB_PATH = path.join(__dirname, '..', 'database', 'wv_property.db');
const db      = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

const columns = [
  ['ai_content',      'TEXT'],    // full JSON blob of all generated content
  ['ai_generated_at', 'TEXT'],    // ISO timestamp of last AI generation
];

let added = 0;
for (const [col, type] of columns) {
  try {
    db.exec(`ALTER TABLE properties ADD COLUMN ${col} ${type}`);
    console.log(`✅ Added column: ${col}`);
    added++;
  } catch (e) {
    if (e.message.includes('duplicate column')) {
      console.log(`⏭  Column already exists: ${col}`);
    } else {
      throw e;
    }
  }
}

console.log(`\nMigration complete. ${added} column(s) added.`);
db.close();
