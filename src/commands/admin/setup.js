const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} = require('discord.js');
const { isAdmin, denyPermission } = require('../../utils/permissions');
const { getConfig, setConfig } = require('../../database/models/config');
const { addCrypto, getCryptos } = require('../../database/models/crypto');
const channelManager = require('../../services/channel-manager');
const { fetchQuotes } = require('../../services/crypto-api');
const { startScheduler } = require('../../services/scheduler');
const logger = require('../../utils/logger');

// Temporary setup state per guild
const setupSessions = new Map();

const CRYPTO_OPTIONS = [
  { label: 'Bitcoin (BTC)', value: 'BTC', emoji: '🪙' },
  { label: 'Ethereum (ETH)', value: 'ETH', emoji: '💎' },
  { label: 'Solana (SOL)', value: 'SOL', emoji: '☀️' },
  { label: 'BNB (BNB)', value: 'BNB', emoji: '🔶' },
  { label: 'XRP (XRP)', value: 'XRP', emoji: '💧' },
  { label: 'Cardano (ADA)', value: 'ADA', emoji: '🔵' },
  { label: 'Polkadot (DOT)', value: 'DOT', emoji: '⚪' },
  { label: 'Polygon (MATIC)', value: 'MATIC', emoji: '🟣' },
  { label: 'Avalanche (AVAX)', value: 'AVAX', emoji: '🔺' },
  { label: 'Chainlink (LINK)', value: 'LINK', emoji: '🔗' },
];

const data = new SlashCommandBuilder()
  .setName('setup')
  .setDescription('Configuration guidée du bot');

async function execute(interaction) {
  if (!isAdmin(interaction.member)) {
    return denyPermission(interaction);
  }

  const config = getConfig();
  if (config.setupComplete) {
    return interaction.reply({
      content: '⚠️ Le bot est déjà configuré. Utilisez `/config reset` pour réinitialiser avant de relancer le setup.',
      ephemeral: true,
    });
  }

  const guildId = interaction.guild.id;

  // Initialize setup session
  setupSessions.set(guildId, {
    step: 'interval',
    interval: null,
    cryptos: [],
    threshold: 5,
    userId: interaction.user.id,
  });

  // Step 1: Choose interval
  const embed = new EmbedBuilder()
    .setTitle('🛠️ Assistant de Configuration')
    .setDescription(
      'Bienvenue dans l\'assistant de configuration du **Crypto Tracker Bot** !\n\n' +
      '**Étape 1/4** — Choisissez l\'intervalle de mise à jour des prix :'
    )
    .setColor(0x3498db)
    .addFields({
      name: '⏱️ Intervalle',
      value: 'Sélectionnez la fréquence de mise à jour des canaux de prix.',
    })
    .setFooter({ text: 'Setup Crypto Tracker Bot' });

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

  await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
}

async function handleButton(interaction) {
  const guildId = interaction.guild.id;
  const session = setupSessions.get(guildId);

  if (!session || session.userId !== interaction.user.id) {
    return interaction.reply({ content: '❌ Session de setup non trouvée ou non autorisée.', ephemeral: true });
  }

  const customId = interaction.customId;

  // Handle interval selection buttons
  if (customId.startsWith('setup_interval_')) {
    const minutes = parseInt(customId.replace('setup_interval_', ''), 10);
    session.interval = minutes;
    session.step = 'cryptos';

    // Step 2: Select cryptos
    const embed = new EmbedBuilder()
      .setTitle('🛠️ Assistant de Configuration')
      .setDescription(
        `✅ Intervalle défini à **${minutes} minutes**.\n\n` +
        '**Étape 2/4** — Sélectionnez les cryptomonnaies à suivre :'
      )
      .setColor(0x3498db)
      .addFields({
        name: '🪙 Cryptomonnaies',
        value: 'Choisissez une ou plusieurs cryptos dans le menu ci-dessous.',
      })
      .setFooter({ text: 'Setup Crypto Tracker Bot' });

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('setup_crypto_select')
      .setPlaceholder('Sélectionnez les cryptos à suivre...')
      .setMinValues(1)
      .setMaxValues(CRYPTO_OPTIONS.length)
      .addOptions(CRYPTO_OPTIONS);

    const row = new ActionRowBuilder().addComponents(selectMenu);

    await interaction.update({ embeds: [embed], components: [row] });
    return;
  }

  // Handle threshold buttons
  if (customId.startsWith('setup_threshold_')) {
    const threshold = parseFloat(customId.replace('setup_threshold_', ''));
    session.threshold = threshold;
    session.step = 'confirm';

    // Step 4: Confirmation
    const embed = new EmbedBuilder()
      .setTitle('🛠️ Assistant de Configuration — Confirmation')
      .setDescription(
        '**Récapitulatif de la configuration :**\n\n' +
        `⏱️ **Intervalle :** ${session.interval} minutes\n` +
        `🪙 **Cryptos :** ${session.cryptos.join(', ')}\n` +
        `🚨 **Seuil d'alerte :** ${session.threshold}%\n\n` +
        'Cliquez sur **Confirmer** pour appliquer la configuration.'
      )
      .setColor(0x2ecc71)
      .setFooter({ text: 'Setup Crypto Tracker Bot' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('setup_confirm')
        .setLabel('Confirmer')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅'),
      new ButtonBuilder()
        .setCustomId('setup_cancel')
        .setLabel('Annuler')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('❌'),
    );

    await interaction.update({ embeds: [embed], components: [row] });
    return;
  }

  // Handle confirm
  if (customId === 'setup_confirm') {
    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setTitle('⏳ Configuration en cours...')
          .setDescription('Création des canaux et démarrage du bot. Veuillez patienter...')
          .setColor(0xf1c40f),
      ],
      components: [],
    });

    try {
      const guild = interaction.guild;

      // Update config
      setConfig({
        guildId: guild.id,
        updateInterval: session.interval * 60 * 1000,
        alertThreshold: session.threshold,
      });

      // Create category and alerts channel
      const category = await channelManager.ensureCategory(guild);
      await channelManager.ensureAlertsChannel(guild, category);

      // Add cryptos and create channels
      for (const symbol of session.cryptos) {
        const added = addCrypto(symbol, symbol);
        if (added) {
          await channelManager.createCryptoChannel(guild, category, symbol);
        }
      }

      // Fetch initial quotes
      try {
        const quotes = await fetchQuotes(session.cryptos);
        logger.info('Initial quotes fetched during setup', { count: Object.keys(quotes).length });
      } catch (err) {
        logger.warn('Failed to fetch initial quotes during setup', { error: err.message });
      }

      // Mark setup complete
      setConfig({ setupComplete: true });

      // Start the scheduler
      startScheduler(interaction.client);

      const successEmbed = new EmbedBuilder()
        .setTitle('✅ Configuration terminée !')
        .setDescription(
          'Le **Crypto Tracker Bot** est maintenant opérationnel.\n\n' +
          `⏱️ **Intervalle :** ${session.interval} minutes\n` +
          `🪙 **Cryptos suivies :** ${session.cryptos.join(', ')}\n` +
          `🚨 **Seuil d'alerte :** ${session.threshold}%\n\n` +
          'Utilisez `/panel` pour accéder au panneau d\'administration.\n' +
          'Utilisez `/track` et `/untrack` pour gérer les cryptos.'
        )
        .setColor(0x2ecc71)
        .setFooter({ text: 'Crypto Tracker Bot' })
        .setTimestamp();

      await interaction.editReply({ embeds: [successEmbed], components: [] });

      logger.info('Setup completed', {
        guildId: guild.id,
        interval: session.interval,
        cryptos: session.cryptos,
        threshold: session.threshold,
      });
    } catch (err) {
      logger.error('Setup failed', { error: err.message });
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle('❌ Erreur lors du setup')
            .setDescription(`Une erreur est survenue : \`${err.message}\`\n\nVeuillez réessayer avec \`/setup\`.`)
            .setColor(0xe74c3c),
        ],
        components: [],
      });
    } finally {
      setupSessions.delete(guildId);
    }
    return;
  }

  // Handle cancel
  if (customId === 'setup_cancel') {
    setupSessions.delete(guildId);
    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setTitle('❌ Setup annulé')
          .setDescription('La configuration a été annulée. Relancez `/setup` pour recommencer.')
          .setColor(0xe74c3c),
      ],
      components: [],
    });
    return;
  }
}

async function handleSelect(interaction) {
  const guildId = interaction.guild.id;
  const session = setupSessions.get(guildId);

  if (!session || session.userId !== interaction.user.id) {
    return interaction.reply({ content: '❌ Session de setup non trouvée ou non autorisée.', ephemeral: true });
  }

  if (interaction.customId === 'setup_crypto_select') {
    session.cryptos = interaction.values;
    session.step = 'threshold';

    // Step 3: Configure alert threshold
    const embed = new EmbedBuilder()
      .setTitle('🛠️ Assistant de Configuration')
      .setDescription(
        `✅ Cryptos sélectionnées : **${session.cryptos.join(', ')}**\n\n` +
        '**Étape 3/4** — Configurez le seuil d\'alerte par défaut :\n' +
        'Ce seuil déclenche une alerte quand le prix varie de ce pourcentage en 24h.'
      )
      .setColor(0x3498db)
      .addFields({
        name: '🚨 Seuil d\'alerte',
        value: 'Sélectionnez le pourcentage de variation qui déclenchera une alerte.',
      })
      .setFooter({ text: 'Setup Crypto Tracker Bot' });

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
  }
}

module.exports = { data, execute, handleButton, handleSelect };
