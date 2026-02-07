const { Client, GatewayIntentBits, ActivityType } = require('discord.js');
const logger = require('../utils/logger');
const { getAllBots, getBot, updateBot, deleteBot } = require('../database/models/bot');
const { formatPrice, formatPercent, getTrendEmoji } = require('../utils/formatter');
const cacheService = require('./cache-service');

/** Map of botId -> active Discord client. */
const activeClients = new Map();

/** Maximum external bots allowed. */
const MAX_BOTS = 20;

/**
 * Format a status string for an external bot.
 * @param {Object} botConfig
 * @param {Object} quote
 * @returns {string}
 */
function formatBotStatus(botConfig, quote) {
  if (!quote) return `${botConfig.crypto}: No data`;

  const price = formatPrice(quote.price);
  const change = formatPercent(quote.change24h);
  const trend = getTrendEmoji(quote.change24h);

  switch (botConfig.format) {
    case 'full':
      return `${quote.name} (${quote.symbol}) | ${price} | ${change}`;
    case 'minimal':
      return price;
    case 'emoji':
      return `🪙 ${quote.symbol}: ${price} (${change} ${trend})`;
    case 'simple':
    default:
      return `${quote.symbol}: ${price}`;
  }
}

/**
 * Start an external bot client.
 * @param {Object} botConfig
 * @returns {Promise<boolean>}
 */
async function startExternalBot(botConfig) {
  if (activeClients.has(botConfig.id)) {
    // Already running, just update status
    await updateBotStatus(botConfig.id);
    return true;
  }

  try {
    const client = new Client({
      intents: [GatewayIntentBits.Guilds],
    });

    await client.login(botConfig.token);

    client.once('ready', () => {
      logger.info('External bot connected', { botId: botConfig.id, tag: client.user?.tag });
      updateBotStatus(botConfig.id);
    });

    client.on('error', (err) => {
      logger.error('External bot error', { botId: botConfig.id, error: err.message });
    });

    activeClients.set(botConfig.id, client);
    return true;
  } catch (err) {
    logger.error('Failed to start external bot', { botId: botConfig.id, error: err.message });
    return false;
  }
}

/**
 * Stop an external bot client.
 * @param {string} botId
 */
async function stopExternalBot(botId) {
  const client = activeClients.get(botId);
  if (client) {
    try {
      client.destroy();
    } catch { /* ignore */ }
    activeClients.delete(botId);
    logger.info('External bot stopped', { botId });
  }
}

/**
 * Update the status of an external bot with latest price data.
 * @param {string} botId
 */
async function updateBotStatus(botId) {
  const client = activeClients.get(botId);
  const botConfig = getBot(botId);
  if (!client || !botConfig || !client.user) return;

  const quote = cacheService.get(`quote_${botConfig.crypto}`, 3600000);
  const statusText = formatBotStatus(botConfig, quote);

  try {
    client.user.setPresence({
      activities: [{
        name: statusText,
        type: ActivityType.Watching,
      }],
      status: 'online',
    });
  } catch (err) {
    logger.error('Failed to update external bot status', { botId, error: err.message });
  }
}

/**
 * Update all active external bot statuses.
 */
async function updateAllBotStatuses() {
  for (const [botId] of activeClients) {
    await updateBotStatus(botId);
  }
}

/**
 * Start all enabled external bots from saved configs.
 */
async function startAllBots() {
  const bots = getAllBots();
  let started = 0;

  for (const bot of bots) {
    if (!bot.enabled) continue;
    const success = await startExternalBot(bot);
    if (success) started++;
  }

  if (started > 0) {
    logger.info(`Started ${started} external bots`);
  }
}

/**
 * Stop all external bots.
 */
async function stopAllBots() {
  for (const [botId] of activeClients) {
    await stopExternalBot(botId);
  }
}

/**
 * Validate a bot token by attempting to connect.
 * @param {string} token
 * @returns {Promise<boolean>}
 */
async function validateToken(token) {
  const testClient = new Client({ intents: [GatewayIntentBits.Guilds] });
  try {
    await testClient.login(token);
    testClient.destroy();
    return true;
  } catch {
    try { testClient.destroy(); } catch { /* ignore */ }
    return false;
  }
}

function getActiveCount() {
  return activeClients.size;
}

module.exports = {
  startExternalBot,
  stopExternalBot,
  updateBotStatus,
  updateAllBotStatuses,
  startAllBots,
  stopAllBots,
  validateToken,
  getActiveCount,
  formatBotStatus,
  MAX_BOTS,
};
