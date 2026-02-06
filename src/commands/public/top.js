const { SlashCommandBuilder } = require('discord.js');
const { fetchTop } = require('../../services/crypto-api');
const { buildTopEmbed } = require('../../services/embed-builder');
const logger = require('../../utils/logger');

const data = new SlashCommandBuilder()
  .setName('top')
  .setDescription('Afficher le top des cryptomonnaies par capitalisation')
  .addIntegerOption(option =>
    option
      .setName('count')
      .setDescription('Nombre de cryptos a afficher (1-25, defaut: 10)')
      .setRequired(false)
      .setMinValue(1)
      .setMaxValue(25)
  );

async function execute(interaction) {
  const count = interaction.options.getInteger('count') || 10;

  await interaction.deferReply({ ephemeral: true });

  try {
    const cryptos = await fetchTop(count);

    if (!cryptos || cryptos.length === 0) {
      return interaction.editReply({
        content: 'Impossible de recuperer le classement. Reessayez plus tard.',
      });
    }

    const embed = buildTopEmbed(cryptos);
    return interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error('Top command failed', { count, error: error.message });
    return interaction.editReply({
      content: 'Une erreur est survenue lors de la recuperation du classement. Reessayez plus tard.',
    });
  }
}

module.exports = { data, execute };
