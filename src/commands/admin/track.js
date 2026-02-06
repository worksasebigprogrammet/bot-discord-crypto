const {
  SlashCommandBuilder,
  EmbedBuilder,
} = require('discord.js');
const { isAdmin, denyPermission } = require('../../utils/permissions');
const { getConfig } = require('../../database/models/config');
const { addCrypto, getCrypto } = require('../../database/models/crypto');
const channelManager = require('../../services/channel-manager');
const { fetchQuotes } = require('../../services/crypto-api');
const { isValidSymbol } = require('../../utils/validators');
const { buildPriceEmbed } = require('../../services/embed-builder');
const logger = require('../../utils/logger');

const data = new SlashCommandBuilder()
  .setName('track')
  .setDescription('Ajouter une cryptomonnaie au suivi')
  .addStringOption(opt =>
    opt
      .setName('symbol')
      .setDescription('Symbole de la crypto (ex: BTC, ETH, SOL)')
      .setRequired(true)
  );

async function execute(interaction) {
  if (!isAdmin(interaction.member)) {
    return denyPermission(interaction);
  }

  const rawSymbol = interaction.options.getString('symbol');
  const symbol = rawSymbol.toUpperCase().trim();

  // Validate symbol
  if (!isValidSymbol(symbol)) {
    return interaction.reply({
      content: `❌ Symbole invalide : \`${rawSymbol}\`. Utilisez un symbole valide (ex: BTC, ETH, SOL).`,
      ephemeral: true,
    });
  }

  // Check if already tracked
  const existing = getCrypto(symbol);
  if (existing) {
    return interaction.reply({
      content: `⚠️ **${symbol}** est déjà suivi.`,
      ephemeral: true,
    });
  }

  // Check setup
  const config = getConfig();
  if (!config.categoryId) {
    return interaction.reply({
      content: '❌ Le bot n\'est pas encore configuré. Lancez `/setup` d\'abord.',
      ephemeral: true,
    });
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    // Add to database
    const crypto = addCrypto(symbol, symbol);
    if (!crypto) {
      return interaction.editReply({
        content: `❌ Impossible d'ajouter **${symbol}** à la base de données.`,
      });
    }

    // Create channel
    const guild = interaction.guild;
    const category = guild.channels.cache.get(config.categoryId);

    if (!category) {
      return interaction.editReply({
        content: '❌ Catégorie introuvable. Veuillez relancer `/setup`.',
      });
    }

    const channel = await channelManager.createCryptoChannel(guild, category, symbol);

    // Fetch initial quote
    let quoteEmbed = null;
    try {
      const quotes = await fetchQuotes([symbol]);
      if (quotes[symbol]) {
        quoteEmbed = buildPriceEmbed(quotes[symbol]);
        // Send initial price embed to the new channel
        const msg = await channel.send({ embeds: [quoteEmbed] });
        const { updateCrypto } = require('../../database/models/crypto');
        updateCrypto(symbol, { messageId: msg.id });
      }
    } catch (err) {
      logger.warn('Failed to fetch initial quote for tracked crypto', { symbol, error: err.message });
    }

    logger.info('Crypto tracked', { symbol, channelId: channel.id, userId: interaction.user.id });

    const embed = new EmbedBuilder()
      .setTitle('✅ Crypto ajoutée au suivi')
      .setDescription(`**${symbol}** est maintenant suivi par le bot.`)
      .setColor(0x2ecc71)
      .addFields(
        { name: '🪙 Symbole', value: symbol, inline: true },
        { name: '📺 Canal', value: `<#${channel.id}>`, inline: true },
        { name: '📊 Status', value: 'Actif', inline: true },
      )
      .setTimestamp()
      .setFooter({ text: 'Crypto Tracker Bot' });

    return interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logger.error('Failed to track crypto', { symbol, error: err.message });
    return interaction.editReply({
      content: `❌ Erreur lors de l'ajout de **${symbol}** : \`${err.message}\``,
    });
  }
}

module.exports = { data, execute };
