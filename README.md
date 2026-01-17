# PlayHQ Backend

Backend API for fetching PlayHQ organization data and generating custom sports images.

## Features

- 🏆 **PlayHQ Integration** - Fetch seasons, teams, and fixtures
- 🖼️ **Image Generation** - Generate custom gameday graphics using Satori
- 💾 **Smart Caching** - Cache org data for 6 hours to minimize API calls
- 📊 **Logging** - Track image generation usage

## Project Structure

```
playhq-backend/
├── server.js           # Express app + all routes
├── playhq.js           # PlayHQ API service
├── database.js         # Database operations
├── image-generator.js  # Image generation utilities
├── fonts/              # Font files for image generation
│   ├── Extenda.ttf
│   ├── Roboto-Regular.ttf
│   └── LuckiestGuy-Regular.ttf
├── .env
├── .gitignore
└── package.json
```

## Setup Instructions

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd playhq-backend
npm install
```

### 2. Setup Database (Railway)

1. Create a new PostgreSQL database on [Railway](https://railway.app)
2. Copy the `DATABASE_URL` from Railway dashboard
3. Run the SQL commands from the setup guide to create tables

### 3. Setup Environment Variables

Create a `.env` file:

```env
PORT=3000
DATABASE_URL=your_railway_database_url_here
NODE_ENV=development
CACHE_DURATION_HOURS=6
```

### 4. Add Font Files

Download and place these fonts in a `fonts/` folder:
- `Extenda.ttf`
- `Roboto-Regular.ttf`
- `LuckiestGuy-Regular.ttf`

### 5. Insert Your Organization

Run this SQL in Railway PostgreSQL console:

```sql
INSERT INTO organizations (
  email, 
  org_name, 
  playhq_org_id, 
  playhq_api_key, 
  playhq_tenant,
  primary_color,
  secondary_color,
  text_color
)
VALUES (
  'your@email.com', 
  'Your Organization Name', 
  'your_playhq_org_id', 
  'your_playhq_api_key', 
  'ca',
  '#1a1a1a',
  '#FFD700',
  '#FFFFFF'
);
```

### 6. Start Development Server

```bash
npm run dev
```

Server will run on `http://localhost:3000`

## API Endpoints

### GET `/health`
Health check endpoint

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-01-17T...",
  "environment": "development"
}
```

### GET `/api/org-data`
Fetch organization data (seasons, teams, fixtures)

**Query Parameters:**
- `userEmail` (required) - Organization email

**Example:**
```bash
curl "http://localhost:3000/api/org-data?userEmail=your@email.com"
```

**Response:**
```json
{
  "seasons": [
    {
      "seasonId": "...",
      "seasonName": "2024 Season",
      "teams": [
        {
          "teamId": "...",
          "teamName": "Team A",
          "teamLogo": "https://...",
          "fixtures": [...]
        }
      ]
    }
  ],
  "totalSeasons": 2,
  "totalTeams": 5,
  "source": "cache|playhq",
  "lastUpdated": "2025-01-17T..."
}
```

### POST `/generate-gameday-image`
Generate a custom gameday image

**Request Body:**
```json
{
  "userEmail": "your@email.com",
  "competitionName": "Premier League",
  "teamA": "Team Alpha",
  "teamB": "Team Beta",
  "teamALogoUrl": "https://example.com/logo-a.png",
  "teamBLogoUrl": "https://example.com/logo-b.png",
  "gameFormat": "Round 5",
  "gameDate": "Saturday, 25 Jan 2025",
  "gameVenue": "Central Stadium / Field 1",
  "associationLogo": "https://example.com/association.png"
}
```

**Response:**
Returns PNG image (Content-Type: image/png)

**Example (cURL):**
```bash
curl -X POST http://localhost:3000/generate-gameday-image \
  -H "Content-Type: application/json" \
  -d '{"userEmail":"your@email.com",...}'
```

## Adding New Image Templates

To add a new image generation endpoint:

1. **Add route in `server.js`:**
```javascript
app.post('/generate-your-template', async (req, res) => {
  const { userEmail, ...otherParams } = req.body;
  
  // Get org settings
  const org = await getOrgByEmail(userEmail);
  
  // Create your HTML markup
  const markupString = `<div>Your custom HTML here</div>`;
  
  // Generate image
  const pngBuffer = await generateImageFromMarkup(markupString);
  
  // Log and send
  await logImageGeneration(userEmail, 'Your Template Name');
  res.setHeader('Content-Type', 'image/png');
  res.send(pngBuffer);
});
```

2. **Test it:**
```bash
curl -X POST http://localhost:3000/generate-your-template \
  -H "Content-Type: application/json" \
  -d '{"userEmail":"test@example.com"}'
```

## Deployment to Railway

### 1. Push to GitHub
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin <your-github-repo>
git push -u origin main
```

### 2. Deploy on Railway
1. Go to [Railway](https://railway.app)
2. Click "New Project" → "Deploy from GitHub repo"
3. Select your repository
4. Railway auto-detects Node.js

### 3. Set Environment Variables
In Railway dashboard, add:
- `NODE_ENV=production`
- `CACHE_DURATION_HOURS=6`
- `DATABASE_URL` (already set by Railway PostgreSQL)

### 4. Deploy!
Railway will automatically deploy your app.

Your API will be live at: `https://your-app.railway.app`

## Flutter Integration

### Fetch Org Data
```dart
import 'package:http/http.dart' as http;
import 'dart:convert';

Future<Map<String, dynamic>> fetchOrgData(String userEmail) async {
  final response = await http.get(
    Uri.parse('https://your-backend.railway.app/api/org-data?userEmail=$userEmail'),
  );
  
  if (response.statusCode == 200) {
    return json.decode(response.body);
  } else {
    throw Exception('Failed to load org data');
  }
}
```

### Generate Image
```dart
Future<Uint8List> generateGamedayImage(Map<String, dynamic> data) async {
  final response = await http.post(
    Uri.parse('https://your-backend.railway.app/generate-gameday-image'),
    headers: {'Content-Type': 'application/json'},
    body: json.encode(data),
  );
  
  if (response.statusCode == 200) {
    return response.bodyBytes; // PNG image bytes
  } else {
    throw Exception('Failed to generate image');
  }
}
```

## Troubleshooting

### Fonts not loading
Make sure you have a `fonts/` folder with all three font files:
- Extenda.ttf
- Roboto-Regular.ttf
- LuckiestGuy-Regular.ttf

### Database connection fails
Check your `.env` file has the correct `DATABASE_URL` from Railway

### PlayHQ API errors
Verify your PlayHQ API key and organization ID are correct in the database

### Image generation fails
Check that all image URLs in the request are accessible (not broken links)

## Tech Stack

- **Express** - Web framework
- **PostgreSQL** - Database
- **Satori** - HTML to image generation
- **Sharp** - Image processing
- **@vercel/og** - HTML parsing for Satori

## License

ISC