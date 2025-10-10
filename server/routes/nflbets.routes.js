import express from 'express';
import { getNFLTeamLines, getNFLPlayerProps } from '../controllers/nflbets.controllers.js';

const router = express.Router();

router.get('/', getNFLTeamLines);

router.get('/playerprops', getNFLPlayerProps);

export default router;