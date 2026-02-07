const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');
const { isAdmin, denyPermission } = require('../../utils/permissions');
const { t, getLang } = require('../../services/i18n');
const { getGuild, updateGuild, resetGuild, addCryptoToGuild, removeCryptoFromGuild, getCryptoInGuild, getGuildCryptos, updateCryptoInGuild } = require('../../database/models/guild');
const channelManager = require('../../services/channel-manager');
const { fetchQuotes, getApiCallCount } = require('../../services/crypto-api');
const { buildPriceEmbed, buildStatsEmbed } = require('../../services/embed-builder');
const { isValidSymbol, isValidInterval } = require('../../utils/validators');
const { restartScheduler, forceUpdate, getErrorCount } = require('../../services/scheduler');
const { getTriggeredCount } = require('../../services/alert-service');
const cacheService = require('../../services/cache-service');
const { getGuildBots } = require('../../database/models/bot');
const { getActiveCount: getActiveBotCount } = require('../../services/bot-manager');
const logger = require('../../utils/logger');

/**
 * Build the main panel embed showing current guild configuration.
 */
function buildPanelEmbed(guildConfig, guild) {
  const lang = getLang(guildConfig);
  const cryptos = guildConfig.cryptos || [];
  const intervalMin = Math.round((guildConfig.updateInterval || 600000) / 60000);

  const cryptoList = cryptos.length > 0
    ? cryptos.map(c => `${c.enabled ? '🟢' : '🔴'} **${c.symbol}**`).join(', ')
    : t('list.empty', lang);

  return new EmbedBuilder()
    .setTitle(t('panel.title', lang))
    .setColor(0x9b59b6)
    .addFields(
      { name: '🌐 ' + (lang === 'fr' ? 'Serveur' : 'Server'), value: guild.name, inline: true },
      { name: t('setup.interval_label', lang), value: `${intervalMin} min`, inline: true },
      { name: t('setup.threshold_label', lang), value: `${guildConfig.alertThreshold || 5}%`, inline: true },
      { name: t('setup.cryptos_label', lang), value: cryptoList, inline: false },
    )
    .setTimestamp()
    .setFooter({ text: 'Crypto Tracker Bot' });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('panel')
    .setDescription("Panel d'administration interactif")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  /**
   * Execute the /panel command: display the admin control panel.
   */
  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return denyPermission(interaction);
    }

    const guildId = interaction.guildId;
    const config = getGuild(guildId);
    const lang = getLang(config);

    const embed = buildPanelEmbed(config, interaction.guild);

    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('panel_add')
        .setLabel(t('panel.add_crypto', lang))
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('panel_remove')
        .setLabel(t('panel.remove_crypto', lang))
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('panel_interval')
        .setLabel(t('panel.config_interval', lang))
        .setStyle(ButtonStyle.Primary),
    );

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('panel_stats')
        .setLabel(t('panel.view_stats', lang))
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('panel_update')
        .setLabel(t('panel.force_update', lang))
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('panel_language')
        .setLabel(t('panel.set_language', lang))
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('panel_reset')
        .setLabel(t('panel.reset_config', lang))
        .setStyle(ButtonStyle.Danger),
    );

    await interaction.reply({
      embeds: [embed],
      components: [row1, row2],
      flags: MessageFlags.Ephemeral,
    });
  },

  /**
   * Handle button interactions for the admin panel.
   */
  async handleButton(interaction) {
    if (!isAdmin(interaction.member)) {
      return denyPermission(interaction);
    }

    const guildId = interaction.guildId;
    const config = getGuild(guildId);
    const lang = getLang(config);
    const customId = interaction.customId;

    // --- Add Crypto: show modal ---
    if (customId === 'panel_add') {
      const modal = new ModalBuilder()
        .setCustomId('panel_modal_add')
        .setTitle(t('panel.add_crypto', lang));

      const symbolInput = new TextInputBuilder()
        .setCustomId('panel_add_symbol')
        .setLabel('Symbol (ex: BTC, ETH, SOL)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('BTC')
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(10);

      modal.addComponents(new ActionRowBuilder().addComponents(symbolInput));
      return interaction.showModal(modal);
    }

    // --- Remove Crypto: show modal ---
    if (customId === 'panel_remove') {
      const modal = new ModalBuilder()
        .setCustomId('panel_modal_remove')
        .setTitle(t('panel.remove_crypto', lang));

      const symbolInput = new TextInputBuilder()
        .setCustomId('panel_remove_symbol')
        .setLabel('Symbol (ex: BTC, ETH, SOL)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('BTC')
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(10);

      modal.addComponents(new ActionRowBuilder().addComponents(symbolInput));
      return interaction.showModal(modal);
    }

    // --- Interval: show modal ---
    if (customId === 'panel_interval') {
      const modal = new ModalBuilder()
        .setCustomId('panel_modal_interval')
        .setTitle(t('panel.config_interval', lang));

      const intervalInput = new TextInputBuilder()
        .setCustomId('panel_interval_value')
        .setLabel('Interval (5-60 minutes)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('10')
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(2);

      modal.addComponents(new ActionRowBuilder().addComponents(intervalInput));
      return interaction.showModal(modal);
    }

    // --- Stats ---
    if (customId === 'panel_stats') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const uptime = formatUptime(global.botStartTime);
      const servers = interaction.client.guilds.cache.size;
      const { getAllGuildIds } = require('../../database/models/guild');
      const allGuildIds = getAllGuildIds();
      let totalCryptos = 0;
      for (const gId of allGuildIds) {
        const gc = getGuild(gId);
        totalCryptos += (gc.cryptos || []).length;
      }

      const stats = {
        uptime,
        servers,
        cryptosTracked: totalCryptos,
        apiCalls: getApiCallCount(),
        alertsTriggered: getTriggeredCount(),
        cacheHitRate: cacheService.getHitRate(),
        memory: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`,
        errors: getErrorCount(),
        externalBots: getActiveBotCount(),
      };

      const statsEmbed = buildStatsEmbed(stats, config);
      return interaction.editReply({ embeds: [statsEmbed] });
    }

    // --- Force Update ---
    if (customId === 'panel_update') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      try {
        const start = Date.now();
        await forceUpdate(interaction.client);
        const duration = Date.now() - start;

        return interaction.editReply({
          content: t('reload.success', lang, { duration }),
        });
      } catch (err) {
        logger.error('Panel force update failed', { guildId, error: err.message });
        return interaction.editReply({
          content: t('reload.fail', lang),
        });
      }
    }

    // --- Language toggle ---
    if (customId === 'panel_language') {
      const newLang = config.language === 'fr' ? 'en' : 'fr';
      updateGuild(guildId, { language: newLang });

      const langLabel = newLang === 'fr' ? 'Francais' : 'English';

      logger.info('Panel language toggled', { guildId, language: newLang });

      // Rebuild the panel with the new language
      const updatedConfig = getGuild(guildId);
      const updatedLang = getLang(updatedConfig);
      const embed = buildPanelEmbed(updatedConfig, interaction.guild);

      const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('panel_add')
          .setLabel(t('panel.add_crypto', updatedLang))
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('panel_remove')
          .setLabel(t('panel.remove_crypto', updatedLang))
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('panel_interval')
          .setLabel(t('panel.config_interval', updatedLang))
          .setStyle(ButtonStyle.Primary),
      );

      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('panel_stats')
          .setLabel(t('panel.view_stats', updatedLang))
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('panel_update')
          .setLabel(t('panel.force_update', updatedLang))
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('panel_language')
          .setLabel(t('panel.set_language', updatedLang))
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('panel_reset')
          .setLabel(t('panel.reset_config', updatedLang))
          .setStyle(ButtonStyle.Danger),
      );

      return interaction.update({
        content: t('config.language_set', updatedLang, { value: langLabel }),
        embeds: [embed],
        components: [row1, row2],
      });
    }

    // --- Reset ---
    if (customId === 'panel_reset') {
      // Clean up channels
      try {
        for (const crypto of config.cryptos) {
          if (crypto.channelId) {
            await channelManager.deleteCryptoChannel(interaction.guild, crypto.channelId);
          }
        }
        if (config.alertsChannelId) {
          const alertsCh = interaction.guild.channels.cache.get(config.alertsChannelId);
          if (alertsCh) {
            try { await alertsCh.delete('Panel reset'); } catch { /* ignore */ }
          }
        }
        if (config.categoryId) {
          const category = interaction.guild.channels.cache.get(config.categoryId);
          if (category) {
            try { await category.delete('Panel reset'); } catch { /* ignore */ }
          }
        }
      } catch (err) {
        logger.error('Error cleaning up channels during panel reset', { guildId, error: err.message });
      }

      resetGuild(guildId);
      logger.info('Guild config reset via panel', { guildId });

      const embed = new EmbedBuilder()
        .setTitle(t('config.reset_done', lang))
        .setColor(0x00ff41);

      return interaction.update({ embeds: [embed], components: [] });
    }
  },

  /**
   * Handle modal submissions for the admin panel.
   */
  async handleModal(interaction) {
    if (!isAdmin(interaction.member)) {
      return denyPermission(interaction);
    }

    const guildId = interaction.guildId;
    const config = getGuild(guildId);
    const lang = getLang(config);
    const customId = interaction.customId;

    // --- Modal: Add Crypto ---
    if (customId === 'panel_modal_add') {
      const symbol = interaction.fields.getTextInputValue('panel_add_symbol').toUpperCase().trim();

      if (!isValidSymbol(symbol)) {
        return interaction.reply({
          content: t('track.invalid_symbol', lang, { symbol }),
          flags: MessageFlags.Ephemeral,
        });
      }

      if (getCryptoInGuild(guildId, symbol)) {
        return interaction.reply({
          content: t('track.already_tracked', lang, { symbol }),
          flags: MessageFlags.Ephemeral,
        });
      }

      if (!config.setupComplete) {
        return interaction.reply({
          content: t('track.setup_required', lang),
          flags: MessageFlags.Ephemeral,
        });
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      try {
        const quotes = await fetchQuotes([symbol]);
        const quote = quotes[symbol];

        if (!quote) {
          return interaction.editReply({
            content: t('track.not_found', lang, { symbol }),
          });
        }

        const entry = addCryptoToGuild(guildId, symbol, quote.name || symbol);
        if (!entry) {
          return interaction.editReply({
            content: t('track.already_tracked', lang, { symbol }),
          });
        }

        const category = await channelManager.ensureCategory(interaction.guild);
        const channel = await channelManager.createCryptoChannel(interaction.guild, category, symbol);
        updateCryptoInGuild(guildId, symbol, { channelId: channel.id });

        const updatedConfig = getGuild(guildId);
        const embed = buildPriceEmbed(quote, updatedConfig);
        const msg = await channel.send({ embeds: [embed] });
        updateCryptoInGuild(guildId, symbol, { messageId: msg.id });

        logger.info('Crypto tracked via panel', { guildId, symbol });

        return interaction.editReply({
          content: t('track.added', lang, { symbol, channel: `<#${channel.id}>` }),
        });
      } catch (err) {
        logger.error('Panel add crypto failed', { guildId, symbol, error: err.message });
        return interaction.editReply({
          content: t('error.api_fail', lang),
        });
      }
    }

    // --- Modal: Remove Crypto ---
    if (customId === 'panel_modal_remove') {
      const symbol = interaction.fields.getTextInputValue('panel_remove_symbol').toUpperCase().trim();

      if (!isValidSymbol(symbol)) {
        return interaction.reply({
          content: t('track.invalid_symbol', lang, { symbol }),
          flags: MessageFlags.Ephemeral,
        });
      }

      const cryptoEntry = getCryptoInGuild(guildId, symbol);
      if (!cryptoEntry) {
        return interaction.reply({
          content: t('untrack.not_tracked', lang, { symbol }),
          flags: MessageFlags.Ephemeral,
        });
      }

      // Delete channel
      if (cryptoEntry.channelId) {
        try {
          await channelManager.deleteCryptoChannel(interaction.guild, cryptoEntry.channelId);
        } catch (err) {
          logger.error('Failed to delete channel via panel remove', { guildId, symbol, error: err.message });
        }
      }

      removeCryptoFromGuild(guildId, symbol);
      logger.info('Crypto untracked via panel', { guildId, symbol });

      return interaction.reply({
        content: t('untrack.removed', lang, { symbol }),
        flags: MessageFlags.Ephemeral,
      });
    }

    // --- Modal: Change Interval ---
    if (customId === 'panel_modal_interval') {
      const raw = interaction.fields.getTextInputValue('panel_interval_value').trim();
      const minutes = parseInt(raw, 10);

      if (!isValidInterval(minutes)) {
        return interaction.reply({
          content: t('error.invalid_interval', lang),
          flags: MessageFlags.Ephemeral,
        });
      }

      updateGuild(guildId, { updateInterval: minutes * 60 * 1000 });
      restartScheduler(interaction.client);

      logger.info('Interval updated via panel', { guildId, minutes });

      return interaction.reply({
        content: t('config.interval_set', lang, { value: minutes }),
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};

/**
 * Format uptime from a start timestamp to "Xd Xh Xm".
 * @param {number} startTime - Timestamp in ms
 * @returns {string}
 */
function formatUptime(startTime) {
  if (!startTime) return '0d 0h 0m';
  const diff = Date.now() - startTime;
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  return `${days}d ${hours}h ${minutes}m`;
}
