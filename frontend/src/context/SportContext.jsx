import { createContext, useContext, useMemo } from 'react';
import { DEFAULT_SPORT, isSport, marketsFor } from '@/lib/markets';

// Which sport the current view is about.
//
// Exists so the ~15 components that read prop markets don't each need `sport`
// prop-drilled through three layers. In PR 7 the provider is driven by the
// :sport route segment; until then it defaults to NBA, which preserves current
// behavior exactly.

const SportContext = createContext(null);

export function SportProvider({ sport = DEFAULT_SPORT, children }) {
  const value = useMemo(() => {
    const id = isSport(sport) ? sport : DEFAULT_SPORT;
    const cfg = marketsFor(id);
    return {
      sport: id,
      label: cfg.label,
      order: cfg.order,
      markets: cfg.markets,
      defaultMarket: cfg.defaultMarket,
      recentWindow: cfg.recentWindow,
      recentLabel: cfg.recentLabel,
      spreadLabel: cfg.spreadLabel,
    };
  }, [sport]);

  return <SportContext.Provider value={value}>{children}</SportContext.Provider>;
}

/**
 * Current sport config. Throws outside a provider rather than defaulting to
 * NBA — a silent default here would mean an MLB page quietly rendering NBA
 * markets, which is the exact bug this refactor exists to prevent.
 */
export function useSport() {
  const ctx = useContext(SportContext);
  if (!ctx) throw new Error('useSport() must be used inside a <SportProvider>');
  return ctx;
}
