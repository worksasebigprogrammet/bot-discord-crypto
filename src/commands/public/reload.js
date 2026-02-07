const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { t, getLang } = require('../../services/i18n');
const { getGuild } = require('../../database/models/guild');
const { isAdmin } = require('../../utils/permissions');
const { forceUpdate } = require('../../services/scheduler');
const logger = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reload')
    .setDescription('Force refresh all crypto data (admin only)'),

  async execute(interaction) {
    const guildConfig = getGuild(interaction.guildId);
    const lang = getLang(guildConfig);

    // Admin permission check
    if (!isAdmin(interaction.member)) {
      return interaction.reply({
        content: t('errors.no_permission', lang),
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply();

    try {
      const startTime = Date.now();

      await forceUpdate(interaction.client);

      const duration = Date.now() - startTime;

      await interaction.editReply({
        content: t('reload.success', lang, { duration }),
      });
    } catch (err) {
      logger.error('Reload command error', {
        guildId: interaction.guildId,
        userId: interaction.user.id,
        error: err.message,
      });
      await interaction.editReply({
        content: t('reload.error', lang),
      });
    }
  },
};
