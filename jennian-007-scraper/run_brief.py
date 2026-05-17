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

os.chdir(Path(__file__).parent)

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

    log.info("Step 1/2 — Scraping all sources")
    try:
        from scraper import run_all_scrapers
        counts = asyncio.run(run_all_scrapers())
        for source, n in counts.items():
            log.info("  %-30s  %d records", source, n)
    except Exception:
        log.exception("Scraper failed — continuing to brief generation")

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

    elapsed = (datetime.now(timezone.utc) - start).total_seconds()
    log.info("=== Done in %.1fs ===", elapsed)


if __name__ == "__main__":
    main()
