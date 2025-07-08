import { BarChart, Bar, XAxis, YAxis } from 'recharts';

const RecentGamesBarChart = ({ player, playerData }) => {
    if (!player) return null;

    return (
        <BarChart data={playerData.gameLogs}>
            <XAxis datakey="gameDate" />
            <YAxis />
            <Bar datakey="pts" barSize={30} />
        </BarChart>
    );
}

export default RecentGamesBarChart;