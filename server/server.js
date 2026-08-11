import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import stats from './routes/stats.routes.js';
import userFavorites from './routes/user.routes.js';
import teams from './routes/teams.routes.js';
import chat from './routes/chat.routes.js';
import bets, { legacyBetsRouter } from './routes/bets.routes.js';
import playerprops from './routes/playerprops.routes.js';
import kalshi from './routes/kalshi.routes.js';
import { getQuota } from './lib/oddsApi.js';
import { sportIds } from './config/sports.js';
dotenv.config()

const app = express();

app.use(cors());
app.use(express.json());

app.use("/players", stats);
app.use('/users', userFavorites);
app.use('/teams', teams);
app.use('/chat', chat);
// Canonical multi-sport scheme.
app.use('/bets', bets);

// Deprecated per-sport mounts, kept so the deployed frontend keeps working
// through the window where Render has shipped but Vercel hasn't. They serve the
// same handlers and carry Deprecation/Sunset headers.
app.use('/nbabets', legacyBetsRouter('nba'));
app.use('/nflbets', legacyBetsRouter('nfl'));

app.use('/playerprops', playerprops);
app.use('/kalshi', kalshi);

// Cheap liveness + the Odds API credit budget, which nothing surfaced before.
app.get('/health', (req, res) => {
    res.json({ ok: true, sports: sportIds(), oddsQuota: getQuota() });
});

app.listen(5000, () => {
    console.log("Server has started on port 5000")
});