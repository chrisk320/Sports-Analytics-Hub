import express from 'express';
import { getNBATeamLines, getNBATeamLinesByEventId, getNBAEventIds, getNBAPlayerPropsByEventId, getNBAFutures } from '../controllers/nbabets.controllers.js';

const router = express.Router();

router.get('/futures/:market', getNBAFutures);

router.get('/nbateamlines', getNBATeamLines);

router.get('/nbateamlines/:eventId', getNBATeamLinesByEventId);

router.get('/nbagames', getNBAEventIds);

// NOTE: the bulk `/nbaplayerprops` route was removed. It fanned out one
// per-event Odds API call PER GAME on every request (~120 credits for a single
// HTTP hit on a full slate), was public and unauthenticated, and nothing in the
// frontend ever called it. Per-game props come from the :eventId route below;
// the whole slate comes from the DB-backed /playerprops endpoints.
router.get('/nbaplayerprops/:eventId', getNBAPlayerPropsByEventId);

export default router;