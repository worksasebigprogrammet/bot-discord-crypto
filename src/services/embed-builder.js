const { EmbedBuilder } = require('discord.js');
const { formatPrice, formatPercent, formatLargeNumber, getTrendEmoji, formatPriceDiff } = require('../utils/formatter');
const { t, getLang } = require('./i18n');

/**
 * Parse a hex color to int.
 * @param {string} hex
 * @returns {number}
 */
function colorToInt(hex) {
  return parseInt(hex.replace('#', ''), 16);
}

/**
 * Get embed color based on change percentage and guild config.
 * @param {number} change
 * @param {Object} guildConfig
 * @returns {number}
 */
function getColor(change, guildConfig) {
  if (change > 1) return colorToInt(guildConfig.embedColorUp || '#00ff41');
  if (change < -1) return colorToInt(guildConfig.embedColorDown || '#ff0000');
  return colorToInt(guildConfig.embedColorNeutral || '#95a5a6');
}

/**
 * Build a rich price embed for a crypto.
 * @param {Object} quote
 * @param {Object} guildConfig
 * @returns {EmbedBuilder}
 */
function buildPriceEmbed(quote, guildConfig = {}) {
  const lang = getLang(guildConfig);
  const change24h = quote.change24h || 0;
  const trend = getTrendEmoji(change24h);

  const embed = new EmbedBuilder()
    .setTitle(t('price.title', lang, { emoji: trend, name: quote.name, symbol: quote.symbol }))
    .setColor(getColor(change24h, guildConfig))
    .addFields(
      { name: t('price.price_label', lang), value: formatPrice(quote.price), inline: true },
      { name: t('price.rank_label', lang), value: quote.rank ? `#${quote.rank}` : 'N/A', inline: true },
      { name: '\u200B', value: '\u200B', inline: true },
      {
        name: t('price.variations_label', lang),
        value: [
          `• ${t('price.variation_1h', lang)}:  ${formatPercent(quote.change1h)} (${formatPriceDiff(quote.price, quote.change1h)})`,
          `• ${t('price.variation_24h', lang)}: ${formatPercent(quote.change24h)} (${formatPriceDiff(quote.price, quote.change24h)})`,
          `• ${t('price.variation_7d', lang)}:  ${formatPercent(quote.change7d)} (${formatPriceDiff(quote.price, quote.change7d)})`,
        ].join('\n'),
        inline: false,
      },
      { name: t('price.volume_label', lang), value: formatLargeNumber(quote.volume24h), inline: true },
      { name: t('price.marketcap_label', lang), value: formatLargeNumber(quote.marketCap), inline: true }
    )
    .setFooter({ text: t('price.footer', lang) })
    .setTimestamp(new Date(quote.lastUpdated || Date.now()));

  if (guildConfig.showLogos !== false && quote.logo) {
    embed.setThumbnail(quote.logo);
  }

  return embed;
}

/**
 * Build an alert notification embed.
 * @param {Object} alert
 * @param {Object} quote
 * @param {Object} guildConfig
 * @returns {EmbedBuilder}
 */
function buildAlertEmbed(alert, quote, guildConfig = {}) {
  const lang = getLang(guildConfig);
  const isChange = alert.type === 'change';

  let title, description;
  if (isChange) {
    title = t('alert.triggered_title', lang, { symbol: quote.symbol });
    description = [
      `${t('price.price_label', lang)}: ${formatPrice(quote.price)} ${getTrendEmoji(quote.change24h)} ${formatPercent(quote.change24h)} (24h)`,
      `Seuil: ${alert.value >= 0 ? '+' : ''}${alert.value}%`,
    ].join('\n');
  } else {
    title = t('alert.triggered_price', lang);
    const typeLabel = t(`alert.type_${alert.type}`, lang);
    description = [
      `**${quote.symbol}** → ${formatPrice(quote.price)}`,
      `${typeLabel} ${formatPrice(alert.value)} ✅`,
    ].join('\n');
  }

  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(isChange ? 0xff6600 : 0x00ff41)
    .setTimestamp()
    .setFooter({ text: 'Crypto Tracker Bot • Alerts' });
}

/**
 * Build a comparison embed for multiple cryptos.
 * @param {Object[]} quotes - Array of quote objects
 * @param {Object} guildConfig
 * @returns {EmbedBuilder}
 */
function buildCompareEmbed(quotes, guildConfig = {}) {
  const lang = getLang(guildConfig);
  const embed = new EmbedBuilder()
    .setTitle(t('compare.title', lang))
    .setColor(0x3498db)
    .setTimestamp()
    .setFooter({ text: 'Crypto Tracker Bot' });

  for (const quote of quotes) {
    embed.addFields({
      name: `${getTrendEmoji(quote.change24h)} ${quote.symbol}`,
      value: [
        `${t('compare.price', lang)}: ${formatPrice(quote.price)}`,
        `${t('compare.change_24h', lang)}: ${formatPercent(quote.change24h)}`,
        `${t('compare.marketcap', lang)}: ${formatLargeNumber(quote.marketCap)}`,
        `${t('compare.volume', lang)}: ${formatLargeNumber(quote.volume24h)}`,
        `${t('compare.rank', lang)}: ${quote.rank ? '#' + quote.rank : 'N/A'}`,
      ].join('\n'),
      inline: true,
    });
  }

  return embed;
}

/**
 * Build a top cryptos embed.
 * @param {Object[]} cryptos
 * @param {Object} guildConfig
 * @returns {EmbedBuilder}
 */
function buildTopEmbed(cryptos, guildConfig = {}) {
  const lang = getLang(guildConfig);
  const lines = cryptos.map((c, i) => {
    const trend = getTrendEmoji(c.change24h);
    return `**${i + 1}.** ${trend} ${c.symbol} — ${formatPrice(c.price)} (${formatPercent(c.change24h)})`;
  });

  return new EmbedBuilder()
    .setTitle(t('top.title', lang, { count: cryptos.length }))
    .setDescription(lines.join('\n'))
    .setColor(0xf1c40f)
    .setTimestamp()
    .setFooter({ text: t('price.footer', lang) });
}

/**
 * Build a list embed of tracked cryptos.
 * @param {Object[]} trackedCryptos
 * @param {Object} guildConfig
 * @returns {EmbedBuilder}
 */
function buildListEmbed(trackedCryptos, guildConfig = {}) {
  const lang = getLang(guildConfig);

  if (!trackedCryptos || trackedCryptos.length === 0) {
    return new EmbedBuilder()
      .setTitle(t('list.title', lang))
      .setDescription(t('list.empty', lang))
      .setColor(0x95a5a6);
  }

  const lines = trackedCryptos.map(c => {
    const status = c.enabled ? '🟢' : '🔴';
    const label = c.enabled ? t('list.enabled', lang) : t('list.disabled', lang);
    return `${status} **${c.symbol}** — ${c.name} (${label})`;
  });

  return new EmbedBuilder()
    .setTitle(t('list.title', lang))
    .setDescription(lines.join('\n'))
    .setColor(0x3498db)
    .setTimestamp();
}

/**
 * Build admin stats embed.
 * @param {Object} stats
 * @param {Object} guildConfig
 * @returns {EmbedBuilder}
 */
function buildStatsEmbed(stats, guildConfig = {}) {
  const lang = getLang(guildConfig);

  return new EmbedBuilder()
    .setTitle(t('stats.title', lang))
    .setColor(0x9b59b6)
    .addFields(
      { name: t('stats.uptime', lang), value: stats.uptime, inline: true },
      { name: t('stats.servers', lang), value: String(stats.servers), inline: true },
      { name: t('stats.cryptos_tracked', lang), value: String(stats.cryptosTracked), inline: true },
      { name: t('stats.api_calls', lang), value: `${stats.apiCalls}/333`, inline: true },
      { name: t('stats.alerts_triggered', lang), value: String(stats.alertsTriggered), inline: true },
      { name: t('stats.cache_hit_rate', lang), value: `${stats.cacheHitRate}%`, inline: true },
      { name: t('stats.memory', lang), value: stats.memory, inline: true },
      { name: t('stats.errors_24h', lang), value: String(stats.errors), inline: true },
      { name: t('stats.external_bots', lang), value: String(stats.externalBots), inline: true },
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
