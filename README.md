# Sports Analytics Hub

This project is a full-stack application for analyzing NBA player performance and NFL betting opportunities, featuring a robust backend data pipeline, a RESTful API, and a modern React frontend. It supports both traditional and advanced NBA stats, personalized dashboards, NFL betting lines, and a conversational AI assistant.

## Project Architecture

This project is built with a professional, separated architecture to handle data collection and data serving as distinct processes.

### 1. Data Pipeline (Scraping & Seeding Scripts)

- **Data Scrapers:** Node.js scripts using **Puppeteer** to scrape `stats.nba.com` for traditional (season averages, game logs) and advanced stats (usage %, ratings, shooting percentages, etc). Scripts are resumable and handle dynamic web features.
- **Headshot Seeder:** Generates and saves official NBA headshot URLs for each player using a predictable pattern.

### 2. Database (PostgreSQL)

A PostgreSQL database serves as the single source of truth, with tables for:
- `players`: Player info and headshot URL.
- `player_season_stats`: Season averages for each player.
- `player_game_logs`: Detailed, game-by-game stats.
- `advanced_box_scores` & `advanced_scoring_logs`: Advanced metrics linked to specific games.
- `user_favorites`: Persistent, user-specific favorite player lists.
- `teams`: NBA team names and abbreviations.

### 3. External APIs

- **The Odds API**: Real-time NFL betting odds from multiple sportsbooks (DraftKings, FanDuel, BetMGM, BetUS, ESPN BET)
- **Google OAuth**: User authentication and profile management

### 4. Backend API (Express.js)

A RESTful API provides access to all data. Key endpoints:

#### Players
- `GET /players`: List all players.
- `GET /players/:playerId`: Get player info.
- `GET /players/:playerId/season-averages`: Latest season averages.
- `GET /players/:playerId/game-logs`: Last 10 game logs (traditional stats).
- `GET /players/:playerId/full-game-logs`: Last 10 game logs with advanced stats.
- `GET /players/:playerId/game-logs/:opponent`: Filter game logs by opponent.

#### Teams
- `GET /teams`: List all NBA teams.

#### User Favorites
- `GET /users/:userId/favorites`: Get user’s favorite players.
- `POST /users/:userId/favorites`: Add a player to favorites.
- `DELETE /users/:userId/favorites/:playerId`: Remove a player from favorites.

#### NFL Betting
- `GET /nflbets/nflgames`: Get upcoming NFL games with team matchups and game times.
- `GET /nflbets/nflteamlines`: Get comprehensive betting lines (moneyline, spreads, totals) from multiple sportsbooks.
- `GET /nflbets/nflplayerprops`: Get NFL player prop bets (passing yards, rushing yards, receiving yards).

#### Chat (AI Assistant)
- `POST /chat`: Ask natural language NBA stats questions (e.g., "Show me LeBron's advanced stats last 5 games"). Returns answers and structured data.

### 5. Frontend (React)

A modern, responsive single-page app built with **React** and **Tailwind CSS**. Key features:

#### NBA Features
- **User Authentication:** Google OAuth sign-in/out, persistent sessions.
- **Personalized Dashboard:** Add/remove favorite players, persistent across sessions.
- **Live Player Search:** Autocomplete search bar for all NBA players.
- **Player Cards:** Show headshot, name, and allow removal from favorites.
- **Stats Modal:**
  - Season averages (points, rebounds, assists).
  - Recent game logs (table: minutes, points, rebounds, assists, steals, usage %, TS%, OffRtg, DefRtg).
  - Interactive bar chart (points, rebounds, assists).
  - Filter game logs by opponent team.

#### NFL Features
- **NFL Team Cards:** Display upcoming NFL games with team matchups and game times.
- **Betting Lines Integration:** Real-time odds from multiple sportsbooks (DraftKings, FanDuel, BetMGM, BetUS, ESPN BET).
- **Multi-Market Betting:** Moneyline, point spreads, and over/under totals.
- **Sportsbook Comparison:** Compare odds across different betting platforms.

#### Shared Features
- **ChatBot:** Natural language NBA stats assistant powered by OpenAI, can answer questions about player stats, advanced stats, and matchups.
- **Responsive UI:** Modern, mobile-friendly, styled with Tailwind CSS.

## Current Features

### NBA Features
- **Full-Stack Application:** Clean separation between frontend, backend API, and database.
- **User Authentication:** Secure Google OAuth login/logout, persistent sessions.
- **Personalized Dashboards:** Add/remove favorite players, persistent across sessions.
- **Live Player Search:** Autocomplete search bar for all NBA players.
- **Player Headshots:** Official NBA headshots on player cards and modals.
- **Stats Modal:**
  - Season averages and recent game logs (traditional and advanced stats).
  - Interactive bar chart for points, rebounds, assists.
  - Filter logs by opponent team.
- **AI ChatBot:** Ask natural language questions about NBA stats, advanced stats, and matchups.
- **Interactive Data Visualization:** Bar chart visualizes recent game performance, switchable by stat.
- **Team Filter:** Filter player game logs by opponent.
- **Persistent Favorites:** User favorites are saved and reloaded on login.

### NFL Features
- **NFL Games Display:** Show upcoming NFL games with team matchups and game times.
- **Real-Time Betting Data:** Integration with The Odds API for live betting lines.
- **Multi-Sportsbook Support:** Odds from DraftKings, FanDuel, BetMGM, BetUS, and ESPN BET.
- **Betting Markets:** Moneyline, point spreads, and over/under totals.
- **Player Props:** NFL player prop bets for passing, rushing, and receiving yards.

### Shared Features
- **Mobile-Friendly UI:** Responsive, modern design with Tailwind CSS.
- **Section Navigation:** Toggle between NBA stats and NFL betting sections.

## Technology Stack

- **Frontend:** React, Tailwind CSS, Axios, Recharts
- **Backend:** Node.js, Express.js
- **Database:** PostgreSQL
- **Authentication:** Google OAuth 2.0
- **Web Scraping:** Puppeteer
- **Node.js-Postgres Bridge:** `pg` (node-postgres)
- **AI Assistant:** OpenAI GPT (via API)
- **Betting Data:** The Odds API
- **External APIs:** Google OAuth, The Odds API

## Next Steps

- **NFL Betting Lines Display:** Implement clickable team cards to show detailed betting lines from multiple sportsbooks.
- **Betting Line Comparison:** Add UI to compare odds across different sportsbooks for better betting decisions.
- **AI Model Integration:** Build and display predictive models using the rich NBA dataset.
- **Enhanced NFL Features:** Add more betting markets (player props, futures, etc.).
- **Deployment:** Deploy the full-stack app (frontend, backend, and database) to the web using services like Vercel and Heroku.