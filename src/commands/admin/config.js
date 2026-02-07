const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');
const { isAdmin, denyPermission } = require('../../utils/permissions');
const { t, getLang } = require('../../services/i18n');
const { getGuild, updateGuild, resetGuild } = require('../../database/models/guild');
const { isValidInterval, isValidThreshold } = require('../../utils/validators');
const { restartScheduler } = require('../../services/scheduler');
const channelManager = require('../../services/channel-manager');
const logger = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('Gestion de la configuration du bot')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
      sub
        .setName('interval')
        .setDescription("Modifier l'intervalle de mise a jour")
        .addIntegerOption(opt =>
          opt
            .setName('minutes')
            .setDescription('Intervalle en minutes (5-60)')
            .setRequired(true)
            .setMinValue(5)
            .setMaxValue(60),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('alert-threshold')
        .setDescription("Modifier le seuil d'alerte par defaut")
        .addNumberOption(opt =>
          opt
            .setName('percent')
            .setDescription('Seuil en pourcentage (0.1-100)')
            .setRequired(true),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('language')
        .setDescription('Changer la langue du bot')
        .addStringOption(opt =>
          opt
            .setName('lang')
            .setDescription('Langue')
            .setRequired(true)
            .addChoices(
              { name: 'Francais', value: 'fr' },
              { name: 'English', value: 'en' },
            ),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('category')
        .setDescription('Renommer la categorie des canaux crypto')
        .addStringOption(opt =>
          opt
            .setName('name')
            .setDescription('Nouveau nom de la categorie')
            .setRequired(true),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('reset')
        .setDescription('Reinitialiser toute la configuration'),
    ),

  /**
   * Execute the /config command with its subcommands.
   */
  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return denyPermission(interaction);
    }

    const guildId = interaction.guildId;
    const config = getGuild(guildId);
    const lang = getLang(config);
    const subcommand = interaction.options.getSubcommand();

    // --- /config interval ---
    if (subcommand === 'interval') {
      const minutes = interaction.options.getInteger('minutes');

      if (!isValidInterval(minutes)) {
        return interaction.reply({
          content: t('error.invalid_interval', lang),
          flags: MessageFlags.Ephemeral,
        });
      }

      updateGuild(guildId, { updateInterval: minutes * 60 * 1000 });
      restartScheduler(interaction.client);

      logger.info('Config interval updated', { guildId, minutes });

      return interaction.reply({
        content: t('config.interval_set', lang, { value: minutes }),
        flags: MessageFlags.Ephemeral,
      });
    }

    // --- /config alert-threshold ---
    if (subcommand === 'alert-threshold') {
      const percent = interaction.options.getNumber('percent');

      if (!isValidThreshold(percent)) {
        return interaction.reply({
          content: t('error.invalid_threshold', lang),
          flags: MessageFlags.Ephemeral,
        });
      }

      updateGuild(guildId, { alertThreshold: percent });

      logger.info('Config alert threshold updated', { guildId, percent });

      return interaction.reply({
        content: t('config.threshold_set', lang, { value: percent }),
        flags: MessageFlags.Ephemeral,
      });
    }

    // --- /config language ---
    if (subcommand === 'language') {
      const newLang = interaction.options.getString('lang');

      updateGuild(guildId, { language: newLang });

      // Use the NEW language for the confirmation message
      const confirmLang = newLang;
      const langLabel = newLang === 'fr' ? 'Francais' : 'English';

      logger.info('Config language updated', { guildId, language: newLang });

      return interaction.reply({
        content: t('config.language_set', confirmLang, { value: langLabel }),
        flags: MessageFlags.Ephemeral,
      });
    }

    // --- /config category ---
    if (subcommand === 'category') {
      const name = interaction.options.getString('name');

      // Rename the Discord category channel if it exists
      if (config.categoryId) {
        const category = interaction.guild.channels.cache.get(config.categoryId);
        if (category) {
          try {
            await category.setName(name);
          } catch (err) {
            logger.error('Failed to rename category', { guildId, error: err.message });
          }
        }
      }

      logger.info('Config category renamed', { guildId, name });

      return interaction.reply({
        content: t('config.category_renamed', lang, { value: name }),
        flags: MessageFlags.Ephemeral,
      });
    }

    // --- /config reset ---
    if (subcommand === 'reset') {
      const embed = new EmbedBuilder()
        .setTitle(t('config.reset_confirm', lang))
        .setColor(0xff0000)
        .setDescription(t('config.reset_confirm', lang));

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('config_reset_confirm')
          .setLabel(t('setup.confirm_btn', lang))
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('config_reset_cancel')
          .setLabel(t('setup.cancel_btn', lang))
          .setStyle(ButtonStyle.Secondary),
      );

      return interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
    }
  },

  /**
   * Handle button interactions for the config command (reset confirm/cancel).
   */
  async handleButton(interaction) {
    if (!isAdmin(interaction.member)) {
      return denyPermission(interaction);
    }

    const guildId = interaction.guildId;
    const config = getGuild(guildId);
    const lang = getLang(config);
    const customId = interaction.customId;

    if (customId === 'config_reset_confirm') {
      // Delete all crypto channels and the category
      try {
        for (const crypto of config.cryptos) {
          if (crypto.channelId) {
            await channelManager.deleteCryptoChannel(interaction.guild, crypto.channelId);
          }
        }

        // Delete alerts channel
        if (config.alertsChannelId) {
          const alertsCh = interaction.guild.channels.cache.get(config.alertsChannelId);
          if (alertsCh) {
            try { await alertsCh.delete('Config reset'); } catch { /* ignore */ }
          }
        }

        // Delete category
        if (config.categoryId) {
          const category = interaction.guild.channels.cache.get(config.categoryId);
          if (category) {
            try { await category.delete('Config reset'); } catch { /* ignore */ }
          }
        }
      } catch (err) {
        logger.error('Error cleaning up channels during reset', { guildId, error: err.message });
      }

      resetGuild(guildId);

      logger.info('Guild config reset', { guildId });

      const embed = new EmbedBuilder()
        .setTitle(t('config.reset_done', lang))
        .setColor(0x00ff41);

      return interaction.update({ embeds: [embed], components: [] });
    }

    if (customId === 'config_reset_cancel') {
      const embed = new EmbedBuilder()
        .setTitle(t('config.reset_cancelled', lang))
        .setColor(0x95a5a6);

      return interaction.update({ embeds: [embed], components: [] });
    }
  },
};
