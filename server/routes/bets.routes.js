import express from 'express';
import { requireSport } from '../config/sports.js';
import {
  getGames,
  getTeamLines,
  getTeamLinesByEvent,
  getPlayerPropsByEvent,
  getFuturesMarket,
} from '../controllers/bets.controllers.js';

// Canonical scheme: /bets/:sport/*
const router = express.Router();

router.use('/:sport', requireSport);

router.get('/:sport/games', getGames);
router.get('/:sport/teamlines', getTeamLines);
router.get('/:sport/teamlines/:eventId', getTeamLinesByEvent);
router.get('/:sport/playerprops/:eventId', getPlayerPropsByEvent);
router.get('/:sport/futures/:market', getFuturesMarket);

export default router;

/**
 * Legacy router for the old per-sport mounts (/nbabets, /nflbets).
 *
 * The deployed frontend calls these, and Render and Vercel deploy
 * independently — so there is a window where new backend code is live against
 * an old frontend bundle. Removing these paths in the same release would break
 * the site during that window.
 *
 * Pins the sport, serves the same handlers, and advertises the deprecation via
 * standard headers (RFC 8594) so the sunset date is discoverable rather than
 * living only in a commit message.
 */
export function legacyBetsRouter(sportId) {
  const legacy = express.Router();

  legacy.use((req, res, next) => {
    req.sportId = sportId;
    res.set('Deprecation', 'true');
    res.set('Sunset', 'Wed, 31 Dec 2026 23:59:59 GMT');
    res.set('Link', `</bets/${sportId}>; rel="successor-version"`);
    next();
  });
  legacy.use(requireSport);

  // Old paths repeated the sport in the segment (/nbabets/nbagames).
  legacy.get(`/${sportId}games`, getGames);
  legacy.get(`/${sportId}teamlines`, getTeamLines);
  legacy.get(`/${sportId}teamlines/:eventId`, getTeamLinesByEvent);
  legacy.get(`/${sportId}playerprops/:eventId`, getPlayerPropsByEvent);
  legacy.get('/futures/:market', getFuturesMarket);

  return legacy;
}
