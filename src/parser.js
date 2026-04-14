/**
 * Parses a Co-ordle leaderboard embed into structured data.
 *
 * Actual embed description format:
 *   **`1.`** <@!994954826444189756>: `946`
 *   **`2.`** <@!384326794976690178>: `861`
 */

// Matches: **`1.`** <@!USER_ID>: `SCORE`  (! is optional in mentions)
const LINE_RE = /\*\*`(\d+)\.`\*\*\s+<@!?(\d+)>:\s+`(\d+)`/;

/**
 * Parse the embed description into raw entries with user IDs (not yet resolved to names).
 * @param {import('discord.js').Message} message
 * @returns {{ rank: number, userId: string, score: number }[] | null}
 */
export function parseLeaderboard(message) {
  const text = message.embeds?.[0]?.description ?? message.content ?? '';
  return parseLeaderboardText(text);
}

/**
 * @param {string} text
 * @returns {{ rank: number, userId: string, score: number }[] | null}
 */
export function parseLeaderboardText(text) {
  const entries = [];
  for (const line of text.split('\n')) {
    const match = line.trim().match(LINE_RE);
    if (!match) continue;
    entries.push({
      rank: parseInt(match[1], 10),
      userId: match[2],
      score: parseInt(match[3], 10),
    });
  }
  return entries.length > 0 ? entries : null;
}

/**
 * Resolve user IDs to display names using the message's guild.
 * Falls back to username if no guild nickname is set.
 * @param {import('discord.js').Message} message
 * @param {{ rank: number, userId: string, score: number }[]} entries
 * @returns {Promise<{ rank: number, player: string, score: number }[]>}
 */
export async function resolvePlayerNames(message, entries) {
  const resolved = await Promise.all(
    entries.map(async (e) => {
      let player = e.userId; // fallback to ID
      try {
        const member = await message.guild.members.fetch(e.userId);
        player = member.displayName;
      } catch {
        // Member may have left; try fetching bare user
        try {
          const user = await message.client.users.fetch(e.userId);
          player = user.username;
        } catch {
          // Keep userId as fallback
        }
      }
      return { rank: e.rank, userId: e.userId, player, score: e.score };
    }),
  );
  return resolved;
}
