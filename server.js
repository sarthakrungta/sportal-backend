require('dotenv').config();
const express = require('express');
const cors = require('cors');
const satori = require('satori').default;
const html = (...args) => import('satori-html').then(({ html }) => html(...args));
const { readFileSync } = require('fs');
const { resolve } = require('path');
const sharp = require('sharp');


// Import modules
const { getOrgByEmail, updateOrgCache, isCacheFresh, logImageGeneration } = require('./database');
const { fetchCompleteOrgData, fetchFixtureSummary, fetchLadderForGrade, fetchGradesForSeason } = require('./playhq');
const { shortenName, isAflClub } = require('./image-generator');

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

const fontDataRoboto = readFileSync(resolve(__dirname, './fonts/Roboto-Black.ttf'));
const fontDataExtenda = readFileSync(resolve(__dirname, './fonts/Extenda-40.ttf'));
const fontDataLuckiest = readFileSync(resolve(__dirname, './fonts/LuckiestGuy-Regular.ttf'))


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

    // Check if cache exists (regardless of freshness)
    if (org.cache_json) {
      console.log('✓ Returning cached data (SWR Strategy)');

      // Send response IMMEDIATELY
      res.json({
        ...org.cache_json,
        source: 'cache',
        lastUpdated: org.cache_updated_at,
        isStale: !isCacheFresh(org.cache_updated_at, parseInt(process.env.CACHE_DURATION_HOURS) || 6)
      });

      // Background revalidation: If cache is stale, fetch fresh data asynchronously
      if (!isCacheFresh(org.cache_updated_at, parseInt(process.env.CACHE_DURATION_HOURS) || 6)) {
        console.log('⟳ Cache is stale - Triggering background refresh...');

        // This runs in background, response is already sent
        fetchCompleteOrgData(
          org.playhq_org_id,
          org.playhq_api_key,
          org.playhq_tenant
        ).then(async (freshData) => {
          await updateOrgCache(org.org_id, freshData);
          console.log(`✓ Background refresh complete for ${org.org_name}`);
        }).catch(err => {
          console.error(`❌ Background refresh failed for ${org.org_name}:`, err.message);
        });
      }

      return; // End request here
    }

    // No cache exists at all - must wait for fetch
    console.log('⟳ No cache found - fetching from PlayHQ...');
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
      clubLogo: org.club_logo || null,
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


    const markup = await html(markupString);

    const svg = await satori(
      markup,
      {
        width: 1000,
        height: 1200,
        fonts: [
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
        ],
      },
    );

    const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
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

app.post('/generate-starting-xi-image', async (req, res) => {
  const {
    teamALogoUrl,
    teamBLogoUrl,
    competitionName,
    teamA,
    teamB,
    gameFormat,
    fixtureId,
    userEmail,
    teamId,
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

    // Fetch fixture summary to get player list
    const fixtureSummary = await fetchFixtureSummary(fixtureId, org.playhq_api_key, org.playhq_tenant);

    if (!fixtureSummary) {
      return res.status(404).json({ error: 'Fixture summary not found' });
    }

    // Extract player appearances for your team
    const playerAppearances = fixtureSummary.appearances?.filter(a =>
      a.teamId === teamId &&
      a.visible !== false
    ) || [];

    // Format player names (firstName lastName)
    const playerList = playerAppearances.map(p =>
      `${p.firstName} ${p.lastName}`.trim()
    );

    console.log(`Found ${playerList.length} players for Starting XI`);

    if (playerList.length === 0) {
      return res.status(422).json({
        errorCode: 'NO_PLAYERS_FOUND',
        message:
          'No players found for this fixture. The team may not have published a lineup yet.',
      });
    }

    // Shorten team names
    const maxLength = 23;
    const shortTeamA = shortenName(teamA, maxLength);
    const shortTeamB = shortenName(teamB, maxLength);

    const isAfl = isAflClub(userEmail);

    // Generate player cards HTML
    const playerCardsArray = playerList.map(player => `
      <div style="padding: 4px; display: flex; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
        <h3 style="margin: 0; color: ${textColor}; font-size:${isAfl ? '2em' : '45px'}">${player}</h3>
      </div>
    `);

    const playerCardsLeft = playerCardsArray.slice(0, 12).join('');
    const playerCardsRight = playerCardsArray.slice(12).join('');

    // Generate HTML markup for AFL style
    const markupString = !isAfl ? `
<div style="position: relative; font-family: Luckiest; height: 1200px; width: 1000px; background: url('https://sportal-images.s3.ap-southeast-2.amazonaws.com/square_pattern.png'); background-repeat: no-repeat; background-color: ${primaryColor}; overflow: hidden; display: flex; justify-content: center; padding: 40px 20px;">
  <div style="display: flex; flex-direction: column; width: 100%; margin-top: 50px; margin-left: 120px">
    <h1 style="font-size: 6.5em; color: ${secondaryColor}; margin: 0 0 10px 0;">STARTING LINE UP</h1>
    
    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 40px;">
      <img src="${teamALogoUrl}" width="80" height="80" style="height: 80px; width: 80px; border: 2px solid ${secondaryColor}" />
      <img src="${teamBLogoUrl}" width="80" height="80" style="height: 80px; width: 80px; border: 2px solid ${secondaryColor}" />
      <div style="display: flex; flex-direction: column;">
        <span style="color: ${secondaryColor}; font-size: 35px;">${shortenName(teamA, 15)} vs ${shortenName(teamB, 15)}</span>
        <span style="color: ${textColor}; font-size: 35px;">${shortenName(competitionName, 45)}</span>
      </div>
    </div>

    <div style="display: flex; gap: 100px;">
      <div style="display: flex; flex-direction: column; gap: 10px;">${playerCardsLeft}</div>
      <div style="display: flex; flex-direction: column; gap: 10px;">${playerCardsRight}</div>
    </div>
  </div>

  <div style="position: absolute; display: flex; bottom: 330px; right: -15px; width: 50px; height: 100px;">
    <svg width="40" height="100"><polygon points="40,0 40,80 0,100 0,20" fill="${secondaryColor}"/></svg>
  </div>
  <div style="position: absolute; display: flex; bottom: 190px; right: -15px; width: 50px; height: 100px;">
    <svg width="40" height="100"><polygon points="40,0 40,80 0,100 0,20" fill="${secondaryColor}"/></svg>
  </div>
  <div style="position: absolute; display: flex; bottom: 50px; right: -15px; width: 50px; height: 100px;">
    <svg width="40" height="100"><polygon points="40,0 40,80 0,100 0,20" fill="${secondaryColor}"/></svg>
  </div>
  <div style="position: absolute; display: flex; top: 0px; left: -20px; width: 120px; height: 50px;">
    <svg width="120" height="40"><polygon points="20,0 120,0 100,40 0,40" fill="${secondaryColor}"/></svg>
  </div>
  <div style="position: absolute; display: flex; top: 0px; left: 130px; width: 110px; height: 50px;">
    <svg width="110" height="40"><polygon points="20,0 110,0 90,40 0,40" fill="${secondaryColor}"/></svg>
  </div>
  <div style="position: absolute; display: flex; top: 0px; left: 270px; width: 110px; height: 50px;">
    <svg width="110" height="40"><polygon points="20,0 110,0 90,40 0,40" fill="${secondaryColor}"/></svg>
  </div>
</div>
    ` : `
<div style="position: relative; font-family: Roboto; height: 1200px; width: 1200px; background: url('https://sportal-images.s3.ap-southeast-2.amazonaws.com/square_pattern.png'); background-repeat: no-repeat; background-color: ${secondaryColor}; overflow: hidden; display: flex; padding: 40px;">
  <div style="display: flex; width: 100%; height: 100%;">
    <div style="width: 620px; display: flex; flex-direction: column; gap: 20px;">
      <h1 style="font-size: 6.5em; color: ${textColor || secondaryColor}; font-family: Roboto; margin-top: 0;">STARTING XI</h1>
      <div style="flex: 1; padding-top: 0; margin-top: -40px; display: flex; flex-direction: column;">
        ${playerCardsArray.join('')}
      </div>
    </div>
    
    <div style="width: 580px; display: flex; flex-direction: column; gap: 20px;">
      <div style="background-color: rgba(255, 255, 255, 0.1); color: ${primaryColor}; display: flex; flex-direction: column; padding: 30px; width: 520px; border-radius: 30px;">
        <div style="display: flex; gap: 40px; margin-bottom: 20px;">
          <img src="${teamALogoUrl}" style="width: 160px; border: 4px solid white;" />
          <img src="${teamBLogoUrl}" style="width: 160px; border: 4px solid white;" />
        </div>
        <div style="display: flex; flex-direction: column; gap: 10px;">
          <h2 style="margin: 0; font-size: 40px;">${shortTeamA}</h2>
          <h2 style="margin: 0; font-size: 40px;">${shortTeamB}</h2>
        </div>
      </div>
      
      <div style="display: flex; gap: 20px;">
        <div style="background-color: rgba(255, 255, 255, 0.1); border-radius: 20px; padding: 20px; width: 250px; display: flex; align-items: center; justify-content: center;">
          <span style="color: ${primaryColor}; font-size: 24px;">${gameFormat}</span>
        </div>
      </div>
    </div>
  </div>
</div>
    `;

    const markup = await html(markupString);

    const svg = await satori(
      markup,
      {
        width: !isAfl ? 1000 : 1200,
        height: 1200,
        fonts: [
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
        ],
      },
    )

    // Generate PNG image
    const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
    // Log image generation
    await logImageGeneration(userEmail, 'Gameday Template');

    // Send image
    res.setHeader('Content-Type', 'image/png');
    res.send(pngBuffer);

  } catch (error) {
    console.error('❌ Error generating Starting XI image:', error);
    res.status(500).json({ error: 'Failed to generate image', message: error.message });
  }
});

/**
 * POST /generate-ladder-image
 */
app.post('/generate-ladder-image', async (req, res) => {
  const { teamId, userEmail } = req.body;

  if (!teamId || !userEmail) {
    return res.status(400).json({ error: 'teamId and userEmail are required' });
  }

  try {
    // 1. Get Org Data to find the team and grade info
    const org = await getOrgByEmail(userEmail);
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    // Use cached data if available, otherwise fetch
    let orgData = org.cache_json;
    if (!orgData) {
      orgData = await fetchCompleteOrgData(org.playhq_org_id, org.playhq_api_key, org.playhq_tenant);
      await updateOrgCache(org.org_id, orgData);
    }

    // 2. Find the team in the org data
    let targetTeam = null;
    let targetSeason = null;

    // Search through seasons and teams
    for (const season of (orgData.seasons || [])) {
      const foundTeam = season.teams?.find(t => t.teamId === teamId);
      if (foundTeam) {
        targetTeam = foundTeam;
        targetSeason = season;
        break;
      }
    }

    if (!targetTeam) {
      return res.status(404).json({ error: 'Team not found in organization data' });
    }

    // 3. Resolve Grade ID
    let gradeId = targetTeam.gradeId;
    const gradeName = targetTeam.gradeName;

    // If gradeId is missing, try to fetch grades for the season and match by name
    if (!gradeId && targetSeason && gradeName) {
      console.log(`Grade ID missing for ${gradeName}, fetching grades for season...`);
      const gradesResponse = await fetchGradesForSeason(targetSeason.seasonId, org.playhq_api_key, org.playhq_tenant);
      const grades = gradesResponse.data || [];
      const matchedGrade = grades.find(g => g.name === gradeName);
      if (matchedGrade) {
        gradeId = matchedGrade.id;
        console.log(`✓ Found grade ID: ${gradeId}`);
      }
    }

    if (!gradeId) {
      return res.status(404).json({ error: 'Could not resolve Grade ID' });
    }

    // 4. Fetch Ladder Data
    const ladderResponse = await fetchLadderForGrade(gradeId, org.playhq_api_key, org.playhq_tenant);

    // The API might return an object with `ladders` array or just the ladder data?
    // User example response: { gradeId: "...", ladders: [...] }
    const ladders = ladderResponse.ladders || [];

    // We need to pick the right ladder if there are multiple (e.g. pools)
    // For now, we'll try to find one that contains our team
    let ladder = ladders.find(l =>
      l.standings?.some(s => s.team?.id === teamId)
    );

    // If not found by ID (maybe ID mismatch?), try name? Or just take the first one?
    if (!ladder && ladders.length > 0) {
      ladder = ladders[0];
    }

    if (!ladder) {
      return res.status(404).json({ error: 'No ladder data found for this grade' });
    }

    // 5. Prepare Data for Design
    const primaryColor = org.primary_color || '#1a1a1a';
    const secondaryColor = org.secondary_color || '#FFD700';
    const textColor = org.text_color || 'grey';
    const isAfl = isAflClub(userEmail);

    const headers = ladder.headers || [];
    const standings = ladder.standings || [];

    // Limit rows to top 10 or fit the design
    const topStandings = standings.slice(0, 12);

    // Generate HTML
    // We need a table-like layout.
    // Headers: Pos, Team, P, W, L, PTS, % (if avail)
    // We'll map the `values` array based on headers.

    // Find indices for key columns
    const idxPlayed = headers.findIndex(h => h.key === 'played');
    const idxWon = headers.findIndex(h => h.key === 'won');
    const idxLost = headers.findIndex(h => h.key === 'lost');
    const idxPts = headers.findIndex(h => h.key === 'competitionPoints') !== -1
      ? headers.findIndex(h => h.key === 'competitionPoints')
      : headers.findIndex(h => h.key === 'pointsTotal'); // Fallback

    // Create rows HTML
    const rowsHtml = topStandings.map((standing, index) => {
      const isMyTeam = standing.team?.id === teamId;
      const teamName = shortenName(standing.team?.name || '', 20);
      const played = idxPlayed !== -1 ? standing.values[idxPlayed] : '-';
      const won = idxWon !== -1 ? standing.values[idxWon] : '-';
      const lost = idxLost !== -1 ? standing.values[idxLost] : '-';
      const pts = idxPts !== -1 ? standing.values[idxPts] : '-';

      const rowBg = index % 2 === 0 ? `rgba(0, 0, 0, 0.1)` : `transparent`;
      const rowColor = isMyTeam ? secondaryColor : textColor;

      return `
        <div style="display: flex; align-items: center; background-color: ${rowBg}; padding: 8px 15px; border-radius: 8px; margin-bottom: 4px; font-size: 30px; color: ${textColor}">
           <div style="display: flex; width: 50px; font-weight: bold; color: ${secondaryColor}">${index + 1}</div>
           <div style="display: flex; flex: 1; font-weight: bold; color: ${secondaryColor}">${teamName}</div>
           <div style="display: flex; width: 60px; justify-content: center;">${played}</div>
           <div style="display: flex; width: 60px; justify-content: center;">${won}</div>
           <div style="display: flex; width: 60px; justify-content: center;">${lost}</div>
           <div style="display: flex; width: 80px; justify-content: center; color: ${secondaryColor}">${pts}</div>
        </div>
      `;
    }).join('');

    const markupString = `
    <div style="font-family: Roboto; height: 1200px; width: 1000px; background: url('https://sportal-images.s3.ap-southeast-2.amazonaws.com/square_pattern.png'); background-repeat: no-repeat; background-color: ${primaryColor}; padding: 50px; overflow: hidden; display: flex; flex-direction: column;">
        
        <!-- Header -->
        <div style="display: flex; flex-direction: column; margin-bottom: 30px;">
             <div style="display: flex; align-items: center; justify-content: space-between;">
                <h1 style="font-family: Luckiest; font-size: 6em; color: ${secondaryColor}; margin: 0;">LADDER</h1>
                <img src="${targetTeam.clubLogo || ''}" style="height: 120px; width: 120px; object-fit: contain;" />
             </div>
             <h2 style="font-family: Luckiest; font-size: 2.5em; color: gray; margin: 0;">${targetTeam.gradeName}</h2>
             <h3 style="font-family: Roboto; font-size: 1.5em; color: gray; margin: 0;">${targetSeason.seasonName}</h3>
        </div>

        <!-- Table Header -->
        <div style="display: flex; padding: 10px 15px; border-bottom: 2px solid ${secondaryColor}; font-size: 28px; color: ${secondaryColor}; font-family: Luckiest; margin-bottom: 10px;">
           <div style="display: flex; width: 50px;">#</div>
           <div style="display: flex; flex: 1;">TEAM</div>
           <div style="display: flex; width: 60px; justify-content: center;">P</div>
           <div style="display: flex; width: 60px; justify-content: center;">W</div>
           <div style="display: flex; width: 60px; justify-content: center;">L</div>
           <div style="display: flex; width: 80px; justify-content: center;">PTS</div>
        </div>

        <!-- Rows -->
        <div style="display: flex; flex-direction: column;">
            ${rowsHtml}
        </div>

         <!-- Footer Decoration -->
        <div style="display: flex; position: absolute; bottom: 0; right: 0; width: 150px; height: 150px;">
            <svg width="150" height="150" viewBox="0 0 100 100" preserveAspectRatio="none">
                <polygon points="100,0 100,100 0,100" fill="${secondaryColor}" opacity="0.8" />
            </svg>
        </div>
    </div>`;

    const markup = await html(markupString);
    const svg = await satori(
      markup,
      {
        width: 1000,
        height: 1200,
        fonts: [
          { name: 'Extenda', data: fontDataExtenda, weight: 400, style: 'normal' },
          { name: 'Roboto', data: fontDataRoboto, weight: 400, style: 'normal' },
          { name: 'Luckiest', data: fontDataLuckiest, weight: 400, style: 'normal' }
        ],
      },
    );

    const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
    await logImageGeneration(userEmail, 'Ladder Template');

    res.setHeader('Content-Type', 'image/png');
    res.send(pngBuffer);

  } catch (error) {
    console.error('❌ Error generating ladder image:', error);
    res.status(500).json({ error: 'Failed to generate ladder image', message: error.message });
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