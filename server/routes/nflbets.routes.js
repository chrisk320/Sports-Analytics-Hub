import express from 'express';
import { getNFLTeamLines, getNFLEventIds, getNFLTeamLinesByEventId, getNFLPlayerPropsByEventId, getNFLFutures } from '../controllers/nflbets.controllers.js';

const router = express.Router();

router.get('/futures/:market', getNFLFutures);

router.get('/nflteamlines', getNFLTeamLines);

router.get('/nflteamlines/:eventId', getNFLTeamLinesByEventId);

router.get('/nflgames', getNFLEventIds);

// NOTE: the bulk `/nflplayerprops` route was removed — same reason as the NBA
// one: it fanned out a per-event Odds API call for every game on the slate on
// each request, was public and unauthenticated, and had no frontend caller.
router.get('/nflplayerprops/:eventId', getNFLPlayerPropsByEventId);

export default router;