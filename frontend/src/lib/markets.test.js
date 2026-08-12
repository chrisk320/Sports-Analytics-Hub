import { describe, it, expect } from 'vitest';
import {
  MARKETS_BY_SPORT,
  SPORTS,
  marketsFor,
  marketDef,
  marketLabel,
  marketOrder,
  marketsForRole,
  defaultMarketFor,
  isSport,
} from './markets';
import { statFromLog, hitRate, summarizeMarket, computeEdges } from './odds';
import { buildCompareRows } from './compare';

describe('registry integrity', () => {
  it('exposes the three configured sports', () => {
    expect(SPORTS).toEqual(['nba', 'nfl', 'mlb']);
  });

  it.each(SPORTS)('%s: every id in `order` has a definition', (sport) => {
    const { order, markets } = marketsFor(sport);
    for (const id of order) expect(markets[id], `${sport}.${id}`).toBeDefined();
  });

  it.each(SPORTS)('%s: every market has an Odds API key and at least one stat', (sport) => {
    const { markets } = marketsFor(sport);
    for (const [id, m] of Object.entries(markets)) {
      expect(m.key, `${sport}.${id}.key`).toBeTruthy();
      expect(Array.isArray(m.stat) && m.stat.length, `${sport}.${id}.stat`).toBeTruthy();
    }
  });

  it.each(SPORTS)('%s: Odds API market keys are unique within the sport', (sport) => {
    const keys = Object.values(marketsFor(sport).markets).map((m) => m.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it.each(SPORTS)('%s: defaultMarket is a real market', (sport) => {
    const cfg = marketsFor(sport);
    expect(cfg.order).toContain(cfg.defaultMarket);
  });

  it('uses disjoint market keys across sports, so props can never cross-match', () => {
    const all = SPORTS.flatMap((s) => Object.values(marketsFor(s).markets).map((m) => m.key));
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('marketsFor guard', () => {
  // These functions take `sport` FIRST. JavaScript won't flag a call site that
  // wasn't updated, so the guard converts a silent wrong-market read into a
  // loud failure.
  it('throws on an unknown sport rather than falling back to NBA', () => {
    expect(() => marketsFor('cricket')).toThrow(/Unknown sport "cricket"/);
  });

  it('throws when sport is omitted and a game log lands in its place', () => {
    expect(() => statFromLog({ pts: 30 }, 'PTS')).toThrow(/Unknown sport/);
  });

  it('names the sport-first convention in the error, since that is the usual cause', () => {
    expect(() => marketsFor(undefined)).toThrow(/FIRST argument/);
  });

  it('isSport reports membership without throwing', () => {
    expect(isSport('nfl')).toBe(true);
    expect(isSport('cricket')).toBe(false);
  });
});

describe('per-sport stat resolution', () => {
  it('reads NBA stats from NBA keys', () => {
    expect(statFromLog('nba', { pts: 30, reb: 8 }, 'PR')).toBe(38);
  });

  it('reads NFL stats from nflverse keys', () => {
    expect(statFromLog('nfl', { passing_yards: 312 }, 'PASSYDS')).toBe(312);
    expect(statFromLog('nfl', { receptions: 7 }, 'REC')).toBe(7);
  });

  it('sums an NFL combo market across both scoring routes', () => {
    expect(statFromLog('nfl', { rushing_tds: 1, receiving_tds: 1 }, 'ANYTD')).toBe(2);
  });

  it('reads MLB batting and pitching stats', () => {
    expect(statFromLog('mlb', { hits: 2 }, 'H')).toBe(2);
    expect(statFromLog('mlb', { strike_outs: 9 }, 'K')).toBe(9);
  });

  it('does not resolve another sport market id', () => {
    // 'PTS' is meaningless in baseball — must be null, not a coincidental read.
    expect(statFromLog('mlb', { pts: 30 }, 'PTS')).toBeNull();
  });
});

describe('role gating', () => {
  it('offers only batting markets to a batter and pitching to a pitcher', () => {
    expect(marketsForRole('mlb', 'batter')).toEqual(['H', 'TB', 'HR']);
    expect(marketsForRole('mlb', 'pitcher')).toEqual(['K']);
  });

  it('offers passing markets to a QB but not to a receiver', () => {
    expect(marketsForRole('nfl', 'QB')).toContain('PASSYDS');
    expect(marketsForRole('nfl', 'WR')).not.toContain('PASSYDS');
  });

  it('falls back to the full order when no role is known', () => {
    expect(marketsForRole('nba', null)).toEqual(marketOrder('nba'));
  });

  it('picks a default market the role can actually produce', () => {
    // MLB's overall default is H (a batting market); a pitcher must not get it.
    expect(defaultMarketFor('mlb', 'batter')).toBe('H');
    expect(defaultMarketFor('mlb', 'pitcher')).toBe('K');
  });

  it('opens each NFL position on its headline market, not the first applicable one', () => {
    // Positional fallback alone would hand a WR RUSHYDS, because rushing sorts
    // before receiving in `order`. defaultByRole is what prevents that.
    expect(defaultMarketFor('nfl', 'QB')).toBe('PASSYDS');
    expect(defaultMarketFor('nfl', 'RB')).toBe('RUSHYDS');
    expect(defaultMarketFor('nfl', 'WR')).toBe('RECYDS');
    expect(defaultMarketFor('nfl', 'TE')).toBe('RECYDS');
  });

  it('falls back to the sport default when the role has no explicit choice', () => {
    expect(defaultMarketFor('nba', 'G')).toBe('PTS');
    expect(defaultMarketFor('nba', null)).toBe('PTS');
  });
});

describe('the same math runs for every sport', () => {
  const propRow = (sport, marketId, over) => ({
    player_id: 1,
    player_name: 'P',
    game_id: 'g1',
    market: marketDef(sport, marketId).key,
    bookmaker: 'draftkings',
    over_line: 1.5,
    over_odds: -110,
    under_odds: -110,
    ...over,
  });

  it('summarizes an MLB market the same way it does an NBA one', () => {
    const rows = [
      propRow('mlb', 'H', { bookmaker: 'draftkings', over_odds: -120 }),
      propRow('mlb', 'H', { bookmaker: 'fanduel', over_odds: -105 }),
    ];
    const s = summarizeMarket('mlb', rows, 'H');
    expect(s.line).toBe(1.5);
    expect(s.bestOver.bookmaker).toBe('fanduel');
  });

  it('computes NFL hit rate against nflverse stat keys', () => {
    const logs = [{ passing_yards: 300 }, { passing_yards: 210 }, { passing_yards: 280 }];
    expect(hitRate('nfl', logs, 'PASSYDS', 249.5, 'over')).toBeCloseTo(2 / 3, 5);
  });

  it('computeEdges walks the sport-specific market order', () => {
    const edges = computeEdges('mlb', [
      propRow('mlb', 'H', { bookmaker: 'draftkings', over_odds: -120 }),
      propRow('mlb', 'H', { bookmaker: 'fanduel', over_odds: -105 }),
    ]);
    expect(edges).toHaveLength(1);
    expect(edges[0].marketId).toBe('H');
  });

  it('buildCompareRows maps MLB market keys back to MLB ids', () => {
    const rows = buildCompareRows(
      'mlb',
      [
        propRow('mlb', 'K', { bookmaker: 'draftkings' }),
        propRow('mlb', 'K', { bookmaker: 'fanduel' }),
      ],
      ['draftkings', 'fanduel']
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].marketId).toBe('K');
    expect(rows[0].marketLabel).toBe('K');
  });

  it('ignores rows whose market belongs to a different sport', () => {
    // An NBA prop row handed to the MLB pipeline must be dropped, not misread.
    const rows = buildCompareRows('mlb', [propRow('nba', 'PTS', {})], ['draftkings']);
    expect(rows).toEqual([]);
  });
});

describe('per-sport display config', () => {
  it('scales the recent-form window to the season length', () => {
    // 82 games vs 17 vs 162 — "L10" is only meaningful for one of them.
    expect(marketsFor('nba').recentLabel).toBe('L10');
    expect(marketsFor('nfl').recentLabel).toBe('L5');
    expect(marketsFor('mlb').recentLabel).toBe('L15');
  });

  it('calls the spread a Run Line in baseball', () => {
    expect(marketsFor('mlb').spreadLabel).toBe('Run Line');
    expect(marketsFor('nba').spreadLabel).toBe('Spread');
  });

  it('marketLabel falls back to the id for an unknown market', () => {
    expect(marketLabel('nba', 'PTS')).toBe('PTS');
    expect(marketLabel('nba', 'NOPE')).toBe('NOPE');
  });

  it('MARKETS_BY_SPORT is the single source both helpers read', () => {
    expect(marketOrder('nfl')).toBe(MARKETS_BY_SPORT.nfl.order);
  });
});
