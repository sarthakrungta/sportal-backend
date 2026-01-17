require('dotenv').config();
const { Pool } = require('pg');

// Create PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test connection
pool.on('connect', () => {
  console.log('📦 Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected database error:', err);
  process.exit(-1);
});

// ==================== ORGANIZATION QUERIES ====================

/**
 * Get organization by email
 */
async function getOrgByEmail(email) {
  try {
    const result = await pool.query(
      'SELECT * FROM organizations WHERE email = $1',
      [email]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('Database error in getOrgByEmail:', error);
    throw error;
  }
}

/**
 * Update organization cache
 */
async function updateOrgCache(orgId, cacheData) {
  try {
    const result = await pool.query(
      'UPDATE organizations SET cache_json = $1, cache_updated_at = NOW() WHERE org_id = $2 RETURNING *',
      [JSON.stringify(cacheData), orgId]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('Database error in updateOrgCache:', error);
    throw error;
  }
}

/**
 * Check if cache is fresh
 */
function isCacheFresh(cacheUpdatedAt, hoursToLive = 6) {
  if (!cacheUpdatedAt) return false;
  
  const cacheAge = Date.now() - new Date(cacheUpdatedAt).getTime();
  const maxAge = hoursToLive * 60 * 60 * 1000;
  
  return cacheAge < maxAge;
}

// ==================== IMAGE GENERATION LOGS ====================

/**
 * Log image generation
 */
async function logImageGeneration(userEmail, templateName) {
  try {
    await pool.query(
      'INSERT INTO image_generation_logs (user_email, selected_template) VALUES ($1, $2)',
      [userEmail, templateName]
    );
  } catch (error) {
    console.error('Database error in logImageGeneration:', error);
    // Don't throw - logging failures shouldn't break image generation
  }
}

module.exports = {
  pool,
  getOrgByEmail,
  updateOrgCache,
  isCacheFresh,
  logImageGeneration
};