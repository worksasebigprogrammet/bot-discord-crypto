const { SlashCommandBuilder } = require('discord.js');
const { t, getLang } = require('../../services/i18n');
const { getGuild } = require('../../database/models/guild');
const { fetchQuotes } = require('../../services/crypto-api');
const { buildCompareEmbed } = require('../../services/embed-builder');
const logger = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('compare')
    .setDescription('Compare multiple cryptocurrencies side by side')
    .addStringOption(option =>
      option
        .setName('crypto1')
        .setDescription('First crypto symbol (e.g. BTC)')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('crypto2')
        .setDescription('Second crypto symbol (e.g. ETH)')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('crypto3')
        .setDescription('Third crypto symbol (optional)')
        .setRequired(false)
    )
    .addStringOption(option =>
      option
        .setName('crypto4')
        .setDescription('Fourth crypto symbol (optional)')
        .setRequired(false)
    )
    .addStringOption(option =>
      option
        .setName('crypto5')
        .setDescription('Fifth crypto symbol (optional)')
        .setRequired(false)
    ),

  async execute(interaction) {
    const guildConfig = getGuild(interaction.guildId);
    const lang = getLang(guildConfig);

    // Collect all provided symbols
    const optionNames = ['crypto1', 'crypto2', 'crypto3', 'crypto4', 'crypto5'];
    const symbols = optionNames
      .map(name => interaction.options.getString(name))
      .filter(value => value != null)
      .map(value => value.toUpperCase());

    // Validate no duplicates
    const unique = [...new Set(symbols)];
    if (unique.length !== symbols.length) {
      return interaction.reply({
        content: t('compare.duplicate_error', lang),
        ephemeral: true,
      });
    }

    await interaction.deferReply();

    try {
      const quotes = await fetchQuotes(unique);

      // Check that all symbols were found
      const found = [];
      const notFound = [];
      for (const symbol of unique) {
        if (quotes[symbol]) {
          found.push(quotes[symbol]);
        } else {
          notFound.push(symbol);
        }
      }

      if (found.length === 0) {
        return interaction.editReply({
          content: t('compare.none_found', lang, { symbols: unique.join(', ') }),
        });
      }

      const embed = buildCompareEmbed(found, guildConfig);

      // Append warning if some were not found
      if (notFound.length > 0) {
        const warningText = t('compare.partial_warning', lang, { symbols: notFound.join(', ') });
        await interaction.editReply({ content: warningText, embeds: [embed] });
      } else {
        await interaction.editReply({ embeds: [embed] });
      }
    } catch (err) {
      logger.error('Compare command error', {
        guildId: interaction.guildId,
        symbols: unique.join(','),
        error: err.message,
      });
      await interaction.editReply({
        content: t('errors.api_failed', lang),
      });
    }
  },
};
