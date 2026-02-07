const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { t, getLang } = require('../../services/i18n');
const { getGuild, addAlertToGuild, removeAlertFromGuild, getUserAlertsInGuild, clearUserAlertsInGuild } = require('../../database/models/guild');
const { formatPrice, formatPercent } = require('../../utils/formatter');
const { isValidSymbol, isValidPrice } = require('../../utils/validators');
const logger = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('alert')
    .setDescription('Manage your price alerts')
    .addSubcommand(sub =>
      sub
        .setName('set')
        .setDescription('Create a new price alert')
        .addStringOption(opt =>
          opt.setName('symbol')
            .setDescription('Crypto symbol (e.g. BTC, ETH)')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('type')
            .setDescription('Alert type')
            .setRequired(true)
            .addChoices(
              { name: 'Above', value: 'above' },
              { name: 'Below', value: 'below' },
              { name: 'Change %', value: 'change' },
            )
        )
        .addNumberOption(opt =>
          opt.setName('value')
            .setDescription('Target value (price for above/below, percentage for change)')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('list')
        .setDescription('List your active alerts')
    )
    .addSubcommand(sub =>
      sub
        .setName('remove')
        .setDescription('Remove an alert by ID')
        .addIntegerOption(opt =>
          opt.setName('id')
            .setDescription('Alert ID to remove')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('clear')
        .setDescription('Clear all your alerts')
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    const guildConfig = getGuild(guildId);
    const lang = getLang(guildConfig);

    try {
      switch (subcommand) {
        case 'set':
          await handleSet(interaction, guildId, userId, lang);
          break;
        case 'list':
          await handleList(interaction, guildId, userId, lang, guildConfig);
          break;
        case 'remove':
          await handleRemove(interaction, guildId, userId, lang);
          break;
        case 'clear':
          await handleClear(interaction, guildId, userId, lang);
          break;
      }
    } catch (err) {
      logger.error('Error in /alert command', { subcommand, guildId, userId, error: err.message });
      const content = t('error.generic', lang);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content });
      } else {
        await interaction.reply({ content, flags: MessageFlags.Ephemeral });
      }
    }
  },
};

/**
 * Handle /alert set
 */
async function handleSet(interaction, guildId, userId, lang) {
  const symbol = interaction.options.getString('symbol').toUpperCase().trim();
  const type = interaction.options.getString('type');
  const value = interaction.options.getNumber('value');

  // Validate symbol
  if (!isValidSymbol(symbol)) {
    return interaction.reply({
      content: t('track.invalid_symbol', lang, { symbol }),
      flags: MessageFlags.Ephemeral,
    });
  }

  // Validate value: price must be > 0 for above/below
  if ((type === 'above' || type === 'below') && !isValidPrice(value)) {
    return interaction.reply({
      content: t('error.invalid_threshold', lang),
      flags: MessageFlags.Ephemeral,
    });
  }

  // Add alert to guild
  const alert = addAlertToGuild(guildId, userId, symbol, type, value);

  if (!alert) {
    return interaction.reply({
      content: t('alert.max_reached', lang),
      flags: MessageFlags.Ephemeral,
    });
  }

  // Build type label for the confirmation message
  const typeLabel = t(`alert.type_${type}`, lang);

  // Format value depending on type
  const formattedValue = type === 'change'
    ? formatPercent(value)
    : formatPrice(value);

  return interaction.reply({
    content: t('alert.set', lang, { symbol, type: typeLabel, value: formattedValue }),
    flags: MessageFlags.Ephemeral,
  });
}

/**
 * Handle /alert list
 */
async function handleList(interaction, guildId, userId, lang, guildConfig) {
  const alerts = getUserAlertsInGuild(guildId, userId);

  if (!alerts || alerts.length === 0) {
    return interaction.reply({
      content: t('alert.list_empty', lang),
      flags: MessageFlags.Ephemeral,
    });
  }

  const embed = new EmbedBuilder()
    .setTitle(t('alert.list_title', lang))
    .setColor(guildConfig.embedColorNeutral || '#95a5a6')
    .setTimestamp();

  const lines = alerts.map(a => {
    const typeLabel = t(`alert.type_${a.type}`, lang);
    const formattedValue = a.type === 'change'
      ? formatPercent(a.value)
      : formatPrice(a.value);
    return `**#${a.id}** — \`${a.symbol}\` ${typeLabel} ${formattedValue}`;
  });

  embed.setDescription(lines.join('\n'));

  return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

/**
 * Handle /alert remove
 */
async function handleRemove(interaction, guildId, userId, lang) {
  const alertId = interaction.options.getInteger('id');

  const removed = removeAlertFromGuild(guildId, alertId, userId);

  if (!removed) {
    return interaction.reply({
      content: t('alert.not_found', lang, { id: alertId }),
      flags: MessageFlags.Ephemeral,
    });
  }

  return interaction.reply({
    content: t('alert.removed', lang, { id: alertId }),
    flags: MessageFlags.Ephemeral,
  });
}

/**
 * Handle /alert clear
 */
async function handleClear(interaction, guildId, userId, lang) {
  const count = clearUserAlertsInGuild(guildId, userId);

  return interaction.reply({
    content: t('alert.cleared', lang, { count }),
    flags: MessageFlags.Ephemeral,
  });
}
