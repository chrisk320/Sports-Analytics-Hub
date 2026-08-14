import pg from 'pg';
import dotenv from 'dotenv';
import { gradeRow, summarize } from '../lib/grading.js';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

/**
 * Settled props: what the app flagged, and what actually happened.
 *
 * Reads only data already in the database -- prop snapshots and game logs --
 * so this costs no Odds API credits no matter how often it is called.
 *
 * The join is (player_id, game_date, sport). player_id rather than name because
 * the props loader already resolved it sport-scoped and refused ambiguous
 * matches; re-matching on name here would reintroduce the cross-sport collision
 * that resolution exists to prevent. Rows whose prop never linked to a player
 * simply do not join, which is the correct outcome -- an unlinked prop cannot
 * be graded.
 *
 * `role` is part of the join for baseball: a two-way player has both a batting
 * and a pitching row for one game, and a pitcher_strikeouts prop must settle
 * against the pitching line even though 'strike_outs' exists on both.
 */
const GRADED_QUERY = `
  WITH closing AS (
    -- The last snapshot taken before the game, per prop. With one fetch a day
    -- this usually equals the only snapshot; it becomes the real closing line
    -- as the cadence increases, and CLV is then measured against it.
    SELECT DISTINCT ON (player_name, game_id, market, bookmaker)
           player_name, game_id, market, bookmaker,
           over_odds AS closing_over_odds
    FROM player_props
    ORDER BY player_name, game_id, market, bookmaker, fetched_at DESC
  ),
  opening AS (
    -- The first snapshot, which is the price the app would have shown when the
    -- edge was flagged.
    SELECT DISTINCT ON (player_name, game_id, market, bookmaker) *
    FROM player_props
    ORDER BY player_name, game_id, market, bookmaker, fetched_at ASC
  )
  -- One row per BET, not per book quote. The same prop is quoted by 2-4 books,
  -- so grading every row would count one bet several times: 360 rows in
  -- production are really 169 bets. That inflates the record and skews ROI
  -- toward whichever markets happen to carry the most books.
  --
  -- The survivor is the best-priced quote, which is the row bestOver picks in
  -- summarizeMarket() -- so the panel grades exactly what the app told the user
  -- to take. Ranked by payout rather than the raw American number, mirroring
  -- payoutPer100: +150 beats -110, and -110 beats -200.
  , best AS (
  SELECT DISTINCT ON (o.player_name, o.market)
    o.player_name, o.player_id, o.sport, o.market, o.bookmaker,
    o.game_id, o.game_date, o.over_line, o.over_odds,
    c.closing_over_odds,
    l.stats,
    p.full_name, p.headshot_url
  FROM opening o
  JOIN closing c
    ON c.player_name = o.player_name AND c.game_id = o.game_id
   AND c.market = o.market AND c.bookmaker = o.bookmaker
  JOIN player_game_logs l
    ON l.player_id = o.player_id
   AND l.game_date = o.game_date
   AND l.sport = o.sport
   -- Baseball splits into two populations that share stat NAMES: a two-way
   -- player has a batting row and a pitching row for the same game, and
   -- 'strike_outs' means struck out on one and thrown on the other. Settling a
   -- pitcher_ market against the batting line would read the wrong number.
   -- Everywhere else role is '' and this is a no-op.
   AND (l.role = '' OR l.role = CASE WHEN o.market LIKE 'pitcher\\_%' THEN 'pitcher' ELSE 'batter' END)
  LEFT JOIN players p ON p.player_id = o.player_id
  WHERE o.game_date >= (NOW() AT TIME ZONE 'America/New_York')::date - MAKE_INTERVAL(days => $1)
    AND o.game_date < (NOW() AT TIME ZONE 'America/New_York')::date
    AND ($2::text IS NULL OR o.sport = $2)
    -- Applied before the dedupe on purpose: filtering after it would ask
    -- for the best price only when this book happened to win, which is
    -- not a question anyone means. Here it means "grade this book's
    -- prices", which is.
    AND ($3::text IS NULL OR o.bookmaker = $3)
  -- DISTINCT ON requires its keys to lead the ORDER BY; the payout expression
  -- after them is what selects the surviving row.
  ORDER BY o.player_name, o.market,
           (CASE WHEN o.over_odds > 0 THEN o.over_odds
                 ELSE 10000.0 / NULLIF(-o.over_odds, 0) END) DESC NULLS LAST
  )
  SELECT * FROM best ORDER BY game_date DESC, player_name, market
`;

export const getGradedProps = async (req, res) => {
  const sport = req.query.sport || null;
  const days = Math.min(parseInt(req.query.days, 10) || 14, 90);
  const bookmaker = req.query.bookmaker || null;

  try {
    const { rows } = await pool.query(GRADED_QUERY, [days, sport, bookmaker]);
    const graded = rows
      .map((r) => ({
        ...gradeRow(r),
        full_name: r.full_name || r.player_name,
        headshot_url: r.headshot_url,
      }));

    res.json({ summary: summarize(graded), results: graded });
  } catch (err) {
    console.error('Error grading props:', err.stack);
    res.status(500).json({ error: 'Failed to grade props' });
  }
};
