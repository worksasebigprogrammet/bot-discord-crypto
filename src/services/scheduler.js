const logger = require('../utils/logger');
const { getAllGuildIds, getGuild } = require('../database/models/guild');
const { fetchQuotes } = require('./crypto-api');
const cacheService = require('./cache-service');
const channelManager = require('./channel-manager');
const { checkAlerts } = require('./alert-service');

let intervalId = null;
let errorCount = 0;

/**
 * Collect all unique symbols tracked across all guilds.
 * @returns {string[]}
 */
function collectAllSymbols() {
  const symbols = new Set();
  const guildIds = getAllGuildIds();
  for (const guildId of guildIds) {
    const config = getGuild(guildId);
    if (!config.setupComplete) continue;
    for (const crypto of config.cryptos) {
      if (crypto.enabled) symbols.add(crypto.symbol);
    }
  }
  return [...symbols];
}

/**
 * Run a single update cycle: fetch prices, update all guilds, check alerts.
 * @param {import('discord.js').Client} client
 */
async function runUpdate(client) {
  const symbols = collectAllSymbols();
  if (symbols.length === 0) {
    logger.debug('No cryptos tracked across any guild, skipping update');
    return;
  }

  // Use shortest guild interval for cache TTL
  let minInterval = 600000;
  const guildIds = getAllGuildIds();
  for (const guildId of guildIds) {
    const config = getGuild(guildId);
    if (config.setupComplete && config.updateInterval < minInterval) {
      minInterval = config.updateInterval;
    }
  }
  const cacheTTL = Math.max(minInterval - 30000, 30000);

  // Check cache first
  const cached = cacheService.get('all_quotes', cacheTTL);
  if (cached) {
    logger.debug('Using cached quotes for update cycle');
    await channelManager.updateAllGuilds(client, cached);
    await checkAlerts(client, cached);
    return;
  }

  try {
    logger.info('Fetching crypto quotes', { symbols: symbols.join(','), count: symbols.length });
    const quotes = await fetchQuotes(symbols);

    // Update cache
    cacheService.set('all_quotes', quotes);
    for (const [symbol, data] of Object.entries(quotes)) {
      cacheService.set(`quote_${symbol}`, data);
    }

    // Update all guild channels
    await channelManager.updateAllGuilds(client, quotes);

    // Check alerts across all guilds
    await checkAlerts(client, quotes);

    logger.info('Update cycle complete', { symbolCount: symbols.length, guildCount: guildIds.length });
  } catch (err) {
    errorCount++;
    logger.error('Update cycle failed', { error: err.message });

    // Retry up to 3 times
    for (let i = 1; i <= 3; i++) {
      const delay = i * 5000;
      logger.info(`Retrying update in ${delay}ms (attempt ${i}/3)`);
      await new Promise(resolve => setTimeout(resolve, delay));

      try {
        const quotes = await fetchQuotes(symbols);
        cacheService.set('all_quotes', quotes);
        for (const [symbol, data] of Object.entries(quotes)) {
          cacheService.set(`quote_${symbol}`, data);
        }
        await channelManager.updateAllGuilds(client, quotes);
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
 * Start the global update scheduler.
 * Uses the shortest interval across all guilds.
 * @param {import('discord.js').Client} client
 */
function startScheduler(client) {
  let minInterval = 600000;
  const guildIds = getAllGuildIds();
  for (const guildId of guildIds) {
    const config = getGuild(guildId);
    if (config.setupComplete && config.updateInterval < minInterval) {
      minInterval = config.updateInterval;
    }
  }

  logger.info('Starting scheduler', { interval: `${minInterval / 1000}s` });

  // Initial update after short delay
  setTimeout(() => runUpdate(client), 5000);

  // Recurring updates
  intervalId = setInterval(() => runUpdate(client), minInterval);

  // Evict stale cache entries hourly
  setInterval(() => cacheService.evict(3600000), 3600000);

  // Reset error counter daily
  setInterval(() => { errorCount = 0; }, 86400000);
}

function stopScheduler() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    logger.info('Scheduler stopped');
  }
}

function restartScheduler(client) {
  stopScheduler();
  startScheduler(client);
}

async function forceUpdate(client) {
  cacheService.clear();
  await runUpdate(client);
}

function getErrorCount() { return errorCount; }

module.exports = {
  startScheduler,
  stopScheduler,
  restartScheduler,
  forceUpdate,
  runUpdate,
  getErrorCount,
  collectAllSymbols,
};
