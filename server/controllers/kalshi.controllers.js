import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const KALSHI_BASE = 'https://api.elections.kalshi.com/trade-api/v2';
const SERIES_TICKER = 'KXNBAGAME';
const CACHE_TTL_MS = 60_000;
const MAX_PAGES = 10;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_PATH = path.join(__dirname, '..', 'data', 'kalshi-sample.json');

let cache = { data: null, expiresAt: 0 };

const MONTHS = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };

// Parse "KXNBAGAME-26JUN10SASNYK" -> { date: '2026-06-10', awayAbbr: 'SAS', homeAbbr: 'NYK' }.
// Returns nulls for whatever can't be parsed; matching falls back to title matching.
export function parseEventTicker(eventTicker) {
    const result = { date: null, awayAbbr: null, homeAbbr: null };
    if (typeof eventTicker !== 'string') return result;
    const segment = eventTicker.split('-')[1];
    if (!segment) return result;

    const match = segment.match(/^(\d{2})([A-Z]{3})(\d{2})([A-Z]+)$/);
    if (!match) return result;

    const [, yy, mon, dd, teams] = match;
    if (MONTHS[mon]) result.date = `20${yy}-${MONTHS[mon]}-${dd}`;
    if (teams.length === 6) {
        result.awayAbbr = teams.slice(0, 3);
        result.homeAbbr = teams.slice(3);
    }
    return result;
}

// Raw Kalshi event (with nested markets) -> normalized event for the frontend.
export function normalizeEvent(event) {
    const { date, awayAbbr, homeAbbr } = parseEventTicker(event.event_ticker);
    return {
        eventTicker: event.event_ticker,
        title: event.title || '',
        date,
        awayAbbr,
        homeAbbr,
        url: `https://kalshi.com/markets/kxnbagame/professional-basketball-game/${event.event_ticker.toLowerCase()}`,
        markets: (event.markets || [])
            .filter(m => m.status === 'active' || m.status === 'open')
            .map(m => ({
                ticker: m.ticker,
                team: m.yes_sub_title || m.title || '',
                yesBid: m.yes_bid ?? null,
                yesAsk: m.yes_ask ?? null,
                lastPrice: m.last_price ?? null,
                volume: m.volume ?? 0,
                closeTime: m.close_time ?? null
            }))
    };
}

async function fetchAllNbaGameEvents() {
    const events = [];
    let cursor;
    for (let page = 0; page < MAX_PAGES; page++) {
        const response = await axios.get(`${KALSHI_BASE}/events`, {
            params: {
                series_ticker: SERIES_TICKER,
                status: 'open',
                with_nested_markets: true,
                limit: 200,
                ...(cursor ? { cursor } : {})
            }
        });
        events.push(...(response.data.events || []));
        cursor = response.data.cursor;
        if (!cursor) break;
    }
    return events;
}

export const getKalshiNBAGames = async (req, res) => {
    if (cache.data && Date.now() < cache.expiresAt) {
        return res.json(cache.data);
    }
    try {
        const rawEvents = process.env.KALSHI_SAMPLE === 'true'
            ? JSON.parse(fs.readFileSync(SAMPLE_PATH, 'utf8')).events
            : await fetchAllNbaGameEvents();

        const data = {
            fetchedAt: new Date().toISOString(),
            events: rawEvents.map(normalizeEvent)
        };
        cache = { data, expiresAt: Date.now() + CACHE_TTL_MS };
        res.json(data);
    } catch (error) {
        console.error('Error fetching Kalshi NBA markets:', error);
        if (cache.data) {
            return res.json(cache.data);
        }
        res.status(500).json({ error: 'Failed to fetch Kalshi NBA markets' });
    }
};
