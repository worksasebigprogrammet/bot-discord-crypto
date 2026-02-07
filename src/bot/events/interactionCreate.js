const logger = require('../../utils/logger');

module.exports = {
  name: 'interactionCreate',
  once: false,
  async execute(interaction) {
    // --- Autocomplete ---
    if (interaction.isAutocomplete()) {
      const command = interaction.client.commands.get(interaction.commandName);
      if (command && command.autocomplete) {
        try {
          await command.autocomplete(interaction);
        } catch (err) {
          logger.error('Autocomplete error', { command: interaction.commandName, error: err.message });
        }
      }
      return;
    }

    // --- Slash Commands ---
    if (interaction.isChatInputCommand()) {
      const command = interaction.client.commands.get(interaction.commandName);
      if (!command) return;

      try {
        await command.execute(interaction);
      } catch (err) {
        logger.error('Command execution error', {
          command: interaction.commandName,
          guildId: interaction.guildId,
          userId: interaction.user.id,
          error: err.message,
          stack: err.stack,
        });

        const msg = '❌ Une erreur est survenue. Réessayez plus tard.';
        try {
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ content: msg });
          } else {
            await interaction.reply({ content: msg, ephemeral: true });
          }
        } catch { /* ignore follow-up errors */ }
      }
      return;
    }

    // --- Buttons ---
    if (interaction.isButton()) {
      const customId = interaction.customId;
      // Find the command that handles this button
      for (const [, command] of interaction.client.commands) {
        if (command.handleButton && customId.startsWith(command.data.name)) {
          try {
            await command.handleButton(interaction);
          } catch (err) {
            logger.error('Button handler error', { customId, error: err.message });
            try {
              if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: '❌ Erreur.', ephemeral: true });
              }
            } catch { /* ignore */ }
          }
          return;
        }
      }
      return;
    }

    // --- Select Menus ---
    if (interaction.isStringSelectMenu()) {
      const customId = interaction.customId;
      for (const [, command] of interaction.client.commands) {
        if (command.handleSelect && customId.startsWith(command.data.name)) {
          try {
            await command.handleSelect(interaction);
          } catch (err) {
            logger.error('Select menu handler error', { customId, error: err.message });
            try {
              if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: '❌ Erreur.', ephemeral: true });
              }
            } catch { /* ignore */ }
          }
          return;
        }
      }
      return;
    }

    // --- Modals ---
    if (interaction.isModalSubmit()) {
      const customId = interaction.customId;
      for (const [, command] of interaction.client.commands) {
        if (command.handleModal && customId.startsWith(command.data.name)) {
          try {
            await command.handleModal(interaction);
          } catch (err) {
            logger.error('Modal handler error', { customId, error: err.message });
            try {
              if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: '❌ Erreur.', ephemeral: true });
              }
            } catch { /* ignore */ }
          }
          return;
        }
      }
      return;
    }
  },
};
