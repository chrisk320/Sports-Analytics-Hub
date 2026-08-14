// Display helpers for signed numbers.
//
// The green/red signed-percentage expression was written out inline in
// WatchlistCard and TonightsPropsSidebar, character for character. This is
// those two, extracted, so a third copy does not appear alongside them.
//
// House conventions this preserves: an em-dash for absent values, an explicit
// leading + on positives (a bare "4.5%" reads as neutral where "+4.5%" reads as
// gained), and one decimal place.

export const DASH = '—';

/** e.g. +4.5% / -4.5% / — */
export function formatSignedPct(value, digits = 1) {
  if (value == null || Number.isNaN(Number(value))) return DASH;
  const n = Number(value);
  return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}%`;
}

/** e.g. +$90.91 / -$100.00 / — */
export function formatSignedMoney(value, digits = 2) {
  if (value == null || Number.isNaN(Number(value))) return DASH;
  const n = Number(value);
  return `${n >= 0 ? '+' : '-'}$${Math.abs(n).toFixed(digits)}`;
}

/** e.g. 62.5% / — . Unsigned, for rates that cannot be negative. */
export function formatPct(fraction, digits = 1) {
  if (fraction == null || Number.isNaN(Number(fraction))) return DASH;
  return `${(Number(fraction) * 100).toFixed(digits)}%`;
}

/**
 * Tailwind colour for a signed value. Neutral rather than green at exactly
 * zero: break-even is not a gain, and colouring it green overstates results
 * that are merely flat.
 */
export function signColor(value, { neutral = 'text-slate-400' } = {}) {
  if (value == null || Number.isNaN(Number(value))) return neutral;
  const n = Number(value);
  if (n > 0) return 'text-emerald-400';
  if (n < 0) return 'text-rose-400';
  return neutral;
}
