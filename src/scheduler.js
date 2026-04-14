import cron from 'node-cron';
import { config } from './config.js';
import { parseLeaderboard, resolvePlayerNames } from './parser.js';
import { saveSnapshot, getSnapshot, getPreviousSnapshotDate, getLatestSnapshotDate } from './storage.js';
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
  return next.getDate() === 1;
}

/**
 * Called whenever the Co-ordle bot posts a leaderboard message (passively captured).
 * Parses and stores the snapshot.
 * @param {import('discord.js').Message} message
 * @returns {{ date: string, entries: object[] } | null}
 */
export async function handleLeaderboardMessage(message) {
  const rawEntries = parseLeaderboard(message);
  if (!rawEntries) return null;

  const entries = await resolvePlayerNames(message, rawEntries);
  const date = todayISO();
  const inserted = saveSnapshot(date, entries);
  console.log(`[scheduler] Captured leaderboard — saved ${inserted} new rows for ${date}`);

  return { date, entries };
}

/**
 * Post the daily stats summary to the stats channel.
 * @param {import('discord.js').Client} client
 * @param {string} date  ISO date string
 */
export async function postDailySummary(client, date) {
  const statsChannel = await client.channels.fetch(config.statsChannelId);
  if (!statsChannel?.isTextBased()) {
    console.error('[scheduler] Stats channel not found or not text-based');
    return;
  }

  const today = getSnapshot(date);
  const prevDate = getPreviousSnapshotDate(date);
  const yesterday = prevDate ? getSnapshot(prevDate) : null;

  if (today.length === 0) {
    console.error(`[scheduler] No snapshot for ${date}, skipping summary`);
    return;
  }

  const stats = computeDailyStats(today, yesterday);
  const embed = buildDailyEmbed(stats, dateLabel(date));
  await statsChannel.send({ embeds: [embed] });
  console.log(`[scheduler] Posted daily summary for ${date}`);

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

  // Daily summary at configured hour — uses most recent snapshot captured that day
  cron.schedule(`0 ${hour} * * *`, async () => {
    console.log(`[scheduler] Running daily summary (${hour}:00)`);
    const date = todayISO();
    const latestDate = getLatestSnapshotDate(date);
    if (!latestDate) {
      console.error('[scheduler] No snapshots found yet, skipping summary');
      return;
    }
    await postDailySummary(client, latestDate);
  });

  console.log(`[scheduler] Registered daily summary cron at ${hour}:00`);
}
