/**
 * PlayHQ API Service
 * Handles all interactions with the PlayHQ API
 */

const BASE_URL = 'https://api.playhq.com';

/**
 * Get the largest logo from the logo sizes array
 */
function getLargestLogo(logoObject) {
  if (!logoObject || !logoObject.sizes || logoObject.sizes.length === 0) {
    return null;
  }
  
  // Sort by width (descending) and return the URL of the largest
  const sortedLogos = logoObject.sizes.sort((a, b) => {
    const widthA = parseInt(a.dimensions?.width) || 0;
    const widthB = parseInt(b.dimensions?.width) || 0;
    return widthB - widthA;
  });
  
  return sortedLogos[0]?.url || null;
}

/**
 * Make a request to PlayHQ API
 */
async function makePlayHQRequest(endpoint, apiKey, tenant = 'ca') {
  try {
    const response = await fetch(endpoint, {
      headers: {
        'Accept': 'application/json',
        'x-api-key': apiKey,
        'x-phq-tenant': tenant
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`PlayHQ API Error (${response.status}):`, errorText);
      throw new Error(`PlayHQ API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('PlayHQ request failed:', error.message);
    throw error;
  }
}

/**
 * Fetch all seasons for an organization
 */
async function fetchSeasons(organizationId, apiKey, tenant) {
  console.log(`Fetching seasons for organization: ${organizationId}`);
  const endpoint = `${BASE_URL}/v1/organisations/${organizationId}/seasons`;
  return await makePlayHQRequest(endpoint, apiKey, tenant);
}

/**
 * Fetch teams for a season (single page)
 */
async function fetchTeamsForSeason(seasonId, apiKey, tenant, cursor = null) {
  console.log(`Fetching teams for season: ${seasonId}${cursor ? ` (cursor: ${cursor})` : ''}`);
  
  const url = new URL(`${BASE_URL}/v1/seasons/${seasonId}/teams`);
  if (cursor) {
    url.searchParams.set('cursor', cursor);
  }

  return await makePlayHQRequest(url.toString(), apiKey, tenant);
}

/**
 * Fetch ALL teams for a season (handles pagination automatically)
 */
async function fetchAllTeamsForSeason(seasonId, apiKey, tenant) {
  let allTeams = [];
  let cursor = null;

  do {
    const response = await fetchTeamsForSeason(seasonId, apiKey, tenant, cursor);
    allTeams.push(...(response.data || []));
    
    cursor = response.metadata?.hasMore ? response.metadata.nextCursor : null;
  } while (cursor);

  console.log(`✓ Fetched ${allTeams.length} total teams for season ${seasonId}`);
  return allTeams;
}

/**
 * Fetch fixtures for a team (single page)
 */
async function fetchFixturesForTeam(teamId, apiKey, tenant, cursor = null) {
  console.log(`Fetching fixtures for team: ${teamId}${cursor ? ` (cursor: ${cursor})` : ''}`);
  
  const url = new URL(`${BASE_URL}/v1/teams/${teamId}/fixture`);
  if (cursor) {
    url.searchParams.set('cursor', cursor);
  }

  try {
    return await makePlayHQRequest(url.toString(), apiKey, tenant);
  } catch (error) {
    console.warn(`Could not fetch fixtures for team ${teamId}:`, error.message);
    return { data: [], metadata: { hasMore: false } };
  }
}

/**
 * Fetch ALL fixtures for a team (handles pagination)
 */
async function fetchAllFixtures(teamId, apiKey, tenant) {
  let allFixtures = [];
  let cursor = null;

  do {
    const response = await fetchFixturesForTeam(teamId, apiKey, tenant, cursor);
    allFixtures.push(...(response.data || []));
    
    cursor = response.metadata?.hasMore ? response.metadata.nextCursor : null;
  } while (cursor);

  console.log(`   ✓ Fetched ${allFixtures.length} fixtures for team ${teamId}`);
  return allFixtures;
}

/**
 * Check if a fixture date is within the acceptable range (1 year back, 1 year forward)
 */
function isFixtureInDateRange(fixtureDate) {
  if (!fixtureDate) return false;
  
  const fixture = new Date(fixtureDate);
  const now = new Date();
  
  // 1 year ago
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(now.getFullYear() - 1);
  
  // 1 year from now
  const oneYearFromNow = new Date();
  oneYearFromNow.setFullYear(now.getFullYear() + 1);
  
  return fixture >= oneYearAgo && fixture <= oneYearFromNow;
}

/**
 * Fetch complete organization data (seasons → teams → fixtures)
 */
async function fetchCompleteOrgData(orgId, apiKey, tenant) {
  console.log('🔄 Fetching complete organization data from PlayHQ...');
  
  // 1. Fetch all seasons
  const seasonsResponse = await fetchSeasons(orgId, apiKey, tenant);
  const seasons = seasonsResponse.data || [];

  console.log(`Found ${seasons.length} seasons`);

  const processedSeasons = [];

  // 2. Process each season
  for (const season of seasons) {
    console.log(`\n📅 Processing season: ${season.name}`);

    // Fetch all teams for this season
    const allTeams = await fetchAllTeamsForSeason(season.id, apiKey, tenant);

    console.log(`   → Fetched ${allTeams.length} total teams for this season`);

    // Create a lookup map for ALL team logos (not just org teams)
    const teamLogoMap = {};
    allTeams.forEach(team => {
      teamLogoMap[team.id] = getLargestLogo(team.club?.logo);
    });

    // Filter teams belonging to this organization (using club.id)
    const orgTeams = allTeams.filter(team => 
      team.club?.id === orgId
    );

    console.log(`   → ${orgTeams.length} teams belong to your organization (club ID: ${orgId})`);

    // 3. Process each team
    const processedTeams = [];

    for (const team of orgTeams) {
      const teamName = team.grade?.name || 'Unknown Team';
      console.log(`   🏆 Processing team: ${teamName}`);

      // Fetch all fixtures for this team
      const allFixtures = await fetchAllFixtures(team.id, apiKey, tenant);
      
      // Filter fixtures to only include those within date range (1 year back/forward)
      const filteredFixtures = allFixtures.filter(f => 
        isFixtureInDateRange(f.schedule?.date)
      );
      
      console.log(`      → Filtered ${filteredFixtures.length}/${allFixtures.length} fixtures (within date range)`);

      // Only include team if it has fixtures in the date range
      if (filteredFixtures.length === 0) {
        console.log(`      → Skipping team (no fixtures in date range)`);
        continue;
      }

      processedTeams.push({
        teamId: team.id,
        teamName: teamName,
        gradeName: team.grade?.name || null,
        gradeUrl: team.grade?.url || null,
        clubName: team.club?.name || null,
        clubLogo: getLargestLogo(team.club?.logo),
        fixtures: filteredFixtures.map(f => {
          // Extract home and away teams from competitors
          const homeTeam = f.competitors?.find(c => c.isHomeTeam === true);
          const awayTeam = f.competitors?.find(c => c.isHomeTeam === false);
          
          // Look up team logos from the map we created
          const homeTeamLogo = homeTeam?.id ? teamLogoMap[homeTeam.id] : null;
          const awayTeamLogo = awayTeam?.id ? teamLogoMap[awayTeam.id] : null;
          
          return {
            fixtureId: f.id,
            status: f.status, // UPCOMING, COMPLETED, etc.
            url: f.url,
            
            // Round info
            roundName: f.round?.name || null,
            roundAbbr: f.round?.abbreviatedName || null,
            isFinalRound: f.round?.isFinalRound || false,
            
            // Grade info
            gradeName: f.grade?.name || null,
            gradeUrl: f.grade?.url || null,
            
            // Schedule
            date: f.schedule?.date || null,
            time: f.schedule?.time || null,
            timezone: f.schedule?.timezone || null,
            
            // Teams
            homeTeam: homeTeam?.name || null,
            homeTeamId: homeTeam?.id || null,
            homeTeamScore: homeTeam?.scoreTotal || null,
            homeTeamOutcome: homeTeam?.outcome || null,
            homeTeamLogo: homeTeamLogo,
            
            awayTeam: awayTeam?.name || null,
            awayTeamId: awayTeam?.id || null,
            awayTeamScore: awayTeam?.scoreTotal || null,
            awayTeamOutcome: awayTeam?.outcome || null,
            awayTeamLogo: awayTeamLogo,
            
            // Venue
            venueName: f.venue?.name || null,
            venueSurface: f.venue?.surfaceName || null,
            venueAddress: f.venue?.address ? 
              `${f.venue.address.line1}, ${f.venue.address.suburb}, ${f.venue.address.state} ${f.venue.address.postcode}` 
              : null,
          };
        })
      });
    }

    // Only include season if it has teams with fixtures
    if (processedTeams.length > 0) {
      processedSeasons.push({
        seasonId: season.id,
        seasonName: season.name,
        competitionName: season.competition?.name || null,
        competitionId: season.competition?.id || null,
        associationName: season.association?.name || null,
        associationId: season.association?.id || null,
        associationLogo: getLargestLogo(season.association?.logo),
        teams: processedTeams
      });
    } else {
      console.log(`   ⚠️  Skipping season (no teams with fixtures in date range)`);
    }
  }

  console.log('✅ Complete organization data fetched successfully');
  console.log(`   📊 ${processedSeasons.length} seasons with fixtures in date range`);
  console.log(`   📊 ${processedSeasons.reduce((acc, s) => acc + s.teams.length, 0)} teams total`);
  console.log(`   📊 ${processedSeasons.reduce((acc, s) => acc + s.teams.reduce((a, t) => a + t.fixtures.length, 0), 0)} fixtures total\n`);

  return {
    seasons: processedSeasons,
    totalSeasons: processedSeasons.length,
    totalTeams: processedSeasons.reduce((acc, s) => acc + s.teams.length, 0),
    totalFixtures: processedSeasons.reduce((acc, s) => acc + s.teams.reduce((a, t) => a + t.fixtures.length, 0), 0),
    dateRange: {
      from: new Date(new Date().setFullYear(new Date().getFullYear() - 1)).toISOString().split('T')[0],
      to: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0]
    }
  };
}

module.exports = {
  fetchSeasons,
  fetchTeamsForSeason,
  fetchAllTeamsForSeason,
  fetchFixturesForTeam,
  fetchAllFixtures,
  fetchCompleteOrgData
};