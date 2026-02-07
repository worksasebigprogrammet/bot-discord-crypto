const logger = require('../utils/logger');
const { getAllGuildIds, getGuild, getActiveAlertsInGuild, markAlertTriggered } = require('../database/models/guild');
const { buildAlertEmbed } = require('./embed-builder');

let alertsTriggeredCount = 0;

/**
 * Check all active alerts across all guilds and fire those whose conditions are met.
 * @param {import('discord.js').Client} client
 * @param {Object} quotes - Map of symbol -> quote data
 */
async function checkAlerts(client, quotes) {
  const guildIds = getAllGuildIds();

  for (const guildId of guildIds) {
    const config = getGuild(guildId);
    if (!config.setupComplete || !config.alertsChannelId) continue;

    const guild = client.guilds.cache.get(guildId);
    if (!guild) continue;

    const alertsChannel = guild.channels.cache.get(config.alertsChannelId);
    if (!alertsChannel) continue;

    const alerts = getActiveAlertsInGuild(guildId);

    for (const alert of alerts) {
      const quote = quotes[alert.symbol];
      if (!quote) continue;

      let triggered = false;

      switch (alert.type) {
        case 'above':
          if (quote.price >= alert.value) triggered = true;
          break;
        case 'below':
          if (quote.price <= alert.value) triggered = true;
          break;
        case 'change':
          if (alert.value > 0 && quote.change24h >= alert.value) triggered = true;
          if (alert.value < 0 && quote.change24h <= alert.value) triggered = true;
          break;
      }

      if (triggered) {
        try {
          markAlertTriggered(guildId, alert.id);
          alertsTriggeredCount++;

          const embed = buildAlertEmbed(alert, quote, config);
          const mention = config.mentionHere ? '@here ' : '';
          await alertsChannel.send({
            content: `${mention}<@${alert.userId}>`,
            embeds: [embed],
          });

          logger.info('Alert triggered', {
            guildId,
            alertId: alert.id,
            symbol: alert.symbol,
            type: alert.type,
            userId: alert.userId,
          });
        } catch (err) {
          logger.error('Failed to send alert notification', {
            guildId,
            alertId: alert.id,
            error: err.message,
          });
        }
      }
    }
  }
}

function getTriggeredCount() {
  return alertsTriggeredCount;
}

module.exports = { checkAlerts, getTriggeredCount };
