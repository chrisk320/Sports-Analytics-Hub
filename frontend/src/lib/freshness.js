/**
 * How old the odds are, derived from the data rather than the client clock.
 *
 * Every props endpoint already returns `fetched_at` (they `SELECT pp.*` from
 * the player_props_latest view), but the UI showed `new Date()` captured at
 * fetch time instead. Those answer different questions: one is "when did we
 * last ask", the other is "how stale is this number". They agree only when the
 * pipeline is healthy, and diverge exactly when it is not -- a failed cron
 * leaves lines a day old while the page cheerfully reports "updated 7:04 PM".
 *
 * That distinction is the whole point on a page telling someone where to put
 * money.
 */

// Props are refreshed once a day, so "stale" here means the scheduled run did
// not land, not that the number moved. Sized to the cadence in
// .github/workflows/props-fetch.yml -- change both together.
const STALE_AFTER_MS = 26 * 60 * 60 * 1000; // one daily run, plus slack

/**
 * Newest `fetched_at` across a set of prop rows, as a Date, or null.
 *
 * Takes the max rather than the min: rows come from several books in one run
 * and should share a timestamp, but a partially-failed run can leave a mix, and
 * the newest is what "as of" means.
 */
export function latestFetchedAt(rows) {
  let newest = null;
  for (const r of rows || []) {
    const raw = r?.fetched_at;
    if (!raw) continue;
    // Postgres `timestamp without time zone` serialises with no offset, and the
    // loader writes UTC. Without the marker the browser would read it as local
    // time and report odds from the future in any timezone west of UTC.
    const d = new Date(/[Z+]|\d-\d\d:\d\d$/.test(raw) ? raw : `${raw}Z`);
    if (!Number.isNaN(d.getTime()) && (!newest || d > newest)) newest = d;
  }
  return newest;
}

/** Short absolute clock time, e.g. "7:04 PM". */
export const clockTime = (d) =>
  d ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

/** Coarse relative age, e.g. "3m ago", "5h ago", "2d ago". */
export function relativeAge(d, now = Date.now()) {
  if (!d) return '';
  const mins = Math.max(0, Math.round((now - d.getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export const isStale = (d, now = Date.now()) => !!d && now - d.getTime() > STALE_AFTER_MS;

/**
 * Everything a freshness badge needs from a set of rows.
 * `null` when no row carries a timestamp, so callers can render nothing rather
 * than an empty badge.
 */
export function freshness(rows, now = Date.now()) {
  const at = latestFetchedAt(rows);
  if (!at) return null;
  return { at, label: clockTime(at), age: relativeAge(at, now), stale: isStale(at, now) };
}
