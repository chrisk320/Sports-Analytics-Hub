import express from 'express';
import { getKalshiNBAGames } from '../controllers/kalshi.controllers.js';

const router = express.Router();

router.get('/nbagames', getKalshiNBAGames);

export default router;
