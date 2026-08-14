import React from 'react';

/**
 * A labelled headline number. Lifted out of ComparePage, where it was a local
 * component, so the results panel shows the same tile rather than a near-copy
 * that drifts.
 *
 * `accent` takes a full Tailwind class string so callers can colour by sign,
 * e.g. accent={signColor(roi)}.
 */
export function Stat({ label, value, accent = 'text-slate-50', hint }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 font-mono text-2xl font-bold ${accent}`}>{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-slate-600">{hint}</div>}
    </div>
  );
}

export default Stat;
