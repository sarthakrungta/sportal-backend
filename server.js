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


const uri = 'mongodb://localhost:27017'; // Connection URI
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

connectDB();


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

    const teamData = await db.collection('clubs').findOne({ "Club Name": clubName});
    if (!teamData) {
        return res.status(404).send('Team not found');
    }

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

    const clubData = await db.collection('clubs').findOne({ "Club Name": clubName });
    if (!clubData) {
        return res.status(404).send('Club not found');
    }

    res.json(clubData);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
