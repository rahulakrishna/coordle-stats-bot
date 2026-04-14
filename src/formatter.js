import { EmbedBuilder } from 'discord.js';

const MEDAL = ['🥇', '🥈', '🥉'];

function rankEmoji(rank) {
  return MEDAL[rank - 1] ?? `**${rank}.**`;
}

function deltaStr(delta) {
  if (delta == null) return '`  new  `';
  if (delta > 0) return `\`▲ +${delta}\``;
  if (delta < 0) return `\`▼ ${delta}\``;
  return '`  ——  `';
}

function winBar(pct) {
  const filled = Math.round(pct / 10);
  return '█'.repeat(filled) + '░'.repeat(10 - filled);
}

/**
 * Build the daily stats embed.
 * @param {import('./stats.js').DailyStats} stats
 * @param {string} dateLabel  e.g. "April 14"
 */
export function buildDailyEmbed(stats, dateLabel) {
  const { gainers, gaps, winProbabilities, daysRemaining } = stats;

  // Section A: Gainers & Losers
  const gainersLines = gainers.map((e) => {
    const d = deltaStr(e.delta);
    return `${rankEmoji(e.rank)} **${e.player}** — ${e.score} pts  ${d}`;
  });

  // Section B: Gap Deltas (top 10)
  const gapLines = gaps.slice(0, 9).map((g) => {
    const arrow = g.delta == null ? '' : g.delta > 0 ? ' ↑' : g.delta < 0 ? ' ↓' : '';
    const prevNote = g.prevGap != null ? ` (was ${g.prevGap}, Δ${g.delta > 0 ? '+' : ''}${g.delta ?? '?'})` : '';
    return `**#${g.upperRank}→#${g.lowerRank}**: ${g.gap} pts gap${prevNote}${arrow}`;
  });

  // Section C: Win Probability
  const winLines = winProbabilities.map((p) => {
    const bar = winBar(p.winPct);
    return `${rankEmoji(p.rank)} **${p.player}** ${bar} ${p.winPct.toFixed(1)}%`;
  });

  return new EmbedBuilder()
    .setTitle(`📊 Co-ordle Daily Stats — ${dateLabel}`)
    .setColor(0x5865f2)
    .addFields(
      {
        name: '📈 Gainers & Losers',
        value: gainersLines.join('\n') || 'No data',
      },
      {
        name: '↔️ Gap Delta (rank gaps)',
        value: gapLines.join('\n') || 'No data',
      },
      {
        name: `🎯 Win Probability (${daysRemaining}d remaining)`,
        value: winLines.join('\n') || 'No data',
      },
    )
    .setFooter({ text: 'Scores update daily at 11 PM · !stats for on-demand' })
    .setTimestamp();
}

/**
 * Build the monthly winner announcement embed.
 * @param {{ rank: number, player: string, score: number }[]} finalLeaderboard
 * @param {string} monthLabel  e.g. "April 2026"
 */
export function buildMonthlyWinnerEmbed(finalLeaderboard, monthLabel) {
  const winner = finalLeaderboard[0];
  if (!winner) return null;

  const lines = finalLeaderboard.map(
    (e) => `${rankEmoji(e.rank)} **${e.player}** — ${e.score} pts`,
  );

  return new EmbedBuilder()
    .setTitle(`🏆 ${winner.player} wins ${monthLabel}!`)
    .setDescription(`Final score: **${winner.score} pts**\n\n${lines.join('\n')}`)
    .setColor(0xffd700)
    .setFooter({ text: 'Co-ordle Stats Bot' })
    .setTimestamp();
}
