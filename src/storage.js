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
      user_id     TEXT NOT NULL,
      player      TEXT NOT NULL,
      score       INTEGER NOT NULL,
      rank        INTEGER NOT NULL,
      captured_at TEXT NOT NULL,
      UNIQUE(date, user_id)
    )
  `);

  return db;
}

/**
 * Save a leaderboard snapshot, updating all historical rows if a player's
 * display name has changed since last seen.
 *
 * @param {string} date - ISO date string e.g. "2026-04-14"
 * @param {{ rank: number, userId: string, player: string, score: number }[]} entries
 * @returns {{ inserted: number, renamed: { userId: string, from: string, to: string }[] }}
 */
export function saveSnapshot(date, entries) {
  const capturedAt = new Date().toISOString();

  const upsert = db.prepare(`
    INSERT OR REPLACE INTO snapshots (date, user_id, player, score, rank, captured_at)
    VALUES (@date, @userId, @player, @score, @rank, @capturedAt)
  `);

  const getLastName = db.prepare(`
    SELECT player FROM snapshots WHERE user_id = ? ORDER BY date DESC LIMIT 1
  `);

  const renameHistory = db.prepare(`
    UPDATE snapshots SET player = ? WHERE user_id = ?
  `);

  let inserted = 0;
  const renamed = [];

  const run = db.transaction(() => {
    for (const e of entries) {
      // Check if this user has a different stored name
      const existing = getLastName.get(e.userId);
      if (existing && existing.player !== e.player) {
        renameHistory.run(e.player, e.userId);
        renamed.push({ userId: e.userId, from: existing.player, to: e.player });
      }

      const result = upsert.run({
        date,
        userId: e.userId,
        player: e.player,
        score: e.score,
        rank: e.rank,
        capturedAt,
      });
      inserted += result.changes;
    }
  });
  run();

  return { inserted, renamed };
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
