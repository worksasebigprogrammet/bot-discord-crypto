require('dotenv').config();

const { createClient } = require('./bot/client');
const logger = require('./utils/logger');
const fs = require('fs');
const path = require('path');

// Ensure data directories exist
for (const dir of ['data', 'data/guilds', 'data/bots', 'logs']) {
  const dirPath = path.join(__dirname, '..', dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

// Record start time for uptime calculation
global.botStartTime = Date.now();

// Create Discord client
const client = createClient();

// Register events
const eventsPath = path.join(__dirname, 'bot/events');
const eventFiles = fs.readdirSync(eventsPath).filter(f => f.endsWith('.js'));

for (const file of eventFiles) {
  const event = require(path.join(eventsPath, file));
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args));
  } else {
    client.on(event.name, (...args) => event.execute(...args));
  }
  logger.debug('Registered event', { name: event.name });
}

// Login to Discord
client.login(process.env.DISCORD_TOKEN)
  .then(() => logger.info('Bot login initiated'))
  .catch(err => {
    logger.error('Failed to login', { error: err.message });
    process.exit(1);
  });

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down...');
  const { stopScheduler } = require('./services/scheduler');
  const { stopAllBots } = require('./services/bot-manager');
  stopScheduler();
  stopAllBots();
  client.destroy();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down...');
  const { stopScheduler } = require('./services/scheduler');
  const { stopAllBots } = require('./services/bot-manager');
  stopScheduler();
  stopAllBots();
  client.destroy();
  process.exit(0);
});

process.on('unhandledRejection', (err) => {
  logger.error('Unhandled rejection', { error: err.message, stack: err.stack });
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { error: err.message, stack: err.stack });
  process.exit(1);
});
