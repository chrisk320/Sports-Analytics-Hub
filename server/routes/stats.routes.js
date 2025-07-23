import express from 'express';
import { getGameLogs, getPlayers, getSeasonAverages, getPlayer, getFullGameLogs } from '../controllers/stats.controllers.js';

const router = express.Router();

router.get('/', getPlayers);

router.get('/:playerId', getPlayer)

router.get('/:playerId/season-averages', getSeasonAverages)

router.get('/:playerId/gamelogs', getGameLogs);

router.get('/:playerId/full-gamelogs', getFullGameLogs)

export default router;