const express = require('express');
const bodyParser = require('body-parser');
const satori = require('satori').default;
const { readFileSync } = require('fs');
const { resolve } = require('path');
const cors = require('cors');
const sharp = require('sharp');
const { Pool } = require('pg');

const html = (...args) =>
    import('satori-html').then(({ html }) => html(...args));

const app = express();
app.use(bodyParser.json());
app.use(cors());

// Load fonts
const fontDataRoboto = readFileSync(resolve(__dirname, './fonts/Roboto-Black.ttf'));
const fontDataExtenda = readFileSync(resolve(__dirname, './fonts/Extenda-40.ttf'));
const fontDataLuckiest = readFileSync(resolve(__dirname, './fonts/LuckiestGuy-Regular.ttf'));

const ashburton_sponsor = 'https://sportal-images.s3.ap-southeast-2.amazonaws.com/ashburton_sponsor.jpg';
const monash_sponsor = 'https://sportal-images.s3.ap-southeast-2.amazonaws.com/monash_sponsor.png';

// Database connection
const pool = new Pool({
    connectionString: 'postgresql://sportal_database_user:6h6G3tE82CnKPjF5fXbFY4tT6ffZD3Aa@dpg-crn2e6l6l47c73a8ll0g-a.singapore-postgres.render.com/sportal_database',
    ssl: {
        rejectUnauthorized: false,
    }
});

// ==================== PLAYHQ SERVICE ====================
class PlayHQService {
    constructor(apiKey, tenant = 'ca') {
        this.apiKey = apiKey;
        this.tenant = tenant;
        this.baseUrl = 'https://api.playhq.com';
    }

    async fetchSeasons(organizationId) {
        try {
            const response = await fetch(
                `${this.baseUrl}/v1/organisations/${organizationId}/seasons`,
                {
                    headers: {
                        'Accept': 'application/json',
                        'x-api-key': this.apiKey,
                        'x-phq-tenant': this.tenant
                    }
                }
            );

            if (!response.ok) {
                const errorText = await response.text();
                console.error('PlayHQ API Error Response:', errorText);
                throw new Error(`PlayHQ API error: ${response.status}`);
            }

            return response.json();
        } catch (error) {
            console.error('Error fetching seasons from PlayHQ:', error);
            throw error;
        }
    }

    async fetchTeamsForSeason(seasonId, cursor = null) {
        try {
            const url = new URL(`${this.baseUrl}/v1/seasons/${seasonId}/teams`);
            if (cursor) url.searchParams.set("cursor", cursor);

            const response = await fetch(url.toString(), {
                headers: {
                    'Accept': 'application/json',
                    'x-api-key': this.apiKey,
                    'x-phq-tenant': this.tenant
                }
            });

            if (!response.ok) {
                const err = await response.text();
                console.error('fetchTeamsForSeason failed:', err);
                throw new Error(`PlayHQ API error: ${response.status}`);
            }

            return response.json();
        } catch (error) {
            console.error('Error fetching teams for season:', error);
            throw error;
        }
    }


    async fetchFixtures(teamId) {
        try {
            const response = await fetch(
                `${this.baseUrl}/teams/${teamId}/fixtures`,
                {
                    headers: {
                        'Accept': 'application/json',
                        'x-api-key': this.apiKey,
                        'x-phq-tenant': this.tenant
                    }
                }
            );

            if (!response.ok) {
                throw new Error(`PlayHQ API error: ${response.status}`);
            }

            return response.json();
        } catch (error) {
            console.error('Error fetching fixtures from PlayHQ:', error);
            throw error;
        }
    }

    async fetchFixtureDetails(fixtureId) {
        try {
            const response = await fetch(
                `${this.baseUrl}/fixtures/${fixtureId}`,
                {
                    headers: {
                        'Accept': 'application/json',
                        'x-api-key': this.apiKey,
                        'x-phq-tenant': this.tenant
                    }
                }
            );

            if (!response.ok) {
                throw new Error(`PlayHQ API error: ${response.status}`);
            }

            return response.json();
        } catch (error) {
            console.error('Error fetching fixture details from PlayHQ:', error);
            throw error;
        }
    }
}

// ==================== HELPER FUNCTIONS ====================
async function getOrgByEmail(email) {
    try {
        const queryText = `
            SELECT org_id, org_name, playhq_org_id, playhq_api_key, 
                   primary_color, secondary_color, font_family, text_color, 
                   sponsor_logo_url, cache_json, cache_updated_at
            FROM organizations 
            WHERE user_email = $1
        `;
        const { rows } = await pool.query(queryText, [email]);

        if (rows.length === 0) {
            return null;
        }

        return rows[0];
    } catch (err) {
        console.error('Error fetching organization:', err);
        throw err;
    }
}

function shortenName(name, maxLength) {
    if (name.length <= maxLength) {
        return name;
    }

    let shortened = name.slice(0, maxLength);

    if (name[maxLength] === ' ' || name.length === maxLength) {
        return shortened;
    }

    if (shortened.includes(' ')) {
        return shortened.slice(0, shortened.lastIndexOf(' '));
    }

    return shortened;
}

function isAflClub(userEmail) {
    switch (userEmail) {
        case 'test@powerhouse.com':
            return true;
        default:
            return false;
    }
}

// ==================== API ENDPOINTS ====================

// Get organization data from PlayHQ
app.get('/api/org-data', async (req, res) => {
    const { userEmail } = req.query;

    if (!userEmail) {
        return res.status(400).json({ error: 'userEmail is required' });
    }

    try {
        // Get org from database
        const org = await getOrgByEmail(userEmail);

        if (!org) {
            return res.status(404).json({ error: 'Organization not found' });
        }

        // Check if we have cached data and if it's fresh
        /*if (org.cache_json && org.cache_updated_at) {
            const cacheAge = Date.now() - new Date(org.cache_updated_at).getTime();
            const SIX_HOURS = 6 * 60 * 60 * 1000;

            // If cache is fresh, return it
            if (cacheAge < SIX_HOURS) {
                return res.json({
                    teams: org.cache_json.teams,
                    source: 'cache',
                    lastUpdated: org.cache_updated_at
                });
            }
        }*/

        // Cache is stale or doesn't exist, fetch from PlayHQ
        const playhqService = new PlayHQService(org.playhq_api_key, 'ca');

        // 1. Fetch all seasons
        const seasonsRes = await playhqService.fetchSeasons(org.playhq_org_id);
        const seasons = seasonsRes.data || [];

        console.log("Fetched seasons:", seasons);

        const teamsWithFixtures = [];

        for (const season of seasons) {
            let cursor = null;
            let seasonTeams = [];

            // 2a. Teams API is paginated → fetch all pages
            do {
                const teamRes = await playhqService.fetchTeamsForSeason(season.id, cursor);
                seasonTeams.push(...teamRes.data);
                cursor = teamRes.metadata?.hasMore ? teamRes.metadata.nextCursor : null;
            } while (cursor);

            console.log(`Season ${season.name} → ${seasonTeams.length} teams`);

            // 2b. Filter teams belonging to *this user's organisation*
            const filteredTeams = seasonTeams.filter(team =>
                team.organisation?.id === org.playhq_org_id
            );

            console.log(`Filtered teams for org ${org.playhq_org_id}:`, filteredTeams);

            // 3. Fetch fixtures for each team
            for (const team of filteredTeams) {
                const fixtures = await playhqService.fetchFixtures(team.id);

                teamsWithFixtures.push({
                    teamId: team.id,
                    teamName: team.name,
                    teamLogo: team.logos?.default || '',
                    seasonName: season.name,
                    fixtures: fixtures.map(f => ({
                        fixtureId: f.id,
                        fixtureName: f.name || `${f.homeTeam} vs ${f.awayTeam}`,
                        homeTeam: f.homeTeam,
                        awayTeam: f.awayTeam,
                        homeTeamLogo: f.homeTeamLogo || '',
                        awayTeamLogo: f.awayTeamLogo || '',
                        fixtureDate: f.date,
                        gameVenue: f.venue || '',
                        competitionName: f.competition || '',
                        gameFormat: f.format || '',
                        status: f.status,
                        associationLogo: f.associationLogo || ''
                    }))
                });
            }
        }



        // Store in cache
        const cacheData = { teams: teamsWithFixtures };
        await pool.query(
            'UPDATE organizations SET cache_json = $1, cache_updated_at = NOW() WHERE org_id = $2',
            [JSON.stringify(cacheData), org.org_id]
        );

        res.json({
            teams: teamsWithFixtures,
            source: 'playhq',
            lastUpdated: new Date()
        });

    } catch (error) {
        console.error('Error fetching organization data:', error);
        res.status(500).json({ error: 'Failed to fetch organization data' });
    }
});

// Generate gameday image
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
        fixtureId // Optional: for fetching live data
    } = req.body;

    try {
        // Get org design settings
        const org = await getOrgByEmail(userEmail);

        if (!org) {
            return res.status(404).json({ error: 'Organization not found' });
        }

        const primaryColor = org.primary_color || '';
        const secondaryColor = org.secondary_color || '';
        const textColor = org.text_color || '';
        const sponsorLogo = org.sponsor_logo_url || '';

        const maxLength = 27;
        const shortTeamA = shortenName(teamA, maxLength);
        const shortTeamB = shortenName(teamB, maxLength);

        const gameVenueParts = gameVenue.split('/');
        const shortGameVenue = gameVenueParts[0].trim();

        const isAfl = isAflClub(userEmail);

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
        <h2 style="color: ${textColor == '' ? 'grey' : textColor}; margin-top: 40px; margin-bottom: 0px; font-size: 40;">${gameDate}</h2>
        <h2 style="color: ${textColor == '' ? 'grey' : textColor}; margin-top: 0; font-size: 40;">${shortGameVenue}</h2>
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
        const insertQuery = `INSERT INTO image_generation_logs (user_email, selected_template) VALUES ($1, $2)`;
        await pool.query(insertQuery, [userEmail, "Gameday template"]);

        res.setHeader('Content-Type', 'image/png');
        res.send(pngBuffer);

    } catch (err) {
        console.error('Error generating image:', err);
        res.status(500).json({ error: 'Failed to generate image' });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});