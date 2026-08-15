import React, { useEffect, useState } from 'react';
import { Link, useOutletContext, useNavigate } from 'react-router-dom';
import TeamCard from '../components/TeamCard';
import OffseasonBanner from '../components/OffseasonBanner';
import { useSport } from '@/context/SportContext';
import { api } from '../lib/api';

// The games list for whichever sport the route is on.
//
// This replaces the old GamesPage/NFLPage pair, which were ~93% identical —
// same JSX, differing only in which context key they read and whether a click
// navigated to a detail page (NBA) or opened a modal (NFL). Every sport now
// gets the detail page.
export default function GamesPage() {
  const { games, seasonStatus } = useOutletContext();
  const { sport, label } = useSport();
  const navigate = useNavigate();

  // Which games actually have props. A DB read, not an Odds API call, so this
  // costs nothing — and it is the difference between a card that leads to a
  // full page and one that leads to team lines only.
  const [propGameIds, setPropGameIds] = useState(null);
  useEffect(() => {
    let active = true;
    api
      .get('/playerprops/today')
      .then((res) => active && setPropGameIds(new Set((res.data || []).map((r) => r.game_id))))
      .catch(() => active && setPropGameIds(null));
    return () => {
      active = false;
    };
  }, [sport]);

  // undefined while the lookup is in flight or failed, so the card renders no
  // badge at all rather than claiming a game has no props when we simply do
  // not know yet.
  const hasProps = (gameId) => (propGameIds ? propGameIds.has(gameId) : undefined);

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <h2 className="text-3xl font-bold text-center">{label} Games</h2>
      {!seasonStatus?.inSeason && <OffseasonBanner sport={label} />}
      {games.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {games.map((game) => (
            <TeamCard
              key={game.id}
              game={game}
              hasProps={hasProps(game.id)}
              onSelect={(g) => navigate(`/${sport}/games/${g.id}`)}
            />
          ))}
        </div>
      ) : (
        <div className="text-center text-slate-500 py-16 px-4 border-2 border-dashed border-slate-700 rounded-xl max-w-lg mx-auto">
          <p className="text-lg text-slate-300">No {label} games on the board right now.</p>
          <p className="mt-1">Check back on a game day, or explore player leaderboards and futures while you wait.</p>
          <div className="mt-4 flex justify-center gap-3">
            <Link
              to={`/${sport}/explore`}
              className="rounded-lg bg-purple-500 px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-purple-400"
            >
              Explore stats
            </Link>
            <Link
              to={`/${sport}/futures`}
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-slate-800"
            >
              View futures
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
