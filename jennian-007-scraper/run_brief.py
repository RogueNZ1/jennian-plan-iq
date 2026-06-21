"""
Jennian 007 — twice-weekly market intelligence run.
Schedule: Sunday + Wednesday 10pm NZST (09:00 UTC).
"""
import asyncio
import logging
import os
import sys
import io
from datetime import datetime, timezone
from pathlib import Path
from dotenv import load_dotenv

os.chdir(Path(__file__).parent)
load_dotenv(override=True)  # override=True: .env takes precedence over shell env vars

# Force UTF-8 on Windows console so special chars don't crash the stream handler
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
if sys.stderr.encoding and sys.stderr.encoding.lower() != "utf-8":
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

LOG_DIR = Path("logs")
LOG_DIR.mkdir(exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[
        logging.FileHandler(LOG_DIR / "007.log", encoding="utf-8"),
        logging.StreamHandler(sys.stdout),
    ],
)
log = logging.getLogger("007")


def main():
    start = datetime.now(timezone.utc)
    log.info("=== Jennian 007 run started ===")
    # Fix — previously both steps below were caught-and-logged with no exit
    # code change, so the process always exited 0 regardless of failures.
    # GitHub Actions therefore reported every run as a green "success" even
    # when the email never sent — including the 17 Jun run, which is why it
    # showed green in the Actions history while still possibly emailing
    # nobody. Track failures and exit non-zero so CI marks the run failed,
    # which also fires the existing "Failure alert email" step in the
    # workflow.
    had_error = False

    log.info("Step 1/2 — Scraping all sources")
    try:
        from scraper import run_all_scrapers
        counts = asyncio.run(run_all_scrapers())
        for source, n in counts.items():
            log.info("  %-30s  %d records", source, n)
    except Exception:
        log.exception("Scraper failed — continuing to brief generation")
        had_error = True

    log.info("Step 2/2 — Generating and sending brief")
    try:
        from generate_brief import get_todays_data, generate_brief, save_brief, send_email
        data = get_todays_data()
        log.info(
            "  Data pulled: %d new listings | %d price changes | %d sections | %d consents | %d reviews",
            len(data["new_listings_24h"]),
            len(data["price_changes_7d"]),
            len(data["new_sections_7d"]),
            len(data["consent_notices_7d"]),
            len(data["google_reviews"]),
        )
        brief = generate_brief(data)
        log.info("  Brief generated: %d alerts | summary: %s", brief.get("alert_count", 0), brief.get("summary", ""))
        save_brief(brief)
        send_email(brief)
    except Exception:
        log.exception("Brief generation failed")
        had_error = True

    elapsed = (datetime.now(timezone.utc) - start).total_seconds()
    log.info("=== Done in %.1fs ===", elapsed)

    if had_error:
        log.critical("Run completed with errors — see above — exiting non-zero so CI flags this run")
        sys.exit(1)


if __name__ == "__main__":
    main()
