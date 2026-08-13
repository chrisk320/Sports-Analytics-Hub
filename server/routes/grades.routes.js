import express from 'express';
import { getGradedProps } from '../controllers/grades.controllers.js';

const router = express.Router();

// Settled props with a win/loss/ROI/CLV summary.
// Reads only the database, so it costs no Odds API credits and needs no limiter.
router.get('/', getGradedProps);

export default router;
