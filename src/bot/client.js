const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

/**
 * Create and configure the main Discord client.
 * Loads all commands from src/commands subdirectories.
 * @returns {Client}
 */
function createClient() {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMembers,
    ],
  });

  // Load commands
  client.commands = new Collection();
  const commandsPath = path.join(__dirname, '../commands');
  const commandFolders = fs.readdirSync(commandsPath);

  for (const folder of commandFolders) {
    const folderPath = path.join(commandsPath, folder);
    const stat = fs.statSync(folderPath);
    if (!stat.isDirectory()) continue;

    const commandFiles = fs.readdirSync(folderPath).filter(f => f.endsWith('.js'));
    for (const file of commandFiles) {
      try {
        const command = require(path.join(folderPath, file));
        if (command.data && command.data.name) {
          client.commands.set(command.data.name, command);
          logger.debug('Loaded command', { name: command.data.name, file });
        }
      } catch (err) {
        logger.error('Failed to load command', { file, error: err.message });
      }
    }
  }

  logger.info(`Loaded ${client.commands.size} commands`);
  return client;
}

module.exports = { createClient };
