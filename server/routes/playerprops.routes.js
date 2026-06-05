import express from 'express';
import { getPlayerProps, getPlayerGameToday, refreshPlayerProps, getTodaysProps, getPropsByGame } from '../controllers/playerprops.controllers.js';

const router = express.Router();

// Specific routes BEFORE '/:playerId' or Express treats "today"/"game" as a playerId.
// All of today's props (for Home dashboard + Compare).
router.get('/today', getTodaysProps);
// All props for one game (for Game Detail).
router.get('/game/:gameId', getPropsByGame);

// Get player props for a specific player
router.get('/:playerId', getPlayerProps);

// Check if player has a game today
router.get('/:playerId/game', getPlayerGameToday);

// Manual refresh trigger (can be called by cron or admin)
router.post('/refresh', refreshPlayerProps);

export default router;
