import { Client, GatewayIntentBits } from 'discord.js';
import { config } from './config.js';
import { initDb, getSnapshot, getPreviousSnapshotDate, getLatestSnapshotDate } from './storage.js';
import { computeDailyStats } from './stats.js';
import { buildDailyEmbed } from './formatter.js';
import { registerSchedules, handleLeaderboardMessage, postDailySummary } from './scheduler.js';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function dateLabel(isoDate) {
  return new Date(isoDate + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
  });
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once('clientReady', () => {
  console.log(`[bot] Logged in as ${client.user.tag}`);
  initDb(config.dbPath);
  registerSchedules(client);
});

client.on('messageCreate', async (message) => {
  if (message.channelId !== config.coordleChannelId) return;

  // Passively capture Co-ordle leaderboard responses
  if (message.author.id === config.coordleBotId) {
    const result = await handleLeaderboardMessage(message);
    if (result) {
      await postDailySummary(client, result.date);
    }
    return;
  }

  // !stats command from human users
  if (!message.author.bot && message.content.trim().toLowerCase() === '!stats') {
    const today = todayISO();
    const latestDate = getLatestSnapshotDate(today);

    if (!latestDate) {
      await message.reply('No snapshot data yet — data is captured whenever someone runs `!top`.');
      return;
    }

    const currentSnapshot = getSnapshot(latestDate);
    const prevDate = getPreviousSnapshotDate(latestDate);
    const prevSnapshot = prevDate ? getSnapshot(prevDate) : null;

    const stats = computeDailyStats(currentSnapshot, prevSnapshot);
    const embed = buildDailyEmbed(stats, dateLabel(latestDate));
    await message.reply({ embeds: [embed] });
  }
});

client.login(config.token);
