# NBA Player Stats Dashboard

This project is a full-stack application designed to help users analyze NBA player performance. It features a robust backend data pipeline that scrapes historical data from `stats.nba.com` and a dedicated API server to serve that data, providing a foundation for a user-facing stats dashboard.

## Project Architecture

This project is built with a professional, separated architecture to handle data collection and data serving as distinct processes.

### 1. Data Pipeline (Scraping Scripts)

The data pipeline consists of a set of standalone Node.js scripts that are run offline to populate the database. This modular approach allows for targeted data collection based on different statistical categories.

* **`top_players_by_pts.js`**: This script first queries the database to get a list of the top 100 players based on their points per game average for a specific season. It then scrapes the detailed, game-by-game logs for each of these players across multiple historical seasons.

* **`top_players_by_rebs.js`**: Similar to the points script, this fetches the top 100 players based on rebounds per game and scrapes their complete game log history.

* **`top_players_by_asts.js`**: Fetches the top 100 players based on assists per game and scrapes their complete game log history.

All scripts utilize **Puppeteer** to launch a headless Chrome browser, enabling them to handle dynamic, JavaScript-driven websites, cookie modals, and pagination. They are also designed to be "resumable," meaning they can be stopped and started without re-scraping data that has already been collected.

### 2. Database (PostgreSQL)

A PostgreSQL database serves as the single source of truth for the application. It contains three main tables:

* `players`: Stores a unique record for each player (ID and name).

* `player_season_stats`: Stores the season averages for each player for every season scraped.

* `player_game_logs`: Stores the detailed, game-by-game stats for each player, including points, rebounds, assists, steals, blocks, and opponent.

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

* **Frontend**: React, Tailwind CSS
* **Backend**: Node.js, Express.js
* **Database**: PostgreSQL
* **Web Scraping**: Puppeteer
* **Node.js-Postgres Bridge**: `pg` (node-postgres)

## Next Steps

With the backend data pipeline and API now complete, the next phase of the project is to:

* Build the frontend user interface using **React**.
* Create a search bar component that uses the `/players` endpoint for autocomplete.
* Design and implement a player dashboard to display the data fetched from the API.