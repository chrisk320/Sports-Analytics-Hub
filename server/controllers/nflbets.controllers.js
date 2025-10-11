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
    try {
        const response = await axios.get(`https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds/`, {
            params: {
                apiKey: process.env.ODDS_API_KEY,
                regions: 'us,us2',
                markets: 'h2h,spreads,totals',
                bookmakers: 'draftkings,fanduel,betmgm,betus,espnbet',
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

export const getNFLEventIds = async (req, res) => {
    const start_date = getTodaysDateISO();
    const end_date = getEndDateISO();
    try {
        const response = await axios.get(`https://api.the-odds-api.com/v4/sports/americanfootball_nfl/events?apiKey=${process.env.ODDS_API_KEY}`, {
            params: {
                dateFormat: 'iso',
                commenceTimeFrom: start_date,
                commenceTimeTo: end_date
            }
        });
        
        const games = response.data.map(event => ({
            id: event.id,
            home_team: event.home_team,
            away_team: event.away_team,
            commence_time: event.commence_time,
            sport_title: event.sport_title
        }));
        
        res.json(games);
    } catch (error) {
        console.error('Error fetching NFL event IDs:', error);
        res.status(500).json({ error: 'Failed to fetch NFL event IDs'});
    }
};

async function fetchNFLEventIds() {
    const start_date = getTodaysDateISO();
    const end_date = getEndDateISO();
    try {
        const response = await axios.get(`https://api.the-odds-api.com/v4/sports/americanfootball_nfl/events?apiKey=${process.env.ODDS_API_KEY}`, {
            params: {
                dateFormat: 'iso',
                commenceTimeFrom: start_date,
                commenceTimeTo: end_date
            }
        });
        return response.data;
    } catch (error) {
        console.error('Error fetching NFL event IDs:', error);
        throw error;
    }
}

export const getNFLPlayerProps = async (req, res) => {
    const data = await fetchNFLEventIds();
    try {
        const promises = data.map(event => {
            const eventId = event.id
            return axios.get(`https://api.the-odds-api.com/v4/sports/americanfootball_nfl/events/${eventId}/odds/`, {
                params: {
                    apiKey: process.env.ODDS_API_KEY,
                    regions: 'us,us2,us_dfs',
                    markets:'player_pass_yds,player_rush_yds,player_reception_yds',
                    bookmakers: 'draftkings,fanduel,betmgm,betus,espnbet,prizepicks,underdog',
                    oddsFormat: 'american',
                    dateFormat: 'iso',
                }
            });
        });
        const responses = await Promise.all(promises);

        const allData = responses.map(response => response.data);

        res.json(allData);
    } catch (error) {
        console.error('Error fetching team lines:', error);
        res.status(500).json({ error: 'Failed to fetch player props' });
    }
};