const { Events } = require('discord.js');
const logger = require('../../utils/logger');
const { startScheduler } = require('../../services/scheduler');
const { getConfig } = require('../../database/models/config');

module.exports = {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    logger.info(`Bot logged in as ${client.user.tag}`);
    logger.info(`Serving ${client.guilds.cache.size} guild(s)`);

    // Set bot activity
    client.user.setActivity('les prix crypto 📈', { type: 3 }); // WATCHING

    // Start the price update scheduler
    const config = getConfig();
    if (config.setupComplete) {
      startScheduler(client);
      logger.info('Scheduler started automatically');
    } else {
      logger.info('Setup not complete - use /setup to configure the bot');
    }
  },
};
