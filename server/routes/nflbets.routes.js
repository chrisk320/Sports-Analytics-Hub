import express from 'express';
import { getNFLTeamLines, getNFLPlayerProps, getNFLEventIds, getNFLTeamLinesByEventId, getNFLPlayerPropsByEventId } from '../controllers/nflbets.controllers.js';

const router = express.Router();

router.get('/nflteamlines', getNFLTeamLines);

router.get('/nflteamlines/:eventId', getNFLTeamLinesByEventId);

router.get('/nflgames', getNFLEventIds);

router.get('/nflplayerprops', getNFLPlayerProps);

router.get('/nflplayerprops/:eventId', getNFLPlayerPropsByEventId);

export default router;