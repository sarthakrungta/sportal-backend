const express = require('express');
const bodyParser = require('body-parser');
const satori = require('satori').default;
const { readFileSync } = require('fs');
const { resolve } = require('path');
const cors = require('cors');
const sharp = require('sharp');
const { Pool } = require('pg');
const moment = require('moment'); // Moment.js can help parse the date strings



const html = (...args) =>
    import('satori-html').then(({ html }) => html(...args));

const app = express();
app.use(bodyParser.json());
app.use(cors());

const fontDataRoboto = readFileSync(resolve(__dirname, './fonts/Roboto-Black.ttf'));
const fontDataCooper = readFileSync(resolve(__dirname, './fonts/CooperHewitt-Book.otf'));

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

// Read the SVG file from the assets folder
const svgPattern = readFileSync('./assets/square_pattern.svg', 'utf-8');

// Encode the SVG for embedding in the HTML as a background
const encodedSvg = encodeURIComponent(svgPattern);


app.post('/generate-gameday-image', async (req, res) => {
    const { competitionName, teamALogoUrl, teamA, teamB, teamBLogoUrl, gameFormat, gameDate, gameVenue, sponsor1LogoUrl, associationLogo, userEmail } = req.body;

    const maxLength = 27;
    const shortTeamA = shortenName(teamA, maxLength);
    const shortTeamB = shortenName(teamB, maxLength);

    const gameVenueParts = gameVenue.split('/');
    const shortGameVenue = gameVenueParts[0].trim();

    const [primaryColor, secondaryColor, fontFamily] = await fetchDesignSettings(userEmail)





    const markup = await html`
<div style="border-bottom: 15px solid ${primaryColor}; font-family: ${fontFamily}; border-right: 15px solid ${primaryColor}; height: 500px; width: 500px; background-color: ${secondaryColor}; padding-left: 25px; padding-top: 10px; overflow: hidden; position: relative; display: flex; flex-direction: column">
    <!--TOP TITLE-->
    <div style="display: flex; flex-direction: column">
        <img src="${associationLogo}" style="width: 50px; position: absolute; top: 10px; right: 10px;" />
    </div>
    <div style="color: ${primaryColor}; display: flex; flex-direction: column">
        <h1 style="margin-bottom: 0px; font-size: 50;">GAMEDAY</h1>
        <h4 style="color: grey; margin-top: 0; font-size: 25">${competitionName}</h4>
    </div>

    <!-- MIDDLE SECTION -->
   <div style="display: flex; align-items: center; margin-top: 20px;">
        <img src="${teamALogoUrl}" style="width: 80px; border: 2px solid white; margin-right: 5px" />
        <img src="${teamBLogoUrl}" style="width: 80px; border: 2px solid white; margin-right: 5px" />
        <div style="display: flex; background-color: rgba(255, 255, 255, 0.2); border-radius: 20px; padding: 1px 6px; font-family: 'LeagueSpartan'; font-size: 12px; color: white; margin-top: 60px">
            ${gameFormat}
        </div>
    </div>

    <div style="color: ${primaryColor}; display: flex; flex-direction: column">
        <h1 style="margin-bottom: 0px;">${shortTeamA}</h1> 
        <h1 style="margin-bottom: 0px; margin-top: 0">${shortTeamB}</h1>
        <h2 style="color: grey; margin-top: 10; margin-bottom: 0px;">${gameDate}</h2>
        <h2 style="color: grey; margin-top: 0;">${shortGameVenue}</h2>
    </div>
</div>`;



    const svg = await satori(
        markup,
        {
            width: 500,
            height: 500,
            fonts: [
                {
                    name: 'Cooper',
                    data: fontDataCooper,
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
    const { teamALogoUrl, teamA, teamB, teamBLogoUrl, gameDate, gameVenue, sponsor1LogoUrl, userEmail, playerList } = req.body;

    const maxLength = 27;
    const shortTeamA = shortenName(teamA, maxLength);
    const shortTeamB = shortenName(teamB, maxLength);

    const gameVenueParts = gameVenue.split('/');
    const shortGameVenue = gameVenueParts[0].trim();

    const [primaryColor, secondaryColor, fontFamily] = await fetchDesignSettings(userEmail)

    // Generate player cards HTML from the player list
    const playerCardsArray = await Promise.all(playerList.map(async (player) => `
    <div style="background-color: ${primaryColor}; border-radius: 10px 0 0 10px; padding: 10px; width: 100%; display: flex; margin-bottom: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
        <h3 style="margin: 0; color: ${secondaryColor}; font-size:16px">${player}</h3>
    </div>
`));

// Join the resolved array into a single string
const playerCards = playerCardsArray.join('').toString();

markupString = `<div style="border-bottom: 5px solid ${primaryColor}; background: url('data:image/svg+xml,${encodedSvg}'); font-family: ${fontFamily}; height: 600px; width: 600px; background-color: ${secondaryColor}; overflow: hidden; position: relative; display: flex; flex-direction: row;">
    <!-- LEFT SECTION -->
    <div style="display: flex; flex-direction: column; flex: 1;">
        <!-- TOP TITLE -->
        <div style="background-color: ${primaryColor}; color: ${secondaryColor}; display: flex; padding: 0px 35px; border-top-right-radius: 25px; border-bottom-right-radius: 25px; width: 270px; height: 150px;flex-direction: column;">
            <h2 style="margin-bottom: 0px; font-size: 40px;">STARTING</h2>
            <h1 style="font-size: 50px; margin-top: 0; text-align: right; margin-right: 60px;">XI</h1>
        </div>

        <!-- MIDDLE SECTION -->
        <div style="display: flex; padding-left: 25px; padding-top: 10px; align-items: center; margin-top: 20px;">
            <img src="${teamALogoUrl}" style="width: 80px; border: 2px solid white; margin-right: 5px" />
            <img src="${teamBLogoUrl}" style="width: 80px; border: 2px solid white; margin-right: 5px" />
        </div>

        <div style="color: ${primaryColor}; padding-left: 25px; display: flex; flex-direction: column;">
            <h1 style="margin-bottom: 0px; font-size: 20px;">${shortTeamA}</h1> 
            <h1 style="margin-bottom: 0px; margin-top: 0; font-size: 20px;">${shortTeamB}</h1>
        </div>
    </div>

    <div style="flex: 1; padding-left: 80px; padding-top: 10px; padding-bottom: 10px; display: flex; flex-direction: column; justify-content: center;">
    ${playerCards}
</div>

</div>`

    const markup = await html(markupString);



    const svg = await satori(
        markup,
        {
            width: 600,
            height: 600,
            fonts: [
                {
                    name: 'Cooper',
                    data: fontDataCooper,
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


function cleanUpClubData(clubData,filterByPlayerList) {
    // Helper function to check if a fixture is within the next 14 days
    const isWithinNext14Days = (fixtureDateString) => {
      // Parse the date string to a moment object
      const fixtureDate = moment(fixtureDateString, "dddd, DD MMMM YYYY");
      const today = moment(); // Get today's date
      const fourteenDaysFromNow = moment().add(14, 'days');
      
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
