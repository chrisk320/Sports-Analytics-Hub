// Match and shape Kalshi prediction-market data (from GET /kalshi/nbagames)
// for the game detail page. Shape of a normalized event from the backend:
//   { eventTicker, title, date:'YYYY-MM-DD'|null, awayAbbr, homeAbbr, url,
//     markets:[{ ticker, team, yesBid, yesAsk, lastPrice, volume, closeTime }] }
// Prices are Kalshi cents (1-99); a yes price of 43 implies ~43% probability.

export const NBA_TEAM_ABBR = {
  'Atlanta Hawks': 'ATL',
  'Boston Celtics': 'BOS',
  'Brooklyn Nets': 'BKN',
  'Charlotte Hornets': 'CHA',
  'Chicago Bulls': 'CHI',
  'Cleveland Cavaliers': 'CLE',
  'Dallas Mavericks': 'DAL',
  'Denver Nuggets': 'DEN',
  'Detroit Pistons': 'DET',
  'Golden State Warriors': 'GSW',
  'Houston Rockets': 'HOU',
  'Indiana Pacers': 'IND',
  'Los Angeles Clippers': 'LAC',
  'Los Angeles Lakers': 'LAL',
  'Memphis Grizzlies': 'MEM',
  'Miami Heat': 'MIA',
  'Milwaukee Bucks': 'MIL',
  'Minnesota Timberwolves': 'MIN',
  'New Orleans Pelicans': 'NOP',
  'New York Knicks': 'NYK',
  'Oklahoma City Thunder': 'OKC',
  'Orlando Magic': 'ORL',
  'Philadelphia 76ers': 'PHI',
  'Phoenix Suns': 'PHX',
  'Portland Trail Blazers': 'POR',
  'Sacramento Kings': 'SAC',
  'San Antonio Spurs': 'SAS',
  'Toronto Raptors': 'TOR',
  'Utah Jazz': 'UTA',
  'Washington Wizards': 'WAS',
};

// Codes Kalshi tickers may use that differ from the canonical abbreviations
const ABBR_ALIASES = {
  PHO: 'PHX',
  NOR: 'NOP',
  NO: 'NOP',
  SA: 'SAS',
  GS: 'GSW',
  NY: 'NYK',
  UTAH: 'UTA',
  WSH: 'WAS',
  BRK: 'BKN',
  CHO: 'CHA',
};

const normAbbr = (a) => (a ? ABBR_ALIASES[a] || a : null);

// "Portland Trail Blazers" -> "trail blazers", "Phoenix Suns" -> "suns"
export const nickname = (fullName) => {
  if (!fullName) return null;
  if (fullName === 'Portland Trail Blazers') return 'trail blazers';
  return fullName.slice(fullName.lastIndexOf(' ') + 1).toLowerCase();
};

// Kalshi ticker dates are the US/ET game date; commence_time is UTC, so a
// late tip rolls into the next UTC day. Convert to ET before comparing.
const etDate = (iso) =>
  new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

const shiftDate = (yyyyMmDd, days) => {
  const d = new Date(`${yyyyMmDd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const titleHasNickname = (event, nick) => {
  if (!nick) return false;
  const haystacks = [event.title, ...event.markets.map((m) => m.team)];
  return haystacks.some((s) => s && s.toLowerCase().includes(nick));
};

// Score one event against the game's two teams. Each team must be matched
// (by ticker abbreviation, +2, or by nickname in the title/market labels, +1)
// for the event to qualify.
function scoreEvent(event, { homeAbbr, awayAbbr, homeNick, awayNick }) {
  const evHome = normAbbr(event.homeAbbr);
  const evAway = normAbbr(event.awayAbbr);
  const eventAbbrs = [evHome, evAway].filter(Boolean);

  const teamScore = (abbr, nick) => {
    if (abbr && eventAbbrs.includes(abbr)) return 2;
    if (titleHasNickname(event, nick)) return 1;
    return 0;
  };

  const home = teamScore(homeAbbr, homeNick);
  const away = teamScore(awayAbbr, awayNick);
  return home > 0 && away > 0 ? home + away : 0;
}

// events: normalized events from GET /kalshi/nbagames
// meta: { home, away, commence } (full team names + ISO commence_time)
// Returns the single best-matching event, or null — never guesses.
export function matchKalshiEvent(events, meta) {
  if (!events?.length || !meta?.home || !meta?.away || !meta?.commence) return null;

  const gameDate = etDate(meta.commence);
  const nearDates = [shiftDate(gameDate, -1), gameDate, shiftDate(gameDate, 1)];
  const teams = {
    homeAbbr: NBA_TEAM_ABBR[meta.home] ?? null,
    awayAbbr: NBA_TEAM_ABBR[meta.away] ?? null,
    homeNick: nickname(meta.home),
    awayNick: nickname(meta.away),
  };

  let best = null;
  for (const event of events) {
    if (event.date && !nearDates.includes(event.date)) continue;
    const score = scoreEvent(event, teams);
    if (score < 2) continue;
    const exactDate = event.date === gameDate ? 1 : 0;
    if (!best || exactDate > best.exactDate || (exactDate === best.exactDate && score > best.score)) {
      best = { event, score, exactDate };
    }
  }
  return best?.event ?? null;
}

const mid = (bid, ask) => (bid != null && ask != null ? (bid + ask) / 2 : bid ?? ask);

export const formatCents = (c) => (c != null ? `${c}¢` : '—');

function findSideMarket(event, teamName) {
  const abbr = NBA_TEAM_ABBR[teamName];
  const nick = nickname(teamName);
  return (
    (abbr && event.markets.find((m) => normAbbr(m.ticker?.split('-').pop()) === abbr)) ||
    (nick && event.markets.find((m) => m.team?.toLowerCase().includes(nick))) ||
    null
  );
}

// Matched event + meta -> render-ready card model for KalshiMarketCard, or null.
export function buildKalshiMarket(event, meta) {
  if (!event || !meta) return null;

  const side = (teamName) => {
    const m = findSideMarket(event, teamName);
    if (!m) return { team: teamName, yesBid: null, yesAsk: null, lastPrice: null, impliedProb: null, volume: null };
    const price = m.lastPrice ?? mid(m.yesBid, m.yesAsk);
    return {
      team: teamName,
      yesBid: m.yesBid,
      yesAsk: m.yesAsk,
      lastPrice: m.lastPrice,
      impliedProb: price != null ? price / 100 : null,
      volume: m.volume,
    };
  };

  const sides = [side(meta.away), side(meta.home)];
  if (sides.every((s) => s.impliedProb == null)) return null;

  return {
    url: event.url,
    title: 'Game winner',
    sides,
    totalVolume: sides.reduce((sum, s) => sum + (s.volume || 0), 0),
  };
}
