const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const locales = {};

// Load locale files at startup
for (const file of ['fr.json', 'en.json']) {
  const lang = file.replace('.json', '');
  const filePath = path.join(__dirname, '../locales', file);
  try {
    locales[lang] = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (err) {
    logger.error(`Failed to load locale ${lang}`, { error: err.message });
    locales[lang] = {};
  }
}

/**
 * Translate a key for a given language, with variable interpolation.
 * @param {string} key - Dot-notated key (e.g. "setup.welcome")
 * @param {string} lang - Language code ("fr" or "en")
 * @param {Object} vars - Variables to interpolate (e.g. { symbol: "BTC" })
 * @returns {string}
 */
function t(key, lang = 'fr', vars = {}) {
  const locale = locales[lang] || locales.fr;
  let text = locale[key] || locales.fr[key] || key;

  for (const [k, v] of Object.entries(vars)) {
    text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
  }

  return text;
}

/**
 * Get language for a guild from its config.
 * Convenience wrapper that defaults to 'fr'.
 * @param {Object} guildConfig
 * @returns {string}
 */
function getLang(guildConfig) {
  return (guildConfig && guildConfig.language) ? guildConfig.language.toLowerCase() : 'fr';
}

module.exports = { t, getLang };
