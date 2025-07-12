import puppeteer from 'puppeteer';
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
    user: 'christiankim',
    host: 'localhost',
    database: 'nba_stats',
    password: '',
    port: 5432,
});

const TEAM_SLUG_TO_ABBREVIATION = {
    'hawks': 'ATL', 'celtics': 'BOS', 'nets': 'BKN', 'hornets': 'CHA', 'bulls': 'CHI',
    'cavaliers': 'CLE', 'pistons': 'DET', 'pacers': 'IND', 'heat': 'MIA', 'bucks': 'MIL',
    'knicks': 'NYK', 'magic': 'ORL', 'sixers': 'PHI', 'raptors': 'TOR', 'wizards': 'WAS',
    'mavericks': 'DAL', 'nuggets': 'DEN', 'warriors': 'GSW', 'rockets': 'HOU', 'clippers': 'LAC',
    'lakers': 'LAL', 'grizzlies': 'MEM', 'timberwolves': 'MIN', 'pelicans': 'NOP', 'thunder': 'OKC',
    'suns': 'PHX', 'blazers': 'POR', 'kings': 'SAC', 'spurs': 'SAS', 'jazz': 'UTA'
};

const main = async () => {
    console.log('--- Starting team data seeding script ---');
    const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
    const page = await browser.newPage();
    const client = await pool.connect();

    try {
        const url = 'https://www.nba.com/teams';
        console.log(`Navigating to ${url}...`);
        await page.goto(url, { waitUntil: 'domcontentloaded' });

        const containerSelector = 'div[class*="TeamDivisions_division"]';
        console.log('Waiting for team list to load...');
        await page.waitForSelector(containerSelector, { timeout: 30000 });
        console.log('Team list loaded.');

        const teamsData = await page.evaluate(() => {
            const teams = [];
            const teamElements = document.querySelectorAll('div[class*="TeamFigure_tfContent"]');
            
            teamElements.forEach(el => {
                const mainLink = el.querySelector('a[class*="TeamFigure_tfMainLink"]');
                const statsLink = el.querySelector('a[href*="/stats/team/"]');

                if (mainLink && statsLink) {
                    const team_name = mainLink.innerText;
                    const hrefParts = statsLink.getAttribute('href').split('/');
                    const team_id = parseInt(hrefParts[hrefParts.length - 1], 10);
                    const url_slug = mainLink.getAttribute('href').split('/')[1];
                    
                    if (team_id && team_name && url_slug) {
                        teams.push({ team_id, team_name, url_slug });
                    }
                }
            });
            return teams;
        });

        if (teamsData.length === 0) {
            console.error('❌ Found 0 teams. The website HTML has likely changed. Please check the selectors.');
            return;
        }

        console.log(`Found ${teamsData.length} teams. Inserting into database...`);

        for (const team of teamsData) {
            const team_abbreviation = TEAM_SLUG_TO_ABBREVIATION[team.url_slug] || null;
            if (!team_abbreviation) {
                console.warn(`Could not find abbreviation for slug: ${team.url_slug}`);
                continue;
            }

            const query = `
                INSERT INTO teams (team_id, team_name, team_abbreviation, url_slug)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (team_id) DO NOTHING;
            `;
            await client.query(query, [team.team_id, team.team_name, team_abbreviation, team.url_slug]);
        }

        console.log('✅ Team data has been successfully seeded.');

    } catch (err) {
        console.error('❌ An error occurred during the process:', err);
    } finally {
        await browser.close();
        await client.release();
        await pool.end();
        console.log('--- Script finished ---');
    }
};

main();