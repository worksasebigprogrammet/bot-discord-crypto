const { readData, writeData } = require('../db');

const FILE = 'alerts.json';

let alertCounter = 0;

/**
 * @typedef {Object} Alert
 * @property {number} id
 * @property {string} userId
 * @property {string} guildId
 * @property {string} symbol
 * @property {'above'|'below'|'change'} type
 * @property {number} value
 * @property {boolean} triggered
 * @property {number} createdAt
 */

function getAlerts() {
  const alerts = readData(FILE, []);
  if (alerts.length > 0) {
    alertCounter = Math.max(...alerts.map(a => a.id), alertCounter);
  }
  return alerts;
}

function saveAlerts(alerts) {
  writeData(FILE, alerts);
}

function addAlert(userId, guildId, symbol, type, value) {
  const alerts = getAlerts();
  alertCounter++;
  const alert = {
    id: alertCounter,
    userId,
    guildId,
    symbol: symbol.toUpperCase(),
    type,
    value,
    triggered: false,
    createdAt: Date.now(),
  };
  alerts.push(alert);
  saveAlerts(alerts);
  return alert;
}

function removeAlert(alertId, userId) {
  const alerts = getAlerts();
  const index = alerts.findIndex(a => a.id === alertId && a.userId === userId);
  if (index === -1) return null;
  const [removed] = alerts.splice(index, 1);
  saveAlerts(alerts);
  return removed;
}

function getUserAlerts(userId) {
  return getAlerts().filter(a => a.userId === userId && !a.triggered);
}

function clearUserAlerts(userId) {
  const alerts = getAlerts();
  const remaining = alerts.filter(a => a.userId !== userId);
  const removed = alerts.length - remaining.length;
  saveAlerts(remaining);
  return removed;
}

function getActiveAlerts() {
  return getAlerts().filter(a => !a.triggered);
}

function markTriggered(alertId) {
  const alerts = getAlerts();
  const alert = alerts.find(a => a.id === alertId);
  if (alert) {
    alert.triggered = true;
    saveAlerts(alerts);
  }
  return alert;
}

module.exports = {
  getAlerts,
  addAlert,
  removeAlert,
  getUserAlerts,
  clearUserAlerts,
  getActiveAlerts,
  markTriggered,
};
