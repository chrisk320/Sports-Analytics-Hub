# NBA Player Stats Dashboard

This project is a full-stack application designed to help users analyze NBA player performance. It features a robust backend data pipeline that scrapes historical data from `stats.nba.com` and a dedicated API server to serve that data, providing a foundation for a user-facing stats dashboard.

## Project Architecture

This project is built with a professional, separated architecture to handle data collection and data serving as distinct processes.

### 1. Data Pipeline (`seed-database.js` & `seed-gamelogs.js`)

The data pipeline consists of two standalone Node.js scripts that are run offline to populate the database.

* **`seed-database.js`**: This script scrapes the main stats pages on `stats.nba.com` to get a list of all players and their season-average stats. It populates the `players` and `player_season_stats` tables.

* **`seed-gamelogs.js`**: This script reads the list of players from the database, then visits each player's individual "Box Scores" page to scrape their game-by-game statistics for multiple seasons. It is designed to be "resumable," meaning it can be stopped and started without re-scraping data that has already been collected.

Both scripts utilize **Puppeteer** to launch a headless Chrome browser, enabling them to handle dynamic, JavaScript-driven websites, cookie modals, and pagination.

### 2. Database (PostgreSQL)

A PostgreSQL database serves as the single source of truth for the application. It contains three main tables:

* `players`: Stores a unique record for each player (ID and name).

* `player_season_stats`: Stores the season averages for each player for every season scraped.

* `player_game_logs`: Stores the detailed, game-by-game stats for each player.

### 3. Backend API (`server.js`, Routes & Controllers)

An Express.js server provides a clean, RESTful API to access the data stored in the database. It follows a standard MVC (Model-View-Controller) pattern:

* **`server.js`**: The main entry point that starts the server and sets up middleware.

* **`routes/stats.routes.js`**: Defines all the API endpoints related to player data.

* **`controllers/stats.controllers.js`**: Contains the core logic for each endpoint, including the SQL queries needed to fetch data from the PostgreSQL database.

This server is fast and lightweight because it only reads from the pre-populated database and does not perform any scraping itself.

## API Endpoints

The server provides the following endpoints to be consumed by a frontend application:

* **`GET /players`**: Returns a list of all players in the database.

* **`GET /players/:playerId`**: Returns basic information for a single player.

* **`GET /players/:playerId/season-averages`**: Returns all season average stats for a single player.

* **`GET /players/:playerId/gamelogs`**: Returns all game-by-game logs for a single player.

## Technology Stack

* **Backend**: Node.js, Express.js

* **Database**: PostgreSQL

* **Web Scraping**: Puppeteer

* **Node.js-Postgres Bridge**: `pg` (node-postgres)

## Next Steps

With the backend data pipeline and API now complete, the next phase of the project is to:

* Build the frontend user interface using HTML, CSS, and JavaScript.

* Create a search bar that uses the `/players` endpoint for autocomplete.

* Design and implement a player dashboard to display the data fetched from the API.