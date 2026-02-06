/**
 * Format a price value with appropriate precision and currency symbol.
 * @param {number} price
 * @param {string} currency
 * @returns {string}
 */
function formatPrice(price, currency = 'USD') {
  if (price == null || isNaN(price)) return 'N/A';
  const symbol = currency === 'USD' ? '$' : currency;

  if (price >= 1) {
    return `${symbol}${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (price >= 0.01) {
    return `${symbol}${price.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
  }
  return `${symbol}${price.toLocaleString('en-US', { minimumFractionDigits: 6, maximumFractionDigits: 8 })}`;
}

/**
 * Format a percentage change value.
 * @param {number} percent
 * @returns {string}
 */
function formatPercent(percent) {
  if (percent == null || isNaN(percent)) return 'N/A';
  const sign = percent >= 0 ? '+' : '';
  return `${sign}${percent.toFixed(2)}%`;
}

/**
 * Format large numbers with abbreviations (B, M, K).
 * @param {number} num
 * @returns {string}
 */
function formatLargeNumber(num) {
  if (num == null || isNaN(num)) return 'N/A';
  if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
  if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
  if (num >= 1e3) return `$${(num / 1e3).toFixed(2)}K`;
  return `$${num.toFixed(2)}`;
}

/**
 * Get trend emoji based on percentage change.
 * @param {number} percent
 * @returns {string}
 */
function getTrendEmoji(percent) {
  if (percent == null || isNaN(percent)) return '➡️';
  if (percent > 0.5) return '📈';
  if (percent < -0.5) return '📉';
  return '➡️';
}

/**
 * Get trend arrow based on percentage change.
 * @param {number} percent
 * @returns {string}
 */
function getTrendArrow(percent) {
  if (percent == null || isNaN(percent)) return '';
  if (percent > 0) return '↗️';
  if (percent < 0) return '↘️';
  return '→';
}

/**
 * Format a channel name for a crypto (within Discord 100-char limit).
 * @param {string} symbol
 * @param {number} price
 * @param {number} change24h
 * @returns {string}
 */
function formatChannelName(symbol, price, change24h) {
  const trend = getTrendEmoji(change24h);
  const priceStr = price >= 1
    ? Math.round(price).toLocaleString('en-US')
    : price.toFixed(4);
  const changeStr = `${change24h >= 0 ? '+' : ''}${change24h.toFixed(1)}%`;
  return `${trend}┃${symbol.toLowerCase()}-${priceStr}-usd-${changeStr}`.substring(0, 100);
}

/**
 * Format price difference as a dollar amount.
 * @param {number} currentPrice
 * @param {number} percent
 * @returns {string}
 */
function formatPriceDiff(currentPrice, percent) {
  if (currentPrice == null || percent == null) return '';
  const diff = Math.abs(currentPrice * percent / 100);
  return formatPrice(diff);
}

module.exports = {
  formatPrice,
  formatPercent,
  formatLargeNumber,
  getTrendEmoji,
  getTrendArrow,
  formatChannelName,
  formatPriceDiff,
};
