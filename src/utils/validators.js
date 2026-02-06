/**
 * Validate a crypto symbol (1-10 uppercase letters).
 * @param {string} symbol
 * @returns {boolean}
 */
function isValidSymbol(symbol) {
  if (!symbol || typeof symbol !== 'string') return false;
  return /^[A-Z0-9]{1,10}$/.test(symbol.toUpperCase().trim());
}

/**
 * Validate an update interval in minutes (5-60).
 * @param {number} minutes
 * @returns {boolean}
 */
function isValidInterval(minutes) {
  return Number.isInteger(minutes) && minutes >= 5 && minutes <= 60;
}

/**
 * Validate an alert threshold percentage (0.1-100).
 * @param {number} percent
 * @returns {boolean}
 */
function isValidThreshold(percent) {
  return typeof percent === 'number' && percent >= 0.1 && percent <= 100;
}

/**
 * Validate a price target (positive number).
 * @param {number} price
 * @returns {boolean}
 */
function isValidPrice(price) {
  return typeof price === 'number' && price > 0 && isFinite(price);
}

/**
 * Sanitize a string input (remove special chars, limit length).
 * @param {string} input
 * @param {number} maxLength
 * @returns {string}
 */
function sanitize(input, maxLength = 100) {
  if (!input || typeof input !== 'string') return '';
  return input.replace(/[<>@&]/g, '').trim().substring(0, maxLength);
}

module.exports = {
  isValidSymbol,
  isValidInterval,
  isValidThreshold,
  isValidPrice,
  sanitize,
};
