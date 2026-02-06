const { Client, GatewayIntentBits, Collection, Partials } = require('discord.js');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

function createClient() {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMembers,
    ],
    partials: [Partials.Channel],
  });

  client.commands = new Collection();

  // Load commands from all subdirectories
  const commandsPath = path.join(__dirname, '../commands');
  const commandFolders = fs.readdirSync(commandsPath);

  for (const folder of commandFolders) {
    const folderPath = path.join(commandsPath, folder);
    const stat = fs.statSync(folderPath);
    if (!stat.isDirectory()) continue;

    const commandFiles = fs.readdirSync(folderPath).filter(f => f.endsWith('.js'));
    for (const file of commandFiles) {
      const command = require(path.join(folderPath, file));
      if (command.data && command.execute) {
        client.commands.set(command.data.name, command);
        logger.debug('Loaded command', { name: command.data.name });
      }
    }
  }

  return client;
}

module.exports = { createClient };
