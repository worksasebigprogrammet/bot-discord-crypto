const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');
const { isAdmin, denyPermission } = require('../../utils/permissions');
const { t, getLang } = require('../../services/i18n');
const { getGuild, addCryptoToGuild, getCryptoInGuild, updateCryptoInGuild } = require('../../database/models/guild');
const channelManager = require('../../services/channel-manager');
const { fetchQuotes, getCryptoMap } = require('../../services/crypto-api');
const { buildPriceEmbed } = require('../../services/embed-builder');
const { isValidSymbol } = require('../../utils/validators');
const logger = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('track')
    .setDescription('Ajouter une crypto au tracking')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(opt =>
      opt
        .setName('symbol')
        .setDescription('Symbole de la crypto (ex: BTC, ETH, SOL)')
        .setRequired(true)
        .setAutocomplete(true),
    ),

  /**
   * Autocomplete handler: suggest cryptos from the CMC map.
   */
  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().toUpperCase();

    try {
      const cryptoMap = await getCryptoMap();
      const filtered = cryptoMap
        .filter(c =>
          c.symbol.toUpperCase().startsWith(focused) ||
          c.name.toUpperCase().startsWith(focused),
        )
        .slice(0, 25)
        .map(c => ({
          name: `${c.symbol} - ${c.name}`,
          value: c.symbol,
        }));

      await interaction.respond(filtered);
    } catch (err) {
      logger.error('Track autocomplete error', { error: err.message });
      await interaction.respond([]);
    }
  },

  /**
   * Execute the /track command: add a crypto to the guild's tracking list.
   */
  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return denyPermission(interaction);
    }

    const guildId = interaction.guildId;
    const config = getGuild(guildId);
    const lang = getLang(config);
    const symbol = interaction.options.getString('symbol').toUpperCase().trim();

    // Validate symbol format
    if (!isValidSymbol(symbol)) {
      return interaction.reply({
        content: t('track.invalid_symbol', lang, { symbol }),
        flags: MessageFlags.Ephemeral,
      });
    }

    // Check setup is complete
    if (!config.setupComplete) {
      return interaction.reply({
        content: t('track.setup_required', lang),
        flags: MessageFlags.Ephemeral,
      });
    }

    // Check if already tracked
    if (getCryptoInGuild(guildId, symbol)) {
      return interaction.reply({
        content: t('track.already_tracked', lang, { symbol }),
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      // Verify the symbol exists by fetching a quote
      const quotes = await fetchQuotes([symbol]);
      const quote = quotes[symbol];

      if (!quote) {
        return interaction.editReply({
          content: t('track.not_found', lang, { symbol }),
        });
      }

      // Add to guild database
      const entry = addCryptoToGuild(guildId, symbol, quote.name || symbol);
      if (!entry) {
        return interaction.editReply({
          content: t('track.already_tracked', lang, { symbol }),
        });
      }

      // Create the Discord channel
      const category = await channelManager.ensureCategory(interaction.guild);
      const channel = await channelManager.createCryptoChannel(interaction.guild, category, symbol);
      updateCryptoInGuild(guildId, symbol, { channelId: channel.id });

      // Send initial price embed
      const updatedConfig = getGuild(guildId);
      const embed = buildPriceEmbed(quote, updatedConfig);
      const msg = await channel.send({ embeds: [embed] });
      updateCryptoInGuild(guildId, symbol, { messageId: msg.id });

      logger.info('Crypto tracked', { guildId, symbol, channelId: channel.id });

      return interaction.editReply({
        content: t('track.added', lang, { symbol, channel: `<#${channel.id}>` }),
      });
    } catch (err) {
      logger.error('Track command failed', { guildId, symbol, error: err.message, stack: err.stack });
      return interaction.editReply({
        content: t('error.api_fail', lang),
      });
    }
  },
};
