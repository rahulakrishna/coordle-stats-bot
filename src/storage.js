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
      guild_id    TEXT NOT NULL DEFAULT '',
      date        TEXT NOT NULL,
      user_id     TEXT NOT NULL,
      player      TEXT NOT NULL,
      score       INTEGER NOT NULL,
      rank        INTEGER NOT NULL,
      captured_at TEXT NOT NULL,
      UNIQUE(guild_id, date, user_id)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS guild_config (
      guild_id            TEXT PRIMARY KEY,
      coordle_channel_id  TEXT,
      coordle_bot_id      TEXT,
      stats_channel_id    TEXT
    )
  `);

  // Migrations
  const cols = db.prepare(`PRAGMA table_info(snapshots)`).all();
  if (!cols.find(c => c.name === 'user_id')) {
    db.exec(`ALTER TABLE snapshots ADD COLUMN user_id TEXT NOT NULL DEFAULT ''`);
  }
  if (!cols.find(c => c.name === 'guild_id')) {
    db.exec(`ALTER TABLE snapshots ADD COLUMN guild_id TEXT NOT NULL DEFAULT ''`);
  }

  // Backfill: assign the first configured guild to any untagged snapshots
  const untagged = db.prepare(`SELECT COUNT(*) as n FROM snapshots WHERE guild_id = ''`).get();
  if (untagged.n > 0) {
    const firstGuild = db.prepare(`SELECT guild_id FROM guild_config LIMIT 1`).get();
    if (firstGuild) {
      const { changes } = db.prepare(`UPDATE snapshots SET guild_id = ? WHERE guild_id = ''`).run(firstGuild.guild_id);
      console.log(`[db] Backfilled ${changes} snapshot rows with guild_id = ${firstGuild.guild_id}`);
    }
  }

  // Fix UNIQUE constraint: old DBs have UNIQUE(date, user_id) without guild_id,
  // which causes cross-guild data corruption via INSERT OR REPLACE.
  // Recreate the table with the correct UNIQUE(guild_id, date, user_id) if needed.
  const indexList = db.prepare(`PRAGMA index_list(snapshots)`).all();
  const hasCorrectUnique = indexList.some(idx => {
    if (!idx.unique) return false;
    const idxCols = db.prepare(`PRAGMA index_info(${idx.name})`).all().map(c => c.name);
    return idxCols.includes('guild_id') && idxCols.includes('date') && idxCols.includes('user_id');
  });

  if (!hasCorrectUnique) {
    db.exec(`
      CREATE TABLE snapshots_new (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id    TEXT NOT NULL DEFAULT '',
        date        TEXT NOT NULL,
        user_id     TEXT NOT NULL,
        player      TEXT NOT NULL,
        score       INTEGER NOT NULL,
        rank        INTEGER NOT NULL,
        captured_at TEXT NOT NULL,
        UNIQUE(guild_id, date, user_id)
      );
      INSERT INTO snapshots_new (id, guild_id, date, user_id, player, score, rank, captured_at)
        SELECT id, guild_id, date, user_id, player, score, rank, captured_at FROM snapshots;
      DROP TABLE snapshots;
      ALTER TABLE snapshots_new RENAME TO snapshots;
    `);
    console.log(`[db] Migrated snapshots table to UNIQUE(guild_id, date, user_id)`);
  }

  return db;
}

// ---------------------------------------------------------------------------
// Guild config
// ---------------------------------------------------------------------------

/**
 * @param {string} guildId
 * @returns {{ coordleChannelId: string|null, coordleBotId: string|null, statsChannelId: string|null } | null}
 */
export function getGuildConfig(guildId) {
  const row = db
    .prepare('SELECT coordle_channel_id, coordle_bot_id, stats_channel_id FROM guild_config WHERE guild_id = ?')
    .get(guildId);
  if (!row) return null;
  return {
    coordleChannelId: row.coordle_channel_id,
    coordleBotId: row.coordle_bot_id,
    statsChannelId: row.stats_channel_id,
  };
}

/**
 * Upsert a single config field for a guild.
 * @param {string} guildId
 * @param {'coordle_channel_id'|'coordle_bot_id'|'stats_channel_id'} key
 * @param {string} value
 */
export function setGuildConfig(guildId, key, value) {
  const allowed = ['coordle_channel_id', 'coordle_bot_id', 'stats_channel_id'];
  if (!allowed.includes(key)) throw new Error(`Invalid config key: ${key}`);

  db.prepare(`
    INSERT INTO guild_config (guild_id, ${key})
    VALUES (?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET ${key} = excluded.${key}
  `).run(guildId, value);
}

/**
 * Returns all guilds that have a stats channel configured.
 * @returns {{ guildId: string, statsChannelId: string }[]}
 */
export function getAllConfiguredGuilds() {
  return db
    .prepare('SELECT guild_id, stats_channel_id FROM guild_config WHERE stats_channel_id IS NOT NULL')
    .all()
    .map(r => ({ guildId: r.guild_id, statsChannelId: r.stats_channel_id }));
}

// ---------------------------------------------------------------------------
// Snapshots
// ---------------------------------------------------------------------------

/**
 * Save a leaderboard snapshot, updating all historical rows if a player's
 * display name has changed since last seen.
 *
 * @param {string} guildId
 * @param {string} date - ISO date string e.g. "2026-04-14"
 * @param {{ rank: number, userId: string, player: string, score: number }[]} entries
 * @returns {{ inserted: number, renamed: { userId: string, from: string, to: string }[] }}
 */
export function saveSnapshot(guildId, date, entries) {
  const capturedAt = new Date().toISOString();

  const upsert = db.prepare(`
    INSERT OR REPLACE INTO snapshots (guild_id, date, user_id, player, score, rank, captured_at)
    VALUES (@guildId, @date, @userId, @player, @score, @rank, @capturedAt)
  `);

  const getLastName = db.prepare(`
    SELECT player FROM snapshots WHERE guild_id = ? AND user_id = ? ORDER BY date DESC LIMIT 1
  `);

  const renameHistory = db.prepare(`
    UPDATE snapshots SET player = ? WHERE guild_id = ? AND user_id = ?
  `);

  let inserted = 0;
  const renamed = [];

  const run = db.transaction(() => {
    for (const e of entries) {
      const existing = getLastName.get(guildId, e.userId);
      if (existing && existing.player !== e.player) {
        renameHistory.run(e.player, guildId, e.userId);
        renamed.push({ userId: e.userId, from: existing.player, to: e.player });
      }

      const result = upsert.run({
        guildId,
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
 * @param {string} guildId
 * @param {string} date
 * @returns {{ rank: number, player: string, score: number }[]}
 */
export function getSnapshot(guildId, date) {
  return db
    .prepare('SELECT rank, player, score FROM snapshots WHERE guild_id = ? AND date = ? ORDER BY rank ASC')
    .all(guildId, date);
}

/**
 * Returns the most recently captured snapshot date before (or on) the given date.
 * @param {string} guildId
 * @param {string} beforeDate - ISO date string
 * @returns {string | null}
 */
export function getLatestSnapshotDate(guildId, beforeDate) {
  const row = db
    .prepare('SELECT date FROM snapshots WHERE guild_id = ? AND date <= ? ORDER BY date DESC LIMIT 1')
    .get(guildId, beforeDate);
  return row?.date ?? null;
}

/**
 * @param {string} guildId
 * @param {string} date
 * @returns {string | null} The most recent snapshot date strictly before `date`
 */
export function getPreviousSnapshotDate(guildId, date) {
  const row = db
    .prepare('SELECT date FROM snapshots WHERE guild_id = ? AND date < ? ORDER BY date DESC LIMIT 1')
    .get(guildId, date);
  return row?.date ?? null;
}
