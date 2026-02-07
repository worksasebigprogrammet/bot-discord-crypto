const {
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const { isAdmin, denyPermission } = require('../../utils/permissions');
const { t, getLang } = require('../../services/i18n');
const { getGuild, getGuildCryptos, getCryptoInGuild, removeCryptoFromGuild } = require('../../database/models/guild');
const channelManager = require('../../services/channel-manager');
const { isValidSymbol } = require('../../utils/validators');
const logger = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('untrack')
    .setDescription('Retirer une crypto du tracking')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(opt =>
      opt
        .setName('symbol')
        .setDescription('Symbole de la crypto a retirer')
        .setRequired(true)
        .setAutocomplete(true),
    ),

  /**
   * Autocomplete handler: suggest currently tracked cryptos for this guild.
   */
  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().toUpperCase();
    const guildId = interaction.guildId;

    try {
      const tracked = getGuildCryptos(guildId);
      const filtered = tracked
        .filter(c =>
          c.symbol.toUpperCase().startsWith(focused) ||
          c.name.toUpperCase().startsWith(focused),
        )
        .slice(0, 25)
        .map(c => ({
          name: `${c.symbol} - ${c.name}`,
          value: c.symbol,
        }));

      await interaction.respond(filtered);
    } catch (err) {
      logger.error('Untrack autocomplete error', { error: err.message });
      await interaction.respond([]);
    }
  },

  /**
   * Execute the /untrack command: remove a crypto from the guild's tracking list.
   */
  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return denyPermission(interaction);
    }

    const guildId = interaction.guildId;
    const config = getGuild(guildId);
    const lang = getLang(config);
    const symbol = interaction.options.getString('symbol').toUpperCase().trim();

    // Validate symbol format
    if (!isValidSymbol(symbol)) {
      return interaction.reply({
        content: t('track.invalid_symbol', lang, { symbol }),
        ephemeral: true,
      });
    }

    // Check if it's being tracked
    const cryptoEntry = getCryptoInGuild(guildId, symbol);
    if (!cryptoEntry) {
      return interaction.reply({
        content: t('untrack.not_tracked', lang, { symbol }),
        ephemeral: true,
      });
    }

    // Delete the associated Discord channel
    if (cryptoEntry.channelId) {
      try {
        await channelManager.deleteCryptoChannel(interaction.guild, cryptoEntry.channelId);
      } catch (err) {
        logger.error('Failed to delete crypto channel during untrack', {
          guildId,
          symbol,
          channelId: cryptoEntry.channelId,
          error: err.message,
        });
      }
    }

    // Remove from guild database
    removeCryptoFromGuild(guildId, symbol);

    logger.info('Crypto untracked', { guildId, symbol });

    return interaction.reply({
      content: t('untrack.removed', lang, { symbol }),
      ephemeral: true,
    });
  },
};
