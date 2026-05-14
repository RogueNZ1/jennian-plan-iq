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

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}


def parse_price(price_str):
    """Extract integer price from a string like '$749,000'"""
    if not price_str:
        return None
    digits = re.sub(r"[^\d]", "", price_str)
    return int(digits) if digits else None


def upsert_listing(data: dict):
    """Insert or update a listing, recording any price/status changes."""
    existing = (
        supabase.table("listings")
        .select("*")
        .eq("source", data["source"])
        .eq("listing_url", data["listing_url"])
        .execute()
    )

    if existing.data:
        old = existing.data[0]
        changes = []

        if data.get("price") and old["price"] and data["price"] != old["price"]:
            change_type = "price_reduction" if data["price"] < old["price"] else "price_increase"
            changes.append({
                "listing_id": old["id"],
                "change_type": change_type,
                "old_value": str(old["price"]),
                "new_value": str(data["price"]),
            })

        supabase.table("listings").update({
            "price": data.get("price"),
            "price_display": data.get("price_display"),
            "last_seen_at": datetime.utcnow().isoformat(),
            "status": "active",
        }).eq("id", old["id"]).execute()

        for change in changes:
            supabase.table("listing_changes").insert(change).execute()

    else:
        result = supabase.table("listings").insert(data).execute()
        if result.data:
            supabase.table("listing_changes").insert({
                "listing_id": result.data[0]["id"],
                "change_type": "new_listing",
                "new_value": data.get("price_display", "Unknown price"),
            }).execute()


async def scrape_realestate_nz():
    """Scrape new home listings in Palmerston North from realestate.co.nz"""
    print("Scraping realestate.co.nz...")
    urls = [
        "https://www.realestate.co.nz/residential/new-homes/palmerston-north-city",
        "https://www.realestate.co.nz/residential/new-homes/manawatu-district",
    ]
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        for url in urls:
            try:
                await page.goto(url, wait_until="networkidle", timeout=30000)
                await page.wait_for_timeout(3000)
                listings = await page.query_selector_all("[data-test='listing-card']")
                print(f"  Found {len(listings)} cards at {url}")
                for listing in listings:
                    try:
                        title_el = await listing.query_selector("[data-test='listing-title']")
                        price_el = await listing.query_selector("[data-test='listing-price']")
                        location_el = await listing.query_selector("[data-test='listing-address']")
                        link_el = await listing.query_selector("a")
                        title = await title_el.inner_text() if title_el else ""
                        price_str = await price_el.inner_text() if price_el else ""
                        location = await location_el.inner_text() if location_el else ""
                        href = await link_el.get_attribute("href") if link_el else ""
                        listing_url = f"https://www.realestate.co.nz{href}" if href.startswith("/") else href
                        if listing_url:
                            upsert_listing({
                                "source": "realestate",
                                "builder": "Unknown",
                                "title": title.strip(),
                                "location": location.strip(),
                                "price": parse_price(price_str),
                                "price_display": price_str.strip(),
                                "listing_url": listing_url,
                                "status": "active",
                            })
                    except Exception as e:
                        print(f"  Error parsing listing: {e}")
                await page.wait_for_timeout(2000)
            except Exception as e:
                print(f"  Error loading {url}: {e}")
        await browser.close()
    print("  realestate.co.nz done.")


async def scrape_oneroof():
    """Scrape OneRoof for Manawatu new builds"""
    print("Scraping oneroof.co.nz...")
    url = "https://www.oneroof.co.nz/houses-for-sale/palmerston-north?propertyType=new-homes"
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        try:
            await page.goto(url, wait_until="networkidle", timeout=30000)
            await page.wait_for_timeout(4000)
            content = await page.content()
            soup = BeautifulSoup(content, "html.parser")
            cards = soup.select(
                "[class*='listing-card'], [class*='PropertyCard'], [data-testid*='listing']"
            )
            print(f"  Found {len(cards)} cards on OneRoof")
            for card in cards:
                try:
                    price_el = card.select_one("[class*='price'], [class*='Price']")
                    address_el = card.select_one("[class*='address'], [class*='Address'], [class*='location']")
                    link_el = card.select_one("a[href]")
                    price_str = price_el.get_text(strip=True) if price_el else ""
                    location = address_el.get_text(strip=True) if address_el else ""
                    href = link_el["href"] if link_el else ""
                    listing_url = f"https://www.oneroof.co.nz{href}" if href.startswith("/") else href
                    if listing_url and price_str:
                        upsert_listing({
                            "source": "oneroof",
                            "builder": "Unknown",
                            "location": location,
                            "price": parse_price(price_str),
                            "price_display": price_str,
                            "listing_url": listing_url,
                            "status": "active",
                        })
                except Exception as e:
                    print(f"  Error parsing OneRoof card: {e}")
        except Exception as e:
            print(f"  Error loading OneRoof: {e}")
        await browser.close()
    print("  oneroof.co.nz done.")


async def scrape_builder_website(builder_name: str, url: str, source_key: str):
    """Generic scraper for builder H&L listing pages using price-proximity heuristic"""
    print(f"Scraping {builder_name} ({url})...")
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        try:
            await page.goto(url, wait_until="networkidle", timeout=30000)
            await page.wait_for_timeout(3000)
            content = await page.content()
            soup = BeautifulSoup(content, "html.parser")

            price_pattern = re.compile(r"\$[\d,]+")
            all_text_blocks = soup.find_all(string=price_pattern)
            seen_urls: set[str] = set()

            for block in all_text_blocks:
                parent = block.parent
                if not parent:
                    continue
                section = parent.find_parent(["div", "article", "li", "section"])
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
                    r"(Palmerston North|Feilding|Manawatu|PN|Kelvin Grove|Ashhurst|Highbury|Fitzherbert|Awapuni|Roslyn|Awa Park)",
                    re.I,
                ))

                upsert_listing({
                    "source": source_key,
                    "builder": builder_name,
                    "location": location_el.strip() if location_el else "Manawatū region",
                    "price": parse_price(price_match.group()),
                    "price_display": price_match.group(),
                    "listing_url": listing_url,
                    "status": "active",
                })

        except Exception as e:
            print(f"  Error scraping {builder_name}: {e}")
        await browser.close()
    print(f"  {builder_name} done.")


def mark_removed_listings():
    """Any active listing not seen in the last 48 hours is likely sold or removed."""
    cutoff = (datetime.utcnow() - timedelta(hours=48)).isoformat()
    stale = (
        supabase.table("listings")
        .select("id, listing_url, builder, price_display")
        .eq("status", "active")
        .lt("last_seen_at", cutoff)
        .execute()
    )
    for listing in stale.data or []:
        supabase.table("listings").update({"status": "removed"}).eq("id", listing["id"]).execute()
        supabase.table("listing_changes").insert({
            "listing_id": listing["id"],
            "change_type": "removed",
            "old_value": listing.get("price_display", "Unknown"),
        }).execute()
        print(f"  Marked as removed: {listing['listing_url']}")


async def run_all_scrapers():
    await scrape_realestate_nz()
    await scrape_oneroof()
    await scrape_builder_website("GJ Gardner", "https://www.gjgardner.co.nz/find-a-home/manawatu/", "gjgardner")
    await scrape_builder_website("Signature Homes", "https://www.signature-homes.co.nz/house-and-land/manawatu", "signature")
    await scrape_builder_website("Japac Homes", "https://www.japac.co.nz/house-land-packages/", "japac")
    await scrape_builder_website("Latitude Homes", "https://www.latitudehomes.co.nz/house-land/", "latitude")
    await scrape_builder_website("Jennian Manawatū", "https://www.jennian.co.nz/manawatu/house-and-land/", "jennian")
    mark_removed_listings()


if __name__ == "__main__":
    asyncio.run(run_all_scrapers())
    print("Scrape complete.")
