import express from 'express';
import { chatWithAI } from '../controllers/chat.controllers.js';

const router = express.Router();

router.post('/', chatWithAI);

export default router; 