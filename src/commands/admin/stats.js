const {
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const { isAdmin, denyPermission } = require('../../utils/permissions');
const { t, getLang } = require('../../services/i18n');
const { getGuild, getAllGuildIds } = require('../../database/models/guild');
const { getApiCallCount } = require('../../services/crypto-api');
const { getTriggeredCount } = require('../../services/alert-service');
const { getErrorCount } = require('../../services/scheduler');
const { getActiveCount: getActiveBotCount } = require('../../services/bot-manager');
const { buildStatsEmbed } = require('../../services/embed-builder');
const cacheService = require('../../services/cache-service');
const logger = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Afficher les statistiques du bot')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  /**
   * Execute the /stats command: collect and display bot statistics.
   */
  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return denyPermission(interaction);
    }

    const guildId = interaction.guildId;
    const config = getGuild(guildId);
    const lang = getLang(config);

    await interaction.deferReply({ ephemeral: true });

    try {
      // Uptime
      const uptime = formatUptime(global.botStartTime);

      // Server count
      const servers = interaction.client.guilds.cache.size;

      // Total cryptos tracked across all guilds
      const allGuildIds = getAllGuildIds();
      let totalCryptos = 0;
      for (const gId of allGuildIds) {
        const gc = getGuild(gId);
        totalCryptos += (gc.cryptos || []).length;
      }

      // API calls today
      const apiCalls = getApiCallCount();

      // Alerts triggered
      const alertsTriggered = getTriggeredCount();

      // Cache hit rate
      const cacheHitRate = cacheService.getHitRate();

      // RAM usage
      const heapUsed = process.memoryUsage().heapUsed;
      const memory = `${Math.round(heapUsed / 1024 / 1024)} MB`;

      // Errors in last 24h
      const errors = getErrorCount();

      // External bots active
      const externalBots = getActiveBotCount();

      const stats = {
        uptime,
        servers,
        cryptosTracked: totalCryptos,
        apiCalls,
        alertsTriggered,
        cacheHitRate,
        memory,
        errors,
        externalBots,
      };

      const embed = buildStatsEmbed(stats, config);

      logger.debug('Stats command executed', { guildId, stats });

      return interaction.editReply({ embeds: [embed] });
    } catch (err) {
      logger.error('Stats command failed', { guildId, error: err.message, stack: err.stack });
      return interaction.editReply({
        content: t('error.generic', lang),
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
