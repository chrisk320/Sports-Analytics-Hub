import puppeteer from 'puppeteer';
import pg from 'pg'; // The PostgreSQL client

// --- Database Configuration ---
const { Pool } = pg;
const pool = new Pool({
    user: 'christiankim',
    host: 'localhost',
    database: 'nba_stats',
    password: '',
    port: 5432,
});

/**
 * Creates the necessary tables in the database if they don't already exist.
 */
const setupDatabase = async () => {
    console.log('Setting up database tables...');
    const createTablesQuery = `
    CREATE TABLE IF NOT EXISTS players (
      player_id INT PRIMARY KEY,
      full_name VARCHAR(255) NOT NULL,
      UNIQUE(player_id)
    );

    CREATE TABLE IF NOT EXISTS player_season_stats (
      stat_id SERIAL PRIMARY KEY,
      player_id INT REFERENCES players(player_id),
      season VARCHAR(10) NOT NULL,
      team_abbreviation VARCHAR(5),
      games_played INT,
      points_avg REAL,
      rebounds_avg REAL,
      assists_avg REAL,
      UNIQUE(player_id, season)
    );
  `;
    try {
        const client = await pool.connect();
        await client.query(createTablesQuery);
        client.release();
        console.log('✅ Tables are ready.');
    } catch (err) {
        console.error('❌ Error setting up database tables:', err);
        process.exit(1);
    }
};

/**
 * Scrapes player data for a single NBA season, handling all pages.
 */
const scrapeAndSeedSeason = async (browser, season) => {
    console.log(`--- Starting scrape for ${season} season ---`);
    const page = await browser.newPage();
    const client = await pool.connect();
    let allPlayersData = [];

    try {
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36');
        const url = `https://www.nba.com/stats/players/traditional?Season=${season}&SeasonType=Regular+Season`;

        console.log(`Navigating to ${url}...`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        console.log('Page DOM loaded.');

        console.log('Looking for cookie consent button...');
        try {
            await page.waitForSelector('#onetrust-accept-btn-handler', { timeout: 10000 });
            await page.click('#onetrust-accept-btn-handler');
            console.log('Cookie consent button clicked.');
        } catch (e) {
            console.log('Cookie consent button not found, continuing...');
        }

        // --- PAGINATION LOGIC ---
        let currentPage = 1;

        while (true) {
            console.log(`Scraping page ${currentPage} for season ${season}...`);

            const tableSelector = 'section.nba-stats-content-block table';
            await page.waitForSelector(tableSelector, { timeout: 60000 });

            const playersOnPage = await page.evaluate((selector) => {
                const stats = [];
                document.querySelectorAll(`${selector} tbody tr`).forEach(row => {
                    const columns = row.querySelectorAll('td');
                    if (columns.length > 20) {
                        const playerCell = columns[1];
                        const playerName = playerCell?.innerText;
                        const playerLink = playerCell?.querySelector('a')?.href;
                        const playerId = playerLink ? playerLink.split('/')[5] : null;
                        stats.push({
                            playerId: parseInt(playerId, 10), name: playerName, team: columns[2]?.innerText,
                            age: parseInt(columns[3]?.innerText, 10), gp: parseInt(columns[4]?.innerText, 10),
                            pts: parseFloat(columns[8]?.innerText), reb: parseFloat(columns[20]?.innerText),
                            ast: parseFloat(columns[21]?.innerText),
                        });
                    }
                });
                return stats;
            }, tableSelector);

            // Get the name of the first player on the current page to check against later.
            const firstPlayerNameOnPage = playersOnPage.length > 0 ? playersOnPage[0].name : null;
            allPlayersData.push(...playersOnPage);

            const nextButtonSelector = 'button[title="Next Page Button"]:not([disabled])';
            const nextButton = await page.$(nextButtonSelector);

            if (nextButton) {
                console.log('Next button found, clicking to go to next page...');
                await nextButton.click();
                try {
                    // **THE FIX**: Wait until the first player's name is different,
                    // which confirms the new page content has loaded.
                    await page.waitForFunction(
                        (previousFirstName, selector) => {
                            const currentFirstName = document.querySelector(`${selector} tbody tr td:nth-child(2)`)?.innerText;
                            return currentFirstName !== previousFirstName;
                        },
                        { timeout: 15000 }, // Wait up to 15 seconds
                        firstPlayerNameOnPage,
                        tableSelector
                    );
                    currentPage++;
                } catch (e) {
                    // If this times out, the content didn't change, so we're done.
                    console.log('Content did not change after click. Assuming this is the last page.');
                    break;
                }
            } else {
                console.log('No more active "Next" pages found. Finished scraping this season.');
                break;
            }
        }

        // --- DATABASE INSERTION LOGIC (now runs once with all players) ---
        console.log(`Scraped a total of ${allPlayersData.length} players. Inserting into database...`);
        for (const player of allPlayersData) {
            if (!player.playerId) continue;
            const playerInsertQuery = { text: 'INSERT INTO players (player_id, full_name) VALUES ($1, $2) ON CONFLICT (player_id) DO NOTHING', values: [player.playerId, player.name] };
            await client.query(playerInsertQuery);
            const statsInsertQuery = {
                text: `INSERT INTO player_season_stats (player_id, season, team_abbreviation, games_played, points_avg, rebounds_avg, assists_avg) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (player_id, season) DO NOTHING`,
                values: [player.playerId, season, player.team, player.gp, player.pts, player.reb, player.ast],
            };
            await client.query(statsInsertQuery);
        }
        console.log(`✅ Finished seeding database for ${season} season.`);
    } catch (err) {
        console.error(`❌ Error during scraping/seeding for season ${season}:`, err);
    } finally {
        if (page && !page.isClosed()) await page.close();
        if (client) client.release();
    }
};


/**
 * Main function to control the scraping process.
 */
const main = async () => {
    let seasonsToScrape = process.argv.slice(2);

    if (seasonsToScrape.length === 0) {
        console.log("No seasons provided. Using default list: ['2022-23', '2023-24', '2024-25']");
        console.log("To specify seasons, run: node seed-database.js 2021-22 2020-21");
        seasonsToScrape = ["2022-23", "2023-24", "2024-25"];
    } else {
        console.log(`Scraping for seasons provided via command line: ${seasonsToScrape.join(', ')}`);
    }

    await setupDatabase();

    const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });

    for (const season of seasonsToScrape) {
        await scrapeAndSeedSeason(browser, season);
    }

    await browser.close();
    await pool.end();
    console.log("\n🚀 All seasons processed. Database is populated.");
};

// Run the main function
main();