const { readData, writeData } = require('../db');
const path = require('path');
const fs = require('fs');
const logger = require('../../utils/logger');

const GUILDS_DIR = path.join(__dirname, '../../../data/guilds');

const DEFAULT_GUILD_CONFIG = {
  guildId: null,
  language: 'fr',
  categoryId: null,
  alertsChannelId: null,
  updateInterval: 600000,
  alertThreshold: 5,
  channelPrefix: '📈',
  embedColorUp: '#00ff41',
  embedColorDown: '#ff0000',
  embedColorNeutral: '#95a5a6',
  showLogos: true,
  timezone: 'Europe/Paris',
  mentionHere: false,
  setupComplete: false,
  cryptos: [],
  alerts: [],
};

function ensureGuildsDir() {
  if (!fs.existsSync(GUILDS_DIR)) {
    fs.mkdirSync(GUILDS_DIR, { recursive: true });
  }
}

function guildFile(guildId) {
  return path.join(GUILDS_DIR, `${guildId}.json`);
}

/**
 * Get configuration for a specific guild.
 * @param {string} guildId
 * @returns {Object}
 */
function getGuild(guildId) {
  ensureGuildsDir();
  const filePath = guildFile(guildId);
  try {
    if (!fs.existsSync(filePath)) {
      const config = { ...DEFAULT_GUILD_CONFIG, guildId };
      saveGuild(guildId, config);
      return config;
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    return { ...DEFAULT_GUILD_CONFIG, ...JSON.parse(raw), guildId };
  } catch (err) {
    logger.error(`Failed to read guild ${guildId}`, { error: err.message });
    return { ...DEFAULT_GUILD_CONFIG, guildId };
  }
}

/**
 * Save full guild configuration.
 * @param {string} guildId
 * @param {Object} data
 */
function saveGuild(guildId, data) {
  ensureGuildsDir();
  try {
    fs.writeFileSync(guildFile(guildId), JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    logger.error(`Failed to save guild ${guildId}`, { error: err.message });
  }
}

/**
 * Update specific fields of a guild config.
 * @param {string} guildId
 * @param {Object} updates
 * @returns {Object}
 */
function updateGuild(guildId, updates) {
  const config = getGuild(guildId);
  const newConfig = { ...config, ...updates };
  saveGuild(guildId, newConfig);
  return newConfig;
}

/**
 * Reset a guild config to defaults.
 * @param {string} guildId
 * @returns {Object}
 */
function resetGuild(guildId) {
  const config = { ...DEFAULT_GUILD_CONFIG, guildId };
  saveGuild(guildId, config);
  return config;
}

/**
 * Delete a guild config file.
 * @param {string} guildId
 */
function deleteGuild(guildId) {
  const filePath = guildFile(guildId);
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (err) {
    logger.error(`Failed to delete guild ${guildId}`, { error: err.message });
  }
}

/**
 * Get all guild IDs that have configs.
 * @returns {string[]}
 */
function getAllGuildIds() {
  ensureGuildsDir();
  try {
    return fs.readdirSync(GUILDS_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''));
  } catch {
    return [];
  }
}

// --- Crypto helpers scoped to a guild ---

function addCryptoToGuild(guildId, symbol, name = '') {
  const config = getGuild(guildId);
  const existing = config.cryptos.find(c => c.symbol.toUpperCase() === symbol.toUpperCase());
  if (existing) return null;

  const entry = {
    symbol: symbol.toUpperCase(),
    name: name || symbol.toUpperCase(),
    channelId: null,
    messageId: null,
    enabled: true,
    addedAt: Date.now(),
  };
  config.cryptos.push(entry);
  saveGuild(guildId, config);
  return entry;
}

function removeCryptoFromGuild(guildId, symbol) {
  const config = getGuild(guildId);
  const index = config.cryptos.findIndex(c => c.symbol.toUpperCase() === symbol.toUpperCase());
  if (index === -1) return null;
  const [removed] = config.cryptos.splice(index, 1);
  saveGuild(guildId, config);
  return removed;
}

function updateCryptoInGuild(guildId, symbol, updates) {
  const config = getGuild(guildId);
  const crypto = config.cryptos.find(c => c.symbol.toUpperCase() === symbol.toUpperCase());
  if (!crypto) return null;
  Object.assign(crypto, updates);
  saveGuild(guildId, config);
  return crypto;
}

function getCryptoInGuild(guildId, symbol) {
  const config = getGuild(guildId);
  return config.cryptos.find(c => c.symbol.toUpperCase() === symbol.toUpperCase()) || null;
}

function getGuildCryptos(guildId) {
  return getGuild(guildId).cryptos || [];
}

// --- Alert helpers scoped to a guild ---

function addAlertToGuild(guildId, userId, symbol, type, value) {
  const config = getGuild(guildId);
  const userAlerts = config.alerts.filter(a => a.userId === userId && !a.triggered);
  if (userAlerts.length >= 25) return null;

  const maxId = config.alerts.length > 0 ? Math.max(...config.alerts.map(a => a.id)) : 0;
  const alert = {
    id: maxId + 1,
    userId,
    guildId,
    symbol: symbol.toUpperCase(),
    type,
    value,
    triggered: false,
    createdAt: Date.now(),
  };
  config.alerts.push(alert);
  saveGuild(guildId, config);
  return alert;
}

function removeAlertFromGuild(guildId, alertId, userId) {
  const config = getGuild(guildId);
  const index = config.alerts.findIndex(a => a.id === alertId && a.userId === userId);
  if (index === -1) return null;
  const [removed] = config.alerts.splice(index, 1);
  saveGuild(guildId, config);
  return removed;
}

function getUserAlertsInGuild(guildId, userId) {
  const config = getGuild(guildId);
  return config.alerts.filter(a => a.userId === userId && !a.triggered);
}

function clearUserAlertsInGuild(guildId, userId) {
  const config = getGuild(guildId);
  const before = config.alerts.length;
  config.alerts = config.alerts.filter(a => a.userId !== userId);
  saveGuild(guildId, config);
  return before - config.alerts.length;
}

function getActiveAlertsInGuild(guildId) {
  const config = getGuild(guildId);
  return config.alerts.filter(a => !a.triggered);
}

function markAlertTriggered(guildId, alertId) {
  const config = getGuild(guildId);
  const alert = config.alerts.find(a => a.id === alertId);
  if (alert) {
    alert.triggered = true;
    saveGuild(guildId, config);
  }
  return alert;
}

module.exports = {
  getGuild,
  saveGuild,
  updateGuild,
  resetGuild,
  deleteGuild,
  getAllGuildIds,
  DEFAULT_GUILD_CONFIG,
  addCryptoToGuild,
  removeCryptoFromGuild,
  updateCryptoInGuild,
  getCryptoInGuild,
  getGuildCryptos,
  addAlertToGuild,
  removeAlertFromGuild,
  getUserAlertsInGuild,
  clearUserAlertsInGuild,
  getActiveAlertsInGuild,
  markAlertTriggered,
};
