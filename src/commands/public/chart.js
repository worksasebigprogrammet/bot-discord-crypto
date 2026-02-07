const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { t, getLang } = require('../../services/i18n');
const { getGuild } = require('../../database/models/guild');
const { fetchQuotes } = require('../../services/crypto-api');
const { formatPrice, formatPercent, getTrendEmoji } = require('../../utils/formatter');
const cacheService = require('../../services/cache-service');
const logger = require('../../utils/logger');

const QUOTE_CACHE_TTL = 60000;

/**
 * Build an ASCII mini bar chart for a given percentage value.
 * Uses Unicode block characters to visualize the magnitude.
 * @param {number} value - Percentage value
 * @param {number} maxWidth - Maximum bar width in characters
 * @returns {string}
 */
function buildBar(value, maxWidth = 20) {
  if (value == null || isNaN(value)) return '░'.repeat(maxWidth);
  const absValue = Math.min(Math.abs(value), 100);
  const filled = Math.round((absValue / 100) * maxWidth);
  const empty = maxWidth - filled;
  const bar = '▓'.repeat(filled) + '░'.repeat(empty);
  return value >= 0 ? bar : bar;
}

/**
 * Build a visual chart embed with change percentages and external links.
 * @param {Object} quote
 * @param {string} period
 * @param {Object} guildConfig
 * @returns {EmbedBuilder}
 */
function buildChartEmbed(quote, period, guildConfig) {
  const lang = getLang(guildConfig);
  const change24h = quote.change24h || 0;
  const trend = getTrendEmoji(change24h);

  // Determine color based on selected period's change
  const periodChangeMap = {
    '1h': quote.change1h,
    '24h': quote.change24h,
    '7d': quote.change7d,
    '30d': quote.change7d, // Use 7d as proxy for 30d
  };
  const selectedChange = periodChangeMap[period] || change24h;
  const color = selectedChange > 0 ? 0x00ff41 : selectedChange < 0 ? 0xff0000 : 0x95a5a6;

  // Build the ASCII chart section
  const changes = [
    { label: '1h', value: quote.change1h },
    { label: '24h', value: quote.change24h },
    { label: '7d', value: quote.change7d },
  ];

  const chartLines = changes.map(c => {
    const sign = c.value != null && c.value >= 0 ? '+' : '';
    const pctStr = c.value != null ? `${sign}${c.value.toFixed(2)}%` : 'N/A';
    const indicator = c.label === period ? '>' : ' ';
    return `${indicator} ${c.label.padEnd(4)} ${buildBar(c.value)} ${pctStr}`;
  });

  const symbolUpper = quote.symbol.toUpperCase();
  const nameSlug = quote.name.toLowerCase().replace(/\s+/g, '-');
  const tradingViewUrl = `https://www.tradingview.com/chart/?symbol=${symbolUpper}USDT`;
  const coinMarketCapUrl = `https://coinmarketcap.com/currencies/${nameSlug}/`;

  const embed = new EmbedBuilder()
    .setTitle(`${trend} ${quote.name} (${quote.symbol}) — ${t('chart.title', lang)}`)
    .setColor(color)
    .setDescription([
      `**${t('chart.current_price', lang)}:** ${formatPrice(quote.price)}`,
      `**${t('chart.period', lang)}:** ${period}`,
      `**${t('chart.selected_change', lang)}:** ${formatPercent(selectedChange)}`,
      '',
      `\`\`\``,
      ...chartLines,
      `\`\`\``,
    ].join('\n'))
    .addFields(
      {
        name: t('chart.links', lang),
        value: [
          `[TradingView](${tradingViewUrl})`,
          `[CoinMarketCap](${coinMarketCapUrl})`,
        ].join(' | '),
        inline: false,
      }
    )
    .setTimestamp()
    .setFooter({ text: t('price.footer', lang) });

  if (guildConfig.showLogos !== false && quote.logo) {
    embed.setThumbnail(quote.logo);
  }

  return embed;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('chart')
    .setDescription('Show a visual chart overview for a cryptocurrency')
    .addStringOption(option =>
      option
        .setName('symbol')
        .setDescription('Crypto symbol (e.g. BTC, ETH, SOL)')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('period')
        .setDescription('Time period to highlight')
        .setRequired(false)
        .addChoices(
          { name: '1 Hour', value: '1h' },
          { name: '24 Hours', value: '24h' },
          { name: '7 Days', value: '7d' },
          { name: '30 Days', value: '30d' }
        )
    ),

  async execute(interaction) {
    const guildConfig = getGuild(interaction.guildId);
    const lang = getLang(guildConfig);
    const symbol = interaction.options.getString('symbol').toUpperCase();
    const period = interaction.options.getString('period') || '24h';

    await interaction.deferReply();

    try {
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

      const embed = buildChartEmbed(quote, period, guildConfig);
      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      logger.error('Chart command error', {
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
