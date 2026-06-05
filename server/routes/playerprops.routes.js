import express from 'express';
import { getPlayerProps, getPlayerGameToday, refreshPlayerProps, getTodaysProps } from '../controllers/playerprops.controllers.js';

const router = express.Router();

// All of today's props (for Home dashboard + Compare).
// NOTE: must be declared before '/:playerId' or Express treats "today" as a playerId.
router.get('/today', getTodaysProps);

// Get player props for a specific player
router.get('/:playerId', getPlayerProps);

// Check if player has a game today
router.get('/:playerId/game', getPlayerGameToday);

// Manual refresh trigger (can be called by cron or admin)
router.post('/refresh', refreshPlayerProps);

export default router;
