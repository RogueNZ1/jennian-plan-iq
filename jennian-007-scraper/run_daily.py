"""Run this script daily via cron / Task Scheduler at 5:45am NZST.

Cron entry (17:45 UTC = 05:45 NZST; use 16:45 UTC during NZDT Sep–Apr):
  45 17 * * * cd /path/to/jennian-007-scraper && ./venv/bin/python run_daily.py >> logs/007.log 2>&1

Windows Task Scheduler:
  Program: venv\\Scripts\\python.exe
  Arguments: run_daily.py
  Start in: C:\\path\\to\\jennian-007-scraper
"""
import asyncio
import subprocess
import sys

from scraper import run_all_scrapers

if __name__ == "__main__":
    print("=== Jennian 007 Daily Run ===")
    print("Step 1: Scraping...")
    asyncio.run(run_all_scrapers())
    print("Step 2: Generating brief...")
    subprocess.run([sys.executable, "generate_brief.py"], check=True)
    print("=== Done ===")
