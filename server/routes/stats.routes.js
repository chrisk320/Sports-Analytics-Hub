import express from 'express';
import { getAllStats } from '../controllers/stats.controllers.js';

const router = express.Router();

router.get('/all', getAllStats);

export default router;