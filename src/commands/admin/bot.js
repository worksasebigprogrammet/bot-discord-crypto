const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ActivityType } = require('discord.js');
const { isAdmin, denyPermission } = require('../../utils/permissions');
const { t, getLang } = require('../../services/i18n');
const { getGuild } = require('../../database/models/guild');
const { createBot, deleteBot, getBot, getGuildBots, updateBot } = require('../../database/models/bot');
const { startExternalBot, stopExternalBot, validateToken, getActiveCount, MAX_BOTS, updateAllBotStatuses } = require('../../services/bot-manager');
const { isValidSymbol } = require('../../utils/validators');
const logger = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bot')
    .setDescription('Manage external price-display bots')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub
        .setName('create')
        .setDescription('Create a new external bot')
        .addStringOption(opt =>
          opt.setName('token')
            .setDescription('Bot token (kept secret)')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('crypto')
            .setDescription('Crypto symbol to display (e.g. BTC, ETH)')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('list')
        .setDescription('List external bots for this server')
    )
    .addSubcommand(sub =>
      sub
        .setName('edit')
        .setDescription('Change the crypto displayed by an external bot')
        .addStringOption(opt =>
          opt.setName('id')
            .setDescription('Bot ID')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('crypto')
            .setDescription('New crypto symbol (e.g. BTC, ETH)')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('delete')
        .setDescription('Delete an external bot')
        .addStringOption(opt =>
          opt.setName('id')
            .setDescription('Bot ID')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('format')
        .setDescription('Change the display format of an external bot')
        .addStringOption(opt =>
          opt.setName('id')
            .setDescription('Bot ID')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('format')
            .setDescription('Display format')
            .setRequired(true)
            .addChoices(
              { name: 'Simple (BTC: $60,000)', value: 'simple' },
              { name: 'Full (Bitcoin (BTC) | $60,000 | +2.5%)', value: 'full' },
              { name: 'Minimal ($60,000)', value: 'minimal' },
              { name: 'Emoji (coin BTC: $60,000 (+2.5%))', value: 'emoji' },
            )
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('status')
        .setDescription('Set a custom status on the main bot (use "reset" to restore default)')
        .addStringOption(opt =>
          opt.setName('text')
            .setDescription('Status text, or "reset" to restore default')
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    const guildId = interaction.guild.id;
    const guildConfig = getGuild(guildId);
    const lang = getLang(guildConfig);

    // Admin check for all subcommands
    if (!isAdmin(interaction.member)) {
      return denyPermission(interaction);
    }

    const subcommand = interaction.options.getSubcommand();

    try {
      switch (subcommand) {
        case 'create':
          await handleCreate(interaction, guildId, lang);
          break;
        case 'list':
          await handleList(interaction, guildId, lang, guildConfig);
          break;
        case 'edit':
          await handleEdit(interaction, guildId, lang);
          break;
        case 'delete':
          await handleDelete(interaction, guildId, lang);
          break;
        case 'format':
          await handleFormat(interaction, guildId, lang);
          break;
        case 'status':
          await handleStatus(interaction, lang);
          break;
      }
    } catch (err) {
      logger.error('Error in /bot command', { subcommand, guildId, error: err.message });
      const content = t('error.generic', lang);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content });
      } else {
        await interaction.reply({ content, ephemeral: true });
      }
    }
  },
};

/**
 * Handle /bot create
 */
async function handleCreate(interaction, guildId, lang) {
  // Defer ephemeral — token validation can take a few seconds
  await interaction.deferReply({ ephemeral: true });

  const token = interaction.options.getString('token');
  const crypto = interaction.options.getString('crypto').toUpperCase().trim();

  // Validate crypto symbol
  if (!isValidSymbol(crypto)) {
    return interaction.editReply({
      content: t('track.invalid_symbol', lang, { symbol: crypto }),
    });
  }

  // Check per-guild bot limit
  const existingBots = getGuildBots(guildId);
  if (existingBots.length >= MAX_BOTS) {
    return interaction.editReply({
      content: t('bot.max_reached', lang),
    });
  }

  // Validate bot token
  const valid = await validateToken(token);
  if (!valid) {
    return interaction.editReply({
      content: t('bot.invalid_token', lang),
    });
  }

  // Create bot entry and start it
  const botData = createBot(token, crypto, guildId);
  await startExternalBot(botData);

  return interaction.editReply({
    content: t('bot.created', lang, { crypto, id: botData.id }),
  });
}

/**
 * Handle /bot list
 */
async function handleList(interaction, guildId, lang, guildConfig) {
  const bots = getGuildBots(guildId);

  if (!bots || bots.length === 0) {
    return interaction.reply({
      content: t('bot.list_empty', lang),
      ephemeral: true,
    });
  }

  const embed = new EmbedBuilder()
    .setTitle(t('bot.list_title', lang))
    .setColor(guildConfig.embedColorNeutral || '#95a5a6')
    .setTimestamp();

  const lines = bots.map(b => {
    const status = b.enabled ? '🟢' : '🔴';
    return `${status} \`${b.id}\` — **${b.crypto}** | Format: \`${b.format}\``;
  });

  embed.setDescription(lines.join('\n'));
  embed.setFooter({ text: `${bots.length}/${MAX_BOTS}` });

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

/**
 * Handle /bot edit
 */
async function handleEdit(interaction, guildId, lang) {
  const botId = interaction.options.getString('id');
  const crypto = interaction.options.getString('crypto').toUpperCase().trim();

  if (!isValidSymbol(crypto)) {
    return interaction.reply({
      content: t('track.invalid_symbol', lang, { symbol: crypto }),
      ephemeral: true,
    });
  }

  const bot = getBot(botId);
  if (!bot || bot.guildId !== guildId) {
    return interaction.reply({
      content: t('bot.not_found', lang, { id: botId }),
      ephemeral: true,
    });
  }

  updateBot(botId, { crypto });

  // Refresh the bot status with the new crypto
  const updatedBot = getBot(botId);
  if (updatedBot) {
    await startExternalBot(updatedBot);
  }

  return interaction.reply({
    content: t('bot.edited', lang, { id: botId, crypto }),
    ephemeral: true,
  });
}

/**
 * Handle /bot delete
 */
async function handleDelete(interaction, guildId, lang) {
  const botId = interaction.options.getString('id');

  const bot = getBot(botId);
  if (!bot || bot.guildId !== guildId) {
    return interaction.reply({
      content: t('bot.not_found', lang, { id: botId }),
      ephemeral: true,
    });
  }

  await stopExternalBot(botId);
  deleteBot(botId);

  return interaction.reply({
    content: t('bot.deleted', lang, { id: botId }),
    ephemeral: true,
  });
}

/**
 * Handle /bot format
 */
async function handleFormat(interaction, guildId, lang) {
  const botId = interaction.options.getString('id');
  const format = interaction.options.getString('format');

  const bot = getBot(botId);
  if (!bot || bot.guildId !== guildId) {
    return interaction.reply({
      content: t('bot.not_found', lang, { id: botId }),
      ephemeral: true,
    });
  }

  updateBot(botId, { format });

  return interaction.reply({
    content: t('bot.format_set', lang, { id: botId, format }),
    ephemeral: true,
  });
}

/**
 * Handle /bot status
 */
async function handleStatus(interaction, lang) {
  const text = interaction.options.getString('text');

  if (text === 'reset') {
    // Reset to default status
    interaction.client.user.setPresence({
      activities: [],
      status: 'online',
    });

    return interaction.reply({
      content: t('bot.status_reset', lang),
      ephemeral: true,
    });
  }

  // Set custom status
  interaction.client.user.setPresence({
    activities: [{
      name: text,
      type: ActivityType.Watching,
    }],
    status: 'online',
  });

  return interaction.reply({
    content: t('bot.status_set', lang, { status: text }),
    ephemeral: true,
  });
}
