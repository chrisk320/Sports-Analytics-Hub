import express from 'express';
import { getKalshiNBAGames, getKalshiMarket } from '../controllers/kalshi.controllers.js';

const router = express.Router();

// Static route first so '/:market' doesn't swallow '/nbagames'.
router.get('/nbagames', getKalshiNBAGames);

router.get('/:market', getKalshiMarket);

export default router;
