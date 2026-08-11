// The single place that talks to The Odds API.
//
// Everything goes through the TTL cache (server/lib/cache.js) because the API
// bills per request, so without caching the spend scales with user traffic
// rather than with time.
//
// Credit model, which is the whole reason these three functions are separate:
//   listEvents()    0 credits              — free, call it freely
//   getBulkOdds()   markets x regions      — ONCE for the entire slate
//   getEventOdds()  markets x regions      — PER GAME, this is the budget
// A bulk call for team lines across a 15-game slate costs the same as for a
// 1-game slate. Player props are the opposite, which is why they are fetched
// by the scheduled job into the DB rather than proxied per request.

import axios from 'axios';
import { getOrFetch } from './cache.js';

const BASE = 'https://api.the-odds-api.com/v4/sports';

const LINES_TTL_MS = 60_000;   // lines move, but not second to second
const FUTURES_TTL_MS = 300_000; // futures barely move

// Last quota reading seen from any call, for /health and the budget guard.
// The Odds API returns these on every billed response.
let lastQuota = { remaining: null, used: null, lastCost: null, at: null };

export const getQuota = () => ({ ...lastQuota });

function recordQuota(headers, label) {
  const remaining = Number(headers?.['x-requests-remaining']);
  const used = Number(headers?.['x-requests-used']);
  const lastCost = Number(headers?.['x-requests-last']);
  if (!Number.isFinite(remaining)) return;

  lastQuota = {
    remaining,
    used: Number.isFinite(used) ? used : null,
    lastCost: Number.isFinite(lastCost) ? lastCost : null,
    at: new Date().toISOString(),
  };

  // Loud when it matters. The previous code read these headers nowhere, so the
  // only way to notice an exhausted quota was the dashboard.
  if (remaining <= 0) {
    console.error(`[odds] QUOTA EXHAUSTED after ${label} — requests will fail until reset`);
  } else if (remaining < 500) {
    console.warn(`[odds] quota low: ${remaining} credits left (after ${label}, cost ${lastCost})`);
  }
}

async function request(url, params, label) {
  const res = await axios.get(url, {
    params: { apiKey: process.env.ODDS_API_KEY, dateFormat: 'iso', ...params },
  });
  recordQuota(res.headers, label);
  return res.data;
}

function windowFor(sport) {
  const now = new Date();
  const end = new Date(now);
  end.setDate(now.getDate() + sport.lookaheadDays);
  const iso = (d) => d.toISOString().split('.')[0] + 'Z';
  return { commenceTimeFrom: iso(now), commenceTimeTo: iso(end) };
}

/**
 * Upcoming events for a sport. FREE — costs no credits.
 * Returns the trimmed shape the frontend game lists expect.
 */
export async function listEvents(sport) {
  const { data } = await getOrFetch(`${sport.id}:events`, LINES_TTL_MS, async () => {
    const raw = await request(`${BASE}/${sport.oddsSportKey}/events`, windowFor(sport), `${sport.id} events`);
    return (raw || []).map((e) => ({
      id: e.id,
      home_team: e.home_team,
      away_team: e.away_team,
      commence_time: e.commence_time,
      sport_title: e.sport_title,
    }));
  });
  return data;
}

/**
 * Team lines for the whole slate in ONE request.
 * Cost: [teamMarkets] x [regions.team] total, regardless of game count.
 */
export async function getBulkOdds(sport) {
  const { data } = await getOrFetch(`${sport.id}:teamlines`, LINES_TTL_MS, () =>
    request(
      `${BASE}/${sport.oddsSportKey}/odds/`,
      {
        regions: sport.regions.team,
        markets: sport.teamMarkets.join(','),
        bookmakers: sport.bookmakers.team,
        oddsFormat: 'american',
        ...windowFor(sport),
      },
      `${sport.id} bulk odds`
    )
  );
  return data;
}

/**
 * Odds for ONE event. Cost is per game, so callers should be deliberate.
 * `kind` selects team lines vs player props (different markets/regions/books).
 */
export async function getEventOdds(sport, eventId, kind = 'team') {
  const isProps = kind === 'props';
  const markets = isProps ? sport.propMarkets : sport.teamMarkets;
  const key = `${sport.id}:${kind}:${eventId}`;

  const { data } = await getOrFetch(key, LINES_TTL_MS, () =>
    request(
      `${BASE}/${sport.oddsSportKey}/events/${eventId}/odds/`,
      {
        regions: isProps ? sport.regions.props : sport.regions.team,
        markets: markets.join(','),
        bookmakers: isProps ? sport.bookmakers.props : sport.bookmakers.team,
        oddsFormat: 'american',
      },
      `${sport.id} event ${kind}`
    )
  );
  return data;
}

/**
 * Outright/futures market. These are separate Odds API sport keys.
 * Returns null if the market isn't in the sport's whitelist, so the caller
 * can 400 rather than letting an arbitrary key reach the upstream API.
 */
export async function getFutures(sport, market) {
  const futuresKey = sport.futures?.[market];
  if (!futuresKey) return null;

  const { data } = await getOrFetch(`${sport.id}:futures:${market}`, FUTURES_TTL_MS, () =>
    request(
      `${BASE}/${futuresKey}/odds/`,
      {
        regions: sport.regions.team,
        markets: 'outrights',
        bookmakers: sport.bookmakers.team,
        oddsFormat: 'american',
      },
      `${sport.id} futures ${market}`
    )
  );
  return data;
}
