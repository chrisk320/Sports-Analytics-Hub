// Per-sport prop-market registry.
//
// This is the single place that knows "PTS means player_points, and its value
// for a game log is the pts field". Every stat-reading component goes through
// statFromLog()/summarizeMarket() in odds.js, which read this — so adding a
// sport here is what makes the whole prop UI work for that sport.
//
// Shape of a market entry:
//   key       The Odds API market key, matched against player_props.market
//   label     short column header
//   name      long form, for tooltips/menus
//   stat      game-log stat keys to SUM (combo markets list more than one)
//   group     'core' | 'combo' | position group — used for column dividers
//   roles     which player roles this market applies to (MLB batter/pitcher,
//             NFL positions). Omitted = applies to everyone.

export const MARKETS_BY_SPORT = {
  nba: {
    label: 'NBA',
    defaultMarket: 'PTS',
    // "L10" is a sensible window for an 82-game season.
    recentWindow: 10,
    recentLabel: 'L10',
    spreadLabel: 'Spread',
    order: ['PTS', 'REB', 'AST', 'PR', 'PA', 'RA'],
    markets: {
      PTS: { key: 'player_points', label: 'PTS', name: 'Points', stat: ['pts'], group: 'core' },
      REB: { key: 'player_rebounds', label: 'REB', name: 'Rebounds', stat: ['reb'], group: 'core' },
      AST: { key: 'player_assists', label: 'AST', name: 'Assists', stat: ['ast'], group: 'core' },
      PR: { key: 'player_points_rebounds', label: 'PR', name: 'Points + Rebounds', stat: ['pts', 'reb'], group: 'combo' },
      PA: { key: 'player_points_assists', label: 'PA', name: 'Points + Assists', stat: ['pts', 'ast'], group: 'combo' },
      RA: { key: 'player_rebounds_assists', label: 'RA', name: 'Rebounds + Assists', stat: ['reb', 'ast'], group: 'combo' },
    },
  },

  nfl: {
    label: 'NFL',
    defaultMarket: 'PASSYDS',
    // Which market to open on for a given position. Without this, the default
    // falls back to the first positionally-applicable market in `order`, which
    // hands a wide receiver RUSHYDS — technically valid, practically useless.
    defaultByRole: { QB: 'PASSYDS', RB: 'RUSHYDS', WR: 'RECYDS', TE: 'RECYDS' },
    // A 17-game season makes "last 10" nearly half the year — too wide to say
    // anything about current form.
    recentWindow: 5,
    recentLabel: 'L5',
    spreadLabel: 'Spread',
    order: ['PASSYDS', 'PASSTD', 'RUSHYDS', 'REC', 'RECYDS', 'ANYTD'],
    markets: {
      PASSYDS: { key: 'player_pass_yds', label: 'PASS YDS', name: 'Passing Yards', stat: ['passing_yards'], group: 'passing', roles: ['QB'] },
      PASSTD: { key: 'player_pass_tds', label: 'PASS TD', name: 'Passing TDs', stat: ['passing_tds'], group: 'passing', roles: ['QB'] },
      RUSHYDS: { key: 'player_rush_yds', label: 'RUSH YDS', name: 'Rushing Yards', stat: ['rushing_yards'], group: 'rushing', roles: ['RB', 'QB', 'WR'] },
      REC: { key: 'player_receptions', label: 'REC', name: 'Receptions', stat: ['receptions'], group: 'receiving', roles: ['WR', 'TE', 'RB'] },
      RECYDS: { key: 'player_reception_yds', label: 'REC YDS', name: 'Receiving Yards', stat: ['receiving_yards'], group: 'receiving', roles: ['WR', 'TE', 'RB'] },
      // Anytime TD is a yes/no market with no line. It is stored with
      // over_line 0.5 so "scored >= 0.5 TDs" makes the existing hit-rate math
      // work unchanged rather than needing a separate code path.
      ANYTD: { key: 'player_anytime_td', label: 'ANY TD', name: 'Anytime Touchdown', stat: ['rushing_tds', 'receiving_tds'], group: 'combo' },
    },
  },

  mlb: {
    label: 'MLB',
    defaultMarket: 'H',
    defaultByRole: { batter: 'H', pitcher: 'K' },
    // Batters are high-variance game to game, so a wider window is more honest.
    recentWindow: 15,
    recentLabel: 'L15',
    // Same shape as a spread, universally called something else in baseball.
    spreadLabel: 'Run Line',
    order: ['H', 'TB', 'HR', 'K'],
    markets: {
      H: { key: 'batter_hits', label: 'H', name: 'Hits', stat: ['hits'], group: 'batting', roles: ['batter'] },
      TB: { key: 'batter_total_bases', label: 'TB', name: 'Total Bases', stat: ['total_bases'], group: 'batting', roles: ['batter'] },
      HR: { key: 'batter_home_runs', label: 'HR', name: 'Home Runs', stat: ['home_runs'], group: 'batting', roles: ['batter'] },
      K: { key: 'pitcher_strikeouts', label: 'K', name: 'Strikeouts', stat: ['strike_outs'], group: 'pitching', roles: ['pitcher'] },
    },
  },
};

export const SPORTS = Object.keys(MARKETS_BY_SPORT);

export const DEFAULT_SPORT = 'nba';

export const isSport = (sport) => Object.hasOwn(MARKETS_BY_SPORT, sport);

/**
 * Registry for a sport. Throws on an unknown sport rather than falling back.
 *
 * The loud failure is deliberate. These functions take `sport` as their FIRST
 * argument, so a call site that wasn't updated during the multi-sport refactor
 * would otherwise pass a game-log object where a sport id belongs and silently
 * read the wrong markets. JavaScript won't catch that as an arity error, so
 * this does.
 */
export function marketsFor(sport) {
  const cfg = MARKETS_BY_SPORT[sport];
  if (!cfg) {
    throw new Error(
      `Unknown sport "${sport}". Expected one of: ${SPORTS.join(', ')}. ` +
        `Note these functions take sport as the FIRST argument — a missing sport ` +
        `argument usually shows up here.`
    );
  }
  return cfg;
}

export const marketOrder = (sport) => marketsFor(sport).order;
export const marketDef = (sport, marketId) => marketsFor(sport).markets[marketId] ?? null;
export const marketLabel = (sport, marketId) => marketDef(sport, marketId)?.label ?? marketId;

/** Markets applicable to a player, filtered by role/position where declared. */
export function marketsForRole(sport, role) {
  const { order, markets } = marketsFor(sport);
  if (!role) return order;
  const applicable = order.filter((id) => {
    const roles = markets[id]?.roles;
    return !roles || roles.includes(role);
  });
  // A role no market claims still gets the full list rather than an empty one.
  // These are real players who produced real stats — a punter who completed a
  // pass on a fake, a tackle credited with a trick-play reception. `roles` says
  // which positions *typically* fill a market, so treating it as a hard filter
  // here would blank out the page of the one player it should be showing.
  return applicable.length ? applicable : order;
}

/**
 * Sensible starting market for a player.
 *
 * Prefers an explicit per-role choice (defaultByRole), then the sport default
 * if the role can produce it, then the first applicable market. The explicit
 * map matters: positional fallback alone opens a wide receiver on RUSHYDS
 * simply because rushing sorts before receiving.
 */
export function defaultMarketFor(sport, role) {
  const cfg = marketsFor(sport);
  const applicable = marketsForRole(sport, role);

  const byRole = role ? cfg.defaultByRole?.[role] : null;
  if (byRole && applicable.includes(byRole)) return byRole;
  if (applicable.includes(cfg.defaultMarket)) return cfg.defaultMarket;
  return applicable[0] ?? cfg.defaultMarket;
}

// Leaderboard stats per sport. Ids must match the backend whitelist
// (LEADERBOARD_STATS_BY_SPORT in stats.controllers.js) — the backend rejects
// anything else, so these two lists have to stay in step.
export const LEADERBOARD_STATS = {
  nba: [
    { id: 'pts', label: 'Points', unit: '' },
    { id: 'reb', label: 'Rebounds', unit: '' },
    { id: 'ast', label: 'Assists', unit: '' },
    { id: 'stl', label: 'Steals', unit: '' },
    { id: 'blk', label: 'Blocks', unit: '' },
    { id: 'ts', label: 'True Shooting', unit: '%' },
    { id: 'usage', label: 'Usage', unit: '%' },
  ],
  nfl: [
    { id: 'pass_yds', label: 'Pass Yards', unit: '' },
    { id: 'pass_tds', label: 'Pass TDs', unit: '' },
    { id: 'rush_yds', label: 'Rush Yards', unit: '' },
    { id: 'rec', label: 'Receptions', unit: '' },
    { id: 'rec_yds', label: 'Rec Yards', unit: '' },
    { id: 'ppr', label: 'Fantasy (PPR)', unit: '' },
  ],
  // Batting and pitching are separate populations, so these leaderboards are
  // role-scoped server-side. Without that a hitter's 180 strikeouts would
  // outrank every pitcher on the strikeout board.
  mlb: [
    { id: 'hits', label: 'Hits', unit: '' },
    { id: 'home_runs', label: 'Home Runs', unit: '' },
    { id: 'total_bases', label: 'Total Bases', unit: '' },
    { id: 'rbi', label: 'RBI', unit: '' },
    { id: 'strikeouts', label: 'Strikeouts Thrown', unit: '' },
    { id: 'earned_runs', label: 'Earned Runs Allowed', unit: '' },
  ],
};

/**
 * The stat a sport's leaderboard defaults to — the backend picks the first
 * configured entry when no `stat` is supplied, so this is the one it will use.
 * Callers that render a headline number need its label; hardcoding one printed
 * "289.3 PPG" against a quarterback's passing yards on the NFL home page.
 */
export const headlineStat = (sport) => LEADERBOARD_STATS[sport]?.[0] ?? null;
