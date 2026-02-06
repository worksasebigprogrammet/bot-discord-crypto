const {
  SlashCommandBuilder,
  EmbedBuilder,
} = require('discord.js');
const { isAdmin, denyPermission } = require('../../utils/permissions');
const { getConfig } = require('../../database/models/config');
const { getCryptos } = require('../../database/models/crypto');
const channelManager = require('../../services/channel-manager');
const { getApiCallCount } = require('../../services/crypto-api');
const cacheService = require('../../services/cache-service');
const { restartScheduler, getErrorCount } = require('../../services/scheduler');
const { buildStatsEmbed } = require('../../services/embed-builder');
const { getTriggeredCount } = require('../../services/alert-service');
const logger = require('../../utils/logger');
const fs = require('fs');
const path = require('path');

const data = new SlashCommandBuilder()
  .setName('admin')
  .setDescription('Statistiques et contrôles administrateur')
  .addSubcommand(sub =>
    sub
      .setName('stats')
      .setDescription('Afficher les statistiques du bot')
  )
  .addSubcommand(sub =>
    sub
      .setName('restart')
      .setDescription('Redémarrer le scheduler de mises à jour')
  )
  .addSubcommand(sub =>
    sub
      .setName('logs')
      .setDescription('Afficher les dernières entrées du journal')
      .addIntegerOption(opt =>
        opt
          .setName('lines')
          .setDescription('Nombre de lignes à afficher (défaut: 20)')
          .setRequired(false)
          .setMinValue(1)
          .setMaxValue(50)
      )
  );

async function execute(interaction) {
  if (!isAdmin(interaction.member)) {
    return denyPermission(interaction);
  }

  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case 'stats':
      return handleStats(interaction);
    case 'restart':
      return handleRestart(interaction);
    case 'logs':
      return handleLogs(interaction);
    default:
      return interaction.reply({ content: '❌ Sous-commande inconnue.', ephemeral: true });
  }
}

async function handleStats(interaction) {
  const config = getConfig();
  const cryptos = getCryptos();
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

  // Add additional fields for more detail
  const detailEmbed = new EmbedBuilder()
    .setTitle('🔧 Détails de la configuration')
    .setColor(0x3498db)
    .addFields(
      { name: '⏱️ Intervalle', value: `${Math.round(config.updateInterval / 60000)} min`, inline: true },
      { name: '🪙 Cryptos actives', value: `${cryptos.filter(c => c.enabled).length}/${cryptos.length}`, inline: true },
      { name: '🚨 Seuil d\'alerte', value: `${config.alertThreshold}%`, inline: true },
      { name: '💾 Cache', value: `${cacheService.getStats().size} entrées | ${cacheService.getHitRate()}% hit rate`, inline: true },
      { name: '🏠 Serveur', value: interaction.guild.name, inline: true },
      { name: '📊 Setup', value: config.setupComplete ? '✅ Complet' : '❌ Incomplet', inline: true },
    )
    .setTimestamp()
    .setFooter({ text: 'Crypto Tracker Bot • Admin Stats' });

  return interaction.reply({ embeds: [embed, detailEmbed], ephemeral: true });
}

async function handleRestart(interaction) {
  await interaction.deferReply({ ephemeral: true });

  try {
    restartScheduler(interaction.client);
    logger.info('Scheduler restarted by admin', { userId: interaction.user.id });

    const config = getConfig();
    const intervalMin = Math.round(config.updateInterval / 60000);

    const embed = new EmbedBuilder()
      .setTitle('✅ Scheduler redémarré')
      .setDescription(
        'Le scheduler de mises à jour a été redémarré avec succès.\n' +
        `Prochain update dans **${intervalMin} minutes**.`
      )
      .setColor(0x2ecc71)
      .setTimestamp()
      .setFooter({ text: 'Crypto Tracker Bot • Admin' });

    return interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logger.error('Failed to restart scheduler', { error: err.message });
    return interaction.editReply({
      content: `❌ Erreur lors du redémarrage : \`${err.message}\``,
    });
  }
}

async function handleLogs(interaction) {
  const lineCount = interaction.options.getInteger('lines') || 20;

  await interaction.deferReply({ ephemeral: true });

  try {
    const logsDir = path.join(__dirname, '../../../logs');
    const today = new Date().toISOString().split('T')[0];
    const logFile = path.join(logsDir, `combined-${today}.log`);

    let logContent = '';

    if (fs.existsSync(logFile)) {
      const fileContent = fs.readFileSync(logFile, 'utf-8');
      const lines = fileContent.trim().split('\n');
      const lastLines = lines.slice(-lineCount);

      // Format log entries for display
      logContent = lastLines.map(line => {
        try {
          const entry = JSON.parse(line);
          const time = entry.timestamp || '';
          const level = (entry.level || '').toUpperCase();
          const message = entry.message || '';
          return `\`${time}\` **${level}** ${message}`;
        } catch {
          // If not JSON, display raw line (truncated)
          return `\`${line.substring(0, 100)}\``;
        }
      }).join('\n');
    } else {
      logContent = '*Aucun fichier de log trouvé pour aujourd\'hui.*';
    }

    // Truncate if too long for embed (4096 char limit for description)
    if (logContent.length > 4000) {
      logContent = logContent.substring(logContent.length - 4000);
      const firstNewline = logContent.indexOf('\n');
      if (firstNewline > -1) {
        logContent = '...\n' + logContent.substring(firstNewline + 1);
      }
    }

    const embed = new EmbedBuilder()
      .setTitle(`📋 Derniers logs (${lineCount} lignes)`)
      .setDescription(logContent || '*Aucune entrée de log.*')
      .setColor(0x95a5a6)
      .setTimestamp()
      .setFooter({ text: `Crypto Tracker Bot • Logs du ${today}` });

    return interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logger.error('Failed to read logs', { error: err.message });
    return interaction.editReply({
      content: `❌ Erreur lors de la lecture des logs : \`${err.message}\``,
    });
  }
}

module.exports = { data, execute };
