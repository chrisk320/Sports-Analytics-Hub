import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

const RecentGamesBarChart = ({ data, stat }) => {
    if (!data || data.length === 0) return null;

    const chartData = data.map(log => ({
        date: new Date(log.game_date).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }),
        value: log[stat],
    })).reverse();

    const statName = {
        pts: 'Points',
        reb: 'Rebounds',
        ast: 'Assists'
    }[stat];

    return (
        <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#4A5568" />
                <XAxis dataKey="date" stroke="#A0AEC0" fontSize={12} />
                <YAxis stroke="#A0AEC0" fontSize={12} />
                <Tooltip
                    contentStyle={{
                        backgroundColor: '#2D3748',
                        border: '1px solid #4A5568',
                        borderRadius: '0.5rem'
                    }}
                    labelStyle={{ color: '#E2E8F0' }}
                />
                <Bar dataKey="value" name={statName} fill="#4299E1" radius={[4, 4, 0, 0]} />
            </BarChart>
        </ResponsiveContainer>
    );
}

export default RecentGamesBarChart;