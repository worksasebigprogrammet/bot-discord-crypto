const { SlashCommandBuilder } = require('discord.js');
const { fetchQuotes } = require('../../services/crypto-api');
const { buildCompareEmbed } = require('../../services/embed-builder');
const { isValidSymbol } = require('../../utils/validators');
const logger = require('../../utils/logger');

const data = new SlashCommandBuilder()
  .setName('compare')
  .setDescription('Comparer deux cryptomonnaies')
  .addStringOption(option =>
    option
      .setName('symbol1')
      .setDescription('Premiere crypto (ex: BTC)')
      .setRequired(true)
  )
  .addStringOption(option =>
    option
      .setName('symbol2')
      .setDescription('Deuxieme crypto (ex: ETH)')
      .setRequired(true)
  );

async function execute(interaction) {
  const symbol1 = interaction.options.getString('symbol1').toUpperCase().trim();
  const symbol2 = interaction.options.getString('symbol2').toUpperCase().trim();

  if (!isValidSymbol(symbol1)) {
    return interaction.reply({
      content: `Symbole invalide: \`${symbol1}\`. Utilisez un symbole valide (ex: BTC, ETH, SOL).`,
      ephemeral: true,
    });
  }

  if (!isValidSymbol(symbol2)) {
    return interaction.reply({
      content: `Symbole invalide: \`${symbol2}\`. Utilisez un symbole valide (ex: BTC, ETH, SOL).`,
      ephemeral: true,
    });
  }

  if (symbol1 === symbol2) {
    return interaction.reply({
      content: 'Vous ne pouvez pas comparer une crypto avec elle-meme. Choisissez deux cryptos differentes.',
      ephemeral: true,
    });
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const quotes = await fetchQuotes([symbol1, symbol2]);

    const quote1 = quotes[symbol1];
    const quote2 = quotes[symbol2];

    if (!quote1 && !quote2) {
      return interaction.editReply({
        content: `Cryptos \`${symbol1}\` et \`${symbol2}\` introuvables. Verifiez les symboles.`,
      });
    }

    if (!quote1) {
      return interaction.editReply({
        content: `Crypto \`${symbol1}\` introuvable. Verifiez le symbole.`,
      });
    }

    if (!quote2) {
      return interaction.editReply({
        content: `Crypto \`${symbol2}\` introuvable. Verifiez le symbole.`,
      });
    }

    const embed = buildCompareEmbed(quote1, quote2);
    return interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error('Compare command failed', { symbol1, symbol2, error: error.message });
    return interaction.editReply({
      content: 'Une erreur est survenue lors de la comparaison. Reessayez plus tard.',
    });
  }
}

module.exports = { data, execute };
