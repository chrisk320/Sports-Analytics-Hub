import express from 'express';
import { getGameLogs, getPlayers, getSeasonAverages, getPlayer } from '../controllers/stats.controllers.js';

const router = express.Router();

router.get('/', getPlayers);

router.get('/:playerId', getPlayer)

router.get('/:playerId/season-averages', getSeasonAverages)

router.get('/:playerId/gamelogs', getGameLogs);

export default router;