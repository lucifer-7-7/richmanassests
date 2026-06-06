'use strict';
const Database = require('better-sqlite3');
const path     = require('path');
const fs       = require('fs');

const ORIGINAL_DB_PATH = path.join(__dirname, 'rma.db');
const DB_PATH = process.env.VERCEL
  ? path.join('/tmp', 'rma.db')
  : ORIGINAL_DB_PATH;
let db;

function getDB() {
  if (!db) {
    if (process.env.VERCEL && !fs.existsSync(DB_PATH)) {
      try {
        if (fs.existsSync(ORIGINAL_DB_PATH)) {
          fs.copyFileSync(ORIGINAL_DB_PATH, DB_PATH);
        }
      } catch (err) {
        console.error('Failed to copy database to /tmp:', err);
      }
    }
    db = new Database(DB_PATH);
  }
  return db;
}

function initDB() {
  const db = getDB();

  db.exec(`
    CREATE TABLE IF NOT EXISTS properties (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      loc         TEXT NOT NULL,
      area        TEXT NOT NULL,
      type        TEXT NOT NULL,
      listing     TEXT NOT NULL CHECK(listing IN ('sale','rent','lease')),
      price       TEXT NOT NULL,
      price_val   REAL NOT NULL DEFAULT 0,
      price_note  TEXT,
      beds        TEXT,
      baths       TEXT,
      sqft        TEXT,
      subtype     TEXT,
      featured    INTEGER NOT NULL DEFAULT 0,
      badge_txt   TEXT,
      has_img     INTEGER NOT NULL DEFAULT 0,
      img_card    TEXT,
      img_hero    TEXT,
      story_kicker TEXT,
      story_heading TEXT,
      story_body  TEXT,
      amenities   TEXT,
      setting_heading TEXT,
      setting_body TEXT,
      setting_pills TEXT,
      emi_label   TEXT,
      emi_val     TEXT,
      next_id     TEXT,
      active      INTEGER NOT NULL DEFAULT 1,
      sort_order  INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS enquiries (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT,
      phone      TEXT,
      email      TEXT,
      service    TEXT,
      budget     TEXT,
      time_pref  TEXT,
      message    TEXT,
      property_ref TEXT,
      page       TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS testimonials (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      initials   TEXT,
      name       TEXT,
      role       TEXT,
      quote      TEXT,
      active     INTEGER NOT NULL DEFAULT 1
    );
  `);

  // migrate: add gallery column if not present (safe on existing DBs)
  try { db.exec(`ALTER TABLE properties ADD COLUMN gallery TEXT`); } catch (_) {}

  // migrate: add is_read column to enquiries if not present
  try { db.exec(`ALTER TABLE enquiries ADD COLUMN is_read INTEGER NOT NULL DEFAULT 0`); } catch (_) {}

  // migrate: strip em/en dashes from prose copy on already-seeded rows (idempotent).
  // Leaves beds/baths/sqft '—' placeholder sentinels untouched (those have no surrounding spaces).
  try {
    const proseCols = ['story_body','setting_body','story_heading','story_kicker','setting_heading','setting_pills'];
    for (const c of proseCols) {
      db.exec(`UPDATE properties SET ${c} = REPLACE(${c}, ' — ', ', ') WHERE ${c} LIKE '% — %'`);
      db.exec(`UPDATE properties SET ${c} = REPLACE(${c}, '–', ' to ') WHERE ${c} LIKE '%–%'`);
    }
  } catch (_) {}

  // seed if empty
  const count = db.prepare('SELECT COUNT(*) as c FROM properties').get();
  if (count.c === 0) {
    const seed = require('../data/seed');
    seed(db);
    console.log('DB seeded.');
  }

  return db;
}

module.exports = { getDB, initDB };
