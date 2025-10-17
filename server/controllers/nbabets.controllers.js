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

export const getNBATeamLines = async (req, res) => {
    const start_date = getTodaysDateISO();
    const end_date = getEndDateISO();
    try {
        const response = await axios.get(`https://api.the-odds-api.com/v4/sports/basketball_nba/odds/`, {
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

export const getNBATeamLinesByEventId = async (req, res) => {
    const { eventId } = req.params;
    try {
        const response = await axios.get(`https://api.the-odds-api.com/v4/sports/basketball_nba/events/${eventId}/odds/`, {
            params: {
                apiKey: process.env.ODDS_API_KEY,
                regions: 'us,us2',
                markets: 'h2h,spreads,totals',
                bookmakers: 'draftkings,fanduel,betmgm,betus,fanatics,espnbet',
                oddsFormat: 'american',
                dateFormat: 'iso',
            }
        });
        res.json(response.data);
    } catch (error) {
        console.error('Error fetching team lines by event ID:', error);
        res.status(500).json({ error: 'Failed to fetch team lines by event ID' });
    }
};

export const getNBAEventIds = async (req, res) => {
    const start_date = getTodaysDateISO();
    const end_date = getEndDateISO();
    try {
        const response = await axios.get(`https://api.the-odds-api.com/v4/sports/basketball_nba/events?apiKey=${process.env.ODDS_API_KEY}`, {
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
        console.error('Error fetching NBA event IDs:', error);
        res.status(500).json({ error: 'Failed to fetch NBA event IDs' });
    }
};

async function fetchNBAEventIds() {
    const start_date = getTodaysDateISO();
    const end_date = getEndDateISO();
    try {
        const response = await axios.get(`https://api.the-odds-api.com/v4/sports/basketball_nba/events?apiKey=${process.env.ODDS_API_KEY}`, {
            params: {
                dateFormat: 'iso',
                commenceTimeFrom: start_date,
                commenceTimeTo: end_date
            }
        });
        return response.data;
    } catch (error) {
        console.error('Error fetching NBA event IDs:', error);
        throw error;
    }
};

export const getNBAPlayerProps = async (req, res) => {
    const data = await fetchNBAEventIds();
    try {
        const promises = data.map(event => {
            const eventId = event.id
            return axios.get(`https://api.the-odds-api.com/v4/sports/basketball_nba/events/${eventId}/odds/`, {
                params: {
                    apiKey: process.env.ODDS_API_KEY,
                    regions: 'us,us2',
                    markets: 'h2h,spreads,totals',
                    bookmakers: 'draftkings,fanduel,betmgm,betus,fanatics,espnbet',
                    oddsFormat: 'american',
                    commenceTimeFrom: start_date,
                    commenceTimeTo: end_date
                }
            });
        });
        const responses = await Promise.all(promises);
        const allData = responses.map(response => response.data);
        res.json(allData);
    } catch (error) {
        console.error('Error fetching player props:', error);
        res.status(500).json({ error: 'Failed to fetch player props' });
    }
};

export const getNBAPlayerPropsByEventId = async (req, res) => {
    const { eventId } = req.params;
    try {
        const response = await axios.get(`https://api.the-odds-api.com/v4/sports/basketball_nba/events/${eventId}/odds/`, {
            params: {
                apiKey: process.env.ODDS_API_KEY,
                regions: 'us,us2',
                markets: 'h2h,spreads,totals',
                bookmakers: 'draftkings,fanduel,betmgm,betus,fanatics,espnbet',
                oddsFormat: 'american',
                dateFormat: 'iso',
            }
        });
    } catch (error) {
        console.error('Error fetching player props by event ID:', error);
        res.status(500).json({ error: 'Failed to fetch player props by event ID' });
    }
};