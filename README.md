# NBA Player Stats Dashboard

This project is a full-stack application designed to help users analyze NBA player performance. It features a robust backend data pipeline that scrapes historical data from `stats.nba.com` and a dedicated API server to serve that data to a user-facing React application.

## Project Architecture

This project is built with a professional, separated architecture to handle data collection and data serving as distinct processes.

### 1. Data Pipeline (Scraping & Seeding Scripts)

The data pipeline consists of a set of standalone Node.js scripts that are run offline to populate the database.

* **Data Scrapers**: A suite of scripts that use **Puppeteer** to scrape `stats.nba.com` for traditional stats (season averages, game logs) and advanced stats (ratings, percentages). They are designed to be resumable and handle dynamic website features like pagination and cookie modals.
* **Headshot Seeder**: An efficient script that generates and saves the direct URL for each player's headshot by leveraging a predictable URL pattern, avoiding the need for additional scraping.

### 2. Database (PostgreSQL)

A PostgreSQL database serves as the single source of truth for the application. It contains multiple relational tables:

* `players`: Stores a unique record for each player, including their ID, name, and a direct URL to their headshot.
* `player_season_stats`: Stores the season averages for each player for every season scraped.
* `player_game_logs`: Stores the detailed, traditional game-by-game stats for each player.
* `advanced_box_scores` & `advanced_scoring_logs`: Separate tables for advanced metrics, linked directly to a specific game in `player_game_logs`.
* `user_favorites`: Links a `user_id` to a `player_id`, allowing for persistent, user-specific player lists.

### 3. Backend API (`server.js`, Routes & Controllers)

An Express.js server provides a clean, RESTful API to access the data stored in the database. It follows a standard MVC pattern and is designed to be fast and lightweight by only reading from the pre-populated database.

### 4. Frontend (React)

A modern, responsive single-page application built with **React** and styled with **Tailwind CSS**. It provides a user-friendly interface for searching, viewing, and managing a list of favorite players.

## Current Features

* **Full-Stack Application:** Complete separation between the frontend, backend API, and database.
* **User Authentication:** Secure sign-in/logout functionality using Google OAuth, with persistent user sessions.
* **Personalized Dashboards:** Logged-in users can add and remove players, and their selections are saved to the database and reloaded on subsequent visits.
* **Live Player Search:** An interactive search bar with autocomplete that queries the backend API.
* **Player Headshots:** Player cards and modals display official NBA headshots for a professional look.
* **Interactive Data Visualization:** The player stats modal features a bar chart, built with **Recharts**, that visualizes recent game performance. Users can dynamically switch the chart to display Points, Rebounds, or Assists.

## Technology Stack

* **Frontend**: React, Tailwind CSS, Axios, Recharts
* **Backend**: Node.js, Express.js
* **Database**: PostgreSQL
* **Authentication**: Google OAuth 2.0
* **Web Scraping**: Puppeteer
* **Node.js-Postgres Bridge**: `pg` (node-postgres)

## Next Steps

With a feature-rich frontend and a comprehensive data pipeline, the next phase could focus on:

* **Displaying Advanced Stats**: Update the player stats modal to display the advanced box score and scoring data that has already been collected.
* **AI Model Integration**: Return to the original goal of building a predictive model using the rich dataset and display its predictions in the UI.
* **Deployment**: Deploy the full-stack application (frontend, backend, and database) to the web using services like Vercel and Heroku.