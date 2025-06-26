# NBA Player Performance AI

This project is a data-driven application designed to analyze NBA player statistics and eventually build a predictive model to help with sports betting decisions on player props (Points, Rebounds, Assists).

The core of the project is a powerful data pipeline that extracts historical player performance data directly from `stats.nba.com` and populates a local PostgreSQL database, creating a robust foundation for future AI modeling.

---

## Current Features

* **Automated Web Scraper:** Utilizes Puppeteer to launch a headless Chrome browser, enabling it to scrape data from the complex, JavaScript-driven official NBA stats website.
* **Robust Data Extraction:** The scraper is engineered to handle real-world website challenges, including:
    * Automatically clicking "Accept Cookies" modals.
    * Intelligently navigating through all pages of data for a given season using pagination logic.
    * Detecting and breaking out of infinite loops on the final page.
* **Direct Database Seeding:** Scraped data is loaded directly into a PostgreSQL database, creating a clean, structured, and permanent data store. The script automatically creates the necessary tables (`players`, `player_season_stats`) if they don't exist.
* **Flexible Command-Line Interface:** The data seeding script can be run to fetch data for specific seasons provided as arguments, making it a reusable and flexible tool.

---

## How to Use This Project

### 1. Prerequisites

* [Node.js](https://nodejs.org/en/) installed.
* [PostgreSQL](https://www.postgresql.org/) installed and running.
* [Homebrew](https://brew.sh/) (on macOS, for managing the PostgreSQL service).

### 2. Setup

1.  **Clone the repository:**
    ```bash
    git clone [https://github.com/chrisk320/nbastats.git](https://github.com/chrisk320/nbastats.git)
    cd nbastats
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Start the PostgreSQL service:**
    ```bash
    brew services start postgresql
    ```
4.  **Create the database:**
    ```bash
    createdb nba_stats
    ```
5.  **Configure the database connection:**
    Open the `seed-database.js` file and update the `Pool` configuration with your PostgreSQL username and password.

### 3. Running the Scraper

The script can be run from the terminal to populate your database.

* **To scrape data for a default set of seasons:**
    ```bash
    node seed-database.js
    ```
* **To scrape data for one or more specific seasons:**
    ```bash
    node seed-database.js 2021-22 2020-21 2019-20
    ```

---

## Technology Stack

* **Backend:** Node.js
* **Web Scraping:** Puppeteer
* **Database:** PostgreSQL
* **Node.js-Postgres Bridge:** `pg` (node-postgres)

---

## Next Steps

With the data pipeline now complete and the historical data stored in a reliable database, the next phase of the project is to:

* Build an Express.js API server to serve this data.
* Develop the first version of the AI prediction model.
* Backtest the model against historical data to measure its accuracy.