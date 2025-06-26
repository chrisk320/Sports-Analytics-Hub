import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import stats from './routes/stats.routes.js';

dotenv.config()

const app = express();

app.use(cors());
app.use(express.json());

app.use("/nba", stats);

app.listen(5000, () => {
    console.log("Server has started on port 5000")
});