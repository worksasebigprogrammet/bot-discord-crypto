const logger = require('../utils/logger');

/** In-memory price cache optimized for 1GB RAM. */
class CacheService {
  constructor() {
    this.cache = new Map();
    this.stats = { hits: 0, misses: 0 };
  }

  /**
   * Get cached data.
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

  /** Clear entire cache. */
  clear() {
    this.cache.clear();
    logger.debug('Cache cleared');
  }

  /** Evict stale entries older than maxAge ms. */
  evict(maxAge = 3600000) {
    const now = Date.now();
    let evicted = 0;
    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > maxAge) {
        this.cache.delete(key);
        evicted++;
      }
    }
    if (evicted > 0) logger.debug(`Evicted ${evicted} stale cache entries`);
  }

  /** Get cache hit rate. */
  getHitRate() {
    const total = this.stats.hits + this.stats.misses;
    if (total === 0) return '0.0';
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
