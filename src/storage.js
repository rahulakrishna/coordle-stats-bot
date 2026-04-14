import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname } from 'path';

let db;

export function initDb(dbPath) {
  mkdirSync(dirname(dbPath), { recursive: true });
  db = new Database(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS snapshots (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      date        TEXT NOT NULL,
      player      TEXT NOT NULL,
      score       INTEGER NOT NULL,
      rank        INTEGER NOT NULL,
      captured_at TEXT NOT NULL,
      UNIQUE(date, player)
    )
  `);

  return db;
}

/**
 * Save a leaderboard snapshot for a given date.
 * Idempotent — skips rows that already exist for (date, player).
 *
 * @param {string} date - ISO date string e.g. "2026-04-14"
 * @param {{ rank: number, player: string, score: number }[]} entries
 * @returns {number} rows inserted
 */
export function saveSnapshot(date, entries) {
  const capturedAt = new Date().toISOString();
  const insert = db.prepare(`
    INSERT OR REPLACE INTO snapshots (date, player, score, rank, captured_at)
    VALUES (@date, @player, @score, @rank, @capturedAt)
  `);

  let inserted = 0;
  const run = db.transaction(() => {
    for (const e of entries) {
      const result = insert.run({ date, player: e.player, score: e.score, rank: e.rank, capturedAt });
      inserted += result.changes;
    }
  });
  run();
  return inserted;
}

/**
 * @param {string} date
 * @returns {{ rank: number, player: string, score: number }[]}
 */
export function getSnapshot(date) {
  return db
    .prepare('SELECT rank, player, score FROM snapshots WHERE date = ? ORDER BY rank ASC')
    .all(date);
}

/**
 * Returns the most recently captured snapshot date before (or on) the given date.
 * @param {string} beforeDate - ISO date string
 * @returns {string | null}
 */
export function getLatestSnapshotDate(beforeDate) {
  const row = db
    .prepare('SELECT date FROM snapshots WHERE date <= ? ORDER BY date DESC LIMIT 1')
    .get(beforeDate);
  return row?.date ?? null;
}

/**
 * @param {string} date
 * @returns {string | null} The most recent snapshot date strictly before `date`
 */
export function getPreviousSnapshotDate(date) {
  const row = db
    .prepare('SELECT date FROM snapshots WHERE date < ? ORDER BY date DESC LIMIT 1')
    .get(date);
  return row?.date ?? null;
}
