const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { fetchQuotes } = require('../../services/crypto-api');
const cacheService = require('../../services/cache-service');
const { isValidSymbol } = require('../../utils/validators');
const { formatPrice, formatPercent } = require('../../utils/formatter');
const logger = require('../../utils/logger');

const CACHE_TTL = 60000; // 1 minute TTL

const PERIOD_LABELS = {
  '1h': '1 Heure',
  '24h': '24 Heures',
  '7d': '7 Jours',
  '30d': '30 Jours',
};

const data = new SlashCommandBuilder()
  .setName('chart')
  .setDescription('Afficher un graphique ASCII et des liens vers les charts d\'une crypto')
  .addStringOption(option =>
    option
      .setName('symbol')
      .setDescription('Symbole de la crypto (ex: BTC, ETH, SOL)')
      .setRequired(true)
  )
  .addStringOption(option =>
    option
      .setName('period')
      .setDescription('Periode du graphique')
      .setRequired(false)
      .addChoices(
        { name: '1 Heure', value: '1h' },
        { name: '24 Heures', value: '24h' },
        { name: '7 Jours', value: '7d' },
        { name: '30 Jours', value: '30d' }
      )
  );

/**
 * Build a text-based mini chart from the price and change percentage.
 * Since we don't have historical data points, we simulate a visual
 * representation using block characters based on the change direction.
 * @param {number} change - Percentage change for the period
 * @returns {string}
 */
function buildMiniChart(change) {
  if (change == null || isNaN(change)) return '```\nDonnees insuffisantes\n```';

  const bars = 12;
  const blocks = [];
  const isPositive = change >= 0;
  const magnitude = Math.min(Math.abs(change), 20);
  const scaledMag = Math.ceil((magnitude / 20) * 6);

  // Generate a simple visual bar representation
  const baseLevel = 4;

  for (let i = 0; i < bars; i++) {
    let level;
    if (isPositive) {
      // Upward trend: start lower, end higher
      level = baseLevel + Math.round((i / (bars - 1)) * scaledMag);
    } else {
      // Downward trend: start higher, end lower
      level = baseLevel + scaledMag - Math.round((i / (bars - 1)) * scaledMag);
    }
    blocks.push(level);
  }

  const maxLevel = Math.max(...blocks);
  const lines = [];

  for (let row = maxLevel; row >= 1; row--) {
    let line = '';
    for (let col = 0; col < bars; col++) {
      if (blocks[col] >= row) {
        line += isPositive ? '\u2588' : '\u2588'; // Full block
      } else {
        line += ' ';
      }
    }
    lines.push(line);
  }

  const chart = lines.map(l => l).join('\n');
  const arrow = isPositive ? '/\u203E' : '\\_';
  const label = isPositive ? 'Tendance haussiere' : change < 0 ? 'Tendance baissiere' : 'Stable';

  return `\`\`\`\n${chart}\n${'='.repeat(bars)}\n${label} ${arrow}\n\`\`\``;
}

/**
 * Get the relevant change value for the selected period.
 * @param {Object} quote
 * @param {string} period
 * @returns {number|null}
 */
function getChangeForPeriod(quote, period) {
  switch (period) {
    case '1h': return quote.change1h;
    case '24h': return quote.change24h;
    case '7d': return quote.change7d;
    case '30d': return quote.change7d; // Best available approximation
    default: return quote.change24h;
  }
}

async function execute(interaction) {
  const symbol = interaction.options.getString('symbol').toUpperCase().trim();
  const period = interaction.options.getString('period') || '24h';

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
      const quotes = await fetchQuotes([symbol]);
      quote = quotes[symbol];

      if (quote) {
        cacheService.set(cacheKey, quote);
      }
    }

    if (!quote) {
      return interaction.editReply({
        content: `Crypto \`${symbol}\` introuvable. Verifiez le symbole et reessayez.`,
      });
    }

    const change = getChangeForPeriod(quote, period);
    const periodLabel = PERIOD_LABELS[period];
    const miniChart = buildMiniChart(change);

    const symbolLower = symbol.toLowerCase();
    const tradingViewUrl = `https://www.tradingview.com/chart/?symbol=${symbol}USDT`;
    const coinMarketCapUrl = `https://coinmarketcap.com/currencies/${quote.name ? quote.name.toLowerCase().replace(/\s+/g, '-') : symbolLower}/`;

    const color = change != null && change >= 0 ? 0x00ff41 : 0xff0000;

    const embed = new EmbedBuilder()
      .setTitle(`Chart ${quote.name || symbol} (${symbol}) - ${periodLabel}`)
      .setColor(color)
      .addFields(
        {
          name: 'Prix Actuel',
          value: formatPrice(quote.price),
          inline: true,
        },
        {
          name: `Variation (${periodLabel})`,
          value: formatPercent(change),
          inline: true,
        },
        {
          name: 'Rank',
          value: quote.rank ? `#${quote.rank}` : 'N/A',
          inline: true,
        },
        {
          name: `Mini Chart (${periodLabel})`,
          value: miniChart,
          inline: false,
        },
        {
          name: 'Charts Interactifs',
          value: [
            `[TradingView](${tradingViewUrl})`,
            `[CoinMarketCap](${coinMarketCapUrl})`,
          ].join(' | '),
          inline: false,
        }
      )
      .setTimestamp()
      .setFooter({ text: 'Crypto Tracker Bot' });

    if (quote.logo) {
      embed.setThumbnail(quote.logo);
    }

    return interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error('Chart command failed', { symbol, period, error: error.message });
    return interaction.editReply({
      content: 'Une erreur est survenue lors de la generation du chart. Reessayez plus tard.',
    });
  }
}

module.exports = { data, execute };
