import cron from 'node-cron';
import { config } from './config.js';
import { parseLeaderboard, resolvePlayerNames } from './parser.js';
import { saveSnapshot, getSnapshot, getPreviousSnapshotDate, getLatestSnapshotDate, getAllConfiguredGuilds } from './storage.js';
import { computeDailyStats } from './stats.js';
import { buildDailyEmbed, buildMonthlyWinnerEmbed } from './formatter.js';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function dateLabel(isoDate) {
  return new Date(isoDate + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
  });
}

function monthLabel(isoDate) {
  return new Date(isoDate + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}

function isLastDayOfMonth(date = new Date()) {
  const next = new Date(date);
  next.setDate(next.getDate() + 1);
  return next.getDate() === 1 && date.getHours() >= 23;
}

/**
 * Called whenever the Co-ordle bot posts a leaderboard message (passively captured).
 * @param {import('discord.js').Message} message
 * @returns {Promise<{ date: string, entries: object[], guildId: string } | null>}
 */
export async function handleLeaderboardMessage(message) {
  const rawEntries = parseLeaderboard(message);
  if (!rawEntries) return null;

  const entries = await resolvePlayerNames(message, rawEntries);
  const date = todayISO();
  const { inserted, renamed } = saveSnapshot(message.guildId, date, entries);
  console.log(`[scheduler] Captured leaderboard — saved ${inserted} new rows for ${date}`);
  for (const r of renamed) {
    console.log(`[scheduler] Name change detected: "${r.from}" → "${r.to}" (${r.userId}) — updated all history`);
  }

  return { date, entries, guildId: message.guildId };
}

/**
 * Post the daily stats summary to the stats channel for a given guild.
 * @param {import('discord.js').Client} client
 * @param {string} guildId
 * @param {string} date  ISO date string
 * @param {string} statsChannelId
 */
export async function postDailySummary(client, guildId, date, statsChannelId) {
  const statsChannel = await client.channels.fetch(statsChannelId).catch(() => null);
  if (!statsChannel?.isTextBased()) {
    console.error(`[scheduler] Stats channel ${statsChannelId} not found or not text-based`);
    return;
  }

  const today = getSnapshot(guildId, date);
  const prevDate = getPreviousSnapshotDate(guildId, date);
  const yesterday = prevDate ? getSnapshot(guildId, prevDate) : null;

  if (today.length === 0) {
    console.error(`[scheduler] No snapshot for ${date}, skipping summary`);
    return;
  }

  const stats = computeDailyStats(today, yesterday);
  const embed = buildDailyEmbed(stats, dateLabel(date));
  await statsChannel.send({ embeds: [embed] });
  console.log(`[scheduler] Posted daily summary for ${date} in channel ${statsChannelId}`);

  if (isLastDayOfMonth()) {
    const winnerEmbed = buildMonthlyWinnerEmbed(today, monthLabel(date));
    if (winnerEmbed) {
      await statsChannel.send({ embeds: [winnerEmbed] });
      console.log(`[scheduler] Posted monthly winner announcement`);
    }
  }
}

/**
 * Register all cron jobs.
 * @param {import('discord.js').Client} client
 */
export function registerSchedules(client) {
  const hour = config.snapshotHour;

  cron.schedule(`0 ${hour} * * *`, async () => {
    console.log(`[scheduler] Running daily summary (${hour}:00)`);
    const date = todayISO();
    const guilds = getAllConfiguredGuilds();
    for (const { guildId, statsChannelId } of guilds) {
      const latestDate = getLatestSnapshotDate(guildId, date);
      if (!latestDate) {
        console.error(`[scheduler] No snapshots found yet for guild ${guildId}, skipping summary`);
        continue;
      }
      await postDailySummary(client, guildId, latestDate, statsChannelId);
    }
  });

  console.log(`[scheduler] Registered daily summary cron at ${hour}:00`);
}
