import { describe, it, expect } from 'vitest';
import {
  actualFor,
  gradeSide,
  profitPer100,
  impliedProb,
  closingLineValue,
  gradeRow,
  summarize,
} from './grading.js';

describe('actualFor', () => {
  it('reads a single-stat market out of the stats blob', () => {
    expect(actualFor('mlb', 'batter_hits', { stats: { hits: 2 } })).toBe(2);
    expect(actualFor('nfl', 'player_pass_yds', { stats: { passing_yards: 289 } })).toBe(289);
    expect(actualFor('nba', 'player_points', { stats: { pts: 33 } })).toBe(33);
  });

  it('sums the components of a combo market', () => {
    expect(actualFor('nba', 'player_points_rebounds', { stats: { pts: 30, reb: 8 } })).toBe(38);
    // Anytime TD settles on any score, so the scoring columns add together.
    expect(actualFor('nfl', 'player_anytime_td', { stats: { rushing_tds: 1, receiving_tds: 1 } })).toBe(2);
  });

  // The distinction the whole module hinges on: a real zero is gradeable, a
  // missing key is not. Treating them alike would book a loss for every prop
  // whose market the mapping does not cover.
  it('returns 0 for a genuine goose egg', () => {
    expect(actualFor('mlb', 'batter_hits', { stats: { hits: 0 } })).toBe(0);
  });

  it('returns null when the stat is absent, not 0', () => {
    expect(actualFor('mlb', 'batter_hits', { stats: {} })).toBeNull();
    expect(actualFor('mlb', 'batter_hits', { stats: { total_bases: 3 } })).toBeNull();
  });

  it('returns null for an unknown market or sport', () => {
    expect(actualFor('mlb', 'batter_stolen_bases', { stats: { hits: 1 } })).toBeNull();
    expect(actualFor('cricket', 'batter_hits', { stats: { hits: 1 } })).toBeNull();
  });

  it('returns null with no log at all', () => {
    expect(actualFor('mlb', 'batter_hits', null)).toBeNull();
  });
});

describe('gradeSide', () => {
  it('settles an over', () => {
    expect(gradeSide(3, 2.5, 'over')).toBe('win');
    expect(gradeSide(2, 2.5, 'over')).toBe('loss');
  });

  it('settles an under', () => {
    expect(gradeSide(2, 2.5, 'under')).toBe('win');
    expect(gradeSide(3, 2.5, 'under')).toBe('loss');
  });

  // A whole-number line can land exactly. The frontend's hitRate() counts
  // actual >= line as a hit, which is right for the .5 lines that dominate but
  // would book a push as a win here -- and this is where money is claimed.
  it('treats landing exactly on the line as a push, for either side', () => {
    expect(gradeSide(1, 1, 'over')).toBe('push');
    expect(gradeSide(1, 1, 'under')).toBe('push');
  });

  it('cannot grade a missing actual or line', () => {
    expect(gradeSide(null, 2.5)).toBeNull();
    expect(gradeSide(3, null)).toBeNull();
  });
});

describe('profitPer100', () => {
  it('pays the American price on a win', () => {
    expect(profitPer100('win', 150)).toBe(150);
    expect(profitPer100('win', -200)).toBeCloseTo(50, 6);
  });

  it('loses the stake on a loss and returns it on a push', () => {
    expect(profitPer100('loss', 150)).toBe(-100);
    expect(profitPer100('push', 150)).toBe(0);
    expect(profitPer100('push', -200)).toBe(0);
  });

  it('rejects a 0 price, which is not a real American number', () => {
    expect(profitPer100('win', 0)).toBeNull();
  });
});

describe('closingLineValue', () => {
  it('is positive when the taken price beat the close', () => {
    // +150 implies 40%; closing -110 implies ~52.4%. Taking it early was better.
    expect(closingLineValue(150, -110)).toBeGreaterThan(0);
  });

  it('is negative when the market moved against the taken price', () => {
    expect(closingLineValue(-110, 150)).toBeLessThan(0);
  });

  it('is zero when nothing moved', () => {
    expect(closingLineValue(-110, -110)).toBeCloseTo(0, 9);
  });

  // Compared in probability space on purpose: +100 and -100 are adjacent prices
  // but 200 apart as raw numbers, so subtracting the American values measures
  // nothing real.
  it('treats +100 and -100 as the near-identical prices they are', () => {
    expect(Math.abs(closingLineValue(100, -100))).toBeLessThan(1);
    expect(impliedProb(100)).toBeCloseTo(0.5, 6);
    expect(impliedProb(-100)).toBeCloseTo(0.5, 6);
  });
});

describe('gradeRow', () => {
  const row = {
    sport: 'mlb',
    market: 'batter_hits',
    player_name: 'Otto Lopez',
    over_line: '1.5',
    over_odds: '150',
    stats: { hits: 2 },
  };

  it('grades a joined prop and result end to end', () => {
    const g = gradeRow(row);
    expect(g.actual).toBe(2);
    expect(g.outcome).toBe('win');
    expect(g.profit_per_100).toBe(150);
  });

  it('handles numeric strings from the driver', () => {
    expect(gradeRow({ ...row, over_line: '2.5' }).outcome).toBe('loss');
  });

  it('leaves outcome null when there is no matching stat', () => {
    const g = gradeRow({ ...row, stats: {} });
    expect(g.actual).toBeNull();
    expect(g.outcome).toBeNull();
    expect(g.profit_per_100).toBeNull();
  });
});

describe('summarize', () => {
  const graded = [
    { outcome: 'win', profit_per_100: 150, clv: 2 },
    { outcome: 'win', profit_per_100: 100, clv: 4 },
    { outcome: 'loss', profit_per_100: -100, clv: -1 },
    { outcome: 'push', profit_per_100: 0, clv: 0 },
    { outcome: null, profit_per_100: null, clv: null },
  ];

  it('counts outcomes and leaves ungraded rows out of the totals', () => {
    const s = summarize(graded);
    expect(s.graded).toBe(4);
    expect(s.ungraded).toBe(1);
    expect(s.wins).toBe(2);
    expect(s.losses).toBe(1);
    expect(s.pushes).toBe(1);
  });

  // A push never had a chance to win or lose, so including it in the
  // denominator would understate the record.
  it('excludes pushes from the win rate but keeps them in ROI', () => {
    const s = summarize(graded);
    expect(s.winRate).toBeCloseTo(2 / 3, 6);
    // 150 + 100 - 100 + 0 = 150 profit on 4 x $100 staked
    expect(s.profitPer100Staked).toBeCloseTo(37.5, 6);
  });

  it('averages CLV over the rows that have it', () => {
    expect(summarize(graded).avgClv).toBeCloseTo(1.25, 6);
  });

  it('reports nulls rather than NaN with nothing to grade', () => {
    const s = summarize([]);
    expect(s.winRate).toBeNull();
    expect(s.profitPer100Staked).toBeNull();
    expect(s.avgClv).toBeNull();
  });
});

describe('one bet per edge', () => {
  // The dedupe itself lives in SQL (DISTINCT ON in grades.controllers.js), but
  // the ranking it uses must agree with how the app picks a best price --
  // otherwise the panel grades a bet the UI never recommended. This pins the
  // ordering rule the SQL implements.
  const payout = (o) => (o > 0 ? o : 10000 / -o);
  const bestOf = (quotes) => [...quotes].sort((a, b) => payout(b.odds) - payout(a.odds))[0];

  it('ranks a plus price above any minus price', () => {
    expect(bestOf([{ book: 'dk', odds: -110 }, { book: 'fd', odds: 180 }]).book).toBe('fd');
  });

  it('prefers the shorter minus price when all are negative', () => {
    expect(bestOf([{ book: 'dk', odds: -200 }, { book: 'mgm', odds: -110 }]).book).toBe('mgm');
  });

  it('matches profitPer100 on the winner it selects', () => {
    const winner = bestOf([{ book: 'dk', odds: -110 }, { book: 'fd', odds: 180 }, { book: 'mgm', odds: -150 }]);
    expect(profitPer100('win', winner.odds)).toBe(180);
  });
});
