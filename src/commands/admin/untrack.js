const {
  SlashCommandBuilder,
  EmbedBuilder,
} = require('discord.js');
const { isAdmin, denyPermission } = require('../../utils/permissions');
const { removeCrypto, getCrypto } = require('../../database/models/crypto');
const channelManager = require('../../services/channel-manager');
const { isValidSymbol } = require('../../utils/validators');
const logger = require('../../utils/logger');

const data = new SlashCommandBuilder()
  .setName('untrack')
  .setDescription('Retirer une cryptomonnaie du suivi')
  .addStringOption(opt =>
    opt
      .setName('symbol')
      .setDescription('Symbole de la crypto à retirer (ex: BTC, ETH)')
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
      content: `❌ Symbole invalide : \`${rawSymbol}\`.`,
      ephemeral: true,
    });
  }

  // Check if crypto exists
  const existing = getCrypto(symbol);
  if (!existing) {
    return interaction.reply({
      content: `⚠️ **${symbol}** n'est pas actuellement suivi.`,
      ephemeral: true,
    });
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    // Delete the channel if it exists
    if (existing.channelId) {
      await channelManager.deleteCryptoChannel(interaction.guild, existing.channelId);
    }

    // Remove from database
    const removed = removeCrypto(symbol);

    if (!removed) {
      return interaction.editReply({
        content: `❌ Impossible de retirer **${symbol}** de la base de données.`,
      });
    }

    logger.info('Crypto untracked', { symbol, userId: interaction.user.id });

    const embed = new EmbedBuilder()
      .setTitle('✅ Crypto retirée du suivi')
      .setDescription(`**${symbol}** a été retiré du suivi.`)
      .setColor(0xe74c3c)
      .addFields(
        { name: '🪙 Symbole', value: symbol, inline: true },
        { name: '📺 Canal', value: 'Supprimé', inline: true },
        { name: '📊 Status', value: 'Inactif', inline: true },
      )
      .setTimestamp()
      .setFooter({ text: 'Crypto Tracker Bot' });

    return interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logger.error('Failed to untrack crypto', { symbol, error: err.message });
    return interaction.editReply({
      content: `❌ Erreur lors du retrait de **${symbol}** : \`${err.message}\``,
    });
  }
}

module.exports = { data, execute };
