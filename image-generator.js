const fs = require('fs');
const path = require('path');
const satori = require('satori');
const sharp = require('sharp');
const { html } = require('@vercel/og');

// ==================== LOAD FONTS ====================

let fontDataExtenda, fontDataRoboto, fontDataLuckiest;

try {
  fontDataExtenda = fs.readFileSync(path.join(__dirname, 'fonts', 'Extenda.ttf'));
  fontDataRoboto = fs.readFileSync(path.join(__dirname, 'fonts', 'Roboto-Regular.ttf'));
  fontDataLuckiest = fs.readFileSync(path.join(__dirname, 'fonts', 'LuckiestGuy-Regular.ttf'));
  console.log('✅ Fonts loaded successfully');
} catch (error) {
  console.error('❌ Error loading fonts:', error.message);
  console.error('Make sure you have a fonts/ folder with the required font files');
}

// ==================== FONT CONFIG ====================

const FONT_CONFIG = [
  {
    name: 'Extenda',
    data: fontDataExtenda,
    weight: 400,
    style: 'normal',
  },
  {
    name: 'Roboto',
    data: fontDataRoboto,
    weight: 400,
    style: 'normal',
  },
  {
    name: 'Luckiest',
    data: fontDataLuckiest,
    weight: 400,
    style: 'normal',
  }
];

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

/**
 * Generate PNG from HTML markup using Satori
 */
async function generateImageFromMarkup(markupString, width = 1000, height = 1200) {
  try {
    // Convert HTML string to markup
    const markup = await html(markupString);

    // Generate SVG using Satori
    const svg = await satori(markup, {
      width,
      height,
      fonts: FONT_CONFIG
    });

    // Convert SVG to PNG using Sharp
    const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();

    return pngBuffer;
  } catch (error) {
    console.error('Error generating image:', error);
    throw error;
  }
}

module.exports = {
  generateImageFromMarkup,
  shortenName,
  isAflClub,
  FONT_CONFIG
};