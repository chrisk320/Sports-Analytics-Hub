// Shaping for the Sportsbook Compare page: collapse the flat slate of props
// into one row per (player, market) that carries EVERY selected book's Over
// price, so the UI can lay books out as columns and shop the best price.
//
// "Best" / savings / fair-odds are computed only across books sitting at the
// SAME (consensus) line, so we never compare an O 32.5 price against an O 33.5
// price. Books on an alternate line are still shown, just flagged + excluded
// from the best-price math.
import {
  median,
  bestOdds,
  savingsPer100,
  americanToImpliedProb,
  decimalToAmerican,
  evPercent,
} from './odds';
import { marketsFor, marketLabel } from './markets';

// market key (e.g. 'player_points') -> marketId ('PTS'), per sport.
// Built lazily and memoized: this used to be a module-level const derived from
// the NBA-only registry, which meant the mapping was baked in at import time
// and could never vary by sport.
const keyToIdCache = new Map();
function keyToId(sport) {
  if (!keyToIdCache.has(sport)) {
    const { order, markets } = marketsFor(sport);
    keyToIdCache.set(sport, Object.fromEntries(order.map((id) => [markets[id].key, id])));
  }
  return keyToIdCache.get(sport);
}

const MIN_DEVIG_BOOKS = 2; // need at least this many two-way books to estimate fair

function probToAmerican(p) {
  if (p == null || p <= 0 || p >= 1) return null;
  return decimalToAmerican(1 / p);
}

// Most frequent value (the line "everyone" is on). Ties break to the lower line.
function mode(nums) {
  let best = null;
  const counts = new Map();
  for (const n of nums) {
    const c = (counts.get(n) || 0) + 1;
    counts.set(n, c);
    if (!best || c > best.c || (c === best.c && n < best.n)) best = { n, c };
  }
  return best ? best.n : null;
}

// De-vig each two-way book (proportional method), then take the consensus
// (median) fair Over probability. Null until we have enough two-way books.
function fairOverProb(perBook) {
  const fairs = [];
  for (const b of perBook) {
    const po = americanToImpliedProb(b.over);
    const pu = americanToImpliedProb(b.under);
    if (po == null || pu == null) continue;
    const sum = po + pu;
    if (sum <= 0) continue;
    fairs.push(po / sum);
  }
  if (fairs.length < MIN_DEVIG_BOOKS) return null;
  return median(fairs);
}

export function buildCompareRows(sport, props, books) {
  const bookSet = new Set(books);
  const byKey = keyToId(sport);
  const groups = new Map();

  for (const r of props || []) {
    if (!bookSet.has(r.bookmaker)) continue;
    const marketId = byKey[r.market];
    if (!marketId) continue; // ignore markets we don't model
    const playerKey = r.player_id ?? r.player_name;
    const key = `${playerKey}|${r.game_id}|${marketId}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        playerId: r.player_id,
        playerName: r.full_name || r.player_name,
        headshot: r.headshot_url,
        gameId: r.game_id,
        homeTeam: r.home_team,
        awayTeam: r.away_team,
        marketId,
        byBook: new Map(),
      });
    }
    groups.get(key).byBook.set(r.bookmaker, {
      book: r.bookmaker,
      over: r.over_odds != null ? Number(r.over_odds) : null,
      under: r.under_odds != null ? Number(r.under_odds) : null,
      overLine: r.over_line != null ? Number(r.over_line) : null,
    });
  }

  const rows = [];
  for (const g of groups.values()) {
    const perBook = [...g.byBook.values()];
    const line = mode(perBook.map((b) => b.overLine).filter((l) => l != null));

    // Only books at the consensus line are comparable for best-price/fair.
    const atLine = line != null ? perBook.filter((b) => b.overLine === line) : perBook;
    const overs = atLine.map((b) => b.over).filter((o) => o != null);
    if (!overs.length) continue;

    const best = bestOdds(overs);
    const bestEntry = atLine.find((b) => b.over === best) || null;
    const fair = fairOverProb(atLine);
    const edgePct = fair != null && best != null ? evPercent(fair, best) : null;

    rows.push({
      key: g.key,
      playerId: g.playerId,
      playerName: g.playerName,
      headshot: g.headshot,
      gameId: g.gameId,
      homeTeam: g.homeTeam,
      awayTeam: g.awayTeam,
      marketId: g.marketId,
      marketLabel: marketLabel(sport, g.marketId),
      line,
      prices: g.byBook, // book -> { over, under, overLine }
      bestBook: bestEntry?.book ?? null,
      bestOver: best,
      savings: savingsPer100(overs),
      fairProb: fair,
      fairOdds: probToAmerican(fair),
      edgePct,
      bookCount: overs.length,
    });
  }
  return rows;
}

export function sortRows(rows, sortKey) {
  const copy = [...rows];
  if (sortKey === 'edge') copy.sort((a, b) => (b.edgePct ?? -Infinity) - (a.edgePct ?? -Infinity));
  else copy.sort((a, b) => b.savings - a.savings);
  return copy;
}

// Book that most often holds the best price across the rows.
export function bestBookToday(rows) {
  const counts = {};
  for (const r of rows) if (r.bestBook) counts[r.bestBook] = (counts[r.bestBook] || 0) + 1;
  let top = null;
  for (const [book, count] of Object.entries(counts)) if (!top || count > top.count) top = { book, count };
  return top;
}

export function avgSavings(rows) {
  const vals = rows.filter((r) => r.bookCount >= 2).map((r) => r.savings);
  if (!vals.length) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export function evCount(rows) {
  return rows.filter((r) => r.edgePct != null && r.edgePct > 0).length;
}
