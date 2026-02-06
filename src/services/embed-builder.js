const { EmbedBuilder } = require('discord.js');
const { formatPrice, formatPercent, formatLargeNumber, getTrendEmoji, formatPriceDiff } = require('../utils/formatter');
const { getConfig } = require('../database/models/config');

/**
 * Build a rich embed for a crypto price update.
 * @param {Object} quote - Quote data from crypto API
 * @returns {EmbedBuilder}
 */
function buildPriceEmbed(quote) {
  const config = getConfig();
  const change24h = quote.change24h || 0;

  let color;
  if (change24h > 1) color = parseInt(config.embedColorUp.replace('#', ''), 16);
  else if (change24h < -1) color = parseInt(config.embedColorDown.replace('#', ''), 16);
  else color = parseInt(config.embedColorNeutral.replace('#', ''), 16);

  const trend = getTrendEmoji(change24h);

  const embed = new EmbedBuilder()
    .setTitle(`${trend} ${quote.name} (${quote.symbol})`)
    .setColor(color)
    .addFields(
      {
        name: '💵 Prix',
        value: formatPrice(quote.price),
        inline: true,
      },
      {
        name: '🏆 Rank',
        value: quote.rank ? `#${quote.rank}` : 'N/A',
        inline: true,
      },
      {
        name: '\u200B',
        value: '\u200B',
        inline: true,
      },
      {
        name: '📊 Variations',
        value: [
          `• 1h:  ${formatPercent(quote.change1h)} (${formatPriceDiff(quote.price, quote.change1h)})`,
          `• 24h: ${formatPercent(quote.change24h)} (${formatPriceDiff(quote.price, quote.change24h)})`,
          `• 7j:  ${formatPercent(quote.change7d)} (${formatPriceDiff(quote.price, quote.change7d)})`,
        ].join('\n'),
        inline: false,
      },
      {
        name: '📈 Volume 24h',
        value: formatLargeNumber(quote.volume24h),
        inline: true,
      },
      {
        name: '💎 Market Cap',
        value: formatLargeNumber(quote.marketCap),
        inline: true,
      }
    )
    .setFooter({ text: 'Données CoinMarketCap • Crypto Tracker Bot' })
    .setTimestamp(new Date(quote.lastUpdated || Date.now()));

  if (config.showLogos && quote.logo) {
    embed.setThumbnail(quote.logo);
  }

  return embed;
}

/**
 * Build an alert embed.
 * @param {Object} alert - Alert data
 * @param {Object} quote - Current quote data
 * @returns {EmbedBuilder}
 */
function buildAlertEmbed(alert, quote) {
  const isAbove = alert.type === 'above';
  const isChange = alert.type === 'change';

  let title, description;
  if (isChange) {
    title = `🚨 ALERTE ${quote.symbol}`;
    description = [
      `Prix: ${formatPrice(quote.price)} ${getTrendEmoji(quote.change24h)} ${formatPercent(quote.change24h)} (24h)`,
      `Seuil déclenché: ${alert.value >= 0 ? '+' : ''}${alert.value}%`,
    ].join('\n');
  } else {
    title = `🎯 OBJECTIF ATTEINT`;
    description = [
      `**${quote.symbol}** a atteint ${formatPrice(quote.price)}`,
      `Votre alerte ${isAbove ? 'au-dessus de' : 'en-dessous de'} ${formatPrice(alert.value)} ✅`,
    ].join('\n');
  }

  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(isChange ? 0xff6600 : 0x00ff41)
    .setTimestamp()
    .setFooter({ text: 'Crypto Tracker Bot • Alertes' });
}

/**
 * Build a comparison embed for two cryptos.
 * @param {Object} quote1
 * @param {Object} quote2
 * @returns {EmbedBuilder}
 */
function buildCompareEmbed(quote1, quote2) {
  return new EmbedBuilder()
    .setTitle(`⚖️ ${quote1.symbol} vs ${quote2.symbol}`)
    .setColor(0x3498db)
    .addFields(
      { name: `${quote1.symbol}`, value: formatPrice(quote1.price), inline: true },
      { name: 'VS', value: '⚔️', inline: true },
      { name: `${quote2.symbol}`, value: formatPrice(quote2.price), inline: true },
      { name: `${quote1.symbol} 24h`, value: formatPercent(quote1.change24h), inline: true },
      { name: '\u200B', value: '\u200B', inline: true },
      { name: `${quote2.symbol} 24h`, value: formatPercent(quote2.change24h), inline: true },
      { name: `${quote1.symbol} Cap`, value: formatLargeNumber(quote1.marketCap), inline: true },
      { name: '\u200B', value: '\u200B', inline: true },
      { name: `${quote2.symbol} Cap`, value: formatLargeNumber(quote2.marketCap), inline: true },
      { name: `${quote1.symbol} Vol`, value: formatLargeNumber(quote1.volume24h), inline: true },
      { name: '\u200B', value: '\u200B', inline: true },
      { name: `${quote2.symbol} Vol`, value: formatLargeNumber(quote2.volume24h), inline: true },
    )
    .setTimestamp()
    .setFooter({ text: 'Crypto Tracker Bot • Comparaison' });
}

/**
 * Build a top cryptos embed.
 * @param {Object[]} cryptos
 * @returns {EmbedBuilder}
 */
function buildTopEmbed(cryptos) {
  const lines = cryptos.map((c, i) => {
    const trend = getTrendEmoji(c.change24h);
    return `**${i + 1}.** ${trend} ${c.symbol} — ${formatPrice(c.price)} (${formatPercent(c.change24h)})`;
  });

  return new EmbedBuilder()
    .setTitle('🏆 Top Cryptomonnaies par Market Cap')
    .setDescription(lines.join('\n'))
    .setColor(0xf1c40f)
    .setTimestamp()
    .setFooter({ text: 'Données CoinMarketCap • Crypto Tracker Bot' });
}

/**
 * Build a list embed showing all tracked cryptos.
 * @param {Object[]} trackedCryptos
 * @returns {EmbedBuilder}
 */
function buildListEmbed(trackedCryptos) {
  if (trackedCryptos.length === 0) {
    return new EmbedBuilder()
      .setTitle('📋 Cryptos Trackées')
      .setDescription('Aucune crypto trackée. Utilisez `/track <symbol>` pour en ajouter.')
      .setColor(0x95a5a6);
  }

  const lines = trackedCryptos.map(c => {
    const status = c.enabled ? '🟢' : '🔴';
    return `${status} **${c.symbol}** — ${c.name}`;
  });

  return new EmbedBuilder()
    .setTitle('📋 Cryptos Trackées')
    .setDescription(lines.join('\n'))
    .setColor(0x3498db)
    .setTimestamp();
}

/**
 * Build admin stats embed.
 * @param {Object} stats
 * @returns {EmbedBuilder}
 */
function buildStatsEmbed(stats) {
  return new EmbedBuilder()
    .setTitle('📊 Statistiques du Bot')
    .setColor(0x9b59b6)
    .addFields(
      { name: '⏰ Uptime', value: stats.uptime, inline: true },
      { name: '🔄 Updates', value: stats.updates.toString(), inline: true },
      { name: '📡 API Calls', value: `${stats.apiCalls}/10000`, inline: true },
      { name: '🚨 Alertes', value: `${stats.alertsTriggered} déclenchées`, inline: true },
      { name: '💾 Cache Hit Rate', value: `${stats.cacheHitRate}%`, inline: true },
      { name: '❌ Erreurs 24h', value: stats.errors.toString(), inline: true },
    )
    .setTimestamp()
    .setFooter({ text: 'Crypto Tracker Bot • Admin' });
}

module.exports = {
  buildPriceEmbed,
  buildAlertEmbed,
  buildCompareEmbed,
  buildTopEmbed,
  buildListEmbed,
  buildStatsEmbed,
};
