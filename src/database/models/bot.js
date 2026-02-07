const fs = require('fs');
const path = require('path');
const logger = require('../../utils/logger');

const BOTS_DIR = path.join(__dirname, '../../../data/bots');

function ensureBotsDir() {
  if (!fs.existsSync(BOTS_DIR)) {
    fs.mkdirSync(BOTS_DIR, { recursive: true });
  }
}

function botFile(botId) {
  return path.join(BOTS_DIR, `${botId}.json`);
}

/**
 * Generate a short unique bot ID.
 * @returns {string}
 */
function generateBotId() {
  return `bot_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
}

/**
 * Get a bot config by ID.
 * @param {string} botId
 * @returns {Object|null}
 */
function getBot(botId) {
  ensureBotsDir();
  const filePath = botFile(botId);
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (err) {
    logger.error(`Failed to read bot ${botId}`, { error: err.message });
    return null;
  }
}

/**
 * Save a bot config.
 * @param {string} botId
 * @param {Object} data
 */
function saveBot(botId, data) {
  ensureBotsDir();
  try {
    fs.writeFileSync(botFile(botId), JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    logger.error(`Failed to save bot ${botId}`, { error: err.message });
  }
}

/**
 * Create a new external bot entry.
 * @param {string} token
 * @param {string} crypto
 * @param {string} guildId
 * @param {string} format
 * @returns {Object}
 */
function createBot(token, crypto, guildId, format = 'simple') {
  const botId = generateBotId();
  const data = {
    id: botId,
    token,
    crypto: crypto.toUpperCase(),
    guildId,
    format,
    enabled: true,
    createdAt: Date.now(),
  };
  saveBot(botId, data);
  return data;
}

/**
 * Delete a bot config file.
 * @param {string} botId
 * @returns {boolean}
 */
function deleteBot(botId) {
  const filePath = botFile(botId);
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  } catch (err) {
    logger.error(`Failed to delete bot ${botId}`, { error: err.message });
    return false;
  }
}

/**
 * Get all external bots for a specific guild.
 * @param {string} guildId
 * @returns {Object[]}
 */
function getGuildBots(guildId) {
  ensureBotsDir();
  try {
    const files = fs.readdirSync(BOTS_DIR).filter(f => f.endsWith('.json'));
    const bots = [];
    for (const file of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(BOTS_DIR, file), 'utf-8'));
        if (data.guildId === guildId) bots.push(data);
      } catch {
        // Skip corrupted files
      }
    }
    return bots;
  } catch {
    return [];
  }
}

/**
 * Get all external bots.
 * @returns {Object[]}
 */
function getAllBots() {
  ensureBotsDir();
  try {
    const files = fs.readdirSync(BOTS_DIR).filter(f => f.endsWith('.json'));
    return files.map(file => {
      try {
        return JSON.parse(fs.readFileSync(path.join(BOTS_DIR, file), 'utf-8'));
      } catch {
        return null;
      }
    }).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Update a bot entry.
 * @param {string} botId
 * @param {Object} updates
 * @returns {Object|null}
 */
function updateBot(botId, updates) {
  const bot = getBot(botId);
  if (!bot) return null;
  const updated = { ...bot, ...updates };
  saveBot(botId, updated);
  return updated;
}

module.exports = {
  getBot,
  saveBot,
  createBot,
  deleteBot,
  getGuildBots,
  getAllBots,
  updateBot,
  generateBotId,
};
