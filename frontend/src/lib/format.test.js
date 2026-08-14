import { describe, it, expect } from 'vitest';
import { formatSignedPct, formatSignedMoney, formatPct, signColor, DASH } from './format';

describe('formatSignedPct', () => {
  it('marks gains with an explicit plus', () => {
    expect(formatSignedPct(4.5)).toBe('+4.5%');
    expect(formatSignedPct(-4.5)).toBe('-4.5%');
    expect(formatSignedPct(0)).toBe('+0.0%');
  });
  it('falls back to the em-dash convention', () => {
    expect(formatSignedPct(null)).toBe(DASH);
    expect(formatSignedPct(undefined)).toBe(DASH);
    expect(formatSignedPct(NaN)).toBe(DASH);
  });
});

describe('formatSignedMoney', () => {
  it('puts the sign outside the currency symbol', () => {
    expect(formatSignedMoney(90.909)).toBe('+$90.91');
    expect(formatSignedMoney(-100)).toBe('-$100.00');
  });
  it('returns the em-dash for nothing', () => {
    expect(formatSignedMoney(null)).toBe(DASH);
  });
});

describe('formatPct', () => {
  it('renders a 0..1 fraction as a percentage', () => {
    expect(formatPct(0.625)).toBe('62.5%');
    expect(formatPct(0)).toBe('0.0%');
  });
  it('distinguishes a real zero from no data', () => {
    expect(formatPct(null)).toBe(DASH);
  });
});

describe('signColor', () => {
  it('colours by sign', () => {
    expect(signColor(1)).toBe('text-emerald-400');
    expect(signColor(-1)).toBe('text-rose-400');
  });
  // Break-even is not a gain; green would overstate a flat result.
  it('stays neutral at exactly zero and for missing values', () => {
    expect(signColor(0)).toBe('text-slate-400');
    expect(signColor(null)).toBe('text-slate-400');
  });
});
