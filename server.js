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

// Use the connection string to connect to the remote PostgreSQL database
const pool = new Pool({
  connectionString: 'postgresql://sportal_database_user:6h6G3tE82CnKPjF5fXbFY4tT6ffZD3Aa@dpg-crn2e6l6l47c73a8ll0g-a.singapore-postgres.render.com/sportal_database',
  ssl: {
    rejectUnauthorized: false, // Required to connect to some remote servers
  }
});


app.post('/generate-test', async (req, res) => {
    const fontData = readFileSync(resolve(__dirname, './fonts/Roboto-Black.ttf'));

    const teamALogoUrl = "https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_960_720.png";
    const teamBLogoUrl = "https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_960_720.png";
    const sponsor1LogoUrl = "https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_960_720.png";


const markup = await html`
<div style="display: flex; flex-direction: column; align-items: center; justify-content: center; width: 600px; height: 600px; background-color: #001844; padding: 20px; border-radius: 10px; position: relative;">
    <div style="text-align: left; font-family: 'Roboto'; font-weight: bold; font-size: 48px; color: #FFCC00; margin-bottom: 10px;">
        GAMEDAY
    </div>
    <div style="text-align: center; font-family: 'Roboto'; font-size: 24px; color: #C4C4C4; margin-bottom: 20px;">
        CSB Men's - Division 1
    </div>
    
    <div style="display: flex; flex-direction: row; align-items: center; justify-content: space-between; width: 100%; padding: 0 50px;">
        <!-- Team A Logo -->
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center;">
            <img src="${teamALogoUrl}" alt="Team A Logo" style="width: 120px; height: 120px; object-fit: cover; border: 2px solid #FFD700;">
        </div>
        
        <div style="display: flex; font-family: 'Roboto'; font-size: 32px; font-weight: bold; color: #FFCC00;">
            teamA <br>vs<br> teamB
        </div>
        
        <!-- Team B Logo -->
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center;">
            <img src="${teamBLogoUrl}" alt="Team B Logo" style="width: 120px; height: 120px; object-fit: cover; border: 2px solid #FFD700;">
        </div>
    </div>

    <div style="display: flex; background-color: #0A58ED; border-radius: 20px; padding: 10px 20px; font-family: 'Roboto'; font-size: 18px; color: white; margin-top: 20px;">
        One Day
    </div>
    
    <div style="display: flex; text-align: center; font-family: 'Roboto'; font-size: 24px; color: #FFCC00; margin-top: 20px;">
        teamA vs teamB
    </div>
    <div style="display: flex; text-align: center; font-family: 'Roboto'; font-size: 18px; color: #C4C4C4; margin-top: 10px;">
        Sat gameDay gameMonth <br>
        groundName
    </div>
    
    <!-- Sponsors Section -->
    <div style="display: flex; justify-content: center; align-items: center; margin-top: 30px;">
        <img src="${sponsor1LogoUrl}" alt="Sponsor 1" style="width: 60px; margin: 0 15px;">
        <img src="${sponsor1LogoUrl}" alt="Sponsor 2" style="width: 60px; margin: 0 15px;">
        <img src="${sponsor1LogoUrl}" alt="Sponsor 3" style="width: 60px; margin: 0 15px;">
    </div>
</div>

`;

const svg = await satori(markup, { width: 600, height: 600, fonts: [
    {
        name: 'Roboto',
        data: fontData,
        weight: 400,
        style: 'normal',
    }
], })


    const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();

    // Respond with the generated SVG
    res.setHeader('Content-Type', 'image/png');
    res.send(pngBuffer);
});


app.post('/generate-gameday-image', async (req, res) => {
    const { seasonName, teamALogoUrl, teamA, teamB, teamBLogoUrl, gameFormat, gameDate, gameVenue, sponsor1LogoUrl, associationLogo } = req.body;

    const fontData = readFileSync(resolve(__dirname, './fonts/Roboto-Black.ttf'));
    const markup = await html`
<div style="border-bottom: 15px solid #fdbd10; border-right: 15px solid #fdbd10; height: 300px; width: 300px; background-color: #091a46; padding-left: 10px; padding-top: 10px; overflow: hidden; position: relative; display: flex; flex-direction: column">
    <!--TOP TITLE-->
    <div style="display: flex; flex-direction: column">
        <img src="${associationLogo}" style="width: 30px; position: absolute; top: 10px; right: 10px;" />
    </div>
    <div style="color: #fdbd10; display: flex; flex-direction: column">
        <h2 style="margin-bottom: 0px;">GAMEDAY</h2>
        <h4 style="color: grey; margin-top: 0;">${seasonName}</h4>
    </div>

    <!-- MIDDLE SECTION -->
    <div style="display: flex; align-items: center; margin-top: 20px;">
        <img src="${teamALogoUrl}" style="width: 50px; margin-right: 10px;" />
        <img src="${teamBLogoUrl}" style="width: 50px; margin-right: 10px;" />
        <div style="display: flex; background-color: #0A58ED; border-radius: 20px; padding: 1px 6px; font-family: 'Roboto'; font-size: 12px; color: white; margin-top: 30px">
            ${gameFormat}
        </div>
    </div>

    <div style="color: #fdbd10; display: flex; flex-direction: column">
        <h2 style="margin-bottom: 0px;">${teamA} vs ${teamB}</h2>
        <h4 style="color: grey; margin-top: 0; margin-bottom: 0px;">${gameDate}</h4>
        <h4 style="color: grey; margin-top: 0;">${gameVenue}</h4>
    </div>

    <div style="display: flex;">
        <img src="${sponsor1LogoUrl}" style="width: 30px; position: absolute; bottom: 10px; right: 10px;" />
        <img src="${sponsor1LogoUrl}" style="width: 30px; position: absolute; bottom: 10px; right: 45px;" />
    </div>
</div>
`;



    const svg = await satori(
        markup,
        {
            width: 600,
            height: 600,
            fonts: [
                {
                    name: 'Roboto',
                    data: fontData,
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
