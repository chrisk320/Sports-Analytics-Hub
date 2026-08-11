// Sport-agnostic betting-odds handlers.
//
// Replaces nbabets.controllers.js and nflbets.controllers.js, which were
// near-identical 180-line files differing only in literal values now held in
// server/config/sports.js. Every handler reads req.sport, populated by the
// requireSport middleware from either the :sport route param or a legacy
// route's pinned id.

import { listEvents, getBulkOdds, getEventOdds, getFutures } from '../lib/oddsApi.js';

// Small wrapper so each handler is just its happy path. Keeping the sport id in
// the log line matters now that one function serves three leagues.
const handle = (label, fn) => async (req, res) => {
  try {
    res.json(await fn(req));
  } catch (error) {
    const detail = error?.response?.data || error.message;
    console.error(`[bets] ${req.sport?.id ?? '?'} ${label} failed:`, detail);
    res.status(500).json({ error: `Failed to fetch ${label}` });
  }
};

// Upcoming games. Backed by the free /events endpoint — no credit cost.
export const getGames = handle('games', (req) => listEvents(req.sport));

// Team lines for the whole slate in one upstream call.
export const getTeamLines = handle('team lines', (req) => getBulkOdds(req.sport));

// Team lines for one game.
export const getTeamLinesByEvent = handle('team lines', (req) =>
  getEventOdds(req.sport, req.params.eventId, 'team')
);

// Player props for one game. Deliberately per-event only: the bulk variant
// that used to exist fanned out a paid call for every game on the slate on
// every request (~120 credits for one HTTP hit) and had no frontend caller.
export const getPlayerPropsByEvent = handle('player props', (req) =>
  getEventOdds(req.sport, req.params.eventId, 'props')
);

// Outrights. The whitelist lives in the sport config so an arbitrary :market
// can't be forwarded upstream.
export const getFuturesMarket = async (req, res) => {
  const { market } = req.params;
  try {
    const data = await getFutures(req.sport, market);
    if (data === null) {
      const allowed = Object.keys(req.sport.futures || {});
      return res.status(400).json({
        error: allowed.length
          ? `Invalid futures market '${market}' for ${req.sport.label}. Allowed: ${allowed.join(', ')}`
          : `${req.sport.label} has no futures markets configured`,
      });
    }
    res.json(data);
  } catch (error) {
    console.error(`[bets] ${req.sport.id} futures failed:`, error?.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch futures' });
  }
};
