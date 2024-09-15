const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const satori = require('satori').default;
const { readFileSync } = require('fs');
const { resolve } = require('path');
const { MongoClient } = require('mongodb');
const cors = require('cors');

const html = (...args) =>
    import('satori-html').then(({ html }) => html(...args));

const app = express();
app.use(bodyParser.json());
app.use(cors());


/*const uri = 'mongodb://localhost:27017'; // Connection URI
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

let db;

async function connectDB() {
    try {
        await client.connect();
        db = client.db('cricket_db'); // Replace with your database name
        console.log('Connected to MongoDB');
    } catch (error) {
        console.error('Error connecting to MongoDB', error);
    }
}

connectDB();*/


app.post('/generate-test', async (req, res) => {
    const fontData = readFileSync(resolve(__dirname, './fonts/Roboto-Black.ttf'));

const markup = await html`
<div style="display: flex; align-items: center; justify-content: center; position: relative; width: 300px; height: 300px; background-color: black;">
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; color: white; font-family: 'Roboto'; font-size: 24px; position: absolute;">
        <div style="width: 100px; height: 100px; display: flex; borderRadius: 50%; background-color: green; color: green;"></div>
        <p>LOADING SHAPES</p>
    </div>
</div>
`;

const svg = await satori(markup, { width: 540, height: 360, fonts: [
    {
        name: 'Roboto',
        data: fontData,
        weight: 400,
        style: 'normal',
    }
], })


    // Respond with the generated SVG
    res.setHeader('Content-Type', 'image/svg+xml');
    res.send(svg);
});


app.post('/generate-gameday-image', async (req, res) => {
    const { clubName, teamA, teamB, gameDate } = req.body;

    const fontData = readFileSync(resolve(__dirname, './fonts/Roboto-Black.ttf'));
    const markup = await html`
<div style="display: flex; align-items: center; justify-content: center; position: relative; width: 300px; height: 300px; background-color: black;">
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; color: white; font-family: 'Roboto'; font-size: 24px; position: absolute;">
        <div>GAMEDAY AT</div>
        <div>${clubName}</div>
        <div style="margin-top:60px; color: yellow; font-size: 20px">${teamA.split(' ')[0]} v ${teamB.split(' ')[0]}</div>
        <div style="font-size: 19px">${gameDate}</div>
    </div>
</div>
`;



    const svg = await satori(
        markup,
        {
            width: 300,
            height: 300,
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

    // Respond with the generated SVG
    res.setHeader('Content-Type', 'image/svg+xml');
    res.send(svg);
});

app.get('/get-club-info/:clubName', async (req, res) => {
    const clubName = req.params.clubName;

    // Hardcoded club data
    const clubData = {
        "_id": "66c5240511d5f712caebe1b9",
        "Club Name": "Ashburton College",
        "Competitions": [
            {
                "Competition Name": "Christchurch Metro Cricket Association/CJCA",
                "Seasons": [
                    {
                        "Season Name": "Term 4, 2022",
                        "Start Date": "08 Oct 2022",
                        "End Date": "10 Dec 2022",
                        "Link": "https://www.playhq.com/new-zealand-cricket/org/ashburton-college/6b01467c/cmca-youth-boys-term-4-2022/e809e45d/teams",
                        "Teams": [
                            {
                                "Team Name": "Ashburton College 1st XI",
                                "Team Link": "https://www.playhq.com/new-zealand-cricket/org/ashburton-college/6b01467c/cmca-youth-boys-term-4-2022/teams/ashburton-college-1st-xi/4e25c213",
                                "Fixtures": [
                                    {
                                        "Round Name": "Round 1",
                                        "Round Date": "Saturday, 15 October 2022",
                                        "Team A": "Shirley Boys' HS 1st XI",
                                        "Team B": "Ashburton College 1st XI",
                                        "Team A Score": "10/98",
                                        "Team B Score": "10/98"
                                    },
                                    {
                                        "Round Name": "Round 7",
                                        "Round Date": "Saturday, 26 November 2022",
                                        "Team A": "St Bede's College 3rd XI",
                                        "Team B": "Ashburton College 1st XI",
                                        "Team A Score": "10/38",
                                        "Team B Score": "10/38"
                                    }
                                ]
                            },
                            {
                                "Team Name": "Ashburton College 2nd XI",
                                "Team Link": "https://www.playhq.com/new-zealand-cricket/org/ashburton-college/6b01467c/cmca-youth-boys-term-4-2022/teams/ashburton-college-2nd-xi/e8a05ddb",
                                "Fixtures": [
                                    {
                                        "Round Name": "Round 9",
                                        "Round Date": "Saturday, 22 October 2022",
                                        "Team A": "Ashburton College 2nd XI",
                                        "Team B": "Christ's College 5th XI",
                                        "Team A Score": "10/121",
                                        "Team B Score": "10/121"
                                    },
                                    {
                                        "Round Name": "Round 14",
                                        "Round Date": "Saturday, 03 December 2022",
                                        "Team A": "Ashburton College 2nd XI",
                                        "Team B": "U19 Men Lincoln High School",
                                        "Team A Score": "10/129",
                                        "Team B Score": "10/129"
                                    }
                                ]
                            }
                        ]
                    }
                ]
            }
        ]
    };

    // Check if the club name matches the hardcoded club data
    if (clubName !== 'Ashburton College') {
        return res.status(404).send('Club not found');
    }

    // Send the hardcoded JSON data as a response
    res.json(clubData);
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
