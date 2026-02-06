const axios = require('axios');
const logger = require('../utils/logger');

const CMC_BASE = 'https://pro-api.coinmarketcap.com';
const GECKO_BASE = 'https://api.coingecko.com/api/v3';

let apiCallCount = 0;
let lastResetDate = new Date().toDateString();

function trackApiCall() {
  const today = new Date().toDateString();
  if (today !== lastResetDate) {
    apiCallCount = 0;
    lastResetDate = today;
  }
  apiCallCount++;
}

function getApiCallCount() {
  const today = new Date().toDateString();
  if (today !== lastResetDate) {
    apiCallCount = 0;
    lastResetDate = today;
  }
  return apiCallCount;
}

/**
 * Fetch quotes from CoinMarketCap.
 * @param {string[]} symbols - Array of crypto symbols (e.g. ['BTC', 'ETH'])
 * @returns {Promise<Object>} Map of symbol -> quote data
 */
async function fetchFromCMC(symbols) {
  const apiKey = process.env.CMC_API_KEY;
  if (!apiKey) throw new Error('CMC_API_KEY not set');

  const response = await axios.get(`${CMC_BASE}/v1/cryptocurrency/quotes/latest`, {
    headers: { 'X-CMC_PRO_API_KEY': apiKey },
    params: { symbol: symbols.join(','), convert: 'USD' },
    timeout: 10000,
  });

  trackApiCall();
  const data = response.data.data;
  const result = {};

  for (const sym of symbols) {
    const entry = data[sym];
    if (!entry) continue;
    const quote = entry.quote.USD;
    result[sym] = {
      symbol: entry.symbol,
      name: entry.name,
      price: quote.price,
      change1h: quote.percent_change_1h,
      change24h: quote.percent_change_24h,
      change7d: quote.percent_change_7d,
      volume24h: quote.volume_24h,
      marketCap: quote.market_cap,
      rank: entry.cmc_rank,
      logo: `https://s2.coinmarketcap.com/static/img/coins/64x64/${entry.id}.png`,
      lastUpdated: quote.last_updated,
    };
  }
  return result;
}

/**
 * Fetch quotes from CoinGecko as fallback.
 * @param {string[]} symbols
 * @returns {Promise<Object>}
 */
async function fetchFromCoinGecko(symbols) {
  const ids = symbols.map(s => s.toLowerCase());
  const response = await axios.get(`${GECKO_BASE}/simple/price`, {
    params: {
      ids: ids.join(','),
      vs_currencies: 'usd',
      include_24hr_change: true,
      include_24hr_vol: true,
      include_market_cap: true,
    },
    timeout: 10000,
  });

  const data = response.data;
  const result = {};

  for (const sym of symbols) {
    const id = sym.toLowerCase();
    const entry = data[id];
    if (!entry) continue;
    result[sym] = {
      symbol: sym,
      name: sym,
      price: entry.usd,
      change1h: null,
      change24h: entry.usd_24h_change || 0,
      change7d: null,
      volume24h: entry.usd_24h_vol || 0,
      marketCap: entry.usd_market_cap || 0,
      rank: null,
      logo: null,
      lastUpdated: new Date().toISOString(),
    };
  }
  return result;
}

// Map of common symbols to CoinGecko IDs
const GECKO_ID_MAP = {
  BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', BNB: 'binancecoin',
  XRP: 'ripple', ADA: 'cardano', DOT: 'polkadot', MATIC: 'matic-network',
  AVAX: 'avalanche-2', LINK: 'chainlink', DOGE: 'dogecoin', SHIB: 'shiba-inu',
  LTC: 'litecoin', UNI: 'uniswap', ATOM: 'cosmos', NEAR: 'near',
  APT: 'aptos', ARB: 'arbitrum', OP: 'optimism', SUI: 'sui',
};

/**
 * Fetch crypto quotes with CMC primary and CoinGecko fallback.
 * @param {string[]} symbols
 * @returns {Promise<Object>}
 */
async function fetchQuotes(symbols) {
  if (!symbols || symbols.length === 0) return {};

  try {
    return await fetchFromCMC(symbols);
  } catch (err) {
    logger.warn('CoinMarketCap API failed, falling back to CoinGecko', { error: err.message });
    try {
      const geckoSymbols = symbols.map(s => GECKO_ID_MAP[s] || s.toLowerCase());
      const geckoResult = await fetchFromCoinGecko(geckoSymbols);
      // Re-map keys back to original symbols
      const result = {};
      for (let i = 0; i < symbols.length; i++) {
        const geckoId = GECKO_ID_MAP[symbols[i]] || symbols[i].toLowerCase();
        if (geckoResult[geckoId]) {
          result[symbols[i]] = { ...geckoResult[geckoId], symbol: symbols[i] };
        }
      }
      return result;
    } catch (geckoErr) {
      logger.error('CoinGecko fallback also failed', { error: geckoErr.message });
      throw new Error('All crypto API sources failed');
    }
  }
}

/**
 * Fetch top cryptocurrencies by market cap.
 * @param {number} limit
 * @returns {Promise<Object[]>}
 */
async function fetchTop(limit = 10) {
  const apiKey = process.env.CMC_API_KEY;
  if (!apiKey) throw new Error('CMC_API_KEY not set');

  try {
    const response = await axios.get(`${CMC_BASE}/v1/cryptocurrency/listings/latest`, {
      headers: { 'X-CMC_PRO_API_KEY': apiKey },
      params: { limit, convert: 'USD', sort: 'market_cap' },
      timeout: 10000,
    });
    trackApiCall();

    return response.data.data.map(entry => {
      const quote = entry.quote.USD;
      return {
        symbol: entry.symbol,
        name: entry.name,
        price: quote.price,
        change24h: quote.percent_change_24h,
        marketCap: quote.market_cap,
        rank: entry.cmc_rank,
        logo: `https://s2.coinmarketcap.com/static/img/coins/64x64/${entry.id}.png`,
      };
    });
  } catch (err) {
    logger.error('Failed to fetch top cryptos', { error: err.message });
    throw err;
  }
}

/**
 * Search for a cryptocurrency by name/symbol.
 * @param {string} query
 * @returns {Promise<Object[]>}
 */
async function searchCrypto(query) {
  const apiKey = process.env.CMC_API_KEY;
  if (!apiKey) throw new Error('CMC_API_KEY not set');

  try {
    const response = await axios.get(`${CMC_BASE}/v1/cryptocurrency/map`, {
      headers: { 'X-CMC_PRO_API_KEY': apiKey },
      params: { listing_status: 'active', limit: 20 },
      timeout: 10000,
    });
    trackApiCall();

    const q = query.toLowerCase();
    return response.data.data
      .filter(c => c.symbol.toLowerCase().includes(q) || c.name.toLowerCase().includes(q))
      .slice(0, 10)
      .map(c => ({ symbol: c.symbol, name: c.name, rank: c.rank }));
  } catch (err) {
    logger.error('Search failed', { error: err.message });
    throw err;
  }
}

module.exports = {
  fetchQuotes,
  fetchTop,
  searchCrypto,
  getApiCallCount,
  GECKO_ID_MAP,
};
