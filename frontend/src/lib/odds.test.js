import { describe, it, expect } from 'vitest';
import {
  americanToImpliedProb,
  americanToDecimal,
  decimalToAmerican,
  payoutPer100,
  formatOdds,
  bestOdds,
  median,
  savingsPer100,
  evPercent,
  parlayOdds,
  statFromLog,
  hitRate,
  avgFromLogs,
  summarizeMarket,
  computeEdges,
  bookLabel,
} from './odds';

// Helper: a player_props row as it comes back from the DB-backed API.
const prop = (over) => ({
  bookmaker: 'draftkings',
  market: 'player_points',
  over_line: 25.5,
  over_odds: -110,
  under_odds: -110,
  ...over,
});

describe('american odds conversions', () => {
  it('converts American odds to implied probability', () => {
    expect(americanToImpliedProb(100)).toBeCloseTo(0.5, 10);
    expect(americanToImpliedProb(-110)).toBeCloseTo(0.5238, 4);
    expect(americanToImpliedProb(150)).toBeCloseTo(0.4, 10);
    expect(americanToImpliedProb(-200)).toBeCloseTo(0.6667, 4);
  });

  it('converts American odds to decimal', () => {
    expect(americanToDecimal(100)).toBeCloseTo(2.0, 10);
    expect(americanToDecimal(150)).toBeCloseTo(2.5, 10);
    expect(americanToDecimal(-200)).toBeCloseTo(1.5, 10);
    expect(americanToDecimal(-110)).toBeCloseTo(1.9091, 4);
  });

  it('round-trips decimal -> American', () => {
    expect(decimalToAmerican(2.5)).toBe(150);
    expect(decimalToAmerican(1.5)).toBe(-200);
    expect(decimalToAmerican(2.0)).toBe(100);
  });

  it('returns profit (not total return) per $100 staked', () => {
    expect(payoutPer100(150)).toBeCloseTo(150, 10);
    expect(payoutPer100(-200)).toBeCloseTo(50, 10);
  });

  it('guards against null/NaN rather than emitting NaN downstream', () => {
    for (const fn of [americanToImpliedProb, americanToDecimal, payoutPer100]) {
      expect(fn(null)).toBeNull();
      expect(fn(undefined)).toBeNull();
      expect(fn(NaN)).toBeNull();
    }
    expect(decimalToAmerican(1)).toBeNull(); // decimal <= 1 is not a real price
    expect(formatOdds(null)).toBe('—');
  });

  it('formats with an explicit + for positive prices', () => {
    expect(formatOdds(150)).toBe('+150');
    expect(formatOdds(-110)).toBe('-110');
  });
});

describe('bestOdds', () => {
  // The bettor-friendly price is the highest DECIMAL payout, which is easy to
  // get backwards when comparing two negative prices.
  it('prefers the least-negative price among favorites', () => {
    expect(bestOdds([-110, -105, -120])).toBe(-105);
  });

  it('prefers the most-positive price among underdogs', () => {
    expect(bestOdds([120, 150, 130])).toBe(150);
  });

  it('prefers a positive price over any negative one', () => {
    expect(bestOdds([-105, 100])).toBe(100);
  });

  it('ignores nulls and returns null when nothing is priced', () => {
    expect(bestOdds([null, -110, undefined])).toBe(-110);
    expect(bestOdds([])).toBeNull();
    expect(bestOdds([null, null])).toBeNull();
  });
});

describe('median', () => {
  it('averages the middle two for even-length input', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it('takes the middle for odd-length input', () => {
    expect(median([3, 1, 2])).toBe(2);
  });

  it('sorts numerically, not lexicographically', () => {
    // A default .sort() would order these [10, 25.5, 9] and return 25.5.
    expect(median([9, 10, 25.5])).toBe(10);
  });

  it('returns null for empty input', () => {
    expect(median([])).toBeNull();
  });
});

describe('savingsPer100', () => {
  it('measures profit gained by taking the best price over the median', () => {
    // best -105 pays 95.24; median of [-105,-110,-120] is -110, pays 90.91.
    expect(savingsPer100([-105, -110, -120])).toBeCloseTo(4.33, 2);
  });

  it('never goes negative, and needs at least two books', () => {
    expect(savingsPer100([-110, -110])).toBe(0);
    expect(savingsPer100([-110])).toBe(0);
  });
});

describe('evPercent', () => {
  it('is zero when the hit rate exactly matches the implied probability', () => {
    // +100 implies 50%; winning half the time on an even-money bet breaks even.
    expect(evPercent(0.5, 100)).toBeCloseTo(0, 10);
  });

  it('is positive when you beat the implied probability', () => {
    expect(evPercent(0.6, 100)).toBeCloseTo(20, 10);
  });

  it('is negative when you fall short of it', () => {
    expect(evPercent(0.4, 100)).toBeCloseTo(-20, 10);
  });
});

describe('parlayOdds', () => {
  it('multiplies decimal odds across legs', () => {
    // Two -110 legs: 1.9091^2 = 3.6446 decimal -> +264 American.
    expect(parlayOdds([-110, -110])).toBe(264);
  });

  it('returns the single leg unchanged', () => {
    expect(parlayOdds([150])).toBe(150);
  });

  it('returns null for no legs', () => {
    expect(parlayOdds([])).toBeNull();
  });
});

describe('statFromLog', () => {
  const log = { pts: 30, reb: 10, ast: 5 };

  it('reads a single-stat market', () => {
    expect(statFromLog(log, 'PTS')).toBe(30);
  });

  it('sums the components of a combo market', () => {
    expect(statFromLog(log, 'PR')).toBe(40);
    expect(statFromLog(log, 'PA')).toBe(35);
    expect(statFromLog(log, 'RA')).toBe(15);
  });

  it('returns null for an unknown market or missing log', () => {
    expect(statFromLog(log, 'NOPE')).toBeNull();
    expect(statFromLog(null, 'PTS')).toBeNull();
  });

  it('treats a missing stat key as 0 rather than NaN', () => {
    expect(statFromLog({ pts: 20 }, 'PR')).toBe(20);
  });
});

describe('hitRate', () => {
  const logs = [{ pts: 30 }, { pts: 20 }, { pts: 26 }, { pts: 10 }];

  it('counts games at or above the line as overs', () => {
    expect(hitRate(logs, 'PTS', 25.5, 'over')).toBeCloseTo(0.5, 10);
  });

  it('counts unders as strictly below the line', () => {
    expect(hitRate(logs, 'PTS', 25.5, 'under')).toBeCloseTo(0.5, 10);
  });

  // Documented behavior: a push (exactly on the line) is scored as a hit for
  // the over. Worth pinning — it's a real modeling choice, not an accident.
  it('scores an exact push as an over hit', () => {
    expect(hitRate([{ pts: 25 }], 'PTS', 25, 'over')).toBe(1);
    expect(hitRate([{ pts: 25 }], 'PTS', 25, 'under')).toBe(0);
  });

  it('returns null without logs or without a line', () => {
    expect(hitRate([], 'PTS', 25.5)).toBeNull();
    expect(hitRate(logs, 'PTS', null)).toBeNull();
  });
});

describe('avgFromLogs', () => {
  it('averages the market value across logs', () => {
    expect(avgFromLogs([{ pts: 10 }, { pts: 20 }], 'PTS')).toBe(15);
  });

  it('returns null with no logs', () => {
    expect(avgFromLogs([], 'PTS')).toBeNull();
  });
});

describe('summarizeMarket', () => {
  const props = [
    prop({ bookmaker: 'draftkings', over_odds: -110, under_odds: -110 }),
    prop({ bookmaker: 'fanduel', over_odds: -105, under_odds: -115 }),
    prop({ bookmaker: 'betmgm', over_odds: -120, under_odds: -102 }),
  ];

  it('picks the best over and under independently', () => {
    const s = summarizeMarket(props, 'PTS');
    expect(s.bestOver.bookmaker).toBe('fanduel'); // -105 is the best over
    expect(s.bestUnder.bookmaker).toBe('betmgm'); // -102 is the best under
  });

  it('uses the median as the consensus line', () => {
    const s = summarizeMarket(
      [prop({ over_line: 25.5 }), prop({ bookmaker: 'fanduel', over_line: 26.5 }), prop({ bookmaker: 'betmgm', over_line: 26.5 })],
      'PTS'
    );
    expect(s.line).toBe(26.5);
  });

  it('only considers rows matching the market key', () => {
    const mixed = [...props, { ...prop({}), market: 'player_rebounds', over_odds: 500 }];
    expect(summarizeMarket(mixed, 'PTS').rows).toHaveLength(3);
  });

  it('returns null for an unmodeled market or when nothing matches', () => {
    expect(summarizeMarket(props, 'NOPE')).toBeNull();
    expect(summarizeMarket([], 'PTS')).toBeNull();
  });
});

describe('computeEdges', () => {
  it('emits one edge per player+market with the best price and savings', () => {
    const rows = [
      { ...prop({ bookmaker: 'draftkings', over_odds: -120 }), player_id: 1, player_name: 'A', game_id: 'g1' },
      { ...prop({ bookmaker: 'fanduel', over_odds: -105 }), player_id: 1, player_name: 'A', game_id: 'g1' },
    ];
    const edges = computeEdges(rows);
    expect(edges).toHaveLength(1);
    expect(edges[0].book).toBe('fanduel');
    expect(edges[0].odds).toBe(-105);
    expect(edges[0].savings).toBeGreaterThan(0);
  });

  it('keeps different players separate', () => {
    const rows = [
      { ...prop({}), player_id: 1, player_name: 'A', game_id: 'g1' },
      { ...prop({}), player_id: 2, player_name: 'B', game_id: 'g1' },
    ];
    expect(computeEdges(rows)).toHaveLength(2);
  });
});

describe('bookLabel', () => {
  it('maps known book keys to display names and passes through unknowns', () => {
    expect(bookLabel('draftkings')).toBe('DraftKings');
    expect(bookLabel('some_new_book')).toBe('some_new_book');
  });
});
