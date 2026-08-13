import express from 'express';
import { getPlayerProps, getPlayerGameToday, getTodaysProps, getPropsByGame } from '../controllers/playerprops.controllers.js';

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

// No write route. Props are loaded by the scheduled job in
// scripts/fetch_props.mjs; the POST /refresh that used to sit here
// was an unauthenticated Odds API fan-out worth ~120 credits per call.

export default router;
