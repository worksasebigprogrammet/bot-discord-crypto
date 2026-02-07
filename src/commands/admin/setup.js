const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');
const { isAdmin, denyPermission } = require('../../utils/permissions');
const { t, getLang } = require('../../services/i18n');
const { getGuild, updateGuild, addCryptoToGuild, updateCryptoInGuild } = require('../../database/models/guild');
const channelManager = require('../../services/channel-manager');
const { fetchQuotes } = require('../../services/crypto-api');
const { buildPriceEmbed } = require('../../services/embed-builder');
const { startScheduler } = require('../../services/scheduler');
const logger = require('../../utils/logger');

/** In-memory store for active setup sessions, keyed by guildId. */
const setupSessions = new Map();

const TOP_CRYPTOS = [
  { symbol: 'BTC', name: 'Bitcoin' },
  { symbol: 'ETH', name: 'Ethereum' },
  { symbol: 'SOL', name: 'Solana' },
  { symbol: 'BNB', name: 'BNB' },
  { symbol: 'XRP', name: 'XRP' },
  { symbol: 'ADA', name: 'Cardano' },
  { symbol: 'DOT', name: 'Polkadot' },
  { symbol: 'MATIC', name: 'Polygon' },
  { symbol: 'AVAX', name: 'Avalanche' },
  { symbol: 'LINK', name: 'Chainlink' },
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configuration guidee du bot')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  /**
   * Execute the /setup command -- start the setup wizard at step 1.
   */
  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return denyPermission(interaction);
    }

    const guildId = interaction.guildId;
    const config = getGuild(guildId);
    const lang = getLang(config);

    // Check if setup is already complete
    if (config.setupComplete) {
      return interaction.reply({
        content: t('setup.already_done', lang),
        flags: MessageFlags.Ephemeral,
      });
    }

    // Initialize session
    setupSessions.set(guildId, {
      userId: interaction.user.id,
      step: 1,
      interval: null,
      cryptos: [],
      threshold: null,
      startedAt: Date.now(),
    });

    // Step 1: Choose interval
    const embed = new EmbedBuilder()
      .setTitle(t('setup.welcome', lang))
      .setDescription(t('setup.step_interval', lang))
      .setColor(0x3498db)
      .setFooter({ text: 'Step 1/4' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('setup_interval_5')
        .setLabel('5 min')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('setup_interval_10')
        .setLabel('10 min')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('setup_interval_15')
        .setLabel('15 min')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('setup_interval_30')
        .setLabel('30 min')
        .setStyle(ButtonStyle.Secondary),
    );

    await interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
  },

  /**
   * Handle button interactions for the setup wizard.
   */
  async handleButton(interaction) {
    const guildId = interaction.guildId;
    const session = setupSessions.get(guildId);

    if (!session || session.userId !== interaction.user.id) {
      return interaction.reply({
        content: t('error.generic', getLang(getGuild(guildId))),
        flags: MessageFlags.Ephemeral,
      });
    }

    const config = getGuild(guildId);
    const lang = getLang(config);
    const customId = interaction.customId;

    // --- Step 1: Interval selection ---
    if (customId.startsWith('setup_interval_')) {
      const minutes = parseInt(customId.replace('setup_interval_', ''), 10);
      session.interval = minutes;
      session.step = 2;

      // Step 2: Crypto selection
      const embed = new EmbedBuilder()
        .setTitle(t('setup.welcome', lang))
        .setDescription(t('setup.step_cryptos', lang))
        .setColor(0x3498db)
        .addFields({
          name: t('setup.interval_label', lang),
          value: `${minutes} min`,
          inline: true,
        })
        .setFooter({ text: 'Step 2/4' });

      const selectRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('setup_crypto_select')
          .setPlaceholder(t('setup.step_cryptos', lang))
          .setMinValues(1)
          .setMaxValues(10)
          .addOptions(
            TOP_CRYPTOS.map(c => ({
              label: `${c.symbol} - ${c.name}`,
              value: c.symbol,
              description: c.name,
            })),
          ),
      );

      await interaction.update({ embeds: [embed], components: [selectRow] });
      return;
    }

    // --- Step 3: Threshold selection ---
    if (customId.startsWith('setup_threshold_')) {
      const threshold = parseInt(customId.replace('setup_threshold_', ''), 10);
      session.threshold = threshold;
      session.step = 4;

      // Step 4: Confirmation
      const cryptoList = session.cryptos.join(', ');
      const embed = new EmbedBuilder()
        .setTitle(t('setup.step_confirm', lang))
        .setColor(0xf1c40f)
        .addFields(
          { name: t('setup.interval_label', lang), value: `${session.interval} min`, inline: true },
          { name: t('setup.cryptos_label', lang), value: cryptoList || 'N/A', inline: true },
          { name: t('setup.threshold_label', lang), value: `${session.threshold}%`, inline: true },
        )
        .setFooter({ text: 'Step 4/4' });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('setup_confirm')
          .setLabel(t('setup.confirm_btn', lang))
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('setup_cancel')
          .setLabel(t('setup.cancel_btn', lang))
          .setStyle(ButtonStyle.Danger),
      );

      await interaction.update({ embeds: [embed], components: [row] });
      return;
    }

    // --- Step 4: Confirm ---
    if (customId === 'setup_confirm') {
      await interaction.deferUpdate();

      try {
        const guild = interaction.guild;

        // Create category
        const category = await channelManager.ensureCategory(guild);

        // Create alerts channel
        const alertsChannel = await channelManager.ensureAlertsChannel(guild, category);

        // Add cryptos and create channels
        const channelMentions = [];
        for (const symbol of session.cryptos) {
          const cryptoName = TOP_CRYPTOS.find(c => c.symbol === symbol)?.name || symbol;
          const entry = addCryptoToGuild(guildId, symbol, cryptoName);
          if (entry) {
            const channel = await channelManager.createCryptoChannel(guild, category, symbol);
            updateCryptoInGuild(guildId, symbol, { channelId: channel.id });
            channelMentions.push(`<#${channel.id}>`);
          }
        }

        // Save configuration
        updateGuild(guildId, {
          setupComplete: true,
          updateInterval: session.interval * 60 * 1000,
          alertThreshold: session.threshold,
          categoryId: category.id,
          alertsChannelId: alertsChannel.id,
        });

        // Fetch initial quotes and send embeds
        try {
          const quotes = await fetchQuotes(session.cryptos);
          const updatedConfig = getGuild(guildId);

          for (const symbol of session.cryptos) {
            const quote = quotes[symbol];
            const cryptoData = updatedConfig.cryptos.find(c => c.symbol === symbol);
            if (quote && cryptoData && cryptoData.channelId) {
              const channel = guild.channels.cache.get(cryptoData.channelId);
              if (channel) {
                const embed = buildPriceEmbed(quote, updatedConfig);
                const msg = await channel.send({ embeds: [embed] });
                updateCryptoInGuild(guildId, symbol, { messageId: msg.id });
              }
            }
          }
        } catch (err) {
          logger.warn('Failed to fetch initial quotes during setup', { guildId, error: err.message });
        }

        // Start the scheduler
        startScheduler(interaction.client);

        // Confirm success
        const successEmbed = new EmbedBuilder()
          .setTitle(t('setup.complete', lang))
          .setColor(0x00ff41)
          .setDescription(channelMentions.length > 0 ? channelMentions.join('\n') : '')
          .setTimestamp();

        await interaction.editReply({ embeds: [successEmbed], components: [] });

        logger.info('Setup completed', { guildId, cryptos: session.cryptos, interval: session.interval });
      } catch (err) {
        logger.error('Setup failed', { guildId, error: err.message, stack: err.stack });
        await interaction.editReply({
          content: t('error.generic', lang),
          embeds: [],
          components: [],
        });
      } finally {
        setupSessions.delete(guildId);
      }
      return;
    }

    // --- Step 4: Cancel ---
    if (customId === 'setup_cancel') {
      setupSessions.delete(guildId);

      const embed = new EmbedBuilder()
        .setTitle(t('setup.cancelled', lang))
        .setColor(0xff0000);

      await interaction.update({ embeds: [embed], components: [] });
      return;
    }
  },

  /**
   * Handle select menu interactions for the setup wizard.
   */
  async handleSelect(interaction) {
    const guildId = interaction.guildId;
    const session = setupSessions.get(guildId);

    if (!session || session.userId !== interaction.user.id) {
      return interaction.reply({
        content: t('error.generic', getLang(getGuild(guildId))),
        flags: MessageFlags.Ephemeral,
      });
    }

    const config = getGuild(guildId);
    const lang = getLang(config);
    const customId = interaction.customId;

    // --- Step 2: Crypto selection ---
    if (customId === 'setup_crypto_select') {
      session.cryptos = interaction.values;
      session.step = 3;

      // Step 3: Threshold selection
      const cryptoList = session.cryptos.join(', ');
      const embed = new EmbedBuilder()
        .setTitle(t('setup.welcome', lang))
        .setDescription(t('setup.step_threshold', lang))
        .setColor(0x3498db)
        .addFields(
          { name: t('setup.interval_label', lang), value: `${session.interval} min`, inline: true },
          { name: t('setup.cryptos_label', lang), value: cryptoList, inline: true },
        )
        .setFooter({ text: 'Step 3/4' });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('setup_threshold_3')
          .setLabel('3%')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('setup_threshold_5')
          .setLabel('5%')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('setup_threshold_10')
          .setLabel('10%')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('setup_threshold_15')
          .setLabel('15%')
          .setStyle(ButtonStyle.Secondary),
      );

      await interaction.update({ embeds: [embed], components: [row] });
      return;
    }
  },
};
