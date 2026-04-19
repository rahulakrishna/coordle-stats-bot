/**
 * One-off migration: sets guild_id on all snapshots that have guild_id = ''.
 * Safe to run multiple times (only touches rows with guild_id = '').
 *
 * Assumes all un-tagged snapshots belong to the single originally-configured guild.
 * If multiple guilds are configured, pass --guild <guildId> to specify which one.
 *
 * Usage:
 *   node scripts/backfill-guild-id.js
 *   node scripts/backfill-guild-id.js --guild <guildId>
 */

import { initDb, getAllConfiguredGuilds } from '../src/storage.js';
import { config } from '../src/config.js';

const db = initDb(config.dbPath);

const guildArg = process.argv.includes('--guild')
  ? process.argv[process.argv.indexOf('--guild') + 1]
  : null;

let guildId = guildArg;
if (!guildId) {
  const guilds = getAllConfiguredGuilds();
  if (guilds.length === 0) {
    console.error('No guilds configured. Run /setup-coordle-stats in your Discord server first.');
    process.exit(1);
  }
  guildId = guilds[0].guildId;
  if (guilds.length > 1) {
    console.log(`Multiple guilds found, using ${guildId}. Pass --guild <id> to specify.`);
  }
}

const { changes } = db
  .prepare(`UPDATE snapshots SET guild_id = ? WHERE guild_id = ''`)
  .run(guildId);

console.log(`Backfilled ${changes} snapshot rows with guild_id = ${guildId}`);
