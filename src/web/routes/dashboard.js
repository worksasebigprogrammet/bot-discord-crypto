const { Router } = require('express');
const fs = require('fs');
const path = require('path');
const { ensureAuth, getClient } = require('../server');
const { getConfig, setConfig } = require('../../database/models/config');
const { getCryptos } = require('../../database/models/crypto');
const { getActiveAlerts } = require('../../database/models/alert');
const cacheService = require('../../services/cache-service');

const router = Router();

// Apply auth middleware to all dashboard routes
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

function getGuildName() {
  const client = getClient();
  if (!client || !client.isReady()) return 'N/A';
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId) return 'N/A';
  const guild = client.guilds.cache.get(guildId);
  return guild ? guild.name : 'Unknown';
}

function getBotStatus() {
  const client = getClient();
  if (!client) return 'offline';
  return client.isReady() ? 'online' : 'offline';
}

function getUptime() {
  if (!global.botStartTime) return 'N/A';
  return formatUptime(Date.now() - global.botStartTime);
}

function getNextUpdateTime() {
  const config = getConfig();
  if (!global.botStartTime) return 'N/A';
  const interval = config.updateInterval || 600000;
  const elapsed = (Date.now() - global.botStartTime) % interval;
  const remaining = interval - elapsed;
  return formatUptime(remaining);
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// GET / - Dashboard homepage
router.get('/', (req, res) => {
  const config = getConfig();
  const cryptos = getCryptos();
  const activeAlerts = getActiveAlerts();

  res.render('index', {
    user: req.user,
    botStatus: getBotStatus(),
    uptime: getUptime(),
    guildName: getGuildName(),
    trackedCount: cryptos.length,
    alertCount: activeAlerts.length,
    nextUpdate: getNextUpdateTime(),
    config,
  });
});

// GET /cryptos - Crypto management page
router.get('/cryptos', (req, res) => {
  const cryptos = getCryptos();
  const config = getConfig();
  const cacheTTL = config.updateInterval || 600000;
  const cachedPrices = cacheService.getAllPrices(cacheTTL);

  // Build price data keyed by symbol
  const prices = {};
  const quotesData = cacheService.get('quotes', cacheTTL);
  if (quotesData) {
    for (const [symbol, data] of Object.entries(quotesData)) {
      prices[symbol] = data;
    }
  }

  res.render('cryptos', {
    user: req.user,
    cryptos,
    prices,
  });
});

// GET /config - Configuration page
router.get('/config', (req, res) => {
  const config = getConfig();
  res.render('config', {
    user: req.user,
    config,
  });
});

// POST /config - Update configuration
router.post('/config', (req, res) => {
  const updates = {};

  if (req.body.updateInterval) {
    const interval = parseInt(req.body.updateInterval, 10);
    if (!isNaN(interval) && interval >= 60000) {
      updates.updateInterval = interval;
    }
  }

  if (req.body.alertThreshold) {
    const threshold = parseFloat(req.body.alertThreshold);
    if (!isNaN(threshold) && threshold > 0) {
      updates.alertThreshold = threshold;
    }
  }

  if (req.body.channelPrefix !== undefined) {
    updates.channelPrefix = req.body.channelPrefix;
  }

  updates.showLogos = req.body.showLogos === 'on' || req.body.showLogos === 'true';
  updates.mentionHere = req.body.mentionHere === 'on' || req.body.mentionHere === 'true';

  if (req.body.timezone) {
    updates.timezone = req.body.timezone;
  }

  setConfig(updates);
  res.redirect('/config');
});

// GET /logs - Logs page
router.get('/logs', (req, res) => {
  const logsDir = path.join(__dirname, '../../../logs');
  let logContent = 'No log files found.';

  try {
    if (fs.existsSync(logsDir)) {
      const files = fs.readdirSync(logsDir)
        .filter(f => f.startsWith('combined-') && f.endsWith('.log'))
        .sort()
        .reverse();

      if (files.length > 0) {
        const latestLog = path.join(logsDir, files[0]);
        const content = fs.readFileSync(latestLog, 'utf-8');
        const lines = content.split('\n').filter(Boolean);
        const lastLines = lines.slice(-100);
        logContent = lastLines.join('\n');
      }
    }
  } catch (err) {
    logContent = `Error reading logs: ${err.message}`;
  }

  res.render('logs', {
    user: req.user,
    logContent,
  });
});

module.exports = router;
