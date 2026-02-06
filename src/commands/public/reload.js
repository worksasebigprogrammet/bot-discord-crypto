const { SlashCommandBuilder } = require('discord.js');
const { isAdmin, denyPermission } = require('../../utils/permissions');
const { forceUpdate } = require('../../services/scheduler');
const logger = require('../../utils/logger');

const data = new SlashCommandBuilder()
  .setName('reload')
  .setDescription('Forcer le rafraichissement des donnees (admin uniquement)');

async function execute(interaction) {
  if (!isAdmin(interaction.member)) {
    return denyPermission(interaction);
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const startTime = Date.now();
    await forceUpdate(interaction.client);
    const duration = Date.now() - startTime;

    logger.info('Force reload triggered by admin', {
      user: interaction.user.tag,
      duration: `${duration}ms`,
    });

    return interaction.editReply({
      content: `Donnees rafraichies avec succes en ${duration}ms. Le cache a ete vide et les prix mis a jour.`,
    });
  } catch (error) {
    logger.error('Reload command failed', { user: interaction.user.tag, error: error.message });
    return interaction.editReply({
      content: 'Une erreur est survenue lors du rafraichissement. Consultez les logs pour plus de details.',
    });
  }
}

module.exports = { data, execute };
