# Sports Analytics Hub

A full-stack application for analyzing NBA player performance and sports-betting value. It pairs a Basketball-Reference data pipeline with a React betting dashboard that shops player props and team lines across sportsbooks, surfaces line-shopping savings and de-vigged +EV edges, and shows market-aware player trends.

**Live Demo:** [sports-analytics-hub.vercel.app](https://sports-analytics-hub.vercel.app) · **API:** [Render backend](https://sports-analytics-hub-7hse.onrender.com)

![Sports Analytics Hub — tonight's board](docs/screenshots/homePage.png)

*Home — a live edge ticker, watchlist cards with trend sparklines, prop comparison, and the bet slip.*

## Screens

### Sportsbook Compare — best-line finder
![Sportsbook Compare](docs/screenshots/compareBooksPage.png)

Every book's price for each prop, with the highest-paying one flagged (★), savings per $100 vs. the market, and a **de-vigged consensus Edge%** that surfaces +EV plays.

### Player Detail
![Player Detail](docs/screenshots/playerDetailPage.png)

A market-aware game-log chart with the prop line overlaid (toggle PTS / REB / AST / PR / PA / RA), a full stat strip, recent game logs, and tonight's props with live EV.

### Game Detail
![Game Detail](docs/screenshots/gameDetailPage.png)

Team markets — spread, total, and moneyline with the best price per side highlighted — plus player props split by team across all six markets.

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   React SPA     │────▶│  Express API    │────▶│   PostgreSQL    │
│   (Vercel)      │     │   (Render)      │     │     (Neon)      │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                          ▲ writes
                          ┌───────────────────────────────┴──────────────────────────────┐
              ┌───────────┴──────────┐                                     ┌──────────────┴───────────┐
              │   Local cron (Mac)   │                                     │      GitHub Actions      │
              │ Basketball Reference │                                     │       The Odds API       │
              │  game logs · daily   │                                     │   player props · daily   │
              └──────────────────────┘                                     └──────────────────────────┘
```

### 1. Data Pipeline (Python)

Two sources feed the database on a schedule:

- **Game logs + advanced box scores** — scraped from [Basketball Reference](https://www.basketball-reference.com) box-score pages (the `nba_api` was dropped because its endpoints 403 from datacenter IPs; it's now only used for headshots).
- **Player props** — pulled from The Odds API.

| Script | Purpose |
|--------|---------|
| `fetch_bref_all_stats.py` | Combined basic + advanced box scores in one pass (full season, or `--yesterday`) |
| `fetch_bref_rosters_and_logs.py` | Rosters + traditional game logs |
| `fetch_bref_advanced_stats.py` | Advanced metrics (ORtg/DRtg, TS%, eFG%, USG%) — `--yesterday` or a season year |
| `fetch_bref_backfill.py` | Backfill any date range: `--start YYYY-MM-DD [--end ...]` (idempotent; reuses the daily logic — used for playoffs) |
| `fetch_headshots.py` | Player headshot URLs (`nba_api`) |
| `scripts/fetch_props.mjs` | Player props from The Odds API → `player_props` table (all in-season sports, budget-capped) |
| `daily_fetch.sh` | Local cron entrypoint → runs `fetch_bref_all_stats.py --yesterday` |

**Game-log scrape → local cron (not GitHub Actions).** Basketball Reference returns `403 Forbidden` to GitHub's datacenter IPs, so a cloud scraper fetches nothing. It runs from a residential IP via `cron` on the dev machine:

```cron
0 6 * * * /Users/<you>/repos/nbastats/server/python_scripts/daily_fetch.sh >> /tmp/nba-fetch.log 2>&1
```

> Note: `--yesterday` fetches a single day, so if the machine is asleep at run time that day is skipped — use `fetch_bref_backfill.py --start <date>` to fill gaps.

**Player props → GitHub Actions.** The Odds API is a keyed commercial API that accepts any IP (no 403), so props refresh in the cloud — which also means they don't depend on the dev machine being awake near tip-off. [`.github/workflows/props-fetch.yml`](.github/workflows/props-fetch.yml) runs `scripts/fetch_props.mjs` once a day (plus a manual trigger), using the repo's `ODDS_API_KEY` and `DATABASE_URL` secrets:

```cron
0 20 * * *   # 4pm EDT / 3pm EST — lines posted for the slate
0 23 * * *   # 7pm EDT / 6pm EST — sharper lines near tip-off
```

### 2. Database (PostgreSQL on Neon)

[Neon](https://neon.tech) serverless Postgres — auto-suspends when idle and auto-resumes on the next query (sub-second), so it never gets stuck paused. Standard Postgres via `pg` (Node) and `psycopg` (Python).

| Table | Contents |
|-------|----------|
| `players` | Player master data + `headshot_url`, `team_abbreviation` |
| `player_game_logs` | Game-by-game traditional stats (`pts`, `reb`, `ast`, `stl`, `blk`, `min`) |
| `advanced_box_scores` | Per-game advanced metrics (1:1 with `player_game_logs`) |
| `player_props` | Append-only prop snapshots per book (populated by `scripts/fetch_props.mjs`); read current lines via the `player_props_latest` view |
| `user_favorites` | Per-user saved players |
| `teams` | NBA team names + abbreviations |

Season averages are **computed on the fly** from `player_game_logs` (the old `player_season_stats` table was dropped). Schema lives in `server/migrations/`.

### 3. Backend API (Express.js · ES Modules)

#### Players (`/players`)
- `GET /players` — list all players
- `GET /players/:playerId` — player info
- `GET /players/:playerId/season-averages` — season averages (computed from logs)
- `GET /players/:playerId/gamelogs` — last 10 games
- `GET /players/:playerId/full-gamelogs` — last 10 games + advanced stats
- `GET /players/:playerId/gamelogs/:opponentAbbr` — filter by opponent

#### Player Props (`/playerprops`)
- `GET /playerprops/today` — every prop for the current slate (nearest game day on/after today, US Eastern)
- `GET /playerprops/game/:gameId` — every prop for one game
- `GET /playerprops/:playerId` — a player's props for their next game
- `GET /playerprops/:playerId/game` — whether a player has an upcoming game
- `POST /playerprops/refresh` — refetch props from The Odds API

#### NBA / NFL Betting (`/nbabets`, `/nflbets`)
- `GET /{nba,nfl}games` — upcoming games (Odds API event list)
- `GET /{nba,nfl}teamlines/:eventId` — moneyline / spread / total
- `GET /{nba,nfl}playerprops/:eventId` — game player props

#### Teams · Favorites · Chat
- `GET /teams`
- `GET|POST /users/:userId/favorites`, `DELETE /users/:userId/favorites/:playerId`
- `POST /chat` — natural-language NBA stats queries (OpenAI)

### 4. Frontend (React + React Router)

A multi-page betting dashboard (dark slate/purple theme). State lives in a shared `Layout` and is passed to pages via the router `Outlet` context; the bet slip is persisted to `localStorage`.

| Route | Page | What it shows |
|-------|------|---------------|
| `/` | **Home** | Live edge ticker, watchlist cards with sparklines + hit rates, market-depth panel, hot prop edges, bet slip |
| `/games` | **Games** | Tonight's NBA slate |
| `/games/:gameId` | **Game Detail** | Team markets (spread/total/ML, best price per side) + player props split by team across all 6 markets (PTS/REB/AST/PR/PA/RA) |
| `/players/:playerId` | **Player Detail** | Hero + stat strip, market-aware game-log chart with the line overlaid, opponent filter, tonight's props |
| `/compare` | **Sportsbook Compare** | Best-line finder: book-by-book ledger, best price highlighted, savings/$100 vs. median, and a de-vigged consensus **Edge%** (+EV) |
| `/nfl` | **NFL** | NFL games + betting lines (modal) |

Shared betting math (American-odds ↔ implied prob/decimal, best price, de-vig, savings, EV%, parlay) lives in `frontend/src/lib/odds.js`. Auth is Google OAuth via `@react-oauth/google`.

## Technology Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | React 19, Vite, Tailwind CSS 4, React Router 7, Recharts 3, Axios |
| **Backend** | Node.js (ES Modules), Express.js |
| **Database** | PostgreSQL — [Neon](https://neon.tech) serverless |
| **Data Pipeline** | Python — Basketball Reference scrape (local `cron`) + The Odds API props (GitHub Actions) |
| **AI** | OpenAI GPT-3.5-turbo |
| **Auth** | Google OAuth 2.0 (`@react-oauth/google`) |
| **External APIs** | The Odds API, Basketball Reference, `nba_api` (headshots) |
| **Hosting** | Vercel (frontend), Render (backend), Neon (database) |

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
npm run start      # Express on :5000 (nodemon)
```

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

# Props (needs ODDS_API_KEY)
node ../scripts/fetch_props.mjs --dry-run   # plan + projected credit cost, spends nothing
node ../scripts/fetch_props.mjs             # all in-season sports

# NFL — nflverse Parquet, one season at a time
python fetch_nfl_stats.py --season 2024

# MLB — statsapi.mlb.com, a season or an explicit range
python fetch_mlb_stats.py --season 2026
python fetch_mlb_stats.py --start 2026-08-01 --end 2026-08-10
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
- **Frontend → Vercel.** `frontend/vercel.json` adds an SPA rewrite so client routes (`/games/:id`, `/players/:id`, `/compare`) don't 404 on refresh.
- **Backend → Render.** Set `DATABASE_URL`, `OPENAI_API_KEY`, `ODDS_API_KEY` in the service env.
- **Database → Neon.** Use the pooled connection string.

## Future Enhancements
- Self-healing daily fetch (lookback window so a missed run catches up)
- Historical line-movement tracking
- Backtesting framework for prop/edge models
- Mobile-friendly layout pass
