const { readData, writeData } = require('../db');

const FILE = 'cryptos.json';

/**
 * @typedef {Object} TrackedCrypto
 * @property {string} symbol
 * @property {string} name
 * @property {string|null} channelId
 * @property {string|null} messageId
 * @property {boolean} enabled
 * @property {number} addedAt
 */

function getCryptos() {
  return readData(FILE, []);
}

function saveCryptos(cryptos) {
  writeData(FILE, cryptos);
}

function addCrypto(symbol, name = '') {
  const cryptos = getCryptos();
  const existing = cryptos.find(c => c.symbol.toUpperCase() === symbol.toUpperCase());
  if (existing) return null;

  const entry = {
    symbol: symbol.toUpperCase(),
    name: name || symbol.toUpperCase(),
    channelId: null,
    messageId: null,
    enabled: true,
    addedAt: Date.now(),
  };
  cryptos.push(entry);
  saveCryptos(cryptos);
  return entry;
}

function removeCrypto(symbol) {
  const cryptos = getCryptos();
  const index = cryptos.findIndex(c => c.symbol.toUpperCase() === symbol.toUpperCase());
  if (index === -1) return null;

  const [removed] = cryptos.splice(index, 1);
  saveCryptos(cryptos);
  return removed;
}

function updateCrypto(symbol, updates) {
  const cryptos = getCryptos();
  const crypto = cryptos.find(c => c.symbol.toUpperCase() === symbol.toUpperCase());
  if (!crypto) return null;

  Object.assign(crypto, updates);
  saveCryptos(cryptos);
  return crypto;
}

function getCrypto(symbol) {
  const cryptos = getCryptos();
  return cryptos.find(c => c.symbol.toUpperCase() === symbol.toUpperCase()) || null;
}

module.exports = { getCryptos, saveCryptos, addCrypto, removeCrypto, updateCrypto, getCrypto };
