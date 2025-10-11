import express from 'express';
import { getNFLTeamLines, getNFLPlayerProps, getNFLEventIds } from '../controllers/nflbets.controllers.js';

const router = express.Router();

router.get('/', getNFLTeamLines);

router.get('/nflgames', getNFLEventIds);

router.get('/playerprops', getNFLPlayerProps);

export default router;