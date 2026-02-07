const { SlashCommandBuilder } = require('discord.js');
const { t, getLang } = require('../../services/i18n');
const { getGuild } = require('../../database/models/guild');
const { fetchTop } = require('../../services/crypto-api');
const { buildTopEmbed } = require('../../services/embed-builder');
const logger = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('top')
    .setDescription('Show the top cryptocurrencies by market cap')
    .addIntegerOption(option =>
      option
        .setName('count')
        .setDescription('Number of cryptos to display (1-25, default 10)')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(25)
    ),

  async execute(interaction) {
    const guildConfig = getGuild(interaction.guildId);
    const lang = getLang(guildConfig);
    const count = interaction.options.getInteger('count') || 10;

    await interaction.deferReply();

    try {
      const cryptos = await fetchTop(count);

      if (!cryptos || cryptos.length === 0) {
        return interaction.editReply({
          content: t('top.empty', lang),
        });
      }

      const embed = buildTopEmbed(cryptos, guildConfig);
      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      logger.error('Top command error', {
        guildId: interaction.guildId,
        count,
        error: err.message,
      });
      await interaction.editReply({
        content: t('errors.api_failed', lang),
      });
    }
  },
};
