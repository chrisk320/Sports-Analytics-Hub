import express from 'express';
import { getTeamLines } from '../controllers/bets.controllers.js';

const router = express.Router();

router.get('/', getTeamLines);

export default router;