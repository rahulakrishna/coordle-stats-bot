import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeDailyStats } from '../src/stats.js';

const TODAY = [
  { rank: 1, player: 'Alice', score: 100 },
  { rank: 2, player: 'Bob', score: 80 },
  { rank: 3, player: 'Carol', score: 50 },
];

const YESTERDAY = [
  { rank: 1, player: 'Alice', score: 90 },
  { rank: 2, player: 'Bob', score: 78 },
  { rank: 3, player: 'Carol', score: 45 },
];

// Reference date: April 14, 2026 (14 days elapsed, 16 remaining)
const NOW = new Date('2026-04-14T12:00:00');

test('gainers are sorted by delta descending', () => {
  const { gainers } = computeDailyStats(TODAY, YESTERDAY, NOW);
  // Alice +10, Carol +5, Bob +2
  assert.equal(gainers[0].player, 'Alice');
  assert.equal(gainers[0].delta, 10);
  assert.equal(gainers[1].player, 'Carol');
  assert.equal(gainers[1].delta, 5);
  assert.equal(gainers[2].player, 'Bob');
  assert.equal(gainers[2].delta, 2);
});

test('new player has null delta', () => {
  const todayWithNew = [...TODAY, { rank: 4, player: 'Dave', score: 10 }];
  const { gainers } = computeDailyStats(todayWithNew, YESTERDAY, NOW);
  const dave = gainers.find((g) => g.player === 'Dave');
  assert.equal(dave.delta, null);
});

test('gap deltas are computed correctly', () => {
  const { gaps } = computeDailyStats(TODAY, YESTERDAY, NOW);
  // Rank 1→2: today 100-80=20, yesterday 90-78=12, delta=+8
  assert.equal(gaps[0].gap, 20);
  assert.equal(gaps[0].prevGap, 12);
  assert.equal(gaps[0].delta, 8);
  // Rank 2→3: today 80-50=30, yesterday 78-45=33, delta=-3
  assert.equal(gaps[1].gap, 30);
  assert.equal(gaps[1].prevGap, 33);
  assert.equal(gaps[1].delta, -3);
});

test('win probabilities sum to ~100%', () => {
  const { winProbabilities } = computeDailyStats(TODAY, YESTERDAY, NOW);
  const total = winProbabilities.reduce((s, p) => s + p.winPct, 0);
  assert.ok(Math.abs(total - 100) < 0.01, `Expected ~100%, got ${total}`);
});

test('win probabilities are sorted descending', () => {
  const { winProbabilities } = computeDailyStats(TODAY, YESTERDAY, NOW);
  for (let i = 1; i < winProbabilities.length; i++) {
    assert.ok(winProbabilities[i - 1].winPct >= winProbabilities[i].winPct);
  }
});

test('works with no previous snapshot (first day)', () => {
  const { gainers, gaps } = computeDailyStats(TODAY, null, NOW);
  assert.ok(gainers.every((g) => g.delta === null));
  assert.ok(gaps.every((g) => g.prevGap === null && g.delta === null));
});

test('daysRemaining is correct for April 14', () => {
  const { daysRemaining, daysInMonth, dayOfMonth } = computeDailyStats(TODAY, null, NOW);
  assert.equal(daysInMonth, 30);
  assert.equal(dayOfMonth, 14);
  assert.equal(daysRemaining, 16);
});
