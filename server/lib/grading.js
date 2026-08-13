/**
 * Settle captured props against what actually happened, and measure whether the
 * price we flagged beat the closing line.
 *
 * This is what separates an odds mirror from an analytics product: the app
 * already says "this is the best price and here is the hit rate", but until the
 * bets are graded there is no evidence any of it was right. Both halves come
 * from data already in the database -- props snapshots and game logs -- so
 * neither costs an API credit.
 */

import { getSport } from '../config/sports.js';

/**
 * Value that settles a market, summed out of a game log's stats JSONB.
 *
 * Returns null rather than 0 when the market is unknown or the log is missing,
 * because those mean "cannot grade" while 0 is a real result. Conflating them
 * would silently record a loss for every prop the mapping does not cover.
 */
export function actualFor(sportId, market, log) {
  const sport = getSport(sportId);
  const keys = sport?.propStats?.[market];
  if (!keys || !log) return null;

  const stats = log.stats || {};
  let total = 0;
  let sawAny = false;
  for (const k of keys) {
    const v = stats[k];
    if (v == null) continue;
    const n = Number(v);
    if (Number.isNaN(n)) continue;
    total += n;
    sawAny = true;
  }
  // A player who appeared but recorded nothing has explicit zeros in the blob
  // (the loaders store them deliberately), so sawAny === false means the keys
  // are absent entirely -- an ungradeable row, not a goose egg.
  return sawAny ? total : null;
}

/**
 * Settle one side of a prop.
 *
 * A push is its own outcome, not a win. The frontend's hitRate() counts
 * `actual >= line` as a hit, which is fine for the .5 lines that dominate but
 * overstates a whole-number line where landing exactly on it returns the stake
 * rather than paying out. Grading is where money is claimed to have been won,
 * so it distinguishes them.
 */
export function gradeSide(actual, line, side = 'over') {
  if (actual == null || line == null) return null;
  const a = Number(actual);
  const l = Number(line);
  if (Number.isNaN(a) || Number.isNaN(l)) return null;
  if (a === l) return 'push';
  if (side === 'over') return a > l ? 'win' : 'loss';
  return a < l ? 'win' : 'loss';
}

/** Profit on a $100 stake for a settled bet. A push returns the stake, so 0. */
export function profitPer100(outcome, americanOdds) {
  if (outcome == null || americanOdds == null) return null;
  const odds = Number(americanOdds);
  if (Number.isNaN(odds) || odds === 0) return null;
  if (outcome === 'push') return 0;
  if (outcome === 'loss') return -100;
  return odds > 0 ? odds : 10000 / -odds;
}

/**
 * Closing-line value: did the price we recorded beat where the market closed?
 *
 * Compared in implied-probability space rather than on the raw American
 * numbers, which are not a continuous scale -- +100 and -100 are adjacent
 * prices but 200 apart numerically, so subtracting them measures nothing. A
 * positive result means the taken price implied a lower probability than the
 * close, i.e. better odds than the market settled on.
 *
 * Beating the close is the standard evidence that an edge was real rather than
 * lucky, because it is visible immediately and does not need a large sample of
 * settled bets to be meaningful.
 */
export function impliedProb(odds) {
  if (odds == null) return null;
  const o = Number(odds);
  if (Number.isNaN(o) || o === 0) return null;
  return o > 0 ? 100 / (o + 100) : -o / (-o + 100);
}

export function closingLineValue(takenOdds, closingOdds) {
  const taken = impliedProb(takenOdds);
  const close = impliedProb(closingOdds);
  if (taken == null || close == null) return null;
  // Percentage points of implied probability saved by the earlier price.
  return (close - taken) * 100;
}

/**
 * Grade a joined prop+result row.
 *
 * `row` carries the prop fields plus the matching game log's `stats`, and
 * optionally `closing_over_odds` / `closing_under_odds` from the last snapshot
 * before the game. Grades the over side, which is the side the app surfaces as
 * an edge.
 */
export function gradeRow(row) {
  const actual = actualFor(row.sport, row.market, { stats: row.stats });
  const outcome = gradeSide(actual, row.over_line, 'over');
  return {
    player_name: row.player_name,
    player_id: row.player_id,
    sport: row.sport,
    market: row.market,
    bookmaker: row.bookmaker,
    game_id: row.game_id,
    game_date: row.game_date,
    line: row.over_line == null ? null : Number(row.over_line),
    odds: row.over_odds == null ? null : Number(row.over_odds),
    actual,
    outcome,
    profit_per_100: profitPer100(outcome, row.over_odds),
    clv: closingLineValue(row.over_odds, row.closing_over_odds ?? row.over_odds),
  };
}

/**
 * Roll graded rows into the headline numbers.
 *
 * Pushes are excluded from the win rate denominator -- they are returned
 * stakes, not resolved bets, and counting them drags the rate toward zero for
 * something that never had a chance to win or lose. They still count for ROI,
 * where their contribution is a genuine 0.
 */
export function summarize(graded) {
  const settled = graded.filter((g) => g.outcome != null);
  const decided = settled.filter((g) => g.outcome !== 'push');
  const wins = decided.filter((g) => g.outcome === 'win').length;

  const staked = settled.length * 100;
  const profit = settled.reduce((sum, g) => sum + (g.profit_per_100 ?? 0), 0);
  const clvs = graded.map((g) => g.clv).filter((v) => v != null);

  return {
    graded: settled.length,
    ungraded: graded.length - settled.length,
    wins,
    losses: decided.length - wins,
    pushes: settled.length - decided.length,
    winRate: decided.length ? wins / decided.length : null,
    profitPer100Staked: staked ? (profit / staked) * 100 : null,
    avgClv: clvs.length ? clvs.reduce((a, b) => a + b, 0) / clvs.length : null,
  };
}
