import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, REST, Routes } from 'discord.js';
import { getGuildConfig, setGuildConfig } from './storage.js';
import { config } from './config.js';

export const setupCommand = new SlashCommandBuilder()
  .setName('setup-coordle-stats')
  .setDescription('Configure the Coordle Stats bot for this server')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand(sub =>
    sub
      .setName('channel')
      .setDescription('Set the channel where Co-ordle is played and stats will be posted')
      .addChannelOption(opt =>
        opt.setName('channel').setDescription('The Co-ordle channel').setRequired(true)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName('coordle-bot')
      .setDescription('Set which bot is the Co-ordle bot (so we can read its leaderboard)')
      .addUserOption(opt =>
        opt.setName('bot').setDescription('The Co-ordle bot').setRequired(true)
      )
  );

/**
 * Handle a /setup-coordle-stats interaction.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
export async function handleSetupCommand(interaction) {
  const guildId = interaction.guildId;
  const sub = interaction.options.getSubcommand();

  if (sub === 'channel') {
    const channel = interaction.options.getChannel('channel');
    setGuildConfig(guildId, 'coordle_channel_id', channel.id);
    setGuildConfig(guildId, 'stats_channel_id', channel.id);
  } else if (sub === 'coordle-bot') {
    const bot = interaction.options.getUser('bot');
    setGuildConfig(guildId, 'coordle_bot_id', bot.id);
  }

  // Show current config as confirmation
  const cfg = getGuildConfig(guildId);
  const embed = new EmbedBuilder()
    .setTitle('Coordle Stats — Configuration')
    .setColor(0x5865f2)
    .addFields(
      { name: 'Channel', value: cfg?.coordleChannelId ? `<#${cfg.coordleChannelId}>` : '_not set_', inline: true },
      { name: 'Co-ordle Bot', value: cfg?.coordleBotId ? `<@${cfg.coordleBotId}>` : '_not set_', inline: true },
    )
    .setFooter({ text: 'Type !top in the configured channel to start capturing stats.' });

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

/**
 * Register slash commands for a specific guild (instant) or globally (up to 1hr propagation).
 * @param {string} clientId
 * @param {string} [guildId] - if provided, registers for that guild only (faster for testing)
 */
export async function registerCommands(clientId, guildId) {
  const rest = new REST().setToken(config.token);
  const body = [setupCommand.toJSON()];

  if (guildId) {
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body });
    console.log(`[commands] Registered slash commands for guild ${guildId}`);
  } else {
    await rest.put(Routes.applicationCommands(clientId), { body });
    console.log(`[commands] Registered global slash commands`);
  }
}
