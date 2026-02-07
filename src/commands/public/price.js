const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { t, getLang } = require('../../services/i18n');
const { getGuild } = require('../../database/models/guild');
const { fetchQuotes, getCryptoMap } = require('../../services/crypto-api');
const { buildPriceEmbed } = require('../../services/embed-builder');
const cacheService = require('../../services/cache-service');
const logger = require('../../utils/logger');

const QUOTE_CACHE_TTL = 60000; // 60 seconds

module.exports = {
  data: new SlashCommandBuilder()
    .setName('price')
    .setDescription('Get the current price of a cryptocurrency')
    .addStringOption(option =>
      option
        .setName('symbol')
        .setDescription('Crypto symbol (e.g. BTC, ETH, SOL)')
        .setRequired(true)
        .setAutocomplete(true)
    ),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().toUpperCase();

    try {
      const cryptoMap = await getCryptoMap();
      const filtered = cryptoMap
        .filter(c =>
          c.symbol.toUpperCase().startsWith(focused) ||
          c.name.toLowerCase().startsWith(focused.toLowerCase())
        )
        .slice(0, 25)
        .map(c => ({
          name: `${c.symbol} — ${c.name}`,
          value: c.symbol.toUpperCase(),
        }));

      await interaction.respond(filtered);
    } catch (err) {
      logger.error('Price autocomplete error', { error: err.message });
      await interaction.respond([]);
    }
  },

  async execute(interaction) {
    const guildConfig = getGuild(interaction.guildId);
    const lang = getLang(guildConfig);
    const symbol = interaction.options.getString('symbol').toUpperCase();

    await interaction.deferReply();

    try {
      // Check cache first
      const cacheKey = `quote_${symbol}`;
      let quote = cacheService.get(cacheKey, QUOTE_CACHE_TTL);

      if (!quote) {
        const quotes = await fetchQuotes([symbol]);
        quote = quotes[symbol];

        if (quote) {
          cacheService.set(cacheKey, quote);
        }
      }

      if (!quote) {
        return interaction.editReply({
          content: t('price.not_found', lang, { symbol }),
        });
      }

      const embed = buildPriceEmbed(quote, guildConfig);
      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      logger.error('Price command error', {
        guildId: interaction.guildId,
        symbol,
        error: err.message,
      });
      await interaction.editReply({
        content: t('errors.api_failed', lang),
      });
    }
  },
};
