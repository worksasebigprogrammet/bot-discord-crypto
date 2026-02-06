const { ChannelType, PermissionFlagsBits } = require('discord.js');
const logger = require('../utils/logger');
const { formatChannelName } = require('../utils/formatter');
const { getConfig, setConfig } = require('../database/models/config');
const { getCryptos, updateCrypto } = require('../database/models/crypto');
const { buildPriceEmbed } = require('./embed-builder');

/**
 * Queue for channel name updates to respect Discord rate limits.
 * Discord allows ~2 channel name updates per 10 minutes per channel.
 */
class ChannelManager {
  constructor() {
    this.updateQueue = [];
    this.processing = false;
    this.updateCount = 0;
  }

  /**
   * Create the crypto tracker category if it doesn't exist.
   * @param {import('discord.js').Guild} guild
   * @returns {Promise<import('discord.js').CategoryChannel>}
   */
  async ensureCategory(guild) {
    const config = getConfig();

    if (config.categoryId) {
      const existing = guild.channels.cache.get(config.categoryId);
      if (existing) return existing;
    }

    const category = await guild.channels.create({
      name: '📊 CRYPTO TRACKER',
      type: ChannelType.GuildCategory,
      permissionOverwrites: [
        {
          id: guild.id,
          allow: [PermissionFlagsBits.ViewChannel],
          deny: [PermissionFlagsBits.SendMessages],
        },
      ],
    });

    setConfig({ categoryId: category.id });
    logger.info('Created crypto tracker category', { categoryId: category.id });
    return category;
  }

  /**
   * Create the alerts channel if it doesn't exist.
   * @param {import('discord.js').Guild} guild
   * @param {import('discord.js').CategoryChannel} category
   * @returns {Promise<import('discord.js').TextChannel>}
   */
  async ensureAlertsChannel(guild, category) {
    const config = getConfig();

    if (config.alertsChannelId) {
      const existing = guild.channels.cache.get(config.alertsChannelId);
      if (existing) return existing;
    }

    const channel = await guild.channels.create({
      name: '🚨-alerts',
      type: ChannelType.GuildText,
      parent: category.id,
      permissionOverwrites: [
        {
          id: guild.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
          deny: [PermissionFlagsBits.SendMessages],
        },
      ],
    });

    setConfig({ alertsChannelId: channel.id });
    logger.info('Created alerts channel', { channelId: channel.id });
    return channel;
  }

  /**
   * Create a channel for a tracked crypto.
   * @param {import('discord.js').Guild} guild
   * @param {import('discord.js').CategoryChannel} category
   * @param {string} symbol
   * @returns {Promise<import('discord.js').TextChannel>}
   */
  async createCryptoChannel(guild, category, symbol) {
    const channel = await guild.channels.create({
      name: `📈┃${symbol.toLowerCase()}-loading`,
      type: ChannelType.GuildText,
      parent: category.id,
      permissionOverwrites: [
        {
          id: guild.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
          deny: [PermissionFlagsBits.SendMessages],
        },
      ],
    });

    updateCrypto(symbol, { channelId: channel.id });
    logger.info('Created crypto channel', { symbol, channelId: channel.id });
    return channel;
  }

  /**
   * Delete a crypto channel.
   * @param {import('discord.js').Guild} guild
   * @param {string} channelId
   */
  async deleteCryptoChannel(guild, channelId) {
    try {
      const channel = guild.channels.cache.get(channelId);
      if (channel) {
        await channel.delete('Crypto untracked');
        logger.info('Deleted crypto channel', { channelId });
      }
    } catch (err) {
      logger.error('Failed to delete crypto channel', { channelId, error: err.message });
    }
  }

  /**
   * Update all crypto channels with latest prices.
   * @param {import('discord.js').Client} client
   * @param {Object} quotes - Map of symbol -> quote data
   */
  async updateChannels(client, quotes) {
    const config = getConfig();
    const cryptos = getCryptos().filter(c => c.enabled);
    const guild = client.guilds.cache.first();
    if (!guild) return;

    for (const crypto of cryptos) {
      const quote = quotes[crypto.symbol];
      if (!quote || !crypto.channelId) continue;

      const channel = guild.channels.cache.get(crypto.channelId);
      if (!channel) continue;

      // Queue channel name update (rate limited)
      const newName = formatChannelName(crypto.symbol, quote.price, quote.change24h);
      this.queueNameUpdate(channel, newName);

      // Update or send embed (not rate limited like channel names)
      try {
        const embed = buildPriceEmbed(quote);
        const topic = `${crypto.symbol} | ${new Date().toLocaleTimeString('fr-FR', { timeZone: config.timezone })} | ${quote.change24h >= 0 ? '+' : ''}${quote.change24h?.toFixed(2)}% (24h)`;

        if (crypto.messageId) {
          try {
            const msg = await channel.messages.fetch(crypto.messageId);
            await msg.edit({ embeds: [embed] });
          } catch {
            // Message deleted, send new one
            const newMsg = await channel.send({ embeds: [embed] });
            updateCrypto(crypto.symbol, { messageId: newMsg.id });
          }
        } else {
          const newMsg = await channel.send({ embeds: [embed] });
          updateCrypto(crypto.symbol, { messageId: newMsg.id });
        }

        // Update topic
        try {
          await channel.setTopic(topic);
        } catch {
          // Topic update may be rate limited
        }
      } catch (err) {
        logger.error('Failed to update channel', { symbol: crypto.symbol, error: err.message });
      }
    }

    this.updateCount++;
  }

  /**
   * Queue a channel name update to respect rate limits.
   * @param {import('discord.js').TextChannel} channel
   * @param {string} newName
   */
  queueNameUpdate(channel, newName) {
    this.updateQueue.push({ channel, newName, queuedAt: Date.now() });
    if (!this.processing) {
      this.processQueue();
    }
  }

  /** Process the channel name update queue. */
  async processQueue() {
    if (this.updateQueue.length === 0) {
      this.processing = false;
      return;
    }

    this.processing = true;
    const item = this.updateQueue.shift();

    try {
      if (item.channel.name !== item.newName) {
        await item.channel.setName(item.newName);
        logger.debug('Updated channel name', { channelId: item.channel.id, name: item.newName });
      }
    } catch (err) {
      if (err.code === 20028 || err.status === 429) {
        // Rate limited — re-queue with delay
        logger.warn('Rate limited on channel rename, re-queuing');
        this.updateQueue.unshift(item);
        await new Promise(resolve => setTimeout(resolve, 600000)); // Wait 10 min
      } else {
        logger.error('Failed to rename channel', { error: err.message });
      }
    }

    // Wait 5 minutes between channel name updates
    await new Promise(resolve => setTimeout(resolve, 300000));
    this.processQueue();
  }

  /** Get update count. */
  getUpdateCount() {
    return this.updateCount;
  }
}

module.exports = new ChannelManager();
