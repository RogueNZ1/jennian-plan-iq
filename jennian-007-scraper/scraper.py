"""
Jennian 007 — Market Intelligence Scraper
Runs twice weekly (Sunday + Wednesday 10pm NZST).
All data is Manawatu-region only — geographic filter enforced at upsert level.
"""
import asyncio
import os
import re
import logging
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv
from playwright.async_api import async_playwright, Page
from supabase import create_client
from bs4 import BeautifulSoup

load_dotenv(override=True)

supabase = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_KEY"))

log = logging.getLogger("007")

# ---------------------------------------------------------------------------
# Geographic filter — strict. Only store listings matching these suburbs.
# ---------------------------------------------------------------------------
MANAWATU_SUBURBS = {s.lower().strip() for s in [
    "palmerston north", "feilding", "manawatu", "manawatū", "ashhurst",
    "whakarongo", "kelvin grove", "highbury", "fitzherbert", "awapuni",
    "roslyn", "awa park", "shannon", "foxton", "marton", "rongotea",
    "bulls", "sanson", "himatangi", "pahiatua", "woodville", "dannevirke",
    "hokowhitu", "milson", "takaro", "cloverlea", "longburn", "bunnythorpe",
]}

COMPETITOR_BUILDERS = ["gj gardner", "signature", "japac", "latitude"]

def is_manawatu(location: str) -> bool:
    if not location:
        return False
    loc = location.lower()
    return any(suburb in loc for suburb in MANAWATU_SUBURBS)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def parse_price(price_str: str) -> int | None:
    if not price_str:
        return None
    digits = re.sub(r"[^\d]", "", price_str)
    val = int(digits) if digits else None
    # Sanity: reject values outside $100k–$5M range
    if val and (val < 100_000 or val > 5_000_000):
        return None
    return val

def parse_area(text: str) -> int | None:
    """Extract a numeric m2 value from a string like '520m²' or '520 sqm'."""
    if not text:
        return None
    m = re.search(r"(\d[\d,]*)\s*(?:m²|m2|sqm)", text, re.I)
    if m:
        return int(m.group(1).replace(",", ""))
    return None

def parse_beds(text: str) -> int | None:
    m = re.search(r"(\d)\s*(?:bed|br|bedroom)", text, re.I)
    return int(m.group(1)) if m else None

def parse_baths(text: str) -> int | None:
    m = re.search(r"(\d)\s*(?:bath|bathroom)", text, re.I)
    return int(m.group(1)) if m else None

# ---------------------------------------------------------------------------
# Upsert helpers — geographic filter applied here for listings table
# ---------------------------------------------------------------------------
SCRAPE_COUNTS: dict[str, int] = {}

def upsert_listing(data: dict):
    location = data.get("location") or data.get("suburb") or ""
    if not is_manawatu(location):
        log.warning("  GEO REJECT: %s — '%s'", data.get("builder", "?"), location)
        return

    # Map scraper field names → DB column names
    db_row = {
        "source":        data.get("source"),
        "builder":       data.get("builder"),
        "location":      data.get("location"),
        "price":         data.get("price"),
        "price_display": data.get("price_display"),
        "title":         data.get("title"),
        "description":   data.get("description"),
        "url":           data.get("listing_url"),       # scraper: listing_url → db: url
        "image_url":     data.get("image_url"),
        "bedrooms":      data.get("beds"),              # scraper: beds → db: bedrooms
        "bathrooms":     data.get("bathrooms"),
        "floor_area":    data.get("floor_area_m2"),     # scraper: floor_area_m2 → db: floor_area
        "land_area":     data.get("land_area_m2"),      # scraper: land_area_m2 → db: land_area
        "house_type":    data.get("house_type"),
        "status":        data.get("status", "active"),
        "last_seen_at":  datetime.now(timezone.utc).isoformat(),
    }
    db_row = {k: v for k, v in db_row.items() if v is not None}

    try:
        existing = (
            supabase.table("listings")
            .select("*")
            .eq("source", db_row["source"])
            .eq("url", db_row.get("url", ""))
            .execute()
        )
        if existing.data:
            old = existing.data[0]
            if db_row.get("price") and old.get("price") and db_row["price"] != old["price"]:
                change = "price_reduction" if db_row["price"] < old["price"] else "price_increase"
                supabase.table("listing_changes").insert({
                    "listing_id": old["id"],
                    "change_type": change,
                    "old_value": str(old["price"]),
                    "new_value": str(db_row["price"]),
                }).execute()
            supabase.table("listings").update({
                "price":         db_row.get("price"),
                "price_display": db_row.get("price_display"),
                "bedrooms":      db_row.get("bedrooms"),
                "bathrooms":     db_row.get("bathrooms"),
                "floor_area":    db_row.get("floor_area"),
                "land_area":     db_row.get("land_area"),
                "last_seen_at":  db_row["last_seen_at"],
                "status":        "active",
            }).eq("id", old["id"]).execute()
        else:
            result = supabase.table("listings").insert(db_row).execute()
            if result.data:
                supabase.table("listing_changes").insert({
                    "listing_id": result.data[0]["id"],
                    "change_type": "new_listing",
                    "new_value": db_row.get("price_display", "Unknown price"),
                }).execute()
        SCRAPE_COUNTS[data["source"]] = SCRAPE_COUNTS.get(data["source"], 0) + 1
    except Exception as e:
        log.error("  Upsert error (%s): %s", data.get("source"), e)

def upsert_section(data: dict):
    """Upsert into the sections table (land listings)."""
    location = data.get("suburb") or data.get("address") or ""
    if not is_manawatu(location):
        log.warning("  GEO REJECT section: %s — '%s'", data.get("source", "?"), location)
        return
    try:
        existing = (
            supabase.table("sections")
            .select("id, price")
            .eq("source", data["source"])
            .eq("listing_url", data.get("listing_url", ""))
            .execute()
        )
        now = datetime.now(timezone.utc).isoformat()
        if existing.data:
            supabase.table("sections").update({
                "price": data.get("price"),
                "price_display": data.get("price_display"),
                "status": data.get("status", "active"),
                "last_seen_at": now,
            }).eq("id", existing.data[0]["id"]).execute()
        else:
            supabase.table("sections").insert({**data, "first_seen_at": now, "last_seen_at": now}).execute()
        SCRAPE_COUNTS[f"section_{data['source']}"] = SCRAPE_COUNTS.get(f"section_{data['source']}", 0) + 1
    except Exception as e:
        log.error("  Section upsert error: %s", e)

# ---------------------------------------------------------------------------
# Browser factory
# ---------------------------------------------------------------------------
async def new_browser(p):
    return await p.chromium.launch(headless=True)

async def new_page(browser, ua: str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124"):
    return await browser.new_page(user_agent=ua)

# ===========================================================================
# PART 1 — FIXED EXISTING SCRAPERS
# ===========================================================================

# ---------------------------------------------------------------------------
# 1.1 Jennian Homes Manawatū
# ---------------------------------------------------------------------------
async def scrape_jennian():
    log.info("Scraping Jennian Homes Manawatu...")
    url = "https://www.jennian.co.nz/manawatu/house-and-land/"
    async with async_playwright() as p:
        browser = await new_browser(p)
        page = await new_page(browser)
        try:
            await page.goto(url, wait_until="networkidle", timeout=40000)
            await page.wait_for_timeout(3000)
            content = await page.content()
            soup = BeautifulSoup(content, "html.parser")

            # Jennian uses cards — look for article/div blocks with pricing
            # Try multiple selectors for resilience
            cards = (
                soup.select(".listing-card, .house-land-card, .property-card, article.card") or
                soup.select("[class*='listing'], [class*='package'], [class*='property']")
            )
            if not cards:
                # Fallback: find all anchors with /manawatu/ in href that contain a price
                cards = []
                for a in soup.find_all("a", href=re.compile(r"/manawatu/", re.I)):
                    parent = a
                    for _ in range(6):
                        if parent and parent.name in ("div", "article", "li", "section"):
                            if parent.find(string=re.compile(r"\$[\d,]+")):
                                cards.append(parent)
                                break
                        parent = parent.parent if parent else None

            seen = set()
            count = 0
            for card in cards:
                link = card.find("a", href=True)
                if not link:
                    continue
                href = link["href"]
                listing_url = href if href.startswith("http") else f"https://www.jennian.co.nz{href}"
                if listing_url in seen:
                    continue
                seen.add(listing_url)

                text = card.get_text(" ", strip=True)
                price_m = re.search(r"\$([\d,]+)", text)
                price_display = price_m.group(0) if price_m else ""
                price = parse_price(price_display)

                # Skip if no price or price unreasonably small (probably a feature callout)
                if not price or price < 400_000:
                    continue

                floor_m = re.search(r"(\d{2,4})\s*m[²2]?\s*(?:floor|living)?", text, re.I)
                land_m = re.search(r"(\d{3,5})\s*m[²2]?\s*(?:land|section|lot)?", text, re.I)
                beds = parse_beds(text)
                baths = parse_baths(text)

                # Find suburb from the card text
                suburb = "Palmerston North"
                for s in MANAWATU_SUBURBS:
                    if s in text.lower():
                        suburb = s.title()
                        break

                img = card.find("img")
                img_url = img.get("src") or img.get("data-src") if img else None

                upsert_listing({
                    "source": "jennian",
                    "builder": "Jennian Homes",
                    "location": suburb,
                    "price": price,
                    "price_display": price_display,
                    "beds": beds,
                    "bathrooms": baths,
                    "floor_area_m2": int(floor_m.group(1)) if floor_m else None,
                    "land_area_m2": int(land_m.group(1)) if land_m else None,
                    "listing_url": listing_url,
                    "image_url": img_url,
                    "status": "active",
                })
                count += 1

            log.info("  Jennian: %d listings processed", count)
        except Exception as e:
            log.error("  Jennian scrape error: %s", e)
        finally:
            await browser.close()

# ---------------------------------------------------------------------------
# 1.2 Signature Homes — follow detail pages for prices
# ---------------------------------------------------------------------------
async def scrape_signature():
    log.info("Scraping Signature Homes...")
    index_url = "https://www.signature.co.nz/franchise/palmerston-north-manawatu/house-land/"
    async with async_playwright() as p:
        browser = await new_browser(p)
        page = await new_page(browser)
        try:
            await page.goto(index_url, wait_until="networkidle", timeout=40000)
            await page.wait_for_timeout(4000)
            content = await page.content()
            soup = BeautifulSoup(content, "html.parser")

            # Collect all listing URLs from index
            seen = set()
            listing_urls = []
            for a in soup.find_all("a", href=re.compile(r"/house-land/[^/]+/?$")):
                href = a["href"]
                if href in ("/house-land/", "", "/"):
                    continue
                full = f"https://www.signature.co.nz{href}" if href.startswith("/") else href
                if full not in seen:
                    seen.add(full)
                    listing_urls.append(full)

            log.info("  Signature: %d listing URLs found", len(listing_urls))
            count = 0
            for detail_url in listing_urls:
                try:
                    await page.goto(detail_url, wait_until="networkidle", timeout=30000)
                    await page.wait_for_timeout(2000)
                    detail = BeautifulSoup(await page.content(), "html.parser")
                    text = detail.get_text(" ", strip=True)

                    price_m = re.search(r"\$([\d,]+)", text)
                    price_display = price_m.group(0) if price_m else ""
                    price = parse_price(price_display)
                    if not price or price < 300_000:
                        continue

                    beds = parse_beds(text)
                    baths = parse_baths(text)
                    floor_m = re.search(r"(\d{2,4})\s*m[²2]", text, re.I)
                    land_m = re.search(r"(?:land|section|lot)\D{0,10}(\d{3,5})\s*m[²2]", text, re.I)

                    # Suburb from URL or page text
                    suburb = "Palmerston North"
                    for s in ["shannon", "feilding", "ashhurst", "kelvin grove", "highbury", "whakarongo"]:
                        if s in text.lower() or s in detail_url.lower():
                            suburb = s.title()
                            break

                    img = detail.find("img", src=re.compile(r"\.(jpg|jpeg|png|webp)", re.I))
                    img_url = img["src"] if img else None

                    upsert_listing({
                        "source": "signature",
                        "builder": "Signature Homes",
                        "location": suburb,
                        "price": price,
                        "price_display": price_display,
                        "beds": beds,
                        "bathrooms": baths,
                        "floor_area_m2": int(floor_m.group(1)) if floor_m else None,
                        "land_area_m2": int(land_m.group(1)) if land_m else None,
                        "listing_url": detail_url,
                        "image_url": img_url,
                        "status": "active",
                    })
                    count += 1
                except Exception as e:
                    log.warning("  Signature detail error (%s): %s", detail_url, e)

            log.info("  Signature: %d listings saved", count)
        except Exception as e:
            log.error("  Signature index error: %s", e)
        finally:
            await browser.close()

# ---------------------------------------------------------------------------
# 1.3 Japac Homes
# ---------------------------------------------------------------------------
async def scrape_japac():
    log.info("Scraping Japac Homes...")
    async with async_playwright() as p:
        browser = await new_browser(p)
        page = await new_page(browser)
        try:
            # Try the properties listing page
            await page.goto("https://www.japachomes.co.nz/properties", wait_until="networkidle", timeout=40000)
            await page.wait_for_timeout(4000)
            content = await page.content()
            soup = BeautifulSoup(content, "html.parser")

            seen = set()
            count = 0
            # Find property cards
            cards = soup.select("[class*='property'], [class*='listing'], article, .card")
            if not cards:
                # Fallback: find all links containing price
                for a in soup.find_all("a", href=True):
                    block = a
                    for _ in range(5):
                        if block and block.get_text() and re.search(r"\$[\d,]+", block.get_text()):
                            cards.append(block)
                            break
                        block = block.parent if block else None

            for card in cards:
                text = card.get_text(" ", strip=True)
                if not re.search(r"\$[\d,]+", text):
                    continue
                link = card.find("a", href=True)
                if not link:
                    continue
                href = link["href"]
                listing_url = href if href.startswith("http") else f"https://www.japachomes.co.nz{href}"
                if listing_url in seen:
                    continue
                seen.add(listing_url)

                price_m = re.search(r"\$([\d,]+)", text)
                price_display = price_m.group(0) if price_m else ""
                price = parse_price(price_display)
                if not price or price < 300_000:
                    continue

                suburb = "Palmerston North"
                for s in MANAWATU_SUBURBS:
                    if s in text.lower():
                        suburb = s.title()
                        break

                upsert_listing({
                    "source": "japac",
                    "builder": "Japac Homes",
                    "location": suburb,
                    "price": price,
                    "price_display": price_display,
                    "beds": parse_beds(text),
                    "bathrooms": parse_baths(text),
                    "floor_area_m2": parse_area(text),
                    "listing_url": listing_url,
                    "status": "active",
                })
                count += 1

            log.info("  Japac: %d listings saved", count)
        except Exception as e:
            log.error("  Japac scrape error: %s", e)
        finally:
            await browser.close()

# ---------------------------------------------------------------------------
# 1.4 GJ Gardner — paginate + follow detail pages
# ---------------------------------------------------------------------------
async def scrape_gjgardner():
    log.info("Scraping GJ Gardner Manawatu...")
    base_url = "https://www.gjgardner.co.nz/franchises/manawatu-horowhenua/listings"
    async with async_playwright() as p:
        browser = await new_browser(p)
        page = await new_page(browser)
        try:
            listing_urls = []
            seen = set()

            # Collect all listing URLs across pages
            page_num = 1
            while True:
                url = base_url if page_num == 1 else f"{base_url}?page={page_num}"
                await page.goto(url, wait_until="networkidle", timeout=40000)
                await page.wait_for_timeout(2000)
                soup = BeautifulSoup(await page.content(), "html.parser")

                # Find listing links (GJ uses /listings/{slug} pattern)
                links = soup.find_all("a", href=re.compile(r"/listings/[^/]+/?$"))
                if not links:
                    break
                new_found = 0
                for a in links:
                    href = a["href"]
                    full = f"https://www.gjgardner.co.nz{href}" if href.startswith("/") else href
                    if full not in seen and full != base_url:
                        seen.add(full)
                        listing_urls.append(full)
                        new_found += 1
                if new_found == 0:
                    break
                page_num += 1
                if page_num > 10:  # Safety limit
                    break

            log.info("  GJ Gardner: %d listing URLs found", len(listing_urls))
            count = 0
            for detail_url in listing_urls:
                try:
                    await page.goto(detail_url, wait_until="networkidle", timeout=30000)
                    await page.wait_for_timeout(2000)
                    detail = BeautifulSoup(await page.content(), "html.parser")
                    text = detail.get_text(" ", strip=True)

                    price_m = re.search(r"\$([\d,]+)", text)
                    price_display = price_m.group(0) if price_m else ""
                    price = parse_price(price_display)
                    if not price or price < 300_000:
                        continue

                    # Only Manawatū listings
                    suburb = None
                    for s in MANAWATU_SUBURBS:
                        if s in text.lower() or s in detail_url.lower():
                            suburb = s.title()
                            break
                    if not suburb:
                        log.warning("  GJ Gardner geo reject: %s", detail_url)
                        continue

                    floor_m = re.search(r"(\d{2,4})\s*m[²2]?\s*(?:floor|living|home)?", text, re.I)
                    land_m = re.search(r"(\d{3,5})\s*m[²2]?\s*(?:land|section|lot)?", text, re.I)
                    spec_els = detail.select("[class*='spec'], [class*='feature'], [class*='detail']")
                    spec_notes = " | ".join(el.get_text(" ", strip=True) for el in spec_els[:5]) if spec_els else ""

                    upsert_listing({
                        "source": "gjgardner",
                        "builder": "GJ Gardner",
                        "location": suburb,
                        "price": price,
                        "price_display": price_display,
                        "beds": parse_beds(text),
                        "bathrooms": parse_baths(text),
                        "floor_area_m2": int(floor_m.group(1)) if floor_m else None,
                        "land_area_m2": int(land_m.group(1)) if land_m else None,
                        "listing_url": detail_url,
                        "notes": spec_notes[:500] if spec_notes else None,
                        "status": "active",
                    })
                    count += 1
                except Exception as e:
                    log.warning("  GJ Gardner detail error (%s): %s", detail_url, e)

            log.info("  GJ Gardner: %d listings saved", count)
        except Exception as e:
            log.error("  GJ Gardner scrape error: %s", e)
        finally:
            await browser.close()

# ---------------------------------------------------------------------------
# Latitude Homes (existing — kept simple, geo-filtered at upsert)
# ---------------------------------------------------------------------------
async def scrape_latitude():
    log.info("Scraping Latitude Homes...")
    url = "https://www.latitudehomes.co.nz/location/manawatu-region"
    async with async_playwright() as p:
        browser = await new_browser(p)
        page = await new_page(browser)
        try:
            await page.goto(url, wait_until="networkidle", timeout=40000)
            await page.wait_for_timeout(3000)
            content = await page.content()
            soup = BeautifulSoup(content, "html.parser")
            price_pattern = re.compile(r"\$[\d,]+")
            seen = set()
            count = 0
            for block in soup.find_all(string=price_pattern):
                section = block.parent
                for _ in range(5):
                    if section and section.name in ("div", "article", "li", "section"):
                        break
                    section = section.parent if section else None
                if not section:
                    continue
                price_m = price_pattern.search(str(block))
                if not price_m:
                    continue
                link = section.find("a", href=True)
                if not link:
                    continue
                href = link["href"]
                listing_url = href if href.startswith("http") else f"https://www.latitudehomes.co.nz{href}"
                if listing_url in seen:
                    continue
                seen.add(listing_url)
                price = parse_price(price_m.group())
                if not price or price < 300_000:
                    continue
                text = section.get_text(" ", strip=True)
                suburb = "Palmerston North"
                for s in MANAWATU_SUBURBS:
                    if s in text.lower():
                        suburb = s.title()
                        break
                upsert_listing({
                    "source": "latitude",
                    "builder": "Latitude Homes",
                    "location": suburb,
                    "price": price,
                    "price_display": price_m.group(),
                    "listing_url": listing_url,
                    "status": "active",
                })
                count += 1
            log.info("  Latitude: %d listings saved", count)
        except Exception as e:
            log.error("  Latitude scrape error: %s", e)
        finally:
            await browser.close()

# ===========================================================================
# PART 2 — NEW DATA SOURCES
# ===========================================================================

# ---------------------------------------------------------------------------
# 2.1 realestate.co.nz — new builds + sections
# ---------------------------------------------------------------------------
NEW_BUILD_URLS_RNCO = [
    "https://www.realestate.co.nz/residential/new-homes/palmerston-north-city",
    "https://www.realestate.co.nz/residential/new-homes/manawatu-district",
]
SECTION_URLS_RNCO = [
    "https://www.realestate.co.nz/sections/palmerston-north-city",
    "https://www.realestate.co.nz/sections/manawatu-district",
]

async def _scrape_realestate_url(page: Page, url: str, listing_type: str) -> int:
    """Scrape a single realestate.co.nz URL. Returns count saved."""
    try:
        await page.goto(url, wait_until="networkidle", timeout=45000)
        await page.wait_for_timeout(3000)
        soup = BeautifulSoup(await page.content(), "html.parser")
        count = 0
        seen = set()

        # realestate.co.nz listing cards typically have data-testid or specific class
        cards = soup.select("[data-testid*='listing'], .listing-card, [class*='ListingCard'], [class*='listing-result']")
        if not cards:
            # Fallback: any div with a price and a link
            cards = []
            for div in soup.find_all(["div", "article", "li"]):
                if div.find(string=re.compile(r"\$[\d,]+")) and div.find("a", href=re.compile(r"/property/")):
                    cards.append(div)

        for card in cards:
            link = card.find("a", href=re.compile(r"/property/|/residential/|/sections/"))
            if not link:
                link = card.find("a", href=True)
            if not link:
                continue
            href = link["href"]
            listing_url = href if href.startswith("http") else f"https://www.realestate.co.nz{href}"
            if listing_url in seen:
                continue
            seen.add(listing_url)

            text = card.get_text(" ", strip=True)
            price_m = re.search(r"\$([\d,]+)", text)
            price_display = price_m.group(0) if price_m else "Price on application"
            price = parse_price(price_display)

            # Address / suburb
            address_el = card.find(["h2", "h3", "address", "[class*='address']"])
            address = address_el.get_text(strip=True) if address_el else ""
            suburb = "Palmerston North"
            for s in MANAWATU_SUBURBS:
                if s in text.lower() or s in address.lower():
                    suburb = s.title()
                    break

            # Days on market
            dom_m = re.search(r"(\d+)\s*day", text, re.I)
            days_listed = int(dom_m.group(1)) if dom_m else None

            # Builder name (if shown)
            builder_m = re.search(r"(?:by|listed by|agent)\s+([A-Z][a-zA-Z\s]{3,30})", text)
            builder = builder_m.group(1).strip() if builder_m else None

            if listing_type == "new_build":
                upsert_listing({
                    "source": "realestate_co_nz",
                    "builder": builder or "Unknown",
                    "location": suburb,
                    "price": price,
                    "price_display": price_display,
                    "beds": parse_beds(text),
                    "floor_area_m2": parse_area(text),
                    "land_area_m2": parse_area(re.sub(r"floor|living", "", text, flags=re.I)),
                    "listing_url": listing_url,
                    "status": "active",
                })
            else:
                upsert_section({
                    "source": "realestate_co_nz",
                    "suburb": suburb,
                    "address": address,
                    "land_area_m2": parse_area(text),
                    "price": price,
                    "price_display": price_display,
                    "listing_url": listing_url,
                    "days_listed": days_listed,
                    "status": "active",
                })
            count += 1
        return count
    except Exception as e:
        log.error("  realestate.co.nz error (%s): %s", url, e)
        return 0

async def scrape_realestate_co_nz():
    log.info("Scraping realestate.co.nz...")
    async with async_playwright() as p:
        browser = await new_browser(p)
        page = await new_page(browser)
        total = 0
        for url in NEW_BUILD_URLS_RNCO:
            n = await _scrape_realestate_url(page, url, "new_build")
            total += n
            await page.wait_for_timeout(2000)
        for url in SECTION_URLS_RNCO:
            n = await _scrape_realestate_url(page, url, "section")
            total += n
            await page.wait_for_timeout(2000)
        await browser.close()
    log.info("  realestate.co.nz: %d total listings/sections", total)

# ---------------------------------------------------------------------------
# 2.2 OneRoof — new builds + sections + market insights
# ---------------------------------------------------------------------------
ONEROOF_NEW_BUILD_URLS = [
    "https://www.oneroof.co.nz/houses-for-sale/palmerston-north?propertyType=new-homes",
    "https://www.oneroof.co.nz/houses-for-sale/manawatu-district?propertyType=new-homes",
]
ONEROOF_SECTION_URLS = [
    "https://www.oneroof.co.nz/sections-for-sale/palmerston-north",
    "https://www.oneroof.co.nz/sections-for-sale/manawatu-district",
]
ONEROOF_INSIGHTS_URL = "https://www.oneroof.co.nz/new-zealand/palmerston-north-city-1781/suburb-insights"

async def _scrape_oneroof_listings(page: Page, url: str, listing_type: str) -> int:
    try:
        await page.goto(url, wait_until="networkidle", timeout=45000)
        await page.wait_for_timeout(4000)
        soup = BeautifulSoup(await page.content(), "html.parser")
        seen = set()
        count = 0

        # OneRoof listing cards
        cards = soup.select("[class*='listing-card'], [class*='ListingCard'], [class*='property-card'], [data-testid*='listing']")
        if not cards:
            cards = []
            for el in soup.find_all(["div", "article"]):
                if el.find(string=re.compile(r"\$[\d,]+")) and el.find("a", href=re.compile(r"/property-for-sale/|/sections/")):
                    cards.append(el)

        for card in cards:
            link = card.find("a", href=True)
            if not link:
                continue
            href = link["href"]
            listing_url = href if href.startswith("http") else f"https://www.oneroof.co.nz{href}"
            if listing_url in seen:
                continue
            seen.add(listing_url)

            text = card.get_text(" ", strip=True)
            price_m = re.search(r"\$([\d,]+)", text)
            price_display = price_m.group(0) if price_m else ""
            price = parse_price(price_display)

            suburb = "Palmerston North"
            for s in MANAWATU_SUBURBS:
                if s in text.lower():
                    suburb = s.title()
                    break

            dom_m = re.search(r"(\d+)\s*day", text, re.I)
            days_listed = int(dom_m.group(1)) if dom_m else None

            if listing_type == "new_build":
                upsert_listing({
                    "source": "oneroof",
                    "builder": "Unknown",
                    "location": suburb,
                    "price": price,
                    "price_display": price_display,
                    "beds": parse_beds(text),
                    "floor_area_m2": parse_area(text),
                    "listing_url": listing_url,
                    "status": "active",
                })
            else:
                upsert_section({
                    "source": "oneroof",
                    "suburb": suburb,
                    "land_area_m2": parse_area(text),
                    "price": price,
                    "price_display": price_display,
                    "listing_url": listing_url,
                    "days_listed": days_listed,
                    "status": "active",
                })
            count += 1
        return count
    except Exception as e:
        log.error("  OneRoof listing error (%s): %s", url, e)
        return 0

async def _scrape_oneroof_insights(page: Page):
    try:
        await page.goto(ONEROOF_INSIGHTS_URL, wait_until="networkidle", timeout=45000)
        await page.wait_for_timeout(4000)
        soup = BeautifulSoup(await page.content(), "html.parser")
        text = soup.get_text(" ", strip=True)

        # Extract suburb-level stats from the insights page
        # Look for median price patterns
        suburb_blocks = soup.select("[class*='suburb'], [class*='Suburb'], [class*='insight'], [class*='market']")
        count = 0
        for block in suburb_blocks:
            block_text = block.get_text(" ", strip=True)
            suburb_m = None
            for s in MANAWATU_SUBURBS:
                if s in block_text.lower():
                    suburb_m = s.title()
                    break
            if not suburb_m:
                continue
            price_ms = re.findall(r"\$([\d,]+)", block_text)
            prices = [parse_price(f"${p}") for p in price_ms]
            prices = [p for p in prices if p and p > 200_000]
            days_m = re.search(r"(\d+)\s*days?\s*to\s*sell", block_text, re.I)
            pct_m = re.search(r"([+-]?\d+\.?\d*)\s*%", block_text)
            supabase.table("market_insights").insert({
                "source": "oneroof",
                "suburb": suburb_m,
                "median_asking_price": prices[0] if prices else None,
                "median_sale_price": prices[1] if len(prices) > 1 else None,
                "days_to_sell": int(days_m.group(1)) if days_m else None,
                "price_change_pct": float(pct_m.group(1)) if pct_m else None,
                "captured_at": datetime.now(timezone.utc).isoformat(),
            }).execute()
            count += 1
        log.info("  OneRoof insights: %d suburb records saved", count)
    except Exception as e:
        log.error("  OneRoof insights error: %s", e)

async def scrape_oneroof():
    log.info("Scraping OneRoof...")
    async with async_playwright() as p:
        browser = await new_browser(p)
        page = await new_page(browser)
        total = 0
        for url in ONEROOF_NEW_BUILD_URLS:
            n = await _scrape_oneroof_listings(page, url, "new_build")
            total += n
            await page.wait_for_timeout(2000)
        for url in ONEROOF_SECTION_URLS:
            n = await _scrape_oneroof_listings(page, url, "section")
            total += n
            await page.wait_for_timeout(2000)
        await _scrape_oneroof_insights(page)
        await browser.close()
    log.info("  OneRoof: %d total listings/sections", total)

# ---------------------------------------------------------------------------
# 2.3 TradeMe Property — new builds + sections
# ---------------------------------------------------------------------------
TRADEME_URLS = [
    ("https://www.trademe.co.nz/a/property/residential/sale/palmerston-north/new-homes", "new_build"),
    ("https://www.trademe.co.nz/a/property/sections/sale/palmerston-north", "section"),
    ("https://www.trademe.co.nz/a/property/sections/sale/manawatu", "section"),
]

async def scrape_trademe():
    log.info("Scraping TradeMe Property...")
    async with async_playwright() as p:
        browser = await new_browser(p)
        page = await new_page(browser)
        total = 0
        for url, listing_type in TRADEME_URLS:
            try:
                await page.goto(url, wait_until="networkidle", timeout=45000)
                await page.wait_for_timeout(4000)
                soup = BeautifulSoup(await page.content(), "html.parser")
                seen = set()
                count = 0

                # TradeMe listing cards
                cards = soup.select("[class*='listing'], [class*='PropertyCard'], [data-tealium-id]")
                if not cards:
                    cards = soup.find_all(["div", "article", "li"], attrs={"data-listing-id": True})
                if not cards:
                    # Broad fallback
                    for el in soup.find_all(["div", "li"]):
                        if el.find("a", href=re.compile(r"/property/|/a/property/")) and el.find(string=re.compile(r"\$[\d,]+")):
                            cards.append(el)

                for card in cards:
                    link = card.find("a", href=re.compile(r"/property/|/a/property/"))
                    if not link:
                        continue
                    href = link["href"]
                    listing_url = href if href.startswith("http") else f"https://www.trademe.co.nz{href}"
                    if listing_url in seen:
                        continue
                    seen.add(listing_url)

                    text = card.get_text(" ", strip=True)
                    price_m = re.search(r"\$([\d,]+)", text)
                    price_display = price_m.group(0) if price_m else "Price on application"
                    price = parse_price(price_display)

                    suburb = "Palmerston North"
                    for s in MANAWATU_SUBURBS:
                        if s in text.lower():
                            suburb = s.title()
                            break

                    dom_m = re.search(r"(\d+)\s*day", text, re.I)
                    days_listed = int(dom_m.group(1)) if dom_m else None

                    if listing_type == "new_build":
                        upsert_listing({
                            "source": "trademe",
                            "builder": "Unknown",
                            "location": suburb,
                            "price": price,
                            "price_display": price_display,
                            "beds": parse_beds(text),
                            "floor_area_m2": parse_area(text),
                            "listing_url": listing_url,
                            "status": "active",
                        })
                    else:
                        upsert_section({
                            "source": "trademe",
                            "suburb": suburb,
                            "land_area_m2": parse_area(text),
                            "price": price,
                            "price_display": price_display,
                            "listing_url": listing_url,
                            "days_listed": days_listed,
                            "status": "active",
                        })
                    count += 1
                total += count
            except Exception as e:
                log.error("  TradeMe error (%s): %s", url, e)
            await page.wait_for_timeout(2000)
        await browser.close()
    log.info("  TradeMe: %d total listings/sections", total)

# ---------------------------------------------------------------------------
# 2.4 PNCC Building Consents
# ---------------------------------------------------------------------------
PNCC_URL = "https://www.pncc.govt.nz/building-and-resource-consents/building-consents/"

async def scrape_pncc_consents():
    log.info("Scraping PNCC Building Consents...")
    async with async_playwright() as p:
        browser = await new_browser(p)
        page = await new_page(browser)
        try:
            await page.goto(PNCC_URL, wait_until="networkidle", timeout=40000)
            await page.wait_for_timeout(3000)
            content = await page.content()
            soup = BeautifulSoup(content, "html.parser")
            text = soup.get_text(" ", strip=True)

            # Check if the page is machine-readable
            if len(text.strip()) < 200:
                log.warning("  PNCC: page appears empty — manual check required")
                supabase.table("consent_notices").insert({
                    "consent_type": "DATA GAP",
                    "source_url": PNCC_URL,
                    "applicant": "Manual check required — page not machine-readable",
                    "captured_at": datetime.now(timezone.utc).isoformat(),
                }).execute()
                return

            # Look for consent table or list
            rows = soup.select("table tr, .consent-item, [class*='consent'], [class*='application']")
            count = 0
            for row in rows:
                row_text = row.get_text(" ", strip=True)
                # Only residential dwellings
                if not re.search(r"residential|dwelling|house|new home", row_text, re.I):
                    continue
                # Find suburb
                suburb = None
                for s in MANAWATU_SUBURBS:
                    if s in row_text.lower():
                        suburb = s.title()
                        break
                if not suburb:
                    continue
                # Applicant / builder name
                applicant_m = re.search(r"(?:applicant|builder|owner)[:\s]+([A-Z][a-zA-Z\s&]{2,40})", row_text)
                applicant = applicant_m.group(1).strip() if applicant_m else ""
                # Date
                date_m = re.search(r"(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4}|\d{4}-\d{2}-\d{2})", row_text)
                date_filed = date_m.group(1) if date_m else None

                # Competitor check
                is_competitor = False
                competitor_name = None
                for comp in COMPETITOR_BUILDERS:
                    if comp in row_text.lower() or comp in applicant.lower():
                        is_competitor = True
                        competitor_name = comp.title()
                        break

                supabase.table("consent_notices").insert({
                    "address": row_text[:200],
                    "suburb": suburb,
                    "applicant": applicant,
                    "consent_type": "Residential Dwelling",
                    "is_competitor": is_competitor,
                    "competitor_name": competitor_name,
                    "source_url": PNCC_URL,
                    "captured_at": datetime.now(timezone.utc).isoformat(),
                }).execute()
                count += 1

            if count == 0:
                log.warning("  PNCC: no consent records found — manual check recommended")
                supabase.table("consent_notices").insert({
                    "consent_type": "DATA GAP",
                    "source_url": PNCC_URL,
                    "applicant": "No machine-readable consent data found this week",
                    "captured_at": datetime.now(timezone.utc).isoformat(),
                }).execute()
            else:
                log.info("  PNCC: %d consent notices saved", count)
        except Exception as e:
            log.error("  PNCC error: %s", e)
        finally:
            await browser.close()

# ---------------------------------------------------------------------------
# 2.5 Tamakuku Terrace — section-level detail with stage tracking
# ---------------------------------------------------------------------------
async def scrape_tamakuku():
    log.info("Scraping Tamakuku Terrace...")
    url = "https://tamakukuterrace.co.nz/sections/"
    async with async_playwright() as p:
        browser = await new_browser(p)
        page = await new_page(browser)
        try:
            await page.goto(url, wait_until="networkidle", timeout=40000)
            await page.wait_for_timeout(3000)
            soup = BeautifulSoup(await page.content(), "html.parser")

            stage_data: dict[str, dict] = {}
            count = 0

            # Find all section/lot elements
            section_els = soup.select(
                "[class*='section'], [class*='lot'], [class*='stage'], [class*='block'], "
                "[data-lot], [data-stage], [data-section]"
            )
            if not section_els:
                section_els = soup.find_all(["div", "article", "li"], class_=re.compile(r"section|lot|stage|block", re.I))

            seen_lots = set()
            for el in section_els:
                text = el.get_text(" ", strip=True)
                if len(text) < 5:
                    continue

                # Lot / section number
                lot_m = re.search(r"(?:lot|section|block)\s*#?\s*(\d+)", text, re.I)
                lot_num = lot_m.group(1) if lot_m else None

                # Stage
                stage_m = re.search(r"stage\s*(\w+)", text, re.I)
                stage = stage_m.group(1) if stage_m else "1"

                # Status
                status_text = text.lower()
                if any(w in status_text for w in ["sold", "under contract", "settlement"]):
                    status = "sold"
                elif any(w in status_text for w in ["reserved", "hold", "pending"]):
                    status = "reserved"
                else:
                    status = "available"

                # Price
                price_m = re.search(r"\$([\d,]+)", text)
                price_display = price_m.group(0) if price_m else ""
                price = parse_price(price_display)

                # Land area
                area = parse_area(text)

                lot_key = f"{stage}_{lot_num}"
                if lot_num and lot_key not in seen_lots:
                    seen_lots.add(lot_key)
                    # Track in listings table
                    listing_link = el.find("a", href=True)
                    href = listing_link["href"] if listing_link else url
                    listing_url = href if href.startswith("http") else f"https://tamakukuterrace.co.nz{href}"

                    upsert_listing({
                        "source": "tamakuku",
                        "builder": "Tamakuku Terrace",
                        "location": "Whakarongo",
                        "price": price,
                        "price_display": price_display,
                        "land_area_m2": area,
                        "listing_url": listing_url,
                        "notes": f"Lot {lot_num} | Stage {stage} | {status}",
                        "status": "active" if status == "available" else status,
                    })
                    count += 1

                    # Aggregate by stage
                    if stage not in stage_data:
                        stage_data[stage] = {"total": 0, "available": 0, "sold": 0, "reserved": 0, "prices": []}
                    stage_data[stage]["total"] += 1
                    stage_data[stage][status] = stage_data[stage].get(status, 0) + 1
                    if price:
                        stage_data[stage]["prices"].append(price)

            # Save stage summaries
            for stage, d in stage_data.items():
                prices = d["prices"]
                supabase.table("subdivision_stages").insert({
                    "subdivision": "Tamakuku Terrace",
                    "stage": stage,
                    "total_sections": d["total"],
                    "available": d.get("available", 0),
                    "sold": d.get("sold", 0),
                    "reserved": d.get("reserved", 0),
                    "price_from": min(prices) if prices else None,
                    "price_to": max(prices) if prices else None,
                    "captured_at": datetime.now(timezone.utc).isoformat(),
                }).execute()

            log.info("  Tamakuku: %d lots, %d stages tracked", count, len(stage_data))
        except Exception as e:
            log.error("  Tamakuku error: %s", e)
        finally:
            await browser.close()

# ---------------------------------------------------------------------------
# 2.6 Google Reviews — weekly snapshot
# ---------------------------------------------------------------------------
BUILDERS_FOR_REVIEWS = [
    ("Jennian Homes Manawatū", "jennian_manawatu"),
    ("GJ Gardner Palmerston North", "gjgardner_pn"),
    ("Signature Homes Palmerston North", "signature_pn"),
    ("Japac Homes Palmerston North", "japac_pn"),
    ("Latitude Homes Palmerston North", "latitude_pn"),
]

async def scrape_google_reviews():
    log.info("Scraping Google Reviews...")
    async with async_playwright() as p:
        browser = await new_browser(p)
        page = await new_page(browser)
        try:
            for builder_name, builder_key in BUILDERS_FOR_REVIEWS:
                try:
                    search_url = f"https://www.google.com/search?q={builder_name.replace(' ', '+')}"
                    await page.goto(search_url, wait_until="networkidle", timeout=30000)
                    await page.wait_for_timeout(2000)
                    content = await page.content()
                    soup = BeautifulSoup(content, "html.parser")
                    text = soup.get_text(" ", strip=True)

                    # Google shows rating like "4.9 ★ (123 reviews)" in the knowledge panel
                    rating_m = re.search(r"(\d\.\d)\s*(?:★|stars?|out of 5)", text, re.I)
                    if not rating_m:
                        rating_m = re.search(r"Rated\s+(\d\.\d)", text, re.I)
                    review_m = re.search(r"([\d,]+)\s*(?:Google\s+)?reviews?", text, re.I)

                    rating = float(rating_m.group(1)) if rating_m else None
                    review_count = int(review_m.group(1).replace(",", "")) if review_m else None

                    supabase.table("google_reviews").insert({
                        "builder": builder_key,
                        "rating": rating,
                        "review_count": review_count,
                        "captured_at": datetime.now(timezone.utc).isoformat(),
                    }).execute()
                    log.info("  Reviews -- %s: %.1f* (%s reviews)", builder_name, rating or 0, review_count or "?")
                    await page.wait_for_timeout(2000)
                except Exception as e:
                    log.warning("  Google Reviews error (%s): %s", builder_name, e)
        finally:
            await browser.close()

# ===========================================================================
# MARK REMOVED LISTINGS
# ===========================================================================
def mark_removed_listings():
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=48)).isoformat()
    stale = (
        supabase.table("listings")
        .select("id, url, builder, price_display")
        .eq("status", "active")
        .lt("last_seen_at", cutoff)
        .execute()
    )
    for listing in (stale.data or []):
        supabase.table("listings").update({"status": "removed"}).eq("id", listing["id"]).execute()
        supabase.table("listing_changes").insert({
            "listing_id": listing["id"],
            "change_type": "removed",
            "old_value": listing.get("price_display", "Unknown"),
        }).execute()
        log.info("  Marked removed: %s — %s", listing.get("builder"), listing.get("url"))

# ===========================================================================
# MAIN ORCHESTRATOR
# ===========================================================================
async def run_all_scrapers() -> dict:
    """Run all scrapers. Returns dict of {source: count}."""
    global SCRAPE_COUNTS
    SCRAPE_COUNTS = {}

    # Part 1 — Fixed existing scrapers
    await scrape_jennian()
    await scrape_signature()
    await scrape_japac()
    await scrape_gjgardner()
    await scrape_latitude()

    # Part 2 — New data sources
    await scrape_realestate_co_nz()
    await scrape_oneroof()
    await scrape_trademe()
    await scrape_pncc_consents()
    await scrape_tamakuku()
    await scrape_google_reviews()

    mark_removed_listings()
    return SCRAPE_COUNTS

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    counts = asyncio.run(run_all_scrapers())
    print("Scrape complete:", counts)
