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
        const queryText = 'SELECT primary_color, secondary_color, font FROM clubs WHERE email = $1';
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


app.post('/generate-gameday-image', async (req, res) => {
    const { seasonName, teamALogoUrl, teamA, teamB, teamBLogoUrl, gameFormat, gameDate, gameVenue, sponsor1LogoUrl, associationLogo, userEmail } = req.body;

    const maxLength = 22;
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
        <h4 style="color: grey; margin-top: 0; font-size: 30">${seasonName}</h4>
    </div>

    <!-- MIDDLE SECTION -->
   <div style="display: flex; align-items: center; margin-top: 20px;">
        <img src="${teamALogoUrl}" style="width: 80px; border: 2px solid white; margin-right: 5px" />
        <img src="${teamBLogoUrl}" style="width: 80px; border: 2px solid white;" />
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

app.get('/get-club-info/:email', async (req, res) => {
    const email = req.params.email;

    try {
        // Query the PostgreSQL database using the provided email
        const queryText = 'SELECT * FROM clubs WHERE email = $1';
        const { rows } = await pool.query(queryText, [email]);

        // Check if the query returned any rows
        if (rows.length === 0) {
            return res.status(404).send('Club not found for the given email');
        }

        console.log(rows[0])

        // Send the club data as the response
        const clubData = rows[0].clubdata;
        res.json(clubData);

    } catch (err) {
        console.error('Error fetching club data:', err);
        res.status(500).send('An error occurred while fetching the club data');
    }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
