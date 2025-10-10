import axios from 'axios';

export const getNBATeamLines = async (req, res) => {
    try {
        const response = await axios.get(`https://api.the-odds-api.com/v4/sports/basketball_nba/odds/`, {
            params: {
                apiKey: process.env.ODDS_API_KEY,
                regions: 'us,us2',
                markets: 'h2h,spreads,totals',
                bookmakers: 'draftkings,fanduel,betmgm,betus,fanatics,espnbet',
                oddsFormat: 'american',
                dateFormat: 'iso'
            }
        });
        res.json(response.data);
    } catch (error) {
        console.error('Error fetching team lines:', error);
        res.status(500).json({ error: 'Failed to fetch team lines' });
    }
};