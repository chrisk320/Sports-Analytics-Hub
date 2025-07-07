# NBA Player Stats Dashboard

This project is a full-stack application designed to help users analyze NBA player performance. It features a robust backend data pipeline that scrapes historical data from `stats.nba.com` and a dedicated API server to serve that data to a user-facing React application.

## Project Architecture

This project is built with a professional, separated architecture to handle data collection and data serving as distinct processes.

### 1. Data Pipeline (Scraping Scripts)

The data pipeline consists of a set of standalone Node.js scripts that are run offline to populate the database. This modular approach allows for targeted data collection based on different statistical categories.

* **Traditional Stats Scrapers**: These scripts scrape `stats.nba.com` to get a list of all players, their season-average stats, and their complete game-by-game logs (PTS, REB, AST, etc.).
* **Advanced Stats Scrapers**: A set of scripts dedicated to collecting advanced metrics. They read player and game information from the database and then scrape the corresponding "Advanced Box Scores" pages to gather more nuanced data like Offensive Rating, PACE, and PIE.

All scripts utilize **Puppeteer** to launch a headless Chrome browser, enabling them to handle dynamic, JavaScript-driven websites, cookie modals, and pagination. They are also designed to be "resumable," meaning they can be stopped and started without re-scraping data that has already been collected.

### 2. Database (PostgreSQL)

A PostgreSQL database serves as the single source of truth for the application. It contains multiple relational tables:

* `players`: Stores a unique record for each player (ID and name).
* `player_season_stats`: Stores the season averages for each player for every season scraped.
* `player_game_logs`: Stores the detailed, traditional game-by-game stats for each player. This is the central table.
* `advanced_box_scores`: Stores advanced metrics for each game (Offensive Rating, Pace, PIE, etc.) and is linked directly to a specific game in `player_game_logs`.
* `user_favorites`: Links a `user_id` to a `player_id`, allowing for persistent, user-specific player lists.

### 3. Backend API (`server.js`, Routes & Controllers)

An Express.js server provides a clean, RESTful API to access the data stored in the database. It follows a standard MVC (Model-View-Controller) pattern and is designed to be fast and lightweight by only reading from the pre-populated database.

### 4. Frontend (React)

A modern, responsive single-page application built with **React** and styled with **Tailwind CSS**. It provides a user-friendly interface for searching, viewing, and managing a list of favorite players. User authentication is handled via Google Sign-In through the `@react-oauth/google` library, with user data and favorites persisted across sessions.

## Current Features

* **Full-Stack Application:** Complete separation between the frontend, backend API, and database.
* **User Authentication:** Secure sign-in/logout functionality using Google OAuth, with persistent user sessions.
* **Personalized Dashboards:** Logged-in users can add and remove players, and their selections are saved to the database and reloaded on subsequent visits.
* **Live Player Search:** An interactive search bar with autocomplete that queries the backend API for a list of all players.
* **Detailed Stats Modal:** Clicking on a player card fetches and displays their season averages and recent game logs from the API.

## Technology Stack

* **Frontend**: React, Tailwind CSS, Axios
* **Backend**: Node.js, Express.js
* **Database**: PostgreSQL
* **Authentication**: Google OAuth 2.0
* **Web Scraping**: Puppeteer
* **Node.js-Postgres Bridge**: `pg` (node-postgres)

## Next Steps

With the core application and data pipeline complete, the next phase focuses on enhancing the user experience with richer data visualization.

* **Enhance the API**: Create a new endpoint that uses a `JOIN` query to efficiently serve both traditional and advanced stats in a single API call.
* **Display Advanced Stats**: Update the player stats modal in the React frontend to display the newly collected advanced metrics.
* **Data Visualization**: Integrate a charting library like **Recharts** to create interactive bar charts that visualize player performance (e.g., points per game over the last 10 games).