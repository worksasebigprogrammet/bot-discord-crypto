const { Events } = require('discord.js');
const logger = require('../../utils/logger');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    // Handle slash commands
    if (interaction.isChatInputCommand()) {
      const command = interaction.client.commands.get(interaction.commandName);
      if (!command) {
        logger.warn('Unknown command', { name: interaction.commandName });
        return;
      }

      try {
        await command.execute(interaction);
      } catch (err) {
        logger.error('Command execution failed', {
          command: interaction.commandName,
          user: interaction.user.tag,
          error: err.message,
          stack: err.stack,
        });

        const errorMsg = '❌ Une erreur est survenue lors de l\'exécution de cette commande.';
        try {
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ content: errorMsg });
          } else {
            await interaction.reply({ content: errorMsg, ephemeral: true });
          }
        } catch {
          // Interaction may have expired
        }
      }
    }

    // Handle button interactions
    if (interaction.isButton()) {
      try {
        const [action, ...args] = interaction.customId.split('_');
        
        // Panel button handlers
        if (action === 'panel') {
          const panelCommand = interaction.client.commands.get('panel');
          if (panelCommand && panelCommand.handleButton) {
            await panelCommand.handleButton(interaction, args);
          }
        }

        // Setup button handlers
        if (action === 'setup') {
          const setupCommand = interaction.client.commands.get('setup');
          if (setupCommand && setupCommand.handleButton) {
            await setupCommand.handleButton(interaction, args);
          }
        }
      } catch (err) {
        logger.error('Button interaction failed', { customId: interaction.customId, error: err.message });
        try {
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: '❌ Erreur lors du traitement.', ephemeral: true });
          }
        } catch {}
      }
    }

    // Handle select menu interactions
    if (interaction.isStringSelectMenu()) {
      try {
        const [action, ...args] = interaction.customId.split('_');
        
        if (action === 'setup') {
          const setupCommand = interaction.client.commands.get('setup');
          if (setupCommand && setupCommand.handleSelect) {
            await setupCommand.handleSelect(interaction, args);
          }
        }
      } catch (err) {
        logger.error('Select menu interaction failed', { customId: interaction.customId, error: err.message });
      }
    }

    // Handle modal submissions
    if (interaction.isModalSubmit()) {
      try {
        const [action, ...args] = interaction.customId.split('_');
        
        if (action === 'panel') {
          const panelCommand = interaction.client.commands.get('panel');
          if (panelCommand && panelCommand.handleModal) {
            await panelCommand.handleModal(interaction, args);
          }
        }
      } catch (err) {
        logger.error('Modal submission failed', { customId: interaction.customId, error: err.message });
      }
    }
  },
};
