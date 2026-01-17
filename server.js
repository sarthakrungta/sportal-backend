require('dotenv').config();
const express = require('express');
const cors = require('cors');

// Import modules
const { getOrgByEmail, updateOrgCache, isCacheFresh, logImageGeneration } = require('./database');
const { fetchCompleteOrgData } = require('./playhq');
const { generateImageFromMarkup, shortenName, isAflClub } = require('./image-generator');

const app = express();
const PORT = process.env.PORT || 3000;

// ==================== MIDDLEWARE ====================

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ==================== ROUTES ====================

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV 
  });
});

/**
 * GET /api/org-data
 * Fetch organization data (seasons, teams, fixtures)
 * Query params: userEmail (required)
 */
app.get('/api/org-data', async (req, res) => {
  const { userEmail } = req.query;

  if (!userEmail) {
    return res.status(400).json({ error: 'userEmail is required' });
  }

  try {
    // Get organization from database
    const org = await getOrgByEmail(userEmail);

    if (!org) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    console.log(`✓ Found organization: ${org.org_name}`);

    // Check if cache is fresh
    const cacheHours = parseInt(process.env.CACHE_DURATION_HOURS) || 6;
    
    if (org.cache_json && isCacheFresh(org.cache_updated_at, cacheHours)) {
      console.log('✓ Returning cached data');
      return res.json({
        ...org.cache_json,
        source: 'cache',
        lastUpdated: org.cache_updated_at
      });
    }

    // Fetch fresh data from PlayHQ
    console.log('⟳ Cache is stale - fetching from PlayHQ...');
    const orgData = await fetchCompleteOrgData(
      org.playhq_org_id, 
      org.playhq_api_key, 
      org.playhq_tenant
    );

    // Update cache
    await updateOrgCache(org.org_id, orgData);

    // Return fresh data
    res.json({
      ...orgData,
      source: 'playhq',
      lastUpdated: new Date()
    });

  } catch (error) {
    console.error('❌ Error in /api/org-data:', error);
    res.status(500).json({ 
      error: 'Failed to fetch organization data',
      message: error.message 
    });
  }
});

/**
 * POST /generate-gameday-image
 * Generate a gameday image using Satori
 */
app.post('/generate-gameday-image', async (req, res) => {
  const {
    competitionName,
    teamALogoUrl,
    teamA,
    teamB,
    teamBLogoUrl,
    gameFormat,
    gameDate,
    gameVenue,
    associationLogo,
    userEmail,
    fixtureId // Optional: for future live data fetching
  } = req.body;

  try {
    // Get organization design settings
    const org = await getOrgByEmail(userEmail);

    if (!org) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    // Get design settings with defaults
    const primaryColor = org.primary_color || '#1a1a1a';
    const secondaryColor = org.secondary_color || '#FFD700';
    const textColor = org.text_color || 'grey';
    const sponsorLogo = org.sponsor_logo_url || '';

    // Shorten team names if needed
    const maxLength = 27;
    const shortTeamA = shortenName(teamA, maxLength);
    const shortTeamB = shortenName(teamB, maxLength);

    // Extract venue name (before the slash)
    const gameVenueParts = gameVenue.split('/');
    const shortGameVenue = gameVenueParts[0].trim();

    const isAfl = isAflClub(userEmail);

    // Generate HTML markup
    const markupString = `
<div style="font-family: Luckiest; height: 1200px; width: 1000px; background: url('https://sportal-images.s3.ap-southeast-2.amazonaws.com/square_pattern.png'); background-repeat: no-repeat; background-color: ${primaryColor}; padding-left:100px; padding-top: 120px; overflow: hidden; position: relative; display: flex; flex-direction: column">
    <div style="display: flex; flex-direction: column">
        <img src="${associationLogo}" style="width: 140px; position: absolute; top: -100px; right: 20px;" />
    </div>
    ${sponsorLogo !== ''
        ? `<div style="display: flex; flex-direction: column">
            <img src="${sponsorLogo}" style="width: 200px; position: absolute; top: 800px; right: 400px;" />
          </div>`
        : ''}
    <div style="color: ${secondaryColor}; display: flex; flex-direction: column">
        <h1 style="margin-bottom: 0px; font-size: 6.5em;">GAMEDAY</h1>
        <h4 style="color: grey; margin-top: 0; font-size: 50">${isAfl ? '' : competitionName}</h4>
    </div>

    <div style="display: flex; margin-top: 40px;">
        <img src="${teamALogoUrl}" style="width: 190px; border: 4px solid white; margin-right: 10px" />
        <img src="${teamBLogoUrl}" style="width: 190px; border: 4px solid white; margin-right: 10px" />
        ${!isAfl ?
            `<div style="display: flex; align-items: center; background-color: rgba(255, 255, 255, 0.2); border-radius: 40px; padding: 2px 12px; font-size: 24px; color: white; margin-top: 120px">
                ${gameFormat}
            </div>`
            : ''
        }
    </div>

    <div style="color: ${secondaryColor}; display: flex; flex-direction: column; margin-top: 30px">
        <h1 style="margin-bottom: 0px; font-size: 60;">${shortTeamA}</h1> 
        <h1 style="margin-bottom: 0px; margin-top: 0; font-size: 60;">${shortTeamB}</h1>
        <h2 style="color: ${textColor}; margin-top: 40px; margin-bottom: 0px; font-size: 40;">${gameDate}</h2>
        <h2 style="color: ${textColor}; margin-top: 0; font-size: 40;">${shortGameVenue}</h2>
    </div>

    <div style="display: flex; position: absolute; bottom: 330px; right: -15px; width: 50px; height: 100px;">
        <svg width="40" height="100" xmlns="http://www.w3.org/2000/svg">
            <polygon points="40,0 40,80 0,100 0,20" fill="${secondaryColor}" />
        </svg>
    </div>

    <div style="display: flex; position: absolute; bottom: 190px; right: -15px; width: 50px; height: 100px;">
        <svg width="40" height="100" xmlns="http://www.w3.org/2000/svg">
            <polygon points="40,0 40,80 0,100 0,20" fill="${secondaryColor}" />
        </svg>
    </div>

    <div style="display: flex; position: absolute; bottom: 50px; right: -15px; width: 50px; height: 100px;">
        <svg width="40" height="100" xmlns="http://www.w3.org/2000/svg">
            <polygon points="40,0 40,80 0,100 0,20" fill="${secondaryColor}" />
        </svg>
    </div>

    <div style="display: flex; position: absolute; top: 0px; left: -20px; width: 120px; height: 50px;">
        <svg width="120" height="40" xmlns="http://www.w3.org/2000/svg">
            <polygon points="20,0 120,0 100,40 0,40" fill="${secondaryColor}" />
        </svg>
    </div>

    <div style="display: flex; position: absolute; top: 0px; left: 130px; width: 110px; height: 50px;">
        <svg width="110" height="40" xmlns="http://www.w3.org/2000/svg">
            <polygon points="20,0 110,0 90,40 0,40" fill="${secondaryColor}" />
        </svg>
    </div>

    <div style="display: flex; position: absolute; top: 0px; left: 270px; width: 110px; height: 50px;">
        <svg width="110" height="40" xmlns="http://www.w3.org/2000/svg">
            <polygon points="20,0 110,0 90,40 0,40" fill="${secondaryColor}" />
        </svg>
    </div>

    <div style="display: flex; position: absolute; top: 0px; left: 0px; width: 50px; height: 100px;">
        <svg width="40" height="100" xmlns="http://www.w3.org/2000/svg">
            <polygon points="40,0 40,80 0,100 0,20" fill="${secondaryColor}" />
        </svg>
    </div>

    <div style="display: flex; position: absolute; top: 140px; left: 0px; width: 50px; height: 100px;">
        <svg width="40" height="100" xmlns="http://www.w3.org/2000/svg">
            <polygon points="40,0 40,80 0,100 0,20" fill="${secondaryColor}" />
        </svg>
    </div>

    <div style="display: flex; position: absolute; top: 280px; left: 0px; width: 50px; height: 100px;">
        <svg width="40" height="100" xmlns="http://www.w3.org/2000/svg">
            <polygon points="40,0 40,80 0,100 0,20" fill="${secondaryColor}" />
        </svg>
    </div>
</div>`;

    // Generate PNG image
    const pngBuffer = await generateImageFromMarkup(markupString);

    // Log image generation
    await logImageGeneration(userEmail, 'Gameday Template');

    // Send image
    res.setHeader('Content-Type', 'image/png');
    res.send(pngBuffer);

  } catch (error) {
    console.error('❌ Error generating gameday image:', error);
    res.status(500).json({ error: 'Failed to generate image', message: error.message });
  }
});

// ==================== ERROR HANDLING ====================

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// ==================== START SERVER ====================

app.listen(PORT, () => {
  console.log('');
  console.log('🚀 ================================================');
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🚀 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🚀 Health check: http://localhost:${PORT}/health`);
  console.log('🚀 ================================================');
  console.log('');
});

module.exports = app;