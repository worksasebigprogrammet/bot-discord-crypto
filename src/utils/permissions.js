const { PermissionFlagsBits } = require('discord.js');

/**
 * Check if a guild member has admin permissions.
 * @param {import('discord.js').GuildMember} member
 * @returns {boolean}
 */
function isAdmin(member) {
  if (!member) return false;
  return member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.permissions.has(PermissionFlagsBits.ManageGuild);
}

/**
 * Reply with a permission denied message (ephemeral).
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
async function denyPermission(interaction) {
  const msg = '❌ Vous devez avoir la permission **Administrateur** ou **Gérer le serveur** pour utiliser cette commande.';
  if (interaction.deferred || interaction.replied) {
    return interaction.editReply({ content: msg });
  }
  return interaction.reply({ content: msg, ephemeral: true });
}

module.exports = { isAdmin, denyPermission };
