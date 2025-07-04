import express from 'express';
import { getFavorites, addFavorite, deleteFavorite } from '../controllers/user.controllers.js';

const router = express.Router();

router.get('/:userId/favorites', getFavorites);

router.post('/:userId/favorites', addFavorite);

router.delete('/:userId/favorites/:playerId', deleteFavorite);

export default router;