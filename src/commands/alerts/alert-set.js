const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { addAlert } = require('../../database/models/alert');
const { isValidSymbol, isValidPrice } = require('../../utils/validators');
const { formatPrice } = require('../../utils/formatter');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('alert')
    .setDescription('Gérer vos alertes de prix')
    .addSubcommand(sub =>
      sub.setName('set')
        .setDescription('Créer une alerte de prix')
        .addStringOption(opt => opt.setName('symbol').setDescription('Symbole crypto (ex: BTC)').setRequired(true))
        .addStringOption(opt => opt.setName('type').setDescription('Type d\'alerte').setRequired(true)
          .addChoices(
            { name: 'Au-dessus de (above)', value: 'above' },
            { name: 'En-dessous de (below)', value: 'below' },
            { name: 'Variation % (change)', value: 'change' },
          ))
        .addNumberOption(opt => opt.setName('value').setDescription('Valeur cible (prix ou %)').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('Voir mes alertes actives')
    )
    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('Supprimer une alerte')
        .addIntegerOption(opt => opt.setName('id').setDescription('ID de l\'alerte').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('clear')
        .setDescription('Supprimer toutes mes alertes')
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'set') {
      const symbol = interaction.options.getString('symbol').toUpperCase().trim();
      const type = interaction.options.getString('type');
      const value = interaction.options.getNumber('value');

      if (!isValidSymbol(symbol)) {
        return interaction.reply({ content: '❌ Symbole invalide.', ephemeral: true });
      }

      if (type !== 'change' && !isValidPrice(value)) {
        return interaction.reply({ content: '❌ Valeur de prix invalide.', ephemeral: true });
      }

      const alert = addAlert(interaction.user.id, interaction.guildId, symbol, type, value);

      const typeLabel = type === 'above' ? 'au-dessus de' : type === 'below' ? 'en-dessous de' : 'variation de';
      const valueLabel = type === 'change' ? `${value}%` : formatPrice(value);

      const embed = new EmbedBuilder()
        .setTitle('🔔 Alerte créée')
        .setDescription(`**${symbol}** — ${typeLabel} ${valueLabel}`)
        .addFields({ name: 'ID', value: `#${alert.id}`, inline: true })
        .setColor(0x00ff41)
        .setTimestamp();

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === 'list') {
      const { getUserAlerts } = require('../../database/models/alert');
      const alerts = getUserAlerts(interaction.user.id);

      if (alerts.length === 0) {
        return interaction.reply({ content: '📭 Vous n\'avez aucune alerte active.', ephemeral: true });
      }

      const lines = alerts.map(a => {
        const typeLabel = a.type === 'above' ? '⬆️ Au-dessus' : a.type === 'below' ? '⬇️ En-dessous' : '📊 Variation';
        const valueLabel = a.type === 'change' ? `${a.value}%` : formatPrice(a.value);
        return `**#${a.id}** ${a.symbol} — ${typeLabel} ${valueLabel}`;
      });

      const embed = new EmbedBuilder()
        .setTitle('🔔 Mes Alertes')
        .setDescription(lines.join('\n'))
        .setColor(0x3498db)
        .setFooter({ text: `${alerts.length} alerte(s) active(s)` })
        .setTimestamp();

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === 'remove') {
      const { removeAlert } = require('../../database/models/alert');
      const id = interaction.options.getInteger('id');
      const removed = removeAlert(id, interaction.user.id);

      if (!removed) {
        return interaction.reply({ content: '❌ Alerte introuvable ou ne vous appartient pas.', ephemeral: true });
      }

      return interaction.reply({ content: `✅ Alerte #${id} supprimée.`, ephemeral: true });
    }

    if (sub === 'clear') {
      const { clearUserAlerts } = require('../../database/models/alert');
      const count = clearUserAlerts(interaction.user.id);
      return interaction.reply({ content: `✅ ${count} alerte(s) supprimée(s).`, ephemeral: true });
    }
  },
};
