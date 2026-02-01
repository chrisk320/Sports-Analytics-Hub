# Sports Analytics Hub

A full-stack application for analyzing NBA player performance and sports betting opportunities. Features a robust data pipeline, RESTful API, modern React frontend, and automated daily data updates via GitHub Actions.

**Live Demo:** [Vercel Frontend](https://sports-analytics-hub.vercel.app) | **API:** [Render Backend](https://sports-analytics-hub-7hse.onrender.com)

## Project Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   React SPA     │────▶│  Express API    │────▶│   PostgreSQL    │
│   (Vercel)      │     │   (Render)      │     │   (Supabase)    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               ▲
                               │
                    ┌──────────┴──────────┐
                    │   GitHub Actions    │
                    │  (Daily Data Sync)  │
                    └─────────────────────┘
```

### 1. Data Pipeline

- **Python Scripts:** Automated data fetchers using `nba_api` for player stats and game logs
- **Node.js Scrapers:** Puppeteer scripts for scraping advanced stats from `stats.nba.com`
- **GitHub Actions:** Scheduled workflows for daily data updates
  - Morning job (5 AM PT): Fetches today's scheduled NBA games from The Odds API
  - Night job (3 AM PT): Fetches game stats after games complete

### 2. Database (PostgreSQL)

Hosted on Supabase with tables for:
- `players`: Player info and headshot URLs
- `player_season_stats`: Season averages
- `player_game_logs`: Game-by-game traditional stats
- `advanced_box_scores`: Advanced metrics (usage %, ratings, TS%)
- `user_favorites`: User-specific favorite players
- `teams`: NBA team names and abbreviations

### 3. External APIs

- **The Odds API:** Real-time NBA/NFL betting odds from multiple sportsbooks
- **NBA API:** Official NBA stats via `nba_api` Python library
- **Google OAuth:** User authentication

### 4. Backend API (Express.js)

RESTful API hosted on Render:

#### Players
- `GET /players` - List all players
- `GET /players/:playerId` - Player info
- `GET /players/:playerId/season-averages` - Season stats
- `GET /players/:playerId/gamelogs` - Last 10 games
- `GET /players/:playerId/full-gamelogs` - Games with advanced stats
- `GET /players/:playerId/gamelogs/:opponent` - Filter by opponent

#### Teams
- `GET /teams` - All NBA teams

#### User Favorites
- `GET /users/:userId/favorites` - User's favorites
- `POST /users/:userId/favorites` - Add favorite
- `DELETE /users/:userId/favorites/:playerId` - Remove favorite

#### NBA Betting
- `GET /nbabets/nbagames` - Upcoming NBA games
- `GET /nbabets/nbateamlines/:gameId` - Team betting lines
- `GET /nbabets/nbaplayerprops/:gameId` - Player prop bets

#### NFL Betting
- `GET /nflbets/nflgames` - Upcoming NFL games
- `GET /nflbets/nflteamlines/:gameId` - Team betting lines
- `GET /nflbets/nflplayerprops/:gameId` - Player prop bets

#### AI Chat
- `POST /chat` - Natural language NBA stats queries

### 5. Frontend (React)

Modern SPA hosted on Vercel with three main sections:

#### NBA Player Stats
- Google OAuth authentication
- Personalized dashboard with favorite players
- Live player search with autocomplete
- Stats modal with season averages, game logs, and charts
- Filter game logs by opponent

#### NBA Team Bets
- Upcoming NBA games display
- Real-time betting lines (moneyline, spreads, totals)
- Multi-sportsbook comparison (DraftKings, FanDuel, BetMGM, etc.)

#### NFL Team Bets
- NFL games with betting lines
- Player prop bets

## Technology Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | React 19, Vite, Tailwind CSS, Recharts, Axios |
| **Backend** | Node.js, Express.js |
| **Database** | PostgreSQL (Supabase) |
| **Data Pipeline** | Python (nba_api), Puppeteer, GitHub Actions |
| **AI** | OpenAI GPT-3.5-turbo |
| **Auth** | Google OAuth 2.0 |
| **APIs** | The Odds API, NBA API |
| **Hosting** | Vercel (frontend), Render (backend) |

## Quick Start

### Prerequisites
- Node.js 18+
- Python 3.11+
- PostgreSQL database

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Backend
```bash
cd server
npm install
npm run start
```

### Python Scripts
```bash
cd server/python_scripts
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Fetch all player data (initial setup)
python fetch_team_rosters_and_logs.py
python fetch_all_players_advanced_box_scores.py

# Daily updates (automated via GitHub Actions)
python fetch_todays_scheduled_games.py  # Morning
python fetch_yesterdays_games.py        # Night
```

## Environment Variables

### Backend (.env)
```env
DATABASE_URL=postgresql://user:password@host:5432/nba_stats
OPENAI_API_KEY=sk-...
ODDS_API_KEY=...
PORT=5000
```

### GitHub Secrets (for Actions)
- `DATABASE_URL` - Supabase PostgreSQL connection string
- `ODDS_API_KEY` - The Odds API key

## Automated Data Pipeline

GitHub Actions runs two scheduled jobs daily:

| Job | Schedule | Purpose |
|-----|----------|---------|
| `fetch-scheduled-games` | 5 AM PT (1 PM UTC) | Fetch today's NBA games from Odds API |
| `fetch-game-stats` | 3 AM PT (11 AM UTC) | Fetch player stats after games complete |

The morning job saves game data as an artifact, which the night job downloads to know which teams played.

## Future Enhancements

- AI-powered betting predictions using historical data
- Real-time game tracking and live odds updates
- Enhanced player prop analysis
- Mobile app version
