const logger = require('../utils/logger');
const { getConfig } = require('../database/models/config');
const { getCryptos } = require('../database/models/crypto');
const { fetchQuotes } = require('./crypto-api');
const cacheService = require('./cache-service');
const channelManager = require('./channel-manager');
const { checkAlerts } = require('./alert-service');

let intervalId = null;
let errorCount = 0;
let lastErrorReset = Date.now();

/**
 * Run a single update cycle: fetch prices, update cache, channels, and check alerts.
 * @param {import('discord.js').Client} client
 */
async function runUpdate(client) {
  const config = getConfig();
  const cryptos = getCryptos().filter(c => c.enabled);

  if (cryptos.length === 0) {
    logger.debug('No cryptos tracked, skipping update');
    return;
  }

  const symbols = cryptos.map(c => c.symbol);
  const cacheTTL = config.updateInterval - 30000;

  // Check cache first
  const cached = cacheService.get('quotes', cacheTTL);
  if (cached) {
    logger.debug('Using cached quotes');
    return;
  }

  try {
    logger.info('Fetching crypto quotes', { symbols });
    const quotes = await fetchQuotes(symbols);

    // Update cache
    cacheService.set('quotes', quotes);

    // Store individual symbol caches
    for (const [symbol, data] of Object.entries(quotes)) {
      cacheService.set(`quote_${symbol}`, data);
    }

    // Update channels
    await channelManager.updateChannels(client, quotes);

    // Check alerts
    await checkAlerts(client, quotes);

    logger.info('Update cycle complete', { symbolCount: symbols.length });
  } catch (err) {
    errorCount++;
    logger.error('Update cycle failed', { error: err.message });

    // Retry up to 3 times with exponential backoff
    for (let i = 1; i <= 3; i++) {
      const delay = i * 5000;
      logger.info(`Retrying update in ${delay}ms (attempt ${i}/3)`);
      await new Promise(resolve => setTimeout(resolve, delay));

      try {
        const quotes = await fetchQuotes(symbols);
        cacheService.set('quotes', quotes);
        for (const [symbol, data] of Object.entries(quotes)) {
          cacheService.set(`quote_${symbol}`, data);
        }
        await channelManager.updateChannels(client, quotes);
        await checkAlerts(client, quotes);
        logger.info('Retry successful', { attempt: i });
        return;
      } catch (retryErr) {
        logger.warn(`Retry ${i} failed`, { error: retryErr.message });
      }
    }
  }
}

/**
 * Start the update scheduler.
 * @param {import('discord.js').Client} client
 */
function startScheduler(client) {
  const config = getConfig();
  const interval = config.updateInterval || 600000;

  logger.info('Starting scheduler', { interval: `${interval / 1000}s` });

  // Initial update
  runUpdate(client);

  // Recurring updates
  intervalId = setInterval(() => runUpdate(client), interval);

  // Reset error counter daily
  setInterval(() => {
    errorCount = 0;
    lastErrorReset = Date.now();
  }, 86400000);
}

/** Stop the scheduler. */
function stopScheduler() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    logger.info('Scheduler stopped');
  }
}

/** Restart with updated interval. */
function restartScheduler(client) {
  stopScheduler();
  startScheduler(client);
}

/** Force an immediate update. */
async function forceUpdate(client) {
  cacheService.clear();
  await runUpdate(client);
}

function getErrorCount() {
  return errorCount;
}

module.exports = {
  startScheduler,
  stopScheduler,
  restartScheduler,
  forceUpdate,
  runUpdate,
  getErrorCount,
};
