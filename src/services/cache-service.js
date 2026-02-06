const logger = require('../utils/logger');

/** In-memory price cache. */
class CacheService {
  constructor() {
    this.cache = new Map();
    this.stats = { hits: 0, misses: 0 };
  }

  /**
   * Get cached data for a symbol.
   * @param {string} key
   * @param {number} ttl - TTL in milliseconds
   * @returns {*|null}
   */
  get(key, ttl) {
    const entry = this.cache.get(key);
    if (!entry) {
      this.stats.misses++;
      return null;
    }
    if (Date.now() - entry.timestamp > ttl) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }
    this.stats.hits++;
    return entry.data;
  }

  /**
   * Store data in cache.
   * @param {string} key
   * @param {*} data
   */
  set(key, data) {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  /**
   * Get all cached prices.
   * @param {number} ttl
   * @returns {Object}
   */
  getAllPrices(ttl) {
    const result = {};
    for (const [key, entry] of this.cache) {
      if (Date.now() - entry.timestamp <= ttl) {
        result[key] = entry.data;
      }
    }
    return result;
  }

  /** Clear entire cache. */
  clear() {
    this.cache.clear();
    logger.info('Cache cleared');
  }

  /** Get cache hit rate. */
  getHitRate() {
    const total = this.stats.hits + this.stats.misses;
    if (total === 0) return 0;
    return ((this.stats.hits / total) * 100).toFixed(1);
  }

  /** Get cache stats. */
  getStats() {
    return {
      size: this.cache.size,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: this.getHitRate(),
    };
  }
}

module.exports = new CacheService();
