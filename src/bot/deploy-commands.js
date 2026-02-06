require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

const commands = [];
const commandsPath = path.join(__dirname, '../commands');
const commandFolders = fs.readdirSync(commandsPath);

for (const folder of commandFolders) {
  const folderPath = path.join(commandsPath, folder);
  const stat = fs.statSync(folderPath);
  if (!stat.isDirectory()) continue;

  const commandFiles = fs.readdirSync(folderPath).filter(f => f.endsWith('.js'));
  for (const file of commandFiles) {
    const command = require(path.join(folderPath, file));
    if (command.data) {
      commands.push(command.data.toJSON());
      console.log(`Loaded command: ${command.data.name}`);
    }
  }
}

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log(`Registering ${commands.length} slash commands...`);

    if (process.env.DISCORD_GUILD_ID) {
      // Guild commands (instant update, for development)
      await rest.put(
        Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.DISCORD_GUILD_ID),
        { body: commands },
      );
      console.log(`Successfully registered ${commands.length} guild commands.`);
    } else {
      // Global commands (takes up to 1 hour to propagate)
      await rest.put(
        Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
        { body: commands },
      );
      console.log(`Successfully registered ${commands.length} global commands.`);
    }
  } catch (error) {
    console.error('Failed to register commands:', error);
    process.exit(1);
  }
})();
