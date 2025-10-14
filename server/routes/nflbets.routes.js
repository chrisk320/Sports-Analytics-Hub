import express from 'express';
import { getNFLTeamLines, getNFLPlayerProps, getNFLEventIds, getNFLTeamLinesByEventId } from '../controllers/nflbets.controllers.js';

const router = express.Router();

router.get('/nflteamlines', getNFLTeamLines);

router.get('/nflteamlines/:eventId', getNFLTeamLinesByEventId);

router.get('/nflgames', getNFLEventIds);

router.get('/nflplayerprops', getNFLPlayerProps);

export default router;