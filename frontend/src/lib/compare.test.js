import { describe, it, expect } from 'vitest';
import { buildCompareRows, sortRows, bestBookToday, avgSavings, evCount } from './compare';

// One row of the flat prop slate, as returned by /playerprops/today.
const row = (over) => ({
  player_id: 1,
  player_name: 'Test Player',
  game_id: 'g1',
  home_team: 'Home',
  away_team: 'Away',
  market: 'player_points',
  bookmaker: 'draftkings',
  over_line: 25.5,
  over_odds: -110,
  under_odds: -110,
  ...over,
});

const BOOKS = ['draftkings', 'fanduel', 'betmgm', 'betus'];

describe('buildCompareRows — grouping', () => {
  it('collapses all books for one player+market into a single row', () => {
    const rows = buildCompareRows(
      [
        row({ bookmaker: 'draftkings' }),
        row({ bookmaker: 'fanduel' }),
        row({ bookmaker: 'betmgm' }),
      ],
      BOOKS
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].prices.size).toBe(3);
    expect(rows[0].bookCount).toBe(3);
  });

  it('keeps separate rows per market and per player', () => {
    const rows = buildCompareRows(
      [
        row({ market: 'player_points' }),
        row({ market: 'player_rebounds' }),
        row({ player_id: 2, player_name: 'Other' }),
      ],
      BOOKS
    );
    expect(rows).toHaveLength(3);
  });

  it('ignores books the user has not selected', () => {
    const rows = buildCompareRows(
      [row({ bookmaker: 'draftkings' }), row({ bookmaker: 'not_selected' })],
      ['draftkings']
    );
    expect(rows[0].bookCount).toBe(1);
  });

  it('ignores markets the app does not model', () => {
    expect(buildCompareRows([row({ market: 'player_blocks_we_dont_model' })], BOOKS)).toHaveLength(0);
  });

  it('handles empty / null input', () => {
    expect(buildCompareRows([], BOOKS)).toEqual([]);
    expect(buildCompareRows(null, BOOKS)).toEqual([]);
  });
});

describe('buildCompareRows — consensus line', () => {
  it('uses the most common line', () => {
    const rows = buildCompareRows(
      [
        row({ bookmaker: 'draftkings', over_line: 25.5 }),
        row({ bookmaker: 'fanduel', over_line: 26.5 }),
        row({ bookmaker: 'betmgm', over_line: 26.5 }),
      ],
      BOOKS
    );
    expect(rows[0].line).toBe(26.5);
  });

  // Documented tie-break: equal counts resolve to the LOWER line.
  it('breaks a tie toward the lower line', () => {
    const rows = buildCompareRows(
      [row({ bookmaker: 'draftkings', over_line: 25.5 }), row({ bookmaker: 'fanduel', over_line: 26.5 })],
      BOOKS
    );
    expect(rows[0].line).toBe(25.5);
  });
});

describe('buildCompareRows — alternate lines are excluded from best-price math', () => {
  // This is the core correctness claim of the module: a book sitting on a
  // different line is not comparable, even if its raw price looks better.
  const rows = buildCompareRows(
    [
      row({ bookmaker: 'draftkings', over_line: 25.5, over_odds: -115 }),
      row({ bookmaker: 'fanduel', over_line: 25.5, over_odds: -105 }),
      row({ bookmaker: 'betmgm', over_line: 25.5, over_odds: -120 }),
      // Way better price, but on a HIGHER line — must not win.
      row({ bookmaker: 'betus', over_line: 28.5, over_odds: 250 }),
    ],
    BOOKS
  );

  it('picks the best price only among books at the consensus line', () => {
    expect(rows[0].line).toBe(25.5);
    expect(rows[0].bestBook).toBe('fanduel');
    expect(rows[0].bestOver).toBe(-105);
  });

  it('still displays the alternate-line book so the user can see it', () => {
    expect(rows[0].prices.get('betus')).toEqual({ book: 'betus', over: 250, under: -110, overLine: 28.5 });
  });

  it('excludes the alternate-line book from bookCount used for best-price math', () => {
    expect(rows[0].bookCount).toBe(3);
  });
});

describe('buildCompareRows — de-vig / fair odds', () => {
  it('returns null fair odds below the two-book minimum', () => {
    const rows = buildCompareRows([row({ bookmaker: 'draftkings' })], BOOKS);
    expect(rows[0].fairProb).toBeNull();
    expect(rows[0].fairOdds).toBeNull();
    expect(rows[0].edgePct).toBeNull();
  });

  it('de-vigs a balanced two-way market to a 50% fair probability', () => {
    // Both books -110/-110: proportional de-vig gives exactly 0.5.
    const rows = buildCompareRows(
      [
        row({ bookmaker: 'draftkings', over_odds: -110, under_odds: -110 }),
        row({ bookmaker: 'fanduel', over_odds: -110, under_odds: -110 }),
      ],
      BOOKS
    );
    expect(rows[0].fairProb).toBeCloseTo(0.5, 10);
    expect(rows[0].fairOdds).toBe(100); // 50% fair == +100
  });

  it('reports negative edge when the best price is worse than fair', () => {
    // Fair is 50% (+100) but the best available over is -110 -> you are laying juice.
    const rows = buildCompareRows(
      [
        row({ bookmaker: 'draftkings', over_odds: -110, under_odds: -110 }),
        row({ bookmaker: 'fanduel', over_odds: -110, under_odds: -110 }),
      ],
      BOOKS
    );
    expect(rows[0].edgePct).toBeLessThan(0);
  });

  it('reports positive edge when one book prices the over above fair', () => {
    // Two tight books set fair near 50%; a third offers +150 on the same line.
    const rows = buildCompareRows(
      [
        row({ bookmaker: 'draftkings', over_odds: -110, under_odds: -110 }),
        row({ bookmaker: 'fanduel', over_odds: -110, under_odds: -110 }),
        row({ bookmaker: 'betmgm', over_odds: 150, under_odds: -110 }),
      ],
      BOOKS
    );
    expect(rows[0].bestOver).toBe(150);
    expect(rows[0].edgePct).toBeGreaterThan(0);
  });

  it('ignores one-way books when estimating fair odds', () => {
    // Only one book has BOTH sides, so we are below MIN_DEVIG_BOOKS.
    const rows = buildCompareRows(
      [
        row({ bookmaker: 'draftkings', over_odds: -110, under_odds: -110 }),
        row({ bookmaker: 'fanduel', over_odds: -110, under_odds: null }),
      ],
      BOOKS
    );
    expect(rows[0].fairProb).toBeNull();
  });
});

describe('sortRows', () => {
  const rows = [
    { savings: 1, edgePct: 5 },
    { savings: 9, edgePct: null },
    { savings: 4, edgePct: 8 },
  ];

  it('sorts by savings descending by default', () => {
    expect(sortRows(rows, 'savings').map((r) => r.savings)).toEqual([9, 4, 1]);
  });

  it('sorts by edge descending, pushing null edges last', () => {
    expect(sortRows(rows, 'edge').map((r) => r.edgePct)).toEqual([8, 5, null]);
  });

  it('does not mutate the input array', () => {
    const original = [...rows];
    sortRows(rows, 'edge');
    expect(rows).toEqual(original);
  });
});

describe('summary helpers', () => {
  it('bestBookToday returns the book holding the most best prices', () => {
    const rows = [{ bestBook: 'fanduel' }, { bestBook: 'fanduel' }, { bestBook: 'draftkings' }];
    expect(bestBookToday(rows)).toEqual({ book: 'fanduel', count: 2 });
  });

  it('bestBookToday returns null when nothing is priced', () => {
    expect(bestBookToday([{ bestBook: null }])).toBeNull();
  });

  it('avgSavings only averages rows with at least two books', () => {
    // The single-book row would drag the average to 5 if it were counted.
    const rows = [
      { savings: 10, bookCount: 3 },
      { savings: 20, bookCount: 2 },
      { savings: 0, bookCount: 1 },
    ];
    expect(avgSavings(rows)).toBe(15);
  });

  it('avgSavings is 0 when no row qualifies', () => {
    expect(avgSavings([{ savings: 5, bookCount: 1 }])).toBe(0);
  });

  it('evCount counts only strictly positive edges', () => {
    expect(evCount([{ edgePct: 2 }, { edgePct: 0 }, { edgePct: -3 }, { edgePct: null }])).toBe(1);
  });
});
