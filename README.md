# Sports Analytics Hub

A full-stack application for analyzing **NBA, NFL and MLB** player performance and
sports-betting value. Three independent data pipelines feed a React betting
dashboard that shops player props and team lines across sportsbooks, surfaces
line-shopping savings and de-vigged +EV edges, shows market-aware player trends —
and then **grades its own advice** against what actually happened.

Roughly 157,000 game logs across 2,800 players, with prop lines stored
append-only so line movement and closing-line value survive.

**Live Demo:** [sports-analytics-hub.vercel.app](https://sports-analytics-hub.vercel.app) · **API:** [Render backend](https://sports-analytics-hub-7hse.onrender.com)

![Walkthrough](docs/screenshots/walkthrough.gif)

*A 20-second tour: tonight's board, the best-line finder, per-game props, a
role-aware player page, and the panel that settles every prop against the box
score.*

## Screens

### Sportsbook Compare — best-line finder
![Sportsbook Compare](docs/screenshots/compareBooksPage.png)

Every book's price for each prop, with the highest-paying one flagged (★), savings per $100 vs. the market, and a **de-vigged consensus Edge%** that surfaces +EV plays.

### Player Detail
![Player Detail](docs/screenshots/playerDetailPage.png)

A game-log chart with the prop line overlaid, recent logs, and tonight's props
with live EV. The market toggle is **role-aware**: a quarterback gets passing
markets, a pitcher gets strikeouts, an NBA guard gets PTS/REB/AST — derived from
the player's own game logs rather than a hardcoded list.

### Game Detail
![Game Detail](docs/screenshots/gameDetailPage.png)

Team markets — spread (or **Run Line** in baseball), total and moneyline with
the best price per side highlighted — plus player props split by team. Games
without props say so rather than rendering empty tables.

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   React SPA     │────▶│  Express API    │────▶│   PostgreSQL    │
│   (Vercel)      │     │   (Render)      │     │     (Neon)      │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                          ▲ writes
              ┌───────────────────────────────────────────┴───────────┐
              │                                                       │
  ┌───────────┴──────────┐                    ┌───────────────────────┴──────────┐
  │   Local cron (Mac)   │                    │         GitHub Actions           │
  │ Basketball Reference │                    │  nflverse · statsapi.mlb.com     │
  │  NBA logs · daily    │                    │  The Odds API props · daily      │
  └──────────────────────┘                    └──────────────────────────────────┘
      residential IP required                      datacenter IPs are fine
```

**Why the split.** Basketball Reference returns `403` to GitHub's datacenter
IPs, so that scrape has to run from a residential IP. nflverse publishes static
Parquet on GitHub Releases and `statsapi.mlb.com` is the same public JSON API
MLB.com's own scoreboard calls — both serve a cloud runner happily, so only the
NBA pipeline depends on the dev machine being awake.

### 1. Data Pipelines

Four sources feed the database on a schedule. Each sport has its own loader
because the shapes differ — football has no per-game box score in the basketball
sense, and baseball splits every player into a batting row and a pitching row.

| Script | Sport | Purpose |
|--------|-------|---------|
| `fetch_bref_all_stats.py` | NBA | Basic + advanced box scores in one pass (full season, or `--yesterday`) |
| `fetch_bref_backfill.py` | NBA | Backfill any date range — idempotent, used for playoffs |
| `fetch_headshots.py` | NBA | Headshot URLs (`nba_api`) |
| `fetch_nfl_stats.py` | NFL | Weekly stats from nflverse Parquet |
| `fetch_mlb_stats.py` | MLB | Box scores from `statsapi.mlb.com` |
| `fetch_teams.py` | MLB | Team name ↔ abbreviation mapping |
| `scripts/fetch_props.mjs` | all | Player props from The Odds API, budget-capped |
| `daily_fetch.sh` | NBA | Local cron entrypoint |

**Scheduled jobs**

| Workflow | When | What |
|---|---|---|
| [`stats-fetch.yml`](.github/workflows/stats-fetch.yml) | `0 11 * * *` | NFL + MLB game logs (2-day trailing window) |
| [`props-fetch.yml`](.github/workflows/props-fetch.yml) | `0 20 * * *` | Player props for every in-season sport |
| [`ci.yml`](.github/workflows/ci.yml) | push / PR | Lint, 167 tests, build, migrations up→down→up |
| local `cron` | `0 6 * * *` | NBA scrape (residential IP) |

**Props are sampled, not exhaustive.** Per-event prop calls cost
`markets × regions` **per game** and are the entire Odds API budget — a full MLB
slate is ~1,800 credits/month against a 500 tier. `fetch_props.mjs` derives how
many games it can afford from the credits left and the days remaining in the
period, ranks the slate by tightest spread, and covers the top few. A game that
returns no props costs nothing and does not consume a slot. `--dry-run` prints
the plan and projected cost without spending anything.

**NFL loader note.** It reads nflverse Parquet directly rather than using
`nfl_data_py`, which pins `pandas<2` and silently breaks `nba_api`. Same data,
one fewer dependency and no version conflict.

### 2. Database (PostgreSQL on Neon)

[Neon](https://neon.tech) serverless Postgres — auto-suspends when idle and
resumes sub-second. Migrations run automatically on every Render deploy via
`npm run migrate:deploy` ([node-pg-migrate](https://github.com/salsita/node-pg-migrate),
8 migrations in `server/migrations/`).

| Table | Contents |
|-------|----------|
| `players` | Master data, one row per player per sport, with `external_ids` for source keys |
| `player_game_logs` | Game-by-game stats. Sport-specific numbers live in a `stats` JSONB blob |
| `advanced_box_scores` | NBA-only advanced metrics (1:1 with `player_game_logs`) |
| `player_props` | **Append-only** prop snapshots per book |
| `player_props_latest` | View — the newest snapshot per (player, game, market, book) |
| `teams` | Team names + abbreviations, per sport |
| `user_favorites` | Saved players, scoped by sport |

**One schema, three sports.** Rather than `nfl_players` / `mlb_players` tables
that fork every query, one shared schema carries a `sport` column and a `stats`
JSONB blob for the numbers that differ. `role` distinguishes a baseball
player's batting row from their pitching row — the same game produces both for
a two-way player, and `strike_outs` means the opposite thing on each.

**Props are append-only** so line movement survives. The loader used to upsert,
which meant paying Odds API credits for a line and overwriting it within twelve
hours. History past 14 days is compacted to the closing line only; past a year
it is dropped.

Production holds ~157k game logs across five sport-seasons:

| Sport | Seasons | Players | Game logs |
|---|---|---|---|
| NBA | 2025-26 | 582 | 28,674 |
| NFL | 2024, 2025 | 728 | 12,098 |
| MLB | 2025, 2026 | 1,469 | 122,212 |

Multiple seasons per sport are the point, not incidental: hit rates and trend
charts are only meaningful with history behind them, and the leaderboard
defaults to the most recent season while the season picker reaches the rest.

### 3. Backend API (Express.js · ES Modules)

Every sport-aware route takes `?sport=` (defaulting to `nba`, so nothing that
predates the multi-sport work broke).

#### Stats (`/players`)
- `GET /players` · `GET /players/:playerId` — scoped by sport
- `GET /players/:playerId/gamelogs` · `/full-gamelogs` · `/gamelogs/:opponentAbbr`
- `GET /players/leaderboard?sport=&stat=` — per-sport stat whitelist; MLB reports
  season totals, NBA and NFL per-game rates, because that is how each sport is discussed

#### Odds (`/bets/:sport`)
- `GET /bets/:sport/games` — upcoming events (free, 0 credits)
- `GET /bets/:sport/teamlines/:eventId` — moneyline / spread / total
- `GET /bets/:sport/futures/:market` — outrights
- `/nbabets` and `/nflbets` survive as deprecated aliases carrying
  `Deprecation` / `Sunset` headers, so a stale frontend keeps working across a
  deploy gap

#### Props (`/playerprops`) — read-only
- `GET /playerprops/today` · `/game/:gameId` · `/:playerId` · `/:playerId/game`

#### Results (`/grades`)
- `GET /grades?sport=&days=` — settled props with win/loss/ROI/closing-line value

#### Other
- `GET /teams?sport=` · `GET|POST|DELETE /users/:userId/favorites?sport=`
- `GET /kalshi/:market` — prediction-market prices
- `GET /health` — liveness plus remaining Odds API credits
- `POST /chat` — natural-language stats queries (OpenAI)

**Rate limiting covers what costs money.** `/bets`, `/kalshi` and the legacy
aliases are limited to 60 req/min; database-only routes are deliberately not,
because they cost nothing and throttling them only degrades the app. `POST
/playerprops/refresh` was **deleted** — it was public, unauthenticated, and
looped every game calling the Odds API per event, roughly 120 credits for one
request against a 500-credit tier.

### 4. Frontend (React + React Router)

Every route is scoped to a sport (`/:sport/...`), and each sport is
self-contained — its own watchlist, bet slip and market registry. Shared state
lives in `Layout` and reaches pages through the router `Outlet` context.

| Route | Page | What it shows |
|-------|------|---------------|
| `/:sport` | **Home** | Live edge ticker, watchlist with sparklines + hit rates, market depth, hot edges, bet slip, and how past edges settled. Falls back to an offseason hub when a sport has no games |
| `/:sport/games` | **Games** | The slate, marked with which games have props |
| `/:sport/games/:gameId` | **Game Detail** | Team markets + player props split by team |
| `/:sport/players/:playerId` | **Player Detail** | Role-aware chart with the line overlaid, game logs, tonight's props |
| `/:sport/compare` | **Compare Books** | Best-line finder: best price flagged, savings/$100, de-vigged Edge% |
| `/:sport/explore` | **Explore** | Season leaderboards and head-to-head comparison |
| `/:sport/futures` | **Futures** | Outrights plus Kalshi prediction markets |

**Markets are a per-sport registry** (`frontend/src/lib/markets.js`). Every
market-aware helper takes `sport` as its first argument, so a missed call site
is an arity error rather than a page silently rendering basketball markets for a
baseball player. Player pages narrow the market list by the player's role,
derived from their game logs — a pitcher is offered strikeouts, not hits.

**Freshness comes from the data.** Odds carry their own `fetched_at`, so the
"lines as of" badge reports how stale the numbers are rather than when the
browser last asked — the two agree only while the pipeline is healthy.

Shared betting math (American ↔ implied/decimal, best price, de-vig, savings,
EV%, parlay) lives in `frontend/src/lib/odds.js`.

## Technology Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | React 19, Vite, Tailwind CSS 4, React Router 7, Recharts 3, shadcn/ui, Axios |
| **Backend** | Node.js (ES Modules), Express.js, express-rate-limit, node-pg-migrate |
| **Database** | PostgreSQL — [Neon](https://neon.tech) serverless |
| **Data Pipeline** | Python (pandas, psycopg, requests) + a Node props fetcher |
| **Testing** | Vitest — 140 frontend, 27 backend, gated in CI |
| **AI** | OpenAI GPT-3.5-turbo |
| **Auth** | Google OAuth 2.0 (`@react-oauth/google`) |
| **External APIs** | The Odds API, Kalshi, nflverse, MLB Stats API, Basketball Reference |
| **Hosting** | Vercel (frontend), Render (backend), Neon (database) |

## Testing

```bash
cd frontend && npx vitest run     # 140 — betting math, market registry, freshness
cd server   && npm test           # 27  — prop grading, CLV, profit
```

The suites cover the pure logic deliberately, because **the math is the
product**: a silent de-vig, EV or grading error does not crash anything, it
produces confidently wrong betting advice. CI additionally parses every backend
module (they are ES modules imported at boot, so a syntax error takes the
service down on deploy) and runs the migrations up, down to zero, and up again
against a throwaway Postgres — which is the only thing verifying that a `down`
migration actually reverses.

## Quick Start

### Prerequisites
Node.js 18+ · Python 3.11+ · a PostgreSQL connection string (Neon)

### Frontend
```bash
cd frontend
npm install
npm run dev        # Vite dev server (HMR)
```

### Backend
```bash
cd server
npm install
npm run migrate:up # apply any pending migrations
npm run dev        # Express on :5000
```

> `npm run migrate:deploy` is the variant Render's build command uses — it reads
> `DATABASE_URL` straight from the environment rather than a `.env` file, which
> does not exist on the host.

### Data pipeline
```bash
cd server/python_scripts
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt

# Initial load
python fetch_bref_all_stats.py        # players + game logs + advanced
python fetch_headshots.py             # headshots

# Daily update (runs via cron; see daily_fetch.sh)
python fetch_bref_all_stats.py --yesterday

# Fill a gap / backfill a range (e.g. the playoffs)
python fetch_bref_backfill.py --start 2026-04-13 --end 2026-06-02

# NFL — nflverse Parquet, one season at a time (2023 onward available)
python fetch_nfl_stats.py --season 2025

# MLB — statsapi.mlb.com, a season or an explicit range
python fetch_mlb_stats.py --season 2025   # ~2,400 games, roughly 40 minutes
python fetch_mlb_stats.py --start 2026-08-01 --end 2026-08-10

# Team name <-> abbreviation mapping (game pages join on it)
python fetch_teams.py --sport mlb
```

```bash
# Props — Node, needs ODDS_API_KEY. Metered, so check the plan first.
cd server
node scripts/fetch_props.mjs --dry-run   # plan + projected cost, spends nothing
node scripts/fetch_props.mjs             # every in-season sport
node scripts/fetch_props.mjs --sport mlb # just one
```

Both non-NBA loaders accept `--replace`, which clears that sport and reloads
inside a single transaction. Use it when the *selection* logic changes rather
than the values: the loaders upsert, so they can correct a row they still emit
but never remove one they have stopped emitting.

`./server/scripts/reload_nfl.sh <season> <ENV_VAR>` wraps the NFL case and
requires the target database to be named explicitly — `server/.env` holds both
a production and a test-branch URL, and defaulting to either is how you reload
the wrong one.

**Where each pipeline can run.** The Basketball Reference scraper 403s from
datacenter IPs, so it stays on a local cron with a residential IP. nflverse is
static Parquet on GitHub Releases and `statsapi.mlb.com` is a public JSON API —
both accept datacenter IPs, so the NFL and MLB loaders can be cloud-scheduled.

## Data Sources & Attribution

| Sport | Source | Terms |
|---|---|---|
| NBA | [Basketball Reference](https://www.basketball-reference.com) | Scraped; local cron only |
| NFL | [nflverse](https://github.com/nflverse/nflverse-data) | CC BY 4.0 — attribution required |
| MLB | [MLB Stats API](https://statsapi.mlb.com) | [MLBAM copyright](http://gdx.mlb.com/components/copyright.txt) — attribution required, **non-commercial use only** |
| Odds | [The Odds API](https://the-odds-api.com), [Kalshi](https://kalshi.com) | Metered / public API |

The MLB and nflverse licences both require visible credit, which is why the app
footer carries it. `MLB-StatsAPI` (the PyPI package) is deliberately **not** a
dependency: it is GPL-3.0, and its copyleft terms are a poor fit for a public
portfolio repo. The two endpoints this project needs are read directly instead.

This project is not affiliated with the NBA, NFL, or MLB, and nothing it
produces is betting advice.

## Environment Variables

**Backend** — `server/.env` (gitignored):
```env
DATABASE_URL=postgresql://user:password@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require&channel_binding=require
OPENAI_API_KEY=sk-...
ODDS_API_KEY=...
PORT=5000
```
The Python scripts read the same `server/.env` via `load_dotenv()`.

**Frontend** — `frontend/.env` (gitignored):
```env
VITE_GOOGLE_CLIENT_ID=...apps.googleusercontent.com
VITE_API_BASE_URL=http://localhost:5000   # optional; defaults to the Render backend
```
> Add your deployed origin to the Google OAuth client's **Authorized JavaScript origins**, or sign-in fails in production.

## Deployment
- **Frontend → Vercel.** `frontend/vercel.json` adds an SPA rewrite so client
  routes don't 404 on refresh.
- **Backend → Render.** Build command `npm install && npm run migrate:deploy`,
  so schema changes ship with the code that needs them. Set `DATABASE_URL`,
  `OPENAI_API_KEY` and `ODDS_API_KEY` in the service env.
- **Database → Neon.** Use the pooled connection string.

## Known Limitations

- **Prop coverage is partial by design.** The free Odds API tier is 500
  credits/month and a full MLB slate alone would need ~1,800, so only the most
  competitive few games a day get props. Games without them say so rather than
  rendering empty.
- **Closing-line value reads as `—`.** With one props fetch a day the opening
  and closing snapshots are the same row, so there is genuinely nothing to
  measure yet. The code is correct; it starts producing numbers at a higher
  cadence.
- **NFL teams are not loaded.** nflverse publishes no teams artifact at the
  paths this project reads. Game pages fall back to deriving the two sides from
  the players who have props, so labels degrade rather than data.
- **The chatbot is NBA-only** and will answer confidently wrong on an NFL or MLB
  page — it reads the legacy `pts`/`reb`/`ast` columns, which are NULL for those
  sports.

## Future Enhancements
- Line-movement history UI (the append-only data is already accruing)
- Sport-aware chatbot, rewritten around tool calling
- Backtesting framework for prop/edge models
- Mobile-friendly layout pass
