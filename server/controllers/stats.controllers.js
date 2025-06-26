import axios from 'axios';
import puppeteer, { executablePath } from 'puppeteer';

export const getAllStats = async (req, res) => {
    console.log('Request received. Launching Puppeteer to scrape stats...');
    let browser;

    try {
        console.log('Launching browser...');
        browser = await puppeteer.launch({
            headless: "new",
            executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
        });

        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36');

        const season = req.query.season || '2022-23';
        const url = `https://www.nba.com/stats/players/traditional?Season=${season}&SeasonType=Regular+Season`;

        console.log(`Navigating to ${url}...`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        console.log('Page DOM loaded.');

        console.log('Looking for cookie consent button...');
        const cookieButtonSelector = '#onetrust-accept-btn-handler';
        try {
            await page.waitForSelector(cookieButtonSelector, { timeout: 10000 });
            await page.click(cookieButtonSelector);
            console.log('Cookie consent button clicked.');
        } catch (e) {
            console.log('Cookie consent button not found, continuing...');
        }

        // ** NEW, MORE RELIABLE SELECTOR **
        // Instead of a fragile class, we wait for a table inside the main content block.
        console.log('Waiting for the stats table to appear...');
        const tableSelector = 'section.nba-stats-content-block table';
        await page.waitForSelector(tableSelector, { timeout: 60000 });

        console.log('Stats table found. Extracting data...');

        const playersData = await page.evaluate((selector) => {
            const stats = [];
            // Use the selector passed into the function
            const tableRows = document.querySelectorAll(`${selector} tbody tr`);

            tableRows.forEach(row => {
                const columns = row.querySelectorAll('td');
                if (columns.length > 20) { // Check for sufficient columns
                    stats.push({
                        name: columns[1]?.innerText,
                        team: columns[2]?.innerText,
                        age: parseInt(columns[3]?.innerText, 10),
                        gp: parseInt(columns[4]?.innerText, 10),
                        // ** CORRECTED COLUMN INDICES **
                        pts: parseFloat(columns[8]?.innerText),  // Was 6
                        reb: parseFloat(columns[20]?.innerText), // Was 17
                        ast: parseFloat(columns[21]?.innerText), // Was 18
                    });
                }
            });
            return stats;
        }, tableSelector); // Pass the selector into page.evaluate

        console.log(`Successfully extracted data for ${playersData.length} players.`);
        res.status(200).json(playersData);

    } catch (error) {
        console.error('An error occurred during scraping:', error);
        res.status(500).json({ message: "Failed to scrape data.", error: error.message });
    } finally {
        if (browser) {
            await browser.close();
            console.log('Browser closed.');
        }
    }
};