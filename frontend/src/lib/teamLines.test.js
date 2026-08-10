import { describe, it, expect } from 'vitest';
import { parseTeamLines, buildTeamMarkets } from './teamLines';

// Shape of a single-event response from The Odds API.
const rawEvent = {
  home_team: 'Boston Celtics',
  away_team: 'Miami Heat',
  commence_time: '2026-01-15T00:00:00Z',
  bookmakers: [
    {
      key: 'draftkings',
      markets: [
        { key: 'h2h', outcomes: [{ name: 'Boston Celtics', price: -150 }, { name: 'Miami Heat', price: 130 }] },
        {
          key: 'spreads',
          outcomes: [
            { name: 'Boston Celtics', price: -110, point: -3.5 },
            { name: 'Miami Heat', price: -110, point: 3.5 },
          ],
        },
        {
          key: 'totals',
          outcomes: [{ name: 'Over', price: -110, point: 215.5 }, { name: 'Under', price: -110, point: 215.5 }],
        },
      ],
    },
    {
      key: 'fanduel',
      markets: [
        { key: 'h2h', outcomes: [{ name: 'Boston Celtics', price: -145 }, { name: 'Miami Heat', price: 125 }] },
        {
          key: 'spreads',
          outcomes: [
            { name: 'Boston Celtics', price: -105, point: -3.5 },
            { name: 'Miami Heat', price: -115, point: 3.5 },
          ],
        },
        {
          key: 'totals',
          outcomes: [{ name: 'Over', price: -105, point: 215.5 }, { name: 'Under', price: -115, point: 215.5 }],
        },
      ],
    },
  ],
};

describe('parseTeamLines', () => {
  it('returns null for missing or malformed input', () => {
    expect(parseTeamLines(null)).toBeNull();
    expect(parseTeamLines(undefined)).toBeNull();
    expect(parseTeamLines({})).toBeNull(); // no bookmakers array
  });

  it('carries through team names and tip-off time', () => {
    const parsed = parseTeamLines(rawEvent);
    expect(parsed.home).toBe('Boston Celtics');
    expect(parsed.away).toBe('Miami Heat');
    expect(parsed.commenceTime).toBe('2026-01-15T00:00:00Z');
  });

  it('produces one row per book for each market', () => {
    const parsed = parseTeamLines(rawEvent);
    expect(parsed.moneyline).toHaveLength(2);
    expect(parsed.spread).toHaveLength(2);
    expect(parsed.total).toHaveLength(2);
  });

  it('maps home/away outcomes by team name, not array position', () => {
    // The away team is listed second here; matching must be by name.
    const parsed = parseTeamLines(rawEvent);
    expect(parsed.moneyline[0]).toEqual({ book: 'draftkings', homePrice: -150, awayPrice: 130 });
    expect(parsed.spread[0]).toEqual({
      book: 'draftkings',
      homePoint: -3.5,
      homePrice: -110,
      awayPoint: 3.5,
      awayPrice: -110,
    });
  });

  it('reads the total point from whichever side carries it', () => {
    const parsed = parseTeamLines(rawEvent);
    expect(parsed.total[0]).toEqual({ book: 'draftkings', point: 215.5, overPrice: -110, underPrice: -110 });
  });

  it('skips a market a book does not offer', () => {
    const partial = {
      home_team: 'A',
      away_team: 'B',
      bookmakers: [{ key: 'betus', markets: [{ key: 'h2h', outcomes: [{ name: 'A', price: -110 }] }] }],
    };
    const parsed = parseTeamLines(partial);
    expect(parsed.moneyline).toHaveLength(1);
    expect(parsed.spread).toHaveLength(0);
    expect(parsed.total).toHaveLength(0);
  });

  it('tolerates a bookmaker with no markets at all', () => {
    const parsed = parseTeamLines({ home_team: 'A', away_team: 'B', bookmakers: [{ key: 'empty' }] });
    expect(parsed.moneyline).toHaveLength(0);
  });
});

describe('buildTeamMarkets', () => {
  const cards = buildTeamMarkets(parseTeamLines(rawEvent));

  it('returns an empty list for null input', () => {
    expect(buildTeamMarkets(null)).toEqual([]);
  });

  it('builds Spread, Total, and Moneyline cards in that order', () => {
    expect(cards.map((c) => c.key)).toEqual(['spread', 'total', 'ml']);
    expect(cards.map((c) => c.title)).toEqual(['Spread', 'Total', 'Moneyline']);
  });

  it('labels spread and moneyline columns with team names, totals with Over/Under', () => {
    const [spread, total, ml] = cards;
    expect([spread.colA, spread.colB]).toEqual(['Boston Celtics', 'Miami Heat']);
    expect([total.colA, total.colB]).toEqual(['Over', 'Under']);
    expect([ml.colA, ml.colB]).toEqual(['Boston Celtics', 'Miami Heat']);
  });

  it('signs spread points so a favorite reads -3.5 and a dog +3.5', () => {
    const spread = cards[0];
    expect(spread.rows[0].a.point).toBe('-3.5');
    expect(spread.rows[0].b.point).toBe('+3.5');
  });

  it('renders the total point unsigned', () => {
    expect(cards[1].rows[0].a.point).toBe('215.5');
  });

  it('flags the best price per side independently', () => {
    const [spread, total, ml] = cards;
    expect(spread.bestA).toBe('fanduel');    // -105 beats -110 on the home side
    expect(spread.bestB).toBe('draftkings'); // -110 beats -115 on the away side
    expect(total.bestA).toBe('fanduel');     // -105 over
    expect(total.bestB).toBe('draftkings');  // -110 under
    expect(ml.bestA).toBe('fanduel');        // -145 beats -150
    expect(ml.bestB).toBe('draftkings');     // +130 beats +125
  });

  it('reports no best book when a side is entirely unpriced', () => {
    const parsed = parseTeamLines({
      home_team: 'A',
      away_team: 'B',
      bookmakers: [{ key: 'betus', markets: [{ key: 'h2h', outcomes: [{ name: 'A', price: -110 }] }] }],
    });
    const ml = buildTeamMarkets(parsed).find((c) => c.key === 'ml');
    expect(ml.bestA).toBe('betus');
    expect(ml.bestB).toBeNull();
  });
});
