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
 * Fetch quotes from CoinMarketCap for given symbols.
 * @param {string[]} symbols
 * @returns {Promise<Object>}
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
    // CMC may return array for ambiguous symbols, take first
    const item = Array.isArray(entry) ? entry[0] : entry;
    const quote = item.quote.USD;
    result[sym] = {
      symbol: item.symbol,
      name: item.name,
      price: quote.price,
      change1h: quote.percent_change_1h,
      change24h: quote.percent_change_24h,
      change7d: quote.percent_change_7d,
      volume24h: quote.volume_24h,
      marketCap: quote.market_cap,
      rank: item.cmc_rank,
      logo: `https://s2.coinmarketcap.com/static/img/coins/64x64/${item.id}.png`,
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
  // Map symbols to CoinGecko IDs
  const ids = symbols.map(s => GECKO_ID_MAP[s] || s.toLowerCase());

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

  for (let i = 0; i < symbols.length; i++) {
    const geckoId = GECKO_ID_MAP[symbols[i]] || symbols[i].toLowerCase();
    const entry = data[geckoId];
    if (!entry) continue;
    result[symbols[i]] = {
      symbol: symbols[i],
      name: symbols[i],
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

// Extended CoinGecko ID map for 100+ cryptos
const GECKO_ID_MAP = {
  BTC: 'bitcoin', ETH: 'ethereum', BNB: 'binancecoin', SOL: 'solana',
  XRP: 'ripple', ADA: 'cardano', DOGE: 'dogecoin', TRX: 'tron',
  DOT: 'polkadot', MATIC: 'matic-network', AVAX: 'avalanche-2',
  LINK: 'chainlink', SHIB: 'shiba-inu', LTC: 'litecoin', UNI: 'uniswap',
  ATOM: 'cosmos', XLM: 'stellar', NEAR: 'near', APT: 'aptos',
  ARB: 'arbitrum', OP: 'optimism', SUI: 'sui', FIL: 'filecoin',
  HBAR: 'hedera-hashgraph', ICP: 'internet-computer', VET: 'vechain',
  ALGO: 'algorand', SAND: 'the-sandbox', MANA: 'decentraland',
  AXS: 'axie-infinity', AAVE: 'aave', GRT: 'the-graph', FTM: 'fantom',
  THETA: 'theta-token', EOS: 'eos', FLOW: 'flow', XTZ: 'tezos',
  MKR: 'maker', SNX: 'havven', CRV: 'curve-dao-token', LDO: 'lido-dao',
  IMX: 'immutable-x', RUNE: 'thorchain', INJ: 'injective-protocol',
  PEPE: 'pepe', WIF: 'dogwifcoin', BONK: 'bonk', FLOKI: 'floki',
  STX: 'blockstack', SEI: 'sei-network', TIA: 'celestia', JUP: 'jupiter-exchange-solana',
  PYTH: 'pyth-network', WLD: 'worldcoin-wld', RNDR: 'render-token',
  FET: 'fetch-ai', OCEAN: 'ocean-protocol', AGIX: 'singularitynet',
  CRO: 'crypto-com-chain', EGLD: 'elrond-erd-2', KAVA: 'kava',
  ZEC: 'zcash', DASH: 'dash', COMP: 'compound-governance-token',
  BAT: 'basic-attention-token', ENJ: 'enjincoin', CHZ: 'chiliz',
  GALA: 'gala', YFI: 'yearn-finance', SUSHI: 'sushi', ONE: 'harmony',
  ZIL: 'zilliqa', ENS: 'ethereum-name-service', DYDX: 'dydx',
  GMX: 'gmx', BLUR: 'blur', MASK: 'mask-network', '1INCH': '1inch',
  CELO: 'celo', ROSE: 'oasis-network', MINA: 'mina-protocol',
  KSM: 'kusama', IOTA: 'iota', NEO: 'neo', WAVES: 'waves',
  QTUM: 'qtum', ZRX: '0x', BAL: 'balancer', LOOM: 'loom-network',
  STORJ: 'storj', ANKR: 'ankr', SKL: 'skale', ICX: 'icon',
  ONT: 'ontology', SC: 'siacoin', RVN: 'ravencoin', COTI: 'coti',
  CELR: 'celer-network', AUDIO: 'audius', JASMY: 'jasmycoin',
  API3: 'api3', BAND: 'band-protocol', PERP: 'perpetual-protocol',
  TON: 'the-open-network', USDT: 'tether', USDC: 'usd-coin',
  DAI: 'dai', BUSD: 'binance-usd', KAS: 'kaspa', TAO: 'bittensor',
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
      return await fetchFromCoinGecko(symbols);
    } catch (geckoErr) {
      logger.error('CoinGecko fallback also failed', { error: geckoErr.message });
      throw new Error('All crypto API sources failed');
    }
  }
}

/**
 * Fetch top N cryptocurrencies by market cap from CMC.
 * @param {number} limit
 * @returns {Promise<Object[]>}
 */
async function fetchTop(limit = 10) {
  const apiKey = process.env.CMC_API_KEY;
  if (!apiKey) throw new Error('CMC_API_KEY not set');

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
      change1h: quote.percent_change_1h,
      change24h: quote.percent_change_24h,
      change7d: quote.percent_change_7d,
      volume24h: quote.volume_24h,
      marketCap: quote.market_cap,
      rank: entry.cmc_rank,
      logo: `https://s2.coinmarketcap.com/static/img/coins/64x64/${entry.id}.png`,
    };
  });
}

/**
 * Search for a cryptocurrency by name/symbol via CMC map.
 * @param {string} query
 * @returns {Promise<Object[]>}
 */
async function searchCrypto(query) {
  const apiKey = process.env.CMC_API_KEY;
  if (!apiKey) throw new Error('CMC_API_KEY not set');

  const response = await axios.get(`${CMC_BASE}/v1/cryptocurrency/map`, {
    headers: { 'X-CMC_PRO_API_KEY': apiKey },
    params: { listing_status: 'active', limit: 5000 },
    timeout: 15000,
  });
  trackApiCall();

  const q = query.toLowerCase();
  return response.data.data
    .filter(c => c.symbol.toLowerCase().includes(q) || c.name.toLowerCase().includes(q))
    .slice(0, 25)
    .map(c => ({ symbol: c.symbol, name: c.name, rank: c.rank, id: c.id }));
}

// Cache the full crypto map for autocomplete
let cryptoMapCache = null;
let cryptoMapCacheTime = 0;
const CRYPTO_MAP_TTL = 86400000; // 24h

/**
 * Get the full crypto map for autocomplete, cached 24h.
 * @returns {Promise<Object[]>}
 */
async function getCryptoMap() {
  if (cryptoMapCache && Date.now() - cryptoMapCacheTime < CRYPTO_MAP_TTL) {
    return cryptoMapCache;
  }

  const apiKey = process.env.CMC_API_KEY;
  if (!apiKey) {
    // Return hardcoded top 100 if no API key
    return Object.keys(GECKO_ID_MAP).map(s => ({ symbol: s, name: s }));
  }

  try {
    const response = await axios.get(`${CMC_BASE}/v1/cryptocurrency/map`, {
      headers: { 'X-CMC_PRO_API_KEY': apiKey },
      params: { listing_status: 'active', sort: 'cmc_rank', limit: 500 },
      timeout: 15000,
    });
    trackApiCall();

    cryptoMapCache = response.data.data.map(c => ({
      symbol: c.symbol,
      name: c.name,
      rank: c.rank,
    }));
    cryptoMapCacheTime = Date.now();
    return cryptoMapCache;
  } catch (err) {
    logger.error('Failed to fetch crypto map', { error: err.message });
    return Object.keys(GECKO_ID_MAP).map(s => ({ symbol: s, name: s }));
  }
}

module.exports = {
  fetchQuotes,
  fetchTop,
  searchCrypto,
  getApiCallCount,
  getCryptoMap,
  GECKO_ID_MAP,
};
