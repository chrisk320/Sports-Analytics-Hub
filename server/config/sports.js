// Per-sport configuration. Adding a league should mean adding an entry here,
// not copying a controller.
//
// Before this existed, nbabets.controllers.js and nflbets.controllers.js were
// 180-line near-duplicates differing only in the literal values below, so a
// third sport meant a third copy of the same file plus a third route file.
//
// A NOTE ON CREDITS, because it drives most of the values here. The Odds API
// bills [markets] x [regions] per request:
//   /events                  0 credits  — always free, always call it first
//   /odds        (bulk)      markets x regions, ONCE for the whole slate
//   /events/:id/odds         markets x regions, PER GAME  <- the expensive one
// So team lines are nearly free, and player props are the entire budget. That
// is why `regions.team` is a single region while props get a wider net only
// where the extra books actually carry the market.

export const SPORTS = {
  nba: {
    id: 'nba',
    label: 'NBA',
    oddsSportKey: 'basketball_nba',
    kalshiSeries: 'KXNBAGAME',
    // How far ahead to look for events. The NBA posts lines a week out;
    // the NFL's weekly cadence needs a longer window.
    lookaheadDays: 7,
    teamMarkets: ['h2h', 'spreads', 'totals'],
    spreadLabel: 'Spread',
    regions: {
      // 'us' alone for team lines: us2 doubles the cost for marginal
      // small-book coverage on markets we only use for display.
      team: 'us',
      props: 'us,us2',
    },
    bookmakers: {
      team: 'draftkings,fanduel,betmgm,betus,fanatics,espnbet',
      props: 'draftkings,fanduel,betmgm,betus,fanatics,espnbet,prizepicks,underdog',
    },
    propMarkets: [
      'player_points',
      'player_rebounds',
      'player_assists',
      'player_points_rebounds',
      'player_points_assists',
      'player_rebounds_assists',
    ],
    // Futures are SEPARATE Odds API sport keys, not markets on the main key.
    // Verify against GET /v4/sports/?apiKey=... which lists the active ones.
    futures: {
      champion: 'basketball_nba_championship_winner',
      mvp: 'basketball_nba_mvp',
    },
  },

  nfl: {
    id: 'nfl',
    label: 'NFL',
    oddsSportKey: 'americanfootball_nfl',
    kalshiSeries: 'KXNFLGAME',
    lookaheadDays: 14,
    teamMarkets: ['h2h', 'spreads', 'totals'],
    spreadLabel: 'Spread',
    regions: {
      team: 'us',
      // us_dfs carries PrizePicks/Underdog, which is where a lot of NFL
      // player props actually live.
      props: 'us,us2,us_dfs',
    },
    bookmakers: {
      team: 'draftkings,fanduel,betmgm,betus,espnbet',
      props: 'draftkings,fanduel,betmgm,betus,espnbet,prizepicks,underdog',
    },
    propMarkets: [
      'player_pass_yds',
      'player_pass_tds',
      'player_rush_yds',
      'player_receptions',
      'player_reception_yds',
      'player_anytime_td',
    ],
    futures: {
      superbowl: 'americanfootball_nfl_super_bowl_winner',
    },
  },

  mlb: {
    id: 'mlb',
    label: 'MLB',
    oddsSportKey: 'baseball_mlb',
    kalshiSeries: 'KXMLBGAME',
    // Baseball is a daily 15-game slate; a long lookahead buys nothing and
    // makes the event list noisy.
    lookaheadDays: 3,
    teamMarkets: ['h2h', 'spreads', 'totals'],
    // Same market shape as a spread, different name at every sportsbook.
    spreadLabel: 'Run Line',
    regions: {
      team: 'us',
      props: 'us',
    },
    bookmakers: {
      team: 'draftkings,fanduel,betmgm,betus,espnbet',
      props: 'draftkings,fanduel,betmgm,betus,espnbet',
    },
    // Deliberately the four liquid markets only. MLB is the expensive sport
    // (~15 games/day for six months), and thin markets like batter_rbis cost
    // the same per game as liquid ones while carrying far fewer books.
    propMarkets: [
      'batter_home_runs',
      'batter_hits',
      'batter_total_bases',
      'pitcher_strikeouts',
    ],
    futures: {
      worldseries: 'baseball_mlb_world_series_winner',
    },
  },
};

export const getSport = (id) => SPORTS[String(id || '').toLowerCase()] || null;

export const sportIds = () => Object.keys(SPORTS);

// Express guard: resolves :sport (or a pinned req.sportId from a legacy route)
// into req.sport, or 400s with the list of valid ids.
export function requireSport(req, res, next) {
  const cfg = getSport(req.sportId ?? req.params.sport);
  if (!cfg) {
    return res.status(400).json({
      error: `Unknown sport '${req.sportId ?? req.params.sport}'. Valid: ${sportIds().join(', ')}`,
    });
  }
  req.sport = cfg;
  next();
}
