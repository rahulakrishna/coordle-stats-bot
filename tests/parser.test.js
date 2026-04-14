import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLeaderboardText } from '../src/parser.js';

test('parses standard leaderboard format', () => {
  const text = `
1. @Qveen Medusa: 946
2. @monkaashan: 814
3. @nice-pathiri #afrulover: 676
4. @Chonky: 113
5. @Theskyispink: 12
`.trim();

  const result = parseLeaderboardText(text);
  assert.equal(result.length, 5);
  assert.deepEqual(result[0], { rank: 1, player: 'Qveen Medusa', score: 946 });
  assert.deepEqual(result[1], { rank: 2, player: 'monkaashan', score: 814 });
  assert.deepEqual(result[2], { rank: 3, player: 'nice-pathiri #afrulover', score: 676 });
});

test('parses player with hashtag and spaces', () => {
  const text = '3. @nice-pathiri #afrulover: 676';
  const result = parseLeaderboardText(text);
  assert.equal(result[0].player, 'nice-pathiri #afrulover');
  assert.equal(result[0].score, 676);
});

test('returns null for empty / unrecognized text', () => {
  assert.equal(parseLeaderboardText(''), null);
  assert.equal(parseLeaderboardText('Join our support server'), null);
});

test('ignores non-entry lines (header, footer)', () => {
  const text = `
Co-ordle Leaderboard for Land of Lungi

1. @Qveen Medusa: 946
2. @monkaashan: 814

Join our support server discord.gg/rQaAmqPezY
`.trim();

  const result = parseLeaderboardText(text);
  assert.equal(result.length, 2);
  assert.equal(result[0].rank, 1);
  assert.equal(result[1].rank, 2);
});
