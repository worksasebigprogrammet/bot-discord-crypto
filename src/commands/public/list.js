const { SlashCommandBuilder } = require('discord.js');
const { getCryptos } = require('../../database/models/crypto');
const { buildListEmbed } = require('../../services/embed-builder');
const logger = require('../../utils/logger');

const data = new SlashCommandBuilder()
  .setName('list')
  .setDescription('Afficher la liste des cryptomonnaies trackees');

async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const cryptos = getCryptos();
    const embed = buildListEmbed(cryptos);
    return interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error('List command failed', { error: error.message });
    return interaction.editReply({
      content: 'Une erreur est survenue lors de la recuperation de la liste. Reessayez plus tard.',
    });
  }
}

module.exports = { data, execute };
