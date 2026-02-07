const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { t, getLang } = require('../../services/i18n');
const { getGuild, getGuildCryptos } = require('../../database/models/guild');
const { buildListEmbed } = require('../../services/embed-builder');
const logger = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('list')
    .setDescription('Show the cryptocurrencies tracked on this server'),

  async execute(interaction) {
    const guildConfig = getGuild(interaction.guildId);
    const lang = getLang(guildConfig);

    try {
      const cryptos = getGuildCryptos(interaction.guildId);
      const embed = buildListEmbed(cryptos, guildConfig);

      await interaction.reply({ embeds: [embed] });
    } catch (err) {
      logger.error('List command error', {
        guildId: interaction.guildId,
        error: err.message,
      });
      await interaction.reply({
        content: t('errors.generic', lang),
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
