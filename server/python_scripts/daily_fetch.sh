#!/bin/bash
# Daily NBA stats fetch script
# Run via cron: 0 6 * * * /Users/christiankim/repos/nbastats/server/python_scripts/daily_fetch.sh

cd /Users/christiankim/repos/nbastats/server/python_scripts
source venv/bin/activate

echo "========================================"
echo "NBA Stats Fetch - $(date)"
echo "========================================"

# DATABASE_URL is loaded by the Python script's load_dotenv() (it finds ../.env).
# (Don't `export $(grep .env)` here — the .env lives in server/, and an empty
#  match makes `export` dump the whole environment into the log.)

# Fetch all stats (basic + advanced) in a single pass
echo "Fetching all stats..."
python fetch_bref_all_stats.py --yesterday

echo "Done!"
