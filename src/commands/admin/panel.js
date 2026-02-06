const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const { isAdmin, denyPermission } = require('../../utils/permissions');
const { getConfig, setConfig, resetConfig } = require('../../database/models/config');
const { addCrypto, removeCrypto, getCryptos, getCrypto } = require('../../database/models/crypto');
const channelManager = require('../../services/channel-manager');
const { fetchQuotes, getApiCallCount } = require('../../services/crypto-api');
const cacheService = require('../../services/cache-service');
const { restartScheduler, forceUpdate, getErrorCount } = require('../../services/scheduler');
const { buildPriceEmbed, buildStatsEmbed } = require('../../services/embed-builder');
const { isValidSymbol, isValidInterval } = require('../../utils/validators');
const { getTriggeredCount } = require('../../services/alert-service');
const logger = require('../../utils/logger');

const data = new SlashCommandBuilder()
  .setName('panel')
  .setDescription('Panneau de contrôle administrateur');

async function execute(interaction) {
  if (!isAdmin(interaction.member)) {
    return denyPermission(interaction);
  }

  const config = getConfig();
  const cryptos = getCryptos();
  const intervalMin = Math.round(config.updateInterval / 60000);

  const embed = new EmbedBuilder()
    .setTitle('🎛️ Panneau d\'Administration')
    .setDescription('Utilisez les boutons ci-dessous pour gérer le bot.')
    .setColor(0x9b59b6)
    .addFields(
      { name: '⏱️ Intervalle', value: `${intervalMin} min`, inline: true },
      { name: '🪙 Cryptos suivies', value: `${cryptos.length}`, inline: true },
      { name: '🚨 Seuil d\'alerte', value: `${config.alertThreshold}%`, inline: true },
      { name: '📡 Appels API (24h)', value: `${getApiCallCount()}`, inline: true },
      { name: '❌ Erreurs (24h)', value: `${getErrorCount()}`, inline: true },
      { name: '📊 Setup', value: config.setupComplete ? '✅ Complet' : '❌ Incomplet', inline: true },
    )
    .setTimestamp()
    .setFooter({ text: 'Crypto Tracker Bot • Admin Panel' });

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('panel_add_crypto')
      .setLabel('Ajouter Crypto')
      .setStyle(ButtonStyle.Success)
      .setEmoji('➕'),
    new ButtonBuilder()
      .setCustomId('panel_remove_crypto')
      .setLabel('Retirer Crypto')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('➖'),
    new ButtonBuilder()
      .setCustomId('panel_set_interval')
      .setLabel('Configurer Intervalle')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('⏱️'),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('panel_view_stats')
      .setLabel('Voir Stats')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('📊'),
    new ButtonBuilder()
      .setCustomId('panel_force_update')
      .setLabel('Forcer Update')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🔄'),
    new ButtonBuilder()
      .setCustomId('panel_reset_config')
      .setLabel('Réinitialiser Config')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🗑️'),
  );

  return interaction.reply({ embeds: [embed], components: [row1, row2], ephemeral: true });
}

async function handleButton(interaction) {
  if (!isAdmin(interaction.member)) {
    return interaction.reply({ content: '❌ Permission refusée.', ephemeral: true });
  }

  const customId = interaction.customId;

  switch (customId) {
    case 'panel_add_crypto':
      return showAddCryptoModal(interaction);

    case 'panel_remove_crypto':
      return showRemoveCryptoModal(interaction);

    case 'panel_set_interval':
      return showIntervalModal(interaction);

    case 'panel_view_stats':
      return showStats(interaction);

    case 'panel_force_update':
      return handleForceUpdate(interaction);

    case 'panel_reset_config':
      return handleResetConfig(interaction);

    default:
      return interaction.reply({ content: '❌ Action inconnue.', ephemeral: true });
  }
}

async function showAddCryptoModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('panel_modal_add_crypto')
    .setTitle('Ajouter une crypto');

  const symbolInput = new TextInputBuilder()
    .setCustomId('crypto_symbol')
    .setLabel('Symbole de la crypto (ex: BTC, ETH, DOGE)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('BTC')
    .setRequired(true)
    .setMinLength(1)
    .setMaxLength(10);

  const row = new ActionRowBuilder().addComponents(symbolInput);
  modal.addComponents(row);

  return interaction.showModal(modal);
}

async function showRemoveCryptoModal(interaction) {
  const cryptos = getCryptos();

  if (cryptos.length === 0) {
    return interaction.reply({
      content: '⚠️ Aucune crypto n\'est actuellement suivie.',
      ephemeral: true,
    });
  }

  const modal = new ModalBuilder()
    .setCustomId('panel_modal_remove_crypto')
    .setTitle('Retirer une crypto');

  const symbolInput = new TextInputBuilder()
    .setCustomId('crypto_symbol')
    .setLabel(`Symbole à retirer (${cryptos.map(c => c.symbol).join(', ')})`)
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('BTC')
    .setRequired(true)
    .setMinLength(1)
    .setMaxLength(10);

  const row = new ActionRowBuilder().addComponents(symbolInput);
  modal.addComponents(row);

  return interaction.showModal(modal);
}

async function showIntervalModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('panel_modal_interval')
    .setTitle('Configurer l\'intervalle');

  const intervalInput = new TextInputBuilder()
    .setCustomId('interval_minutes')
    .setLabel('Intervalle en minutes (5-60)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('10')
    .setRequired(true)
    .setMinLength(1)
    .setMaxLength(2);

  const row = new ActionRowBuilder().addComponents(intervalInput);
  modal.addComponents(row);

  return interaction.showModal(modal);
}

async function showStats(interaction) {
  const config = getConfig();
  const uptimeMs = interaction.client.uptime || 0;
  const hours = Math.floor(uptimeMs / 3600000);
  const minutes = Math.floor((uptimeMs % 3600000) / 60000);
  const seconds = Math.floor((uptimeMs % 60000) / 1000);

  const stats = {
    uptime: `${hours}h ${minutes}m ${seconds}s`,
    updates: channelManager.getUpdateCount(),
    apiCalls: getApiCallCount(),
    alertsTriggered: getTriggeredCount(),
    cacheHitRate: cacheService.getHitRate(),
    errors: getErrorCount(),
  };

  const embed = buildStatsEmbed(stats);

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleForceUpdate(interaction) {
  await interaction.deferReply({ ephemeral: true });

  try {
    await forceUpdate(interaction.client);

    const embed = new EmbedBuilder()
      .setTitle('✅ Mise à jour forcée')
      .setDescription('Les prix ont été mis à jour avec succès.')
      .setColor(0x2ecc71)
      .setTimestamp()
      .setFooter({ text: 'Crypto Tracker Bot • Admin Panel' });

    return interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logger.error('Force update from panel failed', { error: err.message });
    return interaction.editReply({
      content: `❌ Erreur lors de la mise à jour : \`${err.message}\``,
    });
  }
}

async function handleResetConfig(interaction) {
  resetConfig();
  logger.info('Config reset from panel', { userId: interaction.user.id });

  const embed = new EmbedBuilder()
    .setTitle('✅ Configuration réinitialisée')
    .setDescription(
      'Tous les paramètres ont été remis à zéro.\n' +
      'Utilisez `/setup` pour reconfigurer le bot.'
    )
    .setColor(0xe74c3c)
    .setTimestamp()
    .setFooter({ text: 'Crypto Tracker Bot • Admin Panel' });

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleModal(interaction) {
  if (!isAdmin(interaction.member)) {
    return interaction.reply({ content: '❌ Permission refusée.', ephemeral: true });
  }

  const customId = interaction.customId;

  switch (customId) {
    case 'panel_modal_add_crypto':
      return handleAddCryptoModal(interaction);
    case 'panel_modal_remove_crypto':
      return handleRemoveCryptoModal(interaction);
    case 'panel_modal_interval':
      return handleIntervalModal(interaction);
    default:
      return interaction.reply({ content: '❌ Action inconnue.', ephemeral: true });
  }
}

async function handleAddCryptoModal(interaction) {
  const rawSymbol = interaction.fields.getTextInputValue('crypto_symbol');
  const symbol = rawSymbol.toUpperCase().trim();

  if (!isValidSymbol(symbol)) {
    return interaction.reply({
      content: `❌ Symbole invalide : \`${rawSymbol}\`.`,
      ephemeral: true,
    });
  }

  const existing = getCrypto(symbol);
  if (existing) {
    return interaction.reply({
      content: `⚠️ **${symbol}** est déjà suivi.`,
      ephemeral: true,
    });
  }

  const config = getConfig();
  if (!config.categoryId) {
    return interaction.reply({
      content: '❌ Le bot n\'est pas configuré. Lancez `/setup` d\'abord.',
      ephemeral: true,
    });
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const crypto = addCrypto(symbol, symbol);
    if (!crypto) {
      return interaction.editReply({ content: `❌ Impossible d'ajouter **${symbol}**.` });
    }

    const guild = interaction.guild;
    const category = guild.channels.cache.get(config.categoryId);

    if (!category) {
      return interaction.editReply({ content: '❌ Catégorie introuvable.' });
    }

    const channel = await channelManager.createCryptoChannel(guild, category, symbol);

    // Fetch initial quote
    try {
      const quotes = await fetchQuotes([symbol]);
      if (quotes[symbol]) {
        const embed = buildPriceEmbed(quotes[symbol]);
        const msg = await channel.send({ embeds: [embed] });
        const { updateCrypto } = require('../../database/models/crypto');
        updateCrypto(symbol, { messageId: msg.id });
      }
    } catch (err) {
      logger.warn('Failed to fetch initial quote from panel', { symbol, error: err.message });
    }

    logger.info('Crypto added from panel', { symbol, userId: interaction.user.id });

    const embed = new EmbedBuilder()
      .setTitle('✅ Crypto ajoutée')
      .setDescription(`**${symbol}** est maintenant suivi dans <#${channel.id}>.`)
      .setColor(0x2ecc71)
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logger.error('Failed to add crypto from panel', { symbol, error: err.message });
    return interaction.editReply({ content: `❌ Erreur : \`${err.message}\`` });
  }
}

async function handleRemoveCryptoModal(interaction) {
  const rawSymbol = interaction.fields.getTextInputValue('crypto_symbol');
  const symbol = rawSymbol.toUpperCase().trim();

  if (!isValidSymbol(symbol)) {
    return interaction.reply({
      content: `❌ Symbole invalide : \`${rawSymbol}\`.`,
      ephemeral: true,
    });
  }

  const existing = getCrypto(symbol);
  if (!existing) {
    return interaction.reply({
      content: `⚠️ **${symbol}** n'est pas suivi.`,
      ephemeral: true,
    });
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    if (existing.channelId) {
      await channelManager.deleteCryptoChannel(interaction.guild, existing.channelId);
    }

    removeCrypto(symbol);
    logger.info('Crypto removed from panel', { symbol, userId: interaction.user.id });

    const embed = new EmbedBuilder()
      .setTitle('✅ Crypto retirée')
      .setDescription(`**${symbol}** a été retiré du suivi.`)
      .setColor(0xe74c3c)
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logger.error('Failed to remove crypto from panel', { symbol, error: err.message });
    return interaction.editReply({ content: `❌ Erreur : \`${err.message}\`` });
  }
}

async function handleIntervalModal(interaction) {
  const rawMinutes = interaction.fields.getTextInputValue('interval_minutes');
  const minutes = parseInt(rawMinutes, 10);

  if (!isValidInterval(minutes)) {
    return interaction.reply({
      content: '❌ L\'intervalle doit être un nombre entier entre 5 et 60.',
      ephemeral: true,
    });
  }

  setConfig({ updateInterval: minutes * 60 * 1000 });
  restartScheduler(interaction.client);

  logger.info('Interval updated from panel', { minutes, userId: interaction.user.id });

  const embed = new EmbedBuilder()
    .setTitle('✅ Intervalle mis à jour')
    .setDescription(`L'intervalle a été défini à **${minutes} minutes**.\nLe scheduler a été redémarré.`)
    .setColor(0x2ecc71)
    .setTimestamp();

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

module.exports = { data, execute, handleButton, handleModal };
