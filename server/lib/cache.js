// Tiny in-process TTL cache with stale-on-error fallback.
//
// Generalized from the pattern that was inlined in kalshi.controllers.js. The
// reason this exists is cost, not latency: The Odds API bills per request, and
// every Express handler that proxies it used to call out on EVERY inbound HTTP
// request. That made spend scale with user traffic — a refresh loop on the game
// detail page burned real credits. Caching converts that into a fixed ceiling of
// (1 upstream call / TTL) per key, no matter how much traffic arrives.
//
// Deliberately a plain Map, not Redis: this app runs a single Render instance
// and has no traffic to speak of, so a process-local Map is the correct answer.
// The getOrFetch() signature is the seam — if there's ever a second instance,
// swap the Map for a Redis client here and no caller changes.

const store = new Map();

// Serve a cached value if fresh, otherwise call fetchFn and cache the result.
// If fetchFn throws but we hold an expired value, serve that instead — stale
// odds beat a 500, and it keeps a transient upstream blip from breaking pages.
export async function getOrFetch(key, ttlMs, fetchFn) {
  const hit = store.get(key);
  if (hit && Date.now() < hit.expiresAt) {
    return { data: hit.data, stale: false, cachedAt: hit.cachedAt };
  }

  try {
    const data = await fetchFn();
    const cachedAt = Date.now();
    store.set(key, { data, cachedAt, expiresAt: cachedAt + ttlMs });
    return { data, stale: false, cachedAt };
  } catch (error) {
    if (hit) {
      console.warn(`[cache] upstream failed for "${key}", serving stale copy:`, error.message);
      return { data: hit.data, stale: true, cachedAt: hit.cachedAt };
    }
    throw error;
  }
}

// Test/ops escape hatch. Pass a key to drop one entry, omit it to drop all.
export function invalidate(key) {
  if (key === undefined) store.clear();
  else store.delete(key);
}

export function cacheStats() {
  const now = Date.now();
  return {
    size: store.size,
    keys: [...store.entries()].map(([key, v]) => ({
      key,
      ageMs: now - v.cachedAt,
      expired: now >= v.expiresAt,
    })),
  };
}
