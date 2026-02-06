const { Router } = require('express');
const { ensureAuth, getClient } = require('../server');
const { getConfig, setConfig } = require('../../database/models/config');
const { getCryptos, addCrypto, removeCrypto } = require('../../database/models/crypto');
const { getActiveAlerts } = require('../../database/models/alert');
const { forceUpdate } = require('../../services/scheduler');
const cacheService = require('../../services/cache-service');
const logger = require('../../utils/logger');

const router = Router();

// Apply auth middleware to all API routes
router.use(ensureAuth);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatUptime(ms) {
  const seconds = Math.floor(ms / 1000) % 60;
  const minutes = Math.floor(ms / (1000 * 60)) % 60;
  const hours = Math.floor(ms / (1000 * 60 * 60)) % 24;
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// GET /api/status - Bot status overview
// ---------------------------------------------------------------------------
router.get('/status', (req, res) => {
  const client = getClient();
  const isOnline = client && client.isReady();

  let guildName = 'N/A';
  let guildMemberCount = 0;
  if (isOnline && process.env.DISCORD_GUILD_ID) {
    const guild = client.guilds.cache.get(process.env.DISCORD_GUILD_ID);
    if (guild) {
      guildName = guild.name;
      guildMemberCount = guild.memberCount;
    }
  }

  res.json({
    status: isOnline ? 'online' : 'offline',
    uptime: global.botStartTime ? formatUptime(Date.now() - global.botStartTime) : 'N/A',
    uptimeMs: global.botStartTime ? Date.now() - global.botStartTime : 0,
    guild: {
      name: guildName,
      memberCount: guildMemberCount,
    },
    cache: cacheService.getStats(),
  });
});

// ---------------------------------------------------------------------------
// GET /api/cryptos - List tracked cryptos with prices
// ---------------------------------------------------------------------------
router.get('/cryptos', (req, res) => {
  const cryptos = getCryptos();
  const config = getConfig();
  const cacheTTL = config.updateInterval || 600000;

  const prices = {};
  const quotesData = cacheService.get('quotes', cacheTTL);
  if (quotesData) {
    for (const [symbol, data] of Object.entries(quotesData)) {
      prices[symbol] = data;
    }
  }

  const result = cryptos.map((crypto) => {
    const priceData = prices[crypto.symbol] || null;
    return {
      ...crypto,
      price: priceData ? priceData.price : null,
      change24h: priceData ? priceData.change24h : null,
      volume24h: priceData ? priceData.volume24h : null,
      marketCap: priceData ? priceData.marketCap : null,
      rank: priceData ? priceData.rank : null,
    };
  });

  res.json({ cryptos: result });
});

// ---------------------------------------------------------------------------
// GET /api/config - Current configuration
// ---------------------------------------------------------------------------
router.get('/config', (req, res) => {
  const config = getConfig();
  res.json({ config });
});

// ---------------------------------------------------------------------------
// POST /api/config - Update configuration
// ---------------------------------------------------------------------------
router.post('/config', (req, res) => {
  const updates = {};
  const body = req.body;

  if (body.updateInterval !== undefined) {
    const interval = parseInt(body.updateInterval, 10);
    if (!isNaN(interval) && interval >= 60000) {
      updates.updateInterval = interval;
    }
  }

  if (body.alertThreshold !== undefined) {
    const threshold = parseFloat(body.alertThreshold);
    if (!isNaN(threshold) && threshold > 0) {
      updates.alertThreshold = threshold;
    }
  }

  if (body.channelPrefix !== undefined) {
    updates.channelPrefix = body.channelPrefix;
  }

  if (body.showLogos !== undefined) {
    updates.showLogos = body.showLogos === true || body.showLogos === 'true';
  }

  if (body.mentionHere !== undefined) {
    updates.mentionHere = body.mentionHere === true || body.mentionHere === 'true';
  }

  if (body.timezone !== undefined) {
    updates.timezone = body.timezone;
  }

  const newConfig = setConfig(updates);
  logger.info('Config updated via web API', { updates });
  res.json({ success: true, config: newConfig });
});

// ---------------------------------------------------------------------------
// POST /api/cryptos/add - Add a tracked crypto
// ---------------------------------------------------------------------------
router.post('/cryptos/add', (req, res) => {
  const { symbol, name } = req.body;

  if (!symbol || typeof symbol !== 'string') {
    return res.status(400).json({ error: 'Symbol is required' });
  }

  const entry = addCrypto(symbol.toUpperCase().trim(), name || '');
  if (!entry) {
    return res.status(409).json({ error: `${symbol.toUpperCase()} is already being tracked` });
  }

  logger.info('Crypto added via web API', { symbol: entry.symbol });
  res.json({ success: true, crypto: entry });
});

// ---------------------------------------------------------------------------
// POST /api/cryptos/remove - Remove a tracked crypto
// ---------------------------------------------------------------------------
router.post('/cryptos/remove', (req, res) => {
  const { symbol } = req.body;

  if (!symbol || typeof symbol !== 'string') {
    return res.status(400).json({ error: 'Symbol is required' });
  }

  const removed = removeCrypto(symbol.toUpperCase().trim());
  if (!removed) {
    return res.status(404).json({ error: `${symbol.toUpperCase()} is not being tracked` });
  }

  logger.info('Crypto removed via web API', { symbol: removed.symbol });
  res.json({ success: true, removed });
});

// ---------------------------------------------------------------------------
// POST /api/force-update - Trigger an immediate price update
// ---------------------------------------------------------------------------
router.post('/force-update', async (req, res) => {
  const client = getClient();
  if (!client || !client.isReady()) {
    return res.status(503).json({ error: 'Bot is not connected' });
  }

  try {
    await forceUpdate(client);
    logger.info('Force update triggered via web API');
    res.json({ success: true, message: 'Update triggered successfully' });
  } catch (err) {
    logger.error('Force update via web API failed', { error: err.message });
    res.status(500).json({ error: 'Update failed', details: err.message });
  }
});

module.exports = router;
