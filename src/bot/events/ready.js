const { ActivityType } = require('discord.js');
const logger = require('../../utils/logger');
const { startScheduler } = require('../../services/scheduler');
const { startAllBots, updateAllBotStatuses } = require('../../services/bot-manager');
const { getAllGuildIds, getGuild } = require('../../database/models/guild');

module.exports = {
  name: 'ready',
  once: true,
  async execute(client) {
    logger.info(`Bot ready! Logged in as ${client.user.tag}`);
    logger.info(`Serving ${client.guilds.cache.size} guild(s)`);

    // Set default status
    client.user.setPresence({
      activities: [{
        name: `${client.guilds.cache.size} serveurs | /help`,
        type: ActivityType.Watching,
      }],
      status: 'online',
    });

    // Check if any guild has setup complete
    const guildIds = getAllGuildIds();
    let hasSetup = false;
    for (const guildId of guildIds) {
      const config = getGuild(guildId);
      if (config.setupComplete) {
        hasSetup = true;
        break;
      }
    }

    // Start scheduler if at least one guild is set up
    if (hasSetup) {
      startScheduler(client);
    } else {
      logger.info('No guilds have setup complete. Use /setup in a server to get started.');
    }

    // Start external bots
    try {
      await startAllBots();
      // Update external bot statuses every 10 minutes
      setInterval(() => updateAllBotStatuses(), 600000);
    } catch (err) {
      logger.error('Failed to start external bots', { error: err.message });
    }
  },
};
