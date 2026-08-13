import React from 'react';

/**
 * "Lines as of 7:04 PM" — sourced from the data's own `fetched_at`, not from
 * when the browser happened to ask.
 *
 * The distinction matters on a page telling someone where to put money: a
 * failed cron leaves day-old lines while a client-clock stamp still cheerfully
 * reads "updated 7:04 PM". This badge goes amber and names the age once the
 * odds are older than the refresh cadence, so a broken pipeline is visible on
 * the page instead of only in a workflow log.
 *
 * Renders nothing when no timestamp is available, so callers can drop it in
 * without guarding.
 */
export function FreshnessBadge({ freshness, prefix = 'lines as of', className = '' }) {
  if (!freshness) return null;
  const { label, age, stale } = freshness;

  return (
    <span
      className={`flex items-center gap-2 text-xs ${stale ? 'text-amber-400' : 'text-slate-500'} ${className}`}
      title={
        stale
          ? `These odds are ${age} — the scheduled refresh has not run since.`
          : `Odds last refreshed ${age}.`
      }
    >
      <span
        className={`h-2 w-2 rounded-full ${stale ? 'bg-amber-400' : 'animate-pulse bg-emerald-500'}`}
      />
      {stale ? `stale — ${age}` : `${prefix} ${label}`}
    </span>
  );
}

export default FreshnessBadge;
