/**
 * Compute daily analytics from two leaderboard snapshots.
 *
 * @param {{ rank: number, player: string, score: number }[]} today
 * @param {{ rank: number, player: string, score: number }[] | null} yesterday
 * @param {Date} [now] - reference date for month-end calculations (default: new Date())
 * @returns {DailyStats}
 */
export function computeDailyStats(today, yesterday, now = new Date()) {
  const todayMap = Object.fromEntries(today.map((e) => [e.player, e]));
  const yesterdayMap = yesterday
    ? Object.fromEntries(yesterday.map((e) => [e.player, e]))
    : {};

  // --- Gainers & Losers ---
  const gainers = today.map((e) => {
    const prev = yesterdayMap[e.player];
    const delta = prev != null ? e.score - prev.score : null;
    return { ...e, delta };
  });
  gainers.sort((a, b) => {
    // Players with known delta first, sorted desc by delta
    if (a.delta == null && b.delta == null) return a.rank - b.rank;
    if (a.delta == null) return 1;
    if (b.delta == null) return -1;
    return b.delta - a.delta;
  });

  // --- Gap Deltas (adjacent rank gaps) ---
  const gaps = [];
  for (let i = 0; i < today.length - 1; i++) {
    const upper = today[i];
    const lower = today[i + 1];
    const gapToday = upper.score - lower.score;

    let gapYesterday = null;
    const upperPrev = yesterdayMap[upper.player];
    const lowerPrev = yesterdayMap[lower.player];
    if (upperPrev != null && lowerPrev != null) {
      gapYesterday = upperPrev.score - lowerPrev.score;
    }

    gaps.push({
      upperRank: upper.rank,
      upperPlayer: upper.player,
      lowerRank: lower.rank,
      lowerPlayer: lower.player,
      gap: gapToday,
      prevGap: gapYesterday,
      delta: gapYesterday != null ? gapToday - gapYesterday : null,
    });
  }

  // --- Win Probability ---
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const dayOfMonth = now.getDate();
  const daysRemaining = daysInMonth - dayOfMonth;

  const projections = today.map((e) => {
    const daysElapsed = dayOfMonth;
    const avgDailyGain = daysElapsed > 0 ? e.score / daysElapsed : 0;
    const projected = e.score + avgDailyGain * daysRemaining;
    return { player: e.player, rank: e.rank, score: e.score, projected };
  });

  const totalProjected = projections.reduce((sum, p) => sum + p.projected, 0);
  const winProbabilities = projections.map((p) => ({
    ...p,
    winPct: totalProjected > 0 ? (p.projected / totalProjected) * 100 : 0,
  }));
  winProbabilities.sort((a, b) => b.winPct - a.winPct);

  return { gainers, gaps, winProbabilities, daysRemaining, daysInMonth, dayOfMonth };
}

/**
 * @typedef {{
 *   gainers: { rank: number, player: string, score: number, delta: number|null }[],
 *   gaps: { upperRank: number, upperPlayer: string, lowerRank: number, lowerPlayer: string, gap: number, prevGap: number|null, delta: number|null }[],
 *   winProbabilities: { player: string, rank: number, score: number, projected: number, winPct: number }[],
 *   daysRemaining: number,
 *   daysInMonth: number,
 *   dayOfMonth: number,
 * }} DailyStats
 */
