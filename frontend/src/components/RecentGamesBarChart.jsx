import React from 'react';
import { BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts';
import { statFromLog, MARKETS } from '../lib/odds';

// Backwards-compatible: accepts either a single-stat `stat` ('pts'|'reb'|'ast')
// or a `marketId` (PTS/REB/AST/PR/PA/RA). When a prop `line` is supplied, bars
// are colored by hit/miss and a reference line is drawn.
const STAT_TO_MARKET = { pts: 'PTS', reb: 'REB', ast: 'AST' };

const RecentGamesBarChart = ({ data, stat, marketId, line }) => {
    if (!data || data.length === 0) return null;

    const market = marketId || STAT_TO_MARKET[stat] || 'PTS';
    const chartData = data
        .map((log) => ({
            date: new Date(log.game_date).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }),
            value: statFromLog(log, market),
        }))
        .reverse();

    const hasLine = line != null && !isNaN(line);

    return (
        <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} />
                <YAxis stroke="#94a3b8" fontSize={12} />
                <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '0.5rem' }}
                    labelStyle={{ color: '#f8fafc' }}
                    formatter={(v) => [v, MARKETS[market]?.label || market]}
                />
                {hasLine && (
                    <ReferenceLine
                        y={line}
                        stroke="#fbbf24"
                        strokeDasharray="4 3"
                        label={{ value: `line ${line}`, fill: '#fbbf24', fontSize: 11, position: 'right' }}
                    />
                )}
                <Bar dataKey="value" name={MARKETS[market]?.label || market} radius={[4, 4, 0, 0]} fill="#a855f7">
                    {hasLine &&
                        chartData.map((d, i) => (
                            <Cell key={i} fill={d.value >= line ? '#34d399' : '#64748b'} />
                        ))}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    );
};

export default RecentGamesBarChart;
