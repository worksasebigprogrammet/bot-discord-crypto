const { readData, writeData } = require('../db');

const FILE = 'config.json';

const DEFAULT_CONFIG = {
  guildId: null,
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
};

function getConfig() {
  return { ...DEFAULT_CONFIG, ...readData(FILE, DEFAULT_CONFIG) };
}

function setConfig(updates) {
  const config = getConfig();
  const newConfig = { ...config, ...updates };
  writeData(FILE, newConfig);
  return newConfig;
}

function resetConfig() {
  writeData(FILE, DEFAULT_CONFIG);
  return { ...DEFAULT_CONFIG };
}

module.exports = { getConfig, setConfig, resetConfig, DEFAULT_CONFIG };
