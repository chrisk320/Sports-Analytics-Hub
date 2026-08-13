import { describe, it, expect } from 'vitest';
import { latestFetchedAt, relativeAge, isStale, freshness, clockTime } from './freshness';

const MIN = 60_000;
const HOUR = 60 * MIN;

describe('latestFetchedAt', () => {
  it('returns null when there is nothing to read', () => {
    expect(latestFetchedAt([])).toBeNull();
    expect(latestFetchedAt(null)).toBeNull();
    expect(latestFetchedAt([{}, { fetched_at: null }])).toBeNull();
  });

  it('takes the newest across rows, not the first or last', () => {
    const rows = [
      { fetched_at: '2026-08-13 22:30:11.296' },
      { fetched_at: '2026-08-13 22:31:44.000' },
      { fetched_at: '2026-08-13 22:29:00.000' },
    ];
    expect(latestFetchedAt(rows).toISOString()).toBe('2026-08-13T22:31:44.000Z');
  });

  // The regression this file exists for. Postgres `timestamp without time zone`
  // serialises with no offset and the loader writes UTC; parsing that as local
  // time puts the odds hours off, and west of UTC it dates them in the future.
  it('reads an offset-less Postgres timestamp as UTC, not local time', () => {
    const d = latestFetchedAt([{ fetched_at: '2026-08-13 22:30:11.296' }]);
    expect(d.toISOString()).toBe('2026-08-13T22:30:11.296Z');
  });

  it('leaves an explicit offset alone', () => {
    expect(latestFetchedAt([{ fetched_at: '2026-08-13T22:30:11.296Z' }]).toISOString())
      .toBe('2026-08-13T22:30:11.296Z');
    expect(latestFetchedAt([{ fetched_at: '2026-08-13T18:30:11.296-04:00' }]).toISOString())
      .toBe('2026-08-13T22:30:11.296Z');
  });

  it('skips unparseable values instead of returning Invalid Date', () => {
    expect(latestFetchedAt([{ fetched_at: 'not a date' }])).toBeNull();
    const mixed = [{ fetched_at: 'nonsense' }, { fetched_at: '2026-08-13 22:30:00.000' }];
    expect(latestFetchedAt(mixed).toISOString()).toBe('2026-08-13T22:30:00.000Z');
  });
});

describe('relativeAge', () => {
  const now = new Date('2026-08-13T22:00:00Z').getTime();
  const ago = (ms) => new Date(now - ms);

  it('describes recent, minute, hour and day scales', () => {
    expect(relativeAge(ago(20_000), now)).toBe('just now');
    expect(relativeAge(ago(3 * MIN), now)).toBe('3m ago');
    expect(relativeAge(ago(5 * HOUR), now)).toBe('5h ago');
    expect(relativeAge(ago(50 * HOUR), now)).toBe('2d ago');
  });

  it('never reports a negative age when a clock runs ahead', () => {
    expect(relativeAge(new Date(now + 5 * MIN), now)).toBe('just now');
  });

  it('returns an empty string for no timestamp', () => {
    expect(relativeAge(null, now)).toBe('');
    expect(clockTime(null)).toBe('');
  });
});

describe('isStale', () => {
  const now = new Date('2026-08-13T22:00:00Z').getTime();

  // Props refresh once daily, so the threshold covers a full cadence plus slack.
  // Under it means the last scheduled run landed; over it means one was missed.
  it('accepts a run from within the daily cadence', () => {
    expect(isStale(new Date(now - 20 * HOUR), now)).toBe(false);
  });

  it('flags a missed run', () => {
    expect(isStale(new Date(now - 30 * HOUR), now)).toBe(true);
  });

  it('is false when there is no timestamp at all', () => {
    expect(isStale(null, now)).toBe(false);
  });
});

describe('freshness', () => {
  const now = new Date('2026-08-13T22:00:00Z').getTime();

  it('returns null when no row carries a timestamp, so callers render nothing', () => {
    expect(freshness([], now)).toBeNull();
    expect(freshness([{ over_line: 5.5 }], now)).toBeNull();
  });

  it('bundles the parsed time, age and staleness', () => {
    const f = freshness([{ fetched_at: '2026-08-13 19:00:00.000' }], now);
    expect(f.at.toISOString()).toBe('2026-08-13T19:00:00.000Z');
    expect(f.age).toBe('3h ago');
    expect(f.stale).toBe(false);
    expect(typeof f.label).toBe('string');
  });
});
