const { ChannelType, PermissionFlagsBits } = require('discord.js');
const logger = require('../utils/logger');
const { formatChannelName } = require('../utils/formatter');
const { getGuild, updateGuild, updateCryptoInGuild, getGuildCryptos } = require('../database/models/guild');
const { buildPriceEmbed } = require('./embed-builder');

/**
 * Channel name update queue that respects Discord rate limits
 * (2 channel name updates per 10 minutes per channel).
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
    const config = getGuild(guild.id);

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

    updateGuild(guild.id, { categoryId: category.id });
    logger.info('Created crypto tracker category', { guildId: guild.id, categoryId: category.id });
    return category;
  }

  /**
   * Create the alerts channel if it doesn't exist.
   * @param {import('discord.js').Guild} guild
   * @param {import('discord.js').CategoryChannel} category
   * @returns {Promise<import('discord.js').TextChannel>}
   */
  async ensureAlertsChannel(guild, category) {
    const config = getGuild(guild.id);

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

    updateGuild(guild.id, { alertsChannelId: channel.id });
    logger.info('Created alerts channel', { guildId: guild.id, channelId: channel.id });
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

    updateCryptoInGuild(guild.id, symbol, { channelId: channel.id });
    logger.info('Created crypto channel', { guildId: guild.id, symbol, channelId: channel.id });
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
        logger.info('Deleted crypto channel', { guildId: guild.id, channelId });
      }
    } catch (err) {
      logger.error('Failed to delete crypto channel', { channelId, error: err.message });
    }
  }

  /**
   * Update all crypto channels for a specific guild.
   * @param {import('discord.js').Guild} guild
   * @param {Object} quotes
   */
  async updateGuildChannels(guild, quotes) {
    const config = getGuild(guild.id);
    const cryptos = config.cryptos.filter(c => c.enabled);

    for (const crypto of cryptos) {
      const quote = quotes[crypto.symbol];
      if (!quote || !crypto.channelId) continue;

      const channel = guild.channels.cache.get(crypto.channelId);
      if (!channel) continue;

      // Queue channel name update (rate limited)
      const newName = formatChannelName(crypto.symbol, quote.price, quote.change24h);
      this.queueNameUpdate(channel, newName);

      // Update or send embed
      try {
        const embed = buildPriceEmbed(quote, config);

        if (crypto.messageId) {
          try {
            const msg = await channel.messages.fetch(crypto.messageId);
            await msg.edit({ embeds: [embed] });
          } catch {
            const newMsg = await channel.send({ embeds: [embed] });
            updateCryptoInGuild(guild.id, crypto.symbol, { messageId: newMsg.id });
          }
        } else {
          const newMsg = await channel.send({ embeds: [embed] });
          updateCryptoInGuild(guild.id, crypto.symbol, { messageId: newMsg.id });
        }

        // Update topic
        const tz = config.timezone || 'Europe/Paris';
        const topic = `${crypto.symbol} | ${new Date().toLocaleTimeString('fr-FR', { timeZone: tz })} | ${(quote.change24h >= 0 ? '+' : '')}${quote.change24h?.toFixed(2) || 0}% (24h)`;
        try { await channel.setTopic(topic); } catch { /* rate limited */ }
      } catch (err) {
        logger.error('Failed to update channel', { guildId: guild.id, symbol: crypto.symbol, error: err.message });
      }
    }

    this.updateCount++;
  }

  /**
   * Update channels across all guilds.
   * @param {import('discord.js').Client} client
   * @param {Object} quotes
   */
  async updateAllGuilds(client, quotes) {
    const { getAllGuildIds, getGuild: getGuildConfig } = require('../database/models/guild');
    const guildIds = getAllGuildIds();

    for (const guildId of guildIds) {
      const config = getGuildConfig(guildId);
      if (!config.setupComplete) continue;

      const guild = client.guilds.cache.get(guildId);
      if (!guild) continue;

      // Collect all symbols needed for this guild
      const guildSymbols = config.cryptos.filter(c => c.enabled).map(c => c.symbol);
      const guildQuotes = {};
      for (const sym of guildSymbols) {
        if (quotes[sym]) guildQuotes[sym] = quotes[sym];
      }

      if (Object.keys(guildQuotes).length > 0) {
        await this.updateGuildChannels(guild, guildQuotes);
      }
    }
  }

  /**
   * Queue a channel name update.
   */
  queueNameUpdate(channel, newName) {
    // Deduplicate: remove older update for same channel
    this.updateQueue = this.updateQueue.filter(item => item.channel.id !== channel.id);
    this.updateQueue.push({ channel, newName, queuedAt: Date.now() });
    if (!this.processing) {
      this.processQueue();
    }
  }

  /** Process the channel name update queue with rate limit delays. */
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
        logger.warn('Rate limited on channel rename, delaying queue');
        this.updateQueue.unshift(item);
        await new Promise(resolve => setTimeout(resolve, 600000));
      } else {
        logger.error('Failed to rename channel', { error: err.message });
      }
    }

    // Wait 5 minutes between channel name updates (Discord rate limit: 2/10min)
    await new Promise(resolve => setTimeout(resolve, 300000));
    this.processQueue();
  }

  getUpdateCount() { return this.updateCount; }
}

module.exports = new ChannelManager();
