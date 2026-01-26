# CLAUDE.md - Sports Analytics Hub

This file provides guidance for AI assistants working with this codebase.

## Project Overview

Sports-Analytics-Hub is a full-stack web application for analyzing NBA/NFL sports data and betting opportunities. It features a three-tier architecture with React frontend, Express.js backend, and PostgreSQL database.

**Production API**: `https://sports-analytics-hub-7hse.onrender.com`

## Quick Commands

```bash
# Frontend (from /frontend)
npm run dev        # Start Vite dev server with HMR
npm run build      # Production build to /dist
npm run lint       # ESLint check
npm run preview    # Preview production build

# Backend (from /server)
npm run start      # Start with nodemon (auto-restart)

# Python scripts (from /server/python_scripts)
python fetch_team_rosters_and_logs.py
python fetch_todays_stats.py
```

## Project Structure

```
Sports-Analytics-Hub/
├── frontend/                    # React SPA
│   ├── src/
│   │   ├── App.jsx             # Main app (~340 lines) - all state management
│   │   ├── main.jsx            # Entry point
│   │   ├── index.css           # Global Tailwind styles
│   │   └── components/
│   │       ├── Header.jsx      # Navigation + user profile
│   │       ├── Login.jsx       # Google OAuth
│   │       ├── SearchBar.jsx   # Player search autocomplete
│   │       ├── PlayerCard.jsx  # Player display cards
│   │       ├── StatsModal.jsx  # Player stats detailed view
│   │       ├── RecentGamesBarChart.jsx  # Recharts visualization
│   │       ├── ChatBot.jsx     # AI assistant interface
│   │       ├── TeamCard.jsx    # NFL team cards
│   │       └── NFLGameModal.jsx # Betting lines display
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── package.json
│
├── server/                      # Express.js backend
│   ├── server.js               # Entry point (port 5000)
│   ├── controllers/
│   │   ├── stats.controllers.js    # NBA player stats
│   │   ├── user.controllers.js     # User favorites CRUD
│   │   ├── teams.controllers.js    # NBA teams
│   │   ├── chat.controllers.js     # AI chat (487 lines - most complex)
│   │   ├── nflbets.controllers.js  # NFL betting data
│   │   └── nbabets.controllers.js  # NBA betting data
│   ├── routes/
│   │   ├── stats.routes.js         # /players
│   │   ├── user.routes.js          # /users
│   │   ├── teams.routes.js         # /teams
│   │   ├── chat.routes.js          # /chat
│   │   ├── nflbets.routes.js       # /nflbets
│   │   └── nbabets.routes.js       # /nbabets
│   ├── script_functions/       # Puppeteer scrapers
│   │   ├── season_script_db.js
│   │   ├── advanced_stats_script.js
│   │   ├── team_roster_scraper.js
│   │   ├── headshot_script.js
│   │   ├── teams_script.js
│   │   └── top_players_by_*.js
│   ├── python_scripts/         # NBA API data fetchers
│   │   ├── fetch_team_rosters_and_logs.py
│   │   ├── fetch_todays_stats.py
│   │   └── requirements.txt
│   ├── backtest.js             # Betting model evaluation
│   └── package.json
│
└── README.md
```

## Technology Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | React 19.1, Vite 7.0, Tailwind CSS 4.1, Recharts 3.0, Axios |
| **Backend** | Node.js (ES Modules), Express.js 4.18, nodemon |
| **Database** | PostgreSQL with `pg` (node-postgres) |
| **AI** | OpenAI GPT-3.5-turbo |
| **Scraping** | Puppeteer 24.10, nba_api (Python) |
| **Auth** | Google OAuth 2.0 (@react-oauth/google) |
| **External APIs** | The Odds API (betting odds) |

## Database Schema

| Table | Purpose | Key Fields |
|-------|---------|-----------|
| `players` | Player master data | player_id (PK), full_name, headshot_url, team_abbreviation |
| `player_season_stats` | Season averages | stat_id (PK), player_id (FK), season, points_avg, rebounds_avg, assists_avg |
| `player_game_logs` | Game-by-game stats | game_log_id (PK), player_id (FK), game_date, opponent, pts, reb, ast, stl, blk |
| `advanced_box_scores` | Advanced metrics | game_log_id (FK), offensive_rating, defensive_rating, usage_percentage, true_shooting_percentage |
| `user_favorites` | User favorites | user_id, player_id |
| `teams` | NBA teams | team_name, team_abbreviation |

## API Endpoints

### NBA Stats (`/players`)
- `GET /players` - List all players
- `GET /players/:playerId` - Player info
- `GET /players/:playerId/season-averages` - Season stats
- `GET /players/:playerId/gamelogs` - Last 10 games
- `GET /players/:playerId/full-gamelogs` - Last 10 with advanced stats
- `GET /players/:playerId/gamelogs/:opponentAbbr` - Filter by opponent

### Teams (`/teams`)
- `GET /teams` - All NBA teams

### User Favorites (`/users`)
- `GET /users/:userId/favorites` - User's favorites
- `POST /users/:userId/favorites` - Add favorite (body: `{playerId}`)
- `DELETE /users/:userId/favorites/:playerId` - Remove favorite

### AI Chat (`/chat`)
- `POST /chat` - Natural language queries (body: `{message}`)

### NFL Betting (`/nflbets`)
- `GET /nflbets/nflgames` - Upcoming NFL games
- `GET /nflbets/nflteamlines` - Team betting lines
- `GET /nflbets/nflplayerprops` - Player prop bets

### NBA Betting (`/nbabets`)
- `GET /nbabets/nbagames` - Upcoming NBA games
- `GET /nbabets/nbateamlines` - Team betting lines
- `GET /nbabets/nbaplayerprops` - Player prop bets

## Environment Variables

Required in `.env` (not committed):

```env
# Backend
DATABASE_URL=postgresql://user:password@host:5432/nba_stats
OPENAI_API_KEY=sk-...
ODDS_API_KEY=...
PORT=5000

# Frontend (optional)
VITE_API_BASE_URL=https://sports-analytics-hub-7hse.onrender.com
```

## Code Conventions

### Backend
- **ES Modules**: All files use `import/export` syntax
- **Async/Await**: All database and API calls use async/await
- **Error handling**: Controllers return `{ error: "message" }` on failures
- **Database**: Use parameterized queries (`$1`, `$2`) to prevent SQL injection
- **Pool**: Import pool from controllers, not routes

### Frontend
- **State**: All state managed in App.jsx (no Redux/Context)
- **Styling**: Tailwind CSS utility classes, no inline styles
- **Data fetching**: Axios with async/await in useEffect hooks
- **Components**: Functional components with hooks only

### Data Pipeline Scripts
- **Puppeteer**: Use headless browser, handle cookie consent
- **Delays**: Add random delays (50-3000ms) to avoid blocking
- **Idempotent**: Scripts can be re-run safely (upsert patterns)
- **Logging**: Use console.log for progress tracking

## Key Files to Know

| File | Purpose |
|------|---------|
| `server/controllers/chat.controllers.js` | Most complex - AI intent parsing + query building |
| `frontend/src/App.jsx` | Main React component with all state |
| `server/controllers/stats.controllers.js` | Core NBA stats queries |
| `server/backtest.js` | Betting prediction testing framework |

## Common Tasks

### Adding a new API endpoint
1. Create/update controller in `server/controllers/`
2. Add route in `server/routes/`
3. Import and mount route in `server/server.js`

### Adding a new frontend component
1. Create component in `frontend/src/components/`
2. Import and use in `App.jsx`
3. Add any state variables to App.jsx

### Running data scrapers
```bash
cd server
node script_functions/season_script_db.js
node script_functions/advanced_stats_script.js
```

### Running Python data fetchers
```bash
cd server/python_scripts
source venv/bin/activate  # if using virtualenv
python fetch_team_rosters_and_logs.py
```

## Testing

**Note**: No testing framework is currently configured. The codebase uses manual testing.

## Deployment

- **Frontend**: Deploy `/frontend/dist` to static hosting (Vercel)
- **Backend**: Deploy `/server` to Node.js hosting (Render.com)
- **Database**: Remote PostgreSQL with SSL enabled

## Current Limitations

- No automated tests
- No TypeScript (plain JavaScript)
- State management in single App.jsx file
- No database migrations (manual schema changes)
- No rate limiting on API endpoints
- No caching layer (consider Redis for player data)

## Git Workflow

- Main development happens on feature branches
- Commits should be descriptive and focused
- No CI/CD pipeline currently configured
