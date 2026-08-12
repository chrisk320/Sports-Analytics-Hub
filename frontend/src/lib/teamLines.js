// Parse the raw Odds-API single-event odds response (from /nbabets/nbateamlines/:id)
// into tidy per-book rows, then into render-ready market cards with the best
// price per side highlighted. Shape of the raw event:
//   { home_team, away_team, commence_time, bookmakers:[{ key, markets:[
//       { key:'h2h',     outcomes:[{name, price}] },
//       { key:'spreads', outcomes:[{name, price, point}] },
//       { key:'totals',  outcomes:[{name:'Over'|'Under', price, point}] } ]}] }
import { bestOdds } from './odds';

export function parseTeamLines(raw) {
  if (!raw || !raw.bookmakers) return null;
  const home = raw.home_team;
  const away = raw.away_team;
  const moneyline = [];
  const spread = [];
  const total = [];

  for (const bk of raw.bookmakers) {
    const m = {};
    for (const mk of bk.markets || []) m[mk.key] = mk.outcomes || [];

    if (m.h2h) {
      const h = m.h2h.find((o) => o.name === home);
      const a = m.h2h.find((o) => o.name === away);
      if (h || a) moneyline.push({ book: bk.key, homePrice: h?.price ?? null, awayPrice: a?.price ?? null });
    }
    if (m.spreads) {
      const h = m.spreads.find((o) => o.name === home);
      const a = m.spreads.find((o) => o.name === away);
      if (h || a)
        spread.push({
          book: bk.key,
          homePoint: h?.point ?? null,
          homePrice: h?.price ?? null,
          awayPoint: a?.point ?? null,
          awayPrice: a?.price ?? null,
        });
    }
    if (m.totals) {
      const o = m.totals.find((x) => x.name === 'Over');
      const u = m.totals.find((x) => x.name === 'Under');
      if (o || u)
        total.push({ book: bk.key, point: o?.point ?? u?.point ?? null, overPrice: o?.price ?? null, underPrice: u?.price ?? null });
    }
  }

  return { home, away, commenceTime: raw.commence_time, moneyline, spread, total };
}

const signed = (n) => (n == null ? null : n > 0 ? `+${n}` : `${n}`);

// book offering the best (highest-paying) price in `priceKey`
function bestBook(rows, priceKey) {
  const priced = rows.filter((r) => r[priceKey] != null);
  if (!priced.length) return null;
  const best = bestOdds(priced.map((r) => r[priceKey]));
  return priced.find((r) => r[priceKey] === best)?.book ?? null;
}

// Three render-ready cards: Spread / Total / Moneyline.
//
// `spreadLabel` comes from the sport registry — the market is structurally
// identical across sports (a handicap with a price), but baseball universally
// calls it a Run Line, and showing "Spread" on an MLB page reads as wrong to
// anyone who bets it.
export function buildTeamMarkets(parsed, spreadLabel = 'Spread') {
  if (!parsed) return [];
  const { home, away, moneyline, spread, total } = parsed;
  return [
    {
      key: 'spread',
      title: spreadLabel,
      colA: home,
      colB: away,
      rows: spread.map((r) => ({
        book: r.book,
        a: { point: signed(r.homePoint), price: r.homePrice },
        b: { point: signed(r.awayPoint), price: r.awayPrice },
      })),
      bestA: bestBook(spread, 'homePrice'),
      bestB: bestBook(spread, 'awayPrice'),
    },
    {
      key: 'total',
      title: 'Total',
      colA: 'Over',
      colB: 'Under',
      rows: total.map((r) => ({
        book: r.book,
        a: { point: r.point != null ? `${r.point}` : null, price: r.overPrice },
        b: { point: r.point != null ? `${r.point}` : null, price: r.underPrice },
      })),
      bestA: bestBook(total, 'overPrice'),
      bestB: bestBook(total, 'underPrice'),
    },
    {
      key: 'ml',
      title: 'Moneyline',
      colA: home,
      colB: away,
      rows: moneyline.map((r) => ({
        book: r.book,
        a: { point: null, price: r.homePrice },
        b: { point: null, price: r.awayPrice },
      })),
      bestA: bestBook(moneyline, 'homePrice'),
      bestB: bestBook(moneyline, 'awayPrice'),
    },
  ];
}
