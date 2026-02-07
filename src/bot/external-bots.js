/**
 * External bots module - re-exports bot-manager for use by commands.
 * This file exists in src/bot/ as specified in the project structure.
 */
const botManager = require('../services/bot-manager');

module.exports = botManager;
