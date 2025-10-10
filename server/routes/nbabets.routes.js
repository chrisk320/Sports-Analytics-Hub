import express from 'express';
import { getNBATeamLines } from '../controllers/nbabets.controllers.js';

const router = express.Router();

router.get('/', getNBATeamLines);

export default router;