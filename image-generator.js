// ==================== HELPER FUNCTIONS ====================

/**
 * Shorten team name if too long
 */
function shortenName(name, maxLength = 27) {
  if (!name) return '';
  if (name.length <= maxLength) return name;
  return name.substring(0, maxLength - 3) + '...';
}

/**
 * Check if organization is an AFL club
 */
function isAflClub(userEmail) {
  // Add your AFL club detection logic here
  // For now, returning false
  return false;
}


module.exports = {
  shortenName,
  isAflClub,
};