const { SlashCommandBuilder } = require('discord.js');
const { fetchQuotes } = require('../../services/crypto-api');
const cacheService = require('../../services/cache-service');
const { buildPriceEmbed } = require('../../services/embed-builder');
const { getConfig } = require('../../database/models/config');
const { isValidSymbol } = require('../../utils/validators');
const logger = require('../../utils/logger');

const CACHE_TTL = 60000; // 1 minute TTL for price cache

const data = new SlashCommandBuilder()
  .setName('price')
  .setDescription('Afficher le prix detaille d\'une cryptomonnaie')
  .addStringOption(option =>
    option
      .setName('symbol')
      .setDescription('Symbole de la crypto (ex: BTC, ETH, SOL)')
      .setRequired(true)
  );

async function execute(interaction) {
  const symbol = interaction.options.getString('symbol').toUpperCase().trim();

  if (!isValidSymbol(symbol)) {
    return interaction.reply({
      content: `Symbole invalide: \`${symbol}\`. Utilisez un symbole valide (ex: BTC, ETH, SOL).`,
      ephemeral: true,
    });
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    // Check cache first
    const cacheKey = `quote_${symbol}`;
    let quote = cacheService.get(cacheKey, CACHE_TTL);

    if (!quote) {
      logger.debug('Cache miss for price command', { symbol });
      const quotes = await fetchQuotes([symbol]);
      quote = quotes[symbol];

      if (quote) {
        cacheService.set(cacheKey, quote);
      }
    } else {
      logger.debug('Cache hit for price command', { symbol });
    }

    if (!quote) {
      return interaction.editReply({
        content: `Crypto \`${symbol}\` introuvable. Verifiez le symbole et reessayez.`,
      });
    }

    const embed = buildPriceEmbed(quote);
    return interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error('Price command failed', { symbol, error: error.message });
    return interaction.editReply({
      content: 'Une erreur est survenue lors de la recuperation du prix. Reessayez plus tard.',
    });
  }
}

module.exports = { data, execute };
