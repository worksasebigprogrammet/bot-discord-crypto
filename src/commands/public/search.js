const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { searchCrypto } = require('../../services/crypto-api');
const logger = require('../../utils/logger');

const data = new SlashCommandBuilder()
  .setName('search')
  .setDescription('Rechercher une cryptomonnaie par nom ou symbole')
  .addStringOption(option =>
    option
      .setName('query')
      .setDescription('Nom ou symbole a rechercher (ex: bitcoin, ETH)')
      .setRequired(true)
  );

async function execute(interaction) {
  const query = interaction.options.getString('query').trim();

  if (!query || query.length < 1) {
    return interaction.reply({
      content: 'Veuillez fournir un terme de recherche valide.',
      ephemeral: true,
    });
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const results = await searchCrypto(query);

    if (!results || results.length === 0) {
      return interaction.editReply({
        content: `Aucun resultat pour \`${query}\`. Essayez un autre terme de recherche.`,
      });
    }

    const lines = results.map((c, i) => {
      const rank = c.rank ? `#${c.rank}` : 'N/A';
      return `**${i + 1}.** \`${c.symbol}\` - ${c.name} (Rank: ${rank})`;
    });

    const embed = new EmbedBuilder()
      .setTitle(`Resultats de recherche pour "${query}"`)
      .setDescription(lines.join('\n'))
      .setColor(0x3498db)
      .setFooter({ text: `${results.length} resultat(s) trouve(s) - Crypto Tracker Bot` })
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error('Search command failed', { query, error: error.message });
    return interaction.editReply({
      content: 'Une erreur est survenue lors de la recherche. Reessayez plus tard.',
    });
  }
}

module.exports = { data, execute };
