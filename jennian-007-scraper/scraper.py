import asyncio
import os
import re
from datetime import datetime, timedelta
from dotenv import load_dotenv
from playwright.async_api import async_playwright
from supabase import create_client
from bs4 import BeautifulSoup

load_dotenv()

supabase = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_KEY"))

def parse_price(price_str):
    if not price_str:
        return None
    digits = re.sub(r"[^\d]", "", price_str)
    return int(digits) if digits else None

def upsert_listing(data: dict):
    try:
        existing = supabase.table("listings").select("*").eq("source", data["source"]).eq("listing_url", data["listing_url"]).execute()
        if existing.data:
            old = existing.data[0]
            if data.get("price") and old["price"] and data["price"] != old["price"]:
                change_type = "price_reduction" if data["price"] < old["price"] else "price_increase"
                supabase.table("listing_changes").insert({
                    "listing_id": old["id"],
                    "change_type": change_type,
                    "old_value": str(old["price"]),
                    "new_value": str(data["price"])
                }).execute()
            supabase.table("listings").update({
                "price": data.get("price"),
                "price_display": data.get("price_display"),
                "last_seen_at": datetime.utcnow().isoformat(),
                "status": "active"
            }).eq("id", old["id"]).execute()
        else:
            result = supabase.table("listings").insert(data).execute()
            if result.data:
                supabase.table("listing_changes").insert({
                    "listing_id": result.data[0]["id"],
                    "change_type": "new_listing",
                    "new_value": data.get("price_display", "Unknown price")
                }).execute()
    except Exception as e:
        print(f"  Upsert error: {e}")

async def scrape_with_playwright(url: str, source: str, builder: str):
    print(f"Scraping {builder} ({url})...")
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        try:
            await page.goto(url, wait_until="networkidle", timeout=30000)
            await page.wait_for_timeout(3000)
            content = await page.content()
            soup = BeautifulSoup(content, "html.parser")
            price_pattern = re.compile(r"\$[\d,]+")
            seen_urls = set()
            blocks = soup.find_all(string=price_pattern)
            for block in blocks:
                section = block.parent
                for _ in range(4):
                    if section and section.name in ["div", "article", "li", "section"]:
                        break
                    section = section.parent if section else None
                if not section:
                    continue
                price_match = price_pattern.search(str(block))
                if not price_match:
                    continue
                link = section.find("a", href=True)
                href = link["href"] if link else ""
                listing_url = href if href.startswith("http") else f"{url.rstrip('/')}{href}"
                if not listing_url or listing_url in seen_urls:
                    continue
                seen_urls.add(listing_url)
                location_el = section.find(string=re.compile(
                    r"(Palmerston North|Feilding|Manawatu|Kelvin Grove|Ashhurst|Highbury|Fitzherbert|Awapuni|Roslyn|Awa Park|Shannon|Hokowhitu|Whakarongo|Tamakuku)",
                    re.I
                ))
                upsert_listing({
                    "source": source,
                    "builder": builder,
                    "location": location_el.strip() if location_el else "Manawatū region",
                    "price": parse_price(price_match.group()),
                    "price_display": price_match.group(),
                    "listing_url": listing_url,
                    "status": "active"
                })
        except Exception as e:
            print(f"  Error scraping {builder}: {e}")
        finally:
            await browser.close()
    print(f"  {builder} done.")

async def scrape_signature():
    print("Scraping Signature Homes...")
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        try:
            await page.goto("https://www.signature.co.nz/franchise/palmerston-north-manawatu/house-land/", wait_until="networkidle", timeout=30000)
            await page.wait_for_timeout(4000)
            content = await page.content()
            soup = BeautifulSoup(content, "html.parser")
            cards = soup.select("a[href*='/house-land/']")
            seen = set()
            for card in cards:
                href = card.get("href", "")
                if not href or href in seen or href == "/house-land/":
                    continue
                seen.add(href)
                listing_url = f"https://www.signature.co.nz{href}" if href.startswith("/") else href
                price_el = card.find(string=re.compile(r"\$[\d,]+"))
                price_str = price_el.strip() if price_el else ""
                location_el = card.find(string=re.compile(r"(Shannon|Palmerston|Feilding|Manawatu)", re.I))
                upsert_listing({
                    "source": "signature",
                    "builder": "Signature Homes",
                    "location": location_el.strip() if location_el else "Manawatū region",
                    "price": parse_price(price_str),
                    "price_display": price_str,
                    "listing_url": listing_url,
                    "status": "active"
                })
        except Exception as e:
            print(f"  Error scraping Signature: {e}")
        finally:
            await browser.close()
    print("  Signature done.")

def mark_removed_listings():
    cutoff = (datetime.utcnow() - timedelta(hours=48)).isoformat()
    stale = supabase.table("listings").select("id,listing_url,builder,price_display").eq("status", "active").lt("last_seen_at", cutoff).execute()
    for listing in (stale.data or []):
        supabase.table("listings").update({"status": "removed"}).eq("id", listing["id"]).execute()
        supabase.table("listing_changes").insert({
            "listing_id": listing["id"],
            "change_type": "removed",
            "old_value": listing.get("price_display", "Unknown")
        }).execute()
        print(f"  Marked removed: {listing['builder']} — {listing['listing_url']}")

async def run_all_scrapers():
    await scrape_with_playwright("https://www.gjgardner.co.nz/franchises/manawatu-horowhenua/listings", "gjgardner", "GJ Gardner")
    await scrape_signature()
    await scrape_with_playwright("https://www.japachomes.co.nz/all-properties", "japac", "Japac Homes")
    await scrape_with_playwright("https://www.latitudehomes.co.nz/location/manawatu-region", "latitude", "Latitude Homes")
    await scrape_with_playwright("https://www.jennian.co.nz/manawatu/house-and-land/", "jennian", "Jennian Manawatū")
    await scrape_with_playwright("https://tamakukuterrace.co.nz/sections/", "tamakuku", "Tamakuku Terrace")
    mark_removed_listings()

if __name__ == "__main__":
    asyncio.run(run_all_scrapers())
    print("Scrape complete.")
