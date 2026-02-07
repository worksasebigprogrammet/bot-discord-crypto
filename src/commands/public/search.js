const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { t, getLang } = require('../../services/i18n');
const { getGuild } = require('../../database/models/guild');
const { searchCrypto } = require('../../services/crypto-api');
const logger = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('search')
    .setDescription('Search for a cryptocurrency by name or symbol')
    .addStringOption(option =>
      option
        .setName('query')
        .setDescription('Search query (name or symbol)')
        .setRequired(true)
    ),

  async execute(interaction) {
    const guildConfig = getGuild(interaction.guildId);
    const lang = getLang(guildConfig);
    const query = interaction.options.getString('query');

    await interaction.deferReply();

    try {
      const results = await searchCrypto(query);

      if (!results || results.length === 0) {
        return interaction.editReply({
          content: t('search.no_results', lang, { query }),
        });
      }

      const lines = results.map((c, i) => {
        const rankStr = c.rank ? `#${c.rank}` : 'N/A';
        return `**${i + 1}.** \`${c.symbol}\` — ${c.name} (${t('search.rank', lang)}: ${rankStr})`;
      });

      const embed = new EmbedBuilder()
        .setTitle(t('search.title', lang, { query }))
        .setDescription(lines.join('\n'))
        .setColor(0x3498db)
        .setFooter({ text: t('search.footer', lang, { count: results.length }) })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      logger.error('Search command error', {
        guildId: interaction.guildId,
        query,
        error: err.message,
      });
      await interaction.editReply({
        content: t('errors.api_failed', lang),
      });
    }
  },
};
