import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import stats from './routes/stats.routes.js';
import userFavorites from './routes/user.routes.js';
import teams from './routes/teams.routes.js';
import chat from './routes/chat.routes.js';
import bets, { legacyBetsRouter } from './routes/bets.routes.js';
import playerprops from './routes/playerprops.routes.js';
import kalshi from './routes/kalshi.routes.js';
import grades from './routes/grades.routes.js';
import { getQuota } from './lib/oddsApi.js';
import { sportIds } from './config/sports.js';
dotenv.config()

const app = express();

app.use(cors());
app.use(express.json());

// Render and Vercel both sit behind a proxy, so the client IP arrives in
// X-Forwarded-For. Without this every request looks like it came from the
// proxy and the whole internet shares one rate-limit bucket. Trust exactly one
// hop rather than `true`, which would let a client spoof the header.
app.set('trust proxy', 1);

// Rate limit only the routes that cost money. The Odds API is metered and this
// project runs on a 500-credit monthly tier, so this is budget protection
// rather than generic hardening -- a caller looping an uncached endpoint is
// spending real quota. Reads served purely from Postgres are not limited,
// because they cost nothing and throttling them only degrades the app.
const oddsLimiter = rateLimit({
    windowMs: 60_000,
    limit: 60,               // generous for a human, useless for a scraper
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many requests. Odds data is rate limited to protect a metered API budget.' },
});

app.use("/players", stats);
app.use('/users', userFavorites);
app.use('/teams', teams);
app.use('/chat', chat);
// Canonical multi-sport scheme.
app.use('/bets', oddsLimiter, bets);

// Deprecated per-sport mounts, kept so the deployed frontend keeps working
// through the window where Render has shipped but Vercel hasn't. They serve the
// same handlers and carry Deprecation/Sunset headers.
app.use('/nbabets', oddsLimiter, legacyBetsRouter('nba'));
app.use('/nflbets', oddsLimiter, legacyBetsRouter('nfl'));

app.use('/playerprops', playerprops);
app.use('/kalshi', oddsLimiter, kalshi);

// Settled props. Database-only, so deliberately outside oddsLimiter.
app.use('/grades', grades);

// Cheap liveness + the Odds API credit budget, which nothing surfaced before.
app.get('/health', (req, res) => {
    res.json({ ok: true, sports: sportIds(), oddsQuota: getQuota() });
});

app.listen(5000, () => {
    console.log("Server has started on port 5000")
});