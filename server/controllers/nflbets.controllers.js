import axios from 'axios';

function getTodaysDateISO() {
    const today = new Date();
    const formatted_date = today.toISOString().split('.')[0] + 'Z';
    return formatted_date;
}

function getEndDateISO() {
    const today = new Date();
    const end_date = new Date(today);

    end_date.setDate(today.getDate() + 14);
    const formatted_date = end_date.toISOString().split('.')[0] + 'Z';
    return formatted_date;
}

export const getNFLTeamLines = async (req, res) => {
    const start_date = getTodaysDateISO();
    const end_date = getEndDateISO();
    console.log(start_date, end_date);
    try {
        const response = await axios.get(`https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds/`, {
            params: {
                apiKey: process.env.ODDS_API_KEY,
                regions: 'us,us2',
                markets: 'h2h,spreads,totals',
                bookmakers: 'draftkings,fanduel,betmgm,betus,fanatics,espnbet',
                oddsFormat: 'american',
                dateFormat: 'iso',
                commenceTimeFrom: start_date,
                commenceTimeTo: end_date
            }
        });
        res.json(response.data);
    } catch (error) {
        console.error('Error fetching team lines:', error);
        res.status(500).json({ error: 'Failed to fetch team lines' });
    }
};