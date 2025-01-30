const express = require('express');
const bodyParser = require('body-parser');
const satori = require('satori').default;
const { readFileSync } = require('fs');
const { resolve } = require('path');
const cors = require('cors');
const sharp = require('sharp');
const { Pool } = require('pg');
const moment = require('moment'); // Moment.js can help parse the date strings
const patternImage = require('./assets/pattern');


const html = (...args) =>
    import('satori-html').then(({ html }) => html(...args));

const app = express();
app.use(bodyParser.json());
app.use(cors());

const fontDataRoboto = readFileSync(resolve(__dirname, './fonts/Roboto-Black.ttf'));
const fontDataExtenda = readFileSync(resolve(__dirname, './fonts/Extenda-40.ttf'));

const ashburton_sponsor = 'https://sportal-images.s3.ap-southeast-2.amazonaws.com/ashburton_sponsor.jpg';
const monash_sponsor = 'https://sportal-images.s3.ap-southeast-2.amazonaws.com/monash_sponsor.png';

// Use the connection string to connect to the remote PostgreSQL database
const pool = new Pool({
    connectionString: 'postgresql://sportal_database_user:6h6G3tE82CnKPjF5fXbFY4tT6ffZD3Aa@dpg-crn2e6l6l47c73a8ll0g-a.singapore-postgres.render.com/sportal_database',
    ssl: {
        rejectUnauthorized: false, // Required to connect to some remote servers
    }
});

function shortenName(name, maxLength) {
    if (name.length <= maxLength) {
        return name;
    }

    let shortened = name.slice(0, maxLength);

    // If the next character is a space or we are at the end of the string, return as is
    if (name[maxLength] === ' ' || name.length === maxLength) {
        return shortened;
    }

    // Otherwise, find the last space within the truncated part and cut off at the last word boundary
    if (shortened.includes(' ')) {
        return shortened.slice(0, shortened.lastIndexOf(' '));
    }

    return shortened;
}

async function fetchDesignSettings(email) {
    initialSettings = ['', '', '']

    try {
        // Query the PostgreSQL database using the provided email
        const queryText = 'SELECT primary_color, secondary_color, font FROM clubs_dirty WHERE email = $1';
        const { rows } = await pool.query(queryText, [email]);

        // Check if the query returned any rows
        if (rows.length > 0) {
            console.log(rows[0])
            initialSettings[0] = rows[0].primary_color
            initialSettings[1] = rows[0].secondary_color
            initialSettings[2] = rows[0].font
        }

    } catch (err) {
        console.error('Error fetching club data:', err);
        res.status(500).send('An error occurred while fetching the club data');
    }



    return initialSettings;
}

function hexToRgba(hex, opacity) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

app.post('/generate-gameday-image', async (req, res) => {
    const { competitionName, teamALogoUrl, teamA, teamB, teamBLogoUrl, gameFormat, gameDate, gameVenue, sponsor1LogoUrl, associationLogo, userEmail } = req.body;

    const maxLength = 27;
    const shortTeamA = shortenName(teamA, maxLength);
    const shortTeamB = shortenName(teamB, maxLength);

    const gameVenueParts = gameVenue.split('/');
    const shortGameVenue = gameVenueParts[0].trim();

    const [primaryColor, secondaryColor, fontFamily] = await fetchDesignSettings(userEmail);

    var sponsorLogo = '';
    if(userEmail == 'test@ashburton.com' || 'timmurphy1181@gmail.com'){
        sponsorLogo = ashburton_sponsor;
    } else if (userEmail == 'test@monashcc.com'){
        sponsorLogo = monash_sponsor;
    }


    markupString = `
<div style="border-bottom: 30px solid ${primaryColor}; font-family: ${fontFamily}; border-right: 30px solid ${primaryColor}; height: 1000px; width: 1000px; background-color: ${secondaryColor}; padding-left: 50px; padding-top: 20px; overflow: hidden; position: relative; display: flex; flex-direction: column">
    <!--TOP TITLE-->
    <div style="display: flex; flex-direction: column">
        <img src="${associationLogo}" style="width: 100px; position: absolute; top: 20px; right: 20px;" />
    </div>
    ${sponsorLogo != ''
        ? `<div style="display: flex; flex-direction: column">
                <img src="${sponsorLogo}" style="width: 160px; position: absolute; top: 800px; right: 20px;" />
              </div>`
        : ''}
    <div style="color: ${primaryColor}; display: flex; flex-direction: column">
        <h1 style="margin-bottom: 0px; font-size: 100;">GAMEDAY</h1>
        <h4 style="color: grey; margin-top: 0; font-size: 50">${competitionName}</h4>
    </div>

    <!-- MIDDLE SECTION -->
   <div style="display: flex; margin-top: 40px;">
        <img src="${teamALogoUrl}" style="width: 160px; border: 4px solid white; margin-right: 10px" />
        <img src="${teamBLogoUrl}" style="width: 160px; border: 4px solid white; margin-right: 10px" />
        <div style="display: flex; background-color: rgba(255, 255, 255, 0.2); border-radius: 40px; padding: 2px 12px; font-size: 24px; color: white; margin-top: 120px">
            ${gameFormat}
        </div>
    </div>

    <div style="color: ${primaryColor}; display: flex; flex-direction: column">
        <h1 style="margin-bottom: 0px; font-size: 60;">${shortTeamA}</h1> 
        <h1 style="margin-bottom: 0px; margin-top: 0; font-size: 60;">${shortTeamB}</h1>
        <h2 style="color: grey; margin-top: 20; margin-bottom: 0px; font-size: 40;">${gameDate}</h2>
        <h2 style="color: grey; margin-top: 0; font-size: 40;">${shortGameVenue}</h2>
    </div>
</div>`;

    const markup = await html(markupString);


    const svg = await satori(
        markup,
        {
            width: 1000,
            height: 1000,
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
                }
            ],
        },
    )

    const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();

    // Respond with the generated SVG
    res.setHeader('Content-Type', 'image/png');
    res.send(pngBuffer);
});

app.post('/generate-players-image', async (req, res) => {
    const { teamALogoUrl, teamA, teamB, teamBLogoUrl, gameDate, sponsor1LogoUrl, userEmail, playerList, fixtureName, gameFormat } = req.body;

    const maxLength = 25;
    const shortTeamA = shortenName(teamA, maxLength);
    const shortTeamB = shortenName(teamB, maxLength);

    const [primaryColor, secondaryColor, fontFamily] = await fetchDesignSettings(userEmail)

    const playerListFiltered = playerList.filter(player => player.toLowerCase() !== "fill-in");

    var sponsorLogo = '';
    if(userEmail == 'test@ashburton.com'){
        sponsorLogo = ashburton_sponsor;
    } else if (userEmail == 'test@monashcc.com'){
        sponsorLogo = monash_sponsor;
    }

    // Generate player cards HTML from the player list
    const playerCardsArray = await Promise.all(playerListFiltered.map(async (player) => `
    <div style="padding: 4px; display: flex; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
        <h3 style="margin: 0; color: white; font-size:50px">${player}</h3>
    </div>
`));

    // Join the resolved array into a single string
    const playerCards = playerCardsArray.join('').toString();

    const shadowColor = hexToRgba(primaryColor, 0.5);

    markupString = `<div style="position: relative; font-family: ${fontFamily}; height: 1200px; width: 1200px; background: url('https://sportal-images.s3.ap-southeast-2.amazonaws.com/square_pattern.png'); background-repeat: no-repeat; background-color: ${secondaryColor}; overflow: hidden; display: flex; flex-direction: column; padding: 40px;">
    <!-- Pseudo-element for border with rounded top corners -->
    <div style="
        content: '';
        position: absolute;
        top: 1150px;
        left: 0;
        right: 0;
        height: 50px;
        background-color: ${primaryColor};
        border-top-left-radius: 50px;
        border-top-right-radius: 50px;
        z-index: 1;
        display: flex;
    "></div>

    ${sponsorLogo != ''
        ? `<div style="display: flex; flex-direction: column">
                <img src="${sponsorLogo}" style="width: 320px; position: absolute; top: 900px; right: 75px;" />
              </div>`
        : ''}

    <!-- Title and Team Card Row Container -->
    <div style="z-index: 2; display: flex; gap: 30px;">
        <!-- Title Section -->
        <h1 style="font-size: 200px; margin-top: 0; color: ${primaryColor}; font-family: Extenda; text-shadow: 14px 10px ${shadowColor};">STARTING XI</h1>

        <!-- Combined Card Section -->
        <div style="display: flex; flex-direction: column; gap: 10px;">
            <!-- Team Card Section -->
            <div style="background-color: rgba(255, 255, 255, 0.1); color: ${primaryColor}; display: flex; flex-direction: column; align-items: flex-start; padding: 30px; width: 520px; border-radius: 30px;">
                <!-- Team Logos -->
                <div style="display: flex; gap: 40px; margin-bottom: 20px;">
                    <img src="${teamALogoUrl}" style="width: 160px; border: 4px solid white;" />
                    <img src="${teamBLogoUrl}" style="width: 160px; border: 4px solid white;" />
                </div>

                <!-- Team Names aligned left at the very start of the card -->
                <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 10px;">
                    <h2 style="margin: 0; font-size: 40px;">${shortTeamA}</h2>
                    <h2 style="margin: 0; font-size: 40px;">${shortTeamB}</h2>
                </div>
            </div>

            <!-- Small Cards Section, positioned directly below the main card -->
            <div style="display: flex; gap: 20px;">
                <!-- Small Card 1 -->
                <div style="background-color: rgba(255, 255, 255, 0.1); border-radius: 20px; padding: 20px; width: 250px; display: flex; align-items: center; justify-content: center;">
                    <span style="color: ${primaryColor}; font-size: 24px;">${fixtureName}</span>
                </div>
                <!-- Small Card 2 -->
                <div style="background-color: rgba(255, 255, 255, 0.1); border-radius: 20px; padding: 20px; width: 250px; display: flex; align-items: center; justify-content: center;">
                    <span style="color: ${primaryColor}; font-size: 24px;">${gameFormat}</span>
                </div>
            </div>
        </div>
    </div>

    <div style="flex: 1; padding-top: 0; margin-top: -200px; display: flex; flex-direction: column;">
        ${playerCards}
    </div>

    <!-- Bottom-right tilted rectangle -->
    <div style="
        position: absolute;
        bottom: 4px;
        right: -20px;
        width: 120px;
        height: 500px;
        background-color: ${primaryColor};
        transform: rotate(-7deg);
        display: flex;
    "></div>
</div>
`
    const markup = await html(markupString);


    const svg = await satori(
        markup,
        {
            width: 1200,
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
                }
            ],
        },
    )

    const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();

    // Respond with the generated SVG
    res.setHeader('Content-Type', 'image/png');
    res.send(pngBuffer);
});

app.get('/get-club-info/:email', async (req, res) => {
    const email = req.params.email;

    try {
        // Query the PostgreSQL database using the provided email
        const queryText = 'SELECT * FROM clubs_dirty WHERE email = $1';
        const { rows } = await pool.query(queryText, [email]);

        // Check if the query returned any rows
        if (rows.length === 0) {
            return res.status(404).send('Club not found for the given email');
        }

        console.log(rows[0])

        // Send the club data as the response
        const clubDataRaw = rows[0].clubdata;

        const clubData = cleanUpClubData(clubDataRaw, false);

        res.json(clubData);

    } catch (err) {
        console.error('Error fetching club data:', err);
        res.status(500).send('An error occurred while fetching the club data');
    }
});

app.get('/get-club-info-player-filter/:email', async (req, res) => {
    const email = req.params.email;

    try {
        // Query the PostgreSQL database using the provided email
        const queryText = 'SELECT * FROM clubs_dirty WHERE email = $1';
        const { rows } = await pool.query(queryText, [email]);

        // Check if the query returned any rows
        if (rows.length === 0) {
            return res.status(404).send('Club not found for the given email');
        }

        console.log(rows[0])

        // Send the club data as the response
        const clubDataRaw = rows[0].clubdata;

        const clubData = cleanUpClubData(clubDataRaw, true);

        res.json(clubData);

    } catch (err) {
        console.error('Error fetching club data:', err);
        res.status(500).send('An error occurred while fetching the club data');
    }
});


function cleanUpClubData(clubData, filterByPlayerList) {
    // Helper function to check if a fixture is within the next 14 days
    const isWithinNext14Days = (fixtureDateString) => {
        // Parse the date string to a moment object
        const fixtureDate = moment(fixtureDateString, "dddd, DD MMMM YYYY");
        const today = moment(); // Get today's date
        const fourteenDaysFromNow = moment().add(14, 'days');
        const fourteendaysbefore = moment().subtract(14, 'days');

        // Check if the fixture date is within the next 14 days
        return fixtureDate.isBetween(today, fourteenDaysFromNow, 'days', '[]');
    };

    // Clean up fixtures by removing those with "Unknown Fixture" names and those outside the next 14 days
    const cleanUpFixtures = (teams) => {
        return teams.map(team => {
            team.fixtures = team.fixtures.filter(fixture =>
                fixture.fixtureName !== "Unknown Fixture" &&
                isWithinNext14Days(fixture.fixtureDate) &&
                (
                    !filterByPlayerList || // If the filterByPlayerList is false, skip this condition
                    (fixture.playerList && fixture.playerList.length >= 3) // Only apply the playerList filter if the flag is true
                )
            );
            return team;
        }).filter(team => team.fixtures && team.fixtures.length > 0); // Only keep teams with valid fixtures
    };

    // Clean up teams by removing those with empty fixtures
    const cleanUpTeams = (seasons) => {
        return seasons.map(season => {
            season.teams = cleanUpFixtures(season.teams);
            return season;
        }).filter(season => season.teams && season.teams.length > 0); // Only keep seasons with valid teams
    };

    // Clean up seasons by removing those with empty teams
    const cleanUpSeasons = (competitions) => {
        return competitions.map(competition => {
            competition.seasons = cleanUpTeams(competition.seasons);
            return competition;
        }).filter(competition => competition.seasons && competition.seasons.length > 0); // Only keep competitions with valid seasons
    };

    // Clean up competitions by removing those with empty seasons
    const cleanUpCompetitions = (associations) => {
        return associations.map(association => {
            association.competitions = cleanUpSeasons(association.competitions);
            return association;
        }).filter(association => association.competitions && association.competitions.length > 0); // Only keep associations with valid competitions
    };

    // Clean up the associations in the club data
    clubData.association = cleanUpCompetitions(clubData.association);

    return clubData;
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
