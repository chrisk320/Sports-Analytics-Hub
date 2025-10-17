import express from 'express';
import { getNBATeamLines, getNBATeamLinesByEventId, getNBAEventIds, getNBAPlayerProps, getNBAPlayerPropsByEventId } from '../controllers/nbabets.controllers.js';

const router = express.Router();

router.get('/nbateamlines', getNBATeamLines);

router.get('/nbateamlines/:eventId', getNBATeamLinesByEventId);

router.get('/nbagames', getNBAEventIds);

router.get('/nbaplayerprops', getNBAPlayerProps);

router.get('/nbaplayerprops/:eventId', getNBAPlayerPropsByEventId);

export default router;