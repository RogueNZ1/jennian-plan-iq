import os
import json
from datetime import date, datetime, timedelta, timezone
from dotenv import load_dotenv
from supabase import create_client
import anthropic

load_dotenv(override=True)

supabase = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_KEY"))

def _get_client():
    key = os.getenv("ANTHROPIC_API_KEY")
    if not key:
        raise RuntimeError("ANTHROPIC_API_KEY not set — check .env")
    return anthropic.Anthropic(api_key=key)

SYSTEM_PROMPT = """You are the Jennian 007 market intelligence agent for Jennian Homes Manawatū — New Zealand's top residential builder in the Palmerston North / Manawatū region. You generate a twice-weekly intelligence brief for Haydon Christian, Managing Director.

CONTEXT:
- Competitors: GJ Gardner, Signature Homes, Japac, Latitude Homes.
- Key subdivisions: Awa Park Feilding, Kelvin Grove PN, Fitzherbert PN, Highbury PN, Tamakuku Terrace Whakarongo.
- Jennian's price range: ~$750k–$1.1M H&L packages.
- Jennian is preferred builder at Tamakuku Terrace alongside Japac — monitor Japac activity there closely.
- Data sources: Jennian website, Signature, Japac, GJ Gardner, Latitude, realestate.co.nz, OneRoof, TradeMe, PNCC building consents, Tamakuku Terrace subdivision, Google Reviews.

RULES:
- Only report what the data shows. No fabrication. No estimates presented as facts.
- If data for a section is absent or thin, say "DATA GAP — no data collected this cycle" and move on. Do not pad with speculation.
- Be direct. Haydon reads this early morning. No fluff, no pleasantries.
- Prices: always in NZD. Floor areas: always in m².
- Competitor intel: be specific. Name the builder, address, price, change.
- Sections land: report price per m² where calculable.
- Google reviews: flag any rating drop or negative review theme immediately.
- PNCC consents: flag any competitor consent or unusual consent activity.
- Tamakuku Terrace: flag any Japac lot uptake or new stage release.
- Always end with ONE clear, specific action for Haydon to take today. Make it actionable — a call, a visit, a price check, a listing to respond to.

BRIEF SECTIONS (output in this exact order):
1. PRIORITY ALERTS — anything urgent: competitor price cut >$30k, new competitor H&L under $750k, Japac lot activity at Tamakuku, negative Google review, consent spike.
2. COMPETITOR WATCH — all active competitor listings with price, address, status changes since last brief.
3. NEW SECTIONS — new land sections listed (realestate.co.nz, OneRoof, TradeMe) with price, area, $/m², subdivision.
4. MARKET PULSE — market insights from OneRoof/realestate.co.nz: days on market, median prices, stock levels, demand signals.
5. CONSENT INTEL — PNCC building consents: new consents by builder, value, address. Flag competitor surges.
6. SUBDIVISION WATCH — Tamakuku Terrace stage data: lots available, lots sold, Japac vs Jennian breakdown, new stage activity.
7. REVIEW WATCH — Google Reviews for all 5 builders: current rating, recent reviews, sentiment. Flag changes.
8. TODAY'S ONE ACTION — single specific action Haydon should take today.

OUTPUT: Return a JSON object with exactly these keys:
{
  "html_content": "Full HTML brief with inline styles. Dark theme: bg #0a0c0f, text #e8eaed, accent #E71B23, green #00e5a0, amber #f5a623, card bg #111318, card border #1e2330. Use a clean table-based email layout. Each section gets its own card. Section headers bold in accent red. DATA GAProws in amber italic. Email-safe HTML — no external CSS, no flexbox, no grid.",
  "text_content": "Plain text version for email fallback. Same 8 sections.",
  "summary": "One sentence summary of today's most important finding",
  "alert_count": 0,
  "new_listing_count": 0,
  "price_change_count": 0,
  "new_section_count": 0,
  "consent_count": 0
}
Return ONLY the JSON object. No markdown fences. No preamble. No trailing text."""


def get_todays_data() -> dict:
    cutoff_24h = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    cutoff_7d  = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    cutoff_30d = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()

    new_listings     = supabase.table("listing_changes").select("*, listings(*)").eq("change_type", "new_listing").gte("detected_at", cutoff_24h).execute()
    price_changes    = supabase.table("listing_changes").select("*, listings(*)").in_("change_type", ["price_reduction", "price_increase"]).gte("detected_at", cutoff_7d).execute()
    removed          = supabase.table("listing_changes").select("*, listings(*)").eq("change_type", "removed").gte("detected_at", cutoff_7d).execute()
    active_competitors = supabase.table("listings").select("*").eq("status", "active").neq("source", "jennian").execute()
    active_jennian   = supabase.table("listings").select("*").eq("status", "active").eq("source", "jennian").execute()

    new_sections     = supabase.table("sections").select("*").eq("status", "active").gte("first_seen_at", cutoff_7d).execute()
    all_sections     = supabase.table("sections").select("*").eq("status", "active").execute()
    market_insights  = supabase.table("market_insights").select("*").order("captured_at", desc=True).limit(20).execute()
    consent_notices  = supabase.table("consent_notices").select("*").gte("captured_at", cutoff_7d).execute()
    competitor_consents = supabase.table("consent_notices").select("*").eq("is_competitor", True).gte("captured_at", cutoff_30d).execute()
    subdivision_data = supabase.table("subdivision_stages").select("*").order("captured_at", desc=True).limit(10).execute()
    google_reviews   = supabase.table("google_reviews").select("*").order("captured_at", desc=True).limit(10).execute()

    return {
        "scan_date": date.today().isoformat(),
        "new_listings_24h":       new_listings.data or [],
        "price_changes_7d":       price_changes.data or [],
        "removed_7d":             removed.data or [],
        "active_competitors":     active_competitors.data or [],
        "active_jennian":         active_jennian.data or [],
        "new_sections_7d":        new_sections.data or [],
        "all_active_sections":    all_sections.data or [],
        "market_insights":        market_insights.data or [],
        "consent_notices_7d":     consent_notices.data or [],
        "competitor_consents_30d": competitor_consents.data or [],
        "subdivision_data":       subdivision_data.data or [],
        "google_reviews":         google_reviews.data or [],
    }


def _slim(records: list, keys: list) -> list:
    """Trim record dicts to only the fields the brief needs."""
    return [{k: r.get(k) for k in keys if r.get(k) is not None} for r in (records or [])]


def generate_brief(data: dict) -> dict:
    listing_keys = ["source", "builder", "location", "price", "price_display", "title", "url", "bedrooms", "floor_area", "land_area", "status"]
    change_keys  = ["change_type", "detected_at", "old_value", "new_value", "listing_id"]
    section_keys = ["source", "suburb", "address", "price", "price_display", "land_area_m2", "listing_url", "first_seen_at"]
    consent_keys = ["builder", "address", "consent_type", "value", "is_competitor", "captured_at"]
    review_keys  = ["builder_name", "rating", "review_count", "captured_at"]
    subdiv_keys  = ["stage_name", "total_lots", "lots_available", "lots_sold", "captured_at"]
    insight_keys = ["source", "suburb", "metric_name", "metric_value", "captured_at"]

    user_message = f"""Today's date: {data['scan_date']}

=== LISTINGS DATA ===
New listings (last 24h): {json.dumps(_slim(data['new_listings_24h'], change_keys), default=str)}
Price changes (last 7d): {json.dumps(_slim(data['price_changes_7d'], change_keys), default=str)}
Listings removed/sold (last 7d): {json.dumps(_slim(data['removed_7d'], change_keys), default=str)}
Active competitor listings ({len(data['active_competitors'])} total): {json.dumps(_slim(data['active_competitors'], listing_keys), default=str)}
Jennian active listings: {json.dumps(_slim(data['active_jennian'], listing_keys), default=str)}

=== SECTIONS (LAND) ===
New sections this week: {json.dumps(_slim(data['new_sections_7d'], section_keys), default=str)}
All active sections: {json.dumps(_slim(data['all_active_sections'], section_keys), default=str)}

=== MARKET INSIGHTS ===
{json.dumps(_slim(data['market_insights'], insight_keys), default=str)}

=== PNCC CONSENTS ===
New consents (last 7d): {json.dumps(_slim(data['consent_notices_7d'], consent_keys), default=str)}
Competitor consents (last 30d): {json.dumps(_slim(data['competitor_consents_30d'], consent_keys), default=str)}

=== SUBDIVISION (TAMAKUKU TERRACE) ===
{json.dumps(_slim(data['subdivision_data'], subdiv_keys), default=str)}

=== GOOGLE REVIEWS ===
{json.dumps(_slim(data['google_reviews'], review_keys), default=str)}

Generate the 8-section brief. Report only what the data shows. Where data is absent, write DATA GAP."""

    response = _get_client().messages.create(
        model="claude-opus-4-7",
        max_tokens=16000,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_message}]
    )
    raw = response.content[0].text.strip()
    if raw.startswith("```"):
        raw = raw.split("```", 2)[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.rsplit("```", 1)[0]
    return json.loads(raw.strip())


def save_brief(brief: dict):
    today = date.today().isoformat()
    supabase.table("daily_briefs").upsert({
        "brief_date": today,
        "html_content": brief["html_content"],
        "text_content": brief["text_content"],
        "summary": brief["summary"],
        "alert_count": brief.get("alert_count", 0),
        "new_listing_count": brief.get("new_listing_count", 0),
        "price_change_count": brief.get("price_change_count", 0),
        "generated_at": datetime.now(timezone.utc).isoformat()
    }, on_conflict="brief_date").execute()
    print(f"  Brief saved for {today}.")


def send_email(brief: dict):
    resend_key = os.getenv("RESEND_API_KEY")
    if not resend_key:
        print("  No RESEND_API_KEY — skipping email.")
        return
    import httpx
    today = date.today().strftime("%a %d %b")
    alerts = brief.get("alert_count", 0)
    subject = f"Jennian 007 — {today}" + (f" 🚨 {alerts} alert{'s' if alerts != 1 else ''}" if alerts else "")
    response = httpx.post(
        "https://api.resend.com/emails",
        headers={"Authorization": f"Bearer {resend_key}", "Content-Type": "application/json"},
        json={
            # Fix — was "intel@jennian.co.nz". jennian.co.nz is national-office
            # DNS (Haydon doesn't control it / it's not verified at Resend).
            # jennianiq.nz IS verified (same domain the IQ invite system sends
            # branded email from) — use it here too so the send isn't rejected.
            "from": "007 Intel <intel@jennianiq.nz>",
            "to": "haydon.christian@jennian.co.nz",
            "subject": subject,
            "html": brief["html_content"],
            "text": brief["text_content"]
        }
    )
    # Fix — httpx.post() does NOT raise on HTTP error status codes (only on
    # connection failures). A Resend rejection — unverified domain, bad key,
    # malformed payload — was previously just printed and silently ignored,
    # so the run looked like a success even when no email was ever sent.
    if response.status_code >= 400:
        raise RuntimeError(
            f"Resend rejected the email ({response.status_code}): {response.text[:300]}"
        )
    print(f"  Email sent: {response.status_code}")


if __name__ == "__main__":
    print("Pulling today's data...")
    data = get_todays_data()
    print(
        f"  {len(data['new_listings_24h'])} new listings | "
        f"{len(data['price_changes_7d'])} price changes | "
        f"{len(data['active_competitors'])} active competitor listings | "
        f"{len(data['new_sections_7d'])} new sections | "
        f"{len(data['consent_notices_7d'])} consents | "
        f"{len(data['google_reviews'])} reviews"
    )
    print("Generating brief...")
    brief = generate_brief(data)
    save_brief(brief)
    send_email(brief)
    print("Done.")
