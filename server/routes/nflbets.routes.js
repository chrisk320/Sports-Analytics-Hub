import express from 'express';
import { getNFLTeamLines } from '../controllers/nflbets.controllers.js';

const router = express.Router();

router.get('/', getNFLTeamLines);

export default router;