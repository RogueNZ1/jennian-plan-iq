"""Run at 5:45am NZST daily via Windows Task Scheduler"""
import asyncio
import subprocess
import sys
import os
from pathlib import Path

os.chdir(Path(__file__).parent)

if __name__ == "__main__":
    print("=== Jennian 007 Daily Run ===")
    print("Step 1: Scraping...")
    from scraper import run_all_scrapers
    asyncio.run(run_all_scrapers())
    print("Step 2: Generating brief...")
    subprocess.run([sys.executable, "generate_brief.py"], check=True)
    print("=== Done ===")
