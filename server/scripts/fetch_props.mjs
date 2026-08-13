/**
 * Fetch player props for whichever sports are in season, within a credit budget.
 *
 *   node scripts/fetch_props.mjs --dry-run       # plan only, spends nothing
 *   node scripts/fetch_props.mjs                 # all in-season sports
 *   node scripts/fetch_props.mjs --sport mlb     # one sport
 *   node scripts/fetch_props.mjs --games 5       # override the budget's game count
 *
 * Replaces python_scripts/fetch_player_props.py, which was hardcoded to
 * basketball_nba and had its own HTTP layer. Going through lib/oddsApi.js means
 * one Odds API client, one place reading the quota headers, and a budget guard
 * that can actually see the remaining balance -- none of which was possible
 * while the loader talked to the API directly.
 *
 * WHY SAMPLE: per-event prop calls cost markets x regions PER GAME and are the
 * entire budget. A full MLB slate is ~15 games x 4 credits = 60/day, or
 * ~1,800/month against a 500/month tier. Covering the most competitive few
 * games keeps the product real and the spend inside the free tier.
 */

import 'dotenv/config';
import pg from 'pg';
import { SPORTS, getSport } from '../config/sports.js';
import { listEvents, getBulkOdds, getEventOdds, getQuota } from '../lib/oddsApi.js';

const { Pool } = pg;

// Credits held back for serving team lines on demand. Those are bulk calls
// (whole slate for markets x regions) and cached, so the reserve is small --
// but it has to exist, or a props run late in the month leaves the games pages
// unable to load anything.
const TEAM_LINES_RESERVE = 100;

// Used only when the API has not yet told us the balance. Pessimistic on
// purpose: guessing high would overspend, guessing low just fetches less.
const ASSUMED_REMAINING = 0;

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
};

const DRY_RUN = flag('dry-run');
const ONLY_SPORT = opt('sport');
const GAMES_OVERRIDE = opt('games') ? Number(opt('games')) : null;

const creditsPerGame = (sport) =>
  sport.propMarkets.length * sport.regions.props.split(',').length;

/** Days left in the current UTC month, inclusive of today. The Odds API quota
 *  resets monthly, so the daily allowance is what is left spread over what
 *  remains of the period. */
function daysLeftInMonth(now = new Date()) {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return Math.max(1, end.getUTCDate() - now.getUTCDate() + 1);
}

/**
 * How many games this run may cover.
 *
 * Derived rather than hardcoded so it can never overrun: whatever is left,
 * spread across the days remaining, minus the team-lines reserve. A hardcoded
 * count silently overspends the month if a run is added or a slate grows.
 */
function gameBudget(sport, remaining) {
  const perGame = creditsPerGame(sport);
  const spendable = Math.max(0, (remaining ?? ASSUMED_REMAINING) - TEAM_LINES_RESERVE);
  const dailyAllowance = spendable / daysLeftInMonth();
  return { games: Math.floor(dailyAllowance / perGame), perGame, dailyAllowance, spendable };
}

// Books post player props close to first pitch, so a game two days out
// usually returns nothing. The call costs no credits when there are no
// markets, but it still burns one of the few slots the budget allows -- an
// observed miss on the first live run. Prefer games starting within this
// window, falling back to the whole slate if none qualify.
const PROPS_POSTED_WITHIN_HOURS = 24;

function startingSoon(events, hours = PROPS_POSTED_WITHIN_HOURS) {
  const cutoff = Date.now() + hours * 3600_000;
  const soon = events.filter((e) => new Date(e.commence_time).getTime() <= cutoff);
  return soon.length ? soon : events;
}

/**
 * Rank a slate by tightest spread, most competitive first.
 *
 * The ranking data comes from the bulk call that costs markets x regions ONCE
 * for the whole slate (and is usually already cached from the games page), not
 * per game -- so ordering the slate is nearly free. Competitive games carry the
 * most prop interest, which is the best proxy available without a popularity
 * signal. Games with no posted spread sort last rather than being dropped.
 */
function rankByCompetitiveness(events, bulk) {
  const spreadByEvent = new Map();
  for (const ev of bulk || []) {
    let tightest = Infinity;
    for (const bm of ev.bookmakers || []) {
      for (const mk of bm.markets || []) {
        if (mk.key !== 'spreads') continue;
        for (const oc of mk.outcomes || []) {
          if (typeof oc.point === 'number') tightest = Math.min(tightest, Math.abs(oc.point));
        }
      }
    }
    if (tightest !== Infinity) spreadByEvent.set(ev.id, tightest);
  }
  return [...events].sort(
    (a, b) => (spreadByEvent.get(a.id) ?? Infinity) - (spreadByEvent.get(b.id) ?? Infinity)
  );
}

/**
 * Collapse an event's odds payload into one row per (player, market, book).
 * Over and Under arrive as separate outcomes and are paired here.
 */
function parseProps(sport, event, payload) {
  const rows = [];
  const gameDate = new Date(event.commence_time).toLocaleDateString('en-CA', {
    timeZone: 'America/New_York', // a game at 8pm ET is already "tomorrow" in UTC
  });

  for (const bm of payload?.bookmakers || []) {
    for (const mk of bm.markets || []) {
      const byPlayer = new Map();
      for (const oc of mk.outcomes || []) {
        const name = oc.description;
        if (!name) continue;
        if (!byPlayer.has(name)) byPlayer.set(name, {});
        const side = String(oc.name || '').toLowerCase();
        if (side === 'over' || side === 'under') byPlayer.get(name)[side] = oc;
      }
      for (const [playerName, sides] of byPlayer) {
        if (!sides.over && !sides.under) continue;
        rows.push({
          player_name: playerName,
          game_id: event.id,
          game_date: gameDate,
          home_team: event.home_team,
          away_team: event.away_team,
          market: mk.key,
          bookmaker: bm.key,
          over_line: sides.over?.point ?? null,
          over_odds: sides.over?.price ?? null,
          under_line: sides.under?.point ?? null,
          under_odds: sides.under?.price ?? null,
          sport: sport.id,
        });
      }
    }
  }
  return rows;
}

/**
 * Resolve a prop's player name to a player_id WITHIN one sport.
 *
 * The sport filter is load-bearing: "Spencer Jones" exists in both NBA and MLB
 * and "Tyler Smith" in both NBA and NFL, so an unscoped lookup can attach a
 * baseball prop to a basketball player_id, which then reads that player's game
 * logs into a confidently wrong hit rate. Returns null on ambiguity rather than
 * guessing -- an unlinked prop is merely incomplete, a mislinked one is wrong.
 *
 * Matching is accent-insensitive because the two sources disagree on
 * diacritics: the Odds API sends "Elias Diaz" while MLB StatsAPI stored
 * "Elias Díaz". An exact match left ~6% of rows unlinked, almost all of them
 * Latino players, whose props then never appeared on their player pages.
 * NFD decomposition plus stripping the combining-marks range does this with no
 * extension -- `unaccent` would need one installed on the database.
 */
const UNACCENT = (col) => `regexp_replace(normalize(${col}, NFD), '[\\u0300-\\u036f]', '', 'g')`;

async function linkPlayer(client, sportId, playerName, cache, warned) {
  const key = `${sportId}:${playerName.toLowerCase()}`;
  if (cache.has(key)) return cache.get(key);

  const { rows } = await client.query(
    `SELECT player_id FROM players
      WHERE sport = $1 AND lower(${UNACCENT('full_name')}) = lower(${UNACCENT('$2')})`,
    [sportId, playerName]
  );
  let id = null;
  if (rows.length === 1) {
    id = rows[0].player_id;
  } else if (rows.length > 1 && !warned.has(key)) {
    warned.add(key);
    console.warn(`  ! ambiguous within ${sportId}: ${playerName} -> ${rows.length} players; left unlinked`);
  }
  cache.set(key, id);
  return id;
}

// Append, never overwrite. Each run is a snapshot; the sequence of them IS the
// line movement. The unique constraint this used to rely on was dropped in
// migration 1735690200000, so an ON CONFLICT clause here would now fail
// outright. Readers wanting the current line use the player_props_latest view.
const INSERT_SQL = `
  INSERT INTO player_props (
    player_name, player_id, game_id, game_date, home_team, away_team,
    market, bookmaker, over_line, over_odds, under_line, under_odds, sport, fetched_at
  ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
`;

// One timestamp for the whole run, captured before the first fetch. NOW() per
// statement would stamp every row differently -- outside an explicit
// transaction it is evaluated per statement, which produced 1,077 distinct
// values for three runs of 359 rows. A snapshot is a run, so the rows in it
// have to share an instant: otherwise "lines as of 7:04pm" has no single answer
// and line movement cannot group a run's rows together.
// One timestamp for the whole run, captured before the first fetch.
//
// A plain Date is correct now that fetched_at is timestamptz (migration
// 1735690300000): node-pg sends it with an offset and Postgres stores the
// instant. It was NOT correct against the previous `timestamp without time
// zone` column, where node-pg serialised in local time and stamped rows seven
// hours off.
//
// Per-run rather than per-row because NOW() outside a transaction is evaluated
// per statement -- that produced 1,077 distinct timestamps for three runs of
// 359 rows. A snapshot is a run, so its rows have to share an instant, or
// "lines as of" has no single answer and line movement cannot group them.
const RUN_AT = new Date();

const FULL_HISTORY_DAYS = 14;
const CLOSING_LINE_DAYS = 365;

/**
 * Age out history in two stages. Past FULL_HISTORY_DAYS the intermediate
 * snapshots go but the LAST one per prop is kept -- that is the closing line,
 * the only snapshot needed to grade a bet or compute CLV. Past
 * CLOSING_LINE_DAYS the row goes entirely.
 *
 * Deleting whole past days instead, as the old loader did, would make the
 * append-only change pointless: history would accumulate for a day and vanish.
 */
async function compactHistory(client) {
  const compacted = await client.query(
    `DELETE FROM player_props p
     WHERE p.game_date < (NOW() AT TIME ZONE 'America/New_York')::date - MAKE_INTERVAL(days => $1)
       AND EXISTS (
         SELECT 1 FROM player_props q
         WHERE q.player_name = p.player_name AND q.game_id = p.game_id
           AND q.market = p.market AND q.bookmaker = p.bookmaker
           AND (q.fetched_at > p.fetched_at OR (q.fetched_at = p.fetched_at AND q.id > p.id))
       )`,
    [FULL_HISTORY_DAYS]
  );
  const expired = await client.query(
    `DELETE FROM player_props
     WHERE game_date < (NOW() AT TIME ZONE 'America/New_York')::date - MAKE_INTERVAL(days => $1)`,
    [CLOSING_LINE_DAYS]
  );
  if (compacted.rowCount || expired.rowCount) {
    console.log(`Compacted ${compacted.rowCount} intermediate snapshots, expired ${expired.rowCount} rows`);
  }
}

async function runSport(sport, pool) {
  // Free. Also the same signal the UI uses for in-season (Layout.jsx derives it
  // from whether a sport has upcoming games), so the loader and the UI cannot
  // disagree about which sports are live.
  const events = await listEvents(sport);
  if (!events.length) {
    console.log(`${sport.label}: no upcoming games — skipping (out of season)`);
    return { rows: 0, games: 0 };
  }

  const remaining = getQuota().remaining;
  const { games: budgetGames, perGame, spendable } = gameBudget(sport, remaining);
  const wanted = GAMES_OVERRIDE ?? budgetGames;
  const n = Math.min(wanted, startingSoon(events).length);

  console.log(
    `${sport.label}: ${events.length} games on the slate | ${perGame} credits/game | ` +
      `remaining ${remaining ?? 'unknown'} | spendable ${spendable} | budget ${budgetGames} games` +
      (GAMES_OVERRIDE ? ` | override ${GAMES_OVERRIDE}` : '')
  );

  if (n <= 0) {
    console.warn(
      `${sport.label}: budget allows 0 games (reserve ${TEAM_LINES_RESERVE} credits) — skipping. ` +
        `Existing props are left in place.`
    );
    return { rows: 0, games: 0 };
  }

  // Ranking needs the bulk call, which costs markets x regions. That is cheap
  // (once for the whole slate) but it is not nothing, so a dry run must not do
  // it -- a "dry run" that spends credits is a contradiction. Dry runs report
  // the budget and the projected cost, and note that the real run picks the
  // games by spread.
  const candidates = startingSoon(events);
  const ranked = DRY_RUN
    ? [...candidates].sort((a, b) => a.commence_time.localeCompare(b.commence_time))
    : rankByCompetitiveness(candidates, await getBulkOdds(sport).catch(() => []));
  const chosen = ranked.slice(0, n);

  if (DRY_RUN) {
    console.log(
      `${sport.label}: would cover ${chosen.length} of ${events.length} games ` +
        `= ${chosen.length * perGame} credits (+3 to rank the slate, if not already cached)`
    );
    console.log(`    (listed by start time; the real run ranks by tightest spread)`);
    for (const ev of chosen) console.log(`    ${ev.away_team} @ ${ev.home_team}  ${ev.commence_time}`);
    console.log(`${sport.label}: DRY RUN — nothing fetched, nothing written`);
    return { rows: 0, games: chosen.length, projected: chosen.length * perGame };
  }

  console.log(`${sport.label}: covering ${chosen.length} of ${events.length} games (${chosen.length * perGame} credits)`);
  for (const ev of chosen) console.log(`    ${ev.away_team} @ ${ev.home_team}  ${ev.commence_time}`);

  let written = 0;
  let covered = 0;
  const cache = new Map();
  const warned = new Set();
  const client = await pool.connect();
  try {
    // Walk the ranked slate rather than a fixed slice. A game with no props
    // posted yet returns nothing AND is billed nothing, so counting it against
    // the budget would silently forfeit a slot -- which is exactly what
    // happened on the first live run, where a game ~24h out came back empty.
    // Only a game that actually yields rows consumes budget.
    for (const ev of ranked) {
      if (covered >= n) break;
      const payload = await getEventOdds(sport, ev.id, 'props');
      const rows = parseProps(sport, ev, payload);
      if (!rows.length) {
        console.log(`    ${ev.away_team} @ ${ev.home_team}: no props posted yet (0 credits, slot not used)`);
        continue;
      }
      for (const r of rows) {
        const playerId = await linkPlayer(client, sport.id, r.player_name, cache, warned);
        await client.query(INSERT_SQL, [
          r.player_name, playerId, r.game_id, r.game_date, r.home_team, r.away_team,
          r.market, r.bookmaker, r.over_line, r.over_odds, r.under_line, r.under_odds, r.sport,
          RUN_AT,
        ]);
        written += 1;
      }
      covered += 1;
      console.log(`    ${ev.away_team} @ ${ev.home_team}: ${rows.length} prop rows`);
    }
    await compactHistory(client);
  } finally {
    client.release();
  }
  return { rows: written, games: covered };
}

async function main() {
  if (!process.env.ODDS_API_KEY) {
    console.error('ODDS_API_KEY is not set.');
    process.exit(1);
  }
  const sports = ONLY_SPORT
    ? [getSport(ONLY_SPORT)].filter(Boolean)
    : Object.values(SPORTS);
  if (!sports.length) {
    console.error(`Unknown sport "${ONLY_SPORT}". Expected one of: ${Object.keys(SPORTS).join(', ')}`);
    process.exit(1);
  }

  console.log('='.repeat(64));
  console.log(`Player props${DRY_RUN ? ' — DRY RUN' : ''} | ${sports.map((s) => s.id).join(', ')}`);
  console.log('='.repeat(64));

  const pool = DRY_RUN
    ? null
    : new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

  let totalRows = 0;
  let totalGames = 0;
  try {
    for (const sport of sports) {
      const r = await runSport(sport, pool);
      totalRows += r.rows;
      totalGames += r.games;
    }
  } finally {
    if (pool) await pool.end();
  }

  const q = getQuota();
  console.log('='.repeat(64));
  console.log(`Done. ${totalGames} games, ${totalRows} prop rows written.`);
  console.log(`Quota: ${q.remaining ?? 'unknown'} remaining, ${q.used ?? 'unknown'} used this period.`);
  console.log('='.repeat(64));
}

main().catch((err) => {
  console.error('Props fetch failed:', err.message);
  process.exit(1);
});
