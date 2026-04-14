/**
 * One-shot manual trigger: connects to Discord, waits for you to type !top,
 * captures the Co-ordle bot's leaderboard response, saves it, posts the
 * daily stats summary, then exits.
 *
 * Usage: node scripts/run-now.js
 */

import { Client, GatewayIntentBits, Events } from 'discord.js';
import { config } from '../src/config.js';
import { initDb } from '../src/storage.js';
import { parseLeaderboard, resolvePlayerNames } from '../src/parser.js';
import { saveSnapshot } from '../src/storage.js';
import { postDailySummary } from '../src/scheduler.js';

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
  console.log(`[run-now] Listening in channel ${config.coordleChannelId}...`);
  console.log(`[run-now] Now type !top in your Discord channel.`);
});

client.on(Events.MessageCreate, async (message) => {
  if (message.channelId !== config.coordleChannelId) return;
  if (message.author.id !== config.coordleBotId) return;

  console.log(`[run-now] Co-ordle bot responded. Parsing leaderboard...`);
  console.log(`[run-now] Embed description: ${message.embeds?.[0]?.description ?? '(none)'}`);
  console.log(`[run-now] Message content: ${message.content || '(none)'}`);

  const rawEntries = parseLeaderboard(message);

  if (!rawEntries) {
    console.error('[run-now] Could not parse leaderboard. Raw embed description:');
    console.error(message.embeds?.[0]?.description ?? '(none)');
    process.exit(1);
  }

  console.log(`[run-now] Resolving ${rawEntries.length} player names...`);
  const entries = await resolvePlayerNames(message, rawEntries);

  const date = new Date().toISOString().slice(0, 10);
  const { inserted, renamed } = saveSnapshot(date, entries);
  console.log(`[run-now] Saved ${inserted} rows for ${date}:`, entries);
  for (const r of renamed) {
    console.log(`[run-now] Name change detected: "${r.from}" → "${r.to}" — updated all history`);
  }

  console.log(`[run-now] Posting daily summary...`);
  await postDailySummary(client, date);

  console.log('[run-now] Done.');
  process.exit(0);
});

client.login(config.token);
