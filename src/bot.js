import { Client, GatewayIntentBits, Events } from 'discord.js';
import { config } from './config.js';
import { initDb, getSnapshot, getPreviousSnapshotDate, getLatestSnapshotDate, getGuildConfig } from './storage.js';
import { computeDailyStats } from './stats.js';
import { buildDailyEmbed } from './formatter.js';
import { registerSchedules, handleLeaderboardMessage, postDailySummary } from './scheduler.js';
import { handleSetupCommand, registerCommands } from './commands.js';

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

client.once('clientReady', async () => {
  console.log(`[bot] Logged in as ${client.user.tag}`);
  initDb(config.dbPath);
  registerSchedules(client);

  // Register slash commands globally
  await registerCommands(client.user.id);
});

// Welcome message when bot joins a new server
client.on(Events.GuildCreate, async (guild) => {
  const channel = guild.systemChannel ?? guild.channels.cache.find(c => c.isTextBased());
  if (!channel) return;
  await channel.send(
    `👋 Thanks for adding **Coordle Stats**!\n\nGet started with two commands:\n` +
    `• \`/setup-coordle-stats channel #your-coordle-channel\`\n` +
    `• \`/setup-coordle-stats coordle-bot @Co-ordle\`\n\n` +
    `Once configured, stats will be posted automatically after every \`!top\`.`
  );
});

// Slash command handler
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === 'setup-coordle-stats') {
    await handleSetupCommand(interaction);
  }
});

// Message handler
client.on(Events.MessageCreate, async (message) => {
  if (!message.guildId) return;

  const guildCfg = getGuildConfig(message.guildId);
  if (!guildCfg) return;

  if (message.channelId !== guildCfg.coordleChannelId) return;

  // Passively capture Co-ordle leaderboard responses
  if (guildCfg.coordleBotId && message.author.id === guildCfg.coordleBotId) {
    const result = await handleLeaderboardMessage(message);
    if (result && guildCfg.statsChannelId) {
      await postDailySummary(client, result.guildId, result.date, guildCfg.statsChannelId);
    }
    return;
  }

  // !stats command from human users
  if (!message.author.bot && message.content.trim().toLowerCase() === '!stats') {
    const today = todayISO();
    const latestDate = getLatestSnapshotDate(message.guildId, today);

    if (!latestDate) {
      await message.reply('No snapshot data yet — data is captured whenever someone runs `!top`.');
      return;
    }

    const currentSnapshot = getSnapshot(message.guildId, latestDate);
    const prevDate = getPreviousSnapshotDate(message.guildId, latestDate);
    const prevSnapshot = prevDate ? getSnapshot(message.guildId, prevDate) : null;

    const stats = computeDailyStats(currentSnapshot, prevSnapshot);
    const embed = buildDailyEmbed(stats, dateLabel(latestDate));
    await message.reply({ embeds: [embed] });
  }
});

client.login(config.token);
