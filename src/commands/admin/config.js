const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { isAdmin, denyPermission } = require('../../utils/permissions');
const { getConfig, setConfig, resetConfig } = require('../../database/models/config');
const { isValidInterval, isValidThreshold } = require('../../utils/validators');
const { restartScheduler } = require('../../services/scheduler');
const logger = require('../../utils/logger');

const data = new SlashCommandBuilder()
  .setName('config')
  .setDescription('Gestion de la configuration du bot')
  .addSubcommand(sub =>
    sub
      .setName('interval')
      .setDescription('Modifier l\'intervalle de mise à jour (en minutes)')
      .addIntegerOption(opt =>
        opt
          .setName('minutes')
          .setDescription('Intervalle en minutes (5-60)')
          .setRequired(true)
          .setMinValue(5)
          .setMaxValue(60)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName('alert-threshold')
      .setDescription('Modifier le seuil d\'alerte par défaut')
      .addNumberOption(opt =>
        opt
          .setName('percent')
          .setDescription('Seuil en pourcentage (0.1-100)')
          .setRequired(true)
          .setMinValue(0.1)
          .setMaxValue(100)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName('category')
      .setDescription('Modifier le nom de la catégorie')
      .addStringOption(opt =>
        opt
          .setName('name')
          .setDescription('Nouveau nom de la catégorie')
          .setRequired(true)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName('reset')
      .setDescription('Réinitialiser toute la configuration')
  );

// Track pending reset confirmations
const pendingResets = new Set();

async function execute(interaction) {
  if (!isAdmin(interaction.member)) {
    return denyPermission(interaction);
  }

  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case 'interval':
      return handleInterval(interaction);
    case 'alert-threshold':
      return handleAlertThreshold(interaction);
    case 'category':
      return handleCategory(interaction);
    case 'reset':
      return handleReset(interaction);
    default:
      return interaction.reply({ content: '❌ Sous-commande inconnue.', ephemeral: true });
  }
}

async function handleInterval(interaction) {
  const minutes = interaction.options.getInteger('minutes');

  if (!isValidInterval(minutes)) {
    return interaction.reply({
      content: '❌ L\'intervalle doit être entre 5 et 60 minutes.',
      ephemeral: true,
    });
  }

  const config = setConfig({ updateInterval: minutes * 60 * 1000 });

  // Restart scheduler with new interval
  restartScheduler(interaction.client);

  logger.info('Config updated: interval', { minutes, userId: interaction.user.id });

  const embed = new EmbedBuilder()
    .setTitle('✅ Intervalle mis à jour')
    .setDescription(`L'intervalle de mise à jour a été défini à **${minutes} minutes**.`)
    .setColor(0x2ecc71)
    .addFields(
      { name: '⏱️ Nouvel intervalle', value: `${minutes} min`, inline: true },
      { name: '🔄 Scheduler', value: 'Redémarré', inline: true },
    )
    .setTimestamp()
    .setFooter({ text: 'Crypto Tracker Bot • Config' });

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleAlertThreshold(interaction) {
  const percent = interaction.options.getNumber('percent');

  if (!isValidThreshold(percent)) {
    return interaction.reply({
      content: '❌ Le seuil doit être entre 0.1% et 100%.',
      ephemeral: true,
    });
  }

  setConfig({ alertThreshold: percent });

  logger.info('Config updated: alertThreshold', { percent, userId: interaction.user.id });

  const embed = new EmbedBuilder()
    .setTitle('✅ Seuil d\'alerte mis à jour')
    .setDescription(`Le seuil d'alerte par défaut a été défini à **${percent}%**.`)
    .setColor(0x2ecc71)
    .addFields(
      { name: '🚨 Nouveau seuil', value: `${percent}%`, inline: true },
    )
    .setTimestamp()
    .setFooter({ text: 'Crypto Tracker Bot • Config' });

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleCategory(interaction) {
  const name = interaction.options.getString('name');
  const config = getConfig();

  if (!config.categoryId) {
    return interaction.reply({
      content: '❌ Aucune catégorie configurée. Lancez `/setup` d\'abord.',
      ephemeral: true,
    });
  }

  try {
    const channel = interaction.guild.channels.cache.get(config.categoryId);
    if (channel) {
      await channel.setName(name);
    }

    logger.info('Config updated: category name', { name, userId: interaction.user.id });

    const embed = new EmbedBuilder()
      .setTitle('✅ Catégorie mise à jour')
      .setDescription(`Le nom de la catégorie a été changé en **${name}**.`)
      .setColor(0x2ecc71)
      .setTimestamp()
      .setFooter({ text: 'Crypto Tracker Bot • Config' });

    return interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (err) {
    logger.error('Failed to update category name', { error: err.message });
    return interaction.reply({
      content: `❌ Erreur lors du renommage de la catégorie : \`${err.message}\``,
      ephemeral: true,
    });
  }
}

async function handleReset(interaction) {
  const guildId = interaction.guild.id;

  // Ask for confirmation
  const embed = new EmbedBuilder()
    .setTitle('⚠️ Réinitialisation de la configuration')
    .setDescription(
      'Êtes-vous sûr de vouloir **réinitialiser toute la configuration** ?\n\n' +
      'Cela remettra tous les paramètres à leurs valeurs par défaut.\n' +
      'Les canaux existants ne seront **pas** supprimés.'
    )
    .setColor(0xe74c3c)
    .setFooter({ text: 'Crypto Tracker Bot • Config' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('config_reset_confirm')
      .setLabel('Confirmer la réinitialisation')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🗑️'),
    new ButtonBuilder()
      .setCustomId('config_reset_cancel')
      .setLabel('Annuler')
      .setStyle(ButtonStyle.Secondary),
  );

  pendingResets.add(guildId);
  return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
}

async function handleButton(interaction) {
  if (!isAdmin(interaction.member)) {
    return interaction.reply({ content: '❌ Permission refusée.', ephemeral: true });
  }

  const guildId = interaction.guild.id;

  if (interaction.customId === 'config_reset_confirm') {
    if (!pendingResets.has(guildId)) {
      return interaction.update({
        content: '❌ Aucune réinitialisation en attente.',
        embeds: [],
        components: [],
      });
    }

    pendingResets.delete(guildId);
    resetConfig();

    logger.info('Config reset', { userId: interaction.user.id, guildId });

    const embed = new EmbedBuilder()
      .setTitle('✅ Configuration réinitialisée')
      .setDescription(
        'Tous les paramètres ont été remis à zéro.\n' +
        'Utilisez `/setup` pour reconfigurer le bot.'
      )
      .setColor(0x2ecc71)
      .setTimestamp()
      .setFooter({ text: 'Crypto Tracker Bot • Config' });

    return interaction.update({ embeds: [embed], components: [] });
  }

  if (interaction.customId === 'config_reset_cancel') {
    pendingResets.delete(guildId);

    return interaction.update({
      embeds: [
        new EmbedBuilder()
          .setTitle('Réinitialisation annulée')
          .setDescription('La configuration n\'a pas été modifiée.')
          .setColor(0x95a5a6),
      ],
      components: [],
    });
  }
}

module.exports = { data, execute, handleButton };
