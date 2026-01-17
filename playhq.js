/**
 * PlayHQ API Service
 * Handles all interactions with the PlayHQ API
 */

const BASE_URL = 'https://api.playhq.com';

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
 * Fetch fixtures for a team
 * Note: Update this endpoint when you find the correct one in PlayHQ docs
 */
async function fetchFixtures(teamId, apiKey, tenant) {
  console.log(`Fetching fixtures for team: ${teamId}`);
  const endpoint = `${BASE_URL}/teams/${teamId}/fixtures`;
  
  try {
    const response = await makePlayHQRequest(endpoint, apiKey, tenant);
    return response.data || response;
  } catch (error) {
    console.warn(`Could not fetch fixtures for team ${teamId}:`, error.message);
    return [];
  }
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

    // Filter teams belonging to this organization
    const orgTeams = allTeams.filter(team => 
      team.organisation?.id === orgId
    );

    console.log(`   → ${orgTeams.length} teams belong to your organization`);

    // 3. Process each team
    const processedTeams = [];

    for (const team of orgTeams) {
      console.log(`   🏆 Processing team: ${team.name}`);

      // Fetch fixtures for this team
      const fixtures = await fetchFixtures(team.id, apiKey, tenant);

      processedTeams.push({
        teamId: team.id,
        teamName: team.name,
        teamLogo: team.logos?.default || null,
        fixtures: fixtures.map(f => ({
          fixtureId: f.id,
          fixtureName: f.name || `${f.homeTeam} vs ${f.awayTeam}`,
          homeTeam: f.homeTeam,
          awayTeam: f.awayTeam,
          homeTeamLogo: f.homeTeamLogo || null,
          awayTeamLogo: f.awayTeamLogo || null,
          fixtureDate: f.date,
          venue: f.venue || null,
          competition: f.competition || null,
          format: f.format || null,
          status: f.status,
          associationLogo: f.associationLogo || null
        }))
      });
    }

    processedSeasons.push({
      seasonId: season.id,
      seasonName: season.name,
      teams: processedTeams
    });
  }

  console.log('✅ Complete organization data fetched successfully\n');

  return {
    seasons: processedSeasons,
    totalSeasons: processedSeasons.length,
    totalTeams: processedSeasons.reduce((acc, s) => acc + s.teams.length, 0)
  };
}

module.exports = {
  fetchSeasons,
  fetchTeamsForSeason,
  fetchAllTeamsForSeason,
  fetchFixtures,
  fetchCompleteOrgData
};