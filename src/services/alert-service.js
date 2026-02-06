const logger = require('../utils/logger');
const { getActiveAlerts, markTriggered } = require('../database/models/alert');
const { buildAlertEmbed } = require('./embed-builder');
const { getConfig } = require('../database/models/config');

let alertsTriggeredCount = 0;

/**
 * Check all active alerts against current quotes and fire if conditions met.
 * @param {import('discord.js').Client} client
 * @param {Object} quotes - Map of symbol -> quote data
 */
async function checkAlerts(client, quotes) {
  const alerts = getActiveAlerts();
  const config = getConfig();

  if (!config.alertsChannelId) return;

  const guild = client.guilds.cache.first();
  if (!guild) return;

  const alertsChannel = guild.channels.cache.get(config.alertsChannelId);
  if (!alertsChannel) return;

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
        markTriggered(alert.id);
        alertsTriggeredCount++;

        const embed = buildAlertEmbed(alert, quote);
        const mention = config.mentionHere ? '@here ' : '';
        await alertsChannel.send({
          content: `${mention}<@${alert.userId}>`,
          embeds: [embed],
        });

        logger.info('Alert triggered', { alertId: alert.id, symbol: alert.symbol, type: alert.type });
      } catch (err) {
        logger.error('Failed to send alert', { alertId: alert.id, error: err.message });
      }
    }
  }
}

function getTriggeredCount() {
  return alertsTriggeredCount;
}

module.exports = { checkAlerts, getTriggeredCount };
