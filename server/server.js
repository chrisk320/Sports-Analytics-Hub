import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import stats from './routes/stats.routes.js';
import userFavorites from './routes/user.routes.js';
import teams from './routes/teams.routes.js';
import chat from './routes/chat.routes.js';
import nbabets from './routes/nbabets.routes.js';
import nflbets from './routes/nflbets.routes.js';
dotenv.config()

const app = express();

// Configure CORS for Azure deployment
const corsOptions = {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true
};
app.use(cors(corsOptions));
app.use(express.json());

app.use("/players", stats);
app.use('/users', userFavorites);
app.use('/teams', teams);
app.use('/chat', chat);
app.use('/nbabets', nbabets);
app.use('/nflbets', nflbets);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server has started on port ${PORT}`)
});