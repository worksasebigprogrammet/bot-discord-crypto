const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const DATA_DIR = path.join(__dirname, '../../data');

/** Ensure data directory exists. */
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * Read a JSON data file.
 * @param {string} filename
 * @param {*} defaultValue
 * @returns {*}
 */
function readData(filename, defaultValue = {}) {
  ensureDataDir();
  const filePath = path.join(DATA_DIR, filename);
  try {
    if (!fs.existsSync(filePath)) {
      writeData(filename, defaultValue);
      return defaultValue;
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    logger.error(`Failed to read ${filename}`, { error: err.message });
    return defaultValue;
  }
}

/**
 * Write data to a JSON file.
 * @param {string} filename
 * @param {*} data
 */
function writeData(filename, data) {
  ensureDataDir();
  const filePath = path.join(DATA_DIR, filename);
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    logger.error(`Failed to write ${filename}`, { error: err.message });
  }
}

module.exports = { readData, writeData, DATA_DIR };
