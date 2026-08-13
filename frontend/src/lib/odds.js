// Shared betting math. Reused across Home, Player Detail, Game Detail, and
// Sportsbook Compare. The single most-reused module.
//
// Two halves:
//   1. Pure American-odds math — sport-agnostic, no configuration.
//   2. Market-aware helpers — these take `sport` as their FIRST argument and
//      resolve market definitions from lib/markets.js.
//
// The market definitions themselves used to live here as a hardcoded NBA
// MARKETS object; they now live in lib/markets.js keyed by sport.
import { marketDef, marketOrder } from './markets';

/* ------------------------------------------------------------------ */
/* American odds math                                                  */
/* ------------------------------------------------------------------ */

export function americanToImpliedProb(odds) {
  if (odds == null || isNaN(odds)) return null;
  return odds > 0 ? 100 / (odds + 100) : -odds / (-odds + 100);
}

export function americanToDecimal(odds) {
  if (odds == null || isNaN(odds)) return null;
  return odds > 0 ? 1 + odds / 100 : 1 + 100 / -odds;
}

export function decimalToAmerican(dec) {
  if (dec == null || dec <= 1) return null;
  return dec >= 2 ? Math.round((dec - 1) * 100) : Math.round(-100 / (dec - 1));
}

// Profit on a $100 stake at the given American price.
export function payoutPer100(odds) {
  // 0 is not a valid American price -- the scale runs +100..inf and -100..-inf
  // with nothing between. Letting it through yields 10000 / -0 = -Infinity,
  // which then propagates into savings as +Infinity.
  if (odds == null || isNaN(odds) || odds === 0) return null;
  return odds > 0 ? odds : 10000 / -odds;
}

export function formatOdds(odds) {
  if (odds == null || isNaN(odds)) return '—';
  return odds > 0 ? `+${odds}` : `${odds}`;
}

// Best American price for the bettor = highest decimal payout
// (most-positive / least-negative). Returns the numeric odds.
export function bestOdds(oddsList) {
  const valid = oddsList.filter((o) => o != null && !isNaN(o));
  if (!valid.length) return null;
  return valid.reduce((best, o) =>
    americanToDecimal(o) > americanToDecimal(best) ? o : best
  );
}

export function median(nums) {
  const valid = nums.filter((n) => n != null && !isNaN(n)).sort((a, b) => a - b);
  if (!valid.length) return null;
  const mid = Math.floor(valid.length / 2);
  return valid.length % 2 ? valid[mid] : (valid[mid - 1] + valid[mid]) / 2;
}

// Dollars saved per $100 by taking the best price vs the median price.
//
// The median is taken over PAYOUTS, not over the American odds themselves.
// American odds are not a continuous scale: +100 and -100 are adjacent prices
// (both 2.0 decimal), but their numeric mean is 0 -- which is not a price at
// all, and payoutPer100(0) is 10000 / -0 = -Infinity. An even number of books
// split either side of even money therefore produced a median of 0 and a saving
// of +Infinity, which reached the alerts feed as "+$Infinity/100".
export function savingsPer100(oddsList) {
  const payouts = oddsList.map(payoutPer100).filter((p) => p != null && Number.isFinite(p));
  if (payouts.length < 2) return 0;
  const s = Math.max(...payouts) - median(payouts);
  return s > 0 ? s : 0;
}

// EV (%) of a $1 bet given a hit rate (0..1) and American odds.
export function evPercent(hitRate, odds) {
  if (hitRate == null || odds == null || isNaN(odds)) return null;
  const dec = americanToDecimal(odds);
  return (hitRate * (dec - 1) - (1 - hitRate)) * 100;
}

// Combine American odds into a parlay; returns American odds for the parlay.
export function parlayOdds(oddsList) {
  const valid = oddsList.filter((o) => o != null && !isNaN(o));
  if (!valid.length) return null;
  const dec = valid.reduce((acc, o) => acc * americanToDecimal(o), 1);
  return decimalToAmerican(dec);
}

/* ------------------------------------------------------------------ */
/* Market-aware helpers — all take `sport` FIRST                       */
/* ------------------------------------------------------------------ */

// Value of a market for one game log (sum of its component stats).
// Reads keys out of the JSONB stats blob flattened onto the log row, so the
// same function serves 'pts' for NBA and 'passing_yards' for NFL.
export function statFromLog(sport, log, marketId) {
  const m = marketDef(sport, marketId);
  if (!m || !log) return null;
  return m.stat.reduce((sum, k) => sum + (Number(log[k]) || 0), 0);
}

// Fraction of games (0..1) the player cleared `line` for `marketId`.
// A push (exactly on the line) counts as an over hit.
export function hitRate(sport, logs, marketId, line, side = 'over') {
  if (!logs?.length || line == null) return null;
  let hits = 0;
  let counted = 0;
  for (const log of logs) {
    const v = statFromLog(sport, log, marketId);
    if (v == null) continue;
    counted += 1;
    if (side === 'over' ? v >= line : v < line) hits += 1;
  }
  return counted ? hits / counted : null;
}

// Average market value over the supplied logs.
export function avgFromLogs(sport, logs, marketId) {
  if (!logs?.length) return null;
  const vals = logs.map((l) => statFromLog(sport, l, marketId)).filter((v) => v != null);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

// Collapse a player's prop rows for one market into a tidy summary:
// consensus line, best over/under book+price, and over-side savings.
export function summarizeMarket(sport, props, marketId) {
  const key = marketDef(sport, marketId)?.key;
  if (!key) return null;
  const rows = (props || []).filter((p) => p.market === key);
  if (!rows.length) return null;

  const line = median(rows.map((r) => Number(r.over_line)).filter((l) => l != null));
  const overRows = rows.filter((r) => r.over_odds != null);
  const underRows = rows.filter((r) => r.under_odds != null);

  const bestOver = overRows.reduce(
    (b, r) =>
      b == null || americanToDecimal(r.over_odds) > americanToDecimal(b.over_odds) ? r : b,
    null
  );
  const bestUnder = underRows.reduce(
    (b, r) =>
      b == null || americanToDecimal(r.under_odds) > americanToDecimal(b.under_odds) ? r : b,
    null
  );

  return {
    marketId,
    line,
    rows,
    bestOver,
    bestUnder,
    overSavings: savingsPer100(overRows.map((r) => r.over_odds)),
  };
}

// Group flat prop rows by player, then emit one "edge" per (player, market):
// the best over price, consensus line, and savings/$100 vs the median book.
// Sorted by savings desc. Reused by Home (ticker/alerts/hot-edges) + Compare.
export function computeEdges(sport, props) {
  const byPlayer = new Map();
  for (const r of props || []) {
    const pid = r.player_id ?? r.player_name;
    if (!byPlayer.has(pid)) {
      byPlayer.set(pid, {
        player_id: r.player_id,
        player_name: r.full_name || r.player_name,
        headshot_url: r.headshot_url,
        home_team: r.home_team,
        away_team: r.away_team,
        game_id: r.game_id,
        rows: [],
      });
    }
    byPlayer.get(pid).rows.push(r);
  }

  const edges = [];
  for (const p of byPlayer.values()) {
    for (const marketId of marketOrder(sport)) {
      const s = summarizeMarket(sport, p.rows, marketId);
      if (!s || !s.bestOver) continue;
      edges.push({
        key: `${p.player_id ?? p.player_name}-${marketId}`,
        playerId: p.player_id,
        playerName: p.player_name,
        headshot_url: p.headshot_url,
        gameId: p.game_id,
        homeTeam: p.home_team,
        awayTeam: p.away_team,
        marketId,
        line: s.line,
        book: s.bestOver.bookmaker,
        odds: s.bestOver.over_odds,
        savings: s.overSavings,
        bookCount: s.rows.length,
      });
    }
  }
  return edges.sort((a, b) => b.savings - a.savings);
}

/* ------------------------------------------------------------------ */
/* Sportsbooks                                                         */
/* ------------------------------------------------------------------ */

export const BOOKMAKERS = {
  draftkings: 'DraftKings',
  fanduel: 'FanDuel',
  betmgm: 'BetMGM',
  betus: 'BetUS',
  fanatics: 'Fanatics',
  espnbet: 'ESPN BET',
  prizepicks: 'PrizePicks',
  underdog: 'Underdog',
};

export const DEFAULT_BOOKS = ['draftkings', 'fanduel', 'betmgm', 'betus', 'fanatics', 'espnbet'];

export const bookLabel = (key) => BOOKMAKERS[key] || key;
