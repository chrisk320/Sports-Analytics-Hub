import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useOutletContext, Link } from 'react-router-dom';
import { Loader, ChevronLeft } from 'lucide-react';
import { api } from '../lib/api';
import { parseTeamLines, buildTeamMarkets } from '../lib/teamLines';
import { matchKalshiEvent, buildKalshiMarket } from '../lib/kalshi';
import TeamMarketCard from '../components/game/TeamMarketCard';
import TeamPropsTable from '../components/game/TeamPropsTable';
import { FreshnessBadge } from '../components/ui/freshness-badge';
import { freshness } from '../lib/freshness';
import KalshiMarketCard from '../components/game/KalshiMarketCard';
import { useSport } from '@/context/SportContext';

export default function GameDetailPage() {
  const { gameId } = useParams();
  const { games, allTeams } = useOutletContext();
  const { sport, spreadLabel } = useSport();

  const [loading, setLoading] = useState(true);
  const [parsed, setParsed] = useState(null);
  const [props, setProps] = useState([]);
  const propsFreshness = useMemo(() => freshness(props), [props]);
  const [kalshiData, setKalshiData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [linesRes, propsRes, kalshiRes] = await Promise.all([
        api.get(`/bets/${sport}/teamlines/${gameId}`).catch(() => ({ data: null })),
        api.get(`/playerprops/game/${gameId}`).catch(() => ({ data: [] })),
        sport === 'nba' ? api.get('/kalshi/nbagames').catch(() => ({ data: null })) : Promise.resolve({ data: null }),
      ]);
      if (cancelled) return;
      setParsed(parseTeamLines(linesRes.data));
      setProps(propsRes.data || []);
      setKalshiData(kalshiRes.data);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [gameId, sport]);

  const gameFromList = games.find((g) => g.id === gameId);
  const meta = useMemo(() => {
    if (parsed) return { home: parsed.home, away: parsed.away, commence: parsed.commenceTime };
    if (gameFromList) return { home: gameFromList.home_team, away: gameFromList.away_team, commence: gameFromList.commence_time };
    if (props[0]) return { home: props[0].home_team, away: props[0].away_team, commence: props[0].game_date };
    return null;
  }, [parsed, gameFromList, props]);

  const markets = useMemo(() => buildTeamMarkets(parsed, spreadLabel), [parsed, spreadLabel]);

  const kalshiMarket = useMemo(() => {
    if (!meta || !kalshiData?.events?.length) return null;
    const event = matchKalshiEvent(kalshiData.events, meta);
    return event ? buildKalshiMarket(event, meta) : null;
  }, [kalshiData, meta]);

  const { homePlayers, awayPlayers, otherPlayers, homeAbbr, awayAbbr } = useMemo(() => {
    const byPlayer = new Map();
    for (const r of props) {
      const k = r.player_id ?? r.player_name;
      if (!byPlayer.has(k))
        byPlayer.set(k, { playerId: r.player_id, playerName: r.full_name || r.player_name, team: r.team_abbreviation, props: [] });
      byPlayer.get(k).props.push(r);
    }
    const all = [...byPlayer.values()];

    // Resolve each side's abbreviation from the teams table, then fall back to
    // the props themselves.
    //
    // The fallback is not defensive padding -- it is the bug this function had.
    // The lookup returned undefined for every MLB game because `teams` held
    // only the 30 NBA clubs, so both filters matched nothing and 117 real props
    // rendered as two empty tables. Deriving the two sides from the players who
    // actually have props means a missing or incomplete teams table degrades
    // the LABEL, never the data.
    const byName = (name) => allTeams.find((t) => t.team_name === name)?.team_abbreviation;
    const counts = new Map();
    for (const p of all) if (p.team) counts.set(p.team, (counts.get(p.team) ?? 0) + 1);
    const dominant = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);

    let hAbbr = byName(meta?.home);
    let aAbbr = byName(meta?.away);
    if (!hAbbr && !aAbbr) {
      // Neither side known: take the two best-represented squads. Order is
      // arbitrary but stable, and the headers still carry the real team names.
      [aAbbr, hAbbr] = dominant;
    } else if (!hAbbr) {
      hAbbr = dominant.find((t) => t !== aAbbr);
    } else if (!aAbbr) {
      aAbbr = dominant.find((t) => t !== hAbbr);
    }

    const homePlayers = all.filter((p) => p.team === hAbbr);
    const awayPlayers = all.filter((p) => p.team === aAbbr);
    return {
      homeAbbr: hAbbr,
      awayAbbr: aAbbr,
      homePlayers,
      awayPlayers,
      // A player traded since the last roster load carries a stale team and
      // belongs to neither side. They are still playing in this game, so
      // surface them rather than dropping them on the floor.
      otherPlayers: all.filter((p) => p.team !== hAbbr && p.team !== aAbbr),
    };
  }, [props, allTeams, meta]);

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader className="h-10 w-10 animate-spin text-purple-500" />
      </div>
    );
  }

  if (!meta) {
    return (
      <div className="mx-auto max-w-3xl py-20 text-center text-slate-400">
        <p>Game not found, or no lines posted.</p>
        <Link to={`/${sport}/games`} className="mt-4 inline-block text-cyan-400 hover:text-cyan-300">
          ← Back to games
        </Link>
      </div>
    );
  }

  const tip = meta.commence
    ? new Date(meta.commence).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null;

  const TeamBlock = ({ name, abbr }) => (
    <div className="flex flex-col items-center gap-1">
      <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-slate-700 bg-slate-800 font-mono text-lg font-bold text-slate-200">
        {abbr || name?.slice(0, 3).toUpperCase()}
      </div>
      <span className="text-center text-sm font-semibold text-slate-100">{name}</span>
    </div>
  );

  return (
    <div className="mx-auto max-w-[1536px] space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <Link to={`/${sport}/games`} className="flex items-center gap-1 hover:text-slate-200">
          <ChevronLeft className="h-4 w-4" /> Games
        </Link>
        <span className="text-slate-600">/</span>
        <span className="text-slate-200">
          {awayAbbr || meta.away} @ {homeAbbr || meta.home}
        </span>
      </div>

      {/* Hero */}
      <div className="rounded-2xl border-2 border-slate-700 bg-slate-900 p-6">
        <div className="flex items-center justify-center gap-8">
          <TeamBlock name={meta.away} abbr={awayAbbr} />
          <div className="text-center">
            <div className="text-xs uppercase tracking-wide text-slate-500">vs</div>
            {tip && <div className="mt-1 font-mono text-sm text-amber-300">{tip}</div>}
          </div>
          <TeamBlock name={meta.home} abbr={homeAbbr} />
        </div>
      </div>

      {/* Team markets */}
      <div>
        <h2 className="mb-3 text-lg font-bold text-slate-50">Team markets</h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {markets.map((m) => (
            <TeamMarketCard key={m.key} market={m} />
          ))}
        </div>
      </div>

      {/* Kalshi prediction markets (hidden when unavailable or unmatched) */}
      {kalshiMarket && (
        <div>
          <h2 className="mb-3 text-lg font-bold text-slate-50">Prediction markets</h2>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <KalshiMarketCard market={kalshiMarket} />
          </div>
        </div>
      )}

      {/* Player props split by team */}
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-slate-50">Player props</h2>
          <FreshnessBadge freshness={propsFreshness} />
        </div>
        {props.length > 0 ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <TeamPropsTable teamName={meta.away} teamAbbr={awayAbbr} players={awayPlayers} />
              <TeamPropsTable teamName={meta.home} teamAbbr={homeAbbr} players={homePlayers} />
            </div>
            {otherPlayers.length > 0 && (
              <TeamPropsTable teamName="Other players" teamAbbr="" players={otherPlayers} />
            )}
          </div>
        ) : (
          // Props are fetched for a sampled subset of each slate, so most games
          // genuinely have none. Saying so beats rendering two empty tables,
          // which reads as a broken page rather than a covered/uncovered game.
          <div className="rounded-xl border-2 border-dashed border-slate-700 px-4 py-10 text-center">
            <p className="text-slate-300">No player props posted for this game.</p>
            <p className="mt-1 text-sm text-slate-500">
              Prop coverage is limited to a few games a day. Team lines above are live for every game.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
