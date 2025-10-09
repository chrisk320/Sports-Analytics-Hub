import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import stats from './routes/stats.routes.js';
import userFavorites from './routes/user.routes.js';
import teams from './routes/teams.routes.js';
import chat from './routes/chat.routes.js';
import bets from './routes/bets.routes.js';

dotenv.config()

const app = express();

app.use(cors());
app.use(express.json());

app.use("/players", stats);
app.use('/users', userFavorites);
app.use('/teams', teams);
app.use('/chat', chat);
app.use('/bets', bets);

app.listen(5000, () => {
    console.log("Server has started on port 5000")
});