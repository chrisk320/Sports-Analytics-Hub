import express from 'express';
import { getGameLogs, getPlayers, getSeasonAverages, getPlayer, getFullGameLogs, getGameLogsByOpponent, getSeasons, getLeaderboard } from '../controllers/stats.controllers.js';

const router = express.Router();

router.get('/', getPlayers);

// Static routes must precede '/:playerId' so they aren't swallowed by the param.
router.get('/seasons', getSeasons);

router.get('/leaderboard', getLeaderboard);

router.get('/:playerId', getPlayer)

router.get('/:playerId/season-averages', getSeasonAverages)

router.get('/:playerId/gamelogs', getGameLogs);

router.get('/:playerId/full-gamelogs', getFullGameLogs)

router.get('/:playerId/gamelogs/:opponentAbbr', getGameLogsByOpponent)

export default router;