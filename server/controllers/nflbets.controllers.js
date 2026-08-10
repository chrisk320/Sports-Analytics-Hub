import axios from 'axios';
import { getOrFetch } from '../lib/cache.js';

// The Odds API bills per request (markets x regions), so every handler here goes
// through the TTL cache — otherwise credit spend scales with user traffic rather
// than with time. See server/lib/cache.js.
const ODDS_BASE = 'https://api.the-odds-api.com/v4/sports';
const SPORT_KEY = 'americanfootball_nfl';
const BOOKMAKERS = 'draftkings,fanduel,betmgm,betus,espnbet';
const PROP_BOOKMAKERS = 'draftkings,fanduel,betmgm,betus,espnbet,prizepicks,underdog';
const PROP_MARKETS = 'player_pass_yds,player_rush_yds,player_reception_yds';

// Lines move, but not second to second. Futures barely move at all.
const LINES_TTL_MS = 60_000;
const FUTURES_TTL_MS = 300_000;

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
        const { data } = await getOrFetch('nfl:teamlines', LINES_TTL_MS, async () => {
            const response = await axios.get(`${ODDS_BASE}/${SPORT_KEY}/odds/`, {
                params: {
                    apiKey: process.env.ODDS_API_KEY,
                    regions: 'us,us2',
                    markets: 'h2h,spreads,totals',
                    bookmakers: BOOKMAKERS,
                    oddsFormat: 'american',
                    dateFormat: 'iso',
                    commenceTimeFrom: start_date,
                    commenceTimeTo: end_date
                }
            });
            return response.data;
        });
        res.json(data);
    } catch (error) {
        console.error('Error fetching team lines:', error);
        res.status(500).json({ error: 'Failed to fetch team lines' });
    }
};

export const getNFLTeamLinesByEventId = async (req, res) => {
    const { eventId } = req.params;
    try {
        const { data } = await getOrFetch(`nfl:teamlines:${eventId}`, LINES_TTL_MS, async () => {
            const response = await axios.get(`${ODDS_BASE}/${SPORT_KEY}/events/${eventId}/odds/`, {
                params: {
                    apiKey: process.env.ODDS_API_KEY,
                    regions: 'us,us2',
                    markets: 'h2h,spreads,totals',
                    bookmakers: BOOKMAKERS,
                    oddsFormat: 'american',
                    dateFormat: 'iso',
                }
            });
            return response.data;
        });
        res.json(data);
    } catch (error) {
        console.error('Error fetching team lines by event ID:', error);
        res.status(500).json({ error: 'Failed to fetch team lines by event ID' });
    }
}

export const getNFLEventIds = async (req, res) => {
    const start_date = getTodaysDateISO();
    const end_date = getEndDateISO();
    try {
        const { data } = await getOrFetch('nfl:events', LINES_TTL_MS, async () => {
            const response = await axios.get(`${ODDS_BASE}/${SPORT_KEY}/events?apiKey=${process.env.ODDS_API_KEY}`, {
                params: {
                    dateFormat: 'iso',
                    commenceTimeFrom: start_date,
                    commenceTimeTo: end_date
                }
            });

            return response.data.map(event => ({
                id: event.id,
                home_team: event.home_team,
                away_team: event.away_team,
                commence_time: event.commence_time,
                sport_title: event.sport_title
            }));
        });

        res.json(data);
    } catch (error) {
        console.error('Error fetching NFL event IDs:', error);
        res.status(500).json({ error: 'Failed to fetch NFL event IDs'});
    }
};

// Offseason futures (outrights). Separate Odds API "sport" keys. Confirm/extend
// against GET https://api.the-odds-api.com/v4/sports/?apiKey=... (lists futures).
const NFL_FUTURES_SPORTS = {
    superbowl: 'americanfootball_nfl_super_bowl_winner',
};

export const getNFLFutures = async (req, res) => {
    const { market } = req.params;
    const sportKey = NFL_FUTURES_SPORTS[market];
    if (!sportKey) {
        return res.status(400).json({ error: `Invalid futures market. Allowed: ${Object.keys(NFL_FUTURES_SPORTS).join(', ')}` });
    }
    try {
        const { data } = await getOrFetch(`nfl:futures:${market}`, FUTURES_TTL_MS, async () => {
            const response = await axios.get(`${ODDS_BASE}/${sportKey}/odds/`, {
                params: {
                    apiKey: process.env.ODDS_API_KEY,
                    regions: 'us,us2',
                    markets: 'outrights',
                    bookmakers: BOOKMAKERS,
                    oddsFormat: 'american',
                    dateFormat: 'iso',
                }
            });
            return response.data;
        });
        res.json(data);
    } catch (error) {
        console.error('Error fetching NFL futures:', error?.response?.data || error.message);
        res.status(500).json({ error: 'Failed to fetch NFL futures' });
    }
};

export const getNFLPlayerPropsByEventId = async (req, res) => {
    const { eventId } = req.params;
    try {
        const { data } = await getOrFetch(`nfl:props:${eventId}`, LINES_TTL_MS, async () => {
            const response = await axios.get(`${ODDS_BASE}/${SPORT_KEY}/events/${eventId}/odds/`, {
                params: {
                    apiKey: process.env.ODDS_API_KEY,
                    regions: 'us,us2,us_dfs',
                    markets: PROP_MARKETS,
                    bookmakers: PROP_BOOKMAKERS,
                    oddsFormat: 'american',
                    dateFormat: 'iso',
                }
            });
            return response.data;
        });
        res.json(data);
    } catch (error) {
        console.error('Error fetching player props by event ID:', error);
        res.status(500).json({ error: 'Failed to fetch player props by event ID' });
    }
};
