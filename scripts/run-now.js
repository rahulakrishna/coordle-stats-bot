/**
 * One-shot manual trigger: connects to Discord, waits for you to type !top,
 * captures the Co-ordle bot's leaderboard response, saves it, posts the
 * daily stats summary, then exits.
 *
 * Usage:
 *   node scripts/run-now.js
 *   node scripts/run-now.js --guild <guildId>   (if multiple guilds are configured)
 */

import { Client, GatewayIntentBits, Events } from 'discord.js';
import { config } from '../src/config.js';
import { initDb, getGuildConfig, getAllConfiguredGuilds } from '../src/storage.js';
import { parseLeaderboard, resolvePlayerNames } from '../src/parser.js';
import { saveSnapshot } from '../src/storage.js';
import { postDailySummary } from '../src/scheduler.js';

const guildArg = process.argv.includes('--guild')
  ? process.argv[process.argv.indexOf('--guild') + 1]
  : null;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once('clientReady', async () => {
  console.log(`[run-now] Logged in as ${client.user.tag}`);
  initDb(config.dbPath);

  // Resolve which guild to use
  let guildId = guildArg;
  if (!guildId) {
    const guilds = getAllConfiguredGuilds();
    if (guilds.length === 0) {
      console.error('[run-now] No guilds configured yet. Run /setup-coordle-stats in your Discord server first.');
      process.exit(1);
    }
    guildId = guilds[0].guildId;
    if (guilds.length > 1) {
      console.log(`[run-now] Multiple guilds found, using ${guildId}. Pass --guild <id> to specify.`);
    }
  }

  const guildCfg = getGuildConfig(guildId);
  if (!guildCfg?.coordleChannelId || !guildCfg?.coordleBotId) {
    console.error(`[run-now] Guild ${guildId} is missing channel or coordle-bot config. Run /setup-coordle-stats first.`);
    process.exit(1);
  }

  console.log(`[run-now] Listening in channel ${guildCfg.coordleChannelId} for Co-ordle bot ${guildCfg.coordleBotId}...`);
  console.log(`[run-now] Now type !top in your Discord channel.`);
});

client.on(Events.MessageCreate, async (message) => {
  if (!message.guildId) return;

  const guildCfg = getGuildConfig(message.guildId);
  if (!guildCfg) return;
  if (message.channelId !== guildCfg.coordleChannelId) return;
  if (message.author.id !== guildCfg.coordleBotId) return;

  console.log(`[run-now] Co-ordle bot responded. Parsing leaderboard...`);

  const rawEntries = parseLeaderboard(message);
  if (!rawEntries) {
    console.error('[run-now] Could not parse leaderboard. Raw embed description:');
    console.error(message.embeds?.[0]?.description ?? '(none)');
    process.exit(1);
  }

  console.log(`[run-now] Resolving ${rawEntries.length} player names...`);
  const entries = await resolvePlayerNames(message, rawEntries);

  const date = new Date().toISOString().slice(0, 10);
  const { inserted, renamed } = saveSnapshot(message.guildId, date, entries);
  console.log(`[run-now] Saved ${inserted} rows for ${date}:`, entries);
  for (const r of renamed) {
    console.log(`[run-now] Name change detected: "${r.from}" → "${r.to}" — updated all history`);
  }

  if (guildCfg.statsChannelId) {
    console.log(`[run-now] Posting daily summary...`);
    await postDailySummary(client, message.guildId, date, guildCfg.statsChannelId);
  }

  console.log('[run-now] Done.');
  process.exit(0);
});

client.login(config.token);
